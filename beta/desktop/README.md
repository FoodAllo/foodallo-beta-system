# FoodAllo – Fachverfahren Lebensmittelversorgung (Desktopversion, Demonstration)

**Demonstration mit fiktiven Daten, nicht im Einsatz bei einer Behörde.** Alle Personen, Haushalte, Karten, Bestände und Vorgänge sind erfunden.
Musterstadt und Musterdorf sind fiktive Ortsnamen, die PLZ 12345 ist fiktiv.

## Starten

`index.html` im Browser öffnen (funktioniert offline über `file://`, ohne externe Bibliotheken).
Anmeldung über Dienststelle und Arbeitsplatz, ohne Passwort.

- Pass- und Meldebehörde Musterstadt: Arbeitskorb, Schalter, Haushalte, Lebensmittelkarten (A4/A6), Melderegister, Ausgabestellen.
- Übergeordnete Dienststellen: Bestands- und Ausgabeübersicht, Versorgungsstörungen, Ausgabestellen und Bestände zusammengefasst; kleine Zahlen (unter 5) werden nicht ausgewiesen.

## Inhalt

- `index.html`, `assets/` – Oberfläche, Daten als JavaScript (fiktiv), Logos

## Hinweise

- Filialdaten © OpenStreetMap-Mitwirkende, verfügbar unter der Open Database License (ODbL), https://www.openstreetmap.org/copyright. Keine Partnerschaft mit den genannten Geschäften.
- Behördenbezeichnungen dienen nur der Darstellung von Zuständigkeiten; keine Behörde setzt dieses Verfahren ein.
- Die Desktopversion zeigt immer die laufende Woche (Montag bis Sonntag, Europe/Berlin), wie Customer App und Retail App. Die Szenario-Daten der Woche 16.11.–22.11.2026 werden dafür nur zur Laufzeit um ganze Wochen verschoben (assets/woche.js); die Dateien und der Ereignislog bleiben unverändert.
- Ausgaben und Bestände in der Desktopversion sind Szenariodaten. Buchungen, Wareneingänge und Bestandskorrekturen der Retail-App sind dort nicht eingerechnet.
- Beta-Version · fiktive Daten · keine amtlichen Dokumente.
