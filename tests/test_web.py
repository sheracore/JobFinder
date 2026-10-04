import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from jobfinder import coverletter  # noqa: E402
from jobfinder.config import CoverLetterConfig  # noqa: E402
from jobfinder.models import html_to_text  # noqa: E402
from jobfinder.pipeline import collect, rank  # noqa: E402
from jobfinder.sources import REGISTRY  # noqa: E402
from jobfinder.storage import Store  # noqa: E402
from jobfinder.web.app import create_app  # noqa: E402

from .conftest import ROOT  # noqa: E402


@pytest.fixture
def app_client(config, client, tmp_path, monkeypatch):
    db = tmp_path / "jobs.db"
    cfg_path = tmp_path / "config.yaml"
    cfg_path.write_text(
        (ROOT / "config.yaml").read_text(encoding="utf-8")
        .replace("database: data/jobs.db", f"database: {db}")
        .replace("resume: resume/resume.html", f"resume: {ROOT / 'resume' / 'resume.html'}")
        .replace("use_claude: true", "use_claude: false"),
        encoding="utf-8",
    )
    jobs = rank(config, collect(config, client, [n for n in REGISTRY if config.source_enabled(n)]))
    store = Store(db)
    store.upsert(jobs)
    store.close()
    return TestClient(create_app(str(cfg_path))), jobs


def test_list_and_detail(app_client):
    http, jobs = app_client
    data = http.get("/api/jobs").json()
    assert len(data["jobs"]) == len(jobs)
    first = data["jobs"][0]
    assert "description" not in first and first["visa_label"] and first["country_name"]
    assert first["company_domain"] == "" or "." in first["company_domain"]

    detail = http.get(f"/api/jobs/{first['id']}").json()
    assert detail["description"] and detail["letters"] == []
    assert http.get("/api/jobs/nope").status_code == 404


def test_status_and_cover_letter(app_client):
    http, jobs = app_client
    job_id = jobs[0].id
    assert http.post(f"/api/jobs/{job_id}/status", json={"status": "saved"}).status_code == 200
    assert http.post(f"/api/jobs/{job_id}/status", json={"status": "bogus"}).status_code == 400
    assert http.get(f"/api/jobs/{job_id}").json()["status"] == "saved"

    letter = http.post(f"/api/jobs/{job_id}/cover-letter", json={"notes": ""}).json()
    assert letter["generator"] == "template"
    assert letter["text"].startswith(f"Dear {jobs[0].company} team,")
    assert "Mohammad Ghaffary" in letter["text"]
    assert len(http.get(f"/api/jobs/{job_id}").json()["letters"]) == 1


def test_index_served(app_client):
    http, _ = app_client
    page = http.get("/")
    assert page.status_code == 200 and "JobFinder" in page.text
    assert http.get("/static/app.js").status_code == 200


def test_template_letter_uses_only_resume_bullets():
    settings = CoverLetterConfig(resume=str(ROOT / "resume" / "resume.html"))
    job = {"company": "Acme", "title": "Senior Python Engineer", "visa_status": "unknown",
           "description": "Python, Django, Kafka and PostgreSQL performance work on a payments platform."}
    letter = coverletter.generate_template(job, settings)
    bullets = [b for _, b in coverletter.resume_bullets(settings.resume)]
    examples = [line[2:] for line in letter.text.splitlines() if line.startswith("- At ")]
    assert len(examples) == 3
    for line in examples:
        assert any(b.rstrip(".")[1:] in line for b in bullets)
    assert "would need visa sponsorship" in letter.text


def test_claude_prompt_contains_resume_and_job():
    settings = CoverLetterConfig(resume=str(ROOT / "resume" / "resume.html"))
    resume = coverletter.load_resume(settings.resume)
    assert "Nobitex" in resume and "<li>" not in resume and "font-size" not in resume
    prompt = coverletter.build_user_prompt({"company": "Acme", "title": "Engineer", "description": "Build APIs.",
                                            "visa_status": "sponsored"}, resume, settings, "Available in January.")
    assert "Available in January." in prompt and "offers visa sponsorship" in prompt and "Build APIs." in prompt


def test_html_to_text_keeps_structure():
    text = html_to_text("<p>Intro <b>bold</b>.</p><ul><li>One</li><li>Two</li></ul><p>End</p>")
    assert text == "Intro bold.\n\n• One\n• Two\n\nEnd"
