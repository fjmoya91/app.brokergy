#!/usr/bin/env node
/**
 * barrer_revision_cee.js — pasa la revisión del CEE por TODOS los certificados
 * que Fran ya dio por buenos, para calibrar las reglas. SOLO LEE.
 *
 *   node scripts/barrer_revision_cee.js [--fase inicial|final] [--limite N]
 *                                      [--salida resultados.json] [--estado REVISADO,REGISTRADO]
 *
 * El conjunto de referencia son los expedientes cuya fase está en REVISADO o
 * REGISTRADO: esos CEE los revisó una persona antes de darles el visto bueno.
 * Así que una regla que SALTA sobre ellos es, o una regla mal calibrada, o algo
 * que se le pasó a esa persona — y hay que separar las dos cosas caso a caso,
 * nunca bajar el listón a ciegas para que salga limpio.
 *
 * Imprime, por cada comprobación, cuántas veces sale ok / aviso / falla / sin
 * comprobar, y el detalle de los fallos. Con `--salida` guarda el informe
 * entero de cada expediente para poder mirarlo después sin volver a la BD.
 */
const fs = require('fs');
const supabase = require('../services/supabaseClient');
const { cargarParaRevision } = require('../services/cee/cargarRevision');
const { revisarCee } = require('../services/cee/revisionCee');

function args(argv) {
    const o = { fases: ['inicial', 'final'], limite: null, salida: null, estados: ['REVISADO', 'REGISTRADO'], solo: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--fase') o.fases = [argv[++i]];
        else if (a === '--limite') o.limite = Number(argv[++i]);
        else if (a === '--salida') o.salida = argv[++i];
        else if (a === '--estado') o.estados = argv[++i].split(',');
        else if (a === '--solo') o.solo = argv[++i].split(',');
        //: Las radiografías del `.cex` ya sacadas (`radiografia_cex.py` sobre la
        //: copia local de Drive): sin bajar ni un fichero ni llamar al motor.
        else if (a === '--cex-json') o.cexJson = argv[++i];
        else if (a === '--sin-cex') o.sinCex = true;
    }
    return o;
}

async function main() {
    const o = args(process.argv.slice(2));

    // Solo escalares: el `.xml` se pide después, de uno en uno (regla 22).
    const { data: filas, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, ini:seguimiento->>cee_inicial, fin:seguimiento->>cee_final')
        .order('numero_expediente');
    if (error) throw new Error(error.message);

    const trabajo = [];
    for (const f of filas) {
        if (o.solo && !o.solo.includes(f.numero_expediente)) continue;
        for (const fase of o.fases) {
            const estado = fase === 'inicial' ? f.ini : f.fin;
            if (o.estados.includes(estado)) trabajo.push({ ...f, fase });
        }
    }
    const lista = o.limite ? trabajo.slice(0, o.limite) : trabajo;
    console.error(`${lista.length} certificados aprobados a revisar…`);

    const cexLocal = o.cexJson ? JSON.parse(fs.readFileSync(o.cexJson, 'utf8')) : null;
    const resultados = [];
    const cache = new Map();
    for (const t of lista) {
        try {
            let carga = cache.get(t.id);
            if (!carga) {
                carga = await cargarParaRevision({ id: t.id, conCex: !cexLocal && !o.sinCex });
                cache.clear(); cache.set(t.id, carga);
            }
            const principal = carga.fases.find((x) => x.fase === t.fase);
            if (!principal) { resultados.push({ numero: t.numero_expediente, fase: t.fase, sin_xml: true }); continue; }
            const otra = carga.fases.find((x) => x.fase !== t.fase) || null;
            const res = await revisarCee({
                radiografia: principal.rx,
                otraFase: otra ? otra.rx : null,
                expediente: carga.expediente,
                certificador: carga.certificador,
                fase: t.fase,
                cex: cexLocal
                    ? ((cexLocal[t.numero_expediente] || {})[t.fase] || [])[0] || null
                    : carga.cex?.[t.fase]?.rx || null,
            });
            resultados.push({ numero: t.numero_expediente, fase: t.fase, ficha: res.ficha, veredicto: res.veredicto, comprobaciones: res.comprobaciones });
        } catch (e) {
            resultados.push({ numero: t.numero_expediente, fase: t.fase, error: e.message });
        }
    }

    // ── Resumen por comprobación ──
    const revisados = resultados.filter((r) => r.comprobaciones);
    console.log(`\nRevisados ${revisados.length} · sin .xml ${resultados.filter((r) => r.sin_xml).length} · con error ${resultados.filter((r) => r.error).length}`);
    const veredictos = {};
    for (const r of revisados) veredictos[`${r.fase} ${r.veredicto}`] = (veredictos[`${r.fase} ${r.veredicto}`] || 0) + 1;
    console.log('Veredictos:', veredictos);

    const porId = {};
    const conCex = revisados.filter((r) => r.comprobaciones.some((p) => ['huecos', 'puentes'].includes(p.id))).length;
    console.log(`Con .cex: ${conCex} de ${revisados.length}`);
    for (const r of revisados) {
        for (const p of r.comprobaciones) {
            const k = `${r.fase.padEnd(7)} ${p.id}`;
            porId[k] = porId[k] || { ok: 0, aviso: 0, falla: 0, no_comprobable: 0, info: 0 };
            porId[k][p.estado]++;
        }
    }
    console.log('\ncomprobación                             ok  aviso falla  ?  info');
    for (const k of Object.keys(porId).sort()) {
        const v = porId[k];
        console.log(`${k.padEnd(40)} ${String(v.ok).padStart(3)} ${String(v.aviso).padStart(5)} ${String(v.falla).padStart(5)} ${String(v.no_comprobable).padStart(3)} ${String(v.info).padStart(4)}`);
    }

    console.log('\nFALLOS sobre certificados aprobados:');
    for (const r of revisados) {
        for (const p of r.comprobaciones.filter((x) => x.estado === 'falla')) {
            console.log(`  ${r.numero} [${r.fase}] ${p.id}: dice «${p.dice}» · esperado «${p.esperado}»`);
        }
    }
    for (const r of resultados.filter((x) => x.error)) console.log(`  ${r.numero} [${r.fase}] ERROR ${r.error}`);

    if (o.salida) fs.writeFileSync(o.salida, JSON.stringify(resultados, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error('✗', e.message); process.exit(1); });
