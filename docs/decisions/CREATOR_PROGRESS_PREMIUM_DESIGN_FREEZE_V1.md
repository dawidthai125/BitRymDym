# CREATOR PROGRESS + PREMIUM — DESIGN FREEZE V1

**Status:** DESIGN FROZEN  
**Implementation:** **NOT AUTHORIZED**  
**Scope of this document:** product + architecture design SSOT only  
**Does not authorize:** code, migrations, DB, Auth, Storage, billing, deploy, or any Implementation GO

**Doctrine anchors (existing):**
- ROLE ≠ ACCOUNT LEVEL — `docs/architecture/AUTHORIZATION.md`
- Account Level ≠ Premium — E3 / `MASTER_HANDOFF.md`
- OD-REC-04 HYBRID (CLOSED) — Account Level base + future Premium overlay for recording
- ACCOUNT/PROFILE-01 — CLOSED (do not reopen)

---

## 1. Status

| Item | Value |
|------|--------|
| Design | **DESIGN FROZEN** |
| Implementation | **NOT AUTHORIZED** |
| Billing / payments | **DEFERRED** |
| Fake checkout | **FORBIDDEN** |
| `profiles.account_level` | **UNCHANGED** in V1 |
| ACCOUNT/PROFILE-01 | **CLOSED** — do not reopen |

---

## 2. Product doctrine (FROZEN)

1. RANK ≠ PREMIUM
2. RANK ≠ ROLE
3. RANK ≠ ACCOUNT STATUS
4. UI/product term: **Doświadczenie** (never „XP”)
5. Experience does **not** decay (admin/fraud compensating events only)
6. Experience ledger = SSOT; `experience_total` = derived/cache
7. Experience awards = **server-only**
8. Anti-abuse = mandatory
9. Premium = separate capability overlay (not Rank, not Role)
10. Premium tiers: Free / Bronze / Silver / Gold
11. Recording = **HYBRID**: legacy `account_level` + optional Premium overlay
12. Rank does **not** drive recording in V1
13. Central facade: `resolveProductEntitlement(user)` → rank, experience, premiumTier, capabilities, limits
14. Forbidden in features: scattered `if (tier === "gold")`
15. Routes (design): `/ranks`, `/premium`
16. Listens: **NOT PRODUCT LIMITED**
17. Raw listens / downloads / clicks / previews / failed jobs / retries / re-publish / spam → **0 experience**
18. Verified engagement experience → **DEFERRED**

---

## 3. Rank ladder (FROZEN)

| Enum key (creator rank) | Threshold (`experience_total` ≥) | EN | PL (localization proposal) |
|-------------------------|---------------------------------:|----|----------------------------|
| `BEGINNER_RAPPER` | 0 | Beginner Rapper | Początkujący raper |
| `ROOKIE_RAPPER` | 200 | Rookie Rapper | Debiutant |
| `RISING_RAPPER` | 800 | Rising Rapper | Wschodzący raper |
| `PRO_RAPPER` | 2 500 | Pro Rapper | Pro raper |
| `ELITE_RAPPER` | 7 000 | Elite Rapper | Elita |
| `LEGEND_RAPPER` | 20 000 | Legend Rapper | Legenda |

**Important:** These keys name **creator rank** (progress). They are **not** a migration or rename of `profiles.account_level`.  
Legacy DB `account_level` remains the three-value recording enum: `BEGINNER_RAPPER` | `PRO_RAPPER` | `LEGEND_RAPPER` — **UNCHANGED**.

PL labels above are a **localization proposal** unless Owner separately approves them as final copy.

Forbidden rank names: Premium/VIP/Gold/Silver/Bronze Rapper.

---

## 4. Experience economy (FROZEN)

**Priority (highest first):**
1. Real creator output (publish / approve path)
2. Completing a creative process (first successful Mix session export)
3. Bounded technical completion signals (READY take, successful render) — capped
4. One-time profile completion — small

**Does not decay.** Corrections only via admin compensating events.

One beat happy path (`BEAT_APPROVED` + `BEAT_FIRST_PUBLISHED`) = **160** experience.

---

## 5. Experience events (FROZEN)

