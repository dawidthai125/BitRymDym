#!/usr/bin/env python3
"""BitRymDym Studio — mastering engine (E3 worker, separate process).

Runs as its own process on the E3 host; the Node poller only spawns it and
reads one JSON line from stdout. pedalboard is GPL-3.0 — it is NOT linked
into the web app, it only runs here as a standalone server-side program.

Usage:
  master.py analyze --in mix.wav
  master.py master  --in mix.wav --out master.wav --target streaming \
                    [--settings '{"loudness":0,"bright":0,"bass":0,"width":0,"squash":0}']
  master.py master  ... --reference ref.wav [--reference-intensity 0..100]
                    -> reference mode: tonal balance (smoothed, capped matching EQ),
                       loudness and stereo width matched to ref.wav

Chain: HPF 25 Hz -> tonal shelves -> [reference matching EQ] -> 3-band compression
(LR4 split) -> mid/side width [× reference width] -> gain to target LUFS -> limiter,
iterated until integrated LUFS is within ±0.3 LU and true peak (4x oversampled) <= target.

Memory: everything that used to need full-length float64 copies (K-weighting,
LR4 crossovers, spectrum) now runs in chunks; the reference is streamed from disk.
A 4:00 stereo mix + a 10:00 reference stays well under 1.5 GB peak RSS.
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
from scipy.signal import butter, fftconvolve, firwin2, resample_poly, sosfilt

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


def _k_sos(sr: int) -> np.ndarray:
    # pyloudnorm's K-weighting biquads (shelf + RLB) as one float64 SOS cascade.
    return np.array([np.concatenate([f.b, f.a]) for f in pyln.Meter(sr)._filters.values()])


CHUNK = 1 << 18  # samples per chunk for streaming filters (~2 MB float64 per channel)


def sos_apply(sos: np.ndarray, x: np.ndarray) -> np.ndarray:
    """sosfilt along axis 0 in chunks with carried state → float32, same shape.
    Same numbers as one whole-signal float64 sosfilt (the state carries over exactly),
    without full-length float64 intermediates."""
    x2 = x if x.ndim == 2 else x[:, None]
    out = np.empty(x2.shape, dtype=np.float32)

    def run(c: int) -> None:
        zi = np.zeros((sos.shape[0], 2))
        for a in range(0, len(x2), CHUNK):
            y, zi = sosfilt(sos, x2[a:a + CHUNK, c].astype(np.float64), zi=zi)
            out[a:a + CHUNK, c] = y

    list(_BLOCKS.map(run, range(x2.shape[1])))
    return out if x.ndim == 2 else out[:, 0]


class LufsStream:
    """ITU-R BS.1770-4 integrated loudness, fed in blocks (any block size).

    K-weighting runs with carried filter state; energies are summed per 100 ms hop, and
    each 400 ms gating block (75 % overlap) is the sum of 4 hops — the same grid and
    gating as pyloudnorm (<0.001 LU), with O(block) memory, so a 10-minute reference
    can be measured straight from disk."""

    def __init__(self, sr: int, nch: int):
        self.sr, self.nch = sr, nch
        self.hop = int(round(0.1 * sr))
        self.sos = _k_sos(sr)
        self.zi = [np.zeros((self.sos.shape[0], 2)) for _ in range(nch)]
        self.carry = np.zeros((0, nch))
        self.hops: list[np.ndarray] = []
        self.n = 0

    def feed(self, block: np.ndarray) -> None:
        block = block if block.ndim == 2 else block[:, None]
        self.n += len(block)
        y = np.empty((len(block), self.nch))
        for c in range(self.nch):
            y[:, c], self.zi[c] = sosfilt(self.sos, block[:, c].astype(np.float64), zi=self.zi[c])
        y = np.concatenate([self.carry, np.square(y)]) if len(self.carry) else np.square(y)
        whole = (len(y) // self.hop) * self.hop
        if whole:
            self.hops.append(y[:whole].reshape(-1, self.hop, self.nch).sum(axis=1))
        self.carry = y[whole:]

    def result(self) -> float:
        sr, n, t_g, step = self.sr, self.n, 0.4, 0.25
        if n < int(t_g * sr):
            return -70.0
        hops = self.hops + ([self.carry.sum(axis=0, keepdims=True)] if len(self.carry) else [])
        e = np.concatenate(hops) if hops else np.zeros((0, self.nch))
        num_blocks = int(np.round(((n / sr - t_g) / (t_g * step)))) + 1
        e = np.concatenate([e, np.zeros((num_blocks + 4, self.nch))])
        cs = np.concatenate([np.zeros((1, self.nch)), np.cumsum(e, axis=0)])
        j = np.arange(num_blocks)
        z = ((cs[j + 4] - cs[j]) / (t_g * sr)).T  # (nch, num_blocks)
        gains = [1.0, 1.0, 1.0, 1.41, 1.41]
        with np.errstate(divide="ignore", invalid="ignore"):
            wz = np.tensordot(gains[:self.nch], z, axes=1)
            l = -0.691 + 10.0 * np.log10(wz)
            abs_g = l >= -70.0
            if not abs_g.any():
                return -70.0
            gamma_r = -0.691 + 10.0 * np.log10(np.dot(gains[:self.nch], z[:, abs_g].mean(axis=1))) - 10.0
            rel_g = (l > gamma_r) & (l > -70.0)
            if not rel_g.any():
                return -70.0
            v = -0.691 + 10.0 * np.log10(np.dot(gains[:self.nch], z[:, rel_g].mean(axis=1)))
        return float(v) if np.isfinite(v) else -70.0


def integrated_lufs(x: np.ndarray, sr: int) -> float:
    """ITU-R BS.1770-4 gated loudness (pyloudnorm's filters, grid and gating), chunked."""
    x = x if x.ndim == 2 else x[:, None]
    if 0.1 * sr != int(0.1 * sr):  # odd sample rate → reference implementation
        return float(pyln.Meter(sr).integrated_loudness(x))
    m = LufsStream(sr, x.shape[1])
    for a in range(0, len(x), CHUNK):
        m.feed(x[a:a + CHUNK])
    return m.result()


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


SPEC_N = 1 << 15  # Welch segment (≈1.4 Hz bins at 44.1 kHz), Hann, 50 % overlap


class SpectrumStream:
    """Long-term average power spectrum of mid (L+R)/2 and side (L−R)/2, fed in blocks."""

    def __init__(self, sr: int, n: int = SPEC_N):
        self.sr, self.n = sr, n
        self.win = np.hanning(n).astype(np.float32)
        self.carry = np.zeros((0, 2), dtype=np.float32)
        self.mid = np.zeros(n // 2 + 1)
        self.side = np.zeros(n // 2 + 1)
        self.count = 0
        self.freqs = np.fft.rfftfreq(n, 1 / sr)

    def feed(self, block: np.ndarray) -> None:
        buf = np.concatenate([self.carry, to_stereo(block)]) if len(self.carry) else to_stereo(block)
        hop = self.n // 2
        a = 0
        while a + self.n <= len(buf):
            seg = buf[a:a + self.n]
            m = (seg[:, 0] + seg[:, 1]) * 0.5 * self.win
            sd = (seg[:, 0] - seg[:, 1]) * 0.5 * self.win
            self.mid += np.abs(np.fft.rfft(m)) ** 2
            self.side += np.abs(np.fft.rfft(sd)) ** 2
            self.count += 1
            a += hop
        self.carry = buf[a:].copy()

    def finish(self) -> "SpectrumStream":
        if self.count == 0 and len(self.carry):  # shorter than one segment: zero-padded single frame
            pad = np.zeros((self.n, 2), dtype=np.float32)
            pad[:len(self.carry)] = self.carry
            self.carry = np.zeros((0, 2), dtype=np.float32)
            self.feed(pad)
        return self

    def side_to_mid(self, lo_hz: float = 0.0) -> float:
        sel = self.freqs >= lo_hz
        m = float(self.mid[sel].sum())
        return float(np.sqrt(float(self.side[sel].sum()) / m)) if m > 0 else 0.0


def spectrum_of(x: np.ndarray, sr: int) -> SpectrumStream:
    sp = SpectrumStream(sr)
    for a in range(0, len(x), CHUNK):
        sp.feed(x[a:a + CHUNK])
    return sp.finish()


def tonal_balance(x: np.ndarray, sr: int, spec: "SpectrumStream | None" = None) -> dict:
    sp = spec or spectrum_of(x, sr)
    freqs, power = sp.freqs, sp.mid
    total = power[(freqs >= 20) & (freqs <= 20000)].sum() + 1e-20
    out = {}
    for name, lo, hi in BANDS:
        e = power[(freqs >= lo) & (freqs < min(hi, sr / 2))].sum() + 1e-20
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


def analyze(x: np.ndarray, sr: int, known: dict | None = None) -> dict:
    """known: {"lufs", "tp"} already measured on exactly this signal (skips re-measuring)."""
    x = to_stereo(x)
    known = known or {}
    f_lufs = _TASKS.submit(integrated_lufs, x, sr) if "lufs" not in known else None
    f_lra = _TASKS.submit(loudness_range, x, sr)
    f_stereo = _TASKS.submit(stereo_stats, x)
    tp = known["tp"] if "tp" in known else true_peak_db(x)
    sq = sum(float(np.dot(b, b)) for b in (x[a:a + CHUNK].ravel().astype(np.float64) for a in range(0, len(x), CHUNK)))
    rms = float(np.sqrt(sq / x.size)) if x.size else 0.0
    peak = max((float(np.max(np.abs(x[a:a + CHUNK]))) for a in range(0, len(x), CHUNK)), default=0.0)
    lufs = f_lufs.result() if f_lufs else known["lufs"]
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
        "tonal": tonal_balance(x, sr),
        "durationS": round(len(x) / sr, 2),
    }


def lr4(x: np.ndarray, sr: int, f: float, kind: str) -> np.ndarray:
    sos = butter(2, f, btype=kind, fs=sr, output="sos")
    # Linkwitz-Riley 4 = the Butterworth biquad twice → one cascade, chunked (float32 out).
    return sos_apply(np.vstack([sos, sos]), x)


def multiband(x: np.ndarray, sr: int, squash: float) -> np.ndarray:
    # squash -3..3 → ratio/threshold; 0 = gentle glue.
    # Bands are built and compressed one at a time (float32) so a 4:00 song stays well
    # under the worker's memory cap; the result is identical to summing all three at once.
    ratio = float(np.interp(squash, [-3, 0, 3], [1.2, 2.0, 4.0]))
    thr = float(np.interp(squash, [-3, 0, 3], [-12, -18, -26]))

    def comp(band: np.ndarray, attack: float, release: float) -> np.ndarray:
        c = Pedalboard([Compressor(threshold_db=thr, ratio=ratio, attack_ms=attack, release_ms=release)])
        return c(band, sr)

    # Sequential on purpose: concurrent bands save ~1 s but keep three more full copies alive.
    y = comp(lr4(x, sr, 150, "lowpass"), 30, 200)
    rest = lr4(x, sr, 150, "highpass")
    y = y + comp(lr4(rest, sr, 4000, "lowpass"), 15, 150)
    high = lr4(rest, sr, 4000, "highpass")
    del rest
    y = y + comp(high, 5, 80)
    return y.astype(np.float32)


def width(x: np.ndarray, amount: float, sr: int = 44100, ref_k: float = 1.0) -> np.ndarray:
    """User width (whole side × k) and, in reference mode, the matched width on the side
    above WIDTH_SPLIT_HZ only (keeps the low end mono-safe)."""
    k = float(np.interp(amount, [-3, 0, 3], [0.6, 1.0, 1.4]))
    mid, side = (x[:, 0] + x[:, 1]) / 2, (x[:, 0] - x[:, 1]) / 2 * k
    if abs(ref_k - 1.0) > 1e-3:
        low = lr4(side, sr, WIDTH_SPLIT_HZ, "lowpass")
        side = low + (side - low) * np.float32(ref_k)
        del low
    return np.stack([mid + side, mid - side], axis=1).astype(np.float32)


# ---------------------------------------------------------------- reference mastering

REFERENCE_MAX_S = 600.5            # 10:00 (+ decoder slack)
REF_EQ_CAP_DB = 6.0                # matching EQ never moves a frequency more than this (100 %)
REF_EQ_EDGE_CAP_DB = 3.0           # tighter at the extremes (≤30 Hz, ≥16 kHz), smooth ramp in between
REF_FIR_TAPS = 4095                # linear phase, ≈93 ms at 44.1 kHz
REF_LUFS_RANGE = (-16.0, -7.0)     # a reference's loudness is followed only within this range
REF_WIDTH_RANGE = (0.7, 1.4)
WIDTH_SPLIT_HZ = 150.0
GRID = np.geomspace(20.0, 20000.0, 161)  # 16 points / octave


def ref_eq_cap(f: np.ndarray) -> np.ndarray:
    """dB cap per frequency: 3 dB ≤30 Hz → 6 dB 50 Hz–12 kHz → 3 dB ≥16 kHz (log-frequency ramps,
    so the capped curve has no steps)."""
    lf = np.log2(np.maximum(f, 1.0))
    return np.interp(lf, np.log2([30, 50, 12000, 16000]), [REF_EQ_EDGE_CAP_DB, REF_EQ_CAP_DB, REF_EQ_CAP_DB, REF_EQ_EDGE_CAP_DB])


def analyze_reference(path: str) -> dict:
    """Streams the reference from disk (never fully in memory): LUFS, mid/side spectra."""
    info = sf.info(path)
    if info.frames / max(1, info.samplerate) > REFERENCE_MAX_S:
        raise ValueError("reference_too_long")
    if info.frames < info.samplerate:
        raise ValueError("reference_too_short")
    sr = info.samplerate
    lufs = LufsStream(sr, 2) if 0.1 * sr == int(0.1 * sr) else None
    spec = SpectrumStream(sr)
    n = 0
    for blk in sf.blocks(path, blocksize=CHUNK, dtype="float32", always_2d=True):
        blk = to_stereo(blk)
        n += len(blk)
        if lufs:
            lufs.feed(blk)
        spec.feed(blk)
    spec.finish()
    if n / sr > REFERENCE_MAX_S:
        raise ValueError("reference_too_long")
    loud = lufs.result() if lufs else float(pyln.Meter(sr).integrated_loudness(to_stereo(sf.read(path, dtype="float32")[0])))
    if loud <= -60:
        raise ValueError("reference_silent")
    return {"sr": sr, "lufs": loud, "spec": spec, "durationS": n / sr}


def _smoothed_db(spec: SpectrumStream, frac: float = 1 / 3) -> np.ndarray:
    """Power spectrum → dB on GRID, averaged over ±frac/2 octave around each point."""
    f, p = spec.freqs, spec.mid / max(1, spec.count)
    cs = np.concatenate([[0.0], np.cumsum(p)])
    lo = np.searchsorted(f, GRID * 2 ** (-frac / 2))
    hi = np.maximum(np.searchsorted(f, GRID * 2 ** (frac / 2)), lo + 1)
    hi = np.minimum(hi, len(p))
    lo = np.minimum(lo, hi - 1)
    return 10 * np.log10((cs[hi] - cs[lo]) / (hi - lo) + 1e-20)


def match_curve(mix: SpectrumStream, ref: SpectrumStream, intensity: float) -> np.ndarray:
    """Matching EQ (dB on GRID): ref − mix tonal balance, level-normalised (100 Hz–8 kHz),
    smoothed twice (1/3 octave bins, then ±1/3 octave on the curve), capped, × intensity."""
    d = _smoothed_db(ref) - _smoothed_db(mix)
    nyq = min(mix.sr, ref.sr) / 2
    valid = GRID < nyq * 0.95
    core = valid & (GRID >= 100) & (GRID <= 8000)
    d = d - float(np.mean(d[core]))
    d = np.where(valid, d, d[valid][-1])
    k = 11  # ±5 grid points ≈ ±1/3 octave
    d = np.convolve(np.pad(d, k // 2, mode="edge"), np.ones(k) / k, mode="valid")
    cap = ref_eq_cap(GRID)
    return np.clip(d, -cap, cap) * float(np.clip(intensity, 0.0, 1.0))


def fir_from_curve(curve_db: np.ndarray, sr: int) -> np.ndarray:
    nyq = sr / 2
    sel = GRID < nyq
    freq = np.concatenate([[0.0], GRID[sel] / nyq, [1.0]])
    gain_db = np.concatenate([[curve_db[sel][0]], curve_db[sel], [curve_db[sel][-1]]])
    return firwin2(REF_FIR_TAPS, freq, 10 ** (gain_db / 20)).astype(np.float64)


def apply_fir(x: np.ndarray, h: np.ndarray) -> np.ndarray:
    """Linear-phase FIR, delay-compensated, chunked overlap-add → float32 (N, C)."""
    n, d = len(x), (len(h) - 1) // 2
    out = np.zeros(x.shape, dtype=np.float32)

    def run(c: int) -> None:
        for a in range(0, n, CHUNK):
            y = fftconvolve(x[a:a + CHUNK, c].astype(np.float64), h)
            s0 = a - d
            lo, hi = max(0, s0), min(n, s0 + len(y))
            out[lo:hi, c] += y[lo - s0:hi - s0].astype(np.float32)

    list(_BLOCKS.map(run, range(x.shape[1])))
    return out


def band_db(curve_db: np.ndarray) -> dict:
    return {name: round(float(np.mean(curve_db[(GRID >= lo) & (GRID < hi)])), 2) for name, lo, hi in BANDS}


def reference_plan(y: np.ndarray, sr: int, ref: dict, intensity: float, base_goal: float, target_lufs: float) -> dict:
    """What to change so the mix (after tone, before dynamics) follows the reference."""
    mix_spec = spectrum_of(y, sr)
    curve = match_curve(mix_spec, ref["spec"], intensity)
    mix_r, ref_r = mix_spec.side_to_mid(200.0), ref["spec"].side_to_mid(200.0)
    k = 1.0
    if mix_r > 0.02 and ref_r > 0:  # a (near) mono mix can't be widened by scaling its side
        k = float(np.clip((ref_r / mix_r) ** intensity, *REF_WIDTH_RANGE))
    ref_l = float(np.clip(ref["lufs"], *REF_LUFS_RANGE))
    goal = float(np.clip(base_goal + intensity * (ref_l - target_lufs), -18.0, -6.0))
    return {
        "curve": curve,
        "widthK": k,
        "goalLufs": goal,
        "report": {
            "intensity": round(intensity * 100),
            "reference": {"lufs": round(ref["lufs"], 2), "sideToMid": round(ref_r, 3), "durationS": round(ref["durationS"], 1)},
            "eqDb": band_db(curve),
            "loudness": {"goalLufs": round(goal, 2), "fromTargetLufs": round(base_goal, 2)},
            "width": {"factor": round(k, 3), "mixSideToMid": round(mix_r, 3), "refSideToMid": round(ref_r, 3)},
        },
    }


LUFS_TOL = 0.3  # final loudness must land within ±0.3 LU of the goal


FIRST_PROBE_DB = -2.0  # 2nd gain tried alongside the first guess (the limiter usually overshoots)


def _limit_pass(pre: np.ndarray, sr: int, gain: float, goal_tp: float, ceiling: float) -> tuple[np.ndarray, float, float]:
    """gain → limiter → 4x true peak → trim overs → integrated LUFS. Returns (out, lufs, tp)."""
    out = Pedalboard([Gain(gain_db=gain), Limiter(threshold_db=ceiling, release_ms=120)])(pre, sr).T
    tp = true_peak_db(out)
    if tp > goal_tp:
        trim_db = goal_tp - 0.05 - tp
        out = out * np.float32(10 ** (trim_db / 20))
        tp += trim_db  # oversampling is linear: the trim moves the true peak 1:1
    return out, integrated_lufs(out, sr), tp


def _progress(fraction: float) -> None:
    """Progress for the E3 worker (stderr, one "progress <0..1>" line; stdout stays the JSON contract)."""
    try:
        sys.stderr.write(f"progress {max(0.0, min(1.0, fraction)):.2f}\n")
        sys.stderr.flush()
    except Exception:  # noqa: BLE001 — progress is best effort
        pass


def _loudness_to_target(pre: np.ndarray, sr: int, goal_lufs: float, goal_tp: float, ceiling: float, pre_lufs: float) -> tuple[np.ndarray, float, float]:
    """Gain + limiter (+ true-peak trim) until integrated LUFS is within ±LUFS_TOL of the
    goal and true peak <= goal_tp. LUFS vs gain is monotonic but far from 1:1 behind the
    limiter, so instead of 1:1 steps (3-4 sequential passes) the first round runs two
    gains concurrently and later rounds step along the measured slope (secant) — usually
    1-2 rounds. Returns (out (N, 2) float32, measured LUFS, true peak dBTP)."""
    g0 = goal_lufs - pre_lufs
    pts = [(g, *r) for g, r in zip((g0, g0 + FIRST_PROBE_DB), _TASKS.map(lambda g: _limit_pass(pre, sr, g, goal_tp, ceiling), (g0, g0 + FIRST_PROBE_DB)))]
    _progress(0.55)
    for i in range(8):
        best = min(pts, key=lambda p: abs(goal_lufs - p[2]))
        if abs(goal_lufs - best[2]) <= LUFS_TOL:
            break
        (ga, _, la, _), (gb, _, lb, _) = sorted(pts[-2:], key=lambda p: p[0])
        slope = (lb - la) / (gb - ga) if gb - ga > 1e-6 else 1.0
        # Limiter + trim: clamp a noisy slope so one step can't explode.
        g = best[0] + (goal_lufs - best[2]) / min(2.5, max(0.25, slope))
        pts = [best, (g, *_limit_pass(pre, sr, g, goal_tp, ceiling))]
        _progress(min(0.75, 0.62 + 0.07 * i))
    _, out, got, tp = min(pts, key=lambda p: abs(goal_lufs - p[2]))
    return np.ascontiguousarray(out, dtype=np.float32), got, tp


def master(x: np.ndarray, sr: int, target: str, settings: dict, reference: dict | None = None, reference_intensity: float = 1.0) -> tuple[np.ndarray, dict]:
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
    ref_k, ref_report = 1.0, None
    if reference is not None:
        plan = reference_plan(y, sr, reference, float(np.clip(reference_intensity, 0.0, 1.0)), goal_lufs, TARGETS[target]["lufs"])
        if np.max(np.abs(plan["curve"])) >= 0.05:
            y = apply_fir(y, fir_from_curve(plan["curve"], sr))
        ref_k, goal_lufs, ref_report = plan["widthK"], plan["goalLufs"], plan["report"]
        _progress(0.15)
    y = multiband(y, sr, s["squash"])
    y = width(y, s["width"], sr, ref_k)
    _progress(0.25)
    pre_lufs = integrated_lufs(y, sr)
    pre = y.T.copy()
    del y
    ceiling = goal_tp - 0.6  # sample-peak ceiling; inter-sample overs handled below
    out, got, tp = _loudness_to_target(pre, sr, goal_lufs, goal_tp, ceiling, pre_lufs)
    del pre
    _progress(0.78)
    report = analyze(out, sr, known={"lufs": got, "tp": tp})
    report.update({"target": target, "targetLufs": round(goal_lufs, 2), "targetTp": goal_tp, "settings": s})
    if ref_report:
        report["reference"] = ref_report
    return out, report


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["analyze", "master", "zip"])
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out")
    ap.add_argument("--target", default="streaming")
    ap.add_argument("--settings", default="{}")
    ap.add_argument("--reference")
    ap.add_argument("--reference-intensity", type=float, default=100.0)
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
        if a.cmd == "analyze":
            x, sr = sf.read(a.inp, always_2d=True, dtype="float32")
            print(json.dumps({"ok": True, "analysis": analyze(x, sr)}))
            return 0
        if not a.out:
            raise ValueError("missing_out")
        # Reference first (streamed from disk, small) → a bad file fails before any work.
        ref = analyze_reference(a.reference) if a.reference else None
        x, sr = sf.read(a.inp, always_2d=True, dtype="float32")
        _progress(0.05)
        y, report = master(x, sr, a.target, json.loads(a.settings or "{}"), ref, (a.reference_intensity if np.isfinite(a.reference_intensity) else 100.0) / 100.0)
        del ref
        # 24-bit: the limiter keeps peaks below 0 dBTP, so no float headroom is needed.
        sf.write(a.out, y, sr, subtype="PCM_24")
        del y
        _progress(0.88)
        before = analyze(x, sr)
        print(json.dumps({"ok": True, "before": before, "after": report}))
        return 0
    except Exception as e:  # noqa: BLE001 — single JSON line contract
        print(json.dumps({"ok": False, "error": str(e)[:120]}))
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
