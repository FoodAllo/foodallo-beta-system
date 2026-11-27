// Rendert die Becker-Lebensmittelkarte in Chrome und Firefox für Telefon-Viewports (360×800, 390×844, 412×915;
// DPR 2, 2,625 und 3; hoch und quer) und 1280×800, inline und in der Groß-Anzeige. Prüft:
//   - Modulbreite in ganzen Gerätepixeln (n / DPR CSS-px), Groß-Anzeige auf Telefonen ≥ 1,5 CSS-px, Länge ≥ 560 CSS-px, Höhe ≥ 60 px
//   - nichts ragt über den Bildschirm (Strichcode innerhalb 0…Fensterbreite, keine waagrechte Scrollbreite)
//   - Ruhezone ≥ 10 Module auf beiden Seiten, Strichbreiten exakt n bzw. 3n Gerätepixel (code39_pixel.py)
//   - zxing dekodiert FAPK1472914090000177 aus dem Bildschirmfoto (code39_decode.py)
// Aufruf: node code39-decode.js <basis-url des Repos> [ausgabeordner] [schnell]
// Umgebung: PLAYWRIGHT (Modulpfad, Standard "playwright"), CHROME (Standard /usr/bin/google-chrome), PYTHON (Standard python3)
"use strict";
const path = require("path"), fs = require("fs"), { execFileSync } = require("child_process");
const pw = require(process.env.PLAYWRIGHT || "playwright");
const basis = (process.argv[2] || "http://127.0.0.1:8000").replace(/\/$/, "");
const aus = process.argv[3] || "/tmp/code39-decode";
const schnell = process.argv[4] === "schnell";
fs.mkdirSync(aus, { recursive: true });
let fehler = 0;
function fail(t) { console.log("FAIL " + t); fehler++; }

const FAELLE = [];
for (const [w, h] of [[360, 800], [390, 844], [412, 915]]) {
  for (const dpr of (schnell ? [2.625] : [2, 2.625, 3])) {
    FAELLE.push({ tag: `${w}x${h}-dpr${dpr}`, vp: { width: w, height: h }, dpr, telefon: true, hoch: true });
    FAELLE.push({ tag: `${h}x${w}-dpr${dpr}-quer`, vp: { width: h, height: w }, dpr, telefon: true, hoch: false });
  }
}
FAELLE.push({ tag: "1280x800-dpr1", vp: { width: 1280, height: 800 }, dpr: 1, telefon: false });

