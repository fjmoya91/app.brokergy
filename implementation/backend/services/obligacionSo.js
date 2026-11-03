// ─────────────────────────────────────────────────────────────────────────────
// OBLIGACIÓN del Sujeto Obligado y lo DISPONIBLE para ofrecerle — la «Vista S.O.»
// de la pestaña Lotes (28/10/2026).
//
// La obligación de cada año (cuota del Anexo II, % al Fondo, lo que ya compró a
// otros) se guarda en `app_settings` como `obligacion_so:{id}`, el mismo patrón
// que las tarifas del verificador: es un dato de negocio que nos da el S.O., no
// una columna de su ficha, y no hace falta migración.
//
// La NORMALIZACIÓN y las cuentas son las del módulo puro del frontend
// (`lotes/logic/obligacionSo.js`), importado por ESM.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const { economiaDe, SELECT_EXP } = require('./economiaCae');
const { rankEstado, ESTADO_RECHAZADO } = require('../utils/expedienteEstados');
const { contarIncidenciasAbiertas } = require('../utils/incidenciasAbiertas');
const crypto = require('crypto');

let _logica = null;
const logica = () => (_logica ||= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic/obligacionSo.js')).href));

const settingsKey = (soId) => `obligacion_so:${soId}`;
const error = (msg, status = 400) => Object.assign(new Error(msg), { status });

async function getObligacion(soId) {
    const { normalizarObligacion } = await logica();
    const { data, error: e } = await supabase.from('app_settings').select('value').eq('key', settingsKey(soId)).maybeSingle();
    // Un fallo de lectura no puede contestar «no tiene obligación»: se leería
    // como un dato. Sube como 503.
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    if (!data?.value) return normalizarObligacion({});
    try { return normalizarObligacion(JSON.parse(data.value)); } catch { return normalizarObligacion({}); }
}

/** Se escribe ENTERA: la pantalla edita lo que tiene delante. */
async function saveObligacion(soId, body, quien = null) {
    const { normalizarObligacion } = await logica();
    const limpio = normalizarObligacion(body || {});
    const value = { anios: limpio.anios, asignacion: limpio.asignacion, actualizada_at: new Date().toISOString(), actualizada_por: quien };
    const { error: e } = await supabase.from('app_settings').upsert(
        { key: settingsKey(soId), value: JSON.stringify(value), updated_at: new Date().toISOString() },
        { onConflict: 'key' });
    if (e) throw error(`No se pudo guardar: ${e.message}`, 503);
    return normalizarObligacion(value);
}

// Por cercanía al CAE. Lo que ya pasó por verificación SIN lote (53 FINALIZADO
// y 2 en pago el 28/10/2026) se vendió antes de la app, por otra vía: no es
// disponible.
const R = (e) => rankEstado(e);
function etapaDisponible(estado) {
    const r = R(estado);
    if (r >= R('ENVIADO A VERIFICADOR')) return null;
    if (r >= R('DOC. COMPLETA')) return 'LISTO';
    if (r >= R('PTE. CEE FINAL')) return 'CERRANDO';
    if (r === R('PTE. FIN OBRA')) return 'OBRA';
    return 'ANTES';
}

/**
 * Lo que tenemos SIN lote (y sin rechazar), por etapa, con su ahorro: el
 * verificado si lo hay y si no el estimado (el del CEE o el de la propuesta).
 * No lleva importes: solo kWh, que es lo que se le ofrece al S.O.
 */
async function disponible() {
    const { data, error: e } = await supabase.from('expedientes').select(SELECT_EXP)
        .is('lote_id', null).or(`estado.is.null,estado.neq.${ESTADO_RECHAZADO}`)
        .order('numero_expediente').limit(5000);
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    const ecos = await economiaDe(data || []);

    // Las incidencias abiertas, solo de lo que está cerca del lote (listo y
    // cerrando, ~50): es lo que dice si un expediente pasará la verificación. De
    // `documentacion` se pide UN subcampo y de pocas filas.
    const cerca = ecos.filter(x => ['LISTO', 'CERRANDO'].includes(etapaDisponible(x.estado))).map(x => x.numero).filter(Boolean);
    const incDe = new Map();
    if (cerca.length) {
        const { data: inc, error: e2 } = await supabase.from('expedientes')
            .select('numero_expediente, inc:documentacion->incidencias').in('numero_expediente', cerca);
        if (e2) throw error(`No se pudo leer la BD: ${e2.message}`, 503);
        for (const r of inc || []) incDe.set(r.numero_expediente, contarIncidenciasAbiertas(r.inc));
    }

    const etapas = {};
    for (const x of ecos) {
        const et = etapaDisponible(x.estado);
        if (!et) continue;
        const kwh = x.ahorro_verificado_kwh ?? x.ahorro_kwh ?? 0;
        const g = (etapas[et] ||= { n: 0, kwh: 0, n_sin_cifra: 0, expedientes: [] });
        g.n++;
        g.kwh += kwh;
        if (x.origen_cifra == null) g.n_sin_cifra++;
        g.expedientes.push({
            numero: x.numero, ficha: x.ficha, estado: x.estado, kwh,
            origen: x.ahorro_verificado_kwh != null ? 'VERIFICADO' : x.origen_cifra,
            incidencias: incDe.get(x.numero) || null,
        });
    }
    for (const g of Object.values(etapas)) g.expedientes.sort((a, b) => (b.kwh || 0) - (a.kwh || 0));
    return { etapas, calculado_at: new Date().toISOString() };
}

// ─── La vista calculada en el SERVIDOR ──────────────────────────────────────────
// Para el enlace del S.O. y para el «le falta» del picker del lote. `lotes` llegan
// enriquecidos (enrichLotes de routes/lotes.js) con TODOS sus datos; lo que sale de
// `vistaParaElSo` son GWh y las cifras públicas del Anexo II, nunca un importe nuestro.
async function vistaSo({ soId, anio, lotes, conDisponible = false }) {
    const { computeVistaSo, aniosElegibles } = await logica();
    const [config, disp] = await Promise.all([getObligacion(soId), conDisponible ? disponible() : null]);
    const vista = computeVistaSo({ lotes, soId, anio, config, disponible: disp });
    return { ...vista, anios: aniosElegibles(config, lotes, soId) };
}

const CAMPOS_OBLIGACION = [
    'obligacion_gwh', 'pct_fondo', 'otros_gwh', 'equivalencia_mwh', 'ventas_gwh', 'fuente',
    'fondoGwh', 'cubribleGwh', 'brokergyGwh', 'emitidoGwh', 'faltaGwh', 'sobraGwh', 'aseguradoGwh',
    'pctAsegurado', 'pctCubierto', 'obligacionEur', 'fondoEur', 'cubribleEur', 'faltaEur',
];

/**
 * Lo que puede ver el S.O.: su obligación (sin nuestras NOTAS, que son internas),
 * nuestros lotes por etapa con su código, estado, nº de actuaciones y kWh, y de lo
 * que no está en ningún lote solo el TOTAL (Fran, 03/11/2026: es el mismo volumen
 * para cualquier S.O., y el detalle nos comprometería). Ni clientes, ni ids, ni
 * ofertas, ni los lotes que cuentan para otro año.
 */
function vistaParaElSo(vista, so = null) {
    const ob = vista.obligacion;
    return {
        anio: vista.anio,
        anios: vista.anios || [vista.anio],
        so: so ? {
            nombre: so.acronimo || so.razon_social || null, razon_social: so.razon_social || null,
            cif: so.cif || null, logo: so.logo_empresa || null,
        } : null,
        obligacion: ob ? Object.fromEntries(CAMPOS_OBLIGACION.map(k => [k, ob[k] ?? null])) : null,
        etapas: vista.etapas.map(e => ({
            id: e.id, titulo: e.titulo, sub: e.sub, kwh: e.kwh,
            // Un lote vacío es el que estamos armando: al S.O. no le dice nada (0 MWh y sin código).
            lotes: e.lotes.filter(l => l.nExpedientes > 0).map(l => ({
                codigo: l.codigo || 'Lote en preparación', estado: l.estado, etapa: l.etapa, kwh: l.kwh, fuente: l.fuente,
                nExpedientes: l.nExpedientes, requerimiento: l.requerimiento,
            })),
        })),
        brokergyGwh: vista.brokergyGwh,
        carteraGwh: vista.oferta ? vista.oferta.totalGwh : null,
        calculado_at: new Date().toISOString(),
    };
}

// ─── El ENLACE para el S.O. (03/11/2026) ────────────────────────────────────────
// Un token de 128 bits por S.O., en `app_settings` como `enlace_so:{id}`. Lo crea,
// lo cambia y lo quita el ADMIN; quitarlo o rehacerlo deja muerto el anterior.
const enlaceKey = (soId) => `enlace_so:${soId}`;
const TOKEN_RE = /^[0-9a-f]{32}$/;

async function getEnlace(soId) {
    const { data, error: e } = await supabase.from('app_settings').select('value').eq('key', enlaceKey(soId)).maybeSingle();
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    if (!data?.value) return null;
    try { const v = JSON.parse(data.value); return TOKEN_RE.test(v?.token || '') ? v : null; } catch { return null; }
}

async function crearEnlace(soId, quien = null) {
    const value = { token: crypto.randomBytes(16).toString('hex'), creado_at: new Date().toISOString(), creado_por: quien };
    const { error: e } = await supabase.from('app_settings').upsert(
        { key: enlaceKey(soId), value: JSON.stringify(value), updated_at: value.creado_at }, { onConflict: 'key' });
    if (e) throw error(`No se pudo guardar: ${e.message}`, 503);
    return value;
}

async function quitarEnlace(soId) {
    const { error: e } = await supabase.from('app_settings').delete().eq('key', enlaceKey(soId));
    if (e) throw error(`No se pudo quitar: ${e.message}`, 503);
}

/** El S.O. al que abre un token, o null. Son pocas filas: se comparan todas en tiempo constante. */
async function soDelToken(token) {
    if (!TOKEN_RE.test(String(token || ''))) return null;
    const { data, error: e } = await supabase.from('app_settings').select('key, value').like('key', 'enlace_so:%');
    if (e) throw error(`No se pudo leer la BD: ${e.message}`, 503);
    const pedido = Buffer.from(token);
    let soId = null;
    for (const r of data || []) {
        let t = null;
        try { t = JSON.parse(r.value)?.token; } catch { /* fila rota: no abre nada */ }
        if (TOKEN_RE.test(t || '') && crypto.timingSafeEqual(Buffer.from(t), pedido)) soId = r.key.slice('enlace_so:'.length);
    }
    return soId;
}

module.exports = {
    getObligacion, saveObligacion, disponible, etapaDisponible, settingsKey,
    vistaSo, vistaParaElSo, getEnlace, crearEnlace, quitarEnlace, soDelToken,
};
