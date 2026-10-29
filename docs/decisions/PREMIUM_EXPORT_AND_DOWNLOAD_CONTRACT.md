# PREMIUM EXPORT & DOWNLOAD CONTRACT

**Status:** OWNER DECISION FREEZE **v3** — documentation SSOT (this document)
**Accepted core:** 2026-10-21 — OD-EXPORT-01…15 (v2 credit model retained)
**v3 Owner decisions:** 2026-10-21 — **D-1** WAV ladder · **D-2** WORK_READY / R1 · **D-3** plan-change sticky unlock · **D-4** SFM remains separate
**Type:** PRODUCT / ARCHITECTURE CONTRACT — **NO IMPLEMENTATION IN THIS DOCUMENT**
**Owner:** Prezes Dawid
**Canonical SSOT for:** Premium comparison UI · purchase copy · lock messages · credits · retention · server entitlement/retention contract

```text
OWNER ACCEPTED: OD-EXPORT-01…15 + D-1…D-4 (this document, 2026-10-21)
IMPLEMENTATION / MIGRATION / PROD / VPS / BILLING / UI / API / SQL: NOT AUTHORIZED
≠ commit / push / deploy / PR
DECISION_LOG.md / OPEN_DECISIONS.md: NOT UPDATED (dirty local WIP — §14)
```

**Related (do not silently cancel without Owner GO):**

- [W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md](./W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md) — OD-08 tiers
- [W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md](./W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md) — beat downloads / render caps (**≠** track-unlock credits)
- [STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md](./STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md) — **OD-SFM-07** (SFM-only ladder; still ACCEPTED; **not** superseded by D-1…D-4)
- [STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md](./STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md) — documents `AUDIO_CODEC` WAV **44100 / 16-bit / stereo** as EXISTS in code
- [STUDIO_MIX_WORKING_PLANE_DESIGN_FREEZE.md](./STUDIO_MIX_WORKING_PLANE_DESIGN_FREEZE.md)
- [CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md](./CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md)

**Supersedes (interpretation only):** v1 „shared file-transfer download pool”. **v2/v3:** **1 / 2 / 4** = weekly **track-unlock credits**, not transfer counts.

---

## 1. Status dokumentu i granica autoryzacji

| Tag | Znaczenie |
|-----|-----------|
| `OWNER-ACCEPTED` | Decyzja Ownera zamrożona |
| `OPEN DECISION` | Wymaga decyzji; nie domniemywać |
| `PROPOSED — OWNER DECISION REQUIRED` | Rekomendacja architekta — **nie** zatwierdzona |
| `REJECTED` | Alternatywa rozważona i odrzucona przez Ownera |
| `CURRENT IMPLEMENTATION` | Stan kodu / docs — ≠ target |
| `NOT IMPLEMENTED` | Brak względem kontraktu docelowego |
| `NOT VERIFIED` | Brak dowodu (ops/prod/chroniony plik) |

Ten dokument **nie** autoryzuje implementacji, migracji, produkcji, commitów ani deployów.
Decyzja dokumentacyjna **≠** dowód wdrożenia w schemacie, kodzie, Storage ani billing.

---

## 2. Kredyt vs pobranie vs jakość vs retencja

| Pojęcie | Znaczenie | Zużywa kredyt? |
|---------|-----------|----------------|
| **Kredyt odblokowania** | Tygodniowa pula; 1 kredyt → 1 utwór; max 1×/utwór | Tak (przy unlock) |
| **Pobranie pliku** | RAW / MIX / MASTER w jednej jakości | Nie (po unlock) |
| **Uprawnienie do jakości** | Czy **aktualny** pakiet pozwala na format (OD-EXPORT-06 + D-3) | Nie |
| **Retencja** | Termin istnienia utworu + powiązanych plików (`retention_expires_at`) | Odnowienie przy unlock |

```text
WRONG: Bronze=1 download transfer · Silver=2 · Gold=4
RIGHT: Bronze=1 unlock/week · Silver=2 · Gold=4; downloads unlimited within rights + retention
```

---

## 3. Zamrożone decyzje właściciela (OD-EXPORT-01…15)

*Nie zmieniać znaczenia. Data: 2026-10-21.*

