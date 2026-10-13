"""Request bodies for orders, disputes, reviews, and moderation (no database)."""

import pytest
from pydantic import ValidationError

from app.schemas.admin import DisputeDecision, ReportUpdate, RestrictionUpdate
from app.schemas.orders import DisputeCreate, DisputeNote, HandoverCode, ReviewCreate


def test_optional_text_accepts_null_and_strips():
    # Regression: an explicit null used to crash with a 500 (constraint on str | None).
    assert ReviewCreate(rating=5, comment=None).comment is None
    assert ReviewCreate(rating=5, comment="  ok  ").comment == "ok"
    assert DisputeCreate(reason="incomplete", details=None).details is None
    assert DisputeNote(note=None).note is None
    assert RestrictionUpdate(restricted=True, note=None).note is None
    assert ReportUpdate(status="dismissed", note=None).note is None


def test_limits_and_unknown_fields():
    with pytest.raises(ValidationError):
        ReviewCreate(rating=5, comment="x" * 1001)
    with pytest.raises(ValidationError):
        ReviewCreate(rating=0)
    with pytest.raises(ValidationError):
        RestrictionUpdate(restricted=True, note="x" * 501)
    with pytest.raises(ValidationError):
        DisputeDecision(outcome="refund_buyer", note="   ")  # a note is required
    with pytest.raises(ValidationError):
        HandoverCode(code="12345a")
    with pytest.raises(ValidationError):
        DisputeNote(note="x", amount_centavos=1)  # bodies never carry amounts
