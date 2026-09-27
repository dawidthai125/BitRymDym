# RECORDING / QUICK TAKE — FINAL OWNER DECISION REVIEW

**Owner:** Prezes Dawid  
**Baseline:** `main` @ `c5e1f17` · Community EPIC CLOSED  
**Inputs:** Owner Decision Pack · Design Freeze Proposal · Cold-start Audit · SSOT §18–§24  

```text
STATUS                     = AWAITING OWNER CHOICES
IMPLEMENTATION             = NONE
SSOT / CODE / DB CHANGES   = NONE
COMMIT / PUSH / DEPLOY     = NONE
```

Owner zaznacza wybór w tabeli na końcu (kolumna **Owner Choice** pozostaje pusta do decyzji).

Architektura może wskazać, co jest prostsze technicznie — **nie wybiera za Ownera**.

---

## Priorytety

| Priorytet | IDs | Znaczenie |
|-----------|-----|-----------|
| **P0 — FREEZE BLOCKER** | D01 · D02 · D03 · D04 | Bez odpowiedzi nie LOCK Design Freeze v1.0 |
| **P1 — OWNER DECISION** | D05 · D06 · D07 · D08 | Potrzebne do pełnego freeze / Wave 3–4; część da się oznaczyć DEFERRED w freeze z jawnym „later” |

---

# P0 — FREEZE BLOCKERS

---

## D01

**TEMAT:** RECORD ≠ PLAYBACK / DOWNLOAD — osobne capability?

**CURRENT PROPOSAL:** Jedna warstwa Access / AuthZ (reuse Access Gate). Trzy capabilities: `PLAYBACK`, `DOWNLOAD`, `RECORD`. `RECORD` **nie** wynika automatycznie z pozostałych.

### OPTION A — Osobne capability RECORD

Osobna reguła `canRecord`. Shared grant może nadać np. tylko playback bez record.

**Konsekwencje:** Jasny model; shared beats kontrolowalne; brak sprzężenia z limitami pobrań (OD-05/06).

### OPTION B — RECORD wynika z PLAYBACK

Kto może odsłuchać, może nagrywać (nadal z entitlement limitem czasu).

**Konsekwencje:** Prostsze reguły; shared „tylko posłuchaj” niemożliwe bez blokady całego playback; szerszy attack/use surface.

### OPTION C — RECORD sprzężony z DOWNLOAD

Nagrywanie tylko gdy wolno pobrać beat (lub odwrotnie).

**Konsekwencje:** Miesza recording z daily download limits; ryzyko regresji Phase 1.8A; słaba semantyka produktowa.

**ARCHITECTURAL IMPACT:**  
A = rozszerzenie istniejącego Gate o trzecią capability (bez drugiego silnika).  
B = mniej pól w grantach, słabsza izolacja.  
C = kolizja z `src/config/downloads.ts` / OD-05/06/17.

**PRODUCT IMPACT:**  
A = „słucham ≠ nagrywam ≠ pobieram”.  
B = każdy publiczny odsłuch = prawo do QT (z limitem czasu).  
C = recording zależny od limitu pobrań dnia.

**FREEZE IMPACT:** **P0 BLOCKER** — semantyka całego modelu dostępu.

*Uwaga architekta (nie decyzja): A jest najprostsze do utrzymania z shared beats i bez ruszania downloadów.*

---

## D02

**TEMAT:** Anonymous Quick Take w V1?

**CURRENT PROPOSAL:** SSOT §20 dopuszcza anon QT „jeżeli ustawienia pozwalają”. Design Freeze nie zamyka V1. Przy anon: max **30 s** (jak standard QT), take tymczasowy, krótki serwerowy TTL, CTA Zaloguj / Załóż konto / Pobierz, brak trwałego konta.

### OPTION A — V1 tylko zalogowani

Anon QT poza pierwszym EPIC-em. BEGINNER+ od razu.

**Konsekwencje:** Mniejszy abuse; prostszy storage/session (owner_id zawsze); szybszy bezpieczny MVP.

### OPTION B — V1 z anon QT

Anon: 30 s, temporary take, signed upload + krótki TTL, identity token (wzorzec zbliżony do anon download), limity active/daily, janitor obowiązkowy, CTA po nagraniu.

**Konsekwencje:** Pełniejszy SSOT §20; większy threat model od Wave 1–3; więcej pracy ops (cleanup).

### OPTION C — Anon tylko lokalnie w przeglądarce (bez uploadu)

Brak serwerowego take.

