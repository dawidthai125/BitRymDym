-- Rights statement (owner decision 2026-11-26): when the user ticks "Mam prawa do tych plików"
-- (stem import, "Sam mastering") or confirms the rights prompt of "Importuj wokal", the server
-- stores the time on the take. Mic and Windows recorder takes leave it null (own recording).
alter table public.takes add column if not exists rights_confirmed_at timestamptz;

comment on column public.takes.rights_confirmed_at is
  'Time the owner confirmed holding the rights to this uploaded file (stem, master-only upload, vocal import). Null for own recordings.';
