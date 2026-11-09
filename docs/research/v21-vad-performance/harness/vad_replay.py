#!/usr/bin/env python3
"""Offline replay harness for Daymark's Parakeet speech endpoint detector.

This is a SIMULATION. It re-implements, line for line, the production decision
logic in

  artifacts/weather-app/android/daymark-voice/src/main/java/io/github/
  sami_gor/daymark/voice/SpeechEndpointDetector.java

and the capture loop in ParakeetSpeechRecognitionPlugin.java (20 ms reads,
RMS against a fixed 0.02 threshold, 30 s hard cap). It does NOT run the
Parakeet model and it does NOT produce device evidence. It answers one narrow
question: given an audio waveform, when would the production endpoint detector
end capture, and which settings would truncate the waveform?

Usage:
  python3 vad_replay.py                       # synthetic sweep (no audio needed)
  python3 vad_replay.py --wav-dir DIR         # replay 16 kHz mono PCM16 WAVs
  python3 vad_replay.py --selftest            # WAV round-trip + analytic check
  python3 vad_replay.py --json out.json --csv out.csv

Every number printed is either (a) exact simulation output, or (b) an
explicitly labelled arithmetic derivation. Nothing here is a phone measurement.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import platform
import random
import statistics
import sys
import tempfile
import wave
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterable

import numpy as np

# ---------------------------------------------------------------------------
# Production constants (read from ParakeetSpeechRecognitionPlugin.java, commit
# 3426bb4, branch release/v21-integration). Values are duplicated here on
# purpose: the harness must be runnable without the Android source tree, and a
# diff against the Java file is part of the review.
# ---------------------------------------------------------------------------
SAMPLE_RATE = 16_000
CHUNK_SAMPLES = 320              # 20 ms of audio per read
SPEECH_THRESHOLD = 0.02          # RMS, int16 normalised to +/-1.0
ONSET_MS = 60
HANGOVER_MS = 1500
MAX_CAPTURE_MS = 30_000
AUDIO_CHANNELS = 1               # AudioRecord is mono: 1 PCM short == 1 frame

BASELINE = (ONSET_MS, HANGOVER_MS)
SWEEP_ONSETS = (40, 60, 80)
SWEEP_HANGOVERS = (500, 800, 1000, 1200, 1500)

REPO_COMMIT = "622eff2"


def java_round(value: float) -> int:
    """Java Math.round(double): floor(x + 0.5) for the positive values used here."""
    return int(math.floor(value + 0.5))


# ---------------------------------------------------------------------------
# Literal port of SpeechEndpointDetector.java
# ---------------------------------------------------------------------------
class SpeechEndpointDetector:
    """Faithful port of the production frame-counting endpoint detector.

    Onset must be consecutive (quiet frames reset the run before speech
    starts); once speech has started, quiet frames accumulate and the
    utterance ends when they reach the hangover. Frame counts are the real
    number of PCM frames, not the number of reads.
    """

    def __init__(self, threshold: float, sample_rate: int, onset_ms: int, hangover_ms: int):
        if threshold <= 0.0:
            raise ValueError("threshold must be positive")
        if sample_rate <= 0:
            raise ValueError("sampleRate must be positive")
        if onset_ms <= 0:
            raise ValueError("onsetMs must be positive")
        if hangover_ms <= 0:
            raise ValueError("hangoverMs must be positive")
        self.threshold = threshold
        self.onset_frames = max(1, java_round(sample_rate * (onset_ms / 1000.0)))
        self.hangover_frames = max(1, java_round(sample_rate * (hangover_ms / 1000.0)))
        self.speech_frames = 0
        self.quiet_frames = 0
        self.speech_started = False
        self.finished = False

    def accept(self, root_mean_square: float, frame_count: int) -> bool:
        if frame_count < 0:
            raise ValueError("frameCount must not be negative")
        if frame_count == 0 or self.finished:
            return self.finished
        if root_mean_square >= self.threshold:
            self.speech_frames += frame_count
            self.quiet_frames = 0
            if self.speech_frames >= self.onset_frames:
                self.speech_started = True
            return False
        self.quiet_frames += frame_count
        if not self.speech_started:
            # Onset is consecutive: isolated transients never accumulate.
            self.speech_frames = 0
        if self.speech_started and self.quiet_frames >= self.hangover_frames:
            self.finished = True
            return True
        return False

    def has_speech_started(self) -> bool:
        return self.speech_started

    def is_finished(self) -> bool:
        return self.finished


# ---------------------------------------------------------------------------
# Capture-loop simulation
# ---------------------------------------------------------------------------
@dataclass
class Replay:
    onset_ms: int
    hangover_ms: int
    speech_started: bool
    finished: bool
    reached_limit: bool
    capture_ms: float            # audio duration the mic was (simulated) live
    speech_started_ms: float | None   # capture start -> onset pass
    endpoint_ms: float | None    # capture start -> detector end (== capture_ms)
    last_speech_ms: float | None
    trailing_after_speech_ms: float | None
    truncated_ms: float          # audible speech after the endpoint (lost)
    truncated: bool
    status: str                  # ok | truncated | no-speech | cap
    stopped_in_pause_ms: float | None


def frame_rms(block: np.ndarray, pcm16: bool) -> float:
    if len(block) == 0:
        return 0.0
    values = block.astype(np.float64) / 32768.0 if pcm16 else block.astype(np.float64)
    return float(math.sqrt(float(np.mean(values * values))))


def replay(
    samples: np.ndarray,
    speech_regions: list[tuple[int, int]] | None = None,
    onset_ms: int = ONSET_MS,
    hangover_ms: int = HANGOVER_MS,
    threshold: float = SPEECH_THRESHOLD,
    sample_rate: int = SAMPLE_RATE,
    chunk: int = CHUNK_SAMPLES,
    cap_ms: int = MAX_CAPTURE_MS,
    pcm16: bool = False,
    pad_silence_to_cap: bool = True,
) -> Replay:
    """Replay one waveform through the production detector and capture loop.

    ``speech_regions`` is ground truth from the generated signal (sample
    indices of audible speech), used only to score truncation. When replaying
    a real WAV, pass ``None`` and use ``estimate_speech_regions``.
    """
    detector = SpeechEndpointDetector(threshold, sample_rate, onset_ms, hangover_ms)
    total = len(samples)
    position = 0
    started_at: int | None = None
    ended_at: int | None = None
    reached_limit = False
    cap_samples = int(round(cap_ms / 1000.0 * sample_rate))

    while True:
        if position >= total:
            if not pad_silence_to_cap or position >= cap_samples:
                break
            block = np.zeros(min(chunk, cap_samples - position), dtype=np.float64)
        else:
            block = samples[position:position + chunk]
        if len(block) == 0:
            break
        position += len(block)
        rms = frame_rms(block, pcm16)
        if detector.accept(rms, len(block)):
            ended_at = position
            break
        if started_at is None and detector.has_speech_started():
            started_at = position
        if position / sample_rate * 1000.0 >= cap_ms:
            reached_limit = True
            break
        if position >= total and (not pad_silence_to_cap or position >= cap_samples):
            break

    capture_samples = ended_at if ended_at is not None else position
    capture_ms = capture_samples / sample_rate * 1000.0
    last_speech = None
    trailing = None
    truncated_ms = 0.0
    stopped_in_pause = None
    if speech_regions:
        clipped_end = min(capture_samples, total)
        last_speech = max(end for _, end in speech_regions) / sample_rate * 1000.0
        if ended_at is not None:
            trailing = (capture_samples - max(end for _, end in speech_regions)) / sample_rate * 1000.0
        # Audible speech that the detector never captured (or cut off).
        for start, end in speech_regions:
            if end <= clipped_end:
                continue
            lost_start = max(start, clipped_end)
            truncated_ms += (end - lost_start) / sample_rate * 1000.0
        if ended_at is not None:
            for start, end in speech_regions:
                if start < capture_samples < end:
                    stopped_in_pause = 0.0  # endpoint inside a speech region
                elif start >= capture_samples:
                    # Endpoint landed in a silence gap after this speech ends.
                    pass

    if not detector.has_speech_started():
        status = "no-speech"
    elif reached_limit:
        status = "cap"
    elif truncated_ms > 0.0:
        status = "truncated"
    else:
        status = "ok"

    return Replay(
        onset_ms=onset_ms,
        hangover_ms=hangover_ms,
        speech_started=detector.has_speech_started(),
        finished=detector.is_finished(),
        reached_limit=reached_limit,
        capture_ms=round(capture_ms, 1),
        speech_started_ms=round(started_at / sample_rate * 1000.0, 1) if started_at else None,
        endpoint_ms=round(capture_ms, 1) if ended_at is not None else None,
        last_speech_ms=round(last_speech, 1) if last_speech is not None else None,
        trailing_after_speech_ms=round(trailing, 1) if trailing is not None else None,
        truncated_ms=round(truncated_ms, 1),
        truncated=truncated_ms > 0.0,
        status=status,
        stopped_in_pause_ms=stopped_in_pause,
    )


# ---------------------------------------------------------------------------
# Signal generation (deterministic, seeded)
# ---------------------------------------------------------------------------
def steady_voice(duration_s: float, level: float, sample_rate: int = SAMPLE_RATE, f0: float = 128.0) -> np.ndarray:
    """Deterministic harmonic complex with a stable per-frame RMS.

    Close enough to voiced speech for a threshold gate, and stable enough that
    the detector decision depends on level and timing, not on random frame
    energy. Used for the controlled scenarios.
    """
    n = int(round(duration_s * sample_rate))
    t = np.arange(n, dtype=np.float64) / sample_rate
    signal = np.zeros(n, dtype=np.float64)
    for harmonic in range(1, 13):
        signal += np.sin(2 * math.pi * f0 * harmonic * t + 0.7 * harmonic) / (harmonic ** 1.15)
    signal /= math.sqrt(float(np.mean(signal * signal))) + 1e-12
    return signal * level


def noise_floor(duration_s: float, level: float, rng: random.Random, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Low-passed noise at a controlled RMS (room tone / background)."""
    n = int(round(duration_s * sample_rate))
    raw = np.array([rng.gauss(0.0, 1.0) for _ in range(n)], dtype=np.float64)
    kernel = np.ones(9, dtype=np.float64) / 9.0
    shaped = np.convolve(raw, kernel, mode="same")
    shaped /= math.sqrt(float(np.mean(shaped * shaped))) + 1e-12
    return shaped * level


