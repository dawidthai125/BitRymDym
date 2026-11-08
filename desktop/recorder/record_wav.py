"""Local Windows recorder. Writes mono 16-bit WAV at 48 kHz.

The site still does mix and master. This file does not load VST plugins.
"""

from __future__ import annotations

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


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("_selftest.wav")
    self_test(target)
    print("self-test ok")
