import csv

from jobfinder.cli import main
from jobfinder.pipeline import collect, rank
from jobfinder.report import write_all
from jobfinder.sources import REGISTRY
from jobfinder.sponsors import SponsorIndex
from jobfinder.storage import Store


def _run(config, client, tmp_path=None):
    names = [n for n in REGISTRY if config.source_enabled(n)]
    raw = collect(config, client, names)
    sponsors = SponsorIndex()
    sponsors.add("Epsilon Ltd", "uk")
    return raw, rank(config, raw, sponsors)


def test_sources_parse(config, client):
    raw, _ = _run(config, client)
    by_source = {}
    for job in raw:
        by_source.setdefault(job.source, []).append(job)
    assert len(by_source["greenhouse"]) == 3  # the missing board is skipped
    assert by_source["greenhouse"][0].description.startswith("We use Python")
    assert by_source["lever"][0].location == "Dublin, Ireland"
    assert "Relocation package" in by_source["lever"][0].description
    assert by_source["ashby"][0].salary == "€90K – €110K"
    assert by_source["arbeitnow"][0].source_visa_flag is True
    assert len(by_source["remoteok"]) == 1
    assert [j.company for j in by_source["hackernews"]] == ["Theta"]
    assert by_source["hackernews"][0].title == "Senior Backend Engineer (Python)"


def test_ranking(config, client):
    _, jobs = _run(config, client)
    titles = {(j.company, j.title): j for j in jobs}

    acme = titles[("acme", "Senior Backend Engineer (Python)")]
    assert acme.visa_status == "sponsored" and acme.country == "DE"
    assert jobs[0].visa_status == "sponsored"

    assert ("acme", "Backend Engineer") not in titles          # says it cannot sponsor
    assert ("acme", "Account Executive") not in titles         # not an engineering title
    assert ("Beta", "Senior Software Engineer") not in titles  # New York
    assert ("Zeta", "Senior Python Engineer") not in titles    # USA only

    assert titles[("Beta", "Python Developer")].visa_status == "relocation"
    assert titles[("Gamma", "Staff Backend Engineer")].country == "SE"
    assert titles[("Delta GmbH", "Python Backend Developer (m/w/d)")].visa_status == "sponsored"
    assert titles[("Epsilon", "Senior Python Engineer")].visa_status == "likely"
    theta = titles[("Theta", "Senior Backend Engineer (Python)")]
    assert theta.country == "NL" and theta.visa_status == "sponsored"
    assert all(a.score >= b.score for a, b in zip(jobs, jobs[1:]))


def test_reports_and_history(config, client, tmp_path):
    _, jobs = _run(config, client)
    store = Store(tmp_path / "jobs.db")
    store.upsert(jobs)
    assert all(j.is_new for j in jobs)
    store.upsert(jobs)
    assert not any(j.is_new for j in jobs)
    store.close()

    paths = write_all(jobs, tmp_path / "reports")
    page = paths["html"].read_text(encoding="utf-8")
    assert "Senior Backend Engineer (Python)" in page and "<\\/" not in page.split("const JOBS")[0]
    with paths["csv"].open(encoding="utf-8", newline="") as handle:
        assert len(list(csv.reader(handle))) == len(jobs) + 1
    assert "| Score |" in paths["md"].read_text(encoding="utf-8")


def test_cli_sources(capsys):
    assert main(["sources"]) == 0
    assert "greenhouse" in capsys.readouterr().out
