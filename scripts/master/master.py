#!/usr/bin/env python3
"""BitRymDym Studio — mastering engine (E3 worker, separate process).

Runs as its own process on the E3 host; the Node poller only spawns it and
reads one JSON line from stdout. pedalboard is GPL-3.0 — it is NOT linked
into the web app, it only runs here as a standalone server-side program.

Usage:
  master.py analyze --in mix.wav
  master.py master  --in mix.wav --out master.wav --target streaming \
                    [--settings '{"loudness":0,"bright":0,"bass":0,"width":0,"squash":0}']
  master.py master  ... --reference ref.wav   -> reference mode (backlog, matchering)

Chain: HPF 25 Hz -> tonal shelves -> 3-band compression (LR4 split) ->
mid/side width -> gain to target LUFS -> limiter, iterated until
integrated LUFS is within ±0.3 LU and true peak (4x oversampled) <= target.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from pedalboard import Compressor, Gain, HighpassFilter, HighShelfFilter, Limiter, LowShelfFilter, Pedalboard
from scipy.signal import butter, resample_poly, sosfilt

TARGETS = {
    "streaming": {"lufs": -14.0, "tp": -1.0},
    "youtube": {"lufs": -14.0, "tp": -1.0},
    "headphones": {"lufs": -16.0, "tp": -1.0},
    "club": {"lufs": -9.0, "tp": -0.3},
}

# Hip-hop / rap reference tonal balance: band energy relative to total (dB).
# Derived as a smooth "modern rap" tilt; tolerance ±3 dB per band.
BANDS = [("sub", 20, 60), ("bass", 60, 250), ("lowmid", 250, 1000), ("mid", 1000, 4000), ("high", 4000, 10000), ("air", 10000, 20000)]
HIPHOP_REFERENCE_DB = {"sub": -6.5, "bass": -4.0, "lowmid": -8.5, "mid": -11.0, "high": -16.0, "air": -25.0}

SETTINGS_LIMITS = {"loudness": (-3.0, 3.0), "bright": (-3.0, 3.0), "bass": (-3.0, 3.0), "width": (-3.0, 3.0), "squash": (-3.0, 3.0)}


def clamp_settings(raw: dict | None) -> dict:
    out = {}
    for k, (lo, hi) in SETTINGS_LIMITS.items():
        v = (raw or {}).get(k, 0)
        try:
            v = float(v)
        except (TypeError, ValueError):
            v = 0.0
        out[k] = max(lo, min(hi, v if np.isfinite(v) else 0.0))
    return out


def to_stereo(x: np.ndarray) -> np.ndarray:
    if x.ndim == 1:
        x = x[:, None]
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    return x[:, :2].astype(np.float32)


TP_BLOCK = 1 << 17  # samples per block: keeps the 4x upsampled copy ~10 MB instead of ~700 MB for 4:00
TP_PAD = 256  # context on both sides so block edges match the whole-signal result

# scipy / pyloudnorm / pedalboard release the GIL, so independent work runs on threads
# (same numbers, just less wall time). Two pools so nested submits can't deadlock:
# _BLOCKS only runs leaf work (true-peak blocks), _TASKS runs the independent analysis measurements.
THREADS = max(1, min(4, int(os.environ.get("STUDIO_MASTER_PY_THREADS") or (os.cpu_count() or 1))))
_BLOCKS = ThreadPoolExecutor(max_workers=THREADS)
_TASKS = ThreadPoolExecutor(max_workers=6)


def _tp_block(x: np.ndarray, start: int) -> float:
    n = len(x)
    a, b = max(0, start - TP_PAD), min(n, start + TP_BLOCK + TP_PAD)
    up = resample_poly(x[a:b], 4, 1, axis=0)
    lo, hi = (start - a) * 4, (min(n, start + TP_BLOCK) - a) * 4
    return float(np.max(np.abs(up[lo:hi]))) if hi > lo else 0.0


def true_peak_db(x: np.ndarray) -> float:
    peak = max([0.0, *_BLOCKS.map(lambda s: _tp_block(x, s), range(0, len(x), TP_BLOCK))])
    return 20 * np.log10(peak) if peak > 0 else -120.0


def integrated_lufs(x: np.ndarray, sr: int) -> float:
    v = pyln.Meter(sr).integrated_loudness(x)
    return float(v) if np.isfinite(v) else -70.0


def loudness_range(x: np.ndarray, sr: int) -> float:
    """EBU R128 LRA approx: short-term (3 s, 1 s hop) 10..95 percentile, gated."""
    meter = pyln.Meter(sr, block_size=3.0)
    win, hop = int(3 * sr), int(sr)
    vals = []
    for start in range(0, max(1, len(x) - win + 1), hop):
        seg = x[start:start + win]
        if len(seg) < win:
            break
        v = meter.integrated_loudness(seg)
        if np.isfinite(v) and v > -70:
            vals.append(v)
    if len(vals) < 2:
        return 0.0
    vals = np.array(vals)
    rel = 10 * np.log10(np.mean(10 ** (vals / 10))) - 20
    vals = vals[vals > rel]
    if len(vals) < 2:
        return 0.0
    return float(np.percentile(vals, 95) - np.percentile(vals, 10))


def tonal_balance(x: np.ndarray, sr: int) -> dict:
    mono = x.mean(axis=1)
    spec = np.abs(np.fft.rfft(mono * np.hanning(len(mono)))) ** 2
    freqs = np.fft.rfftfreq(len(mono), 1 / sr)
    total = spec[(freqs >= 20) & (freqs <= 20000)].sum() + 1e-20
    out = {}
    for name, lo, hi in BANDS:
        e = spec[(freqs >= lo) & (freqs < min(hi, sr / 2))].sum() + 1e-20
        db = 10 * np.log10(e / total)
        out[name] = {"db": round(float(db), 2), "ref": HIPHOP_REFERENCE_DB[name], "delta": round(float(db - HIPHOP_REFERENCE_DB[name]), 2)}
    return out


def stereo_stats(x: np.ndarray) -> dict:
    # Block-wise float64 sums (same result, no full-length float64 copies).
    ll = rr = lr = 0.0
    for a in range(0, len(x), TP_BLOCK):
        blk = x[a:a + TP_BLOCK].astype(np.float64)
        l, r = blk[:, 0], blk[:, 1]
        ll += float(l @ l); rr += float(r @ r); lr += float(l @ r)
    denom = np.sqrt(ll * rr)
    corr = float(lr / denom) if denom > 0 else 1.0
    # mid=(l+r)/2, side=(l-r)/2 → energies from the same sums
    m2, s2 = (ll + rr + 2 * lr) / 4, (ll + rr - 2 * lr) / 4
    side_ratio = float(np.sqrt(max(s2, 0.0) / m2)) if m2 > 0 else 0.0
    return {"correlation": round(corr, 3), "sideToMid": round(side_ratio, 3)}


def analyze(x: np.ndarray, sr: int) -> dict:
    x = to_stereo(x)
    f_lufs = _TASKS.submit(integrated_lufs, x, sr)
    f_lra = _TASKS.submit(loudness_range, x, sr)
    f_stereo = _TASKS.submit(stereo_stats, x)
    tp = true_peak_db(x)
    rms = float(np.sqrt(np.mean(x ** 2)))
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    lufs = f_lufs.result()
    lra, stereo = f_lra.result(), f_stereo.result()
    plr = round(tp - lufs, 2)
    crest = round(20 * np.log10(peak / rms), 2) if rms > 0 and peak > 0 else 0.0
    return {
        "lufs": round(lufs, 2),
        "lra": round(lra, 2),
        "truePeakDb": round(tp, 2),
        "plr": plr,
        "crestDb": crest,
        "stereo": stereo,
        # Full-length FFT is the memory peak → runs alone, after the other measurements.
        "tonal": tonal_balance(x, sr),
        "durationS": round(len(x) / sr, 2),
    }


def lr4(x: np.ndarray, sr: int, f: float, kind: str) -> np.ndarray:
    sos = butter(2, f, btype=kind, fs=sr, output="sos")
    return sosfilt(sos, sosfilt(sos, x, axis=0), axis=0).astype(np.float32)


def multiband(x: np.ndarray, sr: int, squash: float) -> np.ndarray:
    # squash -3..3 → ratio/threshold; 0 = gentle glue.
    # Bands are built and compressed one at a time (float32) so a 4:00 song stays well
    # under the worker's memory cap; the result is identical to summing all three at once.
    ratio = float(np.interp(squash, [-3, 0, 3], [1.2, 2.0, 4.0]))
    thr = float(np.interp(squash, [-3, 0, 3], [-12, -18, -26]))

    def comp(band: np.ndarray, attack: float, release: float) -> np.ndarray:
        c = Pedalboard([Compressor(threshold_db=thr, ratio=ratio, attack_ms=attack, release_ms=release)])
        return c(band, sr)

    # Sequential on purpose: running the bands concurrently saves ~1 s but costs ~600 MB
    # (float64 filter intermediates), too close to the worker's 2G cap.
    y = comp(lr4(x, sr, 150, "lowpass"), 30, 200)
    rest = lr4(x, sr, 150, "highpass")
    y = y + comp(lr4(rest, sr, 4000, "lowpass"), 15, 150)
    high = lr4(rest, sr, 4000, "highpass")
    del rest
    y = y + comp(high, 5, 80)
    return y.astype(np.float32)


def width(x: np.ndarray, amount: float) -> np.ndarray:
    k = float(np.interp(amount, [-3, 0, 3], [0.6, 1.0, 1.4]))
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2 * k
    return np.stack([mid + side, mid - side], axis=1).astype(np.float32)


def master(x: np.ndarray, sr: int, target: str, settings: dict) -> tuple[np.ndarray, dict]:
    if target not in TARGETS:
        raise ValueError("bad_target")
    s = clamp_settings(settings)
    goal_lufs = TARGETS[target]["lufs"] + s["loudness"]
    goal_tp = TARGETS[target]["tp"]
    x = to_stereo(x)
    tone = Pedalboard([
        HighpassFilter(cutoff_frequency_hz=25),
        LowShelfFilter(cutoff_frequency_hz=110, gain_db=1.5 * s["bass"]),
        HighShelfFilter(cutoff_frequency_hz=8000, gain_db=1.5 * s["bright"]),
    ])
    y = tone(x.T.copy(), sr).T
    y = multiband(y, sr, s["squash"])
    y = width(y, s["width"])
    pre = y
    gain = goal_lufs - integrated_lufs(pre, sr)
    ceiling = goal_tp - 0.6  # sample-peak ceiling; inter-sample overs handled below
    out = pre
    for _ in range(8):
        out = Pedalboard([Gain(gain_db=gain), Limiter(threshold_db=ceiling, release_ms=120)])(pre.T.copy(), sr).T
        tp = true_peak_db(out)
        if tp > goal_tp:
            out = out * (10 ** ((goal_tp - 0.05 - tp) / 20))
        got = integrated_lufs(out, sr)
        err = goal_lufs - got
        if abs(err) <= 0.3:
            break
        gain += err
    tp = true_peak_db(out)
    if tp > goal_tp:  # final safety trim
        out = out * (10 ** ((goal_tp - 0.05 - tp) / 20))
    report = analyze(out, sr)
    report.update({"target": target, "targetLufs": goal_lufs, "targetTp": goal_tp, "settings": s})
    return out.astype(np.float32), report


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["analyze", "master", "zip"])
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out")
    ap.add_argument("--target", default="streaming")
    ap.add_argument("--settings", default="{}")
    ap.add_argument("--reference")
    a = ap.parse_args(argv)
    try:
        if a.cmd == "zip":
            # Projekt: every track WAV in --in (dir) → lossless 24-bit FLAC inside --out
            # (≈half the size of WAV, so a long 8-track song stays downloadable).
            import os, zipfile
            if not a.out:
                raise ValueError("missing_out")
            names = sorted(n for n in os.listdir(a.inp) if n.lower().endswith(".wav"))
            if not names:
                raise ValueError("no_stems")
            with zipfile.ZipFile(a.out, "w", zipfile.ZIP_STORED) as z:
                for n in names:
                    src = os.path.join(a.inp, n)
                    flac = os.path.splitext(src)[0] + ".flac"
                    data, sr_ = sf.read(src, always_2d=True, dtype="float32")
                    sf.write(flac, data, sr_, format="FLAC", subtype="PCM_24")
                    del data
                    z.write(flac, arcname=os.path.basename(flac))
                    os.remove(flac)
            print(json.dumps({"ok": True, "files": len(names)}))
            return 0
        x, sr = sf.read(a.inp, always_2d=True, dtype="float32")
        if a.cmd == "analyze":
            print(json.dumps({"ok": True, "analysis": analyze(x, sr)}))
            return 0
        if a.reference:
            # Reference mastering (matchering) — interface reserved, backlog.
            print(json.dumps({"ok": False, "error": "reference_not_available"}))
            return 3
        if not a.out:
            raise ValueError("missing_out")
        y, report = master(x, sr, a.target, json.loads(a.settings or "{}"))
        # 24-bit: the limiter keeps peaks below 0 dBTP, so no float headroom is needed.
        sf.write(a.out, y, sr, subtype="PCM_24")
        before = analyze(x, sr)
        print(json.dumps({"ok": True, "before": before, "after": report}))
        return 0
    except Exception as e:  # noqa: BLE001 — single JSON line contract
        print(json.dumps({"ok": False, "error": str(e)[:120]}))
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
