import { PageFrame } from "@/components/brand/chrome";

/** Instant feedback while studio tracks RSC is still loading. */
export default function StudioTracksLoading() {
  return (
    <PageFrame className="py-10">
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-40 bg-[var(--brd-line)]" />
        <div className="h-32 border border-[var(--brd-line)]" />
      </div>
    </PageFrame>
  );
}
