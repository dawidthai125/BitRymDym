/** Regulamin serwisu BitRymDym. */
import { LEGAL_EFFECTIVE_DATE, LEGAL_PATHS, MINIMUM_AGE, OPERATOR as O, TERMS_VERSION } from "@/lib/legal/legal-config";

import type { LegalDoc } from "./types";

export const TERMS: LegalDoc = {
  title: "Regulamin serwisu BitRymDym",
  version: TERMS_VERSION,
  lead: `Regulamin określa zasady korzystania z serwisu BitRymDym — katalogu bitów i przeglądarkowego studia do nagrywania, miksu i masteringu. Obowiązuje od ${LEGAL_EFFECTIVE_DATE}.`,
  sections: [
    { id: "s1", h: "§ 1. Usługodawca i kontakt", blocks: [
      `Serwis prowadzi ${O.name}, ${O.form}, ${O.address}, NIP ${O.nip}, REGON ${O.regon} („Usługodawca”).`,
      `Kontakt: ${O.email}${O.phone ? `, tel. ${O.phone}` : ""}. Serwis działa pod adresem ${O.domain}.`,
    ] },
    { id: "s2", h: "§ 2. Definicje", blocks: [{ list: [
      "Serwis — strona internetowa BitRymDym wraz z funkcjami Studia.",
      "Użytkownik — osoba korzystająca z Serwisu; Konsument — Użytkownik będący konsumentem w rozumieniu art. 22¹ Kodeksu cywilnego (także przedsiębiorca na prawach konsumenta, art. 38a ustawy o prawach konsumenta).",
      "Konto — indywidualny profil Użytkownika (e-mail, hasło, ksywka).",
      "Bit — podkład muzyczny w katalogu: Bity Usługodawcy lub Bity wgrane przez Użytkowników.",
      "Nagranie — ślad audio (wokal, instrument) nagrany lub wgrany przez Użytkownika w Studiu.",
      "Studio — narzędzia do nagrywania, edycji, miksu, masteringu (także z utworem referencyjnym), eksportu audio, wideo MP4 i linków do odsłuchu.",
      "Plan — pakiet funkcji i limitów: Free, Bronze, Silver, Gold; Dodatek — płatne rozszerzenie Planu.",
      "Treści Użytkownika — Bity, Nagrania, okładki, teksty, tytuły i inne materiały dodane przez Użytkownika.",
    ] }] },
    { id: "s3", h: "§ 3. Rodzaje usług", blocks: [
      "Usługodawca świadczy drogą elektroniczną usługi: przeglądanie i odsłuch katalogu Bitów; prowadzenie Konta; Studio (nagrywanie, edycja, miks, mastering, eksport); publikacja Bitów Użytkowników po moderacji; prywatne linki do odsłuchu; generowanie okładek i wideo (w tym z pomocą narzędzi AI); asystent BITEK; powiadomienia e-mail.",
      "Umowa o prowadzenie Konta zostaje zawarta na czas nieoznaczony z chwilą potwierdzenia adresu e-mail. Korzystanie z katalogu bez Konta jest możliwe w zakresie udostępnionym publicznie.",
      "Zakres funkcji i limity (m.in. czas przechowywania plików w Studiu: Free 2 dni, Bronze 7 dni, Silver 30 dni, Gold 45 dni) opisuje strona Premium. Funkcje oznaczone jako testowe mogą się zmieniać.",
    ] },
    { id: "s4", h: "§ 4. Wymagania techniczne", blocks: [
      "Aktualna przeglądarka (Chrome, Edge, Firefox, Safari) z włączoną obsługą JavaScript i plików cookie niezbędnych do logowania, dostęp do internetu, aktywny adres e-mail; do nagrywania — mikrofon i zgoda przeglądarki na jego użycie.",
      "Korzystanie z Internetu wiąże się z typowymi zagrożeniami (np. złośliwe oprogramowanie, przechwycenie danych). Użytkownik powinien chronić swoje hasło i urządzenie.",
    ] },
    { id: "s5", h: "§ 5. Konto", blocks: [
      `Konto może założyć wyłącznie osoba, która ukończyła ${MINIMUM_AGE} lat. Osoba niepełnoletnia (od ${MINIMUM_AGE} do 18 lat) może zawrzeć umowę o Plan płatny lub Dodatek tylko za zgodą przedstawiciela ustawowego.`,
      "Użytkownik podaje prawdziwy adres e-mail, nie udostępnia Konta osobom trzecim i dba o poufność hasła. Ksywka nie może naruszać praw innych osób ani wprowadzać w błąd.",
      "Użytkownik może w każdej chwili usunąć Konto w ustawieniach (Konto → Usuwanie konta) — jest to wypowiedzenie umowy ze skutkiem natychmiastowym. Treści Użytkownika są wtedy usuwane, z zastrzeżeniem § 9 ust. 4 i Polityki prywatności.",
    ] },
    { id: "s6", h: "§ 6. Treści Użytkownika i moderacja", blocks: [
      "Użytkownik oświadcza, że ma prawa do Treści Użytkownika (w tym do sampli, wokali i okładek) i że ich publikacja nie narusza praw osób trzecich ani prawa.",
      "Zakazane jest dodawanie treści bezprawnych, w szczególności naruszających prawa autorskie lub pokrewne, wizerunek, dobra osobiste, nawołujących do przemocy lub nienawiści, pornograficznych, z udziałem małoletnich w kontekście seksualnym, spamu i złośliwego kodu.",
      "Bity Użytkowników i okładki przechodzą moderację: automatyczną (m.in. analiza obrazu przez model AI, kontrola techniczna pliku) oraz ręczną przez moderatora. Automatyczna ocena może skutkować odrzuceniem; Użytkownik może się od niej odwołać — odwołanie rozpatruje człowiek.",
      "Usługodawca może odmówić publikacji, ukryć lub usunąć treść, a w razie poważnych lub powtarzających się naruszeń zablokować Konto. Decyzję wraz z uzasadnieniem przekazuje Użytkownikowi (np. w Serwisie lub e-mailem), chyba że prawo tego zabrania.",
      "Zgłoszenia treści bezprawnych (także przez osoby bez Konta) można wysyłać na " + O.email + ", podając adres treści, uzasadnienie, dane zgłaszającego i oświadczenie o dobrej wierze. Usługodawca rozpatruje je bez zbędnej zwłoki (zgodnie z aktem o usługach cyfrowych — DSA).",
    ] },
    { id: "s7", h: "§ 7. Licencje", blocks: [
      "Użytkownik zachowuje prawa do Treści Użytkownika. Udziela Usługodawcy niewyłącznej, nieodpłatnej licencji, bez ograniczeń terytorialnych, na czas przechowywania treści w Serwisie, w zakresie niezbędnym do świadczenia usług: przechowywanie, zwielokrotnianie, przetwarzanie techniczne (miks, mastering, transkodowanie, generowanie wideo), wyświetlanie i odtwarzanie w Serwisie — a dla opublikowanych Bitów także publiczne udostępnianie w katalogu.",
      "Bity z katalogu są udostępniane Użytkownikom na podstawie niewyłącznej licencji, bez prawa udzielania dalszych licencji, w zakresie opisanym w ust. 3–6. Prawa do Bitu przysługują jego autorowi — Usługodawcy (Bity Usługodawcy) albo Użytkownikowi, który go wgrał (Bity Użytkowników).",
      "Odsłuch i nagrywanie: każdy opublikowany Bit można odsłuchać w Serwisie (bez Konta — w zakresie próbki). Zalogowany Użytkownik może nagrywać na Bicie i tworzyć na jego podstawie własny utwór (Bit wraz z Nagraniami) w Studiu, o ile autor Bitu udostępnił go do Studia.",
      "Pobieranie: Bity Usługodawcy nie są udostępniane do pobrania. Bit Użytkownika można pobrać tylko wtedy, gdy jego autor włączył pobieranie, w dziennym limicie wynikającym z Planu. Pobrany Bit służy wyłącznie do stworzenia własnego utworu na zasadach z ust. 5; nie wolno go udostępniać ani sprzedawać jako samodzielnego podkładu.",
      `Utwór stworzony na Bicie (Bit wraz z Nagraniami) Użytkownik może publikować, rozpowszechniać i monetyzować — także w serwisach streamingowych i wideo (np. Spotify, Apple Music, YouTube, TikTok), w tym za pośrednictwem dystrybutorów cyfrowych — pod warunkiem oznaczenia autora Bitu w opisie, napisach lub metadanych utworu, np. „prod. [ksywka autora] / BitRymDym”. Odrębnej, uprzedniej zgody autora Bitu (dla Bitów Usługodawcy — Usługodawcy, ${O.email}) wymaga: sprzedaż, udostępnianie lub dalsze rozpowszechnianie samego Bitu (bez Nagrań Użytkownika); zgłoszenie Bitu albo zawierającego go utworu do systemów identyfikacji treści (np. YouTube Content ID, inne systemy fingerprintingu); wykorzystanie utworu w reklamie, filmie, serialu lub grze (synchronizacja); przypisywanie sobie autorstwa Bitu.`,
      "Użytkownik, który publikuje Bit z włączonym nagrywaniem lub pobieraniem, udziela innym Użytkownikom nieodpłatnej, niewyłącznej licencji w zakresie ust. 3–5, w tym na publikację i monetyzację utworów stworzonych na tym Bicie z oznaczeniem autora. Licencja obejmuje utwory stworzone w czasie, gdy Bit był dostępny — usunięcie Bitu lub wyłączenie tych opcji nie odbiera prawa do utworów wcześniej opublikowanych zgodnie z Regulaminem.",
      "Okładki i grafiki wygenerowane przez narzędzia AI w Serwisie Użytkownik może wykorzystywać wraz ze swoimi utworami; Usługodawca nie gwarantuje, że takie grafiki są objęte ochroną prawnoautorską ani że są unikalne.",
    ] },
    { id: "s8", h: "§ 8. Narzędzia AI", blocks: [
      "Część funkcji korzysta z zewnętrznych modeli AI (np. asystent BITEK, moderacja obrazów, generowanie okładek). Do dostawców trafiają tylko dane potrzebne do danej funkcji (np. treść pytania, opis okładki, obraz do oceny) — szczegóły w Polityce prywatności.",
      "Wyniki AI mogą być niedokładne. Użytkownik odpowiada za sposób ich wykorzystania. Zakazane jest używanie narzędzi AI do tworzenia treści opisanych w § 6 ust. 2, a opisy mogą być automatycznie filtrowane.",
    ] },
    { id: "s9", h: "§ 9. Plany, Dodatki i płatności", blocks: [
      "Plan Free jest bezpłatny. Ceny Planów płatnych i Dodatków podane w Serwisie są cenami brutto w złotych. Do czasu uruchomienia płatności ceny mają charakter informacyjny.",
      "Po uruchomieniu płatności: umowa o Plan płatny zostaje zawarta z chwilą opłacenia zamówienia, na wybrany okres (miesiąc lub rok); płatności obsługuje zewnętrzny operator płatności — PayPro S.A. z siedzibą w Poznaniu (Przelewy24) albo Krajowy Integrator Płatności S.A. z siedzibą w Poznaniu (Tpay); operator obsługujący daną płatność jest wskazany przy składaniu zamówienia. Przed zapłatą Użytkownik zobaczy łączną cenę, okres, zasady odnawiania i sposób rezygnacji.",
      "Konsument może odstąpić od umowy w ciągu 14 dni od jej zawarcia bez podania przyczyny. Jeżeli Konsument zażąda rozpoczęcia świadczenia przed upływem tego terminu i przyjmie do wiadomości utratę prawa odstąpienia (treści cyfrowe dostarczane natychmiast), prawo odstąpienia wygasa zgodnie z art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta; dla usług cyfrowych świadczonych w sposób ciągły obowiązują zasady art. 35 tej ustawy.",
      "Pliki w Studiu są przechowywane przez okres zależny od Planu (§ 3 ust. 3). Po jego upływie lub po zmianie Planu na niższy pliki mogą zostać usunięte — Użytkownik powinien je wcześniej pobrać.",
    ] },
    { id: "s10", h: "§ 10. Odpowiedzialność i dostępność", blocks: [
      "Usługodawca dokłada starań, by Serwis działał nieprzerwanie, ale może go czasowo ograniczyć (np. prace techniczne, tryb serwisowy). Serwis nie jest usługą archiwizacji — Użytkownik powinien przechowywać kopie swoich plików.",
      "Wobec Konsumentów Usługodawca odpowiada na zasadach ogólnych, w tym za zgodność treści i usług cyfrowych z umową (rozdział 5b ustawy o prawach konsumenta). Wobec przedsiębiorców odpowiedzialność jest ograniczona do szkód z winy umyślnej, w granicach dopuszczalnych prawem.",
    ] },
    { id: "s11", h: "§ 11. Reklamacje", blocks: [
      `Reklamacje można składać na ${O.email}, opisując problem i podając adres e-mail Konta. Odpowiedź udzielana jest w ciągu 14 dni.`,
      "Konsument może skorzystać z pozasądowych sposobów rozwiązywania sporów, m.in. pomocy miejskiego lub powiatowego rzecznika konsumentów albo Wojewódzkiego Inspektoratu Inspekcji Handlowej.",
    ] },
    { id: "s12", h: "§ 12. Zmiany regulaminu i postanowienia końcowe", blocks: [
      "Usługodawca może zmienić Regulamin z ważnych przyczyn (zmiana prawa, funkcji, bezpieczeństwa), informując Użytkowników z co najmniej 14-dniowym wyprzedzeniem (e-mail lub komunikat w Serwisie). Użytkownik, który nie akceptuje zmian, może usunąć Konto.",
      "Dane osobowe są przetwarzane zgodnie z Polityką prywatności (" + LEGAL_PATHS.privacy + "), a pliki cookie — zgodnie z Polityką cookies (" + LEGAL_PATHS.cookies + ").",
      "Prawem właściwym jest prawo polskie; nie pozbawia to Konsumenta ochrony, jaką zapewniają mu bezwzględnie obowiązujące przepisy państwa jego zwykłego pobytu. Wersją wiążącą jest wersja polska.",
    ] },
  ],
};
