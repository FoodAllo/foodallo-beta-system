# FoodAllo Customer App

Demonstration mit fiktiven Daten, nicht im Einsatz bei einer Behörde.

Lokale Bürgeroberfläche für den Haushaltsgutschein der Musterstadt (Beta). Die App läuft vollständig auf diesem Gerät. Es wird nichts an einen Server gesendet; neue Angaben bleiben im Speicher des Browsers (localStorage).

## Start

Im Ordner dieser Paketdateien einen lokalen Webserver starten, zum Beispiel:

```
python3 -m http.server 8000 --bind 127.0.0.1
```

Anschließend im Browser `http://127.0.0.1:8000/` öffnen. Die Customer App lädt ihre Daten per `fetch`. Das funktioniert in gängigen Browsern nicht über `file://` — im Gegensatz zur Desktopversion und zur Retail App, die sich so öffnen lassen.

## Ausprobieren

Auf dem Anmeldebildschirm gibt es einen Besucherzugang:

- **Als Familie Meier ausprobieren** — Identität bestätigt; der Haushaltsgutschein gilt in dieser Demonstration immer für die laufende Woche, Montag bis Sonntag (siehe „Laufende Woche“ unten)
- **Als Familie Müller ausprobieren** — Wartebildschirm, Identität wird noch geprüft
- **Als Familie Becker ausprobieren (Lebensmittelkarte)** — zeigt sofort eine gültige Lebensmittelkarte zum Vorzeigen (Kartennummer, Strichcode, Mengen der laufenden Woche). Die Karte gilt in dieser Demonstration immer für die laufende Woche, Montag bis Sonntag. Direkter Link: `…/customer-app/#lebensmittelkarte`. Familie Becker ist erfunden und steht nicht im Melderegister und nicht im gemeinsamen Ereignislog. Datensatz: `../data/demo-becker.json` (gemeinsam mit der Retail App), Kopie im Paket: `data/demo-karte.json`. Die Retail App bucht Abholungen auf diese Karte nur lokal im Gerät; im selben Browser zeigt die Customer App sie unter „Bereits abgeholt“. Spezifikation für die Retail App: `../data/DEMO-BECKER-RETAIL.md`.

Dafür müssen Sie nichts eingeben. Der Zugang gilt nur in diesem Browser.

## Laufende Woche

Alle Apps zeigen in dieser Demonstration die laufende Woche, Montag bis Sonntag (Europe/Berlin). Der gemeinsame Ereignislog bleibt unverändert; die Customer App bildet ihn nur zur Laufzeit ab (`js/woche.js`):

- Bezugswoche ist die jüngste Woche im Log (16.–22.11.2026). Sie wird auf die laufende Woche gelegt; ältere Logwochen rücken um denselben Abstand mit.
- `periode_id` `FA-PER-<Montag>` wird zu `FA-PER-<Montag der laufenden Woche>`.
- `gutschein_id` `FA-V-<Montag>-<lfd. Nr.>` behält die laufende Nummer, nur das Datum wird ersetzt, z. B. in der Woche ab 23.11.2026 `FA-V-20261116-000123` → `FA-V-20261123-000123`.
- IDs ohne Datum (`FA-PK`, `FA-HH`, `FA-P`, `FA-R` …) bleiben unverändert.
- Einlösungen mit alten `gutschein_id`/`periode_id` werden genauso abgebildet und zählen gegen den Gutschein der laufenden Woche.
- Zeitangaben von Gutschein-, Einlösungs- und Störungsereignissen rücken um denselben Abstand.

## Inhalt

- Gutschein, Ausgabestellen und Hinweise in verständlicher Sprache
- Anmeldung über Anmeldenummer, Pass- und Meldebehörde oder eine lokale Ausweis-Übung (kein echter Ausweis-Dienst)
- Ortsnamen in der Anzeige: Musterstadt und Musterdorf. Sichtbare Postleitzahl: 12345. Straßennamen und Hausnummern der Geschäfte bleiben erhalten.
- Pass- und Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt

Die mitgelieferten Daten (Log, Register, Kernregeln, Ausgabestellen) sind schreibgeschützte Kopien für diese Demonstration. Die App schreibt nicht in diese Dateien.

## Kartendaten

Kartendaten: © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), [Open Database License](https://opendatacommons.org/licenses/odbl/).

## Logo

Oranges FoodAllo-Logo der verbindlichen Bildmarke, in der Kopfzeile auf weißem Grund.

