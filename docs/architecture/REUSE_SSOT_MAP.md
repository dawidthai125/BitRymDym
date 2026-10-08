# BitRymDym — Reuse / SSOT / DO NOT DUPLICATE Map

**Authority:** Canonical **reuse inventory** for new GPT + Cursor agents.  
**Does not replace:** [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md) · [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) · [PROJECT_STATE.md](../PROJECT_STATE.md).  
**Updated:** 2026-10-08 — post Phase 7.1.6 GREEN · docs tip may ≠ production app `4fa658d`.

**Rule:** Before writing new code → **SEARCH THIS MAP + CODE** → REUSE. Never invent a second SSOT.

---

## 1. Domain → SSOT → Owner → Location

| Domain | SSOT | Owner | Primary location |
|--------|------|-------|------------------|
| Studio mix / playback graph | Web Audio graph inside `StudioAudioEngine` | Studio transport | `src/lib/studio/studio-audio-engine.ts` · wired by `src/components/studio/studio-transport-provider.tsx` |
| Studio transport / clock | `StudioTransportProvider` | Studio editor shell | `src/components/studio/studio-transport-provider.tsx` |
| Studio selection (track/clip) | React state in Studio editor | `StudioEditorInner` | `src/components/studio/studio-editor.tsx` (`selectedTrackId` / `selectedClipId` / `docRef`) |
| Studio document state | Loaded project document + `docRef` | Studio editor | `studio-editor.tsx` · loaded via `studio-service` |
| Studio persistence | `StudioPersistOrchestrator` | Studio editor | `src/lib/studio/studio-persist-orchestrator.ts` |
| CAS / optimistic concurrency | `document_version` + `studio_cas_*` RPCs | Server services + migrations | `studio-service.ts` · `studio-fx-chain.ts` · `supabase/migrations/*studio_cas*` |
| FX chain model | `studio-fx-chain` module | Shared Studio FX | `src/lib/studio/studio-fx-chain.ts` |
| FX UI | FxSheet + chain editor | Studio chrome | `studio-fx-chain-editor.tsx` · FxSheet in editor |
| Mixer chrome | Mixer shell (reuses engine/doc) | Studio chrome | `studio-mixer-shell.tsx` |
| Inspector chrome | Inspector shell | Studio chrome | `studio-inspector-shell.tsx` |
| Catalog / public playback | `PlayerProvider` | Global player | `src/components/player/player-provider.tsx` |
| E3 Mix / Master / Render | E3 product graph + jobs | E3 modules | `src/lib` E3 surfaces · Contabo worker for export |
| Durable media | Supabase Storage | Storage buckets | `beat-audio` · `take-audio` · `audio-artifacts` |
| Metadata / AuthZ | Supabase PostgreSQL + RLS | DB + server | Supabase project `rzzxrgcdogkybkiidqgw` |
| Auth session | `requireUser` / session helpers | Auth | `src/lib/auth/session.ts` |
| Recording eligibility | eligibility service (**local Sacred WIP may exist**) | Takes | `src/lib/takes/recording-eligibility-service.ts` · `recording-eligibility.ts` |
| Studio record / place | `studio-record-service` | Studio recording | `src/lib/studio/studio-record-service.ts` · `/api/studio/projects/[id]/record/*` |
| Studio CRUD / attach / CAS writers | `studio-service` | Studio server | `src/lib/studio/studio-service.ts` · `/api/studio/projects/**` |
| Compute (FFmpeg export) | Contabo EXTERNAL COMPUTE | Worker host | Contabo · **STOPPED/DISABLED** after P4.6 E2E (capability GREEN ≠ always-on) |
| App hosting | Vercel Production | Deploy | https://www.bitrymdym.pl |

---

## 2. Existing capability / reuse map

| Function | Existing owner | Location | Persistence | Do not create |
|----------|----------------|----------|-------------|---------------|
| Auto Save / dirty/saving/conflict | `StudioPersistOrchestrator` | `studio-persist-orchestrator.ts` · editor wiring | Orchestrator → API → CAS | Second orchestrator / debounce SSOT |
| Manual „Zapisz teraz” | Editor + orchestrator | `studio-editor.tsx` | Same | Parallel save buttons with own network path |
| Clip gain / mute / fade / geometry | `studio-service` + CAS RPCs | service + clip routes | Orchestrator + `expectedDocumentVersion` | Client-direct RPC / bypass orchestrator |
| Track controls / reorder / CRUD | `studio-service` + track routes | `/tracks` · `/tracks/[id]` · `/reorder` | Orchestrator + CAS | Duplicate track store |
| Add / place clip | `addStudioClip*` · `placeReadyTakeAsStudioClip*` | service · record-service · `/clips` · `/record/place` | Orchestrator + CAS | Second place pipeline |
| FX chain edit / persist | FX editor + effects/master-fx routes | `studio-fx-chain-editor.tsx` · `/effects` · `/master-fx` | Orchestrator + CAS | Second FX writer |
| Beat attach | `attachBeatToStudioProject*` | `studio-service` · `/beat` · `studio-beat-picker.tsx` | Orchestrator + CAS | Parallel attach |
| Studio playback | `StudioAudioEngine` | transport provider only | N/A (runtime) | `new StudioAudioEngine` / `new AudioContext` in editor/UI |
| Catalog playback | `PlayerProvider` | player-provider | N/A | Using PlayerProvider inside Studio editor |
| E3 mix/export | E3 modules + Contabo | E3 lib + worker | E3 jobs / artifacts | Merging E3 graph into Studio engine |
| Recording eligibility | eligibility service | `src/lib/takes/recording-eligibility*` | Takes domain | Fork eligibility logic (Sacred WIP — do not rewrite without Owner GO) |
| AuthZ gate | `requireUser` + role/capability checks | `session.ts` + route handlers | Server | Client-trusted AuthZ |
| Signed media URLs | Access / preview / download actions | takes/beats APIs | Storage signed URL | Permanent public master URLs |

