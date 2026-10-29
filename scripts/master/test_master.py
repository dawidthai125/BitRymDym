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
    p = subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "master.py"), "master", "--in", str(src), "--out", str(out), "--reference", str(src)], capture_output=True, text=True)
    assert p.returncode == 3 and json.loads(p.stdout)["error"] == "reference_not_available"


def test_cli_zip(tmp_path):
    import subprocess, sys, zipfile
    d = tmp_path / "stems"; d.mkdir()
    for n in ("01-wokal.wav", "02-bit.wav"):
        sf.write(d / n, np.zeros((4800, 2), dtype=np.float32), 48000)
    out = tmp_path / "p.zip"
    r = subprocess.run([sys.executable, str(Path(__file__).with_name("master.py")), "zip", "--in", str(d), "--out", str(out)], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout
    assert sorted(zipfile.ZipFile(out).namelist()) == ["01-wokal.wav", "02-bit.wav"]