| EVENT | Amount | Limits / rules | Idempotency |
|-------|-------:|----------------|-------------|
| `PROFILE_COMPLETED` | 25 | 1× lifetime | `profile_completed:{user_id}` |
| `BEAT_APPROVED` | 40 | 1× / beat; credit → beat owner | `beat_approved:{beat_id}` |
| `BEAT_FIRST_PUBLISHED` | 120 | 1× / beat (first PUBLISHED only) | `beat_first_published:{beat_id}` |
| `MIX_SESSION_FIRST_EXPORT` | 35 | 1× / mix_session | `mix_first_export:{session_id}` |
| `RENDER_SUCCEEDED` | 15 | max **2** / UTC day; no retry credit | `render_succeeded:{job_id}` |
| `TAKE_READY` | 10 | max **3** / UTC day; **auth only** | `take_ready:{take_id}` |

### 5.1 Explicit zeros (FROZEN)

No experience for: raw listens, raw downloads, clicks, previews, failed jobs, retries of same subject, re-publish, spam/farming.

---

## 6. Anti-abuse (FROZEN)

- Ledger-only writes
- Unique `idempotency_key`
- Subject uniqueness per event type
- Daily caps as in §5
- No credit on re-publish / retry
- Self-exclusion for any future engagement awards
- Admin compensating events only for corrections
- Server-only award paths at trusted transitions

---

## 7. Premium tiers (FROZEN design)

| Tier | Meaning |
|------|---------|
| Free | No active paid overlay row (or inactive) |
| Bronze | `tier = BRONZE` |
| Silver | `tier = SILVER` |
| Gold | `tier = GOLD` |

Effective Premium = active entitlement (`active` + not past `expires_at`) with tier.

Manual admin grant remains allowed: `source`, `tier`, `expires_at` — **service_role / ops only**.

---

## 8. Premium prices (PROJECT OFFER — not billing authorization)

| Tier | Monthly | Yearly |
|------|--------:|-------:|
| Free | 0 zł | 0 zł |
| Bronze | 19 zł | 190 zł |
| Silver | 39 zł | 390 zł |
| Gold | 69 zł | 690 zł |

These prices are a **design catalog offer** for a future billing GO.  
They do **not** authorize payments integration, checkout, or charging users.  
Operator / VAT / final commercial terms remain tied to existing **OD-04** / billing GO.  
**OD-07** remains OPEN until a separate Owner decision / billing GO.

---

## 9. Capability matrix (FROZEN design targets)

| Capability | Free | Bronze | Silver | Gold |
|------------|------|--------|--------|------|
| `downloads_daily` (logged-in) | 4 | 10 | 25 | 50 |
| `downloads_daily` (anon) | 2 (OD-05 unchanged) | — | — | — |
| `listens_daily` | NOT PRODUCT LIMITED | same | same | same |
| `renders_daily` | 5 | 10 | 20 | 40 |
| `renders_concurrent` | 1 | 1 | 2 | 3 |
| `artifact_retention` | 48h | 7d | 30d | **90d DESIGN ONLY** (§12) |
| `artifact_quota` | 250 MiB | 500 MiB | 2 GiB | 5 GiB |
| `EXPORT_BASIC_MP3` | ✓ | ✓ | ✓ | ✓ |
| `EXPORT_HQ_MP3` | — | ✓ | ✓ | ✓ |
| `MIX_BASIC` / `MASTER_BASIC` | ✓ | ✓ | ✓ | ✓ |
| `MIX_PRO` / `MASTER_PRO` | — | — | ✓ | ✓ |
| `EXPORT_WAV` | — | — | — | ✓ |
| Recording | HYBRID (§10) | overlay allowed | overlay allowed | overlay allowed |

All tiers: listens NOT PRODUCT LIMITED; Basic MP3; Basic Mix/Master.

Anon download limit unchanged (OD-05 = 2).

---

## 10. Recording hybrid (FROZEN)

```
effective_recording_policy =
  merge/max(
    legacy_policy(profiles.account_level),  -- UNCHANGED column + OD-REC semantics
    premium_recording_overlay(premium_tier) -- optional boosts
  )
```

