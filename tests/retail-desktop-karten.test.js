// Alle druckbaren Lebensmittelkarten der Desktopversion in der Retail App: finden, einlösen, zweiter Scan, Abgleich, Desktop-Restmengen.
// node tests/retail-desktop-karten.test.js <basis-url> [screenshot-ordner]
const pw = require('playwright'); const fs = require('fs');
const base = process.argv[2].replace(/\/$/, ''), shots = process.argv[3] || null; if (shots) fs.mkdirSync(shots, { recursive: true });
let fail = 0; const tabelle = [];
function ok(n, p, i) { console.log(p ? 'OK  ' : 'FAIL', n, p ? '' : (i || '')); if (!p) fail++; return p; }
const KEY = 'foodallo.abgleich.retail.v1';
// Karte, Eingabe (Strichcode), Laden, erwartete Waren (frei), Haushalt
const KARTEN = [
  { fam: 'Schulze', art: 'regulaer', hh: 'FA-HH-14729140-000124', pk: 'FA-PK-14729140-000067', anz: 'FA-PK-14729140-000067-78', bc: 'FAPK1472914000006778', ast: 'Edeka', waren: { Weizenmehl: '4 kg', Reis: '2,4 kg', Speiseöl: '0,7 Liter', Toilettenpapier: '2 Rollen' }, alias: 'FA-PK-14729140-000124' },
  { fam: 'Schulze', art: 'stoerung', hh: 'FA-HH-14729140-000124', pk: 'FA-PK-14729140-000066', anz: 'FA-PK-14729140-000066-81', bc: 'FAPK1472914000006681', ast: 'Norma', waren: { Trinkwasser: '28 Liter' } },
  { fam: 'Meier', art: 'regulaer', hh: 'FA-HH-14729140-000123', pk: 'FA-PK-14729140-000123', anz: 'FA-PK-14729140-000123-07', bc: 'FAPK1472914000012307', ast: 'Netto', waren: { Weizenmehl: '8 kg', Reis: '4,8 kg', Speiseöl: '1,4 Liter', Toilettenpapier: '4 Rollen' } },
  { fam: 'Meier', art: 'stoerung', hh: 'FA-HH-14729140-000123', pk: 'FA-PK-14729140-000068', anz: 'FA-PK-14729140-000068-75', bc: 'FAPK1472914000006875', ast: 'Lidl', waren: { Trinkwasser: '56 Liter' } },
  { fam: 'Becker', art: 'regulaer', hh: 'FA-HH-14729140-900001', pk: 'FA-PK-14729140-900001', anz: 'FA-PK-14729140-900001-77', bc: 'FAPK1472914090000177', ast: 'Tante Enso', waren: { Weizenmehl: '6 kg', Reis: '3,6 kg', Speiseöl: '1,05 Liter', Toilettenpapier: '3 Rollen' } },
];
const n = s => String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
async function schicht(r, ast) {
  await r.goto(base + '/beta/retail-app/', { waitUntil: 'networkidle' });
  if (await r.isVisible('#k-menue').catch(() => false) || !(await r.isVisible('#s-schicht'))) { /* Schicht beenden über Einstellungen ist nicht nötig: neuer Kontext */ }
  await r.locator('#ast-liste button', { hasText: ast }).first().click(); await r.locator('#kasse-liste button').nth(1).click(); await r.click('#schicht-start'); await r.waitForTimeout(200);
}
async function scan(r, modus, code) {
  await r.click(`#s-start [data-geh="${modus}"]`); await r.fill('#scan-eingabe', code); await r.press('#scan-eingabe', 'Enter'); await r.waitForTimeout(300);
}
(async () => {
  for (const [br, bt, opts] of [['chrome', pw.chromium, (fs.existsSync('/usr/bin/google-chrome') ? { executablePath: '/usr/bin/google-chrome' } : {})], ['firefox', pw.firefox, {}]]) {
    const b = await bt.launch(opts);
    // Prüfziffern über den Kern
    { const c = await b.newContext(); const p = await c.newPage(); await p.goto(base + '/beta/retail-app/', { waitUntil: 'networkidle' });
      for (const k of KARTEN) { const z = await p.evaluate(pk => window.FAKern.papierkartenCode(pk), k.pk); ok(`${br} Prüfziffer ${k.anz} / ${k.bc} (Kern)`, z && z.code_anzeige === k.anz && z.code_barcode === k.bc, JSON.stringify(z)); }
      await c.close(); }
    for (const k of KARTEN) {
      const c = await b.newContext({ locale: 'de-DE', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await c.addInitScript(() => { window.print = function () {}; });
      const errs = []; const d = await c.newPage(); d.on('pageerror', e => errs.push('desktop ' + e));
      await d.goto(base + '/beta/desktop/', { waitUntil: 'networkidle' }); await d.fill('#kennung', 'sachbearbeitung1'); await d.click('#btn-anmelden');
      await d.click('nav.reiter a[data-view="karten"]'); await d.locator(`#karten-tabelle tr[data-haushalt="${k.hh}"][data-art="${k.art}"]`).click(); await d.waitForTimeout(300);
      const vorher = n(await d.innerText('.kartenblatt'));
      ok(`${br} ${k.fam} ${k.art}: Desktop druckt ${k.anz}`, vorher.includes(k.anz), vorher.slice(0, 200));
      const r = await c.newPage(); r.on('pageerror', e => errs.push('retail ' + e)); await schicht(r, k.ast);
      await scan(r, 'karte', k.bc);
      const gefunden = await r.isVisible('#s-person');
      const info = n(await r.textContent('#person-info').catch(() => '')), mld = n(await r.textContent('#scan-meldung').catch(() => ''));
      ok(`${br} ${k.fam} ${k.art}: Retail findet ${k.bc} bei ${k.ast}`, gefunden && info.includes('Haushalt ' + k.fam), info + ' | ' + mld);
      let einl = false, zweit = '', abg = null;
      if (gefunden) {
        await r.locator('#person-liste button').first().click(); await r.waitForSelector('#s-korb:not([hidden])');
        const posten = await r.$$eval('#korb-liste li:not(.gesperrt) .p-name', x => x.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
        const soll = Object.entries(k.waren).map(([w, m]) => `${w} frei: ${m}`);
        ok(`${br} ${k.fam} ${k.art}: Waren ${soll.join(', ')} (genau diese, vorrätig)`, posten.length === soll.length && soll.every(s => posten.includes(s)), JSON.stringify(posten));
        if (shots && br === 'chrome') await r.screenshot({ path: `${shots}/${k.fam.toLowerCase()}-${k.art}-korb-390.png`, fullPage: true });
        for (const a of await r.$$('#korb-liste button.alles')) await a.click();
        await r.click('#korb-buchen'); await r.waitForSelector('#s-beleg:not([hidden])', { timeout: 5000 }).catch(() => {});
        const beleg = n(await r.textContent('#beleg').catch(() => ''));
        einl = ok(`${br} ${k.fam} ${k.art}: vollständig eingelöst, Beleg mit Kartennummer`, /Für diese Woche ist alles abgeholt/.test(beleg) && beleg.includes('Nr. ' + k.pk.slice(-6)), beleg.slice(0, 300));
        if (shots && br === 'chrome') await r.screenshot({ path: `${shots}/${k.fam.toLowerCase()}-${k.art}-beleg-390.png`, fullPage: true });
        await r.click('#beleg-start'); await scan(r, 'karte', k.anz);
        zweit = n(await r.textContent('#scan-meldung'));
        ok(`${br} ${k.fam} ${k.art}: zweiter Scan „bereits vollständig eingelöst“`, /bereits vollständig eingelöst/.test(zweit), zweit);
        if (k.alias) { await r.click('#s-scan [data-geh="start"]'); await scan(r, 'karte', k.alias); const z2 = n(await r.textContent('#scan-meldung')); ok(`${br} ${k.fam}: Retail-Nummer ${k.alias} führt zum selben, eingelösten Gutschein`, /bereits vollständig eingelöst/.test(z2), z2); }
        abg = await r.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), KEY);
        const aus = ((abg && abg.ereignisse) || []).filter(x => x.typ === 'ausgabe' && x.haushalt_id === k.hh);
        ok(`${br} ${k.fam} ${k.art}: Abgleich ${aus.length} Ausgaben, haushalt_id ${k.hh}, papierkarte_id ${k.pk}${k.alias ? ', alias_von ' + k.alias : ''}`,
          aus.length === Object.keys(k.waren).length && aus.every(x => x.papierkarte_id === k.pk && x.weg === 'lebensmittelkarte' && (k.alias ? x.alias_von === k.alias : !('alias_von' in x))), JSON.stringify(aus[0] || abg));
      }
      // Desktop: Restmengen der Karte
      await d.bringToFront(); await d.waitForTimeout(900);
      await d.locator(`#karten-tabelle tr[data-haushalt="${k.hh}"][data-art="${k.art}"]`).click(); await d.waitForTimeout(400);
      const nach = n(await d.innerText('.kartenblatt'));
      const nullRest = Object.entries(k.waren).every(([w, m]) => new RegExp(w + ' ' + m.replace(',', '\\,') + ' ' + m.replace(',', '\\,') + ' 0 ').test(nach + ' '));
      const desk = ok(`${br} ${k.fam} ${k.art}: Desktop-Karte zeigt Abholung, „Es bleibt noch“ 0`, nullRest && /Letzte Abholung: \d\d\.\d\d\.\d{4}, \d\d:\d\d Uhr bei/.test(nach), nach.slice(0, 700));
      if (shots && br === 'chrome') { await d.setViewportSize({ width: 1280, height: 900 }); await d.locator('.kartenblatt').screenshot({ path: `${shots}/desktop-${k.fam.toLowerCase()}-${k.art}-nach-einloesung.png` }); }
      ok(`${br} ${k.fam} ${k.art}: keine Seitenfehler`, errs.length === 0, errs.join(' | '));
      if (br === 'chrome') tabelle.push({ haushalt: k.fam + (k.art === 'stoerung' ? ' (Zusatz Trinkwasser)' : ''), desktop: k.anz + ' / ' + k.bc, findet: gefunden ? 'ja' : 'nein', einloesung: einl && desk ? 'ja' : 'nein' });
      await c.close();
    }
    // Gutscheinnummer der Customer/Desktop-Daten (Meier …-000229) und Haushaltsbezug (nie 000014)
    { const c = await b.newContext({ locale: 'de-DE' }); const r = await c.newPage(); await schicht(r, 'Netto');
      const mo = await r.evaluate(() => { const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date()); const d = new Date(t + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10).replace(/-/g, ''); });
      for (const nr of ['FA-V-' + mo + '-000229', 'FA-V-20261116-000229']) {
        await scan(r, 'gutschein', nr); const info = n(await r.textContent('#person-info').catch(() => ''));
        const pass = ok(`${br} Gutscheinnummer ${nr} (Customer/Desktop) führt zu Haushalt Meier`, (await r.isVisible('#s-person')) && info.includes('Haushalt Meier'), info + ' | ' + n(await r.textContent('#scan-meldung')));
        if (br === 'chrome') tabelle.push({ haushalt: 'Meier (Gutscheinnummer)', desktop: nr, findet: pass ? 'ja' : 'nein', einloesung: '–' });
        if (pass) await r.click('#s-person .zurueck'); else await r.click('#s-scan [data-geh="start"]');
        if (await r.isVisible('#s-scan')) await r.click('#s-scan [data-geh="start"]');
      }
      // Einlösung über …-000229: bucht auf den Meier-Gutschein (haushalt_id FA-HH-14729140-000123), nie auf 000014
      await scan(r, 'gutschein', 'FA-V-' + mo + '-000229'); await r.locator('#person-liste button').first().click(); await r.waitForSelector('#s-korb:not([hidden])');
      await r.locator('#korb-liste li', { hasText: 'Reis' }).locator('button.alles').click(); await r.click('#korb-buchen'); await r.waitForSelector('#s-beleg:not([hidden])');
      const abg = await r.evaluate(key => JSON.parse(localStorage.getItem(key) || 'null'), KEY), aus = ((abg && abg.ereignisse) || []).filter(x => x.typ === 'ausgabe');
      const pass = ok(`${br} Einlösung über …-000229 bucht auf Haushalt FA-HH-14729140-000123, nichts auf FA-HH-14729140-000014`, aus.length === 1 && aus[0].haushalt_id === 'FA-HH-14729140-000123' && !aus.some(x => /000014$/.test(x.haushalt_id || '')), JSON.stringify(aus));
      if (br === 'chrome') tabelle.push({ haushalt: 'Meier: Buchung nie auf FA-HH-…-000014', desktop: 'FA-V-' + mo + '-000229', findet: 'ja', einloesung: pass ? 'ja (Haushalt 000123)' : 'nein' });
      await c.close(); }
    // Demo-Ware für Meier an allen sechs Ausgabestellen (ohne Buchung)
    for (const ast of ['Edeka', 'Lidl', 'Netto', 'Norma', 'Tante Enso', 'Lebensmittelgeschäft Fischer']) {
      const c = await b.newContext({ locale: 'de-DE' }); const r = await c.newPage(); await schicht(r, ast);
      for (const k of KARTEN.filter(x => x.fam === 'Meier')) {
        await scan(r, 'karte', k.bc); await r.locator('#person-liste button').first().click(); await r.waitForSelector('#s-korb:not([hidden])');
        const posten = await r.$$eval('#korb-liste li:not(.gesperrt) .p-name', x => x.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
        ok(`${br} ${ast}: Meier ${k.art} voll vorrätig`, Object.entries(k.waren).every(([w, m]) => posten.includes(`${w} frei: ${m}`)), JSON.stringify(posten));
        await r.click('#s-korb .zurueck'); await r.click('#s-person .zurueck'); await r.click('#s-scan [data-geh="start"]');
      }
      await c.close();
    }
    await b.close();
  }
  console.log(JSON.stringify(tabelle));
  console.log('FAILS', fail); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
