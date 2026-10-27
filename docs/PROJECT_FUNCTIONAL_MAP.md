# BitRymDym — mapa funkcji (kanoniczna)

**Updated:** 2026-10-27 (P-NEXT-06A/C/B · tip **`2cc4cc1…`**)
**Living tip / deploy:** [PROJECT_STATE.md](./PROJECT_STATE.md) §2 — pre-docs tip **`2cc4cc1c3e3a3536e7bf8fbae48dca3485700d5b`**; GitHub Production **`7350328308` success** `2026-10-27T04:26:54Z`; alias **`www` → SHA UNVERIFIED**; re-check `git rev-parse HEAD` / Deployments po pushu.
**Evidence rule:** PASS / FAIL / BLOCKED / NOT RUN / NOT VERIFIED tylko z dowodu. Owner-reported = fakt przekazany Ownerem (nie niezależny re-run agenta).
**Płaszczyzny dowodu (nie mylić):** `CODE` · `UNIT/INTEGRATION TEST` · `REAL-MOUNT` · `PRODUCTION UI` · `PRODUCTION DB/RLS` · `DEPLOY` · `OWNER-REPORTED`.

Legenda statusów wiersza: **DONE** · **PARTIAL** · **OPEN** · **HOLD** · **BLOCKED** · **NOT VERIFIED** · **HISTORY**.

---

## Publiczne (anon)

| Powierzchnia | Co użytkownik może | Główne ścieżki | Testy (zakres) | Ostatni dowód | Status | Pozostałe / odblokowanie |
|--------------|-------------------|----------------|----------------|---------------|--------|---------------------------|
| Home | Brand, CTA, wejście do katalogu | `/` · `src/app/page.tsx` | touch/home link (częściowe) | PRODUCTION UI public smoke **PASS** @ `35543c8` (**HISTORY** 2026-10-24) · **DEPLOY** tip living osobno | **PARTIAL** | OD-15/16 OPEN; pełny re-smoke **NOT VERIFIED** na living tip |
| Katalog bitów | Szukaj, sortuj, filtruj, odsłuch katalogowy | `/beats` · `beats-catalog-client.tsx` · `beats-catalog-{search,sort,filters}.ts` | UNIT search/sort/filters · REAL-MOUNT filters keyboard/status · waveform seek REAL-MOUNT | **CODE**+**REAL-MOUNT** continuum a11y 2026-10-26 · PRODUCTION UI katalog **HISTORY** smoke @ `35543c8` | **PARTIAL** | Pełny AT na prod layout **NOT VERIFIED**; bez egress audio |
| Detal bitu + Quick Take | Play katalogowy, wejście QT | `/beat/[id]` | tablet padding (nav commit) | docs LIMITS = **OD-QT-01** Account Level · P1 Sample Policy UNIT = HISTORY · eligibility Sacred **NOT VERIFIED** | **PARTIAL** | REC/mic **NOT RUN**; Sacred WIP nie czytać · runtime **NOT VERIFIED** |
| About | Treść marki | `/about` | — | PRODUCTION UI smoke **HISTORY** @ `35543c8` | **DONE** (docs smoke) / re-run **NOT VERIFIED** | — |
| Premium (public) | Porównanie limitów; bez cen/checkout | `/premium` · `premium-tiers.ts` · `overflow-x-scroll-region.tsx` | UNIT w2a/w2b · headings; **brak** REAL-MOUNT scroll | **CODE** `11d6042` · PRODUCTION UI table/fokus raportowane **PASS** · touch swipe **BLOCKED** (harness) | **PARTIAL** | OD-04/07 **OPEN**; Retention worker **HOLD** |
| Sign-in / Sign-up / Forgot | Auth forms, anti-enum | `/sign-in` · `/sign-up` · `/forgot-password` | UNIT actions + REAL-MOUNT mounts | **CODE**+**UNIT**+**REAL-MOUNT** · prod Auth E2E **NOT VERIFIED** | **PARTIAL** | Real inbox / rate-limit UX = Owner smoke |

**Public smoke (prod, 2026-10-24, tip `35543c8` HISTORY):** `/`, `/beats`, `/about`, `/sign-in` → HTTP 200 (**PASS**). Motyw na home (**PASS**).

---

## Auth, konto, nawigacja

