# Studio Final Mix — Test Matrix

**Status:** `OWNER ACCEPTED (design docs)` — reconciled 2026-10-14 — **NOT EXECUTED**
**Date:** 2026-10-14 (reconciliation)
**Parent design:** [STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md](./STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md)
**Data model:** [STUDIO_FINAL_MIX_DATA_MODEL.md](./STUDIO_FINAL_MIX_DATA_MODEL.md)
**RPC/Security:** [STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md](./STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md)
**Analyzed tip:** `fdcca3b42a00d7039facc5eff40259f9799bf779`

```text
THIS DOCUMENT = TEST PLAN ONLY
DO NOT RUN against production
DO NOT claim implementation PASS from this file
OD-SFM-ID-01…04 ACCEPTED (docs)
```

---

## 1. Legenda

| Symbol | Znaczenie |
|--------|-----------|
| U | Unit (pure / source contract) |
| I | Integration (local app + DB) |
| D | Database / migration / RPC concurrency |
| S | Security / negative AuthZ |
| R | Regression (E3 / TAKE / RAW / legacy WAV) |
| G | Staging only (Storage / janitor) — osobne GO |

**Macierz planów (SSOT):** FREE 0 · BRONZE MP3_128/1 · SILVER MP3_128+MP3_192/2 · GOLD all/5.

---

## 2. Macierz plan × jakość

| # | Plan | Quality | Expect enqueue/download | Warstwy |
|---|------|---------|-------------------------|--------|
| P01 | FREE | any | DENY | U I S |
| P02 | BRONZE | MP3_128 | ALLOW (po grant) | U I |
| P03 | BRONZE | MP3_192 | DENY | U I S |
| P04 | BRONZE | MP3_320 | DENY | U S |
| P05 | BRONZE | WAV | DENY | U S |
| P06 | SILVER | MP3_128 | ALLOW | U I |
| P07 | SILVER | MP3_192 | ALLOW | U I |
| P08 | SILVER | MP3_320 | DENY | U S |
| P09 | SILVER | WAV | DENY | U S |
| P10 | GOLD | MP3_128/192/320/WAV | ALLOW | U I |
| P11 | UI shows locked qualities | all plans | visible + locked | U I |
| P12 | Client claims quality | any | server ignore/deny | S |

**Negatyw:** `EXPORT_WAV` capability **nie** jest jedyną bramką — BRONZE/SILVER nie wymagają GOLD do SFM MP3.

---

## 3. Accept, wersje, etapy

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| V01 | Accept z match `document_version` | version+stages PENDING | I D |
| V02 | Accept ze złym version | 409 VERSION_CONFLICT | I |
| V03 | Zapis projektu bez Accept | brak version row | I |
| V04 | Odsłuch ≠ Accept | brak grant/stages advance | I |
| V05 | Edycja po Accept | nowa treść wymaga nowego Accept | I |
| V06 | `SFM_MASTER` przed `SFM_MIX` SUCCEEDED | ILLEGAL_TRANSITION | D S |
| V07 | Job SUCCEEDED bez `sfm_complete_stage` | domain ≠ EXPORTS_ELIGIBLE | I D |
| V08 | E3 `kind=MIX` complete | **nie** mutuje `studio_final_stages` | R S |
| V09 | Supersede: nowy MASTER SUCCEEDED | stary nie jest current_final; historical label | I |
| V10 | Domain names | tylko `SFM_MIX`/`SFM_MASTER` | U |
| V11 | `SFM_MIX` = osobny executor job (OD-SFM-ID-04) | enqueue + bind version/stage | I D |
| V12 | `SFM_MIX` SUCCEEDED ≠ MASTER done | MASTER stage nadal PENDING | I |
| V13 | Concurrent SFM_MIX jobs same version | jeden winner / CONFLICT | D |
| V14 | Retry policy | no illegal auto-QUEUED | I R |

---

## 4. Granty i limit dzienny

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| G01 | Pierwszy grant BRONZE | DAILY consume 1/1 | I D |
| G02 | Re-download tej samej wersji | **no** consume | I D |
| G03 | Druga wersja tego samego dnia BRONZE | DENY bez slotu | I |
| G04 | SILVER 2 wersje / dzień | 2nd OK; 3rd DENY | I D |
| G05 | GOLD 5 wersji | 6th DENY | I |
| G06 | FREE grant | zawsze DENY | S |
| G07 | Concurrent double claim same version | jeden grant row | D |
| G08 | Concurrent claim two versions last daily | dokładnie limit winners | D |
| G09 | Nowa wersja ≠ dziedziczenie grantu | NO_GRANT aż claim | I |
| G10 | Grant ≠ READY artifact | READY bez grant → download DENY | S |
| G11 | Snapshot `granted_qualities` at FIRST_GRANT | equals plan matrix at grant time | U I |
| G12 | Quality ∉ snapshot | DENY (strict; OD-SFM-ID-05 OPEN) | S |
| G13 | Grant ≠ unlimited future qualities | upgrade bez expand → DENY new quality | S |

