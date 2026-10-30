"""Synthetic tests: python -m pytest scripts/master -q"""
import json
from pathlib import Path
import os
import subprocess
import sys

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
import master as m  # noqa: E402

SR = 44100


def synth(seconds=12.0, level=0.2, seed=1):
    rng = np.random.default_rng(seed)
    t = np.arange(int(SR * seconds)) / SR
    kick = np.sin(2 * np.pi * 55 * t) * (np.exp(-((t % 0.5) * 12)))
    voc = 0.5 * np.sin(2 * np.pi * 220 * t + 2 * np.sin(2 * np.pi * 3 * t)) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.25 * t))
    hats = rng.normal(0, 0.15, len(t)) * (np.exp(-((t % 0.25) * 40)))
    l = kick + voc + hats
    r = kick + 0.9 * voc + np.roll(hats, 37)
    x = np.stack([l, r], axis=1)
    return (x / np.max(np.abs(x)) * level).astype(np.float32)


@pytest.mark.parametrize("target", list(m.TARGETS))
def test_hits_target_lufs_and_true_peak(target):
    y, rep = m.master(synth(), SR, target, {})
    goal = m.TARGETS[target]
    assert abs(m.integrated_lufs(y, SR) - goal["lufs"]) <= 0.5
    assert m.true_peak_db(y) <= goal["tp"] + 1e-6


def test_settings_loudness_offset_and_clamp():
    y, rep = m.master(synth(seed=3), SR, "streaming", {"loudness": 9, "bright": "x"})
    assert rep["settings"]["loudness"] == 3 and rep["settings"]["bright"] == 0
    assert abs(m.integrated_lufs(y, SR) - (-11.0)) <= 0.5
    assert m.true_peak_db(y) <= -1.0


def test_width_changes_side():
    x = synth(seed=4)
    wide, _ = m.master(x, SR, "streaming", {"width": 3})
    narrow, _ = m.master(x, SR, "streaming", {"width": -3})
    assert m.stereo_stats(wide)["sideToMid"] > m.stereo_stats(narrow)["sideToMid"]


def test_analysis_fields():
    a = m.analyze(synth(), SR)
    for k in ("lufs", "lra", "truePeakDb", "plr", "stereo", "tonal"):
        assert k in a
    assert set(a["tonal"]) == {b[0] for b in m.BANDS}


def test_cli_contract(tmp_path):
    src, out = tmp_path / "mix.wav", tmp_path / "master.wav"
    sf.write(src, synth(seconds=6), SR, subtype="PCM_24")
    p = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "master.py"), "master", "--in", str(src), "--out", str(out), "--target", "club"], capture_output=True, text=True)
    res = json.loads(p.stdout.strip().splitlines()[-1])
    assert p.returncode == 0 and res["ok"] and out.exists()
    assert res["after"]["truePeakDb"] <= -0.3
    # Worker progress: monotonic "progress <0..1>" lines on stderr, stdout untouched.
    prog = [float(l.split()[1]) for l in p.stderr.splitlines() if l.startswith("progress ")]
    assert len(prog) >= 4 and prog == sorted(prog) and 0 <= prog[0] and prog[-1] <= 1
    assert len(p.stdout.strip().splitlines()) == 1
    # Reference mode: same contract + after.reference report.
    ref = tmp_path / "ref.wav"
    sf.write(ref, bright_wide(synth(seconds=8, seed=9)), SR, subtype="PCM_16")
    p = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "master.py"), "master", "--in", str(src), "--out", str(out), "--reference", str(ref), "--reference-intensity", "70"], capture_output=True, text=True)
    res = json.loads(p.stdout.strip().splitlines()[-1])
    assert p.returncode == 0 and res["ok"], p.stdout
    r = res["after"]["reference"]
    assert r["intensity"] == 70 and set(r["eqDb"]) == {b[0] for b in m.BANDS}
    assert {"goalLufs", "fromTargetLufs"} <= set(r["loudness"]) and r["width"]["factor"] > 1
    prog = [float(l.split()[1]) for l in p.stderr.splitlines() if l.startswith("progress ")]
    assert prog == sorted(prog)


def test_cli_reference_too_long_fails_before_work(tmp_path, monkeypatch):
    src, out, ref = tmp_path / "mix.wav", tmp_path / "master.wav", tmp_path / "ref.wav"
    sf.write(src, synth(seconds=3), SR)
    sf.write(ref, np.zeros((8000 * 601, 2), dtype=np.int16), 8000, subtype="PCM_16")  # 10:01
    p = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "master.py"), "master", "--in", str(src), "--out", str(out), "--reference", str(ref)], capture_output=True, text=True)
    assert p.returncode == 2 and json.loads(p.stdout)["error"] == "reference_too_long" and not out.exists()


# ------------------------------------------------------------ reference mastering

def bright_wide(x, tilt_db=8.0, side_gain=1.8, gain_db=4.0):
    """A 'reference' made from x: brighter (tilt above ~2 kHz), wider and louder."""
    from scipy.signal import butter, sosfilt
    sos = butter(2, 2000, btype="highpass", fs=SR, output="sos")
    hi = sosfilt(sos, x, axis=0)
    y = x + (10 ** (tilt_db / 20) - 1) * hi
    mid, side = (y[:, 0] + y[:, 1]) / 2, (y[:, 0] - y[:, 1]) / 2 * side_gain
    y = np.stack([mid + side, mid - side], axis=1) * 10 ** (gain_db / 20)
    return (y / max(1.0, np.max(np.abs(y)) / 0.98)).astype(np.float32)


