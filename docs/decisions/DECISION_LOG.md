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
