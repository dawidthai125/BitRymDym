# BitRymDym

Platforma muzyczna skupiona na rapie, hip-hopie i kulturze tworzenia bitów.

**Kierunek produktu:** od „znalazłem bit” → „nagrałem coś na nim” → „stworzyłem utwór” → „pokazałem go ludziom” → współpraca.

## Status

| Element | Wartość |
|---------|---------|
| SSOT | [v0.1 FOUNDATION DRAFT](./docs/ssot/MASTER_SSOT_v0.1.md) |
| Project State | [docs/PROJECT_STATE.md](./docs/PROJECT_STATE.md) |
| Faza | 1 — Fundament (**Phase 1.9 CLOSED / LOCKED**) |
| Canonical tip | `73e213c` — Audio Transport V1 · production **VERIFIED GREEN** |
| Płatności / Premium | wyłączone |
| Application | Auth · Profiles · Roles · Permissions · Beats · private `beat-audio` · Access Gate · custom Playback · Downloads (1.8A) · Admin PLATFORM · BPM V1 · signed audio transport |
| Next | Owner-selected next epic (community / Quick Take / ops) — see PROJECT_STATE |

## Nowy agent — start tutaj

1. [docs/PROJECT_STATE.md](./docs/PROJECT_STATE.md)
2. Pełna kolejność: [docs/README.md](./docs/README.md)

## Dokumentacja

- [Master SSOT v0.1](./docs/ssot/MASTER_SSOT_v0.1.md) — prawda produktowa
- [System Architecture](./docs/architecture/SYSTEM_ARCHITECTURE.md) — baseline techniczny (OD-01–03)
- [Authorization](./docs/architecture/AUTHORIZATION.md) — Phase 1.3 AuthZ
- [Beats](./docs/architecture/BEATS.md) — Phase 1.4 beats domain
- [Audio Transport](./docs/architecture/AUDIO_TRANSPORT.md) — signed upload V1
- [BPM Auto Detection](./docs/architecture/BPM_AUTO_DETECTION.md) — Production V1
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

**Zaimplementowane:** Auth, Profiles, Roles, Permissions, Account levels, Beats (PLATFORM admin), private `beat-audio` + Access Gate, custom Playback Shell, Downloads (limits + My Downloads), BPM V1, signed Audio Transport V1.
**Nie zaimplementowane:** Quick Take, community upload, Tracks, payments, messaging, voting, comments.

## Zasady rozwoju

1. Nie zmieniać założeń produktu poza procesem aktualizacji SSOT.
2. Nie implementować elementów oznaczonych OPEN w OPEN_DECISIONS.
3. Krytyczne reguły (limity, dostęp, role, duration) — zawsze po stronie serwera.
4. Praca małymi, kontrolowanymi etapami z testami **i aktualizacją dokumentacji** (Documentation Continuity).
5. Nie zaczynać implementacji bez PROJECT_STATE + SSOT + architecture + OPEN_DECISIONS.
