# POLISH-01 — DESIGN FREEZE TERMINOLOGII

**Type:** DESIGN FREEZE · terminologia warstwy prezentacji
**Date:** 2026-10-05
**Depends on:** [POLISH-01_LOCALIZATION_AUDIT.md](./POLISH-01_LOCALIZATION_AUDIT.md)
**Status:** **CLOSED / PRODUCTION VERIFIED**
**Implementation:** `579acb350cfc5f84c6756d412abfa3eec6778ff8` (`579acb3`)
**Residual hotfix:** `1c630809f15e5814b75d133ed04b0ebc3cda4001` (`1c63080`)
**Production deployment:** `dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP` · GH `6866686435` · READY
**Production verify:** **GREEN WITH NOTES** (waiver: `e3-7-f` / `EXPORT_WAV` · PRE-EXISTING / WAIVED)
**Maszynowy artefakt:** [POLISH-01_DESIGN_FREEZE.json](./POLISH-01_DESIGN_FREEZE.json)

> **Historia:** pierwotna wersja tego dokumentu była **PROPOSED / awaiting Owner GO**. Owner zatwierdził OD-PL-01…06, implementację i residual hotfix. Poniższa treść słownika pozostaje kanoniczna; status living = CLOSED / PRODUCTION VERIFIED.

---

## 0. Cel i zakres

Ustalić oficjalny słownik języka polskiego BitRymDym dla UI (user + admin), aby implementacja POLISH-01 była spójna.

**OUT OF SCOPE tego dokumentu (historycznie i nadal):** zmiana AuthZ/entitlements, nowe i18n, IA/nawigacja poza copy.

**IN SCOPE:** mapowanie *termin techniczny → label prezentowany*; świadome KEEP EN; TECHNICAL ONLY; decyzje Ownera.

### Owner decisions (LOCKED)

| ID | Decision |
|----|----------|
| **OD-PL-01** | **C** — „nagranie” = obiekt użytkownika · „próbka” = funkcja/polityka próbna |
| **OD-PL-02** | **Polityka nagrań** |
| **OD-PL-03** | Free / Bronze / Silver / Gold **KEEP EN** |
| **OD-PL-04** | **W moderacji** |
| **OD-PL-05** | Studio **KEEP EN** |
| **OD-PL-06** | Master **KEEP EN** Title Case |

### Delivery evidence

| Item | Value |
|------|--------|
| Feature commit | `579acb3` — `feat(ui): finalize Polish localization and labels` |
| Residual hotfix | `1c63080` — home `miejscu` · beat `nagrania` / `nagraj nagranie` · moderation `· Administrator` |
| Production | `1c63080` · `dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP` |
| Verify | GREEN WITH NOTES |

---

## 1. Aktualny stan SSOT (evidence)

### 1.1 Helpery prezentacji

| Plik | Funkcje | Uwagi |
|------|---------|--------|
| `src/lib/ui/labels.ts` | `labelAccountLevel`, `labelTakeStatus`, `labelBeatStatus`, `labelSystemRole`, `labelCreatorRank`, `labelAdminAuditAction`, `labelPremiumTier`, `labelAudioReady`, `labelRecordingMode` | **Główny SSOT labeli** |
| `src/lib/beats/status-labels.ts` | `beatStatusLabelPl`, `BEAT_STATUS_LABEL_PL`, `canUserEditBeatStatus` | **Duplikat** statusów beat + helper AuthZ UI |
| `src/lib/ui/user-errors.ts` | mappery Auth / playback / download / recording / mix / grant / upload | **SSOT błędów user-facing** |
| `src/lib/takes/client-upload.ts` | `toUserFacingTakeUploadError` | Specjalizacja take; fallback do centralnego mappera |

### 1.2 Konflikt statusów beat (P0 słownikowy)

| Enum | `labelBeatStatus` | `beatStatusLabelPl` |
|------|-------------------|---------------------|
| `PENDING_REVIEW` | **Do moderacji** | **W moderacji** |
| pozostałe | zgodne (Szkic / Zaakceptowany / …) | zgodne |

**Użycia:**
- `labelBeatStatus` → `/admin` pulpit, `/admin/beats/[id]`
- `beatStatusLabelPl` → `/account/beats`, `/admin/moderation`, `/admin/moderation/[id]`

