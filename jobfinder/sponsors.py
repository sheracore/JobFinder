"""Official registers of employers licensed to sponsor work visas.

* Netherlands: IND public register of recognised sponsors (needed for the Highly Skilled Migrant permit).
* United Kingdom: Home Office register of licensed sponsors (Skilled Worker route).

A company on these lists has done visa sponsorship before, which is a strong hint even when the
job posting itself says nothing about visas. Any extra `*.txt` file (one company per line) or `*.csv`
file (company in the first column) dropped into the sponsors directory is loaded as well.
"""

from __future__ import annotations

import csv
import io
import logging
import re
from html.parser import HTMLParser
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

IND_URL = "https://ind.nl/en/public-register-recognised-sponsors/public-register-regular-labour-and-highly-skilled-migrants"
UK_PAGE_URL = "https://www.gov.uk/government/publications/register-of-licensed-sponsors-workers"

_SUFFIXES = re.compile(
    r"\b(b ?v|n ?v|gmbh|ag|se|ltd|limited|plc|inc|llc|ab|as|aps|oy|sarl|sas|sa|srl|spa|kg|co|corp|corporation|company|"
    r"holding|holdings|group|international|europe|emea|nederland|netherlands|deutschland|germany|uk|the)\b"
)


def core_name(name: str) -> str:
    text = re.sub(r"[^a-z0-9]+", " ", name.lower().replace("&", " and "))
    text = re.sub(r"\b([a-z]) (?=[a-z]\b)", r"\1", text)  # "b v" -> "bv", "n v" -> "nv"
    return re.sub(r"\s+", " ", _SUFFIXES.sub(" ", text)).strip()


class SponsorIndex:
    def __init__(self) -> None:
        self._names: dict[str, str] = {}  # core name -> register label

    def __len__(self) -> int:
        return len(self._names)

    def add(self, name: str, register: str) -> None:
        core = core_name(name)
        if len(core) >= 2:
            self._names.setdefault(core, register)

    def match(self, company: str) -> str | None:
        core = core_name(company)
        if not core:
            return None
        if core in self._names:
            return self._names[core]
        # "Booking.com" vs "Booking.com B.V. Amsterdam": allow a longer register entry that starts with the name.
        if len(core) >= 5:
            for name, register in self._names.items():
                if name.startswith(core + " "):
                    return register
        return None

    @classmethod
    def load(cls, directory: str | Path) -> "SponsorIndex":
        index = cls()
        folder = Path(directory)
        if not folder.exists():
            return index
        for path in sorted(folder.glob("*.txt")):
            for line in path.read_text(encoding="utf-8").splitlines():
                if line.strip() and not line.startswith("#"):
                    index.add(line.strip(), path.stem)
        for path in sorted(folder.glob("*.csv")):
            with path.open(encoding="utf-8", errors="replace", newline="") as handle:
                for row in csv.reader(handle):
                    if row and row[0].strip():
                        index.add(row[0].strip(), path.stem)
        return index


class _FirstCellParser(HTMLParser):
    """Collect the first cell of every table row."""

    def __init__(self) -> None:
        super().__init__()
        self.rows: list[str] = []
        self._in_cell = False
        self._cell_index = -1
        self._buffer: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._cell_index = -1
        elif tag in ("td", "th"):
            self._cell_index += 1
            self._in_cell = self._cell_index == 0
            self._buffer = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._in_cell:
            self._in_cell = False
            text = " ".join("".join(self._buffer).split())
            if text:
                self.rows.append(text)

    def handle_data(self, data):
        if self._in_cell:
            self._buffer.append(data)


def fetch_ind(client: httpx.Client) -> list[str]:
    response = client.get(IND_URL, headers={"Accept": "text/html"})
    response.raise_for_status()
    parser = _FirstCellParser()
    parser.feed(response.text)
    return [row for row in parser.rows if row.lower() not in ("organisation", "organization", "name")]


def fetch_uk(client: httpx.Client) -> list[str]:
    page = client.get(UK_PAGE_URL, headers={"Accept": "text/html"})
    page.raise_for_status()
    match = re.search(r'href="(https://assets\.publishing\.service\.gov\.uk/[^"]+\.csv)"', page.text)
    if not match:
        raise RuntimeError("could not find the sponsor CSV link on gov.uk")
    response = client.get(match.group(1), headers={"Accept": "text/csv"})
    response.raise_for_status()
    reader = csv.DictReader(io.StringIO(response.content.decode("utf-8-sig", errors="replace")))
    names = []
    for row in reader:
        route = (row.get("Route") or "").lower()
        if "skilled worker" in route or "global business mobility" in route:
            names.append(row.get("Organisation Name") or "")
    return sorted({n for n in names if n})


def update_registers(client: httpx.Client, directory: str | Path) -> dict[str, int]:
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    counts = {}
    for label, fetch in (("nl_ind_recognised_sponsors", fetch_ind), ("uk_skilled_worker_sponsors", fetch_uk)):
        try:
            names = fetch(client)
        except (httpx.HTTPError, RuntimeError) as exc:
            log.error("could not update %s: %s", label, exc)
            continue
        (folder / f"{label}.txt").write_text("\n".join(names) + "\n", encoding="utf-8")
        counts[label] = len(names)
    return counts
