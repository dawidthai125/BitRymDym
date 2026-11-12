"""Local desk helpers for the Windows recorder.

Plan take lengths match src/config/plan-policy.ts recording.maxTakeSeconds.
This file does not play audio and does not talk to the site.
"""

from __future__ import annotations

import array
import base64
import ctypes
import json
import math
import os
import sys
from pathlib import Path
from typing import Any, Callable


TAKE_SECONDS = {"FREE": 30, "BRONZE": 60, "SILVER": 120, "GOLD": 180}
# plan-policy studio.maxRecordingTracks. The Bit lane is not a recording track.
RECORDING_TRACKS = {"FREE": 1, "BRONZE": 2, "SILVER": 8, "GOLD": 16}
RATE = 48_000
PREF_KEYS = ("device", "title", "effects", "beat")


def max_take_seconds(tier: str) -> int:
    return TAKE_SECONDS.get(tier, TAKE_SECONDS["FREE"])


def max_recording_tracks(tier: str) -> int:
    return RECORDING_TRACKS.get(tier, RECORDING_TRACKS["FREE"])


def wav_data_offset(head: bytes) -> int | None:
    """Where the PCM starts in a WAV. ffmpeg writes a LIST chunk (78 byte header), Python's wave writes 44.

    None while the header is still being written (not enough bytes yet). Not a RIFF/WAVE file: 44, as before.
    """
    if len(head) < 12:
        return None
    if head[:4] != b"RIFF" or head[8:12] != b"WAVE":
        return 44
    index = 12
    while index + 8 <= len(head):
        size = int.from_bytes(head[index + 4 : index + 8], "little")
        if head[index : index + 4] == b"data":
            return index + 8
        index += 8 + size + (size & 1)
    return None


def wav_data_offset_of(path: Path) -> int | None:
    try:
        return wav_data_offset(read_file_range(path, 0, 4096))
    except OSError:
        return None


def wav_seconds(size: int, offset: int = 44) -> float:
    if size <= offset:
        return 0.0
    return (size - offset) / 2 / RATE


def file_seconds(path: Path) -> float:
    """Length of a mono 48 kHz 16-bit WAV on disk, with the real header size (also while ffmpeg is still writing)."""
    try:
        size = path.stat().st_size
    except OSError:
        return 0.0
    offset = wav_data_offset_of(path)
    return wav_seconds(size, offset if offset is not None else 44)


def peak_db(pcm: bytes) -> float:
    if len(pcm) < 2:
        return -96.0
    peak = 0
    usable = len(pcm) - (len(pcm) % 2)
    for index in range(0, usable, 2):
        sample = int.from_bytes(pcm[index : index + 2], "little", signed=True)
        peak = max(peak, abs(sample))
    if peak <= 0:
        return -96.0
    return 20.0 * math.log10(peak / 32768.0)


def read_file_range(path: Path, start: int, length: int) -> bytes:
    """Read while another process writes the WAV. A normal open can stall the window."""
    if length <= 0 or start < 0 or not path.exists():
        return b""
    if os.name != "nt":
        with path.open("rb") as handle:
            handle.seek(start)
            return handle.read(length)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateFileW.restype = ctypes.c_void_p
    kernel.CreateFileW.argtypes = [
        ctypes.c_wchar_p,
        ctypes.c_uint32,
        ctypes.c_uint32,
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.c_uint32,
        ctypes.c_void_p,
    ]
    kernel.SetFilePointerEx.argtypes = [ctypes.c_void_p, ctypes.c_longlong, ctypes.c_void_p, ctypes.c_uint32]
    kernel.SetFilePointerEx.restype = ctypes.c_int
    kernel.ReadFile.argtypes = [
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_uint32,
        ctypes.POINTER(ctypes.c_uint32),
        ctypes.c_void_p,
    ]
    kernel.ReadFile.restype = ctypes.c_int
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel.CloseHandle.restype = ctypes.c_int
    handle = kernel.CreateFileW(str(path), 0x80000000, 7, None, 3, 0x80, None)
    if not handle or handle == ctypes.c_void_p(-1).value:
        return b""
    try:
        if not kernel.SetFilePointerEx(handle, start, None, 0):
            return b""
        buf = ctypes.create_string_buffer(length)
        got = ctypes.c_uint32(0)
        if not kernel.ReadFile(handle, buf, length, ctypes.byref(got), None):
            return b""
        return buf.raw[: got.value]
    finally:
        kernel.CloseHandle(handle)


