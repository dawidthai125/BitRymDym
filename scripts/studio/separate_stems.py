#!/usr/bin/env python3
"""4-stem split for the worker host (htdemucs: vocals, drums, bass, other).

Not invoked by the Next.js process. Weights stay on the worker host.
Runs `python -m demucs` only when DEMUCS_PYTHON is set. Does not download weights.
"""
from __future__ import annotations

import os
import subprocess
import sys


def main() -> int:
    py = os.environ.get("DEMUCS_PYTHON", "").strip()
    if not py:
        print("separator_unconfigured", file=sys.stderr)
        return 3
    if len(sys.argv) != 3:
        print("usage: separate_stems.py <input> <outdir>", file=sys.stderr)
        return 2
    src, outdir = sys.argv[1], sys.argv[2]
    # Offline: do not fetch weights. The host must already have htdemucs.
    env = os.environ.copy()
    env["HF_HUB_OFFLINE"] = "1"
    env["TRANSFORMERS_OFFLINE"] = "1"
    completed = subprocess.run(
        [py, "-m", "demucs", "-n", "htdemucs", "--out", outdir, src],
        env=env,
        check=False,
    )
    return int(completed.returncode)


if __name__ == "__main__":
    raise SystemExit(main())
