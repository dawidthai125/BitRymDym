/**
 * STUDIO_EXPORT Stage I / I.3A — UI client + control + dialog a11y contracts.
 * Does not run bake, worker, Storage, or enqueue.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_EXPORT_POLL_MAX_ATTEMPTS,
  createStudioExportIdempotencyKey,
  isStudioExportActiveStatus,
  isStudioExportTerminalStatus,
  mapJobStatusToUiPhase,
  mapStudioExportHttpResult,
  studioExportArtifactDownloadUrl,
  studioExportEnqueueUrl,
  studioExportStatusUrl,
} from "@/lib/studio/studio-export-client";
import { handleStudioDialogKeydown } from "@/lib/studio/studio-dialog-focus";

const ROOT = process.cwd();

describe("STUDIO_EXPORT Stage I — client mapping", () => {
  it("maps job statuses to UI phases without inventing RUNNING from time", () => {
    expect(mapJobStatusToUiPhase("QUEUED")).toBe("QUEUED");
    expect(mapJobStatusToUiPhase("CLAIMED")).toBe("RUNNING");
    expect(mapJobStatusToUiPhase("RUNNING")).toBe("RUNNING");
    expect(mapJobStatusToUiPhase("UPLOADING")).toBe("RUNNING");
    expect(mapJobStatusToUiPhase("SUCCEEDED")).toBe("SUCCEEDED");
    expect(mapJobStatusToUiPhase("FAILED")).toBe("FAILED");
    expect(mapJobStatusToUiPhase("CANCELLED")).toBe("FAILED");
    expect(mapJobStatusToUiPhase("TIMEOUT")).toBe("FAILED");
    expect(mapJobStatusToUiPhase("mystery")).toBe("UNAVAILABLE");
  });

  it("classifies terminal vs active statuses", () => {
    expect(isStudioExportTerminalStatus("SUCCEEDED")).toBe(true);
    expect(isStudioExportTerminalStatus("FAILED")).toBe(true);
    expect(isStudioExportTerminalStatus("QUEUED")).toBe(false);
    expect(isStudioExportActiveStatus("QUEUED")).toBe(true);
    expect(isStudioExportActiveStatus("RUNNING")).toBe(true);
    expect(isStudioExportActiveStatus("SUCCEEDED")).toBe(false);
  });

  it("builds stable idempotency keys from attempt id (not per render)", () => {
    const a = createStudioExportIdempotencyKey({
      projectId: "proj-1",
      documentVersion: 3,
      attemptId: "attempt-a",
    });
    const b = createStudioExportIdempotencyKey({
      projectId: "proj-1",
      documentVersion: 3,
      attemptId: "attempt-a",
    });
    const c = createStudioExportIdempotencyKey({
      projectId: "proj-1",
      documentVersion: 3,
      attemptId: "attempt-b",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^studio-export:proj-1:3:attempt-a$/);
  });

  it("uses project-scoped enqueue/status URLs and owner artifact download", () => {
    expect(studioExportEnqueueUrl("abc")).toBe(
      "/api/studio/projects/abc/export",
    );
    expect(studioExportStatusUrl("abc", "job-1")).toBe(
      "/api/studio/projects/abc/export?jobId=job-1",
    );
    expect(studioExportArtifactDownloadUrl("art-1")).toBe(
      "/api/mix/artifacts/art-1/download",
    );
  });

  it("maps success enqueue / status payloads", () => {
    const mapped = mapStudioExportHttpResult({
      httpStatus: 200,
      json: {
        success: true,
        jobId: "j1",
        projectId: "p1",
        status: "QUEUED",
        artifactId: null,
      },
    });
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.phase).toBe("QUEUED");
      expect(mapped.jobId).toBe("j1");
      expect(mapped.artifactId).toBeNull();
    }
  });

  it("maps SUCCEEDED with artifactId for download contract", () => {
    const mapped = mapStudioExportHttpResult({
      httpStatus: 200,
      json: {
        success: true,
        jobId: "j1",
        projectId: "p1",
        status: "SUCCEEDED",
        artifactId: "art-9",
      },
    });
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.phase).toBe("SUCCEEDED");
      expect(mapped.artifactId).toBe("art-9");
    }
  });

  it("maps 401/403/404/CONFLICT and network ambiguity", () => {
    expect(
      mapStudioExportHttpResult({
        httpStatus: 401,
        json: { error: "x" },
      }).phase,
    ).toBe("FAILED");
    expect(
      mapStudioExportHttpResult({
        httpStatus: 403,
        json: { error: "x" },
      }).phase,
    ).toBe("FAILED");
    expect(
      mapStudioExportHttpResult({
        httpStatus: 404,
        json: { error: "x" },
      }).phase,
    ).toBe("FAILED");
    const conflict = mapStudioExportHttpResult({
      httpStatus: 409,
      json: { code: "CONFLICT", error: "version" },
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.phase).toBe("CONFLICT");
    }
    const net = mapStudioExportHttpResult({
      httpStatus: 0,
      json: {},
      networkError: true,
    });
    expect(net.ok).toBe(false);
    if (!net.ok) {
      expect(net.ambiguousNetwork).toBe(true);
      expect(net.phase).toBe("UNAVAILABLE");
    }
  });

  it("bounds polling attempts", () => {
    expect(STUDIO_EXPORT_POLL_MAX_ATTEMPTS).toBeGreaterThan(0);
    expect(STUDIO_EXPORT_POLL_MAX_ATTEMPTS).toBeLessThanOrEqual(60);
  });
});

describe("STUDIO_EXPORT Stage I — control + editor wiring", () => {
  const control = readFileSync(
    join(ROOT, "src/components/studio/studio-export-control.tsx"),
    "utf8",
  );
  const editor = readFileSync(
    join(ROOT, "src/components/studio/studio-editor.tsx"),
    "utf8",
  );
  const route = readFileSync(
    join(
      ROOT,
      "src/app/api/studio/projects/[projectId]/export/route.ts",
    ),
    "utf8",
  );
  const service = readFileSync(
    join(ROOT, "src/lib/audio/studio-export-service.ts"),
    "utf8",
  );

  it("exposes export action in Studio transport (not take deep-link)", () => {
    expect(editor).toMatch(/StudioExportControl/);
    expect(editor).toMatch(/projectId=\{doc\.project\.id\}/);
    expect(editor).toMatch(/getExpectedDocumentVersion=\{expectedDocumentVersion\}/);
    expect(control).toMatch(/data-testid="studio-transport-export"/);
    expect(editor).not.toMatch(/STUDIO_EXPORT_DEEP_LINK_HREF/);
    expect(editor).not.toMatch(/href=\{STUDIO_EXPORT_DEEP_LINK_HREF\}/);
    expect(control).toMatch(/Eksportuj WAV/);
    expect(control).toMatch(/Eksport całego dokumentu/);
  });

  it("does not auto-enqueue on mount / useEffect", () => {
    // Polling effect must not call enqueue; enqueue is button-driven only.
    const pollEffect = control.match(
      /useEffect\(\(\) => \{[\s\S]*?phase !== "QUEUED"[\s\S]*?\}, \[open, jobId, phase\]\);/,
    );
    expect(pollEffect?.[0] ?? "").not.toMatch(/enqueueExport|studioExportEnqueueUrl/);
    expect(control).toMatch(/data-testid="studio-export-start"/);
    expect(control).toMatch(/void enqueueExport\(/);
  });

  it("passes expectedDocumentVersion + idempotencyKey; no client source claims", () => {
    expect(control).toMatch(/expectedDocumentVersion/);
    expect(control).toMatch(/idempotencyKey/);
    expect(control).not.toMatch(/objectKey|object_key|ownerId|sourceKeys/);
    expect(control).toMatch(/studioExportEnqueueUrl\(projectId\)/);
  });

  it("blocks double submit while SUBMITTING", () => {
    expect(control).toMatch(/if \(phase === "SUBMITTING"\) return/);
    expect(control).toMatch(/disabled=\{!canStart\}/);
  });

  it("polls only for QUEUED/RUNNING and stops on unmount / terminal", () => {
    expect(control).toMatch(/phase !== "QUEUED" && phase !== "RUNNING"/);
    expect(control).toMatch(/cancelled = true/);
    expect(control).toMatch(/clearInterval/);
    expect(control).toMatch(/STUDIO_EXPORT_POLL_MAX_ATTEMPTS/);
    expect(control).toMatch(/pollInFlightRef/);
  });

  it("downloads only via owner artifact endpoint (no raw object key links)", () => {
    expect(control).toMatch(/studioExportArtifactDownloadUrl\(artifactId\)/);
    expect(studioExportArtifactDownloadUrl("art-x")).toContain(
      "/api/mix/artifacts/art-x/download",
    );
    expect(control).not.toMatch(/object_key|storage\/v1|supabase\.co\/storage/);
    expect(control).toMatch(/data-testid="studio-export-download"/);
    expect(control).toMatch(/phase === "SUCCEEDED" && Boolean\(artifactId\)/);
  });

  it("handles CONFLICT / network ambiguity without inventing second key blindly", () => {
    expect(control).toMatch(/forceNewAttempt/);
    expect(control).toMatch(/networkError: true/);
    expect(control).toMatch(/idempotencyKeyRef/);
    expect(control).toMatch(
      /forceNewAttempt:\s*\r?\n\s*phase === "FAILED" \|\| phase === "CONFLICT"/,
    );
    expect(control).toMatch(/reuses the same idempotency key/);
    expect(control).toMatch(/mapped\.phase === "CONFLICT"/);
  });

  it("status GET is project-scoped and returns artifactId", () => {
    expect(route).toMatch(/getOwnStudioExportJob\(jobId, \{ projectId \}\)/);
    expect(route).toMatch(/artifactId: job\.artifactId \?\? null/);
    expect(service).toMatch(/resolveStudioExportArtifactIdFor/);
    expect(service).toMatch(/options\?: \{ projectId\?: string \}/);
  });

  it("keeps min hit target and dialog a11y", () => {
    expect(control).toMatch(/min-h-11/);
    expect(control).toMatch(/role="dialog"/);
    expect(control).toMatch(/aria-modal="true"/);
    expect(control).toMatch(/aria-labelledby=\{titleId\}/);
    expect(control).toMatch(/aria-describedby=\{descriptionId\}/);
    expect(control).toMatch(/aria-expanded=\{open\}/);
    expect(control).toMatch(/aria-haspopup="dialog"/);
    expect(control).toMatch(/role="status"/);
    expect(control).toMatch(/role="alert"/);
    expect(control).toMatch(/focus-visible:outline/);
  });

  it("rejects enqueue without valid projectId in control", () => {
    expect(control).toMatch(/projectId\.length < 8/);
    expect(control).toMatch(/Brak prawidłowego projektu Studio/);
  });
});

describe("STUDIO_EXPORT Stage I.3A — dialog keyboard / focus", () => {
  const control = readFileSync(
    join(ROOT, "src/components/studio/studio-export-control.tsx"),
    "utf8",
  );

  function mockFocusable(id: string) {
    return {
      id,
      focus: vi.fn(),
    } as unknown as HTMLElement;
  }

  it("wires single window keydown listener with Escape, trap, restore (no duplicate)", () => {
    expect(control).toMatch(/handleStudioDialogKeydown/);
    expect(control).toMatch(/getStudioDialogFocusable/);
    expect(control).toMatch(/previouslyFocusedRef/);
    expect(control).toMatch(/previouslyFocusedRef\.current \?\? triggerRef/);
    expect(control).toMatch(/addEventListener\("keydown", onKeyDown\)/);
    expect(control).toMatch(/removeEventListener\("keydown", onKeyDown\)/);
    expect(control).not.toMatch(
      /addEventListener\("keydown", onKeyDown, true\)/,
    );
    // Exactly one window keydown registration in the a11y effect.
    expect(control.match(/addEventListener\("keydown"/g)?.length).toBe(1);
    expect(control.match(/removeEventListener\("keydown"/g)?.length).toBe(1);
    expect(control).toMatch(/data-testid="studio-export-close"/);
    expect(control).toMatch(/data-testid="studio-export-backdrop"/);
    expect(control).toMatch(/closeDialog/);
  });

  it("opening does not enqueue; closeDialog only toggles open", () => {
    expect(control).toMatch(
      /const closeDialog = useCallback\(\(\) => \{\s*setOpen\(false\);\s*\}, \[\]\);/,
    );
    expect(control).not.toMatch(/closeDialog[\s\S]{0,40}enqueueExport/);
    const a11yEffect = control.match(
      /\/\/ Stage I\.3A[\s\S]*?\}, \[open, closeDialog\]\);/,
    )?.[0];
    expect(a11yEffect).toBeTruthy();
    expect(a11yEffect).not.toMatch(/enqueueExport|studioExportEnqueueUrl|fetch\(/);
  });

  it("Escape closes dialog without changing export phase", () => {
    const onClose = vi.fn();
    const preventDefault = vi.fn();
    handleStudioDialogKeydown({
      event: { key: "Escape", preventDefault },
      panel: {} as HTMLElement,
      onClose,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Tab from last focusable wraps to first (stays in dialog)", () => {
    const first = mockFocusable("first");
    const last = mockFocusable("last");
    const preventDefault = vi.fn();
    handleStudioDialogKeydown({
      event: { key: "Tab", shiftKey: false, preventDefault },
      panel: { focus: vi.fn() } as unknown as HTMLElement,
      onClose: vi.fn(),
      getFocusable: () => [first, last],
      activeElement: last,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();
    expect(last.focus).not.toHaveBeenCalled();
  });

  it("Shift+Tab from first focusable wraps to last", () => {
    const first = mockFocusable("first");
    const last = mockFocusable("last");
    const preventDefault = vi.fn();
    handleStudioDialogKeydown({
      event: { key: "Tab", shiftKey: true, preventDefault },
      panel: { focus: vi.fn() } as unknown as HTMLElement,
      onClose: vi.fn(),
      getFocusable: () => [first, last],
      activeElement: first,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();
    expect(first.focus).not.toHaveBeenCalled();
  });

  it("Shift+Tab from panel shell wraps to last (initial focus edge)", () => {
    const panel = mockFocusable("panel");
    const first = mockFocusable("first");
    const last = mockFocusable("last");
    const preventDefault = vi.fn();
    handleStudioDialogKeydown({
      event: { key: "Tab", shiftKey: true, preventDefault },
      panel,
      onClose: vi.fn(),
      getFocusable: () => [first, last],
      activeElement: panel,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();
  });

  it("Tab in the middle does not steal focus (native order)", () => {
    const first = mockFocusable("first");
    const mid = mockFocusable("mid");
    const last = mockFocusable("last");
    const preventDefault = vi.fn();
    handleStudioDialogKeydown({
      event: { key: "Tab", shiftKey: false, preventDefault },
      panel: { focus: vi.fn() } as unknown as HTMLElement,
      onClose: vi.fn(),
      getFocusable: () => [first, mid, last],
      activeElement: mid,
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(first.focus).not.toHaveBeenCalled();
    expect(last.focus).not.toHaveBeenCalled();
  });

  it("empty focusables keep focus on panel (no background escape)", () => {
    const panel = mockFocusable("panel");
    const preventDefault = vi.fn();
    handleStudioDialogKeydown({
      event: { key: "Tab", shiftKey: false, preventDefault },
      panel,
      onClose: vi.fn(),
      getFocusable: () => [],
      activeElement: panel,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(panel.focus).toHaveBeenCalledOnce();
  });

  it("re-open contract: effect keys on open + restores via previouslyFocusedRef/trigger", () => {
    expect(control).toMatch(/first\?\.focus\(\)/);
    expect(control).toMatch(/\}, \[open, closeDialog\]\);/);
    expect(control).toMatch(/restore\?\.focus\?\.\(\)/);
    expect(control).toMatch(/studio-export-close/);
    expect(control).toMatch(/onClick=\{closeDialog\}/);
  });
});
