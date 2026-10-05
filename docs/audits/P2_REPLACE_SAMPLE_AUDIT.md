# P2 — Replace Previous Sample — AUDIT / RCA / DESIGN FREEZE

**Status:** COMPLETE — DESIGN FREEZE READY (awaiting Owner GO)  
**Mode:** READ-ONLY — zero mutations, zero commits, zero deploy  
**Depends on:** P0 GREEN · P1 GREEN (`5927e35` / evidence `c38e8d2`)  
**Non-goals:** implementation, migrations, Storage cleanup, P3 claim, P4 download, BPM/catalog

---

## 1. Current ACTIVE_READY_CAP

### Definition (SSOT in claim RPC)

Active READY count:

```sql
status = 'READY'
AND deleted_at IS NULL
AND expires_at > now()
```

Scoped by:

| Actor | Scope column |
|-------|----------------|
| Authenticated | `owner_id` |
| Anonymous | `anonymous_token_hash` |

Cap value comes from P1 Sample Policy (`getSamplePolicy` → `activeReadyCap`), passed into RPC as `p_max_active_ready`.

### When the system returns ACTIVE_READY_CAP

**Only at session claim** (create PENDING_UPLOAD row), inside service_role RPCs:

| Path | Function / RPC | File |
|------|----------------|------|
| Auth | `claim_take_recording_session` | `supabase/migrations/20260927220000_recording_wave4_session_claim.sql` |
| Anon | `claim_anon_take_recording_session` | `supabase/migrations/20260928160000_recording_d02_anon_take_claim.sql` |
| Auth app | `createTakeRecordingSessionFor` → RPC | `src/lib/takes/take-transport.ts` |
| Anon app | `createAnonTakeRecordingSessionFor` → RPC | `src/lib/takes/anon-take-transport.ts` |
| HTTP | `POST /api/takes/session` | `src/app/api/takes/session/route.ts` |
| HTTP | `POST /api/takes/anon/session` | `src/app/api/takes/anon/session/route.ts` |

App maps RPC message → `AuthError FORBIDDEN` (“Active READY take limit…”).

### When it is NOT checked

| Stage | Cap check? |
|-------|------------|
| Upload (signed PUT) | No |
| Finalize | **No** — only ownership, PENDING→READY, duration snapshot, object presence |
| Preview / download | No (access AuthZ only) |
| Soft-delete | Frees slot for next claim; does not itself emit ACTIVE_READY_CAP |

**Invariant today:** Cap is enforced **before** creating a new PENDING session row, under `pg_advisory_xact_lock` (per owner or anon hash). Finalize cannot create a second READY beyond the claim-time gate **because** at most one PENDING per actor (unique partial index) and claim already refused when at cap.

### Concurrent PENDING guard

- `takes_one_pending_per_owner_uidx` — one `PENDING_UPLOAD` per `owner_id`
- `takes_one_pending_per_anon_hash_uidx` — one `PENDING_UPLOAD` per anon hash  
Unique violation → `CONCURRENT_SESSION`.

### Existing escape hatch (not replace)

Authenticated users can **soft-delete** a READY take (`POST /api/takes/delete` → `softDeleteOwnTakeFor`), then claim again (still subject to `SESSION_DAY_CAP`).  
Anonymous has **no** soft-delete API today.

**Replace (`replaceTakeId`) does not exist in code** (grep: zero matches).

---

## 2. Current take lifecycle

```text
claim RPC (advisory lock + caps)
  → INSERT takes status=PENDING_UPLOAD
       · owner_id XOR anonymous_token_hash
       · beat_id, object_key, storage_bucket='take-audio'
       · recording_max_seconds_snapshot, expires_at
  → createSignedUploadUrl (service_role)
  → client PUT binary
  → finalize (service path)
       · download object, probe duration ≤ snapshot
       · UPDATE PENDING_UPLOAD → READY (or FAILED / EXPIRED)
  → preview signed GET (owner / anon hash)
  → TTL: expires_at gate in AuthZ; janitor marks EXPIRED + best-effort Storage remove
  → optional owner soft-delete → DELETED + deleted_at (+ best-effort Storage remove)
```

