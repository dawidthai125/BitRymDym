# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta:** najpierw [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md), potem [MASTER_HANDOFF.md](./MASTER_HANDOFF.md), potem ten plik.

---

## 1. Project Identity

| Pole | Wartość |
|------|---------|
| Nazwa | BitRymDym |
| Cel | Platforma muzyczna (rap / hip-hop / bity): odsłuch, pobieranie, test flow (Quick Take) → społeczność i współpraca |
| Owner / Product Owner | Prezes Dawid |

---

## 2. Current Repository State

| Pole | Wartość |
|------|---------|
| Canonical branch | `main` |
| **Repository HEAD / origin/main** | Advances on docs-only commits · **≠** Production app SHA after closeout docs |
| **Production application** | `0afa29b` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS** |
| **Production deployment** | `6815846706` · Vercel `dpl_9EDrc78ompk8B2QZk6tDwQurntus` |
| **Polish UX Mix / Master / Recording / Playback** | **CLOSED** / **PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS** @ `0afa29b` — [POLISH_UX_PRODUCTION_CLOSEOUT.md](./audits/POLISH_UX_PRODUCTION_CLOSEOUT.md) |
| **Wave A Account / Beats** | **CLOSED** / **PRODUCTION VERIFIED — GREEN** @ `2c4200b` — [A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md](./audits/A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md) |
| **Wave B Mix Panel presentation** | **CLOSED** / **PRODUCTION VERIFIED** @ `812a9d4` (parent of Wave A) |
| **Fala 1B Account + Admin Visual Foundation** | **CLOSED** / **PRODUCTION VERIFIED — GREEN** @ `42369c0` (historical) — [FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md](./audits/FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md) |
| **Fala 1A Public Visual Foundation** | **CLOSED** / **PRODUCTION VERIFIED** @ `fdf74f9` (parent of 1B) |
| **STORAGE-ARCH-01** | **LOCKED** · Hybrid C · Final Architecture Review **PASS WITH FINDINGS** · Owner Review **PASS** · Implementation **NOT STARTED** — [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md) |
| **STORAGE-ARCH-02** | **FUTURE SCALABILITY DOCS PREPARED** · external Object Storage **OPTIONAL / NOT IMPLEMENTED / NO CURRENT INVESTMENT** · current durable = **Supabase** — [STORAGE_ARCH_02_FUTURE_SCALABILITY.md](./architecture/STORAGE_ARCH_02_FUTURE_SCALABILITY.md) |
| **E3 FULL AUDIO** | **E3.1 → E3.7 code** · **E3 = PRODUCTION VERIFIED — GREEN** (PASS WITH FINDINGS) · W6 **SATISFIED** · Free Basic public path **ON** under AC-PE-12 |
| **E3.7 Premium Render** | Code on Production · architecture LOCKED · **Premium Production E2E = NOT TESTED** (no fixture) |
| **W6.2/W6.3 UX ship** | **CLOSED / PRODUCTION VERIFIED** @ `9026fa9` (historical ship SHA · not current Prod tip) |
| **E3.8 W6 Mobile Cert** | **CLOSED / PASS** · **OWNER-ACCEPTED EMULATED** · [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) |
| **E3 Production Enablement** | **COMPLETE** · FINAL CLOSEOUT **GREEN** · AC-PE-12 **PASS** @ `6dfd201` · GO #5 **PASS** — [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md) |
| **OWNER GO #2 Worker Infra** | **CLOSED / SUPERSEDED** (Contabo) — [E3_WORKER_INFRASTRUCTURE_GO2.md](./audits/E3_WORKER_INFRASTRUCTURE_GO2.md) |
| **Worker bootstrap** | Contabo @ `92496d4` · systemd **STOPPED / DISABLED** after controlled renders |
| Prior Production apps | `9026fa9` (W6 UX) · `17c4d530` (E3.7 DARK baseline) — rollback lineage |
| Community Upload + Moderation EPIC | **COMPLETE / LOCKED** @ `c5e1f17` |
| Recording Design Freeze | **LOCKED** |
| **Recording Wave 1–4** | **CLOSED** / **PRODUCTION VERIFIED** |
| **Recording Wave 5** | **CLOSED** / **PRODUCTION VERIFIED** @ `37892a6` · Shared Grants → RECORD |
| **D02 Anonymous Quick Take** | **CLOSED / IN V1** · **SHIPPED** / **PRODUCTION VERIFIED** @ `e98ba52` |
| **Fala 3.5.1 Recording Experience** | **CLOSED** · Owner verification **PRELIMINARY PASS** · **NOT DEPLOYED** — [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](./audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md) |
| **P1-B** DEFINER grants hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-C** `set_updated_at` hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-A** HIBP | **BLOCKED** — Owner Dashboard action required |
| Security | **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM = HIBP disabled + D02 TTL-only verify artifacts |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Janitor cron | `0 0 * * *` (Hobby daily) · `CRON_SECRET` configured · **audio-artifacts janitor = DEFERRED** (STORAGE-ARCH-03 future wave · OD-SA-05) |

