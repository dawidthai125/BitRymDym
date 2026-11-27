"use client";

/**
 * Studio step navigation: 1. Nagranie · Sample · 2. Mix · 3. Mastering, plus the record-step
 * toolbar (full view, "Przejdź do mixu"). Split out of studio-editor.tsx (2026-11-22);
 * state stays in the editor, this file only renders and calls back.
 */

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

export type StudioStepId = "record" | "mix" | "master";

export function StudioStepNav({
  studioStep,
  onSampleTab,
  showSamplesTab = true,
  hasGroupBar = false,
  recordingLocked,
  canGoMix,
  songReady,
  advancedRecord,
  recordFullView,
  onRecord,
  onSamples,
  onMix,
  onMaster,
  onToggleFullView,
  onStepIntent,
}: {
  studioStep: StudioStepId;
  onSampleTab: boolean;
  /** False in the full record view: samples open from "Dodaj". */
  showSamplesTab?: boolean;
  /** Below xl the group bar is on screen: samples and the view switch live there. */
  hasGroupBar?: boolean;
  recordingLocked: boolean;
  canGoMix: boolean;
  /** autoMixMasterMaterial(...).ready: beat + vocal are enough for "Zrób utwór". */
  songReady: boolean;
  advancedRecord: boolean;
  recordFullView: boolean;
  onRecord: () => void;
  onSamples: () => void;
  onMix: () => void;
  /** Set when this very mix passed the analysis or already has a master: step 3 opens from here. */
  onMaster?: () => void;
  onToggleFullView: () => void;
  /** Hover / focus / touch on the nav: warm the lazily loaded step panels before the click. */
  onStepIntent?: () => void;
}) {
  const tMix = useTranslations("studio.mixStep");
  return (
      <nav
        aria-label={tMix("krokiAria")}
        data-testid="studio-step-nav"
        onPointerEnter={onStepIntent}
        onPointerDownCapture={onStepIntent}
        onFocusCapture={onStepIntent}
        className="flex flex-wrap items-center gap-2 border-b border-[var(--brd-line)] py-1 max-sm:gap-1"
      >
        <ol className="flex flex-wrap items-center gap-1 text-xs font-semibold tracking-[0.06em] max-sm:gap-0 max-sm:tracking-normal">
          <li>
            <button
              type="button"
              data-testid="studio-tab-record"
              aria-current={studioStep === "record" && !onSampleTab ? "step" : undefined}
              className={
                studioStep === "record" && !onSampleTab
                  ? "min-h-11 rounded-[2px] bg-[var(--brd-ink)] px-2 py-1 text-[var(--brd-paper)] max-sm:px-1.5"
                  : "min-h-11 rounded-[2px] px-2 py-1 text-[var(--brd-mute)] max-sm:px-1.5"
              }
              onClick={onRecord}
            >
              1. {tMix("krokNagranie")}
            </button>
          </li>
          {showSamplesTab ? (
          <li className={`flex items-center ${hasGroupBar && !onSampleTab ? "max-xl:hidden" : ""}`}>
            <span aria-hidden className="px-0.5 text-[var(--brd-mute)]">·</span>
            <button
              type="button"
              data-testid="studio-tab-samples"
              aria-current={onSampleTab ? "step" : undefined}
              disabled={recordingLocked}
              className={
                onSampleTab
                  ? "min-h-11 rounded-[2px] bg-[var(--brd-ink)] px-2 py-1 text-[var(--brd-paper)] disabled:opacity-50 max-sm:px-1.5"
                  : "min-h-11 rounded-[2px] px-2 py-1 text-[var(--brd-mute)] disabled:opacity-50 max-sm:px-1.5"
              }
              onClick={onSamples}
            >
              {tMix("krokSample")}
            </button>
          </li>
          ) : null}
          {(["mix", "master"] as const).map((s, i) => {
            const label = `${i + 2}. ${s === "mix" ? tMix("krokMix") : tMix("krokMastering")}`;
            const active = studioStep === s;
            // Mix opens from the record step (once there is a vocal) and from Mastering. Mastering opens once this mix passed the analysis or has a master.
            const goMix = s === "mix" && !active && (studioStep === "master" || canGoMix);
            const goMaster = s === "master" && !active && !recordingLocked ? onMaster : undefined;
            if (goMix || goMaster) {
              return (
                <li key={s}>
                  <button
                    type="button"
                    data-testid={goMaster ? "studio-tab-master" : "studio-tab-mix"}
                    title={goMaster ? undefined : tMix("krokMixTytul")}
                    className="min-h-11 rounded-[2px] px-2 py-1 text-[var(--brd-mute)] underline-offset-4 hover:underline max-sm:px-1.5"
                    onClick={goMaster ?? onMix}
                  >
                    {label}
                  </button>
                </li>
              );
            }
            return (
              <li
                key={s}
                aria-current={active ? "step" : undefined}
                title={active ? undefined : s === "master" ? tMix("krokMasteringTytul") : tMix("przejdzDoMixuBrakWokalu")}
                data-testid={!active && s === "master" ? "studio-tab-master-locked" : !active ? "studio-tab-mix-locked" : undefined}
                className={
                  active
                    ? "rounded-[2px] bg-[var(--brd-ink)] px-2 py-1 text-[var(--brd-paper)] max-sm:px-1.5"
                    : "flex items-center gap-1 px-2 py-1 text-[var(--brd-mute)] max-sm:px-1.5"
                }
              >
                {label}
                {!active ? (
                  <>
                    <span aria-hidden>🔒</span>
                    <span className="text-[10px] font-normal tracking-normal max-lg:sr-only">{s === "master" ? tMix("krokMasteringZamek") : tMix("krokMixZamek")}</span>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
        {studioStep === "record" ? (
          <div className={`ml-auto flex flex-wrap items-center justify-end gap-2 ${hasGroupBar ? "" : "max-sm:w-full"}`}>
            {onSampleTab ? null : advancedRecord ? (
              <Button
                type="button"
                size="sm"
                variant={recordFullView ? "default" : "outline"}
                className={`min-h-11 px-3 ${hasGroupBar ? "max-xl:hidden" : ""}`}
                data-testid="studio-record-full-view"
                aria-pressed={recordFullView}
                disabled={recordingLocked}
                title={tMix("pelnyWidokOpis")}
                onClick={onToggleFullView}
              >
                {tMix("pelnyWidok")}
              </Button>
            ) : (
              <span className={`max-w-[18rem] text-xs leading-snug text-[var(--brd-mute)] max-sm:hidden ${hasGroupBar ? "max-xl:hidden" : ""}`} data-testid="studio-record-simple-only">
                {tMix("widokUproszczonyPlan")}
              </span>
            )}
            <span id="studio-go-mix-hint" className={canGoMix ? "text-xs text-[var(--brd-mute)] max-lg:sr-only sm:max-w-[22rem]" : "sr-only"}>
              {songReady
                ? tMix("przejdzDoMixuUtwor")
                : canGoMix
                  ? tMix("przejdzDoMixuOpis")
                  : tMix("przejdzDoMixuBrakWokalu")}
            </span>
            <Button
              type="button"
              size="sm"
              /* Phones: step "2. Mix" in the same row does this. */
              className={`min-h-11 px-3 ${hasGroupBar ? "max-sm:hidden" : ""}`}
              data-testid="studio-go-mix"
              aria-describedby="studio-go-mix-hint"
              disabled={!canGoMix}
              title={canGoMix ? undefined : tMix("przejdzDoMixuBrakWokalu")}
              onClick={onMix}
            >
              {tMix("przejdzDoMixu")} →
            </Button>
          </div>
        ) : null}
      </nav>
  );
}
