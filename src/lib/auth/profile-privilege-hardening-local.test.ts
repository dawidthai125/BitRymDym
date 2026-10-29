/**
 * F1-C — profiles privilege hardening, LOCAL Supabase only.
 *
 * Opt-in: F1C_LOCAL_DB_TEST=1 plus the shared integration gate
 * (BRD_INTEGRATION_TESTS=1, LOCAL_SUPABASE_URL / LOCAL_SUPABASE_ANON_KEY /
 * LOCAL_SUPABASE_SERVICE_ROLE_KEY from `supabase status -o env`).
 * Never reads .env.local (production). Aborts on any non-loopback URL.
 * Catalog checks run through `docker exec` against the local DB container.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertAllowedTestUrl, resolveIntegrationEnv } from "@/test/integration-env";

const integration =
  process.env.F1C_LOCAL_DB_TEST === "1"
    ? resolveIntegrationEnv()
    : ({ enabled: false, reason: "F1C_LOCAL_DB_TEST=1 not set" } as const);
const enabled = integration.enabled;
const url = integration.enabled ? integration.url : "";
const anonKey = integration.enabled ? integration.anonKey : "";
const serviceKey = integration.enabled ? integration.serviceKey : "";
const dbContainer =
  process.env.F1C_LOCAL_DB_CONTAINER ?? "supabase_db_bitrymdym-local";

function psql(sql: string, user: "postgres" | "authenticator" = "postgres") {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      "PGPASSWORD=postgres",
      dbContainer,
      "psql",
      "-X",
      "-q",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      "127.0.0.1",
      "-U",
      user,
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function psqlError(sql: string, user: "postgres" | "authenticator") {
  try {
    psql(sql, user);
    return null;
  } catch (err) {
    return String((err as { stderr?: string }).stderr ?? err);
  }
}

/** Returns one row per ACL/definition violation; empty output = hardened state. */
const PROFILES_HARDENING_VIOLATIONS_SQL = `
SELECT r || ' table ' || p
FROM unnest(ARRAY['anon','authenticated']) r,
     unnest(ARRAY['INSERT','UPDATE']) p
WHERE has_table_privilege(r, 'public.profiles', p)
UNION ALL
SELECT r || ' column ' || p || ' ' || a.attname
FROM unnest(ARRAY['anon','authenticated']) r,
     unnest(ARRAY['INSERT','UPDATE']) p,
     pg_attribute a
WHERE a.attrelid = 'public.profiles'::regclass AND a.attnum > 0 AND NOT a.attisdropped
  AND has_column_privilege(r, 'public.profiles', a.attname, p)
  AND NOT (r = 'authenticated' AND p = 'UPDATE' AND a.attname = 'display_name')
UNION ALL
SELECT 'authenticated missing UPDATE(display_name)'
WHERE NOT has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE')
UNION ALL
SELECT 'authenticated missing SELECT'
WHERE NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT')
UNION ALL
SELECT 'service_role missing ' || p
FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) p
WHERE NOT has_table_privilege('service_role', 'public.profiles', p)
UNION ALL
SELECT 'prevent_privilege_escalation definition'
FROM pg_proc f
WHERE f.oid = 'public.prevent_privilege_escalation()'::regprocedure
  AND (NOT f.prosecdef
       OR f.proconfig IS DISTINCT FROM ARRAY['search_path=""']
       OR f.prosrc !~ 'session_user IS DISTINCT FROM ''postgres'''
       OR f.prosrc ~* 'current_user')
UNION ALL
SELECT 'profiles RLS disabled'
WHERE NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.profiles'::regclass)
UNION ALL
SELECT 'policy profiles_update_own missing'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_policy
  WHERE polrelid = 'public.profiles'::regclass AND polname = 'profiles_update_own'
);
`;

type TestUser = { id: string; email: string; client: SupabaseClient };

const PROTECTED_PATCHES: Array<Record<string, unknown>> = [
  { role: "ADMIN" },
  { account_level: "PRO_RAPPER" },
  { experience_total: 999999 },
  { user_number: 424242 },
];

