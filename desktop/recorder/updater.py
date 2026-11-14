"""Self-update for the Windows recorder.

The program asks one public file (latest.json on R2) whether a newer build exists. That file is always
the single newest installer, never the next number in line. A machine several builds behind downloads
that one file. The installer then replaces the whole program folder, so skipped builds are not applied
one by one. The file is signed
with an Ed25519 key. The public half sits below, the private half stays in the OpenBot Vault. A new
build is installed only when ALL of these hold:

  1. the signature over (version, sha256, size, url) verifies against UPDATE_PUBLIC_KEY,
  2. the version is newer than APP_VERSION,
  3. the installer URL is https and under INSTALLER_PREFIX,
  4. the downloaded file has exactly the signed size and SHA-256.

So replacing a file in the bucket is not enough to push code onto a user's PC.
APP_VERSION must equal AppVersion in installer/BitRymDym.iss (the CI workflow checks it).
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

APP_VERSION = "2026.11.13.16"

R2_BASE = "https://pub-8c6908a0590848aeb53ab34c2317d857.r2.dev/bitrymdym/"
MANIFEST_URL = R2_BASE + "latest.json"
INSTALLER_PREFIX = R2_BASE
UPDATE_PUBLIC_KEY = bytes.fromhex("6155276db02091971473e8d771a6670221d2b9a2c31786dffb9c592cca0ddbe9")
MAX_INSTALLER_BYTES = 600 * 1024 * 1024
MESSAGE_TAG = "BitRymDym-update-v1"


# ---- Ed25519 verify (RFC 8032, pure Python: the standard library has no Ed25519) ----

_P = 2**255 - 19
_Q = 2**252 + 27742317777372353535851937790883648493
_D = -121665 * pow(121666, _P - 2, _P) % _P
_I = pow(2, (_P - 1) // 4, _P)


def _recover_x(y: int, sign: int) -> int | None:
    if y >= _P:
        return None
    x2 = (y * y - 1) * pow(_D * y * y + 1, _P - 2, _P) % _P
    if x2 == 0:
        return None if sign else 0
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _I % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return x


_GY = 4 * pow(5, _P - 2, _P) % _P
_GX = _recover_x(_GY, 0) or 0
_G = (_GX, _GY, 1, _GX * _GY % _P)
_Point = tuple[int, int, int, int]


def _add(a: _Point, b: _Point) -> _Point:
    first = (a[1] - a[0]) * (b[1] - b[0]) % _P
    second = (a[1] + a[0]) * (b[1] + b[0]) % _P
    third = 2 * a[3] * b[3] * _D % _P
    fourth = 2 * a[2] * b[2] % _P
    e, f, g, h = second - first, fourth - third, fourth + third, second + first
    return (e * f % _P, g * h % _P, f * g % _P, e * h % _P)


def _mul(scalar: int, point: _Point) -> _Point:
    result: _Point = (0, 1, 1, 0)
    while scalar > 0:
        if scalar & 1:
            result = _add(result, point)
        point = _add(point, point)
        scalar >>= 1
    return result


def _same(a: _Point, b: _Point) -> bool:
    return (a[0] * b[2] - b[0] * a[2]) % _P == 0 and (a[1] * b[2] - b[1] * a[2]) % _P == 0


def _decode(raw: bytes) -> _Point | None:
    y = int.from_bytes(raw, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    x = _recover_x(y, sign)
    return None if x is None else (x, y, 1, x * y % _P)


def ed25519_verify(public: bytes, message: bytes, signature: bytes) -> bool:
    if len(public) != 32 or len(signature) != 64:
        return False
    point_a = _decode(public)
    point_r = _decode(signature[:32])
    scalar = int.from_bytes(signature[32:], "little")
    if point_a is None or point_r is None or scalar >= _Q:
        return False
    digest = int.from_bytes(hashlib.sha512(signature[:32] + public + message).digest(), "little") % _Q
    return _same(_mul(scalar, _G), _add(point_r, _mul(digest, point_a)))


# ---- manifest ----


@dataclass(frozen=True)
class Update:
    version: str
    url: str
    sha256: str
    size: int
    notes: str = ""


def version_key(text: str) -> tuple[int, ...]:
    parts = text.strip().split(".")
    if not parts or not all(part.isdigit() and len(part) <= 9 for part in parts):
        raise ValueError("wersja")
    return tuple(int(part) for part in parts)


def is_newer(candidate: str, current: str = APP_VERSION) -> bool:
    return version_key(candidate) > version_key(current)


def signed_message(version: str, sha256: str, size: int, url: str) -> bytes:
    return f"{MESSAGE_TAG}\n{version}\n{sha256}\n{size}\n{url}".encode("utf-8")


def parse_manifest(raw: bytes, public: bytes = UPDATE_PUBLIC_KEY, prefix: str = INSTALLER_PREFIX) -> Update:
    """The signed manifest as an Update. Anything off raises ValueError."""
    try:
        data = json.loads(raw.decode("utf-8"))
        version = str(data["version"])
        url = str(data["url"])
        sha256 = str(data["sha256"]).lower()
        size = int(data["size"])
        signature = base64.b64decode(str(data["signature"]), validate=True)
        notes = str(data.get("notes", ""))[:400]
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("manifest") from error
    version_key(version)
    if len(sha256) != 64 or any(ch not in "0123456789abcdef" for ch in sha256):
        raise ValueError("suma")
    if not 1_000_000 <= size <= MAX_INSTALLER_BYTES:
        raise ValueError("rozmiar")
    if not url.startswith("https://") or not url.startswith(prefix) or ".." in url:
        raise ValueError("adres")
    if not ed25519_verify(public, signed_message(version, sha256, size, url), signature):
        raise ValueError("podpis")
    return Update(version=version, url=url, sha256=sha256, size=size, notes=notes)


def fetch_manifest(timeout: float = 8.0) -> bytes:
    request = urllib.request.Request(
        f"{MANIFEST_URL}?t={int(time.time())}",
        headers={"Cache-Control": "no-cache", "User-Agent": "BitRymDymRecorder"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(65_536)


def check_for_update(
    fetch: Callable[[], bytes] | None = None,
    current: str = APP_VERSION,
    public: bytes = UPDATE_PUBLIC_KEY,
    prefix: str = INSTALLER_PREFIX,
) -> Update | None:
    """A newer, correctly signed build, or None. Network and format problems return None, not an error."""
    try:
        update = parse_manifest((fetch or fetch_manifest)(), public, prefix)
        return update if is_newer(update.version, current) else None
    except Exception:
        return None


def download(
    update: Update,
    dest_dir: Path,
    progress: Callable[[int, int], None] | None = None,
    opener: Callable[[str], object] | None = None,
) -> Path:
    """Installer into dest_dir, accepted only with the signed size and SHA-256."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    final = dest_dir / f"BitRymDym-Setup-{update.version}.exe"
    part = final.with_suffix(".part")
    request = urllib.request.Request(update.url, headers={"User-Agent": "BitRymDymRecorder"})
    digest = hashlib.sha256()
    seen = 0
    try:
        with (opener or (lambda _url: urllib.request.urlopen(request, timeout=30)))(update.url) as response, part.open("wb") as out:  # type: ignore[attr-defined]
            while True:
                chunk = response.read(1 << 20)
                if not chunk:
                    break
                seen += len(chunk)
                if seen > update.size:
                    raise ValueError("za dużo danych")
                digest.update(chunk)
                out.write(chunk)
                if progress is not None:
                    progress(seen, update.size)
        if seen != update.size or digest.hexdigest() != update.sha256:
            raise ValueError("suma lub rozmiar nie zgadzają się z podpisanym manifestem")
        os.replace(part, final)
        return final
    finally:
        try:
            part.unlink()
        except OSError:
            pass


