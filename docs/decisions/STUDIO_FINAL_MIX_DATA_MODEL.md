# Studio Final Mix — Data Model

**Status:** `OWNER ACCEPTED (design docs)` — reconciled 2026-10-14 · **OD-SFM-ID-07 CLOSED 2026-10-14** · Stage C CHECK/XOR/kinds **NOT IMPLEMENTED**
**Date:** 2026-10-14 (reconciliation; ID-07 accept same day)
**Parent design:** [STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md](./STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md)
**RPC/Security:** [STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md](./STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md)
**Analyzed tip (design reconciliation):** `fdcca3b42a00d7039facc5eff40259f9799bf779` · **OD-SFM-ID-07 discovery tip:** `a4ea89c5b1c8cb74aec243a002ca22805fe293e9`

```text
NO MIGRATIONS FROM THIS DOCUMENT
REUSE FIRST — new tables only where existing model cannot hold domain invariants
≠ E3 MIX / TAKE_EXPORT / RAW / STUDIO_EXPORT as SFM identity
OD-SFM-ID-01…04 + OD-SFM-ID-07 ACCEPTED (docs) · OD-SFM-ID-05/06 · OD-04 OPEN
```

---

## 1. Istniejący model (FACT)

| Encja / element | Status | Dowód | Rola dziś |
|-----------------|--------|-------|-----------|
| `studio_projects` | EXISTS | migracja `p5_1_studio_project_…` | Projekt edytowalny; `document_version` CAS |
| `render_jobs` | EXISTS | E3 foundation + `studio_export_render_job_kind` | Today: `STUDIO_EXPORT` / `MIX` / `TAKE_EXPORT` · SFM kinds **OD-SFM-ID-07 ACCEPTED docs** (Stage C) |
| `render_jobs.document_snapshot` | EXISTS | `20261010185020_…` | Snapshot przy enqueue (nie Accept) |
| `audio_artifacts` | EXISTS | E3 + `project_id` XOR | READY artifact; UNIQUE `render_job_id` |
| `audio_artifacts` UNIQUE `(storage_bucket, object_key)` | EXISTS | indeks produkcyjny | Brak silent path collision |
| `premium_entitlements` | EXISTS | W2-A | Plan użytkownika |
| `beat_download_*` / `beat_access_grants` | EXISTS | 1.8A / Wave5 | **Wzorce** — inna domena |
| `studio_final_*` / grants / slots SFM | MISSING | inventory | — |
| `current_final_version_id` | MISSING | brak kolumny na `studio_projects` | — |

**Nie tworzyć** nowego bucketa Storage ani nowej domeny `ARTIFACT` poza rozszerzeniem `audio_artifacts`.

---

## 2. Zasada projektowa

1. Projekt (`studio_projects`) pozostaje mutowalny.
2. Finalizacja żyje w **osobnej** niezmiennej wersji.
3. Etapy domenowe ≠ wiersze jobów.
4. Grant ≠ wiersz artefaktu.
5. Historia artefaktów: wiele wierszy; co najwyżej jeden **current** na `(version_id, quality)`.

---

## 3. Proponowane encje

Nazwy tabel = propozycja Implementation GO (mogą być doprecyzowane w migracji, bez zmiany semantyki).

### 3.1 `studio_final_versions` — NOWA

| Pole | Typ (logiczny) | Opis |
|------|----------------|------|
| `id` | uuid PK | `versionId` |
| `project_id` | uuid FK → `studio_projects` ON DELETE RESTRICT | |
| `owner_id` | uuid NOT NULL | = owner projektu w chwili Accept |
| `source_document_version` | int NOT NULL | CAS wartość przy Accept |
| `content_snapshot` | jsonb NOT NULL | niezmienna kopia dokumentu |
| `content_digest` | text NOT NULL | fingerprint |
| `accepted_at` | timestamptz NOT NULL | |
| `status` | text/enum | patrz §4.1 |
| `retention_anchor_at` | timestamptz NULL | set przy `SFM_MASTER` SUCCEEDED |
| `expires_at` | timestamptz NULL | `anchor + 90 days` |
| `superseded_by` | uuid NULL FK self | |
| `created_at` / `updated_at` | timestamptz | |

**Odpowiedzialność:** niezmienna zaakceptowana treść + retencja wersji.

**Indeksy:** `(project_id, accepted_at DESC)`; `(owner_id, accepted_at DESC)`; partial `(expires_at) WHERE status <> 'EXPIRED'`.