| Powierzchnia | Co użytkownik może | Główne ścieżki | Testy | Dowód | Status | Pozostałe |
|--------------|-------------------|----------------|-------|-------|--------|-----------|
| UserMenu | Otwórz/zamknij menu konta (disclosure) | `user-menu.tsx` · `site-header.tsx` | source-contract `site-nav-active` · touch `header-search-touch-target` | **DEPLOY** ancestry **`11a664b`** (HISTORY smoke era) · living tip docs **`2cc4cc1…`** · **PRODUCTION UI** AX/Escape/hit **PASS** (390/820/1280) · Tab/`focus-visible` **NOT VERIFIED** | **PARTIAL** | Nie klikać Wyloguj w smoke bez GO |
| Motyw | Dark default / light papier | `theme-toggle.tsx` | theme-toggle-label | PRODUCTION UI + visual evidence 2026-10-24 | **DONE** (evidence) | OD-15/16 **OPEN** |
| Nav responsive | Desktop top / mobile bottom; handoff `lg` | `site-main-nav` · `mobile-bottom-nav` · `app-shell` | `site-nav-active` (lg handoff) | **CODE** `c702d27` · PRODUCTION UI tablet gap fix **DEPLOYED** · pełny viewport re-smoke **NOT VERIFIED** | **PARTIAL** | — |
| Skip link | Przejdź do treści | AppShell | `ccb4f0c` Tab/Enter path | **UNIT**/keyboard probe | **PARTIAL** | Prod AT **NOT VERIFIED** |
| Account hub | Profil, bezpieczeństwo | `/account` | change-email/password mounts · display-name status | REAL-MOUNT lokalnie · prod USER **NOT VERIFIED** | **PARTIAL** | — |
| Settings | Hub ustawień | `/settings` | settings-hub redirect | Stub historyczny → hub | **PARTIAL** | — |
| Library / downloads | Ulubione, historia | `/library*` · `/account/downloads` | limits UNIT | UI flow **NOT VERIFIED** | **PARTIAL** / **NOT VERIFIED** | — |
| Takes archive | Lista nagrań | `/account/takes` | — | Admin empty archive OK (docs) | **DONE** (docs) / USER **NOT VERIFIED** | — |

**Admin visual smoke (prod, 2026-10-24 HISTORY):** Studio hub / takes / account / settings / library + Motyw → **PASS**.
**USER RLS runtime (Owner-reported, 2026-10-25):** owner/anon/peer **PASS** → [PROD_USER_RLS_RUNTIME_SMOKE_2026-10-25.md](./audits/PROD_USER_RLS_RUNTIME_SMOKE_2026-10-25.md). **≠ Product GREEN.**

---

## Premium — osie (nie scalać)

| Oś | Wartości (defaults / Owner) | Egzekwowanie | Status |
|----|----------------------------|--------------|--------|
| Pobrania beat / dzień | ANON2…GOLD50 | `PREMIUM_TIER_MATRIX` + ledger | **DONE** UNIT · prod live **NOT VERIFIED** |
| Quick Take LIMITS (Account Level) | czas/TTL/sesje/QUICK\|FULL — Design Freeze D04/D05 · **OD-QT-01** | living docs = **Account Level** · P1 Sample Policy ship = HISTORY · runtime **NOT VERIFIED** | **DONE** docs (OD-QT-01) · UNIT P1 HISTORY · eligibility Sacred **NOT VERIFIED** |
| Export / unlock jakość | ladder `PREMIUM_RETENTION_DAYS` / export policy | download/unlock gates | **PARTIAL** · OD-04/07 **OPEN** |
| Retencja artefaktów | FREE 48h · BRONZE 7d · SILVER 30d · **GOLD 28d prod** (Owner 2026-10-25); 90d design-only | matrix + export days | **ZGODNE** kod↔decyzja · worker **HOLD** |
| Premium Retention worker | cron/janitor | lokalne WIP · **nie** w `vercel.json` | **HOLD** |
| Self-serve ceny/płatności | — | brak checkout | **OPEN** (OD-04/OD-07) |

---

## Studio / REC / export (bezpieczne źródła tylko)

