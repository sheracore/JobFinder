from __future__ import annotations

import argparse
import logging
import sys

from . import __version__
from .config import load_config
from .pipeline import collect, rank
from .report import VISA_LABELS, country_label, write_all
from .sources import REGISTRY, make_client
from .sponsors import SponsorIndex, update_registers
from .storage import Store


def _search(args) -> int:
    config = load_config(args.config)
    if args.min_score is not None:
        config.search.min_score = args.min_score
    names = args.sources.split(",") if args.sources else [n for n in REGISTRY if config.source_enabled(n)]
    unknown = [n for n in names if n not in REGISTRY]
    if unknown:
        print(f"Unknown sources: {', '.join(unknown)}. Available: {', '.join(REGISTRY)}", file=sys.stderr)
        return 2

    sponsors = SponsorIndex.load(config.sponsors_dir)
    if not len(sponsors):
        logging.info("no sponsor registers loaded; run `jobfinder sponsors` to download them")
    with make_client() as client:
        raw = collect(config, client, names)
    jobs = rank(config, raw, sponsors)

    if not args.no_db:
        store = Store(config.database)
        store.upsert(jobs)
        store.close()
    paths = write_all(jobs, args.out or config.output_dir)

    print(f"\n{len(raw)} postings scanned, {len(jobs)} matches, {sum(j.is_new for j in jobs)} new.\n")
    for job in jobs[: args.top]:
        flag = "NEW " if job.is_new else "    "
        print(f"{flag}{job.score:3d}  {VISA_LABELS[job.visa_status]:<19} {country_label(job.country):<16} "
              f"{job.company[:24]:<24} {job.title[:60]}")
        print(f"          {job.url}")
    print(f"\nReports: {paths['html']}  {paths['csv']}  {paths['md']}")
    return 0


def _sponsors(args) -> int:
    config = load_config(args.config)
    with make_client() as client:
        counts = update_registers(client, config.sponsors_dir)
    for label, count in counts.items():
        print(f"{label}: {count} companies")
    return 0 if counts else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="jobfinder", description="Find visa-sponsorship jobs in Europe.")
    parser.add_argument("--version", action="version", version=__version__)
    parser.add_argument("-c", "--config", default="config.yaml")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    search = sub.add_parser("search", help="collect, score and report jobs")
    search.add_argument("--sources", help=f"comma-separated subset of: {', '.join(REGISTRY)}")
    search.add_argument("--min-score", type=int)
    search.add_argument("--out", help="report directory (default from config)")
    search.add_argument("--top", type=int, default=25, help="how many matches to print")
    search.add_argument("--no-db", action="store_true", help="do not record results in the history database")
    search.set_defaults(func=_search)

    sponsors = sub.add_parser("sponsors", help="download the Dutch (IND) and UK sponsor registers")
    sponsors.set_defaults(func=_sponsors)

    sub.add_parser("sources", help="list available sources").set_defaults(
        func=lambda a: print("\n".join(REGISTRY)) or 0)

    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING,
                        format="%(levelname)s %(name)s: %(message)s")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
