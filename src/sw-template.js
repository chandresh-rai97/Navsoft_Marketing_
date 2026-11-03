// Cadence service worker (generated at build time from src/sw-template.js).
// Caches only the app's own files (JS, CSS, fonts, icons). Never caches
// Supabase or any API responses, so numbers are always live. Pages always come
// from the network first, so a new deploy is picked up on the next open; when
// offline, an "You're offline" page is shown.
const VERSION = "__VERSION__";
const CACHE = "cadence-" + VERSION;
const PRECACHE = __PRECACHE__;
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("cadence-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isAppFile(url) {
  if (url.origin === self.location.origin) {
    return /^\/(assets|icons|brand)\//.test(url.pathname) ||
      /\.(js|css|woff2?|png|svg|ico|webmanifest)$/.test(url.pathname);
  }
  return FONT_HOSTS.includes(url.hostname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Pages: network first (always the latest version); offline page if that fails.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  // Our own static files and fonts: cache first. Everything else (Supabase,
  // Edge Functions, any API) goes straight to the network and is never stored.
  if (!isAppFile(url) || url.pathname === "/sw.js") return;
  event.respondWith(
    caches.match(req).then((hit) =>
      hit ||
      fetch(req).then((res) => {
        if (res.ok || res.type === "opaque") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
    )
  );
});
