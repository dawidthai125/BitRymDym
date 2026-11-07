-- Author listing and the comment switch.
-- Applied on BitRymDym (rzzxrgcdogkybkiidqgw) 2026-11-07 after Owner GO.
-- Private work stays out of the catalogue. Comments apply only while it is public.

alter table public.beats
  add column if not exists allow_comments boolean not null default true;

comment on column public.beats.allow_comments is
  'Author switch. Comments are shown only when the beat is in the public catalogue.';

alter table public.studio_samples
  add column if not exists public_listing boolean not null default false;

alter table public.studio_samples
  add column if not exists allow_comments boolean not null default true;

-- Samples already accepted for the public catalogue stay listed.
update public.studio_samples
  set public_listing = true
  where status = 'PUBLISHED' and public_listing = false;

comment on column public.studio_samples.public_listing is
  'Author choice after moderation. Off hides the sample from the catalogue, ranking and ratings.';

comment on column public.studio_samples.allow_comments is
  'Author switch. Ignored unless public_listing is on.';
