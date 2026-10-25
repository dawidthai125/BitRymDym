# BitRymDym — pełny audyt funkcji, Premium i stanu produktu

| Pole | Wartość |
|------|---------|
| Data | 2026-10-25 |
| Charakter | **Audyt read-only** — bez implementacji, bez migracji, bez deployu |
| Lokalny HEAD / `origin/main` | **`4c64ef3`** (`docs(ops): add ECC Stage 1 protected frontmatter checklist`) — FACT: `git rev-parse` + `git ls-remote` w sesji audytu |
| Living tip w `PROJECT_STATE.md` §2 | Po GO 2026-10-25: tip przed docs **`36b1447`**; migracja owner SELECT **applied** (patrz §4) — re-check `ls-remote` po docs push |
| Produkcja (deploy / smoke) | Public+admin visual PASS @ `35543c8` (2026-10-24) **HISTORY**; owner SELECT **DB apply PASS** 2026-10-25; USER RLS runtime **BLOCKED** |
| Zakazane pliki | Sacred WIP `recording-eligibility-service.ts` · `studio-editor.tsx` — **nie otwierane / nie diffowane** |
| Dirty WIP | **PRESERVE** (bez reset/stash/sync) |

**Legenda statusów:** DONE · PARTIAL · BROKEN · NOT IMPLEMENTED · BLOCKED · NOT VERIFIED  
**Zasada:** istnienie kodu ≠ DONE runtime; brak testu ≠ BROKEN; Ready deploy ≠ Product GREEN.

---

## 1. Podsumowanie wykonawcze

BitRymDym to działająca platforma (katalog, auth, Studio, Quick Take, Premium entitlements, admin) z bogatym kodem i historycznymi closeoutami PRODUCTION VERIFIED dla wielu fal Studio/Security. **Produkt jako całość nie jest GREEN:** brak self-serve płatności (OD-04/07 OPEN), Premium Retention **HOLD**, SFM Versions bez Production GREEN, deep editor Studio **NOT VERIFIED** (plik zabroniony). **Aktualizacja 2026-10-25:** migracja `beat_audio_assets_select_own` **applied + catalog read-back PASS** na `rzzxrgcdogkybkiidqgw`; **USER owner/peer/anon RLS runtime nadal BLOCKED** (brak dedykowanych sesji). Apply ≠ Product GREEN.

**Najmocniejsze dowody lokalne w tej sesji:** unit testy Sample Policy + Premium foundation + P4 RAW + download limits (**78 PASS** łącznie w trzech przebiegach); lokalny Supabase loopback health **200**; wcześniejszy bezpieczny preview Home/`/premium` (loopback, 2026-10-25) — wizualnie PASS z zastrzeżeniami a11y.

**Najważniejsze luki:** płatności/ceny; Retention HOLD; rozjazd MASTER_SSOT / MASTER_HANDOFF Account Level vs runtime Sample Policy; Studio editor bez audytu głębokiego; **prod USER RLS runtime (owner/peer/anon)**; Contabo/SFM worker planes; Sample Catalog & Scratch DJ — kontrakt accepted, **implementation NOT authorized**.

---

## 2. Macierz tras / funkcji / statusów

Źródła: mapa `src/app/**/page.tsx` (35 URL), API `src/app/api/**` (62 route), `docs/PROJECT_FUNCTIONAL_MAP.md`, subagent mapowania tras, SSOT §2.

