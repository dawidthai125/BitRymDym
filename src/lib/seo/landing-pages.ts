/**
 * Keyword landing pages (pure, client-safe). Polish copy aimed at search phrases
 * ("darmowe bity do rapu", "studio nagrań online", …). Every claim must match the
 * product: free preview without an account (20 s for guests), recording needs an
 * account, Free downloads only watermarked MP3, mastering from Silver, exclusive
 * paid beats leave the catalogue after purchase.
 */

export type LandingBeats = "free" | "paid" | null;

export type LandingLink = { href: string; label: string };

export type LandingPage = {
  slug: string;
  /** <title> (site name is appended by pageMetadata). */
  metaTitle: string;
  /** Meta description, max ~160 chars. */
  metaDescription: string;
  h1: string;
  lead: string;
  sections: { h2: string; paragraphs: string[] }[];
  faq: { q: string; a: string }[];
  /** Which catalogue lane to show under the copy (newest first), or none. */
  beats: LandingBeats;
  cta: LandingLink[];
  /** Store apps (Google Play / App Store) sell nothing: page 404s there. */
  webOnly?: boolean;
  /** Short label for the footer and "see also" links. */
  navLabel: string;
};

export const LANDING_PAGES: readonly LandingPage[] = [
  {
    slug: "darmowe-bity-do-rapu",
    navLabel: "Darmowe bity do rapu",
    metaTitle: "Darmowe bity do rapu — odsłuch za free i nagrywanie online",
    metaDescription:
      "Darmowe bity do rapu: trap, boom bap, lo-fi i hip-hop. Odsłuchaj bez konta, filtruj po BPM i tonacji, a potem nagraj zwrotkę w Studiu online w przeglądarce.",
    h1: "Darmowe bity do rapu",
    lead: "Szukasz darmowego bitu pod zwrotkę? Tu odsłuchasz cały katalog bez zakładania konta, a bit, który siądzie, od razu odpalasz w Studiu online i nagrywasz na nim kawałek.",
    sections: [
      {
        h2: "Darmowe bity, na których od razu nagrasz",
        paragraphs: [
          "Każdy darmowy bit w BitRymDym możesz posłuchać bez konta — gość słyszy 20-sekundowy podgląd, a po zalogowaniu leci cały bit. Bity filtrujesz po gatunku, tempie (BPM) i tonacji, więc szybko znajdziesz coś pod swoje flow.",
          "Różnica względem zwykłych stron z bitami: tutaj nie musisz niczego pobierać ani instalować. Wybierasz bit, zakładasz słuchawki i nagrywasz wokal w Studiu online prosto w przeglądarce.",
        ],
      },
      {
        h2: "Gatunki: trap, boom bap, lo-fi, hip-hop",
        paragraphs: [
          "W katalogu są ciężkie trapy z 808 i rolkami hi-hatów, klasyczny boom bap pod storytelling, ciepłe lo-fi pod spokojną nawijkę i uniwersalne bity hip-hopowe. Każdy gatunek ma swoją stronę z listą bitów, tempem i najczęstszymi tonacjami.",
        ],
      },
      {
        h2: "Co wolno zrobić z kawałkiem na darmowym bicie",
        paragraphs: [
          "Na planie Free pobierzesz gotowy kawałek jako MP3 ze znakiem wodnym — do pokazania znajomym albo wrzucenia do katalogu utworów na stronie. Wersja bez znaku, do wydania i streamingu, jest w planach płatnych. Samego bitu nie pobierzesz, nagrywasz na nim w Studiu. Szczegóły są w poradniku „Jak nagrać utwór”.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy bity są naprawdę darmowe?",
        a: "Tak. Darmowy katalog odsłuchasz i nagrasz na nim zwrotkę bez płacenia. Konto jest potrzebne do nagrywania, a plany płatne dają dłuższe nagrania, więcej ścieżek i pobranie bez znaku wodnego.",
      },
      {
        q: "Czy mogę pobrać sam bit w MP3 lub WAV?",
        a: "Nie. Darmowe bity są do nagrywania w Studiu BitRymDym i w Nagrywarce na Windows. Pobierasz gotowy kawałek, czyli swój wokal na bicie.",
      },
      {
        q: "Jak znaleźć bit w moim tempie?",
        a: "W katalogu bitów każdy bit ma BPM i tonację. Możesz filtrować listę albo wejść na stronę gatunku, gdzie widać zakres tempa.",
      },
      {
        q: "Czy muszę zakładać konto, żeby posłuchać?",
        a: "Nie. Bez konta usłyszysz 20-sekundowy podgląd każdego bitu. Po darmowej rejestracji słuchasz całości i możesz nagrywać.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/beats", label: "Cały katalog darmowych bitów" },
      { href: "/jak-nagrac", label: "Jak nagrać utwór" },
    ],
  },
  {
    slug: "podklady-do-rapu",
    navLabel: "Podkłady do rapu",
    metaTitle: "Podkłady do rapu — bity rap, trap i boom bap online",
    metaDescription:
      "Podkłady do rapu za darmo: bity rap, trap, boom bap i lo-fi z tempem i tonacją. Wybierz podkład, nagraj wokal w przeglądarce i zrób mix z masteringiem.",
    h1: "Podkłady do rapu",
    lead: "Podkład to połowa numeru. Tu znajdziesz podkłady rapowe w różnych klimatach i od razu nagrasz na nich wokal — bez instalowania programów i bez szukania studia.",
    sections: [
      {
        h2: "Jak wybrać dobry podkład pod rap",
        paragraphs: [
          "Zacznij od tempa. Wolniejsze podkłady (około 70–90 BPM) dają miejsce na gęste wersy i storytelling, szybsze trapowe (zapisywane jako 130–160 BPM, z bębnami w połowie tempa) pozwalają na leniwy albo triolowy flow.",
          "Potem tonacja i klimat. Jeśli śpiewasz refren, wybierz podkład w tonacji, w której czujesz się swobodnie. W katalogu BitRymDym przy każdym podkładzie jest BPM i tonacja, więc nie musisz zgadywać.",
        ],
      },
      {
        h2: "Od podkładu do gotowego kawałka",
        paragraphs: [
          "Na stronie bitu nagrywasz próbę, a w Studiu online składasz cały numer: tniesz nagrania, dokładasz dublowanie i refren, a BITEK proponuje mix i mastering. Ty decydujesz, czy zmianę przyjmujesz.",
          "Wolisz nagrywać przy komputerze? Na Windowsa jest darmowa Nagrywarka, która bierze podkłady z tego samego katalogu i wysyła nagrania prosto do Studia.",
        ],
      },
    ],
    faq: [
      {
        q: "Czym różni się podkład od bitu?",
        a: "Niczym — w rapie oba słowa znaczą to samo: muzykę bez wokalu, na której nagrywasz zwrotki i refren.",
      },
      {
        q: "Jakie tempo podkładu wybrać do rapu?",
        a: "Pod gęste wersy i storytelling sprawdza się około 70–95 BPM (boom bap, lo-fi). Trap zapisuje się zwykle jako 130–160 BPM, ale bębny grają w połowie tempa, więc pasuje i do leniwego, i do szybkiego flow.",
      },
      {
        q: "Czy mogę wydać kawałek na podkładzie z BitRymDym?",
        a: "Do publikacji, streamingu i zarabiania potrzebna jest wersja bez znaku wodnego z planu płatnego i podpis autora bitu. Zasady licencji opisuje strona „Jak nagrać utwór”.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/beats", label: "Przeglądaj podkłady" },
      { href: "/studio-nagran-online", label: "Studio nagrań online" },
    ],
  },
  {
    slug: "studio-nagran-online",
    navLabel: "Studio nagrań online",
    metaTitle: "Studio nagrań online w przeglądarce — nagraj rap bez instalowania",
    metaDescription:
      "Studio nagrań online: nagrywaj wokal w przeglądarce, układaj ścieżki, tnij nagrania i zrób mix z masteringiem. Wystarczy mikrofon i słuchawki. Start za darmo.",
    h1: "Studio nagrań online",
    lead: "Studio BitRymDym działa w przeglądarce. Wybierasz bit, nagrywasz głos, układasz ścieżki i dostajesz gotowy, zmasterowany kawałek — bez instalowania i bez wynajmowania studia.",
    sections: [
      {
        h2: "Co potrafi Studio online",
        paragraphs: [
          "Nagrywasz wokal na wybranym bicie, tniesz nagrania, układasz je na osi czasu i dokładasz kolejne ścieżki: dublowanie końcówek, refren, wstawki. Ustawiasz głośność i panoramę ścieżek, a w Studiu są też pianino i nuty.",
          "Mix i mastering przygotowuje BITEK — wyrównuje głośność wokalu z bitem i robi master pod streaming. Każdą propozycję najpierw słyszysz, a potem sam decydujesz, czy ją przyjąć.",
        ],
      },
      {
        h2: "Czego potrzebujesz",
        paragraphs: [
          "Przeglądarki na komputerze lub telefonie, mikrofonu (na start wystarczy USB albo ten ze słuchawek) i słuchawek, żeby bit nie wchodził do nagrania. Przed nagraniem zrób krótką próbę mikrofonu i ustaw poziom tak, żeby głośne wejścia nie przesterowywały.",
          "Długość nagrania, liczba ścieżek i jakość pobrania zależą od planu. Plan Free pozwala zacząć bez płacenia.",
        ],
      },
      {
        h2: "Studio w telefonie i na Windowsie",
        paragraphs: [
          "Stronę możesz zainstalować jak aplikację (PWA) z menu przeglądarki. Na Windowsie jest też Nagrywarka — program, który nagrywa mikrofon przy komputerze i wysyła projekt do Studia online.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy studio nagrań online jest darmowe?",
        a: "Możesz zacząć za darmo na planie Free. Plany płatne dają dłuższe nagrania, więcej ścieżek, pobranie bez znaku wodnego i sam mastering własnego mixu.",
      },
      {
        q: "Czy Studio działa na Macu i telefonie?",
        a: "Tak, Studio działa w przeglądarce. Program Nagrywarka jest na razie tylko na Windows, a na Macu nagrywasz w przeglądarce.",
      },
      {
        q: "Czy muszę umieć miksować?",
        a: "Nie. BITEK proponuje mix i mastering za Ciebie, a Ty tylko słuchasz i akceptujesz albo odrzucasz zmianę.",
      },
    ],
    beats: null,
    cta: [
      { href: "/studio", label: "Otwórz Studio" },
      { href: "/jak-nagrac", label: "Poradnik nagrywania" },
    ],
  },
  {
    slug: "nagrywanie-rapu-w-domu",
    navLabel: "Jak nagrać rap w domu",
    metaTitle: "Jak nagrać rap w domu — nagrywanie wokalu krok po kroku",
    metaDescription:
      "Jak nagrać rap w domu bez studia: mikrofon, słuchawki, wyciszenie pokoju, próba poziomu i nagranie zwrotki w przeglądarce. Poradnik krok po kroku i darmowe bity.",
    h1: "Jak nagrać rap w domu",
    lead: "Do nagrania dobrej zwrotki nie potrzebujesz drogiego studia. Wystarczy cichy pokój, mikrofon, słuchawki i kilka prostych zasad.",
    sections: [
      {
        h2: "Sprzęt na start",
        paragraphs: [
          "Mikrofon USB to najprostszy wybór — podłączasz i nagrywasz. Na początek wystarczy nawet mikrofon ze słuchawek. Ważniejsze od sprzętu są słuchawki: nagrywaj w nich, żeby bit nie przenikał do mikrofonu.",
        ],
      },
      {
        h2: "Wycisz pomieszczenie",
        paragraphs: [
          "Goła ściana odbija dźwięk i daje pogłos. Koc, zasłony, kanapa albo szafa z ciuchami za plecami gaszą odbicia lepiej niż pianki z internetu. Nagrywaj w najcichszym pokoju, z dala od okna i lodówki.",
        ],
      },
      {
        h2: "Poziom i nagranie",
        paragraphs: [
          "Stań około dłoni od mikrofonu i ustaw głośność wejścia tak, żeby najgłośniejsze wejścia nie przesterowywały. Lepiej trochę ciszej niż za głośno — przester zostaje w nagraniu na zawsze.",
          "Nagraj kilka podejść i wybierz najlepsze. W Studiu BitRymDym masz od tego przycisk „Nagraj ponownie”, a Nagrywarka na Windows po każdym nagraniu ocenia poziom (przester, cicho, dobry poziom).",
        ],
      },
      {
        h2: "Mix i master",
        paragraphs: [
          "Surowy wokal brzmi płasko — dopiero mix z kompresją, korekcją i pogłosem i master pod streaming robią z niego kawałek. W BitRymDym propozycję mixu i masteringu przygotowuje BITEK, a Ty decydujesz, czy ją przyjąć.",
        ],
      },
    ],
    faq: [
      {
        q: "Jaki mikrofon do nagrywania rapu w domu?",
        a: "Na start wystarczy mikrofon USB. Liczy się bardziej ciche pomieszczenie, odległość od mikrofonu i nagrywanie w słuchawkach niż drogi sprzęt.",
      },
      {
        q: "W jakim programie nagrać rap?",
        a: "Możesz nagrywać w przeglądarce w Studiu BitRymDym, bez instalowania. Na Windowsie jest też darmowa Nagrywarka BitRymDym: nagrywa prosto z mikrofonu do pliku WAV, sama wyrównuje głos do bitu i pamięta opóźnienie dla Twojego sprzętu, a nagrania zostają na komputerze, gdy sieć się urwie.",
      },
      {
        q: "Skąd wziąć bit do nagrania?",
        a: "Z darmowego katalogu bitów BitRymDym — odsłuchasz je bez konta i nagrasz na nich zwrotkę od razu w Studiu.",
      },
    ],
    beats: "free",
    cta: [
      { href: "/jak-nagrac", label: "Pełny poradnik i limity planów" },
      { href: "/darmowe-bity-do-rapu", label: "Darmowe bity do rapu" },
    ],
  },
  {
    slug: "mix-i-mastering-online",
    navLabel: "Mix i mastering online",
    metaTitle: "Mix i mastering online — master pod Spotify i YouTube (−14 LUFS)",
    metaDescription:
      "Mix i mastering online w przeglądarce: BITEK wyrówna wokal z bitem i zrobi master pod streaming (−14 LUFS). Możesz też wrzucić gotowy mix WAV/MP3 do masteringu.",
    h1: "Mix i mastering online",
    lead: "Nagrałeś zwrotkę i brzmi surowo? W BitRymDym mix i mastering robisz w przeglądarce — dla nagrań ze Studia albo dla własnego, gotowego mixu.",
    sections: [
      {
        h2: "Mix wokalu z bitem",
        paragraphs: [
          "Po nagraniu w Studiu poproś BITKA o propozycję mixu. Wyrówna głośność wokalu z bitem i przygotuje master pod streaming. Najpierw słyszysz efekt, potem sam decydujesz, czy go przyjąć — nic nie zmienia się bez Twojej zgody.",
        ],
      },
      {
        h2: "Mastering pod streaming",
        paragraphs: [
          "Master przygotowujemy pod platformy streamingowe. Sam mastering celuje w −14 LUFS, czyli głośność, na którą normalizują Spotify czy YouTube. Dzięki temu kawałek nie zostanie ściszony ani nie zabrzmi ciszej od innych.",
          "Masz już gotowy mix z innego programu? Na stronie „Sam mastering” (od planu Silver) wrzucasz plik stereo WAV lub MP3, słuchasz podglądu mastera, zatwierdzasz go i pobierasz: MP3 w planie Silver, WAV w planie Gold.",
        ],
      },
    ],
    faq: [
      {
        q: "Ile LUFS powinien mieć master?",
        a: "Pod streaming najczęściej celuje się w około −14 LUFS. Na tyle ustawiony jest Sam mastering w BitRymDym.",
      },
      {
        q: "Czy mogę zmasterować utwór nagrany gdzie indziej?",
        a: "Tak, od planu Silver. Wrzucasz gotowy mix stereo WAV lub MP3 na stronie „Sam mastering” i pobierasz master: MP3 w planie Silver, WAV w planie Gold.",
      },
      {
        q: "Czy mix robi się automatycznie?",
        a: "BITEK proponuje mix i mastering, ale stosujesz je dopiero, gdy je zaakceptujesz.",
      },
    ],
    beats: null,
    cta: [
      { href: "/mastering", label: "Sam mastering" },
      { href: "/studio", label: "Otwórz Studio" },
    ],
  },
  {
    slug: "program-do-nagrywania-rapu",
    navLabel: "Program do nagrywania rapu",
    metaTitle: "Program do nagrywania rapu na Windows — darmowa Nagrywarka",
    metaDescription:
      "Darmowy program do nagrywania rapu i wokalu na Windows: Nagrywarka BitRymDym z bitami z katalogu, próbą mikrofonu, wieloma ścieżkami i wysyłką do Studia online.",
    h1: "Program do nagrywania rapu",
    lead: "Nagrywarka BitRymDym to darmowy program na Windows do nagrywania wokalu na bitach z katalogu. Nagrywasz przy komputerze, a numer kończysz w Studiu online.",
    sections: [
      {
        h2: "Co robi Nagrywarka",
        paragraphs: [
          "Logujesz się tym samym kontem co na stronie i wybierasz opublikowany bit. Przed nagraniem robisz próbę mikrofonu, a po nagraniu dostajesz ocenę poziomu: przester, prawie cisza, cicho albo dobry poziom.",
          "Możesz nagrać kilka ścieżek wokalu (do limitu planu), wyciszać je i odsłuchiwać solo, wycinać fragmenty fali i ustawiać głośność i panoramę. Na koniec wysyłasz projekt na konto i otwierasz go w Studiu.",
        ],
      },
      {
        h2: "Instalacja",
        paragraphs: [
          "Instalator pobierzesz po zalogowaniu na stronie. Działa na Windows 10 i 11 (64-bit). Instalator waży 35 MB i nie potrzebuje uprawnień administratora. Jest też wersja bez instalacji: jeden plik Portable.exe (21 MB). Przy pierwszym uruchomieniu program raz pobiera dodatki dźwięku (31 MB). Aktualizuje się sam, a nowa wersja jest obowiązkowa. Na Macu nagrywasz w przeglądarce — wersja na Apple będzie wkrótce.",
        ],
      },
    ],
    faq: [
      {
        q: "Czy program do nagrywania jest darmowy?",
        a: "Tak, Nagrywarka jest darmowa. Działa z tym samym kontem i planem co strona.",
      },
      {
        q: "Czy Nagrywarka robi mix i mastering?",
        a: "Nie. Mix i master przygotowuje BITEK w Studiu na stronie, a Nagrywarka nagrywa czysty wokal.",
      },
      {
        q: "Czy jest wersja na Maca?",
        a: "Jeszcze nie. Na Macu nagrywasz w przeglądarce, na stronie bitu albo w Studiu.",
      },
    ],
    beats: null,
    cta: [
      { href: "/nagrywarka", label: "Pobierz Nagrywarkę" },
      { href: "/studio-nagran-online", label: "Studio nagrań online" },
    ],
  },
  {
    slug: "bity-na-wylacznosc",
    navLabel: "Bity na wyłączność",
    webOnly: true,
    metaTitle: "Bity na wyłączność — kup bit do rapu z plikiem WAV",
    metaDescription:
      "Kup bit do rapu na wyłączność za 19,99 zł: po zakupie znika z katalogu i jest tylko Twój. Pobierasz WAV i nagrywasz na nim w Studiu online.",
    h1: "Bity na wyłączność",
    lead: "Chcesz bit, którego nikt inny nie użyje? W płatnym katalogu BitRymDym każdy bit sprzedajemy tylko raz.",
    sections: [
      {
        h2: "Jak działa zakup na wyłączność",
        paragraphs: [
          "Każdy bit w płatnym katalogu kosztuje 19,99 zł i płacisz za niego jednorazowo przez PayU. Po płatności bit znika z katalogu i trafia tylko do Twojego katalogu — nikt inny nie może go już kupić.",
          "Ze swojego katalogu pobierasz plik WAV i nagrywasz na bicie w Studiu online. W Nagrywarce na Windows nagrasz na nim w Studiu Offline (Gold), z pobranego pliku WAV.",
        ],
      },
      {
        h2: "Najpierw posłuchaj",
        paragraphs: [
          "Każdy bit z płatnego katalogu odsłuchasz przed zakupem. Przy bicie widzisz tempo, tonację i gatunek, więc wiesz, czy pasuje do Twojego numeru.",
        ],
      },
    ],
    faq: [
      {
        q: "Co dostaję po kupnie bitu?",
        a: "Bit na wyłączność: znika z katalogu, pobierasz go jako WAV i nagrywasz na nim w Studiu. W Nagrywarce na Windows — w Studiu Offline (Gold), z pobranego WAV.",
      },
      {
        q: "Czy ktoś inny może kupić ten sam bit?",
        a: "Nie. Bit sprzedajemy tylko raz — po zakupie nie ma go już w katalogu.",
      },
      {
        q: "Jak płacę?",
        a: "Jednorazowo przez PayU, bez zapisywania karty.",
      },
    ],
    beats: "paid",
    cta: [
      { href: "/beats?katalog=platny", label: "Płatny katalog bitów" },
      { href: "/darmowe-bity-do-rapu", label: "Darmowe bity" },
    ],
  },
  {
    slug: "bity-do-freestyle",
    navLabel: "Bity do freestyle",
    metaTitle: "Bity do freestyle — darmowe podkłady do nawijania online",
    metaDescription:
      "Bity do freestyle za darmo: boom bap, trap i lo-fi z podanym BPM. Odpal bit w przeglądarce, wylosuj temat i trenuj nawijkę sam albo na bitwę ze znajomymi.",
    h1: "Bity do freestyle",
    lead: "Wybierz bit, wylosuj temat i nawijaj. Przy każdym podkładzie jest tempo i tonacja, więc szybko znajdziesz taki, na którym czujesz się pewnie.",
    sections: [
      {
        h2: "Jaki bit wybrać do freestyle'u",
        paragraphs: [
          "Na start najlepiej sprawdza się boom bap 80–95 BPM: wyraźny werbel mówi, gdzie jesteś w takcie, a między wersami zostaje miejsce na oddech i wymyślenie rymu. Unikaj na początku bitów z gęstą melodią, bo zabierają uwagę.",
          "Trap zapisywany jako 130–160 BPM też nadaje się do freestyle'u, tylko bębny grają w połowie tempa. Spróbuj najpierw wolnego, oszczędnego flow, a triole dorzuć, gdy już nie gubisz taktu.",
        ],
      },
      {
        h2: "Trening: bit plus losowy temat",
        paragraphs: [
          "Odpal bit w jednej karcie, a w drugiej otwórz losowanie tematów do freestyle'u. Ustaw automatyczną zmianę co 20–30 sekund i nie przerywaj nawijki, nawet gdy nowe hasło nie pasuje do poprzedniego wersu.",
          "Gdy trafisz na wers, który warto zachować, nagraj go od razu. Po darmowej rejestracji słuchasz całych bitów i nagrywasz próbę w przeglądarce, bez instalowania programów.",
        ],
      },
      {
        h2: "Bitwa ze znajomymi",
        paragraphs: [
          "Wybierzcie jeden bit, ustalcie kolejność i liczbę wersów — na przykład po osiem na wejście. Ten sam podkład dla wszystkich jest uczciwszy niż zmiana bitu w trakcie, a tempo podane na stronie pomaga ustalić, ile potrwa runda: osiem taktów przy 90 BPM to około 21 sekund.",
        ],
      },
    ],
    faq: [
      { q: "Jakie tempo bitu jest najlepsze do freestyle'u?", a: "Na początek 80–95 BPM. Werbel jest wtedy wyraźny, a między wersami zostaje czas na wymyślenie rymu." },
      { q: "Czy bity do freestyle są darmowe?", a: "Tak, darmowy katalog. Bez konta usłyszysz 20-sekundowy podgląd, a po darmowej rejestracji cały bit." },
      { q: "Skąd wziąć tematy do freestyle'u?", a: "Z darmowego losowania tematów i słów w dziale Narzędzia. Działa na telefonie i komputerze, bez konta." },
      { q: "Czy mogę nagrać freestyle?", a: "Tak. Po zalogowaniu nagrasz próbę na stronie bitu albo w Studiu online." },
    ],
    beats: "free",
    cta: [
      { href: "/narzedzia/tematy-do-freestyle", label: "Losuj tematy do freestyle" },
      { href: "/beats", label: "Cały katalog bitów" },
    ],
  },
  {
    slug: "autotune-online",
    navLabel: "Autotune online",
    metaTitle: "Autotune online za darmo — strojenie wokalu w przeglądarce",
    metaDescription:
      "Autotune online w przeglądarce: BRD Tune dociąga wokal do tonacji bitu. Łagodne strojenie za darmo w Studiu, twardy efekt trapowy i ręczne nuty w wyższych planach.",
    h1: "Autotune online",
    lead: "W Studiu BitRymDym nastroisz wokal bez wtyczek i instalowania. Efekt BRD Tune dociąga nagrany głos do tonacji bitu, a Ty od razu słyszysz wynik.",
    sections: [
      {
        h2: "Jak działa strojenie wokalu",
        paragraphs: [
          "Strojenie sprawdza, jaką nutę śpiewasz, i przesuwa ją do najbliższej nuty z wybranej tonacji. Dlatego najważniejsza jest dobra tonacja: gdy jest zła, nawet dobre wykonanie zabrzmi fałszywie.",
          "Bity w katalogu BitRymDym mają zapisaną tonację, więc BRD Tune może ją wziąć z bitu. Jeśli bit jej nie ma, Studio spróbuje wykryć ją z dźwięku albo wybierzesz ją ręcznie.",
        ],
      },
      {
        h2: "Naturalnie czy twardo",
        paragraphs: [
          "Styl „Naturalny” poprawia nuty łagodnie i zostawia ruch głosu. Pasuje do śpiewanych refrenów i melodyjnych zwrotek. Styl „Hook” dociąga szybciej, a „Trap” przeskakuje na nutę od razu — to ten charakterystyczny, robotyczny efekt.",
          "Łagodne strojenie jest w każdym planie, także Free. Twardy styl i własne suwaki szybkości oraz siły są od planu Silver, a ręczna korekta pojedynczych nut w planie Gold.",
        ],
      },
      {
        h2: "Krok po kroku w Studiu online",
        paragraphs: [
          "Wybierz bit, nagraj albo wgraj wokal, dodaj na ścieżce efekt strojenia i ustaw tonację bitu. Odsłuchaj z bitem, zmień styl i dopiero potem przejdź do mixu. To, co słyszysz w podglądzie, idzie do gotowego pliku.",
          "Strojenie nie zastąpi dobrego nagrania. Śpiewaj czysto, blisko mikrofonu i bez pogłosu z pokoju — im czyściej, tym mniej słychać samą korektę.",
        ],
      },
    ],
    faq: [
      { q: "Czy autotune online jest darmowy?", a: "Łagodne strojenie wokalu w Studiu jest w każdym planie, także Free. Potrzebne jest konto. Twardy efekt trapowy i własne ustawienia są od planu Silver." },
      { q: "Czy to ten sam program co Auto-Tune?", a: "Nie. BRD Tune to własny efekt strojenia w Studiu BitRymDym, niezwiązany z producentem wtyczki Auto-Tune." },
      { q: "Czy autotune działa przy rapie?", a: "Tak, ale najlepiej przy melodyjnym rapie i refrenach. Przy mówionych, agresywnych wersach lepiej go wyłączyć albo użyć delikatnie." },
      { q: "Skąd wiem, jaka jest tonacja bitu?", a: "W katalogu jest podana przy bicie. Dla własnego pliku sprawdzisz ją w darmowym liczniku BPM i tonacji." },
    ],
    beats: null,
    cta: [
      { href: "/studio-nagran-online", label: "Studio nagrań online" },
      { href: "/narzedzia/licznik-bpm", label: "Sprawdź tonację" },
    ],
  },
];

export function landingPage(slug: string): LandingPage {
  const page = LANDING_PAGES.find((p) => p.slug === slug);
  if (!page) throw new Error(`Unknown landing page: ${slug}`);
  return page;
}

export function landingPath(slug: string): string {
  return `/${slug}`;
}
