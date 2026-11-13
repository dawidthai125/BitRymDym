"""Portable session from Studio Offline.

The program keeps the beat file on this computer. The folder it writes has
dry vocal stems (WAV from 0:00, no beat mixed in) and sesja.brd.json.
That JSON is the arrangement: order, timeline, levels, pan. The site reads
the same shape. This module does not play audio and does not upload.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path

FORMAT = "bitrymdym.sesja"
VERSION = 1
FILE_NAME = "sesja.brd.json"
OFFLINE_VOCALS = 16
OFFLINE_EXTRAS = 8
# Gold on the site still places up to 16 recording tracks. The extra 8 stay in the pack.
SITE_GOLD_TRACKS = 16

RIGHTS_NOTE = (
    "Program nie sprawdza praw ani licencji bitu, wokalu, podbić i adlibów. "
    "Własny bit zostaje na tym komputerze i nie jedzie na stronę. "
    "Stemy (osobne pliki WAV ścieżek, czysta nagrywka od 0:00) zapisujesz u siebie, "
    "a potem wrzucasz je ręcznie: www.bitrymdym.pl → Studio → Utwórz projekt. "
    "W sesji studia plan Gold układa ścieżki. "
    "Plik sesji zapisuje kolejność, miejsce na osi, czas, głośność i balans lewo–prawo."
)

_DURATION = re.compile(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)")


def offline_track_cap() -> int:
    return OFFLINE_VOCALS + OFFLINE_EXTRAS


def clamp_gain(value: object) -> float:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return max(-24.0, min(12.0, number))


def clamp_pan(value: object) -> float:
    """-1 left, 0 center, +1 right."""
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    return max(-1.0, min(1.0, number))


def pan_text(pan: float) -> str:
    bounded = clamp_pan(pan)
    if bounded <= -0.05:
        return f"lewo {int(round(abs(bounded) * 100))}"
    if bounded >= 0.05:
        return f"prawo {int(round(bounded * 100))}"
    return "środek"


def clock_text(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    return f"{int(seconds // 60)}:{seconds % 60:05.2f}"


def file_title(name: str) -> str:
    """Last path piece. Works for Windows paths even when this code runs on Linux."""
    text = name.replace("\\", "/").rstrip("/")
    if "/" in text:
        text = text.rsplit("/", 1)[-1]
    return text


def safe_stem_piece(text: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in "-_ " else "-" for char in text).strip().replace(" ", "-")
    return cleaned[:40] or "sciezka"


def stem_filename(title: str, number: int, name: str) -> str:
    return f"{safe_stem_piece(title)}_{number:02d}_{safe_stem_piece(name)}.wav"


def seconds_from_ffmpeg_banner(text: str) -> float:
    match = _DURATION.search(text)
    if match is None:
        return 0.0
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def probe_media_seconds(ffmpeg: str, path: Path) -> float:
    """Length of a local beat file. Header only. 0 when the tool cannot say."""
    flags: dict[str, int] = {}
    if os.name == "nt":
        flags["creationflags"] = subprocess.CREATE_NO_WINDOW
    probe = Path(ffmpeg).with_name("ffprobe.exe" if ffmpeg.lower().endswith(".exe") else "ffprobe")
    if probe.is_file():
        try:
            done = subprocess.run(
                [
                    str(probe),
                    "-v",
                    "error",
                    "-show_entries",
                    "format=duration",
                    "-of",
                    "default=noprint_wrappers=1:nokey=1",
                    str(path),
                ],
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
                **flags,
            )
            value = float((done.stdout or "").strip() or "0")
        except (OSError, ValueError, subprocess.TimeoutExpired):
            value = 0.0
        if value > 0:
            return value
    try:
        done = subprocess.run(
            [ffmpeg, "-hide_banner", "-i", str(path)],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
            **flags,
        )
    except (OSError, subprocess.TimeoutExpired):
        return 0.0
    return seconds_from_ffmpeg_banner(f"{done.stderr or ''}\n{done.stdout or ''}")


def _clip_row(raw: object) -> dict[str, float] | None:
    if not isinstance(raw, dict):
        return None
    try:
        start = max(0.0, float(raw.get("start", 0.0)))
        src_in = max(0.0, float(raw.get("in", 0.0)))
        src_out = float(raw.get("out", 0.0))
    except (TypeError, ValueError):
        return None
    if src_out - src_in < 0.01:
        return None
    end = float(raw["end"]) if _is_number(raw.get("end")) else start + (src_out - src_in)
    return {
        "start": round(start, 3),
        "end": round(max(end, start + (src_out - src_in)), 3),
        "in": round(src_in, 3),
        "out": round(src_out, 3),
    }


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def build_session(
    *,
    title: str,
    beat_file_name: str,
    beat_seconds: float,
    beat_gain_db: float,
    beat_muted: bool,
    tracks: list[dict[str, object]],
    saved_at: str,
) -> dict[str, object]:
    """Portable document. Beat audio is never copied in. Stem names are files beside this JSON."""
    beat_name = file_title(beat_file_name) if beat_file_name else ""
    rows: list[dict[str, object]] = []
    for item in tracks:
        raw_clips = item.get("clips")
        if not isinstance(raw_clips, list):
            raw_clips = []
        clips = [row for row in (_clip_row(clip) for clip in raw_clips) if row is not None]
        if not clips:
            continue
        number = len(rows) + 1
        name = str(item.get("name") or f"Ścieżka {number}")[:40]
        role = "podbicie" if item.get("role") == "podbicie" else "wokal"
        stem = stem_filename(title, number, name)
        rows.append(
            {
                "order": number,
                "role": role,
                "name": name,
                "gainDb": round(clamp_gain(item.get("gainDb", item.get("gain_db", 0.0))), 2),
                "pan": round(clamp_pan(item.get("pan", 0.0)), 3),
                "muted": bool(item.get("muted")),
                "solo": bool(item.get("solo")),
                "stem": stem,
                "clips": clips,
            }
        )
    return {
        "format": FORMAT,
        "version": VERSION,
        "savedAt": saved_at,
        "title": (title or "Nagranie").strip()[:80] or "Nagranie",
        "rights": {"beatChecked": False, "vocalsChecked": False, "note": RIGHTS_NOTE},
        "beat": {
            "source": "file",
            "fileName": beat_name,
            "durationSeconds": round(max(0.0, float(beat_seconds or 0.0)), 3),
            "gainDb": round(clamp_gain(beat_gain_db), 2),
            "muted": bool(beat_muted),
            "included": False,
        },
        "stemAlign": "from-zero",
        "tracks": rows,
    }


def parse_session(raw: object) -> dict[str, object] | None:
    """Normalized session, or None when this is not our file. Rejects a beat stuffed into the JSON."""
    if not isinstance(raw, dict):
        return None
    if raw.get("format") != FORMAT or raw.get("version") != VERSION:
        return None
    if "audio" in raw or "audioBase64" in raw:
        return None
    beat = raw.get("beat")
    if not isinstance(beat, dict) or beat.get("included") is True or "audio" in beat or "audioBase64" in beat:
        return None
    tracks = raw.get("tracks")
    if not isinstance(tracks, list):
        return None
    built = build_session(
        title=str(raw.get("title") or "Nagranie"),
        beat_file_name=str(beat.get("fileName") or ""),
        beat_seconds=float(beat.get("durationSeconds") or 0.0) if _is_number(beat.get("durationSeconds")) else 0.0,
        beat_gain_db=clamp_gain(beat.get("gainDb")),
        beat_muted=bool(beat.get("muted")),
        tracks=[item for item in tracks if isinstance(item, dict)],
        saved_at=str(raw.get("savedAt") or ""),
    )
    note = raw.get("rights")
    if isinstance(note, dict) and isinstance(note.get("note"), str) and note["note"].strip():
        rights = built["rights"]
        if isinstance(rights, dict):
            rights["note"] = note["note"].strip()
    return built


def write_session(folder: Path, document: dict[str, object]) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / FILE_NAME
    target.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")
    return target


def checklist_lines(document: dict[str, object]) -> list[str]:
    """Plain lines the site and the program can show. No audio."""
    lines: list[str] = []
    beat = document.get("beat")
    if isinstance(beat, dict):
        name = beat.get("fileName") or "niepodany"
        lines.append(
            f"Bit (zostaje u Ciebie, nie jedzie na stronę): {name}, {clock_text(float(beat.get('durationSeconds') or 0))} , "
            f"{float(beat.get('gainDb') or 0):+.0f} dB."
        )
    tracks = document.get("tracks")
    if not isinstance(tracks, list):
        return lines
    for item in tracks:
        if not isinstance(item, dict):
            continue
        clips = item.get("clips")
        start = 0.0
        if isinstance(clips, list) and clips and isinstance(clips[0], dict):
            start = float(clips[0].get("start") or 0.0)
        role = "podbicie / adlib" if item.get("role") == "podbicie" else "wokal"
        marks: list[str] = []
        if item.get("muted"):
            marks.append("wyciszona")
        if item.get("solo"):
            marks.append("solo")
        mark = f", {', '.join(marks)}" if marks else ""
        lines.append(
            f"{int(item.get('order') or 0):02d}. {item.get('name')} ({role}) od {clock_text(start)}, "
            f"{float(item.get('gainDb') or 0):+.0f} dB, {pan_text(float(item.get('pan') or 0))}{mark}, plik {item.get('stem')}"
        )
    return lines


def self_test() -> None:
    if offline_track_cap() != 24 or OFFLINE_VOCALS != 16 or OFFLINE_EXTRAS != 8 or SITE_GOLD_TRACKS != 16:
        raise SystemExit("limit offline")
    if pan_text(0) != "środek" or pan_text(-1) != "lewo 100" or pan_text(0.5) != "prawo 50":
        raise SystemExit("balans")
    if abs(seconds_from_ffmpeg_banner("Duration: 00:01:02.50, start") - 62.5) > 0.001:
        raise SystemExit("czas bitu")
    if seconds_from_ffmpeg_banner("brak") != 0.0:
        raise SystemExit("czas bitu pusty")
    document = build_session(
        title="a/b Test",
        beat_file_name=r"C:\Users\ktoś\Pulpit\moj bit.mp3",
        beat_seconds=95.2,
        beat_gain_db=3,
        beat_muted=False,
        tracks=[
            {
                "name": "Wokal 1",
                "role": "wokal",
                "gain_db": 2,
                "pan": -0.4,
                "muted": False,
                "solo": False,
                "clips": [{"start": 12.5, "in": 0.2, "out": 8.2}],
            },
            {
                "name": "Adlib",
                "role": "podbicie",
                "gainDb": 0,
                "pan": 1,
                "clips": [{"start": 40, "in": 0, "out": 2}],
            },
            {"name": "Pusta", "role": "wokal", "clips": []},
        ],
        saved_at="2026-11-13T12:00:00Z",
    )
    text = json.dumps(document)
    if "Pulpit" in text or "Users" in text or "audioBase64" in text:
        raise SystemExit("sesja nie trzyma ścieżki dysku ani bitu")
    beat = document["beat"]
    if not isinstance(beat, dict) or beat.get("fileName") != "moj bit.mp3" or beat.get("included") is not False:
        raise SystemExit("bit")
    tracks = document["tracks"]
    if not isinstance(tracks, list) or len(tracks) != 2:
        raise SystemExit("pusta ścieżka nie idzie do sesji")
    if tracks[0].get("stem") != "a-b-Test_01_Wokal-1.wav" or tracks[0].get("pan") != -0.4:
        raise SystemExit(f"stem albo balans {tracks[0]}")
    if tracks[1].get("role") != "podbicie" or tracks[1].get("order") != 2:
        raise SystemExit("kolejność")
    parsed = parse_session(json.loads(text))
    if parsed is None or parsed.get("format") != FORMAT:
        raise SystemExit("odczyt")
    if parse_session({"format": FORMAT, "version": 1, "beat": {"included": True}}) is not None:
        raise SystemExit("bit w pliku")
    if parse_session({"format": "inne", "version": 1}) is not None:
        raise SystemExit("obcy plik")
    lines = checklist_lines(document)
    if len(lines) != 3 or "lewo 40" not in lines[1] or "prawo 100" not in lines[2]:
        raise SystemExit(f"ściąga {lines}")
    print("offline session self-test ok")


if __name__ == "__main__":
    self_test()
