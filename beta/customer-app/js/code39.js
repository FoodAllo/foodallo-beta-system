/**
 * Code 39 (ISO/IEC 16388) als SVG – eigenständig, ohne externe Bibliothek, ohne Abhängigkeiten.
 * Tabelle C39 byte-gleich mit beta/desktop/assets/karten.js (Desktop 3580140). Aufruf: FoodAlloCode39.svg("FAPK…").
 *
 * MUSTER: je Zeichen 9 Elemente (Strich, Lücke, Strich, … , Strich), n = schmal, w = breit, genau 3 breit.
 * Geprüft gegen python-barcode (barcode.charsets.code39) und Dekodierung mit zxing (tests/).
 * Verhältnis schmal:breit 1:3, schmale Lücke zwischen den Zeichen, Start/Stopp „*“,
 * Ruhezone 10 schmale Module links und rechts. Keine Code-39-Prüfziffer.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FoodAlloCode39 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* Tabelle 1:1 aus beta/desktop/assets/karten.js (Desktop-Commit 3580140, Zeilen 9–23). */
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

  var MUSTER = C39;
  var BREIT = 3;      // breites Element = 3 schmale Module
  var RUHEZONE = 10;  // schmale Module je Seite

  /** Strich-/Lückenfolge in Modulen: [{ x, w }] für die Striche, Gesamtbreite inkl. Ruhezone. */
  function striche(text) {
    var raw = String(text == null ? "" : text).toUpperCase(), inhalt = "";
    for (var i = 0; i < raw.length; i++) {
      if (raw[i] === "*") continue;
      if (!MUSTER[raw[i]]) throw new Error("Code 39: Zeichen nicht darstellbar: " + raw[i]);
      inhalt += raw[i];
    }
    var folge = "*" + inhalt + "*", x = RUHEZONE, out = [];
    for (var c = 0; c < folge.length; c++) {
      var m = MUSTER[folge[c]];
      for (var j = 0; j < 9; j++) {
        var w = m[j] === "w" ? BREIT : 1;
        if (j % 2 === 0) out.push({ x: x, w: w });
        x += w;
      }
      if (c < folge.length - 1) x += 1; // schmale Lücke zwischen den Zeichen
    }
    return { inhalt: inhalt, striche: out, breite: x + RUHEZONE };
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** SVG, skaliert auf die Breite des Containers (viewBox in Modulen), weißer Hintergrund inkl. Ruhezone. */
  function svg(text, opts) {
    opts = opts || {};
    var r = striche(text), hoehe = opts.hoehe || 60, rects = "";
    r.striche.forEach(function (s) {
      rects += '<rect x="' + s.x + '" y="0" width="' + s.w + '" height="' + hoehe + '"/>';
    });
    return '<svg class="' + esc(opts.klasse || "code39") + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Strichcode ' + esc(r.inhalt) +
      '" viewBox="0 0 ' + r.breite + " " + hoehe + '" preserveAspectRatio="none" shape-rendering="crispEdges">' +
      '<rect x="0" y="0" width="' + r.breite + '" height="' + hoehe + '" fill="#fff"/><g fill="#000">' + rects + "</g></svg>";
  }

  function zahl(v) { return String(Math.round(v * 10000) / 10000); }

  /**
   * SVG in festen Bildschirmpixeln, keine Skalierung durch das Layout. Koordinaten in Modulen (ganzzahlig),
   * Breite je Modul = opts.modul CSS-px (z. B. n / devicePixelRatio, damit jedes Modul genau n Gerätepixel hat).
   * Reines Schwarz auf reinem Weiß, Ruhezone inklusive, crispEdges.
   * opts: modul (CSS px je Modul, Standard 2), hoehe (CSS px), klasse, senkrecht (Striche waagrecht, Code von oben nach unten),
   *       geraetepx (nur Angabe für data-geraetepx).
   */
  function svgPx(text, opts) {
    opts = opts || {};
    var r = striche(text), m = opts.modul > 0 ? Number(opts.modul) : 2, hoehe = Math.max(1, Math.round(opts.hoehe || 80));
    var laenge = r.breite * m, rects = "", senk = !!opts.senkrecht;
    r.striche.forEach(function (s) {
      rects += senk ? '<rect x="0" y="' + s.x + '" width="1" height="' + s.w + '"/>'
        : '<rect x="' + s.x + '" y="0" width="' + s.w + '" height="1"/>';
    });
    var w = senk ? hoehe : laenge, h = senk ? laenge : hoehe;
    var vb = senk ? "0 0 1 " + r.breite : "0 0 " + r.breite + " 1";
    return '<svg class="' + esc(opts.klasse || "code39") + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Strichcode ' + esc(r.inhalt) +
      '" width="' + zahl(w) + '" height="' + zahl(h) + '" viewBox="' + vb + '" preserveAspectRatio="none" shape-rendering="crispEdges"' +
      ' style="width:' + zahl(w) + "px;height:" + zahl(h) + 'px" data-modul="' + zahl(m) + '"' +
      (opts.geraetepx ? ' data-geraetepx="' + opts.geraetepx + '"' : "") + (senk ? ' data-senkrecht="1"' : "") + ">" +
      '<rect x="0" y="0" width="' + (senk ? 1 : r.breite) + '" height="' + (senk ? r.breite : 1) + '" fill="#fff"/><g fill="#000">' + rects + "</g></svg>";
  }

  /** Anzahl Module inklusive Ruhezone (für die Wahl einer ganzzahligen Modulbreite). */
  function module(text) { return striche(text).breite; }

  return { MUSTER: MUSTER, BREIT: BREIT, RUHEZONE: RUHEZONE, striche: striche, svg: svg, svgPx: svgPx, module: module };
});
