from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

import httpx

from .config import Config
from .models import Job
from .report import write_all
from .scoring import Scorer, deduplicate
from .sources import REGISTRY, make_client
from .sponsors import SponsorIndex
from .storage import Store

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


def run_search(config: Config, names: list[str] | None = None, *, save: bool = True,
               out_dir: str | None = None) -> tuple[int, list[Job]]:
    """Collect, rank, record in the history database and write reports. Returns (postings scanned, matches)."""
    names = names or [n for n in REGISTRY if config.source_enabled(n)]
    sponsors = SponsorIndex.load(config.sponsors_dir)
    if not len(sponsors):
        log.info("no sponsor registers loaded; run `jobfinder sponsors` to download them")
    with make_client() as client:
        raw = collect(config, client, names)
    jobs = rank(config, raw, sponsors)
    if save:
        store = Store(config.database)
        store.upsert(jobs)
        store.close()
    write_all(jobs, out_dir or config.output_dir)
    return len(raw), jobs
