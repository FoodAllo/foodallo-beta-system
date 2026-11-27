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

  return { MUSTER: MUSTER, BREIT: BREIT, RUHEZONE: RUHEZONE, striche: striche, svg: svg };
});
