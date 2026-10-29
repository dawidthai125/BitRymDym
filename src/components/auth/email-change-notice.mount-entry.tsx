/**
 * Test-only IIFE entry: mount real EmailChangeNotice via props.
 * Bundled by email-change-notice.mount-host.ts — not an app route.
 */
import { createRoot, type Root } from "react-dom/client";
import { withIntl } from "@/test/intl-test-provider";

import { EmailChangeNotice } from "@/components/auth/email-change-notice";
import type { EmailChangeNoticeStatus } from "@/lib/auth/email-change";

export type EmailChangeNoticeMountStatus = EmailChangeNoticeStatus | null;

export type EmailChangeNoticeMountApi = {
  mount: (status: EmailChangeNoticeMountStatus, hostId?: string) => void;
  unmount: () => void;
};

declare global {
  interface Window {
    __BRD_EMAIL_CHANGE_NOTICE_MOUNT__?: EmailChangeNoticeMountApi;
  }
}

let root: Root | null = null;

function mount(
  status: EmailChangeNoticeMountStatus,
  hostId = "email-change-notice-mount-root",
): void {
  const el = document.getElementById(hostId);
  if (!el) throw new Error(`mount host #${hostId} missing`);
  if (root) {
    root.unmount();
    root = null;
  }
  root = createRoot(el);
  if (status === null) {
    root.render(withIntl(null));
    return;
  }
  root.render(withIntl(<EmailChangeNotice status={status} />));
}

function unmount(): void {
  root?.unmount();
  root = null;
}

window.__BRD_EMAIL_CHANGE_NOTICE_MOUNT__ = { mount, unmount };