### Status enum (`take_status`) — production confirmed

`PENDING_UPLOAD` · `READY` · `FAILED` · `EXPIRED` · `DELETED`

**No `REPLACED` / `RETIRED`.**

### Timing facts

| Event | When |
|-------|------|
| DB row | Claim RPC INSERT |
| Storage object | After signed upload (may be absent if abandon) |
| READY | Finalize success |
| `expires_at` | Set at claim from Sample Policy TTL |
| Owner / anon identity | At claim (XOR CHECK) |
| Soft delete | Explicit auth API only |

### FK / constraints (foundation)

- `owner_id → profiles` RESTRICT; `beat_id → beats` RESTRICT  
- XOR owner/anon; bucket must be `take-audio`; object_key ends `.bin`  
- READY requires duration/byte_size/content_type  
- DELETED iff `deleted_at` set  
- Unique `(storage_bucket, object_key)`  
- Mutations: service_role only (`prevent_take_privilege_escalation`)

### RLS

- `takes_select_own`: authenticated SELECT where `owner_id = auth.uid()` AND `deleted_at IS NULL`  
- No client INSERT/UPDATE/DELETE policies → DENY  
- service_role bypasses RLS

---

## 3. Current Storage lifecycle

| Item | Fact |
|------|------|
| Bucket | `take-audio` private |
| Client Storage policies | DENY (no anon/auth insert/select policies) |
| Upload | Signed upload URL via service_role |
| Read | Signed GET via preview/download modules |
| Delete | Best-effort in soft-delete + janitor |
| Janitor | `runTakesRetentionJanitor` · `/api/cron/takes-janitor` |

Soft-delete order today (`take-delete.ts`): **Storage remove first**, then DB `DELETED`. If DB update fails after Storage remove → **orphan DB row pointing at missing object** (recoverable for listing; audio lost). Janitor treats missing object as success.

---

## 4. DB ↔ Storage identity

### Path determinism (server-chosen only)

| Actor | Key builder | Pattern |
|-------|-------------|---------|
| Auth | `buildUserTakeObjectKey` | `user/{ownerId}/takes/{takeId}/mic.bin` |
| Anon | `buildAnonTakeObjectKey` | `anon/{tokenHashPrefix}/takes/{takeId}/mic.bin` |

- Bound to **ownerId/hashPrefix + takeId** — not session id  
- Client-supplied objectKey/ownerId/bucket/takeId **rejected** (`rejectClientChosenTakeStorageParams`)  
- Unique DB index on `(storage_bucket, object_key)` ⇒ **one take row per object key**  
- **No `version_id` column on `takes`** — Storage version identity is not part of take SSOT (unlike beat-audio allowlists)

### Production orphan math (read-only snapshot)

| Metric | Value |
|--------|------:|
| `takes` rows | 41 |
| `take-audio` objects | 24 |
| Takes with live object | 23 |
| Takes missing object | 18 |
| Storage unmapped to takes | **1** |

Expected residual: FAILED/EXPIRED/DELETED + abandoned PENDING + known historical unmapped object. **Audit did not delete anything.**

---

## 5. Ownership model

| Field | Meaning |
|-------|---------|
| `owner_id` | Authenticated profile; exclusive with anon |
| `anonymous_token_hash` | SHA-256 of cookie token; exclusive with owner |
| Soft-delete | Requires `take.owner_id === context.userId` |
| Finalize / preview | Owner or matching anon hash |

Cap and ownership are **actor-scoped**, not beat-scoped: READY takes across all beats count toward the same `activeReadyCap`.

---

## 6. IDOR analysis

| Attack | Current protection | P2 requirement |
|--------|--------------------|----------------|
| User A passes User B’s takeId as replace target | Soft-delete already DENY if `owner_id` mismatch | Replace must **server-verify** actor owns/holds target READY take under advisory lock |
| Anon forging another hash’s takeId | Finalize/preview require hash match | Replace must match `anonymous_token_hash` |
| Client forging object path | Server rebuilds key; finalize checks `expected*TakeObjectKey` | Keep |
| UI-only hide of foreign takes | Insufficient | Never trust client list |

