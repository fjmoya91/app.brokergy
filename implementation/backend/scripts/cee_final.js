#!/usr/bin/env node
// ============================================================================
// cee_final.js — el CEE FINAL desde la MEDIDA DE MEJORA del CEE inicial que
// entregó el técnico. Es lo mismo que el botón «Generar CEE final» de la fila del
// CEE final (misma función: `services/cee/ceeFinalDesdeMedida.js`).
//
//   node scripts/cee_final.js <nº|id>                       análisis (no escribe)
//   node scripts/cee_final.js <nº> --fecha=2026-09-30 --escribir
//   node scripts/cee_final.js <nº> --fecha=2026-09-30 --guardar="C:/Users/…/Downloads/x.cex"
//
// Opciones:
//   --fecha=AAAA-MM-DD         emisión (y visita, si no se da --fecha-visita)
//   --fecha-visita=AAAA-MM-DD
//   --medidas=retirada,autoconsumo,aislamiento_cubierta,aislamiento_fachada
//                              (sin ella, las de por defecto; "ninguna" = sin medida)
//   --cubierta=SOLUCION[:CM]   solución y espesor del aislamiento de cubierta
//                              (lana_forjado · xps_invertida · insuflado_cubierta)
//   --fachada=SOLUCION[:CM]    ídem en fachada (sate · insuflado_camara · trasdosado)
//   --nombre="…" --caracteristicas="…"   texto de la medida de retirada
//   --escribir                 lo deja en «1. CEE / CEE FINAL» como {nº} - CEE FINAL_REVISAR.cex
//   --guardar=ruta.cex         además (o sin --escribir: solo) una copia local
//   --json                     el análisis en JSON
//   --sin-aviso                con --escribir, no avisa al equipo (al relanzar)
//   --sin-pdf                  con --escribir, no lo califica ni deja su XML y su PDF
//   --calificar                sin --escribir: lo califica igual (y con --guardar, deja
//                              el XML y el PDF junto a la copia local)
//
// Con --escribir, además del .cex deja su XML y su PDF OFICIAL al lado, calificados
// por CE3X 3.1 sin abrir su ventana (`services/cee/cexAPdf.js`; solo en un PC con
// CE3X), y dice si la calificación coincide con la calculada para la medida del inicial.
//   --version=2.3|3.1          versión de CE3X del final (sin decirla, la 3.1 vigente; el
//                              inicial del técnico puede ser de la 2.3: se convierte al copiarlo)
//
// Con --escribir, al terminar avisa como el AGENTE IA (services/agenteIa.js):
// fase «pendiente de revisión» si el encargo es del agente, y WhatsApp + email.
//
// Sin --escribir ni --guardar NO toca nada: lee el .cex del técnico, pregunta al
// motor y enseña qué haría. Necesita el motor levantado (CEE_ENGINE_URL).
// ============================================================================
require('dotenv').config({ quiet: true });
const fs = require('fs');
const cex = require('../services/ceeEnvolventeCex');
const { prepararFinal } = require('../services/cee/ceeFinalDesdeMedida');
const cexAPdf = require('../services/cee/cexAPdf');

function args(argv) {
    const o = { clave: null, escribir: false, json: false };
    for (const a of argv) {
        const [k, ...v] = a.split('=');
        const val = v.join('=');
        if (a === '--escribir') o.escribir = true;
        else if (a === '--sin-aviso') o.sinAviso = true;
        else if (a === '--json') o.json = true;
        else if (a === '--sin-pdf') o.sinPdf = true;
        else if (a === '--calificar') o.calificar = true;
        else if (k === '--fecha') o.fecha = val;
        else if (k === '--fecha-visita') o.fechaVisita = val;
        else if (k === '--medidas') o.medidas = val === 'ninguna' ? [] : val.split(',').map((s) => s.trim()).filter(Boolean);
        else if (k === '--nombre') o.nombre = val;
        else if (k === '--caracteristicas') o.caracteristicas = val;
        else if (k === '--guardar') o.guardar = val;
        else if (k === '--version') o.version = val;
        else if (k === '--cubierta' || k === '--fachada') {
            const [solucion, cm] = val.split(':');
            o.params = { ...(o.params || {}), [`aislamiento_${k.slice(2)}`]: {
                solucion, ...(cm ? { espesor_cm: Number(String(cm).replace(',', '.')) } : {}) } };
        }
        else if (!a.startsWith('--')) o.clave = a;
    }
    return o;
}

