/**
 * Pure rules for comment moderation (DSA art. 16 notice mechanism).
 * Who may delete, hide and report a community comment, and what a report looks like.
 * Server code enforces these. The UI only uses them to choose which buttons to show.
 */

import type { SystemRole } from "@/types/domain";

export const REPORT_REASONS = ["spam", "abuse", "illegal", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_DETAILS_MAX = 500;
/** Reports one account may file per rolling hour. */
export const REPORTS_PER_HOUR = 10;
/** Distinct open reporters that hide a comment until staff decides. */
export const AUTO_HIDE_REPORTERS = 3;

export type HiddenReason = "owner" | "staff" | "reports";

export function parseReportReason(value: unknown): ReportReason | null {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value)
    ? (value as ReportReason)
    : null;
}

/** Null = no details. Undefined = invalid (wrong type or too long). */
export function cleanReportDetails(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text) return null;
  if (text.length > REPORT_DETAILS_MAX) return undefined;
  return text;
}

export function isStaffRole(role: SystemRole | null | undefined): boolean {
  return role === "ADMIN" || role === "MODERATOR";
}

export function isCommentVisible(row: { deleted_at?: string | null; hidden_at?: string | null }): boolean {
  return !row.deleted_at && !row.hidden_at;
}

export function canDeleteComment(viewerId: string | null, authorId: string): boolean {
  return viewerId !== null && viewerId === authorId;
}

/** The owner of the work under the comment, or staff. */
export function hideRole(input: {
  viewerId: string | null;
  workOwnerId: string | null;
  role: SystemRole | null | undefined;
}): "staff" | "owner" | null {
  if (!input.viewerId) return null;
  if (isStaffRole(input.role)) return "staff";
  if (input.workOwnerId && input.workOwnerId === input.viewerId) return "owner";
  return null;
}

export function shouldAutoHide(distinctOpenReporters: number): boolean {
  return distinctOpenReporters >= AUTO_HIDE_REPORTERS;
}

/** Public page that shows the thread a comment lives in. */
export function threadHref(kind: string, targetId: string): string {
  if (kind === "beat") return `/beat/${targetId}`;
  if (kind === "work") return `/utwor/${targetId}`;
  return "/sampel";
}
