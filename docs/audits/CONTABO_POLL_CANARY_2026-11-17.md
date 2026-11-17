# Contabo GO-ENABLE-CONTABO-POLL-CANARY — 2026-11-17

| Pole | Wartość |
|------|---------|
| Charakter | **One new** production `STUDIO_EXPORT` canary against always-on poller |
| Data | 2026-11-17 |
| Gate | **GO-ENABLE-CONTABO-POLL-CANARY** |
| Kontrakt | [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](../decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) · [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) · prior enable [CONTABO_ALWAYS_ON_ENABLE_2026-11-17.md](./CONTABO_ALWAYS_ON_ENABLE_2026-11-17.md) |
| Host | `vmi3622761` · `ubuntu@161.97.72.197` · unit `bitrymdym-e3-worker-poll.service` |
| Session note | [tmp/contabo-canary-2026-11-17.md](../../../tmp/contabo-canary-2026-11-17.md) (agent workspace) |

**Werdykt: PASS** — enqueue → atomic claim-next → bake terminal typed FAIL · **no** re-QUEUED · **no** mass requeue · **no** artifact download. **≠** Product GREEN.

---

## Preconditions (FACT)

| Item | Status |
|------|--------|
| Always-on poller | **ENABLED** / active / running · `workerRef=contabo-poll-1` |
| Kill switch | `E3_RENDER_JOBS_ENABLED` **true-class** (prior enable audit) |
| Prod migration `claim_next_studio_export_job` | **APPLIED** · history `20261013183721` (Supabase MCP list_migrations) — supersedes older “not applied to production” freeze/impl prose |
| Empty-session fixture `a8b42570-…` | **ABSENT** (deleted) — I.18 empty pattern preferred but unavailable |
| Active `QUEUED`/`RUNNING` STUDIO_EXPORT before enqueue | **0** |

---

## Canary execution

| Step | Evidence |
|------|----------|
| Enqueue | Owner-auth `POST /api/studio/projects/901428a5-564d-4dc3-8a0f-6d66d792f01d/export` · body `{ expectedDocumentVersion: 18, idempotencyKey: "contabo-poll-canary-2026-11-17-v1" }` · HTTP **200** |
| Job id | `7122e55b-62e7-44a4-a345-8a9b787f989f` |
| Kind / tier | `STUDIO_EXPORT` / `WAV` · attempt **1** |
| Contabo journal | `claim_ok` @ 05:54:32 CET · then `bake_fail` `errorCode=STUDIO_RENDER_DURATION_CAP` (~580 ms) · then idle `claims_empty` |
| DB terminal | `status=FAILED` · `error_code=LIMIT` · `worker_ref=contabo-poll-1` · `queued_at` / `started_at` / `finished_at` set |
| Re-queue | **absent** (job remains FAILED; poller idle) |
| Download | **not** performed (no master / WAV fetch) |

Public/API surface maps duration-cap bake fail to allowlisted **`LIMIT`** (Polish copy). Journal retains renderer code `STUDIO_RENDER_DURATION_CAP`. Both are typed terminal failure — freeze accepts typed FAILED without re-QUEUED.

---

## NOT VERIFIED / residual

| Item | Status |
|------|--------|
| SUCCEEDED WAV bake canary | **NOT RUN** this unit (duration-cap FAIL on this fixture) |
| Empty-session `STUDIO_RENDER_EMPTY_SESSION` repro | **NOT RUN** (fixture gone) |
| GO-SYNC-CONTABO-POLL full close | **OPEN / PARTIAL** (marker-proof only) |
| Product GREEN | **≠** |

---

## Explicit non-actions

No mass re-QUEUED · no oneshot mutate · no `worker.env` dump · no secrets in docs · Sacred WIP untouched · no Contabo sync mutate.

---

## Stop line

```text
GO-ENABLE-CONTABO-POLL-CANARY: PASS
jobId: 7122e55b-62e7-44a4-a345-8a9b787f989f
workerRef: contabo-poll-1
terminal: FAILED / LIMIT (journal STUDIO_RENDER_DURATION_CAP)
claim_next prod: APPLIED
≠ Product GREEN
```
