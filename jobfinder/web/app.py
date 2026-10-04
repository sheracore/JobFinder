"""Local web app: browse matched jobs, read descriptions, track applications and write cover letters.

Run with `jobfinder web`; it listens on 127.0.0.1 only by default.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .. import coverletter
from ..config import load_config
from ..location import COUNTRY_NAMES
from ..pipeline import run_search
from ..report import VISA_LABELS
from ..storage import STATUSES, Store

log = logging.getLogger(__name__)
STATIC = Path(__file__).parent / "static"

# Fields sent for the list view; the description is only sent with a single job.
_SUMMARY_FIELDS = ("id", "title", "company", "location", "country", "url", "posted_at", "remote", "salary", "tags",
                   "visa_status", "known_sponsor", "score", "sources", "status", "is_new", "active", "logo_url",
                   "company_domain", "first_seen")


class StatusIn(BaseModel):
    status: str


class LetterIn(BaseModel):
    notes: str = Field(default="", max_length=2000)


def _country(code: str | None) -> str:
    return "Remote (Europe)" if code == "EU-REMOTE" else COUNTRY_NAMES.get(code or "", code or "")


def _decorate(job: dict) -> dict:
    job["country_name"] = _country(job.get("country"))
    job["visa_label"] = VISA_LABELS.get(job.get("visa_status", "unknown"), "")
    return job


class SearchRunner:
    """Runs one search at a time in a background thread and reports its progress."""

    def __init__(self, config_path: str):
        self.config_path = config_path
        self._lock = threading.Lock()
        self.state = {"running": False, "started_at": None, "finished_at": None, "message": "", "error": None}

    def start(self) -> bool:
        with self._lock:
            if self.state["running"]:
                return False
            self.state.update(running=True, started_at=_now(), finished_at=None, error=None,
                              message="Searching job boards and career pages…")
        threading.Thread(target=self._run, daemon=True).start()
        return True

    def _run(self) -> None:
        try:
            scanned, jobs = run_search(load_config(self.config_path))
            message = f"Scanned {scanned} postings: {len(jobs)} matches, {sum(j.is_new for j in jobs)} new."
            self.state.update(message=message)
        except Exception as exc:  # report any failure to the UI instead of killing the thread silently
            log.exception("search failed")
            self.state.update(error=str(exc), message="Search failed.")
        finally:
            self.state.update(running=False, finished_at=_now())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def create_app(config_path: str = "config.yaml") -> FastAPI:
    config = load_config(config_path)
    store = Store(config.database)
    runner = SearchRunner(config_path)
    app = FastAPI(title="JobFinder", docs_url="/api/docs", redoc_url=None)

    @app.get("/api/jobs")
    def list_jobs():
        jobs = [_decorate({k: job.get(k) for k in _SUMMARY_FIELDS}) for job in store.list_jobs()]
        countries = sorted({j["country_name"] for j in jobs if j["country_name"]})
        return {"jobs": jobs, "countries": countries, "statuses": STATUSES, "search": runner.state}

    @app.get("/api/jobs/{job_id}")
    def get_job(job_id: str):
        job = store.get_job(job_id)
        if job is None:
            raise HTTPException(404, "job not found")
        job["letters"] = store.letters(job_id)
        return _decorate(job)

    @app.post("/api/jobs/{job_id}/status")
    def set_status(job_id: str, body: StatusIn):
        try:
            found = store.set_status(job_id, body.status)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        if not found:
            raise HTTPException(404, "job not found")
        return {"id": job_id, "status": body.status}

    @app.post("/api/jobs/{job_id}/cover-letter")
    def write_letter(job_id: str, body: LetterIn):
        # A plain `def` endpoint: FastAPI runs it in a worker thread, so the slow API call does not block others.
        job = store.get_job(job_id)
        if job is None:
            raise HTTPException(404, "job not found")
        try:
            letter = coverletter.generate(job, load_config(config_path).cover_letter, body.notes)
        except coverletter.CoverLetterError as exc:
            raise HTTPException(502, str(exc)) from exc
        saved = store.add_letter(job_id, letter.text, letter.generator)
        return {**saved, "notice": letter.notice}

    @app.get("/api/search")
    def search_status():
        return runner.state

    @app.post("/api/search")
    def start_search():
        started = runner.start()
        return {**runner.state, "started": started}

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html")

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app
