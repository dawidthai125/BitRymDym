-- Own descriptions on sample pages /sampel/[id] (owner decision 2026-11-23).
-- Additive, nullable: without a text the page keeps the copy built from stored facts.
set local lock_timeout = '5s';

alter table public.studio_samples
  add column if not exists description text,
  add column if not exists description_en text;

alter table public.studio_samples drop constraint if exists studio_samples_description_chk;
alter table public.studio_samples add constraint studio_samples_description_chk
  check (
    (description is null or char_length(description) between 1 and 600)
    and (description_en is null or char_length(description_en) between 1 and 600)
  );

comment on column public.studio_samples.description is 'Catalogue description (Polish), shown on /sampel/[id].';
comment on column public.studio_samples.description_en is 'Catalogue description (English), shown on /en/sampel/[id].';
