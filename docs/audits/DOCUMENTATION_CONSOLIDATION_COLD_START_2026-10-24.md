# Documentation consolidation & cold-start recovery — evidence

**Date:** 2026-10-24  
**Mode:** DOCUMENTATION-FIRST · read-only infra · **no** commit / push / branch switch / prod mutation  
**Owner:** Prezes Dawid  
**Executor:** Cursor Agent  

**Canonical updates applied in this session:**  
[FINAL_COLD_START_HANDOFF.md](../FINAL_COLD_START_HANDOFF.md) · [PROJECT_STATE.md](../PROJECT_STATE.md) · [DOCUMENTATION_CONTINUITY.md](../DOCUMENTATION_CONTINUITY.md) · [README.md](../README.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) · [CHANGELOG.md](../CHANGELOG.md) · [runbooks/PRODUCTION_BOOTSTRAP.md](../runbooks/PRODUCTION_BOOTSTRAP.md) · root [README.md](../../README.md)

---

## 1. Inventory summary (local working tree)

| Category | Approx. count | Role |
|----------|---------------|------|
| `docs/**/*.md` | ~296 | Normative + historical docs |
| `docs/**` md+json | ~366 | Includes audit evidence JSON |
| `docs/architecture/` | present | HOW / locks / REUSE map |
| `docs/audits/` | large | Evidence / closeouts / inventories |
| `docs/decisions/` | present | OPEN / LOG / freezes / contracts |
| `docs/phases/` | present | Phase freezes |
| `docs/runbooks/` | 1 file | PRODUCTION_BOOTSTRAP |
| `docs/ssot/` | MASTER_SSOT_v0.1 | Product WHAT |
| `infra/oracle/` | untracked | Prepurchase / ORM notes — **not** live Contabo proof |
| Root | README · AGENTS | Entry + agent policy |

**Sources:** local working tree counted 2026-10-24. GitHub/`origin/main` compared via `git ls-remote` + `git show origin/main:…` (no fetch mutate). Full per-file matrix omitted here (too large); bucketed inventory is intentional — no second SSOT catalog.

**Not read:** entire audit corpus line-by-line; Sacred WIP file content (hash only).

---

## 2. Git planes (CURRENTLY VERIFIED 2026-10-24)

| Plane | Value |
|-------|--------|
| Repo path | `C:\Users\dawid\Desktop\BitRymDym\bitrymdym` |
| Branch | `main` |
| Local HEAD | `96e4c31550819ba70297945d13cd7dec3113bf0f` |
| `origin/main` | `800f611de0b3853bf6cb64e16bc72b2be40d3252` |
| Ahead/behind | local **behind by 2** (`90e538d`, `800f611`) |
| Sacred WIP SHA256 | `5AE4C2311704DCDAE51CE36D8E69E1CA162F0C55AB14866EB30E73DC50EEECB9` — **MATCH** |
| Dirty worktree | **YES — PRESERVE** (Studio · Premium Retention · audits · scripts · config ports · etc.) |

**Commits on origin not in local HEAD:**

1. `90e538d` — `docs(policy): establish autonomous execution workflow`
2. `800f611` — `test(audio): isolate real MP3 encode from the default suite`

**Do not** pull/merge/reset while dirty without Owner GO.

---

## 3. Production / infra classes

| Item | Class | Note |
|------|-------|------|
| Live Vercel dpl for aliases | **NOT RE-VERIFIED** this session | Last documented READY `dpl_31mz…` @ `0a565c0` (2026-10-19) |
| App tip `d12e38e` | LAST DOCUMENTED | BPM CONFLICT labeling |
| Contabo `vmi3622761` | LAST DOCUMENTED · SSH **NOT VERIFIED** 2026-10-24 | Last RO SSH success documented **2026-10-16** (`ubuntu@161.97.72.197`, `/opt/bitrymdym-e3-worker`) — see PROJECT_STATE §2c · persistent disabled/inactive |
| Supabase `rzzxrgcdogkybkiidqgw` | LAST DOCUMENTED | `db push` BLOCKED (registry drift) |
| Local ports 54421/… | LAST DOCUMENTED WIP | `supabase/config.toml` dirty |
| Premium Retention | HOLD · local untracked | fencing contract + PG gate tests — not on origin |

GitHub MCP / Supabase MCP / Vercel CLI: **not used for mutations**; GitHub/Supabase MCP were unavailable or needsAuth — not treated as connection proof.

---

## 4. SSOT / ownership conflicts resolved in docs

