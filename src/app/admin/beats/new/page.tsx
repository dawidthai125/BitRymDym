import Link from "next/link";

import { AdminCreateBeatForm } from "@/components/admin/admin-create-beat-form";

export default function AdminNewBeatPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pb-16">
      <header className="space-y-2">
        <Link
          href="/admin/beats"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Lista
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">Nowy PLATFORM beat</h1>
        <p className="text-sm text-muted-foreground">
          Tworzy DRAFT z{" "}
          <code className="text-xs">ownership_type=PLATFORM</code>,{" "}
          <code className="text-xs">owner_id=NULL</code>.
        </p>
      </header>
      <AdminCreateBeatForm />
    </main>
  );
}
