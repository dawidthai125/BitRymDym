/*
 * BitRymDym service worker — minimal and safe on purpose.
 *
 * Caches ONLY the static offline page and the app icons. Nothing else: no API,
 * no audio, no user pages (/studio, /account, /admin, /api…), no Next.js chunks.
 * Every request goes to the network as usual; when a page navigation fails because
 * there is no network, the cached /offline page is shown instead.
 * Bump CACHE when the precache list or /offline changes.
 */
const CACHE = "brd-offline-v1";
const OFFLINE_URL = "/offline";
const ICONS = ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];
const PRECACHE = [OFFLINE_URL, ...ICONS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload", credentials: "omit" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("brd-") && key !== CACHE).map((key) => caches.delete(key))))
      // The browser asks for the page itself (real sec-fetch-* headers, no wait for this worker).
      .then(() => (self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => undefined) : undefined))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: always network; the offline page only when the network fails.
  if (request.mode === "navigate") {
    event.respondWith(
      Promise.resolve(event.preloadResponse)
        .then((preloaded) => preloaded || fetch(request))
        .catch(() =>
          caches.match(OFFLINE_URL).then((cached) => cached || new Response("Brak internetu", { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } })),
        ),
    );
    return;
  }

  // App icons: network first, cached copy when offline (used by the offline page).
  if (ICONS.includes(url.pathname)) {
    event.respondWith(fetch(request).catch(() => caches.match(url.pathname)));
  }
  // Everything else: untouched (browser default, no caching here).
});
