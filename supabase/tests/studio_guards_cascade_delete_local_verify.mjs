// Local verification for 20261030060000_studio_guards_allow_cascade_delete.sql (embedded PGlite, never prod).
// Run: npx -p @electric-sql/pglite node supabase/tests/studio_guards_cascade_delete_local_verify.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const mig = readFileSync(new URL("../migrations/20261030060000_studio_guards_allow_cascade_delete.sql", import.meta.url),"utf8");
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role', true), '') $$;
grant usage on schema auth to public; grant execute on function auth.role() to public;
create table public.profiles(id uuid primary key references auth.users on delete cascade);
create table public.studio_projects(id uuid primary key, owner_id uuid not null references public.profiles on delete cascade, title text);
create table public.studio_tracks(id uuid primary key, project_id uuid not null references public.studio_projects on delete cascade);
create table public.studio_clips(id uuid primary key, track_id uuid not null references public.studio_tracks on delete cascade);
create table public.studio_final_versions(id uuid primary key, project_id uuid not null references public.studio_projects on delete cascade);
create table public.studio_final_version_grants(id uuid primary key, version_id uuid not null references public.studio_final_versions on delete cascade);
create table public.studio_final_stages(id uuid primary key, version_id uuid not null references public.studio_final_versions on delete cascade);
`);
await db.exec(mig);
for (const [t,f] of [["studio_projects","project"],["studio_tracks","track"],["studio_clips","clip"],["studio_final_versions","final_versions"],["studio_final_version_grants","final_version_grants"],["studio_final_stages","final_stages"]])
  await db.exec(`create trigger g before insert or update or delete on public.${t} for each row execute function public.prevent_studio_${f}_privilege_escalation();`);
await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role; grant usage on schema public to anon, authenticated, service_role;`);
const seed = async (u) => db.exec(`begin; set local request.jwt.claim.role='service_role';
 insert into auth.users values('${u}'); insert into public.profiles values('${u}');
 insert into public.studio_projects values('${u.replace(/^.{2}/,'a1')}','${u}','p');
 insert into public.studio_tracks values('${u.replace(/^.{2}/,'b1')}','${u.replace(/^.{2}/,'a1')}');
 insert into public.studio_clips values('${u.replace(/^.{2}/,'c1')}','${u.replace(/^.{2}/,'b1')}');
 insert into public.studio_final_versions values('${u.replace(/^.{2}/,'d1')}','${u.replace(/^.{2}/,'a1')}');
 insert into public.studio_final_version_grants values('${u.replace(/^.{2}/,'e1')}','${u.replace(/^.{2}/,'d1')}');
 insert into public.studio_final_stages values('${u.replace(/^.{2}/,'f1')}','${u.replace(/^.{2}/,'d1')}'); commit;`);
const U1="00000000-0000-4000-8000-000000000001", U2="00000000-0000-4000-8000-000000000002";
await seed(U1); await seed(U2);
const expectFail = async (name, sql) => { try { await db.exec(sql); console.log("FAIL (allowed):", name); process.exitCode=1; } catch (e) { await db.exec("rollback").catch(()=>{}); console.log("ok blocked:", name, "-", e.message); } };
const expectOk = async (name, sql) => { try { await db.exec(sql); console.log("ok allowed:", name); } catch (e) { await db.exec("rollback").catch(()=>{}); console.log("FAIL (blocked):", name, e.message); process.exitCode=1; } };
for (const r of ["authenticated","anon"]) {
  await expectFail(`${r} direct delete project`, `begin; set local role ${r}; set local request.jwt.claim.role='${r}'; delete from public.studio_projects; commit;`);
  await expectFail(`${r} direct delete track`, `begin; set local role ${r}; set local request.jwt.claim.role='${r}'; delete from public.studio_tracks; commit;`);
  await expectFail(`${r} update project`, `begin; set local role ${r}; set local request.jwt.claim.role='${r}'; update public.studio_projects set title='x'; commit;`);
  await expectFail(`${r} insert project`, `begin; set local role ${r}; set local request.jwt.claim.role='${r}'; insert into public.studio_projects values(gen_random_uuid(),'${U1}','x'); commit;`);
  await expectFail(`${r} cascade via profiles delete`, `begin; set local role ${r}; set local request.jwt.claim.role='${r}'; delete from public.profiles where id='${U1}'; commit;`);
}
await expectFail("no-JWT direct delete project (depth 1)", `delete from public.studio_projects where owner_id='${U1}'`);
await expectFail("no-JWT update project", `update public.studio_projects set title='x'`);
await expectFail("no-JWT insert", `insert into public.studio_projects values(gen_random_uuid(),'${U1}','x')`);
await expectOk("no-JWT auth.users delete cascades (GoTrue deleteUser)", `delete from auth.users where id='${U1}'`);
const left = await db.query(`select (select count(*) from public.studio_projects where owner_id='${U1}') p, (select count(*) from public.studio_clips) c, (select count(*) from public.studio_final_stages) s, (select count(*) from public.studio_final_version_grants) g`);
console.log("after U1 delete:", JSON.stringify(left.rows[0]), "(expect p=0, c/s/g=1 for U2)");
await expectOk("service_role direct delete still works", `begin; set local request.jwt.claim.role='service_role'; delete from public.studio_tracks where project_id='a1000000-0000-4000-8000-000000000002'; commit;`);
