# Architektura — status

**SSOT (produkt):** [MASTER SSOT v0.1](../ssot/MASTER_SSOT_v0.1.md)  
**Architektura (technika):** [SYSTEM_ARCHITECTURE.md](./SYSTEM_ARCHITECTURE.md)  
**Status:** BASELINE ACCEPTED — OD-01 / OD-02 / OD-03 CLOSED (2026-09-25)

---

## Baseline techniczny (zatwierdzony)

| Warstwa | Decyzja |
|---------|---------|
| Frontend | Next.js, TypeScript, Tailwind, shadcn/ui (baza), własny Design System, App Router — **OD-01** |
| Application server | Next.js Server Actions / Route Handlers — **OD-02** |
| Infrastruktura | Supabase: PostgreSQL, Auth, RLS, Storage; Edge Functions gdy potrzebne — **OD-03** |

---

## Co jest już ustalone w SSOT (domena)

| Obszar | Ustalenie | SSOT |
|--------|-----------|------|
| Auth | Supabase Auth (OD-03) | §5 |
| Role | `ADMIN`, `MODERATOR`, `USER` | §3–4 |
| Poziom konta | osobny od roli; nazwy robocze (OD-09 OPEN) | §4 |
| Uprawnienia | oddzielone od ról; role = zestawy permissions | §36 |
| Bit — max długość | 180 s, walidacja serwerowa | §7 |
| Bit — statusy | `DRAFT` … `ARCHIVED` | §8 |
| BPM | wartość liczbowa | §6 |
| Storage audio | private; playback/download; signed URLs | §9 |
| Player | autorski; bez `<audio controls>` jako UI | §10 |
| Pobieranie | signed URL + limity + audit | §12–13 |
| Quick Take | max 30 s; retencja 24 h (zalogowany) | §18–21 |
| Premium Full Take | ≤ długość bitu ≤ 180 s; retencja 10 dni (konfig) | §22–23 |
| Feature flags płatności | wyłączone na start | §14–15 |
| Bezpieczeństwo | krytyczne reguły tylko po stronie serwera | §39 |

---

## Nadal OPEN (nie zamrażać)

Codec, watermark, mix, limity liczbowe, payments, visual identity itd. — [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md) (OD-04–OD-18).

---

## Application implementation

**Phase 1.2** scaffold LOCKED. **Phase 1.3** Auth LOCKED. **Phase 1.4** beats metadata IMPLEMENTED / LIVE VERIFIED (Owner Review).  
See [APPLICATION_SCAFFOLD.md](./APPLICATION_SCAFFOLD.md), [AUTHORIZATION.md](./AUTHORIZATION.md), [BEATS.md](./BEATS.md).
