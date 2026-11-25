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
# The headphones of this computer must not be the ones of the test.
app.win_output.default_output_index = lambda: None


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
        app.stash_desk(desk)
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

# 2b. Missing files and unpacked folders: the waiting project is not lost.
folder = app.TAKES / "projekty" / "aaaaaaaaaaaa-20200101-000000-000000"
folder.mkdir(parents=True)
(folder / "a.wav").write_bytes(Path(second).read_bytes())
os.utime(folder, (1, 1))
w.tracks[0].clips = [Clip(second, 0.0, 0.0, 5.0), Clip(str(folder / "a.wav"), 6.0, 0.0, 5.0)]
w._save_desk()
kill(w)
app.sweep_copies()
check(folder.is_dir(), "sprzątanie omija czekający projekt")
Path(second).rename(second + ".x")
answers[:] = [True]
asked.clear()
w = window()
w.choose_mode("online")
check(sum(len(t.clips) for t in w.tracks) == 1 and len(app.kept_projects(app.DESK, app.account_key("a@b.pl"))) == 1, "brak pliku nie kasuje projektu")
Path(second + ".x").rename(second)
answers[:] = [True]
w._confirm_close_save()
w._on_close(ask_save=False)
answers[:] = [None, True]
w = window()
w.choose_mode("online")
check(len(asked) == 4 and sum(len(t.clips) for t in w.tracks) == 2, "starszy projekt po Anuluj")
app.DESK.write_text(json.dumps({"tracks": [{"clips": [{}]}]}), encoding="utf-8")
app.stash_desk(app.DESK)
check(app.DESK.exists(), "plik bez właściciela nie jest niczyj")
w.tracks[0].clips = []
w._on_close(ask_save=False)
for left in app.kept_projects(app.DESK, app.account_key("a@b.pl")):
    left.unlink()
w = window()
w.choose_mode("online")

# 3. Offline and back: names and the remembered beat.
w._pref_beat = "Pościg (90 BPM)"
w.choose_mode("offline")
check([t.name for t in w.tracks] == ["Wokal 1"] and w.beat_var.get() == "", "pierwsza ścieżka offline")
w.back_to_modes()
w.choose_mode("online")
check([t.name for t in w.tracks] == ["Wokal 1"] and w.beat_var.get() == "Pościg (90 BPM)", "bit po powrocie z offline")

w.choose_mode("offline")
w.status.set("Wybierz własny bit z pliku.")
w.back_to_modes()
w.choose_mode("online")
check("własny bit" not in w.status.get() and "Uzbrój" in w.status.get(), "tekst studia po powrocie")

# 3b. The beat picked last time comes back, also when the list comes after the window.
w._pref_beat = "Pościg (90 BPM)"
w.beat_var.set("")
w._save_prefs()
payload = {"supabaseUrl": "u", "anonKey": "k", "beats": [{"id": "0", "title": "Iskry", "bpm": 120}, {"id": "1", "title": "Pościg", "bpm": 90, "durationSeconds": 150}]}
w._apply_public(payload)
check(w.beat_var.get() == "Pościg (90 BPM)", "bit z poprzedniej sesji")
w.beat_var.set("Iskry (120 BPM)")
w._save_prefs()
check(json.loads(app.PREFS.read_text(encoding="utf-8"))["beat"] == "Pościg (90 BPM)", "ustawienia pamiętają tylko wybór człowieka")
w.beat_var.set("Pościg (90 BPM)")

# 3c. Undo paints the clips again by itself.
w.root.deiconify()
w.root.update()
w.tracks[0].clips = [Clip(second, 0.0, 0.0, 5.0), Clip(second, 6.0, 0.0, 5.0)]
w._push_undo()
w.tracks[0].clips = []
w.undo()
for _ in range(20):
    w.root.update()
    app.time.sleep(0.01)
lane = w.rows[0]["lane"]
check(lane.winfo_width() > 100 and len(lane.find_withtag("wave")) == 2, "klipy widać po Cofnij")
check(max(lane.coords(item)[2] for item in lane.find_withtag("wave")) > 60, "fala ma szerokość po Cofnij")
w.root.withdraw()

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
w._last_take = (clip, 0.5, key, 7.0)
w._show_delay()
w._align_take(clip, 0.5, None, key)
check("nie wyrównałem" in w.status.get(), "komunikat bez wyrównania")
w.delay_var.set("440")
w._delay_typed()
moved = w.tracks[0].clips[0]
check(abs(moved.src_in - 0.94) < 1e-6 and moved.start == 2.0 and abs(w._sync_known[key] - 0.44) < 1e-9, "ręczne opóźnienie")
w.delay_var.set("400")
w._delay_typed()
check(abs(w.tracks[0].clips[0].src_in - 0.90) < 1e-6, "druga poprawka liczy od tego samego miejsca")
steps = len(w.undo_stack)
for value in range(395, 95, -5):
    w.delay_var.set(str(value))
    w._delay_typed()