| Obszar | Trasy / powierzchnie | Impl. (kod) | Dowód w tej sesji / docs | Status audytu |
|--------|----------------------|-------------|---------------------------|---------------|
| Home | `/` | Landing, CTA, strip bitów | Preview lokalny 2026-10-25 PASS (dark/light); unit/public tests istnieją | **PARTIAL** (copy/nav WIP lokalnie; aria-current desktop missing — finding) |
| Katalog | `/beats` | Lista PUBLISHED | Prod smoke 2026-10-24 PASS (docs); runtime tej sesji **NOT RUN** | **DONE** (docs smoke) / **NOT VERIFIED** (re-run) |
| Karta bitu + QT | `/beat/[id]` | Detail, play, Quick Record UI | Kod + `getSamplePolicy` na stronie; eligibility Sacred → głęboka bramka **NOT VERIFIED** | **PARTIAL** |
| About | `/about` | Treść marki | Prod smoke PASS (docs) | **DONE** (docs) / **NOT VERIFIED** (re-run) |
| Premium (public) | `/premium` | Macierz limitów, HOLD, bez cen | Preview lokalny PASS; unit matrix PASS | **DONE** (informacyjna strona + limity w config) |
| Auth | `/sign-in`, `/sign-up`, `/forgot-password`, `/auth/*` | Forms + callback | Kod + testy auth; prod login **NOT RUN** tu | **DONE** (kod) / **NOT VERIFIED** (prod E2E) |
| Upload / rights | `/beats/upload`, `/account/beats`, grants | Community + rights | Waves security docs CLOSED lokalnie; prod USER path **NOT VERIFIED** | **PARTIAL** |
| Moderacja | `/admin/moderation*` | Staff decisions | Admin visual smoke PASS (docs) | **DONE** (docs) / **NOT VERIFIED** (re-run) |
| Studio lista | `/studio` | Projekty | Admin visual PASS (docs); lokalne listy w auditach | **DONE** (docs) |
| Studio editor | `/studio/p/[projectId]` | Deep editor | Plik zabroniony w audycie | **NOT VERIFIED** |
| Studio record API | `/api/studio/.../record/*`, `/api/takes/*` | Sesje / finalize | STU-16 LIMITED PROD PASS (docs); eligibility Sacred | **PARTIAL** / eligibility **NOT VERIFIED** |
| Konto / takes | `/account`, `/account/takes` | Hub + archiwum | Admin empty archive OK (docs) | **DONE** (docs) / **NOT VERIFIED** (USER) |
| Downloads | `/account/downloads`, `/library/downloads` | Historia | Kod + limits tests PASS | **PARTIAL** (limits DONE unit; UI flow NOT VERIFIED) |
| Library / favorites | `/library`, `/library/favorites` | Hub | Kod istnieje | **NOT VERIFIED** |
| Settings | `/settings` | Stub → profil | FACT: strona mówi „kolejna fala” | **PARTIAL** (stub) |
| Motyw | layout + `ThemeToggle` | Dark default, light, localStorage | Preview + docs PASS | **DONE** (evidence) · OD-15/16 **OPEN** |
| Admin ops | `/admin/**`, sample-policy | Beats, users, policy | Auth denials FIXED (docs); prod signed-in matrix **NOT VERIFIED** | **PARTIAL** |
| SFM Versions | `/api/studio/final/**` | Code ON MAIN | Staging/prod E2E **NOT CONFIRMED** (STATE) | **PARTIAL** / **NOT VERIFIED** runtime |
| Premium unlock API | `/api/premium/unlock` | Credits unlock (no payment) | Kod reject client tier/credits | **PARTIAL** (bez checkout) |
| Premium Retention cron | `/api/cron/premium-retention` | Route w repo | **brak** w `vercel.json` (tylko takes-janitor) | **HOLD** / **NOT IMPLEMENTED** na origin aktywacji |
| Sample Catalog + Scratch DJ | — | Kontrakt docs 2026-10-25 | Implementation **NOT authorized** | **NOT IMPLEMENTED** |
| Płatności / sklep | — | Permissions `payments.*` w katalogu | OD-04/07 OPEN | **NOT IMPLEMENTED** |

### Studio deep editor

Jedyny import UI edytora w app: `src/app/studio/p/[projectId]/page.tsx` → `studio-editor.tsx`. Audyt **nie** ocenia zachowania edytora. Historyczne closeouty V2 / P6.x / REC w `PROJECT_STATE` pozostają **baseline docs**, nie re-verify tej sesji.

---

## 3. Tabela Premium (osobny audyt zasad)

**Oś nagrań:** Premium Tier / Sample Policy actor (`ANONYMOUS`≠`FREE`) — **nie** Account Level.  
**Źródła runtime:** `src/config/recording.ts`, `src/config/premium-tiers.ts`, `src/lib/takes/entitlement.ts` (`getSamplePolicy`), `src/lib/takes/take-download.ts`, `src/lib/downloads/limits.ts`, `src/lib/studio/studio-track-capacity.ts`.  
**Caveat:** `SAMPLE_POLICY_DEFAULTS` = domyślne egzekwowane limity; dla BRONZE/SILVER/GOLD **tylko** `maxRecordingSeconds` może być nadpisane w DB (`sample_policy_settings`, 1–180 s) + cap długością bitu / global 180 s. TTL / sessions / active-ready / RAW flag — **zawsze z defaults** (bez override).