**Rekomendacja DF (bez implementacji):** jeden SSOT w `labels.ts`; `status-labels.ts` re-export + zachować `canUserEditBeatStatus`. Wartość docelowa — **NEEDS OWNER DECISION** (patrz §4).

### 1.3 Osie produktowe (NIE mieszać)

Z OD-08 / W2 Premium / audytów recording:

| Oś | Enum techniczny | Helper UI | Znaczenie |
|----|-----------------|-----------|-----------|
| **System Role** | `ADMIN` / `MODERATOR` / `USER` | `labelSystemRole` | uprawnienia systemowe |
| **Account Level** | `BEGINNER_RAPPER` / `PRO_RAPPER` / `LEGEND_RAPPER` | `labelAccountLevel` | poziom konta twórcy |
| **Creator Rank** | `BEGINNER_RAPPER` … `LEGEND_RAPPER` (+ Rookie/Rising/Elite) | `labelCreatorRank` | ranga progress |
| **Premium Tier** | `FREE` / `BRONZE` / `SILVER` / `GOLD` | `labelPremiumTier` | plan Premium / limity produktu |
| **Sample Policy Actor** | `ANONYMOUS` + Premium tiers | (brak wspólnego label helpera) | limity próbek/nagrań (P1) |

**Zakaz DF:** łączenie Account Level z Premium Tier w jednym labelu lub jednej kolumnie UI bez kontekstu.

### 1.4 Prior polityka lokalizacji

`USER_FACING_POLISH_LOCALIZATION_IMPLEMENTATION.md`:
- PL-only user-facing; **bez** frameworka i18n
- dozwolone wyjątki produktowe: Premium, FREE/BRONZE/SILVER/GOLD, MP3/WAV/HQ, BPM, MASTER, Rec

`POLISH_UX_PRODUCTION_CLOSEOUT.md`:
- TAKE user-facing → **nagranie** (zweryfikowane)
- CTA: `Nagraj nagranie` · gość: `Gościnne nagranie`
- Workspace → **Studio** (świadoma zmiana brand)

### 1.5 Dominujące użycia w UI (skrót evidence)

| Termin | Gdzie dominuje |
|--------|----------------|
| **bit** | katalog, home „Przeglądaj bity”, admin „bit platformowy”, empty „Wybierz bit” |
| **nagranie** | Studio hub, recording READY, `labelRecordingMode`, Mix „Własne nagranie” |
| **próbka** | replace UI, user-errors limit, docs „Moje próbki”, Sample Policy (EN) |
| **próba** | empty Studio „pierwszą próbę”, library meta „Twoje próby” |
| **utwór** | chip „Moje utwory” (= community beats usera), aria player „przewiń utwór” |
| **Studio** | nav, `/account` H1 „Twoje studio”, SectionLabel |
| **Biblioteka** | `/library` + section na `/account` |
| **Profil** | mobile nav → `/account#profil` |
| **Konto** | settings SectionLabel, linki „← Konto”, fallback displayName |
| **gość** | recording meta `· gość`, „Gościnne nagranie” |
| **Premium** | Mix, admin users, błędy entitlement |
| **Free/Bronze/Silver/Gold** | `labelPremiumTier` (EN Title Case) |
| **Master / Mix / Pro Mix / Pro Master** | Mix panel (hybryda PL+EN) |
| **REC** | recording timer |
| **Panel Administracyjny** | admin layout/chrome (vs `ADMIN` na users) |

---

## 2. Zasady DF (obowiązujące po Owner GO)

1. **Technika vs UI:** enum/kod EN; UI wyłącznie przez helper z `labels.ts` / `user-errors.ts`.
2. **SSOT FIRST / REUSE FIRST:** rozszerzać istniejące helpery; nie tworzyć i18n ani drugiego słownika.
3. **ZERO DUPLICATE LOGIC:** docelowo jeden helper na domenę (status beat, tier, role…).
4. **Nie tłumaczyć formatów:** MP3, WAV, HQ, BPM — KEEP EN.
5. **KEEP EN tylko świadomie** — z uzasadnieniem w glossary.
6. **Account Level ≠ Premium Tier ≠ Rank ≠ Role** — osobne labele, osobne kolumny UI.
7. **Admin też po polsku** w warstwie prezentacji (może być bardziej precyzyjny technicznie).