---

## 5. `Europe/Warsaw` + DST

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| W01 | Przed/po lokalnej północy | `day_bucket` zmienia się o północy Warsaw | U |
| W02 | Przejście DST wiosna | brak podwójnego limitu / dziury — granice `[start,next)` | U D |
| W03 | Przejście DST jesień | j.w. | U D |
| W04 | SFM **nie** używa `utcDayWindowStart` | source/contract assert | U R |
| W05 | Slot AVAILABLE wczoraj | EXPIRED po jobie expire | I D |

---

## 6. Płatny slot + refund (provider mock; OD-04 OPEN)

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| S01 | Upsert payment_ref → AVAILABLE | idempotent replay | I D |
| S02 | Claim przy limicie 0 + AVAILABLE | CONSUMED + grant PAID_SLOT + bind version | I D |
| S03 | Re-download nie zużywa slotu | slot pozostaje CONSUMED; brak 2nd consume | I |
| S04 | Unused slot po północy Warsaw | EXPIRED | I |
| S05 | Refund AVAILABLE | REVOKED; brak grant | I |
| S06 | Refund CONSUMED | grant **zostaje**; daily **nie** wraca | I S |
| S07 | Webhook duplikat | jedna row payment_ref | D |
| S08 | Refund przed upsert | fail-closed strategia z RPC contract | D |
| S09 | Parallel consume jednego AVAILABLE | jeden winner | D |
| S10 | Real Stripe/P24 | **OUT** aż OD-04 CLOSED | — |
| S11 | Dwa AVAILABLE tego samego dnia (OD-SFM-ID-03) | obie rows legal; claim zużywa jedną | I D |
| S12 | Trzy AVAILABLE + dwa claimy | dwa CONSUMED + jeden AVAILABLE left | D |
| S13 | Double-consume same slot id | drugi DENY / no-op | D |

---

## 7. Downgrade / historical qualities

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| D01 | Grant przy GOLD all qualities; downgrade BRONZE | re-download ∈ snapshot OK | I S |
| D02 | Po downgrade enqueue quality ∉ snapshot | DENY | I S |
| D03 | Grant BRONZE {128}; upgrade GOLD | do OD-SFM-ID-05: DENY 192 (strict) | U S |
| D04 | object_key / prior URL / READY alone | DENY | S |
| D05 | Po OD-SFM-ID-05 (jeśli expand ACCEPTED) | osobny zestaw — nie uruchamiać wcześniej | — |

---

## 8. Artefakty, promote, klucze, retencja

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| A01 | F02b key per QUALITY | ext mp3/wav; UUID assert | U |
| A02 | Reject unknown quality token | fail | U |
| A03 | ≤1 current READY/(version,quality) | partial UNIQUE | D |
| A04 | Concurrent encode same quality | jeden current; loser non-current | D |
| A05 | Retry same jobId | idempotent; no duplicate current games | I D |
| A06 | Promote only after QC | upload alone ≠ current | I |
| A07 | QC WAV 44100/16 + channels=2 (EXISTS `AUDIO_CODEC`) | assert | U I |
| A08 | QC MP3 bitrate 128/192/320 | po impl encode | U I |
| A09 | Legacy `…/jobs/{jobId}/WAV.wav` read | compatible policy | I R |
| A10 | No overwrite other version/quality object | distinct keys | I |
| A11 | Retention 90d from MASTER_SUCCEEDED | BRONZE=GOLD same SFM TTL | I |
| A12 | All qualities share expires_at | equal | I |
| A13 | TTL clears current_final | not presented as current | I |
| A14 | Tombstone/metadata retained | row exists | D |
| A15 | Janitor ignores TAKE/E3 | R | G R |
| A16 | Paid slot does not extend TTL | I | |

---

## 9. Download AuthZ i trasa

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| DL01 | SFM route + grant + quality | signed URL | I |
| DL02 | SFM route bez grant | 403 | S |
| DL03 | Cudzy artifactId | 403/404 | S |
| DL04 | MIX artifact na SFM route | DENY | S R |
| DL05 | SFM artifact (`sfm_version_id`) na `/api/mix/artifacts/…` po cutover | **DENY** (OD-SFM-ID-01) | S R |
| DL05b | Owner+READY SFM via mix route po cutover | nadal DENY | S |
| DL06 | E3 MIX download unchanged | PASS legacy AuthZ | R |
| DL07 | TAKE_EXPORT download unchanged | PASS | R |
| DL08 | Client object_key query | reject | S |
| DL09 | Expired artifact | DENY | S |
| DL10 | Job not SUCCEEDED | DENY | S |
| DL11 | Re-issue URL | no grant/slot consume | I |
| DL12 | Logs bez signed URL | source/ops check | S |

