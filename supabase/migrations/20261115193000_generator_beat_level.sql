-- Peak and average level for admin Bitek. Not an instrument list.
ALTER TABLE public.beats
  ADD COLUMN generator_peak_db numeric,
  ADD COLUMN generator_rms_db numeric;

ALTER TABLE public.beats
  ADD CONSTRAINT beats_generator_peak_db_chk
  CHECK (
    generator_peak_db IS NULL
    OR (generator_peak_db >= -120 AND generator_peak_db <= 0)
  );

ALTER TABLE public.beats
  ADD CONSTRAINT beats_generator_rms_db_chk
  CHECK (
    generator_rms_db IS NULL
    OR (generator_rms_db >= -120 AND generator_rms_db <= 0)
  );
