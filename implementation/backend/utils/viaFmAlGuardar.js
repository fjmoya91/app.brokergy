'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// La vía del FACTOR MULTIPLICADOR al guardar la calculadora (`POST /api/oportunidades`).
//
// El precio CAE propio de la vía FM (`caePriceClientFm`, y su sello
// `cae_client_rate_fm`) y el resumen de las dos vías (`via_fm`) son de ADMIN:
// `financialScrub` se los quita a todos los demás al leer (regla 155). Por eso,
// cuando guarda alguien que no es ADMIN (partner, TRABAJADOR, una llamada interna):
//
// REGLA — el precio FM se RESTAURA tal como estaba en la BD, como el margen: no lo
// ve, así que no puede cambiarlo ni borrarlo.
//
// REGLA — `via_fm` se REHACE en el servidor con lo que se va a guardar: su navegador
// lo calculó sin ese precio y el € de la vía FM saldría al precio general. Se usa la
// misma función que el relleno (`viaFmDesdeDatosCalculo`, logic/viaFm.js).
//
// La lógica del frontend que carga importa siempre con extensión (no necesita el
// gancho `esmSinExtension`, que no existe en el Node 20 del contenedor).
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');

const RUTA_ESM = path.join(__dirname, '../../frontend/src/features/calculator/logic/viaFm.js');
const cargar = () => import(pathToFileURL(RUTA_ESM).href);

const PRECIO_FM_KEYS = ['caePriceClientFm', 'cae_client_rate_fm'];

function restaurar(destino, origen) {
    if (!destino || typeof destino !== 'object') return;
    const o = origen && typeof origen === 'object' ? origen : {};
    for (const k of PRECIO_FM_KEYS) {
        if (o[k] !== undefined) destino[k] = o[k];
        else delete destino[k];
    }
}

/**
 * Deja `datosCalculo` listo para guardar (lo muta). Con ADMIN no toca nada: su
 * navegador ya trae el precio FM y `via_fm` calculado con él.
 */
async function viaFmAlGuardar(datosCalculo, existente, esAdmin) {
    if (esAdmin || !datosCalculo || typeof datosCalculo !== 'object') return datosCalculo;
    const dcBd = existente?.datos_calculo || {};
    restaurar(datosCalculo, dcBd);
    restaurar(datosCalculo.inputs, dcBd.inputs);
    try {
        const { viaFmDesdeDatosCalculo } = await cargar();
        const via = viaFmDesdeDatosCalculo(datosCalculo);
        if (via) datosCalculo.via_fm = via;
    } catch (e) {
        // Sin el resumen se guarda igual: la tabla enseña «—» y el relleno lo repone.
        console.warn('[via_fm] no se pudo rehacer al guardar:', e.message);
    }
    return datosCalculo;
}

/**
 * La marca de la VÍA elegida (`inputs.ruta_fm`, regla 200) no la escribe el
 * guardado de la calculadora, la escriba quien la escriba: se queda la de la BD.
 *
 * REGLA — `ruta_fm` tiene DOS escritores y ninguno es este guardado: el conmutador
 * de la calculadora (`POST /:id/ruta-fm`, solo el equipo interno, que comprueba que
 * sea elegible) y el cambio de vía del expediente (`cambiarViaFm`, que renumera).
 * Un navegador con la oportunidad abierta desde antes la habría devuelto vieja, y
 * un partner la podría poner a mano en el cuerpo del POST.
 */
function conservarRutaFm(inputs, existente) {
    if (!inputs || typeof inputs !== 'object') return inputs;
    const bd = existente?.datos_calculo?.inputs?.ruta_fm;
    if (typeof bd === 'boolean') inputs.ruta_fm = bd;
    else delete inputs.ruta_fm;
    return inputs;
}

/** Resumen de las dos vías de un `datos_calculo` guardado (o null). Para el conmutador. */
async function viaFmDe(datosCalculo) {
    const { viaFmDesdeDatosCalculo } = await cargar();
    return viaFmDesdeDatosCalculo(datosCalculo || {});
}

module.exports = { viaFmAlGuardar, conservarRutaFm, viaFmDe, PRECIO_FM_KEYS };
