# Phase 1.9 Design Freeze

**Title:** Operator Production Enablement
**Candidate ID:** Phase 1.9
**Baseline:** `origin/main` @ `70eb501` (Phase 1.8A CLOSED / LOCKED @ `fd87f23`)
**Depends on:** Phase 1.5 Access Gate · Phase 1.6 Playback · Phase 1.7 Admin PLATFORM ops · Phase 1.8A Downloads — all LOCKED
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**SSOT:** §3, §5, §9, §12–§13, §16–§17, §36, §39
**Document status:** DESIGN FREEZE — **APPROVED / LOCKED** (2026-09-26)
**Owner GO:** APPROVED — Candidate A (Operator Production Enablement)
**Implementation status:** **IN PROGRESS** · Production Bootstrap **PARTIAL** (Auth + ADMIN PASS; first beat **BLOCKED**) · Phase **NOT CLOSED**

### Purpose

Unlock real production verification of locked foundation phases **1.5–1.8A** via operator-controlled bootstrap:

1. First ADMIN per **OD-20** (manual / outside app) — **DONE**
2. First PLATFORM beat via existing admin UI — **PENDING OPERATOR**
3. READY MASTER audio — **PENDING**
4. PUBLISHED beat — **PENDING**
5. Live E2E: playback → download → My Downloads — **PENDING**

Phase 1.9 is **operability + verification**, not a new product architecture.

### Live baseline at freeze approval

| Metric | Count |
|--------|------:|
| ADMIN | 0 |
| PUBLISHED | 0 |
| READY AUDIO | 0 |
| USERS / profiles | 0 |
| BEATS | 0 |

### Live progress (2026-09-26)

| Metric | Count |
|--------|------:|
| ADMIN | 1 |
| PUBLISHED | 0 |
| READY AUDIO | 0 |
| profiles | 5 |
| BEATS | 0 |
| download_events | 0 |

Production: **GREEN** @ `5d6b846`. Schema: **READY** — **NO MIGRATION**.

Legend:

| Label | Meaning |
|-------|---------|
| **APPROVED / LOCKED** | Owner-approved freeze — execution must follow |
| **REUSE** | Existing locked capability — do not rebuild |
| **FROZEN** | Approved rule for Phase 1.9 |
| **OUT** | Explicitly not in Phase 1.9 |

---

## Owner-approved frozen rules

### OD-20 — First ADMIN (CLOSED — unchanged)

```text
No automatic first-admin in signup.
First ADMIN = manual / operator-controlled bootstrap outside normal signup.
No auto-admin.
No bootstrap endpoint.
No Server Action / env “first admin email” / client escalation.
```

**FROZEN procedure:**

1. Operator completes normal production `/sign-up` → profile `role=USER`, `account_level=BEGINNER_RAPPER`
2. Operator promotes via Supabase Dashboard SQL / service-role tooling: set `profiles.role = 'ADMIN'` for that uid
3. `account_level` must remain unchanged
4. App paths must not perform promotion (`prevent_privilege_escalation` blocks non–service_role role changes)

### Platform beat (REUSE Phase 1.7 + Scope A UX)

```text
/admin/beats → /admin/beats/new
→ select audio → server duration probe (music-metadata) + title suggestion
→ manual BPM + metadata → CREATE DRAFT + MASTER upload (existing pipeline)
→ READY → Publish via UI gate only (DRAFT + active READY MASTER)
```

**Scope A (Owner GO — audio-first upload UX):**

| Item | Status |
|------|--------|
| Duration auto (`duration_seconds` from file, server truth, 1–180, `Math.round`) | IN |
| Title suggestion from filename (editable) | IN |
| File metadata auto (name / MIME / size) | IN |
| BPM | **MANUAL ONLY** — no default 140 |
| BPM auto-detection | **OUT of Scope A** |

**Scope B (BPM auto-detection):** **DEFERRED / OWNER GO REQUIRED** — not closed; no detector in stack.

**FROZEN invariants:**

| Field | Value |
|-------|--------|
| `ownership_type` | `PLATFORM` |
| `owner_id` | `NULL` |
| Publish | UI only — **no** SQL READY/PUBLISHED bypass |
| Bucket | `beat-audio` private |
| Access Gate | REUSE (`PLAYBACK` 120s / `DOWNLOAD` 300s) |