def ref_of(x):
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        sf.write(f.name, x, SR, subtype="FLOAT")
        try:
            return m.analyze_reference(f.name)
        finally:
            os.unlink(f.name)


def test_streaming_lufs_matches_pyloudnorm():
    import pyloudnorm as pyln
    for seed, secs in ((1, 12.0), (2, 3.3), (5, 0.9)):
        x = synth(seconds=secs, seed=seed)
        assert abs(m.integrated_lufs(x, SR) - pyln.Meter(SR).integrated_loudness(x)) < 0.01


def test_chunked_lr4_matches_whole_signal():
    from scipy.signal import butter, sosfilt
    x = synth(seconds=15)
    sos = butter(2, 150, btype="lowpass", fs=SR, output="sos")
    ref = sosfilt(sos, sosfilt(sos, x, axis=0), axis=0)
    assert np.max(np.abs(m.lr4(x, SR, 150, "lowpass") - ref)) < 1e-5


def test_reference_moves_tonal_balance_width_and_loudness_toward_reference():
    x = synth(seed=6)
    ref = ref_of(bright_wide(synth(seed=7)))
    plain, rp = m.master(x, SR, "streaming", {})
    matched, rm = m.master(x, SR, "streaming", {}, ref, 1.0)
    r = rm["reference"]
    assert r["eqDb"]["high"] > 1 and r["eqDb"]["air"] > 1  # brighter
    assert rm["tonal"]["high"]["db"] > rp["tonal"]["high"]["db"] + 1
    assert r["width"]["factor"] > 1.1 and m.stereo_stats(matched)["sideToMid"] > m.stereo_stats(plain)["sideToMid"]
    assert m.true_peak_db(matched) <= -1.0 + 1e-6
    # loudness follows the reference (clamped to −16..−7), never past the target true peak
    assert abs(m.integrated_lufs(matched, SR) - r["loudness"]["goalLufs"]) <= 0.5


def test_reference_intensity_zero_is_plain_master_and_half_is_between():
    x = synth(seed=8)
    ref = ref_of(bright_wide(synth(seed=7), gain_db=0))
    plain, _ = m.master(x, SR, "streaming", {})
    zero, rz = m.master(x, SR, "streaming", {}, ref, 0.0)
    assert np.max(np.abs(zero - plain)) < 1e-4
    assert all(v == 0 for v in rz["reference"]["eqDb"].values()) and rz["reference"]["width"]["factor"] == 1
    _, rh = m.master(x, SR, "streaming", {}, ref, 0.5)
    _, rf = m.master(x, SR, "streaming", {}, ref, 1.0)
    assert 0 < rh["reference"]["eqDb"]["high"] < rf["reference"]["eqDb"]["high"]


def test_match_curve_is_capped_and_smooth():
    a, b = m.SpectrumStream(SR), m.SpectrumStream(SR)
    noise = np.random.default_rng(0).normal(0, 0.1, (SR * 4, 2)).astype(np.float32)
    a.feed(noise); a.finish()
    from scipy.signal import butter, sosfilt
    loud_hi = noise + 30 * sosfilt(butter(4, 5000, btype="highpass", fs=SR, output="sos"), noise, axis=0).astype(np.float32)
    b.feed(loud_hi); b.finish()
    c = m.match_curve(a, b, 1.0)
    assert np.max(c) <= m.REF_EQ_CAP_DB + 1e-9 and np.min(c) >= -m.REF_EQ_CAP_DB - 1e-9
    assert np.max(c[m.GRID >= 16000]) <= m.REF_EQ_EDGE_CAP_DB + 1e-9 and np.max(c) > 5
    assert np.max(np.abs(np.diff(c))) < 1.5  # no needle-like peaks between neighbouring 1/16-octave points


def test_mono_mix_is_not_widened_and_reference_level_is_clamped():
    x = synth(seed=2)
    mono = np.repeat(x[:, :1], 2, axis=1)
    quiet = ref_of(bright_wide(synth(seed=3), gain_db=0) * 0.05)  # ≈ −40 LUFS reference
    _, r = m.master(mono, SR, "club", {}, quiet, 1.0)
    assert r["reference"]["width"]["factor"] == 1
    assert r["reference"]["loudness"]["goalLufs"] == -16.0  # followed only down to −16 LUFS
    _, r = m.master(mono, SR, "club", {"loudness": 3}, quiet, 0.5)
    assert r["reference"]["loudness"]["goalLufs"] == pytest.approx(-6.0 - 3.5)  # user offset kept, half way


def test_cli_zip(tmp_path):
    import subprocess, sys, zipfile
    d = tmp_path / "stems"; d.mkdir()
    for n in ("01-wokal.wav", "02-bit.wav"):
        sf.write(d / n, np.zeros((4800, 2), dtype=np.float32), 48000)
    out = tmp_path / "p.zip"
    r = subprocess.run([sys.executable, str(Path(__file__).with_name("master.py")), "zip", "--in", str(d), "--out", str(out)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout
    assert sorted(zipfile.ZipFile(out).namelist()) == ["01-wokal.flac", "02-bit.flac"]
