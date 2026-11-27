# Lebensmittelkarte Familie Becker – Spezifikation für die Retail App

Demonstration mit fiktiven Daten, nicht im Einsatz bei einer Behörde. Familie Becker ist erfunden.

## Datensatz

- Datei im Repository: `beta/data/demo-becker.json`
- Öffentlich: https://foodallo.github.io/foodallo-beta-system/beta/data/demo-becker.json
- Aus der Retail App: `fetch("../data/demo-becker.json", { cache: "no-store" })`
- Kopie im Customer-Paket (byte-gleich, Rückfall): `beta/customer-app/data/demo-karte.json`
- Kennzeichen: `"demo": true`, `"version": 1`. Neue Felder nur ergänzen, bestehende nicht umbenennen.

Wichtige Felder:

| Feld | Wert |
|---|---|
| `papierkarte_id` | `FA-PK-14729140-900001` |
| `code_anzeige` (Kartennummer, aufgedruckt) | `FA-PK-14729140-900001-77` |
| `code_barcode` (Inhalt des Strichcodes) | `FAPK1472914090000177` |
| `barcode_symbologie` | `code39` |
| `haushalt_id` | `FA-HH-14729140-900001` |
| `personen[]` | `FA-P-14729140-900001` Anna, `…-900002` Jonas, `…-900003` Mia Becker; alle `verifikation.status = "bestaetigt"` |
| `gueltigkeit` | `laufende_woche_mo_so_berlin` |
| `periode_id_vorlage` | `FA-PER-{MONTAG_YYYYMMDD}` |
| `gutschein_id_vorlage` | `FA-V-{MONTAG_YYYYMMDD}-900001` |
| `positionen[]` | Format wie `retail-app/daten/demo-gutscheine.json` (artikel_id, einheit, bedarf, basiskontingent, zugeteilt_max, eingeloest, rest, personen_anzahl) |
| `ausgabestellen[]` | `FA-R-14729140-0001` … `FA-R-14729140-0006` (Kern-Ausgabestellen, einzelhandel) |

## Mengen je Woche (3 Personen × `periode_basis_vorschlag`)

| artikel_id | je Person | Haushalt/Woche |
|---|---|---|
| `wheat_flour` | 2 kg | 6 kg |
| `rice` | 1,2 kg | 3,6 kg |
| `oil` | 0,35 L | 1,05 L |
| `toilet_paper` | 1 rolle | 3 rolle |

Kein `water` (Trinkwasser nur während einer Versorgungsstörung auf eigener Zusatzkarte), kein `insulin`.

## Strichcode und Prüfziffer

- Symbologie: **Code 39**, ohne eigene Code-39-Prüfziffer, Start/Stop `*`.
- Kodierter Inhalt: `FAPK` + AGS (8 Ziffern) + laufende Nummer (6 Ziffern) + Prüfziffer (2 Ziffern) = `FAPK1472914090000177` (20 Zeichen).
- Prüfziffer: ISO 7064 Mod 97-10 über die 14 Ziffern AGS + laufende Nummer:
  `r = (Ziffernfolge) mod 97` (ziffernweise), `pz = 98 − (r × 100 mod 97)`, zweistellig mit führender Null.
  Für `14729140900001` ergibt das `77`.
- Berechnung im Code: Kern `FAKern.papierkartenCode("FA-PK-14729140-900001")` (`beta/kern/foodallo_kern.js`)
  liefert `{ code_anzeige, code_barcode }`. Die Customer App nutzt genau diese Funktion
  (`beta/customer-app/js/demokarte.js`, `papierCode`) und zeichnet den Strichcode mit `code39Svg` (gleiches Verfahren wie `beta/desktop/assets/karten.js`).
- Kern `gutscheinZurPapierkarte` erkennt bereits `papierkarte_id`, `code_anzeige` und `code_barcode`, sobald ein Gutschein mit `papierkarte_id = FA-PK-14729140-900001` im Zustand steht.
- Hinweis Kamera: `BarcodeDetector` wird in `retail-app/js/app.js` mit `["qr_code", "code_128", "data_matrix", "ean_13"]` gestartet. Für die Karte muss `"code_39"` ergänzt werden. Handscanner (Tastatureingabe) und Eintippen der Kartennummer funktionieren ohne Änderung.

## Gültige Woche berechnen

Immer die laufende Woche Montag 00:00 bis Sonntag 23:59, Zeitzone Europe/Berlin, wie `periodFromDate` in `beta/customer-app/js/voucher.js`:

```js
function montagBerlin(jetzt) {
  var t = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(jetzt); // JJJJ-MM-TT
  var d = new Date(t + "T12:00:00Z"), wt = d.getUTCDay(), minus = wt === 0 ? 6 : wt - 1;
  d.setUTCDate(d.getUTCDate() - minus);
  return d.toISOString().slice(0, 10).replace(/-/g, ""); // JJJJMMTT
}
var ymd = montagBerlin(new Date());
var periode_id = "FA-PER-" + ymd;            // z. B. FA-PER-20261123
var gutschein_id = "FA-V-" + ymd + "-900001"; // z. B. FA-V-20261123-900001
```

Die Karte ist damit nie „abgelaufen“ und nie „noch nicht gültig“. Das gilt nur für diese Demonstrationskarte; die Wochenlogik aller anderen Gutscheine bleibt unverändert.

## Vorschlag: Einbindung und Einlösung nur lokal

1. Beim Start `demo-becker.json` laden (optional; fehlt die Datei, nichts tun).
2. Daraus **im Speicher** einen Gutschein bauen und an `seedGutscheine` anhängen:
   `{ gutschein_id, periode_id, bezug: "haushalt", person_id: null, haushalt_id, kanal: "papier", positionen, status: "ausgestellt", papierkarte_id, ausstellungsort: "FA-AUTH-FROHBURG-MELDEBEHOERDE" }`,
   und die drei `personen` (mit `verifikation`) an `personenSeed`. Namen für die Personenauswahl aus `vornamen`/`familienname`.
3. Einlösungen wie bisher als `REDEMPTION_POSTED` (Retail-Ereignis) nur in `localStorage` (`foodallo.retail.ereignisse.v1`) buchen.
   **Nicht** in `data/ereignislog.jsonl` schreiben und nicht in eine Exportdatei für den gemeinsamen Log übernehmen
   (Buchungen mit `gutschein_id` `FA-V-…-900001` beim Export herausfiltern).
4. Wochenwechsel: neue `gutschein_id` der neuen Woche, damit ist die Karte am Montag wieder voll.

Die Customer App liest im selben Browser (gleiche Herkunft foodallo.github.io) die Einträge aus
`foodallo.retail.ereignisse.v1` und zeigt bei Becker unter „Bereits abgeholt“ die Summe aller `REDEMPTION_POSTED`
mit `ausgabebuchung.gutschein_id = FA-V-{MONTAG}-900001` abzüglich `REDEMPTION_REVERSED`. Auf einem anderen Gerät bleibt „Bereits abgeholt“ bei 0.
