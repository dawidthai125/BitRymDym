import { PageFrame } from "@/components/brand/chrome";

/** Shown at once while a profile section is still loading, so the tab click does not freeze the old page. */
export default function AccountLoading() {
  return (
    <PageFrame className="py-10">
      <div className="space-y-4">
        <div className="h-8 w-48 bg-[var(--brd-line)]" />
        <div className="h-24 border border-[var(--brd-line)]" />
        <div className="h-24 border border-[var(--brd-line)]" />
      </div>
    </PageFrame>
  );
}
