#!/usr/bin/env node
/**
 * revisar_cee.js — revisa un certificado desde la línea de órdenes.
 *
 *   node scripts/revisar_cee.js <inicial.xml> [posterior.xml] [--exp expediente.json]
 *                              [--fase inicial|final] [--json]
 *
 * Sin `--exp` hace solo la RADIOGRAFÍA: qué dice el certificado. Con el
 * expediente delante, además lo juzga punto por punto.
 *
 * El `expediente.json` es la fila de `expedientes` tal y como la devuelve
 * Supabase o el MCP (`get_expediente`), con su `oportunidades` dentro.
 *
 * Es la superficie de la FASE 1: el juicio ya vive en `services/cee/`, así que
 * llevarlo a una ruta de la app es declararla, no reescribirlo.
 */
const fs = require('fs');
const path = require('path');

const { radiografiaXml, compararEnvolventes } = require('../services/cee/radiografiaCee');

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (COLOR ? `[${code}m${s}[0m` : s);
const ICONO = { ok: c(32, '✓'), aviso: c(33, '!'), falla: c(31, '✗'), no_comprobable: c(90, '?'), info: c(36, 'i') };

function args(argv) {
    const o = { ficheros: [], exp: null, fase: null, json: false, expediente: null, ponerMedida: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--exp') o.exp = argv[++i];
        else if (a === '--fase') o.fase = argv[++i];
        else if (a === '--json') o.json = true;
        else if (a === '--expediente') o.expediente = argv[++i];
        //: ESCRIBE en Drive: el `.cex` del técnico con la medida de mejora del
        //: expediente, como `{nº} - CEE INICIAL_CON MEDIDA_REVISAR.cex`. Nunca
        //: sale solo: hay que pedirlo.
        else if (a === '--poner-medida') o.ponerMedida = true;
        else if (!a.startsWith('--')) o.ficheros.push(a);
    }
    return o;
}

/**
 * Todo lo que hace falta para revisar, desde Supabase. La carga vive en
 * `services/cee/cargarRevision.js`: la comparten este CLI, el barrido de
 * calibración y la ruta de la app.
 */
async function desdeSupabase(numero) {
    const { cargarParaRevision } = require('../services/cee/cargarRevision');
    const r = await cargarParaRevision({ numero });
    if (!r.fases.length) {
        throw new Error(`${numero} no tiene ningún .xml guardado (cee.xml_inicial / cee.xml_final). `
            + 'Pásale el fichero a mano, o cárgalo en el módulo CEE.');
    }
    return r;
}

/**
 * ¿Es el certificado de ANTES o el de DESPUÉS? Se PROPONE por el nombre.
 *
 * ⚠️ Es una conjetura y hay que tratarla como tal: de la fase depende el
 * criterio con el que se juzga —en el inicial se espera una caldera y en el
 * final una bomba de calor, y en un RES080 se espera que la demanda BAJE— así
 * que acertarla al revés no da un aviso raro: revisa con el criterio contrario.
 * Por eso `--fase` MANDA siempre que venga, y cuando se deduce, se dice.
 *
 * En la app esto no se adivina: la fase la da el SLOT al que el certificador
 * subió el fichero (`ceeUploadService`), que es un dato, no una conjetura.
 */
function faseDelNombre(f) {
    const n = path.basename(f).toUpperCase();
    if (/FINAL|POSTERIOR|MEJORA|PREVIST|AEROTERMIA/.test(n)) return 'final';
    return 'inicial';
}

