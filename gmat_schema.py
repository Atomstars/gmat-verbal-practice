"""
gmat_schema.py — Pydantic schema for GMAT question records.

Both parser.py and parse_quant.py call validate_records() before writing JSON.
Any record that violates the schema causes the run to exit with a non-zero code
rather than silently shipping malformed data.
"""

from __future__ import annotations

import sys
from typing import Any, Literal

from pydantic import BaseModel, field_validator, model_validator

# Bump this whenever the shape of a shipped record changes so the app and any
# future migration can detect drift (B6).
SCHEMA_VERSION = 1


class OptionRecord(BaseModel):
    label: str
    text: str

    @field_validator("label")
    @classmethod
    def label_must_be_letter(cls, v: str) -> str:
        if v not in "ABCDEFGHIJ":
            raise ValueError(f"option label must be A-J, got {v!r}")
        return v


class QuestionRecord(BaseModel):
    # --- Required by all backends ---
    id: str
    type: Literal["CR", "RC", "PS", "DS"]
    chapter: str | None
    title: str | None
    question: str
    passage: str | None
    options: list[OptionRecord]
    correct_answer: Literal["A", "B", "C", "D", "E"] | None
    explanation: str | None
    format: Literal["multiple_choice"]

    # --- OG-specific (allowed to be absent) ---
    difficulty: Literal["Easy", "Medium", "Hard"] | None = None
    number: int | None = None
    source: str | None = None
    subtype: str | None = None
    category: str | None = None

    # --- Quant-specific (allowed to be absent) ---
    needs_review: bool | None = None
    source_page: int | None = None
    diagram: str | None = None

    # --- Embedding (may or may not be present; not validated for values) ---
    embedding: list[float] | None = None

    # --- Schema version stamped at write time ---
    schema_version: int = SCHEMA_VERSION

    # --- Subtype suggestion fields (B5; optional) ---
    subtype_suggested: str | None = None
    subtype_confidence: float | None = None

    model_config = {"extra": "allow"}  # tolerate unknown fields from future schema bumps

    @model_validator(mode="after")
    def rc_requires_passage(self) -> QuestionRecord:
        if self.type == "RC" and not self.passage:
            raise ValueError(f"RC question {self.id!r} must have a passage")
        return self

    @model_validator(mode="after")
    def options_must_be_nonempty(self) -> QuestionRecord:
        if not self.options:
            raise ValueError(f"question {self.id!r} has no options")
        return self


def validate_records(records: list[dict[str, Any]], source: str = "") -> list[dict[str, Any]]:
    """
    Validate every record against QuestionRecord.  Prints a summary and exits
    non-zero on the first schema violation so the run never silently ships bad data.

    Also stamps schema_version on each record before returning so callers can
    pass the same list directly to json.dump().
    """
    errors: list[str] = []
    out: list[dict[str, Any]] = []

    for rec in records:
        rec.setdefault("schema_version", SCHEMA_VERSION)
        try:
            QuestionRecord.model_validate(rec)
            out.append(rec)
        except Exception as exc:
            rid = rec.get("id", "<no id>")
            errors.append(f"  [{rid}] {exc}")

    tag = f" ({source})" if source else ""
    if errors:
        print(
            f"\nSCHEMA VALIDATION FAILED{tag} — {len(errors)} record(s) invalid:", file=sys.stderr
        )
        for e in errors:
            print(e, file=sys.stderr)
        sys.exit(1)

    print(f"Schema validation passed{tag}: {len(out)} records OK (schema_version={SCHEMA_VERSION})")
    return out
