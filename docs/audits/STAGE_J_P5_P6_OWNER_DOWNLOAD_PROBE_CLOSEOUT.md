# Stage J — P5/P6 owner download probe closeout

**Report date:** 2026-10-13  
**Scope:** Narrow Production Plane owner download endpoint response (Owner A) — **not** full WAV retrieval / E2E  
**Evidence sources:** Prior session report `BITRYMDYM — STAGE J / P5-P6 OWNER DOWNLOAD PROBE REPORT` (results recorded here; **not re-executed** in this documentation unit)  
**Living SSOT:** [PROJECT_STATE.md](../PROJECT_STATE.md)

```text
P5 (owner download, no query): PASS — endpoint JSON response only
P6 (owner download, ?foo=1): PASS — endpoint JSON response only
WAV downloaded: NO
Signed URL opened: NO
FULL FIXTURE VERIFIED: NOT CONFIRMED
object_key reject-only: PASS — separate prior scope
Stage J: OPEN
Full Final Mix Production GREEN: NOT VERIFIED
P6.8: NOT STARTED
```

---

## 1. Purpose and narrow scope

Confirm that the artifact owner receives a contract-valid **JSON** download-endpoint response:

| ID | Request | Intent |
|----|---------|--------|
| **P5** | `GET …/download` (no query) | Owner happy-path **endpoint response** (no WAV body fetch) |
| **P6** | `GET …/download?foo=1` | Unknown query param does not change AuthZ / render source |

| Item | Value |
|------|--------|
| Host | `https://www.bitrymdym.pl` |
| Endpoint | `GET /api/mix/artifacts/{id}/download` |
| Artifact | `c596e7bc-a031-4df8-a17b-31c4fd2cce8b` |
| Historical job | `61b7cdf1-0dfa-41aa-a493-e4f438d09131` — **not re-run** |
| Actor | Owner A (Dawid · public user_number `1`) |
| Out of scope | WAV byte download · opening signed URL · recording URL/cookie/token values · `object_key` claims · Contabo · enqueue · Other B · full fixture VERIFIED · Stage J close |

---

## 2. Results (prior session — not re-run here)

| ID | Request | HTTP | Contract (sanitized) | hasUrl | Verdict |
|----|---------|------|----------------------|-------|---------|
| **P5** | no query | **200** | `success=true` · `qualityTier=WAV` · `application/json` | **true** | **PASS** |
| **P6** | `?foo=1` | **200** | same functional shape as P5 · `success=true` · `qualityTier=WAV` · `application/json` | **true** | **PASS** |

Two GETs only. No WAV download. No signed URL open. No URL/cookie/token values retained in evidence.

---

## 3. Explicit non-claims

| Claim | Status |
|-------|--------|
| P5 — owner download **endpoint JSON** | **PASS** |
| P6 — unknown query `foo=1` tolerated (same allow response) | **PASS** |
| Full file / WAV byte retrieval | **NOT CONFIRMED** |
| Signed URL opened / followed | **NO** |
| Full **FIXTURE VERIFIED** | **NOT CONFIRMED** |
| `object_key` reject-only probe | **PASS** — **separate** prior closeout · [STAGE_J_OBJECT_KEY_REJECT_ONLY_PROBE_CLOSEOUT.md](./STAGE_J_OBJECT_KEY_REJECT_ONLY_PROBE_CLOSEOUT.md) |
| **J2 Download AuthZ** | **PASS / CLOSED** — separate gate |
| Full **Stage J** | **OPEN** |
| **Full Final Mix Production GREEN** | **NOT VERIFIED** |
| **P6.8** | **NOT STARTED** |
| Contabo always-on / persistent worker | **OPEN / NOT VERIFIED** · disabled/inactive |

Do **not** merge P5/P6 with object_key reject-only into one broader PASS.

---

## 4. Side effects (probe session)

- No application code / migration / config changes  
- No enqueue · no re-render · no Contabo / worker changes  
- No SQL · no Supabase / Storage writes  
- Historical job untouched  

This documentation unit: Repository Plane only · no production HTTP · no re-probe.

---

## 5. Stop line

```text
P5: PASS (endpoint response only)
P6: PASS (endpoint response only)
FULL FIXTURE VERIFIED: NOT CONFIRMED
Stage J: OPEN
Full Final Mix Production GREEN: NOT VERIFIED
NEXT: Owner GO — remaining Stage J / Final Mix gates vs P6.8
```
