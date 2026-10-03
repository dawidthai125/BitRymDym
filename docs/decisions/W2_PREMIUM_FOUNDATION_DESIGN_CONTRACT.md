# W2 Premium Foundation — Design Contract

**Status:** DESIGN CONTRACT READY
**Implementation:** NOT AUTHORIZED
**Date:** 2026-10-03
**Owner:** Prezes Dawid
**Gate:** AUDIT → OWNER DECISION RECONCILIATION → DESIGN CONTRACT

**Related SSOT (read-only references — do not supersede without Owner GO):**

- [CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md](./CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md) @ `1e66cae`
- [CREATOR_PROGRESS_W1_CLOSEOUT.md](../audits/CREATOR_PROGRESS_W1_CLOSEOUT.md)
- W2 Premium Foundation Audit (session / Owner Review — PASS)
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md) — OD-08 CLOSED by this Owner reconciliation

---

## 1. Status

| Plane | State |
|-------|--------|
| W1 Experience + Rank | CLOSED / PRODUCTION VERIFIED WITH OPEN ITEMS @ `76a4757` (docs tip `c5ed0d5`) |
| W2 Audit | PASS |
| This Design Contract | READY |
| W2-A Implementation GO | **NOT AUTHORIZED** |
| Production DB / Storage / Deploy | **NO MUTATION** under this gate |

---

## 2. Owner decisions (accepted)

| Decision | Value |
|----------|--------|
| OD-08 Premium tiers | **CLOSED / ACCEPTED** — FREE / BRONZE / SILVER / GOLD |
| Legacy binary Premium mapping | Active non-expired Premium → **SILVER** (not GOLD) |
| Inactive / expired Premium | Effective tier → **FREE** |
| No active entitlement row | Effective tier → **FREE** |
| W2-A scope | Tier schema + resolver + capability foundation + security contract + E3 compatibility + render snapshot prep + tests |
| Recording Premium overlay numbers | **OPEN / DEFERRED** (not in W2-A) |
| Gold 90d retention | **DESIGN ONLY** — blocked for PRODUCTION claim until artifact janitor verified |
| Billing / checkout / OD-04 / OD-07 | **OUT OF W2-A** — remain OPEN |
| OD-09 Account Level display names | **OPEN** (unchanged; ≠ Premium tier labels) |

Axes remain orthogonal:

```text
Premium tier ≠ Creator Rank ≠ Account Level ≠ Role
```

---

## 3. Premium tier model

Canonical product tiers (OD-08):

| Tier | Meaning |
|------|---------|
| FREE | No active paid overlay (or inactive / expired) |
| BRONZE | Paid overlay `tier = BRONZE` |
| SILVER | Paid overlay `tier = SILVER` |
| GOLD | Paid overlay `tier = GOLD` |

Effective Premium requires: active entitlement + not past `expires_at` + tier.

Manual / admin grant remains the operational path until billing GO (service_role / ops only).

---

## 4. Legacy Premium mapping

Today production has **binary** `premium_entitlements` (`active`, `source`, `expires_at` — **no** `tier` column).

**Future migration contract (do not apply under this gate):**

| Current row | Effective target tier |
|-------------|------------------------|
| `active = true` AND (`expires_at` IS NULL OR `expires_at` > now) | **SILVER** |
| `active = false` OR expired | **FREE** |
| No row | **FREE** |

**Rationale:** legacy binary Premium must not auto-upgrade to GOLD without a separate business decision.

Implementation of the migration requires a later **W2-A Implementation GO**.

---

## 5. Capability matrix (DESIGN CONTRACT)

| Capability | FREE | BRONZE | SILVER | GOLD |
|------------|------|--------|--------|------|
| `downloads_daily` (logged-in) | 4 | 10 | 25 | 50 |
| `downloads_daily` (anon) | 2 (OD-05) | — | — | — |
| `renders_daily` | 5 | 10 | 20 | 40 |
| `renders_concurrent` | 1 | 1 | 2 | 3 |
| `artifact_retention` | 48h | 7d | 30d | **90d DESIGN ONLY** |
| `artifact_quota` | 250 MiB | 500 MiB | 2 GiB | 5 GiB |
| `EXPORT_BASIC_MP3` | ✓ | ✓ | ✓ | ✓ |
| `EXPORT_HQ_MP3` | — | ✓ | ✓ | ✓ |
| `EXPORT_WAV` | — | — | — | ✓ |
| `MIX_BASIC` / `MASTER_BASIC` | ✓ | ✓ | ✓ | ✓ |
| `MIX_PRO` / `MASTER_PRO` | — | — | ✓ | ✓ |
| Priority (design intent) | normal | elevated | elevated | highest |

