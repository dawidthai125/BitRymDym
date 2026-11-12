"""Windows recorder. Mic to WAV, then the existing account, site, and project.

Run from this folder: python record_app.py
Effects are the site chain, saved on the vocal track. Mix, master, and notes
stay on the site. This program does not load VST plugins.
"""

from __future__ import annotations

import ctypes
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time
import tkinter as tk
import tkinter.font as tkfont
import tkinter.ttk as ttk
import webbrowser
from datetime import datetime
from tkinter import filedialog, messagebox
import urllib.error
import urllib.request
from pathlib import Path

import updater
from account_upload import (
    NETWORK_ERRORS,
    SITE,
    SiteClient,
    UploadState,
    is_unauthorized,
    network_message,
    playback_target,
    upload_vocals,
)
from desk import (
    fold_peaks,
    quality_note,
    scan_capture_log,
    level_text,
    list_saved_takes,
    max_recording_tracks,
    max_take_seconds,
    open_session,
    probe_hint,
    read_file_range,
    read_prefs,
    seal_session,
    studio_url,
    tail_peak_db,
    wav_data_offset_of,
    wav_seconds,
    write_prefs,
)
from own_fx import FX, build_chain, display_tier, limits_from_usage
from record_wav import edit_span, read_mono16, replace_mono16, take_stats, write_pcm16_wav

# tokens.css dark tape deck. Families match src/app/layout.tsx.
# ExtraBold is the poster face (Big Shoulders 800). Fallbacks are the site stack.
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


def bind_site_fonts(root: tk.Misc) -> None:
    global FONT_POSTER, FONT_DISPLAY, FONT_UI, FONT_META
    names = set(tkfont.families(root))

    def pick(name: str, fallback: str) -> str:
        return name if name in names else fallback

    FONT_DISPLAY = pick("Source Serif 4", "Georgia")
    FONT_UI = pick("Schibsted Grotesk", "Segoe UI")
    FONT_META = pick("IBM Plex Mono", "Consolas")
    FONT_POSTER = pick("Big Shoulders ExtraBold", "Arial Narrow")


def app_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def brand_file(name: str) -> Path | None:
    roots: list[Path] = []
    bundled = getattr(sys, "_MEIPASS", None)
    if isinstance(bundled, str) and bundled:
        roots.append(Path(bundled))
    roots.append(Path(__file__).resolve().parent)
    roots.append(app_dir())
    for root in roots:
        path = root / "assets" / name
        if path.is_file():
            return path
    return None


def dpi_scale() -> float:
    """Window sizes are in physical pixels. At 150% a 520 px window clips the login."""
    if os.name != "nt":
        return 1.0
    try:
        dpi = int(ctypes.windll.user32.GetDpiForSystem())
    except Exception:
        return 1.0
    if dpi < 96:
        return 1.0
    return dpi / 96


def windows_app_id() -> None:
    if os.name != "nt":
        return
    import ctypes

    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("pl.bitrymdym.nagrywarka")


def load_user_fonts() -> None:
    if os.name != "nt":
        return
    folders = [app_dir() / "fonts"]
    user_fonts = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "Windows" / "Fonts"
    if user_fonts.is_dir():
        folders.append(user_fonts)
    import ctypes

    add = ctypes.windll.gdi32.AddFontResourceW
    for folder in folders:
        if not folder.is_dir():
            continue
        for path in folder.glob("*.ttf"):
            if path.name.startswith(("SourceSerif4", "SchibstedGrotesk", "BigShoulders", "IBMPlexMono")):
                add(str(path))


SESSION = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-session.json"
PREFS = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-prefs.json"
PENDING = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-upload.json"
TAKES = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "takes"


def first_file(paths: list[Path]) -> Path | None:
    for path in paths:
        if path.is_file():
            return path
    return None


def ffmpeg_exe() -> str:
    bundled = app_dir() / "ffmpeg.exe"
    found = shutil.which("ffmpeg")
    root = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    matches = sorted(root.glob("Gyan.FFmpeg*/ffmpeg-*/bin/ffmpeg.exe"))
    picked = first_file([bundled, Path(found) if found else Path(), *matches])
    if picked is None:
        raise RuntimeError("Brak ffmpeg. Bez niego mikrofon Intel się nie otworzy.")
    return str(picked)


def find_tool(name: str, folders: list[Path], on_path: str | None) -> str | None:
    """A copy next to the program wins, so the installed app does not depend on what else is on this PC."""
    for folder in folders:
        candidate = folder / f"{name}.exe"
        if candidate.is_file():
            return str(candidate)
    return on_path


NO_FFPLAY = "Brak ffplay. Zainstaluj program jeszcze raz (ffplay jest w instalatorze) albo dodaj ffplay do PATH."


def ffplay_exe() -> str | None:
    folders = [app_dir()]
    try:
        folders.append(Path(ffmpeg_exe()).parent)
    except RuntimeError:
        pass
    root = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
    folders.extend(sorted(path.parent for path in root.glob("Gyan.FFmpeg*/ffmpeg-*/bin/ffplay.exe")))
    return find_tool("ffplay", folders, shutil.which("ffplay"))


# Device default is often hundreds of ms and shifts the vocal late against the beat.
MIC_BUFFER_MS = 20
# Max backlog before ffmpeg drops mic frames. 64k was under 0.7 s at 48 kHz mono and
# lost samples when the PC stalled; a larger cap does not add latency (the 20 ms device buffer does).
MIC_RTBUF = "256k"


def monitor_argv(exe: str, target: str | Path, limit_seconds: int | None = None) -> list[str]:
    remote = "://" in str(target)
    argv = [
        exe,
        "-nodisp",
        "-autoexit",
        "-loglevel",
        "error",
        "-fflags",
        "nobuffer",
        "-flags",
        "low_delay",
        "-probesize",
        "32768" if remote else "32",
        "-analyzeduration",
        "0",
        "-sync",
        "ext",
    ]
    if isinstance(limit_seconds, int) and limit_seconds > 0:
        argv.extend(["-t", str(limit_seconds)])
    argv.append(str(target))
    return argv


def quiet_kwargs() -> dict[str, object]:
    """ffmpeg and ffplay are console programs. A windowed app otherwise pops a black console."""
    if os.name != "nt":
        return {}
    info = subprocess.STARTUPINFO()
    info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    info.wShowWindow = subprocess.SW_HIDE
    return {"creationflags": subprocess.CREATE_NO_WINDOW, "startupinfo": info}


def start_mix(ffmpeg: str, ffplay: str, argv: list[str]) -> tuple[subprocess.Popen[bytes], subprocess.Popen[bytes]]:
    """One mix to the default Windows output. The beat URL is not written to disk."""
    feed = subprocess.Popen(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        **quiet_kwargs(),
    )
    play = subprocess.Popen(
        monitor_argv(ffplay, "pipe:0"),
        stdin=feed.stdout,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        **quiet_kwargs(),
    )
    if feed.stdout is not None:
        feed.stdout.close()
    return feed, play


