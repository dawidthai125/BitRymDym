"""Count-in before a take: clicks at the beat's tempo, then the beat and the record start together.

Pure model: no Tk, no audio device. The clicks are one WAV mixed in front of the beat, so the last
click and the first beat sample come from the same stream and cannot drift apart.
The length is in clicks (beats), as in Studio Online (STUDIO_COUNT_IN_BEATS in studio-daw-clock.ts):
a whole bar of 4 clicks felt too long before the first word.
"""

from __future__ import annotations

import array
import math

RATE = 48_000
BEATS_PER_BAR = 4
FALLBACK_BPM = 120
CHOICES: tuple[tuple[str, int], ...] = (("Bez", 0), ("1 stuk", 1), ("2 stuki", 2), ("4 stuki", 4), ("8 stuków", 8))
DEFAULT_LABEL = "2 stuki"
# Saved before 2026.11.50, when the choice was in bars. "1 takt" was the old default, so it gets the new one.
OLD_LABELS = {"1 takt": DEFAULT_LABEL, "2 takty": "8 stuków", "4 takty": "8 stuków"}
CLICK_SECONDS = 0.045


def label_of(saved: object) -> str | None:
    """A saved choice as today's label, None when it is not one."""
    if not isinstance(saved, str):
        return None
    saved = OLD_LABELS.get(saved, saved)
    return saved if saved in dict(CHOICES) else None


def beats_of(label: str) -> int:
    return dict(CHOICES).get(label_of(label) or DEFAULT_LABEL, 2)


def beat_seconds(bpm: float) -> float:
    tempo = float(bpm) if bpm and bpm > 0 else float(FALLBACK_BPM)
    return 60.0 / min(400.0, max(20.0, tempo))


def lead_seconds(beats: int, bpm: float) -> float:
    return max(0, beats) * beat_seconds(bpm)


def count_text(left: float, bpm: float) -> str:
    """What the clock shows: beats left until the record start, 4 3 2 1 inside every bar."""
    beats = max(1, math.ceil(left / beat_seconds(bpm) - 1e-6))
    return str((beats - 1) % BEATS_PER_BAR + 1)


def click_samples(beats: int, bpm: float) -> array.array:
    """Mono 16-bit clicks, exactly lead_seconds long. Every 4th click from the first is higher."""
    step = beat_seconds(bpm)
    total = int(round(lead_seconds(beats, bpm) * RATE))
    out = array.array("h", bytes(total * 2))
    length = int(CLICK_SECONDS * RATE)
    for index in range(max(0, beats)):
        begin = int(round(index * step * RATE))
        pitch = 1500.0 if index % BEATS_PER_BAR == 0 else 1000.0
        for i in range(min(length, total - begin)):
            fade = min(1.0, i / 48.0) * (1.0 - i / length) ** 2
            out[begin + i] = int(15000 * fade * math.sin(2 * math.pi * pitch * i / RATE))
    return out


def self_test() -> None:
    if beats_of("Bez") != 0 or beats_of("4 stuki") != 4 or beats_of("cokolwiek") != 2 or beats_of("8 stuków") != 8:
        raise SystemExit("odliczanie: wybór")
    if label_of("1 takt") != "2 stuki" or label_of("4 takty") != "8 stuków" or label_of("Bez") != "Bez" or label_of(3) is not None:
        raise SystemExit("odliczanie: stare ustawienie")
    if lead_seconds(4, 120) != 2.0 or lead_seconds(2, 0) != 1.0 or lead_seconds(0, 90) != 0.0:
        raise SystemExit("odliczanie: czas")
    if abs(lead_seconds(2, 90) - 2 * 60 / 90) > 1e-9:
        raise SystemExit("odliczanie: dwa stuki")
    shown = [count_text(left, 120) for left in (2.0, 1.51, 1.5, 1.0, 0.5, 0.01)]
    if shown != ["4", "4", "3", "2", "1", "1"] or count_text(2.2, 120) != "1" or count_text(1.0, 120) != "2":
        raise SystemExit(f"odliczanie: cyfry {shown}")
    clicks = click_samples(4, 120)
    if len(clicks) != 2 * RATE or len(click_samples(2, 120)) != RATE:
        raise SystemExit("odliczanie: długość")
    for index in range(4):
        at = index * RATE // 2
        if max(abs(value) for value in clicks[at : at + 2000]) < 6000:
            raise SystemExit(f"odliczanie: brak stuku {index}")
    if any(clicks[at] for at in range(RATE // 2 - 4000, RATE // 2 - 10)) or len(click_samples(0, 120)):
        raise SystemExit("odliczanie: cisza między stukami")
    print("countin self-test ok")


if __name__ == "__main__":
    self_test()
