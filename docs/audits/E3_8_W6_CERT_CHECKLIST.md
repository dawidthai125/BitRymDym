# E3.8 W6 — Certification Checklist (W6.1–W6.5)

**Type:** Fillable certification evidence template + closeout record  
**Wave:** W6.4 PASS · W6.5 CLOSEOUT · 2026-09-29  
**Application / Production baseline:** `17c4d530` (Production — W6 presentation code not required on Production for cert closeout; Production remains DARK)  
**Certification tip under test:** local W6.2+W6.3 presentation · Preview `dpl_CrYtxjc98dWjzzrgYG1pUtGu4WzM`  
**Closeout:** [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./E3_8_W6_IMPLEMENTATION_CLOSEOUT.md)

```text
SSOT FOR CRITERIA     = docs/audits/E3_8_W6_MOBILE_CERT_PLAN.md
THIS DOCUMENT         = matrix + PASS/FAIL record + Owner-accepted closeout
W6.1–W6.3             = ACCEPTED
W6.4                  = PASS · OWNER-ACCEPTED EMULATED
W6.5                  = COMPLETE
W6 STATUS             = CLOSED / PASS
CERTIFICATION MODE    = OWNER-ACCEPTED EMULATED
OD-W6-03              = CLOSED / OWNER ACCEPTED
RECORDING W6 SECURITY = OUT (OD-W6-01)
LIVE RENDER / ARTIFACT= OUT (AR-W6-02 / AR-W6-03)
PRODUCTION E3         = DARK (verified Mix absent on Production)
PHYSICAL DEVICES      = UNAVAILABLE (documented limitation · not a release blocker after OD-W6-03)
```

**Do not duplicate acceptance prose here.** Measure against Design Freeze §§5–7.  
**Do not label results as physical iOS / physical Android PASS.**

---

## 1. Locked gates (read before any cert cell)

| Gate | Value |
|------|--------|
| Design Freeze | COMPLETE — [E3_8_W6_MOBILE_CERT_PLAN.md](./E3_8_W6_MOBILE_CERT_PLAN.md) |
| Arch Review | **PASS WITH FINDINGS** |
| Owner Implement GO | **GRANTED** |
| OD-W6-01 | **A** — OAD-05 mobile cert only · Recording historical W6 security **OUT** |
| OD-W6-02 | **A** — Preview Mix-only cert · Production flags **UNSET** |
| OD-W6-03 | **CLOSED / OWNER ACCEPTED** — emulated certification substitute for this release |
| AR-W6-01 | Server-resolved RSC `mixEnabled` prop (no `NEXT_PUBLIC_` for this gate) |
| AR-W6-02 | Preview = Mix-only · `E3_RENDER_JOBS_ENABLED` **OFF** · no jobs/worker/FFmpeg/artifacts |
| AR-W6-03 | Export cert = presentation + status + error UX · **not** live render |

---

## 2. Device / browser matrix (FROZEN · Owner-accepted execution mode)

### Viewports

| Viewport | Role | Formal |
|----------|------|--------|
| 360×800 | Phone | MUST |
| 390×844 | Phone | MUST |
| 412×915 | Phone | MUST |
| 768×1024 | Tablet | MUST |
| ≥1024 | Desktop regression (Chrome) | MUST |

### Browsers

| Browser | Role | Execution for this release |
|---------|------|----------------------------|
| iOS Safari | Mobile cert | **EMULATED** (Playwright WebKit) · Owner-accepted |
| Android Chrome | Mobile cert | **EMULATED** (Playwright Chromium + Android UA) · Owner-accepted |
| Desktop Chrome | Desktop regression | **REAL** Production URL @ ≥1024 |

---

## 3. W6.4 final status (Owner Verification · 2026-09-29)

| Item | Result |
|------|--------|
| **W6.4 STATUS** | **PASS** |
| **CERTIFICATION MODE** | **OWNER-ACCEPTED EMULATED** |
| iOS Safari (emulated WebKit) | **EMULATED PASS** @ 360/390/412/768 |
| Android Chrome (emulated Chromium + UA) | **EMULATED PASS** @ 360/390/412/768 |
| Desktop Chrome ≥1024 | **REAL / PASS** (Production DARK regression) |
| Horizontal overflow | **PASS** (emulated evidence · 0 overflow fails / 35 Chromium cells) |
| Primary CTA ≥44×44 | **PASS** (emulated evidence) |
| Playback smoke | **PASS** (emulated · Play/Pause/Mute/seek) |
| Mix presentation (Preview) | **PASS** (`mixEnabled\":true` · Preview deploy) |
| Mix gate | **PASS** (anon login-gate observed) |
| Export presentation (jobs-OFF) | **PASS** (presentation / error UX scope · **no** live render) |
| Production E3 flags DARK | **PASS** |
| Production render / artifacts | **NONE** |
| Physical iOS / Android | **NOT EXECUTED** (limitation · OD-W6-03 accepted substitute) |

