// ─── riteapp/payload.js — la memoria RITE SUELTA, en la forma de un expediente ─
// App RITE (rite.brokergy.es, 25/11/2026). Una memoria suelta NO tiene expediente,
// ni oportunidad, ni prescriptor: tiene sus propios datos (`riteapp_memorias.datos`)
// y la cuenta del instalador que la pide (`riteapp_cuentas`). Para no duplicar ni
// una regla de la Memoria RITE, aquí se traducen a las MISMAS formas que usa la obra
// CAE (`exp`, `cli`, `op`, `pres`) y se pasan por:
//   · `validateMemoriaRite`  (utils/riteValidation.js) — lo que falta, igual que en el CRM
//   · `buildRitePayloads`    (services/riteGenerador.js) — el payload del generador
// Así una regla nueva de la memoria (el ACS con cambio_acs vacío, la cascada, el
// frío…) vale sola para las dos entradas.
//
// Es PURO (sin BD ni red): se prueba con `node scripts/test_riteapp_payload.js`.
// ─────────────────────────────────────────────────────────────────────────────
const { validateMemoriaRite, isPresent } = require('../../utils/riteValidation');
const { buildRitePayloads } = require('../riteGenerador');

/** La plantilla del generador es la oficial de la JCCM: solo vale en Castilla-La Mancha. */
const PROVINCIAS_CLM = ['ALBACETE', 'CIUDAD REAL', 'CUENCA', 'GUADALAJARA', 'TOLEDO'];
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const esDeClm = (provincia) => PROVINCIAS_CLM.includes(sinTildes(provincia));

/** ESPEJO de FACTOR_ZONA en rite-generator/lib/cargas_termicas.py (W/m² por letra de zona). */
const FACTOR_ZONA = { A: 60, B: 70, C: 80, D: 90, E: 100 };
const factorZona = (zona) => FACTOR_ZONA[String(zona || '').trim().charAt(0).toUpperCase()] || 90;
/** ESPEJO de W_POR_ELEMENTO / _w_elemento del generador. */
const W_POR_ELEMENTO = 100;
const wElemento = (v, porDefecto = W_POR_ELEMENTO) => {
    const w = Number(String(v ?? '').replace(',', '.'));
    return w >= 30 && w <= 400 ? w : porDefecto;
};
const elementosReales = (v) => {
    const n = Math.trunc(Number(String(v ?? '').replace(',', '.')));
    return n > 0 && n <= 200 ? n : 0;
};
const MAX_ESTANCIAS = 25; // filas de la tabla de la plantilla de la JCCM

const EMISORES = ['radiadores_convencionales', 'suelo_radiante', 'splits', 'conductos'];
const esRadiadores = (emisor) => !emisor || emisor === 'radiadores_convencionales' || /^radiador/i.test(emisor);

/**
 * Limpia las estancias que manda el navegador (modo rápido o extendido). Devuelve
 * la forma de `documentacion.rite_locales` del CRM más `modo`, `w_elemento` y, en
 * cada estancia, `elementos` (solo los del modo extendido).
 */
function limpiarEstancias(e) {
    const modo = e?.modo === 'extendido' ? 'extendido' : 'rapido';
    const plantas = (Array.isArray(e?.plantas) ? e.plantas : []).map(p => ({
        planta: String(p?.planta ?? '0').slice(0, 4),
        locales: (Array.isArray(p?.locales) ? p.locales : []).map(l => {
            const limpio = {
                tipo: String(l?.tipo || '').toLowerCase().slice(0, 20),
                nombre: String(l?.nombre || '').toUpperCase().trim().slice(0, 40),
                orientacion: String(l?.orientacion || '-').toUpperCase().slice(0, 3),
                m2: Math.max(0, Math.round((Number(String(l?.m2 ?? 0).replace(',', '.')) || 0) * 10) / 10),
                manual: !!l?.manual,
            };
            if (modo === 'extendido') {
                const n = elementosReales(l?.elementos);
                if (n) limpio.elementos = n;
                if (l?.w_elemento != null && l.w_elemento !== '') limpio.w_elemento = wElemento(l.w_elemento);
            }
            return limpio;
        }).filter(l => l.nombre),
    })).filter(p => p.locales.length);
    return { modo, w_elemento: wElemento(e?.w_elemento), plantas };
}

/**
 * La tabla de cargas tal como saldrá en la memoria (para enseñarla ANTES de
 * generar) y su suma. Mismo cálculo que `cargas_desde_locales` del generador.
 */
