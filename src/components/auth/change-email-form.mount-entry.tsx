/**
 * Test-only IIFE entry: mount real ChangeEmailForm (real Button).
 * Bundled by change-email-form.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";

import { ChangeEmailForm } from "@/components/auth/auth-forms";

export type ChangeEmailFormMountApi = {
  mount: (hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_CHANGE_EMAIL_FORM_MOUNT__?: ChangeEmailFormMountApi;
  }
}

let root: Root | null = null;

function mount(hostId = "change-email-form-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  if (typeof window !== "undefined") {
    window.__BRD_CHANGE_EMAIL_MOCK_CALLS__ = 0;
  }
  root = createRoot(el);
  root.render(
    <ChangeEmailForm currentEmail="current@example.invalid" />,
  );
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_CHANGE_EMAIL_FORM_MOUNT__ = { mount, unmount };
