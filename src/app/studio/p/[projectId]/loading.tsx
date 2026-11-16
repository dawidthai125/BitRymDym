import { PageFrame } from "@/components/brand/chrome";

/** Instant feedback while a studio project RSC is still loading. */
export default function StudioProjectLoading() {
  return (
    <PageFrame className="py-10">
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-56 bg-[var(--brd-line)]" />
        <div className="h-64 border border-[var(--brd-line)]" />
        <div className="h-24 border border-[var(--brd-line)]" />
      </div>
    </PageFrame>
  );
}
