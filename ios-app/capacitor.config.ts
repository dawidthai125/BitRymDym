import type { CapacitorConfig } from "@capacitor/cli";

// Aplikacja iOS = WKWebView z żywą stroną. Start ZAWSZE z ?app=ios: middleware strony ustawia
// ciasteczko brd_app=ios (12 h) i ukrywa ceny/kupowanie (App Store: brak płatności poza IAP).
const START_URL = "https://www.bitrymdym.pl/?app=ios";

const config: CapacitorConfig = {
  appId: "pl.bitrymdym.app",
  appName: "BitRymDym",
  webDir: "www",
  backgroundColor: "#0E0C0A",
  server: {
    url: START_URL,
    // Capacitor traktuje jako "swoje" tylko adresy zaczynające się od server.url (razem z ?app=ios),
    // więc bez tej listy każde przejście na inną podstronę otwierałoby Safari.
    allowNavigation: ["www.bitrymdym.pl", "bitrymdym.pl"],
    // Brak sieci / błąd ładowania → lokalny www/index.html z przyciskiem „Spróbuj ponownie”.
    errorPath: "index.html",
  },
  ios: {
    contentInset: "never",
    backgroundColor: "#0E0C0A",
    scrollEnabled: true,
    allowsLinkPreview: false,
    appendUserAgent: "BitRymDymApp/iOS",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: "#0E0C0A",
      showSpinner: false,
    },
  },
};

export default config;
