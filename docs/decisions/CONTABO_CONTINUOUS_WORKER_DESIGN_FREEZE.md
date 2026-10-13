# Contabo Continuous Worker — Design Freeze (GO-DF-CONTABO-POLL)

**Status:** **DESIGN FREEZE ACCEPTED** (GO-DF-CONTABO-POLL) · implementation **NOT AUTHORIZED**  
**Date:** 2026-10-13  
**Unit:** GO-DF-CONTABO-POLL (documentation-only)  
**Living SSOT:** [PROJECT_STATE.md](../PROJECT_STATE.md)  
**Parent context:** Final Mix Production GREEN **VERIFIED** (frozen IN) · Contabo always-on still **OPEN / NOT VERIFIED** · last-known persistent unit **disabled/inactive**  
**Related:** [STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_DESIGN_FREEZE.md) · [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](../audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) · [P4_6_PHASE2_WORKER_INFRASTRUCTURE_REPORT.md](../audits/P4_6_PHASE2_WORKER_INFRASTRUCTURE_REPORT.md)

```text
DESIGN FREEZE: ACCEPTED
V1 poller kinds: STUDIO_EXPORT only
Max active renders / instance: 1
Claim: atomic claim-next + FINDING-01 + bake on RUNNING
Auto-retry FAILED/TIMEOUT/crash: FORBIDDEN
Enqueue contract: UNCHANGED
Implementation / enable / SSH mutate: NOT AUTHORIZED by this freeze
```

---

## 1. Purpose and V1 bounds

Lock a **supervised continuous poller** so Studio Export jobs can complete without Owner-supplied `jobId` oneshots, without draining arbitrary `QUEUED` work.

| In V1 | Out of V1 |
|-------|-----------|
| Poll + claim + render **`STUDIO_EXPORT`** only | **`MIX`**, **`TAKE_EXPORT`**, unknown `kind` |
| Max **one** active render per worker instance | Multi-job concurrency on one host process |
| Atomic claim under multi-worker competition | Blind `SELECT QUEUED` without row lock / CAS |
| Existing AuthZ · entitlement snapshot · source validation · `object_key` reject-only | Weakening download AuthZ / client source claims |
| Terminal `FAILED` / `TIMEOUT` / `CANCELLED` stay terminal | Auto re-QUEUED / auto-increment retry loops |
| Graceful shutdown (no new claim; defined in-flight behavior) | Unsupervised claim storms on boot |
| Enqueue **unchanged** | Enqueue API / payload / AuthZ changes (would need separate OD) |

This freeze does **not** enable Contabo, sync the host tree, deploy, or implement RPC/poller code.

---

## 2. Frozen Owner decisions (GO-DF-CONTABO-POLL)

| ID | Decision |
|----|----------|
| **OD-CWP-01** | V1 poller processes **`STUDIO_EXPORT` only** |
| **OD-CWP-02** | `MIX` / `TAKE_EXPORT` / unknown kinds = **OUT** of V1 poller (may remain oneshot/`jobId` paths) |
| **OD-CWP-03** | Max **1** active render per instance (local single-flight) |
| **OD-CWP-04** | Claim must be **atomic** under concurrent workers |
| **OD-CWP-05** | Preserve FINDING-01 source re-AuthZ · entitlement · source XOR · `object_key` reject-only |
| **OD-CWP-06** | **No** automatic retry after `FAILED`, `TIMEOUT`, or crash (no auto re-QUEUED) |
| **OD-CWP-07** | Graceful shutdown: stop accepting new claims; in-flight behavior explicit (§7) |
| **OD-CWP-08** | Enqueue remains **unchanged** unless a future separate OD proves necessity |

---

## 3. Job qualification contract (poller allowlist)

A job is **eligible** for V1 claim-next only if **all** hold:

| Field | Requirement |
|-------|-------------|
| `kind` | `STUDIO_EXPORT` |
| `status` | `QUEUED` |
| `requested_tier` | `WAV` (Studio Export MVP tier) |
| Source XOR | `project_id` set · `mix_session_id` NULL · `take_id` NULL (mirrors `render_jobs_source_xor_chk` / `isValidRenderJobSourceXor`) |
| `attempt` | `1..AUDIO_RENDER_MAX_ATTEMPTS` (currently 3) — poller does **not** increment `attempt` |
| Instance | Local single-flight free (no in-process active render) |

