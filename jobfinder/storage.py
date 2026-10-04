"""SQLite history: which jobs are new, what you did with each one, and the cover letters written for it."""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from .models import Job, job_id_for_key

STATUSES = ("new", "saved", "applied", "hidden")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    key         TEXT PRIMARY KEY,
    id          TEXT,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    score       INTEGER NOT NULL,
    visa_status TEXT NOT NULL,
    company     TEXT NOT NULL,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'new',
    data        TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cover_letters (
    rowid       INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    generator   TEXT NOT NULL,
    text        TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: str | Path):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        # The web server uses the store from worker threads; a lock keeps writes serialized.
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self.conn.executescript(_SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        """Add columns introduced after the first release to an existing database."""
        columns = {row["name"] for row in self.conn.execute("PRAGMA table_info(jobs)")}
        with self.conn:
            if "id" not in columns:
                self.conn.execute("ALTER TABLE jobs ADD COLUMN id TEXT")
            if "status" not in columns:
                self.conn.execute("ALTER TABLE jobs ADD COLUMN status TEXT NOT NULL DEFAULT 'new'")
            for row in self.conn.execute("SELECT key, data FROM jobs WHERE id IS NULL").fetchall():
                self.conn.execute("UPDATE jobs SET id = ? WHERE key = ?", (job_id_for_key(row["key"]), row["key"]))
            self.conn.execute("CREATE INDEX IF NOT EXISTS jobs_id ON jobs (id)")
            self.conn.execute("CREATE INDEX IF NOT EXISTS letters_job ON cover_letters (job_id)")

    def upsert(self, jobs: list[Job]) -> None:
        """Save jobs and set `is_new` on each one. A job's status (saved, applied, ...) is kept across runs."""
        now = _now()
        with self._lock, self.conn:
            for job in jobs:
                row = self.conn.execute("SELECT first_seen FROM jobs WHERE key = ?", (job.key,)).fetchone()
                job.is_new = row is None
                self.conn.execute(
                    """INSERT INTO jobs (key, id, first_seen, last_seen, score, visa_status, company, title, url, data)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(key) DO UPDATE SET last_seen = excluded.last_seen, score = excluded.score,
                         visa_status = excluded.visa_status, url = excluded.url, data = excluded.data""",
                    (job.key, job.id, now, now, job.score, job.visa_status, job.company, job.title, job.url,
                     json.dumps(job.to_dict(), ensure_ascii=False)),
                )

    def list_jobs(self) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT id, first_seen, last_seen, status, data FROM jobs ORDER BY score DESC, last_seen DESC"
            ).fetchall()
        latest = max((row["last_seen"] for row in rows), default=None)
        result = []
        for row in rows:
            data = json.loads(row["data"])
            data.update(id=row["id"], status=row["status"], first_seen=row["first_seen"],
                        last_seen=row["last_seen"], is_new=row["first_seen"] == row["last_seen"] == latest,
                        active=row["last_seen"] == latest)
            result.append(data)
        return result

    def get_job(self, job_id: str) -> dict | None:
        with self._lock:
            row = self.conn.execute(
                "SELECT id, first_seen, last_seen, status, data FROM jobs WHERE id = ?", (job_id,)
            ).fetchone()
        if row is None:
            return None
        data = json.loads(row["data"])
        data.update(id=row["id"], status=row["status"], first_seen=row["first_seen"], last_seen=row["last_seen"])
        return data

    def set_status(self, job_id: str, status: str) -> bool:
        if status not in STATUSES:
            raise ValueError(f"status must be one of {', '.join(STATUSES)}")
        with self._lock, self.conn:
            return self.conn.execute("UPDATE jobs SET status = ? WHERE id = ?", (status, job_id)).rowcount > 0

    def add_letter(self, job_id: str, text: str, generator: str) -> dict:
        created = _now()
        with self._lock, self.conn:
            cursor = self.conn.execute(
                "INSERT INTO cover_letters (job_id, created_at, generator, text) VALUES (?, ?, ?, ?)",
                (job_id, created, generator, text),
            )
        return {"id": cursor.lastrowid, "created_at": created, "generator": generator, "text": text}

    def letters(self, job_id: str) -> list[dict]:
        with self._lock:
            rows = self.conn.execute(
                "SELECT rowid AS id, created_at, generator, text FROM cover_letters WHERE job_id = ? "
                "ORDER BY rowid DESC",
                (job_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def close(self) -> None:
        self.conn.close()
