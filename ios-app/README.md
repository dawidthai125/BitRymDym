# BitRymDym – aplikacja iOS (Capacitor)

Natywna „skorupka” iOS dla www.bitrymdym.pl. Aplikacja to `WKWebView` (Capacitor 8.6.2), które **zawsze startuje z
`https://www.bitrymdym.pl/?app=ios`**. Middleware strony ustawia wtedy ciasteczko `brd_app=ios` (12 h, odnawiane przy
każdym starcie) i włącza „tryb aplikacji ze sklepu”: znikają ceny, przyciski kupowania i linki do planów, a API checkoutu
odmawia (`STORE_APP`). To wymóg App Store (wytyczna 3.1.1 – brak płatności za treści cyfrowe poza In-App Purchase).
Logika trybu: `src/lib/site/store-app.ts` (wspólna z aplikacją Android TWA, `android-twa/`).

## Co jest w katalogu

| Plik | Rola |
| --- | --- |
| `package.json`, `package-lock.json` | Zależności **tylko** aplikacji iOS (Capacitor core/ios/cli 8.6.2, splash-screen 8.0.2). Nie dotyczą głównej aplikacji Next.js. |
| `capacitor.config.ts` | `appId` `pl.bitrymdym.app`, `appName` `BitRymDym`, `server.url` = start URL, `allowNavigation` dla `www.bitrymdym.pl` / `bitrymdym.pl`, `errorPath` = strona offline. |
| `www/index.html`, `www/logo.png` | Lokalny fallback offline („Brak połączenia” + „Spróbuj ponownie” → start URL; automatycznie po powrocie sieci). |
| `resources/AppIcon-1024.png` | Ikona 1024×1024, RGB **bez kanału alfa**, symbol BRD na tle `#0E0C0A`. |
| `resources/splash-2732x2732.png` | Ekran startowy: tło `#0E0C0A` + symbol. |
| `tools/generate-assets.mjs` | Generuje powyższe grafiki z `public/brand/` (`node ios-app/tools/generate-assets.mjs` z katalogu głównego; sharp z głównego `node_modules`). |
| `scripts/patch-ios.sh` | Po `npx cap add ios` (macOS): Info.plist + ustawienia projektu + ikona/splash. |
| `scripts/asc-app-id.mjs` | Sprawdza przez App Store Connect API, czy istnieje rekord aplikacji dla bundle ID. |
| `ExportOptions.plist` | Eksport IPA: `app-store-connect`, podpis ręczny, profil „BitRymDym App Store”. |
| `.github/workflows/ios-app.yml` | Build w GitHub Actions (macOS 26, Xcode 26.x). |

Katalog `ios/` (projekt Xcode) **nie jest w repo** – generuje go CI (`npx cap add ios` → `patch-ios.sh` → `npx cap sync ios`),
bo lokalnie nie ma Maca. Wszystkie zmiany natywne trzymamy jako konfigurację + skrypt patchujący.

## Ustawienia aplikacji (patch-ios.sh)

- `CFBundleDisplayName` = BitRymDym, `CFBundleDevelopmentRegion` = pl
- Wersja `1.0.0` (`APP_VERSION` w workflow), build = `github.run_number`
- `NSMicrophoneUsageDescription` = „BitRymDym używa mikrofonu do nagrywania Twojego wokalu w Studiu.”
- `ITSAppUsesNonExemptEncryption` = NO (tylko HTTPS systemowe → brak pytań o eksport szyfrowania)
- Tylko iPhone (`TARGETED_DEVICE_FAMILY = 1`), tylko portret. Na iPadzie działa w trybie zgodności iPhone, więc w App Store
  Connect nie trzeba zrzutów z iPada. Wersję na iPada (wszystkie orientacje) można dodać później.
- `UIRequiredDeviceCapabilities` = arm64 (szablon Capacitora miał przestarzałe armv7), minimalny iOS 15.0 (wymóg Capacitora 8;
  Apple od 9.09.2026 wymaga minimum iOS 13).

## Mikrofon w WKWebView (Studio) – wniosek

- `getUserMedia` działa w `WKWebView` od iOS 14.3 (MediaRecorder od 14.5) dla stron w bezpiecznym kontekście (HTTPS) – tu
  zdalny `https://www.bitrymdym.pl`, więc warunek spełniony.
- Capacitor 8 sam obsługuje prośbę WebKitu o dostęp (`WebViewDelegationHandler.webView(_:requestMediaCapturePermissionFor:…)`
  → `.grant`), więc nie ma drugiego okna „strona chce użyć mikrofonu”; system pokaże jedno pytanie iOS z tekstem z
  `NSMicrophoneUsageDescription`. Bez tego klucza aplikacja zostałaby zamknięta przy pierwszym dostępie do mikrofonu.
- Capacitor ustawia też `allowsInlineMediaPlayback = true` i `mediaTypesRequiringUserActionForPlayback = []` (odtwarzanie
  bitu bez pełnego ekranu).
