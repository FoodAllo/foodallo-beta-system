/* FoodAllo Retail App – Service Worker: App-Hülle offline aus dem Cache, Log-Datei immer frisch versuchen. */
var CACHE = "foodallo-retail-v19";   // v19: Texte an Customer und Desktop angeglichen; v18: OpenStreetMap ausgeschrieben in 0021/0027, ODbL mit Link (v17: anzeigename oder name; v16: ungekürzt via anzeigeName)
var HUELLE = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css", "./js/retail.js", "./js/app.js",
  "./daten/artikel.json", "../kern/stammdaten-ausgabestellen.json", "./daten/demo-gutscheine.json", "./daten/anfangsbestand.jsonl", "./daten/demo-rezeptnachweise.json", "./daten/demo-personen.json", "./daten/melderegister-zuordnung.json",
  "../kern/foodallo_kern.js", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon.ico", "./icons/favicon-32.png", "./icons/favicon-48.png",
  "./icons/logo-header.png", "./icons/logo-farbe-900.png", "./icons/logo-weiss-900.png", "./icons/logo-dunkel-900.png",
  "../schema/foodallo-core.schema.v1.2.json"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(HUELLE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (/ereignislog\.jsonl$/.test(url.pathname)) {
    // gemeinsamer Log: nur Netz, nie aus dem Cache (sonst veralteter Stand)
    e.respondWith(fetch(e.request, { cache: "no-store" }).catch(function () {
      return new Response("", { status: 503, statusText: "offline" });
    }));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (treffer) {
    return treffer || fetch(e.request).then(function (antwort) {
      if (antwort.ok) { var kopie = antwort.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, kopie); }); }
      return antwort;
    });
  }));
});