def tail_peak_db(path: Path, samples: int = 4800) -> float:
    if not path.exists():
        return -96.0
    size = path.stat().st_size
    offset = wav_data_offset_of(path)
    if offset is None or size <= offset:
        return -96.0
    byte_count = min(size - offset, samples * 2)
    return peak_db(read_file_range(path, size - byte_count, byte_count))


def fold_peaks(columns: list[float], pcm: bytes, first_sample: int, total_samples: int) -> None:
    """Fold new PCM into fixed columns. Stride keeps a long take off the UI thread."""
    width = len(columns)
    usable = len(pcm) - (len(pcm) % 2)
    if width < 1 or usable < 2 or total_samples <= 0:
        return
    samples = array.array("h")
    samples.frombytes(pcm[:usable])
    if sys.byteorder != "little":
        samples.byteswap()
    count = len(samples)
    hop = max(1, count // (width * 8))
    index = 0
    while index < count:
        column = int((first_sample + index) * width / total_samples)
        if 0 <= column < width:
            level = abs(samples[index]) / 32768.0
            if level > columns[column]:
                columns[column] = level
        index += hop


def studio_url(site: str, project: str) -> str:
    return f"{site.rstrip('/')}/studio/p/{project}"


def read_prefs(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        return {}
    out: dict[str, Any] = {}
    device = raw.get("device")
    title = raw.get("title")
    beat = raw.get("beat")
    effects = raw.get("effects")
    if isinstance(device, str) and device:
        out["device"] = device
    if isinstance(title, str):
        out["title"] = title
    if isinstance(beat, str) and beat:
        out["beat"] = beat
    if isinstance(effects, list):
        out["effects"] = [item for item in effects if isinstance(item, str)]
    return out


def list_saved_takes(folder: Path, limit: int = 12) -> list[Path]:
    if limit < 1 or not folder.is_dir():
        return []
    found = [
        path
        for path in folder.glob("ujecie-*.wav")
        if path.is_file() and path.stat().st_size >= 1000
    ]
    found.sort(key=lambda path: path.stat().st_mtime)
    return found[-limit:]


def write_prefs(path: Path, prefs: dict[str, Any]) -> None:
    clean = {key: prefs[key] for key in PREF_KEYS if key in prefs}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean), encoding="utf-8")


def scan_capture_log(text: str) -> tuple[int, str]:
    """(dropped-buffer warnings, last fatal line) from the ffmpeg capture log."""
    drops = 0
    fatal = ""
    for line in text.splitlines():
        low = line.lower()
        if "too full" in low or "dropping" in low:
            drops += 1
        elif line.strip() and any(
            key in low for key in ("could not", "error opening", "i/o error", "access is denied", "cannot")
        ):
            fatal = line.strip()
    return drops, fatal


def level_text(db: float) -> str:
    rounded = round(db)
    return f"{rounded} dB".replace("-", "−") if rounded else "0 dB"


def quality_note(peak_db_value: float, clipped: int, drops: int = 0) -> str:
    """One plain sentence about the take, from the peak, clipped samples, and mic drops."""
    parts: list[str] = []
    if drops > 0:
        parts.append(
            f"Mikrofon zgubił próbki ({drops} razy). Zamknij ciężkie programy i nagraj ten fragment jeszcze raz."
        )
    if clipped >= 3 or peak_db_value >= -0.3:
        parts.append(
            f"Przester (szczyt {level_text(peak_db_value)}). Zmniejsz głośność mikrofonu w Windows i nagraj jeszcze raz."
        )
    elif peak_db_value < -45:
        parts.append(
            f"Prawie cisza (szczyt {level_text(peak_db_value)}). Sprawdź, czy wybrany jest właściwy mikrofon i czy nie jest wyciszony."
        )
    elif peak_db_value < -24:
        parts.append(
            f"Cicho (szczyt {level_text(peak_db_value)}). Zbliż się do mikrofonu albo podnieś jego poziom w Windows."
        )
    else:
        parts.append(f"Poziom OK (szczyt {level_text(peak_db_value)}).")
    return " ".join(parts)


SESSION_ENTROPY = b"BitRymDym.desktop-session.v2"
SECRET_KEYS = ("accessToken", "refreshToken")


