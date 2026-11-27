/* FoodAllo Customer App — lokaler Service Worker, App-Shell und lokale Daten. */
const CACHE = "foodallo-customer-app-public-8";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/app.css",
  "./js/voucher.js",
  "./js/store.js",
  "./js/ui.js",
  "./js/code39.js",
  "./js/demokarte.js",
  "./js/melderegister.js",
  "./desktop/assets/melderegister.js",
  "./js/app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  "./icons/favicon.ico",
  "./icons/logo-header.png",
  "./icons/logo-login.png",
  "./data/artikel.json",
  "./data/ausgabestellen.json",
  "./data/personen.json",
  "./data/haushalte.json",
  "./data/rezepte.json",
  "./data/bestand-szenario.json",
  "./data/referenz.json",
  "./data/demo-auth.json",
  "./data/einloesung-vorlage.json",
  "./data/gutscheine-shared.json",
  "./data/demo-karte.json",
  "./schema/foodallo-core.schema.json",
  "./kern/foodallo_kern.js",
  "./kern/stammdaten-ausgabestellen.json",
  "./data/ereignislog.jsonl",
  "./data/ereignislog.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function istDynamischeQuelle(url) {
  var path = url.pathname || "";
  return /\/(ereignislog\.(jsonl|js)|referenz\.json|melderegister\.js|demo-becker\.json|demo-karte\.json)$/.test(path);
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (istDynamischeQuelle(url)) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || new Response("Offline", { status: 503, statusText: "Offline" });
        });
      })
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) {
        return cached;
      }
      return fetch(req).then(function (res) {
        if (res && res.ok && url.origin === self.location.origin) {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        }
        return res;
      }).catch(function () {
        if (req.mode === "navigate") return caches.match("./index.html");
        return new Response("Offline", { status: 503, statusText: "Offline" });
      });
    })
  );
});
