import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression: deleting an account whose Studio project had recorded tracks
 * failed at step "takes_delete" (studio_clips FK SET NULL vs source_xor_chk → 23514).
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("account deletion with Studio projects", () => {
  const del = read("src/lib/auth/delete-account.ts");
  const core = del.slice(del.indexOf("export async function executeAccountProfile01Deletion"), del.indexOf("export async function deleteOwnAccount"));
  const mig = read("supabase/migrations/20261030050000_studio_clips_source_fk_cascade.sql");

  it("clears studio tracks (→ clips) before artifacts and takes are deleted", () => {
    const tracks = core.indexOf("deleteOwnedStudioTracks(admin, userId)");
    const pipeline = core.indexOf("deleteOwnedAudioPipeline(admin, userId)");
    const projects = core.indexOf("deleteOwnedStudioProjects(admin, userId)");
    const takes = core.indexOf('step: "takes_delete"');
    const auth = core.indexOf("admin.auth.admin.deleteUser");
    expect(tracks).toBeGreaterThan(-1);
    expect(pipeline).toBeGreaterThan(tracks);
    expect(projects).toBeGreaterThan(pipeline);
    expect(takes).toBeGreaterThan(projects);
    expect(auth).toBeGreaterThan(takes);
  });

  it("deletes grants → final versions → projects, and the studio-master storage prefix", () => {
    const fn = del.slice(del.indexOf("async function deleteOwnedStudioProjects"));
    const g = fn.indexOf('from("studio_final_version_grants")');
    const v = fn.indexOf('from("studio_final_versions")\n      .delete()');
    const p = fn.indexOf('from("studio_projects")');
    expect(g).toBeGreaterThan(-1);
    expect(v).toBeGreaterThan(g);
    expect(p).toBeGreaterThan(v);
    expect(fn).toContain("STUDIO_MASTER_PREFIX(userId)");
    expect(del).toContain("`studio-master/${userId}/`");
  });

  it("aborts with a named step instead of silently continuing", () => {
    for (const step of ["studio_projects_list", "studio_tracks_delete", "studio_grants_delete", "studio_versions_delete", "studio_projects_delete"]) {
      expect(del).toContain(`"${step}"`);
    }
  });

  it("migration makes clip source FKs consistent with studio_clips_source_xor_chk", () => {
    expect(mig).toMatch(/source_take_id\) REFERENCES public\.takes \(id\) ON DELETE CASCADE/);
    expect(mig).toMatch(/source_artifact_id\) REFERENCES public\.audio_artifacts \(id\) ON DELETE CASCADE/);
    expect(mig.replace(/^--.*$/gm, "")).not.toMatch(/ON DELETE SET NULL/);
  });

  it("purges studio-cleanup/<uid>/ results along with studio-master/<uid>/", () => {
    const fn = del.slice(del.indexOf("async function deleteOwnedStudioProjects"), del.indexOf("async function deleteOwnedAudioPipeline"));
    expect(fn).toContain("STUDIO_CLEANUP_PREFIX(userId)");
    expect(fn.indexOf("STUDIO_CLEANUP_PREFIX(userId)")).toBeGreaterThan(fn.indexOf('from("studio_projects")'));
    expect(del).toContain("`studio-cleanup/${userId}/`");
    const key = read("src/lib/studio/cleanup/cleanup-worker-env.ts");
    expect(key).toContain("`studio-cleanup/${ownerId}/");
  });
});

/**
 * Regression: auth.admin.deleteUser failed at step "auth_delete" when Studio rows
 * were still present — the FK cascade auth.users → profiles → studio_projects ran
 * without a JWT (auth.role() IS NULL) and the guard trigger raised.
 */
describe("Studio guard triggers allow FK-cascade deletes only", () => {
  const mig = read("supabase/migrations/20261030061000_studio_guards_allow_cascade_delete.sql");
  const sql = mig.replace(/^--.*$/gm, "");
  const guards = [
    ["prevent_studio_project_privilege_escalation", "studio_projects"],
    ["prevent_studio_track_privilege_escalation", "studio_tracks"],
    ["prevent_studio_clip_privilege_escalation", "studio_clips"],
    ["prevent_studio_final_versions_privilege_escalation", "studio_final_versions"],
    ["prevent_studio_final_version_grants_privilege_escalation", "studio_final_version_grants"],
    ["prevent_studio_final_stages_privilege_escalation", "studio_final_stages"],
  ] as const;

  it("cascade context = nested trigger + non-client role", () => {
    const helper = sql.slice(sql.indexOf("FUNCTION public.studio_guard_cascade_delete_allowed()"));
    expect(helper).toMatch(/pg_trigger_depth\(\) > 1/);
    expect(helper).toMatch(/NOT IN \('authenticated', 'anon'\)/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.studio_guard_cascade_delete_allowed\(\) FROM PUBLIC, anon, authenticated/);
  });

  it.each(guards)("%s keeps service_role-only INSERT/UPDATE and only relaxes DELETE", (fn, table) => {
    const start = sql.indexOf(`FUNCTION public.${fn}()`);
    expect(start).toBeGreaterThan(-1);
    const body = sql.slice(start, sql.indexOf("$$;", sql.indexOf("AS $$", start)));
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(body).toContain("NOT (TG_OP = 'DELETE' AND public.studio_guard_cascade_delete_allowed())");
    expect(body).toContain(`RAISE EXCEPTION 'Only service_role may mutate ${table}'`);
    expect(body).not.toMatch(/TG_OP = '(INSERT|UPDATE)' AND public\.studio_guard_cascade_delete_allowed/);
  });
});
