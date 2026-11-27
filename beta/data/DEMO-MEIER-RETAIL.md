# Digitale Lebensmittelkarte Familie Meier – Spezifikation für die Retail App

Demonstration mit fiktiven Daten, nicht im Einsatz bei einer Behörde. Familie Meier ist erfunden.

Festlegung (David, 27.11.2026): Geprüfte Personen erhalten die Lebensmittelkarte digital aufs Smartphone, wie Familie Becker.
Drucken ist für alle Familien in der Desktop App möglich. Familie Meier ist geprüft (Identität bestätigt, Haushalt `FA-HH-14729140-000123`)
und zeigt in der Customer App deshalb eine digitale Lebensmittelkarte mit Kartennummer und Strichcode.

## Datensatz

- Datei im Repository: `beta/data/demo-meier.json`
- Öffentlich: https://foodallo.github.io/foodallo-beta-system/beta/data/demo-meier.json
- Aus der Retail App: `fetch("../data/demo-meier.json", { cache: "no-store" })`
- Kopie im Customer-Paket (byte-gleich, Rückfall): `beta/customer-app/data/demo-meier.json`
- Aufbau wie `demo-becker.json` (`"demo": true`, `"version": 1`), zusätzlich `form`, `gutschein_quelle`, `zusatz_gutschein_id_vorlage`.

| Feld | Wert |
|---|---|
| `haushalt_id` | `FA-HH-14729140-000123` (Melderegister, kanal `app`) |
| `papierkarte_id` | `FA-PK-14729140-000123` (wie Desktop App 79c1a3e: reguläre Karte = laufende Nummer des Haushalts, synthetisch, nicht im Ereignislog) |
| `code_anzeige` (Kartennummer) | `FA-PK-14729140-000123-07` |
| `code_barcode` (Inhalt des Strichcodes) | `FAPK1472914000012307` (Code 39, 20 Zeichen, 371 Module wie Becker) |
| `personen[]` | `FA-P-14729140-000014` Marvin, `…-000015` Paul, `…-000016` Sophie, `…-000017` Helga Meier, alle `bestaetigt` |
| `gutschein_id_vorlage` | `FA-V-{MONTAG_YYYYMMDD}-000229` (regulärer Wochengutschein, im Demonstrations-Log `FA-V-20261116-000229`) |
| `zusatz_papierkarte_id` | `FA-PK-14729140-000068` → `FA-PK-14729140-000068-75` / `FAPK1472914000006875` (gedruckte Zusatzkarte Trinkwasser der Desktop App; in der Customer App Zusatzgutschein ohne Strichcode) |
| `zusatz_gutschein_id_vorlage` | `FA-V-{MONTAG_YYYYMMDD}-000227` (Trinkwasser wegen Versorgungsstörung, eigener Gutschein, nicht auf der Karte) |
| `positionen[]` | 4 Personen: Weizenmehl 8 kg, Reis 4,8 kg, Speiseöl 1,4 L, Toilettenpapier 4 Rollen (wie Gutschein 000229) |

Prüfziffer wie Becker: ISO 7064 Mod 97-10 über AGS + laufende Nummer `14729140000123` → `07`,
berechnet mit Kern `FAKern.papierkartenCode("FA-PK-14729140-000123")`.

## Stand Retail heute (geprüft am 27.11.2026 mit der Retail App aus `main` 6debf79/v27, Netto, Kasse 1)

| Eingabe | Ergebnis |
|---|---|
| `FAPK1472914000012307` (Strichcode) | „Lebensmittelkarte nicht gefunden“ |
| `FA-PK-14729140-000123-07` (Kartennummer) | „Lebensmittelkarte nicht gefunden“ |
| `FA-V-20261123-000229` | „Gutschein nicht gefunden“ |
| `FA-V-20261123-000123` | gefunden: Haushalt Meier, 4 Personen |
| `FAPK1472914000006875` (Zusatzkarte Trinkwasser) | „Lebensmittelkarte nicht gefunden“ |

Grund: `findeKarte` nutzt Kern `gutscheinZurPapierkarte`; im Retail-Zustand trägt kein Gutschein `papierkarte_id = FA-PK-14729140-000123`.
Die Retail App lädt nur `demo-becker.json` (`DEMO_DATEI`).

Achtung, unterschiedliche Gutscheinnummern: Der gemeinsame Log `beta/data/ereignislog.jsonl`, den die Retail App liest, führt den
regulären Meier-Gutschein als `FA-V-20261116-000123`. Der Demonstrations-Log der Customer und Desktop App
(`customer-app/data/ereignislog.jsonl`, `desktop/assets/ereignislog.js`) führt ihn als `FA-V-20261116-000229` (Trinkwasser `…-000227`);
dort gehört `FA-V-20261116-000123` zum Haushalt `FA-HH-14729140-000014`. Die Logs bleiben unverändert.

