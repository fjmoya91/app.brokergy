// ============================================================================
// ceeFinalCopiando.js — el CEE FINAL de un RES060 como lo quiere el usuario
// (decisión del 08/10/2026, «grabado a fuego»):
//
//   1. Se COPIA el CEE INICIAL (el del técnico: su envolvente, sus datos).
//   2. Se cambian las INSTALACIONES por las que se han INSTALADO de verdad (las
//      del expediente, ya corregidas por placas y facturas) — no las de la
//      medida de mejora que tecleó el técnico.
//   3. Si la vivienda no tiene placas, la medida es el AUTOCONSUMO, el MÁXIMO
//      que se permita MES A MES: primero se califica el final SIN medida para
//      tener SU XML, de él sale el consumo eléctrico de cada mes, y con él y
//      PVGIS los kWp (el 90 % del consumo anual del final) y lo que se declara
//      cada mes (lo menor entre producción y consumo). Al calificar con la
//      medida, CE3X recorta los meses que aún se pasen (`cexAPdf`).
//   4. Inversión del autoconsumo: 1.000 € por kWp.
//   5. En la versión vigente de CE3X (3.2).
//
// Todo por las funciones de la app: la ficha la compone `componerFicha` (la del
// botón de la envolvente), el motor copia y cambia con `/cex/instalaciones`, el
// autoconsumo lo dimensiona `medidasCe3x` y califica `cexAPdf`. Aquí solo se
// encadenan. Lo que el XML del final tiene que decir se le da a `medidasCe3x`
// metiéndolo EN MEMORIA en el expediente (`cee.xml_final`): no se escribe nada
// en la BD hasta que el final se suba y se revise.
//
// Caso de referencia: 26RES060_178 (08/10/2026) — inicial del técnico en la 2.3,
// caldera de gasóleo → Extensa S 10 (453 % cal., 280 % ref. con el EER de la FT)
// + Aeromax de ACS; sin medida B/C; autoconsumo 10,61 kWp a 10.610 €, 12.074 kWh
// por PVGIS y el consumo del XML del final, que CE3X deja en ~12.012.
// ============================================================================

const cex = require('../ceeEnvolventeCex');
const revisionCex = require('./revisionCex');
const cexAPdf = require('./cexAPdf');
const { fichaFromNumero } = require('../../utils/fichas');

const MOTOR = process.env.CEE_ENGINE_URL || 'http://cee-engine:8080';
const ESPERA_MS = Number(process.env.CEE_FINAL_ESPERA_MS || 180000);
//: Lo que cuesta la fotovoltaica de la medida, por kWp instalado (decisión del
//: usuario, 08/10/2026). Sin inversión CE3X la da por gratis («<500 €»).
const EUR_POR_KWP = 1000;

function error(status, mensaje) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

