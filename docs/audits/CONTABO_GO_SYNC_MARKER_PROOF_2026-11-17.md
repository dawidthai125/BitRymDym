# Contabo GO-SYNC — marker proof (partial) 2026-11-17

| Pole | Wartość |
|------|---------|
| Charakter | **Read-only** residual after always-on · **no** sync mutate |
| Gate | **GO-SYNC-CONTABO-POLL** |
| Kontrakt | [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](../decisions/CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) · [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) · prior [CONTABO_ALWAYS_ON_ENABLE_2026-11-17.md](./CONTABO_ALWAYS_ON_ENABLE_2026-11-17.md) · [CONTABO_GO_HOST_RO_2026-10-27.md](./CONTABO_GO_HOST_RO_2026-10-27.md) |
| Host | `vmi3622761` · `ubuntu@161.97.72.197` · `/opt/bitrymdym-e3-worker` |
| Evidence pack | Agent `tmp/contabo-sync-proof-2026-11-17.md` |

**Werdykt: PARTIAL MARKER-PROOF VERIFIED** — living I.45CF-style markers readable under `HAS_GIT=no`; poller PATHS byte-MATCH tip `320be85…`; **≠** full Stage D CLOSE (pipeline / once / package file SHA / marker tip diverge).

---

## FACT (summary)

| Item | Result |
|------|--------|
| `HAS_GIT` | **no** |
| Living `DEPLOYED_COMMIT` | `5fbba5c5ae04d124beb6a4dde0635f0edd5551c7` (kill-switch selective) |
| Living `WORKER_TARGET_SHA` PATHS | `e3-render-worker-poll.ts` · `audio-render.ts` · `studio-export-poller-bootstrap.ts` |
| Poller entry + bootstrap + stub vs tip | **MATCH** |
| `render-worker-pipeline.ts` / `e3-render-worker-once.ts` / `package.json` vs tip | **MISMATCH** |
| I.45CF backup | retained · living markers **superseded** |
| Poll / oneshot units | enabled+active / disabled+inactive (unchanged this session) |

Secrets **not** dumped.

---

## Status impact

| Gate | After this proof |
|------|------------------|
| **GO-SYNC-CONTABO-POLL** | **OPEN / PARTIAL** — marker-proof VERIFIED · full-tree sync **NOT DONE** |
| **GO-ENABLE-CONTABO-POLL-CANARY** | still **OPEN / NOT RUN** |
| **GO-CONTABO-POLL-ALWAYS-ON** | unchanged **CLOSED / ACCEPTED ENABLED** |

---

## NEXT

Owner GO for real selective sync of MISMATCH paths + marker rewrite · then re-RO · then formal canary. Propose plan only until mutate GO.

**≠** Product GREEN · Sacred WIP untouched.
