
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FoodAlloVoucher = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SCHEMA_VERSION = 1; // Ereignisfeld bleibt Hauptversion 1; Inhalt folgt Vorschlag 1.1
  var PROPOSAL_VERSION = "1.1";
  var AGS_FROHBURG = "14729140";
  var AGS_LK_LEIPZIG = "14729";
  var STELLE_MELDEBEHOERDE = "FA-AUTH-FROHBURG-MELDEBEHOERDE";
  var PERIOD_DAYS = 7;
  var TIMEZONE = "Europe/Berlin";
  var WATER_L_PER_PERSON_PER_DAY = 2; // BBK, Annahme, nur bei Störung
  var TOILET_PAPER_PER_PERSON_7D = 1; // Annahme

  
  var BASE_QUOTA_PER_PERSON_7D = {
    wheat_flour: 2.0,
    rice: 1.2,
    oil: 0.35,
    water: WATER_L_PER_PERSON_PER_DAY * PERIOD_DAYS, // 14 L
    toilet_paper: TOILET_PAPER_PER_PERSON_7D,
    insulin: null
  };

  var QUOTA_ANNAHME = {
    wheat_flour: false,
    rice: false,
    oil: false,
    water: true,
    toilet_paper: true,
    insulin: false
  };

  var HOUSEHOLD_ARTIKEL = ["wheat_flour", "rice", "oil", "water", "toilet_paper"];
  var STANDARD_STAPLES = ["wheat_flour", "rice", "oil"];

  
  var EREIGNIS_ID_PATTERN = /^FA-E-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  // PAPER_CARD_* meint nur die beiden folgenden Typen; PAPER_CARD_CREATED gibt es nicht (G23).
  var PAPER_CARD_TYPEN = ["PAPER_CARD_RENDERED", "PAPER_CARD_PRINTED"];
  var EREIGNIS_TYPEN = [
    "PERSON_REGISTERED", "PERSON_VERIFIED", "IDENTITY_VERIFIED",
    "ALLOCATION_RUN_COMPLETED", "VOUCHER_ISSUED",
    "PAPER_CARD_RENDERED", "PAPER_CARD_PRINTED",
    "REDEMPTION_POSTED", "REDEMPTION_REVERSED",
    "STOCK_RECEIPT_POSTED", "STOCK_ADJUSTED", "PRESCRIPTION_CHECKED",
    "PERIOD_CLOSED", "SUPPLY_DISRUPTION_DECLARED", "SUPPLY_DISRUPTION_ENDED"
  ];
  // PERSON_VERIFIED: deprecated, nur noch lesen, in v2 entfernt.
  var TYP_IDENTITAET_LESEN = ["IDENTITY_VERIFIED", "PERSON_VERIFIED"];
  var CUSTOMER_APP_SCHREIBT = ["PERSON_REGISTERED"];

  function isEreignisId(id) {
    return typeof id === "string" && EREIGNIS_ID_PATTERN.test(id);
  }

  function eventMs(z) {
    if (z instanceof Date) return z.getTime();
    if (typeof z === "number" && Number.isFinite(z)) return z;
    if (!z) return Date.now();
    var t = Date.parse(z);
    return Number.isFinite(t) ? t : Date.now();
  }

  /**
   * Aktiv, wenn für AGS und Art eine SUPPLY_DISRUPTION_DECLARED gilt
   * (beginn ≤ t und (ende fehlt/null oder t < ende)); ENDED setzt ende.
   */
  function stoerungAktiv(ereignisse, opts) {
    opts = opts || {};
    var ags = opts.ags || AGS_FROHBURG;
    var art = opts.art || "trinkwasser";
    var t = eventMs(opts.zeit || opts.now);
    var offen = {};
    var list = (ereignisse || []).slice().sort(function (a, b) {
      return eventMs(a && a.zeit_ereignis) - eventMs(b && b.zeit_ereignis);
    });
    list.forEach(function (e) {
      var p = e && e.payload;
      if (!p) return;
      if (e.typ === "SUPPLY_DISRUPTION_DECLARED" && p.ags === ags && p.art === art && p.stoerung_id) {
        offen[p.stoerung_id] = { beginn: p.beginn, ende: p.ende || null };
      }
      if (e.typ === "SUPPLY_DISRUPTION_ENDED" && p.stoerung_id && (!p.ags || p.ags === ags)) {
        if (offen[p.stoerung_id]) offen[p.stoerung_id].ende = p.ende;
      }
    });
    var ids = Object.keys(offen);
    if (opts.stoerung_id) ids = ids.filter(function (id) { return id === opts.stoerung_id; });
    return ids.some(function (id) {
      var s = offen[id];
      return eventMs(s.beginn) <= t && (!s.ende || t < eventMs(s.ende));
    });
  }

  function hatTrinkwasserStoerung(opts) {
    opts = opts || {};
    if (opts.ereignisse) {
      return stoerungAktiv(opts.ereignisse, {
        ags: opts.ags || AGS_FROHBURG,
        art: "trinkwasser",
        zeit: opts.zeit || opts.now
      });
    }
    return !!opts.trinkwasserStoerung;
  }

  /**
   * Aktive Störung (gleiche Regel wie stoerungAktiv). Bei mehreren die zuletzt
   * deklarierte. null, wenn keine aktiv ist.
   */
  function aktiveVersorgungsstoerung(ereignisse, opts) {
    opts = opts || {};
    var ags = opts.ags || AGS_FROHBURG;
    var art = opts.art || "trinkwasser";
    var t = eventMs(opts.zeit || opts.now);
    var offen = {};
    var order = [];
    (ereignisse || []).forEach(function (e, i) {
      var p = e && e.payload;
      if (!p) return;
      if (e.typ === "SUPPLY_DISRUPTION_DECLARED" && p.ags === ags && p.art === art && p.stoerung_id) {
        offen[p.stoerung_id] = {
          stoerung_id: p.stoerung_id,
          ags: p.ags,
          art: p.art,
          beginn: p.beginn,
          ende: p.ende || null,
          hinweis: p.hinweis || "",
          stelle: p.stelle || null,
          _idx: i
        };
        order.push(p.stoerung_id);
      }
      if (e.typ === "SUPPLY_DISRUPTION_ENDED" && p.stoerung_id && (!p.ags || p.ags === ags)) {
        if (offen[p.stoerung_id]) offen[p.stoerung_id].ende = p.ende;
      }
    });
    if (opts.stoerung_id) {
      var gezielt = offen[opts.stoerung_id];
      if (!gezielt) return null;
      var aktivGezielt = eventMs(gezielt.beginn) <= t && (!gezielt.ende || t < eventMs(gezielt.ende));
      return aktivGezielt ? gezielt : Object.assign({}, gezielt, { _beendet: true });
    }
    var aktiv = order.filter(function (id) {
      var s = offen[id];
      return s && eventMs(s.beginn) <= t && (!s.ende || t < eventMs(s.ende));
    });
    if (!aktiv.length) return null;
    return offen[aktiv[aktiv.length - 1]];
  }

  /**
   * Bestätigt, wenn IDENTITY_VERIFIED (oder veraltetes PERSON_VERIFIED) mit
   * status=bestaetigt im Log steht; sonst Seed-Verifikation der Person.
   */
  /**
   * Anzeige wie Kern 1.8.7: festes Feld anzeigename, sonst name, niemals der Ortsteil.
   * Bei gleichem Anzeigenamen wird „, Straße Hausnummer“ angehängt.
   */
  function anschriftVonAnzeige(obj) {
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
  function anzeigeTitel(eintrag) {
    var e = eintrag || {};
    if (e.vornamen || e.familienname) return ((e.vornamen || "") + " " + (e.familienname || "")).trim();
    if (e.anzeigename) return String(e.anzeigename).trim();
    return String(e.name || "").trim();
  }
  function anzeigeNameEindeutig(eintrag, alle) {
    if (typeof window !== "undefined" && window.FAKern && typeof window.FAKern.anzeigeNameEindeutig === "function") {
      return window.FAKern.anzeigeNameEindeutig(eintrag, alle);
    }
    var titel = anzeigeTitel(eintrag);
    var liste = alle || [];
    if (!liste.length) return titel;
    var titelCf = titel.toLowerCase(), nTitel = 0, i;
    for (i = 0; i < liste.length; i++) {
      if (anzeigeTitel(liste[i]).toLowerCase() === titelCf) nTitel++;
    }
    if (nTitel <= 1) return titel;
    var d = anschriftVonAnzeige(eintrag);
    var strasse = [d.strasse, d.hausnummer].filter(function (x) { return String(x || "").trim(); }).join(" ").trim();
    if (!strasse) return titel;
    return titel + ", " + strasse;
  }

  function personIdAusIdentitaet(e) {
    if (!e || !e.payload) return null;
    if (e.payload.person_id) return e.payload.person_id;
    if (e.payload.person && e.payload.person.person_id) return e.payload.person.person_id;
    return null;
  }

  /**
   * Letztes IDENTITY_VERIFIED (oder Lese-Alias PERSON_VERIFIED) je Person:
   * zuerst zeit_ereignis, bei Gleichstand die spätere Position in der Liste (Logreihenfolge).
   */
  function letztesIdentitaetsEreignis(ereignisse, personId) {
    var best = null;
    var bestMs = null;
    var bestIdx = -1;
    (ereignisse || []).forEach(function (e, i) {
      if (!e || TYP_IDENTITAET_LESEN.indexOf(e.typ) === -1) return;
      if (personIdAusIdentitaet(e) !== personId) return;
      var t = e.zeit_ereignis ? Date.parse(e.zeit_ereignis) : NaN;
      var ms = Number.isFinite(t) ? t : -Infinity;
      if (best === null || ms > bestMs || (ms === bestMs && i > bestIdx)) {
        best = e;
        bestMs = ms;
        bestIdx = i;
      }
    });
    return best;
  }

  function personIstBestaetigt(person, ereignisse) {
    var id = person && person.person_id;
    var ev = letztesIdentitaetsEreignis(ereignisse, id);
    if (ev && ev.payload && ev.payload.verifikation) {
      return ev.payload.verifikation.status === "bestaetigt";
    }
    return !!(person && person.verifikation && person.verifikation.status === "bestaetigt");
  }

  function roundQty(n, decimals) {
    if (n === null || n === undefined || Number.isNaN(n)) return n;
    var d = decimals === undefined ? 4 : decimals;
    var f = Math.pow(10, d);
    return Math.round((Number(n) + Number.EPSILON) * f) / f;
  }

  function isFiniteNumber(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function kaufmaennisch(n) {
    return Math.round(n);
  }

  function computeGranted(need, baseQuota, remainingStock) {
    if (!isFiniteNumber(need) || !isFiniteNumber(baseQuota) || !isFiniteNumber(remainingStock)) {
      throw new Error("computeGranted erwartet drei endliche Zahlen (need, base_quota, remaining_stock)");
    }
    if (need < 0 || baseQuota < 0 || remainingStock < 0) {
      throw new Error("computeGranted: negative Mengen sind unzulässig");
    }
    return roundQty(Math.min(need, baseQuota, remainingStock));
  }

  function computeInsulinGranted(rezeptMenge, remainingStock) {
    if (!isFiniteNumber(rezeptMenge) || !isFiniteNumber(remainingStock)) {
      throw new Error("computeInsulinGranted erwartet endliche Zahlen");
    }
    if (rezeptMenge < 0 || remainingStock < 0) {
      throw new Error("computeInsulinGranted: negative Mengen sind unzulässig");
    }
    return roundQty(Math.min(rezeptMenge, remainingStock));
  }

  function padN(n, width) {
    return String(n).padStart(width, "0");
  }

  function berlinParts(date) {
    var d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) throw new Error("Ungültiges Datum");
    var fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    });
    var map = {};
    fmt.formatToParts(d).forEach(function (p) { map[p.type] = p.value; });
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      weekday: map.weekday
    };
  }

  
  function periodFromDate(date) {
    var parts = berlinParts(date);
    var utcNoon = Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0);
    var dow = new Date(utcNoon).getUTCDay();
    var minus = dow === 0 ? 6 : dow - 1;
    var startUtc = utcNoon - minus * 86400000;
    var endUtc = startUtc + 6 * 86400000;
    var start = new Date(startUtc);
    var end = new Date(endUtc);
    var sy = start.getUTCFullYear();
    var sm = start.getUTCMonth() + 1;
    var sd = start.getUTCDate();
    var ey = end.getUTCFullYear();
    var em = end.getUTCMonth() + 1;
    var ed = end.getUTCDate();
    function ymd(y, m, d) { return String(y) + padN(m, 2) + padN(d, 2); }
    var startYmd = ymd(sy, sm, sd);
    return {
      periode_id: "FA-PER-" + startYmd,
      start_ymd: startYmd,
      ende_ymd: ymd(ey, em, ed),
      start_iso_date: sy + "-" + padN(sm, 2) + "-" + padN(sd, 2),
      ende_iso_date: ey + "-" + padN(em, 2) + "-" + padN(ed, 2),
      tage: PERIOD_DAYS,
      zuschnitt: "Mo-So"
    };
  }

  function periodEndDate(periode) {
    return new Date(periode.ende_iso_date + "T23:59:59+01:00");
  }

  function laufendeNummerFromPersonId(personId) {
    var m = String(personId || "").match(/^FA-P-[0-9]{8}-([0-9]{6})$/);
    if (!m) throw new Error("person_id hat nicht die Form FA-P-{AGS}-{6 Ziffern}: " + personId);
    return m[1];
  }

  function isGutscheinId(id) {
    return /^FA-V-\d{8}-\d{6}$/.test(String(id || ""));
  }

  
  function papierkarteId(ags, lfd) {
    var nr = typeof lfd === "number" ? padN(lfd, 6) : String(lfd).padStart(6, "0");
    if (!/^\d{8}$/.test(String(ags))) throw new Error("kommune/AGS muss 8-stellig sein");
    if (!/^\d{6}$/.test(nr)) throw new Error("lfd muss 6-stellig sein");
    return "FA-PK-" + ags + "-" + nr;
  }

  function isValidAgs(ags) {
    // Amtlicher Gemeindeschlüssel: Land 01–16, insgesamt 8 Stellen.
    // Unterscheidet FA-PK-<AGS>-<lfd> von einem Datumsfeld (z. B. 20261116).
    return /^(0[1-9]|1[0-6])\d{6}$/.test(String(ags || ""));
  }

  function isPapierkarteId(id) {
    var m = String(id || "").match(/^FA-PK-(\d{8})-(\d{6})$/);
    return !!(m && isValidAgs(m[1]));
  }

  /** ausstellungsort: Ausgabestelle FA-R-… oder Behörden-ID FA-AUTH-… */
  function isAusstellungsortId(id) {
    var s = String(id || "");
    return /^FA-R-\d{8}-\d{4}$/.test(s) || /^FA-AUTH-[A-Z0-9-]+$/.test(s);
  }

  function personenzahl(haushalt) {
    if (!haushalt) return 0;
    if (Array.isArray(haushalt.person_ids) && haushalt.person_ids.length) return haushalt.person_ids.length;
    if (isFiniteNumber(haushalt.groesse) && haushalt.groesse >= 1) return haushalt.groesse;
    return 0;
  }

  
  function householdQuota(artikelId, personenAnzahl, opts) {
    opts = opts || {};
    if (!isFiniteNumber(personenAnzahl) || personenAnzahl < 1) {
      throw new Error("householdQuota erwartet personenAnzahl ≥ 1");
    }
    if (artikelId === "insulin") return null;
    if (artikelId === "water" && !hatTrinkwasserStoerung(opts)) return 0;
    var per = BASE_QUOTA_PER_PERSON_7D[artikelId];
    if (per === null || per === undefined) return null;
    return roundQty(per * personenAnzahl);
  }

  function sumBestand(bestaende, artikelId, ausgabestelleIds) {
    var allow = ausgabestelleIds ? new Set(ausgabestelleIds) : null;
    var sum = 0;
    (bestaende || []).forEach(function (b) {
      if (b.artikel_id !== artikelId) return;
      if (allow && !allow.has(b.ausgabestelle_id)) return;
      if (isFiniteNumber(b.menge) && b.menge > 0) sum += b.menge;
    });
    return roundQty(sum);
  }

  function isRezeptGueltig(rezept, now, personId) {
    if (!rezept) return false;
    if (rezept.artikel_id !== "insulin") return false;
    if (!rezept.person_id) return false;
    if (personId && rezept.person_id !== personId) return false;
    if (rezept.status && rezept.status !== "gueltig") return false;
    var t = now instanceof Date ? now : new Date(now || Date.now());
    if (rezept.gueltig_von && t < new Date(rezept.gueltig_von)) return false;
    if (rezept.gueltig_bis && t > new Date(rezept.gueltig_bis)) return false;
    return isFiniteNumber(rezept.menge) && rezept.menge > 0;
  }

  function insulinSperrgrund(person, rezept, now) {
    if (person && isRezeptGueltig(rezept, now, person.person_id)) return null;
    return "locked_needs_rezept";
  }

  function deriveVoucherStatus(positionen, periodEndDateVal, now, storniert) {
    if (storniert) return "storniert";
    var t = now instanceof Date ? now : new Date(now || Date.now());
    if (periodEndDateVal) {
      var end = periodEndDateVal instanceof Date ? periodEndDateVal : new Date(periodEndDateVal);
      if (!Number.isNaN(end.getTime()) && t > end) return "abgelaufen";
    }
    var quant = (positionen || []).filter(function (p) {
      if (!isFiniteNumber(p.zugeteilt_max)) return false;
      if (p.artikel_id === "water" && p.zugeteilt_max === 0) return false;
      return true;
    });
    if (quant.length === 0) return "ausgestellt";
    var anyRedeemed = quant.some(function (p) {
      return isFiniteNumber(p.eingeloest) && p.eingeloest > 0;
    });
    var allExhausted = quant.every(function (p) {
      if (p.zugeteilt_max === 0) return true;
      return isFiniteNumber(p.rest) && p.rest <= 0;
    });
    if (allExhausted && anyRedeemed) return "ausgeschoepft";
    if (anyRedeemed) return "teilweise_eingeloest";
    return "ausgestellt";
  }

  function haushaltKanal(haushalt, personen) {
    var list = personen || [];
    var ids = (haushalt && haushalt.person_ids) || [];
    var members = list.filter(function (p) { return ids.indexOf(p.person_id) !== -1; });
    if (!members.length && list.length === 1) members = list;
    var papier = members.some(function (p) {
      return p.kanal === "papier" || (p.flags || []).indexOf("no_digital") !== -1;
    });
    return papier ? "papier" : "app";
  }

  /**
   * Jedes registrierte, bestätigte Haushaltsmitglied darf den Haushaltsgutschein
   * einlösen (Staples / TP / Wasser). Insulin bleibt an person_id des Rezepts gebunden.
   */
  function darfEinloesen(person, gutschein, haushalt) {
    if (!person || !gutschein) return false;
    if (gutschein.bezug && gutschein.bezug !== "haushalt") return false;
    if (person.verifikation && person.verifikation.status !== "bestaetigt") return false;
    var hid = gutschein.haushalt_id || (haushalt && haushalt.haushalt_id);
    if (!hid || person.haushalt_id !== hid) return false;
    if (haushalt && Array.isArray(haushalt.person_ids) && haushalt.person_ids.indexOf(person.person_id) === -1) {
      return false;
    }
    return true;
  }

  function darfInsulinEinloesen(person, rezept, now) {
    return !!(person && isRezeptGueltig(rezept, now, person.person_id));
  }

  /**
   * Baut einen Haushaltsgutschein. gutschein_id ist Pflicht und muss von der
   * Desktopversion stammen — diese Funktion vergibt keine neue ID.
   */
  function buildVoucher(opts) {
    opts = opts || {};
    var haushalt = opts.haushalt;
    if (!haushalt || !haushalt.haushalt_id) throw new Error("haushalt ist Pflicht (Bezug haushalt)");
    if (!opts.gutschein_id || !isGutscheinId(opts.gutschein_id)) {
      throw new Error("gutschein_id ist Pflicht und wird nur von der Desktopversion vergeben (Form FA-V-YYYYMMDD-NNNNNN)");
    }
    var n = personenzahl(haushalt);
    if (n < 1) throw new Error("Haushalt ohne Personen");
    var periode = opts.periode || periodFromDate(opts.now || new Date());
    var bestaende = opts.bestaende || [];
    var stoerung = hatTrinkwasserStoerung(opts);
    var einloesungen = opts.einloesungen || [];
    var kernIds = opts.kernAusgabestellen || null;
    var now = opts.now || new Date();
    var personen = opts.personen || (opts.person ? [opts.person] : []);
    var kanal = opts.kanal || haushaltKanal(haushalt, personen);
    var ausstellungsort = opts.ausstellungsort || STELLE_MELDEBEHOERDE;
    if (ausstellungsort && !isAusstellungsortId(ausstellungsort)) {
      throw new Error("ausstellungsort muss FA-R-… oder FA-AUTH-… sein");
    }

    var eingeloestJeArtikel = {};
    einloesungen.forEach(function (e) {
      if (!e || e.status === "storniert") return;
      if (e.gutschein_id && e.gutschein_id !== opts.gutschein_id) return;
      if (e.haushalt_id && e.haushalt_id !== haushalt.haushalt_id) return;
      if (e.artikel_id === "insulin") return;
      if (e.rezept_id && !e.gutschein_id) return;
      var id = e.artikel_id;
      eingeloestJeArtikel[id] = roundQty((eingeloestJeArtikel[id] || 0) + Number(e.menge || 0));
    });

    var positionen = [];
    HOUSEHOLD_ARTIKEL.forEach(function (artikelId) {
      var quota = householdQuota(artikelId, n, { trinkwasserStoerung: stoerung });
      if (artikelId === "water" && !stoerung) {
        positionen.push({
          artikel_id: "water",
          bedarf: 0,
          basiskontingent: householdQuota("water", n, { trinkwasserStoerung: true }),
          zugeteilt_max: 0,
          eingeloest: 0,
          rest: 0,
          personen_anzahl: n
        });
        return;
      }
      var need = quota;
      var stock = sumBestand(bestaende, artikelId, kernIds);
      var zugeteilt = computeGranted(need, quota, stock);
      var ein = Math.min(eingeloestJeArtikel[artikelId] || 0, zugeteilt);
      positionen.push({
        artikel_id: artikelId,
        bedarf: need,
        basiskontingent: quota,
        zugeteilt_max: zugeteilt,
        eingeloest: ein,
        rest: roundQty(zugeteilt - ein),
        personen_anzahl: n
      });
    });

    var papierkarte = null;
    if (kanal === "papier") {
      if (opts.papierkarte_id) {
        if (!isPapierkarteId(opts.papierkarte_id)) {
          throw new Error("papierkarte_id hat nicht die Form FA-PK-<kommune>-<lfd>");
        }
        papierkarte = opts.papierkarte_id;
      } else {
        papierkarte = null; // Customer App vergibt keine Karten-ID
      }
    }

    return {
      gutschein_id: opts.gutschein_id,
      periode_id: periode.periode_id,
      bezug: "haushalt",
      person_id: null,
      haushalt_id: haushalt.haushalt_id,
      kanal: kanal,
      positionen: positionen,
      status: deriveVoucherStatus(positionen, periodEndDate(periode), now, false),
      papierkarte_id: papierkarte,
      ausstellungsort: ausstellungsort,
      _demo_ausgestellt_von: opts.ausgestelltVon || "desktop"
    };
  }

  function v12Aktiv(opts) {
    opts = opts || {};
    if (opts.v12 === true) return true;
    if (opts.optionen && opts.optionen.v12 === true) return true;
    return false;
  }

  function gutscheinAnlass(g) {
    return (g && g.anlass) ? g.anlass : "regulaer";
  }

  function agsAusHaushaltId(hid) {
    var m = /^FA-HH-(\d{8})-\d{6}$/.exec(String(hid || ""));
    return m ? m[1] : null;
  }

  function agsAusPersonId(pid) {
    var m = /^FA-P-(\d{8})-\d{6}$/.exec(String(pid || ""));
    return m ? m[1] : null;
  }

  function agsAusHaushalt(haushalt) {
    if (!haushalt) return null;
    if (isValidAgs(haushalt.ags_wohnsitz)) return String(haushalt.ags_wohnsitz);
    if (isValidAgs(haushalt.ags)) return String(haushalt.ags);
    return agsAusHaushaltId(haushalt.haushalt_id);
  }

  function agsAusPerson(person) {
    if (!person) return null;
    if (isValidAgs(person.ags_wohnsitz)) return String(person.ags_wohnsitz);
    if (isValidAgs(person.ags)) return String(person.ags);
    return agsAusPersonId(person.person_id) || agsAusHaushaltId(person.haushalt_id);
  }

  function agsAusStelle(stelle) {
    if (stelle == null || stelle === "") return null;
    if (typeof stelle === "string") {
      if (isValidAgs(stelle)) return String(stelle);
      var mid = /^FA-R-(\d{8})-\d{4}$/.exec(stelle);
      return mid && isValidAgs(mid[1]) ? mid[1] : null;
    }
    if (isValidAgs(stelle.ags)) return String(stelle.ags);
    if (isValidAgs(stelle.ags_wohnsitz)) return String(stelle.ags_wohnsitz);
    return agsAusStelle(stelle.ausgabestelle_id);
  }

  /** V10: AGS aus gutschein.ags (Pflicht bei stoerung), sonst aus dem Haushalt oder der ID. */
  function agsAusGutschein(g, haushalt) {
    if (g && isValidAgs(g.ags)) return String(g.ags);
    return agsAusHaushalt(haushalt) || agsAusHaushaltId(g && g.haushalt_id) || null;
  }

  function stoerungNachId(ereignisse, stoerungId) {
    if (!stoerungId) return null;
    var found = null;
    (ereignisse || []).forEach(function (e) {
      var p = e && e.payload;
      if (!p || p.stoerung_id !== stoerungId) return;
      if (e.typ === "SUPPLY_DISRUPTION_DECLARED") {
        found = {
          stoerung_id: p.stoerung_id,
          ags: p.ags,
          art: p.art,
          beginn: p.beginn,
          ende: p.ende || null
        };
      } else if (e.typ === "SUPPLY_DISRUPTION_ENDED") {
        if (!found) {
          found = { stoerung_id: p.stoerung_id, ags: p.ags, art: p.art || "trinkwasser", beginn: null, ende: p.ende || e.zeit_ereignis };
        } else {
          found.ende = p.ende || e.zeit_ereignis || found.ende;
        }
      }
    });
    return found;
  }

  /**
   * V9: Rest eines Störungsgutscheins verfällt mit ENDED / ende der verwiesenen Störung (t ≥ ende).
   * Rein abgeleitet, kein eigenes Ereignis. status bleibt unverändert.
   */
  function stoerungsgutscheinVerfallen(g, opts) {
    if (gutscheinAnlass(g) !== "stoerung") return false;
    opts = opts || {};
    var sid = g && g.stoerung_id;
    if (!sid) return false;
    var s = stoerungNachId(opts.ereignisse || [], sid);
    if (!s || !s.ende) return false;
    var t = eventMs(opts.zeit || opts.now);
    return t >= eventMs(s.ende);
  }

  /** V9: Ende der verwiesenen Störung (ISO-Zeit), sonst null (Störung noch ohne Ende). */
  function stoerungsgutscheinGueltigBis(g, opts) {
    if (gutscheinAnlass(g) !== "stoerung") return null;
    var sid = g && g.stoerung_id;
    if (!sid) return null;
    var s = stoerungNachId((opts || {}).ereignisse || [], sid);
    return (s && s.ende) ? s.ende : null;
  }

  /**
   * V11: papierkarte_id, Anzeigecode oder Strichcode → genau ein Gutschein.
   * Mehrere Papierkarten je Haushalt und Periode sind zulässig (je Gutschein eine).
   */
  function gutscheinZurPapierkarte(gutscheine, karte) {
    var k = String(karte || "").trim();
    var treffer = [];
    (gutscheine || []).forEach(function (g) {
      if (!g) return;
      var pk = g.papierkarte_id;
      if (!pk && !(g.code_anzeige || g.code_barcode)) return;
      if (k && (k === pk || k === g.code_anzeige || k === g.code_barcode)) treffer.push(g);
    });
    if (!treffer.length) return { fehler: "Keine Papierkarte bekannt." };
    if (treffer.length > 1) return { fehler: "Papierkarte ist mehreren Gutscheinen zugeordnet." };
    return { gutschein: treffer[0], gutschein_id: treffer[0].gutschein_id };
  }

  /**
   * Eigene Schema-Prüfung mit if/then/else und booleschen Teilschemas true/false (V14).
   * Unabhängig vom Kern, damit die Ersatzlogik testbar bleibt.
   */
  function typOkSchema(t, wert) {
    if (t === "object") return wert !== null && typeof wert === "object" && !Array.isArray(wert);
    if (t === "array") return Array.isArray(wert);
    if (t === "string") return typeof wert === "string";
    if (t === "number") return typeof wert === "number" && isFinite(wert);
    if (t === "integer") return typeof wert === "number" && isFinite(wert) && Math.floor(wert) === wert;
    if (t === "boolean") return typeof wert === "boolean";
    if (t === "null") return wert === null;
    return true;
  }

  function pruefeSchemaLokal(wurzel, wert, knoten, pfad) {
    knoten = (knoten === undefined || knoten === null) ? wurzel : knoten;
    pfad = pfad || "$";
    if (knoten === true) return [];
    if (knoten === false) return [pfad + ": nicht erlaubt"];
    var f = [];
    if (knoten && knoten.$ref) {
      var ziel = wurzel;
      knoten.$ref.replace(/^#\//, "").split("/").forEach(function (t) { ziel = ziel[t]; });
      f = f.concat(pruefeSchemaLokal(wurzel, wert, ziel, pfad));
    }
    if (knoten && knoten.type) {
      var ts = Array.isArray(knoten.type) ? knoten.type : [knoten.type];
      if (!ts.some(function (t) { return typOkSchema(t, wert); })) {
        f.push(pfad + ": Typ " + ts.join("|") + " erwartet");
        return f;
      }
    }
    if (knoten && "const" in knoten && JSON.stringify(knoten.const) !== JSON.stringify(wert)) {
      f.push(pfad + ": muss " + JSON.stringify(knoten.const) + " sein");
    }
    if (knoten && knoten.enum && !knoten.enum.some(function (e) { return JSON.stringify(e) === JSON.stringify(wert); })) {
      f.push(pfad + ": nicht in " + JSON.stringify(knoten.enum));
    }
    if (typeof wert === "string" && knoten) {
      if (knoten.pattern && !(new RegExp(knoten.pattern).test(wert))) f.push(pfad + ": Muster " + knoten.pattern);
      if (knoten.minLength != null && wert.length < knoten.minLength) f.push(pfad + ": zu kurz");
      if (knoten.maxLength != null && wert.length > knoten.maxLength) f.push(pfad + ": zu lang");
    }
    if (typeof wert === "number" && knoten) {
      if (knoten.minimum != null && wert < knoten.minimum) f.push(pfad + ": < " + knoten.minimum);
      if (knoten.exclusiveMinimum != null && wert <= knoten.exclusiveMinimum) f.push(pfad + ": ≤ " + knoten.exclusiveMinimum);
    }
    if (knoten && typOkSchema("object", wert)) {
      (knoten.required || []).forEach(function (k) { if (!(k in wert)) f.push(pfad + ": Pflichtfeld " + k + " fehlt"); });
      var props = knoten.properties || {};
      Object.keys(wert).forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(props, k)) f = f.concat(pruefeSchemaLokal(wurzel, wert[k], props[k], pfad + "." + k));
        else if (knoten.additionalProperties === false) f.push(pfad + ": unerwartetes Feld " + k);
      });
    }
    if (Array.isArray(wert) && knoten) {
      if (knoten.minItems != null && wert.length < knoten.minItems) f.push(pfad + ": zu wenige Einträge");
      if (knoten.items !== undefined) wert.forEach(function (x, i) { f = f.concat(pruefeSchemaLokal(wurzel, x, knoten.items, pfad + "[" + i + "]")); });
    }
    if (knoten && knoten.allOf) knoten.allOf.forEach(function (s) { f = f.concat(pruefeSchemaLokal(wurzel, wert, s, pfad)); });
    if (knoten && knoten.anyOf && !knoten.anyOf.some(function (s) { return pruefeSchemaLokal(wurzel, wert, s, pfad).length === 0; })) {
      f.push(pfad + ": passt zu keiner Alternative");
    }
    if (knoten && knoten.oneOf && knoten.oneOf.filter(function (s) { return pruefeSchemaLokal(wurzel, wert, s, pfad).length === 0; }).length !== 1) {
      f.push(pfad + ": nicht genau eine Alternative");
    }
    if (knoten && knoten["if"]) {
      var passt = pruefeSchemaLokal(wurzel, wert, knoten["if"], pfad).length === 0;
      if (passt && knoten.then !== undefined) f = f.concat(pruefeSchemaLokal(wurzel, wert, knoten.then, pfad));
      if (!passt && knoten["else"] !== undefined) f = f.concat(pruefeSchemaLokal(wurzel, wert, knoten["else"], pfad));
    }
    return f;
  }

  function pruefeSchema(wurzel, wert, knoten, pfad) {
    if (typeof FAKern !== "undefined" && FAKern && typeof FAKern.pruefeSchema === "function") {
      return FAKern.pruefeSchema(wurzel, wert, knoten, pfad);
    }
    return pruefeSchemaLokal(wurzel, wert, knoten, pfad);
  }

  function anreichernGutschein(gutschein, opts) {
    opts = opts || {};
    var g = JSON.parse(JSON.stringify(gutschein));
    var now = opts.now || new Date();
    var haushalt = opts.haushalt;
    opts = Object.assign({}, opts, {
      ags: agsAusGutschein(g, haushalt) || opts.ags || AGS_FROHBURG
    });
    var n = haushalt ? personenzahl(haushalt) : 0;
    var stoerung = hatTrinkwasserStoerung(opts);
    var einloesungen = opts.einloesungen || [];
    var bestaende = opts.bestaende || [];
    var kernIds = opts.kernAusgabestellen || null;

    g.bezug = "haushalt";
    if (g.person_id && g.bezug === "haushalt") {
      // v1.1: Haushaltsgutschein trägt keine führende person_id
      g.person_id = null;
    }

    function has(id) {
      return (g.positionen || []).some(function (p) { return p.artikel_id === id; });
    }

    // Insulin gehört nicht auf den Haushaltsgutschein
    g.positionen = (g.positionen || []).filter(function (p) { return p.artikel_id !== "insulin"; });

    var v12 = v12Aktiv(opts);
    var anlass = gutscheinAnlass(g);
    var nurStoerung = v12 && anlass === "stoerung";
    var regulaerV12 = v12 && anlass !== "stoerung";

    function setzeWasser(existingW) {
      var wQuota = householdQuota("water", n, { trinkwasserStoerung: true });
      if (stoerung) {
        var wStock = sumBestand(bestaende, "water", kernIds);
        var wGrant = bestaende && bestaende.length ? computeGranted(wQuota, wQuota, wStock || wQuota) : wQuota;
        var wPos = {
          artikel_id: "water",
          bedarf: wQuota,
          basiskontingent: wQuota,
          zugeteilt_max: wGrant,
          eingeloest: (existingW && existingW.eingeloest) || 0,
          rest: 0,
          personen_anzahl: n
        };
        wPos.eingeloest = Math.min(wPos.eingeloest, wPos.zugeteilt_max);
        wPos.rest = roundQty(wPos.zugeteilt_max - wPos.eingeloest);
        g.positionen = g.positionen.filter(function (p) { return p.artikel_id !== "water"; });
        g.positionen.push(wPos);
      } else {
        g.positionen = g.positionen.filter(function (p) { return p.artikel_id !== "water"; });
        g.positionen.push({
          artikel_id: "water",
          bedarf: 0,
          basiskontingent: wQuota,
          zugeteilt_max: 0,
          eingeloest: 0,
          rest: 0,
          personen_anzahl: n
        });
      }
    }

    if (n >= 1 && !nurStoerung) {
      if (!has("toilet_paper") || (has("toilet_paper") && g.positionen.some(function (p) {
        return p.artikel_id === "toilet_paper" && p.basiskontingent == null;
      }))) {
        var tpQuota = householdQuota("toilet_paper", n, {});
        var tpStock = sumBestand(bestaende, "toilet_paper", kernIds);
        var tpGrant = bestaende && bestaende.length ? computeGranted(tpQuota, tpQuota, tpStock || tpQuota) : tpQuota;
        g.positionen = g.positionen.filter(function (p) { return p.artikel_id !== "toilet_paper"; });
        g.positionen.push({
          artikel_id: "toilet_paper",
          bedarf: tpQuota,
          basiskontingent: tpQuota,
          zugeteilt_max: tpGrant,
          eingeloest: 0,
          rest: tpGrant,
          personen_anzahl: n
        });
      }
      if (regulaerV12) {
        // V7 / Kern 1.6: Wasser nur auf dem Störungsgutschein, nicht auf dem regulären.
        g.positionen = g.positionen.filter(function (p) { return p.artikel_id !== "water"; });
      } else {
        setzeWasser(g.positionen.find(function (p) { return p.artikel_id === "water"; }));
      }
    } else if (n >= 1 && nurStoerung) {
      setzeWasser(g.positionen.find(function (p) { return p.artikel_id === "water"; }));
    }

    var einl = {};
    einloesungen.forEach(function (e) {
      if (!e || e.status === "storniert") return;
      if (e.gutschein_id && e.gutschein_id !== g.gutschein_id) return;
      if (e.haushalt_id && g.haushalt_id && e.haushalt_id !== g.haushalt_id) return;
      if (e.artikel_id === "insulin") return;
      if (e.rezept_id && !e.gutschein_id) return;
      einl[e.artikel_id] = roundQty((einl[e.artikel_id] || 0) + Number(e.menge || 0));
    });
    g.positionen.forEach(function (p) {
      if (!Object.prototype.hasOwnProperty.call(einl, p.artikel_id)) return;
      if (!isFiniteNumber(p.zugeteilt_max)) return;
      p.eingeloest = Math.min(einl[p.artikel_id], p.zugeteilt_max);
      p.rest = roundQty(p.zugeteilt_max - p.eingeloest);
    });

    var periodeEnde = opts.periode ? periodEndDate(opts.periode) : null;
    g.status = deriveVoucherStatus(g.positionen, periodeEnde, now, g.status === "storniert");
    return g;
  }

  /**
   * 10 % vulnerabel und 10 % ohne Smartphone sind unabhängig;
   * Überschneidung ist konfigurierbar (Annahme, keine Statistik).
   * overlapAnteil = Anteil an der Gesamtbevölkerung, der zu beiden Gruppen gehört.
   */
  function planungszahlen(einwohner, anteilVulnerabel, anteilOhneSmartphone, overlapAnteil) {
    var v = anteilVulnerabel == null ? 0.1 : anteilVulnerabel;
    var d = anteilOhneSmartphone == null ? 0.1 : anteilOhneSmartphone;
    var o = overlapAnteil == null ? 0 : overlapAnteil;
    if (o < 0 || v < 0 || d < 0 || v > 1 || d > 1) throw new Error("Anteile müssen in [0, 1] liegen");
    if (o > Math.min(v, d) + 1e-12) {
      throw new Error("Überschneidung darf nicht größer sein als die kleinere der beiden Gruppen");
    }
    var vulnerabel = kaufmaennisch(einwohner * v);
    var ohne = kaufmaennisch(einwohner * d);
    var beides = kaufmaennisch(einwohner * o);
    return {
      annahme: true,
      unabhaengig: true,
      einwohner: einwohner,
      anteil_vulnerabel: v,
      anteil_ohne_smartphone: d,
      ueberschneidung_anteil: o,
      vulnerabel: vulnerabel,
      ohne_smartphone: ohne,
      beides: beides,
      nur_vulnerabel: vulnerabel - beides,
      nur_ohne_smartphone: ohne - beides,
      union: vulnerabel + ohne - beides
    };
  }

  return {
    SCHEMA_VERSION: SCHEMA_VERSION,
    PROPOSAL_VERSION: PROPOSAL_VERSION,
    AGS_FROHBURG: AGS_FROHBURG,
    AGS_LK_LEIPZIG: AGS_LK_LEIPZIG,
    STELLE_MELDEBEHOERDE: STELLE_MELDEBEHOERDE,
    PERIOD_DAYS: PERIOD_DAYS,
    TIMEZONE: TIMEZONE,
    WATER_L_PER_PERSON_PER_DAY: WATER_L_PER_PERSON_PER_DAY,
    TOILET_PAPER_PER_PERSON_7D: TOILET_PAPER_PER_PERSON_7D,
    BASE_QUOTA_PER_PERSON_7D: BASE_QUOTA_PER_PERSON_7D,
    QUOTA_ANNAHME: QUOTA_ANNAHME,
    HOUSEHOLD_ARTIKEL: HOUSEHOLD_ARTIKEL,
    STANDARD_STAPLES: STANDARD_STAPLES,
    roundQty: roundQty,
    computeGranted: computeGranted,
    computeInsulinGranted: computeInsulinGranted,
    periodFromDate: periodFromDate,
    periodEndDate: periodEndDate,
    laufendeNummerFromPersonId: laufendeNummerFromPersonId,
    isGutscheinId: isGutscheinId,
    papierkarteId: papierkarteId,
    isValidAgs: isValidAgs,
    isPapierkarteId: isPapierkarteId,
    isAusstellungsortId: isAusstellungsortId,
    personenzahl: personenzahl,
    householdQuota: householdQuota,
    sumBestand: sumBestand,
    isRezeptGueltig: isRezeptGueltig,
    insulinSperrgrund: insulinSperrgrund,
    deriveVoucherStatus: deriveVoucherStatus,
    haushaltKanal: haushaltKanal,
    darfEinloesen: darfEinloesen,
    darfInsulinEinloesen: darfInsulinEinloesen,
    buildVoucher: buildVoucher,
    anreichernGutschein: anreichernGutschein,
    planungszahlen: planungszahlen,
    EREIGNIS_ID_PATTERN: EREIGNIS_ID_PATTERN,
    EREIGNIS_TYPEN: EREIGNIS_TYPEN,
    PAPER_CARD_TYPEN: PAPER_CARD_TYPEN,
    TYP_IDENTITAET_LESEN: TYP_IDENTITAET_LESEN,
    CUSTOMER_APP_SCHREIBT: CUSTOMER_APP_SCHREIBT,
    isEreignisId: isEreignisId,
    stoerungAktiv: stoerungAktiv,
    hatTrinkwasserStoerung: hatTrinkwasserStoerung,
    aktiveVersorgungsstoerung: aktiveVersorgungsstoerung,
    anzeigeNameEindeutig: anzeigeNameEindeutig,
    letztesIdentitaetsEreignis: letztesIdentitaetsEreignis,
    personIstBestaetigt: personIstBestaetigt,
    v12Aktiv: v12Aktiv,
    gutscheinAnlass: gutscheinAnlass,
    pruefeSchema: pruefeSchema,
    agsAusHaushaltId: agsAusHaushaltId,
    agsAusPersonId: agsAusPersonId,
    agsAusHaushalt: agsAusHaushalt,
    agsAusPerson: agsAusPerson,
    agsAusStelle: agsAusStelle,
    agsAusGutschein: agsAusGutschein,
    stoerungNachId: stoerungNachId,
    stoerungsgutscheinVerfallen: stoerungsgutscheinVerfallen,
    stoerungsgutscheinGueltigBis: stoerungsgutscheinGueltigBis
  };
});