**Conclusion:** Any `previousTakeId` / `replaceTakeId` is untrusted input. Ownership check must be in the same locked claim (and/or finalize) path as cap mutation.

---

## 7. Cross-beat analysis

### Current behavior

- Each take has immutable `beat_id`  
- ACTIVE_READY cap is **global per actor**, not per beat  
- Soft-delete of Take B (Beat X) frees a slot to record on Beat Y today  
- No code prevents “delete A on beat X → record on beat Y”

### Product risks if replace allows cross-beat

- User “replaces” a sample on Beat X while recording Beat Y → surprising loss of X sample  
- Mix UI lists takes per beat — cross-beat replace may confuse Studio  

### Recommendation (not decided)

Prefer **same-beat replace** for explicit UX clarity; allow cross-beat only if Owner wants slot-as-global-quota semantics matching soft-delete.

→ **OD-P2-01**

---

## 8. Replace variants

### Variant A — Delete old first, then claim new

```text
soft-delete(old) → claim(new) → upload → finalize
```

| Dimension | Assessment |
|-----------|------------|
| DB atomicity | Two separate app calls today; can wrap soft-delete+INSERT in one RPC |
| Storage safety | Current soft-delete removes Storage **before** DB commit — high risk if abandon |
| Rollback | If user abandons after delete: **permanent loss** of old sample |
| Orphan risk | Storage-first delete increases orphan/missing-object cases |
| Concurrency | Advisory lock helps if in one RPC; two-step without lock races |
| UX | Feels like delete+record, not true replace |
| Auditability | DELETED then new READY; no link unless new column |

**Reject as primary P2 design** (unsafe abandon window). Soft-delete remains separate product action.

### Variant B — Finalize new first, then retire old

```text
claim(new) while under cap? OR claim with reserved slot
→ upload → finalize(new READY) → then DELETED(old)
```

| Dimension | Assessment |
|-----------|------------|
| DB atomicity | Cap problem: at cap cannot claim without temporary overshoot or reserved slot |
| Storage safety | Old object kept until new READY — **good** |
| Rollback | Abandon: old intact; new PENDING/FAILED |
| Orphan risk | Lower for old; new abandon = PENDING without object (already handled) |
| Concurrency | Without lock, two replaces can both finalize → temporary cap+1 |
| UX | Needs explicit replace reservation at claim |
| Auditability | Needs `replaces_take_id` or equivalent |

Needs claim-time slot accounting.

### Variant C (RECOMMENDED) — Explicit replace reservation at claim; retire old only on successful finalize

```text
claim_with_replace(replaceTakeId):
  advisory_xact_lock(actor)
  assert replaceTakeId is actor-owned ACTIVE READY [+ OD beat rule]
  assert no other PENDING
  assert SESSION_DAY_CAP
  count_active_ready = N
  effective_cap_check: (N - 1) < max   -- reserved slot for replace target
  INSERT new PENDING_UPLOAD
       optional: replaces_take_id = replaceTakeId
  -- DO NOT delete old yet; DO NOT remove Storage

upload → finalize:
  advisory_xact_lock(actor)  -- or finalize RPC
  assert PENDING + ownership
  probe duration…
  in ONE DB transaction:
    NEW → READY
    OLD → DELETED (+ deleted_at)
  then best-effort Storage remove(old) OR leave to janitor
```

| Dimension | Assessment |
|-----------|------------|
| DB atomicity | Cap + insert under existing advisory lock; READY swap transactional |
| Storage safety | Old audio survives until new READY committed |
| Rollback | Abandon/FAILED: old still READY; PENDING cleaned by TTL/janitor |
| Orphan risk | Prefer **DB-first retire**, Storage after (invert soft-delete order for replace path) |
| Concurrency | Lock + require old still READY at finalize; second replace same id DENY |
| UX | Explicit “Zastąp tę próbkę” |
| Auditability | Link via `replaces_take_id` or audit event |

