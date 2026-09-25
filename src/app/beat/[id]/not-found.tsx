import Link from "next/link";

import { SiteHeader } from "@/components/site/site-header";

export default function BeatNotFound() {
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto flex max-w-lg flex-col gap-4 px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bit niedostępny
        </h1>
        <p className="text-sm text-muted-foreground">
          Ten bit nie jest publicznie dostępny albo nie istnieje.
        </p>
        <Link
          href="/beats"
          className="text-sm underline underline-offset-4"
        >
          Wróć do katalogu
        </Link>
      </main>
    </div>
  );
}
