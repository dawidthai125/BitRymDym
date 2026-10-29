-- Local verification for 20261029173914_studio_master_and_downloads.sql (embedded Postgres, never prod).
\set ON_ERROR_STOP 1
begin;
select id as u1 from auth.users order by id limit 1 \gset
select id as u2 from auth.users order by id offset 1 limit 1 \gset
select set_config('verify.u1', :'u1', true), set_config('verify.u2', :'u2', true);
set local request.jwt.claim.role = 'service_role';
insert into public.studio_projects (id, owner_id, title) values ('dddddddd-0000-4000-8000-000000000001', :'u1', 'master-verify');

set local role service_role;
-- master requires target; owner guard
do $$ begin
  begin
    insert into public.studio_master_jobs (project_id, owner_id, kind, source_document_version) values ('dddddddd-0000-4000-8000-000000000001', current_setting('verify.u1')::uuid, 'master', 1);
    raise exception 'target check missing';
  exception when check_violation then null; end;
  begin
    insert into public.studio_master_jobs (project_id, owner_id, target, source_document_version) values ('dddddddd-0000-4000-8000-000000000001', current_setting('verify.u2')::uuid, 'club', 1);
    raise exception 'guard missing';
  exception when insufficient_privilege then
    if sqlerrm <> 'STUDIO_MASTER_OWNER_MISMATCH' then raise; end if;
  end;
end $$;
insert into public.studio_master_jobs (project_id, owner_id, target, source_document_version) values ('dddddddd-0000-4000-8000-000000000001', :'u1', 'streaming', 3);
-- claim → complete → approve
do $$ declare j public.studio_master_jobs; begin
  select * into j from public.claim_next_studio_master_job('w1');
  if j.id is null or j.status <> 'running' or j.attempts <> 1 then raise exception 'claim failed'; end if;
  if exists (select 1 from public.claim_next_studio_master_job('w2')) then raise exception 'double claim'; end if;
  begin
    perform public.complete_studio_master_job(j.id, 'w2', 'succeeded', 'k', '{}', null);
    raise exception 'foreign complete allowed';
  exception when no_data_found then null; end;
  begin
    update public.studio_master_jobs set approved_at = now() where id = j.id;
    raise exception 'approve before done allowed';
  exception when check_violation then null; end;
  perform public.complete_studio_master_job(j.id, 'w1', 'succeeded', 'studio-master/x.wav', '{"lufs":-14}', null);
  update public.studio_master_jobs set approved_at = now() where id = j.id;
end $$;
-- download quota: Free limit 1 / 7 days, Gold unlimited
do $$ declare r record; begin
  select * into r from public.consume_studio_download(current_setting('verify.u1')::uuid, 'dddddddd-0000-4000-8000-000000000001', 'master', 'MP3_128', 'FREE', 1);
  if not r.allowed or r.used <> 1 then raise exception 'first free download denied'; end if;
  select * into r from public.consume_studio_download(current_setting('verify.u1')::uuid, 'dddddddd-0000-4000-8000-000000000001', 'mix', 'MP3_128', 'FREE', 1);
  if r.allowed or r.reset_at is null then raise exception 'second free download allowed'; end if;
  update public.studio_download_usage set created_at = now() - interval '8 days' where owner_id = current_setting('verify.u1')::uuid;
  select * into r from public.consume_studio_download(current_setting('verify.u1')::uuid, null, 'raw', 'MP3_128', 'FREE', 1);
  if not r.allowed then raise exception 'window did not roll'; end if;
  for i in 1..3 loop
    select * into r from public.consume_studio_download(current_setting('verify.u2')::uuid, null, 'project', 'ZIP', 'GOLD', null);
    if not r.allowed then raise exception 'gold limited'; end if;
  end loop;
end $$;
reset role;

-- RLS + grants
set local role authenticated;
select set_config('request.jwt.claim.sub', :'u1', true);
do $$ begin
  if (select count(*) from public.studio_master_jobs) <> 1 then raise exception 'owner cannot see job'; end if;
  if (select count(*) from public.studio_download_usage) <> 2 then raise exception 'owner usage rows'; end if;
  begin
    insert into public.studio_download_usage (owner_id, kind, format, tier) values (auth.uid(), 'mix', 'MP3_128', 'FREE');
    raise exception 'authenticated insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.consume_studio_download(auth.uid(), null, 'mix', 'MP3_128', 'GOLD', null);
    raise exception 'authenticated rpc allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.studio_master_jobs set approved_at = now();
    raise exception 'authenticated update allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', :'u2', true);
do $$ begin
  if (select count(*) from public.studio_master_jobs) <> 0 then raise exception 'other user sees job'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.studio_master_jobs; raise exception 'anon select allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
-- cascade
delete from public.studio_projects where id = 'dddddddd-0000-4000-8000-000000000001';
do $$ begin
  if exists (select 1 from public.studio_master_jobs where project_id = 'dddddddd-0000-4000-8000-000000000001') then raise exception 'cascade failed'; end if;
end $$;
select 'verify OK' as result;
rollback;
