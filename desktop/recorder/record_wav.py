"""Local Windows recorder. Writes mono 16-bit WAV at 48 kHz.

The site still does mix and master. This file does not load VST plugins.
"""

from __future__ import annotations

import array
import math
import struct
import sys
import wave
from pathlib import Path

RATE = 48_000
BITS = 16


def write_pcm16_wav(path: Path, samples: list[int], rate: int = RATE) -> None:
    if not samples:
        raise ValueError("empty")
    if any(sample < -32768 or sample > 32767 for sample in samples):
        raise ValueError("sample out of int16")
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(BITS // 8)
        handle.setframerate(rate)
        handle.writeframes(struct.pack("<" + "h" * len(samples), *samples))


def tone(seconds: float = 0.1, rate: int = RATE, freq: float = 440.0) -> list[int]:
    count = max(1, int(rate * seconds))
    return [
        int(round(math.sin(2 * math.pi * freq * i / rate) * 8000))
        for i in range(count)
    ]


def resample_pcm16(samples: list[int], from_rate: int, to_rate: int) -> list[int]:
    if from_rate == to_rate:
        return samples
    if from_rate < 1 or to_rate < 1 or not samples:
        raise ValueError("resample")
    out_len = max(1, int(round(len(samples) * to_rate / from_rate)))
    if len(samples) == 1:
        return [samples[0]] * out_len
    out: list[int] = []
    last = len(samples) - 1
    for i in range(out_len):
        pos = i * last / max(1, out_len - 1)
        left = int(pos)
        right = min(last, left + 1)
        mix = pos - left
        value = round(samples[left] * (1 - mix) + samples[right] * mix)
        out.append(max(-32768, min(32767, int(value))))
    return out


def read_mono16(path: Path) -> tuple[int, array.array]:
    """PCM from the data chunk. A LIST header before the samples is skipped."""
    with wave.open(str(path), "rb") as handle:
        if handle.getnchannels() != 1 or handle.getsampwidth() != 2:
            raise ValueError("mono16")
        rate = handle.getframerate() or RATE
        raw = handle.readframes(handle.getnframes())
    if len(raw) < 4:
        raise ValueError("empty")
    samples = array.array("h")
    samples.frombytes(raw[: len(raw) // 2 * 2])
    return rate, samples


def replace_mono16(path: Path, samples: array.array, rate: int = RATE) -> None:
    if len(samples) < 2:
        raise ValueError("short")
    temporary = path.with_suffix(".cut.wav")
    with wave.open(str(temporary), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(samples.tobytes())
    temporary.replace(path)


def edit_span(samples: array.array, rate: int, start: float, end: float, mode: str) -> array.array:
    """Audacity-style span: cut, trim, silence, fade-in, fade-out."""
    if end < start:
        start, end = end, start
    total = len(samples)
    begin = max(0, min(total, int(start * rate)))
    stop = max(0, min(total, int(end * rate)))
    if stop - begin < max(1, rate // 20):
        raise ValueError("span")
    if mode == "trim":
        out = samples[begin:stop]
    elif mode == "cut":
        out = samples[:begin] + samples[stop:]
    elif mode == "silence":
        out = samples[:begin] + array.array("h", [0]) * (stop - begin) + samples[stop:]
    elif mode in {"fade-in", "fade-out"}:
        out = array.array("h", samples)
        span = stop - begin
        for index in range(span):
            if mode == "fade-in":
                gain = index / span
            else:
                gain = 1 - (index + 1) / span
            out[begin + index] = int(out[begin + index] * gain)
    else:
        raise ValueError("mode")
    if len(out) < 2:
        raise ValueError("short")
    return out


def self_test(path: Path) -> None:
    samples = tone()
    write_pcm16_wav(path, samples)
    with wave.open(str(path), "rb") as handle:
        if handle.getnchannels() != 1 or handle.getframerate() != RATE or handle.getsampwidth() != 2:
            raise SystemExit("wav header mismatch")
        if handle.getnframes() != len(samples):
            raise SystemExit("wav length mismatch")
    slowed = resample_pcm16([0, 1000, 2000, 3000], 2, 4)
    if len(slowed) != 8:
        raise SystemExit("resample length mismatch")
    path.unlink(missing_ok=True)
    body = array.array("h", [1000] * 4800 + [2000] * 4800)
    write_pcm16_wav(path, list(body[:4]))
    # rewrite a known span with the editor, then read it back
    replace_mono16(path, body)
    _rate, loaded = read_mono16(path)
    trimmed = edit_span(loaded, RATE, 0.1, 0.15, "trim")
    if len(trimmed) != 2400 or trimmed[0] != 2000:
        raise SystemExit("trim")
    silenced = edit_span(loaded, RATE, 0.0, 0.05, "silence")
    if silenced[0] != 0 or silenced[4800] != 2000:
        raise SystemExit("silence")
    faded = edit_span(loaded, RATE, 0.0, 0.05, "fade-in")
    if faded[0] != 0 or faded[-1] != 2000:
        raise SystemExit("fade")
    cut = edit_span(loaded, RATE, 0.0, 0.1, "cut")
    if len(cut) != 4800 or cut[0] != 2000:
        raise SystemExit("cut")
    path.unlink(missing_ok=True)


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("_selftest.wav")
    self_test(target)
    print("self-test ok")
