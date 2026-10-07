# POST-RECORDING EDITING / VOCAL PRODUCTION V1 — FINAL REPORT

**Date:** 2026-10-07  
**Verdict:** **IMPLEMENTATION COMPLETE — NOT PRODUCTION VERIFIED**  
**Repo implementation tip (pre-docs commit):** `3216cf0` (`feat(studio): PR-03/04/05…`) + prior `1a62158` (PR-01/02)  
**Production app SHA (unchanged):** `06c60b5` — still P6.7 only  
**P6.7 status:** remains **CLOSED / GREEN** (not reopened)

---

## 1. Scope

V1 enables non-destructive post-recording Clip editing on the existing Studio path:

```text
Take (immutable) → Studio Project → Track → Clip → ONE StudioAudioEngine
```

**IN:** Clip Gain, Clip Mute, Duplicate Clip, CAS alignment for Move/Delete, ClipEditPanel UX polish, tests + SSOT.

**OUT:** Autosave, Undo/Redo, Automation, Autotune, Clip Pan, Region Mute, E3 Studio render, Contabo, P7, second audio engine.

---

## 2. Implemented PRs

| PR | Status | Notes |
|----|--------|--------|
| PR-01 Clip Gain Write Path | DONE | `set_gain` + CAS RPC + UI |
| PR-02 Clip Mute Write Path | DONE | `set_mute` + same CAS RPC + UI |
| PR-03 Duplicate Clip | DONE | CAS insert · same `source_take_id` |
| PR-04 CAS Move/Delete | DONE | Move always CAS · Delete CAS RPC |
| PR-05 Timeline/Clip UX | DONE | Gain/Mute/Duplicate in ClipEditPanel |
| PR-06 Production Gate | DONE (gate) | Code/tests/DB RPCs · **app not deployed** |

---

## 3. Changed files (implementation)

- `src/lib/studio/studio-clip-mix.ts` (new)
- `src/lib/studio/studio-clip-ops.ts` — `resolveDuplicateClipPlacement`
- `src/lib/studio/studio-service.ts` — gain/mute/duplicate/delete CAS; move always CAS
- `src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts` — `set_gain` / `set_mute` / DELETE CAS
- `src/app/api/studio/projects/[projectId]/clips/[clipId]/duplicate/route.ts` (new)
- `src/components/studio/studio-editor.tsx` — ClipEditPanel controls
- Tests: `pr-v1-*.test.ts` + regression updates (`p5-3`, `p5-4`, `p6-7-x`, `p6-7-3`)

---

## 4. DB migrations

| Repo file | Applied version + name (Supabase) |
|-----------|-----------------------------------|
| `20261007150000_pr_v1_studio_cas_clip_gain_mute.sql` | `20261007080752` `pr_v1_studio_cas_clip_gain_mute` |
| `20261007151000_pr_v1_studio_cas_clip_duplicate.sql` | `20261007080758` `pr_v1_studio_cas_clip_duplicate` |
| `20261007152000_pr_v1_studio_cas_clip_delete.sql` | `20261007080800` `pr_v1_studio_cas_clip_delete` |

No new tables/columns. Reuses `studio_clips.gain_db` / `muted` / fades / geometry.

**Note:** filename timestamp ≠ applied version id (same pattern as P6.7 / P0).

---

## 5. RPCs

| RPC | Purpose | ACL |
|-----|---------|-----|
| `studio_cas_apply_clip_gain_mute` | Persist gain_db + muted + version | anon/auth **DENY** · service_role **ALLOW** |
| `studio_cas_apply_clip_duplicate` | Insert Clip copy + version | anon/auth **DENY** · service_role **ALLOW** |
| `studio_cas_apply_clip_delete` | Delete Clip + version | anon/auth **DENY** · service_role **ALLOW** |
| `studio_cas_apply_clip_geometry_fades` (reuse) | Move + trim geometry | existing P0 ACL |

**LIVE ACL evidence (production DB):** all three new RPCs `anon_exec=false`, `auth_exec=false`, `service_exec=true`.

---

## 6. API / server actions

| Method | Path | Op |
|--------|------|----|
| PATCH | `/api/studio/projects/:projectId/clips/:clipId` | `set_gain`, `set_mute` (+ existing fades/geometry) |
| POST | `/api/studio/projects/:projectId/clips/:clipId/duplicate` | duplicate |
| DELETE | `/api/studio/projects/:projectId/clips/:clipId` | body `{ expectedDocumentVersion }` |

