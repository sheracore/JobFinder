import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from jobfinder.config import load_config
from jobfinder.sources import make_client

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime.now(timezone.utc)


def iso(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).isoformat()


def unix(days_ago: float) -> int:
    return int((NOW - timedelta(days=days_ago)).timestamp())


GREENHOUSE = {"jobs": [
    {"id": 1, "title": "Senior Backend Engineer (Python)", "absolute_url": "https://boards.greenhouse.io/acme/jobs/1",
     "location": {"name": "Berlin, Germany"}, "updated_at": iso(3), "departments": [{"name": "Engineering"}],
     "content": "&lt;p&gt;We use Python, Django, Kafka and Kubernetes. We offer visa sponsorship and relocation support "
                "for you and your family.&lt;/p&gt;"},
    {"id": 2, "title": "Backend Engineer", "absolute_url": "https://boards.greenhouse.io/acme/jobs/2",
     "location": {"name": "Amsterdam"}, "updated_at": iso(5),
     "content": "&lt;p&gt;Python and PostgreSQL. Unfortunately we are unable to offer visa sponsorship for this role."
                "&lt;/p&gt;"},
    {"id": 3, "title": "Account Executive", "absolute_url": "https://boards.greenhouse.io/acme/jobs/3",
     "location": {"name": "Berlin"}, "updated_at": iso(1), "content": "visa sponsorship"},
]}

LEVER = [
    {"id": "a", "text": "Python Developer", "hostedUrl": "https://jobs.lever.co/beta/a", "createdAt": unix(2) * 1000,
     "categories": {"location": "Dublin, Ireland", "team": "Platform", "commitment": "Full-time"},
     "descriptionPlain": "FastAPI, Redis, Docker.", "lists": [{"text": "Benefits", "content": "<li>Relocation package</li>"}],
     "additionalPlain": ""},
    {"id": "b", "text": "Senior Software Engineer", "hostedUrl": "https://jobs.lever.co/beta/b", "createdAt": unix(1) * 1000,
     "categories": {"location": "New York, NY"}, "descriptionPlain": "Python. Visa sponsorship available."},
]

ASHBY = {"jobs": [
    {"id": "x", "title": "Staff Backend Engineer", "jobUrl": "https://jobs.ashbyhq.com/gamma/x", "location": "Stockholm",
     "secondaryLocations": [{"location": "Remote - Europe"}], "isRemote": False, "publishedAt": iso(4),
     "descriptionPlain": "Python, microservices, Kafka. Blue Card and visa support provided.", "isListed": True,
     "compensation": {"compensationTierSummary": "€90K – €110K"}},
]}

ARBEITNOW = {"data": [
    {"slug": "s1", "company_name": "Delta GmbH", "title": "Python Backend Developer (m/w/d)", "remote": False,
     "url": "https://www.arbeitnow.com/jobs/s1", "tags": ["Python"], "job_types": ["full time"], "location": "Munich",
     "created_at": unix(2), "visa_sponsorship": True, "description": "<p>Django, Celery, PostgreSQL</p>"},
], "links": {"next": None}}

REMOTIVE = {"jobs": [
    {"id": 7, "url": "https://remotive.com/7", "title": "Senior Python Engineer", "company_name": "Epsilon",
     "candidate_required_location": "Europe", "publication_date": iso(6), "description": "<p>Python, FastAPI</p>",
     "tags": ["python"], "salary": ""},
    {"id": 8, "url": "https://remotive.com/8", "title": "Senior Python Engineer", "company_name": "Zeta",
     "candidate_required_location": "USA only", "publication_date": iso(6), "description": "Python", "tags": []},
]}

REMOTEOK = [{"legal": "notice"}, {"id": "9", "position": "Backend Engineer", "company": "Eta", "location": "Remote",
                                  "epoch": unix(1), "description": "Python", "url": "https://remoteok.com/9", "tags": []}]

HN_SEARCH = {"hits": [{"objectID": "100", "title": "Ask HN: Who is hiring? (October 2026)"}]}
HN_ITEM = {"children": [
    {"id": 101, "created_at_i": unix(1),
     "text": "Theta | Senior Backend Engineer (Python) | Amsterdam, Netherlands | ONSITE | VISA<p>We use Django and Kafka."},
    {"id": 102, "created_at_i": unix(1), "text": "Iota | Frontend Engineer | Remote (US)<p>React."},
]}


def handler(request: httpx.Request) -> httpx.Response:
    host, path = request.url.host, request.url.path
    routes = {
        ("boards-api.greenhouse.io", "/v1/boards/acme/jobs"): GREENHOUSE,
        ("api.lever.co", "/v0/postings/beta"): LEVER,
        ("api.ashbyhq.com", "/posting-api/job-board/gamma"): ASHBY,
        ("www.arbeitnow.com", "/api/job-board-api"): ARBEITNOW,
        ("remotive.com", "/api/remote-jobs"): REMOTIVE,
        ("remoteok.com", "/api"): REMOTEOK,
        ("hn.algolia.com", "/api/v1/search_by_date"): HN_SEARCH,
        ("hn.algolia.com", "/api/v1/items/100"): HN_ITEM,
    }
    body = routes.get((host, path))
    if body is None:
        return httpx.Response(404, json={"error": "not found"})
    return httpx.Response(200, content=json.dumps(body))


@pytest.fixture
def client():
    with make_client(httpx.MockTransport(handler)) as c:
        yield c


@pytest.fixture
def config():
    cfg = load_config(ROOT / "config.yaml")
    cfg.sources = {
        "greenhouse": {"enabled": True, "companies": ["acme", {"slug": "missing", "name": "Missing"}]},
        "lever": {"enabled": True, "companies": [{"slug": "beta", "name": "Beta"}]},
        "ashby": {"enabled": True, "companies": [{"slug": "gamma", "name": "Gamma"}]},
        "arbeitnow": {"enabled": True, "pages": 2},
        "remotive": {"enabled": True},
        "remoteok": {"enabled": True},
        "hackernews": {"enabled": True},
    }
    cfg.search.keywords = ["python"]
    cfg.search.min_score = 0
    return cfg
