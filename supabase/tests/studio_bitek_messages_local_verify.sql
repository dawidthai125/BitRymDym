-- Local verification for 20261029170000_studio_bitek_messages.sql (embedded Postgres, never prod).
\set ON_ERROR_STOP 1
begin;
select id as u1 from auth.users order by id limit 1 \gset
select id as u2 from auth.users order by id offset 1 limit 1 \gset
set local request.jwt.claim.role = 'service_role';
insert into public.studio_projects (id, owner_id, title) values ('cccccccc-0000-4000-8000-000000000001', :'u1', 'bitek-verify');

set local role service_role;
insert into public.studio_bitek_messages (project_id, owner_id, role, kind, content)
  select 'cccccccc-0000-4000-8000-000000000001', :'u1', 'assistant', 'note', 'n' || g from generate_series(1, 205) g;
insert into public.studio_bitek_messages (project_id, owner_id, role, kind, content) values
  ('cccccccc-0000-4000-8000-000000000001', :'u1', 'assistant', 'state', '{"open":true}'),
  ('cccccccc-0000-4000-8000-000000000001', :'u1', 'assistant', 'state', '{"open":false}');
do $$ begin
  if (select count(*) from public.studio_bitek_messages where kind <> 'state' and project_id = 'cccccccc-0000-4000-8000-000000000001') <> 200 then raise exception 'trim failed'; end if;
  if (select count(*) from public.studio_bitek_messages where kind = 'state' and project_id = 'cccccccc-0000-4000-8000-000000000001') <> 1 then raise exception 'state trim failed'; end if;
end $$;
-- owner mismatch rejected
select set_config('verify.u2', :'u2', true);
do $$ begin
  begin
    insert into public.studio_bitek_messages (project_id, owner_id, role, kind, content)
      values ('cccccccc-0000-4000-8000-000000000001', current_setting('verify.u2')::uuid, 'assistant', 'note', 'x');
    raise exception 'guard missing';
  exception when raise_exception then
    if sqlerrm <> 'BITEK_PROJECT_OWNER_MISMATCH' then raise; end if;
  end;
  begin
    insert into public.studio_bitek_messages (project_id, owner_id, role, kind, content)
      select 'cccccccc-0000-4000-8000-000000000001', p.owner_id, 'user', 'note', 'x' from public.studio_projects p where p.id='cccccccc-0000-4000-8000-000000000001';
    raise exception 'user-note check missing';
  exception when check_violation then null;
  end;
end $$;
reset role;

-- RLS: owner sees rows, other user sees none, anon has no grant, authenticated cannot insert
set local role authenticated;
select set_config('request.jwt.claim.sub', :'u1', true);
do $$ begin if (select count(*) from public.studio_bitek_messages) <> 201 then raise exception 'owner read failed'; end if; end $$;
select set_config('request.jwt.claim.sub', :'u2', true);
do $$ begin if (select count(*) from public.studio_bitek_messages) <> 0 then raise exception 'rls leak'; end if; end $$;
do $$ begin
  begin
    insert into public.studio_bitek_messages (project_id, owner_id, role, kind, content)
      values ('cccccccc-0000-4000-8000-000000000001', auth.uid(), 'user', 'chat', 'x');
    raise exception 'authenticated insert allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.studio_bitek_messages; raise exception 'anon read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- cascade on project delete
select set_config('request.jwt.claim.role','service_role',true);
delete from public.studio_projects where id = 'cccccccc-0000-4000-8000-000000000001';
do $$ begin if exists (select 1 from public.studio_bitek_messages where project_id='cccccccc-0000-4000-8000-000000000001') then raise exception 'cascade failed'; end if; end $$;
select 'studio_bitek_messages verify OK' as result;
rollback;
