/* GTEC PRO — Service worker PWA (offline-first shell)
 * Stratégies :
 *  - Navigations (HTML)      : network-first → cache coquille → /offline.html
 *  - Assets GET statiques    : stale-while-revalidate (cache-lui d'abord, MAJ en fond)
 *  - Convex / API cross-origin : jamais intercepté (WebSocket + POST hors scope SW)
 */
const VERSION = "gtec-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;
const OFFLINE_URL = "/offline.html";

// Coquille minimale : cachée à l'installation pour un démarrage instantané / offline.
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/logo.svg",
  "/icon-192.png",
  "/icon-512.png",
  OFFLINE_URL,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll échoue si une URL manque : on prend les URL une à une pour rester tolérant.
      await Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge des caches des anciennes versions.
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => !k.startsWith(`${VERSION}-`))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** N'est PAS un asset statique à mettre en cache long. */
function isInternalAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") ||
      url.pathname === "/logo.svg" ||
      url.pathname.startsWith("/icon-"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Convex (HTTP + WebSocket) et tout cross-origin : laisser passer.
  if (url.origin !== self.location.origin) return;

  // 1) Navigations : network-first, fallback cache puis page offline.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put("/", fresh.clone()).catch(() => {});
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match("/")) ||
            (await cache.match(request)) ||
            (await cache.match(OFFLINE_URL)) ||
            new Response("Hors ligne", { status: 503 })
          );
        }
      })(),
    );
    return;
  }

  // 2) Assets internes : stale-while-revalidate.
  if (isInternalAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => undefined);
        return cached || (await network) || Response.error();
      })(),
    );
  }
  // 3) Tout le reste (ex. /sw.js, /offline.html) : réseau direct.
});

// Message de la page : forcer l'activation immédiate d'une nouvelle version.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