def beat_ceiling(ffmpeg: str, target: str, seconds: int = 12) -> float | None:
    """Peak of the listen stream, 0..1. Nothing is saved."""
    proc = subprocess.run(
        [ffmpeg, "-hide_banner", "-t", str(seconds), "-i", target, "-af", "volumedetect", "-f", "null", "-"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=False,
        **quiet_kwargs(),
    )
    text = proc.stderr.decode("utf-8", "replace") if proc.stderr else ""
    for line in text.splitlines():
        if "max_volume:" not in line:
            continue
        raw = line.split("max_volume:", 1)[1].strip().split()[0]
        if raw in {"-inf", "inf"}:
            return None
        try:
            db = float(raw)
        except ValueError:
            return None
        return max(0.0, min(1.0, 10 ** (db / 20)))
    return None


def pan_gains(pan: float) -> tuple[float, float]:
    """-1 is the left channel, +1 is the right. Center keeps both at the same level."""
    bounded = max(-1.0, min(1.0, pan))
    angle = (bounded + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def mix_argv(
    ffmpeg: str,
    beat: str | None,
    vocals: list[tuple[Path, float, float]],
    limit: int | None,
) -> list[str]:
    argv = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin"]
    stems: list[tuple[float, float]] = []
    if beat:
        if isinstance(limit, int) and limit > 0:
            argv.extend(["-t", str(limit)])
        argv.extend(["-i", beat])
        stems.append((0.85, 0.0))
    for path, gain_db, pan in vocals:
        argv.extend(["-i", str(path)])
        stems.append((max(0.0, min(4.0, 10 ** (gain_db / 20))), pan))
    if not stems:
        raise RuntimeError("Najpierw nagraj wokal albo wybierz bit.")
    bodies: list[str] = []
    tags: list[str] = []
    for index, (volume, pan) in enumerate(stems):
        left, right = pan_gains(pan)
        tag = f"a{index}"
        bodies.append(
            f"[{index}:a]aformat=channel_layouts=mono,volume={volume:.4f},"
            f"pan=stereo|c0={left:.4f}*c0|c1={right:.4f}*c0[{tag}]"
        )
        tags.append(f"[{tag}]")
    if len(tags) == 1:
        graph = bodies[0][: -len(tags[0])] + "[out]"
    else:
        graph = ";".join(bodies) + f";{''.join(tags)}amix=inputs={len(tags)}:duration=longest:normalize=0[out]"
    argv.extend(["-filter_complex", graph, "-map", "[out]", "-f", "wav", "pipe:1"])
    return argv


def start_monitor(target: str | Path, limit_seconds: int | None = None) -> subprocess.Popen[bytes] | None:
    exe = ffplay_exe()
    text = str(target)
    remote = "://" in text
    if exe is None or (not remote and not Path(text).exists()):
        return None
    return subprocess.Popen(
        monitor_argv(exe, text, limit_seconds),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        **quiet_kwargs(),
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
        **quiet_kwargs(),
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


def capture_argv(exe: str, device: str, path: Path, seconds: float | None = None) -> list[str]:
    argv = [
        exe,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "dshow",
        "-audio_buffer_size",
        str(MIC_BUFFER_MS),
        "-rtbufsize",
        MIC_RTBUF,
        "-i",
        f"audio={device}",
        "-ac",
        "1",
        "-ar",
        "48000",
        "-c:a",
        "pcm_s16le",
    ]
    if seconds is not None:
        argv.extend(["-t", str(seconds)])
    argv.append(str(path))
    return argv


def capture_log_path(path: Path) -> Path:
    return path.with_suffix(".log")


def start_capture(path: Path, device: str) -> subprocess.Popen[bytes]:
    path.parent.mkdir(parents=True, exist_ok=True)
    # ffmpeg errors go to a file: dropped mic frames and a dead device are visible afterwards.
    with capture_log_path(path).open("wb") as log:
        return subprocess.Popen(
            capture_argv(ffmpeg_exe(), device, path),
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=log,
            **quiet_kwargs(),
        )


def read_capture_log(path: Path, remove: bool = True) -> tuple[int, str]:
    log = capture_log_path(path)
    try:
        text = log.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 0, ""
    if remove:
        try:
            log.unlink()
        except OSError:
            pass
    return scan_capture_log(text)


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
        capture_argv(exe, device, path, seconds),
        capture_output=True,
        check=False,
        **quiet_kwargs(),
    )
    if proc.returncode != 0 or not path.exists() or path.stat().st_size < 1000:
        raise RuntimeError("Mikrofon nie oddał WAV.")


def load_bootstrap() -> dict[str, object]:
    request = urllib.request.Request(
        f"{SITE}/api/desktop/bootstrap",
        headers={"Accept": "application/json", "User-Agent": "BitRymDymRecorder"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Strona nie oddała danych logowania (kod {error.code}). Spróbuj za chwilę.") from None
    except NETWORK_ERRORS as error:
        raise RuntimeError(network_message(error)) from None
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
        if error.code == 429:
            raise RuntimeError("Za dużo prób logowania. Poczekaj minutę i spróbuj jeszcze raz.") from None
        if error.code in (400, 401, 403, 422):
            raise RuntimeError("Logowanie nie weszło. Sprawdź e-mail i hasło.") from None
        raise RuntimeError(f"Serwer logowania nie odpowiada (kod {error.code}). Spróbuj za chwilę.") from None
    except NETWORK_ERRORS as error:
        raise RuntimeError(network_message(error)) from None
    token = payload.get("access_token")
    if not isinstance(token, str) or token.count(".") != 2:
        raise RuntimeError("Konto nie oddało tokenu.")
    return {"access_token": token, "refresh_token": str(payload.get("refresh_token") or "")}


def save_session(url: str, anon_key: str, email: str, grant: dict[str, str]) -> None:
    """Tokens are sealed with Windows DPAPI (only this Windows user can read them)."""
    SESSION.parent.mkdir(parents=True, exist_ok=True)
    session = {
        "supabaseUrl": url,
        "anonKey": anon_key,
        "email": email,
        "accessToken": grant["access_token"],
        "refreshToken": grant["refresh_token"],
    }
    SESSION.write_text(json.dumps(seal_session(session)), encoding="utf-8")


def load_session() -> dict[str, str] | None:
    if not SESSION.exists():
        return None
    try:
        raw = json.loads(SESSION.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    session, reseal = open_session(raw)
    if session is None or not session.get("accessToken"):
        return None
    if reseal and os.name == "nt":
        # An older plain file: seal it now so the tokens stop sitting in the clear.
        try:
            SESSION.write_text(json.dumps(seal_session(session)), encoding="utf-8")
        except OSError:
            pass
    return session


def load_pending() -> UploadState | None:
    """A send that stopped half way. Only usable while its WAV files are still on disk."""
    try:
        state = UploadState.from_json(json.loads(PENDING.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        return None
    if state is None or not all(Path(item).is_file() for item in state.wav_paths):
        return None
    return state


def save_pending(state: UploadState) -> None:
    try:
        PENDING.parent.mkdir(parents=True, exist_ok=True)
        PENDING.write_text(json.dumps(state.to_json()), encoding="utf-8")
    except OSError:
        pass


def clear_pending() -> None:
    try:
        PENDING.unlink()
    except OSError:
        pass


def supabase_refresh_grant(url: str, anon_key: str, refresh_token: str) -> dict[str, str]:
    body = json.dumps({"refresh_token": refresh_token}).encode("utf-8")
    request = urllib.request.Request(
        f"{url.rstrip('/')}/auth/v1/token?grant_type=refresh_token",
        data=body,
        method="POST",
        headers={"apikey": anon_key, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        if error.code in (400, 401, 403, 422):
            raise RuntimeError("Sesja wygasła. Zaloguj się jeszcze raz.") from None
        raise RuntimeError(f"Serwer logowania nie odpowiada (kod {error.code}). Spróbuj za chwilę.") from None
    except NETWORK_ERRORS as error:
        raise RuntimeError(network_message(error)) from None
    token = payload.get("access_token")
    if not isinstance(token, str) or token.count(".") != 2:
        raise RuntimeError("Sesja wygasła. Zaloguj się jeszcze raz.")
    return {"access_token": token, "refresh_token": str(payload.get("refresh_token") or refresh_token)}


def supabase_logout(url: str, anon_key: str, access_token: str) -> bool:
    """Ends this session on the server so the saved refresh token stops working. Best effort."""
    if not url or not anon_key or not access_token:
        return False
    request = urllib.request.Request(
        f"{url.rstrip('/')}/auth/v1/logout",
        data=b"{}",
        method="POST",
        headers={
            "apikey": anon_key,
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10):
            return True
    except Exception:
        return False


class RecorderWindow:
    def __init__(self) -> None:
        load_user_fonts()
        windows_app_id()
        self.root = tk.Tk()
        bind_site_fonts(self.root)
        if os.environ.get("BITRYMDYM_UI_SMOKE") == "1":
            self.root.withdraw()
        self.root.title("BitRymDym")
        self.root.minsize(420, 640)
        self.root.configure(bg=PAPER)
        self._borderless = os.environ.get("BITRYMDYM_UI_SMOKE") != "1" and os.name == "nt"
        self._frameless_on = False
        self._zoomed = False
        self._restore_geo = ""
        self._images: list[tk.PhotoImage] = []
        self.shell = tk.Frame(self.root, bg=PAPER, highlightthickness=1, highlightbackground=LINE_STRONG)
        self.shell.pack(fill="both", expand=True)
        if self._borderless:
            self._build_chrome()
            if os.environ.get("BITRYMDYM_FRAME_CHECK") == "1":
                self.root.attributes("-alpha", 0)
        else:
            self.root.geometry("480x740")
        self._apply_icon()
        self.recording = False
        self._arming = False
        self._uploading = False
        self._pending: UploadState | None = load_pending()
        self._update: updater.Update | None = None
        self._update_ready: Path | None = None
        self._update_busy = False
        self._update_dismissed = False
        self._probing = False
        self._probe_proc: subprocess.Popen[bytes] | None = None
        self._probe_path = Path(os.environ.get("TEMP", ".")) / "bitrymdym-mic-probe.wav"
        self._probe_started = 0.0
        self._probe_hist: list[tuple[float, float]] = []
        self._probe_after: str | None = None
        self._take_note = ""
        self._arm_token = 0
        self._wave_cols: list[float] = []
        self._wave_end = 0
        self._wave_for: Path | None = None
        self._beat_shown = 0.0
        self.vocals: list[dict[str, object]] = []
        self.armed = 0
        self.capture: subprocess.Popen[bytes] | None = None
        self.monitor: subprocess.Popen[bytes] | None = None
        self.mix_feed: subprocess.Popen[bytes] | None = None
        self._beat_ceiling: float | None = None
        self._build_scroll()
        self._build_update_bar()
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
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
        self.gate_status = tk.StringVar(value="Łączę ze stroną.")
        self.status = tk.StringVar(value="Ładuję listę bitów ze strony.")
        self.plan_text = tk.StringVar(
            value="Plan: zaloguj się. Do tego czasu 1 ścieżka wokalu, 4 efekty, nagranie do 30 s, bez ściszania pod bit."
        )
        self.clock = tk.StringVar(value="0.0 s / 30 s")
        self.device_var = tk.StringVar(value=self.devices[0] if self.devices else "Brak mikrofonu")
        self.beat_var = tk.StringVar()
        saved = load_session()
        if saved:
            self.public_url = saved.get("supabaseUrl", "")
            self.public_key = saved.get("anonKey", "")
            self.status.set("Jest zapisana sesja tego konta.")
        self._build_gate(saved if isinstance(saved, dict) else None)
        self._load_public()
        self._build_deck()
        self._build_account()
        self._build_effects()
        self._build_transport()
        self.beat_var.trace_add("write", lambda *_args: self._sync_cassette())
        self._sync_cassette()
        self._paint_lamp()
        self._draw_meter(-96.0)
        self._load_prefs()
        self._load_saved_takes()
        self._read_plan()
        if self.status_boot:
            self.status.set(self.status_boot)
            self.gate_status.set(self.status_boot)
        self.root.bind("<Configure>", self._fit_copy)
        self.root.bind_all("<MouseWheel>", self._on_wheel)
        self.show_gate()

    def _style_scroll(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use("clam")
        style.configure(
            "Brd.Vertical.TScrollbar",
            background=LINE_STRONG,
            troughcolor=PAPER,
            bordercolor=PAPER,
            arrowcolor=SOFT,
            darkcolor=PAPER,
            lightcolor=PAPER,
            gripcount=0,
            relief="flat",
            arrowsize=12,
        )
        style.map(
            "Brd.Vertical.TScrollbar",
            background=[("active", AMBER_DEEP), ("pressed", AMBER)],
        )

    def _build_scroll(self) -> None:
        self._style_scroll()
        self.canvas = tk.Canvas(self.shell, bg=PAPER, highlightthickness=0, bd=0)
        self.scrollbar = ttk.Scrollbar(
            self.shell,
            command=self.canvas.yview,
            style="Brd.Vertical.TScrollbar",
        )
        self.canvas.configure(yscrollcommand=self.scrollbar.set)
        self.page = tk.Frame(self.canvas, bg=PAPER)
        self.page_id = self.canvas.create_window((0, 0), window=self.page, anchor="nw")
        self.page.bind("<Configure>", self._sync_scroll)
        self.canvas.bind("<Configure>", self._fit_page)

    def _sync_scroll(self, _event: object = None) -> None:
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _fit_page(self, event: tk.Event) -> None:
        self.canvas.itemconfigure(self.page_id, width=event.width)

    def _on_wheel(self, event: tk.Event) -> str:
        if not self.canvas.winfo_ismapped():
            return "break"
        step = int(-event.delta / 120) or (-1 if event.delta < 0 else 1)
        widget = event.widget
        if widget in (getattr(self, "beat_box", None), getattr(self, "take_list", None)):
            widget.yview_scroll(step, "units")
            return "break"
        self.canvas.yview_scroll(step, "units")
        return "break"

    def _fit_image(self, name: str, max_width: int, max_height: int) -> tk.PhotoImage | None:
        path = brand_file(name)
        if path is None:
            return None
        image = tk.PhotoImage(file=str(path))
        factor = 1
        while image.width() // factor > max_width or image.height() // factor > max_height:
            factor += 1
        if factor > 1:
            image = image.subsample(factor, factor)
        self._images.append(image)
        return image

    def _apply_icon(self) -> None:
        path = brand_file("cassette.png")
        if path is None:
            return
        image = tk.PhotoImage(file=str(path))
        self._images.append(image)
        self.root.iconphoto(True, image)

    def _build_chrome(self) -> None:
        """No Windows title bar. The soot bar is the app frame."""
        self.root.overrideredirect(True)
        self._frameless_on = True
        bar = tk.Frame(self.shell, bg=PAPER, height=40)
        bar.pack(side="top", fill="x")
        bar.pack_propagate(False)
        self.chrome = bar
        mark = self._fit_image("cassette-mark.png", 22, 22)
        if mark is not None:
            badge = tk.Label(bar, image=mark, bg=PAPER)
            badge.pack(side="left", padx=(12, 6))
            badge.bind("<Button-1>", self._drag_start)
            badge.bind("<B1-Motion>", self._drag_move)
        title = tk.Label(bar, text="BitRymDym", bg=PAPER, fg=INK, font=(FONT_DISPLAY, 14, "italic"))
        title.pack(side="left")
        self._chrome_button(bar, "×", self._on_close, REC)
        self._chrome_button(bar, "□", self._toggle_zoom, RACK)
        self._chrome_button(bar, "–", self._minimize, RACK)
        for widget in (bar, title):
            widget.bind("<Button-1>", self._drag_start)
            widget.bind("<B1-Motion>", self._drag_move)
            widget.bind("<Double-Button-1>", lambda _event: self._toggle_zoom())
        rule = tk.Frame(self.shell, bg=AMBER, height=2)
        rule.pack(side="top", fill="x")
        rule.pack_propagate(False)
        grip = tk.Frame(self.shell, bg=AMBER_DEEP, cursor="size_nw_se", width=14, height=14)
        grip.place(relx=1.0, rely=1.0, anchor="se")
        grip.bind("<Button-1>", self._resize_start)
        grip.bind("<B1-Motion>", self._resize_move)
        self.root.bind("<Map>", self._on_map)
        self.root.after(50, self._own_taskbar)

    def _chrome_button(self, parent: tk.Widget, text: str, command: object, hover: str) -> None:
        label = tk.Label(parent, text=text, bg=PAPER, fg=INK, width=3, font=(FONT_UI, 13), cursor="hand2")
        label.pack(side="right")
        label.bind("<Enter>", lambda _event: label.configure(bg=hover, fg=INK))
        label.bind("<Leave>", lambda _event: label.configure(bg=PAPER, fg=INK))
        label.bind("<Button-1>", lambda _event: command())

    def _window_hwnd(self) -> int:
        self.root.update_idletasks()
        child = int(self.root.winfo_id())
        parent = int(ctypes.windll.user32.GetParent(child) or 0)
        return parent or child

    def _own_taskbar(self) -> None:
        if not self._borderless or os.name != "nt":
            return
        user32 = ctypes.windll.user32
        get_long = user32.GetWindowLongPtrW
        set_long = user32.SetWindowLongPtrW
        get_long.restype = ctypes.c_longlong
        get_long.argtypes = [ctypes.c_void_p, ctypes.c_int]
        set_long.restype = ctypes.c_longlong
        set_long.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_longlong]
        hwnd = self._window_hwnd()
        style = get_long(hwnd, -20)
        style = (style & ~0x80) | 0x40000
        set_long(hwnd, -20, style)
        user32.SetWindowPos(hwnd, None, 0, 0, 0, 0, 0x27)
        self.root.lift()

    def _on_map(self, event: tk.Event) -> None:
        if event.widget is not self.root or not self._borderless:
            return
        if str(self.root.state()) == "iconic":
            return
        if self._frameless_on:
            return
        self.root.overrideredirect(True)
        self._frameless_on = True
        self.root.after(10, self._own_taskbar)

    def _drag_start(self, event: tk.Event) -> None:
        self._drag_dx = event.x_root - self.root.winfo_x()
        self._drag_dy = event.y_root - self.root.winfo_y()

    def _drag_move(self, event: tk.Event) -> None:
        if self._zoomed:
            return
        x = event.x_root - self._drag_dx
        y = event.y_root - self._drag_dy
        self.root.geometry(f"+{x}+{y}")

    def _resize_start(self, event: tk.Event) -> None:
        self._resize_x = event.x_root
        self._resize_y = event.y_root
        self._resize_w = self.root.winfo_width()
        self._resize_h = self.root.winfo_height()

    def _resize_move(self, event: tk.Event) -> None:
        self._zoomed = False
        width = max(self.root.minsize()[0], self._resize_w + event.x_root - self._resize_x)
        height = max(self.root.minsize()[1], self._resize_h + event.y_root - self._resize_y)
        self.root.geometry(f"{width}x{height}")

    def _minimize(self) -> None:
        self._frameless_on = False
        self.root.overrideredirect(False)
        self.root.iconify()

    def _toggle_zoom(self) -> None:
        if self._zoomed:
            if self._restore_geo:
                self.root.geometry(self._restore_geo)
            self._zoomed = False
            return
        self._restore_geo = self.root.geometry()
        self.root.update_idletasks()
        width = self.root.winfo_screenwidth()
        height = max(640, self.root.winfo_screenheight() - 48)
        self.root.geometry(f"{width}x{height}+0+0")
        self._zoomed = True

    def _place_window(self, width: int, height: int) -> None:
        self.root.update_idletasks()
        x = max(0, (self.root.winfo_screenwidth() - width) // 2)
        y = max(0, (self.root.winfo_screenheight() - height) // 2 - 24)
        self.root.geometry(f"{width}x{height}+{x}+{y}")

    def _fit_copy(self, event: tk.Event) -> None:
        if event.widget is not self.root:
            return
        width = max(240, int(event.width) - 56)
        for label in (getattr(self, "plan_label", None), getattr(self, "status_label", None), getattr(self, "foot_label", None)):
            if label is not None:
                label.configure(wraplength=width)
        caption = getattr(self, "local_caption", None)
        if caption is not None:
            caption.configure(wraplength=max(160, width - 190))
        probe_note = getattr(self, "probe_label", None)
        if probe_note is not None:
            probe_note.configure(wraplength=max(160, width - 330))
        hint = getattr(self, "lane_hint", None)
        if hint is not None:
            hint.configure(wraplength=max(200, width - 70))

    def show_gate(self) -> None:
        self.scrollbar.pack_forget()
        self.canvas.pack_forget()
        self.gate.pack(fill="both", expand=True)
        scale = dpi_scale()
        self.root.minsize(int(420 * scale), int(640 * scale))
        if self._borderless:
            self._place_window(int(520 * scale), int(760 * scale))
        elif self.root.winfo_width() > 640:
            self.root.geometry("480x740")

    def show_studio(self) -> None:
        self.gate.pack_forget()
        self.scrollbar.pack(side="right", fill="y")
        self.canvas.pack(side="left", fill="both", expand=True)
        scale = dpi_scale()
        self.root.minsize(int(720 * scale), int(640 * scale))
        if self._borderless:
            self._place_window(int(980 * scale), int(820 * scale))
        else:
            self.root.geometry("880x780")
        email = self.email.get().strip()
        self.account_line.set(f"Konto: {email}" if email else "Konto")
        if self._pending is not None:
            self.status.set(
                f"Poprzednia wysyłka nie skończyła się ({self._pending.summary()}). "
                "Naciśnij Wyślij, żeby ją dokończyć."
            )

    def _open_site(self, path: str) -> None:
        webbrowser.open(f"{SITE}{path}")

    def _link(self, parent: tk.Widget, text: str, path: str) -> tk.Label:
        label = tk.Label(
            parent,
            text=text,
            bg=PAPER,
            fg=AMBER,
            cursor="hand2",
            font=tkfont.Font(self.root, family=FONT_UI, size=11, underline=True),
        )
        label.bind("<Button-1>", lambda _event: self._open_site(path))
        return label

    def _build_gate(self, saved: dict[str, str] | None) -> None:
        self.gate = tk.Frame(self.shell, bg=PAPER)
        card = tk.Frame(self.gate, bg=PAPER)
        card.pack(expand=True, fill="x", padx=36, pady=24)
        logo = self._fit_image("logo-light.png", 320, 92)
        if logo is not None:
            tk.Label(card, image=logo, bg=PAPER).pack(pady=(0, 6))
        tape = self._fit_image("cassette-mark.png", 280, 120)
        if tape is not None:
            tk.Label(card, image=tape, bg=PAPER).pack(pady=(0, 8))
        tk.Label(card, text="Zaloguj się", bg=PAPER, fg=INK, font=(FONT_DISPLAY, 22, "italic")).pack(anchor="w")
        tk.Label(
            card,
            text="Zaloguj się, aby korzystać ze studia i swoich nagrań.",
            bg=PAPER,
            fg=SOFT,
            font=(FONT_UI, 10),
            wraplength=380,
            justify="left",
        ).pack(anchor="w", pady=(2, 10))
        tk.Label(card, text="E-MAIL", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w")
        self.email = self._entry(card, "")
        self.email.pack_configure(pady=(2, 8))
        tk.Label(card, text="HASŁO", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w")
        self.password = self._entry(card, "*")
        self.password.pack_configure(pady=(2, 10))
        if saved:
            self.email.insert(0, saved.get("email", ""))
        self.password.bind("<Return>", lambda _event: self.sign_in())
        self.email.bind("<Return>", lambda _event: self.password.focus_set())
        self._button(card, "Zaloguj się", self.sign_in, AMBER, ON_AMBER).pack(fill="x", pady=(4, 8))
        self._link(card, "Nie pamiętam hasła", "/forgot-password").pack(anchor="w", pady=(2, 10))
        bottom = tk.Frame(card, bg=PAPER)
        bottom.pack(anchor="w")
        tk.Label(bottom, text="Nie masz konta?", bg=PAPER, fg=SOFT, font=(FONT_UI, 11)).pack(side="left")
        self._link(bottom, "Zarejestruj się", "/sign-up").pack(side="left", padx=(6, 0))
        tk.Label(
            card,
            textvariable=self.gate_status,
            bg=PAPER,
            fg=INK,
            font=(FONT_UI, 10),
            wraplength=380,
            justify="left",
        ).pack(anchor="w", pady=(12, 0))

    def _on_close(self) -> None:
        if self._uploading and not messagebox.askyesno(
            "BitRymDym",
            "Wysyłka na konto jeszcze trwa. Jeśli zamkniesz program teraz, projekt na koncie może zostać niepełny. Zamknąć mimo to?",
        ):
            return
        self._arm_token += 1
        self._cancel_tick()
        self._stop_probe()
        self._stop_monitor()
        if self.capture:
            stop_capture(self.capture)
            self.capture = None
        self.recording = False
        self.root.destroy()

    def _build_deck(self) -> None:
        tk.Label(
            self.page,
            text="NAGRYWARKA",
            bg=PAPER,
            fg=MUTE,
            font=(FONT_META, 9),
            anchor="w",
        ).pack(fill="x", padx=18, pady=(12, 0))
        tk.Label(
            self.page,
            text="BitRymDym",
            bg=PAPER,
            fg=INK,
            font=(FONT_DISPLAY, 28, "italic"),
            anchor="w",
        ).pack(fill="x", padx=18)
        rule = tk.Frame(self.page, bg=AMBER, height=3)
        rule.pack_propagate(False)
        rule.pack(fill="x", padx=18, pady=(2, 8))
        deck = tk.Frame(
            self.page,
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
        self.tape_window = tk.Canvas(
            paper,
            width=10,
            height=64,
            bg="#17120d",
            highlightthickness=2,
            highlightbackground=ON_AMBER,
        )
        self.tape_window.pack(fill="x", padx=28, pady=(6, 12))
        self.tape_window.bind("<Configure>", self._draw_reels)
        paper.bind("<Configure>", lambda event: self.cassette_title.configure(wraplength=max(120, event.width - 36)))
        self._build_tracks(deck)

    def _lane(self, parent: tk.Widget) -> tk.Canvas:
        canvas = tk.Canvas(
            parent,
            height=96,
            bg="#120e0b",
            highlightthickness=1,
            highlightbackground=LINE,
            bd=0,
        )
        canvas.pack(fill="x", expand=True, padx=(8, 0))
        canvas.bind("<Configure>", lambda _event: self._paint_lanes())
        return canvas

    def _build_tracks(self, parent: tk.Widget) -> None:
        stack = tk.Frame(parent, bg=PANEL)
        stack.pack(fill="x", padx=14, pady=(0, 12))
        self.ruler = tk.Canvas(stack, height=22, bg=PAPER, highlightthickness=0, bd=0)
        self.ruler.pack(fill="x", padx=(210, 0))
        self.ruler.bind("<Configure>", lambda _event: self._paint_lanes())

        beat = tk.Frame(stack, bg=PANEL)
        beat.pack(fill="x", pady=(4, 2))
        beat_meta = tk.Frame(beat, bg=PANEL, width=210)
        beat_meta.pack(side="left", fill="y")
        beat_meta.pack_propagate(False)
        tk.Label(beat_meta, text="BIT", bg=PANEL, fg=AMBER, font=(FONT_POSTER, 13, "bold")).pack(anchor="w")
        self._button(beat_meta, "Plik", self.pick_local, RACK, INK).pack(fill="x", pady=(4, 2))
        self._button(beat_meta, "Graj", self.preview_beat, AMBER, ON_AMBER).pack(fill="x")
        self.beat_lane = self._lane(beat)

        self.vocal_host = tk.Frame(stack, bg=PANEL)
        self.vocal_host.pack(fill="x")
        self._add_vocal_lane()

        bar = tk.Frame(stack, bg=PANEL)
        bar.pack(fill="x", pady=(6, 0))
        self._button(bar, "Nagraj", self.arm, REC, INK).pack(side="left", padx=(0, 6))
        self._button(bar, "Stop", self.stop_take, RACK, INK).pack(side="left", padx=(0, 6))
        self._button(bar, "Graj miks", self.preview_mix, AMBER, ON_AMBER).pack(side="left", padx=(0, 6))
        add_shell = self._button(bar, "Dodaj ścieżkę", self._add_lane_clicked, RACK, INK)
        add_shell.pack(side="left")
        self.add_button = add_shell.winfo_children()[0]
        self._build_vu(bar)
        self._sync_add_button()
        self.lane_hint = tk.Label(
            stack,
            text="Przeciągnij po fali i w ED wytnij, zostaw, wycisz albo zrób fade. ED ustawia dB i lewo albo prawo. M wycisza, S zostawia solo. Graj miks składa bit i słyszane ujęcia. Bit nie jest zapisywany. Czerwień: przester albo głośniej niż bit.",
            bg=PANEL,
            fg=SOFT,
            font=(FONT_UI, 9),
            anchor="w",
            wraplength=900,
            justify="left",
        )
        self.lane_hint.pack(fill="x", pady=(6, 0))

    def _track_cap(self) -> int:
        return max_recording_tracks(self.tier)

    def _sync_add_button(self) -> None:
        if not hasattr(self, "add_button"):
            return
        cap = self._track_cap()
        have = len(self.vocals)
        if have >= cap:
            text = f"Limit {have}/{cap}"
        else:
            text = f"Dodaj ścieżkę {have}/{cap}"
        self.add_button.configure(text=text.upper())

    def _mark_armed(self) -> None:
        for index, lane in enumerate(self.vocals):
            armed = index == self.armed
            label = lane["label"]
            canvas = lane["canvas"]
            if isinstance(label, tk.Label):
                label.configure(fg=REC if armed else SOFT)
            if isinstance(canvas, tk.Canvas):
                canvas.configure(highlightbackground=AMBER if armed else LINE)

    def _arm_lane(self, index: int) -> None:
        if index < 0 or index >= len(self.vocals):
            return
        if self.recording and index != self.armed:
            self.status.set("Najpierw Stop. Nagranie zostaje na uzbrojonej ścieżce.")
            return
        self.armed = index
        self._mark_armed()
        name = self.vocals[index]["name"]
        self.status.set(f"Uzbrojona ścieżka: {name}.")

    def _add_vocal_lane(self) -> None:
        index = len(self.vocals)
        name = "WOKAL" if index == 0 else f"WOKAL {index + 1}"
        row = tk.Frame(self.vocal_host, bg=PANEL)
        row.pack(fill="x", pady=(4, 4))
        meta = tk.Frame(row, bg=PANEL, width=210)
        meta.pack(side="left", fill="y")
        meta.pack_propagate(False)
        label = tk.Label(meta, text=name, bg=PANEL, fg=REC, font=(FONT_POSTER, 12, "bold"), anchor="w")
        label.pack(anchor="w", fill="x")
        tools = tk.Frame(meta, bg=PANEL)
        tools.pack(fill="x", pady=(4, 0))
        lane: dict[str, object] = {
            "name": name,
            "frame": row,
            "label": label,
            "canvas": None,
            "path": None,
            "muted": False,
            "solo": False,
            "gain_db": 0.0,
            "pan": 0.0,
            "sel": None,
        }
        mute = tk.Button(
            tools,
            text="M",
            command=lambda slot=lane: self._toggle_mute(slot),
            bg=RACK,
            fg=SOFT,
            relief="flat",
            bd=0,
            padx=6,
            pady=2,
            font=(FONT_POSTER, 11, "bold"),
        )
        mute.pack(side="left", padx=(0, 4))
        solo = tk.Button(
            tools,
            text="S",
            command=lambda slot=lane: self._toggle_solo(slot),
            bg=RACK,
            fg=SOFT,
            relief="flat",
            bd=0,
            padx=6,
            pady=2,
            font=(FONT_POSTER, 11, "bold"),
        )
        solo.pack(side="left", padx=(0, 4))
        lane["solo_button"] = solo
        tk.Button(
            tools,
            text="ED",
            command=lambda slot=lane: self._edit_lane(slot),
            bg=RACK,
            fg=INK,
            relief="flat",
            bd=0,
            padx=6,
            pady=2,
            font=(FONT_POSTER, 11, "bold"),
        ).pack(side="left", padx=(0, 4))
        tk.Button(
            tools,
            text="X",
            command=lambda slot=lane: self._remove_lane(slot),
            bg=RACK,
            fg=REC,
            relief="flat",
            bd=0,
            padx=6,
            pady=2,
            font=(FONT_POSTER, 11, "bold"),
        ).pack(side="left")
        lane["mute_button"] = mute
        canvas = self._lane(row)
        lane["canvas"] = canvas
        self.vocals.append(lane)
        if index == 0:
            self.vocal_lane = canvas
        label.bind("<Button-1>", lambda _event, slot=lane: self._arm_lane(self.vocals.index(slot)))
        canvas.bind("<ButtonPress-1>", lambda event, slot=lane: self._select_down(slot, event))
        canvas.bind("<B1-Motion>", lambda event, slot=lane: self._select_drag(slot, event))
        canvas.bind("<ButtonRelease-1>", lambda event, slot=lane: self._select_up(slot, event))
        self._mark_armed()

    def _add_lane_clicked(self) -> None:
        if self.recording:
            self.status.set("Najpierw Stop.")
            return
        cap = self._track_cap()
        if len(self.vocals) >= cap:
            self.status.set(
                f"Plan {display_tier(self.tier)} mieści {cap} ścieżek wokalu. Bit się nie liczy."
            )
            self._sync_add_button()
            return
        self._add_vocal_lane()
        self.armed = len(self.vocals) - 1
        self._mark_armed()
        self._sync_add_button()
        self._paint_lanes()
        self._sync_scroll()
        self.status.set(f"Ścieżka {self.vocals[self.armed]['name']} jest uzbrojona. Plan mieści {cap}.")

    def _heard(self, lane: dict[str, object]) -> bool:
        if lane.get("muted"):
            return False
        if any(item.get("solo") for item in self.vocals) and not lane.get("solo"):
            return False
        return True

    def _lane_paths(self) -> list[Path]:
        paths: list[Path] = []
        for lane in self.vocals:
            if not self._heard(lane):
                continue
            path = lane.get("path")
            if isinstance(path, Path) and path.exists() and path.stat().st_size >= 1000:
                paths.append(path)
        return paths

    def _paint_lanes(self) -> None:
        if not hasattr(self, "beat_lane"):
            return
        cap = max(1, max_take_seconds(self.tier))
        playhead = 0.0
        if self.recording and self.wav_path.exists():
            playhead = file_seconds(self.wav_path)
        self._paint_ruler(cap)
        beat_on = self.recording and (self.monitor is not None or self.local_beat is not None)
        if beat_on:
            self._beat_shown = playhead
        shown = self._beat_shown
        self._paint_lane(self.beat_lane, cap, shown, AMBER, shown > 0, shown)
        for index, lane in enumerate(self.vocals):
            canvas = lane.get("canvas")
            if not isinstance(canvas, tk.Canvas):
                continue
            path = lane.get("path")
            seconds = file_seconds(path) if isinstance(path, Path) and path.exists() else 0.0
            here = self.recording and index == self.armed
            head = playhead if here else seconds
            peaks = self._vocal_peaks(path, canvas.winfo_width(), cap) if isinstance(path, Path) and path.exists() else None
            self._paint_lane(
                canvas,
                cap,
                seconds if not here else playhead,
                REC,
                seconds > 0 or here,
                head,
                peaks,
                bool(lane.get("muted")),
                self._beat_ceiling,
                lane.get("sel") if isinstance(lane.get("sel"), tuple) else None,
            )

    def _paint_ruler(self, cap: int) -> None:
        canvas = self.ruler
        canvas.delete("all")
        width = canvas.winfo_width()
        if width < 20:
            return
        step = 5 if cap > 40 else 2
        mark = 0
        while mark <= cap:
            x = int(width * mark / cap)
            canvas.create_line(x, 10, x, 18, fill=MUTE)
            canvas.create_text(x + 2, 2, text=str(mark), fill=MUTE, anchor="nw", font=(FONT_META, 8))
            mark += step

    def _vocal_peaks(self, path: Path, width: int, cap: int) -> list[float]:
        columns = max(width, 2)
        if self._wave_for != path or len(self._wave_cols) != columns:
            self._wave_for = path
            self._wave_cols = [0.0] * columns
            self._wave_end = 0
        try:
            size = path.stat().st_size
        except OSError:
            return self._wave_cols
        offset = wav_data_offset_of(path)
        if offset is None:
            return self._wave_cols
        start = max(self._wave_end, offset)
        if size - start >= 2:
            # Half a second per tick. A full 180 s scan in Python would freeze the window.
            length = min(size - start, 48_000)
            if not self.recording:
                length = size - start
            pcm = read_file_range(path, start, length)
            fold_peaks(self._wave_cols, pcm, max(0, (start - offset) // 2), max(1, cap) * 48_000)
            self._wave_end = start + (len(pcm) // 2) * 2
        return self._wave_cols

    def _paint_lane(
        self,
        canvas: tk.Canvas,
        cap: int,
        block_seconds: float,
        color: str,
        filled: bool,
        head_seconds: float,
        peaks: list[float] | None = None,
        muted: bool = False,
        beat_ceiling: float | None = None,
        selection: tuple[float, float] | None = None,
    ) -> None:
        canvas.delete("all")
        width = max(canvas.winfo_width(), 2)
        height = max(canvas.winfo_height(), 2)
        mid = height / 2
        if filled and not peaks:
            end = width if block_seconds <= 0 else max(8, int(width * min(block_seconds / cap, 1.0)))
            canvas.create_rectangle(0, mid - 4, end, mid + 4, fill=color, outline="")
        if peaks:
            hot = beat_ceiling * 1.25 if beat_ceiling else None
            for index, level in enumerate(peaks):
                if level <= 0.02:
                    continue
                x = int(index * width / max(len(peaks), 1))
                half = max(1, int((height / 2 - 4) * min(level, 1.0)))
                if muted:
                    ink = MUTE
                elif level >= 0.98 or (hot is not None and level > hot):
                    ink = REC
                elif level >= 0.7:
                    ink = AMBER
                else:
                    ink = "#3ddc97"
                canvas.create_line(x, mid - half, x, mid + half, fill=ink, width=3)
        if selection and cap > 0:
            left, right = selection
            x1 = int(width * max(0.0, min(left, cap)) / cap)
            x2 = int(width * max(0.0, min(right, cap)) / cap)
            if x2 < x1:
                x1, x2 = x2, x1
            canvas.create_rectangle(x1, 1, max(x2, x1 + 2), height - 1, outline=AMBER, width=2)
        x = int(width * min(max(head_seconds, 0.0) / cap, 1.0))
        canvas.create_line(x, 0, x, height, fill=INK, width=1)

    def _safe_listen_error(self, error: BaseException) -> str:
        text = str(error)
        if "->" in text and "404" in text:
            return "Odsłuch strony nie jest jeszcze na produkcji."
        if "http://" in text.lower() or "https://" in text.lower():
            return "Strona nie oddała odsłuchu."
        return text

    def _beat_id_or_empty(self) -> str:
        """Read the beat choice on the Tk thread. Worker threads must not touch Tk variables."""
        try:
            return self.selected_beat_id()
        except RuntimeError:
            return ""

    def _beat_listen(self, beat_id: str) -> tuple[str | None, int | None, str]:
        """Site PLAYBACK first. A local file is only the fallback. Nothing is saved.

        Network call: run it off the Tk thread. beat_id is read by the caller.
        """
        try:
            if not beat_id:
                raise RuntimeError("Najpierw wybierz bit.")
            payload = self._client().playback(beat_id)
            url, limit = playback_target(payload)
            note = (
                f"Podgląd strony: {limit} s. Program nie zapisuje bitu."
                if limit
                else "Bit ze strony gra w słuchawkach. Program go nie zapisuje."
            )
            return url, limit, note
        except Exception as error:
            if self.local_beat is not None:
                return str(self.local_beat), None, "Odsłuch strony niedostępny. Gra plik z dysku."
            return None, None, self._safe_listen_error(error)

    def preview_beat(self) -> None:
        try:
            if self.recording:
                raise RuntimeError("Najpierw Stop. Odsłuch bitu i tak leci w trakcie nagrania.")
            self._stop_monitor()
            self.status.set("Łączę odsłuch bitu. Okno zostaje.")
            threading.Thread(target=self._prepare_preview, args=(self._beat_id_or_empty(),), daemon=True).start()
        except Exception as error:
            self.status.set(self._safe_listen_error(error))

    def _prepare_preview(self, beat_id: str) -> None:
        try:
            heard = self._beat_listen(beat_id)
        except Exception as error:
            heard = (None, None, self._safe_listen_error(error))
        self.root.after(0, lambda result=heard: self._start_preview(result))

    def _start_preview(self, heard: tuple[str | None, int | None, str]) -> None:
        try:
            if self.recording:
                return
            target, limit, note = heard
            if target is None:
                raise RuntimeError(note)
            self._stop_monitor()
            self.monitor = start_monitor(target, limit)
            if self.monitor is None:
                raise RuntimeError(NO_FFPLAY)
            self.status.set(note)
        except Exception as error:
            self.status.set(self._safe_listen_error(error))

    def _armed_take(self) -> Path | None:
        if not self.vocals:
            return None
        path = self.vocals[self.armed].get("path")
        if isinstance(path, Path) and path.exists() and path.stat().st_size >= 1000:
            return path
        return None

    def _seconds_at(self, canvas: tk.Canvas, x: int) -> float:
        cap = max(1, max_take_seconds(self.tier))
        width = max(canvas.winfo_width(), 2)
        return max(0.0, min(float(cap), x / width * cap))

    def _select_down(self, lane: dict[str, object], event: tk.Event) -> None:
        if lane in self.vocals:
            self._arm_lane(self.vocals.index(lane))
        start = self._seconds_at(event.widget, event.x)
        lane["sel"] = (start, start)
        self._paint_lanes()

    def _select_drag(self, lane: dict[str, object], event: tk.Event) -> None:
        current = lane.get("sel")
        if not isinstance(current, tuple) or not current:
            return
        lane["sel"] = (float(current[0]), self._seconds_at(event.widget, event.x))
        self._paint_lanes()

    def _select_up(self, lane: dict[str, object], event: tk.Event) -> None:
        current = lane.get("sel")
        if not isinstance(current, tuple) or not current:
            return
        start = float(current[0])
        end = self._seconds_at(event.widget, event.x)
        if abs(end - start) < 0.08:
            lane["sel"] = None
            self._paint_lanes()
            return
        lane["sel"] = (min(start, end), max(start, end))
        self._paint_lanes()
        self.status.set(f"Zaznaczenie {lane['sel'][0]:.2f}–{lane['sel'][1]:.2f} s. ED tnie ten fragment.")

    def _toggle_mute(self, lane: dict[str, object]) -> None:
        lane["muted"] = not bool(lane.get("muted"))
        button = lane.get("mute_button")
        if isinstance(button, tk.Button):
            button.configure(fg=REC if lane["muted"] else SOFT, text="M·" if lane["muted"] else "M")
        self._paint_lanes()
        name = lane.get("name")
        self.status.set(f"{name} wyciszona." if lane["muted"] else f"{name} wraca do miksu.")

    def _toggle_solo(self, lane: dict[str, object]) -> None:
        lane["solo"] = not bool(lane.get("solo"))
        button = lane.get("solo_button")
        if isinstance(button, tk.Button):
            button.configure(fg=AMBER if lane["solo"] else SOFT, text="S·" if lane["solo"] else "S")
        self._paint_lanes()
        name = lane.get("name")
        self.status.set(f"Solo: {name}." if lane["solo"] else f"{name} bez solo.")

    def _span(self, lane: dict[str, object]) -> tuple[float, float]:
        selection = lane.get("sel")
        if not isinstance(selection, tuple) or len(selection) != 2:
            raise RuntimeError("Przeciągnij po fali, żeby zaznaczyć fragment.")
        start, end = float(selection[0]), float(selection[1])
        if abs(end - start) < 0.08:
            raise RuntimeError("Zaznaczenie jest za krótkie.")
        return min(start, end), max(start, end)

    def _rewrite_take(self, lane: dict[str, object], mode: str) -> None:
        if self.recording:
            raise RuntimeError("Najpierw Stop.")
        path = lane.get("path")
        if not isinstance(path, Path) or not path.exists():
            raise RuntimeError("Najpierw nagraj ujęcie na tej ścieżce.")
        start, end = self._span(lane)
        rate, samples = read_mono16(path)
        edited = edit_span(samples, rate, start, end, mode)
        replace_mono16(path, edited, rate)
        self._wave_for = None
        lane["sel"] = None
        self._paint_lanes()

    def _edit_lane(self, lane: dict[str, object]) -> None:
        if self.recording:
            self.status.set("Najpierw Stop.")
            return
        box = tk.Toplevel(self.root)
        box.title("Ścieżka")
        box.configure(bg=PANEL)
        box.resizable(False, False)
        name = tk.StringVar(value=str(lane.get("name") or "Wokal"))
        gain = tk.DoubleVar(value=float(lane.get("gain_db") or 0.0))
        pan = tk.DoubleVar(value=float(lane.get("pan") or 0.0) * 100.0)
        tk.Label(box, text="Nazwa", bg=PANEL, fg=SOFT, font=(FONT_UI, 9)).pack(anchor="w", padx=12, pady=(10, 0))
        tk.Entry(
            box,
            textvariable=name,
            bg=RACK,
            fg=INK,
            insertbackground=INK,
            relief="flat",
            font=(FONT_UI, 12),
        ).pack(fill="x", padx=12, pady=4)
        tk.Label(box, text="Głośność, dB", bg=PANEL, fg=SOFT, font=(FONT_UI, 9)).pack(anchor="w", padx=12)
        tk.Scale(
            box,
            from_=-36,
            to=12,
            resolution=0.5,
            orient="horizontal",
            variable=gain,
            bg=PANEL,
            fg=INK,
            highlightthickness=0,
            troughcolor=RACK,
        ).pack(fill="x", padx=12)
        tk.Label(box, text="Kanał: lewo −100, środek 0, prawo +100", bg=PANEL, fg=SOFT, font=(FONT_UI, 9)).pack(
            anchor="w", padx=12
        )
        tk.Scale(
            box,
            from_=-100,
            to=100,
            resolution=1,
            orient="horizontal",
            variable=pan,
            bg=PANEL,
            fg=INK,
            highlightthickness=0,
            troughcolor=RACK,
        ).pack(fill="x", padx=12)
        actions = tk.Frame(box, bg=PANEL)
        actions.pack(fill="x", padx=12, pady=(4, 0))

        def run(mode: str, label: str) -> None:
            try:
                self._rewrite_take(lane, mode)
            except RuntimeError as error:
                self.status.set(str(error))
                return
            except ValueError as error:
                code = str(error)
                if code in {"span", "short"}:
                    self.status.set("Zaznaczenie jest poza ujęciem.")
                elif code in {"mono16", "empty"}:
                    self.status.set("Cięcie działa na mono 16-bit.")
                else:
                    self.status.set("Nie dało się zapisać cięcia.")
                return
            except OSError:
                self.status.set("Nie dało się zapisać cięcia.")
                return
            self.status.set(f"{label}. Plik ujęcia jest już zmieniony.")

        for mode, button_text, done in (
            ("cut", "Wytnij", "Wycięte"),
            ("trim", "Zostaw", "Zostawiony fragment"),
            ("silence", "Wycisz", "Wyciszony fragment"),
            ("fade-in", "Fade in", "Fade in"),
            ("fade-out", "Fade out", "Fade out"),
        ):
            tk.Button(
                actions,
                text=button_text,
                command=lambda picked=mode, word=done: run(picked, word),
                bg=RACK,
                fg=INK,
                relief="flat",
                bd=0,
                padx=8,
                pady=4,
                font=(FONT_UI, 9),
            ).pack(side="left", padx=(0, 4), pady=4)

        def save() -> None:
            text = name.get().strip() or str(lane.get("name") or "Wokal")
            lane["name"] = text
            lane["gain_db"] = float(gain.get())
            lane["pan"] = max(-1.0, min(1.0, float(pan.get()) / 100.0))
            label = lane.get("label")
            if isinstance(label, tk.Label):
                label.configure(text=text)
            side = "lewo" if lane["pan"] < -0.05 else "prawo" if lane["pan"] > 0.05 else "środek"
            box.destroy()
            self._paint_lanes()
            self.status.set(f"{text}: {float(lane['gain_db']):+.1f} dB, {side}.")

        self._button(box, "Zapisz", save, AMBER, ON_AMBER).pack(fill="x", padx=12, pady=12)

    def _remove_lane(self, lane: dict[str, object]) -> None:
        if self.recording:
            self.status.set("Najpierw Stop.")
            return
        if lane not in self.vocals:
            return
        if len(self.vocals) == 1:
            lane["path"] = None
            lane["muted"] = False
            lane["solo"] = False
            lane["gain_db"] = 0.0
            lane["pan"] = 0.0
            lane["sel"] = None
            button = lane.get("mute_button")
            if isinstance(button, tk.Button):
                button.configure(fg=SOFT, text="M")
            solo = lane.get("solo_button")
            if isinstance(solo, tk.Button):
                solo.configure(fg=SOFT, text="S")
            self._paint_lanes()
            self.status.set("Ujęcie zdjęte. Ścieżka zostaje, bo plan ma co najmniej jedną.")
            return
        index = self.vocals.index(lane)
        frame = lane.get("frame")
        if isinstance(frame, tk.Frame):
            frame.destroy()
        self.vocals.pop(index)
        if self.armed >= len(self.vocals):
            self.armed = len(self.vocals) - 1
        self._mark_armed()
        self._sync_add_button()
        self._paint_lanes()
        self.status.set("Ścieżka usunięta.")

    def _mix_sources(self) -> list[tuple[Path, float, float]]:
        found: list[tuple[Path, float, float]] = []
        for lane in self.vocals:
            if not self._heard(lane):
                continue
            path = lane.get("path")
            if isinstance(path, Path) and path.exists() and path.stat().st_size >= 1000:
                found.append(
                    (path, float(lane.get("gain_db") or 0.0), float(lane.get("pan") or 0.0))
                )
        return found

    def preview_mix(self) -> None:
        try:
            if self.recording or self._arming:
                raise RuntimeError("Najpierw Stop.")
            vocals = self._mix_sources()
            has_beat = self.local_beat is not None
            if not has_beat:
                try:
                    has_beat = bool(self.selected_beat_id())
                except RuntimeError:
                    has_beat = False
            if not vocals and not has_beat:
                raise RuntimeError("Najpierw nagraj wokal na ścieżkę.")
            self._stop_monitor()
            self.status.set("Składam miks. Bit ze strony nie jest zapisywany.")
            threading.Thread(
                target=self._play_mix, args=(vocals, self._beat_id_or_empty()), daemon=True
            ).start()
        except Exception as error:
            self.status.set(self._safe_listen_error(error))

    def _play_mix(self, vocals: list[tuple[Path, float, float]], beat_id: str) -> None:
        beat: str | None = None
        limit: int | None = None
        note = "Miks gra na domyślnym wyjściu Windows."
        try:
            target, limit, heard = self._beat_listen(beat_id)
            if target is not None:
                beat = target
                note = heard
        except Exception as error:
            if self.local_beat is not None:
                beat = str(self.local_beat)
                note = "Odsłuch strony niedostępny. Gra plik z dysku."
            elif not vocals:
                self.root.after(0, lambda: self.status.set(self._safe_listen_error(error)))
                return
        ffmpeg = ffmpeg_exe()
        play = ffplay_exe()
        if play is None:
            self.root.after(0, lambda: self.status.set(NO_FFPLAY))
            return
        if beat is not None:
            ceiling = beat_ceiling(ffmpeg, beat)
            if ceiling is not None:
                self._beat_ceiling = ceiling
                self.root.after(0, self._paint_lanes)
        try:
            argv = mix_argv(ffmpeg, beat, vocals, limit)
            feed, monitor = start_mix(ffmpeg, play, argv)
        except Exception as error:
            self.root.after(0, lambda: self.status.set(self._safe_listen_error(error)))
            return
        self.mix_feed = feed
        self.monitor = monitor
        self.root.after(0, lambda: self.status.set(note))

    def preview_take(self) -> None:
        try:
            if self.recording:
                raise RuntimeError("Najpierw Stop.")
            path = self._armed_take() or self.selected_take()
            self._stop_monitor()
            self.monitor = start_monitor(path)
            if self.monitor is None:
                raise RuntimeError(NO_FFPLAY)
            name = self.vocals[self.armed]["name"] if self._armed_take() else path.name
            self.status.set(f"Ujęcie gra: {name}.")
        except Exception as error:
            self.status.set(str(error))

    def _vu_point(self, level: float, radius: float) -> tuple[float, float]:
        rad = math.radians(210 + max(0.0, min(1.0, level)) * 120)
        return (120 + math.cos(rad) * radius, 66 + math.sin(rad) * radius)

    def _build_vu(self, parent: tk.Widget) -> None:
        self.meter = tk.Canvas(parent, width=84, height=12, bg="#2a1d10", highlightthickness=0, bd=0)
        self.meter.pack(side="left", padx=(10, 0))

    def _draw_reels(self, _event: object = None) -> None:
        canvas = self.tape_window
        canvas.delete("all")
        width = canvas.winfo_width()
        height = canvas.winfo_height()
        if width < 40 or height < 20:
            return
        mid = height / 2
        canvas.create_rectangle(width * 0.3, mid - 6, width * 0.7, mid + 6, fill="#3b2c1d", outline="")
        radius = min(height * 0.38, width * 0.08)
        for cx in (width * 0.22, width * 0.78):
            canvas.create_oval(cx - radius, mid - radius, cx + radius, mid + radius, outline=INK, width=2)
            hub = max(3, radius * 0.22)
            canvas.create_oval(cx - hub, mid - hub, cx + hub, mid + hub, fill=INK, outline="")
            for step in range(6):
                rad = math.radians(step * 60)
                canvas.create_line(
                    cx + math.cos(rad) * radius * 0.28,
                    mid + math.sin(rad) * radius * 0.28,
                    cx + math.cos(rad) * radius * 0.78,
                    mid + math.sin(rad) * radius * 0.78,
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

    def _build_account(self) -> None:
        block = tk.Frame(self.page, bg=PAPER)
        block.pack(fill="x", padx=18, pady=(10, 0))
        self.account_line = tk.StringVar(value="Konto")
        tk.Label(
            block,
            textvariable=self.account_line,
            bg=PAPER,
            fg=MUTE,
            font=(FONT_META, 9),
            anchor="w",
        ).pack(fill="x")
        self.title_box = self._entry(self._row(block, "Tytuł"), "")
        self.title_box.insert(0, "Nagranie z komputera")
        labels = [label for _beat_id, label in self.beats] or ["Brak bitu"]
        if not self.beat_var.get():
            self.beat_var.set(labels[0])
        self._build_beat_picker(block, labels)
        device_labels = self.devices or ["Brak mikrofonu"]
        self.device_menu = self._menu(self._row(block, "Mikrofon"), self.device_var, device_labels)
        probe = tk.Frame(block, bg=PAPER)
        probe.pack(fill="x", pady=(6, 0))
        probe_shell = self._button(probe, "Próba mikrofonu", self.toggle_mic_test, RACK, INK)
        probe_shell.pack(side="left")
        self.probe_button = probe_shell.winfo_children()[0]
        self.probe_meter = tk.Canvas(probe, width=120, height=12, bg=RACK, highlightthickness=0, bd=0)
        self.probe_meter.pack(side="left", padx=(8, 0))
        self.probe_var = tk.StringVar(value="Powiedz coś do mikrofonu. Pasek pokaże, czy poziom jest dobry.")
        self.probe_label = tk.Label(
            probe,
            textvariable=self.probe_var,
            bg=PAPER,
            fg=SOFT,
            font=(FONT_UI, 9),
            anchor="w",
            wraplength=300,
            justify="left",
        )
        self.probe_label.pack(side="left", padx=8)
        hear = tk.Frame(block, bg=PAPER)
        hear.pack(fill="x", pady=(6, 0))
        self._button(hear, "Odsłuch z dysku", self.pick_local, RACK, INK).pack(side="left")
        self.local_label = tk.StringVar(value="Ścieżka BIT czeka na plik WAV albo MP3.")
        self.local_caption = tk.Label(
            hear,
            textvariable=self.local_label,
            bg=PAPER,
            fg=SOFT,
            font=(FONT_UI, 9),
            anchor="w",
            wraplength=360,
            justify="left",
        )
        self.local_caption.pack(side="left", padx=8)

    def _build_effects(self) -> None:
        self.plan_label = tk.Label(
            self.page,
            textvariable=self.plan_text,
            bg=PAPER,
            fg=SOFT,
            font=(FONT_UI, 10),
            anchor="w",
            wraplength=640,
            justify="left",
        )
        self.plan_label.pack(fill="x", padx=18, pady=(8, 2))
        self.fx_open = False
        self.fx_toggle = tk.StringVar(value="Efekty")
        self.fx_bar = tk.Button(
            self.page,
            textvariable=self.fx_toggle,
            command=self._toggle_fx,
            bg=PANEL,
            fg=INK,
            activebackground=RACK,
            activeforeground=AMBER,
            relief="flat",
            bd=0,
            highlightthickness=1,
            highlightbackground=LINE,
            highlightcolor=AMBER,
            anchor="w",
            padx=12,
            pady=8,
            font=(FONT_UI, 11),
            cursor="hand2",
        )
        self.fx_bar.pack(fill="x", padx=18, pady=(4, 2))
        rack = tk.Frame(self.page, bg=PANEL, highlightbackground=LINE, highlightthickness=1)
        self.fx_rack = rack
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
        self._sync_fx_button()

    def _toggle_fx(self) -> None:
        self.fx_open = not self.fx_open
        if self.fx_open:
            self.fx_rack.pack(fill="x", padx=18, pady=(0, 6), after=self.fx_bar)
        else:
            self.fx_rack.pack_forget()
        self._sync_fx_button()
        self._sync_scroll()

    def _sync_fx_button(self) -> None:
        count = len(self.selected_fx()) if self.fx_vars else 0
        arrow = "▴" if self.fx_open else "▾"
        self.fx_toggle.set(f"Efekty {count}  {arrow}    słychać je w studio, tu nie ma wtyczek VST")

    def _build_beat_picker(self, parent: tk.Widget, labels: list[str]) -> None:
        slot = self._row(parent, "Bit")
        self.beat_button = tk.Button(
            slot,
            command=self._toggle_beats,
            bg=RACK,
            fg=INK,
            activebackground=PANEL,
            activeforeground=AMBER,
            relief="flat",
            bd=0,
            highlightthickness=1,
            highlightbackground=LINE,
            highlightcolor=AMBER,
            anchor="w",
            padx=8,
            pady=6,
            font=(FONT_UI, 10),
            cursor="hand2",
        )
        self.beat_button.pack(fill="x")
        self.beat_panel = tk.Frame(parent, bg=PAPER)
        self.beat_query = tk.StringVar()
        search = tk.Entry(
            self.beat_panel,
            textvariable=self.beat_query,
            bg=RACK,
            fg=INK,
            insertbackground=AMBER,
            relief="flat",
            highlightthickness=1,
            highlightbackground=LINE,
            highlightcolor=AMBER,
            font=(FONT_UI, 10),
        )
        search.pack(fill="x", ipady=4, pady=(4, 2))
        search.insert(0, "")
        self.beat_box = tk.Listbox(
            self.beat_panel,
            height=6,
            bg=RACK,
            fg=INK,
            selectbackground=AMBER,
            selectforeground=ON_AMBER,
            highlightthickness=1,
            highlightbackground=LINE,
            relief="flat",
            font=(FONT_UI, 10),
            activestyle="none",
            exportselection=False,
        )
        self.beat_box.pack(fill="x")
        self.beat_box.bind("<<ListboxSelect>>", self._pick_beat)
        self.beat_query.trace_add("write", lambda *_args: self._filter_beats())
        self._filter_beats()
        self._sync_beat_button()

    def _toggle_beats(self) -> None:
        if self.beat_panel.winfo_manager():
            self.beat_panel.pack_forget()
        else:
            self.beat_panel.pack(fill="x", padx=18, pady=(0, 4), after=self.beat_button.master.master)
            self._filter_beats()
        self._sync_beat_button()
        self._sync_scroll()

    def _filter_beats(self) -> None:
        query = self.beat_query.get().strip().lower()
        labels = [label for _beat_id, label in self.beats] or ["Brak bitu"]
        shown = [label for label in labels if query in label.lower()]
        self.beat_box.delete(0, "end")
        for label in shown:
            self.beat_box.insert("end", label)
        self._sync_beat_button()

    def _pick_beat(self, _event: object = None) -> None:
        picked = self.beat_box.curselection()
        if not picked:
            return
        self.beat_var.set(self.beat_box.get(picked[0]))
        self.beat_panel.pack_forget()
        self._sync_beat_button()
        self._sync_scroll()

    def _sync_beat_button(self) -> None:
        label = self.beat_var.get().strip() or "Wybierz bit"
        if len(label) > 48:
            label = label[:47] + "…"
        count = len(self.beats)
        arrow = "▴" if self.beat_panel.winfo_manager() else "▾"
        self.beat_button.configure(text=f"{label}   {arrow}   {count}")

    def _build_transport(self) -> None:
        items = (
            ("Stop", self.stop_take, RACK, INK),
            ("Wyślij", self.send_selected, AMBER, ON_AMBER),
            ("Stop i wyślij", self.stop_and_send, AMBER, ON_AMBER),
            ("Studio", self.open_studio, RACK, INK),
            ("Odśwież bity", self.reload_beats, RACK, INK),
            ("Wyloguj", self.sign_out, RACK, INK),
        )
        grid = tk.Frame(self.page, bg=PAPER)
        grid.pack(fill="x", padx=14, pady=(8, 4))
        self.send_buttons: list[tk.Widget] = []
        for index, (text, command, bg, fg) in enumerate(items):
            shell = self._button(grid, text, command, bg, fg)
            shell.grid(row=index // 2, column=index % 2, sticky="ew", padx=4, pady=4)
            if text == "Studio":
                self.open_button = shell
            if text in ("Wyślij", "Stop i wyślij"):
                self.send_buttons.append(shell)
        grid.columnconfigure(0, weight=1)
        grid.columnconfigure(1, weight=1)
        self.take_list = tk.Listbox(
            self.page,
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
        self.status_label = tk.Label(
            self.page,
            textvariable=self.status,
            wraplength=640,
            justify="left",
            bg=PAPER,
            fg=INK,
            font=(FONT_UI, 10),
        )
        self.status_label.pack(fill="x", padx=18, pady=8)
        self.foot_label = tk.Label(
            self.page,
            text=f"Nuty zostają w studio na stronie. Miks i master też. Wersja {updater.APP_VERSION}.",
            bg=PAPER,
            fg=SOFT,
            font=(FONT_UI, 9),
            anchor="w",
            wraplength=640,
            justify="left",
        )
        self.foot_label.pack(fill="x", padx=18)

    def _entry(self, parent: tk.Widget, show: str) -> tk.Entry:
        box = tk.Entry(
            parent,
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
        box.pack(fill="x", ipady=6)
        return box

    def _menu(self, parent: tk.Widget, variable: tk.StringVar, labels: list[str]) -> tk.OptionMenu:
        menu = tk.OptionMenu(parent, variable, *labels)
        menu.configure(
            bg=RACK,
            fg=INK,
            activebackground=PANEL,
            activeforeground=INK,
            highlightthickness=1,
            highlightbackground=LINE,
            highlightcolor=AMBER,
            font=(FONT_UI, 10),
            relief="flat",
            bd=0,
            anchor="w",
            width=28,
        )
        menu.pack(side="left", fill="x", expand=True)
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
            disabledforeground=MUTE,
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
                if self.email.get().strip():
                    self.gate_status.set("Jest zapisana sesja. Puste hasło wchodzi na to konto.")
                else:
                    self.gate_status.set("Wpisz konto ze strony.")
        except Exception as error:
            self.status.set(str(error))
            self.gate_status.set(str(error))

    def selected_fx(self) -> list[str]:
        return [fx_id for fx_id, _label in FX if self.fx_vars[fx_id].get()]

    def _on_fx(self, picked: str) -> None:
        try:
            build_chain(self.selected_fx(), self.tier)
        except ValueError as error:
            text = str(error)
            drop = "sidechain" if "Ściszanie pod bit" in text and self.fx_vars["sidechain"].get() else picked
            if drop in self.fx_vars:
                self.fx_vars[drop].set(0)
            self.status.set(text)
        self._sync_fx_button()

    def _fit_plan(self) -> None:
        for _ in range(len(FX)):
            try:
                build_chain(self.selected_fx(), self.tier)
                self._sync_fx_button()
                return
            except ValueError as error:
                selected = self.selected_fx()
                if not selected:
                    self.status.set(str(error))
                    self._sync_fx_button()
                    return
                drop = "sidechain" if "Ściszanie pod bit" in str(error) else selected[-1]
                self.fx_vars[drop].set(0)
                self.status.set(str(error))
        self._sync_fx_button()

    def _read_plan(self) -> None:
        saved = load_session()
        token = saved.get("accessToken") if saved else None
        if not token:
            self.tier = "FREE"
            self.plan_text.set(
                "Plan: zaloguj się. Do tego czasu 1 ścieżka wokalu, 4 efekty, nagranie do 30 s, bez ściszania pod bit."
            )
            self.clock.set("0.0 s / 30 s")
            self._sync_add_button()
            return
        try:
            payload = self._client().plan_usage()
            tier, cap, side = limits_from_usage(payload)
        except Exception as error:
            self.tier = "FREE"
            self.plan_text.set(str(error))
            self._sync_add_button()
            return
        self.tier = tier
        side_note = "ściszanie pod bit jest w planie" if side else "ściszanie pod bit od Silver"
        seconds = max_take_seconds(tier)
        tracks = max_recording_tracks(tier)
        self.plan_text.set(
            f"Plan {display_tier(tier)}. Ścieżki wokalu: {tracks}. Efekty na ścieżce: {cap}. Nagranie do {seconds} s. {side_note}."
        )
        self.clock.set(f"0.0 s / {seconds} s")
        self._sync_add_button()
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

    def _client(self) -> SiteClient:
        client = SiteClient(SITE, self.token())
        try:
            client.plan_usage()
        except RuntimeError as error:
            if not is_unauthorized(error):
                raise
            client = SiteClient(SITE, self._refresh())
            client.plan_usage()
        return client

    def _refresh(self) -> str:
        saved = load_session()
        refresh = saved.get("refreshToken") if saved else ""
        if not saved or not refresh or not saved.get("supabaseUrl") or not saved.get("anonKey"):
            raise RuntimeError("Sesja wygasła. Zaloguj się jeszcze raz.")
        grant = supabase_refresh_grant(saved["supabaseUrl"], saved["anonKey"], refresh)
        save_session(saved["supabaseUrl"], saved["anonKey"], saved.get("email", ""), grant)
        return grant["access_token"]

    def _fill_menu(self, menu: tk.OptionMenu, variable: tk.StringVar, labels: list[str]) -> None:
        choices = menu["menu"]
        choices.delete(0, "end")
        for label in labels:
            choices.add_command(label=label, command=lambda value=label: variable.set(value))
        if variable.get() not in labels and labels:
            variable.set(labels[0])

    def reload_beats(self) -> None:
        current = self.beat_var.get()
        self._load_public()
        labels = [label for _beat_id, label in self.beats] or ["Brak bitu"]
        if current in labels:
            self.beat_var.set(current)
        self._filter_beats()
        self._sync_beat_button()
        self._sync_cassette()
        self.status.set(f"Lista bitów: {len(self.beats)}.")

    def sign_out(self) -> None:
        if self._uploading:
            self.status.set("Wysyłka trwa. Wyloguj po jej końcu.")
            return
        email = self.email.get().strip()
        old = load_session()
        if old and old.get("accessToken"):
            threading.Thread(
                target=supabase_logout,
                args=(old.get("supabaseUrl", ""), old.get("anonKey", ""), old["accessToken"]),
                daemon=True,
            ).start()
        SESSION.parent.mkdir(parents=True, exist_ok=True)
        SESSION.write_text(
            json.dumps(
                {
                    "supabaseUrl": self.public_url,
                    "anonKey": self.public_key,
                    "email": email,
                }
            ),
            encoding="utf-8",
        )
        self.tier = "FREE"
        self.project_id = ""
        self.password.delete(0, "end")
        self._read_plan()
        self.status.set("Wylogowano na tym komputerze.")
        self.gate_status.set("Wylogowano na tym komputerze.")
        self.show_gate()

    def _load_saved_takes(self) -> None:
        for path in list_saved_takes(TAKES):
            self._add_take(path)

    def sign_in(self) -> None:
        try:
            email = self.email.get().strip()
            password = self.password.get()
            saved = load_session()
            same_account = bool(saved and saved.get("accessToken") and saved.get("email") == email)
            if password == "" and same_account:
                self._read_plan()
                self.status.set("Zalogowano. Nagraj wokal, potem wyślij na konto.")
                self.gate_status.set("")
                self.show_studio()
                return
            if not email or not password:
                raise RuntimeError("Wpisz e-mail i hasło.")
            if not self.public_url or not self.public_key:
                self._load_public()
            grant = supabase_password_grant(self.public_url, self.public_key, email, password)
            save_session(self.public_url, self.public_key, email, grant)
            self.password.delete(0, "end")
            self._read_plan()
            self.status.set("Zalogowano. Nagraj wokal, potem wyślij na konto.")
            self.gate_status.set("")
            self.show_studio()
        except Exception as error:
            self.status.set(str(error))
            self.gate_status.set(str(error))

    def pick_local(self) -> None:
        picked = filedialog.askopenfilename(
            title="Bit do odsłuchu",
            filetypes=[("Audio", "*.wav *.mp3"), ("Wszystkie", "*.*")],
        )
        if not picked:
            return
        self.local_beat = Path(picked)
        self.local_label.set(self.local_beat.name)
        self._paint_lanes()
        self.status.set("Bit jest na ścieżce. Nagraj puści go w słuchawkach.")

    def _stop_monitor(self) -> None:
        stop_monitor(self.monitor)
        stop_monitor(self.mix_feed)
        self.monitor = None
        self.mix_feed = None

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
        self.meter.delete("needle")
        color = REC if level > 0.85 else AMBER
        self.meter.create_rectangle(0, 0, int(84 * level), 12, fill=color, outline="", tags="needle")
        self._paint_lamp()

    def _tick(self) -> None:
        if not self.recording:
            return
        if self.capture is not None and self.capture.poll() is not None:
            self._capture_died()
            return
        try:
            seconds = file_seconds(self.wav_path) if self.wav_path.exists() else 0.0
            cap = max_take_seconds(self.tier)
            self.clock.set(f"{seconds:.1f} s / {cap} s")
            self._draw_meter(tail_peak_db(self.wav_path))
            self._paint_lanes()
        except Exception:
            seconds = 0.0
            cap = max_take_seconds(self.tier)
        if seconds >= cap:
            try:
                self._finish_take()
            except Exception as error:
                self.status.set(str(error))
                return
            self.status.set(
                f"Plan {display_tier(self.tier)} kończy nagranie po {cap} s. Ujęcie jest na liście."
                + (f" {self._take_note}" if self._take_note else "")
            )
            return
        self._tick_id = self.root.after(200, self._tick)

    def _add_take(self, path: Path) -> None:
        if path in self.takes:
            return
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
        self._sync_beat_button()
        self._sync_fx_button()

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
        self.clock.set(f"{file_seconds(self.wav_path):.1f} s / {max_take_seconds(self.tier)} s")
        self._take_note = self._rate_take(self.wav_path)
        return self.wav_path

    def _rate_take(self, path: Path) -> str:
        """One sentence on level, clipping, and mic drops. Never blocks sending."""
        drops, _fatal = read_capture_log(path)
        try:
            db, clipped, _seconds = take_stats(path)
        except Exception:
            return ""
        return quality_note(db, clipped, drops)

    def _capture_died(self) -> None:
        """ffmpeg ended by itself: mic unplugged, taken by another program, or Windows closed it."""
        path = self.wav_path
        _drops, fatal = read_capture_log(path, remove=False)
        self._cancel_tick()
        self._stop_monitor()
        self.capture = None
        self.recording = False
        self._paint_lamp()
        reason = "Mikrofon przestał oddawać dźwięk (odłączony albo zajęty przez inny program)."
        if path.exists() and path.stat().st_size >= 1000:
            self._add_take(path)
            self._paint_lanes()
            reason += " Do tej chwili ujęcie jest zapisane na liście."
        elif fatal:
            reason += f" Windows: {fatal[:120]}"
        read_capture_log(path)
        self.status.set(reason)

    def _upload(self, paths: list[Path]) -> None:
        """Checks on the Tk thread, then the transfer runs in a worker so the window stays alive."""
        if self._uploading:
            raise RuntimeError("Wysyłka już trwa.")
        resume: UploadState | None = None
        dropped = ""
        if self._pending is not None:
            if [str(path) for path in paths] == self._pending.wav_paths:
                resume = self._pending
            else:
                self._pending = None
                clear_pending()
                dropped = "Przerwana wcześniej wysyłka została porzucona (są inne ścieżki). "
        picked = self.selected_fx()
        chain = build_chain(picked, self.tier)
        if resume is not None:
            title, beat_id = resume.title, resume.beat_id
        else:
            title = self.title_box.get().strip()
            if not title:
                raise RuntimeError("Wpisz tytuł.")
            cap = self._track_cap()
            if len(paths) > cap:
                raise RuntimeError(
                    f"Plan {display_tier(self.tier)} mieści {cap} ścieżek wokalu, a nagrane są {len(paths)}."
                )
            beat_id = self.selected_beat_id()
        self._uploading = True
        self._sync_send_buttons()
        self.status.set(
            dropped + ("Dokańczam przerwaną wysyłkę. " if resume else "Wysyłam na konto. ")
            + "Okno zostaje, nie zamykaj programu."
        )
        threading.Thread(
            target=self._run_upload,
            args=(title, beat_id, list(paths), chain, len(picked), resume),
            daemon=True,
        ).start()

    def _remember_state(self, state: UploadState) -> None:
        self._pending = state
        save_pending(state)

    def _upload_say(self, text: str) -> None:
        self.root.after(0, lambda: self.status.set(text) if self._uploading else None)

    def _run_upload(
        self,
        title: str,
        beat_id: str,
        paths: list[Path],
        chain: dict[str, object],
        fx_count: int,
        resume: UploadState | None = None,
    ) -> None:
        try:
            project = upload_vocals(
                self._client(),
                title=title,
                beat_id=beat_id,
                wav_paths=paths,
                chain=chain,
                progress=self._upload_say,
                resume=resume,
                on_state=self._remember_state,
            )
        except Exception as error:
            message = str(error)
            self.root.after(0, lambda: self._upload_done(None, len(paths), fx_count, message))
            return
        self.root.after(0, lambda: self._upload_done(project, len(paths), fx_count, ""))

    def _upload_done(self, project: str | None, tracks: int, fx_count: int, error: str) -> None:
        self._uploading = False
        self._sync_send_buttons()
        if project is None:
            hint = " Naciśnij Wyślij, żeby dokończyć." if self._pending is not None else ""
            self.status.set((error or "Wysyłka się nie udała.") + hint)
            return
        self._pending = None
        clear_pending()
        self.project_id = project
        fx_note = f" Efekty: {fx_count}." if fx_count else ""
        self.status.set(f"Projekt jest na koncie. Ścieżki wokalu: {tracks}.{fx_note} Id: {project}")

    def _sync_send_buttons(self) -> None:
        """Wyślij and Stop i wyślij stay greyed out until the transfer ends (no double project)."""
        for shell in getattr(self, "send_buttons", []):
            try:
                inner = shell.winfo_children()[0]
                inner.configure(state="disabled" if self._uploading else "normal")
            except Exception:
                pass

    def _build_update_bar(self) -> None:
        """Bottom strip, shown only when a newer signed build exists. Visible on every screen."""
        bar = tk.Frame(self.root, bg=RACK, highlightthickness=1, highlightbackground=AMBER)
        self.update_bar = bar
        self.update_var = tk.StringVar()
        self.update_label = tk.Label(
            bar, textvariable=self.update_var, bg=RACK, fg=INK, font=(FONT_UI, 10), anchor="w", justify="left", wraplength=520
        )
        self.update_label.pack(side="left", fill="x", expand=True, padx=12, pady=8)
        self.update_later = tk.Button(
            bar, text="Później", command=self._dismiss_update, bg=RACK, fg=SOFT, activebackground=RACK,
            activeforeground=INK, relief="flat", bd=0, padx=10, pady=4, font=(FONT_UI, 10), cursor="hand2",
        )
        self.update_later.pack(side="right", padx=(0, 10))
        self.update_now = tk.Button(
            bar, text="ZAKTUALIZUJ", command=self._apply_update, bg=AMBER, fg=ON_AMBER, activebackground=AMBER_SOFT,
            activeforeground=ON_AMBER, disabledforeground=MUTE, relief="flat", bd=0, padx=14, pady=4,
            font=(FONT_POSTER, 12, "bold"), cursor="hand2",
        )
        self.update_now.pack(side="right", padx=8)
        bar.bind("<Configure>", lambda event: self.update_label.configure(wraplength=max(200, event.width - 230)))

    def _start_update_check(self) -> None:
        """Quiet check in the background: at start and every 6 hours. Failures are ignored."""
        if os.environ.get("BITRYMDYM_NO_UPDATE") == "1" or os.environ.get("BITRYMDYM_UI_SMOKE") == "1":
            return
        threading.Thread(target=self._update_worker, daemon=True).start()
        self.root.after(6 * 3600 * 1000, self._start_update_check)

    def _update_worker(self) -> None:
        update = updater.check_for_update()
        if update is not None:
            self.root.after(0, lambda: self._offer_update(update))

    def _offer_update(self, update: updater.Update) -> None:
        if self._update_dismissed or self._update_busy:
            return
        self._update = update
        notes = f" {update.notes}" if update.notes else ""
        self.update_var.set(f"Jest nowa wersja {update.version} (masz {updater.APP_VERSION}).{notes}")
        self.update_now.configure(state="normal")
        if not self.update_bar.winfo_manager():
            self.update_bar.pack(side="bottom", fill="x", before=self.shell)

    def _dismiss_update(self) -> None:
        if self._update_busy:
            return
        self._update_dismissed = True
        self.update_bar.pack_forget()

    def _busy_for_update(self) -> bool:
        return self.recording or self._arming or self._uploading or self._probing

    def _apply_update(self) -> None:
        if self._update is None or self._update_busy:
            return
        if self._busy_for_update():
            self.update_var.set("Najpierw skończ nagranie, próbę mikrofonu albo wysyłkę, potem naciśnij Zaktualizuj.")
            return
        if self._update_ready is not None and self._update_ready.is_file():
            self._launch_update(self._update_ready)
            return
        self._update_busy = True
        self.update_now.configure(state="disabled")
        self.update_later.configure(state="disabled")
        self.update_var.set("Pobieram nową wersję: 0%")
        threading.Thread(target=self._download_update, args=(self._update,), daemon=True).start()

    def _download_update(self, update: updater.Update) -> None:
        def progress(done: int, total: int) -> None:
            self.root.after(0, lambda: self.update_var.set(f"Pobieram nową wersję: {done * 100 // max(1, total)}%"))

        try:
            path = updater.download(update, Path(os.environ.get("TEMP", ".")) / "BitRymDym-update", progress)
        except NETWORK_ERRORS as error:
            message = network_message(error)
        except ValueError:
            message = "Pobrany plik nie przeszedł sprawdzenia (rozmiar lub suma). Nie instaluję. Spróbuj później."
        except Exception:
            message = "Nie udało się pobrać aktualizacji. Spróbuj później."
        else:
            self.root.after(0, lambda: self._launch_update(path))
            return
        self.root.after(0, lambda: self._update_failed(message))

    def _update_failed(self, message: str) -> None:
        self._update_busy = False
        self.update_now.configure(state="normal")
        self.update_later.configure(state="normal")
        self.update_var.set(f"{message} Instalator jest też na stronie /nagrywarka.")

    def _launch_update(self, path: Path) -> None:
        if self._busy_for_update():
            self._update_ready = path
            self._update_busy = False
            self.update_now.configure(state="normal")
            self.update_later.configure(state="normal")
            self.update_var.set("Aktualizacja jest pobrana. Skończ nagranie albo wysyłkę i naciśnij Zaktualizuj.")
            return
        try:
            updater.start_installer(path)
        except OSError:
            self._update_failed("Nie udało się uruchomić instalatora.")
            return
        self._update_busy = True
        self.update_var.set("Instaluję nową wersję. Program zamknie się i uruchomi sam.")
        self.root.after(700, self._on_close)

    def toggle_mic_test(self) -> None:
        """Level check before recording: the mic is opened on its own, nothing is kept."""
        if self._probing:
            self._stop_probe("Próba zakończona.")
            return
        try:
            if self.recording or self._arming:
                raise RuntimeError("Najpierw Stop.")
            self._stop_monitor()
            device = self.selected_device()
            self._probe_proc = start_capture(self._probe_path, device)
        except Exception as error:
            self.probe_var.set(str(error))
            return
        self._probing = True
        self._probe_started = time.monotonic()
        self._probe_hist = []
        self.probe_button.configure(text="STOP PRÓBY")
        self.probe_var.set("Słucham mikrofonu. Powiedz coś albo zaśpiewaj.")
        self._probe_tick()

    def _probe_tick(self) -> None:
        if not self._probing:
            return
        proc = self._probe_proc
        if proc is None or proc.poll() is not None:
            _drops, fatal = read_capture_log(self._probe_path, remove=False)
            reason = "Mikrofon nie odpowiada (zajęty przez inny program albo odłączony)."
            self._stop_probe(reason + (f" Windows: {fatal[:100]}" if fatal else ""))
            return
        now = time.monotonic()
        if now - self._probe_started > 60:
            self._stop_probe("Próba skończyła się po 60 s.")
            return
        db = tail_peak_db(self._probe_path)
        self._probe_hist = [(t, v) for t, v in self._probe_hist if now - t <= 3.0] + [(now, db)]
        peak = max(v for _t, v in self._probe_hist)
        self._draw_probe(db, peak)
        self.probe_var.set(f"Poziom {level_text(db)}, szczyt {level_text(peak)}. {probe_hint(peak)}")
        self._probe_after = self.root.after(120, self._probe_tick)

    def _draw_probe(self, db: float, peak: float) -> None:
        meter = self.probe_meter
        meter.delete("all")
        width = int(meter.cget("width"))
        level = max(0.0, min(1.0, (db + 60.0) / 60.0))
        hold = max(0.0, min(1.0, (peak + 60.0) / 60.0))
        meter.create_rectangle(0, 0, int(width * level), 12, fill=REC if level > 0.95 else AMBER, outline="")
        meter.create_line(int(width * hold), 0, int(width * hold), 12, fill=INK)

    def _stop_probe(self, message: str = "") -> None:
        if self._probe_after:
            try:
                self.root.after_cancel(self._probe_after)
            except Exception:
                pass
            self._probe_after = None
        proc, self._probe_proc = self._probe_proc, None
        if proc is not None:
            try:
                stop_capture(proc)
            except Exception:
                pass
        for leftover in (self._probe_path, capture_log_path(self._probe_path)):
            try:
                leftover.unlink()
            except OSError:
                pass
        was = self._probing
        self._probing = False
        if was:
            self.probe_button.configure(text="PRÓBA MIKROFONU")
            self.probe_meter.delete("all")
        if message:
            self.probe_var.set(message)

    def arm(self) -> None:
        if self.recording or self._arming:
            return
        self._stop_probe()
        if not self.vocals:
            self.status.set("Brak ścieżki wokalu.")
            return
        self._arming = True
        self._arm_token += 1
        token = self._arm_token
        self.status.set("Łączę odsłuch bitu. Okno zostaje.")
        threading.Thread(
            target=self._prepare_listen, args=(token, self._beat_id_or_empty()), daemon=True
        ).start()

    def _prepare_listen(self, token: int, beat_id: str) -> None:
        try:
            heard = self._beat_listen(beat_id)
        except Exception as error:
            heard = (None, None, self._safe_listen_error(error))
        self.root.after(0, lambda result=heard, mark=token: self._begin_take(mark, result))

    def _begin_take(self, token: int, heard: tuple[str | None, int | None, str]) -> None:
        if token != self._arm_token:
            self._arming = False
            return
        target, limit, note = heard
        try:
            if self.capture:
                stop_capture(self.capture)
            self._cancel_tick()
            self._stop_monitor()
            if not self.vocals:
                raise RuntimeError("Brak ścieżki wokalu.")
            TAKES.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now().strftime("%H%M%S%f")
            path = TAKES / f"ujecie-{stamp}.wav"
            self.capture = start_capture(path, self.selected_device())
            self.wav_path = path
            self._wave_for = None
            self._beat_shown = 0.0
            self.vocals[self.armed]["path"] = path
            if target is not None:
                self.monitor = start_monitor(target, limit)
                if self.monitor is None:
                    note = NO_FFPLAY + " Nagranie idzie bez odsłuchu."
            self.recording = True
            name = self.vocals[self.armed]["name"]
            self.status.set(f"Nagrywam {name}. {note}")
            self._paint_lanes()
            self._tick()
        except Exception as error:
            self.recording = False
            self.capture = None
            self._cancel_tick()
            self._stop_monitor()
            self._paint_lamp()
            self.status.set(self._safe_listen_error(error))
        finally:
            self._arming = False

    def stop_take(self) -> None:
        try:
            if self._arming and not self.recording:
                self._arm_token += 1
                self._arming = False
                self._stop_monitor()
                self.status.set("Odsłuch przerwany.")
                return
            if not self.recording or not self.capture:
                raise RuntimeError("Najpierw naciśnij Nagraj.")
            self._finish_take()
            self._paint_lanes()
            self.status.set(
                "Ujęcie jest na ścieżce. "
                + (f"{self._take_note} " if self._take_note else "")
                + "Wyślij wrzuca nagrane ścieżki na jedno konto."
            )
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
        if self._uploading:
            self.status.set("Wysyłka już trwa. Poczekaj na koniec.")
            return
        try:
            if self.recording:
                self._finish_take()
            paths = self._lane_paths()
            if not paths and self._pending is not None:
                paths = [Path(item) for item in self._pending.wav_paths]
            if not paths:
                raise RuntimeError("Najpierw nagraj wokal na ścieżkę.")
            self._upload(paths)
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
        self.root.after(3000, self._start_update_check)
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
        if "-nodisp" not in argv or argv[-1] != "bit.wav" or "-t" in argv or "nobuffer" not in argv:
            raise SystemExit("odsłuch")
        limited = monitor_argv("ffplay", "https://example.invalid/listen", 20)
        if limited[-3:] != ["-t", "20", "https://example.invalid/listen"] or "32768" not in limited:
            raise SystemExit("limit odsłuchu")
        mic = capture_argv("ffmpeg", "Mic", Path("a.wav"))
        if mic[mic.index("-audio_buffer_size") + 1] != "20":
            raise SystemExit("bufor mikrofonu")
        if mic[mic.index("-rtbufsize") + 1] != MIC_RTBUF:
            raise SystemExit("bufor czasu rzeczywistego")
        if capture_log_path(Path("x/ujecie-1.wav")) != Path("x/ujecie-1.log"):
            raise SystemExit("log mikrofonu")
        with __import__("tempfile").TemporaryDirectory() as raw_dir:
            folder = Path(raw_dir)
            if find_tool("ffplay", [folder], "C:/path/ffplay.exe") != "C:/path/ffplay.exe":
                raise SystemExit("ffplay: brak obok programu ma wrócić do PATH")
            (folder / "ffplay.exe").write_bytes(b"x")
            if find_tool("ffplay", [folder], "C:/path/ffplay.exe") != str(folder / "ffplay.exe"):
                raise SystemExit("ffplay: kopia obok programu ma wygrać z PATH")
            if find_tool("ffplay", [folder / "none"], None) is not None:
                raise SystemExit("ffplay: nic nie ma być None")
        flags = quiet_kwargs()
        if os.name == "nt" and flags.get("creationflags") != subprocess.CREATE_NO_WINDOW:
            raise SystemExit("konsola")
        left, right = pan_gains(-1.0)
        if abs(left - 1.0) > 0.001 or abs(right) > 0.001:
            raise SystemExit("pan lewo")
        hard_right = pan_gains(1.0)
        if abs(hard_right[0]) > 0.001 or abs(hard_right[1] - 1.0) > 0.001:
            raise SystemExit("pan prawo")
        graph = " ".join(mix_argv("ffmpeg", None, [(Path("wokal.wav"), 6.0, 1.0)], None))
        if "wokal.wav" not in graph or "volume=" not in graph or "pan=stereo" not in graph:
            raise SystemExit("miks")
        self_test_wav_roundtrip()
        target = Path(os.environ.get("TEMP", ".")) / "bitrymdym-mic-selftest.wav"
        record_seconds(target, 0.4)
        target.unlink(missing_ok=True)
        print("recorder self-test ok")
    elif os.environ.get("BITRYMDYM_UI_SMOKE") == "1":
        _ = write_pcm16_wav
        window = RecorderWindow()
        window.root.update_idletasks()
        def labels(widget: tk.Widget):
            found: list[str] = []
            for child in widget.winfo_children():
                if isinstance(child, tk.Label):
                    found.append(str(child.cget("text")))
                found.extend(labels(child))
            return found

        note = Path(os.environ.get("TEMP", ".")) / "bitrymdym-exe-smoke.txt"
        words = labels(window.gate)
        cap = window._track_cap()
        for _extra in range(cap + 2):
            window._add_lane_clicked()
        note.write_text(
            "\n".join(
                (
                    f"beats={len(window.beats)}",
                    f"fx={len(window.fx_vars)}",
                    f"ffmpeg={ffmpeg_exe()}",
                    f"ffplay={ffplay_exe()}",
                    f"gate={window.gate.winfo_manager()}",
                    f"icon={1 if brand_file('cassette.png') else 0}",
                    f"logo={1 if brand_file('logo-light.png') else 0}",
                    f"signup={int('Zarejestruj się' in words)}",
                    f"forgot={int('Nie pamiętam hasła' in words)}",
                    f"fx_closed={int(not window.fx_rack.winfo_manager())}",
                    f"beat_rows={window.beat_box.cget('height')}",
                    f"beat_closed={int(not window.beat_panel.winfo_manager())}",
                    f"scroll={window.scrollbar.cget('style')}",
                    f"beat_lane={int(window.beat_lane.winfo_exists())}",
                    f"vocal_lane={int(window.vocal_lane.winfo_exists())}",
                    f"track_cap={cap}",
                    f"vocal_count={len(window.vocals)}",
                    f"add_text={window.add_button.cget('text')}",
                )
            )
            + "\n",
            encoding="utf-8",
        )
        window.root.destroy()
    else:
        # Keep the WAV writer available for a silent tone when the mic is closed.
        _ = write_pcm16_wav
        RecorderWindow().run()
