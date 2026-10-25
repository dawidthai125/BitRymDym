/**
 * Contract test for repo systemd artifact of the dedicated SFM poller.
 * Does not start systemd, touch a host, or enable SFM flags.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const UNIT_REL = "deploy/systemd/bitrymdym-sfm-worker-poll.service";
const UNIT_PATH = join(ROOT, UNIT_REL);
const POLLER_SCRIPT = "scripts/sfm-worker-poll.ts";

function readUnit(): string {
  return readFileSync(UNIT_PATH, "utf8");
}

/** Directive lines only (ignore comments) for layout assertions. */
function serviceDirectives(unit: string): string {
  return unit
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.trimStart().startsWith("#"))
    .join("\n");
}

describe("SFM dedicated systemd unit (repo artifact)", () => {
  it("uses the Owner-approved unit filename and path", () => {
    expect(UNIT_REL).toBe(
      "deploy/systemd/bitrymdym-sfm-worker-poll.service",
    );
    const unit = readUnit();
    expect(unit.length).toBeGreaterThan(0);
  });

  it("isolates User/Group, WorkingDirectory, EnvironmentFile, and Restart=no", () => {
    const unit = readUnit();
    expect(unit).toMatch(/^User=bitrymdym-sfm$/m);
    expect(unit).toMatch(/^Group=bitrymdym-sfm$/m);
    expect(unit).toMatch(/^WorkingDirectory=\/opt\/bitrymdym-sfm-worker$/m);
    expect(unit).toMatch(
      /^EnvironmentFile=\/etc\/bitrymdym-sfm-worker\/worker\.env$/m,
    );
    expect(unit).toMatch(/^Restart=no$/m);
    expect(unit).not.toMatch(/User=bitrymdym-e3/);
    expect(unit).not.toMatch(/\/opt\/bitrymdym-e3-worker/);
    expect(unit).not.toMatch(/\/etc\/bitrymdym-e3-worker/);
  });

  it("starts only the existing fail-closed SFM poller npm script", () => {
    const unit = readUnit();
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    expect(existsSync(join(ROOT, POLLER_SCRIPT))).toBe(true);
    expect(pkg.scripts?.["sfm:worker:poll"]).toMatch(/sfm-worker-poll/);
    expect(unit).toMatch(/^ExecStart=\/usr\/bin\/npm run sfm:worker:poll$/m);
    expect(unit).not.toMatch(/e3:worker:poll/);
    expect(unit).not.toMatch(/studio-export-poll/);
  });

  it("contains no secrets and does not turn SFM flags ON", () => {
    const unit = readUnit();
    expect(unit).not.toMatch(/SFM_VERSIONS_V1\s*=\s*(true|1|ON|on)/i);
    expect(unit).not.toMatch(/SFM_WORKER_ENABLED\s*=\s*(true|1|ON|on)/i);
    expect(unit).not.toMatch(/E3_RENDER_JOBS_ENABLED\s*=\s*(true|1|ON|on)/i);
    expect(unit).not.toMatch(/SERVICE_ROLE|service_role|eyJ[A-Za-z0-9_-]{10,}/);
    expect(unit).not.toMatch(/BEGIN (RSA |OPENSSH )?PRIVATE KEY/);
    expect(unit).not.toMatch(/password\s*=/i);
    // Env values live outside the repo; unit only references the path.
    expect(unit).toMatch(
      /^EnvironmentFile=\/etc\/bitrymdym-sfm-worker\/worker\.env$/m,
    );
  });

  it("does not target STUDIO E3 poller layout in service directives", () => {
    const unit = readUnit();
    const directives = serviceDirectives(unit);
    expect(directives).not.toMatch(/Contabo/i);
    expect(directives).not.toMatch(/vmi3622761/);
    expect(directives).not.toMatch(/bitrymdym-e3-worker-poll/);
    expect(directives).not.toMatch(/STUDIO_EXPORT/);
    expect(directives).not.toMatch(/\/opt\/bitrymdym-e3-worker/);
    expect(unit).toMatch(/dedicated SFM/i);
  });
});
