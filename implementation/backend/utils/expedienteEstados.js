// ─── Estados del expediente: orden canónico del ciclo de vida ─────────────────
//
// El `estado` del expediente es una columna PERSISTIDA que escriben ~6 sitios
// distintos (creación, notify-certificador, cert-ack, notify-review,
// approve-cee, registro del CEE, PUT manual). Antes cada uno decidía por su
// cuenta si podía pisar el estado con un `if (estado === 'X')` literal, y eso
// producía dos fallos:
//
//   1. RETROCESOS: un recordatorio al certificador devolvía un expediente ya
//      revisado a "EN CERTIFICADOR".
//   2. ATASCOS: al registrarse el CEE inicial solo se avanzaba a PTE. FIN OBRA
//      si el estado era EXACTAMENTE 'PTE. CEE INICIAL'. En el flujo real, para
//      cuando el CEE se registra el estado ya es 'REVISADO Y LISTO (INICIAL)',
//      así que la transición NUNCA se disparaba y el expediente se quedaba
//      colgado en la fase del CEE aunque la obra ya estuviera en marcha.
//
// La regla es única: el estado SOLO avanza. Usa `avanzarEstado()`.
//
// ⚠️ Esta lista debe mantenerse en sintonía con `EXPEDIENTE_ESTADOS`
// (frontend/src/features/expedientes/views/ExpedienteDetailView.jsx), que es la
// que pinta el desplegable, y con `FASES` (features/dashboard/logic/dashboardAgg.js).
// Si el backend escribe un estado que el frontend no lista, el <select> cae
// silenciosamente a su primera opción y el expediente APARENTA estar en
// 'PTE. CEE INICIAL'.

const ORDEN_ESTADOS = [
    // Entrada por migración: es lo más "atrás" que puede estar un expediente,
    // por eso va antes que PTE. CEE INICIAL y no bloquea ningún avance.
    'PENDIENTE REVISAR EXPTE',

    // Fase CEE inicial
    'PTE. CEE INICIAL',
    'EN CERTIFICADOR CEE INICIAL',
    'EN TRABAJO (CEE INICIAL)',
    'PENDIENTE REVISIÓN (INICIAL)',
    'REVISADO Y LISTO (INICIAL)',

    // Obra
    'PTE. FIN OBRA',

    // Fase CEE final
    'PTE. CEE FINAL',
    'EN CERTIFICADOR CEE FINAL',
    'EN TRABAJO (CEE FINAL)',
    'PENDIENTE REVISIÓN (FINAL)',
    'REVISADO Y LISTO (FINAL)',

    // Documentación y firmas.
    // Los tres primeros están DEPRECADOS: describían como fases sucesivas algo que
    // en realidad ocurre EN PARALELO (anexos al cliente, CIFO al instalador, CEE
    // final al certificador), así que nunca se podía elegir cuál poner. Los datos
    // lo confirman: 'PTE FIRMA ANEXOS' no se usó jamás y los otros dos una vez cada
    // uno. Toda esa zona es ahora 'PTE FIN EXPTE' y el desglose lo dan las PISTAS
    // del barrido (GET /api/expedientes/:id/checklist). Se mantienen aquí SOLO para
    // que `rankEstado` siga reconociendo datos antiguos y no permita retrocesos.
    'PTE FIRMA ANEXOS',
    'PTE. CIFO BROKERGY',
    'PTE FIRMA CIFO',
    'PTE FIN EXPTE',
    'DOC. COMPLETA',
    'DOC. COMPLETA APPSHEET',

    // Verificación y cobro
    'ENVIADO A VERIFICADOR',
    'REQUERIMIENTO VERIFICADOR',
    'PTE. SUBIDA MITECO',
    'REQUERIMIENTO G.A.',
    'CAE EMITIDO – PTE PAGO BROKERGY',   // ojo: guion largo U+2013
    'PTE. PAGO BROKERGY A CLIENTE',
    'FINALIZADO'
];

// Posición en el ciclo de vida. -1 = estado desconocido (o null).
function rankEstado(estado) {
    if (!estado) return -1;
    return ORDEN_ESTADOS.indexOf(estado);
}

/**
 * Devuelve el estado que debe quedar persistido, sin retroceder nunca.
 * - destino desconocido → se ignora (no tocamos nada).
 * - actual desconocido/nulo → se sella el destino.
 * - en el resto, gana el más avanzado.
 */
function avanzarEstado(actual, destino) {
    const rDestino = rankEstado(destino);
    if (rDestino === -1) return actual;
    const rActual = rankEstado(actual);
    if (rActual === -1) return destino;
    return rDestino > rActual ? destino : actual;
}

module.exports = { ORDEN_ESTADOS, rankEstado, avanzarEstado };
