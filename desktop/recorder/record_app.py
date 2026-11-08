"""Windows recorder. Mic to WAV, then the existing account, site, and project.

Run from this folder: python record_app.py
Effects are the site chain, saved on the vocal track. Mix, master, and notes
stay on the site. This program does not load VST plugins.
"""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
import tkinter as tk
import webbrowser
from datetime import datetime
from tkinter import filedialog
import urllib.error
import urllib.request
from pathlib import Path

from account_upload import SITE, upload_vocal, SiteClient
from desk import max_take_seconds, read_prefs, studio_url, tail_peak_db, wav_seconds, write_prefs
from own_fx import FX, build_chain, display_tier, limits_from_usage
from record_wav import write_pcm16_wav

# tokens.css dark tape deck. Fonts are the site fallbacks installed on Windows:
# Georgia for Source Serif 4, Arial Narrow for Big Shoulders, Consolas for IBM Plex Mono.
PAPER = "#0e0c0a"
PANEL = "#17130f"
RACK = "#211b15"
INK = "#f1e7d3"
SOFT = "#cdbfa6"
MUTE = "#9e8f78"
AMBER = "#f2a93b"
AMBER_SOFT = "#f7bb5c"
AMBER_DEEP = "#b9761e"
ON_AMBER = "#1a1006"
LINE = "#3a3028"
LINE_STRONG = "#5c4c3c"
REC = "#ff4b36"
REC_DEEP = "#8d2418"
FONT_POSTER = "Arial Narrow"
FONT_DISPLAY = "Georgia"
FONT_UI = "Segoe UI"
FONT_META = "Consolas"

