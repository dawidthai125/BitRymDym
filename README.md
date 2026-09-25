# BitRymDym

Platforma muzyczna skupiona na rapie, hip-hopie i kulturze tworzenia bitów.

**Kierunek produktu:** od „znalazłem bit” → „nagrałem coś na nim” → „stworzyłem utwór” → „pokazałem go ludziom” → współpraca.

## Status

| Element | Wartość |
|---------|---------|
| SSOT | [v0.1 FOUNDATION DRAFT](./docs/ssot/MASTER_SSOT_v0.1.md) |
| Faza | 1 — Fundament (dokumentacja) |
| Płatności / Premium | wyłączone |

## Dokumentacja

Pełny indeks: [docs/README.md](./docs/README.md)

- [Master SSOT v0.1](./docs/ssot/MASTER_SSOT_v0.1.md) — nadrzędne źródło prawdy
- [Otwarte decyzje](./docs/decisions/OPEN_DECISIONS.md) — elementy wymagające decyzji PO / Architekta
- [Faza 1](./docs/phases/PHASE_1_FOUNDATION.md) — zakres fundamentu

## Zasady rozwoju

1. Nie zmieniać założeń produktu poza procesem aktualizacji SSOT.
2. Nie implementować elementów oznaczonych `DECISION REQUIRED`.
3. Krytyczne reguły (limity, dostęp, role, duration) — zawsze po stronie serwera.
4. Praca małymi, kontrolowanymi etapami z testami.

## Stack

Dokładny stack frontendowy, backendowy oraz szczegółowa architektura Supabase: **DECISION REQUIRED** (OD-01–OD-03). Preferencja robocza Auth: Supabase Auth.
