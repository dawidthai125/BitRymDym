"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
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
};

export function StudioSampleDesk({
  trackId,
  disabled,
  onPlace,
}: {
  trackId: string;
  disabled: boolean;
  onPlace: (sampleId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
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

  const load = useCallback(async (scope: "mine" | "catalog") => {
    setLoading(true);
    setError(null);
    const response = await fetch(`/api/studio/samples?scope=${scope}`);
    const body = (await response.json().catch(() => null)) as {
      samples?: SampleDto[];
      message?: string;
    } | null;
    setLoading(false);
    if (!response.ok || !body?.samples) {
      setSamples([]);
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setSamples(body.samples);
  }, [tr]);

  useEffect(() => {
    if (tab === "create") return;
    void load(tab);
  }, [tab, load]);

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

  async function previewSynth() {
    const midi = SAMPLE_NOTES.find((item) => item.id === note)?.midi ?? 60;
    const pcm = renderInstrumentSample({ instrument, midi, durationMs });
    const ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
    buffer.copyToChannel(new Float32Array(pcm), 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => void ctx.close();
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
    const response = await fetch("/api/studio/samples", { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setBusyId(null);
    if (!response.ok) {
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setStatus(tr("sampleZapisano"));
    setTab("mine");
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
    const response = await fetch("/api/studio/samples", { method: "POST", body: form });
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setBusyId(null);
    if (!response.ok) {
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setStatus(tr("sampleZapisano"));
    setTab("mine");
  }

  async function place(sampleId: string) {
    if (!trackId) {
      setError(tr("sampleBrakSciezki"));
      return;
    }
    setBusyId(sampleId);
    setError(null);
    const placed = await onPlace(sampleId);
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
    const response = await fetch(
      action === "submit"
        ? `/api/studio/samples/${sampleId}/submit`
        : `/api/studio/samples/${sampleId}`,
      { method: action === "submit" ? "POST" : "DELETE" },
    );
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    setBusyId(null);
    if (!response.ok) {
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    setStatus(action === "submit" ? tr("sampleWyslano") : tr("sampleUsunieto"));
    void load("mine");
  }

  async function previewSaved(sampleId: string) {
    setBusyId(sampleId);
    const response = await fetch(`/api/studio/samples/${sampleId}/play`);
    const body = (await response.json().catch(() => null)) as {
      url?: string;
      message?: string;
    } | null;
    setBusyId(null);
    if (!response.ok || !body?.url) {
      setError(body?.message || tr("sampleBlad"));
      return;
    }
    const audio = new Audio(body.url);
    await audio.play().catch(() => setError(tr("sampleBlad")));
  }

  return (
    <div className="space-y-2 rounded border border-[var(--brd-line)] p-2" data-testid="studio-sample-desk">
      <p className="text-xs font-medium text-[var(--brd-ink)]">{tr("katalogKlipStudio")}</p>
      <p className="text-[11px] text-[var(--brd-mute)]">{tr("sampleLead")}</p>
      <div className="grid grid-cols-3 gap-1">
        {(["create", "mine", "catalog"] as const).map((item) => (
          <Button
            key={item}
            type="button"
            size="sm"
            className="min-h-11 w-full"
            variant={tab === item ? "default" : "secondary"}
            onClick={() => setTab(item)}
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
                    {ms / 1000}s
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
            <Button type="button" size="sm" className="min-h-11 w-full" variant="secondary" onClick={() => void previewSynth()}>
              {tr("samplePodglad")}
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
              onChange={(event) => void onUploadFile(event.target.files?.[0] ?? null)}
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
                {instrumentLabel(sample.instrument) || sample.kind}
                {" · "}
                {(sample.durationMs / 1000).toFixed(1)}s
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
                  {tr("samplePodglad")}
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
                {sample.mine && (sample.status === "PRIVATE" || sample.status === "REJECTED") ? (
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
                ) : null}
                {sample.mine && (sample.status === "PRIVATE" || sample.status === "REJECTED") ? (
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-11 w-full"
                    variant="secondary"
                    disabled={busyId === sample.id}
                    onClick={() => void mutate(sample.id, "delete")}
                  >
                    {tr("sampleUsun")}
                  </Button>
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