| Issue | Resolution |
|-------|------------|
| Continuity said MASTER_HANDOFF was canonical entry; FINAL said START HERE | Continuity + docs/README ownership aligned: **FINAL → MASTER → PROJECT_STATE** |
| §0 tip `0a565c0` treated as current while origin is `800f611` | SESSION VERIFY banner + LAST DOCUMENTED label |
| Root README claimed prod SHA `06c60b5` / old dpl | Pointed to PROJECT_STATE only |

**Not resolved in registry files (dirty — left untouched):**

- `docs/decisions/OPEN_DECISIONS.md`
- `docs/decisions/DECISION_LOG.md`

### Proposed registry entries (text only — do not auto-apply)

**OPEN_DECISIONS (add when Owner allows edit):**

- OD-PRET-03, OD-PRET-05…08 (Premium Retention) + OD-PRET-09 (`p_now`) + OD-PRET-10 (L2 live-artifact guard) + OD-PRET-11 (account delete vs append-only)
- OD-62-02 / 03 / 06 (HOLD TTL) / 08 (migration GO)
- Contabo GO-HOST-RO / sync / canary / always-on (if not already listed)
- OD-SFM staging / worker GOs as already referenced in PROJECT_STATE

**DECISION_LOG (add when Owner allows edit):**

- D-TCB / D-ADMIN / D-G3-NAME / D-G4P / D-PAYLOAD / D-LEASE (2026-10-24 Owner-accepted in fencing contract)
- OD-PRET-01 / 02 / 04 closed locally in fencing contract — register under OD-EXPORT-OPEN-DELETE-SCOPE parent
- 2026-10-23 autonomy policy already partially on origin via `90e538d`

---

## 5. Cold-start simulation (15 questions)

Answered from updated docs only (post-edit):

1. **What is BitRymDym?** Platforma muzyczna rap/hip-hop — FINAL §0 / §2.  
2. **Current state?** STOP — OWNER DECISION REQUIRED · PROJECT_STATE NEXT UNIT · SESSION VERIFY Git planes.  
3. **Production app state?** Last documented dpl/app tip in PROJECT_STATE · **live dpl NOT RE-VERIFIED 2026-10-24**.  
4. **origin vs local HEAD?** origin `800f611` · local `96e4c31` · behind 2.  
5. **Dirty?** YES — PRESERVE · Sacred WIP MATCH.  
6. **Canonical SSOT?** PROJECT_STATE living · FINAL entry · MASTER_SSOT product WHAT.  
7. **Open/closed/blocked?** NEXT STOP · STU-16 Limited Pass ≠ GREEN · SFM GREEN NOT CLAIMED · Contabo always-on NOT DONE · Premium HOLD.  
8. **Infra connections?** PROJECT_STATE §2c · PRODUCTION_BOOTSTRAP quick-check.  
9. **Safe local run?** ports 54421… · local fixtures · AGENTS egress rules.  
10. **Tests?** unit default · integration LOCAL_SUPABASE · media suite opt-in · never prod Storage.  
11. **Owner-approved next?** STOP — Owner picks GO (SFM/Contabo/P6.8/etc.).  
12. **Blocked?** db push · Contabo always-on · Premium activation · Sacred WIP · unrelated dirty sync.  
13. **Before first code change?** FINAL §0A · status · Sacred hash · REUSE map · AGENTS.  
14. **Evidence?** audits/* · CHANGELOG · PROJECT_STATE rows with dates.  
15. **Avoid re-reading all code?** START HERE → PROJECT_STATE → scoped audit/freeze only.

---

## 6. Subagents / skills (this session)

Skills read: `documentation-audit`, `research-and-planning`.

Subagents launched (background; results incorporated when available): Documentation Inventory, SSOT/Decisions, Infra/VPS, Release/Evidence, Cold-Start UX. Final independent review after edits.

---

## 7. Safety confirmation

| Check | Result |
|-------|--------|
| App code mutated for this task | **NO** (docs only) |
| Sacred WIP opened/edited | **NO** (hash only) |
| Dirty foreign registries overwritten | **NO** (OPEN_DECISIONS / DECISION_LOG untouched) |
| Production / Contabo / migrations | **NO-TOUCH** |
| Git commit / push / branch switch | **NO** |

---

## 8. Readiness

**`READY WITH KNOWN BLOCKERS`**

Blockers for pure `READY FOR COLD START`: live Vercel re-verify; Owner decision on pull-behind-dirty; OPEN_DECISIONS/DECISION_LOG sync; Contabo SSH verify; Premium Retention Owner path.
