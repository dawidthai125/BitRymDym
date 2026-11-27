"""Shortcut legend beside the devices, the SKRÓTY button and the F1 window."""

from __future__ import annotations

import os
import sys
import tempfile
import time

HOME = tempfile.mkdtemp()
os.environ.update(APPDATA=HOME, LOCALAPPDATA=HOME, TEMP=HOME)
os.environ.pop("BITRYMDYM_UI_SMOKE", None)

import record_app as app  # noqa: E402

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
SHOT = sys.argv[1] if len(sys.argv) > 1 else ""


def check(ok: bool, what: str) -> None:
    if not ok:
        raise SystemExit(f"skróty: {what}")


def pump(root, times: int = 15) -> None:
    for _ in range(times):
        root.update()
        time.sleep(0.02)


app.RecorderWindow._boot_background = lambda self: None
if os.name != "nt":
    app.RecorderWindow._build_chrome = lambda self: None
w = app.RecorderWindow()
w._read_plan = lambda: None
w._signed_in, w._owner_email, w.tier = True, "a@b.pl", "GOLD"
w.beats = [("1", "Pościg (90 BPM)")]
w.beat_info = {"1": ("Pościg", 90, 150.0)}
w._warm_beat_view = lambda *_a: None
w._warm_listen = lambda *_a: None
w.choose_mode("online")
w.beat_var.set("Pościg (90 BPM)")
w._sync_beat_button()

# Every key named in the legend and in the list is really bound.
for keys in ("<space>", "<r>", "<p>", "<Escape>", "<m>", "<Control-z>", "<Control-i>", "<Delete>", "<Left>", "<Right>", "<F1>", "<question>"):
    check(bool(w.root.bind_all(keys)), f"brak klawisza {keys}")

for size, legend in (("1800x1000", True), ("1100x1000", False), ("760x640", False)):
    w.root.geometry(size)
    pump(w.root)
    check(bool(w.legend.winfo_manager()) == legend, f"{size}: legenda {'nie widać' if legend else 'widać'}")
    check(w.keys_button.winfo_ismapped(), f"{size}: brak przycisku SKRÓTY")
    if legend:
        head = w.head_area.winfo_height()
        left = w.head_left.winfo_height()
        check(head <= left + 2, f"{size}: legenda podnosi wiersz ({head} > {left})")
        box = w.legend
        check(box.winfo_rootx() + box.winfo_width() <= w.root.winfo_rootx() + w.root.winfo_width(), f"{size}: legenda poza oknem")
        print(size, "legenda", box.winfo_width(), "x", box.winfo_height(), "wiersz", head, "urządzenia", left)
        if SHOT:
            from PIL import ImageGrab

            r = w.root
            ImageGrab.grab((r.winfo_rootx(), r.winfo_rooty(), r.winfo_rootx() + r.winfo_width(), r.winfo_rooty() + r.winfo_height())).save(SHOT + "-okno.png")

w.root.geometry("1800x1000")
pump(w.root)
w.root.event_generate("<F1>", when="tail")
w.show_shortcuts()
pump(w.root)
keys = w._keys_box
check(keys.winfo_exists() and keys.winfo_viewable(), "F1 nie otwiera listy")
w.show_shortcuts()
pump(w.root, 3)
check(len([c for c in w.root.winfo_children() if isinstance(c, app.tk.Toplevel) and c.winfo_exists()]) == 1, "drugie okno skrótów")
if SHOT:
    from PIL import ImageGrab

    ImageGrab.grab((keys.winfo_rootx(), keys.winfo_rooty(), keys.winfo_rootx() + keys.winfo_width(), keys.winfo_rooty() + keys.winfo_height())).save(SHOT + "-lista.png")
keys.destroy()
w.root.destroy()
print("shortcuts ok")
