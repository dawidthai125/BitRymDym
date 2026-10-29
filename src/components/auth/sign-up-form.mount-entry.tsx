/**
 * Test-only IIFE entry: mount real SignUpForm (real Button).
 * Bundled by sign-up-form.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";
import { withIntl } from "@/test/intl-test-provider";

import { SignUpForm } from "@/components/auth/auth-forms";

export type SignUpFormMountApi = {
  mount: (hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_SIGN_UP_FORM_MOUNT__?: SignUpFormMountApi;
  }
}

let root: Root | null = null;

function mount(hostId = "sign-up-form-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  if (typeof window !== "undefined") {
    window.__BRD_SIGN_UP_MOCK_CALLS__ = 0;
  }
  root = createRoot(el);
  root.render(withIntl(<SignUpForm />));
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_SIGN_UP_FORM_MOUNT__ = { mount, unmount };
