# Architektura — status

**SSOT:** [MASTER SSOT v0.1](../ssot/MASTER_SSOT_v0.1.md)  
**Status:** oczekuje na decyzje stacku (OD-01, OD-02, OD-03)

---

## Co jest już ustalone w SSOT (nie wymaga ponownego „wymysłu”)

| Obszar | Ustalenie | SSOT |
|--------|-----------|------|
| Auth (preferencja) | Supabase Auth, o ile decyzja tego nie zmieni | §5 |
| Role | `ADMIN`, `MODERATOR`, `USER` | §3–4 |
| Poziom konta | osobny od roli; nazwy robocze | §4 |
| Uprawnienia | oddzielone od ról; role = zestawy permissions | §36 |
| Bit — max długość | 180 s, walidacja serwerowa | §7 |
| Bit — statusy | `DRAFT` → `PENDING_REVIEW` → `APPROVED` → `PUBLISHED` / `REJECTED` / `ARCHIVED` | §8 |
| BPM | wartość liczbowa | §6 |
| Storage audio | private; playback/download przez controlled access | §9 |
| Player | autorski komponent; bez `<audio controls>` jako UI | §10 |
| Pobieranie | signed URL + limity + audit | §12–13 |
| Quick Take | max 30 s (standard); retencja 24 h (zalogowany) | §18–21 |
| Premium Full Take | długość bitu ≤ 180 s; retencja 10 dni (konfigurowalna) | §22–23 |
| Feature flags płatności | wyłączone na start | §14–15 |
| Bezpieczeństwo | krytyczne reguły tylko po stronie serwera | §39 |

---

## Czego NIE zamrażamy tutaj

Dokładny stack FE/BE, szczegółowy schemat Supabase, kodowanie audio, watermarking, miksowanie — patrz [OPEN_DECISIONS.md](../decisions/OPEN_DECISIONS.md).

---

## Następny krok dokumentacyjny

Po decyzjach OD-01–OD-03 powstać powinien dokument:

```text
docs/architecture/SYSTEM_ARCHITECTURE.md
```

z opisem: warstw, granic zaufania, Storage buckets, flow Auth, oraz mapowania domeny na schemat danych.
