/**
 * Process-wide outbound network guard for Vitest.
 *
 * supabase-js, auth-js, storage-js and postgrest-js resolve `globalThis.fetch`
 * per request, so wrapping it here covers every Supabase client created by
 * tests or by app code under test. realtime-js picks the global `WebSocket`
 * (native since Node 22), so that constructor is guarded too. Every other
 * Node client (`http`, `https`, `tls`, `net`) ends in `net.Socket#connect`,
 * which is the last layer. Only loopback hosts are reachable; there is
 * deliberately no environment switch to disable this.
 */
import net from "node:net";

import { describeHost, isAllowedTestHost, isAllowedTestUrl } from "@/test/integration-env";

const GUARD_MARK = Symbol.for("bitrymdym.testNetworkGuard");

type GuardedFetch = typeof fetch & { [GUARD_MARK]?: typeof fetch };
type GuardedWebSocket = typeof WebSocket & { [GUARD_MARK]?: typeof WebSocket };
type SocketConnect = (this: net.Socket, ...args: unknown[]) => net.Socket;
type GuardedSocketConnect = SocketConnect & { [GUARD_MARK]?: SocketConnect };

export type NetworkGuardTarget = {
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
  /** Object whose `connect` is guarded; `net.Socket.prototype` for the real process. */
  socketPrototype?: { connect: SocketConnect };
};

export class TestNetworkBlockedError extends Error {
  constructor(host: string) {
    super(
      `[test-network-guard] blocked outbound request to "${host}". Tests may only reach loopback; use mocks or the local Supabase stack.`,
    );
    this.name = "TestNetworkBlockedError";
  }
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function installFetchGuard(target: NetworkGuardTarget): () => void {
  const current = target.fetch as GuardedFetch | undefined;
  if (!current || current[GUARD_MARK]) return () => {};

  const guarded: GuardedFetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = requestUrl(input);
      if (!isAllowedTestUrl(url)) {
        return Promise.reject(new TestNetworkBlockedError(describeHost(url)));
      }
      return current(input, init);
    },
    { [GUARD_MARK]: current },
  );
  target.fetch = guarded;
  return () => {
    if (target.fetch === guarded) target.fetch = current;
  };
}

function installWebSocketGuard(target: NetworkGuardTarget): () => void {
  const Current = target.WebSocket as GuardedWebSocket | undefined;
  if (!Current || Current[GUARD_MARK]) return () => {};

  // Throws synchronously, before the socket opens (same timing as the native
  // constructor's own URL errors).
  class Guarded extends Current {
    constructor(url: string | URL, protocols?: string | string[]) {
      const raw = url instanceof URL ? url.href : String(url);
      if (!isAllowedTestUrl(raw)) {
        throw new TestNetworkBlockedError(describeHost(raw));
      }
      super(url, protocols);
    }
  }
  const guarded = Object.assign(Guarded, { [GUARD_MARK]: Current }) as GuardedWebSocket;
  target.WebSocket = guarded;
  return () => {
    if (target.WebSocket === guarded) target.WebSocket = Current;
  };
}

/**
 * TCP target of a `Socket#connect` call, or null for IPC (named pipe / Unix
 * socket). Node passes either the public overloads or one pre-normalized
 * `[options, cb]` array.
 */
export function socketConnectHost(args: readonly unknown[]): string | null {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof first === "number" || (typeof first === "string" && /^\d+$/.test(first))) {
    return typeof args[1] === "string" ? args[1] : "localhost";
  }
  if (typeof first === "string") return null;
  if (first && typeof first === "object") {
    const options = first as { path?: unknown; host?: unknown };
    if (typeof options.path === "string") return null;
    return typeof options.host === "string" && options.host ? options.host : "localhost";
  }
  return "localhost";
}

function installSocketGuard(target: NetworkGuardTarget): () => void {
  const proto = target.socketPrototype;
  const current = proto?.connect as GuardedSocketConnect | undefined;
  if (!proto || !current || current[GUARD_MARK]) return () => {};

  const guarded: GuardedSocketConnect = Object.assign(
    function (this: net.Socket, ...args: unknown[]) {
      const host = socketConnectHost(args);
      if (host !== null && !isAllowedTestHost(host)) {
        const error = new TestNetworkBlockedError(host);
        // Same shape as a native connect failure: an async 'error', no packet sent.
        process.nextTick(() => this.destroy(error));
        return this;
      }
      return current.apply(this, args);
    },
    { [GUARD_MARK]: current },
  );
  proto.connect = guarded;
  return () => {
    if (proto.connect === guarded) proto.connect = current;
  };
}

export function installTestNetworkGuard(
  target: NetworkGuardTarget = globalThis,
): () => void {
  const uninstallFetch = installFetchGuard(target);
  const uninstallWebSocket = installWebSocketGuard(target);
  const uninstallSocket = installSocketGuard(
    target === globalThis
      ? { socketPrototype: net.Socket.prototype as unknown as { connect: SocketConnect } }
      : target,
  );
  return () => {
    uninstallSocket();
    uninstallWebSocket();
    uninstallFetch();
  };
}
