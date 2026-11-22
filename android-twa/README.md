# BitRymDym — aplikacja Android (Trusted Web Activity)

Aplikacja ze sklepu Google Play to **Trusted Web Activity** (TWA): otwiera stronę
`https://www.bitrymdym.pl/?app=android` w przeglądarce użytkownika (Chrome) na pełnym ekranie, bez paska adresu.
Strona po `?app=android` ustawia ciasteczko trybu aplikacji (bez kupowania).

Nie ma tu własnego kodu Java/Kotlin. `LauncherActivity`, `DelegationService` i reszta pochodzą z biblioteki
[`com.google.androidbrowserhelper:androidbrowserhelper`](https://github.com/GoogleChrome/android-browser-helper).

| Co | Wartość |
|---|---|
| applicationId | `pl.bitrymdym.app` |
| Nazwa | BitRymDym |
| versionCode / versionName | 1 / 1.0.0 |
| compileSdk / targetSdk | 36 (Android 16). Google Play wymaga API 36 dla nowych aplikacji i aktualizacji od 31.08.2026 |
| minSdk | 24 (minimum androidbrowserhelper 2.7.4) |
| AGP / Gradle | 9.5.2 / 9.9.2 (AGP 9.5 wymaga Gradle 9.6 lub nowszego i JDK 17) |
| androidbrowserhelper | 2.7.4 |
| Start URL | `https://www.bitrymdym.pl/?app=android` |
| Kolory pasków i splash | `#0E0C0A` (ciemny motyw strony, `--brd-paper` w `src/styles/tokens.css`) |
| Fallback | Custom Tabs (`FALLBACK_STRATEGY=customtabs`) |

## Uprawnienia

- **Mikrofon:** `RECORD_AUDIO` **nie** jest potrzebne w manifeście. W TWA strona działa w Chrome, a to Chrome ma
  uprawnienie do mikrofonu i sam pyta o zgodę dla strony (`getUserMedia`). Fallback do WebView nie obsługuje
  mikrofonu, więc ustawiamy fallback na Custom Tabs
  ([android-browser-helper#309](https://github.com/GoogleChrome/android-browser-helper/issues/309)).
- **Powiadomienia:** włączona delegacja powiadomień (`DelegationService` z biblioteki, ikonka
  `ic_notification_icon`, `NotificationPermissionRequestActivity`). Na Androidzie 13+ potrzebne jest
  `POST_NOTIFICATIONS`. Web push ze strony pokaże się jako powiadomienie aplikacji BitRymDym.

## Budowanie

Projekt nie ma wrappera Gradle (`gradle-wrapper.jar`). Buduje go GitHub Actions:
`.github/workflows/android-twa.yml`. Workflow rusza po pushu, który zmienia `android-twa/**` albo plik workflow,
oraz ręcznie (`workflow_dispatch`).

```bash
gh workflow run android-twa.yml --ref <gałąź>
gh run watch <id>
gh run download <id> -D /tmp/android-twa-artifacts
```

Artefakt `bitrymdym-android-<sha>` zawiera:

- `app-release-unsigned.aab`: **niepodpisany** bundle do Play Console (najpierw go podpisz),
- `app-debug.apk`: APK podpisany kluczem debug, do szybkiego testu (`adb install app-debug.apk`).

Debug APK nie przejdzie weryfikacji Digital Asset Links, bo `assetlinks.json` nie zna klucza debug. Zobaczysz wtedy
pasek adresu Custom Tab. To normalne. Pełny ekran działa dopiero po podpisaniu kluczem z `assetlinks.json`.

Lokalnie (jeśli masz JDK 17, Android SDK i Gradle 9.9 lub nowszy):

```bash
cd android-twa
gradle bundleRelease assembleDebug
```

Ikony i grafiki do sklepu odtworzysz poleceniem `node android-twa/tools/generate-icons.mjs`. Wymaga `sharp`,
na przykład `NODE_PATH=<repo>/node_modules`.

## Podpisywanie (klucz uploadu, PKCS12, alias `upload`)

Klucz uploadu **nie** trafia do repo ani do GitHub Secrets. AAB podpisujesz lokalnie, na przykład jarsignerem:

```bash
jarsigner -verbose \
  -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore upload-keystore.p12 -storetype PKCS12 \
  -signedjar app-release.aab \
  app-release-unsigned.aab upload

# kontrola
jarsigner -verify -verbose -certs app-release.aab | tail -5
keytool -list -v -keystore upload-keystore.p12 -storetype PKCS12 -alias upload | grep SHA256
```

AAB podpisujesz **jarsignerem**. `apksigner` obsługuje tylko APK. Jeśli potrzebujesz podpisanego APK spoza Play
(na przykład release do testów), zbuduj `assembleRelease` i podpisz go tak:

```bash
zipalign -p -f 4 app-release-unsigned.apk app-release-aligned.apk
apksigner sign --ks upload-keystore.p12 --ks-type PKCS12 --ks-key-alias upload \
  --out app-release.apk app-release-aligned.apk
apksigner verify --print-certs app-release.apk
```

Odcisk SHA-256 klucza uploadu (jest już w `public/.well-known/assetlinks.json`):
`C6:8D:96:7E:8A:69:5D:24:CC:97:19:3A:EC:A3:3D:36:6B:91:B1:AE:5F:E3:DD:08:B2:49:4F:D6:C0:31:42:0D`

## Digital Asset Links: drugi odcisk (klucz podpisywania Google Play)

Przy Play App Signing Google podpisuje aplikację **swoim** kluczem. Telefony instalują wersję z tym podpisem, więc
`assetlinks.json` musi mieć też odcisk klucza Google. Bez niego TWA pokaże pasek adresu.

1. Play Console → aplikacja → **Testowanie i publikowanie → Konfiguracja → Integralność aplikacji → Podpisywanie
   aplikacji** (App signing). Skopiuj „Certyfikat klucza podpisywania aplikacji → odcisk cyfrowy SHA-256”.
2. Dopisz go do tablicy `sha256_cert_fingerprints` w `public/.well-known/assetlinks.json`:

   ```json
   "sha256_cert_fingerprints": [
     "C6:8D:96:7E:8A:69:5D:24:CC:97:19:3A:EC:A3:3D:36:6B:91:B1:AE:5F:E3:DD:08:B2:49:4F:D6:C0:31:42:0D",
     "<ODCISK_KLUCZA_PODPISYWANIA_GOOGLE_PLAY>"
   ]
   ```

3. Wdróż stronę na `main`, potem sprawdź:
   - `curl -sI https://www.bitrymdym.pl/.well-known/assetlinks.json`: ma zwrócić `200` i `application/json`,
     bez przekierowania. Middleware pomija `/.well-known/` (matcher w `src/middleware.ts`), więc tryb przerw
     technicznych tego nie blokuje.
   - Tester Google:
     `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://www.bitrymdym.pl&relation=delegate_permission/common.handle_all_urls`
   - Play Console → **Linki precyzyjne** (Deep links): domena ma mieć status zweryfikowanej.

## Play Console: co wpisać

1. **Utwórz aplikację:** nazwa „BitRymDym”, język domyślny polski, typ: aplikacja, bezpłatna.
2. **Kategoria:** Muzyka i audio. Kontakt: e-mail i strona `https://www.bitrymdym.pl`.
3. **Polityka prywatności:** `https://www.bitrymdym.pl/polityka-prywatnosci`.
4. **Grafiki:** ikona `store/icon-512.png` (512×512) i grafika promocyjna `store/feature-graphic-1024x500.png`.
   Zrzuty ekranu telefonu (co najmniej 2) zrób z aplikacji albo ze strony w trybie mobilnym.
5. **Bezpieczeństwo danych (Data safety).** Odpowiedzi muszą się zgadzać z polityką prywatności. Szkic:
   - zbierane dane: adres e-mail i identyfikator konta (logowanie, Supabase); **nagrania audio** (pliki
     użytkownika: wokale i utwory, przechowywane na serwerze, żeby działało Studio); dane o aktywności w aplikacji
     i diagnostyka, jeśli strona ich używa;
   - cel: działanie aplikacji i zarządzanie kontem; brak reklam; dane **nie** są sprzedawane;
   - szyfrowanie w transmisji: tak (HTTPS); użytkownik może poprosić o usunięcie konta i danych (podaj sposób z
     polityki prywatności);
   - płatności: w aplikacji Android nie ma kupowania (tryb `?app=android`), więc nie deklarujesz danych
     płatniczych z aplikacji.
6. **Klasyfikacja treści:** kwestionariusz IARC. Treści tworzone przez użytkowników (nagrania, teksty), więc
   zaznacz interakcję i udostępnianie treści przez użytkowników.
7. **Grupa docelowa:** 13+ albo 16+, zgodnie z regulaminem.
8. **Reklamy:** nie. **Dostęp do aplikacji:** jeśli część funkcji wymaga logowania, podaj recenzentom konto
   testowe.
9. **Wersja:** najpierw ścieżka testów wewnętrznych (Internal testing). Wgraj podpisany `app-release.aab`, przy
   pierwszym uploadzie zostaw domyślne Play App Signing, potem dopisz drugi odcisk do `assetlinks.json` (wyżej).
   Nowe konta deweloperów prywatnych muszą jeszcze przejść test zamknięty (12 testerów przez 14 dni), zanim
   dostaną produkcję.

## Kolejna wersja

Zwiększ `versionCode` (na przykład 2) i `versionName` w `app/build.gradle.kts`, wypchnij zmianę, pobierz artefakt,
podpisz go tym samym kluczem uploadu i wgraj.
