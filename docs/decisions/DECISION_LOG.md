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