| Funkcja (UX) | Plan / rola | Limit (defaults) | Źródło wartości | Egzekwowanie | Bypass (z kodu) | Testy / SSOT | Prod |
|--------------|-------------|------------------|-----------------|--------------|-----------------|--------------|------|
| Pobrania beatów / dzień | ANON / FREE…GOLD | 2 / 4 / 10 / 25 / 50 | `PREMIUM_ANON_*` + `PREMIUM_TIER_MATRIX.downloadsDaily` | `audio-access` → `dailyDownloadLimitForActor` + ledger | Client spoof blocked (`rejectClientChosenPremiumClaims`) | Unit PASS (limits, w2b); W2-B CLOSED (docs) | **NOT VERIFIED** live w tej sesji |
| Quick Take max czas | ANON…GOLD | 15 / 30 / 60 / 120 / 180 s | `SAMPLE_POLICY_DEFAULTS` (+ admin duration B/S/G) | `getSamplePolicy` → surfaces / transport (eligibility Sacred = **NV**) | Admin >180 blocked | `p1-sample-policy` 28 PASS; wave4 unit | P1 CLOSED (docs); admin override DB **NV** |
| TTL próbki | j.w. | 2h / 12h / 36h / 60h / 84h | defaults only | policy → expires | — | unit PASS | **NV** wall-clock |
| Sesje / UTC day | j.w. | 3 / 3 / 5 / 7 / 10 | defaults | claim/session (docs STU-16) | — | STU-16 live 17/17 (docs) | LIMITED PROD PASS ≠ GREEN |
| Active READY | j.w. | 1 / 3 / 5 / 7 / 10 | defaults | policy | — | unit | **NV** |
| RAW own-take | **GOLD only** | capability + **5**/dzień | `canDownloadOwnTake` + `OWN_TAKE_RAW_DOWNLOADS_DAILY` | `/api/takes/download` → `take-download` + `take_download_events` | Alternatywna ścieżka **NOT FOUND** (code-explorer) | `p4-foundation` 23 PASS | **NV** |
| Ścieżki Studio (BEAT liczy; Master nie) | FREE…GOLD | 2 / 3 / 5 / 8 | `studioMaxTracks` | `studio_cas_add_track` + capacity | — | p5 track tests (docs/agent) | **NV** |
| Export take MP3/WAV ladder | BRONZE+ / GOLD WAV | per `premium-export-policy` | config + `take-export-capability` | download gate | Signed URL TTL limitation (documented) | premium-08 / e3 tests (agent) | **NV** |
| SFM quality ladder | osobna matryca | ≠ take-export | `sfm-plan-matrix.ts` | SFM download AuthZ | OD-SFM-ID-05 OPEN sticky | unit SFM 200 PASS (docs evidence) | SFM runtime **NV** |
| Artifact retention (W2 matrix) | FREE…GOLD | 48h / 7d / 30d / **28d prod** (Owner 2026-10-25); 90d design only | `PREMIUM_TIER_MATRIX.artifactRetentionSeconds` + `goldRetentionDesignOnly` | expires_at (render/artifact path) | — | w2a (aktualizacja oczekiwania 28d) | 90d **blocked**; Retention **HOLD** |
| Retencja export/unlock (kontrakt Premium Export) | FREE…GOLD | 7 / 7 / 14 / **28** dni | `PREMIUM_RETENTION_DAYS` | export unlock / download gate | — | `premium-export-policy.test` | **ZGODNE** z matrix Gold po decyzji Ownera |
| Premium Retention worker | — | — | lokalne migracje WIP | cron **nie** w `vercel.json` | — | fencing HOLD | **HOLD** |
| Self-serve zakup / ceny | — | — | — | brak checkout | — | OD-04/07 OPEN | **NOT IMPLEMENTED** |
| Unlock credits API | zalogowany | kredyty per tier (export contract) | server-derived | `/api/premium/unlock` | client tier/credits → 400 | kod | **PARTIAL** |