**Relacja do istniejącego:** nie zastępuje `document_snapshot` na historycznych jobach WAV; nowe Accepty są SSOT wersji.

### 3.2 Rozszerzenie `studio_projects` — ROZSZERZENIE

| Pole | Opis |
|------|------|
| `current_final_version_id` | uuid NULL FK → `studio_final_versions` |

Po TTL / supersede: wskaźnik czyszczony zgodnie z kontraktem (wersja historyczna może nadal istnieć z grantem).

### 3.3 `studio_final_stages` — NOWA

| Pole | Opis |
|------|------|
| `id` | uuid PK |
| `version_id` | uuid FK |
| `kind` | `SFM_MIX` \| `SFM_MASTER` |
| `status` | `PENDING` \| `RUNNING` \| `SUCCEEDED` \| `FAILED` |
| `job_id` | uuid NULL → `render_jobs.id` (ref wykonawczy) |
| `error_code` | text NULL |
| `started_at` / `finished_at` | timestamptz NULL |

**UNIQUE** `(version_id, kind)`.

**Zakaz:** zapisu przez ścieżki E3 `kind=MIX`. Stage update tylko przez kontrakt SFM (RPC service/worker).

### 3.4 `studio_final_version_grants` — NOWA

| Pole | Opis |
|------|------|
| `id` | uuid PK |
| `user_id` | uuid NOT NULL |
| `version_id` | uuid FK |
| `source` | `DAILY` \| `PAID_SLOT` |
| `granted_at` | timestamptz |
| `granted_qualities` | text[] NOT NULL | **historyczny zakres** — snapshot plan qualities w chwili FIRST_GRANT (OD-SFM-ID-02) |
| `day_bucket` | date NOT NULL | kalendarzowy dzień `Europe/Warsaw` przy grant |
| `paid_slot_id` | uuid NULL FK slot |

**UNIQUE** `(user_id, version_id)`.

**Odpowiedzialność:** grant **wersji** (nie pojedynczej jakości) + zapis historycznego zakresu jakości.
**Nie** oznacza nieograniczonego dostępu do jakości spoza `granted_qualities` ani do pliku po TTL.
Expand `granted_qualities` po upgrade: **OD-SFM-ID-05 OPEN** (do czasu: strict snapshot).

### 3.5 Limit dzienny — preferencja bez osobnej tabeli

**Opcja A (rekomendowana MVP):** policz granty `source='DAILY'` dla `(user_id, day_bucket=warsaw_today)` w RPC claim.
**Opcja B:** tabela `studio_final_daily_usage(user_id, day_bucket, used int)` z CAS — tylko jeśli pomiary pokażą potrzebę.

Nie współdzielić z `beat_download_events` / `take_download_events`.

### 3.6 `studio_final_paid_day_slots` — NOWA

| Pole | Opis |
|------|------|
| `id` | uuid PK |
| `user_id` | uuid |
| `day_bucket` | date (Warsaw) |
| `status` | `AVAILABLE` \| `CONSUMED` \| `EXPIRED` \| `REVOKED` |
| `payment_ref` | text NOT NULL | idempotency zewnętrzna |
| `amount_pln` | numeric | 7.99 dokumentacyjnie |
| `bound_version_id` | uuid NULL | set przy consume |
| `consumed_at` | timestamptz NULL |
| `created_at` / `updated_at` | |

**UNIQUE** `(payment_ref)` — idempotencja płatności.

**OD-SFM-ID-03 ACCEPTED:** **wiele** wierszy `AVAILABLE` dla tego samego `(user_id, day_bucket)` jest **dozwolone**.
**Zakaz** partial UNIQUE „1 AVAILABLE / user / day”.

Indeksy pomocnicze: `(user_id, day_bucket, status)` WHERE `status='AVAILABLE'` (wybór atomowy przy claim).

Refund: przejście statusu + audit; osobna tabela eventów opcjonalna. Provider = **OD-04 OPEN**.

### 3.7 Rozszerzenie `audio_artifacts` — ROZSZERZENIE

| Pole | Opis |
|------|------|
| `sfm_version_id` | uuid NULL FK → `studio_final_versions` |
| `sfm_quality` | text NULL | `MP3_128` \| `MP3_192` \| `MP3_320` \| `WAV` |
| `is_current` | boolean NOT NULL DEFAULT false |

