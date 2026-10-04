import pytest

from jobfinder.visa import detect


@pytest.mark.parametrize("text", [
    "We offer visa sponsorship for this role.",
    "Visa sponsorship available.",
    "We will sponsor your work visa.",
    "Eligible for the EU Blue Card.",
    "We are a recognised sponsor with the IND (Kennismigrant).",
    "Berlin | ONSITE | VISA",
    "Our team will help you with your visa and work permit.",
])
def test_sponsorship_detected(text):
    assert detect(text).status == "sponsored"


@pytest.mark.parametrize("text", [
    "Unfortunately we are unable to offer visa sponsorship.",
    "We cannot sponsor visas for this position.",
    "We do not provide visa sponsorship.",
    "You must already have the right to work in the Netherlands.",
    "Candidates must be able to work without visa sponsorship.",
    "Visa sponsorship is not available for this role.",
    "EU citizens only.",
    "No sponsorship.",
])
def test_refusal_detected(text):
    assert detect(text).status == "not_offered"


def test_relocation_only():
    assert detect("Generous relocation package and German lessons.").status == "relocation"


def test_unknown():
    assert detect("Python, Django and PostgreSQL in a friendly team.").status == "unknown"


def test_offer_wins_over_partial_restriction():
    text = "We sponsor visas for relocation to Berlin. Remote candidates must have the right to work in Germany."
    assert detect(text).status == "sponsored"


def test_evidence_snippets():
    signals = detect("Lots of text. We offer visa sponsorship. More text.")
    assert any("visa sponsorship" in e for e in signals.evidence)
