/**
 * Stage 2b — BITEK per project (pure: types, validation, history mapping).
 * Rows live in public.studio_bitek_messages; this module has no I/O.
 */
import { BITEK_LIMITS, type BitekChatTurn } from "@/lib/studio/bitek/chat/types";

export const BITEK_MESSAGE_KINDS = ["chat", "welcome", "note", "fix", "state"] as const;
export type BitekMessageKind = (typeof BITEK_MESSAGE_KINDS)[number];
export type BitekMessageRole = "user" | "assistant";

export type BitekStoredMessage = {
  id: string;
  role: BitekMessageRole;
  kind: BitekMessageKind;
  content: string;
  meta: Record<string, unknown>;
  createdAt: string;
};

/** Kinds the client may append directly (chat rows are written by the chat route only). */
export const BITEK_CLIENT_KINDS: ReadonlySet<BitekMessageKind> = new Set(["welcome", "note", "fix", "state"]);

export const BITEK_STORE_LIMITS = {
  contentMaxChars: 2000,
  metaMaxBytes: 6000,
  listLimit: 120,
  rowsPerRequest: 4,
} as const;

export type BitekMessageInput = { role: "assistant"; kind: BitekMessageKind; content: string; meta: Record<string, unknown> };

function cleanText(s: string, max: number): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c < 32 && c !== 10 ? " " : ch;
  }
  return out.trim().slice(0, max);
}

/** Validate client-appended BITEK rows (assistant-only, allowlisted kinds, bounded). */
export function parseBitekMessageInputs(body: unknown): { ok: true; rows: BitekMessageInput[] } | { ok: false; error: string } {
  const raw = body && typeof body === "object" ? (body as { messages?: unknown }).messages : undefined;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > BITEK_STORE_LIMITS.rowsPerRequest) {
    return { ok: false, error: "bad_messages" };
  }
  const rows: BitekMessageInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, error: "bad_message" };
    const r = item as Record<string, unknown>;
    if (typeof r.kind !== "string" || !BITEK_CLIENT_KINDS.has(r.kind as BitekMessageKind)) return { ok: false, error: "bad_kind" };
    if (typeof r.content !== "string") return { ok: false, error: "bad_content" };
    const content = cleanText(r.content, BITEK_STORE_LIMITS.contentMaxChars);
    if (!content) return { ok: false, error: "bad_content" };
    const meta = r.meta && typeof r.meta === "object" && !Array.isArray(r.meta) ? (r.meta as Record<string, unknown>) : {};
    if (JSON.stringify(meta).length > BITEK_STORE_LIMITS.metaMaxBytes) return { ok: false, error: "meta_too_large" };
    rows.push({ role: "assistant", kind: r.kind as BitekMessageKind, content, meta });
  }
  return { ok: true, rows };
}

export function mapBitekRow(row: Record<string, unknown>): BitekStoredMessage | null {
  const kind = row.kind as BitekMessageKind;
  const role = row.role as BitekMessageRole;
  if (!BITEK_MESSAGE_KINDS.includes(kind) || (role !== "user" && role !== "assistant")) return null;
  if (typeof row.id !== "string" || typeof row.content !== "string") return null;
  return {
    id: row.id,
    role,
    kind,
    content: row.content,
    meta: row.meta && typeof row.meta === "object" ? (row.meta as Record<string, unknown>) : {},
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
  };
}

/** Last chat exchanges from the project store → model history (oldest first, bounded). */
export function bitekHistoryFromStore(messages: readonly BitekStoredMessage[]): BitekChatTurn[] {
  return messages
    .filter((m) => m.kind === "chat")
    .slice(-BITEK_LIMITS.historyMaxTurns)
    .map((m) => ({ role: m.role, content: m.content.slice(0, BITEK_LIMITS.historyTurnMaxChars) }));
}

export type BitekBubbleState = { minimized: boolean; dismissedKey: string | null };

export function parseBitekBubbleState(messages: readonly BitekStoredMessage[]): BitekBubbleState {
  const row = [...messages].reverse().find((m) => m.kind === "state");
  try {
    const v = row ? (JSON.parse(row.content) as Partial<BitekBubbleState>) : {};
    return { minimized: v.minimized === true, dismissedKey: typeof v.dismissedKey === "string" ? v.dismissedKey.slice(0, 80) : null };
  } catch {
    return { minimized: false, dismissedKey: null };
  }
}

/** True when PostgREST/Postgres reports the table is missing (migration not applied yet). */
export function isBitekStoreMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /studio_bitek_messages/.test(error.message ?? "") && /exist|schema cache/i.test(error.message ?? "");
}
