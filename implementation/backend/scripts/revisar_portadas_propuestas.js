/**
 * ¿Se corta el texto en alguna hoja de las propuestas YA ENVIADAS?
 *
 * Mide el HTML que ve el cliente al abrir su enlace (`datos_calculo.html_propuesta`)
 * con las MISMAS tipografías que el documento (servidas desde frontend/public/fonts):
 * por cada hoja, cuántos px quedan entre el final del texto y el pie negro. Un
 * número negativo es texto escondido debajo del pie. `c` = portada en compacto,
 * `z0.9` = portada reducida con zoom (el tercer escalón del ajuste).
 *
 * Solo LEE. Medido al escribirlo (28/09/2026): 4 de las 54 últimas tenían la
 * portada cortada, todas con el recuadro de presupuesto ESTIMADO, y en
 * 26RES060_OP208 no se veía ni una de sus notas.
 *
 *   node scripts/revisar_portadas_propuestas.js [N=40] [id_oportunidad]
 */
const path = require('path');
const fs = require('fs');
const supabase = require('../services/supabaseClient');
const puppeteer = require('puppeteer');
const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');
const log = (...a) => process.stdout.write(a.join(' ') + '\n');

(async () => {
  const lim = parseInt(process.argv[2] || '40', 10);
  const soloId = process.argv[3] || null;
  let q = supabase.from('oportunidades').select('id, id_oportunidad, created_at')
    .not('datos_calculo->>html_propuesta', 'is', null)
    .order('created_at', { ascending: false }).limit(lim);
  if (soloId) q = supabase.from('oportunidades').select('id, id_oportunidad, created_at').eq('id_oportunidad', soloId);
  const { data, error } = await q;
  if (error) throw error;
  log(`${data.length} propuestas`);
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1200 });
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    const m = u.match(/\/fonts\/([^?#]+)$/);
    if (m && fs.existsSync(path.join(PUBLIC_DIR, 'fonts', m[1]))) {
      return r.respond({ status: 200, contentType: 'font/woff2', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(path.join(PUBLIC_DIR, 'fonts', m[1])) });
    }
    if (u.startsWith('data:') || /googleapis|gstatic/.test(u)) return r.continue();
    return r.abort();
  });
  let cortadas = 0, n = 0;
  for (const o of data) {
    const { data: d } = await supabase.from('oportunidades').select('html:datos_calculo->>html_propuesta').eq('id', o.id).single();
    if (!d?.html) continue;
    await page.setContent(d.html, { waitUntil: 'load', timeout: 15000 }).catch(() => {});
    await page.emulateMediaType('print');
    await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('.prop-page').forEach((pg, i) => {
        const pb = pg.querySelector(':scope > .prop-pb');
        if (!pb) return;
        const pgR = pg.getBoundingClientRect();
        const foot = pg.querySelector(':scope > .prop-cta') || pg.querySelector(':scope > .prop-mfoot');
        const lim = foot ? foot.getBoundingClientRect().top : pgR.bottom;
        let bottom = pb.getBoundingClientRect().bottom;
        pb.querySelectorAll('*').forEach(el => { const b = el.getBoundingClientRect().bottom; if (b > bottom && el.offsetParent) bottom = b; });
        out.push({ pag: i + 1, sobra: Math.round(lim - bottom), compact: pg.classList.contains('prop-compact'), zoom: pb.style.zoom || '' });
      });
      return out;
    });
    n++;
    const corta = r.some(p => p.sobra < 0);
    if (corta) cortadas++;
    log(`${corta ? 'X' : ' '} ${o.id_oportunidad.padEnd(18)} ${o.created_at.slice(0, 10)}  ${r.map(p => `${p.pag}:${p.sobra}${p.compact ? 'c' : ''}${p.zoom ? 'z' + p.zoom : ''}`).join(' ')}`);
  }
  await browser.close();
  log(`\nFIN ${cortadas} de ${n} propuestas con alguna página cortada`);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
