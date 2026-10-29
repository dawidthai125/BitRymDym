/**
 * STU-12 — leaving Studio during capture. The guard core runs against a fake
 * window / anchors / forms (no DOM in this vitest environment); source
 * contracts pin the editor + dialog wiring and the STU-10 close gate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  installStudioLeaveGuard,
  studioPageUnloadPrompt,
  STUDIO_LEAVE_GUARD_BODY_PL,
  type StudioLeaveGuardTarget,
  type StudioLeaveIntent,
} from "@/components/studio/studio-leave-guard";
import {
  isRecordingCaptureActive,
  type RecordingUiPhase,
} from "@/lib/takes/recording-ui-state";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const editor = read("src/components/studio/studio-editor.tsx");
const dialog = read("src/components/studio/studio-leave-guard-dialog.tsx");
const guardSrc = read("src/components/studio/studio-leave-guard.ts");
const mobileNav = read("src/components/site/mobile-bottom-nav.tsx");
const siteHeader = read("src/components/site/site-header.tsx");
const siteMainNav = read("src/components/site/site-main-nav.tsx");
const studioPage = read("src/app/studio/p/[projectId]/page.tsx");

const STUDIO_URL = "http://localhost:3000/studio/p/project-1";

type Listener = (event: never) => void;

function fakeWindow() {
  const listeners: { type: string; fn: Listener; capture: boolean }[] = [];
  const win = {
    location: { href: STUDIO_URL, assign: vi.fn() },
    addEventListener: (type: string, fn: Listener, capture?: boolean) => {
      listeners.push({ type, fn, capture: Boolean(capture) });
    },
    removeEventListener: (type: string, fn: Listener, capture?: boolean) => {
      const i = listeners.findIndex(
        (l) => l.type === type && l.fn === fn && l.capture === Boolean(capture),
      );
      if (i >= 0) listeners.splice(i, 1);
    },
    dispatch(type: string, event: object) {
      for (const l of [...listeners]) if (l.type === type) l.fn(event as never);
    },
    listeners,
  };
  return win;
}

type FakeWindow = ReturnType<typeof fakeWindow>;

function clickEvent(target: unknown, init: Partial<MouseEvent> = {}) {
  return {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...init,
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  };
}

/** Next <Link> renders a plain <a href>; navigation happens only if the click reaches React. */
function fakeAnchor(win: FakeWindow, href: string, attrs: Record<string, string> = {}) {
  const navigated: string[] = [];
  const anchor = {
    isConnected: true,
    getAttribute: (name: string) => (name === "href" ? href : (attrs[name] ?? null)),
    hasAttribute: (name: string) => name in attrs,
    closest: (selector: string) => (selector === "a[href]" ? anchor : null),
    click: vi.fn(() => userClick()),
  };
  const label = { closest: (selector: string) => anchor.closest(selector) };
  function userClick(init: Partial<MouseEvent> = {}) {
    const event = clickEvent(label, init);
    win.dispatch("click", event);
    if (!event.preventDefault.mock.calls.length) navigated.push(href);
    return event;
  }
  return { anchor, userClick, navigated };
}

