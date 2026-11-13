"""Windows playback devices for the recorder monitor.

waveOut is the Windows mixer endpoint (speakers, headphones, a Bluetooth headset).
The default listen path can stay on ffplay. A chosen device gets the WAV stream
here, so the microphone and the headphones can be two different devices.
Linux has no waveOut: listing is empty and the tone test says so. No ffmpeg.
"""

from __future__ import annotations

import io
import math
import os
import struct
import subprocess
import threading
import time
from typing import BinaryIO

WAVE_MAPPER = 0xFFFFFFFF
WHDR_DONE = 0x00000001
MMSYSERR_NOERROR = 0


def output_devices() -> list[tuple[str, int]]:
    """Playback endpoints as (name, waveOut index). Empty outside Windows."""
    if os.name != "nt":
        return []
    try:
        winmm = _winmm()
        count = int(winmm.waveOutGetNumDevs())
    except OSError:
        return []
    found: list[tuple[str, int]] = []
    seen: dict[str, int] = {}
    for index in range(count):
        caps = WAVEOUTCAPS()
        code = winmm.waveOutGetDevCapsW(index, ctypes_byref(caps), _sizeof(caps))
        if code != MMSYSERR_NOERROR:
            continue
        name = (caps.szPname or "").strip() or f"Wyjście {index + 1}"
        seen[name] = seen.get(name, 0) + 1
        if seen[name] > 1:
            name = f"{name} ({seen[name]})"
        found.append((name, index))
    return found


