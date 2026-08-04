// ─────────────────────────────────────────────────────────────────────────────
// Documentos del LOTE y avance automático de su estado.
//
// Todo el papeleo del lote vive en `lotes.documentos_so` (JSONB, una entrada por
// documento). Este módulo es la FUENTE ÚNICA de: qué slots existen, cuáles admiten
// varios ficheros, a qué fase del proceso pertenece cada uno y qué estado del lote
// desbloquea cada hito. El espejo en frontend es `features/lotes/logic/loteProceso.js`.
//
// El proceso real (2026-08-03):
//   1. Solicitud al verificador  → se genera, se sube firmada  → SOLICITADO PRESUPUESTO
//   2. Firma del Sujeto Obligado → Anexo I + fichas + solicitud → PTE. FIRMA S.O.
//                                  cuando el S.O. firma todo    → PTE. OFERTA VERIFICADOR
//   3. Oferta de verificación    → se sube y se manda al S.O.   → PTE. FIRMA OFERTA S.O.
//                                  cuando vuelve firmada        → ENVIADO A VERIFICADOR
//   4. Verificación              → informes de inexactitudes    → REQUERIMIENTO VERIFICADOR
//                                  informe + dictamen favorable → VERIFICADO
// ─────────────────────────────────────────────────────────────────────────────

// Slots de documento. `multiple` = admite varios ficheros (sufijo _1, _2…).
const LOTE_DOC_SLOTS = {
    solicitud_verificacion: { label: 'Solicitud de Verificación', fase: 1, multiple: false, firmable: true },
    anexo_i:                { label: 'Anexo I', fase: 2, multiple: false, firmable: true },
    ficha_res:              { label: 'Ficha RES', fase: 2, multiple: true, firmable: true, generado: true },
    oferta_verificacion:    { label: 'Oferta de verificación', fase: 3, multiple: false, firmable: true },
    informe_inexactitudes:  { label: 'Informe de inexactitudes', fase: 4, multiple: true, firmable: false },
    informe_verificacion:   { label: 'Informe de Verificación', fase: 4, multiple: false, firmable: false },
    dictamen_favorable:     { label: 'Dictamen favorable', fase: 4, multiple: false, firmable: false },
    // OJO: esta es la factura que el VERIFICADOR emite al SUJETO OBLIGADO (es el S.O.
    // quien contrata la verificación — por eso la oferta se la mandamos a él a firmar).
    // No confundir con la de Brokergy al S.O. por la venta de CAEs, que es la del paso 5.
    factura_verificador:    { label: 'Factura del verificador al Sujeto Obligado', fase: 4, multiple: false, firmable: false, importe: true },
};

// Slots que se suben a mano desde el módulo de documentos (los de fase 2 los genera
// la app al enviar al S.O., no se suben sueltos).
const SLOTS_SUBIBLES = [
    'solicitud_verificacion', 'oferta_verificacion', 'informe_inexactitudes',
    'informe_verificacion', 'dictamen_favorable', 'factura_verificador',
];

// Documentos que componen la FIRMA DEL SUJETO OBLIGADO (fase 2). Cuando están todos
// firmados, el lote pasa a esperar la oferta del verificador. La oferta y el papeleo
// de la fase 4 quedan fuera a propósito: son otro momento del proceso.
function esDocDelSujetoObligado(entry) {
    if (!entry || !entry.key) return false;
    return entry.key === 'anexo_i'
        || entry.key === 'solicitud_verificacion'
        || String(entry.key).startsWith('ficha_');
}

// Clave de una entrada nueva. Para los slots `multiple` busca el primer hueco libre
// (informe_inexactitudes_1, _2, …) sin reutilizar claves ya usadas.
function nextDocKey(docs, slot) {
    const cfg = LOTE_DOC_SLOTS[slot];
    if (!cfg) return null;
    if (!cfg.multiple) return slot;
    const usadas = new Set((docs || []).map(d => d && d.key).filter(Boolean));
    let n = 1;
    while (usadas.has(`${slot}_${n}`)) n++;
    return `${slot}_${n}`;
}

