"""Detect visa sponsorship and relocation signals in job text.

Negative statements ("we cannot sponsor visas") are matched first and cut out of the text, so the
words "visa sponsorship" inside a refusal never count as a positive signal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

_NEG = [
    r"(?:no|not|cannot|can ?not|can't|unable to|do not|don't|does not|doesn't|won't|will not|are not able to|is not able to|not able to)"
    r"\s+(?:\w+\s+){0,3}?(?:offer|provide|support|sponsor)\w*\s+(?:\w+\s+){0,3}?(?:visa|sponsorship|work permits?|relocation)",
    r"(?:visa|work permit|immigration)\s+sponsorship\s+(?:is\s+)?(?:not|unavailable|isn't)\s*(?:available|offered|possible|provided)?",
    r"(?:sponsorship|relocation)\s+(?:is\s+)?not\s+(?:available|offered|possible|provided)",
    r"without\s+(?:the\s+need\s+(?:for|of)\s+)?(?:\w+\s+){0,2}?(?:visa\s+)?sponsorship",
    r"no\s+(?:visa\s+)?sponsorship",
    r"(?:must|should|need to|needs to|required to)\s+(?:already\s+)?(?:have|hold|possess|be eligible)\s+(?:\w+\s+){0,4}?"
    r"(?:right to work|work(?:ing)? (?:permit|authori[sz]ation|rights?)|eligib\w+ to work)",
    r"(?:valid|existing|current)\s+(?:eu\s+)?(?:work\s+(?:permit|authori[sz]ation)|right to work)\s+(?:is\s+)?(?:required|mandatory|needed|a must)",
    r"(?:eu|eea|uk|swiss)\s+(?:citizens?|nationals?|passport holders?)\s+only",
    r"only\s+(?:\w+\s+){0,4}?(?:candidates|applicants)\s+(?:\w+\s+){0,6}?(?:right to work|work permit|work authori[sz]ation|eu citizenship)",
    r"(?:right to work|work authori[sz]ation)\s+in\s+(?:the\s+)?[a-z ]{2,20}\s+(?:is\s+)?(?:required|mandatory|needed|essential)",
    r"keine\s+(?:visa|visum|sponsoring|relocation)",
    r"(?:g(?:ü|ue)ltige|bestehende)\s+arbeitserlaubnis\s+(?:ist\s+)?(?:erforderlich|voraussetzung|notwendig)",
]

_SPONSOR = [
    r"visa\s+sponsor(?:ship|ed|ing)?",
    r"sponsor\w*\s+(?:\w+\s+){0,3}?(?:visa|work permit|blue card|immigration)",
    r"(?:eu\s+)?blue\s+card",
    r"blaue\s+karte",
    r"work\s+permit\s+(?:support|assistance|sponsorship)",
    r"(?:visa|immigration)\s+(?:support|assistance|process|application)\s+(?:is\s+)?(?:provided|included|covered|offered)",
    r"(?:we|our team)\s+(?:will\s+|can\s+|do\s+)?(?:support|help|assist)\s+(?:you\s+)?with\s+(?:your\s+)?(?:visa|work permit|immigration)",
    r"(?:visa|immigration)\s+(?:support|assistance|help)",
    r"highly\s+skilled\s+migrant",
    r"kennismigrant",
    r"recogni[sz]ed\s+sponsor",
    r"critical\s+skills\s+employment\s+permit",
    r"skilled\s+worker\s+visa",
    r"visa\s*:\s*yes",
    r"\|\s*(?:onsite\s*\|\s*)?visa\b",  # HN "Who is hiring" style: "Berlin | ONSITE | VISA"
    r"\bvisa\b(?=[^.\n]{0,15}(?:\||$))",
    r"visum(?:sunterst(?:ü|ue)tzung|sponsoring)",
]

_RELOCATION = [
    r"relocation\s+(?:package|support|assistance|bonus|budget|allowance|help|costs?|services?)",
    r"(?:support|help|assist)\w*\s+(?:\w+\s+){0,3}?(?:with\s+)?(?:your\s+)?relocation",
    r"relocation\s+(?:is\s+)?(?:offered|provided|covered|available|possible)",
    r"(?:we|and)\s+(?:will\s+)?(?:pay|cover)\s+(?:for\s+)?(?:your\s+)?relocation",
    r"relocate\s+to\s+(?:[A-Z]\w+|the netherlands|germany)",
    r"umzugs(?:hilfe|unterst(?:ü|ue)tzung|kosten)",
    r"relocation[- ]unterst(?:ü|ue)tzung",
]

_FLAGS = re.IGNORECASE | re.MULTILINE
NEGATIVE_RE = [re.compile(p, _FLAGS) for p in _NEG]
SPONSOR_RE = [re.compile(p, _FLAGS) for p in _SPONSOR]
RELOCATION_RE = [re.compile(p, _FLAGS) for p in _RELOCATION]


@dataclass
class VisaSignals:
    sponsored: bool = False
    relocation: bool = False
    negative: bool = False
    evidence: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        # An explicit offer anywhere in the posting wins over a refusal elsewhere,
        # because postings often say "we sponsor visas; remote candidates must have the right to work in X".
        if self.sponsored:
            return "sponsored"
        if self.negative:
            return "not_offered"
        if self.relocation:
            return "relocation"
        return "unknown"


def _snippet(text: str, match: re.Match, width: int = 60) -> str:
    start = max(match.start() - width, 0)
    end = min(match.end() + width, len(text))
    snippet = " ".join(text[start:end].split())
    return ("…" if start else "") + snippet + ("…" if end < len(text) else "")


def detect(text: str) -> VisaSignals:
    signals = VisaSignals()
    if not text:
        return signals

    remaining = text
    for pattern in NEGATIVE_RE:
        for match in pattern.finditer(remaining):
            signals.negative = True
            signals.evidence.append("✗ " + _snippet(remaining, match))
        remaining = pattern.sub(" ", remaining)

    for pattern in SPONSOR_RE:
        match = pattern.search(remaining)
        if match:
            signals.sponsored = True
            signals.evidence.append("✓ " + _snippet(remaining, match))
            break

    for pattern in RELOCATION_RE:
        match = pattern.search(remaining)
        if match:
            signals.relocation = True
            signals.evidence.append("✓ " + _snippet(remaining, match))
            break

    return signals
