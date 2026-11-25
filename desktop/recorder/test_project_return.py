"""Project after a crash or a close, delay of the microphone, silent play, two sign-ins. A real Tk window, no audio, no network."""

from __future__ import annotations

import json
import os
import tempfile
import wave
from pathlib import Path

HOME = tempfile.mkdtemp()
os.environ.update(APPDATA=HOME, LOCALAPPDATA=HOME, TEMP=HOME, BITRYMDYM_UI_SMOKE="1")

import record_app as app  # noqa: E402
from timeline import Clip  # noqa: E402

answers: list[object] = []
asked: list[str] = []


def answer(_title: str, text: str) -> object:
    asked.append(text)
    return answers.pop(0)


app.messagebox.askyesnocancel = answer
app.messagebox.askyesno = answer


def check(ok: object, what: str) -> None:
    if not ok:
        raise SystemExit(f"test: {what}")


def take(name: str, seconds: float) -> str:
    app.TAKES.mkdir(parents=True, exist_ok=True)
    path = app.TAKES / name
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(48_000)
        handle.writeframes(b"\1\0" * int(48_000 * seconds))
    return str(path)


def window(email: str = "a@b.pl") -> app.RecorderWindow:
    """A fresh launch: what the real program does with leftovers, then sign-in as `email`."""
    for desk in (app.DESK, app.DESK_OFFLINE):
        app.stash_desk(desk, app.account_key(email))
    made = app.RecorderWindow()
    made._read_plan = lambda: None
    made._signed_in, made._owner_email, made.tier = True, email, "GOLD"
    made.beats = [("1", "Pościg (90 BPM)")]
    made.beat_info = {"1": ("Pościg", 90, 150.0)}
    made._warm_beat_view = lambda *_args: None
    return made


def kill(made: app.RecorderWindow) -> None:
    made.root.destroy()


first, second = take("ujecie-1.wav", 6), take("ujecie-2.wav", 5)

# 1. Killed: the project waits, is offered to its owner only, and comes back whole.
w = window()
w.choose_mode("online")
check(w.tracks[0].name == "Wokal 1", "pierwsza ścieżka online")
w.tracks[0].clips = [Clip(first, 1.0, 0.0, 6.0)]
w.beat_var.set("Pościg (90 BPM)")
w._save_desk()
kill(w)
w = window("inny@b.pl")
w.choose_mode("online")
check(not asked and not any(t.clips for t in w.tracks), "cudzy projekt nie jest pokazany")
w.tracks[0].clips = [Clip(second, 0.0, 0.0, 5.0)]
w._save_desk()
kill(w)
answers[:] = [None, True]
w = window()
w.choose_mode("online")
check(len(asked) == 1 and not any(t.clips for t in w.tracks), "anuluj zostawia pusty projekt")
kill(w)
w = window()
w.choose_mode("online")
check([c.path for c in w.tracks[0].clips] == [first] and w.beat_var.get() == "Pościg (90 BPM)", "powrót po zabiciu")

# 2. Close with Yes keeps it, and asks next time. No deletes the recordings of this project only.
answers[:] = [True]
check(w._confirm_close_save() and w._keep_desks == {"online"}, "zamknięcie z Tak")
w._on_close(ask_save=False)
answers[:] = [True]
w = window()
w.choose_mode("online")
check([c.path for c in w.tracks[0].clips] == [first], "powrót po zamknięciu")
answers[:] = [False]
check(w._confirm_close_save() and not w._keep_desks, "zamknięcie z Nie")
w._on_close(ask_save=False)
check(not Path(first).exists() and Path(second).exists(), "Nie kasuje tylko swoje nagrania")
asked.clear()
w = window()
w.choose_mode("online")
check(not asked, "po Nie nic nie wraca")

# 3. Offline and back: names and the remembered beat.
w._pref_beat = "Pościg (90 BPM)"
w.choose_mode("offline")
check([t.name for t in w.tracks] == ["Wokal 1"] and w.beat_var.get() == "", "pierwsza ścieżka offline")
w.back_to_modes()
w.choose_mode("online")
check([t.name for t in w.tracks] == ["Wokal 1"] and w.beat_var.get() == "Pościg (90 BPM)", "bit po powrocie z offline")

