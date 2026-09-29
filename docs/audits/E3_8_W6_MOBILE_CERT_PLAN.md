# E3.8 — W6 MOBILE CERTIFICATION — DESIGN FREEZE

**Type:** Design Freeze (canonical) · **W6 CLOSED / PASS** (Owner-accepted emulated certification)
**Date:** 2026-09-29
**Epic wave:** `E3.8 — W6` (OAD-05)
**Application / Production baseline:** `17c4d530c2ecc7c0c8e68cf6266e73b330f09be1`
**Documentation tip (at freeze authorship):** `f06ef72a8c06c9e2fb208d228a9f62d0917bbed8`
**Production URL:** https://www.bitrymdym.pl
**Closeout:** [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)

```text
DESIGN FREEZE           = COMPLETE (this document)
OWNER ARCH REVIEW       = PASS WITH FINDINGS
OWNER IMPLEMENTATION GO = GRANTED
W6.1–W6.3               = ACCEPTED
W6.4                    = PASS · OWNER-ACCEPTED EMULATED
W6.5                    = COMPLETE (docs closeout)
W6 STATUS               = CLOSED / PASS
CERTIFICATION MODE      = OWNER-ACCEPTED EMULATED
E3 PRODUCTION           = DARK (unchanged · 17c4d530)
PUBLIC FREE AUDIO       = STILL GATED (E3_PUBLIC_AUDIO UNSET)
PRODUCTION ENABLEMENT   = NOT EXECUTED
```

**SSOT precedents (read-only):**

| Document | Role |
|----------|------|
| [E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md](../architecture/E3_FULL_AUDIO_FINAL_ARCHITECTURE_LOCK.md) | OAD-05 LOCKED — STRICT MOBILE-CERT-FIRST |
| [E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md](../architecture/E3_FULL_AUDIO_IMPLEMENTATION_PLAN.md) §13 | W6 / E3.8 matrix ownership |
| [E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md](../architecture/E3_FULL_AUDIO_ARCHITECTURE_ADDENDUM.md) §6 | Mobile rollout options (Owner chose Strict) |
| [E3_7_IMPLEMENTATION_CLOSEOUT.md](./E3_7_IMPLEMENTATION_CLOSEOUT.md) | E3.7 PRODUCTION VERIFIED · DARK |
| [PROJECT_STATE.md](../PROJECT_STATE.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md) | Living continuity |

**This document does not:** grant Public Free Audio · reopen E3.7 DSP/AuthZ · enable Production E3 flags.

**W6.1 checklist artifact (fillable evidence):** [E3_8_W6_CERT_CHECKLIST.md](./E3_8_W6_CERT_CHECKLIST.md) — criteria SSOT remains this freeze (§§5–7).

---

## 0. Owner Implement decisions (LOCKED — Arch findings)

Locked by **OWNER IMPLEMENT GO** after Arch Review **PASS WITH FINDINGS**:

| ID | Decision | Locked value |
|----|----------|--------------|
| **AR-W6-01** | Mix client gate | **Server-resolved RSC prop `mixEnabled`** · no `NEXT_PUBLIC_` for this mechanism · presentation gate only · AuthZ/DSP/server Mix contracts unchanged |
| **AR-W6-02** | Preview cert depth | **Mix-only** · `E3_RENDER_JOBS_ENABLED` **OFF** · no jobs / worker / FFmpeg / artifacts / Storage / new Supabase |
| **AR-W6-03** | Export cert depth | **Presentation + status + error UX** · not live render / encode / artifact / new signed download of generated audio |

---

## 1. Owner Decisions (FROZEN)

| ID | Decision | Locked value |
|----|----------|--------------|
| **OD-W6-01** | W6 scope | **A** — OAD-05 Strict Mobile Certification only · Recording historical W6 security leftovers = **OUT** |
| **OD-W6-02** | Mix/Export certification environment | **A** — **Preview** with Mix enablement for Mix UI/preview cert · Export = presentation/status/error only (AR-W6-03) · `E3_RENDER_JOBS_ENABLED` stays OFF · Production flags remain UNSET |
| **OD-W6-03** | Device / browser matrix | Viewports **360×800 · 390×844 · 412×915 · 768×1024** + desktop **≥1024** · browsers **iOS Safari** + **Android Chrome** (matrix definition) · **CLOSED / OWNER ACCEPTED** — Owner accepts **emulated** Playwright Chromium/WebKit + Android UA evidence as the certification substitute for this release (physical devices unavailable in agent env) |

