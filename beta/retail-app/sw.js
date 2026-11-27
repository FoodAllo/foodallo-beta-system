/* FoodAllo Retail App – Service Worker: App-Hülle offline aus dem Cache, Log-Datei immer frisch versuchen. */
var CACHE = "foodallo-retail-v28";   // v28: Lebensmittelkarten der Desktopversion (Meier, Schulze, Zusatzkarten Trinkwasser) zur Laufzeit zugeordnet; v27: FoodAllo-Logo überall in Originalfarbe auf heller Fläche; v26: Grundton Grün (nur Farben, Logo in Originalfarbe, Belege schwarz-weiß); v25: Abgleich Retail → Desktop im selben Browser (foodallo.abgleich.retail.v1, BroadcastChannel foodallo-abgleich); v24: Scan nur mit Prüfziffer und zweifacher Lesung, Karten auf „Gutschein einlösen“, Update sicher (Netz zuerst, Neuladen), Becker-Demo-Ware an allen Ausgabestellen 0001–0006; v23: Kamerascan mit zxing-Rückfall (Plausibilitätsprüfung, Schrägband), Buchungen-Liste neu gesetzt, Demodaten springen in die laufende Woche; v22: v22: Demo-Anfangsbestand Becker bei Netto (nur lokal); v21: v21: Demonstrationskarte Familie Becker einlösbar, Strichcode Code 39; v20: v20: Lebensmittelkarte statt Papierkarte; v19: Texte an Customer und Desktop angeglichen; v18: OpenStreetMap ausgeschrieben in 0021/0027, ODbL mit Link (v17: anzeigename oder name; v16: ungekürzt via anzeigeName)
var HUELLE = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css", "./js/retail.js", "./js/scanner.js", "./js/app.js", "./js/vendor/zxing-library-0.23.0.min.js",
  "./daten/artikel.json", "../kern/stammdaten-ausgabestellen.json", "./daten/demo-gutscheine.json", "./daten/anfangsbestand.jsonl", "./daten/demo-rezeptnachweise.json", "./daten/demo-personen.json", "./daten/desktop-karten.json", "./daten/melderegister-zuordnung.json",
  "../kern/foodallo_kern.js", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-192.png", "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png", "./icons/favicon.ico", "./icons/favicon-32.png", "./icons/favicon-48.png",
  "./icons/logo-header.png", "./icons/logo-farbe-900.png", "./icons/logo-weiss-900.png", "./icons/logo-dunkel-900.png",
  "../schema/foodallo-core.schema.v1.2.json"
];
var OPTIONAL = ["../data/demo-becker.json", "../data/demo-meier.json"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // Demo-Karte Familie Becker: nur vorab speichern, wenn die Datei vorhanden ist
    // cache: "reload" – am HTTP-Cache vorbei, sonst landet nach einem Update noch die alte app.js im neuen Cache
    return c.addAll(HUELLE.map(function (u) { return new Request(u, { cache: "reload" }); })).then(function () { return Promise.all(OPTIONAL.map(function (u) { return c.add(u).catch(function () {}); })); });
  }).then(function () { return self.skipWaiting(); }));
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
  // Programmcode und Seite: Netz zuerst (immer der veröffentlichte Stand), offline aus dem Cache.
  // Bibliothek, Bilder und Stammdaten: Cache zuerst.
  if (e.request.mode === "navigate" || /\.(html|js|css|webmanifest)$/.test(url.pathname) && !/\/vendor\//.test(url.pathname) || /\/$/.test(url.pathname)) {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then(function (antwort) {
      if (antwort.ok) { var kopie = antwort.clone(); caches.open(CACHE).then(function (c) { c.put(e.request, kopie); }); }
      return antwort;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true }).then(function (t) { return t || new Response("", { status: 503, statusText: "offline" }); });
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
