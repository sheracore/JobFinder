"""Write the ranked matches as CSV, Markdown and a self-contained HTML page."""

from __future__ import annotations

import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path

from .location import COUNTRY_NAMES
from .models import Job

VISA_LABELS = {
    "sponsored": "Visa sponsored",
    "relocation": "Relocation support",
    "likely": "Known sponsor",
    "unknown": "Not mentioned",
    "not_offered": "No sponsorship",
}


def country_label(code: str | None) -> str:
    if code == "EU-REMOTE":
        return "Remote (Europe)"
    return COUNTRY_NAMES.get(code or "", code or "")


def write_csv(jobs: list[Job], path: Path) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["score", "new", "visa", "company", "title", "country", "location", "posted", "salary",
                         "sources", "url", "evidence", "reasons"])
        for job in jobs:
            writer.writerow([
                job.score, "yes" if job.is_new else "", VISA_LABELS[job.visa_status], job.company, job.title,
                country_label(job.country), job.location, job.posted_at.date().isoformat() if job.posted_at else "",
                job.salary, " ".join(job.sources), job.url, " | ".join(job.visa_evidence), "; ".join(job.reasons),
            ])


def write_markdown(jobs: list[Job], path: Path, limit: int = 50) -> None:
    lines = [
        f"# Visa-sponsorship jobs in Europe ({datetime.now(timezone.utc):%Y-%m-%d})",
        "",
        f"{len(jobs)} matches, {sum(j.is_new for j in jobs)} new since the last run. "
        f"Top {min(limit, len(jobs))} shown; see the CSV or HTML report for all.",
        "",
        "| Score | Visa | Company | Role | Country | Posted |",
        "| ---: | --- | --- | --- | --- | --- |",
    ]
    for job in jobs[:limit]:
        title = job.title.replace("|", "/")
        new = " 🆕" if job.is_new else ""
        posted = job.posted_at.date().isoformat() if job.posted_at else ""
        lines.append(f"| {job.score} | {VISA_LABELS[job.visa_status]} | {job.company.replace('|', '/')} | "
                     f"[{title}]({job.url}){new} | {country_label(job.country)} | {posted} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(jobs: list[Job], path: Path) -> None:
    rows = [{
        "score": j.score, "new": j.is_new, "visa": j.visa_status, "visaLabel": VISA_LABELS[j.visa_status],
        "company": j.company, "title": j.title, "country": country_label(j.country), "location": j.location,
        "posted": j.posted_at.date().isoformat() if j.posted_at else "", "salary": j.salary, "url": j.url,
        "sources": ", ".join(j.sources), "evidence": j.visa_evidence, "reasons": j.reasons,
    } for j in jobs]
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    data = json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
    path.write_text(_TEMPLATE.replace("__DATA__", data).replace("__GENERATED__", html.escape(generated)),
                    encoding="utf-8")


def write_all(jobs: list[Job], directory: str | Path) -> dict[str, Path]:
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    paths = {"csv": folder / "jobs.csv", "md": folder / "jobs.md", "html": folder / "jobs.html"}
    write_csv(jobs, paths["csv"])
    write_markdown(jobs, paths["md"])
    write_html(jobs, paths["html"])
    return paths


_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visa Jobs Europe</title>
<style>
:root { --bg:#f7f8fa; --card:#fff; --ink:#1b1f24; --muted:#5d6670; --line:#e2e6ea; --accent:#1f5fae;
        --good:#1a7f37; --warn:#9a6700; --info:#6639ba; --bad:#b42318; }
@media (prefers-color-scheme: dark) { :root { --bg:#0f1216; --card:#171b21; --ink:#e6e9ed; --muted:#9aa4ae;
        --line:#2a3038; --accent:#6aa8ff; --good:#4ac26b; --warn:#d4a72c; --info:#a98bff; --bad:#ff7b72; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width:1200px; margin:0 auto; padding:20px 16px 48px; }
h1 { font-size:22px; margin:0 0 4px; }
.sub { color:var(--muted); margin-bottom:16px; }
.controls { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
input, select { font:inherit; padding:7px 10px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--ink); }
input[type=search] { flex:1 1 240px; }
.list { display:grid; gap:8px; }
.job { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:12px 14px;
       display:grid; grid-template-columns:52px 1fr auto; gap:12px; align-items:start; }
.score { font-size:20px; font-weight:700; text-align:center; color:var(--accent); }
.title { font-weight:600; font-size:15px; color:var(--ink); text-decoration:none; }
.title:hover { text-decoration:underline; }
.meta { color:var(--muted); font-size:13px; margin-top:2px; }
.badge { display:inline-block; font-size:12px; font-weight:600; padding:2px 8px; border-radius:99px; border:1px solid currentColor; white-space:nowrap; }
.sponsored { color:var(--good); } .relocation { color:var(--warn); } .likely { color:var(--info); }
.unknown { color:var(--muted); } .not_offered { color:var(--bad); }
.new { color:var(--accent); margin-left:6px; }
details { margin-top:6px; font-size:13px; color:var(--muted); }
details li { margin:2px 0; }
.empty { color:var(--muted); padding:24px; text-align:center; }
@media (max-width:640px) { .job { grid-template-columns:40px 1fr; } .job > .right { grid-column:2; } }
</style>
</head>
<body>
<main>
<h1>Visa-sponsorship jobs in Europe</h1>
<div class="sub">Generated __GENERATED__ · <span id="count"></span></div>
<div class="controls">
  <input type="search" id="q" placeholder="Filter by company, title, skill…" aria-label="Filter">
  <select id="visa" aria-label="Visa"><option value="">Any visa signal</option>
    <option value="sponsored">Visa sponsored</option><option value="relocation">Relocation support</option>
    <option value="likely">Known sponsor</option><option value="unknown">Not mentioned</option></select>
  <select id="country" aria-label="Country"><option value="">All countries</option></select>
  <label><input type="checkbox" id="onlyNew"> New only</label>
</div>
<div class="list" id="list"></div>
</main>
<script>
const JOBS = __DATA__;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl = u => /^https?:\\/\\//i.test(u) ? u : "#";
[...new Set(JOBS.map(j => j.country))].sort().forEach(c => { const o = document.createElement("option"); o.value = o.textContent = c; $("country").append(o); });
function render() {
  const q = $("q").value.toLowerCase(), visa = $("visa").value, country = $("country").value, onlyNew = $("onlyNew").checked;
  const rows = JOBS.filter(j => (!visa || j.visa === visa) && (!country || j.country === country) && (!onlyNew || j.new)
    && (!q || [j.company, j.title, j.location, j.reasons.join(" ")].join(" ").toLowerCase().includes(q)));
  $("count").textContent = rows.length + " of " + JOBS.length + " matches";
  $("list").innerHTML = rows.length ? rows.map(j => `
    <article class="job">
      <div class="score" title="Match score">${j.score}</div>
      <div>
        <a class="title" href="${esc(safeUrl(j.url))}" target="_blank" rel="noopener">${esc(j.title)}</a>${j.new ? '<span class="badge new">new</span>' : ""}
        <div class="meta">${esc(j.company)} · ${esc(j.country)}${j.location ? " · " + esc(j.location) : ""}${j.posted ? " · " + esc(j.posted) : ""}${j.salary ? " · " + esc(j.salary) : ""}</div>
        <details><summary>Why this match</summary><ul>${j.evidence.concat(j.reasons).map(r => `<li>${esc(r)}</li>`).join("")}</ul><div>Source: ${esc(j.sources)}</div></details>
      </div>
      <div class="right"><span class="badge ${esc(j.visa)}">${esc(j.visaLabel)}</span></div>
    </article>`).join("") : '<div class="empty">No matches for these filters.</div>';
}
["q", "visa", "country", "onlyNew"].forEach(id => $(id).addEventListener("input", render));
render();
</script>
</body>
</html>
"""
