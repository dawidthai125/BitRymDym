# STUDIO EXPORT — I.18 Empty-Session Integration (Local Evidence Freeze)

**Status:** PASS (local empty-session only)  
**Stage:** I.18 EXECUTE (historical Owner session)  
**Recorded in repo:** Stage I.20 (documentation freeze only — **I.20 did not re-run the test**)  
**Date of execution (Owner session):** 2026-10-10  

This document freezes the outcome of a prior Owner-authorized local integration run. It is **not** a test executed during I.20. It is **not** production evidence.

---

## Verdict

**PASS** for the local Studio Export empty-session path:

`enqueue → single worker-once → STUDIO_RENDER_EMPTY_SESSION → render_jobs FAILED`

with public status contract (I.17) and no READY WAV artifact.

---

## Environment (execution session)

| Item | Fact |
|------|------|
| Supabase | **Local only** |
| API | `http://127.0.0.1:54321` |
| DB | `127.0.0.1:54322` |
| Production `.env.local` | **Not used** (env from `supabase status -o env` only) |
| Next.js `:3000` | **Not used** |
| Port `5432` | **Not used** |
| Contabo | **Not used** |
| Queue before fixture | `QUEUED = 0`, `RUNNING = 0` |

---

## What was exercised

1. Unique local fixture: authorized user + GOLD entitlement + READY take source + Studio project with **muted track** (source AuthZ OK; audible set empty).
2. Exactly one `STUDIO_EXPORT` job via `createStudioExportJobFor` (in-process enqueue).
3. Confirmed sole active job was the fixture job.
4. Single worker entry: `npm run e3:worker:once -- <jobId>` (no worker loop).
5. Assertions on DB, in-process public status mapping (I.17), and local Storage.
6. Cleanup of **only** fixture-owned rows/objects; post-cleanup verify empty.

Worker process exit code was non-zero after the controlled failure throw; contract PASS was judged on persisted job/API/Storage state, not exit 0.

---

## Confirmed outcomes

| Check | Result |
|-------|--------|
| `render_jobs.kind` | `STUDIO_EXPORT` |
| `render_jobs.status` | `FAILED` |
| `render_jobs.error_code` | `STUDIO_RENDER_EMPTY_SESSION` |
| Status SUCCEEDED | **Absent** |
| READY `audio_artifacts` for job | **Absent** |
| WAV object under canonical studio-export key | **Absent** (DB + Storage checked) |
| Public `errorCode` (I.17 allowlist) | `STUDIO_RENDER_EMPTY_SESSION` |
| Public message | Safe Polish allowlist copy (empty/muted session); **≠** internal DB `error_message` |
| Public `artifactId` on FAILED | **null** |
| Foreign QUEUED/RUNNING jobs | **None** |
| Fixture leftovers after cleanup | **None** |
| Application code changed during I.18 | **None** |

Internal DB `error_message` may retain renderer wording (e.g. audible-voices text). That string is **not** the public API/UI message.

Fixture identifiers from the session are omitted here; they were local-only and are not production identifiers.

---

## Chronology (related stages)

| Stage | Role |
|-------|------|
| I.15 | Renderer / contract tests for `STUDIO_RENDER_EMPTY_SESSION` |
| I.17 | Typed job `error_code` + allowlisted status GET + UI copy (variant B) |
| I.18 | **This** local worker/DB/API/Storage integration PASS |
| I.19 | Readiness reconciliation (noted SSOT lag; no re-test) |
| I.20 | Documentation freeze of this report + SSOT corrections |

---

## Explicit non-claims

- Does **not** prove production schema, deploy, or Contabo readiness.
- Does **not** authorize canary, production migrations, or Contabo start.
- Does **not** claim full Live ↔ Offline PCM / bit-perfect FX parity (I.14-01: Plane B remains functional evidence only).
- Does **not** set Owner-accepted numeric parity thresholds beyond existing I.14 decisions.

Canonical SSOT pointer: [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](../decisions/STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md) §16 / Stage I status.