| Powierzchnia | Status | Dowód | Zakaz |
|--------------|--------|-------|-------|
| Studio hub `/studio` | **DONE** (docs admin visual) | PRODUCTION UI HISTORY @ `35543c8` | — |
| Studio editor | **NOT VERIFIED** (ten pakiet) | Historyczne closeouty V2/P6.x w PROJECT_STATE = baseline docs | **nie** otwieraj `studio-editor.tsx` / `studio-service.ts` bez scope |
| REC / mic | **NOT RUN** | Mock MediaRecorder lokalnie ≠ mic | Audio egress policy |
| `beat_audio_assets` owner SELECT | Apply+catalog **PASS** · runtime **OWNER-REPORTED PASS** | history `20261025152524` · smoke 2026-10-25 | ≠ Product GREEN |
| Final Mix (STUDIO_EXPORT) | GREEN VERIFIED (frozen IN) | PROJECT_STATE | ≠ SFM Versions GREEN |
| SFM Versions | Code ON MAIN · Production GREEN **NOT CLAIMED** | PROJECT_STATE SFM planes | Host/staging **NOT RE-VERIFIED** |
| Contabo worker | Code local · sync/canary/always-on **NOT DONE** | PROJECT_STATE | Osobne GO |
| Sample Catalog + Scratch DJ v1 | **BLOCKED** | Kontrakt [SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md](./decisions/SAMPLE_CATALOG_AND_DJ_SCRATCH_CONTRACT.md) §12: **OD-SC-01…05** **OWNER-ACCEPTED — TECHNICAL DECISION** · **Implementation NOT AUTHORIZED** · **NOT SHIPPED** | Bez Implementation GO · Storage policies access/list/delete/retention/orphan **NOT VERIFIED** (kontrakt §13) |

---

## Macierz weryfikacji (skrót 2026-10-27)

| Obszar | CODE | UNIT/REAL-MOUNT | PRODUCTION UI | PRODUCTION DB/RLS | DEPLOY |
|--------|------|-----------------|---------------|-------------------|--------|
| Tip `2cc4cc1…` | docs tip | — | — | — | GH **`7350328308` success** · www SHA **UNVERIFIED** |
| Tip `11a664b` (HISTORY) | tak | UserMenu contracts | UserMenu PARTIAL smoke | — | **success** (2026-10-26) |
| Tablet nav `c702d27` | tak | site-nav-active | **NOT VERIFIED** re-smoke | — | ancestry na tip |
| Premium table `11d6042` | tak | brak dedicated test | fokus/table PASS · swipe **BLOCKED** | — | ancestry |
| Katalog filters/waveform | tak | REAL-MOUNT | HISTORY smoke | — | ancestry |
| Auth anti-enum | tak | UNIT+mount | **NOT VERIFIED** | — | ancestry |
| USER RLS owner/peer/anon | SQL on main | lokalne testy | — | **OWNER-REPORTED PASS** | apply 2026-10-25 |
| Premium Retention | lokalny WIP | — | nieaktywne | nieaktywne | **HOLD** |
| SFM runtime | ON MAIN | unit evidence HISTORY | — | **NOT CLAIMED** GREEN | ≠ cutover |
| REC/mic | — | mock only | **NOT RUN** | — | — |

---

## Motyw (aktualny model)

| Fakt | Status |
|------|--------|
| Dark = default (`data-theme="dark"`) | Udokumentowany Owner direction 2026-10-24 |
| Light = papier / zine | j.w. |
| Toggle przed Zaloguj / UserMenu | PASS w evidence |
| Persist `localStorage bitrymdym.theme` | PASS |
| OD-15 / OD-16 | **OPEN** |

---

## Sprzeczności / rozstrzygnięcia (living)

| Temat | Klasyfikacja | Uwaga |
|-------|--------------|-------|
| Oś QT LIMITS: Account Level vs Sample Policy | **ROZSTRZYGNIĘTE (docs)** — Owner D1/B-QT = **B** · **OD-QT-01** (2026-10-26) | Living docs = **Account Level**; P1 Sample Policy jako oś LIMITS = HISTORY; **runtime compliance NOT VERIFIED** (osobne Implementation GO); Sacred WIP nie audytowany |
| Living tip w starych akapitach HISTORY vs §2 | **HISTORY** | Zawsze wierz §2 PROJECT_STATE |

---

## Lokalne środowisko weryfikacji Studio

Zobacz [PROJECT_STATE.md](./PROJECT_STATE.md) § Local Studio verification environment oraz cold-start handoff. Skrót:

- WSL2 + Docker Desktop; lokalny Supabase API **127.0.0.1:54421** (nie zakładaj 54321).
- Tymczasowy Next **127.0.0.1:3460** + loopback env; **`.env.local` przywrócić bajt w bajt**.
- Fixture / credentials tylko lokalnie; nigdy w produkcji; nie commitować WAV / creds / PID / logów.
- Bez `db reset` / seedów / migracji prod bez osobnej decyzji Ownera.
