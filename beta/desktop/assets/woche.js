/* Laufende Woche (Mo–So, Europe/Berlin) für die Desktopversion.
 * Die Szenario-Daten (daten.js, ereignislog.js) bleiben als Dateien unverändert (Ereignislog append-only).
 * Zur Laufzeit werden im Speicher alle Szenario-Zeitstempel um ganze Wochen auf die laufende Woche verschoben
 * (Wochentage und Reihenfolge bleiben) und datierte IDs auf den Montag der laufenden Woche abgebildet:
 * FA-PER-{MontagJJJJMMTT}, FA-V-{MontagJJJJMMTT}-{laufende Nummer}. IDs ohne Datum (FA-PK, FA-HH, FA-P) bleiben. */
(function (global) {
  "use strict";
  var D = global.FOODALLO_DATEN;
  if (!D || !D.meta || !/^FA-PER-\d{8}$/.test(D.meta.periode_aktuell || "")) return;
  function ymd(d) { return d.toISOString().slice(0, 10); }
  function utc(s) { return new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))); }
  function montagBerlin(jetzt) {
    var t = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(jetzt || new Date());
    var d = utc(t); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return ymd(d);
  }
  var p = D.meta.periode_aktuell.slice(7);
  var szenarioMontag = p.slice(0, 4) + "-" + p.slice(4, 6) + "-" + p.slice(6, 8);
  var montag = montagBerlin();
  var tage = Math.round((utc(montag) - utc(szenarioMontag)) / 86400000); /* immer ganze Wochen */
  function datum(s) { var d = utc(s); d.setUTCDate(d.getUTCDate() + tage); return ymd(d); }
  /* ISO-Datum bzw. Zeitstempel verschieben; Uhrzeit und Offset bleiben */
  function zeit(s) { return (typeof s === "string" && /^\d{4}-\d\d-\d\d/.test(s)) ? datum(s.slice(0, 10)) + s.slice(10) : s; }
  function id(s) {
    return s.replace(/^(FA-(?:PER|V)-)(\d{4})(\d\d)(\d\d)(?=$|-)/, function (m, pre, y, mo, da) { return pre + datum(y + "-" + mo + "-" + da).replace(/-/g, ""); });
  }
  var NICHT = { stichtag: 1, generiert_am: 1, geburtsdatum: 1 }; /* Statistik-Stichtage und Metadaten bleiben */
  function wert(v) { return typeof v === "string" ? (/^FA-(PER|V)-\d{8}/.test(v) ? id(v) : zeit(v)) : v; }
  function schiebe(o) {
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) o[i] = (o[i] && typeof o[i] === "object") ? schiebe(o[i]) : wert(o[i]); return o; }
    if (o && typeof o === "object") Object.keys(o).forEach(function (k) { if (NICHT[k]) return; o[k] = (o[k] && typeof o[k] === "object") ? schiebe(o[k]) : wert(o[k]); });
    return o;
  }
  if (tage !== 0) {
    ["perioden", "personen", "haushalte", "bestaende", "gutscheine", "buchungen", "wareneingaenge", "rezepte", "papierkarten"].forEach(function (k) { if (D[k]) schiebe(D[k]); });
    D.meta.periode_aktuell = id(D.meta.periode_aktuell);
    Object.keys(D.meta).forEach(function (k) { if (/^reservierte_gutscheine_/.test(k)) schiebe(D.meta[k]); });
    if (Array.isArray(global.EREIGNISLOG)) global.EREIGNISLOG = schiebe(JSON.parse(JSON.stringify(global.EREIGNISLOG)));
  }
  global.FOODALLO_WOCHE = { montag: montag, szenario_montag: szenarioMontag, tage: tage, datum: datum, zeit: zeit, id: id };
})(window);
