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
| **Production application** | `183b2a4` · https://www.bitrymdym.pl · **GREEN** / **PRODUCTION VERIFIED** (E3.6 Basic MP3 · **DARK**) |
| **Production deployment** | `dpl_D5EfHdSSahouFftf5HK35wKSHmts` |
| **Documentation tip** | `f944747` (E3.6 docs closeout) — docs tip may advance without redeploy |
| **E3.7 Premium Render** | **IMPLEMENTED** · **OWNER VERIFICATION = PASS WITH FINDINGS** · **docs reconciled** · **COMMIT/PUSH/DEPLOY = NONE** · **not** on Production |
| Previous Production | `fbece37` (E3.5 Render Jobs) |
| **E3 FULL AUDIO** | **E3.1 → E3.6 CLOSED / PRODUCTION VERIFIED** @ `183b2a4` · **E3.7 IMPLEMENTED locally** · **E3 = DARK** |
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
| Janitor cron | `0 0 * * *` (Hobby daily) · `CRON_SECRET` configured |

Handoff: [MASTER_HANDOFF.md](./MASTER_HANDOFF.md)
E3.7 closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)
E3.6 closeout: [E3_6_PRODUCTION_CLOSEOUT.md](./audits/E3_6_PRODUCTION_CLOSEOUT.md)
E3 architecture: [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](./architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) · [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](./architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md)
D02 closeout: [RECORDING_D02_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_D02_PRODUCTION_CLOSEOUT.md)
W5 closeout: [RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md](./audits/RECORDING_WAVE5_PRODUCTION_CLOSEOUT.md)

---

## 3. Current Phase

```text
E3.7 = IMPLEMENTED / OWNER VERIFIED (PASS WITH FINDINGS) / DOCS RECONCILED
E3.7 COMMIT / PUSH / PRODUCTION DEPLOY / PRODUCTION VERIFY = NONE / NOT YET
E3.1 → E3.6 = CLOSED / PRODUCTION VERIFIED @ 183b2a4
E3 FLAGS = DARK (E3_RENDER_JOBS_ENABLED / E3_MIX_ENABLED / E3_PUBLIC_AUDIO = UNSET)
E3_RENDER_WORKER_SECRET = UNSET
PRODUCTION RENDER = NOT EXECUTED
RECORDING WAVE 1–5 = CLOSED / PRODUCTION VERIFIED
D02 = CLOSED / IN V1 · SHIPPED @ e98ba52
NEXT = OWNER COMMIT GO (E3.7) — then PUSH / Production Verify gates
```

---

## 4. Next Session Entry

```text
NEXT = OWNER COMMIT GO (E3.7 implementation)
NEXT FEATURE = DO NOT AUTO-SELECT beyond Owner-opened E3.7 release gates

APPLICATION (Production) = 183b2a4
DOCUMENTATION tip = f944747
E3.7 = IMPLEMENTED locally · NOT Production-deployed · DARK

Do NOT enable E3 flags or set E3_RENDER_WORKER_SECRET without separate Owner Production Enablement GO
Do NOT treat docs-only tip SHA as a new application deploy unless Owner Production GO
HIBP enable = Owner Dashboard only (orthogonal)
```

E3.7 closeout: [E3_7_IMPLEMENTATION_CLOSEOUT.md](./audits/E3_7_IMPLEMENTATION_CLOSEOUT.md)

---

## 5. Decision vs Delivery (recording + E3)

| ID | Decision | Delivery | Implementation |
|----|----------|----------|----------------|
| D02 Anonymous QT | CLOSED / IN V1 | **SHIPPED / PRODUCTION VERIFIED** @ `e98ba52` | COMPLETE |
| D03 Shared grants | CLOSED / IN Recording EPIC | **SHIPPED / PRODUCTION VERIFIED** @ `37892a6` (RECORD only) | Wave 5 COMPLETE |
| E3.1–E3.6 Full Audio | Architecture Hybrid C LOCKED · OD-E36-04 = C | **SHIPPED / PRODUCTION VERIFIED** @ `183b2a4` · **DARK** | COMPLETE |
| E3.7 Premium Render | OD-E37-01/02/03 LOCKED · Design Freeze PASS WITH FINDINGS | **IMPLEMENTED** · Owner Verify **PASS WITH FINDINGS** · **not** Production-deployed | Waves A–H COMPLETE locally |

---

## 6. Out of scope reminders (current delivery)

Anon→account claim · durable anonymous download · grant PLAYBACK/DOWNLOAD · Track publish from recording · payments/Premium catalog · dual-play mix preview · comments/voting/messaging product · E3 public Free Audio enablement · Production real render enablement · STEMS · `MasterProParams` / True Peak / BS.1770.

**E3 Production safety (mandatory):**

```text
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED = UNSET
E3_PUBLIC_AUDIO = UNSET
E3_RENDER_WORKER_SECRET = UNSET
```

Production app remains E3.6 @ `183b2a4` (DARK). E3.7 exists in local worktree until Owner Commit/Push/Deploy — **do not** describe E3.7 as Production-enabled.

**E3.7 INFO findings (non-blockers):** G5 soft RMS ≠ BS.1770 · E3.7 uncommitted until Owner GO · no Production Verify yet.

**D02 POST-RELEASE FINDING (MEDIUM=1):** TTL-bound anonymous verify artifacts — not escalated to P0/P1.

**P2 OPS (not blocker):** migration version name drift (local vs remote timestamps).

**INFO (non-blocker):** React hydration warning on `/beat/[id]` (observed in `next dev`).