**Premium Retention:** pozostaje **HOLD** (`PROJECT_STATE`, `PREMIUM_RETENTION_FENCING_CONTRACT`, functional map). Nie reklamować jako aktywnej funkcji.

**OD-15 / OD-16:** **OPEN** — audyt ich nie zamyka.

---

## 4. Różnice SSOT ↔ kod ↔ testy ↔ produkcja

| Temat | Klasyfikacja | Dowód |
|-------|-------------|--------|
| Limity QT: MASTER_SSOT §21 (24 h) vs FREE TTL 12 h | **SPRZECZNE** | documentation-auditor + `recording.ts` |
| MASTER_SSOT §23 / handoff Account Level (10 d / PRO/LEGEND) vs Sample Policy | **SPRZECZNE** | j.w. |
| Account Level jako oś nagrań | **SPRZECZNE** (stale) | `recording.ts` komentarz; OD-08 CLOSED |
| Downloads ANON2…GOLD50 | **ZGODNE** | handoff W2-B ↔ `premium-tiers.ts` |
| Gold 90d design-only; prod **28d** (Owner 2026-10-25) | **ZGODNE** | [PREMIUM_GOLD_RETENTION_28D…](../decisions/PREMIUM_GOLD_RETENTION_28D_OWNER_DECISION_2026-10-25.md) + `premium-tiers.ts` + `PREMIUM_RETENTION_DAYS` |
| GOLD 28d export vs matrix (historycznie 30d) | **ROZSTRZYGNIĘTE** → obie osie **28d** | Owner GO 2026-10-25; SILVER nadal 30d; W2B living claim też **28d** |
| Retention HOLD | **ZGODNE** | STATE + brak crona retention w `vercel.json` |
| Living tip `35543c8` (STATE §2) vs git `4c64ef3` | **SPRZECZNE / stale docs** | `git ls-remote` w sesji |
| STATE §2 vs §2c deploy SHA | **wewnętrznie stale** | documentation-auditor |
| Unit Sample Policy / Premium | **PASS** (sesja) | vitest 28+19+8+23 |
| Owner SELECT migracja apply + catalog | **PASS** (2026-10-25) | history `20261025152524`; policy `beat_audio_assets_select_own` |
| Prod USER owner SELECT (JWT) | **BLOCKED** | brak sesji USER + DRAFT |
| Prod peer / anon isolation | **BLOCKED** | j.w. |
| Prod finalize Wave 5 path | **NOT VERIFIED** | STATE |
| SFM Production GREEN | **NOT CLAIMED** | STATE |

---

## 5. Błędy bazowe vs nowe

### Bazowe / znane (docs — nie re-opened jako „nowe”)

- WAV-6 tempo ambiguity OPEN  
- Contabo always-on NOT ENABLED; SFM worker host NOT DONE  
- Migration history drift; `db push` BLOCKED  
- EXPORT_WAV authz waiver (Owner)  
- FAR-01 retirement NOT EXECUTED  
- HIBP DEFERRED  
- Mobile: device certification PENDING (P2/P3 residual)  
- Premium Retention HOLD (lokalny WIP)  
- Sample Catalog / Scratch DJ: contract only  

### Potwierdzone w tej sesji (nie „naprawione”)

- Desktop `site-header` **bez** `aria-current="page"` (mobile bottom nav ma) — a11y finding  
- `/settings` = stub PARTIAL  
- MASTER_SSOT / handoff Account Level **stale** względem Sample Policy  
- `PROJECT_STATE` tip/deploy sekcje **nie zsynchronizowane** z `4c64ef3`  
- Deep Studio editor **NOT VERIFIED** (celowe ograniczenie audytu)  
- Wcześniejszy a11y: tap targets mobile header, etykiety (PASS z zastrzeżeniami) — nie regenerowane tu  
- ~~Rozbieżność Gold 28d vs 30d~~ — **ROZSTRZYGNIĘTE Owner 2026-10-25:** obie osie **28d**; Premium Retention nadal **HOLD**  
 
 

**BROKEN w sensie odtworzonego błędu runtime:** brak w tej sesji (nie uruchamiano destrukcyjnych ani prod flow).

---

## 6. Braki i ryzyka (P0–P3)