def installer_argv(path: Path) -> list[str]:
    """Show the installer window. It draws its own progress and then opens the program.

    No /SILENT: a hidden setup looked like the program had died at 100%.
    Builds before 2026.11.13.11 still pass /SILENT. The setup script opens a visible copy.
    """
    return [str(path), "/UPDATE=1", "/NORESTART"]


def start_installer(path: Path) -> subprocess.Popen[bytes]:
    flags = 0
    if os.name == "nt":
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    return subprocess.Popen(
        installer_argv(path),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=flags,
        close_fds=True,
    )


def installer_after_exit_command(path: Path) -> str:
    """Cmd helper. It is started before we exit, waits for this process, then shows setup.

    A hidden PowerShell child died with the recorder, so the installer never opened and
    nothing wrote update.log. This file is launched with `start`, waits on our pid for
    up to 60 s, runs the visible installer, and opens the program again even if setup fails.
    ASCII only: cmd.exe on a Polish Windows misreads a UTF-8 batch file.
    """
    setup = str(path).replace('"', "")
    lines = [
        "@echo off",
        "setlocal",
        'set "LOG=%TEMP%\\BitRymDym-update\\update.log"',
        'if not exist "%TEMP%\\BitRymDym-update" mkdir "%TEMP%\\BitRymDym-update"',
        '>>"%LOG%" echo start',
        'powershell -NoProfile -ExecutionPolicy Bypass -Command "Wait-Process -Id %1 -Timeout 60 -ErrorAction SilentlyContinue"',
        '>>"%LOG%" echo waited',
        f'start "BitRymDym" /WAIT "{setup}" /UPDATE=1 /NORESTART',
        'set "CODE=%ERRORLEVEL%"',
        '>>"%LOG%" echo exit %CODE%',
        'set "EXE=%LOCALAPPDATA%\\BitRymDym\\Nagrywarka\\BitRymDym.exe"',
        'if exist "%EXE%" (',
        '  tasklist /FI "IMAGENAME eq BitRymDym.exe" | find /I "BitRymDym.exe" >nul',
        '  if errorlevel 1 start "" "%EXE%"',
        '  >>"%LOG%" echo opened',
        ")",
        'if not "%CODE%"=="0" powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(\'Instalacja nie doszla do konca. Kod %CODE%\', \'BitRymDym\')"',
        "exit /b %CODE%",
        "",
    ]
    return "\r\n".join(lines)


