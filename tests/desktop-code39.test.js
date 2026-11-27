// Code-39-Prüfung der Lebensmittelkarte (Desktopversion) mit zxing.
// Aufruf: node tests/desktop-code39.test.js <basis-url> <ausgabeordner> [label]
// Benötigt Playwright (Node), pdftoppm und Python mit dem Paket zxing-cpp
// (Interpreter über Umgebungsvariable FA_PYTHON, sonst python3).
// Prüft: Tabelle gegen die Norm (alle 43 Zeichen + *), Demonstrationskarte Becker,
// alle Papierkarten der Desktopversion in A4 und A6 (Screenshot) sowie Stichproben aus page.pdf.
const pw = require('playwright'); const fs = require('fs'); const { execFileSync } = require('child_process');
const base = (process.argv[2] || '').replace(/\/$/, ''); const out = process.argv[3] || '.'; const label = process.argv[4] || 'code39';
if (!base) { console.error('Basis-URL fehlt'); process.exit(2); }
const url = base + (base.startsWith('file:') ? '/beta/desktop/index.html' : '/beta/desktop/');
const py = process.env.FA_PYTHON || 'python3';
fs.mkdirSync(out, { recursive: true });
let fail = 0; const res = [];
function ok(name, pass, info) { res.push({ name, pass, info: info || '' }); console.log(pass ? 'OK  ' : 'FAIL', name, pass ? '' : (info || '')); if (!pass) fail++; }
function lies(bild) {
  const r = execFileSync(py, ['-c', 'import sys,zxingcpp\nfrom PIL import Image\nr=zxingcpp.read_barcodes(Image.open(sys.argv[1]),formats=zxingcpp.BarcodeFormat.Code39)\nprint("|".join(x.text for x in r))', bild]).toString().trim();
  return r;
}
// Referenz: zxing Code39Reader.CHARACTER_ENCODINGS (9 Elemente, 1 = breit), Stern 0x094
const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
const ENC = [0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064, 0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00D, 0x10C, 0x04C, 0x01C, 0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016, 0x181, 0x0C1, 0x1C0, 0x091, 0x190, 0x0D0, 0x085, 0x184, 0x0C4, 0x0A8, 0x0A2, 0x08A, 0x02A];
const muster = e => e.toString(2).padStart(9, '0').replace(/0/g, 'n').replace(/1/g, 'w');
const BECKER = 'FAPK1472914090000177';

