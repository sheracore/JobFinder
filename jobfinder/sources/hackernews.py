"""Hacker News "Ask HN: Who is hiring?" monthly threads, via the public Algolia API.

Posters conventionally write "Company | Role | Location | ONSITE/REMOTE | VISA" on the first line,
so these threads are one of the best places to find companies that explicitly sponsor visas.
"""

from __future__ import annotations

import re

import httpx

from ..models import Job, html_to_text, parse_datetime
from .base import domain_from_url, get_json, register

ALGOLIA = "https://hn.algolia.com/api/v1"
_VISA_RE = re.compile(r"\bvisa\b|relocat", re.I)


def _first_line(html_text: str) -> str:
    first = re.split(r"(?i)<p>|\n", html_text or "", maxsplit=1)[0]
    return html_to_text(first)


def _first_domain(html_text: str) -> str:
    for match in re.finditer(r'href="([^"]+)"', html_text or ""):
        domain = domain_from_url(match.group(1).replace("&#x2F;", "/"))
        if domain:
            return domain
    return ""


@register("hackernews")
def hackernews(client: httpx.Client, options: dict, keywords: list[str]):
    threads = int(options.get("threads", 1))
    search = get_json(client, f"{ALGOLIA}/search_by_date",
                      params={"tags": "story,author_whoishiring", "query": "Who is hiring", "hitsPerPage": 10})
    stories = [h for h in (search or {}).get("hits") or [] if "who is hiring" in (h.get("title") or "").lower()]
    for story in stories[:threads]:
        thread = get_json(client, f"{ALGOLIA}/items/{story['objectID']}") or {}
        for comment in thread.get("children") or []:
            raw = comment.get("text") or ""
            if not _VISA_RE.search(raw):
                continue
            header = _first_line(raw)
            parts = [p.strip() for p in header.split("|") if p.strip()]
            if len(parts) < 2:
                continue
            company = parts[0]
            title = next((p for p in parts[1:] if re.search(r"engineer|developer|backend|python|sre|platform|devops",
                                                             p, re.I)), parts[1])
            location = " | ".join(p for p in parts[1:] if p != title)
            yield Job(
                source="hackernews",
                title=title[:160],
                company=company[:120],
                url=f"https://news.ycombinator.com/item?id={comment.get('id')}",
                location=location[:200],
                description=html_to_text(raw),
                posted_at=parse_datetime(comment.get("created_at_i") or comment.get("created_at")),
                company_domain=_first_domain(raw),
            )