---

## 10. Resolver SFM vs Premium capability

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| Q01 | SILVER SFM MP3_192 ALLOW | mimo braku EXPORT_WAV | U I |
| Q02 | GOLD-only EXPORT_WAV nie blokuje BRONZE MP3_128 SFM | ALLOW | U I |
| Q03 | Legacy WAV MVP path (flag OFF) | nadal EXPORT_WAV gate — FACT | R |
| Q04 | `canExportOwnTake` BRONZE+192 | **nie** wpływa na SFM BRONZE | R U |
| Q05 | Beat `downloadsDaily` | **nie** współdzielone z SFM | R |

---

## 11. Regresja istniejących domen

| # | Case | Expect | Warstwy |
|---|------|--------|---------|
| R01 | STUDIO_EXPORT WAV enqueue (legacy flag) | bez zmian semantyki aż cutover | R |
| R02 | `claim_next_studio_export_job` | nie psuje się | R |
| R03 | Empty-session STUDIO_EXPORT | istniejące kontrakty I.15/I.17 | R |
| R04 | E3 MIX bake/download | untouched | R |
| R05 | TAKE_EXPORT ladder | untouched | R |
| R06 | RAW take download ledger UTC | untouched | R |
| R07 | Sacred WIP eligibility | **nie** modyfikowany w SFM GO | R |
| R08 | `audio_artifacts` XOR mix/take/project | intact | D R |

---

## 12. Rollout / PASS-STOP (test gating)

| Etap | Minimalny zestaw testów | STOP jeśli |
|------|-------------------------|------------|
| D1 schema | D: constraints, RLS enable | missing UNIQUE current |
| D2 grant RPC | G07 G08 W01 S09 | double grant |
| D3 stages | V06 V07 V08 | E3 writes stages |
| D4 encode | A03–A06 A01 | silent overwrite |
| D5 download | DL01–DL07 Q01–Q02 | IDOR lub E3 bleed |
| D6 janitor staging | A11–A15 | cross-domain delete |
| D7 slot mock | S01–S08 | grant revoked on post-use refund |

Production e2e / Contabo: **osobne GO** — nie część docs GO.

---

## 13. Istniejące testy do reuse (FACT)

| Plik | Status | Uwaga |
|------|--------|-------|
| `studio-export-bake-contract.test.ts` | EXISTS | F02 WAV-only — rozszerzyć o F02b po impl |
| `studio-export-service.test.ts` | EXISTS | enqueue |
| `studio-export-resample-i45.test.ts` | EXISTS | PCM 44.1 |
| `e3-6-e-download.test.ts` | EXISTS | shared download — regresja |
| `w2a-premium-foundation.test.ts` | EXISTS | matrix Premium ≠ SFM |
| `p4-foundation.test.ts` TAKE ladder | EXISTS | izolacja SFM |
| Testy grant/slot/Warsaw SFM | MISSING | dodać przy Implementation GO |

---

## 13b. OD-SFM-WORKER-KIND-REJECT (plan — local unit/contract)

| # | Scenariusz | Expect | Warstwy |
|---|------------|--------|---------|
| KR01 | RUNNING + matching `worker_ref` + SFM shape | `FAILED` / `KIND_OUT` | U D |
| KR02 | Wrong `worker_ref` | empty / no mutate | U D S |
| KR03 | Already terminal | empty / no mutate | U D |
| KR04 | Parallel reject | ≤1 mutate | D |
| KR05 | Poller unsupported kind | reject RPC · no bake · no requeue | U |
| KR06 | RPC cas_miss / fail | no `markJobFailed` fallback | U |
| KR07 | Bound job FAILED | stage `RECOVERY_REQUIRED` (no auto-retry) | U |
| KR08 | STUDIO poller isolation | no SFM reject wire | R |

Remote Postgres concurrency / live service_role ACL = osobne GO (nie część local unit).

## 14. Non-goals tej macierzy

- Uruchamianie testów produkcyjnych.
- Certyfikacja OD-04 real checkout.
- Bit-perfect Live↔Offline (poza zakresem SFM product AuthZ).
- Twierdzenie, że QC MP3 już EXISTS dla STUDIO multi-quality (dziś WAV-only FACT).
- Orphan kill/grace timeout recovery (`OD-SFM-WORKER-ORPHAN-TIMEOUT`).
