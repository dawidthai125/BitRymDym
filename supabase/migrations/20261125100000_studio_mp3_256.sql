-- Silver downloads MP3 256 from the Studio (price list). Only widens the allowed values.
alter table public.studio_master_jobs drop constraint studio_master_jobs_output_format_check;
alter table public.studio_master_jobs add constraint studio_master_jobs_output_format_check
  check (output_format in ('WAV_FLOAT', 'WAV_24', 'FLAC_24', 'AIFF_24', 'WAV_32F', 'MP3_128', 'MP3_192', 'MP3_256', 'MP3_320', 'ZIP', 'MP4'));
alter table public.studio_download_usage drop constraint studio_download_usage_format_check;
alter table public.studio_download_usage add constraint studio_download_usage_format_check
  check (format in ('MP3_128', 'MP3_192', 'MP3_256', 'MP3_320', 'WAV_24', 'FLAC_24', 'AIFF_24', 'WAV_32F', 'ZIP'));
