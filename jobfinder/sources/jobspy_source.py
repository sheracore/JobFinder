"""LinkedIn, Indeed and Glassdoor through the optional `python-jobspy` package.

These sites have no public job API, so JobSpy reads their public search pages. Keep the volume low
(a few searches a day): heavy use gets rate-limited, and automated access may break the sites' terms.
Install with: pip install -e ".[linkedin]"
"""

from __future__ import annotations

import logging
import math

import httpx

from ..location import COUNTRY_NAMES
from ..models import Job, parse_datetime
from .base import register

log = logging.getLogger(__name__)

# Indeed and Glassdoor need a supported country name for their regional site.
_INDEED_COUNTRIES = {"DE": "germany", "NL": "netherlands", "IE": "ireland", "GB": "uk", "FR": "france", "ES": "spain",
                     "PT": "portugal", "IT": "italy", "PL": "poland", "AT": "austria", "CH": "switzerland",
                     "BE": "belgium", "SE": "sweden", "DK": "denmark", "FI": "finland", "NO": "norway",
                     "CZ": "czech republic", "LU": "luxembourg"}


def _clean(value):
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    return value


@register("jobspy")
def jobspy(client: httpx.Client, options: dict, keywords: list[str]):
    try:
        from jobspy import scrape_jobs
    except ImportError:
        log.warning('jobspy source enabled but python-jobspy is not installed: pip install -e ".[linkedin]"')
        return

    sites = options.get("sites") or ["linkedin", "indeed"]
    countries = options.get("countries") or ["DE", "NL"]
    terms = options.get("search_terms") or [f"{k} visa sponsorship" for k in keywords]
    for code in countries:
        for term in terms:
            try:
                frame = scrape_jobs(
                    site_name=sites,
                    search_term=term,
                    location=COUNTRY_NAMES.get(code, code),
                    results_wanted=int(options.get("results_per_search", 30)),
                    hours_old=int(options.get("hours_old", 24 * 14)),
                    country_indeed=_INDEED_COUNTRIES.get(code, "germany"),
                    linkedin_fetch_description=bool(options.get("fetch_descriptions", True)),
                )
            except Exception as exc:  # JobSpy raises many different scraping errors.
                log.warning("jobspy %s / %s failed: %s", code, term, exc)
                continue
            for row in frame.to_dict(orient="records"):
                low, high = _clean(row.get("min_amount")), _clean(row.get("max_amount"))
                salary = f"{_clean(row.get('currency')) or ''} {low:,.0f}–{high:,.0f}".strip() if low and high else ""
                yield Job(
                    source=f"jobspy:{row.get('site')}",
                    title=str(_clean(row.get("title")) or ""),
                    company=str(_clean(row.get("company")) or ""),
                    url=str(_clean(row.get("job_url_direct")) or _clean(row.get("job_url")) or ""),
                    location=str(_clean(row.get("location")) or COUNTRY_NAMES.get(code, "")),
                    description=str(_clean(row.get("description")) or ""),
                    posted_at=parse_datetime(str(_clean(row.get("date_posted")) or "")),
                    remote=_clean(row.get("is_remote")),
                    salary=salary,
                    logo_url=str(_clean(row.get("company_logo")) or ""),
                )
