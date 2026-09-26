# Decision Log

Rejestr zatwierdzonych decyzji architektonicznych i produktowych.

**Hierarchia prawdy:** SSOT → dokumentacja architektury → zatwierdzona specyfikacja → kod (§43).

Otwarte pozycje: [OPEN_DECISIONS.md](./OPEN_DECISIONS.md).

---

## Wpisy

### OD-01 — Frontend stack

| Pole | Wartość |
|------|---------|
| Decision ID | OD-01 |
| Title | Frontend stack |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) + Chief Product / Technical Architect |

**Decision**

BitRymDym frontend:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui jako baza komponentów
- własny BitRymDym Design System
- Next.js App Router

**Scope**

Warstwa UI / frontend aplikacji. Nie obejmuje identyfikacji wizualnej produktu (OD-15).

**Rationale**

Zatwierdzony kierunek architektoniczny Ownera: nowoczesny App Router, TypeScript, Tailwind oraz shadcn/ui wyłącznie jako baza techniczna komponentów — nie jako wygląd marki.

**Consequences**

- Scaffold aplikacji (etap 1.2+) opiera się o ten stack.
- shadcn/ui nie zastępuje BitRymDym Design System.
- Custom Audio Player i komponenty brandowe pozostają autorskie.
- Produkt nie może wyglądać jak generyczny „AI SaaS dashboard”.

**Related documentation**

- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §2, §10, §41
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md) (OD-15 nadal OPEN)

---

### OD-02 — Application server / backend application layer

| Pole | Wartość |
|------|---------|
| Decision ID | OD-02 |
| Title | Application server (Next.js server layer) |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) + Chief Product / Technical Architect |

**Decision**

Na początku projektu **nie** tworzymy osobnego Express / NestJS / Fastify ani innego niezależnego backendu.

Next.js pełni rolę głównej warstwy aplikacyjnej / server layer poprzez:

- Server Actions,
- Route Handlers / API handlers,
- server-side business logic.

**Scope**

Granica aplikacji: request → auth → authorization → permission → business rule → database/storage → response.

**Rationale**

Zatwierdzony kierunek: jedna warstwa Next.js dla UI i logiki serwerowej na start; krytyczna logika biznesowa nie może opierać się wyłącznie na frontendzie.

**Consequences**

- Frontend prosi; server decyduje.
- Brak osobnego serwera Node jako wymogu Fazy 1.
- Authorization i business rules żyją po stronie serwera Next.js (wspólnie z RLS w Supabase — OD-03).

**Related documentation**

- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §39

---

### OD-03 — Backend infrastructure (Supabase)

| Pole | Wartość |
|------|---------|
| Decision ID | OD-03 |
| Title | Backend infrastructure — Supabase |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) + Chief Product / Technical Architect |

**Decision**

Supabase jest zatwierdzoną warstwą infrastruktury backendowej:

- PostgreSQL
- Supabase Auth
- Row Level Security (RLS)
- Supabase Storage
- Edge Functions — tylko tam, gdzie będą potrzebne

Model tożsamości:

```text
Supabase Auth → Profile → Role → Permissions → Account Level
```

**Role ≠ Account Level**

Role: `ADMIN` | `MODERATOR` | `USER`
Account Level (robocze, OD-09 OPEN): `BEGINNER_RAPPER` | `PRO_RAPPER` | `LEGEND_RAPPER`

**Scope**

Dane, authentication, enforcement na poziomie danych (RLS), storage, wybrane funkcje backendowe.

**Rationale**

Zatwierdzony kierunek Ownera: Supabase jako infrastruktura; Next.js jako application server (OD-02). Preferencja Auth z SSOT §5 zostaje potwierdzona jako decyzja.

**Consequences**

- Schemat DB, Auth, Storage i RLS projektowane pod Supabase.
- Szczegóły codec/watermark/pipeline audio pozostają OPEN (OD-12–OD-14).
- Nazwy account levels mogą zostać zmienione przez OD-09 bez zmiany modelu Role ≠ Account Level.

**Related documentation**

- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §4, §5, §9, §36
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

### OD-19 — Default account level on signup

| Pole | Wartość |
|------|---------|
| Decision ID | OD-19 |
| Title | Default account level on signup |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