// ─── Carpeta y nombres en Drive ───────────────────────────────────────────────
// Todo el papeleo de NIVEL LOTE vive en una subcarpeta propia dentro de la carpeta
// del lote, para que la raíz solo tenga las carpetas de los expedientes. Las fichas
// RES no entran aquí: viven en la carpeta de SU expediente, que se audita aparte.
//
// Dentro va todo junto con un PREFIJO NUMÉRICO: Drive ordena alfabéticamente, así
// que el nombre del fichero ya da el orden del proceso sin subcarpetas de un PDF.
// Los informes de inexactitudes comparten el 4.1 y se distinguen por su número, para
// que un requerimiento nuevo no obligue a renumerar lo que viene detrás.
const CARPETA_DOCS = (codigo) => `${codigo || 'LOTE'} - DOC. VERIFICACIÓN`;

const PREFIJO_DOC = {
    solicitud_verificacion: '1.',
    anexo_i:                '2.',
    oferta_verificacion:    '3.',
    informe_inexactitudes:  '4.1',
    informe_verificacion:   '4.2',
    dictamen_favorable:     '4.3',
    factura_verificador:    '4.4',
    factura_so:             '5.',   // Brokergy → S.O. (venta de CAEs)
};

// Nombre canónico (sin extensión) de un documento de lote. `n` numera los slots
// múltiples; `label` permite un texto propio (p.ej. el nº de la factura al S.O.).
function nombreDocLote(slot, { n = null, label = null } = {}) {
    const prefijo = PREFIJO_DOC[slot] || '';
    const base = label || LOTE_DOC_SLOTS[slot]?.label || slot;
    return `${prefijo} ${base}${n ? ` ${n}` : ''}`.trim();
}

// Slot base de una clave ('informe_inexactitudes_2' → 'informe_inexactitudes').
function slotDeKey(key) {
    const k = String(key || '');
    if (LOTE_DOC_SLOTS[k]) return k;
    const m = k.match(/^(.*)_\d+$/);
    return m && LOTE_DOC_SLOTS[m[1]] ? m[1] : null;
}

// ─── Estados ──────────────────────────────────────────────────────────────────
// El orden ES el rango: el estado solo avanza (nunca retrocede) salvo que se pida
// explícitamente, que es el caso de un requerimiento del verificador.
const LOTE_ESTADOS = [
    'BORRADOR',
    'SOLICITADO PRESUPUESTO A VERIFICADOR',
    'PTE. FIRMA S.O.',
    'PTE. OFERTA VERIFICADOR',
    'PTE. FIRMA OFERTA S.O.',
    'ENVIADO A VERIFICADOR',
    'REQUERIMIENTO VERIFICADOR',
    'VERIFICADO',
    'PTE. SUBIDA MITECO',
    'REQUERIMIENTO G.A.',
    'CAE EMITIDO – PTE PAGO BROKERGY',
    'PTE. PAGO BROKERGY A CLIENTE',
    'FINALIZADO',
];

const rankEstado = (e) => LOTE_ESTADOS.indexOf(e);

// Estado que le toca al lote según el papeleo que ya tiene. Devuelve null si el
// papeleo no justifica ningún avance.
//   `docs`  entradas de documentos_so ya actualizadas
function estadoSegunDocs(docs) {
    const list = Array.isArray(docs) ? docs : [];
    const byKey = (k) => list.find(d => d && d.key === k);
    const hay = (k) => !!byKey(k);
    const firmado = (k) => !!byKey(k)?.signed_link;

    if (hay('informe_verificacion') && hay('dictamen_favorable')) return 'VERIFICADO';
    if (firmado('oferta_verificacion')) return 'ENVIADO A VERIFICADOR';
    if (byKey('oferta_verificacion')?.sent_at) return 'PTE. FIRMA OFERTA S.O.';

    // Fase 2 completa = todos los documentos del S.O. existen y están firmados.
    const docsSo = list.filter(esDocDelSujetoObligado);
    if (docsSo.length > 0 && docsSo.every(d => d.signed_link)) return 'PTE. OFERTA VERIFICADOR';
    if (docsSo.some(d => d.sent_at)) return 'PTE. FIRMA S.O.';

    if (hay('solicitud_verificacion')) return 'SOLICITADO PRESUPUESTO A VERIFICADOR';
    return null;
}

/**
 * Decide el estado nuevo del lote. Solo avanza; devuelve null si no hay cambio.
 * `retroceso` permite el único paso atrás legítimo: un requerimiento del
 * verificador, que reabre el expediente aunque ya estuviera VERIFICADO. Ni siquiera
 * un requerimiento pisa un lote que ya está cobrando (CAE EMITIDO en adelante).
 */
