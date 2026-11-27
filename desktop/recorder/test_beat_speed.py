"""Tempo bitu in the real window (online and offline) and on the way to Studio Online."""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

HOME = tempfile.mkdtemp()
os.environ.update(APPDATA=HOME, LOCALAPPDATA=HOME, TEMP=HOME)
os.environ.pop("BITRYMDYM_UI_SMOKE", None)

import account_upload  # noqa: E402
import record_app as app  # noqa: E402
from timeline import Clip  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def check(ok: bool, what: str) -> None:
    if not ok:
        raise SystemExit(f"tempo bitu w programie: {what}")


app.RecorderWindow._boot_background = lambda self: None
if os.name != "nt":
    app.RecorderWindow._build_chrome = lambda self: None
asked: list[str] = []
answer = [False]
app.messagebox.askyesno = lambda title, *_a, **_k: (asked.append(title), answer[0])[1]

w = app.RecorderWindow()
w._read_plan = lambda: None
w._signed_in, w._owner_email, w.tier = True, "a@b.pl", "GOLD"
w.beats = [("1", "Pościg (90 BPM)"), ("2", "Drugi (100 BPM)")]
w.beat_info = {"1": ("Pościg", 90, 150.0), "2": ("Drugi", 100, 120.0)}
w._warm_beat_view = lambda *_a: None
w._warm_listen = lambda *_a: None
w._save_prefs = lambda: None

# --- online ---
w.choose_mode("online")
w.root.update()
w._choose_beat("Pościg (90 BPM)")
w.beat_var.set("Pościg (90 BPM)")
w._sync_beat_button()
check(w.speed_label.cget("text") == "90 BPM", f"start: {w.speed_label.cget('text')}")
for _ in range(9):
    w.step_beat_speed(1)
check(w.speed_label.cget("text") == "99 BPM +10%", f"+9: {w.speed_label.cget('text')}")
title, bpm, seconds = w._beat_meta()
check(bpm == 99 and abs(seconds - 150 * w.beat_stretch) < 1e-6, f"czas bitu {bpm} {seconds}")
check(w._tempo() == 99 and w._take_cap() <= seconds, "odliczanie i limit nagrania")
check("99 BPM" in w.beat_name.cget("text"), "podpis ścieżki")
w.step_beat_speed(-1)
check(w._beat_meta()[1] == 98, "minus")
argv: list[list[str]] = []
w._beat_listen = lambda _id: ("bit.mp3", None, "")
w._warm_mix = lambda a, *_x, **_k: (argv.append(a), None)[1]
real_after = w.root.after
w.root.after = lambda *_a, **_k: ""
w._prepare_play(w._play_token, 10.0, [], "1", "", None)
w.root.after = real_after
joined = " ".join(argv[-1])
check("asetrate=" in joined and f"-ss {10.0 / w.beat_stretch:.3f} " in joined, f"odsłuch: {joined}")

# recordings: asked once, "no" keeps the speed
w.tracks[0].clips = [Clip(path=str(Path(HOME) / "a.wav"), start=0.0, src_in=0.0, src_out=2.0)]
before = w.beat_stretch
w.step_beat_speed(1)
check(asked == ["Tempo bitu"] and w.beat_stretch == before, "pytanie przy nagraniach")
answer[0] = True
w.step_beat_speed(1)
w.step_beat_speed(1)
check(len(asked) == 2 and w._beat_meta()[1] == 100, "po zgodzie pyta tylko raz")
w.tracks[0].clips = []
w.recording = True
held = w.beat_stretch
w.set_beat_speed(1.0)
w.recording = False
check(w.beat_stretch == held, "w czasie nagrywania tempo stoi")

# saved with the project, opened again, dropped with another beat
w._save_desk()
w.beat_stretch = 1.0
w._restore_desk()
check(w.beat_stretch == held, "po ponownym otwarciu")
w._choose_beat("Drugi (100 BPM)")
check(w.beat_stretch == 1.0, "inny bit gra normalnie")

