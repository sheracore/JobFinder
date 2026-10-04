"""Turn raw postings into ranked, filtered matches.

Score out of 100:
  visa        up to 40  explicit sponsorship 40, relocation package 25, known sponsor only 15
  location    up to 20  weight of the country in the config, remote-Europe roles get a little
  skills      up to 25  primary skills 4 points each, secondary 1 point each
  title       up to 10  matches a target title, plus seniority
  freshness   up to 5
"""

from __future__ import annotations

import re
from datetime import datetime

from . import location as loc
from . import visa
from .config import Config
from .models import Job
from .sponsors import SponsorIndex


def _word_re(term: str) -> re.Pattern:
    # Word boundaries that also work for terms such as "c++", "ci/cd" or ".net".
    return re.compile(r"(?<![a-z0-9])" + re.escape(term.lower()) + r"(?![a-z0-9])", re.I)


class Scorer:
    def __init__(self, config: Config, sponsors: SponsorIndex | None = None, now: datetime | None = None):
        self.config = config
        self.sponsors = sponsors or SponsorIndex()
        self.now = now
        profile = config.profile
        self._primary = [(s, _word_re(s)) for s in profile.primary_skills]
        self._secondary = [(s, _word_re(s)) for s in profile.secondary_skills]
        self._include = [_word_re(t) for t in profile.title_include]
        self._exclude = [_word_re(t) for t in profile.title_exclude]
        self._senior = [_word_re(t) for t in profile.seniority_bonus]

    def evaluate(self, job: Job) -> Job | None:
        """Return the scored job, or None when it should be dropped."""
        search = self.config.search
        title = job.title or ""
        if self._include and not any(p.search(title) for p in self._include):
            return None
        if any(p.search(title) for p in self._exclude):
            return None

        age = job.age_days(self.now)
        if age is not None and age > search.max_age_days:
            return None

        reasons: list[str] = []
        score = 0

        # Location.
        countries = loc.detect_countries(job.location)
        weights = search.countries
        if countries:
            best = max(countries, key=lambda c: weights.get(c, search.other_europe_weight))
            job.country = best
            weight = weights.get(best, search.other_europe_weight)
            points = round(20 * weight)
            score += points
            reasons.append(f"{loc.COUNTRY_NAMES.get(best, best)} +{points}")
        elif loc.is_europe_region(job.location) or (job.remote and not loc.is_outside_europe(job.location)
                                                    and loc.is_europe_region(job.description[:400])):
            if not search.include_remote_europe:
                return None
            job.country = "EU-REMOTE"
            score += 6
            reasons.append("remote in Europe +6")
        else:
            return None

        # Visa.
        signals = visa.detect(f"{title}\n{job.location}\n{job.description}\n{' '.join(job.tags)}")
        status = signals.status
        if job.source_visa_flag is True and status in ("unknown", "relocation"):
            status = "sponsored"
            signals.evidence.insert(0, f"✓ {job.source} marks this job as offering visa sponsorship")
        job.known_sponsor = self.sponsors.match(job.company)
        if status == "unknown" and job.known_sponsor:
            status = "likely"
        job.visa_status = status
        job.visa_evidence = signals.evidence[:4]

        if status == "not_offered" and not search.include_not_offered:
            return None
        if search.require_visa_signal and status in ("unknown", "not_offered"):
            return None
        visa_points = {"sponsored": 40, "relocation": 25, "likely": 15}.get(status, 0)
        if visa_points:
            score += visa_points
            reasons.append(f"visa: {status} +{visa_points}")
        if job.known_sponsor and status != "likely":
            score += 5
            reasons.append(f"on {job.known_sponsor} register +5")

        # Skills.
        text = f"{title} {job.description} {' '.join(job.tags)}"
        primary = [name for name, p in self._primary if p.search(text)]
        secondary = [name for name, p in self._secondary if p.search(text)]
        skill_points = min(25, 4 * len(primary) + len(secondary))
        if skill_points:
            score += skill_points
            reasons.append(f"skills {', '.join(primary + secondary)} +{skill_points}")

        # Title and seniority.
        title_points = 6 if self._include else 0
        if any(p.search(title) for p in self._senior):
            title_points += 4
        if title_points:
            score += title_points
            reasons.append(f"title +{title_points}")

        # Freshness.
        if age is not None:
            fresh = 5 if age <= 7 else 3 if age <= 14 else 1 if age <= 30 else 0
            if fresh:
                score += fresh
                reasons.append(f"posted {age:.0f}d ago +{fresh}")

        job.score = min(score, 100)
        job.reasons = reasons
        return job if job.score >= search.min_score else None


def deduplicate(jobs: list[Job]) -> list[Job]:
    """Merge the same role found on several sources, keeping the best-scored copy."""
    best: dict[str, Job] = {}
    for job in jobs:
        current = best.get(job.key)
        sources = sorted(set((current.sources if current else []) + [job.source]))
        if current is None or job.score > current.score:
            best[job.key] = job
        best[job.key].sources = sources
    return sorted(best.values(), key=lambda j: (-j.score, j.company.lower(), j.title.lower()))
