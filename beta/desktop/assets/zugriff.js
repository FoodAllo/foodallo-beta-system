/**
 * Zentrale Rechteprüfung der Desktopversion.
 * Einziger Ort, an dem Sichtrechte entschieden werden – später durch ein echtes Login ersetzbar.
 * In diesem Prototyp gibt es kein Login, nur eine Rollenauswahl zur Vorführung.
 */
(function (global) {
  "use strict";

  var AGS_FROHBURG = "14729140";
  var AGS_LK_LEIPZIG = "14729";
  var AGS_SACHSEN = "14";
  var KLEINZAHL_STANDARD = 5;

  var ROLLEN = {
    ROLE_STADT_FROHBURG: {
      rolle_id: "ROLE_STADT_FROHBURG",
      behoerde_amtlich: "Stadtverwaltung Musterstadt, dabei für die Identitätsfeststellung die Pass- und Meldebehörde",
      kurz: "Musterstadt",
      ebene: "kommune",
      darf_personendaten_sehen: true,
      darf_papierkarten_erzeugen: true,
      aggregationsebene: "fall",
      kleinzahl_schwelle: 0,
      raum: { typ: "ags", werte: [AGS_FROHBURG] },
      sicht_text: "Einzelfälle (synthetisch, pseudonymisiert) und Bestände der Ausgabestellen in der Musterstadt. Keine Daten anderer Gemeinden."
    },
    ROLE_LRA_LK_LEIPZIG: {
      rolle_id: "ROLE_LRA_LK_LEIPZIG",
      behoerde_amtlich: "Landratsamt Landkreis Leipzig (Behörde des Landkreises Leipzig)",
      kurz: "Landkreis Leipzig",
      ebene: "kreis",
      darf_personendaten_sehen: false,
      darf_papierkarten_erzeugen: false,
      aggregationsebene: "gemeinde",
      kleinzahl_schwelle: KLEINZAHL_STANDARD,
      raum: { typ: "ags_prefix", werte: [AGS_LK_LEIPZIG] },
      sicht_text: "Nur Gemeindeaggregate und die Kreissumme. Keine Personen, keine einzelnen Gutscheine, keine einzelnen Ausgabestellen."
    },
    ROLE_LDS: {
      rolle_id: "ROLE_LDS",
      behoerde_amtlich: "Landesdirektion Sachsen",
      kurz: "Landesdirektion Sachsen",
      ebene: "land",
      darf_personendaten_sehen: false,
      darf_papierkarten_erzeugen: false,
      aggregationsebene: "kreis",
      kleinzahl_schwelle: KLEINZAHL_STANDARD,
      raum: { typ: "land", werte: [AGS_SACHSEN] },
      sicht_text: "Nur Kreis- und Landesaggregate. Keine Personen, keine Gemeinde-Falllisten, keine einzelnen Ausgabestellen."
    },
    ROLE_SMI: {
      rolle_id: "ROLE_SMI",
      behoerde_amtlich: "Sächsisches Staatsministerium des Innern",
      kurz: "SMI",
      ebene: "land",
      darf_personendaten_sehen: false,
      darf_papierkarten_erzeugen: false,
      aggregationsebene: "kreis",
      kleinzahl_schwelle: KLEINZAHL_STANDARD,
      raum: { typ: "land", werte: [AGS_SACHSEN] },
      sicht_text: "Wie die Landesdirektion Sachsen: Kreis- und Landesaggregate, Schwerpunkt Bestands- und Ausgabeübersicht für den Bevölkerungsschutz. Keine Personendaten."
    },
    ROLE_BLE: {
      rolle_id: "ROLE_BLE",
      behoerde_amtlich: "Bundesanstalt für Landwirtschaft und Ernährung",
      kurz: "BLE",
      ebene: "bund",
      darf_personendaten_sehen: false,
      darf_papierkarten_erzeugen: false,
      aggregationsebene: "land",
      darf_kreis_als_kennzahl: true,
      kleinzahl_schwelle: KLEINZAHL_STANDARD,
      raum: { typ: "bund", werte: ["DE"] },
      sicht_text: "Länderaggregate der Lebensmittelpositionen, optional eine Kreis-Kennzahl. Keine Personen, keine Ausgabestellen."
    },
    ROLE_BMLEH: {
      rolle_id: "ROLE_BMLEH",
      behoerde_amtlich: "Bundesministerium für Landwirtschaft, Ernährung und Heimat",
      kurz: "BMLEH",
      ebene: "bund",
      darf_personendaten_sehen: false,
      darf_papierkarten_erzeugen: false,
      aggregationsebene: "land",
      darf_kreis_als_kennzahl: false,
      kleinzahl_schwelle: KLEINZAHL_STANDARD,
      raum: { typ: "bund", werte: ["DE"] },
      sicht_text: "Nur Länderaggregate. Eine optionale Verdichtung auf Kreis nur als einzelne Kennzahl ist in der Grundlage genannt, Bestände bleiben auf Landesebene. Keine Personen."
    }
  };

  var REIHENFOLGE = [
    "ROLE_STADT_FROHBURG",
    "ROLE_LRA_LK_LEIPZIG",
    "ROLE_LDS",
    "ROLE_SMI",
    "ROLE_BLE",
    "ROLE_BMLEH"
  ];

  function rolle(rolleId) {
    return ROLLEN[rolleId] || null;
  }

  function agsImRaum(r, ags) {
    if (!r || !ags) return false;
    var typ = r.raum.typ;
    if (typ === "ags") return r.raum.werte.indexOf(String(ags)) !== -1;
    if (typ === "ags_prefix") {
      return r.raum.werte.some(function (p) { return String(ags) === p || String(ags).indexOf(p) === 0; });
    }
    if (typ === "land") {
      return r.raum.werte.some(function (p) {
        return String(ags) === p || String(ags).indexOf(p) === 0;
      });
    }
    if (typ === "bund") return true;
    return false;
  }

  /**
   * Zentrale Sichtprüfung.
   * @param {string} rolleId
   * @param {{typ:string, ags?:string, anzahl?:number, kennzahl_typ?:string}} ressource
   *   typ: person|haushalt|gutschein|buchung|bestand_stelle|papierkarte|aggregat|kennzahl|ereignis_fall
   * @returns {{erlaubt:boolean, aggregationsebene:string, unterdruecken:boolean, grund:string}}
   */
  function pruefeSichtrecht(rolleId, ressource) {
    var r = rolle(rolleId);
    var res = ressource || {};
    if (!r) {
      return { erlaubt: false, aggregationsebene: "keine", unterdruecken: false, grund: "unbekannte_rolle" };
    }
    var typ = res.typ || "";
    var ags = res.ags;

    if (ags && !agsImRaum(r, ags)) {
      return { erlaubt: false, aggregationsebene: r.aggregationsebene, unterdruecken: false, grund: "ausserhalb_des_raeumlichen_zustaendigkeitsbereichs" };
    }

    var falltypen = { person: 1, haushalt: 1, gutschein: 1, buchung: 1, bestand_stelle: 1, papierkarte: 1, ereignis_fall: 1 };
    if (falltypen[typ]) {
      if (!r.darf_personendaten_sehen) {
        return { erlaubt: false, aggregationsebene: r.aggregationsebene, unterdruecken: false, grund: "einzelfaelle_nur_fuer_stadt_frohburg" };
      }
      if (typ === "papierkarte" && !r.darf_papierkarten_erzeugen) {
        return { erlaubt: false, aggregationsebene: r.aggregationsebene, unterdruecken: false, grund: "papierkarten_nur_stadt_frohburg" };
      }
      return { erlaubt: true, aggregationsebene: "fall", unterdruecken: false, grund: "kommunale_fallsicht" };
    }

    if (typ === "aggregat" || typ === "kennzahl") {
      var ebene = res.aggregationsebene || r.aggregationsebene;
      if (r.aggregationsebene === "land" && ebene === "gemeinde") {
        return { erlaubt: false, aggregationsebene: r.aggregationsebene, unterdruecken: false, grund: "gemeindeaggregate_nicht_fuer_diese_rolle" };
      }
      if (r.aggregationsebene === "land" && ebene === "kreis" && r.ebene === "bund" && !r.darf_kreis_als_kennzahl && typ === "aggregat") {
        return { erlaubt: false, aggregationsebene: r.aggregationsebene, unterdruecken: false, grund: "kreisaggregate_nicht_fuer_diese_rolle" };
      }
      if (r.aggregationsebene === "fall" && ebene && (ebene === "gemeinde" || ebene === "kreis" || ebene === "land")) {
        /* Kommune darf eigene Gemeindeaggregate sehen, nicht den ganzen Kreis als Rohdaten anderer Gemeinden. */
        if ((ebene === "kreis" || ebene === "land") && typ === "aggregat" && res.ags && !agsImRaum(r, res.ags === AGS_LK_LEIPZIG || res.ags === AGS_SACHSEN ? AGS_FROHBURG : res.ags) && res.ags !== AGS_FROHBURG) {
          return { erlaubt: false, aggregationsebene: "fall", unterdruecken: false, grund: "nur_eigene_gemeinde" };
        }
      }
      var unter = false;
      if (res.kennzahl_typ === "fallzahl" && r.kleinzahl_schwelle > 0 && typeof res.anzahl === "number") {
        unter = res.anzahl > 0 && res.anzahl < r.kleinzahl_schwelle;
      }
      return { erlaubt: true, aggregationsebene: r.aggregationsebene, unterdruecken: unter, grund: unter ? "kleinzahl" : "aggregat_zulässig" };
    }

    return { erlaubt: false, aggregationsebene: r.aggregationsebene, unterdruecken: false, grund: "unbekannter_ressourcentyp" };
  }

  function unterdrueckeKleinzahl(rolleId, anzahl) {
    var r = rolle(rolleId);
    if (!r || r.kleinzahl_schwelle <= 0) return false;
    return typeof anzahl === "number" && anzahl > 0 && anzahl < r.kleinzahl_schwelle;
  }

  function formatKleinzahl() {
    return "k";
  }

  function darfAnsicht(rolleId, ansicht) {
    var r = rolle(rolleId);
    if (!r) return false;
    if (ansicht === "faelle" || ansicht === "karte") {
      return r.darf_personendaten_sehen;
    }
    return true;
  }

  global.FOODALLO_ZUGRIFF = {
    ROLLEN: ROLLEN,
    REIHENFOLGE: REIHENFOLGE,
    AGS_FROHBURG: AGS_FROHBURG,
    AGS_LK_LEIPZIG: AGS_LK_LEIPZIG,
    AGS_SACHSEN: AGS_SACHSEN,
    KLEINZAHL_STANDARD: KLEINZAHL_STANDARD,
    rolle: rolle,
    agsImRaum: agsImRaum,
    pruefeSichtrecht: pruefeSichtrecht,
    unterdrueckeKleinzahl: unterdrueckeKleinzahl,
    formatKleinzahl: formatKleinzahl,
    darfAnsicht: darfAnsicht
  };
})(window);