| Rule | V1 |
|------|-----|
| `profiles.account_level` | **UNCHANGED** (no enum migration for Rank) |
| OD-REC freezes | **Not modified** by this document |
| OD-REC-04 | **CLOSED** — unchanged; this freeze aligns with hybrid |
| Creator Rank / Experience | **Do not** control recording |
| Premium | May overlay duration / retention / anti-abuse caps |

**Exact numeric Premium→recording overlay values** are **not** frozen in this document.  
Overlay is **architecturally allowed**; numbers remain an **OPEN OWNER DECISION** until explicitly locked.

---

## 11. Mix / Master / Export

Reuse existing capability keys. Tier mapping per §9.  
Extend central resolver; do not scatter tier checks in UI.

| Cap | Free | Bronze | Silver | Gold |
|-----|------|--------|--------|------|
| MIX / MASTER Basic | ✓ | ✓ | ✓ | ✓ |
| EXPORT Basic MP3 | ✓ | ✓ | ✓ | ✓ |
| EXPORT HQ MP3 | — | ✓ | ✓ | ✓ |
| MIX_PRO / MASTER_PRO | — | — | ✓ | ✓ |
| EXPORT_WAV | — | — | — | ✓ |

---

## 12. STORAGE / JANITOR WARNING (FROZEN)

> **Gold `artifact_retention` = 90d is DESIGN CAPABILITY only.**  
> It must **not** be marked or sold as **PRODUCTION AVAILABLE** until the **audio-artifacts janitor** is implemented and production-verified (existing OD-SA-05 / STORAGE-ARCH-03 track).  
> Takes janitor already exists; it does **not** satisfy artifact janitor.  
> **OD-SA-05** remains unchanged by this document.

---

## 13. Data model (DESIGN ONLY — do not implement under Docs Freeze)

### `creator_experience_events` (ledger SSOT)
- `id`
- `user_id`
- `event_type`
- `subject_id`
- `amount`
- `idempotency_key`
- `created_at`
- `metadata`

### Derived
- `experience_total` — derived/cache (server-write)
- `creator_rank` — derived from `experience_total` + §3 thresholds

### `premium_entitlements` (extend existing table — future impl)
- `tier` (additive vs today’s binary row)
- `active`
- `source`
- `expires_at`

### `subscriptions`
- **DEFERRED**

### Unchanged
- `profiles.account_level`
- `profiles.role`
- ACCOUNT/PROFILE-01 protected fields / delete contract (no reopen)

---

## 14. Architecture facade (FROZEN)

```
resolveProductEntitlement(user) → {
  rank,
  experience,          // total + next threshold
  premiumTier,         // Free | Bronze | Silver | Gold
  capabilities,
  limits
}
```

Recording policy remains composable with legacy `takes/entitlement` + premium overlay (hybrid).  
Audio Mix/Export continues to flow through capability keys (evolve from `resolveEffectiveAudioEntitlement`).

Forbidden: scattered `if (tier === "gold")` (or equivalent) in feature components.

---

## 15. Security (FROZEN)

| Actor | May | Must not |
|-------|-----|----------|
| USER | Read own rank / experience / premium; read public `/ranks` `/premium` | Set tier, experience, rank, limits, entitlements |
| Server award paths | Insert ledger + update cache | Trust client amounts/tiers |
| service_role / ops | Manual premium grant | — |
| Future billing webhook | Sync subscription → entitlement | — |

RLS intent: own SELECT on ledger/entitlements; mutate = service_role only (same class as current premium trigger).

---

## 16. UI (FROZEN design)

### Topbar
- Desktop: avatar + ksywka + Rank + Premium (separate)
- Experience: dropdown / profile / `/ranks` (not merged Rank+Premium badge)
- Mobile: avatar → dropdown → Rank → Experience → Premium
- Forbidden: single badge „Pro Silver”

### Dropdown (indicative)
Ksywka · Rank · Experience · Premium · separator · Mój profil · Moja ranga (`/ranks`) · Premium (`/premium`) · Nagrania · Studio · Biblioteka · Ustawienia · Wyloguj (+ existing upload/admin entries)

### `/ranks`
Public informational: Rank, Experience, thresholds, how to earn, anti-abuse, Rank ≠ Premium; logged-in progress panel.