---

## 3. Analiza klastrów + rekomendacje

### A. Audio / nagrywanie

| ID | Termin techniczny | Obecne w UI | Proponowany PL | Alternatywa | Rekomendacja | Uzasadnienie | Zakres |
|----|-------------------|-------------|----------------|-------------|--------------|--------------|--------|
| T-A01 | `beat` | bit, Bit, utwór (aria), Beat (fallback EN) | **bit** | — | **PROPOSED** | Dominuje w katalogu/admin; polski slang produktowy | user+admin |
| T-A02 | `utwór` (community upload) | „Moje utwory” | **mój bit** / **moje bity** | zostawić „utwór” | **NEEDS OWNER DECISION** | „utwór” myli z nagraniem wokalnym; evidence: chip Studio vs aria player | account |
| T-A03 | `take` / `sample` | nagranie, próbka, próba, take (kod) | **nagranie** (główny) | próbka (synonim policy) | **NEEDS OWNER DECISION** | Closeout UX: take→nagranie; równolegle próbka w replace/policy | recording+account+admin |
| T-A04 | `QUICK_TAKE` | „Szybkie nagranie” (`labelRecordingMode`) | **Szybkie nagranie** | Quick Take (EN brand) | **PROPOSED** (reuse helper) | Już w SSOT labels | user |
| T-A05 | `FULL_TAKE` | „Pełne nagranie” | **Pełne nagranie** | — | **PROPOSED** | Już w SSOT | user |
| T-A06 | `recording session` | sesja (błędy), „nagrywanie” | **sesja nagrywania** | — | **PROPOSED** | user-errors już używa „sesji nagrań” | errors |
| T-A07 | `Studio` (IA) | Studio, Twoje studio | **Studio** (brand) | Konto | **KEEP EN** | Świadoma zamiana Workspace→Studio; alias `/studio`→`/account` | nav+account |
| T-A08 | `Mix` | Mix, miks, Pro Mix | **Mix** (nazwa funkcji) · w zdaniu „miks” | Miks | **KEEP EN** (nazwa panelu) | Panel produktowy; zdania PL mogą używać „miks” | beat detail |
| T-A09 | `Master` (audio asset) | MASTER, Master podstawowy, audio MASTER | **Master** | plik master / master audio | **KEEP EN** | Termin audio; prior wyjątek; unikać SCREAMING w UI | admin+mix |
| T-A10 | `Render` | (głównie kod/błędy) | **render** / „eksport” gdy user-facing | — | **PROPOSED** user: **eksport** | Mix UI już „Eksport” | mix |
| T-A11 | `Export` | Eksport, eksportuję | **Eksport** | — | **PROPOSED** | Już PL w Mix | mix |
| T-A12 | `REC` | REC | **REC** | NAG | **KEEP EN** | Prior Rec; krótki wskaźnik stanu | recording |
| T-A13 | `podkład` | (rzadko w UI runtime) | nie wprowadzać jako synonim bitu | — | **TECHNICAL ONLY** / unikaj | BRAK WYSTARCZAJĄCEGO EVIDENCE w UI — nie promować | — |

**Decyzja blokująca P0:** T-A03 (nagranie vs próbka) — bez niej Wave C/admin Sample Policy nazwa będzie niestabilna.

### B. Konto / użytkownik / IA

