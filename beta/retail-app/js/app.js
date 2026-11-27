/* FoodAllo Ausgabe (Retail App, Beta) – Oberfläche für das Verkaufspersonal.
   Fachlogik: gemeinsamer Kern ../kern/foodallo_kern.js (FAKern) und js/retail.js (FARetail), Ereignisse nach verbindlichem Schema v1.1.
   Interne Kennungen (Gutschein-, Personen-, Buchungsnummern, Ereignisarten) bleiben intern und werden nie angezeigt. */
(function () {
  "use strict";
  var K = window.FAKern, R = window.FARetail;
  var SPEICHER = "foodallo.retail.ereignisse.v1";
  var EXPORTIERT = "foodallo.retail.exportiert.v1";
  var SCHICHT = "foodallo.retail.schicht.v2";
  var NAMEN = "foodallo.retail.einwohner.v1";
  var ABGLEICH = "foodallo.retail.abgleich.v1";
  var SCHEMA_DATEI = "../schema/foodallo-core.schema.v1.2.json";   // verbindliches Prüfschema v1.2
  var LOG_DATEI = "../data/ereignislog.jsonl";
  var REGISTER_DATEI = "../data/melderegister/melderegister_musterstadt.json";   // fiktives Melderegister (nur lesen)
  var ZUORDNUNG_DATEI = "daten/melderegister-zuordnung.json";                 // Export der Desktop-Zuordnung (Herkunft in der Datei)

  var stamm = null, seedGutscheine = [], personenSeed = [], schema = null, testRezepte = [], ereignisse = [], zustand = null;
  var schicht = null, wahl = { ast: null, kasse: null }, namen = {};
  var vorgang = null, rezeptVorgang = null, wePositionen = [], weArtikel = null, korrektur = null, stornoBuchung = null, journalAlle = false;
  var kameraStrom = null, kameraZiel = null;

  /* ---------- Texte ---------- */
  var EINHEIT = { kg: "kg", L: "Liter", rolle: "Rollen", IE: "Einheiten", pack: "Packungen" };
  var EINHEIT_1 = { rolle: "Rolle", pack: "Packung", IE: "Einheit" };
  var SCHRITT = { kg: 0.5, L: 0.5, rolle: 1, IE: 100, pack: 1 };
  var TYP = { supermarket: "Supermarkt", convenience: "Lebensmittelgeschäft", pharmacy: "Apotheke" };
  var WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  var KORREKTUR_GRUENDE = [
    { anlass: "inventur", text: "Inventur – nachgezählt" },
    { anlass: "korrektur", text: "Bruch oder Verderb" },
    { anlass: "korrektur", text: "Schwund oder Diebstahl" },
    { anlass: "korrektur", text: "Fehlbuchung berichtigen" },
    { anlass: "sonstige", text: "Sonstiges" }
  ];
  var STORNO_GRUENDE = ["Falsche Menge gebucht", "Falscher Artikel gebucht", "Ware zurückgegeben", "Falscher Gutschein oder falsche Person"];

  var M = {
    leer: ["Bitte Code scannen oder Nummer eintippen.", "Der Code steht in der App der Kundin oder des Kunden unter „Gutschein für Ihren Haushalt“ (Ihre Gutscheinnummer)."],
    karteLeer: ["Bitte Kartennummer eintippen oder Strichcode scannen.", "Die Nummer steht unten auf der Lebensmittelkarte."],
    nichtGefunden: ["Gutschein nicht gefunden.", "Nummer prüfen oder Code erneut scannen. Bleibt es dabei, die Kundin oder den Kunden an die Pass- und Meldebehörde der Musterstadt verweisen."],
    karteNichtGefunden: ["Lebensmittelkarte nicht gefunden.", "Kartennummer prüfen und erneut eintippen. Bleibt es dabei, an die Pass- und Meldebehörde der Musterstadt verweisen."],
    karteMehrdeutig: ["Diese Lebensmittelkarte ist nicht eindeutig zugeordnet.", "Bitte keine Ware ausgeben und an die Pass- und Meldebehörde der Musterstadt verweisen."],
    mehrdeutig: ["Die Nummer passt zu mehreren Gutscheinen.", "Bitte den Code scannen oder die vollständige Nummer eintippen."],
    eingeloest: ["Gutschein bereits vollständig eingelöst.", "Diese Woche ist keine weitere Ausgabe möglich. Der nächste Gutschein gilt ab Montag."],
    gesperrt: ["Dieser Gutschein ist storniert und nicht mehr gültig.", "Bitte keine Ware ausgeben. Die Kundin oder den Kunden an die Pass- und Meldebehörde der Musterstadt verweisen."],
    rezeptStattGutschein: ["Das ist ein Rezeptnachweis, kein Gutschein.", "Insulin gibt es nur in der Apotheke. Bitte die Kundin oder den Kunden dorthin verweisen."],
    nichtImHaushalt: ["Diese Person gehört nicht zum Haushalt – bitte Ausweis prüfen.", "Abholen dürfen nur Personen aus dem Haushalt. Andere Personen brauchen einen eigenen Gutschein."],
    nichtBestaetigt: ["Identität dieser Person ist noch nicht bestätigt.", "Bitte keine Ware ausgeben. Die Person kann sich bei der Pass- und Meldebehörde der Musterstadt bestätigen lassen."],
    keinMitglied: ["Für diesen Haushalt ist noch niemand bestätigt.", "Bitte keine Ware ausgeben und an die Pass- und Meldebehörde der Musterstadt verweisen."],
    wasser: ["Trinkwasser ist nur während einer gemeldeten Versorgungsstörung erhältlich.", "Derzeit ist keine Störung gemeldet. Bitte kein Trinkwasser über den Gutschein ausgeben."],
    nichtsGewaehlt: ["Noch keine Menge gewählt.", "Mit + die Menge je Artikel eintragen, dann „Ausgabe buchen“ tippen."],
    allesAbgeholt: ["Für diesen Haushalt ist diese Woche nichts mehr frei.", "Keine weitere Ausgabe möglich. Der nächste Gutschein gilt ab Montag."],
    nichtsVorraetig: ["Gerade ist nichts davon vorrätig.", "Bitte Wareneingang buchen oder die Kundin bzw. den Kunden an eine andere Ausgabestelle verweisen."],
    rezeptLeer: ["Bitte Rezeptnachweis scannen.", "Der Code steht auf dem Rezeptnachweis, den die Kundin oder der Kunde mitbringt."],
    rezeptUngueltig: ["Rezeptnachweis ist nicht gültig.", "Bitte erneut scannen. Bleibt es dabei, kein Insulin abgeben und an die Arztpraxis verweisen."],
    rezeptBeliefert: ["Rezept wurde bereits vollständig beliefert.", "Kein weiteres Insulin auf dieses Rezept. Für mehr ist ein neues Rezept nötig."],
    rezeptPerson: ["Insulin nur an die Person, auf die das Rezept ausgestellt ist.", "Bitte Ausweis prüfen. Abholung durch andere Personen ist nicht möglich."],
    ausweisFehlt: ["Bitte zuerst den Ausweis prüfen.", "Haken setzen, wenn die abholende Person die Rezeptinhaberin bzw. der Rezeptinhaber ist."],
    insulinKeinBestand: ["Insulin ist gerade nicht vorrätig.", "Bitte Wareneingang buchen oder an eine andere Apotheke verweisen."],
    lieferschein: ["Bitte Lieferscheinnummer eintragen.", "Sie steht oben auf dem Lieferschein."],
    keinePosition: ["Noch keine Position erfasst.", "Artikel antippen, gelieferte Menge eintragen und „Position übernehmen“ tippen."],
    mengeFehlt: ["Bitte eine Menge größer als 0 eintragen.", "Mit + oder über die Tastatur eintragen."],
    sonstigesNotiz: ["Bitte eine Bemerkung eintragen.", "Bei „Sonstiges“ kurz notieren, warum korrigiert wird."],
    grundFehlt: ["Bitte einen Grund wählen.", "Den passenden Grund antippen, dann erneut buchen."],
    offline: ["Abgleich gerade nicht möglich.", "Die Daten für den Abgleich sind nicht erreichbar. Buchungen bleiben auf dem Gerät gespeichert. Später erneut abgleichen."],
    nurZusatz: ["Trinkwasser gibt es nur mit dem Zusatzgutschein Trinkwasser.", "Die Versorgungsstörung ist gemeldet. Bitte den Zusatzgutschein bzw. die Zusatzkarte für Trinkwasser scannen. In der App der Kundin bzw. des Kunden heißt er „Zusätzlicher Gutschein wegen einer Versorgungsstörung“."],
    zusatzVerfallen: ["Der Zusatzgutschein für Trinkwasser ist abgelaufen.", "Die Versorgungsstörung ist beendet, damit verfällt der Rest. Bitte kein Trinkwasser mehr darauf ausgeben."],
    allgemein: ["Buchung nicht möglich.", "Bitte erneut versuchen. Passiert es wieder, die Marktleitung informieren."]
  };

  /* Meldungen aus dem Kern in verständliche Sätze mit nächstem Schritt übersetzen (Rohtext wird nie angezeigt). */
  function uebersetze(f) {
    f = String(f || "");
    var t = [
      [/Basiskontingent.*offen/, ["Für diesen Artikel ist diese Woche noch keine Menge freigegeben.", "Bitte später erneut versuchen."]],
      [/Anfangsbestand/, ["Für diesen Artikel ist noch kein Bestand erfasst.", "Unter „Bestand“ den Startbestand eintragen, dann erneut buchen."]],
      [/^zusatz$/, M.nurZusatz],
      [/verfallen|beendet/, M.zusatzVerfallen],
      [/Versorgungsstörung|Störung|nur_bei_stoerung/, M.wasser],
      [/nicht als bestätigtes Mitglied|nicht bestätigtes Haushaltsmitglied/, M.nichtImHaushalt],
      [/Person.*nicht.*bestätigt/, M.nichtBestaetigt],
      [/Rezeptinhaber/, M.rezeptPerson],
      [/vollständig beliefert|übersteigt Rezeptrest/, M.rezeptBeliefert],
      [/noch nicht gültig/, ["Rezept ist noch nicht gültig.", "Bitte am angegebenen Datum wiederkommen lassen."]],
      [/Rezept.*abgelaufen|zum Buchungszeitpunkt nicht gültig/, ["Rezept ist abgelaufen.", "Kein Insulin abgeben. Die Kundin oder der Kunde braucht ein neues Rezept."]],
      [/Rezeptnachweis|Prüfsumme|Rezept-ID|Verordnete Menge|Gültigkeitszeitraum/, M.rezeptUngueltig],
      [/Rezeptpflichtig/, ["Insulin nur gegen Rezeptnachweis.", "Bitte den Rezeptnachweis scannen."]],
      [/Apotheke/, ["Dieser Artikel wird nur in der Apotheke abgegeben.", "Bitte die Kundin oder den Kunden an eine Apotheke verweisen."]],
      [/hier nicht (abgegeben|geführt)/, ["Dieser Artikel wird hier nicht geführt.", "Bitte einen anderen Artikel wählen."]],
      [/Gutschein ist storniert/, M.gesperrt],
      [/abgelaufen|Periode.*geschlossen/, ["Gutschein ist abgelaufen.", "Keine Ausgabe auf diesen Gutschein. Für die laufende Woche gibt es einen neuen Gutschein."]],
      [/Gutschein.*unbekannt/, M.nichtGefunden],
      [/Grundquote.*ausgeschöpft|übersteigt Gutscheinrest/, M.allesAbgeholt],
      [/Restbestand/, ["Nicht genug im Bestand.", "Menge verringern oder Wareneingang buchen."]],
      [/keine Position|Position fehlt/, ["Dieser Artikel ist auf dem Gutschein nicht enthalten.", "Nur die angezeigten Artikel ausgeben."]],
      [/Einheit/, ["Falsche Einheit.", "Menge in der angezeigten Einheit eintragen."]],
      [/bereits storniert/, ["Diese Buchung wurde schon storniert.", "Nichts weiter zu tun."]],
      [/Menge/, M.mengeFehlt],
      [/anderen Ausgabestelle/, ["Diese Buchung gehört zu einer anderen Ausgabestelle.", "Stornieren nur dort, wo gebucht wurde."]],
      [/Begründung/, M.grundFehlt],
      [/Papierkarte.*mehreren/, M.karteMehrdeutig],
      [/Papierkarte/, M.karteNichtGefunden]
    ];
    for (var i = 0; i < t.length; i++) if (t[i][0].test(f)) return t[i][1];
    return M.allgemein;
  }

  /* ---------- Hilfen ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function zahl(x) { return Number(x).toLocaleString("de-DE", { maximumFractionDigits: 3 }); }
  function einheit(e, n) { return (n === 1 && EINHEIT_1[e]) || EINHEIT[e] || ""; }
  function menge(x, e) { return zahl(x) + " " + einheit(e, Number(x)); }
  function zahlEin(v) { var n = parseFloat(String(v || "").replace(",", ".")); return isFinite(n) ? n : 0; }
  function datum(d) { return WOCHENTAG[d.getDay()] + ", " + ("0" + d.getDate()).slice(-2) + "." + ("0" + (d.getMonth() + 1)).slice(-2) + "."; }
  function uhrzeit(z) { var d = new Date(z); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function datumLang(z) { return new Date(z).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); }
  function heute(z) { return new Date(z).toDateString() === new Date().toDateString(); }
  function zeitText(z) { return (heute(z) ? "heute" : datumLang(z)) + ", " + uhrzeit(z) + " Uhr"; }
  function kurzNr(id) { return String(id || "").replace(/[^0-9A-Za-z]/g, "").slice(-6); }
  function belegNr(bid) { return String(bid || "").slice(-4).toUpperCase(); }
  function art(id) { return zustand.artikel[id]; }
  function ast() { return zustand.ausgabestellen[schicht.ast]; }
  function istApotheke() { return ast().typ === "pharmacy"; }
  function passt(a) { var s = ast(); return a.abgabekanal === "beide" || a.abgabekanal === s.abgabekanal; }
  function adresse(a) { return K.formatiereOrt(a); }
  function stellenName(a) { return K.anzeigeNameEindeutig(a, (stamm && stamm.ausgabestellen) || []); }
  function bestand(artikelId) { return zustand.bestand[K.bestandId(schicht.ast, artikelId)] || null; }
  function insulinArtikel() { var ks = Object.keys(zustand.artikel).filter(function (k) { return zustand.artikel[k].rezeptpflicht; }); return ks.length ? zustand.artikel[ks[0]] : null; }
  function istZusatz(g) { return K.gutscheinAnlass(g) === "stoerung"; }
  function gutscheinWort(g) { return vorgang && vorgang.modus === "karte" ? (istZusatz(g) ? "Lebensmittelkarte Trinkwasser" : "Lebensmittelkarte") : (istZusatz(g) ? "Zusatzgutschein Trinkwasser" : "Gutschein"); }

  function meldung(id, m, artTxt) {
    var el = $(id);
    if (!m) { el.innerHTML = ""; el.className = "meldung"; return; }
    el.className = "meldung " + (artTxt || "fehler");
    el.innerHTML = "<strong>" + esc(m[0]) + "</strong>" + (m[1] ? "<span>" + esc(m[1]) + "</span>" : "");
  }

  /* Wochenzeitraum des Gutscheins (Montag bis Sonntag) aus der Periode */
  function zeitraum(g) {
    var m = /(\d{4})(\d{2})(\d{2})$/.exec(g.periode_id || "");
    if (!m) return null;
    var von = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0), bis = new Date(von.getTime());
    bis.setDate(bis.getDate() + 6); bis.setHours(23, 59, 59);
    return { von: von, bis: bis };
  }

  /* ---------- Speicher / Ereignisse ---------- */
  function ladeJson(k, d) { try { return JSON.parse(localStorage.getItem(k) || "") || d; } catch (e) { return d; } }
  function speichere() { localStorage.setItem(SPEICHER, JSON.stringify(ereignisse)); }
  function neuBerechnen() { zustand = K.nachspielen(stamm, seedGutscheine, personenSeed, ereignisse, { v12: true }).zustand; }

  /* Ereignisse prüfen (Schema v1.2 + Kernregeln) und nur gemeinsam übernehmen – alles oder nichts */
  function uebernimmAlle(evs, ohneSpeichern) {
    var neu = evs.filter(function (e) { return !zustand.angewendet[e.ereignis_id]; });
    if (!neu.length) return { ok: true, doppelt: true };
    var r = R.wendeAlleAn(zustand, schema, neu);
    if (!r.ok) return r;
    zustand = r.zustand;
    Array.prototype.push.apply(ereignisse, neu);
    if (!ohneSpeichern) speichere();
    return { ok: true };
  }

  function offeneBuchungen() {
    var exp = ladeJson(EXPORTIERT, {});
    return R.eigeneEreignisse(ereignisse).filter(function (e) { return !e.zeit_empfang && !exp[e.ereignis_id]; });
  }

  /* ---------- Personen / Melderegister ----------
     Namen kommen aus dem fiktiven Melderegister (nur lesen). Die Zuordnung Register-Eintrag -> person_id/haushalt_id
     liefert die Desktopversion (Feld person_id/haushalt_id im Eintrag oder Zuordnungsliste über die Personalausweisnummer).
     Ohne Zuordnung wird nichts erfunden: neutrale Anzeige „Name nicht hinterlegt“. */
  function mitglieder(haushaltId) {
    return Object.keys(zustand.personen).filter(function (p) { return zustand.personen[p].haushalt_id === haushaltId; }).sort();
  }
  function personName(pid, nr) {
    var n = namen[pid];
    if (n && (n.vorname || n.nachname)) return [n.vorname, n.nachname].filter(Boolean).join(" ");
    return nr ? "Person " + nr + " (Name nicht hinterlegt)" : "Rezeptinhaberin bzw. Rezeptinhaber (Name nicht hinterlegt)";
  }
  function personZusatz(pid) {
    var n = namen[pid], t = [];
    if (n && n.geburtsdatum) t.push("geb. " + datumLang(n.geburtsdatum));
    if (n && n.ausweis) t.push("Ausweis endet auf " + String(n.ausweis).slice(-4));
    return t.join(" · ");
  }
  function haushaltName(hid) {
    var zaehl = {}, best = null, ms = mitglieder(hid);
    ms.forEach(function (p) { var n = namen[p]; if (n && n.nachname) zaehl[n.nachname] = (zaehl[n.nachname] || 0) + 1; });
    Object.keys(zaehl).forEach(function (k) { if (!best || zaehl[k] > zaehl[best]) best = k; });
    if (!best) return "Haushalt (Name nicht hinterlegt)";
    return "Haushalt " + best + ", " + ms.length + (ms.length === 1 ? " Person" : " Personen");
  }
  /* Register-Einträge (Felder vorname, nachname, geburtsdatum, personalausweisnummer, optional person_id/haushalt_id)
     plus optionale Zuordnungsliste [{person_id, personalausweisnummer}] -> Namen je person_id */
  function baueNamen(eintraege, zuordnung) {
    var m = {}, nachAusweis = {};
    (eintraege || []).forEach(function (e) {
      var n = { vorname: e.vorname || e.vornamen || "", nachname: e.nachname || e.familienname || "", geburtsdatum: e.geburtsdatum || "", ausweis: e.personalausweisnummer || "" };
      if (n.ausweis) nachAusweis[String(n.ausweis)] = n;
      if (e.person_id) m[e.person_id] = n;
    });
    (zuordnung || []).forEach(function (z) { var n = z && nachAusweis[String(z.personalausweisnummer)]; if (n && z.person_id) m[z.person_id] = n; });
    return m;
  }
  function listeAus(j) { return Array.isArray(j) ? j : (j && (j.personen || j.eintraege || j.einwohner || j.zuordnung)) || []; }
  /* Datei aus den Einstellungen: JSON (Register oder Zuordnung) oder CSV mit Kopfzeile */
  function leseListe(text) {
    var t = String(text).trim();
    if (t.charAt(0) === "{" || t.charAt(0) === "[") return listeAus(JSON.parse(t));
    var zeilen = t.split(/\r?\n/).filter(function (z) { return z.trim(); }), tr = zeilen[0].indexOf(";") >= 0 ? ";" : ",";
    var kopf = zeilen[0].split(tr).map(function (s) { return s.trim().toLowerCase(); });
    return zeilen.slice(1).map(function (z) { var w = z.split(tr), o = {}; kopf.forEach(function (k, i) { o[k] = (w[i] || "").trim(); }); return o; });
  }

  /* ---------- Navigation ---------- */
  function geh(name, ohneVerlauf) {
    document.querySelectorAll(".screen").forEach(function (s) { s.hidden = s.id !== "s-" + name; });
    $("kopf").hidden = name === "schicht";
    window.scrollTo(0, 0);
    if (!ohneVerlauf) { try { history.pushState({ s: name }, ""); } catch (e) {} }
    var auf = { start: zeigeStart, wareneingang: zeigeWareneingang, bestand: zeigeBestand, journal: zeigeJournal, einstellungen: zeigeEinstellungen };
    if (auf[name]) auf[name]();
    var f = document.querySelector("#s-" + name + " .gross-eingabe");
    if (f && (name === "scan" || name === "rezept")) setTimeout(function () { f.focus(); }, 50);
    if (name !== "scan" && name !== "rezept") kameraStop();
  }

  function kopf() {
    $("k-name").textContent = stellenName(ast());
    $("k-kasse").textContent = "Kasse " + schicht.kasse;
    $("stoerung").hidden = !(!istApotheke() && K.stoerungAktiv(zustand, ast().ags, "trinkwasser", K.zeitBerlin()));
  }

  function netz() {
    var on = navigator.onLine;
    $("netz").hidden = on;
    $("netz").textContent = on ? "" : "Offline – Buchungen werden auf dem Gerät gespeichert.";
  }

  /* ---------- Schichtbeginn ---------- */
  function zeigeSchicht() {
    var aktive = stamm.ausgabestellen.filter(function (a) { return a.aktiv !== false && (a.rolle === "kern" || a.rolle === "kern_insulin"); });
    var box = $("ast-liste"); box.innerHTML = "";
    aktive.forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "wahl"; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", wahl.ast === a.ausgabestelle_id ? "true" : "false");
      b.innerHTML = "<strong>" + esc(stellenName(a)) + "</strong><span>" + esc(TYP[a.typ] || "Ausgabestelle") + " · " + esc(adresse(a)) + "</span>";
      b.addEventListener("click", function () { wahl.ast = a.ausgabestelle_id; zeigeSchicht(); });
      box.appendChild(b);
    });
    var kb = $("kasse-liste"); kb.innerHTML = "";
    for (var i = 1; i <= 6; i++) (function (n) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "kasse"; b.textContent = String(n); b.setAttribute("role", "radio"); b.setAttribute("aria-label", "Kasse " + n);
      b.setAttribute("aria-checked", wahl.kasse === n ? "true" : "false");
      b.addEventListener("click", function () { wahl.kasse = n; zeigeSchicht(); });
      kb.appendChild(b);
    })(i);
    $("schicht-start").disabled = !(wahl.ast && wahl.kasse);
  }

  function schichtBeginnen() {
    if (!(wahl.ast && wahl.kasse)) { meldung("schicht-meldung", ["Bitte Ausgabestelle und Kasse wählen.", "Beides antippen, dann „Schicht beginnen“."]); return; }
    schicht = { ast: wahl.ast, kasse: wahl.kasse, beginn: K.zeitBerlin() };
    localStorage.setItem(SCHICHT, JSON.stringify(schicht));
    kopf(); geh("start");
  }

  function schichtBeenden() {
    var offen = offeneBuchungen().length;
    if (offen && !confirm(offen + " Buchungen sind noch nicht als Datei gespeichert. Sie bleiben auf dem Gerät gespeichert. Schicht trotzdem beenden?")) return;
    localStorage.removeItem(SCHICHT); schicht = null; wahl = { ast: null, kasse: null };
    zeigeSchicht(); geh("schicht");
  }

  /* ---------- Startseite ---------- */
  function zeigeStart() {
    kopf();
    var apo = istApotheke();
    document.querySelectorAll("#s-start [data-nur]").forEach(function (b) { b.hidden = (b.dataset.nur === "apotheke") !== apo; });
  }

  /* ---------- Gutschein / Lebensmittelkarte erfassen ---------- */
  function scanStarten(modus) {
    vorgang = { modus: modus, gutschein_id: null, karte: null, person_id: null, mengen: {} };
    var karte = modus === "karte";
    $("scan-titel").textContent = karte ? "Lebensmittelkarte" : "Gutschein einlösen";
    $("scan-anleitung").textContent = karte ? "Strichcode der Lebensmittelkarte scannen oder die Kartennummer unten auf der Karte eintippen." : "Code in der App der Kundin oder des Kunden scannen oder Gutscheinnummer eintippen.";
    $("scan-label").textContent = karte ? "Kartennummer" : "Gutscheinnummer";
    $("scan-eingabe").value = ""; meldung("scan-meldung", null);
    geh("scan");
  }

  function gueltigJetzt(g) { var z = zeitraum(g), t = Date.now(); return z && z.von.getTime() <= t && t <= z.bis.getTime(); }

  function findeGutschein(eingabe) {
    var s = String(eingabe || "").trim(), gs = zustand.gutscheine;
    var voll = /FA-V-\d{8}-\d{6}/i.exec(s);
    if (voll) { var id = voll[0].toUpperCase(); return gs[id] ? { id: id } : { m: M.nichtGefunden }; }
    if (/^\d{1,6}$/.test(s)) {
      var nr = ("000000" + s).slice(-6);
      var t = Object.keys(gs).filter(function (k) { return k.slice(-6) === nr && gueltigJetzt(gs[k]); });
      if (t.length === 1) return { id: t[0] };
      return { m: t.length ? M.mehrdeutig : M.nichtGefunden };
    }
    return { m: M.nichtGefunden };
  }

  /* Papierkarte: Kartennummer, aufgedruckter Code oder Strichcode -> genau ein Gutschein (Kern gutscheinZurPapierkarte) */
  function findeKarte(eingabe) {
    var s = String(eingabe || "").trim().toUpperCase().replace(/\s+/g, "");
    if (/^\d{16}$/.test(s)) s = "FAPK" + s;
    var r = K.gutscheinZurPapierkarte(zustand, s);
    if (r.gutschein_id) return { id: r.gutschein_id, karte: s };
    if (/mehreren/.test(r.fehler || "")) return { m: M.karteMehrdeutig };
    if (/^\d{1,6}$/.test(s)) {
      var nr = ("000000" + s).slice(-6), gs = zustand.gutscheine;
      var t = Object.keys(gs).filter(function (k) { return gs[k].papierkarte_id && gs[k].papierkarte_id.slice(-6) === nr && gueltigJetzt(gs[k]); });
      if (t.length === 1) return { id: t[0], karte: gs[t[0]].papierkarte_id };
      if (t.length > 1) return { m: M.karteMehrdeutig };
    }
    return { m: M.karteNichtGefunden };
  }

  function verarbeiteScan(code) {
    var s = String(code || "").trim();
    if (!s) return meldung("scan-meldung", vorgang.modus === "karte" ? M.karteLeer : M.leer);
    if (/^FA-RXN1~/i.test(s)) return meldung("scan-meldung", M.rezeptStattGutschein);
    var r = vorgang.modus === "karte" ? findeKarte(s) : findeGutschein(s);
    if (!r.id && vorgang.modus !== "karte") { var k = findeKarte(s); if (k.id) { r = k; vorgang.modus = "karte"; } }
    if (!r.id) return meldung("scan-meldung", r.m);
    var g = zustand.gutscheine[r.id], z = zeitraum(g), jetzt = Date.now();
    if (g.status === "storniert") return meldung("scan-meldung", M.gesperrt);
    if (istZusatz(g) && K.stoerungsgutscheinVerfallen(zustand, g, K.zeitBerlin())) return meldung("scan-meldung", M.zusatzVerfallen);
    if (g.status === "abgelaufen" || zustand.perioden_geschlossen[g.periode_id] || (z && jetzt > z.bis.getTime()))
      return meldung("scan-meldung", ["Gutschein ist abgelaufen" + (z ? " (gültig bis " + datum(z.bis) + ")" : "") + ".", "Keine Ausgabe auf diesen Gutschein. Für die laufende Woche gibt es einen neuen Gutschein."]);
    if (z && jetzt < z.von.getTime()) return meldung("scan-meldung", ["Gutschein gilt erst ab " + datum(z.von) + ".", "Bitte ab diesem Tag wiederkommen lassen."]);
    var offen = g.positionen.some(function (p) { return p.rest !== null && p.rest > 0.0005; });
    if (g.status === "ausgeschoepft" || !offen) return meldung("scan-meldung", vorgang.modus === "karte" ? ["Lebensmittelkarte bereits vollständig eingelöst.", "Diese Woche ist keine weitere Ausgabe möglich. Die nächste Karte gilt ab Montag."] : M.eingeloest);
    $("scan-eingabe").value = "";
    vorgang.gutschein_id = r.id; vorgang.karte = r.karte || null;
    zeigePersonen(); geh("person");
  }

  /* ---------- Wer holt ab? ---------- */
  function zeigePersonen() {
    var g = zustand.gutscheine[vorgang.gutschein_id], z = zeitraum(g), ms = mitglieder(g.haushalt_id);
    $("person-info").innerHTML = "<strong>" + esc(haushaltName(g.haushalt_id)) + "</strong><span>" + esc(gutscheinWort(g) + (z ? " · gültig bis " + datum(z.bis) : "")) + "</span>";
    var box = $("person-liste"); box.innerHTML = ""; meldung("person-meldung", null);
    if (!ms.length) { meldung("person-meldung", M.keinMitglied); return; }
    ms.forEach(function (pid, i) {
      var p = zustand.personen[pid], b = document.createElement("button");
      b.type = "button"; b.className = "wahl person" + (p.verifiziert ? "" : " offen");
      var zus = personZusatz(pid);
      b.innerHTML = "<strong>" + esc(personName(pid, i + 1)) + "</strong><span>" + esc((zus ? zus + " · " : "") + (p.verifiziert ? "Identität bestätigt" : "Identität noch nicht bestätigt")) + "</span>";
      b.addEventListener("click", function () {
        if (!p.verifiziert) { meldung("person-meldung", M.nichtBestaetigt); return; }
        vorgang.person_id = pid; vorgang.person_nr = i + 1; vorgang.mengen = {};
        zeigeKorb(); geh("korb");
      });
      box.appendChild(b);
    });
  }

  /* ---------- Ausgabe zusammenstellen ---------- */
  function korbZeilen() {
    var g = zustand.gutscheine[vorgang.gutschein_id], jetzt = K.zeitBerlin();
    return g.positionen.filter(function (p) { return art(p.artikel_id) && passt(art(p.artikel_id)); }).map(function (p) {
      var a = art(p.artikel_id), f;
      var plan = K.planeEinloesung(zustand, { ausgabestelle_id: schicht.ast, gutschein_id: g.gutschein_id, einloesende_person_id: vorgang.person_id,
        artikel_id: a.artikel_id, angefragt: 1e9, zeit: jetzt });
      var grund = null; f = plan.fehler || "";
      if (!plan.ok) {
        var stoerung = K.stoerungAktiv(zustand, ast().ags, a.nur_bei_stoerung || "trinkwasser", jetzt);
        if (/verfallen|beendet/.test(f)) grund = "Zusatzgutschein abgelaufen";
        else if (a.nur_bei_stoerung && !istZusatz(g)) { grund = stoerung ? "Nur mit Zusatzgutschein Trinkwasser" : "Nur bei gemeldeter Versorgungsstörung"; f = stoerung ? "zusatz" : "Störung"; }
        else if (p.zugeteilt_max === 0 && !(p.eingeloest > 0)) grund = "Diese Woche nicht vorgesehen";
        else if (p.rest !== null && p.rest <= 0.0005) grund = "Diese Woche bereits abgeholt";
        else if (/Anfangsbestand/.test(f)) grund = "Nicht vorrätig – kein Bestand erfasst";
        else if (/Restbestand/.test(f)) grund = "Ausverkauft";
        else if (/offen/.test(f)) grund = "Diese Woche noch nicht freigegeben";
        else grund = uebersetze(f)[0];
      }
      return { artikel: a, frei: plan.ok ? plan.zugeteilt : 0, rest: p.rest, bestand: plan.restbestand, grund: grund, fehler: f };
    });
  }

  function zeigeKorb() {
    var g = zustand.gutscheine[vorgang.gutschein_id];
    $("korb-info").innerHTML = "<strong>" + esc(personName(vorgang.person_id, vorgang.person_nr)) + "</strong><span>" + esc(haushaltName(g.haushalt_id) + " · " + gutscheinWort(g)) + "</span>";
    var ul = $("korb-liste"); ul.innerHTML = ""; meldung("korb-meldung", null);
    var zeilen = korbZeilen(), irgendwas = false;
    zeilen.forEach(function (z) {
      var a = z.artikel, li = document.createElement("li"), m = vorgang.mengen[a.artikel_id] || 0;
      li.className = "posten" + (z.grund ? " gesperrt" : "");
      if (z.grund) {
        li.innerHTML = "<div class='p-name'><strong>" + esc(a.bezeichnung_de) + "</strong><span>" + esc(z.grund) + "</span></div>";
        li.addEventListener("click", function () { meldung("korb-meldung", uebersetze(z.fehler)); });
      } else {
        irgendwas = true;
        var begrenzt = z.bestand !== null && z.rest !== null && z.bestand < z.rest - 0.0005;
        li.innerHTML = "<div class='p-name'><strong>" + esc(a.bezeichnung_de) + "</strong><span>frei: " + esc(menge(z.frei, a.einheit)) + (begrenzt ? " (mehr nicht vorrätig)" : "") + "</span></div>" +
          "<div class='p-eingabe'><div class='stepper'><button type='button' data-d='-1' aria-label='weniger " + esc(a.bezeichnung_de) + "'>&minus;</button>" +
          "<input type='number' inputmode='decimal' min='0' step='any' value='" + (m || "") + "' placeholder='0' aria-label='Menge " + esc(a.bezeichnung_de) + " in " + esc(einheit(a.einheit)) + "'>" +
          "<button type='button' data-d='1' aria-label='mehr " + esc(a.bezeichnung_de) + "'>+</button></div><span class='p-einheit'>" + esc(einheit(a.einheit)) + "</span>" +
          "<button type='button' class='alles'>alles</button></div>";
        var inp = li.querySelector("input");
        var setze = function (v) {
          v = Math.max(0, Math.round(v * 1000) / 1000);
          if (v > z.frei + 0.0005) { v = z.frei; meldung("korb-meldung", ["Höchstens " + menge(z.frei, a.einheit) + " " + a.bezeichnung_de + " möglich.", "Mehr ist für diesen Haushalt diese Woche nicht frei oder nicht vorrätig."], "hinweis"); }
          vorgang.mengen[a.artikel_id] = v; inp.value = v ? String(v) : ""; korbKnopf();
        };
        li.querySelectorAll("[data-d]").forEach(function (b) {
          b.addEventListener("click", function () {
            var s = a.nur_bei_stoerung ? 1 : (SCHRITT[a.einheit] || 1), cur = vorgang.mengen[a.artikel_id] || 0, hoch = Number(b.dataset.d) > 0;
            setze(hoch ? (cur >= z.frei - 0.0005 ? cur + s : Math.min(z.frei, cur + s)) : Math.max(0, cur - s));
          });
        });
        inp.addEventListener("change", function () { setze(zahlEin(inp.value)); });
        li.querySelector(".alles").addEventListener("click", function () { setze(z.frei); });
      }
      ul.appendChild(li);
    });
    if (!irgendwas) {
      var abgeholt = zeilen.every(function (z) { return z.rest === null || z.rest <= 0.0005 || z.artikel.nur_bei_stoerung; });
      meldung("korb-meldung", abgeholt ? M.allesAbgeholt : M.nichtsVorraetig);
    }
    korbKnopf();
  }

  function korbKnopf() {
    var n = Object.keys(vorgang.mengen).filter(function (k) { return vorgang.mengen[k] > 0; }).length;
    $("korb-buchen").disabled = !n;
    $("korb-buchen").textContent = n ? "Ausgabe buchen (" + n + " Artikel)" : "Ausgabe buchen";
  }

  function korbBuchen() {
    var ids = Object.keys(vorgang.mengen).filter(function (k) { return vorgang.mengen[k] > 0; });
    if (!ids.length) return meldung("korb-meldung", M.nichtsGewaehlt);
    var g = zustand.gutscheine[vorgang.gutschein_id], jetzt = K.zeitBerlin(), evs = [], posten = [], karte = vorgang.modus === "karte";
    for (var i = 0; i < ids.length; i++) {
      // Papierkarte: Buchung läuft gegen genau diese Karte (retail.js löst die Karte auf, Kanal Papierabgleich)
      var ein = { ausgabestelle_id: schicht.ast, einloesende_person_id: vorgang.person_id, artikel_id: ids[i], angefragt: vorgang.mengen[ids[i]] };
      if (karte) ein.papierkarte = vorgang.karte || g.papierkarte_id; else { ein.gutschein_id = g.gutschein_id; ein.kanal = "retail_app"; }
      var r = R.erzeugeEinloesung(zustand, ein, jetzt);
      if (!r.ok) return meldung("korb-meldung", uebersetze(r.fehler));
      evs = evs.concat(r.ereignisse);
      posten.push({ artikel_id: ids[i], menge: r.plan.zugeteilt, einheit: r.plan.einheit, buchung_id: r.ereignisse[r.ereignisse.length - 1].payload.ausgabebuchung.buchung_id });
    }
    var u = uebernimmAlle(evs);
    if (!u.ok) return meldung("korb-meldung", uebersetze(u.fehler));
    var gn = zustand.gutscheine[g.gutschein_id];
    // Restmengen wie im Ausgabe-Bildschirm: Trinkwasser nur über den Zusatzgutschein und nur während der gemeldeten Störung (Kern 1.8.0)
    var wasserFrei = K.stoerungAktiv(zustand, ast().ags, "trinkwasser", K.zeitBerlin());
    var rest = gn.positionen.filter(function (p) { return p.rest > 0.0005 && art(p.artikel_id) && passt(art(p.artikel_id)) && (istZusatz(gn) ? wasserFrei : !art(p.artikel_id).nur_bei_stoerung); })
      .map(function (p) { return menge(p.rest, art(p.artikel_id).einheit) + " " + art(p.artikel_id).bezeichnung_de; });
    zeigeBeleg({
      titel: "Ausgabe gebucht", zeit: jetzt, posten: posten,
      zeilen: [["Abgeholt von", personName(vorgang.person_id, vorgang.person_nr)], ["Haushalt", haushaltName(gn.haushalt_id).replace(/^Haushalt /, "")],
        [gutscheinWort(gn), "Nr. " + kurzNr(karte ? gn.papierkarte_id : gn.gutschein_id)],
        ["Beleg", belegNr(posten[0].buchung_id)]],
      fuss: rest.length ? "Diese Woche noch frei: " + rest.join(", ") + "." : "Für diese Woche ist alles abgeholt.",
      hinweis: karte ? "Bitte die ausgegebenen Mengen auf der Lebensmittelkarte abzeichnen." : null,
      weiter: ["Nächste Kundin / nächster Kunde", function () { scanStarten(karte ? "karte" : "gutschein"); }]
    });
  }

  /* ---------- Beleg ---------- */
  function zeigeBeleg(b) {
    var a = ast();
    var html = "<div class='beleg-kopf'><img src='icons/logo-dunkel-900.png' alt='FoodAllo' width='180' height='39'>" +
      "<p><strong>" + esc(stellenName(a)) + "</strong><br>" + esc(adresse(a)) + "<br>Kasse " + esc(schicht.kasse) + " · " + esc(datumLang(b.zeit)) + ", " + esc(uhrzeit(b.zeit)) + " Uhr</p></div>" +
      "<h1 class='beleg-titel'><span class='haken-ok' aria-hidden='true'>&#10003;</span> " + esc(b.titel) + "</h1><ul class='beleg-posten'>" +
      b.posten.map(function (p) { return "<li><span>" + esc(art(p.artikel_id).bezeichnung_de) + "</span><strong>" + esc((p.plus ? "+" : "") + menge(p.menge, p.einheit)) + "</strong></li>"; }).join("") + "</ul>" +
      "<dl class='beleg-daten'>" + (b.zeilen || []).map(function (z) { return "<dt>" + esc(z[0]) + "</dt><dd>" + esc(z[1]) + "</dd>"; }).join("") + "</dl>" +
      (b.fuss ? "<p class='beleg-fuss'>" + esc(b.fuss) + "</p>" : "") + (b.hinweis ? "<p class='beleg-hinweis'>" + esc(b.hinweis) + "</p>" : "");
    $("beleg").innerHTML = html;
    $("beleg-weiter").textContent = b.weiter[0];
    $("beleg-weiter").onclick = b.weiter[1];
    geh("beleg");
  }

  /* ---------- Insulin auf Rezept ---------- */
  function rezeptStarten() {
    rezeptVorgang = null; $("rezept-eingabe").value = ""; $("rezept-ergebnis").hidden = true; $("rezept-ausweis").checked = false;
    meldung("rezept-meldung", null); geh("rezept");
  }

  function rezeptPruefen(token) {
    token = String(token || "").trim();
    $("rezept-ergebnis").hidden = true; rezeptVorgang = null;
    if (!token) return meldung("rezept-meldung", M.rezeptLeer);
    var pr = K.pruefeRezeptnachweis(token, K.zeitBerlin());
    if (!pr.ok) {
      var m = /abgelaufen \(bis ([^)]+)\)/.exec(pr.fehler || ""), v = /noch nicht gültig \(ab ([^)]+)\)/.exec(pr.fehler || "");
      if (m) return meldung("rezept-meldung", ["Rezept ist abgelaufen (gültig bis " + datumLang(m[1]) + ").", "Kein Insulin abgeben. Die Kundin oder der Kunde braucht ein neues Rezept."]);
      if (v) return meldung("rezept-meldung", ["Rezept gilt erst ab " + datumLang(v[1]) + ".", "Bitte ab diesem Tag wiederkommen lassen."]);
      return meldung("rezept-meldung", M.rezeptUngueltig);
    }
    var r = pr.rezept, ins = insulinArtikel(), rest = K.rezeptRest(zustand, r), b = bestand(ins.artikel_id);
    if (!K.personBestaetigt(zustand, r.person_id)) return meldung("rezept-meldung", ["Identität der Rezeptinhaberin bzw. des Rezeptinhabers ist noch nicht bestätigt.", "Bitte kein Insulin abgeben. Die Person kann sich bei der Pass- und Meldebehörde der Musterstadt bestätigen lassen."]);
    if (rest <= 0) return meldung("rezept-meldung", M.rezeptBeliefert);
    meldung("rezept-meldung", null);
    $("rezept-eingabe").value = "";
    rezeptVorgang = { token: token, rezept: r, rest: rest };
    var zus = personZusatz(r.person_id);
    $("rezept-karte").innerHTML = "<p class='ok-zeile'>&#10003; Rezept gültig bis " + esc(datumLang(r.gueltig_bis)) + "</p><dl class='beleg-daten'>" +
      "<dt>Für</dt><dd>" + esc(personName(r.person_id) + (zus ? " (" + zus + ")" : "")) + "</dd>" +
      "<dt>Verordnet</dt><dd>" + esc(menge(r.menge, r.einheit)) + "</dd>" +
      "<dt>Noch offen</dt><dd><strong>" + esc(menge(rest, r.einheit)) + "</strong></dd>" +
      "<dt>Im Bestand</dt><dd>" + esc(b ? menge(b.menge, b.einheit) : "nicht erfasst") + "</dd></dl>";
    if (!b || b.menge <= 0) meldung("rezept-meldung", M.insulinKeinBestand);
    $("rezept-menge").value = String(Math.max(0, Math.min(rest, b ? b.menge : 0)));
    $("rezept-ausweis").checked = false;
    $("rezept-ergebnis").hidden = false;
    rezeptKnopf();
  }

  function rezeptKnopf() { $("rezept-buchen").disabled = !(rezeptVorgang && zahlEin($("rezept-menge").value) > 0); }

  function rezeptBuchen() {
    if (!rezeptVorgang) return meldung("rezept-meldung", M.rezeptLeer);
    if (!$("rezept-ausweis").checked) return meldung("rezept-meldung", M.ausweisFehlt);
    var mng = zahlEin($("rezept-menge").value);
    if (!(mng > 0)) return meldung("rezept-meldung", M.mengeFehlt);
    var ins = insulinArtikel(), jetzt = K.zeitBerlin(), r = rezeptVorgang.rezept;
    var e = R.erzeugeEinloesung(zustand, { ausgabestelle_id: schicht.ast, einloesende_person_id: r.person_id, artikel_id: ins.artikel_id,
      angefragt: mng, rezeptnachweis: rezeptVorgang.token }, jetzt);
    if (!e.ok) return meldung("rezept-meldung", uebersetze(e.fehler));
    var u = uebernimmAlle(e.ereignisse);
    if (!u.ok) return meldung("rezept-meldung", uebersetze(u.fehler));
    var bu = e.ereignisse[e.ereignisse.length - 1].payload.ausgabebuchung, rest = zustand.rezepte[r.rezept_id].rest;
    zeigeBeleg({ titel: "Abgabe gebucht", zeit: jetzt, posten: [{ artikel_id: ins.artikel_id, menge: bu.menge, einheit: bu.einheit }],
      zeilen: [["Abgegeben an", personName(r.person_id)], ["Rezept gültig bis", datumLang(r.gueltig_bis)], ["Beleg", belegNr(bu.buchung_id)]],
      fuss: rest > 0 ? "Auf dieses Rezept noch offen: " + menge(rest, bu.einheit) + "." : "Rezept ist damit vollständig beliefert.",
      hinweis: bu.menge < mng ? "Abgegeben wurde weniger als gewünscht, weil nicht mehr offen oder vorrätig war." : null,
      weiter: ["Nächste Kundin / nächster Kunde", rezeptStarten] });
  }

  /* ---------- Wareneingang ---------- */
  function zeigeWareneingang() {
    var box = $("we-artikel"); box.innerHTML = "";
    Object.keys(zustand.artikel).map(art).filter(passt).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "artikel-knopf"; b.setAttribute("aria-pressed", weArtikel === a.artikel_id ? "true" : "false");
      b.innerHTML = esc(a.bezeichnung_de) + "<small>" + esc(einheit(a.einheit)) + "</small>";
      b.addEventListener("click", function () { weArtikel = a.artikel_id; $("we-menge").value = ""; meldung("we-meldung", null); zeigeWareneingang(); $("we-menge").focus(); });
      box.appendChild(b);
    });
    $("we-eingabe").hidden = !weArtikel;
    if (weArtikel) {
      $("we-menge-label").textContent = "Gelieferte Menge " + art(weArtikel).bezeichnung_de + " (" + einheit(art(weArtikel).einheit) + ")";
      $("we-menge").step = String(SCHRITT[art(weArtikel).einheit] || 1);
    }
    var ul = $("we-positionen"); ul.innerHTML = "";
    wePositionen.forEach(function (p, i) {
      var li = document.createElement("li");
      li.innerHTML = "<span>" + esc(art(p.artikel_id).bezeichnung_de) + "</span><strong>+" + esc(menge(p.menge, art(p.artikel_id).einheit)) + "</strong><button type='button' aria-label='Position entfernen'>&times;</button>";
      li.querySelector("button").addEventListener("click", function () { wePositionen.splice(i, 1); zeigeWareneingang(); });
      ul.appendChild(li);
    });
    $("we-buchen").disabled = !wePositionen.length;
    $("we-buchen").textContent = wePositionen.length ? "Wareneingang buchen (" + wePositionen.length + (wePositionen.length === 1 ? " Position)" : " Positionen)") : "Wareneingang buchen";
  }

  function wePositionHinzu() {
    var m = zahlEin($("we-menge").value);
    if (!weArtikel) return;
    if (!(m > 0)) return meldung("we-meldung", M.mengeFehlt);
    if (!bestand(weArtikel)) return meldung("we-meldung", ["Für " + art(weArtikel).bezeichnung_de + " ist noch kein Bestand erfasst.", "Zuerst unter „Bestand“ den Startbestand eintragen, dann die Lieferung buchen."]);
    var vorh = wePositionen.filter(function (p) { return p.artikel_id === weArtikel; })[0];
    if (vorh) vorh.menge = Math.round((vorh.menge + m) * 1000) / 1000; else wePositionen.push({ artikel_id: weArtikel, menge: m });
    weArtikel = null; meldung("we-meldung", null); zeigeWareneingang();
  }

  function weBuchen() {
    var ls = $("we-lieferschein").value.trim(), lf = $("we-lieferant").value.trim();
    if (!ls) { meldung("we-meldung", M.lieferschein); $("we-lieferschein").focus(); return; }
    if (!wePositionen.length) return meldung("we-meldung", M.keinePosition);
    var jetzt = K.zeitBerlin(), evs = [], vorher = {};
    var hinweis = ("Lieferschein " + ls + (lf ? " · " + lf : "")).slice(0, 200);
    for (var i = 0; i < wePositionen.length; i++) {
      var p = wePositionen[i]; vorher[p.artikel_id] = bestand(p.artikel_id).menge;
      var r = R.erzeugeWareneingang(zustand, { ausgabestelle_id: schicht.ast, artikel_id: p.artikel_id, menge: p.menge, einheit: art(p.artikel_id).einheit, lieferhinweis: hinweis }, jetzt);
      if (!r.ok) return meldung("we-meldung", uebersetze(r.fehler));
      evs = evs.concat(r.ereignisse);
    }
    var u = uebernimmAlle(evs);
    if (!u.ok) return meldung("we-meldung", uebersetze(u.fehler));
    var posten = wePositionen.map(function (p) { return { artikel_id: p.artikel_id, menge: p.menge, einheit: art(p.artikel_id).einheit, plus: true }; });
    var neu = wePositionen.map(function (p) { var e = art(p.artikel_id).einheit; return art(p.artikel_id).bezeichnung_de + " " + menge(vorher[p.artikel_id], e) + " → " + menge(bestand(p.artikel_id).menge, e); });
    wePositionen = []; weArtikel = null; $("we-lieferschein").value = ""; $("we-lieferant").value = ""; meldung("we-meldung", null);
    zeigeBeleg({ titel: "Wareneingang gebucht", zeit: jetzt, posten: posten,
      zeilen: [["Lieferschein", ls]].concat(lf ? [["Lieferant", lf]] : []), fuss: "Bestand jetzt: " + neu.join(", ") + ".",
      weiter: ["Weitere Lieferung erfassen", function () { geh("wareneingang"); }] });
  }

  /* ---------- Bestand ---------- */
  function zeigeBestand() {
    var ul = $("bestand-liste"); ul.innerHTML = "";
    Object.keys(zustand.artikel).map(art).filter(passt).forEach(function (a) {
      var b = bestand(a.artikel_id), li = document.createElement("li");
      li.className = "b-zeile" + (b && b.menge <= 0 ? " leer" : "");
      if (b) {
        li.innerHTML = "<div class='b-text'><strong>" + esc(a.bezeichnung_de) + "</strong><span>Stand: " + esc(zeitText(b.stand)) + "</span></div><div class='b-menge'>" + esc(menge(b.menge, a.einheit)) + (b.menge <= 0 ? "<small>ausverkauft</small>" : "") + "</div><button type='button' class='zweit klein-knopf'>Korrigieren</button>";
        li.querySelector("button").addEventListener("click", function () { korrekturStarten(a.artikel_id, false); });
      } else {
        li.innerHTML = "<div class='b-text'><strong>" + esc(a.bezeichnung_de) + "</strong><span>Noch nicht erfasst</span></div><div class='b-menge leise'>–</div><button type='button' class='zweit klein-knopf'>Startbestand erfassen</button>";
        li.querySelector("button").addEventListener("click", function () { korrekturStarten(a.artikel_id, true); });
      }
      ul.appendChild(li);
    });
  }

  function korrekturStarten(artikelId, start) {
    korrektur = { artikel_id: artikelId, start: start, grund: null };
    var a = art(artikelId), b = bestand(artikelId);
    $("korr-titel").textContent = start ? "Startbestand erfassen" : "Bestand korrigieren";
    $("korr-info").textContent = a.bezeichnung_de + (b ? " · im System: " + menge(b.menge, a.einheit) : " · noch nicht erfasst");
    $("korr-menge-label").textContent = (start ? "Vorhandene Menge" : "Gezählte Menge") + " (" + einheit(a.einheit) + ")";
    $("korr-menge").value = b ? String(b.menge) : ""; $("korr-menge").step = String(SCHRITT[a.einheit] || 1);
    $("korr-notiz").value = ""; meldung("korr-meldung", null); meldung("bestand-meldung", null);
    var fs = $("korr-gruende"); fs.innerHTML = "<legend>Grund</legend>"; fs.hidden = start;
    if (!start) KORREKTUR_GRUENDE.forEach(function (g, i) {
      var b2 = document.createElement("button"); b2.type = "button"; b2.className = "grund"; b2.textContent = g.text; b2.setAttribute("aria-pressed", "false");
      b2.addEventListener("click", function () { korrektur.grund = i; fs.querySelectorAll(".grund").forEach(function (x) { x.setAttribute("aria-pressed", x === b2 ? "true" : "false"); }); });
      fs.appendChild(b2);
    });
    $("korr-buchen").textContent = start ? "Startbestand buchen" : "Korrektur buchen";
    geh("korrektur");
  }

  function korrekturBuchen() {
    var a = art(korrektur.artikel_id), roh = $("korr-menge").value, m = zahlEin(roh), notiz = $("korr-notiz").value.trim(), b = bestand(a.artikel_id);
    if (roh === "" || m < 0) return meldung("korr-meldung", ["Bitte die Menge eintragen.", "Auch 0 ist möglich, wenn nichts mehr da ist."]);
    if (!korrektur.start && korrektur.grund === null) return meldung("korr-meldung", M.grundFehlt);
    var g = korrektur.start ? { anlass: "anfangsbestand", text: "Startbestand gezählt" } : KORREKTUR_GRUENDE[korrektur.grund];
    if (g.anlass === "sonstige" && notiz.length < 3) return meldung("korr-meldung", M.sonstigesNotiz);
    var vor = b ? b.menge : null;
    var r = R.erzeugeBestandskorrektur(zustand, { ausgabestelle_id: schicht.ast, artikel_id: a.artikel_id, menge_neu: m, anlass: g.anlass, begruendung: g.text + (notiz ? ": " + notiz : "") });
    if (!r.ok) return meldung("korr-meldung", uebersetze(r.fehler));
    var u = uebernimmAlle(r.ereignisse);
    if (!u.ok) return meldung("korr-meldung", uebersetze(u.fehler));
    geh("bestand");
    meldung("bestand-meldung", korrektur.start ? ["Startbestand " + a.bezeichnung_de + ": " + menge(m, a.einheit) + " gebucht.", "Ab jetzt kann dieser Artikel ausgegeben und geliefert werden."]
      : ["Bestand " + a.bezeichnung_de + " korrigiert: " + menge(vor, a.einheit) + " → " + menge(m, a.einheit) + ".", "Grund: " + g.text + "."], "ok");
  }

  /* ---------- Buchungen heute / Storno ---------- */
  var JOURNAL_TEXT = { ausgabe: "Ausgabe (Gutschein)", karte: "Ausgabe (Lebensmittelkarte)", rezept: "Insulin auf Rezept", wareneingang: "Wareneingang", korrektur: "Bestandskorrektur", startbestand: "Startbestand" };
  function zeigeJournal() {
    var ul = $("journal-liste"); ul.innerHTML = "";
    var alle = R.journal(zustand, ereignisse, schicht.ast);
    var liste = journalAlle ? alle.slice(0, 100) : alle.filter(function (e) { return heute(e.zeit); });
    $("journal-aelter").hidden = journalAlle || alle.length === liste.length;
    if (!liste.length) { ul.innerHTML = "<li class='leise'>Heute noch keine Buchungen.</li>"; return; }
    liste.forEach(function (e) {
      var a = art(e.artikel_id), li = document.createElement("li"), e2 = a ? a.einheit : e.einheit;
      var was = e.art === "wareneingang" ? "+" + menge(e.menge, e2) : (e.art === "korrektur" || e.art === "startbestand" ? "auf " + menge(e.menge, e2) : menge(e.menge, e2));
      li.className = "j-zeile" + (e.storniert ? " storniert" : "");
      li.innerHTML = "<div class='j-zeit'>" + esc(journalAlle && !heute(e.zeit) ? datumLang(e.zeit) + " " : "") + esc(uhrzeit(e.zeit)) + "</div><div class='j-text'><strong>" + esc(JOURNAL_TEXT[e.art]) + "</strong><span>" +
        esc(was + " " + (a ? a.bezeichnung_de : "")) + (e.buchung_id ? " · Beleg " + esc(belegNr(e.buchung_id)) : "") + "</span>" +
        (e.storniert ? "<span class='badge'>storniert</span>" : "") + (e.hinweis && e.art !== "startbestand" ? "<span class='leise'>" + esc(e.hinweis) + "</span>" : "") + "</div>";
      if (e.buchung_id && !e.storniert) {
        var b = document.createElement("button"); b.type = "button"; b.className = "zweit klein-knopf"; b.textContent = "Stornieren";
        b.addEventListener("click", function () { stornoStarten(e); });
        li.appendChild(b);
      }
      ul.appendChild(li);
    });
  }

  function stornoStarten(e) {
    stornoBuchung = { buchung_id: e.buchung_id, grund: null, was: menge(e.menge, e.einheit) + " " + art(e.artikel_id).bezeichnung_de };
    $("storno-info").textContent = stornoBuchung.was + " · " + uhrzeit(e.zeit) + " Uhr · Beleg " + belegNr(e.buchung_id);
    var fs = $("storno-gruende"); fs.innerHTML = "<legend>Grund</legend>"; meldung("storno-meldung", null); meldung("journal-meldung", null);
    STORNO_GRUENDE.forEach(function (g) {
      var b = document.createElement("button"); b.type = "button"; b.className = "grund"; b.textContent = g; b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function () { stornoBuchung.grund = g; fs.querySelectorAll(".grund").forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); });
      fs.appendChild(b);
    });
    geh("storno");
  }

  function stornoBuchen() {
    if (!stornoBuchung.grund) return meldung("storno-meldung", M.grundFehlt);
    var r = R.erzeugeStorno(zustand, { buchung_id: stornoBuchung.buchung_id, begruendung: stornoBuchung.grund, ausgabestelle_id: schicht.ast });
    if (!r.ok) return meldung("storno-meldung", uebersetze(r.fehler));
    var u = uebernimmAlle(r.ereignisse);
    if (!u.ok) return meldung("storno-meldung", uebersetze(u.fehler));
    geh("journal");
    meldung("journal-meldung", ["Storniert: " + stornoBuchung.was + ".", "Die Menge ist wieder frei und zurück im Bestand. Ware von der Kundin bzw. dem Kunden zurücknehmen."], "ok");
  }

  /* ---------- Einstellungen ---------- */
  var register = [], zuordnung = [];
  function namenNeu() { var imp = ladeJson(NAMEN, []); namen = baueNamen(register.concat(imp), zuordnung.concat(imp)); }

  function zeigeEinstellungen() {
    var a = ast(), ab = localStorage.getItem(ABGLEICH), offen = offeneBuchungen().length, n = Object.keys(namen).length;
    $("e-ast").innerHTML = "<strong>" + esc(stellenName(a)) + "</strong> · Kasse " + esc(schicht.kasse);
    $("e-adresse").textContent = (TYP[a.typ] || "Ausgabestelle") + " · " + adresse(a) + " · Schicht seit " + uhrzeit(schicht.beginn) + " Uhr";
    $("e-sync").textContent = (ab ? "Letzter Abgleich: " + zeitText(ab) : "Noch nicht abgeglichen") + " · " + (offen ? offen + (offen === 1 ? " Buchung" : " Buchungen") + " noch nicht als Datei gespeichert" : "alle Buchungen als Datei gespeichert");
    $("e-einwohner-stand").textContent = register.length ? "Melderegister: " + register.length + " Einträge, davon " + n + " einem Haushalt zugeordnet." : "Kein Melderegister geladen – Namen erscheinen als „Name nicht hinterlegt“.";
  }

  function abgleichen(still) {
    return fetch(LOG_DATEI, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("offline");
      return r.text();
    }).then(function (t) {
      var liste = K.ausJsonl(t), abgelehnt = 0;
      liste.forEach(function (ev) { var r = uebernimmAlle([ev], true); if (!r.ok) abgelehnt++; });
      speichere();
      localStorage.setItem(ABGLEICH, K.zeitBerlin());
      if (!still) { meldung("e-meldung", ["Abgleich abgeschlossen.", abgelehnt ? "Einige Daten konnten nicht übernommen werden. Bitte die Marktleitung informieren." : "Alle Daten sind aktuell."], abgelehnt ? "hinweis" : "ok"); zeigeEinstellungen(); }
      if (schicht) kopf();
    }).catch(function () { if (!still) meldung("e-meldung", M.offline); });
  }

  function exportieren() {
    var offen = offeneBuchungen();
    if (!offen.length) return meldung("e-meldung", ["Keine neuen Buchungen.", "Alle Buchungen dieses Geräts sind bereits als Datei gespeichert."], "ok");
    var blob = new Blob([K.zuJsonl(offen)], { type: "application/x-ndjson" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "foodallo-buchungen-" + K.zeitBerlin().slice(0, 16).replace(/[:T]/g, "-") + ".jsonl";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    var exp = ladeJson(EXPORTIERT, {});
    offen.forEach(function (e) { exp[e.ereignis_id] = true; });
    localStorage.setItem(EXPORTIERT, JSON.stringify(exp));
    zeigeEinstellungen();
    meldung("e-meldung", [offen.length + (offen.length === 1 ? " Buchung" : " Buchungen") + " als Datei gespeichert.", "In dieser Beta wird die Datei von keiner anderen Stelle eingelesen. Die Buchungen bleiben zusätzlich auf diesem Gerät gespeichert."], "ok");
  }

  function einwohnerLaden(evt) {
    var f = evt.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var liste = leseListe(rd.result);
        if (!liste.length) throw new Error("leer");
        localStorage.setItem(NAMEN, JSON.stringify(liste)); namenNeu();
        meldung("e-meldung", ["Liste geladen: " + liste.length + " Einträge.", "Zugeordnete Namen erscheinen ab sofort bei „Wer holt ab?“."], "ok");
      } catch (e) { meldung("e-meldung", ["Die Liste konnte nicht gelesen werden.", "Bitte die bereitgestellte Datei unverändert verwenden."]); }
      evt.target.value = ""; zeigeEinstellungen();
    };
    rd.readAsText(f);
  }

  function zuruecksetzen() {
    ereignisse = []; speichere(); localStorage.removeItem(EXPORTIERT); localStorage.removeItem(ABGLEICH);
    neuBerechnen();
    return startbestandSicherstellen();
  }

  function testdatenLaden() {
    if (!confirm("Testdaten laden? Buchungen auf diesem Gerät werden gelöscht.")) return;
    zuruecksetzen().then(function () { return abgleichen(true); }).then(function () {
      var box = $("e-testcodes"); box.innerHTML = "";
      var apo = istApotheke(), gs = zustand.gutscheine;
      function knopf(text, fn) { var b = document.createElement("button"); b.type = "button"; b.className = "zweit klein-knopf"; b.textContent = text; b.addEventListener("click", fn); box.appendChild(b); }
      if (!apo) seedGutscheine.forEach(function (s) {
        var g = gs[s.gutschein_id];
        if (g.papierkarte_id) knopf("Testkarte " + kurzNr(g.papierkarte_id), function () { scanStarten("karte"); verarbeiteScan(g.papierkarte_id); });
        else knopf("Testgutschein " + kurzNr(g.gutschein_id), function () { scanStarten("gutschein"); verarbeiteScan(g.gutschein_id); });
      });
      if (apo) testRezepte.forEach(function (t, i) {
        knopf("Testrezept " + (i + 1) + " (" + String(t.bezeichnung || "").split(" ")[0] + ")", function () { rezeptStarten(); rezeptPruefen(t.token); });
      });
      kopf(); zeigeEinstellungen();
      meldung("e-meldung", ["Testdaten geladen.", "Einen Testcode antippen, um einen Vorgang zu starten."], "ok");
    });
  }

  function loeschen() {
    if (!confirm("Alle Buchungen auf diesem Gerät löschen? Bereits als Datei gespeicherte Buchungen bleiben in dieser Datei erhalten.")) return;
    zuruecksetzen().then(function () { $("e-testcodes").innerHTML = ""; zeigeEinstellungen(); meldung("e-meldung", ["Buchungen auf diesem Gerät gelöscht.", "Startbestände sind neu eingelesen."], "ok"); });
  }

  /* Startbestände (Szenario) einmalig je Ausgabestelle und Artikel, wenn noch kein Bestand vorhanden ist */
  function startbestandSicherstellen() {
    return fetch("daten/anfangsbestand.jsonl").then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) {
      var evs = K.ausJsonl(t).filter(function (e) { return !zustand.angewendet[e.ereignis_id] && !zustand.bestand[K.bestandId(e.payload.ausgabestelle_id, e.payload.artikel_id)]; });
      evs.forEach(function (e) { uebernimmAlle([e], true); });
      speichere();
    }).catch(function () {});
  }

  /* ---------- Kamera (wo der Browser Codes erkennen kann) ---------- */
  function kameraStart(zielInput, absenden, meldeId) {
    if (!("BarcodeDetector" in window) || !navigator.mediaDevices) return;
    kameraZiel = { input: zielInput, absenden: absenden };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } }).then(function (strom) {
      kameraStrom = strom;
      var v = $("kamera-video"); v.srcObject = strom; v.play();
      var box = $("kamera"); zielInput.parentNode.insertBefore(box, zielInput.nextSibling); box.hidden = false;
      var det = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "data_matrix", "ean_13"] });
      (function suche() {
        if (!kameraStrom) return;
        det.detect(v).then(function (c) {
          if (c.length) { var w = c[0].rawValue, z = kameraZiel; kameraStop(); z.input.value = w; z.absenden(w); }
          else setTimeout(suche, 250);
        }).catch(function () { setTimeout(suche, 500); });
      })();
    }).catch(function () { meldung(meldeId, ["Kamera nicht verfügbar.", "Nummer bitte eintippen oder den Handscanner verwenden."]); });
  }
  function kameraStop() {
    if (kameraStrom) kameraStrom.getTracks().forEach(function (t) { t.stop(); });
    kameraStrom = null; var k = $("kamera"); if (k) k.hidden = true;
  }

  /* ---------- Stepper ---------- */
  function stepper(inputId, nachher) {
    var inp = $(inputId);
    inp.parentNode.querySelectorAll("[data-schritt]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = Number(inp.step) || Math.abs(Number(b.dataset.schritt)) || 1, d = Number(b.dataset.schritt) < 0 ? -s : s;
        inp.value = String(Math.max(0, Math.round((zahlEin(inp.value) + d) * 1000) / 1000));
        if (nachher) nachher();
      });
    });
    inp.addEventListener("input", function () { if (nachher) nachher(); });
  }

  /* ---------- Start ---------- */
  function verdrahte() {
    document.querySelectorAll("[data-geh]").forEach(function (b) {
      b.addEventListener("click", function () {
        var z = b.dataset.geh;
        if (z === "gutschein" || z === "karte") return scanStarten(z);
        if (z === "rezept") return rezeptStarten();
        if (z === "scan-zurueck") return scanStarten(vorgang ? vorgang.modus : "gutschein");
        if (z === "person") { zeigePersonen(); return geh("person"); }
        geh(z);
      });
    });
    $("k-start").addEventListener("click", function () { geh("start"); });
    $("k-einstellungen").addEventListener("click", function () { geh("einstellungen"); });
    $("schicht-start").addEventListener("click", schichtBeginnen);
    $("f-scan").addEventListener("submit", function (e) { e.preventDefault(); verarbeiteScan($("scan-eingabe").value); });
    $("person-fremd").addEventListener("click", function () { meldung("person-meldung", M.nichtImHaushalt); });
    $("korb-buchen").addEventListener("click", korbBuchen);
    $("f-rezept").addEventListener("submit", function (e) { e.preventDefault(); rezeptPruefen($("rezept-eingabe").value); });
    $("rezept-buchen").addEventListener("click", rezeptBuchen);
    stepper("rezept-menge", rezeptKnopf); stepper("we-menge"); stepper("korr-menge");
    document.querySelectorAll("#s-rezept [data-menge]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (!rezeptVorgang) return;
        var bs = bestand(insulinArtikel().artikel_id), max = Math.min(rezeptVorgang.rest, bs ? bs.menge : 0);
        $("rezept-menge").value = String(b.dataset.menge === "max" ? max : Math.min(Number(b.dataset.menge), max)); rezeptKnopf();
      });
    });
    $("beleg-start").addEventListener("click", function () { geh("start"); });
    $("beleg-drucken").addEventListener("click", function () { window.print(); });
    $("we-hinzu").addEventListener("click", wePositionHinzu);
    $("we-buchen").addEventListener("click", weBuchen);
    $("korr-buchen").addEventListener("click", korrekturBuchen);
    $("journal-aelter").addEventListener("click", function () { journalAlle = true; zeigeJournal(); });
    $("storno-buchen").addEventListener("click", stornoBuchen);
    $("e-schicht-ende").addEventListener("click", schichtBeenden);
    $("e-abgleich").addEventListener("click", function () { abgleichen(false); });
    $("e-export").addEventListener("click", exportieren);
    $("e-einwohner").addEventListener("change", einwohnerLaden);
    $("e-testdaten").addEventListener("click", testdatenLaden);
    $("e-loeschen").addEventListener("click", loeschen);
    if ("BarcodeDetector" in window) {
      $("scan-kamera").hidden = false; $("rezept-kamera").hidden = false;
      $("scan-kamera").addEventListener("click", function () { kameraStart($("scan-eingabe"), verarbeiteScan, "scan-meldung"); });
      $("rezept-kamera").addEventListener("click", function () { kameraStart($("rezept-eingabe"), rezeptPruefen, "rezept-meldung"); });
    }
    $("kamera-stop").addEventListener("click", kameraStop);
    window.addEventListener("online", netz); window.addEventListener("offline", netz);
    window.addEventListener("popstate", function (e) {
      var s = e.state && e.state.s;
      if (!schicht) return geh("schicht", true);
      geh(s && s !== "schicht" ? s : "start", true);
    });
  }

  function start() {
    function j(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); }); }
    function optional(u) { return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    Promise.all([j("../kern/stammdaten-ausgabestellen.json"), j("daten/artikel.json"), j("daten/demo-gutscheine.json"), j(SCHEMA_DATEI),
      optional("daten/demo-rezeptnachweise.json"), j("daten/demo-personen.json"), optional(REGISTER_DATEI), optional(ZUORDNUNG_DATEI)]).then(function (x) {
      stamm = { ausgabestellen: x[0].ausgabestellen, artikel: x[1].artikel };
      seedGutscheine = x[2].gutscheine; schema = x[3]; testRezepte = (x[4] && x[4].nachweise) || []; personenSeed = x[5].personen;
      register = listeAus(x[6]).concat(listeAus(x[7])); zuordnung = listeAus(x[7]); namenNeu();
      ereignisse = ladeJson(SPEICHER, []);
      neuBerechnen();
      verdrahte(); netz();
      schicht = ladeJson(SCHICHT, null);
      if (schicht && !zustand.ausgabestellen[schicht.ast]) schicht = null;
      return startbestandSicherstellen().then(function () { return abgleichen(true); }).then(function () {
        if (schicht) { kopf(); geh("start", true); } else { zeigeSchicht(); geh("schicht", true); }
      });
    }).catch(function () {
      $("main").innerHTML = "<section class='screen'><div class='meldung fehler'><strong>Die Anwendung konnte nicht starten.</strong><span>Bitte Seite neu laden. Hilft das nicht, die Marktleitung informieren.</span></div></section>";
    });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  start();
})();