Path: `requireUser` → ownership (`loadOwnedClip`) → service_role RPC. No client privileged RPC.

---

## 7. UI changes

ClipEditPanel (edit mode):

- Clip Gain (−24…12 dB) + explicit „Zapisz głośność”
- Clip Mute toggle
- Fade In/Out (unchanged P6.7)
- Trim / Split / Move / Delete
- **Powiel** (duplicate)
- Primary controls `min-h-11` (≥44px)

---

## 8. Tests

- Studio suite: **445 PASS** (`src/lib/studio`)
- V1 suites: gain/mute, duplicate, CAS move/delete, UX polish, architecture guards
- TypeScript: `tsc --noEmit` **PASS** (after test typing fix)
- P6.7 regression suites updated/passing (fade write/UI, trim/split)

---

## 9. Security verification

| Check | Result |
|-------|--------|
| Contract: unauth → 401 / non-owner → 403/404 / stale → 409 | Covered by shared AuthError / StudioFxCasConflictError mapping + V1 source tests |
| anon EXECUTE new RPCs | **DENIED** (live SQL) |
| authenticated EXECUTE new RPCs | **DENIED** (live SQL) |
| service_role EXECUTE | **ALLOWED** (live SQL) |
| App path ownership | `loadOwnedClip` / `assertOwnsProject` |
| Production HTTP E2E on new endpoints | **NOT RUN** (app not deployed) |

---

## 10. CAS verification

- Gain / Mute / Duplicate / Delete: atomic `document_version` bump via new RPCs
- Move: now always uses `studio_cas_apply_clip_geometry_fades` (PR-04 alignment; removes pre-P6.7 non-CAS move)
- Stale version → empty RPC result → `StudioFxCasConflictError` → HTTP 409

---

## 11. Take immutability verification

- Duplicate / gain / mute / delete / move SQL and service: **no** `takes` UPDATE, **no** Storage object copy
- Duplicate copies Clip row fields including `source_take_id` only
- Architecture guard test asserts this contract

---

## 12. Mobile verification

- Source contract: ClipEditPanel `min-h-11`, `min-w-0`, no separate mobile engine
- Live ~390px browser production check: **NOT RUN** (app not deployed with V1 UI)

---

## 13. P6.7 regression

- Fade write/UI/trim/split tests **PASS**
- Engine fade formula unchanged (`effectiveGain = baseClipGain × fadeEnvelope`)
- P6.7 **not** marked reopened
- Production still serves `06c60b5` (P6.7) until V1 app deploy

---

## 14. Production deployment

| Plane | Status |
|-------|--------|
| Production DB RPCs | **APPLIED** (three V1 migrations) |
| Production app | **NOT DEPLOYED** — still `06c60b5` |
| Contabo | untouched STOPPED/DISABLED |
| E3 | untouched |

---

## 15. Production SHA

```text
PRODUCTION APP SHA     = 06c60b5 (unchanged · P6.7)
REPO IMPLEMENTATION    = 3216cf0 (+ 1a62158) · docs tip advances with this report commit
```

---

## 16. Production verification

**NOT PRODUCTION VERIFIED**

Missing for GREEN:

1. Deploy app containing V1 UI/API
2. Live owner E2E: gain/mute/duplicate save → reload → playback
3. Live security HTTP on new endpoints
4. Live mobile ~390 check on deployed UI
5. Live P6.7 fade regression on deployed build

DB ACL for new RPCs is verified; that alone ≠ production feature GREEN.

---

## 17. Known limitations

- Duplicate placement: prefer immediately after source; if unfit, same start (MIX overlap) — documented in tests
- Move now requires `expectedDocumentVersion` (breaking vs old non-CAS move clients — only Studio UI)
- No production browser evidence for V1 audible gain/mute yet

---

## 18. Deferred items

Autosave · Undo/Redo · Automation · Autotune · Clip Pan · Region Mute · Studio→E3 render · Contabo · P7 / MIDI · P6.8

---

## 19. Final verdict

```text
IMPLEMENTATION COMPLETE — NOT PRODUCTION VERIFIED
```

**STOP.** Do not start P6.8 / Automation / Autotune / E3 Studio Render / Undo / Autosave / P7. Await Owner decision for deploy + production gate (or next workstream).
