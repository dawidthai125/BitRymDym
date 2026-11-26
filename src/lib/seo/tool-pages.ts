/**
 * Free tools for rappers (/narzedzia/<slug>): a browser widget + Polish copy aimed at
 * search phrases ("metronom online", "licznik bpm", "tematy do freestyle", "test mikrofonu"). Everything runs
 * in the browser, no account. Pure, client-safe.
 */
export type ToolSlug = "metronom-online" | "licznik-bpm" | "licznik-sylab" | "tematy-do-freestyle" | "test-mikrofonu" | "slowed-reverb";

export type ToolPage = {
  slug: ToolSlug;
  navLabel: string;
  metaTitle: string;
  metaDescription: string;
  h1: string;
  lead: string;
  sections: { h2: string; paragraphs: string[] }[];
  faq: { q: string; a: string }[];
};

export const TOOLS_BASE = "/narzedzia";

export const TOOL_PAGES: readonly ToolPage[] = [
  {
    slug: "metronom-online",
    navLabel: "Metronom online",
    metaTitle: "Metronom online za darmo — BPM, tap tempo, metrum",
    metaDescription:
      "Darmowy metronom online w przeglądarce: ustaw tempo 30–300 BPM, stuknij tap tempo, wybierz metrum i akcent na raz. Do ćwiczenia flow, rapu i gry.",
    h1: "Metronom online",
    lead: "Ustaw tempo, kliknij Start i ćwicz flow równo z klikiem. Działa w przeglądarce na komputerze i telefonie, bez instalowania i bez konta.",
    sections: [
      {
        h2: "Jak ćwiczyć rap z metronomem",
        paragraphs: [
          "Zacznij od tempa bitu, na którym chcesz nagrywać — rap najczęściej siedzi między 80 a 100 BPM (boom bap) albo 130–160 BPM (trap liczony w double-time). Jeśli nie znasz tempa, stuknij je w rytm stopy przyciskiem Tap tempo.",
          "Najpierw rapuj zwrotkę wolniej, np. 10 BPM poniżej docelowego tempa, aż każdy wers trafia w klik. Potem podnoś tempo o 2–3 BPM. Akcent na „raz” pomaga trzymać początek taktu, a metrum 3/4 albo 6/4 przydaje się przy nietypowych bitach.",
        ],
      },
      {
        h2: "Metronom a bit",
        paragraphs: [
          "Metronom daje równy puls, ale finalnie nagrywasz na bicie. Gdy flow już siedzi, wybierz darmowy bit w tym samym tempie z katalogu BitRymDym — każdy bit ma podane BPM i tonację — i nagraj zwrotkę w Studiu online.",
        ],
      },
    ],
    faq: [
      { q: "Czy metronom online jest darmowy?", a: "Tak. Działa w przeglądarce, bez konta i bez reklam dźwiękowych." },
      { q: "Jaki zakres tempa obsługuje?", a: "Od 30 do 300 BPM, co 1 BPM. Tempo ustawisz suwakiem, polem liczby albo przyciskiem Tap tempo." },
      { q: "Czemu metronom nie gra na telefonie?", a: "Sprawdź, czy telefon nie jest wyciszony przełącznikiem i czy głośność multimediów jest włączona. Dźwięk startuje dopiero po dotknięciu przycisku Start." },
    ],
  },
  {
    slug: "licznik-bpm",
    navLabel: "Licznik BPM",
    metaTitle: "Sprawdź BPM i tonację piosenki — licznik BPM online",
    metaDescription:
      "Sprawdź BPM i tonację piosenki albo bitu: wybierz plik MP3/WAV lub stukaj tap tempo. Darmowy licznik w przeglądarce, plik nie jest nigdzie wysyłany.",
    h1: "Licznik BPM i tonacji",
    lead: "Sprawdź tempo i tonację piosenki albo bitu: wybierz plik z dysku albo stukaj w rytm. Liczymy w Twojej przeglądarce, bez wysyłania pliku.",
    sections: [
      {
        h2: "Tap tempo czy plik?",
        paragraphs: [
          "Tap tempo jest najszybsze: stukaj w rytm stopy (kicka) przez kilka taktów — wynik stabilizuje się po 8–10 uderzeniach. Przyda się, gdy słyszysz numer z radia albo z telefonu kolegi.",
          "BPM z pliku liczy tempo z fragmentu ze środka utworu. Analiza szuka powtarzających się uderzeń, więc najlepiej działa na bitach z wyraźną perkusją.",
        ],
      },
      {
        h2: "Half-time i double-time",
        paragraphs: [
          "Ten sam bit można policzyć na dwa sposoby: trap w 140 BPM często „czuje się” jak 70 BPM, bo werbel pada co drugi takt. Dlatego pokazujemy też połowę i podwojenie tempa — wybierz to, które pasuje do Twojego flow.",
          "Znasz tempo? W katalogu BitRymDym przefiltrujesz darmowe bity po BPM i tonacji, a w Studiu online nagrasz na nich zwrotkę.",
        ],
      },
    ],
    faq: [
      { q: "Jak sprawdzić BPM piosenki?", a: "Stukaj w rytm przyciskiem Tap tempo albo wybierz plik audio z dysku — licznik pokaże tempo i jego połowę oraz podwojenie." },
      { q: "Jak sprawdzić tonację piosenki?", a: "Wybierz plik z dysku. Oprócz BPM pokażemy najbardziej prawdopodobną tonację i jej tonację równoległą. Przy utworach z modulacją albo samą perkusją wynik może być niepewny — wtedy to zaznaczamy." },
      { q: "Czy plik jest wysyłany na serwer?", a: "Nie. Plik jest dekodowany i analizowany w Twojej przeglądarce i nie opuszcza urządzenia." },
      { q: "Czemu licznik pokazuje dwa razy za mało albo za dużo?", a: "Analiza może trafić w half-time lub double-time. Wynik jest wtedy pod spodem jako połowa lub podwojenie tempa." },
    ],
  },
  {
    slug: "licznik-sylab",
    navLabel: "Licznik sylab",
    metaTitle: "Licznik sylab online — policz sylaby w wersach tekstu",
    metaDescription:
      "Darmowy licznik sylab do tekstów rapowych i piosenek: wklej tekst, a policzymy sylaby w każdym wersie i pokażemy, który odstaje od reszty.",
    h1: "Licznik sylab",
    lead: "Wklej zwrotkę, a policzymy sylaby w każdym wersie i pokażemy, które linijki są za długie albo za krótkie. Równa liczba sylab to równiejsze flow.",
    sections: [
      {
        h2: "Po co liczyć sylaby w rapie",
        paragraphs: [
          "Wersy o podobnej liczbie sylab łatwiej zmieścić w takcie. Jeśli jedna linijka ma 16 sylab, a reszta 11, właśnie tam będziesz się spieszyć albo gubić oddech. Licznik pokazuje w nawiasie, o ile wers odbiega od średniej zwrotki.",
          "Nie chodzi o idealną matematykę — flow to też pauzy i akcenty. Licznik pomaga znaleźć wers do skrócenia, a rymy do niego dobierzesz w słowniku rymów.",
        ],
      },
      {
        h2: "Jak liczymy",
        paragraphs: [
          "W polszczyźnie sylabę tworzy samogłoska: a, ą, e, ę, i, o, ó, u, y. Litera „i” przed inną samogłoską tylko zmiękcza spółgłoskę („nie”, „się”, „pierwszy”), więc nie liczymy jej osobno. Przy słowach obcych wynik może się różnić o jedną sylabę.",
        ],
      },
    ],
    faq: [
      { q: "Ile sylab powinien mieć wers rapowy?", a: "Nie ma jednej normy. Przy tempie 85–95 BPM wersy mają zwykle 10–14 sylab na takt; ważniejsze jest, żeby wersy w zwrotce były do siebie podobne." },
      { q: "Czy licznik zapisuje mój tekst?", a: "Nie. Tekst jest liczony w przeglądarce i nigdzie nie jest wysyłany." },
      { q: "Jak liczy „nie” i „się”?", a: "Jako jedną sylabę — „i” przed samogłoską tylko zmiękcza spółgłoskę." },
    ],
  },
  {
    slug: "tematy-do-freestyle",
    navLabel: "Tematy do freestyle",
    metaTitle: "Tematy do freestyle — losowanie tematów i słów online",
    metaDescription:
      "Losowe tematy i słowa do freestyle'u: wylosuj temat, 3 słowa albo 1 słowo i ustaw automatyczną zmianę co 10–60 sekund. Za darmo, bez konta, na telefonie i komputerze.",
    h1: "Tematy do freestyle",
    lead: "Losuj tematy albo słowa i nawijaj bez przygotowania. Włącz automatyczną zmianę i trenuj jak na bitwie: nowe hasło co kilkanaście sekund.",
    sections: [
      {
        h2: "Jak trenować z losowymi słowami",
        paragraphs: [
          "Zacznij od jednego słowa i 30 sekund: opisz je, opowiedz z nim historię, znajdź do niego rym. Kiedy to idzie gładko, przejdź na 3 słowa — musisz je połączyć w jedną myśl, a to uczy szybkiego skojarzenia i budowania puenty.",
          "Tryb „Temat” jest bliżej prawdziwej bitwy. Daj sobie cztery wersy na wejście w temat, cztery na rozwinięcie i cztery na puentę. Nie zatrzymuj się po błędzie — we freestyle'u liczy się ciągłość.",
        ],
      },
      {
        h2: "Z bitem czy bez",
        paragraphs: [
          "Na początek nawijaj a cappella albo z wolnym metronomem. Potem włącz bit 80–95 BPM w drugiej karcie przeglądarki. Darmowe bity z podanym tempem są w katalogu BitRymDym, a krótką próbę nagrasz od razu po zalogowaniu.",
          "Nagrywaj się. Po tygodniu odsłuchaj pierwsze próby: od razu usłyszysz powtarzające się rymy i wypełniacze, których warto się pozbyć.",
        ],
      },
      {
        h2: "Trening we dwójkę",
        paragraphs: [
          "Ustawcie zmianę co 20 sekund i wchodźcie na zmianę, każdy na nowe hasło. Możecie też grać w dokańczanie: jedna osoba kończy wers wylosowanym słowem, druga musi znaleźć rym i polecieć dalej.",
        ],
      },
    ],
    faq: [
      { q: "Skąd wziąć tematy do freestyle'u?", a: "Wylosuj je tutaj. Lista ma ponad sto tematów i ponad sto słów, a hasła nie powtarzają się, dopóki lista się nie skończy." },
      { q: "Jak ćwiczyć freestyle samemu?", a: "Ustaw automatyczną zmianę co 20–30 sekund i nawijaj bez przerwy na każde hasło. Nagrywaj próby i odsłuchuj je po kilku dniach." },
      { q: "Czy losowanie działa na telefonie?", a: "Tak, w przeglądarce, bez instalowania i bez konta." },
    ],
  },
  {
    slug: "test-mikrofonu",
    navLabel: "Test mikrofonu",
    metaTitle: "Test mikrofonu online — sprawdź mikrofon i poziom",
    metaDescription:
      "Test mikrofonu online: sprawdź, czy mikrofon działa, zobacz poziom w dB, nagraj 5 sekund próby i odsłuchaj. W przeglądarce, bez instalowania i bez wysyłania dźwięku.",
    h1: "Test mikrofonu online",
    lead: "Sprawdź w kilka sekund, czy mikrofon działa i czy nagrywasz na dobrym poziomie. Dźwięk zostaje na Twoim urządzeniu.",
    sections: [
      {
        h2: "Jak sprawdzić mikrofon",
        paragraphs: [
          "Kliknij „Włącz mikrofon” i zezwól przeglądarce na dostęp. Mów albo rapuj tak głośno, jak na nagraniu. Pasek powinien się ruszać, a najgłośniejsze miejsca zostawać poniżej 0 dB, najlepiej między −18 a −6 dB.",
          "Nagraj pięciosekundową próbę i odsłuchaj ją na słuchawkach. Na głośnikach mikrofon zbierze odsłuch i łatwo pomylić sprzężenie z usterką.",
        ],
      },
      {
        h2: "Mikrofon nie działa — co sprawdzić",
        paragraphs: [
          "Zacznij od zgody w przeglądarce: ikona przy adresie strony pokazuje, czy mikrofon jest zablokowany. Potem sprawdź, czy wybrany jest właściwy mikrofon — laptop często wybiera wbudowany zamiast USB. Zamknij też programy, które mogą go zajmować, na przykład komunikatory.",
          "W systemie sprawdź ustawienia prywatności mikrofonu i poziom wejścia. Mikrofon pojemnościowy podłączony przez interfejs potrzebuje zwykle zasilania phantom 48 V.",
        ],
      },
      {
        h2: "Dobry poziom do nagrywania wokalu",
        paragraphs: [
          "Za cicho — razem z głosem podniesiesz później szum. Za głośno — dźwięk się przesteruje i nie da się go naprawić. Zostaw zapas: najgłośniejszy krzyk z refrenu nie powinien dobijać do 0 dB.",
          "Gdy poziom jest dobry, możesz od razu nagrać zwrotkę na darmowym bicie w Studiu online BitRymDym.",
        ],
      },
    ],
    faq: [
      { q: "Jak sprawdzić, czy mikrofon działa?", a: "Włącz mikrofon na tej stronie i powiedz coś. Jeśli pasek się rusza, mikrofon działa. Nagraj próbę, żeby usłyszeć jakość." },
      { q: "Czy ktoś słyszy mój test?", a: "Nie. Dźwięk jest mierzony i odtwarzany tylko w Twojej przeglądarce, nic nie jest wysyłane na serwer." },
      { q: "Czemu mikrofon jest za cichy?", a: "Najczęściej jest za daleko albo ma ustawioną niską czułość. Podejdź na około 15–20 cm i podnieś poziom wejścia w systemie lub na interfejsie." },
      { q: "Czy test działa na telefonie?", a: "Tak, w nowych przeglądarkach na Androidzie i iPhonie, po udzieleniu zgody na mikrofon." },
    ],
  },
  {
    slug: "slowed-reverb",
    navLabel: "Slowed + reverb",
    metaTitle: "Slowed + reverb generator online — zwolnij piosenkę",
    metaDescription:
      "Slowed reverb generator online: zwolnij albo przyspiesz piosenkę, dodaj pogłos, odsłuchaj i pobierz WAV. Za darmo, w przeglądarce, bez wysyłania pliku.",
    h1: "Slowed + reverb online",
    lead: "Wybierz plik, zwolnij go, dodaj pogłos i pobierz gotową wersję. Wszystko liczy Twoja przeglądarka, bez konta i bez wysyłania pliku.",
    sections: [
      {
        h2: "Jak zrobić wersję slowed + reverb",
        paragraphs: [
          "Wybierz plik audio i zacznij od ustawienia „Slowed + reverb”: 85% prędkości i średni pogłos. Razem z prędkością spada wysokość dźwięku, jak przy wolniej kręcącej się taśmie — 85% to niecałe trzy półtony w dół.",
          "Pogłos dodawaj z umiarem. Przy gęstym mixie 30–40% wystarcza, a dłuższy ogon (4–6 s) pasuje do wolnych, przestrzennych numerów. Gdy wokal się rozmywa, skróć pogłos zamiast go ściszać.",
        ],
      },
      {
        h2: "Przyspieszona wersja",
        paragraphs: [
          "To samo narzędzie robi wersje przyspieszone: ustaw 110–130% i zero pogłosu. Wysokość idzie wtedy w górę, więc wokal brzmi jaśniej i lżej.",
          "Jeśli chcesz dobrać bit pod zmienioną prędkość, policz nowe tempo: BPM oryginału razy prędkość. Numer 140 BPM w 85% ma 119 BPM.",
        ],
      },
      {
        h2: "Prawa do nagrania",
        paragraphs: [
          "Zwolnienie cudzej piosenki nie daje do niej praw. Do publikacji używaj własnych numerów albo nagrań, na które masz zgodę. Własny numer nagrasz na darmowym bicie w Studiu online.",
        ],
      },
    ],
    faq: [
      { q: "Czy mogę wkleić link z YouTube?", a: "Nie. Narzędzie działa na pliku z Twojego dysku i niczego nie pobiera z innych serwisów." },
      { q: "W jakim formacie jest wynik?", a: "WAV 16 bit stereo. Wejście to MP3, WAV, M4A albo inny format, który czyta Twoja przeglądarka, do 10 minut i 80 MB." },
      { q: "Czy zwolnienie zmienia tonację?", a: "Tak, prędkość i wysokość zmieniają się razem. Przy suwaku widać, o ile półtonów." },
    ],
  },
];

export function toolPath(slug: string): string {
  return `${TOOLS_BASE}/${slug}`;
}

export function toolPage(slug: string): ToolPage | null {
  return TOOL_PAGES.find((t) => t.slug === slug) ?? null;
}
