// E2E-Test: gedruckte Lebensmittelkarte der Desktopversion übernimmt die Abholungen aus der Retail App (gleicher Browser).
// Aufruf: node tests/desktop-restmengen.test.js <basis-url http(s)> <ausgabeordner> [label]
// Ablauf je Browser: Desktop-Kartenansicht Becker offen -> Retail löst nur Weizenmehl ein -> Karte (live) und Druck zeigen
// „Bereits abgeholt“/„Es bleibt noch“ -> Retail löst den Rest ein -> „Für diese Woche ist alles abgeholt“ ->
// Storno Weizenmehl über die Retail-Oberfläche -> Karte und Druck aktualisiert. Chrome: PDF (A4/A6) + pdftotext + pdfinfo.
const pw = require('playwright'); const fs = require('fs'); const { execFileSync } = require('child_process');
const base = (process.argv[2] || '').replace(/\/$/, ''); const out = process.argv[3] || '.'; const label = process.argv[4] || 'restmengen';
if (!/^https?:/.test(base)) { console.error('Basis-URL (http/https) fehlt'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
let fail = 0; const res = [];
function ok(name, pass, info) { res.push({ name, pass, info: info || '' }); console.log(pass ? 'OK  ' : 'FAIL', name, pass ? '' : (info || '')); if (!pass) fail++; }
const n = s => String(s || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
const zeile = (t, ware, a, b, c) => new RegExp(ware + '\\s+' + a + '\\s+' + b + '\\s+' + c).test(n(t).replace(/\s+/g, ' '));
const DRUCKSTAND = /Druckstand: \d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr/, LETZTE = /Letzte Abholung: \d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr bei Netto/;

async function retailKarte(r, nurMehl) {
  await r.click('#s-start [data-geh="karte"]'); await r.fill('#scan-eingabe', 'FAPK1472914090000177'); await r.press('#scan-eingabe', 'Enter');
  await r.waitForSelector('#s-person:not([hidden])', { timeout: 5000 }); await r.locator('#person-liste button').first().click();
  await r.waitForSelector('#s-korb:not([hidden])', { timeout: 5000 });
  if (nurMehl) await r.locator('#korb-liste li', { hasText: 'Weizenmehl' }).locator('button.alles').click();
  else { const a = r.locator('#korb-liste button.alles'); for (let i = 0; i < await a.count(); i++) await a.nth(i).click(); }
  await r.click('#korb-buchen'); await r.waitForSelector('#beleg-start', { state: 'visible', timeout: 5000 }); await r.click('#beleg-start');
}
async function karteText(d) { await d.waitForTimeout(800); return n(await d.innerText('.kartenblatt').catch(() => '')); }
async function drucken(d, br, format, datei) {
  await d.selectOption('#kformat', format); await d.waitForSelector('.kartenblatt.' + format);
  await d.click('#btn-druck'); await d.emulateMedia({ media: 'print' });
  let txt;
  if (br === 'chrome') {
    await d.pdf({ path: datei, preferCSSPageSize: true, printBackground: true });
    txt = execFileSync('pdftotext', ['-layout', datei, '-']).toString();
    const seiten = Number((execFileSync('pdfinfo', [datei]).toString().match(/Pages:\s+(\d+)/) || [])[1]);
    ok(`${br} ${format}: PDF genau 1 Seite`, seiten === 1, seiten + ' Seiten');
  } else txt = await d.evaluate(() => document.querySelector('.druckbereich').innerText);
  await d.emulateMedia({ media: 'screen' });
  return n(txt);
}

(async () => {
  for (const [br, bt, opts] of [['chrome', pw.chromium, fs.existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}], ['firefox', pw.firefox, {}]]) {
    const b = await bt.launch(opts); const c = await b.newContext({ locale: 'de-DE', viewport: { width: 1366, height: 900 } }); const errs = [];
    await c.addInitScript(() => { window.print = function () {}; });
    const d = await c.newPage(); d.on('pageerror', e => errs.push('desktop: ' + e));
    await d.goto(base + '/beta/desktop/', { waitUntil: 'networkidle' }); await d.fill('#kennung', 'sachbearbeitung1'); await d.click('#btn-anmelden');
    await d.click('nav.reiter a[data-view="karten"]'); await d.locator('#karten-tabelle tr[data-haushalt]', { hasText: 'Becker' }).first().click();
    let t = await karteText(d);
    ok(`${br} vorher: Spalten wie Customer`, /Sie dürfen abholen\s*Bereits abgeholt\s*Es bleibt noch/.test(t), t.slice(0, 400));
    ok(`${br} vorher: Weizenmehl 6 kg / 0 kg / 6 kg, noch keine Abholung, Druckstand`, zeile(t, 'Weizenmehl', '6 kg', '0 kg', '6 kg') && /Letzte Abholung: noch keine/.test(t) && DRUCKSTAND.test(t), t.slice(0, 600));
    const r = await c.newPage(); r.on('pageerror', e => errs.push('retail: ' + e));
    await r.goto(base + '/beta/retail-app/', { waitUntil: 'networkidle' });
    await r.locator('#ast-liste button', { hasText: 'Netto' }).first().click(); await r.locator('#kasse-liste button').first().click(); await r.click('#schicht-start');
    // 1) nur Weizenmehl
    await retailKarte(r, true); await d.bringToFront(); t = await karteText(d);
    ok(`${br} Teil: Karte live aktualisiert (Mehl 6/6/0, Reis 3,6/0/3,6)`, zeile(t, 'Weizenmehl', '6 kg', '6 kg', '0 kg') && zeile(t, 'Reis', '3,6 kg', '0 kg', '3,6 kg'), t.slice(0, 700));
    ok(`${br} Teil: letzte Abholung bei Netto, nicht „alles abgeholt“`, LETZTE.test(t) && !/alles abgeholt/.test(t), t.slice(0, 900));
    let p = await drucken(d, br, 'a4', `${out}/${label}-becker-a4-teil.pdf`);
    ok(`${br} Teil A4-Druck: Bereits abgeholt / Es bleibt noch richtig`, zeile(p, 'Weizenmehl', '6 kg', '6 kg', '0 kg') && zeile(p, 'Reis', '3,6 kg', '0 kg', '3,6 kg') && zeile(p, 'Toilettenpapier', '3 Rollen', '0 Rollen', '3 Rollen') && LETZTE.test(p) && DRUCKSTAND.test(p), p.slice(0, 1500));
    // 2) Rest
    await r.bringToFront(); await retailKarte(r, false); await d.bringToFront(); t = await karteText(d);
    ok(`${br} voll: Karte „Für diese Woche ist alles abgeholt“, Rest 0`, /Für diese Woche ist alles abgeholt/.test(t) && zeile(t, 'Speiseöl', '1,05 Liter', '1,05 Liter', '0 Liter'), t.slice(0, 900));
    p = await drucken(d, br, 'a4', `${out}/${label}-becker-a4-voll.pdf`);
    ok(`${br} voll A4-Druck: alles abgeholt`, /Für diese Woche ist alles abgeholt/.test(p) && zeile(p, 'Reis', '3,6 kg', '3,6 kg', '0 kg') && DRUCKSTAND.test(p), p.slice(0, 1500));
    p = await drucken(d, br, 'a6', `${out}/${label}-becker-a6-voll.pdf`);
    ok(`${br} voll A6-Druck: alles abgeholt`, /Für diese Woche ist alles abgeholt/.test(p) && zeile(p, 'Toilettenpapier', '3 Rollen', '3 Rollen', '0 Rollen') && DRUCKSTAND.test(p), p.slice(0, 1500));
    if (br === 'chrome') { await d.selectOption('#kformat', 'a4'); await d.locator('.kartenblatt').screenshot({ path: `${out}/${label}-becker-karte-voll.png` }); }
    // 3) Storno Weizenmehl über die Retail-Oberfläche
    await r.bringToFront(); await r.click('#s-start [data-geh="journal"]');
    await r.locator('#journal-liste li', { hasText: 'Weizenmehl' }).filter({ has: r.locator('button', { hasText: 'Stornieren' }) }).first().locator('button', { hasText: 'Stornieren' }).click();
    await r.locator('#storno-gruende button.grund').first().click(); await r.click('#storno-buchen'); await r.waitForTimeout(500);
    const roh = JSON.parse(await r.evaluate(() => localStorage.getItem('foodallo.abgleich.retail.v1')) || '{}');
    ok(`${br} Storno: Retail schreibt typ storno mit storno_von`, (roh.ereignisse || []).some(x => x.typ === 'storno' && x.storno_von), JSON.stringify((roh.ereignisse || []).filter(x => x.typ === 'storno')));
    await d.bringToFront(); t = await karteText(d);
    ok(`${br} Storno: Karte live Mehl wieder frei (6/0/6), kein „alles abgeholt“`, zeile(t, 'Weizenmehl', '6 kg', '0 kg', '6 kg') && zeile(t, 'Reis', '3,6 kg', '3,6 kg', '0 kg') && !/alles abgeholt/.test(t), t.slice(0, 900));
    p = await drucken(d, br, 'a4', `${out}/${label}-becker-a4-storno.pdf`);
    ok(`${br} Storno A4-Druck aktualisiert`, zeile(p, 'Weizenmehl', '6 kg', '0 kg', '6 kg') && !/alles abgeholt/.test(p), p.slice(0, 1500));
    p = await drucken(d, br, 'a6', `${out}/${label}-becker-a6-storno.pdf`);
    ok(`${br} Storno A6-Druck aktualisiert`, zeile(p, 'Weizenmehl', '6 kg', '0 kg', '6 kg'), p.slice(0, 1500));
    ok(`${br} keine Seitenfehler`, errs.length === 0, errs.join(' || '));
    await b.close();
  }
  fs.writeFileSync(`${out}/${label}-ergebnis.json`, JSON.stringify({ base, fail, res }, null, 1));
  console.log('FAILS', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
