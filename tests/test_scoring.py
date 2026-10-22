from datetime import datetime, timezone

from jobfinder.config import load_config
from jobfinder.models import Job
from jobfinder.scoring import Scorer
from jobfinder.visa import detect

from .conftest import ROOT


def _job(location, title="Senior Backend Engineer", description="Python, Django, Kafka. Visa sponsorship offered."):
    return Job(source="test", title=title, company="Acme", url="https://example.com/1", location=location,
               description=description, posted_at=datetime.now(timezone.utc))


def test_only_dual_citizenship_countries_are_kept():
    config = load_config(ROOT / "config.yaml")
    scorer = Scorer(config)
    assert scorer.evaluate(_job("Berlin, Germany")).country == "DE"
    assert scorer.evaluate(_job("Toronto, Ontario, Canada")).country == "CA"
    assert scorer.evaluate(_job("Vancouver, BC")).country == "CA"
    assert scorer.evaluate(_job("Tallinn, Estonia")) is None      # Estonia: no dual citizenship
    assert scorer.evaluate(_job("Vienna, Austria")) is None       # Austria: no dual citizenship
    assert scorer.evaluate(_job("Remote - Europe")) is None       # remote jobs are off
    assert scorer.evaluate(_job("Tallinn or Berlin")).country == "DE"
    assert scorer.evaluate(_job("New York, NY")) is None


def test_canadian_visa_wording():
    assert detect("This role is eligible for LMIA support.").status == "sponsored"
    assert detect("We hire through the Global Talent Stream.").status == "sponsored"
    assert detect("Candidates must be legally eligible to work in Canada.").status == "not_offered"