SESSION = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-session.json"
PREFS = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-prefs.json"
TAKES = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "takes"


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
        self.root.geometry("760x980")
        self.root.minsize(720, 860)
        self.root.configure(bg=PAPER)
        self.recording = False
        self.capture: subprocess.Popen[bytes] | None = None
        self.monitor: subprocess.Popen[bytes] | None = None
        self.local_beat: Path | None = None
        self.wav_path = Path(os.environ.get("TEMP", ".")) / "bitrymdym-vocal.wav"
        self.takes: list[Path] = []
        self.project_id = ""
        self._tick_id: str | None = None
        self.devices: list[str] = []
        try:
            self.devices = audio_devices(ffmpeg_exe())
        except Exception as error:
            self.status_boot = str(error)
        else:
            self.status_boot = ""
        self.public_url = ""
        self.public_key = ""
        self.beats: list[tuple[str, str]] = []
        self.tier = "FREE"
        self.fx_vars: dict[str, tk.IntVar] = {}
        self.status = tk.StringVar(value="Ładuję listę bitów ze strony.")
        self.plan_text = tk.StringVar(
            value="Plan: zaloguj się. Do tego czasu 4 efekty, nagranie do 30 s, bez sidechain."
        )
        self.clock = tk.StringVar(value="0.0 s / 30 s")
        self.device_var = tk.StringVar(value=self.devices[0] if self.devices else "Brak mikrofonu")
        self.beat_var = tk.StringVar()
        saved = load_session()
        if saved:
            self.public_url = saved.get("supabaseUrl", "")
            self.public_key = saved.get("anonKey", "")
            self.status.set("Jest zapisana sesja tego konta.")
        self._load_public()
        self._build_deck()
        self._build_account(saved if isinstance(saved, dict) else None)
        self._build_effects()
        self._build_transport()
        self.beat_var.trace_add("write", lambda *_args: self._sync_cassette())
        self._sync_cassette()
        self._paint_lamp()
        self._draw_meter(-96.0)
        self._load_prefs()
        self._read_plan()
        if self.status_boot:
            self.status.set(self.status_boot)

    def _build_deck(self) -> None:
        tk.Label(
            self.root,
            text="NAGRYWARKA",
            bg=PAPER,
            fg=MUTE,
            font=(FONT_META, 9),
            anchor="w",
        ).pack(fill="x", padx=18, pady=(12, 0))
        tk.Label(
            self.root,
            text="BitRymDym",
            bg=PAPER,
            fg=INK,
            font=(FONT_DISPLAY, 28, "italic"),
            anchor="w",
        ).pack(fill="x", padx=18)
        rule = tk.Frame(self.root, bg=AMBER, height=3)
        rule.pack_propagate(False)
        rule.pack(fill="x", padx=18, pady=(2, 8))
        deck = tk.Frame(
            self.root,
            bg=PANEL,
            highlightbackground=LINE_STRONG,
            highlightthickness=1,
        )
        deck.pack(fill="x", padx=18)
        face = tk.Frame(deck, bg=PANEL)
        face.pack(fill="x", padx=14, pady=(10, 6))
        tk.Label(
            face,
            text="DECK A",
            bg=PANEL,
            fg=SOFT,
            font=(FONT_POSTER, 14, "bold"),
        ).pack(side="left")
        side = tk.Frame(face, bg=PANEL)
        side.pack(side="right")
        lamp_row = tk.Frame(side, bg=PANEL)
        lamp_row.pack(anchor="e")
        self.lamp = tk.Canvas(lamp_row, width=12, height=12, bg=PANEL, highlightthickness=0)
        self.lamp.pack(side="left", padx=(0, 6))
        self.lamp_text = tk.Label(
            lamp_row,
            text="STOP",
            bg=PANEL,
            fg=MUTE,
            font=(FONT_META, 9),
        )
        self.lamp_text.pack(side="left")
        tk.Label(
            side,
            textvariable=self.clock,
            bg=PANEL,
            fg=INK,
            font=(FONT_META, 12),
        ).pack(anchor="e")
        shell = tk.Frame(deck, bg="#2a221a", highlightbackground="#4a3d30", highlightthickness=1)
        shell.pack(fill="x", padx=14, pady=(4, 8))
        paper = tk.Frame(shell, bg=INK)
        paper.pack(fill="x", padx=12, pady=12)
        head = tk.Frame(paper, bg=INK)
        head.pack(fill="x", padx=10, pady=(8, 0))
        ink_rule = tk.Frame(paper, bg=ON_AMBER, height=2)
        ink_rule.pack_propagate(False)
        ink_rule.pack(fill="x", padx=10, pady=(4, 0))
        tk.Label(
            head,
            text="STRONA A",
            bg=INK,
            fg=ON_AMBER,
            font=(FONT_POSTER, 12, "bold"),
        ).pack(side="left")
        self.cassette_meta = tk.Label(
            head,
            text="—",
            bg=INK,
            fg=ON_AMBER,
            font=(FONT_META, 9),
        )
        self.cassette_meta.pack(side="right")
        self.cassette_title = tk.Label(
            paper,
            text="Katalog czeka",
            bg=INK,
            fg=ON_AMBER,
            font=(FONT_DISPLAY, 18, "italic"),
            anchor="w",
        )
        self.cassette_title.pack(fill="x", padx=10, pady=(4, 0))
        tk.Label(
            paper,
            text="BITRYMDYM",
            bg=INK,
            fg=ON_AMBER,
            font=(FONT_META, 9),
            anchor="w",
        ).pack(fill="x", padx=10)
        window = tk.Canvas(
            paper,
            width=560,
            height=58,
            bg="#17120d",
            highlightthickness=2,
            highlightbackground=ON_AMBER,
        )
        window.pack(fill="x", padx=36, pady=(6, 10))
        self._draw_reels(window)
        transport = tk.Frame(deck, bg=PANEL)
        transport.pack(fill="x", padx=14, pady=(0, 12))
        self._build_vu(transport)
        self._button(transport, "Nagraj", self.arm, REC, INK).pack(side="right", padx=(12, 0))

    def _vu_point(self, level: float, radius: float) -> tuple[float, float]:
        rad = math.radians(210 + max(0.0, min(1.0, level)) * 120)
        return (120 + math.cos(rad) * radius, 66 + math.sin(rad) * radius)

    def _build_vu(self, parent: tk.Widget) -> None:
        self.meter = tk.Canvas(
            parent,
            width=240,
            height=72,
            bg="#efe0bd",
            highlightthickness=1,
            highlightbackground=LINE_STRONG,
        )
        self.meter.pack(side="left")
        for index in range(11):
            outer = self._vu_point(index / 10, 50)
            inner = self._vu_point(index / 10, 40 if index % 5 else 36)
            self.meter.create_line(
                *inner,
                *outer,
                fill="#d0381f" if index > 7 else "#2a1d10",
                width=2,
            )
        self.meter.create_text(
            120,
            54,
            text="VU",
            fill="#2a1d10",
            font=(FONT_POSTER, 11, "bold"),
        )

    def _draw_reels(self, canvas: tk.Canvas) -> None:
        canvas.create_rectangle(150, 22, 410, 36, fill="#3b2c1d", outline="")
        for cx in (100, 460):
            canvas.create_oval(cx - 22, 6, cx + 22, 50, outline=INK, width=2)
            canvas.create_oval(cx - 5, 23, cx + 5, 33, fill=INK, outline="")
            for step in range(6):
                rad = math.radians(step * 60)
                canvas.create_line(
                    cx + math.cos(rad) * 8,
                    28 + math.sin(rad) * 8,
                    cx + math.cos(rad) * 18,
                    28 + math.sin(rad) * 18,
                    fill=INK,
                    width=2,
                )

    def _sync_cassette(self) -> None:
        label = self.beat_var.get().strip() or "Katalog czeka"
        title = label
        meta = "—"
        if label.endswith(")") and " (" in label:
            title, meta = label.rsplit(" (", 1)
            meta = meta[:-1]
        self.cassette_title.configure(text=title)
        self.cassette_meta.configure(text=meta)

    def _paint_lamp(self) -> None:
        self.lamp.delete("all")
        color = REC if self.recording else LINE_STRONG
        self.lamp.create_oval(1, 1, 11, 11, fill=color, outline=color)
        self.lamp_text.configure(text="NAGRYWA" if self.recording else "STOP")

    def _build_account(self, saved: dict[str, str] | None) -> None:
        block = tk.Frame(self.root, bg=PAPER)
        block.pack(fill="x", padx=18, pady=(10, 0))
        tk.Label(
            block,
            text="KONTO",
            bg=PAPER,
            fg=MUTE,
            font=(FONT_META, 9),
            anchor="w",
        ).pack(fill="x")
        self.email = self._entry(self._row(block, "E-mail"), "")
        self.password = self._entry(self._row(block, "Hasło"), "*")
        self.title_box = self._entry(self._row(block, "Tytuł"), "")
        self.title_box.insert(0, "Nagranie z komputera")
        if saved:
            self.email.insert(0, saved.get("email", ""))
        labels = [label for _beat_id, label in self.beats] or ["Brak bitu"]
        if not self.beat_var.get():
            self.beat_var.set(labels[0])
        self.beat_menu = self._menu(self._row(block, "Bit"), self.beat_var, labels)
        device_labels = self.devices or ["Brak mikrofonu"]
        self.device_menu = self._menu(self._row(block, "Mikrofon"), self.device_var, device_labels)
        hear = tk.Frame(block, bg=PAPER)
        hear.pack(fill="x", pady=(6, 0))
        self._button(hear, "Odsłuch z dysku", self.pick_local, RACK, INK).pack(side="left")
        self.local_label = tk.StringVar(value="Bez pliku nagrywasz w ciszy. Bit z listy i tak idzie na konto.")
        tk.Label(
            hear,
            textvariable=self.local_label,
            bg=PAPER,
            fg=SOFT,
            font=(FONT_UI, 9),
            anchor="w",
            wraplength=460,
            justify="left",
        ).pack(side="left", padx=8)

    def _build_effects(self) -> None:
        tk.Label(
            self.root,
            textvariable=self.plan_text,
            bg=PAPER,
            fg=SOFT,
            font=(FONT_UI, 10),
            anchor="w",
            wraplength=700,
            justify="left",
        ).pack(fill="x", padx=18, pady=(8, 2))
        tk.Label(
            self.root,
            text="EFEKTY  ·  SŁYCHAĆ JE W STUDIU. TU NIE MA WTYCZEK VST.",
            bg=PAPER,
            fg=MUTE,
            font=(FONT_META, 9),
            anchor="w",
        ).pack(fill="x", padx=18)
        rack = tk.Frame(self.root, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        rack.pack(fill="x", padx=18, pady=6)
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
                font=(FONT_UI, 10),
                anchor="w",
            ).pack(fill="x", anchor="w")

    def _build_transport(self) -> None:
        bar = tk.Frame(self.root, bg=PAPER)
        bar.pack(pady=8)
        self._button(bar, "Zaloguj", self.sign_in, AMBER, ON_AMBER).pack(side="left", padx=4)
        self._button(bar, "Stop", self.stop_take, RACK, INK).pack(side="left", padx=4)
        self._button(bar, "Wyślij", self.send_selected, AMBER, ON_AMBER).pack(side="left", padx=4)
        self._button(bar, "Stop i wyślij", self.stop_and_send, AMBER, ON_AMBER).pack(side="left", padx=4)
        self.open_button = self._button(bar, "Studio", self.open_studio, RACK, INK)
        self.open_button.pack(side="left", padx=4)
        self.take_list = tk.Listbox(
            self.root,
            height=4,
            bg=RACK,
            fg=INK,
            selectbackground=AMBER,
            selectforeground=ON_AMBER,
            highlightthickness=1,
            highlightbackground=LINE,
            relief="flat",
            font=(FONT_UI, 10),
        )
        self.take_list.pack(fill="x", padx=18, pady=4)
        tk.Label(
            self.root,
            textvariable=self.status,
            wraplength=700,
            justify="left",
            bg=PAPER,
            fg=INK,
            font=(FONT_UI, 10),
        ).pack(fill="x", padx=18, pady=8)
        tk.Label(
            self.root,
            text="Nuty zostają w studio na stronie. Miks i master też.",
            bg=PAPER,
            fg=SOFT,
            font=(FONT_UI, 9),
            anchor="w",
        ).pack(fill="x", padx=18)

    def _entry(self, parent: tk.Widget, show: str) -> tk.Entry:
        box = tk.Entry(
            parent,
            width=42,
            show=show,
            bg=RACK,
            fg=INK,
            insertbackground=AMBER,
            relief="flat",
            highlightthickness=1,
            highlightbackground=LINE,
            highlightcolor=AMBER,
            font=(FONT_UI, 10),
        )
        box.pack(side="left", fill="x", expand=True, ipady=4)
        return box

    def _menu(self, parent: tk.Widget, variable: tk.StringVar, labels: list[str]) -> tk.OptionMenu:
        menu = tk.OptionMenu(parent, variable, *labels)
        menu.configure(
            bg=RACK,
            fg=INK,
            activebackground=PANEL,
            activeforeground=INK,
            highlightthickness=0,
            font=(FONT_UI, 10),
            relief="flat",
        )
        menu.pack(side="left", fill="x")
        menu["menu"].configure(
            bg=RACK,
            fg=INK,
            activebackground=AMBER,
            activeforeground=ON_AMBER,
            font=(FONT_UI, 10),
            relief="flat",
        )
        return menu

    def _button(self, parent: tk.Widget, text: str, command: object, bg: str, fg: str) -> tk.Frame:
        solid = bg in (AMBER, REC)
        edge = AMBER_DEEP if bg == AMBER else REC_DEEP if bg == REC else LINE_STRONG
        shell = tk.Frame(parent, bg=edge)
        tk.Button(
            shell,
            text=text.upper(),
            command=command,
            bg=bg,
            fg=fg,
            activebackground=AMBER_SOFT if bg == AMBER else bg,
            activeforeground=fg,
            relief="flat",
            bd=0,
            padx=12,
            pady=7,
            font=(FONT_POSTER, 13, "bold"),
            cursor="hand2",
        ).pack(fill="x", pady=(0, 3) if solid else (1, 1), padx=0 if solid else 1)
        return shell

    def _row(self, parent: tk.Widget, label: str) -> tk.Frame:
        frame = tk.Frame(parent, bg=PAPER)
        frame.pack(fill="x", pady=3)
        tk.Label(
            frame,
            text=label.upper(),
            width=14,
            anchor="w",
            bg=PAPER,
            fg=MUTE,
            font=(FONT_META, 9),
        ).pack(side="left")
        slot = tk.Frame(frame, bg=PAPER)
        slot.pack(side="left", fill="x", expand=True)
        return slot

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
            self.plan_text.set("Plan: zaloguj się. Do tego czasu 4 efekty, nagranie do 30 s, bez sidechain.")
            self.clock.set("0.0 s / 30 s")
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
        seconds = max_take_seconds(tier)
        self.plan_text.set(
            f"Plan {display_tier(tier)}. Efekty na ścieżce: {cap}. Nagranie do {seconds} s. {side_note}."
        )
        self.clock.set(f"0.0 s / {seconds} s")
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

    def selected_device(self) -> str:
        name = self.device_var.get()
        if name in self.devices:
            return name
        if self.devices:
            return self.devices[0]
        raise RuntimeError("Windows nie pokazał mikrofonu.")

    def _cancel_tick(self) -> None:
        if self._tick_id:
            self.root.after_cancel(self._tick_id)
            self._tick_id = None

    def _draw_meter(self, db: float) -> None:
        level = max(0.0, min(1.0, (db + 60.0) / 60.0))
        tip = self._vu_point(level, 48)
        self.meter.delete("needle")
        self.meter.create_line(120, 66, tip[0], tip[1], fill=ON_AMBER, width=2, tags="needle")
        self._paint_lamp()

    def _tick(self) -> None:
        if not self.recording:
            return
        seconds = wav_seconds(self.wav_path.stat().st_size) if self.wav_path.exists() else 0.0
        cap = max_take_seconds(self.tier)
        self.clock.set(f"{seconds:.1f} s / {cap} s")
        self._draw_meter(tail_peak_db(self.wav_path))
        if seconds >= cap:
            try:
                self._finish_take()
            except Exception as error:
                self.status.set(str(error))
                return
            self.status.set(f"Plan {display_tier(self.tier)} kończy nagranie po {cap} s. Ujęcie jest na liście.")
            return
        self._tick_id = self.root.after(200, self._tick)

    def _add_take(self, path: Path) -> None:
        self.takes.append(path)
        self.take_list.insert("end", path.name)
        self.take_list.selection_clear(0, "end")
        self.take_list.selection_set("end")

    def selected_take(self) -> Path:
        picked = self.take_list.curselection()
        if not picked:
            raise RuntimeError("Najpierw nagraj ujęcie.")
        return self.takes[int(picked[0])]

    def _save_prefs(self) -> None:
        write_prefs(
            PREFS,
            {
                "device": self.device_var.get(),
                "title": self.title_box.get().strip(),
                "effects": self.selected_fx(),
                "beat": self.beat_var.get(),
            },
        )

    def _load_prefs(self) -> None:
        try:
            prefs = read_prefs(PREFS)
        except (OSError, json.JSONDecodeError):
            return
        title = prefs.get("title")
        if isinstance(title, str) and title:
            self.title_box.delete(0, "end")
            self.title_box.insert(0, title)
        device = prefs.get("device")
        if isinstance(device, str) and device in self.devices:
            self.device_var.set(device)
        beat = prefs.get("beat")
        labels = [label for _beat_id, label in self.beats]
        if isinstance(beat, str) and beat in labels:
            self.beat_var.set(beat)
        effects = prefs.get("effects")
        if isinstance(effects, list):
            for fx_id, var in self.fx_vars.items():
                var.set(1 if fx_id in effects else 0)
            self._fit_plan()

    def _finish_take(self) -> Path:
        self._cancel_tick()
        self._stop_monitor()
        if self.capture:
            stop_capture(self.capture)
            self.capture = None
        self.recording = False
        self._paint_lamp()
        if not self.wav_path.exists() or self.wav_path.stat().st_size < 1000:
            raise RuntimeError("Nagranie jest puste.")
        self._add_take(self.wav_path)
        self._save_prefs()
        self.clock.set(f"{wav_seconds(self.wav_path.stat().st_size):.1f} s / {max_take_seconds(self.tier)} s")
        return self.wav_path

    def _upload(self, path: Path) -> None:
        picked = self.selected_fx()
        chain = build_chain(picked, self.tier)
        project = upload_vocal(
            SiteClient(SITE, self.token()),
            title=self.title_box.get().strip(),
            beat_id=self.selected_beat_id(),
            wav_path=path,
            chain=chain,
        )
        self.project_id = project
        fx_note = f" Efekty: {len(picked)}." if picked else ""
        self.status.set(f"Projekt jest na koncie.{fx_note} Id: {project}")

    def arm(self) -> None:
        try:
            if self.capture:
                stop_capture(self.capture)
            self._cancel_tick()
            self._stop_monitor()
            TAKES.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%H%M%S")
            self.wav_path = TAKES / f"ujecie-{stamp}.wav"
            self.capture = start_capture(self.wav_path, self.selected_device())
            if self.local_beat:
                self.monitor = start_monitor(self.local_beat)
            self.recording = True
            heard = " Odsłuch z dysku leci." if self.monitor else ""
            self.status.set(f"Nagrywam z mikrofonu.{heard} Stop zostawia ujęcie na liście.")
            self._tick()
        except Exception as error:
            self.recording = False
            self.capture = None
            self._cancel_tick()
            self._stop_monitor()
            self._paint_lamp()
            self.status.set(str(error))

    def stop_take(self) -> None:
        try:
            if not self.recording or not self.capture:
                raise RuntimeError("Najpierw naciśnij Nagraj.")
            self._finish_take()
            self.status.set("Ujęcie jest na liście. Wyślij wrzuca je na konto.")
        except Exception as error:
            self._cancel_tick()
            self.recording = False
            self._stop_monitor()
            if self.capture:
                stop_capture(self.capture)
                self.capture = None
            self._paint_lamp()
            self.status.set(str(error))

    def send_selected(self) -> None:
        try:
            path = self._finish_take() if self.recording else self.selected_take()
            self._upload(path)
        except Exception as error:
            self._cancel_tick()
            self.recording = False
            self._stop_monitor()
            if self.capture:
                stop_capture(self.capture)
                self.capture = None
            self._paint_lamp()
            self.status.set(str(error))

    def stop_and_send(self) -> None:
        self.send_selected()

    def open_studio(self) -> None:
        if not self.project_id:
            self.status.set("Najpierw wyślij ujęcie.")
            return
        webbrowser.open(studio_url(SITE, self.project_id))

    def run(self) -> None:
        self.root.mainloop()


def self_test_wav_roundtrip() -> None:
    """Header check. Uses a generated tone, not the microphone."""
    from record_wav import self_test

    self_test(Path(os.environ.get("TEMP", ".")) / "bitrymdym-recorder-selftest.wav")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        from own_fx import self_test as fx_self_test

        from desk import self_test as desk_self_test

        desk_self_test()
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
