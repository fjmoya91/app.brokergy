// ─── ceeDirectoEstados.js ────────────────────────────────────────────────────
// Estados de un CEE contratado suelto (fuera del negocio CAE).
//
// Son LOS MISMOS SUBESTADOS de seguimiento que ya usa el módulo CEE del
// expediente (`PTE_ENVIO_CERT … REGISTRADO`), a propósito: el técnico trabaja
// igual le encarguemos un CEE de un CAE o uno suelto, y el componente que lo
// pinta es el mismo. Lo que aquí NO existe es todo lo que viene DESPUÉS del
// certificado en el CAE — obra, CIFO, anexos, lote, verificador, cobro del bono.
//
// A diferencia del expediente CAE, aquí `estado` NO se escribe a mano desde seis
// sitios: se DERIVA de `seguimiento` con `deriveEstado()`. Por eso no hace falta
// un `avanzarEstado()` que impida retrocesos — el retroceso solo puede venir de
// que alguien mueva un subestado hacia atrás, que es una corrección legítima.
// `estado` se persiste igualmente para poder filtrar y ordenar el listado sin
// recalcular fila a fila.

// Subestados de cada fase. Copiados de la fase CEE del expediente CAE.
const SUBESTADOS = [
    'PTE_ENVIO_CERT',    // pendiente de mandarle el encargo al certificador
    'ASIGNADO',          // encargo enviado, certificador asignado
    'EN_TRABAJO',        // visita, medición
    'PTE_PRESENTACION',  // pendiente de que suba el .cex
    'PRESENTADO',        // .cex subido, pendiente de revisión
    'PTE_REVISION',      // en revisión interna
    'REVISADO',          // revisado; falta que el certificador lo registre
    'REGISTRADO'         // registrado oficialmente
];

// Orden canónico del `estado` persistido. Mismos rótulos que en el CAE para que
// quien salta de una pestaña a otra no tenga que traducir nada mentalmente.
const ORDEN_ESTADOS = [
    'PTE. CEE INICIAL',
    'EN CERTIFICADOR CEE INICIAL',
    'EN TRABAJO (CEE INICIAL)',
    'PENDIENTE REVISIÓN (INICIAL)',
    'REVISADO Y LISTO (INICIAL)',
    'PTE. CEE FINAL',
    'EN CERTIFICADOR CEE FINAL',
    'EN TRABAJO (CEE FINAL)',
    'PENDIENTE REVISIÓN (FINAL)',
    'REVISADO Y LISTO (FINAL)',
    'FINALIZADO'
];

// Subestado → rótulo, con {F} = 'INICIAL' | 'FINAL'.
const MAPA = {
    PTE_ENVIO_CERT:   'PTE. CEE {F}',
    ASIGNADO:         'EN CERTIFICADOR CEE {F}',
    EN_TRABAJO:       'EN TRABAJO (CEE {F})',
    // Que el certificador aún no haya subido el .cex es, de cara al listado, lo
    // mismo que "está trabajando": la pelota sigue siendo suya.
    PTE_PRESENTACION: 'EN TRABAJO (CEE {F})',
    PRESENTADO:       'PENDIENTE REVISIÓN ({F})',
    PTE_REVISION:     'PENDIENTE REVISIÓN ({F})',
    REVISADO:         'REVISADO Y LISTO ({F})'
    // REGISTRADO no está aquí: cierra la fase y lo resuelve deriveEstado().
};

function rankEstado(estado) {
    if (!estado) return -1;
    return ORDEN_ESTADOS.indexOf(estado);
}

function rankSubestado(sub) {
    if (!sub) return -1;
    return SUBESTADOS.indexOf(String(sub).toUpperCase());
}

/**
 * ¿El encargo lleva los dos certificados?
 * Un 'UNICO' solo usa la fase inicial; la palabra "inicial" es interna — en
 * pantalla ese CEE no se llama inicial, porque en una compraventa no hay después.
 */
function esDoble(ceeDirecto) {
    return String(ceeDirecto?.alcance || 'UNICO').toUpperCase() === 'DOBLE';
}

/**
 * Estado del expediente a partir de sus subestados de seguimiento.
 *
 * @param {object} ceeDirecto  fila de cee_directos (usa `alcance` y `seguimiento`)
 * @returns {string} uno de ORDEN_ESTADOS
 */
function deriveEstado(ceeDirecto) {
    const seg = ceeDirecto?.seguimiento || {};
    const doble = esDoble(ceeDirecto);
    const ini = String(seg.cee_inicial || 'PTE_ENVIO_CERT').toUpperCase();
    const fin = String(seg.cee_final || '').toUpperCase();

    // Fase inicial aún abierta.
    if (ini !== 'REGISTRADO') {
        return (MAPA[ini] || 'PTE. CEE INICIAL').replace('{F}', 'INICIAL');
    }

    // Inicial registrado. En un encargo de un solo certificado, ahí se acabó.
    if (!doble) return 'FINALIZADO';

    if (!fin || fin === 'PTE_ENVIO_CERT') return 'PTE. CEE FINAL';
    if (fin === 'REGISTRADO') return 'FINALIZADO';
    return (MAPA[fin] || 'PTE. CEE FINAL').replace('{F}', 'FINAL');
}

/**
 * Fase sobre la que hoy hay trabajo: 'inicial' | 'final' | null (terminado).
 * Es lo que decide a qué fase apunta un recordatorio o un encargo.
 */
function faseActiva(ceeDirecto) {
    const seg = ceeDirecto?.seguimiento || {};
    const ini = String(seg.cee_inicial || 'PTE_ENVIO_CERT').toUpperCase();
    if (ini !== 'REGISTRADO') return 'inicial';
    if (!esDoble(ceeDirecto)) return null;
    return String(seg.cee_final || '').toUpperCase() === 'REGISTRADO' ? null : 'final';
}

/**
 * De quién es la pelota ahora mismo. El parte diario agrupa por esto.
 * @returns {'BROKERGY'|'CERTIFICADOR'|null}
 */
function responsable(ceeDirecto) {
    const fase = faseActiva(ceeDirecto);
    if (!fase) return null;
    const seg = ceeDirecto?.seguimiento || {};
    const sub = String((fase === 'final' ? seg.cee_final : seg.cee_inicial) || 'PTE_ENVIO_CERT').toUpperCase();
    // Lo que espera al certificador: que trabaje, que entregue o que registre.
    if (['ASIGNADO', 'EN_TRABAJO', 'PTE_PRESENTACION', 'REVISADO'].includes(sub)) return 'CERTIFICADOR';
    // PTE_ENVIO_CERT (encargarlo), PRESENTADO y PTE_REVISION (revisarlo) son nuestros.
    return 'BROKERGY';
}

/** Rótulo de la fase de cara al usuario. En un encargo único no se dice "inicial". */
function nombreFase(ceeDirecto, fase) {
    if (!esDoble(ceeDirecto)) return 'CEE';
    return fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL';
}

module.exports = {
    SUBESTADOS,
    ORDEN_ESTADOS,
    rankEstado,
    rankSubestado,
    esDoble,
    deriveEstado,
    faseActiva,
    responsable,
    nombreFase
};
