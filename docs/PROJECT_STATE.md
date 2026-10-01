# BitRymDym — PROJECT STATE

**Dokument żywy.** Aktualizuj po każdej sesji z istotnymi zmianami.
**Entry point dla nowego agenta:** najpierw [MASTER_HANDOFF.md](./MASTER_HANDOFF.md), potem ten plik.

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
| **Repository HEAD / origin/main** | `a8e9356` (`docs: reconcile post-release E3 production state`) · docs tip may advance further on docs-only commits · **≠** Production app SHA |
| **Production application** | `6dfd201` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** |
| **Production deployment** | `dpl_3H57UgU2TfqkYawzamsVJ13qnMsG` |
| **STORAGE-ARCH-01** | **LOCKED** · Hybrid C · Final Architecture Review **PASS WITH FINDINGS** · Owner Review **PASS** · Implementation **NOT STARTED** · STORAGE-ARCH-02 **NOT STARTED** — [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md) |
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
| **P1-B** DEFINER grants hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-C** `set_updated_at` hardening | **CLOSED** / VERIFIED / committed+pushed @ `b4199ef` |
| **P1-A** HIBP | **BLOCKED** — Owner Dashboard action required |
| Security | **GREEN WITH WARNINGS** · CRITICAL=0 · HIGH=0 · MEDIUM = HIBP disabled + D02 TTL-only verify artifacts |
| Supabase project | `rzzxrgcdogkybkiidqgw` |
| Janitor cron | `0 0 * * *` (Hobby daily) · `CRON_SECRET` configured · **audio-artifacts janitor = DEFERRED** (STORAGE-ARCH-03 future wave · OD-SA-05) |

Handoff: [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
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
W6.2/W6.3 UX SHIP        = CLOSED / PRODUCTION VERIFIED @ 9026fa9
E3.8 W6 CERT             = CLOSED / PASS (Owner-accepted emulated)
E3 PRODUCTION ENABLEMENT = COMPLETE
AC-PE-12 / F-PE-02       = PASS @ 6dfd201
GO #2 Worker Infra       = CLOSED / SUPERSEDED (Contabo)
GO #3 Env enablement     = DONE
GO #4 Controlled render  = DONE
GO #5 Public Free Audio  = PASS
PRODUCTION APPLICATION   = 6dfd201
PRODUCTION DEPLOYMENT    = dpl_3H57UgU2TfqkYawzamsVJ13qnMsG
DOCS TIP / origin/main   = a8e9356 (+ uncommitted STORAGE-ARCH-01 docs until Owner commit GO)
E3_MIX_ENABLED           = ON
E3_RENDER_JOBS_ENABLED   = ON
E3_PUBLIC_AUDIO          = ON
WORKER                   = STOPPED / DISABLED (Contabo · bootstrap 92496d4)
E3 STATUS                = PRODUCTION VERIFIED — GREEN (PASS WITH FINDINGS)
PUBLIC FREE AUDIO        = RELEASED (Free Basic only · private bucket · signed URL)
STORAGE-ARCH-01          = LOCKED (Hybrid C · Final Arch Review PASS WITH FINDINGS)
STORAGE-ARCH-02          = NOT STARTED
NEXT                     = STORAGE-ARCH-01 docs commit GO (if Owner) → deferred backlog / Wave 02 only after Implementation GO
```

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
STORAGE-ARCH-02              = NOT STARTED (dual-read / FAR-01 — no Implementation GO)
Production mutations         = NONE (from Storage review / this docs reconciliation)
```

SSOT: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md) · [STORAGE_ARCH_01_AUDIT.md](./audits/STORAGE_ARCH_01_AUDIT.md)

Future waves (no Implementation GO): 02 dual-read · 03 artifacts janitor · 04/05 orphan inventory/dry-run/cleanup · 06 staged key migration · 07 backup source MASTER (REQUIRED BEFORE SCALE · threshold at Wave 07) · 08 worker hardening · 09/10 only after separate OD.

---

## 4. Next Session Entry

```text
NEXT SESSION ENTRY = OWNER REVIEW of STORAGE-ARCH-01 docs reconciliation
                 → optional docs COMMIT + PUSH GO
                 → STORAGE-ARCH-02 only after separate Implementation GO
                 (deferred backlog otherwise)

STORAGE-ARCH-01 = LOCKED · STORAGE-ARCH-02 = NOT STARTED
E3 = PRODUCTION VERIFIED — GREEN
Do NOT reopen closed E3.6 / E3.7 / W6 closeouts
Do NOT rewrite historical Design Freeze OD locks / OD-SA locks
Do NOT implement dual-read / janitor / orphan delete / key migration / backup without wave GO
Deferred remain deferred: Premium Production E2E · artifacts janitor · dashboard · live rollback drill · STEMS · payments
Rollback (if Owner GO): unset/off E3_PUBLIC_AUDIO → Free public paths DENY
HIBP enable = Owner Dashboard only (orthogonal)
```

Storage freeze: [STORAGE_ARCH_01_DESIGN_FREEZE.md](./audits/STORAGE_ARCH_01_DESIGN_FREEZE.md)
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
| STORAGE-ARCH-02 | Dual-read / key validation (FAR-01) | **NOT STARTED** | **NO Implementation GO** |

---

## 6. Out of scope / deferred (current delivery)

STEMS · payments / Premium catalog · Recording historical W6 security rewrite · audio-artifacts janitor (F-PE-04 / STORAGE-ARCH-03) · orphan beat-audio GC (STORAGE-ARCH-04/05) · staged legacy key migration (STORAGE-ARCH-06) · source MASTER backup before scale (STORAGE-ARCH-07) · dual-read implementation (STORAGE-ARCH-02) · ops dashboard · Premium Production E2E (no fixture) · live rollback drill · public Free HQ/WAV · artwork bucket (OD-SA-04 DEFERRED).

**E3 Production flags (current living state):**

```text
E3_MIX_ENABLED           = ON
E3_RENDER_JOBS_ENABLED   = ON
E3_PUBLIC_AUDIO          = ON
E3_RENDER_WORKER_SECRET  = CONFIGURED (server-only · never commit)
WORKER                   = STOPPED / DISABLED after controlled verify
```

**Canonical rollback (Owner GO only):** unset/off `E3_PUBLIC_AUDIO` → Free public Mix/job/download DENY (AC-PE-12 fail-closed).

**Do not confuse:** W6.2/W6.3 UX ship SHA (`9026fa9`) ≠ current Production tip (`6dfd201`) ≠ worker bootstrap (`92496d4`).