| ID | Status | Skrót |
|----|--------|-------|
| OD-EXPORT-01 | OWNER-ACCEPTED | Pakiety różnią się jakością i kredytami |
| OD-EXPORT-02 | OWNER-ACCEPTED | 1 kredyt = 1 utwór; multi download |
| OD-EXPORT-03 | OWNER-ACCEPTED | FREE: odsłuch OK; download deny; UX „Pobierz” + kłódki |
| OD-EXPORT-04 | OWNER-ACCEPTED | MP3 128/192/256/320; 3×WAV GOLD; Master WAV **24-bit/48 kHz** (najwyższa) |
| OD-EXPORT-05 | OWNER-ACCEPTED | Decyzja ≠ wdrożenie |
| OD-EXPORT-06 | OWNER-ACCEPTED | FREE none · BRONZE 128 · SILVER 128/192/256 · GOLD 128–320 + 3×WAV |
| OD-EXPORT-07 | OWNER-ACCEPTED | Kredyt wspólny (nie per RAW/MIX/MASTER) |
| OD-EXPORT-08 | OWNER-ACCEPTED | Kredyty **0/1/2/4** · **7 dni od aktywacji** (nie tydzień kalendarzowy) |
| OD-EXPORT-09 | OWNER-ACCEPTED | FREE retencja **7 dni** od „gotowy”; bez download |
| OD-EXPORT-10 | OWNER-ACCEPTED | BRONZE **7 dni**; unlock → pełne 7 od unlock |
| OD-EXPORT-11 | OWNER-ACCEPTED | SILVER **14 dni**; unlock → pełne 14 od unlock |
| OD-EXPORT-12 | OWNER-ACCEPTED | GOLD **28 dni**; unlock → pełne 28 od unlock |
| OD-EXPORT-13 | OWNER-ACCEPTED | Max 1 unlock/utwór; brak po TTL |
| OD-EXPORT-14 | OWNER-ACCEPTED | Trwałe usunięcie po TTL; brak recovery |
| OD-EXPORT-15 | OWNER-ACCEPTED | **Ten plik** = jedyny SSOT Premium |

Szczegóły semantyczne (UX FREE, renew przykład BRONZE, zakaz drugiego kredytu) — bez zmian względem freeze v2.

### 3.1. Decyzje Ownera v3 (2026-10-21) — D-1…D-4

| ID | Status | Zamyka / dotyczy | Skrót |
|----|--------|------------------|-------|
| **D-1** | OWNER-ACCEPTED | OD-EXPORT-OPEN-WAV-PARAMS | Exact 3×WAV GOLD: COMPAT / PRO / MASTER (§6) |
| **D-2** | OWNER-ACCEPTED | OD-EXPORT-OPEN-READY-DEFINITION | R1: `WORK_READY` + jeden `retention_expires_at` (§7) |
| **D-3** | OWNER-ACCEPTED | OD-EXPORT-OPEN-PLAN-CHANGE (+ CROSS-TIER) | Unlock sticky · quality live · retention not shortened (§8) |
| **D-4** | OWNER-ACCEPTED | zakres OD-EXPORT-OPEN-SFM07-RECONCILE (częściowo) | SFM pozostaje osobno; OD-SFM-07 niezmienione; konsolidacja = przyszły audyt (§9) |

---

## 4. Tabela pakietów (zatwierdzona)

| Pakiet | MP3 download | WAV | Kredyty / 7 dni od aktywacji | Retencja od `WORK_READY` | Odblokowanie odnawia |
|--------|--------------|-----|------------------------------|--------------------------|----------------------|
| FREE | — | — | **0** | **7 dni** | n/a |
| BRONZE | **128** | — | **1** | **7 dni** | pełne **7** od unlock |
| SILVER | **128, 192, 256** | — | **2** | **14 dni** | pełne **14** od unlock |
| GOLD | **128, 192, 256, 320** | **WAV_COMPAT · WAV_PRO · WAV_MASTER** | **4** | **28 dni** | pełne **28** od unlock |

WAV poniżej GOLD: **nie** — bez nowej decyzji Ownera.

---

## 5. AuthZ (docelowe) i UX

**Kontrole:** (A) generate/render · (B) track unlock · (C) quality entitlement (aktualny pakiet — D-3) · (D) retention/existence.
Backend przy mint URL; UI nie jest AuthZ; signed URL TTL ≠ revoke instant.

**UX (OD-EXPORT-03):** jak v2 — „Pobierz” widoczne w FREE → typ → jakości z kłódkami → unlock (płatni) → multi download → countdown → delete.

Sprzedaż dodatkowych kredytów: **OPEN DECISION**.

---

## 6. Trzy jakości WAV — **D-1 OWNER-ACCEPTED** (2026-10-21)

### 6.1. Wymagania produktowe (zatwierdzone)