| ID | Termin | Obecne | Proponowany | Rekomendacja | Uwagi |
|----|--------|--------|-------------|--------------|-------|
| T-B01 | `USER` (role) | Użytkownik (`labelSystemRole`) | **Użytkownik** | **PROPOSED** | reuse |
| T-B02 | `ADMIN` (role) | Administrator | **Administrator** | **PROPOSED** | chrome: „Panel Administracyjny”, nie raw `ADMIN` |
| T-B03 | `MODERATOR` | Moderator | **Moderator** | **PROPOSED** / KEEP form | już PL zapożyczenie |
| T-B04 | `ANONYMOUS` | gość, Gościnne nagranie, ANONYMOUS (admin) | **Gość** | **PROPOSED** | evidence recording; admin lists mapować |
| T-B05 | Guest (copy) | gość | **gość** | **PROPOSED** | = ANONYMOUS presentation |
| T-B06 | Profile | Profil (nav) | **Profil** | **PROPOSED** | sekcja w Studio (`#profil`), nie osobny produkt |
| T-B07 | Account | Konto, settings „Konto” | **Konto** | **PROPOSED** | ustawienia / bezpieczeństwo |
| T-B08 | Settings | Ustawienia | **Ustawienia** | **PROPOSED** | `/settings` |
| T-B09 | Library | Biblioteka | **Biblioteka** | **PROPOSED** | osobna powierzchnia `/library` |
| T-B10 | Studio vs Konto vs Profil vs Biblioteka | nakładające się | Studio = hub twórczy (`/account`); Profil = sekcja; Konto = ustawienia/tożsamość; Biblioteka = zbiory | **NEEDS OWNER DECISION** (potwierdzenie modelu) | nie zmieniać routów w POLISH-01 — tylko copy |

**Model IA (propozycja do zatwierdzenia, bez zmiany struktury):**

```text
Studio (/account, nav „Studio”)
  ├── Moje nagrania (/account/takes)
  ├── Moje bity (/account/beats)   ← po decyzji T-A02
  ├── Pobrania / eksporty
  └── Profil (sekcja #profil)

Biblioteka (/library) — skróty do zbiorów (może overlap — DF nie przebudowuje)

Konto / Ustawienia (/settings) — bezpieczeństwo, hasło, usuwanie
```

### C. Premium vs Account Level

| ID | Termin | Obecne UI | Proponowany label | Rekomendacja |
|----|--------|-----------|-------------------|--------------|
| T-C01 | Account Level (oś) | „poziom” implied via `labelAccountLevel` | nagłówek: **Poziom konta** | **PROPOSED** |
| T-C02 | `BEGINNER_RAPPER` | Początkujący raper | **Początkujący raper** | **PROPOSED** reuse |
| T-C03 | `PRO_RAPPER` | Pro raper | **Pro raper** | **PROPOSED** reuse |
| T-C04 | `LEGEND_RAPPER` | Legenda | **Legenda** | **PROPOSED** reuse |
| T-C05 | Premium (produkt) | Premium | **Premium** | **KEEP EN** |
| T-C06 | Premium Tier (oś) | kolumna „Premium” | nagłówek: **Plan Premium** | **PROPOSED** |
| T-C07 | `FREE` | Free (`labelPremiumTier`) | **Free** *lub* **Darmowy** | **NEEDS OWNER DECISION** |
| T-C08 | `BRONZE` | Bronze | **Bronze** *lub* **Brązowy** | **NEEDS OWNER DECISION** |
| T-C09 | `SILVER` | Silver | **Silver** *lub* **Srebrny** | **NEEDS OWNER DECISION** |
| T-C10 | `GOLD` | Gold | **Gold** *lub* **Złoty** | **NEEDS OWNER DECISION** |
| T-C11 | Creator Rank | Początkujący / Pro / … | bez zmian helpera | **PROPOSED** reuse; UI etykieta **Ranga** |

**Rekomendacja analityka (nie CLOSED):**
Opcja A — **KEEP EN Title Case** (`Free`/`Bronze`/`Silver`/`Gold`) przez `labelPremiumTier`: zgodne z prior epic + OD-08 nazewnictwem planów; unika mylenia z Account Level PL.
Opcja B — pełna polonizacja (`Darmowy`/`Brązowy`/…).

**Blokuje Wave D Premium labels.** W obu opcjach: **nigdy** raw `FREE`/`GOLD` w UI; zawsze helper.

### D. Statusy

