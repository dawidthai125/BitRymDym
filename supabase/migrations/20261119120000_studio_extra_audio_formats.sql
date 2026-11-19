-- Extra Studio delivery formats: FLAC 24-bit, AIFF 24-bit, WAV 32-bit float.
-- Additive only: both CHECK constraints are replaced by the same list plus the three new values.

alter table public.studio_master_jobs drop constraint if exists studio_master_jobs_output_format_check;
alter table public.studio_master_jobs add constraint studio_master_jobs_output_format_check
  check (output_format in ('WAV_FLOAT', 'WAV_24', 'FLAC_24', 'AIFF_24', 'WAV_32F', 'MP3_128', 'MP3_192', 'MP3_320', 'ZIP', 'MP4'));

alter table public.studio_download_usage drop constraint if exists studio_download_usage_format_check;
alter table public.studio_download_usage add constraint studio_download_usage_format_check
  check (format in ('MP3_128', 'MP3_192', 'MP3_320', 'WAV_24', 'FLAC_24', 'AIFF_24', 'WAV_32F', 'ZIP'));
