# E3.7 — PREMIUM RENDER — IMPLEMENTATION CLOSEOUT

**Type:** Implementation / documentation closeout (docs only — **not** Production Verify)
**Date:** 2026-09-29
**Owner Verification:** **PASS WITH FINDINGS**
**Production application (unchanged):** `183b2a4a7ea3cc8be7f0ac337e75e915ffdae0b9`
**Documentation baseline (pre-docs-commit):** `f9447479fec8203ac0ca456da2557b7ef65c21d5`
**E3.7 application commit:** **NONE YET** (implementation in worktree · await Owner Commit GO)

```text
E3.7 IMPLEMENTATION       = DONE (waves A–H)
OWNER VERIFICATION        = PASS WITH FINDINGS
DOCUMENTATION             = RECONCILED (this closeout)
COMMIT                    = NONE
PUSH                      = NONE
PRODUCTION DEPLOYMENT     = NONE (app remains 183b2a4)
PRODUCTION VERIFY         = NOT YET
E3 FLAGS                  = DARK (UNSET)
E3_RENDER_WORKER_SECRET   = UNSET
PRODUCTION RENDER         = NOT EXECUTED
MIGRATION                 = NONE
STORAGE                   = UNCHANGED (audio-artifacts private)
```

---

## Baseline

| Layer | SHA / note |
|-------|------------|
| **Production application** | `183b2a4` · `dpl_D5EfHdSSahouFftf5HK35wKSHmts` · E3.6 Basic MP3 · **DARK** |
| **Documentation tip** | `f944747` (E3.6 docs closeout) until Owner docs/app commit GO |
| **E3.6** | CLOSED / PRODUCTION VERIFIED · DARK |
| Prior E3 chain | E3.1→E3.5 shipped through `fbece37` |

---

## Scope shipped (code — uncommitted until Owner GO)

| Wave | Delivery |
|------|----------|
| **E3.7-A** | `server-pro-v1` Pro Mix — `MixProParams` (eqBands / multiband / deEsser / fxChain) + gain/pan + existing bus stages · no Basic fallback |
| **E3.7-B** | Master **Plan A** after Pro Mix — `gainDb` → `basicLimiter` → `clipProtect` → soft RMS (G5) · **OD-E37-01** · no `MasterProParams` |
| **E3.7-C** | HQ MP3 **320** kbps stereo · FFmpeg + libmp3lame · QC ±12% · re-decode · checksum |
| **E3.7-D** | WAV **44.1 kHz / 16-bit PCM / stereo** · QC · re-decode · checksum |
| **E3.7-E** | EXTERNAL worker dispatcher · HQ/WAV Final Truth lifecycle (READY only after QC+upload+DB) |
| **E3.7-F** | Download AuthZ: `quality_tier` → `capabilityForRenderTier` → `EXPORT_*` |
| **E3.7-G** | Thin Premium Export UX: HQ + WAV (+ Basic) |
| **E3.7-H** | Tests + typecheck + build + regression |

---

## Premium Final Truth (canonical)

```text
SOURCE
  → server-pro-v1 Pro Mix
  → server-pro-v1 Master Plan A
  → HQ MP3 320  OR  WAV 44.1/16/stereo
  → QC PASS
  → private audio-artifacts upload
  → DB insert READY
  → job SUCCEEDED
```

**Basic path (unchanged):** `server-basic-v1` → Basic MP3 128 only.
**Forbidden:** Premium labeled output from `server-basic-v1`.

**Preview ≠ Final:** client `webaudio-pro-v1` is approximation; Final Truth is `server-pro-v1`.

---

## Download AuthZ

| `quality_tier` | Capability |
|----------------|------------|
| `BASIC_MP3` | `EXPORT_BASIC_MP3` |
| `HQ_MP3` | `EXPORT_HQ_MP3` |
| `WAV` | `EXPORT_WAV` |

Also: owner · READY · job SUCCEEDED · private bucket · no client `object_key` · short signed TTL · live entitlement at download.

---

## Entitlement

| Actor | HQ/WAV create | HQ/WAV download |
|-------|---------------|-----------------|
| Free | DENY | DENY |
| Premium | ALLOW (caps) | ALLOW if capability live |
| Anon | DENY | DENY |

Snapshot at job create = processing SSOT. Live entitlement = download AuthZ.

---

## Verification evidence (Owner Verification)

| Gate | Result |
|------|--------|
| Tests `src/lib/audio` + `src/lib/mix` | **100/100 PASS** |
| Typecheck | **PASS** |
| Build | **PASS** |
| Security | **PASS** |
| Regression (Basic 128 / E3.5 / E3.6) | **PASS** |
| Owner Verification | **PASS WITH FINDINGS** |

---

## Findings (INFO · non-blockers)

| ID | Note |
|----|------|
| INFO-01 | G5 soft RMS = approximation · **not** full ITU-R BS.1770 (accepted OD-E37-01) |
| INFO-02 | E3.7 implementation uncommitted at docs closeout — await Owner Commit GO |
| INFO-03 | Production app still E3.6 @ `183b2a4` · E3.7 **not** Production-deployed · **not** Production-Verified |

---

## Owner Decisions locked

| ID | Decision |
|----|----------|
| **OD-E37-01** | Master Plan A (`MasterParameters`) after Pro Mix — no `MasterProParams` / True Peak / BS.1770 |
| **OD-E37-02** | Premium UX = HQ + WAV (Basic remains if entitled) |
| **OD-E37-03** | Bake↔encode duration ±5% QC = **OUT** |
| **OD-E36-04** | Native FFmpeg + libmp3lame on EXTERNAL worker (unchanged) |

---

## OUT OF SCOPE (unchanged)

STEMS · `artifact_kind` · payments · Premium catalog · public Free Audio · W6 matrix execution · Production enablement · Production Render · second render system · new bucket · DB migration · FFmpeg as app npm dependency · full Pro Master product expansion.

**W6:** OAD-05 blocks **public Free Audio** only — E3.7 Premium implementation **not** W6-blocked.

---

## Production safety (mandatory)

```text
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED = UNSET
E3_PUBLIC_AUDIO = UNSET
E3_RENDER_WORKER_SECRET = UNSET
E3 = DARK
PRODUCTION RENDER = NOT EXECUTED
```

Do **not** describe E3.7 as Production-enabled until separate Owner Production Verify / Enablement GO after commit+push+deploy.

---

## Remaining release gates

```text
OWNER COMMIT GO
→ PUSH GO
→ (auto) deploy observe
→ PRODUCTION VERIFY (if/when deployed)
→ POST-RELEASE docs tip sync (if needed)
→ CLOSE
```

---

## Related documents

| Doc | Role |
|-----|------|
| [PROJECT_STATE.md](../PROJECT_STATE.md) | Living state |
| [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) | Cold-start |
| [CHANGELOG.md](../CHANGELOG.md) | History |
| [E3_6_PRODUCTION_CLOSEOUT.md](./E3_6_PRODUCTION_CLOSEOUT.md) | Prior Production closeout |
| [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](../architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) | Architecture lock |
| [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](../architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md) | Wave plan |

```text
E3.7 IMPLEMENTATION CLOSEOUT = COMPLETE (docs)
NEXT = OWNER COMMIT GO
```
