# BitRymDym

Platforma muzyczna skupiona na rapie, hip-hopie i kulturze tworzenia bitów.

**Kierunek produktu:** od „znalazłem bit” → „nagrałem coś na nim” → „stworzyłem utwór” → „pokazałem go ludziom” → współpraca.

## Status

| Element | Wartość |
|---------|---------|
| Cold start | [docs/FINAL_COLD_START_HANDOFF.md](./docs/FINAL_COLD_START_HANDOFF.md) |
| Master Handoff | [docs/MASTER_HANDOFF.md](./docs/MASTER_HANDOFF.md) |
| Project State | [docs/PROJECT_STATE.md](./docs/PROJECT_STATE.md) |
| SSOT | [v0.1 FOUNDATION DRAFT](./docs/ssot/MASTER_SSOT_v0.1.md) |
| **Production application** | `1c63080` · https://www.bitrymdym.pl · **READY** |
| **Git tip (origin/main)** | `1c63080` (docs continuity may advance after this tip) |
| POLISH-01 / P0 / P1 / P2 | **CLOSED / PRODUCTION VERIFIED** |
| Recording Waves 1–5 | **CLOSED** / **PRODUCTION VERIFIED** |
| Community Upload | **CLOSED / LOCKED** @ `c5e1f17` |
| Płatności / Premium catalog | wyłączone / NOT IMPLEMENTED |
| Next | **P3 — Anonymous → Account Claim (READ-ONLY AUDIT)** — see FINAL_COLD_START |

## Nowy agent — start tutaj

1. [docs/FINAL_COLD_START_HANDOFF.md](./docs/FINAL_COLD_START_HANDOFF.md)
2. [docs/MASTER_HANDOFF.md](./docs/MASTER_HANDOFF.md)
3. [docs/PROJECT_STATE.md](./docs/PROJECT_STATE.md)
4. Pełna kolejność: [docs/README.md](./docs/README.md)

## Dokumentacja

- [Master Handoff](./docs/MASTER_HANDOFF.md) — cold-start continuity
- [Master SSOT v0.1](./docs/ssot/MASTER_SSOT_v0.1.md) — prawda produktowa
- [System Architecture](./docs/architecture/SYSTEM_ARCHITECTURE.md) — baseline techniczny
- [Recording](./docs/architecture/RECORDING.md) — Waves 1–4 CLOSED
- [Otwarte decyzje](./docs/decisions/OPEN_DECISIONS.md)
- [Decision Log](./docs/decisions/DECISION_LOG.md)
- [Documentation Continuity](./docs/DOCUMENTATION_CONTINUITY.md)

## Stack (zatwierdzony)

| Warstwa | Decyzja |
|---------|---------|
| Frontend | Next.js · TypeScript · Tailwind · shadcn/ui (baza) · App Router (**OD-01**) |
| Application server | Next.js Server Actions / Route Handlers (**OD-02**) |
| Infrastruktura | Supabase: PostgreSQL, Auth, RLS, Storage (**OD-03**) |

## App

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run build
```

Skopiuj `.env.example` → `.env.local`. Nie commituj sekretów. Nie commituj `.agents/` / `.cursor/` / `skills-lock.json`.

**Zaimplementowane (prod):** Auth · Profiles · Roles · Permissions · Account levels · Platform + community beats · private `beat-audio` · Access Gate · PlaybackShell · Downloads · BPM V1 · signed beat audio transport · Recording Waves 1–4 (takes, entitlement, retention, janitor, Moje próbki).

**NOT IMPLEMENTED:** Anonymous QT · shared grants · MIX/EXPORT · track publish from recording · payments/Premium catalog · messaging · voting · comments product.

## Zasady rozwoju

1. Nie zmieniać założeń produktu poza procesem aktualizacji SSOT.
2. Nie implementować elementów OPEN w OPEN_DECISIONS bez Owner GO.
3. Krytyczne reguły — zawsze po stronie serwera.
4. Małe etapy + testy + Documentation Continuity.
5. Start: MASTER_HANDOFF → PROJECT_STATE → SSOT → architecture → OPEN_DECISIONS.
6. Next = **OWNER DIRECTION / COLD START AUDIT**, nie auto-epic (Wave 5 = no automatic GO).
7. Documentation ≠ proof of shipped implementation; code/schema = evidence.