class _Blob(ctypes.Structure):
    _fields_ = [("cbData", ctypes.c_uint32), ("pbData", ctypes.c_void_p)]


def _blob_of(data: bytes) -> tuple[_Blob, Any]:
    buffer = ctypes.create_string_buffer(data, len(data))
    return _Blob(len(data), ctypes.cast(buffer, ctypes.c_void_p)), buffer


def _dpapi(call: str, data: bytes, entropy: bytes) -> bytes:
    """CryptProtectData / CryptUnprotectData for the current Windows user. Windows only."""
    crypt = ctypes.windll.crypt32  # type: ignore[attr-defined]
    kernel = ctypes.windll.kernel32  # type: ignore[attr-defined]
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    source, keep_a = _blob_of(data)
    extra, keep_b = _blob_of(entropy)
    out = _Blob()
    UI_FORBIDDEN = 0x1
    if call == "protect":
        ok = crypt.CryptProtectData(
            ctypes.byref(source), None, ctypes.byref(extra), None, None, UI_FORBIDDEN, ctypes.byref(out)
        )
    else:
        ok = crypt.CryptUnprotectData(
            ctypes.byref(source), None, ctypes.byref(extra), None, None, UI_FORBIDDEN, ctypes.byref(out)
        )
    _ = (keep_a, keep_b)
    if not ok:
        raise OSError("DPAPI")
    try:
        return ctypes.string_at(out.pbData, out.cbData)
    finally:
        kernel.LocalFree(out.pbData)


def dpapi_protect(data: bytes, entropy: bytes = b"") -> bytes:
    return _dpapi("protect", data, entropy)


def dpapi_unprotect(blob: bytes, entropy: bytes = b"") -> bytes:
    return _dpapi("unprotect", blob, entropy)


def seal_session(
    session: dict[str, str],
    protect: Callable[[bytes, bytes], bytes] | None = None,
) -> dict[str, str]:
    """File form of the session. Tokens go into one DPAPI blob that only this Windows user can open.

    Without DPAPI (not Windows, or the call fails) the tokens stay plain, as before. Nothing is lost.
    """
    if protect is None and os.name == "nt":
        protect = dpapi_protect
    secret = {key: session[key] for key in SECRET_KEYS if session.get(key)}
    if protect is None or not secret:
        return dict(session)
    try:
        blob = protect(json.dumps(secret).encode("utf-8"), SESSION_ENTROPY)
    except Exception:
        return dict(session)
    public = {key: value for key, value in session.items() if key not in SECRET_KEYS}
    return {**public, "sealed": base64.b64encode(blob).decode("ascii"), "format": "dpapi-v1"}


def open_session(
    raw: dict[str, Any],
    unprotect: Callable[[bytes, bytes], bytes] | None = None,
) -> tuple[dict[str, str] | None, bool]:
    """(session, needs_reseal). A sealed file that cannot be opened counts as signed out."""
    if "sealed" in raw:
        if unprotect is None and os.name == "nt":
            unprotect = dpapi_unprotect
        if unprotect is None:
            return None, False
        try:
            secret = json.loads(unprotect(base64.b64decode(str(raw["sealed"])), SESSION_ENTROPY).decode("utf-8"))
        except Exception:
            return None, False
        merged = {str(k): str(v) for k, v in raw.items() if k not in ("sealed", "format")}
        merged.update({str(k): str(v) for k, v in secret.items() if k in SECRET_KEYS})
        return merged, False
    plain = {str(k): str(v) for k, v in raw.items()}
    return plain, bool(plain.get("accessToken"))


def probe_hint(peak_db_value: float) -> str:
    """Mic check before recording, from the peak of the last few seconds."""
    if peak_db_value < -50:
        return "Prawie nic nie słychać. Sprawdź, czy wybrany jest właściwy mikrofon i czy nie jest wyciszony."
    if peak_db_value < -24:
        return "Za cicho. Zbliż się do mikrofonu albo podnieś jego poziom w Windows."
    if peak_db_value > -3:
        return "Za głośno, grozi przesterem. Zmniejsz poziom mikrofonu w Windows."
    return "Dobrze. Z takim poziomem możesz nagrywać."


