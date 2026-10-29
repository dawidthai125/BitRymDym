import { readdirSync, readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");
const F1C_MIGRATION = "20261017081616_f1c_profiles_privilege_hardening.sql";

function readMigration(name: string) {
  return readFileSync(resolve(MIGRATIONS_DIR, name), "utf8").replace(/\r\n/g, "\n");
}

function stripSqlComments(sql: string) {
  return sql.replace(/--[^\n]*/g, "");
}

/** Table-level (no column list) INSERT/UPDATE/ALL grants on profiles to client roles. */
function findBroadProfilesClientGrants(sql: string): string[] {
  const out: string[] = [];
  const grant =
    /GRANT\s+([^;]*?)\s+ON\s+(?:TABLE\s+)?(?:public\.)?profiles\s+TO\s+([^;]*);/gi;
  for (const m of stripSqlComments(sql).matchAll(grant)) {
    const privileges = m[1]!;
    const grantees = m[2]!;
    const broad = privileges
      .split(",")
      .map((p) => p.trim())
      .some((p) => /^(INSERT|UPDATE|ALL)\b/i.test(p) && !p.includes("("));
    if (broad && /\b(anon|authenticated|PUBLIC)\b/i.test(grantees)) {
      out.push(m[0]!.replace(/\s+/g, " "));
    }
  }
  const allTables =
    /GRANT\s+([^;]*?)\s+ON\s+ALL\s+TABLES\s+IN\s+SCHEMA\s+public\s+TO\s+([^;]*);/gi;
  for (const m of stripSqlComments(sql).matchAll(allTables)) {
    if (
      /\b(INSERT|UPDATE|ALL)\b/i.test(m[1]!) &&
      /\b(anon|authenticated|PUBLIC)\b/i.test(m[2]!)
    ) {
      out.push(m[0]!.replace(/\s+/g, " "));
    }
  }
  return out;
}

describe("F1-C profiles privilege hardening (static)", () => {
  const sql = stripSqlComments(readMigration(F1C_MIGRATION));

  it("trigger uses session_user maintainer check, empty search_path, SECURITY DEFINER", () => {
    expect(sql).toMatch(/FUNCTION public\.prevent_privilege_escalation\(\)/);
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = ''/);
    const body = sql.match(/prevent_privilege_escalation\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1];
    expect(body).toBeTruthy();
    expect(body).toMatch(/coalesce\(auth\.role\(\), ''\) IS DISTINCT FROM 'service_role'/);
    expect(body).toMatch(/AND session_user IS DISTINCT FROM 'postgres'/);
    expect(body).not.toMatch(/current_user/i);
    for (const col of ["role", "account_level", "experience_total"]) {
      expect(body).toContain(`NEW.${col} IS DISTINCT FROM OLD.${col}`);
    }
  });

  it("revokes client INSERT/UPDATE and grants only UPDATE(display_name) to authenticated", () => {
    expect(sql).toMatch(
      /REVOKE INSERT, UPDATE ON TABLE public\.profiles FROM anon, authenticated;/,
    );
    expect(sql).toMatch(
      /GRANT UPDATE \(display_name\) ON TABLE public\.profiles TO authenticated;/,
    );
    expect(findBroadProfilesClientGrants(sql)).toEqual([]);
    expect(sql).not.toMatch(/REVOKE[^;]*profiles[^;]*service_role/i);
    expect(sql).not.toMatch(/DROP POLICY|DISABLE ROW LEVEL SECURITY/i);
  });

  it("asserts final ACL and function definition inside the migration", () => {
    expect(sql).toMatch(/has_table_privilege\(v_role, 'public\.profiles', 'UPDATE'\)/);
    expect(sql).toMatch(/has_column_privilege\(v_role, 'public\.profiles', v_col\.attname, 'UPDATE'\)/);
    expect(sql).toMatch(/proconfig IS DISTINCT FROM ARRAY\['search_path=""'\]/);
    expect(sql).toMatch(/profiles_update_own/);
  });

  it("detector flags broad grants and ignores column-level display_name grant", () => {
    expect(
      findBroadProfilesClientGrants(
        "GRANT SELECT, UPDATE ON public.profiles TO authenticated;",
      ),
    ).toHaveLength(1);
    expect(
      findBroadProfilesClientGrants("GRANT ALL ON TABLE profiles TO anon;"),
    ).toHaveLength(1);
    expect(
      findBroadProfilesClientGrants(
        "GRANT INSERT ON ALL TABLES IN SCHEMA public TO authenticated;",
      ),
    ).toHaveLength(1);
    expect(
      findBroadProfilesClientGrants(
        "GRANT UPDATE (display_name) ON TABLE public.profiles TO authenticated;",
      ),
    ).toEqual([]);
    expect(
      findBroadProfilesClientGrants(
        "GRANT ALL ON TABLE public.profiles TO service_role;",
      ),
    ).toEqual([]);
  });

  it("no later migration re-grants table-level INSERT/UPDATE on profiles to client roles", () => {
    const later = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql") && name > F1C_MIGRATION)
      .sort();
    const offenders = later.flatMap((name) =>
      findBroadProfilesClientGrants(readMigration(name)).map((g) => `${name}: ${g}`),
    );
    expect(offenders).toEqual([]);
  });
});
