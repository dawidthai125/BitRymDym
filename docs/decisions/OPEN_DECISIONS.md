# Otwarte decyzje (DECISION REQUIRED)

**Źródło:** [MASTER SSOT v0.1](../ssot/MASTER_SSOT_v0.1.md) §44  
**Zasada:** Cursor Agent NIE może samodzielnie wymyślać ani zamrażać elementów oznaczonych jako OPEN.  
**Zamknięte decyzje:** pełne wpisy w [DECISION_LOG.md](./DECISION_LOG.md).

---

## Jak korzystać z tego rejestru

1. Pozycja OPEN pozostaje otwarta, dopóki Owner / Architect nie zatwierdzi decyzji.
2. Po decyzji: wpis w `DECISION_LOG.md`, status CLOSED w tym pliku (historia ID zachowana), aktualizacja SSOT / architektury jeśli wymagane.
3. Implementacja funkcji zależnych od decyzji OPEN jest zablokowana.
4. **Nie renumerować** ID. Nie usuwać historii CLOSED.

---

## Lista decyzji — status

| ID | Temat | Kontekst SSOT | Blokuje | Status |
|----|--------|---------------|---------|--------|
| OD-01 | Dokładny stack frontendowy | §44 | scaffold aplikacji, player UI | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-02 | Dokładny stack backendowy (application server) | §44 | API, walidacja serwerowa | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-03 | Architektura infrastruktury Supabase | §5, §9, §44 | Auth, Storage, schemat DB | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-04 | Operator płatności | §15, §44 | Faza 4 — Payments | OPEN |
| OD-05 | Limit pobrań — użytkownik anonimowy | §13 | Download limits | **CLOSED / ACCEPTED** — 2026-09-26 (Phase 1.8A interim) |
| OD-06 | Limit pobrań — użytkownik zalogowany | §13 | Download limits | **CLOSED / ACCEPTED** — 2026-09-26 (Phase 1.8A interim) |
| OD-07 | Ceny Premium | §15, §48 | Faza 4 | OPEN |
| OD-08 | Dokładne poziomy Premium | §4, §22–23 | Faza 4 | OPEN |
| OD-09 | Ostateczne nazwy poziomów konta | §4 (nazwy robocze) | Profile, billing | OPEN |
| OD-10 | Finalne nazwy głosowania | §27 | Faza 2 — Voting | OPEN |
| OD-11 | Mechanizm moderacji komentarzy | §28 | Faza 2 — Comments | OPEN |
| OD-12 | Metoda kodowania audio | §9, §24 | Playback / download versions | OPEN |
| OD-13 | Metoda watermarkingu audio | §9 | Download pipeline | OPEN |
| OD-14 | Metoda miksowania nagrania z bitem | §24 | Export / publikacja utworu | OPEN |
| OD-15 | Finalna identyfikacja wizualna | §2, §41 | Design system, UI | OPEN |
| OD-16 | Finalny język marki (copy) | §2, §41 | Teksty UI / marketing | OPEN |
| OD-17 | Zasady liczenia powtórnych pobrań | §17 | Download stats | **CLOSED / ACCEPTED** — 2026-09-26 (Phase 1.8A interim) |
| OD-18 | Zasady liczenia udostępnień | §34 | Beat sharing stats | OPEN |
| OD-19 | Domyślny account level przy rejestracji | §4 | Profile creation default | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-20 | Bezpieczny bootstrap pierwszego ADMIN | §3, §36 | Production admin access | **CLOSED / ACCEPTED** — 2026-09-25 |

---

## CLOSED / ACCEPTED (skrót)

Szczegóły: [DECISION_LOG.md](./DECISION_LOG.md).

| ID | Decyzja (skrót) | Data |
|----|-----------------|------|
| OD-01 | Next.js + TypeScript + Tailwind + shadcn/ui (baza) + własny Design System + App Router | 2026-09-25 |
| OD-02 | Next.js jako application server (Server Actions / Route Handlers); bez osobnego Express/Nest/Fastify na start | 2026-09-25 |
| OD-03 | Supabase: PostgreSQL, Auth, RLS, Storage; Edge Functions gdy potrzebne; Role ≠ Account Level | 2026-09-25 |
| OD-05 | Anon download limit = 2 / UTC day; httpOnly opaque token + server hash (Phase 1.8A interim) | 2026-09-26 |
| OD-06 | User download limit = 4 / UTC day; `user_id`; global (Phase 1.8A interim) | 2026-09-26 |
| OD-17 | DOWNLOAD_EVENT = successful DOWNLOAD signed-URL issuance after AuthZ + limit allow (Phase 1.8A interim) | 2026-09-26 |
| OD-19 | Signup default account level = `BEGINNER_RAPPER` (role remains `USER`) | 2026-09-25 |
| OD-20 | No automatic first-admin; manual/operator-controlled ADMIN bootstrap outside signup | 2026-09-25 |

---

## OPEN — nadal wymagają decyzji Ownera / Architekta

| ID | Temat | Blokuje |
|----|--------|---------|
| OD-04 | Operator płatności | Faza 4 |
| OD-07 | Ceny Premium | Faza 4 |
| OD-08 | Poziomy Premium | Faza 4 |
| OD-09 | Nazwy poziomów konta | Profile / billing labels |
| OD-10 | Nazwy głosowania | Faza 2 |
| OD-11 | Moderacja komentarzy | Faza 2 |
| OD-12 | Kodowanie audio | Playback / download versions |
| OD-13 | Watermarking audio | Download pipeline (OUT of Phase 1.8A) |
| OD-14 | Miksowanie nagrania z bitem | Export / publikacja |
| OD-15 | Identyfikacja wizualna | Final Design System |
| OD-16 | Język marki | Copy UI |
| OD-18 | Liczenie udostępnień | Beat sharing stats |

---

## Uwagi implementacyjne (bez zamrażania wartości OPEN)

- Limity pobrań muszą być **konfigurowalne** (`anonymous_daily_download_limit`, `user_daily_download_limit`, `premium_daily_download_limit`) — nie hardcodowane (§13). Wartości startowe Phase 1.8A: **OD-05 = 2**, **OD-06 = 4**, **OD-17 = signed-URL issuance** (CLOSED interim); config SSOT: `src/config/downloads.ts`. Premium limit nadal później.
- Feature flags płatności startują jako **wyłączone** (§14–15).
- **Supabase Auth jest zatwierdzone** (OD-03 CLOSED) — nie traktować już jako „preferencji roboczej”.
- Signup default: `role = USER`, `account_level = BEGINNER_RAPPER` (**OD-19 CLOSED**).
- First ADMIN: manual / operator-controlled only — **no** auto first-user admin (**OD-20 CLOSED**).
- Retencja nagrania Premium (`premium_take_retention_days = 10`) jest przykładem konfiguracji z SSOT — nie mnożyć magicznych liczb w kodzie (§23).
- Codec, bitrate, watermark, export/mix: OD-12–OD-14 — OPEN / DEFERRED.

---

## Szablon decyzji (do użycia w `DECISION_LOG.md`)

```text
ID: OD-XX
Data:
Decydent:
Decyzja:
Uzasadnienie:
Wpływ na SSOT / architekturę:
Wersja SSOT po aktualizacji:
```
