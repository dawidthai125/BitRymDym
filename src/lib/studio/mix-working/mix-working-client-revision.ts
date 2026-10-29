/**
 * Stage 2 — client-supplied Mix Working revision meta (pure allowlist).
 *
 * Only `{ author: "AI", description }` is accepted (BITEK auto-fixes are
 * saved as an "AI" mix version). Anything else → undefined, i.e. the server
 * default (USER tip_apply). Kind / parent / restore fields are never taken
 * from the client.
 */

export const MIX_CLIENT_REVISION_DESCRIPTION_MAX = 500;

export type MixClientRevisionMeta = {
  author: "AI";
  kind: "accepted";
  description: string | null;
};

function stripControl(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 32 || code === 127 ? " " : ch;
  }
  return out;
}

export function parseClientMixRevisionMeta(
  raw: unknown,
): MixClientRevisionMeta | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  if (o.author !== "AI") return undefined;
  let description: string | null = null;
  if (typeof o.description === "string") {
    const clean = stripControl(o.description).replace(/\s+/g, " ").trim();
    description = clean
      ? Array.from(clean).slice(0, MIX_CLIENT_REVISION_DESCRIPTION_MAX).join("")
      : null;
  }
  return { author: "AI", kind: "accepted", description };
}
