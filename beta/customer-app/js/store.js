/**
 * Persistenz: Sitzung in localStorage, Ereignislog in IndexedDB (Fallback: localStorage).
 * Gemeinsames Ereignisformat aus Grundlagen_Systeme_v1.md §4.
 */
(function (root) {
  "use strict";

  var LS_SESSION = "foodallo.customer.session";
  var LS_LOCAL_PERSONS = "foodallo.customer.local_persons";
  var LS_EVENTS_FALLBACK = "foodallo.customer.ereignislog";
  var LS_SEEDED = "foodallo.customer.seeded_period";
  // Demo-Kopie der von dieser App geschriebenen PERSON_REGISTERED; nie der gemeinsame Log.
  var LS_CUSTOMER_DEMO_LOG = "foodallo.customer.ereignislog-customer-demo";
  var DB_NAME = "foodallo-customer-app";
  var DB_VERSION = 1;
  var STORE_EVENTS = "ereignislog";

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) {
        resolve(null);
        return;
      }
      var req = root.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          var os = db.createObjectStore(STORE_EVENTS, { keyPath: "ereignis_id" });
          os.createIndex("typ", "typ", { unique: false });
          os.createIndex("zeit_ereignis", "zeit_ereignis", { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }

  function lsRead(key, fallback) {
    try {
      var raw = root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function lsWrite(key, value) {
    root.localStorage.setItem(key, JSON.stringify(value));
  }

  function nowIso() {
    var V = root.FoodAlloVoucher;
    var d = new Date();
    // ISO mit Offset Europe/Berlin
    try {
      var fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: V ? V.TIMEZONE : "Europe/Berlin",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hourCycle: "h23"
      });
      var p = {};
      fmt.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      // Offset anhand der Berlin-Wandzeit vs. UTC bestimmen
      var berlinAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
      var offsetMin = Math.round((berlinAsUtc - d.getTime()) / 60000);
      var sign = offsetMin >= 0 ? "+" : "-";
      var abs = Math.abs(offsetMin);
      var oh = String(Math.floor(abs / 60)).padStart(2, "0");
      var om = String(abs % 60).padStart(2, "0");
      return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute + ":" + p.second + sign + oh + ":" + om;
    } catch (e) {
      return d.toISOString();
    }
  }

  function newEreignisId() {
    var uuid = (root.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
          var r = (Math.random() * 16) | 0;
          var v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
    return "FA-E-" + String(uuid).toLowerCase();
  }

  var dbPromise = null;
  function db() {
    if (!dbPromise) dbPromise = openDb();
    return dbPromise;
  }

  function appendCustomerDemoCopy(ev) {
    if (!ev || ev.typ !== "PERSON_REGISTERED") return;
    var list = lsRead(LS_CUSTOMER_DEMO_LOG, []);
    if (list.some(function (e) { return e.ereignis_id === ev.ereignis_id; })) return;
    list.push(ev);
    lsWrite(LS_CUSTOMER_DEMO_LOG, list);
  }

  function getCustomerDemoLog() {
    return lsRead(LS_CUSTOMER_DEMO_LOG, []);
  }

  function v12AktivOpts(opts) {
    opts = opts || {};
    return opts.v12 === true || !!(opts.optionen && opts.optionen.v12 === true);
  }

  function schreibOptionen(opts) {
    // Kern 1.8.1 behandelt fehlendes v12 als v1.2-Standard. Deshalb immer explizit setzen.
    return { v12: v12AktivOpts(opts) };
  }

  function assertSchreibrecht(ev, optionen) {
    var K = root.FAKern;
    if (!K || typeof K.pruefeSchreibrecht !== "function") {
      throw new Error("FAKern.pruefeSchreibrecht ist nicht geladen. Bitte die App mit Serverwurzel system/ starten (kern/foodallo_kern.js).");
    }
    var err = K.pruefeSchreibrecht(ev, optionen || {});
    if (err) throw new Error("Schreibrecht verweigert: " + err);
  }

  async function putEreignis(ev, optionen) {
    assertSchreibrecht(ev, optionen);
    appendCustomerDemoCopy(ev);
    var database = await db();
    if (!database) {
      var list = lsRead(LS_EVENTS_FALLBACK, []);
      if (list.some(function (e) { return e.ereignis_id === ev.ereignis_id; })) return ev;
      list.push(ev);
      lsWrite(LS_EVENTS_FALLBACK, list);
      return ev;
    }
    return new Promise(function (resolve, reject) {
      var tx = database.transaction(STORE_EVENTS, "readwrite");
      var store = tx.objectStore(STORE_EVENTS);
      var get = store.get(ev.ereignis_id);
      get.onsuccess = function () {
        if (get.result) {
          resolve(get.result);
          return;
        }
        store.put(ev);
      };
      tx.oncomplete = function () { resolve(ev); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function allEreignisse() {
    var database = await db();
    if (!database) return lsRead(LS_EVENTS_FALLBACK, []);
    return new Promise(function (resolve, reject) {
      var tx = database.transaction(STORE_EVENTS, "readonly");
      var req = tx.objectStore(STORE_EVENTS).getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function makeEreignis(typ, quelle_system, payload) {
    var t = nowIso();
    return {
      ereignis_id: newEreignisId(),
      typ: typ,
      zeit_ereignis: t,
      zeit_empfang: t,
      quelle_system: quelle_system,
      payload: payload || {},
      schema_version: 1
    };
  }

  /**
   * Einzig erlaubtes Schreiben der Customer App ins eigene Log: PERSON_REGISTERED.
   * Der gemeinsame system/data/ereignislog.jsonl wird nie beschrieben.
   */
  /**
   * V15 (v1.2, Kern 1.8.1): PERSON_REGISTERED.payload.kanal (app|papier), nicht person.kanal.
   * Die Customer App setzt nur kanal=app und nie kanal=papier (auch nicht bei person.kanal=papier).
   * Nur hinter optionen.v12; ohne Schalter entfällt das Feld (Altbestand = app).
   * v1.1 deklariert payload.kanal nicht; additionalProperties ist nicht false, der Validator
   * würde ein Extra-Feld akzeptieren. Geschrieben wird es trotzdem nur im v12-Modus.
   */
  function mitV15Kanal(payload, opts) {
    payload = Object.assign({}, payload || {});
    if (payload.kanal === "papier") delete payload.kanal;
    if (v12AktivOpts(opts)) {
      payload.kanal = "app";
    } else if (Object.prototype.hasOwnProperty.call(payload, "kanal")) {
      delete payload.kanal;
    }
    return payload;
  }

  async function writeCustomerEreignis(payload, opts) {
    var optionen = schreibOptionen(opts);
    var body = mitV15Kanal(payload, optionen);
    if (body.kanal === "papier") {
      throw new Error("Die Customer App darf PERSON_REGISTERED nicht mit payload.kanal=papier schreiben.");
    }
    var ev = makeEreignis("PERSON_REGISTERED", "customer_app", body);
    return putEreignis(ev, optionen);
  }

  function getSession() {
    return lsRead(LS_SESSION, null);
  }

  function setSession(session) {
    if (session) lsWrite(LS_SESSION, session);
    else root.localStorage.removeItem(LS_SESSION);
  }

  function getLocalPersons() {
    return lsRead(LS_LOCAL_PERSONS, []);
  }

  function saveLocalPerson(person) {
    var list = getLocalPersons().filter(function (p) { return p.person_id !== person.person_id; });
    list.push(person);
    lsWrite(LS_LOCAL_PERSONS, list);
  }

  function getSeededPeriod() {
    return root.localStorage.getItem(LS_SEEDED);
  }

  function setSeededPeriod(periodeId) {
    root.localStorage.setItem(LS_SEEDED, periodeId);
  }

  root.FoodAlloStore = {
    nowIso: nowIso,
    newEreignisId: newEreignisId,
    makeEreignis: makeEreignis,
    putEreignis: putEreignis,
    allEreignisse: allEreignisse,
    getSession: getSession,
    setSession: setSession,
    getLocalPersons: getLocalPersons,
    saveLocalPerson: saveLocalPerson,
    getSeededPeriod: getSeededPeriod,
    setSeededPeriod: setSeededPeriod,
    writeCustomerEreignis: writeCustomerEreignis,
    mitV15Kanal: mitV15Kanal,
    v12AktivOpts: v12AktivOpts,
    schreibOptionen: schreibOptionen,
    assertSchreibrecht: assertSchreibrecht,
    getCustomerDemoLog: getCustomerDemoLog
  };

  if (typeof module === "object" && module.exports) {
    module.exports = {
      mitV15Kanal: mitV15Kanal,
      v12AktivOpts: v12AktivOpts,
      schreibOptionen: schreibOptionen
    };
  }
})(typeof self !== "undefined" ? self : this);
