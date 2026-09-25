# BitRymDym

Platforma muzyczna skupiona na rapie, hip-hopie i kulturze tworzenia bitów.

**Kierunek produktu:** od „znalazłem bit” → „nagrałem coś na nim” → „stworzyłem utwór” → „pokazałem go ludziom” → współpraca.

## Status

| Element | Wartość |
|---------|---------|
| SSOT | [v0.1 FOUNDATION DRAFT](./docs/ssot/MASTER_SSOT_v0.1.md) |
| Project State | [docs/PROJECT_STATE.md](./docs/PROJECT_STATE.md) |
| Faza | 1 — Fundament (**Phase 1.4 COMPLETE / LOCKED** @ `6cb1e9a`) |
| Płatności / Premium | wyłączone |
| Application | Auth + Profiles + Roles + Permissions + **Beats Domain Foundation** (metadata) |
| Next | Phase 1.5 Design Freeze — **NOT STARTED** (no Storage / player yet) |

## Nowy agent — start tutaj

1. [docs/PROJECT_STATE.md](./docs/PROJECT_STATE.md)
2. Pełna kolejność: [docs/README.md](./docs/README.md)

## Dokumentacja

- [Master SSOT v0.1](./docs/ssot/MASTER_SSOT_v0.1.md) — prawda produktowa
- [System Architecture](./docs/architecture/SYSTEM_ARCHITECTURE.md) — baseline techniczny (OD-01–03)
- [Authorization](./docs/architecture/AUTHORIZATION.md) — Phase 1.3 AuthZ
- [Beats](./docs/architecture/BEATS.md) — Phase 1.4 beats domain
- [Otwarte decyzje](./docs/decisions/OPEN_DECISIONS.md)
- [Decision Log](./docs/decisions/DECISION_LOG.md)
- [Faza 1](./docs/phases/PHASE_1_FOUNDATION.md)
- [Documentation Continuity](./docs/DOCUMENTATION_CONTINUITY.md)

## Stack (zatwierdzony)

| Warstwa | Decyzja |
|---------|---------|
| Frontend | Next.js · TypeScript · Tailwind · shadcn/ui (baza) · własny Design System · App Router (**OD-01**) |
| Application server | Next.js Server Actions / Route Handlers (**OD-02**) |
| Infrastruktura | Supabase: PostgreSQL, Auth, RLS, Storage (**OD-03**) |

Szczegóły: [SYSTEM_ARCHITECTURE.md](./docs/architecture/SYSTEM_ARCHITECTURE.md) · [APPLICATION_SCAFFOLD.md](./docs/architecture/APPLICATION_SCAFFOLD.md)

## App

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Skopiuj `.env.example` → `.env.local` (placeholdery). Nie commituj sekretów.

**Zaimplementowane (LOCKED):** Auth, Profiles, Roles, Permissions, Account levels, Beats metadata domain.
**Nie zaimplementowane:** Audio Storage, player, downloads, Quick Take, payments, community upload.

## Zasady rozwoju

1. Nie zmieniać założeń produktu poza procesem aktualizacji SSOT.
2. Nie implementować elementów oznaczonych OPEN w OPEN_DECISIONS.
3. Krytyczne reguły (limity, dostęp, role, duration) — zawsze po stronie serwera.
4. Praca małymi, kontrolowanymi etapami z testami **i aktualizacją dokumentacji** (Documentation Continuity).
5. Nie zaczynać implementacji bez PROJECT_STATE + SSOT + architecture + OPEN_DECISIONS.
