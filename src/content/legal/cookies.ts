/** Polityka cookies. Necessary storage without consent; Google Analytics only after consent (banner, src/components/site/cookie-consent.tsx). */
import { PRIVACY_EFFECTIVE_DATE, PRIVACY_VERSION } from "@/lib/legal/legal-config";

import type { LegalDoc } from "./types";

export const COOKIES: LegalDoc = {
  title: "Polityka cookies BitRymDym",
  version: PRIVACY_VERSION,
  lead: `Pliki cookie niezbędne do działania Serwisu zapisujemy bez pytania. Cookies statystyczne Google Analytics zapisujemy tylko za Twoją zgodą wyrażoną w banerze. Nie używamy cookies reklamowych. Zgodę możesz w każdej chwili zmienić przyciskiem „Ustawienia cookies” w stopce. Obowiązuje od ${PRIVACY_EFFECTIVE_DATE}`,
  sections: [
    { id: "c1", h: "1. Pliki cookie", blocks: [{ table: { head: ["Nazwa", "Cel", "Ważność"], rows: [
      ["sb-…-auth-token", "sesja logowania (Supabase)", "do wylogowania, najdłużej 400 dni; bez „Nie wylogowuj mnie” do zamknięcia przeglądarki"],
      ["brd_session_only", "zapamiętuje, że przy logowaniu pole „Nie wylogowuj mnie” jest odznaczone", "do zamknięcia przeglądarki"],
      ["brd_password_recovery", "zabezpieczenie resetu hasła", "kilka minut"],
      ["brd_email_change", "komunikat po zmianie e-maila", "kilka minut"],
      ["brd_dl_aid", "limit pobrań bez konta (losowy identyfikator, bez danych osobowych)", "do 400 dni"],
      ["brd_tk_aid", "dawne nagrania bez konta (losowy identyfikator)", "do 2 godzin"],
      ["brd_ref", "kod polecający z linku „Zaproś znajomego” (tylko kod, bez danych osobowych), odczytywany przy zakładaniu Konta", "do 30 dni"],
      ["brd_signup_browser", "dokończenie rejestracji w tej samej przeglądarce po kliknięciu linku z e-maila", "do 7 dni"],
      ["brd_app", "tryb aplikacji ze sklepu (android albo ios)", "12 godzin"],
      ["NEXT_LOCALE", "wybrany język", "do zmiany"],
      ["brd_consent", "zapamiętana decyzja w sprawie cookies statystycznych", "12 miesięcy"],
      ["brd_staff", "tylko na urządzeniach obsługi Serwisu: pomija je w statystykach", "12 miesięcy"],
    ] } }] },
    { id: "c1a", h: "1a. Cookies statystyczne (tylko za zgodą)", blocks: [
      "Po kliknięciu „Akceptuję” w banerze włączamy Google Analytics 4 (Google Ireland Ltd.). Służy do zliczania odwiedzin i sprawdzania, które strony są oglądane. Wysyłamy też trzy zdarzenia: założenie Konta, odtworzenie Bitu (jego tytuł i numer) oraz zakup (rodzaj produktu i cena), bez e-maila, numeru Konta i numeru zamówienia. Nie łączymy tych danych z Kontem, nie włączamy funkcji reklamowych ani sygnałów Google. Po kliknięciu „Tylko niezbędne” Google Analytics się nie ładuje. Wycofanie zgody usuwa te pliki.",
      "Niezależnie od tego nasz serwer liczy wejścia bez cookies: dodaje 1 do licznika danego dnia, strony i źródła (np. wyszukiwarka, media społecznościowe). Nic nie zapisujemy na Twoim urządzeniu i nie zapisujemy adresu IP ani żadnego identyfikatora, więc licznika nie da się powiązać z osobą.",
      "Film YouTube na stronie Bitu ładuje się dopiero po kliknięciu odtwarzania, z adresu youtube-nocookie.com. Na logowaniu i rejestracji działa Cloudflare Turnstile (ochrona przed botami); to zabezpieczenie niezbędne.",
      { table: { head: ["Nazwa", "Cel", "Ważność"], rows: [
        ["_ga", "rozróżnianie odwiedzających (losowy identyfikator)", "do 2 lat"],
        ["_ga_<identyfikator>", "utrzymanie sesji statystyk", "do 2 lat"],
      ] } },
    ] },
    { id: "c2", h: "2. Pamięć przeglądarki", blocks: [
      "To nie są pliki cookie. Zostają na Twoim urządzeniu i nie wysyłamy ich do analityki.",
      { list: [
        "localStorage: motyw jasny albo ciemny; szkic tekstu w Studiu; zapasowa historia czatu BITEK i stan jego okienka; położenie okna BITEK; wyłącznik automatycznego mixu i mastera; ukrycie pierwszych kroków; ustawienia strony „Sam mastering”; zamknięcie komunikatu o zmianie Regulaminu; wybrany mikrofon i wyjście dźwięku (identyfikator urządzenia z przeglądarki); ustawienia słuchawek i opóźnienia nagrania dla urządzenia; układ ścieżek w Studiu; tryb klawiszy odtwarzania; pamięć nagrania, które jeszcze nie trafiło na ścieżkę, i miejsca jego wstawienia.",
        "sessionStorage (znika po zamknięciu karty): czat BITEK w tej karcie; skrót limitów Planu na około minutę; wskazówka głośności nagrania przekazywana do mixu; znacznik trwającego automatycznego mixu albo mastera.",
        "IndexedDB, baza brd-take-recovery: kawałki trwającego nagrania, żeby dało się je dokończyć po zerwaniu połączenia. To nie jest kopia na naszym serwerze. Po wysłaniu nagrania albo po wyczyszczeniu danych strony ta baza znika.",
      ] },
    ] },
    { id: "c3", h: "3. Zarządzanie", blocks: [
      "Możesz usunąć lub zablokować pliki cookie, localStorage, sessionStorage i IndexedDB w ustawieniach przeglądarki. Bez cookie sesji logowanie nie zadziała. Wyłączenie IndexedDB może przerwać dokańczanie nagrania po zerwaniu. Zgodę na cookies statystyczne zmienisz przyciskiem „Ustawienia cookies” w stopce Serwisu.",
    ] },
  ],
};
