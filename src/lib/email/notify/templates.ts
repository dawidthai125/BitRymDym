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
  workTitle?: string | null;
  workId?: string | null;
  /** Feedback / bug report conversation. */
  threadId?: string | null;
  threadSubject?: string | null;
  /** Server-composed purchase receipt line (already plain text). */
  detail?: string | null;
};

export type BuiltMail = { subject: string; text: string; html: string };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const clean = (s: string | null | undefined, max = 120) => (s ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

type Link = { label: string; path: string };
type Body = { subject: string; heading: string; lines: string[]; cta?: Link; links?: Link[] };

function body(kind: NotifyKind, d: TemplateData): Body {
  const hi = clean(d.name, 40) ? `Cześć ${clean(d.name, 40)},` : "Cześć,";
  const beat = clean(d.beatTitle) || "Twój bit";
  const project = clean(d.projectTitle) || "Twój projekt";
  const studio = d.projectId ? `/studio/p/${encodeURIComponent(d.projectId)}` : "/studio";
  switch (kind) {
    case "welcome":
      return { subject: "Witaj w BitRymDym", heading: "Konto gotowe", lines: [hi, "dzięki za założenie konta w BitRymDym. Możesz już słuchać bitów, nagrywać w Studiu i wgrywać własne podkłady."], cta: { label: "Otwórz Studio", path: "/studio" } };
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
    case "take_expiring":
      return {
        subject: `Nagranie wygasa: ${project}`,
        heading: "Nagranie wkrótce wygaśnie",
        lines: [
          hi,
          `nagranie w projekcie „${project}” wygaśnie ${clean(d.detail, 160) || "w ciągu doby"}.`,
          "Zrób eksport WAV albo master przed tym terminem. Potem trzeba będzie nagrać tę partię ponownie.",
        ],
        cta: { label: "Otwórz projekt", path: studio },
      };
    case "plan_expiring":
      return {
        subject: "Twój plan kończy się za 3 dni",
        heading: "Plan wkrótce się skończy",
        lines: [hi, `Twój plan kończy się ${clean(d.detail, 160) || "za 3 dni"}.`, "Przedłuż go, żeby dalej korzystać z limitów planu."],
        cta: { label: "Przedłuż plan", path: "/premium" },
      };
    case "no_recording_yet":
      return {
        subject: "Bit czeka, mikrofon też",
        heading: "Pierwsza zwrotka czeka",
        lines: [
          hi,
          "konto masz od kilku dni, a w Studiu wciąż cisza. Czas to zmienić.",
          "Wejdź do Studia. Na górze czekają „Pierwsze kroki”: wybierasz bit, nagrywasz zwrotkę, potem mix i master. Wystarczy przeglądarka, mikrofon i słuchawki.",
          "Nie masz jeszcze bitu? W katalogu są darmowe podkłady. Wybierz coś pod swój flow.",
        ],
        cta: { label: "Otwórz Studio", path: "/studio" },
        links: [
          { label: "Katalog bitów", path: "/beats" },
          { label: "Jak nagrać utwór", path: "/jak-nagrac" },
        ],
      };
    case "referral_reward":
      return {
        subject: "Ziomek wbił z Twojego linku: +10 nagrań",
        heading: "Polecenie zaliczone",
        lines: [
          hi,
          "osoba, którą zaprosiłeś, założyła konto z Twojego linku i nagrała pierwszą zwrotkę.",
          "Na Twoje konto wpadł pakiet 10 nagrań. Twój znajomy dostał taki sam. Nagrania z pakietu wchodzą, gdy skończy się dzienny limit planu.",
          "Zapraszaj dalej: link znajdziesz na koncie, w sekcji „Zaproś znajomego”.",
        ],
        cta: { label: "Otwórz Studio", path: "/studio" },
        links: [{ label: "Zaproś kolejną osobę", path: "/account#zapros" }],
      };
    case "support_reply": {
      const topic = clean(d.threadSubject) || "Twoje zgłoszenie";
      return {
        subject: `Odpowiedź od BitRymDym: ${topic}`,
        heading: "Masz odpowiedź",
        lines: [hi, `odpisaliśmy w rozmowie „${topic}”:`, ...(clean(d.detail, 500) ? [`„${clean(d.detail, 500)}”`] : []), "Odpisać możesz w serwisie. Odpowiedź na ten e-mail nie trafi do rozmowy."],
        cta: { label: "Otwórz rozmowę", path: d.threadId ? `/account/support/${encodeURIComponent(d.threadId)}` : "/account/support" },
      };
    }
    case "work_featured": {
      const work = clean(d.workTitle) || "Twój utwór";
      return {
        subject: `„${work}” to Utwór tygodnia na BitRymDym`,
        heading: "Masz Utwór tygodnia",
        lines: [
          hi,
          `ekipa BitRymDym wybrała „${work}” na Utwór tygodnia. Do końca tygodnia numer wisi na stronie głównej i każdy może odpalić 45-sekundowy fragment.`,
          "Podeślij link ziomkom i niech lecą odsłuchy.",
        ],
        cta: { label: "Zobacz utwór", path: d.workId ? `/utwor/${encodeURIComponent(d.workId)}` : "/utwory" },
        links: [{ label: "Strona główna", path: "/" }],
      };
    }
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
  const extra = (b.links ?? []).map((l) => ({ label: l.label, url: `${base}${l.path}` }));
  const footer = kind === "welcome"
    ? "Dostajesz tę wiadomość, bo założono konto w BitRymDym."
    : kind === "purchase_confirmed"
      ? "Dostajesz tę wiadomość, bo opłacono zamówienie w BitRymDym."
      : kind === "support_reply"
        ? "Dostajesz tę wiadomość, bo napisałeś do nas w BitRymDym."
      : kind === "referral_reward"
        ? "Dostajesz tę wiadomość, bo ktoś założył konto w BitRymDym z Twojego linku polecającego."
      : "Dostajesz tę wiadomość, bo masz włączone powiadomienia w BitRymDym.";
  const text = [b.heading, "", ...b.lines, ...(cta ? ["", `${b.cta!.label}: ${cta}`] : []), ...extra.map((l) => `${l.label}: ${l.url}`), "", "—", footer, `Ustawienia powiadomień: ${links.preferences}`, `Wypisz się: ${links.unsubscribe}`].join("\n");
  const p = (s: string) => `<p style="margin:0 0 12px">${escapeHtml(s)}</p>`;
  const html = `<!doctype html><html lang="pl"><body style="margin:0;background:#f3ebdd;font-family:Arial,Helvetica,sans-serif;color:#16130f">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="margin:0 0 16px;font-weight:700;letter-spacing:2px">BITRYMDYM</p>
<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(b.heading)}</h1>
${b.lines.map(p).join("\n")}
${cta ? `<p style="margin:20px 0"><a href="${escapeHtml(cta)}" style="display:inline-block;background:#16130f;color:#f3ebdd;padding:12px 18px;text-decoration:none;border-radius:2px">${escapeHtml(b.cta!.label)}</a></p>` : ""}
${extra.length ? `<p style="margin:0 0 12px">${extra.map((l) => `<a href="${escapeHtml(l.url)}" style="color:#16130f">${escapeHtml(l.label)}</a>`).join(" · ")}</p>` : ""}
<hr style="border:0;border-top:1px solid #cbbfa9;margin:24px 0">
<p style="margin:0;font-size:12px;color:#6b6152">${escapeHtml(footer)} <a href="${escapeHtml(links.preferences)}" style="color:#6b6152">Ustawienia powiadomień</a> · <a href="${escapeHtml(links.unsubscribe)}" style="color:#6b6152">Wypisz się</a></p>
</div></body></html>`;
  return { subject: clean(b.subject, 150), text, html };
}
