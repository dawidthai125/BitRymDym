/**
 * A3 — Mix Working revision history UI contracts (client + control wiring).
 * No RTL; mirrors studio-export-ui.test.ts style.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  formatMixRevisionDiffValue,
  formatMixRevisionWhen,
  groupMixRevisionDiffChanges,
  isLikelyTipRevision,
  mapMixRevisionCompareHttpResult,
  mapMixRevisionDetailHttpResult,
  mapMixRevisionListHttpResult,
  mapMixRevisionRestoreHttpResult,
  mixRevisionAuthorLabel,
  mixRevisionDiffPathLabel,
  mixRevisionKindLabel,
  mixWorkingRevisionCompareUrl,
  mixWorkingRevisionRestoreUrl,
  mixWorkingRevisionUrl,
  mixWorkingRevisionsUrl,
  studioProjectDocumentUrl,
} from "@/lib/studio/mix-working/mix-working-revision-client";

const ROOT = process.cwd();

describe("A3 Mix Working revision UI — client", () => {
  it("builds revision API URLs", () => {
    expect(mixWorkingRevisionsUrl("p1")).toBe(
      "/api/studio/projects/p1/mix-working/revisions",
    );
    expect(mixWorkingRevisionsUrl("p1", { limit: 20, cursor: "2026-01-01" })).toBe(
      "/api/studio/projects/p1/mix-working/revisions?limit=20&cursor=2026-01-01",
    );
    expect(mixWorkingRevisionUrl("p1", "r1")).toBe(
      "/api/studio/projects/p1/mix-working/revisions/r1",
    );
    expect(mixWorkingRevisionCompareUrl("p1")).toBe(
      "/api/studio/projects/p1/mix-working/revisions/compare",
    );
    expect(mixWorkingRevisionRestoreUrl("p1", "r1")).toBe(
      "/api/studio/projects/p1/mix-working/revisions/r1/restore",
    );
    expect(studioProjectDocumentUrl("p1")).toBe("/api/studio/projects/p1");
  });

  it("labels kinds/authors without inventing unknown as empty", () => {
    expect(mixRevisionKindLabel("tip_apply")).toBe("Zmiana miksu");
    expect(mixRevisionKindLabel("restored")).toBe("Przywrócenie");
    expect(mixRevisionAuthorLabel("USER")).toBe("Ty");
    expect(mixRevisionKindLabel("custom_kind")).toBe("custom_kind");
  });

  it("formats diff values and groups paths", () => {
    expect(formatMixRevisionDiffValue(true)).toBe("tak");
    expect(formatMixRevisionDiffValue(-1.23456)).toBe("-1.235");
    expect(mixRevisionDiffPathLabel("project.masterGainDb")).toContain("Master");
    expect(mixRevisionDiffPathLabel("tracks.t1.muted")).toContain("mute");
    const groups = groupMixRevisionDiffChanges([
      { path: "project.masterGainDb", before: 0, after: -1 },
      { path: "tracks.t1.gainDb", before: 0, after: -3 },
    ]);
    expect(groups.map((g) => g.group)).toEqual(["master", "tracks"]);
  });

  it("maps tip marker by sourceDocumentVersion", () => {
    expect(
      isLikelyTipRevision({ sourceDocumentVersion: 4 }, 4),
    ).toBe(true);
    expect(
      isLikelyTipRevision({ sourceDocumentVersion: 3 }, 4),
    ).toBe(false);
  });

  it("formatMixRevisionWhen returns empty for invalid ISO", () => {
    expect(formatMixRevisionWhen("")).toBe("");
    expect(formatMixRevisionWhen("not-a-date")).toBe("");
  });

  it("maps list/detail/compare/restore HTTP results", () => {
    const list = mapMixRevisionListHttpResult({
      httpStatus: 200,
      json: {
        success: true,
        revisions: [{ id: "r1", hasSnapshot: true }],
        nextCursor: null,
      },
    });
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.revisions).toHaveLength(1);

    const empty = mapMixRevisionListHttpResult({
      httpStatus: 200,
      json: { success: true, revisions: [], nextCursor: null },
    });
    expect(empty.ok).toBe(true);

    const unauth = mapMixRevisionListHttpResult({
      httpStatus: 401,
      json: { error: "x" },
    });
    expect(unauth.ok).toBe(false);
    if (!unauth.ok) expect(unauth.kind).toBe("unauthenticated");

    const detail = mapMixRevisionDetailHttpResult({
      httpStatus: 200,
      json: { success: true, revision: { id: "r1" } },
    });
    expect(detail.ok).toBe(true);

    const compare = mapMixRevisionCompareHttpResult({
      httpStatus: 200,
      json: {
        success: true,
        diff: { kind: "MIX_WORKING_REVISION_DIFF", changes: [] },
      },
    });
    expect(compare.ok).toBe(true);

    const cas = mapMixRevisionRestoreHttpResult({
      httpStatus: 409,
      json: { code: "FX_CHAIN_VERSION_CONFLICT", error: "conflict" },
    });
    expect(cas.ok).toBe(false);
    if (!cas.ok) {
      expect(cas.kind).toBe("conflict_cas");
      expect(cas.message).toMatch(/Odśwież/);
    }

    const reuse = mapMixRevisionRestoreHttpResult({
      httpStatus: 409,
      json: { code: "IDEMPOTENCY_KEY_REUSE", error: "reuse" },
    });
    expect(reuse.ok).toBe(false);
    if (!reuse.ok) expect(reuse.kind).toBe("idempotency_reuse");

    const tipMatch = mapMixRevisionRestoreHttpResult({
      httpStatus: 400,
      json: {
        code: "REVISION_INVALID",
        error: "Restore target matches tip mix plane (no ops).",
      },
    });
    expect(tipMatch.ok).toBe(false);
    if (!tipMatch.ok) {
      expect(tipMatch.kind).toBe("revision_invalid");
      expect(tipMatch.message).toMatch(/bieżącemu stanowi/);
    }

    const otherInvalid = mapMixRevisionRestoreHttpResult({
      httpStatus: 400,
      json: { code: "REVISION_INVALID", error: "bad snapshot shape" },
    });
    expect(otherInvalid.ok).toBe(false);
    if (!otherInvalid.ok) {
      expect(otherInvalid.message).not.toMatch(/bieżącemu stanowi/);
    }

    const okRestore = mapMixRevisionRestoreHttpResult({
      httpStatus: 200,
      json: {
        success: true,
        documentVersion: 5,
        documentDigest: "a".repeat(64),
        replay: true,
        revisionId: "r-new",
      },
    });
    expect(okRestore.ok).toBe(true);
    if (okRestore.ok) expect(okRestore.replay).toBe(true);

    const network = mapMixRevisionListHttpResult({
      httpStatus: 0,
      json: {},
      network: true,
    });
    expect(network.ok).toBe(false);
    if (!network.ok) expect(network.kind).toBe("network");
  });
});

describe("A3 Mix Working revision UI — control + editor wiring", () => {
  const control = readFileSync(
    join(ROOT, "src/components/studio/studio-mix-revision-history-control.tsx"),
    "utf8",
  );
  const editor = readFileSync(
    join(ROOT, "src/components/studio/studio-editor.tsx"),
    "utf8",
  );

  it("exposes transport entry and dialog testids", () => {
    expect(control).toMatch(/data-testid="studio-transport-mix-history"/);
    expect(control).toMatch(/data-testid="studio-mix-history-dialog"/);
    expect(control).toMatch(/data-testid="studio-mix-history-restore-dialog"/);
    expect(control).toMatch(/data-testid="studio-mix-history-restore-confirm"/);
    expect(control).toMatch(/data-testid="studio-mix-history-restore-cancel"/);
    expect(control).toMatch(/data-testid="studio-mix-history-list-empty"/);
    expect(control).toMatch(/data-testid="studio-mix-history-compare-run"/);
  });

  it("shows A3.5 migration notice without feature-flag hide", () => {
    expect(control).toMatch(
      /data-testid="studio-mix-history-migration-notice"/,
    );
    expect(control).toMatch(/data-brd-mix-history-migration-notice="a35"/);
    expect(control).toMatch(/Historia obejmuje parametry miksu/);
    expect(control).toMatch(/starsze ścieżki edytora/);
    expect(control).not.toMatch(/featureFlag.*migration-notice/i);
    expect(control).not.toMatch(/setTimeout\([^)]*migration/i);
  });

  it("requires confirm before restore POST and blocks double submit", () => {
    expect(control).toMatch(/beginRestoreConfirm/);
    expect(control).toMatch(/confirmRestore/);
    expect(control).toMatch(/restoreSubmitting/);
    expect(control).toMatch(/disabled=\{restoreSubmitting\}/);
    // Selection opens detail only; restore POST lives in confirmRestore.
    expect(control).toMatch(/onSelect=\{\(id\) => void openDetail\(id\)\}/);
    expect(control).not.toMatch(/onSelect=\{[^}]*confirmRestore/);
    expect(control).toMatch(/async function confirmRestore/);
    const confirmIdx = control.indexOf("async function confirmRestore");
    const postIdx = control.indexOf(
      "mixWorkingRevisionRestoreUrl(projectId, revisionId)",
    );
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(postIdx).toBeGreaterThan(confirmIdx);
    expect(control).toMatch(/restoreRequestIdRef/);
    expect(control).toMatch(/crypto\.randomUUID/);
  });

  it("uses dialog focus helpers and Polish restore copy", () => {
    expect(control).toMatch(/handleStudioDialogKeydown/);
    expect(control).toMatch(/getStudioDialogFocusable/);
    expect(control).toMatch(/Przywrócić tę rewizję miksu\?/);
    expect(control).toMatch(/Anuluj/);
    expect(control).toMatch(/nie przywraca plików audio/);
  });

  it("refetches project document after restore via existing API", () => {
    expect(control).toMatch(/studioProjectDocumentUrl/);
    expect(control).toMatch(/onDocumentRefreshed/);
    expect(control).not.toMatch(/window\.confirm/);
    expect(control).not.toMatch(/\balert\(/);
  });

  it("wires history control beside export in Studio transport", () => {
    expect(editor).toMatch(/StudioMixRevisionHistoryControl/);
    expect(editor).toMatch(/onDocumentRefreshed/);
    expect(editor).toMatch(/tipDocumentVersion/);
    const hist = editor.indexOf("<StudioMixRevisionHistoryControl");
    const exp = editor.indexOf("<StudioExportControl");
    expect(hist).toBeGreaterThan(-1);
    expect(exp).toBeGreaterThan(hist);
  });

  it("does not call mix-working apply from history UI (restore only)", () => {
    expect(control).not.toMatch(/mix-working\/apply/);
  });
});

describe("A3.2 Mix Working revision UI — loading race + mobile restore layer", () => {
  const control = readFileSync(
    join(ROOT, "src/components/studio/studio-mix-revision-history-control.tsx"),
    "utf8",
  );
  const bottomNav = readFileSync(
    join(ROOT, "src/components/site/mobile-bottom-nav.tsx"),
    "utf8",
  );
  const editor = readFileSync(
    join(ROOT, "src/components/studio/studio-editor.tsx"),
    "utf8",
  );

  function classesOf(source: string, anchor: RegExp): string {
    const match = anchor.exec(source);
    if (!match) throw new Error(`anchor not found: ${anchor}`);
    const tagStart = source.lastIndexOf("<", match.index);
    const cls = /className=(?:\{cn\(\s*)?"([^"]+)"/.exec(source.slice(tagStart));
    if (!cls) throw new Error(`className not found for ${anchor}`);
    return cls[1]!;
  }

  function zIndexOf(cls: string): number {
    const m = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/.exec(cls);
    if (!m) throw new Error(`no z-index in: ${cls}`);
    return Number(m[1] ?? m[2]);
  }

  it("uses explicit listLoadState and resolves panel kind (no empty while loading)", () => {
    expect(control).toMatch(/listLoadState/);
    expect(control).toMatch(/resolveMixHistoryListPanelKind/);
    expect(control).toMatch(/setListLoadState\("loading"\)/);
    expect(control).toMatch(/setListLoadState\("success"\)/);
    expect(control).toMatch(/setListLoadState\("error"\)/);
    // Empty testid only in panelKind === "empty" branch, not loading∧length===0.
    expect(control).toMatch(/panelKind === "empty"/);
    expect(control).toMatch(/panelKind === "loading"/);
    expect(control).not.toMatch(
      /if \(props\.loading && props\.revisions\.length === 0\)/,
    );
  });

  it("sets loading synchronously when opening history", () => {
    expect(control).toMatch(
      /setOpen\(\(v\) => \{\s*if \(!v\) \{\s*[\s\S]*?setListLoadState\("loading"\)/,
    );
  });

  it("portals history layer to document.body above MobileBottomNav", () => {
    expect(control).toMatch(/createPortal/);
    expect(control).toMatch(/document\.body/);
    expect(control).toMatch(/data-testid="studio-mix-history-layer"/);
    const layer = classesOf(control, /data-testid="studio-mix-history-layer"/);
    const nav = classesOf(bottomNav, /aria-label="Nawigacja mobilna"/);
    const transport = classesOf(editor, /data-testid="studio-transport"/);
    expect(zIndexOf(layer)).toBeGreaterThan(zIndexOf(nav));
    expect(zIndexOf(transport)).toBeLessThan(zIndexOf(nav));
    expect(zIndexOf(layer)).toBeGreaterThan(zIndexOf(transport));
  });

  it("pads history sheet and restore dialog for safe-area on mobile", () => {
    expect(control).toMatch(/pb-\[env\(safe-area-inset-bottom\)\]/);
    expect(control).toMatch(
      /bottom-\[max\(1\.5rem,env\(safe-area-inset-bottom\)\)\]/,
    );
    expect(control).toMatch(/studio-mix-history-detail-restore/);
    expect(control).toMatch(/sticky bottom-0/);
  });

  it("keeps restore cancel/confirm testids and no mutate on cancel path", () => {
    expect(control).toMatch(/data-testid="studio-mix-history-restore-cancel"/);
    expect(control).toMatch(/data-testid="studio-mix-history-restore-confirm"/);
    expect(control).toMatch(/setRestoreOpen\(false\)/);
    const cancelIdx = control.indexOf(
      'data-testid="studio-mix-history-restore-cancel"',
    );
    const cancelOnClick = control.indexOf("onClick={() => setRestoreOpen(false)}", cancelIdx);
    expect(cancelOnClick).toBeGreaterThan(cancelIdx);
    const cancelSlice = control.slice(cancelOnClick, cancelOnClick + 80);
    expect(cancelSlice).not.toMatch(/confirmRestore/);
    expect(cancelSlice).not.toMatch(/fetch\(/);
  });
});
