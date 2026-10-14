"""Label each transcript segment with who said it.

Speech recognition says *what* was said; this says *who*. It runs sherpa-onnx's
offline speaker diarization on the CPU with two small ungated models (a
pyannote segmentation model and a speaker-embedding model), then gives each
transcript segment the speaker whose turns overlap it most.

Speakers are numbered by first appearance ("Speaker 1", "Speaker 2"), never
guessed to be doctor or patient: that attribution is left to the clinician.
Diarization is optional. If a model, ffmpeg or the package is missing the
transcript is simply left unlabelled and the reason is returned.
"""

import asyncio
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

from ..config import settings

Turn = tuple[float, float, int]  # start s, end s, raw cluster id


class DiarizationUnavailable(RuntimeError):
    """A prerequisite is missing; the pipeline continues without speaker labels."""


def assign_speakers(segments: list[dict], turns: list[Turn]) -> list[dict]:
    """Return copies of `segments` with a `speaker` label from the best-overlapping turn."""
    # Number clusters by when they first speak so labels are stable and readable.
    order: dict[int, str] = {}
    for _, _, cluster in sorted(turns, key=lambda t: t[0]):
        order.setdefault(cluster, f"Speaker {len(order) + 1}")

    out = []
    for seg in segments:
        start, end = seg.get("start"), seg.get("end")
        label = None
        if start is not None and end is not None and end > start:
            overlap: dict[int, float] = {}
            for t_start, t_end, cluster in turns:
                shared = min(end, t_end) - max(start, t_start)
                if shared > 0:
                    overlap[cluster] = overlap.get(cluster, 0.0) + shared
            if overlap:
                label = order[max(overlap, key=overlap.get)]
        out.append({**seg, "speaker": label})
    return out


def _missing_prerequisite() -> str | None:
    if not settings.segmentation_model.is_file():
        return f"segmentation model not found at {settings.segmentation_model}"
    if not settings.embedding_model.is_file():
        return f"speaker embedding model not found at {settings.embedding_model}"
    if shutil.which(settings.ffmpeg_path) is None and not Path(settings.ffmpeg_path).is_file():
        return "ffmpeg not found"
    try:
        import numpy  # noqa: F401
        import sherpa_onnx  # noqa: F401
    except ImportError as exc:
        return f"python package missing: {exc.name}"
    return None


def _to_wav_16k_mono(src: Path, dst: Path) -> None:
    proc = subprocess.run(
        [settings.ffmpeg_path, "-y", "-loglevel", "error", "-i", str(src),
         "-ac", "1", "-ar", "16000", "-f", "wav", str(dst)],
        capture_output=True, text=True, timeout=600,
    )
    if proc.returncode != 0:
        raise DiarizationUnavailable(f"ffmpeg could not read the recording: {proc.stderr.strip()[:200]}")


def _read_samples(path: Path):
    import numpy as np

    with wave.open(str(path), "rb") as w:
        if w.getsampwidth() != 2 or w.getnchannels() != 1:
            raise DiarizationUnavailable("expected 16-bit mono wav after conversion")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def run_diarization(audio: Path) -> list[Turn]:
    """Blocking. Returns speaker turns for the recording."""
    import sherpa_onnx

    with tempfile.TemporaryDirectory(prefix="clinicscribe-diar-") as tmp:
        wav = Path(tmp) / "audio.wav"
        _to_wav_16k_mono(audio, wav)
        samples = _read_samples(wav)

    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(settings.segmentation_model)
            ),
            num_threads=2,
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(settings.embedding_model), num_threads=2
        ),
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=settings.num_speakers if settings.num_speakers > 0 else -1,
            threshold=0.5,
        ),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    if not config.validate():
        raise DiarizationUnavailable("diarization configuration was rejected")

    engine = sherpa_onnx.OfflineSpeakerDiarization(config)
    result = engine.process(samples).sort_by_start_time()
    return [(r.start, r.end, r.speaker) for r in result]


async def label_speakers(audio: Path, segments: list[dict]) -> tuple[list[dict], str | None]:
    """Return (segments, skipped_reason). Never raises for a missing prerequisite."""
    if not settings.diarize:
        return segments, "disabled"
    reason = _missing_prerequisite()
    if reason:
        return segments, reason
    try:
        turns = await asyncio.to_thread(run_diarization, audio)
    except DiarizationUnavailable as exc:
        return segments, str(exc)
    if not turns:
        return segments, "no speech turns detected"
    return assign_speakers(segments, turns), None
