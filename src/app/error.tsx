"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Wystąpił błąd</h1>
      <p className="text-sm text-muted-foreground">
        {error.message || "Nieoczekiwany błąd aplikacji."}
      </p>
      <button
        type="button"
        className="w-fit rounded-lg border border-border px-3 py-1.5 text-sm"
        onClick={() => reset()}
      >
        Spróbuj ponownie
      </button>
    </main>
  );
}
