from __future__ import annotations

import logging
import time
from typing import Callable, Iterable
from urllib.parse import urlparse

import httpx

from ..models import Job

log = logging.getLogger(__name__)

USER_AGENT = "JobFinder/0.1 (+https://github.com/sheracore/JobFinder; personal job search)"

# A source is a function (client, options, search keywords) -> jobs.
SourceFn = Callable[[httpx.Client, dict, list[str]], Iterable[Job]]
REGISTRY: dict[str, SourceFn] = {}


def register(name: str):
    def wrap(fn: SourceFn) -> SourceFn:
        REGISTRY[name] = fn
        return fn

    return wrap


# Hosts that belong to job boards or applicant-tracking systems, not to the hiring company.
_NOT_COMPANY_HOSTS = ("greenhouse.io", "lever.co", "ashbyhq.com", "arbeitnow.com", "remotive.com", "remoteok.com",
                      "ycombinator.com", "linkedin.com", "indeed.com", "glassdoor.com", "workable.com",
                      "smartrecruiters.com", "personio.de", "personio.com", "recruitee.com", "teamtailor.com",
                      "bamboohr.com", "myworkdayjobs.com", "join.com", "wellfound.com", "github.com", "google.com",
                      "forms.gle", "notion.site", "calendly.com")


def domain_from_url(url: str) -> str:
    """The company's own domain from a URL, or "" when the URL points at a job board or ATS."""
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return ""
    host = host.removeprefix("www.").removeprefix("careers.").removeprefix("jobs.")
    if not host or "." not in host or any(host == h or host.endswith("." + h) for h in _NOT_COMPANY_HOSTS):
        return ""
    return host


def make_client(transport: httpx.BaseTransport | None = None) -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
        timeout=httpx.Timeout(25.0, connect=10.0),
        follow_redirects=True,
        transport=transport,
    )


def get_json(client: httpx.Client, url: str, *, params: dict | None = None, retries: int = 2):
    """GET a JSON document, retrying on 429 and 5xx. Returns None on 404 so a missing board is not fatal."""
    for attempt in range(retries + 1):
        response = client.get(url, params=params)
        if response.status_code == 404:
            log.warning("404 for %s", response.url)
            return None
        if response.status_code == 429 or response.status_code >= 500:
            if attempt < retries:
                time.sleep(float(response.headers.get("Retry-After", 2 * (attempt + 1))))
                continue
        response.raise_for_status()
        return response.json()
    return None
