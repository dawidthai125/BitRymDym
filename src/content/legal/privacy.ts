/** Polityka prywatności (RODO) — WZÓR do weryfikacji przez prawnika (nie jest poradą prawną). */
import { LEGAL_EFFECTIVE_DATE, LEGAL_PATHS, MINIMUM_AGE, OPERATOR as O, PRIVACY_VERSION } from "@/lib/legal/legal-config";

import type { LegalDoc } from "./types";

export const PRIVACY: LegalDoc = {
  title: "Polityka prywatności BitRymDym",
  version: PRIVACY_VERSION,
  lead: `Wyjaśniamy, jakie dane przetwarzamy, po co, jak długo i komu je powierzamy. Obowiązuje od ${LEGAL_EFFECTIVE_DATE}.`,
  sections: [
    { id: "p1", h: "1. Administrator", blocks: [
      `Administratorem danych jest ${O.name}, ${O.address}, NIP ${O.nip} („my”). Kontakt w sprawach danych: ${O.privacyEmail}. Nie wyznaczyliśmy inspektora ochrony danych.`,
    ] },
    { id: "p2", h: "2. Jakie dane przetwarzamy", blocks: [{ list: [
      "Konto: adres e-mail, zaszyfrowane hasło (przechowuje je dostawca uwierzytelniania), ksywka, numer użytkownika, Plan, data rejestracji, wersja zaakceptowanego Regulaminu i Polityki.",
      "Treści: wgrane Bity, okładki, Nagrania (Twój głos lub instrument), projekty Studia, teksty, utwory referencyjne do masteringu, wygenerowane miksy, mastery i wideo.",
      "Aktywność: odsłuchy, pobrania, polubienia, linki do odsłuchu i liczba ich odtworzeń, historia moderacji i odwołań.",
      "Dane techniczne: adres IP, typ przeglądarki, logi serwera i błędów, identyfikatory sesji w plikach cookie.",
      "Wiadomości: treść pytań do asystenta BITEK, opisy okładek AI, korespondencja z nami.",
      "Po uruchomieniu płatności: dane do rozliczeń (imię i nazwisko lub firma, adres, NIP, historia transakcji). Danych kart płatniczych nie przechowujemy — obsługuje je zewnętrzny operator płatności wskazany przy zamówieniu — PayPro S.A. (Przelewy24) albo Krajowy Integrator Płatności S.A. (Tpay), który przetwarza dane płatnicze jako odrębny administrator.",
    ] }, `Serwis jest przeznaczony dla osób, które ukończyły ${MINIMUM_AGE} lat — młodsze osoby nie mogą zakładać Konta. Jeśli dowiemy się, że Konto założyła osoba poniżej tego wieku, usuniemy je wraz z danymi.`] },
    { id: "p3", h: "3. Cele i podstawy prawne", blocks: [{ table: { head: ["Cel", "Podstawa (RODO)"], rows: [
      ["Prowadzenie Konta, Studio, przechowywanie i przetwarzanie Twoich plików, linki do odsłuchu, eksport", "art. 6 ust. 1 lit. b — umowa"],
      ["Moderacja Bitów i okładek (automatyczna i ręczna), przeciwdziałanie nadużyciom, bezpieczeństwo, limity", "art. 6 ust. 1 lit. f — prawnie uzasadniony interes; art. 6 ust. 1 lit. c — obowiązki z aktu o usługach cyfrowych"],
      ["Wiadomości e-mail o koncie i usłudze (potwierdzenie, reset hasła, wynik moderacji, gotowy master / MP4)", "art. 6 ust. 1 lit. b i f; powiadomienia możesz wyłączyć w ustawieniach"],
      ["Funkcje AI na Twoje żądanie (BITEK, okładki AI)", "art. 6 ust. 1 lit. b — umowa"],
      ["Rozliczenia i księgowość (po uruchomieniu płatności)", "art. 6 ust. 1 lit. c — przepisy podatkowe i rachunkowe"],
      ["Reklamacje, dochodzenie i obrona roszczeń", "art. 6 ust. 1 lit. f"],
    ] } }, "Nie wysyłamy marketingu i nie używamy narzędzi analitycznych ani reklamowych. Jeśli to się zmieni, poprosimy o zgodę."] },
    { id: "p4", h: "4. Automatyczna moderacja", blocks: [
      "Okładki i wybrane grafiki oceniamy automatycznie modelem AI (np. nagość, przemoc, treści nienawistne), a pliki audio — automatycznymi testami technicznymi. Wysoki wynik może spowodować automatyczne odrzucenie publikacji. Masz prawo do interwencji człowieka: odwołanie z poziomu „Moje bity” rozpatruje moderator. Możesz też przedstawić swoje stanowisko i zakwestionować decyzję.",
    ] },
    { id: "p5", h: "5. Odbiorcy danych (podmioty przetwarzające)", blocks: [
      "Powierzamy dane wyłącznie w zakresie potrzebnym do danej funkcji, na podstawie umów powierzenia (DPA):",
      { table: { head: ["Dostawca", "Do czego", "Gdzie"], rows: [
        ["Supabase", "baza danych, logowanie, przechowywanie plików", "UE (Irlandia)"],
        ["Vercel", "hosting strony i API, logi", "USA / globalnie"],
        ["Serwer obliczeniowy E3", "miks, mastering, transkodowanie, wideo MP4, kontrola plików", "UE (Contabo GmbH; centrum danych w Lauterbourg, Francja)"],
        ["Google (Gemini API)", "asystent BITEK, moderacja obrazów", "USA"],
        ["Groq", "asystent BITEK, kontrola i doprecyzowanie opisów okładek AI", "USA"],
        ["Cloudflare (Workers AI)", "generowanie okładek AI — tylko opis tekstowy", "USA / globalnie"],
        ["Pollinations (Myceli.AI OÜ)", "zapasowe generowanie okładek AI — tylko opis tekstowy", "UE (Estonia); przetwarzanie także poza EOG, m.in. w USA"],
        ["Resend", "wysyłka e-maili (gdy włączone)", "USA"],
        ["PayPro S.A. (Przelewy24) albo Krajowy Integrator Płatności S.A. (Tpay)", "płatności (po uruchomieniu) — jako odrębny administrator danych płatniczych", "UE (Polska)"],
      ] } },
      "Do dostawców AI nie wysyłamy Twojego e-maila ani hasła. Opisy okładek przed wysłaniem są filtrowane; nie wpisuj w nich danych osobowych. Przekazanie danych poza EOG odbywa się na podstawie decyzji Komisji Europejskiej (EU-US Data Privacy Framework) lub standardowych klauzul umownych (art. 46 RODO). Kopię zabezpieczeń możesz uzyskać, pisząc do nas.",
      "Opublikowane Bity, ksywka i okładki są widoczne publicznie. Link do odsłuchu działa dla każdego, kto go otrzyma — do wygaśnięcia lub wyłączenia.",
    ] },
    { id: "p6", h: "6. Jak długo przechowujemy dane", blocks: [{ list: [
      "Konto i opublikowane treści — do usunięcia Konta; po usunięciu kasujemy je bez zbędnej zwłoki (kopie zapasowe wygasają w cyklu dostawcy).",
      "Pliki robocze Studia (miksy, mastery, eksporty, wideo) — zależnie od Planu: Free 2 dni, Bronze 7 dni, Silver 30 dni, Gold 45 dni; potem są usuwane automatycznie.",
      "Utwór referencyjny do masteringu — usuwany zaraz po zakończeniu zadania.",
      "Linki do odsłuchu — do wygaśnięcia (maksymalnie zgodnie z Planem) lub wyłączenia.",
      "Historia moderacji i zgłoszeń — przez czas istnienia treści i do 3 lat po jej usunięciu (ustalenie, dochodzenie lub obrona roszczeń — m.in. art. 442¹ Kodeksu cywilnego; obowiązki z aktu o usługach cyfrowych), a gdy toczy się konkretne postępowanie lub spór — do jego zakończenia.",
      "Logi techniczne (serwera, błędów i bezpieczeństwa, w tym adresy IP) — nie dłużej niż 12 miesięcy, potem są usuwane lub anonimizowane. Dłużej tylko wtedy, gdy są potrzebne do wyjaśnienia konkretnego incydentu bezpieczeństwa lub roszczenia — do jego zakończenia.",
      "Dane rozliczeniowe — 5 lat od końca roku podatkowego (po uruchomieniu płatności).",
    ] }] },
    { id: "p7", h: "7. Twoje prawa", blocks: [
      "Masz prawo do: dostępu do danych i ich kopii, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych, sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie, a także do niepodlegania decyzji opartej wyłącznie na zautomatyzowanym przetwarzaniu (pkt 4). Konto i dane usuniesz samodzielnie w ustawieniach.",
      `Wnioski kieruj na ${O.privacyEmail}; odpowiemy w ciągu miesiąca. Masz prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych (ul. Stawki 2, 00-193 Warszawa).`,
      "Podanie danych jest dobrowolne, ale bez adresu e-mail i hasła nie założysz Konta.",
    ] },
    { id: "p8", h: "8. Pliki cookie i pamięć przeglądarki", blocks: [
      `Używamy wyłącznie plików niezbędnych do działania Serwisu (logowanie, bezpieczeństwo, język, motyw). Szczegóły: Polityka cookies (${LEGAL_PATHS.cookies}).`,
    ] },
    { id: "p9", h: "9. Zmiany", blocks: ["O istotnych zmianach poinformujemy e-mailem lub w Serwisie. Aktualna wersja jest zawsze pod tym adresem."] },
  ],
};
