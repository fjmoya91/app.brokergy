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
    const g = p.gastos;
    console.log(`  gastos: ${g.trimestres.map(q => `${q.t.slice(-2)} ${q.fuente}${q.error ? ' ERROR' : ` ${eur(q.base)}${q.sinLeer ? ` (${q.sinLeer} sin leer)` : ''}${q.cuadra === false ? ' NO CUADRA' : ''}`}`).join(' · ')}`);
    console.log(`  libro: ${g.libro ? (g.libro.error ? `ERROR ${g.libro.error}` : `${g.libro.nombre} (${g.libro.modificado?.slice(0, 10)}) · ${g.libro.trimestres.join(', ') || 'ningún trimestre cerrado'} · cuadra con su RESUMEN: ${g.libro.cuadra ? 'sí' : 'NO'}`) : 'no hay'}`);
    console.log(`  fuera de la estructura: certificadores ${eur(g.certificadores)} · inversiones ${eur(g.inversiones)} · bonos del libro ${eur(g.bonosLibro)}${g.estimado ? ` · estimado ${eur(g.estimado.importe)} (meses ${g.estimado.meses.join(', ')} a ${eur(g.estimado.mediaMensual)}/mes)` : ''}`);
    console.log(`caja · te deben ${eur(c.teDeben)} · bonos por pagar ${eur(c.bonosPorPagar)} · IVA ${eur(c.ivaAPagar)} · circulante ${eur(c.circulante)}`);
    console.log(`previsión · cartera ${eur(pr.cartera)} (CAE ${eur(pr.carteraCae)} · ING ${eur(pr.carteraIng)}) · margen ${eur(pr.carteraMargen)}`);
    if (pr.cierreAnio) {
        const ca = pr.cierreAnio;
        console.log(`  cierre ${f.anio}: ${eur(ca.ytd)} → seguro ${eur(ca.seguro)} → esperado ${eur(ca.esperado)} → máximo ${eur(ca.maximo)} · del envío a la factura ${ca.diasFactura.mediana ?? '—'} días (mediana de ${ca.diasFactura.n} lotes, ${ca.diasFactura.min}–${ca.diasFactura.max})`);
        for (const l of ca.lotes) console.log(`    ${String(l.codigo).padEnd(15)} ${l.etapa.padEnd(11)} env ${l.fechaEnvio || '—'} → ${l.fechaPrevista} ${l.entra ? 'ENTRA' : 'pasa al año que viene'} · ${eur(l.base)}`);
    }
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
    if (pr.cierreAnio) {
        const ca = pr.cierreAnio;
        cierto(ca.ytd <= ca.seguro + 0.5 && ca.seguro <= ca.posible + 0.5, 'cierre: facturado ≤ seguro ≤ posible');
        cierto(ca.seguro <= ca.esperado + 0.5 && ca.esperado <= ca.maximo + 0.5, 'cierre: seguro ≤ esperado ≤ máximo');
        casi(ca.esperado - ca.seguro, ca.lotes.filter(l => l.entra).reduce((a, l) => a + l.base, 0), 'esperado − seguro = los lotes que entran en el año', 3);
        const tr = (id) => pr.tramos.find(x => x.id === id)?.base || 0;
        casi(ca.maximo - ca.seguro, tr('MITECO') + tr('VERIFICADOR'), 'máximo − seguro = Ministerio + verificador', 3);
    }
    // Gastos: cada trimestre del año, de UNA fuente; el libro suma lo que dice su RESUMEN.
    cierto(new Set(g.trimestres.map(q => q.t)).size === g.trimestres.length, 'cada trimestre de gastos sale de una sola fuente');
    if (g.libro && !g.libro.error) cierto(g.libro.cuadra !== false, 'el libro maestro suma lo mismo que su hoja RESUMEN');
    casi(p.meses.reduce((a, m) => a + m.estructura, 0), p.estructura, 'los meses suman la estructura del año', 6);
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
