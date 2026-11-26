// El EQUIPO DE AGENTES: de quién es cada obra en cada momento (regla 246).
//
// Cuatro papeles y un dueño por fase. El reparto lo decide ESTE fichero, con los
// hechos de la BD (el estado de la oportunidad, el bloque del radar del parte), nunca
// el modelo: si lo decidiera cada agente, dos sesiones contarían dos historias de la
// misma obra. Los papeles, sus tareas y lo que no pueden hacer están en
// `.claude/agents/*.md`; el porqué, en
// docs/conocimiento/claude-automatizacion/el-equipo-de-agentes-roles-y-relevos.md.
//
// Es un módulo PURO (sin BD): lo usan scripts/equipo.js y su prueba.

const ROLES = {
    COMERCIAL: {
        agente: 'comercial',
        titulo: 'COMERCIAL',
        tramo: 'de la petición a la aceptación',
    },
    TECNICO: {
        agente: 'tecnico',
        titulo: 'TÉCNICO',
        tramo: 'de la aceptación a tenerlo todo firmado',
    },
    RESPONSABLE: {
        agente: 'responsable-tecnico',
        titulo: 'RESPONSABLE TÉCNICO',
        tramo: 'revisa lo del técnico antes de verificar',
    },
    DIRECCION: {
        agente: 'director',
        titulo: 'DIRECCIÓN',
        tramo: 'reparte, vigila y le lleva a Fran lo que es suyo',
    },
};

// Estados de CAPTACIÓN (los de `ESTADOS_CAPTACION` de routes/oportunidades.js): todo lo
// anterior a la aceptación es del comercial. `que` es lo que toca hacer en ese estado.
const CAPTACION = {
    'LEAD':         { que: 'Lead sin trabajar: simular y preparar la propuesta' },
    'PTE ENVIAR':   { que: 'Propuesta preparada y sin enviar' },
    'EN CURSO':     { que: 'Propuesta en elaboración' },
    'ENVIADA':      { que: 'Propuesta enviada y sin respuesta' },
    'PRE-ACEPTADO': { que: 'Aceptada de palabra: falta la aceptación formal' },
};

// Cada bloque del radar (`BLOQUES` de services/seguimientoRadar.js) tiene UN dueño.
// La prueba (test_equipo_roles.js) falla si aparece un bloque nuevo sin dueño: un
// bloque que no es de nadie es justo el atasco que el radar existe para evitar.
const ROL_DE_BLOQUE = {
    RECHAZO_SIN_REENVIAR: 'TECNICO',     // corregir y reenviar el documento rechazado
    REVISION:             'RESPONSABLE', // el CEE entregado: se revisa antes del visto bueno
    OBRA_SIN_CERRAR:      'TECNICO',     // justificar y encargar el CEE final
    TRAMITACION:          'TECNICO',     // documentos que hay que generar o enviar
    SIN_LOTEAR:           'DIRECCION',   // dinero parado: armar el lote es de Fran
    REGISTRO:             'TECNICO',     // presentar el CEE (el pago, con el «sí» de Fran)
    AGENTE_IA:            'TECNICO',     // el CEE encargado a la IA, sin hacer
    CERT_SIN_ENTREGAR:    'TECNICO',     // reclamar al certificador
    CEE_SIN_MATERIAL:     'TECNICO',     // pedir el vídeo, la fachada, la placa
    SIN_ENCARGAR:         'TECNICO',     // aceptado y sin encargar el CEE inicial
    MIGRADO_SIN_REVISAR:  'RESPONSABLE', // auditar lo que llegó del sistema antiguo
    FIRMA_PENDIENTE:      'TECNICO',     // reclamar la firma que no vuelve
    COBRO:                'DIRECCION',   // la cuenta del cliente para pagarle
    FIN_OBRA:             'TECNICO',     // seguir la obra hasta el fin
};

