# STORAGE-ARCH-01 — AUDIT REPORT (SSOT)

**Type:** Architecture Audit  
**Date:** 2026-10-01  
**Epic:** `STORAGE-ARCH-01`  
**Status:** **PASS WITH FINDINGS** · **OWNER REVIEW = PASS**  
**LIVE VERIFICATION:** AVAILABLE (Supabase project `rzzxrgcdogkybkiidqgw`)

```text
AUDIT                        = COMPLETE / PASS WITH FINDINGS
RCA                          = COMPLETE
PLAN                         = COMPLETE
ARCHITECTURE REVIEW          = PASS WITH FINDINGS
FINAL ARCHITECTURE REVIEW    = PASS WITH FINDINGS (Owner-accepted)
OWNER REVIEW                 = PASS
DESIGN FREEZE                = LOCKED — STORAGE_ARCH_01_DESIGN_FREEZE.md
IMPLEMENTATION               = NONE
STORAGE-ARCH-02              = NOT STARTED
COMMIT / PUSH / DEPLOY       = NONE (audit/freeze authorship)
```

**Precedents (read-only):**

| Document | Role |
|----------|------|
| [STORAGE_ARCH_01_DESIGN_FREEZE.md](./STORAGE_ARCH_01_DESIGN_FREEZE.md) | Owner-locked Storage Architecture V1 |
| [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](../architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) | E3 Hybrid C · OAD-07 `audio-artifacts` |
| [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) | PE living state · F-PE-04 janitor deferred |
| Phase 1.5 / Recording Wave 1 migrations | `beat-audio` · `take-audio` foundations |

**This document does not:** implement · migrate keys · create buckets · run janitor · mutate Production.

---

## 1. Baseline (at audit)

| Pole | Wartość |
|------|---------|
| Production application | `6dfd201` |
| Repository HEAD / docs tip | `a8e9356` |
| Worker bootstrap | `92496d4` |
| Production deployment | `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` |
| E3 flags | Mix ON · Jobs ON · PUBLIC_AUDIO ON |
| Worker | STOPPED |
| E3 | GREEN · AC-PE-12 PASS · GO #5 PASS |

---

## 2. Executive findings

1. Hipoteza **Vercel AuthZ → Supabase DB+Storage durable → Contabo ephemeral** jest **potwierdzona** przez kod i LIVE.
2. Trzy prywatne bucket’y już istnieją i pokrywają domeny V1 — nie potrzeba „mega” bucketu.
3. E3 jest fundamentem **Mix/export**, nie zastępuje `beat_audio_assets`.
4. Katalog bitów = fizyczny **MASTER** + fallback PLAYBACK/DOWNLOAD (brak osobnych derivatives).
5. **HIGH:** drift kluczy USER — 51 legacy vs 2 canonical vs 3 platform.
6. **MEDIUM:** brak janitora `audio-artifacts` (F-PE-04); orphan objects `beat-audio` (~86 vs 56 rows).
7. Backup / artwork bucket / STEMS = poza obecnym modelem.

---

## 3. LIVE Storage snapshot

| Bucket | public | Objects | Size ≈ |
|--------|--------|---------|--------|
| `beat-audio` | false | 86 | ~215 MB |
| `take-audio` | false | 3 | ~5 MB |
| `audio-artifacts` | false | 2 | ~940 kB |

`storage.objects` policies: **0** (deny-by-default + service_role / signed URLs).

| Table | Rows ≈ |
|-------|--------|
| `beats` | 67 |
| `beat_audio_assets` | 56 (all MASTER READY active) |
| `takes` | 74 |
| `mix_sessions` | 1 |
| `render_jobs` | 2 |
| `audio_artifacts` | 2 |
| `premium_entitlements` | 0 |

**Key shape (beat-audio USER):**

| Shape | Count |
|-------|-------|
| Legacy `user/{owner}/{beatId}/master/{assetId}.bin` | **51** |
| Canonical `user/{owner}/{beatId}/{assetId}/master.bin` | **2** |
| Platform `platform/{beatId}/{assetId}/master.bin` | **3** |

---

## 4. RCA (summary)

| Root cause | Evidence | Effect |
|------------|----------|--------|
| Legacy vs canonical USER key convention | LIVE 51 vs code builder | binding risk on replace/upload; read path OK (key from DB) |
| Artifacts janitor deferred (F-PE-04) | PE freeze + no cron code | expiry AuthZ only; Storage GC missing |
| Catalog ≠ Mix quality model | only MASTER physical; E3 tiers on artifacts | product confusion risk if conflated |
| No backup layer | no archive bucket/docs | scale risk for producer masters |
| Contabo never durable | worker pipeline + PE audits | correct; must stay locked |

---

## 5. Architecture Review (audit-time)

**Status: PASS WITH FINDINGS**

| ID | Severity | Topic |
|----|----------|-------|
| AR-01 | HIGH | Legacy USER storage keys |
| AR-02 | MEDIUM | Artifacts janitor deferred |
| AR-03 | MEDIUM | Orphan beat-audio objects |
| AR-04 | MEDIUM | No physical beat derivatives |
| AR-05 | LOW | No artwork bucket |
| AR-06 | MEDIUM | No backup design |
| AR-07 | LOW | Render retry loop incomplete |
| AR-08 | INFO | Docs `/tmp/render` vs real `e3-mp3-*` |

Owner Decisions OD-SA-01…10 locked in Design Freeze — findings become planned waves, not silent accept.

---

## 6. Out of scope (audit)

Implementation · migrations · RLS · bucket create · file moves · janitor run · worker/env/deploy · rewriting E3 historical OD locks.

---

## 7. Next document

**Canonical freeze:** [STORAGE_ARCH_01_DESIGN_FREEZE.md](./STORAGE_ARCH_01_DESIGN_FREEZE.md)