**Explicitly ineligible:** any other status (`RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, `TIMEOUT`); other kinds; malformed XOR; instance busy.

Legacy / mixed queues: poller **must skip** non-matching rows (via SQL filter), never claim them “because they are next in `queued_at` order” among all kinds.

---

## 4. Single coherent claim contract (binding)

### 4.1 Problem with naive designs

- Tip today: `claimRenderJobAsWorker(jobId)` requires **`QUEUED`**, runs FINDING-01, then CAS `QUEUED → RUNNING`.
- Tip today: `runRealRenderWorkerJob(jobId)` **always claims first**, then dispatches bake.
- **Forbidden:** RPC that sets `RUNNING`, then calling unmodified `claimRenderJobAsWorker` / `runRealRenderWorkerJob` (they expect `QUEUED` / claim again → `CONFLICT` / double-claim).
- **Insufficient alone:** `FOR UPDATE SKIP LOCKED` without a defined status machine and bake entrypoint.

### 4.2 Frozen contract (one path)

**Name (impl proposal):** `claimNextStudioExportAsWorker(workerRef)` + `runAlreadyClaimedStudioExportWorkerJob(job)`.

```text
1) Atomic claim-next (DB, service_role only)
   SELECT eligible STUDIO_EXPORT QUEUED … ORDER BY queued_at
     FOR UPDATE SKIP LOCKED LIMIT 1
   UPDATE same row:
     status = RUNNING
     started_at / timeout_at (= claim + AUDIO_RENDER_JOB_TIMEOUT_SECONDS)
     progress = 0
     worker_ref = workerRef
   WHERE id = $id AND status = QUEUED
   RETURNING job row
   — if no row: idle (no work)

2) FINDING-01 source re-AuthZ (app, same semantics as claimRenderJobAsWorker)
   — inputs: job id / snapshot only · no client keys/URLs
   — on AuthZ/source failure: fail RUNNING → FAILED (typed code) · do NOT return to QUEUED
   — on success: proceed

3) Bake entrypoint for already-RUNNING job
   — MUST NOT call claim again
   — Reuse bake/complete paths equivalent to post-claim body of runClaimedStudioExportWorkerJob
   — On encode/QC/upload failure: RUNNING → FAILED (existing fail paths)
   — On success: RUNNING → SUCCEEDED + READY artifact (existing Final Truth)

4) jobId oneshot path (unchanged UX)
   — e3:worker:once -- <jobId> keeps using claimRenderJobAsWorker(jobId)
     then the same runAlreadyClaimed* bake entrypoint
   — Shared bake; different claim front-ends
