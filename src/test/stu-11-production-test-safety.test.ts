/**
 * STU-11 — test runs must never reach production.
 * Covers the integration gate, the global network guard, and the suite split.
 */
import { readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net, { createServer, type AddressInfo } from "node:net";
import path from "node:path";
import tls from "node:tls";

import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import defaultConfig from "../../vitest.config";
import integrationConfig from "../../vitest.integration.config";
import {
  applyIntegrationEnv,
  assertAllowedTestUrl,
  IntegrationEnvError,
  isAllowedTestUrl,
  resolveIntegrationEnv,
} from "@/test/integration-env";
import { INTEGRATION_TEST_FILES } from "@/test/integration-test-files";
import {
  installTestNetworkGuard,
  socketConnectHost,
  TestNetworkBlockedError,
} from "@/test/network-guard";

const PROD_URL = "https://rzzxrgcdogkybkiidqgw.supabase.co";
const SECRET_SERVICE = "sentinel-service-role-secret-0001";
const SECRET_ANON = "sentinel-anon-secret-0002";
const FIXTURE = "/fixtures/bpm-120-steady.wav";

function localSource(overrides: Record<string, string | undefined> = {}) {
  return {
    BRD_INTEGRATION_TESTS: "1",
    LOCAL_SUPABASE_URL: "http://127.0.0.1:54321",
    LOCAL_SUPABASE_ANON_KEY: SECRET_ANON,
    LOCAL_SUPABASE_SERVICE_ROLE_KEY: SECRET_SERVICE,
    ...overrides,
  };
}

function thrown(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected a throw");
}

describe("STU-11 A — integration gate refuses by default", () => {
  it("no opt-in → disabled, even with production credentials and the fixture present", () => {
    const env = resolveIntegrationEnv({
      fixturePath: FIXTURE,
      fixtureExists: () => true,
      source: {
        NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
        SUPABASE_SERVICE_ROLE_KEY: SECRET_SERVICE,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET_ANON,
        LOCAL_SUPABASE_URL: "http://127.0.0.1:54321",
        LOCAL_SUPABASE_ANON_KEY: SECRET_ANON,
        LOCAL_SUPABASE_SERVICE_ROLE_KEY: SECRET_SERVICE,
      },
    });
    expect(env.enabled).toBe(false);
  });

  it("only the exact value \"1\" opts in", () => {
    for (const value of ["true", "yes", "0", " 1", ""]) {
      expect(
        resolveIntegrationEnv({ source: localSource({ BRD_INTEGRATION_TESTS: value }) })
          .enabled,
      ).toBe(false);
    }
  });

  it("opt-in with missing configuration throws and names the variables", () => {
    const error = thrown(() =>
      resolveIntegrationEnv({ source: { BRD_INTEGRATION_TESTS: "1" } }),
    );
    expect(error).toBeInstanceOf(IntegrationEnvError);
    expect(error.message).toContain("LOCAL_SUPABASE_URL");
    expect(error.message).toContain("LOCAL_SUPABASE_SERVICE_ROLE_KEY");
  });

  it("never falls back to the app's NEXT_PUBLIC_* / SUPABASE_* variables", () => {
    const error = thrown(() =>
      resolveIntegrationEnv({
        source: {
          BRD_INTEGRATION_TESTS: "1",
          NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET_ANON,
          SUPABASE_SERVICE_ROLE_KEY: SECRET_SERVICE,
        },
      }),
    );
    expect(error.message).toContain("missing");
  });

  it("opted-in run with the fixture missing throws instead of skipping", () => {
    expect(() =>
      resolveIntegrationEnv({
        source: localSource(),
        fixturePath: FIXTURE,
        fixtureExists: () => false,
      }),
    ).toThrow(/required fixture is missing/);
  });
});

describe("STU-11 B — host allowlist", () => {
  const refused = [
    PROD_URL,
    "https://example.supabase.co",
    "https://abc.supabase.in",
    "https://staging.bitrymdym.pl",
    "http://10.0.0.5:54321",
    "http://192.168.1.10:54321",
    "http://0.0.0.0:54321",
    "http://127.0.0.1.nip.io:54321",
    "http://localhost.evil.example:54321",
    "http://kong.supabase.local:8000",
    `https://user:${SECRET_SERVICE}@rzzxrgcdogkybkiidqgw.supabase.co`,
    "ftp://127.0.0.1/",
    "not a url",
  ];

  it.each(refused)("refuses %s", (url) => {
    expect(() => resolveIntegrationEnv({ source: localSource({ LOCAL_SUPABASE_URL: url }) }))
      .toThrow(IntegrationEnvError);
  });

  it("no flag can bypass the production refusal", () => {
    const bypassAttempts = {
      BRD_ALLOW_PRODUCTION: "1",
      ALLOW_PROD: "1",
      FORCE_LIVE: "1",
      LIVE: "1",
      CI: "true",
      NODE_ENV: "test",
      F1C_LOCAL_DB_TEST: "1",
    };
    expect(() =>
      resolveIntegrationEnv({
        source: { ...localSource({ LOCAL_SUPABASE_URL: PROD_URL }), ...bypassAttempts },
        fixturePath: FIXTURE,
        fixtureExists: () => true,
      }),
    ).toThrow(/refusing non-local Supabase host "rzzxrgcdogkybkiidqgw\.supabase\.co"/);
  });

  it.each(["http://127.0.0.1:54321", "http://localhost:54321", "http://[::1]:54321"])(
    "accepts loopback %s",
    (url) => {
      const env = resolveIntegrationEnv({
        source: localSource({ LOCAL_SUPABASE_URL: url }),
        fixturePath: FIXTURE,
        fixtureExists: () => true,
      });
      expect(env.enabled).toBe(true);
    },
  );

  it("accepted env is applied to the app variables only after validation", () => {
    const env = resolveIntegrationEnv({ source: localSource() });
    if (!env.enabled) throw new Error("expected enabled");
    const target: Record<string, string | undefined> = {
      NEXT_PUBLIC_SUPABASE_URL: PROD_URL,
    };
    applyIntegrationEnv(env, target);
    expect(target).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: SECRET_ANON,
      SUPABASE_SERVICE_ROLE_KEY: SECRET_SERVICE,
    });
    expect(() =>
      applyIntegrationEnv({ ...env, url: PROD_URL }, target),
    ).toThrow(IntegrationEnvError);
  });
});

