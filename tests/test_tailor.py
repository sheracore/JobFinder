import json

import pytest

from jobfinder import ai, coverletter, tailor
from jobfinder.config import WritingConfig
from jobfinder.models import html_to_text

from .conftest import ROOT

RESUME = ROOT / "resume" / "resume.html"
JOB = {"company": "Acme", "title": "Senior Python Engineer", "location": "Berlin",
       "description": "Payments platform. Python, Kafka, PostgreSQL performance and Kubernetes."}


@pytest.fixture
def doc():
    return tailor.load(RESUME)


def _fake_ai(monkeypatch, payload):
    result = ai.AIResult(text=json.dumps(payload), model="gemini:test-model")
    monkeypatch.setattr(ai, "generate_text", lambda *args, **kwargs: result)


def test_parse_and_render_round_trip(doc):
    assert [j.company for j in doc.jobs] == ["QueueLess", "Nobitex", "Learnwise", "Farafan"]
    assert "**~3 hours to ~5 minutes**" in doc.jobs[1].bullets[0]
    assert doc.skills[0][0] == "Backend" and "PostgreSQL (query tuning, indexing, locking)" in doc.skills[2][1]
    page = tailor.render(doc, doc.summary, doc.skills, doc.jobs, "Acme")
    strip = lambda h: " ".join(html_to_text(h.split("</title>", 1)[1]).split())  # noqa: E731
    assert strip(page) == strip(doc.source_html)
    assert "<title>Mohammad Ghaffary – Resume – Acme</title>" in page


def test_ai_answer_is_checked_against_the_resume(doc, monkeypatch):
    nobitex = doc.jobs[1].bullets
    payload = {
        "summary": "Senior Backend Engineer with 8 years of experience building Python payment systems.",
        "skills": [{"label": "Data", "items": ["PostgreSQL (query tuning, indexing, locking)", "Redis", "Snowflake"]}],
        "jobs": [
            {"company": "QueueLess", "bullets": list(reversed(doc.jobs[0].bullets))},
            # Invented metric: must be rejected and the original bullets kept.
            {"company": "Nobitex", "bullets": ["Cut latency by **73%** on the trading engine.", nobitex[0]]},
            # New technology not in the resume: rejected.
            {"company": "Learnwise", "bullets": ["Migrated services to AWS Lambda.", doc.jobs[2].bullets[0]]},
            {"company": "Farafan", "bullets": doc.jobs[3].bullets[:2]},
        ],
        "changes": ["Put Kafka work first."],
    }
    _fake_ai(monkeypatch, payload)
    result = tailor.tailor(JOB, WritingConfig(resume=str(RESUME)))
    page = html_to_text(result.html)

    assert result.generator == "gemini:test-model" and result.changes == ["Put Kafka work first."]
    assert "73%" not in page and "AWS" not in page and "Snowflake" not in page
    assert "Nobitex: kept your original bullets" in result.notice and "Learnwise" in result.notice
    assert page.index("Built the core Queue Service") < page.index("Designed a microservices")  # reordered
    assert "Integrated Samba" not in page  # Farafan trimmed to two bullets
    assert "building Python payment systems" in page  # summary accepted
    assert "Backend" in page and "DevOps" in page  # skill rows never lost


def test_wrong_number_of_bullets_keeps_original(doc, monkeypatch):
    payload = {"summary": "", "skills": [], "changes": [],
               "jobs": [{"company": j.company, "bullets": j.bullets + ["Extra bullet."]} for j in doc.jobs]}
    _fake_ai(monkeypatch, payload)
    result = tailor.tailor(JOB, WritingConfig(resume=str(RESUME)))
    assert "Extra bullet" not in result.html and result.notice.count("kept your original bullets") == 4


def test_template_when_ai_unavailable(doc):
    result = tailor.tailor(JOB, WritingConfig(resume=str(RESUME), use_ai=False))
    assert result.generator == "template" and "turned off" in result.notice
    page = html_to_text(result.html)
    for job in doc.jobs:  # nothing removed
        for bullet in job.bullets:
            assert html_to_text(tailor._to_html(bullet)) in page


def test_cover_letter_uses_ai_provider(monkeypatch):
    monkeypatch.setattr(ai, "generate_text", lambda *a, **k: ai.AIResult("Dear Acme team,\n...", "gemini:x"))
    letter = coverletter.generate(JOB, WritingConfig(resume=str(RESUME)))
    assert letter.generator == "gemini:x" and letter.text.startswith("Dear Acme team")


def test_no_gemini_key_falls_back(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    letter = coverletter.generate(JOB, WritingConfig(resume=str(RESUME)))
    assert letter.generator == "template" and "GEMINI_API_KEY" in letter.notice


def test_old_cover_letter_section_still_loads(tmp_path):
    from jobfinder.config import load_config

    path = tmp_path / "config.yaml"
    path.write_text("cover_letter:\n  use_claude: false\n  model: claude-opus-5-5\n")
    writing = load_config(path).writing
    assert writing.use_ai is False and writing.model == "claude-opus-5-5"
