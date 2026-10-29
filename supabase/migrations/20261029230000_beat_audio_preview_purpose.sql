-- Guest 20 s beat preview (Owner 2026-10-29): guests never receive a signed
-- URL to the full beat file. Each beat gets a server-rendered MP3 preview
-- stored as a beat_audio_assets row with purpose PREVIEW, in the private
-- beat-audio bucket under the canonical key layout
--   platform/{beatId}/{assetId}/preview.bin
--   user/{ownerId}/{beatId}/{assetId}/preview.bin
-- (existing bucket/.bin/prefix triggers and RLS apply unchanged).
--
-- Additive only: one enum value. Existing rows, policies and the
-- one-active-per-(beat, purpose) index already cover PREVIEW. Rights triggers
-- only assert on MASTER, so PREVIEW rows never re-open the rights gate.
-- Rows are written by service_role (E3 worker / backfill script) only.

ALTER TYPE public.beat_audio_purpose ADD VALUE IF NOT EXISTS 'PREVIEW';
