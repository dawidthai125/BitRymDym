"""Drive the recorder with commands instead of the mouse. For tests only, off unless the program starts with --test-control.

  BitRymDym.exe --test-control [--test-data=FOLDER] [--test-at=X,Y]
  python test_control.py [--test-data=FOLDER] stan
  python test_control.py nagraj
  python test_control.py czekaj stoi=1 sekundy=60

--test-data keeps login, settings, takes and temporary files apart from the real ones, and then this copy may run next to
the ordinary program. --test-at puts the window there, so it can live on another screen.

One JSON line in, one out, on 127.0.0.1 with a random port. The port and a fresh token lie in
%APPDATA%/BitRymDym/test-control.json and go away with the program. Commands only press what a signed-in user could
press: nothing sends to Studio, deletes a take or a project, signs out, or reads the password. A question of the program
asked during a command is answered with odpowiedz=tak or, without it, Anuluj. "Nie" is never an answer: it throws projects away.
"""

from __future__ import annotations

import ctypes
import hashlib
import hmac
import json
import os
import queue
import re
import secrets
import socket
import struct
import sys
import threading
import time
import zlib
from pathlib import Path
from typing import Any, Callable

FLAG = "--test-control"
LINE_MAX = 64 * 1024
MAIL = re.compile(r"[^\s@]+@[^\s@]+")


def wanted(argv: list[str] | None = None) -> bool:
    return FLAG in (sys.argv[1:] if argv is None else argv)


def _option(name: str, argv: list[str] | None = None) -> str:
    for part in sys.argv[1:] if argv is None else argv:
        if part.startswith(f"{name}="):
            return part[len(name) + 1 :]
    return ""


def use_test_data() -> None:
    """Before any path of the program is made."""
    folder = _option("--test-data")
    if not wanted() or not folder:
        return
    home = Path(folder).resolve()
    (home / "temp").mkdir(parents=True, exist_ok=True)
    os.environ["APPDATA"] = str(home)
    os.environ["TEMP"] = os.environ["TMP"] = str(home / "temp")


def instance_name(name: str) -> str:
    """A copy with its own data does not meet the ordinary program."""
    folder = _option("--test-data")
    if not wanted() or not folder:
        return name
    key = os.path.normcase(str(Path(folder).resolve()))
    return f"{name}.test-{hashlib.sha256(key.encode()).hexdigest()[:12]}"


def place(x: int, y: int) -> tuple[int, int]:
    """Where the window opens: the middle of the screen, or --test-at."""
    match = re.fullmatch(r"(-?\d{1,5}),(-?\d{1,5})", _option("--test-at"))
    return (int(match[1]), int(match[2])) if wanted() and match else (x, y)


def control_file() -> Path:
    return Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "test-control.json"


