import { BitekProviderError, type BitekLlmProvider } from "./providers";

/**
 * E3 provider via DB queue (bitek_llm_jobs). The route enqueues with service_role and polls;
 * the E3 worker claims (SKIP LOCKED), calls its localhost llama-server and writes the result.
 * No inbound connection to E3.
 */
export type BitekQueueDb = {
  insertJob(messages: unknown[], expiresAt: Date): Promise<string>;
  readJob(id: string): Promise<{ status: string; result: string | null; error_code: string | null } | null>;
  expireJob(id: string): Promise<void>;
};

/**
 * E3 is a small CPU model (~30 tok/s prefill): keep the system prompt (stable prefix → llama.cpp cache)
 * and only the last few turns so a reply fits the ~20 s budget.
 */
export function trimForE3<T extends { role: string }>(messages: T[], keepTurns = 4): T[] {
  const system = messages.filter((m) => m.role === "system");
  const rest = messages.filter((m) => m.role !== "system");
  return [...system, ...rest.slice(-keepTurns)];
}

export function bitekQueueProvider(opts: {
  db: BitekQueueDb;
  timeoutMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): BitekLlmProvider {
  const timeoutMs = opts.timeoutMs ?? 20000;
  const pollMs = opts.pollMs ?? 300;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  return {
    id: "e3",
    compactPrompt: true,
    // Chain abort fires slightly after our own deadline so we can mark the job expired first.
    timeoutMs: timeoutMs + 1500,
    async complete(messages, signal) {
      let id: string;
      try {
        id = await opts.db.insertJob(trimForE3(messages), new Date(Date.now() + timeoutMs));
      } catch {
        throw new BitekProviderError("network");
      }
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline && !signal.aborted) {
        await sleep(pollMs);
        let row;
        try {
          row = await opts.db.readJob(id);
        } catch {
          continue;
        }
        if (!row) throw new BitekProviderError("bad_response");
        if (row.status === "done" && row.result) return row.result;
        if (row.status === "error") throw new BitekProviderError("server");
        if (row.status === "expired") throw new BitekProviderError("timeout");
      }
      await opts.db.expireJob(id).catch(() => undefined);
      throw new BitekProviderError("timeout");
    },
  };
}

type AdminLike = {
  from: (t: string) => {
    insert: (v: unknown) => { select: (c: string) => { single: () => PromiseLike<{ data: { id: string } | null; error: unknown }> } };
    select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> } };
    update: (v: unknown) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => PromiseLike<{ error: unknown }> } };
  };
};

export function supabaseBitekQueueDb(admin: AdminLike): BitekQueueDb {
  return {
    async insertJob(messages, expiresAt) {
      const { data, error } = await admin
        .from("bitek_llm_jobs")
        .insert({ messages, expires_at: expiresAt.toISOString() })
        .select("id")
        .single();
      if (error || !data) throw new Error("enqueue_failed");
      return data.id;
    },
    async readJob(id) {
      const { data, error } = await admin.from("bitek_llm_jobs").select("status,result,error_code").eq("id", id).maybeSingle();
      if (error) throw new Error("read_failed");
      return (data as { status: string; result: string | null; error_code: string | null } | null) ?? null;
    },
    async expireJob(id) {
      await admin.from("bitek_llm_jobs").update({ status: "expired", finished_at: new Date().toISOString() }).eq("id", id).eq("status", "queued");
    },
  };
}
