# P2 — Explicit Sample Replace — IMPLEMENTATION

**Status:** PRODUCTION VERIFIED — GREEN  
**Commit:** `943d81e`  
**Deploy:** `dpl_Cc71ApTt9xsru8on6csS8mqodfzQ` → `www.bitrymdym.pl`  
**Design Freeze:** `docs/audits/P2_REPLACE_SAMPLE_AUDIT.md` APPROVED  
**Owner GO:** TAK (OD-P2-01…07 closed as specified)

---

## 1. Design Freeze

Variant **C**: reserve at claim, retire old only on successful finalize. No delete-first. No auto-replace.

## 2. Owner Decisions

| ID | Decision |
|----|----------|
| OD-P2-01 | Cross-beat replace **ALLOWED** |
| OD-P2-02 | Terminal status = existing **DELETED** (no REPLACED enum) |
| OD-P2-03 | DB commit → then Storage cleanup → janitor safety net |
| OD-P2-04 | Idempotent finalize via `finalize_take_ready_swap` + takeId |
| OD-P2-05 | Anonymous explicit replace **YES** (cap=1) |
| OD-P2-06 | Retire old only at successful finalize |
| OD-P2-07 | Structured codes (`REPLACE_REQUIRED`, …) |

## 3–5. Claim / reservation / finalize

- Extended `claim_take_recording_session` / `claim_anon_take_recording_session` with `p_replace_take_id`
- Column `takes.replaces_take_id` (nullable FK)
- Unique: one PENDING reservation per replace target
- Claim does **not** DELETE old
- `finalize_take_ready_swap`: atomic NEW→READY + OLD→DELETED under advisory lock
- Storage remove of old object **after** commit (best-effort)

## 6. State transitions

```
OLD READY ──(finalize replace)──► DELETED (failure_reason=REPLACED)
NEW PENDING_UPLOAD ──► READY (replaces_take_id set at claim)
Abandon PENDING → OLD remains READY
```

## 7–10. Storage / failure / concurrency / idempotency

See evidence JSON. Cap never exceeded under advisory lock + one-PENDING unique + replace-target unique.

## 11–13. IDOR / cross-beat / anonymous

Server re-validates ownership (owner_id / anonymous_token_hash). Cross-beat allowed. Anon foreign hash → `REPLACE_OWNERSHIP_DENIED`.

## 14–16. Tests / production / data safety

Unit + live P2 + d02 + wave4 + P0. No user/BPM/beat catalog migrations. Additive schema only.

## 17. Deferred

P3 claim · P4 Gold download · P5 plays · P6 ratings · Storage arch

### Files

- `supabase/migrations/20261005190000_p2_explicit_sample_replace.sql`
- `src/lib/takes/claim-errors.ts`, `finalize-swap.ts`, `list-replaceable-takes.ts`, `api-error.ts`
- `take-transport.ts`, `anon-take-transport.ts`, `client-upload.ts`
- API session/finalize routes · `recording-panel.tsx`
- Tests: `p2-replace-unit.test.ts`, `p2-replace-live.test.ts`