---

## 3. DO NOT DUPLICATE (hard contract)

```text
DO NOT CREATE A SECOND:
  · StudioAudioEngine
  · Studio AudioContext (Studio path)
  · StudioTransportProvider
  · PlayerProvider (inside Studio)
  · E3 Mix/render graph (inside Studio)
  · StudioPersistOrchestrator / parallel auto-save SSOT
  · document_version / CAS bypass
  · studio_cas_* client EXECUTE path (revoked — service_role only)
  · selection SSOT outside Studio editor state
  · FX persistence path outside orchestrator + FX routes
  · Track/Clip persistence path outside studio-service + CAS
  · recording eligibility fork (Sacred WIP)
  · durable media SSOT outside Supabase Storage
  · always-on Contabo without Owner GO
```

**If a feature sounds similar → SEARCH FIRST** (`rg`, this map, architecture audits, existing routes).

---

## 4. Security / data boundary

```text
CLIENT (browser)
  → Next.js Route Handler / Server Action
      · requireUser() / role / capability
      · ownership checks
  → studio-service / studio-record-service / domain services
  → CAS RPC (service_role) OR direct owned tables via server client
  → PostgreSQL + RLS
  → Storage signed URL issuance (private buckets)

FORBIDDEN FROM CLIENT:
  · service_role key
  · direct studio_cas_* EXECUTE as anon/authenticated
  · trusting client-only ownership
  · writing document_version without CAS handshake
```

Auth helpers: `src/lib/auth/session.ts` (`requireUser`).  
Admin elevated paths: `createSupabaseAdminClient` (server-only).

---

## 5. Studio surface inventory (components)

| Component | Role |
|-----------|------|
| `studio-editor.tsx` | Document UI · selection SSOT · orchestrator wiring |
| `studio-transport-provider.tsx` | Transport · **only** constructs `StudioAudioEngine` |
| `studio-mixer-shell.tsx` | Mixer chrome (7.1.4) · reuses engine/doc |
| `studio-inspector-shell.tsx` | Inspector chrome (7.1.3) |
| `studio-fx-chain-editor.tsx` | FX UI · orchestrator persist |
| `studio-recording-panel.tsx` | Recording UI · place via orchestrator |
| `studio-beat-picker.tsx` | Beat attach via orchestrator |
| `studio-clip-lane.tsx` / `studio-clip-waveform.tsx` | Timeline / waveform |
| `studio-project-list.tsx` | Project list / delete / multi-select |
| `studio-*-meter.tsx` | Peak meters (P6.5/P6.6) |

---

## 6. Studio API surface (do not fork)

Under `src/app/api/studio/`:

- `projects` · `projects/[projectId]`
- `tracks` · `tracks/[trackId]` · `duplicate` · `effects` · `reorder`
- `clips` · `clips/[clipId]` · `duplicate` · `split`
- `master-fx` · `beat` · `beat-picker`
- `record/context` · `record/place` · `record/takes`

All mutating document writers must participate in CAS (`expectedDocumentVersion` / `documentVersion`) via existing services.

---

## 7. Dual audio planes (never merge)

| Plane | Purpose | Must stay separate |
|-------|---------|--------------------|
| Studio | Project timeline · multi-source mix | `StudioAudioEngine` · 1 AC per editor |
| Catalog Player | Beat catalog listen UX | `PlayerProvider` |
| E3 | Mix/Master/Render/Export product | E3 graph + Contabo compute |

---

## 8. Sacred WIP

```text
FILE   = src/lib/takes/recording-eligibility-service.ts
SHA256 = 5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9
STATUS = LOCAL DIRTY WIP · NOT production tip · NOT baseline for cleanup
RULES  = do not reset/restore/stash/clean · do not rewrite without Owner GO
         · do not treat dirty tree as “must clean before work”
```

Companion: `src/lib/takes/recording-eligibility.ts` (related eligibility surface — search before extending).

---

## 9. Known verification limitations (living)

| Item | Status |
|------|--------|
| Phase 7.1.6 interactive production mutations | **NOT SAFELY MUTATED** · static + production bundle verified |
| P6.5 Scenario B | **BLOCKED / INCONCLUSIVE** · do not reopen / do not relabel GREEN |
| Mobile | **TECHNICALLY READY — DEVICE CERTIFICATION PENDING** · not Real Device Verified |
| Contabo | **STOPPED / DISABLED** after P4.6 · capability GREEN ≠ always-on |
| `EXPORT_WAV` / e3-7-f | **WAIVED BY OWNER** |
| FAR-01 | **SOAK COMPLETE / CONTAMINATED** · retirement **NOT EXECUTED** · **NOT CLOSED** |

---

## 10. Duplication / drift risks (document only — do not “fix” in this task)

| Risk | Notes |
|------|-------|
| Dirty local Studio test files | Present in worktree · **not** production · do not stage without Owner GO |
| Sacred WIP vs production eligibility | Local file dirty · fingerprint must stay stable until Owner GO |
| Historical “no Autosave” prose in old freezes | Historical phase OUT lists · superseded by 7.1.6 living status |
| Dual-plane SHA confusion | REPO docs tip ≠ PRODUCTION APP `4fa658d` after docs-only commits |

---

## 11. How agents should use this file

1. Read [FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md) first.  
2. Confirm production vs repo tip in [PROJECT_STATE.md](../PROJECT_STATE.md).  
3. Before any Studio/audio/persist/recording change → search this map + code.  
4. If similar capability exists → extend REUSE path · do not invent parallel SSOT.  
5. Architecture change requires audit → design freeze → Owner GO.
