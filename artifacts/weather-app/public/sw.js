/*
 * Daymark app-shell service worker.
 *
 * Strategy:
 *  - Navigations: network-first, fall back to the cached shell when offline.
 *  - Hashed static assets (/assets/*): cache-first, they are immutable.
 *  - Everything else — including all Open-Meteo and font requests — is
 *    never intercepted, so live weather data always comes from the network.
 *
 * Update behaviour: CACHE_NAME is versioned; installing the new worker
 * precaches the fresh shell, skipWaiting/claim activate it promptly, and
 * activate deletes every older cache, so stale shells cannot linger.
 */
const CACHE_NAME = "daymark-shell-v1";
const PRECACHE_ASSETS = "__PRECACHE_ASSETS__"; // replaced with the built, hashed asset list by vite.config.ts
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  ...PRECACHE_ASSETS,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Open-Meteo + fonts: network only

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.includes("/assets/")) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    return (
      (await cache.match(request)) ??
      (await cache.match("./index.html")) ??
      Response.error()
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, fresh.clone());
  return fresh;
}
