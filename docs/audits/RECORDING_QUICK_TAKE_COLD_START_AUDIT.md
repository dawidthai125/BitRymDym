# RECORDING / QUICK TAKE COLD-START AUDIT

**Audit type:** Forensic / read-only cold-start  
**Auditor role:** Implementation Engineer + Forensic Code Auditor  
**Owner:** Prezes Dawid  
**Date:** 2026-09-27  
**Scope:** Recording / Quick Take only — **no implementation, no schema change, no commit**

---

## 1. Baseline

| Pole | Wartość |
|------|---------|
| Branch | `main` |
| HEAD | `c5e1f17ce61416048869d7317ec749cca83f1003` |
| Working tree | Clean for product code; untracked only `.agents/`, `.cursor/`, `skills-lock.json` |
| Production baseline (docs + deploy) | Community EPIC CLOSED @ `c5e1f17`; production GREEN (`bitrymdym.pl`) |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Last commit touching recording/QT **code** | **None** — no product commit ever introduced MediaRecorder / take APIs |
| Last commits mentioning Quick Take | Docs-only (OUT / NOT STARTED) across phases 1.5–1.9, Community freeze, CHANGELOG |
| Closest related audio commits | `0ec0be0` Access Gate · `39be430` Playback · `fd87f23` Downloads · `73e213c` / `9cfb3cf` beat signed transport |

**Git forensics:**

- `git log -S'MediaRecorder'` / `getUserMedia` / `quick_take` / `recording_limit` → **no implementation commits**
- Path history `*record*` / `*take*` / `*mic*` / `*quick*` → **no product artifacts**
- Mentions of MediaRecorder exist only in **docs** (hard OUT) and in `playback-state.test.ts` asserting QT is **absent**

---

## 2. Executive Summary

```text
RECORDING STATUS   = NOT IMPLEMENTED
QUICK TAKE STATUS  = NOT IMPLEMENTED
```

Product docs (MASTER SSOT §18–§24, SYSTEM_ARCHITECTURE §9) describe a full Quick Take / Premium Full Take model. **Runtime code, DB, Storage, APIs, and UI do not implement any of it.**

What exists today (adjacent, not recording):

- Private beat audio (`beat-audio`) + Access Gate for **PLAYBACK** / **DOWNLOAD** only
- Custom `PlaybackShell` (no Record control)
- Account level enum on `profiles` (**unused** for entitlements / recording)
- No take tables, no QT bucket, no retention jobs, no mix/export

**MIC TAKE ≠ MIXED SONG:** Confirmed by absence — there is no mix path. SSOT §24 + OD-14 remain product truth for a future MIX/EXPORT epic.

---

## 3. Existing Implementation

| Obszar | Status | Lokalizacja | Fakty |
|--------|--------|-------------|-------|
| MediaRecorder / getUserMedia | **BRAK** | — | Zero użycia w `src/` |
| Record button / recording UI | **BRAK** | Player / beat pages | Home copy: „Quick Take … poza tym etapem” |
| Recording session / take service | **BRAK** | — | Brak Server Actions / Route Handlers dla take |
| Take Storage bucket | **BRAK** | Storage | Jedyny bucket: `beat-audio` (private) |
| Take DB tables | **BRAK** | Postgres | Tabele: profiles, permissions, role_permissions, beats, beat_audio_assets, beat_download_events, beat_download_reservations |
| Account-level recording limits | **BRAK** | — | Enum istnieje; brak `max_recording` / retention config |
| Retention / TTL cleanup for takes | **BRAK** | — | Brak `expires_at` na take; brak Edge Functions; brak cron |
| Mix / export | **BRAK** | — | OD-14 OPEN; no MIX purpose / pipeline |
| Beat MASTER audio | **ISTNIEJE** | `beat_audio_assets` + `beat-audio` | PLATFORM `platform/…` · USER `user/{ownerId}/…` |
| Access Gate | **ISTNIEJE** | `src/lib/beats/audio-access.ts` | purposes: `PLAYBACK` \| `DOWNLOAD` only |
| PlaybackShell | **ISTNIEJE** | `src/components/player/playback-shell.tsx` | Play/pause/seek/volume; no record |
| Downloads / My Downloads | **ISTNIEJE** | Phase 1.8A | Beat DOWNLOAD only — not takes |
| Shared-beat grants | **BRAK** | — | Brak tabeli share/grant; SSOT §16 „Bity udostępnione” = przyszłość |
| Permissions for recording | **BRAK** | `permissions` keys | Brak `takes.*` / `recording.*`; są m.in. beats.*, tracks.*, comments.* (tracks/comments niezaimplementowane produktowo) |
| Feature flags (premium/recording) | **BRAK w runtime** | Permission keys only | `feature_flags.*` w katalogu uprawnień; brak tabeli/UI flag; payments OFF by product rule |

