# FoodAllo – Retail-App (Demonstration)

**Demonstration mit fiktiven Daten, nicht im Einsatz bei einer Behörde.** Alle Personen, Haushalte, Gutscheine, Bestände und Vorgänge sind erfunden.
Musterstadt und Musterdorf sind fiktive Ortsnamen, die Postleitzahl 12345 ist fiktiv.

## Starten

Im Hauptordner des Repositorys `foodallo-beta-system` einen lokalen HTTP-Server starten:

```
python3 -m http.server 8000
```

Danach im Browser `http://127.0.0.1:8000/beta/retail-app/` öffnen.

Schicht an einer Ausgabestelle beginnen und einen Übungs-Gutschein oder eine Papierkarte einlösen. Nach dem ersten Laden auch offline nutzbar.

## Inhalt

- `retail-app/` – Kassen-App (Oberfläche, Logos, Übungsdaten)
- `kern/` – Regelkern und Ausgabestellen (Straßen und Hausnummern bleiben, PLZ 12345)
- `schema/` – Ereignisschema v1.2
- `data/ereignislog.jsonl` – fiktiver Demonstrations-Ereignislog (siehe `data/ereignislog-hinweis.txt`)

## Hinweise

- © [OpenStreetMap-Mitwirkende](https://www.openstreetmap.org/copyright), [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Ortsnamen durch Musterstadt und Musterdorf ersetzt. Keine Partnerschaft mit den genannten Geschäften.
- Behördenbezeichnungen dienen nur der Darstellung von Zuständigkeiten; keine Behörde setzt dieses Verfahren ein.
