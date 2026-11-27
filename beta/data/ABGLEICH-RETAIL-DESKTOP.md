# Abgleich Retail → Desktop im selben Browser (Schema `foodallo.abgleich.retail`, Version 1)

Demonstration mit fiktiven Daten, nicht im Einsatz bei einer Behörde. Kein Server: Retail App und Desktopversion laufen auf
derselben Herkunft (`https://foodallo.github.io`) und teilen sich deshalb `localStorage` und `BroadcastChannel` desselben Browsers.
Auf einem anderen Gerät oder in einem anderen Browser ist der Abgleich leer; dafür bleibt die Datei „Buchungen als Datei speichern“.

## Speicherort

| | Wert |
|---|---|
| `localStorage`-Schlüssel | `foodallo.abgleich.retail.v1` |
| BroadcastChannel | `foodallo-abgleich` |
| Schreibt | nur die Retail App (`beta/retail-app/js/app.js`, `abgleichSchreiben`) |
| Liest | Desktopversion (und jede andere Seite derselben Herkunft) |

## Regeln

- **Nur anhängen.** Einträge werden nie geändert oder gelöscht, auch nicht durch „Buchungen löschen“ in der Retail App.
- **Je `ereignis_id` höchstens ein Eintrag.** Lesende Seiten deduplizieren trotzdem über `ereignis_id`.
- **Keine Namen**, keine Anschriften, keine abholende Person. Nur IDs (Ausgabestelle, Gutschein, Lebensmittelkarte, Haushalt, Woche).
- Enthalten: jede in Retail gebuchte **Ausgabe** (Gutschein, Lebensmittelkarte inkl. Demonstrationskarte Becker, Insulin auf Rezept),
  jedes **Storno** und jeder **Wareneingang** der Retail App.
- Nicht enthalten: Ereignisse aus dem gemeinsamen Log `ereignislog.jsonl` bzw. dem Szenario-Anfangsbestand, Bestandskorrekturen,
  der automatisch angelegte Demo-Anfangsbestand für die Becker-Karte.
- Wochen-IDs sind die der laufenden Woche (Wochensprung, gleiches Schema wie Customer/Desktop): `FA-PER-{Montag}`, `FA-V-{Montag}-{Nr}`.
- Beim ersten Start mit dieser Version übernimmt Retail die bereits in `foodallo.retail.ereignisse.v1` gespeicherten eigenen Buchungen
  einmal in den Abgleich (`kasse` ist dort `null`). `foodallo.retail.ereignisse.v1` bleibt unverändert bestehen.

## Format

