'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// El CEE «A CIEGAS» de la oportunidad, del lado del SERVIDOR: qué se conserva al
// guardar la calculadora y qué no ve un partner. La cifra la calcula el PC
// (services/cee/ceeCiego.js); quién entra, la huella y la señal están en
// frontend/src/features/calculator/logic/estimacionCiega.js (fuente única).
// Diseño: docs/conocimiento/calculo/cee-a-ciegas-diseno-para-la-oportunidad.md
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
require('./esmSinExtension');

const RUTA_ESM = path.join(__dirname, '../../frontend/src/features/calculator/logic/estimacionCiega.js');
const cargar = () => import(pathToFileURL(RUTA_ESM).href);

/**
 * REGLA — el guardado de la calculadora (`POST /api/oportunidades`) no escribe ni
 * `estimacion_ciega` ni `inputs.superficie_confirmada`: los dos salen de la BD.
 * La copia del navegador no los trae al día (la cifra la escribe el PC en otro
 * momento) y un partner no puede confirmarse su propia superficie. La
 * confirmación se CAE si los inputs que llegan ya no tienen esos m² o esas
 * construcciones.
 */
async function conservarCiega(datosCalculo, existente) {
    if (!datosCalculo || typeof datosCalculo !== 'object') return datosCalculo;
    const dcBd = existente?.datos_calculo || {};
    if (dcBd.estimacion_ciega !== undefined) datosCalculo.estimacion_ciega = dcBd.estimacion_ciega;
    else delete datosCalculo.estimacion_ciega;

    const inputs = datosCalculo.inputs;
    if (!inputs || typeof inputs !== 'object') return datosCalculo;
    delete inputs.superficie_confirmada;
    const confirmada = dcBd.inputs?.superficie_confirmada;
    if (confirmada) {
        const { superficieConfirmadaVigente } = await cargar();
        if (superficieConfirmadaVigente({ ...inputs, superficie_confirmada: confirmada })) {
            inputs.superficie_confirmada = confirmada;
        }
    }
    return datosCalculo;
}

/** A quien no es del equipo interno no se le devuelve la cifra a ciegas. */
function sinCiegaParaPartner(op, esStaff) {
    if (esStaff || !op?.datos_calculo?.estimacion_ciega) return op;
    const { estimacion_ciega, ...dc } = op.datos_calculo;
    return { ...op, datos_calculo: dc };
}

module.exports = { conservarCiega, sinCiegaParaPartner, cargarLogicaCiega: cargar };
