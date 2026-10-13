"""Speech-to-text through VoiceStudio's local, OpenAI-compatible endpoint.

POST {VOICESTUDIO_URL}/v1/audio/transcriptions is documented in VoiceStudio's
docs/speech-platform.md. Whether `verbose_json` returns per-segment timestamps
depends on the selected ASR engine, so `normalise` degrades to one untimed
segment when only plain text comes back.
"""

from pathlib import Path

import httpx

from ..config import settings


def normalise(body: dict) -> list[dict]:
    """Turn an OpenAI-style transcription response into [{start, end, text}]."""
    segments = []
    for seg in body.get("segments") or []:
        text = (seg.get("text") or "").strip()
        if text:
            segments.append(
                {"start": seg.get("start"), "end": seg.get("end"), "text": text}
            )
    if segments:
        return segments
    text = (body.get("text") or "").strip()
    return [{"start": None, "end": None, "text": text}] if text else []


async def transcribe(path: Path, language: str = "") -> list[dict]:
    headers = {}
    if settings.voicestudio_api_key:
        headers["Authorization"] = f"Bearer {settings.voicestudio_api_key}"

    data = {"model": settings.asr_model, "response_format": "verbose_json"}
    language = language or settings.asr_language
    if language:
        data["language"] = language

    url = f"{settings.voicestudio_url.rstrip('/')}/v1/audio/transcriptions"
    async with httpx.AsyncClient(timeout=settings.asr_timeout_s) as client:
        with path.open("rb") as audio:
            resp = await client.post(
                url, headers=headers, data=data, files={"file": (path.name, audio)}
            )
    resp.raise_for_status()
    return normalise(resp.json())
