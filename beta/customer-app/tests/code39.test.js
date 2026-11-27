// Prüft js/code39.js gegen die Code-39-Normtabelle (ISO/IEC 16388, Modulschreibweise 1:3,
// identisch mit python-barcode barcode.charsets.code39) und dekodiert den Becker- und den Meier-Strichcode zurück.
// Aufruf: node beta/customer-app/tests/code39.test.js   (ohne Abhängigkeiten)
"use strict";
const assert = require("assert");
const C = require("../js/code39.js");
const D = require("../js/demokarte.js");
const ERWARTET = "FAPK1472914090000177";
// Normtabelle in Modulen (1 = Strich, 0 = Lücke; breit = 3 Module), Start/Stopp "*".
const NORM = {"0": "101000111011101", "1": "111010001010111", "2": "101110001010111", "3": "111011100010101", "4": "101000111010111", "5": "111010001110101", "6": "101110001110101", "7": "101000101110111", "8": "111010001011101", "9": "101110001011101", "A": "111010100010111", "B": "101110100010111", "C": "111011101000101", "D": "101011100010111", "E": "111010111000101", "F": "101110111000101", "G": "101010001110111", "H": "111010100011101", "I": "101110100011101", "J": "101011100011101", "K": "111010101000111", "L": "101110101000111", "M": "111011101010001", "N": "101011101000111", "O": "111010111010001", "P": "101110111010001", "Q": "101010111000111", "R": "111010101110001", "S": "101110101110001", "T": "101011101110001", "U": "111000101010111", "V": "100011101010111", "W": "111000111010101", "X": "100010111010111", "Y": "111000101110101", "Z": "100011101110101", "-": "100010101110111", ".": "111000101011101", " ": "100011101011101", "$": "100010001000101", "/": "100010001010001", "+": "100010100010001", "%": "101000100010001", "*": "100010111011101"};

let fehler = 0;
function pruefe(name, fn) { try { fn(); console.log("ok  ", name); } catch (e) { fehler++; console.log("FAIL", name, "-", e.message); } }

function alsModule(nw) {
  let s = "";
  for (let j = 0; j < 9; j++) s += (j % 2 === 0 ? "1" : "0").repeat(nw[j] === "w" ? 3 : 1);
  return s;
}

