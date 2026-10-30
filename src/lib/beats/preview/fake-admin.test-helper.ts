/** Minimal in-memory stand-in for the service_role Supabase client (tests only). */
export type FakeAsset = {
  id: string;
  beat_id: string;
  purpose: string;
  status: string;
  is_active: boolean;
  object_key: string;
  storage_bucket: string;
  original_filename: string | null;
  replaced_by_asset_id?: string | null;
  [k: string]: unknown;
};

export function createFakeAdmin(init: {
  beats: Array<{ id: string; ownership_type: string; owner_id: string | null; status?: string }>;
  assets: FakeAsset[];
  objects?: Record<string, Buffer>;
  failInsert?: boolean;
  failActivate?: boolean;
}) {
  const log: string[] = [];
  const objects = { ...(init.objects ?? {}) };
  const assets = init.assets;

  function table(name: string) {
    const filters: Array<[string, string, unknown]> = [];
    let op: "select" | "update" | "insert" = "select";
    let patch: Record<string, unknown> = {};
    const rows = () => {
      const src: Array<Record<string, unknown>> =
        name === "beats" ? (init.beats as Array<Record<string, unknown>>) : (assets as Array<Record<string, unknown>>);
      return src.filter((r) =>
        filters.every(([kind, col, v]) =>
          kind === "eq" ? r[col] === v : (v as unknown[]).includes(r[col]),
        ),
      );
    };
    const run = async () => {
      if (op === "update") {
        const target = rows();
        if (init.failActivate && patch.is_active === true && patch.status === undefined) {
          log.push(`update-fail:${target.map((r) => r.id).join(",")}`);
          return { data: null, error: { message: "activate failed" } };
        }
        if (patch.is_active === true) {
          for (const r of target) {
            const clash = assets.find(
              (a) => a.is_active && a.beat_id === r.beat_id && a.purpose === r.purpose && a.id !== r.id,
            );
            if (clash) return { data: null, error: { message: "unique" } };
          }
        }
        for (const r of target) Object.assign(r, patch);
        log.push(`update:${target.map((r) => r.id).join(",")}:${JSON.stringify(patch)}`);
        return { data: null, error: null };
      }
      return { data: rows(), error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      order: () => chain,
      eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), chain),
      in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), chain),
      update: (p: Record<string, unknown>) => ((op = "update"), (patch = p), chain),
      insert: async (row: FakeAsset) => {
        op = "insert";
        if (init.failInsert) return { error: { message: "insert failed" } };
        assets.push({ ...row });
        log.push(`insert:${row.id}`);
        return { error: null };
      },
      maybeSingle: async () => {
        const r = await run();
        const list = (r.data as unknown[]) ?? [];
        return { data: list[0] ?? null, error: r.error };
      },
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    };
    return chain;
  }

  const admin = {
    from: table,
    storage: {
      from: () => ({
        download: async (key: string) =>
          objects[key]
            ? { data: new Blob([new Uint8Array(objects[key]!)]), error: null }
            : { data: null, error: { message: "not found" } },
        upload: async (key: string, bytes: Buffer, opts: { contentType: string }) => {
          objects[key] = Buffer.from(bytes);
          log.push(`upload:${key}:${opts.contentType}`);
          return { error: null };
        },
        remove: async (keys: string[]) => {
          for (const k of keys) delete objects[k];
          log.push(`remove:${keys.join(",")}`);
          return { error: null };
        },
      }),
    },
  };
  return { admin, log, objects, assets };
}