function tablaEstancias(estancias, { zona, emisor } = {}) {
    const f = factorZona(zona);
    const rad = esRadiadores(emisor);
    const wDef = wElemento(estancias?.w_elemento);
    const filas = [];
    for (const p of estancias?.plantas || []) {
        for (const l of p.locales || []) {
            const carga = Math.round((Number(l.m2) || 0) * f);
            const n = rad && estancias.modo === 'extendido' ? elementosReales(l.elementos) : 0;
            filas.push({
                planta: p.planta, nombre: l.nombre, m2: l.m2, orientacion: l.orientacion,
                carga_w: carga,
                elementos: rad ? (n || Math.ceil(carga / W_POR_ELEMENTO)) : null,
                potencia_w: n ? Math.round(n * wElemento(l.w_elemento, wDef)) : carga,
                elementos_reales: !!n,
            });
        }
    }
    const carga = filas.reduce((s, r) => s + r.carga_w, 0);
    const potencia = filas.reduce((s, r) => s + r.potencia_w, 0);
    return { factor: f, filas, total: { carga_w: carga, potencia_w: potencia } };
}

/** Potencia de calefacción declarada (kW), sumando la cascada. */
function potenciaCalKw(cal) {
    const uds = [cal, ...(Array.isArray(cal?.equipos_extra) ? cal.equipos_extra : [])].filter(Boolean);
    return uds.reduce((s, u) => s + (Number(String(u.potencia ?? '').replace(',', '.')) || 0), 0);
}

/**
 * Las formas de la obra CAE a partir de una memoria suelta y la cuenta que la pide.
 * `memoria`: fila de `riteapp_memorias` ({ numero, datos }). `cuenta`: fila de
 * `riteapp_cuentas` (la empresa instaladora que firma).
 */
function aContexto({ memoria, cuenta }) {
    const d = memoria?.datos || {};
    const t = d.titular || {};
    const v = d.vivienda || {};
    const i = d.instalacion || {};
    const f = d.fechas || {};
    const estancias = limpiarEstancias(d.estancias);

    // El emplazamiento es la VIVIENDA; si el titular vive en otro sitio, su
    // domicilio va aparte (misma regla 149 que en el CRM).
    const mismaDireccion = t.misma_direccion !== false;
    const cli = {
        nombre_razon_social: t.nombre || '',
        apellidos: t.es_empresa ? '' : (t.apellidos || ''),
        dni: t.nif || '',
        tlf: t.telefono || '',
        sexo: t.sexo || '',
        es_empresa: !!t.es_empresa,
        direccion: mismaDireccion ? (v.direccion || '') : (t.direccion || ''),
        municipio: mismaDireccion ? (v.municipio || '') : (t.municipio || ''),
        provincia: mismaDireccion ? (v.provincia || '') : (t.provincia || ''),
        codigo_postal: mismaDireccion ? (v.codigo_postal || '') : (t.codigo_postal || ''),
    };
    const instalacion = {
        tipo_emisor: EMISORES.includes(i.tipo_emisor) ? i.tipo_emisor : '',
        aerotermia_cal: i.aerotermia_cal || {},
        aerotermia_acs: i.aerotermia_acs || {},
        cambio_acs: i.cambio_acs ?? null,
        ref_catastral: String(v.ref_catastral || '').toUpperCase().replace(/\s+/g, ''),
        coord_x: v.coord_x ?? null, coord_y: v.coord_y ?? null,
        misma_direccion: mismaDireccion,
        direccion: v.direccion || '', municipio: v.municipio || '',
        provincia: v.provincia || '', codigo_postal: v.codigo_postal || '',
    };
    if (i.caldera_antigua_cal) instalacion.caldera_antigua_cal = i.caldera_antigua_cal;
    const exp = {
        numero_expediente: memoria?.numero || '',
        instalacion,
        cee: {},
        documentacion: {
            fecha_pruebas_cert_instalacion: f.pruebas || null,
            fecha_firma_cert_instalacion: f.firma || null,
            frio_situado_en: i.frio_situado_en || '',
            rite_locales: estancias.plantas.length ? estancias : null,
        },
    };
    const normalizedDatos = {
        is_reforma: !!v.es_reforma,
        inputs: {
            superficie: v.superficie ?? null,
            zona: v.zona || null,
            plantas: v.plantas ?? null,
            rc: instalacion.ref_catastral,
        },
    };
    const op = { ref_catastral: instalacion.ref_catastral, is_reforma: !!v.es_reforma, datos_calculo: normalizedDatos };

    // La empresa instaladora que FIRMA es la de la cuenta. Sin nº de empresa RITE
    // (REI) no está habilitada: validateMemoriaRite lo dice con su texto de siempre.
    const c = cuenta || null;
    const pres = c ? {
        id_empresa: c.id,
        razon_social: c.empresa || '',
        cif: c.empresa_nif || '',
        numero_carnet_rite: c.numero_empresa_rite || '',
        tiene_carnet_rite: isPresent(c.numero_empresa_rite),
        nombre_responsable: c.representante_nombre || c.nombre || '',
        apellidos_responsable: c.representante_apellidos || c.apellidos || '',
        nif_responsable: c.representante_nif || c.nif || '',
        cargo: c.representante_cargo || '',
        es_autonomo: !!c.es_autonomo,
        municipio: c.municipio || '',
        tecnico_firmante_distinto: !!c.tecnico_firmante_distinto,
        tecnico_firmante_nombre: c.tecnico_firmante_nombre || '',
        tecnico_firmante_apellidos: c.tecnico_firmante_apellidos || '',
        tecnico_firmante_dni: c.tecnico_firmante_dni || '',
        tecnico_firmante_carnet_rite: c.tecnico_firmante_carnet_rite || '',
    } : null;

    return { exp, cli, op, pres, presReal: pres, normalizedDatos, estancias };
}