Aligns with prior freeze intent (“no silent auto-delete”) while fixing abandon risk of Variant A.

### Variant D — Two-step UI only (delete API + claim) without atomic replace

Already possible for auth users. **Not** P2 goal (no explicit replace, race windows, anon unsupported).

---

## 9. Atomicity analysis

| Layer | Can be one Postgres transaction? |
|-------|----------------------------------|
| Cap check + INSERT PENDING + (optional) validate replace target | **YES** — extend claim RPC |
| NEW READY + OLD DELETED | **YES** — extend finalize or dedicated RPC |
| Storage upload / download / remove | **NO** — outside PG |

**Rule:** Never treat Storage success as proof of DB success. Prefer:

1. Commit DB state that no longer needs the old object (`DELETED`)  
2. Then remove Storage  
3. Janitor sweeps leftovers (already exists)

---

## 10. Failure matrix

| Case | System state | Risk | Recovery |
|------|--------------|------|----------|
| A. DB success + Storage success | Ideal | None | — |
| B. DB success + Storage failure (old remove) | OLD DELETED in DB; object may remain | Temporary Storage orphan | Janitor leftover sweep |
| C. DB failure + Storage success (if Storage deleted early) | Audio gone; DB still READY | **Data loss** | Avoid Storage-first on replace |
| D. Upload success + finalize failure | PENDING + object | Cap slot held by PENDING unique | Fail PENDING / expire; old still READY under Variant C |
| E. Old object delete success + new finalize failure | Catastrophic if Variant A | Loss of old without new | Forbidden by Variant C |
| F. Concurrent replace same old | Second must DENY | Cap breach / double retire | Advisory lock + OLD still READY predicate |
| G. Retry after timeout | Finalize already READY returns idempotent READY today | Double-retire old? | Finalize must be idempotent: if NEW READY and OLD already DELETED → success; if NEW READY and OLD still READY → complete retire once |

---

## 11. Concurrency analysis

Existing primitives to reuse:

- `pg_advisory_xact_lock` per owner / anon class  
- Unique one-PENDING-per-actor  
- Cap count under lock  

P2 threats:

| Threat | Mitigation |
|--------|------------|
| Two claims without replace at cap | Already DENY |
| Two claims with same `replaceTakeId` | Lock; first reserves; second sees target already reserved or not exclusively READY |
| Two claims with different replace targets at cap | Both try `(N-1)`; only one PENDING allowed → second `CONCURRENT_SESSION` or DENY |
| Cap exceeded via finalize-only | Claim reservation must ensure at most one “extra” READY pending; finalize swaps 1:1 |
| Delete race on replace target mid-flight | Finalize: `UPDATE old WHERE id=… AND status=READY AND deleted_at IS NULL` must affect 1 row or abort |

---

## 12. Idempotency analysis

| Flow | Today |
|------|-------|
| Finalize when already READY | Returns existing READY (auth + anon) — **idempotent success** |
| Soft-delete when already DELETED | Returns DELETED |
| Janitor remove missing object | Treated as success |
| Session claim | New UUID each time — **not** client-idempotent |
| Replace | **Absent** |

**Risk without replace idempotency:** Client retries finalize after success should not re-delete unrelated takes; binding `replaces_take_id` on the NEW row makes retire deterministic.

→ **OD-P2-04** whether a separate client idempotency key is required beyond takeId.

---

## 13. TTL interaction

| Subject | Behavior |
|---------|----------|
| New take `expires_at` | From P1 policy TTL at claim (unchanged) |
| Old take after replace | Should leave ACTIVE_READY set immediately (`DELETED` with `deleted_at`) |
| Old `expires_at` | Irrelevant once DELETED; AuthZ already denies deleted |
| Janitor | Already sweeps `DELETED` leftovers for Storage — **reuse**, do not invent second janitor |
| PENDING abandoned replace | Expires via TTL → EXPIRED; old remains READY |

**Recommendation:** Reuse `DELETED` (existing enum) rather than invent `REPLACED` unless Owner wants distinct audit semantics → **OD-P2-02**.

---

## 14. Recommended architecture