(async () => {
  const b = await pw.chromium.launch(fs.existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {});
  const c = await b.newContext({ locale: 'de-DE', viewport: { width: 1366, height: 900 }, deviceScaleFactor: 2 });
  await c.addInitScript(() => { window.print = function () {}; });
  const p = await c.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  // 1. Tabelle gegen Referenz: SVG je Zeichen aus code39Svg zurücklesen
  const falsch = await p.evaluate(([alpha, enc]) => {
    const K = window.FOODALLO_KARTEN, f = [];
    const zeichen = alpha.split('');
    zeichen.forEach((ch, i) => {
      const d = document.createElement('div'); d.innerHTML = K.code39Svg(ch, { narrow: 1, height: 10 });
      const rects = Array.from(d.querySelectorAll('rect')).map(r => ({ x: +r.getAttribute('x'), w: +r.getAttribute('width') }));
      // Elemente (Strich/Lücke) des zweiten Zeichens (nach Start-*) rekonstruieren
      const el = []; for (let j = 0; j < rects.length; j++) { el.push(rects[j].w); if (j + 1 < rects.length) el.push(rects[j + 1].x - rects[j].x - rects[j].w); }
      const zweites = el.slice(10, 19).map(w => (w > 1.5 ? 'w' : 'n')).join('');
      const soll = enc[i].toString(2).padStart(9, '0').replace(/0/g, 'n').replace(/1/g, 'w');
      if (zweites !== soll) f.push(ch === ' ' ? 'Leerzeichen' : ch);
    });
    return f;
  }, [ALPHA, ENC]);
  ok(`Tabelle: alle 43 Zeichen wie Norm (zxing-Referenz)`, falsch.length === 0, 'falsch: ' + falsch.join(' '));
  const geo = await p.evaluate(() => {
    const d = document.createElement('div'); d.innerHTML = window.FOODALLO_KARTEN.code39Svg('0', { narrow: 2, height: 10 });
    const s = d.querySelector('svg'), r = Array.from(s.querySelectorAll('rect')).map(x => ({ x: +x.getAttribute('x'), w: +x.getAttribute('width') }));
    const breite = +s.getAttribute('viewBox').split(' ')[2];
    return { links: r[0].x, rechts: breite - (r[r.length - 1].x + r[r.length - 1].w), breiten: Array.from(new Set(r.map(x => x.w))).sort() };
  });
  ok('Ruhezone links/rechts mindestens 10 × Modul', geo.links >= 20 && geo.rechts >= 20, JSON.stringify(geo));
  ok('Verhältnis breit:schmal 3:1', geo.breiten.join(',') === '2,6', JSON.stringify(geo));
  // 2. Becker (gemeinsamer Demonstrationsdatensatz) mit dem Desktop-Strichcode, A4- und A6-Maße
  for (const [fmt, o] of [['a4', { height: 48, narrow: 2 }], ['a6', { height: 28, narrow: 1.4 }]]) {
    await p.evaluate(([code, o]) => { let d = document.getElementById('fa-test-code'); if (!d) { d = document.createElement('div'); d.id = 'fa-test-code'; d.style.cssText = 'position:fixed;left:0;top:0;padding:20px;background:#fff;z-index:99999'; document.body.appendChild(d); } d.innerHTML = window.FOODALLO_KARTEN.code39Svg(code, o); }, [BECKER, o]);
    const bild = `${out}/${label}-becker-${fmt}.png`; await p.locator('#fa-test-code').screenshot({ path: bild });
    const t = lies(bild); ok(`Becker ${fmt}: zxing liest ${BECKER}`, t === BECKER, `gelesen: "${t}"`);
  }
  // Alle Strichcodes aus den Szenariodaten (A4- und A6-Maße)
  const alle = await p.evaluate(() => Array.from(new Set((JSON.stringify(window.FOODALLO_DATEN).match(/"code_barcode":\s*"([^"]+)"/g) || []).map(x => x.split('"')[3]))));
  let ja = 0;
  for (const code of alle) for (const [fmt, o] of [['a4', { height: 48, narrow: 2 }], ['a6', { height: 28, narrow: 1.4 }]]) {
    await p.evaluate(([code, o]) => { document.getElementById('fa-test-code').innerHTML = window.FOODALLO_KARTEN.code39Svg(code, o); }, [code, o]);
    const bild = `${out}/${label}-daten-${fmt}.png`; await p.locator('#fa-test-code').screenshot({ path: bild });
    const t = lies(bild); if (t === code) ja++; else ok(`Szenario-Code ${code} ${fmt}`, false, `gelesen: "${t}"`);
  }
  ok(`Alle Strichcodes der Szenariodaten: ${ja}/${alle.length * 2} gelesen (A4 + A6)`, alle.length > 0 && ja === alle.length * 2);
  await p.evaluate(() => { const d = document.getElementById('fa-test-code'); if (d) d.remove(); });
  // 3. Alle Papierkarten der Desktopversion, A4 und A6, Screenshot des Kartenblatts
  p.once('dialog', d => d.dismiss());
  await p.fill('#kennung', 'sachbearbeitung1'); await p.click('#btn-anmelden');
  await p.click('nav.reiter a[data-view="karten"]'); await p.waitForSelector('#btn-druck');
  const n = await p.$$eval('#karten-tabelle tr[data-haushalt]', x => x.length);
  let gelesen = 0, geprueft = 0, pdfs = 0;
  for (let i = 0; i < n; i++) {
    for (const fmt of ['a4', 'a6']) {
      await p.locator('#karten-tabelle tr[data-haushalt]').nth(i).click();
      if (!(await p.$('#kformat'))) continue;
      await p.selectOption('#kformat', fmt); await p.waitForSelector('.kartenblatt.' + fmt);
      const soll = ((await p.textContent('.barcode-wrap .kartennummer')) || '').trim();
      const bild = `${out}/${label}-karte-${i}-${fmt}.png`;
      await p.locator('.barcode-wrap').screenshot({ path: bild });
      const t = lies(bild); geprueft++; if (t === soll) gelesen++; else ok(`Karte ${i} ${fmt}: zxing liest ${soll}`, false, `gelesen: "${t}"`);
      if (i === 0 || i === n - 1) { // Stichprobe: echtes PDF, pdftoppm 300 dpi
        await p.emulateMedia({ media: 'print' });
        const pdf = `${out}/${label}-karte-${i}-${fmt}.pdf`; await p.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
        await p.emulateMedia({ media: 'screen' });
        execFileSync("pdftoppm", ['-r', '300', '-png', '-singlefile', pdf, pdf.replace(/\.pdf$/, "-pdf")], { stdio: "ignore" });
        const tp = lies(pdf.replace(/\.pdf$/, '-pdf.png')); pdfs++;
        ok(`PDF Karte ${i} ${fmt} (300 dpi): zxing liest ${soll}`, tp === soll, `gelesen: "${tp}"`);
      }
    }
  }
  ok(`Alle Papierkarten (Screenshot): ${gelesen}/${geprueft} gelesen`, geprueft > 0 && gelesen === geprueft);
  ok('keine Seitenfehler', errs.length === 0, errs.join(' || '));
  await b.close();
  fs.writeFileSync(`${out}/${label}-ergebnis.json`, JSON.stringify({ url, fail, res }, null, 1));
  console.log('FAILS', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
