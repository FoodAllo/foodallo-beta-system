
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FoodAlloMelderegister = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function normName(s) {
    return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  }
  function normAusweis(s) {
    return String(s == null ? "" : s).trim().replace(/\s+/g, "");
  }

  function vornameVon(e) {
    return String((e && (e.vorname || e.vornamen)) || "").trim();
  }
  function nachnameVon(e) {
    return String((e && (e.nachname || e.familienname)) || "").trim();
  }
  function ausweisVon(e) {
    if (!e) return "";
    if (e.personalausweisnummer != null && e.personalausweisnummer !== "") return e.personalausweisnummer;
    return e.ausweisnummer;
  }

  function vereinheitlicheEintrag(e) {
    if (!e) return e;
    var o = {};
    Object.keys(e).forEach(function (k) { o[k] = e[k]; });
    o.vorname = vornameVon(e);
    o.nachname = nachnameVon(e);
    if (o.personalausweisnummer == null && e.ausweisnummer != null) {
      o.personalausweisnummer = e.ausweisnummer;
    }
    return o;
  }

  function listeAus(pack) {
    if (!pack) return [];
    if (Array.isArray(pack)) return pack.map(vereinheitlicheEintrag);
    var raw = pack.eintraege || pack.personen || [];
    if (!Array.isArray(raw)) return [];
    return raw.map(vereinheitlicheEintrag);
  }

  function haushalteAus(pack) {
    if (!pack || !Array.isArray(pack.haushalte)) return [];
    return pack.haushalte;
  }

  function packAusText(text) {
    var s = String(text || "");
    var start = s.indexOf("{");
    var end = s.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    return JSON.parse(s.slice(start, end + 1));
  }

  function findeEintrag(pack, nachname, ausweis) {
    var n = normName(nachname);
    var a = normAusweis(ausweis);
    if (!n || !a) return null;
    var treffer = listeAus(pack).filter(function (p) {
      return normName(nachnameVon(p)) === n && normAusweis(ausweisVon(p)) === a;
    });
    return treffer.length === 1 ? treffer[0] : null;
  }

  function findeEintragNachId(pack, personId) {
    if (!personId) return null;
    var treffer = listeAus(pack).filter(function (p) {
      return p.person_id === personId;
    });
    return treffer.length === 1 ? treffer[0] : null;
  }

  function hatAmtlichePersonId(eintrag) {
    return !!(eintrag && eintrag.person_id && /^FA-P-\d{8}-\d{6}$/.test(String(eintrag.person_id)));
  }

  function hatAmtlicheHaushaltId(eintrag) {
    return !!(eintrag && eintrag.haushalt_id && /^FA-HH-\d{8}-\d{6}$/.test(String(eintrag.haushalt_id)));
  }

  function haushaltZu(eintrag, pack) {
    if (!eintrag || !pack) return null;
    var hid = eintrag.haushalt_id;
    if (!hid) return null;
    var list = haushalteAus(pack);
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].haushalt_id === hid) return list[i];
    }
    return null;
  }

  function nutzung(eintrag, pack) {
    if (eintrag && eintrag.nutzung) return String(eintrag.nutzung).toLowerCase();
    var hh = haushaltZu(eintrag, pack);
    if (hh && hh.nutzung) return String(hh.nutzung).toLowerCase();
    if (eintrag && eintrag.kanal === "papier") return "analog";
    if (hh && hh.kanal === "papier") return "analog";
    if (eintrag && eintrag.kanal === "app") return "digital";
    if (hh && hh.kanal === "app") return "digital";
    return "";
  }

  function istAnalog(eintrag, pack) {
    if (nutzung(eintrag, pack) === "analog") return true;
    if (eintrag && eintrag.kanal === "papier") return true;
    var flags = (eintrag && eintrag.flags) || [];
    return flags.indexOf("no_digital") !== -1;
  }

  function istDigital(eintrag, pack) {
    if (istAnalog(eintrag, pack)) return false;
    if (nutzung(eintrag, pack) === "digital") return true;
    if (eintrag && eintrag.kanal === "app") return true;
    return false;
  }

  function hatOnlineAusweis(eintrag) {
    return !!(eintrag && (eintrag.online_ausweis === true || eintrag.online_ausweis === "true" || eintrag.online_ausweis === "ja"));
  }

  function altersgruppeAusGeburtsdatum(iso, stichtag) {
    var m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return "adult";
    var geb = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var t = stichtag ? new Date(stichtag) : new Date(2026, 10, 17);
    var jahre = t.getFullYear() - geb.getFullYear();
    var noch = new Date(t.getFullYear(), geb.getMonth(), geb.getDate());
    if (t < noch) jahre -= 1;
    if (jahre < 1) return "infant";
    if (jahre < 18) return "child";
    if (jahre >= 65) return "elderly";
    return "adult";
  }

  /**
   * Anrede nur für bekannte Vornamen der fiktiven Liste, und nur für Erwachsene.
   * Beispiel „Guten Tag, Herr Meier“. Keine Anrede erfinden.
   */
  function anredeAusRegister(eintrag) {
    var v = vornameVon(eintrag);
    var ag = (eintrag && eintrag.altersgruppe) || altersgruppeAusGeburtsdatum(eintrag && eintrag.geburtsdatum);
    if (ag === "child" || ag === "infant") return "";
    if (v === "Martin" || v === "Marvin" || v === "Tom" || v === "Gerhard") return "Herr";
    if (v === "Sophie" || v === "Helga") return "Frau";
    return "";
  }

  function anzeigenameEintrag(eintrag) {
    var e = vereinheitlicheEintrag(eintrag);
    var full = ((e.vorname || "") + " " + (e.nachname || "")).trim();
    return full;
  }

  function mitgliederDesHaushalts(pack, haushaltId) {
    if (!haushaltId) return [];
    return listeAus(pack).filter(function (p) { return p.haushalt_id === haushaltId; });
  }

  function anzeigenamenDerMitglieder(pack, haushaltId) {
    return mitgliederDesHaushalts(pack, haushaltId).map(anzeigenameEintrag).filter(Boolean);
  }

  /**
   * Personenobjekt für die Oberfläche. Ohne erfundene person_id/haushalt_id.
   * Familienmitglieder werden hier nicht neu angelegt.
   */
  function personAusEintrag(eintrag) {
    if (!eintrag) return null;
    var e = vereinheitlicheEintrag(eintrag);
    var ag = e.altersgruppe || altersgruppeAusGeburtsdatum(e.geburtsdatum);
    var p = {
      vorname: e.vorname,
      nachname: e.nachname,
      anrede: anredeAusRegister(e),
      ortsteil: e.ortsteil || "",
      geburtsdatum: e.geburtsdatum || "",
      ags_wohnsitz: e.ags_wohnsitz || "14729140",
      altersgruppe: ag,
      flags: Array.isArray(e.flags) ? e.flags.slice() : [],
      kanal: e.kanal === "papier" ? "papier" : "app",
      nutzung: nutzung(e),
      online_ausweis: hatOnlineAusweis(e),
      verifikation: {
        status: "offen",
        stelle: "FA-AUTH-FROHBURG-MELDEBEHOERDE",
        verfahren: "synthetisch"
      },
      _aus_melderegister: true
    };
    if (hatAmtlichePersonId(e)) p.person_id = e.person_id;
    if (hatAmtlicheHaushaltId(e)) p.haushalt_id = e.haushalt_id;
    return p;
  }

  function eintraegeOhneAmtlicheId(pack) {
    return listeAus(pack).filter(function (p) { return !hatAmtlichePersonId(p); });
  }

  return {
    listeAus: listeAus,
    haushalteAus: haushalteAus,
    packAusText: packAusText,
    findeEintrag: findeEintrag,
    findeEintragNachId: findeEintragNachId,
    hatAmtlichePersonId: hatAmtlichePersonId,
    hatAmtlicheHaushaltId: hatAmtlicheHaushaltId,
    istAnalog: istAnalog,
    istDigital: istDigital,
    hatOnlineAusweis: hatOnlineAusweis,
    altersgruppeAusGeburtsdatum: altersgruppeAusGeburtsdatum,
    anredeAusRegister: anredeAusRegister,
    personAusEintrag: personAusEintrag,
    eintraegeOhneAmtlicheId: eintraegeOhneAmtlicheId,
    mitgliederDesHaushalts: mitgliederDesHaushalts,
    anzeigenamenDerMitglieder: anzeigenamenDerMitglieder,
    anzeigenameEintrag: anzeigenameEintrag,
    normAusweis: normAusweis
  };
});