**W2-A note:** matrix is the product contract. Full enforcement of downloads / priority / Gold 90d PRODUCTION is **out of W2-A** (see §15–16). W2-A prepares schema + resolver + capability foundation so later gates can wire enforcement without scattering `if (tier === …)`.

---

## 6. Resolver contract

### Target

Central server-only function (name reserved):

`resolveProductEntitlement(context)`

### Input

- Authenticated user / session context (server-trusted `userId`)
- No client-supplied entitlement fields

### Sources (server-side only)

- Profile (`account_level` for axes that need it — **not** as Premium)
- `premium_entitlements` (active + expiry + future `tier`)
- Creator Progress (`experience_total` / Rank derivation)

### Output (conceptual)

```text
{
  rank,                 // CreatorRank (derived)
  experience,           // total + next threshold helpers as needed
  premiumTier,          // FREE | BRONZE | SILVER | GOLD
  capabilities,         // AudioCapabilityKey[] (and future product caps)
  limits                // numeric daily/concurrent/retention/quota as applicable
}
```

### Evolution of existing E3 SSOT

Current: `resolveEffectiveAudioEntitlement` / `loadPremiumEntitlementSnapshot`.

**Contract:** do **not** create a second parallel SSOT. Future W2-A shall **extend** the existing audio entitlement path or make it a **thin wrapper** over `resolveProductEntitlement`.

### Security (mandatory)

Client **must not** provide or override:

- `premiumTier` / `premiumActive` / `isPremium`
- `capabilities` / `limits`
- `rank` / `experience`

Existing `rejectClientChosenPremiumClaims` remains the pattern to extend.

---

## 7. Security contract (future W2-A)

| Actor | `premium_entitlements` |
|-------|------------------------|
| USER (authenticated) | SELECT own only |
| USER | NO INSERT / UPDATE / DELETE / tier mutation |
| anon | NO meaningful access (no write policies; SELECT not for others’ rows) |
| service_role / trusted server | Controlled entitlement operations only |

Privilege-escalation trigger pattern (existing E3) must continue to block client mutations after `tier` is added.

Defense-in-depth explicit REVOKE of table DML for anon/authenticated is in scope for W2-A security hardening (aligned with W1 OPEN-01 class of issue).

**Not under this gate:** applying GRANT/RLS/SQL changes.

---

## 8. Render snapshot contract

Future job `entitlement_snapshot` should freeze at **CREATE**:

- `premiumTier`
- `capabilities`
- numeric limits relevant to the job (daily/concurrent/retention/quota as needed)

Rules:

- Entitlement evaluated at **job creation** (server)
- Worker must not trust client claims
- Completion / retention uses **snapshot** (immutable for that job)
- Optional mid-queue revoke policy is **not** decided here

W2-A prepares types/mapping; full cutover of binary Free/Premium constants → tier matrix is part of W2-A/W2-B boundary under Implementation GO.

---

## 9. Mix / Master target

| Capability | Min tier |
|------------|----------|
| MIX / MASTER Basic | FREE+ |
| EXPORT Basic MP3 | FREE+ |
| EXPORT HQ MP3 | BRONZE+ |
| MIX_PRO / MASTER_PRO | SILVER+ |
| EXPORT WAV | GOLD+ |

Feature code must use **capabilities** from the resolver — **not** scattered `if (tier === …)` in UI or domain services.

---

## 10. Downloads target

| Tier | Logged-in daily downloads |
|------|---------------------------|
| FREE | 4 |
| BRONZE | 10 |
| SILVER | 25 |
| GOLD | 50 |
| ANON | 2 (OD-05 unchanged) |

Server-side enforcement only; client does not supply limits.

