"""Windows recorder. Mic to WAV, then the existing account, site, and project.

Run: python desktop/recorder/record_app.py
Mix and master stay on the site. This program does not load VST plugins.
"""

from __future__ import annotations

import ctypes
import json
import os
import sys
import tkinter as tk
import urllib.error
import urllib.request
from pathlib import Path

from account_upload import SITE, upload_vocal, SiteClient
from record_wav import RATE, resample_pcm16, write_pcm16_wav

SESSION = Path(os.environ.get("APPDATA", ".")) / "BitRymDym" / "desktop-session.json"
ALIAS = "brdrec"


def mci(command: str) -> None:
    winmm = ctypes.windll.winmm
    error = winmm.mciSendStringW(command, None, 0, None)
    if error:
        message = ctypes.create_unicode_buffer(256)
        winmm.mciGetErrorStringW(error, message, 256)
        raise RuntimeError(message.value or f"mci {error}")


def close_alias() -> None:
    try:
        mci(f"close {ALIAS}")
    except RuntimeError:
        return


def open_mic() -> int:
    last: Exception | None = None
    for rate in (RATE, 44_100):
        close_alias()
        try:
            mci(f"open new type waveaudio alias {ALIAS}")
            mci(f"set {ALIAS} bitspersample 16 channels 1 samplespersec {rate}")
            return rate
        except RuntimeError as error:
            last = error
            close_alias()
    raise last or RuntimeError("Mikrofon jest niedostępny.")


def normalize_saved_wav(path: Path, captured_rate: int) -> None:
    if captured_rate == RATE:
        return
    import wave

    with wave.open(str(path), "rb") as handle:
        raw = handle.readframes(handle.getnframes())
        width = handle.getsampwidth()
        channels = handle.getnchannels()
    if width != 2 or channels != 1:
        raise RuntimeError("Nagranie nie jest mono 16-bit.")
    import struct

    samples = list(struct.unpack("<" + "h" * (len(raw) // 2), raw))
    write_pcm16_wav(path, resample_pcm16(samples, captured_rate, RATE), RATE)


def record_seconds(path: Path, seconds: float) -> None:
    if seconds <= 0:
        raise ValueError("Czas nagrania musi być większy od zera.")
    rate = open_mic()
    try:
        mci(f"record {ALIAS}")
        import time

        time.sleep(seconds)
        mci(f"stop {ALIAS}")
        path.parent.mkdir(parents=True, exist_ok=True)
        mci(f'save {ALIAS} "{path}"')
    finally:
        close_alias()
    normalize_saved_wav(path, rate)


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
        self.root.geometry("460x360")
        self.recording = False
        self.capture_rate = RATE
        self.wav_path = Path(os.environ.get("TEMP", ".")) / "bitrymdym-vocal.wav"
        self.status = tk.StringVar(value="Zaloguj się tym samym kontem co na stronie.")
        self.email = tk.Entry(self.root, width=42)
        self.password = tk.Entry(self.root, width=42, show="*")
        self.supabase_url = tk.Entry(self.root, width=42)
        self.anon_key = tk.Entry(self.root, width=42, show="*")
        self.title_box = tk.Entry(self.root, width=42)
        self.beat_box = tk.Entry(self.root, width=42)
        self.title_box.insert(0, "Nagranie z komputera")
        saved = load_session()
        if saved:
            self.email.insert(0, saved.get("email", ""))
            self.supabase_url.insert(0, saved.get("supabaseUrl", ""))
            self.anon_key.insert(0, saved.get("anonKey", ""))
            self.status.set("Jest zapisana sesja tego konta.")
        self._row("E-mail", self.email)
        self._row("Hasło", self.password)
        self._row("Adres Supabase", self.supabase_url)
        self._row("Klucz publiczny", self.anon_key)
        self._row("Tytuł", self.title_box)
        self._row("Id bitu", self.beat_box)
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

    def token(self) -> str:
        saved = load_session()
        token = saved.get("accessToken") if saved else None
        if not token:
            raise RuntimeError("Najpierw się zaloguj.")
        return token

    def sign_in(self) -> None:
        try:
            grant = supabase_password_grant(
                self.supabase_url.get().strip(),
                self.anon_key.get().strip(),
                self.email.get().strip(),
                self.password.get(),
            )
            save_session(
                self.supabase_url.get().strip(),
                self.anon_key.get().strip(),
                self.email.get().strip(),
                grant,
            )
            self.password.delete(0, "end")
            self.status.set("Zalogowano. Nagraj wokal, potem wyślij na konto.")
        except Exception as error:
            self.status.set(str(error))

    def arm(self) -> None:
        try:
            self.capture_rate = open_mic()
            mci(f"record {ALIAS}")
            self.recording = True
            self.status.set("Nagrywam z mikrofonu. Stop wyśle WAV na konto.")
        except Exception as error:
            self.recording = False
            close_alias()
            self.status.set(str(error))

    def stop_and_send(self) -> None:
        try:
            if not self.recording:
                raise RuntimeError("Najpierw naciśnij Nagraj.")
            mci(f"stop {ALIAS}")
            self.wav_path.parent.mkdir(parents=True, exist_ok=True)
            mci(f'save {ALIAS} "{self.wav_path}"')
            close_alias()
            self.recording = False
            normalize_saved_wav(self.wav_path, self.capture_rate)
            project = upload_vocal(
                SiteClient(SITE, self.token()),
                title=self.title_box.get().strip(),
                beat_id=self.beat_box.get().strip(),
                wav_path=self.wav_path,
            )
            self.status.set(f"Projekt jest na koncie. Otwórz go na stronie. Id: {project}")
        except Exception as error:
            self.recording = False
            close_alias()
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
        print("recorder self-test ok")
    else:
        # Keep the WAV writer available for a silent tone when the mic is closed.
        _ = write_pcm16_wav
        RecorderWindow().run()
