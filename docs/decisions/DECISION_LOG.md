# Decision Log

Rejestr zatwierdzonych decyzji architektonicznych i produktowych.

**Hierarchia prawdy:** SSOT → dokumentacja architektury → zatwierdzona specyfikacja → kod (§43).

Otwarte pozycje: [OPEN_DECISIONS.md](./OPEN_DECISIONS.md).

---

## Wpisy

### ARCH-05 — POST-DELETE RECONCILIATION — CLOSED / VERIFIED

| Pole | Wartość |
|------|---------|
| Decision / gate | Owner GO — docs closeout + commit + push (no Storage mutation) |
| Status | **CLOSED / VERIFIED** |
| Date | 2026-10-05 |
| Closeout | [ARCH_05_POST_DELETE_RECONCILIATION.md](../audits/ARCH_05_POST_DELETE_RECONCILIATION.md) |
| Parent | ARCH-05 DELETE EXECUTED |

**Confirmed (read-only):** production Storage **11 / 8 / 3 / 0 / 0** · VPS/Local **43/43 RETAINED** · AWS **DEFERRED**. Does **not** authorize further GC or deploy.

---

### ARCH-05 — DELETE EXECUTED — CLOSED / VERIFIED

| Pole | Wartość |
|------|---------|
| Decision / gate | OWNER GO — ARCH-05 DELETE (allowlist-only) |
| Status | **CLOSED / DELETE EXECUTED / VERIFIED** |
| Date | 2026-10-05 |
| Execution | [ARCH_05_DELETE_EXECUTION.md](../audits/ARCH_05_DELETE_EXECUTION.md) |
| Evidence | [ARCH_05_DELETE_EXECUTION_EVIDENCE.json](../audits/ARCH_05_DELETE_EXECUTION_EVIDENCE.json) |
| Allowlist | [ARCH_05_DELETE_ALLOWLIST.json](../audits/ARCH_05_DELETE_ALLOWLIST.json) |
| Parent | ARCH-05 readiness · OD-SA-07-12…13 · Local Layer-2 restore verified |

**Executed:** 32 version-bound Storage deletes on `beat-audio` only. Production inventory **43 → 11** (USER 8 · PLATFORM 3 · ORPHAN 0). Local + VPS backups **43/43 RETAINED**. DB/Auth/Profiles/AWS **NO MUTATION**.

**Ladder:** SAFE → OWNER APPROVED → DELETE EXECUTED → POST-DELETE VERIFIED.

**Does not authorize:** further discovery/prefix GC · VPS/local prune · AWS · commit/push/deploy without separate GO.

---

### ARCH-05 — FINAL SAFE-TO-DELETE READINESS — AUDIT COMPLETE

| Pole | Wartość |
|------|---------|
| Decision / gate | ARCH-05 readiness audit (not delete GO) |
| Status | **READY FOR OWNER DELETE GO** · SAFE **32/32** · OWNER APPROVED **NO** · DELETED **0** |
| Date | 2026-10-05 |
| Readiness | [ARCH_05_FINAL_SAFE_TO_DELETE_READINESS.md](../audits/ARCH_05_FINAL_SAFE_TO_DELETE_READINESS.md) |
| Allowlist | [ARCH_05_DELETE_ALLOWLIST.json](../audits/ARCH_05_DELETE_ALLOWLIST.json) |
| Parent | OD-SA-08 · OD-SA-07-12…13 · Local Layer-2 restore verified |

**Audit only.** Does **not** authorize Storage DELETE. Next: separate **OWNER GO — ARCH-05 DELETE** against version-bound allowlist.

---

### OD-VPS-LOCAL-01…12 — LOCAL WINDOWS BACKUP PLANE — CLOSED / APPROVED

| Pole | Wartość |
|------|---------|
| Decision IDs | **OD-VPS-LOCAL-01** … **OD-VPS-LOCAL-12** |
| Title | Local Windows PC as Layer-2 independent Storage copy (pull from VPS) |
| Status | **OWNER APPROVED** · Design Freeze **COMPLETE** · Implementation **PASS** · Restore drill **PASS** |
| Date | 2026-10-05 |
| Freeze | [STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_DESIGN_FREEZE.md) |
| Implementation | [STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_IMPLEMENTATION.md) |
| Restore drill | [STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) |
| Audit | [STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_AUDIT.md) |
| Parent | OD-SA-06 · OD-SA-07-01…16 · OD-VPS-01…20 / OD-SA-07-14a |