check(len(w.undo_stack) == steps, "strzałka nie zjada cofania")
check(abs(w.tracks[0].clips[0].src_in - 0.60) < 1e-6 and abs(w.tracks[0].clips[0].src_out - 7.6) < 1e-6, "koniec nagrania wraca")
w.undo()
check(w.tracks[0].clips[0] == clip, "jedno cofnięcie przywraca miejsce")
check(w.delay_var.get() == "" and key not in w._sync_known, "cofnięcie wraca też opóźnienie")
for text, src in (("250", 0.75), ("300", 0.80)):
    w.delay_var.set(text)
    w._delay_typed()
    check(abs(w.tracks[0].clips[0].src_in - src) < 1e-6, "po Cofnij opóźnienie dalej przesuwa nagranie")
w.undo()
check(w.tracks[0].clips[0] == clip and key not in w._sync_known, "drugie cofnięcie")
w.delay_var.set("250")
w._delay_typed()
w._learn_delay(key, 0.111)
w.undo()
check(w.delay_var.get() == "111" and w.tracks[0].clips[0] == clip, "nowszy pomiar zostaje po Cofnij")
del w._sync_known[key]
w._show_delay()
w.delay_var.set("200")
w._delay_typed()
w.delay_var.set("202")
w._delay_typed()
w.undo()
check(w.tracks[0].clips[0] == clip and key not in w._sync_known, "drobna zmiana też się cofa")
last, w._last_take, steps = w._last_take, None, len(w.undo_stack)
w.delay_var.set("150")
w.undo()
check(key not in w._sync_known and len(w.undo_stack) == steps, "Cofnij wpisanej wartości nie rusza nagrań")
w._last_take = last
w._align_take(clip, 0.5, 187.5, key)
w._delay_flush()
w.undo()
check(w.tracks[0].clips[0] == clip and key not in w._sync_known, "ułamek milisekundy nie psuje Cofnij")
w._take_note = "Prawie cisza."
w.tracks[0].clips = app.place([clip], [Clip(second, 8.0, 0.0, 3.0)])
w._align_take(clip, 0.5, 300.0, key)
check(all(part in w.status.get() for part in ("Wyrównane", "Prawie cisza.", "starego nagrania")), "wyrównanie nie kasuje uwag")
w.undo()
w._sync_known.pop(key, None)
w._show_delay()
w.output_var.set("Domyślne")
w.delay_var.set("700")
w._delay_typed()
check(w.delay_var.get() == "" and "Mik|Domyślne" not in w._sync_known, "inne słuchawki nie dostają cudzej wartości")
w._sync_known["Mik|Domyślne"] = 0.15
w._show_delay()
check(w.delay_var.get() == "150", "stara wartość Domyślne")
w.output_var.set("Słuchawki (RB-M600B)")
w._show_delay()
check(w._delay_key == key, "klucz pary")
w._measuring = True
w._halt_audio()
check(not w._delay_running(), "wylogowanie kończy pomiar")
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

# 6b. Only the beat plays: M silences it in place, no new mix.
class Player:
    silent = False
    note = ""

    def poll(self) -> None:
        return None

    def terminate(self) -> None:
        pass

    kill = terminate

    def wait(self, timeout: float | None = None) -> int:
        return 0


w.playing, w.monitor, w._mix_beat_only = True, Player(), True
w.toggle_beat_mute()
check(w.monitor.silent and w._remix_after is None, "M wycisza w miejscu")
w.toggle_beat_mute()
check(not w.monitor.silent and w._remix_after is None, "M oddaje dźwięk w miejscu")
w._mix_beat_only = False
w.toggle_beat_mute()
check(not w.monitor.silent and w._remix_after is not None, "z wokalem nowy miks")
w._cancel_remix()
w.beat_muted, w.playing, w.monitor = False, False, None

# 6c. A question on close ends the measurement.
w._measuring = True
w._confirm_close_save(defer=True) if not w._project_dirty() else (answers.append(None), w._confirm_close_save())
check(not w._measuring, "pytanie kończy pomiar")

