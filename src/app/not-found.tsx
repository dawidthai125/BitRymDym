import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nie znaleziono</h1>
      <p className="text-sm text-muted-foreground">
        Ta strona nie istnieje w scaffoldzie BitRymDym.
      </p>
      <Link href="/" className="text-sm underline underline-offset-4">
        Wróć do strony głównej
      </Link>
    </main>
  );
}