```json
{
  "schema": "foodallo.abgleich.retail",
  "version": 1,
  "aktualisiert": "2026-11-27T14:40:12+01:00",
  "ereignisse": [
    {
      "ereignis_id": "FA-E-3f0c9a2e-8d1b-4c6e-9a77-1b2c3d4e5f60",
      "typ": "ausgabe",
      "zeit": "2026-11-27T14:40:12+01:00",
      "ausgabestelle_id": "FA-R-14729140-0001",
      "kasse": 1,
      "quelle": "retail",
      "buchung_id": "FA-X-20261127-7E60A1",
      "gutschein_id": "FA-V-20261123-900001",
      "rezept_id": null,
      "papierkarte_id": "FA-PK-14729140-900001",
      "haushalt_id": "FA-HH-14729140-900001",
      "periode_id": "FA-PER-20261123",
      "weg": "lebensmittelkarte",
      "positionen": [{ "artikel_id": "wheat_flour", "menge": 6, "einheit": "kg" }],
      "demo": true
    },
    {
      "ereignis_id": "FA-E-…",
      "typ": "storno",
      "zeit": "2026-11-27T14:42:00+01:00",
      "ausgabestelle_id": "FA-R-14729140-0001",
      "kasse": 1,
      "quelle": "retail",
      "buchung_id": "FA-X-20261127-7E60A1",
      "storno_von": "FA-X-20261127-7E60A1",
      "gutschein_id": "FA-V-20261123-900001",
      "papierkarte_id": "FA-PK-14729140-900001",
      "haushalt_id": "FA-HH-14729140-900001",
      "periode_id": "FA-PER-20261123",
      "weg": "lebensmittelkarte",
      "positionen": [{ "artikel_id": "wheat_flour", "menge": 6, "einheit": "kg" }],
      "demo": true
    },
    {
      "ereignis_id": "FA-E-…",
      "typ": "wareneingang",
      "zeit": "2026-11-27T15:00:00+01:00",
      "ausgabestelle_id": "FA-R-14729140-0003",
      "kasse": 2,
      "quelle": "retail",
      "wareneingang_id": "FA-W-20261127-12AB34",
      "gutschein_id": null, "papierkarte_id": null, "haushalt_id": null, "periode_id": null,
      "positionen": [{ "artikel_id": "rice", "menge": 20, "einheit": "kg" }],
      "demo": false
    }
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `typ` | `ausgabe`, `storno` oder `wareneingang` |
| `zeit` | ISO 8601 mit Versatz (Europe/Berlin) |
| `ausgabestelle_id` | `FA-R-…` laut `beta/kern/stammdaten-ausgabestellen.json` |
| `kasse` | Kasse 1–6 der Schicht, `null` bei übernommenen Altbuchungen |
| `buchung_id` | Ausgabebuchung `FA-X-…`; bei `storno` die stornierte Buchung (`storno_von` gleich) |
| `gutschein_id` / `rezept_id` | genau eins davon bei `ausgabe`/`storno` (Insulin: `rezept_id`) |
| `papierkarte_id` | bei Lebensmittelkarten die **gescannte bzw. eingegebene** Karte `FA-PK-…` (bei Karten der Desktopversion deren Nummer, z. B. Schulze `FA-PK-14729140-000067`), sonst die Karte des Gutscheins oder `null` |
| `alias_von` | optional (ab Retail v28): nur wenn die gescannte Karte in der Retail App unter einer anderen Nummer geführt wird, die Retail-Nummer (Schulze: `FA-PK-14729140-000124`). Fehlt sonst. |
| `haushalt_id`, `periode_id` | Haushalt `FA-HH-…`, Woche `FA-PER-{Montag}` |
| `weg` | `gutschein`, `lebensmittelkarte` oder `rezept` |
| `positionen[]` | `artikel_id` (Schlüssel aus `retail-app/daten/artikel.json`), `menge` (kanonische Einheit), `einheit` (`kg`, `L`, `rolle`, `IE`, `pack`) |
| `demo` | `true` bei der Demonstrationskarte Becker (`FA-V-…-900001`) und den Zusatzkarten Trinkwasser der Desktopversion (Meier `FA-V-…-000227`, Schulze `FA-V-…-000228`), die die Retail App nur zur Laufzeit führt |

Zuordnung immer über `haushalt_id` (Gutscheinnummern weichen zwischen gemeinsamem Log und Customer-/Desktop-Log ab: Meier regulär
`FA-V-…-000123` im gemeinsamen Log, `FA-V-…-000229` in Customer/Desktop). Ein Storno trägt dieselbe `papierkarte_id` wie seine Ausgabe.

Ein Storno hebt die Ausgabe mit derselben `buchung_id` auf (Menge wieder frei). Neue Felder werden nur ergänzt; eine inkompatible
Änderung bekommt einen neuen Schlüssel (`…v2`) und `version: 2`.

## Lesen in der Desktopversion

```js
var SCHLUESSEL = "foodallo.abgleich.retail.v1";
function retailLesen() {
  try { var d = JSON.parse(localStorage.getItem(SCHLUESSEL) || "null"); } catch (e) { d = null; }
  return d && d.schema === "foodallo.abgleich.retail" && d.version === 1 ? d.ereignisse : [];
}
// 1. Beim Laden immer lesen (die Ereignisse sind schon da, wenn Retail vorher gebucht hat)
var bekannt = {};
function uebernehmen(liste) { liste.forEach(function (x) { if (!bekannt[x.ereignis_id]) { bekannt[x.ereignis_id] = true; /* anzeigen */ } }); }
uebernehmen(retailLesen());
// 2. Andere Tabs: storage-Ereignis (feuert nicht im schreibenden Tab)
window.addEventListener("storage", function (ev) { if (ev.key === SCHLUESSEL) uebernehmen(retailLesen()); });
// 3. Zusätzlich BroadcastChannel (alle Tabs/Fenster derselben Herkunft; Nachricht enthält die neuen Einträge)
if (typeof BroadcastChannel === "function") new BroadcastChannel("foodallo-abgleich").onmessage = function (m) {
  if (m.data && m.data.schema === "foodallo.abgleich.retail") uebernehmen(retailLesen());
};
```

Nachricht im Kanal `foodallo-abgleich`:
`{ "schema": "foodallo.abgleich.retail", "version": 1, "schluessel": "foodallo.abgleich.retail.v1", "neu": [ …Einträge… ], "anzahl": 12 }`