| Priorytet | Item |
|-----------|------|
| **P0** | Koncentracja zaufania: `service_role` + signed Storage — każdy błąd AuthZ w app omija RLS klienta (security-auditor) |
| **P0** | Nie aktywować Premium Retention / worker JWT / Storage purge bez osobnego GO |
| **P1** | Domknięcie OD-04/07 przed jakimkolwiek sklepem; nie obiecywać cen |
| **P1** | ~~Apply owner SELECT `beat_audio_assets`~~ → **DONE 2026-10-25**; pozostałe: **USER owner/peer/anon runtime smoke** (dedykowane sesje) |
| **P1** | Aktualizacja living tip/deploy w PROJECT_STATE do `4c64ef3` + re-verify Vercel (docs GO) |
| **P1** | SFM: staging E2E + worker host przed Production GREEN claim |
| **P2** | Zsynchronizować MASTER_SSOT §19–23 / handoff Account Level z Sample Policy albo oznaczyć HISTORY |
| **P2** | ~~Ujednolicić GOLD 28d vs 30d~~ → **DONE** (Owner 2026-10-25); Retention activation nadal osobne GO |
| **P2** | Settings UI; desktop aria-current; a11y tap targets |
| **P2** | Contabo continuous / janitor Cron fire wall-clock |
| **P3** | Sample Catalog §12 blockers → dopiero potem Implementation GO |
| **P3** | P6.8 / residual mobile P3 |

---

## 7. Blokady runtime i NOT VERIFIED

| Item | Status |
|------|--------|
| Lokalny Docker + Supabase `127.0.0.1:54421` | **dostępne** w sesji (health 200) — **nie** użyto do DB mutate / integration suite |
| Integration / live Vitest DB | **NOT RUN** (proporcjonalnie; GO: bez seed/reset) |
| Produkcyjny smoke / login / audio | **NOT RUN** |
| Sacred eligibility service | **NOT VERIFIED** (zakaz) |
| `studio-editor.tsx` | **NOT VERIFIED** (zakaz) |
| Admin override wartości w prod `sample_policy_settings` | **NOT VERIFIED** |
| Contabo host live | **NOT VERIFIED** |
| Pełny `npm test` / build | **NOT RUN** |

---

## 8. Rekomendacje kolejnych kroków (bez wdrożenia)

1. **Docs GO:** zaktualizować PROJECT_STATE §2 tip/deploy do faktu `4c64ef3` + re-verify aliases.  
2. **SSOT GO:** oznaczyć lub poprawić MASTER_SSOT / handoff Account Level vs Sample Policy (jedna oś prawdy).  
3. **Security GO (remaining):** runtime USER owner/peer/anon na prod z istniejącymi sesjami + DRAFT (apply już DONE 2026-10-25).  

4. **Product GO:** OD-04/07 przed sklepem; Retention pozostaje HOLD.  
5. **Studio GO:** osobny audyt deep editor z uprawnieniem do `studio-editor.tsx` + real mic poza Cursor egress.  
6. **A11y GO:** aria-current desktop, tap targets, settings stub — poza tym audytem.  
7. **SFM GO:** staging E2E według ordered GOs w STATE — nie flag on prod bez GO.

---

## 9. Skills, subagenci, weryfikacja

### Skills (przeczytane instrukcje)

`research-and-planning` · `documentation-audit` · `architecture-and-reuse` · `security-review` · `database-review` · `testing-and-verification` · `frontend-ux` (kontekst UI; bez redesign) · projektowy `supabase` (zasady; bez mutate)

### Subagenci RO

| Agent | ID | Rola |
|-------|-----|------|
| explore (trasy) | [c641bc0e-…](c641bc0e-7b42-410a-b8e5-4e6f1c38ad9a) | Mapa page/API |
| code-explorer (Premium) | [4bbcae2e-…](4bbcae2e-004f-4445-8b12-139562d69a87) | Entitlements / egzekwowanie |
| security-auditor | [abe42c65-…](abe42c65-5474-441a-b230-5ddf4cf00d55) | Auth / RLS / Storage |
| documentation-auditor | [b403cdba-…](b403cdba-b186-47f5-ad7f-3ae9d13f9397) | SSOT vs config |

