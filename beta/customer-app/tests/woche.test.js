// Laufende Woche: Abbildung der Logwochen auf die laufende Woche (js/woche.js), ohne den Log zu ändern.
// Aufruf: node tests/woche.test.js   (keine Abhängigkeiten; Wochen werden aus dem Datum berechnet, nicht fest kodiert)
const fs = require("fs"); const path = require("path"); const crypto = require("crypto");
const V = require("../js/voucher.js"); const W = require("../js/woche.js");
let fails = 0, oks = 0;
function ok(name, pass, info) { if (pass) oks++; else { fails++; console.log("FAIL", name, info === undefined ? "" : JSON.stringify(info)); } }

const LOG = path.join(__dirname, "../data/ereignislog.jsonl");
const roh = fs.readFileSync(LOG); const sha = crypto.createHash("sha256").update(roh).digest("hex");
const ereignisse = roh.toString("utf8").split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
const vorher = JSON.stringify(ereignisse);
const personen = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/personen.json"), "utf8"));
const haushalte = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/haushalte.json"), "utf8"));
const bezug = W.bezugsMontag(ereignisse);
ok("Bezugswoche aus dem Log ist ein Montag", /^\d{8}$/.test(bezug) && V.periodFromDate(new Date(bezug.replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3T12:00:00+01:00"))).start_ymd === bezug, bezug);

function montagPlus(ymd, tage) { const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + tage, 12)); return d; }
// Prüfzeitpunkte: heute, Bezugswoche selbst, nächste Woche, Jahreswechsel, Sonntagabend und Montag früh (Berlin)
const zeiten = [new Date(), montagPlus(bezug, 2), montagPlus(bezug, 9), new Date("2027-01-03T22:30:00+01:00"), new Date("2027-01-04T00:30:00+01:00"), new Date("2027-06-15T10:00:00+02:00")];

zeiten.forEach((now) => {
  const per = V.periodFromDate(now); const M = per.start_ymd; const tag = "[" + M + "]";
  const ab = W.abbildung(ereignisse, M);
  ok(tag + " Abbildung nur ausserhalb der Bezugswoche", (M === bezug) === (ab === null), ab);
  // Beispiel aus der Abstimmung mit der Desktopversion
  ok(tag + " FA-V Datum ersetzt, lfd. Nr. bleibt", W.idAbbilden("FA-V-" + bezug + "-000123", ab) === "FA-V-" + M + "-000123");
  ok(tag + " FA-PER", W.idAbbilden("FA-PER-" + bezug, ab) === "FA-PER-" + M);
  ["FA-PK-14729140-000067", "FA-HH-14729140-000001", "FA-P-14729140-000001", "FA-R-14729140-0003", "FA-V-" + M + "-900001"].forEach((id) => {
    ok(tag + " unverändert " + id, W.idAbbilden(id, ab) === id);
  });
  const neu = W.ereignisseAbbilden(ereignisse, ab);
  ok(tag + " Eingabe nicht verändert", JSON.stringify(ereignisse) === vorher);
  ok(tag + " gleiche Anzahl Ereignisse", neu.length === ereignisse.length);
  const gs = neu.filter((e) => e.typ === "VOUCHER_ISSUED").map((e) => e.payload.gutschein);
  const ids = gs.map((g) => g.gutschein_id);
  ok(tag + " gutschein_id eindeutig", new Set(ids).size === ids.length);
  ok(tag + " jüngste Logwoche liegt in der laufenden Woche", W.bezugsMontag(neu) === M, W.bezugsMontag(neu));
  ok(tag + " ID-Datum passt zur periode_id", gs.every((g) => g.gutschein_id.slice(5, 13) === g.periode_id.slice(7)));
  const alt = ereignisse.filter((e) => e.typ === "VOUCHER_ISSUED").map((e) => e.payload.gutschein);
  ok(tag + " lfd. Nr. und Haushalt bleiben", gs.every((g, i) => g.gutschein_id.slice(-6) === alt[i].gutschein_id.slice(-6) && g.haushalt_id === alt[i].haushalt_id && (g.papierkarte_id || null) === (alt[i].papierkarte_id || null)));
  // Jeder bestätigte Haushalt mit Gutschein in der Bezugswoche hat jetzt einen regulären Gutschein der laufenden Woche
  const hhBezug = new Set(alt.filter((g) => g.periode_id === "FA-PER-" + bezug).map((g) => g.haushalt_id));
  const hhJetzt = new Set(gs.filter((g) => g.periode_id === per.periode_id).map((g) => g.haushalt_id));
  ok(tag + " alle Haushalte der Bezugswoche in der laufenden Woche", [...hhBezug].every((h) => hhJetzt.has(h)) && hhBezug.size > 0, hhBezug.size);
  const meier = gs.filter((g) => g.haushalt_id === "FA-HH-14729140-000001" && g.periode_id === per.periode_id);
  ok(tag + " Meier: regulär + Störung in der laufenden Woche", meier.length === 2 && meier.some((g) => g.gutschein_id === "FA-V-" + M + "-000001"), meier.map((g) => g.gutschein_id));
  // Status gültig (nicht abgelaufen) in der laufenden Woche
  const hh = haushalte.find((h) => h.haushalt_id === "FA-HH-14729140-000001");
  const reg = meier.find((g) => V.gutscheinAnlass(g) !== "stoerung");
  const ohne = V.anreichernGutschein(reg, { haushalt: hh, periode: per, ereignisse: neu, einloesungen: [], now, v12: true, optionen: { v12: true } });
  ok(tag + " Meier-Status nicht abgelaufen", ohne.status !== "abgelaufen" && ohne.status !== "storniert", ohne.status);
  // Störung: Beginn rückt mit und ist in der laufenden Woche aktiv (Ende offen)
  if (ab) {
    const st = neu.find((e) => e.typ === "SUPPLY_DISRUPTION_DECLARED");
    ok(tag + " Störungsbeginn verschoben", st && st.payload.beginn.slice(0, 10).replace(/-/g, "") > bezug && st.zeit_ereignis === st.payload.beginn, st && st.payload.beginn);
  }
  // Einlösung aus der Retail App mit alter gutschein_id/periode_id zählt gegen den Gutschein der laufenden Woche
  const red = { ereignis_id: "test-red-1", typ: "REDEMPTION_POSTED", zeit_ereignis: bezug.replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3") + "T12:00:00+01:00", quelle_system: "retail",
    payload: { ausgabebuchung: { gutschein_id: "FA-V-" + bezug + "-000001", periode_id: "FA-PER-" + bezug, haushalt_id: "FA-HH-14729140-000001", artikel_id: "wheat_flour", menge: 2, status: "gebucht" } } };
  const rNeu = W.ereignisseAbbilden([red], ab)[0];
  ok(tag + " Einlösung: gutschein_id abgebildet", rNeu.payload.ausgabebuchung.gutschein_id === reg.gutschein_id, rNeu.payload.ausgabebuchung.gutschein_id);
  ok(tag + " Einlösung: periode_id abgebildet", rNeu.payload.ausgabebuchung.periode_id === per.periode_id);
  ok(tag + " Einlösung: Original unverändert", red.payload.ausgabebuchung.gutschein_id === "FA-V-" + bezug + "-000001");
  const mit = V.anreichernGutschein(reg, { haushalt: hh, periode: per, ereignisse: neu, einloesungen: [rNeu.payload.ausgabebuchung], now, v12: true, optionen: { v12: true } });
  const mehl = (mit.positionen || []).find((p) => p.artikel_id === "wheat_flour");
  ok(tag + " Einlösung zählt (Mehl eingelöst 2)", mehl && Number(mehl.eingeloest) === 2, mehl);
  // Bereits auf die laufende Woche lautende Einlösung bleibt unverändert
  const red2 = JSON.parse(JSON.stringify(red)); red2.payload.ausgabebuchung.gutschein_id = "FA-V-" + M + "-000001"; red2.payload.ausgabebuchung.periode_id = per.periode_id;
  ok(tag + " Einlösung laufende Woche unverändert", W.ereignisseAbbilden([red2], ab)[0].payload.ausgabebuchung.gutschein_id === "FA-V-" + M + "-000001");
  // Personen- und Identitätsereignisse bleiben unverändert
  ok(tag + " andere Ereignisse unverändert", neu.every((e, i) => /^(VOUCHER_|REDEMPTION_|SUPPLY_DISRUPTION_)/.test(e.typ) || JSON.stringify(e) === JSON.stringify(ereignisse[i])));
});

ok("Log-Datei unverändert", crypto.createHash("sha256").update(fs.readFileSync(LOG)).digest("hex") === sha);
// Sichtbare Texte nennen keinen festen Demonstrationszeitraum mehr
const sichtbar = ["../js/ui.js", "../index.html"].map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
ok("kein fester Zeitraum 16.–22.11.2026 im Text", !/Demonstrationszeitraum|16\.–22\.11\.2026/.test(sichtbar));
ok("Hinweis laufende Woche im Text", /immer für die laufende Woche/.test(sichtbar));
void personen;
console.log("---\n" + oks + " ok, FAILS " + fails);
process.exit(fails ? 1 : 0);