pruefe("43 Zeichen + Start/Stopp vorhanden", () => assert.deepStrictEqual(Object.keys(C.MUSTER).sort(), Object.keys(NORM).sort()));
pruefe("je Zeichen 9 Elemente, genau 3 breit", () => {
  for (const [k, m] of Object.entries(C.MUSTER)) {
    assert.ok(/^[nw]{9}$/.test(m), k);
    assert.strictEqual((m.match(/w/g) || []).length, 3, k);
  }
});
pruefe("Tabelle gleich Normtabelle", () => {
  for (const [k, m] of Object.entries(C.MUSTER)) assert.strictEqual(alsModule(m), NORM[k], "Zeichen " + k);
});
pruefe("Ruhezone >= 10 Module, Verhältnis 1:3", () => { assert.ok(C.RUHEZONE >= 10); assert.ok(C.BREIT >= 2.5 && C.BREIT <= 3); });
pruefe("Kern-Code der Becker-Karte", () => {
  const k = D.papierCode("FA-PK-14729140-900001");
  assert.strictEqual(k.code_anzeige, "FA-PK-14729140-900001-77");
  assert.strictEqual(k.code_barcode, ERWARTET);
});
pruefe("Strichfolge dekodiert (Normtabelle) zu " + ERWARTET, () => {
  const r = C.striche(ERWARTET);
  let mod = "0".repeat(r.breite);
  const arr = mod.split("");
  r.striche.forEach(s => { for (let i = 0; i < s.w; i++) arr[s.x + i] = "1"; });
  mod = arr.join("");
  assert.ok(mod.startsWith("0".repeat(C.RUHEZONE)) && mod.endsWith("0".repeat(C.RUHEZONE)), "Ruhezone");
  const inner = mod.slice(C.RUHEZONE, mod.length - C.RUHEZONE);
  const rueck = {}; for (const [k, v] of Object.entries(NORM)) rueck[v] = k;
  let pos = 0, text = "";
  while (pos < inner.length) {
    const z = rueck[inner.substr(pos, 15)];
    assert.ok(z, "unbekanntes Muster an Modul " + pos);
    text += z; pos += 15;
    if (pos < inner.length) { assert.strictEqual(inner[pos], "0", "Zeichenlücke"); pos += 1; }
  }
  assert.strictEqual(text, "*" + ERWARTET + "*");
});
pruefe("SVG enthält Ruhezone und Beschriftung", () => {
  const svg = C.svg(ERWARTET);
  assert.ok(svg.includes('aria-label="Strichcode ' + ERWARTET + '"'));
  assert.ok(svg.includes('<rect x="0" y="0"'));
});
pruefe("svgPx: Koordinaten in ganzen Modulen, feste Größe = Module × Modulbreite, Ruhezone, Schwarz auf Weiß", () => {
  for (const m of [1, 2, 3, 1.5, 5 / 2.625, 2 / 3]) {
    for (const senk of [false, true]) {
      const svg = C.svgPx(ERWARTET, { modul: m, hoehe: 120, senkrecht: senk });
      const z = C.module(ERWARTET), laenge = Math.round(z * m * 10000) / 10000;
      const w = senk ? 120 : laenge, h = senk ? laenge : 120;
      assert.ok(svg.includes('width="' + w + '" height="' + h + '"'), "Maße (m=" + m + ", senkrecht=" + senk + ")");
      assert.ok(svg.includes('viewBox="' + (senk ? "0 0 1 " + z : "0 0 " + z + " 1") + '"'));
      assert.ok(svg.includes('shape-rendering="crispEdges"') && svg.includes('preserveAspectRatio="none"'));
      assert.ok(svg.includes('fill="#fff"') && svg.includes('fill="#000"'));
      const re = senk ? /<rect x="0" y="(\d+)" width="1" height="(\d+)"\/>/g : /<rect x="(\d+)" y="0" width="(\d+)" height="1"\/>/g;
      const rects = [...svg.matchAll(re)].map(r => [Number(r[1]), Number(r[2])]);
      assert.strictEqual(rects.length, C.striche(ERWARTET).striche.length);
      rects.forEach(([x, b]) => assert.ok(b === 1 || b === 3));
      assert.ok(rects[0][0] >= 10, "Ruhezone vorn");
      assert.ok(z - (rects[rects.length - 1][0] + rects[rects.length - 1][1]) >= 10, "Ruhezone hinten");
    }
  }
});
pruefe("Modulbreite in ganzen Gerätepixeln (n / DPR) und Großanzeige-Maße für Telefon-Viewports", () => {
  const z = C.module(ERWARTET);
  assert.strictEqual(z, 371, "371 Module für 20 Zeichen");
  // Beispiele aus der Vorgabe: DPR 2 → 3 Gerätepx = 1,5 CSS-px; DPR 3 → 5 Gerätepx
  assert.deepStrictEqual([D.modulGeraet(ERWARTET, 3 * 371 / 2, 2).n, D.modulGeraet(ERWARTET, 3 * 371 / 2, 2).css], [3, 1.5]);
  assert.strictEqual(D.modulGeraet(ERWARTET, 5 * 371 / 3, 3).n, 5);
  for (const dpr of [1, 2, 2.625, 3]) {
    for (const laenge of [150, 300, 352, 359, 389, 411, 742, 799, 1264]) {
      const g = D.modulGeraet(ERWARTET, laenge, dpr);
      assert.ok(g.laenge <= laenge + 1e-9, "passt in die Breite");
      if (g.n) {
        assert.ok(Math.abs(g.css * dpr - g.n) < 1e-9, "ganze Gerätepixel");
        assert.ok((g.n + 1) * z / dpr > laenge, "größtes n");
      } else assert.ok(laenge * dpr < z, "eingepasst nur unter 1 Gerätepixel je Modul");
    }
  }
  for (const [w, h] of [[360, 800], [390, 844], [412, 915]]) {
    for (const dpr of [2, 2.625, 3]) {
      for (const [W, H] of [[w, h], [h, w]]) {
        const g = D.grossMasse(ERWARTET, W, H, dpr);
        assert.ok(g.css >= 1.5, `${W}×${H}@${dpr}: ${g.css} CSS-px je Modul`);
        assert.ok(g.laenge >= 560, `${W}×${H}@${dpr}: Länge ${g.laenge}`);
        assert.ok(g.hoehe >= 60 && g.hoehe >= 0.15 * g.laenge, `${W}×${H}@${dpr}: Höhe ${g.hoehe}`);
        assert.ok(g.laenge <= (g.hoch ? H : W) - 16 && g.hoehe <= (g.hoch ? W : H) - 16, "passt auf den Bildschirm");
        assert.strictEqual(g.hoch, H > W);
      }
    }
  }
  const d = D.grossMasse(ERWARTET, 1280, 800, 1);
  assert.ok(d.n === 3 && d.laenge === 1113, "1280: 3 px je Modul");
});

