# Orphan cleanup — fail-stop operator runbook (R3.1)

Standalone operational notes for `scripts/production-storage-orphan-cleanup.ts`.
This document does **not** authorize production mutation, deploy, or Catalog/Scratch work.

## Batch statuses

| Status | Meaning |
|--------|---------|
| `OK` | The injected/production Storage client returned no error for that batch. This is **not** an independent verification that every object is gone from Storage. |
| `ERROR` | The client returned an error object for that batch. Objects in the batch may be fully deleted, partially deleted, or untouched — **unknown without a fresh inventory**. |
| `AMBIGUOUS` | The remove call threw or otherwise failed without a structured client error. Storage state for that batch is **unknown**. |

`storage_state_independently_verified` is always `false` in script reports.

## Fail-stop rules

1. After any `ERROR` or `AMBIGUOUS` batch, the script **stops**. Later batches are **not** started.
2. Earlier `OK` batches are **not** rolled back by this script.
3. Full success prints `ORPHAN CLEANUP PASS` only after all batches and post-checks complete.
4. Partial / failed runs emit `outcome: FAIL_STOP` and `orphan_cleanup_pass: false`. Do **not** treat them as PASS.

## Operator prohibitions

- **No automatic retry** after `ERROR` or `AMBIGUOUS`.
- **Do not** treat a remove error as proof that nothing was deleted.
- **Do not** resume by blindly re-running the same path list without a new inventory and re-classification.
- **Do not** automatically expand the original delete scope when investigating a failed run.
- **No production `--execute` / Storage mutation** without a **separate Owner GO** for that mutation.
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