def tone_wav(seconds: float = 0.45, rate: int = 48000) -> bytes:
    """A short stereo A440 with a fade, so the output test is obvious and not a click."""
    frames = max(1, int(rate * max(0.2, min(2.0, seconds))))
    fade = min(400, frames // 4 or 1)
    pcm = bytearray()
    for i in range(frames):
        env = 1.0
        if i < fade:
            env = i / fade
        elif i > frames - fade:
            env = max(0.0, (frames - i) / fade)
        value = int(9000 * env * math.sin(2 * math.pi * 440 * i / rate))
        pcm += struct.pack("<hh", value, value)
    return _wav_wrap(bytes(pcm), rate, 2)


def read_wav_format(stream: BinaryIO) -> tuple[int, int, int]:
    """Leave the stream at the first PCM byte. Returns rate, channels, bits."""
    prefix = stream.read(12)
    if len(prefix) < 12 or prefix[0:4] != b"RIFF" or prefix[8:12] != b"WAVE":
        raise RuntimeError("Odsłuch nie oddał WAV.")
    rate = channels = bits = 0
    while True:
        chunk = stream.read(8)
        if len(chunk) < 8:
            raise RuntimeError("Odsłuch urwał nagłówek.")
        tag, size = struct.unpack("<4sI", chunk)
        if tag == b"data":
            if rate <= 0 or channels <= 0 or bits != 16:
                raise RuntimeError("Odsłuch nie jest PCM 16-bit.")
            return rate, channels, bits
        payload = stream.read(size)
        if size % 2 == 1:
            stream.read(1)
        if tag == b"fmt " and len(payload) >= 16:
            audio_format, channels, rate, _byte_rate, _align, bits = struct.unpack("<HHIIHH", payload[:16])
            if audio_format != 1:
                raise RuntimeError("Odsłuch nie jest PCM.")


def play_tone(device_index: int, seconds: float = 0.45) -> str:
    """Play the test tone and wait. Empty string means it was heard. device_index -1 is Windows default."""
    if os.name != "nt":
        return "Test odsłuchu działa na Windows."
    player = WavePlayer(io.BytesIO(tone_wav(seconds)), device_index)
    player.start()
    try:
        player.wait(seconds + 2.5)
    except subprocess.TimeoutExpired:
        player.terminate()
        return "Wyjście nie oddało tonu w czas."
    return player.note


class WavePlayer:
    """Reads a WAV stream and plays it on one waveOut device. poll/terminate match what the monitor stopper expects."""

    def __init__(self, stream: BinaryIO, device_index: int) -> None:
        self._stream = stream
        self._device = WAVE_MAPPER if device_index < 0 else int(device_index)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="bitrymdym-output", daemon=True)
        self._code: int | None = None
        self.note = ""
        self._winmm: object | None = None
        self._handle: object | None = None
        self._alive: list[tuple[object, WAVEHDR]] = []

    def start(self) -> None:
        self._thread.start()

    def poll(self) -> int | None:
        return self._code

    def terminate(self) -> None:
        self._stop.set()
        winmm, handle = self._winmm, self._handle
        if winmm is not None and handle is not None:
            try:
                winmm.waveOutReset(handle)  # type: ignore[attr-defined]
            except Exception:
                pass

    def kill(self) -> None:
        self.terminate()

    def wait(self, timeout: float | None = None) -> int:
        self._thread.join(timeout)
        if self._thread.is_alive():
            raise subprocess.TimeoutExpired("waveOut", timeout or 0)
        return 0 if self._code is None else self._code

    def _run(self) -> None:
        try:
            if os.name != "nt":
                self.note = "Test odsłuchu działa na Windows."
                self._code = 1
                return
            rate, channels, bits = read_wav_format(self._stream)
            self._play(rate, channels, bits)
            if self._code is None:
                self._code = 0
        except Exception as error:
            self.note = str(error) or "To wyjście nie przyjęło dźwięku."
            self._code = 1
        finally:
            self._close()

    def _play(self, rate: int, channels: int, bits: int) -> None:
        """Keep four buffers queued so the device does not click between reads."""
        winmm = _winmm()
        handle = _open_out(winmm, self._device, rate, channels, bits)
        self._winmm = winmm
        self._handle = handle
        align = channels * (bits // 8)
        block = max(align, (rate * align * 80) // 1000)
        block -= block % align
        eof = False
        while not self._stop.is_set():
            self._reap(winmm, handle)
            while not eof and len(self._alive) < 4 and not self._stop.is_set():
                data = self._stream.read(block)
                if not data:
                    eof = True
                    break
                if len(data) % align:
                    data = data[: len(data) - (len(data) % align)]
                if data:
                    self._queue(winmm, handle, data)
            if eof and not self._alive:
                break
            if self._stop.is_set():
                self._code = 0
                break
            time.sleep(0.01)
        self._reap(winmm, handle, force=True)

    def _queue(self, winmm: object, handle: object, data: bytes) -> None:
        buf = ctypes_create(data)
        hdr = WAVEHDR()
        hdr.lpData = ctypes_address(buf)
        hdr.dwBufferLength = len(data)
        prepared = winmm.waveOutPrepareHeader(handle, ctypes_byref(hdr), _sizeof(hdr))  # type: ignore[attr-defined]
        if prepared != MMSYSERR_NOERROR:
            raise RuntimeError("To wyjście nie przyjęło dźwięku. Wybierz inne albo Domyślne.")
        wrote = winmm.waveOutWrite(handle, ctypes_byref(hdr), _sizeof(hdr))  # type: ignore[attr-defined]
        if wrote != MMSYSERR_NOERROR:
            raise RuntimeError("To wyjście nie gra. Wybierz inne albo Domyślne.")
        self._alive.append((buf, hdr))

    def _reap(self, winmm: object, handle: object, force: bool = False) -> None:
        still: list[tuple[object, WAVEHDR]] = []
        for buf, hdr in self._alive:
            if force or (hdr.dwFlags & WHDR_DONE):
                try:
                    winmm.waveOutUnprepareHeader(handle, ctypes_byref(hdr), _sizeof(hdr))  # type: ignore[attr-defined]
                except Exception:
                    pass
            else:
                still.append((buf, hdr))
        self._alive = still

    def _close(self) -> None:
        winmm, handle = self._winmm, self._handle
        self._handle = None
        if winmm is not None and handle is not None:
            try:
                winmm.waveOutReset(handle)  # type: ignore[attr-defined]
                winmm.waveOutClose(handle)  # type: ignore[attr-defined]
            except Exception:
                pass
        try:
            self._stream.close()
        except Exception:
            pass


def _wav_wrap(pcm: bytes, rate: int, channels: int) -> bytes:
    bits = 16
    align = channels * bits // 8
    fmt = struct.pack("<HHIIHH", 1, channels, rate, rate * align, align, bits)
    return b"".join(
        (
            b"RIFF",
            struct.pack("<I", 36 + len(pcm)),
            b"WAVE",
            b"fmt ",
            struct.pack("<I", len(fmt)),
            fmt,
            b"data",
            struct.pack("<I", len(pcm)),
            pcm,
        )
    )


def self_test() -> None:
    wav = tone_wav(0.2)
    rate, channels, bits = read_wav_format(io.BytesIO(wav))
    if rate != 48000 or channels != 2 or bits != 16:
        raise SystemExit("ton")
    if wav[0:4] != b"RIFF":
        raise SystemExit("wav")
    if os.name != "nt":
        if output_devices() != []:
            raise SystemExit("wyjścia")
        if "Windows" not in play_tone(-1, 0.2):
            raise SystemExit("ton poza Windows")
    else:
        listed = output_devices()
        if any(index < 0 or not name for name, index in listed):
            raise SystemExit("wyjścia Windows")
    print("win output self-test ok")


# ctypes stays below the public functions so a reader sees the behavior first.
# The structures match winmm WAVEFORMATEX / WAVEHDR / WAVEOUTCAPSW.

import ctypes
from ctypes import wintypes


class WAVEFORMATEX(ctypes.Structure):
    _fields_ = (
        ("wFormatTag", wintypes.WORD),
        ("nChannels", wintypes.WORD),
        ("nSamplesPerSec", wintypes.DWORD),
        ("nAvgBytesPerSec", wintypes.DWORD),
        ("nBlockAlign", wintypes.WORD),
        ("wBitsPerSample", wintypes.WORD),
        ("cbSize", wintypes.WORD),
    )


class WAVEHDR(ctypes.Structure):
    _fields_ = (
        ("lpData", ctypes.c_void_p),
        ("dwBufferLength", wintypes.DWORD),
        ("dwBytesRecorded", wintypes.DWORD),
        ("dwUser", ctypes.c_size_t),
        ("dwFlags", wintypes.DWORD),
        ("dwLoops", wintypes.DWORD),
        ("lpNext", ctypes.c_void_p),
        ("reserved", ctypes.c_void_p),
    )


class WAVEOUTCAPS(ctypes.Structure):
    _fields_ = (
        ("wMid", wintypes.WORD),
        ("wPid", wintypes.WORD),
        ("vDriverVersion", wintypes.UINT),
        ("szPname", ctypes.c_wchar * 32),
        ("dwFormats", wintypes.DWORD),
        ("wChannels", wintypes.WORD),
        ("wReserved1", wintypes.WORD),
        ("dwSupport", wintypes.DWORD),
    )


def _winmm() -> ctypes.WinDLL:
    winmm = ctypes.WinDLL("winmm")
    winmm.waveOutGetNumDevs.restype = ctypes.c_uint
    winmm.waveOutGetDevCapsW.argtypes = [ctypes.c_uint, ctypes.POINTER(WAVEOUTCAPS), ctypes.c_uint]
    winmm.waveOutGetDevCapsW.restype = ctypes.c_uint
    winmm.waveOutOpen.argtypes = [
        ctypes.POINTER(ctypes.c_void_p),
        ctypes.c_uint,
        ctypes.POINTER(WAVEFORMATEX),
        ctypes.c_void_p,
        ctypes.c_void_p,
        ctypes.c_uint,
    ]
    winmm.waveOutOpen.restype = ctypes.c_uint
    for name in ("waveOutPrepareHeader", "waveOutUnprepareHeader", "waveOutWrite"):
        fn = getattr(winmm, name)
        fn.argtypes = [ctypes.c_void_p, ctypes.POINTER(WAVEHDR), ctypes.c_uint]
        fn.restype = ctypes.c_uint
    for name in ("waveOutReset", "waveOutClose"):
        fn = getattr(winmm, name)
        fn.argtypes = [ctypes.c_void_p]
        fn.restype = ctypes.c_uint
    return winmm


def _open_out(winmm: ctypes.WinDLL, device: int, rate: int, channels: int, bits: int) -> ctypes.c_void_p:
    fmt = WAVEFORMATEX()
    fmt.wFormatTag = 1
    fmt.nChannels = channels
    fmt.nSamplesPerSec = rate
    fmt.wBitsPerSample = bits
    fmt.nBlockAlign = channels * (bits // 8)
    fmt.nAvgBytesPerSec = rate * fmt.nBlockAlign
    handle = ctypes.c_void_p()
    code = winmm.waveOutOpen(ctypes.byref(handle), ctypes.c_uint(device), ctypes.byref(fmt), None, None, 0)
    if code != MMSYSERR_NOERROR or not handle.value:
        raise RuntimeError("To wyjście nie przyjęło dźwięku. Wybierz inne albo Domyślne.")
    return handle


def ctypes_byref(value: object) -> object:
    return ctypes.byref(value)  # type: ignore[arg-type]


def ctypes_create(data: bytes) -> ctypes.Array:
    return ctypes.create_string_buffer(data, len(data))


def ctypes_address(buf: object) -> int:
    return ctypes.addressof(buf)  # type: ignore[arg-type]


def _sizeof(value: object) -> int:
    return ctypes.sizeof(value)  # type: ignore[arg-type]


if __name__ == "__main__":
    self_test()
