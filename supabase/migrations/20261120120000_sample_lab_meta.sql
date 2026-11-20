-- Sample Lab (owner decision 2026-11-20): live-instrument samples with musical metadata.
-- All columns are additive; existing rows get oneshot / studio defaults.

alter table public.studio_samples
  add column if not exists sample_type text not null default 'oneshot',
  add column if not exists bpm numeric(5, 1),
  add column if not exists musical_key text,
  add column if not exists bars smallint,
  add column if not exists source text not null default 'studio',
  add column if not exists beat_id uuid references public.beats (id) on delete set null;

alter table public.studio_samples drop constraint if exists studio_samples_sample_type_chk;
alter table public.studio_samples add constraint studio_samples_sample_type_chk
  check (sample_type in ('oneshot', 'loop', 'phrase'));

alter table public.studio_samples drop constraint if exists studio_samples_bpm_chk;
alter table public.studio_samples add constraint studio_samples_bpm_chk
  check (bpm is null or (bpm >= 40 and bpm <= 240));

alter table public.studio_samples drop constraint if exists studio_samples_musical_key_chk;
alter table public.studio_samples add constraint studio_samples_musical_key_chk
  check (musical_key is null or musical_key ~ '^[A-G]#?(m|-?[0-9])?$');

alter table public.studio_samples drop constraint if exists studio_samples_bars_chk;
alter table public.studio_samples add constraint studio_samples_bars_chk
  check (bars is null or bars in (1, 2, 4, 8, 16));

alter table public.studio_samples drop constraint if exists studio_samples_loop_meta_chk;
alter table public.studio_samples add constraint studio_samples_loop_meta_chk
  check (sample_type <> 'loop' or (bpm is not null and bars is not null));

alter table public.studio_samples drop constraint if exists studio_samples_source_chk;
alter table public.studio_samples add constraint studio_samples_source_chk
  check (source in ('studio', 'live', 'import'));

create index if not exists studio_samples_beat_id_idx on public.studio_samples (beat_id) where beat_id is not null;

comment on column public.studio_samples.sample_type is 'oneshot | loop | phrase (Sample Lab).';
comment on column public.studio_samples.musical_key is 'One-shot note (A2) or loop key (Am, F#).';
comment on column public.studio_samples.source is 'studio = synth desk, live = recorded in the Sample Lab, import = uploaded file.';
