from jobfinder.location import detect_countries, detect_country, is_europe_region, is_outside_europe
from jobfinder.sponsors import SponsorIndex, core_name


def test_country_detection():
    assert detect_country("Berlin, Germany") == "DE"
    assert detect_country("Amsterdam") == "NL"
    assert detect_country("München") == "DE"
    assert detect_country("London, UK") == "GB"
    assert detect_country("Remote") is None
    assert detect_countries("Dublin or Lisbon") == ["IE", "PT"]


def test_uk_not_matched_inside_words_or_lowercase():
    assert detect_country("Bukarest office") is None
    assert detect_country("we work in the uk market") is None


def test_regions():
    assert is_europe_region("Remote - Europe")
    assert is_europe_region("EMEA")
    assert not is_europe_region("Remote")
    assert is_outside_europe("New York, NY")
    assert not is_outside_europe("Berlin or New York")


def test_sponsor_matching(tmp_path):
    (tmp_path / "nl.txt").write_text("Booking.com B.V.\nAdyen N.V.\nABC\n", encoding="utf-8")
    (tmp_path / "uk.csv").write_text("Monzo Bank Limited,London\n", encoding="utf-8")
    index = SponsorIndex.load(tmp_path)
    assert index.match("Booking.com") == "nl"
    assert index.match("Adyen") == "nl"
    assert index.match("Monzo Bank") == "uk"
    assert index.match("Unknown Startup") is None
    assert core_name("Delta GmbH") == "delta"
