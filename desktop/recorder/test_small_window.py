"""The smallest studio window: everything whole, in every Windows scale. Run with the fonts of the program in ./fonts.

  python test_small_window.py [folder for screenshots]
"""

from __future__ import annotations

import os
import sys
import tempfile
import time
import tkinter as tk
from pathlib import Path

HOME = tempfile.mkdtemp()
os.environ.update(APPDATA=HOME, LOCALAPPDATA=HOME, TEMP=HOME)
os.environ.pop("BITRYMDYM_UI_SMOKE", None)

import record_app as app  # noqa: E402
from timeline import Clip  # noqa: E402

SHOTS = Path(sys.argv[1]) if len(sys.argv) > 1 else None
bad: list[str] = []
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
app.RecorderWindow._boot_background = lambda self: None
app.messagebox.askyesno = lambda *_args: True
app.messagebox.askyesnocancel = lambda *_args: False
if os.name != "nt":
    # Only Windows knows the cursor of the corner. Without the title bar the rest is the same.
    app.RecorderWindow._build_chrome = lambda self: None
real_tk = tk.Tk


def pump(root: tk.Tk, times: int = 12) -> None:
    for _ in range(times):
        root.update()
        time.sleep(0.02)


def screen(scale: float) -> None:
    def build(*args: object, **options: object) -> tk.Tk:
        root = real_tk(*args, **options)
        root.tk.call("tk", "scaling", 96 * scale / 72)
        # A desktop big enough for the window in this scale. The program asks for its size.
        root.winfo_screenheight = lambda: 2000  # type: ignore[method-assign]
        root.winfo_screenwidth = lambda: 3000  # type: ignore[method-assign]
        return root

    app.tk.Tk = build
    app.dpi_scale = lambda: scale


runs = [0]
real_fit = app.RecorderWindow._fit_height


def counted(self: app.RecorderWindow) -> None:
    runs[0] += 1
    real_fit(self)


app.RecorderWindow._fit_height = counted


def whole(box: tk.Misc, name: str) -> None:
    """Every child of a row head ends inside it."""
    for child in box.winfo_children():
        if child.winfo_manager() and child.winfo_y() + child.winfo_height() > box.winfo_height():
            bad.append(f"{name}: {child.winfo_class()} kończy się na {child.winfo_y() + child.winfo_height()} z {box.winfo_height()}")
        if child.winfo_manager() and child.winfo_height() < min(child.winfo_reqheight(), 10):
            bad.append(f"{name}: {child.winfo_class()} bez miejsca")


