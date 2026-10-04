import { PageFrame, SectionLabel } from "@/components/brand/chrome";

export default function AdminUsersLoading() {
  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <SectionLabel>ADMIN</SectionLabel>
        <h1 className="brd-display mt-2 text-3xl font-semibold tracking-tight">
          Użytkownicy
        </h1>
        <p className="mt-6 text-sm text-[var(--brd-mute)]">Ładowanie…</p>
      </PageFrame>
    </main>
  );
}
