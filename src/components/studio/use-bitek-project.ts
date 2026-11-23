"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BitekMemoryAccess } from "@/config/plan-policy";
import { isBitekDecisionNote } from "@/lib/studio/bitek/chat/decisions";
import type { BitekMessageKind, BitekStoredMessage } from "@/lib/studio/bitek/store/messages";

export type BitekProjectStore = {
  loaded: boolean;
  /** No welcome row when the project was opened → BITEK greets (first entry into a new project). */
  fresh: boolean;
  /** False when the server has no studio_bitek_messages table yet (local fallback). */
  available: boolean;
  messages: BitekStoredMessage[];
  /**
   * Plan-policy BITEK memory: "project" = chat saved with the project (Bronze+),
   * "session" = chat + decisions live only in this browser tab (Free).
   */
  memory: BitekMemoryAccess;
  append: (
    rows: { kind: Exclude<BitekMessageKind, "chat">; content: string; meta?: Record<string, unknown> }[],
    options?: { localOnly?: boolean },
  ) => void;
  /** Chat rows saved by the chat route — mirrored locally without a refetch. */
  addLocal: (rows: BitekStoredMessage[]) => void;
};

const fallbackKey = (projectId: string) => `brd:bitek-project:${projectId}`;
/** Bubble folded / dismissed: a per-device UI state, not a message of the project. */
const bubbleStateKey = (projectId: string) => `brd:bitek-state:${projectId}`;
const sessionKey = (projectId: string) => `brd:bitek-session:${projectId}`;

/** Rows that belong to the conversation (session memory keeps exactly these in the tab). */
const isConversationRow = (m: BitekStoredMessage) => m.kind === "chat" || isBitekDecisionNote(m);

function readSession(projectId: string): BitekStoredMessage[] {
  try {
    const raw = JSON.parse(sessionStorage.getItem(sessionKey(projectId)) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as BitekStoredMessage[]).filter((m) => m && typeof m.id === "string") : [];
  } catch {
    return [];
  }
}

/** Stage 2b — BITEK memory per project (DB; localStorage only if the table is missing). */
export function useBitekProject(projectId: string): BitekProjectStore {
  const [state, setState] = useState<{
    loaded: boolean;
    fresh: boolean;
    available: boolean;
    memory: BitekMemoryAccess;
    messages: BitekStoredMessage[];
  }>({
    loaded: false,
    fresh: false,
    available: false,
    memory: "project",
    messages: [],
  });
  const availableRef = useRef(false);
  const memoryRef = useRef<BitekMemoryAccess>("project");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let available = false;
      let memory: BitekMemoryAccess = "project";
      let messages: BitekStoredMessage[] = [];
      try {
        const res = await fetch(`/api/studio/projects/${projectId}/bitek`, { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as {
          available?: boolean;
          memory?: BitekMemoryAccess;
          messages?: BitekStoredMessage[];
        };
        if (res.ok && json.memory === "session") memory = "session";
        if (res.ok && json.available) {
          available = true;
          messages = Array.isArray(json.messages) ? json.messages : [];
        }
      } catch {
        /* offline → fallback */
      }
      if (!available) {
        try {
          messages = JSON.parse(localStorage.getItem(fallbackKey(projectId)) ?? "[]") as BitekStoredMessage[];
        } catch {
          messages = [];
        }
      }
      if (memory === "session") {
        // Free: the conversation is only remembered in this tab.
        messages = [...messages.filter((m) => !isConversationRow(m)), ...readSession(projectId)].sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        );
      }
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(bubbleStateKey(projectId));
      } catch {
        /* storage blocked */
      }
      messages = messages.filter((m) => m.kind !== "state");
      if (saved) messages = [...messages, { id: "bubble-state", role: "assistant", kind: "state", content: saved, meta: {}, createdAt: new Date().toISOString() }];
      if (cancelled) return;
      availableRef.current = available;
      memoryRef.current = memory;
      setState({ loaded: true, fresh: !messages.some((m) => m.kind === "welcome"), available, memory, messages });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const addLocal = useCallback(
    (rows: BitekStoredMessage[]) => {
      setState((s) => {
        const messages = [...s.messages, ...rows].slice(-120);
        if (memoryRef.current === "session") {
          try {
            sessionStorage.setItem(sessionKey(projectId), JSON.stringify(messages.filter(isConversationRow).slice(-60)));
          } catch {
            /* ignore */
          }
        }
        if (!availableRef.current) {
          try {
            localStorage.setItem(fallbackKey(projectId), JSON.stringify(messages.slice(-60)));
          } catch {
            /* ignore */
          }
        }
        return { ...s, messages };
      });
    },
    [projectId],
  );

  const append = useCallback<BitekProjectStore["append"]>(
    (allRows, options) => {
      const state = allRows.findLast((row) => row.kind === "state");
      if (state) {
        try {
          localStorage.setItem(bubbleStateKey(projectId), state.content);
        } catch {
          /* storage blocked: this tab only */
        }
      }
      const rows = allRows.filter((row) => row.kind !== "state");
      if (rows.length === 0) return;
      const local: BitekStoredMessage[] = rows.map((r) => ({
        id: crypto.randomUUID(),
        role: "assistant",
        kind: r.kind,
        content: r.content,
        meta: r.meta ?? {},
        createdAt: new Date().toISOString(),
      }));
      addLocal(local);
      if (!availableRef.current || options?.localOnly) return;
      void fetch(`/api/studio/projects/${projectId}/bitek`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: rows }),
      }).catch(() => undefined);
    },
    [projectId, addLocal],
  );

  return { ...state, append, addLocal };
}
