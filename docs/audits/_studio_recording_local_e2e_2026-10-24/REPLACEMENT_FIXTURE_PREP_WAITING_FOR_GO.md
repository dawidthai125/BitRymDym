# Prep — replacement fixture for local mocked REC E2E

**Marker:** `WAITING_FOR_GO_REPLACEMENT_FIXTURE`  
**Captured:** 2026-10-24  
**Mode:** preparation only — **no** new beat, role, status, rights, asset, code, migration, or config changes in this step.

**GO required before any creation:** exact Owner token `GO_REPLACEMENT_FIXTURE`.

**Skills:** research-and-planning.  
**RO:** [RO replacement fixture path](2440d742-6af5-4fd4-a168-f0208a9ec54d), [RO master WAV constraints](bee432d6-3303-4a45-ab6e-848f91aaa4c0).  
**Prior RO (stuck fixture):** [RO beat status machine](f885fd84-2cc5-4720-815f-cb5aef153a92), `UNBLOCK_PATH_RO_2026-10-24.md`.

**Boundaries honored:** no SQL / service-role / production / remote / `supabase start` / reset / seeds; Sacred WIP and `studio-editor.tsx` not touched; dirty WIP preserved; no commit/push/deploy.

---

## 0. Blocked fixture (evidence only — do not mutate)

| Field | Value |
|-------|--------|
| Title | **Visual Fixture — Local Only** |
| Last documented status | **APPROVED** |
| Rights attestation | **absent** (`beat_rights_basis` count 0) |
| Why blocked | Publish UI fails rights gate; cannot return to DRAFT via current staff/owner UI without ADMIN path that is also incomplete in UI |
| Action this prep | **none** — leave in place as proof of stuck state |

---

## 1. Minimal UI-only workflow (new fixture)

Actors: **USER owner** + **non-owner MODERATOR** (same human may not own the beat and moderate it).

| Step | Actor | Route | Control |
|------|--------|-------|---------|
| A | USER | `/beats/upload` | Upload silent local MASTER → analyze → **Zapisz wersję roboczą** → DRAFT + active READY MASTER |
| B | USER | same | Check rights box (`proposal-2026-10-19` wording) → **Wyślij do moderacji** → `PENDING_REVIEW` + `beat_rights_basis` attestation for current MASTER checksum |
| C | MODERATOR ≠ owner | `/admin/moderation` → `[id]` | If open rights review appears → **Zamknij sprawę … bez publikacji** (close ≠ publish) |
| D | MODERATOR ≠ owner | same | **Zatwierdź** → `APPROVED` |
| E | MODERATOR ≠ owner | same / „Zatwierdzone” | **Opublikuj** → `PUBLISHED` (must succeed; attestation match + READY MASTER) |
| F | USER | `/studio` → picker **Moje** | Select replacement fixture → attach to existing local project |

Owner **cannot** self-approve / self-publish. **ADMIN not required** on this clean DRAFT→PUBLISHED path.

---

## 2. Existing local roles vs path (no re-probe this turn)

From prior read-only inventory in this folder (`UNBLOCK_PATH_RO_2026-10-24.md`):

| Role kind (`@localhost.local`) | Count |
|--------------------------------|-------|
| USER | 2 |
| MODERATOR | 2 |
| ADMIN | 0 |

**Verdict:** **PASS** for replacement path **without ADMIN and without SQL**, provided:

- owner of the **new** beat is a local **USER**;
- approve/publish is done by a local **MODERATOR who is not that owner**;
- both accounts already exist (no create-user step).

ADMIN remains unnecessary unless recovering the *old* stuck APPROVED fixture.

---

## 3. Local silent WAV / MASTER conditions

| Gate | Requirement |
|------|-------------|
| MIME | `audio/wav` or `audio/x-wav` (server allowlist; not ogg/webm) |
| Size | 1 … 50 MiB |
| Duration | rounded integer **1–210** s (too-short silence that rounds to 0 fails) |
| Channels / sample rate | not fixed; must decode for duration + BPM path |
| Silence | **not** rejected by policy; prior local fixture used short silent WAV successfully |
| Finalize BPM | server must produce non-`UNAVAILABLE` envelope + **non-empty allowlist**; pick BPM from allowlist in UI (manual free 1–300 does not unlock) |
| Asset | purpose MASTER, **is_active**, status **READY** before submit |
| Checksum | SHA-256 hex of exact bytes; attestation binds to that checksum at submit |
| Storage | local private bucket **`beat-audio`** only (no remote/prod asset) |
| Rights text | checkbox = `PROPOSED_RIGHTS_STATEMENT` / version `proposal-2026-10-19` |

Practical prep tip (after GO): prefer silent WAV **≥ ~2–3 s** so duration ≥ 1 s after round, and verify finalize BPM allowlist is non-empty before submit.

---

## 4. Mocked REC → take → archive after PUBLISHED

| Question | Answer |
|----------|--------|
| Infra mutations needed? | **No** — existing Playwright harness (Fake `MediaRecorder` + silent `getUserMedia` + local `src/lib/beats/fixtures/chromium-mediarecorder-opus.webm`, Chromium fake-device flags) |
| Product gate | Recording allowed only when attached beat is **PUBLISHED** (`BEAT_NOT_PUBLISHED` copy) |
| Flow | Conscious **R** → RECORD panel → **Przygotuj mikrofon** → **● Nagraj** → **■ Zatrzymaj** → **✓ Zachowaj** → `/account/takes` |
| Caps | Still subject to normal take day-cap / active-ready eligibility — product rules, not infra |
| Status | **PASS** (planned) once replacement is PUBLISHED and attached; prior run **BLOCKED** on APPROVED-only fixture |

---

## 5. Status summary

| Item | Status |
|------|--------|
| Prep report complete | **PASS** |
| Execution of new fixture | **WAITING_FOR_GO_REPLACEMENT_FIXTURE** |
| Roles sufficient without ADMIN/SQL | **PASS** (prior inventory: USER + non-owner MODERATOR) |
| Silent MASTER constraints known | **PASS** |
| Mock REC after publish (no infra change) | **PASS** (conditional on PUBLISHED) |
| Stuck fixture left untouched | **PASS** (`Visual Fixture — Local Only` / APPROVED) |
| Production / remote / DB mutation this step | **NOT RUN** |

---

## Owner checklist (only after `GO_REPLACEMENT_FIXTURE`)

1. Do **not** alter `Visual Fixture — Local Only`.  
2. As existing local **USER**: create **new** title (distinct, local-only) via `/beats/upload` with compliant silent WAV → DRAFT READY.  
3. Attest + **Wyślij do moderacji**.  
4. As existing **non-owner MODERATOR**: close open review if shown → **Zatwierdź** → **Opublikuj**.  
5. As USER: Studio **Moje** attach → mocked REC harness → archive evidence under this audit folder.  
6. Still no SQL, service-role status patches, new users, ADMIN promotion, or production.

Until the exact GO string is given, agents must **stop** before step 2.
