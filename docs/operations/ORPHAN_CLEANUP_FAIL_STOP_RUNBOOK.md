# Orphan cleanup — fail-stop operator runbook (R3.1 / R4.1)

Standalone operational notes for `scripts/production-storage-orphan-cleanup.ts`.
This document does **not** authorize production mutation, deploy, or Catalog/Scratch work.

## Classification and protected prefixes

For objects under the `beat-audio` orphan flow:

| Path | Classification | Deletion |
|------|----------------|----------|
| `catalog/*` | `KEEP` | Never qualifies for delete |
| `platform/*` | `KEEP` | Never qualifies for delete |
| Unknown prefix | `UNKNOWN` | Never qualifies for delete |
| `user/*` | Only after real classification + gates | Prefix alone is **not** delete authority |

A `user/*` object must still pass the script’s classification rules and remove gates. Do not treat path shape as permission to delete.

## Re-classification before remove (R1)

A row labeled `SAFE_DELETE` (including a stale or forged label) is **not** final delete consent.

Immediately before remove, the delete phase re-runs classification on claimed `SAFE_DELETE` candidates. If the fresh result is not `SAFE_DELETE`, execution **aborts before** any `storageRemove` for that run’s remaining work.

This gate reduces forged-label bypass in the delete phase. It does **not** prove production Storage safety, deploy parity, or that every risk class is closed.

## Validation and bucket

- The full candidate list is validated (re-classify + pre-remove asserts / prefix gates) **before** the first `storageRemove`.
- Each batch is checked again with the pre-remove assert **before** that batch’s `storageRemove`.
- Removes are invoked only against bucket `beat-audio`.
- A batch failure does **not** authorize automatic retry, resume, or rollback of earlier `OK` batches.

## Batch statuses

| Status | Meaning |
|--------|---------|
| `OK` | The injected/production Storage client returned no error for that batch. This is **not** an independent verification that every object is gone from Storage. |
| `ERROR` | The client returned an error object for that batch. Objects in the batch may be fully deleted, partially deleted, or untouched — **unknown without a fresh inventory**. |
| `AMBIGUOUS` | The remove call threw or otherwise failed without a structured client error. Storage state for that batch is **unknown**. |

`storage_state_independently_verified` is always `false` in script reports.

## Fail-stop rules

1. After any `ERROR` or `AMBIGUOUS` batch (i.e. after a `storageRemove` attempt that failed or threw), the script **stops**. Later batches are **not** started. Earlier `OK` batches are **not** rolled back.
2. Evidence with `outcome: FAIL_STOP` and `orphan_cleanup_pass: false` is emitted when the run stops **after one or more `storageRemove` attempts** (API error or thrown failure). Do **not** treat that as PASS.
3. Aborts **before** any `storageRemove` (for example failed R1 re-classification or pre-remove validation) also **stop** the run and must **not** be treated as PASS. Those paths use the abort mechanism and **do not necessarily** emit the same `FAIL_STOP` evidence payload.
4. `ORPHAN CLEANUP PASS` / `outcome: PASS` is allowed **only** after all batches and required post-checks complete successfully.

Not every unsuccessful run emits `FAIL_STOP` evidence — only fail-stops tied to remove attempts as above.

## Operator prohibitions

- **No automatic retry** after `ERROR` or `AMBIGUOUS`.
- **Do not** treat a remove error as proof that nothing was deleted.
- **Do not** resume by blindly re-running the same path list without a new inventory and re-classification.
- **Do not** automatically expand the original delete scope when investigating a failed run.
- **No production `--execute` / Storage mutation** without a **separate Owner GO** for that mutation. The `--execute` flag remains **technically available** in the CLI; this runbook is procedural, not a technical lock.
- Re-classification (R1) and local safety tests are **not** proof that production Storage is safe or that a deploy matches this tip.

## Before any subsequent production attempt (only with Owner GO)

1. Treat Storage as possibly partially changed.
2. Perform a **fresh inventory** and classification under the approved process.
3. Obtain a **new, explicit Owner production-mutate GO** if another delete is required.
4. Limit scope to what that GO authorizes — do not fold in unrelated orphans “while you are there.”

## What this script does **not** provide

- Automatic resume / checkpoint restore
- Automatic retry
- Storage rollback
- Independent post-delete existence checks per object
- Technical enforcement of Owner GO (still a procedural control)
