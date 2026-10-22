"""Tailor the resume to one job: reorder and reword what is already there, never add to it.

The AI (Gemini by default) gets the summary, skills and experience bullets and returns a version that puts
the experience most relevant to the job first and uses the job's wording where it is accurate. The answer is
then checked against the original resume, and any part that fails the checks is kept as it was:

* the same employers, in the same order, with no more bullets than before;
* every number (years, percentages, counts) must already appear in the resume;
* no technology or tool that is not already in the resume;
* skills can be reordered or dropped, never added;
* no part may grow much longer, so the resume stays on one page.

The result is the original resume HTML with only those parts swapped, so the layout stays identical.
Without an AI key, a template version reorders bullets and skills by how well they match the job.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from pathlib import Path

from . import ai
from .config import WritingConfig
from .models import html_to_text

SYSTEM_PROMPT = """You tailor a software engineer's resume to one job posting.

You may only reorder, select and reword what is already in the resume. Ground rules, in order of importance:
1. Never add facts. No new employers, projects, responsibilities, tools, technologies, numbers, metrics or \
claims. Every number in your output must appear in the resume exactly as written. If the job asks for something \
the resume does not show, leave it out.
2. Keep every employer, in the same order, with the same names. For each employer, order the bullets so the \
most relevant to this job come first. You may drop that employer's least relevant bullets, but keep at least two \
(or all of them if there are only two).
3. Reword bullets only to use the job's terminology where it accurately describes the same work, and keep each \
bullet no longer than the original. Keep the strongest result in each bullet wrapped in **double asterisks** for \
bold, at most two bold parts per bullet.
4. Rewrite the summary (at most 70 words) so the first sentence matches this role, using only facts from the \
resume. Keep the same years of experience.
5. Skills: keep the same row labels. Within each row, put the skills this job mentions first. You may drop \
skills that are irrelevant to the job, but never add one.
6. In "changes", list 2 to 4 short notes on what you emphasized for this job, for the candidate to review.
7. Write in English, plain and specific, without buzzwords."""

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "skills": {"type": "array", "items": {"type": "object", "properties": {
            "label": {"type": "string"}, "items": {"type": "array", "items": {"type": "string"}}},
            "required": ["label", "items"]}},
        "jobs": {"type": "array", "items": {"type": "object", "properties": {
            "company": {"type": "string"}, "bullets": {"type": "array", "items": {"type": "string"}}},
            "required": ["company", "bullets"]}},
        "changes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary", "skills", "jobs", "changes"],
}

# Tools an AI might "helpfully" add; any of these must already be in the resume to be used.
_TECH_WORDS = """aws azure gcp terraform ansible helm kubernetes docker java golang rust scala kotlin typescript javascript
node react angular vue graphql grpc spark airflow kafka flink elasticsearch opensearch cassandra dynamodb mysql
postgresql mongodb redis rabbitmq celery django fastapi flask sqlalchemy pydantic clickhouse snowflake bigquery
pandas numpy pytorch tensorflow langchain openai microservices serverless lambda jenkins argo prometheus grafana
datadog sentry linux bash""".split()
_NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?")
_CAPS_RE = re.compile(r"\b(?:[A-Z]{2,}[A-Za-z0-9]*|[A-Za-z]+[A-Z][A-Za-z0-9]*)\b")
_SPLIT_ITEMS_RE = re.compile(r",\s*(?![^()]*\))")  # commas outside parentheses


@dataclass
class Job:
    company: str
    bullets: list[str]  # plain text, **bold** marks


@dataclass
class ResumeDoc:
    source_html: str
    summary: str
    skills: list[tuple[str, list[str]]]
    jobs: list[Job]
    plain_text: str  # the whole resume as text, for fact checks

    @property
    def lower_text(self) -> str:
        return self.plain_text.lower()


@dataclass
class TailoredResume:
    html: str
    generator: str
    changes: list[str] = field(default_factory=list)
    notice: str = ""


class TailorError(RuntimeError):
    pass


# Reading and writing the resume HTML -------------------------------------------------------------------------

_SUMMARY_RE = re.compile(r"(<h2>Summary</h2>\s*<p>)(.*?)(</p>)", re.S | re.I)
_SKILLS_RE = re.compile(r'(<table class="skills">)(.*?)(</table>)', re.S | re.I)
_ROW_RE = re.compile(r"<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>\s*</tr>", re.S | re.I)
_JOB_RE = re.compile(r'(<div class="job">.*?<ul>)(.*?)(</ul>)', re.S | re.I)
_ORG_RE = re.compile(r'<span class="org">(.*?)</span>', re.S | re.I)
_LI_RE = re.compile(r"<li>(.*?)</li>", re.S | re.I)


def _to_text(fragment: str) -> str:
    """Resume HTML fragment -> plain text with **bold** marks."""
    fragment = re.sub(r"(?is)<b>(.*?)</b>", r"**\1**", fragment)
    return " ".join(html_to_text(fragment).split())


def _to_html(text: str) -> str:
    escaped = html.escape(" ".join(text.split()), quote=False)
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped).replace("**", "")


def load(path: str | Path) -> ResumeDoc:
    file = Path(path)
    if not file.exists():
        raise TailorError(f"resume not found at {file}; set ai_writing.resume in config.yaml")
    source = file.read_text(encoding="utf-8")
    summary, skills, jobs = _SUMMARY_RE.search(source), _SKILLS_RE.search(source), _JOB_RE.findall(source)
    if not (summary and skills and jobs):
        raise TailorError("the resume HTML does not have the expected Summary / Skills / Experience structure")
    rows = [(html_to_text(label), [i.strip() for i in _SPLIT_ITEMS_RE.split(html_to_text(items)) if i.strip()])
            for label, items in _ROW_RE.findall(skills.group(2))]
    parsed_jobs = []
    for head, items, _ in jobs:
        org = _ORG_RE.search(head)
        parsed_jobs.append(Job(company=html_to_text(org.group(1)) if org else "",
                               bullets=[_to_text(li) for li in _LI_RE.findall(items)]))
    body = re.sub(r"(?is)<(style|script|head)\b.*?</\1>", " ", source)
    return ResumeDoc(source_html=source, summary=_to_text(summary.group(2)), skills=rows, jobs=parsed_jobs,
                     plain_text=html_to_text(body))


def render(doc: ResumeDoc, summary: str, skills: list[tuple[str, list[str]]], jobs: list[Job],
           company: str) -> str:
    out = _SUMMARY_RE.sub(lambda m: f"{m.group(1)}\n{_to_html(summary)}\n{m.group(3)}", doc.source_html, count=1)
    rows = "\n".join(f"  <tr><td>{html.escape(label, quote=False)}</td><td>{html.escape(', '.join(items), quote=False)}"
                     f"</td></tr>" for label, items in skills)
    out = _SKILLS_RE.sub(lambda m: f"{m.group(1)}\n{rows}\n{m.group(3)}", out, count=1)
    replacements = iter(jobs)

    def job_block(match: re.Match) -> str:
        job = next(replacements)
        items = "\n".join(f"    <li>{_to_html(b)}</li>" for b in job.bullets)
        return f"{match.group(1)}\n{items}\n  {match.group(3)}"

    out = _JOB_RE.sub(job_block, out)
    title = f"Mohammad Ghaffary – Resume – {company}" if company else "Resume"
    return re.sub(r"(?is)<title>.*?</title>", f"<title>{html.escape(title, quote=False)}</title>", out, count=1)


# Fact checks -------------------------------------------------------------------------------------------------

def _numbers(text: str) -> set[str]:
    return {n.replace(",", ".") for n in _NUMBER_RE.findall(text)}


def new_facts(text: str, doc: ResumeDoc) -> list[str]:
    """Numbers and technologies in `text` that the resume does not contain."""
    problems = [n for n in sorted(_numbers(text) - _numbers(doc.plain_text))]
    lower, plain = text.lower(), doc.lower_text
    for word in _TECH_WORDS:
        if re.search(rf"(?<![a-z]){re.escape(word)}(?![a-z])", lower) and word not in plain:
            problems.append(word)
    for word in _CAPS_RE.findall(text.replace("**", "")):
        if word.lower() not in plain:
            problems.append(word)
    return problems


def _check_jobs(proposed: list, doc: ResumeDoc, notes: list[str]) -> list[Job]:
    by_company = {}
    for item in proposed if isinstance(proposed, list) else []:
        if isinstance(item, dict) and isinstance(item.get("bullets"), list):
            by_company[str(item.get("company", "")).strip().lower()] = [str(b) for b in item["bullets"] if str(b).strip()]
    result = []
    for job in doc.jobs:
        bullets = by_company.get(job.company.lower())
        problem = None
        if not bullets:
            problem = "missing"
        elif len(bullets) > len(job.bullets) or len(bullets) < min(2, len(job.bullets)):
            problem = "changed the number of bullets"
        elif sum(len(b) for b in bullets) > 1.1 * sum(len(b) for b in job.bullets) + 20:
            problem = "made it longer"
        else:
            facts = new_facts(" ".join(bullets), doc)
            if facts:
                problem = f"added {', '.join(facts[:4])}"
        if problem:
            notes.append(f"{job.company}: kept your original bullets (the AI {problem}).")
            result.append(job)
        else:
            result.append(Job(company=job.company, bullets=bullets))
    return result


def _check_skills(proposed: list, doc: ResumeDoc, notes: list[str]) -> list[tuple[str, list[str]]]:
    original = {label.lower(): (label, items) for label, items in doc.skills}
    known = {item.lower() for _, items in doc.skills for item in items}
    result, seen = [], set()
    for row in proposed if isinstance(proposed, list) else []:
        if not isinstance(row, dict):
            continue
        key = str(row.get("label", "")).strip().lower()
        if key not in original or key in seen:
            continue
        items = [str(i).strip() for i in row.get("items") or [] if str(i).strip().lower() in known]
        dropped_new = [str(i) for i in row.get("items") or [] if str(i).strip().lower() not in known]
        if dropped_new:
            notes.append(f"Skills: ignored {', '.join(dropped_new[:3])} (not in your resume).")
        seen.add(key)
        result.append((original[key][0], items or original[key][1]))
    result += [original[k] for k in original if k not in seen]  # never lose a row
    return result


def _check_summary(proposed, doc: ResumeDoc, notes: list[str]) -> str:
    text = " ".join(str(proposed or "").split())
    if not text:
        return doc.summary
    facts = new_facts(text, doc)
    if facts or len(text) > 1.25 * len(doc.summary):
        notes.append("Summary: kept your original (the AI " + (f"added {', '.join(facts[:4])}" if facts
                                                                 else "made it too long") + ").")
        return doc.summary
    return text


# Generation --------------------------------------------------------------------------------------------------

def _prompt(doc: ResumeDoc, job: dict) -> str:
    skills = "\n".join(f"- {label}: {', '.join(items)}" for label, items in doc.skills)
    jobs = "\n\n".join(f"{j.company}:\n" + "\n".join(f"- {b}" for b in j.bullets) for j in doc.jobs)
    return f"""<resume>
