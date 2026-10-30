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
});
