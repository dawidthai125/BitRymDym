"use client";

import { useEffect, useState } from "react";

type EngineerRequest = {
  id: string;
  body: string;
  status: string;
  answer: string | null;
  created_at: string | null;
};

export function StudioEngineerForm() {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [requests, setRequests] = useState<EngineerRequest[] | null>(null);
  const [listError, setListError] = useState(false);

  async function loadRequests() {
    try {
      const res = await fetch("/api/studio/engineer");
      if (!res.ok) {
        setListError(true);
        return;
      }
      const payload = (await res.json()) as { requests?: unknown };
      if (!Array.isArray(payload.requests)) {
        setListError(true);
        return;
      }
      setListError(false);
      setRequests(payload.requests as EngineerRequest[]);
    } catch {
      setListError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after the queue response
    void loadRequests();
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/studio/engineer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (res.status === 201) {
        setBody("");
        setNote("Wysłane. Odpowie człowiek, nie automat.");
        await loadRequests();
      } else if (res.status === 401) {
        setNote("Zaloguj się, żeby wysłać zgłoszenie.");
      } else if (res.status === 400) {
        setNote("Treść musi mieć od 4 do 2000 znaków.");
      } else {
        setNote("Nie udało się zapisać zgłoszenia.");
      }
    } catch {
      setNote("Nie udało się zapisać zgłoszenia.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-w-lg flex-col gap-8">
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm text-[var(--brd-ink-soft)]">
        Co ma zrobić realizator
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          minLength={4}
          maxLength={2000}
          required
          rows={6}
          className="border border-[var(--brd-line)] bg-transparent px-3 py-2 text-[var(--brd-ink)]"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-fit border border-[var(--brd-line)] px-3 py-2 text-sm text-[var(--brd-ink)] hover:border-[var(--brd-amber)] disabled:opacity-50"
      >
        {busy ? "Wysyłanie…" : "Wyślij do kolejki"}
      </button>
      {note ? <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{note}</p> : null}
    </form>
    <section className="flex flex-col gap-3">
      <h2 className="text-sm text-[var(--brd-ink-soft)]">Twoje zgłoszenia</h2>
      {listError ? (
        <p className="text-sm text-[var(--brd-ink-soft)]">Nie udało się odczytać zgłoszeń.</p>
      ) : requests === null ? null : requests.length === 0 ? (
        <p className="text-sm text-[var(--brd-ink-soft)]">Brak zgłoszeń.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((row) => (
            <li key={row.id} className="border border-[var(--brd-line)] p-4">
              <p className="text-xs text-[var(--brd-mute)]">
                {row.created_at ? new Date(row.created_at).toLocaleString("pl-PL") : "—"}
                {" · "}
                {row.status === "answered" ? "Odpowiedziane" : "Otwarte"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--brd-ink)]">{row.body}</p>
              {row.status === "answered" && typeof row.answer === "string" && row.answer.length > 0 ? (
                <p className="mt-3 whitespace-pre-wrap border-t border-[var(--brd-line)] pt-3 text-sm text-[var(--brd-ink)]">
                  {row.answer}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
    </div>
  );
}
