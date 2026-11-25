"""Test control: who may send commands and what they can never do. A real Tk window, no audio, no network."""

from __future__ import annotations

import json
import os
import socket
import sys
import tempfile
import threading
import wave
from pathlib import Path

HOME = Path(tempfile.mkdtemp())
REAL = {key: os.environ.get(key) for key in ("APPDATA", "TEMP")}
os.environ.update(LOCALAPPDATA=str(HOME), BITRYMDYM_UI_SMOKE="1", BITRYMDYM_NO_UPDATE="1")

import test_control as control  # noqa: E402

NAME = "Local\\x"
if control.wanted() or control.instance_name(NAME) != NAME or control.place(5, 6) != (5, 6):
    raise SystemExit("test: bez --test-control nic się nie zmienia")
control.use_test_data()
if REAL != {key: os.environ.get(key) for key in REAL}:
    raise SystemExit("test: dane zmienione bez --test-control")
sys.argv += ["--test-control", f"--test-data={HOME}", "--test-at=-1900,-200"]
if control.instance_name(NAME) == NAME or control.place(5, 6) != (-1900, -200):
    raise SystemExit("test: osobne dane i miejsce")

import record_app as app  # noqa: E402
from timeline import Clip  # noqa: E402


def check(ok: object, what: str) -> None:
    if not ok:
        raise AssertionError(what)


def raw(line: bytes) -> bytes:
    port = json.loads(control.control_file().read_text(encoding="utf-8"))["port"]
    with socket.create_connection(("127.0.0.1", port), timeout=5) as link:
        link.settimeout(5)
        link.sendall(line)
        try:
            return link.recv(1000)
        except ConnectionError:
            return b""


def refused(name: str, **options: object) -> str:
    answer = control.send(name, **options)
    check(not answer["ok"], f"{name} {options} miało być odmówione")
    return str(answer["blad"])


check(str(app.SESSION).startswith(str(HOME.resolve())), "osobne dane")
app.TAKES.mkdir(parents=True, exist_ok=True)
take = app.TAKES / "ujecie-1.wav"
with wave.open(str(take), "wb") as handle:
    handle.setnchannels(1)
    handle.setsampwidth(2)
    handle.setframerate(48_000)
    handle.writeframes(b"\1\0" * 48_000 * 6)

# A human is asked as always. A command never opens a box.
human: list[str] = []
app.messagebox.askyesno = lambda _title, text: human.append(text) or False
app.messagebox.askyesnocancel = lambda _title, text: human.append(text)
w = app.RecorderWindow()
w._read_plan = lambda: None
w._signed_in, w._owner_email, w.tier = True, "a@b.pl", "FREE"
w.email.insert(0, "a@b.pl")
w.password.insert(0, "tajne-haslo")
w.beats = [("1", "Iskry (80 BPM)"), ("2", "Pościg (90 BPM)")]
w.beat_info = {"1": ("Iskry", 80, 150.0), "2": ("Pościg", 90, 150.0)}
w._warm_beat_view = lambda *_args: None
w._warm_listen = lambda: None
failed: list[BaseException] = []


def scenario() -> None:
    known = json.loads(control.control_file().read_text(encoding="utf-8"))
    check(raw(b'{"komenda": "stan"}\n') == b"", "bez tokenu")
    check(raw(b'{"komenda": "stan", "token": "x"}\n') == b"", "zły token")
    check(raw(b"POST / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n") == b"", "przeglądarka")
    check(raw(b"[1]\n") == b"", "nie obiekt")
    check(raw(b"x" * 70_000 + b"\n") == b"", "za długie")
    for name in ("wyloguj", "nowy_projekt", "wyslij", "usun", "gotowe", "sign_out", "send_to_studio", "__init__"):
        check("Nie ma komendy" in refused(name), name)
    check("tylko tak albo anuluj" in refused("stan", odpowiedz="nie"), "Nie nie jest odpowiedzią")

    w.root.after(0, w.show_modes)
    answer = control.wait(5, ekran="wybor")
    text = json.dumps(answer, ensure_ascii=False)
    check(answer["ok"] and "@" not in text and "tajne" not in text and known["token"] not in text, "stan bez danych konta")
    check("Gold" in refused("studio", tryb="offline"), "Offline tylko Gold")
    refused("nagraj")
    refused("zaloguj")
    check(control.send("studio", tryb="online")["ok"], "online")
    check(control.send("bity")["wynik"] == ["Iskry (80 BPM)", "Pościg (90 BPM)"], "bity")
    refused("bit", nazwa="nieznany")
    refused("bit_plik", plik=str(take))
    check(control.send("bit", nazwa="Pościg (90 BPM)")["stan"]["bit"] == "Pościg (90 BPM)", "bit")
    check(json.loads(app.PREFS.read_text(encoding="utf-8"))["beat"] == "Pościg (90 BPM)", "bit zapamiętany")
    check(control.send("m")["stan"]["bit_m"] and not control.send("m")["stan"]["bit_m"], "M")
    check("mieści 1" in refused("sciezka_dodaj"), "limit planu")
    refused("sciezka_m", nr=5)
    check(refused("nagraj") != "", "bez mikrofonu")
    check(control.send("opoznienie", ms=440)["stan"]["opoznienie"] == "440", "opóźnienie")
    check(control.send("cofnij")["ok"] and not human, "żadnego okna dla człowieka")

    clip = Clip(str(take), 1.0, 0.0, 6.0)

    def put() -> None:
        w.tracks[0].clips = [clip]
        w._save_desk()

    w.root.after(0, put)
    while not control.send("stan")["stan"]["sciezki"][0]["klipy"]:
        pass
    closing = control.send("zamknij", pytanie=1)
    check(not closing["ok"] and closing["pytania"][0]["odpowiedz"] == "anuluj", "pytanie bez odpowiedzi to Anuluj")
    check(closing["stan"]["sciezki"][0]["klipy"] and take.is_file(), "projekt zostaje")
    w.root.after(0, lambda: setattr(w, "tier", "GOLD"))
    while control.send("stan")["stan"]["plan"] != "GOLD":
        pass
    control.send("zmien_studio")
    check(control.send("studio", tryb="offline")["ok"], "offline")
    check(len(control.send("sciezka_dodaj")["stan"]["sciezki"]) == 2, "ścieżka")
    check(len(control.send("cofnij")["stan"]["sciezki"]) == 1, "cofnij")
    check("prawa" in refused("zamknij", pytanie=1, odpowiedz="tak"), "Offline Tak nie wiesza")
    check(control.send("zamknij")["ok"], "zamknij")


def run() -> None:
    try:
        scenario()
    except BaseException as problem:
        failed.append(problem)
        w.root.after(0, w.root.destroy)


box = control.Control(w)
threading.Thread(target=run, daemon=True).start()
w.root.mainloop()
box.finish()
if failed:
    raise SystemExit(f"test: {failed[0]!r}")
check(not control.control_file().exists(), "token znika z programem")
check(take.is_file() and app.desk_clip_count(app.DESK) == 1, "projekt i nagranie czekają")
check(not human, "komenda nie pyta człowieka")

# The picture: what shows the e-mail is painted over.
picture = control.png(4, 2, b"\x01\x02\x03\xff" * 8, [(1, 0, 2, 1)])
check(picture.startswith(b"\x89PNG") and picture != control.png(4, 2, b"\x01\x02\x03\xff" * 8), "zrzut")
check(control.scrub({"a": ["Konto a@b.pl", 1]}) == {"a": ["Konto (e-mail)", 1]}, "bez e-maila")
print("test control ok")
