# Studio Final Mix — RPC & Security Contract

**Status:** `OWNER ACCEPTED (design docs)` — reconciled 2026-10-14 · **OD-SFM-ID-07 CLOSED 2026-10-14** · Stage C claim/XOR **NOT IMPLEMENTED**
**Date:** 2026-10-14 (reconciliation; ID-07 accept same day)
**Parent design:** [STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md](./STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md)
**Data model:** [STUDIO_FINAL_MIX_DATA_MODEL.md](./STUDIO_FINAL_MIX_DATA_MODEL.md)
**Analyzed tip (design reconciliation):** `fdcca3b42a00d7039facc5eff40259f9799bf779` · **OD-SFM-ID-07 discovery tip:** `a4ea89c5b1c8cb74aec243a002ca22805fe293e9`

```text
NO SQL MIGRATIONS / NO CODE FROM THIS DOCUMENT
READY / object_key / signed URL ALONE ≠ AUTHORIZATION
OD-SFM-ID-01…04 + OD-SFM-ID-07 ACCEPTED (docs) · OD-04 OPEN
SECURITY DEFINER REQUIRES fixed search_path + REVOKE FROM PUBLIC/anon
```

---

## 1. Zasady bezpieczeństwa (obowiązkowe)

1. Tożsamość wyłącznie z sesji serwera / `auth.uid()` — nigdy z body klienta o planie, limicie, quality entitlement.
2. Grant ≠ artifact ≠ URL.
3. UI nie jest AuthZ.
4. Worker i service_role nie wystawiają signed URL użytkownikowi bez przejścia przez AuthZ download.
5. SFM **nie** rozszerza semantyki E3 MIX w `createOwnArtifactDownloadSignedUrlFor` — osobna trasa/serwis (Design §4.3).
6. Resolver jakości SFM **nie** używa `EXPORT_WAV` jako bramki produktowej (Design §5).
7. Wzorzec istniejących definer RPC: `search_path` + REVOKE client EXECUTE gdzie mutator jest service-only (np. migracje `security_p1_…`, `p0_studio_cas_client_execute_revoke`).

---

## 2. Role

| Rola | Może | Nie może |
|------|------|----------|
| `authenticated` (owner) | Accept, start stage (jeśli user-driven), claim grant, enqueue quality, request download | Promote artifact, mark stage z job SUCCEEDED bez walidacji, upsert slot z payment, janitor |
| `anon` | nic SFM | wszystko |
| App server (user JWT + service client po AuthZ) | Orchestracja HTTP → RPC | Ufać client object_key |
| Worker / service_role | Claim jobs, complete encode, promote current, mark stages, expire | Impersonować user download bez uid |
| Payment webhook service | `sfm_upsert_paid_slot` / refund by `payment_ref` | Tworzyć grant samodzielnie |

---

## 3. Resolver jakości (kontrakt logiczny — app lub SQL helper)

**Symbol docelowy (app):** `resolveSfmQualityEntitlement` — MISSING dziś.

| Wejście | Źródło |
|---------|--------|
| `premiumTier` | `resolveProductEntitlement*` (EXISTS) |
| `quality` | enum SFM |
| `versionGrant` | wiersz grantu lub null |
| `mode` | `CLAIM_GRANT` \| `RE_DOWNLOAD` \| `ENQUEUE` \| `DOWNLOAD` |

| Wynik | Znaczenie |
|-------|-----------|
| `allow` | quality dozwolona w tym mode |
| `deny_code` | `PLAN_DENIED` \| `NO_GRANT` \| `DOWNGRADE_NEW_QUALITY` \| `FREE_NO_DOWNLOAD` \| … |

**Negatywne:** FREE zawsze deny download qualities; BRONZE deny 192/320/WAV; SILVER deny 320/WAV; po downgrade deny jakości spoza `granted_qualities` i spoza current plan.

---

## 4. Kontrakty operacji

Nazwy RPC = propozycja. Implementacja może być RPC Postgres **lub** transakcja app+admin z równoważnymi gwarancjami — Implementation GO wybiera, zachowując kontrakt.

### 4.1 `sfm_accept_version`