def scrub(value: Any) -> Any:
    """No e-mail leaves the program."""
    if isinstance(value, str):
        return MAIL.sub("(e-mail)", value)
    if isinstance(value, dict):
        return {key: scrub(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [scrub(item) for item in value]
    return value


class Foreground:
    """The user works in another window. When ours comes to the front by itself, that one gets its place back."""

    def __init__(self) -> None:
        # Long enough for the window to be made and shown.
        self.until = time.monotonic() + 5
        self.other = 0
        self.ours = False
        self.look()

    def look(self) -> None:
        if os.name != "nt":
            return
        user32 = ctypes.windll.user32
        user32.GetForegroundWindow.restype = ctypes.c_void_p
        user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
        front = int(user32.GetForegroundWindow() or 0)
        owner = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(front, ctypes.byref(owner))
        self.ours = bool(front) and int(owner.value) == os.getpid()
        if front and not self.ours:
            self.other = front
        elif front and self.other and time.monotonic() < self.until:
            user32.SetForegroundWindow(self.other)

    def after_command(self, chosen: bool) -> None:
        """chosen: the window was in front before the command, so the user put it there and it stays."""
        if not chosen:
            self.until = max(self.until, time.monotonic() + 0.5)


FRONT: Foreground | None = None


def keep_front() -> None:
    """Before the window is made."""
    global FRONT
    if wanted() and FRONT is None:
        FRONT = Foreground()


class Refused(Exception):
    """The command cannot run now. Its text is the answer."""


class Asked:
    """messagebox or filedialog of the program. Outside a command the real one answers."""

    def __init__(self, real: Any, control: "Control") -> None:
        self._real = real
        self._control = control

    def __getattr__(self, name: str) -> Any:
        real = getattr(self._real, name)
        if not callable(real):
            return real

        def ask(*args: Any, **options: Any) -> Any:
            control = self._control
            if not control.running or threading.current_thread() is not threading.main_thread():
                return real(*args, **options)
            text = str(args[1] if len(args) > 1 else options.get("message") or options.get("title") or name)
            yes = control.answer == "tak" and name in ("askyesno", "askyesnocancel", "askokcancel")
            control.questions.append({"pytanie": text, "odpowiedz": "tak" if yes else "anuluj"})
            if yes:
                return True
            return None if name == "askyesnocancel" else False if name.startswith("ask") and "name" not in name and "dir" not in name else ""

        return ask


class Control:
    def __init__(self, window: Any) -> None:
        self.w = window
        self.app = sys.modules[type(window).__module__]
        self.running = False
        self.answer = ""
        self.questions: list[dict[str, str]] = []
        self.token = secrets.token_urlsafe(32)
        self._jobs: queue.Queue[tuple[dict[str, Any], dict[str, Any], threading.Event]] = queue.Queue()
        self._open = True
        keep_front()
        self._sending = threading.Lock()
        self.commands: dict[str, Callable[..., Any]] = {
            "stan": lambda: None, "uklad": self._layout, "zaloguj": self._sign_in, "studio": self._studio,
            "zmien_studio": lambda: self._press(self.w.back_to_modes), "bity": lambda: [label for _id, label in self.w.beats],
            "bit": self._beat, "bit_plik": self._beat_file, "mikrofon": self._microphone, "odsluch": self._output,
            "odliczanie": self._count_in, "opoznienie": self._delay, "zmierz": self._measure, "nagraj": self._record,
            "graj": self._play, "stop": lambda: self._press(self.w.stop), "cofnij": lambda: self._press(self.w.undo),
            "m": lambda: self._press(self.w.toggle_beat_mute), "kursor": self._cursor,
            "sciezka_dodaj": self._add_track,
            "sciezka_uzbroj": lambda nr: self._press(self.w.arm_track, self._track(nr)),
            "sciezka_m": lambda nr: self._press(self.w.toggle_mute, self._track(nr)),
            "sciezka_s": lambda nr: self._press(self.w.toggle_solo, self._track(nr)),
            "okno": self._window, "przewin": self._scroll, "zrzut": self._shot, "zamknij": self._close,
        }
        self.app.messagebox = Asked(self.app.messagebox, self)
        self.app.filedialog = Asked(self.app.filedialog, self)
        self._server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self._server.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        self._server.bind(("127.0.0.1", 0))
        self._server.listen(4)
        path = control_file()
        path.parent.mkdir(parents=True, exist_ok=True)
        port = self._server.getsockname()[1]
        path.write_text(json.dumps({"port": port, "token": self.token, "pid": os.getpid()}), encoding="utf-8")
        threading.Thread(target=self._serve, daemon=True, name="brd-test-control").start()
        self.w.root.after(15, self._poll)

    # ---- transport ----

    def _serve(self) -> None:
        while self._open:
            try:
                link, _from = self._server.accept()
            except OSError:
                return
            with link:
                try:
                    link.settimeout(5)
                    line = self._line(link)
                    # A browser sends "POST / HTTP/1.1" and never gets past json.
                    asked = json.loads(line.decode("utf-8"))
                    if not isinstance(asked, dict) or not hmac.compare_digest(str(asked.pop("token", "")).encode(), self.token.encode()):
                        continue
                    reply: dict[str, Any] = {}
                    done = threading.Event()
                    with self._sending:
                        self._jobs.put((asked, reply, done))
                        if not done.wait(30):
                            reply = {"ok": False, "blad": "Program nie odpowiedział w 30 s."}
                        link.sendall(json.dumps(scrub(dict(reply)), ensure_ascii=False).encode("utf-8") + b"\n")
                except (OSError, ValueError, RecursionError):
                    continue

    @staticmethod
    def _line(link: socket.socket) -> bytes:
        got = b""
        while not got.endswith(b"\n"):
            part = link.recv(4096)
            if not part:
                break
            got += part
            if len(got) > LINE_MAX:
                raise ValueError("za długie")
        return got

    def _poll(self) -> None:
        try:
            while True:
                asked, reply, done = self._jobs.get_nowait()
                if FRONT is not None:
                    FRONT.look()
                chosen = FRONT is not None and FRONT.ours
                try:
                    reply.update(self._run(asked))
                finally:
                    done.set()
                if FRONT is not None:
                    FRONT.after_command(chosen)
        except queue.Empty:
            pass
        if FRONT is not None:
            FRONT.look()
        if self._open:
            try:
                self.w.root.after(15, self._poll)
            except Exception:
                self._open = False

    def finish(self) -> None:
        """After the window is gone: the last answer still goes out, then port and token are no more."""
        self._open = False
        if self._sending.acquire(timeout=2):
            self._sending.release()
        try:
            self._server.close()
        except OSError:
            pass
        try:
            if json.loads(control_file().read_text(encoding="utf-8")).get("token") == self.token:
                control_file().unlink()
        except (OSError, ValueError):
            pass

    def _run(self, asked: dict[str, Any]) -> dict[str, Any]:
        name = str(asked.pop("komenda", ""))
        self.answer = str(asked.pop("odpowiedz", "")).lower()
        self.questions = []
        begun = time.time()
        result: dict[str, Any] = {"komenda": name, "start_ms": round(begun * 1000)}
        command = self.commands.get(name)
        if command is None:
            return {**result, "ok": False, "blad": f"Nie ma komendy {name!r}.", "komendy": sorted(self.commands)}
        if self.answer not in ("", "tak", "anuluj"):
            return {**result, "ok": False, "blad": "odpowiedz: tylko tak albo anuluj."}
        self.running = True
        try:
            got = command(**asked)
            result["ok"] = True
            if got is not None:
                result["wynik"] = got
        except Refused as problem:
            result.update(ok=False, blad=str(problem))
        except Exception as problem:
            result.update(ok=False, blad=f"{type(problem).__name__}: {problem}")
        finally:
            self.running = False
        result["ms"] = round((time.time() - begun) * 1000)
        if self.questions:
            result["pytania"] = self.questions
        if name != "zamknij" or not result["ok"]:
            result["stan"] = self._state()
        return result

    # ---- what is on screen ----

    def _screen(self) -> str:
        w = self.w
        if w._update_blocks():
            return "aktualizacja"
        for name, box in (("studio", w.studio), ("wybor", w.modes), ("logowanie", w.gate), ("ladowanie", w.splash)):
            if box.winfo_manager():
                return name
        return ""

    def _state(self) -> dict[str, Any]:
        w = self.w
        return {
            "wersja": self.app.updater.APP_VERSION,
            "ekran": self._screen(),
            "studio": w.studio_mode,
            "zalogowany": w._signed_in,
            "haslo_zapamietane_do": w.saved_until,
            "plan": "" if w._plan_pending else w.tier,
            "nagrywa": w.recording, "przygotowuje": w._arming, "gra": w.playing, "mierzy": w._delay_running(),
            "wysyla": w._uploading, "zapisuje": w._exporting, "wyrownuje": w._aligning,
            "tekst": w.status.get(), "podpowiedz": w.probe_var.get(), "tekst_logowania": w.gate_status.get(),
            "zegar": w.clock.get(), "kursor": round(w.cursor, 3),
            "bit": w.beat_var.get(), "bit_m": w.beat_muted, "odliczanie": w.count_var.get(),
            "mikrofon": w.device_var.get(), "mikrofony": list(w.devices),
            "odsluch": w.output_var.get(), "wyjscia": [label for label, _index in w.outputs],
            "opoznienie": w.delay_var.get(), "cofniec": len(w.undo_stack), "uzbrojona": w.armed + 1,
            "sciezki": [
                {
                    "nazwa": track.name, "m": track.muted, "s": track.solo,
                    "klipy": [
                        {"plik": Path(c.path).name, "od": round(c.start, 4), "in": round(c.src_in, 4), "out": round(c.src_out, 4)}
                        for c in track.clips
                    ],
                }
                for track in w.tracks
            ],
            "okno": [w.root.winfo_rootx(), w.root.winfo_rooty(), w.root.winfo_width(), w.root.winfo_height()],
            "najmniejsze": list(w.root.minsize()),
        }

    def _need_studio(self) -> None:
        if self._screen() != "studio":
            raise Refused("Najpierw wejdź do studia.")

    def _press(self, run: Callable[..., Any], *args: Any) -> None:
        self._need_studio()
        run(*args)

    def _track(self, nr: Any) -> Any:
        index = int(nr) - 1
        if not 0 <= index < len(self.w.tracks):
            raise Refused(f"Nie ma ścieżki {nr}.")
        return self.w.tracks[index]

    # ---- commands ----

    def _sign_in(self) -> None:
        """The button of the form: the password the user typed or let the program remember."""
        if self._screen() != "logowanie":
            raise Refused("Nie ma ekranu logowania.")
        self.w.sign_in()

    def _studio(self, tryb: str) -> None:
        if self._screen() != "wybor":
            raise Refused("Najpierw ekran wyboru studia.")
        if tryb not in ("online", "offline"):
            raise Refused("tryb: online albo offline.")
        if tryb == "offline" and self.w.tier != "GOLD":
            raise Refused("Studio Offline jest w planie Premium Gold albo plan jeszcze się sprawdza.")
        self.w.choose_mode(tryb)

    def _beat(self, nazwa: str) -> None:
        self._need_studio()
        if self.w.studio_mode != "online":
            raise Refused("Offline bit jest z pliku: bit_plik.")
        if nazwa not in [label for _id, label in self.w.beats]:
            raise Refused("Nie ma takiego bitu na liście (komenda bity).")
        if self.w._busy():
            raise Refused(self.w.status.get())
        self.w._choose_beat(nazwa)

    def _beat_file(self, plik: str) -> None:
        self._need_studio()
        if self.w.studio_mode != "offline":
            raise Refused("Bit z pliku jest tylko w Studiu Offline.")
        if not Path(plik).is_file():
            raise Refused("Nie ma takiego pliku.")
        if self.w._busy():
            raise Refused(self.w.status.get())
        self.w._use_local_beat(plik)

    def _choose(self, variable: Any, value: str, choices: list[str]) -> None:
        self._need_studio()
        if value not in choices:
            raise Refused("Do wyboru: " + ", ".join(choices))
        if self.w._busy():
            raise Refused(self.w.status.get())
        self.w._option_chosen(variable, value)

    def _microphone(self, nazwa: str) -> None:
        self._choose(self.w.device_var, nazwa, list(self.w.devices))

    def _output(self, nazwa: str) -> None:
        self._choose(self.w.output_var, nazwa, [label for label, _index in self.w.outputs])

    def _count_in(self, nazwa: str) -> None:
        self._choose(self.w.count_var, nazwa, list(dict(self.app.countin.CHOICES)))

    def _delay(self, ms: Any) -> None:
        self._need_studio()
        if self.w._busy():
            raise Refused(self.w.status.get())
        self.w.delay_var.set(str(ms))
        self.w._delay_typed()

    def _measure(self) -> None:
        self._need_studio()
        if self.w._delay_running():
            raise Refused("Pomiar już trwa. Komenda stop go kończy.")
        self.w.measure_delay()
        if not self.w._delay_running():
            raise Refused(self.w.status.get())

    def _record(self) -> None:
        self._need_studio()
        if self.w.recording or self.w._arming:
            raise Refused("Nagranie już trwa.")
        self.w.record()
        if not (self.w.recording or self.w._arming):
            raise Refused(self.w.status.get())

    def _play(self) -> None:
        self._need_studio()
        self.w.play()
        if not (self.w.playing or self.w._arming):
            raise Refused(self.w.status.get())

    def _add_track(self) -> None:
        self._need_studio()
        before = len(self.w.tracks)
        self.w.add_track()
        if len(self.w.tracks) == before:
            raise Refused(self.w.status.get())

    def _cursor(self, s: Any) -> None:
        self._need_studio()
        self.w._set_cursor(float(s))

    def _window(self, x: Any = None, y: Any = None, szer: Any = None, wys: Any = None, najmniejsze: Any = False) -> None:
        root = self.w.root
        if str(najmniejsze).lower() in ("1", "true", "tak"):
            szer, wys = root.minsize()
        size = f"{int(szer)}x{int(wys)}" if szer is not None and wys is not None else ""
        # Negative is a screen to the left: Tk writes it +-1920.
        root.geometry(size + (f"+{int(x)}+{int(y)}" if x is not None and y is not None else ""))
        root.update_idletasks()

    def _scroll(self, pion: Any = 0, s: Any = 0) -> list[float]:
        """pion: notches of the wheel down. s: seconds along the beat."""
        self._need_studio()
        if int(pion):
            self.w.track_canvas.yview_scroll(int(pion), "units")
        if float(s):
            self.w._scroll_view(float(s))
        self.w.root.update_idletasks()
        return [round(part, 3) for part in self.w.track_canvas.yview()] + [round(self.w.view, 2)]

    def _layout(self) -> list[str]:
        """What is cut in the studio as it is now. Empty: everything whole."""
        self._need_studio()
        w = self.w
        w.root.update_idletasks()
        bad: list[str] = []
        inside = w.root.winfo_rooty() + w.root.winfo_height()
        for name, button in (("GOTOWE", w.done_button), ("DODAJ ŚCIEŻKĘ", w.add_button)):
            if button.winfo_height() < button.winfo_reqheight() or button.winfo_rooty() + button.winfo_height() > inside:
                bad.append(f"{name} ucięte")
        for name, head in [("bit", w.beat_head), *((f"ścieżka {i + 1}", row["head"]) for i, row in enumerate(w.rows))]:
            for child in head.winfo_children():
                if child.winfo_manager() and child.winfo_y() + child.winfo_height() > head.winfo_height():
                    bad.append(f"{name}: {child.winfo_class()} kończy się na {child.winfo_y() + child.winfo_height()} z {head.winfo_height()} px")
        return bad

    def _shot(self, plik: str) -> str:
        path = Path(plik)
        if path.suffix.lower() != ".png" or path.exists() or not path.parent.is_dir():
            raise Refused("plik: nowa nazwa .png w istniejącym folderze.")
        self.w.root.update_idletasks()
        width, height, rows = window_pixels(self.w._window_hwnd())
        left, top = self.w.root.winfo_rootx(), self.w.root.winfo_rooty()
        hidden = [
            (box.winfo_rootx() - left, box.winfo_rooty() - top, box.winfo_width(), box.winfo_height())
            for box in self._everything(self.w.root)
            if box.winfo_viewable() and self._shows_mail(box)
        ]
        path.write_bytes(png(width, height, rows, hidden))
        return str(path)

    def _everything(self, box: Any) -> list[Any]:
        found = [box]
        for child in box.winfo_children():
            found.extend(self._everything(child))
        return found

    @staticmethod
    def _shows_mail(box: Any) -> bool:
        try:
            if box.winfo_class() in ("Entry", "Spinbox"):
                # The password is not even looked at: only whether something is typed.
                return box.index("end") > 0 if box.cget("show") else "@" in box.get()
            return "@" in str(box.cget("text"))
        except Exception:
            return False

    def _close(self, pytanie: Any = False) -> None:
        """Both projects wait for the next launch. pytanie=1: the question of the X button instead."""
        w = self.w
        if w.recording or w._arming or w._delay_running() and not pytanie:
            raise Refused("Najpierw stop.")
        if self.answer == "tak" and w.studio_mode == "offline":
            # It asks about rights and a file in boxes of their own, and nobody is there to answer them.
            raise Refused("Offline Tak pyta jeszcze o prawa i plik. Zamknij bez pytania, projekt poczeka.")
        if str(pytanie).lower() in ("1", "true", "tak"):
            w._on_close()
        else:
            if w._touched:
                w._save_desk()
            w._keep_desks = {
                mode for mode, path in (("online", self.app.DESK), ("offline", self.app.DESK_OFFLINE)) if self.app.desk_clip_count(path)
            }
            w._on_close(ask_save=False)
        try:
            alive = bool(w.root.winfo_exists())
        except Exception:
            alive = False
        if alive:
            raise Refused("Program został otwarty.")


# ---- picture of the window, also when another one covers it ----


def window_pixels(hwnd: int) -> tuple[int, int, bytes]:
    """Width, height and BGRA rows from the top."""
    if os.name != "nt":
        raise Refused("Zrzut działa tylko w Windows.")
    user32, gdi32 = ctypes.windll.user32, ctypes.windll.gdi32
    handle = ctypes.c_void_p
    for call, kinds, back in (
        (user32.GetDC, [handle], handle), (user32.ReleaseDC, [handle, handle], ctypes.c_int),
        (user32.GetWindowRect, [handle, handle], ctypes.c_int), (user32.PrintWindow, [handle, handle, ctypes.c_uint], ctypes.c_int),
        (gdi32.CreateCompatibleDC, [handle], handle), (gdi32.CreateCompatibleBitmap, [handle, ctypes.c_int, ctypes.c_int], handle),
        (gdi32.SelectObject, [handle, handle], handle), (gdi32.DeleteObject, [handle], ctypes.c_int), (gdi32.DeleteDC, [handle], ctypes.c_int),
        (gdi32.GetDIBits, [handle, handle, ctypes.c_uint, ctypes.c_uint, handle, handle, ctypes.c_uint], ctypes.c_int),
    ):
        call.argtypes, call.restype = kinds, back
    rect = (ctypes.c_long * 4)()
    user32.GetWindowRect(hwnd, rect)
    width, height = rect[2] - rect[0], rect[3] - rect[1]
    if width <= 0 or height <= 0:
        raise Refused("Okno jest zwinięte.")
    screen = user32.GetDC(None)
    memory = gdi32.CreateCompatibleDC(screen)
    bitmap = gdi32.CreateCompatibleBitmap(screen, width, height)
    old = gdi32.SelectObject(memory, bitmap)
    try:
        if not user32.PrintWindow(hwnd, memory, 2):
            raise Refused("Windows nie oddał obrazu okna.")
        gdi32.SelectObject(memory, old)
        info = ctypes.create_string_buffer(struct.pack("<IiiHHIIiiII", 40, width, -height, 1, 32, 0, 0, 0, 0, 0, 0), 44)
        pixels = ctypes.create_string_buffer(width * height * 4)
        if gdi32.GetDIBits(memory, bitmap, 0, height, pixels, info, 0) != height:
            raise Refused("Windows nie oddał obrazu okna.")
        return width, height, pixels.raw
    finally:
        gdi32.DeleteObject(bitmap)
        gdi32.DeleteDC(memory)
        user32.ReleaseDC(None, screen)


def png(width: int, height: int, bgra: bytes, hidden: list[tuple[int, int, int, int]] = ()) -> bytes:  # type: ignore[assignment]
    """hidden: rectangles (x, y, width, height) painted over."""
    data = bytearray(bgra)
    for x, y, wide, high in hidden:
        left, right = max(0, x), min(width, x + wide)
        for row in range(max(0, y), min(height, y + high)):
            if right > left:
                data[(row * width + left) * 4 : (row * width + right) * 4] = b"\x40\x40\x40\xff" * (right - left)
    rgb = bytearray(width * height * 3)
    rgb[0::3], rgb[1::3], rgb[2::3] = data[2::4], data[1::4], data[0::4]
    lines = b"".join(b"\0" + bytes(rgb[row * width * 3 : (row + 1) * width * 3]) for row in range(height))

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))

    head = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", head) + chunk(b"IDAT", zlib.compress(lines, 6)) + chunk(b"IEND", b"")


