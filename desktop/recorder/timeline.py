"""Clips on a timeline, Audacity style. Pure model: no Tk, no audio device, no network.

A clip points at a span of a mono 48 kHz WAV on disk (src_in..src_out) and sits at
`start` seconds on its track. Edits never rewrite the WAV, they only change clips,
so undo is a copy of the clip lists.
"""

from __future__ import annotations

import array
import hashlib
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Callable

RATE = 48_000
# Shorter pieces left by a cut are dropped. A 10 ms crumb is only a click.
MIN_PIECE = 0.01


@dataclass(frozen=True)
class Clip:
    path: str
    start: float
    src_in: float
    src_out: float

    @property
    def length(self) -> float:
        return max(0.0, self.src_out - self.src_in)

    @property
    def end(self) -> float:
        return self.start + self.length

    def to_json(self) -> dict[str, object]:
        return {"path": self.path, "start": self.start, "in": self.src_in, "out": self.src_out}

    @classmethod
    def from_json(cls, raw: object) -> "Clip | None":
        if not isinstance(raw, dict):
            return None
        try:
            clip = cls(str(raw["path"]), float(raw["start"]), float(raw["in"]), float(raw["out"]))
        except (KeyError, TypeError, ValueError):
            return None
        if clip.length < MIN_PIECE or clip.start < 0 or clip.src_in < 0:
            return None
        return clip


def ordered(clips: list[Clip]) -> list[Clip]:
    return sorted((clip for clip in clips if clip.length >= MIN_PIECE), key=lambda clip: clip.start)


def carve(clips: list[Clip], a: float, b: float) -> list[Clip]:
    """Remove the time span a..b from the track. A gap stays, nothing shifts."""
    if b < a:
        a, b = b, a
    out: list[Clip] = []
    for clip in clips:
        if clip.end <= a or clip.start >= b:
            out.append(clip)
            continue
        if clip.start < a:
            out.append(replace(clip, src_out=clip.src_in + (a - clip.start)))
        if clip.end > b:
            cut = b - clip.start
            out.append(replace(clip, start=b, src_in=clip.src_in + cut))
    return ordered(out)


def extract(clips: list[Clip], a: float, b: float) -> list[Clip]:
    """Pieces inside a..b, with start counted from a (for copy and paste)."""
    if b < a:
        a, b = b, a
    out: list[Clip] = []
    for clip in clips:
        lo = max(a, clip.start)
        hi = min(b, clip.end)
        if hi - lo < MIN_PIECE:
            continue
        offset = lo - clip.start
        out.append(Clip(clip.path, lo - a, clip.src_in + offset, clip.src_in + offset + (hi - lo)))
    return ordered(out)


def place(clips: list[Clip], new: list[Clip]) -> list[Clip]:
    """Put clips on the track. What was under them is replaced (punch-in)."""
    out = list(clips)
    for clip in new:
        out = carve(out, clip.start, clip.end)
        out.append(clip)
    return ordered(out)


def shift(pieces: list[Clip], to: float) -> list[Clip]:
    return [replace(piece, start=max(0.0, piece.start + to)) for piece in pieces]


def split_at(clips: list[Clip], t: float) -> list[Clip]:
    out: list[Clip] = []
    for clip in clips:
        if clip.start + MIN_PIECE < t < clip.end - MIN_PIECE:
            cut = t - clip.start
            out.append(replace(clip, src_out=clip.src_in + cut))
            out.append(replace(clip, start=t, src_in=clip.src_in + cut))
        else:
            out.append(clip)
    return ordered(out)


def clip_at(clips: list[Clip], t: float) -> int | None:
    for index, clip in enumerate(clips):
        if clip.start <= t < clip.end:
            return index
    return None


def track_end(clips: list[Clip]) -> float:
    return max((clip.end for clip in clips), default=0.0)


Loader = Callable[[str], array.array]


def render(clips: list[Clip], start: float, end: float, load: Loader, gain: float = 1.0) -> array.array:
    """Track audio from start to end. Gaps are silence."""
    total = max(0, int(round((end - start) * RATE)))
    out = array.array("h", bytes(total * 2))
    for clip in clips:
        if clip.end <= start or clip.start >= end:
            continue
        source = load(clip.path)
        lo = max(start, clip.start)
        hi = min(end, clip.end)
        src_lo = int(round((clip.src_in + lo - clip.start) * RATE))
        src_hi = min(len(source), src_lo + int(round((hi - lo) * RATE)))
        dst = int(round((lo - start) * RATE))
        count = min(src_hi - src_lo, total - dst)
        if count > 0 and src_lo >= 0:
            out[dst : dst + count] = source[src_lo : src_lo + count]
    if abs(gain - 1.0) > 1e-6:
        out = array.array("h", (max(-32768, min(32767, int(sample * gain))) for sample in out))
    return out