/**
 * ¿Se puede generar? `faltan` BLOQUEA (lo mismo que el CRM más lo propio de la
 * app); `avisos` se enseñan y no bloquean.
 */
function comprobar({ memoria, cuenta }) {
    const ctx = aContexto({ memoria, cuenta });
    const faltan = validateMemoriaRite(ctx);
    const avisos = [];
    const v = memoria?.datos?.vivienda || {};

    if (isPresent(v.provincia) && !esDeClm(v.provincia)) {
        faltan.push(`La vivienda está en ${v.provincia}: de momento la memoria es la oficial de Castilla-La Mancha (JCCM)`);
    }
    const n = ctx.estancias.plantas.reduce((s, p) => s + p.locales.length, 0);
    if (!n) faltan.push('Estancias de la vivienda (al menos una)');
    if (n > MAX_ESTANCIAS) faltan.push(`La tabla de la memoria admite ${MAX_ESTANCIAS} estancias y hay ${n}`);
    if (!isPresent(ctx.exp.instalacion.aerotermia_cal?.potencia) && !ctx.exp.instalacion.aerotermia_cal?.aerotermia_db_id) {
        faltan.push('Potencia de calefacción del equipo (kW)');
    }

    const tabla = tablaEstancias(ctx.estancias, { zona: v.zona, emisor: ctx.exp.instalacion.tipo_emisor });
    if (ctx.estancias.modo === 'extendido' && esRadiadores(ctx.exp.instalacion.tipo_emisor)) {
        const sinElementos = tabla.filas.filter(r => !r.elementos_reales).length;
        if (sinElementos) avisos.push(`${sinElementos} estancia(s) sin elementos de radiador: se calculan por superficie`);
        const kwBomba = potenciaCalKw(ctx.exp.instalacion.aerotermia_cal);
        const kwRad = tabla.total.potencia_w / 1000;
        if (kwBomba > 0 && kwRad > kwBomba * 1.25) {
            avisos.push(`Los radiadores suman ${kwRad.toFixed(1)} kW y la bomba de calor da ${kwBomba.toFixed(1)} kW: revisa que el equipo cubra la instalación`);
        }
    }
    if (ctx.estancias.modo === 'rapido') avisos.push('Estancias estimadas por superficie: revísalas antes de firmar');
    return { faltan, avisos, tabla };
}

/** El payload del generador, el MISMO que para una obra CAE. */
function payloadGenerador({ memoria, cuenta }) {
    const ctx = aContexto({ memoria, cuenta });
    return buildRitePayloads(ctx);
}

module.exports = {
    PROVINCIAS_CLM, esDeClm, FACTOR_ZONA, factorZona, W_POR_ELEMENTO, MAX_ESTANCIAS, EMISORES,
    limpiarEstancias, tablaEstancias, aContexto, comprobar, payloadGenerador,
};