function fakeForm(win: FakeWindow) {
  const submitted: unknown[] = [];
  const submitter = { name: "submit" };
  const form = {
    requestSubmit: vi.fn((s?: unknown) => userSubmit(s ?? null)),
  };
  function userSubmit(s: unknown = submitter) {
    const event = {
      defaultPrevented: false,
      target: form,
      submitter: s,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    win.dispatch("submit", event);
    if (!event.preventDefault.mock.calls.length) submitted.push(s);
    return event;
  }
  return { form, submitter, userSubmit, submitted };
}

function beforeUnload(win: FakeWindow) {
  const event = { preventDefault: vi.fn(), returnValue: undefined as unknown };
  win.dispatch("beforeunload", event);
  return event;
}

function setup(studioForms: unknown[] = []) {
  const win = fakeWindow();
  const intents: StudioLeaveIntent[] = [];
  const guard = installStudioLeaveGuard({
    target: win as unknown as StudioLeaveGuardTarget,
    studioRoot: () => ({ contains: (node) => studioForms.includes(node) }),
    onIntercept: (intent) => intents.push(intent),
  });
  return { win, intents, guard };
}

/** The hook installs the guard only while capture is active. */
function guardFor(phase: RecordingUiPhase) {
  const win = fakeWindow();
  const intents: StudioLeaveIntent[] = [];
  if (isRecordingCaptureActive(phase)) {
    installStudioLeaveGuard({
      target: win as unknown as StudioLeaveGuardTarget,
      studioRoot: () => null,
      onIntercept: (intent) => intents.push(intent),
    });
  }
  return { win, intents };
}

function hrefsFrom(source: string): string[] {
  return [...source.matchAll(/href[=:]\s*["{]?\s*"(\/[^"]*)"/g)].map((m) => m[1]!);
}

describe("STU-12 A — active capture blocks standard app navigation", () => {
  it("SiteHeader links are intercepted before Next sees the click", () => {
    // Primary desktop links live in SiteMainNav; auth CTAs remain in SiteHeader.
    const hrefs = [...hrefsFrom(siteHeader), ...hrefsFrom(siteMainNav)];
    expect(hrefs).toEqual(
      expect.arrayContaining(["/beats", "/about", "/studio", "/premium"]),
    );
    for (const href of hrefs) {
      const { win, intents } = setup();
      const link = fakeAnchor(win, href);
      const event = link.userClick();
      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(link.navigated).toEqual([]);
      expect(intents).toHaveLength(1);
      expect(intents[0]).toMatchObject({ kind: "link" });
    }
  });

  it("MobileBottomNav links are intercepted", () => {
    const hrefs = hrefsFrom(mobileNav);
    expect(hrefs).toEqual(
      expect.arrayContaining(["/beats", "/studio", "/library", "/profile"]),
    );
    for (const href of hrefs) {
      const { win, intents } = setup();
      const link = fakeAnchor(win, href);
      link.userClick();
      expect(link.navigated).toEqual([]);
      expect(intents).toHaveLength(1);
    }
  });

  it("Studio's own links (all projects, upgrade CTA) are intercepted", () => {
    expect(studioPage).toMatch(/href="\/studio"/);
    expect(readFileSync(join(process.cwd(), "src/components/studio/studio-edit-toolbar.tsx"), "utf8")).toMatch(/href=\{STUDIO_TRACK_UPGRADE_HREF\}/);
    for (const href of ["/studio", "/pricing", "https://example.com/elsewhere"]) {
      const { win, intents } = setup();
      const link = fakeAnchor(win, href);
      link.userClick();
      expect(link.navigated).toEqual([]);
      expect(intents[0]).toMatchObject({ kind: "link" });
    }
  });

  it("forms outside Studio (header search, sign-out) are intercepted; Studio forms are not", () => {
    const { win, intents } = setup();
    const header = fakeForm(win);
    const event = header.userSubmit();
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(header.submitted).toEqual([]);
    expect(intents[0]).toMatchObject({ kind: "form" });

    const insideWin = fakeWindow();
    const insideForm = fakeForm(insideWin);
    const insideIntents: StudioLeaveIntent[] = [];
    installStudioLeaveGuard({
      target: insideWin as unknown as StudioLeaveGuardTarget,
      studioRoot: () => ({ contains: (node) => node === (insideForm.form as unknown) }),
      onIntercept: (intent) => insideIntents.push(intent),
    });
    insideForm.userSubmit();
    expect(insideForm.submitted).toHaveLength(1);
    expect(insideIntents).toEqual([]);
  });

  it("clicks that keep Studio mounted pass through", () => {
    const cases: [string, Record<string, string>, Partial<MouseEvent>][] = [
      ["/beats", {}, { metaKey: true }],
      ["/beats", {}, { ctrlKey: true }],
      ["/beats", {}, { shiftKey: true }],
      ["/beats", {}, { button: 1 }],
      ["/beats", { target: "_blank" }, {}],
      ["/beats", { download: "" }, {}],
      ["#timeline", {}, {}],
      ["/studio/p/project-1#mixer", {}, {}],
      ["mailto:team@bitrymdym.pl", {}, {}],
    ];
    for (const [href, attrs, init] of cases) {
      const { win, intents } = setup();
      const link = fakeAnchor(win, href, attrs);
      const event = link.userClick(init);
      expect(event.preventDefault, href).not.toHaveBeenCalled();
      expect(intents, href).toEqual([]);
    }
  });
});

describe("STU-12 B — stay / leave", () => {
  it("stay: navigation does not happen and the guard keeps protecting", () => {
    const { win, intents } = setup();
    const link = fakeAnchor(win, "/library");
    link.userClick();
    // dialog "Zostań w Studio" just drops the intent — nothing is replayed
    expect(link.anchor.click).not.toHaveBeenCalled();
    expect(win.location.assign).not.toHaveBeenCalled();
    link.userClick();
    expect(intents).toHaveLength(2);
    expect(link.navigated).toEqual([]);
    expect(beforeUnload(win).preventDefault).toHaveBeenCalled();
  });

  it("leave: replays the same link once, uninterrupted, with no second native prompt", () => {
    const { win, intents, guard } = setup();
    const link = fakeAnchor(win, "/library");
    link.userClick();
    guard.proceed(intents[0]!);
    expect(link.anchor.click).toHaveBeenCalledTimes(1);
    expect(link.navigated).toEqual(["/library"]);
    expect(intents).toHaveLength(1);
    expect(beforeUnload(win).preventDefault).not.toHaveBeenCalled();
  });

  it("leave with a detached link falls back to a full navigation", () => {
    const { win, intents, guard } = setup();
    const link = fakeAnchor(win, "/beats");
    link.userClick();
    link.anchor.isConnected = false;
    guard.proceed(intents[0]!);
    expect(win.location.assign).toHaveBeenCalledWith("http://localhost:3000/beats");
  });

  it("leave on a form re-submits with the original submitter", () => {
    const { win, intents, guard } = setup();
    const header = fakeForm(win);
    header.userSubmit();
    guard.proceed(intents[0]!);
    expect(header.form.requestSubmit).toHaveBeenCalledWith(header.submitter);
    expect(header.submitted).toEqual([header.submitter]);
  });

  it("a new interception after a leave re-arms beforeunload", () => {
    const { win, intents, guard } = setup();
    const a = fakeAnchor(win, "/beats");
    a.userClick();
    guard.proceed(intents[0]!);
    fakeAnchor(win, "/library").userClick();
    expect(beforeUnload(win).preventDefault).toHaveBeenCalled();
  });
});

describe("STU-12 C — only capture phases are guarded", () => {
  const guarded: RecordingUiPhase[] = ["RECORDING", "STOPPING", "UPLOADING", "PROCESSING"];
  const unguarded: RecordingUiPhase[] = [
    "IDLE",
    "REQUESTING_MIC",
    "READY",
    "READY_TAKE",
    "MIC_DENIED",
    "RECORDING_ERROR",
    "UPLOAD_ERROR",
    "FINALIZE_ERROR",
    "EXPIRED",
  ];

  it.each(guarded)("%s → link intercepted, beforeunload prompts", (phase) => {
    const { win, intents } = guardFor(phase);
    const link = fakeAnchor(win, "/beats");
    link.userClick();
    expect(link.navigated).toEqual([]);
    expect(intents).toHaveLength(1);
    const unload = beforeUnload(win);
    expect(unload.preventDefault).toHaveBeenCalled();
    expect(unload.returnValue).toBe("");
  });

  it.each(unguarded)("%s → navigation and unload behave as before (no listeners)", (phase) => {
    const { win, intents } = guardFor(phase);
    expect(win.listeners).toEqual([]);
    const link = fakeAnchor(win, "/beats");
    link.userClick();
    expect(link.navigated).toEqual(["/beats"]);
    expect(intents).toEqual([]);
    expect(beforeUnload(win).preventDefault).not.toHaveBeenCalled();
  });

  it("dispose removes every listener (capture ends)", () => {
    const { win, guard } = setup();
    expect(win.listeners.map((l) => `${l.type}:${l.capture}`).sort()).toEqual([
      "beforeunload:false",
      "click:true",
      "submit:true",
    ]);
    guard.dispose();
    expect(win.listeners).toEqual([]);
  });

  it("browser back/forward (popstate) is not intercepted — documented limitation", () => {
    const { win } = setup();
    expect(win.listeners.some((l) => l.type === "popstate")).toBe(false);
    expect(guardSrc).toMatch(/back\/forward \(popstate\) is NOT intercepted/);
  });
});

describe("STU-12 D — copy and wiring", () => {
  it("warning says capture will be interrupted and never implies the take was saved", () => {
    expect(STUDIO_LEAVE_GUARD_BODY_PL).toMatch(/przerwane/);
    expect(STUDIO_LEAVE_GUARD_BODY_PL).not.toMatch(/(został|zostanie) zapisany/);
  });

  it("editor guards on recordingLocked (captureActive mirror) scoped to the Studio shell", () => {
    expect(editor).toMatch(/useStudioLeaveGuard\(recordingLocked, studioShellRef\)/);
    expect(editor).toMatch(/ref=\{studioShellRef\}\s+data-testid="studio-daw-shell"/);
    expect(editor).toMatch(
      /<StudioLeaveGuardDialog\s+open=\{leaveGuard\.open\}\s+onStay=\{leaveGuard\.stay\}\s+onLeave=\{leaveGuard\.leave\}/,
    );
  });

  it("hook installs only while active and drops a pending intent when capture ends", () => {
    expect(dialog).toMatch(/if \(!active\) return;\s+const guard = installStudioLeaveGuard/);
    expect(dialog).toMatch(/const intent = active \? pending : null;/);
  });

  it("dialog: alertdialog, Stay focused first, Escape/backdrop = stay, Escape swallowed in capture", () => {
    expect(dialog).toMatch(/role="alertdialog"/);
    expect(dialog).toMatch(/aria-modal="true"/);
    expect(dialog).toMatch(/stayRef\.current\?\.focus\(\)/);
    expect(dialog).toMatch(/window\.addEventListener\("keydown", onKeyDown, true\)/);
    expect(dialog).toMatch(/event\.key === "Escape"[\s\S]*?stopImmediatePropagation\(\);\s+onStay\(\)/);
    expect(dialog).toMatch(/onClick=\{onStay\}/);
    // above Inspector / Mixer (z-45) and FxSheet (z-50); bottom sheet on mobile
    expect(dialog).toMatch(/z-\[60\]/);
    expect(dialog).toMatch(/max-md:rounded-t-lg/);
    expect(dialog).toMatch(/min-h-11/);
  });

  it("STU-10 close gate and STU-08 timeline lock are untouched", () => {
    expect(editor).toMatch(/function closeInspectorOverlay\(\): boolean \{\s+if \(\s+studioInspectorOverlayCloseBlocked\(/);
    expect(editor).toMatch(/const timelineMode: TimelineMode = recordingLocked \? "seek" : mode;/);
    expect(editor).toMatch(/studioPreferRecordAfterCaptureReport\(prev, active\)/);
  });
});

describe("STU-12 E — one beforeunload prompt for persist and capture", () => {
  it("editor owns a single listener; the hook does not register a second one", () => {
    expect(editor.match(/addEventListener\("beforeunload"/g) ?? []).toHaveLength(1);
    expect(editor).toMatch(/studioPageUnloadPrompt\(/);
    expect(dialog).toMatch(/beforeUnload:\s*false/);
    expect(dialog).toMatch(/unloadAllowedRef\.current = true;/);
  });

  it.each([
    { persist: false, capture: false, expected: false },
    { persist: true, capture: false, expected: true },
    { persist: false, capture: true, expected: true },
    { persist: true, capture: true, expected: true },
  ])(
    "persist=$persist capture=$capture prompts once",
    ({ persist, capture, expected }) => {
      expect(
        studioPageUnloadPrompt({
          unloadAllowed: false,
          captureActive: capture,
          persistGuarded: persist,
        }),
      ).toBe(expected);
    },
  );

  it("confirmed Leave suppresses the prompt even when persist and capture are both active", () => {
    expect(
      studioPageUnloadPrompt({
        unloadAllowed: true,
        captureActive: true,
        persistGuarded: true,
      }),
    ).toBe(false);
  });

  it("a delegated guard plus the editor policy fires preventDefault once", () => {
    const rows = [
      { persist: false, capture: false, expected: 0 },
      { persist: true, capture: false, expected: 1 },
      { persist: false, capture: true, expected: 1 },
      { persist: true, capture: true, expected: 1 },
    ];
    for (const row of rows) {
      const win = fakeWindow();
      const guard = installStudioLeaveGuard({
        target: win as unknown as StudioLeaveGuardTarget,
        studioRoot: () => null,
        onIntercept: () => undefined,
        beforeUnload: false,
      });
      let prompts = 0;
      win.addEventListener("beforeunload", ((event: { preventDefault: () => void; returnValue: string }) => {
        if (
          studioPageUnloadPrompt({
            unloadAllowed: false,
            captureActive: row.capture,
            persistGuarded: row.persist,
          })
        ) {
          event.preventDefault();
          event.returnValue = "";
        }
      }) as never);
      win.dispatch("beforeunload", {
        preventDefault: () => {
          prompts += 1;
        },
        returnValue: "",
      });
      expect(prompts, JSON.stringify(row)).toBe(row.expected);
      expect(win.listeners.filter((l) => l.type === "beforeunload")).toHaveLength(1);
      guard.dispose();
      expect(win.listeners.filter((l) => l.type === "beforeunload")).toHaveLength(1);
      expect(win.listeners.filter((l) => l.type === "click" || l.type === "submit")).toHaveLength(0);
    }
  });
});
