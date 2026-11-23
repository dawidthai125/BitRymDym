"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { BitekClientContext } from "@/lib/studio/bitek/chat/client-context";
import {
  bitekDecisionsByEntry,
  isBitekDecisionNote,
  lastBitekChange,
  toContextLastChange,
  type BitekDecision,
  type BitekStoredChange,
} from "@/lib/studio/bitek/chat/decisions";
import { bitekProposalTarget, planBitekChanges, refsToTrackIds } from "@/lib/studio/bitek/chat/apply-plan";
import { clampChainToPlan, NOVA_PASS_FIXES } from "@/lib/studio/mix-autofix/plan";
import { BITEK_LIMITS, BITEK_MASTER_REF, type BitekChatResult, type BitekJob, type BitekMasterSetting, type BitekProposal } from "@/lib/studio/bitek/chat/types";
import { emitStudioTakeSourceChanged } from "@/lib/studio/cleanup/cleanup-events";
import { addStudioFxToChain } from "@/lib/studio/studio-fx-chain";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import type { PremiumTier } from "@/types/premium";
import { useProjectBeatKey } from "@/components/studio/studio-tune-panel";
import { useFxPresets } from "@/components/studio/studio-vocal-presets";
import type { BitekStoredMessage } from "@/lib/studio/bitek/store/messages";
import type { BitekProjectStore } from "@/components/studio/use-bitek-project";

/** The chat route tries several providers; after this the user gets the text back. */
const CHAT_TIMEOUT_MS = 45000;

type Entry =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content: string; provider: BitekChatResult["provider"] | null; proposals: BitekProposal[]; jobs: BitekJob[]; note: boolean; backToMix: boolean; trackIds: Record<string, string> | null };

function entriesFromStore(messages: readonly BitekStoredMessage[]): Entry[] {
  const out: Entry[] = [];
  for (const m of messages) {
    if (m.kind === "state" || isBitekDecisionNote(m)) continue;
    if (m.kind === "chat" && m.role === "user") {
      out.push({ id: m.id, role: "user", content: m.content });
      continue;
    }
    const meta = m.meta as { provider?: BitekChatResult["provider"]; proposals?: BitekProposal[]; jobs?: BitekJob[]; backToMix?: boolean; trackIds?: Record<string, string> };
    out.push({
      id: m.id,
      role: "assistant",
      content: m.content,
      provider: m.kind === "chat" ? (meta.provider ?? "rules") : null,
      proposals: m.kind === "chat" && Array.isArray(meta.proposals) ? meta.proposals : [],
      jobs: m.kind === "chat" && Array.isArray(meta.jobs) ? meta.jobs : [],
      note: m.kind !== "chat",
      backToMix: m.kind === "chat" && meta.backToMix === true,
      trackIds: meta.trackIds && typeof meta.trackIds === "object" ? meta.trackIds : null,
    });
  }
  return out.slice(-60);
}

