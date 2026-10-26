/**
 * Test-only IIFE entry: mount real ChangePasswordForm (real Button).
 * Bundled by change-password-form.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";

import { ChangePasswordForm } from "@/components/auth/auth-forms";

export type ChangePasswordFormMountApi = {
  mount: (hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_CHANGE_PASSWORD_FORM_MOUNT__?: ChangePasswordFormMountApi;
  }
}

let root: Root | null = null;

function mount(hostId = "change-password-form-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  if (typeof window !== "undefined") {
    window.__BRD_CHANGE_PASSWORD_MOCK_CALLS__ = 0;
  }
  root = createRoot(el);
  root.render(<ChangePasswordForm />);
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_CHANGE_PASSWORD_FORM_MOUNT__ = { mount, unmount };
