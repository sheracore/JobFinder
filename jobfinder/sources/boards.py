"""Public job boards with JSON APIs."""

from __future__ import annotations

import logging

import httpx

from ..models import Job, html_to_text, parse_datetime
from .base import get_json, register

log = logging.getLogger(__name__)


@register("arbeitnow")
def arbeitnow(client: httpx.Client, options: dict, keywords: list[str]):
    """Arbeitnow: Germany and Europe focused board. Its postings carry a `visa_sponsorship` flag."""
    pages = int(options.get("pages", 5))
    url = "https://www.arbeitnow.com/api/job-board-api"
    params: dict = {"visa_sponsorship": "true"} if options.get("only_visa", True) else {}
    for page in range(1, pages + 1):
        data = get_json(client, url, params={**params, "page": page})
        items = (data or {}).get("data") or []
        for item in items:
            tags = [str(t) for t in item.get("tags") or []]
            flag = item.get("visa_sponsorship")
            if flag is None and any("visa" in t.lower() for t in tags):
                flag = True
            yield Job(
                source="arbeitnow",
                title=item.get("title", ""),
                company=item.get("company_name", ""),
                url=item.get("url", ""),
                location=item.get("location", ""),
                description=html_to_text(item.get("description")),
                posted_at=parse_datetime(item.get("created_at")),
                remote=item.get("remote"),
                tags=tags + list(item.get("job_types") or []),
                source_visa_flag=flag if isinstance(flag, bool) else None,
            )
        if not items or not (data or {}).get("links", {}).get("next"):
            break


@register("remotive")
def remotive(client: httpx.Client, options: dict, keywords: list[str]):
    """Remotive: remote jobs. Only postings open to candidates in Europe are kept by the pipeline."""
    seen: set = set()
    for keyword in keywords:
        data = get_json(client, "https://remotive.com/api/remote-jobs",
                        params={"category": options.get("category", "software-dev"), "search": keyword})
        for item in (data or {}).get("jobs") or []:
            if item.get("id") in seen:
                continue
            seen.add(item.get("id"))
            yield Job(
                source="remotive",
                title=item.get("title", ""),
                company=item.get("company_name", ""),
                url=item.get("url", ""),
                location=item.get("candidate_required_location") or "Remote",
                description=html_to_text(item.get("description")),
                posted_at=parse_datetime(item.get("publication_date")),
                remote=True,
                salary=item.get("salary") or "",
                tags=list(item.get("tags") or []),
                logo_url=item.get("company_logo") or item.get("company_logo_url") or "",
            )


@register("remoteok")
def remoteok(client: httpx.Client, options: dict, keywords: list[str]):
    """RemoteOK: remote jobs. The first array element is a legal notice, not a job."""
    data = get_json(client, "https://remoteok.com/api") or []
    for item in data:
        if not isinstance(item, dict) or "position" not in item:
            continue
        salary = ""
        if item.get("salary_min") and item.get("salary_max"):
            salary = f"${item['salary_min']:,}–${item['salary_max']:,}"
        yield Job(
            source="remoteok",
            title=item.get("position", ""),
            company=item.get("company", ""),
            url=item.get("url") or item.get("apply_url", ""),
            location=item.get("location") or "Remote",
            description=html_to_text(item.get("description")),
            posted_at=parse_datetime(item.get("epoch") or item.get("date")),
            remote=True,
            salary=salary,
            tags=list(item.get("tags") or []),
            logo_url=item.get("company_logo") or item.get("logo") or "",
        )
