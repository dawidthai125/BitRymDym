/**
 * Test-only IIFE entry: mount real SignInForm (real Button).
 * Bundled by sign-in-form.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";

import { SignInForm } from "@/components/auth/auth-forms";

export type SignInFormMountApi = {
  mount: (hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_SIGN_IN_FORM_MOUNT__?: SignInFormMountApi;
  }
}

let root: Root | null = null;

function mount(hostId = "sign-in-form-mount-root"): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  if (typeof window !== "undefined") {
    window.__BRD_SIGN_IN_MOCK_CALLS__ = 0;
  }
  root = createRoot(el);
  root.render(<SignInForm />);
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_SIGN_IN_FORM_MOUNT__ = { mount, unmount };
