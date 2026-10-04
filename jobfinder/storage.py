"""SQLite history so each run can tell which matches are new."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Job

_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
    key         TEXT PRIMARY KEY,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    score       INTEGER NOT NULL,
    visa_status TEXT NOT NULL,
    company     TEXT NOT NULL,
    title       TEXT NOT NULL,
    url         TEXT NOT NULL,
    data        TEXT NOT NULL
);
"""


class Store:
    def __init__(self, path: str | Path):
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path))
        self.conn.executescript(_SCHEMA)

    def upsert(self, jobs: list[Job]) -> None:
        """Save jobs and set `is_new` on each one."""
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        with self.conn:
            for job in jobs:
                row = self.conn.execute("SELECT first_seen FROM jobs WHERE key = ?", (job.key,)).fetchone()
                job.is_new = row is None
                self.conn.execute(
                    """INSERT INTO jobs (key, first_seen, last_seen, score, visa_status, company, title, url, data)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(key) DO UPDATE SET last_seen = excluded.last_seen, score = excluded.score,
                         visa_status = excluded.visa_status, url = excluded.url, data = excluded.data""",
                    (job.key, now, now, job.score, job.visa_status, job.company, job.title, job.url,
                     json.dumps(job.to_dict(), ensure_ascii=False)),
                )

    def close(self) -> None:
        self.conn.close()