| ID | Parametry (PCM) | Status produktowy | Status implementacji |
|----|-----------------|-------------------|----------------------|
| **WAV_COMPAT** | **16-bit / 44,1 kHz / stereo** | `OWNER-ACCEPTED` (D-1) | Zbliżone do `CURRENT IMPLEMENTATION` (16/44.1); pełna egzekucja jako wariant kontraktu `NOT VERIFIED` / osobne GO |
| **WAV_PRO** | **24-bit / 44,1 kHz / stereo** | `OWNER-ACCEPTED` (D-1) | `NOT IMPLEMENTED` |
| **WAV_MASTER** | **24-bit / 48 kHz / stereo** | `OWNER-ACCEPTED` (D-1; też OD-EXPORT-04 najwyższa) | `NOT IMPLEMENTED` |

To są **zatwierdzone wymagania produktowe** dla GOLD.
**Nie** twierdzić, że kod już generuje wszystkie trzy jakości. Audyt docs wskazywał obecny encode WAV jako **16-bit / 44,1 kHz**; **24/44.1** i **24/48** wymagają osobnej implementacji i weryfikacji.

### 6.2. Historia / odrzucone alternatywy

| Alternatywa | Status |
|-------------|--------|
| WAV_PRO = 16-bit / 48 kHz (dawna Alternatywa B) | `REJECTED` (2026-10-21) — Owner wybrał **24-bit / 44,1 kHz** |
| Exact params „TBD” / `PROPOSED` dla COMPAT/PRO | **zamknięte** przez D-1 |

Cryo Mix „inspiracja”: wzmianka produktowa; **brak** formalnej tabeli Cryo w repo jako SSOT — `NOT VERIFIED` jako niezależna spec.

### 6.3. Konsekwencje (nie wdrożenie)

| Kryterium | Uwaga |
|-----------|--------|
| Stopniowanie | 16/44.1 → 24/44.1 → 24/48 |
| Multi-render | Trzy encode z jednego bake — koszt CPU; cache per quality + idempotency przy Implementation GO |
| QC | QC per wariant (SR/bit-depth/channels); obecny `qcWavBytes` twardo 16/44.1 → wymaga zmiany przy GO |
| SFM | **D-4:** ta tabela **nie** zmienia kontraktu SFM |

**Nie wdrażać** encode/QC w tym etapie dokumentacyjnym.

---

## 7. Definicja „utwór gotowy” — **D-2 OWNER-ACCEPTED** (R1, 2026-10-21)

Retencja (OD-EXPORT-09…12) zaczyna się, gdy utwór przechodzi do trwałego stanu **`WORK_READY`**.

### 7.1. Kontrakt R1 (zatwierdzony)

| Reguła | Znaczenie | Status |
|--------|-----------|--------|
| Jeden moment kanoniczny | **`WORK_READY`** | `OWNER-ACCEPTED` (D-2) |
| Jeden znacznik | **`retention_expires_at`** na tożsamość utworu (work) | `OWNER-ACCEPTED` (D-2) |
| Start retencji | Od przejścia utworu do trwałego `WORK_READY` | `OWNER-ACCEPTED` (D-2) |
| Tip / edycja parametrów | **Nie** uruchamia nowego okresu retencji | `OWNER-ACCEPTED` (D-2) |
| FAILED / nieudany render | **Nie** startuje ani samodzielnie nie odnawia retencji | `OWNER-ACCEPTED` (D-2) |
| Unlock kredytem | Może **odnowić** retencję do pełnego okresu pakietu (OD-EXPORT-10…12) | `OWNER-ACCEPTED` |
| Konkurencyjne definicje „gotowości” | **Zakazane** — jedna definicja R1 | `OWNER-ACCEPTED` (D-2) |

**Implementacja:** `WORK_READY` i `retention_expires_at` jako pola/schemat/kod — `NOT IMPLEMENTED` (dokumentacja tylko). Nie twierdzić, że istnieją w bazie.

**Semantyka startu `WORK_READY` (produktowa, bez kodu):** pierwsze zdarzenie, w którym utwór staje się **trwałym produktem użytkownika** (np. ścieżka „zapisz / gotowe do pobrania” **lub** pierwsze pojawienie się downloadable-capable artefaktu RAW/MIX/MASTER), z wyłączeniem draftów efemerycznych. FREE: ten sam start zegara; download nadal deny (OD-EXPORT-03/09).

### 7.2. Historia — opcje nierozstrzygnięte wcześniej

