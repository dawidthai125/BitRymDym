"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { SampleBitekCard, type BitekApply, type BitekPreview } from "@/components/studio/sample-bitek-card";

import { ConsentSwitches } from "@/components/community/consent-switches";
import { Button } from "@/components/ui/button";
import { DEFAULT_USER_CONSENTS, type ListingConsents } from "@/lib/community/consents";
import {
  SAMPLE_INSTRUMENTS,
  isSampleInstrumentId,
  type SampleInstrumentId,
  type SampleKind,
  type SampleStatus,
} from "@/lib/studio/samples/sample-policy";
import {
  SAMPLE_NOTES,
  SAMPLE_RATE,
  renderInstrumentSample,
  renderInstrumentWav,
  type SampleNoteId,
} from "@/lib/studio/samples/sample-synth";

type SampleDto = {
  id: string;
  title: string;
  kind: SampleKind;
  instrument: string | null;
  status: SampleStatus;
  durationMs: number;
  catalogAssetId: string | null;
  moderationNote: string | null;
  mine: boolean;
  consents?: ListingConsents | null;
};

export function StudioSampleDesk({
  trackId,
  disabled,
  onPlace,
  bitekPreview,
  bitekApply,
}: {
  trackId: string;
  disabled: boolean;
  onPlace: (sampleId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** Bitek places the sample: tempo, key, bar and repeats (proposal first, then apply). */
  bitekPreview?: BitekPreview;
  bitekApply?: BitekApply;
}) {
  const tr = useTranslations("studio.studioRecordingPanel");
  const [tab, setTab] = useState<"mine" | "catalog" | "create">("create");
  const [samples, setSamples] = useState<SampleDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [instrument, setInstrument] = useState<SampleInstrumentId>("piano");
  const [note, setNote] = useState<SampleNoteId>("C4");
  const [durationMs, setDurationMs] = useState(2000);
  const [title, setTitle] = useState("");
  const [rights, setRights] = useState(false);
  const [uploadKind, setUploadKind] = useState<SampleKind>("effect");
  const [quota, setQuota] = useState<string | null>(null);
  /** Choices made before sending; the server stores them with the review request. */
  const [wishes, setWishes] = useState<Record<string, ListingConsents>>({});
  const [bitekFor, setBitekFor] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const locale = useLocale();
  const loadSeq = useRef(0);
  const playSeq = useRef(0);
  const stopPlaying = useRef<(() => void) | null>(null);
  useEffect(() => () => {
    playSeq.current += 1;
    stopPlaying.current?.();
  }, []);

  /** One request: the button always comes back and "no network" is a message. */
  async function send<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; body: (T & { message?: string }) | null }> {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
      return { ok: response.ok, body: (await response.json().catch(() => null)) as (T & { message?: string }) | null };
    } catch {
      return { ok: false, body: { message: tr("sampleBrakSieci") } as T & { message?: string } };
    }
  }

  /** One preview at a time; the same button stops it. */
  function stopPreview() {
    playSeq.current += 1;
    stopPlaying.current?.();
    stopPlaying.current = null;
    setPlaying(null);
  }

  const load = useCallback(async (scope: "mine" | "catalog") => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    let response: { ok: boolean } = { ok: false };
    let body: { samples?: SampleDto[]; message?: string; cap?: number; owned?: number } | null = null;
    try {
      const res = await fetch(`/api/studio/samples?scope=${scope}`, { signal: AbortSignal.timeout(30_000) });
      response = res;
      body = (await res.json().catch(() => null)) as typeof body;
    } catch {
      body = { message: tr("sampleBrakSieci") };
    }
    // A slower answer for the other tab must not replace this one.
    if (seq !== loadSeq.current) return;
    setLoading(false);
    if (!response.ok || !body?.samples) {
      setSamples([]);
      setQuota(null);
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setSamples(body.samples);
    setQuota(
      scope === "mine" && typeof body.cap === "number"
        ? tr("sampleLimit", { n: body.owned ?? body.samples.length, cap: body.cap })
        : null,
    );
  }, [tr]);

  function instrumentLabel(id: string | null): string {
    if (!id || !isSampleInstrumentId(id)) return "";
    return tr(`sampleInstrument_${id}`);
  }

  function statusLabel(value: SampleStatus): string {
    if (value === "PENDING_REVIEW") return tr("sampleStatusPending");
    if (value === "PUBLISHED") return tr("sampleStatusPublished");
    if (value === "REJECTED") return tr("sampleStatusRejected");
    return tr("sampleStatusPrivate");
  }

  function previewSynth() {
    const again = playing === "synth";
    stopPreview();
    if (again) return;
    const midi = SAMPLE_NOTES.find((item) => item.id === note)?.midi ?? 60;
    const pcm = renderInstrumentSample({ instrument, midi, durationMs });
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
    buffer.copyToChannel(new Float32Array(pcm), 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const seq = playSeq.current;
    stopPlaying.current = () => void ctx.close().catch(() => undefined);
    source.onended = () => {
      if (seq === playSeq.current) stopPreview();
    };
    setPlaying("synth");
    source.start();
  }

  async function saveSynth() {
    setError(null);
    setStatus(null);
    if (!rights) {
      setError(tr("samplePrawaWymagane"));
      return;
    }
    const midi = SAMPLE_NOTES.find((item) => item.id === note)?.midi ?? 60;
    const rendered = renderInstrumentWav({ instrument, midi, durationMs });
    if (!rendered.ok) {
      setError(tr("sampleBlad"));
      return;
    }
    const name = title.trim() || `${tr(`sampleInstrument_${instrument}`)} ${note}`;
    await uploadBytes(rendered.bytes, name, rendered.kind, rendered.instrument);
  }

  async function uploadBytes(
    bytes: Uint8Array,
    name: string,
    kind: SampleKind,
    instrumentId: string | null,
  ) {
    setBusyId("save");
    const form = new FormData();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    form.set("file", new File([copy.buffer], `${name}.wav`, { type: "audio/wav" }));
    form.set("title", name);
    form.set("kind", kind);
    form.set("instrument", instrumentId ?? "");
    form.set("rightsAccepted", rights ? "1" : "0");
    const { ok, body } = await send("/api/studio/samples", { method: "POST", body: form });
    setBusyId(null);
    if (!ok) {
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setStatus(tr("sampleZapisano"));
    setTab("mine");
    void load("mine");
  }

  async function onUploadFile(file: File | null) {
    setError(null);
    if (!file) return;
    if (!rights) {
      setError(tr("samplePrawaWymagane"));
      return;
    }
    const name = title.trim() || file.name.replace(/\.[^.]+$/, "");
    setBusyId("save");
    const form = new FormData();
    form.set("file", file);
    form.set("title", name);
    form.set("kind", uploadKind);
    form.set("instrument", "");
    form.set("rightsAccepted", "1");
    const { ok, body } = await send("/api/studio/samples", { method: "POST", body: form });
    setBusyId(null);
    if (!ok) {
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setStatus(tr("sampleZapisano"));
    setTab("mine");
    void load("mine");
  }

  async function place(sampleId: string) {
    if (!trackId) {
      setError(tr("sampleBrakSciezki"));
      return;
    }
    setBusyId(sampleId);
    setError(null);
    const placed = await onPlace(sampleId).catch(() => ({ ok: false as const, message: tr("sampleBrakSieci") }));
    setBusyId(null);
    if (!placed.ok) {
      setError(placed.message);
      return;
    }
    setStatus(tr("sampleUmieszczono"));
  }

  async function mutate(sampleId: string, action: "submit" | "delete") {
    setBusyId(sampleId);
    setError(null);
    setAskDelete(null);
    if (action === "delete" && playing === sampleId) stopPreview();
    const { ok, body } = await send(
      action === "submit"
        ? `/api/studio/samples/${sampleId}/submit`
        : `/api/studio/samples/${sampleId}`,
      action === "submit"
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(wishes[sampleId] ?? {}),
          }
        : { method: "DELETE" },
    );
    setBusyId(null);
    if (!ok) {
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setStatus(action === "submit" ? tr("sampleWyslano") : tr("sampleUsunieto"));
    void load("mine");
  }

  async function share(sample: SampleDto, patch: ListingConsents) {
    setBusyId(sample.id);
    setError(null);
    const { ok, body } = await send<{ sample?: SampleDto }>(`/api/studio/samples/${sample.id}/share`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusyId(null);
    if (!ok || !body?.sample) {
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setSamples((current) => current.map((item) => (item.id === sample.id ? { ...item, ...body.sample } : item)));
    setStatus(tr("sampleZapisano"));
  }

  async function previewSaved(sampleId: string) {
    const again = playing === sampleId;
    stopPreview();
    if (again) return;
    const seq = playSeq.current;
    setPlaying(sampleId);
    const { ok, body } = await send<{ url?: string }>(`/api/studio/samples/${sampleId}/play`);
    if (seq !== playSeq.current) return;
    if (!ok || !body?.url) {
      setPlaying(null);
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    const audio = new Audio(body.url);
    stopPlaying.current = () => audio.pause();
    audio.onended = () => {
      if (seq === playSeq.current) stopPreview();
    };
    await audio.play().catch(() => {
      if (seq !== playSeq.current) return;
      stopPreview();
      setError(tr("sampleBlad"));
    });
  }

  return (
    <div className="space-y-2 rounded border border-[var(--brd-line)] p-2" data-testid="studio-sample-desk">
      <p className="text-xs font-medium text-[var(--brd-ink)]">{tr("katalogKlipStudio")}</p>
      <p className="text-[11px] text-[var(--brd-mute)]">{tr("sampleLead")}</p>
      <a href="/studio/sample" className="inline-flex min-h-9 items-center text-xs font-semibold text-[var(--brd-amber)] underline-offset-4 hover:underline">
        {tr("pracowniaSampli")}
      </a>
      {quota ? <p className="text-[11px] text-[var(--brd-mute)]">{quota}</p> : null}
      <div className="grid grid-cols-3 gap-1">
        {(["create", "mine", "catalog"] as const).map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            className="min-h-11 w-full"
            variant={tab === item ? "default" : "secondary"}
            onClick={() => {
              setTab(item);
              if (item !== "create") void load(item);
            }}
          >
            {tr(item === "create" ? "sampleUtworz" : item === "mine" ? "sampleMoje" : "sampleKatalog")}
          </Button>
        ))}
      </div>
      {error ? (
        <p className="text-xs text-[var(--brd-danger,var(--brd-ink))]" role="alert">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="text-xs text-[var(--brd-ink-soft)]" role="status">
          {status}
        </p>
      ) : null}

      {tab === "create" ? (
        <div className="space-y-2">
          <label className="block text-xs text-[var(--brd-mute)]">
            {tr("sampleInstrument")}
            <select
              className="mt-1 min-h-11 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink)]"
              value={instrument}
              aria-label={tr("sampleInstrument")}
              onChange={(event) => setInstrument(event.target.value as SampleInstrumentId)}
            >
              {SAMPLE_INSTRUMENTS.map((item) => (
                <option key={item.id} value={item.id}>
                  {tr(`sampleInstrument_${item.id}`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs text-[var(--brd-mute)]">
              {tr("sampleNuta")}
              <select
                className="mt-1 min-h-11 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink)]"
                value={note}
                aria-label={tr("sampleNuta")}
                onChange={(event) => setNote(event.target.value as SampleNoteId)}
              >
                {SAMPLE_NOTES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-[var(--brd-mute)]">
              {tr("sampleDlugosc")}
              <select
                className="mt-1 min-h-11 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink)]"
                value={String(durationMs)}
                aria-label={tr("sampleDlugosc")}
                onChange={(event) => setDurationMs(Number(event.target.value))}
              >
                {[1000, 2000, 4000, 8000].map((ms) => (
                  <option key={ms} value={ms}>
                    {ms / 1000} s
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-[var(--brd-mute)]">
            {tr("sampleTytul")}
            <input
              className="mt-1 min-h-11 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink)]"
              value={title}
              maxLength={80}
              aria-label={tr("sampleTytul")}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="flex min-h-11 items-start gap-2 text-xs text-[var(--brd-ink)]">
            <input
              type="checkbox"
              className="mt-1"
              checked={rights}
              onChange={(event) => setRights(event.target.checked)}
            />
            <span>{tr("samplePrawa")}</span>
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button type="button" size="sm" className="min-h-11 w-full" variant="secondary" onClick={previewSynth}>
              {playing === "synth" ? tr("sampleStop") : tr("samplePodglad")}
            </Button>
            <Button type="button" size="sm" className="min-h-11 w-full" disabled={busyId === "save"} onClick={() => void saveSynth()}>
              {busyId === "save" ? tr("zapisywanie") : tr("sampleZapisz")}
            </Button>
          </div>
          <label className="block text-xs text-[var(--brd-mute)]">
            {tr("sampleRodzaj")}
            <select
              className="mt-1 min-h-11 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink)]"
              value={uploadKind}
              aria-label={tr("sampleRodzaj")}
              onChange={(event) => setUploadKind(event.target.value as SampleKind)}
            >
              <option value="instrument">{tr("sampleRodzajInstrument")}</option>
              <option value="effect">{tr("sampleRodzajEfekt")}</option>
            </select>
          </label>
          <label className="block text-xs text-[var(--brd-mute)]">
            {tr("sampleWgrajPlik")}
            <input
              className="mt-1 block w-full text-sm"
              type="file"
              accept="audio/wav,audio/mpeg,.wav,.mp3"
              aria-label={tr("sampleWgrajPlik")}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                // Cleared so the same file can be picked again (e.g. after ticking the rights box).
                event.target.value = "";
                void onUploadFile(file);
              }}
            />
          </label>
        </div>
      ) : loading ? (
        <p className="text-xs text-[var(--brd-mute)]">{tr("sampleLadowanie")}</p>
      ) : samples.length === 0 ? (
        <p className="text-xs text-[var(--brd-mute)]">{tr("samplePusty")}</p>
      ) : (
        <ul className="space-y-2">
          {samples.map((sample) => (
            <li key={sample.id} className="rounded border border-[var(--brd-line)] p-2">
              <p className="truncate text-sm text-[var(--brd-ink)]">{sample.title}</p>
              <p className="text-[11px] text-[var(--brd-mute)]">
                {instrumentLabel(sample.instrument) || tr(sample.kind === "effect" ? "sampleRodzajEfekt" : "sampleRodzajInstrument")}
                {" · "}
                {(sample.durationMs / 1000).toLocaleString(locale === "en" ? "en-US" : "pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s
                {" · "}
                {statusLabel(sample.status)}
              </p>
              {sample.moderationNote ? (
                <p className="text-[11px] text-[var(--brd-mute)]">{sample.moderationNote}</p>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11 w-full"
                  variant="secondary"
                  disabled={busyId === sample.id}
                  onClick={() => void previewSaved(sample.id)}
                >
                  {playing === sample.id ? tr("sampleStop") : tr("samplePodglad")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-11 w-full"
                  disabled={disabled || busyId === sample.id || !trackId}
                  onClick={() => void place(sample.id)}
                >
                  {tr("sampleDodajNaSciezke")}
                </Button>
                {bitekPreview && bitekApply ? (
                  bitekFor === sample.id ? (
                    <SampleBitekCard
                      sampleId={sample.id}
                      preview={bitekPreview}
                      apply={bitekApply}
                      onClose={(done) => {
                        setBitekFor(null);
                        if (done) setStatus(tr("bitekWstawil"));
                      }}
                    />
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      className="col-span-2 min-h-11 w-full"
                      disabled={disabled || busyId === sample.id || !trackId}
                      onClick={() => setBitekFor(sample.id)}
                    >
                      {tr("bitekWstawSampel")}
                    </Button>
                  )
                ) : null}
                {sample.mine && (sample.status === "PRIVATE" || sample.status === "REJECTED") ? (
                  <div className="col-span-2">
                    <ConsentSwitches
                      kind="sample"
                      compact
                      hideListed
                      value={wishes[sample.id] ?? { ...(sample.consents ?? DEFAULT_USER_CONSENTS), listed: true }}
                      disabled={busyId === sample.id}
                      onChange={(next) => setWishes((current) => ({ ...current, [sample.id]: next }))}
                    />
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-11 w-full"
                      variant="secondary"
                      disabled={busyId === sample.id}
                      onClick={() => void mutate(sample.id, "submit")}
                    >
                      {tr("sampleWyslij")}
                    </Button>
                    <p className="mt-1 text-[11px] text-[var(--brd-mute)]">{tr("sampleWyslijOpis")}</p>
                  </div>
                ) : null}
                {sample.mine && (sample.status === "PRIVATE" || sample.status === "REJECTED") ? (
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 w-full"
                    variant="secondary"
                    disabled={busyId === sample.id}
                    onClick={() => (askDelete === sample.id ? void mutate(sample.id, "delete") : setAskDelete(sample.id))}
                    onBlur={() => setAskDelete((cur) => (cur === sample.id ? null : cur))}
                  >
                    {askDelete === sample.id ? tr("sampleUsunNaPewno") : tr("sampleUsun")}
                  </Button>
                ) : null}
                {sample.mine && (sample.status === "PUBLISHED" || sample.status === "PENDING_REVIEW") && sample.consents ? (
                  <div className="col-span-2">
                    <ConsentSwitches
                      kind="sample"
                      compact
                      value={sample.consents}
                      disabled={busyId === sample.id}
                      onChange={(next) => void share(sample, next)}
                    />
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-[var(--brd-mute)]">{tr("sampleSesja")}</p>
    </div>
  );
}
