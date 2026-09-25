# BitRymDym — System Architecture

**Status:** BASELINE ACCEPTED (OD-01 / OD-02 / OD-03)
**Data baseline:** 2026-09-25
**Produkt / domena:** [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md)
**Decyzje:** [DECISION_LOG.md](../decisions/DECISION_LOG.md) · [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md)

Ten dokument jest źródłem prawdy dla **HOW / TECHNICAL ARCHITECTURE**.
SSOT pozostaje źródłem prawdy dla **WHAT / PRODUCT TRUTH**.

---

## 1. Purpose

Opisać zatwierdzoną architekturę techniczną BitRymDym: warstwy, granice zaufania, przepływy Auth/Authorization, Storage audio, oraz zakres tego, co jest ustalone vs OPEN.

Nie zastępuje SSOT. Nie jest implementacją.

---

## 2. Architectural Principles

| Zasada | Znaczenie |
|--------|-----------|
| **SSOT FIRST** | Produkt i reguły domenowe z SSOT; konflikt → STOP + aktualizacja SSOT |
| **REUSE FIRST** | Nie duplikować logiki limitu, permissions, statusów, playera |
| **ZERO DUPLICATE LOGIC** | Jedno źródło reguł biznesowych po stronie serwera / konfiguracji |
| **MOBILE FIRST** | UI i player działają na telefonie, tablecie, desktopie (SSOT §40) |
| **SERVER AUTHORIZATION** | Frontend prosi; server decyduje (SSOT §39) |
| **PRIVATE AUDIO STORAGE** | Master bez permanentnych publicznych URL-i (SSOT §9) |
| **DOCUMENTATION CONTINUITY** | Każda decyzja / zmiana musi być odzwierciedlona w docs — [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md) |

---

## 3. Technology Baseline

### Frontend (OD-01 CLOSED)

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui — **baza techniczna komponentów**, nie identyfikacja wizualna
- własny BitRymDym Design System
- Next.js App Router

### Application Server (OD-02 CLOSED)

- Next.js jako główna warstwa aplikacyjna
- Server Actions
- Route Handlers / API handlers
- server-side business logic

**Nie** na start: osobny Express / NestJS / Fastify.

### Backend Infrastructure (OD-03 CLOSED)

- Supabase
- PostgreSQL
- Supabase Auth
- Row Level Security (RLS)
- Supabase Storage
- Edge Functions — tylko gdy potrzebne

---

## 4. High-Level Architecture

```text
Browser
   ↓
Next.js (UI + App Router)
   ↓
Authentication (Supabase Auth session)
   ↓
Authorization (server: roles / permissions / account rules)
   ↓
Business Rules (limits, duration, access, feature flags)
   ↓
Supabase (RLS + PostgreSQL + Storage)
   ↓
PostgreSQL / Storage
   ↓
Response
```

Szczegółowy przepływ żądania:

```text
FRONTEND REQUEST
        ↓
AUTHENTICATION
        ↓
SERVER AUTHORIZATION
        ↓
PERMISSION
        ↓
BUSINESS RULE
        ↓
DATABASE / STORAGE  (+ RLS)
        ↓
RESPONSE
```

---

## 5. Identity Model

```text
Supabase Auth
    ↓
Profile
    ↓
Role
    ↓
Permissions
    ↓
Account Level
```

### Role (systemowe)

```text
ADMIN
MODERATOR
USER
```

### Account Level (OD-09 OPEN for final labels; OD-19 CLOSED for signup default)

```text
BEGINNER_RAPPER   ← approved signup default (OD-19)
PRO_RAPPER
LEGEND_RAPPER
```

**ROLE ≠ ACCOUNT LEVEL.**
Signup: `USER` + `BEGINNER_RAPPER`.
First ADMIN: manual / operator-controlled only (**OD-20 CLOSED**) — no automatic first-user admin.

---

## 6. Authorization Model

- Autoryzacja i reguły krytyczne: **server-side** (Next.js) + **RLS** (Supabase).
- Frontend **nie** jest granicą bezpieczeństwa.
- Nie opierać ochrony na rozsianym `if (role === "admin")`.
- Docelowo: centralny permission catalog; role = zestawy uprawnień (SSOT §36).

Katalog uprawnień, mapowanie ról, account-level rules, feature flags, limity i statusy traktować jako **kontrolowane źródła konfiguracji / SSOT** — nie hardcode w wielu miejscach UI.

---

## 7. Audio Architecture

### Zatwierdzony baseline

```text
MASTER AUDIO  →  PRIVATE STORAGE  →  CONTROLLED ACCESS
                                      ├── PLAYBACK VERSION
                                      └── DOWNLOAD VERSION
```

- Master: prywatny storage; **brak** permanentnych publicznych URL-i.
- Dostęp: **temporary signed URLs**.
- Cel: ochrona mastera, kontrola dostępu, rejestracja pobrań — bez obietnicy absolutnej niemożności przechwycenia (SSOT §9).