| Opcja | Opis | Status po D-2 |
|-------|------|---------------|
| **R1** | Jeden `WORK_READY` + jeden `retention_expires_at` | **OWNER-ACCEPTED** |
| **R2** | Start wyłącznie po pierwszym MASTER READY | `REJECTED` (2026-10-21) — historycznie rozważana |
| **R3** | Start po OD-SFM-09 Accept | `REJECTED` (2026-10-21) — historycznie rozważana |

### 7.3. Stany (orientacja; nie mnożyć definicji)

| Stan | Wpływ na retencję (R1) |
|------|------------------------|
| Tip edit / param change | Nie startuje nowego okresu |
| Render FAILED / CANCELLED | Nie startuje / nie renew samodzielnie |
| Unlock | Renew pełnego okresu pakietu (jeśli już `WORK_READY`) |
| Brak MASTER | Nie blokuje `WORK_READY` (FREE ma retencję bez download) |

---

## 8. Zmiana pakietu — **D-3 OWNER-ACCEPTED** (2026-10-21)

### 8.1. Cztery pojęcia (nie mylić)

1. Rekord **unlock** (kredyt zużyty, max 1×).
2. **Uprawnienie jakości** (**aktualny** effective tier przy mint).
3. **Retencja** (`retention_expires_at`) — **nie skracana** przy downgrade/expiry.
4. **Istnienie plików** w Storage — brak early delete przed TTL.

### 8.2. Polityka zatwierdzona

Nazwa: **„Unlock sticky · quality according to current package · retention not shortened.”**

| # | Reguła | Status |
|---|--------|--------|
| 1 | Skuteczne odblokowanie pozostaje przypisane do utworu; kolejne pobrania **nie** zużywają kredytu | `OWNER-ACCEPTED` (D-3 + OD-EXPORT-02) |
| 2 | Dostępne jakości sprawdzane wg **aktualnego** pakietu przy tworzeniu nowego linku pobierania | `OWNER-ACCEPTED` (D-3) |
| 3 | Upgrade może udostępnić dodatkowe jakości **bez** ponownego unlock | `OWNER-ACCEPTED` (D-3) |
| 4 | Downgrade / wygaśnięcie Premium może ograniczyć jakości/pobieranie wg bieżącego pakietu, ale **nie skraca** ustalonego `retention_expires_at` | `OWNER-ACCEPTED` (D-3) |
| 5 | Retencja **≠** automatyczne prawo do pobierania po wygaśnięciu Premium (FREE = deny download) | `OWNER-ACCEPTED` (D-3 + OD-EXPORT-03) |
| 6 | Brak usuwania plików przed zatwierdzonym terminem retencji (delete dopiero po TTL — OD-EXPORT-14) | `OWNER-ACCEPTED` (D-3) |

### 8.3. Scenariusze (zastosowanie D-3)

| Scenariusz | Unlock | Jakości przy mint | Pliki / retencja |
|------------|--------|-------------------|------------------|
| Gold→Bronze | sticky do TTL | re-check Bronze | brak early delete; TTL nie skracany |
| Silver→Bronze | sticky | re-check Bronze | j.w. |
| Bronze→Silver/Gold | sticky | nowe jakości OK bez nowego kredytu | TTL nie skracany |
| Wygaśnięcie Premium → FREE | sticky do TTL | deny download (jak FREE) | TTL biegnie; delete po TTL |
| Rebuy Premium | stare unlocki wg polityki sticky | wg nowego tieru | — |
| Unlock bez pełnego RAW/MIX/MASTER | unlock OK | generate wg **aktualnego** pakietu | nie zużywa 2. kredytu |

### 8.4. Historia — odrzucona alternatywa

| Alternatywa | Status |
|-------------|--------|
| „Grandfather quality at unlock” (jakości z chwili unlock do TTL) | `REJECTED` (2026-10-21) — Owner wybrał **quality live** (aktualny pakiet) |

**Implementacja** downgrade/upgrade/expiry AuthZ: `NOT IMPLEMENTED` w tym etapie.

---

## 9. Reconciliation z OD-SFM-07 — **D-4 OWNER-ACCEPTED** (SFM osobno, 2026-10-21)

### 9.1. Decyzja D-4 (zakres)

