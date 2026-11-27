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

  /** Pixeldichte des Bildschirms (Gerätepixel je CSS-Pixel). */
  function dichte() {
    var d = typeof window !== "undefined" && window.devicePixelRatio;
    return d > 0 ? d : 1;
  }

  /**
   * Modulbreite in ganzen GERÄTEpixeln: größtes n, sodass alle Module (inkl. Ruhezone) in `laenge` CSS-px passen.
   * Ergebnis { n, css, modulzahl, laenge }: css = n / dpr (z. B. DPR 2: n 3 = 1,5 CSS-px; DPR 3: n 5 ≈ 1,667 CSS-px).
   * Passt nicht einmal 1 Gerätepixel je Modul, wird auf `laenge` eingepasst (n = 0, Ruhezone bleibt vollständig).
   */
  function modulGeraet(code, laenge, dpr) {
    dpr = dpr > 0 ? dpr : 1;
    var z = C39().module(code), n = Math.floor((laenge * dpr + 1e-6) / z);
    var css = n >= 1 ? n / dpr : Math.max(0, laenge) / z;
    return { n: n >= 1 ? n : 0, css: css, modulzahl: z, laenge: z * css };
  }

  /** Modulbreite in CSS-px (ganze Gerätepixel bei gegebener Pixeldichte; ohne dpr: ganze CSS-px). */
  function modulFuer(code, laenge, dpr) {
    return modulGeraet(code, laenge, dpr || 1).css;
  }

  /**
   * Legt ein Element auf das Gerätepixelraster und hält es innerhalb von [0, Fensterbreite]
   * (Ruhezone darf nicht abgeschnitten werden).
   */
  function aufGeraetePixel(el) {
    if (!el || !el.getBoundingClientRect) return;
    // Verschiebung über position:relative (wird vom Layout auf Gerätepixel gelegt; transform würde Firefox nicht einrasten)
    el.style.position = "relative"; el.style.left = "0px"; el.style.top = "0px";
    var d = dichte(), r = el.getBoundingClientRect();
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var ziel = r.left;
    if (r.width <= vw) ziel = Math.min(Math.max(ziel, 0), vw - r.width);
    var zx = Math.round(ziel * d) / d, zy = Math.round(r.top * d) / d;
    if (zx + r.width > vw + 1e-6) zx = Math.floor((vw - r.width) * d) / d;
    if (zx < 0 && r.width <= vw) zx = 0;
    var dx = zx - r.left, dy = zy - r.top;
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) { el.style.left = dx + "px"; el.style.top = dy + "px"; }
  }

  /** Inline-Strichcode: so groß wie möglich in ganzen Gerätepixeln je Modul, nie breiter als Platz und Bildschirm. */
  function anpassen(root) {
    if (typeof document === "undefined") return;
    var plaetze = (root || document).querySelectorAll(".lk-strichcode-platz");
    Array.prototype.forEach.call(plaetze, function (platz) {
      var code = platz.getAttribute("data-code");
      if (!code) return;
      platz.innerHTML = "";
      var r = platz.getBoundingClientRect(), vw = document.documentElement.clientWidth || window.innerWidth;
      var verfuegbar = Math.min(r.right, vw) - Math.max(r.left, 0);
      verfuegbar = Math.max(0, Math.min(verfuegbar, platz.clientWidth || verfuegbar) - 1);
      var mg = modulGeraet(code, verfuegbar, dichte());
      var hoehe = Math.max(60, Math.min(140, Math.round(mg.laenge * 0.2)));
      platz.innerHTML = C39().svgPx(code, { modul: mg.css, hoehe: hoehe, klasse: "karte-strichcode", geraetepx: mg.n || "eingepasst" });
      aufGeraetePixel(platz.firstChild);
    });
  }

  var gross = null;
  var RAND = 8;          // Abstand zum Bildschirmrand
  var KNOPF = 44;        // Höhe der Leiste mit dem kleinen „Schließen“-Knopf (Ecke oben rechts)
  var TEXT = 52;         // Kartennummer + kurzer Hinweis neben bzw. unter dem Code

  /**
   * Maße der Großanzeige für ein Fenster W×H (CSS px). Hochformat: Code gedreht über die Bildschirmhöhe,
   * Nummer daneben. Querformat: Code über die Breite, Nummer darunter.
   */
  function grossMasse(code, W, H, dpr) {
    var hoch = H > W;
    var laengeVerf = hoch ? H - KNOPF - RAND : W - 2 * RAND;
    var mg = modulGeraet(code, laengeVerf, dpr);
    var quer = hoch ? W - 2 * RAND : H - KNOPF - RAND;
    var hoehe = Math.max(60, Math.min(quer - TEXT, Math.round(mg.laenge * 0.35)));
    return { hoch: hoch, n: mg.n, css: mg.css, laenge: mg.laenge, hoehe: hoehe, modulzahl: mg.modulzahl };
  }

  function grossLayout() {
    if (!gross) return;
    var W = document.documentElement.clientWidth || window.innerWidth, H = window.innerHeight, d = dichte();
    var g = grossMasse(gross.code, W, H, d);
    var box = gross.box;
    box.className = "lk-gross-box " + (g.hoch ? "hoch" : "quer");
    box.innerHTML = C39().svgPx(gross.code, { modul: g.css, hoehe: g.hoehe, klasse: "lk-gross-code", senkrecht: g.hoch, geraetepx: g.n || "eingepasst" }) +
      '<p class="lk-gross-nummer">' + esc(gross.nummer) + '</p>';
    var svg = box.firstChild;
    var sw = g.hoch ? g.hoehe : g.laenge, sh = g.hoch ? g.laenge : g.hoehe;
    // Code auf ganze Gerätepixel: oben (unter der Knopfleiste) bzw. mittig im freien Bereich
    var oben = g.hoch ? KNOPF : KNOPF + Math.max(0, (H - KNOPF - RAND - sh - TEXT) / 2);
    var links = g.hoch ? (W - sw - TEXT) / 2 + TEXT : (W - sw) / 2;
    if (g.hoch) oben = KNOPF + Math.max(0, (H - KNOPF - RAND - sh) / 2);
    links = Math.round(links * d) / d; oben = Math.round(oben * d) / d;
    box.style.left = "0px"; box.style.top = "0px"; box.style.width = W + "px"; box.style.height = H + "px";
    svg.style.position = "absolute"; svg.style.left = links + "px"; svg.style.top = oben + "px";
    var nr = box.lastChild;
    if (g.hoch) {
      nr.style.left = Math.max(RAND, links - TEXT) + "px"; nr.style.top = oben + "px"; nr.style.height = sh + "px"; nr.style.width = TEXT - 8 + "px";
    } else {
      nr.style.left = "0px"; nr.style.width = W + "px"; nr.style.top = (oben + sh + 6) + "px";
    }
    gross.el.setAttribute("data-modul", String(g.css));
    gross.el.setAttribute("data-geraetepx", String(g.n));
    gross.el.setAttribute("data-ausrichtung", g.hoch ? "gedreht" : "quer");
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
    el.innerHTML = '<button type="button" class="lk-gross-zu" aria-label="Schließen">✕ Schließen</button>' +
      '<p class="lk-gross-tipp">Bildschirm hell stellen · Zum Schließen tippen</p><div class="lk-gross-box"></div>';
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
    html += '<div class="lk-strichcode-platz" data-gross-anzeigen data-code="' + esc(code.code_barcode) + '" data-nummer="' + esc(code.code_anzeige) +
      '" title="Groß anzeigen">' + code39Svg(code.code_barcode) + "</div>";
    html += '<button type="button" class="btn lk-gross-knopf" data-gross-anzeigen data-code="' + esc(code.code_barcode) +
      '" data-nummer="' + esc(code.code_anzeige) + '"><span class="lk-gross-knopf-titel">Groß anzeigen</span>' +
      '<span class="lk-scan-hinweis">Zum Scannen bitte „Groß anzeigen“ antippen</span></button>';
    html += '<p class="lk-nummer">' + esc(code.code_anzeige) + "</p>";
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

  return { anpassen: anpassen, grossAnzeigen: grossAnzeigen, grossSchliessen: grossSchliessen, modulFuer: modulFuer, modulGeraet: modulGeraet, grossMasse: grossMasse, render: render, positionen: positionen, gutscheinIdFuer: gutscheinIdFuer, lokalEingeloest: lokalEingeloest, papierCode: papierCode, code39Svg: code39Svg };
});
