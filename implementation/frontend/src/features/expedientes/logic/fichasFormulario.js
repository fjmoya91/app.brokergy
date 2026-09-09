// ============================================================
// fichasFormulario.js — las FICHAS (RES060 · RES080 · RES093 · TER100 · TER173)
// sobre el IMPRESO OFICIAL en formato formulario.
//
// POR QUÉ EXISTE
// --------------
// Hasta ahora la ficha se REDIBUJABA en HTML: ~250 líneas por ficha imitando el
// modelo del Ministerio hasta los saltos de página, las notas al pie y el ancho de
// la caja de texto, y con un medidor propio para comprobar que nada desbordaba.
// El Ministerio publica ahora el impreso como PDF de FORMULARIO, así que se rellena
// el suyo: el documento pasa a ser literalmente el oficial y lo único nuestro son
// las cifras.
//
// REGLA — este fichero NO calcula nada. Los valores salen de los `derive*` de las
// plantillas HTML, que son los mismos que alimentan el CIFO y el panel económico.
// Aquí solo se dice QUÉ CASILLA del impreso ocupa cada uno. Si esto recalculara por
// su cuenta, el mismo expediente tendría dos documentos con números distintos según
// por dónde se generase.
//
// REGLA — los nombres de campo son los de la PLANTILLA, tal cual, erratas incluidas
// ("ri i" es η_i, "E F" es EF_i, "Representante delsolicitante" va sin espacio en
// RES080 y TER100). Se leen con `pdf.getForm().getFields()`; corregirlos aquí solo
// dejaría el impreso con un hueco.
// ============================================================
import { deriveFichaRes060 } from './fichaRes060Html.js';
import { deriveFichaRes080 } from './fichaRes080Html.js';
import { deriveFichaRes093 } from './fichaRes093Html.js';
import { deriveFichaTer100 } from './fichaTer100Html.js';
// La TER173 no tiene maqueta HTML (nació con los impresos ya publicados como
// formulario), así que su derivación vive en su propio módulo.
import { deriveFichaTer173 } from './fichaTer173.js';

/** Las plantillas, con el nombre que espera el backend. */
export const PLANTILLA_DE_FICHA = {
    RES060: 'RES060',
    RES080: 'RES080',
    RES093: 'RES093',
    TER100: 'TER100',
    TER173: 'TER173',
};

function camposRes060(expediente, results, opts) {
    const d = deriveFichaRes060(expediente, results, opts);
    return {
        'Fp': d.fp,
        'DCAL': d.dcal,
        'S': d.s,
        'DACS': d.dacs,
        'ri i': d.eta,                 // η_i — el nombre del campo en la plantilla
        'SCOP': d.scopCal,
        'SCOPdhw': d.scopAcs,
        'AEtotal': d.aeTotal,
        'Di': d.di,
        'Fecha inicio actuación': d.fechaInicio,
        'Fecha fin actuación': d.fechaFin,
        'Representante del solicitante': d.representante,
        'NIFNIE': d.representanteNif,
    };
}

function camposRes093(expediente, opts) {
    const d = deriveFichaRes093(expediente, opts);
    return {
        'Fp': d.fp,
        'DCAL': d.dcal,
        'S': d.s,
        'DACS': d.dacs,
        'ri i': d.eta,
        'SCOP': d.scopCal,
        'SCOPdhw': d.scopAcs,
        'Cb': d.cb,                    // el coeficiente de cobertura, solo en RES093
        'AEtotal': d.aeTotal,
        'Di': d.di,
        'Fecha inicio actuación': d.fechaInicio,
        'Fecha fin actuación': d.fechaFin,
        'Representante del solicitante': d.representante,
        'NIFNIE': d.representanteNif,
    };
}

function camposRes080(expediente, opts) {
    const d = deriveFichaRes080(expediente, opts);
    return {
        'FP': d.fp,
        'E F': d.efi,                  // EF_i (consumo antes) — sí, con el espacio
        'EFf': d.eff,
        'AEtotal': d.aeTotal,
        'Di': d.di,
        'Fecha inicio actuación': d.fechaInicio,
        'Fecha fin actuación': d.fechaFin,
        'Representante delsolicitante': d.representante,
        'NIFNIE': d.representanteNif,
    };
}

