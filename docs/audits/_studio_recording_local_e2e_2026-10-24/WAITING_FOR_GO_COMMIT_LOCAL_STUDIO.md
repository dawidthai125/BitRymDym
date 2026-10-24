# WAITING_FOR_GO_COMMIT_LOCAL_STUDIO — 2026-10-24

**State:** waiting. No `git add`, commit, push, or deploy performed. Dirty WIP preserved.

**Exact GO string required:** `GO_COMMIT_LOCAL_STUDIO`

---

## Scope control result

| Check | Result |
|-------|--------|
| Stage/commit/push/deploy this turn | **NOT RUN** (blocked until GO) |
| Sacred WIP excluded | **PASS** — `src/lib/takes/recording-eligibility-service.ts` stays out |
| `studio-editor.tsx` excluded | **PASS** (plan) — dirty `M`, not a candidate |
| Env / secrets excluded | **PASS** — no `.env*`, no creds |
| Local fixture audio excluded | **PASS** — `*.wav` out of commit set |
| Runtime leftovers excluded | **PASS** — `_next-3460.*` out |
| Unrelated dirty WIP excluded | **PASS** (plan) — auth, premium, mix-working trees, `config.toml`, etc. |
| `studio-service.ts` whole-file safe for minimal commit? | **FAIL / BLOCKED** — `+131/−47`; only ~2 lines are `record_armed` seed; rest is Mix Working / other WIP |

---

## Exact candidate list (INCLUDE after GO)

### A — clean, single-purpose (safe to stage by path)

1. `supabase/migrations/20261024201348_beat_audio_assets_owner_select.sql`
2. `src/lib/beats/beat-audio-assets-owner-select-local.test.ts`
3. Audit evidence under `docs/audits/_studio_recording_local_e2e_2026-10-24/` **except** the excludes in §B:
   - `*.md`, `*.json` evidence/reports (incl. `RELEASE_GATE_*`, `WAITING_FOR_GO_*`, `OWNER_*`, `README`, statuses)
   - `*.png` evidence shots
   - optional Owner call: harness `_*e2e*.mjs` / `_probe*.mjs` / `_ui*.mjs` / `_setup*.mjs` / `_run*.mjs` as audit tooling (not product code)

### B — EXCLUDE always (even inside audit dir)

- `docs/audits/_studio_recording_local_e2e_2026-10-24/_local-soft-click-4s.wav`
- `docs/audits/_studio_recording_local_e2e_2026-10-24/_silent-3s-local.wav`
- `docs/audits/_studio_recording_local_e2e_2026-10-24/_next-3460.out.log`
- `docs/audits/_studio_recording_local_e2e_2026-10-24/_next-3460.err.log`
- `docs/audits/_studio_recording_local_e2e_2026-10-24/_next-3460.pid`
- any `_creds*`, `.env*`, `*.bak` if reappear

### C — EXCLUDE (dirty / out of scope)

- `src/lib/takes/recording-eligibility-service.ts` — Sacred WIP
- `src/components/studio/studio-editor.tsx`
- `src/lib/studio/studio-service.ts` — **not** as whole file (see §D)
- `supabase/config.toml`, `.env.example`, package files, auth, premium, community tests, other audits, `.agents/`, `.cursor/`, etc.

### D — `record_armed` only (blocked without surgical GO)

**Intended product change:** in `createStudioProjectFor`, VOCAL seed `record_armed: true` → `false` (+ comment). BEAT seed already `false`.

**Problem:** same file carries large unrelated Mix Working diff. Interactive `git add -p` / `-i` is unavailable in this agent policy.

**After `GO_COMMIT_LOCAL_STUDIO`, pick one Owner-approved path:**

1. **Omit** `studio-service.ts` from this commit (RLS+audit only); leave `record_armed` for a later hunk-isolated GO; or  
2. **Explicit GO** authorizing a non-interactive surgical extraction (temporary branch / file restore + re-apply only the seed lines) so the commit contains **only** the `record_armed` hunk — still without staging Sacred WIP or editor.

Until that choice, listing `studio-service.ts` as a commit candidate would **fail** scope control.

---

## Proposed commit message (draft only — not applied)

```
fix(studio): owner asset SELECT for DRAFT + unarmed VOCAL seed

Allow beat owners to SELECT own beat_audio_assets so community submit
sees MASTER READY; default new VOCAL tracks unarmed for conscious R.
```

(Use only if §D path 2 lands in the same commit; otherwise drop the VOCAL seed clause.)

---

## Action on `GO_COMMIT_LOCAL_STUDIO`

1. Re-run scope control (`git status` / path list).  
2. Stage **only** §A paths (explicit paths; never `git add -A` / `.`).  
3. Resolve §D per Owner choice above.  
4. Commit; **no push/deploy** unless a further GO says so.
