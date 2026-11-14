"""Windows recording studio. Audacity-style tracks.

After login the account picks Studio Online (catalog beat, plan track cap, send to the site)
or Studio Offline (Gold: own beat file, 16 vocal tracks + 6 doubles/adlibs, no upload).
Offline writes a .brd1 project (session plus dry stems, never the beat) or a folder of stems and sesja.brd.json. Mix and master stay on the site. No VST.
"""

from __future__ import annotations

import array
import ctypes
import hashlib
import io
import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time
import tkinter as tk
import wave
import tkinter.font as tkfont
import tkinter.ttk as ttk
import webbrowser
from dataclasses import dataclass, field, replace
from datetime import datetime
from tkinter import filedialog, messagebox, simpledialog
from typing import Callable
import urllib.error
import urllib.request
from pathlib import Path

import updater
import offline_session
import win_output
from account_upload import (
    NETWORK_ERRORS,
    SITE,
    SiteClient,
    UploadState,
    friendly_upload_error,
    is_unauthorized,
    network_message,
    playback_target,
    upload_vocals,
)
from desk import (
    quality_note,
    scan_capture_log,
    level_text,
    max_recording_tracks,
    max_take_seconds,
    open_session,
    probe_hint,
    read_file_range,
    read_prefs,
    seal_session,
    studio_url,
    file_seconds,
    tail_peak_db,
    wav_data_offset_of,
    write_prefs,
)
from own_fx import display_tier, limits_from_usage
from record_wav import read_mono16, replace_mono16, take_stats, write_pcm16_wav
from timeline import (
    RATE,
    Clip,
    block_peaks,
    carve,
    clip_at,
    clip_key,
    extract,
    ordered,
    place,
    render,
    shift,
    split_at,
    track_end,
)

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
LANE_BG = "#120e0b"
SEL_BG = "#3a3028"
# Vocal clip colors, warm and tape-like, readable with dark ink on top.
TRACK_COLORS = ("#e8735a", "#f2a93b", "#d9c45a", "#7cc68d", "#5fb6c9", "#9b8be0", "#d27fc0", "#e0937a")
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
DESK = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-sesja.json"
DESK_OFFLINE = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-sesja-offline.json"


@dataclass
class Track:
    """One vocal track. The beat is not a Track and does not count to the plan limit."""

    name: str
    color: str = TRACK_COLORS[0]
    clips: list[Clip] = field(default_factory=list)
    muted: bool = False
    solo: bool = False
    gain_db: float = 0.0
    pan: float = 0.0
    role: str = "wokal"


def clock_text(seconds: float) -> str:
    seconds = max(0.0, seconds)
    return f"{int(seconds // 60)}:{seconds % 60:05.2f}"


def shade(color: str, factor: float) -> str:
    """Same hue, darker (factor < 1). Keeps the tape palette without new colors."""
    raw = color.lstrip("#")
    parts = [int(raw[index : index + 2], 16) for index in (0, 2, 4)]
    return "#" + "".join(f"{max(0, min(255, int(part * factor))):02x}" for part in parts)


def display_wave_half(level: float, half_max: float) -> float:
    """Taller drawing for a quiet take. The WAV samples stay as recorded."""
    if level <= 0.0015 or half_max <= 0:
        return 1.0
    shown = min(1.0, level ** 0.35)
    return max(1.5, half_max * shown)


def live_wave_span(elapsed: float, peak_count: int) -> tuple[float, float]:
    """Seconds of real mic peaks, then how far the drawing reaches (the play line)."""
    known = max(0.0, peak_count / 100.0)
    return known, max(known, max(0.0, elapsed))


def mono16_wav_bytes(samples: array.array) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(samples.tobytes())
    return buffer.getvalue()


# Same paths and operator as src/lib/legal/legal-config.ts. The app links out. It does not copy the documents.
ABOUT_LINKS = (
    ("Regulamin", "/regulamin"),
    ("Polityka prywatności", "/polityka-prywatnosci"),
    ("Cookies", "/cookies"),
    ("O stronie", "/about"),
    ("Jak nagrać", "/jak-nagrac"),
    ("Nagrywarka", "/nagrywarka"),
)
ABOUT_OPERATOR = (
    "D&P Dawid Thai Thanh\n"
    "osoba fizyczna prowadząca jednoosobową działalność gospodarczą wpisaną do CEIDG\n"
    "ul. Poświęcka 17C/26, 51-128 Wrocław\n"
    "NIP 8952035524\n"
    "dawid.thai@int.pl"
)


def about_copy_ok() -> bool:
    paths = {path for _label, path in ABOUT_LINKS}
    needed = {"/regulamin", "/polityka-prywatnosci", "/cookies", "/about", "/jak-nagrac", "/nagrywarka"}
    return paths == needed and "8952035524" in ABOUT_OPERATOR and "dawid.thai@int.pl" in ABOUT_OPERATOR and "Poświęcka" in ABOUT_OPERATOR


# Thin strip under every screen. Legal pages stay in O programie, so this line does not repeat them.
FOOTER_CREDIT = "© D.T.T (TajskiProjects.pl). Wszystkie prawa zastrzeżone."


def footer_copy_ok() -> bool:
    return FOOTER_CREDIT == "© D.T.T (TajskiProjects.pl). Wszystkie prawa zastrzeżone."


def wants_remember(value: object) -> bool:
    """Missing flag keeps the saved login. Only an explicit 0 drops it on exit."""
    return str(value or "") != "0"


_INSTANCE_LOCK: object = None
_INSTANCE_NAME = "Local\\BitRymDym.Nagrywarka"


def _pids_named(exe: str) -> set[int] | None:
    """Process ids whose exe name matches. None when Windows will not list processes."""
    if os.name != "nt":
        return set()
    try:
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.CreateToolhelp32Snapshot.restype = ctypes.c_void_p
        kernel.CreateToolhelp32Snapshot.argtypes = [ctypes.c_ulong, ctypes.c_ulong]
        kernel.Process32FirstW.restype = ctypes.c_int
        kernel.Process32NextW.restype = ctypes.c_int
        kernel.Process32FirstW.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        kernel.Process32NextW.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]

        class PROCESSENTRY32W(ctypes.Structure):
            _fields_ = [
                ("dwSize", ctypes.c_ulong),
                ("cntUsage", ctypes.c_ulong),
                ("th32ProcessID", ctypes.c_ulong),
                ("th32DefaultHeapID", ctypes.c_void_p),
                ("th32ModuleID", ctypes.c_ulong),
                ("cntThreads", ctypes.c_ulong),
                ("th32ParentProcessID", ctypes.c_ulong),
                ("pcPriClassBase", ctypes.c_long),
                ("dwFlags", ctypes.c_ulong),
                ("szExeFile", ctypes.c_wchar * 260),
            ]

        snap = kernel.CreateToolhelp32Snapshot(0x00000002, 0)
        if not snap or snap == ctypes.c_void_p(-1).value:
            return None
        entry = PROCESSENTRY32W()
        entry.dwSize = ctypes.sizeof(entry)
        found: set[int] = set()
        try:
            if not kernel.Process32FirstW(snap, ctypes.byref(entry)):
                return found
            while True:
                if entry.szExeFile.lower() == exe.lower():
                    found.add(int(entry.th32ProcessID))
                if not kernel.Process32NextW(snap, ctypes.byref(entry)):
                    break
        finally:
            kernel.CloseHandle(snap)
        return found
    except Exception:
        return None


def _recorder_hwnds() -> list[int] | None:
    """Visible or minimized windows of another BitRymDym.exe. None if the list cannot be read."""
    pids = _pids_named("BitRymDym.exe")
    if pids is None:
        return None
    others = pids - {os.getpid()}
    user32 = ctypes.windll.user32
    user32.GetWindowThreadProcessId.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
    user32.IsWindowVisible.argtypes = [ctypes.c_void_p]
    user32.IsIconic.argtypes = [ctypes.c_void_p]
    found: list[int] = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)
    def visit(hwnd: int, _lparam: int) -> bool:
        pid = ctypes.c_ulong()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if int(pid.value) in others and (user32.IsWindowVisible(hwnd) or user32.IsIconic(hwnd)):
            found.append(int(hwnd))
        return True

    user32.EnumWindows.argtypes = [type(visit), ctypes.c_void_p]
    if not user32.EnumWindows(visit, 0) and not found:
        return None
    return found


def _reveal_recorder_window() -> bool:
    hwnds = _recorder_hwnds()
    if not hwnds:
        return False
    user32 = ctypes.windll.user32
    user32.ShowWindow.argtypes = [ctypes.c_void_p, ctypes.c_int]
    user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
    user32.ShowWindow(hwnds[0], 9)  # SW_RESTORE
    user32.SetForegroundWindow(hwnds[0])
    return True


def _stop_windowless_recorder() -> None:
    """End a BitRymDym.exe that kept the lock after its window was already gone."""
    pids = _pids_named("BitRymDym.exe")
    if not pids:
        return
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.OpenProcess.restype = ctypes.c_void_p
    kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
    kernel.TerminateProcess.argtypes = [ctypes.c_void_p, ctypes.c_uint]
    kernel.WaitForSingleObject.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    for pid in pids - {os.getpid()}:
        handle = kernel.OpenProcess(0x0001 | 0x00100000, False, pid)
        if not handle:
            continue
        kernel.TerminateProcess(handle, 0)
        kernel.WaitForSingleObject(handle, 3000)
        kernel.CloseHandle(handle)


def _create_instance_lock():
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateMutexW.restype = ctypes.c_void_p
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
    ctypes.set_last_error(0)
    handle = kernel.CreateMutexW(None, False, _INSTANCE_NAME)
    return handle, ctypes.get_last_error()


def single_instance() -> bool:
    """One recorder per Windows user. A second click shows the window that is already open.

    An update can close the window and leave the process. That copy has no window, so this
    start ends it and opens. A visible window is only brought forward.
    """
    global _INSTANCE_LOCK
    if os.name != "nt":
        return True
    handle, error = _create_instance_lock()
    _INSTANCE_LOCK = handle
    if error != 183:  # ERROR_ALREADY_EXISTS
        return True
    if _reveal_recorder_window():
        return False
    time.sleep(0.8)
    if _reveal_recorder_window():
        return False
    if _recorder_hwnds() is None:
        ctypes.windll.user32.MessageBoxW(
            None, "Program BitRymDym jest już otwarty. Przełącz się na jego okno na pasku zadań.", "BitRymDym", 0x40
        )
        return False
    _stop_windowless_recorder()
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    if handle:
        kernel.CloseHandle(handle)
    handle, error = _create_instance_lock()
    _INSTANCE_LOCK = handle
    if error == 183:
        ctypes.windll.user32.MessageBoxW(
            None, "Program BitRymDym jest już otwarty. Przełącz się na jego okno na pasku zadań.", "BitRymDym", 0x40
        )
        return False
    return True


def count_word(count: int, one: str, few: str, many: str) -> str:
    """Polish plural: 1 ścieżka, 2 ścieżki, 5 ścieżek, 22 ścieżki."""
    if count == 1:
        return f"{count} {one}"
    if count % 10 in (2, 3, 4) and count % 100 not in (12, 13, 14):
        return f"{count} {few}"
    return f"{count} {many}"


def group_for_takes(clips: list[Clip], cap: float) -> list[list[Clip]]:
    """Consecutive clips of one track, joined while the span fits in one take of the plan."""
    groups: list[list[Clip]] = []
    for clip in clips:
        if groups and max(item.end for item in groups[-1]) - groups[-1][0].start <= cap and clip.end - groups[-1][0].start <= cap:
            groups[-1].append(clip)
        else:
            groups.append([clip])
    return groups


def listen_valid_for(expires_at: object, now: datetime | None = None) -> float:
    """Seconds to keep a listen address: until 30 s before the site says it ends. 45 s when unknown."""
    if not isinstance(expires_at, str) or not expires_at:
        return 45.0
    try:
        end = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except ValueError:
        return 45.0
    current = now or datetime.now(end.tzinfo)
    return max(0.0, min(3600.0, (end - current).total_seconds() - 30.0))


def safe_name(text: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in "-_ " else "-" for char in text).strip().replace(" ", "-")
    return cleaned[:60] or "nagranie"


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


def start_mix(
    ffmpeg: str, ffplay: str, argv: list[str], output_index: int | None = None
) -> tuple[subprocess.Popen[bytes], object]:
    """One mix. The beat URL is not written to disk. A chosen output uses waveOut; default stays on ffplay."""
    feed = subprocess.Popen(
        argv,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        **quiet_kwargs(),
    )
    if output_index is not None and feed.stdout is not None:
        fd = os.dup(feed.stdout.fileno())
        feed.stdout.close()
        player = win_output.WavePlayer(os.fdopen(fd, "rb"), output_index)
        player.start()
        return feed, player
    if not ffplay:
        feed.kill()
        raise RuntimeError(NO_FFPLAY)
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
    beat_start: float = 0.0,
    beat_gain_db: float = 0.0,
    beat_pan: float = 0.0,
) -> list[str]:
    """Beat from beat_start (the cursor) plus vocal tracks already rendered from the same point."""
    argv = [ffmpeg, "-hide_banner", "-loglevel", "error", "-nostdin"]
    stems: list[tuple[float, float]] = []
    if beat:
        if beat_start > 0:
            argv.extend(["-ss", f"{beat_start:.3f}"])
        if isinstance(limit, int) and limit > 0:
            argv.extend(["-t", str(max(1, int(math.ceil(limit - beat_start))))])
        argv.extend(["-i", beat])
        stems.append((max(0.0, min(4.0, 0.85 * 10 ** (beat_gain_db / 20))), beat_pan))
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
    def preferred(name: str) -> int:
        low = name.lower()
        words = ("microphone", "mikrofon", "mic", "headset", "iphone", "bluetooth", "słuchaw")
        return 0 if any(word in low for word in words) else 1

    ordered = sorted(names, key=preferred)
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
    # WAV is the take. Raw frames on stdout are only for the live drawing.
    # -t has to limit both outputs, or a timed capture would never finish.
    limit = ["-t", str(seconds)] if seconds is not None else []
    argv.extend(limit)
    argv.extend(["-fflags", "+flush_packets", "-flush_packets", "1", str(path)])
    argv.extend(limit)
    argv.extend([
        "-f", "s16le", "-ac", "1", "-ar", "48000",
        "-fflags", "+flush_packets", "-flush_packets", "1",
        "pipe:1",
    ])
    return argv


def peaks_from_pcm(blob: bytes) -> list[float]:
    """10 ms peaks from little-endian 16-bit mono at 48 kHz. Short tails are kept for the next read."""
    frame = 960
    usable = len(blob) - (len(blob) % frame)
    if usable <= 0:
        return []
    samples = array.array("h")
    samples.frombytes(blob[:usable])
    if sys.byteorder != "little":
        samples.byteswap()
    return block_peaks(samples)


def _capture_peak_reader(proc: subprocess.Popen[bytes]) -> None:
    """Drain ffmpeg stdout so the pipe never fills, and keep peaks for the lane."""
    stream = proc.stdout
    peaks: list[float] = getattr(proc, "live_peaks", [])
    if stream is None:
        return
    pending = b""
    frame = 960
    try:
        while True:
            chunk = stream.read(frame * 4)
            if not chunk:
                break
            pending += chunk
            usable = len(pending) - (len(pending) % frame)
            if usable <= 0:
                continue
            block = pending[:usable]
            pending = pending[usable:]
            try:
                peaks.extend(peaks_from_pcm(block))
            except Exception:
                continue
    except Exception:
        try:
            while stream.read(frame * 4):
                pass
        except Exception:
            return


def capture_log_path(path: Path) -> Path:
    return path.with_suffix(".log")


def start_capture(path: Path, device: str) -> subprocess.Popen[bytes]:
    path.parent.mkdir(parents=True, exist_ok=True)
    # ffmpeg errors go to a file: dropped mic frames and a dead device are visible afterwards.
    with capture_log_path(path).open("wb") as log:
        proc = subprocess.Popen(
            capture_argv(ffmpeg_exe(), device, path),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=log,
            bufsize=0,
            **quiet_kwargs(),
        )
    # The reader starts before return so the stdout pipe cannot fill and stall the take.
    setattr(proc, "live_peaks", [])
    threading.Thread(target=_capture_peak_reader, args=(proc,), daemon=True, name="brd-live-peaks").start()
    return proc


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
            raise RuntimeError("Logowanie nie weszło. Sprawdź e-mail i hasło. Jak zmieniłeś hasło na stronie, wpisz nowe.") from None
        raise RuntimeError(f"Serwer logowania nie odpowiada (kod {error.code}). Spróbuj za chwilę.") from None
    except NETWORK_ERRORS as error:
        raise RuntimeError(network_message(error)) from None
    token = payload.get("access_token")
    if not isinstance(token, str) or token.count(".") != 2:
        raise RuntimeError("Konto nie oddało tokenu.")
    return {"access_token": token, "refresh_token": str(payload.get("refresh_token") or "")}


