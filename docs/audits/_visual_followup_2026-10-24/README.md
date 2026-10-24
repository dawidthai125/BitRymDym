# Visual follow-up evidence — 2026-10-24 (corrected)

Parent: `d622389` · local `next dev` `http://localhost:3456` · capture: Playwright Chromium (`_capture-clean.mjs`) · audio muted · play not pressed · Next.js DevTools CSS-hidden.

## Canonical screenshots (PNG IHDR verified)

| File | IHDR | Status |
|------|------|--------|
| `clean-home-desktop-1280x800.png` | **1280×800** | **PASS** |
| `clean-beats-desktop-1280x800.png` | **1280×800** | **PASS** |
| `clean-home-mobile-390x844.png` | **390×844** | **PASS** |
| `clean-beats-mobile-390x844.png` | **390×844** | **PASS** |
| `clean-studio-auth-gate-desktop-1280x800.png` | **1280×800** | auth redirect → `/sign-in` (no logged-in Studio) |
| `clean-studio-auth-gate-mobile-390x844.png` | **390×844** | auth redirect → `/sign-in` (no logged-in Studio) |

## Studio / takes behind login

**NOT VERIFIED** — no local authorized session in this capture. Auth-gate PNGs only prove redirect to sign-in, not control-room chrome.

## Prior Cursor-browser captures (superseded)

Earlier `followup-*.png` files were **489×698** (embedded browser panel), despite filenames claiming 1280 / 390. They also could include DevTools overlays. Those files were **removed** so they are not mistaken for viewport proof. Treat any claim based on them as **NOT VERIFIED**.

## Contrast (unchanged from follow-up; measured in code)

Control-room paper `#161918` · scoped REC `#db5a5a` ≈ **4.74:1** AA PASS · public REC `#9a2f2f` unchanged.

## Seam / chrome

No chrome theme change in this evidence pass. Paper SiteHeader over graphite main remains intentional brand frame (product decision from prior follow-up).

## Reproduce

```bash
# with local next on :3456
node docs/audits/_visual_followup_2026-10-24/_capture-clean.mjs
```