- **`WKAppBoundDomains` nie jest potrzebne do mikrofonu.** W WKWebView włączałoby za to Service Workera (PWA cache/offline),
  ale wymaga `limitsNavigationsToAppBoundDomains` i blokuje nawigację/wstrzykiwanie skryptów poza listą domen (max 10).
  W v1 świadomie bez tego – offline obsługuje lokalny `errorPath`. Do rozważenia w kolejnej wersji
  (`WKAppBoundDomains` = `www.bitrymdym.pl`, `bitrymdym.pl` + `ios.limitsNavigationsToAppBoundDomains: true`) po teście logowania.
- Uwaga: Capacitor uznaje za „swoje” tylko adresy zaczynające się od `server.url` (razem z `?app=ios`), dlatego
  `allowNavigation` zawiera domenę – inaczej każda podstrona otwierałaby się w Safari. Linki do innych domen otwierają Safari.
- **Do sprawdzenia na urządzeniu (TestFlight):** nagranie w Studiu, odsłuch w słuchawkach, przerwania (połączenie), powrót z tła.

## Podpis i build (bez Maca)

Wybrany sposób: **ręczny podpis w CI**. Certyfikat i profil zostały utworzone przez App Store Connect API, Xcode w CI tylko
podpisuje przy `-exportArchive` (archiwum budowane bez podpisu – unika problemów z podpisem pakietów SPM).

Dlaczego nie inaczej:
- automatyczne podpisywanie Xcode z kluczem API (`-allowProvisioningUpdates -authenticationKeyPath …`) – pierwszy przebieg
  workflow skończył się błędem `Cloud signing permission error` (klucz API nie ma roli Admin / dostępu do cloud-managed
  certyfikatów),
- nowy certyfikat „Apple Distribution” – limit konta wyczerpany (3 certyfikaty innych aplikacji, których nie ruszamy);
  utworzono więc certyfikat typu **iOS Distribution** (`IOS_DISTRIBUTION`).
- fastlane (match/cert/sigh) nie dawał nic ponad to i dokładał zależność Ruby.

Na koncie Apple (team `QKKYTLZKYD`):
- Bundle ID `pl.bitrymdym.app` (id `437MBTL788`, nazwa BitRymDym, bez dodatkowych capabilities),
- certyfikat iOS Distribution `52CBR57KQY`, ważny do **2027-11-23**,
- profil `IOS_APP_STORE` „BitRymDym App Store” (`3UXPYYFA4C`, UUID `691923ec-ff36-494d-98a6-ca3d99e6fb11`), ważny do 2027-11-23.

Sekrety repo (GitHub → Settings → Secrets → Actions):