### OPEN / DEFERRED (nie wymyślać)

| Temat | ID |
|-------|-----|
| Codec / formaty / bitrate | OD-12 |
| Watermarking | OD-13 |
| Export / miks nagrania z bitem | OD-14 |

---

## 8. Audio Player

BitRymDym **nie** używa finalnie domyślnego `<audio controls>` jako głównego UI.

Wymaganie: własny **BitRymDym Audio Player** (SSOT §10):

- play / pause, seek, progress / waveform
- current time, duration, volume, mute
- cover, title, producer, BPM, genre, style, key, scale
- download — jeśli użytkownik ma prawo
- recording / Quick Take — jeśli użytkownik ma prawo
- responsywny, mobile-first, spójny z Design System, część tożsamości marki

Implementacja: **nie w tej sesji dokumentacyjnej**.

---

## 9. Quick Take

Baseline produktowy (SSOT §18–§24):

| Typ | Reguła |
|-----|--------|
| Anonymous | tymczasowy take; bez bezterminowego zachowania; krótki serwerowy TTL |
| Standard logged-in | max **30 s**; „Moje próbki”; retencja **24 h**; auto-delete |
| Premium Full Take | długość bitu, max beat **3:00 (180 s)**; retencja **10 dni** (konfig); odtwórz / pobierz / usuń / opublikuj osobno |

Zasady wspólne:

- Quick Take **nie** publikuje się automatycznie.
- Głównie przechowywane jest nagranie **mikrofonu**.
- Bit **nie** jest automatycznie trwale miksowany z nagraniem.
- Export / mix: **OD-14 OPEN**.
- Retencje docelowo **konfigurowalne** (nie hardcode w wielu miejscach).

---

## 10. Beat Lifecycle

Zgodnie z SSOT §6–§8, §29–§30. Feature doc: [BEATS.md](./BEATS.md).

**Własność:**

| Type | Rule |
|------|------|
| `PLATFORM` | `owner_id = NULL` |
| `USER` | `owner_id = profiles.id` |

**Statusy:**

```text
DRAFT
PENDING_REVIEW
APPROVED
PUBLISHED
REJECTED
ARCHIVED
```

**Phase 1.4 active ADMIN workflow (platform):**

```text
DRAFT → PUBLISHED → ARCHIVED → DRAFT
```

`PUBLISHED → DRAFT` forbidden. ADMIN may publish platform DRAFT without `PENDING_REVIEW`.

**User upload flow (schema-ready; not active in 1.4):**

```text
UPLOAD → VALIDATION → PENDING_REVIEW → MODERATION → APPROVED → PUBLISHED
```

Po zatwierdzeniu bitu użytkownika (domyślnie, przyszłość):

- playback: **YES**
- download: **NO** → prośba o udostępnienie / kontakt z właścicielem

Max duration opublikowanego bitu: **180 s** — walidacja serwerowa + DB check.
BPM: wartość **liczbowa** (1–300).

Phase 1.4 implemented: table `public.beats`, RLS, ownership integrity, central validator, beat service/actions.
**Not** in 1.4: audio Storage, player, downloads, community upload.
---

## 11. Track Lifecycle

Zgodnie z SSOT §25–§26:

Pola (min.): title, artist_name / pseudonym, audio, cover, description, beat_reference.

**Statusy:**

```text
DRAFT
PENDING_REVIEW
PUBLISHED
REJECTED
HIDDEN
REMOVED
```

Publiczny utwór nagrany na bicie BitRymDym **musi** mieć relację do konkretnego bitu.

---

## 12. Moderation

Zgodnie z SSOT §27–§28, §35:

- Voting: max jedna aktywna ocena użytkownika na track; nazwy: **OD-10 OPEN**.
- Comments: ochrona przed spamem, reklamami, linkami, wulgaryzmami, floodem; statusy `VISIBLE | PENDING | BLOCKED | REPORTED | DELETED`; mechanizm: **OD-11 OPEN**.
- Reports / moderation queue — zakres admin/moderator.

Dokładny system moderacji DM: nie zamknięty w OD — pozostaje do osobnej decyzji (nie wymyślać).

---

## 13. Admin / Audit

Zgodnie z SSOT §35–§37:

**ADMIN** (docelowy zakres paneli): users, roles, permissions, beats, tracks, comments, reports, moderation, messages/mod tools, downloads, statistics, feature flags, payments, system settings, storage, audit log.

**MODERATOR:** dostęp moderacyjny; bez automatycznego dostępu do krytycznych ustawień / płatności / bezpieczeństwa.

**Audit log** (istotne akcje admin):

```text
timestamp | actor | action | entity | entity_id | before | after
```

Implementacja panelu: nie w tej sesji.

---

## 14. Security Boundaries

