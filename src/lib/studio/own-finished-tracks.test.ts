import { describe, expect, it } from "vitest";

import { joinFinishedTracks } from "./own-finished-tracks";

describe("joinFinishedTracks", () => {
  const projects = [{ id: "p1", title: " Mój numer " }, { id: "p2", title: null }];
  it("keeps the newest approved master per project and marks catalogue state", () => {
    const jobs = [
      { id: "j3", project_id: "p1", approved_at: "2026-11-19T10:00:00Z" },
      { id: "j2", project_id: "p2", approved_at: "2026-11-18T10:00:00Z" },
      { id: "j1", project_id: "p1", approved_at: "2026-11-17T10:00:00Z" },
    ];
    const works = [{ master_job_id: "j3", withdrawn_at: null }, { master_job_id: "j2", withdrawn_at: "2026-11-18T12:00:00Z" }];
    const r = joinFinishedTracks(jobs, projects, works);
    expect(r.map((x) => [x.masterJobId, x.title, x.listed])).toEqual([["j3", "Mój numer", true], ["j2", "—", false]]);
  });
  it("marks a project listed when an older master is still live", () => {
    const jobs = [{ id: "new", project_id: "p1", approved_at: "2" }, { id: "old", project_id: "p1", approved_at: "1" }];
    expect(joinFinishedTracks(jobs, projects, [{ master_job_id: "old", withdrawn_at: null }])[0]?.listed).toBe(true);
  });
  it("skips jobs whose project is not the owner's and respects the limit", () => {
    const jobs = [{ id: "a", project_id: "zz", approved_at: "x" }, { id: "b", project_id: "p1", approved_at: "y" }];
    expect(joinFinishedTracks(jobs, projects, []).map((x) => x.masterJobId)).toEqual(["b"]);
    expect(joinFinishedTracks(jobs, projects, [], 0)).toEqual([]);
  });
});
