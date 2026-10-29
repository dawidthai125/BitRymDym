#!/usr/bin/env python3
"""STORAGE-ARCH-07 Phase 5 — canary restore drill (VPS-local, no Supabase)."""

from __future__ import annotations

import hashlib
import json
import os
import pwd
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SOURCE_BACKUP_RUN_ID = os.environ.get(
    "SOURCE_BACKUP_RUN_ID",
    "sa07-phase4-canary-2026-10-05T032831381Z-7693eb89",
)
BACKUP_ROOT = Path("/srv/bitrymdym-backup")
MANIFEST_DIR = BACKUP_ROOT / "manifests" / SOURCE_BACKUP_RUN_ID
OBJECTS_ROOT = BACKUP_ROOT / "objects"
PHASE4_EXPECTED_SHA = "90ee033a87843110a16869da4b2ac414c1c36061b54cc7bb3770ede3c4c12261"
PHASE4_EXPECTED_SIZE = 2646044
CLASSES = ("user", "platform", "orphan")
CLASS_MAP = {"user": "USER", "platform": "PLATFORM", "orphan": "ORPHAN"}


def die(msg: str) -> None:
    print(f"STOP: {msg}", file=sys.stderr)
    raise SystemExit(1)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def wav_header_ok(path: Path) -> bool:
    with path.open("rb") as f:
        b = f.read(12)
    return len(b) >= 12 and b[0:4] == b"RIFF" and b[8:12] == b"WAVE"


def ffprobe_summary(path: Path) -> tuple[str, dict]:
    if shutil.which("ffprobe") is None:
        return "UNAVAILABLE", {}
    try:
        proc = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_format",
                "-show_streams",
                "-of",
                "json",
                str(path),
            ],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        return "FAIL", {"error": str(exc)}
    if proc.returncode != 0:
        return "FAIL", {"error": (proc.stderr or "ffprobe_failed")[:500]}
    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return "FAIL", {"error": "ffprobe_json_invalid"}
    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    summary = {
        "format_name": fmt.get("format_name"),
        "duration": fmt.get("duration"),
        "size": fmt.get("size"),
        "codec_name": audio.get("codec_name"),
        "sample_rate": audio.get("sample_rate"),
        "channels": audio.get("channels"),
    }
    fmt_name = summary.get("format_name") or ""
    ok = bool(audio) and ("wav" in fmt_name or bool(summary.get("codec_name")))
    return ("PASS" if ok else "FAIL"), summary