**Deferred from W2-A:** full download-slot tier enforcement → future W2-D / separate Owner GO.

---

## 11. Recording deferred

- `profiles.account_level` **UNCHANGED**
- OD-REC freezes **UNCHANGED**
- Recording Premium overlay **architecturally allowed** (OD-REC-04 HYBRID) but **numeric overlay OPEN / DEFERRED**
- Creator Rank **does not** control recording
- W2-A **must not** change recording entitlement code paths

---

## 12. Artifact retention / Gold 90d limitation

| Item | Status |
|------|--------|
| Takes janitor | Exists (separate from artifacts) |
| Audio-artifacts janitor | **NOT IMPLEMENTED** (OD-SA-05 / STORAGE-ARCH-03) |
| Gold `artifact_retention = 90d` | **DESIGN ONLY** |
| PRODUCTION claim / sale of Gold 90d | **BLOCKED** until janitor implemented + tested + production-verified |

W2-A must not mark Gold 90d as production-ready.

---

## 13. Billing deferred

Out of W2 Foundation / W2-A:

- Stripe / payment provider (OD-04 OPEN)
- Checkout / subscriptions / webhooks
- Pricing UI (OD-07 OPEN)
- Fake checkout **FORBIDDEN**

Operational entitlement grants may remain admin/service_role until billing GO.

---

## 14. Non-goals (this contract / W2-A)

- Billing / checkout / subscriptions
- `/premium` UI · `/ranks` UI
- Recording hybrid overlay numbers
- Artifact janitor implementation
- Gold 90d PRODUCTION availability
- Priority queue product
- Full download tier enforcement
- Changing `account_level` enum or recording SSOT
- Changing Creator Rank thresholds
- Closing OD-04 / OD-07 / OD-09 without Owner

---

## 15. W2-A implementation boundary

**In scope when Implementation GO is granted (future):**

1. Premium tier schema foundation (`tier` on `premium_entitlements` + constraints)
2. Legacy mapping migration: active Premium → SILVER
3. Central entitlement resolver foundation (extend E3; no dual SSOT)
4. Capability matrix config foundation
5. Server-side resolution only
6. RLS / grants / trigger hardening
7. E3 Mix/Master/Render compatibility path (binary → tier capabilities)
8. Render entitlement snapshot preparation (tier + capabilities + limits)
9. Contract / unit / security tests

**Out of W2-A (separate gates):**

- Billing, checkout, prices
- Premium / Ranks UI
- Recording overlay
- Artifact janitor / Gold 90d PRODUCTION
- Priority queue
- Full download tier enforcement product cutover (may share config, not full GO)

---

## 16. Future gates

```text
W2-A  Premium tier foundation + resolver + security     → requires Implementation GO
W2-B  Product entitlement cutover (audio paths)         → may merge with W2-A under one GO if Owner scopes
W2-C  Security hardening completion                     → may merge with W2-A
W2-D  Downloads tier enforcement                        → separate GO
W2-E  Recording Premium overlay (numbers locked)        → separate GO + Owner numbers
W2-F  Artifact janitor + Gold 90d PRODUCTION claim      → STORAGE / OD-SA-05 GO
W2-G  Billing / checkout                                → OD-04 + OD-07 + billing GO
W2-H  Premium / Ranks UI                                → separate product GO
```

---

## 17. Risks

| Level | Risk |
|-------|------|
| P1 | Legacy → SILVER mapping must be applied consistently; accidental GOLD upgrade forbidden |
| P1 | Dual SSOT if new resolver is added beside E3 without wrapping |
| P1 | Declaring Gold 90d production-ready without janitor |
| P2 | Binary Premium caps (30 renders / Pro+HQ+WAV together) differ from SILVER matrix — cutover needs careful compatibility tests |
| P2 | Table DML grants residual until hardening |

---

## 18. Explicit Implementation GO required

```text
This Design Contract DOES NOT authorize:
- code changes
- database migrations
- production mutations
- deploy
- commit/push of application code

W2-A may proceed ONLY after a separate, explicit:
  OWNER GO — W2-A IMPLEMENTATION
```

---

STATUS: **DESIGN CONTRACT READY**
IMPLEMENTATION: **NOT AUTHORIZED**