Handoff: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md) · [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
Storage Architecture V1 freeze: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · audit: [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md)
E3 Production Enablement Design Freeze: [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)
E3.8 W6 closeout: [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)
E3.8 W6 Design Freeze: [E3_8_W6_MOBILE_CERT_PLAN.md](./audits/E3_8_W6_MOBILE_CERT_PLAN.md)
E3.8 W6 Cert Checklist: [E3_8_W6_CERT_CHECKLIST.md](./audits/E3_8_W6_CERT_CHECKLIST.md)
E3.7 closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
E3.6 closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
E3 architecture: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)

---

## 3. Current Phase

```text
POLISH UX LANGUAGE       = CLOSED / PRODUCTION VERIFIED — PASS WITH EVIDENCE LIMITATIONS @ 0afa29b
WAVE A ACCOUNT/BEATS     = CLOSED / PRODUCTION VERIFIED — GREEN @ 2c4200b
WAVE B MIX PRESENTATION  = CLOSED / PRODUCTION VERIFIED @ 812a9d4
FALA 1A PUBLIC VISUAL    = CLOSED / PRODUCTION VERIFIED @ fdf74f9
FALA 1B ACCOUNT+ADMIN    = CLOSED / PRODUCTION VERIFIED — GREEN @ 42369c0 (historical)
PRODUCTION APPLICATION   = 0afa29b
PRODUCTION DEPLOYMENT    = 6815846706 / dpl_9EDrc78ompk8B2QZk6tDwQurntus
W6.2/W6.3 UX SHIP        = CLOSED / PRODUCTION VERIFIED @ 9026fa9
E3.8 W6 CERT             = CLOSED / PASS (Owner-accepted emulated)
E3 PRODUCTION ENABLEMENT = COMPLETE
AC-PE-12 / F-PE-02       = PASS @ 6dfd201 (historical PE tip · superseded as Prod tip by later ships)
GO #2 Worker Infra       = CLOSED / SUPERSEDED (Contabo)
GO #3 Env enablement     = DONE
GO #4 Controlled render  = DONE
GO #5 Public Free Audio  = PASS
E3_MIX_ENABLED           = ON
E3_RENDER_JOBS_ENABLED   = ON
E3_PUBLIC_AUDIO          = ON
WORKER                   = STOPPED / DISABLED (Contabo · bootstrap 92496d4)
E3 STATUS                = PRODUCTION VERIFIED — GREEN (PASS WITH FINDINGS)
PUBLIC FREE AUDIO        = RELEASED (Free Basic only · private bucket · signed URL)
STORAGE-ARCH-01          = LOCKED (Hybrid C · Final Arch Review PASS WITH FINDINGS)
STORAGE-ARCH-02          = FUTURE SCALABILITY DOCS PREPARED (NOT IMPLEMENTED · NO CURRENT INVESTMENT)
STORAGE-ARCH-02-KEY      = NOT STARTED (OD-SA-02 / FAR-01 dual-read keys · no Implementation GO)
FALA 3.5.1 RECORDING UX  = CLOSED (Owner preliminary PASS · NOT DEPLOYED)
POLISH UX                = CLOSED
WAVE A                   = CLOSED
NEXT                     = EXISTING BACKLOG / OWNER DECISION (do not auto-start next wave)
```