Preview URL: `https://bitrymdym-pvy5p53ab-dawidthai125s-projects.vercel.app`  
Preview deploy: `dpl_CrYtxjc98dWjzzrgYG1pUtGu4WzM`  
Evidence: `docs/audits/_w64_evidence/`

---

## 4. Surfaces in scope

| Surface | In W6? | W6.4 result (Owner-accepted) | Notes |
|---------|--------|------------------------------|-------|
| `/` | YES | **EMULATED PASS** · Desktop REAL PASS | 5 vp Chromium |
| `/beats` | YES | **EMULATED PASS** · Desktop REAL PASS | |
| `/beat/[id]` | YES | **EMULATED PASS** (Chromium+WebKit) | Mix gate visible when Mix ON |
| Record CTA | YES | **EMULATED PASS** (≥44) | |
| Download CTA | YES | **EMULATED PASS** (≥44 on W6 tip) | Prod pre-W6 UI still small until ship |
| Auth / Account | YES | **EMULATED PASS** | |
| Mix (Basic) | YES Preview | **PASS** (presentation + gate) | Preview `mixEnabled=true` |
| Master chrome | YES Preview | **PASS** (presentation scope) | Full auth session optional · jobs OFF |
| Export presentation | YES Preview | **PASS** (jobs-OFF scope) | **No** live encode |
| Premium lock UX | YES Preview | **PASS** (presentation / lock copy) | |
| Admin desktop | OUT | — | |
| Recording historical W6 security | OUT | — | OD-W6-01 |

---

## 5. Cell legend

```text
PASS    = measured / observed OK for the stated MODE (EMULATED or REAL)
FAIL    = measured failure
BLOCKED = required env unavailable at time of attempt (historical rows may retain)
N/A     = not applicable on this env (e.g. Mix on Production DARK)
SKIP    = not executed yet
```

---

## 6. Shared surfaces matrix (OD-W6-03 · Owner-accepted emulated)

### 6.1 iOS Safari — EMULATED (Playwright WebKit) · OWNER-ACCEPTED

| Criterion | 360 | 390 | 412 | 768 | ≥1024 |
|-----------|-----|-----|-----|-----|-------|
| overflow-x `/beat/[id]` | PASS | PASS | PASS | PASS | N/A* |
| Play ≥44 / playback smoke | PASS | PASS | PASS | PASS | N/A* |
| SiteHeader usable | PASS | PASS | PASS | PASS | N/A* |

\*Desktop regression owned by §6.3 Desktop Chrome (REAL).

**MODE = EMULATED.** Not physical iOS Safari. Owner accepted this substitute (OD-W6-03).

### 6.2 Android Chrome — EMULATED (Chromium + Android UA) · OWNER-ACCEPTED

| Criterion | 360 | 390 | 412 | 768 | ≥1024 |
|-----------|-----|-----|-----|-----|-------|
| overflow-x shared surfaces | PASS | PASS | PASS | PASS | see §6.3 |
| Play / Record / Download / Auth ≥44 | PASS | PASS | PASS | PASS | see §6.3 |
| Playback play/pause/mute/seek | PASS | PASS | PASS | PASS | see §6.3 |
| SiteHeader usable | PASS | PASS | PASS | PASS | see §6.3 |

**MODE = EMULATED.** Not physical Android Chrome. Owner accepted this substitute (OD-W6-03).

### 6.3 Desktop Chrome regression (≥1024) — Production `17c4d530` · REAL

| Criterion | Result | Notes |
|-----------|--------|-------|
| Shared surfaces / browsing | **PASS** | `/` `/beats` `/beat/[id]` · overflow OK @1280 |
| No accidental Mix UI (Production DARK) | **PASS** | Mix absent on Production beat |
| Auth reachable | **PASS** | |

Evidence: Playwright Chromium on https://www.bitrymdym.pl · `docs/audits/_w64_evidence/prod_desktop.json`

---

## 7. Preview Mix / Master / Export

**Env:** Preview Mix-only · `E3_RENDER_JOBS_ENABLED` OFF (AR-W6-02 / AR-W6-03).

| Check | Result | Evidence |
|-------|--------|----------|
| Preview `mixEnabled\":true` | **PASS** | `preview_beat.html` via `vercel curl` |
| Mix gate (anon) | **PASS** | Login copy observed local + Preview |
| Export presentation / jobs-OFF | **PASS** | MixPanel jobs-OFF error UX · **no** live render |
| Interactive Preview in agent Chromium | Historical SSO wall | Does not overturn Owner-accepted matrix |
| Worker / FFmpeg / artifacts | **NONE** | Confirmed |

---

## 8. Production Dark (mandatory for W6 PASS)

