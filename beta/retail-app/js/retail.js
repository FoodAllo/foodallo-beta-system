/*
 * FoodAllo Retail App – Buchungsaktionen der Ausgabestelle (erzeugt nur Retail-Ereignisse).
 * Regel, Zustand und Prüfung kommen aus dem gemeinsamen Kern ../kern/foodallo_kern.js (FAKern).
 * Die Retail App schreibt nie VOUCHER_ISSUED und vergibt keine gutschein_id/papierkarte_id (Aufgabe der Desktopversion).
 * Spiegelbild: tools/retail_aktionen.py
 */
(function (root, factory) {
  var K = typeof module === "object" && module.exports ? require("../../kern/foodallo_kern.js") : root.FAKern;
  var r = factory(K);
  if (typeof module === "object" && module.exports) module.exports = r;
  else root.FARetail = r;
})(typeof self !== "undefined" ? self : this, function (K) {
  "use strict";
  var QUELLE = "retail_app";
  var REZEPT_FELDER = ["rezept_id", "person_id", "artikel_id", "menge", "einheit", "gueltig_von", "gueltig_bis", "status", "verfahren"];

  function tag(jetzt) { return jetzt.slice(0, 10).replace(/-/g, ""); }
  function kurz() { return K.neueEreignisId().slice(5, 13); }

  function datenminimal(r) {
    var o = {};
    REZEPT_FELDER.forEach(function (k) { if (r[k] !== undefined && r[k] !== null) o[k] = r[k]; });
    return o;
  }

  // Einlösung (Staples) oder Apothekenabgabe (Insulin). Ergebnis: { ok, plan, ereignisse: [...] } – alle oder keines anwenden.
  function erzeugeEinloesung(st, eingabe, jetzt) {
    jetzt = jetzt || K.zeitBerlin();
    if (eingabe.papierkarte && !eingabe.gutschein_id) {
      // Papierpfad: Karte -> genau ein Gutschein (ab v1.2 ggf. mehrere Karten je Haushalt und Periode)
      var zk = K.gutscheinZurPapierkarte(st, eingabe.papierkarte);
      if (zk.fehler) return { ok: false, fehler: zk.fehler, plan: null };
      eingabe = Object.assign({}, eingabe, { gutschein_id: zk.gutschein_id, kanal: "papier_abgleich" });
    }
    var art = st.artikel[eingabe.artikel_id];
    var rezept = null;
    if (art && art.rezeptpflicht) {
      var pr = K.pruefeRezeptnachweis(eingabe.rezeptnachweis, jetzt);
      if (!pr.ok) return { ok: false, fehler: pr.fehler, plan: null };
      rezept = pr.rezept;
    }
    var plan = K.planeEinloesung(st, { ausgabestelle_id: eingabe.ausgabestelle_id, gutschein_id: eingabe.gutschein_id,
      einloesende_person_id: eingabe.einloesende_person_id, artikel_id: eingabe.artikel_id, angefragt: eingabe.angefragt, rezept: rezept, zeit: jetzt });
    if (!plan.ok) return { ok: false, fehler: plan.fehler, plan: plan };
    var evs = [];
    if (rezept) {
      evs.push(K.huelle("PRESCRIPTION_CHECKED", QUELLE, { rezept: datenminimal(rezept), ausgabestelle_id: eingabe.ausgabestelle_id,
        nachweis_pruefung: "demo_pruefsumme" }, jetzt));
    }
    var buchung = { buchung_id: "FA-X-" + tag(jetzt) + "-" + kurz() };
    // Insulin: rezept_id statt gutschein_id (Schema v1.1, Festlegung); kein Haushaltsbezug
    if (rezept) buchung.rezept_id = rezept.rezept_id; else buchung.gutschein_id = eingabe.gutschein_id;
    buchung.ausgabestelle_id = eingabe.ausgabestelle_id; buchung.artikel_id = eingabe.artikel_id; buchung.menge = plan.zugeteilt;
    buchung.einheit = plan.einheit; buchung.zeit = jetzt; buchung.kanal = eingabe.kanal || "retail_app";
    buchung.rezept_ref = rezept ? rezept.rezept_id : null; buchung.status = "verbindlich";
    if (!rezept) buchung.haushalt_id = st.gutscheine[eingabe.gutschein_id].haushalt_id;
    buchung.einloesende_person_id = eingabe.einloesende_person_id;
    var regel = { angefragt: K.r3(plan.angefragt), grundquote: plan.grundquote, restbestand: plan.restbestand, zugeteilt: plan.zugeteilt,
      basiskontingent: plan.basiskontingent, quote_art: plan.quote_art, formel: "zugeteilt = min(angefragt, grundquote, restbestand)" };
    evs.push(K.huelle("REDEMPTION_POSTED", QUELLE, { ausgabebuchung: buchung, regel: regel }, jetzt));
    return { ok: true, plan: plan, rezept: rezept, ereignisse: evs };
  }

  function erzeugeWareneingang(st, eingabe, jetzt) {
    jetzt = jetzt || K.zeitBerlin();
    var art = st.artikel[eingabe.artikel_id], ast = st.ausgabestellen[eingabe.ausgabestelle_id];
    var menge = Number(eingabe.menge);
    if (!ast) return { ok: false, fehler: "Ausgabestelle unbekannt." };
    if (!art) return { ok: false, fehler: "Artikel unbekannt." };
    if (!(menge > 0)) return { ok: false, fehler: "Menge muss größer als 0 sein." };
    if (eingabe.einheit && eingabe.einheit !== art.einheit) return { ok: false, fehler: "Einheit muss " + art.einheit + " sein (kanonische Einheit)." };
    if (art.abgabekanal === "apotheke" && ast.typ !== "pharmacy") return { ok: false, fehler: art.bezeichnung_de + " wird nur in Apotheken geführt." };
    if (art.abgabekanal === "einzelhandel" && ast.abgabekanal !== "einzelhandel") return { ok: false, fehler: art.bezeichnung_de + " wird hier nicht geführt." };
    if (!st.bestand[K.bestandId(ast.ausgabestelle_id, art.artikel_id)]) return { ok: false, fehler: "Noch kein Anfangsbestand für " + art.bezeichnung_de + "." };
    var we = { wareneingang_id: "FA-W-" + tag(jetzt) + "-" + kurz(), ausgabestelle_id: ast.ausgabestelle_id, artikel_id: art.artikel_id,
      menge: K.r3(menge), einheit: art.einheit, zeit: jetzt,
      lieferhinweis: eingabe.lieferhinweis ? String(eingabe.lieferhinweis).slice(0, 200) : null, status: "verbindlich" };
    return { ok: true, ereignisse: [K.huelle("STOCK_RECEIPT_POSTED", QUELLE, { wareneingang: we }, jetzt)] };
  }

  // Mehrere Ereignisse prüfen und nur gemeinsam übernehmen
  function wendeAlleAn(st, schema, evs) {
    var neu = st;
    for (var i = 0; i < evs.length; i++) {
      var fe = schema ? K.pruefeSchema(schema, evs[i]) : [];
      if (fe.length) return { ok: false, fehler: "Schema: " + fe[0], zustand: st };
      var r = K.wendeAn(neu, evs[i]);
      if (!r.ok) return { ok: false, fehler: r.fehler, zustand: st };
      neu = r.zustand;
    }
    return { ok: true, zustand: neu };
  }

  // Bestandskorrektur (Inventur, Bruch/Verderb, Schwund, Fehlbuchung) oder Startbestand: STOCK_ADJUSTED, Quelle retail_app (Schema v1.1)
  var KORREKTUR_ANLAESSE = ["anfangsbestand", "inventur", "korrektur", "sonstige"];
  function erzeugeBestandskorrektur(st, eingabe, jetzt) {
    jetzt = jetzt || K.zeitBerlin();
    var art = st.artikel[eingabe.artikel_id], ast = st.ausgabestellen[eingabe.ausgabestelle_id];
    var menge = Number(eingabe.menge_neu), anlass = eingabe.anlass || "korrektur";
    var begr = String(eingabe.begruendung || "").trim().slice(0, 200);
    if (!ast) return { ok: false, fehler: "Ausgabestelle unbekannt." };
    if (!art) return { ok: false, fehler: "Artikel unbekannt." };
    if (KORREKTUR_ANLAESSE.indexOf(anlass) < 0) return { ok: false, fehler: "Anlass unbekannt." };
    if (!(menge >= 0) || !isFinite(menge)) return { ok: false, fehler: "Menge darf nicht negativ sein." };
    if (begr.length < 3) return { ok: false, fehler: "Begründung fehlt." };
    if (art.abgabekanal === "apotheke" && ast.typ !== "pharmacy") return { ok: false, fehler: art.bezeichnung_de + " wird nur in Apotheken geführt." };
    if (art.abgabekanal === "einzelhandel" && ast.abgabekanal !== "einzelhandel") return { ok: false, fehler: art.bezeichnung_de + " wird hier nicht geführt." };
    var vorh = st.bestand[K.bestandId(ast.ausgabestelle_id, art.artikel_id)];
    if (anlass === "anfangsbestand" && vorh) return { ok: false, fehler: "Anfangsbestand ist bereits gesetzt." };
    if (anlass !== "anfangsbestand" && !vorh) return { ok: false, fehler: "Noch kein Anfangsbestand für " + art.bezeichnung_de + "." };
    var p = { ausgabestelle_id: ast.ausgabestelle_id, artikel_id: art.artikel_id, menge_neu: K.r3(menge), einheit: art.einheit,
      begruendung: begr, anlass: anlass, stand: jetzt };
    return { ok: true, ereignisse: [K.huelle("STOCK_ADJUSTED", QUELLE, p, jetzt)] };
  }

  // Storno einer eigenen Ausgabebuchung: REDEMPTION_REVERSED (Gutschein-/Rezeptrest und Bestand zurück)
  function erzeugeStorno(st, eingabe, jetzt) {
    jetzt = jetzt || K.zeitBerlin();
    var b = st.buchungen[eingabe.buchung_id], begr = String(eingabe.begruendung || "").trim().slice(0, 200);
    if (!b) return { ok: false, fehler: "Buchung unbekannt." };
    if (b.status === "storniert") return { ok: false, fehler: "Buchung bereits storniert." };
    if (eingabe.ausgabestelle_id && b.ausgabestelle_id !== eingabe.ausgabestelle_id) return { ok: false, fehler: "Buchung gehört zu einer anderen Ausgabestelle." };
    if (begr.length < 3) return { ok: false, fehler: "Storno ohne Begründung." };
    return { ok: true, ereignisse: [K.huelle("REDEMPTION_REVERSED", QUELLE, { buchung_id: b.buchung_id, begruendung: begr }, jetzt)] };
  }

  // Tagesjournal einer Ausgabestelle aus eigenen Ereignissen, neutral (ohne Ereignisnamen) für die Oberfläche
  function journal(st, ereignisse, ausgabestelleId) {
    var storno = {}, liste = [];
    ereignisse.forEach(function (e) { if (e.typ === "REDEMPTION_REVERSED") storno[e.payload.buchung_id] = e.payload.begruendung; });
    ereignisse.forEach(function (e) {
      var p = e.payload || {};
      if (e.typ === "REDEMPTION_POSTED" && p.ausgabebuchung.ausgabestelle_id === ausgabestelleId) {
        var b = p.ausgabebuchung;
        liste.push({ art: b.rezept_id ? "rezept" : (b.kanal === "papier_abgleich" ? "karte" : "ausgabe"), zeit: b.zeit, artikel_id: b.artikel_id,
          menge: b.menge, einheit: b.einheit, buchung_id: b.buchung_id, gutschein_id: b.gutschein_id || null,
          storniert: storno[b.buchung_id] !== undefined, storno_grund: storno[b.buchung_id] || null });
      } else if (e.typ === "STOCK_RECEIPT_POSTED" && p.wareneingang.ausgabestelle_id === ausgabestelleId) {
        var w = p.wareneingang;
        liste.push({ art: "wareneingang", zeit: w.zeit, artikel_id: w.artikel_id, menge: w.menge, einheit: w.einheit, hinweis: w.lieferhinweis || null });
      } else if (e.typ === "STOCK_ADJUSTED" && p.ausgabestelle_id === ausgabestelleId) {
        liste.push({ art: p.anlass === "anfangsbestand" ? "startbestand" : "korrektur", zeit: p.stand || e.zeit_ereignis, artikel_id: p.artikel_id,
          menge: p.menge_neu, einheit: p.einheit, hinweis: p.begruendung });
      }
    });
    return liste.sort(function (a, b) { return Date.parse(b.zeit) - Date.parse(a.zeit); });
  }

  // Eigene, noch nicht übertragene Ereignisse (für Export in den gemeinsamen Log über die CLI)
  function eigeneEreignisse(ereignisse) { return ereignisse.filter(function (e) { return e.quelle_system === QUELLE; }); }

  return { QUELLE: QUELLE, REZEPT_FELDER: REZEPT_FELDER, erzeugeEinloesung: erzeugeEinloesung,
    erzeugeWareneingang: erzeugeWareneingang, wendeAlleAn: wendeAlleAn, datenminimal: datenminimal,
    erzeugeBestandskorrektur: erzeugeBestandskorrektur, erzeugeStorno: erzeugeStorno, journal: journal, eigeneEreignisse: eigeneEreignisse,
    KORREKTUR_ANLAESSE: KORREKTUR_ANLAESSE };
});
