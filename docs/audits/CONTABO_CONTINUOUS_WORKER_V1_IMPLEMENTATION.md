# Contabo Continuous Worker V1 — Implementation Report (GO-IMPL-CONTABO-POLL)

**Status:** **IMPLEMENTED / LOCAL TESTS PASS**  
**Date:** 2026-10-13  
**Unit:** GO-IMPL-CONTABO-POLL  
**Design Freeze:** [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](../decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md)

```text
IMPLEMENTED / LOCAL TESTS PASS
Contabo sync — NOT DONE
production deployment — NOT DONE
host verification — NOT DONE
canary — NOT RUN
always-on — NOT ENABLED
Final Mix Production GREEN — UNCHANGED (VERIFIED)
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

## 5. Explicit non-actions

- No production Supabase migration apply  
- No Contabo SSH / sync / unit enable  
- No production enqueue / claim / render / artifact download  
- No Final Mix GREEN / WAIVE / OUT scope change  
- Sacred WIP untouched · dirty main worktree unused for edits  

---

## 6. Remaining Owner GOs

| GO | Purpose |
|----|---------|
| **GO-HOST-RO-CONTABO** | Live read-only host verify |
| **GO-SYNC-CONTABO-POLL** | Sync approved tree to Contabo |
| **GO-ENABLE-CONTABO-POLL-CANARY** | Enable poller · one new job |
| **GO-CONTABO-POLL-ALWAYS-ON** | Persistent enable after canary PASS |
| (also) production migration apply | Separate Owner GO before any remote RPC use |

**Stop line:** local impl ≠ Contabo sync ≠ deploy ≠ canary ≠ always-on.
