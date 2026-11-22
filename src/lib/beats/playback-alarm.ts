import "server-only";

import { Resend } from "resend";

import { notifyEnv } from "@/lib/email/notify/config";
import { reportRecipients } from "@/lib/reports/owner-weekly-report-run";
import { getSiteUrl } from "@/lib/site-url";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Scraping alarm (Owner 2026-11-22): one mail to the owner when an account pulls the full file of many different
 * beats in a day, or hits the hourly limit. At most one mail per kind, account and day (owner_alerts).
 * Never throws and never blocks playback.
 */
export const SCRAPE_DISTINCT_BEATS_PER_DAY = 20;

export type PlaybackAlarmKind = "beat_scraping" | "playback_limit";

/** Pure: how many different beats in these log rows (last 24 h already filtered by the caller). */
export function distinctBeats(rows: readonly { beat_id: string }[]): number {
  return new Set(rows.map((r) => r.beat_id)).size;
}

export function alarmMail(input: {
  kind: PlaybackAlarmKind;
  userNumber: number | null;
  name: string | null;
  beats: number;
  adminUrl: string;
}): { subject: string; text: string } {
  const who = `${input.name ?? "bez nazwy"}${input.userNumber ? ` (nr ${input.userNumber})` : ""}`;
  const what =
    input.kind === "beat_scraping"
      ? `otworzyło w Studiu lub programie ${input.beats} różnych bitów w ciągu 24 godzin`
      : `trafiło na godzinny limit odtworzeń pełnych bitów (${input.beats} różnych bitów w ostatniej godzinie)`;
  return {
    subject: `BitRymDym: podejrzane konto ${who}`,
    text: [
      `Konto ${who} ${what}.`,
      "Tak zachowuje się ktoś, kto zbiera bity, a nie nagrywa. Każda kopia ma ukryty znak tego konta.",
      `Konto w panelu: ${input.adminUrl}`,
      "Jeśli bit wypłynie, poproś mnie o sprawdzenie pliku (npm run leak:identify).",
    ].join("\n\n"),
  };
}

export async function raisePlaybackAlarm(userId: string, kind: PlaybackAlarmKind, beats: number): Promise<void> {
  try {
    const env = notifyEnv(process.env);
    if (!env.enabled) return;
    const admin = createSupabaseAdminClient();
    const day = new Date().toISOString().slice(0, 10);
    const { data: claimed, error } = await admin
      .from("owner_alerts")
      .upsert({ kind, subject: userId, day }, { onConflict: "kind,subject,day", ignoreDuplicates: true })
      .select("day");
    if (error || !claimed?.length) return;
    const to = await reportRecipients(admin);
    if (!to.length) return;
    const { data: p } = await admin.from("profiles").select("user_number, display_name").eq("id", userId).maybeSingle();
    const mail = alarmMail({
      kind,
      userNumber: (p?.user_number as number | null) ?? null,
      name: (p?.display_name as string | null) ?? null,
      beats,
      adminUrl: `${getSiteUrl()}/admin/users/${userId}`,
    });
    const { error: sendErr } = await new Resend(env.apiKey).emails.send({
      from: env.from, to, subject: mail.subject, text: mail.text,
      tags: [{ name: "kind", value: `owner_${kind}` }],
    });
    if (sendErr) {
      await admin.from("owner_alerts").delete().eq("kind", kind).eq("subject", userId).eq("day", day);
      console.error("[playback-alarm] send failed", { kind });
    }
  } catch {
    /* an alarm must never break playback */
  }
}

/** After a logged full playback: alarm when the account crossed the daily distinct-beat threshold. */
export async function checkScrapingAfterPlayback(userId: string): Promise<void> {
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { data, error } = await createSupabaseAdminClient()
      .from("beat_audio_playback_log")
      .select("beat_id")
      .eq("user_id", userId)
      .gte("created_at", since)
      .limit(1000);
    if (error) return;
    const n = distinctBeats((data as { beat_id: string }[] | null) ?? []);
    if (n >= SCRAPE_DISTINCT_BEATS_PER_DAY) await raisePlaybackAlarm(userId, "beat_scraping", n);
  } catch {
    /* never break playback */
  }
}