## Was die Retail App ergänzen muss (Vorschlag)

1. Beim Start zusätzlich `../data/demo-meier.json` laden (optional; fehlt die Datei, nichts tun). In `sw.js` unter `OPTIONAL` ergänzen.
2. **Keinen** neuen Demo-Gutschein bauen (nicht `baueDemo`: dessen Nummer `FA-V-<Montag>-` + letzte 6 Stellen der `haushalt_id`
   ergäbe `…-000123` und träfe den vorhandenen Gutschein). Stattdessen im Speicher dem vorhandenen regulären Gutschein des Haushalts
   in der laufenden Woche die Kartennummer zuordnen:
   ```js
   // nach inLaufendeWoche(...) und vor neuBerechnen()
   var ziel = seedGutscheine.concat(gutscheineAusLog)   // je nach Quelle
     .filter(function (g) { return g.haushalt_id === meier.haushalt_id && g.periode_id === "FA-PER-" + montagBerlin() && g.anlass !== "stoerung"; });
   if (ziel.length === 1) ziel[0].papierkarte_id = meier.papierkarte_id;   // nur im Speicher, nicht im Log, nicht im Export
   ```
   Ist der Gutschein ein `VOUCHER_ISSUED` aus dem Log, die Zuordnung nach dem Nachspielen auf `zustand.gutscheine[id]` setzen
   (Kern `gutscheinZurPapierkarte` liest `papierkarte_id`, `code_anzeige` und `code_barcode` daraus ab).
3. Danach funktionieren Strichcode und Kartennummer über den vorhandenen Weg „Lebensmittelkarte“.
   Die Einlösung ist eine normale Einlösung auf den Meier-Gutschein (kein Demo-Sonderweg wie bei Becker). Für die gedruckte Zusatzkarte
   Trinkwasser entsprechend `zusatz_papierkarte_id` dem Trinkwasser-Gutschein des Haushalts zuordnen, sofern die Retail App ihn führt
   (im gemeinsamen Log `beta/data/ereignislog.jsonl` gibt es für Meier keinen Trinkwasser-Gutschein).
4. Die Customer App zeigt unter „Bereits abgeholt“ die Einlösungen aus ihrem Log und, im selben Browser, alle `REDEMPTION_POSTED` in
   `foodallo.retail.ereignisse.v1` mit `ausgabebuchung.haushalt_id = FA-HH-14729140-000123` und `gutschein_id` der laufenden Woche
   (`FA-V-<Montag>-…`, unabhängig von der laufenden Nummer, ohne Trinkwasser), abzüglich `REDEMPTION_REVERSED`.

## Umsetzung Retail App (v28, 27.11.2026)

- Die Retail App lädt `../data/demo-meier.json` (in `sw.js` unter `OPTIONAL`) und `retail-app/daten/desktop-karten.json`
  (aus der Desktopversion gelesene Karten: Schulze regulär/Trinkwasser, Meier regulär/Trinkwasser). Kein `baueDemo` für Meier.
- Reguläre Karte `FA-PK-14729140-000123-07` / `FAPK1472914000012307`: Zuordnung nur im Speicher zum regulären Gutschein der laufenden
  Woche, der zum Haushalt `FA-HH-14729140-000123` gehört (immer über `haushalt_id`, nie über die Gutscheinnummer; im gemeinsamen Log
  `FA-V-<Montag>-000123`). Die Kartennummer wird dem Gutschein nicht ins Objekt geschrieben, sondern über eine Kartentabelle aufgelöst
  (gleiche Wirkung, Kern unverändert). Die Gutscheinnummer `FA-V-<Montag>-000229` aus Customer/Desktop wird ebenfalls auf diesen
  Gutschein abgebildet. Haushalt `FA-HH-14729140-000014` wird nie belastet.
- Zusatzkarte Trinkwasser `FA-PK-14729140-000068-75`: eigener Laufzeit-Gutschein `FA-V-<Montag>-000227` (56 Liter, wie Desktop) samt
  Störung `FA-SD-14729140-000001`; Einlösungen wie bei Becker nur auf diesem Gerät (`demo: true` im Abgleich).
- Demo-Ware „Demo-Anfangsbestand Lebensmittelkarten Meier und Schulze“ an den Ausgabestellen 0001–0006 (nur lokal).
- Abgleich `foodallo.abgleich.retail.v1`: `haushalt_id` `FA-HH-14729140-000123`, `papierkarte_id` = gescannte Karte.