```text
REQUEST
→ AUTHENTICATION
→ SERVER AUTHORIZATION
→ PERMISSION
→ BUSINESS RULE
→ RLS
→ DATABASE / STORAGE
```

**Frontend ≠ security boundary.**

Krytyczne reguły zawsze serwerowo m.in.: download limits, beat ownership/access, premium status, recording duration, upload permissions, moderation/admin permissions (SSOT §39).

---

## 15. Storage Access

- Dane stałe vs tymczasowe (SSOT §38) — tymczasowe z auto-czyszczeniem.
- Dostęp do audio: **temporary signed URLs** po przejściu gate’ów.
- Download flow (SSOT §12):

```text
REQUEST → AUTH → ROLE/ACCOUNT ACCESS → LIMIT → ANTI-ABUSE → RECORD → SIGNED URL → DOWNLOAD
```

Wartości limitów: **OD-05 / OD-06 OPEN** (mechanizm konfigurowalny — CONFIRMED).
Liczenie powtórzeń: **OD-17 OPEN**.

---

## 16. Configuration / Feature Flags

Centralnie zarządzane (kierunek — nie implementacja):

- download limits
- retention (Quick Take / Premium)
- feature flags (`payments_enabled`, `premium_enabled`, …) — start **OFF**
- max beat duration (180)
- Quick Take max duration (30)
- permission catalog
- status enums
- controlled vocabularies (genre/style itd. — do ustalenia przy seed/filtrach)

Płatności: **OFF** na obecnym etapie (SSOT §14–§15). Operator: **OD-04 OPEN**.

---

## 17. Deployment Architecture

Docelowy przepływ:

```text
LOCAL WINDOWS
     ↓
GIT
     ↓
GITHUB
     ↓
VERCEL
```

Supabase = backend infrastructure.

Szczegóły CI/CD środowisk (preview/prod) — poza baseline tej sesji; nie wymyślać.

---

## 18. Current Scope

```text
PHASE 1.6 — PUBLISHED BEATS SURFACE + PLAYBACK SHELL — COMPLETE / CLOSED / LOCKED
Canonical: main @ 39be430
Production: GREEN / VERIFIED
Next: PHASE 1.7 DESIGN FREEZE (Owner candidate selection; Cold-Start Audit complete)
```

### IMPLEMENTED / LOCKED
- Next.js scaffold (Phase 1.2)
- Auth / profiles / roles / permissions / account levels (Phase 1.3)
- Beats metadata domain (Phase 1.4 @ `6cb1e9a`)
- Phase 1.5 Design Freeze (@ `0e5c491`)
- Private Storage + Access Gate (Phase 1.5 @ `0ec0be0`)
  - Private bucket `beat-audio`
  - `beat_audio_assets` + RLS + privilege triggers
  - Server-mediated ADMIN PLATFORM upload/replace/archive
  - Access Gate (`requestBeatAudioAccess`) — anon / auth / admin paths
  - Signed URL PLAYBACK 120s / DOWNLOAD 300s
  - Interim MIME allow-list + 50 MiB (OD-12 remains OPEN)
- Phase 1.6 Design Freeze — APPROVED / LOCKED
- Phase 1.6 Published Beats Surface + Playback Shell (**CLOSED / LOCKED** @ `39be430`)
  - `/beats` PUBLISHED-only catalog
  - `/beat/[id]` PUBLISHED-only detail
  - Custom Playback Shell (no native `<audio controls>` UI)
  - PLAYBACK only via existing Access Gate
  - DOWNLOAD UI / limits / Quick Take / waveform hard OUT
  - Downloads capability remains **PARTIAL**; Quick Take **NOT STARTED**

### PLANNED (not started)
- Download limits / UI / audit (1.7), Quick Take (1.8), tracks, payments

### OPEN
- OD-04 … OD-18 — **OD-12 remains OPEN**
- Next.js middleware → proxy migration (NON-BLOCKING)

## 19. Open Architecture Decisions

Pełna lista: [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md).

Nadal OPEN m.in.: OD-04 … OD-18.

---

## 20. Explicitly Not Yet Decided

Nie zamrażać samodzielnie m.in.:

- codec / bitrate / audio processing (OD-12)
- watermark (OD-13)
- payment provider (OD-04)
- exact download limits (OD-05, OD-06)
- exact Quick Take anonymous TTL implementation detail
- export / mix (OD-14)
- DM moderation mechanism
- account level final naming (OD-09)
- voting labels (OD-10)
- comment moderation mechanism (OD-11)
- visual identity freeze (OD-15)
- brand copy freeze (OD-16)
- repeat download counting (OD-17)
- share counting (OD-18)

---

## Related documents

- [PROJECT_STATE.md](../PROJECT_STATE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md)
- [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md)
- [PHASE_1_FOUNDATION.md](../phases/PHASE_1_FOUNDATION.md)
- [BEATS.md](./BEATS.md)
- [AUTHORIZATION.md](./AUTHORIZATION.md)