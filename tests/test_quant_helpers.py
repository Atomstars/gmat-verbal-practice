"""
Regression tests for parse_quant.py helper functions.

Source PDF is not in the repo; these tests exercise text-processing and
LaTeX-reconstruction functions with synthetic span data.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import parse_quant as q

# ---------------------------------------------------------------------------
# _slug()
# ---------------------------------------------------------------------------


class TestSlug:
    def test_lowercase(self):
        assert q._slug("Number Properties") == "number-properties"

    def test_special_chars_become_dashes(self):
        assert q._slug("Co-ordinate geometry") == "co-ordinate-geometry"

    def test_leading_trailing_stripped(self):
        assert q._slug("  hello  ") == "hello"

    def test_multiple_separators_collapsed(self):
        assert q._slug("A & B") == "a-b"


# ---------------------------------------------------------------------------
# _clean()
# ---------------------------------------------------------------------------


class TestQuantClean:
    def test_removes_fraction_control_chars(self):
        assert q._clean("a\x12b\x13c") == "abc"

    def test_collapses_whitespace(self):
        assert q._clean("a   b") == "a b"

    def test_strips(self):
        assert q._clean("  hi  ") == "hi"

    def test_preserves_math_chars(self):
        assert q._clean("x^2 + y^2") == "x^2 + y^2"


# ---------------------------------------------------------------------------
# _build_simple() — superscript LaTeX reconstruction
# ---------------------------------------------------------------------------


def _make_span(text, size=9.5, x=0.0, y=100.0):
    """Factory for a minimal fitz span dict."""
    return {"text": text, "size": size, "origin": (x, y)}


class TestBuildSimple:
    def test_plain_text_no_math(self):
        spans = [_make_span("hello world")]
        plain, latex = q._build_simple(spans, [])
        assert plain == "hello world"
        assert latex == "hello world"  # no math -> no $ wrapping

    def test_superscript_wrapping(self):
        base = _make_span("x", x=0)
        sup = _make_span("2", size=7.0, x=5, y=100.0)
        plain, latex = q._build_simple([base], [sup])
        assert "^2" in plain
        assert "^{2}" in latex
        assert latex.startswith("$") and latex.endswith("$")

    def test_sqrt_char(self):
        s = _make_span("√16", x=0)
        plain, latex = q._build_simple([s], [])
        assert "sqrt" in plain or "\\sqrt" in latex
        assert "\\sqrt{" in latex


# ---------------------------------------------------------------------------
# DS_CHOICES — hardcoded standard answers
# ---------------------------------------------------------------------------


class TestDsChoices:
    def test_five_choices(self):
        assert len(q.DS_CHOICES) == 5

    def test_labels_a_to_e(self):
        labels = [c["label"] for c in q.DS_CHOICES]
        assert labels == ["A", "B", "C", "D", "E"]

    def test_choice_a_text(self):
        assert "Statement (1) ALONE" in q.DS_CHOICES[0]["text"]

    def test_choice_e_text(self):
        assert "not sufficient" in q.DS_CHOICES[4]["text"]


# ---------------------------------------------------------------------------
# _SOL_QNUM_RE — negative lookahead guards section headings
# ---------------------------------------------------------------------------


class TestSolQnumRe:
    def test_matches_question_number(self):
        assert q._SOL_QNUM_RE.match("1.Some text") is not None
        assert q._SOL_QNUM_RE.match("42.Here") is not None

    def test_rejects_section_heading(self):
        assert q._SOL_QNUM_RE.match("5.1 Section heading") is None
        assert q._SOL_QNUM_RE.match("3.2") is None
