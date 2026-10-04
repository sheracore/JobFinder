from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


@dataclass
class Profile:
    primary_skills: list[str] = field(default_factory=list)
    secondary_skills: list[str] = field(default_factory=list)
    title_include: list[str] = field(default_factory=list)
    title_exclude: list[str] = field(default_factory=list)
    seniority_bonus: list[str] = field(default_factory=list)


@dataclass
class Search:
    keywords: list[str] = field(default_factory=lambda: ["python backend"])
    # ISO code -> weight between 0 and 1. Countries not listed but in Europe get `other_europe_weight`.
    countries: dict[str, float] = field(default_factory=dict)
    other_europe_weight: float = 0.5
    include_remote_europe: bool = True
    include_not_offered: bool = False
    require_visa_signal: bool = False
    max_age_days: int = 45
    min_score: int = 35


@dataclass
class CoverLetterConfig:
    resume: str = "resume/resume.html"
    candidate_name: str = "Mohammad Ghaffary"
    # Anything true that is not in the resume and should inform letters (availability, notice period, ...).
    extra_context: str = ""
    use_claude: bool = True
    model: str = "claude-opus-5-5"
    effort: str = "high"


@dataclass
class Config:
    profile: Profile = field(default_factory=Profile)
    search: Search = field(default_factory=Search)
    sources: dict[str, dict] = field(default_factory=dict)
    database: str = "data/jobs.db"
    sponsors_dir: str = "data/sponsors"
    output_dir: str = "reports"
    cover_letter: CoverLetterConfig = field(default_factory=CoverLetterConfig)

    def source_enabled(self, name: str) -> bool:
        return bool(self.sources.get(name, {}).get("enabled", False))

    def source_options(self, name: str) -> dict:
        return self.sources.get(name, {}) or {}


def load_config(path: str | Path) -> Config:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8")) or {}
    profile = Profile(**(raw.get("profile") or {}))
    search_raw = dict(raw.get("search") or {})
    search_raw["countries"] = {str(k).upper(): float(v) for k, v in (search_raw.get("countries") or {}).items()}
    search = Search(**search_raw)
    return Config(
        profile=profile,
        search=search,
        sources=raw.get("sources") or {},
        database=raw.get("database", "data/jobs.db"),
        sponsors_dir=raw.get("sponsors_dir", "data/sponsors"),
        output_dir=raw.get("output_dir", "reports"),
        cover_letter=CoverLetterConfig(**(raw.get("cover_letter") or {})),
    )
