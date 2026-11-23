// Autoprueba de la imagen (se ejecuta en el `docker build`): califica el ejemplo OFICIAL «2 Vivienda
// dentro de bloque» de CE3X 3.2 con el mismo script que usa la app (`cex_a_xml.py`) y exige lo que
// da CE3X en el PC: E 40,03 kgCO2/m²año y E 189,21 kWh/m²año, tres medidas y el XML. Si no, la
// imagen no se construye (y `deploy.sh`, con `set -e`, se para). Medido el 23/11/2026: PC y Wine
// dan el mismo JSON y el mismo XML (salvo los UUID, nuevos en cada ejecución también en el PC).
const fs = require('fs');
const { correr, cerrarCe3x } = require('./servidor');

const EJEMPLO = process.argv[2] || '/opt/autoprueba/ejemplo2.cex';
const ESPERADO = { emisiones: 40.03, emisiones_nota: 'E', enPrimNoRen: 189.21, enPrimNoRen_nota: 'E', medidas: 3 };

(async () => {
    const t0 = Date.now();
    const r = await correr({
        script: 'cex_a_xml.py',
        env: { CASO: '{DIR}\\cee.cex', XML: '{DIR}\\cee.xml', AJUSTAR_AUTOCONSUMO: '1', SALIDA_CEX: '{DIR}\\cee_ajustado.cex' },
        ficheros: { 'cee.cex': fs.readFileSync(EJEMPLO).toString('base64') },
    });
    const c = r.s?.calificacion || {};
    const r2 = v => Math.round(Number(v) * 100) / 100;
    const visto = {
        emisiones: r2(c.emisiones), emisiones_nota: c.emisiones_nota, enPrimNoRen: r2(c.enPrimNoRen),
        enPrimNoRen_nota: c.enPrimNoRen_nota, medidas: (r.s?.medidas || []).length,
    };
    const xml = r.ficheros['cee.xml'] ? Buffer.from(r.ficheros['cee.xml'], 'base64').toString('utf8') : '';
    const fallos = Object.keys(ESPERADO).filter(k => visto[k] !== ESPERADO[k]);
    if (!/<DatosEnergeticosDelEdificio\b/.test(xml)) fallos.push('sin XML');
    console.log(`[autoprueba] ${Math.round((Date.now() - t0) / 1000)} s · ${JSON.stringify(visto)} · XML ${xml.length} bytes`);
    if (fallos.length) {
        console.error(`[autoprueba] FALLA (${fallos.join(', ')}). Esperado ${JSON.stringify(ESPERADO)}.\n${r.s?.error || ''}\n${r.salida.slice(-3000)}`);
        cerrarCe3x();
        process.exit(1);
    }
    console.log('[autoprueba] OK: CE3X califica bajo Wine como en el PC');
    cerrarCe3x();
    process.exit(0);
})().catch((e) => { console.error('[autoprueba]', e); process.exit(1); });
