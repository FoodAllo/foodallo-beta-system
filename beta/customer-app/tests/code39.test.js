// Prüft js/code39.js gegen die Code-39-Normtabelle (ISO/IEC 16388, Modulschreibweise 1:3,
// identisch mit python-barcode barcode.charsets.code39) und dekodiert den Becker-Strichcode zurück.
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
console.log(fehler ? "FAILS " + fehler : "FAILS 0");
process.exit(fehler ? 1 : 0);
