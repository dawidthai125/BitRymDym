-- Account deletion fix: studio_clips.source_take_id / source_artifact_id were
-- ON DELETE SET NULL, which can never satisfy studio_clips_source_xor_chk
-- (a TAKE/ARTIFACT clip must keep its source id) → hard-deleting a take or
-- artifact used on the timeline failed with 23514 (check_violation).
-- A clip without its source audio is meaningless: cascade instead.
-- Owner-facing take deletion is a soft delete (status DELETED) and is unaffected.
BEGIN;

ALTER TABLE public.studio_clips
  DROP CONSTRAINT IF EXISTS studio_clips_source_take_id_fkey,
  ADD CONSTRAINT studio_clips_source_take_id_fkey
    FOREIGN KEY (source_take_id) REFERENCES public.takes (id) ON DELETE CASCADE;

ALTER TABLE public.studio_clips
  DROP CONSTRAINT IF EXISTS studio_clips_source_artifact_id_fkey,
  ADD CONSTRAINT studio_clips_source_artifact_id_fkey
    FOREIGN KEY (source_artifact_id) REFERENCES public.audio_artifacts (id) ON DELETE CASCADE;

COMMIT;
