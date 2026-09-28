# PHASE — RECORDING D02 ANONYMOUS QUICK TAKE — DESIGN FREEZE ADDENDUM

**Status:** **DESIGN FREEZE COMPLETE** · **DELIVERED / PRODUCTION VERIFIED** @ `e98ba52`  
**Date:** 2026-09-28  
**Owner:** Prezes Dawid  
**Type:** Design Freeze Addendum (D02 contract) + post-release status reconciliation  
**Parent freeze:** [PHASE_RECORDING_DESIGN_FREEZE.md](./PHASE_RECORDING_DESIGN_FREEZE.md) (v1.0 LOCKED 2026-09-27)  
**Prerequisite audit:** D02 Anonymous Quick Take Audit (2026-09-28) · READ-ONLY  
**Closeout:** [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)

```text
D02 DECISION              = CLOSED / IN V1
D02 DELIVERY              = SHIPPED
D02 DESIGN FREEZE         = COMPLETE
ARCHITECTURE REVIEW       = PASS WITH CONDITIONS
IMPLEMENTATION            = COMPLETE
OWNER REVIEW              = PASS
COMMIT                    = e98ba52
PUSH                      = COMPLETE
PRODUCTION VERIFY         = GREEN
POST-RELEASE / CLOSEOUT   = COMPLETE
APPLICATION / PRODUCTION  = e98ba52
WAVE 5                    = CLOSED / PRODUCTION VERIFIED @ 37892a6 (unchanged by D02)
```

**Freeze-era snapshot (historical — do not treat as current):** Design Freeze Addendum initially recorded `IMPLEMENTATION GO = NONE` · delivery `NOT SHIPPED` · production baseline `37892a6`. That was correct **before** Owner Implementation GO and commit `e98ba52`.

**This document remains the CURRENT CONTRACT for D02 product rules.**  
Delivery status is **SHIPPED** — see closeout. Historical wave closeouts (W2–W5 “anon OUT”) remain delivery history for those waves and do **not** cancel D02 IN V1.

---

## 1. Purpose

Lock the remaining open/interim product and security decisions required before Architecture Review and Implementation GO for **Anonymous Quick Take (D02)**.

**Freeze-era intent (historical):** This section originally stated the addendum does **not** start implementation / change code / DB / config / UI. That constraint applied to the **Design Freeze gate**. Implementation later proceeded under separate Owner Implementation GO and shipped @ `e98ba52`.

Does **not** (still):

- reopen D02 product decision,
- change Wave 5 Shared Grants,
- expand scope into OUT items (§14).

---

## 2. D02 CURRENT CONTRACT (V1)

```text
PUBLISHED BEAT
    ↓
NAGRAJ (no login)
    ↓
ANONYMOUS QUICK TAKE (MIC TAKE)
    ↓
SHORT-LIVED SIGNED PREVIEW (own take only)
    ↓
CTA: Zaloguj / Załóż konto
    ↓
TTL → EXPIRED → JANITOR CLEANUP
```

| Rule | Frozen value |
|------|----------------|
| Product | Anonymous QT **IN V1** |
| Beat eligibility | **PUBLISHED** only (+ READY master audio — same gate as authenticated RECORD) |
| Max duration | **30 s** (server authority; client timer = UX only) |
| TTL | **`ANON_TAKE_TTL_SECONDS = 7200` (2 h)** server-side |
| Active READY | **1** |
| Sessions / UTC day | **3** |
| Concurrent PENDING | **1** |
| Identity | **Dedicated** Anonymous Take token (≠ `brd_dl_aid`) |
| Raw token in DB | **FORBIDDEN** (hash only → `takes.anonymous_token_hash`) |
| Own preview | **YES** — short-lived signed GET after AuthZ |
| Durable download | **NO** (D08) |
| Anon → account claim | **NO** in V1 |
| Dual-play | **OUT** |
| Shared Grants required | **NO** |
| MIX / EXPORT / Track / Payments / Social | **OUT** |

---

## 3. Conflict reconciliation (history vs current contract)

