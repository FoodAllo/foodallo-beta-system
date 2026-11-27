/**
 * FoodAllo Customer App — Lebensmittelkarte zum Vorzeigen (Demonstration, Familie Becker).
 * Nur Customer App: liest data/demo-karte.json, schreibt nichts in den gemeinsamen Log.
 * Kartennummer und Strichcode wie in der Desktopversion (Kern papierkartenCode, Code 39).
 * Gültigkeit: immer die laufende Woche (Montag bis Sonntag), nur für diese Demonstrationsfamilie.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FoodAlloDemoKarte = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var C39 = {
    "0": "nnnwwnwnn", "1": "wnnnwnnnw", "2": "nwnnwnnnw", "3": "wwnnwnnnn",
    "4": "nnwnwnnnw", "5": "wnwnwnnnn", "6": "nwwnwnnnn", "7": "nnnwwwnnw",
    "8": "wnnwwnnnn", "9": "nwnwwnnnn",
    "A": "wnnnnwnnw", "B": "nwnnnwnnw", "C": "wwnnnwnnn", "D": "nnwnnwnnw",
    "E": "wnwnnwnnn", "F": "nwwnnwnnn", "G": "nnnnwwnnw", "H": "wnnnwwnnn",
    "I": "nwnnwwnnn", "J": "nnwnwwnnn", "K": "wnnnnnwnw", "L": "nwnnnnwnw",
    "M": "wwnnnnwnn", "N": "nnwnnnwnw", "O": "wnwnnnwnn", "P": "nwwnnnwnn",
    "Q": "nnnnwnwnw", "R": "wnnnwnwnn", "S": "nwnnwnwnn", "T": "nnwnwnwnn",
    "U": "wnnnnnnww", "V": "nwnnnnnww", "W": "wwnnnnnwn", "X": "nnwnnnnww",
    "Y": "wnwnnnnwn", "Z": "nwwnnnnwn", "-": "nnnnwnnww", "*": "nwnnwnwnn"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /** Code-39-Strichcode als SVG (gleiches Verfahren wie die Desktopversion). */
  function code39Svg(text) {
    var raw = String(text || "").toUpperCase(), ok = "";
    for (var i = 0; i < raw.length; i++) if (C39[raw[i]]) ok += raw[i];
    var payload = "*" + ok + "*", narrow = 2, high = 56, x = 0, bars = "";
    for (var c = 0; c < payload.length; c++) {
      var pat = C39[payload[c]];
      for (var j = 0; j < 9; j++) {
        var w = (pat[j] === "w" ? 3 : 1) * narrow;
        if (j % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + w + '" height="' + high + '" fill="#000"/>';
        x += w;
      }
      x += narrow;
    }
    return '<svg class="karte-strichcode" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Strichcode der Kartennummer" viewBox="0 0 ' +
      x + " " + high + '" preserveAspectRatio="none">' + bars + "</svg>";
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

  /** Mengen je Woche für den Haushalt nach den bestehenden Regeln (Basis je Person, ohne Trinkwasser und Insulin). */
  function positionen(artikel, personenZahl) {
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
    var pos = positionen(opts.artikel, n);
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
    html += '<p class="lk-status">Status: <span class="pill status-gueltig">Gültig</span></p>';
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
    html += '<p class="lk-nummer">' + esc(code.code_anzeige) + "</p>";
    html += code39Svg(code.code_barcode);
    html += "</div>";

    html += '<h3 class="lk-h3">Mengen für diese Woche</h3>';
    html += '<table class="lk-tabelle"><thead><tr><th scope="col">Artikel</th><th scope="col" class="num">Sie dürfen abholen</th>' +
      '<th scope="col" class="num">Bereits abgeholt</th><th scope="col" class="num">Es bleibt noch</th></tr></thead><tbody>';
    pos.forEach(function (p) {
      html += "<tr><th scope=\"row\">" + esc(p.bezeichnung) + "<span class=\"lk-je\">" + esc(fm(p.je_person, p.einheit)) + " je Person</span></th>" +
        '<td class="num">' + esc(fm(p.zugeteilt_max, p.einheit)) + "</td>" +
        '<td class="num">' + esc(fm(p.eingeloest, p.einheit)) + "</td>" +
        '<td class="num"><strong>' + esc(fm(p.rest, p.einheit)) + "</strong></td></tr>";
    });
    html += "</tbody></table>";
    html += '<p class="hint">Die Mengen gelten für den ganzen Haushalt und je Woche, zum Beispiel eine Rolle Toilettenpapier je Person. ' +
      "Trinkwasser gibt es nur während einer Versorgungsstörung: 2 Liter je Person und Tag (14 Liter je Person und Woche), auf einer zusätzlichen Karte.</p>";
    html += "<p>So nutzen Sie die Karte: Zeigen Sie die Karte im Geschäft vor. Das Geschäft scannt den Strichcode oder tippt die Kartennummer ein.</p>";
    html += '<p class="hint">Diese Karte gehört zu einer erfundenen Familie und dient nur zum Vorzeigen. In der Retail App ist sie nicht hinterlegt und kann dort nicht eingelöst werden.</p>';
    html += "</section>";
    return html;
  }

  return { render: render, positionen: positionen, papierCode: papierCode, code39Svg: code39Svg };
});
