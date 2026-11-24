"use client";

import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { savePublicProfileAction } from "@/app/account/profil/actions";
import { AUTH_FIELD_CLASS } from "@/components/auth/auth-field-class";
import { SocialIcon } from "@/components/site/social-icon";
import Link from "@/components/ui/app-link";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  CREATOR_LINK_MAX,
  CREATOR_SERVICE_LABEL,
  CREATOR_SERVICES,
  type CreatorLinkError,
  type CreatorLinks,
  type CreatorService,
} from "@/lib/creators/creator-links";
import { SHARE_KEYS, type ShareFlags } from "@/lib/creators/profile-policy";
import { cn } from "@/lib/utils";

const PLACEHOLDER: Readonly<Record<CreatorService, string>> = {
  youtube: "youtube.com/@ksywka",
  spotify: "open.spotify.com/artist/…",
  instagram: "instagram.com/ksywka",
  facebook: "facebook.com/ksywka",
  tiktok: "tiktok.com/@ksywka",
  soundcloud: "soundcloud.com/ksywka",
};

type Initial = { enabled: boolean; blocked: boolean; links: CreatorLinks; share: ShareFlags };

export function PublicProfileForm({
  hasName,
  initial,
  path: initialPath,
  siteUrl,
}: {
  hasName: boolean;
  initial: Initial;
  path: string | null;
  siteUrl: string;
}) {
  const t = useTranslations("account.publicProfile");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [blocked, setBlocked] = useState(initial.blocked);
  const [links, setLinks] = useState<CreatorLinks>(initial.links);
  const [share, setShare] = useState(initial.share);
  const [path, setPath] = useState(initialPath);
  const [errors, setErrors] = useState<Partial<Record<CreatorService, CreatorLinkError>>>({});
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const address = path ? `${siteUrl.replace(/\/$/, "")}${path}` : null;

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    setErrors({});
    const result = await savePublicProfileAction({ enabled, links, share }).catch(() => null);
    setBusy(false);
    if (result?.ok) {
      setLinks(result.links);
      setPath(result.path);
      setEnabled(result.enabled);
      setBlocked(result.blocked);
      setNote({ ok: true, text: t(result.enabled ? "savedOn" : "savedOff") });
      return;
    }
    if (result?.code === "LINKS") {
      setErrors(result.errors);
      const first = CREATOR_SERVICES.find((service) => result.errors[service]);
      const field = first ? document.getElementById(`creator-link-${first}`) : null;
      // Centred: the sticky header would cover a field focused at the top edge.
      field?.scrollIntoView({ block: "center" });
      field?.focus({ preventScroll: true });
      setNote({ ok: false, text: t("fixLinks") });
      return;
    }
    const text =
      result?.code === "NO_NAME"
        ? t("noName")
        : result?.code === "SIGNED_OUT"
          ? t("signedOut")
          : result?.code === "LIMIT"
            ? t("limit")
            : t("failed");
    setNote({ ok: false, text });
  }

  async function copy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-8" data-testid="public-profile-form" noValidate>
      {blocked ? (
        <p role="status" className="border border-[var(--brd-line)] p-4 text-sm">{t("blocked")}</p>
      ) : null}

      <section aria-labelledby="creator-main" className="space-y-3 border border-[var(--brd-line)] p-5">
        <h2 id="creator-main" className="text-lg font-semibold">{t("mainTitle")}</h2>
        <Switch
          label={t("enabled")}
          note={t("enabledNote")}
          checked={enabled}
          disabled={busy || (!hasName && !enabled)}
          onChange={setEnabled}
          testId="creator-enabled"
        />
        {address && path ? (
          <div className="space-y-2 pt-2">
            <p className="text-xs text-[var(--brd-mute)]">{t("addressTitle")}</p>
            <p className="break-all text-sm" data-testid="creator-address">{address}</p>
            <div className="flex flex-wrap gap-2">
              <Link href={path} className={cn(buttonVariants({ variant: "outline" }), "min-h-11 px-4")}>{t("view")}</Link>
              <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => void copy()} aria-live="polite">
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--brd-mute)]">{t("firstSave")}</p>
        )}
      </section>

      <section aria-labelledby="creator-links" className="space-y-4 border border-[var(--brd-line)] p-5">
        <h2 id="creator-links" className="text-lg font-semibold">{t("linksTitle")}</h2>
        <p className="text-sm text-[var(--brd-ink-soft)]">{t("linksLead")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {CREATOR_SERVICES.map((service) => {
            const error = errors[service];
            return (
              <div key={service} className="flex min-w-0 flex-col gap-1">
                <label htmlFor={`creator-link-${service}`} className="flex items-center gap-2 text-sm font-medium">
                  <SocialIcon name={CREATOR_SERVICE_LABEL[service]} className="size-4 shrink-0" />
                  {CREATOR_SERVICE_LABEL[service]}
                </label>
                <input
                  id={`creator-link-${service}`}
                  type="text"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={CREATOR_LINK_MAX}
                  placeholder={PLACEHOLDER[service]}
                  value={links[service] ?? ""}
                  // Not disabled while saving: a wrong field gets the focus right after.
                  readOnly={busy}
                  onChange={(event) => {
                    setLinks((current) => ({ ...current, [service]: event.target.value }));
                    setErrors((current) => ({ ...current, [service]: undefined }));
                  }}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `creator-link-${service}-error` : undefined}
                  className={cn(AUTH_FIELD_CLASS, error && "border-destructive")}
                />
                {error ? (
                  <p id={`creator-link-${service}-error`} role="alert" className="text-sm text-destructive">
                    {t(`error.${error}`, { service: CREATOR_SERVICE_LABEL[service] })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="creator-share" className="space-y-3 border border-[var(--brd-line)] p-5">
        <h2 id="creator-share" className="text-lg font-semibold">{t("shareTitle")}</h2>
        <p className="text-sm text-[var(--brd-ink-soft)]">{t("shareLead")}</p>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {SHARE_KEYS.map((key) => (
            <Switch
              key={key}
              label={t(`share.${key}`)}
              note={t(`share.${key}Note`)}
              checked={share[key]}
              disabled={busy}
              onChange={(next) => setShare((current) => ({ ...current, [key]: next }))}
              testId={`creator-share-${key}`}
            />
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy} className="min-h-11 px-5">{busy ? t("saving") : t("save")}</Button>
        {note ? (
          <p role={note.ok ? "status" : "alert"} className={cn("text-sm", note.ok ? "text-[var(--brd-green)]" : "text-destructive")}>
            {note.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function Switch(p: {
  label: string;
  note: string;
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex min-h-11 items-start gap-3 py-2 text-sm">
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-[var(--brd-ink)]"
        checked={p.checked}
        disabled={p.disabled}
        onChange={(event) => p.onChange(event.target.checked)}
        data-testid={p.testId}
      />
      <span className="min-w-0">
        <span className="block font-medium text-[var(--brd-ink)]">{p.label}</span>
        <span className="block text-xs text-[var(--brd-mute)]">{p.note}</span>
      </span>
    </label>
  );
}
