// ============================================================================
// fotovoltaica.js — FUENTE ÚNICA del autoconsumo fotovoltaico de la vivienda.
// ----------------------------------------------------------------------------
// "¿Tienes placas solares?" se pregunta UNA vez, en la captación (/reforma), y
// el dato acompaña al inmueble hasta el final:
//
//   funnel (`placas_estado`) → oportunidad (`inputs.fotovoltaica`)
//                            → expediente (`instalacion.fotovoltaica`)
//                            → encargo del CEE al certificador (ce3xFinal.js)
//
// Sirve para tres cosas distintas, y por eso las TRES respuestas valen:
//   · SÍ            → hay generación en la vivienda y el CEE tiene que
//                     declararla (contribuciones energéticas de CE3X). Sin ese
//                     dato el certificado sale sin una instalación que existe.
//   · NO, INTERESA  → cualifica al cliente para la venta cruzada del momento en
//                     que se le paga el bono (el formulario de optimización).
//   · NO            → es una respuesta, no un hueco: se sabe que se preguntó.
//
// Por eso `estado: null` ("sin declarar") NO es lo mismo que `'no'`: uno es que
// nadie lo ha preguntado todavía y el otro es que el cliente ha dicho que no.
//
// Módulo JS PURO (sin React, sin axios): lo consumen el funnel de captación, la
// calculadora, el módulo de Instalación del expediente, y el backend por
// import() dinámico (expedienteService) — ver [[project_backend_importa_frontend_esm]].
// ============================================================================

/** Estados posibles. El valor viaja en minúsculas (ver `normalizarEstado`). */
export const FV = {
    SI: 'si',
    FUTURO: 'futuro',   // no tiene, pero le interesa ponerlas → venta cruzada
    NO: 'no',
};

/**
 * Las tres opciones, con las DOS redacciones.
 *  · `label` / `sub` — lenguaje de casa: lo que lee el cliente en el funnel.
 *  · `corto`         — lo que lee el staff en el expediente y en la calculadora.
 * Mismo criterio que `LABEL_CLIENTE` en reformaUploadService: la etiqueta técnica
 * y la del cliente no son la misma y ninguna de las dos se deduce de la otra.
 */
export const FV_OPCIONES = [
    {
        value: FV.SI,
        icon: '☀️',
        label: 'Sí, ya tengo placas fotovoltaicas',
        sub: 'Autoconsumo eléctrico ya instalado en la vivienda',
        corto: 'Sí, tiene placas',
    },
    {
        value: FV.FUTURO,
        icon: '🌤️',
        label: 'No, pero me interesa ponerlas más adelante',
        sub: 'Todavía no las tengo y me gustaría instalarlas',
        corto: 'No — interesado a futuro',
    },
    {
        value: FV.NO,
        icon: '🚫',
        label: 'No, y de momento no me interesa',
        sub: 'Sin placas fotovoltaicas y sin planes de instalarlas',
        corto: 'No, y no le interesa',
    },
];

/** Objeto vacío — "nadie lo ha preguntado todavía". */
export const FOTOVOLTAICA_VACIA = Object.freeze({
    estado: null,
    potencia_kwp: null,
    potencia_desconocida: false,
});

/**
 * REGLA — el estado se lee SIEMPRE en minúsculas.
 * `normalizeData` del backend sube los strings a MAYÚSCULAS antes de persistir.
 * La clave `fotovoltaica` está en su BLACKLIST para que no ocurra, pero un
 * expediente tocado antes de esa lista puede traer 'FUTURO' guardado: leerlo con
 * `=== 'futuro'` lo daría por no declarado. Mismo gotcha que `cee_source`.
 */
export function normalizarEstado(v) {
    const s = String(v ?? '').trim().toLowerCase();
    return [FV.SI, FV.FUTURO, FV.NO].includes(s) ? s : null;
}

/** Normaliza cualquier procedencia (funnel, inputs, expediente) a la forma canónica. */
export function normalizarFotovoltaica(raw) {
    if (!raw || typeof raw !== 'object') return { ...FOTOVOLTAICA_VACIA };
    const estado = normalizarEstado(raw.estado);
    if (estado !== FV.SI) {
        // La potencia solo significa algo con placas puestas. Guardarla en los
        // otros dos casos dejaría una cifra huérfana que el CEE podría declarar.
        return { estado, potencia_kwp: null, potencia_desconocida: false };
    }
    const kwp = Number(raw.potencia_kwp);
    const tieneKwp = Number.isFinite(kwp) && kwp > 0;
    return {
        estado,
        potencia_kwp: tieneKwp ? kwp : null,
        // Sin cifra, la respuesta es "no la sé": es información, no un hueco.
        potencia_desconocida: !tieneKwp,
    };
}

/** Del funnel de captación (`placas_*`) a la forma canónica. */
export function fotovoltaicaDesdeFunnel(funnel) {
    if (!funnel) return { ...FOTOVOLTAICA_VACIA };
    return normalizarFotovoltaica({
        estado: funnel.placas_estado,
        potencia_kwp: funnel.placas_kwp,
    });
}

/** ¿La vivienda TIENE generación fotovoltaica? (lo que le importa al CEE) */
export function tieneFotovoltaica(fv) {
    return normalizarEstado(fv?.estado) === FV.SI;
}

/** ¿Es candidato a la venta cruzada de placas? */
export function interesadoEnFotovoltaica(fv) {
    return normalizarEstado(fv?.estado) === FV.FUTURO;
}

/** Potencia formateada en castellano ("3,5 kWp") o null si no consta. */
export function potenciaTexto(fv) {
    const kwp = Number(fv?.potencia_kwp);
    if (!Number.isFinite(kwp) || kwp <= 0) return null;
    return `${kwp.toLocaleString('es-ES', { maximumFractionDigits: 2 })} kWp`;
}

/**
 * Una línea para pantalla: dice el estado y, con placas, la potencia — o que no
 * se sabe, que es un dato distinto de no tener ninguna.
 */
export function etiquetaFotovoltaica(fv) {
    const estado = normalizarEstado(fv?.estado);
    if (!estado) return 'Sin declarar';
    const opt = FV_OPCIONES.find(o => o.value === estado);
    if (estado !== FV.SI) return opt.corto;
    const p = potenciaTexto(fv);
    return p ? `Sí · ${p}` : 'Sí · potencia sin determinar';
}