Wcześniejsza sesja (Home/Premium): [a11y-architect](b175f600-0307-4547-83ba-aaa92d0e06d3), [documentation-auditor](e2885758-0db1-4005-aa69-9a5366de1a7e) — wykorzystane jako kontekst, bez powtórki pełnego SSOT Premium.

### Kontrole wykonane (sesja)

```
git rev-parse / ls-remote → 4c64ef3
Supabase auth health 127.0.0.1:54421 → 200
npx vitest run p1-sample-policy + w2a-premium-foundation → 47 PASS
npx vitest run downloads/limits + p4-foundation → 31 PASS
vercel.json crons → tylko takes-janitor
```

### Domknięcie Gold 28d — testy retencji (2026-10-25, po decyzji Ownera)

**FACT:** `npx vitest run` czterech plików → **48 PASS** / 4 files / 0 fail  
(`w2a-premium-foundation`, `e3-1-foundation`, `e3-5-render-jobs`, `premium-export-policy`).

| Twierdzenie | Kod | Test | Klasyfikacja |
|-------------|-----|------|-------------|
| GOLD prod retention = **28 dni** | `PREMIUM_TIER_MATRIX.GOLD` + `PREMIUM_RETENTION_DAYS.GOLD` | w2a + premium-export-policy | **ZGODNE** |
| SILVER = **30 dni** | `PREMIUM_TIER_MATRIX.SILVER` | e3-1-foundation | **ZGODNE** |
| `premiumActive` → klasa SILVER (**30d**), nie GOLD | `retentionSecondsForPremium(true)` → `"SILVER"` | e3-5-render-jobs | **ZGODNE** (osobna oś; nie zaciera Gold 28d) |
| Premium Retention feature **HOLD** | brak crona retention w `vercel.json`; `isGoldRetentionProductionEnabled()===false` | — | **ZGODNE** |

Decyzja: [PREMIUM_GOLD_RETENTION_28D_OWNER_DECISION_2026-10-25.md](../decisions/PREMIUM_GOLD_RETENTION_28D_OWNER_DECISION_2026-10-25.md).  
Zakres testów: [test-auditor](d94e052b-3ba6-4aee-b2f7-7a234660b277).

**NOT RUN:** build, pełny lint, integration DB, prod inspect, E2E mic, Sacred/editor; **nie** powtarzano 48 PASS w tej turze domknięcia dokumentacji.

---

## 10. Ochrona WIP

| Element | Status |
|---------|--------|
| Sacred WIP `recording-eligibility-service.ts` | **nienaruszony** (nie czytany / nie diffowany w audycie; pozostaje dirty) |
| `studio-editor.tsx` | **nienaruszony** (nie otwierany) |
| Dirty WIP pozostały | **PRESERVE** |
| `.env*` | wartości **nie** czytane / nie raportowane |
| Commit / push / deploy | **brak** |
| Edycje kodu / SSOT living (poza tym raportem) | **brak** — jedyny nowy artefakt: ten plik |

---

## 11. Skrót liczników statusów (orientacyjny)

| Status | Przykłady obszarów |
|--------|-------------------|
| **DONE** | Motyw (evidence); macierz config Premium + unit; model ról/permissions (kod); wiele historycznych Studio/Security closeoutów **w docs** (nie re-verify) |
| **PARTIAL** | Home/Premium copy WIP; QT (UI+policy, eligibility NV); upload/moderation; SFM code bez runtime GREEN; settings stub; admin (kod OK, prod matrix NV) |
| **BROKEN** | *(brak nowego odtworzenia w tej sesji)* |
| **NOT IMPLEMENTED** | Self-serve płatności/ceny; Sample Catalog/Scratch DJ; aktywacja Retention na origin |
| **BLOCKED** | `db push` (migration drift — docs); Retention aktywacja bez GO |
| **BLOCKED** | Prod USER owner/peer/anon RLS runtime (brak sesji+DRAFT, 2026-10-25) |
| **NOT VERIFIED** | Studio deep editor; Sacred eligibility; Contabo; SFM staging; pełne audio/mic |

**Werdykt produktu:** **nie PASS / nie GREEN** — apply owner SELECT **nie** podnosi produktu do GREEN; runtime USER RLS **BLOCKED**; OD-04/07 OPEN; Retention HOLD.
)