| | |
|--|--|
| **Params** | `p_project_id uuid`, `p_expected_document_version int` |
| **Caller** | authenticated |
| **Identity** | `auth.uid()` = `studio_projects.owner_id` |
| **Preconditions** | projekt istnieje; `document_version` match; sesja niepusta wg reguł SFM (reuse empty-session rules z STUDIO_EXPORT gdzie dotyczy) |
| **TX** | INSERT version (snapshot z DB) + INSERT stages `SFM_MIX`/`SFM_MASTER` PENDING; opcjonalnie previous current → SUPERSEDED + update `current_final` **dopiero** gdy nowa wersja osiągnie EXPORTS_ELIGIBLE **lub** natychmiast oznacz „pending final” — **preferencja:** wskaźnik `current_final` ustawiany przy MASTER SUCCEEDED (spójne z produktem „aktualny final”) |
| **Idempotency** | brak auto-idempotency key; conflict przy race document_version |
| **CAS** | `UPDATE studio_projects SET … WHERE document_version = expected` tylko jeśli potrzebne; snapshot content read under ownership |
| **Errors** | `NOT_OWNER`, `NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_SESSION` |
| **Audit** | `SFM_VERSION_ACCEPTED` |

### 4.2 `sfm_start_stage` / `sfm_complete_stage` (+ enqueue executor)

| | Start | Complete |
|--|-------|----------|
| **Params** | `version_id`, `kind` (`SFM_MIX`\|`SFM_MASTER`) | `version_id`, `kind`, `status`, `job_id?`, `error_code?` |
| **Caller** | owner (start) lub service | **service/worker only** |
| **Preconditions start** | version ACCEPTED+; `SFM_MIX` after Accept; `SFM_MASTER` only if `SFM_MIX` SUCCEEDED |
| **Preconditions complete** | stage RUNNING; walidacja wyniku joba; job SUCCEEDED **nie wystarcza** bez complete |
| **TX start** | PENDING→RUNNING; enqueue `render_jobs.kind` = `SFM_MIX_PREPARE` (stage `SFM_MIX`) lub `SFM_MASTER_BAKE` (stage `SFM_MASTER`) — **OD-SFM-ID-07** | — |
| **TX complete** | RUNNING→SUCCEEDED/FAILED; MASTER SUCCEEDED → retention_anchor, expires_at, EXPORTS_ELIGIBLE, `current_final`, supersede prior | |
| **CAS** | `UPDATE … WHERE status=PENDING` | `WHERE status=RUNNING` |
| **Idempotency job** | UNIQUE `(owner_id, idempotency_key)` na `render_jobs` | |
| **Errors** | `ILLEGAL_TRANSITION`, `FORBIDDEN` | `CONFLICT`, `FORBIDDEN_CLIENT`, `QC_FAILED` |
| **Audit** | `SFM_STAGE_STARTED` + `SFM_*_JOB_ENQUEUED` | `SFM_STAGE_COMPLETED` |

**OD-SFM-ID-07 (docs):** job kinds ≠ domain stage names; job SUCCEEDED ≠ stage complete; claim/dispatch SFM **osobne** od `claim_next_studio_export_job` / STUDIO poller; `mapJobKind` fail-closed (no unknown→MIX); no Contabo auto-enable; no auto FAILED→QUEUED; CHECK/XOR/version bind = Stage C GO.
**Zakaz:** E3 `kind=MIX` lub `STUDIO_EXPORT` jako tożsamość SFM; E3 complete path piszący `studio_final_stages`.
**Domain `SFM_MIX` SUCCEEDED ≠ mastering.**

### 4.3 `sfm_enqueue_quality_encode`

| | |
|--|--|
| **Params** | `p_version_id`, `p_quality`, `p_idempotency_key` |
| **Caller** | authenticated owner |
| **Preconditions** | version `EXPORTS_ELIGIBLE`; not expired; `resolveSfmQualityEntitlement` allow; **grant required** przed encode **lub** claim w tej samej TX (rekomendacja: grant najpierw) |
| **TX** | insert `render_jobs` **`kind=SFM_QUALITY_ENCODE`** (OD-SFM-ID-07) z snapshot wersji + quality; XOR/version bind = Stage C; **nie** mix_session/take; **nie** `STUDIO_EXPORT`/`MIX` |
| **Idempotency** | UNIQUE `(owner_id, idempotency_key)` EXISTS na `render_jobs` |
| **Errors** | `NOT_ELIGIBLE`, `QUALITY_DENIED`, `NO_GRANT`, `CONFLICT` |
| **Audit** | `SFM_QUALITY_ENQUEUED` |

### 4.4 `sfm_claim_version_grant` (atomowy grant + daily + slot)

