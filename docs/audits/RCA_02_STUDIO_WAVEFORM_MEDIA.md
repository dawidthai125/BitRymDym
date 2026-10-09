# RCA-02 — Studio Waveform / Media (BEAT_REF grey clip)

**Type:** Root Cause Analysis · read-only diagnostics  
**Date:** 2026-10-09  
**Owner:** Prezes Dawid  
**Related freeze:** [STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md](../decisions/STUDIO_VISUAL_PARITY_V2_DESIGN_FREEZE.md) §21 **FOLLOW-UP 01**  
**V2 release status:** unchanged — **GREEN / RELEASE VERIFIED / CLOSED** @ `44f7cbd` (not reopened)

```text
VERDICT                        = HISTORICAL ISSUE NOT REPRODUCED
ROOT CAUSE                     = NOT ESTABLISHED
GLOBAL RCA CLOSURE             = NO
V2 FOLLOW-UP 01 STATUS         = remains NON-BLOCKING / FOLLOW-UP
PRODUCTION MUTATION            = 0
APP CODE MUTATION              = 0
COMMIT / PUSH / DEPLOY         = 0
```

---

## 1. Scope

| Item | Value |
|------|--------|
| Symptom (historical) | PUBLISHED beat in Studio showed solid grey BEAT_REF clip (no waveform peaks); transport briefly „Bit oczekuje na załadowanie” then „Gotowy” |
| Environment | Local Studio `http://localhost:3000` · authorized session |
| Project under test | `d07f3011-8a64-4d90-a54a-cd50d1219b6a` |
| Beat | `80a79d5b-e341-42eb-8e37-9345bdb2f06b` · status **PUBLISHED** |
| Clip | `BEAT_REF` with `source_beat_id` matching `studio_projects.beat_id` |
| Repository HEAD (session) | `a5ceb5ccdef36d950981348fd889104e548fbabd` (`main` = `origin/main`) |
| App feature baseline (V2) | `44f7cbd` · dual-plane: repo tip ≠ feature SHA ≠ production dpl |

**Not in scope:** implementation, logging patches, CORS/Storage config changes, production deploy, attach/create of new fixtures by agents.

---

## 2. Confirmed facts (DIRECTLY OBSERVED)

- Fixture consistent: `project.beat_id === BEAT_REF.source_beat_id`; beat **PUBLISHED**.
- Transport active: Play → „Odtwarzanie” / „Gotowy”; separate persist label „Gotowe” ≠ waveform readiness.
- After cold navigation to `/studio/p/d07f3011-…`: `data-load-state="ready"`, `data-peaks-per-second="1000"`, no `studio-waveform-error`.
- Canvas showed bipolar peaks (not a solid grey empty clip).
- Performance Resource Timing: cold-load `initiatorType: fetch` to `/storage/v1/object/sign/beat-audio` (query present; signed URL not recorded).
- Separate transport path observed as `initiatorType: audio` to the same storage path family.
- Post-load re-fetch of the **same** signed storage object (diagnostic probe, not the original cold request): **HTTP 200**, `Content-Type: audio/mpeg`, `Response.type = cors`, body ~2.8 MB, no CORS TypeError.
- Historical solid-grey clip symptom **not** reproduced in this session.

---

## 3. NOT VERIFIED

- Exact HTTP status / CORS headers of the **first** cold-load peaks `fetch` (Cursor Browser did not expose DevTools Network status; `Page.addScriptToEvaluateOnNewDocument` fetch hook did not apply before navigation).
- Root cause of the historical FOLLOW-UP 01 grey clip.
- Reproducibility on other beats, cold cache, production deployment, or multi-tab races.
- Whether RCA-01 hypothesis (transport Ready ≠ peaks success) is the historical mechanism — remains hypothesis without a failing session.

---

## 4. Code-based context (not a root-cause claim)

Independent paths (unchanged architecture):

- **Transport:** `requestBeatAudioAccess` → signed URL → `StudioAudioEngine`
- **Waveform:** `StudioClipWaveform` → `resolveStudioWaveformPeaks` → `studioPeaksFromAudioUrl` → `fetch` → `decodeAudioBufferForStudioPeaks` → canvas

`data-load-state="ready"` requires successful peaks resolution in current UI code; it does **not** by itself prove the cold-request HTTP status.

---

## 5. Verdict

**`HISTORICAL ISSUE NOT REPRODUCED`**

Meaning:

- On the verified local fixture, the grey-clip symptom did not appear after cold reload.
- This does **not** prove the issue never occurs elsewhere.
- Root cause remains **NOT ESTABLISHED**.
- RCA is **not** globally closed.

---

## 6. Resume conditions (Owner / Architect)

Resume RCA-02 (or open RCA-03) only if **any** of:

1. Solid grey BEAT_REF clip (no peaks) reproduces on a documented project + PUBLISHED beat with Network evidence; or  
2. Cold-load peaks `fetch` is observed with non-2xx / CORS failure / decode failure while transport Ready; or  
3. Owner authorizes a dedicated diagnostic with DevTools Network capture on a disposable fixture.

Do **not** implement waveform “fixes” without a confirmed failing path.

---

## 7. Integrity

- Sacred WIP `src/lib/takes/recording-eligibility-service.ts` expected SHA256  
  `5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9` — verified MATCH around this closeout documentation.  
- No app code, DB, Storage, Auth, RLS, RPC, commit, push, or deploy performed for this RCA closeout.

---

*End of RCA-02 audit.*