| Source | Historical note | Current contract |
|--------|-----------------|------------------|
| Freeze v1.0 §19 W3 | Listed Anonymous + BEGINNER E2E in W3 | W3–W5 **delivered** auth-only; D02 delivery deferred until this addendum + Arch Review + Implementation GO |
| OD-W3 | Anon OUT · dual-play OUT | Dual-play remains **OUT** for D02 V1; Anon delivery now scheduled under this addendum |
| W4/W5 closeouts | Anon QT OUT of those waves | Correct for those waves; does not cancel D02 IN V1 |
| Freeze §15 dual-play mobile | Mentions dual-play testing | **OUT** for D02 V1 — do not implement dual-play |

**Agents must follow this Addendum for D02 CURRENT CONTRACT.** Do not “fix” historical closeout docs by rewriting them.

---

## 4. Anonymous identity

### 4.1 Dedicated take identity

```text
opaque high-entropy random token
        ↓
httpOnly + Secure (production) cookie (dedicated name; ≠ brd_dl_aid)
        ↓
server-side hash (SHA-256 family; same pattern as download hashing)
        ↓
takes.anonymous_token_hash
        ↓
ownership
```

| Rule | Frozen |
|------|--------|
| Cookie product | Anonymous Take **only** |
| Reuse `brd_dl_aid` | **FORBIDDEN** |
| Raw token in DB / logs / URLs | **FORBIDDEN** |
| Public identifier | Token must **not** be used as a durable public id |
| Cookie name spelling | Implementation detail (Architecture may choose); must not collide with download cookie |

### 4.2 Token lifecycle

| Stage | Requirement |
|-------|-------------|
| CREATE | Server generates opaque token |
| STORE | DB stores **hash only** |
| VERIFY | Every anon take operation: presented token → hash → must match row `anonymous_token_hash` |
| BINDING | Token ownership is per take row; **token A → take B = DENY** |
| REPLAY | Must not bypass take lifecycle; finalize bound to session + take + anonymous identity |
| EXPIRY | After take `expires_at`, token **cannot** restore access |
| ROTATION | No extra rotation mechanism required beyond lifecycle unless Architecture proves need |

---

## 5. Authorization chain

```text
REQUEST
  → ANONYMOUS IDENTITY (dedicated cookie → hash)
  → SERVER AUTHZ
  → ANONYMOUS ENTITLEMENT / CAPS
  → PUBLISHED BEAT + READY master
  → RECORD ACCESS
  → SESSION (PENDING_UPLOAD)
  → SIGNED UPLOAD
  → FINALIZE
  → OWN ANONYMOUS TAKE (READY)
  → SHORT-LIVED SIGNED PREVIEW (optional UX)
```

**Server is source of truth.** Client must never supply authoritative owner, entitlement, max seconds, or object key.

Anonymous **MUST NOT**:

- read foreign takes,
- access foreign `takeId`,
- spoof / change `beatId` or owner,
- set own entitlement,
- exceed 30 s,
- bypass TTL,
- exceed active / daily / concurrent caps.

### 5.1 RLS preference

Prefer:

```text
Client → Server AuthZ → service_role controlled ops → DB
```

Do **not** open broad anon `SELECT` on `takes` in Design Freeze.  
Any RLS policy for anon is an **Architecture Review** item if required.

---

## 6. Entitlement / anti-abuse (frozen)

```text
MAX RECORDING            = 30s
MAX ACTIVE READY         = 1
MAX SESSIONS / UTC DAY   = 3
CONCURRENT RECORDING     = 1
```

All enforced **server-side**.

**OUT of this freeze (do not invent):**

- IP binding,
- device fingerprinting,
- extra cooldown beyond the caps above.

---

## 7. TTL / expiry / janitor

