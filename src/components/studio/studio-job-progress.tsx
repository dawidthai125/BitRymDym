import type { JobProgress } from "@/lib/studio/master/progress";

/** Live E3 job progress (Mastering / downloads): stage label, %, bar. */
export function StudioJobProgressBar({ value, label, ariaLabel, testId }: { value: JobProgress; label: string; ariaLabel: string; testId: string }) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-1 sm:max-w-md" data-testid={testId} data-stage={value.stage}>
      <div className="flex items-center justify-between gap-2 text-sm" aria-live="polite">
        <span className="truncate">{label}</span>
        <span className="tabular-nums font-semibold" data-testid={`${testId}-pct`}>{value.progress}%</span>
      </div>
      <div role="progressbar" aria-label={ariaLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.progress} aria-valuetext={`${label} ${value.progress}%`} className="h-2 w-full overflow-hidden rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)]">
        <div className="h-full bg-[var(--brd-green)] transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${Math.max(2, value.progress)}%` }} />
      </div>
    </div>
  );
}
