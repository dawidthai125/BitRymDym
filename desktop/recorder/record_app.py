"""Windows recorder. Mic to WAV, then the existing account, site, and project.

Run: python desktop/recorder/record_app.py
Mix and master stay on the site. This program does not load VST plugins.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tkinter as tk
import urllib.error
import urllib.request
from pathlib import Path

from account_upload import SITE, upload_vocal, SiteClient
from record_wav import write_pcm16_wav

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
        self.root.title("BitRymDym nagrywarka")
        self.root.geometry("520x340")
        self.recording = False
        self.capture: subprocess.Popen[bytes] | None = None
        self.wav_path = Path(os.environ.get("TEMP", ".")) / "bitrymdym-vocal.wav"
        self.public_url = ""
        self.public_key = ""
        self.beats: list[tuple[str, str]] = []
        self.status = tk.StringVar(value="Ładuję listę bitów ze strony.")
        self.email = tk.Entry(self.root, width=42)
        self.password = tk.Entry(self.root, width=42, show="*")
        self.title_box = tk.Entry(self.root, width=42)
        self.beat_var = tk.StringVar()
        self.title_box.insert(0, "Nagranie z komputera")
        saved = load_session()
        if saved:
            self.email.insert(0, saved.get("email", ""))
            self.public_url = saved.get("supabaseUrl", "")
            self.public_key = saved.get("anonKey", "")
            self.status.set("Jest zapisana sesja tego konta.")
        self._load_public()
        self._row("E-mail", self.email)
        self._row("Hasło", self.password)
        self._row("Tytuł", self.title_box)
        labels = [label for _beat_id, label in self.beats] or ["Brak bitu"]
        if not self.beat_var.get():
            self.beat_var.set(labels[0])
        self.beat_menu = tk.OptionMenu(self.root, self.beat_var, *labels)
        self._row("Bit", self.beat_menu)
        bar = tk.Frame(self.root)
        bar.pack(pady=8)
        tk.Button(bar, text="Zaloguj", command=self.sign_in).pack(side="left", padx=4)
        tk.Button(bar, text="Nagraj", command=self.arm).pack(side="left", padx=4)
        tk.Button(bar, text="Stop i wyślij", command=self.stop_and_send).pack(side="left", padx=4)
        tk.Label(self.root, textvariable=self.status, wraplength=420, justify="left").pack(pady=8)

    def _row(self, label: str, widget: tk.Widget) -> None:
        frame = tk.Frame(self.root)
        frame.pack(fill="x", padx=12, pady=2)
        tk.Label(frame, text=label, width=16, anchor="w").pack(side="left")
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
            self.status.set("Zalogowano. Nagraj wokal, potem wyślij na konto.")
        except Exception as error:
            self.status.set(str(error))

    def arm(self) -> None:
        try:
            if self.capture:
                stop_capture(self.capture)
            device = audio_devices(ffmpeg_exe())[0]
            self.capture = start_capture(self.wav_path, device)
            self.recording = True
            self.status.set("Nagrywam z mikrofonu. Stop wyśle WAV na konto.")
        except Exception as error:
            self.recording = False
            self.capture = None
            self.status.set(str(error))

    def stop_and_send(self) -> None:
        try:
            if not self.recording or not self.capture:
                raise RuntimeError("Najpierw naciśnij Nagraj.")
            stop_capture(self.capture)
            self.capture = None
            self.recording = False
            if not self.wav_path.exists() or self.wav_path.stat().st_size < 1000:
                raise RuntimeError("Nagranie jest puste.")
            project = upload_vocal(
                SiteClient(SITE, self.token()),
                title=self.title_box.get().strip(),
                beat_id=self.selected_beat_id(),
                wav_path=self.wav_path,
            )
            self.status.set(f"Projekt jest na koncie. Otwórz go na stronie. Id: {project}")
        except Exception as error:
            self.recording = False
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
        self_test_wav_roundtrip()
        target = Path(os.environ.get("TEMP", ".")) / "bitrymdym-mic-selftest.wav"
        record_seconds(target, 0.4)
        target.unlink(missing_ok=True)
        print("recorder self-test ok")
    else:
        # Keep the WAV writer available for a silent tone when the mic is closed.
        _ = write_pcm16_wav
        RecorderWindow().run()