```

**Invariant:** After step 1 succeeds, the job is **`RUNNING`**. All subsequent worker logic for that job **must** accept `RUNNING` (owned by `worker_ref`), never require a second `QUEUED` claim.

**Compatibility note:** Refactor tip `runRealRenderWorkerJob` into `claim*(…) + runAlreadyClaimed*(…)` so oneshot and poller share one bake contract. This is an **implementation** change under a later GO — not done by this freeze.

### 4.3 Why not “peek id then existing claim”

A peek that returns `id` without holding exclusion until CAS allows two pollers to race the same id (one wins CAS; wasted AuthZ). Acceptable only if peek uses the **same** `SKIP LOCKED` transaction that immediately performs the `QUEUED→RUNNING` CAS (i.e. it is claim-next, not a soft peek). Soft peek without lock = **rejected**.

### 4.4 Enqueue

**Unchanged.** No new enqueue fields required for V1. Contabo is still not started by enqueue.

---

## 5. Concurrency and single-flight

| Control | Rule |
|---------|------|
| DB | `FOR UPDATE SKIP LOCKED` + CAS `status=QUEUED` on update |
| Process | Mutex / “busy” flag: while bake runs, poller does not claim |
| Multi-host | Each instance unique `worker_ref`; SKIP LOCKED separates rows |
| systemd | One poller unit per host in V1 (no second poller service) |

---

## 6. Status / crash / timeout matrix

| Situation | Behavior |
|-----------|----------|
| Idle / no eligible job | Sleep `POLL_MS`; no claim |
| Claim won | Job `RUNNING`; proceed AuthZ → bake |
| Claim race lost | Treat as idle/retry loop next tick (no error storm) |
| AuthZ fail after claim | `RUNNING → FAILED`; **no** re-QUEUED |
| Bake/QC/upload fail | `RUNNING → FAILED`; **no** re-QUEUED |
| Wall clock > `timeout_at` | Existing timeout sweep → `TIMEOUT`; poller does **not** reclaim |
| `CANCELLED` while RUNNING | Existing cancel semantics; bake must fail closed if no longer RUNNING |
| Process crash mid-RUNNING | On restart: **do not** auto-reclaim; leave row until timeout sweep → `TIMEOUT` |
| `FAILED` / `TIMEOUT` / `SUCCEEDED` | Terminal for poller |

**Auto-retry:** **FORBIDDEN** for V1 poller (OD-CWP-06). Manual Owner re-export = new enqueue / new idempotency key (existing product path).

---

## 7. Graceful shutdown

| Phase | Behavior |
|-------|----------|
| Signal (SIGTERM/SIGINT) | Set `stopping`; **stop** new claim-next |
| In-flight job | **Finish current bake** until process hard-limit `SHUTDOWN_GRACE_S` (impl constant; propose 200s ≥ 180s job timeout class) |
| Grace exceeded | Exit non-zero; in-flight job remains `RUNNING` until timeout sweep → `TIMEOUT` (no re-QUEUED) |
| After clean finish | Exit 0; unit restart policy per Ops GO (not enabled by this freeze) |

---

## 8. Monitoring · health · logging · secrets

| Topic | Rule |
|-------|------|
| Health | Process alive + last successful poll tick + busy/idle + `worker_ref` |
| Metrics (minimal) | claims_ok · claims_empty · authz_fail · bake_fail · bake_ok · shutdowns |
| Logs | job id · kind · status transitions · error **codes** · durations |
| **Forbidden in logs/docs** | signed URLs · cookies · tokens · `E3_RENDER_WORKER_SECRET` · service_role values · `worker.env` values · raw source object keys beyond non-secret diagnostics already allowed by existing worker hygiene |

---

## 9. Proposed impl surface (not authorized now)

| Area | Proposal |
|------|----------|
| Script | `scripts/e3-render-worker-poll.ts` · `npm run e3:worker:poll` |
| DB | Migration: RPC `claim_next_studio_export_job(p_worker_ref text)` service_role only · SKIP LOCKED + CAS |
| App | Split claim vs `runAlreadyClaimedStudioExportWorkerJob`; poller uses claim-next + AuthZ + bake |
| HTTP enqueue / claim-by-id API | Unchanged |
| systemd | New/updated unit `Type=simple` running poll (Ops GO); do not silently reuse oneshot+`E3_RENDER_JOB_ID` without redesign |

---

## 10. Tests required before enable

| Layer | Must prove |
|-------|------------|
| Unit | Qualification filter · single-flight · no claim when busy · AuthZ fail leaves FAILED not QUEUED · bake entry rejects second claim |
| Integration | Two pollers / one job → one SUCCEEDED · MIX/TAKE_EXPORT in queue ignored · empty-session → FAILED + `STUDIO_RENDER_EMPTY_SESSION` |
| Contract | RPC empty when no eligible · CAS race · oneshot `jobId` path still works via shared bake |
| Canary (prod, separate GO) | One **new** `STUDIO_EXPORT` only · no touch of protected historical jobs · rollback disable |

---

## 11. Dual-plane / Contabo dependencies

| Plane | Last-known (docs; verify before impl/enable) |
|-------|-----------------------------------------------|
| `origin/main` | Docs tip advances independently |
| App-code tip | `ce2f0cc` |
| Production deploy | `2adb569` / `dpl_sAyrsHC…` (I.48-A0) |
| Contabo pipeline | Selective `@faf734b` · markers I.45CF · **API-outside-closure OPEN** |
| Host unit | Last-known **disabled/inactive** · live state **NOT VERIFIED** in freeze unit |

Impl/enable GOs must re-verify planes. Poller code must be present on Contabo at the approved sync SHA before enable.

---

## 12. Staged rollout and rollback

| Stage | Owner GO | Action |
|-------|----------|--------|
| A | **GO-DF-CONTABO-POLL** (this) | Freeze only |
| B | **GO-IMPL-CONTABO-POLL** | RPC + poller + tests · **no** enable |
| C | **GO-HOST-RO-CONTABO** | Live read-only host verify |
| D | **GO-SYNC-CONTABO-POLL** | Sync approved tree to Contabo |
| E | **GO-ENABLE-CONTABO-POLL-CANARY** | Enable poller · one new job · observe |
| F | **GO-CONTABO-POLL-ALWAYS-ON** | Persistent enable after canary PASS |

**Rollback (any enable stage):** stop/disable poller unit · confirm no worker process · optional restore oneshot+`E3_RENDER_JOB_ID` unit · leave jobs terminal; do not mass re-QUEUED.

---

## 13. Explicit non-actions (this freeze unit)

No application code · no migrations applied · no Contabo SSH mutate · no enable/start · no enqueue/claim/render · no artifact download · no Final Mix GREEN scope change · no Sacred WIP · no dirty-worktree sync.

---

## 14. Stop line

```text
GO-DF-CONTABO-POLL: DESIGN FREEZE ACCEPTED
V1: STUDIO_EXPORT only · max 1 active · atomic claim-next · no auto-retry
Claim contract: RUNNING after claim-next · bake must not re-claim QUEUED
Enqueue: UNCHANGED
NEXT: Owner GO — GO-IMPL-CONTABO-POLL (code) and/or GO-HOST-RO-CONTABO · ≠ enable yet
```
