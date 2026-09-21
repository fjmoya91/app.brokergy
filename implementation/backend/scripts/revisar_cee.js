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
const ICONO = { ok: c(32, '✓'), aviso: c(33, '!'), falla: c(31, '✗'), no_comprobable: c(90, '?') };

function args(argv) {
    const o = { ficheros: [], exp: null, fase: null, json: false, expediente: null };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--exp') o.exp = argv[++i];
        else if (a === '--fase') o.fase = argv[++i];
        else if (a === '--json') o.json = true;
        else if (a === '--expediente') o.expediente = argv[++i];
        else if (!a.startsWith('--')) o.ficheros.push(a);
    }
    return o;
}

/**
 * Todo lo que hace falta para revisar, desde Supabase y con el nº de expediente.
 *
 * El `.xml` crudo de cada fase está guardado en el propio expediente
 * (`cee.xml_inicial` / `cee.xml_final`), así que no hay que bajar nada de Drive.
 *
 * ⚠️ Viene EN MAYÚSCULAS —`normalizeData` deja así la columna entera— y eso es
 * justo lo que impide releerlo con `parseCeeXml` (regla 32). `radiografiaCee`
 * sí puede: busca sin distinguir mayúsculas y normaliza los valores antes de
 * casarlos con los enums de CE3X.
 *
 * ⚠️ Los dos XML pesan ~110 KB cada uno: se piden de UN expediente, nunca de un
 * listado (regla 22).
 */
async function desdeSupabase(numero) {
    const supabase = require('../services/supabaseClient');
    const { data, error } = await supabase
        .from('expedientes')
        .select('*, oportunidades(*)')
        .eq('numero_expediente', numero)
        .maybeSingle();
    if (error) throw new Error(`Supabase: ${error.message}`);
    if (!data) throw new Error(`No existe el expediente ${numero}.`);

    //: Quién tiene asignado el CEE, para poder decir si lo firma ese técnico.
    //: ⚠️ La columna del NIF en `prescriptores` es `cif`, no `cif_nif` (regla 51).
    let certificador = null;
    const certId = data.cee?.certificador_id;
    if (certId) {
        const { data: p } = await supabase.from('prescriptores')
            .select('id_empresa, razon_social, cif, nombre_responsable, nif_responsable, es_autonomo')
            .eq('id_empresa', certId).maybeSingle();
        certificador = p || null;
    }

    const fases = [];
    for (const fase of ['inicial', 'final']) {
        const crudo = data.cee?.[`xml_${fase}`];
        if (crudo) fases.push({ fichero: `${numero} · CEE ${fase} (Supabase)`, fase, deducida: false, rx: radiografiaXml(crudo) });
    }
    if (!fases.length) {
        throw new Error(`${numero} no tiene ningún .xml guardado (cee.xml_inicial / cee.xml_final). `
            + 'Pásale el fichero a mano, o cárgalo en el módulo CEE.');
    }
    return { expediente: data, certificador, fases };
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
    console.log(`  ${c(color, c(1, res.veredicto))}   ${res.resumen.ok} correctos · ${res.resumen.avisos} avisos · ${res.resumen.fallas} fallos · ${res.resumen.no_comprobables} sin comprobar\n`);
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
    let leidos;
    if (o.expediente) {
        const traido = await desdeSupabase(o.expediente);
        expedienteBd = traido.expediente;
        certificadorBd = traido.certificador;
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

    const { revisarCee } = require('../services/cee/revisionCee');
    const res = await revisarCee({
        radiografia: principal.rx,
        otraFase: otro ? otro.rx : null,
        expediente,
        certificador: certificadorBd,
        fase: principal.fase,
    });

    if (o.json) console.log(JSON.stringify(res, null, 2));
    else pintaInforme(res);
    return res.veredicto === 'NO APTO' ? 2 : 0;
}

main().then((code) => process.exit(code)).catch((e) => {
    console.error('✗', e.message);
    process.exit(1);
});
