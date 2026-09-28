import Link from "next/link";
import { redirect } from "next/navigation";

import { UserBeatActions } from "@/components/beats/user-beat-actions";
import { BeatGrantsPanel } from "@/components/grants/beat-grants-panel";
import { SiteHeader } from "@/components/site/site-header";
import { AuthError, requireRole, requireUser } from "@/lib/auth/session";
import { listOwnUserBeats } from "@/lib/beats/service";
import { beatStatusLabelPl } from "@/lib/beats/status-labels";
import { listOwnerBeatAccessGrantsFor } from "@/lib/grants/beat-access-grants";

export const metadata = {
  title: "Moje bity · BitRymDym",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default async function AccountBeatsPage() {
  let context;
  try {
    context = await requireUser();
    await requireRole(["USER"]);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  const beats = await listOwnUserBeats();
  const grantsByBeatId = new Map<
    string,
    Awaited<ReturnType<typeof listOwnerBeatAccessGrantsFor>>
  >();
  for (const beat of beats) {
    if (beat.status !== "PUBLISHED") continue;
    grantsByBeatId.set(
      beat.id,
      await listOwnerBeatAccessGrantsFor(context, beat.id),
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">Moje bity</h1>
            <p className="text-sm text-muted-foreground">
              Szkice, moderacja i decyzje — bez publicznej publikacji z tego
              panelu.
            </p>
          </div>
          <Link
            href="/beats/upload"
            className="text-sm font-medium underline underline-offset-4"
          >
            Dodaj bit
          </Link>
        </header>

        {beats.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nie masz jeszcze bitów.{" "}
            <Link href="/beats/upload" className="underline underline-offset-4">
              Dodaj pierwszy
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {beats.map((beat) => (
              <li
                key={beat.id}
                className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-medium tracking-tight">{beat.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {beatStatusLabelPl(beat.status)}
                    {beat.producer ? ` · ${beat.producer}` : ""}
                    {" · "}
                    {formatDuration(beat.durationSeconds)}
                    {" · "}
                    {beat.bpm} BPM
                    {beat.activeMasterReady ? " · MASTER READY" : ""}
                  </p>
                  {beat.status === "REJECTED" && beat.rejectionReason ? (
                    <p className="text-sm">
                      <span className="text-muted-foreground">
                        Powód odrzucenia:{" "}
                      </span>
                      {beat.rejectionReason}
                    </p>
                  ) : null}
                  {beat.status === "APPROVED" ? (
                    <p className="text-xs text-muted-foreground">
                      Zaakceptowany — oczekuje na publikację przez staff.
                    </p>
                  ) : null}
                  {beat.status === "PUBLISHED" ? (
                    <p className="text-xs text-muted-foreground">
                      Widoczny w publicznym katalogu.
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full flex-col gap-3 sm:max-w-sm">
                  <UserBeatActions
                    beatId={beat.id}
                    status={beat.status}
                    activeMasterReady={beat.activeMasterReady}
                  />
                  {beat.status === "PUBLISHED" ? (
                    <BeatGrantsPanel
                      beatId={beat.id}
                      initialGrants={grantsByBeatId.get(beat.id) ?? []}
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/account"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Konto
        </Link>
      </main>
    </div>
  );
}
