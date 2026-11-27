/**
 * FoodAllo Customer App — Bürgeroberfläche (Beta).
 * Lokal, kein Versand, kein Deploy. Die Oberfläche zeigt keine internen IDs.
 * IDENTITY_VERIFIED schreibt nur die Desktopversion (Meldebehörde);
 * diese App schreibt PERSON_REGISTERED und liest den gemeinsamen Log.
 */
(function () {
  "use strict";

  var V = window.FoodAlloVoucher;
  var Store = window.FoodAlloStore;
  var UI = window.FoodAlloUI;
  var Reg = window.FoodAlloMelderegister;
  var DemoKarte = window.FoodAlloDemoKarte;
  var state = {
    artikel: [],
    stellen: [],
    personen: [],
    haushalte: [],
    rezepte: [],
    bestaende: [],
    referenz: null,
    pins: {},
    einloesungVorlage: [],
    sharedVouchers: [],
    ereignisse: [],
    stellenQuelle: null,
    logQuelle: null,
    datenHinweis: [],
    melderegister: null,
    demoKarte: null,
    ready: false
  };

  // Lokale Desktop-Simulation abgeschaltet: IDENTITY_VERIFIED und Störungen nur aus dem gemeinsamen Log.
  var USE_LOCAL_DESKTOP_SIM = false;

  var STELLEN_PFAde = [
    "./kern/stammdaten-ausgabestellen.json",
    "./kern/stammdaten-ausgabestellen.json"
  ];
  var LOG_PFAde = [
    "./data/ereignislog.jsonl",
    "./data/ereignislog.jsonl"
  ];
  var REGISTER_PFAde = [
    "./desktop/assets/melderegister.js",
    "./desktop/assets/melderegister.js"
  ];

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }
  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDe(n, einheit) {
    if (n === null || n === undefined) return "offen";
    var s = Number(n).toLocaleString("de-DE", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    return einheit ? s + " " + einheit : s;
  }

  function formatDateDe(isoDate) {
    var m = String(isoDate).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return isoDate;
    return m[3] + "." + m[2] + "." + m[1];
  }

  function artikelById(id) {
    return state.artikel.find(function (a) { return a.artikel_id === id; }) || { artikel_id: id, bezeichnung_de: id, einheit: "" };
  }

  async function loadJson(path) {
    var res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error("Konnte " + path + " nicht laden (" + res.status + ")");
    return res.json();
  }

  async function loadText(path) {
    var res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error("Konnte " + path + " nicht laden (" + res.status + ")");
    return res.text();
  }

  function parseJsonl(text) {
    return String(text || "").split(/\r?\n/).filter(function (line) {
      return line && line.trim();
    }).map(function (line) { return JSON.parse(line); });
  }

  async function loadFirst(paths, kind) {
    var last = null;
    for (var i = 0; i < paths.length; i++) {
      try {
        if (kind === "jsonl") {
          return { path: paths[i], data: parseJsonl(await loadText(paths[i])) };
        }
        return { path: paths[i], data: await loadJson(paths[i]) };
      } catch (e) {
        last = e;
      }
    }
    if (kind === "jsonl" && typeof window !== "undefined" && window.EREIGNISLOG) {
      var raw = window.EREIGNISLOG;
      return { path: "window.EREIGNISLOG", data: Array.isArray(raw) ? raw : parseJsonl(String(raw)) };
    }
    throw last || new Error("Keine der Quellen erreichbar: " + paths.join(", "));
  }

  function ausgabestellenListe(pack) {
    if (Array.isArray(pack)) return pack;
    if (pack && Array.isArray(pack.ausgabestellen)) return pack.ausgabestellen;
    return [];
  }

  function mergeEreignisse() {
    var seen = {};
    var out = [];
    var lists = [];
    for (var i = 0; i < arguments.length; i++) lists.push(arguments[i] || []);
    lists.forEach(function (list) {
      list.forEach(function (e) {
        if (!e || !e.ereignis_id || seen[e.ereignis_id]) return;
        seen[e.ereignis_id] = true;
        out.push(e);
      });
    });
    // Reihenfolge der Eingabelisten beibehalten (Logreihenfolge), kein Umsortieren nach Zeit.
    return out;
  }

  function personIdAusEreignis(e) {
    if (!e || !e.payload) return null;
    if (e.payload.person_id) return e.payload.person_id;
    if (e.payload.person && e.payload.person.person_id) return e.payload.person.person_id;
    return null;
  }

  /** Semantischer Schlüssel, damit Ereignisse im gemeinsamen Log die lokale Simulation verdrängen. */
  function ereignisSchluessel(e) {
    if (!e || !e.typ) return null;
    var pid = personIdAusEreignis(e);
    if ((e.typ === "IDENTITY_VERIFIED" || e.typ === "PERSON_VERIFIED" || e.typ === "PERSON_REGISTERED") && pid) {
      // PERSON_VERIFIED und IDENTITY_VERIFIED betreffen dieselbe Feststellung.
      // PERSON_REGISTERED: auch quelle_system=desktop (V15, payload.kanal=papier) lesen.
      var typKey = (e.typ === "PERSON_VERIFIED") ? "IDENTITY_VERIFIED" : e.typ;
      return typKey + ":" + pid;
    }
    if (e.typ === "VOUCHER_ISSUED" && e.payload && e.payload.gutschein && e.payload.gutschein.gutschein_id) {
      return "VOUCHER_ISSUED:" + e.payload.gutschein.gutschein_id;
    }
    if (e.payload && e.payload.stoerung_id && String(e.typ).indexOf("SUPPLY_DISRUPTION") === 0) {
      return e.typ + ":" + e.payload.stoerung_id;
    }
    return e.ereignis_id || null;
  }

  function simOhneLogDuplikate(geteilt, sim) {
    var covered = {};
    (geteilt || []).forEach(function (e) {
      var k = ereignisSchluessel(e);
      if (k) covered[k] = true;
    });
    return (sim || []).filter(function (e) {
      var k = ereignisSchluessel(e);
      return !k || !covered[k];
    });
  }

  function desktopSimEvents() {
    if (!USE_LOCAL_DESKTOP_SIM) return [];
    return simOhneLogDuplikate(state._geteilt || [], state.demoDesktopSim || []);
  }

  async function loadSeeds() {
    state.datenHinweis = [];
    var pack = await Promise.all([
      loadJson("data/artikel.json"),
      loadJson("data/personen.json"),
      loadJson("data/haushalte.json"),
      loadJson("data/rezepte.json"),
      loadJson("data/bestand-szenario.json"),
      loadJson("data/referenz.json"),
      loadJson("data/demo-auth.json"),
      loadJson("data/einloesung-vorlage.json"),
      loadJson("data/gutscheine-shared.json")
    ]);
    state.artikel = pack[0];
    state.personen = pack[1].concat(Store.getLocalPersons());
    state.haushalte = pack[2];
    state.rezepte = pack[3];
    state.bestaende = pack[4].bestaende || [];
    state.referenz = pack[5];
    state.pins = pack[6].pins || {};
    var vorlage = pack[7];
    state.einloesungVorlage = Array.isArray(vorlage) ? vorlage : (vorlage.buchungen || []);
    state.sharedVouchers = pack[8] || [];
    state.demoDesktopSim = [];
    try {
      // Gemeinsamer Datensatz mit der Retail App; Rückfall auf die Kopie im Customer-Paket.
      state.demoKarte = (await loadFirst(["../data/demo-becker.json", "data/demo-karte.json"], "json")).data;
    } catch (e) {
      state.demoKarte = null;
    }

    try {
      var stellen = await loadFirst(STELLEN_PFAde, "json");
      state.stellen = ausgabestellenListe(stellen.data);
      state.stellenQuelle = stellen.path;
    } catch (e) {
      var fallback = await loadJson("data/ausgabestellen.json");
      state.stellen = ausgabestellenListe(fallback);
      state.stellenQuelle = "data/ausgabestellen.json (Fallback)";
      state.datenHinweis.push(UI.datenHinweisStellen());
    }

    var geteilt = [];
    try {
      var log = await loadFirst(LOG_PFAde, "jsonl");
      geteilt = log.data;
      state.logQuelle = log.path;
    } catch (e) {
      state.logQuelle = null;
      state.datenHinweis.push(UI.datenHinweisLog());
    }

    var lokal = await Store.allEreignisse();
    state._geteilt = geteilt;
    state.ereignisse = mergeEreignisse(state._geteilt, desktopSimEvents(), lokal);
    applyIdentitaetAusLog();

    state.melderegister = null;
    
    if (typeof window !== "undefined" && window.MELDEREGISTER) {
      state.melderegister = window.MELDEREGISTER;
    } else {
      try {
        var reg = await loadFirst(REGISTER_PFAde, "json");
        state.melderegister = reg.data;
      } catch (e) {
        state.melderegister = { personen: [] };
      }
    }
    uebernehmeRegisterHaushalte(state.melderegister);
    state.ready = true;
  }

  function uebernehmeRegisterHaushalte(pack) {
    if (!Reg || typeof Reg.haushalteAus !== "function") return;
    (Reg.haushalteAus(pack) || []).forEach(function (h) {
      if (!h || !h.haushalt_id) return;
      if (state.haushalte.some(function (x) { return x.haushalt_id === h.haushalt_id; })) return;
      var ids = h.person_ids || h.mitglieder || [];
      state.haushalte.push({
        haushalt_id: h.haushalt_id,
        ags_wohnsitz: V.agsAusHaushalt(h) || konfigurierteAgs(),
        ags: V.agsAusHaushalt(h) || konfigurierteAgs(),
        groesse: h.groesse || ids.length || 0,
        person_ids: ids.slice(),
        mitglieder: (h.mitglieder || ids).slice(),
        flags: Array.isArray(h.flags) ? h.flags.slice() : [],
        kanal: h.kanal
      });
    });
  }

  function haushaltMitgliederHtml(person) {
    if (!person || !person.haushalt_id || !Reg) return "";
    var namen = Reg.anzeigenamenDerMitglieder(state.melderegister, person.haushalt_id);
    return UI.renderHaushaltMitglieder(namen);
  }

  function verifikationAusLog(person) {
    if (!person) return person;
    person.verifikation = person.verifikation || { status: "offen" };
    if (person.person_id) {
      var last = V.letztesIdentitaetsEreignis(state.ereignisse || [], person.person_id);
      if (last && last.payload && last.payload.verifikation) {
        person.verifikation = last.payload.verifikation;
        return person;
      }
    }
    person.verifikation.status = "offen";
    return person;
  }

  function mergeLocalPerson(person, pin) {
    var exists = state.personen.some(function (p) { return p.person_id === person.person_id; });
    if (!exists) state.personen.push(person);
    else {
      state.personen = state.personen.map(function (p) {
        return p.person_id === person.person_id ? person : p;
      });
    }
    if (pin) state.pins[person.person_id] = pin;
    Store.saveLocalPerson(person);
    if (pin) {
      try {
        var raw = localStorage.getItem("foodallo.customer.local_pins");
        var map = raw ? JSON.parse(raw) : {};
        map[person.person_id] = pin;
        localStorage.setItem("foodallo.customer.local_pins", JSON.stringify(map));
      } catch (e) { /* ignore */ }
    }
  }

  function loadLocalPins() {
    try {
      var raw = localStorage.getItem("foodallo.customer.local_pins");
      if (raw) Object.assign(state.pins, JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }

  function stoerungAktiv(zeit, person, gutschein) {
    return V.stoerungAktiv(state.ereignisse || [], {
      ags: agsFuerPerson(person, gutschein),
      art: "trinkwasser",
      zeit: zeit || new Date()
    });
  }

  function applyIdentitaetAusLog() {
    (state.personen || []).forEach(function (person) {
      var last = V.letztesIdentitaetsEreignis(state.ereignisse || [], person.person_id);
      if (last && last.payload && last.payload.verifikation) {
        person.verifikation = last.payload.verifikation;
      }
    });
  }

  function nextPersonNumber() {
    var max = 0;
    state.personen.forEach(function (p) {
      var n = Number(V.laufendeNummerFromPersonId(p.person_id));
      if (n > max) max = n;
    });
    return max + 1;
  }

  function findPerson(id) {
    return state.personen.find(function (p) { return p.person_id === id; }) || null;
  }

  function findHaushalt(id) {
    return state.haushalte.find(function (h) { return h.haushalt_id === id; }) || null;
  }

  function konfigurierteAgs() {
    var r = state.referenz || {};
    if (V.isValidAgs(r.ags_wohnsitz)) return String(r.ags_wohnsitz);
    if (V.isValidAgs(r.ags)) return String(r.ags);
    return V.AGS_FROHBURG;
  }

  function agsFuerPerson(person, gutschein) {
    var hh = person && person.haushalt_id ? findHaushalt(person.haushalt_id) : null;
    return V.agsAusGutschein(gutschein, hh) || V.agsAusPerson(person) || V.agsAusHaushalt(hh) || konfigurierteAgs();
  }

  function stellenDerGemeinde(ags) {
    return (state.stellen || []).filter(function (st) {
      var sa = V.agsAusStelle(st);
      return !ags || !sa || sa === ags;
    });
  }

  function v12Aktiv() {
    return V.v12Aktiv({ optionen: (state.referenz && state.referenz.optionen) || {} });
  }

  function gutscheinAnlass(g) {
    if (typeof window !== "undefined" && window.FAKern && window.FAKern.gutscheinAnlass) {
      return window.FAKern.gutscheinAnlass(g);
    }
    return V.gutscheinAnlass(g);
  }

  function desktopVouchersFor(person, periode) {
    var found = [];
    var seen = {};
    function add(g) {
      if (!g || !person || !periode) return;
      if (g.periode_id !== periode.periode_id || g.haushalt_id !== person.haushalt_id) return;
      var id = g.gutschein_id || ("anon-" + found.length);
      if (seen[id]) return;
      seen[id] = true;
      found.push(g);
    }
    (state.ereignisse || []).forEach(function (e) {
      if (e.typ !== "VOUCHER_ISSUED" || !e.payload || !e.payload.gutschein) return;
      add(e.payload.gutschein);
    });
    if (!found.length) {
      (state.sharedVouchers || []).forEach(add);
    }
    if (!v12Aktiv()) {
      var regulaer = found.filter(function (g) { return gutscheinAnlass(g) !== "stoerung"; });
      var liste = regulaer.length ? regulaer : found;
      return liste.length ? [liste[liste.length - 1]] : [];
    }
    found.sort(function (a, b) {
      var aa = gutscheinAnlass(a) === "stoerung" ? 1 : 0;
      var bb = gutscheinAnlass(b) === "stoerung" ? 1 : 0;
      return aa - bb;
    });
    return found;
  }

  function desktopVoucherFor(person, periode) {
    var list = desktopVouchersFor(person, periode);
    return list.length ? list[list.length - 1] : null;
  }

  function rezeptFuer(personId) {
    return state.rezepte.find(function (r) { return r.person_id === personId; }) || null;
  }

  function kernIds(ags) {
    var fromRolle = stellenDerGemeinde(ags).filter(function (s) {
      return s.rolle === "kern" || s.rolle === "kern_insulin";
    }).map(function (s) { return s.ausgabestelle_id; });
    if (fromRolle.length) return fromRolle;
    var demo = (state.referenz && state.referenz.kern_ausgabestellen_demo) || [];
    if (!ags) return demo;
    return demo.filter(function (id) {
      var st = state.stellen.find(function (x) { return x.ausgabestelle_id === id; });
      var sa = st ? V.agsAusStelle(st) : V.agsAusStelle(id);
      return !sa || sa === ags;
    });
  }

  function apothekenIds() {
    return state.stellen.filter(function (s) { return s.typ === "pharmacy"; }).map(function (s) { return s.ausgabestelle_id; });
  }

  function periodNow() {
    return V.periodFromDate(new Date());
  }

  async function refreshLocalEvents() {
    var lokal = await Store.allEreignisse();
    // Eigene App-Registrierungen werden durch den aktuellen lokalen Store ersetzt.
    // PERSON_REGISTERED der Desktopversion (V15, payload.kanal=papier) bleiben erhalten.
    var geteilt = (state.ereignisse || []).filter(function (e) {
      if (e._demo_lokale_desktop_simulation) return false;
      if (e.typ === "PERSON_REGISTERED" && e.quelle_system === "customer_app") return false;
      return true;
    });
    // geteilt already includes shared log + file sim; re-merge with current local store
    // Safer: keep shared+sim snapshots separately.
    state.ereignisse = mergeEreignisse(state._geteilt || [], desktopSimEvents(), lokal);
    applyIdentitaetAusLog();
  }

  async function einloesungenFuer(gutscheinId, haushaltId) {
    await refreshLocalEvents();
    var evs = state.ereignisse || [];
    return evs.filter(function (e) {
      if (e.typ !== "REDEMPTION_POSTED" || !e.payload) return false;
      var b = e.payload.ausgabebuchung || e.payload;
      if (b.status === "storniert") return false;
      if (gutscheinId && b.gutschein_id === gutscheinId) return true;
      if (haushaltId && b.haushalt_id === haushaltId) return true;
      return false;
    }).map(function (e) {
      return e.payload.ausgabebuchung || e.payload;
    });
  }

  function buildFor(person, periode, einloesungen, issued) {
    if (!issued) return null;
    return V.anreichernGutschein(issued, {
      haushalt: findHaushalt(person.haushalt_id),
      periode: periode,
      bestaende: state.bestaende,
      trinkwasserStoerung: stoerungAktiv(undefined, person, issued),
      ereignisse: state.ereignisse || [],
      ags: agsFuerPerson(person, issued),
      einloesungen: einloesungen || [],
      kernAusgabestellen: kernIds(agsFuerPerson(person, issued)).filter(function (id) {
        var s = state.stellen.find(function (x) { return x.ausgabestelle_id === id; });
        return s && s.abgabekanal === "einzelhandel";
      }),
      now: new Date(),
      v12: v12Aktiv(),
      optionen: { v12: v12Aktiv() }
    });
  }

  var lastView = "login";

  function showView(name) {
    if (name !== "help") lastView = name;
    $all("[data-view]").forEach(function (el) {
      el.hidden = el.getAttribute("data-view") !== name;
    });
    var logout = $("#btn-logout");
    var who = $("#who");
    if (logout) logout.hidden = name !== "app";
    if (who) who.hidden = name !== "app";
  }

  function setOnlineBanner() {
    var el = $("#online-banner");
    if (!el) return;
    if (navigator.onLine) {
      el.hidden = true;
    } else {
      el.hidden = false;
      el.textContent = UI.offlineText();
    }
  }

  function stelleEintrag(s) {
    if (!s) return null;
    return {
      name: stellenName(s),
      typLabel: UI.shopTypLabel(s.typ),
      adresse: UI.adresseText(s)
    };
  }

  function stellenName(s) {
    var alle = state.stellen || [];
    if (typeof window !== "undefined" && window.FAKern && typeof window.FAKern.anzeigeNameEindeutig === "function") {
      return window.FAKern.anzeigeNameEindeutig(s, alle) || "";
    }
    return V.anzeigeNameEindeutig(s, alle);
  }

  function renderInsulin(person, rezept) {
    var rxOk = V.darfInsulinEinloesen(person, rezept, new Date());
    return {
      html: UI.renderInsulin({
        hatGueltigesRezept: rxOk,
        menge: rezept && rezept.menge,
        gueltigVon: rezept && rezept.gueltig_von,
        gueltigBis: rezept && rezept.gueltig_bis
      }),
      rxOk: rxOk
    };
  }

  async function renderVoucher(person) {
    if (!person || !person.person_id) {
      var html = "";
      if (state.datenHinweis && state.datenHinweis.length) {
        html += '<section class="card warn"><h2>Hinweis</h2><p>' +
          state.datenHinweis.map(function (h) { return UI.escapeHtml(h); }).join("</p><p>") +
          "</p></section>";
      }
      html += UI.renderWarten({
        begruessung: UI.begruessung(person),
        weg: person && person._anmeldeweg,
        haushaltHtml: haushaltMitgliederHtml(person)
      });
      html += '<p class="hint">' + UI.escapeHtml(UI.wartendOhneAmtlicheId()) + "</p>";
      $("#voucher-root").innerHTML = html;
      return;
    }
    var periode = periodNow();
    var issuedList = desktopVouchersFor(person, periode);
    var einlAlle = await einloesungenFuer(null, person.haushalt_id);
    var gutscheine = issuedList.map(function (issued) {
      var einl = einlAlle.filter(function (b) {
        return !b.gutschein_id || b.gutschein_id === issued.gutschein_id;
      });
      return buildFor(person, periode, einl, issued);
    }).filter(Boolean);
    var rezept = rezeptFuer(person.person_id);
    var unverifiziert = !person.verifikation || person.verifikation.status !== "bestaetigt";
    var hh = findHaushalt(person.haushalt_id);
    var html = "";

    if (state.datenHinweis && state.datenHinweis.length) {
      html += '<section class="card warn"><h2>Hinweis</h2><p>' +
        state.datenHinweis.map(function (h) { return UI.escapeHtml(h); }).join("</p><p>") +
        "</p></section>";
    }

    var haushaltHtml = haushaltMitgliederHtml(person);

    if (unverifiziert) {
      if (person.verifikation && person.verifikation.status === "abgelehnt") {
        html += UI.renderAbgelehnt();
      } else {
        html += UI.renderWarten({
          begruessung: UI.begruessung(person),
          weg: person && person._anmeldeweg,
          haushaltHtml: haushaltHtml
        });
      }
      $("#voucher-root").innerHTML = html;
      return;
    }

    if (haushaltHtml) html += haushaltHtml;

    if (!gutscheine.length) {
      html += UI.renderKeinGutschein();
      html += renderInsulin(person, rezept).html;
      html += renderStellen(false, person);
      $("#voucher-root").innerHTML = html;
      return;
    }

    var jetzt = new Date();
    var stoerung = V.aktiveVersorgungsstoerung(state.ereignisse || [], {
      ags: agsFuerPerson(person),
      art: "trinkwasser",
      zeit: jetzt
    });
    var ctxBasis = {
      periode: periode,
      v12: v12Aktiv(),
      stoerungAktiv: !!stoerung,
      personenZahl: hh ? V.personenzahl(hh) : 0,
      artikelById: artikelById
    };

    gutscheine.forEach(function (gutschein) {
      if (gutschein.kanal === "papier") {
        html += UI.renderPapierhinweis(gutschein);
      }
      var stoOpts = { ereignisse: state.ereignisse || [], now: jetzt, zeit: jetzt };
      html += UI.renderEinGutschein(gutschein, Object.assign({}, ctxBasis, {
        verfallen: V.stoerungsgutscheinVerfallen(gutschein, stoOpts),
        gueltigBis: V.stoerungsgutscheinGueltigBis(gutschein, stoOpts)
      }));
    });

    var ins = renderInsulin(person, rezept);
    html += ins.html;
    html += renderStellen(ins.rxOk, person);
    $("#voucher-root").innerHTML = html;
  }

  function renderStellen(showPharmaciesHighlight, person) {
    var ags = agsFuerPerson(person);
    var einzel = kernIds(ags).map(function (id) {
      return stellenDerGemeinde(ags).find(function (x) { return x.ausgabestelle_id === id; });
    }).filter(function (s) { return s && s.typ !== "pharmacy"; }).map(stelleEintrag);

    var apotheken = stellenDerGemeinde(ags).filter(function (s) { return s.typ === "pharmacy"; }).map(stelleEintrag);

    return UI.renderStellen({
      einzelhandel: einzel,
      apotheken: apotheken,
      rezeptHervorheben: !!showPharmaciesHighlight
    });
  }

  /* IDENTITY_VERIFIED wird nicht lokal erzeugt. Quelle: nur der gemeinsame Log (bzw. ereignislog.js unter file://). */

  function login(personId, pin) {
    var err = $("#login-error");
    err.hidden = true;
    var person = findPerson(String(personId || "").trim());
    if (!person) {
      err.textContent = UI.loginFehlerUnbekannt();
      err.hidden = false;
      return;
    }
    if (person.ags_wohnsitz && person.ags_wohnsitz !== konfigurierteAgs()) {
      err.textContent = UI.loginFehlerWohnort();
      err.hidden = false;
      return;
    }
    var expected = state.pins[person.person_id];
    if (!expected || pin !== expected) {
      err.textContent = UI.loginFehlerGeheimzahl();
      err.hidden = false;
      return;
    }
    Store.setSession({ person_id: person.person_id, zeit: Store.nowIso() });
    enterApp(person);
  }

  async function enterApp(person) {
    showView("app");
    var who = $("#who");
    who.hidden = false;
    who.textContent = UI.begruessung(person);
    await renderVoucher(person);
  }

  /* Lebensmittelkarte zum Vorzeigen: Demonstrationsfamilie Becker (nur Customer App, kein Log-Eintrag).
     Gültigkeit immer die laufende Woche; die Wochenlogik aller anderen Familien bleibt unverändert. */
  function zeigeDemoKarte() {
    if (!state.demoKarte || !DemoKarte) {
      setFormError("#login-error", UI.datenFehler());
      showView("login");
      return;
    }
    Store.setSession({ demo_karte: "becker", zeit: Store.nowIso() });
    showView("app");
    var who = $("#who");
    who.hidden = false;
    who.textContent = "Guten Tag, Familie " + state.demoKarte.familie;
    var html = DemoKarte.render({
      demo: state.demoKarte,
      artikel: state.artikel,
      periode: periodNow(),
      UI: UI
    });
    html += renderStellen(false, { ags_wohnsitz: konfigurierteAgs() });
    $("#voucher-root").innerHTML = html;
    window.scrollTo(0, 0);
  }

  function logout() {
    Store.setSession(null);
    if (location.hash === "#lebensmittelkarte" && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search);
    }
    $("#pin").value = "";
    var who = $("#who");
    if (who) {
      who.textContent = "";
      who.hidden = true;
    }
    showView("login");
  }

  async function registerPerson() {
    var err = $("#reg-error");
    var out = $("#reg-result");
    err.hidden = true;
    out.hidden = true;
    var n = nextPersonNumber();
    var num = String(n).padStart(6, "0");
    var ags = konfigurierteAgs();
    var personId = "FA-P-" + ags + "-" + num;
    var haushaltId = "FA-HH-" + ags + "-" + num;
    var kanal = $("#reg-kanal").value;
    var flags = [];
    if (kanal === "papier") flags.push("no_digital");
    if ($("#reg-alter").value === "elderly") flags.push("vulnerable");
    var jetzt = Store.nowIso();
    var person = {
      person_id: personId,
      haushalt_id: haushaltId,
      ags_wohnsitz: ags,
      altersgruppe: $("#reg-alter").value,
      flags: flags,
      kanal: kanal,
      verifikation: {
        status: "offen",
        stelle: V.STELLE_MELDEBEHOERDE,
        verfahren: "synthetisch",
        zeit: jetzt
      },
      anzeigename_demo: "Person " + num
    };
    var haushalt = {
      haushalt_id: haushaltId,
      ags: ags,
      ags_wohnsitz: ags,
      groesse: 1,
      person_ids: [personId],
      mitglieder: [personId],
      flags: flags.slice()
    };
    state.haushalte.push(haushalt);
    mergeLocalPerson(person, num);
    await Store.writeCustomerEreignis({
      person: person,
      haushalt: haushalt
    }, { optionen: (state.referenz && state.referenz.optionen) || {} });
    await refreshLocalEvents();
    Store.setSession({ person_id: person.person_id, zeit: Store.nowIso() });
    await enterApp(person);
  }

  function setFormError(id, text) {
    var err = $(id);
    if (!err) return;
    if (!text) { err.hidden = true; err.textContent = ""; return; }
    err.hidden = false;
    err.textContent = text;
  }

  function eintragPruefen(nachname, ausweis, opt) {
    opt = opt || {};
    var eintrag = Reg.findeEintrag(state.melderegister, nachname, ausweis);
    if (!eintrag) return { fehler: UI.registerUnbekannt() };
    if (Reg.istAnalog(eintrag)) return { fehler: UI.analogKeinAppKonto(), eintrag: eintrag };
    if (!Reg.istDigital(eintrag)) return { fehler: UI.registerUnbekannt(), eintrag: eintrag };
    if (opt.brauchtOnlineAusweis && !Reg.hatOnlineAusweis(eintrag)) {
      return { fehler: UI.keinOnlineAusweisHinweis(), eintrag: eintrag };
    }
    return { eintrag: eintrag };
  }

  
  function betreteAusRegister(eintrag, weg) {
    var person = Reg.personAusEintrag(eintrag);
    person._anmeldeweg = weg;
    verifikationAusLog(person);
    Store.setSession({
      register_nachname: eintrag.nachname,
      register_ausweis: String(eintrag.personalausweisnummer),
      weg: weg,
      zeit: Store.nowIso()
    });
    return enterApp(person);
  }

  var BESUCHER_ZUGANG = {
    meier: { nachname: "Meier", ausweis: "987654", weg: "eid" },
    mueller: { nachname: "Müller", ausweis: "123456", weg: "meldebehoerde" }
  };

  function starteBesucherZugang(key) {
    var zugang = BESUCHER_ZUGANG[key];
    if (!zugang) return;
    var r = eintragPruefen(
      zugang.nachname,
      zugang.ausweis,
      zugang.weg === "eid" ? { brauchtOnlineAusweis: true } : {}
    );
    if (r.fehler) {
      setFormError("#login-error", r.fehler);
      return;
    }
    setFormError("#login-error", "");
    return betreteAusRegister(r.eintrag, zugang.weg);
  }

  function bind() {
    var btnMeier = $("#btn-besucher-meier");
    if (btnMeier) btnMeier.addEventListener("click", function () { starteBesucherZugang("meier"); });
    var btnMueller = $("#btn-besucher-mueller");
    if (btnMueller) btnMueller.addEventListener("click", function () { starteBesucherZugang("mueller"); });
    var btnBecker = $("#btn-besucher-becker");
    if (btnBecker) btnBecker.addEventListener("click", function () { zeigeDemoKarte(); });
    $("#login-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      login($("#person-id").value, $("#pin").value);
    });
    $("#btn-logout").addEventListener("click", logout);
    $("#btn-register").addEventListener("click", function () {
      showView("register");
    });
    $("#btn-eid").addEventListener("click", function () {
      var n = $("#eid-standin");
      if (n) n.textContent = UI.eidStandinHinweis();
      setFormError("#eid-error", "");
      showView("eid");
    });
    $("#btn-melde").addEventListener("click", function () {
      setFormError("#melde-error", "");
      showView("melde");
    });
    $("#btn-back-login").addEventListener("click", function () {
      showView("login");
    });
    $("#btn-back-eid").addEventListener("click", function () {
      showView("login");
    });
    $("#btn-back-melde").addEventListener("click", function () {
      showView("login");
    });
    $("#eid-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var r = eintragPruefen($("#eid-nachname").value, $("#eid-ausweis").value, { brauchtOnlineAusweis: true });
      if (r.fehler) { setFormError("#eid-error", r.fehler); return; }
      setFormError("#eid-error", "");
      betreteAusRegister(r.eintrag, "eid");
    });
    $("#melde-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      var r = eintragPruefen($("#melde-nachname").value, $("#melde-ausweis").value, {});
      if (r.fehler) { setFormError("#melde-error", r.fehler); return; }
      setFormError("#melde-error", "");
      betreteAusRegister(r.eintrag, "meldebehoerde");
    });
    $("#btn-help").addEventListener("click", function () {
      $("#help-root").innerHTML = UI.renderHilfe();
      showView("help");
    });
    $("#btn-back-help").addEventListener("click", function () {
      showView(lastView || "login");
    });
    $("#register-form").addEventListener("submit", function (ev) {
      ev.preventDefault();
      registerPerson().catch(function () {
        var err = $("#reg-error");
        err.hidden = false;
        err.textContent = "Die Anmeldung konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.";
      });
    });
    window.addEventListener("online", setOnlineBanner);
    window.addEventListener("offline", setOnlineBanner);
    setOnlineBanner();
  }

  function registerSw() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js").catch(function () { /* offline first, ignorieren */ });
  }

  async function init() {
    try {
      await loadSeeds();
      loadLocalPins();
      bind();
      var session = Store.getSession();
      if (location.hash === "#lebensmittelkarte" || (session && session.demo_karte === "becker")) {
        zeigeDemoKarte();
        registerSw();
        return;
      }
      if (session && session.person_id) {
        var person = findPerson(session.person_id);
        if (person) {
          await enterApp(person);
          registerSw();
          return;
        }
      }
      if (session && session.register_nachname && session.register_ausweis) {
        var eintrag = Reg.findeEintrag(state.melderegister, session.register_nachname, session.register_ausweis);
        if (eintrag && Reg.istDigital(eintrag)) {
          await betreteAusRegister(eintrag, session.weg || "meldebehoerde");
          registerSw();
          return;
        }
      }
      showView("login");
      registerSw();
    } catch (e) {
      showView("login");
      var err = $("#login-error");
      err.hidden = false;
      err.textContent = UI.datenFehler();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
