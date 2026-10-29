# Premium Gold — retencja produkcyjna = 28 dni

| Pole | Wartość |
|------|---------|
| Status | **OWNER-ACCEPTED** 2026-10-25 |
| Typ | Decyzja wartości polityki (≠ aktywacja Retention) |
| Owner | Prezes Dawid |

## Decyzja

Kanoniczna wartość **retencji Gold w produkcji** wynosi dokładnie **28 dni** (ta sama semantyka jednostki „dzień” / `DAY`, co w `PREMIUM_TIER_MATRIX` i `PREMIUM_RETENTION_DAYS`).

Rozstrzyga wcześniejszą rozbieżność:

| Źródło | Przed | Po |
|--------|-------|-----|
| `PREMIUM_RETENTION_DAYS.GOLD` (export contract / OD-EXPORT-12) | 28 | **28** (bez zmian) |
| `PREMIUM_TIER_MATRIX.GOLD.artifactRetentionSeconds` | 30 × DAY | **28 × DAY** |

**SILVER** pozostaje **30 dni** (`PREMIUM_TIER_MATRIX.SILVER.artifactRetentionSeconds`).  
Helper `retentionSecondsForPremium(true)` mapuje na klasę **SILVER** (30d) — **nie** na GOLD; to osobna, starsza oś kompatybilności (`render-job-core.ts`), nie zatarcie reguły Gold 28d.

Inne limity Premium bez zmian.

## HOLD — bez aktywacji

- **Premium Retention** (executor / cron / Storage purge) pozostaje **HOLD**.
- `isGoldRetentionProductionEnabled()` pozostaje **`false`** (90 dni design-only).
- Ta decyzja **nie** autoryzuje: crona retention, janitora, migracji apply, usuwania danych, commit/push/deploy.

## Weryfikacja unit (2026-10-25)

**FACT:** `npx vitest run` (4 pliki) → **48 PASS** / 0 fail:

| Plik | Chroni |
|------|--------|
| `src/lib/entitlements/w2a-premium-foundation.test.ts` | GOLD artifact / `retentionSecondsForTier("GOLD")` = **28d**; 90d design-only |
| `src/lib/premium/premium-export-policy.test.ts` | `PREMIUM_RETENTION_DAYS.GOLD` = **28** |
| `src/lib/audio/e3-1-foundation.test.ts` | SILVER matrix = **30d** |
| `src/lib/audio/e3-5-render-jobs.test.ts` | `retentionSecondsForPremium(true)` = **30d** (SILVER) |

Źródło wyniku: sesja Owner GO + test-auditor (zakres) + wykonanie Vitest w tej samej sesji.

## Powiązane SSOT

- [PREMIUM_EXPORT_AND_DOWNLOAD_CONTRACT.md](./PREMIUM_EXPORT_AND_DOWNLOAD_CONTRACT.md) — OD-EXPORT-12 (GOLD 28 dni)
- [W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md](./W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md) — macierz (uzupełnienie produkcji 28d)
- [W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md](./W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md) — living claim Gold prod **28d**
- [PREMIUM_RETENTION_FENCING_CONTRACT.md](./PREMIUM_RETENTION_FENCING_CONTRACT.md) — HOLD
- Runtime: `src/config/premium-tiers.ts`, `src/config/premium-export-policy.ts`, `src/lib/audio/render-job-core.ts`
