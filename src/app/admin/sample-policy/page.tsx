import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminSamplePolicyForm } from "@/components/admin/admin-sample-policy-form";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { RECORDING_GLOBAL_MAX_SECONDS } from "@/config/recording";
import { SAMPLE_POLICY_DEFAULTS } from "@/config/recording";
import { AuthError, requireRole } from "@/lib/auth/session";
import { loadSamplePolicySettings } from "@/lib/takes/sample-policy-settings";

export const metadata = {
  title: "Sample Recording Policy · Admin",
};

export default async function AdminSamplePolicyPage() {
  try {
    await requireRole(["ADMIN"]);
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/admin");
  }

  const settings = await loadSamplePolicySettings();

  return (
    <main className="pb-16">
      <PageFrame width="ops" className="py-8 sm:py-10">
        <header className="mb-8 space-y-2 border-b border-[var(--brd-line)] pb-6">
          <Link
            href="/admin"
            className="text-sm text-[var(--brd-mute)] underline-offset-4 hover:underline"
          >
            ← Pulpit
          </Link>
          <SectionLabel>Panel Administracyjny</SectionLabel>
          <h1 className="brd-display text-3xl font-semibold tracking-tight">
            Sample Recording Policy
          </h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Konfiguracja limitu długości nagrania dla BRONZE / SILVER / GOLD.
            Globalny limit techniczny: {RECORDING_GLOBAL_MAX_SECONDS} s.
          </p>
        </header>

        <section className="mb-10 space-y-3 border border-[var(--brd-line)] p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--brd-mute)]">
            Stałe systemowe (bez zmian Admin)
          </h2>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>
              ANONYMOUS: {SAMPLE_POLICY_DEFAULTS.ANONYMOUS.maxRecordingSeconds}{" "}
              s · TTL{" "}
              {SAMPLE_POLICY_DEFAULTS.ANONYMOUS.ttlSeconds / 3600} h
            </li>
            <li>
              FREE: {SAMPLE_POLICY_DEFAULTS.FREE.maxRecordingSeconds} s · TTL{" "}
              {SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds / 3600} h
            </li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-medium tracking-tight">
            Admin overrides (max duration)
          </h2>
          <AdminSamplePolicyForm initial={settings} />
        </section>
      </PageFrame>
    </main>
  );
}
