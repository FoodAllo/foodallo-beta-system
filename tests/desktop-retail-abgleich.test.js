// End-to-End-Test Abgleich Retail App -> Desktopversion (gleicher Browser, gleiche Origin, nur auf diesem Gerät).
// Aufruf: node tests/desktop-retail-abgleich.test.js <basis-url http(s)> <ausgabeordner> [label]
// Teil A (echt): Retail App löst die Becker-Karte FAPK1472914090000177 bei Netto vollständig ein; die Desktopversion
//   (zweiter Tab, schon offen) zeigt danach „abgeholt am … bei Netto …“ mit den Mengen und die Zeilen in der Übersicht.
// Teil B (Desktop allein): Speicher foodallo.abgleich.retail.v1 mit doppelter Ereignis-ID und Storno.
const pw = require('playwright'); const fs = require('fs');
const base = (process.argv[2] || '').replace(/\/$/, ''); const out = process.argv[3] || '.'; const label = process.argv[4] || 'abgleich';
if (!/^https?:/.test(base)) { console.error('Basis-URL (http/https) fehlt'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
let fail = 0; const res = [];
function ok(name, pass, info) { res.push({ name, pass, info: info || '' }); console.log(pass ? 'OK  ' : 'FAIL', name, pass ? '' : (info || '')); if (!pass) fail++; }
const KEY = 'foodallo.abgleich.retail.v1';
const BECKER_ZEILE = '#hh-tabelle tr:has-text("Haushalt Becker")';

async function desktopAnmelden(p, rolle) {
  await p.goto(base + '/beta/desktop/', { waitUntil: 'networkidle' });
  if (rolle) await p.selectOption('#dienststelle', rolle);
  await p.fill('#kennung', 'sachbearbeitung1'); await p.click('#btn-anmelden');
}
async function beckerText(p) { await p.click('nav.reiter a[data-view="haushalte"]').catch(() => {}); return (await p.textContent(BECKER_ZEILE).catch(() => '')) || ''; }

(async () => {
  for (const [br, bt, opts] of [['chrome', pw.chromium, fs.existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}], ['firefox', pw.firefox, {}]]) {
    const b = await bt.launch(opts);
    // ---------- Teil A: echte Retail App ----------
    { const c = await b.newContext({ locale: 'de-DE', viewport: { width: 1366, height: 900 } }); const errs = [];
      const d = await c.newPage(); d.on('pageerror', e => errs.push('desktop: ' + e));
      await desktopAnmelden(d); ok(`${br} A: Becker vorher ohne Abholung`, !/abgeholt am/.test(await beckerText(d)));
      const r = await c.newPage(); r.on('pageerror', e => errs.push('retail: ' + e));
      await r.goto(base + '/beta/retail-app/', { waitUntil: 'networkidle' });
      await r.locator('#ast-liste button', { hasText: 'Netto' }).first().click(); await r.locator('#kasse-liste button').first().click(); await r.click('#schicht-start');
      await r.click('#s-start [data-geh="karte"]'); await r.fill('#scan-eingabe', 'FAPK1472914090000177'); await r.press('#scan-eingabe', 'Enter');
      await r.waitForSelector('#s-person:not([hidden])', { timeout: 5000 }); await r.locator('#person-liste button').first().click();
      await r.waitForSelector('#s-korb:not([hidden])', { timeout: 5000 });
      const alles = r.locator('#korb-liste button', { hasText: 'alles' }); for (let i = 0; i < await alles.count(); i++) await alles.nth(i).click();
      await r.click('#korb-buchen'); await r.waitForTimeout(800);
      const roh = await r.evaluate(k => localStorage.getItem(k), KEY);
      ok(`${br} A: Retail schreibt ${KEY}`, !!roh, roh ? '' : 'Schlüssel fehlt (Retail-Stand ohne Abgleich-Speicher?)');
      await d.bringToFront(); await d.waitForTimeout(800);
      const t = await beckerText(d);
      ok(`${br} A: Desktop zeigt „abgeholt am … bei Netto …“`, /abgeholt am \d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr bei Netto/.test(t), t.slice(0, 300));
      ok(`${br} A: Mengen 6 kg, 3,6 kg, 1,05 Liter, 3 Rollen`, ['6 kg Weizenmehl', '3,6 kg Reis', '1,05 Liter Speiseöl', '3 Rollen Toilettenpapier'].every(x => t.replace(/\u00a0/g, ' ').includes(x)), t.slice(0, 300));
      ok(`${br} A: Hinweis „Demo: Abgleich nur auf diesem Gerät“`, t.includes('Demo: Abgleich nur auf diesem Gerät'));
      if (br === 'chrome') await d.screenshot({ path: `${out}/${label}-becker-haushalte.png`, fullPage: true });
      const u = await c.newPage(); await desktopAnmelden(u, 'ROLE_LRA_LK_LEIPZIG'); const ut = (await u.textContent('main')).replace(/\u00a0/g, ' ');
      ok(`${br} A: Übersicht mit Retail-Zeilen`, /Retail App, Ausgaben auf diesem Gerät/.test(ut) && /Weizenmehl \(Retail App\)\s*6 kg/.test(ut), ut.slice(ut.indexOf('Retail App'), ut.indexOf('Retail App') + 200));
      if (br === 'chrome') await u.screenshot({ path: `${out}/${label}-uebersicht.png`, fullPage: true });
      ok(`${br} A: keine Seitenfehler`, errs.length === 0, errs.join(' || '));
      await c.close(); }
    // ---------- Teil B: Desktop allein (Doppelte, Storno, Live-Signal) ----------
    { const c = await b.newContext({ locale: 'de-DE', viewport: { width: 1366, height: 900 } }); const d = await c.newPage(); const errs = []; d.on('pageerror', e => errs.push(String(e)));
      await desktopAnmelden(d);
      const mo = await d.evaluate(() => window.FOODALLO_WOCHE.montag); const per = 'FA-PER-' + mo.replace(/-/g, ''), gs = 'FA-V-' + mo.replace(/-/g, '') + '-900001';
      const aus = (id, zeit, art, menge, einheit) => ({ ereignis_id: id, typ: 'REDEMPTION_POSTED', zeit: mo + 'T' + zeit + ':00+01:00', ausgabestelle_id: 'FA-R-14729140-0003', kasse: 1,
        papierkarte_id: 'FA-PK-14729140-900001', gutschein_id: gs, haushalt_id: 'FA-HH-14729140-900001', periode_id: per, positionen: [{ artikel_id: art, menge, einheit }] });
      const daten = { schema_version: 1, ereignisse: [aus('E1', '09:15', 'wheat_flour', 2, 'kg'), aus('E1', '09:15', 'wheat_flour', 2, 'kg'), aus('E2', '09:15', 'rice', 1.2, 'kg'), aus('E3', '10:00', 'oil', 0.5, 'L'),
        { ereignis_id: 'E4', typ: 'REDEMPTION_REVERSED', zeit: mo + 'T10:05:00+01:00', bezug_ereignis_id: 'E3' }] };
      const andere = await c.newPage(); await andere.goto(base + '/beta/desktop/', { waitUntil: 'networkidle' });
      await andere.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify(daten)]); // storage-Event im ersten Tab
      await d.waitForTimeout(500); const t = (await beckerText(d)).replace(/\u00a0/g, ' ');
      ok(`${br} B: Live per storage-Event, doppelte ID einmal (2 kg)`, /abgeholt am .* bei Netto Marken-Discount: 2 kg Weizenmehl, 1,2 kg Reis/.test(t), t.slice(0, 300));
      ok(`${br} B: Storno fällt heraus (kein Speiseöl)`, !/Speiseöl/.test(t.slice(t.indexOf('abgeholt'))), t.slice(0, 300));
      ok(`${br} B: keine Seitenfehler`, errs.length === 0, errs.join(' || '));
      await c.close(); }
    await b.close();
  }
  fs.writeFileSync(`${out}/${label}-ergebnis.json`, JSON.stringify({ base, fail, res }, null, 1));
  console.log('FAILS', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