def clip_samples(clip: Clip, load: Loader) -> array.array:
    source = load(clip.path)
    lo = int(round(clip.src_in * RATE))
    hi = min(len(source), int(round(clip.src_out * RATE)))
    return source[lo:hi]


def clip_key(clip: Clip) -> str:
    raw = f"{Path(clip.path).name}|{clip.src_in:.4f}|{clip.src_out:.4f}"
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def block_peaks(samples: array.array, block: int = 480) -> list[float]:
    """Peak per block (10 ms at 48 kHz), 0..1. max/min run in C, fine for 180 s."""
    out: list[float] = []
    for index in range(0, len(samples), block):
        part = samples[index : index + block]
        if not part:
            break
        out.append(max(max(part), -min(part)) / 32768.0)
    return out


def self_test() -> None:
    a = Clip("a.wav", 0.0, 0.0, 10.0)
    b = Clip("b.wav", 20.0, 0.0, 5.0)
    track = [a, b]
    carved = carve(track, 2.0, 4.0)
    if [(c.start, c.src_in, c.src_out) for c in carved] != [(0.0, 0.0, 2.0), (4.0, 4.0, 10.0), (20.0, 0.0, 5.0)]:
        raise SystemExit(f"carve {carved}")
    if carve(track, 30, 40) != ordered(track):
        raise SystemExit("carve poza klipami")
    pieces = extract(track, 8.0, 22.0)
    if [(p.path, p.start, p.src_in, p.src_out) for p in pieces] != [("a.wav", 0.0, 8.0, 10.0), ("b.wav", 12.0, 0.0, 2.0)]:
        raise SystemExit(f"extract {pieces}")
    moved = place(carve(track, 20.0, 25.0), shift(extract(track, 20.0, 25.0), 5.0))
    if [(c.path, c.start) for c in moved] != [("a.wav", 0.0), ("b.wav", 5.0)]:
        raise SystemExit(f"przesunięcie {moved}")
    if not any(c.path == "b.wav" and c.start == 5.0 for c in moved):
        raise SystemExit("przesunięty klip")
    # b on 5..10 replaced a's 5..10: a keeps 0..5 only
    a_left = [c for c in moved if c.path == "a.wav"]
    if len(a_left) != 1 or abs(a_left[0].src_out - 5.0) > 1e-9:
        raise SystemExit(f"punch-in {moved}")
    split = split_at([a], 3.0)
    if len(split) != 2 or split[1].start != 3.0 or split[1].src_in != 3.0:
        raise SystemExit("podział")
    if clip_at(track, 21.0) != 1 or clip_at(track, 15.0) is not None:
        raise SystemExit("klip pod kursorem")
    if track_end(track) != 25.0 or track_end([]) != 0.0:
        raise SystemExit("koniec ścieżki")
    source = array.array("h", range(0, 480))
    load = lambda _path: source  # noqa: E731
    one = Clip("x.wav", 0.005, 0.0, 0.005)  # 240 samples placed at 240
    rendered = render([one], 0.0, 0.01, load)
    if len(rendered) != 480 or rendered[239] != 0 or rendered[240] != 0 or rendered[241] != 1:
        raise SystemExit(f"render {rendered[238:243]}")
    late = render([one], 0.006, 0.01, load)
    if late[0] != 48:
        raise SystemExit(f"render od kursora {late[0]}")
    loud = render([one], 0.0, 0.01, load, gain=2.0)
    if loud[241] != 2:
        raise SystemExit("głośność")
    if len(clip_samples(Clip("x.wav", 3.0, 0.001, 0.002), load)) != 48:
        raise SystemExit("próbki klipu")
    if clip_key(a) == clip_key(replace(a, src_out=9.0)) or clip_key(a) != clip_key(replace(a, start=4.0)):
        raise SystemExit("klucz klipu")
    peaks = block_peaks(array.array("h", [0] * 480 + [16384] * 10), 480)
    if peaks != [0.0, 0.5]:
        raise SystemExit(f"szczyty {peaks}")
    if Clip.from_json(a.to_json()) != a or Clip.from_json({"path": "x"}) is not None:
        raise SystemExit("zapis klipu")
    print("timeline self-test ok")


if __name__ == "__main__":
    self_test()