function camposTer100(expediente, opts = {}) {
    const d = deriveFichaTer100(expediente);
    // El representante lo inyecta el lote (sale del Sujeto Obligado); el HTML usa
    // el mismo respaldo por defecto.
    const rep = opts.representanteNombre || 'Pedro José López Montero';
    const repNif = opts.representanteNif || '06239730-Z';
    return {
        // Apartado de CALEFACCIÓN (página 2 del impreso)
        'ni c': d.eta,
        'SCOP c': d.scopCal,
        'Dc c': d.dcal,
        'S c': d.s,
        'Fp c': d.fp,
        'AEc': d.aeCal,                // el mismo campo sale también en el total
        // Apartado de ACS (página 3)
        'FP acs': d.fp,
        'ni acs': d.eta,
        'SCOPdhw acs': d.scopAcs,
        'DACS': d.dacs,
        'AEacs': d.aeAcs,
        // Apartado de PISCINA (página 4)
        'FP cap': d.fp,
        'n cap': d.eta,
        'SCOPpwh cap': d.scopPool,
        'DCAP': d.dcap,
        'AEcap': d.aeCap,
        // Resultado total (página 4). AEc/AEacs/AEcap son el MISMO campo del
        // formulario que en sus apartados: el impreso los repite a propósito, así
        // que el total no puede contradecir a sus sumandos.
        'AEtotal': d.aeTotal,
        'Di': String(d.vidaUtil),
        'Fecha inicio actuación': d.fechaInicio,
        'Fecha fin actuación': d.fechaFin,
        'Representante delsolicitante': rep,
        'NIFNIE': repNif,
    };
}

/**
 * TER173 (hibridación en paralelo, terciario). Su impreso repite tres veces las
 * mismas variables —una por servicio— y el formulario resuelve la colisión con
 * sufijos: 'ni' · 'ni-0' · 'ni-1' para η_i, y 'Fp' · 'Fp-0' · 'FP' para el factor
 * de ponderación. Son los nombres de LA PLANTILLA, leídos con
 * `pdf.getForm().getFields()`: "arreglarlos" solo dejaría el impreso con huecos.
 *
 * ⚠️ El impreso NO tiene casilla para el C_b, aunque su apartado 4 lo incluya en
 * la fórmula. Por eso el AE_TOTAL que se imprime no es la suma de los tres AE
 * impresos: la diferencia es exactamente la ponderación por bivalencia, y quien
 * desarrolla ese cálculo paso a paso es el CIFO (su apartado del C_b).
 */
function camposTer173(expediente, opts = {}) {
    const d = deriveFichaTer173(expediente);
    // El representante lo inyecta el lote (sale del Sujeto Obligado); el respaldo
    // es el mismo que en las demás fichas.
    const rep = opts.representanteNombre || 'Pedro José López Montero';
    const repNif = opts.representanteNif || '06239730-Z';
    return {
        // Apartado de CALEFACCIÓN (página 2 del impreso)
        'ni': d.eta,
        'SCOP': d.scopCal,
        'Dc': d.dcal,
        'S': d.s,
        'Fp': d.fp,
        'AEc': d.aeCal,                // el mismo campo sale también en el total
        // Apartado de ACS (página 3)
        'ni-0': d.eta,
        'SCOPdhw': d.scopAcs,
        'DACS': d.dacs,
        'Fp-0': d.fp,
        'AEacs': d.aeAcs,
        // Apartado de PISCINA (página 4)
        'FP': d.fp,
        'ni-1': d.eta,
        'SCOPpwh': d.scopPool,
        'DCAP': d.dcap,
        'AEcap': d.aeCap,
        // Resultado total (página 4). AEc/AEacs/AEcap son el MISMO campo del
        // formulario que en sus apartados: el impreso los repite a propósito.
        'AEtotal': d.aeTotal,
        'Di': String(d.vidaUtil),
        'Fecha inicio actuación': d.fechaInicio,
        'Fecha fin actuación': d.fechaFin,
        // Ojo: aquí SÍ lleva el espacio (en RES080 y TER100 la plantilla lo omite).
        'Representante del solicitante': rep,
        'NIFNIE': repNif,
    };
}

/**
 * El `formulario` que viaja al backend: `{ plantilla, campos }`. Lo consumen
 * `/api/pdf/generate`, `/api/pdf/save-to-drive`, `/api/pdf/send-annex` y el envío
 * del lote al Sujeto Obligado — todos con el mismo objeto.
 *
 * @param {string} ficha       'RES060' | 'RES080' | 'RES093' | 'TER100' | 'TER173'
 * @param {object} expediente
 * @param {object} opts        { results?, representanteNombre?, representanteNif? }
 *                             `results` solo lo necesita RES060 (el ahorro llega ya
 *                             calculado desde la vista); las otras tres lo derivan.
 */
export function fichaFormulario(ficha, expediente, opts = {}) {
    const { results = {}, ...rep } = opts;
    const f = String(ficha || 'RES060').toUpperCase();
    const campos = f === 'RES080' ? camposRes080(expediente, rep)
        : f === 'RES093' ? camposRes093(expediente, rep)
            : f === 'TER173' ? camposTer173(expediente, rep)
                : f === 'TER100' ? camposTer100(expediente, rep)
                    : camposRes060(expediente, results, rep);
    return { plantilla: PLANTILLA_DE_FICHA[f] || 'RES060', campos };
}
