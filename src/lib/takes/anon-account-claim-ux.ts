/** Pure P3 claim UX helpers — safe for unit tests (no server-only). */

export type AnonAccountClaimUx = "ok" | "none" | "cap" | "error";

export type AnonAccountClaimResult = {
  ux: AnonAccountClaimUx;
  takeId?: string;
  beatId?: string;
  code?: string;
};

export function accountClaimRedirectPath(
  result: AnonAccountClaimResult,
): string {
  if (result.ux === "none") {
    return "/account";
  }
  return `/account?claim=${result.ux}`;
}