| ID | Enum | Obecny label | Proponowany | Rekomendacja |
|----|------|--------------|-------------|--------------|
| T-D01 | Beat `DRAFT` | Szkic | **Szkic** | **PROPOSED** |
| T-D02 | Beat `PENDING_REVIEW` | Do moderacji / W moderacji | **jedna forma** | **NEEDS OWNER DECISION** |
| T-D03 | Beat `APPROVED` | Zaakceptowany | **Zaakceptowany** | **PROPOSED** |
| T-D04 | Beat `REJECTED` | Odrzucony | **Odrzucony** | **PROPOSED** |
| T-D05 | Beat `PUBLISHED` | Opublikowany | **Opublikowany** | **PROPOSED** |
| T-D06 | Beat `ARCHIVED` | Zarchiwizowany | **Zarchiwizowany** | **PROPOSED** |
| T-D07 | Take `READY` | Gotowe | **Gotowe** | **PROPOSED** — nie pokazywać `READY` |
| T-D08 | Take `PENDING_UPLOAD` | W trakcie | **W trakcie** | **PROPOSED** |
| T-D09 | Take `FAILED` | Nieudane | **Nieudane** | **PROPOSED** |
| T-D10 | Take `EXPIRED` | Wygasło | **Wygasło** | **PROPOSED** |
| T-D11 | Take `DELETED` | Usunięte | **Usunięte** | **PROPOSED** |
| T-D12 | Audio ready bool | Gotowy / Brak audio | **Gotowy** / **Brak audio** | **PROPOSED** (`labelAudioReady`) |
| T-D13 | UI phases PROCESSING/UPLOADING | Finalizacja… / Przesyłanie… | bez zmian | **PROPOSED** — już PL |
| T-D14 | `ACTIVE` (ogólne) | — | nie wprowadzać ogólnego labela bez kontekstu | **TECHNICAL ONLY** |

**Rekomendacja analityka dla T-D02:** **W moderacji** (stan bieżący) vs **Do moderacji** (kolejka). Evidence: moderation page tytuł „W moderacji”. Preferencja analityka: **W moderacji** — **nie CLOSED**.

### E. Ownership / role w kontekście beatu

| ID | Termin | Obecne | Proponowany | Rekomendacja |
|----|--------|--------|-------------|--------------|
| T-E01 | `PLATFORM` | PLATFORM, bit platformowy | **bit platformowy** / **Platforma** | **PROPOSED** |
| T-E02 | `USER` (ownership) | USER raw | **bit użytkownika** / **Użytkownik** | **PROPOSED** |
| T-E03 | `OWNER` | (kod) | **właściciel** gdy UI | **PROPOSED** |
| T-E04 | public/private | (głównie kod) | **publiczny** / **prywatny** gdy UI | **PROPOSED** jeśli pojawi się copy |

### F. Publikacja / moderacja

| ID | Termin | Obecne | Proponowany | Rekomendacja |
|----|--------|--------|-------------|--------------|
| T-F01 | Publish | Publikuj / Opublikowano | **Publikuj** | **PROPOSED** |
| T-F02 | Published | Opublikowany | **Opublikowany** | **PROPOSED** |
| T-F03 | Publish gate messages | PL+EN mixed | pełne PL z labelami statusów/ownership | **PROPOSED** (implementacja Wave B) |
| T-F04 | Moderation | Moderacja | **Moderacja** | **PROPOSED** |
| T-F05 | Reject | Odrzucony / Odrzucenie | **Odrzuć** / **Odrzucony** | **PROPOSED** |
| T-F06 | Draft | Szkic | **Szkic** | **PROPOSED** |

### G. Formaty / jakość

| ID | Termin | Rekomendacja |
|----|--------|--------------|
| T-G01 | MP3 / WAV / HQ / BPM | **KEEP EN** — nie tłumaczyć |
| T-G02 | Master (plik) | **KEEP EN** (T-A09) |
| T-G03 | Original | **oryginał** gdy UI o pobraniu bitu | **PROPOSED** |
| T-G04 | Preview | **podgląd** | **PROPOSED** (już w UI) |
| T-G05 | Full track | unikać; używać **cały bit** / **pełna długość** | **PROPOSED** jeśli potrzeba |

---

## 4. ADMIN TERMINOLOGY

