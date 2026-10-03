# USER-CLEANUP-01 — Pre-delete Snapshot

**Date:** 2026-10-03  
**Repo HEAD:** `4e33e8d9198dde8985a24d0022699ad8d0cf7009`  
**DB tip (pre):** `20261003051539` / `def01_e3_definer_execute_revoke`  
**Mutations at snapshot time:** none yet  

## Allowlist

- Count: **93**
- SHA256 (newline-joined UUID list, plan order): `bb7fb599e049ea09f54e5b41e68457cc7303394e0d499b77874efed7afe984e4`
- Intersection with KEEP (Dawid, Tajski): **EMPTY**

## Global counts

| Metric | Value |
|--------|------:|
| auth.users | 95 |
| profiles | 95 |
| beats | 90 |
| platform beats | 3 |
| takes | 115 |
| beat_audio_assets | 81 |
| audio_artifacts | 0 |
| mix_sessions | 1 |
| render_jobs | 1 |
| premium_entitlements | 0 |
| beat_access_grants | 3 |
| download_events | 2 |
| download_reservations | 0 |
| storage beat-audio | 180 |
| storage take-audio | 19 |
| storage audio-artifacts | 0 |
| anon take-audio objects | 12 |
| orphan UUID storage paths | 31 |

## KEEP baselines

| Who | UUID | beats | takes | assets | mix | render | storage |
|-----|------|------:|------:|-------:|----:|-------:|--------:|
| Dawid | `fdf04726-e971-42a7-9d46-8b9bdd099c23` | 0 | 4 | 3 | 1 | 1 | 1 |
| Tajski | `3daabc23-3c98-4f30-a60a-c73c2ee3b26a` | 0 | 0 | 0 | 0 | 0 | 0 |

## KEEP FK note (cleanup unblocker)

Dawid has 4 takes + 1 mix_session referencing fixture-owned beats; 101 anon takes also reference fixture beats (`ON DELETE RESTRICT`).  
Cleanup will **repoint** those `beat_id` values to platform beat `9af764b9-35ed-45ac-9e32-9befbfe2aa2c` before deleting fixture beats.  
Row counts for Dawid takes/mix/render/storage must remain; `beat_id` on those rows will change (documented exception).

## DELETE allowlist totals (pre)

| Metric | Value |
|--------|------:|
| users | 93 |
| beats owned | 87 |
| takes owned | 10 |
| assets created_by | 78 |
| grants | 3 |
| storage user-path objects | 152 |