New users receive `BEGINNER_RAPPER` as default account level.

Role remains `USER`.

```text
SIGNUP → role = USER + account_level = BEGINNER_RAPPER
```

This is **not** a Premium mechanism and does not grant paid features.

**ROLE ≠ ACCOUNT LEVEL** remains in force.

**Scope**

Profile creation defaults (DB column default + Auth signup trigger).

**Rationale**

Owner-approved signup default after Phase 1.3 security audit; matches existing implementation.

**Consequences**

- `BEGINNER_RAPPER` is the **approved default**, not provisional.
- Final display names of account levels may still change via OD-09 without changing this default enum value unless Owner revisits.

**Related documentation**

- [AUTHORIZATION.md](../architecture/AUTHORIZATION.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §4

---

### OD-20 — First ADMIN bootstrap

| Pole | Wartość |
|------|---------|
| Decision ID | OD-20 |
| Title | First ADMIN bootstrap |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

No automatic first-admin mechanism exists in application signup flow.

First ADMIN is provisioned manually through a controlled operator/admin mechanism outside normal user signup.

Forbidden:

- first-user becomes ADMIN
- signup admin
- email-based hidden admin
- public admin bootstrap endpoint
- client-side admin escalation
- magic admin token

**MANUAL / OPERATOR-CONTROLLED ADMIN BOOTSTRAP**

Operator sets `profiles.role = 'ADMIN'` for an existing Auth user via Supabase Dashboard SQL / service-role tooling — never via normal USER signup UI.

Do not store secrets in documentation.

**Scope**

Production admin provisioning security model.

**Rationale**

Prevents privilege escalation and accidental admin grant on first registration.

**Consequences**

- App signup always creates `USER`.
- No Phase 1.3 bootstrap endpoint.
- Production requires operator-controlled ADMIN assignment before admin features are usable.

**Related documentation**

- [AUTHORIZATION.md](../architecture/AUTHORIZATION.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §3, §36

---

### Phase 1.4 — Beats Domain Foundation (formal closeout)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.4 Beats Domain Foundation — COMPLETE / LOCKED |
| Status | CLOSED / LOCKED (implementation + docs continuity) |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) — accepted Design Freeze + commit/push |
| Canonical commit | `6cb1e9a` — `feat(beats): complete phase 1.4 beats domain foundation` |
| Branch | `main` / `origin/main` |

**Frozen scope (metadata only)**

- `public.beats` + `beat_status` + `beat_ownership_type`
- Canonical metadata fields; BPM numeric; duration ≤ 180 s
- Ownership: `PLATFORM` ⇒ `owner_id` NULL; `USER` ⇒ `owner_id` = `profiles.id`
- Active ADMIN status lifecycle: DRAFT → PUBLISHED → ARCHIVED → DRAFT; **PUBLISHED → DRAFT forbidden**
- AuthZ via existing `beats.create|edit|delete|approve|reject` (no new permission keys)
- RLS: public `PUBLISHED` read; ADMIN write; MODERATOR review visibility/path
- Central server validation + status transitions; Role ≠ AccountLevel

**Explicitly out of Phase 1.4**

- Audio Storage / buckets
- Audio columns / upload / codecs (OD-12 remains OPEN)
- Player, downloads, Quick Take, payments, community upload

**Related documentation**

- [BEATS.md](../architecture/BEATS.md)
- [PROJECT_STATE.md](../PROJECT_STATE.md)
- [PHASE_1_FOUNDATION.md](../phases/PHASE_1_FOUNDATION.md)
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md) — OD-04…OD-18 still OPEN

---

### Phase 1.5 — Private Audio Storage + Access Gate (implementation closeout note)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.5 Private Audio Storage + Controlled Access Gate |
| Status | COMPLETE / CLOSED / LOCKED |
| Date | 2026-09-26 |
| Design Freeze | `0e5c491` — APPROVED / LOCKED |
| Implementation commit | `0ec0be0` — `feat(audio): complete phase 1.5 private storage and access gate` |
| Baseline before impl | `origin/main` @ `0e5c491` |

**Frozen scope delivered:**

