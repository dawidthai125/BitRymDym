"""ffmpeg and ffplay outside the program package (owner order 2026-11-26).

The installer, the portable copy and every update used to carry 103 MB of ffmpeg. Now the program
downloads one pinned archive once (31 MB, our R2 bucket, SHA-256 and size checked) into
%LOCALAPPDATA%\\BitRymDym\\dzwiek\\<version>. Velopack updates replace only the folder named current,
so the tools stay. A copy next to the exe (older installs, developer runs) still wins.

Archive: tar.xz with ffmpeg.exe, ffplay.exe and FFMPEG-LICENSE.txt from Gyan's essentials build
9.0.2 (GPL). Made with: xz --lzma2=preset=9e,dict=128MiB (unpacking needs about 130 MB of memory).
"""

from __future__ import annotations

import hashlib
import os
import shutil
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Callable

TOOLS_VERSION = "ffmpeg-9.0.2-essentials-1"
TOOLS_URL = "https://pub-8c6908a0590848aeb53ab34c2317d857.r2.dev/bitrymdym/tools/ffmpeg-9.0.2-essentials-win64.tar.xz"
TOOLS_SHA256 = "86815ff7edb96af8e0cb8d330ca5650b0811037263d9ac09f46703dcfe7b1337"
TOOLS_SIZE = 31148708
MEMBERS = ("ffmpeg.exe", "ffplay.exe", "FFMPEG-LICENSE.txt")
READY_MARK = ".ok"

Progress = Callable[[int, int], None]


# Own folder: %LOCALAPPDATA%\BitRymDym\tools may hold other people's things (seen on the owner's PC:
# 7zip, vnc). Only folders this module made (OWNED_PREFIX) are ever removed.
OWNED_PREFIX = "ffmpeg-"


def tools_root() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    return Path(base) / "BitRymDym" / "dzwiek"


def tools_dir(root: Path | None = None) -> Path:
    return (root or tools_root()) / TOOLS_VERSION


def ready(folder: Path | None = None) -> bool:
    folder = folder or tools_dir()
    return all((folder / name).is_file() for name in MEMBERS[:2]) and (folder / READY_MARK).is_file()


def tool_path(name: str, folder: Path | None = None) -> Path | None:
    """ffmpeg.exe or ffplay.exe from the downloaded tools, or None while they are not there."""
    folder = folder or tools_dir()
    return folder / name if ready(folder) else None


class FetchError(Exception):
    """A plain Polish sentence for the window."""


def _download(url: str, target: Path, progress: Progress | None, timeout: float) -> str:
    digest = hashlib.sha256()
    done = 0
    request = urllib.request.Request(url, headers={"User-Agent": "BitRymDym-Nagrywarka"})
    with urllib.request.urlopen(request, timeout=timeout) as response, open(target, "wb") as out:
        while True:
            chunk = response.read(256 * 1024)
            if not chunk:
                break
            done += len(chunk)
            if done > TOOLS_SIZE:
                raise FetchError("Pobrany plik jest większy, niż powinien. Spróbuj ponownie później.")
            digest.update(chunk)
            out.write(chunk)
            if progress:
                progress(done, TOOLS_SIZE)
    if done != TOOLS_SIZE:
        raise FetchError("Pobieranie się urwało. Sprawdź internet i spróbuj ponownie.")
    return digest.hexdigest()


def _unpack(archive: Path, folder: Path) -> None:
    with tarfile.open(archive, "r:xz") as tar:
        for member in tar.getmembers():
            # Only the three known plain files; no paths, links or anything else.
            if member.name not in MEMBERS or not member.isfile():
                raise FetchError("Paczka z dodatkami ma nieznaną zawartość.")
            source = tar.extractfile(member)
            if source is None:
                raise FetchError("Paczka z dodatkami jest uszkodzona.")
            with source, open(folder / member.name, "wb") as out:
                shutil.copyfileobj(source, out, 1024 * 1024)