| Reguła | Status |
|--------|--------|
| SFM zachowuje **własną** macierz jakości, kredytów i reguł pobierania | `OWNER-ACCEPTED` (D-4) |
| Ta decyzja **nie** scala `PREMIUM_TIER_MATRIX` z `SFM_PLAN_MATRIX` | `OWNER-ACCEPTED` (D-4) |
| **OD-SFM-07** pozostaje **OWNER-ACCEPTED** w swoim zakresie; **nie** anulowane / nie zastąpione | `OWNER-ACCEPTED` (D-4) |
| Zgodność i ewentualna konsolidacja | Wymagają **osobnego audytu** + przyszłej decyzji Ownera — audyt SFM **nie** jest zakończony |
| Ten SSOT opisuje wymagania Premium; **nie** nadpisuje automatycznie reguł SFM | `OWNER-ACCEPTED` (D-4) |

### 9.2. Fakty porównawcze (bez scalania)

| | OD-SFM-07 (Product Contract Addendum) | OD-EXPORT-06 + D-1 (ten SSOT) |
|--|--------------------------------------|-------------------------------|
| Zakres | **Studio Final Mix / SFM** only | Ogólny produkt RAW/MIX/MASTER + kredyty |
| MP3 | 128 / 192 / **320** (brak 256) | 128 / 192 / **256** / 320 |
| SILVER | 128+192 | 128+192+**256** |
| WAV | Tak dla GOLD (params w addendum SFM — osobna domena) | 3×WAV GOLD (D-1); Master 24/48 |
| Limit | **Dzienne first-download grant** 0/1/2/5 (Warsaw) | **Tygodniowe kredyty unlock** 0/1/2/4 (od aktywacji) |
| Status | **OWNER-ACCEPTED** (SFM) | **OWNER-ACCEPTED** (Premium export) |

### 9.3. Ryzyka (nadal aktualne do przyszłego audytu)

- SILVER: SFM bez 256 vs Premium z 256.
- Limit: day-grant SFM vs week-unlock Premium.
- WAV: macierz SFM vs trzy jakości Premium GOLD (D-1).
- Macierze kodu już były niezależne (`CURRENT IMPLEMENTATION`).

### 9.4. Przyszły audyt konsolidacji (≠ zakończony)

Ścieżki A/B/C z v3 (SFM⊂EXPORT / mapowanie 1:1 / dual-write) pozostają materiałem do **przyszłego** docs-only amend **po** czystym WIP rejestrów.
**D-4** zamyka wyłącznie: **na teraz SFM pozostaje osobno**; nie zamyka pełnego audytu zgodności.

**Status:** D-4 `OWNER-ACCEPTED` · pełny reconcile/konsolidacja `OPEN DECISION` (OD-EXPORT-OPEN-SFM07-RECONCILE) · OD-SFM-07 nadal **ACCEPTED**.

---

## 10. Zgodność z istniejącym systemem

| Temat | Tag |
|-------|-----|
| `resolveProductEntitlement` / `premium_entitlements` | `CURRENT IMPLEMENTATION` |
| Billing / checkout | `NOT IMPLEMENTED` |
| Track-unlock credits ledger | `NOT IMPLEMENTED` |
| `WORK_READY` / `retention_expires_at` | Polityka OWNER-ACCEPTED (D-2); kod/schemat `NOT IMPLEMENTED` |
| Retention + unlock renew timers | Polityka OWNER-ACCEPTED; kod `NOT IMPLEMENTED` |
| Plan-change AuthZ (D-3) | Polityka OWNER-ACCEPTED; kod `NOT IMPLEMENTED` |
| Permanent delete pełny zakres | Polityka OWNER-ACCEPTED; ops `NOT VERIFIED` |
| WAV 16/44.1 encode+QC | `CURRENT IMPLEMENTATION` (≈ WAV_COMPAT target) |
| WAV_PRO 24/44.1 · WAV_MASTER 24/48 | `NOT IMPLEMENTED` |
| FREE download deny (wszystkie ścieżki) | Target OWNER-ACCEPTED; pełna egzekucja `NOT VERIFIED` |
| Beat `downloadsDaily` | Osobna pula |
| SFM matrices / OD-SFM-07 | Osobna domena (D-4); audyt konsolidacji nie zakończony |
| ARTIFACT playback stub | `NOT IMPLEMENTED` / `AUDIO_SOURCE_UNAVAILABLE` (audit) |

---

## 11. Bezpieczeństwo (docelowe)

1. Backend AuthZ unlock + download.
2. Brak client-supplied tier/credits.
3. Atomowy consume kredytu + idempotent unlock.
4. Private Storage + krótki signed URL.
5. Brak FREE bypass przez Storage URL.

---

## 12. Zależności przed implementacją

