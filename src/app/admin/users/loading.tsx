import { PageFrame } from "@/components/brand/chrome";

/** Instant feedback while users admin RSC is still loading. */
export default function AdminUsersLoading() {
  return (
    <PageFrame width="ops" className="py-8">
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-48 bg-[var(--brd-line)]" />
        <div className="h-10 w-full max-w-xl border border-[var(--brd-line)]" />
        <div className="h-40 border border-[var(--brd-line)]" />
        <div className="h-40 border border-[var(--brd-line)]" />
      </div>
    </PageFrame>
  );
}
