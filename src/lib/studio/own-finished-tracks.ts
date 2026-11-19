/**
 * The owner's finished Studio tracks for the account page: the latest approved master of each
 * project, with the project title and whether it is currently listed in the catalogue.
 */

export type FinishedTrack = {
  projectId: string;
  masterJobId: string;
  title: string;
  approvedAt: string;
  /** In the public catalogue right now (published and not withdrawn). */
  listed: boolean;
};

type JobRow = { id: string; project_id: string; approved_at: string };
type ProjectRow = { id: string; title: string | null };
type WorkRow = { master_job_id: string; withdrawn_at: string | null };

/** Pure join. `jobs` must be newest approval first; only the first job of each project is kept. */
export function joinFinishedTracks(jobs: JobRow[], projects: ProjectRow[], works: WorkRow[], limit = 8): FinishedTrack[] {
  const titles = new Map(projects.map((p) => [p.id, (p.title ?? "").trim()]));
  const projectOfJob = new Map(jobs.map((j) => [j.id, j.project_id]));
  // A project counts as listed when ANY of its masters is live (an older master can stay public after a re-master).
  const listedProjects = new Set(
    works.filter((w) => w.withdrawn_at == null).map((w) => projectOfJob.get(w.master_job_id)).filter((id): id is string => Boolean(id)),
  );
  const seen = new Set<string>();
  const out: FinishedTrack[] = [];
  for (const job of jobs) {
    if (out.length >= limit) break;
    if (seen.has(job.project_id) || !titles.has(job.project_id)) continue;
    seen.add(job.project_id);
    out.push({
      projectId: job.project_id,
      masterJobId: job.id,
      title: titles.get(job.project_id) || "—",
      approvedAt: job.approved_at,
      listed: listedProjects.has(job.project_id),
    });
  }
  return out;
}

type Admin = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export async function listOwnFinishedTracks(admin: Admin, ownerId: string, limit = 8): Promise<FinishedTrack[]> {
  const jobsRes = await admin
    .from("studio_master_jobs")
    .select("id, project_id, approved_at")
    .eq("owner_id", ownerId)
    .eq("kind", "master")
    .eq("status", "succeeded")
    .not("approved_at", "is", null)
    .order("approved_at", { ascending: false })
    .limit(500);
  if (jobsRes.error) throw new Error(`own_tracks_jobs: ${jobsRes.error.message}`);
  const jobs = (jobsRes.data ?? []) as JobRow[];
  if (jobs.length === 0) return [];
  const projectIds = [...new Set(jobs.map((j) => j.project_id))];
  const [projectsRes, worksRes] = await Promise.all([
    admin.from("studio_projects").select("id, title").eq("owner_id", ownerId).in("id", projectIds),
    admin.from("catalog_works").select("master_job_id, withdrawn_at").eq("owner_id", ownerId).in("master_job_id", jobs.map((j) => j.id)),
  ]);
  if (projectsRes.error) throw new Error(`own_tracks_projects: ${projectsRes.error.message}`);
  if (worksRes.error) throw new Error(`own_tracks_catalog: ${worksRes.error.message}`);
  return joinFinishedTracks(jobs, (projectsRes.data ?? []) as ProjectRow[], (worksRes.data ?? []) as WorkRow[], limit);
}