1. ~~Owner: WAV ladder~~ → **D-1 ACCEPTED**.
2. ~~Owner: definicja `WORK_READY`~~ → **D-2 ACCEPTED**.
3. ~~Owner: plan-change~~ → **D-3 ACCEPTED**.
4. Owner: pełny audyt SFM07 reconcile/konsolidacja (D-4: na razie osobno).
5. Model danych credits/unlock/`WORK_READY`/`retention_expires_at`.
6. Encode+QC per WAV variant (COMPAT/PRO/MASTER).
7. Janitor delete scope + kolejność.
8. UI Premium / Pobierz.
9. Sync `DECISION_LOG` / `OPEN_DECISIONS` gdy WIP czysty.
10. Osobne Implementation GO + prod GO.

---

## 13. Otwarte decyzje (lokalny rejestr SSOT)

| ID | Pytanie | Status |
|----|---------|--------|
| OD-EXPORT-OPEN-WAV-PARAMS | Exact 3×WAV | **CLOSED** → D-1 OWNER-ACCEPTED (2026-10-21) |
| OD-EXPORT-OPEN-WAV-LOWER-TIERS | WAV &lt; GOLD? | **OPEN** — na razie **nie** (OD-EXPORT-06) |
| OD-EXPORT-OPEN-SFM07-RECONCILE | Pełna konsolidacja SFM vs Premium | **OPEN** — D-4: na razie **osobno**; audyt nie zakończony; OD-SFM-07 ACCEPTED |
| OD-EXPORT-OPEN-READY-DEFINITION | „Gotowy” / R1 | **CLOSED** → D-2 OWNER-ACCEPTED (2026-10-21) |
| OD-EXPORT-OPEN-PLAN-CHANGE | Downgrade/upgrade/expiry | **CLOSED** → D-3 OWNER-ACCEPTED (2026-10-21) |
| OD-EXPORT-OPEN-CROSS-TIER-DOWNLOAD | Unlock A → plan B | **CLOSED** → objęte D-3 |
| OD-EXPORT-OPEN-EXTRA-CREDITS | Sprzedaż kredytów | **OPEN** |
| OD-EXPORT-OPEN-DELETE-SCOPE | Zakres delete | **OPEN** — przed janitor GO |
| OD-EXPORT-OPEN-EXPIRY-UX | Ostrzeżenia | **OPEN** |
| OD-EXPORT-OPEN-AUDIT-META | Meta po delete | **OPEN** |
| OD-EXPORT-OPEN-FAILED-RENDER | FAILED vs retencja | **CLOSED** (część D-2: nie startuje / nie renew samodzielnie) |
| OD-EXPORT-OPEN-UNLOCK-ELIGIBILITY | Unlock tylko gotowych? | **OPEN** — spójność z R1 do doprecyzowania przy Implementation design |
| OD-EXPORT-OPEN-LOCK-COPY | Copy kłódek | **OPEN** |

---

## 14. Rejestr decyzji — WIP

Dirty (nie edytowano w tym etapie): `DECISION_LOG.md`, `OPEN_DECISIONS.md`, `PROJECT_STATE.md`, `CHANGELOG.md`.
**SSOT Premium:** wyłącznie ten plik.
Synchronizacja rejestrów: **odroczona** (ochrona dirty WIP).
**Wykonanie logicznego usunięcia (fencing executora retention, G3-TCB / G4-L / D-LEASE):** [`PREMIUM_RETENTION_FENCING_CONTRACT.md`](PREMIUM_RETENTION_FENCING_CONTRACT.md). Dokument inżynierski podporządkowany temu SSOT; nie zmienia polityki retencji.

---

## 15. Podsumowanie

| Warstwa | Stan |
|---------|------|
| OD-EXPORT-01…15 | OWNER-ACCEPTED — zachowane |
| D-1 3×WAV exact | OWNER-ACCEPTED (2026-10-21); implementacja `NOT IMPLEMENTED` (poza ≈16/44.1) |
| D-2 `WORK_READY` / R1 | OWNER-ACCEPTED; schema/kod `NOT IMPLEMENTED` |
| D-3 plan-change | OWNER-ACCEPTED; kod `NOT IMPLEMENTED` |
| D-4 SFM osobno | OWNER-ACCEPTED; OD-SFM-07 ACCEPTED; konsolidacja OPEN |
| Implementacja | NOT AUTHORIZED |

**Explicit non-authorization:** This document does **not** authorize Implementation GO, credits ledger, retention/delete jobs, WAV encode changes, checkout, UI/API/SQL, production mutations, commits, pushes, or deploys.