**Konsekwencje:** Brak „zachowaj po odświeżeniu”; słaba wartość produktowa; prawie nie wymaga backendu QT.

**ARCHITECTURAL IMPACT:**  
A = jeden auth path.  
B = anon identity + PENDING TTL + janitor + capy od dnia 1.  
C = prawie zero backend take dla gościa.

**PRODUCT IMPACT:**  
A = test wokalu wymaga konta.  
B = viral test bez rejestracji.  
C = demo lokalne, nie platforma próbek.

**FREEZE IMPACT:** **P0 BLOCKER** — zakres V1 i threat model.

*Uwaga architekta: A najtańsze bezpiecznie; B OK jeśli priorytetem jest test bez konta.*

---

## D03

**TEMAT:** Shared beat + recording — kto może RECORD i czy shared jest w pierwszym EPIC?

**CURRENT PROPOSAL:** Public PUBLISHED najpierw; shared grants w późniejszej fali; grant z osobnymi flagami capabilities (zależnie od D01).

### Macierz ról × akcji (do wyboru modelu)

| Aktor | PLAYBACK (dziś / proponowane) | DOWNLOAD (dziś) | RECORD (proponowane — zależy od D01 + tej decyzji) |
|-------|-------------------------------|-----------------|-----------------------------------------------------|
| Public / anon na PUBLISHED | Tak (Gate) | Tak + limity OD-05 | Tylko jeśli entitlement + D01/D02 na to pozwolą |
| Zalogowany na PUBLISHED | Tak | Tak + OD-06 | Tak jeśli entitlement (QT/Full) |
| Owner własnego beatu | Własne stany (RLS) | Zależnie od statusu / Gate | Patrz **D06** |
| Shared user (grant) | **Brak dziś** → przyszły grant | Osobno (zwykle nie = public download) | **D03:** tak tylko z `record` na grancie (przy D01=A) |

```text
PLAYBACK  = odsłuch beatu (signed URL)
DOWNLOAD  = pobranie pliku beatu (limity dnia, OD-17 event)
RECORD    = utworzenie MIC TAKE na tym beat_id
```

Te trzy **nie są tym samym prawem** — o ile Owner wybierze D01=A.

### OPTION A — V1 = tylko PUBLISHED public; shared DEFERRED

Shared grants + RECORD w późniejszej fali (np. Wave 5).

**Konsekwencje:** Szybszy QT na katalogu; historia „producent udostępnia → nagrywam” czeka.

### OPTION B — Shared grants + RECORD w scope pierwszego EPIC

Grant domain + Gate RECORD w tym samym EPIC (przed lub równolegle z Full Take).

**Konsekwencje:** Spełnia Owner story wcześniej; większy scope (nowa domena dostępu).

### OPTION C — Shared user z jakimkolwiek dostępem ⇒ automatyczny RECORD

Bez osobnej flagi record na grancie.

**Konsekwencje:** Za szerokie; koliduje z D01=A; trudny least-privilege.

**ARCHITECTURAL IMPACT:**  
A = Gate V1 bez tabeli grantów.  
B = nowa domena grantów + te same capabilities co D01.  
C = uproszczenie grantów kosztem bezpieczeństwa.

**PRODUCT IMPACT:**  
A vs B = kolejność „katalog QT” vs „prywatny beat od producenta”.  
C = każdy shared słuchacz = rekorder.

**FREEZE IMPACT:** **P0 BLOCKER** — scope EPIC (IN vs DEFERRED shared).

*Uwaga architekta: A vs B to priorytet roadmapy; C niezalecane przy osobnym RECORD.*

---

## D04

**TEMAT:** PRO / LEGEND ↔ Premium — skąd bierze się Full Take?

**CURRENT PROPOSAL:** Nie wymyślać nowego systemu tożsamości. Istnieje: `BEGINNER_RAPPER` | `PRO_RAPPER` | `LEGEND_RAPPER` (ROLE ≠ ACCOUNT LEVEL). SSOT §22–§23 mówi o **Premium** Full Take; OD-08 Premium levels nadal OPEN; payments OFF.

Wzór czasu nagrania (nie do głosowania tu):  
`MIN(beat.duration_seconds, entitlement.max_recording_seconds, 180)` — już z SSOT.

### OPTION A — Account level jako źródło entitlement (V1)