def fetch(progress: Progress | None = None, *, root: Path | None = None, url: str | None = None, timeout: float = 30.0) -> Path:
    """Download, check and unpack the tools. Returns their folder. Raises FetchError with a message."""
    final = tools_dir(root)
    if ready(final):
        return final
    parent = final.parent
    parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="pobieranie-", dir=parent))
    try:
        archive = work / "tools.tar.xz"
        try:
            got = _download(url or TOOLS_URL, archive, progress, timeout)
        except FetchError:
            raise
        except OSError as problem:
            raise FetchError("Nie udało się pobrać dodatków dźwięku. Sprawdź internet i spróbuj ponownie.") from problem
        if got != TOOLS_SHA256:
            raise FetchError("Pobrany plik nie zgadza się z wzorcem. Nic nie zostało zapisane. Spróbuj ponownie.")
        unpacked = work / "x"
        unpacked.mkdir()
        try:
            _unpack(archive, unpacked)
        except (tarfile.TarError, EOFError, OSError) as problem:
            raise FetchError("Nie udało się rozpakować dodatków dźwięku.") from problem
        if not all((unpacked / name).is_file() for name in MEMBERS):
            raise FetchError("W paczce z dodatkami czegoś brakuje.")
        (unpacked / READY_MARK).write_text(TOOLS_VERSION, encoding="ascii")
        if final.exists():
            shutil.rmtree(final, ignore_errors=True)
        os.replace(unpacked, final)
        return final
    finally:
        shutil.rmtree(work, ignore_errors=True)
        # Older versions made by this module are no longer used. Anything else in the folder stays.
        for old in parent.iterdir() if parent.is_dir() else ():
            if old.is_dir() and old.name != TOOLS_VERSION and old.name.startswith(OWNED_PREFIX) and (old / READY_MARK).is_file():
                shutil.rmtree(old, ignore_errors=True)


def self_test() -> None:
    """Offline checks: a fake archive with the right hash is unpacked, a wrong hash or extra member is refused."""
    import io
    import http.server
    import threading

    global TOOLS_SHA256, TOOLS_SIZE
    saved = (TOOLS_SHA256, TOOLS_SIZE)
    with tempfile.TemporaryDirectory() as tmp:
        base = Path(tmp)

        def make(names: tuple[str, ...]) -> bytes:
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode="w:xz") as tar:
                for name in names:
                    data = f"{name} test".encode()
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    tar.addfile(info, io.BytesIO(data))
            return buffer.getvalue()

        good = make(MEMBERS)
        bad = make((*MEMBERS, "../evil.exe"))
        files = {"/good": good, "/bad": bad}

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):  # noqa: N802
                body = files.get(self.path, b"")
                self.send_response(200 if body else 404)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        port = server.server_address[1]
        try:
            TOOLS_SHA256, TOOLS_SIZE = hashlib.sha256(good).hexdigest(), len(good)
            foreign = tools_dir(base / "a").parent / "7zip"
            foreign.mkdir(parents=True)
            (foreign / "7z.exe").write_bytes(b"x")
            stale = tools_dir(base / "a").parent / "ffmpeg-0.0-old"
            stale.mkdir()
            (stale / READY_MARK).write_text("old")
            seen: list[int] = []
            folder = fetch(lambda done, total: seen.append(done), root=base / "a", url=f"http://127.0.0.1:{port}/good")
            assert ready(folder) and (folder / "ffmpeg.exe").read_bytes() == b"ffmpeg.exe test", "unpack"
            assert seen and seen[-1] == len(good), "progress"
            assert (foreign / "7z.exe").is_file(), "someone else's folder must stay"
            assert not stale.exists(), "an older own version is removed"
            assert tool_path("ffplay.exe", folder) == folder / "ffplay.exe", "tool_path"
            assert fetch(root=base / "a", url="http://127.0.0.1:1/never") == folder, "ready folder is reused"
            TOOLS_SHA256 = "0" * 64
            try:
                fetch(root=base / "b", url=f"http://127.0.0.1:{port}/good")
                raise AssertionError("wrong hash accepted")
            except FetchError:
                pass
            assert not ready(tools_dir(base / "b")), "nothing kept after a wrong hash"
            TOOLS_SHA256, TOOLS_SIZE = hashlib.sha256(bad).hexdigest(), len(bad)
            try:
                fetch(root=base / "c", url=f"http://127.0.0.1:{port}/bad")
                raise AssertionError("extra member accepted")
            except FetchError:
                pass
            assert not (base / "evil.exe").exists() and not (base / "c" / "evil.exe").exists(), "path escape"
            try:
                fetch(root=base / "d", url=f"http://127.0.0.1:{port}/missing")
                raise AssertionError("404 accepted")
            except FetchError:
                pass
            assert tool_path("ffmpeg.exe", tools_dir(base / "d")) is None, "missing tools give None"
        finally:
            server.shutdown()
            TOOLS_SHA256, TOOLS_SIZE = saved
    print("tools_fetch self-test ok")


if __name__ == "__main__":
    self_test()
