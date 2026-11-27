// Rendert die Becker-Lebensmittelkarte in Chrome und Firefox bei 390 und 1280 px, fotografiert sie
// und dekodiert den Strichcode mit zxing (code39_decode.py). Erwartet FAPK1472914090000177.
// Aufruf: node code39-decode.js <basis-url des Repos> [ausgabeordner]
//   z. B. node code39-decode.js http://127.0.0.1:8000 /tmp/code39
// Umgebung: PLAYWRIGHT (Modulpfad, Standard "playwright"), CHROME (Standard /usr/bin/google-chrome), PYTHON (Standard python3)
"use strict";
const path = require("path"), fs = require("fs"), { execFileSync } = require("child_process");
const pw = require(process.env.PLAYWRIGHT || "playwright");
const basis = (process.argv[2] || "http://127.0.0.1:8000").replace(/\/$/, "");
const aus = process.argv[3] || "/tmp/code39-decode";
fs.mkdirSync(aus, { recursive: true });
(async () => {
  const bilder = [];
  for (const [name, typ, opt] of [["chrome", pw.chromium, { executablePath: process.env.CHROME || "/usr/bin/google-chrome" }], ["firefox", pw.firefox, {}]]) {
    const b = await typ.launch(opt);
    for (const breite of [390, 1280]) {
      const c = await b.newContext({ locale: "de-DE", viewport: { width: breite, height: breite === 390 ? 844 : 800 }, deviceScaleFactor: 1 });
      const p = await c.newPage();
      await p.goto(basis + "/beta/customer-app/#lebensmittelkarte", { waitUntil: "load" });
      await p.waitForSelector(".karte-strichcode", { timeout: 20000 });
      await p.$eval(".lk-code", e => e.scrollIntoView({ block: "center" }));
      await p.waitForTimeout(300);
      const datei = path.join(aus, `code39-${name}-${breite}.png`);
      await p.screenshot({ path: datei });
      bilder.push(datei);
      await c.close();
    }
    await b.close();
  }
  try {
    execFileSync(process.env.PYTHON || "python3", [path.join(__dirname, "code39_decode.py"), ...bilder], { stdio: "inherit" });
  } catch (e) { process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
