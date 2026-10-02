# STORAGE-ARCH-02 — FUTURE STORAGE SCALABILITY

**Type:** Architecture documentation (strategy only)
**Date:** 2026-10-02
**Owner GO:** **DOCS-ONLY**
**Status:** **DOCS PREPARED** · **NOT IMPLEMENTED** · **NO CURRENT INVESTMENT**

```text
STATUS                       = FUTURE / NOT IMPLEMENTED / NO CURRENT INVESTMENT
CURRENT DURABLE STORAGE      = SUPABASE STORAGE (PRIMARY · UNCHANGED)
EXTERNAL OBJECT STORAGE      = OPTIONAL · FUTURE · NOT SELECTED · NOT PROVISIONED
IMPLEMENTATION               = NOT STARTED
DUAL-READ (provider)         = NOT IMPLEMENTED
MIGRATION                    = NOT STARTED
PRODUCTION                   = UNCHANGED
SUPABASE PLAN                = Free (no paid storage upgrade under this GO)
CONTABO                      = COMPUTE / EPHEMERAL ONLY (NOT durable library)
D02 / RECORDING MODEL        = UNCHANGED
```

Parent lock: [STORAGE_ARCH_01_DESIGN_FREEZE.md](../audits/STORAGE_ARCH_01_DESIGN_FREEZE.md)
Living state: [PROJECT_STATE.md](../PROJECT_STATE.md) · [MASTER_HANDOFF.md](../MASTER_HANDOFF.md)

---

## 1. Purpose

Zapisać **przyszłą** strategię skalowania durable storage tak, aby BitRymDym mógł — gdy Supabase Storage zbliży się do realnego limitu — dołączyć **opcjonalny zewnętrzny Object Storage** (np. Cloudflare R2, S3-compatible lub inny provider wybrany później przez Ownera) **bez** przebudowy całej aplikacji i **bez** migracji big-bang.

To **nie** jest implementacja. To **nie** jest zakup. To **nie** jest wybór providera.

---

## 2. Current architecture — LOCKED (do not change)

```text
Vercel (Next.js / App / AuthZ / signed URL issuance)
        ↓
Supabase Auth + PostgreSQL + Storage   ← durable media PRIMARY
        ↓
Contabo E3 Worker                      ← compute / ephemeral only
```

### Current durable buckets (UNCHANGED)

| Bucket | Role |
|--------|------|
| `beat-audio` | Beat MASTER / source (PRIVATE) |
| `take-audio` | Recordings / takes (PRIVATE) |
| `audio-artifacts` | E3 Mix / Render exports (PRIVATE) |

### Contabo role (UNCHANGED)

| Contabo IS | Contabo is NOT |
|------------|----------------|
| Compute | Durable media library |
| Ephemeral processing | Audio SSOT |
| E3 Mix / Master / Render / Export workspace | Long-term BitRymDym archive |

Worker **może** w przyszłości: pobrać asset → przetworzyć w lokalnym ephemeral workspace → wysłać wynik do **durable** storage (Supabase lub przyszły external).
Worker **nie** staje się biblioteką muzyczną.

### Current investment posture

- Supabase pozostaje na obecnym planie Free.
- Wykorzystanie Storage jest niewielkie względem limitu.
- Owner **nie** chce teraz: kupować storage, R2, S3, nowych bucketów, migracji plików, zmian DB/ENV/VPS/produkcji.

---

## 3. Future Storage Strategy

```text
┌─────────────────────────────────────┐
│  Supabase Storage                   │
│  CURRENT / PRIMARY durable store    │
│  beat-audio · take-audio ·          │
│  audio-artifacts                    │
└─────────────────────────────────────┘
                 │
                 │  FUTURE / OPTIONAL (only after separate Owner GO)
                 ▼
┌─────────────────────────────────────┐
│  External Object Storage            │
│  FUTURE / OPTIONAL                  │
│  provider NOT CHOSEN                │
│  NOT IMPLEMENTED                    │
│  NO CURRENT INVESTMENT              │
└─────────────────────────────────────┘
```

**Zasada:**

1. **Supabase Storage pozostaje obecnym primary durable storage.**
2. W przyszłości **może** zostać dołączony drugi Object Storage Provider.
3. Provider **nie** jest wybierany w tym dokumencie.
4. Nie tworzymy kont, credentials, bucketów ani integracji teraz.

Przykładowi **przyszli** kandydaci (nie decyzja):

- Cloudflare R2
- S3-compatible storage
- inny Object Storage wybrany przez Ownera po osobnym audycie koszt/security/migracji

---

## 4. Future storage abstraction (DESIGN ONLY)

```text
FUTURE DESIGN — NOT IMPLEMENTED
```

Logika biznesowa **nie powinna** być trwale związana z jednym providerem storage.

Docelowo aplikacja powinna operować na **logicznym** odwołaniu do assetu, np.:

| Field | Meaning |
|-------|---------|
| `provider` | `supabase` (current) · future: `external` / provider id |
| `bucket` / container | e.g. `beat-audio` |
| `object_key` | path within bucket |
| `asset_type` | beat master · take · artifact · … |

Przykład koncepcyjny (nie schema):

```text
provider   = supabase
bucket     = beat-audio
object_key = user/<uid>/<beatId>/master/<assetId>.bin

# FUTURE example only:
provider   = external
bucket     = <future-container>
object_key = ...
```

