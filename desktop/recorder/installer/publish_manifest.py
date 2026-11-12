"""Builds the signed latest.json for a recorder installer. Run by the person who publishes the build.

  python publish_manifest.py --installer BitRymDym-Setup.exe --version 2026.11.12.2 \
      --key /path/to/BITRYMDYM_UPDATE_SIGNING_KEY --out latest.json [--notes "..."]

The private key is an Ed25519 PEM (OpenBot Vault: BITRYMDYM_UPDATE_SIGNING_KEY). It is only read by openssl.
The result is checked with the public key embedded in updater.py before it is written.
Upload order (see docs/WINDOWS_NAGRYWARKA.md): versioned installer, then latest.json LAST.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import updater  # noqa: E402


def openssl_sign(key: Path):
    def sign(message: bytes) -> bytes:
        with tempfile.TemporaryDirectory() as folder:
            msg = Path(folder) / "msg"
            sig = Path(folder) / "sig"
            msg.write_bytes(message)
            subprocess.run(
                ["openssl", "pkeyutl", "-sign", "-inkey", str(key), "-rawin", "-in", str(msg), "-out", str(sig)],
                check=True,
            )
            return sig.read_bytes()

    return sign


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--installer", required=True, type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--key", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--notes", default="")
    parser.add_argument("--url", default="")
    args = parser.parse_args()
    data = args.installer.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    url = args.url or f"{updater.R2_BASE}BitRymDym-Setup-{args.version}.exe"
    manifest = updater.sign_manifest(args.version, sha256, len(data), url, args.notes, openssl_sign(args.key))
    raw = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
    parsed = updater.parse_manifest(raw)  # signature, url prefix, sizes: the same checks the program runs
    args.out.write_bytes(raw + b"\n")
    print(f"latest.json: {parsed.version} {parsed.size} B sha256 {parsed.sha256[:12]}… podpis OK")


if __name__ == "__main__":
    main()
