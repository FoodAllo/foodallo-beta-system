// Rendert die Becker-Lebensmittelkarte in Chrome und Firefox bei 390×844, 844×390 und 1280 px (inline und Groß-Anzeige), fotografiert sie
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
let fehler = 0;
(async () => {
  const bilder = [];
  for (const [name, typ, opt] of [["chrome", pw.chromium, { executablePath: process.env.CHROME || "/usr/bin/google-chrome" }], ["firefox", pw.firefox, {}]]) {
    const b = await typ.launch(opt);
    for (const [tag, vp] of [["390", { width: 390, height: 844 }], ["844quer", { width: 844, height: 390 }], ["1280", { width: 1280, height: 800 }]]) {
      const c = await b.newContext({ locale: "de-DE", viewport: vp, deviceScaleFactor: 1 });
      const p = await c.newPage();
      await p.goto(basis + "/beta/customer-app/#lebensmittelkarte", { waitUntil: "load" });
      await p.waitForSelector(".karte-strichcode", { timeout: 20000 });
      await p.$eval(".lk-code", e => e.scrollIntoView({ block: "center" }));
      await p.waitForTimeout(300);
      const datei = path.join(aus, `code39-${name}-${tag}.png`);
      await p.screenshot({ path: datei });
      bilder.push(datei);
      // Groß-Anzeige (Vollbild, ganzzahlige Module, hochkant gedreht)
      await p.click("[data-gross-anzeigen]");
      await p.waitForSelector("#lk-gross .lk-gross-code", { timeout: 5000 });
      await p.waitForTimeout(200);
      const modul = Number(await p.getAttribute("#lk-gross", "data-modul"));
      if (!(modul >= 2 && Number.isInteger(modul))) { console.log(`FAIL ${name} ${tag}: Modulbreite Groß-Anzeige ${modul}`); fehler++; }
      const gross = path.join(aus, `code39-${name}-${tag}-gross.png`);
      await p.screenshot({ path: gross });
      bilder.push(gross);
      await p.click(".lk-gross-zu");
      if (await p.$("#lk-gross")) { console.log(`FAIL ${name} ${tag}: Groß-Anzeige schließt nicht`); fehler++; }
      console.log(`info ${name} ${tag}: Groß-Anzeige ${modul} px je Modul`);
      await c.close();
    }
    await b.close();
  }
  if (fehler) process.exit(1);
  try {
    execFileSync(process.env.PYTHON || "python3", [path.join(__dirname, "code39_decode.py"), ...bilder], { stdio: "inherit" });
  } catch (e) { process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