for scale in (1.0, 1.25, 1.5):
    screen(scale)
    w = app.RecorderWindow()
    w._read_plan = lambda: None
    w._signed_in, w._owner_email, w.tier = True, "a@b.pl", "GOLD"
    w.email.insert(0, "bardzo.dlugi.adres@przyklad.pl")
    w.beats = [("1", "Pościg (90 BPM)")]
    w.beat_info = {"1": ("Pościg", 90, 150.0)}
    w._warm_beat_view = lambda *_args: None
    for mode in ("online", "offline"):
        w.password.focus_force()
        w.choose_mode(mode)
        pump(w.root)
        w._fill_option(w.device_menu, w.device_var, ["Microphone Array (Intel® Smart Sound Technology)"], "")
        w._fill_option(w.output_menu, w.output_var, ["Słuchawki (RB-M600B)"], "")
        w.status.set("Nagranie 7.8 s jest na Wokal 1 od 0:00.00. " + app.tail_text(2.1, 3))
        if w.root.focus_get() in (w.email, w.password):
            bad.append(f"{scale} {mode}: klawisze zostały w polu hasła")
        for _ in range(4):
            w.root.geometry("{}x{}".format(*w.root.minsize()))
            pump(w.root)
        place = f"{scale:.0%} {mode}"
        whole(w.beat_head, f"{place} bit")
        head, lane = w.rows[0]["head"], w.rows[0]["lane"]
        whole(head, f"{place} wokal")
        if w.done_button.winfo_height() < w.done_button.winfo_reqheight():
            bad.append(f"{place}: GOTOWE ucięte")
        if lane.winfo_rooty() + lane.winfo_height() > w.track_canvas.winfo_rooty() + w.track_canvas.winfo_height() + 1:
            bad.append(f"{place}: ścieżka wokalu pod krawędzią")
        spare = w.track_canvas.winfo_height() - w.row_host.winfo_reqheight()
        if w.root.winfo_height() >= w.root.minsize()[1] and spare > int(40 * scale):
            bad.append(f"{place}: {spare} px puste pod ścieżkami")
        w.track_canvas.yview_scroll(-3, "units")
        w.root.update_idletasks()
        if w.track_canvas.canvasy(0) != 0:
            bad.append(f"{place}: przewinięcie w górę odsunęło bit w małym oknie")
            w.track_canvas.yview_moveto(0)
        short = w.root.minsize()[1]
        # After a recording the message is long. Nothing of the rows may go under it.
        w.status.set(
            "Nagranie 3.8 s jest na Wokal 1 od 0:20.00. Prawie cisza (szczyt −55 dB). Podniosłem o 43 dB, więc słychać też szum. "
            "Sprawdź mikrofon i nagraj jeszcze raz. " + app.tail_text(10.3, 3) + " Nie słychać bitu w mikrofonie, więc głosu nie "
            "wyrównałem. Kliknij ZMIERZ przy OPÓŹNIENIE albo przesuń nagranie."
        )
        pump(w.root)
        if lane.winfo_rooty() + lane.winfo_height() > w.track_canvas.winfo_rooty() + w.track_canvas.winfo_height() + 1:
            bad.append(f"{place}: po długim napisie ścieżka wokalu pod krawędzią")
        if w.status_label.winfo_height() < w.status_label.winfo_reqheight():
            bad.append(f"{place}: długi napis ucięty")
        if w.done_button.winfo_height() < w.done_button.winfo_reqheight():
            bad.append(f"{place}: GOTOWE ucięte po długim napisie")
        print(place, "długi napis: min", w.root.minsize(), "okno", w.root.winfo_height(), "napis", w.status_label.winfo_height())
        if scale == 1.0 and w.root.minsize()[1] > 768 - 60 + 6:
            bad.append(f"{place}: z długim napisem {w.root.minsize()[1]} px nie wejdzie na ekran 768 px")
        runs[0] = 0
        pump(w.root)
        if runs[0] > 1:
            bad.append(f"{place}: układ liczy się w kółko ({runs[0]} razy)")
        w.status.set("Cofnięte.")
        pump(w.root)
        if abs(w.root.minsize()[1] - short) > 1:
            bad.append(f"{place}: po krótkim napisie najmniejsze okno {w.root.minsize()[1]} zamiast {short}")
        print(
            place, "min", w.root.minsize(), "okno", w.root.winfo_width(), w.root.winfo_height(), "GOTOWE", w.done_button.winfo_height(),
            "bit", w.beat_head.winfo_height(), "wokal", head.winfo_height(), "zapas", spare, "paski", [flow.winfo_height() for flow in w._flows],
            "czcionka", app.FONT_POSTER,
        )
        if scale == 1.0 and w.root.minsize()[1] > 768 - 60:
            bad.append(f"{place}: najmniejsze okno {w.root.minsize()[1]} px nie wejdzie na ekran 768 px")
        if SHOTS is not None:
            from PIL import ImageGrab

            w.root.geometry("+0+0")
            w.root.lift()
            pump(w.root)
            SHOTS.mkdir(parents=True, exist_ok=True)
            ImageGrab.grab().save(SHOTS / f"{mode}-{int(scale * 100)}.png")
        # Bigger again: the ordinary layout comes back whole.
        w.root.geometry(f"{int(1320 * scale)}x{int(940 * scale)}")
        pump(w.root)
        if w.root.winfo_height() >= int(900 * scale):
            if w._compact or int(w.beat_head.cget("height")) != w.lane_h or not w.foot_label.winfo_manager():
                bad.append(f"{place}: duże okno nie wróciło do zwykłego układu")
            whole(head, f"{place} wokal w dużym oknie")
            # The wheel must not push the beat down and leave an empty strip above it. On a low screen it may go up.
            fits = w.row_host.winfo_reqheight() <= w.track_canvas.winfo_height()
            for step in (-3, 3, -1):
                w.track_canvas.yview_scroll(step, "units")
                w.root.update_idletasks()
                if w.track_canvas.canvasy(0) < 0 or fits and w.track_canvas.canvasy(0) != 0:
                    bad.append(f"{place}: kółko odsunęło bit o {-w.track_canvas.canvasy(0):.0f} px")
                    w.track_canvas.yview_moveto(0)
        w.back_to_modes()
        pump(w.root, 3)
    w.root.destroy()
for line in bad:
    print("ŹLE:", line)
if bad:
    raise SystemExit(1)
print("small window ok")
