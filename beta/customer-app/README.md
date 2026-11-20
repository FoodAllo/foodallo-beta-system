# FoodAllo Customer App

Demonstration mit fiktiven Daten, nicht im Einsatz bei einer Behörde.

Lokale Bürgeroberfläche für den Haushaltsgutschein der Musterstadt (Beta). Die App läuft vollständig auf diesem Gerät. Es wird nichts an einen Server gesendet; neue Angaben bleiben im Speicher des Browsers (localStorage).

## Start

Im Ordner dieser Paketdateien einen lokalen Webserver starten, zum Beispiel:

```
python3 -m http.server 8000 --bind 127.0.0.1
```

Anschließend im Browser `http://127.0.0.1:8000/` öffnen. Die Dateien müssen über HTTP geladen werden, nicht als `file://`.

## Ausprobieren

Auf dem Anmeldebildschirm gibt es einen Besucherzugang:

- **Als Familie Meier ausprobieren** — bestätigt angemeldet, mit Haushaltsgutschein
- **Als Familie Müller ausprobieren** — Wartebildschirm, Identität wird noch geprüft

Dafür müssen Sie nichts eingeben. Der Zugang gilt nur in diesem Browser.

## Inhalt

- Gutschein, Ausgabestellen und Hinweise in verständlicher Sprache
- Anmeldung über Anmeldenummer, Meldebehörde oder eine lokale Ausweis-Übung (kein echter Ausweis-Dienst)
- Ortsnamen in der Anzeige: Musterstadt und Musterdorf. Sichtbare Postleitzahl: 12345. Straßennamen und Hausnummern der Geschäfte bleiben erhalten.
- Meldebehörde der Musterstadt, Markt 13–15, 12345 Musterstadt

Die mitgelieferten Daten (Log, Register, Kernregeln, Ausgabestellen) sind schreibgeschützte Kopien für diese Demonstration. Die App schreibt nicht in diese Dateien.

## Kartendaten

Kartendaten: © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), [Open Database License](https://opendatacommons.org/licenses/odbl/).

## Logo

Oranges FoodAllo-Logo der verbindlichen Bildmarke, in der Kopfzeile auf weißem Grund.