```text
OD-W6-01 = A
OD-W6-02 = A
OD-W6-03 = CLOSED / OWNER ACCEPTED (emulated certification substitute)
```

### OD-W6-03 — CLOSED / OWNER ACCEPTED (2026-09-29)

**Decision:** Owner accepts emulated mobile certification evidence as the certification substitute for this W6 release because physical iOS Safari / Android Chrome devices were unavailable in the agent environment.

**Accepted evidence:** Playwright Chromium mobile emulation · Playwright WebKit emulation · Android Chrome UA emulation · required viewport matrix · desktop ≥1024 regression · W6.4 evidence package (`docs/audits/_w64_evidence/`).

**Explicit limitation:** No physical iOS Safari or physical Android Chrome execution was performed. Physical-device execution was unavailable in the agent environment; Owner explicitly accepted emulated evidence as the release certification substitute.

**Impact:** W6 may be closed. This decision does **NOT** enable Production audio rendering or public Free Audio.

---

## 2. What W6 Is / Is Not

### Is

```text
E3.8 W6 = mobile presentation certification + minimal presentation fixes
         required before public Free Audio can be considered (OAD-05)
```

- Presentation / layout / touch / overflow / device matrix
- Reuses existing Mix · Master · Export · AuthZ · entitlement · download SSOT
- Ends with **W6 PASS record** — still **DARK** on Production

### Is not

```text
W6 PASS ≠ E3_PUBLIC_AUDIO ON
W6 PASS ≠ Production render enablement
W6 PASS ≠ E3 epic COMPLETE
```

Separate later gate: **OWNER PRODUCTION ENABLEMENT GO** (flags / public Free Audio).

---

## 3. Frozen Scope — Waves

Order is **strict**. Do not merge waves or skip W6.1 without Owner GO.

### W6.1 — CERT SCOPE + CHECKLIST

| Field | Value |
|-------|--------|
| Scope | Freeze surfaces · formal checklist template · viewport/browser matrix · PASS/FAIL criteria · Recording W6 explicit OUT |
| Affected | `docs/**` only (this plan + checklist appendix) |
| Dependencies | Design Freeze (this doc) · Arch Review |
| Risk | LOW |
| Validation | Owner-approved checklist rows exist before any UI code |
| Definition of Done | Checklist artifact ready ([E3_8_W6_CERT_CHECKLIST.md](./E3_8_W6_CERT_CHECKLIST.md)) · scope unambiguous · **W6.1 COMPLETE** · Owner Verification before W6.2 |

### W6.2 — SHARED MOBILE PRESENTATION

| Field | Value |
|-------|--------|
| Scope | Touch targets · PlaybackShell · Download · SiteHeader · overflow · safe-area · shared presentation tokens |
| Affected (expected) | `site-header.tsx` · `button.tsx` · `playback-shell.tsx` · download button · layout/CSS only as needed |
| Dependencies | W6.1 · Owner Implementation GO |
| Risk | MEDIUM — shared Button/Header can regress desktop |
| Validation | Viewports 360/390/412 · primary CTAs ≥44×44 · overflow-x PASS · desktop ≥1024 regression |
| Definition of Done | Shared-surface checklist rows PASS |

**Forbidden in W6.2:** DSP · AuthZ · entitlement · Mix business logic · Export encode · Recording AuthZ contracts.

### W6.3 — MIX / MASTER / EXPORT MOBILE PRESENTATION