- Private bucket `beat-audio`
- `beat_audio_assets` separate from `beats` metadata
- Opaque `.bin` object keys; MIME authoritative; OD-12 remains OPEN
- Access Gate anonymous / authenticated / admin upload paths
- Signed URL PLAYBACK 120s / DOWNLOAD 300s
- ADMIN PLATFORM upload only

**Still out of scope:** download limits, Quick Take, community upload, watermark, payments.

---

### Phase 1.6 — Published Beats Surface + Playback Shell (closeout)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.6 Published Beats Surface + Playback Shell |
| Status | **COMPLETE / CLOSED / LOCKED** |
| Date | 2026-09-26 |
| Design Freeze | [PHASE_1_6_DESIGN_FREEZE.md](../phases/PHASE_1_6_DESIGN_FREEZE.md) — APPROVED / LOCKED |
| Implementation commit | `39be430` — `feat(beats): complete phase 1.6 playback surface` |
| Baseline before impl | `origin/main` @ `7de20a3` |
| Production | **GREEN / VERIFIED** |

**Frozen scope delivered:**

- `/beats` PUBLISHED-only catalog; `/beat/[id]` PUBLISHED-only detail
- Custom Playback Shell (no native audio controls UI)
- PLAYBACK via existing Access Gate only

**Still out of scope / remaining state:** DOWNLOAD UI / limits / counters / audit (**PARTIAL** backend signed DOWNLOAD only); Quick Take **NOT STARTED**; waveform; Admin CMS; payments.
**OD-04 … OD-18 remain OPEN.**

---

### Phase 1.7 — Admin PLATFORM Content Ops Surface (closeout)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.7 Admin PLATFORM Content Ops Surface |
| Status | **COMPLETE / CLOSED / LOCKED** |
| Date | 2026-09-26 |
| Design Freeze | [PHASE_1_7_DESIGN_FREEZE.md](../phases/PHASE_1_7_DESIGN_FREEZE.md) — APPROVED / LOCKED |
| Implementation commit | `ed499ee` — `feat(admin): complete phase 1.7 platform content ops` |
| Baseline before impl | `origin/main` @ `d5b4e91` |
| Production | **GREEN / VERIFIED** |

**Frozen scope delivered:**

- `/admin/beats*` ADMIN-only ops surface
- PLATFORM create/edit + MASTER upload via existing services
- UI Publish gate requires READY MASTER; server hard READY rule remains GAP-PUBLISH-READY
- Audit infrastructure GAP preserved

**Production verification:** public/auth/routing/security/regression **PASS**.
**Live Admin E2E:** NOT VERIFIED — OD-20 / `admin_count=0` (non-blocking).
**Published Content E2E:** NOT VERIFIED — `published_count=0` (non-blocking).

**OD-04, OD-07…OD-16, OD-18 remain OPEN.** OD-20 CLOSED (operator ADMIN).
**Post–1.7 note:** OD-05 / OD-06 / OD-17 CLOSED 2026-09-26 as Phase 1.8A interim (see below).

---

### OD-05 — Anonymous download limit (Phase 1.8A interim)

| Pole | Wartość |
|------|---------|
| Decision ID | OD-05 |
| Title | Limit pobrań — użytkownik anonimowy |
| Status | CLOSED / ACCEPTED (Phase 1.8A interim model) |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |

**Decision**

```text
anonymous_daily_download_limit = 2
window = UTC calendar day
identity = httpOnly opaque anonymous token
server stores only token hash
scope = global (all beats)
```

Config SSOT: `src/config/downloads.ts` (no magic numbers).
Known limitation: clearing cookies / private mode resets the soft identity.

**Scope**

Phase 1.8A Download Productization only. Does not close Premium / payment limits.

**Related documentation**

