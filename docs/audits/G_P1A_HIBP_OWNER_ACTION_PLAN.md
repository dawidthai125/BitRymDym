# G — P1-A HIBP — OWNER ACTION PLAN

**Type:** Owner operations plan (not a code wave)
**Date:** 2026-10-02
**Wave:** G (sequence position 2)
**Owner decision:** **OWNER ACTION**
**Status:** READY FOR OWNER DASHBOARD · Cursor **must not** mutate Auth/ENV/Supabase config

```text
P1-A HIBP                  = BLOCKED until Owner enables
SEVERITY (known)           = MEDIUM residual
SECURITY OVERALL           = GREEN WITH WARNINGS
CURSOR MUTATIONS           = FORBIDDEN for this wave
```

Parent lock: [NEXT_WAVE_OWNER_DECISIONS_2026-10-02.md](./NEXT_WAVE_OWNER_DECISIONS_2026-10-02.md)

---

## 1. Purpose

Enable **HaveIBeenPwned / leaked-password protection** in Supabase Auth via **Owner Dashboard only**, then verify Security Advisor.

This is **not** an application code wave. No repo commit required for the enablement itself.

---

## 2. Non-goals (hard)

- Cursor must **not** change Supabase settings
- Cursor must **not** change ENV / Vercel / Auth code
- Cursor must **not** change RLS / Storage / workers
- No feature UI work under G

---

## 3. Owner action checklist

| Step | Actor | Action | Evidence |
|------|-------|--------|----------|
| 1 | Owner | Supabase Dashboard → Auth → enable leaked password / HIBP protection | Screenshot or Advisor before/after |
| 2 | Owner or agent (read-only) | Re-run **Security Advisor** | Advisor finding for HIBP cleared / PASS |
| 3 | Docs (optional docs GO) | Update PROJECT_STATE: P1-A = CLOSED / VERIFIED | Living SSOT |
| 4 | Closeout | Record P1-A CLOSED in security continuity notes | Audit note |

---

## 4. Acceptance criteria

| ID | Criterion |
|----|-----------|
| G-AC-01 | HIBP / leaked-password protection **enabled** in Production project `rzzxrgcdogkybkiidqgw` |
| G-AC-02 | Security Advisor no longer flags HIBP disabled as open WARN for this item |
| G-AC-03 | No application code / ENV / RLS changes introduced for this wave |
| G-AC-04 | Living docs updated only after evidence (docs GO or closeout) |

---

## 5. Risk · Rollback

| Risk | Level | Notes |
|------|-------|-------|
| Signup friction for known-breached passwords | LOW–MED | Intended security behavior |
| Misconfiguration | LOW | Owner-only Dashboard |

**Rollback:** Owner disables HIBP in Dashboard (ops only).

---

## 6. Gate

```text
OWNER DASHBOARD ACTION → SECURITY ADVISOR VERIFY → (optional docs) CLOSE P1-A
```

**No Design Freeze for code.** No Implementation GO for Cursor.
