from __future__ import annotations

import hashlib
import html
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone

_TAG_RE = re.compile(r"<[^>]+>")
_SPACES_RE = re.compile(r"[ \t\r\f\v\xa0]+")


def html_to_text(value: str | None) -> str:
    """Strip HTML to plain text, keeping paragraphs and list items on their own lines.

    Greenhouse double-escapes its HTML, so unescape twice.
    """
    if not value:
        return ""
    text = html.unescape(html.unescape(value))
    text = re.sub(r"(?i)<\s*li[^>]*>", "\n• ", text)
    text = re.sub(r"(?i)<\s*(br|/p|/div|/h\d|/ul|/ol|p|div|h\d)(\s[^>]*)?\s*/?>", "\n", text)
    text = re.sub(r"(?i)<\s*/?\s*(td|th|tr|table)(\s[^>]*)?>", " ", text)
    text = _TAG_RE.sub("", text)
    lines = [_SPACES_RE.sub(" ", line).strip() for line in text.split("\n")]
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


@dataclass
class Job:
    source: str
    title: str
    company: str
    url: str
    location: str = ""
    description: str = ""
    posted_at: datetime | None = None
    remote: bool | None = None
    salary: str = ""
    tags: list[str] = field(default_factory=list)
    # True or False when the source itself flags sponsorship (for example Arbeitnow), None when unknown.
    source_visa_flag: bool | None = None
    # Company logo: a direct image URL when the source provides one, otherwise a domain to look up an icon for.
    logo_url: str = ""
    company_domain: str = ""

    # Filled in by the pipeline.
    country: str | None = None
    visa_status: str = "unknown"  # sponsored | relocation | likely | unknown | not_offered
    visa_evidence: list[str] = field(default_factory=list)
    known_sponsor: str | None = None
    score: int = 0
    reasons: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    is_new: bool = True

    @property
    def id(self) -> str:
        return job_id_for_key(self.key)

    @property
    def key(self) -> str:
        return f"{normalize(self.company)}|{normalize(self.title)}|{self.country or normalize(self.location)}"

    def age_days(self, now: datetime | None = None) -> float | None:
        if not self.posted_at:
            return None
        now = now or datetime.now(timezone.utc)
        posted = self.posted_at if self.posted_at.tzinfo else self.posted_at.replace(tzinfo=timezone.utc)
        return max((now - posted).total_seconds() / 86400, 0.0)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["posted_at"] = self.posted_at.isoformat() if self.posted_at else None
        data["key"] = self.key
        data["id"] = self.id
        return data


def job_id_for_key(key: str) -> str:
    return hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]


def job_from_dict(data: dict) -> Job:
    fields = {f for f in Job.__dataclass_fields__}
    job = Job(**{k: v for k, v in data.items() if k in fields})
    job.posted_at = parse_datetime(data.get("posted_at"))
    return job


def parse_datetime(value) -> datetime | None:
    """Accept unix seconds, unix milliseconds or ISO-8601 strings."""
    if value is None or value == "":
        return None
    try:
        if isinstance(value, (int, float)):
            seconds = value / 1000 if value > 10_000_000_000 else value
            return datetime.fromtimestamp(seconds, tz=timezone.utc)
        text = str(value).strip()
        if text.isdigit():
            return parse_datetime(int(text))
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, OverflowError, OSError):
        return None