function siguienteEstado(estadoActual, destino, { retroceso = false } = {}) {
    if (!destino || destino === estadoActual) return null;
    const rActual = rankEstado(estadoActual);
    const rDestino = rankEstado(destino);
    if (rDestino < 0) return null;
    if (rActual < 0) return destino;            // estado desconocido: lo normalizamos
    if (rDestino > rActual) return destino;
    if (retroceso && rActual < rankEstado('CAE EMITIDO – PTE PAGO BROKERGY')) return destino;
    return null;
}

// Estados que también existen en la tabla `expedientes`: al avanzar el lote se
// propagan a sus miembros (espejo de la lista de PATCH /lotes/:id/estado).
const ESTADOS_TAMBIEN_DE_EXPEDIENTE = [
    'ENVIADO A VERIFICADOR', 'REQUERIMIENTO VERIFICADOR', 'PTE. SUBIDA MITECO',
    'REQUERIMIENTO G.A.', 'CAE EMITIDO – PTE PAGO BROKERGY',
    'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO',
];

/**
 * Avanza el estado del lote según su papeleo y deja constancia en el historial.
 * Lo llaman los endpoints que completan un hito (subir un documento, enviar al
 * S.O., recibir una firma). No lanza: un fallo aquí nunca debe tumbar el envío que
 * ya se hizo. Devuelve el estado nuevo, o null si no había que mover nada.
 *
 * @param {string} loteId
 * @param {{ docs?: Array, destino?: string, retroceso?: boolean, usuario?: string, motivo?: string }} opts
 *        `docs`    = documentos_so recién escritos (evita releerlos).
 *        `destino` = estado concreto, en vez de deducirlo del papeleo. Lo usa el
 *                    requerimiento del verificador, que no se puede inferir: los
 *                    informes de inexactitudes viejos siguen ahí una vez resueltos.
 */
async function sincronizarEstadoLote(loteId, opts = {}) {
    const { docs = null, destino: destinoFijo = null, retroceso = false, usuario = 'SISTEMA', motivo = '' } = opts;
    try {
        const supabase = require('./supabaseClient');
        const { data: lote } = await supabase
            .from('lotes').select('*').eq('id', loteId).maybeSingle();
        if (!lote) return null;

        const destino = destinoFijo || estadoSegunDocs(docs || lote.documentos_so);
        const nuevo = siguienteEstado(lote.estado, destino, { retroceso });
        if (!nuevo) return null;

        const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
        historial.push({
            id: `${Date.now()}_estado_auto`, tipo: 'cambio_estado',
            estado: nuevo,
            texto: `Estado → ${nuevo}${motivo ? ` (${motivo})` : ''}`,
            fecha: new Date().toISOString(), usuario,
        });

        const update = { estado: nuevo, historial, updated_at: new Date().toISOString() };
        if (nuevo === 'ENVIADO A VERIFICADOR' && !lote.fecha_envio_verificador) {
            update.fecha_envio_verificador = new Date().toISOString();
        }
        const { data: updated } = await supabase
            .from('lotes').update(update).eq('id', lote.id).select().single();

        if (ESTADOS_TAMBIEN_DE_EXPEDIENTE.includes(nuevo)) {
            await supabase.from('expedientes')
                .update({ estado: nuevo, updated_at: new Date().toISOString() })
                .eq('lote_id', lote.id);
        }

        // La carpeta solo se mueve si el estado nuevo cambia de destino; los estados
        // intermedios apuntan a la misma carpeta y `moveFolder` es idempotente.
        const { syncLoteFolder } = require('./expedienteFolderSync');
        setImmediate(() => {
            syncLoteFolder(updated || lote, { motivo: 'avance automático del lote' }).catch(() => {});
        });
        return nuevo;
    } catch (e) {
        console.error('[sincronizarEstadoLote]', e.message);
        return null;
    }
}

module.exports = {
    LOTE_DOC_SLOTS,
    SLOTS_SUBIBLES,
    LOTE_ESTADOS,
    CARPETA_DOCS,
    PREFIJO_DOC,
    nombreDocLote,
    rankEstado,
    nextDocKey,
    slotDeKey,
    esDocDelSujetoObligado,
    estadoSegunDocs,
    siguienteEstado,
    sincronizarEstadoLote,
};