| Sekret | Zawartość |
| --- | --- |
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` | Klucz App Store Connect API (P8 jako pełny wieloliniowy PEM). |
| `IOS_DIST_P12_B64`, `IOS_DIST_P12_PASSWORD` | Certyfikat iOS Distribution + klucz prywatny (P12, base64) i hasło. |
| `IOS_PROFILE_B64` | Profil App Store (base64). |
| `IOS_KEYCHAIN_PASSWORD` | Hasło tymczasowego keychaina w CI (losowe). |

Przed 2027-11-23 trzeba odnowić certyfikat i profil (nowy CSR → certyfikat → profil → podmiana 3 sekretów `IOS_*`).

### Workflow `.github/workflows/ios-app.yml`

Uruchamia się przy pushu zmian w `ios-app/**` albo w samym workflow (każda gałąź) oraz ręcznie (`workflow_dispatch` –
przycisk pojawi się w GitHubie dopiero, gdy plik workflow będzie na `main`). Kroki: checkout → Node 24 → wybór
najnowszego stabilnego Xcode 26.x (`macos-26`) → keychain z P12 + profil → `npm ci` → `cap add ios` + `patch-ios.sh` +
`cap sync ios` → `xcodebuild archive` (bez podpisu) → `xcodebuild -exportArchive` (podpis) → weryfikacja `codesign` →
artifact `bitrymdym-ios-1.0.0-<build>` (IPA) → jeśli rekord aplikacji istnieje: `xcrun altool --upload-app` do TestFlight;
jeśli nie – ostrzeżenie i tylko artifact.

Wymóg Apple (Upcoming Requirements, developer.apple.com/news/upcoming-requirements): od **28.04.2026** aplikacje wysyłane do
App Store Connect muszą być zbudowane **Xcode 26+ z iOS 26 SDK**. Build: Xcode 26.6 (17F113), iOS SDK 26.5.

## Co musi zrobić właściciel

1. **Utworzyć rekord aplikacji** w App Store Connect (API nie pozwala: `apps` – `CREATE` niedozwolone):
   Apps → „+” → New App → iOS, nazwa **BitRymDym**, język główny **polski**, Bundle ID **pl.bitrymdym.app**,
   SKU **bitrymdym-ios**, dostęp pełny. Potem uruchomić workflow ponownie (push w `ios-app/**` albo „Re-run”/dispatch) –
   build sam trafi do TestFlight. Przy ponownym uruchomieniu tego samego przebiegu numer buildu się nie zmienia, więc
   lepiej nowy przebieg (nowy `run_number`).
2. TestFlight → testy **wewnętrzne** (bez recenzji): dodać siebie do grupy testerów, zainstalować TestFlight na iPhonie.
   Zgodność eksportowa jest już zadeklarowana w Info.plist.
3. Dopiero po testach na urządzeniu – wypełnić kartę App Store (poniżej). **Wysłanie do recenzji robi właściciel.**

### Karta w App Store Connect

- Kategoria główna: **Muzyka** (dodatkowa opcjonalnie: Rozrywka).
- Polityka prywatności: **https://www.bitrymdym.pl/polityka-prywatnosci**; URL wsparcia: https://www.bitrymdym.pl.
- Ocena wieku: kwestionariusz tak, by wyszło **12+** (np. „rzadkie/łagodne wulgaryzmy lub treści dla dorosłych” – teksty rap;
  treści tworzone przez użytkowników → wymagane zgłaszanie/blokowanie treści i kontakt, co strona powinna mieć).
- Ceny: **darmowa**, **brak zakupów w aplikacji** (żadnych IAP). Pakiety kupowane wyłącznie na stronie – w aplikacji nie ma
  o nich wzmianek ani linków (tryb `brd_app=ios`).
- App Privacy (etykiety prywatności) – uzupełnić zgodnie z tym, co faktycznie zbiera strona, typowo:
  dane kontaktowe (e-mail – konto), treści użytkownika (nagrania audio, teksty), identyfikatory (ID użytkownika),
  dane diagnostyczne/użycia, jeśli działa analityka. Wszystko „powiązane z użytkownikiem”, „nie do śledzenia”
  (jeśli nie ma reklam/trackerów stron trzecich). Mikrofon: nagrania trafiają na serwer tylko po zapisaniu przez użytkownika.
- Konto do recenzji: podać login i hasło konta testowego z dostępem do Studia (bez płatności).
- Zrzuty: iPhone 6,9" (1320×2868 lub 1290×2796) – min. 1, najlepiej 3–5 (strona główna, katalog bitów, Studio z nagrywaniem).

### Notatka dla recenzenta (propozycja)

> BitRymDym to studio do nagrywania rapu: użytkownik wybiera bit z katalogu, nagrywa wokal mikrofonem iPhone'a w Studiu
> i otrzymuje zmiksowany utwór. Mikrofon jest używany wyłącznie po naciśnięciu „Nagrywaj” w Studiu.
> Aplikacja nie sprzedaje treści cyfrowych i nie zawiera linków do płatności – w wersji iOS ceny i zakup są wyłączone.
> Konto testowe: [e-mail] / [hasło]. Ścieżka: zaloguj → Studio → wybierz bit → Nagrywaj (zezwól na mikrofon).

## Ryzyko odrzucenia – wytyczna 4.2 (Minimum Functionality)

Aplikacja jest „opakowaną stroną” – Apple często odrzuca takie aplikacje (4.2 / 4.2.2 „repackaged website”). Argumenty
na naszą korzyść: realna funkcja wymagająca urządzenia (nagrywanie wokalu mikrofonem), konto użytkownika, treści
użytkownika, wygląd dopasowany do iPhone'a. Mimo to ryzyko jest **średnie–wysokie** przy v1 bez funkcji natywnych.
Ryzyko też z 3.1.1 / 3.1.3: aplikacja nie może zachęcać do zakupu poza IAP – to załatwia tryb `brd_app=ios`
(sprawdzić na urządzeniu, że nigdzie nie ma cen, „Kup”, „Pakiety”, maili z linkami do płatności w widokach).

### Pomysły natywne na kolejną wersję

- **Powiadomienia push (APNs)** – „Twój utwór jest gotowy” po mixie/masteringu, nowe bity od producentów.
  Wymaga: capability Push Notifications w bundle ID, klucz APNs (.p8) w Apple Developer, `@capacitor/push-notifications`,
  zapis tokenu urządzenia w Supabase i wysyłka z backendu.
- Natywny ekran nagrywania / monitor odsłuchu przez `AVAudioSession` (niższa latencja, nagrywanie w tle przy zablokowanym ekranie).
- Udostępnianie gotowego utworu przez arkusz systemowy (`@capacitor/share`), zapis do Plików.
- Haptyka przy starcie/stopie nagrania, odliczanie, sterowanie z ekranu blokady (Now Playing) dla odsłuchu.
- Universal Links (`apple-app-site-association`), żeby linki bitrymdym.pl otwierały aplikację; Sign in with Apple, jeśli
  pojawi się logowanie przez Google/Facebook (wymóg 4.8).
- `WKAppBoundDomains` + Service Worker dla szybszego startu i cache.