def main() -> int:
    if os.geteuid() == 0:
        die("do not run as root; run as bitrymdym-backup")
    if pwd.getpwuid(os.getuid()).pw_name != "bitrymdym-backup":
        die("must run as bitrymdym-backup")

    if not MANIFEST_DIR.is_dir():
        die(f"manifest dir missing: {MANIFEST_DIR}")

    for name in CLASSES:
        if not (MANIFEST_DIR / f"{name}.json").is_file():
            die(f"missing {name}.json")

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    restore_run_id = f"sa07-phase5-restore-{ts}-{os.urandom(4).hex()}"
    restore_dir = BACKUP_ROOT / "restore-drills" / restore_run_id
    staging = restore_dir / "staging"
    restored = restore_dir / "restored"
    restore_dir.mkdir(parents=True, mode=0o700)
    staging.mkdir(parents=True, mode=0o700)
    restored.mkdir(parents=True, mode=0o700)
    os.chmod(restore_dir, 0o700)

    results = []
    pre_state: dict[str, tuple[str, int]] = {}

    for name in CLASSES:
        man = json.loads((MANIFEST_DIR / f"{name}.json").read_text(encoding="utf-8"))
        expected_class = CLASS_MAP[name]
        if man.get("classification") != expected_class:
            die(f"classification mismatch in {name}.json")
        object_key = man["source_object_key"]
        backup_path = Path(man["backup_object_path"])
        source_sha = man["source_sha256"]
        source_size = int(man["source_size"])

        if not str(backup_path).startswith(str(OBJECTS_ROOT) + "/"):
            die(f"backup path outside objects: {backup_path}")
        if ".." in backup_path.parts:
            die("path traversal in backup path")
        if not backup_path.is_file():
            die(f"backup missing: {backup_path}")

        backup_sha = sha256_file(backup_path)
        backup_size = backup_path.stat().st_size
        pre_state[name] = (backup_sha, backup_size)

        if backup_sha != source_sha or backup_size != source_size:
            die(f"backup != manifest for {name}")
        if source_sha != PHASE4_EXPECTED_SHA or source_size != PHASE4_EXPECTED_SIZE:
            die(f"identity drift vs Phase 4 evidence for {name}")

        safe_name = object_key.replace("/", "_")
        stage = staging / f"{name}.bin"
        final = restored / f"{name}__{safe_name}"

        # COPY not MOVE
        shutil.copy2(backup_path, stage)
        os.sync()
        stage_sha = sha256_file(stage)
        stage_size = stage.stat().st_size
        if stage_sha != source_sha or stage_size != source_size:
            die(f"staging mismatch for {name}")
        stage.replace(final)
        os.sync()
        os.chmod(final, 0o600)

        restore_sha = sha256_file(final)
        restore_size = final.stat().st_size
        if restore_sha != source_sha or restore_size != source_size:
            die(f"restore mismatch for {name}")

        header_ok = wav_header_ok(final)
        ff_status, ff_summary = ffprobe_summary(final)
        if ff_status == "FAIL":
            wav_verification = "FAIL"
        elif ff_status == "UNAVAILABLE":
            wav_verification = "PASS" if header_ok else "FAIL"
        else:
            wav_verification = "PASS" if header_ok and ff_status == "PASS" else "FAIL"

        sha_verification = (
            "PASS"
            if source_sha == backup_sha == restore_sha
            and source_size == backup_size == restore_size
            else "FAIL"
        )
        overall = (
            "PASS"
            if sha_verification == "PASS" and wav_verification == "PASS"
            else "FAIL"
        )

        results.append(
            {
                "classification": expected_class,
                "source_object_key": object_key,
                "source_backup_path": str(backup_path),
                "restore_path": str(final),
                "source_sha256": source_sha,
                "backup_sha256": backup_sha,
                "restore_sha256": restore_sha,
                "source_size": source_size,
                "backup_size": backup_size,
                "restore_size": restore_size,
                "sha_verification": sha_verification,
                "wav_header": "PASS" if header_ok else "FAIL",
                "ffprobe_status": ff_status,
                "wav_verification": wav_verification,
                "ffprobe": ff_summary,
                "overall_verification": overall,
            }
        )
        print(
            f"RESULT {expected_class} overall={overall} sha={sha_verification} "
            f"wav={wav_verification} ffprobe={ff_status}"
        )

    # Backup immutability
    immut = "PASS"
    for name in CLASSES:
        man = json.loads((MANIFEST_DIR / f"{name}.json").read_text(encoding="utf-8"))
        backup_path = Path(man["backup_object_path"])
        post_sha = sha256_file(backup_path)
        post_size = backup_path.stat().st_size
        pre_sha, pre_size = pre_state[name]
        if post_sha != pre_sha or post_size != pre_size:
            immut = "FAIL"

    # Cleanup staging only
    shutil.rmtree(staging, ignore_errors=True)

    restore_count = sum(1 for _ in restored.glob("*") if _.is_file())
    backup_count = sum(1 for _ in OBJECTS_ROOT.rglob("*") if _.is_file())
    all_pass = (
        all(r["overall_verification"] == "PASS" for r in results)
        and immut == "PASS"
        and restore_count == 3
        and backup_count == 3
    )

    doc = {
        "restore_run_id": restore_run_id,
        "source_backup_run_id": SOURCE_BACKUP_RUN_ID,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "restore_directory": str(restore_dir),
        "restore_source": "VPS_LAYER1_BACKUP",
        "supabase_used_as_restore_source": False,
        "objects": results,
        "backup_immutability": immut,
        "restore_object_count": restore_count,
        "backup_object_count": backup_count,
        "status": "PASS" if all_pass else "BLOCKED",
        "claim": "CANARY RESTORE VERIFIED" if all_pass else "RESTORE FAILED",
        "not_claimed": [
            "FULL BACKUP VERIFIED",
            "FULL DR VERIFIED",
            "ARCH-05 SAFE",
            "ORPHAN SAFE FOR DELETE",
        ],
    }
    (restore_dir / "restore-manifest.json").write_text(
        json.dumps(doc, indent=2) + "\n", encoding="utf-8"
    )
    os.chmod(restore_dir / "restore-manifest.json", 0o600)
    print(json.dumps(doc, indent=2))
    return 0 if all_pass else 2


if __name__ == "__main__":
    raise SystemExit(main())