| Level | Entitlement (zał. produktowe) |
|-------|-------------------------------|
| BEGINNER_RAPPER | Quick Take 30 s · retention 24 h (SSOT) |
| PRO_RAPPER | Full Take · MIN(beat, 180) · retention 10 dni |
| LEGEND_RAPPER | Full Take+ · MIN(beat, 180) · retention dłuższy (D05) |

Bez osobnego bytu Premium w Recording V1. Przyszły Premium może później mapować się na te poziomy lub je nadpisywać (osobny GO).

**Konsekwencje:** Zgodne z briefem Ownera; Full Take bez payments; OD-08 nadal OPEN na etykiety/billing.

### OPTION B — Premium jako dodatkowa warstwa

Account levels: na start tylko QT (BEGINNER-class). Full Take dopiero gdy `premium_enabled` / paid plan (Faza 4, OD-04/07/08).

**Konsekwencje:** Dosłownie bliżej SSOT „Premium”; Full Take poza Recording MVP bez płatności; PRO/LEGEND enum „puste” dla Full Take do payments.

### OPTION C — Hybryda

Account level = bazowy QT/Full jak w A; przyszły Premium = boost (np. dłuższa retention, wyższe capy D07, extra downloads) **bez** zmiany wzoru MIN(beat, 180) jako jedynego źródła „długości utworu”.

**Konsekwencje:** Elastyczne pod billing; wymaga jasnej reguły „co wygrywa przy konflikcie level vs premium” (max / overlay) — do doprecyzowania przy payments GO, nie nowy system ról.

**ARCHITECTURAL IMPACT:**  
Wszystkie opcje: jeden `resolveRecordingEntitlement(...)`.  
A = input = `account_level`.  
B = input = premium flag (+ level tylko QT).  
C = input = level + optional premium overlay (feature flag later).

**PRODUCT IMPACT:**  
A = PRO/LEGEND mają wartość recording bez karty.  
B = Full Take = paid milestone.  
C = levels teraz, monetizacja dokłada boost później.

**FREEZE IMPACT:** **P0 BLOCKER** — bez tego nie da się zapisać tabeli entitlementów w Design Freeze.

*Uwaga architekta: resolver obsłuży A–C; to decyzja produktu/billing, nie techniczna.*

---

# P1 — OWNER DECISIONS

---

## D05

**TEMAT:** Retention LEGEND (vs PRO)

**CURRENT PROPOSAL:** BEGINNER 24 h (SSOT). PRO/Premium 10 dni (SSOT przykład) — *jeśli* D04 przypisze Full Take do PRO. LEGEND „dłużej niż PRO” — bez liczby.

### OPTION A — LEGEND = 30 dni (przykład do akceptacji lub zmiany liczby)

**Konsekwencje:** Wyraźna wartość LEGEND; większy storage.

### OPTION B — LEGEND = 10 dni jak PRO

Różnica LEGEND indziej (capy D07, download D08, przyszły Premium boost).

**Konsekwencje:** Prostszy janitor; słabszy wyróżnik retention.

### OPTION C — Owner podaje inną wartość (np. 14 / 60)

Bezterminowe = **sprzeczne** z SSOT „temporary recordings” — unikamy w V1.

**ARCHITECTURAL IMPACT:** Tylko wartość `retention_seconds` w config; mechanizm `expires_at` + janitor bez zmian.

**PRODUCT IMPACT:** Postrzegana wartość LEGEND / koszt przechowywania.

**FREEZE IMPACT:** **P1** — można DEFER w freeze („LEGEND = PRO interim”) tylko jeśli Owner tak zapisze; inaczej blokuje domknięcie W4.

---

## D06

**TEMAT:** RECORD na własnym bicie nieopublikowanym?

**CURRENT PROPOSAL:** Wąski V1 = PUBLISHED + READY. Own DRAFT/REJECTED = OPEN.

### OPTION A — Tylko PUBLISHED

**Konsekwencje:** Najprostsze AuthZ; producent testuje QT dopiero po publikacji (lub na cudzych PUBLISHED).

### OPTION B — PUBLISHED + własny DRAFT / REJECTED

**Konsekwencje:** Producent sprawdza wokal przed submit/rework; więcej ścieżek Access.

### OPTION C — Także własny PENDING_REVIEW / APPROVED

**Konsekwencje:** Rzadka potrzeba; szersza powierzchnia AuthZ.

**ARCHITECTURAL IMPACT:** A = jedna reguła statusu. B/C = wyjątki owner + status allow-list w Gate RECORD.

**PRODUCT IMPACT:** Comfort community uploaders vs prostota reguł.

