# Orphan Cleanup — Phase 4 READ-ONLY Operational Plan

**Status:** PLAN ONLY — **does not authorize** production access  
**Date:** 2026-10-25  
**Related:** [ORPHAN_CLEANUP_INVENTORY_CLASSIFICATION_DESIGN.md](./ORPHAN_CLEANUP_INVENTORY_CLASSIFICATION_DESIGN.md), [ORPHAN_CLEANUP_INV_CLASS_API_SPIKE.md](./ORPHAN_CLEANUP_INV_CLASS_API_SPIKE.md), [ORPHAN_CLEANUP_FAIL_STOP_RUNBOOK.md](./ORPHAN_CLEANUP_FAIL_STOP_RUNBOOK.md)

This plan prepares a **future**, Owner-gated production **read-only** audit.  
It does **not** run against production. It does **not** authorize `--execute` or `storage.remove`.

---

## 1. Cel i granice

| Dozwolone po osobnym Owner GO | Zabronione |
|------------------------------|------------|
| Listowanie Storage `beat-audio` (read-only) przez injected `listPage` | `--execute`, `storage.remove`, mutacje DB |
| Exact-count / paginated select na tabelach classify | Masowy download masterów audio |
| Redacted classify report | Domyślny dump raw `object_path` |
| Weryfikacja live `max_rows` / Storage page ceiling | Claim `snapshot_consistent=true` bez dowodu |

**Abort:** każdy błąd listingu, timeout, brak `items`, duplikat, mismatch count, `diagnostic_only` → stop; nie oznaczać run complete.

---

## 2. Środowisko, bucket, prefixy

| Pole | Wartość |
|------|---------|
| Bucket | `beat-audio` only |
| Prefix scope | recursive BFS: `user` / `platform` / `catalog` / other |
| `environment_id` | niesekretna etykieta środowiska (nie connection string) |
| Inventory schema | `orphan-inv-v1` |

---

## 3. Uprawnienia minimalne

- Service-role (lub równoważne) **tylko** na czas procesu RO: Storage `list`, DB `select` + `count=exact` na: `beat_audio_assets`, `beats`, `takes`, `studio_clips`, `studio_projects`, `audio_artifacts`.
- Brak uprawnień mutate w zakresie tego GO.
- Credentials: wyłącznie lokalne env; nigdy w raporcie, logu ani artefakcie.

---

## 4. Ochrona credentials i PII

- Nie commitować `.env` / inventory z pełnymi ścieżkami.
- Domyślny artefakt classify: **redacted** (digesty, flagi, liczniki).
- Inventory z raw paths: Owner-gated; retencja i dostęp — §8.
- Logi CLI: bez raw paths (redakcja batch/evidence już w tipie).

---

## 5. Weryfikacja limitów API (w ramach przyszłego GO RO)

Przed claimem kompletności w tym GO Owner musi uzyskać dowód dla **tego** projektu:

1. Storage: faktyczny max `limit` / zachowanie offset + `sortBy=name:asc`.
2. PostgREST: live `max_rows` (CLI używa page size 500 — nadal do potwierdzenia względem hosta).
3. Czy skala bucketa wymaga RPC `list_objects` (spike: NOT VERIFIED).

Publiczne docs / lokalne mocki **nie** zastępują tej weryfikacji.

---

## 6. Walidacja inventory i DB

| Gate | Wymaganie |
|------|-----------|
| Inventory | `parseAndAssertInventoryForFinalClassify` — `complete`, nie `diagnostic_only`, digest OK |
| DB | `db_read_complete` ∧ `count_complete` ∧ `pages_consistent` |
| Snapshot | `snapshot_consistent=false` — **jawne**; nie twierdzić inaczej |
| SAFE_DELETE | tylko gdy `actionable_gates_pass`; lokalny label ≠ GO mutate |

Dostarczanie inventory do CLI (bez publishera):

- `--inventory-path <file>` **lub**
- `--inventory-stdin` **lub**
- domyślna ścieżka audits (Owner-gated export poza eksporterem memory-only).

Eksporter lokalny pozostaje memory-only; atomowy publisher = **osobny GO**.

---

## 7. Polityka redakcji

- Operator: redacted report + summary bez `object_path` / `paths`.
- Raport musi zawierać: `snapshot_consistent: false`, `count_complete`, `pages_consistent`, `actionable_gates_pass`.
- Raw inventory: osobna klasa artefaktu (§C.3 Design Freeze).

---

## 8. Retencja lokalnych artefaktów

| Artefakt | Retencja (propozycja do zatwierdzenia w GO RO) |
|----------|-----------------------------------------------|
| Redacted classify JSON | TTL krótkie (np. 7–30 dni); brak sekretów |
| Raw inventory (jeśli w ogóle) | Minimalne TTL; dostęp tylko Owner; nie w git |
| Evidence mutate | poza Phase 4 — patrz fail-stop runbook |

---

## 9. Kryteria abortu

Abort natychmiast gdy:

- timeout / throw `listPage` lub DB page/count;
- brak `items` / zły rekord / duplikat / full page zero new keys;
- `count === null` / mismatch / `duplicate_pk` / `count_drift`;
- inventory nie przechodzi assert;
- nieoczekiwany limit API (krótka strona przy niesprawdzonym cap — traktować jako niepewność → abort claim complete).

---

## 10. Oczekiwany format raportu RO

Redacted JSON + krótki raport operatorski po polsku:

- środowisko / bucket / pages / object counts by kind;
- flagi kompletności (w tym `snapshot_consistent: false`);
- limity API: VERIFIED / NOT VERIFIED z dowodem;
- brak raw paths;
- werdykt: `RO PASS` / `RO CONDITIONAL` / `RO ABORT` — **nie** PRODUCTION GREEN.

---

## 11. Osobny przegląd wyników

Po zakończeniu RO:

1. Niezależny przegląd redacted report (Security / Owner).  
2. **Osobna** decyzja: kolejny GO (świeższy inventory / mutate) albo stop.  
3. Phase 4 **nigdy** nie implikuje Phase 5 (`--execute`).

---

## 12. Kryteria rozważenia następnego etapu

Dopiero gdy jednocześnie:

- RO raport bez abortu;
- limity API VERIFIED dla tego projektu;
- inventory `complete` + consumer assert OK;
- DB gates OK przy jawnym `snapshot_consistent=false` i świadomej akceptacji ryzyka concurrent;
- Owner podpisuje **osobne** GO mutate z liczbą kandydatów i listą kontrolowaną.

Bez tego — stop.

---

## Potwierdzenie

Ten dokument **nie** jest Owner GO na produkcję.  
Uruchomienie Phase 4 wymaga **jawnej, osobnej** zgody Ownera po zapoznaniu się z tym planem.