| Field | Value |
|-------|--------|
| Scope | Progressive disclosure · touch CTAs · export row · metering readability · mobile layout of existing MixPanel |
| Affected (expected) | `mix-panel.tsx` (+ thin CSS only if required) |
| Dependencies | W6.2 · **Preview** with `E3_MIX_ENABLED=true` (OD-W6-02) |
| Risk | MEDIUM–HIGH — dense UI · desktop Mix discoverability |
| Validation | Cert env: Basic Mix start/stop · Basic Export presentation · Premium lock readability · overflow PASS |
| Definition of Done | Mix/Master/Export checklist rows PASS on Preview |

**ABSOLUTELY FORBIDDEN in W6.3:**

```text
NO DSP CHANGES
NO MIX BUSINESS LOGIC CHANGES
NO MASTER BUSINESS LOGIC CHANGES
NO EXPORT BUSINESS LOGIC CHANGES
NO AUTHZ CHANGES
NO ENTITLEMENT LOGIC CHANGES
NO PARALLEL MOBILE-ONLY BUSINESS FLOW
```

### W6.4 — DEVICE MATRIX EXECUTION

| Field | Value |
|-------|--------|
| Scope | iOS Safari · Android Chrome · interrupt · orientation · playback · Basic Mix preview · Basic Export presentation · download surface |
| Affected | Evidence docs only (matrix fill) · no product logic |
| Dependencies | W6.2–W6.3 complete · Preview cert env available |
| Risk | LOW (process) · ops dependency on devices |
| Validation | Full frozen matrix filled · CRITICAL open findings = 0 |
| Definition of Done | **W6 matrix PASS** recorded |

### W6.5 — CLOSEOUT

| Field | Value |
|-------|--------|
| Scope | PROJECT_STATE · MASTER_HANDOFF · CHANGELOG · E3.8 W6 closeout audit |
| Affected | `docs/**` |
| Dependencies | W6.4 PASS (Owner-accepted emulated) |
| Risk | LOW |
| Validation | Docs state: W6 PASS · Production still DARK · public Free Audio still gated |
| Definition of Done | **COMPLETE** — [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) · **no** Production enablement |

---

## 4. Surface Matrix (certification targets)

| Surface | In W6? | Notes |
|---------|--------|-------|
| `/` Homepage | YES | Smoke + overflow |
| `/beats` browsing | YES | Nav + list touch |
| `/beat/[id]` playback | YES | PlaybackShell CTAs |
| Recording CTA (existing) | YES (presentation only) | Already uses `min-h-11` — verify · do not change AuthZ |
| Download (beat/take) | YES | Touch + overflow |
| Auth / Account | YES | Primary Auth CTA ≥44px · header |
| Mix (Basic) | YES — **Preview only** | OD-W6-02 |
| Master (Basic + Pro UX chrome) | YES — Preview | Presentation only |
| Export Basic / HQ / WAV chrome | YES — Preview | Presentation + status/error · **no** live encode (AR-W6-03) |
| Premium lock / entitlement UX | YES — Preview | Server entitlement remains SSOT |
| Admin desktop | OUT | |
| Recording historical W6 security | OUT | OD-W6-01 |

---

## 5. Device / Browser / Viewport Matrix (FROZEN)

### Viewports (formal)

| Viewport | Role |
|----------|------|
| **360×800** | Phone — must PASS |
| **390×844** | Phone — must PASS |
| **412×915** | Phone — must PASS |
| **768×1024** | Tablet — must PASS |
| **≥1024** | Desktop regression — must PASS |

### Browsers (formal)

| Browser | Role |
|---------|------|
| **iOS Safari** | Must PASS |
| **Android Chrome** | Must PASS |
| **Desktop Chrome** | Desktop regression must PASS |

W6 is **not PASS** until this critical matrix is executed and documented (W6.4).

---

## 6. Acceptance Criteria (FROZEN)

### A. Viewport

Formal certification on **360×800 · 390×844 · 412×915** plus **768×1024** and desktop **≥1024**.

### B. Touch target

Primary CTAs **≥ 44×44 CSS px**, minimum:

```text
Play · Record · Export · Download · Primary Auth
```

### C. Overflow

On certified pages:

```text
document.documentElement.scrollWidth <= window.innerWidth + 1
document.body.scrollWidth <= window.innerWidth + 1
```

No horizontal scrolling caused by layout.