**Approved:** Local Windows = Layer-2 independent copy (not Object Lock); VPS remains Layer-1; Windows **PULL** from VPS only; no delete propagation; append/retain; SHA-256 + manifest + isolated restore drill mandatory; path `C:\BitRymDym-Backup\`; scope `beat-audio` USER/PLATFORM/ORPHAN; AWS **DEFERRED**; BitLocker evidence remains **FINDING** until elevated verify.

**Executed:** Implementation `local-layer2-full-20261005T040146Z-42d6212b` · Restore `local-restore-20261005T040831Z-76ca3678` · **43/43 RESTORE VERIFIED**.

**Still does not authorize (at freeze time):** AWS · ARCH-05 delete · commit/push/deploy without further GO.

**Superseded next gate:** ARCH-05 DELETE later **CLOSED / VERIFIED** (see entry above).

---

### OD-VPS-01…20 / OD-SA-07-14a — VPS BACKUP PLANE — CLOSED / APPROVED

| Pole | Wartość |
|------|---------|
| Decision IDs | OD-VPS-01 … OD-VPS-20 · **OD-SA-07-14a** |
| Title | Contabo VPS as Layer-1 WORKING/STAGING Storage backup plane |
| Status | **OWNER APPROVED** · Design Freeze **COMPLETE** · Phase 1–6 **PASS** · Phase 7+ **NOT STARTED** |
| Date | 2026-10-05 |
| Freeze | [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md) |
| Parent | OD-SA-06 · OD-SA-07-01…16 (CLOSED) · STORAGE-ARCH-01 Contabo = EXTERNAL COMPUTE |

**Approved:** Contabo may hold an *additional* VPS BACKUP PLANE (Layer-1 staging) while EXTERNAL COMPUTE is unchanged; Contabo is **not** sole/final DR; AWS Object Lock remains mandatory; dedicated `bitrymdym-backup` + `/srv/bitrymdym-backup` (Phase 2+); E3 worker NO access to backup tree; SHA-256 + manifest + atomic write + restore drill required.

**OD-SA-07-14a:** Contabo allowed **only** as WORKING/STAGING Layer-1 backup *target* · sole/final DR forbidden · compute role unchanged.

**Phase 1 executed:** SSH key-only · root SSH off · UFW on · fail2ban sshd · admin path `ubuntu`+sudo.  
**Phase 2 executed:** user `bitrymdym-backup` · `/srv/bitrymdym-backup/{objects,manifests,restore-drills,logs}` · 0700 · empty · E3/ubuntu isolation PASS.  
**Phase 3 executed:** transfer/manifest/SHA design + fixture tests + metadata dry-run **PASS**.  
**Phase 4 executed:** controlled canary COPY **3/43** · SHA+size VERIFIED · claim = **CANARY BACKED UP**.  
**Phase 5 executed:** isolated restore drill from VPS backup · SHA+size+WAV/ffprobe **PASS** ×3 · claim = **CANARY RESTORE VERIFIED**.  
**Phase 6 executed:** full VPS Layer-1 expansion · **40** new COPY + canary **3** = **43/43 BACKED UP** · SHA reconcile **43/43** · restore still **3/43** · orphans **BACKED UP / NOT SAFE FOR DELETE** · ARCH-05 **NOT READY**.

**Still does not authorize (without further GO):** VPS Phase 7 restore expansion · AWS immutable DR · ARCH-05 delete.  
**Related:** Local Layer-2 Design Freeze **CLOSED** (OD-VPS-LOCAL-01…12) — implementation still requires separate GO; AWS **DEFERRED** for current variant (not cancelled).

---

### OD-SA-07-01…16 — STORAGE-ARCH-07 Backup Design Freeze — CLOSED

| Pole | Wartość |
|------|---------|
| Decision IDs | OD-SA-07-01 … OD-SA-07-16 |
| Title | Storage source MASTER backup architecture (BACKUP plane) |
| Status | **OWNER APPROVED** · **DESIGN FREEZE COMPLETE** · Phase A **BLOCKED** (AWS not provisioned) |
| Date | 2026-10-04 |
| Decydent | Owner (Prezes Dawid) — GO recorded in session 2026-10-04 |
| Freeze | [STORAGE_ARCH_07_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_07_DESIGN_FREEZE.md) |
| Parent | OD-SA-06 (source MASTER backup required before scale) · [STORAGE_ARCH_01_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) |

**Naming adjacency:** **OD-SA-07** (Mix artifact backup = NIE by default) remains LOCKED and unchanged. OD-SA-07-01…16 are STORAGE-ARCH-07 design decisions only.

**Approved lock:**

| ID | Closed choice |
|----|----------------|
| OD-SA-07-01 | EXTERNAL S3-COMPATIBLE OBJECT STORAGE (vendor/SKU deferred to Implementation Phase) |
| OD-SA-07-02 | SEPARATE CLOUD ACCOUNT/PROJECT · DEDICATED BACKUP BUCKET · separated from prod Supabase |
| OD-SA-07-03 | Versioning ON |
| OD-SA-07-04 | Object Lock / WORM ON · preferred COMPLIANCE MODE · incompatible provider → stop Implementation |
| OD-SA-07-05 | Retention ≥ 90 days for GC-candidate backups · living MASTER ≥ backup lifecycle · no silent retention shorten |
| OD-SA-07-06 | SHA-256 primary · source hash == backup hash · size + content-type + exact key · eTag advisory |
| OD-SA-07-07 | Manifest REQUIRED (full minimum field set in freeze §5) |
| OD-SA-07-08 | Prod `service_role` NO backup-delete/admin · dedicated writer/reader · break-glass admin · prefer no long-lived backup creds in Vercel |
| OD-SA-07-09 | RPO target ≤ 24h new MASTER · pre-GC backup+verify mandatory |
| OD-SA-07-10 | RTO target ≤ 1h single-object · ≤ 72h bucket/set (ops targets ≠ SLA) |
| OD-SA-07-11 | Restore drill mandatory before first ARCH-05 DELETE + periodic · isolated restore only |
| OD-SA-07-12 | Ladder: PROPOSED ≠ BACKED UP ≠ RESTORE VERIFIED ≠ SAFE ≠ OWNER APPROVED ≠ DELETED |
| OD-SA-07-13 | SAFE FOR GC = all 11 conditions · any FAIL ⇒ NOT SAFE |
| OD-SA-07-14 | Scope YES: USER/platform/orphan MASTER · NO default: audio-artifacts / take-audio / Contabo |
| OD-SA-07-15 | Encryption at rest provider-managed min · TLS in transit · SSE variant at Implementation without lowering model |
| OD-SA-07-16 | Manifest PRIMARY = DB records · SECONDARY = signed/hashed JSON in backup plane |

**Consequences**

- Does **not** authorize Implementation, Storage COPY/DELETE, restore drill execution, or ARCH-05 delete
- Does **not** select STORAGE-ARCH-02 primary external durable provider
- Does **not** create a fourth Supabase V1 bucket (backup lives in separate account)
- ARCH-05 remains **NOT READY / BLOCKED** until **Storage** BACKED UP + RESTORE VERIFIED + SAFE + OWNER APPROVED
- Living orphans (32) remain NOT SAFE / NOT BACKED UP / NOT RESTORE VERIFIED / NOT OWNER APPROVED / NOT DELETED
- Living note 2026-10-05: historical local DB dump **FOUND** · still **≠** Storage object backup — [HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md](../audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md) · OD-SA-07-01…16 **not reopened**

---

### OD-ADMIN-DELETE-01…10 — Admin User Delete (W4) — CLOSED / PRODUCTION VERIFIED

| Pole | Wartość |
|------|---------|
| Decision IDs | OD-ADMIN-DELETE-01 … OD-ADMIN-DELETE-10 |
| Title | Admin User Delete + reason + email |
| Status | **OWNER APPROVED** · **CLOSED / PRODUCTION VERIFIED** |
| Date | 2026-10-04 |
| Decydent | Owner (Prezes Dawid) — GO recorded in session 2026-10-04 |
| Freeze | [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./ADMIN_USER_DELETE_DESIGN_FREEZE.md) |

**Approved lock:**

| ID | Proposed choice |
|----|-----------------|
| OD-ADMIN-DELETE-01 | YES — ADMIN may delete **other** accounts |
| OD-ADMIN-DELETE-02 | NO — ADMIN cannot delete own account via panel |
| OD-ADMIN-DELETE-03 | NO — cannot delete last ADMIN |
| OD-ADMIN-DELETE-04 | YES — deletion reason required |
| OD-ADMIN-DELETE-05 | YES — reason in email to target |
| OD-ADMIN-DELETE-06 | NO — email failure does not rollback delete |
| OD-ADMIN-DELETE-07 | YES — reuse ACCOUNT/PROFILE-01 lifecycle |
| OD-ADMIN-DELETE-08 | ADMIN + `users.edit` (not `users.suspend`; no new key) |
| OD-ADMIN-DELETE-09 | RESEND |
| OD-ADMIN-DELETE-10 | Audit action `USER_ACCOUNT_DELETE` |

Production apply (2026-10-04): app `ddcee65` · deploy `dpl_C1y6toEPYacQmsxv5Jsa8Dj5KM38` (redeploy after Resend env; prior `dpl_4qr3…`) · DB `20261004174202` / `admin_user_management_w4_delete`. **EMAIL E2E PASS** (disposable fixture USER #86 · Resend · `bitrymdym.pl`). Remaining P2: last-admin TOCTOU; no durable idempotency; live last-admin concurrency NOT VERIFIED; published USER beat retain NOT LIVE-DATA VERIFIED; migration timestamp drift.

---

### OD-ADMIN-01…07 — Admin User Management Owner Decision Lock

| Pole | Wartość |
|------|---------|
| Decision IDs | OD-ADMIN-01 … OD-ADMIN-07 |
| Title | Admin User Management — W0 Owner Decision Lock |
| Status | CLOSED / ACCEPTED · **W0 LOCKED** · W1 COMPLETE · W2 **PRODUCTION VERIFIED WITH FINDINGS** · W3 **CLOSED / PRODUCTION VERIFIED** @ `237a86f` |
| Date | 2026-10-04 |
| Decydent | Owner (Prezes Dawid) |
| Freeze | [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) |
| W3 closeout | [ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md](../audits/ADMIN_USER_MANAGEMENT_W3_CLOSEOUT.md) |

**Decision (lock)**

| ID | Locked choice |
|----|----------------|
| OD-ADMIN-01 | **YES** — ADMIN may grant/revoke `ADMIN` to **another** user; server-side; `ADMIN` + `users.edit`; confirmation; audited |
| OD-ADMIN-02 | **NO** — ADMIN cannot change own role / no self-demotion via panel |
| OD-ADMIN-03 | **NO** — cannot demote last `ADMIN`; ≥1 active ADMIN; **server-side** guard |
| OD-ADMIN-04 | **OPTIONAL EXPIRATION** — `expires_at` NULL = perpetual; future timestamp = until date; no new `premium_active`; `premium_entitlements` remains SSOT |
| OD-ADMIN-05 | **YES** — ADMIN may see email **only** on `/admin/users`; not public profile |
| OD-ADMIN-06 | **YES** — every admin mutation of role / premium tier / expiration / grant-revoke ADMIN or MODERATOR must be audited (`admin_audit_events`; table delivered with W2) |
| OD-ADMIN-07 | **YES / W3** — history UI; decision CLOSED; delivery **PRODUCTION VERIFIED** @ `237a86f` |

**Architectural lock:** RANK ≠ PREMIUM ≠ ROLE ≠ ACCOUNT_LEVEL. Role = `profiles.role`. Premium = `premium_entitlements` + existing resolver/matrix.

**Waves:** W0 CLOSED · W1 READ-ONLY COMPLETE · W2 MUTATIONS + AUDIT WRITE **PRODUCTION VERIFIED WITH FINDINGS** @ `8c40824` / DB `20261004144223` · W3 history UI **CLOSED / PRODUCTION VERIFIED** @ `237a86f` · W4 Admin Delete **CLOSED / PRODUCTION VERIFIED** @ `ddcee65` · deploy `dpl_C1y6toEPYacQmsxv5Jsa8Dj5KM38` · DB `20261004174202`.

**Consequences**

- Do not implement until Wave GO
- Enum stays `ADMIN` (UI label „Administrator” allowed)
- MODERATOR: no Premium/Role mutations in MVP
- Client never updates `profiles.role` / `premium_entitlements`

---

### OD-REC-01…08 — Recording / Quick Take Design Freeze v1.0

| Pole | Wartość |
|------|---------|
| Decision IDs | OD-REC-01 … OD-REC-08 (Owner D01–D08) |
| Title | Recording / Quick Take Design Freeze v1.0 |
| Status | CLOSED / ACCEPTED · **DESIGN FREEZE LOCKED** |
| Date | 2026-09-27 |
| Decydent | Owner (Prezes Dawid) + Chief Product / Technical Architect |
| Baseline | `c5e1f17` · Community EPIC CLOSED |

**Decision (summary)**

| ID | Locked choice |
|----|----------------|
| OD-REC-01 / D01 | RECORD ≠ PLAYBACK ≠ DOWNLOAD; one Access/AuthZ layer; independent capabilities; shared grant flags independent |
| OD-REC-02 / D02 | Anonymous Quick Take **IN V1** (30s, temporary, short TTL, signed upload, token identity, caps, janitor, CTA login/signup) |
| OD-REC-03 / D03 | Shared grants + RECORD **IN Recording EPIC**; least privilege (RECORD only if grant.record) |
| OD-REC-04 / D04 | **Hybrid** entitlements: Account Level base + future Premium overlay → effective policy; no payments in V1; no new identity system |
| OD-REC-05 / D05 | Retention: BEGINNER 24h · PRO 10d · LEGEND 30d |
| OD-REC-06 / D06 | Own MIC TAKE: preview, download, delete; Track/publish **OUT** of Recording EPIC |
| OD-REC-07 / D07 | Anti-abuse: anon 1/3 · BEGINNER 3/10 · PRO 10/30 · LEGEND 20/60 (active / sessions per UTC day); concurrent 1 |
| OD-REC-08 / D08 | Own take download YES for BEGINNER/PRO/LEGEND; anon no durable take download |

Also locked (architecture-resolvable / SSOT):  
`recording_max_seconds = MIN(beat.duration, entitlement.max, 180)` server-enforced; MIC TAKE ≠ mixed song; MIX/EXPORT separate EPIC (OD-14 remains OPEN).

**Scope**

Recording / Quick Take EPIC design only. Implementation requires separate Wave 1 Owner GO.

**Consequences**

- Freeze doc: [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md)
- Do not implement until Wave GO
- OD-04/07/08 remain OPEN for payments/Premium catalog; hybrid overlay no-op in V1
- Beat download OD-05/06/17 unchanged

**Related documentation**

- Cold-start audit + Design Freeze proposal + Final Owner Decision Review under `docs/audits/`
- [AUTHORIZATION.md](../architecture/AUTHORIZATION.md) · [AUDIO_TRANSPORT.md](../architecture/AUDIO_TRANSPORT.md) · SSOT §18–§24

---

### OD-01 — Frontend stack

| Pole | Wartość |
|------|---------|
| Decision ID | OD-01 |
| Title | Frontend stack |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) + Chief Product / Technical Architect |

**Decision**

BitRymDym frontend:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui jako baza komponentów
- własny BitRymDym Design System
- Next.js App Router

**Scope**

Warstwa UI / frontend aplikacji. Nie obejmuje identyfikacji wizualnej produktu (OD-15).

**Rationale**

Zatwierdzony kierunek architektoniczny Ownera: nowoczesny App Router, TypeScript, Tailwind oraz shadcn/ui wyłącznie jako baza techniczna komponentów — nie jako wygląd marki.

**Consequences**

- Scaffold aplikacji (etap 1.2+) opiera się o ten stack.
- shadcn/ui nie zastępuje BitRymDym Design System.
- Custom Audio Player i komponenty brandowe pozostają autorskie.
- Produkt nie może wyglądać jak generyczny „AI SaaS dashboard”.

**Related documentation**

- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §2, §10, §41
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md) (OD-15 nadal OPEN)

---

### OD-02 — Application server / backend application layer

| Pole | Wartość |
|------|---------|
| Decision ID | OD-02 |
| Title | Application server (Next.js server layer) |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) + Chief Product / Technical Architect |

**Decision**

Na początku projektu **nie** tworzymy osobnego Express / NestJS / Fastify ani innego niezależnego backendu.

Next.js pełni rolę głównej warstwy aplikacyjnej / server layer poprzez:

- Server Actions,
- Route Handlers / API handlers,
- server-side business logic.

**Scope**

Granica aplikacji: request → auth → authorization → permission → business rule → database/storage → response.

**Rationale**

Zatwierdzony kierunek: jedna warstwa Next.js dla UI i logiki serwerowej na start; krytyczna logika biznesowa nie może opierać się wyłącznie na frontendzie.

**Consequences**

- Frontend prosi; server decyduje.
- Brak osobnego serwera Node jako wymogu Fazy 1.
- Authorization i business rules żyją po stronie serwera Next.js (wspólnie z RLS w Supabase — OD-03).

**Related documentation**

- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §39

---

### OD-03 — Backend infrastructure (Supabase)

| Pole | Wartość |
|------|---------|
| Decision ID | OD-03 |
| Title | Backend infrastructure — Supabase |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) + Chief Product / Technical Architect |

**Decision**

Supabase jest zatwierdzoną warstwą infrastruktury backendowej:

- PostgreSQL
- Supabase Auth
- Row Level Security (RLS)
- Supabase Storage
- Edge Functions — tylko tam, gdzie będą potrzebne

Model tożsamości:

```text
Supabase Auth → Profile → Role → Permissions → Account Level
```

**Role ≠ Account Level**

Role: `ADMIN` | `MODERATOR` | `USER`
Account Level (robocze, OD-09 OPEN): `BEGINNER_RAPPER` | `PRO_RAPPER` | `LEGEND_RAPPER`

**Scope**

Dane, authentication, enforcement na poziomie danych (RLS), storage, wybrane funkcje backendowe.

**Rationale**

Zatwierdzony kierunek Ownera: Supabase jako infrastruktura; Next.js jako application server (OD-02). Preferencja Auth z SSOT §5 zostaje potwierdzona jako decyzja.

**Consequences**

- Schemat DB, Auth, Storage i RLS projektowane pod Supabase.
- Szczegóły codec/watermark/pipeline audio pozostają OPEN (OD-12–OD-14).
- Nazwy account levels mogą zostać zmienione przez OD-09 bez zmiany modelu Role ≠ Account Level.

**Related documentation**

- [SYSTEM_ARCHITECTURE.md](../architecture/SYSTEM_ARCHITECTURE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §4, §5, §9, §36
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

### OD-19 — Default account level on signup

| Pole | Wartość |
|------|---------|
| Decision ID | OD-19 |
| Title | Default account level on signup |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

New users receive `BEGINNER_RAPPER` as default account level.

Role remains `USER`.

```text
SIGNUP → role = USER + account_level = BEGINNER_RAPPER
```

This is **not** a Premium mechanism and does not grant paid features.

**ROLE ≠ ACCOUNT LEVEL** remains in force.

**Scope**

Profile creation defaults (DB column default + Auth signup trigger).

**Rationale**

Owner-approved signup default after Phase 1.3 security audit; matches existing implementation.

**Consequences**

- `BEGINNER_RAPPER` is the **approved default**, not provisional.
- Final display names of account levels may still change via OD-09 without changing this default enum value unless Owner revisits.

**Related documentation**

- [AUTHORIZATION.md](../architecture/AUTHORIZATION.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §4

---

### OD-20 — First ADMIN bootstrap

| Pole | Wartość |
|------|---------|
| Decision ID | OD-20 |
| Title | First ADMIN bootstrap |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

No automatic first-admin mechanism exists in application signup flow.

First ADMIN is provisioned manually through a controlled operator/admin mechanism outside normal user signup.

Forbidden:

- first-user becomes ADMIN
- signup admin
- email-based hidden admin
- public admin bootstrap endpoint
- client-side admin escalation
- magic admin token

**MANUAL / OPERATOR-CONTROLLED ADMIN BOOTSTRAP**

Operator sets `profiles.role = 'ADMIN'` for an existing Auth user via Supabase Dashboard SQL / service-role tooling — never via normal USER signup UI.

Do not store secrets in documentation.

**Scope**

Production admin provisioning security model.

**Rationale**

Prevents privilege escalation and accidental admin grant on first registration.

**Consequences**

- App signup always creates `USER`.
- No Phase 1.3 bootstrap endpoint.
- Production requires operator-controlled ADMIN assignment before admin features are usable.

**Related documentation**

- [AUTHORIZATION.md](../architecture/AUTHORIZATION.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §3, §36

---

### Phase 1.4 — Beats Domain Foundation (formal closeout)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.4 Beats Domain Foundation — COMPLETE / LOCKED |
| Status | CLOSED / LOCKED (implementation + docs continuity) |
| Date | 2026-09-25 |
| Decydent | Owner (Prezes Dawid) — accepted Design Freeze + commit/push |
| Canonical commit | `6cb1e9a` — `feat(beats): complete phase 1.4 beats domain foundation` |
| Branch | `main` / `origin/main` |

**Frozen scope (metadata only)**

- `public.beats` + `beat_status` + `beat_ownership_type`
- Canonical metadata fields; BPM numeric; duration ≤ 180 s
- Ownership: `PLATFORM` ⇒ `owner_id` NULL; `USER` ⇒ `owner_id` = `profiles.id`
- Active ADMIN status lifecycle: DRAFT → PUBLISHED → ARCHIVED → DRAFT; **PUBLISHED → DRAFT forbidden**
- AuthZ via existing `beats.create|edit|delete|approve|reject` (no new permission keys)
- RLS: public `PUBLISHED` read; ADMIN write; MODERATOR review visibility/path
- Central server validation + status transitions; Role ≠ AccountLevel

**Explicitly out of Phase 1.4**

- Audio Storage / buckets
- Audio columns / upload / codecs (OD-12 remains OPEN)
- Player, downloads, Quick Take, payments, community upload

**Related documentation**

- [BEATS.md](../architecture/BEATS.md)
- [PROJECT_STATE.md](../PROJECT_STATE.md)
- [PHASE_1_FOUNDATION.md](../phases/PHASE_1_FOUNDATION.md)
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md) — OD-04…OD-18 still OPEN

---

### Phase 1.5 — Private Audio Storage + Access Gate (implementation closeout note)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.5 Private Audio Storage + Controlled Access Gate |
| Status | COMPLETE / CLOSED / LOCKED |
| Date | 2026-09-26 |
| Design Freeze | `0e5c491` — APPROVED / LOCKED |
| Implementation commit | `0ec0be0` — `feat(audio): complete phase 1.5 private storage and access gate` |
| Baseline before impl | `origin/main` @ `0e5c491` |

**Frozen scope delivered:**

- Private bucket `beat-audio`
- `beat_audio_assets` separate from `beats` metadata
- Opaque `.bin` object keys; MIME authoritative; OD-12 remains OPEN
- Access Gate anonymous / authenticated / admin upload paths
- Signed URL PLAYBACK 120s / DOWNLOAD 300s
- ADMIN PLATFORM upload only

**Still out of scope:** download limits, Quick Take, community upload, watermark, payments.

---

### Phase 1.6 — Published Beats Surface + Playback Shell (closeout)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.6 Published Beats Surface + Playback Shell |
| Status | **COMPLETE / CLOSED / LOCKED** |
| Date | 2026-09-26 |
| Design Freeze | [PHASE_1_6_DESIGN_FREEZE.md](../phases/PHASE_1_6_DESIGN_FREEZE.md) — APPROVED / LOCKED |
| Implementation commit | `39be430` — `feat(beats): complete phase 1.6 playback surface` |
| Baseline before impl | `origin/main` @ `7de20a3` |
| Production | **GREEN / VERIFIED** |

**Frozen scope delivered:**

- `/beats` PUBLISHED-only catalog; `/beat/[id]` PUBLISHED-only detail
- Custom Playback Shell (no native audio controls UI)
- PLAYBACK via existing Access Gate only

**Still out of scope / remaining state:** DOWNLOAD UI / limits / counters / audit (**PARTIAL** backend signed DOWNLOAD only); Quick Take **NOT STARTED**; waveform; Admin CMS; payments.
**OD-04 … OD-18 remain OPEN.**

---

### Phase 1.7 — Admin PLATFORM Content Ops Surface (closeout)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.7 Admin PLATFORM Content Ops Surface |
| Status | **COMPLETE / CLOSED / LOCKED** |
| Date | 2026-09-26 |
| Design Freeze | [PHASE_1_7_DESIGN_FREEZE.md](../phases/PHASE_1_7_DESIGN_FREEZE.md) — APPROVED / LOCKED |
| Implementation commit | `ed499ee` — `feat(admin): complete phase 1.7 platform content ops` |
| Baseline before impl | `origin/main` @ `d5b4e91` |
| Production | **GREEN / VERIFIED** |

**Frozen scope delivered:**

- `/admin/beats*` ADMIN-only ops surface
- PLATFORM create/edit + MASTER upload via existing services
- UI Publish gate requires READY MASTER; server hard READY rule remains GAP-PUBLISH-READY
- Audit infrastructure GAP preserved

**Production verification:** public/auth/routing/security/regression **PASS**.
**Live Admin E2E:** NOT VERIFIED — OD-20 / `admin_count=0` (non-blocking).
**Published Content E2E:** NOT VERIFIED — `published_count=0` (non-blocking).

**OD-04, OD-07…OD-16, OD-18 remain OPEN.** OD-20 CLOSED (operator ADMIN).
**Post–1.7 note:** OD-05 / OD-06 / OD-17 CLOSED 2026-09-26 as Phase 1.8A interim (see below).

---

### OD-05 — Anonymous download limit (Phase 1.8A interim)

| Pole | Wartość |
|------|---------|
| Decision ID | OD-05 |
| Title | Limit pobrań — użytkownik anonimowy |
| Status | CLOSED / ACCEPTED (Phase 1.8A interim model) |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |

**Decision**

```text
anonymous_daily_download_limit = 2
window = UTC calendar day
identity = httpOnly opaque anonymous token
server stores only token hash
scope = global (all beats)
```

Config SSOT: `src/config/downloads.ts` (no magic numbers).
Known limitation: clearing cookies / private mode resets the soft identity.

**Scope**

Phase 1.8A Download Productization only. Does not close Premium / payment limits.

**Related documentation**

- [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §13
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

### OD-06 — Authenticated user download limit (Phase 1.8A interim)

| Pole | Wartość |
|------|---------|
| Decision ID | OD-06 |
| Title | Limit pobrań — użytkownik zalogowany |
| Status | CLOSED / ACCEPTED (Phase 1.8A interim model) |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |

**Decision**

```text
user_daily_download_limit = 4
window = UTC calendar day
identity = authenticated user_id
scope = global per user
```

AccountLevel unused for download limits in Phase 1.8A.
Config SSOT: `src/config/downloads.ts`.

**Scope**

Phase 1.8A Download Productization. Premium boost / per-beat purchase OUT.

**Related documentation**

- [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §13
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

### OD-17 — Repeat download counting (Phase 1.8A interim)

| Pole | Wartość |
|------|---------|
| Decision ID | OD-17 |
| Title | Zasady liczenia powtórnych pobrań |
| Status | CLOSED / ACCEPTED (Phase 1.8A interim model) |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |

**Decision**

```text
DOWNLOAD_EVENT = successful DOWNLOAD signed-URL issuance
after:
  AUTH / IDENTITY
  → SERVER AUTHORIZATION
  → READY asset
  → RESERVATION (ephemeral; NOT an event)
  → SIGNED DOWNLOAD URL SUCCESS
  → FINALIZE
  → EVENT (beat_download_events)
