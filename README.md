# JobFinder

Find software jobs in Europe that offer **visa sponsorship or relocation**, ranked against your skills.

JobFinder collects postings from job boards and from companies' own career pages, reads each description for
sponsorship signals ("we sponsor visas", "EU Blue Card", "relocation package", and also refusals such as "must already have the right
to work"), checks the company against official sponsor registers, and gives every job a 0–100 score. The output
is a filterable HTML page, a CSV and a Markdown summary. A SQLite history marks jobs that are new since the last run.

```
NEW  91  Visa sponsored      Germany          acme                     Senior Backend Engineer (Python)
          https://boards.greenhouse.io/acme/jobs/1
NEW  84  Visa sponsored      Sweden           Gamma                    Staff Backend Engineer
NEW  70  Relocation support  Ireland          Beta                     Python Developer
```

## Sources

| Source | What it is | Why it is useful |
| --- | --- | --- |
| `greenhouse`, `lever`, `ashby` | Official public job APIs of the career sites used by most tech companies (N26, SumUp, HelloFresh, Spotify, Mistral, n8n, ElevenLabs, …) | Live postings that link straight to the company's application form. Add any company in `config.yaml`. |
| `arbeitnow` | Germany- and Europe-focused board with a built-in "visa sponsorship" flag | Explicit sponsorship flag from the source. |
| `hackernews` | Monthly "Ask HN: Who is hiring?" thread | Posters mark `VISA` in the header line, so the signal is clear. |
| `remotive`, `remoteok` | Remote job boards | Only roles open to candidates in Europe are kept. |
| `jobspy` (optional) | LinkedIn, Indeed and Glassdoor via [python-jobspy](https://github.com/speedyapply/JobSpy) | Broadest coverage. Those sites have no public API, so keep the volume low (see below). |
| Sponsor registers | Dutch IND recognised sponsors, UK Home Office Skilled Worker sponsors | Marks companies with a sponsorship record, even when the posting says nothing. |

## Quick start

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e .

jobfinder sponsors            # download the NL and UK sponsor registers (once a week is enough)
jobfinder search              # collect, score and write reports/
open reports/jobs.html        # or xdg-open / start
```

Useful options:

```bash
jobfinder search --sources greenhouse,lever,ashby   # only company career pages
jobfinder search --min-score 60 --top 50
jobfinder -v search                                 # show per-source counts and skipped boards
jobfinder sources                                   # list sources
```

### LinkedIn, Indeed and Glassdoor

```bash
pip install -e ".[linkedin]"
```

Then set `sources.jobspy.enabled: true` in `config.yaml`. JobSpy reads the public search pages of these sites. That is
fine for a personal search a few times a day, but heavy use gets you rate-limited, and automated access may break the
sites' terms of service. On LinkedIn itself, the best manual search is keywords `"visa sponsorship" python` with
the location set to a country and *Date posted* set to *Past week*.

## Configuration (`config.yaml`)

- **`profile`**: your skills. Primary skills are worth 4 points each and secondary skills 1 point, up to 25. It also holds title include and exclude words and
  seniority words.
- **`search.countries`**: country weights from 0 to 1. Germany and the Netherlands are set to 1.0 because their
  routes (EU Blue Card, Highly Skilled Migrant) are the most predictable for non-EU engineers.
- **`search.require_visa_signal`**: set to `true` to drop every job without a sponsorship, relocation or known-sponsor
  signal.
- **`sources.*.companies`**: the career boards to scan. The slug is the part of the URL after the host:
  `boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<slug>`. A slug that does not exist is
  skipped with a warning (run with `-v` to see it), so it is safe to add guesses. Use `{slug: x, name: "Nice Name"}` for a
  readable company name.
- Drop extra sponsor lists into `data/sponsors/` as `*.txt` (one company per line) or `*.csv` (company in the first column).

## Scoring

| Part | Points |
| --- | --- |
| Visa | 40 explicit sponsorship · 25 relocation support · 15 company on a sponsor register (+5 bonus if it also has another signal) |
| Location | 20 × country weight · 6 for "remote, Europe" |
| Skills | 4 per primary skill, 1 per secondary skill, max 25 |
| Title | 6 for a target title, +4 for senior / lead / staff |
| Freshness | 5 for posted within 7 days, 3 within 14 days, 1 within 30 days |

Postings that refuse sponsorship, are outside Europe, are older than `max_age_days` or have a non-target title are
dropped. Open *Why this match* in the HTML report to see the exact sentence that triggered the visa signal.

## Run it every day on GitHub (free)

`.github/workflows/daily-search.yml` runs the search every morning on GitHub Actions. The workflow has open internet
access, so no local setup is needed. Each run:

- shows the top matches on the run's **Summary** page,
- uploads the full HTML, CSV and Markdown report as an artifact, and
- caches the history database between runs so the 🆕 markers mean "new since yesterday".

It starts working once the workflow file is on the default branch. To run it by hand, go to **Actions → Daily job
search → Run workflow**.

## Development

```bash
pip install -e ".[dev]"
pytest
```

Tests use recorded API responses (`tests/conftest.py`) and need no network.

## Also in this repository

- `resume/`: an updated resume (`Mohammad_Ghaffary_Resume.pdf`, built from `resume.html`) and notes on what changed.
- `docs/VISA_GUIDE.md`: the main European work-visa routes for software engineers, and how to use them with this tool.
