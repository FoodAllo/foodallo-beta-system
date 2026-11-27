// Drucktest Lebensmittelkarte (Desktopversion, Beta-System).
// Aufruf: node tests/desktop-druck.test.js <basis-url> <ausgabeordner> [label]
//   basis-url: Wurzel des Beta-Systems (https://…, http://127.0.0.1:…, file:///…)
// Prüft in Chromium (page.pdf + pdftotext) und Firefox (emulateMedia print + Screenshot),
// dass die gedruckte Seite die Lebensmittelkarte enthält und der Rest ausgeblendet ist.
const pw = require('playwright'); const fs = require('fs'); const { execFileSync } = require('child_process');
const base = (process.argv[2] || '').replace(/\/$/, ''); const out = process.argv[3] || '.'; const label = process.argv[4] || 'druck';
if (!base) { console.error('Basis-URL fehlt'); process.exit(2); }
const url = base + (base.startsWith('file:') ? '/beta/desktop/index.html' : '/beta/desktop/');
fs.mkdirSync(out, { recursive: true });
let fail = 0; const res = [];
function ok(br, name, pass, info) { res.push({ br, name, pass, info: info || '' }); console.log(pass ? 'OK  ' : 'FAIL', br, name, pass ? '' : (info || '')); if (!pass) fail++; }

async function zurKarte(b, br, format) {
  const c = await b.newContext({ locale: 'de-DE', viewport: { width: 1366, height: 900 } });
  // window.print zählen, ohne einen Systemdialog zu öffnen
  await c.addInitScript(() => { window.__druckAufrufe = 0; window.print = function () { window.__druckAufrufe++; }; });
  const p = await c.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  p.once('dialog', d => d.dismiss());
  await p.fill('#kennung', 'sachbearbeitung1'); await p.click('#btn-anmelden');
  await p.click('nav.reiter a[data-view="karten"]');
  await p.waitForSelector('#btn-druck', { timeout: 5000 });
  if (format) { await p.selectOption('#kformat', format); await p.waitForSelector('.kartenblatt.' + format, { timeout: 5000 }).catch(() => {}); }
  const code = ((await p.textContent('.kartenblatt .karten-code').catch(() => '')) || '').trim();
  await p.click('#btn-druck');
  ok(br, `${format}: Drucken ruft window.print auf`, (await p.evaluate(() => window.__druckAufrufe)) === 1);
  await p.emulateMedia({ media: 'print' });
  const sicht = await p.evaluate(() => {
    const vis = s => Array.from(document.querySelectorAll(s)).some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
    return { karte: vis('.kartenblatt'), kopf: vis('.kopf'), nav: vis('nav.reiter'), tabelle: vis('#karten-tabelle'), knopf: vis('#btn-druck'), titel: vis('main > h1, main > p.klein'), text: document.body.innerText };
  });
  ok(br, `${format}: Karte in der Druckansicht sichtbar`, sicht.karte);
  ok(br, `${format}: Kopf, Reiter, Tabelle, Knopf und Titel ausgeblendet`, !sicht.kopf && !sicht.nav && !sicht.tabelle && !sicht.knopf && !sicht.titel, JSON.stringify(sicht, (k, v) => k === 'text' ? undefined : v));
  return { c, p, code, errs };
}

(async () => {
  // Chromium: echtes PDF
  {
    const b = await pw.chromium.launch(fs.existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {});
    for (const format of ['a4', 'a6']) {
      const { c, p, code, errs } = await zurKarte(b, 'chrome', format);
      ok('chrome', `${format}: Kartennummer gefunden`, /\S/.test(code), code);
      const pdf = `${out}/${label}-chrome-${format}.pdf`;
      await p.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
      const txt = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
      const seiten = Number((execFileSync('pdfinfo', [pdf]).toString().match(/Pages:\s+(\d+)/) || [])[1]);
      const norm = s => s.replace(/\s+/g, '');
      ok('chrome', `${format}: PDF nicht leer`, txt.replace(/\s/g, '').length > 200, `${txt.replace(/\s/g, '').length} Zeichen`);
      ok('chrome', `${format}: PDF genau 1 Seite`, seiten === 1, `${seiten} Seiten`);
      ok('chrome', `${format}: PDF enthält Kartennummer`, !!code && norm(txt).includes(norm(code)), code);
      ok('chrome', `${format}: PDF enthält Musterstadt und 12345`, txt.includes('Musterstadt') && txt.includes('12345'));
      ok('chrome', `${format}: PDF enthält Haushalt`, /Haushalt/.test(txt));
      ok('chrome', `${format}: PDF ohne Bedienelemente`, !/Abmelden|Lebensmittelkarten drucken/.test(txt));
      await p.emulateMedia({ media: 'print' }); await p.screenshot({ path: `${out}/${label}-chrome-${format}-druckansicht.png`, fullPage: true });
      ok('chrome', `${format}: keine Konsolenfehler`, errs.length === 0, errs.join(' || '));
      await c.close();
    }
    await b.close();
  }
  // Firefox: Druckansicht (emulateMedia print) + Screenshot
  {
    const b = await pw.firefox.launch();
    for (const format of ['a4', 'a6']) {
      const { c, p, errs } = await zurKarte(b, 'firefox', format);
      await p.screenshot({ path: `${out}/${label}-firefox-${format}-druckansicht.png`, fullPage: true });
      ok('firefox', `${format}: keine Konsolenfehler`, errs.length === 0, errs.join(' || '));
      await c.close();
    }
    await b.close();
  }
  fs.writeFileSync(`${out}/${label}-ergebnis.json`, JSON.stringify({ url, fail, res }, null, 1));
  console.log('FAILS', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
