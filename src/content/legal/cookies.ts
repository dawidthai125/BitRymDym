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
    { id: "c2", h: "2. Pamięć przeglądarki", blocks: [
      "To nie są pliki cookie. Zostają na Twoim urządzeniu i nie wysyłamy ich do analityki.",
      { list: [
        "localStorage: motyw jasny albo ciemny; szkic tekstu w Studiu; zapasowa historia czatu BITEK; położenie okna BITEK; wyłącznik automatycznego miksu i mastera.",
        "sessionStorage (znika po zamknięciu karty): czat BITEK w tej karcie; skrót limitów Planu na około minutę; wskazówka głośności nagrania przekazywana do miksu; znacznik trwającego automatycznego miksu albo mastera.",
        "IndexedDB, baza brd-take-recovery: kawałki trwającego nagrania, żeby dało się je dokończyć po zerwaniu połączenia. To nie jest kopia na naszym serwerze. Po wysłaniu nagrania albo po wyczyszczeniu danych strony ta baza znika.",
      ] },
    ] },
    { id: "c3", h: "3. Zarządzanie", blocks: [
      "Możesz usunąć lub zablokować pliki cookie, localStorage, sessionStorage i IndexedDB w ustawieniach przeglądarki. Bez cookie sesji logowanie nie zadziała. Wyłączenie IndexedDB może przerwać dokańczanie nagrania po zerwaniu. Jeśli kiedyś dodamy narzędzia analityczne lub marketingowe, najpierw poprosimy o zgodę.",
    ] },
  ],
};
