/* Abgleich Retail App -> Desktopversion (Demo: nur auf diesem Gerät, gleicher Browser und gleiche Herkunft).
 * Format laut beta/data/ABGLEICH-RETAIL-DESKTOP.md: localStorage „foodallo.abgleich.retail.v1“ =
 * { schema: "foodallo.abgleich.retail", version: 1, ereignisse: [{ ereignis_id, typ: ausgabe|storno|wareneingang, zeit,
 *   ausgabestelle_id, kasse, buchung_id, gutschein_id, papierkarte_id, haushalt_id, periode_id, positionen[] }] }.
 * Signale: storage-Event und BroadcastChannel „foodallo-abgleich“. Die Desktopversion liest nur; gemeinsamer Log und
 * Datendateien bleiben unverändert. Doppelte ereignis_id zählen einmal; ein Storno hebt die Ausgabe mit derselben buchung_id auf. */
(function (global) {
  "use strict";
  var SCHLUESSEL = "foodallo.abgleich.retail.v1", KANAL = "foodallo-abgleich", SCHEMA = "foodallo.abgleich.retail";
  function roh() { try { return global.localStorage.getItem(SCHLUESSEL) || ""; } catch (e) { return ""; } }
  function lies() {
    var d = null;
    try { d = JSON.parse(roh() || "null"); } catch (e) { d = null; }
    var liste = d && d.schema === SCHEMA && d.version === 1 && Array.isArray(d.ereignisse) ? d.ereignisse : [];
    var gesehen = {}, storniert = {}, ausgaben = [], wareneingaenge = [];
    liste.forEach(function (x) {
      if (!x || !x.ereignis_id || gesehen[x.ereignis_id]) return;
      gesehen[x.ereignis_id] = true;
      if (x.typ === "storno") storniert[x.buchung_id] = true;
      else if (x.typ === "ausgabe") ausgaben.push(x);
      else if (x.typ === "wareneingang") wareneingaenge.push(x);
    });
    return { ausgaben: ausgaben.filter(function (x) { return !storniert[x.buchung_id]; }), wareneingaenge: wareneingaenge };
  }
  /* Bei neuen Retail-Einträgen (storage-Event, BroadcastChannel, Fokus) neu anzeigen, wenn sich der Speicher geändert hat */
  function beobachte(neu) {
    var letzt = roh();
    function pruefe() { var r = roh(); if (r !== letzt) { letzt = r; neu(); } }
    global.addEventListener("storage", function (ev) { if (ev.key === SCHLUESSEL) pruefe(); });
    global.addEventListener("focus", pruefe);
    global.document.addEventListener("visibilitychange", function () { if (!global.document.hidden) pruefe(); });
    if (typeof global.BroadcastChannel === "function") new global.BroadcastChannel(KANAL).onmessage = function (m) { if (m.data && m.data.schema === SCHEMA) pruefe(); };
  }
  global.FOODALLO_ABGLEICH = { SCHLUESSEL: SCHLUESSEL, lies: lies, beobachte: beobachte };
})(window);
