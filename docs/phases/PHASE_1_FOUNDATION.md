# Faza 1 — Fundament

**SSOT:** [MASTER SSOT v0.1](../ssot/MASTER_SSOT_v0.1.md) §45  
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

| Etap | Opis | Blokery |
|------|------|---------|
| 1.0 | Dokumentacja SSOT + rejestr decyzji + struktura docs | — |
| 1.1 | Decyzja stacku FE/BE + architektury Supabase | OD-01, OD-02, OD-03 |
| 1.2 | Scaffold projektu + CI podstawowe | 1.1 |
| 1.3 | Auth (Supabase) + Users / Roles / Permissions / Profiles | 1.2, decyzja Auth |
| 1.4 | Beats + metadata + statusy + max duration (server) | 1.3 |
| 1.5 | Private audio storage + controlled playback/download access | 1.4, OD-12 częściowo |
| 1.6 | Custom Player (playback UI) | 1.5; OD-15 może być roboczy |
| 1.7 | Download permissions + limity (konfigurowalne) | 1.5; OD-05, OD-06 |
| 1.8 | Quick Take + temporary recordings + TTL | 1.6 |

---

## Kryteria akceptacji Fazy 1 (wysoki poziom)

- [ ] SSOT jest w repozytorium i jest źródłem prawdy.
- [ ] Otwarte decyzje są śledzone; elementy `DECISION REQUIRED` nie są zamrożone w kodzie.
- [ ] Użytkownik może się zarejestrować / zalogować (Auth).
- [ ] Role i permissions są rozdzielone od poziomu konta.
- [ ] Bit platformowy ma komplet metadanych; BPM liczbowe; duration ≤ 180 s (walidacja serwerowa).
- [ ] Master audio nie jest wystawione jako stały publiczny URL.
- [ ] Odtwarzanie odbywa się przez autorski player (nie natywne `<audio controls>` jako UI).
- [ ] Pobieranie przechodzi przez flow autoryzacji + limitu + signed URL + rejestracji pobrania.
- [ ] Quick Take: max 30 s; anonimowe z TTL; zalogowane z retencją 24 h.
- [ ] `payments_enabled` / `premium_enabled` = false.
- [ ] Testy pokrywają krytyczne reguły serwerowe (limity, duration, access).

---

## Status realizacji

| Etap | Status |
|------|--------|
| 1.0 Dokumentacja | IN PROGRESS (ten PR) |
| 1.1–1.8 | BLOCKED — oczekuje na decyzje / kolejne prompty |
