import { PageFrame } from "@/components/brand/chrome";

/** Instant feedback while sample-policy RSC is still loading. */
export default function AdminSamplePolicyLoading() {
  return (
    <PageFrame width="ops" className="py-8">
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-56 bg-[var(--brd-line)]" />
        <div className="h-48 border border-[var(--brd-line)]" />
      </div>
    </PageFrame>
  );
}