function pintaRadiografia(rx, titulo) {
    console.log(`\n${c(1, titulo)}`);
    const id = rx.identificacion;
    console.log(`  Vivienda      ${id.direccion || '—'}`);
    console.log(`                ${id.municipio || '—'} (${id.provincia || '—'}) · RC ${id.ref_catastral || '—'}`);
    console.log(`  Zona / año    ${id.zona_climatica || '—'} · ${id.anio_construccion || '—'} · ${id.normativa || '—'}`);
    console.log(`  Superficie    ${rx.geometria.superficie_habitable ?? '—'} m²`);
    console.log(`  Demanda       cal ${rx.demanda.calefaccion ?? '—'} · ref ${rx.demanda.refrigeracion ?? '—'} · ACS ${rx.demanda.acs ?? '—'} kWh/m²·año`);
    console.log(`  Calificación  EPnr ${rx.calificacion.epnr || '—'} · emisiones ${rx.calificacion.emisiones || '—'}`);
    for (const [servicio, lista] of Object.entries(rx.generadores)) {
        for (const g of lista) {
            const pot = g.potencia_kw !== null ? `${String(g.potencia_kw).replace('.', ',')} kW` : '— kW';
            const rend = g.rendimiento_pct !== null ? `${String(g.rendimiento_pct).replace('.', ',')} %` : '—';
            console.log(`  ${servicio.padEnd(13)} ${g.nombre || '(sin nombre)'} — ${g.tipo} · ${g.vector} · ${pot} · η ${rend}`);
        }
    }
    if (rx.medidas.length) {
        console.log(`  Medidas       ${rx.medidas.map((m) => m.nombre || '(sin nombre)').join(' · ')}`);
    }
    console.log(`  Envolvente    ${rx.envolvente.huecos.length} huecos · ${rx.envolvente.opacos.length} opacos`);
}

function pintaInforme(res) {
    const color = { 'APTO': 32, 'APTO CON AVISOS': 33, 'NO APTO': 31 }[res.veredicto] || 0;
    console.log(`\n${c(1, `REVISIÓN — ${res.contexto.expediente || 'sin expediente'} · ficha ${res.ficha} · CEE ${res.fase}`)}`);
    console.log(`  ${c(color, c(1, res.veredicto))}   ${res.resumen.ok} correctos · ${res.resumen.avisos} avisos · ${res.resumen.fallas} fallos · ${res.resumen.no_comprobables} sin comprobar · ${res.resumen.info || 0} informativos\n`);
    for (const p of res.comprobaciones) {
        console.log(`  ${ICONO[p.estado]} ${c(1, p.titulo)}`);
        if (p.dice) console.log(`      dice:     ${p.dice}`);
        if (p.esperado) console.log(`      esperado: ${p.esperado}`);
        if (p.detalle) console.log(`      ${c(90, '→ ' + p.detalle)}`);
    }
}

