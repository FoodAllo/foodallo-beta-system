/**
 * Drucklayout der FoodAllo-Lebensmittelkarte und Code-39-Strichcode (ohne externe Bibliothek).
 * Kein Behördenwappen, keine behördliche Unterschrift; Kennzeichnung als Demonstration mit fiktiven Daten.
 */
(function (global) {
  "use strict";

  /* Code 39 nach ISO/IEC 16388: n = schmal, w = breit (3:1); Start/Stop = * */
  var C39 = {
    "0": "nnnwwnwnn", "1": "wnnwnnnnw", "2": "nnwwnnnnw", "3": "wnwwnnnnn",
    "4": "nnnwwnnnw", "5": "wnnwwnnnn", "6": "nnwwwnnnn", "7": "nnnwnnwnw",
    "8": "wnnwnnwnn", "9": "nnwwnnwnn",
    "A": "wnnnnwnnw", "B": "nnwnnwnnw", "C": "wnwnnwnnn", "D": "nnnnwwnnw",
    "E": "wnnnwwnnn", "F": "nnwnwwnnn", "G": "nnnnnwwnw", "H": "wnnnnwwnn",
    "I": "nnwnnwwnn", "J": "nnnnwwwnn", "K": "wnnnnnnww", "L": "nnwnnnnww",
    "M": "wnwnnnnwn", "N": "nnnnwnnww", "O": "wnnnwnnwn", "P": "nnwnwnnwn",
    "Q": "nnnnnnwww", "R": "wnnnnnwwn", "S": "nnwnnnwwn", "T": "nnnnwnwwn",
    "U": "wwnnnnnnw", "V": "nwwnnnnnw", "W": "wwwnnnnnn", "X": "nwnnwnnnw",
    "Y": "wwnnwnnnn", "Z": "nwwnwnnnn",
    "-": "nwnnnnwnw", ".": "wwnnnnwnn", " ": "nwwnnnwnn", "$": "nwnwnwnnn",
    "/": "nwnwnnnwn", "+": "nwnnnwnwn", "%": "nnnwnwnwn", "*": "nwnnwnwnn"
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function code39Svg(text, opts) {
    opts = opts || {};
    var raw = String(text || "").toUpperCase();
    var ok = "";
    for (var i = 0; i < raw.length; i++) {
      ok += C39[raw[i]] ? raw[i] : "";
    }
    var payload = "*" + ok + "*";
    var narrow = opts.narrow || 2;
    var high = opts.height || 48;
    var ruhe = 10 * narrow; /* Ruhezone links und rechts: 10 Module */
    var x = ruhe;
    var bars = "";
    for (var c = 0; c < payload.length; c++) {
      var pat = C39[payload[c]];
      if (!pat) continue;
      for (var j = 0; j < 9; j++) {
        var w = (pat[j] === "w" ? 3 : 1) * narrow;
        if (j % 2 === 0) {
          bars += '<rect x="' + x + '" y="0" width="' + w + '" height="' + high + '" fill="#000"/>';
        }
        x += w;
      }
      if (c < payload.length - 1) x += narrow; /* Lücke zwischen Zeichen: 1 Modul */
    }
    var width = x + ruhe;
    return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Strichcode ' + escapeHtml(ok) + '" viewBox="0 0 ' + width + ' ' + high + '" width="' + width + '" height="' + high + '">' + bars + "</svg>";
  }

  function pruefeCode(anzeige) {
    /* FA-K-YYYYMMDD-NNNNNN-CC */
    var m = String(anzeige || "").match(/^FA-K-(\d{8})-(\d{6})-(\d{2})$/);
    if (!m) return { gültig: false, grund: "format" };
    var numeric = m[1] + m[2];
    var n = parseInt(numeric, 10) * 100;
    var erwartet = String(98 - (n % 97)).padStart(2, "0");
    return { gültig: erwartet === m[3], erwartet: erwartet, gegeben: m[3] };
  }

  function artikelName(id, katalog) {
    if (!katalog) return id;
    for (var i = 0; i < katalog.length; i++) {
      if (katalog[i].artikel_id === id) return katalog[i].bezeichnung_de;
    }
    return id;
  }

  function einheitLabel(einheit) {
    if (einheit === "rolle") return "Rollen";
    if (einheit === "L") return "Liter";
    if (einheit === "IE") return "Einheiten";
    return einheit || "";
  }
  function fmtMenge(v, einheit) {
    if (v == null) return "—";
    var n = Number(v);
    var s;
    if (einheit === "rolle" || einheit === "IE") s = String(Math.round(n));
    else s = (Math.round(n * 1000) / 1000).toString().replace(".", ",");
    var u = einheitLabel(einheit);
    return s + (u ? "\u00a0" + u : "");
  }

  function datumDE(iso) {
    if (!iso) return "";
    return String(iso).slice(0, 10).split("-").reverse().join(".");
  }

  /**
   * Rendert die Lebensmittelkarte in Papierform (A4 oder A6).
   * opts: karte, gutschein, haushalt, periode, katalog, haushaltNr, personen [Namen],
   *       anschrift, ausgabestellen [Anzeigenamen], logo (Pfad)
   */
  function renderKarte(opts) {
    var format = opts.format === "a6" ? "a6" : "a4";
    var k = opts.karte;
    var g = opts.gutschein || { positionen: [] };
    var hh = opts.haushalt;
    var periode = opts.periode;
    var katalog = opts.katalog || [];
    var compact = format === "a6";
    var groesse = hh ? hh.groesse : "";
    var logo = opts.logo || "assets/logos/dark_logo_transparent_background.png";

    var rows = "";
    (g.positionen || []).forEach(function (p) {
      if (!(Number(p.zugeteilt_max) > 0)) return;
      var e = p.einheit;
      if (!e) for (var i = 0; i < katalog.length; i++) if (katalog[i].artikel_id === p.artikel_id) e = katalog[i].einheit;
      rows += "<tr><td>" + escapeHtml(artikelName(p.artikel_id, katalog)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(fmtMenge(p.zugeteilt_max, e)) + "</td>" +
        "<td class=\"num\">" + escapeHtml(fmtMenge(p.eingeloest, e)) + "</td>" +
        "<td class=\"num\"><strong>" + escapeHtml(fmtMenge(p.rest, e)) + "</strong></td></tr>";
    });
    if (!rows) rows = "<tr><td colspan=\"4\">Keine Zuteilung im Zeitraum.</td></tr>";

    var abgabeZeilen = "";
    for (var z = 0; z < (compact ? 3 : 6); z++) abgabeZeilen += "<tr><td></td><td></td><td></td><td></td></tr>";

    var personen = (opts.personen || []).map(escapeHtml).join(", ") || "laut Melderegister";
    var stellen = (opts.ausgabestellen || []).map(escapeHtml).join(" · ");

    return (
      '<article class="kartenblatt ' + format + '" data-format="' + format + '">' +
      '<div class="wasserzeichen" aria-hidden="true">BETA</div>' +
      '<div class="karten-kopf">' +
        '<img class="karten-logo" src="' + escapeHtml(logo) + '" alt="FoodAllo">' +
        (opts.vermerk ? '<div class="karten-titel"><h1>Lebensmittelkarte <span class="karten-vermerk">' + escapeHtml(opts.vermerk) + "</span></h1>" : '<div class="karten-titel"><h1>Lebensmittelkarte</h1>') +
        '<div class="klein-druck">Musterstadt · Pass- und Meldebehörde</div></div>' +
      "</div>" +
      '<div class="karten-meta">' +
        "<div>Kartennummer<br><span class=\"karten-code kartennummer\">" + escapeHtml(k.code_anzeige) + "</span></div>" +
        "<div>Gültig<br><strong>" + escapeHtml(periode ? datumDE(periode.beginn) + " bis " + datumDE(periode.ende) : "") + "</strong>" + (opts.gueltigHinweis ? "<br><span class=\"klein-druck\">" + escapeHtml(opts.gueltigHinweis) + "</span>" : "") + "</div>" +
        "<div>Haushalt<br><strong>" + escapeHtml(opts.haushaltName || "") + "</strong>, " + escapeHtml(String(groesse)) + " Person" + (groesse === 1 ? "" : "en") + "</div>" +
        "<div>Anschrift<br><strong>" + escapeHtml(opts.anschrift || "laut Melderegister") + "</strong></div>" +
        "<div class=\"breit\">Bezugsberechtigt<br><strong>" + personen + "</strong></div>" +
      "</div>" +
      "<table class=\"karten-tabelle\"><thead><tr><th>Ware</th><th class=\"num\">Zuteilung</th><th class=\"num\">Ausgegeben</th><th class=\"num\">Verbleibend</th></tr></thead><tbody>" + rows + "</tbody></table>" +
      '<div class="barcode-wrap">' + code39Svg(k.code_barcode, { height: compact ? 28 : 48, narrow: compact ? 1.4 : 2 }) +
      '<div class="klein-druck kartennummer">' + escapeHtml(k.code_barcode) + "</div></div>" +
      "<table class=\"abgabe\"><thead><tr><th>Datum</th><th>Ausgabestelle</th><th>Ware und Menge</th><th>Handzeichen</th></tr></thead><tbody>" + abgabeZeilen + "</tbody></table>" +
      (compact || !stellen ? "" : '<p class="karten-hinweis"><strong>Ausgabestellen in der Musterstadt:</strong> ' + stellen + "</p>") +
      '<p class="karten-hinweis">Bitte bei jeder Abholung vorlegen. Nicht übertragbar. Ausgegebene Mengen werden von der Ausgabestelle eingetragen.</p>' +
      '<p class="karten-demo">Demonstration mit fiktiven Daten, nicht im Einsatz bei einer Behörde</p>' +
      '<p class="karten-lizenz">Filialdaten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL): https://www.openstreetmap.org/copyright</p>' +
      '<p class="karten-fuss">Beta-Version · fiktive Daten · kein amtliches Dokument</p>' +
      "</article>"
    );
  }

  global.FOODALLO_KARTEN = {
    code39Svg: code39Svg,
    pruefeCode: pruefeCode,
    renderKarte: renderKarte,
    escapeHtml: escapeHtml,
    fmtMenge: fmtMenge,
    artikelName: artikelName
  };
})(window);