---

## 4. Existing Architecture

**Faktyczny przepływ (dziś):**

```text
BEAT (PUBLISHED)
  → ACCESS GATE (AuthZ + status)
  → PLAYER (PlaybackShell + signed PLAYBACK URL)
  → RECORDING          = BRAK
  → TAKE               = BRAK
  → TAKE STORAGE       = BRAK
```

**Docelowy kierunek z SSOT (niezaimplementowany):**

```text
BEAT → ACCESS → PLAYER → MIC CAPTURE → TAKE (mic-only) → STORAGE (+ retention)
       ↳ later EPIC: MIX(TAKE + BEAT) → EXPORT / TRACK   (OD-14 OPEN)
```

**Audio purposes w kodzie (beat only):** `MASTER` | `PLAYBACK` | `DOWNLOAD`  
Brak: `TAKE` / `MIX` / `EXPORT`.

**Gdzie co jest przechowywane:**

| Artefakt | Status | Miejsce |
|----------|--------|---------|
| BEAT MASTER | TAK | `beat-audio` + `beat_audio_assets` |
| BEAT PLAYBACK asset | Opcjonalny / fallback MASTER | Access Gate |
| USER TAKE (mic) | **BRAK** | — |
| MIXED TAKE | **BRAK** | — |
| EXPORT | **BRAK** | — |

---

## 5. Account-Level Gating

| Level | Obecny limit (kod) | Retention (kod) | Faktyczny stan |
|-------|-------------------:|----------------:|----------------|
| Anonymous / GUEST | — | — | **NOT IMPLEMENTED** (brak QT) |
| `BEGINNER_RAPPER` | — | — | Enum + signup default OD-19; **no recording entitlement** |
| `PRO_RAPPER` | — | — | Enum only; **no Full Take** |
| `LEGEND_RAPPER` | — | — | Enum only; **no Full Take+** |
| Premium (SSOT §22–23) | — | — | **NOT IMPLEMENTED**; OD-07/OD-08 OPEN |

**Uwaga produktowa (drift SSOT ↔ Owner brief):**

- SSOT wiąże Full Take z **Premium**, nie z `PRO_RAPPER` / `LEGEND_RAPPER`.
- Owner brief mapuje PRO → Full Take (10 dni), LEGEND → Full Take+ (retention TBD).
- To **nie jest zamknięta decyzja w kodzie ani w OD** — wymaga Owner/Architect przed EPIC-em.

`canRequestBeatAudioAccess` dokumentuje wprost: **AccountLevel is intentionally unused.**

Docelowa formuła `MIN(beat.duration, account_level.max_recording_duration)` — **NOT IMPLEMENTED** (brak fragmentów logiki recording-limit w `src/`).

---

## 6. Shared Beat Recording

| Scenariusz | Stan faktyczny |
|------------|----------------|
| Public beat (`PUBLISHED`) | Katalog + detail + PLAYBACK/DOWNLOAD via Access Gate |
| Owned beat (USER owner) | Community lifecycle; owner widzi własne statusy; public tylko po PUBLISHED |
| Shared beat (grant do konkretnego usera) | **NOT IMPLEMENTED** — brak tabeli/API/UI share grant |
| Access request / grant flow | **NOT IMPLEMENTED** |
| Downloaded beat („Moje pobrane”) | Historia DOWNLOAD_EVENT; **nie** tworzy prawa do recording |
| Playback right | Nie implikuje recording (brak recording path) |
| Recording eligibility na shared beat | **Niewykonalne dziś** — nie ma shared access ani recording flow |

