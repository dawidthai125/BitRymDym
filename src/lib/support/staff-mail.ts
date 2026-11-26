/** E-mail to the owner about a new message (pure). No address of the user: the panel shows who wrote. */
import type { SupportKind } from "./support-policy";

export function staffMail(posted: { threadId: string; kind: SupportKind; subject: string }, body: string, siteUrl: string) {
  const label = posted.kind === "bug" ? "Błąd" : "Opinia";
  const excerpt = body.length > 1500 ? `${body.slice(0, 1500)}…` : body;
  return {
    subject: `${label}: ${posted.subject.replace(/[\r\n]+/g, " ")}`.slice(0, 150),
    text: [`Nowa wiadomość (${label.toLowerCase()}): ${posted.subject}`, "", excerpt, "", `Odpisz w panelu: ${siteUrl.replace(/\/+$/, "")}/admin/zgloszenia/${posted.threadId}`].join("\n"),
  };
}