(async () => {
  const bilder = [], pixel = [], tabelle = [];
  for (const [name, typ, opt] of [["chrome", pw.chromium, { executablePath: process.env.CHROME || "/usr/bin/google-chrome" }], ["firefox", pw.firefox, {}]]) {
    const b = await typ.launch(opt);
    for (const f of FAELLE) {
      const c = await b.newContext({ locale: "de-DE", viewport: f.vp, deviceScaleFactor: f.dpr, isMobile: false });
      const p = await c.newPage(); const errs = [];
      p.on("pageerror", e => errs.push(String(e)));
      await p.goto(basis + "/beta/customer-app/#lebensmittelkarte", { waitUntil: "load" });
      await p.waitForSelector(".lk-strichcode-platz .karte-strichcode[data-geraetepx]", { timeout: 20000 });
      await p.$eval(".lk-code", e => e.scrollIntoView({ block: "center" }));
      await p.waitForTimeout(250);
      const k = `${name}-${f.tag}`;
      // ---- inline
      const inl = await p.$eval(".karte-strichcode", s => {
        const r = s.getBoundingClientRect(), vw = document.documentElement.clientWidth;
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, vw, sw: document.documentElement.scrollWidth,
          modul: Number(s.getAttribute("data-modul")), n: s.getAttribute("data-geraetepx"), dpr: devicePixelRatio,
          hinweis: !!document.querySelector(".lk-scan-hinweis") && /Zum Scannen bitte „Groß anzeigen“ antippen/.test(document.querySelector(".lk-scan-hinweis").textContent) };
      });
      if (inl.l < -0.01 || inl.r > inl.vw + 0.01) fail(`${k} inline ragt über den Bildschirm: ${inl.l.toFixed(2)}…${inl.r.toFixed(2)} bei ${inl.vw}`);
      if (inl.sw > inl.vw) fail(`${k} inline: waagrechte Scrollbreite ${inl.sw} > ${inl.vw}`);
      if (Math.abs(inl.w - 371 * inl.modul) > 0.05) fail(`${k} inline: Breite ${inl.w} ≠ 371 × ${inl.modul}`);
      if (!inl.hinweis) fail(`${k} inline: Hinweis „Zum Scannen bitte ‚Groß anzeigen‘ antippen“ fehlt`);
      const inlBild = path.join(aus, `code39-${k}-inline.png`);
      await p.screenshot({ path: inlBild });
      bilder.push(inlBild);
      pixel.push({ bild: inlBild, rect: [inl.l, inl.t, inl.r, inl.b], dpr: f.dpr, achse: "x", n: inl.n === "eingepasst" ? 0 : Number(inl.n), modul_geraet: inl.modul * f.dpr, name: k + " inline" });
      // ---- Groß-Anzeige
      await p.click("button.lk-gross-knopf");
      await p.waitForSelector("#lk-gross .lk-gross-code", { timeout: 5000 });
      await p.waitForTimeout(200);
      const gr = await p.$eval("#lk-gross .lk-gross-code", s => {
        const r = s.getBoundingClientRect(), z = document.querySelector(".lk-gross-zu").getBoundingClientRect(), nr = document.querySelector(".lk-gross-nummer").getBoundingClientRect();
        const ueber = (a, c) => !(a.right <= c.left || c.right <= a.left || a.bottom <= c.top || c.bottom <= a.top);
        return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, vw: document.documentElement.clientWidth, vh: innerHeight,
          modul: Number(s.getAttribute("data-modul")), n: s.getAttribute("data-geraetepx"), senk: s.hasAttribute("data-senkrecht"),
          knopfUeber: ueber(r, z), nummerUeber: ueber(r, nr), nummer: document.querySelector(".lk-gross-nummer").textContent };
      });
      const laenge = gr.senk ? gr.h : gr.w, hoehe = gr.senk ? gr.w : gr.h;
      if (gr.l < -0.01 || gr.t < -0.01 || gr.r > gr.vw + 0.01 || gr.b > gr.vh + 0.01) fail(`${k} groß ragt über den Bildschirm`);
      if (gr.knopfUeber || gr.nummerUeber) fail(`${k} groß: Knopf oder Nummer überdecken den Code`);
      if (gr.senk !== !!(f.vp.height > f.vp.width)) fail(`${k} groß: Ausrichtung`);
      if (f.telefon && !(gr.modul >= 1.5)) fail(`${k} groß: ${gr.modul} CSS-px je Modul < 1,5`);
      if (f.telefon && !(laenge >= 560)) fail(`${k} groß: Länge ${laenge} < 560`);
      if (!(hoehe >= 60)) fail(`${k} groß: Höhe ${hoehe} < 60`);
      if (gr.nummer !== "FA-PK-14729140-900001-77") fail(`${k} groß: Nummer ${gr.nummer}`);
      const grBild = path.join(aus, `code39-${k}-gross.png`);
      await p.screenshot({ path: grBild });
      bilder.push(grBild);
      pixel.push({ bild: grBild, rect: [gr.l, gr.t, gr.r, gr.b], dpr: f.dpr, achse: gr.senk ? "y" : "x", n: Number(gr.n), modul_geraet: gr.modul * f.dpr, name: k + " groß" });
      await p.click(".lk-gross-zu");
      if (await p.$("#lk-gross")) fail(`${k}: Groß-Anzeige schließt nicht`);
      if (errs.length) fail(`${k}: Seitenfehler ${errs.join(" | ")}`);
      tabelle.push({ browser: name, fall: f.tag, inline: { css: +inl.modul.toFixed(3), n: inl.n, breite: +inl.w.toFixed(1), hoehe: inl.h }, gross: { css: +gr.modul.toFixed(3), n: gr.n, laenge: +laenge.toFixed(1), hoehe, gedreht: gr.senk } });
      console.log(`info ${k}: inline ${inl.modul.toFixed(3)} CSS-px (n=${inl.n}) ${inl.w.toFixed(1)}×${inl.h}; groß ${gr.modul.toFixed(3)} CSS-px (n=${gr.n}) Länge ${laenge.toFixed(1)} Höhe ${hoehe}${gr.senk ? " gedreht" : ""}`);
      await c.close();
    }
    await b.close();
  }
  fs.writeFileSync(path.join(aus, "masse.json"), JSON.stringify(tabelle, null, 1));
  fs.writeFileSync(path.join(aus, "pixel.json"), JSON.stringify(pixel));
  const py = process.env.PYTHON || "python3";
  try { execFileSync(py, [path.join(__dirname, "code39_pixel.py"), path.join(aus, "pixel.json")], { stdio: "inherit" }); } catch (e) { fehler++; }
  try { execFileSync(py, [path.join(__dirname, "code39_decode.py"), ...bilder], { stdio: "inherit" }); } catch (e) { fehler++; }
  console.log("FAILS " + fehler);
  process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
