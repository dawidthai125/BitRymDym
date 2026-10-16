# Contabo Continuous Worker V1 — Implementation Report (GO-IMPL-CONTABO-POLL)

**Status:** **IMPLEMENTED / LOCAL TESTS PASS** · **GO-POLLER-KILL-SWITCH-01** fail-closed bootstrap  
**Date:** 2026-10-13  
**Unit:** GO-IMPL-CONTABO-POLL · GO-POLLER-KILL-SWITCH-01  
**Design Freeze:** [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](../decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md)

```text
IMPLEMENTED / LOCAL TESTS PASS
Kill switch: poller_disabled + exit 0 when E3_RENDER_JOBS_ENABLED fail-closed OFF
Contabo always-on — NOT ENABLED (separate Owner GO)
```

---

## 1. Scope delivered

| Item | Status |
|------|--------|
| Migration `claim_next_studio_export_job` (service_role, SKIP LOCKED + CAS) | **IN REPO** · **not applied to production** |
| `claimNextStudioExportAsWorker` + FINDING-01 on `RUNNING` | **DONE** |
| `runAlreadyClaimedStudioExportWorkerJob` (no second claim) | **DONE** |
| Oneshot `e3:worker:once` shares bake via claim-by-id → already-RUNNING | **DONE** |
| Poller `e3:worker:poll` · max 1 active · graceful shutdown · no auto-retry | **DONE** |
| Local vitest contracts | **PASS** |
| Contabo sync / systemd enable / canary / always-on | **NOT DONE** (Owner GO required) |

---

## 2. Atomic claim contract

```text
1) RPC claim_next_studio_export_job(p_worker_ref)
   SELECT eligible STUDIO_EXPORT QUEUED WAV … ORDER BY queued_at
     FOR UPDATE SKIP LOCKED LIMIT 1
   UPDATE … status=RUNNING, started_at, timeout_at(+180s), progress=0, worker_ref
     WHERE id AND status=QUEUED
   RETURNING row | empty

2) App claimNextStudioExportAsWorker
   FINDING-01 resolveAuthorizedStudioExportSourcesForJob
   on fail: RUNNING → FAILED (typed SOURCE_*) · never re-QUEUED

3) runAlreadyClaimedStudioExportWorkerJob(job)
   requires status=RUNNING · MUST NOT claim again
   bake / empty-session / encode fail → FAILED terminal
```

**Competition:** SKIP LOCKED + CAS `status=QUEUED` → at most one worker wins a given row.  
**Enqueue:** unchanged.  
**Kinds OUT of poller:** `MIX`, `TAKE_EXPORT`, unknown (SQL filter).

---

## 3. RPC security checklist

| Check | Result |
|-------|--------|
| `SECURITY DEFINER` | YES |
| `SET search_path = public` | YES |
| In-body `auth.role() = service_role` | YES |
| `REVOKE ALL` from `PUBLIC` / `anon` / `authenticated` | YES |
| `GRANT EXECUTE` to `service_role` only | YES |
| No blind drain of all `QUEUED` | YES (kind/tier/XOR/attempt filters) |

---

## 4. Local test evidence

```text
npm test -- src/lib/audio/studio-export-poller.test.ts \
  src/lib/audio/studio-export-bake-contract.test.ts \
  src/lib/takes/p4-take-export-worker.test.ts \
  src/lib/audio/studio-export-empty-session-i15.test.ts \
  src/lib/audio/e3-7-e-worker-pipeline.test.ts
→ PASS (54 tests in combined run; poller suite 18/18)
```

Covered: kind qualification · concurrent claim race (sim) · empty queue · single-flight · claim→bake→terminal · empty-session/bake fail no retry · graceful shutdown · log hygiene · RPC grants/search_path.

---

## 5. Kill switch (`E3_RENDER_JOBS_ENABLED`) — GO-POLLER-KILL-SWITCH-01

| Input | Bootstrap | Claim / bake |
|-------|-----------|--------------|
| `true` / `1` / `yes` / `on` (any case) | `poller_start` → claim loop | Allowed (existing AuthZ) |
| `false` / `0` / `no` / `off` | `poller_disabled` · **exit 0** | **None** |
| missing / empty / garbage | same as OFF (fail-closed) | **None** |

- Entry: `decideStudioExportPollerBootstrap` **before** `createStudioExportPoller` / `runUntilStopped`.
- Defense in depth: `claimNextStudioExportAsWorker` → `assertRenderJobsRuntimeEnabled()` before RPC.
- Env / unit changes **do not hot-reload** — require process stop/restart.
- With systemd `Restart=no`, disabled exit 0 leaves the unit inactive without crash-loop.
- Oneshot path unchanged (still uses shared runtime assert; no poller bootstrap).

---

## 6. Explicit non-actions

- No production Supabase mutation / enqueue / claim / bake in this GO  
- No systemd enable / start / always-on  
- Sacred WIP untouched · dirty main worktree unused for edits  

---

## 7. Remaining Owner GOs

| GO | Purpose |
|----|---------|
| **GO-CONTABO-POLL-ALWAYS-ON** | Persistent enable after kill-switch sync + Owner decision |

**Stop line:** kill-switch code ≠ always-on activation.