// Lo que toca hacer en cada pendiente, dicho como se lo diría uno a un compañero. Es
// lo que lee Fran en el resumen («ponte con este»): un nº de expediente y el nombre de
// un bloque no le dicen a nadie qué hay que hacer. Incluye los dos pendientes que no
// son del radar (REQUERIMIENTO y LISTO_PARA_AUDITAR) y los estados de captación.
const SIGUIENTE = {
    RECHAZO_SIN_REENVIAR: 'corregir el documento rechazado y volver a mandarlo a firma',
    REVISION:             'revisar el CEE entregado y, si sale limpio, darle el visto bueno',
    OBRA_SIN_CERRAR:      'justificar el expediente y preparar el CEE final',
    TRAMITACION:          'generar los documentos que faltan y mandarlos a firma',
    SIN_LOTEAR:           'meterlo en un lote para verificar (decisión de Fran)',
    REGISTRO:             'presentar el CEE en el Registro (firma y tasa: Fran)',
    AGENTE_IA:            'hacer el CEE que tiene encargado el Agente IA',
    CERT_SIN_ENTREGAR:    'reclamar el CEE al certificador',
    CEE_SIN_MATERIAL:     'pedir el material del CEE inicial (vídeo o fachadas, y la placa de la caldera)',
    SIN_ENCARGAR:         'revisar el material y hacer o encargar el CEE inicial',
    MIGRADO_SIN_REVISAR:  'auditar el expediente migrado',
    FIRMA_PENDIENTE:      'reclamar la firma a quien la tiene',
    COBRO:                'pedir al cliente que confirme su cuenta para pagarle',
    FIN_OBRA:             'preguntar al instalador cómo va la obra',
    REQUERIMIENTO:        'subsanar el requerimiento y volver a pasar la auditoría',
    LISTO_PARA_AUDITAR:   'auditarlo y, con APTO, pasarlo a DOC. COMPLETA',
    'LEAD':               'simular y preparar la propuesta',
    'PTE ENVIAR':         'enviar la propuesta (con el «sí» de Fran)',
    'EN CURSO':           'terminar la propuesta',
    'ENVIADA':            'recordar la propuesta o cerrarla',
    'PRE-ACEPTADO':       'conseguir la aceptación formal (reenviar el enlace)',
};

// El orden en el que se atienden los pendientes de un expediente, por delante del
// orden del radar: primero lo que tiene a alguien de fuera bloqueado, después lo que
// ya se factura o es lo último que falta para cobrar. Es el mismo orden de clases de la
// ficha del director.
const CLASE = { REQUERIMIENTO: 1, RECHAZO_SIN_REENVIAR: 1, REVISION: 2, LISTO_PARA_AUDITAR: 3 };
const claseDe = (bloque) => CLASE[bloque] || 4;

// La ficha (RES060, RES080, RES093, TER100…) va en el propio número de la obra.
const fichaDe = (obra) => (/(RES|TER)\d{3}(FM|FC)?/.exec(String(obra || '').toUpperCase()) || [null])[0];

/** El papel dueño de un bloque del radar; null si el bloque no se conoce. */
function rolDeBloque(bloque) {
    return ROL_DE_BLOQUE[bloque] || null;
}

/** El papel dueño de una oportunidad SIN expediente, por su estado de captación. */
function rolDeOportunidad(estado) {
    return CAPTACION[String(estado || '').toUpperCase()] ? 'COMERCIAL' : null;
}

// Estados del expediente que ya no son del técnico: completo, en un lote o cerrado.
const ESTADOS_TRAS_EL_TECNICO = ['DOC. COMPLETA', 'DOC. COMPLETA APPSHEET'];

/**
 * ¿Está el expediente LISTO PARA AUDITAR? Son hechos, no una etiqueta: los tres
 * documentos del cliente y del instalador firmados y el CEE final registrado, sin
 * estar ya completo ni en un lote. El radar no tiene bloque para esto (cuando ya no
 * falta nada, deja de salir), y era el hueco por el que un expediente terminado se
 * quedaba sin pasar a DOC. COMPLETA.
 * @param {{estado, lote_id, anexo_i_signed, anexo_cesion_signed, cert_cifo_signed, reg_fin}} e
 */
function listoParaAuditar(e) {
    if (!e || e.lote_id) return false;
    const estado = String(e.estado || '').toUpperCase();
    if (ESTADOS_TRAS_EL_TECNICO.includes(estado)) return false;
    if (estado.startsWith('REQUERIMIENTO')) return false;
    return !!(e.anexo_i_signed && e.anexo_cesion_signed && e.cert_cifo_signed && e.reg_fin);
}

/** Un expediente en REQUERIMIENTO vuelve al técnico hasta que se subsana. */
function enRequerimiento(e) {
    return String(e?.estado || '').toUpperCase().startsWith('REQUERIMIENTO');
}

module.exports = {
    ROLES, CAPTACION, ROL_DE_BLOQUE, ESTADOS_TRAS_EL_TECNICO, SIGUIENTE,
    claseDe, fichaDe, rolDeBloque, rolDeOportunidad, listoParaAuditar, enRequerimiento,
};
