#!/usr/bin/env python3
"""BitRymDym upload filter: vocal stem energy via Demucs (htdemucs, CPU).

Usage: vocal_ratio.py <input.wav> <workdir> [threshold_db]
Prints one JSON line: {"ok":true,"ratio":..,"windows":[..],"prescreen":..,"model":"htdemucs"}
Windows = 1 s frames where vocal stem RMS (dBFS) > threshold (default -30).
Pre-screen = share of frames where vocal stem RMS is within 12 dB of the mix
(cheap ratio, computed from the same separation; null if unavailable).
"""
import json, math, subprocess, sys, os, wave

def rms_db_frames(path):
    import numpy as np
    with wave.open(path, "rb") as w:
        sr, ch, n, sw = w.getframerate(), w.getnchannels(), w.getnframes(), w.getsampwidth()
        raw = w.readframes(n)
    dtype = {2: np.int16, 4: np.int32}[sw]
    x = np.frombuffer(raw, dtype=dtype).astype(np.float32) / float(np.iinfo(dtype).max)
    x = x.reshape(-1, ch).mean(axis=1)
    out = []
    for i in range(0, len(x) // sr):
        seg = x[i * sr:(i + 1) * sr]
        r = float(np.sqrt(np.mean(seg * seg)) + 1e-12)
        out.append(20 * math.log10(r))
    return out

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "usage"})); return 2
    src, work = sys.argv[1], sys.argv[2]
    thr = float(sys.argv[3]) if len(sys.argv) > 3 else -30.0
    model = os.environ.get("DEMUCS_MODEL", "htdemucs")
    try:
        subprocess.run([sys.executable, "-m", "demucs", "--two-stems=vocals", "-n", model, "-d", "cpu",
                        "-o", work, src],
                       check=True, capture_output=True, timeout=int(os.environ.get("DEMUCS_TIMEOUT_S", "1500")))
    except subprocess.TimeoutExpired:
        print(json.dumps({"ok": False, "error": "vocal_timeout", "model": model})); return 0
    except Exception:
        print(json.dumps({"ok": False, "error": "demucs_failed", "model": model})); return 0
    base = os.path.splitext(os.path.basename(src))[0]
    vocals = os.path.join(work, model, base, "vocals.wav")
    try:
        v = rms_db_frames(vocals)
        try:
            m = rms_db_frames(src)
            close = sum(1 for a, b in zip(v, m) if a > thr and a > b - 12)
            pre = round(close / max(1, len(v)), 4)
        except Exception:
            pre = None
        hits = [i for i, d in enumerate(v) if d > thr]
        windows = [{"startSeconds": i, "endSeconds": i + 1, "db": round(v[i], 1)} for i in hits[:50]]
        print(json.dumps({"ok": True, "ratio": round(len(hits) / max(1, len(v)), 4),
                          "windows": windows, "prescreen": pre, "model": model}))
    except Exception:
        print(json.dumps({"ok": False, "error": "vocal_read_failed", "model": model}))
    return 0

if __name__ == "__main__":
    sys.exit(main())