Closeout Polish UX: [POLISH_UX_PRODUCTION_CLOSEOUT.md](./audits/POLISH_UX_PRODUCTION_CLOSEOUT.md)
Closeout Wave A: [A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md](./audits/A_ACCOUNT_BEATS_PRODUCTION_CLOSEOUT.md)
Closeout Fala 1B: [FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md](./audits/FALA_1B_ACCOUNT_ADMIN_VISUAL_FOUNDATION_CLOSEOUT.md)
Closeout Fala 3.5.1: [FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md](./audits/FALA_351_RECORDING_EXPERIENCE_CLOSEOUT.md)

### 3.1 STORAGE-ARCH-01 — LOCKED (living)

```text
STORAGE-ARCH-01              = LOCKED
Architecture                 = Hybrid C
Durable media                = Supabase Storage
Metadata SSOT                = Supabase PostgreSQL
Application / AuthZ / API    = Vercel / Next.js
Render / compute             = Contabo (ephemeral only · NOT durable library · NOT audio SSOT)
Buckets V1                   = beat-audio · take-audio · audio-artifacts (PRIVATE · no new buckets)
Final Architecture Review    = PASS WITH FINDINGS
Owner Review                 = PASS
OD-SA-01…10                  = LOCKED
Implementation               = NOT STARTED
STORAGE-ARCH-02              = FUTURE SCALABILITY DOCS PREPARED · external Object Storage OPTIONAL · NOT IMPLEMENTED · NO CURRENT INVESTMENT
STORAGE-ARCH-02-KEY          = NOT STARTED (OD-SA-02 / FAR-01 dual-read keys · no Implementation GO)
Production mutations         = NONE (from Storage review / this docs reconciliation)
```

SSOT: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md) · Future scale: [STORAGE_ARCH_02_FUTURE_SCALABILITY.md](./architecture/STORAGE_ARCH_02_FUTURE_SCALABILITY.md)

Future waves (no Implementation GO): 02-KEY dual-read · 03 artifacts janitor · 04/05 orphan inventory/dry-run/cleanup · 06 staged key migration · 07 backup source MASTER (REQUIRED BEFORE SCALE · threshold at Wave 07) · 08 worker hardening · 09/10 only after separate OD · external Object Storage only after separate provider/impl GO.

---

## 4. Next Session Entry

```text
NEXT SESSION ENTRY = Read FINAL_COLD_START_HANDOFF.md
                 → STORAGE-ARCH-02 = future scalability docs prepared (NOT IMPLEMENTED)
                 → do NOT provision R2/S3/external storage without separate Owner GO
                 → dual-read KEY / janitor / orphan / migration only after separate Implementation GO
                 → deferred backlog otherwise

STORAGE-ARCH-01 = LOCKED · STORAGE-ARCH-02 = FUTURE SCALABILITY DOCS (NOT IMPLEMENTED)
E3 = PRODUCTION VERIFIED — GREEN
Do NOT reopen closed E3.6 / E3.7 / W6 closeouts
Do NOT rewrite historical Design Freeze OD locks / OD-SA locks
Do NOT implement dual-read / janitor / orphan delete / key migration / backup / external storage without wave GO
Deferred remain deferred: Premium Production E2E · artifacts janitor · dashboard · live rollback drill · STEMS · payments
Rollback (if Owner GO): unset/off E3_PUBLIC_AUDIO → Free public paths DENY
HIBP enable = Owner Dashboard only (orthogonal)
```

