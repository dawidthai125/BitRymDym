"use client";

import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";
import { useId, useSyncExternalStore } from "react";

import { BrdButton, BrdLink } from "@/components/brand/brd-button";
import { FIRST_STEPS_STORAGE_KEY, type FirstStep } from "@/lib/studio/first-steps";

const listeners = new Set<() => void>();
let hiddenThisView = false;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readHidden(): boolean {
  try {
    return window.localStorage.getItem(FIRST_STEPS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function hide() {
  try {
    window.localStorage.setItem(FIRST_STEPS_STORAGE_KEY, "1");
  } catch {
    /* private mode — hidden for this view only */
  }
  hiddenThisView = true;
  listeners.forEach((l) => l());
}

/** Server render: hidden, so users who dismissed it never see a flash. */
const serverHidden = () => true;
const clientHidden = () => hiddenThisView || readHidden();

const stepKeys = {
  beat: { title: "krok1Tytul", body: "krok1Opis", cta: "krok1Przycisk" },
  record: { title: "krok2Tytul", body: "krok2Opis", cta: "otworzProjekt" },
  mix: { title: "krok3Tytul", body: "krok3Opis", cta: "otworzProjekt" },
  master: { title: "krok4Tytul", body: "krok4Opis", cta: "otworzProjekt" },
} as const;

export function StudioFirstStepsCard({ steps }: { steps: FirstStep[] }) {
  const t = useTranslations("studio.firstSteps");
  const titleId = useId();
  const hidden = useSyncExternalStore(subscribe, clientHidden, serverHidden);
  if (hidden) return null;

  return (
    <section
      aria-labelledby={titleId}
      data-testid="studio-first-steps"
      className="border border-[var(--brd-line)] border-l-4 border-l-[var(--brd-green)] bg-[var(--brd-paper)] p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-lg font-semibold text-[var(--brd-ink)]">
          {t("tytul")}
        </h2>
        <BrdButton variant="ghost" className="-mr-2 -mt-2 shrink-0 text-sm" onClick={hide} data-testid="studio-first-steps-hide">
          {t("ukryj")}
        </BrdButton>
      </div>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2">
        {steps.map((step, index) => {
          const keys = stepKeys[step.id];
          return (
            <li key={step.id} className="flex gap-3" data-done={step.done ? "true" : "false"}>
              <span
                aria-hidden="true"
                className={
                  step.done
                    ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brd-green)] text-sm font-bold text-[var(--primary-foreground)]"
                    : "flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--brd-ink-soft)] text-sm font-bold text-[var(--brd-ink)]"
                }
              >
                {step.done ? "✓" : index + 1}
              </span>
              <div className="min-w-0 space-y-1">
                <h3 className="text-sm font-semibold text-[var(--brd-ink)]">
                  <span className="sr-only">{t("krokNr", { n: index + 1 })} </span>
                  {t(keys.title)}
                  {step.done ? <span className="ml-2 text-xs font-normal text-[var(--brd-green)]">{t("zrobione")}</span> : null}
                </h3>
                <p className="text-sm text-[var(--brd-ink-soft)]">{t(keys.body)}</p>
                <div className="flex flex-wrap gap-x-4">
                  {step.href ? (
                    <BrdLink href={step.href} variant="bare" className="text-sm">
                      {t(keys.cta)}
                    </BrdLink>
                  ) : null}
                  {step.id === "record" ? (
                    <Link
                      href="/nagrywarka"
                      className="inline-flex min-h-11 items-center text-sm text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
                    >
                      {t("programWindows")}
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
