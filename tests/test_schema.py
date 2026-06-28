"""
Tests for the pydantic schema in gmat_schema.py (T4).

validate_records() must:
  - Pass valid records through unchanged (plus schema_version stamp)
  - Call sys.exit(1) on invalid records
  - Enforce RC requires passage
  - Enforce options non-empty
  - Enforce correct_answer is A-E or None
"""

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from gmat_schema import SCHEMA_VERSION, validate_records


def _valid_cr() -> dict:
    return {
        "id": "cr-ch16-q1",
        "type": "CR",
        "chapter": "Chapter 16",
        "title": "Finance",
        "question": "Which of the following most weakens the argument?",
        "passage": None,
        "options": [
            {"label": "A", "text": "Option A"},
            {"label": "B", "text": "Option B"},
            {"label": "C", "text": "Option C"},
            {"label": "D", "text": "Option D"},
            {"label": "E", "text": "Option E"},
        ],
        "correct_answer": "C",
        "explanation": "C is correct because...",
        "format": "multiple_choice",
    }


def _valid_rc() -> dict:
    return {
        "id": "rc-ch11-q1",
        "type": "RC",
        "chapter": "Chapter 11",
        "title": None,
        "question": "The primary purpose of this passage is to?",
        "passage": "This is a passage about ecology and ecosystems.",
        "options": [
            {"label": "A", "text": "Option A"},
            {"label": "B", "text": "Option B"},
            {"label": "C", "text": "Option C"},
            {"label": "D", "text": "Option D"},
            {"label": "E", "text": "Option E"},
        ],
        "correct_answer": "B",
        "explanation": None,
        "format": "multiple_choice",
    }


def _valid_ds() -> dict:
    return {
        "id": "ds-numbers-q251",
        "type": "DS",
        "chapter": "Numbers",
        "title": None,
        "question": "Is x > 0?",
        "passage": None,
        "options": [
            {
                "label": "A",
                "text": "Statement (1) ALONE is sufficient, but statement (2) alone is not sufficient.",
            },
            {
                "label": "B",
                "text": "Statement (2) ALONE is sufficient, but statement (1) alone is not sufficient.",
            },
            {
                "label": "C",
                "text": "BOTH statements TOGETHER are sufficient, but NEITHER statement ALONE is sufficient.",
            },
            {"label": "D", "text": "EACH statement ALONE is sufficient."},
            {"label": "E", "text": "Statements (1) and (2) TOGETHER are not sufficient."},
        ],
        "correct_answer": "A",
        "explanation": "Sufficient.",
        "format": "multiple_choice",
        "needs_review": False,
        "source": "Manhattan Review",
        "number": 251,
        "source_page": 91,
        "diagram": None,
    }


class TestValidateRecords:
    def test_valid_cr_passes(self):
        result = validate_records([_valid_cr()], source="test")
        assert len(result) == 1

    def test_valid_rc_passes(self):
        result = validate_records([_valid_rc()], source="test")
        assert len(result) == 1

    def test_valid_ds_passes(self):
        result = validate_records([_valid_ds()], source="test")
        assert len(result) == 1

    def test_stamps_schema_version(self):
        rec = _valid_cr()
        result = validate_records([rec], source="test")
        assert result[0]["schema_version"] == SCHEMA_VERSION

    def test_invalid_type_exits(self):
        rec = _valid_cr()
        rec["type"] = "SC"  # SC is not shipped
        with pytest.raises(SystemExit):
            validate_records([rec], source="test")

    def test_missing_id_exits(self):
        rec = _valid_cr()
        del rec["id"]
        with pytest.raises(SystemExit):
            validate_records([rec], source="test")

    def test_rc_without_passage_exits(self):
        rec = _valid_rc()
        rec["passage"] = None
        with pytest.raises(SystemExit):
            validate_records([rec], source="test")

    def test_bad_correct_answer_exits(self):
        rec = _valid_cr()
        rec["correct_answer"] = "Z"
        with pytest.raises(SystemExit):
            validate_records([rec], source="test")

    def test_empty_options_exits(self):
        rec = _valid_cr()
        rec["options"] = []
        with pytest.raises(SystemExit):
            validate_records([rec], source="test")

    def test_null_correct_answer_allowed(self):
        rec = _valid_cr()
        rec["correct_answer"] = None
        result = validate_records([rec], source="test")
        assert len(result) == 1

    def test_og_extra_fields_allowed(self):
        rec = _valid_rc()
        rec.update({"difficulty": "Hard", "number": 456, "source": "OG", "subtype": "Main Idea"})
        result = validate_records([rec], source="test")
        assert len(result) == 1