**CHECK (propozycja):** jeśli `sfm_version_id IS NOT NULL` → `project_id IS NOT NULL` AND `mix_session_id IS NULL` AND `take_id IS NULL` AND `sfm_quality IS NOT NULL`.

**Partial UNIQUE:**

```text
UNIQUE (sfm_version_id, sfm_quality)
  WHERE is_current = true
    AND status = 'READY'
    AND deleted_at IS NULL
```

Zachować: UNIQUE `render_job_id`; UNIQUE `(storage_bucket, object_key)`; XOR mix/take/project.

Legacy wiersze WAV MVP: `project_id` set, `sfm_version_id` NULL — bez `is_current` SFM.

### 3.8 Warstwa jobów — REUSE `render_jobs` (**OD-SFM-ID-04** + **OD-SFM-ID-07 ACCEPTED**)

| Potrzeba | Decyzja |
|----------|---------|
| Domain stage `SFM_MIX` | Executor job `kind=SFM_MIX_PREPARE` bound to `version_id` + stage (nie inline-only) |
| Domain stage `SFM_MASTER` | Executor job `kind=SFM_MASTER_BAKE` only after domain `SFM_MIX` SUCCEEDED |
| Quality encode | Executor job `kind=SFM_QUALITY_ENCODE` per `(versionId, QUALITY)` + idempotency key (lazy) |
| Exact `kind` strings | **OD-SFM-ID-07 ACCEPTED / CLOSED:** `SFM_MIX_PREPARE` · `SFM_MASTER_BAKE` · `SFM_QUALITY_ENCODE` |
| Domain stages | `studio_final_stages.kind` remains **only** `SFM_MIX` \| `SFM_MASTER` (≠ job kind names) |
| Claim worker | Osobne claim/dispatch SFM — **nie** reuse `claim_next_studio_export_job` / STUDIO poller |
| `mapJobKind` / dispatch | Fail-closed na nieznany kind — **zakaz** fallback unknown → `MIX` |
| Contabo | **Nie** auto-enable nowych kinds w pollerze STUDIO_EXPORT — osobne Ops GOs |
| Retry | Brak auto `FAILED` → `QUEUED` (istniejący kontrakt) |
| Stage C schema | Version-id bind / CHECK / XOR / claim RPC = **Implementation GO** (nie ten docs ACCEPT) |

**History (superseded):** earlier drafts marked exact kind strings as **OD-SFM-ID-07 OPEN** with the same example names — those names are now **ACCEPTED**.

**Zakaz identity SFM:** `kind='MIX'` · `kind='STUDIO_EXPORT'` (E3 / legacy Studio WAV unchanged).
Job `SUCCEEDED` alone ≠ domain stage complete — explicit stage↔job bind + `sfm_complete_stage`.
`stages.job_id` → `render_jobs.id` (ref tylko).

## 4. Stany i przejścia (dane)

### 4.1 Version `status` (propozycja wartości)

| Status | Znaczenie |
|--------|-----------|
| `ACCEPTED` | Accept zapisany; stages mogą być PENDING |
| `EXPORTS_ELIGIBLE` | `SFM_MASTER` SUCCEEDED; grant/encode dozwolone |
| `SUPERSEDED` | nowszy Accept / nowy current |
| `EXPIRED` | po TTL F03b |

Szczegółowe stany MIX/MASTER trzymane w `studio_final_stages`, nie jako jedyny enum wersji (unika eksplozji stanów).

### 4.2 Stage + executor job

```text
Stage: PENDING → RUNNING → SUCCEEDED | FAILED
Job:   QUEUED → RUNNING → SUCCEEDED | FAILED   (istniejąca semantyka render_jobs)
```

- Enqueue job gdy stage przechodzi do RUNNING (lub atomowo z start).
- Job SUCCEEDED **nie** ustawia stage SUCCEEDED bez `sfm_complete_stage` + walidacja.
- Illegal: `SFM_MASTER` zanim `SFM_MIX` domain SUCCEEDED.
- Retry: nowy job / attempt wg worker policy — **bez** auto-retry do QUEUED wbrew Contabo SSOT.

### 4.3 Slot (wiele AVAILABLE)

```text
AVAILABLE → CONSUMED   (atomowo przy grant; bind version_id)
AVAILABLE → EXPIRED    (midnight Europe/Warsaw + DST)
AVAILABLE → REVOKED    (refund before use)
CONSUMED  → terminal   (refund nie cofa grantu, nie re-credit daily)
```

