/**
 * revisionPendienteNotifier — ADAPTADOR. Aquí ya no vive ninguna lógica.
 *
 * Este módulo era el vigilante de los CEE que el certificador entrega y se quedan
 * esperando la revisión de Brokergy. Ese caso sigue existiendo —y sigue siendo el
 * más caro, porque el certificador FACTURA AL ENTREGAR, no al revisar—, pero ahora
 * es uno de los bloques del parte diario de seguimiento:
 *
 *   · el criterio  → `seguimientoRadar`, bloque REVISION
 *   · el envío     → `seguimientoDiario`, que manda UN aviso al día con todos los
 *                    bloques en vez de un mensaje por vigilante
 *
 * El fichero se conserva porque dos rutas públicas lo consumen
 * (`GET /api/expedientes/alertas/revision-pendiente` y su `/enviar`). Delegan.
 */

const DIAS_UMBRAL = Number(process.env.REVISION_ALERTA_DIAS || 2);

/**
 * CEE entregados por el certificador y pendientes de revisión desde hace más de
 * `dias` días. Una entrada por FASE.
 *
 * Traduce la fila del radar al formato que esta ruta lleva devolviendo desde
 * siempre, para no romper a quien la consuma.
 */
async function pendientesDeRevision(dias = DIAS_UMBRAL) {
    const radar = require('./seguimientoRadar');
    const filas = await radar.escanear({ soloBloques: ['REVISION'] });
    return filas
        // El radar aplica REVISION_ALERTA_DIAS; si la ruta pide otro umbral
        // (query `?dias=`), se afina aquí sin volver a consultar la BD.
        .filter(f => f.sin_fecha || f.dias >= dias)
        .map(f => ({
            expediente_id: f.expediente_id,
            numero_expediente: f.numero_expediente,
            estado: f.estado,
            cliente_id: f.cliente_id,
            certificador_id: f.certificador_id,
            fase_key: f.scope === 'final' ? 'cee_final' : 'cee_inicial',
            fase_label: f.scope === 'final' ? 'CEE final' : 'CEE inicial',
            subestado: f.detalle.includes('presentado') ? 'PRESENTADO' : 'PTE_REVISION',
            desde: f.desde,
            dias: f.dias,
            sin_fecha: f.sin_fecha,
            direccion: f.direccion,
            municipio: f.municipio,
            cliente_nombre: f.cliente_nombre || null,
            certificador_nombre: f.certificador_nombre || 'Sin certificador asignado',
        }));
}

/**
 * El "enviar ahora" manual de la ruta de alertas. Manda el PARTE COMPLETO, no solo
 * el bloque de revisión: mandar dos avisos distintos al mismo chat el mismo día era
 * justo lo que se quería evitar.
 */
const comprobarYAvisar = (opts) => require('./seguimientoDiario').comprobarYAvisar(opts);

/** La vigilancia la arranca `seguimientoDiario` desde server.js. */
function start() {
    console.log('[RevisionPendiente] integrado en el parte diario (services/seguimientoDiario).');
}

module.exports = { start, comprobarYAvisar, pendientesDeRevision, DIAS_UMBRAL };