### D. Playback

iOS Safari + Android Chrome:

```text
play · pause · mute · volume · seek · gesture/AudioContext interaction = PASS
```

Do **not** change audio engine logic unless a concrete mobile presentation / gesture bug requires a minimal fix (Arch Review + Implementation GO).

### E. Basic Mix (Preview cert env only)

```text
Basic Mix preview start = PASS
Basic Mix preview stop  = PASS
```

Production: `E3_MIX_ENABLED = UNSET` always during W6.

### F. Basic Export (Preview cert env) — clarified by AR-W6-03

```text
Basic Export presentation = PASS
status / loading UX       = PASS
error / disabled UX       = PASS
download CTA presentation = PASS
```

**Live** poll→SUCCEEDED→new artifact download = **OUT** for W6 (AR-W6-03).  
**No** Production artifact. **No** worker secret. **No** `E3_RENDER_JOBS_ENABLED` for W6. Real encode = **DEPENDENCY** (do not self-provision).

### G. Premium UX

```text
Entitlement messaging readable on phone
Free vs Premium not confused
No desktop-only interaction required for lock/CTA
Server-side entitlement remains SSOT
```

---

## 7. MUST / SHOULD / OUT

### MUST HAVE

1. Formal checklist + filled PASS evidence for frozen matrix.
2. Primary CTAs ≥44×44 on certified viewports.
3. Overflow-x PASS on certified Free Audio path pages.
4. Playback PASS on iOS Safari + Android Chrome.
5. Basic Mix start/stop PASS on Preview cert env.
6. Basic Export presentation + status/error + download CTA presentation PASS on Preview (no live render — AR-W6-03).
7. Production E3 flags remain UNSET; no Production render/artifacts from W6.

### SHOULD HAVE

1. SiteHeader mobile collapse / sheet when many nav links.
2. Mix Pro controls behind accordion/sheet (limited simultaneous params).
3. Safe-area padding for bottom CTAs on notched iOS.
4. Metering readability on ≤390 width.
5. Optional automated viewport smoke later (not required for first W6 PASS).

### OUT

Full redesign · brand refresh · native apps · STEMS · payments · Premium catalog · new DSP · new Mix/Master/Export/AuthZ/entitlement business logic · Production E3 enablement · Production render · Production artifacts · worker activation · Recording W6 security leftovers · admin desktop redesign · parallel mobile-only business flows.

---

## 8. Preview Certification Strategy (OD-W6-02 = A)

```text
PREVIEW
  E3_MIX_ENABLED = true   (cert only)

PRODUCTION (unchanged)
  E3_RENDER_JOBS_ENABLED = UNSET
  E3_MIX_ENABLED         = UNSET
  E3_PUBLIC_AUDIO        = UNSET
  E3_RENDER_WORKER_SECRET = UNSET
```

### Rules

- Preview enablement **≠** Production enablement.
- Do **not** copy Preview mix flag to Production.
- Do **not** use Production worker secret for W6.
- Do **not** create Production artifacts for W6.
- Do **not** change Production Storage / RLS / migrations for W6.

### Dependency (report before inventing infra)

If Preview lacks a path to enable `E3_MIX_ENABLED` without touching Production:

```text
DEPENDENCY = Preview env var / Vercel Preview config
ACTION     = Report to Owner · do not self-provision Production
```

Implementation of Preview flag wiring requires **Owner Implementation GO** after Arch Review — not this freeze.

---

## 9. Production Safety (MANDATORY)

```text
E3_RENDER_JOBS_ENABLED = UNSET
E3_MIX_ENABLED         = UNSET
E3_PUBLIC_AUDIO        = UNSET
E3_RENDER_WORKER_SECRET = UNSET
E3                     = DARK
REAL RENDER            = NOT EXECUTED (Production)
ARTIFACT               = NONE (Production from W6)
```

```text
W6 PASS ≠ Public Free Audio ON
After W6 PASS → still requires OWNER PRODUCTION ENABLEMENT GO
```

---

## 10. Architecture Rules (FROZEN)