Wiele `AVAILABLE` równolegle OK. Consume wybiera **jeden** wiersz (CAS).

### 4.4 Artifact current

```text
insert READY is_current=false
→ promote → is_current=true (unique)
→ TTL / replace → previous is_current=false (history retained)
→ EXPIRED / deleted_at tombstone
```

---

## 5. Relacje (diagram logiczny)

```text
studio_projects 1──* studio_final_versions
studio_projects 0..1── current_final_version_id → studio_final_versions

studio_final_versions 1──2 studio_final_stages (MIX, MASTER)
studio_final_versions 1──* studio_final_version_grants
studio_final_versions 1──* audio_artifacts (sfm_version_id)

studio_final_paid_day_slots 0..1──* grants (via paid_slot_id)
render_jobs 1──0..1 audio_artifacts (render_job_id UNIQUE)
studio_final_stages.job_id → render_jobs (optional)
```

---

## 6. Czas `Europe/Warsaw`

- `day_bucket`: `(timestamptz AT TIME ZONE 'Europe/Warsaw')::date`.
- Granice doby: `[local midnight, next local midnight)` → UTC Instant.
- DST: wyliczać z TZ, **nie** z UTC-date (`utcDayWindowStart` jest **złą** semantyką dla SFM — EXISTS dla beatów).

Wzorce pomocnicze w kodzie (nie SFM): formatowanie Warsaw w `src/lib/admin/users-mutate.ts` — reuse **pomysłu**, nie tabel beatów.

---

## 7. Retencja i tombstone

| Po TTL | Akcja danych |
|--------|----------------|
| Version | `status=EXPIRED`; clear project `current_final` jeśli wskazuje tę wersję |
| Artifacts SFM | `status` EXPIRED (lub equiv.); `is_current=false`; wiersz zostaje |
| Grant | wiersz zostaje (audit); download DENY bo plik/expired |
| Storage object | purge **osobna** polityka janitor (nie w tym samym momencie co clear pointer) — Implementation GO |

Nie zmieniać retencji TAKE / E3 / RAW.

---

## 8. Macierz planów (dane referencyjne resolvera)

Przechowywana w **kodzie SSOT** (nie w DB tier matrix Premium):

| Plan | Qualities | Daily first grants |
|------|-----------|-------------------:|
| FREE | ∅ | 0 |
| BRONZE | MP3_128 | 1 |
| SILVER | MP3_128, MP3_192 | 2 |
| GOLD | MP3_128, MP3_192, MP3_320, WAV | 5 |

`granted_qualities` na grancie = kopia listy w chwili FIRST_GRANT.

---

## 9. Kompatybilność legacy WAV

| Klasa | Model |
|-------|--------|
| Pre-F02b object keys | bez migracji rename; `object_key` SSOT |
| Wiersze bez `sfm_version_id` | legalne; poza partial UNIQUE current SFM |
| Nowe encode po GO | zawsze `sfm_version_id` + `sfm_quality` + F02b key |

Polityka AuthZ legacy po cutover: OPEN Owner (Implementation Design §12.1).

---

## 10. RLS (wysoki poziom)

Szczegóły GRANT/REVOKE: [RPC_SECURITY](./STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md).

| Tabela | authenticated SELECT | INSERT/UPDATE user | service/worker |
|--------|---------------------|----------------------|----------------|
| versions / stages / grants / slots | własne `owner_id`/`user_id` | głównie via RPC SECURITY DEFINER z checkiem uid | full dla worker paths |
| `audio_artifacts` SFM cols | istniejące + ownership | brak client insert | worker complete/promote |

Views: jeśli dodawane — `security_invoker` (Postgres 15+) lub revoke anon/auth.

---

## 11. Mapowanie EXISTS → target

| Target invariant | Realizacja |
|------------------|------------|
| Accept immutable | `studio_final_versions` row |
| SFM_MIX / SFM_MASTER | `studio_final_stages` |
| ≤1 current/(version,quality) | partial UNIQUE + promote RPC |
| Grant ≠ file | `studio_final_version_grants` |
| 90d shared | version `expires_at` propagowany do artifacts |
| Warsaw daily | `day_bucket` + RPC count |
| Slot B | `studio_final_paid_day_slots` |

---

## 12. Non-goals modelu

- Duplikowanie `premium_entitlements`.
- Wspólna tabela limitów z beatami.
- Używanie `mix_sessions` jako wersji SFM.
- Nowy Storage bucket.
- SQL migracji w tym dokumencie.
