/**
 * FoodAllo Customer App — Demonstration: alle Gutscheine in die laufende Woche.
 *
 * Entscheidung (David): Alle Systeme zeigen die laufende Woche, Montag bis Sonntag, Europe/Berlin.
 * Der gemeinsame Ereignislog bleibt unverändert; verschoben wird nur zur Laufzeit, auf Kopien.
 *
 * Schema (abgestimmt mit der Desktopversion):
 *   - periode_id   FA-PER-<MontagJJJJMMTT>          → FA-PER-<Montag der laufenden Woche>
 *   - gutschein_id FA-V-<MontagJJJJMMTT>-<lfd. Nr.> → FA-V-<Montag der laufenden Woche>-<gleiche lfd. Nr.>
 *     Beispiel in der Woche ab 23.11.2026: FA-V-20261116-000123 → FA-V-20261123-000123.
 *   - IDs ohne Datum (FA-PK, FA-HH, FA-P, FA-R …) bleiben unverändert.
 *   - Einlösungen (REDEMPTION_POSTED/REVERSED) mit alten gutschein_id/periode_id werden gleich abgebildet
 *     und zählen damit gegen den Gutschein der laufenden Woche.
 * Bezugswoche ist die jüngste Woche im Log (dort: 16.–22.11.2026). Sie wird auf die laufende Woche gelegt;
 * ältere Logwochen rücken um denselben Abstand mit (bleiben Vergangenheit, keine doppelten Gutscheine).
 * IDs, deren Datum schon in der laufenden Woche oder später liegt, bleiben unverändert.
 * Zeitfelder von Gutschein- und Störungsereignissen (zeit_ereignis, beginn, ende, gueltig_von, gueltig_bis)
 * rücken um denselben Abstand, damit Status und Störungszeitraum zur laufenden Woche passen.
 */
(function (root) {
  "use strict";

  var TAG_MS = 86400000;
  var ID_RE = /^(FA-(?:PER|V)-)(\d{8})(\b.*)?$/;
  var ZEIT_RE = /^(\d{4})-(\d{2})-(\d{2})(.*)$/;
  var ZEITFELDER = { zeit_ereignis: 1, beginn: 1, ende: 1, gueltig_von: 1, gueltig_bis: 1 };
  var TYPEN = /^(VOUCHER_|REDEMPTION_|SUPPLY_DISRUPTION_)/;

  function ymdZuTag(ymd) {
    return Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)) / TAG_MS;
  }
  function tagZuYmd(tag) {
    var d = new Date(tag * TAG_MS);
    return d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
  }

  /** Jüngster Montag (JJJJMMTT) aus den periode_id der ausgestellten Gutscheine im Log. */
  function bezugsMontag(ereignisse) {
    var max = "";
    (ereignisse || []).forEach(function (e) {
      var g = e && e.typ === "VOUCHER_ISSUED" && e.payload && e.payload.gutschein;
      var m = g && ID_RE.exec(String(g.periode_id || ""));
      if (m && m[2] > max) max = m[2];
    });
    return max || null;
  }

  /**
   * Abbildung für die laufende Woche. zielMontag: JJJJMMTT (z. B. periodFromDate(now).start_ymd).
   * Liefert { bezug, ziel, tage } oder null, wenn nichts zu verschieben ist.
   */
  function abbildung(ereignisse, zielMontag) {
    var bezug = bezugsMontag(ereignisse);
    if (!bezug || !zielMontag || !/^\d{8}$/.test(String(zielMontag))) return null;
    var tage = ymdZuTag(String(zielMontag)) - ymdZuTag(bezug);
    if (!tage) return null;
    return { bezug: bezug, ziel: String(zielMontag), tage: tage };
  }

  /** FA-PER-/FA-V-ID mit Datum bis zur Bezugswoche auf die laufende Woche abbilden; sonst unverändert. */
  function idAbbilden(id, ab) {
    if (!ab || typeof id !== "string") return id;
    var m = ID_RE.exec(id);
    if (!m) return id;
    if (m[2] > tagZuYmd(ymdZuTag(ab.bezug) + 6)) return id; // schon laufende Woche (oder später)
    return m[1] + tagZuYmd(ymdZuTag(m[2]) + ab.tage) + (m[3] || "");
  }

  function zeitAbbilden(s, ab) {
    if (!ab || typeof s !== "string") return s;
    var m = ZEIT_RE.exec(s);
    if (!m) return s;
    var ymd = m[1] + m[2] + m[3];
    if (ymd > tagZuYmd(ymdZuTag(ab.bezug) + 6)) return s;
    var neu = tagZuYmd(ymdZuTag(ymd) + ab.tage);
    return neu.slice(0, 4) + "-" + neu.slice(4, 6) + "-" + neu.slice(6, 8) + m[4];
  }

  function tief(wert, ab, schluessel) {
    if (Array.isArray(wert)) return wert.map(function (x) { return tief(x, ab, null); });
    if (wert && typeof wert === "object") {
      var out = {};
      Object.keys(wert).forEach(function (k) { out[k] = tief(wert[k], ab, k); });
      return out;
    }
    if (typeof wert !== "string") return wert;
    if (schluessel && ZEITFELDER[schluessel]) return zeitAbbilden(wert, ab);
    if (schluessel === "periode_id" || schluessel === "gutschein_id") return idAbbilden(wert, ab);
    return wert;
  }

  /** Kopie eines Gutscheins (z. B. aus gutscheine-shared.json) in der laufenden Woche. */
  function gutscheinAbbilden(g, ab) {
    return ab ? tief(g, ab, null) : g;
  }

  /** Kopien der Ereignisse; nur Gutschein-, Einlösungs- und Störungsereignisse werden verschoben. */
  function ereignisseAbbilden(ereignisse, ab) {
    if (!ab) return ereignisse || [];
    return (ereignisse || []).map(function (e) {
      if (!e || !TYPEN.test(String(e.typ || ""))) return e;
      return tief(e, ab, null);
    });
  }

  var api = {
    bezugsMontag: bezugsMontag,
    abbildung: abbildung,
    idAbbilden: idAbbilden,
    zeitAbbilden: zeitAbbilden,
    gutscheinAbbilden: gutscheinAbbilden,
    ereignisseAbbilden: ereignisseAbbilden
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FAWoche = api;
})(typeof window !== "undefined" ? window : globalThis);
