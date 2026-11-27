"""+ DODAJ ŚCIEŻKĘ asks what the track is and its name; pan L / C / P, the snap to C; Bitek levels a quiet take."""

from __future__ import annotations

import os
import sys
import tempfile
import time

HOME = tempfile.mkdtemp()
os.environ.update(APPDATA=HOME, LOCALAPPDATA=HOME, TEMP=HOME)
os.environ.pop("BITRYMDYM_UI_SMOKE", None)

import record_app as app  # noqa: E402
import track_kind  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SHOT = sys.argv[1] if len(sys.argv) > 1 else ""


def check(ok: bool, what: str) -> None:
    if not ok:
        raise SystemExit(f"nowa ścieżka: {what}")


def pump(root, times: int = 15) -> None:
    for _ in range(times):
        root.update()
        time.sleep(0.02)


def press(widget, text: str) -> None:
    for child in widget.winfo_children():
        if isinstance(child, app.tk.Button) and child.cget("text") == text:
            child.invoke()
            return
        if child.winfo_children():
            try:
                press(child, text)
                return
            except LookupError:
                pass
    raise LookupError(text)


track_kind.self_test()
app.RecorderWindow._boot_background = lambda self: None
if os.name != "nt":
    app.RecorderWindow._build_chrome = lambda self: None
for mode in ("online", "offline"):
    w = app.RecorderWindow()
    w._read_plan = lambda: None
    w._signed_in, w._owner_email, w.tier = True, "a@b.pl", "GOLD"
    w._warm_beat_view = lambda *_a: None
    w._warm_listen = lambda *_a: None
    w.choose_mode(mode)
    w.root.geometry("1366x740")
    pump(w.root)
    first = len(w.tracks)
    w.ask_new_track()
    pump(w.root)
    box = w._new_track_box
    check(box.winfo_exists(), f"{mode}: brak okna")
    press(box, "ADLIB")
    pump(w.root, 3)
    if SHOT and mode == "online":
        from PIL import ImageGrab

        ImageGrab.grab((box.winfo_rootx(), box.winfo_rooty(), box.winfo_rootx() + box.winfo_width(), box.winfo_rooty() + box.winfo_height())).save(SHOT + "-nowa.png")
    press(box, "DODAJ")
    pump(w.root)
    check(len(w.tracks) == first + 1 and w.tracks[-1].name == "Adlib 1", f"{mode}: {[t.name for t in w.tracks]}")
    if mode == "offline":
        check(w.tracks[-1].role == "podbicie", "offline: adlib nie jest podbiciem")
    # Own name, typed into the field.
    w.ask_new_track()
    pump(w.root)
    box = w._new_track_box
    press(box, "WOKAL")
    entry = next(c for c in box.winfo_children() if isinstance(c, app.tk.Entry))
    entry.delete(0, "end")
    entry.insert(0, "  Refren  ")
    press(box, "DODAJ")
    pump(w.root)
    check(w.tracks[-1].name == "Refren", f"{mode}: własna nazwa {w.tracks[-1].name!r}")
    # The next adlib is number 2.
    w.ask_new_track()
    pump(w.root)
    box = w._new_track_box
    press(box, "ADLIB")
    press(box, "ANULUJ")
    pump(w.root)
    check(len(w.tracks) == first + 2, f"{mode}: anuluj dodał ścieżkę")
    check(track_kind.next_name("Adlib", [t.name for t in w.tracks]) == "Adlib 2", f"{mode}: numer adlibu")
    # Pan: P, then C, and a release near the middle lands on C.
    track = w.tracks[-1]
    row = w.rows[w.tracks.index(track)]
    balance = row["pan"].master
    scale = next(c for c in balance.winfo_children() if isinstance(c, app.tk.Scale))
    labels = {c.cget("text"): c for c in balance.winfo_children() if isinstance(c, app.tk.Label)}
    for text in ("L", "C", "P"):
        check(text in labels, f"{mode}: brak {text}")
    labels["P"].event_generate("<Button-1>")
    pump(w.root, 3)
    check(abs(track.pan - 1.0) < 1e-9 and row["pan"].cget("text") == "P 100", f"{mode}: P {track.pan} {row['pan'].cget('text')}")
    labels["C"].event_generate("<Button-1>")
    pump(w.root, 3)
    check(track.pan == 0 and row["pan"].cget("text") == "C", f"{mode}: C {track.pan}")
    scale.set(4)
    pump(w.root, 3)
    scale.event_generate("<ButtonRelease-1>")
    pump(w.root, 3)
    check(track.pan == 0, f"{mode}: brak przyciągania do C ({track.pan})")
    right = balance.winfo_rootx() + balance.winfo_width()
    head = row["head"]
    check(right <= head.winfo_rootx() + head.winfo_width() + 1, f"{mode}: PAN wychodzi poza głowicę ścieżki ({right})")
    check(labels["P"].winfo_ismapped(), f"{mode}: P nie widać")
    # Bitek after a quiet take: the track up 6 dB, the beat down 3 dB, Cofnij brings both back.
    track = w.tracks[0]
    track.gain_db, w.beat_gain_db = 0.0, 0.0
    w.beat_gain_scale.set(0)
    w._push_undo()
    w._take_peak = -21.0
    note = w._auto_level(track)
    pump(w.root, 3)
    track = w.tracks[0]
    check(track.gain_db == 6 and w.beat_gain_db == -3 and "Ctrl+Z" in note, f"{mode}: poziom {track.gain_db} {w.beat_gain_db} {note!r}")
    w.undo()
    pump(w.root, 3)
    check(w.tracks[0].gain_db == 0 and w.beat_gain_db == 0, f"{mode}: cofnij poziom {w.tracks[0].gain_db} {w.beat_gain_db}")
    w._take_peak = -15.0
    check(w._auto_level(w.tracks[0]) == "", f"{mode}: głośne nagranie ruszyło suwaki")
    print(mode, "ok", [t.name for t in w.tracks])
    w.root.destroy()
print("new track ok")
