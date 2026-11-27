/**
 * FoodAllo Customer App — Lebensmittelkarte zum Vorzeigen (Demonstration, Familie Becker).
 * Nur Customer App: liest data/demo-karte.json, schreibt nichts in den gemeinsamen Log.
 * Kartennummer wie in der Desktopversion (Kern papierkartenCode), Strichcode Code 39 über js/code39.js.
 * Gültigkeit: immer die laufende Woche (Montag bis Sonntag), nur für diese Demonstrationsfamilie.
 * Datensatz: ../data/demo-becker.json (gemeinsam mit der Retail App), Rückfall data/demo-karte.json.
 * „Bereits abgeholt“: nur aus lokalen Einlösungen der Retail App im selben Browser
 * (localStorage foodallo.retail.ereignisse.v1), nie aus dem gemeinsamen Log.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FoodAlloDemoKarte = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** Code-39-Strichcode als SVG über js/code39.js (Standardtabelle ISO/IEC 16388). */
  function C39() {
    return (typeof window !== "undefined" && window.FoodAlloCode39) ||
      (typeof require === "function" ? require("./code39.js") : null);
  }
  function code39Svg(text) {
    return C39().svg(text, { klasse: "karte-strichcode", hoehe: 60 });
  }

  /* ---------- Scannerfreundliche Anzeige: ganzzahlige Modulbreite, keine Skalierung ---------- */

  /** Größte ganzzahlige Modulbreite (CSS px), die in `laenge` passt; mindestens 1. */
  function modulFuer(code, laenge) {
    return Math.max(1, Math.floor(laenge / C39().module(code)));
  }

  /** Verschiebt ein Element um den Bruchteil eines Pixels, damit die Striche auf ganzen Pixeln liegen. */
  function aufGanzePixel(el) {
    if (!el || !el.getBoundingClientRect) return;
    el.style.transform = "";
    var r = el.getBoundingClientRect(), dx = Math.round(r.left) - r.left, dy = Math.round(r.top) - r.top;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) el.style.transform = "translate(" + dx + "px," + dy + "px)";
  }

  /** Inline-Strichcode so groß wie das Layout erlaubt, mit ganzzahliger Modulbreite. */
  function anpassen(root) {
    if (typeof document === "undefined") return;
    var plaetze = (root || document).querySelectorAll(".lk-strichcode-platz");
    Array.prototype.forEach.call(plaetze, function (platz) {
      var code = platz.getAttribute("data-code");
      if (!code) return;
      var verfuegbar = platz.clientWidth - 8;
      var m = modulFuer(code, verfuegbar);
      var laenge = C39().module(code) * m;
      var hoehe = Math.max(80, Math.min(140, Math.round(laenge * 0.18)));
      platz.innerHTML = C39().svgPx(code, { modul: m, hoehe: hoehe, klasse: "karte-strichcode" });
      aufGanzePixel(platz.firstChild);
    });
  }

  var gross = null;

  function grossLayout() {
    if (!gross) return;
    var W = window.innerWidth, H = window.innerHeight, code = gross.code;
    var hoch = H > W;
    var laengeVerf = hoch ? H - 96 : W - 32;          // oben Platz für „Schließen“
    var m = modulFuer(code, laengeVerf);
    var laenge = C39().module(code) * m;
    var quer = hoch ? W - 24 : H - 96;
    var text = 44;
    var hoehe = Math.max(60, Math.min(quer - text, Math.round(laenge * 0.3)));
    var wW = laenge, wH = hoehe + text;
    if ((wW - wH) % 2) wH += 1;                       // gleiche Parität: nach 90°-Drehung ganze Pixel
    var box = gross.box;
    box.style.width = wW + "px";
    box.style.height = wH + "px";
    box.innerHTML = C39().svgPx(code, { modul: m, hoehe: hoehe, klasse: "lk-gross-code" }) +
      '<p class="lk-gross-nummer">' + esc(gross.nummer) + "</p>";
    var cx = Math.round(W / 2), cy = Math.round(64 + (H - 64) / 2);
    box.style.left = Math.round(cx - wW / 2) + "px";
    box.style.top = Math.round(cy - wH / 2) + "px";
    box.style.transform = hoch ? "rotate(90deg)" : "none";
    gross.el.setAttribute("data-modul", String(m));
    gross.el.setAttribute("data-ausrichtung", hoch ? "gedreht" : "quer");
  }

  function grossSchliessen() {
    if (!gross) return;
    var g = gross;
    gross = null;
    window.removeEventListener("resize", grossLayout);
    document.removeEventListener("keydown", g.taste);
    if (g.sperre && g.sperre.release) g.sperre.release().catch(function () {});
    if (g.el.parentNode) g.el.parentNode.removeChild(g.el);
    document.documentElement.classList.remove("lk-gross-offen");
    if (g.zurueck && g.zurueck.focus) g.zurueck.focus();
  }

  /** Vollbild-Anzeige: weiß, Strichcode über die volle Bildschirmlänge (hochkant gedreht), ganzzahlige Module. */
  function grossAnzeigen(code, nummer, ausloeser) {
    if (typeof document === "undefined" || !code) return;
    grossSchliessen();
    var el = document.createElement("div");
    el.className = "lk-gross";
    el.id = "lk-gross";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Strichcode groß, Kartennummer " + nummer);
    el.innerHTML = '<button type="button" class="lk-gross-zu">Schließen</button>' +
      '<p class="lk-gross-tipp">Bildschirm hell stellen. Zum Schließen tippen.</p><div class="lk-gross-box"></div>';
    document.body.appendChild(el);
    document.documentElement.classList.add("lk-gross-offen");
    gross = { el: el, box: el.querySelector(".lk-gross-box"), code: code, nummer: nummer || "", zurueck: ausloeser, sperre: null };
    gross.taste = function (ev) { if (ev.key === "Escape") grossSchliessen(); };
    el.addEventListener("click", grossSchliessen);
    document.addEventListener("keydown", gross.taste);
    window.addEventListener("resize", grossLayout);
    grossLayout();
    el.querySelector(".lk-gross-zu").focus();
    var g = gross;
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request("screen").then(function (s) { if (gross === g) g.sperre = s; else s.release(); }).catch(function () {});
      }
    } catch (e) { /* ohne Wake Lock weiter */ }
  }

  function papierCode(pkId) {
    if (typeof window !== "undefined" && window.FAKern && typeof window.FAKern.papierkartenCode === "function") {
      var k = window.FAKern.papierkartenCode(pkId);
      if (k) return k;
    }
    var m = /^FA-PK-(\d{8})-(\d{6})$/.exec(String(pkId || ""));
    if (!m) return null;
    var z = m[1] + m[2], r = 0;
    for (var i = 0; i < z.length; i++) r = (r * 10 + Number(z[i])) % 97;
    var pz = ("0" + (98 - (r * 100) % 97)).slice(-2);
    return { code_anzeige: pkId + "-" + pz, code_barcode: "FAPK" + z + pz };
  }

  var RETAIL_SPEICHER = "foodallo.retail.ereignisse.v1";

  /** Gutschein-Kennung der Demonstrationskarte für die laufende Woche (Vorlage aus dem Datensatz). */
  function gutscheinIdFuer(demo, periode) {
    var ymd = String(periode && periode.start_ymd || "");
    var vorlage = (demo && demo.gutschein_id_vorlage) || "FA-V-{MONTAG_YYYYMMDD}-900001";
    return vorlage.replace("{MONTAG_YYYYMMDD}", ymd);
  }

  /** Lokale Einlösungen der Retail App (gleicher Browser) für diese Karte und Woche, Stornos abgezogen. */
  function lokalEingeloest(demo, periode) {
    var summe = {};
    var evs;
    try { evs = JSON.parse(localStorage.getItem(RETAIL_SPEICHER) || "[]"); } catch (e) { evs = []; }
    if (!Array.isArray(evs)) return summe;
    var gid = gutscheinIdFuer(demo, periode), buchungen = {}, storniert = {};
    evs.forEach(function (ev) {
      if (!ev || !ev.payload) return;
      if (ev.typ === "REDEMPTION_REVERSED" && ev.payload.buchung_id) storniert[ev.payload.buchung_id] = true;
      if (ev.typ !== "REDEMPTION_POSTED") return;
      var b = ev.payload.ausgabebuchung;
      if (!b || b.gutschein_id !== gid || b.status === "storniert") return;
      buchungen[b.buchung_id || ev.ereignis_id] = b;
    });
    Object.keys(buchungen).forEach(function (id) {
      if (storniert[id]) return;
      var b = buchungen[id];
      summe[b.artikel_id] = Math.round(((summe[b.artikel_id] || 0) + Number(b.menge || 0)) * 1000) / 1000;
    });
    return summe;
  }

  /** Mengen je Woche für den Haushalt nach den bestehenden Regeln (Basis je Person, ohne Trinkwasser und Insulin). */
  function positionen(artikel, personenZahl, demo) {
    if (demo && Array.isArray(demo.positionen) && demo.positionen.length) {
      var namen = {};
      (artikel || []).forEach(function (a) { namen[a.artikel_id] = a.bezeichnung_de; });
      return demo.positionen.map(function (p) {
        return { artikel_id: p.artikel_id, bezeichnung: namen[p.artikel_id] || p.artikel_id, einheit: p.einheit, je_person: p.je_person,
          zugeteilt_max: p.zugeteilt_max, eingeloest: 0, rest: p.zugeteilt_max };
      });
    }
    return (artikel || []).filter(function (a) {
      return a.periode_basis_vorschlag && a.artikel_id !== "water" && a.artikel_id !== "insulin" && !a.nur_bei_stoerung;
    }).map(function (a) {
      var menge = Math.round(a.periode_basis_vorschlag * personenZahl * 1000) / 1000;
      return { artikel_id: a.artikel_id, bezeichnung: a.bezeichnung_de, einheit: a.einheit, je_person: a.periode_basis_vorschlag, zugeteilt_max: menge, eingeloest: 0, rest: menge };
    });
  }

  function anschriftText(a) {
    if (!a) return "";
    if (typeof window !== "undefined" && window.FAKern && typeof window.FAKern.formatiereOrt === "function") {
      return window.FAKern.formatiereOrt(a);
    }
    return [a.strasse, a.hausnummer].filter(Boolean).join(" ") + ", 12345 " + (a.ort || "Musterstadt");
  }

  /**
   * opts: demo (data/demo-karte.json), artikel, periode (laufende Woche), UI (FoodAlloUI)
   */
  function render(opts) {
    var d = opts.demo || {}, UI = opts.UI, periode = opts.periode;
    var personen = d.personen || [];
    var n = personen.length;
    var code = papierCode(d.papierkarte_id) || { code_anzeige: "", code_barcode: "" };
    var pos = positionen(opts.artikel, n, d);
    var abgeholt = lokalEingeloest(d, periode);
    var irgendwas = false;
    pos.forEach(function (p) {
      var e = Math.min(Number(abgeholt[p.artikel_id] || 0), Number(p.zugeteilt_max));
      if (e > 0) irgendwas = true;
      p.eingeloest = e;
      p.rest = Math.round((Number(p.zugeteilt_max) - e) * 1000) / 1000;
    });
    var alles = pos.length && pos.every(function (p) { return p.rest <= 0.0005; });
    // Tabelle: Einheiten wie Retail App und gedruckte Lebensmittelkarte (kg, Liter, Rollen)
    var fk = function (v, e) {
      var n = Number(v || 0).toLocaleString("de-DE", { maximumFractionDigits: 3 });
      var u = e === "kg" ? "kg" : (e === "L" || e === "l") ? "Liter" : (e === "rolle" || e === "Rollen") ? (Number(v) === 1 ? "Rolle" : "Rollen") : (e || "");
      return u ? n + "\u00a0" + u : n;
    };
    var fm = function (v, e) {
      if ((e === "rolle" || e === "Rollen") && Number(v) === 1) return "1\u00a0Rolle";
      return UI ? UI.formatMenge(v, e) : String(v);
    };
    var dat = function (iso) { return UI ? UI.formatDateDe(iso) : iso; };

    var html = '<section class="card lebensmittelkarte" aria-labelledby="lk-titel">';
    html += '<header class="lk-kopf">';
    html += '<h2 id="lk-titel">Lebensmittelkarte <span class="lk-vermerk">Demonstration</span></h2>';
    html += '<p class="lk-amt">Musterstadt · Pass- und Meldebehörde</p>';
    html += "</header>";
    html += '<p class="lk-status">Status: <span class="pill status-gueltig">Gültig</span>' +
      (alles ? ' <span class="pill status-ausgeschoepft">Alles abgeholt</span>' : (irgendwas ? ' <span class="pill status-teilweise_eingeloest">Teilweise abgeholt</span>' : "")) + "</p>";
    html += '<p class="lk-gueltig">Gültig diese Woche: Montag, ' + esc(dat(periode.start_iso_date)) +
      " bis Sonntag, " + esc(dat(periode.ende_iso_date)) + ".</p>";
    html += '<p class="hint">In dieser Demonstration gilt die Karte immer für die laufende Woche, von Montag bis Sonntag.</p>';

    html += '<dl class="lk-meta">';
    html += "<div><dt>Haushalt</dt><dd>Familie " + esc(d.familie) + "</dd></div>";
    html += "<div><dt>Anschrift</dt><dd>" + esc(anschriftText(d.anschrift)) + "</dd></div>";
    html += "<div><dt>Personen im Haushalt</dt><dd>" + esc(String(n)) + " (" +
      personen.map(function (p) { return esc((p.vornamen + " " + p.familienname).trim()); }).join(", ") + ")</dd></div>";
    html += "</dl>";

    html += '<div class="lk-code">';
    html += '<p class="lk-code-label">Kartennummer</p>';
    html += '<div class="lk-strichcode-platz" data-code="' + esc(code.code_barcode) + '">' + code39Svg(code.code_barcode) + "</div>";
    html += '<p class="lk-nummer">' + esc(code.code_anzeige) + "</p>";
    html += '<button type="button" class="btn lk-gross-knopf" data-gross-anzeigen data-code="' + esc(code.code_barcode) +
      '" data-nummer="' + esc(code.code_anzeige) + '">Groß anzeigen (zum Scannen)</button>';
    html += "</div>";

    html += '<h3 class="lk-h3">Mengen für diese Woche</h3>';
    if (irgendwas) {
      html += '<p class="hint">„Bereits abgeholt“ zeigt die Abholungen, die in diesem Browser in der Retail App gebucht wurden.</p>';
    }
    html += '<table class="lk-tabelle' + (irgendwas ? " mit-abgeholt" : "") + '"><thead><tr><th scope="col">Artikel</th><th scope="col" class="num">Sie dürfen abholen</th>' +
      '<th scope="col" class="num">Bereits abgeholt</th><th scope="col" class="num">Es bleibt noch</th></tr></thead><tbody>';
    pos.forEach(function (p) {
      html += "<tr><th scope=\"row\">" + esc(p.bezeichnung) + "<span class=\"lk-je\">" + esc(fk(p.je_person, p.einheit)) + " je Person</span></th>" +
        '<td class="num">' + esc(fk(p.zugeteilt_max, p.einheit)) + "</td>" +
        '<td class="num">' + esc(fk(p.eingeloest, p.einheit)) + "</td>" +
        '<td class="num"><strong>' + esc(fk(p.rest, p.einheit)) + "</strong></td></tr>";
    });
    html += "</tbody></table>";
    html += '<p class="hint">Die Mengen gelten für den ganzen Haushalt und je Woche, zum Beispiel eine Rolle Toilettenpapier je Person. ' +
      "Trinkwasser gibt es nur während einer Versorgungsstörung: 2 Liter je Person und Tag (14 Liter je Person und Woche), auf einer zusätzlichen Karte.</p>";
    html += "<p>So nutzen Sie die Karte: Zeigen Sie die Karte im Geschäft vor. Das Geschäft scannt den Strichcode oder tippt die Kartennummer ein.</p>";
    html += '<p class="hint">Diese Karte gehört zu einer erfundenen Familie und dient nur zur Demonstration. Abholungen auf diese Karte bucht die Retail App nur auf dem jeweiligen Gerät, nicht im gemeinsamen Datenbestand.</p>';
    html += "</section>";
    return html;
  }

  return { anpassen: anpassen, grossAnzeigen: grossAnzeigen, grossSchliessen: grossSchliessen, modulFuer: modulFuer, render: render, positionen: positionen, gutscheinIdFuer: gutscheinIdFuer, lokalEingeloest: lokalEingeloest, papierCode: papierCode, code39Svg: code39Svg };
});
