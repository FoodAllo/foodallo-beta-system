/* Abgleich Retail App -> Desktopversion (Demo: nur auf diesem Gerät, gleicher Browser und gleiche Origin).
 * Liest nur den Abgleich-Speicher der Retail App: localStorage „foodallo.abgleich.retail.v1“ = { schema_version, ereignisse: [...] }
 * (wird nur ergänzt, keine Namen). Signale: storage-Event und BroadcastChannel „foodallo-abgleich“.
 * Die Desktopversion schreibt dort nichts und ändert weder den gemeinsamen Ereignislog noch ihre Datendateien.
 * Doppelte Ereignis-IDs zählen einmal; stornierte Ausgaben fallen heraus. */
(function (global) {
  "use strict";
  var SCHLUESSEL = "foodallo.abgleich.retail.v1", KANAL = "foodallo-abgleich";
  function erstes(o, felder) { for (var i = 0; i < felder.length; i++) if (o && o[felder[i]] != null && o[felder[i]] !== "") return o[felder[i]]; return null; }
  function art(typ) {
    var t = String(typ || "").toUpperCase();
    if (/REVERS|STORNO/.test(t)) return "storno";
    if (/REDEMPTION|AUSGABE|EINLOES/.test(t)) return "ausgabe";
    if (/RECEIPT|WARENEINGANG/.test(t)) return "wareneingang";
    return "";
  }
  function roh() { try { return global.localStorage.getItem(SCHLUESSEL) || ""; } catch (e) { return ""; } }
  function lies() {
    var r = roh(), d = null;
    try { d = r ? JSON.parse(r) : null; } catch (e) { d = null; }
    var liste = (d && Array.isArray(d.ereignisse)) ? d.ereignisse : [], gesehen = {}, storniert = {}, ausgaben = [], eingaenge = [];
    liste.forEach(function (e) {
      if (!e || typeof e !== "object") return;
      var id = erstes(e, ["ereignis_id", "event_id", "id"]);
      if (!id || gesehen[id]) return;
      gesehen[id] = true;
      var p = e.payload || {}, b = p.ausgabebuchung || {};
      var x = {
        id: id, art: art(e.typ),
        zeit: erstes(e, ["zeit", "zeit_ereignis"]) || erstes(b, ["zeit"]),
        ausgabestelle_id: erstes(e, ["ausgabestelle_id", "fa_r"]) || erstes(b, ["ausgabestelle_id"]),
        kasse: erstes(e, ["kasse"]),
        papierkarte_id: erstes(e, ["papierkarte_id"]), gutschein_id: erstes(e, ["gutschein_id"]) || erstes(b, ["gutschein_id"]),
        haushalt_id: erstes(e, ["haushalt_id"]) || erstes(b, ["haushalt_id"]), periode_id: erstes(e, ["periode_id"]),
        bezug: erstes(e, ["storno_von", "bezug_ereignis_id", "storniert_ereignis_id", "ereignis_ref", "buchung_id"]) || erstes(p, ["buchung_id"]),
        buchung_id: erstes(e, ["buchung_id"]) || erstes(b, ["buchung_id"]),
        positionen: (Array.isArray(e.positionen) ? e.positionen : (b.artikel_id ? [{ artikel_id: b.artikel_id, menge: b.menge, einheit: b.einheit }] : []))
          .filter(function (q) { return q && q.artikel_id && Number(q.menge) > 0; })
          .map(function (q) { return { artikel_id: q.artikel_id, menge: Number(q.menge), einheit: q.einheit || "" }; })
      };
      if (x.art === "storno") { if (x.bezug) storniert[x.bezug] = true; }
      else if (x.art === "ausgabe") ausgaben.push(x);
      else if (x.art === "wareneingang") eingaenge.push(x);
    });
    ausgaben = ausgaben.filter(function (x) { return !storniert[x.id] && !(x.buchung_id && storniert[x.buchung_id]); });
    return { roh: r, ausgaben: ausgaben, wareneingaenge: eingaenge, schema_version: d && d.schema_version };
  }
  /* Bei neuen Retail-Daten (storage-Event, BroadcastChannel, Fokus) einmal melden, wenn sich der Speicher geändert hat */
  function beobachte(neu) {
    var letzt = roh();
    function pruefe() { var r = roh(); if (r !== letzt) { letzt = r; neu(); } }
    global.addEventListener("storage", function (ev) { if (!ev.key || ev.key === SCHLUESSEL) pruefe(); });
    global.addEventListener("focus", pruefe);
    global.document.addEventListener("visibilitychange", function () { if (!global.document.hidden) pruefe(); });
    try { var bc = new global.BroadcastChannel(KANAL); bc.onmessage = pruefe; } catch (e) { /* ohne BroadcastChannel: storage-Event und Fokus */ }
  }
  global.FOODALLO_ABGLEICH = { SCHLUESSEL: SCHLUESSEL, KANAL: KANAL, lies: lies, beobachte: beobachte };
})(window);
