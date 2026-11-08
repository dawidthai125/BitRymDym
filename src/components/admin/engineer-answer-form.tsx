"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = { requestId: string };

/** Manual reply. Nothing here submits until the button is pressed. */
export function EngineerAnswerForm({ requestId }: Props) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin/engineer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: requestId, answer }),
      });
      if (res.status === 200) {
        setSaved(true);
        setNote("Zapisane.");
        router.refresh();
      } else if (res.status === 409) {
        setNote("To zgłoszenie nie jest już otwarte.");
      } else if (res.status === 400) {
        setNote("Odpowiedź musi mieć od 1 do 2000 znaków.");
      } else {
        setNote("Nie udało się zapisać odpowiedzi.");
      }
    } catch {
      setNote("Nie udało się zapisać odpowiedzi.");
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return <p className="mt-3 text-sm text-[var(--brd-ink-soft)]">Zapisane.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm text-[var(--brd-ink-soft)]">
        Odpowiedź
        <textarea
          name="answer"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          minLength={1}
          maxLength={2000}
          required
          rows={4}
          className="border border-[var(--brd-line)] bg-transparent px-3 py-2 text-[var(--brd-ink)]"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-fit border border-[var(--brd-line)] px-3 py-2 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-amber)] disabled:opacity-50"
      >
        {busy ? "Zapisywanie…" : "Odpowiedz"}
      </button>
      {note ? <p className="text-sm text-[var(--brd-ink-soft)]">{note}</p> : null}
    </form>
  );
}