| Check | Result | Notes |
|-------|--------|-------|
| `E3_RENDER_JOBS_ENABLED` UNSET | **PASS** | |
| `E3_MIX_ENABLED` UNSET | **PASS** | Mix UI absent on Production |
| `E3_PUBLIC_AUDIO` UNSET | **PASS** | |
| `E3_RENDER_WORKER_SECRET` UNSET | **PASS** | |
| Production render NOT EXECUTED | **PASS** | |
| Production artifact from W6 = NONE | **PASS** | |

---

## 9. Explicit OUT (do not certify as W6 scope)

```text
Recording historical W6 security leftovers
Live render / encode / worker / FFmpeg
New audio-artifacts from W6
Production E3 enablement
Public Free Audio ON
STEMS · payments · Premium catalog · new DSP
AuthZ / entitlement / Mix/Master/Export business logic changes
Admin desktop redesign
Native apps · full brand redesign
Physical-device execution (unavailable · Owner accepted emulated substitute)
```

---

## 10. Wave evidence log

| Wave | Status | Date | Notes |
|------|--------|------|-------|
| W6.1 | COMPLETE · **ACCEPTED** | 2026-09-29 | Checklist artifact |
| W6.2 | COMPLETE · **ACCEPTED** | 2026-09-29 | Shared mobile presentation |
| W6.3 | COMPLETE · **ACCEPTED** | 2026-09-29 | Mix/Master/Export presentation + RSC gate |
| W6.4 | **PASS** · **OWNER-ACCEPTED EMULATED** | 2026-09-29 | See §3 · §11–§13 |
| W6.5 | **COMPLETE** | 2026-09-29 | [E3_8_W6_IMPLEMENTATION_CLOSEOUT.md](./E3_8_W6_IMPLEMENTATION_CLOSEOUT.md) |

---

## 11. W6 PASS rollup (final)

```text
360×800              = EMULATED PASS (Owner-accepted)
390×844              = EMULATED PASS (Owner-accepted)
412×915              = EMULATED PASS (Owner-accepted)
768×1024             = EMULATED PASS (Owner-accepted)
desktop ≥1024        = REAL PASS (Production DARK regression)
iOS Safari           = EMULATED PASS (WebKit) · NOT physical
Android Chrome       = EMULATED PASS (Chromium+UA) · NOT physical
primary CTAs ≥44     = EMULATED PASS
overflow-x           = EMULATED PASS
playback mobile      = EMULATED PASS
Basic Mix Preview    = PASS (mixEnabled + gate)
Export presentation  = PASS (jobs-OFF scope · no live render)
Download presentation= EMULATED PASS (W6 tip)
Production Dark      = PASS

W6.4                 = PASS · OWNER-ACCEPTED EMULATED
W6 STATUS            = CLOSED / PASS
```

---

## 12. Evidence package (retained)

**MODE = EMULATED** for mobile automation.  
**Artifacts:** `docs/audits/_w64_evidence/` · `w64_emulated_results.json` · `w64_webkit_emulated_results.json` · screenshots · Preview HTML.

| Tool | Role |
|------|------|
| Playwright Chromium + Android UA | Android Chrome substitute · 35 cells |
| Playwright WebKit | iOS Safari-engine substitute · 4 beat viewports |
| Cursor Chromium + CDP metrics | Supporting overflow/CTA/playback |
| `vercel curl` Preview HTML | Mix gate / `mixEnabled` server-side |
| Playwright Chromium @ Production | Desktop ≥1024 REAL regression |

**OVERFLOW_FAILS=0 · TARGET_FINDINGS=0** (Chromium matrix).

---

## 13. Findings (post Owner Decision)

| ID | Severity | Fact | Status |
|----|----------|------|--------|
| **F-W64-01** | **INFO** (cleared as release blocker) | Physical iOS/Android unavailable | **SUPERSEDED** by OD-W6-03 Owner-accepted emulated substitute |
| **F-W64-02** | INFO | Preview Mix ON via deploy `-e/-b` | CLEARED for cert env |
| **F-W64-03** | INFO | Production app SHA still pre-W6 UI | Expected until separate ship/deploy GO |
| **F-W64-04** | INFO | Emulated matrix PASS | Now **Owner-accepted** certification basis |
| **F-W64-05** | INFO | Interactive Preview SSO in agent browser | Mitigated via vercel curl + local Mix ON |
| **F-W64-06** | INFO | Full Master/Export auth session optional | jobs-OFF presentation scope satisfied |
| **F-W64-07** | INFO | No adb/xcrun in agent env | Documented · not a release blocker after OD-W6-03 |

---

```text
W6.4 STATUS               = PASS
CERTIFICATION MODE        = OWNER-ACCEPTED EMULATED
W6 STATUS                 = CLOSED / PASS
Mobile cert prerequisite  = SATISFIED
PRODUCTION                = UNCHANGED · DARK · 17c4d530
PRODUCTION ENABLEMENT     = NOT EXECUTED
PUBLIC FREE AUDIO         = GATED
NEXT SESSION ENTRY        = OWNER DECISION / NEXT RELEASE STAGE
```
