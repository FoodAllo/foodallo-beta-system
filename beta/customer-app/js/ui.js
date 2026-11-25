/**
 * FoodAllo Customer App — bürgernahe Texte und HTML-Darstellung (Beta).
 * Keine internen IDs, Ereignisnamen oder Fachkürzel in der Oberfläche.
 * Unter Node testbar: const UI = require("./ui.js");
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FoodAlloUI = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var EINHEIT_LABEL = {
    L: "Liter",
    l: "Liter",
    kg: "Kilogramm",
    IE: "Internationale Einheiten",
    rolle: "Rollen",
    Rollen: "Rollen",
    Rollenstück: "Rollen"
  };

  var ALTERSGRUPPE = {
    adult: "Erwachsene",
    elderly: "Ältere Menschen",
    child: "Kinder",
    infant: "Säuglinge"
  };

  var SHOP_TYP = {
    supermarket: "Supermarkt",
    grocery: "Lebensmittelgeschäft",
    convenience: "Lebensmittelgeschäft",
    pharmacy: "Apotheke",
    chemist: "Drogerie",
    kiosk: "Kiosk",
    butcher: "Fleischerei",
    bakery: "Bäckerei"
  };

  var STATUS = {
    ausgestellt: "Bereit zur Abholung",
    teilweise_eingeloest: "Teilweise abgeholt",
    ausgeschoepft: "Alles abgeholt",
    storniert: "Nicht mehr gültig",
    abgelaufen: "Die Woche ist vorbei",
    offen: "Die Prüfung läuft noch",
    bestaetigt: "Bestätigt",
    abgelehnt: "Nicht bestätigt",
    verfallen: "Verfallen"
  };

  var INTERNE_ID = /\bFA-(?:P|HH|V|E|R|S|PK|PER|SD|RX|X|AUTH)-[A-Z0-9-]+\b/i;
  var EREIGNIS_NAMEN = /\b(?:IDENTITY_VERIFIED|PERSON_REGISTERED|PERSON_VERIFIED|VOUCHER_ISSUED|REDEMPTION_POSTED|SUPPLY_DISRUPTION(?:_DECLARED|_ENDED)?|STOCK_ADJUSTED|ALLOCATION_RUN_COMPLETED|PAPER_CARD_(?:RENDERED|PRINTED|CREATED)|PERIOD_CLOSED|PRESCRIPTION_CHECKED)\b/;
  var FACHFELDER = /\b(?:person_id|gutschein_id|haushalt_id|periode_id|stoerung_id|rezept_id|papierkarte_id|ausstellungsort|zugeteilt_max|basiskontingent|schema_version|ereignis_id|ags_wohnsitz)\b/;
  var KUERZEL_IE = /(?:^|[^A-Za-zÄÖÜäöüß])IE(?:[^A-Za-zÄÖÜäöüß]|$)/;
  var DEMO_MARKEN = /\b(?:DEMO\s*—|Demo-PIN|Demo-Anmeldung|synthetisch(?:e|er|es)? Person|PIN\s*=\s*laufende Nummer)\b/;

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function personAnzeigeName(p) {
    if (!p) return "Ihr Konto";
    var v = String(p.vorname || "").trim();
    var n = String(p.nachname || "").trim();
    var full = (v + " " + n).trim();
    if (full) return full;
    if (p.anzeigename && String(p.anzeigename).trim()) return String(p.anzeigename).trim();
    // anzeigename_demo („Person 00000N“) nicht in der Bürgeroberfläche zeigen,
    // bis die Desktopversion eine Namensliste verteilt.
    return "Ihr Konto";
  }

  function begruessung(p) {
    if (!p) return "Guten Tag";
    var nach = String(p.nachname || "").trim();
    var anrede = String(p.anrede || "").trim();
    if (anrede && nach) return "Guten Tag, " + anrede + " " + nach;
    var full = personAnzeigeName(p);
    if (full && full !== "Ihr Konto") return "Guten Tag, " + full;
    return "Guten Tag";
  }

  function einheitLabel(einheit) {
    if (!einheit) return "";
    if (EINHEIT_LABEL[einheit]) return EINHEIT_LABEL[einheit];
    return String(einheit);
  }

  function formatMenge(n, einheit) {
    if (n === null || n === undefined) return "noch offen";
    var s = Number(n).toLocaleString("de-DE", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
    var e = einheitLabel(einheit);
    return e ? s + "\u00a0" + e : s;
  }

  function formatDateDe(isoDate) {
    var m = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return isoDate || "";
    return m[3] + "." + m[2] + "." + m[1];
  }

  function statusLabel(status) {
    return STATUS[status] || "Offen";
  }

  function altersgruppeLabel(v) {
    return ALTERSGRUPPE[v] || "Erwachsene";
  }

  function shopTypLabel(typ) {
    return SHOP_TYP[typ] || "Geschäft";
  }

  function buergercode(obj) {
    if (!obj) return "";
    var c = obj.code_anzeige || (obj.papierkarte && obj.papierkarte.code_anzeige);
    c = c == null ? "" : String(c).trim();
    return c;
  }

  var MELDEBEHOERDE_ANSCHRIFT = "Markt 13–15, 12345 Musterstadt";

  function adresseText(s) {
    if (!s || !s.adresse) return "";
    var a = s.adresse;
    var line = [a.strasse, a.hausnummer].filter(Boolean).join(" ");
    var plz = a.plz == null ? "" : String(a.plz).trim();
    var ort = [plz, a.ort].filter(Boolean).join(" ");
    return [line, ort].filter(Boolean).join(", ");
  }

  function interneTreffer(html) {
    var text = String(html || "");
    var hits = [];
    var m;
    var reId = new RegExp(INTERNE_ID.source, "gi");
    while ((m = reId.exec(text))) hits.push(m[0]);
    var reEv = new RegExp(EREIGNIS_NAMEN.source, "g");
    while ((m = reEv.exec(text))) hits.push(m[0]);
    var reF = new RegExp(FACHFELDER.source, "g");
    while ((m = reF.exec(text))) hits.push(m[0]);
    if (KUERZEL_IE.test(text)) hits.push("IE");
    var reD = new RegExp(DEMO_MARKEN.source, "g");
    while ((m = reD.exec(text))) hits.push(m[0]);
    return hits;
  }

  function istBuergertext(html, erlaubteCodes) {
    var text = String(html || "");
    var allow = (erlaubteCodes || []).filter(Boolean);
    allow.forEach(function (c) {
      text = text.split(String(c)).join("");
    });
    return interneTreffer(text).length === 0;
  }

  function periodeSatz(periode) {
    if (!periode) return "Diese Mengen gelten für eine Woche, von Montag bis Sonntag.";
    return "Diese Mengen gelten von " + formatDateDe(periode.start_iso_date) +
      " bis " + formatDateDe(periode.ende_iso_date) + " (eine Woche, Montag bis Sonntag).";
  }

  function renderWarten(opts) {
    opts = opts || {};
    var html = '<section class="card info" aria-live="polite">';
    html += "<h2>Ihre Angaben werden geprüft</h2>";
    if (opts.begruessung) {
      html += "<p>" + escapeHtml(opts.begruessung) + ".</p>";
    }
    if (opts.weg === "eid") {
      html += "<p>Sie haben sich in einer Übung mit dem Online-Ausweis angemeldet. Es wurde kein echter Ausweis-Dienst aufgerufen.</p>";
      html += "<p>Die Pass- und Meldebehörde der Musterstadt muss Ihre Identität noch bestätigen. Die App selbst bestätigt Ihre Identität nicht. Schauen Sie später noch einmal nach.</p>";
    } else if (opts.weg === "meldebehoerde") {
      html += "<p>Ihre Anmeldung ist gespeichert. Bitte gehen Sie zur Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt, und lassen Sie Ihre Identität prüfen. Nehmen Sie ein Ausweisdokument mit.</p>";
      html += "<p>Schauen Sie später noch einmal in die App. Sobald die Prüfung abgeschlossen ist, sehen Sie hier Ihren Gutschein.</p>";
    } else {
      html += "<p>Die Pass- und Meldebehörde der Musterstadt prüft gerade Ihre Identität.</p>";
      html += "<p>Das kann etwas dauern. Schauen Sie später noch einmal nach.</p>";
      html += "<p>Sobald die Prüfung abgeschlossen ist, sehen Sie hier Ihren Gutschein.</p>";
    }
    if (opts.haushaltHtml) html += opts.haushaltHtml;
    html += "</section>";
    return html;
  }

  function renderHaushaltMitglieder(namen) {
    var list = (namen || []).filter(Boolean);
    if (!list.length) return "";
    var html = '<section class="card haushalt-karten">';
    html += "<h2>Personen in Ihrem Haushalt</h2>";
    html += "<p>Diese Personen gehören zu Ihrem Haushalt:</p>";
    html += '<ul class="haushalt-liste">';
    list.forEach(function (n) {
      html += "<li>" + escapeHtml(n) + "</li>";
    });
    html += "</ul></section>";
    return html;
  }

  function renderAbgelehnt() {
    return '<section class="card warn" aria-live="polite">' +
      "<h2>Ihre Identität konnte nicht bestätigt werden</h2>" +
      "<p>Sie können deshalb zurzeit keinen Gutschein nutzen.</p>" +
      "<p>Bitte wenden Sie sich an die Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt. " +
      "Nehmen Sie ein Ausweisdokument mit.</p>" +
      "<p>Wenn die Prüfung später erfolgreich ist, erscheint Ihr Gutschein hier.</p>" +
      "</section>";
  }

  function renderKeinGutschein() {
    return '<section class="card info" aria-live="polite">' +
      "<h2>Ihr Gutschein ist noch nicht da</h2>" +
      "<p>Ihre Identität ist bestätigt. Der Gutschein für Ihren Haushalt wird noch ausgestellt.</p>" +
      "<p>Schauen Sie später noch einmal nach. Sie müssen nichts weiter tun.</p>" +
      "</section>";
  }

  function renderRegistriert() {
    return "<p>Ihre Anmeldung ist gespeichert. Die Pass- und Meldebehörde der Musterstadt prüft jetzt Ihre Angaben. " +
      "Schauen Sie später noch einmal nach, ob Ihr Gutschein bereitsteht. Merken Sie sich Ihre Geheimzahl.</p>";
  }

  function renderPapierhinweis(gutschein) {
    var html = '<section class="card info">';
    html += "<h2>Sie nutzen eine Lebensmittelkarte</h2>";
    html += "<p>Die Mengen auf der Lebensmittelkarte sind dieselben wie in der App. " +
      "Die Karte bekommen Sie in der Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt.</p>";
    var code = buergercode(gutschein);
    if (code) {
      html += "<p>Ihre Kartennummer lautet: <strong>" + escapeHtml(code) + "</strong></p>";
    }
    html += "</section>";
    return html;
  }

  function renderPosition(pos, art, opts) {
    opts = opts || {};
    var waterOff = pos.artikel_id === "water" && !(pos.zugeteilt_max > 0);
    if (waterOff) return "";
    var name = (art && art.bezeichnung_de) || "Artikel";
    var einheit = art && art.einheit;
    var html = '<li class="pos">';
    html += '<div class="pos-top">';
    html += "<h3>" + escapeHtml(name);
    if (pos.artikel_id === "water" && opts.stoerungAktiv) {
      html += ' <span class="typ">Zusätzlich wegen einer Versorgungsstörung</span>';
    }
    html += "</h3></div>";
    html += '<dl class="mengen">';
    html += "<div><dt>Sie dürfen abholen</dt><dd>" + escapeHtml(formatMenge(pos.zugeteilt_max, einheit)) + "</dd></div>";
    html += "<div><dt>Bereits abgeholt</dt><dd>" + escapeHtml(formatMenge(pos.eingeloest, einheit)) + "</dd></div>";
    html += "<div><dt>Es bleibt noch</dt><dd><strong>" + escapeHtml(formatMenge(pos.rest, einheit)) + "</strong></dd></div>";
    html += "</dl>";
    if (isFinite(Number(pos.zugeteilt_max)) && pos.zugeteilt_max > 0) {
      var pct = Math.min(100, Math.round((Number(pos.eingeloest || 0) / pos.zugeteilt_max) * 100));
      html += '<div class="bar" role="progressbar" aria-label="Bereits abgeholt: ' + pct +
        ' Prozent" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct +
        '"><span style="width:' + pct + '%"></span></div>';
    }
    html += "</li>";
    return html;
  }

  function gutscheinTitel(gutschein, v12) {
    var anlass = (gutschein && gutschein.anlass) || "regulaer";
    if (v12 && anlass === "stoerung") return "Zusätzlicher Gutschein wegen einer Versorgungsstörung";
    return "Gutschein für Ihren Haushalt";
  }

  function renderEinGutschein(gutschein, ctx) {
    ctx = ctx || {};
    var periode = ctx.periode;
    var html = '<section class="card voucher">';
    html += '<header class="voucher-head">';
    html += "<h2>" + escapeHtml(gutscheinTitel(gutschein, ctx.v12)) + "</h2>";
    html += '<p class="periode">' + escapeHtml(periodeSatz(periode)) + "</p>";
    var code = buergercode(gutschein);
    if (code) {
      html += "<p>Ihre Gutscheinnummer: <strong>" + escapeHtml(code) + "</strong></p>";
    }
    var status = ctx.verfallen ? "verfallen" : (gutschein.status || "");
    html += '<p>Status: <span class="pill status-' + escapeHtml(status) + '">' +
      escapeHtml(statusLabel(status)) + "</span></p>";
    if (ctx.personenZahl) {
      html += "<p>Die Mengen gelten für Ihren ganzen Haushalt (" +
        escapeHtml(String(ctx.personenZahl)) + " Personen). Jede bestätigte Person aus dem Haushalt darf abholen.</p>";
    } else {
      html += "<p>Die Mengen gelten für Ihren ganzen Haushalt. Jede bestätigte Person aus dem Haushalt darf abholen.</p>";
    }
    html += "<p>Die Mengen gelten je Person und Woche, zum Beispiel eine Rolle Toilettenpapier je Person. " +
      "Trinkwasser gibt es nur während einer Versorgungsstörung: 2 Liter je Person und Tag (14 Liter je Person und Woche), auf einem zusätzlichen Gutschein.</p>";
    html += "</header>";

    if (ctx.v12 && gutschein.anlass === "stoerung") {
      if (ctx.verfallen) {
        html += '<p class="stoerung">Dieser Gutschein ist verfallen, weil die Versorgungsstörung beendet ist.</p>';
      } else {
        html += '<p class="stoerung">Dieser Gutschein gilt zusätzlich, weil die Trinkwasserversorgung zurzeit eingeschränkt ist.</p>';
        if (ctx.gueltigBis) {
          html += "<p>Gültig bis " + escapeHtml(formatDateDe(ctx.gueltigBis)) + ".</p>";
        } else {
          html += "<p>Gültig bis zum Ende der Versorgungsstörung.</p>";
        }
      }
    } else if (ctx.stoerungAktiv && !ctx.v12) {
      html += '<p class="stoerung">Wegen einer Störung der Trinkwasserversorgung können Sie zusätzliches Trinkwasser abholen.</p>';
    }

    html += '<ul class="positionen">';
    (gutschein.positionen || []).forEach(function (pos) {
      var art = (ctx.artikelById && ctx.artikelById(pos.artikel_id)) || { bezeichnung_de: "Artikel" };
      html += renderPosition(pos, art, { stoerungAktiv: ctx.stoerungAktiv });
    });
    html += "</ul></section>";
    return html;
  }

  function renderInsulin(opts) {
    opts = opts || {};
    var html = '<section class="card">';
    html += "<h2>Insulin und Rezept</h2>";
    if (opts.hatGueltigesRezept) {
      html += "<p>Sie haben ein gültiges Rezept. Insulin bekommen Sie nur in einer Apotheke in Musterstadt oder Musterdorf. " +
        "Nur Sie selbst dürfen das Rezept einlösen, nicht andere Personen aus Ihrem Haushalt.</p>";
      if (opts.menge != null) {
        html += "<p>Menge: " + escapeHtml(formatMenge(opts.menge, "IE")) + "</p>";
      }
      if (opts.gueltigVon || opts.gueltigBis) {
        html += "<p>Das Rezept gilt vom " + escapeHtml(formatDateDe(opts.gueltigVon)) +
          " bis " + escapeHtml(formatDateDe(opts.gueltigBis)) + ".</p>";
      }
    } else {
      html += "<p>Insulin bekommen Sie nur mit einem Rezept und nur in einer Apotheke. " +
        "Im Moment liegt kein gültiges Rezept für Sie vor.</p>";
    }
    html += "</section>";
    return html;
  }

  function renderStellen(opts) {
    opts = opts || {};
    var html = '<section class="card stellen">';
    html += "<h2>Wo Sie abholen können</h2>";
    html += "<p>Lebensmittel und Toilettenpapier bekommen Sie in diesen Geschäften in Musterstadt und Musterdorf:</p>";
    html += "<ul class='stellen-list'>";
    (opts.einzelhandel || []).forEach(function (s) {
      html += "<li><strong>" + escapeHtml(s.name) + "</strong>";
      if (s.typLabel) html += " <span class='typ'>" + escapeHtml(s.typLabel) + "</span>";
      if (s.adresse) html += "<br>" + escapeHtml(s.adresse);
      html += "</li>";
    });
    html += "</ul>";
    html += "<h3>Apotheken</h3>";
    html += "<p>Insulin bekommen Sie nur in einer Apotheke und nur mit Rezept:</p>";
    html += "<ul class='stellen-list'>";
    (opts.apotheken || []).forEach(function (s) {
      html += "<li class='" + (opts.rezeptHervorheben ? "hl" : "") + "'><strong>" +
        escapeHtml(s.name) + "</strong> <span class='typ'>Apotheke</span>";
      if (s.adresse) html += "<br>" + escapeHtml(s.adresse);
      html += "</li>";
    });
    html += "</ul></section>";
    return html;
  }

  function renderHilfe() {
    return '<section class="card help">' +
      "<h2>Hilfe und häufige Fragen</h2>" +
      "<h3>Wie melde ich mich an?</h3>" +
      "<p>Geben Sie Ihre Anmeldenummer und Ihre Geheimzahl ein. Die Anmeldenummer bekommen Sie von der Pass- und Meldebehörde. " +
      "Wenn Sie noch kein Konto haben, wählen Sie auf dem Anmeldebildschirm „Zum ersten Mal anmelden“.</p>" +
      "<h3>Warum sehe ich keinen Gutschein?</h3>" +
      "<p>Zuerst prüft die Pass- und Meldebehörde der Musterstadt Ihre Identität. " +
      "Das kann etwas dauern. Danach wird der Gutschein für Ihren Haushalt ausgestellt. Schauen Sie später noch einmal nach.</p>" +
      "<h3>Meine Identität wurde nicht bestätigt. Was kann ich tun?</h3>" +
      "<p>Gehen Sie zur Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt. Nehmen Sie ein Ausweisdokument mit.</p>" +
      "<h3>Wo hole ich Lebensmittel ab?</h3>" +
      "<p>In den Geschäften, die in der App unter „Wo Sie abholen können“ stehen. " +
      "Zeigen Sie dort Ihren Gutschein in der App (Ihre Gutscheinnummer) oder Ihre Lebensmittelkarte. Die Abholung bucht das Geschäft, nicht diese App.</p>" +
      "<h3>Wie bekomme ich Insulin?</h3>" +
      "<p>Insulin gibt es nur in einer Apotheke und nur mit einem Rezept. Nur die Person, für die das Rezept ausgestellt ist, darf es einlösen.</p>" +
      "<h3>Wie werden die Mengen berechnet?</h3>" +
      "<p>Die Mengen gelten für den ganzen Haushalt und für eine Woche, von Montag bis Sonntag. " +
      "Toilettenpapier zum Beispiel: eine Rolle je Person und Woche. " +
      "Trinkwasser gibt es nur während einer Versorgungsstörung, auf einem zusätzlichen Gutschein: 2 Liter je Person und Tag, also 14 Liter je Person und Woche.</p>" +
      "<h3>Warum steht Trinkwasser auf dem Gutschein?</h3>" +
      "<p>Trinkwasser gibt es nur während einer Versorgungsstörung, und zwar auf einem zusätzlichen Gutschein. " +
      "Die Menge beträgt 2 Liter je Person und Tag, also 14 Liter je Person und Woche. " +
      "Steht kein Trinkwasser auf einem Gutschein, ist zurzeit nichts zusätzlich vorgesehen.</p>" +
      "<h3>Ich habe keine App, nur eine Lebensmittelkarte.</h3>" +
      "<p>Die Mengen sind dieselben wie in der App. Die Lebensmittelkarte bekommen Sie in der Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt.</p>" +
      "<h3>Die App geht nicht online.</h3>" +
      "<p>Ihre zuletzt gespeicherten Angaben bleiben sichtbar. Abholen können Sie trotzdem im Geschäft. " +
      "Neue Prüfungen und neue Gutscheine erscheinen, sobald die Verbindung wieder da ist.</p>" +
      "<h3>Wie melde ich mich mit dem Online-Ausweis an?</h3>" +
      "<p>Wenn Ihr Ausweis die Online-Ausweisfunktion hat, können Sie den Übungsweg in der App nutzen. " +
      "Das ist eine lokale Übung. Es wird kein echter Ausweis-Dienst aufgerufen. Die Pass- und Meldebehörde muss Ihre Identität danach noch bestätigen.</p>" +
      "<h3>Mein Ausweis hat keine Online-Funktion.</h3>" +
      "<p>Dann melden Sie sich über die Pass- und Meldebehörde an. Gehen Sie mit einem Ausweisdokument zur Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt.</p>" +
      "<h3>Ich nutze eine Lebensmittelkarte und keine App.</h3>" +
      "<p>Dann ist diese App nicht für Sie vorgesehen. Die Lebensmittelkarte bekommen Sie in der Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt.</p>" +
      "</section>";
  }

  function offlineText() {
    return "Sie sind gerade ohne Internet. Ihre zuletzt gespeicherten Angaben bleiben sichtbar. Abholen können Sie im Geschäft.";
  }

  function loginFehlerUnbekannt() {
    return "Die Anmeldung hat nicht geklappt. Prüfen Sie Ihre Anmeldenummer und Ihre Geheimzahl.";
  }

  function loginFehlerGeheimzahl() {
    return "Die Geheimzahl stimmt nicht. Bitte prüfen Sie Ihre Eingabe.";
  }

  function loginFehlerWohnort() {
    return "Diese App gilt zurzeit nur für Menschen mit Wohnsitz in der Musterstadt.";
  }

  function datenFehler() {
    return "Die Daten konnten nicht geladen werden. Bitte öffnen Sie die App über den lokalen Server. Hinweise stehen in der Anleitung.";
  }

  function datenHinweisStellen() {
    return "Die Liste der Geschäfte konnte nicht vollständig geladen werden. Es wird eine gespeicherte Kopie verwendet.";
  }

  function datenHinweisLog() {
    return "Der aktuelle Stand konnte nicht vollständig geladen werden. Es werden die zuletzt gespeicherten Angaben gezeigt.";
  }

  function eidStandinHinweis() {
    return "Das ist eine lokale Übung. Es wird kein echter Ausweis-Dienst aufgerufen. Ihre Angaben bleiben auf diesem Gerät.";
  }

  function eidErfolgHinweis() {
    return "Die Übung war erfolgreich. Die Pass- und Meldebehörde muss Ihre Identität noch bestätigen. Die App selbst bestätigt Ihre Identität nicht.";
  }

  function keinOnlineAusweisHinweis() {
    return "Ihr Ausweis hat keine Online-Ausweisfunktion. Bitte melden Sie sich über die Pass- und Meldebehörde an. Gehen Sie mit einem Ausweisdokument zur Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt.";
  }

  function analogKeinAppKonto() {
    return "Sie nutzen eine Lebensmittelkarte. Diese App ist für Sie nicht vorgesehen. Die Karte bekommen Sie in der Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt.";
  }

  function registerUnbekannt() {
    return "Zu diesen Angaben wurde niemand gefunden. Prüfen Sie den Nachnamen und die Ausweisnummer oder wenden Sie sich an die Pass- und Meldebehörde der Musterstadt.";
  }

  function wartendOhneAmtlicheId() {
    return "Ihre Anmeldung ist gespeichert. Eine amtliche Kennung liegt in der Einwohnermeldeliste noch nicht vor. Einen Gutschein kann die App deshalb noch nicht zuordnen.";
  }

  return {
    EINHEIT_LABEL: EINHEIT_LABEL,
    INTERNE_ID: INTERNE_ID,
    escapeHtml: escapeHtml,
    personAnzeigeName: personAnzeigeName,
    einheitLabel: einheitLabel,
    formatMenge: formatMenge,
    formatDateDe: formatDateDe,
    statusLabel: statusLabel,
    altersgruppeLabel: altersgruppeLabel,
    shopTypLabel: shopTypLabel,
    buergercode: buergercode,
    adresseText: adresseText,
    MELDEBEHOERDE_ANSCHRIFT: MELDEBEHOERDE_ANSCHRIFT,
    interneTreffer: interneTreffer,
    istBuergertext: istBuergertext,
    periodeSatz: periodeSatz,
    gutscheinTitel: gutscheinTitel,
    renderWarten: renderWarten,
    renderHaushaltMitglieder: renderHaushaltMitglieder,
    renderAbgelehnt: renderAbgelehnt,
    renderKeinGutschein: renderKeinGutschein,
    renderRegistriert: renderRegistriert,
    renderPapierhinweis: renderPapierhinweis,
    renderPosition: renderPosition,
    renderEinGutschein: renderEinGutschein,
    renderInsulin: renderInsulin,
    renderStellen: renderStellen,
    renderHilfe: renderHilfe,
    offlineText: offlineText,
    loginFehlerUnbekannt: loginFehlerUnbekannt,
    loginFehlerGeheimzahl: loginFehlerGeheimzahl,
    loginFehlerWohnort: loginFehlerWohnort,
    datenFehler: datenFehler,
    datenHinweisStellen: datenHinweisStellen,
    datenHinweisLog: datenHinweisLog,
    begruessung: begruessung,
    eidStandinHinweis: eidStandinHinweis,
    eidErfolgHinweis: eidErfolgHinweis,
    keinOnlineAusweisHinweis: keinOnlineAusweisHinweis,
    analogKeinAppKonto: analogKeinAppKonto,
    registerUnbekannt: registerUnbekannt,
    wartendOhneAmtlicheId: wartendOhneAmtlicheId
  };
});