| | |
|--|--|
| **Params** | `p_version_id uuid` |
| **Caller** | authenticated; `auth.uid()` owner wersji |
| **Preconditions** | version `EXPORTS_ELIGIBLE`; `expires_at` future; owner match |
| **Algorytm (jedna TX)** | 1) SELECT grant (user, version) → EXISTS → return (**no consume**). 2) `day_bucket` = Warsaw today. 3) Count DAILY grants today vs SFM limit. 4) Jeśli remaining > 0 → INSERT grant `source=DAILY`, `granted_qualities := SFM_PLAN_MATRIX[tier_now]` (snapshot). 5) Else `SELECT … FROM slots WHERE user_id AND day_bucket AND status='AVAILABLE' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1` → CONSUMED + `bound_version_id` → INSERT grant `source=PAID_SLOT` + snapshot. 6) Else DENY. |
| **Locks** | row lock **jednego** slotu; UNIQUE grant |
| **Multi-slot** | wiele AVAILABLE OK (OD-SFM-ID-03); consume dokładnie jeden |
| **Idempotency** | re-call zwraca istniejący grant |
| **Errors** | `LIMIT_EXCEEDED`, `NO_SLOT`, `NOT_ELIGIBLE`, `FORBIDDEN` |
| **Audit** | `SFM_GRANT_CREATED` \| `SFM_GRANT_REUSED` |

**Nigdy:** tworzyć grant z samego webhooka płatności.
**Strict snapshot:** download/encode wymaga `quality ∈ granted_qualities` aż do decyzji OD-SFM-ID-05.

### 4.5 `sfm_upsert_paid_slot` / `sfm_refund_paid_slot`

| | Upsert | Refund |
|--|--------|--------|
| **Params** | `payment_ref`, `user_id`, `day_bucket?` (server-derived prefer) | `payment_ref` |
| **Caller** | service (webhook) | service |
| **Effect** | INSERT **nowy** AVAILABLE (wiele/day OK); ON CONFLICT payment_ref → no-op success | AVAILABLE→REVOKED; CONSUMED→**no grant revoke**, no daily credit |
| **Idempotency** | UNIQUE `payment_ref` | same |
| **Errors** | `INVALID_PAYMENT` | safe no-op codes |
| **OD-04** | provider mapping **OPEN** | |

**Zakaz** wymuszania jednego AVAILABLE / user / day.
Out-of-order refund/upsert: fail-closed (rekomendacja: ledger event + upsert tworzy REVOKED jeśli refund już znany).

### 4.6 `sfm_promote_current_artifact`

| | |
|--|--|
| **Params** | `p_artifact_id` |
| **Caller** | service/worker only |
| **Preconditions** | artifact READY; QC passed; `sfm_version_id`+`sfm_quality` set; job SUCCEEDED; owner consistency |
| **TX** | `UPDATE` previous current `is_current=false` WHERE same (version, quality); `UPDATE` this `is_current=true`; polega na partial UNIQUE |
| **Concurrency** | przegrany dostaje unique_violation → mark non-current/FAILED |
| **Errors** | `QC_FAILED`, `CONFLICT`, `FORBIDDEN` |
| **Audit** | `SFM_ARTIFACT_PROMOTED` |

Upload **nie** ustawia `is_current` automatycznie.

### 4.7 Bezpieczne pobranie (app route — niekoniecznie RPC)

**Trasa SFM (OD-SFM-ID-01 ACCEPTED):** `GET /api/studio/artifacts/[artifactId]/download`.

| Krok | Check |
|------|-------|
| 1 | `requireUser` |
| 2 | Load artifact by id; reject client object_key |
| 3 | Domena z DB: `sfm_version_id IS NOT NULL` (else DENY on SFM route) |
| 4 | owner_id + project/version consistency |
| 5 | status READY; not deleted; not expired |
| 6 | job SUCCEEDED |
| 7 | grant exists (user, version) |
| 8 | `sfm_quality ∈ granted_qualities` (strict) + resolver |
| 9 | bucket allowlist |
| 10 | `createSignedUrl` TTL EXISTS `AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS` |
| 11 | **Nie logować** URL |

**TOCTOU:** checki 1–9 przed sign.

**Stara trasa `/api/mix/artifacts/…` po cutover:** jeśli `sfm_version_id IS NOT NULL` → **DENY**; E3 MIX/TAKE AuthZ **bez zmian**.

### 4.8 `sfm_expire_versions` (janitor)

| | |
|--|--|
| **Caller** | service/cron |
| **TX** | dla `expires_at <= now`: status EXPIRED; clear `current_final` if match; artifacts SFM → expired/non-current; **nie** DELETE grant rows |
| **Idempotency** | powtórne wywołanie no-op |
| **Isolation** | filtr tylko `sfm_version_id` / SFM tables — zero TAKE/E3 |

---

## 5. Model zagrożeń → kontrola

