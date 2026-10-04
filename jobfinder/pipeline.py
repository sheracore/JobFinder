from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

import httpx

from .config import Config
from .models import Job
from .scoring import Scorer, deduplicate
from .sources import REGISTRY
from .sponsors import SponsorIndex

log = logging.getLogger(__name__)


def collect(config: Config, client: httpx.Client, names: list[str]) -> list[Job]:
    def run(name: str) -> list[Job]:
        try:
            jobs = list(REGISTRY[name](client, config.source_options(name), config.search.keywords))
        except (httpx.HTTPError, ValueError) as exc:
            log.error("source %s failed: %s", name, exc)
            return []
        log.info("%-11s %5d postings", name, len(jobs))
        return jobs

    with ThreadPoolExecutor(max_workers=max(len(names), 1)) as pool:
        return [job for jobs in pool.map(run, names) for job in jobs]


def rank(config: Config, jobs: list[Job], sponsors: SponsorIndex | None = None) -> list[Job]:
    scorer = Scorer(config, sponsors)
    scored = [job for job in (scorer.evaluate(j) for j in jobs) if job is not None]
    return deduplicate(scored)