| Rule | Frozen |
|------|--------|
| TTL | **7200 s (2 h)** |
| Set `expires_at` | At session/create using frozen TTL |
| After `expires_at` | AuthZ DENY · finalize DENY · preview DENY |
| Janitor | Existing take janitor lifecycle; removes expired object/row |
| AuthZ vs janitor | AuthZ expiry **independent** of whether cleanup already ran |
| Config code change | **Not in this freeze** — Application already has interim `ANON_TAKE_TTL_SECONDS = 7200`; Implementation wires usage |

---

## 8. Storage

| Rule | Frozen |
|------|--------|
| Bucket | Private `take-audio` |
| Object key | `anon/{tokenHashPrefix}/takes/{takeId}/mic.bin` |
| Permanent public URL | **FORBIDDEN** |
| Upload | Server-authorized signed PUT |
| Preview | Short-lived signed GET after AuthZ |
| Helper | Reuse `buildAnonTakeObjectKey` (exists; currently unused by transport) |

---

## 9. Preview / download

| Capability | Frozen |
|------------|--------|
| Own take preview | **YES** — short-lived signed GET · READY · not expired · token owns take |
| Durable download | **NO** (D08) |
| Public/permanent audio endpoint | **FORBIDDEN** |
| Preview ≠ download | Confirmed |

---

## 10. Anonymous → account (V1)

```text
ANON → ACCOUNT CLAIM / MIGRATION = NO (V1)
```

- Login / signup **does not** transfer take to `owner_id`
- No claim-on-login, token migration, or retention upgrade on auth
- After record: show **Zaloguj / Załóż konto** CTA
- Take remains reachable **only** via anonymous identity until expiry

---

## 11. UI / UX (product)

| Item | Frozen |
|------|--------|
| Entry | Beat detail → **Nagraj** |
| Unauthenticated | Allow Anonymous QT (remove “tylko zalogowany” blocker for D02 path) |
| After READY | Odsłuchaj (preview) + CTA Zaloguj / Załóż konto |
| Dual-play | **OUT** |
| Mobile | Mic permission · record · stop · finalize · preview · CTA in Acceptance Gate |

---

## 12. Acceptance gates (frozen)

| ID | Gate |
|----|------|
| A | Anon RECORD on PUBLISHED without Supabase login |
| B | Server enforces ≤ 30 s |
| C | Token A cannot access Take B |
| D | Caps: 1 READY · 3 sessions/UTC day · concurrent 1 |
| E | After expiry: preview / finalize / access DENY |
| F | Janitor cleans expired anon take + object |
| G | Own READY take preview via short-lived signed URL |
| H | Durable anon take download = DENY / NOT AVAILABLE |
| I | Post-record CTA Zaloguj / Załóż konto |
| J | Login/signup does **not** claim existing anon take |
| K | Cross-token / cross-take / cross-user IDOR = DENY |
| L | No permanent audio URL |
| M | Basic anonymous recording flow works on mobile |

---

## 13. Security requirements (frozen)

Threats that Implementation + Architecture **must** mitigate:

- token theft · replay · guessing
- token A → take B
- cross-user take access · cross-beat spoof
- finalize replay · expiry bypass
- upload / storage abuse · orphan objects
- permanent URL leakage
- client entitlement / duration spoofing

Minimum model:

```text
TOKEN → HASH → TAKE BINDING → SERVER AUTHZ → STATUS → EXPIRY → SIGNED STORAGE
```

---

## 14. OUT OF SCOPE

D02 delivery **excludes**:

- MIX · EXPORT · Track · Track Publishing  
- Premium · Payments  
- Shared Grant PLAYBACK · Shared Grant DOWNLOAD  
- Messaging · Voting · Comments  
- Wave 5 behavioral changes  
- HIBP · migration drift · hydration warning  
- Dual-play  
- Anon→account claim (V1)  
- IP/device fingerprinting / extra cooldown  

---

## 15. Implementation truth — documented GAPS (do not fix here)