# ---- the other end ----


def send(command: str, **options: Any) -> dict[str, Any]:
    """One command to the running program."""
    known = json.loads(control_file().read_text(encoding="utf-8"))
    with socket.create_connection(("127.0.0.1", int(known["port"])), timeout=5) as link:
        link.settimeout(40)
        link.sendall(json.dumps({**options, "komenda": command, "token": known["token"]}).encode("utf-8") + b"\n")
        line = Control._line(link)
    if not line:
        raise RuntimeError("Program odrzucił komendę.")
    return json.loads(line.decode("utf-8"))


def wait(seconds: float, **conditions: str) -> dict[str, Any]:
    """Until the state says so: ekran=studio, nagrywa=true, tekst=fragment. stoi=1: nothing plays, records or measures."""
    end = time.monotonic() + seconds
    still = conditions.pop("stoi", "")
    while True:
        answer = send("stan")
        state = answer.get("stan", {})
        fine = all(
            value.lower() in str(state.get(key, "")).lower() if isinstance(state.get(key), str) else str(state.get(key)).lower() == value.lower()
            for key, value in conditions.items()
        )
        if still and any(state.get(key) for key in ("nagrywa", "przygotowuje", "gra", "mierzy", "wyrownuje", "zapisuje")):
            fine = False
        if fine:
            return answer
        if time.monotonic() > end:
            return {**answer, "ok": False, "blad": "Czas minął."}
        time.sleep(0.05)


def main(argv: list[str]) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    folder = _option("--test-data", argv)
    if folder:
        os.environ["APPDATA"] = str(Path(folder).resolve())
    words = [part for part in argv if not part.startswith("--")]
    if not words:
        print(__doc__)
        return 2
    options = dict(part.split("=", 1) for part in words[1:] if "=" in part)
    try:
        if words[0] == "czekaj":
            answer = wait(float(options.pop("sekundy", "30")), **options)
        else:
            answer = send(words[0], **options)
    except (OSError, ValueError, RuntimeError) as problem:
        print(json.dumps({"ok": False, "blad": f"Program z {FLAG} nie odpowiada: {problem}"}, ensure_ascii=False))
        return 1
    print(json.dumps(answer, ensure_ascii=False, indent=1))
    return 0 if answer.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
