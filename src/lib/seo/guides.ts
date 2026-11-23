/**
 * Poradniki (/poradniki/[slug]) — evergreen articles for informational searches
 * ("jak napisać tekst rapowy", "co to jest BPM"). General craft knowledge; product
 * mentions only where they are true (Studio online, BITEK, Nagrywarka, darmowe bity).
 */
import type { LandingPage } from "@/lib/seo/landing-pages";

export const GUIDE_BASE = "/poradniki";

export type Guide = LandingPage & { datePublished: string };

export const GUIDES: readonly Guide[] = [
  {
    slug: "jak-napisac-tekst-rapowy",
    datePublished: "2026-11-23",
    navLabel: "Jak napisać tekst rapowy",
    metaTitle: "Jak napisać tekst rapowy — poradnik dla początkujących",
    metaDescription:
      "Jak napisać tekst rapowy krok po kroku: temat, struktura zwrotki i refrenu, rymy wielokrotne, liczenie sylab pod bit i nagranie próby. Praktyczny poradnik.",
    h1: "Jak napisać tekst rapowy",
    lead: "Dobry tekst rapowy to nie tylko rymy. To temat, rytm i obraz, który słuchacz zapamięta. Ten poradnik przeprowadzi Cię od pustej kartki do zwrotki gotowej do nagrania.",
    sections: [
      {
        h2: "Zacznij od tematu, nie od rymu",
        paragraphs: [
          "Zanim zaczniesz szukać rymów, odpowiedz sobie na pytanie: o czym jest ten numer? Jedno zdanie wystarczy — „o tym, jak wyprowadziłem się z domu”, „o nocnej zmianie”. Temat trzyma tekst w ryzach i sprawia, że wersy do siebie pasują.",
          "Spisz luźno skojarzenia, konkretne obrazy i szczegóły: miejsca, nazwy, zapachy, dźwięki. Konkret zawsze wygrywa z ogólnikiem — „zimna klatka na Bródnie” mówi więcej niż „trudne życie”.",
        ],
      },
      {
        h2: "Struktura: zwrotka, refren, zwrotka",
        paragraphs: [
          "Najczęstszy układ numeru to intro, zwrotka (zwykle 16 wersów), refren (4–8 wersów), druga zwrotka, refren i ewentualnie trzecia zwrotka albo bridge. Wers to zwykle jeden takt bitu, więc 16 wersów to 16 taktów.",
          "Refren to hasło numeru — krótki, powtarzalny i łatwy do zapamiętania. Zwrotki rozwijają temat i opowiadają historię.",
        ],
      },
      {
        h2: "Rymy, które brzmią",
        paragraphs: [
          "Rym dokładny („rapu — zapału”) to dopiero początek. Rap żyje rymami wielokrotnymi, w których rymuje się kilka sylab naraz, i rymami wewnętrznymi w środku wersu. Pomaga czytanie tekstu na głos — liczy się brzmienie, nie pisownia.",
          "Nie poświęcaj sensu dla rymu. Jeśli wers jest tylko po to, żeby się zrymować, słuchacz to usłyszy.",
        ],
      },
      {
        h2: "Pisz pod bit",
        paragraphs: [
          "Najlepiej pisać, słuchając bitu w pętli. Wtedy od razu czujesz, ile sylab mieści się w takcie i gdzie wypadają akcenty. Wolny bit (około 70–90 BPM) daje miejsce na gęste, wielosylabowe wersy, a szybki wymusza krótsze frazy.",
          "Gdy masz pierwszą zwrotkę, nagraj próbę. Dopiero na nagraniu słychać, które wersy się dławią, a które niosą. W BitRymDym możesz wybrać darmowy bit i nagrać próbę w przeglądarce w kilka minut.",
        ],
      },
    ],
    faq: [
      {
        q: "Ile wersów ma zwrotka rapowa?",
        a: "Najczęściej 16 wersów, czyli 16 taktów bitu. Spotyka się też zwrotki 8- i 12-wersowe, zwłaszcza w krótszych numerach.",
      },
      {
        q: "Jak znaleźć rymy do tekstu?",
        a: "Czytaj wersy na głos i szukaj słów o podobnym brzmieniu samogłosek, nie tylko końcówek. Rymy wielokrotne i wewnętrzne brzmią lepiej niż proste rymy na końcu wersu.",
      },
      {
        q: "Czy najpierw pisać tekst, czy wybierać bit?",
        a: "Łatwiej zacząć od bitu — jego tempo i klimat podpowiadają długość wersów i nastrój tekstu.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/darmowe-bity-do-rapu", label: "Wybierz bit do tekstu" },
      { href: "/poradniki/jak-zrobic-refren", label: "Jak zrobić refren" },
    ],
  },
  {
    slug: "jak-zrobic-refren",
    datePublished: "2026-11-23",
    navLabel: "Jak zrobić refren",
    metaTitle: "Jak zrobić dobry refren do rapu — hook, który zostaje w głowie",
    metaDescription:
      "Jak zrobić refren do rapu: krótkie hasło, powtórzenia, melodia, kontrast ze zwrotką i dublowanie wokalu. Poradnik z przykładami struktury hooka.",
    h1: "Jak zrobić refren do rapu",
    lead: "Refren (hook) to część, którą ludzie nucą po jednym odsłuchu. Nie musi być śpiewany ani skomplikowany — musi być prosty, powtarzalny i mocny.",
    sections: [
      {
        h2: "Jedno hasło",
        paragraphs: [
          "Dobry refren kręci się wokół jednego zdania, które streszcza numer. Często jest to tytuł utworu. Jeśli nie umiesz streścić numeru w jednym zdaniu, refren będzie się rozłaził.",
        ],
      },
      {
        h2: "Powtórzenie i rytm",
        paragraphs: [
          "Powtórzenie to nie lenistwo, tylko narzędzie. Typowy refren ma 4 lub 8 wersów, w których hasło wraca dwa albo cztery razy. Rytm refrenu powinien różnić się od zwrotki — prostszy flow, dłuższe sylaby, więcej powietrza.",
        ],
      },
      {
        h2: "Melodia i kontrast",
        paragraphs: [
          "Nawet rapowany refren zyskuje na lekkiej melodii. Spróbuj zanucić hasło na bicie, zanim dopiszesz resztę słów. Kontrast ze zwrotką — inna wysokość głosu, inna energia — sprawia, że refren wyskakuje z numeru.",
        ],
      },
      {
        h2: "Nagranie refrenu: dublowanie",
        paragraphs: [
          "Refren zwykle nagrywa się kilka razy i układa nagrania jedno na drugim. Dwie lub trzy warstwy tego samego tekstu dają szerokie, pełne brzmienie. W Studiu BitRymDym nagrywasz dodatkowe ścieżki i rozkładasz je w panoramie lewo–prawo.",
        ],
      },
    ],
    faq: [
      {
        q: "Ile taktów ma refren?",
        a: "Najczęściej 8 taktów (4 lub 8 wersów). Krótsze, 4-taktowe refreny też się sprawdzają, zwłaszcza w trapie.",
      },
      {
        q: "Czy refren musi być śpiewany?",
        a: "Nie. Wiele mocnych refrenów jest rapowanych. Liczy się prostota, powtórzenie i kontrast ze zwrotką.",
      },
      {
        q: "Jak sprawić, żeby refren brzmiał pełniej?",
        a: "Nagraj go dwa–trzy razy i ułóż nagrania warstwami, rozkładając je lekko w lewo i w prawo.",
      },
    ],
    beats: null,
    cta: [
      { href: "/studio-nagran-online", label: "Nagraj refren w Studiu" },
      { href: "/poradniki/jak-napisac-tekst-rapowy", label: "Jak napisać tekst" },
    ],
  },
  {
    slug: "co-to-jest-bpm-i-tonacja",
    datePublished: "2026-11-23",
    navLabel: "Co to jest BPM i tonacja",
    metaTitle: "Co to jest BPM i tonacja bitu — jak dobrać bit do flow",
    metaDescription:
      "Co oznacza BPM i tonacja bitu, jakie tempo mają trap, boom bap i lo-fi, i jak dobrać bit do swojego flow i głosu. Prosto wyjaśnione dla raperów.",
    h1: "BPM i tonacja — jak dobrać bit",
    lead: "Przy każdym bicie widzisz dwie liczby: BPM i tonację. Wyjaśniamy, co znaczą i jak z nich korzystać, żeby szybciej znaleźć bit pod siebie.",
    sections: [
      {
        h2: "BPM, czyli tempo",
        paragraphs: [
          "BPM (beats per minute) to liczba uderzeń na minutę. Im wyższa, tym szybszy bit. Klasyczny boom bap kręci się zwykle wokół 85–95 BPM, lo-fi bywa wolniejsze, a trap zapisuje się zwykle jako 130–160 BPM.",
          "Uwaga na trap: bębny grają tam często w połowie tempa (half-time), więc bit 140 BPM może brzmieć jak 70 BPM. Dlatego na trapie da się nawijać zarówno leniwie, jak i bardzo szybko.",
        ],
      },
      {
        h2: "Tonacja",
        paragraphs: [
          "Tonacja mówi, wokół jakich dźwięków zbudowana jest melodia bitu, na przykład Am (a-moll) albo C (C-dur). Tonacje molowe brzmią zwykle mroczniej i poważniej, durowe — jaśniej.",
          "Dla rapowanej zwrotki tonacja ma mniejsze znaczenie, ale dla śpiewanego refrenu jest kluczowa: wybierz bit w tonacji, w której Twój głos czuje się swobodnie.",
        ],
      },
      {
        h2: "Jak dobrać bit do flow",
        paragraphs: [
          "Gęsty, techniczny flow z wieloma sylabami lepiej czuje się na wolniejszych bitach. Melodyjne, przeciągane frazy dobrze siadają na trapie z half-time. Najprościej: posłuchaj kilku bitów w różnym tempie i zanuć na nich swój tekst.",
          "W katalogu BitRymDym każdy bit ma podany BPM i tonację, a strony gatunków pokazują zakres tempa w danym gatunku.",
        ],
      },
    ],
    faq: [
      {
        q: "Jakie BPM ma trap?",
        a: "Trap zapisuje się zwykle jako 130–160 BPM, ale bębny grają w połowie tempa, więc odczuwalnie bit jest wolniejszy.",
      },
      {
        q: "Jakie BPM ma boom bap?",
        a: "Najczęściej około 85–95 BPM.",
      },
      {
        q: "Czy tonacja bitu ma znaczenie dla rapu?",
        a: "Dla rapowanej zwrotki mniejsze, dla śpiewanego refrenu duże — wybierz tonację wygodną dla Twojego głosu.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/beats", label: "Bity z BPM i tonacją" },
      { href: "/podklady-do-rapu", label: "Podkłady do rapu" },
    ],
  },
  {
    slug: "jak-zmiksowac-wokal",
    datePublished: "2026-11-23",
    navLabel: "Jak zmiksować wokal",
    metaTitle: "Jak zmiksować wokal rapowy — EQ, kompresja, pogłos, głośność",
    metaDescription:
      "Jak zmiksować wokal rapowy z bitem: czyste nagranie, korekcja EQ, kompresja, de-esser, pogłos i delay oraz głośność wokalu względem bitu. Poradnik krok po kroku.",
    h1: "Jak zmiksować wokal rapowy",
    lead: "Mix to moment, w którym surowe nagranie zaczyna brzmieć jak numer. Oto podstawowe kroki obróbki wokalu — w tej kolejności, w jakiej robią to realizatorzy.",
    sections: [
      {
        h2: "1. Czyste nagranie",
        paragraphs: [
          "Żaden mix nie uratuje przesterowanego albo zapogłosowanego nagrania. Nagrywaj w słuchawkach, w wyciszonym pokoju i z bezpiecznym zapasem poziomu. To najważniejszy krok całego mixu.",
        ],
      },
      {
        h2: "2. Korekcja (EQ)",
        paragraphs: [
          "Wytnij niskie częstotliwości, w których głos nie ma nic do powiedzenia (dudnienie, szum), zwykle filtrem górnoprzepustowym. Potem delikatnie przytnij miejsca, w których głos buczy albo brzmi nosowo, i dodaj odrobinę góry dla czytelności.",
        ],
      },
      {
        h2: "3. Kompresja i de-esser",
        paragraphs: [
          "Kompresor wyrównuje różnice głośności między cichymi i głośnymi fragmentami, dzięki czemu wokal siedzi równo na bicie. De-esser przycisza ostre „s” i „sz”, które po kompresji stają się bardziej słyszalne.",
        ],
      },
      {
        h2: "4. Przestrzeń: pogłos i delay",
        paragraphs: [
          "Krótki pogłos i delay dodają wokalowi przestrzeni, ale w rapie zwykle stosuje się je oszczędnie — zwrotka ma być blisko i wyraźna. Więcej efektów można dać na końcówki wersów i w refrenie.",
        ],
      },
      {
        h2: "5. Balans z bitem i master",
        paragraphs: [
          "Wokal musi być wyraźnie słyszalny, ale nie może odklejać się od bitu. Porównuj mix z ulubionymi numerami na tych samych słuchawkach. Na koniec master wyrównuje całość i ustawia głośność pod streaming.",
          "W Studiu BitRymDym propozycję mixu i masteringu przygotowuje BITEK — wyrównuje wokal z bitem i robi master, a Ty decydujesz, czy ją przyjąć.",
        ],
      },
    ],
    faq: [
      {
        q: "W jakiej kolejności miksować wokal?",
        a: "Zwykle: czyszczenie nagrania, EQ, kompresja, de-esser, efekty przestrzenne (pogłos, delay), a na końcu balans z bitem.",
      },
      {
        q: "Jak głośno ustawić wokal względem bitu?",
        a: "Tak, żeby każde słowo było zrozumiałe, ale wokal nie brzmiał jak położony na wierzchu. Porównuj z gotowymi numerami.",
      },
      {
        q: "Czy można zmiksować wokal online?",
        a: "Tak. W Studiu BitRymDym BITEK proponuje mix i mastering w przeglądarce.",
      },
    ],
    beats: null,
    cta: [
      { href: "/mix-i-mastering-online", label: "Mix i mastering online" },
      { href: "/nagrywanie-rapu-w-domu", label: "Jak nagrać rap w domu" },
    ],
  },
  {
    slug: "freestyle-jak-zaczac",
    datePublished: "2026-11-23",
    navLabel: "Freestyle — jak zacząć",
    metaTitle: "Freestyle rap — jak zacząć i ćwiczyć improwizację",
    metaDescription:
      "Jak zacząć freestyle: ćwiczenia na rymy i flow, nawijanie o tym, co widzisz, praca z bitem i nagrywanie prób. Praktyczne sposoby na trening improwizacji.",
    h1: "Freestyle — jak zacząć",
    lead: "Freestyle to umiejętność, którą da się wytrenować. Nie chodzi o to, żeby od razu brzmieć jak mistrz bitew, tylko żeby nie przestawać nawijać.",
    sections: [
      {
        h2: "Nawijaj o tym, co widzisz",
        paragraphs: [
          "Najprostsze ćwiczenie: włącz bit i opisuj otoczenie. Kubek, okno, tramwaj za szybą. Konkretne przedmioty dają materiał, kiedy w głowie robi się pusto.",
        ],
      },
      {
        h2: "Rymy na zapas",
        paragraphs: [
          "Ćwicz łańcuchy rymów: wybierz słowo i wymieniaj kolejne, które się z nim rymują. Z czasem mózg zaczyna podsuwać rymy szybciej, a Ty możesz planować końcówkę wersu, zanim do niej dojdziesz.",
        ],
      },
      {
        h2: "Flow ważniejszy niż treść",
        paragraphs: [
          "Na początku nie przejmuj się sensem — trzymaj rytm. Jeśli zabraknie słów, powtarzaj ostatnią frazę albo nawijaj sylaby w rytmie, aż wróci pomysł. Najgorsze, co możesz zrobić, to zatrzymać się.",
        ],
      },
      {
        h2: "Nagrywaj i słuchaj",
        paragraphs: [
          "Nagrywaj swoje freestyle'e. Odsłuch pokazuje, co wychodzi naturalnie, a co się powtarza. Czasem z improwizacji rodzi się najlepszy wers do numeru. Darmowe bity w BitRymDym odpalisz w przeglądarce i nagrasz próbę bez instalowania.",
        ],
      },
    ],
    faq: [
      {
        q: "Jak ćwiczyć freestyle codziennie?",
        a: "Codziennie kilka minut na bicie: opisuj otoczenie, rób łańcuchy rymów i nagrywaj próby, żeby słyszeć postępy.",
      },
      {
        q: "Co robić, gdy zabraknie słów?",
        a: "Nie zatrzymuj się — powtórz ostatnią frazę albo opisz coś, co widzisz. Rytm jest ważniejszy niż treść.",
      },
      {
        q: "Na jakim bicie ćwiczyć freestyle?",
        a: "Na początek na spokojnym, średnim tempie, na przykład boom bapie około 85–95 BPM.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/darmowe-bity-do-rapu", label: "Bity do freestyle'u" },
      { href: "/poradniki/co-to-jest-bpm-i-tonacja", label: "BPM i tonacja" },
    ],
  },
  {
    slug: "jak-wydac-utwor-na-spotify",
    datePublished: "2026-11-23",
    navLabel: "Jak wydać utwór na Spotify",
    metaTitle: "Jak wydać utwór rapowy na Spotify — od nagrania do premiery",
    metaDescription:
      "Jak wydać własny utwór rapowy na Spotify i w serwisach streamingowych: prawa do bitu, master pod −14 LUFS, okładka, dystrybutor cyfrowy i plan premiery.",
    h1: "Jak wydać utwór na Spotify",
    lead: "Masz gotowy numer i chcesz, żeby był na Spotify, Apple Music i YouTube Music? Oto, co musisz przygotować przed wysłaniem utworu do dystrybucji.",
    sections: [
      {
        h2: "1. Prawa do bitu",
        paragraphs: [
          "Zanim wydasz numer, upewnij się, że możesz legalnie użyć bitu do publikacji i zarabiania. Sprawdź licencję od producenta i jego wymagania, na przykład podpis w tytule lub opisie. Na BitRymDym zasady dla darmowych bitów są opisane na stronie „Jak nagrać utwór”, a bit kupiony na wyłączność jest tylko Twój.",
        ],
      },
      {
        h2: "2. Master pod streaming",
        paragraphs: [
          "Serwisy streamingowe wyrównują głośność utworów. Master przygotowany w okolicach −14 LUFS nie zostanie mocno ściszony i zabrzmi naturalnie obok innych numerów. Wyślij plik w jakości bezstratnej, najlepiej WAV.",
        ],
      },
      {
        h2: "3. Okładka i dane utworu",
        paragraphs: [
          "Przygotuj kwadratową okładkę (dystrybutorzy wymagają zwykle co najmniej 3000×3000 px), tytuł, wykonawcę, autorów tekstu i muzyki oraz gatunek. Okładka nie może zawierać cudzych logotypów ani materiałów, do których nie masz praw.",
        ],
      },
      {
        h2: "4. Dystrybutor cyfrowy i premiera",
        paragraphs: [
          "Na Spotify nie wrzucasz numeru bezpośrednio — robisz to przez dystrybutora cyfrowego, który rozsyła utwór do serwisów. Ustaw datę premiery z wyprzedzeniem (co najmniej kilka tygodni), żeby zdążyć zgłosić numer do playlist redakcyjnych w Spotify for Artists i przygotować promocję.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy mogę wydać na Spotify utwór na darmowym bicie?",
        a: "Tylko jeśli licencja bitu na to pozwala. Sprawdź warunki producenta przed publikacją.",
      },
      {
        q: "Ile LUFS powinien mieć utwór na Spotify?",
        a: "Spotify normalizuje głośność do około −14 LUFS, dlatego master w tych okolicach brzmi najbardziej naturalnie.",
      },
      {
        q: "Jak wrzucić piosenkę na Spotify?",
        a: "Przez dystrybutora cyfrowego. Wysyłasz plik WAV, okładkę i dane utworu, a dystrybutor publikuje numer w serwisach.",
      },
    ],
    beats: null,
    cta: [
      { href: "/mix-i-mastering-online", label: "Master pod streaming" },
      { href: "/jak-nagrac", label: "Licencja i limity planów" },
    ],
  },
  {
    slug: "jak-zrobic-flow",
    datePublished: "2026-11-23",
    navLabel: "Jak zrobić flow",
    metaTitle: "Flow w rapie — jak go wyćwiczyć i dopasować do bitu",
    metaDescription:
      "Co to jest flow w rapie i jak go wyćwiczyć: rytm, akcenty, pauzy, triole i zmiany tempa. Ćwiczenia na bicie, które pomogą Ci brzmieć pewniej i ciekawiej.",
    h1: "Flow w rapie — jak go wyćwiczyć",
    lead: "Flow to sposób, w jaki układasz słowa na bicie: rytm, akcenty i oddech. Ten sam tekst może brzmieć nudno albo świetnie — różnicę robi właśnie flow.",
    sections: [
      {
        h2: "Rytm i akcenty",
        paragraphs: [
          "Bit ma stały puls. Flow polega na tym, gdzie w tym pulsie stawiasz sylaby i które z nich akcentujesz. Spróbuj wyklaskać rytm wersu, zanim go nawiniesz — od razu usłyszysz, czy siedzi na bębnach, czy się z nimi kłóci.",
        ],
      },
      {
        h2: "Pauzy są częścią flow",
        paragraphs: [
          "Nie musisz wypełniać każdej ćwierćnuty. Krótka pauza przed puentą wersu albo zaczęcie frazy chwilę po werblu dodaje napięcia i daje słuchaczowi czas na złapanie sensu. Oddech zaplanuj tak samo jak rymy.",
        ],
      },
      {
        h2: "Zmieniaj schematy",
        paragraphs: [
          "Najprostszy sposób na ciekawszy flow to zmiana schematu co kilka wersów: przejście z równych ósemek na triole, przyspieszenie (double time) albo zwolnienie na końcówce. Kontrast trzyma uwagę.",
          "Na trapie bębny grają często w połowie tempa, więc triole i szybkie wejścia brzmią tam naturalnie. Na boom bapie lepiej sprawdza się bujanie z akcentem na werbel.",
        ],
      },
      {
        h2: "Ćwicz na różnych bitach",
        paragraphs: [
          "Ten sam tekst nawiń na trzech bitach w różnym tempie i nagraj każdą wersję. Odsłuch pokaże, gdzie flow siedzi najlepiej. Darmowe bity w BitRymDym mają podane BPM, więc łatwo wybrać wolniejszy i szybszy.",
        ],
      },
    ],
    faq: [
      {
        q: "Co to jest flow w rapie?",
        a: "Sposób układania słów na bicie: rytm sylab, akcenty, pauzy i tempo nawijki.",
      },
      {
        q: "Jak poprawić flow?",
        a: "Wyklaskuj rytm wersów, planuj pauzy i oddech, zmieniaj schematy co kilka wersów i nagrywaj próby na bitach w różnym tempie.",
      },
      {
        q: "Co to są triole w rapie?",
        a: "Podział, w którym na jedno uderzenie przypadają trzy sylaby zamiast dwóch lub czterech. Często słychać go w trapie.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/darmowe-bity-do-rapu", label: "Bity do ćwiczenia flow" },
      { href: "/poradniki/co-to-jest-bpm-i-tonacja", label: "BPM i tonacja" },
    ],
  },
  {
    slug: "mikrofon-do-rapu",
    datePublished: "2026-11-23",
    navLabel: "Mikrofon do rapu",
    metaTitle: "Mikrofon do rapu — USB czy XLR, dynamiczny czy pojemnościowy",
    metaDescription:
      "Jaki mikrofon do nagrywania rapu w domu: USB czy XLR z interfejsem, dynamiczny czy pojemnościowy, pop filtr i ustawienie. Prosty przewodnik dla początkujących.",
    h1: "Mikrofon do rapu — jak wybrać",
    lead: "Dobry mikrofon pomaga, ale nie zastąpi cichego pokoju i dobrej techniki. Oto, na co patrzeć przy wyborze pierwszego mikrofonu do nagrywania rapu w domu.",
    sections: [
      {
        h2: "USB czy XLR",
        paragraphs: [
          "Mikrofon USB podłączasz prosto do komputera — bez dodatkowego sprzętu. To najprostszy start. Mikrofon XLR wymaga interfejsu audio, ale daje więcej możliwości rozbudowy i zwykle lepszą kontrolę poziomu.",
        ],
      },
      {
        h2: "Dynamiczny czy pojemnościowy",
        paragraphs: [
          "Mikrofony dynamiczne są mniej czułe, więc łapią mniej odbić i hałasu z pokoju — dobry wybór do nieprzygotowanego pomieszczenia. Pojemnościowe łapią więcej detali, ale też więcej pogłosu, więc lepiej sprawdzają się w wyciszonym miejscu.",
        ],
      },
      {
        h2: "Akcesoria, które robią różnicę",
        paragraphs: [
          "Pop filtr albo osłona przeciwwietrzna gasi „p” i „b”. Statyw trzyma mikrofon w stałej odległości. Słuchawki zamknięte nie przepuszczają bitu do mikrofonu.",
        ],
      },
      {
        h2: "Ustawienie i poziom",
        paragraphs: [
          "Mów z odległości mniej więcej dłoni, lekko obok osi mikrofonu, i ustaw głośność wejścia tak, żeby najgłośniejsze fragmenty nie przesterowywały. Przed nagraniem w Studiu BitRymDym zrób próbę mikrofonu, a w Nagrywarce na Windows użyj przycisku „Próba mikrofonu”.",
        ],
      },
    ],
    faq: [
      {
        q: "Jaki mikrofon do rapu na start?",
        a: "Najprościej mikrofon USB. Do głośnego, niewyciszonego pokoju lepszy będzie mikrofon dynamiczny.",
      },
      {
        q: "Czy da się nagrać rap na mikrofonie ze słuchawek?",
        a: "Tak, na próby wystarczy. Do nagrań, które chcesz wydać, warto mieć osobny mikrofon.",
      },
      {
        q: "Czy potrzebuję interfejsu audio?",
        a: "Do mikrofonu USB nie. Do mikrofonu XLR tak.",
      },
    ],
    beats: null,
    cta: [
      { href: "/nagrywanie-rapu-w-domu", label: "Jak nagrać rap w domu" },
      { href: "/studio-nagran-online", label: "Studio nagrań online" },
    ],
  },
  {
    slug: "nagrywanie-rapu-na-telefonie",
    datePublished: "2026-11-23",
    navLabel: "Nagrywanie rapu na telefonie",
    metaTitle: "Jak nagrać rap na telefonie — bit, słuchawki i przeglądarka",
    metaDescription:
      "Jak nagrać rap na telefonie: słuchawki, ciche miejsce, ustawienie telefonu i nagranie zwrotki na bicie w przeglądarce. Proste kroki bez instalowania aplikacji.",
    h1: "Jak nagrać rap na telefonie",
    lead: "Nie masz komputera ani mikrofonu? Pierwszą zwrotkę nagrasz na telefonie. Kilka prostych zasad zrobi dużą różnicę w brzmieniu.",
    sections: [
      {
        h2: "Słuchawki i cisza",
        paragraphs: [
          "Bit puszczaj w słuchawkach, nie z głośnika — inaczej wejdzie do nagrania. Nagrywaj w najcichszym miejscu, z dala od okna i ulicy. Pokój z meblami, zasłonami i dywanem brzmi lepiej niż łazienka czy pusty korytarz.",
        ],
      },
      {
        h2: "Telefon jako mikrofon",
        paragraphs: [
          "Mikrofon telefonu jest zwykle na dole obudowy. Trzymaj go w stałej odległości od ust, mniej więcej na szerokość dłoni, i nie zasłaniaj go palcami. Jeśli masz słuchawki z mikrofonem, sprawdź, który brzmi lepiej.",
        ],
      },
      {
        h2: "Nagrywanie w przeglądarce",
        paragraphs: [
          "W BitRymDym nie musisz instalować aplikacji: wybierasz darmowy bit i nagrywasz zwrotkę w przeglądarce, a Studio ma układ dopasowany do telefonu. Stronę możesz też dodać do ekranu głównego jak aplikację.",
          "Po nagraniu BITEK zaproponuje mix i mastering, a gotowy plik pobierzesz albo pokażesz w katalogu utworów.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy da się nagrać dobry rap na telefonie?",
        a: "Na próby i pierwsze numery — tak, jeśli nagrywasz w słuchawkach i w cichym miejscu. Osobny mikrofon da lepszą jakość.",
      },
      {
        q: "Jak nagrać rap na telefonie bez aplikacji?",
        a: "Przez przeglądarkę: w BitRymDym wybierasz bit i nagrywasz wokal w Studiu online.",
      },
      {
        q: "Dlaczego w nagraniu słychać bit?",
        a: "Bo leciał z głośnika telefonu. Puść bit w słuchawkach.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/darmowe-bity-do-rapu", label: "Wybierz bit" },
      { href: "/studio-nagran-online", label: "Studio online" },
    ],
  },
  {
    slug: "dublowanie-wokalu",
    datePublished: "2026-11-23",
    navLabel: "Dublowanie wokalu",
    metaTitle: "Dublowanie wokalu w rapie — jak nagrać dubel i adlibsy",
    metaDescription:
      "Jak nagrać dubel wokalu w rapie: dublowanie końcówek, pełne dublowanie refrenu, adlibsy, panorama lewo–prawo i głośność warstw. Poradnik krok po kroku.",
    h1: "Dublowanie wokalu w rapie",
    lead: "Dubel to druga (albo trzecia) warstwa tego samego tekstu nagrana pod główny wokal. Dodaje energii i szerokości — o ile nie przesadzisz.",
    sections: [
      {
        h2: "Dubel końcówek",
        paragraphs: [
          "Najczęstsza technika w zwrotkach: dublujesz tylko ostatnie słowa wersów albo najważniejsze akcenty. Główny wokal zostaje czytelny, a puenty mocniej uderzają.",
        ],
      },
      {
        h2: "Pełny dubel refrenu",
        paragraphs: [
          "Refren często nagrywa się w całości dwa lub trzy razy. Warstwy rozkłada się lekko w lewo i w prawo, a główny wokal zostaje na środku. Dzięki temu refren brzmi szeroko i wyróżnia się na tle zwrotek.",
        ],
      },
      {
        h2: "Adlibsy",
        paragraphs: [
          "Adlibsy to krótkie wstawki między wersami: okrzyki, powtórzenia, komentarze. Nagrywaj je na osobnej ścieżce, ciszej niż główny wokal i najlepiej z innym ustawieniem w panoramie.",
        ],
      },
      {
        h2: "Jak to zrobić w Studiu",
        paragraphs: [
          "Każdą warstwę nagrywasz na osobnej ścieżce. Dubel ustaw ciszej niż główny wokal i rozłóż w panoramie, a adlibsy jeszcze ciszej. W Studiu BitRymDym dodajesz ścieżki (ich liczba zależy od planu), ustawiasz głośność i panoramę, a BITEK proponuje mix całości.",
        ],
      },
    ],
    faq: [
      {
        q: "Co to jest dubel w rapie?",
        a: "Dodatkowe nagranie tego samego tekstu (całego albo końcówek) pod głównym wokalem, które wzmacnia i poszerza brzmienie.",
      },
      {
        q: "Jak głośno ustawić dubel?",
        a: "Wyraźnie ciszej niż główny wokal — dubel ma wspierać, nie konkurować.",
      },
      {
        q: "Czy dublować całe zwrotki?",
        a: "Zwykle nie. W zwrotkach dubluje się końcówki i akcenty, a w całości — refren.",
      },
    ],
    beats: null,
    cta: [
      { href: "/studio-nagran-online", label: "Nagraj w Studiu" },
      { href: "/poradniki/jak-zmiksowac-wokal", label: "Jak zmiksować wokal" },
    ],
  },
  {
    slug: "jak-zaczac-rapowac",
    datePublished: "2026-11-23",
    navLabel: "Jak zacząć rapować",
    metaTitle: "Jak zacząć rapować — pierwsze kroki dla początkujących",
    metaDescription:
      "Jak zacząć rapować od zera: słuchanie, pierwszy tekst, ćwiczenie flow z metronomem, nagranie pierwszej zwrotki na darmowym bicie. Plan na pierwsze tygodnie.",
    h1: "Jak zacząć rapować",
    lead: "Nie potrzebujesz studia ani drogiego sprzętu. Potrzebujesz bitu, kartki i nawyku. Oto prosty plan na pierwsze tygodnie — od pierwszego wersu do pierwszej nagranej zwrotki.",
    sections: [
      {
        h2: "Słuchaj świadomie",
        paragraphs: [
          "Wybierz kilku raperów, których lubisz, i słuchaj ich numerów z tekstem przed oczami. Zwracaj uwagę, gdzie oddychają, które sylaby akcentują i jak rymy układają się w wersie. To najszybsza szkoła flow.",
          "Rapuj razem z nagraniem, a potem spróbuj sam na tym samym bicie. Szybko poczujesz, ile sylab mieści się w takcie.",
        ],
      },
      {
        h2: "Pierwszy tekst: krótko i konkretnie",
        paragraphs: [
          "Zacznij od 8 wersów, nie od całego numeru. Jeden temat, konkretne obrazy, proste rymy. Lepiej skończyć krótką zwrotkę niż utknąć na długiej.",
          "Gdy brakuje słowa, sięgnij po słownik rymów — ale wybieraj rymy, które pasują do sensu, a nie tylko brzmią.",
        ],
      },
      {
        h2: "Ćwicz rytm codziennie",
        paragraphs: [
          "Kwadrans dziennie daje więcej niż dwie godziny raz w tygodniu. Włącz metronom albo bit w tempie 85–95 BPM i rapuj swoją zwrotkę, aż każdy wers trafia w takt. Potem przyspiesz o kilka BPM.",
          "Licz sylaby w wersach — jeśli jeden jest dużo dłuższy od reszty, tam będziesz się spieszyć.",
        ],
      },
      {
        h2: "Nagraj się wcześnie",
        paragraphs: [
          "Własny głos z nagrania brzmi na początku dziwnie — to normalne. Nagrywaj się od pierwszego tygodnia: dopiero na nagraniu słychać, co poprawić. W BitRymDym wybierzesz darmowy bit i nagrasz zwrotkę w przeglądarce, bez instalowania programów.",
        ],
      },
    ],
    faq: [
      { q: "Czy do rapowania potrzebny jest talent?", a: "Pomaga, ale najwięcej daje regularne ćwiczenie: słuchanie, pisanie i nagrywanie. Flow i dykcję wyrabia się jak każdą umiejętność." },
      { q: "Od jakiego tempa bitu zacząć?", a: "Od wolniejszych bitów, około 80–95 BPM. Łatwiej w nich zmieścić wersy i zapanować nad oddechem." },
      { q: "Jaki sprzęt na start?", a: "Wystarczą słuchawki i mikrofon w telefonie albo prosty mikrofon USB. Słuchawki są ważne, żeby bit nie wchodził do nagrania." },
    ],
    beats: "free",
    cta: [
      { href: "/darmowe-bity-do-rapu", label: "Wybierz pierwszy bit" },
      { href: "/narzedzia/metronom-online", label: "Metronom online" },
    ],
  },
  {
    slug: "rymy-wielokrotne",
    datePublished: "2026-11-23",
    navLabel: "Rymy wielokrotne",
    metaTitle: "Rymy wielokrotne w rapie — jak je pisać, z przykładami",
    metaDescription:
      "Czym są rymy wielokrotne (wielosylabowe) i wewnętrzne, jak je budować krok po kroku i jak szukać ich w słowniku rymów. Przykłady i ćwiczenia dla raperów.",
    h1: "Rymy wielokrotne w rapie",
    lead: "Rym wielokrotny to rym na kilku sylabach naraz — właśnie on sprawia, że wers „siada” i brzmi technicznie. Zobacz, jak go zbudować i jak ćwiczyć.",
    sections: [
      {
        h2: "Czym jest rym wielokrotny",
        paragraphs: [
          "W rymie prostym zgadza się końcówka jednego słowa: „noga — droga”. W rymie wielokrotnym zgadzają się samogłoski kilku kolejnych sylab, np. „ulica nocą — mi pomoc”. Słuchacz łapie powtarzający się układ dźwięków, nawet gdy pisownia jest zupełnie inna.",
          "Liczy się brzmienie, nie litery: „ó” i „u” brzmią tak samo, a końcówka „-ą” często rymuje się z „-om”.",
        ],
      },
      {
        h2: "Jak budować rym krok po kroku",
        paragraphs: [
          "Weź mocne słowo kończące wers i wypisz jego samogłoski od akcentowanej sylaby, np. „kaŁAMarz” → a-a-a. Teraz szukaj słów i zbitek słów o tym samym układzie samogłosek: „parasol”, „na zawsze”, „mam ją w garść”.",
          "Zbitki dwóch–trzech słów dają najwięcej możliwości. Rym nie musi mieścić się w jednym słowie.",
        ],
      },
      {
        h2: "Rymy wewnętrzne i łańcuchy",
        paragraphs: [
          "Rym wewnętrzny pojawia się w środku wersu, a nie tylko na końcu. Gdy ten sam układ dźwięków powtarzasz kilka razy w kolejnych wersach, powstaje łańcuch rymów — charakterystyczny dla technicznego rapu.",
          "Nie przesadzaj: tekst wypchany rymami bez sensu męczy. Najpierw treść, potem technika.",
        ],
      },
      {
        h2: "Gdzie szukać rymów",
        paragraphs: [
          "Słownik rymów BitRymDym pokazuje rymy wielosylabowe, dokładne i niedokładne do ponad 40 tysięcy polskich słów — zaczynając od tych najczęściej używanych. To dobry punkt startu, a resztę dopisze ucho.",
        ],
      },
    ],
    faq: [
      { q: "Czym różni się rym dokładny od wielokrotnego?", a: "Rym dokładny dotyczy końcówki jednego słowa. Wielokrotny obejmuje kilka sylab naraz, często w kilku słowach." },
      { q: "Czy rym niedokładny jest błędem?", a: "Nie. W rapie rymy niedokładne (inna samogłoska pod akcentem, ta sama końcówka) są powszechne i często brzmią naturalniej." },
      { q: "Jak ćwiczyć rymy wielokrotne?", a: "Wybierz jedno słowo dziennie i wypisz do niego 10 rymów na 2–3 sylabach, także zbitek kilku słów. Potem użyj najlepszych w czterech wersach." },
    ],
    beats: null,
    cta: [
      { href: "/rymy", label: "Słownik rymów" },
      { href: "/poradniki/jak-napisac-tekst-rapowy", label: "Jak napisać tekst rapowy" },
    ],
  },
  {
    slug: "oddech-w-rapie",
    datePublished: "2026-11-23",
    navLabel: "Oddech w rapie",
    metaTitle: "Oddech w rapie — jak oddychać i nie tracić tchu na zwrotce",
    metaDescription:
      "Jak oddychać, rapując: planowanie oddechów w tekście, ćwiczenia przeponowe, dykcja i nagrywanie zwrotki w częściach. Praktyczne porady dla raperów.",
    h1: "Oddech w rapie",
    lead: "Brak tchu w połowie zwrotki to jeden z najczęstszych problemów na początku. Dobra wiadomość: oddech da się zaplanować i wyćwiczyć.",
    sections: [
      {
        h2: "Zaplanuj oddechy w tekście",
        paragraphs: [
          "Przeczytaj zwrotkę na głos z bitem i zaznacz w tekście miejsca, w których bierzesz oddech — np. ukośnikiem. Zwykle to koniec wersu albo co drugi wers. Jeśli wers jest tak długi, że nie ma gdzie odetchnąć, skróć go.",
          "Krótki „podkradany” oddech przez usta między frazami wystarcza, jeśli jest regularny.",
        ],
      },
      {
        h2: "Ćwiczenia oddechowe",
        paragraphs: [
          "Oddychaj przeponą: przy wdechu brzuch idzie do przodu, ramiona się nie unoszą. Ćwicz długi, równy wydech na „sss” — zacznij od 15 sekund i wydłużaj.",
          "Rapuj zwrotkę, idąc albo wchodząc po schodach. Gdy dasz radę w ruchu, przy mikrofonie będzie łatwiej.",
        ],
      },
      {
        h2: "Dykcja i tempo",
        paragraphs: [
          "Gdy połykasz końcówki, zwykle rapujesz za szybko jak na swój oddech. Zwolnij metronom o 5–10 BPM, wyćwicz tekst wyraźnie, a potem wróć do tempa bitu.",
          "Ćwicz łamańce językowe i trudne zbitki spółgłosek z tekstu osobno, zanim nagrasz całość.",
        ],
      },
      {
        h2: "Nagrywaj w częściach",
        paragraphs: [
          "Nie musisz nagrać 16 wersów na jednym oddechu. Profesjonaliści często nagrywają zwrotkę po 4–8 wersów i sklejają ujęcia. W Studiu BitRymDym nagrasz kilka ujęć, przytniesz je i ułożysz na osi czasu.",
        ],
      },
    ],
    faq: [
      { q: "Jak nie tracić tchu podczas rapowania?", a: "Zaplanuj oddechy w tekście, skróć zbyt długie wersy, ćwicz oddech przeponowy i na początek nagrywaj zwrotkę w częściach." },
      { q: "Oddychać nosem czy ustami?", a: "Podczas rapowania szybkie wdechy bierze się zwykle ustami — są krótsze i cichsze w nagraniu niż głośne wdechy nosem." },
      { q: "Czy wdechy słychać w nagraniu?", a: "Trochę tak i to naturalne. Zbyt głośne wdechy można ściszyć w miksie albo wyciąć między ujęciami." },
    ],
    beats: "free",
    cta: [
      { href: "/narzedzia/metronom-online", label: "Ćwicz z metronomem" },
      { href: "/studio-nagran-online", label: "Nagraj zwrotkę w częściach" },
    ],
  },
  {
    slug: "ile-sylab-w-wersie",
    datePublished: "2026-11-23",
    navLabel: "Ile sylab w wersie",
    metaTitle: "Ile sylab w wersie rapowym — jak liczyć sylaby pod bit",
    metaDescription:
      "Ile sylab mieści się w wersie przy danym tempie bitu, jak liczyć sylaby w tekście rapowym i wyrównać wersy w zwrotce. Darmowy licznik sylab online.",
    h1: "Ile sylab w wersie rapowym",
    lead: "Nie ma jednej poprawnej liczby, ale są dobre punkty odniesienia. Zobacz, jak tempo bitu wpływa na długość wersu i jak wyrównać zwrotkę.",
    sections: [
      {
        h2: "Tempo bitu a długość wersu",
        paragraphs: [
          "Wers to zwykle jeden takt, czyli cztery uderzenia. Przy bitach 85–95 BPM w takcie mieści się wygodnie około 10–14 sylab, przy szybkim flow nawet 16 i więcej. Przy trapie liczonym w half-time (np. 140 BPM czuje się jak 70) wersy bywają krótsze, ale gęściej „sypane”.",
          "Ważniejsza od samej liczby jest powtarzalność: wersy o podobnej długości łatwiej rapować równo.",
        ],
      },
      {
        h2: "Jak liczyć sylaby po polsku",
        paragraphs: [
          "Sylabę tworzy samogłoska: a, ą, e, ę, i, o, ó, u, y. Litera „i” przed inną samogłoską tylko zmiękcza spółgłoskę — „nie”, „się”, „pierwszy” mają odpowiednio 1, 1 i 2 sylaby.",
          "Licznik sylab BitRymDym robi to za Ciebie: wklejasz tekst, a przy każdym wersie widzisz liczbę sylab i odchylenie od średniej zwrotki.",
        ],
      },
      {
        h2: "Wyrównaj zwrotkę",
        paragraphs: [
          "Wersy, które odstają o 3–4 sylaby od reszty, to kandydaci do skrócenia albo rozłożenia na dwa takty. Czasem wystarczy zmienić jedno słowo na krótszy synonim.",
          "Pamiętaj o pauzach: celowe przerwy i akcenty też są częścią flow. Licznik jest wskazówką, nie wyrocznią — decyduje ucho na bicie.",
        ],
      },
    ],
    faq: [
      { q: "Ile sylab powinien mieć wers rapowy?", a: "Przy tempie 85–95 BPM zwykle 10–14 sylab na takt. Najważniejsze, żeby wersy w zwrotce miały podobną długość." },
      { q: "Jak policzyć sylaby w tekście?", a: "Policz samogłoski, pomijając „i” przed inną samogłoską. Najszybciej zrobisz to w darmowym liczniku sylab online." },
      { q: "Co zrobić z za długim wersem?", a: "Skróć go synonimem, usuń zbędne słowo albo rozłóż na dwa takty." },
    ],
    beats: "free",
    cta: [
      { href: "/narzedzia/licznik-sylab", label: "Licznik sylab online" },
      { href: "/narzedzia/licznik-bpm", label: "Sprawdź BPM bitu" },
    ],
  },
];

export function guidePath(slug: string): string {
  return `${GUIDE_BASE}/${slug}`;
}

export function findGuide(slug: string): Guide | null {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}