def syllabic_speech(duration_s: float, level: float, rng: random.Random, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Speech-like envelope: harmonic source with 4-5 Hz syllable modulation.

    Used only as a realism check; the controlled scenarios above are the
    primary evidence because their ground truth is exact.
    """
    n = int(round(duration_s * sample_rate))
    t = np.arange(n, dtype=np.float64) / sample_rate
    f0 = 115.0 + 18.0 * np.sin(2 * math.pi * 0.6 * t + 0.3)
    phase = 2 * math.pi * np.cumsum(f0) / sample_rate
    signal = np.zeros(n, dtype=np.float64)
    for harmonic in range(1, 13):
        signal += np.sin(harmonic * phase + 0.5 * harmonic) / (harmonic ** 1.1)
    syllable = 0.55 + 0.45 * np.sin(2 * math.pi * 4.4 * t + 0.9 * np.sin(2 * math.pi * 0.8 * t))
    jitter = 1.0 + 0.05 * np.sin(2 * math.pi * 0.27 * t)
    signal *= syllable * jitter
    signal /= math.sqrt(float(np.mean(signal * signal))) + 1e-12
    return signal * level


@dataclass
class Scenario:
    name: str
    group: str
    description: str
    samples: np.ndarray
    speech_regions: list[tuple[int, int]]
    pcm16: bool = False


def build_synthetic_scenarios(sample_rate: int = SAMPLE_RATE) -> list[Scenario]:
    rng = random.Random(20261108)
    floor_level = 0.0015
    lead_s = 0.5
    tail_s = 3.0
    scenarios: list[Scenario] = []

    def add(name: str, group: str, description: str, parts: list[tuple[str, float, float]]) -> None:
        """parts: (kind, seconds, level) where kind is silence|voice|noise."""
        chunks: list[np.ndarray] = []
        regions: list[tuple[int, int]] = []
        cursor = 0
        for kind, seconds, level in parts:
            if kind == "voice":
                block = steady_voice(seconds, level, sample_rate)
                regions.append((cursor, cursor + len(block)))
            elif kind == "syllabic":
                block = syllabic_speech(seconds, level, rng, sample_rate)
                regions.append((cursor, cursor + len(block)))
            elif kind == "noise":
                block = noise_floor(seconds, level, rng, sample_rate)
            else:
                block = noise_floor(seconds, floor_level, rng, sample_rate)
            chunks.append(block)
            cursor += len(block)
        scenarios.append(Scenario(name, group, description, np.concatenate(chunks), regions))

    # A. Continuous utterances: the endpoint delay is exactly the hangover.
    for speech_s in (2.0, 4.0):
        add(
            f"continuous_{speech_s:.0f}s",
            "endpoint",
            f"{speech_s:.0f}s continuous speech, 0.5s lead-in, 3s tail",
            [("silence", lead_s, 0), ("voice", speech_s, 0.08), ("silence", tail_s, 0)],
        )

    # B. Internal pause tolerance: speech - pause - speech.
    for pause_ms in (300, 400, 500, 600, 700, 800, 900, 1000, 1200):
        add(
            f"pause_{pause_ms}ms",
            "pause",
            f"1.5s speech, {pause_ms}ms pause, 1.5s speech",
            [
                ("silence", lead_s, 0),
                ("voice", 1.5, 0.08),
                ("silence", pause_ms / 1000.0, 0),
                ("voice", 1.5, 0.08),
                ("silence", tail_s, 0),
            ],
        )

    # C. Short isolated utterances (weather answers such as "rain" / "yes").
    for dur_ms in (200, 300, 500, 800):
        add(
            f"short_{dur_ms}ms",
            "short",
            f"{dur_ms}ms isolated word, 0.5s lead-in, 3s tail",
            [("silence", lead_s, 0), ("voice", dur_ms / 1000.0, 0.08), ("silence", tail_s, 0)],
        )

    # D. Staccato bursts: minimum isolated burst that can pass onset.
    for burst_ms in (40, 60, 80, 120):
        parts: list[tuple[str, float, float]] = [("silence", lead_s, 0)]
        for _ in range(3):
            parts.append(("voice", burst_ms / 1000.0, 0.08))
            parts.append(("silence", 0.12, 0))
        parts.append(("silence", tail_s, 0))
        add(
            f"burst_{burst_ms}ms",
            "staccato",
            f"three {burst_ms}ms bursts separated by 120ms, 0.5s lead-in",
            parts,
        )

    # E. Quiet speech: fixed threshold, level swept around 0.02.
    for level in (0.008, 0.012, 0.016, 0.018, 0.019, 0.025, 0.040):
        add(
            f"quiet_{int(round(level * 1000)):03d}",
            "quiet",
            f"2s speech at RMS {level:.3f} ({20 * math.log10(level):.1f} dBFS)",
            [("silence", lead_s, 0), ("voice", 2.0, level), ("silence", 4.0, 0)],
        )

    # F. Noise behaviour of a fixed amplitude gate.
    add(
        "noise_then_speech",
        "noise",
        "0.5s background noise at RMS 0.03, 2.5s quiet, then 1.5s speech",
        [("noise", 0.5, 0.03), ("silence", 2.5, 0), ("voice", 1.5, 0.08), ("silence", tail_s, 0)],
    )
    add(
        "speech_then_noise",
        "noise",
        "2s speech, then continuous background noise at RMS 0.03",
        [("silence", lead_s, 0), ("voice", 2.0, 0.08), ("noise", 32.0, 0.03)],
    )
    add(
        "noisy_speech",
        "noise",
        "2s speech over continuous background noise at RMS 0.03",
        [("noise", lead_s + 2.0 + 2.0, 0.03), ("voice", 2.0, 0.08), ("noise", 30.0, 0.03)],
    )

    # G. Speech-like envelope, as a realism check.
    add(
        "quiet_tail",
        "realistic",
        "2s speech at RMS 0.08, then a 2.5s continuation at RMS 0.015 (below the gate)",
        [("silence", lead_s, 0), ("voice", 2.0, 0.08), ("voice", 2.5, 0.015), ("silence", tail_s, 0)],
    )
    add(
        "syllabic_3s",
        "realistic",
        "3s syllabic speech-like signal at RMS 0.08",
        [("silence", lead_s, 0), ("syllabic", 3.0, 0.08), ("silence", tail_s, 0)],
    )
    add(
        "syllabic_quiet",
        "realistic",
        "3s syllabic speech-like signal at RMS 0.035",
        [("silence", lead_s, 0), ("syllabic", 3.0, 0.035), ("silence", tail_s, 0)],
    )
    return scenarios


# ---------------------------------------------------------------------------
# WAV support
# ---------------------------------------------------------------------------
def read_wav_pcm16(path: str) -> tuple[np.ndarray, int]:
    with wave.open(path, "rb") as handle:
        channels = handle.getnchannels()
        width = handle.getsampwidth()
        rate = handle.getframerate()
        frames = handle.getnframes()
        if channels != 1:
            raise ValueError(f"{path}: expected mono, got {channels} channels")
        if width != 2:
            raise ValueError(f"{path}: expected 16-bit PCM, got {width * 8}-bit")
        if rate != SAMPLE_RATE:
            raise ValueError(f"{path}: expected {SAMPLE_RATE} Hz, got {rate} Hz (no resampling in this harness)")
        raw = handle.readframes(frames)
    samples = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    return samples, rate


def write_wav_pcm16(path: str, samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
    clipped = np.clip(samples, -1.0, 1.0)
    pcm = np.round(clipped * 32767.0).astype("<i2")
    with wave.open(path, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())


def estimate_speech_regions(samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> list[tuple[int, int]]:
    """Energy-based audible-speech estimate for real WAVs.

    Independent of the detector's own threshold: frames must reach 10% of the
    95th-percentile frame RMS (and at least 0.004) for two consecutive frames.
    This is an estimate, not a transcript alignment; recorded as a limitation.
    """
    block = 320
    rms_values = []
    for start in range(0, len(samples), block):
        chunk = samples[start:start + block]
        if len(chunk) == 0:
            break
        rms_values.append((start, frame_rms(chunk, pcm16=False)))
    if not rms_values:
        return []
    levels = np.array([value for _, value in rms_values])
    audible = max(0.004, float(np.percentile(levels, 95)) * 0.10)
    regions: list[tuple[int, int]] = []
    run_start: int | None = None
    last_end = 0
    for index, (start, value) in enumerate(rms_values):
        if value >= audible:
            if run_start is None:
                run_start = start
            last_end = start + min(block, len(samples) - start)
        else:
            if run_start is not None:
                # Bridge gaps of up to 100 ms (5 frames) inside a word.
                upcoming = levels[index:index + 5]
                if len(upcoming) and float(np.max(upcoming)) >= audible:
                    continue
                regions.append((run_start, last_end))
                run_start = None
    if run_start is not None:
        regions.append((run_start, last_end))
    return regions


# ---------------------------------------------------------------------------
# Sweep / reporting
# ---------------------------------------------------------------------------
def run_sweep(scenarios: Iterable[Scenario], onsets: Iterable[int], hangovers: Iterable[int]) -> list[dict]:
    rows: list[dict] = []
    for scenario in scenarios:
        for onset in onsets:
            for hangover in hangovers:
                result = replay(
                    scenario.samples,
                    speech_regions=scenario.speech_regions,
                    onset_ms=onset,
                    hangover_ms=hangover,
                    pcm16=scenario.pcm16,
                )
                rows.append({
                    "scenario": scenario.name,
                    "group": scenario.group,
                    "onset_ms": onset,
                    "hangover_ms": hangover,
                    "speech_started": result.speech_started,
                    "speech_started_ms": result.speech_started_ms,
                    "capture_ms": result.capture_ms,
                    "endpoint_ms": result.endpoint_ms,
                    "last_speech_ms": result.last_speech_ms,
                    "trailing_after_speech_ms": result.trailing_after_speech_ms,
                    "truncated": result.truncated,
                    "truncated_ms": result.truncated_ms,
                    "status": result.status,
                    "reached_limit": result.reached_limit,
                })
    return rows


def fmt(value, digits=0) -> str:
    if value is None:
        return "-"
    return f"{value:.{digits}f}" if isinstance(value, float) else str(value)


def scenario_matrix_md(rows: list[dict], onset: int, hangover: int, groups: Iterable[str]) -> str:
    selected = [r for r in rows if r["onset_ms"] == onset and r["hangover_ms"] == hangover and r["group"] in groups]
    lines = [
        "| Scenario | Group | Captured (ms) | Started (ms) | Trailing after speech (ms) | Lost speech (ms) | Status |",
        "|---|---|---:|---:|---:|---:|---|",
    ]
    for row in selected:
        lines.append(
            f"| {row['scenario']} | {row['group']} | {fmt(row['capture_ms'])} | "
            f"{fmt(row['speech_started_ms'], 1)} | {fmt(row['trailing_after_speech_ms'], 1)} | "
            f"{fmt(row['truncated_ms'], 1)} | {row['status']} |"
        )
    return "\n".join(lines)


def pause_matrix_md(rows: list[dict], hangovers: Iterable[int]) -> str:
    hangovers = list(hangovers)
    pauses = sorted({int(r["scenario"].split("_")[1].replace("ms", "")) for r in rows if r["group"] == "pause"})
    header = "| Pause between clauses | " + " | ".join(f"hangover {h} ms" for h in hangovers) + " |"
    lines = [header, "|---|" + "|".join(["---:"] * len(hangovers)) + "|"]
    for pause in pauses:
        cells = []
        for hangover in hangovers:
            row = next(
                r for r in rows
                if r["scenario"] == f"pause_{pause}ms" and r["onset_ms"] == 60 and r["hangover_ms"] == hangover
            )
            if row["truncated"]:
                cells.append(f"TRUNCATED (-{row['truncated_ms']:.0f} ms)")
            elif row["status"] == "ok":
                cells.append("complete")
            else:
                cells.append(row["status"])
        lines.append(f"| {pause} ms | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def onset_matrix_md(rows: list[dict], onsets: Iterable[int]) -> str:
    onsets = list(onsets)
    names = [f"burst_{ms}ms" for ms in (40, 60, 80, 120)] + [f"short_{ms}ms" for ms in (200, 300, 500, 800)]
    lines = [
        "| Signal | " + " | ".join(f"onset {o} ms" for o in onsets) + " |",
        "|---|" + "|".join(["---"] * len(onsets)) + "|",
    ]
    for name in names:
        cells = []
        for onset in onsets:
            row = next(
                r for r in rows
                if r["scenario"] == name and r["onset_ms"] == onset and r["hangover_ms"] == 1500
            )
            if not row["speech_started"]:
                cells.append("no speech")
            elif name.startswith("burst"):
                cells.append("starts" if row["truncated_ms"] == 0 else "starts (trunc)")
            else:
                cells.append(f"starts @ {row['speech_started_ms']:.0f} ms")
        lines.append(f"| {name} | " + " | ".join(cells) + " |")
    return "\n".join(lines)


def scorecard_md(rows: list[dict], onsets: Iterable[int], hangovers: Iterable[int]) -> str:
    lines = [
        "| Onset | Hangover | Capture saving vs baseline (2 s utterance) | Endpoint delay after speech | Largest internal pause kept | Pauses truncated (of 9) | Other truncations | No-speech scenarios | 30 s cap hit |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for onset in onsets:
        for hangover in hangovers:
            subset = [r for r in rows if r["onset_ms"] == onset and r["hangover_ms"] == hangover]
            continuous = next(r for r in subset if r["scenario"] == "continuous_2s")
            baseline_continuous = next(
                r for r in rows if r["scenario"] == "continuous_2s" and r["onset_ms"] == 60 and r["hangover_ms"] == 1500
            )
            saving = baseline_continuous["capture_ms"] - continuous["capture_ms"]
            delay = continuous["trailing_after_speech_ms"]
            kept = []
            for pause in (300, 400, 500, 600, 700, 800, 900, 1000, 1200):
                row = next(r for r in subset if r["scenario"] == f"pause_{pause}ms")
                if not row["truncated"]:
                    kept.append(pause)
            pause_truncated = sum(1 for r in subset if r["truncated"] and r["group"] == "pause")
            other_truncated = sum(1 for r in subset if r["truncated"] and r["group"] != "pause")
            no_speech = sum(1 for r in subset if r["status"] == "no-speech")
            cap = sum(1 for r in subset if r["reached_limit"])
            lines.append(
                f"| {onset} ms | {hangover} ms | {saving:+.0f} ms | {delay:.0f} ms | "
                f"{max(kept) if kept else 'none'} ms | {pause_truncated} | {other_truncated} | {no_speech} | {cap} |"
            )
    return "\n".join(lines)


def quiet_table_md(rows: list[dict]) -> str:
    levels = sorted({r["scenario"] for r in rows if r["group"] == "quiet"})
    lines = ["| Signal | RMS (dBFS) | Detected? | Capture (ms) | Outcome |", "|---|---:|---|---:|---|"]
    for name in levels:
        row = next(r for r in rows if r["scenario"] == name and r["onset_ms"] == 60 and r["hangover_ms"] == 1500)
        level = int(name.split("_")[1]) / 1000.0
        lines.append(
            f"| {name} | {20 * math.log10(level):.1f} | {'yes' if row['speech_started'] else 'no'} | "
            f"{row['capture_ms']:.0f} | {row['status']} |"
        )
    return "\n".join(lines)


def noise_table_md(rows: list[dict]) -> str:
    names = ["noise_then_speech", "speech_then_noise", "noisy_speech"]
    lines = ["| Scenario | Detected? | Capture (ms) | Lost speech (ms) | Outcome |", "|---|---|---:|---:|---|"]
    for name in names:
        row = next(r for r in rows if r["scenario"] == name and r["onset_ms"] == 60 and r["hangover_ms"] == 1500)
        lines.append(
            f"| {name} | {'yes' if row['speech_started'] else 'no'} | {row['capture_ms']:.0f} | "
            f"{row['truncated_ms']:.0f} | {row['status']} |"
        )
    return "\n".join(lines)


def decode_input_md(rows: list[dict]) -> str:
    lines = [
        "| Setting | Captured audio for a 2 s utterance | Of which trailing silence | Endpoint delay after speech |",
        "|---|---:|---:|---:|",
    ]
    for onset, hangover in [(60, 500), (60, 800), (60, 1000), (60, 1200), (60, 1500)]:
        row = next(
            r for r in rows
            if r["scenario"] == "continuous_2s" and r["onset_ms"] == onset and r["hangover_ms"] == hangover
        )
        trailing = row["trailing_after_speech_ms"] or 0.0
        lines.append(
            f"| onset {onset} / hangover {hangover} | {row['capture_ms']:.0f} ms | {trailing:.0f} ms | {trailing:.0f} ms |"
        )
    return "\n".join(lines)


def trailing_share_md() -> str:
    """Exact simulation: how much of the captured audio is trailing silence."""
    lines = [
        "| Speech duration | Hangover | Captured audio | Trailing silence | Trailing share |",
        "|---:|---:|---:|---:|---:|",
    ]
    for speech_s in (1.0, 2.0, 3.0, 5.0):
        samples = np.concatenate([
            steady_voice(speech_s, 0.08),
            np.zeros(int(3.0 * SAMPLE_RATE), dtype=np.float64),
        ])
        regions = [(0, int(speech_s * SAMPLE_RATE))]
        for hangover in (800, 1000, 1200, 1500):
            result = replay(samples, regions, onset_ms=60, hangover_ms=hangover)
            captured = result.capture_ms
            lines.append(
                f"| {speech_s:.0f} s | {hangover} ms | {captured:.0f} ms | {hangover} ms | "
                f"{hangover / captured * 100:.0f}% |"
            )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Differential check against the production Java class
# ---------------------------------------------------------------------------
def block_sequence(samples: np.ndarray, chunk: int = CHUNK_SAMPLES, pcm16: bool = False) -> list[tuple[float, int]]:
    blocks: list[tuple[float, int]] = []
    for start in range(0, len(samples), chunk):
        piece = samples[start:start + chunk]
        if len(piece) == 0:
            continue
        blocks.append((frame_rms(piece, pcm16), len(piece)))
    return blocks


def step_detector_blocks(blocks: list[tuple[float, int]], onset_ms: int, hangover_ms: int) -> tuple[int, int, bool]:
    detector = SpeechEndpointDetector(SPEECH_THRESHOLD, SAMPLE_RATE, onset_ms, hangover_ms)
    started_at = -1
    finished_at = -1
    for index, (rms, frames) in enumerate(blocks):
        if detector.accept(rms, frames):
            finished_at = index
            break
        if started_at < 0 and detector.has_speech_started():
            started_at = index
    return started_at, finished_at, detector.has_speech_started()


def crosscheck(source_detector: str, scenarios: list[Scenario]) -> int:
    """Compile the real SpeechEndpointDetector and compare decisions block by block."""
    import shutil
    import subprocess

    if shutil.which("javac") is None or shutil.which("java") is None:
        print("crosscheck SKIPPED: no javac/java on PATH", file=sys.stderr)
        return 0
    if not os.path.isfile(source_detector):
        print(f"crosscheck SKIPPED: {source_detector} not found", file=sys.stderr)
        return 0
    probe_source = os.path.join(os.path.dirname(os.path.abspath(__file__)), "java_probe", "EndpointProbe.java")
    settings = [(60, hangover) for hangover in SWEEP_HANGOVERS]
    mismatches = 0
    checks = 0
    with tempfile.TemporaryDirectory() as tmp:
        compile_result = subprocess.run(
            ["javac", "-d", tmp, source_detector, probe_source],
            capture_output=True, text=True,
        )
        if compile_result.returncode != 0:
            print(f"crosscheck SKIPPED: javac failed\n{compile_result.stderr}", file=sys.stderr)
            return 0
        for scenario in scenarios:
            blocks = block_sequence(scenario.samples)
            stream_path = os.path.join(tmp, "blocks.csv")
            with open(stream_path, "w", encoding="utf-8") as handle:
                for rms, frames in blocks:
                    handle.write(f"{rms:.9f},{frames}\n")
            for onset, hangover in settings:
                py_started, py_finished, py_has = step_detector_blocks(blocks, onset, hangover)
                java_result = subprocess.run(
                    ["java", "-cp", tmp, "io.github.sami_gor.daymark.voice.EndpointProbe", str(SPEECH_THRESHOLD), str(SAMPLE_RATE),
                     str(onset), str(hangover), stream_path],
                    capture_output=True, text=True,
                )
                if java_result.returncode != 0:
                    print(f"crosscheck FAILED to run probe: {java_result.stderr}", file=sys.stderr)
                    return 1
                java_started, java_finished, java_has = (int(value) for value in java_result.stdout.split())
                checks += 1
                if (py_started, py_finished, py_has) != (java_started, java_finished, java_has):
                    mismatches += 1
                    print(
                        f"MISMATCH {scenario.name} onset={onset} hangover={hangover}: "
                        f"python=({py_started},{py_finished},{py_has}) java=({java_started},{java_finished},{java_has})"
                    )
    print(f"crosscheck: {checks} scenario/setting comparisons against the Java class, {mismatches} mismatches")
    return mismatches


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------
def selftest() -> int:
    failures = 0
    # 1. Literal algorithm checks mirroring SpeechEndpointDetectorTest.java.
    detector = SpeechEndpointDetector(0.02, 16000, 60, 1500)
    assert not detector.accept(0.2, 959)
    assert not detector.has_speech_started()
    assert not detector.accept(0.2, 1)
    assert detector.has_speech_started()

    detector = SpeechEndpointDetector(0.02, 16000, 60, 1500)
    for _ in range(3):
        detector.accept(0.2, 320)
        for _ in range(50):
            detector.accept(0.001, 320)
    assert not detector.has_speech_started(), "isolated blips must not start"

    detector = SpeechEndpointDetector(0.02, 16000, 60, 1500)
    detector.accept(0.2, 4800)
    for _ in range(74):
        detector.accept(0.001, 320)  # 1480 ms quiet
    assert not detector.is_finished()
    detector.accept(0.001, 320)      # 1500 ms exactly
    assert detector.is_finished()

    # 2. Analytic capture: 2 s speech + 1.5 s hangover, 20 ms reads.
    samples = np.concatenate([
        steady_voice(2.0, 0.08),
        np.zeros(int(3.0 * SAMPLE_RATE), dtype=np.float64),
    ])
    result = replay(samples, speech_regions=[(0, 2 * SAMPLE_RATE)])
    expected = 2000 + 1500
    if abs(result.capture_ms - expected) > 1e-6:
        print(f"FAIL capture timing: {result.capture_ms} != {expected}")
        failures += 1

    # 3. WAV round-trip: writing and replaying the same signal must agree.
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "selftest.wav")
        write_wav_pcm16(path, samples)
        loaded, rate = read_wav_pcm16(path)
        wav_result = replay(loaded, speech_regions=[(0, 2 * SAMPLE_RATE)])
        if abs(wav_result.capture_ms - expected) > 20.0:
            print(f"FAIL wav round-trip: {wav_result.capture_ms} != {expected}")
            failures += 1
        print(f"selftest wav: capture={wav_result.capture_ms:.0f} ms expected={expected} ms")

    # 4. Truncation: 600 ms pause must be lost at hangover 500 but kept at 1500.
    pause = np.concatenate([
        steady_voice(1.5, 0.08),
        np.zeros(int(0.6 * SAMPLE_RATE), dtype=np.float64),
        steady_voice(1.5, 0.08),
        np.zeros(int(2.0 * SAMPLE_RATE), dtype=np.float64),
    ])
    regions = [(0, int(1.5 * SAMPLE_RATE)),
               (int(2.1 * SAMPLE_RATE), int(3.6 * SAMPLE_RATE))]
    short = replay(pause, regions, onset_ms=60, hangover_ms=500)
    long = replay(pause, regions, onset_ms=60, hangover_ms=1500)
    if not (short.truncated and short.truncated_ms > 1400):
        print(f"FAIL expected truncation at 500 ms hangover, got {short}")
        failures += 1
    if long.truncated or long.status != "ok":
        print(f"FAIL expected complete capture at 1500 ms hangover, got {long}")
        failures += 1

    if failures:
        print(f"selftest FAILED ({failures})")
        return 1
    print("selftest PASS: detector port, capture timing, WAV round-trip, truncation")
    return 0


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(description="Replay Daymark's endpoint detector offline (simulation).")
    parser.add_argument("--wav-dir", help="directory of 16 kHz mono PCM16 WAVs to replay")
    parser.add_argument("--selftest", action="store_true", help="run internal consistency checks")
    parser.add_argument("--crosscheck", action="store_true", help="compare the port with the production Java detector")
    parser.add_argument(
        "--source",
        default=os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "..", "..", "..", "..", "artifacts", "weather-app", "android", "daymark-voice",
            "src", "main", "java", "io", "github", "sami_gor", "daymark", "voice", "SpeechEndpointDetector.java",
        ),
        help="path to the production SpeechEndpointDetector.java for --crosscheck",
    )
    parser.add_argument("--json", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results", "sweep.json"))
    parser.add_argument("--csv", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results", "sweep.csv"))
    parser.add_argument("--tables", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results", "tables.md"))
    parser.add_argument("--quiet", action="store_true", help="suppress the markdown tables on stdout")
    args = parser.parse_args()

    if args.selftest:
        return selftest()

    if args.crosscheck:
        scenarios = build_synthetic_scenarios()
        mismatches = crosscheck(os.path.abspath(args.source), scenarios)
        return 0 if mismatches == 0 else 1

    rows: list[dict] = []
    wav_summary: list[dict] = []
    if args.wav_dir:
        wav_paths = sorted(
            os.path.join(args.wav_dir, name)
            for name in os.listdir(args.wav_dir)
            if name.lower().endswith(".wav")
        )
        if not wav_paths:
            print(f"no WAVs found in {args.wav_dir}; synthetic sweep only", file=sys.stderr)
        for path in wav_paths:
            samples, rate = read_wav_pcm16(path)
            regions = estimate_speech_regions(samples, rate)
            base = replay(samples, regions, onset_ms=60, hangover_ms=1500)
            wav_row = {
                "file": os.path.basename(path),
                "duration_ms": round(len(samples) / rate * 1000.0, 1),
                "audible_speech_ms": round(sum(end - start for start, end in regions) / rate * 1000.0, 1),
                "baseline_capture_ms": base.capture_ms,
                "baseline_status": base.status,
                "baseline_truncated_ms": base.truncated_ms,
            }
            for onset, hangover in [(o, h) for o in SWEEP_ONSETS for h in SWEEP_HANGOVERS]:
                result = replay(samples, regions, onset_ms=onset, hangover_ms=hangover)
                rows.append({
                    "scenario": os.path.basename(path),
                    "group": "wav",
                    "onset_ms": onset,
                    "hangover_ms": hangover,
                    "speech_started": result.speech_started,
                    "speech_started_ms": result.speech_started_ms,
                    "capture_ms": result.capture_ms,
                    "endpoint_ms": result.endpoint_ms,
                    "last_speech_ms": result.last_speech_ms,
                    "trailing_after_speech_ms": result.trailing_after_speech_ms,
                    "truncated": result.truncated,
                    "truncated_ms": result.truncated_ms,
                    "status": result.status,
                    "reached_limit": result.reached_limit,
                })
            wav_summary.append(wav_row)
    else:
        scenarios = build_synthetic_scenarios()
        rows = run_sweep(scenarios, SWEEP_ONSETS, SWEEP_HANGOVERS)

    # Persist machine-readable results, including environment and provenance.
    payload = {
        "kind": "simulation",
        "generated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "repo_commit": REPO_COMMIT,
        "python": sys.version.split()[0],
        "numpy": np.__version__,
        "platform": platform.platform(),
        "constants": {
            "sample_rate": SAMPLE_RATE,
            "chunk_samples": CHUNK_SAMPLES,
            "threshold": SPEECH_THRESHOLD,
            "onset_ms": ONSET_MS,
            "hangover_ms": HANGOVER_MS,
            "max_capture_ms": MAX_CAPTURE_MS,
        },
        "sweep": {"onsets_ms": list(SWEEP_ONSETS), "hangovers_ms": list(SWEEP_HANGOVERS)},
        "rows": rows,
        "wav_summary": wav_summary,
        "caveat": "Synthetic/envelope replay only. Not device evidence. No Parakeet decode is run.",
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.json)), exist_ok=True)
    with open(args.json, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    with open(args.csv, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()) if rows else ["scenario"])
        writer.writeheader()
        writer.writerows(rows)

    sections: list[str] = []
    if not args.wav_dir:
        sections.append("## Baseline (production: onset 60 ms, hangover 1500 ms)\n\n" +
                        scenario_matrix_md(rows, 60, 1500, ["endpoint", "pause", "short", "staccato", "noise", "realistic"]))
        sections.append("## Pause tolerance by hangover (onset 60 ms)\n\n" + pause_matrix_md(rows, SWEEP_HANGOVERS))
        sections.append("## Onset sensitivity (hangover 1500 ms)\n\n" + onset_matrix_md(rows, SWEEP_ONSETS))
        sections.append("## Setting scorecard\n\n" + scorecard_md(rows, SWEEP_ONSETS, SWEEP_HANGOVERS))
        sections.append("## Captured audio and trailing silence\n\n" + decode_input_md(rows))
        sections.append("## Trailing-silence share of captured audio\n\n" + trailing_share_md())
        sections.append("## Quiet speech (fixed 0.02 threshold)\n\n" + quiet_table_md(rows))
        sections.append("## Background noise (fixed 0.02 threshold)\n\n" + noise_table_md(rows))
    else:
        sections.append("\n".join(
            f"| {w['file']} | {w['duration_ms']:.0f} | {w['audible_speech_ms']:.0f} | "
            f"{w['baseline_capture_ms']:.0f} | {w['baseline_status']} | {w['baseline_truncated_ms']:.0f} |"
            for w in wav_summary
        ))
    body = "\n\n".join(sections)
    if not args.wav_dir:
        header = (
            "# Endpoint-detector replay tables\n\n"
            "Generated by `vad_replay.py`. **Simulation only** — no device was involved, "
            "and no Parakeet decode was run.\n\n"
        )
    else:
        header = (
            "# WAV replay tables\n\n"
            "Generated by `vad_replay.py`. Audible-speech regions are an energy estimate, "
            "not a transcript alignment. **Simulation only.**\n\n"
            "## WAV replay (baseline)\n\n"
            "| File | Duration (ms) | Audible speech (ms) | Baseline capture (ms) | Status | Lost speech (ms) |\n"
            "|---|---:|---:|---:|---|---:|\n"
        )
    with open(args.tables, "w", encoding="utf-8") as handle:
        handle.write(header + body + "\n")

    if not args.quiet:
        print((header + body) if args.wav_dir else body)

    if not args.wav_dir:
        base = [r for r in rows if r["onset_ms"] == 60 and r["hangover_ms"] == 1500]
        print(
            f"\nscenarios={len(base)} baseline_capture_range="
            f"{min(r['capture_ms'] for r in base):.0f}-{max(r['capture_ms'] for r in base):.0f} ms",
            file=sys.stderr,
        )
    print(f"wrote {args.json}, {args.csv}, {args.tables}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