**FREEZE IMPACT:** **P1** — domyślnie można LOCK z A i DEFER B jako „Wave+”; Owner musi to powiedzieć.

---

## D07

**TEMAT:** Active takes + daily create caps

**CURRENT PROPOSAL:** Capy muszą istnieć; concurrent session = 1 (architecture-resolvable). Liczby = Owner.

### OPTION A — Interim numbers (do potwierdzenia / edycji)

| Tier | Max active READY | Max creates / UTC day | Concurrent |
|------|-----------------:|----------------------:|------------|
| ANON (jeśli D02=B) | 1 | 3 | 1 |
| BEGINNER | 3 | 10 | 1 |
| PRO | 10 | 30 | 1 |
| LEGEND | 20 | 50 | 1 |

**Konsekwencje:** Jasny anti-abuse od startu; można później tunować configiem.

### OPTION B — Tylko concurrent = 1 + max duration (bez active/daily)

**Konsekwencje:** Słaba ochrona flood/storage; ryzykowne przy public QT / anon.

### OPTION C — Owner podaje własne liczby (wypełnia tabelę)

**Konsekwencje:** Pełna kontrola produktu.

**ARCHITECTURAL IMPACT:** Te same checki serwerowe; różnią się progi w `config/recording`.

**PRODUCT IMPACT:** UX „limit reached” vs koszt storage / abuse.

**FREEZE IMPACT:** **P1** — Wave 1 potrzebuje *jakichś* liczb (interim OK jeśli Owner zatwierdzi A lub C). B niezalecane przy D02=B.

---

## D08

**TEMAT:** Download własnego MIC TAKE

**CURRENT PROPOSAL:** Osobna polityka od beat DOWNLOAD. OD-05/06/17 **bez zmian**.

### OPTION A — Każdy zalogowany właściciel take może pobrać MIC (póki nie wygasł)

**Konsekwencje:** Intuicyjne „moja próbka”; słabszy upgrade pressure.

### OPTION B — BEGINNER = preview only; download od PRO/LEGEND (lub Premium)

**Konsekwencje:** Silniejszy upgrade path; BEGINNER tylko w playerze / Moje próbki odsłuch.

### OPTION C — Download take liczony w limicie pobrań bitów (OD-05/06)

**Konsekwencje:** Miesza produkty; ryzyko regresji Phase 1.8A.

**ARCHITECTURAL IMPACT:**  
A/B = osobny signed GET take + entitlement flag.  
C = wejście w slots/download events bitów — kolizja z DF izolacji.

**PRODUCT IMPACT:** Monetizacja vs swoboda użytkownika.

**FREEZE IMPACT:** **P1** — krytyczne jeśli Wave 3 ma CTA „Pobierz”; inaczej DEFER z preview-only.

*Uwaga architekta: unikać C ze względu na izolację downloadów bitów.*

---

## OWNER APPROVAL TABLE

| ID | Decision | Owner Choice | Status |
|----|----------|--------------|--------|
| D01 | RECORD osobne capability vs wynika z PLAYBACK vs sprzężone z DOWNLOAD | **A** | **CLOSED** |
| D02 | Anonymous QT w V1 (nie / tak / tylko lokalnie) | **B** | **CLOSED** |
| D03 | Shared RECORD: DEFERRED vs IN EPIC vs auto-z-dostępem | **B** | **CLOSED** |
| D04 | Full Take: account level vs Premium-only vs hybryda | **HYBRID** | **CLOSED** |
| D05 | Retention LEGEND (30d / =PRO / inna wartość) | **30 days** | **CLOSED** |
| D06 | Own MIC TAKE preview/download/delete; Track publish OUT | **APPROVED** (as Owner GO) | **CLOSED** |
| D07 | Active + daily caps | **APPROVED** (anon 1/3 · BEG 3/10 · PRO 10/30 · LEG 20/60) | **CLOSED** |
| D08 | Download własnego take | **YES** for BEGINNER/PRO/LEGEND; anon no durable DL | **CLOSED** |

Canonical freeze: [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md).

---

## FINAL

```text
OWNER_DECISION_REVIEW  = COMPLETE
TRUE_OWNER_DECISIONS   = 8
P0_BLOCKERS            = 4
P1_DECISIONS           = 4
IMPLEMENTATION         = NONE
COMMIT                 = NONE
PUSH                   = NONE
DEPLOY                 = NONE
```

**Next:** Owner wypełnia tabelę → Architect LOCK Design Freeze v1.0 → Implementation GO osobno.