describe.runIf(enabled)("F1-C profiles privilege hardening (local Supabase)", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  const created: string[] = [];

  async function signUp(label: string): Promise<TestUser> {
    const email = `f1c-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
    const password = `F1c-${randomUUID()}`;
    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: { data: { display_name: `F1C ${label}` } },
    });
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    created.push(data.user!.id);
    return { id: data.user!.id, email, client };
  }

  async function profileOf(id: string) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, display_name, role, account_level, experience_total, user_number")
      .eq("id", id)
      .single();
    expect(error).toBeNull();
    return data!;
  }

  beforeAll(() => {
    assertAllowedTestUrl(url);
    expect(anonKey).not.toBe("");
    expect(serviceKey).not.toBe("");
    admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    anon = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (created.length > 0) {
      // Audit FKs are SET NULL: remove this suite's rows while they still point at its users.
      const ids = created.join(",");
      const { error } = await admin
        .from("admin_audit_events")
        .delete()
        .or(`target_user_id.in.(${ids}),actor_user_id.in.(${ids})`);
      expect(error).toBeNull();
    }
    for (const id of created) {
      await admin.auth.admin.deleteUser(id);
    }
  });

  it("T3: signUp creates profile via handle_new_user with defaults and user_number", async () => {
    const first = await signUp("t3a");
    const second = await signUp("t3b");
    const a = await profileOf(first.id);
    const b = await profileOf(second.id);

    expect(a.display_name).toBe("F1C t3a");
    expect(a.role).toBe("USER");
    expect(a.account_level).toBe("BEGINNER_RAPPER");
    expect(a.experience_total).toBe(0);
    expect(typeof a.user_number).toBe("number");
    expect(Number(b.user_number)).toBeGreaterThan(Number(a.user_number));

    const { error: insertErr } = await first.client.from("profiles").insert({
      id: randomUUID(),
      display_name: "forged",
    });
    expect(insertErr?.code).toBe("42501");
  });

  it("T1: authenticated updates own display_name only; protected columns and foreign rows blocked", async () => {
    const owner = await signUp("t1-owner");
    const other = await signUp("t1-other");
    const before = await profileOf(owner.id);

    const { data: renamed, error: renameErr } = await owner.client
      .from("profiles")
      .update({ display_name: "F1C renamed" })
      .eq("id", owner.id)
      .select("display_name");
    expect(renameErr).toBeNull();
    expect(renamed).toEqual([{ display_name: "F1C renamed" }]);

    for (const patch of PROTECTED_PATCHES) {
      const { error } = await owner.client
        .from("profiles")
        .update(patch)
        .eq("id", owner.id);
      expect(error?.code, JSON.stringify(patch)).toBe("42501");

      const { error: mixedErr } = await owner.client
        .from("profiles")
        .update({ display_name: "F1C mixed", ...patch })
        .eq("id", owner.id);
      expect(mixedErr?.code, JSON.stringify(patch)).toBe("42501");
    }

    const after = await profileOf(owner.id);
    expect(after).toEqual({ ...before, display_name: "F1C renamed" });

    const otherBefore = await profileOf(other.id);
    const { data: foreign, error: foreignErr } = await owner.client
      .from("profiles")
      .update({ display_name: "F1C hijack" })
      .eq("id", other.id)
      .select("id");
    expect(foreignErr).toBeNull();
    expect(foreign).toEqual([]);
    expect(await profileOf(other.id)).toEqual(otherBefore);
  });

  it("T2: anon has no profile INSERT/UPDATE", async () => {
    const target = await signUp("t2-target");
    const before = await profileOf(target.id);

    const { error: anonUpdateErr } = await anon
      .from("profiles")
      .update({ display_name: "anon" })
      .eq("id", target.id);
    expect(anonUpdateErr?.code).toBe("42501");

    const { error: anonInsertErr } = await anon
      .from("profiles")
      .insert({ id: randomUUID(), display_name: "anon" });
    expect(anonInsertErr?.code).toBe("42501");

    expect(await profileOf(target.id)).toEqual(before);
  });

  it("T2/T5: catalog ACL, function definition and RLS match the hardened state", () => {
    expect(psql(PROFILES_HARDENING_VIOLATIONS_SQL)).toBe("");
    expect(
      psql("SELECT to_regclass('public.profiles') IS NOT NULL AND EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261017081616');"),
    ).toBe("t");
  });

  it("T2: broad table grant regression is detected; trigger still blocks in SECURITY DEFINER context", async () => {
    const victim = await signUp("t2-trigger");
    const claims = JSON.stringify({ sub: victim.id, role: "authenticated" });
    const asAuthenticated = (statement: string) => `
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '${claims}', true);
SELECT session_user || '/' || current_user;
${statement}
COMMIT;`;

    expect(psql(asAuthenticated("SELECT 1;"), "authenticator")).toContain(
      "authenticator/authenticated",
    );

    psql("GRANT UPDATE ON TABLE public.profiles TO authenticated;");
    try {
      const violations = psql(PROFILES_HARDENING_VIOLATIONS_SQL);
      expect(violations).toContain("authenticated table UPDATE");

      for (const assignment of [
        "role = 'ADMIN'",
        "account_level = 'PRO_RAPPER'",
        "experience_total = 999999",
      ]) {
        const err = psqlError(
          asAuthenticated(
            `UPDATE public.profiles SET ${assignment} WHERE id = '${victim.id}';`,
          ),
          "authenticator",
        );
        expect(err, assignment).toContain(
          "Changing role, account_level, or experience_total is not allowed",
        );
      }

      const numberErr = psqlError(
        asAuthenticated(
          `UPDATE public.profiles SET user_number = 424242 WHERE id = '${victim.id}';`,
        ),
        "authenticator",
      );
      expect(numberErr).toContain("user_number is immutable");
    } finally {
      psql("REVOKE UPDATE ON TABLE public.profiles FROM authenticated; GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;");
    }

    expect(psql(PROFILES_HARDENING_VIOLATIONS_SQL)).toBe("");
    const after = await profileOf(victim.id);
    expect(after.role).toBe("USER");
    expect(after.account_level).toBe("BEGINNER_RAPPER");
    expect(after.experience_total).toBe(0);
  });

  it("T2: postgres maintainer session (session_user = postgres) may still change protected columns", async () => {
    const target = await signUp("t2-maint");
    const out = psql(`
BEGIN;
UPDATE public.profiles SET account_level = 'PRO_RAPPER' WHERE id = '${target.id}' RETURNING account_level;
ROLLBACK;`);
    expect(out).toContain("PRO_RAPPER");
    expect((await profileOf(target.id)).account_level).toBe("BEGINNER_RAPPER");
  });

  it("T4: service_role paths keep working; award/admin RPCs stay ACL-protected", async () => {
    const user = await signUp("t4-user");
    const actor = await signUp("t4-admin");

    const { error: promoteErr } = await admin
      .from("profiles")
      .update({ role: "ADMIN" })
      .eq("id", actor.id);
    expect(promoteErr).toBeNull();

    const awardArgs = {
      p_user_id: user.id,
      p_event_type: "PROFILE_COMPLETED",
      p_subject_id: user.id,
      p_amount: 10,
      p_idempotency_key: `f1c-${randomUUID()}`,
    };
    const { data: award, error: awardErr } = await admin.rpc(
      "award_creator_experience",
      awardArgs,
    );
    expect(awardErr).toBeNull();
    expect(award).toMatchObject({ awarded: true, experience_total: 10 });
    expect((await profileOf(user.id)).experience_total).toBe(10);

    const { error: clientAwardErr } = await user.client.rpc(
      "award_creator_experience",
      { ...awardArgs, p_idempotency_key: `f1c-${randomUUID()}` },
    );
    expect(clientAwardErr).not.toBeNull();

    const { data: applied, error: applyErr } = await admin.rpc(
      "admin_apply_user_management",
      { p_actor_id: actor.id, p_target_id: user.id, p_new_role: "MODERATOR" },
    );
    expect(applyErr).toBeNull();
    expect(applied).toMatchObject({ ok: true, roleChanged: true });
    expect((await profileOf(user.id)).role).toBe("MODERATOR");

    const { error: nonAdminActorErr } = await admin.rpc(
      "admin_apply_user_management",
      { p_actor_id: user.id, p_target_id: actor.id, p_new_role: "USER" },
    );
    expect(nonAdminActorErr?.message).toContain("ADMIN_FORBIDDEN");

    const { error: clientApplyErr } = await actor.client.rpc(
      "admin_apply_user_management",
      { p_actor_id: actor.id, p_target_id: user.id, p_new_role: "USER" },
    );
    expect(clientApplyErr).not.toBeNull();
    expect((await profileOf(user.id)).role).toBe("MODERATOR");

    const { error: upsertErr } = await admin.from("profiles").upsert({
      id: user.id,
      role: "USER",
      account_level: "BEGINNER_RAPPER",
      display_name: "F1C service upsert",
    });
    expect(upsertErr).toBeNull();
    expect(await profileOf(user.id)).toMatchObject({
      role: "USER",
      display_name: "F1C service upsert",
    });
  });
});
