/**
 * Freestyle topics and words (pure, client-safe) for /narzedzia/tematy-do-freestyle.
 * Own lists: everyday topics without names of people or brands.
 */
export const FREESTYLE_TOPICS: readonly string[] = [
  "Pierwszy dzień w nowej pracy", "Kolejka do lekarza", "Nocny autobus", "Poniedziałek o szóstej rano", "Zgubiony telefon",
  "Winda, która stanęła", "Sąsiad z wiertarką", "Ostatnie dziesięć złotych", "Wakacje pod namiotem", "Pies, który rządzi domem",
  "Mecz na podwórku", "Egzamin na prawko", "Deszcz bez parasola", "Remont bez końca", "Zakupy przed świętami",
  "Randka w ciemno", "Stara fotografia", "Kłótnia o pilota", "Przeprowadzka na czwarte piętro", "Kawa na wynos",
  "Pociąg, który się spóźnił", "Szkolna wycieczka", "Pierwsze nagranie w domu", "Mikrofon, który nie działa", "Bit, który wciąga",
  "Miasto o trzeciej w nocy", "Powrót na stare osiedle", "Ławka pod blokiem", "Koleżka, który zawsze się spóźnia", "Wygrana w totka",
  "Dieta od jutra", "Siłownia w styczniu", "Komputer, który się zawiesza", "Internet bez zasięgu", "Sto nieprzeczytanych wiadomości",
  "Marzenie z dzieciństwa", "Rada dla młodszego siebie", "Gdybym miał milion", "Gdybym był niewidzialny", "Świat bez telefonów",
  "Podróż w czasie", "Kosmita na osiedlu", "Robot, który rapuje", "Supermoc, której nikt nie chce", "Dzień na odwrót",
  "Zima stulecia", "Lato w mieście", "Burza nad jeziorem", "Wschód słońca po imprezie", "Las po zmroku",
  "Babcine obiady", "Kebab po północy", "Przypalona jajecznica", "Pizza na pół", "Lodówka pełna niczego",
  "Najlepszy przyjaciel", "Zaufanie", "Zazdrość", "Duma", "Cierpliwość",
  "Odwaga", "Porażka, która czegoś uczy", "Sukces po latach", "Plotka z klatki obok", "Obietnica",
  "Cisza przed burzą", "Trema przed sceną", "Pierwszy koncert", "Bitwa freestyle", "Publiczność, która milczy",
  "Trasa koncertowa", "Nocna sesja w studiu", "Refren, który nie wychodzi", "Zapomniany tekst", "Rym, którego brakuje",
  "Rower bez hamulców", "Stary samochód", "Korek na obwodnicy", "Taksówkarz filozof", "Ostatni tramwaj",
  "Szef, który wie lepiej", "Nadgodziny", "Urlop na żądanie", "Wypłata i rachunki", "Własna firma",
  "Szachy w parku", "Gra do rana", "Przegrana w karty", "Kolekcjoner rzeczy zbędnych", "Skarb na strychu",
  "Lustro", "Cień", "Zegar, który stoi", "Klucz bez zamka", "List bez adresu",
  "Most", "Schody donikąd", "Drzwi numer trzynaście", "Balkon z widokiem", "Piwnica",
];

export const FREESTYLE_WORDS: readonly string[] = [
  "beton", "neon", "parasol", "rakieta", "cytryna", "zegarek", "kaseta", "latarnia", "plecak", "burza", "młotek", "dywan",
  "gazeta", "herbata", "kompas", "lodówka", "mikrofon", "nożyczki", "okulary", "piorun", "radio", "samolot", "tramwaj", "uśmiech",
  "wiadro", "zapałka", "balkon", "czapka", "drabina", "ekran", "fotel", "gitara", "hamak", "igła", "jezioro", "kaktus",
  "labirynt", "maska", "nagroda", "ogień", "paragon", "rower", "skarb", "talerz", "ulica", "wiatr", "zamek", "bilet",
  "cegła", "dach", "echo", "farba", "grosz", "huśtawka", "iskra", "jabłko", "kieszeń", "lustro", "mgła", "nuta",
  "okno", "pilot", "rękawica", "schody", "tunel", "umowa", "walizka", "znaczek", "armata", "bęben", "chmura", "diament",
  "elewacja", "flaga", "głośnik", "horyzont", "impreza", "kanapka", "klucz", "kropla", "lampa", "magnes", "most", "namiot",
  "ołówek", "papuga", "piasek", "plakat", "poduszka", "popcorn", "rachunek", "rekin", "ryba", "sandał", "serce", "skarpeta",
  "smok", "sól", "sprężyna", "statek", "sygnał", "szachy", "szklanka", "śruba", "śnieg", "taśma", "trąbka", "tygrys",
  "wersja", "wieża", "winda", "wulkan", "zakręt", "zderzak", "zeszyt", "żaba", "żarówka", "żelazko", "kawa", "krzesło",
  "pająk", "karuzela", "pociąg", "księżyc", "podwórko", "słuchawki", "refren", "trzepak", "korona", "lina", "cień", "kurtka",
];

/** Fisher–Yates; `random` is injectable for tests. */
export function shuffled<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Takes `count` items from the bag; refills (reshuffled) when it runs out, so nothing repeats before the list ends. */
export function draw<T>(bag: readonly T[], source: readonly T[], count: number, random: () => number = Math.random): { picked: T[]; bag: T[] } {
  let rest = [...bag];
  if (rest.length < count) rest = shuffled(source, random);
  return { picked: rest.slice(0, count), bag: rest.slice(count) };
}