```

Each successful DOWNLOAD URL issuance counts **1** toward the daily limit.
File-transfer success is not required / not reliably observable.
Persistence: `beat_download_events` only after finalize (reservation TTL default 120s).
Reservation is never a DOWNLOAD_EVENT; expired reservations are not counted.

**Scope**

Phase 1.8A Download Productization counting + limits + Moje pobrane derivation.

**Related documentation**

- [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md)
- [MASTER_SSOT_v0.1.md](../ssot/MASTER_SSOT_v0.1.md) §17
- [OPEN_DECISIONS.md](./OPEN_DECISIONS.md)

---

### Phase 1.8A — Download Productization (Design Freeze lock)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.8A Download Productization — Design Freeze |
| Status | **APPROVED / LOCKED** — READY FOR IMPLEMENTATION |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) |
| Implementation | **NOT STARTED** (awaiting Owner Implementation GO) |

**Frozen:**

- Access Gate DOWNLOAD **REUSE** (TTL 300s); no duplicate AuthZ engine
- OD-05 / OD-06 / OD-17 interim rules CLOSED (above)
- Moje pobrane = **IN** (minimal authenticated)
- `beat_download_events` required
- Config = `src/config/downloads.ts`
- OD-13 watermark **OUT**; OD-04 payments **OUT**
- Quick Take / Tracks / Community **OUT**

**Not applied at freeze:** code, migrations, commit, push.

---

### Phase 1.8A — Download Productization (implementation note)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.8A Download Productization — Implementation |
| Status | **COMPLETE / CLOSED / LOCKED** |
| Date | 2026-09-26 |
| Decydent | Owner Implementation GO |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) |
| Migrations | `phase_1_8a_download_events`, `phase_1_8a_claim_rpc_grants`, `phase_1_8a_download_reservation` |
| Commit | `fd87f23` — `feat(downloads): complete phase 1.8a download productization` |

**Delivered:** Access Gate REUSE; limits 2/4 UTC; reservation → signed URL → finalize; `beat_download_events`; Moje pobrane; Download CTA; config SSOT.

**Concurrency:** `reserve_beat_download_slot` uses `pg_advisory_xact_lock`; provisional **reservation** (not event) until signed URL succeeds, then `finalize_beat_download` inserts final OD-17 event. URL failure → `release_beat_download_reservation` (no event). Expired reservations free the slot (TTL 120s).

---

### Phase 1.8A — Implementation Audit PASS + Documentation Closeout

| Pole | Wartość |
|------|---------|
| Title | Phase 1.8A Download Productization — Implementation Audit PASS |
| Status | **IMPLEMENTATION AUDIT PASS** · **DOCUMENTATION COMPLETE** · superseded by closeout below |
| Date | 2026-09-26 |
| Decydent | Owner Implementation Audit GO → Documentation Closeout GO |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |

**Audit results:**

| Area | Result |
|------|--------|
| OD-17 | PASS |
| Reservation model | PASS |
| Crash safety | PASS |
| Concurrency | PASS |
| Table grants | PASS |
| RLS | PASS |
| Security | PASS |
| Tests | **84/84** |
| Lint / typecheck / build | PASS |
| Live DB | PASS |
| Scope | PASS |

**Known non-blocking gaps (retained):**

- No live RLS/concurrency integration tests (unit/source-contract coverage)
- Live product E2E **NOT VERIFIED** (`published_count=0`, `admin_count=0` / OD-20)

---

### Phase 1.8A — CLOSED / LOCKED (production verified)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.8A Download Productization — Final Closeout |
| Status | **COMPLETE / CLOSED / LOCKED** |
| Date | 2026-09-26 |
| Decydent | Owner GO — COMMIT → PUSH → PRODUCTION VERIFY → CLOSEOUT |
| Design Freeze | [PHASE_1_8A_DESIGN_FREEZE.md](../phases/PHASE_1_8A_DESIGN_FREEZE.md) — APPROVED / LOCKED |
| Implementation commit | `fd87f23` — `feat(downloads): complete phase 1.8a download productization` |
| Push | COMPLETE → `origin/main` |
| Production Verify | **PASS** (code smoke); Live E2E **NOT VERIFIED** (empty catalog / no ADMIN) |

**Closed as:**

```text
IMPLEMENTATION = COMPLETE
IMPLEMENTATION AUDIT = PASS
DOCUMENTATION = COMPLETE
COMMIT = fd87f23
PUSH = COMPLETE
PRODUCTION VERIFY = PASS
PHASE 1.8A = CLOSED / LOCKED
```

**Next:** Cold-Start Audit for next Foundation candidate (no implementation without Owner GO).

---

### Phase 1.9 — Operator Production Enablement (Design Freeze)

| Pole | Wartość |
|------|---------|
| Title | Phase 1.9 Operator Production Enablement — Design Freeze |
| Status | **APPROVED / LOCKED** · IMPLEMENTATION **IN PROGRESS** · PRODUCTION BOOTSTRAP **PENDING** (not CLOSED) |
| Date | 2026-09-26 |
| Decydent | Owner (Prezes Dawid) — Candidate A APPROVED |
| Design Freeze | [PHASE_1_9_DESIGN_FREEZE.md](../phases/PHASE_1_9_DESIGN_FREEZE.md) |
| Runbook | [PRODUCTION_BOOTSTRAP.md](../runbooks/PRODUCTION_BOOTSTRAP.md) |
| Baseline | `70eb501` · Phase 1.8A CLOSED @ `fd87f23` |

**Frozen scope**

- Manual OD-20 ADMIN promotion (SQL/service-role tooling; no app bootstrap)
- First PLATFORM beat via existing `/admin/beats*` UI only
- READY MASTER + PUBLISHED via UI publish gate (no SQL READY/PUBLISHED bypass)
- Production E2E: playback → download → My Downloads; OD-17 verify; limits smoke
- Evidence package (private); no full Audit Log product
- **NO** database migration; **NO** AuthZ/RLS/Storage/download architecture changes

**Explicitly OUT:** auto-admin, bootstrap endpoint, Quick Take, Tracks, Community, Payments, Full Audit Log, watermark, mix/export.

**Related:** OD-20 CLOSED / unchanged · OD-19 CLOSED · OD-05/06/17 interim CLOSED (1.8A).

---

### OD-COMMUNITY-01 — Staff publish for community beats

| Pole | Wartość |
|------|---------|
| Decision ID | OD-COMMUNITY-01 |
| Title | Who may publish APPROVED → PUBLISHED (community) |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-27 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

`APPROVED → PUBLISHED` for USER-owned beats may be performed by **ADMIN** and **MODERATOR**. **USER never publishes.** Every publish still requires an active MASTER READY asset for that beat.

**Rationale**

Separates content acceptance (approve) from public release (publish) while allowing moderators to complete the community loop without ADMIN bottleneck. READY hard gate remains universal.

**Consequences**

- Extend transition matrix + trigger/RLS for MODERATOR USER publish path.
- Do **not** grant MODERATOR `beats.edit` solely for publish (avoid PLATFORM metadata write).
- Generalize publish hard gate beyond PLATFORM+DRAFT-only.

**Related:** [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

### OD-COMMUNITY-02 — Rejection reason

| Pole | Wartość |
|------|---------|
| Decision ID | OD-COMMUNITY-02 |
| Title | rejection_reason on REJECTED |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-27 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

Add nullable column `beats.rejection_reason text`. On `PENDING_REVIEW → REJECTED` the reason is **required**. USER may read the reason on their own beat. No comment/thread system.

**Related:** [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

### OD-COMMUNITY-03 — USER create permission + ownership AuthZ

| Pole | Wartość |
|------|---------|
| Decision ID | OD-COMMUNITY-03 |
| Title | USER beats.create + ownership enforcement |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-27 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

USER receives permission `beats.create`. Do **not** invent `beats.create_own` unless the existing model proves unsafe. Ownership is **not** derived from permission alone: service + RLS + trigger must force `ownership_type=USER`, `owner_id=auth.uid()`, initial `status=DRAFT`. USER cannot change ownership fields. Submit = controlled transition `DRAFT → PENDING_REVIEW` for own USER beat with active MASTER READY only.

**Consequences**

- PLATFORM create/transport must retain explicit ADMIN role checks (already present).
- Trigger INSERT must stop being ADMIN-only.

**Related:** [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

### OD-COMMUNITY-04 — Account levels and upload eligibility

| Pole | Wartość |
|------|---------|
| Decision ID | OD-COMMUNITY-04 |
| Title | All account levels may upload in V1 |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-27 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

`BEGINNER_RAPPER`, `PRO_RAPPER`, and `LEGEND_RAPPER` may upload in V1. Account Level does **not** bypass moderation. No Premium bypass. Role ≠ Account Level unchanged.

**Related:** [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

### OD-COMMUNITY-05 — USER archive own PUBLISHED

| Pole | Wartość |
|------|---------|
| Decision ID | OD-COMMUNITY-05 |
| Title | USER may archive own PUBLISHED beat |
| Status | CLOSED / ACCEPTED |
| Date | 2026-09-27 |
| Decydent | Owner (Prezes Dawid) |

**Decision**

USER may transition own `DRAFT` / `REJECTED` / `PUBLISHED` → `ARCHIVED`. That path must not change ownership, set APPROVED, or re-publish.

**Related:** [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md)

---

### Community Beat Upload + Moderation — Design Freeze

| Pole | Wartość |
|------|---------|
| Title | Community Beat Upload + Moderation — Design Freeze |
| Status | **READY / OWNER GO** · Implementation **NONE** |
| Date | 2026-09-27 |
| Decydent | Owner (Prezes Dawid) — Design Freeze GO |
| Design Freeze | [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md) |
| Baseline | `47643c2` · Phase 1.9 CLOSED · Production GREEN |

**Frozen:** USER ownership lifecycle; signed upload to `beat-audio` with `user/…` keys; moderation approve/reject; staff publish with READY gate; UX routes; security invariants; waves 1–5 planning only.

**Explicitly OUT:** new bucket, new audio/BPM stack, comments, voting, QT, tracks, payments, watermark, orphan cron, USER publish, auto-publish on APPROVE.

---

### Community Wave 1 — DB / RLS / Trigger / AuthZ

| Pole | Wartość |
|------|---------|
| Title | Community Beat Upload — Wave 1 foundation |
| Status | **IMPLEMENTED** |
| Date | 2026-09-27 |
| Decydent | Owner Wave 1 GO |
| Design Freeze | [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md) |
| Migration | `community_wave1_ownership` |

**Delivered:** rejection_reason; USER `beats.create`; `beats.publish` for ADMIN+MODERATOR; RLS/trigger; ownership-aware publish gate; community service contracts; object key `user/` validator; unit + live RLS.

**Explicitly OUT of Wave 1:** upload UI, user transport, moderation UI, publish UI, Storage INSERT policies.
