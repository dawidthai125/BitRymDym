import type { Metadata } from "next";

/**
 * Offline fallback for the installed app (public/sw.js precaches it and shows it when a
 * page navigation fails without network). Static copy, no data, no site chrome.
 * Inline styles + plain <img>/<a>: offline the CSS/JS chunks are not available,
 * only this HTML and the precached /icons/*.
 */
export const metadata: Metadata = {
  title: "Brak internetu",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main
      data-testid="offline-page"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.25rem",
        padding: "2rem 1.5rem",
        textAlign: "center",
        background: "#0e0c0a",
        color: "#f1e7d3",
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- precached by sw.js, must work offline */}
      <img src="/icons/icon-192.png" alt="BitRymDym" width={96} height={96} style={{ borderRadius: "1.25rem" }} />
      <h1 style={{ margin: 0, fontSize: "1.75rem", lineHeight: 1.15, maxWidth: "22ch" }}>Brak internetu</h1>
      <p style={{ margin: 0, maxWidth: "36ch", lineHeight: 1.5, color: "#cdbfa6" }}>
        BitRymDym potrzebuje sieci do nagrywania i odsłuchu. Złap zasięg albo Wi-Fi i wbijaj z powrotem.
      </p>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload on purpose: offline there is no client router */}
      <a
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          minHeight: "2.75rem",
          padding: "0 1.25rem",
          borderRadius: "0.375rem",
          background: "#f2a93b",
          color: "#0e0c0a",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Spróbuj ponownie
      </a>
    </main>
  );
}
