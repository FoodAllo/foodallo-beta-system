/**
 * FoodAllo – Fachverfahren Lebensmittelversorgung, Desktopversion (Beta).
 * Sichtrechte ausschließlich über FOODALLO_ZUGRIFF.pruefeSichtrecht (assets/zugriff.js).
 * Interne Kennungen (Person, Haushalt, Gutschein, Störung, Behörde, Ereignis) bleiben in den Daten
 * und werden nie angezeigt. Ausnahme: Kartennummer auf der gedruckten Lebensmittelkarte.
 * Schema v1.2 (verbindlich). Neue Entscheidungen der Meldebehörde werden lokal (localStorage) gespeichert und als
 * Übermittlungsdatei bereitgestellt; angehängt wird nur über die Werkzeuge in tools/ (Kernprüfung, append-only).
 */
(function () {
  "use strict";

  var D = window.FOODALLO_DATEN;
  var A = window.FOODALLO_AMTLICH;
  var Z = window.FOODALLO_ZUGRIFF;
  var K = window.FOODALLO_KARTEN;
  var REG = window.MELDEREGISTER || { eintraege: [], platzhalter: true };

  if (!D || !A || !Z || !K) {
    document.body.innerHTML = "<p style='padding:2em'>Die Anwendung konnte nicht vollständig geladen werden. Bitte alle Dateien im Ordner belassen und index.html erneut öffnen.</p>";
    return;
  }

  var STELLE_MELDEBEHOERDE = "FA-AUTH-FROHBURG-MELDEBEHOERDE"; /* intern */
  var PERIODE_LAUFEND = D.meta.periode_aktuell;
  var SPEICHER = {
    sitzung: "foodallo.beta.sitzung",
    entscheidungen: "foodallo.beta.identitaet.v1",
    schalter: "foodallo.beta.schaltererfassung.v1",
    druck: "foodallo.beta.druckvermerk.v1"
  };

  /* ---------- Dienststellen und Arbeitsplätze ---------- */
  var DIENSTSTELLEN = {
    ROLE_STADT_FROHBURG: {
      name: "Musterstadt", amt: "Pass- und Meldebehörde",
      arbeitsplaetze: ["Sachbearbeitung Meldewesen", "Ausgabe Lebensmittelkarten"],
      ansichten: ["arbeitskorb", "schalter", "haushalte", "karten", "register", "ausgabestellen"],
      gebiet: "Musterstadt"
    },
    ROLE_LRA_LK_LEIPZIG: {
      name: "Landratsamt Landkreis Leipzig", amt: "",
      arbeitsplaetze: ["Versorgung, Bestands- und Ausgabeübersicht", "Katastrophenschutz"],
      ansichten: ["uebersicht", "stoerungen", "ausgabestellen", "bestaende"],
      gebiet: "Landkreis Leipzig"
    },
    ROLE_LDS: {
      name: "Landesdirektion Sachsen", amt: "",
      arbeitsplaetze: ["Versorgung, Bestands- und Ausgabeübersicht", "Katastrophenschutz"],
      ansichten: ["uebersicht", "stoerungen", "ausgabestellen", "bestaende"],
      gebiet: "Freistaat Sachsen"
    },
    ROLE_SMI: {
      name: "Sächsisches Staatsministerium des Innern", amt: "",
      arbeitsplaetze: ["Lagezentrum", "Bevölkerungsschutz"],
      ansichten: ["uebersicht", "stoerungen", "ausgabestellen", "bestaende"],
      gebiet: "Freistaat Sachsen"
    },
    ROLE_BMLEH: {
      name: "Bundesministerium für Landwirtschaft, Ernährung und Heimat", amt: "",
      arbeitsplaetze: ["Ernährungsnotfallvorsorge", "Bestands- und Ausgabeübersicht"],
      ansichten: ["uebersicht", "stoerungen", "ausgabestellen", "bestaende"],
      gebiet: "Bundesgebiet"
    },
    ROLE_BLE: {
      name: "Bundesanstalt für Landwirtschaft und Ernährung", amt: "",
      arbeitsplaetze: ["Ernährungsnotfallvorsorge", "Bestands- und Ausgabeübersicht"],
      ansichten: ["uebersicht", "stoerungen", "ausgabestellen", "bestaende"],
      gebiet: "Bundesgebiet"
    }
  };
  var REIHENFOLGE = ["ROLE_STADT_FROHBURG", "ROLE_LRA_LK_LEIPZIG", "ROLE_LDS", "ROLE_SMI", "ROLE_BMLEH", "ROLE_BLE"];
  var ANSICHT_TITEL = {
    arbeitskorb: "Arbeitskorb Identitätsprüfung", schalter: "Erfassung am Schalter", haushalte: "Haushalte", karten: "Lebensmittelkarten",
    register: "Melderegister", ausgabestellen: "Ausgabestellen", uebersicht: "Bestands- und Ausgabeübersicht", stoerungen: "Versorgungsstörungen",
    bestaende: "Bestände"
  };

  var state = {
    rolle: null, arbeitsplatz: "", kennung: "", ansicht: null,
    filter: null, person: null, haushalt: null, periode: PERIODE_LAUFEND, karteId: null, format: "a4",
    druck: false, suche: "", ablehnen: false
  };

  /* ---------- Hilfen ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return K.escapeHtml(s); }
  function fmtZahl(n, nk) {
    if (n == null || n === "" || (typeof n === "number" && isNaN(n))) return "—";
    return Number(n).toLocaleString("de-DE", { maximumFractionDigits: nk || 0, minimumFractionDigits: nk || 0 });
  }
  function datum(s) {
    if (!s) return "—";
    var t = String(s).slice(0, 10).split("-");
    return t.length === 3 ? t[2] + "." + t[1] + "." + t[0] : esc(s);
  }
  function datumZeit(s) {
    if (!s) return "—";
    var z = String(s).slice(11, 16);
    return datum(s) + (z ? ", " + z + " Uhr" : "");
  }
  function lesen(key, std) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : std; } catch (e) { return std; }
  }
  function schreiben(key, v) {
    try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* Speicher nicht verfügbar */ }
  }
  function zweistellig(n) { return (n < 10 ? "0" : "") + n; }
  /* ISO 8601 mit Offset in Europe/Berlin */
  function jetztBerlin() {
    var d = new Date();
    var teile = {};
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
      .formatToParts(d).forEach(function (p) { teile[p.type] = p.value; });
    var std = teile.hour === "24" ? "00" : teile.hour;
    var lokal = Date.UTC(+teile.year, +teile.month - 1, +teile.day, +std, +teile.minute, +teile.second);
    var off = Math.round((lokal - Math.floor(d.getTime() / 1000) * 1000) / 60000);
    var vz = off >= 0 ? "+" : "-"; off = Math.abs(off);
    return teile.year + "-" + teile.month + "-" + teile.day + "T" + std + ":" + teile.minute + ":" + teile.second + vz + zweistellig(Math.floor(off / 60)) + ":" + zweistellig(off % 60);
  }
  function uuid4() {
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function nummer(id) { var m = String(id || "").match(/(\d{6})$/); return m ? m[1] : ""; }
  function vorgangsnummer(personId) { return "Vorgang 2026/" + nummer(personId); }
  function haushaltNr(hhId) { return String(parseInt(nummer(hhId), 10) || ""); }

  function artikel(id) {
    for (var i = 0; i < D.artikel.length; i++) if (D.artikel[i].artikel_id === id) return D.artikel[i];
    return { artikel_id: id, bezeichnung_de: id, einheit: "" };
  }
  function periodeObj(id) {
    for (var i = 0; i < D.perioden.length; i++) if (D.perioden[i].periode_id === id) return D.perioden[i];
    return D.perioden[D.perioden.length - 1];
  }
  function periodeText(p) { return datum(p.beginn) + " – " + datum(p.ende) + (p.status === "offen" ? " (Demonstrationszeitraum)" : ""); }
  function letztePeriodeGeschlossen() {
    var g = D.perioden.filter(function (p) { return p.status === "geschlossen"; });
    return g.length ? g[g.length - 1].periode_id : PERIODE_LAUFEND;
  }
  /* Arbeitsbestand = Melderegister (window.MELDEREGISTER). Der Altbestand der früheren Demo-Kohorte
     (FOODALLO_DATEN.personen/haushalte) bleibt in den Daten und im Log, wird hier aber nicht geführt. */
  var HH = {}, PERS = {}, PERSONEN = [], HAUSHALTE = [];
  (REG.haushalte || []).forEach(function (h) { HH[h.haushalt_id] = h; HAUSHALTE.push(h); });
  (REG.eintraege || []).forEach(function (e) { PERS[e.person_id] = e; PERSONEN.push(e); });
  /* Demonstrationshaushalt Becker (assets/demo_becker.js, 1:1 aus beta/data/demo-becker.json): nur Haushaltsliste und
     Lebensmittelkarte, nicht im Melderegister, nicht am Schalter, nie im gemeinsamen Log. */
  var BECKER = window.FOODALLO_DEMO_BECKER;
  if (BECKER && BECKER.demo) {
    var ba = BECKER.anschrift;
    var bhh = { haushalt_id: BECKER.haushalt_id, ags: BECKER.ags, groesse: BECKER.personen.length, kanal: BECKER.kanal, demo: true,
      person_ids: BECKER.personen.map(function (p) { return p.person_id; }), vorstand: BECKER.personen[0].person_id,
      strasse: ba.strasse, hausnummer: ba.hausnummer, plz: ba.plz, ort: ba.ort, ortsteil: ba.ortsteil };
    BECKER.personen.forEach(function (p) {
      PERS[p.person_id] = { person_id: p.person_id, haushalt_id: BECKER.haushalt_id, vornamen: p.vornamen, familienname: p.familienname,
        rolle_im_haushalt: p.rolle_im_haushalt, altersgruppe: p.altersgruppe, kanal: BECKER.kanal, ergaenzt: true, demo_status: p.verifikation.status,
        strasse: ba.strasse, hausnummer: ba.hausnummer, plz: ba.plz, ort: ba.ort, ortsteil: ba.ortsteil };
    });
    HH[bhh.haushalt_id] = bhh; HAUSHALTE.push(bhh);
  }

  function ausgabestellen() {
    var s = window.FOODALLO_AUSGABESTELLEN;
    return (s && s.ausgabestellen && s.ausgabestellen.length) ? s.ausgabestellen : (D.ausgabestellen || []);
  }
  function stelleById(id) {
    var l = ausgabestellen();
    for (var i = 0; i < l.length; i++) if (l[i].ausgabestelle_id === id) return l[i];
    return null;
  }
  /* Sichtbarer Name, beim Stammdaten-Export vorberechnet (Feld anzeige_eindeutig):
     exakt der Stammdaten-Name (anzeigename, sonst name), nur Dubletten mit „, Straße Hausnummer“. Fallback: anzeigename, sonst name.
     Kein eigenes Zusammensetzen aus Name und Ortsteil. „OSM“ wird für die Anzeige ausgeschrieben. */
  function stelleName(st) {
    if (!st) return "unbekannte Ausgabestelle";
    return String(st.anzeige_eindeutig || st.anzeigename || st.name || "").replace(/\bOSM\b/g, "OpenStreetMap");
  }
  function istKern(st) { return st && (st.rolle === "kern" || st.rolle === "kern_insulin"); }
  var TYP_DE = {
    supermarket: "Supermarkt", convenience: "Lebensmittelgeschäft", pharmacy: "Apotheke", bakery: "Bäckerei",
    butcher: "Fleischerei", farm: "Hofladen", beverages: "Getränkemarkt", chemist: "Drogerie", kiosk: "Kiosk",
    wholesale: "Großhandel", sonstige: "Sonstige"
  };
  function typLabel(t) { return TYP_DE[t] || "Sonstige"; }
  function log() { return window.EREIGNISLOG || []; }

  /* ---------- Melderegister ---------- */
  function registerEintraege() { return PERSONEN; }
  function vollerName(e) { return e ? (e.vornamen + " " + e.familienname) : ""; }
  function anschrift(e) {
    if (!e) return "";
    /* wie formatiereOrt im Kern: „Straße Nr, 12345 Musterstadt“ bzw. „Straße Nr, 12345 Musterstadt (Musterdorf)“ */
    return ((e.strasse || "") + " " + (e.hausnummer || "")).trim() + ", " + ((e.plz || "") + " " + (e.ort || "") + ((e.ortsteil && e.ortsteil !== e.ort) ? " (" + e.ortsteil + ")" : "")).trim();
  }
  function personName(pid) { var e = PERS[pid]; return e ? vollerName(e) : "unbekannte Person"; }
  function ergaenztTag(e) { return e && e.ergaenzt ? " <span class='ergaenzt' title='Angabe ergänzt, nicht aus der Einwohnermeldeliste'>ergänzt</span>" : ""; }
  function haushaltName(hh) { var v = PERS[hh.vorstand || hh.person_ids[0]]; return "Haushalt " + (v ? v.familienname : ""); }

  /* ---------- Anträge: Registrierung aus dem gemeinsamen Log oder Erfassung am Schalter (lokal) ---------- */
  /* Prüfweg je Haushalt (Festlegung 17.11.2026; nur Anzeige, nicht Teil des Schemas):
     schalter = Antrag aus der FoodAllo-App, Prüfung am Schalter (offener Vorgang);
     online_ausweis = in der Oberfläche als bestätigt geführt, bis das IDENTITY_VERIFIED im gemeinsamen Log steht;
     schalter_erfassung = Erfassung am Schalter, Bezug über die Lebensmittelkarte (Papier). */
  var PRUEFWEG = {
    "FA-HH-14729140-000122": { weg: "schalter", antrag_zeit: "2026-11-17T08:42:00+01:00" },
    "FA-HH-14729140-000123": { weg: "online_ausweis", antrag_zeit: "2026-11-16T18:05:00+01:00", pruef_zeit: "2026-11-16T18:07:00+01:00" },
    "FA-HH-14729140-000124": { weg: "schalter_erfassung" }
  };
  var PRUEFWEG_DE = { schalter: "Prüfung am Schalter", online_ausweis: "Online-Ausweis", schalter_erfassung: "Erfassung am Schalter" };
  function pruefweg(pid) { var e = PERS[pid]; var w = e && PRUEFWEG[e.haushalt_id]; return w ? w.weg : (e && e.kanal === "papier" ? "schalter_erfassung" : "schalter"); }
  function logIdentitaet(pid) { return log().some(function (ev) { return ev.typ === "IDENTITY_VERIFIED" && ev.payload && ev.payload.person_id === pid; }); }
  function schalterLokal() { return lesen(SPEICHER.schalter, []); }
  function antrag(pid) {
    var l = log();
    for (var i = 0; i < l.length; i++) {
      var ev = l[i];
      if (ev.typ === "PERSON_REGISTERED" && ev.payload && ev.payload.person && ev.payload.person.person_id === pid) {
        var schalter = ev.payload.kanal === "papier";
        return { zeit: ev.zeit_ereignis, weg: schalter ? "schalter" : "app", altersgruppe: ev.payload.person.altersgruppe, lokal: false, ausweis: schalter, uebermittelt: schalter };
      }
    }
    var s = schalterLokal();
    for (var j = 0; j < s.length; j++) if (s[j].person_ids.indexOf(pid) !== -1) return { zeit: s[j].zeit, weg: "schalter", altersgruppe: PERS[pid].altersgruppe, lokal: true, ausweis: s[j].ausweis_geprueft, exportiert_am: s[j].exportiert_am };
    var w = PERS[pid] && PRUEFWEG[PERS[pid].haushalt_id];
    if (w && w.antrag_zeit) return { zeit: w.antrag_zeit, weg: "app", altersgruppe: PERS[pid].altersgruppe, lokal: false, vorlaeufig: true };
    return null;
  }

  /* ---------- Status Identitätsprüfung: zeitlich letztes Ereignis gilt ---------- */
  function entscheidungenLokal() { return lesen(SPEICHER.entscheidungen, []); }
  function statusVerlauf(pid) {
    var v = [];
    var a = antrag(pid);
    if (a) v.push({ zeit: a.zeit, art: "eingang", text: a.weg === "app" ? "Antrag über die FoodAllo-App eingegangen" : "Am Schalter erfasst" + (a.lokal ? (a.exportiert_am ? " · übermittelt " + datumZeit(a.exportiert_am) : " · noch nicht übermittelt") : " · Personalausweis vorgelegt") });
    log().forEach(function (ev) {
      if (ev.typ === "IDENTITY_VERIFIED" && ev.payload && ev.payload.person_id === pid) {
        var s = ev.payload.verifikation.status;
        v.push({ zeit: ev.zeit_ereignis, art: "status", status: s, text: s === "offen" ? "Prüfung angelegt" : (s === "bestaetigt" ? "Identität bestätigt" + (pruefweg(pid) === "online_ausweis" ? " (Online-Ausweisfunktion)" : (pruefweg(pid) === "schalter_erfassung" ? " (Erfassung am Schalter)" : "")) : "Antrag abgelehnt"), quelle: "gemeinsam" });
      }
    });
    var w = PERS[pid] && PRUEFWEG[PERS[pid].haushalt_id];
    if (w && w.weg === "online_ausweis" && !logIdentitaet(pid)) v.push({ zeit: w.pruef_zeit, art: "status", status: "bestaetigt", text: "Identität über die Online-Ausweisfunktion bestätigt · Übernahme in den gemeinsamen Bestand ausstehend", quelle: "online" });
    entscheidungenLokal().forEach(function (e) {
      if (e.person_id !== pid) return;
      v.push({ zeit: e.zeit, art: "status", status: e.status, text: (e.status === "bestaetigt" ? "Identität bestätigt" : "Antrag abgelehnt") + (e.begruendung ? " – " + e.begruendung : "") + (e.kennung ? " (" + e.kennung + ")" : "") + (e.exportiert_am ? " · übermittelt " + datumZeit(e.exportiert_am) : " · noch nicht übermittelt"), quelle: "lokal" });
    });
    v.sort(function (x, y) { return x.zeit < y.zeit ? -1 : x.zeit > y.zeit ? 1 : 0; });
    return v;
  }
  function aktuellerStatus(pid) {
    if (PERS[pid] && PERS[pid].demo_status) return { status: PERS[pid].demo_status, zeit: null, lokal: false, quelle: "demo" };
    var v = statusVerlauf(pid).filter(function (x) { return x.art === "status"; });
    if (v.length) return { status: v[v.length - 1].status, zeit: v[v.length - 1].zeit, lokal: v[v.length - 1].quelle === "lokal", quelle: v[v.length - 1].quelle };
    var a = antrag(pid);
    return { status: a ? "offen" : "ausstehend", zeit: a ? a.zeit : null, lokal: false };
  }
  var STATUS_DE = { offen: "offen", bestaetigt: "bestätigt", abgelehnt: "abgelehnt", ausstehend: "Antrag ausstehend" };
  function statusPill(s) { return "<span class='status " + (s === "ausstehend" ? "grau" : esc(s)) + "'>" + esc(STATUS_DE[s] || s) + "</span>"; }

  var ALTER_DE = { adult: "Erwachsene Person (18 bis 64 Jahre)", elderly: "Ältere Person (ab 65 Jahre)", child: "Kind (unter 18 Jahre)", infant: "Kleinkind (unter 3 Jahre)" };
  var KANAL_DE = { app: "FoodAllo-App", papier: "Lebensmittelkarte (Papier)", schalter: "Vorsprache am Schalter" };
  function alterAm(geb, stichtag) {
    if (!geb) return null;
    var g = geb.split("-").map(Number), s = stichtag.split("-").map(Number);
    var a = s[0] - g[0];
    if (s[1] < g[1] || (s[1] === g[1] && s[2] < g[2])) a--;
    return a;
  }
  function passtAlter(gruppe, alter) {
    if (alter == null || !gruppe) return null;
    if (gruppe === "infant") return alter < 3;
    if (gruppe === "child") return alter < 18;
    if (gruppe === "elderly") return alter >= 65;
    return alter >= 18 && alter < 65;
  }
  var PLZ_FROHBURG = ["12345"]; /* fiktive PLZ der Musterstadt */
  function abgleich(e) {
    var z = [], a = antrag(e.person_id);
    z.push({ pruef: "Antrag", erg: a ? "ok" : "offen", text: a ? (a.weg === "app" ? "über die FoodAllo-App, " : "am Schalter, ") + datumZeit(a.zeit) : "noch nicht eingegangen" });
    var wohnort = /musterstadt|frohburg/i.test(e.ort || "") || PLZ_FROHBURG.indexOf(e.plz) !== -1;
    z.push({ pruef: "Wohnsitz in der Musterstadt", erg: wohnort ? "ok" : "nein", text: wohnort ? "übereinstimmend" + (e.ortsteil ? " (Ortsteil " + e.ortsteil + ")" : "") : "abweichend: " + (e.ort || "—") });
    var hw = e.wohnungsstatus !== "Nebenwohnsitz";
    z.push({ pruef: "Hauptwohnsitz", erg: hw ? "ok" : "nein", text: hw ? "ja" : "nur Nebenwohnsitz" });
    if (a) {
      var alter = alterAm(e.geburtsdatum, "2026-11-17"), pa = passtAlter(a.altersgruppe, alter);
      z.push({ pruef: "Altersangabe im Antrag", erg: pa == null ? "offen" : (pa ? "ok" : "nein"), text: pa == null ? "nicht prüfbar" : (alter + " Jahre laut Register, " + (pa ? "passt" : "passt nicht") + " zur Angabe „" + (ALTER_DE[a.altersgruppe] || "") + "“") });
    }
    if (e.rolle_im_haushalt === "Haushaltsvorstand") {
      if (a && a.weg === "schalter") z.push({ pruef: "Personalausweis", erg: a.ausweis ? "ok" : "offen", text: a.ausweis ? "am Schalter vorgelegt und geprüft (Nr. " + (e.ausweisnummer || "—") + ")" : "nicht vorgelegt" });
      else if (pruefweg(e.person_id) === "schalter") z.push({ pruef: "Personalausweis", erg: "offen", text: (e.ausweisnummer ? "Nr. " + e.ausweisnummer + " im Register" : "keine Nummer im Register") + ", Vorlage am Schalter erforderlich" });
      else z.push({ pruef: "Personalausweis", erg: e.ausweisnummer ? "ok" : "offen", text: (e.ausweisnummer ? "Nr. " + e.ausweisnummer + " im Register" : "keine Nummer im Register") + (e.online_ausweis ? ", Online-Ausweisfunktion aktiviert" : "") });
    } else {
      z.push({ pruef: "Zugehörigkeit zum Haushalt", erg: "ok", text: (e.rolle_im_haushalt || "Haushaltsangehörige Person") + (e.ergaenzt ? " (Angabe ergänzt)" : "") });
    }
    return z;
  }
  function ergZeichen(erg) {
    if (erg === "ok") return "<span class='pruef-ok'>✓</span>";
    if (erg === "nein") return "<span class='pruef-nein'>✗</span>";
    return "<span class='pruef-offen'>?</span>";
  }

  /* ---------- Ereignisentwürfe (Schema v1.2), nur lokal, nie automatisch in den gemeinsamen Log ---------- */
  function huelle(typ, payload, zeit) {
    return { ereignis_id: "FA-E-" + uuid4(), typ: typ, zeit_ereignis: zeit, zeit_empfang: null, quelle_system: "desktop", payload: payload, schema_version: 1 };
  }
  function verifikation(status, zeit) { return { status: status, stelle: STELLE_MELDEBEHOERDE, verfahren: "synthetisch", zeit: zeit }; }
  function entscheide(pid, status, grund, nachweis) {
    var zeit = jetztBerlin();
    var l = entscheidungenLokal();
    l.push({ person_id: pid, status: status, begruendung: grund || "", nachweis: nachweis || "", zeit: zeit, kennung: state.kennung || "",
      ereignis: huelle("IDENTITY_VERIFIED", { person_id: pid, verifikation: verifikation(status, zeit) }, zeit), exportiert_am: null });
    schreiben(SPEICHER.entscheidungen, l);
  }
  function zuruecknehmen(pid) {
    var l = entscheidungenLokal();
    for (var i = l.length - 1; i >= 0; i--) if (l[i].person_id === pid && !l[i].exportiert_am) { l.splice(i, 1); break; }
    schreiben(SPEICHER.entscheidungen, l);
  }
  /* Erfassung am Schalter: PERSON_REGISTERED mit kanal=papier (Schreibrecht der Desktopversion erst ab Version 1.2) */
  function erfasseAmSchalter(hid, pids, ausweis) {
    var hh = HH[hid], zeit = jetztBerlin();
    var evs = pids.map(function (pid) {
      var e = PERS[pid];
      return huelle("PERSON_REGISTERED", {
        kanal: "papier",
        person: { person_id: pid, haushalt_id: hid, ags_wohnsitz: hh.ags, altersgruppe: e.altersgruppe, flags: e.flags || [], kanal: "papier",
          verifikation: verifikation("offen", zeit), anzeigename_demo: "Person " + nummer(pid) },
        haushalt: { haushalt_id: hid, ags: hh.ags, groesse: hh.groesse, person_ids: hh.person_ids.slice() }
      }, zeit);
    });
    var l = schalterLokal();
    l.push({ haushalt_id: hid, person_ids: pids, zeit: zeit, kennung: state.kennung || "", ausweis_geprueft: !!ausweis, ereignisse: evs, exportiert_am: null });
    schreiben(SPEICHER.schalter, l);
  }
  function schalterZuruecknehmen(hid) {
    var l = schalterLokal().filter(function (s) { return !(s.haushalt_id === hid && !s.exportiert_am); });
    schreiben(SPEICHER.schalter, l);
  }
  function offeneEreignisse() {
    var out = [];
    schalterLokal().forEach(function (s) { if (!s.exportiert_am) out = out.concat(s.ereignisse); });
    entscheidungenLokal().forEach(function (e) { if (!e.exportiert_am) out.push(e.ereignis); });
    return out.sort(function (a, b) { return a.zeit_ereignis < b.zeit_ereignis ? -1 : a.zeit_ereignis > b.zeit_ereignis ? 1 : 0; });
  }
  function alleEreignisse() {
    var out = [];
    schalterLokal().forEach(function (s) { out = out.concat(s.ereignisse); });
    entscheidungenLokal().forEach(function (e) { out.push(e.ereignis); });
    return out.sort(function (a, b) { return a.zeit_ereignis < b.zeit_ereignis ? -1 : a.zeit_ereignis > b.zeit_ereignis ? 1 : 0; });
  }
  function jsonl(evs) { return evs.length ? evs.map(function (e) { return JSON.stringify(e); }).join("\n") + "\n" : ""; }
  function exportiere() {
    var evs = offeneEreignisse();
    if (!evs.length) return;
    var text = jsonl(evs), t = jetztBerlin();
    var name = "meldebehoerde-frohburg-" + t.slice(0, 10).replace(/-/g, "") + "-" + t.slice(11, 19).replace(/:/g, "") + ".jsonl";
    var url = URL.createObjectURL(new Blob([text], { type: "application/x-ndjson" }));
    var a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
    var l = entscheidungenLokal(); l.forEach(function (e) { if (!e.exportiert_am) e.exportiert_am = t; }); schreiben(SPEICHER.entscheidungen, l);
    var s = schalterLokal(); s.forEach(function (e) { if (!e.exportiert_am) e.exportiert_am = t; }); schreiben(SPEICHER.schalter, s);
    window.__FA_LETZTER_EXPORT = text;
    render();
  }
  function exportMeldung() {
    var n = offeneEreignisse().length;
    if (!n) return "";
    return "<div class='meldung warn no-print'><strong>" + n + " Eintr" + (n === 1 ? "ag" : "äge") + " noch nicht übermittelt.</strong> " +
      "<button type='button' id='btn-export' class='primaer'>Übermittlungsdatei erstellen</button></div>";
  }
  function exportBinden() { if ($("btn-export")) $("btn-export").onclick = exportiere; }

  /* ---------- Sichtrechte ---------- */
  function darfFaelle() { return Z.pruefeSichtrecht(state.rolle, { typ: "person", ags: Z.AGS_FROHBURG }).erlaubt; }
  function darfKarten() { return Z.pruefeSichtrecht(state.rolle, { typ: "papierkarte", ags: Z.AGS_FROHBURG }).erlaubt; }
  function darfStellen() { return Z.pruefeSichtrecht(state.rolle, { typ: "bestand_stelle", ags: Z.AGS_FROHBURG }).erlaubt; }
  function darfAggregat(ags, ebene) { return Z.pruefeSichtrecht(state.rolle, { typ: "aggregat", ags: ags, aggregationsebene: ebene }).erlaubt; }
  function darfKennzahl(ags, ebene) { return Z.pruefeSichtrecht(state.rolle, { typ: "kennzahl", ags: ags, aggregationsebene: ebene }).erlaubt; }
  /* Fallzahlen über die zentrale Prüfung inkl. Kleinzahlunterdrückung */
  function fallzahl(n, ags) {
    var r = Z.pruefeSichtrecht(state.rolle, { typ: "kennzahl", kennzahl_typ: "fallzahl", anzahl: n, ags: ags });
    if (!r.erlaubt) return "—";
    if (r.unterdruecken) return "<span class='kleinzahl' title='Werte unter " + Z.KLEINZAHL_STANDARD + " werden nicht ausgewiesen'>unter " + Z.KLEINZAHL_STANDARD + "</span>";
    return fmtZahl(n, 0);
  }

  /* ---------- Kennzahlen Musterstadt ---------- */
  function kohorte() {
    var c = { haushalte: HAUSHALTE.length, personen: PERSONEN.length, bestaetigt: 0, offen: 0, abgelehnt: 0, ausstehend: 0, papier: 0, karten: 0 };
    PERSONEN.forEach(function (p) { c[aktuellerStatus(p.person_id).status]++; });
    HAUSHALTE.forEach(function (h) { if (h.kanal === "papier") { c.papier++; c.karten += kartenHH(h).length; } });
    return c;
  }
  function buchungen(periodeId) { return D.buchungen.filter(function (b) { return b.periode_id === periodeId; }); }
  function summe(liste, art) { var s = 0; liste.forEach(function (b) { if (b.artikel_id === art) s += Number(b.menge) || 0; }); return s; }
  function bestand(art) { var s = 0; D.bestaende.forEach(function (b) { if (b.artikel_id === art) s += Number(b.menge) || 0; }); return s; }
  function reichweite(art) {
    var s = 0;
    D.buchungen.forEach(function (b) { var t = String(b.zeit).slice(0, 10); if (b.artikel_id === art && t >= "2026-11-10" && t <= "2026-11-17") s += Number(b.menge); });
    var schnitt = s / 7;
    return schnitt > 0 ? bestand(art) / schnitt : null;
  }
  function stoerungen() {
    var akt = {};
    log().forEach(function (ev) {
      if (ev.typ === "SUPPLY_DISRUPTION_DECLARED") akt[ev.payload.stoerung_id] = { p: ev.payload, ende: null };
      if (ev.typ === "SUPPLY_DISRUPTION_ENDED" && akt[ev.payload.stoerung_id]) akt[ev.payload.stoerung_id].ende = ev.payload.ende || ev.zeit_ereignis;
    });
    return Object.keys(akt).map(function (k) { return akt[k]; });
  }
  function gemeindeName(ags) {
    var g = A.gemeinden_landkreis_leipzig;
    for (var i = 0; i < g.length; i++) if (g[i].ags === ags) return g[i].name;
    return "Gemeinde";
  }
  var STOERUNG_DE = { trinkwasser: "Trinkwasserversorgung" };

  /* ---------- Lebensmittelkarte (Entwurf) für Haushalte mit Bezug über Papier ---------- */
  function maxNr(liste, re) { var m = 0; liste.forEach(function (s) { var x = String(s).match(re); if (x) m = Math.max(m, parseInt(x[1], 10)); }); return m; }
  var NUMMERN = (function () {
    var pk = [], gs = [], per = PERIODE_LAUFEND.replace("FA-PER-", "");
    D.papierkarten.forEach(function (k) { pk.push(k.papierkarte_id); });
    D.gutscheine.forEach(function (g) { gs.push(g.gutschein_id); });
    log().forEach(function (ev) {
      var g = ev.payload && ev.payload.gutschein; if (g) { gs.push(g.gutschein_id); if (g.papierkarte_id) pk.push(g.papierkarte_id); }
      if (ev.payload && ev.payload.papierkarte_id) pk.push(ev.payload.papierkarte_id);
    });
    (D.meta.reservierte_gutscheine_20261116 || []).forEach(function (x) { gs.push(x); });
    return { pk: maxNr(pk, /^FA-PK-14729140-(\d{6})$/), gs: maxNr(gs, new RegExp("^FA-V-" + per + "-(\\d{6})$")), per: per };
  })();
  function papierCode(pkId) {
    var m = pkId.match(/^FA-PK-(\d{8})-(\d{6})$/), z = m[1] + m[2], r = 0;
    for (var i = 0; i < z.length; i++) r = (r * 10 + Number(z[i])) % 97;
    var pz = ("0" + (98 - (r * 100) % 97)).slice(-2);
    return { code_anzeige: pkId + "-" + pz, code_barcode: "FAPK" + z + pz };
  }
  /* Gutscheine des Haushalts im laufenden Zeitraum aus dem gemeinsamen Log, nach Anlass getrennt (v1.2):
     regulaer = Periodengutschein, stoerung = Zusatzgutschein bei Versorgungsstörung (eigene Karte bei Papier). */
  function gutscheineHH(hid) {
    var r = { regulaer: null, stoerung: [] };
    log().forEach(function (ev) {
      var g = ev.typ === "VOUCHER_ISSUED" && ev.payload && ev.payload.gutschein;
      if (!g || g.haushalt_id !== hid || g.periode_id !== PERIODE_LAUFEND) return;
      if (g.anlass === "stoerung") r.stoerung.push(g); else if (!r.regulaer) r.regulaer = g;
    });
    return r;
  }
  function stoerungAktiv(sid) {
    var aktiv = false;
    log().forEach(function (ev) {
      if (!ev.payload || ev.payload.stoerung_id !== sid) return;
      if (ev.typ === "SUPPLY_DISRUPTION_DECLARED") aktiv = !ev.payload.ende || ev.payload.ende > jetztBerlin();
      if (ev.typ === "SUPPLY_DISRUPTION_ENDED") aktiv = false;
    });
    return aktiv;
  }
  function wasserMenge(g) { var m = 0; (g.positionen || []).forEach(function (q) { if (q.artikel_id === "water") m += Number(q.zugeteilt_max) || 0; }); return m; }
  /* Alle Lebensmittelkarten eines Papierhaushalts: reguläre Karte (aus dem Log oder als Entwurf) und je Störung eine Zusatzkarte */
  function kartenHH(hh) {
    if (hh.kanal !== "papier") return [];
    if (hh.demo) return [{ art: "regulaer", berechtigt: hh.person_ids.slice(),
      karte: { papierkarte_id: BECKER.papierkarte_id, haushalt_id: BECKER.haushalt_id, code_anzeige: BECKER.code_anzeige, code_barcode: BECKER.code_barcode, status: "ausgestellt" },
      gutschein: { haushalt_id: BECKER.haushalt_id, kanal: "papier", papierkarte_id: BECKER.papierkarte_id, positionen: BECKER.positionen } }];
    var gs = gutscheineHH(hh.haushalt_id), out = [];
    var berechtigt = hh.person_ids.filter(function (pid) { return aktuellerStatus(pid).status === "bestaetigt"; });
    if (gs.regulaer && gs.regulaer.papierkarte_id) {
      var c0 = papierCode(gs.regulaer.papierkarte_id);
      out.push({ art: "regulaer", karte: { papierkarte_id: gs.regulaer.papierkarte_id, gutschein_id: gs.regulaer.gutschein_id, code_anzeige: c0.code_anzeige, code_barcode: c0.code_barcode, status: "ausgestellt" }, gutschein: gs.regulaer, berechtigt: berechtigt });
    } else {
      var e = karteEntwurf(hh);
      if (e) { e.art = "regulaer"; e.entwurf = true; out.push(e); }
    }
    gs.stoerung.forEach(function (g) {
      if (!g.papierkarte_id) return;
      var c = papierCode(g.papierkarte_id);
      out.push({ art: "stoerung", karte: { papierkarte_id: g.papierkarte_id, gutschein_id: g.gutschein_id, code_anzeige: c.code_anzeige, code_barcode: c.code_barcode, status: "ausgestellt" }, gutschein: g, berechtigt: berechtigt, aktiv: stoerungAktiv(g.stoerung_id) });
    });
    return out;
  }
  var KARTENART_DE = { regulaer: "Lebensmittelkarte", stoerung: "Zusatz Trinkwasser" };
  function karteEntwurf(hh) {
    if (hh.kanal !== "papier") return null;
    var berechtigt = hh.person_ids.filter(function (pid) { return aktuellerStatus(pid).status === "bestaetigt"; });
    if (!berechtigt.length) return null;
    var idx = HAUSHALTE.filter(function (h) { return h.kanal === "papier"; }).indexOf(hh) + 1;
    var pkId = "FA-PK-14729140-" + ("00000" + (NUMMERN.pk + idx)).slice(-6);
    var gsId = "FA-V-" + NUMMERN.per + "-" + ("00000" + (NUMMERN.gs + idx)).slice(-6);
    var pos = D.artikel.filter(function (a) { return a.periode_basis_vorschlag && a.artikel_id !== "water" && a.artikel_id !== "insulin"; }).map(function (a) {
      var menge = Math.round(a.periode_basis_vorschlag * berechtigt.length * 1000) / 1000;
      return { artikel_id: a.artikel_id, einheit: a.einheit, basiskontingent: menge, zugeteilt_max: menge, eingeloest: 0, rest: menge, personen_anzahl: berechtigt.length };
    });
    var c = papierCode(pkId);
    return {
      karte: { papierkarte_id: pkId, gutschein_id: gsId, haushalt_id: hh.haushalt_id, periode_id: PERIODE_LAUFEND, code_anzeige: c.code_anzeige, code_barcode: c.code_barcode, status: "entwurf" },
      gutschein: { gutschein_id: gsId, periode_id: PERIODE_LAUFEND, bezug: "haushalt", haushalt_id: hh.haushalt_id, kanal: "papier", positionen: pos, papierkarte_id: pkId },
      berechtigt: berechtigt
    };
  }

  /* ---------- Rahmen ---------- */
  function ds() { return DIENSTSTELLEN[state.rolle]; }
  function dsVoll() { var d = ds(); return d.name + (d.amt ? ", " + d.amt : ""); }
  function kopf() {
    $("kopf-dienststelle").textContent = dsVoll();
    $("kopf-nutzer").innerHTML = "Arbeitsplatz: <strong>" + esc(state.arbeitsplatz) + "</strong>" + (state.kennung ? " · " + esc(state.kennung) : "");
    $("kopf-stand").textContent = "Stand " + datumZeit(jetztBerlin());
    $("nav-liste").innerHTML = ds().ansichten.map(function (v) {
      var zahl = "";
      if (v === "arbeitskorb" && darfFaelle()) {
        var n = PERSONEN.filter(function (p) { return aktuellerStatus(p.person_id).status === "offen"; }).length;
        zahl = n ? "<span class='zahl'>" + n + "</span>" : "";
      }
      return "<li><a href='#" + v + "' data-view='" + v + "' class='" + (v === state.ansicht ? "aktiv" : "") + "'>" + esc(ANSICHT_TITEL[v]) + zahl + "</a></li>";
    }).join("");
    var zusatz = "";
    if (["ausgabestellen", "bestaende", "uebersicht"].indexOf(state.ansicht) !== -1) zusatz = "Bestände: Szenariodaten · Filialdaten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL) (https://www.openstreetmap.org/copyright) · keine Partnerschaft mit den genannten Geschäften";
    else if (darfFaelle()) zusatz = "Melderegister: Einwohnermeldeliste vom " + datum(REG.importiert_am) + " · ergänzte Angaben sind gekennzeichnet";
    $("fuss-zusatz").textContent = zusatz;
    document.title = (ANSICHT_TITEL[state.ansicht] || "Bereich") + " · " + ds().name + " · FoodAllo (Beta)";
  }
  function seitenTitel(titel, zusatz) {
    return "<h1>" + esc(titel) + "</h1>" + (zusatz ? "<p class='klein' style='margin-top:-8px'>" + zusatz + "</p>" : "");
  }
  function sperre(text) { return "<div class='sperre'><h2>Kein Zugriff</h2><p>" + esc(text) + "</p></div>"; }
  var NUR_MB = "Dieser Bereich steht nur der Pass- und Meldebehörde der Musterstadt zur Verfügung.";
  function sucheBinden(id) {
    var s = $(id);
    if (!s) return;
    s.oninput = function () { state.suche = s.value; state.person = null; render(); var n = $(id); n.focus(); n.setSelectionRange(n.value.length, n.value.length); };
  }
  function personLinksBinden(host) {
    host.querySelectorAll("a[data-person]").forEach(function (a) {
      a.onclick = function (ev) { ev.preventDefault(); state.person = a.getAttribute("data-person"); state.filter = "alle"; state.suche = ""; geheZu("arbeitskorb"); };
    });
  }

  /* ---------- Arbeitskorb ---------- */
  function renderArbeitskorb(host) {
    if (!darfFaelle()) { host.innerHTML = seitenTitel(ANSICHT_TITEL.arbeitskorb) + sperre(NUR_MB); return; }
    var alle = PERSONEN.map(function (p) { return { p: p, s: aktuellerStatus(p.person_id), a: antrag(p.person_id) }; });
    var gruppen = {
      offen: alle.filter(function (x) { return x.s.status === "offen"; }),
      ausstehend: alle.filter(function (x) { return x.s.status === "ausstehend"; }),
      erledigt: alle.filter(function (x) { return x.s.status === "bestaetigt" || x.s.status === "abgelehnt"; }),
      alle: alle
    };
    if (!gruppen[state.filter]) state.filter = gruppen.offen.length ? "offen" : "alle";
    var liste = gruppen[state.filter];
    if (state.suche) {
      var q = state.suche.toLowerCase();
      liste = liste.filter(function (x) { return (vorgangsnummer(x.p.person_id) + " " + vollerName(x.p)).toLowerCase().indexOf(q) !== -1; });
    }
    if (!state.person || !PERS[state.person]) state.person = liste.length ? liste[0].p.person_id : null;

    var html = seitenTitel(ANSICHT_TITEL.arbeitskorb, "Musterstadt, Pass- und Meldebehörde · Abgleich der Anträge mit dem Melderegister");
    html += exportMeldung();
    html += "<div class='korb'><div class='karte'><div class='werkzeug filter'>" +
      [["offen", "Offen"], ["ausstehend", "Antrag ausstehend"], ["erledigt", "Erledigt"], ["alle", "Alle"]].map(function (f) {
        return "<a href='#' data-filter='" + f[0] + "' class='" + (state.filter === f[0] ? "aktiv" : "") + "'>" + f[1] + " (" + gruppen[f[0]].length + ")</a>";
      }).join("") + "</div><div class='werkzeug'><input id='korb-suche' type='search' placeholder='Name oder Vorgangsnummer' value='" + esc(state.suche) + "' style='flex:1'></div>";
    html += "<table id='korb-tabelle'><thead><tr><th>Vorgang</th><th>Name</th><th>Eingang</th><th>Prüfweg</th><th>Status</th></tr></thead><tbody>";
    if (!liste.length) html += "<tr><td colspan='5'>Keine Vorgänge in dieser Auswahl.</td></tr>";
    liste.forEach(function (x) {
      var pid = x.p.person_id;
      html += "<tr class='wahl" + (pid === state.person ? " aktiv" : "") + "' data-person='" + esc(pid) + "'><td>" + esc(vorgangsnummer(pid)) + "</td><td>" + esc(vollerName(x.p)) + ergaenztTag(x.p) + "</td><td>" + (x.a ? datum(x.a.zeit) : "—") + "</td><td>" + esc(PRUEFWEG_DE[pruefweg(pid)]) + "</td><td>" + statusPill(x.s.status) + "</td></tr>";
    });
    html += "</tbody></table></div><div class='karte' id='vorgang'>" + renderVorgang(state.person) + "</div></div>";
    host.innerHTML = html;
    host.querySelectorAll("[data-filter]").forEach(function (a) {
      a.onclick = function (ev) { ev.preventDefault(); state.filter = a.getAttribute("data-filter"); state.person = null; state.ablehnen = false; render(); };
    });
    host.querySelectorAll("tr[data-person]").forEach(function (tr) {
      tr.onclick = function () { state.person = tr.getAttribute("data-person"); state.ablehnen = false; if (!host.querySelector("#korb-tabelle tr[data-person='" + state.person + "']")) state.filter = "alle"; render(); };
    });
    sucheBinden("korb-suche");
    exportBinden();
    bindVorgang();
  }

  function renderVorgang(pid) {
    if (!pid) return "<p class='klein'>Kein Vorgang ausgewählt.</p>";
    var e = PERS[pid], hh = HH[e.haushalt_id], st = aktuellerStatus(pid), a = antrag(pid);
    var h = "<h2>" + esc(vorgangsnummer(pid)) + " · " + esc(vollerName(e)) + " " + statusPill(st.status) + "</h2>";
    h += "<div class='spalten'><div><h3>Melderegister</h3><dl class='daten'>" +
      "<dt>Familienname</dt><dd>" + esc(e.familienname) + "</dd><dt>Vornamen</dt><dd>" + esc(e.vornamen) + ergaenztTag(e) + "</dd>" +
      "<dt>Geburtsdatum</dt><dd>" + datum(e.geburtsdatum) + "</dd><dt>Anschrift</dt><dd>" + esc(anschrift(e)) + "</dd>" +
      "<dt>Wohnungsstatus</dt><dd>" + esc(e.wohnungsstatus || "Hauptwohnsitz") + "</dd>" +
      (e.ausweisnummer ? "<dt>Personalausweis</dt><dd>Nr. " + esc(e.ausweisnummer) + (e.online_ausweis ? " · Online-Ausweisfunktion aktiviert" : "") + "</dd>" : "") +
      "<dt>Registernummer</dt><dd>" + esc(e.register_nr) + "</dd></dl></div>" +
      "<div><h3>Antrag</h3><dl class='daten'>" +
      "<dt>Eingang</dt><dd>" + (a ? datumZeit(a.zeit) + (a.weg === "app" ? " über die FoodAllo-App" : " am Schalter") : "noch nicht eingegangen") + "</dd>" +
      "<dt>Haushalt</dt><dd>" + esc(haushaltName(hh)) + ", " + hh.groesse + " Person" + (hh.groesse === 1 ? "" : "en") + "</dd>" +
      "<dt>Stellung im Haushalt</dt><dd>" + esc(e.rolle_im_haushalt || "—") + "</dd>" +
      "<dt>Prüfweg</dt><dd>" + esc(PRUEFWEG_DE[pruefweg(pid)]) + "</dd>" +
      "<dt>Bezugsweg</dt><dd>" + esc(KANAL_DE[hh.kanal] || "—") + "</dd></dl></div></div>";
    h += "<h3>Abgleich</h3><table><tbody>" + abgleich(e).map(function (z) {
      return "<tr><td style='width:28px'>" + ergZeichen(z.erg) + "</td><td>" + esc(z.pruef) + "</td><td>" + esc(z.text) + "</td></tr>";
    }).join("") + "</tbody></table>";
    if (hh.person_ids.length > 1) {
      h += "<h3>Weitere Personen im Haushalt</h3><table><tbody>" + hh.person_ids.filter(function (x) { return x !== pid; }).map(function (x) {
        return "<tr class='wahl' data-person='" + esc(x) + "'><td>" + esc(vorgangsnummer(x)) + "</td><td>" + esc(personName(x)) + ergaenztTag(PERS[x]) + "</td><td>" + esc(PERS[x].rolle_im_haushalt || "") + "</td><td>" + statusPill(aktuellerStatus(x).status) + "</td></tr>";
      }).join("") + "</tbody></table>";
    }
    h += "<div class='entscheidung'>";
    if (st.status === "ausstehend") {
      h += hh.kanal === "papier"
        ? "<p>Der Antrag ist noch nicht erfasst. <a href='#schalter' id='zur-erfassung'>Person am Schalter erfassen</a></p>"
        : "<p>Der Antrag aus der FoodAllo-App liegt noch nicht vor. Die Prüfung ist nach Eingang möglich.</p>";
    } else if (st.status === "offen") {
      h += "<h3>Entscheidung</h3>";
      if (pruefweg(pid) === "schalter") h += "<p><label><input type='checkbox' id='nachweis-vorgelegt'> " + (e.rolle_im_haushalt === "Haushaltsvorstand" ? "Personalausweis am Schalter vorgelegt und geprüft" : "Nachweis am Schalter vorgelegt (Personalausweis oder Geburtsurkunde)") + "</label></p><p class='klein' id='bestaetigen-fehler'></p>";
      h += "<div class='knoepfe'><button type='button' class='ok' id='btn-bestaetigen'>Identität bestätigen</button>" +
        "<button type='button' class='krit' id='btn-ablehnen'>Ablehnen …</button></div>";
      if (state.ablehnen) {
        h += "<div class='ablehnung'><label for='grund'>Ablehnungsgrund</label><select id='grund'><option value=''>Bitte wählen</option>" +
          ["Kein Eintrag im Melderegister", "Angaben weichen vom Melderegister ab", "Kein Hauptwohnsitz in der Musterstadt", "Identität konnte nicht nachgewiesen werden", "Doppelter Antrag", "Sonstiger Grund"].map(function (g) { return "<option>" + esc(g) + "</option>"; }).join("") +
          "</select><label for='bemerkung'>Begründung</label><textarea id='bemerkung' placeholder='Begründung für die Akte'></textarea>" +
          "<div class='knoepfe'><button type='button' class='krit' id='btn-ablehnen-ok'>Ablehnung speichern</button><button type='button' id='btn-ablehnen-abbr'>Abbrechen</button></div><p class='klein' id='ablehnen-fehler'></p></div>";
      }
    } else {
      h += st.quelle === "online" ? "<p>Bestätigt am " + datumZeit(st.zeit) + " über die Online-Ausweisfunktion " + statusPill(st.status) + "</p><p class='klein'>Die Bestätigung wird in den gemeinsamen Bestand übernommen; eine Entscheidung am Arbeitsplatz ist nicht erforderlich.</p>" : "<p>Entschieden am " + datumZeit(st.zeit) + ": " + statusPill(st.status) + "</p>";
      if (entscheidungenLokal().some(function (x) { return x.person_id === pid && !x.exportiert_am; })) h += "<div class='knoepfe'><button type='button' id='btn-zurueck'>Entscheidung zurücknehmen</button></div>";
    }
    h += "</div><h3>Verlauf</h3><ul class='verlauf'>" + (statusVerlauf(pid).map(function (v) { return "<li>" + datumZeit(v.zeit) + " · " + esc(v.text) + "</li>"; }).join("") || "<li>Noch keine Einträge.</li>") + "</ul>";
    return h;
  }

  function bindVorgang() {
    var pid = state.person, host = $("vorgang");
    if (!host) return;
    host.querySelectorAll("tr[data-person]").forEach(function (tr) {
      tr.onclick = function () { state.person = tr.getAttribute("data-person"); state.filter = "alle"; state.ablehnen = false; render(); };
    });
    if ($("zur-erfassung")) $("zur-erfassung").onclick = function (ev) { ev.preventDefault(); state.haushalt = PERS[pid].haushalt_id; geheZu("schalter"); };
    if ($("btn-bestaetigen")) $("btn-bestaetigen").onclick = function () {
      var n = $("nachweis-vorgelegt");
      if (n && !n.checked) { $("bestaetigen-fehler").textContent = "Bitte die Vorlage des Nachweises bestätigen."; return; }
      entscheide(pid, "bestaetigt", "", n ? "Nachweis am Schalter vorgelegt" : ""); state.ablehnen = false; render();
    };
    if ($("btn-ablehnen")) $("btn-ablehnen").onclick = function () { state.ablehnen = true; render(); };
    if ($("btn-ablehnen-abbr")) $("btn-ablehnen-abbr").onclick = function () { state.ablehnen = false; render(); };
    if ($("btn-ablehnen-ok")) $("btn-ablehnen-ok").onclick = function () {
      var g = $("grund").value, b = $("bemerkung").value.trim();
      if (!g) { $("ablehnen-fehler").textContent = "Bitte einen Ablehnungsgrund wählen."; return; }
      if (!b) { $("ablehnen-fehler").textContent = "Bitte eine Begründung eintragen."; return; }
      entscheide(pid, "abgelehnt", g + ": " + b); state.ablehnen = false; render();
    };
    if ($("btn-zurueck")) $("btn-zurueck").onclick = function () { zuruecknehmen(pid); render(); };
  }

  /* ---------- Erfassung am Schalter ---------- */
  function renderSchalter(host) {
    if (!darfFaelle()) { host.innerHTML = seitenTitel(ANSICHT_TITEL.schalter) + sperre(NUR_MB); return; }
    var papier = HAUSHALTE.filter(function (h) { return h.kanal === "papier" && !h.demo; });
    if (!state.haushalt || !HH[state.haushalt] || HH[state.haushalt].kanal !== "papier" || HH[state.haushalt].demo) state.haushalt = papier.length ? papier[0].haushalt_id : null;
    var html = seitenTitel("Person am Schalter erfassen", "Musterstadt, Pass- und Meldebehörde · Antrag für Personen ohne Smartphone, Bezug über die Lebensmittelkarte (Papier)");
    html += exportMeldung();
    html += "<div class='korb'><div class='karte'><h2>Haushalte ohne Smartphone</h2><table id='schalter-tabelle'><thead><tr><th>Haushalt</th><th>Anschrift</th><th>Status</th></tr></thead><tbody>";
    if (!papier.length) html += "<tr><td colspan='3'>Keine Haushalte.</td></tr>";
    papier.forEach(function (h) {
      var erfasst = h.person_ids.some(function (pid) { return antrag(pid); });
      html += "<tr class='wahl" + (h.haushalt_id === state.haushalt ? " aktiv" : "") + "' data-haushalt='" + esc(h.haushalt_id) + "'><td>" + esc(haushaltName(h)) + "<br><span class='klein'>" + h.groesse + " Personen</span></td><td>" + esc(anschrift(PERS[h.vorstand])) + "</td><td>" + (erfasst ? "<span class='status bestaetigt'>erfasst</span>" : "<span class='status offen'>nicht erfasst</span>") + "</td></tr>";
    });
    html += "</tbody></table></div><div class='karte' id='erfassung'>";
    var hh = state.haushalt ? HH[state.haushalt] : null;
    if (hh) {
      var v = PERS[hh.vorstand];
      var erfasst = hh.person_ids.filter(function (pid) { return antrag(pid); });
      html += "<h2>" + esc(haushaltName(hh)) + "</h2><dl class='daten'><dt>Haushaltsvorstand</dt><dd>" + esc(vollerName(v)) + ", geboren " + datum(v.geburtsdatum) + "</dd>" +
        "<dt>Anschrift</dt><dd>" + esc(anschrift(v)) + "</dd><dt>Personalausweis laut Register</dt><dd>" + (v.ausweisnummer ? "Nr. " + esc(v.ausweisnummer) : "—") + "</dd><dt>Bezugsweg</dt><dd>Lebensmittelkarte (Papier)</dd></dl>";
      html += "<h3>Personen im Haushalt</h3><table><thead><tr><th></th><th>Name</th><th>Geburtsdatum</th><th>Stellung</th><th>Status</th></tr></thead><tbody>";
      hh.person_ids.forEach(function (pid) {
        var e = PERS[pid], ist = !!antrag(pid);
        html += "<tr><td><input type='checkbox' class='erf-person' value='" + esc(pid) + "'" + (ist ? " checked disabled" : " checked") + " aria-label='" + esc(vollerName(e)) + " erfassen'></td><td>" + esc(vollerName(e)) + ergaenztTag(e) + "</td><td>" + datum(e.geburtsdatum) + "</td><td>" + esc(e.rolle_im_haushalt || "") + "</td><td>" + statusPill(aktuellerStatus(pid).status) + "</td></tr>";
      });
      html += "</tbody></table>";
      if (erfasst.length < hh.person_ids.length) {
        html += "<div class='entscheidung'><label><input type='checkbox' id='erf-ausweis'> Personalausweis des Haushaltsvorstands vorgelegt und geprüft</label>" +
          "<div class='knoepfe'><button type='button' class='primaer' id='btn-erfassen'>Erfassung speichern</button></div><p class='klein' id='erf-fehler'></p></div>";
      } else {
        html += "<div class='entscheidung'><p>Erfasst am " + datumZeit(antrag(hh.person_ids[0]).zeit) + ". Die Identitätsprüfung erfolgt im <a href='#arbeitskorb' id='zum-korb'>Arbeitskorb</a>.</p>";
        var lokal = schalterLokal().some(function (s) { return s.haushalt_id === hh.haushalt_id && !s.exportiert_am; });
        var entschieden = hh.person_ids.some(function (pid) { return ["bestaetigt", "abgelehnt"].indexOf(aktuellerStatus(pid).status) !== -1; });
        if (lokal && !entschieden) html += "<div class='knoepfe'><button type='button' id='btn-erf-zurueck'>Erfassung zurücknehmen</button></div>";
        html += "</div>";
      }
    } else html += "<p class='klein'>Kein Haushalt ausgewählt.</p>";
    html += "</div></div>";
    host.innerHTML = html;
    exportBinden();
    host.querySelectorAll("tr[data-haushalt]").forEach(function (tr) { tr.onclick = function () { state.haushalt = tr.getAttribute("data-haushalt"); render(); }; });
    if ($("btn-erfassen")) $("btn-erfassen").onclick = function () {
      var pids = Array.prototype.filter.call(host.querySelectorAll(".erf-person"), function (c) { return c.checked && !c.disabled; }).map(function (c) { return c.value; });
      if (!$("erf-ausweis").checked) { $("erf-fehler").textContent = "Bitte die Prüfung des Personalausweises bestätigen."; return; }
      if (!pids.length) { $("erf-fehler").textContent = "Bitte mindestens eine Person auswählen."; return; }
      erfasseAmSchalter(hh.haushalt_id, pids, true); render();
    };
    if ($("btn-erf-zurueck")) $("btn-erf-zurueck").onclick = function () { schalterZuruecknehmen(hh.haushalt_id); render(); };
    if ($("zum-korb")) $("zum-korb").onclick = function (ev) { ev.preventDefault(); state.person = hh.person_ids[0]; state.filter = "offen"; geheZu("arbeitskorb"); };
  }

  /* ---------- Haushalte ---------- */
  function renderHaushalte(host) {
    if (!darfFaelle()) { host.innerHTML = seitenTitel(ANSICHT_TITEL.haushalte) + sperre(NUR_MB); return; }
    var p = periodeObj(PERIODE_LAUFEND);
    var html = seitenTitel("Haushaltsübersicht", "Musterstadt, Pass- und Meldebehörde · Zuteilungszeitraum " + periodeText(p));
    html += "<div class='werkzeug'><input id='hh-suche' type='search' placeholder='Name oder Anschrift' value='" + esc(state.suche) + "' style='min-width:320px'><span class='klein'>" + HAUSHALTE.length + " Haushalte, " + PERSONEN.length + " Personen</span></div>";
    html += "<div class='karte'><table id='hh-tabelle'><thead><tr><th>Haushalt</th><th>Anschrift</th><th>Personen</th><th>Bezugsweg</th><th>Zuteilung im Demonstrationszeitraum</th></tr></thead><tbody>";
    var q = (state.suche || "").toLowerCase();
    HAUSHALTE.forEach(function (hh) {
      var v = PERS[hh.vorstand];
      var txt = (haushaltName(hh) + " " + anschrift(v) + " " + hh.person_ids.map(personName).join(" ")).toLowerCase();
      if (q && txt.indexOf(q) === -1) return;
      var pers = hh.person_ids.map(function (pid) {
        var e = PERS[pid];
        return (e.demo_status ? esc(vollerName(e)) : "<a href='#arbeitskorb' data-person='" + esc(pid) + "'>" + esc(vollerName(e)) + "</a>") + ergaenztTag(e) + " <span class='klein'>" + esc(e.rolle_im_haushalt || "") + "</span> " + statusPill(aktuellerStatus(pid).status);
      }).join("<br>");
      var ks = kartenHH(hh), gsh = gutscheineHH(hh.haushalt_id), zut;
      var zusatz = gsh.stoerung.map(function (g) { return "Zusatz Trinkwasser: " + fmtZahl(wasserMenge(g)) + " Liter" + (stoerungAktiv(g.stoerung_id) ? "" : " (verfallen mit Ende der Störung)"); });
      if (hh.kanal === "papier") zut = ks.length ? ks.map(function (k) { return esc(KARTENART_DE[k.art]) + ": " + esc(kartenStatus(k)); }).join("<br>") + "<br><span class='klein'>" + ks[0].berechtigt.length + " bezugsberechtigte Person" + (ks[0].berechtigt.length === 1 ? "" : "en") + "</span>" : "<span class='klein'>noch keine Karte (keine bestätigte Person)</span>";
      else zut = hh.person_ids.some(function (pid) { return aktuellerStatus(pid).status === "bestaetigt"; }) ? "Gutschein in der FoodAllo-App" + (zusatz.length ? "<br>" + zusatz.join("<br>") : "") : "<span class='klein'>noch keine Zuteilung (keine bestätigte Person)</span>";
      html += "<tr><td>" + esc(haushaltName(hh)) + "<br><span class='klein'>" + hh.groesse + " Personen</span></td><td>" + esc(anschrift(v)) + "</td><td>" + pers + "</td><td>" + esc(KANAL_DE[hh.kanal] || "") + "</td><td>" + zut + "</td></tr>";
    });
    html += "</tbody></table></div>";
    host.innerHTML = html;
    sucheBinden("hh-suche");
    personLinksBinden(host);
  }

  /* ---------- Lebensmittelkarten ---------- */
  function kartenStatus(k) {
    var v = lesen(SPEICHER.druck, {}), id = k.karte ? k.karte.papierkarte_id : k.papierkarte_id;
    if (v[id]) return "gedruckt am " + datumZeit(v[id]);
    if (k.art === "stoerung" && k.aktiv === false) return "verfallen mit Ende der Störung";
    return k.entwurf ? "Entwurf, zu drucken" : "zu drucken";
  }
  function seitenformat() {
    var st = $("seitenformat");
    if (!st) { st = document.createElement("style"); st.id = "seitenformat"; document.head.appendChild(st); }
    st.textContent = state.format === "a6" ? "@page { size: 105mm 148mm; margin: 5mm; }" : "@page { size: A4 portrait; margin: 12mm; }";
    document.body.classList.toggle("format-a4", state.format === "a4");
    document.body.classList.toggle("format-a6", state.format === "a6");
  }
  function karteHtml(hh, k) {
    var zusatz = k.art === "stoerung";
    return K.renderKarte({
      vermerk: zusatz ? "Zusatz Trinkwasser" : "", gueltigHinweis: zusatz ? "nur solange die Versorgungsstörung andauert" : "",
      format: state.format, karte: k.karte, gutschein: k.gutschein, haushalt: hh, periode: periodeObj(PERIODE_LAUFEND), katalog: D.artikel,
      haushaltName: haushaltName(hh), personen: k.berechtigt.map(personName), anschrift: anschrift(PERS[hh.vorstand]),
      ausgabestellen: ausgabestellen().filter(istKern).map(stelleName), logo: "assets/logos/dark_logo_transparent_background.png"
    });
  }
  function renderKarten(host) {
    if (!darfKarten()) { host.innerHTML = seitenTitel(ANSICHT_TITEL.karten) + sperre("Lebensmittelkarten druckt nur die Pass- und Meldebehörde der Musterstadt."); return; }
    var papier = HAUSHALTE.filter(function (h) { return h.kanal === "papier"; });
    if (!state.haushalt || !HH[state.haushalt] || HH[state.haushalt].kanal !== "papier") state.haushalt = papier.length ? papier[0].haushalt_id : null;
    var hh = state.haushalt ? HH[state.haushalt] : null, ks = hh ? kartenHH(hh) : [];
    var k = ks.filter(function (x) { return x.art === (state.kartenArt || "regulaer"); })[0] || ks[0] || null;
    seitenformat();
    if (state.druck && k) { host.innerHTML = "<div class='druckbereich'>" + karteHtml(hh, k) + "</div>"; return; }
    var html = seitenTitel("Lebensmittelkarten drucken", "Musterstadt, Pass- und Meldebehörde · Zuteilungszeitraum " + periodeText(periodeObj(PERIODE_LAUFEND)));
    html += "<div class='korb'><div class='karte no-print'><table id='karten-tabelle'><thead><tr><th>Haushalt</th><th>Karte</th><th>Status</th></tr></thead><tbody>";
    if (!papier.length) html += "<tr><td colspan='3'>Keine Haushalte mit Bezug über die Papierkarte.</td></tr>";
    papier.forEach(function (h) {
      var l = kartenHH(h);
      if (!l.length) html += "<tr class='wahl" + (h.haushalt_id === state.haushalt ? " aktiv" : "") + "' data-haushalt='" + esc(h.haushalt_id) + "' data-art='regulaer'><td>" + esc(haushaltName(h)) + "<br><span class='klein'>" + h.groesse + " Personen</span></td><td>—</td><td><span class='status grau'>Identität noch nicht bestätigt</span></td></tr>";
      l.forEach(function (kk) {
        var stt = kartenStatus(kk), aktiv = h.haushalt_id === state.haushalt && k && kk.art === k.art;
        html += "<tr class='wahl" + (aktiv ? " aktiv" : "") + "' data-haushalt='" + esc(h.haushalt_id) + "' data-art='" + kk.art + "'><td>" + esc(haushaltName(h)) + "<br><span class='klein'>" + esc(kk.berechtigt.map(personName).join(", ")) + "</span></td><td>" + esc(KARTENART_DE[kk.art]) + "<br><span class='kartenart'>" + (kk.art === "stoerung" ? fmtZahl(wasserMenge(kk.gutschein)) + " Liter Trinkwasser" : "Zuteilung im Demonstrationszeitraum") + "</span></td><td><span class='status " + (/zu drucken/.test(stt) ? "offen" : "grau") + "'>" + esc(stt) + "</span></td></tr>";
      });
    });
    html += "</tbody></table><p class='klein'>Je Haushalt eine Lebensmittelkarte für den Zuteilungszeitraum und während einer Versorgungsstörung eine eigene Zusatzkarte Trinkwasser.</p></div><div>";
    if (k) {
      html += "<div class='werkzeug no-print'><label for='kformat'>Format</label><select id='kformat'><option value='a4'" + (state.format === "a4" ? " selected" : "") + ">A4</option><option value='a6'" + (state.format === "a6" ? " selected" : "") + ">A6</option></select>" +
        "<button type='button' class='primaer' id='btn-druck'>Drucken</button></div><div class='druckbereich'>" + karteHtml(hh, k) + "</div>";
    } else if (hh) {
      html += "<div class='karte'><p>Für " + esc(haushaltName(hh)) + " kann noch keine Lebensmittelkarte gedruckt werden: Es ist noch keine Person des Haushalts bestätigt.</p>" +
        "<p><a href='#schalter' id='zur-erfassung'>Zur Erfassung am Schalter</a> · <a href='#arbeitskorb' id='zum-korb'>Zum Arbeitskorb</a></p></div>";
    }
    html += "</div></div>";
    host.innerHTML = html;
    host.querySelectorAll("tr[data-haushalt]").forEach(function (tr) { tr.onclick = function () { state.haushalt = tr.getAttribute("data-haushalt"); state.kartenArt = tr.getAttribute("data-art"); render(); }; });
    if ($("kformat")) $("kformat").onchange = function () { state.format = $("kformat").value; render(); };
    if ($("zur-erfassung")) $("zur-erfassung").onclick = function (ev) { ev.preventDefault(); geheZu("schalter"); };
    if ($("zum-korb")) $("zum-korb").onclick = function (ev) { ev.preventDefault(); state.person = hh.person_ids[0]; state.filter = "alle"; geheZu("arbeitskorb"); };
    if ($("btn-druck")) $("btn-druck").onclick = function () {
      var id = k.karte.papierkarte_id;
      var nach = function () { window.removeEventListener("afterprint", nach); var v = lesen(SPEICHER.druck, {}); v[id] = jetztBerlin(); schreiben(SPEICHER.druck, v); render(); };
      window.addEventListener("afterprint", nach);
      window.print();
    };
  }

  /* ---------- Melderegister ---------- */
  function renderRegister(host) {
    if (!darfFaelle()) { host.innerHTML = seitenTitel(ANSICHT_TITEL.register) + sperre(NUR_MB); return; }
    var html = seitenTitel("Melderegister Musterstadt", PERSONEN.length + " Einträge in " + HAUSHALTE.length + " Haushalten · Einwohnermeldeliste vom " + datum(REG.importiert_am));
    html += "<div class='werkzeug'><input id='reg-liste-suche' type='search' placeholder='Name, Geburtsdatum, Anschrift' value='" + esc(state.suche) + "' style='min-width:320px'></div>";
    html += "<div class='karte'><table id='register-tabelle'><thead><tr><th>Registernummer</th><th>Familienname</th><th>Vornamen</th><th>Geburtsdatum</th><th>Anschrift</th><th>Stellung im Haushalt</th><th>Personalausweis</th><th>Vorgang</th></tr></thead><tbody>";
    var q = (state.suche || "").toLowerCase();
    PERSONEN.forEach(function (e) {
      if (q && (e.register_nr + " " + vollerName(e) + " " + datum(e.geburtsdatum) + " " + anschrift(e)).toLowerCase().indexOf(q) === -1) return;
      html += "<tr><td>" + esc(e.register_nr) + "</td><td>" + esc(e.familienname) + "</td><td>" + esc(e.vornamen) + ergaenztTag(e) + "</td><td>" + datum(e.geburtsdatum) + "</td><td>" + esc(anschrift(e)) + "</td><td>" + esc(e.rolle_im_haushalt || "") + "</td><td>" + (e.ausweisnummer ? "Nr. " + esc(e.ausweisnummer) + (e.online_ausweis ? "<br><span class='klein'>Online-Ausweisfunktion</span>" : "") : "—") + "</td><td>" +
        "<a href='#arbeitskorb' data-person='" + esc(e.person_id) + "'>" + esc(vorgangsnummer(e.person_id)) + "</a> " + statusPill(aktuellerStatus(e.person_id).status) + "</td></tr>";
    });
    html += "</tbody></table><p class='hinweis'>Mit „ergänzt“ gekennzeichnete Angaben stammen nicht aus der Einwohnermeldeliste.</p></div>";
    host.innerHTML = html;
    sucheBinden("reg-liste-suche");
    personLinksBinden(host);
  }

  /* ---------- Bestands- und Ausgabeübersicht ---------- */
  var ART_FARBE = { wheat_flour: "#1f4e79", rice: "#b26a00", oil: "#2e7d32", toilet_paper: "#6b4e9b" };
  function zeitreihe() {
    var m = {};
    D.buchungen.forEach(function (b) { var t = String(b.zeit).slice(0, 10); if (!m[t]) m[t] = { tag: t }; m[t][b.artikel_id] = (m[t][b.artikel_id] || 0) + Number(b.menge); });
    return Object.keys(m).sort().map(function (k) { return m[k]; });
  }
  function chart(series) {
    var arts = Object.keys(ART_FARBE), w = 640, h = 200, l = 40, t = 10, b = 30, iw = w - l - 8, ih = h - t - b, max = 1;
    series.forEach(function (r) { arts.forEach(function (a) { if ((r[a] || 0) > max) max = r[a]; }); });
    var bw = iw / series.length, svg = "<svg class='chart' viewBox='0 0 " + w + " " + h + "' role='img' aria-label='Ausgaben je Tag'>";
    svg += "<line x1='" + l + "' y1='" + (t + ih) + "' x2='" + (l + iw) + "' y2='" + (t + ih) + "' stroke='#d5dbe2'/><text x='4' y='" + (t + 10) + "' font-size='10' fill='#5a6675'>" + fmtZahl(max, 0) + "</text>";
    var step = Math.max(1, Math.floor(series.length / 8));
    series.forEach(function (r, i) {
      arts.forEach(function (a, ai) {
        var v = r[a] || 0, bh = (v / max) * ih * 0.92, x = l + i * bw + ai * (bw / arts.length) * 0.95 + 1;
        svg += "<rect x='" + x.toFixed(1) + "' y='" + (t + ih - bh).toFixed(1) + "' width='" + Math.max(0.8, bw / arts.length - 0.6).toFixed(1) + "' height='" + bh.toFixed(1) + "' fill='" + ART_FARBE[a] + "'/>";
      });
      if (i % step === 0) svg += "<text x='" + (l + i * bw + bw / 2) + "' y='" + (h - 8) + "' font-size='9' text-anchor='middle' fill='#5a6675'>" + datum(r.tag).slice(0, 6) + "</text>";
    });
    return svg + "</svg><div class='chart-legende'>" + arts.map(function (a) { return "<span><i class='swatch' style='background:" + ART_FARBE[a] + "'></i>" + esc(artikel(a).bezeichnung_de) + "</span>"; }).join("") + "</div>";
  }
  function kz(wert, text, klasse) { return "<div class='kennzahl " + (klasse || "") + "'><div class='wert'>" + wert + "</div><div class='txt'>" + esc(text) + "</div></div>"; }
  function aktiveStoerungen(r) { return stoerungen().filter(function (s) { return !s.ende && Z.agsImRaum(r, s.p.ags); }); }
  function renderLage(host) {
    var r = Z.rolle(state.rolle), c = kohorte(), d = ds(), aktiv = aktiveStoerungen(r);
    var html = seitenTitel("Bestands- und Ausgabeübersicht " + d.gebiet, esc(d.name) + " · Stand " + datumZeit(jetztBerlin()));
    if (aktiv.length) {
      html += "<div class='meldung krit'><strong>" + aktiv.length + " aktive Versorgungsstörung" + (aktiv.length === 1 ? "" : "en") + "</strong> im Zuständigkeitsbereich: " +
        aktiv.map(function (s) { return esc(STOERUNG_DE[s.p.art] || s.p.art) + " seit " + datumZeit(s.p.beginn); }).join("; ") + ". <a href='#stoerungen' id='zu-stoerungen'>Zu den Versorgungsstörungen</a></div>";
    }
    var ew = r.ebene === "kreis" ? 259516 : r.ebene === "land" ? A.land.einwohner : null, k = "";
    if (ew) k += kz(fmtZahl(ew, 0), "Einwohner " + d.gebiet + " (31.12.2025)");
    k += kz(fallzahl(c.haushalte), "Teilnehmende Haushalte");
    k += kz(fallzahl(c.personen), "Erfasste Personen");
    k += kz(fallzahl(c.bestaetigt), "Identität bestätigt", "ok");
    k += kz(fallzahl(c.offen + c.ausstehend), "Prüfung offen oder Antrag ausstehend", (c.offen + c.ausstehend) ? "warn" : "");
    k += kz(fallzahl(c.karten), "Lebensmittelkarten (Papier)");
    k += kz(String(aktiv.length), "Aktive Versorgungsstörungen", aktiv.length ? "krit" : "");
    if (r.ebene === "bund" && r.darf_kreis_als_kennzahl && darfKennzahl(Z.AGS_LK_LEIPZIG, "kreis")) k += kz(fallzahl(c.haushalte, Z.AGS_LK_LEIPZIG), "Landkreis Leipzig: teilnehmende Haushalte");
    html += "<div class='kennzahlen'>" + k + "</div>";

    html += "<div class='karte'><h2>" + (r.aggregationsebene === "gemeinde" ? "Gemeinden im Landkreis Leipzig" : r.aggregationsebene === "kreis" ? "Landkreise und kreisfreie Städte im Freistaat Sachsen" : "Länder") + "</h2>";
    html += "<table id='lage-tabelle'><thead><tr><th>Gebiet</th><th class='num'>Einwohner</th><th class='num'>Haushalte</th><th class='num'>Personen</th><th class='num'>Identität bestätigt</th><th class='num'>Prüfung offen</th><th class='num'>Abgelehnt</th><th class='num'>Lebensmittelkarten</th><th class='num'>Störungen</th></tr></thead><tbody>";
    function zeile(name, einw, ags) {
      if (!ags) return "<tr class='ohne'><td>" + esc(name) + "</td><td class='num'>" + (einw == null ? "—" : fmtZahl(einw, 0)) + "</td><td class='num' colspan='7'>keine Daten</td></tr>";
      return "<tr><td>" + esc(name) + "</td><td class='num'>" + (einw == null ? "—" : fmtZahl(einw, 0)) + "</td><td class='num'>" + fallzahl(c.haushalte, ags) + "</td><td class='num'>" + fallzahl(c.personen, ags) + "</td><td class='num'>" + fallzahl(c.bestaetigt, ags) + "</td><td class='num'>" + fallzahl(c.offen + c.ausstehend, ags) + "</td><td class='num'>" + fallzahl(c.abgelehnt, ags) + "</td><td class='num'>" + fallzahl(c.karten, ags) + "</td><td class='num'>" + aktiv.length + "</td></tr>";
    }
    if (r.aggregationsebene === "gemeinde" && darfAggregat(Z.AGS_LK_LEIPZIG, "gemeinde")) A.gemeinden_landkreis_leipzig.forEach(function (g) { html += zeile(g.name, g.ew, g.ags === Z.AGS_FROHBURG ? g.ags : null); });
    else if (r.aggregationsebene === "kreis" && darfAggregat(Z.AGS_SACHSEN, "kreis")) A.kreise_sachsen.forEach(function (kr) { html += zeile(kr.name, kr.ew, kr.ags === Z.AGS_LK_LEIPZIG ? kr.ags : null); });
    else if (darfAggregat(null, "land")) A.laender.forEach(function (l) { html += zeile(l.name, l.code === "14" ? A.land.einwohner : null, l.code === "14" ? "14" : null); });
    html += "</tbody></table><p class='hinweis'>Fallzahlen unter " + Z.KLEINZAHL_STANDARD + " werden nicht ausgewiesen. Einwohnerzahlen angelehnt an amtliche Daten (Statistisches Landesamt Sachsen), Stand 31.12.2025.</p></div>";

    html += "<div class='spalten'><div class='karte'><h2>Bestands- und Ausgabeübersicht</h2><table><thead><tr><th>Ware</th><th class='num'>Ausgegeben im Demonstrationszeitraum</th><th class='num'>Bestand</th><th class='num'>Reichweite</th></tr></thead><tbody>";
    var lauf = buchungen(PERIODE_LAUFEND);
    ["wheat_flour", "rice", "oil", "toilet_paper", "insulin"].forEach(function (id) {
      var a = artikel(id), rw = reichweite(id);
      html += "<tr><td>" + esc(a.bezeichnung_de) + "</td><td class='num'>" + esc(K.fmtMenge(summe(lauf, id), a.einheit)) + "</td><td class='num'>" + esc(K.fmtMenge(bestand(id), a.einheit)) + "</td><td class='num'>" + (rw == null ? "—" : fmtZahl(rw, 1) + " Tage") + "</td></tr>";
    });
    html += "</tbody></table><p class='hinweis'>Szenariodaten aus synthetischen Haushalten, nicht die Personen und Haushalte oben. Buchungen, Wareneingänge und Bestandskorrekturen der Retail-App sind nicht eingerechnet. Reichweite: Bestand geteilt durch die durchschnittliche Tagesausgabe vom 10. bis 17.11.2026.</p></div>";
    html += "<div class='karte'><h2>Ausgaben je Tag</h2>" + (darfKennzahl(Z.AGS_FROHBURG, r.aggregationsebene) ? chart(zeitreihe()) + "<p class='hinweis'>Szenariodaten.</p>" : "<p class='klein'>Nicht verfügbar.</p>") + "</div></div>";

    var hinw = [];
    ["wheat_flour", "rice", "oil", "toilet_paper", "insulin"].forEach(function (id) {
      var rw = reichweite(id);
      if (rw != null && rw < 3) hinw.push({ krit: rw < 1.5, t: artikel(id).bezeichnung_de + ": Reichweite unter 3 Tagen (" + fmtZahl(rw, 1) + " Tage)." });
    });
    var leer = {};
    D.bestaende.forEach(function (b) { if (b.menge <= 0) leer[b.artikel_id] = (leer[b.artikel_id] || 0) + 1; });
    Object.keys(leer).forEach(function (id) { hinw.push({ krit: true, t: artikel(id).bezeichnung_de + ": " + leer[id] + " Ausgabestelle" + (leer[id] === 1 ? "" : "n") + " ohne Bestand." }); });
    html += "<div class='karte'><h2>Hinweise</h2>" + (hinw.length ? "<ul class='liste-hinweis'>" + hinw.map(function (x) { return "<li class='" + (x.krit ? "krit" : "") + "'>" + esc(x.t) + "</li>"; }).join("") + "</ul>" : "<p class='klein'>Keine Hinweise.</p>") + "</div>";
    host.innerHTML = html;
    if ($("zu-stoerungen")) $("zu-stoerungen").onclick = function (ev) { ev.preventDefault(); geheZu("stoerungen"); };
  }

  /* ---------- Versorgungsstörungen ---------- */
  function renderStoerungen(host) {
    var r = Z.rolle(state.rolle), d = ds();
    var liste = stoerungen().filter(function (s) { return Z.agsImRaum(r, s.p.ags); });
    var html = seitenTitel("Versorgungsstörungen", esc(d.name) + " · Zuständigkeitsbereich " + d.gebiet);
    html += "<div class='karte'><table id='stoerung-tabelle'><thead><tr><th>Art</th><th>Gebiet</th><th>Beginn</th><th>Ende</th><th>Status</th><th class='num'>Einwohner im Gebiet</th><th class='num'>Teilnehmende Haushalte</th><th>Sonderzuteilung</th></tr></thead><tbody>";
    if (!liste.length) html += "<tr><td colspan='8'>Keine Versorgungsstörungen gemeldet.</td></tr>";
    liste.forEach(function (s) {
      var gebiet = (r.aggregationsebene === "fall" || r.aggregationsebene === "gemeinde") ? gemeindeName(s.p.ags) + ", Landkreis Leipzig" : r.aggregationsebene === "kreis" ? "Landkreis Leipzig (1 Gemeinde)" : "Freistaat Sachsen (1 Gemeinde)";
      var ew = 0; A.gemeinden_landkreis_leipzig.forEach(function (g) { if (g.ags === s.p.ags) ew = g.ew; });
      var hh = HAUSHALTE.filter(function (h) { return h.ags === s.p.ags; }).length;
      html += "<tr><td>" + esc(STOERUNG_DE[s.p.art] || s.p.art) + " <span class='status grau'>Szenario</span></td><td>" + esc(gebiet) + "</td><td>" + datumZeit(s.p.beginn) + "</td><td>" + (s.ende ? datumZeit(s.ende) : "—") + "</td><td>" +
        (s.ende ? "<span class='status grau'>beendet</span>" : "<span class='status abgelehnt'>andauernd</span>") + "</td><td class='num'>" + fmtZahl(ew, 0) + "</td><td class='num'>" + fallzahl(hh, s.p.ags) + "</td><td>" + (s.p.art === "trinkwasser" ? "Trinkwasser: Zusatzgutschein bzw. Zusatzkarte, 14 Liter je Person" : "—") + "</td></tr>";
    });
    html += "</tbody></table><p class='hinweis'>Fallzahlen unter " + Z.KLEINZAHL_STANDARD + " werden nicht ausgewiesen.</p></div>";
    host.innerHTML = html;
  }

  /* ---------- Ausgabestellen ---------- */
  var BESTAND_ARTIKEL = ["wheat_flour", "rice", "oil", "toilet_paper", "insulin"];
  function renderAusgabestellen(host) {
    var r = Z.rolle(state.rolle), d = ds();
    var html = seitenTitel("Ausgabestellen", esc(dsVoll()) + " · " + d.gebiet);
    var liste = ausgabestellen().filter(function (s) { return s.aktiv !== false; });
    if (darfStellen()) {
      html += "<div class='karte'><table id='stellen-tabelle'><thead><tr><th>Ausgabestelle</th><th>Art</th><th>Anschrift</th><th>Ausgabe</th>" +
        BESTAND_ARTIKEL.map(function (id) { return "<th class='num'>" + esc(artikel(id).bezeichnung_de) + "</th>"; }).join("") + "</tr></thead><tbody>";
      liste.slice().sort(function (a, b) { return (istKern(b) ? 1 : 0) - (istKern(a) ? 1 : 0) || stelleName(a).localeCompare(stelleName(b), "de"); }).forEach(function (st) {
        var adr = st.adresse ? ((st.adresse.strasse || "") + " " + (st.adresse.hausnummer || "")).trim() + (st.adresse.plz ? ", " + st.adresse.plz + " " + (st.adresse.ort || "") + ((st.adresse.ortsteil && st.adresse.ortsteil !== st.adresse.ort) ? " (" + st.adresse.ortsteil + ")" : "") : "") : "";
        html += "<tr" + (istKern(st) ? "" : " class='ohne'") + "><td>" + esc(stelleName(st)) + "</td><td>" + esc(typLabel(st.typ)) + "</td><td>" + esc(adr || "—") + "</td><td>" + (st.rolle === "kern_insulin" ? "Insulin" : istKern(st) ? "Lebensmittel und Hygieneartikel" : "nicht eingebunden") + "</td>" +
          BESTAND_ARTIKEL.map(function (id) {
            var b = D.bestaende.filter(function (x) { return x.ausgabestelle_id === st.ausgabestelle_id && x.artikel_id === id; })[0];
            return "<td class='num'>" + (b ? esc(K.fmtMenge(b.menge, b.einheit)) : "") + "</td>";
          }).join("") + "</tr>";
      });
      html += "</tbody></table><p class='hinweis'>Bestände: Szenariodaten. Filialdaten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL) (<a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noopener'>https://www.openstreetmap.org/copyright</a>). Keine Partnerschaft mit den genannten Geschäften.</p></div>";
      host.innerHTML = html;
      return;
    }
    var typen = {}, kern = 0;
    liste.forEach(function (s) { typen[typLabel(s.typ)] = (typen[typLabel(s.typ)] || 0) + 1; if (istKern(s)) kern++; });
    var spalten = Object.keys(typen).sort();
    html += "<div class='karte'><table id='stellen-tabelle'><thead><tr><th>Gebiet</th><th class='num'>Ausgabestellen gesamt</th><th class='num'>davon eingebunden</th>" + spalten.map(function (t) { return "<th class='num'>" + esc(t) + "</th>"; }).join("") + "</tr></thead><tbody>";
    function zeile(name, mit) {
      if (!mit) return "<tr class='ohne'><td>" + esc(name) + "</td><td class='num' colspan='" + (2 + spalten.length) + "'>keine Daten</td></tr>";
      return "<tr><td>" + esc(name) + "</td><td class='num'>" + liste.length + "</td><td class='num'>" + kern + "</td>" + spalten.map(function (t) { return "<td class='num'>" + typen[t] + "</td>"; }).join("") + "</tr>";
    }
    if (r.aggregationsebene === "gemeinde") A.gemeinden_landkreis_leipzig.forEach(function (g) { html += zeile(g.name, g.ags === Z.AGS_FROHBURG); });
    else if (r.aggregationsebene === "kreis") A.kreise_sachsen.forEach(function (k) { html += zeile(k.name, k.ags === Z.AGS_LK_LEIPZIG); });
    else A.laender.forEach(function (l) { html += zeile(l.name, l.code === "14"); });
    html += "</tbody></table><p class='hinweis'>Einzelne Ausgabestellen werden auf dieser Ebene nicht angezeigt. Filialdaten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL) (<a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noopener'>https://www.openstreetmap.org/copyright</a>). Keine Partnerschaft mit den Geschäften.</p></div>";
    host.innerHTML = html;
  }

  /* ---------- Bestände ---------- */
  function renderBestaende(host) {
    var r = Z.rolle(state.rolle), d = ds();
    var html = seitenTitel("Bestände", esc(d.name) + " · " + d.gebiet + " · Szenariodaten");
    var gebiet = r.aggregationsebene === "gemeinde" ? "Musterstadt" : r.aggregationsebene === "kreis" ? "Landkreis Leipzig" : "Freistaat Sachsen";
    html += "<div class='karte'><table id='bestand-tabelle'><thead><tr><th>Gebiet</th><th>Ware</th><th class='num'>Bestand</th><th class='num'>Ausgegeben im Demonstrationszeitraum</th><th class='num'>Reichweite</th></tr></thead><tbody>";
    var lauf = buchungen(PERIODE_LAUFEND);
    BESTAND_ARTIKEL.forEach(function (id) {
      var a = artikel(id), rw = reichweite(id);
      html += "<tr><td>" + esc(gebiet) + "</td><td>" + esc(a.bezeichnung_de) + "</td><td class='num'>" + esc(K.fmtMenge(bestand(id), a.einheit)) + "</td><td class='num'>" + esc(K.fmtMenge(summe(lauf, id), a.einheit)) + "</td><td class='num'>" + (rw == null ? "—" : fmtZahl(rw, 1) + " Tage") + "</td></tr>";
    });
    html += "</tbody></table>" + (r.aggregationsebene !== "gemeinde" ? "<p class='hinweis'>Übrige Gebiete: keine Daten.</p>" : "") + "<p class='hinweis'>Bestände sind Szenariodaten, keine Inventur. Keine Lagerorte. Anfangsbestände, Wareneingänge und Korrekturen der Retail-App sind nicht eingerechnet.</p></div>";
    if (r.aggregationsebene === "gemeinde") {
      html += "<div class='karte'><h2>Nach Art der Ausgabestelle (Musterstadt)</h2><table><thead><tr><th>Art</th><th>Ware</th><th class='num'>Bestand</th></tr></thead><tbody>";
      ["supermarket", "convenience", "pharmacy"].forEach(function (typ) {
        BESTAND_ARTIKEL.forEach(function (id) {
          var s = 0, n = 0;
          D.bestaende.forEach(function (b) { var st = stelleById(b.ausgabestelle_id); if (st && st.typ === typ && b.artikel_id === id) { s += Number(b.menge); n++; } });
          if (n) html += "<tr><td>" + esc(typLabel(typ)) + " (" + n + ")</td><td>" + esc(artikel(id).bezeichnung_de) + "</td><td class='num'>" + esc(K.fmtMenge(s, artikel(id).einheit)) + "</td></tr>";
        });
      });
      html += "</tbody></table></div>";
    }
    host.innerHTML = html;
  }

  /* ---------- Anmeldung ---------- */
  function zeigeAnmeldung() {
    $("oberflaeche").hidden = true;
    $("anmeldung").hidden = false;
    document.title = "Anmeldung · FoodAllo Fachverfahren Lebensmittelversorgung (Beta)";
    var sel = $("dienststelle"), apSel = $("arbeitsplatz");
    /* Login-Fix 23.11.2026: Listen immer mit gültigem value und fester Vorauswahl befüllen,
       Auswahl nach Neuladen/Zurück (Formular-Wiederherstellung, Autofill) neu abgleichen,
       Anmelden nie an der Browser-Listenprüfung scheitern lassen. */
    function gueltigeRolle(v) { return DIENSTSTELLEN[v] ? v : REIHENFOLGE[0]; }
    function fuelleListe(el, eintraege, wunsch) {
      el.innerHTML = eintraege.map(function (e) { return "<option value=\"" + esc(e.wert) + "\">" + esc(e.text) + "</option>"; }).join("");
      var idx = 0;
      for (var i = 0; i < eintraege.length; i++) { if (eintraege[i].wert === wunsch) { idx = i; break; } }
      el.selectedIndex = idx;
      if (el.options[idx]) el.options[idx].selected = true;
    }
    function ap(wunsch) {
      var plaetze = DIENSTSTELLEN[gueltigeRolle(sel.value)].arbeitsplaetze;
      fuelleListe(apSel, plaetze.map(function (a) { return { wert: a, text: a }; }), wunsch);
    }
    function dsListe(wunsch) {
      fuelleListe(sel, REIHENFOLGE.map(function (id) { var d = DIENSTSTELLEN[id]; return { wert: id, text: d.name + (d.amt ? " – " + d.amt : "") }; }), gueltigeRolle(wunsch));
    }
    function abgleich() {
      var r = gueltigeRolle(sel.value), a = apSel.value;
      if (sel.value !== r || sel.selectedIndex < 0) dsListe(r);
      if (DIENSTSTELLEN[r].arbeitsplaetze.indexOf(a) === -1 || apSel.selectedIndex < 0) ap(a);
    }
    dsListe(REIHENFOLGE[0]); ap();
    sel.onchange = function () { ap(); };
    sel.oninput = function () { if (DIENSTSTELLEN[sel.value] && DIENSTSTELLEN[sel.value].arbeitsplaetze.indexOf(apSel.value) === -1) ap(); };
    apSel.onchange = abgleich;
    if (!zeigeAnmeldung.pageshow) { zeigeAnmeldung.pageshow = true; window.addEventListener("pageshow", function () { if (!$("anmeldung").hidden && zeigeAnmeldung.abgleich) zeigeAnmeldung.abgleich(); }); }
    zeigeAnmeldung.abgleich = abgleich;
    setTimeout(function () { if (!$("anmeldung").hidden) abgleich(); }, 0);
    $("anmeldeform").onsubmit = function (ev) {
      ev.preventDefault();
      abgleich();
      var rolle = gueltigeRolle(sel.value), plaetze = DIENSTSTELLEN[rolle].arbeitsplaetze;
      var platz = plaetze.indexOf(apSel.value) !== -1 ? apSel.value : plaetze[0];
      var s = { rolle: rolle, arbeitsplatz: platz, kennung: $("kennung").value.trim() };
      try { sessionStorage.setItem(SPEICHER.sitzung, JSON.stringify(s)); } catch (e) { /* ohne Sitzungsspeicher */ }
      anmelden(s, null);
    };
  }
  function anmelden(s, ansicht) {
    state.rolle = s.rolle; state.arbeitsplatz = s.arbeitsplatz || DIENSTSTELLEN[s.rolle].arbeitsplaetze[0]; state.kennung = s.kennung || "";
    state.ansicht = ansicht || DIENSTSTELLEN[s.rolle].ansichten[0];
    $("anmeldung").hidden = true;
    $("oberflaeche").hidden = false;
    if (location.hash.replace("#", "") !== state.ansicht) history.replaceState(null, "", location.pathname + location.search + "#" + state.ansicht);
    render();
  }
  function abmelden() {
    try { sessionStorage.removeItem(SPEICHER.sitzung); } catch (e) { /* */ }
    state.rolle = null;
    history.replaceState(null, "", location.pathname);
    zeigeAnmeldung();
  }
  function geheZu(v) { state.ansicht = v; state.suche = ""; history.replaceState(null, "", location.pathname + location.search + "#" + v); render(); window.scrollTo(0, 0); }

  function render() {
    if (!state.rolle) return;
    kopf();
    var host = $("inhalt"), v = state.ansicht;
    if (ds().ansichten.indexOf(v) === -1) host.innerHTML = seitenTitel(ANSICHT_TITEL[v] || "Bereich") + sperre("Dieser Bereich steht am Arbeitsplatz „" + state.arbeitsplatz + "“ der Dienststelle " + dsVoll() + " nicht zur Verfügung.");
    else if (v === "arbeitskorb") renderArbeitskorb(host);
    else if (v === "schalter") renderSchalter(host);
    else if (v === "haushalte") renderHaushalte(host);
    else if (v === "karten") renderKarten(host);
    else if (v === "register") renderRegister(host);
    else if (v === "uebersicht" || v === "lage") renderLage(host);
    else if (v === "stoerungen") renderStoerungen(host);
    else if (v === "ausgabestellen") renderAusgabestellen(host);
    else if (v === "bestaende") renderBestaende(host);
    document.querySelectorAll("nav.reiter a[data-view]").forEach(function (a) {
      a.onclick = function (ev) { ev.preventDefault(); state.ablehnen = false; geheZu(a.getAttribute("data-view")); };
    });
    if (state.druck) document.documentElement.setAttribute("data-druckbereit", "1");
  }

  function params() {
    var q = {};
    location.search.replace(/^\?/, "").split("&").forEach(function (s) { if (!s) return; var p = s.split("="); q[decodeURIComponent(p[0])] = decodeURIComponent(p.slice(1).join("=") || ""); });
    return q;
  }
  function init() {
    var q = params();
    if (q.format === "a6" || q.format === "a4") state.format = q.format;
    if (q.druck === "1") state.druck = true;
    if (q.karte === "zusatz") state.kartenArt = "stoerung";
    if (q.person) state.person = q.person;
    if (q.filter) state.filter = q.filter;
    var hash = location.hash.replace("#", "") || q.ansicht || null;
    $("btn-abmelden").onclick = abmelden;
    window.addEventListener("hashchange", function () { var h = location.hash.replace("#", ""); if (state.rolle && h && h !== state.ansicht) { state.ansicht = h; render(); } });
    var s = null;
    if (q.rolle && DIENSTSTELLEN[q.rolle]) s = { rolle: q.rolle, arbeitsplatz: q.arbeitsplatz || "", kennung: q.kennung || "" };
    else { try { s = JSON.parse(sessionStorage.getItem(SPEICHER.sitzung) || "null"); } catch (e) { s = null; } }
    if (s && DIENSTSTELLEN[s.rolle]) anmelden(s, hash); else zeigeAnmeldung();
  }

  /* Testanker für den lokalen Chromium-Lauf */
  window.__FA_TEST = function () {
    var st = {};
    PERSONEN.forEach(function (p) { st[p.person_id] = aktuellerStatus(p.person_id).status; });
    return {
      rolle: state.rolle, ansicht: state.ansicht, angemeldet: !!state.rolle, darfFaelle: state.rolle ? darfFaelle() : false,
      namenImDom: (document.body.innerHTML.match(/Müller|Meier|Schulze/g) || []).length,
      vorgaengeImDom: (document.body.innerHTML.match(/Vorgang 2026\//g) || []).length,
      kleinzahlImDom: document.querySelectorAll(".kleinzahl").length,
      offeneEreignisse: offeneEreignisse().length, status: st, title: document.title
    };
  };
  window.__FA_EXPORT = function () { return jsonl(alleEreignisse()); };

  init();
})();
