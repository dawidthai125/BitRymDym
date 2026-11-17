# Contabo GO-CONTABO-POLL-ALWAYS-ON — enable 2026-11-17

| Pole | Wartość |
|------|---------|
| Charakter | **Persistent poller enable** · Owner GO · post-`enable --now` evidence (idempotent) |
| Data | 2026-11-17 |
| Gate | **GO-CONTABO-POLL-ALWAYS-ON** |
| Kontrakt | [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](../decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) · [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) Contabo GOs · prior RO [CONTABO_GO_HOST_RO_2026-10-27.md](./CONTABO_GO_HOST_RO_2026-10-27.md) |
| Host | `vmi3622761` · `ubuntu@161.97.72.197` · path `/opt/bitrymdym-e3-worker` (last-known) |
| Pub fingerprint (name only) | `SHA256:gTD4UkPftDiDhP5cUjnXsxJCnGxmjb/t8ZNMkxVlsdc` |

**Werdykt: ACCEPTED ENABLED** — Owner gate cleared; live unit **enabled + active/running** after idempotent `enable --now`. **≠** Product GREEN · **≠** formal STUDIO_EXPORT canary PASS · **≠** host sync SHA VERIFIED.

---

## Owner gate

```text
Owner GO quote (2026-11-17 session): „włącz always-on”
```

This closes the prepare-pack STOP line for **GO-CONTABO-POLL-ALWAYS-ON**. It does **not** close **GO-SYNC-CONTABO-POLL** or **GO-ENABLE-CONTABO-POLL-CANARY**.

---

## FACT — live host after enable --now (idempotent)

| Check | Wynik |
|-------|--------|
| Host | `vmi3622761` · `ubuntu@161.97.72.197` |
| `bitrymdym-e3-worker-poll.service` | **enabled** + **active/running** |
| `workerRef` | `contabo-poll-1` |
| Journal / ticks (sample class) | `claims_empty` (idle poll) |
| `E3_RENDER_JOBS_ENABLED` class | **true-class** (`E3_RENDER_JOBS_ENABLED_CLASS=true-class`) |
| Oneshot `bitrymdym-e3-worker.service` | **disabled/inactive** (unchanged; not the always-on unit) |
| Git in worker tree | **`HAS_GIT=no`** |
| Key fingerprint used (pub name only) | `SHA256:gTD4UkPftDiDhP5cUjnXsxJCnGxmjb/t8ZNMkxVlsdc` |

Values of `worker.env` / secrets **not** dumped.

---

## NOT VERIFIED / residual OPEN

| Item | Status |
|------|--------|
| **GO-SYNC-CONTABO-POLL** | **OPEN** — host sync SHA **NOT VERIFIED** (`HAS_GIT=no`; no alternate marker proof recorded this session) |
| **GO-ENABLE-CONTABO-POLL-CANARY** | **OPEN / NOT RUN** — formal **new** `STUDIO_EXPORT` enqueue + claim → terminal observe **not** executed this session |
| Idle `claims_empty` | Proves poller loop alive + idle · **≠** canary bake PASS · **≠** empty prod queue proven |
| Product GREEN / PRODUCTION VERIFIED | **≠** — this Ops GO does not claim them |
| SFM kinds on Contabo poller | **OUT** of V1 · unchanged |

---

## INFERENCE

- Owner accepted persistent poll enable **without** sequencing a formal canary PASS first; freeze Stage E remains residual **OPEN / NOT RUN**.
- Idempotent `enable --now` on an already-enabled unit is consistent with prior RO (2026-10-27 poll already **enabled/active**) plus explicit always-on GO close for living Ops SSOT.
- Sync residual stays honest: no `.git` → SHA still **NOT VERIFIED**.

---

## Explicit non-claims

- **≠** Product GREEN · **≠** PRODUCTION VERIFIED  
- **≠** GO-SYNC closed · **≠** canary PASS  
- Sacred WIP **untouched** · oneshot unit **not** re-enabled  
- Master / `project_zip` worker path **≠** this Contabo V1 `STUDIO_EXPORT` always-on GO  

---

## Related living SSOT

- [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) · [DECISION_LOG.md](../decisions/DECISION_LOG.md) · [PROJECT_STATE.md](../PROJECT_STATE.md) · [CHANGELOG.md](../CHANGELOG.md)
