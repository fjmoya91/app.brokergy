#!/usr/bin/env node
/**
 * probar_pre_revision.js — lo que VERÍA el técnico al subir su CEE, contra un
 * expediente real, SIN GUARDAR NADA.
 *
 *   node scripts/probar_pre_revision.js 26RES060_196 [--fase final]
 *
 * Carga igual que la revisión al subir (el .xml de la fase, de DRIVE) y aplica
 * el MISMO juicio (`revisionCee`) y la MISMA vista (`revisionTecnico`), pero sin
 * `setCeeField`: no toca `cee.revision_*`. Enseña al lado lo que ve Fran, para
 * comprobar que al técnico no le llega nada de la propuesta.
 *
 * Necesita el motor (`CEE_ENGINE_URL`) para leer el .cex; sin él, los puntos
 * del .cex salen «sin comprobar».
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const args = process.argv.slice(2);
const numero = args.find((a) => !a.startsWith('--'));
const fase = args.includes('--fase') && args[args.indexOf('--fase') + 1] === 'final' ? 'final' : 'inicial';
if (!numero) {
    console.error('Uso: node scripts/probar_pre_revision.js <nº expediente> [--fase final]');
    process.exit(2);
}

(async () => {
    const { cargarParaRevision } = require('../services/cee/cargarRevision');
    const { revisarCee } = require('../services/cee/revisionCee');
    const { vistaTecnico, lineaParaStaff } = require('../services/cee/revisionTecnico');

    const t0 = Date.now();
    const carga = await cargarParaRevision({ numero, xmlDeDrive: fase });
    const principal = carga.fases.find((f) => f.fase === fase);
    const otra = carga.fases.find((f) => f.fase !== fase) || null;
    const cexF = carga.cex?.[fase] || null;
    if (!principal && !cexF?.rx) {
        console.log(`\n${numero}: sin .xml ni .cex del CEE ${fase}.`);
        process.exit(0);
    }
    const res = await revisarCee({
        radiografia: principal ? principal.rx : null, otraFase: otra ? otra.rx : null,
        expediente: carga.expediente, certificador: carga.certificador, fase, cex: cexF?.rx || null,
    });
    const ms = Date.now() - t0;

    console.log(`\n${numero} · CEE ${fase} · ${ms} ms`);
    console.log(`  .xml: ${principal?.fichero || '—'}`);
    console.log(`  .cex: ${cexF?.nombre || (cexF?.error ? `error: ${cexF.error}` : '—')}`);

    const puntos = res.comprobaciones.filter((p) => p.estado !== 'ok' && p.estado !== 'info');
    console.log(`\nLO QUE VE FRAN · ${lineaParaStaff({ veredicto: res.veredicto, resumen: res.resumen, puntos })}`);
    for (const p of puntos) console.log(`  [${p.estado}] ${p.titulo}`);

    const v = vistaTecnico(res.comprobaciones, { conCorrectos: true });
    console.log(`\nLO QUE VE EL TÉCNICO · ${v.titular}  (✓ ${v.correctos} correctas)`);
    for (const [k, lista] of [['corregir', v.corregir], ['revisar', v.revisar], ['sin comprobar', v.sinComprobar]]) {
        for (const p of lista) {
            console.log(`  [${k}] ${p.titulo}`);
            if (p.dice) console.log(`      tu certificado · ${p.dice}`);
            if (p.esperado) console.log(`      debería · ${p.esperado}`);
            if (p.detalle) console.log(`      → ${p.detalle}`);
        }
    }
    const ocultos = puntos.filter((p) => ![...v.corregir, ...v.revisar, ...v.sinComprobar].some((q) => q.id === p.id && q.titulo === p.titulo));
    if (ocultos.length) console.log(`\n  (no se le enseñan: ${ocultos.map((p) => p.titulo).join(' · ')})`);
    process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