| Termin techniczny / EN UI | Oficjalny label PL (propozycja) | Status |
|---------------------------|----------------------------------|--------|
| Admin (chrome) | **Panel Administracyjny** | PROPOSED |
| Admin (role) | **Administrator** | PROPOSED (`labelSystemRole`) |
| User (role/ownership) | **Użytkownik** | PROPOSED |
| Moderator | **Moderator** | PROPOSED |
| Beat | **bit** | PROPOSED |
| Platform beats | **Bity platformy** | PROPOSED (nav już „Bity”) |
| User beats | **Bity użytkowników** | PROPOSED |
| Sample Policy / Sample Recording Policy | **Polityka próbek** *lub* **Polityka nagrań** | **NEEDS OWNER DECISION** (zależne od T-A03) |
| Recording Policy (synonim) | nie używać równolegle — alias do powyższego | PROPOSED |
| Admin overrides (max duration) | **Nadpisania administratora (maksymalny czas trwania)** | PROPOSED |
| max duration (s) | **maksymalny czas trwania (s)** | PROPOSED |
| Globally technical limit / global max | **Globalny limit techniczny** | PROPOSED |
| Settings | **Ustawienia** | PROPOSED |
| Moderation | **Moderacja** | PROPOSED |
| Publish | **Publikuj** | PROPOSED |
| Draft | **Szkic** | PROPOSED |
| Ready (take/audio) | **Gotowe** / **Gotowy** (audio) | PROPOSED |
| Approved | **Zaakceptowany** | PROPOSED |
| Rejected | **Odrzucony** | PROPOSED |
| Status | **Status** (+ wartość z label helper) | PROPOSED |
| Owner | **Właściciel** | PROPOSED |
| Actions | **Akcje** | PROPOSED |
| Save | **Zapisz** | PROPOSED |
| Delete | **Usuń** | PROPOSED |
| Restore | **Przywróć** | PROPOSED |
| Export (ops) | **Eksport** (ops) | PROPOSED |
| Download | **Pobierz** | PROPOSED |
| ANONYMOUS (policy row) | **Gość** | PROPOSED |
| FREE/BRONZE/… (policy) | przez `labelPremiumTier` | zależne T-C07–10 |
| SAMPLE_POLICY_UPDATE (audit) | **Aktualizacja polityki próbek/nagrań** | PROPOSED (po T-A03) |
| MASTER audio heading | **Audio Master** (Title Case, nie SCREAMING) | PROPOSED KEEP EN word |

---

## 5. Błędy — stan i kierunek

### Już PL (reuse)
Większość ścieżek w `user-errors.ts`: auth, limity nagrań, mikrofon, download, Premium capability, itp.

### EN residual (nie zmieniać teraz — lista do Wave)
- Fallbacki w `recording-panel`: `Upload/finalize failed.`, `Replace failed.`
- Constant `USER beats cannot publish from DRAFT.`
- Mieszane `PUBLISH_*` w `admin-publish.ts`
- API fallbacki EN (OK jeśli UI zawsze mapuje)

### Terminy centralne w błędach (propozycja spójności po T-A03)
- limit slotów: albo zawsze **próbka**, albo zawsze **nagranie** (dziś: „limit próbek” vs „nagranie nie należy”)
- gość: **gość** / **Gościnne nagranie**
- Premium: zostawić słowo **Premium**

---

## 6. PROPOSED BITRYMDYM POLISH UI GLOSSARY

