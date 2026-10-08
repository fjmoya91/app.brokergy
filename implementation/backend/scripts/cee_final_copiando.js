#!/usr/bin/env node
// ============================================================================
// cee_final_copiando.js — el CEE FINAL de un RES060 COPIANDO el CEE inicial
// (decisión del usuario del 08/10/2026; `services/cee/ceeFinalCopiando.js`):
// el inicial del técnico + las instalaciones INSTALADAS + el autoconsumo máximo
// mes a mes como medida (dimensionado con el XML del propio final), en CE3X 3.2,
// con la fotovoltaica a 1.000 €/kWp.
//
//   node scripts/cee_final_copiando.js <nº|id> --fecha=2026-10-08            en seco
//   node scripts/cee_final_copiando.js <nº> --fecha=2026-10-08 --escribir
//
// Opciones:
//   --fecha=AAAA-MM-DD         emisión (y visita, si no se da --fecha-visita)
//   --fecha-visita=AAAA-MM-DD
//   --version=3.2|3.1|2.3      sin decirla, la vigente (3.2)
//   --base=ruta.cex            copia ESE inicial y no el que entregó el técnico
//   --guardar=ruta.cex         deja además una copia local del final
//   --escribir                 .cex + .xml + .pdf a «1. CEE / CEE FINAL» (lo anterior, a OLD)
//                              y, como `cee_final.js`, termina el encargo del AGENTE IA y
//                              avisa al equipo (WhatsApp + email)
//   --sin-aviso                con --escribir, no avisa
//
// En seco SÍ califica con CE3X (en el PC) para enseñar lo que saldría, pero no
// sube nada. Necesita el motor levantado (CEE_ENGINE_URL) y CE3X 3.2.
// `cee_final.js` manda aquí los RES060 (salvo --desde-medida).
// ============================================================================
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const cex = require('../services/ceeEnvolventeCex');
const { finalCopiandoInicial } = require('../services/cee/ceeFinalCopiando');
const cexAPdf = require('../services/cee/cexAPdf');

function args(argv) {
    const o = { clave: null, escribir: false };
    for (const a of argv) {
        const [k, ...v] = a.split('=');
        const val = v.join('=');
        if (a === '--escribir') o.escribir = true;
        else if (a === '--sin-aviso') o.sinAviso = true;
        else if (k === '--fecha') o.fecha = val;
        else if (k === '--fecha-visita') o.fechaVisita = val;
        else if (k === '--version') o.version = val;
        else if (k === '--base') o.base = val;
        else if (k === '--guardar') o.guardar = val;
        else if (!a.startsWith('--')) o.clave = a;
    }
    return o;
}

const miles = (n) => (n == null ? '—' : Math.round(n).toLocaleString('es-ES'));

async function main() {
    const o = args(process.argv.slice(2));
    if (!o.clave) {
        console.error('Uso: node scripts/cee_final_copiando.js <nº> --fecha=AAAA-MM-DD [--escribir]');
        process.exit(2);
    }
    const ctx = await cex.cargarExpediente(o.clave);
    if (!ctx) throw new Error(`No encuentro el expediente ${o.clave}`);
    const cexBase = o.base ? { bytes: fs.readFileSync(o.base), nombre: path.basename(o.base) } : null;

    const r = await finalCopiandoInicial(ctx, {
        fechaEmision: o.fecha, fechaVisita: o.fechaVisita, version: o.version || '3.2',
        cexBase, escribir: o.escribir,
    });

    console.log(`\n${ctx.expediente.numero_expediente} · CEE FINAL copiando «${r.base}» · CE3X ${r.version}`);
    console.log('Instalaciones del final (las instaladas):');
    for (const i of r.instalaciones) console.log(`  ${i}`);
    if (r.sin_medida) console.log(`Sin medida, CE3X: ${cexAPdf.textoCalificacion(r.sin_medida)}`);
    if (r.medida) {
        const m = r.medida;
        console.log(`Medida de AUTOCONSUMO: ${String(m.kwp).replace('.', ',')} kWp · `
                    + `${miles(m.kwh_declarado)} kWh/año declarados (90 % del consumo eléctrico del final: `
                    + `${miles(m.kwh_maximo)}) · inversión ${miles(m.inversion)} €`);
        if (m.meses) console.log(`  mes a mes: ${m.meses.map((x) => miles(x)).join(' · ')}`);
    }
    for (const a of r.avisos) console.log(`  ⚠ ${a}`);
    if (o.guardar) {
        fs.writeFileSync(o.guardar, r.bytes);
        console.log(`✓ copia local: ${o.guardar}`);
    }
    if (r.guardado?.ok) {
        console.log(`✓ ${r.guardado.nombre}${r.guardado.archivado ? ' (el anterior, a OLD)' : ''}\n  ${r.guardado.link || ''}`);
    }
    for (const l of cexAPdf.lineasCalificado(r.calificado)) console.log(l);
    if (!o.escribir) {
        console.log('\n(en seco: no se ha subido nada; con --escribir va a «1. CEE / CEE FINAL»)');
        return;
    }
    // Como `cee_final.js`: el AGENTE IA termina («pendiente de revisión» si el
    // encargo es suyo) y avisa al equipo, salvo --sin-aviso. Un fallo aquí no
    // deshace lo guardado.
    try {
        const t = await require('../services/agenteIa').terminar({
            negocio: 'cae', clave: ctx.expediente.id, fase: 'final',
            fichero: { nombre: r.guardado.nombre, link: r.guardado.link, carpeta_link: r.guardado.carpeta_link },
            avisos: r.avisos || [], aviso: !o.sinAviso,
        });
        require('./agente_ia').informeTerminar(t);
    } catch (e) {
        console.log(`\n✗ AGENTE IA: guardado, pero no se ha podido marcar ni avisar: ${e.message}`
            + `\n  Reintenta con: node scripts/agente_ia.js terminar ${ctx.expediente.numero_expediente} --fase final`);
    }
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1); });