- [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §13
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

### OD-06 — Authenticated user download limit (Phase 1.8A interim)

| Pole | Wartość |
|------|---------|
| Decision ID | OD-06 |
| Title | Limit pobrań — użytkownik zalogowany |
| Status | CLOSED / ACCEPTED (Phase 1.8A interim model) |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |

**Decision**

```text
user_daily_download_limit = 4
window = UTC calendar day
identity = authenticated user_id
scope = global per user
```

AccountLevel unused for download limits in Phase 1.8A.
Config SSOT: `src/config/downloads.ts`.

**Scope**

Phase 1.8A Download Productization. Premium boost / per-beat purchase OUT.

**Related documentation**

- [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §13
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

### OD-17 — Repeat download counting (Phase 1.8A interim)

| Pole | Wartość |
|------|---------|
| Decision ID | OD-17 |
| Title | Zasady liczenia powtórnych pobrań |
| Status | CLOSED / ACCEPTED (Phase 1.8A interim model) |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |

**Decision**

```text
DOWNLOAD_EVENT = successful DOWNLOAD signed-URL issuance
after:
  AUTH / IDENTITY
  → SERVER AUTHORIZATION
  → READY asset
  → RESERVATION (ephemeral; NOT an event)
  → SIGNED DOWNLOAD URL SUCCESS
  → FINALIZE
  → EVENT (beat_download_events)
```

Each successful DOWNLOAD URL issuance counts **1** toward the daily limit.
File-transfer success is not required / not reliably observable.
Persistence: `beat_download_events` only after finalize (reservation TTL default 120s).
Reservation is never a DOWNLOAD_EVENT; expired reservations are not counted.

**Scope**

Phase 1.8A Download Productization counting + limits + Moje pobrane derivation.

**Related documentation**

- [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §17
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

### Phase 1.8A — Download Productization (Design Freeze lock)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.8A Download Productization — Design Freeze |
| Status | **APPROVED / LOCKED** — READY FOR IMPLEMENTATION |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) |
| Implementation | **NOT STARTED** (awaiting Owner Implementation GO) |

**Frozen:**

- Access Gate DOWNLOAD **REUSE** (TTL 300s); no duplicate AuthZ engine
- OD-05 / OD-06 / OD-17 interim rules CLOSED (above)
- Moje pobrane = **IN** (minimal authenticated)
- `beat_download_events` required
- Config = `src/config/downloads.ts`
- OD-13 watermark **OUT**; OD-04 payments **OUT**
- Quick Take / Tracks / Community **OUT**

**Not applied at freeze:** code, migrations, commit, push.

---

### Phase 1.8A — Download Productization (implementation note)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.8A Download Productization — Implementation |
| Status | **IMPLEMENTATION COMPLETE** (not CLOSED) |
| Date | 2026-09-26 |
| Decydent | Owner Implementation GO |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) |
| Migrations | `phase_1_8a_download_events`, `phase_1_8a_claim_rpc_grants`, `phase_1_8a_download_reservation` |
| Commit | **uncommitted** |

**Delivered:** Access Gate REUSE; limits 2/4 UTC; reservation → signed URL → finalize; `beat_download_events`; Moje pobrane; Download CTA; config SSOT.

**Concurrency:** `reserve_beat_download_slot` uses `pg_advisory_xact_lock`; provisional **reservation** (not event) until signed URL succeeds, then `finalize_beat_download` inserts final OD-17 event. URL failure → `release_beat_download_reservation` (no event). Expired reservations free the slot (TTL 120s).

---

### Phase 1.8A — Implementation Audit PASS + Documentation Closeout

| Pole | Wartość |
|------|---------|
| Title | Phase 1.8A Download Productization — Implementation Audit PASS |
| Status | **IMPLEMENTATION AUDIT PASS** · **DOCUMENTATION CLOSEOUT COMPLETE** · **READY FOR OWNER REVIEW** (not CLOSED) |
| Date | 2026-09-26 |
| Decydent | Owner Implementation Audit GO → Documentation Closeout GO |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |

**Audit results:**

| Area | Result |
|------|--------|
| OD-17 | PASS |
| Reservation model | PASS |
| Crash safety | PASS |
| Concurrency | PASS |
| Table grants | PASS |
| RLS | PASS |
| Security | PASS |
| Tests | **84/84** |
| Lint / typecheck / build | PASS |
| Live DB | PASS |
| Scope | PASS |

**Known non-blocking gaps (retained):**

- No live RLS/concurrency integration tests (unit/source-contract coverage)
- Live product E2E **NOT VERIFIED** (`published_count=0`, `admin_count=0` / OD-20)
- Phase **not CLOSED** until Owner Review → commit → push → production verify

**Next:** OWNER REVIEW → COMMIT → PUSH → PRODUCTION VERIFY