Summary: {doc.summary}

Skills:
{skills}

Experience (employers in order):
{jobs}

Full resume text, for reference:
{doc.plain_text}
</resume>

<job>
Company: {job.get("company", "")}
Title: {job.get("title", "")}
Location: {job.get("location", "")}

{job.get("description", "")}
</job>

Tailor the resume to this job and return the JSON."""


def tailor(job: dict, settings: WritingConfig) -> TailoredResume:
    doc = load(settings.resume)
    try:
        result = ai.generate_text(settings, SYSTEM_PROMPT, _prompt(doc, job), json_schema=SCHEMA)
        data = ai.parse_json(result)
    except ai.AIUnavailable as exc:
        tailored = tailor_template(job, doc)
        tailored.notice = f"{exc} This version only reorders your bullets and skills. {ai.key_hint(settings)}"
        return tailored
    except ai.AIError as exc:
        raise TailorError(str(exc)) from exc

    notes: list[str] = []
    jobs = _check_jobs(data.get("jobs"), doc, notes)
    skills = _check_skills(data.get("skills"), doc, notes)
    summary = _check_summary(data.get("summary"), doc, notes)
    changes = [str(c) for c in data.get("changes") or [] if str(c).strip()][:4]
    page = render(doc, summary, skills, jobs, job.get("company", ""))
    return TailoredResume(html=page, generator=result.model, changes=changes,
                          notice=" ".join(notes))


_WORD_RE = re.compile(r"[a-z][a-z0-9+#./-]{2,}")


def tailor_template(job: dict, doc: ResumeDoc) -> TailoredResume:
    """No AI: put the bullets and skills that share the most words with the job description first."""
    wanted = set(_WORD_RE.findall(f"{job.get('title', '')} {job.get('description', '')}".lower()))

    def overlap(text: str) -> int:
        return len(set(_WORD_RE.findall(text.lower())) & wanted)

    jobs = [Job(j.company, sorted(j.bullets, key=lambda b: -overlap(b))) for j in doc.jobs]
    skills = [(label, sorted(items, key=lambda i: -overlap(i))) for label, items in doc.skills]
    page = render(doc, doc.summary, skills, jobs, job.get("company", ""))
    return TailoredResume(html=page, generator="template",
                          changes=["Put the bullets and skills that match this job's description first."])
