"""Local desk helpers for the Windows recorder.

Plan take lengths match src/config/plan-policy.ts recording.maxTakeSeconds.
This file does not play audio and does not talk to the site.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any


TAKE_SECONDS = {"FREE": 30, "BRONZE": 60, "SILVER": 120, "GOLD": 180}
# plan-policy studio.maxRecordingTracks. The Bit lane is not a recording track.
RECORDING_TRACKS = {"FREE": 1, "BRONZE": 2, "SILVER": 8, "GOLD": 16}
RATE = 48_000
PREF_KEYS = ("device", "title", "effects", "beat")


def max_take_seconds(tier: str) -> int:
    return TAKE_SECONDS.get(tier, TAKE_SECONDS["FREE"])


def max_recording_tracks(tier: str) -> int:
    return RECORDING_TRACKS.get(tier, RECORDING_TRACKS["FREE"])


def wav_seconds(size: int) -> float:
    if size <= 44:
        return 0.0
    return (size - 44) / 2 / RATE


def peak_db(pcm: bytes) -> float:
    if len(pcm) < 2:
        return -96.0
    peak = 0
    usable = len(pcm) - (len(pcm) % 2)
    for index in range(0, usable, 2):
        sample = int.from_bytes(pcm[index : index + 2], "little", signed=True)
        peak = max(peak, abs(sample))
    if peak <= 0:
        return -96.0
    return 20.0 * math.log10(peak / 32768.0)


def tail_peak_db(path: Path, samples: int = 4800) -> float:
    if not path.exists():
        return -96.0
    size = path.stat().st_size
    if size <= 44:
        return -96.0
    byte_count = min(size - 44, samples * 2)
    with path.open("rb") as handle:
        handle.seek(size - byte_count)
        return peak_db(handle.read(byte_count))


def studio_url(site: str, project: str) -> str:
    return f"{site.rstrip('/')}/studio/p/{project}"


def read_prefs(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    device = raw.get("device")
    title = raw.get("title")
    beat = raw.get("beat")
    effects = raw.get("effects")
    if isinstance(device, str) and device:
        out["device"] = device
    if isinstance(title, str):
        out["title"] = title
    if isinstance(beat, str) and beat:
        out["beat"] = beat
    if isinstance(effects, list):
        out["effects"] = [item for item in effects if isinstance(item, str)]
    return out


def list_saved_takes(folder: Path, limit: int = 12) -> list[Path]:
    if limit < 1 or not folder.is_dir():
        return []
    found = [
        path
        for path in folder.glob("ujecie-*.wav")
        if path.is_file() and path.stat().st_size >= 1000
    ]
    found.sort(key=lambda path: path.stat().st_mtime)
    return found[-limit:]


def write_prefs(path: Path, prefs: dict[str, Any]) -> None:
    clean = {key: prefs[key] for key in PREF_KEYS if key in prefs}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean), encoding="utf-8")


def self_test() -> None:
    if [max_take_seconds(tier) for tier in ("FREE", "BRONZE", "SILVER", "GOLD")] != [30, 60, 120, 180]:
        raise SystemExit("czas nagrania")
    if [max_recording_tracks(tier) for tier in ("FREE", "BRONZE", "SILVER", "GOLD")] != [1, 2, 8, 16]:
        raise SystemExit("ścieżki nagrań")
    if max_take_seconds("NOPE") != 30 or max_recording_tracks("NOPE") != 1:
        raise SystemExit("nieznany plan")
    if abs(wav_seconds(44 + RATE * 2) - 1.0) > 0.001:
        raise SystemExit("sekundy WAV")
    if peak_db(b"\x00\x00\x00\x00") != -96.0:
        raise SystemExit("cisza")
    loud = peak_db((32767).to_bytes(2, "little", signed=True))
    if not -0.01 <= loud <= 0:
        raise SystemExit(f"szczyt {loud}")
    folder = Path(__import__("os").environ.get("TEMP", ".")) / "bitrymdym-desk-test"
    prefs_path = folder / "prefs.json"
    write_prefs(
        prefs_path,
        {"device": "Mic", "title": "T", "effects": ["eq"], "beat": "Bit", "accessToken": "no"},
    )
    loaded = read_prefs(prefs_path)
    if "accessToken" in loaded or loaded.get("effects") != ["eq"]:
        raise SystemExit("prefs")
    prefs_path.unlink(missing_ok=True)
    if studio_url("https://www.bitrymdym.pl", "p1") != "https://www.bitrymdym.pl/studio/p/p1":
        raise SystemExit("adres studia")
    takes = folder / "takes"
    takes.mkdir(parents=True, exist_ok=True)
    small = takes / "ujecie-small.wav"
    big = takes / "ujecie-big.wav"
    other = takes / "not-a-take.wav"
    small.write_bytes(b"x" * 20)
    big.write_bytes(b"x" * 1000)
    other.write_bytes(b"x" * 1000)
    saved = list_saved_takes(takes, limit=12)
    if saved != [big]:
        raise SystemExit("lista ujęć")
    for path in (small, big, other, prefs_path):
        path.unlink(missing_ok=True)
    print("desk self-test ok")


if __name__ == "__main__":
    self_test()
