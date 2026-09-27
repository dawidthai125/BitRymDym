# Phase 1.9 Design Freeze

**Title:** Operator Production Enablement
**Candidate ID:** Phase 1.9
**Baseline:** `origin/main` @ `70eb501` (Phase 1.8A CLOSED / LOCKED @ `fd87f23`)
**Depends on:** Phase 1.5 Access Gate · Phase 1.6 Playback · Phase 1.7 Admin PLATFORM ops · Phase 1.8A Downloads — all LOCKED
**Supabase project:** `rzzxrgcdogkybkiidqgw`
**SSOT:** §3, §5, §9, §12–§13, §16–§17, §36, §39
**Document status:** DESIGN FREEZE — **APPROVED / LOCKED** (2026-09-26)
**Owner GO:** APPROVED — Candidate A (Operator Production Enablement)
**Implementation status:** **COMPLETE** · Production **VERIFIED GREEN** @ `73e213c` · Phase **CLOSED / LOCKED** (2026-09-27)

### Purpose

Unlock real production verification of locked foundation phases **1.5–1.8A** via operator-controlled bootstrap:

1. First ADMIN per **OD-20** (manual / outside app) — **DONE**
2. First PLATFORM beat via existing admin UI — **DONE** (`phase19-master-tone`)
3. READY MASTER audio — **DONE**
4. PUBLISHED beat — **DONE**
5. Live E2E: playback → download → My Downloads — **PASS**
6. Audio-first upload + BPM V1 + Audio Transport V1 — **DONE / PRODUCTION VERIFIED**
7. GAP-PUBLISH-READY — **CLOSED** (server hard gate: active MASTER READY)

Phase 1.9 is **operability + verification**, not a new product architecture.

### Live baseline at freeze approval

| Metric | Count |
|--------|------:|
| ADMIN | 0 |
| PUBLISHED | 0 |
| READY AUDIO | 0 |
| USERS / profiles | 0 |
| BEATS | 0 |

### Live closeout (2026-09-27)

| Metric | Count |
|--------|------:|
| ADMIN | 1 |
| USER | 4 |
| PUBLISHED | 1 |
| DRAFT | 2 (transport E2E leftovers) |
| READY assets | 3 |
| profiles | 5 |

Production: **GREEN** @ `73e213c`. Schema: **READY** — **NO MIGRATION** for Phase 1.9.

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
→ READY → Publish via UI gate **and** server hard gate (DRAFT + active READY MASTER)
```

**Scope A (Owner GO — audio-first upload UX):**

| Item | Status |
|------|--------|
| Duration auto (`duration_seconds` from file, server truth, 1–180, `Math.round`) | IN |
| Title suggestion from filename (editable) | IN |
| File metadata auto (name / MIME / size) | IN |
| BPM | **MANUAL ONLY** — no default 140 |
| BPM auto-detection | **OUT of Scope A** |

**Scope B (BPM auto-detection):** **SHIPPED** as Production V1 @ `471dd5b` (ACCURACY NOT CERTIFIED).

**FROZEN invariants:**

| Field | Value |
|-------|--------|
| `ownership_type` | `PLATFORM` |
| `owner_id` | `NULL` |
| Publish | UI gate + **server hard gate** (active MASTER READY); **no** SQL READY/PUBLISHED bypass |
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

### GAP-PUBLISH-READY — **CLOSED** (2026-09-27 / EPIC-A)

Server `transitionBeatStatus(…, "PUBLISHED")` requires PLATFORM + DRAFT + **active MASTER READY** for the same `beat_id` (DB check; never trust client). UI gate preserved. Create path no longer allows insert as PUBLISHED.

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
IMPLEMENTATION = COMPLETE
PRODUCTION BOOTSTRAP = COMPLETE
  AUTH E2E = PASS
  OD-20 ADMIN = PASS (1 ADMIN)
  SCOPE A AUDIO-FIRST CREATE = ON PRODUCTION
  SCOPE B BPM AUTO = SHIPPED V1 @ 471dd5b (ACCURACY NOT CERTIFIED)
  AUDIO TRANSPORT V1 = CLOSED / PRODUCTION VERIFIED @ 73e213c
  FIRST PLATFORM BEAT = PASS (phase19-master-tone PUBLISHED)
PRODUCTION VERIFY = PASS (BEAT → LISTEN → DOWNLOAD GREEN)
GAP-PUBLISH-READY = CLOSED (server hard gate)
PHASE CLOSED = YES / LOCKED
DATABASE MIGRATION = NONE
OD-20 = CLOSED / UNCHANGED
REUSE = Admin UI + Access Gate + Downloads 1.8A + Transport + BPM V1
```

**Live (2026-09-27):** ADMIN=1 · USER=4 · PUBLISHED=1 · DRAFT=2 · READY assets=3.

**Next:** Owner commits EPIC-A publish hard gate → production verify publish reject/allow cases.
Do not open community / Quick Take without Owner GO.