def self_test() -> None:
    if [max_take_seconds(tier) for tier in ("FREE", "BRONZE", "SILVER", "GOLD")] != [30, 60, 120, 180]:
        raise SystemExit("czas nagrania")
    if [max_recording_tracks(tier) for tier in ("FREE", "BRONZE", "SILVER", "GOLD")] != [1, 2, 8, 16]:
        raise SystemExit("ścieżki nagrań")
    if max_take_seconds("NOPE") != 30 or max_recording_tracks("NOPE") != 1:
        raise SystemExit("nieznany plan")
    if abs(wav_seconds(44 + RATE * 2) - 1.0) > 0.001:
        raise SystemExit("sekundy WAV")
    if peak_db(b"\x00\x00\x00\x00") != -96.0:
        raise SystemExit("cisza")
    loud = peak_db((32767).to_bytes(2, "little", signed=True))
    if not -0.01 <= loud <= 0:
        raise SystemExit(f"szczyt {loud}")
    folder = Path(__import__("os").environ.get("TEMP", ".")) / "bitrymdym-desk-test"
    prefs_path = folder / "prefs.json"
    write_prefs(
        prefs_path,
        {"device": "Mic", "title": "T", "effects": ["eq"], "beat": "Bit", "accessToken": "no"},
    )
    loaded = read_prefs(prefs_path)
    if "accessToken" in loaded or loaded.get("effects") != ["eq"]:
        raise SystemExit("prefs")
    prefs_path.unlink(missing_ok=True)
    if studio_url("https://www.bitrymdym.pl", "p1") != "https://www.bitrymdym.pl/studio/p/p1":
        raise SystemExit("adres studia")
    cols = [0.0, 0.0, 0.0, 0.0]
    loud = (20000).to_bytes(2, "little", signed=True) + (0).to_bytes(2, "little", signed=True)
    fold_peaks(cols, loud * 4, 0, 800)
    if cols[0] < 0.5 or any(level > 0.01 for level in cols[1:]):
        raise SystemExit(f"fala {cols}")
    probe = folder / "range.bin"
    probe.write_bytes(b"abcdefghij")
    if read_file_range(probe, 2, 3) != b"cde":
        raise SystemExit("odczyt")
    probe.unlink(missing_ok=True)
    takes = folder / "takes"
    takes.mkdir(parents=True, exist_ok=True)
    small = takes / "ujecie-small.wav"
    big = takes / "ujecie-big.wav"
    other = takes / "not-a-take.wav"
    small.write_bytes(b"x" * 20)
    big.write_bytes(b"x" * 1000)
    other.write_bytes(b"x" * 1000)
    saved = list_saved_takes(takes, limit=12)
    if saved != [big]:
        raise SystemExit("lista ujęć")
    for path in (small, big, other, prefs_path):
        path.unlink(missing_ok=True)
    if scan_capture_log("[dshow @ 0x1] real-time buffer [Mic] too full or near too full - dropping frames!\nok")[0] != 1:
        raise SystemExit("log: gubienie próbek")
    if "Could not run graph" not in scan_capture_log("x\nCould not run graph (incorrect device)")[1]:
        raise SystemExit("log: błąd")
    if scan_capture_log("plain line")[0] != 0:
        raise SystemExit("log: czysty")
    if not quality_note(-0.1, 10).startswith("Przester") or "Prawie cisza" not in quality_note(-60, 0):
        raise SystemExit("ocena: skrajne")
    if not quality_note(-30, 0).startswith("Cicho") or not quality_note(-12, 0).startswith("Poziom OK"):
        raise SystemExit("ocena: środek")
    if "zgubił próbki (2 razy)" not in quality_note(-12, 0, drops=2):
        raise SystemExit("ocena: próbki")
    xor = lambda data, entropy: bytes(b ^ 0x5A for b in data) + entropy[:1]  # noqa: E731
    unxor = lambda blob, entropy: bytes(b ^ 0x5A for b in blob[:-1])  # noqa: E731
    plain_session = {
        "supabaseUrl": "https://s.example",
        "anonKey": "anon",
        "email": "a@b.pl",
        "accessToken": "aaa.bbb.ccc",
        "refreshToken": "refresh-secret",
    }
    sealed = seal_session(plain_session, xor)
    text = json.dumps(sealed)
    if "aaa.bbb.ccc" in text or "refresh-secret" in text or sealed.get("format") != "dpapi-v1":
        raise SystemExit("sesja: tokeny jawne po zaszyfrowaniu")
    if sealed.get("email") != "a@b.pl" or sealed.get("supabaseUrl") != "https://s.example":
        raise SystemExit("sesja: pola publiczne")
    opened, again = open_session(sealed, unxor)
    if opened != plain_session or again:
        raise SystemExit(f"sesja: odczyt {opened}")
    legacy, reseal = open_session(plain_session, unxor)
    if legacy != plain_session or not reseal:
        raise SystemExit("sesja: stary plik jawny ma wymagać zaszyfrowania")
    broken = dict(sealed, sealed="not-base64-@@@")
    if open_session(broken, unxor)[0] is not None:
        raise SystemExit("sesja: uszkodzony plik ma oznaczać wylogowanie")
    if open_session(sealed, lambda blob, entropy: (_ for _ in ()).throw(OSError("inny użytkownik")))[0] is not None:
        raise SystemExit("sesja: inny użytkownik Windows")
    if seal_session({"email": "x"}, xor) != {"email": "x"}:
        raise SystemExit("sesja: bez tokenów nic się nie zmienia")
    if seal_session(plain_session, lambda data, entropy: (_ for _ in ()).throw(OSError("x")))["accessToken"] != "aaa.bbb.ccc":
        raise SystemExit("sesja: awaria DPAPI ma zostawić jawny zapis, nie gubić sesji")
    if level_text(-0.2) != "0 dB" or level_text(-12.4) != "−12 dB":
        raise SystemExit("zapis poziomu")
    if not probe_hint(-70).startswith("Prawie nic") or not probe_hint(-30).startswith("Za cicho"):
        raise SystemExit("próba mikrofonu: cisza")
    if not probe_hint(-1).startswith("Za głośno") or not probe_hint(-12).startswith("Dobrze"):
        raise SystemExit("próba mikrofonu: głośno")
    if os.name == "nt":
        sample = b"token-" + os.urandom(8)
        if dpapi_unprotect(dpapi_protect(sample, SESSION_ENTROPY), SESSION_ENTROPY) != sample:
            raise SystemExit("DPAPI: obieg")
        if dpapi_protect(sample, SESSION_ENTROPY) == sample:
            raise SystemExit("DPAPI: dane niezaszyfrowane")
    # WAV header: ffmpeg writes a LIST chunk (78 B), Python's wave writes 44, a half-written header is None
    ffmpeg_head = (
        b"RIFF" + (78 - 8 + 4000).to_bytes(4, "little") + b"WAVE"
        + b"fmt " + (16).to_bytes(4, "little") + bytes(16)
        + b"LIST" + (26).to_bytes(4, "little") + b"INFO" + b"ISFT" + (14).to_bytes(4, "little") + b"Lavf61.7.100\x00\x00" + b"data" + (4000).to_bytes(4, "little")
    )
    if wav_data_offset(ffmpeg_head) != 78 or wav_data_offset(ffmpeg_head[:60]) is not None:
        raise SystemExit(f"nagłówek ffmpeg: {wav_data_offset(ffmpeg_head)}")
    plain_head = b"RIFF" + (36).to_bytes(4, "little") + b"WAVEfmt " + (16).to_bytes(4, "little") + bytes(16) + b"data" + (0).to_bytes(4, "little")
    if wav_data_offset(plain_head) != 44 or wav_data_offset(b"x" * 100) != 44 or wav_data_offset(b"RIF") is not None:
        raise SystemExit("nagłówek 44 / nie-RIFF / krótki")
    hot = (30000).to_bytes(2, "little", signed=True) * 24
    quiet_pcm = bytes(9600)
    take = folder / "ffmpeg-like.wav"
    take.write_bytes(ffmpeg_head + quiet_pcm)
    if tail_peak_db(take) > -90.0:
        raise SystemExit("ogon ciszy: nagłówek ffmpeg wzięty za próbki")
    if abs(file_seconds(take) - len(quiet_pcm) / 2 / RATE) > 1e-9:
        raise SystemExit("czas pliku z nagłówkiem ffmpeg")
    take.write_bytes(ffmpeg_head + quiet_pcm + hot)
    if tail_peak_db(take) < -1.0:
        raise SystemExit("ogon z sygnałem")
    take.unlink(missing_ok=True)
    print("desk self-test ok")


if __name__ == "__main__":
    self_test()
