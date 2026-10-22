"""One entry point for the AI writing features (cover letters, tailored resumes).

Providers:
* gemini (default): Google Gemini, key from https://aistudio.google.com/apikey in GEMINI_API_KEY.
  Has a free tier with daily limits.
* claude: Anthropic Claude, key in ANTHROPIC_API_KEY. Paid per use.

Callers get `AIUnavailable` when the AI cannot be used at all (no key, rejected key, unsupported region,
package missing, no network), so they can fall back to a template, and `AIError` for problems worth showing
the user (rate limits, overloaded service, blocked or cut-off answers).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import httpx

from .config import WritingConfig

log = logging.getLogger(__name__)

# Tried in order when the configured Gemini model no longer exists (Google retires model names regularly).
GEMINI_FALLBACK_MODELS = ("gemini-flash-latest", "gemini-3-flash-preview", "gemini-2.5-flash")


class AIUnavailable(Exception):
    """The AI cannot be used; fall back to a template."""


class AIError(RuntimeError):
    """The AI was reached but the request failed; show the message to the user."""


@dataclass
class AIResult:
    text: str
    model: str  # "gemini:<model>" or "claude:<model>"


def key_hint(settings: WritingConfig) -> str:
    if settings.provider == "claude":
        return "Set ANTHROPIC_API_KEY to have Claude write it."
    return "Set GEMINI_API_KEY (free at https://aistudio.google.com/apikey) to have Gemini write it."


def generate_text(settings: WritingConfig, system: str, prompt: str, json_schema: dict | None = None) -> AIResult:
    """Send one prompt and return the answer. With `json_schema`, the answer is JSON text matching it."""
    if not settings.use_ai:
        raise AIUnavailable("AI writing is turned off (use_ai: false in config.yaml).")
    if settings.provider == "gemini":
        return _gemini(settings, system, prompt, json_schema)
    if settings.provider == "claude":
        return _claude(settings, system, prompt, json_schema)
    raise AIError(f"Unknown AI provider {settings.provider!r}; use gemini or claude.")


def _gemini(settings: WritingConfig, system: str, prompt: str, json_schema: dict | None) -> AIResult:
    try:
        from google import genai
        from google.genai import errors, types
    except ImportError as exc:
        raise AIUnavailable('The google-genai package is not installed (pip install -e ".[web]").') from exc

    try:
        client = genai.Client()  # reads GEMINI_API_KEY (or GOOGLE_API_KEY)
    except ValueError as exc:
        raise AIUnavailable("No Gemini API key is set.") from exc

    config = types.GenerateContentConfig(
        system_instruction=system,
        temperature=0.6,
        max_output_tokens=8192,
        response_mime_type="application/json" if json_schema else None,
        response_json_schema=json_schema,
    )
    models = list(dict.fromkeys([settings.model or GEMINI_FALLBACK_MODELS[0], *GEMINI_FALLBACK_MODELS]))
    for model in models:
        try:
            response = client.models.generate_content(model=model, contents=prompt, config=config)
        except errors.ClientError as exc:
            text = f"{exc.status or ''} {exc.message or ''}".lower()
            if exc.code == 404:
                log.warning("Gemini model %s not found, trying the next one", model)
                continue
            if exc.code in (401, 403) or "api key" in text:
                raise AIUnavailable("The Gemini API key was rejected.") from exc
            if "location" in text and "not supported" in text:
                raise AIUnavailable("The Gemini API is not available in your region.") from exc
            if exc.code == 429:
                raise AIError("Gemini's free-tier limit is reached. Wait a minute, or until tomorrow if the "
                              "daily limit is used up.") from exc
            raise AIError(f"Gemini rejected the request ({exc.code}): {exc.message}") from exc
        except errors.ServerError as exc:
            raise AIError("Gemini is busy or having problems; try again in a minute.") from exc
        except httpx.TransportError as exc:
            raise AIUnavailable("Could not reach the Gemini API.") from exc

        feedback = response.prompt_feedback
        if feedback is not None and feedback.block_reason:
            raise AIError(f"Gemini blocked the request ({feedback.block_reason}). Try again.")
        candidate = (response.candidates or [None])[0]
        reason = getattr(candidate, "finish_reason", None)
        if reason is not None and str(getattr(reason, "name", reason)) == "MAX_TOKENS":
            raise AIError("Gemini's answer was cut off; try again.")
        text = (response.text or "").strip()
        if not text:
            raise AIError(f"Gemini returned an empty answer ({getattr(reason, 'name', reason)}); try again.")
        return AIResult(text=text, model=f"gemini:{response.model_version or model}")
    raise AIError(f"None of these Gemini models exist any more: {', '.join(models)}. Set ai_writing.model in "
                  "config.yaml to a current model from https://ai.google.dev/gemini-api/docs/models.")


def _claude(settings: WritingConfig, system: str, prompt: str, json_schema: dict | None) -> AIResult:
    try:
        import anthropic
    except ImportError as exc:
        raise AIUnavailable('The anthropic package is not installed (pip install -e ".[claude]").') from exc

    extra = {"output_config": {"effort": settings.effort}}
    if json_schema:
        extra["output_config"]["format"] = {"type": "json_schema", "schema": json_schema}
    try:
        client = anthropic.Anthropic()
        response = client.beta.messages.create(
            model=settings.model or "claude-opus-5-5",
            max_tokens=16000,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            # If a safety classifier declines, retry on Anthropic's recommended fallback model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            **extra,
        )
    except anthropic.AuthenticationError as exc:
        raise AIUnavailable("The Anthropic API key was rejected.") from exc
    except anthropic.PermissionDeniedError as exc:
        raise AIError(f"The API key cannot use {settings.model}: {exc.message}") from exc
    except anthropic.RateLimitError as exc:
        raise AIError("Rate limited by the Anthropic API; try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        raise AIError(f"Anthropic API error {exc.status_code}: {exc.message}") from exc
    except anthropic.APIConnectionError as exc:
        raise AIUnavailable("Could not reach the Anthropic API.") from exc
    except TypeError as exc:  # raised by the client when no credentials can be resolved
        if "auth" in str(exc).lower() or "api_key" in str(exc).lower():
            raise AIUnavailable("No Anthropic API key is set.") from exc
        raise

    if response.stop_reason == "refusal":
        raise AIError("Claude declined this request. Try again.")
    if response.stop_reason == "max_tokens":
        raise AIError("Claude's answer was cut off; try again.")
    text = "\n".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise AIError("Claude returned an empty answer; try again.")
    return AIResult(text=text, model=f"claude:{response.model}")


def parse_json(result: AIResult) -> dict:
    text = result.text.strip()
    if text.startswith("```"):  # tolerate a fenced answer
        text = text.strip("`").removeprefix("json").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise AIError("The AI returned malformed JSON; try again.") from exc
    if not isinstance(data, dict):
        raise AIError("The AI returned an unexpected answer; try again.")
    return data