**Wniosek:** Nie da się „wejść w flow nagrywania” na shared beat, bo **ani recording, ani shared beats nie istnieją**. Ewentualne przyszłe QT na beatcie publicznym musiałoby osobno zdefiniować AuthZ (nie zakładać, że DOWNLOAD/PLAYBACK = RECORD).

---

## 7. Storage

| Temat | Fakt |
|-------|------|
| Buckets | Tylko `beat-audio`, `public = false` |
| QT / take bucket | **NOT CREATED** (Phase 1.5 freeze: future `quick-take` + TTL — DEFERRED) |
| Object keys (beats) | `platform/{beatId}/{assetId}/{purpose}.bin` · `user/{ownerId}/…` |
| Signed URL | Tak — dla beat PLAYBACK (120s) / DOWNLOAD (300s) |
| Take upload | **NOT IMPLEMENTED** |
| Take ownership / signed download | **NOT IMPLEMENTED** |
| Community vs QT isolation | Phase 1.5 zakazywało mieszania domen w `beat-audio`; Community Wave 2 **umieściło** USER beat audio w tym samym bucketcie pod prefixem `user/` — QT nadal nie istnieje; przy EPIC-u rozważyć osobny bucket zgodnie z 1.5 |

---

## 8. Database

| Element | Istnieje? | Lokalizacja | Uwagi |
|---------|-----------|-------------|-------|
| `takes` / `recordings` / `quick_takes` | NIE | — | |
| `expires_at` na take | NIE | — | `expires_at` istnieje tylko na `beat_download_reservations` |
| Retention / cleanup job | NIE | Edge Functions: **[]** | |
| `account_level` enum | TAK | `profiles.account_level` | BEGINNER/PRO/LEGEND |
| Beat audio assets | TAK | `beat_audio_assets` | MASTER/PLAYBACK/DOWNLOAD |
| Download events / reservations | TAK | Phase 1.8A | Beat downloads only |
| Share / grant tables | NIE | — | |
| RLS for takes | NIE | — | |
| Migrations mentioning QT | NIE | `supabase/migrations/*` | Tylko docs |

---

## 9. Security

Ocena względem **powierzchni recording** (nie re-audit całego Community epic).

| Punkt | Werdykt | Komentarz |
|-------|---------|-----------|
| Auth for recording | **NOT IMPLEMENTED** | Brak endpointu nagrywania |
| AuthZ for recording | **NOT IMPLEMENTED** | Brak permission / gate |
| Ownership of take | **NOT IMPLEMENTED** | Brak zasobu take |
| IDOR on take | **NOT IMPLEMENTED** | Brak ID take do spoofowania |
| Duration server validation | **NOT IMPLEMENTED** | Brak upload take |
| MIME validation (take) | **NOT IMPLEMENTED** | Beat MIME allow-list nie dotyczy take |
| Size limit (take) | **NOT IMPLEMENTED** | |
| Storage privacy (takes) | **NOT IMPLEMENTED** | Brak obiektów take; beat bucket private |
| Signed URLs (takes) | **NOT IMPLEMENTED** | |
| Retention / expired access | **NOT IMPLEMENTED** | |
| Account-level spoof → longer recording | **WARN (adjacent)** | Self-escalation `account_level` **zablokowane** triggerem profilu; ale brak recording gate — spoof nie daje dziś longer take |
| Beat ID misuse for recording | **NOT IMPLEMENTED** | |
| OwnerId spoof on take upload | **NOT IMPLEMENTED** | |

**SECURITY_BLOCKERS (recording-specific) = 0** — nie ma ukrytej, dziurawej implementacji QT. Ryzyko pojawia się dopiero przy pierwszym EPIC-u (musi od dnia 1: AuthZ, ownership, duration, MIME, size, private storage, signed URL, retention).