async function main() {
    const o = args(process.argv.slice(2));
    if (!o.ficheros.length && !o.expediente) {
        console.error('uso: node scripts/revisar_cee.js --expediente 26RES060_192 [--fase inicial|final] [--json]');
        console.error('     node scripts/revisar_cee.js <cee.xml> [otro.xml] [--exp expediente.json] [--fase …]');
        return 1;
    }

    let expedienteBd = null;
    let certificadorBd = null;
    let cexBd = {};
    let leidos;
    if (o.expediente) {
        const traido = await desdeSupabase(o.expediente);
        expedienteBd = traido.expediente;
        certificadorBd = traido.certificador;
        cexBd = traido.cex || {};
        leidos = traido.fases;
    } else {
        leidos = o.ficheros.map((f) => ({
            fichero: f,
            fase: faseDelNombre(f),
            deducida: true,
            rx: radiografiaXml(fs.readFileSync(f)),
        }));
    }

    // Con dos ficheros, el que se revisa es el de la fase pedida (por defecto el
    // INICIAL, que es el que se revisa antes de dar el visto bueno) y el otro va
    // como contraste para poder decir qué cambia entre los dos.
    //
    // `--fase` MANDA sobre lo que diga el nombre del fichero, y con un solo
    // fichero se le aplica a ése: lo contrario era ignorar en silencio lo que el
    // usuario acaba de escribir y revisar con el criterio contrario.
    const principal = o.fase
        ? (leidos.find((l) => l.fase === o.fase) || leidos[0])
        : leidos[0];
    if (o.fase && principal.fase !== o.fase) {
        principal.fase = o.fase;
        principal.deducida = false;
    } else if (o.fase) {
        principal.deducida = false;
    }
    const otro = leidos.find((l) => l !== principal) || null;

    for (const l of leidos) {
        const nota = l.deducida ? c(90, ' (fase deducida del nombre)') : '';
        pintaRadiografia(l.rx, `${path.basename(l.fichero)}  [${l.fase}]${nota}`);
    }

    if (otro) {
        const ini = principal.fase === 'final' ? otro.rx : principal.rx;
        const fin = principal.fase === 'final' ? principal.rx : otro.rx;
        const cambios = compararEnvolventes(ini, fin);
        console.log(`\n${c(1, 'QUÉ CAMBIA ENTRE LOS DOS CERTIFICADOS')}`);
        const filas = [
            ...cambios.huecos.cambiados.map((h) => ['hueco', h]),
            ...cambios.opacos.cambiados.map((x) => ['opaco', x]),
        ];
        if (!filas.length) console.log('  (ningún cerramiento cambia — la envolvente es la misma)');
        for (const [clase, e] of filas) {
            console.log(`  ${clase.padEnd(6)} ${String(e.nombre).padEnd(28)} U ${e.u_antes} → ${e.u_despues}`);
        }
    }

    const expediente = expedienteBd
        || (o.exp ? JSON.parse(fs.readFileSync(o.exp, 'utf8')) : null);
    if (!expediente) {
        console.log(`\n${c(90, 'Sin --exp ni --expediente solo se ha hecho la radiografía. Pásale el expediente para que lo juzgue.')}`);
        return 0;
    }

    const cexFase = cexBd[principal.fase];
    if (cexFase?.error) console.log(`\n${c(33, `! .cex no leído: ${cexFase.error}`)}`);
    else if (cexFase) console.log(`\n${c(90, `.cex del técnico: ${cexFase.nombre}`)}`);
    else if (expedienteBd) console.log(`\n${c(33, '! No hay .cex del técnico en la carpeta: la medida de mejora no se puede revisar.')}`);

    const { revisarCee } = require('../services/cee/revisionCee');
    const res = await revisarCee({
        cex: cexFase?.rx || null,
        radiografia: principal.rx,
        otraFase: otro ? otro.rx : null,
        expediente,
        certificador: certificadorBd,
        fase: principal.fase,
    });

    if (o.json) console.log(JSON.stringify(res, null, 2));
    else pintaInforme(res);

    const faltaMedida = res.comprobaciones.some((p) => p.accion === 'poner_medida');
    if (faltaMedida && !o.ponerMedida && !o.json) {
        console.log(`
${c(36, '→ La app puede poner la medida: vuelve a lanzarlo con --poner-medida.')}`);
    }
    if (o.ponerMedida && expedienteBd) {
        if (!faltaMedida) {
            console.log(`
${c(90, '--poner-medida: el .cex ya lleva medida de mejora; no se toca.')}`);
        } else {
            const cex = require('../services/ceeEnvolventeCex');
            const { ponerMedida } = require('../services/cee/revisionCex');
            const r = await ponerMedida(await cex.cargarExpediente(o.expediente));
            console.log(`
${c(32, `✓ Medida puesta: «${r.medidas.join(' · ')}»`)}`);
            console.log(`  sobre ${r.base} → ${r.nombre}`);
            if (r.link) console.log(`  ${r.link}`);
            console.log(c(33, '  Falta CALCULARLA: abrir en CE3X, Medidas de Mejora → «Actualizar», y guardarlo como el .cex del certificado.'));
            for (const a of r.avisos) console.log(c(90, `  · ${a}`));
        }
    }
    return res.veredicto === 'NO APTO' ? 2 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
    console.error('✗', e.message);
    process.exit(1);
});