// ---- Familie Meier: digitale Lebensmittelkarte (geprüfter Haushalt FA-HH-14729140-000123), Becker unverändert
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const MEIER = "FAPK1472914000012307";
function dekodiere(text) {
  const r = C.striche(text), arr = "0".repeat(r.breite).split("");
  r.striche.forEach(s => { for (let i = 0; i < s.w; i++) arr[s.x + i] = "1"; });
  const mod = arr.join(""), inner = mod.slice(C.RUHEZONE, mod.length - C.RUHEZONE);
  const rueck = {}; for (const [k, v] of Object.entries(NORM)) rueck[v] = k;
  let pos = 0, out = "";
  while (pos < inner.length) { const z = rueck[inner.substr(pos, 15)]; assert.ok(z, "Muster an Modul " + pos); out += z; pos += 16; }
  return out;
}
pruefe("Meier: Kern papierkartenCode FA-PK-14729140-000123 (wie Desktop 79c1a3e) -> -07 / " + MEIER, () => {
  const K = require("../../kern/foodallo_kern.js");
  const k = K.papierkartenCode("FA-PK-14729140-000123");
  assert.strictEqual(k.code_anzeige, "FA-PK-14729140-000123-07");
  assert.strictEqual(k.code_barcode, MEIER);
  // ISO 7064 Mod 97-10 von Hand
  let r = 0; for (const c of "14729140000123") r = (r * 10 + Number(c)) % 97;
  assert.strictEqual(String(98 - (r * 100) % 97).padStart(2, "0"), "07");
  assert.deepStrictEqual(D.papierCode("FA-PK-14729140-000123"), { code_anzeige: k.code_anzeige, code_barcode: k.code_barcode });
});
const K2 = require("../../kern/foodallo_kern.js");
pruefe("Meier: demo-meier.json (beta/data und Customer-Kopie byte-gleich) passt zu Kern, Haushalt und Log", () => {
  const a = fs.readFileSync(path.join(__dirname, "../../data/demo-meier.json")), b = fs.readFileSync(path.join(__dirname, "../data/demo-meier.json"));
  assert.ok(a.equals(b), "Kopien gleich");
  const m = JSON.parse(a);
  assert.strictEqual(m.haushalt_id, "FA-HH-14729140-000123");
  assert.strictEqual(m.papierkarte_id, "FA-PK-14729140-000123");
  assert.strictEqual(m.zusatz_code_barcode, K2.papierkartenCode(m.zusatz_papierkarte_id).code_barcode);
  assert.strictEqual(m.code_anzeige, "FA-PK-14729140-000123-07");
  assert.strictEqual(m.code_barcode, MEIER);
  assert.strictEqual(m.gutschein_id_vorlage, "FA-V-{MONTAG_YYYYMMDD}-000229");
  assert.strictEqual(m.zusatz_gutschein_id_vorlage, "FA-V-{MONTAG_YYYYMMDD}-000227");
  assert.deepStrictEqual(m.personen.map(p => p.person_id), ["FA-P-14729140-000014", "FA-P-14729140-000015", "FA-P-14729140-000016", "FA-P-14729140-000017"]);
  const log = fs.readFileSync(path.join(__dirname, "../data/ereignislog.jsonl"), "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const g = log.find(e => e.typ === "VOUCHER_ISSUED" && e.payload.gutschein.gutschein_id === "FA-V-20261116-000229").payload.gutschein;
  assert.strictEqual(g.haushalt_id, m.haushalt_id);
  for (const p of m.positionen) assert.strictEqual(g.positionen.find(x => x.artikel_id === p.artikel_id).zugeteilt_max, p.zugeteilt_max, p.artikel_id);
  const w = log.find(e => e.typ === "VOUCHER_ISSUED" && e.payload.gutschein.gutschein_id === "FA-V-20261116-000227").payload.gutschein;
  assert.strictEqual(w.haushalt_id, m.haushalt_id);
  assert.ok(!JSON.stringify(m).includes("OSM"));
});
pruefe("Meier: Strichfolge dekodiert zu " + MEIER + ", 371 Module wie Becker", () => {
  assert.strictEqual(dekodiere(MEIER), "*" + MEIER + "*");
  assert.strictEqual(C.module(MEIER), 371);
  assert.strictEqual(C.module(ERWARTET), 371);
});
if (typeof global.localStorage === "undefined") global.localStorage = { getItem: () => null };
const V = require("../js/voucher.js"), UI = require("../js/ui.js");
const PERIODE = V.periodFromDate(new Date("2026-11-25T12:00:00+01:00"));
pruefe("Becker: Karte unverändert (HTML-Prüfsumme wie vor der Meier-Änderung)", () => {
  const h = D.render({ demo: require("../data/demo-karte.json"), artikel: require("../data/artikel.json"), periode: PERIODE, UI });
  assert.strictEqual(crypto.createHash("sha256").update(h).digest("hex"), "4edeed764987f47111fe08eed09ffa3c9b297eb15b7dd828fb717ed90d22b591");
  assert.ok(fs.readFileSync(path.join(__dirname, "../../data/demo-becker.json")).equals(fs.readFileSync(path.join(__dirname, "../data/demo-karte.json"))));
});
pruefe("Meier: Karte mit Status Gültig, Woche Mo–So, Kartennummer, Strichcode, Groß anzeigen, Mengen aus dem Gutschein", () => {
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/demo-meier.json")));
  const pos = m.positionen.map(p => ({ artikel_id: p.artikel_id, bezeichnung: p.artikel_id, einheit: p.einheit, je_person: p.je_person, zugeteilt_max: p.zugeteilt_max, eingeloest: p.artikel_id === "rice" ? 1.2 : 0 }));
  const h = D.render({ demo: m, artikel: require("../data/artikel.json"), periode: PERIODE, UI, positionen: pos, lokal: { oil: 0.35 },
    metaZusatz: [{ dt: "Gutschein dieser Woche", dd: "FA-V-20261123-000229" }], formHinweis: "digital" });
  assert.ok(h.includes('class="pill status-gueltig">Gültig'));
  assert.ok(h.includes("Montag, 23.11.2026 bis Sonntag, 29.11.2026"));
  assert.ok(h.includes('data-code="' + MEIER + '"') && h.includes('data-nummer="FA-PK-14729140-000123-07"'));
  assert.ok(h.includes('<p class="lk-nummer">FA-PK-14729140-000123-07</p>'));
  assert.ok(h.includes("Groß anzeigen") && h.includes('aria-label="Strichcode ' + MEIER + '"'));
  assert.ok(h.includes("FA-V-20261123-000229"));
  assert.ok(/rice<span.*?1,2\u00a0kg<\/td><td class="num"><strong>3,6\u00a0kg/.test(h), "Reis: 1,2 kg abgeholt, 3,6 kg bleiben");
  assert.ok(/oil<span.*?0,35\u00a0Liter<\/td><td class="num"><strong>1,05\u00a0Liter/.test(h), "Öl: lokale Retail-Einlösung");
  assert.ok(h.includes("Teilweise abgeholt"));
  assert.ok(!/OSM|startklar|kostenlos|ready to use/i.test(h));
});
console.log(fehler ? "FAILS " + fehler : "FAILS 0");
process.exit(fehler ? 1 : 0);
