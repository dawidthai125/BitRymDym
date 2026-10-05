# P1 — Sample Policy Matrix (Premium Tier)

**Status:** PRODUCTION VERIFIED — GREEN  
**Commit:** `5927e35`  
**Deploy:** `dpl_E1qLSLheGiVGnwYaAAoC7GYFziVu` → `www.bitrymdym.pl`  
**Owner GO:** B1/B2/B3/B4 TAK

---

## 1. Scope

Central Sample Policy for recording samples (duration, TTL, daily sessions, active READY, `canDownloadOwnTake` capability). Axis: Premium Tier / ANONYMOUS.

## 2. Owner decisions

| ID | Decision |
|----|----------|
| B1 | Sample Policy ← Premium Tier |
| B2 | `canDownloadOwnTake` capability only — take-download.ts unchanged |
| B3 | Admin DB overrides BRONZE/SILVER/GOLD |
| B4 | ANONYMOUS = 15 s |

## 3–4. Before → Target

Account Level limits replaced by Premium matrix (see evidence JSON). Global max 180 unchanged.

## 5–10. Architecture

- `getSamplePolicy` SSOT (`entitlement.ts` + `SAMPLE_POLICY_DEFAULTS`)
- Tier: `resolveProductEntitlementForAuthContext`
- Admin: `sample_policy_settings` + `/admin/sample-policy`
- Audit: `SAMPLE_POLICY_UPDATE`
- Wire: take/anon transport + beat detail UI
- Finalize: snapshot duration probe (unchanged pattern)
- ACTIVE_READY still DENY (no replace)

## 11–14. Tests

Local: typecheck/build PASS; P1 unit + d02 live 8/8 + wave4 live 3/3 + P0 PASS.

## 15. Production verification

| Check | Result |
|-------|--------|
| ANON session maxRecordingSeconds | **15** PASS |
| GOLD/auth session max (MIN beat,180) | **174** PASS |
| Admin UI defaults + ANON/FREE fixed labels | PASS |
| Bronze override 60→90→60 | PASS |
| Audit SAMPLE_POLICY_UPDATE | PASS (2 events) |
| P0 PLATFORM download DENY message | PASS |
| Playback / recording surface present | PASS |
| Verify PENDING takes cleaned FAILED | PASS |

FREE/BRONZE/SILVER exact session denials covered by unit + live suites against production DB; production UI shows GOLD for Owner admin account.

## 16–19. Deferred / limitations

P2–P6 deferred. Existing takes keep old `expires_at`. Live-test fixture beats may remain in catalog (pre-existing live test pattern) — out of P1 cleanup scope without Owner GO.

### P1 SAMPLE POLICY MATRIX:
**PRODUCTION VERIFIED — GREEN**
