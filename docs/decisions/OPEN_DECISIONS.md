# Otwarte decyzje (DECISION REQUIRED)

**Źródło:** [MASTER SSOT v0.1](../ssot/MASTER_SSOT_v0.1.md) §44
**Zasada:** Cursor Agent NIE może samodzielnie wymyślać ani zamrażać elementów oznaczonych jako OPEN.
**Zamknięte decyzje:** pełne wpisy w [DECISION_LOG.md](./DECISION_LOG.md).

---

## Jak korzystać z tego rejestru

1. Pozycja OPEN pozostaje otwarta, dopóki Owner / Architect nie zatwierdzi decyzji.
2. Po decyzji: wpis w `DECISION_LOG.md`, status CLOSED w tym pliku (historia ID zachowana), aktualizacja SSOT / architektury jeśli wymagane.
3. Implementacja funkcji zależnych od decyzji OPEN jest zablokowana.
4. **Nie renumerować** ID. Nie usuwać historii CLOSED.

---

## Lista decyzji — status

| ID | Temat | Kontekst SSOT | Blokuje | Status |
|----|--------|---------------|---------|--------|
| OD-01 | Dokładny stack frontendowy | §44 | scaffold aplikacji, player UI | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-02 | Dokładny stack backendowy (application server) | §44 | API, walidacja serwerowa | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-03 | Architektura infrastruktury Supabase | §5, §9, §44 | Auth, Storage, schemat DB | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-04 | Operator płatności | §15, §44 | Faza 4 — Payments | OPEN |
| OD-05 | Limit pobrań — użytkownik anonimowy | §13 | Download limits | **CLOSED / ACCEPTED** — 2026-09-26 (Phase 1.8A interim) |
| OD-06 | Limit pobrań — użytkownik zalogowany | §13 | Download limits | **CLOSED / ACCEPTED** — 2026-09-26 (Phase 1.8A interim) |
| OD-07 | Ceny Premium | §15, §48 | Faza 4 | OPEN |
| OD-08 | Dokładne poziomy Premium | §4, §22–23 | Faza 4 / Creator Progress W2 | **CLOSED / ACCEPTED** — 2026-10-03 · FREE / BRONZE / SILVER / GOLD · [W2 Design Contract](./W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md) |
| OD-09 | Ostateczne nazwy poziomów konta | §4 (nazwy robocze) | Profile, billing | OPEN |
| OD-10 | Finalne nazwy głosowania | §27 | Faza 2 — Voting | OPEN |
| OD-11 | Mechanizm moderacji komentarzy | §28 | Faza 2 — Comments | OPEN |
| OD-12 | Metoda kodowania audio | §9, §24 | Playback / download versions | OPEN |
| OD-13 | Metoda watermarkingu audio | §9 | Download pipeline | OPEN |
| OD-14 | Metoda miksowania nagrania z bitem | §24 | Export / publikacja utworu | OPEN |
| OD-15 | Finalna identyfikacja wizualna | §2, §41 | Design system, UI | OPEN |
| OD-16 | Finalny język marki (copy) | §2, §41 | Teksty UI / marketing | OPEN |
| OD-17 | Zasady liczenia powtórnych pobrań | §17 | Download stats | **CLOSED / ACCEPTED** — 2026-09-26 (Phase 1.8A interim) |
| OD-18 | Zasady liczenia udostępnień | §34 | Beat sharing stats | OPEN |
| OD-19 | Domyślny account level przy rejestracji | §4 | Profile creation default | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-20 | Bezpieczny bootstrap pierwszego ADMIN | §3, §36 | Production admin access | **CLOSED / ACCEPTED** — 2026-09-25 |
| OD-COMMUNITY-01 | Kto publikuje APPROVED→PUBLISHED (community) | §8 | Community publish AuthZ | **CLOSED / ACCEPTED** — 2026-09-27 |
| OD-COMMUNITY-02 | rejection_reason przy REJECTED | §8 | Community moderation | **CLOSED / ACCEPTED** — 2026-09-27 |
| OD-COMMUNITY-03 | Permission / ownership dla USER create + submit | §8, §36 | Community upload AuthZ | **CLOSED / ACCEPTED** — 2026-09-27 |
| OD-COMMUNITY-04 | Account levels a upload V1 | §4 | Community upload eligibility | **CLOSED / ACCEPTED** — 2026-09-27 |
| OD-COMMUNITY-05 | USER archive własnego PUBLISHED | §8 | Community lifecycle | **CLOSED / ACCEPTED** — 2026-09-27 |
| OD-REC-01 | RECORD capability vs PLAYBACK/DOWNLOAD | §18–§24 | Recording Access | **CLOSED / ACCEPTED** — 2026-09-27 (D01=A) |
| OD-REC-02 | Anonymous Quick Take in V1 | §20 | Recording scope | **CLOSED / ACCEPTED** — 2026-09-27 (D02=B) |
| OD-REC-03 | Shared grants + RECORD in Recording EPIC | §16, §18 | Shared recording | **CLOSED / ACCEPTED** — 2026-09-27 (D03=B) |
| OD-REC-04 | Account Level + future Premium hybrid entitlements | §4, §22–§23 | Recording entitlements | **CLOSED / ACCEPTED** — 2026-09-27 (D04=HYBRID) |
| OD-REC-05 | LEGEND take retention = 30 days | §21–§23 | Retention | **CLOSED / ACCEPTED** — 2026-09-27 (D05) |
| OD-REC-06 | Own MIC TAKE preview/download/delete; Track publish OUT | §19, §25 | Take ownership UX | **CLOSED / ACCEPTED** — 2026-09-27 (D06) |
| OD-REC-07 | Anti-abuse active + daily session caps | §39 | Recording abuse | **CLOSED / ACCEPTED** — 2026-09-27 (D07) |
| OD-REC-08 | Own MIC TAKE download for BEGINNER/PRO/LEGEND; anon no durable DL | §19–§21 | Take download | **CLOSED / ACCEPTED** — 2026-09-27 (D08) |
| OD-ADMIN-01 | ADMIN grant/revoke ADMIN to another user | §35–§36 | Admin users | **CLOSED / ACCEPTED** — 2026-10-04 (YES) |
| OD-ADMIN-02 | ADMIN change own role | §35–§36 | Admin users | **CLOSED / ACCEPTED** — 2026-10-04 (NO) |
| OD-ADMIN-03 | Demote last ADMIN | §35–§36 | Admin users | **CLOSED / ACCEPTED** — 2026-10-04 (NO) |
| OD-ADMIN-04 | Premium perpetual vs expires_at | §4, §22–23 | Admin Premium | **CLOSED / ACCEPTED** — 2026-10-04 (OPTIONAL EXPIRATION) |
| OD-ADMIN-05 | ADMIN sees user email | §35, privacy | Admin users | **CLOSED / ACCEPTED** — 2026-10-04 (YES /admin/users only) |
| OD-ADMIN-06 | Audit role/Premium mutations | §35, §37 | Admin users | **CLOSED / ACCEPTED** — 2026-10-04 (YES) |
| OD-ADMIN-07 | History UI for role/Premium | §35 | Admin users | **CLOSED / ACCEPTED** — 2026-10-04 (YES / W3) |
| OD-ADMIN-DELETE-01 | ADMIN may delete other accounts | §35 | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (YES) · delivery **CLOSED / PRODUCTION VERIFIED** |
| OD-ADMIN-DELETE-02 | ADMIN may delete own account via panel | §35 | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (NO) |
| OD-ADMIN-DELETE-03 | May delete last ADMIN | §35 | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (NO) |
| OD-ADMIN-DELETE-04 | Deletion reason required | §35 | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (YES) |
| OD-ADMIN-DELETE-05 | Reason in email to deleted user | §35 | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (YES) |
| OD-ADMIN-DELETE-06 | Email failure rolls back delete | §35 | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (NO) |
| OD-ADMIN-DELETE-07 | Reuse ACCOUNT/PROFILE-01 lifecycle | ACCOUNT/PROFILE-01 | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (YES) |
| OD-ADMIN-DELETE-08 | Permission for admin delete | §36 | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (ADMIN + `users.edit`) |
| OD-ADMIN-DELETE-09 | Transactional email provider | Auth email | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (RESEND) |
| OD-ADMIN-DELETE-10 | Audit action name | `admin_audit_events` | Admin delete W4 | **CLOSED / ACCEPTED** — 2026-10-04 (`USER_ACCOUNT_DELETE`) |
| OD-SA-07-01 | Backup provider (STORAGE-ARCH-07) | OD-SA-06 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · EXTERNAL S3-COMPATIBLE · Phase A **BLOCKED** (AWS not provisioned) |
| OD-SA-07-02 | Backup location | OD-SA-06 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · separate account + dedicated bucket |
| OD-SA-07-03 | Backup versioning | OD-SA-06 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · ON |
| OD-SA-07-04 | Backup immutability | OD-SA-06 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · Object Lock / WORM · Compliance preferred |
| OD-SA-07-05 | Backup retention | OD-SA-06 | Storage backup / ARCH-05 | **CLOSED / ACCEPTED** — 2026-10-04 · ≥90d GC candidates |
| OD-SA-07-06 | Backup integrity | OD-SA-06 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · SHA-256 primary |
| OD-SA-07-07 | Backup manifest | OD-SA-06 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · REQUIRED |
| OD-SA-07-08 | Backup credentials | OD-SA-06 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · separated principals |
| OD-SA-07-09 | Backup RPO | OD-SA-06 | Storage backup / ARCH-05 | **CLOSED / ACCEPTED** — 2026-10-04 · ≤24h + pre-GC verify |
| OD-SA-07-10 | Backup RTO | OD-SA-06 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · ≤1h / ≤72h targets |
| OD-SA-07-11 | Restore drill | OD-SA-06 | ARCH-05 gate | **CLOSED / ACCEPTED** — 2026-10-04 · mandatory before first delete |
| OD-SA-07-12 | GC safety ladder | OD-SA-08 | ARCH-05 | **CLOSED / ACCEPTED** — 2026-10-04 |
| OD-SA-07-13 | SAFE FOR GC contract | OD-SA-08 | ARCH-05 | **CLOSED / ACCEPTED** — 2026-10-04 |
| OD-SA-07-14 | Backup scope V1 | OD-SA-06 / OD-SA-07 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-04 · MASTER yes · artifacts/takes/Contabo no · amended by **OD-SA-07-14a** |
| OD-VPS-01…20 | VPS BACKUP PLANE (Contabo Layer-1) | OD-SA-06 / OD-SA-07 | Storage backup staging | **CLOSED / ACCEPTED** — 2026-10-05 · Phase 1–6 **PASS** — [freeze](../audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md) |
| OD-VPS-LOCAL-01…12 | LOCAL WINDOWS Layer-2 independent copy | OD-VPS / OD-SA-07 | Storage DR Layer-2 | **CLOSED / ACCEPTED** — 2026-10-05 · **43/43 RESTORE VERIFIED** — [restore](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) |
| OD-SA-07-14a | Contabo Layer-1 exception | OD-SA-07-14 | Storage backup plane | **CLOSED / ACCEPTED** — 2026-10-05 · Contabo WORKING/STAGING Layer-1 only · sole/final DR forbidden · compute unchanged |
| OD-SA-07-15 | Backup encryption | OD-SA-06 | Storage backup plane | **DESIGN CLOSED** — 2026-10-04 |
| OD-SA-07-16 | Manifest storage | OD-SA-06 | Storage backup plane | **DESIGN CLOSED** — 2026-10-04 · DB primary + backup JSON secondary |
| OD-PL-01 | nagranie vs próbka (UI) | POLISH-01 | UI terminology | **CLOSED / ACCEPTED** — 2026-10-05 · **C** · nagranie=obiekt użytkownika · próbka=funkcja/polityka |
| OD-PL-02 | Nazwa admin policy | POLISH-01 | Admin UI | **CLOSED / ACCEPTED** — 2026-10-05 · **Polityka nagrań** |
| OD-PL-03 | Premium tier display | POLISH-01 / OD-08 | UI | **CLOSED / ACCEPTED** — 2026-10-05 · Free/Bronze/Silver/Gold **KEEP EN** |
| OD-PL-04 | PENDING_REVIEW label | POLISH-01 | UI status | **CLOSED / ACCEPTED** — 2026-10-05 · **W moderacji** |
| OD-PL-05 | Studio brand | POLISH-01 | Nav / IA copy | **CLOSED / ACCEPTED** — 2026-10-05 · Studio **KEEP EN** |
| OD-PL-06 | Master brand | POLISH-01 | Mix/Master UI | **CLOSED / ACCEPTED** — 2026-10-05 · Master **KEEP EN** Title Case |
| EPIC-P3 | Anonymous → Account Claim | Recording / D02 | Take ownership after signup/login | **CLOSED / IMPLEMENTED** — 2026-10-05 · OD-P3-01…11 · **PRODUCTION VERIFIED — GREEN** @ `dabbc936` · Premium Tier TTL/cap · follow-up `p_take_id` NON-BLOCKING · **UNCHANGED** by Fala 3.5.1 |
| EPIC-FALA-351 | Recording Experience + Dual Audio Timeline | Recording UX | Live MIC · Input Monitor · READY_TAKE dual preview | **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** — 2026-10-05 · feature `c690831` · verify `75bd80f` · no P1/P2/P3 reopen |
| OD-CWP-01…08 | Contabo continuous poller V1 (STUDIO_EXPORT only · atomic claim · no auto-retry) | Contabo Ops | Poller impl / enable | **CLOSED / ACCEPTED** — 2026-10-13 · [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](./CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) · impl/enable = separate GOs |
| GO-IMPL-CONTABO-POLL | Implement RPC + poller + tests (no enable) | OD-CWP | Code/migration | **CLOSED / IMPLEMENTED / LOCAL TESTS PASS** — 2026-10-13 · [impl](../audits/CONTABO_CONTINUOUS_WORKER_V1_IMPLEMENTATION.md) · Contabo sync/deploy/canary/always-on **NOT DONE** |
| GO-HOST-RO-CONTABO | Live Contabo read-only verify | OD-CWP | Sync/enable | **OPEN** — host verification **NOT DONE** |
| GO-SYNC-CONTABO-POLL | Sync approved poller tree to Contabo | OD-CWP | Enable | **OPEN** — Contabo sync **NOT DONE** |
| GO-ENABLE-CONTABO-POLL-CANARY | Enable poller · one new STUDIO_EXPORT canary | OD-CWP | Always-on | **OPEN** — canary **NOT RUN** |
| GO-CONTABO-POLL-ALWAYS-ON | Persistent poller enable after canary PASS | OD-CWP | Production continuous | **OPEN** — always-on **NOT ENABLED** |