Adjacent PASS (nie QT, ale reuse candidates): Access Gate, private `beat-audio`, protected profile fields, download reservation semantics.

---

## 10. Tests

| Plik | Typ | Zakres względem recording |
|------|-----|---------------------------|
| `src/lib/player/playback-state.test.ts` | Unit | **Explicitly asserts** brak MediaRecorder / „quick take” / waveform hooks |
| `src/lib/beats/audio-validation.test.ts` | Unit | Access Gate PLAYBACK/DOWNLOAD AuthZ — **nie** recording |
| `src/lib/beats/community-wave*.test.ts` | Unit / live | Community upload/moderation; assert account level **nie** w publish/submit |
| `src/lib/downloads/*.test.ts` | Unit | Download limits / OD-17 — beat only |
| `src/lib/auth/permissions.test.ts` | Unit | Privilege escalation on `account_level` — identity, nie QT |

**Brak testów:** microphone, take CRUD, retention, recording duration, QT AuthZ, shared-beat recording.

---

## 11. Documentation Drift

| Źródło | Twierdzi | Kod |
|--------|----------|-----|
| MASTER SSOT §18–§24 | Pełny model QT / Premium Full Take / Moje próbki / TTL | **Brak implementacji** |
| SYSTEM_ARCHITECTURE §8–9 | Player z recording „jeśli prawo”; QT baseline | Player **bez** recording |
| architecture/README | QT 30s / 24h jako „ustalone w SSOT” | Ustalone **produktowo**, nie runtime |
| PHASE_1_FOUNDATION | Phase **1.9 = Quick Take** NOT STARTED | Phase 1.9 **zamknięte** jako operator bootstrap (`47643c2`); numeracja QT w foundation **przestarzała** |
| PHASE_1_5 | Future bucket `quick-take` DEFERRED | Nadal true |
| PHASE_1_6 / 1.7 / 1.8A / 1.9 / Community | QT hard OUT / NOT STARTED | Zgodne z kodem |
| PROJECT_STATE / README app | QT w celu produktu; „nie zaimplementowane” | Zgodne |
| Owner brief (PRO/LEGEND Full Take) | Mapowanie levels → recording | **Nie zamknięte** w OD; SSOT mówi Premium |

**Drift level:** SSOT opisuje przyszły produkt; phase freezes poprawnie mówią OUT — **MEDIUM–HIGH** na osi „SSOT brzmi jak istniejąca funkcja”, **LOW** na osi „freeze phases vs code”.

Kod nieopisany w SSOT jako recording: brak (nie ma ukrytej QT implementacji).

---

## 12. Gaps

### P0 — blocker / security (przed pierwszym shipem QT)

- Brak serwerowego AuthZ dla create/read/delete take
- Brak ownership + IDOR model dla take
- Brak server-side duration / MIME / size na upload take
- Brak private take storage + signed access
- Brak retention enforcement (expired take nadal dostępny = FAIL gdy pojawi się storage bez cleanup)

### P1 — required for Recording MVP (Quick Take)

- Mic capture (MediaRecorder / getUserMedia) + permission UX
- 30s hard cap (client UX + **server**)
- Take preview / re-record / delete
- Persist path dla zalogowanych („Moje próbki”) + 24h retention
- Anonymous path policy (TTL / login CTA) — SSOT §20
- Eligibility: który beat wolno nagrywać (min. PUBLISHED + Access Gate reuse?)
- Player integration (Record control; sync beat playback vs mic — design)
- Mobile mic UX
- Tests: AuthZ, IDOR, duration, retention, Access Gate integration

### P2 — premium / scale

- Full Take = `MIN(beat.duration, global_max 180)` entitlement
- Retention 10 dni (config, nie magic numbers) — SSOT §23
- Mapowanie PRO / LEGEND / Premium (OD-08 / Owner)
- Daily / active take quotas
- Dedicated `quick-take` bucket vs namespaced keys
- Observability / audit events dla take lifecycle

