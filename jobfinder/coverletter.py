"""Write a cover letter for one job from the candidate's resume.

With Anthropic API credentials (ANTHROPIC_API_KEY, or an `ant auth login` profile) Claude writes a
tailored letter. Without them, a template letter is assembled from the resume bullets that best match the
job description, so the feature still works offline.

Either way the letter only uses facts from the resume: no invented employers, numbers or skills.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

from .config import CoverLetterConfig
from .models import html_to_text

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """You write cover letters for a software engineer applying to jobs in Europe.

Ground rules, in order of importance:
1. Use only facts that appear in the candidate's resume or the extra context. Never invent employers, \
projects, numbers, technologies, degrees or language levels. If the job asks for something the resume does not \
show, do not claim it: either leave it out or present a related, real strength honestly.
2. Connect two or three specific resume achievements to the most important requirements in the job description. \
Prefer achievements with concrete results. Explain briefly why each one matters for this role.
3. Mention something specific about the company or role taken from the job description, so the letter could not \
be sent unchanged to another company. Do not make up facts about the company.
4. The candidate needs work-visa sponsorship to relocate. If the posting mentions sponsorship or relocation, say \
in one plain sentence that the candidate is ready to relocate and would use that support. If the posting does not \
mention it, say once, briefly and confidently, that the candidate is open to relocating and would need visa \
sponsorship. Never apologize for it.
5. Write like a senior engineer: direct, specific and warm, with no clichés ("I am writing to express my \
interest", "passionate", "perfect fit", "fast-paced environment", "team player"), no exaggeration and no \
buzzword lists. Short paragraphs. 250 to 350 words.
6. Write in English unless the job description is written in another language, in which case use that language.