---

## CLOSED / ACCEPTED (skrót)

Szczegóły: [DECISION_LOG.md](./DECISION_LOG.md).

| ID | Decyzja (skrót) | Data |
|----|-----------------|------|
| OD-01 | Next.js + TypeScript + Tailwind + shadcn/ui (baza) + własny Design System + App Router | 2026-09-25 |
| OD-02 | Next.js jako application server (Server Actions / Route Handlers); bez osobnego Express/Nest/Fastify na start | 2026-09-25 |
| OD-03 | Supabase: PostgreSQL, Auth, RLS, Storage; Edge Functions gdy potrzebne; Role ≠ Account Level | 2026-09-25 |
| OD-05 | Anon download limit = 2 / UTC day; httpOnly opaque token + server hash (Phase 1.8A interim) | 2026-09-26 |
| OD-06 | User download limit = 4 / UTC day; `user_id`; global (Phase 1.8A interim) | 2026-09-26 |
| OD-17 | DOWNLOAD_EVENT = successful DOWNLOAD signed-URL issuance after AuthZ + limit allow (Phase 1.8A interim) | 2026-09-26 |
| OD-19 | Signup default account level = `BEGINNER_RAPPER` (role remains `USER`) | 2026-09-25 |
| OD-20 | No automatic first-admin; manual/operator-controlled ADMIN bootstrap outside signup | 2026-09-25 |
| OD-COMMUNITY-01 | APPROVED→PUBLISHED: ADMIN + MODERATOR; USER never; READY required | 2026-09-27 |
| OD-COMMUNITY-02 | `rejection_reason text`; required on reject; USER can read; no threads | 2026-09-27 |
| OD-COMMUNITY-03 | USER gets `beats.create`; ownership via service+RLS+trigger; submit own+READY | 2026-09-27 |
| OD-COMMUNITY-04 | All account levels may upload V1; no Premium bypass | 2026-09-27 |
| OD-COMMUNITY-05 | USER may archive own PUBLISHED (and DRAFT/REJECTED) | 2026-09-27 |
| OD-REC-01 | RECORD ≠ PLAYBACK ≠ DOWNLOAD; one Access layer, three capabilities | 2026-09-27 |
| OD-REC-02 | Anonymous QT IN V1 (30s, short TTL, signed upload, CTA login) | 2026-09-27 |
| OD-REC-03 | Shared grants + RECORD IN Recording EPIC; least privilege flags | 2026-09-27 |
| OD-REC-04 | Hybrid: Account Level base + future Premium overlay; no payments in V1 | 2026-09-27 |
| OD-REC-05 | Retention BEGINNER 24h / PRO 10d / LEGEND 30d | 2026-09-27 |
| OD-REC-06 | Own take preview/download/delete; Track publish OUT of Recording EPIC | 2026-09-27 |
| OD-REC-07 | Anti-abuse caps (anon/BEGINNER/PRO/LEGEND active + daily sessions) | 2026-09-27 |
| OD-REC-08 | Own take download YES for logged-in tiers; anon no durable take DL | 2026-09-27 |
| OD-08 | Premium tiers = FREE / BRONZE / SILVER / GOLD · ≠ Rank · ≠ Account Level · ≠ Role · legacy active Premium → SILVER | 2026-10-03 |
| OD-ADMIN-01 | YES — grant/revoke ADMIN to another user (server + users.edit + confirm + audit) | 2026-10-04 |
| OD-ADMIN-02 | NO — no ADMIN self-role change / self-demotion | 2026-10-04 |
| OD-ADMIN-03 | NO — cannot drop below 1 ADMIN (server-side) | 2026-10-04 |
| OD-ADMIN-04 | OPTIONAL EXPIRATION — NULL perpetual / future timestamp until date | 2026-10-04 |
| OD-ADMIN-05 | YES — email visible only on `/admin/users` | 2026-10-04 |
| OD-ADMIN-06 | YES — audit all role/Premium admin mutations | 2026-10-04 |
| OD-ADMIN-07 | YES / W3 — history UI not MVP | 2026-10-04 |
| OD-ADMIN-DELETE-01…10 | Admin delete other accounts YES; self NO; last ADMIN NO; reason YES; Resend; `USER_ACCOUNT_DELETE`; ADMIN+`users.edit` | 2026-10-04 |
| OD-SA-07-01…16 | STORAGE-ARCH-07 backup design freeze · external S3-compatible BACKUP plane · SHA-256 · Object Lock · GC ladder · Phase A **BLOCKED** · VPS COPY **43/43** · AWS **DEFERRED** | 2026-10-04 |
| OD-VPS-LOCAL-01…12 | Local Windows Layer-2 · **43/43 RESTORE VERIFIED** · path `C:\BitRymDym-Backup\` | 2026-10-05 |
| OD-CWP-01…08 | Contabo continuous poller V1 · STUDIO_EXPORT only · atomic claim-next · max 1 · no auto-retry · enqueue unchanged | 2026-10-13 |
| OD-SFM-02 | Historical WAV-only MVP ladder · **SUPERSEDED (product ladder)** by Product Contract Addendum | 2026-10-14 |
| OD-SFM-07 | Studio Final Mix quality ladder + daily first-download limits (0/1/2/5) | 2026-10-14 |
| OD-SFM-08 | SFM MIX/MASTER — durable domain stages + separate jobs (variant C); light MIX; bake in MASTER; ≠ E3 `kind=MIX` | 2026-10-14 |
| OD-SFM-09 | Explicit „Zatwierdź do finalizacji” on immutable version | 2026-10-14 |
| OD-SFM-10 | Current vs historical final AuthZ / presentation | 2026-10-14 |
| OD-SFM-11 | Server-side AuthZ for export / grant / download URL | 2026-10-14 |
| OD-SFM-12 | SFM retention 90d from MASTER_SUCCEEDED; clear current_final on TTL; tombstone; grant ≠ file | 2026-10-14 |
| OD-SFM-13 | Daily first-download grant caps FREE0/BRONZE1/SILVER2/GOLD5 | 2026-10-14 |
| OD-SFM-14 | Paid 7,99 day-slot variant B (AVAILABLE → bind at grant; Warsaw expiry; refund rules) | 2026-10-14 |
| OD-SFM-F02b | SFM multi-format version-scoped keys · current READY invariant · AuthZ/downgrade (supersedes F02 SFM-only) | 2026-10-14 |
| OD-SFM-F03b | SFM 90d from MASTER_SUCCEEDED (supersedes F03 SFM-only; ≠ TAKE/RAW/E3) | 2026-10-14 |
| OD-SFM-STAGES-DF | Version/Stages DF · domain names SFM_MIX / SFM_MASTER | 2026-10-14 |
| OD-SFM-15 | Re-download entitled version without new grant | 2026-10-14 |
| OD-SFM-16 | Edited work = new version + re-accept + MIX + MASTER + new grant | 2026-10-14 |
| OD-SFM-17 | One grant per version (all plan-allowed qualities) | 2026-10-14 |
| OD-SFM-18 | Day reset midnight `Europe/Warsaw` + DST | 2026-10-14 |
| OD-SFM-ID-01 | SFM dedicated download route + deny SFM on mix route after cutover | 2026-10-14 |
| OD-SFM-ID-02 | Version grant + historical `granted_qualities` snapshot (≠ unlimited future qualities) | 2026-10-14 |
| OD-SFM-ID-03 | Multiple paid slots `AVAILABLE` per Warsaw day | 2026-10-14 |
| OD-SFM-ID-04 | `SFM_MIX` = separate executor job (≠ E3 `kind=MIX`) | 2026-10-14 |
| OD-SFM-ID-07 | Exact `render_jobs.kind` = `SFM_MIX_PREPARE` · `SFM_MASTER_BAKE` · `SFM_QUALITY_ENCODE` (≠ stage names; ≠ MIX/STUDIO_EXPORT) | 2026-10-14 |
| OD-SFM-ID-06 | Legacy Studio WAV (`project_id` set, `sfm_version_id` NULL) after cutover = **DENY** as current SFM final · **no backfill** · **no physical delete** | 2026-10-15 |
| OD-SFM-WORKER-KIND-REJECT | Unsupported kind after SFM claim → atomic `FAILED` + `error_code=KIND_OUT` via `reject_sfm_executor_job_kind` (SECURITY DEFINER · CAS `RUNNING`+`worker_ref` · service_role) · **no** bake/requeue/stage reset · ambiguous RPC = no fallback mutate · **implementation published in `main` history @ `69e50d0`** (ancestor of current tip `5212933`, parent `81c2496`; repo migration `20261016120000_sfm_reject_executor_job_kind.sql` is in Git, **≠** a verified database apply) · Git file **≠** database apply · live CAS/concurrency **NOT CONFIRMED** · staging E2E **NOT CONFIRMED** · runtime flag / poller / Contabo **NOT RE-VERIFIED IN THIS STAGE** · **≠** production-verified close · **≠** orphan timeout recovery | 2026-10-16 |

Freeze: [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md).
Contabo poller: [CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md](./CONTABO_CONTINUOUS_WORKER_DESIGN_FREEZE.md) (**DESIGN FREEZE ACCEPTED**) · [impl](../audits/CONTABO_CONTINUOUS_WORKER_V1_IMPLEMENTATION.md) (**IMPLEMENTED / LOCAL TESTS PASS**) · sync/deploy/host/canary/always-on **OPEN**.
Studio Final Mix product contract: [STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md](./STUDIO_FINAL_MIX_PRODUCT_CONTRACT_ADDENDUM.md) (**OWNER ACCEPTED** · product cutover **NOT DONE**).
SFM Version/Stages freeze: [STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md](./STUDIO_FINAL_MIX_VERSION_STAGES_DESIGN_FREEZE_PROPOSAL.md) (**OWNER ACCEPTED** docs · `SFM_MIX`/`SFM_MASTER` · **CODE ON MAIN** · ≠ staging/prod E2E GREEN).
SFM F-addendum: [STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md](./STUDIO_FINAL_MIX_EXPORT_BAKE_F_ADDENDUM_PROPOSAL.md) (**OWNER ACCEPTED** docs · F02/F03 **SUPERSEDED SFM-only** by F02b/F03b · **CODE ON MAIN** for A/B1/C/D paths · ≠ cutover).
SFM Implementation Design pack: [IMPLEMENTATION_DESIGN](./STUDIO_FINAL_MIX_IMPLEMENTATION_DESIGN.md) · [DATA_MODEL](./STUDIO_FINAL_MIX_DATA_MODEL.md) · [RPC_SECURITY](./STUDIO_FINAL_MIX_RPC_SECURITY_CONTRACT.md) · [TEST_MATRIX](./STUDIO_FINAL_MIX_TEST_MATRIX.md) (**OWNER ACCEPTED design docs** · OD-SFM-ID-01…04 + **OD-SFM-ID-07 CLOSED** · Stages A/B1/C/D + OD-06 + **HTTP surface** on `main` @ **`2f7050e`** · staging E2E / SFM worker ops / Production GREEN **NOT DONE**).
W2 contract: [W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md](./W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md).
Admin users: [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md).
W4 Admin Delete: [ADMIN_USER_DELETE_DESIGN_FREEZE.md](./ADMIN_USER_DELETE_DESIGN_FREEZE.md) (**CLOSED / PRODUCTION VERIFIED**).
STORAGE-ARCH-07: [STORAGE_ARCH_07_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_07_DESIGN_FREEZE.md) (**DESIGN FREEZE COMPLETE** · AWS **DEFERRED** · VPS **43/43**).
VPS BACKUP PLANE: [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md) (**CLOSED** · Phase 1–6 **PASS** · restore **3/43**).
LOCAL WINDOWS Layer-2: [STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md) (**43/43 RESTORE VERIFIED**).
Historical local DB dump: [HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md](../audits/HISTORICAL_LOCAL_DB_BACKUP_AUDIT.md) (**FOUND** · ≠ Storage object backup).
Note: **OD-SA-07** (Mix artifacts) ≠ **OD-SA-07-01…16** (backup design) ≠ **OD-VPS-01…20** (VPS Layer-1) ≠ **OD-VPS-LOCAL-01…12** (Local Layer-2).

---

## OPEN — nadal wymagają decyzji Ownera / Architekta

| ID | Temat | Blokuje |
|----|--------|---------|
| OD-04 | Operator płatności | Faza 4 |
| OD-07 | Ceny Premium | Faza 4 |
| OD-09 | Nazwy poziomów konta | Profile / billing labels |
| OD-10 | Nazwy głosowania | Faza 2 |
| OD-11 | Moderacja komentarzy | Faza 2 |
| OD-12 | Kodowanie audio | Playback / download versions |
| OD-13 | Watermarking audio | Download pipeline (OUT of Phase 1.8A) |
| OD-14 | Miksowanie nagrania z bitem | Export / publikacja |
| OD-15 | Identyfikacja wizualna | Final Design System |
| OD-16 | Język marki | Copy UI |
| OD-18 | Liczenie udostępnień | Beat sharing stats |
| GO-HOST-RO-CONTABO | Live RO verify hosta Contabo (**NOT DONE**) | Sync / enable |
| GO-SYNC-CONTABO-POLL | Sync drzewa pollera na Contabo (**NOT DONE**) | Enable canary |
| GO-ENABLE-CONTABO-POLL-CANARY | Enable + jeden nowy job canary (**NOT RUN**) | Always-on |
| GO-CONTABO-POLL-ALWAYS-ON | Persistent enable po canary PASS (**NOT ENABLED**) | Production continuous export |
| (prod migration apply) | Apply `claim_next_studio_export_job` on production DB | Remote claim-next |
| OD-REC-PENDING-UPLOAD-TTL | Okno wysyłki dla `PENDING_UPLOAD` — **CLOSED (wartość 900 s, Owner 2026-10-18)** · STU-16 **code + migration ON `main` @ `c2be3b0`** · **Production DB apply: VERIFIED BY READ-ONLY AUDIT** (2026-10-19) · **Local live suite: VERIFIED 17/17 PASS** (2026-10-19; TTL via backdate; last documented) · **Live docs dpl:** `dpl_4d5Kefe…` @ `0f07e84` (docs auto-deploy; HISTORY SHA verify `dpl_Eoror…` @ `9bd1f86`) · **Production functional / prod concurrency / prod SESSION_DAY_CAP runtime / prod janitor: NOT VERIFIED** · functional prod verify = osobne GO (nie część decyzji o długości 900 s) | Odblokowanie nowych nagrań po zgubionej odpowiedzi sesji |

**OD-REC-PENDING-UPLOAD-TTL (2026-10-18, STU-15):** `PHASE_RECORDING_DESIGN_FREEZE.md` opisuje osobny „pending TTL”, a implementacja rezerwuje `PENDING_UPLOAD` do pełnego `expires_at` retencji (gość: 2 h); indeksy `takes_one_pending_per_owner_uidx` / `takes_one_pending_per_anon_hash_uidx` + `CONCURRENT_SESSION` blokują wtedy nowe nagrania, jeśli przeglądarka zgubiła `takeId`. Propozycja (niezastosowana — wymaga migracji, zmiany RPC i GO): krótkie okno wysyłki dla rezerwacji `PENDING_UPLOAD` oraz w `claim_take_recording_session` przejęcie własnej rezerwacji, której okno minęło bez przesłanego pliku. Klient STU-15 niczego nie usuwa na podstawie wieku. Szczegóły: [RECORDING.md](../architecture/RECORDING.md).

**OD-REC-PENDING-UPLOAD-TTL — aktualizacja (2026-10-18, STU-16):** propozycja zaimplementowana w migracji `supabase/migrations/20261018120000_stu16_pending_upload_window.sql`. Długość okna nie była zdefiniowana (SSOT: `OD-REC-10` „Pending-upload TTL length” w `docs/audits/RECORDING_QUICK_TAKE_DESIGN_FREEZE_PROPOSAL.md` — otwarte; `PHASE_RECORDING_DESIGN_FREEZE.md` wymienia tylko „pending TTL + janitor”), więc wybrano wariant najbezpieczniejszy dla danych użytkownika: **900 s** zegara serwera od `created_at` — równe maks. dzierżawie lokalnej kopii (`TAKE_RECOVERY_CLAIM_MAX_HOLD_MS` = 15 min), więc aktywny upload trzymający dzierżawę nie traci rezerwacji w trakcie, a jednocześnie krótsze od każdego TTL retencji (gość 2 h). Dodatkowe zabezpieczenia: zwalniana jest tylko rezerwacja **bez** pliku w `storage.objects` (z plikiem — finalizowalna do `expires_at`), tylko tego samego aktora (konto / hash gościa), w transakcji claimu pod advisory lockiem wspólnym z finalize; `READY` i retencja bez zmian; janitor (`release_stale_pending_take_reservations`, tylko `service_role`) robi to samo per wiersz i usuwa plik wysłany po zwolnieniu. Wartość jest w jednym miejscu (`public.take_pending_upload_window_seconds()`; parzystość z `TAKE_PENDING_UPLOAD_WINDOW_SECONDS` pilnuje test). **Decyzja Ownera (2026-10-18):** 900 s potwierdzone → decyzja o długości okna **CLOSED**. **`SESSION_DAY_CAP` (bez zmian produktu):** zwolniona / wygasła rezerwacja nadal zużywa jedną dzienną sesję (brak automatycznego zwrotu limitu — wygaśnięcie nie dowodzi, że nagranie się nie rozpoczęło, a wynik uploadu może być niejednoznaczny).

**STU-16 Git-plane correction (2026-10-19 SSOT reconcile):** earlier prose said „LOCAL ONLY · NOT COMMITTED · NOT DEPLOYED”. That wording is **HISTORICAL**. Verified: STU-16 **code + migration file are ON `main`** @ **`c2be3b0`** (`c2be3b0159deb02481dd402bd276ad35bf34b273`). At tip/plane time the planes still included **Production DB apply: NOT VERIFIED** alongside **Production functional verification: NOT VERIFIED** (Git presence ≠ DB apply). That DB-apply status is **superseded** by the evidence note below — do not treat the tip/plane „NOT VERIFIED” apply line as living SSOT.

**STU-16 Production DB evidence (2026-10-19, later same day — docs reconcile):** **Production DB migration apply: VERIFIED BY READ-ONLY AUDIT** on project `rzzxrgcdogkybkiidqgw` · history `20261018154129` / `stu16_pending_upload_window` · Git file `20261018120000_stu16_pending_upload_window.sql` (timestamp drift noted; not treated as schema FAIL; no re-apply). TTL **900 s** and checked defs/grants in audit scope.

**STU-16 local live + deploy SHA (2026-10-19, later same day — docs reconcile):** **Local live suite VERIFIED 17/17 PASS** (`stu16-pending-upload-window-live.test.ts`; local API **54421** after Windows port exclusion remapping; TTL via `created_at` backdate; last documented — not re-run in tip/dpl reconcile). **Tip/dpl reconcile:** tip parent **`0f07e84`** · live docs dpl **`dpl_4d5KefeYNbBgqTYfYmwnZFJgCivb` @ `0f07e84`** (docs auto-deploy ≠ app-code change) · HISTORY SHA verify `dpl_Eoror…` @ `9bd1f86`. **Still NOT VERIFIED (osobne GO, nie decyzja o długości 900 s):** Production functional E2E · prod `SESSION_DAY_CAP` runtime · prod concurrency · prod janitor schedule · SQL byte-for-byte vs Git. STU-16 is **not** closed as Production GREEN. Local port remapping is an environment fix, not a product decision. Living SSOT: [PROJECT_STATE.md](../PROJECT_STATE.md) · [RECORDING.md](../architecture/RECORDING.md).

**Studio Final Mix — nadal OPEN po ACCEPT OD-SFM-ID-01…04 + OD-SFM-ID-06 + OD-SFM-ID-07:**

- Payment **provider** for 7,99 slot — **OD-04 OPEN** (slot product rules ACCEPTED under OD-SFM-14; multi-AVAILABLE ACCEPTED OD-SFM-ID-03). **Do not close.**
- **OD-SFM-ID-05** — Expand `granted_qualities` after plan **upgrade** without new daily/slot? (until CLOSED: **strict snapshot** at FIRST_GRANT). **Do not close.**
- **OD-SFM-WORKER-ORPHAN-TIMEOUT** — Recovery for process kill / SIGTERM grace exceed / claim CONFLICT orphans left `RUNNING` (**OPEN**; **≠** KIND_OUT reject). **Do not close** without separate Owner GO.
- **Note (2026-10-16, recovery stage 18):** **OD-SFM-WORKER-KIND-REJECT** implementation is in `main` history @ **`69e50d0`** (ancestor of current tip **`5212933`**, parent **`81c2496`**), including repo migration `20261016120000_sfm_reject_executor_job_kind.sql`. Decision stays open for operational verification. The migration file in Git is not a verified database apply. Live CAS/concurrency **NOT CONFIRMED**. Staging E2E **NOT CONFIRMED**. Runtime flag, poller activity, and Contabo **NOT RE-VERIFIED IN THIS STAGE**. **≠** production-verified close. Dedicated poller commit **`d3c99e3`** remains ancestry, not the current tip.
- Contabo host sync / poller enable for SFM kinds — blocked on **separate Contabo Ops GOs** (must not auto-join STUDIO_EXPORT poller).
- Production cutover / `SFM_VERSIONS_V1=ON` / staging RO / staging E2E / remote migration reconcile — **separate Owner GO each** (code on `main` ≠ cutover DONE).

---

## Uwagi implementacyjne (bez zamrażania wartości OPEN)

- Limity pobrań muszą być **konfigurowalne** (`anonymous_daily_download_limit`, `user_daily_download_limit`, `premium_daily_download_limit`) — nie hardcodowane (§13). Wartości startowe Phase 1.8A: **OD-05 = 2**, **OD-06 = 4**, **OD-17 = signed-URL issuance** (CLOSED interim); config SSOT: `src/config/downloads.ts`. Premium limit nadal później.
- Feature flags płatności startują jako **wyłączone** (§14–15).
- **Supabase Auth jest zatwierdzone** (OD-03 CLOSED) — nie traktować już jako „preferencji roboczej”.
- Signup default: `role = USER`, `account_level = BEGINNER_RAPPER` (**OD-19 CLOSED**).
- First ADMIN: manual / operator-controlled only — **no** auto first-user admin (**OD-20 CLOSED**).
- Community upload: EPIC **COMPLETE / LOCKED** @ `c5e1f17` — OD-COMMUNITY-01…05 **CLOSED**. See [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md).
- Recording / Quick Take: Design Freeze **LOCKED** — OD-REC-01…08 **CLOSED**. Implementation awaits separate Wave 1 Owner GO. See [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md).
- Admin User Management: **W0 LOCKED** · W1 COMPLETE · W2 **PRODUCTION VERIFIED WITH FINDINGS** · W3 **CLOSED / PRODUCTION VERIFIED** @ `237a86f`. OD-ADMIN-01…07 **CLOSED**. W4 **CLOSED / PRODUCTION VERIFIED** @ `ddcee65` (EMAIL E2E PASS). Remaining P2: last-admin TOCTOU · no durable idempotency · live last-admin concurrency NOT VERIFIED · published USER beat retain NOT LIVE-DATA VERIFIED · migration timestamp drift. See [ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md](./ADMIN_USER_MANAGEMENT_DESIGN_FREEZE.md) · [W4 freeze](./ADMIN_USER_DELETE_DESIGN_FREEZE.md).
- STORAGE-ARCH-07: **DESIGN FREEZE COMPLETE** · OD-SA-07-01…16 **CLOSED** · Phase A **BLOCKED** · VPS COPY **43/43 RETAINED** · AWS **DEFERRED** · live prod Storage **11**. See [STORAGE_ARCH_07_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_07_DESIGN_FREEZE.md).
- VPS BACKUP PLANE: OD-VPS-01…20 **CLOSED** · Phase 1–6 **PASS** · restore **3/43** · objects **43/43 RETAINED** after ARCH-05. See [STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_07_VPS_BACKUP_DESIGN_FREEZE.md).
- LOCAL WINDOWS Layer-2: OD-VPS-LOCAL-01…12 **CLOSED** · **43/43 RETAINED** (restore evidence kept). See [STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md](../audits/STORAGE_ARCH_07_LOCAL_BACKUP_RESTORE_DRILL.md).
- ARCH-05: **CLOSED / VERIFIED** · live **11 / 8 / 3 / 0 / 0** · historical backup **43/43 RETAINED**. See [ARCH_05_POST_DELETE_RECONCILIATION.md](../audits/ARCH_05_POST_DELETE_RECONCILIATION.md).
- Recording retention V1: BEGINNER 24h · PRO 10d · LEGEND 30d (config, not scattered magic numbers). Future Premium overlay may boost — hybrid D04; **overlay numbers OPEN / DEFERRED** (OD-08 closed tiers only).
- Codec, bitrate, watermark, export/mix: OD-12–OD-14 — OPEN / DEFERRED (MIX/EXPORT out of Recording EPIC).
- OD-REC-OWN-DRAFT (RECORD on own non-PUBLISHED beat): **not** closed in Owner GO; V1 default OUT — see freeze §21.

### Creator Progress / Premium (continuity note — 2026-10-04)

Design Freeze: [CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md](./CREATOR_PROGRESS_PREMIUM_DESIGN_FREEZE_V1.md).
W1 delivery closeout: [CREATOR_PROGRESS_W1_CLOSEOUT.md](../audits/CREATOR_PROGRESS_W1_CLOSEOUT.md).
W2 Design Contract (foundation / historical gates): [W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md](./W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md).
W2-A closeout: [CREATOR_PROGRESS_W2A_CLOSEOUT.md](../audits/CREATOR_PROGRESS_W2A_CLOSEOUT.md).
W2-A implementation audit: [CREATOR_PROGRESS_W2A_IMPLEMENTATION.md](../audits/CREATOR_PROGRESS_W2A_IMPLEMENTATION.md).
W2-B audit: [CREATOR_PROGRESS_W2B_AUDIT.md](../audits/CREATOR_PROGRESS_W2B_AUDIT.md).
W2-B Design Contract: [W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md](./W2B_PREMIUM_ENFORCEMENT_DESIGN_CONTRACT.md).

- **OD-08 CLOSED / ACCEPTED** — Premium tiers = FREE / BRONZE / SILVER / GOLD. Premium tier ≠ Rank ≠ Account Level ≠ Role.
- **W2-A** = **CLOSED / PRODUCTION VERIFIED WITH FINDINGS** @ `6ee3255`.
- Production app: `d86b4df` · deploy `dpl_2wk8MJjcP5vwPR9w5hUqLmei6oGG` Ready (**W2-B**).
- Production DB: remote `20261003221811` / `w2a_premium_tier_foundation` · local file `20261003230000_…` · `premium_entitlements` = 0 rows (post W2-B fixture cleanup) · **no W2-B migration**.
- **W2-B** = **PREMIUM ENFORCEMENT** · **PRODUCTION VERIFIED WITH NON-BLOCKING FINDING** @ `d86b4df` · [implementation](../audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md).
- W2-B live download cutover: ANON=2 · FREE=4 · BRONZE=10 · SILVER=25 · GOLD=50 · functional E2E PASS (N success + N+1 blocked) · OD-17 PASS · fixture cleanup PASS · remaining `W2B_FIXTURE` = 0.
- Download runtime SSOT (live): ANON = `PREMIUM_ANON_DOWNLOADS_DAILY`; USER = `entitlement.limits.downloadsDaily`. Legacy `DOWNLOAD_LIMIT_ANON_DAILY` / `USER_DAILY_DOWNLOAD_LIMIT` = unused / FREE mirror (not reserve authority). MODERATOR uses USER download limits (**intentional**).
- **NON-BLOCKING FINDING:** Production E2E verified server/RPC/signed-URL path; full browser/UI Server Action journey was not exercised.
- Mix / Render live jobs = **DEFERRED — SEPARATE VERIFICATION** (not W2-B download blocker).
- **OD-04** / **OD-07** remain **OPEN**. Billing deferred.
- **Recording Premium overlay numbers** remain **OPEN / DEFERRED**.
- **Gold 90d** = **DESIGN ONLY / DEFERRED**. Artifact janitor = **DEFERRED**.
- **P2-1** = **VERIFIED RESOLVED** (Owner Implementation Review).
- **P2-2** = **OPEN** (live RLS/IDOR exercise not performed).
- **P2-3** = **OPEN** (manual migration idempotency not verified).
- **P2-4** = **OPEN** (known MCP production migration version drift).
- Historical foundation-contract “W2-D downloads” naming is not rewritten; current Owner gate name = **W2-B PREMIUM ENFORCEMENT**.
- **Living production tip (2026-10-05):** `dabbc936` · POLISH-01 / P0 / P1 / P2 / **P3** **CLOSED / PRODUCTION VERIFIED**.
- **EPIC-P3** Anonymous → Account Claim = **CLOSED / IMPLEMENTED / PRODUCTION VERIFIED — GREEN** @ `dabbc936` · OD-P3-01…11 · Premium Tier TTL/cap · cookie E2E CODE-VERIFIED / FULL E2E NOT EXECUTED · follow-up `p_take_id` **NON-BLOCKING** · **UNCHANGED** by Fala 3.5.1.
- **EPIC-FALA-351** Recording Experience = **CLOSED / SHIPPED / PRODUCTION VERIFIED — GREEN** @ `c690831` · verify `75bd80f` · no P1/P2/P3 reopen · no micro-patch required.
- W2-B documentation closeout is **not** the current NEXT product gate.

---

## EPIC-P3 — Anonymous → Account Claim

**Status:** **CLOSED / IMPLEMENTED** · **PRODUCTION VERIFIED — GREEN** @ `dabbc936` · deploy `dpl_Hd4QAwDkkw99FMiFhh8nJ1N6nvsR`
**Delivery:** RPC `claim_anon_take_to_account` · `src/lib/takes/anon-account-claim.ts` · auth hooks · `/account?claim=`
**TTL/cap axis:** Premium Tier via `getSamplePolicy` (NOT Account Level / Rank / Role)
**Cookie production:** CODE-VERIFIED · full disposable E2E NOT EXECUTED
**Follow-up:** `p_take_id` hardening — **NON-BLOCKING** (do not implement without Owner GO)

OD-P3-01…11 **CLOSED / IMPLEMENTED** (see DECISION_LOG).

---

## Phase 7.1.5 — Shell Polish + Stacked Escape Fix

**Status:** **CLOSED / ACCEPTED** · **PRODUCTION VERIFIED — GREEN** @ `3fccbf7` · dpl `dpl_2E7JrvusAzAG8bsXydpqNJ36k6JR`
**Feature LAND (HISTORY):** `f891bce` — shell polish
**Escape fix / production tip:** `3fccbf7`
**Prior tip (HISTORY):** `9abc1b6` — Phase 7.1.4 Mixer Dock (CLOSED · do not reopen)

| Track | Status |
|-------|--------|
| Transport / meter isolation | **CLOSED / GREEN** |
| FxSheet a11y | **CLOSED / GREEN** |
| Space / Home / End | **CLOSED / GREEN** |
| Mobile toolbar overflow | **CLOSED / GREEN** |
| Stacked Escape (FxSheet over Mixer) | **CLOSED / GREEN** — Escape #1 = FxSheet · Escape #2 = Mixer |

**SSOT:** [closeout](../audits/P7_1_5_SHELL_POLISH_PRODUCTION_CLOSEOUT.md) · [DECISION_LOG](./DECISION_LOG.md)

---

## Phase 7.1.4 — Mixer Dock / Chrome

**Status:** **CLOSED / ACCEPTED** · **PRODUCTION VERIFIED — GREEN** @ `9abc1b6` (ancestry · superseded as production tip by `3fccbf7`) · dpl `dpl_7nZZXRBBZS3hJMzSfw4F8FXkRoww` (historical)
**Prior tip (HISTORY):** `8f6eeca` — Phase 7.1.3 Inspector IA (CLOSED · do not reopen)

| ID | Temat | Status |
|----|--------|--------|
| OD-P7.1.4-01 | Desktop Mixer placement | **CLOSED / ACCEPTED** — A · bottom collapsible dock |
| OD-P7.1.4-02 | Collapsed chrome | **CLOSED / ACCEPTED** — A · thin bar + chevron |
| OD-P7.1.4-03 | Tablet/mobile surface | **CLOSED / ACCEPTED** — A · bottom sheet/drawer + XOR |
| OD-P7.1.4-04 | Master sticky | **CLOSED / ACCEPTED** — A · sticky-first |

**SSOT:** [P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md](./P7_1_4_MIXER_DOCK_DESIGN_FREEZE.md) · [closeout](../audits/P7_1_4_MIXER_DOCK_PRODUCTION_CLOSEOUT.md) · [DECISION_LOG](./DECISION_LOG.md)

---

## Szablon decyzji (do użycia w `DECISION_LOG.md`)

```text
ID: OD-XX
Data:
Decydent:
Decyzja:
Uzasadnienie:
Wpływ na SSOT / architekturę:
Wersja SSOT po aktualizacji:
```