Cold start: [FINAL_COLD_START_HANDOFF.md](./FINAL_COLD_START_HANDOFF.md)
Storage freeze: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md)
Future storage scale: [STORAGE_ARCH_02_FUTURE_SCALABILITY.md](./architecture/STORAGE_ARCH_02_FUTURE_SCALABILITY.md)
GO #2 record: [E3_WORKER_INFRASTRUCTURE_GO2.md](./audits/E3_WORKER_INFRASTRUCTURE_GO2.md)
Enablement freeze: [E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md](./audits/E3_PRODUCTION_ENABLEMENT_DESIGN_FREEZE.md)

---

## 5. Decision vs Delivery (recording + E3)

| ID | Decision | Delivery | Implementation |
|----|----------|----------|----------------|
| D02 Anonymous QT | CLOSED / IN V1 | **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` | COMPLETE |
| D03 Shared grants | CLOSED / IN Recording EPIC | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |
| E3.1–E3.6 Full Audio | Architecture Hybrid C LOCKED | **SHIPPED** @ `183b2a4` · historically DARK at wave closeout | COMPLETE |
| E3.7 Premium Render | OD-E37-01/02/03 LOCKED | **Code on Production** · Premium E2E **NOT TESTED** | Waves A–H COMPLETE |
| E3.8 W6 Mobile Cert | OD-W6-03 OWNER ACCEPTED emulated | **CERT CLOSED / PASS** | W6.1–W6.5 COMPLETE |
| W6.2/W6.3 UX ship | OD-E3-PE-04 / Owner GO #1 | **SHIPPED / PRODUCTION VERIFIED** @ `9026fa9` | COMPLETE |
| OWNER GO #2 Worker Infra | OD-E3-PE-02 PROVISION NOW | **CLOSED / SUPERSEDED** (Contabo) | COMPLETE |
| E3 Production Enablement | OD-E3-PE-01…05 LOCKED · Design Freeze COMPLETE | **COMPLETE** · GO #5 **PASS** · AC-PE-12 **PASS** @ `6dfd201` | COMPLETE |
| STORAGE-ARCH-01 | OD-SA-01…10 LOCKED · Design Freeze COMPLETE | **LOCKED** · Final Arch Review **PASS WITH FINDINGS** · Production mutations **NONE** | **NOT STARTED** (architecture only) |
| STORAGE-ARCH-02 | Future external Object Storage scalability | **DOCS PREPARED** · **NOT IMPLEMENTED** · **NO CURRENT INVESTMENT** | **NO Implementation GO** |
| STORAGE-ARCH-02-KEY | Dual-read / key validation (FAR-01 / OD-SA-02) | **NOT STARTED** | **NO Implementation GO** |

---

## 6. Out of scope / deferred (current delivery)

STEMS · payments / Premium catalog · Recording historical W6 security rewrite · audio-artifacts janitor (F-PE-04 / STORAGE-ARCH-03) · orphan beat-audio GC (STORAGE-ARCH-04/05) · staged legacy key migration (STORAGE-ARCH-06) · source MASTER backup before scale (STORAGE-ARCH-07) · dual-read key implementation (STORAGE-ARCH-02-KEY) · external Object Storage provisioning (STORAGE-ARCH-02 impl) · ops dashboard · Premium Production E2E (no fixture) · live rollback drill · public Free HQ/WAV · artwork bucket (OD-SA-04 DEFERRED).

**E3 Production flags (current living state):**

```text
E3_MIX_ENABLED           = ON
E3_RENDER_JOBS_ENABLED   = ON
E3_PUBLIC_AUDIO          = ON
E3_RENDER_WORKER_SECRET  = CONFIGURED (server-only · never commit)
WORKER                   = STOPPED / DISABLED after controlled verify
```

**Canonical rollback (Owner GO only):** unset/off `E3_PUBLIC_AUDIO` → Free public Mix/job/download DENY (AC-PE-12 fail-closed).

**Do not confuse:** W6.2/W6.3 UX ship SHA (`9026fa9`) ≠ current Production tip (`42369c0`) ≠ worker bootstrap (`92496d4`) ≠ docs tip (may advance on docs-only commits).
