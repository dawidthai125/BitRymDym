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
];

export function guidePath(slug: string): string {
  return `${GUIDE_BASE}/${slug}`;
}

export function findGuide(slug: string): Guide | null {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}
