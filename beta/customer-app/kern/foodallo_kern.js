/*
 * FoodAllo – gemeinsamer Regel- und Ereigniskern (Vanilla JS, ohne Abhängigkeiten).
 * Neutraler Ort für Customer App, Retail App und Desktopversion. Spiegelbild: foodallo_kern.py.
 * Schema: freigegeben v1 = ../schema/foodallo-core.schema.json; ausgerichtet an ../schema/proposals/foodallo-core.schema.v1.1-proposal.json
 * plus ../schema/proposals/retail-additions-v1.1.md (Ereignisfeld schema_version bleibt 1).
 *
 * Kernregel (Grundlagen_Systeme_v1.md, Abschnitt 5):
 * zugeteilt = min(angefragt, grundquote, restbestand)
 * grundquote = verbleibende Grundquote (je Person × Artikel × Periode) = offener Gutscheinrest.
 * Insulin: kein Basiskontingent; an die Stelle der Grundquote tritt der Rezeptrest.
 *
 * Browser: <script src=".../kern/foodallo_kern.js"> → window.FAKern. Node: require(".../kern/foodallo_kern.js").
 */
(function (root, factory) {
  var k = factory();
  if (typeof module === "object" && module.exports) module.exports = k;
  else root.FAKern = k;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KERN_VERSION = "1.8.7";
  var SCHEMA_VERSION = 1;          // Hauptversion im Ereignisfeld
  var SCHEMA_REVISION = "1.2"; // schema/foodallo-core.schema.v1.2.json, verbindlich seit 17.11.2026 (v1.1-Modus: {v12: false})
  var EPS = 1e-9;
  var RE_EREIGNIS_ID = /^FA-E-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  var RE_REZEPT_ID = /^FA-RX-\d{8}-\d{6}$/;
  var RE_STELLE = /^FA-AUTH-[A-Z0-9-]+$/;
  // Quellenregel laut verbindlichem Schema v1.1 (Festlegung, 12:16 Nr. 5 und 12:32 Nr. 2).
  // PERSON_VERIFIED: abgekündigt – wird gelesen (Alias), darf aber von keinem System neu geschrieben werden (SCHREIBVERBOT).
  var ERLAUBTE_QUELLE = {
    VOUCHER_ISSUED: ["desktop"],
    IDENTITY_VERIFIED: ["desktop"],
    SUPPLY_DISRUPTION_DECLARED: ["desktop"],
    SUPPLY_DISRUPTION_ENDED: ["desktop"],
    PERSON_REGISTERED: ["customer_app"],
    PRESCRIPTION_CHECKED: ["retail_app"],
    STOCK_RECEIPT_POSTED: ["retail_app"],
    STOCK_ADJUSTED: ["retail_app"],
    REDEMPTION_REVERSED: ["retail_app"],
    REDEMPTION_POSTED: ["retail_app"],  // auch Papierkarten werden im Handel gebucht (Festlegung)
    ALLOCATION_RUN_COMPLETED: ["desktop"],
    PAPER_CARD_RENDERED: ["desktop"],
    PAPER_CARD_PRINTED: ["desktop"],
    PERIOD_CLOSED: ["desktop"]
  };
  var SCHREIBVERBOT = { PERSON_VERIFIED: "PERSON_VERIFIED ist abgekündigt und wird nur gelesen; neue Ereignisse schreibt kein System (IDENTITY_VERIFIED nutzen, nur Desktopversion)." };
  var PZ_VERFAHREN = "ISO 7064 Mod 97-10";

  function r3(x) {
    var v = Math.round((Number(x) + (x >= 0 ? EPS : -EPS)) * 1000) / 1000;
    return v === 0 ? 0 : v;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- Regel ---------- */

  function zuteilen(angefragt, grundquote, restbestand) {
    var z = Math.min(Number(angefragt), Number(grundquote), Number(restbestand));
    return z > 0 ? r3(z) : 0;
  }

  /* ---------- IDs und Zeit ---------- */

  function uuid4() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function neueEreignisId() { return "FA-E-" + uuid4(); }
  // Anzeigename: festes Feld anzeigename (Filiale) hat Vorrang; sonst name + ortsteil, sofern der Ortsteil nicht schon im name steht (Festlegung; 20.11.2026: 0005 fest „Tante Enso Kohren-Sahlis“).
  function anzeigeName(ast) {
    if (ast && ast.anzeigename) return ast.anzeigename;
    var n = (ast && ast.name) || "", ot = ast && ast.ortsteil;
    return ot && n.indexOf(ot) < 0 ? n + " " + ot : n;
  }

  var PLZ_ANZEIGE = "12345";
  function plzAnzeige(plz) { return PLZ_ANZEIGE; }
  function anschriftVon(obj) {
    if (!obj) return {};
    var adr = obj.adresse;
    if (adr && (adr.strasse || adr.plz || adr.ort || adr.hausnummer)) {
      var d = {};
      Object.keys(adr).forEach(function (k) { d[k] = adr[k]; });
      if (!d.ortsteil && obj.ortsteil) d.ortsteil = obj.ortsteil;
      return d;
    }
    return obj;
  }
  function formatiereOrt(obj, mitStrasse) {
    var d = anschriftVon(obj);
    var ort = String(d.ort || "").trim();
    var ot = String(d.ortsteil || "").trim();
    var zusatz = ot && ot !== ort ? " (" + ot + ")" : "";
    var kern = (PLZ_ANZEIGE + " " + ort + zusatz).trim();
    if (mitStrasse !== false && (d.strasse || d.hausnummer)) {
      var strasse = [d.strasse, d.hausnummer].filter(function (x) { return String(x || "").trim(); }).join(" ").trim();
      return kern ? strasse + ", " + kern : strasse;
    }
    return kern;
  }

  function anzeigeTitel(eintrag) {
    var e = eintrag || {};
    if (e.vornamen || e.familienname) return ((e.vornamen || "") + " " + (e.familienname || "")).trim();
    if (e.anzeigename) return String(e.anzeigename).trim();
    return String(e.name || "").trim();
  }
  function anzeigeNameEindeutig(eintrag, alle) {
    var titel = anzeigeTitel(eintrag);
    var liste = alle || [];
    if (!liste.length) return titel;
    var titelCf = titel.toLowerCase(), nTitel = 0, i;
    for (i = 0; i < liste.length; i++) {
      if (anzeigeTitel(liste[i]).toLowerCase() === titelCf) nTitel++;
    }
    if (nTitel <= 1) return titel;
    var d = anschriftVon(eintrag);
    var strasse = [d.strasse, d.hausnummer].filter(function (x) { return String(x || "").trim(); }).join(" ").trim();
    if (!strasse) return titel;
    return titel + ", " + strasse;
  }

  // Anzeigecode und Strichcode zur Papierkarte (DT1); Prüfziffer ISO 7064 Mod 97-10 über AGS+lfd, nie Teil der papierkarte_id.
  function papierkartenCode(pkId) {
    var m = /^FA-PK-(\d{8})-(\d{6})$/.exec(String(pkId || ""));
    if (!m) return null;
    var ziffern = m[1] + m[2], r = 0;
    for (var i = 0; i < ziffern.length; i++) r = (r * 10 + Number(ziffern[i])) % 97;
    var pz = ("0" + (98 - (r * 100) % 97)).slice(-2);
    return { code_anzeige: pkId + "-" + pz, code_barcode: "FAPK" + ziffern + pz, pruefziffer_verfahren: PZ_VERFAHREN };
  }

  // Vor dem Anhängen NEUER Ereignisse: Schreibverbot (PERSON_VERIFIED) und Quellenregel. null = erlaubt.
  /** V15 (v1.2-Vorschlag): PERSON_REGISTERED.payload.kanal -> erlaubte Quelle. */
  var KANAL_QUELLE_V12 = { app: "customer_app", papier: "desktop" };
  function quellenfehler(ev, v12) {
    if (v12 && ev.typ === "PERSON_REGISTERED") {
      var kanal = (ev.payload || {}).kanal;
      if (kanal === undefined) kanal = null;
      if (kanal !== null && !Object.prototype.hasOwnProperty.call(KANAL_QUELLE_V12, kanal)) return "PERSON_REGISTERED: kanal muss app oder papier sein.";
      var soll = KANAL_QUELLE_V12[kanal || "app"];
      if (ev.quelle_system !== soll) return "PERSON_REGISTERED mit kanal=" + (kanal || "app (fehlt)") + " darf nur von " + soll + " kommen.";
      return null;
    }
    var erlaubt = ERLAUBTE_QUELLE[ev.typ];
    if (erlaubt && erlaubt.indexOf(ev.quelle_system) < 0) return ev.typ + " darf nur von " + erlaubt.join("/") + " kommen.";
    return null;
  }
  /** Ab Kern 1.8.0 gilt v1.2 als Standard; nur {v12: false} schaltet den v1.1-Altmodus ein. */
  function regelnV12(optionen) { return !(optionen && optionen.v12 === false); }
  function pruefeSchreibrecht(ev, optionen) {
    if (SCHREIBVERBOT[ev.typ]) return SCHREIBVERBOT[ev.typ];
    return quellenfehler(ev, regelnV12(optionen));
  }

  function istEreignisId(s) { return typeof s === "string" && RE_EREIGNIS_ID.test(s); }
  function bestandId(ausgabestelleId, artikelId) { return "FA-S-" + ausgabestelleId + "-" + artikelId; }

  function zeitBerlin(d) {
    d = d || new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    var off = -d.getTimezoneOffset(), s = off >= 0 ? "+" : "-";
    off = Math.abs(off);
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" +
      p(d.getMinutes()) + ":" + p(d.getSeconds()) + s + p(Math.floor(off / 60)) + ":" + p(off % 60);
  }
  function ms(z) { return Date.parse(z); }

  function huelle(typ, quelle, payload, jetzt) {
    return { ereignis_id: neueEreignisId(), typ: typ, zeit_ereignis: jetzt, zeit_empfang: null,
      quelle_system: quelle, payload: payload, schema_version: SCHEMA_VERSION };
  }

  /* ---------- Synthetischer Rezeptnachweis (Demo-Prüfsumme, keine Sicherheit) ---------- */
  // Form: FA-RXN1~rezept_id~person_id~menge~einheit~gueltig_von~gueltig_bis~pruefsumme (Bindung nur über person_id)
  // pruefsumme = FNV-1a (32 bit, hex) über alle vorherigen Teile + "~foodallo-demo". Keine Diagnosen, keine Ärztin/kein Arzt.

  function fnv1a(text) {
    var h = 0x811c9dc5;
    var bytes = typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text) : Buffer.from(text, "utf8");
    for (var i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }

  function rezeptnachweisToken(r) {
    var teile = ["FA-RXN1", r.rezept_id, r.person_id, String(r.menge), r.einheit || "IE", r.gueltig_von, r.gueltig_bis];
    return teile.join("~") + "~" + fnv1a(teile.join("~") + "~foodallo-demo");
  }

  function pruefeRezeptnachweis(token, jetzt) {
    var t = String(token || "").trim().split("~");
    if (t.length !== 8 || t[0] !== "FA-RXN1") return { ok: false, fehler: "Rezeptnachweis hat nicht die Form FA-RXN1~…" };
    var soll = fnv1a(t.slice(0, 7).join("~") + "~foodallo-demo");
    if (soll !== t[7]) return { ok: false, fehler: "Prüfsumme des Rezeptnachweises stimmt nicht." };
    var r = { rezept_id: t[1], person_id: t[2], artikel_id: "insulin", menge: Number(t[3]),
      einheit: t[4], gueltig_von: t[5], gueltig_bis: t[6], status: "gueltig", verfahren: "synthetisch" };
    if (!RE_REZEPT_ID.test(r.rezept_id)) return { ok: false, fehler: "Rezept-ID ungültig." };
    if (!/^FA-P-\d{8}-\d{6}$/.test(r.person_id)) return { ok: false, fehler: "Rezeptinhaber (person_id) ungültig." };
    if (!(r.menge > 0) || r.einheit !== "IE") return { ok: false, fehler: "Verordnete Menge oder Einheit ungültig." };
    var von = ms(r.gueltig_von), bis = ms(r.gueltig_bis), j = ms(jetzt);
    if (isNaN(von) || isNaN(bis) || von > bis) return { ok: false, fehler: "Gültigkeitszeitraum ungültig." };
    if (j < von) return { ok: false, fehler: "Rezept ist noch nicht gültig (ab " + r.gueltig_von + ")." };
    if (j > bis) return { ok: false, fehler: "Rezept ist abgelaufen (bis " + r.gueltig_bis + ")." };
    return { ok: true, rezept: r };
  }

  // Einlösende Person muss bekannt, bestätigt (PERSON_VERIFIED oder IDENTITY_VERIFIED) und Mitglied des Gutschein-Haushalts sein
  function istBerechtigt(st, personId, g) {
    var p = personId && st.personen[personId];
    if (!p || !p.verifiziert || !g) return false;
    if (g.bezug === "person") return g.person_id === personId;   // nur v1-Altform
    return p.haushalt_id === g.haushalt_id;
  }

  function personBestaetigt(st, personId) { var p = personId && st.personen[personId]; return !!(p && p.verifiziert); }

  /** true, wenn genau diese Störung zum Zeitpunkt aktiv ist (beginn <= t < ende; ende auch durch SUPPLY_DISRUPTION_ENDED). */
  function stoerungAktivId(st, sid, zeit) {
    var s = st.stoerungen[sid], t = ms(zeit);
    return !!s && ms(s.beginn) <= t && (!s.ende || t < ms(s.ende));
  }
  /** v1.2-Vorschlag: anlass fehlt = regulaer (wie v1.1). */
  function gutscheinAnlass(g) { return (g && g.anlass) || "regulaer"; }
  function v12Aktiv(st) { return !!(st.regeln && st.regeln.v12); }
  /** v1.2-Vorschlag: Störungsgutschein nur bei aktiver verwiesener Störung derselben AGS und nur für nur_bei_stoerung-Artikel. null = ok. */
  function pruefeStoerungsgutschein(st, g, ags, zeit, artikelId) {
    if (gutscheinAnlass(g) !== "stoerung") return null;
    var sid = g.stoerung_id, s = sid ? st.stoerungen[sid] : null;
    if (!s) return "Störungsgutschein verweist auf unbekannte Störung " + sid + ".";
    if (ags != null && s.ags !== ags) return "Störung " + sid + " gilt für AGS " + s.ags + ", nicht für " + ags + ".";
    if (!stoerungAktivId(st, sid, zeit)) {
      if (s.ende && ms(zeit) >= ms(s.ende)) return "Störung " + sid + " ist zum Zeitpunkt nicht aktiv (beendet " + s.ende + "): Rest des Störungsgutscheins verfallen.";
      return "Störung " + sid + " ist zum Zeitpunkt nicht aktiv.";
    }
    var ids = artikelId ? [artikelId] : (g.positionen || []).map(function (q) { return q.artikel_id; });
    for (var i = 0; i < ids.length; i++) {
      var a = st.artikel[ids[i]];
      if (!a || a.nur_bei_stoerung !== s.art) return "Störungsgutschein darf nur Artikel mit nur_bei_stoerung = " + s.art + " enthalten (" + ids[i] + ").";
    }
    return null;
  }
  /** v1.2 (Festlegung): Rest eines Störungsgutscheins verfällt mit dem Ende der verwiesenen Störung; kein eigenes Ereignis. */
  function stoerungsgutscheinVerfallen(st, g, zeit) {
    if (gutscheinAnlass(g) !== "stoerung") return false;
    var s = st.stoerungen[(g || {}).stoerung_id];
    return !!(s && s.ende && ms(zeit) >= ms(s.ende));
  }
  /** Papierpfad (kanal papier_abgleich): papierkarte_id, Anzeigecode oder Strichcode -> genau ein Gutschein. */
  function gutscheinZurPapierkarte(st, karte) {
    var k = String(karte || "").trim(), treffer = [];
    Object.keys(st.gutscheine).forEach(function (id) {
      var g = st.gutscheine[id], pk = g.papierkarte_id;
      if (!pk) return;
      var c = papierkartenCode(pk) || {};
      if (k === pk || k === c.code_anzeige || k === c.code_barcode) treffer.push(g.gutschein_id);
    });
    if (!treffer.length) return { fehler: "Keine Papierkarte " + k + " bekannt." };
    if (treffer.length > 1) return { fehler: "Papierkarte " + k + " ist mehreren Gutscheinen zugeordnet (" + treffer.sort().join(", ") + ")." };
    return { gutschein_id: treffer[0] };
  }
  function agsAusPapierkarte(pk) { var m = /^FA-PK-(\d{8})-\d{6}$/.exec(String(pk || "")); return m ? m[1] : null; }
  function agsAusHaushalt(hid) { var m = /^FA-HH-(\d{8})-\d{6}$/.exec(String(hid || "")); return m ? m[1] : null; }
  function v12AusstellungFehler(st, gn, ev) {
    var anlass = gutscheinAnlass(gn), sid = gn.stoerung_id;
    var agsHh = agsAusHaushalt(gn.haushalt_id), ags = gn.ags === undefined ? null : gn.ags;
    if (ags !== null && !/^\d{8}$/.test(String(ags))) return "ags muss 8 Ziffern haben.";
    if (ags !== null && agsHh && ags !== agsHh) return "ags " + ags + " passt nicht zur AGS aus haushalt_id (" + agsHh + ").";
    if (anlass === "regulaer" && sid) return "stoerung_id ist bei anlass=regulaer nicht erlaubt.";
    if (anlass === "regulaer") {
      var qs = gn.positionen || [];
      for (var j = 0; j < qs.length; j++) {
        var a = st.artikel[qs[j].artikel_id];
        if (a && a.nur_bei_stoerung && ((qs[j].zugeteilt_max || 0) > EPS || (qs[j].rest || 0) > EPS))
          return "Regulärer Gutschein darf keine Artikel mit nur_bei_stoerung enthalten (" + qs[j].artikel_id + "); " +
            "zulässig ist nur die v1.1-Platzhalterposition mit zugeteilt_max 0 und rest 0.";
      }
    }
    if (anlass === "stoerung") {
      if (!sid) return "anlass=stoerung braucht stoerung_id.";
      if (ags === null) return "anlass=stoerung braucht ags (8 Stellen).";
      if (gn.kanal === "papier" && !gn.papierkarte_id) return "Störungsgutschein auf Papier braucht eine eigene papierkarte_id.";
      var fs = pruefeStoerungsgutschein(st, gn, agsHh || ags, ev.zeit_ereignis);
      if (fs) return fs;
    }
    var pk = gn.papierkarte_id;
    if (pk && agsHh && agsAusPapierkarte(pk) !== agsHh) return "papierkarte_id " + pk + " gehört nicht zur AGS des Haushalts (" + agsHh + ").";
    var kk = Object.keys(st.gutscheine);
    for (var m = 0; m < kk.length; m++) {
      var gp = st.gutscheine[kk[m]];
      if (pk && gp.gutschein_id !== gn.gutschein_id && gp.papierkarte_id === pk)
        return "papierkarte_id " + pk + " ist schon Gutschein " + gp.gutschein_id + " zugeordnet (je Gutschein eine eigene Papierkarte).";
    }
    var ks = Object.keys(st.gutscheine);
    for (var i = 0; i < ks.length; i++) {
      var g = st.gutscheine[ks[i]];
      if (g.gutschein_id === gn.gutschein_id || g.haushalt_id !== gn.haushalt_id || g.periode_id !== gn.periode_id) continue;
      if (gutscheinAnlass(g) === "regulaer" && anlass === "regulaer") return "Haushalt hat in " + gn.periode_id + " schon einen regulären Gutschein (" + g.gutschein_id + ").";
      if (gutscheinAnlass(g) === "stoerung" && anlass === "stoerung" && g.stoerung_id === sid) return "Haushalt hat für Störung " + sid + " in " + gn.periode_id + " schon einen Störungsgutschein (" + g.gutschein_id + ").";
    }
    return null;
  }

  /** true, wenn für AGS und Zeitpunkt eine SUPPLY_DISRUPTION der Art aktiv ist (beginn <= t < ende). */
  function stoerungAktiv(st, ags, art, zeit) {
    var t = ms(zeit);
    return Object.keys(st.stoerungen).some(function (k) {
      var s = st.stoerungen[k];
      return s.ags === ags && s.art === art && ms(s.beginn) <= t && (!s.ende || t < ms(s.ende));
    });
  }

  /* ---------- Zustand ---------- */
  // stammdaten: { ausgabestellen, artikel, stoerungen }; gutscheine: Demo-Ausstellung der Desktopversion (Seed);
  // personen: [{ person_id, haushalt_id, verifikation: { status } }] (Seed, bis PERSON_REGISTERED/IDENTITY_VERIFIED im Log stehen)

  // optionen = { v12: false } schaltet den v1.1-Altmodus ein. Standard ab 1.8.0: v1.2 (verbindlich).
  function startzustand(stammdaten, gutscheine, personen, optionen) {
    var st = { regeln: { v12: regelnV12(optionen) }, ausgabestellen: {}, artikel: {}, gutscheine: {}, seed_gutscheine: {}, personen: {}, bestand: {}, buchungen: {},
      wareneingaenge: {}, rezepte: {}, perioden_geschlossen: {}, angewendet: {}, stoerungen: {} };
    (stammdaten.ausgabestellen || []).forEach(function (a) { st.ausgabestellen[a.ausgabestelle_id] = clone(a); });
    (stammdaten.artikel || []).forEach(function (a) { st.artikel[a.artikel_id] = clone(a); });
    (gutscheine || []).forEach(function (g) { st.gutscheine[g.gutschein_id] = clone(g); st.seed_gutscheine[g.gutschein_id] = true; });
    (personen || []).forEach(function (p) { st.personen[p.person_id] = { haushalt_id: p.haushalt_id, verifiziert: !!(p.verifikation && p.verifikation.status === "bestaetigt") }; });
    return st;
  }

  function position(g, artikelId) {
    for (var i = 0; i < g.positionen.length; i++) if (g.positionen[i].artikel_id === artikelId) return g.positionen[i];
    return null;
  }

  function gutscheinStatus(g) {
    if (g.status === "storniert" || g.status === "abgelaufen") return g.status;
    var einloesbar = g.positionen.filter(function (p) { return p.rest !== null && p.zugeteilt_max !== null; });
    if (!g.positionen.some(function (p) { return p.eingeloest > EPS; })) return "ausgestellt";
    return einloesbar.length && einloesbar.every(function (p) { return p.rest <= EPS; }) ? "ausgeschoepft" : "teilweise_eingeloest";
  }

  function rezeptRest(st, r) {
    var bek = st.rezepte[r.rezept_id];
    return bek ? bek.rest : r3(r.menge);
  }

  /* ---------- Planung einer Einlösung (Vorschau, ändert nichts) ---------- */
  // eingabe: { ausgabestelle_id, gutschein_id, einloesende_person_id, artikel_id, angefragt, rezept? (aus pruefeRezeptnachweis) }

  function planeEinloesung(st, eingabe) {
    // Insulin (rezeptpflichtig) geht über das Rezept, ohne Gutschein (Festlegung)
    var ast = st.ausgabestellen[eingabe.ausgabestelle_id];
    var art = st.artikel[eingabe.artikel_id];
    var rezeptweg = !!(art && art.rezeptpflicht);
    var g = rezeptweg ? null : st.gutscheine[eingabe.gutschein_id];
    var angefragt = Number(eingabe.angefragt || 0);
    var zeit = eingabe.zeit || zeitBerlin();
    var res = { ok: false, fehler: null, angefragt: angefragt, basiskontingent: null, grundquote: null,
      quote_art: rezeptweg ? "rezept" : "grundquote", restbestand: null, zugeteilt: 0, einheit: art ? art.einheit : null };
    function f(m) { res.fehler = m; return res; }
    if (!ast) return f("Ausgabestelle unbekannt.");
    if (ast.aktiv === false) return f("Keine aktive Ausgabestelle (nur im Register).");
    if (!art) return f("Artikel unbekannt.");
    if (!(angefragt > 0)) return f("Angefragte Menge muss größer als 0 sein.");
    if (art.abgabekanal === "apotheke" && ast.typ !== "pharmacy") return f(art.bezeichnung_de + " darf nur in einer Apotheke abgegeben werden.");
    if (art.abgabekanal === "einzelhandel" && ast.abgabekanal !== "einzelhandel") return f(art.bezeichnung_de + " wird hier nicht abgegeben.");
    var pid = eingabe.einloesende_person_id;
    if (rezeptweg) {
      if (!personBestaetigt(st, pid)) return f("Einlösende Person ist nicht als bestätigt bekannt.");
      var r = eingabe.rezept;
      if (!r) return f("Rezeptpflichtig: ohne geprüften Rezeptnachweis keine Abgabe.");
      if (r.artikel_id !== art.artikel_id) return f("Rezept gilt nicht für diesen Artikel.");
      if (r.person_id !== pid) return f("Insulin nur an die Rezeptinhaberin bzw. den Rezeptinhaber.");
      res.grundquote = rezeptRest(st, r);
      if (res.grundquote <= 0) return f("Rezept ist bereits vollständig beliefert.");
    } else {
      if (!g) return f("Gutschein " + eingabe.gutschein_id + " ist unbekannt.");
      if (g.status === "storniert" || g.status === "abgelaufen") return f("Gutschein ist " + g.status + ".");
      if (st.perioden_geschlossen[g.periode_id]) return f("Periode " + g.periode_id + " ist geschlossen.");
      if (!istBerechtigt(st, pid, g)) return f("Einlösende Person ist nicht als bestätigtes Mitglied dieses Haushalts bekannt.");
      var fsg = pruefeStoerungsgutschein(st, g, ast.ags, zeit, art.artikel_id);
      if (fsg) return f(fsg);
      if (v12Aktiv(st) && art.nur_bei_stoerung && gutscheinAnlass(g) === "regulaer")
        return f(art.bezeichnung_de + " nur über den Störungsgutschein, nicht über den regulären Gutschein (v1.2).");
      if (art.nur_bei_stoerung && !stoerungAktiv(st, ast.ags, art.nur_bei_stoerung, zeit))
        return f(art.bezeichnung_de + " nur während einer aktiven Versorgungsstörung (" + art.nur_bei_stoerung + ") für AGS " + ast.ags + ".");
      var pos = position(g, art.artikel_id);
      if (!pos) return f("Gutschein enthält keine Position " + art.bezeichnung_de + ".");
      res.basiskontingent = pos.basiskontingent;
      if (pos.basiskontingent === null || pos.rest === null) return f("Basiskontingent für " + art.bezeichnung_de + " ist offen – keine Einlösung.");
      res.grundquote = r3(Math.min(pos.rest, pos.basiskontingent));
    }
    var b = st.bestand[bestandId(ast.ausgabestelle_id, art.artikel_id)];
    if (!b) return f("Für diese Ausgabestelle ist noch kein Anfangsbestand " + art.bezeichnung_de + " gebucht.");
    res.restbestand = b.menge;
    res.zugeteilt = zuteilen(angefragt, res.grundquote, res.restbestand);
    if (res.zugeteilt <= 0) return f(res.grundquote <= 0 ? "Grundquote dieser Periode ist ausgeschöpft." : "Kein Restbestand vorhanden.");
    res.ok = true;
    return res;
  }

  /* ---------- Ereignis anwenden (atomar: alles oder nichts, idempotent) ---------- */


  var AUSSTELLUNG_KOPF = ["periode_id", "bezug", "person_id", "haushalt_id", "kanal", "papierkarte_id"];
  /** true, wenn zwei Gutscheine dieselbe Ausstellung beschreiben (Kopf, Basiskontingent, zugeteilt_max je Artikel). */
  function gleicheAusstellung(a, b) {
    for (var i = 0; i < AUSSTELLUNG_KOPF.length; i++) {
      var k = AUSSTELLUNG_KOPF[i], x = a[k] === undefined ? null : a[k], y = b[k] === undefined ? null : b[k];
      if (x !== y) return false;
    }
    function karte(g) { var m = {}; (g.positionen || []).forEach(function (q) { m[q.artikel_id] = r3(q.basiskontingent || 0) + "|" + r3(q.zugeteilt_max || 0); }); return m; }
    var pa = karte(a), pb = karte(b), ka = Object.keys(pa).sort(), kb = Object.keys(pb).sort();
    if (ka.join() !== kb.join()) return false;
    return ka.every(function (k) { return pa[k] === pb[k]; });
  }

  function wendeAn(stAlt, ev) {
    if (!istEreignisId(ev.ereignis_id)) return { ok: false, fehler: "ereignis_id muss FA-E-<uuid> sein.", zustand: stAlt };
    if (stAlt.angewendet[ev.ereignis_id]) return { ok: true, doppelt: true, zustand: stAlt };
    var fq = quellenfehler(ev, v12Aktiv(stAlt));
    if (fq) return { ok: false, fehler: fq, zustand: stAlt };
    var st = clone(stAlt), p = ev.payload || {}, f = null;

    if (ev.typ === "REDEMPTION_POSTED") {
      var b = p.ausgabebuchung, gid = b.gutschein_id, rid = b.rezept_id;
      var g = gid ? st.gutscheine[gid] : null, art = st.artikel[b.artikel_id], ast = st.ausgabestellen[b.ausgabestelle_id];
      var bestand = st.bestand[bestandId(b.ausgabestelle_id, b.artikel_id)];
      var bekannt = !!ast; // fremde Ausgabestellen: Bestand wird hier nicht geführt
      var rez = null, pos = null;
      if (st.buchungen[b.buchung_id]) f = "Buchung " + b.buchung_id + " existiert bereits.";
      else if (!!gid === !!rid) f = "Ausgabebuchung braucht genau eines: gutschein_id oder rezept_id.";
      else if (!art) f = "Artikel unbekannt.";
      else if (!(b.menge > 0)) f = "Menge muss > 0 sein.";
      else if (art.abgabekanal === "apotheke" && (!ast || ast.typ !== "pharmacy")) f = "Nur Apotheke.";
      else if (rid) {
        // Insulin auf Rezept, ohne Gutschein (v1.1 gemeinsam)
        rez = st.rezepte[rid] || null;
        if (!art.rezeptpflicht) f = "rezept_id nur bei rezeptpflichtigen Artikeln.";
        else if (!rez) f = "Kein PRESCRIPTION_CHECKED für dieses Rezept.";
        else if (!personBestaetigt(st, b.einloesende_person_id)) f = "Einlösende Person nicht bestätigt.";
      } else {
        if (!g) f = "Gutschein unbekannt: " + gid;
        else if (g.status === "storniert" || g.status === "abgelaufen") f = "Gutschein ist " + g.status + ".";
        else if (st.perioden_geschlossen[g.periode_id]) f = "Periode geschlossen.";
        else if ((ev.quelle_system === "retail_app" || art.rezeptpflicht) && !istBerechtigt(st, b.einloesende_person_id, g)) f = "Einlösende Person nicht bestätigtes Haushaltsmitglied.";
        else if (art.nur_bei_stoerung && bekannt && !stoerungAktiv(st, ast.ags, art.nur_bei_stoerung, b.zeit)) f = "Nur während einer aktiven Versorgungsstörung.";
        else if (bekannt && pruefeStoerungsgutschein(st, g, ast.ags, b.zeit, b.artikel_id)) f = pruefeStoerungsgutschein(st, g, ast.ags, b.zeit, b.artikel_id);
        else if (v12Aktiv(st) && art.nur_bei_stoerung && gutscheinAnlass(g) === "regulaer") f = "Artikel mit nur_bei_stoerung nur über den Störungsgutschein (v1.2).";
        else if (art.rezeptpflicht) {
          rez = st.rezepte[b.rezept_ref] || null; // v1-Altform: Insulin mit gutschein_id + rezept_ref
          if (!b.rezept_ref || !rez) f = "Kein PRESCRIPTION_CHECKED für dieses Rezept.";
        } else {
          pos = position(g, b.artikel_id);
          if (!pos) f = "Position fehlt.";
          else if (pos.rest === null || pos.basiskontingent === null) f = "Basiskontingent offen.";
          else if (b.menge > pos.rest + EPS) f = "Menge übersteigt Gutscheinrest (" + pos.rest + ").";
        }
      }
      if (!f && rez) {
        if (rez.person_id !== b.einloesende_person_id) f = "Insulin nur an die Rezeptinhaberin bzw. den Rezeptinhaber.";
        else if (ms(b.zeit) < ms(rez.gueltig_von) || ms(b.zeit) > ms(rez.gueltig_bis)) f = "Rezept zum Buchungszeitpunkt nicht gültig.";
        else if (b.menge > rez.rest + EPS) f = "Menge übersteigt Rezeptrest (" + rez.rest + ").";
      }
      if (!f && bekannt && (!bestand || b.menge > bestand.menge + EPS)) f = "Menge übersteigt Restbestand.";
      if (!f) {
        if (rez) { rez.abgegeben = r3(rez.abgegeben + b.menge); rez.rest = r3(rez.rest - b.menge); if (rez.rest <= EPS) rez.status = "eingeloest"; }
        else { pos.eingeloest = r3(pos.eingeloest + b.menge); pos.rest = r3(pos.rest - b.menge); g.status = gutscheinStatus(g); }
        if (bekannt) { bestand.menge = r3(bestand.menge - b.menge); bestand.stand = b.zeit; }
        st.buchungen[b.buchung_id] = clone(b);
        st.buchungen[b.buchung_id].ereignis_id = ev.ereignis_id;
      }
    } else if (ev.typ === "REDEMPTION_REVERSED") {
      var alt = st.buchungen[p.buchung_id];
      if (!alt) f = "Buchung unbekannt.";
      else if (alt.status === "storniert") f = "Buchung bereits storniert.";
      else if (!p.begruendung) f = "Storno ohne Begründung.";
      else {
        var a2 = st.artikel[alt.artikel_id];
        if (a2 && a2.rezeptpflicht) {
          var rz = st.rezepte[alt.rezept_id || alt.rezept_ref];
          rz.abgegeben = r3(rz.abgegeben - alt.menge); rz.rest = r3(rz.rest + alt.menge); rz.status = "gueltig";
        } else {
          var g2 = st.gutscheine[alt.gutschein_id], pos2 = position(g2, alt.artikel_id);
          pos2.eingeloest = r3(pos2.eingeloest - alt.menge); pos2.rest = r3(pos2.rest + alt.menge); g2.status = gutscheinStatus(g2);
        }
        var b2 = st.bestand[bestandId(alt.ausgabestelle_id, alt.artikel_id)];
        if (b2) { b2.menge = r3(b2.menge + alt.menge); b2.stand = ev.zeit_ereignis; }
        alt.status = "storniert";
      }
    } else if (ev.typ === "STOCK_RECEIPT_POSTED") {
      var w = p.wareneingang, a3 = st.artikel[w.artikel_id], ast3 = st.ausgabestellen[w.ausgabestelle_id];
      if (st.wareneingaenge[w.wareneingang_id]) f = "Wareneingang existiert bereits.";
      else if (!a3) f = "Artikel unbekannt.";
      else if (!(w.menge > 0)) f = "Menge muss > 0 sein.";
      else if (w.einheit && w.einheit !== a3.einheit) f = "Falsche Einheit.";
      else if (ast3 && a3.abgabekanal === "apotheke" && ast3.typ !== "pharmacy") f = a3.bezeichnung_de + " nur in Apotheken.";
      else if (!ast3) st.wareneingaenge[w.wareneingang_id] = clone(w); // fremde Ausgabestelle: kein Bestand hier
      else {
        var id3 = bestandId(w.ausgabestelle_id, w.artikel_id);
        if (!st.bestand[id3]) f = "Noch kein Anfangsbestand – zuerst STOCK_ADJUSTED (anfangsbestand).";
        else {
          st.bestand[id3].menge = r3(st.bestand[id3].menge + w.menge);
          st.bestand[id3].stand = w.zeit;
          st.wareneingaenge[w.wareneingang_id] = clone(w);
        }
      }
    } else if (ev.typ === "STOCK_ADJUSTED") {
      var a4 = st.artikel[p.artikel_id], ast4 = st.ausgabestellen[p.ausgabestelle_id];
      var id4 = bestandId(p.ausgabestelle_id, p.artikel_id);
      if (!a4) f = "Artikel unbekannt.";
      else if (!(typeof p.menge_neu === "number" && p.menge_neu >= 0)) f = "Menge darf nicht negativ sein.";
      else if (p.einheit && p.einheit !== a4.einheit) f = "Falsche Einheit.";
      else if (ast4 && a4.abgabekanal === "apotheke" && ast4.typ !== "pharmacy") f = a4.bezeichnung_de + " nur in Apotheken.";
      else if (p.anlass === "anfangsbestand" && st.bestand[id4]) f = "Anfangsbestand ist bereits gesetzt.";
      else if (ast4) st.bestand[id4] = { bestand_id: id4, ausgabestelle_id: p.ausgabestelle_id, artikel_id: p.artikel_id,
        menge: r3(p.menge_neu), einheit: a4.einheit, stand: p.stand || ev.zeit_ereignis };
    } else if (ev.typ === "PRESCRIPTION_CHECKED") {
      var r = p.rezept, ast5 = st.ausgabestellen[p.ausgabestelle_id];
      if (!r || r.artikel_id !== "insulin") f = "Rezept fehlt oder gilt nicht für Insulin.";
      else if (!r.person_id) f = "Rezept ohne person_id.";
      else if (ast5 && ast5.typ !== "pharmacy") f = "Rezeptprüfung nur in Apotheken.";
      else if (!st.rezepte[r.rezept_id]) {
        st.rezepte[r.rezept_id] = { rezept_id: r.rezept_id, person_id: r.person_id,
          artikel_id: r.artikel_id, menge: r3(r.menge), einheit: r.einheit || "IE", gueltig_von: r.gueltig_von, gueltig_bis: r.gueltig_bis,
          status: "gueltig", abgegeben: 0, rest: r3(r.menge), letzte_pruefung: ev.zeit_ereignis };
      } else st.rezepte[r.rezept_id].letzte_pruefung = ev.zeit_ereignis;
    } else if (ev.typ === "VOUCHER_ISSUED") {
      var gn = p.gutschein, vorh = st.gutscheine[gn.gutschein_id];
      // Seed = Demo-Ausstellung der Desktopversion; ein echtes VOUCHER_ISSUED derselben ID ersetzt ihn, solange nichts eingelöst ist
      var istSeed = !!vorh && !!st.seed_gutscheine[gn.gutschein_id];
      var momentaufnahme = gn.status === "ausgestellt" && (gn.positionen || []).every(function (q) {
        return Math.abs(q.eingeloest || 0) <= EPS && (q.zugeteilt_max == null ? q.rest == null : (q.rest != null && Math.abs(q.rest - q.zugeteilt_max) <= EPS));
      });
      var anlass = gutscheinAnlass(gn);
      if (!momentaufnahme) f = "VOUCHER_ISSUED ist eine Momentaufnahme der Ausstellung (status ausgestellt, eingeloest 0, rest = zugeteilt_max).";
      else if (anlass !== "regulaer" && anlass !== "stoerung") f = "anlass " + anlass + " unbekannt.";
      else if (anlass === "stoerung" && !v12Aktiv(st)) f = "anlass=stoerung gehört zum v1.2-Vorschlag und ist ohne v1.2-Schalter nicht zulässig.";
      else if (v12Aktiv(st) && v12AusstellungFehler(st, gn, ev)) f = v12AusstellungFehler(st, gn, ev);
      else if (vorh && !istSeed) f = "Gutschein existiert bereits.";
      else if (istSeed && vorh.positionen.some(function (q) { return q.eingeloest > EPS; })) {
        // Seed mit Einlösungen: nur bestätigen, wenn die Ausstellung inhaltsgleich ist; Einlösungen bleiben.
        if (gleicheAusstellung(vorh, gn)) delete st.seed_gutscheine[gn.gutschein_id];
        else f = "Gutschein existiert bereits als Demo-Gutschein mit Einlösungen und weicht von der Ausstellung ab.";
      }
      else { st.gutscheine[gn.gutschein_id] = clone(gn); delete st.seed_gutscheine[gn.gutschein_id]; }
    } else if (ev.typ === "PERSON_REGISTERED") {
      var pr = p.person;
      if (pr && pr.person_id) st.personen[pr.person_id] = { haushalt_id: pr.haushalt_id, verifiziert: !!(pr.verifikation && pr.verifikation.status === "bestaetigt") };
    } else if (ev.typ === "PERSON_VERIFIED" || ev.typ === "IDENTITY_VERIFIED") {
      // PERSON_VERIFIED: nur Lese-Alias für IDENTITY_VERIFIED (Festlegung)
      var ver = p.verifikation || {};
      if (ev.typ === "IDENTITY_VERIFIED" && !RE_STELLE.test(String(ver.stelle || ""))) f = "IDENTITY_VERIFIED nur durch die Meldebehörde (verifikation.stelle FA-AUTH-…).";
      else {
        var pv = st.personen[p.person_id] || (st.personen[p.person_id] = { haushalt_id: null, verifiziert: false });
        pv.verifiziert = ver.status === "bestaetigt";
      }
    } else if (ev.typ === "SUPPLY_DISRUPTION_DECLARED") {
      var sid = p.stoerung_id;
      if (!(sid && p.ags && p.art && p.beginn)) f = "Störung unvollständig (stoerung_id, ags, art, beginn).";
      else if (st.stoerungen[sid]) f = "Störung existiert bereits.";
      else if (p.ende && ms(p.ende) <= ms(p.beginn)) f = "Ende liegt nicht nach dem Beginn.";
      else st.stoerungen[sid] = { stoerung_id: sid, ags: p.ags, art: p.art, beginn: p.beginn, ende: p.ende === undefined ? null : p.ende, beendet: false };
    } else if (ev.typ === "SUPPLY_DISRUPTION_ENDED") {
      var s0 = st.stoerungen[p.stoerung_id];
      if (!s0) f = "Störung unbekannt.";
      else if (s0.ags !== p.ags) f = "AGS passt nicht zur Störung.";
      else if (s0.beendet) f = "Störung ist bereits beendet.";
      else if (!p.ende || ms(p.ende) < ms(s0.beginn)) f = "Ende fehlt oder liegt vor dem Beginn.";
      else { s0.ende = p.ende; s0.beendet = true; }
    } else if (ev.typ === "PERIOD_CLOSED") {
      st.perioden_geschlossen[p.periode_id] = true;
    } else if (ev.typ === "PAPER_CARD_RENDERED" || ev.typ === "PAPER_CARD_PRINTED") {
      // Bestand/Gutscheinrest unberührt; optionaler Anzeigecode muss zur papierkarte_id passen (DT1)
      var soll = papierkartenCode(p.papierkarte_id);
      ["code_anzeige", "code_barcode"].forEach(function (k) {
        if (p[k] != null && (!soll || p[k] !== soll[k])) f = k + " passt nicht zur papierkarte_id (Prüfziffer " + PZ_VERFAHREN + ").";
      });
    }
    // ALLOCATION_RUN_COMPLETED: kein Einfluss auf Bestand/Gutscheinrest

    if (f) return { ok: false, fehler: f, zustand: stAlt };
    st.angewendet[ev.ereignis_id] = true;
    return { ok: true, zustand: st };
  }

  function nachspielen(stammdaten, gutscheine, personen, ereignisse, optionen) {
    var st = startzustand(stammdaten, gutscheine, personen, optionen), abgelehnt = [], doppelt = 0, angewendet = 0;
    ereignisse.forEach(function (ev) {
      var r = wendeAn(st, ev);
      if (!r.ok) abgelehnt.push({ ereignis_id: ev.ereignis_id, typ: ev.typ, fehler: r.fehler });
      else if (r.doppelt) doppelt++; else angewendet++;
      st = r.zustand;
    });
    return { zustand: st, angewendet: angewendet, doppelt: doppelt, abgelehnt: abgelehnt };
  }

  function pruefeKonsistenz(st) {
    var fehler = [];
    Object.keys(st.gutscheine).forEach(function (gid) {
      st.gutscheine[gid].positionen.forEach(function (p) {
        if (p.rest === null) return;
        if (p.rest < -EPS) fehler.push(gid + "/" + p.artikel_id + ": Rest negativ");
        if (Math.abs(r3(p.zugeteilt_max - p.eingeloest) - p.rest) > 1e-6) fehler.push(gid + "/" + p.artikel_id + ": Rest ≠ zugeteilt_max − eingelöst");
      });
    });
    Object.keys(st.rezepte).forEach(function (id) {
      var r = st.rezepte[id];
      if (r.rest < -EPS || Math.abs(r3(r.menge - r.abgegeben) - r.rest) > 1e-6) fehler.push(id + ": Rezeptrest inkonsistent");
    });
    Object.keys(st.bestand).forEach(function (id) { if (st.bestand[id].menge < -EPS) fehler.push(id + ": Bestand negativ"); });
    return fehler;
  }

  /* ---------- JSONL ---------- */

  function zuJsonl(ereignisse) { return ereignisse.map(function (e) { return JSON.stringify(e); }).join("\n") + (ereignisse.length ? "\n" : ""); }
  function ausJsonl(text) {
    return String(text).split(/\r?\n/).filter(function (z) { return z.trim(); }).map(function (z, i) {
      try { return JSON.parse(z); } catch (e) { throw new Error("Zeile " + (i + 1) + " ist kein gültiges JSON."); }
    });
  }

  /* ---------- Einfache JSON-Schema-Prüfung (Teilmenge Draft 2020-12) ---------- */

  function typOk(t, v) {
    if (t === "null") return v === null;
    if (t === "array") return Array.isArray(v);
    if (t === "object") return v !== null && typeof v === "object" && !Array.isArray(v);
    if (t === "integer") return typeof v === "number" && Math.floor(v) === v;
    if (t === "number") return typeof v === "number" && isFinite(v);
    return typeof v === t;
  }

  function pruefeSchema(wurzel, wert, knoten, pfad) {
    knoten = (knoten === undefined || knoten === null) ? wurzel : knoten; pfad = pfad || "$";
    if (knoten === true) return [];                       // boolesches Schema: true = alles erlaubt
    if (knoten === false) return [pfad + ": nicht erlaubt"]; // false = Feld verboten
    var f = [];
    if (knoten.$ref) {
      var ziel = wurzel;
      knoten.$ref.replace(/^#\//, "").split("/").forEach(function (t) { ziel = ziel[t]; });
      f = f.concat(pruefeSchema(wurzel, wert, ziel, pfad));
    }
    if (knoten.type) {
      var ts = Array.isArray(knoten.type) ? knoten.type : [knoten.type];
      if (!ts.some(function (t) { return typOk(t, wert); })) { f.push(pfad + ": Typ " + ts.join("|") + " erwartet"); return f; }
    }
    if ("const" in knoten && JSON.stringify(knoten.const) !== JSON.stringify(wert)) f.push(pfad + ": muss " + JSON.stringify(knoten.const) + " sein");
    if (knoten.enum && !knoten.enum.some(function (e) { return JSON.stringify(e) === JSON.stringify(wert); })) f.push(pfad + ": nicht in " + JSON.stringify(knoten.enum));
    if (typeof wert === "string") {
      if (knoten.pattern && !(new RegExp(knoten.pattern).test(wert))) f.push(pfad + ": Muster " + knoten.pattern);
      if (knoten.minLength != null && wert.length < knoten.minLength) f.push(pfad + ": zu kurz");
      if (knoten.maxLength != null && wert.length > knoten.maxLength) f.push(pfad + ": zu lang");
    }
    if (typeof wert === "number") {
      if (knoten.minimum != null && wert < knoten.minimum) f.push(pfad + ": < " + knoten.minimum);
      if (knoten.exclusiveMinimum != null && wert <= knoten.exclusiveMinimum) f.push(pfad + ": ≤ " + knoten.exclusiveMinimum);
    }
    if (typOk("object", wert)) {
      (knoten.required || []).forEach(function (k) { if (!(k in wert)) f.push(pfad + ": Pflichtfeld " + k + " fehlt"); });
      var props = knoten.properties || {};
      Object.keys(wert).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(props, k)) f = f.concat(pruefeSchema(wurzel, wert[k], props[k], pfad + "." + k));
        else if (knoten.additionalProperties === false) f.push(pfad + ": unerwartetes Feld " + k);
      });
    }
    if (Array.isArray(wert)) {
      if (knoten.minItems != null && wert.length < knoten.minItems) f.push(pfad + ": zu wenige Einträge");
      if (knoten.items !== undefined) wert.forEach(function (x, i) { f = f.concat(pruefeSchema(wurzel, x, knoten.items, pfad + "[" + i + "]")); });
    }
    if (knoten.allOf) knoten.allOf.forEach(function (s) { f = f.concat(pruefeSchema(wurzel, wert, s, pfad)); });
    if (knoten.anyOf && !knoten.anyOf.some(function (s) { return pruefeSchema(wurzel, wert, s, pfad).length === 0; })) f.push(pfad + ": passt zu keiner Alternative");
    if (knoten.oneOf && knoten.oneOf.filter(function (s) { return pruefeSchema(wurzel, wert, s, pfad).length === 0; }).length !== 1) f.push(pfad + ": nicht genau eine Alternative");
    if (knoten["if"]) {
      var passt = pruefeSchema(wurzel, wert, knoten["if"], pfad).length === 0;
      if (passt && knoten.then !== undefined) f = f.concat(pruefeSchema(wurzel, wert, knoten.then, pfad));
      if (!passt && knoten["else"] !== undefined) f = f.concat(pruefeSchema(wurzel, wert, knoten["else"], pfad));
    }
    return f;
  }

  return {
    KERN_VERSION: KERN_VERSION, SCHEMA_VERSION: SCHEMA_VERSION, SCHEMA_REVISION: SCHEMA_REVISION, ERLAUBTE_QUELLE: ERLAUBTE_QUELLE, SCHREIBVERBOT: SCHREIBVERBOT,
    anzeigeName: anzeigeName, anzeigeNameEindeutig: anzeigeNameEindeutig, plzAnzeige: plzAnzeige, PLZ_ANZEIGE: PLZ_ANZEIGE, formatiereOrt: formatiereOrt, papierkartenCode: papierkartenCode, pruefeSchreibrecht: pruefeSchreibrecht, quellenfehler: quellenfehler, regelnV12: regelnV12,
    r3: r3, zuteilen: zuteilen, gleicheAusstellung: gleicheAusstellung, personBestaetigt: personBestaetigt, stoerungAktiv: stoerungAktiv, stoerungAktivId: stoerungAktivId, gutscheinAnlass: gutscheinAnlass, pruefeStoerungsgutschein: pruefeStoerungsgutschein, stoerungsgutscheinVerfallen: stoerungsgutscheinVerfallen, gutscheinZurPapierkarte: gutscheinZurPapierkarte, neueEreignisId: neueEreignisId, istEreignisId: istEreignisId, bestandId: bestandId,
    zeitBerlin: zeitBerlin, huelle: huelle, fnv1a: fnv1a, rezeptnachweisToken: rezeptnachweisToken,
    pruefeRezeptnachweis: pruefeRezeptnachweis, istBerechtigt: istBerechtigt,
    startzustand: startzustand, position: position, gutscheinStatus: gutscheinStatus, rezeptRest: rezeptRest,
    planeEinloesung: planeEinloesung, wendeAn: wendeAn, nachspielen: nachspielen, pruefeKonsistenz: pruefeKonsistenz,
    zuJsonl: zuJsonl, ausJsonl: ausJsonl, pruefeSchema: pruefeSchema
  };
});