# 6d. The smallest window: GOTOWE whole, the vocal lane visible.
w.root.deiconify()
for mode in ("online", "offline"):
    w.choose_mode(mode)
    for _ in range(3):
        w.root.geometry("{}x{}".format(*w.root.minsize()))
        for _ in range(15):
            w.root.update()
            app.time.sleep(0.01)
    check(w.done_button.winfo_height() >= w.done_button.winfo_reqheight(), f"GOTOWE w małym oknie {mode}")
    low = w.rows[0]["lane"]
    print(
        mode, "okno", w.root.winfo_width(), w.root.winfo_height(), "min", w.root.minsize(), "ekran", w.root.winfo_screenwidth(),
        w.root.winfo_screenheight(), "ui", w.ui, "zwarte", w._compact, "tory", w.track_canvas.winfo_height(), "potrzeba", w.row_host.winfo_reqheight(),
        "paski", [flow.winfo_height() for flow in w._flows], "stan", w.status_label.winfo_height(), "szer", w._flows[0].widest(),
    )
    if w.root.minsize()[1] >= w.root.winfo_screenheight() - 60:
        # A screen too low for these fonts: the vocal is there in part and scrolls.
        check(w.track_canvas.winfo_height() > 150, f"miejsce na ścieżki na niskim ekranie {mode}")
        continue
    check(low.winfo_rooty() + low.winfo_height() <= w.track_canvas.winfo_rooty() + w.track_canvas.winfo_height() + 1, f"ścieżka w małym oknie {mode}")
    check(w.hscroll.winfo_height() > 8, f"przewijanie w małym oknie {mode}")
w.choose_mode("online")
w.root.withdraw()

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

# 9. A remembered password is seen in the form, and the dots are never sent as a password.
GRANT = {"access_token": "a.b.c", "refresh_token": "r"}
app.save_session("https://s.example", "anon", "a@b.pl", GRANT, True, "haslo-testowe", app.password_deadline(app.time.time()))
app.forget_tokens(remember="1")
w = app.RecorderWindow()


def dots() -> bool:
    return bool(w.password_dots.winfo_manager())


check(dots() and w.saved_until and w.saved_until in w.password_dots.cget("text"), "kropki zapamiętanego hasła")
w.root.deiconify()
w.show_gate()
w.root.update()
check(w.password_dots.winfo_reqwidth() + 6 <= w.password.winfo_width(), "termin mieści się w polu")
w.root.withdraw()
check("haslo-testowe" not in w.password_dots.cget("text") and w.password.get() == "", "pole zostaje puste")
check(w.login_note.cget("text") == app.LOGIN_HINT_READY, "tekst pod polem")
w.password.insert(0, "n")
check(not dots(), "pisanie chowa kropki")
w.password.delete(0, "end")
check(dots(), "puste pole znów z kropkami")
w.email.insert("end", "x")
w._sync_saved_password()
check(not dots() and w.login_note.cget("text") == app.LOGIN_HINT_FRESH, "inny e-mail")
w.email.delete(0, "end")
w._sync_saved_password()
check(not dots(), "bez e-maila")
w.email.insert(0, "A@B.pl")
w._sync_saved_password()
check(dots(), "ten sam e-mail")
w.remember_login.set(0)
w._sync_saved_password()
check(not dots(), "odznaczone pole")
w.remember_login.set(1)
w._sync_saved_password()
sent: list[str] = []


def grant(_url: str, _key: str, _email: str, password: str) -> dict[str, str]:
    sent.append(password)
    raise RuntimeError("Logowanie nie weszło.")


app.supabase_password_grant = grant
w.public_url, w.public_key = "https://s.example", "anon"
until = app.time.time() + 10


def answered() -> None:
    if w._signing and app.time.time() < until:
        w.root.after(20, answered)
    else:
        w.root.quit()


# The answer comes from a thread, so a real main loop has to run.
w.root.after(0, w.sign_in)
w.root.after(50, answered)
w.root.mainloop()
check(sent == ["haslo-testowe"], "Zaloguj wysyła zapisane hasło, nie kropki")
check(not dots() and not w.saved_until, "złe hasło znika z pola")
w.root.destroy()

app.save_session("https://s.example", "anon", "a@b.pl", GRANT, True, "haslo-testowe", str(int(app.time.time()) - 5))
w = app.RecorderWindow()
check(not dots() and w.login_note.cget("text") == app.LOGIN_HINT_EXPIRED, "po 48 godzinach")
w.sign_in()
check(not w._signing and not dots(), "po 48 godzinach trzeba wpisać")
w.email.insert("end", "x")
w._sync_saved_password()
check(w.login_note.cget("text") == app.LOGIN_HINT_FRESH, "wygaśnięcie dotyczy jednego e-maila")
w.root.destroy()
print("project return self-test ok")
