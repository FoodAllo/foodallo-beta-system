// Wochentest Desktopversion: Anzeige springt immer in die laufende Woche (Mo–So, Europe/Berlin).
// Aufruf: node tests/desktop-woche.test.js <basis-url> <ausgabeordner> [label]
// Prüft mit Playwright-Uhr (nur im Test) heute und simulierte Daten in Chromium und Firefox.
const pw = require('playwright'); const fs = require('fs');
const base = (process.argv[2] || '').replace(/\/$/, ''); const out = process.argv[3] || '.'; const label = process.argv[4] || 'woche';
if (!base) { console.error('Basis-URL fehlt'); process.exit(2); }
const url = base + (base.startsWith('file:') ? '/beta/desktop/index.html' : '/beta/desktop/');
fs.mkdirSync(out, { recursive: true });
let fail = 0; const res = [];
function ok(name, pass, info) { res.push({ name, pass, info: info || '' }); console.log(pass ? 'OK  ' : 'FAIL', name, pass ? '' : (info || '')); if (!pass) fail++; }
function woche(d) { // Montag/Sonntag in Europe/Berlin als TT.MM.JJJJ und JJJJMMTT
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const m = new Date(Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10))); m.setUTCDate(m.getUTCDate() - (m.getUTCDay() + 6) % 7);
  const s = new Date(m); s.setUTCDate(s.getUTCDate() + 6);
  const de = x => x.toISOString().slice(0, 10).split('-').reverse().join('.');
  return { mo: de(m), so: de(s), id: m.toISOString().slice(0, 10).replace(/-/g, '') };
}
const FAELLE = [['heute', null], ['2026-12-02', '2026-12-02T10:00:00+01:00'], ['Sonntag 2026-11-29 23:30', '2026-11-29T23:30:00+01:00'], ['Montag 2026-11-30 00:10', '2026-11-30T00:10:00+01:00'], ['2027-01-06', '2027-01-06T09:00:00+01:00']];
(async () => {
  for (const [br, bt, opts] of [['chrome', pw.chromium, fs.existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {}], ['firefox', pw.firefox, {}]]) {
    const b = await bt.launch(opts);
    for (const [name, fix] of FAELLE) {
      const c = await b.newContext({ locale: 'de-DE', viewport: { width: 1366, height: 900 } }); const p = await c.newPage(); const errs = [];
      p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      if (fix) await p.clock.setFixedTime(new Date(fix));
      const w = woche(fix ? new Date(fix) : new Date());
      await p.goto(url, { waitUntil: 'networkidle' });
      p.once('dialog', d => d.dismiss());
      await p.fill('#kennung', 'sachbearbeitung1'); await p.click('#btn-anmelden');
      const ids = await p.evaluate(() => ({ per: window.FOODALLO_DATEN.meta.periode_aktuell,
        meier: window.EREIGNISLOG.filter(e => e.typ === 'VOUCHER_ISSUED' && e.payload.gutschein.haushalt_id === 'FA-HH-14729140-000123' && e.payload.gutschein.periode_id === window.FOODALLO_DATEN.meta.periode_aktuell).map(e => e.payload.gutschein.gutschein_id) }));
      ok(`${br} ${name}: Periode FA-PER-${w.id}`, ids.per === 'FA-PER-' + w.id, ids.per);
      ok(`${br} ${name}: Meier-Gutscheine FA-V-${w.id}-…`, ids.meier.length > 0 && ids.meier.every(x => x.startsWith('FA-V-' + w.id + '-')), ids.meier.join(','));
      await p.click('nav.reiter a[data-view="karten"]'); await p.waitForSelector('#btn-druck');
      await p.locator('#karten-tabelle tr[data-haushalt="FA-HH-14729140-900001"]').click();
      const kopf = await p.textContent('main > p.klein'), meta = await p.textContent('.kartenblatt .karten-meta'), nr = (await p.textContent('.kartenblatt .karten-code')).trim();
      ok(`${br} ${name}: Zeitraum ${w.mo} – ${w.so} (aktuelle Woche)`, kopf.includes(`${w.mo} – ${w.so} (aktuelle Woche)`), kopf);
      ok(`${br} ${name}: Becker gültig ${w.mo} bis ${w.so}, Nummer unverändert`, meta.includes(`${w.mo} bis ${w.so}`) && nr === 'FA-PK-14729140-900001-77', meta);
      const alles = await p.evaluate(() => document.body.innerText);
      ok(`${br} ${name}: kein „Demonstrationszeitraum“`, !/Demonstrationszeitraum/.test(alles));
      if (!fix && br === 'chrome') await p.screenshot({ path: `${out}/${label}-kartenansicht.png`, fullPage: true });
      ok(`${br} ${name}: keine Konsolenfehler`, errs.length === 0, errs.join(' || '));
      await c.close();
    }
    // Übergeordnete Dienststelle: Bestands- und Ausgabeübersicht
    { const c = await b.newContext({ locale: 'de-DE', viewport: { width: 1366, height: 900 } }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
      await p.clock.setFixedTime(new Date('2026-12-02T10:00:00+01:00'));
      await p.goto(url, { waitUntil: 'networkidle' }); await p.selectOption('#dienststelle', 'ROLE_LRA_LK_LEIPZIG'); await p.click('#btn-anmelden');
      await p.waitForSelector('main h1'); const t = await p.textContent('main');
      ok(`${br} Übersicht: „in der aktuellen Woche“ und Stand 02.12.2026`, /in der aktuellen Woche/.test(t) && /02\.12\.2026/.test(t), t.slice(0, 200));
      await p.clock.setFixedTime(new Date()); await p.reload({ waitUntil: 'networkidle' });
      if (br === 'chrome') await p.screenshot({ path: `${out}/${label}-dashboard-uebersicht.png`, fullPage: true });
      ok(`${br} Übersicht: keine Seitenfehler`, errs.length === 0, errs.join(' || ')); await c.close(); }
    await b.close();
  }
  fs.writeFileSync(`${out}/${label}-ergebnis.json`, JSON.stringify({ url, fail, res }, null, 1));
  console.log('FAILS', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
