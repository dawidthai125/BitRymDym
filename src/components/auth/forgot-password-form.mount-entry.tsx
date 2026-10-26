/**
 * Test-only IIFE entry: mount real ForgotPasswordForm (real Button).
 * Bundled by forgot-password-form.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";

import { ForgotPasswordForm } from "@/components/auth/auth-forms";

export type ForgotPasswordFormMountApi = {
  mount: (hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_FORGOT_PASSWORD_FORM_MOUNT__?: ForgotPasswordFormMountApi;
  }
}

let root: Root | null = null;

function mount(hostId = "forgot-password-form-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  if (typeof window !== "undefined") {
    window.__BRD_FORGOT_PASSWORD_MOCK_CALLS__ = 0;
  }
  root = createRoot(el);
  root.render(<ForgotPasswordForm />);
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_FORGOT_PASSWORD_FORM_MOUNT__ = { mount, unmount };
