# BitRymDym — mapa funkcji (kanoniczna)

**Updated:** 2026-10-25 (prod apply owner SELECT + rozdzielone claimy RLS)  
**Living tip / deploy:** [PROJECT_STATE.md](./PROJECT_STATE.md) §2 — tip przed docs = **`36b1447`**; re-check `ls-remote` / Deployments po pushu.  
**Evidence rule:** PASS / FAIL / BLOCKED / NOT RUN / NOT VERIFIED tylko z dowodu.

---

## Publiczne (anon)

| Powierzchnia | Ścieżka | Uwagi |
|--------------|---------|--------|
| Home | `/` | Brand / katalog / CTA |
| Katalog bitów | `/beats` | Lista / wyszukiwanie |
| Detal bitu + Quick Take | `/beat/[id]` | Odtwarzanie katalogowe ≠ Studio engine |
| About | `/about` | Treść marki |
| Sign-in | `/sign-in` | Formularz auth |

**Public smoke (prod, 2026-10-24, po tip `35543c8`):** `/`, `/beats`, `/about`, `/sign-in` → HTTP 200 (**PASS**). Motyw przełączany UI na home (**PASS**).

---

## Auth i konto

| Powierzchnia | Ścieżka |
|--------------|---------|
| Account hub | `/account` |
| Takes archive | `/account/takes` |
| Settings | `/settings` |
| Library | `/library` |
| Downloads | `/account/downloads` (i powiązane) |

**Admin visual smoke (prod, 2026-10-24):** authenticated routes Studio hub / takes / account / settings / library + Motyw placement + persistence → **PASS** ([ADMIN_SESSION_AUTH_VISUAL_SMOKE_2026-10-24.md](./audits/_studio_recording_local_e2e_2026-10-24/ADMIN_SESSION_AUTH_VISUAL_SMOKE_2026-10-24.md)).  
**USER RLS runtime na prod:** **BLOCKED** (2026-10-25) — brak jawnych sesji zwykłego USER + dedykowanego DRAFT; sesja admina **nie** jest dowodem.

---

## Studio

| Powierzchnia | Opis | Weryfikacja |
|--------------|------|-------------|
| Studio hub | `/studio` — lista projektów | Prod admin visual **PASS**; lokalnie **PASS** w auditach |
| Studio editor | Edytor projektu (transport, ścieżki, R, REC) | Lokalny mock E2E **PASS** na PUBLISHED fixture; prod editor **NOT RUN** w smoke admina |
| Takes | Archiwum nagrań | Prod empty archive OK; lokalny take save **PASS** (mock) |
| Motyw | Dark default · light papier · toggle obok auth/UserMenu | Global + logged-in visual evidence; OD-15/OD-16 **OPEN** |

### Nagranie (produkt)

- Beat musi być **PUBLISHED** (bramka produktowa).
- Ścieżki seed: **R nieuzbrojone** — VOCAL `record_armed: false` od commita **`35543c8`** (`fix(studio): start vocal tracks unarmed`).
- Świadome R uzbraja wybraną ścieżkę (CAS rozbraja pozostałe — ancestry migracji).
- Lokalny E2E używa **Fake MediaRecorder** + fixture `chromium-mediarecorder-opus.webm` — **nie** jest dowodem realnego mikrofonu / produkcji audio.

### RLS `beat_audio_assets` (owner SELECT)

- Commit **`1e75fd3`** (repo SQL): policy `beat_audio_assets_select_own` — SELECT dla `authenticated` gdy `beats.owner_id = auth.uid()` (w tym DRAFT).
- Lokalnie: vitest owner/peer/anon + E2E submit→mod→publish→mock REC → **PASS** ([owner-select-policy-e2e-report.json](./audits/_studio_recording_local_e2e_2026-10-24/owner-select-policy-e2e-report.json)).
- **Prod migracja apply + catalog read-back (2026-10-25):** **PASS** — project **`rzzxrgcdogkybkiidqgw`** · history **`20261025152524` / `beat_audio_assets_owner_select`** (repo `20261024201348_…`; drift OK) · policy EXISTS · SELECT · `authenticated` · owner-uid predicate.
- **Prod USER owner SELECT (runtime JWT):** **BLOCKED**
- **Prod peer isolation:** **BLOCKED**
- **Prod anon isolation:** **BLOCKED**
- Admin / service_role **nie** zastępują powyższych claimów runtime.

---

## Motyw (aktualny model)

| Fakt | Status |
|------|--------|
| Dark = default (`data-theme="dark"`) | Udokumentowany Owner direction 2026-10-24 |
| Light = papier / zine | j.w. |
| Toggle przed Zaloguj / UserMenu (desktop + mobile) | PASS w evidence |
| Persist `localStorage bitrymdym.theme` | PASS (triada storage ≡ data-theme ≡ `.dark`) |
| OD-15 / OD-16 | **OPEN** — nie zamykać przy okazji wyglądu |

---

## Macierz weryfikacji (sesja 2026-10-24)

| Obszar | Lokalnie | Produkcja |
|--------|----------|-----------|
| Public routes smoke | — | **PASS** |
| Deploy powiązany z `35543c8` | — | **PASS** (GitHub Deployments `success`; `vercel inspect` OAuth **NOT RUN**) |
| Admin authenticated visual | — | **PASS** |
| Owner SELECT — migracja/katalog | **PASS** (loopback) | Apply + read-back **PASS** (2026-10-25) |
| Owner SELECT — USER runtime | **PASS** (loopback) | **BLOCKED** (brak sesji USER+DRAFT) |
| VOCAL unarmed seed | **PASS** (commit + prior E2E) | Bundle ancestry po deploy tip |
| Mock REC → take → archive | **PASS** (harness) | **NOT RUN** |
| Real mic / Play masters | **NOT RUN** | **NOT RUN** |
| Ordinary USER RLS (peer/anon) | lokalny peer/anon **PASS** | **BLOCKED** (prod) |
| Premium Retention | HOLD (local WIP) | nieaktywne |

---

## Lokalne środowisko weryfikacji Studio

Zobacz [PROJECT_STATE.md](./PROJECT_STATE.md) § Local Studio verification environment oraz cold-start handoff. Skrót:

- WSL2 + Docker Desktop; lokalny Supabase API **127.0.0.1:54421** (nie zakładaj 54321).
- Tymczasowy Next **127.0.0.1:3460** + loopback env; **`.env.local` przywrócić bajt w bajt**.
- Fixture / credentials tylko lokalnie; nigdy w produkcji; nie commitować WAV / creds / PID / logów.
- Bez `db reset` / seedów / migracji prod bez osobnej decyzji Ownera.