1. **Keep** P1 `getSamplePolicy` for `activeReadyCap` / TTL / duration.  
2. **Extend** claim RPCs with optional `p_replace_take_id uuid` (null = current DENY-at-cap).  
3. **Variant C:** reserve slot at claim; retire old only on successful finalize in one DB transaction.  
4. **Storage:** DB-first delete semantics for replace path; janitor for orphans.  
5. **Do not** change `take-download.ts` (P4).  
6. **Do not** reopen P0.  
7. Soft-delete API remains for “delete without recording”.  
8. UI: when claim returns ACTIVE_READY_CAP, list replaceable READY takes; user must pick explicit replace and resubmit session with `replaceTakeId`.

---

## 15. Proposed state machine

```text
                    ┌──────────────┐
         claim      │ PENDING_     │
      ─────────────►│ UPLOAD       │
                    └──────┬───────┘
           finalize OK     │     expire / fail
                    ┌──────▼───────┐   ┌────────┐
                    │ READY        │──►│EXPIRED │
                    └──────┬───────┘   └────────┘
           soft-delete or  │
           replace-retire  │
                    ┌──────▼───────┐
                    │ DELETED      │  (recommended terminal for replaced)
                    └──────────────┘
```

Replace-specific:

```text
OLD: READY ─────────────────────────────────────┐
NEW: claim(replace=OLD) → PENDING_UPLOAD         │
                         → finalize ──► READY    │
                         and OLD ───────────────► DELETED
```

No new enum required for MVP if Owner accepts DELETED = replaced/retired (**OD-P2-02**).

Optional additive column (implementation phase only, not now):

- `replaces_take_id uuid NULL REFERENCES takes(id)` on new row  

---

## 16. Open Decisions

| ID | Question | Options | Default recommendation |
|----|----------|---------|------------------------|
| **OD-P2-01** | Cross-beat replace? | ALLOW (global slot) / DENY (same `beat_id` only) | DENY same-beat for UX; ALLOW matches today’s soft-delete slot semantics |
| **OD-P2-02** | Old take terminal status? | Reuse `DELETED` / add `REPLACED` enum | Reuse `DELETED` (minimal migration) |
| **OD-P2-03** | When remove old Storage object? | Immediate after DB commit / janitor-only | Immediate best-effort **after** DB commit + janitor sweep |
| **OD-P2-04** | Dedicated client idempotency key? | takeId-only / extra key | takeId + `replaces_take_id` binding sufficient for V1 |
| **OD-P2-05** | Anonymous in P2? | Auth-only / Auth+Anon | Include Anon (cap=1 makes replace the primary path) |
| **OD-P2-06** | Retire timing? | Claim-time delete (A) / Finalize-time (C) | **Finalize-time (C)** |
| **OD-P2-07** | Cap response payload? | Error string only / structured `{ code, replaceableTakes[] }` | Structured list for UX |

---

## 17. Explicit non-goals (P2)

- Anonymous → account claim (P3)  
- Gold own-take download enforcement (P4)  
- Storage architecture / bucket / path convention changes  
- BPM / catalog / beat-audio / mix / render  
- P0 PLATFORM master download  
- Automatic oldest-take eviction  
- `replaceTakeId` silent default  

---

## 18. No mutations performed

This audit executed **read-only** SQL (`SELECT` aggregates/schema) and code inspection only.

- No takes created/deleted  
- No Storage objects removed  
- No profiles / beats / BPM / entitlements / `sample_policy_settings` changes  
- No git commit / push / deploy  

---

## UX sketch (design only)

1. User at cap starts record → server DENY `ACTIVE_READY_CAP` (+ optional replaceable list).  
2. UI: „Masz już X zapisanych próbek. Usuń istniejącą albo zastąp ją nową.”  
3. User selects take → confirm „Zastąp tę próbkę”.  
4. Client retries session with `replaceTakeId`.  
5. On success path, old disappears from active list only after new READY.

---

## Next gate

Owner closes OD-P2-01…07 → separate **Implementation GO**.  
Until then: **no code, no migrations.**