def save_session(url: str, anon_key: str, email: str, grant: dict[str, str], remember: bool = True) -> None:
    """Tokens are sealed with Windows DPAPI (only this Windows user can read them)."""
    SESSION.parent.mkdir(parents=True, exist_ok=True)
    session = {
        "supabaseUrl": url,
        "anonKey": anon_key,
        "email": email,
        "accessToken": grant["access_token"],
        "refreshToken": grant["refresh_token"],
        "remember": "1" if remember else "0",
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
    if session is None or not any(session.get(key) for key in ("accessToken", "email", "supabaseUrl")):
        return None
    if reseal and os.name == "nt":
        # An older plain file: seal it now so the tokens stop sitting in the clear.
        try:
            SESSION.write_text(json.dumps(seal_session(session)), encoding="utf-8")
        except OSError:
            pass
    return session


def forget_tokens(saved: dict[str, str] | None = None, remember: str | None = None) -> None:
    """Drop the login tokens and keep the e-mail. A dead session must not enter by itself."""
    current = saved
    if current is None and SESSION.exists():
        try:
            raw = json.loads(SESSION.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if isinstance(raw, dict):
            opened, _reseal = open_session(raw)
            current = opened
    if not current:
        return
    kept = {
        key: current.get(key, "")
        for key in ("supabaseUrl", "anonKey", "email")
        if current.get(key)
    }
    flag = remember if remember is not None else str(current.get("remember") or "")
    if flag in ("0", "1"):
        kept["remember"] = flag
    try:
        SESSION.parent.mkdir(parents=True, exist_ok=True)
        SESSION.write_text(json.dumps(kept), encoding="utf-8")
    except OSError:
        pass


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
    # ---- window and screens -------------------------------------------------

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
        self.ui = dpi_scale()
        self.lane_h = int(188 * self.ui)
        self.head_w = int(250 * self.ui)
        self.clip_bar = int(17 * self.ui)
        self.shell = tk.Frame(self.root, bg=PAPER, highlightthickness=1, highlightbackground=LINE_STRONG)
        self.shell.pack(fill="both", expand=True)
        if self._borderless:
            self._build_chrome()
            if os.environ.get("BITRYMDYM_FRAME_CHECK") == "1":
                self.root.attributes("-alpha", 0)
        else:
            self.root.geometry("480x740")
        self._build_footer()
        self._apply_icon()
        self._style_scroll()
        self.recording = False
        self._arming = False
        self._uploading = False
        self._exporting = False
        self._pending: UploadState | None = load_pending()
        self._update: updater.Update | None = None
        self._update_ready: Path | None = None
        self._update_busy = False
        self._update_dismissed = False
        self._update_abort = False
        self._update_left = 0
        self._probing = False
        self._probe_proc: subprocess.Popen[bytes] | None = None
        self._probe_path = Path(os.environ.get("TEMP", ".")) / "bitrymdym-mic-probe.wav"
        self._probe_started = 0.0
        self._probe_hist: list[tuple[float, float]] = []
        self._probe_after: str | None = None
        self._take_note = ""
        self._arm_token = 0
        self._play_token = 0
        # Timeline state. Seconds everywhere; pixels only in painting.
        self.tracks: list[Track] = []
        self.rows: list[dict[str, object]] = []
        self.armed = 0
        self.focus = 0
        self.cursor = 0.0
        self.sel: tuple[int, float, float] | None = None
        self.pps = 14.0 * self.ui
        self.view = 0.0
        self.beat_muted = False
        self.beat_gain_db = 0.0
        self.beat_pan = 0.0
        self._remix_token = 0
        self._remix_after: str | None = None
        self._gear_scanning = False
        self._output_testing = False
        self._pref_device = ""
        self._pref_output = ""
        self._pref_beat = ""
        self._desk_beat = ""
        self.studio_mode = "online"
        self.local_beat_path = ""
        self.local_beat_seconds = 0.0
        self.studio_kicker = tk.StringVar(value="STUDIO ONLINE")
        self.undo_stack: list[tuple[list[Track], int]] = []
        self.clipboard: list[Clip] = []
        self._drag: dict[str, object] | None = None
        # Only a window that changed something writes the desk on close (no stale overwrite).
        self._touched = False
        self._audio: dict[str, array.array] = {}
        self._peaks: dict[str, list[float]] = {}
        self._listen_cache: tuple[str, float, tuple[str | None, int | None, str]] | None = None
        self._client_cache: tuple[SiteClient, float] | None = None
        self.playing = False
        self._play_from = 0.0
        self._play_t0 = 0.0
        self._play_after: str | None = None
        self.rec_track = 0
        self.rec_start = 0.0
        self._live_peaks: list[float] = []
        self._live_off = 0
        self._live_rect: int | None = None
        self._live_bar: int | None = None
        self._live_canvas: tk.Canvas | None = None
        self._live_wave_at = 0.0
        self._beat_peaks: list[float] = []
        self._beat_peak_path = ""
        self.capture: subprocess.Popen[bytes] | None = None
        self.monitor: subprocess.Popen[bytes] | None = None
        self.mix_feed: subprocess.Popen[bytes] | None = None
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        self.wav_path = Path(os.environ.get("TEMP", ".")) / "bitrymdym-vocal.wav"
        self.project_id = ""
        self._tick_id: str | None = None
        self.devices: list[str] = []
        self.outputs: list[tuple[str, int]] = [("Domyślne", -1)]
        self.status_boot = ""
        self.public_url = ""
        self.public_key = ""
        self.beats: list[tuple[str, str]] = []
        self.beat_info: dict[str, tuple[str, int, float]] = {}
        self.tier = "FREE"
        self.gate_status = tk.StringVar(value="Łączę ze stroną.")
        self.status = tk.StringVar(value="Ładuję listę bitów ze strony.")
        self.plan_text = tk.StringVar(value="Plan: zaloguj się.")
        self.clock = tk.StringVar(value="0:00.00")
        self.device_var = tk.StringVar(value="Szukam mikrofonów…")
        self.output_var = tk.StringVar(value="Domyślne")
        self.beat_var = tk.StringVar()
        self.title_var = tk.StringVar(value="Nagranie z komputera")
        self.account_line = tk.StringVar(value="Konto")
        saved = load_session()
        if saved:
            self.public_url = saved.get("supabaseUrl", "")
            self.public_key = saved.get("anonKey", "")
        self._build_update_bar()
        self._build_gate(saved if isinstance(saved, dict) else None)
        self._build_modes()
        self._build_studio()
        self.beat_var.trace_add("write", lambda *_args: self._beat_changed())
        self._load_prefs()
        self._restore_desk()
        if self.status_boot:
            self.status.set(self.status_boot)
            self.gate_status.set(self.status_boot)
        self.root.bind_all("<MouseWheel>", self._on_wheel)
        for sequence, handler in (
            ("<space>", lambda: self.toggle_play()),
            ("<Delete>", lambda: self.edit("delete")),
            ("<BackSpace>", lambda: self.edit("delete")),
            ("<Control-z>", lambda: self.undo()),
            ("<Control-x>", lambda: self.edit("cut")),
            ("<Control-c>", lambda: self.edit("copy")),
            ("<Control-v>", lambda: self.edit("paste")),
            ("<Control-i>", lambda: self.edit("split")),
            ("<Home>", lambda: self._set_cursor(0.0)),
            ("<r>", lambda: self.record()),
        ):
            self.root.bind(sequence, lambda event, run=handler: self._key(event, run))
        self.show_gate()
        # Device list and the beat catalog both block. The login window is up first.
        self.root.after(60, self._boot_background)

    def _key(self, event: tk.Event, run: Callable[[], object]) -> str | None:
        """Shortcuts work on the timeline, not while typing in a text field."""
        if not self.studio.winfo_manager() or isinstance(event.widget, (tk.Entry, tk.Listbox)):
            return None
        run()
        return "break"

    def _on_wheel(self, event: tk.Event) -> str | None:
        if self.modes.winfo_manager():
            step = int(-event.delta / 120) or (-1 if event.delta < 0 else 1)
            self.modes_canvas.yview_scroll(step, "units")
            return "break"
        if not self.studio.winfo_manager() or isinstance(event.widget, tk.Listbox):
            return None
        step = int(-event.delta / 120) or (-1 if event.delta < 0 else 1)
        ctrl = bool(event.state & 0x4)
        shift = bool(event.state & 0x1)
        if ctrl:
            self.zoom(1.25 if step < 0 else 0.8)
        elif shift:
            self._scroll_view(step * 60 / self.pps)
        else:
            self.track_canvas.yview_scroll(step, "units")
        return "break"

    def _fit_copy(self, event: tk.Event) -> None:
        if event.widget is not self.root:
            return
        width = max(240, int(event.width) - 40)
        for label in (getattr(self, "status_label", None),):
            if label is not None:
                label.configure(wraplength=width)

    def _update_blocks(self) -> bool:
        gate = getattr(self, "update_gate", None)
        if gate is None:
            return False
        try:
            return bool(gate.winfo_manager())
        except tk.TclError:
            return False

    def show_gate(self) -> None:
        if self._update_blocks():
            return
        self.studio.pack_forget()
        self.modes.pack_forget()
        self.gate.pack(fill="both", expand=True)
        scale = dpi_scale()
        width = int(760 * scale)
        height = int(720 * scale)
        self.root.minsize(int(640 * scale), int(600 * scale))
        if self._borderless:
            self._place_window(width, height)
        else:
            self.root.geometry(f"{width}x{height}")

    def show_studio(self) -> None:
        if self._update_blocks():
            return
        self.gate.pack_forget()
        self.modes.pack_forget()
        self.studio.pack(fill="both", expand=True)
        scale = dpi_scale()
        self.root.minsize(int(760 * scale), int(560 * scale))
        self.root.update_idletasks()
        width = min(self.root.winfo_screenwidth() - 20, int(1320 * scale))
        height = min(self.root.winfo_screenheight() - 60, int(860 * scale))
        if self._borderless:
            self._place_window(width, height)
        else:
            self.root.geometry(f"{width}x{height}")
        email = self.email.get().strip()
        self.account_line.set(f"Konto: {email}" if email else "Konto")
        if self._pending is not None:
            self.status.set(
                f"Poprzednia wysyłka nie skończyła się ({self._pending.summary()}). "
                "Naciśnij Gotowe i Wrzuć do Studia, żeby ją dokończyć."
            )
        self.root.after(50, self._paint_all)
        self.root.after(300, self._warm_listen)

    def show_modes(self) -> None:
        if self._update_blocks():
            return
        self.gate.pack_forget()
        self.studio.pack_forget()
        self.modes.pack(fill="both", expand=True)
        scale = dpi_scale()
        width = int(1080 * scale)
        height = min(self.root.winfo_screenheight() - 40, int(760 * scale))
        self.root.minsize(int(920 * scale), int(620 * scale))
        if self._borderless:
            self._place_window(width, height)
        else:
            self.root.geometry(f"{width}x{height}")
        email = self.email.get().strip()
        self.mode_account.set(email or "Konto")
        if self.tier == "GOLD":
            self.offline_enter.configure(text="WEJDŹ", bg=AMBER, fg=ON_AMBER)
        else:
            self.offline_enter.configure(text="TO JEST PREMIUM GOLD", bg=RACK, fg=SOFT)
        self.modes_canvas.update_idletasks()
        self.modes_canvas.configure(scrollregion=self.modes_canvas.bbox("all"))

    def _on_close(self, ask_save: bool = True) -> None:
        if self._uploading and not messagebox.askyesno(
            "BitRymDym",
            "Wysyłka na konto jeszcze trwa. Jeśli zamkniesz program teraz, projekt na koncie może zostać niepełny. Zamknąć mimo to?",
        ):
            return
        if self._exporting and not messagebox.askyesno(
            "BitRymDym",
            "Zapis jeszcze trwa. Zamknąć mimo to?",
        ):
            return
        if ask_save and self.studio_mode == "offline" and self.tier == "GOLD" and self._project_worth_saving():
            choice = messagebox.askyesnocancel(
                "BitRymDym",
                "Zapisać projekt (.brd1) przed zamknięciem?\n\n"
                "W pliku są nagrane ścieżki. Bitu nie ma. "
                "Program nie sprawdza, czy bit jest Twój — potwierdzenie jest przy zapisie.",
            )
            if choice is None:
                return
            if choice and not self.save_project():
                return
        self._arm_token += 1
        self._play_token += 1
        self._cancel_tick()
        self._stop_probe()
        self._stop_monitor()
        if self.capture:
            stop_capture(self.capture)
            self.capture = None
            if self.recording:
                self._keep_take()
        self.recording = False
        if self._touched:
            self._save_desk()
        box = getattr(self, "remember_login", None)
        if box is not None and box.get() != 1:
            forget_tokens(remember="0")
        self.root.destroy()

    # ---- layout ---------------------------------------------------------------

    def _tool(self, parent: tk.Widget, text: str, command: object, fg: str = INK, bg: str = RACK, size: int = 12) -> tk.Button:
        button = tk.Button(
            parent,
            text=text,
            command=command,
            bg=bg,
            fg=fg,
            activebackground=PANEL if bg == RACK else AMBER_SOFT,
            activeforeground=fg,
            disabledforeground=MUTE,
            relief="flat",
            bd=0,
            padx=8,
            pady=3,
            font=(FONT_POSTER, size, "bold"),
            cursor="hand2",
            highlightthickness=1,
            highlightbackground=LINE_STRONG,
            takefocus=0,
        )
        return button

    def _build_studio(self) -> None:
        self.studio = tk.Frame(self.shell, bg=PAPER)
        top = tk.Frame(self.studio, bg=PAPER)
        top.pack(fill="x", padx=12, pady=(8, 0))
        tk.Label(top, text="BitRymDym", bg=PAPER, fg=INK, font=(FONT_DISPLAY, 20, "italic")).pack(side="left")
        tk.Label(top, textvariable=self.studio_kicker, bg=PAPER, fg=AMBER, font=(FONT_META, 9)).pack(side="left", padx=(10, 0), pady=(8, 0))
        self._tool(top, "WYLOGUJ", self.sign_out, SOFT).pack(side="right")
        self._tool(top, "NOWY PROJEKT", self.new_project, SOFT).pack(side="right", padx=(0, 6))
        self._tool(top, "ZMIEŃ STUDIO", self.back_to_modes, SOFT).pack(side="right", padx=(0, 6))
        self.save_project_button = self._tool(top, "ZAPISZ PROJEKT", self.save_project, SOFT)
        self.load_session_button = self._tool(top, "WCZYTAJ SESJĘ", self.load_offline_pack, SOFT)
        tk.Label(top, textvariable=self.account_line, bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(side="right", padx=10)
        rule = tk.Frame(self.studio, bg=AMBER, height=2)
        rule.pack_propagate(False)
        rule.pack(fill="x", padx=12, pady=(4, 6))

        setup = tk.Frame(self.studio, bg=PAPER)
        setup.pack(fill="x", padx=12)
        tk.Label(setup, text="BIT", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(side="left")
        self.beat_button = self._tool(setup, "Wybierz bit z katalogu ▾", self.pick_beat, INK)
        self.beat_button.configure(font=(FONT_UI, 10), anchor="w", width=34)
        self.beat_button.pack(side="left", padx=(6, 14))

        gear = tk.Frame(self.studio, bg=PAPER)
        gear.pack(fill="x", padx=12, pady=(6, 0))
        tk.Label(gear, text="MIKROFON", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(side="left")
        self.device_menu = tk.OptionMenu(gear, self.device_var, "Szukam mikrofonów…")
        self._style_option(self.device_menu, 24)
        self.device_menu.pack(side="left", padx=(6, 8))
        self.probe_button = self._tool(gear, "TEST MIKROFONU", self.toggle_mic_test, INK)
        self.probe_button.pack(side="left")
        self.probe_meter = tk.Canvas(gear, width=90, height=12, bg=RACK, highlightthickness=0, bd=0)
        self.probe_meter.pack(side="left", padx=(8, 8))
        tk.Label(gear, text="ODSŁUCH", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(side="left")
        self.output_menu = tk.OptionMenu(gear, self.output_var, "Domyślne")
        self._style_option(self.output_menu, 18)
        self.output_menu.pack(side="left", padx=(6, 8))
        self.output_test_button = self._tool(gear, "TEST ODSŁUCHU", self.test_output, INK)
        self.output_test_button.pack(side="left")
        self._tool(gear, "ODŚWIEŻ", self.refresh_gear, SOFT, size=11).pack(side="left", padx=(8, 0))
        self.probe_var = tk.StringVar(value="Mikrofon i słuchawki mogą być z różnych urządzeń, też Bluetooth.")
        self.probe_label = tk.Label(
            self.studio, textvariable=self.probe_var, bg=PAPER, fg=SOFT, font=(FONT_UI, 9), anchor="w", justify="left"
        )
        self.probe_label.pack(fill="x", padx=12, pady=(4, 0))

        bar = tk.Frame(self.studio, bg=PANEL, highlightthickness=1, highlightbackground=LINE)
        bar.pack(fill="x", padx=12, pady=(8, 0))
        self._tool(bar, "|◀", lambda: self._set_cursor(0.0), INK, size=13).pack(side="left", padx=(6, 2), pady=5)
        self.play_button = self._tool(bar, "▶ GRAJ", self.play, ON_AMBER, AMBER, 13)
        self.play_button.pack(side="left", padx=2, pady=5)
        self._tool(bar, "■ STOP", self.stop, INK, size=13).pack(side="left", padx=2, pady=5)
        self.rec_button = self._tool(bar, "● NAGRAJ", self.record, INK, REC, 13)
        self.rec_button.pack(side="left", padx=2, pady=5)
        clock = tk.Label(bar, textvariable=self.clock, bg="#0b0907", fg=AMBER, font=(FONT_META, 15), padx=10, width=21, anchor="w")
        clock.pack(side="left", padx=(10, 4), pady=5)
        self.lamp = tk.Canvas(bar, width=12, height=12, bg=PANEL, highlightthickness=0)
        self.lamp.pack(side="left", padx=(4, 10))
        tk.Frame(bar, bg=LINE_STRONG, width=1).pack(side="left", fill="y", padx=4, pady=6)
        for text, mode in (("COFNIJ", "undo"), ("PODZIEL", "split"), ("WYTNIJ", "cut"), ("KOPIUJ", "copy"), ("WKLEJ", "paste"), ("USUŃ", "delete")):
            command = self.undo if mode == "undo" else (lambda picked=mode: self.edit(picked))
            self._tool(bar, text, command, REC if mode == "delete" else INK, size=11).pack(side="left", padx=2, pady=5)
        self._tool(bar, "1 s", self.zoom_second, ON_AMBER, AMBER, 11).pack(side="right", padx=(2, 6), pady=5)
        self._tool(bar, "+", lambda: self.zoom(1.25), INK, size=13).pack(side="right", padx=2, pady=5)
        self._tool(bar, "−", lambda: self.zoom(0.8), INK, size=13).pack(side="right", padx=2, pady=5)
        self._tool(bar, "CAŁOŚĆ", self.zoom_fit, INK, size=11).pack(side="right", padx=2, pady=5)
        tk.Label(bar, text="ZOOM", bg=PANEL, fg=MUTE, font=(FONT_META, 8)).pack(side="right", padx=(8, 2))

        outer = tk.Frame(self.studio, bg=PAPER)
        outer.pack(fill="both", expand=True, padx=12, pady=(6, 0))
        lanes = tk.Frame(outer, bg=PAPER)
        vscroll_host = tk.Frame(outer, bg=PAPER)
        vscroll_host.pack(side="right", fill="y")
        lanes.pack(side="left", fill="both", expand=True)
        ruler_row = tk.Frame(lanes, bg=PAPER)
        ruler_row.pack(fill="x")
        spacer = tk.Frame(ruler_row, bg=PAPER, width=self.head_w + 1, height=1)
        spacer.pack(side="left", fill="y")
        spacer.pack_propagate(False)
        tk.Label(spacer, text="ŚCIEŻKI", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(side="left", padx=4)
        self.ruler = tk.Canvas(ruler_row, height=int(24 * self.ui), bg="#0b0907", highlightthickness=0, bd=0, cursor="hand2")
        self.ruler.pack(side="left", fill="x", expand=True)
        self.ruler.bind("<Button-1>", lambda event: self._ruler_click(event))
        self.ruler.bind("<B1-Motion>", lambda event: self._ruler_click(event))
        body = tk.Frame(lanes, bg=PAPER)
        body.pack(fill="both", expand=True)
        self.track_canvas = tk.Canvas(body, bg=PAPER, highlightthickness=0, bd=0, yscrollincrement=int(24 * self.ui))
        vscroll = ttk.Scrollbar(vscroll_host, command=self.track_canvas.yview, style="Brd.Vertical.TScrollbar")
        self.track_canvas.configure(yscrollcommand=vscroll.set)
        vscroll.pack(fill="y", expand=True, pady=(int(24 * self.ui), 16))
        self.track_canvas.pack(side="left", fill="both", expand=True)
        self.row_host = tk.Frame(self.track_canvas, bg=PAPER)
        self._row_window = self.track_canvas.create_window((0, 0), window=self.row_host, anchor="nw")
        self.row_host.bind("<Configure>", lambda _e: self.track_canvas.configure(scrollregion=self.track_canvas.bbox("all")))
        self.track_canvas.bind("<Configure>", self._fit_rows)
        self.hscroll = ttk.Scrollbar(lanes, orient="horizontal", command=self._hscroll, style="Brd.Horizontal.TScrollbar")
        self.hscroll.pack(fill="x", padx=(self.head_w + 1, 0))
        self._build_beat_row()
        self.vocal_host = tk.Frame(self.row_host, bg=PAPER)
        self.vocal_host.pack(fill="x")

        foot = tk.Frame(self.studio, bg=PAPER)
        foot.pack(fill="x", padx=12, pady=(8, 0))
        self.add_button = self._tool(foot, "+ DODAJ ŚCIEŻKĘ", self.add_track, INK, size=12)
        self.add_button.pack(side="left")
        tk.Label(foot, textvariable=self.plan_text, bg=PAPER, fg=SOFT, font=(FONT_UI, 9)).pack(side="left", padx=12)
        self.done_button = self._tool(foot, "GOTOWE  ✓", self.open_done, ON_AMBER, AMBER, 15)
        self.done_button.configure(padx=22, pady=6)
        self.done_button.pack(side="right")
        self.status_label = tk.Label(
            self.studio, textvariable=self.status, wraplength=900, justify="left", anchor="w", bg=PAPER, fg=INK, font=(FONT_UI, 10)
        )
        self.status_label.pack(fill="x", padx=12, pady=(8, 2))
        self.foot_label = tk.Label(
            self.studio,
            text=(
                "Klik: kursor. Przeciągnij: zaznaczenie, potem Wytnij, Usuń albo Podziel. Pasek klipu: przesuń. "
                "1 s mocno przybliża, Ctrl+kółko też. Spacja: graj/stop, R: nagraj. "
                "M na bicie wycisza od razu. Panorama: L, C, R."
            ),
            bg=PAPER, fg=MUTE, font=(FONT_UI, 8), anchor="w", justify="left",
        )
        self.foot_label.pack(fill="x", padx=12, pady=(0, 8))
        self.root.bind("<Configure>", self._fit_copy)
        self._paint_lamp()
        self._sync_beat_button()

    def _style_scroll(self) -> None:
        style = ttk.Style(self.root)
        style.theme_use("clam")
        for name in ("Brd.Vertical.TScrollbar", "Brd.Horizontal.TScrollbar"):
            style.configure(
                name, background=LINE_STRONG, troughcolor=PAPER, bordercolor=PAPER, arrowcolor=SOFT,
                darkcolor=PAPER, lightcolor=PAPER, gripcount=0, relief="flat", arrowsize=12,
            )
            style.map(name, background=[("active", AMBER_DEEP), ("pressed", AMBER)])

    def _fit_rows(self, event: tk.Event) -> None:
        self.track_canvas.itemconfigure(self._row_window, width=event.width)
        self.root.after_idle(self._paint_all)

    def _row_frame(self, parent: tk.Widget) -> tuple[tk.Frame, tk.Frame, tk.Canvas]:
        row = tk.Frame(parent, bg=LINE, highlightthickness=0)
        row.pack(fill="x", pady=(0, 3))
        head = tk.Frame(
            row, bg=PANEL, width=self.head_w, height=self.lane_h, highlightthickness=2, highlightbackground=PANEL, highlightcolor=PANEL
        )
        head.pack(side="left", fill="y")
        head.pack_propagate(False)
        lane = tk.Canvas(row, height=self.lane_h, bg=LANE_BG, highlightthickness=0, bd=0, cursor="xterm")
        lane.pack(side="left", fill="x", expand=True, padx=(1, 0))
        return row, head, lane

    def _gain_scale(self, parent: tk.Widget, value: float, command: Callable[[float], None]) -> tk.Scale:
        scale = tk.Scale(
            parent, from_=-24, to=12, resolution=1, orient="horizontal", showvalue=False, length=int(110 * self.ui),
            bg=PANEL, fg=INK, troughcolor=RACK, highlightthickness=0, sliderlength=int(14 * self.ui), width=int(9 * self.ui),
            bd=0, activebackground=AMBER, command=lambda raw: command(float(raw)),
        )
        scale.set(value)
        return scale

    def _pan_scale(self, parent: tk.Widget, pan: float, command: Callable[[float], None]) -> tk.Scale:
        """Slider is -100..100 so the thumb lands on whole steps. Stored pan is -1..1."""
        scale = tk.Scale(
            parent, from_=-100, to=100, resolution=1, orient="horizontal", showvalue=False, length=int(110 * self.ui),
            bg=PANEL, fg=INK, troughcolor=RACK, highlightthickness=0, sliderlength=int(14 * self.ui), width=int(9 * self.ui),
            bd=0, activebackground=AMBER, command=lambda raw: command(float(raw)),
        )
        scale.set(max(-100.0, min(100.0, pan * 100)))
        return scale

    def _build_beat_row(self) -> None:
        row, head, lane = self._row_frame(self.row_host)
        top = tk.Frame(head, bg=PANEL)
        top.pack(fill="x", padx=8, pady=(6, 0))
        tk.Label(top, text="BIT", bg=PANEL, fg=AMBER, font=(FONT_POSTER, 14, "bold")).pack(side="left")
        self.beat_mute = self._tool(top, "M", self.toggle_beat_mute, SOFT, size=11)
        self.beat_mute.pack(side="right")
        self.beat_name = tk.Label(head, text="—", bg=PANEL, fg=INK, font=(FONT_UI, 9), anchor="w")
        self.beat_name.pack(fill="x", padx=8)
        gain = tk.Frame(head, bg=PANEL)
        gain.pack(fill="x", padx=8, pady=(4, 0))
        tk.Label(gain, text="dB", bg=PANEL, fg=MUTE, font=(FONT_META, 8)).pack(side="left")
        self.beat_gain_label = tk.Label(gain, text="+0", bg=PANEL, fg=SOFT, font=(FONT_META, 8), width=4)
        self.beat_gain_scale = self._gain_scale(gain, self.beat_gain_db, self._set_beat_gain)
        self.beat_gain_scale.pack(side="left", padx=4)
        self.beat_gain_label.pack(side="left")
        balance = tk.Frame(head, bg=PANEL)
        balance.pack(fill="x", padx=8, pady=(2, 0))
        tk.Label(balance, text="PAN", bg=PANEL, fg=MUTE, font=(FONT_META, 8)).pack(side="left")
        self.beat_pan_label = tk.Label(
            balance, text=offline_session.pan_text(self.beat_pan), bg=PANEL, fg=SOFT, font=(FONT_META, 8), width=6, anchor="w"
        )
        self.beat_pan_scale = self._pan_scale(balance, self.beat_pan, self._set_beat_pan)
        self.beat_pan_scale.pack(side="left", padx=4)
        self.beat_pan_label.pack(side="left")
        self.beat_lane = lane
        lane.bind("<Button-1>", lambda event: self._lane_click_plain(event))
        lane.bind("<B1-Motion>", lambda event: self._lane_click_plain(event))

    def _build_vocal_row(self, index: int) -> None:
        track = self.tracks[index]
        row, head, lane = self._row_frame(self.vocal_host)
        top = tk.Frame(head, bg=PANEL)
        top.pack(fill="x", padx=8, pady=(5, 0))
        name = tk.Label(top, text=track.name, bg=PANEL, fg=INK, font=(FONT_POSTER, 13, "bold"), anchor="w", cursor="hand2")
        name.pack(side="left", fill="x", expand=True)
        self._tool(top, "✕", lambda slot=track: self.remove_track(slot), REC, size=10).pack(side="right")
        buttons = tk.Frame(head, bg=PANEL)
        buttons.pack(fill="x", padx=8, pady=(4, 0))
        rec = tk.Button(
            buttons, text="●", command=lambda slot=track: self.arm_track(slot), bg=RACK, fg=MUTE, activebackground=PANEL,
            activeforeground=REC, relief="flat", bd=0, padx=8, pady=0, font=(FONT_UI, 13), cursor="hand2",
            highlightthickness=1, highlightbackground=LINE_STRONG, takefocus=0,
        )
        rec.pack(side="left", padx=(0, 4))
        mute = self._tool(buttons, "M", lambda slot=track: self.toggle_mute(slot), SOFT, size=11)
        mute.pack(side="left", padx=(0, 4))
        solo = self._tool(buttons, "S", lambda slot=track: self.toggle_solo(slot), SOFT, size=11)
        solo.pack(side="left")
        swatch = tk.Frame(buttons, bg=track.color, width=int(10 * self.ui), height=int(10 * self.ui))
        swatch.pack(side="right", pady=4)
        gain = tk.Frame(head, bg=PANEL)
        gain.pack(fill="x", padx=8, pady=(4, 0))
        tk.Label(gain, text="dB", bg=PANEL, fg=MUTE, font=(FONT_META, 8)).pack(side="left")
        gain_label = tk.Label(gain, text=f"{track.gain_db:+.0f}", bg=PANEL, fg=SOFT, font=(FONT_META, 8), width=3)
        self._gain_scale(gain, track.gain_db, lambda value, slot=track: self._set_gain(slot, value)).pack(side="left", padx=4)
        gain_label.pack(side="left")
        balance = tk.Frame(head, bg=PANEL)
        balance.pack(fill="x", padx=8, pady=(2, 0))
        tk.Label(balance, text="PAN", bg=PANEL, fg=MUTE, font=(FONT_META, 8)).pack(side="left")
        pan_label = tk.Label(balance, text=offline_session.pan_text(track.pan), bg=PANEL, fg=SOFT, font=(FONT_META, 8), width=6, anchor="w")
        self._pan_scale(balance, track.pan, lambda value, slot=track: self._set_pan(slot, value)).pack(side="left", padx=4)
        pan_label.pack(side="left")
        widgets: dict[str, object] = {
            "row": row, "head": head, "lane": lane, "name": name, "rec": rec, "mute": mute, "solo": solo, "gain": gain_label, "pan": pan_label,
        }
        self.rows.append(widgets)
        name.bind("<Double-Button-1>", lambda _e, slot=track: self.rename_track(slot))
        name.bind("<Button-1>", lambda _e, slot=track: self._focus_track(slot))
        head.bind("<Button-1>", lambda _e, slot=track: self._focus_track(slot))
        lane.bind("<ButtonPress-1>", lambda event, slot=track: self._lane_down(slot, event))
        lane.bind("<B1-Motion>", lambda event: self._lane_drag(event))
        lane.bind("<ButtonRelease-1>", lambda event: self._lane_up(event))
        lane.bind("<Double-Button-1>", lambda event, slot=track: self._lane_double(slot, event))

    def _rebuild_rows(self) -> None:
        for widgets in self.rows:
            row = widgets.get("row")
            if isinstance(row, tk.Frame):
                row.destroy()
        self.rows = []
        for index in range(len(self.tracks)):
            self._build_vocal_row(index)
        self.armed = max(0, min(self.armed, len(self.tracks) - 1))
        self.focus = max(0, min(self.focus, len(self.tracks) - 1))
        self._sync_track_buttons()
        self._sync_add_button()
        self.root.after_idle(self._paint_all)

    def _sync_track_buttons(self) -> None:
        any_solo = any(track.solo for track in self.tracks)
        for index, (track, widgets) in enumerate(zip(self.tracks, self.rows)):
            rec, mute, solo, name, head = widgets["rec"], widgets["mute"], widgets["solo"], widgets["name"], widgets["head"]
            armed = index == self.armed
            if isinstance(rec, tk.Button):
                rec.configure(fg=REC if armed else MUTE, bg="#3a1410" if armed else RACK)
            if isinstance(mute, tk.Button):
                mute.configure(bg=AMBER if track.muted else RACK, fg=ON_AMBER if track.muted else SOFT)
            if isinstance(solo, tk.Button):
                solo.configure(bg="#3ddc97" if track.solo else RACK, fg=ON_AMBER if track.solo else SOFT)
            heard = self._heard(track, any_solo)
            if isinstance(name, tk.Label):
                name.configure(text=track.name, fg=INK if heard else MUTE)
            if isinstance(head, tk.Frame):
                edge = AMBER if index == self.focus else PANEL
                head.configure(highlightbackground=edge, highlightcolor=edge)
        self.beat_mute.configure(bg=AMBER if self.beat_muted else RACK, fg=ON_AMBER if self.beat_muted else SOFT)

    def _sync_add_button(self) -> None:
        if self.studio_mode == "offline":
            vocals = sum(1 for track in self.tracks if track.role != "podbicie")
            extras = sum(1 for track in self.tracks if track.role == "podbicie")
            if vocals < offline_session.OFFLINE_VOCALS:
                text = f"+ WOKAL {vocals}/{offline_session.OFFLINE_VOCALS}"
            elif extras < offline_session.OFFLINE_EXTRAS:
                text = f"+ PODBICIE {extras}/{offline_session.OFFLINE_EXTRAS}"
            else:
                text = "LIMIT 16 WOKALI + 6 PODBIĆ"
        else:
            cap = self._track_cap()
            have = len(self.tracks)
            text = f"LIMIT ŚCIEŻEK {have}/{cap}" if have >= cap else f"+ DODAJ ŚCIEŻKĘ {have}/{cap}"
        self.add_button.configure(text=text)

    def _paint_lamp(self) -> None:
        self.lamp.delete("all")
        color = REC if self.recording else "#3ddc97" if self.playing else LINE_STRONG
        self.lamp.create_oval(1, 1, 11, 11, fill=color, outline=color)

    # ---- tracks -----------------------------------------------------------

    def _new_track(self) -> Track:
        if self.studio_mode == "offline":
            vocals = sum(1 for track in self.tracks if track.role != "podbicie")
            extras = sum(1 for track in self.tracks if track.role == "podbicie")
            if vocals >= offline_session.OFFLINE_VOCALS:
                return Track(
                    name=f"Podbicie {extras + 1}",
                    color=TRACK_COLORS[(offline_session.OFFLINE_VOCALS + extras) % len(TRACK_COLORS)],
                    role="podbicie",
                )
            return Track(name=f"Wokal {vocals + 1}", color=TRACK_COLORS[vocals % len(TRACK_COLORS)], role="wokal")
        index = len(self.tracks)
        return Track(name=f"Wokal {index + 1}", color=TRACK_COLORS[index % len(TRACK_COLORS)])

    def _heard(self, track: Track, any_solo: bool | None = None) -> bool:
        if any_solo is None:
            any_solo = any(item.solo for item in self.tracks)
        if track.muted:
            return False
        return track.solo or not any_solo

    def _busy(self, what: str = "") -> bool:
        if self.recording or self._arming:
            self.status.set("Najpierw Stop." + (f" {what}" if what else ""))
            return True
        return False

    def add_track(self) -> None:
        if self._busy():
            return
        cap = self._track_cap()
        if len(self.tracks) >= cap:
            if self.studio_mode == "offline":
                self.status.set("Studio Offline mieści 16 wokali i 6 podbić albo adlibów. Bit się nie liczy.")
            else:
                self.status.set(f"Plan {display_tier(self.tier)} mieści {cap} ścieżek nagrania. Bit się nie liczy.")
            return
        self._push_undo()
        self.tracks.append(self._new_track())
        self.armed = len(self.tracks) - 1
        self.focus = self.armed
        self._rebuild_rows()
        self._save_desk()
        self.status.set(f"{self.tracks[self.armed].name} dodana i uzbrojona (●). Plan mieści {cap}.")

    def remove_track(self, track: Track) -> None:
        if self._busy() or track not in self.tracks:
            return
        if len(self.tracks) == 1 and not track.clips:
            self.status.set("Jedna ścieżka zostaje zawsze.")
            return
        if track.clips and not messagebox.askyesno("BitRymDym", f"Usunąć ścieżkę {track.name} z nagraniem? Cofnij ją przywróci."):
            return
        self._push_undo()
        index = self.tracks.index(track)
        self.tracks.pop(index)
        if not self.tracks:
            self.tracks.append(self._new_track())
        if self.sel and self.sel[0] == index:
            self.sel = None
        self._rebuild_rows()
        self._save_desk()
        self.status.set("Ścieżka usunięta. Cofnij (Ctrl+Z) ją przywraca.")

    def rename_track(self, track: Track) -> None:
        text = simpledialog.askstring("Nazwa ścieżki", "Nazwa:", initialvalue=track.name, parent=self.root)
        if text and text.strip():
            track.name = text.strip()[:40]
            self._sync_track_buttons()
            self._paint_all()
            self._save_desk()

    def arm_track(self, track: Track) -> None:
        if track not in self.tracks:
            return
        if self.recording:
            self.status.set("Najpierw Stop. Nagranie idzie na uzbrojoną ścieżkę.")
            return
        self.armed = self.tracks.index(track)
        self.focus = self.armed
        self._sync_track_buttons()
        self.status.set(f"Nagranie pójdzie na: {track.name}. Pozostałe ścieżki słychać w trakcie, jeśli nie mają M.")

    def _focus_track(self, track: Track) -> None:
        if track in self.tracks:
            self.focus = self.tracks.index(track)
            self._sync_track_buttons()

    def toggle_mute(self, track: Track) -> None:
        track.muted = not track.muted
        self._sync_track_buttons()
        self._paint_all()
        self._save_desk()
        self._schedule_remix(40)

    def toggle_solo(self, track: Track) -> None:
        track.solo = not track.solo
        self._sync_track_buttons()
        self._paint_all()
        self._save_desk()
        self._schedule_remix(40)

    def toggle_beat_mute(self) -> None:
        self.beat_muted = not self.beat_muted
        self._sync_track_buttons()
        self._paint_all()
        self._save_desk()
        self.status.set("Bit wyciszony: nie gra przy nagrywaniu i odsłuchu." if self.beat_muted else "Bit gra.")
        self._schedule_remix(40)

    def _set_gain(self, track: Track, value: float) -> None:
        if abs(track.gain_db - value) > 1e-9:
            self._touched = True
        track.gain_db = value
        if track in self.tracks:
            label = self.rows[self.tracks.index(track)].get("gain")
            if isinstance(label, tk.Label):
                label.configure(text=f"{value:+.0f}")
        self._schedule_remix()

    def _set_pan(self, track: Track, slider: float) -> None:
        value = offline_session.clamp_pan(slider / 100.0)
        if abs(track.pan - value) > 1e-9:
            self._touched = True
        track.pan = value
        if track in self.tracks:
            label = self.rows[self.tracks.index(track)].get("pan")
            if isinstance(label, tk.Label):
                label.configure(text=offline_session.pan_text(value))
        self._schedule_remix()

    def _set_beat_gain(self, value: float) -> None:
        if abs(self.beat_gain_db - value) > 1e-9:
            self._touched = True
        self.beat_gain_db = value
        self.beat_gain_label.configure(text=f"{value:+.0f}")
        self._schedule_remix()

    def _set_beat_pan(self, slider: float) -> None:
        value = offline_session.clamp_pan(slider / 100.0)
        if abs(self.beat_pan - value) > 1e-9:
            self._touched = True
        self.beat_pan = value
        if hasattr(self, "beat_pan_label"):
            self.beat_pan_label.configure(text=offline_session.pan_text(value))
        self._schedule_remix()

    # ---- beat catalog ---------------------------------------------------------

    def _beat_changed(self) -> None:
        self._listen_cache = None
        self._sync_beat_button()
        self._paint_all()
        self._warm_listen()

    def _warm_listen(self) -> None:
        """Fetch the beat listen address ahead, so NAGRAJ and GRAJ start without the network wait."""
        if self.studio_mode == "offline" or not self.studio.winfo_manager() or self.beat_muted:
            return
        beat_id = self._beat_id_or_empty()
        if beat_id:
            threading.Thread(target=self._beat_listen, args=(beat_id,), daemon=True).start()

    def _beat_meta(self) -> tuple[str, int, float]:
        if self.studio_mode == "offline":
            name = offline_session.file_title(self.local_beat_path) if self.local_beat_path else ""
            return (name, 0, self.local_beat_seconds)
        try:
            beat_id = self.selected_beat_id()
        except RuntimeError:
            return ("", 0, 0.0)
        return self.beat_info.get(beat_id, (self.beat_var.get(), 0, 0.0))

    def _sync_beat_button(self) -> None:
        title, bpm, seconds = self._beat_meta()
        if not title:
            empty = "Własny bit z pliku ▾" if self.studio_mode == "offline" else "Wybierz bit z katalogu ▾"
            self.beat_button.configure(text=empty)
            self.beat_name.configure(text=empty[:-2] if empty.endswith(" ▾") else empty)
            return
        short = title if len(title) <= 34 else title[:33] + "…"
        self.beat_button.configure(text=f"{short} ▾")
        parts = [f"{bpm} BPM" if bpm else "", f"{int(seconds // 60)}:{int(seconds % 60):02d}" if seconds else ""]
        self.beat_name.configure(text="  ".join(part for part in [short, *parts] if part))

    def pick_beat(self) -> None:
        if self._busy():
            return
        if self.studio_mode == "offline":
            self._pick_local_beat()
            return
        box = tk.Toplevel(self.root)
        box.title("Katalog bitów")
        box.configure(bg=PANEL)
        box.transient(self.root)
        tk.Label(box, text="Katalog bitów BitRymDym", bg=PANEL, fg=INK, font=(FONT_DISPLAY, 15, "italic")).pack(anchor="w", padx=12, pady=(10, 4))
        query = tk.StringVar()
        search = tk.Entry(box, textvariable=query, bg=RACK, fg=INK, insertbackground=AMBER, relief="flat", font=(FONT_UI, 11))
        search.pack(fill="x", padx=12, ipady=4)
        listing = tk.Listbox(
            box, height=14, width=46, bg=RACK, fg=INK, selectbackground=AMBER, selectforeground=ON_AMBER,
            highlightthickness=0, relief="flat", font=(FONT_UI, 11), activestyle="none", exportselection=False,
        )
        listing.pack(fill="both", expand=True, padx=12, pady=8)
        shown: list[str] = []

        def fill(*_args: object) -> None:
            needle = query.get().strip().lower()
            shown[:] = [label for _id, label in self.beats if needle in label.lower()]
            listing.delete(0, "end")
            for label in shown:
                listing.insert("end", label)
            if self.beat_var.get() in shown:
                listing.selection_set(shown.index(self.beat_var.get()))

        def choose(_event: object = None) -> None:
            picked = listing.curselection()
            if not picked:
                return
            self.beat_var.set(shown[int(picked[0])])
            self._save_prefs()
            box.destroy()
            self.status.set("Bit jest na ścieżce BIT. Program go nie zapisuje, tylko odtwarza ze strony.")

        query.trace_add("write", fill)
        listing.bind("<Double-Button-1>", choose)
        listing.bind("<Return>", choose)
        row = tk.Frame(box, bg=PANEL)
        row.pack(fill="x", padx=12, pady=(0, 12))
        self._tool(row, "WYBIERZ", choose, ON_AMBER, AMBER).pack(side="right")
        self._tool(row, "ODŚWIEŻ LISTĘ", lambda: (self.reload_beats(), fill()), INK).pack(side="left")
        fill()
        search.focus_set()

    def _pick_local_beat(self) -> None:
        path = filedialog.askopenfilename(
            title="Własny bit",
            filetypes=[
                ("Audio", "*.wav *.mp3 *.flac *.m4a *.aac *.ogg *.aiff *.aif"),
                ("Wszystkie pliki", "*.*"),
            ],
        )
        if not path:
            return
        self.local_beat_path = path
        self.local_beat_seconds = 0.0
        self._beat_peaks = []
        self._beat_peak_path = ""
        self.beat_var.set(offline_session.file_title(path))
        self._save_desk()
        self._sync_beat_button()
        self._paint_all()
        self.status.set("Bit z pliku zostaje na tym komputerze. Program nie sprawdza licencji i nie wysyła go na stronę.")
        threading.Thread(target=self._probe_local_beat, args=(path,), daemon=True).start()

    def _probe_local_beat(self, path: str) -> None:
        seconds = 0.0
        peaks: list[float] = []
        try:
            seconds = offline_session.probe_media_seconds(ffmpeg_exe(), Path(path))
        except Exception:
            seconds = 0.0
        try:
            peaks = self._decode_display_peaks(path)
        except Exception:
            peaks = []

        def apply() -> None:
            if self.local_beat_path != path:
                return
            self.local_beat_seconds = seconds
            self._beat_peaks = peaks
            self._beat_peak_path = path
            self._save_desk()
            self._sync_beat_button()
            self._paint_all()
            if seconds > 0:
                self.status.set(f"Bit z pliku: {offline_session.clock_text(seconds)}. Zostaje u Ciebie, nie jedzie na stronę.")

        self.root.after(0, apply)

    def _decode_display_peaks(self, path: str) -> list[float]:
        """10 ms peaks for the lane. The beat file is not copied into the project."""
        ffmpeg = ffmpeg_exe()
        proc = subprocess.run(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", path, "-ac", "1", "-ar", "4800", "-f", "s16le", "pipe:1"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            **quiet_kwargs(),
        )
        raw = proc.stdout or b""
        raw = raw[: len(raw) // 2 * 2]
        if len(raw) < 4:
            return []
        samples = array.array("h")
        samples.frombytes(raw)
        if sys.byteorder != "little":
            samples.byteswap()
        return block_peaks(samples, 48)

    def _load_public(self) -> None:
        try:
            payload = load_bootstrap()
        except Exception as error:
            self.status.set(str(error))
            self.gate_status.set(str(error))
            return
        self._apply_public(payload)

    def _apply_public(self, payload: dict[str, object]) -> None:
        try:
            self.public_url = str(payload["supabaseUrl"])
            self.public_key = str(payload["anonKey"])
            raw = payload.get("beats")
            self.beats = []
            self.beat_info = {}
            if isinstance(raw, list):
                for beat in raw:
                    if not (isinstance(beat, dict) and beat.get("id") and beat.get("title")):
                        continue
                    bpm = beat.get("bpm")
                    seconds = beat.get("durationSeconds")
                    label = str(beat["title"])
                    if isinstance(bpm, int) and bpm > 0:
                        label = f"{label} ({bpm} BPM)"
                    self.beats.append((str(beat["id"]), label))
                    self.beat_info[str(beat["id"])] = (
                        str(beat["title"]),
                        bpm if isinstance(bpm, int) else 0,
                        float(seconds) if isinstance(seconds, (int, float)) and seconds > 0 else 0.0,
                    )
            if self.beats and not self.beat_var.get():
                self.beat_var.set(self.beats[0][1])
            if self.beats and not self.studio.winfo_manager():
                self.status.set("Wybierz bit, uzbrój ścieżkę (●) i nagraj.")
        except Exception as error:
            self.status.set(str(error))
            self.gate_status.set(str(error))

    def reload_beats(self) -> None:
        current = self.beat_var.get()
        self._load_public()
        labels = [label for _beat_id, label in self.beats]
        if current in labels:
            self.beat_var.set(current)
        self._sync_beat_button()
        self.status.set(f"Lista bitów: {len(self.beats)}.")

    def _beat_listen(self, beat_id: str) -> tuple[str | None, int | None, str]:
        """Site playback only. Nothing is saved. Network: call it off the Tk thread."""
        cached = self._listen_cache
        if cached is not None and cached[0] == beat_id and time.monotonic() < cached[1]:
            return cached[2]
        try:
            if not beat_id:
                raise RuntimeError("Najpierw wybierz bit.")
            payload = self._client().playback(beat_id)
            url, limit = playback_target(payload)
            valid = listen_valid_for(payload.get("expiresAt"))
            note = f"Podgląd strony: {limit} s. Program nie zapisuje bitu." if limit else "Bit gra ze strony. Program go nie zapisuje."
            heard: tuple[str | None, int | None, str] = (url, limit, note)
            self._listen_cache = (beat_id, time.monotonic() + valid, heard)
            return heard
        except Exception as error:
            return None, None, self._safe_listen_error(error)

    # ---- time and painting -------------------------------------------------------

    def _x(self, seconds: float) -> float:
        return (seconds - self.view) * self.pps

    def _t(self, x: float) -> float:
        return max(0.0, self.view + x / self.pps)

    def _length(self) -> float:
        _title, _bpm, beat_seconds = self._beat_meta()
        ends = [track_end(track.clips) for track in self.tracks]
        return max([beat_seconds, float(max_take_seconds(self.tier)), self.cursor, *ends]) + 10.0

    def _lane_width(self) -> int:
        return max(self.beat_lane.winfo_width(), 50)

    def zoom(self, factor: float) -> None:
        self._set_pps(self.pps * factor)

    def zoom_second(self) -> None:
        """One second becomes a wide block, wide enough to cut inside it."""
        width = max(1, self._lane_width())
        self._set_pps(min(960.0 * self.ui, max(180.0 * self.ui, width / 6.0)))
        self.status.set(
            "1 sekunda jest szeroka. Zaznacz przeciągnięciem, potem Wytnij, Usuń albo Podziel (Ctrl+I). "
            "Ctrl+kółko zmienia przybliżenie."
        )

    def zoom_fit(self) -> None:
        width = max(1, self._lane_width())
        length = max(1.0, self._length() - 8.0)
        self._set_pps(width / length)
        self.status.set("Widać całość. Przycisk 1 s przybliża do cięcia.")

    def _set_pps(self, pps: float) -> None:
        width = self._lane_width()
        anchor = self.cursor if 0 <= self._x(self.cursor) <= width else self.view + width / max(self.pps, 0.001) / 2
        offset = (anchor - self.view) * self.pps
        self.pps = max(2.0 * self.ui, min(960.0 * self.ui, pps))
        self.view = max(0.0, anchor - offset / max(self.pps, 0.001))
        self._paint_all()

    def _scroll_view(self, delta: float) -> None:
        span = self._lane_width() / self.pps
        self.view = max(0.0, min(self._length() - span * 0.5, self.view + delta))
        self._paint_all()

    def _hscroll(self, *args: str) -> None:
        total = self._length()
        span = self._lane_width() / self.pps
        if args and args[0] == "moveto":
            self.view = max(0.0, float(args[1]) * total)
        elif args and args[0] == "scroll":
            amount = int(args[1])
            self.view += amount * (span * 0.9 if args[2] == "pages" else span * 0.1)
        self.view = max(0.0, min(self.view, max(0.0, total - span * 0.5)))
        self._paint_all()

    def _paint_all(self) -> None:
        if not hasattr(self, "beat_lane"):
            return
        total = self._length()
        span = self._lane_width() / self.pps
        self.hscroll.set(self.view / total, min(1.0, (self.view + span) / total))
        self._paint_ruler()
        self._paint_beat()
        for index in range(len(self.tracks)):
            self._paint_track(index)
        self._move_head(self._head_time())

    def _head_time(self) -> float:
        if self.recording:
            return self.rec_start + self._rec_elapsed()
        if self._arming:
            return self.rec_start
        if self.playing:
            return self._play_from + (time.monotonic() - self._play_t0)
        return self.cursor

    def _rec_elapsed(self) -> float:
        """Seconds since capture and the beat started together. Not the WAV size."""
        return max(0.0, time.monotonic() - self._play_t0)

    def _paint_ruler(self) -> None:
        canvas = self.ruler
        canvas.delete("all")
        width = canvas.winfo_width()
        height = canvas.winfo_height()
        step = next((value for value in (0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60) if value * self.pps >= 64 * self.ui), 120)
        first = math.floor(self.view / step) * step
        mark = first
        while self._x(mark) <= width:
            x = self._x(mark)
            if x >= 0:
                canvas.create_line(x, height * 0.45, x, height, fill=SOFT)
                if step < 0.2:
                    label = f"{int(mark // 60)}:{mark % 60:05.2f}"
                elif step < 1:
                    label = f"{int(mark // 60)}:{mark % 60:04.1f}"
                else:
                    label = f"{int(mark // 60)}:{int(mark % 60):02d}"
                canvas.create_text(x + 3, 1, text=label, fill=SOFT, anchor="nw", font=(FONT_META, 8))
                minor = step / 5
                for part in range(1, 5):
                    mx = self._x(mark + part * minor)
                    canvas.create_line(mx, height * 0.75, mx, height, fill=LINE_STRONG)
            mark += step
        if self.sel is not None:
            canvas.create_rectangle(self._x(self.sel[1]), height - 4, self._x(self.sel[2]), height, fill=AMBER, outline="")

    def _paint_beat(self) -> None:
        canvas = self.beat_lane
        canvas.delete("all")
        width = canvas.winfo_width()
        height = canvas.winfo_height()
        title, bpm, seconds = self._beat_meta()
        if not title:
            hint = (
                "Wybierz własny bit z pliku (przycisk BIT u góry)."
                if self.studio_mode == "offline"
                else "Wybierz bit z katalogu (przycisk BIT u góry)."
            )
            canvas.create_text(12, height / 2, text=hint, fill=MUTE, anchor="w", font=(FONT_UI, 10))
            return
        end = seconds if seconds > 0 else self._length()
        x1 = max(0.0, self._x(0.0))
        x2 = min(float(width), self._x(end))
        if x2 <= x1:
            return
        body = "#4a3417" if self.beat_muted else "#6b4a1c"
        canvas.create_rectangle(x1, 2, x2, height - 2, fill=body, outline="")
        canvas.create_rectangle(x1, 2, x2, 2 + self.clip_bar, fill=MUTE if self.beat_muted else AMBER, outline="")
        canvas.create_text(x1 + 6, 2 + self.clip_bar / 2, text=f"BIT · {title}", fill=ON_AMBER, anchor="w", font=(FONT_UI, 9, "bold"))
        if bpm > 0:
            beat_len = 60.0 / bpm
            bar_len = beat_len * 4
            step = bar_len if bar_len * self.pps >= 8 else bar_len * 4
            mark = math.floor(self.view / step) * step
            while self._x(mark) <= x2:
                x = self._x(mark)
                if x >= x1:
                    canvas.create_line(x, 3 + self.clip_bar, x, height - 3, fill="#8a6326")
                mark += step
        mid = (height + self.clip_bar) / 2
        half_max = max(4.0, (height - 4 - self.clip_bar) / 2)
        if self._beat_peaks and self._beat_peak_path == self.local_beat_path:
            self._stroke_wave(
                canvas, max(0.0, x1), min(float(width), x2), mid, half_max, "#f3d7a1", "beatwave",
                lambda t: self._level_at(self._beat_peaks, t),
            )
        else:
            canvas.create_line(x1, mid, x2, mid, fill="#8a6326")
        if self.beat_muted:
            canvas.create_text((x1 + x2) / 2 if x2 - x1 < 400 else x1 + 200, mid, text="BIT WYCISZONY (M)", fill=SOFT, font=(FONT_META, 9))

    def _peaks_of(self, path: str) -> list[float]:
        found = self._peaks.get(path)
        if found is None:
            try:
                found = block_peaks(self._load(path))
            except Exception:
                found = []
            self._peaks[path] = found
        return found

    def _load(self, path: str) -> array.array:
        found = self._audio.get(path)
        if found is None:
            rate, samples = read_mono16(Path(path))
            if rate != RATE:
                raise ValueError("rate")
            if len(self._audio) > 24:
                self._audio.clear()
            self._audio[path] = samples
            found = samples
        return found

    def _paint_track(self, index: int) -> None:
        track = self.tracks[index]
        canvas = self.rows[index]["lane"]
        if not isinstance(canvas, tk.Canvas):
            return
        if (self.recording or self._arming) and index == self.rec_track:
            self._drop_live_items()
        canvas.delete("all")
        width = canvas.winfo_width()
        height = canvas.winfo_height()
        heard = self._heard(track)
        if index == self.focus:
            canvas.create_rectangle(0, 0, width, height, fill="#17120e", outline="")
        sel = self.sel if self.sel is not None and self.sel[0] == index else None
        if sel is not None:
            canvas.create_rectangle(self._x(sel[1]), 0, self._x(sel[2]), height, fill=SEL_BG, outline="")
        moving = self._drag if self._drag and self._drag.get("mode") == "move" else None
        for number, clip in enumerate(track.clips):
            if moving is not None and moving.get("clip") is clip and moving.get("moved"):
                continue
            self._paint_clip(canvas, clip, f"{track.name} #{number + 1}", track.color, heard, sel, height, width)
        if moving is not None and moving.get("moved") and moving.get("target") == index:
            clip = moving["clip"]
            if isinstance(clip, Clip):
                ghost = replace(clip, start=float(moving.get("to", clip.start)))
                self._paint_clip(canvas, ghost, "przesuwam…", track.color, heard, None, height, width, ghost=True)
        if self.recording and index == self.rec_track:
            self._grow_live()
            self._paint_live_wave(canvas, height)
        elif self._arming and index == self.rec_track:
            self._mark_record_armed()
        if not track.clips and not (self.recording and index == self.rec_track) and not (self._arming and index == self.rec_track):
            hint = "● uzbrojona: NAGRAJ zapisze tutaj" if index == self.armed else "pusta ścieżka"
            canvas.create_text(12, height / 2, text=hint, fill=MUTE, anchor="w", font=(FONT_UI, 9))

    def _paint_clip(
        self, canvas: tk.Canvas, clip: Clip, label: str, color: str, heard: bool,
        sel: tuple[int, float, float] | None, height: int, width: int, ghost: bool = False,
    ) -> None:
        x1 = self._x(clip.start)
        x2 = self._x(clip.end)
        if x2 < 0 or x1 > width:
            return
        body = shade(color, 0.55 if heard else 0.3)
        head = color if heard else shade(color, 0.45)
        top = 2 + self.clip_bar
        canvas.create_rectangle(x1, 2, x2, height - 2, fill=body, outline=AMBER if ghost else shade(color, 0.8), width=2 if ghost else 1)
        canvas.create_rectangle(x1, 2, x2, top, fill=head, outline="")
        if x2 - x1 > 40:
            canvas.create_text(max(x1, 0) + 5, 2 + self.clip_bar / 2, text=label, fill=ON_AMBER, anchor="w", font=(FONT_UI, 8, "bold"))
        peaks = self._peaks_of(clip.path)
        mid = (top + height - 2) / 2
        half_max = max(4.0, (height - 2 - top) / 2 - 2)
        lo = max(0.0, x1)
        hi = min(float(width), x2)
        if peaks and hi - lo >= 1:
            def level_at(t: float) -> float:
                return self._level_at(peaks, clip.src_in + (t - clip.start))

            self._stroke_wave(canvas, lo, hi, mid, half_max, "#1a1006", "wave", level_at)
            if sel is not None:
                sx0 = max(lo, self._x(sel[1]))
                sx1 = min(hi, self._x(sel[2]))
                if sx1 - sx0 >= 1:
                    self._stroke_wave(canvas, sx0, sx1, mid, half_max, INK, "wave", level_at)

    def _drop_live_items(self) -> None:
        self._live_rect = None
        self._live_bar = None
        self._live_canvas = None

    def _level_at(self, peaks: list[float], source_time: float) -> float:
        if source_time < 0 or not peaks:
            return 0.0
        i0 = int(source_time * 100)
        if i0 < 0 or i0 >= len(peaks):
            return 0.0
        reach = max(1.0 / max(self.pps, 0.001), 0.01)
        i1 = min(len(peaks), max(i0 + 1, int((source_time + reach) * 100) + 1))
        return max(peaks[i0:i1])

    def _stroke_wave(
        self, canvas: tk.Canvas, x0: float, x1: float, mid: float, half_max: float,
        fill: str, tag: str, level_at: Callable[[float], float],
    ) -> None:
        last = int(x1)
        step = max(1, int((x1 - x0) / 480))
        columns = list(range(int(x0), last + 1, step))
        if not columns or columns[-1] != last:
            columns.append(last)
        upper: list[float] = []
        lower: list[float] = []
        for x in columns:
            half = display_wave_half(level_at(self._t(x)), half_max)
            upper.extend((x, mid - half))
            lower.extend((x, mid + half))
        if len(upper) < 4:
            return
        coords = upper
        for index in range(len(lower) - 2, -1, -2):
            coords.append(lower[index])
            coords.append(lower[index + 1])
        canvas.create_polygon(*coords, fill=fill, outline="", tags=tag)

    def _grow_live(self) -> None:
        """Move the red take with the clock. Does not redraw the whole lane."""
        if not self.recording or not (0 <= self.rec_track < len(self.rows)):
            return
        canvas = self.rows[self.rec_track].get("lane")
        if not isinstance(canvas, tk.Canvas):
            return
        height = max(canvas.winfo_height(), 4)
        x1 = self._x(self.rec_start)
        x2 = max(x1 + 2.0, self._x(self.rec_start + self._rec_elapsed()))
        top = 2 + self.clip_bar
        if self._live_canvas is not canvas or self._live_rect is None:
            canvas.delete("livebox")
            canvas.delete("livelabel")
            self._live_canvas = canvas
            self._live_rect = canvas.create_rectangle(x1, 2, x2, height - 2, fill="#5a1d14", outline=REC, tags="livebox")
            self._live_bar = canvas.create_rectangle(x1, 2, x2, top, fill=REC, outline="", tags="livelabel")
            canvas.create_text(
                max(x1, 0) + 5, 2 + self.clip_bar / 2, text="NAGRYWAM", fill=INK, anchor="w",
                font=(FONT_UI, 8, "bold"), tags="livelabel",
            )
            return
        try:
            canvas.coords(self._live_rect, x1, 2, x2, height - 2)
            if self._live_bar is not None:
                canvas.coords(self._live_bar, x1, 2, x2, top)
        except tk.TclError:
            self._drop_live_items()
            self._grow_live()

    def _paint_live_wave(self, canvas: tk.Canvas, height: int) -> None:
        canvas.delete("livewave")
        peaks = self._live_peaks
        elapsed = self._rec_elapsed() if self.recording else 0.0
        known, drawn = live_wave_span(elapsed, len(peaks))
        if drawn <= 0.0:
            canvas.tag_raise("livelabel")
            canvas.tag_raise("head")
            return
        lo = max(0.0, self._x(self.rec_start))
        hi = min(float(canvas.winfo_width() or 0), self._x(self.rec_start + drawn))
        if hi - lo < 1:
            canvas.tag_raise("livelabel")
            canvas.tag_raise("head")
            return
        top = 2 + self.clip_bar
        mid = (top + height - 2) / 2
        half_max = max(4.0, (height - 2 - top) / 2 - 2)

        def level_at(t: float) -> float:
            local = t - self.rec_start
            if not peaks:
                return 0.2
            if local >= known:
                return peaks[-1]
            return self._level_at(peaks, local)

        self._stroke_wave(canvas, lo, hi, mid, half_max, INK, "livewave", level_at)
        canvas.tag_raise("livelabel")
        canvas.tag_raise("headline")
        canvas.tag_raise("head")

    def _move_head(self, seconds: float) -> None:
        canvases = [self.ruler, self.beat_lane] + [row["lane"] for row in self.rows if isinstance(row.get("lane"), tk.Canvas)]
        x = self._x(seconds)
        color = REC if self.recording or self._arming else INK
        for canvas in canvases:
            if not isinstance(canvas, tk.Canvas):
                continue
            height = max(canvas.winfo_height(), 1)
            width = 2 if canvas is self.ruler else 1
            lines = canvas.find_withtag("headline")
            if lines:
                try:
                    canvas.coords(lines[0], x, 0, x, height)
                    canvas.itemconfigure(lines[0], fill=color, width=width)
                    canvas.tag_raise(lines[0])
                except tk.TclError:
                    canvas.delete("headline")
                    lines = ()
            if not lines:
                canvas.create_line(x, 0, x, height, fill=color, width=width, tags=("head", "headline"))
        if isinstance(self.ruler, tk.Canvas):
            caps = self.ruler.find_withtag("headcap")
            if caps:
                try:
                    self.ruler.coords(caps[0], x - 6, 0, x + 6, 0, x, 9)
                    self.ruler.tag_raise(caps[0])
                except tk.TclError:
                    self.ruler.delete("headcap")
                    caps = ()
            if not caps:
                self.ruler.create_polygon(x - 6, 0, x + 6, 0, x, 9, fill=INK, outline="", tags=("head", "headcap"))
        self.clock.set(clock_text(seconds))

    def _clear_record_mark(self) -> None:
        self._drop_live_items()
        if not (0 <= self.rec_track < len(self.rows)):
            return
        canvas = self.rows[self.rec_track].get("lane")
        if isinstance(canvas, tk.Canvas):
            canvas.delete("livebox")
            canvas.delete("livelabel")
            canvas.delete("livewave")

    def _mark_record_armed(self) -> None:
        """Red take the moment Record is pressed, before the mix and the mic are ready."""
        if not (0 <= self.rec_track < len(self.rows)):
            return
        canvas = self.rows[self.rec_track].get("lane")
        if not isinstance(canvas, tk.Canvas):
            return
        height = max(canvas.winfo_height(), 4)
        x1 = self._x(self.rec_start)
        x2 = x1 + max(8.0, 0.15 * self.pps)
        top = 2 + self.clip_bar
        self._live_canvas = canvas
        canvas.delete("livebox")
        canvas.delete("livelabel")
        self._live_rect = canvas.create_rectangle(x1, 2, x2, height - 2, fill="#5a1d14", outline=REC, tags="livebox")
        self._live_bar = canvas.create_rectangle(x1, 2, x2, top, fill=REC, outline="", tags="livelabel")
        canvas.create_text(
            max(x1, 0) + 5, 2 + self.clip_bar / 2, text="NAGRYWAM", fill=INK, anchor="w",
            font=(FONT_UI, 8, "bold"), tags="livelabel",
        )
        canvas.tag_raise("livelabel")
        self._move_head(self.rec_start)

    def _follow(self, seconds: float) -> None:
        span = self._lane_width() / max(self.pps, 0.001)
        if self.view <= seconds <= self.view + span * 0.82:
            return
        self.view = max(0.0, seconds - span * 0.25)
        if self.recording:
            total = max(self._length(), 0.001)
            self.hscroll.set(self.view / total, min(1.0, (self.view + span) / total))
            self._paint_ruler()
            self._paint_beat()
            if 0 <= self.rec_track < len(self.tracks):
                self._paint_track(self.rec_track)
            return
        self._paint_all()

    # ---- mouse on lanes -----------------------------------------------------------

    def _set_cursor(self, seconds: float) -> None:
        if self.recording or self._arming:
            return
        if self.playing:
            self.stop()
        self.cursor = max(0.0, seconds)
        self.sel = None
        self._paint_all()

    def _ruler_click(self, event: tk.Event) -> None:
        self._set_cursor(self._t(event.x))

    def _lane_click_plain(self, event: tk.Event) -> None:
        self._set_cursor(self._t(event.x))

    def _lane_down(self, track: Track, event: tk.Event) -> None:
        if track not in self.tracks or self.recording or self._arming:
            return
        if self.playing:
            self.stop()
        index = self.tracks.index(track)
        self.focus = index
        t = self._t(event.x)
        hit = clip_at(track.clips, t)
        if hit is not None and event.y <= 2 + self.clip_bar + 2:
            clip = track.clips[hit]
            self._drag = {"mode": "move", "track": index, "clip": clip, "grab": t - clip.start, "x": event.x, "moved": False, "to": clip.start, "target": index}
            self.status.set("Przeciągnij klip w lewo albo w prawo, także na inną ścieżkę wokalu.")
        else:
            self._drag = {"mode": "select", "track": index, "a": t, "x": event.x}
            self.cursor = t
            self.sel = None
        self._sync_track_buttons()
        self._paint_all()

    def _lane_under(self, event: tk.Event) -> int | None:
        widget = self.root.winfo_containing(event.x_root, event.y_root)
        for index, row in enumerate(self.rows):
            if widget is row.get("lane"):
                return index
        return None

    def _lane_drag(self, event: tk.Event) -> None:
        drag = self._drag
        if drag is None:
            return
        t = self._t(event.x)
        if drag["mode"] == "select":
            a = float(drag["a"])
            if abs(event.x - int(drag["x"])) >= 3:
                self.sel = (int(drag["track"]), min(a, t), max(a, t))
                self.cursor = min(a, t)
                self._paint_track(int(drag["track"]))
                self._paint_ruler()
                self._move_head(self.cursor)
                self.clock.set(f"{clock_text(self.sel[1])} – {clock_text(self.sel[2])}")
            return
        if abs(event.x - int(drag["x"])) >= 3:
            drag["moved"] = True
        target = self._lane_under(event)
        old_target = int(drag.get("target", drag["track"]))
        if target is not None:
            drag["target"] = target
        drag["to"] = max(0.0, t - float(drag["grab"]))
        for index in {int(drag["track"]), old_target, int(drag["target"])}:
            if 0 <= index < len(self.tracks):
                self._paint_track(index)
        self._move_head(float(drag["to"]))

    def _lane_up(self, _event: tk.Event) -> None:
        drag, self._drag = self._drag, None
        if drag is None:
            return
        if drag["mode"] == "select":
            if self.sel is None:
                self.status.set(f"Kursor: {clock_text(self.cursor)}. NAGRAJ i GRAJ ruszą od tego miejsca.")
            else:
                self.status.set(
                    f"Zaznaczenie {clock_text(self.sel[1])}–{clock_text(self.sel[2])} na {self.tracks[self.sel[0]].name}. "
                    "Usuń, Wytnij, Kopiuj albo Graj. Nagraj ruszy od początku zaznaczenia."
                )
            self._paint_all()
            return
        clip = drag["clip"]
        if not drag.get("moved") or not isinstance(clip, Clip):
            self.sel = None
            self.cursor = self._t(int(drag["x"]))
            self._paint_all()
            return
        source = self.tracks[int(drag["track"])]
        target = self.tracks[int(drag["target"])]
        if clip not in source.clips:
            self._paint_all()
            return
        self._push_undo()
        source.clips = [item for item in source.clips if item is not clip]
        moved = replace(clip, start=round(float(drag["to"]), 4))
        target.clips = place(target.clips, [moved])
        self.focus = int(drag["target"])
        self.sel = None
        self.cursor = moved.start
        self._save_desk()
        self._sync_track_buttons()
        self._paint_all()
        where = "" if source is target else f" na {target.name}"
        self.status.set(f"Klip przesunięty{where}: start {clock_text(moved.start)}. Cofnij: Ctrl+Z.")

    def _lane_double(self, track: Track, event: tk.Event) -> None:
        if track not in self.tracks or self.recording:
            return
        hit = clip_at(track.clips, self._t(event.x))
        if hit is None:
            return
        clip = track.clips[hit]
        self.sel = (self.tracks.index(track), clip.start, clip.end)
        self.cursor = clip.start
        self._drag = None
        self._paint_all()
        self.status.set("Cały klip zaznaczony.")

    # ---- editing ----------------------------------------------------------------

    def _push_undo(self) -> None:
        snapshot = [replace(track, clips=list(track.clips)) for track in self.tracks]
        self.undo_stack.append((snapshot, self.armed))
        del self.undo_stack[:-60]

    def undo(self) -> None:
        if self._busy() or not self.undo_stack:
            if not self.undo_stack:
                self.status.set("Nie ma czego cofnąć.")
            return
        snapshot, armed = self.undo_stack.pop()
        same_shape = len(snapshot) == len(self.tracks)
        self.tracks = snapshot
        self.armed = armed
        self.sel = None
        if same_shape:
            self._sync_track_buttons()
            self._paint_all()
        else:
            self._rebuild_rows()
        self._save_desk()
        self.status.set("Cofnięte.")

    def edit(self, mode: str) -> None:
        if self._busy():
            return
        if self.playing:
            self.stop()
        if mode == "paste":
            if not self.clipboard:
                self.status.set("Schowek jest pusty. Najpierw Kopiuj albo Wytnij.")
                return
            track = self.tracks[self.focus]
            self._push_undo()
            pasted = shift(self.clipboard, self.cursor)
            track.clips = place(track.clips, pasted)
            end = max(clip.end for clip in pasted)
            self.sel = (self.focus, self.cursor, end)
            self._save_desk()
            self._paint_all()
            self.status.set(f"Wklejone na {track.name} od {clock_text(self.cursor)}.")
            return
        if mode == "split":
            track = self.tracks[self.focus]
            if clip_at(track.clips, self.cursor) is None:
                self.status.set("Postaw kursor na klipie, który chcesz podzielić.")
                return
            self._push_undo()
            track.clips = split_at(track.clips, self.cursor)
            self._save_desk()
            self._paint_all()
            self.status.set(f"Klip podzielony w {clock_text(self.cursor)}. Każdą część przesuniesz osobno.")
            return
        if self.sel is None:
            self.status.set("Najpierw zaznacz fragment: przeciągnij po ścieżce wokalu.")
            return
        index, a, b = self.sel
        track = self.tracks[index]
        pieces = extract(track.clips, a, b)
        if mode in ("copy", "cut"):
            if not pieces:
                self.status.set("W zaznaczeniu nie ma nagrania.")
                return
            self.clipboard = pieces
        if mode == "copy":
            self.status.set(f"Skopiowane {b - a:.2f} s. Postaw kursor i Wklej (Ctrl+V).")
            return
        if not pieces:
            self.status.set("W zaznaczeniu nie ma nagrania.")
            return
        self._push_undo()
        track.clips = carve(track.clips, a, b)
        self.sel = None
        self.cursor = a
        self._save_desk()
        self._paint_all()
        self.status.set(("Wycięte do schowka. " if mode == "cut" else "Usunięte. ") + "Cofnij: Ctrl+Z.")

    # ---- desk autosave ------------------------------------------------------

    def _desk_path(self) -> Path:
        return DESK_OFFLINE if self.studio_mode == "offline" else DESK

    def _save_desk(self) -> None:
        self._touched = True
        data: dict[str, object] = {
            "beat": self.beat_var.get(),
            "title": self.title_var.get(),
            "armed": self.armed,
            "beatMuted": self.beat_muted,
            "beatGainDb": self.beat_gain_db,
            "beatPan": self.beat_pan,
            "tracks": [
                {
                    "name": track.name,
                    "role": track.role,
                    "muted": track.muted,
                    "solo": track.solo,
                    "gain_db": track.gain_db,
                    "pan": track.pan,
                    "clips": [clip.to_json() for clip in track.clips],
                }
                for track in self.tracks
            ],
        }
        if self.studio_mode == "offline":
            data["localBeat"] = self.local_beat_path
            data["localBeatSeconds"] = self.local_beat_seconds
        try:
            path = self._desk_path()
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data), encoding="utf-8")
        except OSError:
            pass

    def _restore_desk(self) -> None:
        self.tracks = []
        self.local_beat_path = ""
        self.local_beat_seconds = 0.0
        try:
            raw = json.loads(self._desk_path().read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {}
        rows = raw.get("tracks") if isinstance(raw, dict) else None
        lost = 0
        cap = offline_session.offline_track_cap() if self.studio_mode == "offline" else 16
        if isinstance(rows, list):
            for item in rows[:cap]:
                if not isinstance(item, dict):
                    continue
                track = self._new_track()
                track.name = str(item.get("name") or track.name)[:40]
                track.role = "podbicie" if item.get("role") == "podbicie" else "wokal"
                track.muted = bool(item.get("muted"))
                track.solo = bool(item.get("solo"))
                track.gain_db = offline_session.clamp_gain(item.get("gain_db"))
                track.pan = offline_session.clamp_pan(item.get("pan"))
                for entry in item.get("clips") or []:
                    clip = Clip.from_json(entry)
                    if clip is None:
                        continue
                    if not Path(clip.path).is_file():
                        lost += 1
                        continue
                    track.clips.append(clip)
                track.clips = ordered(track.clips)
                self.tracks.append(track)
        if not self.tracks:
            self.tracks = [self._new_track()]
        if isinstance(raw, dict):
            title = raw.get("title")
            if isinstance(title, str) and title.strip():
                self.title_var.set(title)
            armed = raw.get("armed")
            if isinstance(armed, int):
                self.armed = armed
            if isinstance(raw.get("beatMuted"), bool):
                self.beat_muted = bool(raw["beatMuted"])
            self.beat_gain_db = offline_session.clamp_gain(raw.get("beatGainDb"))
            self.beat_pan = offline_session.clamp_pan(raw.get("beatPan"))
            if self.studio_mode == "offline":
                local = raw.get("localBeat")
                if isinstance(local, str):
                    self.local_beat_path = local
                    self.beat_var.set(offline_session.file_title(local) if local else "")
                seconds = raw.get("localBeatSeconds")
                if isinstance(seconds, (int, float)) and not isinstance(seconds, bool):
                    self.local_beat_seconds = max(0.0, float(seconds))
            else:
                beat = raw.get("beat")
                if isinstance(beat, str):
                    self._desk_beat = beat
                    if beat in [label for _beat_id, label in self.beats]:
                        self.beat_var.set(beat)
        if hasattr(self, "beat_gain_scale"):
            self.beat_gain_scale.set(self.beat_gain_db)
            self.beat_gain_label.configure(text=f"{self.beat_gain_db:+.0f}")
        if hasattr(self, "beat_pan_scale"):
            self.beat_pan_scale.set(max(-100.0, min(100.0, self.beat_pan * 100)))
            self.beat_pan_label.configure(text=offline_session.pan_text(self.beat_pan))
        self._rebuild_rows()
        self._sync_beat_button()
        self._touched = False
        clips = sum(len(track.clips) for track in self.tracks)
        if clips:
            self.status.set(
                f"Wczytany ostatni projekt z tego komputera: {count_word(len(self.tracks), 'ścieżka', 'ścieżki', 'ścieżek')}, "
                f"{count_word(clips, 'klip', 'klipy', 'klipów')}."
            )
        if lost:
            self.status.set(self.status.get() + f" Brak {lost} plików nagrań na dysku, te klipy pominięte.")

    def new_project(self) -> None:
        if self._busy() or self._uploading:
            return
        clips = sum(len(track.clips) for track in self.tracks)
        if clips and not messagebox.askyesno(
            "BitRymDym", "Zacząć nowy projekt? Ścieżki z tego projektu znikną z programu i z dysku tego komputera."
        ):
            return
        used = {clip.path for track in self.tracks for clip in track.clips}
        used |= {clip.path for snapshot, _armed in self.undo_stack for track in snapshot for clip in track.clips}
        for path in used:
            if Path(path).parent == TAKES:
                try:
                    Path(path).unlink()
                except OSError:
                    pass
        self.tracks = [self._new_track()]
        self.undo_stack = []
        self.clipboard = []
        self.sel = None
        self.cursor = 0.0
        self.view = 0.0
        self.armed = 0
        self.focus = 0
        self._audio.clear()
        self._peaks.clear()
        if self.studio_mode == "offline":
            self.local_beat_path = ""
            self.local_beat_seconds = 0.0
            self.beat_var.set("")
        self._rebuild_rows()
        self._save_desk()
        if self.studio_mode == "offline":
            self.status.set("Nowy projekt offline. Wybierz własny bit z pliku i nagraj.")
        else:
            self.status.set("Nowy projekt. Wybierz bit i nagraj.")

    def _save_prefs(self) -> None:
        try:
            write_prefs(
                PREFS,
                {
                    "device": self.device_var.get(),
                    "output": self.output_var.get(),
                    "title": self.title_var.get().strip(),
                    "beat": self.beat_var.get(),
                },
            )
        except OSError:
            pass

    def _load_prefs(self) -> None:
        try:
            prefs = read_prefs(PREFS)
        except (OSError, json.JSONDecodeError):
            return
        title = prefs.get("title")
        if isinstance(title, str) and title:
            self.title_var.set(title)
        device = prefs.get("device")
        if isinstance(device, str):
            self._pref_device = device
            if device in self.devices:
                self.device_var.set(device)
        output = prefs.get("output")
        if isinstance(output, str):
            self._pref_output = output
            if any(label == output for label, _index in self.outputs):
                self.output_var.set(output)
        beat = prefs.get("beat")
        if isinstance(beat, str):
            self._pref_beat = beat
            if beat in [label for _beat_id, label in self.beats]:
                self.beat_var.set(beat)
        self._sync_beat_button()

    def _read_plan(self) -> None:
        saved = load_session()
        token = saved.get("accessToken") if saved else None
        if not token:
            self.tier = "FREE"
            self.plan_text.set("Plan: zaloguj się.")
            self._sync_add_button()
            return
        try:
            payload = self._client().plan_usage()
            tier, _cap, _side = limits_from_usage(payload)
        except Exception as error:
            self.tier = "FREE"
            self.plan_text.set(str(error)[:120])
            self._sync_add_button()
            return
        self.tier = tier
        if self.studio_mode == "offline":
            self.plan_text.set(self._offline_plan_line())
        else:
            stems = "stemy: tak" if tier == "GOLD" else "stemy: od Gold"
            self.plan_text.set(
                f"Plan {display_tier(tier)}: {max_recording_tracks(tier)} ścieżek, ujęcie do {max_take_seconds(tier)} s, {stems}."
            )
        self._sync_add_button()
        self._paint_all()

    # ---- play and record -------------------------------------------------------

    def _mix_plan(self, start: float, skip: int | None) -> list[tuple[list[Clip], float, float]]:
        any_solo = any(track.solo for track in self.tracks)
        found: list[tuple[list[Clip], float, float]] = []
        for index, track in enumerate(self.tracks):
            if index == skip or not self._heard(track, any_solo):
                continue
            if track_end(track.clips) > start + 0.01:
                found.append((list(track.clips), track.gain_db, track.pan))
        return found

    def _render_for_play(self, plan: list[tuple[list[Clip], float, float]], start: float) -> list[tuple[Path, float, float]]:
        """Heard tracks from the cursor to their end, as temp WAVs for ffmpeg. Runs off the Tk thread."""
        folder = Path(os.environ.get("TEMP", ".")) / "bitrymdym-play"
        folder.mkdir(parents=True, exist_ok=True)
        out: list[tuple[Path, float, float]] = []
        for number, (clips, gain_db, pan) in enumerate(plan):
            samples = render(clips, start, track_end(clips), self._load)
            if len(samples) < 2:
                continue
            path = folder / f"tor-{number}.wav"
            replace_mono16(path, samples)
            out.append((path, gain_db, pan))
        return out

    def toggle_play(self) -> None:
        if self.recording:
            self.stop()
        elif self.playing or self._arming:
            self.stop()
        else:
            self.play()

    def play(self) -> None:
        if self.recording or self._arming:
            return
        self._stop_probe()
        self.stop()
        start = self.sel[1] if self.sel is not None else self.cursor
        plan = self._mix_plan(start, None)
        beat_id, local = self._play_beat()
        local_ok = bool(local) and Path(local).is_file()
        if not plan and not beat_id and not local_ok:
            self.status.set("Nie ma czego grać od tego miejsca: bit wyciszony albo nie wybrany, ścieżki puste.")
            return
        self._play_token += 1
        token = self._play_token
        self._arming = True
        self.status.set("Składam odsłuch od kursora…")
        threading.Thread(target=self._prepare_play, args=(token, start, plan, beat_id, local, None), daemon=True).start()

    def _play_beat(self) -> tuple[str, str]:
        """(catalog id, local file). Offline never asks the site for a beat."""
        if self.beat_muted:
            return "", ""
        if self.studio_mode == "offline":
            return "", self.local_beat_path
        return self._beat_id_or_empty(), ""

    def _prepare_play(
        self, token: int, start: float, plan: list[tuple[list[Clip], float, float]], beat_id: str, local: str, record_to: Path | None
    ) -> None:
        heard: tuple[str | None, int | None, str] = (None, None, "")
        vocals: list[tuple[Path, float, float]] = []
        error = ""
        try:
            if local:
                if Path(local).is_file():
                    heard = (local, None, "")
                else:
                    heard = (None, None, "Nie ma pliku bitu na dysku. Wskaż go jeszcze raz.")
            elif beat_id:
                heard = self._beat_listen(beat_id)
            vocals = self._render_for_play(plan, start)
        except Exception as problem:
            error = str(problem) or "Nie dało się złożyć odsłuchu."
        self.root.after(0, lambda: self._start_play(token, start, heard, vocals, record_to, error))

    def _start_play(
        self, token: int, start: float, heard: tuple[str | None, int | None, str],
        vocals: list[tuple[Path, float, float]], record_to: Path | None, error: str,
    ) -> None:
        if token != self._play_token:
            return
        self._arming = False
        if error and record_to is None:
            self.status.set(error)
            return
        if error:
            heard = (heard[0], heard[1], f"Pozostałych ścieżek nie słychać ({error[:60]}).")
        target, limit, note = heard
        beat = target
        if self.beat_muted:
            beat = None
            note = "Bit wyciszony (M)."
        if beat is not None and limit and start >= limit:
            beat = None
            note = f"Podgląd bitu ma tylko {limit} s, dalej gra bez bitu."
        try:
            self._stop_monitor()
            if record_to is not None:
                self.capture = start_capture(record_to, self.selected_device())
                self.wav_path = record_to
                self.recording = True
                self._live_peaks = []
                self._live_off = 0
                self._live_wave_at = 0.0
                self._drop_live_items()
            if beat is not None or vocals:
                ffmpeg = ffmpeg_exe()
                play = ffplay_exe()
                output_index = self.selected_output_index()
                if play is None and output_index is None:
                    note = NO_FFPLAY
                else:
                    argv = mix_argv(
                        ffmpeg, beat, vocals, limit, beat_start=start,
                        beat_gain_db=self.beat_gain_db, beat_pan=self.beat_pan,
                    )
                    self.mix_feed, self.monitor = start_mix(ffmpeg, play or "", argv, output_index)
            elif record_to is None:
                raise RuntimeError(note or "Nie ma czego grać.")
        except Exception as problem:
            self._stop_monitor()
            if self.capture is not None:
                stop_capture(self.capture)
                self.capture = None
            self.recording = False
            self._clear_record_mark()
            self.rec_button.configure(text="● NAGRAJ")
            self._paint_lamp()
            self.status.set(self._safe_listen_error(problem))
            return
        self._play_from = start
        self._play_t0 = time.monotonic()
        if record_to is None and self.monitor is None:
            self.status.set(note or NO_FFPLAY)
            return
        if record_to is None:
            self.playing = True
            self.play_button.configure(text="▶ GRA…")
            self.status.set(f"Gra od {clock_text(start)}. {note}".strip())
        else:
            name = self.tracks[self.rec_track].name
            extra = f" {heard[2]}" if heard[2] and not self.beat_muted else ""
            if self.beat_muted:
                extra = " Bit wyciszony (M)."
            self.status.set(f"Nagrywam {name} od {clock_text(start)}.{extra}")
            self.rec_button.configure(text="● NAGRYWA")
        self._paint_lamp()
        self._paint_all()
        self._tick()

    def record(self) -> None:
        if self.recording or self._arming:
            return
        if self.playing:
            self.stop()
        self._stop_probe()
        if not self.tracks:
            return
        if not self.devices:
            self.status.set("Windows nie pokazał mikrofonu. Podłącz mikrofon i uruchom program jeszcze raz.")
            return
        self.rec_track = max(0, min(self.armed, len(self.tracks) - 1))
        self.rec_start = self.sel[1] if self.sel is not None else self.cursor
        self.sel = None
        plan = self._mix_plan(self.rec_start, self.rec_track)
        beat_id, local = self._play_beat()
        TAKES.mkdir(parents=True, exist_ok=True)
        path = TAKES / f"ujecie-{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}.wav"
        self._play_token += 1
        token = self._play_token
        self._arming = True
        self.rec_button.configure(text="● NAGRYWA")
        self.status.set("Przygotowuję nagranie: bit i pozostałe ścieżki…")
        self._mark_record_armed()
        threading.Thread(target=self._prepare_play, args=(token, self.rec_start, plan, beat_id, local, path), daemon=True).start()

    def stop(self) -> None:
        if self._arming:
            self._play_token += 1
            self._arming = False
            self._clear_record_mark()
            self.rec_button.configure(text="● NAGRAJ")
            self.status.set("Przerwane.")
        self._cancel_tick()
        if self.recording:
            self._stop_monitor()
            if self.capture is not None:
                stop_capture(self.capture)
                self.capture = None
            self._keep_take()
            return
        if self.playing:
            self._stop_monitor()
            self.playing = False
            self.play_button.configure(text="▶ GRAJ")
            self._paint_lamp()
            self._move_head(self.cursor)
            self.status.set("Stop.")

    def _keep_take(self, died: str = "") -> None:
        """The capture is closed: put the take on the armed track as one clip from the record start."""
        self.recording = False
        self._drop_live_items()
        self.rec_button.configure(text="● NAGRAJ")
        self._paint_lamp()
        path = self.wav_path
        if not path.exists() or path.stat().st_size < 2000:
            read_capture_log(path)
            self.status.set(died or "Nagranie jest puste.")
            self._paint_all()
            return
        self._take_note = self._rate_take(path)
        seconds = file_seconds(path)
        cap = float(max_take_seconds(self.tier))
        length = min(seconds, cap)
        if length < 0.05:
            self.status.set(died or "Nagranie jest za krótkie.")
            self._paint_all()
            return
        self._push_undo()
        clip = Clip(str(path), round(self.rec_start, 4), 0.0, round(length, 4))
        track = self.tracks[self.rec_track]
        track.clips = place(track.clips, [clip])
        self._peaks.pop(str(path), None)
        self._audio.pop(str(path), None)
        self.focus = self.rec_track
        self.cursor = self.rec_start
        self._save_desk()
        self._paint_all()
        prefix = f"{died} " if died else ""
        self.status.set(
            f"{prefix}Ujęcie {length:.1f} s jest na {track.name} od {clock_text(self.rec_start)}. "
            + (f"{self._take_note} " if self._take_note else "")
            + "Przeciągnij pasek klipu, żeby go przesunąć."
        )

    def _read_live(self) -> None:
        path = self.wav_path
        try:
            size = path.stat().st_size
        except OSError:
            return
        offset = wav_data_offset_of(path)
        if offset is None:
            return
        start = max(self._live_off, offset)
        usable = (size - start) // 960 * 960
        if usable <= 0:
            return
        pcm = read_file_range(path, start, usable)
        samples = array.array("h")
        samples.frombytes(pcm[: len(pcm) // 2 * 2])
        if sys.byteorder != "little":
            samples.byteswap()
        self._live_peaks.extend(block_peaks(samples))
        self._live_off = start + len(pcm) // 960 * 960

    def _pull_live_peaks(self) -> None:
        """Prefer mic frames from ffmpeg's stdout. The WAV file is the fallback when that pipe is empty."""
        proc = self.capture
        live = getattr(proc, "live_peaks", None) if proc is not None else None
        if isinstance(live, list) and live:
            count = len(live)
            self._live_peaks = live[:count]
            return
        try:
            self._read_live()
        except Exception:
            pass

    def _tick(self) -> None:
        self._tick_id = None
        if self.recording:
            if self.capture is not None and self.capture.poll() is not None:
                self.capture = None
                self._stop_monitor()
                _drops, fatal = read_capture_log(self.wav_path, remove=False)
                reason = "Mikrofon przestał oddawać dźwięk (odłączony albo zajęty)."
                if fatal:
                    reason += f" Windows: {fatal[:100]}"
                self._keep_take(reason)
                return
            elapsed = self._rec_elapsed()
            cap = max_take_seconds(self.tier)
            head = self.rec_start + elapsed
            self._pull_live_peaks()
            self._follow(head)
            lane = self.rows[self.rec_track].get("lane") if 0 <= self.rec_track < len(self.rows) else None
            if isinstance(lane, tk.Canvas):
                self._paint_live_wave(lane, max(lane.winfo_height(), 4))
            self._grow_live()
            self._move_head(head)
            self.clock.set(f"{clock_text(head)}  ● {elapsed:.1f}/{cap} s")
            if elapsed >= cap:
                self._stop_monitor()
                if self.capture is not None:
                    stop_capture(self.capture)
                    self.capture = None
                self._keep_take(f"Plan {display_tier(self.tier)} kończy ujęcie po {cap} s.")
                return
            self._tick_id = self.root.after(40, self._tick)
            return
        if self.playing:
            ended = self.monitor is None or self.monitor.poll() is not None
            head = self._play_from + (time.monotonic() - self._play_t0)
            if ended:
                note = str(getattr(self.monitor, "note", "") or "")
                self.stop()
                if note:
                    self.status.set(note)
                return
            self._follow(head)
            self._move_head(head)
            self._tick_id = self.root.after(60, self._tick)

    # ---- done: studio or stems -----------------------------------------------

    def _send_list(self) -> tuple[list[tuple[int, Clip]], int, int]:
        """(track slot, clip) for every clip on heard tracks, plus muted track count and empty count."""
        any_solo = any(track.solo for track in self.tracks)
        out: list[tuple[int, Clip]] = []
        skipped = 0
        slot = 0
        for track in self.tracks:
            if not track.clips:
                continue
            if not self._heard(track, any_solo):
                skipped += 1
                continue
            out.extend((slot, clip) for clip in track.clips)
            slot += 1
        return out, skipped, slot

    def open_done(self) -> None:
        if self._busy():
            return
        if self.playing:
            self.stop()
        if self.studio_mode == "offline":
            self._open_done_offline()
            return
        clips, skipped, used = self._send_list()
        box = tk.Toplevel(self.root)
        box.title("Gotowe")
        box.configure(bg=PANEL)
        box.transient(self.root)
        box.resizable(False, False)
        tk.Label(box, text="Gotowe", bg=PANEL, fg=INK, font=(FONT_DISPLAY, 20, "italic")).pack(anchor="w", padx=16, pady=(12, 2))
        title, bpm, _seconds = self._beat_meta()
        summary = f"Bit: {title or 'nie wybrany'}. Z nagraniem: {count_word(used, 'ścieżka', 'ścieżki', 'ścieżek')}, {count_word(len(clips), 'klip', 'klipy', 'klipów')}."
        if skipped:
            summary += f" Wyciszone (M albo bez S) nie jadą: {skipped}."
        tk.Label(box, text=summary, bg=PANEL, fg=SOFT, font=(FONT_UI, 10), wraplength=440, justify="left").pack(anchor="w", padx=16)
        sends = tk.StringVar(value="Wysyłki do Studia dziś: sprawdzam…")
        tk.Label(box, textvariable=sends, bg=PANEL, fg=AMBER, font=(FONT_META, 9)).pack(anchor="w", padx=16, pady=(4, 0))

        def read_sends() -> None:
            try:
                info = self._client().desktop_send(False)
                text = f"Wysyłki do Studia dziś: {info.get('used')} z {info.get('limit')} (plan {display_tier(self.tier)})."
                if not info.get("allowed"):
                    text += " Limit na dziś wykorzystany."
            except Exception:
                text = "Wysyłki do Studia dziś: nie udało się sprawdzić."
            self.root.after(0, lambda: sends.set(text) if box.winfo_exists() else None)

        threading.Thread(target=read_sends, daemon=True).start()
        tk.Label(box, text="TYTUŁ", bg=PANEL, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w", padx=16, pady=(10, 0))
        tk.Entry(
            box, textvariable=self.title_var, bg=RACK, fg=INK, insertbackground=AMBER, relief="flat", font=(FONT_UI, 11), width=44,
        ).pack(fill="x", padx=16, ipady=4)

        def send() -> None:
            box.destroy()
            self.send_to_studio()

        def stems() -> None:
            box.destroy()
            self.export_stems()

        studio = self._tool(box, "WRZUĆ NAGRANIE DO STUDIA", send, ON_AMBER, AMBER, 14)
        studio.pack(fill="x", padx=16, pady=(14, 2))
        tk.Label(
            box, text="Tworzy projekt na koncie: bit i Twoje ścieżki w tych samych miejscach. Miks i mastering robisz w Studio na stronie.",
            bg=PANEL, fg=SOFT, font=(FONT_UI, 9), wraplength=440, justify="left",
        ).pack(anchor="w", padx=16)
        gold = self.tier == "GOLD"
        stem_button = self._tool(box, "POBIERZ STEMY (WAV)", stems, INK, RACK, 13)
        stem_button.pack(fill="x", padx=16, pady=(12, 2))
        if not gold:
            stem_button.configure(state="disabled", text="POBIERZ STEMY — TYLKO GOLD")
        tk.Label(
            box,
            text=("Każda ścieżka wokalu jako osobny WAV od 0:00, gotowy do innego programu." if gold else f"Twój plan: {display_tier(self.tier)}. Stemy z programu są w Gold."),
            bg=PANEL, fg=SOFT, font=(FONT_UI, 9), wraplength=440, justify="left",
        ).pack(anchor="w", padx=16)
        self._tool(box, "WRÓĆ DO EDYCJI", box.destroy, SOFT).pack(anchor="e", padx=16, pady=14)
        if not clips:
            studio.configure(state="disabled")
            stem_button.configure(state="disabled")
        _ = bpm

    def _render_clip_files(self, clips: list[tuple[int, Clip]]) -> tuple[list[Path], list[int], list[int]]:
        """One WAV per track (gaps are silence), split only where a track is longer than one take.

        Every WAV is one recording send on the site, and the plan allows a few per day.
        """
        folder = TAKES / "wysylka"
        folder.mkdir(parents=True, exist_ok=True)
        cap = float(max_take_seconds(self.tier))
        by_slot: dict[int, list[Clip]] = {}
        for slot, clip in clips:
            by_slot.setdefault(slot, []).append(clip)
        paths: list[Path] = []
        slots: list[int] = []
        starts: list[int] = []
        for slot in sorted(by_slot):
            for group in group_for_takes(ordered(by_slot[slot]), cap):
                begin, end = group[0].start, max(clip.end for clip in group)
                name = "-".join(clip_key(clip) for clip in group) + f"-{begin:.3f}"
                path = folder / f"tor-{hashlib.sha1(name.encode('utf-8')).hexdigest()[:16]}.wav"
                if not path.is_file():
                    samples = render(group, begin, end, self._load)
                    if len(samples) < 2:
                        raise RuntimeError("Jedna ze ścieżek jest pusta.")
                    replace_mono16(path, samples)
                paths.append(path)
                slots.append(slot)
                starts.append(int(round(begin * 1000)))
        return paths, slots, starts

    def _open_done_offline(self) -> None:
        clips = sum(len(track.clips) for track in self.tracks)
        vocals = sum(1 for track in self.tracks if track.role != "podbicie" and track.clips)
        extras = sum(1 for track in self.tracks if track.role == "podbicie" and track.clips)
        beat = offline_session.file_title(self.local_beat_path) if self.local_beat_path else "nie wybrany"
        box = tk.Toplevel(self.root)
        box.title("Gotowe")
        box.configure(bg=PANEL)
        box.transient(self.root)
        box.resizable(False, False)
        tk.Label(box, text="Gotowe · Offline", bg=PANEL, fg=INK, font=(FONT_DISPLAY, 20, "italic")).pack(anchor="w", padx=16, pady=(12, 2))
        summary = (
            f"Bit z pliku: {beat}. "
            f"Z nagraniem: {count_word(vocals, 'wokal', 'wokale', 'wokali')}, "
            f"{count_word(extras, 'podbicie', 'podbicia', 'podbić')}."
        )
        tk.Label(box, text=summary, bg=PANEL, fg=SOFT, font=(FONT_UI, 10), wraplength=460, justify="left").pack(anchor="w", padx=16)
        tk.Label(box, text="TYTUŁ", bg=PANEL, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w", padx=16, pady=(10, 0))
        tk.Entry(
            box, textvariable=self.title_var, bg=RACK, fg=INK, insertbackground=AMBER, relief="flat", font=(FONT_UI, 11), width=48,
        ).pack(fill="x", padx=16, ipady=4)

        def save_brd() -> None:
            box.destroy()
            self.save_project()

        def save() -> None:
            box.destroy()
            self.save_offline_pack()

        button = self._tool(box, "ZAPISZ PROJEKT .brd1", save_brd, ON_AMBER, AMBER, 14)
        button.pack(fill="x", padx=16, pady=(14, 2))
        if clips == 0:
            button.configure(state="disabled")
        tk.Label(
            box,
            text=(
                "Jeden plik .brd1: sesja i ścieżki WAV, czysta nagrywka od 0:00, bez bitu. "
                "Przed zapisem potwierdzasz, że bit i nagrania są Twoje albo masz zgodę. Program tego nie sprawdza."
            ),
            bg=PANEL, fg=SOFT, font=(FONT_UI, 9), wraplength=460, justify="left",
        ).pack(anchor="w", padx=16, pady=(4, 0))
        stem_button = self._tool(box, "ZAPISZ STEMY I SESJĘ", save, INK, RACK, 13)
        stem_button.pack(fill="x", padx=16, pady=(10, 2))
        if clips == 0:
            stem_button.configure(state="disabled")
        tk.Label(
            box,
            text=(
                "Albo folder: osobny WAV każdej ścieżki od 0:00 i sesja.brd.json. "
                "Też bez bitu. To samo potwierdzenie praw."
            ),
            bg=PANEL, fg=SOFT, font=(FONT_UI, 9), wraplength=460, justify="left",
        ).pack(anchor="w", padx=16, pady=(4, 0))
        tk.Label(
            box, text=offline_session.RIGHTS_NOTE, bg=PANEL, fg=MUTE, font=(FONT_UI, 9), wraplength=460, justify="left",
        ).pack(anchor="w", padx=16, pady=(8, 0))
        self._tool(box, "WRÓĆ DO EDYCJI", box.destroy, SOFT).pack(anchor="e", padx=16, pady=14)

    def _project_worth_saving(self) -> bool:
        return self.recording or any(track.clips for track in self.tracks)

    def _confirm_rights(self) -> bool:
        """Checkbox. Saving without it would skip the only record that the user, not the service, is responsible."""
        box = tk.Toplevel(self.root)
        box.title("Prawa")
        box.configure(bg=PANEL)
        box.transient(self.root)
        box.resizable(False, False)
        box.grab_set()
        accepted = tk.BooleanVar(value=False)
        result = {"ok": False}
        tk.Label(box, text="Prawa do bitu i nagrań", bg=PANEL, fg=INK, font=(FONT_DISPLAY, 18, "italic")).pack(anchor="w", padx=16, pady=(12, 6))
        tk.Label(
            box, text=offline_session.RIGHTS_ACCEPT, bg=PANEL, fg=INK, font=(FONT_UI, 10), wraplength=460, justify="left",
        ).pack(anchor="w", padx=16)
        tk.Checkbutton(
            box, text="Zaznaczam to. Odpowiadam ja, nie serwis.", variable=accepted, bg=PANEL, fg=INK,
            activebackground=PANEL, activeforeground=INK, selectcolor=RACK, font=(FONT_UI, 10), anchor="w",
        ).pack(anchor="w", padx=16, pady=(10, 0))
        warn = tk.StringVar(value="")
        tk.Label(box, textvariable=warn, bg=PANEL, fg=REC, font=(FONT_UI, 9), wraplength=460, justify="left").pack(anchor="w", padx=16, pady=(6, 0))

        def go() -> None:
            if not accepted.get():
                warn.set("Bez zaznaczenia nie zapisuję. Program i strona nie sprawdzają pliku.")
                return
            result["ok"] = True
            box.destroy()

        def cancel() -> None:
            box.destroy()

        row = tk.Frame(box, bg=PANEL)
        row.pack(fill="x", padx=16, pady=14)
        self._tool(row, "ZAPISZ", go, ON_AMBER, AMBER, 13).pack(side="right")
        self._tool(row, "WRÓĆ", cancel, SOFT).pack(side="right", padx=(0, 8))
        box.protocol("WM_DELETE_WINDOW", cancel)
        self.root.wait_window(box)
        return result["ok"]

    def _offline_bundle(self) -> tuple[dict[str, object], list[tuple[str, list[Clip], float]]] | None:
        used = [track for track in self.tracks if track.clips]
        if not used:
            self.status.set("Najpierw nagraj ścieżkę.")
            return None
        title = self.title_var.get().strip() or "Nagranie"
        end = max((track_end(track.clips) for track in used), default=0.0)
        end = max(end, self.local_beat_seconds, 0.05)
        rows: list[dict[str, object]] = []
        for track in used:
            rows.append(
                {
                    "name": track.name,
                    "role": track.role,
                    "gain_db": track.gain_db,
                    "pan": track.pan,
                    "muted": track.muted,
                    "solo": track.solo,
                    "clips": [{"start": clip.start, "in": clip.src_in, "out": clip.src_out, "end": clip.end} for clip in track.clips],
                }
            )
        document = offline_session.build_session(
            title=title,
            beat_file_name=self.local_beat_path,
            beat_seconds=self.local_beat_seconds,
            beat_gain_db=self.beat_gain_db,
            beat_muted=self.beat_muted,
            tracks=rows,
            beat_pan=self.beat_pan,
            saved_at=datetime.now().astimezone().isoformat(timespec="seconds"),
        )
        built = document.get("tracks")
        if not isinstance(built, list) or len(built) != len(used):
            self.status.set("Nie dało się złożyć pliku sesji.")
            return None
        jobs: list[tuple[str, list[Clip], float]] = []
        for item, track in zip(built, used):
            if not isinstance(item, dict) or not item.get("stem"):
                self.status.set("Nie dało się złożyć pliku sesji.")
                return None
            jobs.append((str(item["stem"]), list(track.clips), end))
        return document, jobs

    def save_project(self) -> bool:
        """Write one .brd1. False means the window should stay (cancelled or failed)."""
        if self.studio_mode != "offline":
            return False
        if self.tier != "GOLD":
            self.status.set("Zapis projektu jest w planie Premium Gold.")
            return False
        if self._arming:
            self.status.set("Najpierw Stop.")
            return False
        if self._exporting:
            self.status.set("Zapis już trwa.")
            return False
        if self.playing or self.recording:
            self.stop()
        bundled = self._offline_bundle()
        if bundled is None:
            return False
        if not self._confirm_rights():
            return False
        document, jobs = bundled
        path = filedialog.asksaveasfilename(
            title="Zapisz projekt",
            defaultextension=offline_session.PROJECT_SUFFIX,
            filetypes=[("Projekt BitRymDym", f"*{offline_session.PROJECT_SUFFIX}")],
            initialfile=safe_name(self.title_var.get().strip() or "projekt") + offline_session.PROJECT_SUFFIX,
        )
        if not path:
            return False
        if not str(path).lower().endswith(offline_session.PROJECT_SUFFIX):
            path = str(path) + offline_session.PROJECT_SUFFIX
        self._exporting = True
        self.status.set("Zapisuję projekt…")
        self.root.update_idletasks()
        error = ""
        try:
            stems: dict[str, bytes] = {}
            for stem, clips, end in jobs:
                samples = render(clips, 0.0, end, self._load)
                if len(samples) < 2:
                    raise RuntimeError("pusta ścieżka")
                stems[stem] = mono16_wav_bytes(samples)
            offline_session.write_project(Path(path), document, stems)
        except Exception as problem:
            error = str(problem) or "zapis"
        self._exporting = False
        if error:
            self.status.set(f"Projekt się nie zapisał ({error[:80]}).")
            return False
        self._save_desk()
        self.status.set(f"Projekt zapisany: {path}. Bitu w pliku nie ma. Na stronę stąd nic nie poszło.")
        return True

    def save_offline_pack(self) -> None:
        if self.studio_mode != "offline":
            return
        if self.tier != "GOLD":
            self.status.set("Zapis sesji offline jest w planie Premium Gold.")
            return
        if self._exporting:
            return
        if self._arming:
            self.status.set("Najpierw Stop.")
            return
        if self.playing or self.recording:
            self.stop()
        bundled = self._offline_bundle()
        if bundled is None:
            return
        if not self._confirm_rights():
            return
        document, jobs = bundled
        folder = filedialog.askdirectory(title="Folder na stemy i sesję")
        if not folder:
            return
        document = offline_session.accept_rights(document)
        self._exporting = True
        self._save_desk()
        self.status.set("Zapisuję stemy i sesję…")
        threading.Thread(target=self._run_offline_pack, args=(Path(folder), document, jobs), daemon=True).start()

    def _run_offline_pack(self, folder: Path, document: dict[str, object], jobs: list[tuple[str, list[Clip], float]]) -> None:
        written: list[str] = []
        error = ""
        try:
            folder.mkdir(parents=True, exist_ok=True)
            for stem, clips, end in jobs:
                samples = render(clips, 0.0, end, self._load)
                target = folder / stem
                replace_mono16(target, samples)
                written.append(target.name)
            offline_session.write_session(folder, document)
        except Exception as problem:
            error = str(problem) or "zapis"

        def done() -> None:
            self._exporting = False
            if error:
                self.status.set(f"Sesja: zapisane {len(written)} stemów, potem błąd ({error[:80]}).")
                return
            self.status.set(
                f"Zapisane: {len(written)} stemów i {offline_session.FILE_NAME} w {folder}. "
                "Bit nie jest w tym folderze. Na www.bitrymdym.pl → Studio wczytaj sesję, utwórz projekt i w Gold wrzuć stemy."
            )

        self.root.after(0, done)

    def load_offline_pack(self) -> None:
        if self.studio_mode != "offline" or self._busy() or self._exporting:
            return
        path = filedialog.askopenfilename(
            title="Projekt albo sesja",
            filetypes=[
                ("Projekt lub sesja BitRymDym", "*.brd1 *.json"),
                ("Projekt BitRymDym", "*.brd1"),
                ("Sesja BitRymDym", "*.json"),
                ("Wszystkie pliki", "*.*"),
            ],
        )
        if not path:
            return
        target = Path(path)
        if target.suffix.lower() == offline_session.PROJECT_SUFFIX:
            opened = offline_session.read_project(target)
            if opened is None:
                self.status.set("To nie jest projekt BitRymDym (.brd1). Plik z bitem w środku jest odrzucany.")
                return
            document, stems = opened
            digest = hashlib.sha1(str(target.resolve()).encode("utf-8")).hexdigest()[:12]
            folder = TAKES / "projekty" / digest
            try:
                folder.mkdir(parents=True, exist_ok=True)
                for name, data in stems.items():
                    piece = Path(name).name
                    if piece != name or not piece.endswith(".wav") or not data.startswith(b"RIFF"):
                        raise ValueError("stem")
                    (folder / piece).write_bytes(data)
            except (OSError, ValueError):
                self.status.set("Nie dało się rozpakować projektu.")
                return
            self._install_offline_session(document, folder)
            return
        try:
            raw = json.loads(target.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self.status.set("Nie dało się odczytać pliku sesji.")
            return
        document = offline_session.parse_session(raw)
        if document is None:
            self.status.set("To nie jest sesja BitRymDym (sesja.brd.json).")
            return
        self._install_offline_session(document, target.parent)

    def _install_offline_session(self, document: dict[str, object], folder: Path) -> None:
        tracks = document.get("tracks")
        if not isinstance(tracks, list) or not tracks:
            self.status.set("W sesji nie ma ścieżek z nagraniem.")
            return
        have = sum(len(track.clips) for track in self.tracks)
        if have and not messagebox.askyesno("BitRymDym", "Wczytać sesję? Ścieżki teraz na ekranie zejdą z programu (pliki nagrań na dysku zostają)."):
            return
        loaded: list[Track] = []
        missing = 0
        for item in tracks:
            if not isinstance(item, dict):
                continue
            stem = str(item.get("stem") or "")
            wav = folder / stem
            if not wav.is_file():
                missing += 1
                continue
            seconds = file_seconds(wav)
            if seconds < 0.05:
                missing += 1
                continue
            track = Track(
                name=str(item.get("name") or "Ścieżka")[:40],
                color=TRACK_COLORS[len(loaded) % len(TRACK_COLORS)],
                role="podbicie" if item.get("role") == "podbicie" else "wokal",
                gain_db=offline_session.clamp_gain(item.get("gainDb")),
                pan=offline_session.clamp_pan(item.get("pan")),
                muted=bool(item.get("muted")),
                solo=bool(item.get("solo")),
                clips=[Clip(str(wav), 0.0, 0.0, round(seconds, 4))],
            )
            loaded.append(track)
        if not loaded:
            self.status.set("Nie ma stemów WAV do wczytania. Przy sesji trzymaj je w jednym folderze z plikiem json.")
            return
        self._push_undo()
        self.tracks = loaded
        self.sel = None
        self.cursor = 0.0
        self.view = 0.0
        self.armed = 0
        self.focus = 0
        title = document.get("title")
        if isinstance(title, str) and title.strip():
            self.title_var.set(title)
        beat = document.get("beat")
        beat_name = ""
        if isinstance(beat, dict):
            beat_name = str(beat.get("fileName") or "")
            self.beat_gain_db = offline_session.clamp_gain(beat.get("gainDb"))
            self.beat_pan = offline_session.clamp_pan(beat.get("pan"))
            self.beat_muted = bool(beat.get("muted"))
            if isinstance(beat.get("durationSeconds"), (int, float)):
                self.local_beat_seconds = max(0.0, float(beat["durationSeconds"]))
        self.local_beat_path = ""
        self._beat_peaks = []
        self._beat_peak_path = ""
        self.beat_var.set("")
        if hasattr(self, "beat_gain_scale"):
            self.beat_gain_scale.set(self.beat_gain_db)
            self.beat_gain_label.configure(text=f"{self.beat_gain_db:+.0f}")
        if hasattr(self, "beat_pan_scale"):
            self.beat_pan_scale.set(max(-100.0, min(100.0, self.beat_pan * 100)))
            self.beat_pan_label.configure(text=offline_session.pan_text(self.beat_pan))
        self._rebuild_rows()
        self._save_desk()
        extra = f" Brak {missing} plików obok sesji." if missing else ""
        named = f" Bit z sesji nazywa się „{beat_name}” — wskaż ten plik jeszcze raz, do paczki go nie dodajemy." if beat_name else ""
        self.status.set(f"Wczytane stemy od 0:00. Głośność i balans są na ścieżkach.{extra}{named}")

    def send_to_studio(self) -> None:
        if self.studio_mode == "offline":
            self.status.set("Studio Offline nie wysyła na stronę. Zapisz projekt .brd1 albo stemy, potem wrzuć je ręcznie w Studio na www.bitrymdym.pl.")
            return
        if self._uploading:
            self.status.set("Wysyłka już trwa.")
            return
        try:
            self.token()
            beat_id = self.selected_beat_id()
            title = self.title_var.get().strip()
            if not title:
                raise RuntimeError("Wpisz tytuł.")
            clips, _skipped, used = self._send_list()
            if not clips:
                raise RuntimeError("Najpierw nagraj coś na ścieżce.")
            cap = self._track_cap()
            if used > cap:
                raise RuntimeError(f"Plan {display_tier(self.tier)} mieści {cap} ścieżek, a z nagraniem jest {used}. Wycisz albo usuń nadmiar.")
        except RuntimeError as error:
            self.status.set(str(error))
            return
        self._save_prefs()
        self._save_desk()
        self._uploading = True
        self.done_button.configure(state="disabled")
        self.status.set("Przygotowuję klipy do wysyłki…")
        threading.Thread(target=self._run_upload, args=(title, beat_id, clips), daemon=True).start()

    def _remember_state(self, state: UploadState) -> None:
        self._pending = state
        save_pending(state)

    def _upload_say(self, text: str) -> None:
        self.root.after(0, lambda: self.status.set(text) if self._uploading else None)

    def _run_upload(self, title: str, beat_id: str, clips: list[tuple[int, Clip]]) -> None:
        try:
            paths, slots, starts = self._render_clip_files(clips)
            resume = self._pending if self._pending is not None and self._pending.wav_paths == [str(path) for path in paths] else None
            if self._pending is not None and resume is None:
                self._pending = None
                clear_pending()
            if resume is not None:
                title, beat_id = resume.title, resume.beat_id
            client = self._client()
            send_id = resume.send_id if resume is not None and resume.send_id else ""
            if not send_id:
                # One daily "Wrzuć do Studia" of the Windows recorder, spent before anything is sent.
                self._upload_say("Sprawdzam dzienny limit wysyłek do Studia.")
                claimed = client.desktop_send(True)
                send_id = str(claimed.get("sendId") or "")
                self._upload_say(f"Wysyłka {claimed.get('used')} z {claimed.get('limit')} na dziś.")
            project = upload_vocals(
                client,
                title=title,
                beat_id=beat_id,
                wav_paths=paths,
                track_of=slots,
                starts_ms=starts,
                send_id=send_id,
                progress=self._upload_say,
                resume=resume,
                on_state=self._remember_state,
            )
        except Exception as error:
            message = str(error)
            self.root.after(0, lambda: self._upload_done(None, message))
            return
        self.root.after(0, lambda: self._upload_done(project, ""))

    def _upload_done(self, project: str | None, error: str) -> None:
        self._uploading = False
        self.done_button.configure(state="normal")
        if project is None:
            hint = " Gotowe i Wrzuć do Studia dokończy wysyłkę." if self._pending is not None else ""
            self.status.set(friendly_upload_error(self._safe_listen_error(RuntimeError(error or "Wysyłka się nie udała."))) + hint)
            return
        self._pending = None
        clear_pending()
        self.project_id = project
        self.status.set("Nagranie jest w Studio na koncie. Otwieram projekt w przeglądarce: tam miks i mastering.")
        webbrowser.open(studio_url(SITE, project))

    def export_stems(self) -> None:
        if self.studio_mode == "offline":
            self.save_offline_pack()
            return
        if self.tier != "GOLD":
            self.status.set("Stemy z programu są w planie Gold.")
            return
        if self._exporting:
            return
        folder = filedialog.askdirectory(title="Folder na stemy")
        if not folder:
            return
        title = self.title_var.get().strip() or "nagranie"
        jobs = [(track.name, list(track.clips)) for track in self.tracks if track.clips]
        self._exporting = True
        self.status.set("Zapisuję stemy…")
        threading.Thread(target=self._run_stems, args=(Path(folder), title, jobs), daemon=True).start()

    def _run_stems(self, folder: Path, title: str, jobs: list[tuple[str, list[Clip]]]) -> None:
        written: list[str] = []
        error = ""
        try:
            folder.mkdir(parents=True, exist_ok=True)
            for number, (name, clips) in enumerate(jobs, start=1):
                samples = render(clips, 0.0, track_end(clips), self._load)
                target = folder / f"{safe_name(title)}_{number:02d}_{safe_name(name)}.wav"
                replace_mono16(target, samples)
                written.append(target.name)
        except Exception as problem:
            error = str(problem) or "zapis"

        def done() -> None:
            self._exporting = False
            if error:
                self.status.set(f"Stemy: zapisane {len(written)}, potem błąd ({error[:80]}).")
            else:
                self.status.set(
                    f"Stemy zapisane ({len(written)} plików WAV, 48 kHz mono, od 0:00) w {folder}. Bitu tu nie ma: jest w Studio w ZIP projektu."
                )

        self.root.after(0, done)

    # ---- small shared bits ------------------------------------------------------

    def _stop_monitor(self) -> None:
        stop_monitor(self.monitor)
        stop_monitor(self.mix_feed)
        self.monitor = None
        self.mix_feed = None

    def _cancel_tick(self) -> None:
        if self._tick_id:
            self.root.after_cancel(self._tick_id)
            self._tick_id = None

    def _busy_for_update(self) -> bool:
        return self.recording or self._arming or self._uploading or self._probing or self._exporting

    # ---- kept: frame, sign-in, updates, mic check ----

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
        about = tk.Label(bar, text="O programie", bg=PAPER, fg=SOFT, font=(FONT_UI, 10), cursor="hand2")
        about.pack(side="right", padx=(0, 6))
        about.bind("<Enter>", lambda _event: about.configure(fg=AMBER))
        about.bind("<Leave>", lambda _event: about.configure(fg=SOFT))
        about.bind("<Button-1>", lambda _event: self.show_about())
        for widget in (bar, title):
            widget.bind("<Button-1>", self._drag_start)
            widget.bind("<B1-Motion>", self._drag_move)
            widget.bind("<Double-Button-1>", lambda _event: self._toggle_zoom())
        rule = tk.Frame(self.shell, bg=AMBER, height=2)
        rule.pack(side="top", fill="x")
        rule.pack_propagate(False)
        grip = tk.Frame(self.shell, bg=AMBER_DEEP, cursor="size_nw_se", width=14, height=14)
        self._resize_grip = grip
        grip.place(relx=1.0, rely=1.0, anchor="se")
        grip.bind("<Button-1>", self._resize_start)
        grip.bind("<B1-Motion>", self._resize_move)
        self.root.bind("<Map>", self._on_map)
        self.root.after(50, self._own_taskbar)

    def _build_footer(self) -> None:
        """Version at the bottom left, credit beside it. A strip, not a label on the lanes."""
        bar = tk.Frame(self.shell, bg=PAPER)
        bar.pack(side="bottom", fill="x")
        tk.Frame(bar, bg=LINE, height=1).pack(fill="x")
        row = tk.Frame(bar, bg=PAPER)
        row.pack(fill="x", padx=(10, 18), pady=(3, 4))
        tk.Label(row, text=updater.APP_VERSION, bg=PAPER, fg=MUTE, font=(FONT_META, 8)).pack(side="left")
        tk.Label(row, text=FOOTER_CREDIT, bg=PAPER, fg=MUTE, font=(FONT_META, 8)).pack(side="left", padx=(12, 0))
        grip = getattr(self, "_resize_grip", None)
        if grip is not None:
            grip.lift()

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

    def _open_site(self, path: str) -> None:
        webbrowser.open(f"{SITE}{path}")

    def show_about(self) -> None:
        """Who runs the service, how the two studios work, and the legal pages. One box, no second mode."""
        existing = getattr(self, "_about_box", None)
        if existing is not None:
            try:
                if int(existing.winfo_exists()):
                    existing.lift()
                    existing.focus_force()
                    return
            except tk.TclError:
                pass
        box = tk.Toplevel(self.root)
        self._about_box = box
        box.title("O programie")
        box.configure(bg=PAPER)
        box.transient(self.root)
        box.resizable(False, False)
        head = tk.Frame(box, bg=PAPER)
        head.pack(fill="x", padx=18, pady=(14, 4))
        tk.Label(head, text="O programie", bg=PAPER, fg=INK, font=(FONT_DISPLAY, 18, "italic")).pack(anchor="w")
        tk.Label(head, text=f"Wersja {updater.APP_VERSION}", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w")
        body = tk.Frame(box, bg=PAPER)
        body.pack(fill="both", expand=True, padx=18, pady=(6, 4))
        tk.Label(body, text="JAK DZIAŁA", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w")
        tk.Label(
            body,
            text=(
                "Studio Online: jedna lista bitów na koncie (darmowe, własne i kupione). "
                "Szukasz po nazwie. Liczba ścieżek zależy od planu. Nagranie można wrzucić do Studia na stronie. "
                "Miks i mastering są na stronie.\n\n"
                "Studio Offline: tylko Premium Gold. Bit zostaje plikiem na tym komputerze, program go nie wysyła. "
                "16 ścieżek wokalu i 6 na podbicia i adliby. Projekt zapisujesz jako .brd1 albo jako stemy. "
                "Program nie sprawdza, czy bit i wokal są Twoje. Jak wrzucisz na serwis cudzy bit, odpowiadasz za to Ty."
            ),
            bg=PAPER, fg=SOFT, font=(FONT_UI, 10), wraplength=480, justify="left",
        ).pack(anchor="w", pady=(2, 10))
        tk.Label(body, text="KTO PROWADZI SERWIS", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w")
        tk.Label(body, text=ABOUT_OPERATOR, bg=PAPER, fg=INK, font=(FONT_UI, 10), wraplength=480, justify="left").pack(anchor="w", pady=(2, 10))
        tk.Label(body, text="DOKUMENTY", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w")
        for label, path in ABOUT_LINKS:
            link = tk.Label(
                body, text=label, bg=PAPER, fg=AMBER, cursor="hand2",
                font=tkfont.Font(box, family=FONT_UI, size=11, underline=True),
            )
            link.pack(anchor="w", pady=1)
            link.bind("<Button-1>", lambda _event, target=path: self._open_site(target))
        self._tool(box, "ZAMKNIJ", box.destroy, INK).pack(anchor="e", padx=18, pady=(8, 14))
        box.update_idletasks()
        box.geometry(f"+{self.root.winfo_rootx() + 36}+{self.root.winfo_rooty() + 48}")

    def _about_chip(self, parent: tk.Widget) -> tk.Label:
        label = tk.Label(
            parent, text="O programie", bg=PAPER, fg=AMBER, cursor="hand2",
            font=tkfont.Font(self.root, family=FONT_UI, size=11, underline=True),
        )
        label.bind("<Button-1>", lambda _event: self.show_about())
        return label

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
        stage = tk.Frame(self.gate, bg=PAPER)
        stage.pack(expand=True)
        card = tk.Frame(stage, bg=PAPER)
        card.pack(padx=36, pady=24)
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
        self.remember_login = tk.IntVar(value=0 if saved and saved.get("remember") == "0" else 1)
        tk.Checkbutton(
            card,
            text="Zapamiętaj logowanie na tym komputerze",
            variable=self.remember_login,
            bg=PAPER,
            fg=INK,
            selectcolor=RACK,
            activebackground=PAPER,
            activeforeground=INK,
            font=(FONT_UI, 10),
            anchor="w",
            highlightthickness=0,
            bd=0,
        ).pack(anchor="w", pady=(0, 2))
        tk.Label(
            card,
            text="Bez zaznaczenia po zamknięciu programu trzeba wpisać hasło jeszcze raz.",
            bg=PAPER,
            fg=MUTE,
            font=(FONT_UI, 9),
            wraplength=380,
            justify="left",
        ).pack(anchor="w", pady=(0, 8))
        self._link(card, "Nie pamiętam hasła", "/forgot-password").pack(anchor="w", pady=(2, 10))
        bottom = tk.Frame(card, bg=PAPER)
        bottom.pack(anchor="w")
        tk.Label(bottom, text="Nie masz konta?", bg=PAPER, fg=SOFT, font=(FONT_UI, 11)).pack(side="left")
        self._link(bottom, "Zarejestruj się", "/sign-up").pack(side="left", padx=(6, 0))
        self._about_chip(card).pack(anchor="w", pady=(10, 0))
        tk.Label(
            card,
            textvariable=self.gate_status,
            bg=PAPER,
            fg=INK,
            font=(FONT_UI, 10),
            wraplength=380,
            justify="left",
        ).pack(anchor="w", pady=(12, 0))

    def _build_modes(self) -> None:
        self.modes = tk.Frame(self.shell, bg=PAPER)
        self.modes_canvas = tk.Canvas(self.modes, bg=PAPER, highlightthickness=0, bd=0)
        scroll = ttk.Scrollbar(self.modes, command=self.modes_canvas.yview, style="Brd.Vertical.TScrollbar")
        self.modes_canvas.configure(yscrollcommand=scroll.set)
        scroll.pack(side="right", fill="y")
        self.modes_canvas.pack(side="left", fill="both", expand=True)
        inner = tk.Frame(self.modes_canvas, bg=PAPER)
        window = self.modes_canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda _event: self.modes_canvas.configure(scrollregion=self.modes_canvas.bbox("all")))
        self.modes_canvas.bind("<Configure>", lambda event: self.modes_canvas.itemconfigure(window, width=event.width))
        head = tk.Frame(inner, bg=PAPER)
        head.pack(fill="x", padx=28, pady=(16, 4))
        tk.Label(head, text="Gdzie nagrywasz?", bg=PAPER, fg=INK, font=(FONT_DISPLAY, 22, "italic")).pack(anchor="w")
        self.mode_account = tk.StringVar(value="")
        tk.Label(head, textvariable=self.mode_account, bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w", pady=(2, 6))

        row = tk.Frame(inner, bg=PAPER)
        row.pack(anchor="center", pady=(4, 8))
        online = tk.Frame(row, bg=PANEL, highlightthickness=1, highlightbackground=LINE, width=440)
        online.pack(side="left", anchor="n", padx=10, ipadx=4)
        tk.Label(online, text="STUDIO ONLINE", bg=PANEL, fg=AMBER, font=(FONT_POSTER, 16, "bold")).pack(anchor="w", padx=14, pady=(12, 2))
        tk.Label(
            online,
            text=(
                "Gotowe darmowe bity.\n"
                "Katalog bitów, które sam wgrałeś.\n"
                "Wykupione płatne bity.\n"
                "Jedna lista, szukasz po nazwie. Ścieżki według planu. "
                "Na końcu możesz wrzucić nagranie do Studia. Miks i mastering są na stronie."
            ),
            bg=PANEL, fg=SOFT, font=(FONT_UI, 10), wraplength=400, justify="left",
        ).pack(anchor="w", padx=14, pady=(0, 8))
        self._tool(online, "WEJDŹ", lambda: self.choose_mode("online"), ON_AMBER, AMBER, 14).pack(anchor="w", padx=14, pady=(0, 14))

        offline = tk.Frame(row, bg=PANEL, highlightthickness=1, highlightbackground=AMBER_DEEP, width=440)
        offline.pack(side="left", anchor="n", padx=10, ipadx=4)
        tk.Label(offline, text="STUDIO OFFLINE", bg=PANEL, fg=AMBER, font=(FONT_POSTER, 16, "bold")).pack(anchor="w", padx=14, pady=(12, 0))
        tk.Label(offline, text="PREMIUM GOLD", bg=PANEL, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w", padx=14)
        tk.Label(
            offline,
            text=(
                "Tylko swój bit z pliku, na tym komputerze.\n"
                "16 ścieżek wokalu i 6 na podbicia i adliby.\n"
                "Mikrofon i odsłuch osobno: też Bluetooth, na przykład iPhone, "
                "i słuchawki albo głośniki z innego urządzenia.\n"
                "Czysta nagrywka i prosta edycja. Bez automatycznego miksu, masteringu i bez wysyłki na stronę."
            ),
            bg=PANEL, fg=SOFT, font=(FONT_UI, 10), wraplength=400, justify="left",
        ).pack(anchor="w", padx=14, pady=(6, 8))
        self.offline_enter = tk.Button(
            offline, text="WEJDŹ", command=lambda: self.choose_mode("offline"),
            bg=AMBER, fg=ON_AMBER, activebackground=AMBER_SOFT, activeforeground=ON_AMBER,
            relief="flat", bd=0, padx=12, pady=6, font=(FONT_POSTER, 14, "bold"), cursor="hand2",
        )
        self.offline_enter.pack(anchor="w", padx=14, pady=(0, 14))

        foot = tk.Frame(inner, bg=PAPER)
        foot.pack(fill="x", padx=36, pady=(4, 16))
        tk.Label(foot, text="PRAWA", bg=PAPER, fg=MUTE, font=(FONT_META, 9)).pack(anchor="w", pady=(6, 2))
        tk.Label(
            foot, text=offline_session.RIGHTS_NOTE, bg=PAPER, fg=SOFT, font=(FONT_UI, 10), wraplength=920, justify="left",
        ).pack(anchor="w")
        links = tk.Frame(foot, bg=PAPER)
        links.pack(anchor="w", pady=(10, 4))
        self._link(links, "Studio na stronie", "/studio").pack(side="left")
        self._link(links, "Premium", "/premium").pack(side="left", padx=(14, 0))
        self._about_chip(links).pack(side="left", padx=(14, 0))
        self.mode_status = tk.StringVar(value="")
        tk.Label(foot, textvariable=self.mode_status, bg=PAPER, fg=INK, font=(FONT_UI, 10), wraplength=920, justify="left").pack(anchor="w", pady=(8, 0))
        self._tool(foot, "WYLOGUJ", self.sign_out, SOFT).pack(anchor="w", pady=(12, 0))

    def choose_mode(self, mode: str) -> None:
        if mode == "offline" and self.tier != "GOLD":
            self.mode_status.set("Studio Offline jest w planie Premium Gold.")
            return
        if mode not in ("online", "offline"):
            return
        if mode != self.studio_mode:
            if self._touched:
                self._save_desk()
            self.studio_mode = mode
            self._restore_desk()
        self._apply_mode_chrome()
        self.show_studio()

    def back_to_modes(self) -> None:
        if self._busy() or self._uploading or self._exporting:
            return
        if self.playing:
            self.stop()
        if self._touched:
            self._save_desk()
        self.show_modes()

    def _apply_mode_chrome(self) -> None:
        if self.studio_mode == "offline":
            self.studio_kicker.set("STUDIO OFFLINE")
            self.plan_text.set(self._offline_plan_line())
            if not self.load_session_button.winfo_manager():
                self.load_session_button.pack(side="right", padx=(0, 6))
            if not self.save_project_button.winfo_manager():
                self.save_project_button.pack(side="right", padx=(0, 6))
        else:
            self.studio_kicker.set("STUDIO ONLINE")
            self.save_project_button.pack_forget()
            self.load_session_button.pack_forget()
            self._read_plan()
        self._sync_beat_button()
        self._sync_add_button()
        self._paint_all()

    def _offline_plan_line(self) -> str:
        return "Gold · 16 wokali + 6 podbić i adlibów. Czysta nagrywka, bez miksu i masteringu."

    def _style_option(self, menu: tk.OptionMenu, width: int) -> None:
        menu.configure(
            bg=RACK, fg=INK, activebackground=PANEL, activeforeground=INK, highlightthickness=1,
            highlightbackground=LINE, font=(FONT_UI, 10), relief="flat", bd=0, anchor="w", width=width,
        )
        menu["menu"].configure(bg=RACK, fg=INK, activebackground=AMBER, activeforeground=ON_AMBER, font=(FONT_UI, 10))

    def _fill_option(self, menu: tk.OptionMenu, variable: tk.StringVar, labels: list[str], preferred: str) -> None:
        choices = labels or ["Brak"]
        widget = menu["menu"]
        widget.delete(0, "end")
        for label in choices:
            widget.add_command(label=label, command=lambda value=label: variable.set(value))
        variable.set(preferred if preferred in choices else choices[0])

    def _boot_background(self) -> None:
        if os.environ.get("BITRYMDYM_UI_SMOKE") == "1":
            return
        threading.Thread(target=self._boot_worker, daemon=True).start()

    def _boot_worker(self) -> None:
        devices: list[str] = []
        device_error = ""
        try:
            devices = audio_devices(ffmpeg_exe())
        except Exception as error:
            device_error = str(error)
        outputs = [("Domyślne", -1), *win_output.output_devices()]
        payload: dict[str, object] | None = None
        net_error = ""
        try:
            loaded = load_bootstrap()
            if isinstance(loaded, dict):
                payload = loaded
        except Exception as error:
            net_error = str(error)
        resume, resume_error = self._resume_saved_session()
        self.root.after(0, lambda: self._apply_boot(devices, device_error, outputs, payload, net_error, resume, resume_error))

    def _apply_boot(
        self,
        devices: list[str],
        device_error: str,
        outputs: list[tuple[str, int]],
        payload: dict[str, object] | None,
        net_error: str,
        resume: str = "",
        resume_error: str = "",
    ) -> None:
        self.devices = devices
        self.outputs = outputs or [("Domyślne", -1)]
        self._fill_option(self.device_menu, self.device_var, self.devices or ["Brak mikrofonu"], self._pref_device)
        self._fill_option(
            self.output_menu, self.output_var, [name for name, _index in self.outputs], self._pref_output or "Domyślne"
        )
        if payload is not None:
            self._apply_public(payload)
            self._restore_catalog_beat()
        elif net_error:
            self.gate_status.set(net_error)
            self.status.set(net_error)
        if device_error and not self.devices:
            self.probe_var.set(device_error)
        elif not self.probe_var.get().startswith("Poziom"):
            self.probe_var.set("Mikrofon i słuchawki mogą być z różnych urządzeń, też Bluetooth.")
        self._gear_scanning = False
        if resume == "ok" and self.gate.winfo_manager():
            self.password.delete(0, "end")
            self.gate_status.set("")
            self.status.set("Zalogowano. Wybierz Studio Online albo Studio Offline.")
            self.show_modes()
        elif resume == "dead":
            self.gate_status.set(resume_error)
            self.status.set(resume_error)
        elif resume == "net":
            self.gate_status.set(resume_error)
            self.status.set(resume_error)
        elif self.gate.winfo_manager() and self.gate_status.get() == "Łączę ze stroną.":
            self.gate_status.set("")
        self._read_plan()

    def _resume_saved_session(self) -> tuple[str, str]:
        """Check the saved login before the window asks for a password. Network only, no Tk."""
        saved = load_session()
        if not saved or not saved.get("refreshToken") or not saved.get("supabaseUrl") or not saved.get("anonKey"):
            return "", ""
        if not wants_remember(saved.get("remember")):
            forget_tokens(saved, remember="0")
            return "", ""
        try:
            grant = supabase_refresh_grant(saved["supabaseUrl"], saved["anonKey"], saved["refreshToken"])
        except RuntimeError as error:
            text = str(error)
            if "wygasła" in text:
                forget_tokens(saved)
                return "dead", "Hasło albo sesja na stronie się zmieniły. Zaloguj się jeszcze raz."
            return "net", text
        save_session(saved["supabaseUrl"], saved["anonKey"], saved.get("email", ""), grant, remember=True)
        return "ok", ""

    def _restore_catalog_beat(self) -> None:
        if self.studio_mode != "online":
            return
        labels = [label for _beat_id, label in self.beats]
        if self.beat_var.get() in labels:
            self._sync_beat_button()
            return
        for candidate in (self._desk_beat, self._pref_beat):
            if candidate and candidate in labels:
                self.beat_var.set(candidate)
                break
        self._sync_beat_button()

    def refresh_gear(self) -> None:
        if self._gear_scanning or self._busy():
            return
        self._gear_scanning = True
        self._pref_device = self.device_var.get()
        self._pref_output = self.output_var.get()
        self.probe_var.set("Szukam mikrofonów i wyjść…")
        threading.Thread(target=self._boot_worker, daemon=True).start()

    def selected_output_index(self) -> int | None:
        name = self.output_var.get()
        for label, index in self.outputs:
            if label == name:
                return None if index < 0 else index
        return None

    def test_output(self) -> None:
        """A short tone on the chosen speakers or headphones. It is not recorded."""
        if self._output_testing:
            return
        index = self.selected_output_index()
        device = -1 if index is None else index
        self._output_testing = True
        self.output_test_button.configure(text="SŁUCHAJ…")
        during = self.recording

        def run() -> None:
            note = win_output.play_tone(device, 0.45)
            self.root.after(0, lambda: self._output_test_done(note, during))

        threading.Thread(target=run, daemon=True).start()

    def _output_test_done(self, note: str, during: bool) -> None:
        self._output_testing = False
        if hasattr(self, "output_test_button"):
            self.output_test_button.configure(text="TEST ODSŁUCHU")
        if note:
            self.probe_var.set(note)
            return
        if during or self.recording:
            self.probe_var.set("Ton testowy w odsłuchu. Do nagrania ten ton nie wchodzi.")
        else:
            self.probe_var.set("Ton testowy na wybranym odsłuchu. Jeśli go nie słyszysz, wybierz inne wyjście.")

    def _schedule_remix(self, delay: int = 280) -> None:
        """Mute, level and panorama apply to the sound that is already playing, not only the next take."""
        if self._arming or not (self.playing or self.recording):
            return
        self._remix_token += 1
        token = self._remix_token
        if self._remix_after:
            self.root.after_cancel(self._remix_after)
        self._remix_after = self.root.after(delay, lambda: self._kick_remix(token))

    def _kick_remix(self, token: int) -> None:
        self._remix_after = None
        if token != self._remix_token or self._arming or not (self.playing or self.recording):
            return
        head = max(0.0, self._play_from + (time.monotonic() - self._play_t0))
        skip = self.rec_track if self.recording else None
        plan = self._mix_plan(head, skip)
        beat_id, local = self._play_beat()
        threading.Thread(target=self._prepare_remix, args=(token, head, plan, beat_id, local), daemon=True).start()

    def _prepare_remix(
        self, token: int, head: float, plan: list[tuple[list[Clip], float, float]], beat_id: str, local: str
    ) -> None:
        heard: tuple[str | None, int | None, str] = (None, None, "")
        vocals: list[tuple[Path, float, float]] = []
        error = ""
        try:
            if local and Path(local).is_file():
                heard = (local, None, "")
            elif beat_id:
                heard = self._beat_listen(beat_id)
            vocals = self._render_for_play(plan, head)
        except Exception as problem:
            error = str(problem) or "Nie dało się złożyć odsłuchu."
        self.root.after(0, lambda: self._swap_monitor(token, head, heard, vocals, error))

    def _swap_monitor(
        self, token: int, head: float, heard: tuple[str | None, int | None, str],
        vocals: list[tuple[Path, float, float]], error: str,
    ) -> None:
        if token != self._remix_token or not (self.playing or self.recording):
            return
        target, limit, _note = heard
        beat = None if self.beat_muted else target
        if beat is not None and limit and head >= limit:
            beat = None
        self._stop_monitor()
        if error and beat is None and not vocals:
            self.status.set(error)
            return
        try:
            if beat is not None or vocals:
                ffmpeg = ffmpeg_exe()
                play = ffplay_exe()
                output_index = self.selected_output_index()
                if play is None and output_index is None:
                    raise RuntimeError(NO_FFPLAY)
                argv = mix_argv(
                    ffmpeg, beat, vocals, limit, beat_start=head,
                    beat_gain_db=self.beat_gain_db, beat_pan=self.beat_pan,
                )
                self.mix_feed, self.monitor = start_mix(ffmpeg, play or "", argv, output_index)
            if self.playing:
                self._play_from = head
                self._play_t0 = time.monotonic()
        except Exception as problem:
            self._stop_monitor()
            self.status.set(self._safe_listen_error(problem))

    def _track_cap(self) -> int:
        if self.studio_mode == "offline":
            return offline_session.offline_track_cap()
        return max_recording_tracks(self.tier)

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
        cached = getattr(self, "_client_cache", None)
        token = self.token()
        if cached is not None and cached[0].access_token == token and time.monotonic() < cached[1]:
            return cached[0]
        client = self._fresh_client(token)
        self._client_cache = (client, time.monotonic() + 300)
        return client

    def _fresh_client(self, token: str) -> SiteClient:
        client = SiteClient(SITE, token)
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
            self._reject_session("Hasło albo sesja na stronie się zmieniły. Zaloguj się jeszcze raz.")
            raise RuntimeError("Sesja wygasła. Zaloguj się jeszcze raz.")
        try:
            grant = supabase_refresh_grant(saved["supabaseUrl"], saved["anonKey"], refresh)
        except RuntimeError as error:
            if "wygasła" in str(error):
                self._reject_session("Hasło albo sesja na stronie się zmieniły. Zaloguj się jeszcze raz.")
            raise
        save_session(
            saved["supabaseUrl"], saved["anonKey"], saved.get("email", ""), grant,
            remember=wants_remember(saved.get("remember")),
        )
        return grant["access_token"]

    def _reject_session(self, message: str) -> None:
        """A saved login the site no longer accepts. Back to the form, tokens gone."""
        forget_tokens()
        self._client_cache = None

        def apply() -> None:
            self.tier = "FREE"
            self.plan_text.set("Plan: zaloguj się.")
            try:
                self.password.delete(0, "end")
            except tk.TclError:
                return
            self.gate_status.set(message)
            self.status.set(message)
            if not self.gate.winfo_manager():
                self.show_gate()

        try:
            self.root.after(0, apply)
        except tk.TclError:
            pass

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

    def sign_in(self) -> None:
        try:
            email = self.email.get().strip()
            password = self.password.get()
            if not email or not password:
                raise RuntimeError("Wpisz e-mail i hasło.")
            if not self.public_url or not self.public_key:
                self._load_public()
            grant = supabase_password_grant(self.public_url, self.public_key, email, password)
            save_session(
                self.public_url, self.public_key, email, grant,
                remember=self.remember_login.get() == 1,
            )
            self.password.delete(0, "end")
            self._read_plan()
            self.status.set("Zalogowano. Wybierz Studio Online albo Studio Offline.")
            self.gate_status.set("")
            self.show_modes()
        except Exception as error:
            self.status.set(str(error))
            self.gate_status.set(str(error))

    def selected_device(self) -> str:
        name = self.device_var.get()
        if name in self.devices:
            return name
        if self.devices:
            return self.devices[0]
        raise RuntimeError("Windows nie pokazał mikrofonu.")

    def _rate_take(self, path: Path) -> str:
        """One sentence on level, clipping, and mic drops. Never blocks sending."""
        drops, _fatal = read_capture_log(path)
        try:
            db, clipped, _seconds = take_stats(path)
        except Exception:
            return ""
        return quality_note(db, clipped, drops)

    def _build_update_bar(self) -> None:
        """Bottom strip, shown only when a newer signed build exists. Visible on every screen."""
        bar = tk.Frame(self.root, bg=RACK, highlightthickness=1, highlightbackground=AMBER)
        self.update_bar = bar
        self.update_var = tk.StringVar()
        self.update_label = tk.Label(
            bar, textvariable=self.update_var, bg=RACK, fg=INK, font=(FONT_UI, 10), anchor="w", justify="left", wraplength=520
        )
        self.update_label.pack(side="left", fill="x", expand=True, padx=12, pady=8)
        self.update_now = tk.Button(
            bar, text="ZAKTUALIZUJ", command=self._apply_update, bg=AMBER, fg=ON_AMBER, activebackground=AMBER_SOFT,
            activeforeground=ON_AMBER, disabledforeground=MUTE, relief="flat", bd=0, padx=14, pady=4,
            font=(FONT_POSTER, 12, "bold"), cursor="hand2",
        )
        self.update_now.pack(side="right", padx=8)
        bar.bind("<Configure>", lambda event: self.update_label.configure(wraplength=max(200, event.width - 230)))
        self._build_update_gate()

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

    def _build_update_gate(self) -> None:
        """A newer build blocks the studio. Update, or leave. There is no Później."""
        self.update_gate = tk.Frame(self.shell, bg=PAPER)
        self.update_gate_text = tk.StringVar(value="")
        card = tk.Frame(self.update_gate, bg=PAPER)
        card.pack(expand=True, padx=36)
        tk.Label(card, text="Aktualizacja", bg=PAPER, fg=INK, font=(FONT_DISPLAY, 22, "italic")).pack(anchor="w")
        tk.Label(
            card, textvariable=self.update_gate_text, bg=PAPER, fg=INK, font=(FONT_UI, 12),
            wraplength=460, justify="left",
        ).pack(anchor="w", pady=(10, 16))
        self.update_go = self._button(card, "Zaktualizuj", self._apply_update, AMBER, ON_AMBER)
        self.update_go.pack(fill="x", pady=(0, 8))
        self._button(card, "Wyłącz", self._quit_from_update, RACK, INK).pack(fill="x")

    def _gate_button_state(self, shell: tk.Widget | None, enabled: bool) -> None:
        if shell is None:
            return
        for child in shell.winfo_children():
            if isinstance(child, tk.Button):
                child.configure(state="normal" if enabled else "disabled")

    def _show_update_gate(self) -> None:
        update = self._update
        if update is None:
            return
        notes = f"\n\n{update.notes}" if update.notes else ""
        self.update_gate_text.set(
            f"Jest nowa wersja {update.version}. Masz {updater.APP_VERSION}.\n"
            "Bez aktualizacji program nie puszcza dalej."
            f"{notes}\n\n"
            "Zaktualizuj albo wyłącz."
        )
        self.update_var.set(
            f"Jest najnowsza wersja {update.version} (masz {updater.APP_VERSION}). Trzeba zaktualizować albo wyłączyć."
        )
        self.gate.pack_forget()
        self.modes.pack_forget()
        self.studio.pack_forget()
        if not self.update_gate.winfo_manager():
            self.update_gate.pack(fill="both", expand=True)
        if not self.update_bar.winfo_manager():
            self.update_bar.pack(side="bottom", fill="x", before=self.shell)
        self.update_now.configure(state="normal")
        self._gate_button_state(self.update_go, True)

    def _force_update_when_idle(self) -> None:
        if self._update is None or self._update_blocks() or self._update_busy:
            if self._update is not None and not self._update_blocks() and self._update_busy:
                return
            if self._update is None or self._update_blocks():
                return
        if self._busy_for_update():
            self.root.after(1000, self._force_update_when_idle)
            return
        self._show_update_gate()

    def _quit_from_update(self) -> None:
        self._update_abort = True
        self._on_close(ask_save=True)
        try:
            alive = bool(self.root.winfo_exists())
        except tk.TclError:
            alive = False
        if alive:
            self._update_abort = False

    def _offer_update(self, update: updater.Update) -> None:
        if self._update_dismissed or self._update_busy:
            return
        self._update = update
        self._update_abort = False
        if self._busy_for_update():
            self.update_var.set("Jest nowa wersja. Dokończ nagranie albo wysyłkę. Potem trzeba zaktualizować albo wyłączyć program.")
            if not self.update_bar.winfo_manager():
                self.update_bar.pack(side="bottom", fill="x", before=self.shell)
            self.root.after(1000, self._force_update_when_idle)
            return
        self._show_update_gate()

    def _dismiss_update(self) -> None:
        if self._update_busy:
            return
        self._update_dismissed = True
        self.update_bar.pack_forget()

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
        self._gate_button_state(getattr(self, "update_go", None), False)
        self.update_var.set("Pobieram nową wersję: 0%")
        self.update_gate_text.set("Pobieram nową wersję: 0%.\nJak dojdzie do 100%, program odliczy i dopiero wtedy się zamknie.")
        threading.Thread(target=self._download_update, args=(self._update,), daemon=True).start()

    def _download_update(self, update: updater.Update) -> None:
        def progress(done: int, total: int) -> None:
            percent = done * 100 // max(1, total)
            self.root.after(0, lambda: self._set_download_progress(percent))

        try:
            path = updater.download(update, Path(os.environ.get("TEMP", ".")) / "BitRymDym-update", progress)
        except NETWORK_ERRORS as error:
            message = network_message(error)
        except ValueError:
            message = "Pobrany plik nie przeszedł sprawdzenia (rozmiar lub suma). Nie instaluję."
        except Exception:
            message = "Nie udało się pobrać aktualizacji."
        else:
            self.root.after(0, lambda: self._launch_update(path))
            return
        self.root.after(0, lambda: self._update_failed(message))

    def _set_download_progress(self, percent: int) -> None:
        self.update_var.set(f"Pobieram nową wersję: {percent}%")
        self.update_gate_text.set(
            f"Pobieram nową wersję: {percent}%.\n"
            "Jak dojdzie do 100%, program odliczy kilka sekund.\n"
            "Potem zobaczysz okno instalacji z paskiem. Zostaw je."
        )

    def _update_failed(self, message: str) -> None:
        self._update_busy = False
        self.update_now.configure(state="normal")
        self._gate_button_state(getattr(self, "update_go", None), True)
        self.update_var.set(f"{message} Instalator jest też na stronie /nagrywarka.")
        self.update_gate_text.set(f"{message}\n\nInstalator jest też na stronie /nagrywarka.\nMożesz spróbować jeszcze raz albo wyłączyć program.")

    def _launch_update(self, path: Path) -> None:
        if self._busy_for_update():
            self._update_ready = path
            self._update_busy = False
            self.update_now.configure(state="normal")
            self._gate_button_state(getattr(self, "update_go", None), True)
            self.update_var.set("Aktualizacja jest pobrana. Skończ nagranie albo wysyłkę i naciśnij Zaktualizuj.")
            self.update_gate_text.set("Aktualizacja jest pobrana. Skończ nagranie albo wysyłkę i naciśnij Zaktualizuj.")
            self.root.after(1000, self._force_update_when_idle)
            return
        self._update_ready = path
        self._update_busy = True
        self._update_abort = False
        self._update_left = 8
        self._gate_button_state(getattr(self, "update_go", None), False)
        self._count_update()

    def _count_update(self) -> None:
        if self._update_abort:
            return
        path = self._update_ready
        if path is None:
            return
        if self._update_left > 0:
            self.update_var.set(f"Zamykam za {self._update_left} s. Potem okno instalacji.")
            self.update_gate_text.set(
                f"Pobrane. Program zamknie się za {self._update_left} s.\n\n"
                "Potem na wierzchu będzie okno instalacji z paskiem. Zostaw je.\n"
                "Jak pasek dojdzie do końca, program sam się otworzy."
            )
            self._update_left -= 1
            self.root.after(1000, self._count_update)
            return
        try:
            updater.schedule_installer(path)
        except OSError:
            self._update_failed("Nie udało się uruchomić instalatora.")
            return
        self._exit_for_update()

    def _exit_for_update(self) -> None:
        """Close the window and kill this process. Destroying the window alone leaves it running,
        the installer waits, and the new program never opens.
        """
        def _die() -> None:
            time.sleep(0.6)
            os._exit(0)

        threading.Thread(target=_die, daemon=True, name="bitrymdym-exit").start()
        try:
            self._on_close(ask_save=False)
        except Exception:
            pass
        os._exit(0)

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
        self.probe_button.configure(text="STOP TESTU")
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
            self.probe_button.configure(text="TEST MIKROFONU")
            self.probe_meter.delete("all")
        if message:
            self.probe_var.set(message)

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

        from timeline import self_test as timeline_self_test

        from offline_session import self_test as offline_self_test

        desk_self_test()
        fx_self_test()
        timeline_self_test()
        offline_self_test()
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
        if not any("flush_packets" in part for part in mic) or "pipe:1" not in mic:
            raise SystemExit("fala na żywo")
        if mic.index(str(Path("a.wav"))) > mic.index("pipe:1"):
            raise SystemExit("wav przed podglądem")
        timed = capture_argv("ffmpeg", "Mic", Path("a.wav"), 0.4)
        if timed.count("-t") != 2 or timed.count("0.4") != 2:
            raise SystemExit("czas nagrania")
        known, drawn = live_wave_span(1.5, 10)
        if abs(known - 0.1) > 1e-9 or abs(drawn - 1.5) > 1e-9 or live_wave_span(0.4, 0) != (0.0, 0.4):
            raise SystemExit(f"zasięg fali {known} {drawn}")
        loud = array.array("h", [16000] * 480)
        if sys.byteorder != "little":
            loud.byteswap()
        got = peaks_from_pcm(loud.tobytes())
        if len(got) != 1 or abs(got[0] - (16000 / 32768)) > 0.001 or peaks_from_pcm(b"\x00\x01") != []:
            raise SystemExit(f"szczyty na żywo {got}")
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
        seek = mix_argv("ffmpeg", "https://example.invalid/bit", [], 20, beat_start=12.5)
        if seek[seek.index("-ss") + 1] != "12.500" or seek[seek.index("-t") + 1] != "8" or seek.index("-ss") > seek.index("-i"):
            raise SystemExit("miks od kursora")
        if clock_text(75.5) != "1:15.50" or shade("#ff8000", 0.5) != "#7f4000" or safe_name("a/b c") != "a-b-c" or count_word(22, "a", "b", "c") != "22 b":
            raise SystemExit("pomocnicze")
        if not about_copy_ok():
            raise SystemExit("o programie")
        if not footer_copy_ok():
            raise SystemExit("stopka")
        if wants_remember(None) is not True or wants_remember("1") is not True or wants_remember("0") is not False:
            raise SystemExit("pamięć logowania")
        quiet = 10 ** (-26 / 20.0)
        shown = display_wave_half(quiet, 80.0)
        if shown < 20.0 or display_wave_half(0.0, 80.0) != 1.0 or display_wave_half(1.0, 80.0) < 79.0:
            raise SystemExit(f"fala na ekranie {shown}")
        sample = array.array("h", [0, 1000])
        blob = mono16_wav_bytes(sample)
        if not blob.startswith(b"RIFF") or b"WAVE" not in blob[:16]:
            raise SystemExit("wav projektu")
        from datetime import timezone

        joined = group_for_takes([Clip("a", 0, 0, 10), Clip("a", 20, 10, 15), Clip("b", 175, 0, 10)], 180.0)
        if [len(group) for group in joined] != [2, 1]:
            raise SystemExit(f"grupy wysyłki {joined}")

        moment = datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc)
        if listen_valid_for("2026-01-01T12:05:00Z", moment) != 270.0 or listen_valid_for(None) != 45.0 or listen_valid_for("x") != 45.0:
            raise SystemExit("pomocnicze")
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
            window.add_track()
        window.show_studio()
        window.root.update_idletasks()
        note.write_text(
            "\n".join(
                (
                    f"beats={len(window.beats)}",
                    f"ffmpeg={ffmpeg_exe()}",
                    f"ffplay={ffplay_exe()}",
                    f"gate={window.gate.winfo_manager()}",
                    f"icon={1 if brand_file('cassette.png') else 0}",
                    f"logo={1 if brand_file('logo-light.png') else 0}",
                    f"signup={int('Zarejestruj się' in words)}",
                    f"forgot={int('Nie pamiętam hasła' in words)}",
                    f"beat_lane={int(window.beat_lane.winfo_exists())}",
                    f"track_cap={cap}",
                    f"vocal_count={len(window.tracks)}",
                    f"add_text={window.add_button.cget('text')}",
                    f"done={window.done_button.cget('text')}",
                )
            )
            + "\n",
            encoding="utf-8",
        )
        window.root.destroy()
    else:
        # Keep the WAV writer available for a silent tone when the mic is closed.
        _ = write_pcm16_wav
        if not single_instance():
            raise SystemExit(0)
        RecorderWindow().run()