| Area | Current code truth | Gap vs this freeze |
|------|--------------------|--------------------|
| AuthZ RECORD | Requires authenticated user | Need anon identity path |
| Session RPC | `claim_take_recording_session` owner_id only · always `anonymous_token_hash = NULL` | Need anon claim path + hash |
| Concurrent PENDING | Unique index on `owner_id` only | Need anon concurrent uniqueness |
| Object key | Transport uses `user/...` only | Must use `buildAnonTakeObjectKey` |
| Entitlement | AccountLevel only | Wire ANONYMOUS 30s + caps + TTL |
| UI | “tylko zalogowany” / AUTH_REQUIRED | Allow anon Nagraj |
| Preview/download | Owner `userId` only | Anon preview YES · download still NO |
| Take token | Only beat-download `brd_dl_aid` exists | Dedicated take cookie required |
| Anon→account | None | Correct for V1 (NO claim) |
| Dual-play | OUT in OD-W3 | Remains OUT |

---

## 16. Architecture Review — open questions / risks

For the next Owner gate (**Architecture Review**), resolve without product-scope creep:

1. Anonymous token cookie issuance / rotation edge cases (first visit, multi-tab)
2. Session claim design: extend RPC vs new anon RPC; advisory lock key for anon hash
3. Concurrent anonymous PENDING uniqueness (partial unique index on `anonymous_token_hash`)
4. Confirm service_role-only mutation + no broad anon RLS SELECT
5. Signed preview TTL numeric (may reuse `TAKE_AUDIO_PREVIEW_TTL_SECONDS` or Architecture pick)
6. Ensure `expires_at = now + 7200` on create for anon
7. Janitor interaction with short TTL vs Hobby daily cron lag (AuthZ must still DENY)
8. Finalize replay / idempotent READY handling for anon
9. Mobile MediaRecorder + mic permission failure UX
10. Server enforcement of daily/active/concurrent caps for anon hash (mirror claim RPC)

**Not Architecture scope:** changing TTL, allowing download, enabling claim-on-login, dual-play, MIX/EXPORT.

---

## 17. Next gates

```text
# Historical gate order (completed)
D02 DESIGN FREEZE ADDENDUM = COMPLETE
→ ARCHITECTURE REVIEW = PASS WITH CONDITIONS
→ IMPLEMENTATION GO → IMPLEMENTATION COMPLETE
→ OWNER REVIEW = PASS → COMMIT/PUSH e98ba52
→ PRODUCTION VERIFY = GREEN → POST-RELEASE CLOSEOUT = COMPLETE
```

No further D02 product gates. Out-of-scope items (§14) remain OUT until separate Owner GO.

---

## 18. Post-release status reconciliation (2026-09-28)

| Gate | Result |
|------|--------|
| Design Freeze | COMPLETE |
| Architecture Review | PASS WITH CONDITIONS |
| Implementation | COMPLETE @ `e98ba52` |
| Owner Review / Pre-Commit | PASS |
| Commit / Push | `e98ba52` · `feat: add d02 anonymous quick take` |
| Production Verify | GREEN |
| Post-Release Closeout | COMPLETE |

**Production Verify findings (do not rewrite NOT EXECUTED → PASS):** see [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md).

**POST-RELEASE FINDING:** Anonymous verification artifacts are TTL-bound and are not manually deleted (MEDIUM=1). No delete feature added in closeout.

---

## Related documents

| Doc | Role |
|-----|------|
| [PHASE_RECORDING_DESIGN_FREEZE.md](./PHASE_RECORDING_DESIGN_FREEZE.md) | Parent freeze v1.0 |
| [RECORDING.md](../architecture/RECORDING.md) | Architecture index |
| [AUTHORIZATION.md](../architecture/AUTHORIZATION.md) | AuthZ chain |
| [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md) | Wave 5 closed; grants OUT of D02 |
| [RECORDING_D02_PRODUCTION_CLOSEOUT.md](../audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md) | D02 production verify + closeout |
| D02 Audit (session 2026-09-28) | Pre-impl truth baseline |

---

```text
D02_DESIGN_FREEZE_ADDENDUM = COMPLETE
D02_DELIVERY               = SHIPPED / PRODUCTION VERIFIED @ e98ba52
POST_RELEASE               = COMPLETE
```
