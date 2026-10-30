/** Polityka cookies. Only strictly necessary storage → no consent banner needed (strictly-necessary exemption, Prawo komunikacji elektronicznej). */
import { PRIVACY_VERSION } from "@/lib/legal/legal-config";

import type { LegalDoc } from "./types";

export const COOKIES: LegalDoc = {
  title: "Polityka cookies BitRymDym",
  version: PRIVACY_VERSION,
  lead: "Używamy wyłącznie plików cookie i pamięci przeglądarki niezbędnych do działania Serwisu. Nie używamy cookies analitycznych, reklamowych ani śledzących, dlatego nie wyświetlamy banera zgody.",
  sections: [
    { id: "c1", h: "1. Pliki cookie", blocks: [{ table: { head: ["Nazwa", "Cel", "Ważność"], rows: [
      ["sb-…-auth-token", "sesja logowania (Supabase)", "do wylogowania / wygaśnięcia sesji"],
      ["brd_password_recovery", "zabezpieczenie resetu hasła", "kilka minut"],
      ["brd_email_change", "komunikat po zmianie e-maila", "kilka minut"],
      ["brd_dl_aid", "limit pobrań bez konta (losowy identyfikator, bez danych osobowych)", "do 400 dni"],
      ["brd_tk_aid", "dawne nagrania bez konta (losowy identyfikator)", "do 2 godzin"],
      ["NEXT_LOCALE", "wybrany język", "do zmiany"],
    ] } }] },
    { id: "c2", h: "2. Pamięć przeglądarki (localStorage)", blocks: [{ list: [
      "Motyw jasny / ciemny.",
      "Szkic tekstu w Studiu i zapasowa historia czatu BITEK — tylko na Twoim urządzeniu.",
    ] }] },
    { id: "c3", h: "3. Zarządzanie", blocks: [
      "Możesz usunąć lub zablokować pliki cookie w ustawieniach przeglądarki; bez cookie sesji logowanie nie zadziała. Jeśli kiedyś dodamy narzędzia analityczne lub marketingowe, najpierw poprosimy o zgodę.",
    ] },
  ],
};