### P3 — future

- MIX / EXPORT (OD-14) — **osobny EPIC**
- Publish take → Track
- Shared-beat recording eligibility (wymaga share grants EPIC)
- Watermark / codec final (OD-12/13)
- LEGEND retention details
- Waveform engine

---

## 13. Recommended EPIC Boundary

```text
PROPOSED EPIC: RECORDING / QUICK TAKE
```

**IN (MVP cold-start):**

- Microphone capture (desktop + mobile browsers)
- Standard Quick Take max **30 s** (server-enforced)
- Account-level entitlement skeleton (BEGINNER vs higher — **values after Owner/OD**)
- Beat eligibility policy (recommend start: PUBLISHED only via existing Access Gate PLAYBACK)
- Mic-only TAKE storage (private) + ownership
- Retention for logged-in standard (24 h) + anonymous short TTL **if** anon QT in scope
- Preview / delete / (optional) download take
- Security: AuthZ, IDOR, MIME, size, duration, signed URLs
- Tests + docs freeze
- Player Record entry point (minimal — no redesign of PlaybackShell beyond hook)

**OUT (osobne EPICi / GO):**

- MIX / EXPORT / Final Track (OD-14)
- Shared-beat grants + recording on shared beats
- Payments / Premium purchase
- Full Take / LEGEND retention final numbers (until OD/Owner)
- Watermark, new codec stack, waveform engine
- Comments / voting / messaging
- Reopening Community upload/moderation

**Reuse candidates (do nie dublować):** Access Gate patterns, signed URL issuance, private Storage conventions, profile `account_level`, download reservation patterns (TTL thinking) — **nie** reuse `beat-audio` object semantics without explicit bucket decision.

---

## 14. Open Decisions

Tylko to, czego **nie da się** rozstrzygnąć z obecnego SSOT + kodu:

1. **Mapowanie entitlementów:** Premium (SSOT) vs `PRO_RAPPER` / `LEGEND_RAPPER` (Owner brief) — OD-08 nadal OPEN; LEGEND retention **nie** zamknięte.
2. **Anonymous Quick Take w V1:** SSOT §20 dopuszcza; nie ma decyzji „ship anon QT w pierwszym EPIC-u czy logged-in only”.
3. **Beat eligibility:** tylko PUBLISHED public? także owned DRAFT? future shared? — brak zamkniętej reguły recording-access.
4. **Sync UX:** mic-only file vs simultaneous beat playback timing / countdown — SSOT §24 mówi mic jest głównym zapisem; detal UX OPEN.
5. **OD-14** mix/export method — pozostaje poza QT EPIC.
6. **Bucket strategy:** osobny `quick-take` (Phase 1.5 intent) vs prefix w `beat-audio` (jak community `user/`) — wymaga decyzji przy design freeze.
7. **OD-09** final account level display names — nie blokuje technicznie, ale kopiuje.

Nie listowano tu pytań rozstrzygalnych audytem (np. „czy MediaRecorder jest w repo” → NIE).

---

## 15. FINAL VERDICT

```text
RECORDING_AUDIT          = PASS
RECORDING_IMPLEMENTATION = NONE
QUICK_TAKE_IMPLEMENTATION = NONE
SECURITY_BLOCKERS        = 0
DOCUMENTATION_DRIFT      = MEDIUM
NEXT_STEP                = AUDIT COMPLETE — OWNER/ARCHITECT REVIEW
```

**PASS** oznacza: cold-start jest czytelny, brak ukrytej/partial QT implementacji, brak recording-specific security hole do natychmiastowego stopu.  
**MEDIUM drift:** SSOT opisuje pełny QT jako produkt; runtime = zero; foundation phase numbering dla QT jest stale względem zamkniętego Phase 1.9 bootstrap.

```text
COMMUNITY EPIC pozostaje CLOSED @ c5e1f17
RECORDING / QUICK TAKE = NOT STARTED (await Owner GO + design freeze)
```

---

*End of audit. No code, schema, UI, commit, push, or deploy performed.*