**Zakaz teraz:**

- NIE tworzyć tabel / migracji / typów
- NIE tworzyć adapterów / `StorageRouter` / `StorageProvider`
- NIE tworzyć API dual-read
- NIE pisać, że abstrakcja jest wdrożona

---

## 5. Future dual-read (provider-level)

```text
FUTURE — NOT IMPLEMENTED
```

Zachowana strategia etapowa (zgodnie z STORAGE-ARCH-01 / OD-SA-02 duchem staged migration):

```text
dual-read
  → inventory
  → staged migration
  → verification
  → cleanup
```

Przyszły model odczytu (gdy Provider GO + Implementation GO):

```text
READ preferred provider (e.g. external)
        ↓  miss / error policy TBD at implementation freeze
FALLBACK legacy provider (Supabase Storage)
```

**NIE implementować tego teraz.**
**NIE mylić** z wewnętrznym dual-read kluczy legacy→canonical wewnątrz Supabase (OD-SA-02 / FAR-01) — to osobna fala implementacyjna; patrz §9.

---

## 6. Future migration (staged — never big-bang)

```text
FUTURE — NOT STARTED
```

**Zakazany model:**

```text
Supabase FULL → BIG-BANG MIGRATION → wyłączenie starego storage
```

**Preferowany model:**

```text
Inventory
  → wybór assetów / batch
  → copy / migration batch
  → verification
  → dual-read (provider)
  → monitoring
  → kolejne batche
  → final verification
  → dopiero wtedy ewentualny cleanup legacy
```

Wymagania:

- migracja **stoppable / resumable**
- każdy batch z weryfikacją
- cleanup legacy **tylko** po osobnym Owner GO

---

## 7. When to start a real STORAGE-ARCH-02 implementation audit

**Obecnie nie ma potrzeby** wdrażania dodatkowego storage.

Przyszły audit implementacyjny / provider selection powinien wystartować dopiero przy **realnej potrzebie**, np.:

- Supabase Storage zbliża się do limitu planu
- szybki wzrost biblioteki / UGC audio
- egress staje się istotnym ograniczeniem
- potrzeby biznesowe wymagają większej przestrzeni
- koszty obecnego modelu przestają być optymalne

### Future consideration (NOT a frozen business limit)

Można rozważyć monitoring (progi %, alerty, dashboard usage) — **tylko jako FUTURE CONSIDERATION**.
**Nie** zamrażamy arbitralnego progu procentowego jako obowiązującej decyzji biznesowej bez osobnego Owner GO.

---

## 8. Cost / provider neutrality

Przyszły provider wybierany **dopiero** po osobnym audycie obejmującym m.in.:

- storage cost · egress · request cost
- durability · availability
- security · signed URLs · AuthZ compatibility z obecnym modelem
- lifecycle · backup
- migration complexity
- compatibility z E3 Worker (download → process → upload to durable)

**Nie wybierać teraz R2 ani S3 jako decyzji architektonicznej.**

---

## 9. Naming / scope boundary vs STORAGE-ARCH-01 waves

| Item | Status |
|------|--------|
| **STORAGE-ARCH-01** | **LOCKED** — Hybrid C · Supabase = sole durable V1 |
| **STORAGE-ARCH-02** (this doc) | **FUTURE SCALABILITY** — docs only · external Object Storage optional |
| OD-SA-02 / FAR-01 dual-read **keys** (legacy→canonical **inside** Supabase) | **NOT STARTED** — osobna fala implementacyjna; **nie** jest tym GO |
| STORAGE-ARCH-03+ (janitor, orphan, backup, …) | Unchanged planning rows in Storage V1 freeze |

Ten dokument **nie** zmienia modelu D02 / recording (TTL, caps, take identity, AuthZ, expiry, raw token policy).

---

## 10. Hard non-goals (this GO)

- Kod aplikacji · DB · migracje · RLS · Auth
- Nowe buckety · R2 · S3 · credentials · ENV
- VPS jako durable library · worker enablement · DNS · Vercel · deploy
- Migracja plików · dual-read · cleanup · D02 changes

---

## 11. Acceptance (docs-only)

- [x] Current = Supabase primary durable (unchanged)
- [x] Contabo = compute / ephemeral (unchanged)
- [x] Future optional external Object Storage documented
- [x] Marked **FUTURE / NOT IMPLEMENTED / NO CURRENT INVESTMENT**
- [x] Dual-read + staged migration described as future only
- [x] Provider neutrality preserved
- [x] Trigger conditions documented without frozen % threshold
- [x] No implementation / production / env / VPS changes

---

## Document control

| Field | Value |
|-------|-------|
| Canonical path | `docs/architecture/STORAGE_ARCH_02_FUTURE_SCALABILITY.md` |
| Prior E stub | [E_STORAGE_ARCH_02_AUDIT_PLAN.md](../audits/E_STORAGE_ARCH_02_AUDIT_PLAN.md) — redirected to this strategy |
| Supersedes | Dual-read-only interpretation of “STORAGE-ARCH-02” as the **sole** meaning of Wave 02 — Wave 02 now means **future scalability docs**; key dual-read remains OD-SA-02 deferred |
| Commit / push | **NOT DONE** under this GO — await separate Owner GO |
