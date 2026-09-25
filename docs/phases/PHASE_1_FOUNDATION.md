# Faza 1 — Fundament

**SSOT:** [MASTER SSOT v0.1](../ssot/MASTER_SSOT_v0.1.md) §45
**Architektura:** [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)
**Stan projektu:** [PROJECT_STATE.md](../PROJECT_STATE.md)
**Cel:** zbudować bezpieczny fundament odsłuchu, pobierania i Quick Take — bez społeczności, bez Premium/płatności.

---

## Zakres (z SSOT)

```text
GitHub
lokalne repozytorium
dokumentacja
Supabase
Authentication
Users
Roles
Permissions
Profiles
Beats
Beat metadata
Private audio storage
Custom Player
Playback
Download permissions
Download limits
Quick Take
Temporary recordings
```

---

## Poza zakresem tej fazy

| Faza | Zakres | Nie robić w Fazie 1 |
|------|--------|---------------------|
| 2 | Społeczność | upload bitów userów (publiczny flow społeczności), tracks, voting, comments, reports |
| 3 | Współpraca | beat requests, DM, sharing, notifications |
| 4 | Premium | payments, extended downloads, Full Take |

Uwaga: schema/permissions mogą być przygotowane pod przyszłość, ale **aktywne płatności i Premium pozostają wyłączone** (§14–15, §48).

---

## Kontrolowane etapy (kolejność pracy)

Każdy etap wymaga osobnego promptu Architekta / akceptacji PO. Cursor Agent nie łączy etapów „na własną rękę”.

| Etap | Opis | Blokery | Status |
|------|------|---------|--------|
| 1.0 | Dokumentacja SSOT + rejestr decyzji + struktura docs | — | **COMPLETED** |
| 1.1 | Decyzja stacku FE/BE + architektury Supabase + SYSTEM_ARCHITECTURE | OD-01, OD-02, OD-03 | **COMPLETED** (docs) — Owner APPROVED · LOCKED |
| 1.2 | Scaffold projektu + bootstrap techniczny | 1.1 + Owner approval | **COMPLETED / LOCKED** |
| 1.3 | Auth (Supabase) + Users / Roles / Permissions / Profiles | 1.2 | **COMPLETE / LOCKED** on `main` @ `efe3f71` — live Auth/RLS **PASS** |
| 1.4 | Beats + metadata + statusy + max duration (server) | 1.3 | **COMPLETE / LOCKED** on `main` @ `6cb1e9a` — live Beats/RLS **PASS** |
| 1.5 | Private audio storage + controlled playback/download access | 1.4; OD-12 częściowo | **IMPLEMENTED / LIVE VERIFIED** — Design Freeze `0e5c491`; impl uncommitted |
| 1.6 | Custom Player (playback UI) | 1.5; OD-15 może być roboczy | NOT STARTED |
| 1.7 | Download permissions + limity (konfigurowalne) | 1.5; OD-05, OD-06, OD-17 | NOT STARTED |
| 1.8 | Quick Take + temporary recordings + TTL | 1.6 | NOT STARTED |

---

## Kryteria akceptacji Fazy 1 (wysoki poziom)

- [x] SSOT jest w repozytorium i jest źródłem prawdy (dokumentacja).
- [x] Otwarte decyzje są śledzone; elementy OPEN nie są zamrożone w kodzie.
- [x] OD-01 / OD-02 / OD-03 zamknięte i udokumentowane.
- [x] Użytkownik może się zarejestrować / zalogować (Auth) — Phase 1.3 live verified.
- [x] Role i permissions są rozdzielone od poziomu konta — w kodzie + RLS live verified.
- [x] Master audio nie jest wystawione jako stały publiczny URL — Phase 1.5 private bucket + signed URLs.
- [ ] Odtwarzanie przez autorski player (nie natywne `<audio controls>` jako UI).
- [ ] Pobieranie: auth + limit + signed URL + rejestracja. *(signed URL foundation: 1.5; limity: 1.7)*
- [ ] Quick Take: max 30 s; anonimowe z TTL; zalogowane z retencją 24 h.
- [ ] `payments_enabled` / `premium_enabled` = false.
- [x] Testy krytycznych reguł serwerowych (Auth + beats metadata/RLS + audio Storage/Access Gate).

**Cała Faza 1 ≠ COMPLETE** — ukończone: **1.0–1.4 LOCKED**; **1.5 IMPLEMENTED / LIVE VERIFIED** (awaiting commit). 1.6+ NOT STARTED.

---

## Status realizacji

| Etap | Status |
|------|--------|
| 1.0 Dokumentacja SSOT | COMPLETED / LOCKED |
| 1.1 Architektura OD-01–03 | COMPLETED / LOCKED |
| 1.2 Application scaffold | **COMPLETED / LOCKED** (Owner APPROVED) |
| 1.3 Auth + identity / access | **COMPLETE / LOCKED** — commit `efe3f71`; promoted to `main` / `origin/main`; live Auth/RLS **PASS** |
| 1.4 Beats domain foundation | **COMPLETE / LOCKED** — commit `6cb1e9a` on `main` / `origin/main`; live Beats/RLS **PASS** |
| 1.5 Private audio + Access Gate | **IMPLEMENTED / LIVE VERIFIED** — Design Freeze `0e5c491`; migration + bucket + gate; **no commit** yet |
| 1.6–1.8 | NOT STARTED — nie rozpoczynać bez Owner GO |

### Phase 1.3 lock notes

- Source branch: `cursor/phase-1-3-auth`
- Canonical commit: `efe3f71` — `feat(auth): complete phase 1.3 identity and rls`
- Docs lock: `68486dd`
- Main promotion: fast-forward `92251d7` → `efe3f71` (2026-09-25)
- Live Supabase project: `rzzxrgcdogkybkiidqgw`

### Phase 1.4 lock notes

- Canonical commit: `6cb1e9a` — `feat(beats): complete phase 1.4 beats domain foundation`
- Promoted / pushed to `main` / `origin/main` (2026-09-25)
- Migration: `supabase/migrations/20260925130000_phase_1_4_beats.sql` (applied live; additive)
- Domain: [BEATS.md](../architecture/BEATS.md)
- Active workflow: ADMIN DRAFT → PUBLISHED → ARCHIVED → DRAFT; no PUBLISHED → DRAFT
- Out of scope: Storage, player, downloads, Quick Take, community upload, payments
- OD-12 remains OPEN
- Next: Phase 1.5 Design Freeze (NOT STARTED)
