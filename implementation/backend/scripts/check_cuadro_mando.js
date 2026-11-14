// ─── Comprobación del cuadro de mando de dirección (SOLO LECTURA) ───────────────
//
//   node implementation/backend/scripts/check_cuadro_mando.js [año]
//
// Ejecuta services/cuadroDireccion.js contra la BD de verdad (local = producción:
// aquí no se escribe NADA), imprime las cifras de cabecera y comprueba que cuadran
// entre sí: que la cuenta de resultados suma, que los meses suman el año, que cada
// lote está en una etapa, que el circulante es lo que dice ser, que la cartera es
// la suma de sus tramos y que no se ha colado un NaN. Sale con código 1 si algo no
// cuadra. Regla 216 y docs/conocimiento/cuadro-mando/.
const path = require('path');
process.chdir(path.join(__dirname, '..'));
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const svc = require('../services/cuadroDireccion');

const eur = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-ES')} €`;
const fallos = [];
const casi = (a, b, que, tol = 1.5) => { if (!(Math.abs((Number(a) || 0) - (Number(b) || 0)) <= tol)) fallos.push(`${que}: ${a} ≠ ${b}`); };
const cierto = (c, que) => { if (!c) fallos.push(que); };
function sinNaN(o, ruta = '') {
    if (typeof o === 'number') { if (!Number.isFinite(o)) fallos.push(`número no finito en ${ruta}`); return; }
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) sinNaN(v, `${ruta}.${k}`);
}

(async () => {
    const anio = Number(process.argv[2]) || undefined;
    let t = Date.now();
    const n = await svc.negocio({ forzar: true });
    const tn = Date.now() - t;
    t = Date.now();
    const f = await svc.finanzas(anio, { forzar: true });
    const tf = Date.now() - t;
    console.log(`negocio ${tn} ms (${Math.round(JSON.stringify(n).length / 1024)} KB) · finanzas ${tf} ms (${Math.round(JSON.stringify(f).length / 1024)} KB)`);

    const p = f.pyg, c = f.caja, pr = f.prevision;
    console.log(`\n${f.anio} · ingresos ${eur(p.ingresos)} (CAE ${eur(p.ingresosCae)} · ING ${eur(p.ingresosIng)})`);
    console.log(`  coste directo ${eur(p.costeDirecto)} · margen bruto ${eur(p.margenBruto)} (${(p.margenBrutoPct * 100).toFixed(1)} %)`);
    console.log(`  estructura ${eur(p.estructura)} · EBITDA ${eur(p.ebitda)}${p.fiable ? '' : ` · PROVISIONAL (${p.gastos.sinLeer} gastos sin leer)`}`);
    console.log(`  ventas CAE casadas con su lote: ${p.cobertura.nCasadas}/${p.cobertura.nVentas} · sin casar ${eur(p.cobertura.caeSinCasar)}`);
    console.log(`caja · te deben ${eur(c.teDeben)} · bonos por pagar ${eur(c.bonosPorPagar)} · IVA ${eur(c.ivaAPagar)} · circulante ${eur(c.circulante)}`);
    console.log(`previsión · cartera ${eur(pr.cartera)} (CAE ${eur(pr.carteraCae)} · ING ${eur(pr.carteraIng)}) · margen ${eur(pr.carteraMargen)}`);
    if (pr.cierreAnio) console.log(`  cierre ${f.anio}: ${eur(pr.cierreAnio.ytd)} → seguro ${eur(pr.cierreAnio.seguro)} → posible ${eur(pr.cierreAnio.posible)}`);
    console.log('lotes por etapa:');
    for (const e of n.etapas) console.log(`  ${e.id.padEnd(13)} ${String(e.n).padStart(3)} lotes · ${String(e.nExp).padStart(4)} exp. · ${eur(e.base)}`);
    console.log(`expedientes vivos ${n.expedientes.vivos} · captación viva ${n.captacion.length} · CEE directos ${eur(n.cee.facturadoAnio)} en ${n.cee.nFacturasAnio} facturas`);
    console.log(`atención: ${n.atencion.length} del negocio + ${f.avisos.length} de finanzas`);

    // ── Que cuadre ─────────────────────────────────────────────────────────────
    casi(p.ingresos, p.ingresosCae + p.ingresosIng, 'ingresos = CAE + ING');
    casi(p.ingresosIng, Object.values(p.ingPorOrigen || {}).reduce((a, v) => a + v, 0), 'ING = suma por origen', 2);
    casi(p.costeDirecto, p.costeDirectoCae + p.costeCee, 'coste directo = CAE + técnicos CEE');
    casi(p.margenBruto, p.ingresos - p.costeDirecto, 'margen bruto = ingresos − coste directo');
    casi(p.ebitda, p.margenBruto - p.estructura, 'EBITDA = margen bruto − estructura');
    casi(p.meses.reduce((a, m) => a + m.ingresos, 0), p.ingresos, 'los meses suman los ingresos del año', 3);
    casi(p.meses.reduce((a, m) => a + m.ebitda, 0), p.ebitda, 'los meses suman el EBITDA del año', 3);
    casi(c.circulante, c.teDeben - c.bonosPorPagar - c.ivaAPagar - c.retenciones, 'circulante = te deben − bonos − IVA − retenciones');
    casi(pr.carteraCae, pr.tramos.reduce((a, x) => a + x.base, 0), 'cartera CAE = suma de tramos', 3);
    casi(pr.cartera, pr.carteraCae + pr.carteraIng, 'cartera = CAE + servicios');
    if (pr.cierreAnio) cierto(pr.cierreAnio.ytd <= pr.cierreAnio.seguro + 0.5 && pr.cierreAnio.seguro <= pr.cierreAnio.posible + 0.5, 'cierre: facturado ≤ seguro ≤ posible');
    cierto(n.etapas.reduce((a, e) => a + e.n, 0) === n.lotes.length, 'cada lote está en UNA etapa');
    cierto(n.etapas.reduce((a, e) => a + e.nExp, 0) === n.lotes.reduce((a, l) => a + l.nExp, 0), 'los expedientes de las etapas son los de los lotes');
    cierto(!n.filas.some(r => String(r.estado).toUpperCase() === 'RECHAZADO'), 'ningún RECHAZADO en la cartera');
    cierto(n.lotes.every(l => l.bonosPendientes >= -0.5), 'ningún lote con bonos pendientes negativos');
    cierto(f.salud.every(s => ['ok', 'ambar', 'gris'].includes(s.tono)), 'salud: tono ok|ambar|gris');
    sinNaN(n, 'negocio'); sinNaN(f, 'finanzas');

    if (fallos.length) { console.error(`\n✗ ${fallos.length} cosa(s) no cuadran:\n  - ${fallos.join('\n  - ')}`); process.exit(1); }
    console.log('\n✓ El cuadro de mando cuadra.');
    process.exit(0);
})().catch(e => { console.error('✗', e.status === 503 ? 'BD caída (503)' : e); process.exit(1); });
