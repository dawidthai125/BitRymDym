import { BITEK_LIMITS } from "./types";

/**
 * Per-user daily limit. Primary: DB RPC `bitek_chat_consume` (migration prepared, not applied).
 * Fallback while the RPC is missing: per-instance in-memory counter (best effort on serverless).
 */
type RpcClient = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

const memory = new Map<string, { day: string; used: number }>();

export function memoryConsume(userKey: string, limit: number, day = new Date().toISOString().slice(0, 10)): boolean {
  const cur = memory.get(userKey);
  if (!cur || cur.day !== day) {
    memory.set(userKey, { day, used: 1 });
    return true;
  }
  if (cur.used >= limit) return false;
  cur.used += 1;
  return true;
}

export async function consumeBitekQuota(
  client: RpcClient,
  userKey: string,
  limit: number = BITEK_LIMITS.dailyMessagesPerUser,
): Promise<{ allowed: boolean; source: "db" | "memory" }> {
  try {
    const { data, error } = await client.rpc("bitek_chat_consume", { p_limit: limit });
    if (!error && typeof data === "boolean") return { allowed: data, source: "db" };
  } catch {
    /* fall through */
  }
  return { allowed: memoryConsume(userKey, limit), source: "memory" };
}