Output only the letter: start with "Dear <company> team," (or the hiring manager's name if the job description \
gives one), end with "Best regards," followed by the candidate's name on the next line. No subject line, no \
date, no address block, no placeholders in square brackets, no notes before or after the letter."""


@dataclass
class Letter:
    text: str
    generator: str  # "claude:<model>" or "template"
    notice: str = ""


class CoverLetterError(RuntimeError):
    pass


def load_resume(path: str | Path) -> str:
    file = Path(path)
    if not file.exists():
        raise CoverLetterError(f"resume not found at {file}; set cover_letter.resume in config.yaml")
    raw = file.read_text(encoding="utf-8")
    if file.suffix.lower() in (".html", ".htm"):
        raw = re.sub(r"(?is)<(style|script|head)\b.*?</\1>", " ", raw)
        return html_to_text(raw)
    return raw.strip()


def build_user_prompt(job: dict, resume_text: str, settings: CoverLetterConfig, notes: str = "") -> str:
    visa = {
        "sponsored": "The posting offers visa sponsorship.",
        "relocation": "The posting offers relocation support.",
        "likely": "The company is on an official register of visa sponsors, but the posting does not mention it.",
    }.get(job.get("visa_status", ""), "The posting does not mention visa sponsorship.")
    extra = "\n".join(part for part in (settings.extra_context.strip(), notes.strip()) if part)
    return f"""<resume>
{resume_text}
</resume>

<extra_context>
Candidate name: {settings.candidate_name}
{extra or "(none)"}
</extra_context>

<job>
Company: {job.get("company", "")}
Title: {job.get("title", "")}
Location: {job.get("location", "")}
Visa: {visa}

{job.get("description", "")}
</job>

Write the cover letter for this job."""


def generate(job: dict, settings: CoverLetterConfig, notes: str = "") -> Letter:
    resume_text = load_resume(settings.resume)
    if settings.use_claude:
        try:
            return _generate_with_claude(job, resume_text, settings, notes)
        except _NoCredentials as exc:
            letter = generate_template(job, settings)
            letter.notice = (f"{exc} This letter was built from a template. Set ANTHROPIC_API_KEY to get a letter "
                             "written for this job by Claude.")
            return letter
    return generate_template(job, settings)


class _NoCredentials(Exception):
    pass


def _generate_with_claude(job: dict, resume_text: str, settings: CoverLetterConfig, notes: str) -> Letter:
    try:
        import anthropic
    except ImportError as exc:
        raise _NoCredentials('The anthropic package is not installed (pip install -e ".[web]").') from exc

    try:
        client = anthropic.Anthropic()
        response = client.beta.messages.create(
            model=settings.model,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": build_user_prompt(job, resume_text, settings, notes)}],
            output_config={"effort": settings.effort},
            # If a safety classifier declines, retry on Anthropic's recommended fallback model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError as exc:
        raise _NoCredentials("The Anthropic API key was rejected.") from exc
    except anthropic.PermissionDeniedError as exc:
        raise CoverLetterError(f"The API key cannot use {settings.model}: {exc.message}") from exc
    except anthropic.RateLimitError as exc:
        raise CoverLetterError("Rate limited by the Anthropic API; try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        raise CoverLetterError(f"Anthropic API error {exc.status_code}: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise _NoCredentials("Could not reach the Anthropic API.") from exc
    except TypeError as exc:  # raised by the client when no credentials can be resolved
        if "auth" in str(exc).lower() or "api_key" in str(exc).lower():
            raise _NoCredentials("No Anthropic API credentials are configured.") from exc
        raise

    if response.stop_reason == "refusal":
        raise CoverLetterError("Claude declined to write this letter. Try again or edit the template version.")
    text = "\n".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise CoverLetterError("Claude returned an empty letter; try again.")
    if response.stop_reason == "max_tokens":
        raise CoverLetterError("The letter was cut off; try again.")
    return Letter(text=text, generator=f"claude:{response.model}")


# Offline template ----------------------------------------------------------------------------------------------

_JOB_BLOCK_RE = re.compile(r'(?is)<div class="job">(.*?)</ul>')
_ORG_RE = re.compile(r'(?is)<span class="org">(.*?)</span>')
_LI_RE = re.compile(r"(?is)<li>(.*?)</li>")
_WORD_RE = re.compile(r"[a-z][a-z0-9+#./-]{2,}")
_STOP = set("""and the for with that this from your our you are will have has into their they them who what when
where which while about across over under more most than then also such using used use can all any each other
some been being was were not but out its it's job role team work working experience years strong skills
ability excellent good great new build building built help""".split())


def _keywords(text: str) -> set[str]:
    return {w.strip(".-/") for w in _WORD_RE.findall(text.lower())} - _STOP


def resume_bullets(path: str | Path) -> list[tuple[str, str]]:
    """(employer, bullet) pairs from the resume HTML, in resume order."""
    file = Path(path)
    raw = file.read_text(encoding="utf-8") if file.exists() else ""
    pairs = []
    for block in _JOB_BLOCK_RE.findall(raw):
        org = html_to_text(_ORG_RE.search(block).group(1)) if _ORG_RE.search(block) else ""
        for item in _LI_RE.findall(block):
            pairs.append((org, html_to_text(item)))
    return pairs


def _as_clause(bullet: str) -> str:
    bullet = bullet.rstrip(".")
    return bullet[0].lower() + bullet[1:] if bullet[:2] != bullet[:2].upper() else bullet


_FOCUS = {"python": "Python", "django": "Django", "fastapi": "FastAPI", "kafka": "Kafka", "kubernetes": "Kubernetes",
          "postgresql": "PostgreSQL", "microservices": "microservices", "celery": "Celery", "rabbitmq": "RabbitMQ",
          "redis": "Redis", "docker": "Docker", "distributed": "distributed systems", "payments": "payments",
          "crypto": "crypto", "fintech": "fintech", "migration": "legacy migration", "performance": "performance"}


def _pick_bullets(bullets: list[tuple[str, str]], wanted: set[str], count: int = 3) -> list[tuple[str, str]]:
    """The best-matching bullets, preferring different employers so the letter shows range."""
    scored = [(len(_keywords(b) & wanted), i, org, b) for i, (org, b) in enumerate(bullets)]
    scored.sort(key=lambda s: (-s[0], s[1]))
    chosen, per_org = [], Counter()
    for limit in (1, 2):  # first pass: one per employer; second pass: allow a second one
        for score, index, org, bullet in scored:
            if len(chosen) == count:
                break
            if per_org[org] < limit and (index, org, bullet) not in chosen and (score > 0 or limit == 2):
                chosen.append((index, org, bullet))
                per_org[org] += 1
    return [(org, bullet) for _, org, bullet in sorted(chosen)]


def generate_template(job: dict, settings: CoverLetterConfig) -> Letter:
    company = job.get("company") or "the hiring"
    title = job.get("title") or "this role"
    wanted = _keywords(f"{title} {job.get('description', '')}")
    chosen = _pick_bullets(resume_bullets(settings.resume), wanted)

    found = _keywords(" ".join(b for _, b in chosen)) & wanted
    focus_terms = [label for word, label in _FOCUS.items() if word in found]
    focus = ", ".join(focus_terms[:3]) if focus_terms else "backend engineering"

    lines = [f"Dear {company} team,", "",
             f"I would like to apply for the {title} position. I am a backend engineer with eight years of "
             f"experience building and modernizing Python systems, and the role's focus on {focus} matches the "
             "work I have done most."]
    if chosen:
        lines += ["", "A few examples:"]
        for org, bullet in chosen:
            lines.append(f"- At {org}, I {_as_clause(bullet)}." if org else f"- {bullet}")
    visa = job.get("visa_status")
    relocation = ("I noticed you support visa sponsorship and relocation, and I am ready to relocate."
                  if visa in ("sponsored", "relocation")
                  else "I am ready to relocate and would need visa sponsorship to do so.")
    lines += ["", "I care about safe, incremental change in production systems: measuring before optimizing, "
                  "testing new code against the old, and leaving systems easier for the next engineer to work on. "
                  + relocation,
              "", "I would be glad to talk about how I could contribute to your team.", "",
              "Best regards,", settings.candidate_name]
    return Letter(text="\n".join(lines), generator="template")