| Zagrożenie | Kontrola |
|------------|----------|
| IDOR cudzego artifact/version | owner checks + RLS SELECT own |
| READY-only download | grant + resolver wymagane na SFM route |
| URL reuse | krótki TTL; AuthZ przy każdym wydaniu |
| Po TTL | expire checks |
| Downgrade abuse | `granted_qualities` snapshot |
| Double grant / parallel claim | UNIQUE (user, version) + TX |
| Parallel slot consume | `FOR UPDATE` / UPDATE…RETURNING status=AVAILABLE |
| Webhook replay | UNIQUE payment_ref |
| Refund reorder | fail-closed ledger (§4.5) |
| TOCTOU | single handler ordering |
| Definer search_path | `SET search_path = public` (lub schema lock) |
| Excess EXECUTE | REVOKE FROM `anon`,`authenticated` dla worker RPC |
| Log leak | ban signed URLs / secrets in logs |
| E3 semantic bleed | osobna trasa SFM; deny SFM rows on mix route |

---

## 6. RLS / GRANT (wymagania)

Dla każdej nowej tabeli SFM:

1. `ENABLE ROW LEVEL SECURITY`.
2. Policy SELECT: `(select auth.uid()) = owner_id` lub `user_id`.
3. Policy UPDATE user: tylko gdy produkt tego wymaga; prefer mutacje via DEFINER RPC z checkiem uid.
4. Brak szerokiego `TO authenticated` bez predykatu wiersza (BOLA).
5. Funkcje DEFINER: nie w celu „obejścia RLS bez checka”; zawsze walidacja uid/service role guard.
6. Po migracji: advisors security (w Implementation GO).

Wzorce EXISTS: `prevent_*_privilege_escalation` triggers na studio/artifacts; claim RPC revoke patterns.

---

## 7. Warsaw day — kontrakt czasu

```text
warsaw_day_bucket(now timestamptz) → date
warsaw_day_bounds(day date) → (start_tstz, end_tstz)  -- [start, end)
```

- Slot expire job: `AVAILABLE` AND `day_bucket < warsaw_day_bucket(now())` → `EXPIRED`.
- Daily limit: count grants where `day_bucket = warsaw_day_bucket(now())` AND `source='DAILY'`.
- **Zakaz** użycia `utcDayWindowStart` dla SFM (FACT: beat downloads — inna domena).

---

## 8. Idempotencja — zestawienie

| Operacja | Klucz |
|----------|-------|
| Accept | document_version CAS (nie idempotentny „retry same accept” bez key — OK) |
| Enqueue quality | `render_jobs (owner_id, idempotency_key)` |
| Grant claim | UNIQUE (user, version) |
| Paid slot | UNIQUE payment_ref |
| Promote | partial UNIQUE current |
| Artifact per job | UNIQUE render_job_id |
| Object path | UNIQUE (bucket, object_key); jobId w path F02b |

---

## 9. Klasy błędów (publiczne, stabilne)

| Code | HTTP (app) | Znaczenie |
|------|------------|-----------|
| `NOT_OWNER` / `FORBIDDEN` | 403 | IDOR / ownership |
| `NOT_FOUND` | 404 | |
| `VERSION_CONFLICT` | 409 | CAS document |
| `ILLEGAL_TRANSITION` | 409 | stage order |
| `NOT_ELIGIBLE` | 403 | brak EXPORTS_ELIGIBLE / expired |
| `QUALITY_DENIED` | 403 | plan/grant |
| `NO_GRANT` | 403 | |
| `LIMIT_EXCEEDED` | 429/403 | daily |
| `NO_SLOT` | 403 | |
| `CONFLICT` | 409 | race promote/job |
| `DISABLED` | 503/403 | feature flag / jobs off |

Nie zwracać raw DB / storage errors użytkownikowi (wzorzec I.17 public failure contract).

---

## 10. Mapowanie do istniejącego kodu

| Potrzeba SFM | EXISTS dziś | Działanie |
|--------------|-------------|-----------|
| Signed URL | `artifact-download.ts` | Nowy serwis SFM; reuse TTL/bucket checks |
| Job idempotency | `render_jobs_owner_idempotency_uidx` | Reuse |
| Worker complete | `completeRealArtifactAfterEncode` | Rozszerzyć o promote + F03b expires — **osobne GO** |
| Capability WAV | `EXPORT_WAV` GOLD | **Nie** jako SFM product gate |
| Beat reserve slot | `reserve_beat_download_slot` | Wzorzec atomowości only |

---

## 11. Non-goals

- Implementacja SQL w tym pliku.
- Wybór Stripe/P24/etc. (OD-04).
- Zmiana AuthZ E3 MIX happy-path poza fail-closed split SFM rows.
- Client-side „trust me I have grant”.