/** BITEK chat: history per project (DB), typing indicator, "Apply" buttons for validated proposals. */
export function StudioBitekChat({
  projectId,
  getContext,
  disabled,
  store,
  onBusyChange,
  onApplyMasterProposal,
  onBackToMix,
  onApplyFxOps,
  maxEffects,
  allowSidechain,
}: {
  /** Plan limits (the server enforces the same). */
  maxEffects?: number;
  allowSidechain?: boolean;
  /** Every track change goes through one Mix Working apply (saved, undoable, result known). */
  onApplyFxOps?: (ops: MixWorkingOp[], description: string) => Promise<boolean>;
  /** Stage 3 — whole-song setting proposals (trackRef "master"). Only in the Mastering step. */
  onApplyMasterProposal?: (key: BitekMasterSetting, value: number) => void;
  /** Stage 3 — shown under a Mastering reply that needs Mix work. */
  onBackToMix?: () => void;
  projectId: string;
  getContext: () => BitekClientContext;
  disabled?: boolean;
  store: BitekProjectStore;
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useTranslations("studio.bitek.chat");
  const inputId = useId();
  const beatKey = useProjectBeatKey(onApplyFxOps ? projectId : null);
  const fxAccess = useFxPresets().access;
  const entries = entriesFromStore(store.messages);
  const decisions = bitekDecisionsByEntry(store.messages);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Message being answered (shown in the list, moved to history with the reply). */
  const [asking, setAsking] = useState<string | null>(null);
  /** One change at a time: proposals, jobs and undo share this lock. */
  const [working, setWorking] = useState<string | null>(null);
  const workingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listRef.current?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }, [entries.length, busy]);

  useEffect(() => {
    onBusyChange?.(busy || working !== null);
  }, [busy, working, onBusyChange]);
  // Closing the chat never leaves the avatar "thinking".
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  /** Runs one change with the lock; a thrown request is a message, never a stuck button. */
  async function exclusive(key: string, work: () => Promise<void>) {
    if (workingRef.current) return;
    workingRef.current = true;
    setWorking(key);
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch {
      setError(t("blad"));
    } finally {
      workingRef.current = false;
      setWorking(null);
    }
  }

  const tooLong = text.length > BITEK_LIMITS.messageMaxChars;

  async function send() {
    const message = text.trim();
    if (!message || busy || tooLong) return;
    const history = store.messages
      .filter((m) => m.kind === "chat")
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.content }));
    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, CHAT_TIMEOUT_MS);
    const fail = (messageText: string | null) => {
      // The text goes back to the field, so "try again" is one click.
      setText((cur) => cur || message);
      setError(messageText);
    };
    setAsking(message);
    setText("");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { context, trackIdByRef } = getContext();
      // Conversational mode: "więcej / za dużo / cofnij" act on the last change the user applied.
      const lastChange = toContextLastChange(lastBitekChange(store.messages), trackIdByRef);
      const res = await fetch("/api/studio/bitek/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // trackIds never reach the model: the server only keeps the ones the reply uses (stable after a reorder).
        body: JSON.stringify({ message, history, context: { ...context, lastChange }, projectId, trackIds: trackIdByRef }),
        signal: controller.signal,
      });
      if (res.status === 429) {
        fail(t("limit"));
        return;
      }
      const json = (await res.json()) as Partial<BitekChatResult> & {
        success?: boolean;
        messageIds?: { user?: string; assistant?: string };
      };
      if (!res.ok || !json.success || typeof json.reply !== "string") {
        fail(t("blad"));
        return;
      }
      const proposals = Array.isArray(json.proposals) ? json.proposals : [];
      const jobs = Array.isArray(json.jobs) ? json.jobs : [];
      const now = new Date().toISOString();
      store.addLocal([
        {
          id: typeof json.messageIds?.user === "string" ? json.messageIds.user : crypto.randomUUID(),
          role: "user",
          kind: "chat",
          content: message,
          meta: {},
          createdAt: now,
        },
        {
          // DB id when saved, so Zostaw/Cofnij decisions stay attached to this reply after a reload.
          id: typeof json.messageIds?.assistant === "string" ? json.messageIds.assistant : crypto.randomUUID(),
          role: "assistant",
          kind: "chat",
          content: json.reply as string,
          meta: {
            provider: json.provider ?? "rules",
            proposals,
            trackIds: refsToTrackIds(trackIdByRef, proposals, jobs),
            ...(jobs.length ? { jobs } : {}),
            ...(json.backToMix ? { backToMix: true } : {}),
          },
          createdAt: now,
        },
      ]);
    } catch {
      fail(controller.signal.aborted && !timedOut ? null : t(timedOut ? "zaDlugo" : "blad"));
    } finally {
      window.clearTimeout(timer);
      setAsking(null);
      setBusy(false);
      // Keep focus in the chat after the reply (the input was disabled while waiting).
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function recordDecision(entryId: string, decision: BitekDecision, changes: BitekStoredChange[], labels: string[]) {
    const key = decision === "applied" ? "notatkaZastosowano" : decision === "kept" ? "notatkaZostawiono" : "notatkaCofnieto";
    store.append(
      [{ kind: "note", content: t(key, { labels: labels.join("; ").slice(0, 400) }), meta: { bitekChange: { entryId, decision, changes } } }],
      // Session memory (Free): decisions stay in this tab like the chat itself.
      { localOnly: store.memory === "session" },
    );
  }

  /** Applies a list of values as one save. Returns the values from before, or null when nothing changed. */
  async function applyValues(items: { target: string; param: BitekProposal["param"]; value: number | boolean }[]): Promise<(number | boolean)[] | null> {
    const client = getContext();
    const plan = planBitekChanges({
      client,
      items,
      beatKey: beatKey?.key ?? null,
      tier: fxAccess.tier as PremiumTier,
      canMaster: Boolean(onApplyMasterProposal),
      maxEffects,
      allowSidechain,
    });
    if (!plan.ok) {
      setError(plan.reason === "limit" ? t("limitEfektow", { max: maxEffects ?? 0 }) : t("nieDaSie"));
      return null;
    }
    if (plan.ops.length > 0) {
      if (!onApplyFxOps || !(await onApplyFxOps(plan.ops, `BITEK: ${plan.names.join(", ")}`))) {
        setError(t("nieZapisano"));
        return null;
      }
    }
    for (const m of plan.master) onApplyMasterProposal?.(m.key as BitekMasterSetting, m.value);
    return plan.from;
  }

  const apply = (entry: Extract<Entry, { role: "assistant" }>, index: number, p: BitekProposal) =>
    exclusive(`${entry.id}-${index}`, async () => {
      // The ref of that reply → the real track id it meant then (tracks may have moved since).
      const target = bitekProposalTarget(p.trackRef, entry.trackIds, getContext().trackIdByRef);
      if (!target) return setError(t("staraPropozycja"));
      const from = await applyValues([{ target, param: p.param, value: p.value }]);
      if (!from) return;
      const prev = decisions.get(entry.id);
      const kept = prev && prev.decision !== "undone" ? prev.changes.filter((c) => c.i !== index) : [];
      const changes = [...kept, { i: index, target, param: p.param, from: from[0]!, to: p.value }];
      recordDecision(entry.id, "applied", changes, changes.map((c) => entry.proposals[c.i]?.label ?? p.label));
    });

  const mixFixError = (reason: "no-analysis" | "empty" | "limit" | "failed") =>
    reason === "empty"
      ? t("juzJest")
      : reason === "limit"
        ? t("limitEfektow", { max: maxEffects ?? 0 })
        : reason === "no-analysis"
          ? t("bezPomiaru")
          : t("nieZapisano");

  async function applyJob(job: BitekJob, trackIds: Record<string, string> | null) {
    const client = getContext();
    if (job.kind === "novaPass") {
      if (!client.applyMixFix) {
        setError(t("tylkoMix"));
        return;
      }
      const res = await client.applyMixFix(NOVA_PASS_FIXES);
      if (!res.ok) {
        setError(mixFixError(res.reason));
        return;
      }
      store.append([{ kind: "note", content: t("zastosowano") }], { localOnly: store.memory === "session" });
      return;
    }
    if (job.kind === "mixFix") {
      if (!client.applyMixFix) {
        setError(t("tylkoMix"));
        return;
      }
      const res = await client.applyMixFix(job.fixes);
      if (!res.ok) {
        setError(mixFixError(res.reason));
        return;
      }
      store.append([{ kind: "note", content: t("zastosowano") }], { localOnly: store.memory === "session" });
      return;
    }
    if (job.kind === "masterStyle") {
      if (!client.applyMasterStyle) return setError(t("tylkoMaster"));
      if (!client.applyMasterStyle(job.style)) {
        setError(t("juzJest"));
        return;
      }
      store.append([{ kind: "note", content: t("zastosowano") }], { localOnly: store.memory === "session" });
      return;
    }
    if (job.kind === "masterClarity") {
      if (!client.applyMasterClarity) return setError(t("tylkoMaster"));
      if (!client.applyMasterClarity(job.patch)) {
        setError(t("juzJest"));
        return;
      }
      store.append([{ kind: "note", content: t("zastosowano") }], { localOnly: store.memory === "session" });
      return;
    }
    if (job.kind === "masterTarget") {
      if (!client.applyMasterTarget) return setError(t("tylkoMaster"));
      if (!client.applyMasterTarget(job.target)) {
        setError(t("juzJest"));
        return;
      }
      store.append([{ kind: "note", content: t("zastosowano") }], { localOnly: store.memory === "session" });
      return;
    }
    if (job.kind === "vocalCleanup") {
      const ids = client.vocalTakeIds.slice(0, 2);
      if (!ids.length) {
        setError(t("szumPusto"));
        return;
      }
      const base = `/api/studio/projects/${projectId}/cleanup`;
      setNotice(t("czyszcze"));
      let pending = false;
      const wanted = new Map<string, string | null>();
      for (const takeId of ids) {
        const res = await fetch(base, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ takeId, settings: { noise: 0.7, reverb: 0.35 } }),
          signal: AbortSignal.timeout(20000),
        });
        const body = (await res.json().catch(() => null)) as { error?: string; job?: { id?: string } } | null;
        if (body?.error === "daily_limit" || res.status === 429) {
          if (!wanted.size) setError(t("szumLimit"));
          break;
        }
        if (body?.error === "in_progress") {
          wanted.set(takeId, null);
          continue;
        }
        if (!res.ok || !body?.job?.id) {
          if (!wanted.size) setError(t("nieDaSie"));
          break;
        }
        wanted.set(takeId, body.job.id);
      }
      if (!wanted.size) {
        setNotice(null);
        return;
      }
      // 23 rounds of 2 s ≈ 45 s of waiting for the cleanup job (a counter, not the clock: render-pure).
      const done = new Set<string>();
      let applied = 0;
      for (let round = 0; round < 23; round += 1) {
        const list = (await fetch(base, { signal: AbortSignal.timeout(15000) }).then((r) => r.json()).catch(() => null)) as { jobs?: { id: string; takeId: string; status: string; applied: boolean }[] } | null;
        const jobs = list?.jobs ?? [];
        pending = list === null;
        let seen = 0;
        for (const [takeId, jobId] of wanted) {
          const job = jobId ? jobs.find((j) => j.id === jobId) : jobs.find((j) => j.takeId === takeId);
          if (!job) continue;
          seen += 1;
          if (job.status === "queued" || job.status === "running") pending = true;
          if (job.status !== "succeeded" || job.applied || done.has(job.id)) continue;
          const patch = await fetch(base, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ takeId: job.takeId, jobId: job.id }),
            signal: AbortSignal.timeout(15000),
          }).catch(() => null);
          if (!patch?.ok) continue;
          done.add(job.id);
          emitStudioTakeSourceChanged(job.takeId);
          applied += 1;
        }
        if (seen === wanted.size && !pending) break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      setNotice(null);
      if (!applied && pending) {
        // The job goes on after this wait; the Mix step shows it when it is ready.
        setNotice(t("czyszczeDalej"));
        return;
      }
      if (!applied) {
        setError(t("szumBlad"));
        return;
      }
      store.append([{ kind: "note", content: t("zastosowano") }], { localOnly: store.memory === "session" });
      return;
    }
    if (job.kind === "trackFx") {
      const trackId = bitekProposalTarget(job.trackRef, trackIds, client.trackIdByRef);
      if (!trackId) return setError(t("staraPropozycja"));
      const chain = trackId ? client.effectsChainByTrackId[trackId] : undefined;
      const track = client.context.tracks.find((x) => client.trackIdByRef[x.ref] === trackId);
      if (!chain || !onApplyFxOps || !track || track.hasAudio === false) {
        setError(t("nieDaSie"));
        return;
      }
      if (chain.effects.some((e) => e.type === job.effect && e.enabled)) {
        setError(t("juzJest"));
        return;
      }
      let next;
      try {
        next = addStudioFxToChain(chain, job.effect, "track");
      } catch {
        setError(t("nieDaSie"));
        return;
      }
      const fitted = clampChainToPlan(next, chain, { maxEffects, allowSidechain });
      if (!fitted || !fitted.effects.some((e) => e.type === job.effect)) return setError(t("limitEfektow", { max: maxEffects ?? 0 }));
      const ok = await onApplyFxOps([{ op: "set_track_fx", trackId, effectsChain: fitted }], `BITEK: ${job.label}`);
      if (!ok) {
        setError(t("nieZapisano"));
        return;
      }
      store.append([{ kind: "note", content: t("zastosowano") }], { localOnly: store.memory === "session" });
      return;
    }
    const _never: never = job;
    return _never;
  }

  function keep(entry: Extract<Entry, { role: "assistant" }>) {
    const d = decisions.get(entry.id);
    if (!d) return;
    recordDecision(entry.id, "kept", d.changes, d.changes.map((c) => entry.proposals[c.i]?.label ?? ""));
  }

  const undo = (entry: Extract<Entry, { role: "assistant" }>) =>
    exclusive(`${entry.id}-undo`, async () => {
      const d = decisions.get(entry.id);
      if (!d) return;
      const back = await applyValues([...d.changes].reverse().map((c) => ({ target: c.target, param: c.param, value: c.from })));
      if (!back) return;
      recordDecision(entry.id, "undone", d.changes, d.changes.map((c) => entry.proposals[c.i]?.label ?? ""));
    });

  const refs = entries.some((e) => e.role === "assistant" && e.proposals.length > 0) ? getContext().trackIdByRef : {};
  const locked = disabled || working !== null;
  return (
    <div className="flex flex-col gap-2" data-testid="studio-bitek-chat">
      <p className="text-xs text-[var(--brd-mute)]">{t("info")}</p>
      <ol
        ref={listRef}
        aria-live="polite"
        aria-relevant="additions"
        className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1"
      >
        {entries.length === 0 ? (
          <li className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">{t("powitanie")}</li>
        ) : null}
        {entries.map((e) =>
          e.role === "user" ? (
            <li key={e.id} data-testid="studio-bitek-chat-user" className="self-end max-w-[90%] rounded-[2px] bg-[var(--brd-recess)] px-2 py-1 text-sm">
              <span className="sr-only">{t("ty")}: </span>
              {e.content}
            </li>
          ) : (
            <li key={e.id} data-testid={e.note ? "studio-bitek-chat-note" : "studio-bitek-chat-reply"} data-provider={e.provider ?? "note"} className="flex flex-col gap-1 border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">
              <span>{e.content}</span>
              {e.proposals.length ? (
                <ul className="flex flex-col gap-1.5">
                  {e.proposals.map((p, i) => {
                    const d = decisions.get(e.id);
                    const done = Boolean(d && d.decision !== "undone" && d.changes.some((c) => c.i === i));
                    const why =
                      p.trackRef === BITEK_MASTER_REF
                        ? onApplyMasterProposal
                          ? null
                          : t("tylkoMaster")
                        : bitekProposalTarget(p.trackRef, e.trackIds, refs)
                          ? null
                          : t("staraPropozycja");
                    return (
                      <li key={`${p.trackRef}-${p.param}`} className="flex flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs">{p.label || `${p.trackRef} ${p.param} ${String(p.value)}`}</span>
                          <Button
                            type="button"
                            size="sm"
                            variant={done ? "outline" : "default"}
                            className="min-h-9"
                            disabled={done || locked || why !== null}
                            aria-label={t("propozycjaAria", { label: p.label || p.param })}
                            data-testid="studio-bitek-apply"
                            onClick={() => void apply(e, i, p)}
                          >
                            {done ? "✓" : working === `${e.id}-${i}` ? t("zapisuje") : t("zastosuj")}
                          </Button>
                        </div>
                        {why && !done ? <span className="text-xs text-[var(--brd-mute)]">{why}</span> : null}
                        {p.why ? (
                          <span data-testid="studio-bitek-why" className="text-xs text-[var(--brd-mute)]">
                            {p.why}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                  <BitekDecisionRow
                    decision={decisions.get(e.id)?.decision ?? null}
                    disabled={locked}
                    onKeep={() => keep(e)}
                    onUndo={() => void undo(e)}
                  />
                </ul>
              ) : null}
              {e.jobs.length ? (
                <ul className="flex flex-col gap-1.5">
                  {e.jobs.map((job) => (
                    <li key={`${job.kind}-${job.label}`} className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{job.label}</span>
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-9"
                        disabled={locked}
                        data-testid="studio-bitek-job"
                        onClick={() => void exclusive(`${e.id}-${job.kind}-${job.label}`, async () => void (await applyJob(job, e.trackIds)))}
                      >
                        {working === `${e.id}-${job.kind}-${job.label}` ? t("zapisuje") : t("zastosuj")}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {e.backToMix && onBackToMix ? (
                <Button type="button" size="sm" variant="outline" className="min-h-9 self-start" data-testid="studio-bitek-back-to-mix" onClick={onBackToMix}>
                  ← {t("wrocDoMixu")}
                </Button>
              ) : null}
              <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">
                {e.provider ? t(`dostawca.${e.provider}`) : t("notatka")}
              </span>
            </li>
          ),
        )}
        {asking ? (
          <li data-testid="studio-bitek-chat-user" className="self-end max-w-[90%] rounded-[2px] bg-[var(--brd-recess)] px-2 py-1 text-sm">
            <span className="sr-only">{t("ty")}: </span>
            {asking}
          </li>
        ) : null}
        {busy ? (
          <li data-testid="studio-bitek-typing" className="text-sm italic text-[var(--brd-mute)]">
            {t("pisze")}{" "}
            <button type="button" className="underline not-italic" data-testid="studio-bitek-cancel" onClick={() => abortRef.current?.abort()}>
              {t("przerwij")}
            </button>
          </li>
        ) : null}
      </ol>
      {error ? (
        <p role="alert" className="border-l-2 border-l-[var(--brd-rec)] pl-2 text-sm">
          {error}
        </p>
      ) : null}
      {notice ? <p role="status" className="border-l-2 border-l-[var(--brd-amber)] pl-2 text-sm">{notice}</p> : null}
      <form
        className="flex flex-col gap-1"
        onSubmit={(ev) => {
          ev.preventDefault();
          void send();
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          {t("inputLabel")}
        </label>
        <div className="flex gap-1">
          <input
            id={inputId}
            ref={inputRef}
            data-testid="studio-bitek-input"
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            placeholder={t("placeholder")}
            aria-invalid={tooLong || undefined}
            aria-describedby={`${inputId}-count`}
            maxLength={BITEK_LIMITS.messageMaxChars + 50}
            autoComplete="off"
            className="h-9 min-w-0 flex-1 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-recess)] px-2 text-sm"
          />
          <Button type="submit" size="sm" className="min-h-9" disabled={busy || !text.trim() || tooLong} data-testid="studio-bitek-send">
            {error && text.trim() && !busy ? t("ponow") : t("wyslij")}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 pr-9 text-xs text-[var(--brd-mute)]">
          <span id={`${inputId}-count`} className={tooLong ? "text-[var(--brd-rec)]" : undefined}>
            {tooLong ? t("zaDlugie", { max: BITEK_LIMITS.messageMaxChars }) : t("licznik", { n: text.length, max: BITEK_LIMITS.messageMaxChars })}
          </span>
          <span data-testid="studio-bitek-memory" data-memory={store.memory}>
            {store.memory === "session" ? t("zapisSesja") : store.available ? t("zapisProjekt") : t("zapisLokalny")}
          </span>
        </div>
      </form>
    </div>
  );
}

/** After "Zastosuj": keep it or roll it back (Cofnij re-applies the values from before). */
function BitekDecisionRow({
  decision,
  disabled,
  onKeep,
  onUndo,
}: {
  decision: BitekDecision | null;
  disabled?: boolean;
  onKeep: () => void;
  onUndo: () => void;
}) {
  const t = useTranslations("studio.bitek.chat");
  if (!decision) return null;
  if (decision === "kept") {
    return (
      <li data-testid="studio-bitek-decision" data-decision="kept" className="text-xs text-[var(--brd-mute)]">
        ✓ {t("zostawione")}
      </li>
    );
  }
  if (decision === "undone") {
    return (
      <li data-testid="studio-bitek-decision" data-decision="undone" className="text-xs text-[var(--brd-mute)]">
        ↺ {t("cofniete")}
      </li>
    );
  }
  return (
    <li data-testid="studio-bitek-decision" data-decision="applied" className="flex flex-wrap items-center gap-2">
      <span className="text-xs">{t("pasuje")}</span>
      <Button type="button" size="sm" className="min-h-9" disabled={disabled} data-testid="studio-bitek-keep" onClick={onKeep}>
        {t("zostaw")}
      </Button>
      <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={disabled} data-testid="studio-bitek-undo" onClick={onUndo}>
        {t("cofnij")}
      </Button>
    </li>
  );
}