describe("STU-11 C — no secrets in diagnostics", () => {
  it("errors carry names and hostnames, never key values or URL credentials", () => {
    const errors = [
      thrown(() => resolveIntegrationEnv({ source: localSource({ LOCAL_SUPABASE_URL: PROD_URL }) })),
      thrown(() =>
        resolveIntegrationEnv({
          source: localSource({
            LOCAL_SUPABASE_URL: `https://svc:${SECRET_SERVICE}@x.supabase.co/?apikey=${SECRET_ANON}`,
          }),
        }),
      ),
      thrown(() =>
        resolveIntegrationEnv({ source: localSource({ LOCAL_SUPABASE_ANON_KEY: "" }) }),
      ),
      thrown(() => assertAllowedTestUrl(`https://h.supabase.co/?k=${SECRET_SERVICE}`)),
    ];
    for (const error of errors) {
      expect(error.message).not.toContain(SECRET_SERVICE);
      expect(error.message).not.toContain(SECRET_ANON);
    }
  });
});

describe("STU-11 D — network guard", () => {
  function fakeTarget() {
    const inner = vi.fn(async () => new Response("ok"));
    const target: { fetch?: typeof fetch } = { fetch: inner as unknown as typeof fetch };
    const uninstall = installTestNetworkGuard(target);
    return { inner, target, uninstall };
  }

  it("blocks non-loopback hosts before the underlying fetch runs", async () => {
    const { inner, target } = fakeTarget();
    for (const input of [
      `${PROD_URL}/rest/v1/beats`,
      new URL(`${PROD_URL}/auth/v1/admin/users`),
      new Request(`${PROD_URL}/storage/v1/object/take-audio/x`, { method: "DELETE" }),
      "https://api.example.com/",
      "relative/path",
    ]) {
      await expect(target.fetch!(input)).rejects.toBeInstanceOf(TestNetworkBlockedError);
    }
    expect(inner).not.toHaveBeenCalled();
  });

  it("lets loopback and non-network schemes through", async () => {
    const { inner, target } = fakeTarget();
    await target.fetch!("http://127.0.0.1:54321/rest/v1/");
    await target.fetch!("http://localhost:3100/");
    await target.fetch!("data:text/plain,ok");
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it("block message names the host only", async () => {
    const { target } = fakeTarget();
    const error = await target.fetch!(
      `https://svc:${SECRET_SERVICE}@rzzxrgcdogkybkiidqgw.supabase.co/rest/v1/x?apikey=${SECRET_ANON}`,
    ).catch((e: Error) => e);
    expect((error as Error).message).toContain("rzzxrgcdogkybkiidqgw.supabase.co");
    expect((error as Error).message).not.toContain(SECRET_SERVICE);
    expect((error as Error).message).not.toContain(SECRET_ANON);
  });

  it("install is idempotent and uninstall restores the original", () => {
    const { inner, target, uninstall } = fakeTarget();
    const guarded = target.fetch;
    installTestNetworkGuard(target);
    expect(target.fetch).toBe(guarded);
    uninstall();
    expect(target.fetch).toBe(inner);
  });
});

describe("STU-12 D2 — WebSocket guard", () => {
  function fakeWsTarget() {
    const constructed: string[] = [];
    class FakeWebSocket {
      constructor(url: string | URL) {
        constructed.push(String(url));
      }
    }
    const target = { WebSocket: FakeWebSocket as unknown as typeof WebSocket };
    installTestNetworkGuard(target);
    return { constructed, target };
  }

  it.each([
    "wss://rzzxrgcdogkybkiidqgw.supabase.co/realtime/v1/websocket",
    "wss://example.supabase.co/realtime/v1/websocket",
    "ws://10.0.0.5:54321/realtime/v1/websocket",
    "ws://localhost.evil.example/",
    "not a url",
  ])("blocks %s before construction", (url) => {
    const { constructed, target } = fakeWsTarget();
    expect(() => new target.WebSocket(url)).toThrow(TestNetworkBlockedError);
    expect(constructed).toEqual([]);
  });

  it("lets loopback sockets through (host + port syntax)", () => {
    const { constructed, target } = fakeWsTarget();
    for (const url of [
      "ws://127.0.0.1:54321/realtime/v1/websocket",
      "ws://localhost:3000/",
      "ws://[::1]:54321/",
      new URL("wss://localhost/"),
    ]) {
      new target.WebSocket(url);
    }
    expect(constructed).toHaveLength(4);
  });

  it("block message names the host only", () => {
    const { target } = fakeWsTarget();
    let message = "";
    try {
      new target.WebSocket(
        `wss://rzzxrgcdogkybkiidqgw.supabase.co/realtime/v1/websocket?apikey=${SECRET_SERVICE}`,
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("rzzxrgcdogkybkiidqgw.supabase.co");
    expect(message).not.toContain(SECRET_SERVICE);
  });

  it("global WebSocket refuses a remote host synchronously", () => {
    expect(
      () => new WebSocket("wss://stu11-guard-probe.supabase.invalid/realtime/v1/websocket"),
    ).toThrow(TestNetworkBlockedError);
  });

  it("global WebSocket still reaches a loopback server", async () => {
    const server = createServer();
    const handshake = new Promise<string>((resolveHandshake) => {
      server.on("connection", (socket) => {
        socket.once("data", (chunk) => {
          resolveHandshake(chunk.toString("latin1"));
          socket.destroy();
        });
      });
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as AddressInfo;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/realtime/v1/websocket`);
    ws.addEventListener("error", () => {});
    try {
      expect(await handshake).toMatch(/^GET \/realtime\/v1\/websocket HTTP\/1\.1/);
    } finally {
      ws.close();
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});

describe("STU-15 C — socket guard (http / https / tls / net)", () => {
  const REMOTE_HOST = "stu15-guard-probe.supabase.invalid";

  function failure(start: (onError: (error: Error) => void) => void): Promise<Error> {
    return new Promise((resolveError) => start(resolveError));
  }

  it.each<[unknown[], string | null]>([
    [[443, "db.example.com"], "db.example.com"],
    [["5432", "10.0.0.5"], "10.0.0.5"],
    [[54321], "localhost"],
    [[{ host: "rzzxrgcdogkybkiidqgw.supabase.co", port: 443 }], "rzzxrgcdogkybkiidqgw.supabase.co"],
    [[{ port: 54321 }], "localhost"],
    [[[{ host: "127.0.0.1", port: 54321 }, null]], "127.0.0.1"],
    [[{ path: "\\\\.\\pipe\\vitest" }], null],
    [["/tmp/app.sock"], null],
  ])("connect args %j → host %j", (args, host) => {
    expect(socketConnectHost(args)).toBe(host);
  });

  it("blocks remote hosts before the original connect runs; loopback and IPC pass", async () => {
    const calls: unknown[][] = [];
    const proto = {
      connect(this: net.Socket, ...args: unknown[]) {
        calls.push(args);
        return this;
      },
    };
    const uninstall = installTestNetworkGuard({ socketPrototype: proto });
    const destroyed: Error[] = [];
    const fakeSocket = { destroy: (error: Error) => destroyed.push(error) } as unknown as net.Socket;
    try {
      proto.connect.call(fakeSocket, { host: REMOTE_HOST, port: 443 });
      proto.connect.call(fakeSocket, 5432, "db.example.com");
      await new Promise((tick) => process.nextTick(tick));
      expect(calls).toEqual([]);
      expect(destroyed.map((error) => error.message)).toEqual([
        expect.stringContaining(REMOTE_HOST),
        expect.stringContaining("db.example.com"),
      ]);
      expect(destroyed.every((error) => error instanceof TestNetworkBlockedError)).toBe(true);

      proto.connect.call(fakeSocket, { host: "127.0.0.1", port: 54321 });
      proto.connect.call(fakeSocket, { host: "::1", port: 54321 });
      proto.connect.call(fakeSocket, { path: "\\\\.\\pipe\\vitest" });
      expect(calls).toHaveLength(3);
    } finally {
      uninstall();
    }
  });

  it("node:http and node:https requests to a remote host fail with the guard error, not DNS", async () => {
    const httpError = await failure((onError) =>
      http.get(`http://${REMOTE_HOST}/rest/v1/`).on("error", onError),
    );
    const httpsError = await failure((onError) =>
      https.get(`https://${REMOTE_HOST}/storage/v1/`).on("error", onError),
    );
    expect(httpError).toBeInstanceOf(TestNetworkBlockedError);
    expect(httpsError).toBeInstanceOf(TestNetworkBlockedError);
  });

  it("raw net / tls sockets to a remote host are refused", async () => {
    const netError = await failure((onError) =>
      net.connect({ host: REMOTE_HOST, port: 5432 }).on("error", onError),
    );
    const tlsError = await failure((onError) =>
      tls.connect({ host: REMOTE_HOST, port: 443, servername: REMOTE_HOST }).on("error", onError),
    );
    expect(netError).toBeInstanceOf(TestNetworkBlockedError);
    expect(tlsError).toBeInstanceOf(TestNetworkBlockedError);
  });

  it("node:http still reaches a loopback server", async () => {
    const server = http.createServer((_req, res) => res.end("ok"));
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const { port } = server.address() as AddressInfo;
    try {
      const body = await new Promise<string>((resolveBody, rejectBody) => {
        http
          .get(`http://127.0.0.1:${port}/`, (res) => {
            let text = "";
            res.on("data", (chunk) => (text += chunk));
            res.on("end", () => resolveBody(text));
          })
          .on("error", rejectBody);
      });
      expect(body).toBe("ok");
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  });
});

describe("STU-11 E — guard is active in this test process", () => {
  // Never-resolving remote host: if the guard regresses, these fail on DNS
  // instead of sending real requests to production.
  const REMOTE_URL = "https://stu11-guard-probe.supabase.invalid";

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("global fetch to a remote host is refused", async () => {
    await expect(fetch(`${REMOTE_URL}/rest/v1/`)).rejects.toBeInstanceOf(
      TestNetworkBlockedError,
    );
  });

  it("real supabase-js clients pointed at a remote project cannot read, write, create users or touch Storage", async () => {
    const client = createClient(REMOTE_URL, SECRET_SERVICE, {
      auth: { persistSession: false, autoRefreshToken: false },
      // PostgREST retries failed GETs with 1s/2s/4s backoff; each retry is blocked too.
      db: { retry: false },
    });
    const select = await client.from("beats").select("id").limit(1);
    const insert = await client.from("beats").insert({ title: "stu11" });
    const user = await client.auth.admin.createUser({
      email: "stu11@example.invalid",
      password: "x".repeat(16),
    });
    const upload = await client.storage
      .from("take-audio")
      .upload("stu11/x.bin", new Blob(["x"]));
    for (const result of [select, insert, user, upload]) {
      expect(result.error).toBeTruthy();
      expect(String(result.error?.message)).toContain("test-network-guard");
    }
  });

  it("supabase-js Realtime cannot open a socket to a remote project", () => {
    const client = createClient(REMOTE_URL, SECRET_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    try {
      expect(() => client.realtime.connect()).toThrow(/test-network-guard/);
      expect(client.realtime.isConnected()).toBe(false);
    } finally {
      client.realtime.disconnect();
    }
  });

  it("app admin client reading remote values from process.env is refused too", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", REMOTE_URL);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SECRET_SERVICE);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SECRET_ANON);
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const { error } = await createSupabaseAdminClient().from("takes").delete().eq("id", "x");
    expect(String(error?.message)).toContain("test-network-guard");
  });
});

const REPO = path.resolve(__dirname, "../..");

function listTestFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listTestFiles(full, out);
    else if (entry.name.endsWith(".test.ts")) out.push(path.relative(REPO, full).replace(/\\/g, "/"));
  }
  return out;
}

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("STU-11 F — default suite contains no live test", () => {
  const defaultExclude = defaultConfig.test?.exclude ?? [];
  const integrationFiles = new Set<string>(INTEGRATION_TEST_FILES);
  // Calls createUser on purpose, against a host the guard blocks (section E).
  const self = "src/test/stu-11-production-test-safety.test.ts";

  it("default config excludes every integration file and installs the network guard", () => {
    for (const file of INTEGRATION_TEST_FILES) expect(defaultExclude).toContain(file);
    expect(defaultConfig.test?.setupFiles).toContain("./src/test/vitest.setup.ts");
  });

  it("integration config runs exactly the integration files, guarded and gated", () => {
    expect(integrationConfig.test?.include).toEqual([...INTEGRATION_TEST_FILES]);
    expect(integrationConfig.test?.setupFiles).toEqual([
      "./src/test/vitest.setup.ts",
      "./src/test/vitest.integration.setup.ts",
    ]);
    expect(integrationConfig.test?.globalSetup).toEqual([
      "./src/test/vitest.integration.global-setup.ts",
    ]);
  });

  it("every listed integration file exists", () => {
    const all = new Set(listTestFiles(path.join(REPO, "src")));
    for (const file of INTEGRATION_TEST_FILES) expect(all.has(file), file).toBe(true);
  });

  it("no default-suite test reads .env.local, creates Auth users or talks to a DB container", () => {
    const offenders = listTestFiles(path.join(REPO, "src"))
      .filter((file) => !integrationFiles.has(file) && file !== self)
      .filter((file) => {
        const code = codeOnly(readFileSync(path.join(REPO, file), "utf8"));
        return (
          /["'`]\.env\.local["'`]/.test(code) ||
          /\.auth\.admin\.createUser\(/.test(code) ||
          /execFileSync\(\s*["']docker["']/.test(code)
        );
      });
    expect(offenders).toEqual([]);
  });

  it("integration files gate on the shared resolver (docker-only finalize test excepted)", () => {
    // Talks to the local DB container via `docker exec`; no URL or API key.
    const dockerOnly = new Set(["src/lib/beats/beat-master-finalize-local.test.ts"]);
    for (const file of INTEGRATION_TEST_FILES) {
      if (dockerOnly.has(file)) continue;
      const code = codeOnly(readFileSync(path.join(REPO, file), "utf8"));
      expect(code, file).toContain("resolveIntegrationEnv(");
      expect(code, file).not.toMatch(/["'`]\.env\.local["'`]/);
    }
  });

  it("isAllowedTestUrl rejects the production project host", () => {
    expect(isAllowedTestUrl(`${PROD_URL}/rest/v1/`)).toBe(false);
  });
});