| Termin techniczny | Oficjalny label PL | Status decyzji | Uwagi |
|-------------------|--------------------|----------------|-------|
| beat | bit | PROPOSED | domyślny rzeczownik katalogu |
| beat (user upload list) | moje bity | NEEDS OWNER DECISION | dziś „Moje utwory” |
| take / sample (user noun) | nagranie | NEEDS OWNER DECISION | konflikt z „próbka”; closeout UX faworyzuje nagranie |
| sample (policy/admin name) | Polityka próbek / Polityka nagrań | NEEDS OWNER DECISION | zależne od noun |
| QUICK_TAKE | Szybkie nagranie | PROPOSED | `labelRecordingMode` |
| FULL_TAKE | Pełne nagranie | PROPOSED | |
| recording session | sesja nagrywania | PROPOSED | |
| Studio | Studio | KEEP EN | brand IA |
| Mix (feature name) | Mix | KEEP EN | w zdaniu: miks |
| Master (audio) | Master | KEEP EN | UI Title Case, nie MASTER |
| Pro Mix / Pro Master | Pro Mix / Pro Master | KEEP EN | produkt |
| Render (user) | eksport | PROPOSED | |
| Export | Eksport | PROPOSED | |
| REC | REC | KEEP EN | |
| podkład | — | TECHNICAL ONLY | nie promuj w UI |
| USER (role) | Użytkownik | PROPOSED | |
| ADMIN (role) | Administrator | PROPOSED | |
| ADMIN (chrome) | Panel Administracyjny | PROPOSED | nie raw ADMIN |
| MODERATOR | Moderator | PROPOSED | |
| ANONYMOUS | Gość | PROPOSED | |
| Profile | Profil | PROPOSED | sekcja |
| Account | Konto | PROPOSED | |
| Settings | Ustawienia | PROPOSED | |
| Library | Biblioteka | PROPOSED | |
| Account Level (axis label) | Poziom konta | PROPOSED | |
| BEGINNER_RAPPER | Początkujący raper | PROPOSED | |
| PRO_RAPPER | Pro raper | PROPOSED | |
| LEGEND_RAPPER | Legenda | PROPOSED | |
| Premium | Premium | KEEP EN | |
| Premium Tier (axis label) | Plan Premium | PROPOSED | |
| FREE | Free **lub** Darmowy | NEEDS OWNER DECISION | dziś Free |
| BRONZE | Bronze **lub** Brązowy | NEEDS OWNER DECISION | |
| SILVER | Silver **lub** Srebrny | NEEDS OWNER DECISION | |
| GOLD | Gold **lub** Złoty | NEEDS OWNER DECISION | |
| Creator Rank (axis) | Ranga | PROPOSED | |
| DRAFT | Szkic | PROPOSED | |
| PENDING_REVIEW | W moderacji **lub** Do moderacji | NEEDS OWNER DECISION | scalić SSOT |
| APPROVED | Zaakceptowany | PROPOSED | |
| REJECTED | Odrzucony | PROPOSED | |
| PUBLISHED | Opublikowany | PROPOSED | |
| ARCHIVED | Zarchiwizowany | PROPOSED | |
| READY (take) | Gotowe | PROPOSED | |
| PENDING_UPLOAD | W trakcie | PROPOSED | |
| FAILED | Nieudane | PROPOSED | |
| EXPIRED | Wygasło | PROPOSED | |
| DELETED | Usunięte | PROPOSED | |
| audio ready true/false | Gotowy / Brak audio | PROPOSED | |
| PLATFORM | bit platformowy | PROPOSED | |
| USER ownership | bit użytkownika | PROPOSED | |
| Publish | Publikuj | PROPOSED | |
| Moderation | Moderacja | PROPOSED | |
| MP3 / WAV / HQ / BPM | (bez zmian) | KEEP EN | |
| Preview | podgląd | PROPOSED | |
| Original (download) | oryginał | PROPOSED | |
| Sample Policy page | Polityka … | NEEDS OWNER DECISION | |
| max duration | maksymalny czas trwania | PROPOSED | |
| global technical limit | Globalny limit techniczny | PROPOSED | |
| SAMPLE_POLICY_UPDATE | Aktualizacja polityki … | PROPOSED | brak w helperze dziś |
| ACTIVE (generic) | — | TECHNICAL ONLY | |
| RPC / OWNER_ID / enum raw | — | TECHNICAL ONLY | nigdy raw w UI |

---

## 7. Decyzje — priorytety Ownera

### P0 — blokują spójną implementację POLISH-01

| Decyzja | Opcje | Preferencja analityka (nie CLOSED) |
|---------|-------|-------------------------------------|
| **OD-PL-01** nagranie vs próbka | A) zawsze **nagranie** B) zawsze **próbka** C) nagranie=user noun, próbka=policy synonym | A lub C |
| **OD-PL-02** nazwa admin policy | Polityka próbek / Polityka nagrań | zależy od OD-PL-01 |
| **OD-PL-03** Premium tier display | A) Free/Bronze/Silver/Gold B) Darmowy/Brązowy/Srebrny/Złoty | A (zgodność z prior epic + plany EN) |
| **OD-PL-04** PENDING_REVIEW label | W moderacji / Do moderacji | W moderacji |
| **OD-PL-05** Studio KEEP EN | TAK / zmienić na Konto w nav | TAK KEEP EN |
| **OD-PL-06** MASTER KEEP EN | TAK Title Case / tłumaczyć | TAK KEEP EN |

