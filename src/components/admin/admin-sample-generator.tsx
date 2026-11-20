"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { SampleCatalog, type CatalogSampleItem } from "@/components/community/sample-catalog";

type Preset = { id: string; types: ("loop" | "oneshot")[]; pitched: boolean; group: "melody" | "bass" | "drums" };
type Option = { id: string; label: string };

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAX_BARS_SECONDS = 30;

const field = "min-h-10 w-full rounded-lg border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink)]";
const chip = (on: boolean) =>
  `min-h-9 rounded-full border px-3 text-sm ${on ? "border-[var(--brd-amber)] bg-[var(--brd-amber)]/15 text-[var(--brd-ink)]" : "border-[var(--brd-line)] text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"}`;

type Generated = CatalogSampleItem & { measuredKey: string | null; measuredBpm: number | null; published: boolean };

/**
 * Admin sample generator: instrument, loop or one-shot, tempo (typed or taken from a catalog
 * beat, with the beat's key measured), key/note and a few style words. Several variants are
 * made at once; each lands as a private sample to listen to, edit, publish or delete.
 */
export function AdminSampleGenerator({
  presets,
  beats,
  instruments,
  types,
}: {
  presets: Preset[];
  beats: { id: string; title: string; bpm: number | null }[];
  instruments: Option[];
  types: Option[];
}) {
  const t = useTranslations("admin.adminSampleGenerator");
  const [presetId, setPresetId] = useState(presets[0]?.id ?? "");
  const preset = presets.find((p) => p.id === presetId) ?? presets[0]!;
  const [type, setType] = useState<"loop" | "oneshot">("loop");
  const [beatId, setBeatId] = useState("");
  const [beatInfo, setBeatInfo] = useState<string | null>(null);
  const [bpm, setBpm] = useState("90");
  const [bars, setBars] = useState("4");
  const [key, setKey] = useState("");
  const [octave, setOctave] = useState("2");
  const [style, setStyle] = useState("");
  const [count, setCount] = useState(2);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Generated[]>([]);

  const effectiveType = preset.types.includes(type) ? type : preset.types[0]!;
  const bpmNum = Number(bpm);
  const barChoices = useMemo(
    () => [1, 2, 4, 8, 16].filter((b) => bpmNum >= 60 && (b * 4 * 60) / bpmNum <= MAX_BARS_SECONDS),
    [bpmNum],
  );
  const keyValue = !preset.pitched || !key ? null : effectiveType === "oneshot" ? `${key.replace(/m$/, "")}${octave}` : key;

  async function pickBeat(id: string) {
    setBeatId(id);
    setBeatInfo(null);
    if (!id) return;
    setBusy(t("czytamBit"));
    try {
      const res = await fetch(`/api/admin/samples/generate/beat?beatId=${id}`);
      const json = (await res.json()) as { bpm?: number | null; key?: string | null };
      if (json.bpm) setBpm(String(json.bpm));
      if (json.key) setKey(json.key);
      setBeatInfo(t("zBitu", { bpm: json.bpm ?? "—", key: json.key ?? t("tonacjaNieznana") }));
    } catch {
      setBeatInfo(t("bitBlad"));
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setError(null);
    const body = {
      preset: preset.id,
      type: effectiveType,
      bpm: effectiveType === "loop" ? bpmNum : null,
      bars: effectiveType === "loop" ? Number(bars) : null,
      key: keyValue,
      style,
      count,
      beatId: beatId || null,
    };
    setBusy(t("generuje", { n: count }));
    try {
      const res = await fetch("/api/admin/samples/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as { success?: boolean; error?: string; jobs?: { generationId: string }[] };
      if (!res.ok || !json.jobs) throw new Error(json.error || t("blad"));
      const name = t(`preset.${preset.id}`);
      const base = results.length;
      const titled = json.jobs.map((job, i) => ({
        job,
        title: [name, keyValue, effectiveType === "loop" ? `${bpmNum}` : null].filter(Boolean).join(" ") + ` #${base + i + 1}`,
      }));
      const made = await Promise.all(
        titled.map(async ({ job, title }) => {
          const deadline = Date.now() + 4 * 60_000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 3500));
            const r = await fetch("/api/admin/samples/generate/result", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, generationId: job.generationId, title }),
            });
            const j = (await r.json()) as {
              success?: boolean;
              error?: string;
              status?: string;
              sample?: { id: string; title: string; durationMs: number; instrument: string | null };
              measured?: { key: string | null; bpm: number | null };
            };
            if (!r.ok || !j.success) throw new Error(j.error || t("blad"));
            if (j.status === "ready" && j.sample) return { s: j.sample, m: j.measured ?? { key: null, bpm: null } };
          }
          throw new Error(t("czasMinal"));
        }),
      );
      const label = (id: string | null) => instruments.find((o) => o.id === id)?.label ?? id;
      setResults((prev) => [
        ...made.map(({ s, m }, i): Generated => ({
          id: s.id,
          no: base + i + 1,
          title: s.title,
          author: "BitRymDym",
          durationMs: s.durationMs,
          instrument: s.instrument,
          instrumentLabel: label(s.instrument),
          sampleType: effectiveType,
          typeLabel: types.find((o) => o.id === effectiveType)?.label ?? effectiveType,
          bpm: effectiveType === "loop" ? bpmNum : null,
          bars: effectiveType === "loop" ? Number(bars) : null,
          barsLabel: effectiveType === "loop" ? t("taktow", { n: Number(bars) }) : null,
          musicalKey: m.key ?? keyValue,
          platform: true,
          measuredKey: m.key,
          measuredBpm: m.bpm,
          published: false,
        })),
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("blad"));
    } finally {
      setBusy(null);
    }
  }

  async function publish(id: string) {
    const res = await fetch("/api/admin/samples/generate/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sampleId: id }) });
    if (res.ok) setResults((prev) => prev.map((r) => (r.id === id ? { ...r, published: true } : r)));
    else setError(t("blad"));
  }

  const groups: ("melody" | "bass" | "drums")[] = ["melody", "bass", "drums"];

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-xl border border-[var(--brd-line)] p-4">
        {groups.map((g) => (
          <div key={g} className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wide text-[var(--brd-mute)]">{t(`grupa.${g}`)}</p>
            <div className="flex flex-wrap gap-2">
              {presets
                .filter((p) => p.group === g)
                .map((p) => (
                  <button key={p.id} type="button" className={chip(p.id === preset.id)} aria-pressed={p.id === preset.id} onClick={() => setPresetId(p.id)}>
                    {t(`preset.${p.id}`)}
                  </button>
                ))}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-2" role="group" aria-label={t("typ")}>
          {(["loop", "oneshot"] as const).map((v) => (
            <button
              key={v}
              type="button"
              disabled={!preset.types.includes(v)}
              className={`${chip(effectiveType === v)} disabled:opacity-30`}
              aria-pressed={effectiveType === v}
              onClick={() => setType(v)}
            >
              {t(`typy.${v}`)}
            </button>
          ))}
        </div>

        {effectiveType === "loop" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)] sm:col-span-3">
              {t("podBit")}
              <select value={beatId} onChange={(e) => void pickBeat(e.target.value)} className={field}>
                <option value="">{t("bezBitu")}</option>
                {beats.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                    {b.bpm ? ` · ${b.bpm} BPM` : ""}
                  </option>
                ))}
              </select>
              {beatInfo ? <span className="text-[var(--brd-ink-soft)]">{beatInfo}</span> : null}
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
              BPM
              <input value={bpm} inputMode="numeric" onChange={(e) => setBpm(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} className={field} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
              {t("takty")}
              <select value={barChoices.includes(Number(bars)) ? bars : String(barChoices.at(-1) ?? 1)} onChange={(e) => setBars(e.target.value)} className={field}>
                {barChoices.map((b) => (
                  <option key={b} value={b}>
                    {t("taktow", { n: b })} · {((b * 240) / (bpmNum || 90)).toFixed(1)} s
                  </option>
                ))}
              </select>
            </label>
            {preset.pitched ? (
              <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
                {t("tonacja")}
                <select value={key} onChange={(e) => setKey(e.target.value)} className={field}>
                  <option value="">{t("dowolna")}</option>
                  {NOTES.flatMap((n) => [`${n}m`, n]).map((k) => (
                    <option key={k} value={k}>
                      {k.endsWith("m") ? `${k.slice(0, -1)} moll` : `${k} dur`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : preset.pitched ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
              {t("nuta")}
              <select value={key.replace(/m$/, "")} onChange={(e) => setKey(e.target.value)} className={field}>
                <option value="">{t("dowolna")}</option>
                {NOTES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
              {t("oktawa")}
              <select value={octave} onChange={(e) => setOctave(e.target.value)} className={field}>
                {["1", "2", "3", "4"].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
            {t("styl")}
            <input value={style} maxLength={200} onChange={(e) => setStyle(e.target.value)} placeholder={t("stylPrzyklad")} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-[var(--brd-mute)]">
            {t("ile")}
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className={field}>
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void generate()}
            className="min-h-11 rounded-lg bg-[var(--brd-amber)] px-5 text-sm font-medium text-[var(--brd-bg)] disabled:opacity-50"
          >
            {t("generuj")}
          </button>
          <span className="text-sm text-[var(--brd-mute)]" aria-live="polite">
            {busy ?? t("koszt", { n: count })}
          </span>
        </div>
        {error ? (
          <p className="text-sm text-[var(--brd-rec)]" role="alert">
            {error}
          </p>
        ) : null}
      </section>

      {results.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t("wyniki")}</h2>
          <p className="text-sm text-[var(--brd-mute)]">{t("wynikiOpis")}</p>
          <SampleCatalog
            items={results}
            signedIn
            isAdmin
            instruments={instruments}
            types={types}
            showTalk={false}
            showFilters={false}
            extra={(item) => {
              const r = results.find((x) => x.id === item.id);
              if (!r) return null;
              const keyNote =
                r.measuredKey && keyValue && r.measuredKey !== keyValue ? t("tonacjaInna", { key: r.measuredKey }) : r.measuredKey ? t("tonacjaZmierzona", { key: r.measuredKey }) : null;
              return (
                <>
                  {keyNote ? <span className="text-xs text-[var(--brd-mute)]">{keyNote}</span> : null}
                  {r.published ? (
                    <span className="text-sm text-[var(--brd-green)]">{t("wydany")}</span>
                  ) : (
                    <button type="button" onClick={() => void publish(r.id)} className="inline-flex min-h-11 items-center text-sm text-[var(--brd-amber)] underline underline-offset-4">
                      {t("doKatalogu")}
                    </button>
                  )}
                </>
              );
            }}
          />
        </section>
      ) : null}
    </div>
  );
}
