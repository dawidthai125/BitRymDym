/** "Send feedback" / "Report a bug" (pure rules, client-safe). The database checks the same limits. */

export const SUPPORT_KINDS = ["opinion", "bug"] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];
export type SupportSide = "user" | "staff";
export type SupportStatus = "open" | "closed";

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;
export const BODY_MAX = 4000;

export type SupportThread = {
  id: string;
  kind: SupportKind;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  lastMessageAt: string;
  lastSender: SupportSide;
  userUnread: number;
  staffUnread: number;
  userReadAt: string | null;
  staffReadAt: string | null;
};

export type SupportMessage = { id: string; sender: SupportSide; body: string; createdAt: string };

export function cleanBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim();
  return body.length >= 1 && body.length <= BODY_MAX ? body : null;
}

/** A path on our site only (no host, no query: query strings can carry tokens). */
export function cleanPagePath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  const path = value.split(/[?#]/)[0].slice(0, 300);
  // Private listen links carry their secret in the path.
  if (/^\/(listen|r|auth)\//.test(path)) return path.slice(0, path.indexOf("/", 1) + 1) + "…";
  return path;
}

export type NewThread = { kind: SupportKind; subject: string; body: string; page: string | null };

export function cleanNewThread(input: { kind?: unknown; subject?: unknown; body?: unknown; page?: unknown }): NewThread | null {
  const kind = SUPPORT_KINDS.find((k) => k === input.kind);
  const body = cleanBody(input.body);
  const subject = typeof input.subject === "string" ? input.subject.replace(/\s+/g, " ").trim() : "";
  if (!kind || !body || subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX) return null;
  return { kind, subject, body, page: cleanPagePath(input.page) };
}

/** Like in a messenger: ✓ sent, ✓✓ once the other side opened the chat after the message. */
export function isRead(message: SupportMessage, thread: Pick<SupportThread, "userReadAt" | "staffReadAt">): boolean {
  const readAt = message.sender === "user" ? thread.staffReadAt : thread.userReadAt;
  return readAt != null && Date.parse(readAt) >= Date.parse(message.createdAt);
}

/** Polling: every 10 s while the chat is active, every 30 s after 5 quiet minutes. */
export function pollDelayMs(quietMs: number): number {
  return quietMs > 5 * 60_000 ? 30_000 : 10_000;
}