### P1 — ważne, można domknąć przy implementacji Wave

- OD-PL-07: „Moje utwory” → „Moje bity”?
- OD-PL-08: potwierdzenie modelu Studio / Profil / Konto / Biblioteka (copy only)
- OD-PL-09: Pro Mix / Pro Master KEEP EN (rekomendacja: TAK)
- OD-PL-10: REC KEEP EN (rekomendacja: TAK)
- OD-PL-11: scalenie `status-labels.ts` → re-export z `labels.ts`

### P2 — kosmetyczne

- „Nagraj nagranie” → „Nagraj” / „Nagraj próbkę/nagranie”
- usunięcie „V1” z copy gościa
- TTL → „czas życia”
- aria „utwór” → „bit”

---

## 8. Duplikaty SSOT — plan (bez implementacji)

| Problem | Ryzyko scalenia | Plan po GO |
|---------|-----------------|------------|
| `labelBeatStatus` vs `beatStatusLabelPl` | średnie — testy community-wave3 asercjąją „W moderacji” | wybrać OD-PL-04; jeden switch w `labels.ts`; `status-labels` re-export + `canUserEditBeatStatus` zostaje |
| brak `labelOwnershipType` / `labelSamplePolicyActor` | niski | dodać do `labels.ts` (nie nowy plik słownika) |
| `labelPremiumTier` EN vs nowe wymaganie PL | wysokie (admin+user) | tylko po OD-PL-03 |

---

## 9. Ryzyko migracji labeli

| Zmiana | Impact | Ryzyko |
|--------|--------|--------|
| Premium tier PL | wszystkie selecty/admin/users | wysokie |
| nagranie↔próbka globalnie | recording, errors, account, admin policy | wysokie |
| PENDING_REVIEW unify | admin+account+moderation+testy | średnie |
| Studio rename | nav IA | bardzo wysokie — nie rekomendowane w POLISH-01 |
| Sample Policy copy-only | admin | niskie — Wave A |

---

## 10. Kolejność implementacji (po Owner GO na DF)

1. Owner zatwierdza OD-PL-01…06 (minimum).
2. **Wave A** — admin Sample Policy + nav (P0 copy) — **TAK, jeśli OD-PL-02 znane** (nawet przy otwartym OD-PL-03).
3. Wave B — publish gates + status labels + ownership labels.
4. Wave C — recording residual (READY/Beat/fallbacki).
5. Wave D — `labelPremiumTier` + audit action + dedupe status SSOT.
6. Wave E — terminologia nagranie/próbka + IA copy (po OD-PL-01/07/08).

### Czy po Owner GO można rozpocząć Wave A?

**TAK**, po zatwierdzeniu co najmniej:
- OD-PL-02 (nazwa strony policy),
- oraz kierunku OD-PL-01 (nawet wariant C: policy=próbki, user=nagranie),
- KEEP EN dla Studio/Master nie blokuje Wave A.

Wave A **nie wymaga** domknięcia Premium tier PL (pola mogą chwilowo zostać Free/Bronze… jeśli OD-PL-03 otwarte — wtedy Wave A tylko copy EN→PL wokół „max duration” / „Admin overrides” / tytuł).

---

## 11. Domknięcie

```text
POLISH-01 DESIGN FREEZE     = CLOSED / PRODUCTION VERIFIED
OD-PL-01…06                 = LOCKED
IMPLEMENTATION              = 579acb3
RESIDUAL HOTFIX             = 1c63080
PRODUCTION DEPLOY           = dpl_2YVDSYPXsmrmx9hxQiF9X6AgVRQP
PRODUCTION VERIFY           = GREEN WITH NOTES
KNOWN WAIVER                = e3-7-f EXPORT_WAV · PRE-EXISTING / WAIVED
NEXT PRODUCT GATE           = P3 READ-ONLY AUDIT (nie część POLISH-01)
```

**POLISH-01 — CLOSED / PRODUCTION VERIFIED.** Residual hotfix na produkcji. Nie reopen bez nowego evidence.