async function motorJson(ruta, cuerpo) {
    const r = await fetch(`${MOTOR}${ruta}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(ESPERA_MS),
    });
    if (!r.ok) throw error(r.status === 422 ? 422 : 502, `${ruta}: ${(await r.json().catch(() => ({}))).detail || r.status}`);
    return r.json();
}

async function copiarConInstalaciones(base, ficha) {
    const fd = new FormData();
    fd.append('fichero', new Blob([base]), 'inicial.cex');
    fd.append('datos', JSON.stringify(ficha));
    const r = await fetch(`${MOTOR}/cex/instalaciones`, { method: 'POST', body: fd, signal: AbortSignal.timeout(ESPERA_MS) });
    if (!r.ok) throw error(r.status === 422 ? 422 : 502, (await r.json().catch(() => ({}))).detail || 'el motor no ha escrito el final');
    let avisos = [];
    try { avisos = JSON.parse(r.headers.get('X-Cee-Avisos') || '[]'); } catch { /* */ }
    return { bytes: Buffer.from(await r.arrayBuffer()), avisos, version: r.headers.get('X-Cee-Version') };
}

/** El XML de CE3X como texto (lo escribe en ISO-8859-1 o UTF-8, según su cabecera). */
function textoXml(buf) {
    const cab = buf.subarray(0, 120).toString('latin1');
    return /encoding=["']utf-?8/i.test(cab) ? buf.toString('utf8') : buf.toString('latin1');
}

/**
 * @param {object} ctx   el de `ceeEnvolventeCex.cargarExpediente`
 * @param {object} op
 * @param {string} op.fechaEmision   'AAAA-MM-DD' (obligatoria: se pregunta)
 * @param {string} [op.fechaVisita]  sin ella, la de emisión
 * @param {string} [op.version]      '3.2' (vigente) · '3.1' · '2.3'
 * @param {{bytes, nombre}} [op.cexBase]  otro inicial en vez del del técnico
 * @param {boolean} [op.escribir]    deja .cex, .xml y .pdf en «1. CEE / CEE FINAL»
 */
async function finalCopiandoInicial(ctx, { fechaEmision, fechaVisita = null, version = '3.2',
                                           cexBase = null, escribir = false } = {}) {
    const exp = ctx?.expediente;
    if (!exp) throw error(404, 'Expediente no encontrado');
    const ficha = fichaFromNumero(exp.numero_expediente) || 'RES060';
    if (ficha !== 'RES060') {
        throw error(422, `Este camino es el del RES060 (este expediente es ${ficha}). RES093: cee_final.js `
            + '(retirar el generador en apoyo); RES080: el PREVISTO (skill generar-cee-inicial).');
    }
    if (exp.seguimiento?.cee_final === 'REGISTRADO') throw error(409, 'El CEE final ya está REGISTRADO.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaEmision || ''))) {
        throw error(400, 'Falta la fecha de emisión del CEE final (--fecha=AAAA-MM-DD): no se inventa.');
    }
    const avisos = [];

    // ── 1. El INICIAL que se copia ───────────────────────────────────────────
    let base = cexBase?.bytes?.length ? { ...cexBase, aMano: true } : await revisionCex.cexEntregado(ctx, 'inicial');
    if (!base) {
        base = await cex.leerCexDeFase(ctx, 'inicial');
        if (base) avisos.push(`No hay .cex del técnico en «1. CEE / CEE INICIAL»: se copia el borrador de la app («${base.nombre}»).`);
    }
    if (!base) throw error(409, 'No hay ningún CEE inicial (.cex) que copiar en «1. CEE / CEE INICIAL».');
    if (base.aMano) avisos.push(`Se copia un .cex indicado a mano («${base.nombre}»).`);

    // ── 2. La ficha del final: la del botón de la envolvente ─────────────────
    // Con las fechas del FINAL en memoria (el informe las toma de ahí) y la
    // versión vigente. La geometría solo hace falta para componerla: el motor
    // copia la envolvente del fichero, no la vuelve a medir.
    const rc = exp.instalacion?.ref_catastral;
    if (!rc) throw error(422, 'El expediente no tiene referencia catastral.');
    let geo;
    try { geo = await motorJson('/envolvente', { referencia_catastral: rc, offline: true }); }
    catch { geo = await motorJson('/envolvente', { referencia_catastral: rc, offline: false }); }
    const trabajo = await cex.leerTrabajo(exp.id).catch(() => null);
    const conFechas = (e) => ({ ...e, cee: { ...(e.cee || {}),
        fecha_firma_cee_final: fechaEmision, fecha_visita_cee_final: fechaVisita || fechaEmision } });
    const ctxF = { ...ctx, expediente: conFechas(exp) };
    const ajustesBase = { ...(trabajo?.ajustes || {}), version_ce3x: version };
    const componer = (c, aj, medidas) => cex.componerFicha(c, {
        geometria: geo.geometria, envolvente: trabajo || undefined, ajustes: aj, medidas, conImagenes: false, fase: 'final',
    });

    // ── 3a. Primera vuelta: el final SIN medida, para tener SU XML ───────────
    const f1 = await componer(ctxF, ajustesBase, []);
    if (!(f1.ficha.instalaciones || []).length) {
        throw error(422, `No hay equipo nuevo que escribir: ${(f1.avisos || []).join(' · ') || 'revisa Instalación'}`);
    }
    const v1 = await copiarConInstalaciones(base.bytes, f1.ficha);
    const c1 = await cexAPdf.calificarCex(v1.bytes, { medidas: false, pdf: false, ajustarAutoconsumo: false });
    if (!c1.ok || !c1.xml) {
        throw error(502, `CE3X no ha calificado el final sin medida: ${c1.error || 'sin XML'}. Sin su XML no se `
            + 'puede saber el consumo de cada mes.');
    }

    // ── 3b. Segunda vuelta: el AUTOCONSUMO máximo mes a mes ──────────────────
    // El XML del final, en memoria: `medidasCe3x` saca de él el techo (90 % del
    // consumo eléctrico anual) y el consumo de cada mes.
    const ctxX = { ...ctxF, expediente: { ...ctxF.expediente,
        cee: { ...ctxF.expediente.cee, xml_final: textoXml(c1.xml), cee_final: null } } };
    const pv = await cex.pvgisParaAutoconsumo(ctxX, ajustesBase);
    if (pv.aviso) avisos.push(pv.aviso);
    let aj = { ...ajustesBase, ...(pv.especifica ? { autoconsumo_pvgis: pv.especifica } : {}) };
    let f2 = await componer(ctxX, aj, ['autoconsumo']);
    const auto = (f2.catalogo || []).find((m) => m.id === 'autoconsumo');
    let medida = null;
    if (!auto?.disponible) {
        avisos.push(`Sin medida de autoconsumo: ${auto?.motivo || 'no está disponible'}.`);
        f2 = await componer(ctxX, aj, []);
    } else {
        const inversion = auto.kwp_pvgis ? Math.round(auto.kwp_pvgis * EUR_POR_KWP) : 0;
        aj = { ...aj, autoconsumo_inversion: inversion };
        f2 = await componer(ctxX, aj, ['autoconsumo']);
        const a2 = (f2.catalogo || []).find((m) => m.id === 'autoconsumo') || auto;
        medida = {
            kwp: a2.kwp_pvgis, kwh_maximo: a2.kwh_maximo, kwh_declarado: a2.kwh_declarado,
            meses: a2.datos?.instalaciones?.[0]?.generacion_mensual_kwh || null, inversion, nota: a2.nota,
        };
    }
    const v2 = await copiarConInstalaciones(base.bytes, f2.ficha);

    // ── 4. Calificar: CE3X recorta los meses que aún pasen de SU consumo ─────
    // y el `.cex` que vale es el que guarda él (regla 126). Se sube UNA vez,
    // ya ajustado, con su XML y su PDF al lado.
    const calificado = await cexAPdf.calificarCex(v2.bytes, { pdf: escribir });
    const definitivo = calificado.cex || v2.bytes;
    const resultado = {
        base: base.nombre, nombre: cex.nombreDelCex(exp, 'final'), version: v2.version,
        instalaciones: (f2.ficha.instalaciones || []).map((e) => `[${e.slot}] ${e.nombre}`),
        sin_medida: c1.calificacion,
        medida,
        avisos: [...new Set([...avisos, ...(f2.avisos || []), ...v2.avisos])],
        bytes: definitivo,
        calificado,
    };
    if (!escribir) return resultado;
    const guardado = await cex.guardarEnDrive(ctx, definitivo, 'final');
    if (!guardado.ok) throw error(502, `El final se ha montado pero no se ha podido guardar: ${guardado.error}`);
    if (calificado.xml || calificado.pdf) {
        calificado.guardado = await cex.guardarCalificadoEnDrive(ctx, 'final', guardado.nombre,
            { xml: calificado.xml, pdf: calificado.pdf });
    }
    return { ...resultado, guardado };
}

module.exports = { finalCopiandoInicial, EUR_POR_KWP };
