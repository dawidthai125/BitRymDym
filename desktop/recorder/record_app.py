"""Windows recorder. Mic to WAV, then the existing account, site, and project.

Run from this folder: python record_app.py
Effects are the site chain, saved on the vocal track. Mix, master, and notes
stay on the site. This program does not load VST plugins.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tkinter as tk
from tkinter import filedialog
import urllib.error
import urllib.request
from pathlib import Path

from account_upload import SITE, upload_vocal, SiteClient
from own_fx import FX, build_chain, display_tier, limits_from_usage
from record_wav import write_pcm16_wav

PAPER = "#0e0c0a"
PANEL = "#17130f"
RACK = "#211b15"
INK = "#f1e7d3"
SOFT = "#cdbfa6"
AMBER = "#f2a93b"
ON_AMBER = "#0a0807"
LINE = "#3a3028"
REC = "#ff5a46"

SESSION = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-session.json"


def ffmpeg_exe() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    root = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    matches = sorted(root.glob("Gyan.FFmpeg*/ffmpeg-*/bin/ffmpeg.exe"))
    if not matches:
        raise RuntimeError("Brak ffmpeg. Bez niego mikrofon Intel się nie otworzy.")
    return str(matches[-1])


def ffplay_exe() -> str | None:
    found = shutil.which("ffplay")
    if found:
        return found
    sibling = Path(ffmpeg_exe()).with_name("ffplay.exe")
    if sibling.exists():
        return str(sibling)
    return None


def monitor_argv(exe: str, path: Path) -> list[str]:
    return [exe, "-nodisp", "-autoexit", "-loglevel", "error", str(path)]


def start_monitor(path: Path) -> subprocess.Popen[bytes] | None:
    exe = ffplay_exe()
    if exe is None or not path.exists():
        return None
    return subprocess.Popen(
        monitor_argv(exe, path),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def stop_monitor(proc: subprocess.Popen[bytes] | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)


def audio_devices(exe: str) -> list[str]:
    proc = subprocess.run(
        [exe, "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    names: list[str] = []
    for line in f"{proc.stdout}\n{proc.stderr}".splitlines():
        if "(audio)" not in line:
            continue
        start = line.find('"')
        end = line.rfind('"')
        if start >= 0 and end > start:
            names.append(line[start + 1 : end])
    mics = [name for name in names if "microphone" in name.lower() or "mikrofon" in name.lower()]
    ordered = mics + [name for name in names if name not in mics]
    if not ordered:
        raise RuntimeError("Windows nie pokazał mikrofonu.")
    return ordered


def start_capture(path: Path, device: str) -> subprocess.Popen[bytes]:
    path.parent.mkdir(parents=True, exist_ok=True)
    return subprocess.Popen(
        [
            ffmpeg_exe(),
            "-hide_banner",
            "-y",
            "-f",
            "dshow",
            "-i",
            f"audio={device}",
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        stdin=subprocess.PIPE,
    )


def stop_capture(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is not None:
        return
    if proc.stdin:
        try:
            proc.stdin.write(b"q")
            proc.stdin.close()
        except OSError:
            proc.terminate()
    try:
        proc.wait(timeout=8)
    except subprocess.TimeoutExpired:
        proc.terminate()
        proc.wait(timeout=5)


def record_seconds(path: Path, seconds: float) -> None:
    if seconds <= 0:
        raise ValueError("Czas nagrania musi być większy od zera.")
    exe = ffmpeg_exe()
    device = audio_devices(exe)[0]
    path.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        [
            exe,
            "-hide_banner",
            "-y",
            "-f",
            "dshow",
            "-i",
            f"audio={device}",
            "-t",
            str(seconds),
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "pcm_s16le",
            str(path),
        ],
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0 or not path.exists() or path.stat().st_size < 1000:
        raise RuntimeError("Mikrofon nie oddał WAV.")


def load_bootstrap() -> dict[str, object]:
    request = urllib.request.Request(
        f"{SITE}/api/desktop/bootstrap",
        headers={"Accept": "application/json", "User-Agent": "BitRymDymRecorder"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if not isinstance(payload, dict) or not payload.get("supabaseUrl") or not payload.get("anonKey"):
        raise RuntimeError("Strona nie oddała publicznego klienta.")
    return payload


def supabase_password_grant(url: str, anon_key: str, email: str, password: str) -> dict[str, str]:
    body = json.dumps({"email": email, "password": password}).encode("utf-8")
    request = urllib.request.Request(
        f"{url.rstrip('/')}/auth/v1/token?grant_type=password",
        data=body,
        method="POST",
        headers={"apikey": anon_key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError("Logowanie nie weszło. Sprawdź e-mail i hasło.") from error
    token = payload.get("access_token")
    if not isinstance(token, str) or token.count(".") != 2:
        raise RuntimeError("Konto nie oddało tokenu.")
    return {"access_token": token, "refresh_token": str(payload.get("refresh_token") or "")}


def save_session(url: str, anon_key: str, email: str, grant: dict[str, str]) -> None:
    SESSION.parent.mkdir(parents=True, exist_ok=True)
    SESSION.write_text(
        json.dumps(
            {
                "supabaseUrl": url,
                "anonKey": anon_key,
                "email": email,
                "accessToken": grant["access_token"],
                "refreshToken": grant["refresh_token"],
            }
        ),
        encoding="utf-8",
    )


def load_session() -> dict[str, str] | None:
    if not SESSION.exists():
        return None
    raw = json.loads(SESSION.read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not raw.get("accessToken"):
        return None
    return {str(key): str(value) for key, value in raw.items()}


class RecorderWindow:
    def __init__(self) -> None:
        self.root = tk.Tk()
        if os.environ.get("BITRYMDYM_UI_SMOKE") == "1":
            self.root.withdraw()
        self.root.title("BitRymDym")
        self.root.geometry("680x820")
        self.root.configure(bg=PAPER)
        self.recording = False
        self.capture: subprocess.Popen[bytes] | None = None
        self.monitor: subprocess.Popen[bytes] | None = None
        self.local_beat: Path | None = None
        self.wav_path = Path(os.environ.get("TEMP", ".")) / "bitrymdym-vocal.wav"
        self.public_url = ""
        self.public_key = ""
        self.beats: list[tuple[str, str]] = []
        self.tier = "FREE"
        self.fx_vars: dict[str, tk.IntVar] = {}
        self.status = tk.StringVar(value="Ładuję listę bitów ze strony.")
        self.plan_text = tk.StringVar(value="Plan: zaloguj się. Do tego czasu 4 efekty, bez sidechain.")
        self.email = self._entry(show="")
        self.password = self._entry(show="*")
        self.title_box = self._entry(show="")
        self.beat_var = tk.StringVar()
        self.title_box.insert(0, "Nagranie z komputera")
        saved = load_session()
        if saved:
            self.email.insert(0, saved.get("email", ""))
            self.public_url = saved.get("supabaseUrl", "")
            self.public_key = saved.get("anonKey", "")
            self.status.set("Jest zapisana sesja tego konta.")
        self._load_public()
        head = tk.Label(
            self.root,
            text="BitRymDym",
            bg=PAPER,
            fg=AMBER,
            font=("Segoe UI", 18, "bold"),
            anchor="w",
        )
        head.pack(fill="x", padx=16, pady=(14, 0))
        tk.Label(
            self.root,
            text="Nagranie wokalu na bit. Miks i master zostają na stronie.",
            bg=PAPER,
            fg=SOFT,
            font=("Segoe UI", 10),
            anchor="w",
        ).pack(fill="x", padx=16, pady=(0, 8))
        self._row("E-mail", self.email)
        self._row("Hasło", self.password)
        self._row("Tytuł", self.title_box)
        labels = [label for _beat_id, label in self.beats] or ["Brak bitu"]
        if not self.beat_var.get():
            self.beat_var.set(labels[0])
        self.beat_menu = tk.OptionMenu(self.root, self.beat_var, *labels)
        self.beat_menu.configure(
            bg=RACK,
            fg=INK,
            activebackground=PANEL,
            activeforeground=INK,
            highlightthickness=0,
            font=("Segoe UI", 10),
        )
        self._row("Bit", self.beat_menu)
        hear = tk.Frame(self.root, bg=PAPER)
        hear.pack(fill="x", padx=16, pady=2)
        self._button(hear, "Odsłuch z dysku", self.pick_local, RACK, INK).pack(side="left")
        self.local_label = tk.StringVar(value="Bez pliku nagrywasz w ciszy. Bit z listy i tak idzie na konto.")
        tk.Label(
            hear,
            textvariable=self.local_label,
            bg=PAPER,
            fg=SOFT,
            font=("Segoe UI", 9),
            anchor="w",
            wraplength=460,
            justify="left",
        ).pack(side="left", padx=8)
        tk.Label(
            self.root,
            textvariable=self.plan_text,
            bg=PAPER,
            fg=SOFT,
            font=("Segoe UI", 10),
            anchor="w",
            wraplength=640,
            justify="left",
        ).pack(fill="x", padx=16, pady=(8, 2))
        tk.Label(
            self.root,
            text="Efekty na ścieżce wokalu. Słychać je w studiu. Tu nie ma wtyczek VST.",
            bg=PAPER,
            fg=INK,
            font=("Segoe UI", 10),
            anchor="w",
            wraplength=640,
            justify="left",
        ).pack(fill="x", padx=16)
        rack = tk.Frame(self.root, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        rack.pack(fill="x", padx=16, pady=8)
        columns = [tk.Frame(rack, bg=PANEL), tk.Frame(rack, bg=PANEL)]
        columns[0].pack(side="left", fill="both", expand=True, padx=8, pady=6)
        columns[1].pack(side="left", fill="both", expand=True, padx=8, pady=6)
        for index, (fx_id, label) in enumerate(FX):
            var = tk.IntVar(value=0)
            self.fx_vars[fx_id] = var
            tk.Checkbutton(
                columns[0 if index < 8 else 1],
                text=label,
                variable=var,
                command=lambda picked=fx_id: self._on_fx(picked),
                bg=PANEL,
                fg=INK,
                selectcolor=RACK,
                activebackground=PANEL,
                activeforeground=AMBER,
                font=("Segoe UI", 10),
                anchor="w",
            ).pack(fill="x", anchor="w")
        bar = tk.Frame(self.root, bg=PAPER)
        bar.pack(pady=8)
        self._button(bar, "Zaloguj", self.sign_in, AMBER, ON_AMBER).pack(side="left", padx=4)
        self._button(bar, "Nagraj", self.arm, REC, INK).pack(side="left", padx=4)
        self._button(bar, "Stop i wyślij", self.stop_and_send, AMBER, ON_AMBER).pack(side="left", padx=4)
        tk.Label(
            self.root,
            textvariable=self.status,
            wraplength=640,
            justify="left",
            bg=PAPER,
            fg=INK,
            font=("Segoe UI", 10),
        ).pack(fill="x", padx=16, pady=8)
        tk.Label(
            self.root,
            text="Nuty zostają w studio na stronie.",
            bg=PAPER,
            fg=SOFT,
            font=("Segoe UI", 9),
            anchor="w",
        ).pack(fill="x", padx=16)
        self._read_plan()

    def _entry(self, show: str) -> tk.Entry:
        return tk.Entry(
            self.root,
            width=42,
            show=show,
            bg=RACK,
            fg=INK,
            insertbackground=AMBER,
            relief="flat",
            highlightthickness=1,
            highlightbackground=LINE,
            highlightcolor=AMBER,
            font=("Segoe UI", 10),
        )

    def _button(self, parent: tk.Widget, text: str, command: object, bg: str, fg: str) -> tk.Button:
        return tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground=bg,
            activeforeground=fg,
            relief="flat",
            padx=14,
            pady=6,
            font=("Segoe UI", 10, "bold"),
        )

    def _row(self, label: str, widget: tk.Widget) -> None:
        frame = tk.Frame(self.root, bg=PAPER)
        frame.pack(fill="x", padx=16, pady=2)
        tk.Label(
            frame,
            text=label,
            width=16,
            anchor="w",
            bg=PAPER,
            fg=SOFT,
            font=("Segoe UI", 10),
        ).pack(side="left")
        widget.pack(side="left")

    def _load_public(self) -> None:
        try:
            payload = load_bootstrap()
            self.public_url = str(payload["supabaseUrl"])
            self.public_key = str(payload["anonKey"])
            raw = payload.get("beats")
            self.beats = []
            if isinstance(raw, list):
                for beat in raw:
                    if isinstance(beat, dict) and beat.get("id") and beat.get("title"):
                        bpm = beat.get("bpm")
                        label = str(beat["title"])
                        if isinstance(bpm, int) and bpm > 0:
                            label = f"{label} ({bpm} BPM)"
                        self.beats.append((str(beat["id"]), label))
            if self.beats:
                self.beat_var.set(self.beats[0][1])
                self.status.set("Wybierz bit, zaloguj się i nagraj.")
        except Exception as error:
            self.status.set(str(error))

    def selected_fx(self) -> list[str]:
        return [fx_id for fx_id, _label in FX if self.fx_vars[fx_id].get()]

    def _on_fx(self, picked: str) -> None:
        try:
            build_chain(self.selected_fx(), self.tier)
        except ValueError as error:
            text = str(error)
            drop = "sidechain" if "Sidechain" in text and self.fx_vars["sidechain"].get() else picked
            if drop in self.fx_vars:
                self.fx_vars[drop].set(0)
            self.status.set(text)

    def _fit_plan(self) -> None:
        for _ in range(len(FX)):
            try:
                build_chain(self.selected_fx(), self.tier)
                return
            except ValueError as error:
                selected = self.selected_fx()
                if not selected:
                    self.status.set(str(error))
                    return
                drop = "sidechain" if "Sidechain" in str(error) else selected[-1]
                self.fx_vars[drop].set(0)
                self.status.set(str(error))

    def _read_plan(self) -> None:
        saved = load_session()
        token = saved.get("accessToken") if saved else None
        if not token:
            self.tier = "FREE"
            self.plan_text.set("Plan: zaloguj się. Do tego czasu 4 efekty, bez sidechain.")
            return
        try:
            payload = SiteClient(SITE, token).plan_usage()
            tier, cap, side = limits_from_usage(payload)
        except Exception as error:
            self.tier = "FREE"
            self.plan_text.set(str(error))
            return
        self.tier = tier
        side_note = "sidechain jest w planie" if side else "sidechain od Silver"
        self.plan_text.set(f"Plan {display_tier(tier)}. Efekty na ścieżce: {cap}. {side_note}.")
        self._fit_plan()

    def selected_beat_id(self) -> str:
        label = self.beat_var.get()
        for beat_id, beat_label in self.beats:
            if beat_label == label:
                return beat_id
        raise RuntimeError("Najpierw wybierz bit.")

    def token(self) -> str:
        saved = load_session()
        token = saved.get("accessToken") if saved else None
        if not token:
            raise RuntimeError("Najpierw się zaloguj.")
        return token

    def sign_in(self) -> None:
        try:
            if not self.public_url or not self.public_key:
                self._load_public()
            grant = supabase_password_grant(
                self.public_url,
                self.public_key,
                self.email.get().strip(),
                self.password.get(),
            )
            save_session(
                self.public_url,
                self.public_key,
                self.email.get().strip(),
                grant,
            )
            self.password.delete(0, "end")
            self._read_plan()
            self.status.set("Zalogowano. Nagraj wokal, potem wyślij na konto.")
        except Exception as error:
            self.status.set(str(error))

    def pick_local(self) -> None:
        picked = filedialog.askopenfilename(
            title="Bit do odsłuchu",
            filetypes=[("Audio", "*.wav *.mp3"), ("Wszystkie", "*.*")],
        )
        if not picked:
            return
        self.local_beat = Path(picked)
        self.local_label.set(self.local_beat.name)

    def _stop_monitor(self) -> None:
        stop_monitor(self.monitor)
        self.monitor = None

    def arm(self) -> None:
        try:
            if self.capture:
                stop_capture(self.capture)
            self._stop_monitor()
            device = audio_devices(ffmpeg_exe())[0]
            self.capture = start_capture(self.wav_path, device)
            if self.local_beat:
                self.monitor = start_monitor(self.local_beat)
            self.recording = True
            heard = " Odsłuch z dysku leci." if self.monitor else ""
            self.status.set(f"Nagrywam z mikrofonu.{heard} Stop wyśle WAV na konto.")
        except Exception as error:
            self.recording = False
            self.capture = None
            self._stop_monitor()
            self.status.set(str(error))

    def stop_and_send(self) -> None:
        try:
            if not self.recording or not self.capture:
                raise RuntimeError("Najpierw naciśnij Nagraj.")
            self._stop_monitor()
            stop_capture(self.capture)
            self.capture = None
            self.recording = False
            if not self.wav_path.exists() or self.wav_path.stat().st_size < 1000:
                raise RuntimeError("Nagranie jest puste.")
            picked = self.selected_fx()
            chain = build_chain(picked, self.tier)
            project = upload_vocal(
                SiteClient(SITE, self.token()),
                title=self.title_box.get().strip(),
                beat_id=self.selected_beat_id(),
                wav_path=self.wav_path,
                chain=chain,
            )
            fx_note = f" Efekty: {len(picked)}." if picked else ""
            self.status.set(f"Projekt jest na koncie. Otwórz go na stronie.{fx_note} Id: {project}")
        except Exception as error:
            self.recording = False
            self._stop_monitor()
            if self.capture:
                stop_capture(self.capture)
                self.capture = None
            self.status.set(str(error))

    def run(self) -> None:
        self.root.mainloop()


def self_test_wav_roundtrip() -> None:
    """Header check. Uses a generated tone, not the microphone."""
    from record_wav import self_test

    self_test(Path(os.environ.get("TEMP", ".")) / "bitrymdym-recorder-selftest.wav")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        from own_fx import self_test as fx_self_test

        fx_self_test()
        argv = monitor_argv("ffplay", Path("bit.wav"))
        if "-nodisp" not in argv or argv[-1] != "bit.wav":
            raise SystemExit("odsłuch")
        self_test_wav_roundtrip()
        target = Path(os.environ.get("TEMP", ".")) / "bitrymdym-mic-selftest.wav"
        record_seconds(target, 0.4)
        target.unlink(missing_ok=True)
        print("recorder self-test ok")
    else:
        # Keep the WAV writer available for a silent tone when the mic is closed.
        _ = write_pcm16_wav
        RecorderWindow().run()
