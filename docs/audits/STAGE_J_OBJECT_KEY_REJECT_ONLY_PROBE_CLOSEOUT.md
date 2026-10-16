# Stage J — object_key reject-only live probe closeout

**Report date:** 2026-10-13  
**Scope:** Narrow Production Plane reject-only probe of client-supplied `object_key` on artifact download  
**Evidence sources:** Owner-supplied session reports (not committed artifacts in this repository) — Owner A reject-only report; unauthenticated P4; Other B P3 (`BITRYMDYM — STAGE J / P3 OTHER-USER PROBE REPORT`)  
**Living SSOT:** [PROJECT_STATE.md](../PROJECT_STATE.md)

```text
object_key reject-only (tested scope): PASS
P5 / P6: NOT EXECUTED / OUT OF SCOPE
FIXTURE VERIFIED: NOT CONFIRMED
Stage J: OPEN
Full Final Mix Production GREEN: NOT VERIFIED
J2 Download AuthZ: PASS / CLOSED — separate gate
```

---

## 1. Purpose and narrow scope

Confirm that production download rejects client `object_key` as a render/download source claim (reject-only), for the cases actually executed.

| Item | Value |
|------|--------|
| Host | `https://www.bitrymdym.pl` |
| Endpoint | `GET /api/mix/artifacts/{id}/download` with query `object_key=…` |
| In scope | Claim rejection when `object_key` is present (Owner A matrix · unauth · other user) |
| Out of scope | P5 owner happy-path without claim · P6 unrelated `foo=1` · WAV byte download · opening signed URLs · enqueue / re-render · Contabo · SQL / Storage writes · full fixture VERIFIED · Stage J full close · Full Final Mix GREEN |

This closeout does **not** re-execute probes. It documents Owner-delivered session results only.

---

## 2. Results (tested)

| ID | Actor | Case | Result |
|----|-------|------|--------|
| **P1** | Owner A | `object_key=evil/path` | **PASS** |
| **P2** | Owner A | 21 supported claim keys, each tested alone | **PASS** 21/21 |
| **P8** | Owner A | empty `object_key=` | **PASS** |
| **P9** | Owner A | path-traversal-like value | **PASS** |
| **P4** | No session | request with `object_key` | **PASS** · HTTP **403** |
| **P3** | Other B (public user_number **469**) | `object_key=x` · single GET only | **PASS** · HTTP **403** · body includes `Client must not supply object_key as render source.` · `hasUrl=false` |

Owner A session report aggregate: **24/24 PASS** (P1 + P2×21 + P8 + P9).

---

## 3. Explicit non-claims

| Claim | Status |
|-------|--------|
| `object_key reject-only (tested scope)` | **PASS** |
| P5 — owner download without claim | **NOT EXECUTED / OUT OF SCOPE** |
| P6 — unrelated query param `foo=1` | **NOT EXECUTED / OUT OF SCOPE** |
| Full **FIXTURE VERIFIED** | **NOT CONFIRMED** |
| Full **Stage J** close | **OPEN** (unchanged) |
| **Full Final Mix Production GREEN** | **NOT VERIFIED** |
| **J2 Download AuthZ** (I.45EX-A16/A17/A18) | **PASS / CLOSED** — **separate gate** · [I45EX_J2_DOWNLOAD_AUTHZ_GATE_CLOSEOUT.md](./I45EX_J2_DOWNLOAD_AUTHZ_GATE_CLOSEOUT.md) |

Reject-only PASS is **not** owner control verification, **not** successful file retrieval, **not** full fixture verification, and **not** Stage J closure.

---

## 4. Side effects (described probe scope)

- No application code / migration / config changes from these probes  
- No WAV bytes downloaded · no signed URL values opened or recorded here  
- No enqueue · no re-render · no Contabo / worker changes  
- No SQL · no Supabase / Storage writes  
- P3: single GET only · no extra operations  

This documentation unit: Repository Plane only · no production HTTP · no commit/push/PR/deploy by itself.

---

## 5. Stop line

```text
object_key reject-only (tested scope): PASS
P5 / P6: NOT EXECUTED / OUT OF SCOPE
FIXTURE VERIFIED: NOT CONFIRMED
Stage J: OPEN
Full Final Mix Production GREEN: NOT VERIFIED
NEXT: Owner GO — remaining Stage J / Final Mix gates vs P6.8 · optional P5/P6
```