def schedule_installer(path: Path) -> subprocess.Popen[bytes]:
    """On Windows, start a helper that outlives us, then the caller exits. Elsewhere, start setup now."""
    if os.name != "nt":
        return start_installer(path)
    folder = Path(os.environ.get("TEMP", ".")) / "BitRymDym-update"
    folder.mkdir(parents=True, exist_ok=True)
    script = folder / "apply-update.cmd"
    script.write_bytes(installer_after_exit_command(path).encode("ascii"))
    # `start` returns at once and the second cmd is not tied to this process.
    command = [
        "cmd",
        "/d",
        "/c",
        "start",
        "BitRymDym update",
        "/MIN",
        "cmd",
        "/d",
        "/c",
        str(script),
        str(os.getpid()),
    ]
    quiet = dict(stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, close_fds=True)
    detached = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
    try:
        return subprocess.Popen(command, creationflags=detached | 0x01000000, **quiet)
    except OSError:
        return subprocess.Popen(command, creationflags=detached, **quiet)


def sign_manifest(
    version: str, sha256: str, size: int, url: str, notes: str, sign: Callable[[bytes], bytes]
) -> dict[str, object]:
    """Manifest dict for latest.json. sign() gets the message bytes and returns a 64 byte signature."""
    signature = sign(signed_message(version, sha256, size, url))
    return {
        "version": version,
        "url": url,
        "sha256": sha256,
        "size": size,
        "notes": notes,
        "signature": base64.b64encode(signature).decode("ascii"),
    }


def self_test() -> None:
    # RFC 8032 section 7.1, test 1 (empty message)
    pub = bytes.fromhex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
    sig = bytes.fromhex(
        "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"
    )
    if not ed25519_verify(pub, b"", sig):
        raise SystemExit("ed25519: wektor RFC 8032")
    if ed25519_verify(pub, b"x", sig) or ed25519_verify(pub, b"", sig[:-1] + bytes([sig[-1] ^ 1])):
        raise SystemExit("ed25519: zła wiadomość lub podpis przyjęte")
    if version_key("2026.11.12.2") <= version_key("2026.11.12.1") or version_key("2026.11.13") <= version_key("2026.11.12.9"):
        raise SystemExit("wersje")
    if is_newer("2026.11.12.2", "2026.11.12.2") or not is_newer("2026.12.1", "2026.11.12.2"):
        raise SystemExit("is_newer")
    for bad in ("", "1.x", "1..2", "-1"):
        try:
            version_key(bad)
        except ValueError:
            continue
        raise SystemExit(f"zła wersja przyjęta {bad!r}")
    argv = installer_argv(Path("a.exe"))
    if "/UPDATE=1" not in argv or "/NORESTART" not in argv or "/SILENT" in argv or "/SUPPRESSMSGBOXES" in argv:
        raise SystemExit("argumenty instalatora")
    waited = installer_after_exit_command(Path(r"C:\Temp\BitRymDym-Setup-2026.11.13.7.exe"))
    if "Wait-Process -Id %1" not in waited or "/UPDATE=1" not in waited or "BitRymDym-Setup-2026.11.13.7.exe" not in waited:
        raise SystemExit("instalator ma ruszyć dopiero po zejściu procesu")
    if "/SILENT" in waited or "/SUPPRESSMSGBOXES" in waited:
        raise SystemExit("instalator aktualizacji ma być widoczny")
    if "/WAIT" not in waited or "BitRymDym\\Nagrywarka\\BitRymDym.exe" not in waited or "if errorlevel 1 start" not in waited:
        raise SystemExit("po instalacji program ma wstać sam")
    if "MessageBox" not in waited or "update.log" not in waited:
        raise SystemExit("błąd instalacji ma być widoczny")
    waited.encode("ascii")
    print("updater self-test ok")


if __name__ == "__main__":
    self_test()
    sys.exit(0)
