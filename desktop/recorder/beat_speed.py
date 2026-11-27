"""Beat speed ("Tempo bitu"): the Bit played faster like a tape, so its pitch rises with it.

Pure model: no Tk, no network. A speed is kept as `stretch` (heard length / file length), the same
number Studio Online stores on the beat clip (src/lib/studio/studio-beat-speed.ts).
"""

from __future__ import annotations

import math

RATE = 48_000
MAX_SPEED = 1.25
MIN_STRETCH = 1 / MAX_SPEED


def clean(value: object) -> float:
    """A stored stretch, or 1 (normal speed) for anything else."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        return 1.0
    return float(value) if MIN_STRETCH - 1e-4 <= value < 1 else 1.0


def for_speed(speed: float) -> float:
    return round(1 / min(MAX_SPEED, max(1.0, speed)), 4)


def speed(stretch: float) -> float:
    return 1 / stretch


def step(stretch: float, base_bpm: float, direction: int) -> float:
    """One press of + or -: a whole BPM when the tempo of the beat is known, else one percent."""
    unit = base_bpm if base_bpm > 0 else 100.0
    now = unit / stretch
    wanted = math.floor(now + 0.05) + 1 if direction > 0 else math.ceil(now - 0.05) - 1
    return for_speed(wanted / unit)


def pitch_cents(stretch: float) -> int:
    return int(round(-1200 * math.log2(stretch))) if stretch != 1 else 0


def heard_bpm(base_bpm: float, stretch: float) -> float:
    return round(base_bpm / stretch, 1) if base_bpm > 0 else 0


def label(base_bpm: float, stretch: float) -> str:
    percent = int(round((speed(stretch) - 1) * 100))
    if base_bpm > 0:
        return f"{heard_bpm(base_bpm, stretch):g} BPM" + (f" +{percent}%" if percent else "")
    return f"+{percent}%" if percent else "1×"


def audio_filter(stretch: float) -> str:
    """ffmpeg filter with a trailing comma; empty at normal speed. Plain resampling, so the rhythm cannot drift."""
    if stretch == 1:
        return ""
    return f"aresample={RATE},asetrate={int(round(RATE / stretch))},aresample={RATE},"


def apply_to_project(client: object, project: str, version: int, stretch: float, clip_ms: int, remember) -> int:
    """Give the Bit clip of a Studio project this speed. Returns the new document version.

    clip_ms is the length of the clip at normal speed from an earlier try (0 = not read yet); remember(ms)
    saves it before the first write, so a send that broke between the two writes cannot shorten twice.
    """
    document = client.project_document(project)  # type: ignore[attr-defined]
    clips = [c for c in document.get("clips", []) if isinstance(c, dict) and c.get("sourceKind") == "BEAT_REF"]
    if len(clips) != 1:
        if stretch == 1:
            return version
        raise RuntimeError("Bit w projekcie jest w kawałkach, więc nie ustawię jego tempa. Wyślij jako nowy projekt.")
    clip = clips[0]
    stored = float(clip.get("stretchRatio") or 1)
    changed = abs(stored - stretch) > 5e-5
    if not changed and clip_ms <= 0:
        return version
    if clip_ms <= 0:
        clip_ms = int(round(int(clip["durationMs"]) / stored))
        remember(clip_ms)
    version = int(document["project"]["documentVersion"])
    path = f"/api/studio/projects/{project}/clips/{clip['id']}"

    def write(body: dict) -> int:
        answer = client._json("PATCH", path, {**body, "expectedDocumentVersion": version})  # type: ignore[attr-defined]
        got = answer.get("documentVersion")
        if not isinstance(got, int):
            raise RuntimeError("Strona nie oddała wersji projektu.")
        return got

    if changed:
        version = write({"op": "set_playback", "stretch": stretch, "pitchCents": pitch_cents(stretch)})
    room = int(document["project"].get("timelineLengthMs") or 0) - int(clip["timelineStartMs"])
    wanted = int(round(clip_ms * stretch))
    if room > 0:
        wanted = min(wanted, room)
    if abs(int(clip["durationMs"]) - wanted) > 1:
        version = write(
            {"op": "set_geometry", "timelineStartMs": clip["timelineStartMs"], "durationMs": wanted,
             "sourceOffsetMs": clip["sourceOffsetMs"]}
        )
    return version


def self_test() -> None:
    if clean(None) != 1 or clean(True) != 1 or clean(0.5) != 1 or clean(1.2) != 1 or clean(0.9091) != 0.9091:
        raise SystemExit("tempo bitu: czytanie")
    if for_speed(2) != 0.8 or for_speed(0.5) != 1.0 or for_speed(99 / 90) != 0.9091:
        raise SystemExit("tempo bitu: zakres")
    up = step(1.0, 90, 1)
    if heard_bpm(90, up) != 91 or step(up, 90, -1) != 1.0 or step(0.8, 90, 1) != 0.8:
        raise SystemExit("tempo bitu: kroki BPM")
    if heard_bpm(93.5, step(1.0, 93.5, 1)) != 94 or label(0, step(1.0, 0, 1)) != "+1%" or label(0, 1.0) != "1×":
        raise SystemExit("tempo bitu: kroki bez pełnego BPM")
    if pitch_cents(0.9091) != 165 or pitch_cents(0.8) != 386 or pitch_cents(1.0) != 0:
        raise SystemExit("tempo bitu: wysokość")
    if audio_filter(1.0) or "asetrate=52800," not in audio_filter(1 / 1.1):
        raise SystemExit("tempo bitu: filtr")

    class Site:
        def __init__(self) -> None:
            self.clip = {"id": "c", "sourceKind": "BEAT_REF", "stretchRatio": 1, "durationMs": 100_000, "timelineStartMs": 0, "sourceOffsetMs": 0}
            self.version, self.writes, self.fail_geometry = 3, [], True

        def project_document(self, _project: str) -> dict:
            return {"project": {"documentVersion": self.version, "timelineLengthMs": 360_000}, "clips": [dict(self.clip)]}

        def _json(self, _method: str, _path: str, body: dict) -> dict:
            if body["expectedDocumentVersion"] != self.version:
                raise SystemExit("tempo bitu: wersja projektu")
            if body["op"] == "set_geometry" and self.fail_geometry:
                self.fail_geometry = False
                raise RuntimeError("sieć")
            self.writes.append(body["op"])
            if body["op"] == "set_playback":
                self.clip["stretchRatio"] = body["stretch"]
            else:
                self.clip["durationMs"] = body["durationMs"]
            self.version += 1
            return {"documentVersion": self.version}

    site, kept = Site(), []
    if apply_to_project(site, "p", 3, 1.0, 0, kept.append) != 3 or site.writes:
        raise SystemExit("tempo bitu: normalne tempo nic nie zapisuje")
    try:
        apply_to_project(site, "p", 3, 0.8, 0, kept.append)
    except RuntimeError:
        pass
    apply_to_project(site, "p", 3, 0.8, kept[0], kept.append)
    if site.clip["durationMs"] != 80_000 or site.writes != ["set_playback", "set_geometry"]:
        raise SystemExit(f"tempo bitu: dokończenie po przerwie {site.clip} {site.writes}")
    apply_to_project(site, "p", site.version, 1.0, kept[0], kept.append)
    if site.clip["durationMs"] != 100_000 or site.clip["stretchRatio"] != 1.0:
        raise SystemExit("tempo bitu: powrót do normalnego")
    print("beat speed self-test ok")


if __name__ == "__main__":
    self_test()
