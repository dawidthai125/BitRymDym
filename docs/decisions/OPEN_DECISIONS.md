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

Freeze: [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md).
W2 contract: [W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md](./W2_PREMIUM_FOUNDATION_DESIGN_CONTRACT.md).

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

---

## Uwagi implementacyjne (bez zamrażania wartości OPEN)

- Limity pobrań muszą być **konfigurowalne** (`anonymous_daily_download_limit`, `user_daily_download_limit`, `premium_daily_download_limit`) — nie hardcodowane (§13). Wartości startowe Phase 1.8A: **OD-05 = 2**, **OD-06 = 4**, **OD-17 = signed-URL issuance** (CLOSED interim); config SSOT: `src/config/downloads.ts`. Premium limit nadal później.
- Feature flags płatności startują jako **wyłączone** (§14–15).
- **Supabase Auth jest zatwierdzone** (OD-03 CLOSED) — nie traktować już jako „preferencji roboczej”.
- Signup default: `role = USER`, `account_level = BEGINNER_RAPPER` (**OD-19 CLOSED**).
- First ADMIN: manual / operator-controlled only — **no** auto first-user admin (**OD-20 CLOSED**).
- Community upload: EPIC **COMPLETE / LOCKED** @ `c5e1f17` — OD-COMMUNITY-01…05 **CLOSED**. See [PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md](../phases/PHASE_COMMUNITY_UPLOAD_DESIGN_FREEZE.md).
- Recording / Quick Take: Design Freeze **LOCKED** — OD-REC-01…08 **CLOSED**. Implementation awaits separate Wave 1 Owner GO. See [PHASE_RECORDING_DESIGN_FREEZE.md](../phases/PHASE_RECORDING_DESIGN_FREEZE.md).
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
- Production app: `6ee3255` · deploy `dpl_AdF29uH9eJ9xUNhuqD6rYKTZZg9a` Ready.
- Production DB: remote `20261003221811` / `w2a_premium_tier_foundation` · local file `20261003230000_…` · `premium_entitlements` = 0 rows.
- **W2-B** = **PREMIUM ENFORCEMENT** · **IMPLEMENTATION COMPLETE / OWNER REVIEW PASS WITH FINDINGS** · commit/deploy/fixtures **NOT DONE** · [implementation](../audits/CREATOR_PROGRESS_W2B_IMPLEMENTATION.md).
- W2-B code: download tier cutover (ANON=2 · FREE=4 · BRONZE=10 · SILVER=25 · GOLD=50) · P2-1 cleanup · Mix/Render/download regression lock · fixture contract (non-mutating).
- Download runtime SSOT (after deploy): ANON = `PREMIUM_ANON_DOWNLOADS_DAILY`; USER = `entitlement.limits.downloadsDaily`. Legacy `DOWNLOAD_LIMIT_ANON_DAILY` / `USER_DAILY_DOWNLOAD_LIMIT` = unused / FREE mirror (not reserve authority). MODERATOR uses USER download limits (**intentional**).
- Production still pre-deploy flat ANON=2 / USER=4 until commit + deploy GO.
- **OD-04** / **OD-07** remain **OPEN**. Billing deferred.
- **Recording Premium overlay numbers** remain **OPEN / DEFERRED**.
- **Gold 90d** = **DESIGN ONLY**.
- **P2-1** = **VERIFIED RESOLVED** (Owner Implementation Review).
- **P2-2** = **OPEN** (live RLS/IDOR exercise not performed).
- **P2-3** = **OPEN** (manual migration idempotency not verified).
- **P2-4** = **OPEN** (known MCP production migration version drift).
- Historical foundation-contract “W2-D downloads” naming is not rewritten; current Owner gate name = **W2-B PREMIUM ENFORCEMENT**.
- **NEXT GATE** = W2-B DOCUMENTATION COMMIT/PUSH · then deploy · Fixture GO.

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
