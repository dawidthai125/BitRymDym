/**
 * Free tools for rappers (/narzedzia/<slug>): a browser widget + Polish copy aimed at
 * search phrases ("metronom online", "licznik bpm", "licznik sylab"). Everything runs
 * in the browser, no account. Pure, client-safe.
 */
export type ToolSlug = "metronom-online" | "licznik-bpm" | "licznik-sylab";

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
    metaTitle: "Licznik BPM online — sprawdź tempo piosenki lub bitu",
    metaDescription:
      "Darmowy licznik BPM: stukaj tap tempo albo wybierz plik MP3/WAV, a policzymy tempo piosenki w przeglądarce. Plik nie jest nigdzie wysyłany.",
    h1: "Licznik BPM online",
    lead: "Sprawdź tempo piosenki albo bitu na dwa sposoby: stukaj w rytm albo wybierz plik z dysku. Liczymy w Twojej przeglądarce, bez wysyłania pliku.",
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
];

export function toolPath(slug: string): string {
  return `${TOOLS_BASE}/${slug}`;
}

export function toolPage(slug: string): ToolPage | null {
  return TOOL_PAGES.find((t) => t.slug === slug) ?? null;
}
