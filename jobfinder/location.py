"""Map free-text job locations to European ISO country codes."""

from __future__ import annotations

import re

COUNTRIES: dict[str, tuple[str, ...]] = {
    "DE": ("germany", "deutschland", "berlin", "munich", "münchen", "muenchen", "hamburg", "frankfurt", "cologne", "köln",
           "koeln", "stuttgart", "düsseldorf", "dusseldorf", "duesseldorf", "leipzig", "dresden", "nuremberg", "nürnberg",
           "karlsruhe", "hannover", "bonn", "mannheim", "heidelberg", "potsdam", "aachen", "bremen", "essen", "dortmund"),
    "NL": ("netherlands", "nederland", "holland", "amsterdam", "rotterdam", "utrecht", "the hague", "den haag", "eindhoven",
           "delft", "haarlem", "leiden", "groningen", "amstelveen", "hoofddorp", "schiphol"),
    "IE": ("ireland", "dublin", "cork", "galway", "limerick"),
    "SE": ("sweden", "sverige", "stockholm", "gothenburg", "göteborg", "malmö", "malmo", "uppsala", "lund"),
    "DK": ("denmark", "danmark", "copenhagen", "københavn", "aarhus", "odense"),
    "FI": ("finland", "suomi", "helsinki", "espoo", "tampere", "oulu"),
    "NO": ("norway", "norge", "oslo", "bergen", "trondheim"),
    "EE": ("estonia", "eesti", "tallinn", "tartu"),
    "LT": ("lithuania", "vilnius", "kaunas"),
    "LV": ("latvia", "riga"),
    "PL": ("poland", "polska", "warsaw", "warszawa", "krakow", "kraków", "wroclaw", "wrocław", "gdansk", "gdańsk", "poznan",
           "poznań", "lodz", "łódź", "katowice"),
    "CZ": ("czech", "czechia", "prague", "praha", "brno"),
    "AT": ("austria", "österreich", "vienna", "wien", "graz", "linz", "salzburg"),
    "CH": ("switzerland", "schweiz", "suisse", "zurich", "zürich", "geneva", "genève", "basel", "lausanne", "bern", "zug"),
    "BE": ("belgium", "belgique", "belgië", "brussels", "bruxelles", "antwerp", "ghent", "gent", "leuven"),
    "LU": ("luxembourg",),
    "FR": ("france", "paris", "lyon", "toulouse", "nantes", "bordeaux", "lille", "marseille", "nice", "sophia antipolis",
           "grenoble", "montpellier"),
    "ES": ("spain", "españa", "espana", "madrid", "barcelona", "valencia", "malaga", "málaga", "seville", "sevilla", "bilbao"),
    "PT": ("portugal", "lisbon", "lisboa", "porto", "braga", "coimbra"),
    "IT": ("italy", "italia", "milan", "milano", "rome", "roma", "turin", "torino", "bologna", "florence"),
    "GB": ("united kingdom", "uk", "england", "scotland", "wales", "london", "manchester", "edinburgh", "cambridge", "oxford",
           "bristol", "glasgow", "leeds", "birmingham", "belfast"),
    "GR": ("greece", "athens", "thessaloniki"),
    "CY": ("cyprus", "limassol", "nicosia", "larnaca"),
    "MT": ("malta", "valletta", "sliema"),
    "RO": ("romania", "bucharest", "cluj", "iasi", "iași", "timisoara"),
    "BG": ("bulgaria", "sofia", "plovdiv"),
    "HU": ("hungary", "budapest"),
    "HR": ("croatia", "zagreb", "split"),
    "SI": ("slovenia", "ljubljana"),
    "SK": ("slovakia", "bratislava", "kosice", "košice"),
    "RS": ("serbia", "belgrade", "novi sad"),
    "IS": ("iceland", "reykjavik"),
}

COUNTRY_NAMES = {
    "DE": "Germany", "NL": "Netherlands", "IE": "Ireland", "SE": "Sweden", "DK": "Denmark", "FI": "Finland", "NO": "Norway",
    "EE": "Estonia", "LT": "Lithuania", "LV": "Latvia", "PL": "Poland", "CZ": "Czechia", "AT": "Austria", "CH": "Switzerland",
    "BE": "Belgium", "LU": "Luxembourg", "FR": "France", "ES": "Spain", "PT": "Portugal", "IT": "Italy",
    "GB": "United Kingdom", "GR": "Greece", "CY": "Cyprus", "MT": "Malta", "RO": "Romania", "BG": "Bulgaria",
    "HU": "Hungary", "HR": "Croatia", "SI": "Slovenia", "SK": "Slovakia", "RS": "Serbia", "IS": "Iceland",
}

# Regions that mean "somewhere in Europe" but not a specific country.
EUROPE_REGION_RE = re.compile(r"\b(europe|european union|\beu\b|emea|eea|dach|benelux|nordics?|cet|cest)\b", re.I)

# Locations that are clearly outside Europe; used to skip "Remote - US" style postings.
NON_EUROPE_RE = re.compile(
    r"\b(united states|usa|u\.s\.|us only|canada|toronto|vancouver|new york|nyc|san francisco|seattle|austin|boston|"
    r"chicago|los angeles|denver|india|bangalore|bengaluru|hyderabad|pune|singapore|australia|sydney|melbourne|"
    r"brazil|são paulo|sao paulo|mexico|argentina|japan|tokyo|china|hong kong|israel|tel aviv|dubai|uae|"
    r"philippines|south africa|nigeria|kenya|latam|americas|apac)\b",
    re.I,
)

_ALIAS_RE = {
    code: re.compile(r"(?<![a-z])(" + "|".join(re.escape(a) for a in aliases) + r")(?![a-z])", re.I)
    for code, aliases in COUNTRIES.items()
}
# "UK" is too short to trust in lowercase prose; only accept it in upper case.
_ALIAS_RE["GB"] = re.compile(
    r"(?<![A-Za-z])(UK|U\.K\.|" + "|".join(re.escape(a) for a in COUNTRIES["GB"] if a != "uk") + r")(?![A-Za-z])", re.I
)
_UK_EXACT = re.compile(r"(?<![A-Za-z])UK(?![A-Za-z])")


def detect_countries(location: str) -> list[str]:
    """All European countries named in a location string, in order of first appearance."""
    if not location:
        return []
    found: list[tuple[int, str]] = []
    for code, pattern in _ALIAS_RE.items():
        match = pattern.search(location)
        if not match:
            continue
        if code == "GB" and match.group(1).lower() == "uk" and not _UK_EXACT.search(location):
            continue
        found.append((match.start(), code))
    return [code for _, code in sorted(found)]


def detect_country(location: str) -> str | None:
    countries = detect_countries(location)
    return countries[0] if countries else None


def is_europe_region(location: str) -> bool:
    return bool(location and EUROPE_REGION_RE.search(location))


def is_outside_europe(location: str) -> bool:
    return bool(location) and not detect_countries(location) and not is_europe_region(location) \
        and bool(NON_EUROPE_RE.search(location))


def is_remote(location: str) -> bool:
    return bool(re.search(r"\b(remote|anywhere|work from home|wfh|distributed)\b", location or "", re.I))
