-- Local verification for 20261029233000_studio_gaps_p0.sql (embedded Postgres, never prod).
\set ON_ERROR_STOP 1
begin;
select id as u1 from auth.users order by id limit 1 \gset
select id as u2 from auth.users order by id offset 1 limit 1 \gset
select set_config('verify.u1', :'u1', true);
select set_config('verify.u2', :'u2', true);
set local request.jwt.claim.role = 'service_role';
insert into public.studio_projects (id, owner_id, title) values ('dddddddd-0000-4000-8000-000000000001', :'u1', 'gaps-verify');

set local role service_role;
-- lyrics: insert, CAS-style update bumps updated_at, owner mismatch + body checks rejected
insert into public.studio_project_lyrics (project_id, owner_id, body)
  values ('dddddddd-0000-4000-8000-000000000001', :'u1', '{"sections":[{"id":"a","label":"Refren","startMs":0,"lines":["x"]}]}');
do $$ begin
  update public.studio_project_lyrics set body = '{"sections":[]}', version = version + 1
    where project_id = 'dddddddd-0000-4000-8000-000000000001' and version = 1;
  if not found then raise exception 'cas update failed'; end if;
  update public.studio_project_lyrics set version = version + 1
    where project_id = 'dddddddd-0000-4000-8000-000000000001' and version = 1;
  if found then raise exception 'stale cas accepted'; end if;
  begin
    insert into public.studio_project_lyrics (project_id, owner_id)
      values ('dddddddd-0000-4000-8000-000000000001', current_setting('verify.u2')::uuid);
    raise exception 'pk/guard missing';
  exception when unique_violation or insufficient_privilege then null;
  end;
  begin
    update public.studio_project_lyrics set owner_id = current_setting('verify.u2')::uuid
      where project_id = 'dddddddd-0000-4000-8000-000000000001';
    raise exception 'owner change allowed';
  exception when insufficient_privilege then
    if sqlerrm not in ('LYRICS_PROJECT_OWNER_MISMATCH', 'LYRICS_IMMUTABLE_OWNER') then raise; end if;
  end;
  begin
    update public.studio_project_lyrics set body = '{"sections":"x"}'
      where project_id = 'dddddddd-0000-4000-8000-000000000001';
    raise exception 'body check missing';
  exception when check_violation then null;
  end;
end $$;

-- presets: kinds, name check, 50 cap
insert into public.studio_fx_presets (owner_id, name, kind, payload)
  select :'u1', 'p' || g, 'chain', '{"chain":{"schemaVersion":1,"effects":[]}}' from generate_series(1, 50) g;
do $$ begin
  begin
    insert into public.studio_fx_presets (owner_id, name, kind, payload)
      values (current_setting('verify.u1')::uuid, 'over', 'chain', '{}');
    raise exception 'cap missing';
  exception when program_limit_exceeded then
    if sqlerrm <> 'FX_PRESET_LIMIT' then raise; end if;
  end;
  begin
    insert into public.studio_fx_presets (owner_id, name, kind, payload)
      values (current_setting('verify.u2')::uuid, 'x', 'bus', '{}');
    raise exception 'kind check missing';
  exception when check_violation then null;
  end;
  begin
    insert into public.studio_fx_presets (owner_id, name, kind, payload)
      values (current_setting('verify.u2')::uuid, '   ', 'set', '{}');
    raise exception 'name check missing';
  exception when check_violation then null;
  end;
end $$;
insert into public.studio_fx_presets (owner_id, name, kind, payload) values (:'u2', 'zestaw', 'set', '{"set":{}}');
reset role;

-- RLS: owner sees own rows only; authenticated cannot write; anon no access
set local role authenticated;
select set_config('request.jwt.claim.sub', :'u1', true);
do $$ begin
  if (select count(*) from public.studio_project_lyrics) <> 1 then raise exception 'owner lyrics read failed'; end if;
  if (select count(*) from public.studio_fx_presets) <> 50 then raise exception 'owner presets read failed'; end if;
end $$;
select set_config('request.jwt.claim.sub', :'u2', true);
do $$ begin
  if (select count(*) from public.studio_project_lyrics) <> 0 then raise exception 'lyrics rls leak'; end if;
  if (select count(*) from public.studio_fx_presets) <> 1 then raise exception 'presets rls leak'; end if;
  begin
    insert into public.studio_fx_presets (owner_id, name, kind, payload) values (auth.uid(), 'x', 'chain', '{}');
    raise exception 'authenticated insert allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.studio_project_lyrics set version = 9;
    raise exception 'authenticated update allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.studio_project_lyrics; raise exception 'anon read allowed';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.studio_fx_presets; raise exception 'anon read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- cascade: deleting the project removes its lyrics
delete from public.studio_projects where id = 'dddddddd-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from public.studio_project_lyrics where project_id = 'dddddddd-0000-4000-8000-000000000001') then
    raise exception 'cascade failed';
  end if;
end $$;
select 'studio_gaps_p0 local verify OK' as result;
rollback;