### Downloads (REUSE Phase 1.8A — unchanged)

| Rule | Value |
|------|--------|
| OD-05 anon | 2 / UTC day |
| OD-06 user | 4 / UTC day |
| Reservation TTL | 120s |
| DOWNLOAD signed URL TTL | 300s |
| OD-17 | reserve → signed URL SUCCESS → finalize → `beat_download_events` |

### GAP-PUBLISH-READY (carried)

Server lifecycle may soft-allow publish without READY MASTER.
**Phase 1.9 procedure forbids** SQL/status bypass — operator **must** use UI publish gate only.

---

## Scope

### IN

- Operator bootstrap runbook (OD-20)
- First PLATFORM beat via existing admin UI
- Production E2E matrix (anon + auth + limits smoke)
- OD-17 / Access Gate / private storage verification
- Minimal operator evidence package
- Documentation: this freeze + [PRODUCTION_BOOTSTRAP.md](../runbooks/PRODUCTION_BOOTSTRAP.md)
- Abort / rollback / production data policy

### OUT

- Quick Take, Tracks, Community uploads, Messaging, Voting, Comments
- Payments, Full moderation, Full Admin console, Full Audit Log
- Watermarking, Mix/export
- New auth / download / audio architecture
- Auto-admin, bootstrap endpoint, seed migrations, fixture code
- New OD values; schema / RLS / AuthZ changes for bootstrap
- Patching Phase 1.5–1.8A architecture

---

## Database

**NO MIGRATION.** Existing schema supports OD-20 promotion + PLATFORM admin path.
If schema cannot support bootstrap safely → **BLOCKER** (stop; do not silent-migrate).

---

## Documentation deliverables

| Doc | Role |
|-----|------|
| This file | Design Freeze (APPROVED / LOCKED) |
| [PRODUCTION_BOOTSTRAP.md](../runbooks/PRODUCTION_BOOTSTRAP.md) | Operator execution runbook |
| PROJECT_STATE / CHANGELOG / DECISION_LOG | Status + closeout after verify |

---

## Success criteria

1. Operator user exists (normal signup)
2. Manually promoted to ADMIN (OD-20)
3. ADMIN AuthZ verified (`/admin/beats`)
4. First PLATFORM beat via normal admin UI
5. MASTER uploaded
6. Asset READY
7. Beat PUBLISHED (UI gate)
8. Anon catalog shows beat
9. Anon playback works
10. Anon download works
11. OD-17 semantics verified
12. Auth USER playback works
13. Auth USER download works
14. My Downloads shows own event
15. Storage remains private
16. No permanent public audio URL
17. Limits config intact (2 / 4); smoke PASS or PARTIAL with evidence
18. No security regression
19. Production remains GREEN
20. Evidence package recorded (private; no secrets in repo)
21. Documentation updated

---

## FINAL STATUS

```text
PHASE 1.9 DESIGN FREEZE = APPROVED / LOCKED
CANDIDATE = Operator Production Enablement
IMPLEMENTATION = IN PROGRESS
PRODUCTION BOOTSTRAP = PARTIAL
  AUTH E2E = PASS
  OD-20 ADMIN = PASS (1 ADMIN)
  SCOPE A AUDIO-FIRST CREATE = IMPLEMENTED LOCALLY (not deployed)
  SCOPE B BPM AUTO = DEFERRED / OWNER GO REQUIRED
  FIRST PLATFORM BEAT = BLOCKED (operator UI session required)
PRODUCTION VERIFY = PENDING (no PUBLISHED beat yet)
PHASE CLOSED = NO
DATABASE MIGRATION = NONE
OD-20 = CLOSED / UNCHANGED
REUSE = Admin UI + Access Gate + Downloads 1.8A
```

**Live (2026-09-26):** ADMIN=1 · beats=0 · PUBLISHED=0 · READY=0 · events=0.

**Next:** Deploy Scope A (Owner GO) → Owner create→publish first PLATFORM beat → agent live E2E.
Do not mark CLOSED until production verification checklist PASS.