# --- offline: own file, BPM typed by the user or unknown ---
w.back_to_modes()
w.choose_mode("offline")
w.root.update()
own = Path(HOME) / "moj.wav"
own.write_bytes(b"x")
w._probe_local_beat = lambda _p: None
w._use_local_beat(str(own))
w.local_beat_seconds = 100.0
w.tempo_var.set("")
w._sync_beat_button()
w.step_beat_speed(1)
check(w.speed_label.cget("text") == "+1%", f"offline bez BPM: {w.speed_label.cget('text')}")
w.tempo_var.set("80")
w.set_beat_speed(1.0)
for _ in range(8):
    w.step_beat_speed(1)
check(w.speed_label.cget("text") == "88 BPM +10%" and w._tempo() == 88, f"offline z BPM: {w.speed_label.cget('text')}")
check(abs(w._beat_meta()[2] - 100 * w.beat_stretch) < 1e-6, "offline: długość bitu")
document = app.offline_session.build_session(
    title="a", beat_file_name=str(own), beat_seconds=100.0, beat_gain_db=0, beat_muted=False, tracks=[], saved_at="",
    beat_bpm=80, beat_stretch=w.beat_stretch,
)
parsed = app.offline_session.parse_session(document)
check(parsed is not None and parsed["beat"]["stretch"] == w.beat_stretch and parsed["beat"]["bpm"] == 80, "plik sesji")
held = w.beat_stretch
w._save_desk()
w.beat_stretch = 1.0
w._restore_desk()
check(w.beat_stretch == held, "offline po ponownym otwarciu")
w._blank_project()
check(w.beat_stretch == 1.0, "nowy projekt")
w.root.destroy()


# --- to Studio Online ---
class Site(account_upload._FakeSite):
    def __init__(self) -> None:
        super().__init__()
        self.stretch, self.length, self.version = 1.0, 150_000, 4

    def project_document(self, _project: str) -> dict:
        return {
            "project": {"id": "p1", "documentVersion": self.version, "timelineLengthMs": 360_000},
            "clips": [{"id": "b", "sourceKind": "BEAT_REF", "stretchRatio": self.stretch, "durationMs": self.length, "timelineStartMs": 0, "sourceOffsetMs": 0}],
        }

    def _json(self, method: str, path: str, body: dict) -> dict:
        self.calls.append(("beat", method, body["op"], body["expectedDocumentVersion"]))
        if body["op"] == "set_playback":
            self.stretch, self.cents = body["stretch"], body["pitchCents"]
        else:
            self.length = body["durationMs"]
        self.version += 1
        return {"documentVersion": self.version}


take = Path(HOME) / "take.wav"
take.write_bytes(b"R" * 4096)
site = Site()
states: list[dict] = []
account_upload.upload_vocals(
    site, title="a", beat_id="1", wav_paths=[take], track_of=[0], starts_ms=[0], beat_stretch=0.9091,
    on_state=lambda s: states.append(s.to_json()),
)
check(site.stretch == 0.9091 and site.cents == 165 and site.length == 136_365, f"projekt na stronie {site.stretch} {site.length}")
kinds = [c[0] for c in site.calls]
check(kinds.index("beat") < kinds.index("place"), "tempo przed nagraniami")
check([c for c in site.calls if c[0] == "place"][0][3] == 6, "wersja projektu po tempie")
saved = account_upload.UploadState.from_json(states[-1])
check(saved is not None and saved.beat_stretch == 0.9091 and saved.beat_clip_ms == 150_000, "stan do dokończenia")
plain = Site()
account_upload.upload_vocals(plain, title="a", beat_id="1", wav_paths=[take], track_of=[0], starts_ms=[0])
check(not [c for c in plain.calls if c[0] == "beat"] and plain.length == 150_000, "normalne tempo bez zmian")
print("beat speed in the window ok")
