-- Beats duration max: 180 → 210 (APP SSOT already BEAT_DURATION_MAX = 210).
-- Does NOT change takes / RECORDING_GLOBAL_MAX_SECONDS = 180.

ALTER TABLE public.beats
  DROP CONSTRAINT beats_duration_range_chk;

ALTER TABLE public.beats
  ADD CONSTRAINT beats_duration_range_chk
  CHECK (duration_seconds BETWEEN 1 AND 210);