# 4. Gotowe closes with the studio it belongs to.
w.open_done()
box = w._boxes[-1]
w.choose_mode("offline")
check(not box.winfo_exists(), "okno Gotowe po zmianie studia")
w.back_to_modes()
w.choose_mode("online")

# 5. Delay by hand moves the last take and is remembered for the pair.
third = take("ujecie-3.wav", 8)
clip = Clip(third, 2.0, 0.5, 6.5)
w.tracks[0].clips = [clip]
w.devices, w.outputs = ["Mik"], [("Domyślne", -1), ("Słuchawki (RB-M600B)", 1)]
w.device_var.set("Mik")
w.output_var.set("Słuchawki (RB-M600B)")
w._bluetooth = {"Słuchawki (RB-M600B)"}
w._show_delay()
check(w.delay_var.get() == "" and "ZMIERZ" in w.probe_var.get(), "ostrzeżenie Bluetooth")
key = w._sync_key()
w._last_take = (clip, 0.5, key)
w._align_take(clip, 0.5, None, key)
check("nie wyrównałem" in w.status.get(), "komunikat bez wyrównania")
w.delay_var.set("440")
w._delay_typed()
moved = w.tracks[0].clips[0]
check(abs(moved.src_in - 0.94) < 1e-6 and moved.start == 2.0 and abs(w._sync_known[key] - 0.44) < 1e-9, "ręczne opóźnienie")
w.delay_var.set("400")
w._delay_typed()
check(abs(w.tracks[0].clips[0].src_in - 0.90) < 1e-6, "druga poprawka liczy od tego samego miejsca")
w._delay_measured(key, 120.0, "")
check(w.delay_var.get() == "120" and "120 ms" in w.status.get(), "pomiar zapamiętany")
w._delay_measured(key, None, "")
check(w.delay_var.get() == "120" and "Nie udało się" in w.status.get(), "nieudany pomiar nic nie zmienia")
check(json.loads(app.PREFS.read_text(encoding="utf-8"))["sync"][key] == 0.12, "opóźnienie w ustawieniach")

# 6. Muted beat with nothing else plays on silently; M brings it back; the end still ends.
w.playing, w._play_from, w._play_t0 = True, 0.0, app.time.monotonic()
w._remix_token = 5
w._swap_monitor(5, 0.0, None, "")
w._tick()
check(w.playing and w._silent_until == 150.0, "cichy odsłuch trwa")
w._cancel_tick()
w._play_t0 -= 200
w._tick()
check(not w.playing, "cichy odsłuch się kończy")

# 7. The plan is not known yet: nothing to buy. A second Enter does nothing.
w.tier, w._plan_pending = "FREE", True
w._sync_gold_offer()
check(w.offline_enter.cget("text") == "SPRAWDZAM PLAN…" and not w.offline_upgrade.winfo_manager(), "oferta przed planem")
w.tier, w._plan_pending = "GOLD", False
w._sync_gold_offer()
check(w.offline_enter.cget("text") == "WEJDŹ", "Gold po planie")
w.status.set("Gra.")
w.email.insert(0, "a@b.pl")
w.password.insert(0, "x")
w.sign_in()
check(not w._signing and w.status.get() == "Gra.", "drugi Enter po zalogowaniu")
w._signed_in_with("a@b.pl", "x", True, 0.0, None, {}, RuntimeError("Logowanie nie weszło."), False)
check(w.status.get() == "Gra.", "spóźniona odmowa nie psuje paska")

# 8. Groups of a toolbar wrap, the last one goes right only in a single row.
check(app.flow_places(500, [(100, 20), (200, 30), (100, 20)], 10, True) == ([(0, 5), (110, 0), (400, 5)], 30), "jeden rząd")
check(app.flow_places(320, [(100, 20), (200, 30), (100, 20)], 10, True)[0] == [(0, 5), (110, 0), (0, 34)], "dwa rzędy")
check(app.plain_text("Pościg ŁĄKI") == "poscig laki", "szukanie bez polskich znaków")
w.root.destroy()
print("project return self-test ok")