```text
SSOT FIRST
REUSE FIRST
ZERO DUPLICATE LOGIC
SERVER IS SOURCE OF TRUTH
MOBILE FIRST
NO SCOPE CREEP
NO PARALLEL BUSINESS LOGIC
```

Mobile is a **presentation layer** over existing Mix / Master / Export / AuthZ / entitlement / download.

---

## 11. Regression Protection

Every W6 change must be assessed against:

```text
Desktop · Playback · Recording · Mix · Master · Export · Download · Authentication · Premium entitlement
```

**High-care components:**

```text
SiteHeader · Button sizing · PlaybackShell · MixPanel · DownloadButton
```

Shared token changes (e.g. default Button height) require explicit desktop regression check ≥1024.

---

## 12. Regression Risks (from Audit — frozen awareness)

| Risk | Mitigation |
|------|------------|
| Header nav collapse hurts desktop discoverability | Desktop regression checklist · progressive enhancement |
| Global Button ≥44px breaks dense desktop | Prefer size variants / surface-local `min-h-11` over blind global default |
| Mix progressive disclosure hides Pro params | Keep Pro unlock/CTA visible · document disclosure map |
| PlaybackShell touch fix breaks keyboard a11y | Keep key handlers · test keyboard path |
| Accidental Production flag enable during cert | OD-W6-02 Preview-only · Production checklist |
| Touching take/AuthZ while fixing UI | Explicit DO NOT TOUCH server AuthZ / D02 contracts |

---

## 13. Audit Baseline Findings (inputs — not implementation tasks yet)

Recorded at Audit (Production @ `17c4d530`, 360 CDP):

| Finding | Severity for W6 |
|---------|-----------------|
| Nav link hit ~20px high · header wraps | MUST address in W6.2 |
| Play / Mute / Download buttons ~32px (`h-8`) | MUST address in W6.2 |
| Record CTA already ~44px (`min-h-11`) | VERIFY in matrix |
| No overflow-x on `/beats` + beat detail at 360 | KEEP · re-verify after changes |
| Mix/Export not visible on Production (DARK) | Cert via Preview (OD-W6-02) |
| No Playwright harness | Manual/device matrix OK for first PASS |

---

## 14. Checklist (W6.1 deliverable) — REUSE

**Canonical fillable artifact:** [E3_8_W6_CERT_CHECKLIST.md](./E3_8_W6_CERT_CHECKLIST.md)

Criteria / device / browser / acceptance SSOT = **this freeze** (§§5–7). Checklist does not redefine them — it records PASS/FAIL/SKIP cells for W6.4.

Row coverage (see checklist §§6–8):

```text
overflow-x · Play/Record/Export/Download/Auth ≥44
Playback play/pause/mute/volume/seek/gesture
SiteHeader usable · desktop ≥1024 regression
Basic Mix start/stop (Preview)
Export presentation + status/error + download CTA (Preview · no live render)
Premium lock (Preview) · Production Dark checks
```

```text
W6.1 = COMPLETE (checklist artifact ready)
Full filled matrix = W6.4 evidence
```

---

## 15. Gates After This Freeze

```text
OWNER ARCH REVIEW           = PASS WITH FINDINGS (done)
OWNER IMPLEMENTATION GO     = GRANTED (done)
W6.1                        = COMPLETE · OWNER W6.1 VERIFICATION
  → W6.2 → W6.3 → W6.4 PASS
  → W6.5 docs closeout
  → still DARK on Production
  → OWNER PRODUCTION ENABLEMENT GO (separate · not W6)
```

---

## 16. Absolute Stop (current gate)

```text
W6.1 CODE CHANGES = NONE
COMMIT            = NONE (until Owner docs-commit GO)
PUSH              = NONE
DEPLOY            = NONE
PREVIEW DEPLOY    = NOT IN W6.1
E3 PRODUCTION     = DARK
W6.2              = WAIT OWNER W6.1 VERIFICATION GO
```

```text
E3.8 W6 DESIGN FREEZE = COMPLETE
W6.1                  = COMPLETE (docs)
NEXT                  = OWNER W6.1 VERIFICATION GO
```