### `/premium`
Public informational: Free/Bronze/Silver/Gold, matrix, Mix/Master/Render/Storage/Recording/Downloads/retention, monthly/yearly offer display, FAQ.  
CTA: **„Wkrótce”** / waitlist only — **no checkout**.

---

## 17. Billing future (FROZEN deferral)

- No payment provider authorized by this document
- Entitlement = effect of grant/subscription — not a user-editable profile string
- `subscriptions` table = DEFERRED
- Existing OPEN **OD-04** (payment operator) remains the billing gate
- Fake checkout = **FORBIDDEN**

---

## 18. Delete account compatibility

ACCOUNT/PROFILE-01 remains **CLOSED**.  
Do **not** change `delete-account.ts` under this Docs Freeze.

Future implementation (separate Implementation GO) must extend `deleteOwnAccount` checklist for:
- experience ledger (+ cache)
- derived rank cache
- `premium_entitlements` (already deleted today)
- future `subscriptions` / billing references (legal retain vs delete — Owner when billing exists)

---

## 19. NON-GOALS (this freeze)

- Implementing Rank / Experience / Premium catalog in code
- Migrating or replacing `account_level`
- Changing OD-REC recording base semantics
- Shipping payments / checkout
- Guaranteeing Gold 90d retention in production before artifact janitor
- Experience from listens/downloads
- Soft account status / XP naming / STEMS
- Reopening ACCOUNT/PROFILE-01
- Closing or rewriting `OPEN_DECISIONS.md` / handoff files via this document alone

---

## 20. Open Owner Decisions

Decisions are **not invented as new OD-IDs** in the central registry by this file. Link to existing registry + residual product locks:

| Topic | Registry / note | Status relative to this freeze |
|-------|-----------------|--------------------------------|
| Payment operator | **OD-04** | **Remains OPEN** |
| Premium prices (commercial final) | **OD-07** | **Remains OPEN** until separate Owner decision / billing GO; §8 = design catalog offer only |
| Premium levels | **OD-08** | Described here as Free/Bronze/Silver/Gold — **candidate to CLOSE** after explicit Owner confirmation (not auto-closed by this file) |
| Account level **display names** (recording enum) | **OD-09** | **Remains OPEN** — does **not** cover Rank PL labels |
| OD-REC-04 hybrid | Recording freeze | **CLOSED** — **no change** |
| Artifact janitor | **OD-SA-05** | **Unchanged** — required before Gold 90d PRODUCTION |
| Recording Premium overlay **numbers** | Not locked in §10 | **OPEN OWNER DECISION** |
| PL Rank labels | §3 localization proposal | Owner confirm / tweak (copy) |

---

## 21. Implementation Gates

Implementation of any Creator Progress + Premium feature requires **all** of:

1. This file present in repo under Owner Docs Freeze GO (satisfied when committed by a later Commit GO)
2. Owner confirmation of residual §20 items in scope for that wave
3. Separate explicit **Owner GO — Implement** (wave-scoped)
4. No production claim of Gold 90d retention without artifact janitor verified
5. No checkout without OD-04 + billing GO
6. `account_level` left unchanged unless a future Owner supersedes this freeze
7. ACCOUNT/PROFILE-01 not reopened; delete steps added only under implement GO

---

## 22. Related SSOT (read-only references)

- `docs/decisions/OPEN_DECISIONS.md` — OD-04, OD-07, OD-08, OD-09
- `docs/phases/PHASE_RECORDING_DESIGN_FREEZE.md` — OD-REC / hybrid D04
- `docs/architecture/E3_FULL_AUDIO_*` — binary premium overlay today
- `docs/audits/STORAGE_ARCH_01_DESIGN_FREEZE.md` — OD-SA-05 artifacts janitor
- `docs/audits/ACCOUNT_PROFILE_01_AUDIT_PLAN_DESIGN_FREEZE.md` — CLOSED
- `docs/architecture/AUTHORIZATION.md` — Role ≠ Account Level; delete contract
- `docs/MASTER_HANDOFF.md` / `docs/PROJECT_STATE.md` — living delivery state (not modified by Docs Freeze file create alone)

---

**END OF DESIGN FREEZE V1**

```
DESIGN FROZEN
IMPLEMENTATION NOT AUTHORIZED
```
