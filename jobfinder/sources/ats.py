"""Company career pages hosted on Greenhouse, Lever and Ashby.

These are the official public job-board APIs of each ATS. They are the most reliable source:
every posting is live and links straight to the company's application form.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor

import httpx

from ..models import Job, html_to_text, parse_datetime
from .base import get_json, register

log = logging.getLogger(__name__)


def _fan_out(fetch, companies: list[str], workers: int = 8):
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for jobs in pool.map(_safe(fetch), companies):
            yield from jobs


def _safe(fetch):
    def run(company: str) -> list[Job]:
        try:
            return list(fetch(company))
        except (httpx.HTTPError, ValueError) as exc:
            log.warning("skipping %s: %s", company, exc)
            return []

    return run


def _company(entry) -> tuple[str, str, str]:
    """A company entry is either "slug" or {"slug": ..., "name": ..., "domain": ...}."""
    if isinstance(entry, dict):
        return entry["slug"], entry.get("name") or entry["slug"], entry.get("domain", "")
    return str(entry), str(entry), ""


@register("greenhouse")
def greenhouse(client: httpx.Client, options: dict, keywords: list[str]):
    def fetch(entry):
        slug, name, domain = _company(entry)
        data = get_json(client, f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs", params={"content": "true"})
        for item in (data or {}).get("jobs") or []:
            offices = ", ".join(o.get("name", "") for o in item.get("offices") or [] if o.get("name"))
            location = (item.get("location") or {}).get("name") or offices
            if offices and offices not in location:
                location = f"{location} ({offices})"
            yield Job(
                source="greenhouse",
                title=item.get("title", ""),
                company=name,
                company_domain=domain,
                url=item.get("absolute_url", ""),
                location=location,
                description=html_to_text(item.get("content")),
                posted_at=parse_datetime(item.get("first_published") or item.get("updated_at")),
                tags=[d.get("name", "") for d in item.get("departments") or []],
            )

    yield from _fan_out(fetch, options.get("companies") or [])


@register("lever")
def lever(client: httpx.Client, options: dict, keywords: list[str]):
    def fetch(entry):
        slug, name, domain = _company(entry)
        data = get_json(client, f"https://api.lever.co/v0/postings/{slug}", params={"mode": "json"})
        if data is None:  # Companies hosted on Lever's EU instance.
            data = get_json(client, f"https://api.eu.lever.co/v0/postings/{slug}", params={"mode": "json"})
        for item in data or []:
            categories = item.get("categories") or {}
            locations = categories.get("allLocations") or [categories.get("location", "")]
            lists = " ".join(
                f"{block.get('text', '')}: {html_to_text(block.get('content'))}" for block in item.get("lists") or []
            )
            description = " ".join(
                part for part in (item.get("descriptionPlain"), lists, item.get("additionalPlain")) if part
            )
            yield Job(
                source="lever",
                title=item.get("text", ""),
                company=name,
                company_domain=domain,
                url=item.get("hostedUrl", ""),
                location=", ".join(loc for loc in locations if loc),
                description=description,
                posted_at=parse_datetime(item.get("createdAt")),
                remote=item.get("workplaceType") == "remote" or None,
                tags=[categories.get("team", ""), categories.get("commitment", "")],
            )

    yield from _fan_out(fetch, options.get("companies") or [])


@register("ashby")
def ashby(client: httpx.Client, options: dict, keywords: list[str]):
    def fetch(entry):
        slug, name, domain = _company(entry)
        data = get_json(client, f"https://api.ashbyhq.com/posting-api/job-board/{slug}",
                        params={"includeCompensation": "true"})
        for item in (data or {}).get("jobs") or []:
            if item.get("isListed") is False:
                continue
            locations = [item.get("location", "")] + [
                s.get("location", "") for s in item.get("secondaryLocations") or []
            ]
            country = (((item.get("address") or {}).get("postalAddress") or {}).get("addressCountry")) or ""
            location = ", ".join(dict.fromkeys(loc for loc in locations + [country] if loc))
            compensation = (item.get("compensation") or {}).get("compensationTierSummary") or ""
            yield Job(
                source="ashby",
                title=item.get("title", ""),
                company=name,
                company_domain=domain,
                url=item.get("jobUrl", ""),
                location=location,
                description=item.get("descriptionPlain") or html_to_text(item.get("descriptionHtml")),
                posted_at=parse_datetime(item.get("publishedAt")),
                remote=item.get("isRemote"),
                salary=compensation,
                tags=[item.get("department", ""), item.get("employmentType", "")],
            )

    yield from _fan_out(fetch, options.get("companies") or [])
