#!/usr/bin/env python3
"""STORAGE-ARCH-07 — PHASE LOCAL-BACKUP-RESTORE-DRILL

LOCAL → LOCAL ISOLATED only.
Source: C:\\BitRymDym-Backup\\objects\\
Never writes Supabase / VPS / production / objects/.
"""

from __future__ import annotations

import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

LOCAL_ROOT = Path(r"C:\BitRymDym-Backup")
OBJECTS_ROOT = LOCAL_ROOT / "objects" / "beat-audio"
SOURCE_BACKUP_RUN_ID = "local-layer2-full-20261005T040146Z-42d6212b"
MANIFEST_DIR = LOCAL_ROOT / "manifests" / SOURCE_BACKUP_RUN_ID
EXPECTED_TOTAL = 43
EXPECTED_BYTES = 111574892
EXPECTED_INV = {"USER": 8, "PLATFORM": 3, "ORPHAN": 32, "UNKNOWN": 0}

REPO_EVIDENCE = Path(__file__).resolve().parents[1] / "docs" / "audits" / (
    "STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL_EVIDENCE.json"
)


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


def find_ffprobe() -> str | None:
    which = shutil.which("ffprobe")
    if which:
        return which
    # common WinGet path hint from environment
    return None


def ffprobe_summary(ffprobe: str, path: Path) -> tuple[str, dict]:
    try:
        proc = subprocess.run(
            [
                ffprobe,
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
    fmt_name = str(summary.get("format_name") or "")
    ok = bool(audio) and ("wav" in fmt_name or bool(summary.get("codec_name")))
    return ("PASS" if ok else "FAIL"), summary


def walk_files(root: Path) -> list[Path]:
    return sorted(p for p in root.rglob("*") if p.is_file())


def harden_acl(path: Path) -> str:
    user = os.environ.get("USERNAME") or "dawid"
    cmds = [
        ["icacls", str(path), "/inheritance:r"],
        ["icacls", str(path), "/grant:r", f"{user}:(OI)(CI)F", "SYSTEM:(OI)(CI)F"],
        ["icacls", str(path)],
    ]
    out = []
    for cmd in cmds:
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
        out.append(f"{' '.join(cmd)} => {proc.returncode}")
        if proc.stdout:
            out.append(proc.stdout.strip())
    return "\n".join(out)


def main() -> int:
    if "--execute" not in sys.argv:
        die("refusing: pass --execute")

    ffprobe = find_ffprobe()
    if not ffprobe:
        die("ffprobe not found on PATH")

    if not OBJECTS_ROOT.is_dir():
        die(f"objects missing: {OBJECTS_ROOT}")
    if not MANIFEST_DIR.is_dir():
        die(f"manifest dir missing: {MANIFEST_DIR}")

    manifests = sorted(MANIFEST_DIR.glob("*.json"))
    if len(manifests) != EXPECTED_TOTAL:
        die(f"manifest count {len(manifests)} ≠ {EXPECTED_TOTAL}")

    source_files = walk_files(OBJECTS_ROOT)
    if len(source_files) != EXPECTED_TOTAL:
        die(f"source objects {len(source_files)} ≠ {EXPECTED_TOTAL}")

    source_bytes = sum(p.stat().st_size for p in source_files)
    if source_bytes != EXPECTED_BYTES:
        die(f"source bytes {source_bytes} ≠ {EXPECTED_BYTES}")

    # Pre-state integrity of source backup (must remain unchanged)
    pre_state: dict[str, dict] = {}
    for p in source_files:
        rel = p.relative_to(OBJECTS_ROOT).as_posix()
        pre_state[rel] = {"sha256": sha256_file(p), "size": p.stat().st_size}

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    restore_run_id = f"local-restore-{ts}-{secrets.token_hex(4)}"
    restore_dir = LOCAL_ROOT / "restore-drills" / restore_run_id
    restored_root = restore_dir / "restored" / "beat-audio"
    evidence_dir = restore_dir / "evidence"
    staging_dir = restore_dir / "staging"
    restore_dir.mkdir(parents=True, exist_ok=False)
    restored_root.mkdir(parents=True, exist_ok=True)
    evidence_dir.mkdir(parents=True, exist_ok=True)
    staging_dir.mkdir(parents=True, exist_ok=True)
    acl_evidence = harden_acl(restore_dir)

    inv = {"USER": 0, "PLATFORM": 0, "ORPHAN": 0, "UNKNOWN": 0}
    results = []
    restored_bytes = 0
    fail = 0

    for mf in manifests:
        man = json.loads(mf.read_text(encoding="utf-8"))
        key = man.get("source_object_key")
        if not key or not isinstance(key, str):
            die(f"bad manifest {mf.name}: missing source_object_key")
        if ".." in key or key.startswith("/") or "\\" in key:
            die(f"unsafe object_key in {mf.name}")

        classification = man.get("classification") or "UNKNOWN"
        inv[classification] = inv.get(classification, 0) + 1

        src = OBJECTS_ROOT / Path(*key.split("/"))
        if not src.is_file():
            die(f"source missing for {key}")

        expected_sha = (man.get("local_sha256") or man.get("source_sha256") or "").lower()
        expected_size = int(man.get("size") or 0)
        content_type = man.get("content_type") or ""

        if not expected_sha or len(expected_sha) != 64:
            die(f"bad sha in manifest {mf.name}")
        if expected_size <= 0:
            die(f"bad size in manifest {mf.name}")

        src_sha = sha256_file(src)
        src_size = src.stat().st_size
        if src_sha != expected_sha or src_size != expected_size:
            die(
                f"source integrity vs manifest FAIL {key}: "
                f"sha {src_sha} vs {expected_sha}, size {src_size} vs {expected_size}"
            )

        dest = restored_root / Path(*key.split("/"))
        dest.parent.mkdir(parents=True, exist_ok=True)
        # Short staging name avoids Windows MAX_PATH on deep object keys
        tmp = staging_dir / f"{hashlib.sha256(key.encode()).hexdigest()[:24]}.bin"
        shutil.copyfile(src, tmp)
        if dest.exists():
            dest.unlink()
        shutil.move(str(tmp), str(dest))

        restored_sha = sha256_file(dest)
        restored_size = dest.stat().st_size
        sha_ok = restored_sha == expected_sha == src_sha
        size_ok = restored_size == expected_size == src_size

        header_ok = wav_header_ok(dest)
        ff_status, ff_summary = ffprobe_summary(ffprobe, dest)
        # content-type check: expect audio/wav for these masters
        ctype_ok = content_type.startswith("audio/") and (
            "wav" in content_type or ff_status == "PASS"
        )
        wav_ok = header_ok and ff_status == "PASS" and restored_size > 0

        status = "PASS" if (sha_ok and size_ok and wav_ok and ctype_ok) else "FAIL"
        if status != "PASS":
            fail += 1

        row = {
            "bucket": man.get("source_bucket") or "beat-audio",
            "object_key": key,
            "classification": classification,
            "owner_user_id": man.get("owner_user_id"),
            "owner_user_number": man.get("owner_user_number"),
            "source_sha256": expected_sha,
            "restored_sha256": restored_sha,
            "source_size": expected_size,
            "restored_size": restored_size,
            "content_type": content_type,
            "restore_path": str(dest),
            "sha_status": "PASS" if sha_ok else "FAIL",
            "size_status": "PASS" if size_ok else "FAIL",
            "wav_header": "PASS" if header_ok else "FAIL",
            "ffprobe": ff_status,
            "ffprobe_summary": ff_summary,
            "content_type_status": "PASS" if ctype_ok else "FAIL",
            "manifest_status": "PASS",
            "status": status,
        }
        results.append(row)
        restored_bytes += restored_size

        # update local restore evidence sidecar (no secrets)
        (evidence_dir / mf.name).write_text(
            json.dumps(
                {
                    **{k: row[k] for k in row if k != "ffprobe_summary"},
                    "ffprobe_summary": ff_summary,
                    "source_backup_run_id": SOURCE_BACKUP_RUN_ID,
                    "restore_run_id": restore_run_id,
                    "verification_status": "RESTORE_VERIFIED"
                    if status == "PASS"
                    else "RESTORE_FAILED",
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    if fail:
        die(f"restore failures={fail}")

    if len(results) != EXPECTED_TOTAL:
        die(f"restored count {len(results)} ≠ {EXPECTED_TOTAL}")
    if restored_bytes != EXPECTED_BYTES:
        die(f"restored bytes {restored_bytes} ≠ {EXPECTED_BYTES}")
    for k, v in EXPECTED_INV.items():
        if inv.get(k, 0) != v:
            die(f"inventory drift {k}: {inv.get(k)} ≠ {v}")

    # Post-state: source objects unchanged
    post_files = walk_files(OBJECTS_ROOT)
    if len(post_files) != EXPECTED_TOTAL:
        die("source object count changed after restore")
    source_integrity = "PASS"
    for p in post_files:
        rel = p.relative_to(OBJECTS_ROOT).as_posix()
        prev = pre_state.get(rel)
        if not prev:
            die(f"unexpected new source object {rel}")
        cur_sha = sha256_file(p)
        cur_size = p.stat().st_size
        if cur_sha != prev["sha256"] or cur_size != prev["size"]:
            source_integrity = "FAIL"
            die(f"source modified during restore: {rel}")

    sha_pass = sum(1 for r in results if r["sha_status"] == "PASS")
    size_pass = sum(1 for r in results if r["size_status"] == "PASS")
    wav_pass = sum(1 for r in results if r["wav_header"] == "PASS")
    ff_pass = sum(1 for r in results if r["ffprobe"] == "PASS")
    man_pass = sum(1 for r in results if r["manifest_status"] == "PASS")

    if min(sha_pass, size_pass, wav_pass, ff_pass, man_pass) != EXPECTED_TOTAL:
        die("aggregate PASS counts incomplete")

    ended = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    evidence = {
        "tool": "storage-arch-07-local-layer2-restore-drill",
        "phase": "LOCAL-BACKUP-RESTORE-DRILL",
        "status": "PASS",
        "restore_run_id": restore_run_id,
        "source_backup_run_id": SOURCE_BACKUP_RUN_ID,
        "source_path": str(OBJECTS_ROOT),
        "restore_path": str(restore_dir),
        "started_claim": "LOCAL → LOCAL ISOLATED restore drill",
        "claim": "LOCAL Layer-2 RESTORE VERIFIED 43/43",
        "not_claimed": [
            "FULL DR VERIFIED",
            "AWS DR",
            "ARCH-05 SAFE",
            "ORPHAN SAFE FOR DELETE",
            "PRODUCTION RESTORE",
        ],
        "inventory": inv,
        "results_summary": {
            "RESTORED": len(results),
            "SHA_PASS": sha_pass,
            "SIZE_PASS": size_pass,
            "WAV_PASS": wav_pass,
            "FFPROBE_PASS": ff_pass,
            "MANIFEST_PASS": man_pass,
            "FAILED": 0,
            "MISMATCH": 0,
            "TOTAL_BYTES": restored_bytes,
        },
        "source_backup_integrity": source_integrity,
        "acl_evidence": acl_evidence,
        "ffprobe_path": ffprobe,
        "production_mutations": {
            "supabase": 0,
            "storage": 0,
            "db": 0,
            "auth": 0,
            "vps": 0,
            "aws": 0,
            "source_objects_modified": 0,
        },
        "arch05": "NOT READY",
        "orphans": "BACKED UP / RESTORE VERIFIED / NOT SAFE FOR DELETE",
        "ended_at": ended,
        "results": results,
    }

    log_path = LOCAL_ROOT / "logs" / f"{restore_run_id}.json"
    log_path.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
    (restore_dir / "RESTORE_DRILL_SUMMARY.json").write_text(
        json.dumps(evidence, indent=2), encoding="utf-8"
    )
    REPO_EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    REPO_EVIDENCE.write_text(json.dumps(evidence, indent=2), encoding="utf-8")

    print(
        json.dumps(
            {
                "status": "PASS",
                "restore_run_id": restore_run_id,
                "source_backup_run_id": SOURCE_BACKUP_RUN_ID,
                "restore_path": str(restore_dir),
                "restored": len(results),
                "sha": f"{sha_pass}/43",
                "size": f"{size_pass}/43",
                "wav": f"{wav_pass}/43",
                "ffprobe": f"{ff_pass}/43",
                "source_integrity": source_integrity,
                "log": str(log_path),
                "repo_evidence": str(REPO_EVIDENCE),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
