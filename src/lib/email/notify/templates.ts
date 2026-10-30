/** Polish e-mail templates (pure). Plain, accessible HTML + a text part; every mail has an unsubscribe footer. */
import type { NotifyKind } from "./config";

export type TemplateData = {
  siteUrl: string;
  name?: string | null;
  beatTitle?: string | null;
  beatId?: string | null;
  reason?: string | null;
  projectTitle?: string | null;
  projectId?: string | null;
  /** Server-composed purchase receipt line (already plain text). */
  detail?: string | null;
};

export type BuiltMail = { subject: string; text: string; html: string };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const clean = (s: string | null | undefined, max = 120) => (s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

type Body = { subject: string; heading: string; lines: string[]; cta?: { label: string; path: string } };

function body(kind: NotifyKind, d: TemplateData): Body {
  const hi = clean(d.name, 40) ? `Cześć ${clean(d.name, 40)},` : "Cześć,";
  const beat = clean(d.beatTitle) || "Twój bit";
  const project = clean(d.projectTitle) || "Twój projekt";
  const studio = d.projectId ? `/studio/p/${encodeURIComponent(d.projectId)}` : "/studio";
  switch (kind) {
    case "welcome":
      return { subject: "Witaj w BitRymDym", heading: "Konto gotowe", lines: [hi, "dzięki za założenie konta w BitRymDym. Możesz już słuchać bitów, nagrywać w studiu i wgrywać własne podkłady."], cta: { label: "Przejdź do studia", path: "/studio" } };
    case "beat_approved":
      return { subject: `Bit „${beat}” został opublikowany`, heading: "Bit zatwierdzony", lines: [hi, `moderacja zatwierdziła bit „${beat}”. Jest już widoczny w katalogu.`], cta: { label: "Zobacz bit", path: d.beatId ? `/beat/${encodeURIComponent(d.beatId)}` : "/account/beats" } };
    case "beat_rejected":
      return { subject: `Bit „${beat}” nie przeszedł moderacji`, heading: "Bit odrzucony", lines: [hi, `moderacja nie zatwierdziła bitu „${beat}”.`, ...(clean(d.reason, 500) ? [`Powód: ${clean(d.reason, 500)}`] : []), "Możesz poprawić bit i wysłać go ponownie."], cta: { label: "Moje bity", path: "/account/beats" } };
    case "master_ready":
      return { subject: `Master gotowy: ${project}`, heading: "Master gotowy", lines: [hi, `master projektu „${project}” jest gotowy do odsłuchu i akceptacji.`], cta: { label: "Otwórz projekt", path: studio } };
    case "mp4_ready":
      return { subject: `Wideo MP4 gotowe: ${project}`, heading: "Wideo MP4 gotowe", lines: [hi, `wideo MP4 projektu „${project}” jest gotowe do pobrania.`], cta: { label: "Pobierz wideo", path: studio } };
    case "purchase_confirmed":
      return { subject: "Wpłata doszła", heading: "Wpłata doszła", lines: [hi, clean(d.detail, 400) || "Tu BITEK. Włączyłem opłacony plan na Twoim koncie."], cta: { label: "Zobacz plan", path: "/premium" } };
    default: {
      const neverKind: never = kind;
      return neverKind;
    }
  }
}

export function buildMail(kind: NotifyKind, d: TemplateData, links: { unsubscribe: string; preferences: string }): BuiltMail {
  const b = body(kind, d);
  const base = d.siteUrl.replace(/\/+$/, "");
  const cta = b.cta ? `${base}${b.cta.path}` : null;
  const footer = kind === "welcome"
    ? "Dostajesz tę wiadomość, bo założono konto w BitRymDym."
    : kind === "purchase_confirmed"
      ? "Dostajesz tę wiadomość, bo opłacono zamówienie w BitRymDym."
      : "Dostajesz tę wiadomość, bo masz włączone powiadomienia w BitRymDym.";
  const text = [b.heading, "", ...b.lines, ...(cta ? ["", `${b.cta!.label}: ${cta}`] : []), "", "—", footer, `Ustawienia powiadomień: ${links.preferences}`, `Wypisz się: ${links.unsubscribe}`].join("\n");
  const p = (s: string) => `<p style="margin:0 0 12px">${escapeHtml(s)}</p>`;
  const html = `<!doctype html><html lang="pl"><body style="margin:0;background:#f3ebdd;font-family:Arial,Helvetica,sans-serif;color:#16130f">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="margin:0 0 16px;font-weight:700;letter-spacing:2px">BITRYMDYM</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(b.heading)}</h1>
${b.lines.map(p).join("\n")}
${cta ? `<p style="margin:20px 0"><a href="${escapeHtml(cta)}" style="display:inline-block;background:#16130f;color:#f3ebdd;padding:12px 18px;text-decoration:none;border-radius:2px">${escapeHtml(b.cta!.label)}</a></p>` : ""}
<hr style="border:0;border-top:1px solid #cbbfa9;margin:24px 0">
<p style="margin:0;font-size:12px;color:#6b6152">${escapeHtml(footer)} <a href="${escapeHtml(links.preferences)}" style="color:#6b6152">Ustawienia powiadomień</a> · <a href="${escapeHtml(links.unsubscribe)}" style="color:#6b6152">Wypisz się</a></p>
</div></body></html>`;
  return { subject: clean(b.subject, 150), text, html };
}
