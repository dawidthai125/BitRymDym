import { PageFrame } from "@/components/brand/chrome";

/** Instant feedback while optymalizator RSC is still loading. */
export default function StudioOptymalizatorLoading() {
  return (
    <PageFrame className="py-10">
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-48 bg-[var(--brd-line)]" />
        <div className="h-48 border border-[var(--brd-line)]" />
      </div>
    </PageFrame>
  );
}
