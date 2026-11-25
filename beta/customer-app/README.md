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

- **Als Familie Meier ausprobieren** — Identität bestätigt; der Haushaltsgutschein gilt für den Demonstrationszeitraum 16.–22.11.2026 und erscheint in der App nur in diesem Zeitraum
- **Als Familie Müller ausprobieren** — Wartebildschirm, Identität wird noch geprüft

Dafür müssen Sie nichts eingeben. Der Zugang gilt nur in diesem Browser.

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