const pct = (s) => s?.pct == null ? '' : `${s.pct} % (${s.superficie} m²)`;
const equipoTxt = (e) => `[${e.slot}] ${e.nombre} — ${Object.entries(e.servicios || {})
    .map(([k, v]) => `${k} ${pct(v)}`).join(' · ') || 'sin reparto'}`;
const res = (r) => r ? `emisiones ${r.emisiones} (${r.emisiones_letra}) · EPNR ${r.epnr} (${r.epnr_letra})`
    + ` · demanda cal ${r.demanda_cal} (${r.demanda_cal_letra})` : '—';

async function main() {
    const o = args(process.argv.slice(2));
    if (!o.clave) throw new Error('Dime qué expediente: node scripts/cee_final.js 26RES093_11');
    const ctx = await cex.cargarExpediente(o.clave);
    if (!ctx) throw new Error(`No encuentro el expediente ${o.clave}`);

    const textos = (o.nombre || o.caracteristicas)
        ? { retirada: { ...(o.nombre ? { nombre: o.nombre } : {}), ...(o.caracteristicas ? { caracteristicas: o.caracteristicas } : {}) } }
        : {};
    const escribir = o.escribir || !!o.guardar;
    const r = await prepararFinal(ctx, {
        escribir, guardarDrive: o.escribir,
        fechaEmision: o.fecha || null, fechaVisita: o.fechaVisita || o.fecha || null,
        medidas: o.medidas ?? null, textos, params: o.params || {},
        version: o.version || null,
    });
    if (o.json) {
        const { fichero, ...resto } = r;
        console.log(JSON.stringify(resto, null, 1));
    } else {
        const a = r.analisis;
        console.log(`\n${ctx.expediente.numero_expediente} · ${r.ficha}`);
        console.log(`  parte de: ${r.base}${a.version_inicial ? ` (CE3X ${a.version_inicial})` : ''}`);
        console.log(`  el final sale con CE3X ${r.version_ce3x || a.version_final || '3.1'}`);
        console.log(`  medida del inicial: «${a.medida_inicial.nombre}» · ${a.medida_inicial.calculada ? 'CALCULADA' : 'SIN calcular'}`
            + `${a.medida_inicial.desfase?.length ? ' · DESFASADA' : ''}`);
        console.log('  instalación del CEE FINAL (la de esa medida, con los equipos del expediente):');
        for (const e of a.equipos_final) console.log(`    ${equipoTxt(e)}`);
        if (a.tiene_renovable) console.log('    [renovable] placas solares existentes');
        for (const c of a.equipos_corregidos || []) {
            console.log(`    ⚠ ${c.servicio}: «${c.antes}» (${c.antes_rend} %) → «${c.ahora}» (${c.ahora_rend} %) — manda el EXPEDIENTE`);
        }
        console.log(`  al calificarlo en CE3X debe dar: ${res(a.resultados?.final)}`
            + (a.equipos_corregidos?.length ? '  ← NO vale: se han corregido equipos, saldrá otra cifra' : ''));
        console.log(`  (el inicial dio: ${res(a.resultados?.inicial)})`);
        console.log('  medidas del final:');
        for (const m of r.catalogo) {
            const marcada = r.marcadas.includes(m.id) ? '☑' : '☐';
            console.log(`    ${marcada} ${m.id}: ${m.disponible ? `«${m.datos?.nombre}»` : `NO — ${m.motivo}`}`);
            if (m.id === 'retirada' && m.disponible) {
                console.log(`       ${m.datos.caracteristicas}`);
                for (const e of m.equipos || []) console.log(`       ${equipoTxt(e)}`);
            }
            if (m.elemento && m.disponible) {
                const sol = m.soluciones.find((x) => x.id === m.solucion);
                const u = (xs) => [...new Set(xs.map((x) => x.toFixed(2)))].join('/');
                console.log(`       ${sol?.etiqueta} · ${m.espesorCm} cm · λ ${m.lambda} · U ${u(m.u_antes)} → ${u(m.u_despues)}`
                    + ` · ${m.superficie} m² (${m.cerramientos.join(', ')})`);
                console.log(`       ${m.datos.caracteristicas}`);
                console.log(`       Otros datos: ${m.datos.otros_datos}`);
            }
        }
    }
    if (r.avisos?.length) console.log(`\n  ⚠ ${r.avisos.join('\n  ⚠ ')}`);

    // Lo que CE3X calculó para la medida del inicial: con equipos corregidos ya
    // no vale como referencia (el final sale con otra máquina).
    const esperado = r.analisis?.equipos_corregidos?.length ? null : (r.analisis?.resultados?.final || null);
    const calificar = !o.sinPdf && (o.escribir || o.calificar);
    let cal = null;
    if (calificar && r.fichero) {
        console.log('\n  Calificando con CE3X 3.1 y generando el PDF (≈1 min)…');
        cal = await cexAPdf.calificarCex(r.fichero);
    }
    if (o.guardar && r.fichero) {
        fs.writeFileSync(o.guardar, r.fichero);
        console.log(`\n  copia local: ${o.guardar} (${r.fichero.length} bytes)`);
        for (const [ext, b] of [['.xml', cal?.xml], ['.pdf', cal?.pdf]]) {
            if (b) fs.writeFileSync(o.guardar.replace(/\.cex$/i, ext), b);
        }
    }
    if (cal && !o.escribir) for (const l of cexAPdf.lineasCalificado(cal, { esperado })) console.log(`  ${l}`);
    if (o.escribir) {
        console.log(`\n  ✓ guardado en Drive: ${r.guardado.carpeta} / ${r.guardado.nombre}`);
        if (r.guardado.archivado) console.log(`    (el anterior se archiva en OLD como «${r.guardado.archivado}»)`);
        console.log(`    ${r.guardado.link}\n    carpeta: ${r.guardado.carpeta_link}`);
        // Su XML y su PDF oficial junto al .cex (`cee/cexAPdf.js`, CE3X 3.1 en
        // este PC). Sin CE3X se dice y se sigue: el .cex ya está guardado.
        if (cal) {
            if (cal.xml || cal.pdf) {
                cal.guardado = await cex.guardarCalificadoEnDrive(ctx, 'final', r.guardado.nombre, { xml: cal.xml, pdf: cal.pdf });
            }
            for (const l of cexAPdf.lineasCalificado(cal, { esperado })) console.log(`  ${l}`);
        }
        // El AGENTE IA termina: «pendiente de revisión» si el encargo es suyo (si
        // hay un técnico asignado, no cambia de fase) y aviso al equipo, como un
        // técnico que sube su .cex. Un fallo aquí no deshace lo guardado.
        try {
            const t = await require('../services/agenteIa').terminar({
                negocio: 'cae', clave: ctx.expediente.id, fase: 'final',
                fichero: { nombre: r.guardado.nombre, link: r.guardado.link, carpeta_link: r.guardado.carpeta_link },
                avisos: r.avisos || [], aviso: !o.sinAviso,
            });
            require('./agente_ia').informeTerminar(t);
        } catch (e) {
            console.log(`\n  ✗ AGENTE IA: guardado, pero no se ha podido marcar ni avisar: ${e.message}`
                + `\n    Reintenta con: node scripts/agente_ia.js terminar ${ctx.expediente.numero_expediente} --fase final`);
        }
    } else if (!o.guardar) {
        console.log(`\n  EN SECO: iría a «${r.carpeta}» como «${r.nombre}». Pásale --escribir.`);
    }
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
