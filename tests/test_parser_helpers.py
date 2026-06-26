"""
Regression tests for parser.py helper functions.

Source PDFs are not in the repo, so these tests exercise the text-processing
functions directly with representative inputs, verifying that refactors do not
silently change behaviour.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import parser as p

# ---------------------------------------------------------------------------
# clean() / norm() / clean_paras()
# ---------------------------------------------------------------------------


class TestClean:
    def test_smart_quotes_replaced(self):
        assert p.clean("“Hello”") == '"Hello"'

    def test_em_dash_replaced(self):
        assert p.clean("A—B") == "A-B"

    def test_ellipsis_replaced(self):
        assert p.clean("wait…") == "wait..."

    def test_ligature_fi(self):
        assert p.clean("ﬁrst") == "first"

    def test_ligature_fl(self):
        assert p.clean("ﬂoor") == "floor"

    def test_collapses_whitespace(self):
        assert p.clean("too   many   spaces") == "too many spaces"

    def test_strips_leading_trailing(self):
        assert p.clean("  hello  ") == "hello"

    def test_empty_string(self):
        assert p.clean("") == ""

    def test_none_returns_empty(self):
        assert p.clean(None) == ""  # type: ignore[arg-type]


class TestNorm:
    def test_lowercases(self):
        assert p.norm("Hello World") == "hello world"

    def test_strips_punctuation(self):
        # norm() removes non-word/non-space chars without inserting spaces
        assert p.norm("a.b,c!") == "abc"

    def test_collapses_whitespace(self):
        assert p.norm("a   b") == "a b"

    def test_none(self):
        assert p.norm(None) == ""  # type: ignore[arg-type]


class TestCleanParas:
    def test_joins_with_double_newline(self):
        result = p.clean_paras(["para one", "para two"])
        assert result == "para one\n\npara two"

    def test_drops_empty_paragraphs(self):
        result = p.clean_paras(["para one", "", "  ", "para three"])
        assert result == "para one\n\npara three"

    def test_applies_clean_to_each(self):
        result = p.clean_paras(["—dash here"])
        assert result == "-dash here"


# ---------------------------------------------------------------------------
# Answer inference
# ---------------------------------------------------------------------------


class TestCrAnswerFromText:
    def test_simple(self):
        assert p.cr_answer_from_text("The correct answer is (C).") == "C"

    def test_case_insensitive(self):
        assert p.cr_answer_from_text("The CORRECT answer is (B)") == "B"

    def test_best_answer(self):
        assert p.cr_answer_from_text("The best answer is (A).") == "A"

    def test_no_parens_variant(self):
        assert p.cr_answer_from_text("correct answer is D.") == "D"

    def test_ambiguous_returns_none(self):
        # Two different letters -> conflict -> None
        assert p.cr_answer_from_text("correct answer is (A). correct answer is (B).") is None

    def test_no_match_returns_none(self):
        assert p.cr_answer_from_text("Nothing here.") is None


class TestCrAnswerByTitle:
    def test_finds_by_title(self):
        solutions = "Finance: The correct answer is (D). Other stuff."
        assert p.cr_answer_by_title("Finance", solutions) == "D"

    def test_no_title_returns_none(self):
        assert p.cr_answer_by_title(None, "correct answer is (A)") is None

    def test_title_not_found_returns_none(self):
        assert p.cr_answer_by_title("Missing", "correct answer is (A)") is None


# ---------------------------------------------------------------------------
# pdf_split_problems()
# ---------------------------------------------------------------------------


class TestPdfSplitProblems:
    def _make_lines(self, *blocks):
        """Build a line list from (stem, options...) tuples."""
        lines = []
        for block in blocks:
            lines.append(block[0])
            for opt in block[1:]:
                lines.append(opt)
        return lines

    def test_splits_two_problems(self):
        lines = [
            "1. What is the argument?",
            "(A) Option one",
            "(B) Option two",
            "(C) Option three",
            "(D) Option four",
            "(E) Option five",
            "2. Next question here.",
            "(A) Alpha",
            "(B) Beta",
            "(C) Gamma",
            "(D) Delta",
            "(E) Epsilon",
        ]
        problems = p.pdf_split_problems(lines)
        assert len(problems) == 2
        assert "1. What is the argument?" in problems[0][0]
        assert "2. Next question here." in problems[1][0]

    def test_ignores_directions_list(self):
        # A numbered list without (A) options should not be treated as questions.
        lines = [
            "1. First direction.",
            "2. Second direction.",
            "3. Third direction.",
            "10. Actual question",
            "(A) Real option",
            "(B) Another",
            "(C) Third",
            "(D) Fourth",
            "(E) Fifth",
        ]
        problems = p.pdf_split_problems(lines)
        assert len(problems) == 1
        assert "10. Actual question" in problems[0][0]


# ---------------------------------------------------------------------------
# pdf_parse_problem()
# ---------------------------------------------------------------------------


class TestPdfParseProblem:
    def _block(self, *lines):
        return list(lines)

    def test_cr_extracts_title(self):
        block = self._block(
            "1. Short CR Title",
            "The actual stem of the question here goes on?",
            "(A) First option",
            "(B) Second option",
            "(C) Third option",
            "(D) Fourth option",
            "(E) Fifth option",
        )
        title, question, opts = p.pdf_parse_problem(block, "CR")
        assert title == "Short CR Title"
        assert "actual stem" in question
        assert set(opts.keys()) == set("ABCDE")

    def test_rc_no_title(self):
        block = self._block(
            "1. The passage is primarily concerned with?",
            "(A) First",
            "(B) Second",
            "(C) Third",
            "(D) Fourth",
            "(E) Fifth",
        )
        title, question, opts = p.pdf_parse_problem(block, "RC")
        assert title is None
        assert "primarily concerned" in question

    def test_passage_header_stops_options(self):
        block = self._block(
            "1. Some question?",
            "(A) Opt A",
            "(B) Opt B",
            "(C) Opt C",
            "(D) Opt D",
            "(E) Opt E",
            "Passage X: New passage begins here",
            "extra text that must not bleed",
        )
        title, question, opts = p.pdf_parse_problem(block, "RC")
        assert "New passage" not in question
        assert "New passage" not in " ".join(opts.values())


# ---------------------------------------------------------------------------
# pdf_ordered_correct_letters()
# ---------------------------------------------------------------------------


class TestPdfOrderedCorrectLetters:
    def test_extracts_in_order(self):
        text = """
            (A) Wrong answer.
            (B) Wrong.
            (C) This is right. CORRECT.
            (A) Wrong.
            (D) This is right too. CORRECT.
        """
        letters = p.pdf_ordered_correct_letters(text)
        assert letters == ["C", "D"]

    def test_no_correct_markers(self):
        assert p.pdf_ordered_correct_letters("No markers here.") == []


# ---------------------------------------------------------------------------
# unit_for_chapter()
# ---------------------------------------------------------------------------


class TestUnitForChapter:
    def test_sc_range(self):
        for ch in range(2, 10):
            assert p.unit_for_chapter(ch) == "SC"

    def test_rc_range(self):
        for ch in range(11, 16):
            assert p.unit_for_chapter(ch) == "RC"

    def test_cr_range(self):
        for ch in range(16, 23):
            assert p.unit_for_chapter(ch) == "CR"
