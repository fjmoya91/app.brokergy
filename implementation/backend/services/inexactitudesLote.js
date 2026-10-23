// ─────────────────────────────────────────────────────────────────────────────
// Las INEXACTITUDES del verificador → incidencias de cada expediente, y la
// CARPETA DEL REQUERIMIENTO con lo que se ha corregido.
//
// El informe de inexactitudes es una lista de "Inexactitud nº N" con las
// ACTUACIONES a las que afecta ("1,2,3,4,5" = el nº de actuación de la solicitud,
// `instalacion.verificacion.orden_actuacion`) y el hecho encontrado. Hasta ahora
// se leía a mano y cada punto se trasladaba a mano a cada expediente; y para
// contestar se montaba a mano una carpeta "{n}. REQUERIMIENTO" en la raíz del lote
// con los documentos corregidos, renombrados como en el paquete
// ("E3-4-5 - 25RES080_7 - ANEXO I_rev1_fdo.pdf" — LOTE-2025-005, -006, -009).
//
// Esto hace las dos cosas:
//   1. Al SUBIR el informe (o al releerlo) cada inexactitud se registra como
//      incidencia en el expediente de cada actuación que cita, colgada del
//      documento al que se refiere, con procedencia VERIFICACION. Es idempotente:
//      la identidad es (lote, nº de inexactitud), así que releer no duplica y un
//      segundo informe que repite la nº1 la REABRE si ya estaba subsanada.
//   2. Al SUBSANAR una de ellas, el documento corregido se COPIA a la carpeta del
//      requerimiento de su ronda con el nombre del paquete. Y desde el lote se
//      puede "preparar" la carpeta entera (lo que faltara + el ZIP).
//
// REGLA — el modelo solo LEE; a qué expediente y a qué documento va cada
// inexactitud lo decide este módulo, con reglas que se pueden probar
// (scripts/test_inexactitudes_lote.js).
//
// REGLA — solo se copia lo que es DISTINTO de lo que ya vio el verificador.
// Subsanar una incidencia no prueba que el papel se haya corregido: si el
// documento del expediente es el mismo que se le mandó, meterlo en la respuesta es
// contestar con lo que motivó la inexactitud. Se compara por CONTENIDO (md5 de
// Drive) con la copia del paquete "E{n}" del expediente y con las de las
// respuestas anteriores; solo si no hay ninguna copia con la que comparar se mira
// la fecha (cambiado desde el día del informe). Por fecha NO basta: en
// LOTE-2025-012 el Anexo I corregido de 26RES093_4 se firmó a las 14:21 y el
// informe se subió a las 14:23 — por la hora de subida se habría quedado fuera.
// Lo que no se copia se deja dicho en el hilo y entra en cuanto llegue el
// corregido ("Preparar la carpeta").
//
// REGLA — una incidencia que habla de VARIOS documentos sale en CADA uno.
// "El nº de serie según el Anexo I difiere del de la placa del informe
// fotográfico" se arregla en uno de los dos, y no se sabe en cuál hasta
// corregirlo: colgarla solo del primero dejaría el otro en verde. Va en `slots`;
// `slot` solo se rellena cuando es uno.
// ─────────────────────────────────────────────────────────────────────────────

// Mismos slots que `SLOTS_INCIDENCIA` de routes/expedientes.js y del frontend
// (logic/incidenciaSlots.js).
const SLOTS_VALIDOS = ['facturas', 'anexo_i', 'anexo_cesion', 'cert_cifo', 'ficha_res', 'anexo_fotografico', 'cert_rite', 'cee'];

// Documentos NOMBRADOS en el hecho. El orden no decide nada: se recogen todos.
const DOCUMENTOS_NOMBRADOS = [
    [/anexo\s*fotogr|informe\s*fotogr|reportaje\s*fotogr/i, 'anexo_fotografico'],
    [/cesi[oó]n\s*(de(l)?\s*)?ahorro|convenio\s*de\s*cesi[oó]n/i, 'anexo_cesion'],
    [/anexo\s*(i|1)\b/i, 'anexo_i'],
    [/\bcifo\b|certificado\s*de\s*instalaci[oó]n|certificado\s*de\s*fin\s*de\s*obra|certificado\s*de\s*reforma/i, 'cert_cifo'],
    [/\brite\b/i, 'cert_rite'],
    [/ficha\s*res|\bres0\d\d\b|\bter1\d\d\b/i, 'ficha_res'],
    [/\bfactura/i, 'facturas'],
    [/\bcee\b|certificado\s*de\s*eficiencia|etiqueta\s*energ|calificaci[oó]n\s*energ/i, 'cee'],
];

// Lo que se cita sin nombrar el documento: dónde lo declaramos NOSOTROS. Solo se
// usa si el hecho no nombra ninguno. Las UTM van en el CIFO, el Convenio de
// Cesión y el Anexo Fotográfico (medido en 25RES060_85); la referencia catastral,
// además, en el Anexo I.
const TEMAS = [
    [/\bscop\b|\bseer\b|\bcop\b|impulsi[oó]n|temperatura|potencia|ficha\s*t[eé]cnica|rendimiento/i, ['cert_cifo']],
    [/\butm\b|coordenad/i, ['cert_cifo', 'anexo_cesion', 'anexo_fotografico']],
    [/referencia\s*catastral|\brc\b/i, ['anexo_i', 'cert_cifo', 'anexo_cesion']],
    [/n[ºo°.]?\s*de\s*serie|placa|\bmodelo\b|\bmarca\b/i, ['cert_cifo', 'anexo_i']],
    [/inversi[oó]n|importe|presupuesto/i, ['facturas']],
];

/** Los documentos (slots) de los que habla una inexactitud. */
function documentosDeInexactitud(hecho) {
    const t = String(hecho || '');
    const nombrados = DOCUMENTOS_NOMBRADOS.filter(([re]) => re.test(t)).map(([, s]) => s);
    if (nombrados.length) return [...new Set(nombrados)];
    const porTema = TEMAS.filter(([re]) => re.test(t)).flatMap(([, ss]) => ss);
    return [...new Set(porTema)];
}

// "Inexactitud importante" → GRAVE; "no importante" / "menor" / "observación" → LEVE.
function severidadDe(clasificacion) {
    return /no\s*importante|menor|leve|observaci/i.test(String(clasificacion || '')) ? 'LEVE' : 'GRAVE';
}

const estaCerrada = (estado) => /cerrad|resuelt|subsanad/i.test(String(estado || ''));

/**
 * Nº de actuación citados: "1,2,3,4,5" · "1 a 5" · "1-3, 5" · "Todas".
 * @param {string|null} texto
 * @param {number[]} todas  los nº de actuación del lote (para "todas")
 */
function actuacionesDe(texto, todas = []) {
    const t = String(texto || '').trim();
    if (!t) return [];
    if (/todas/i.test(t)) return [...todas];
    const out = new Set();
    for (const parte of t.split(/[,;y]+/i)) {
        const rango = parte.match(/(\d+)\s*(?:-|–|a|al)\s*(\d+)/i);
        if (rango) {
            const [a, b] = [Number(rango[1]), Number(rango[2])].sort((x, y) => x - y);
            for (let k = a; k <= b && k - a < 50; k++) out.add(k);
        } else {
            for (const m of parte.match(/\d+/g) || []) out.add(Number(m));
        }
    }
    return [...out].sort((x, y) => x - y);
}

// Nº de expediente sin separadores, para comparar ("26RES060_10" no casa con
// "26RES060_105": se compara la cadena entera, no un prefijo).
const numClave = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const NUM_EXP_RE = /\b\d{2}\s*[A-Z]{3}\s*\d{3}\s*[_\- ]\s*\d+\b/gi;

/**
 * Reparte las inexactitudes leídas entre los expedientes del lote.
 * @param {Array} items       inexactitudes leídas ({ n, actuaciones, hecho, … })
 * @param {Array} expedientes [{ id, numero_expediente, orden_actuacion }]
 * @returns {{ asignaciones: Array<{inex, exp}>, sin_casar: Array<{n, motivo}> }}
 */
function casarInexactitudes(items, expedientes) {
    const porOrden = new Map();
    for (const e of expedientes || []) if (e.orden_actuacion) porOrden.set(Number(e.orden_actuacion), e);
    const porNumero = new Map((expedientes || []).map(e => [numClave(e.numero_expediente), e]));
    const todas = [...porOrden.keys()].sort((a, b) => a - b);

    const asignaciones = [];
    const sin_casar = [];
    for (const inex of items || []) {
        const exps = new Map();
        const huerfanas = [];
        for (const a of actuacionesDe(inex.actuaciones, todas)) {
            const e = porOrden.get(a);
            if (e) exps.set(e.id, e); else huerfanas.push(a);
        }
        // Un verificador puede citar el expediente por su número en el propio texto.
        for (const m of String(`${inex.actuaciones || ''} ${inex.hecho || ''}`).match(NUM_EXP_RE) || []) {
            const e = porNumero.get(numClave(m));
            if (e) exps.set(e.id, e);
        }
        if (!exps.size) {
            sin_casar.push({
                n: inex.n,
                motivo: huerfanas.length
                    ? `cita la actuación ${huerfanas.join(', ')}, que no es de ningún expediente del lote (¿falta el nº de actuación?)`
                    : 'no cita ninguna actuación: es del lote, no de un expediente',
            });
            continue;
        }
        if (huerfanas.length) {
            sin_casar.push({ n: inex.n, motivo: `la actuación ${huerfanas.join(', ')} no es de ningún expediente del lote` });
        }
        for (const exp of exps.values()) asignaciones.push({ inex, exp });
    }
    return { asignaciones, sin_casar };
}

// ronda = nº del informe de inexactitudes ('informe_inexactitudes_2' → 2).
function rondaDeKey(docKey) {
    const m = String(docKey || '').match(/^informe_inexactitudes_(\d+)$/);
    return m ? Number(m[1]) : null;
}

const CARPETA_REQUERIMIENTO = (ronda) => `${ronda}. REQUERIMIENTO`;

// ─── El hilo de la incidencia ────────────────────────────────────────────────
// Mismo formato que `pushComentario` de routes/expedientes.js (y del MCP).
const MAX_COMENTARIOS = 50;
function pushComentario(inc, texto, autor, tipo = 'NOTA') {
    const entrada = {
        id: `${Date.now()}_c${Math.random().toString(36).slice(2, 7)}`,
        texto: String(texto || '').trim().slice(0, 2000),
        autor: autor || 'Sistema',
        tipo,
        fecha: new Date().toISOString(),
    };
    let hilo = [...(inc.comentarios || []), entrada];
    while (hilo.length > MAX_COMENTARIOS) {
        const i = hilo.findIndex(c => c.tipo === 'NOTA');
        hilo.splice(i === -1 ? 0 : i, 1);
    }
    inc.comentarios = hilo;
}

const esDeLaInexactitud = (inc, loteId, n) =>
    inc?.inexactitud?.lote_id === loteId && Number(inc.inexactitud.n) === Number(n);

/**
 * Qué hay que hacer en las incidencias de UN expediente. Puro: no escribe nada.
 *
 *   · inexactitud ABIERTA que no estaba            → nueva incidencia
 *   · ABIERTA que ya estaba abierta, de otra ronda → pasa a esta ronda (la respuesta va en su carpeta)
 *   · ABIERTA que ya estaba SUBSANADA, de una ronda anterior → se REABRE: el verificador no la dio por buena
 *   · CERRADA por el verificador y abierta aquí    → se subsana sola, con su motivo
 *   · releer el MISMO informe no cambia nada.
 *
 * @returns {{ incidencias: Array, nuevas, reabiertas, cerradas, movidas, iguales }}
 */
function planIncidencias({ incidencias, inexs, lote, docKey, ronda, desde, cae, label, usuario = 'SISTEMA', ahora = new Date().toISOString() }) {
    const lista = (incidencias || []).map(i => ({ ...i, comentarios: [...(i.comentarios || [])] }));
    const r = { nuevas: 0, reabiertas: 0, cerradas: 0, movidas: 0, iguales: 0 };
    inexs.forEach((inex, k) => {
        const previa = lista.find(i => esDeLaInexactitud(i, lote.id, inex.n));
        const cerrada = estaCerrada(inex.estado);
        if (!previa) {
            if (cerrada) return;
            const documentos = documentosDeInexactitud(inex.hecho);
            const hecho = String(inex.hecho).slice(0, 3500);
            lista.push({
                id: `${Date.now()}_${k}_inc`,
                texto: `Inexactitud nº${inex.n} del verificador${cae ? ` (${cae})` : ''}: ${hecho}`,
                procedencia: 'VERIFICACION',
                severidad: severidadDe(inex.clasificacion),
                slot: documentos.length === 1 ? documentos[0] : null,
                slots: documentos,
                tipo: 'INEXACTITUD',
                ref: null,
                ref_label: null,
                estado: 'ABIERTA',
                fecha: ahora,
                usuario,
                resuelta_at: null,
                resuelta_por: null,
                comentarios: [],
                inexactitud: {
                    lote_id: lote.id, lote_codigo: lote.codigo || null,
                    doc_key: docKey, ronda, n: inex.n, desde,
                    actuaciones: inex.actuaciones || null,
                    clasificacion: inex.clasificacion || null,
                },
            });
            r.nuevas++;
            return;
        }
        const rondaPrevia = Number(previa.inexactitud?.ronda) || 0;
        if (cerrada) {
            if (previa.estado === 'SUBSANADA') { r.iguales++; return; }
            const motivo = `Cerrada por el verificador en el ${label}.`;
            Object.assign(previa, { estado: 'SUBSANADA', resuelta_at: ahora, resuelta_por: 'VERIFICADOR', resolucion: motivo });
            previa.inexactitud = { ...previa.inexactitud, cerrada_por_verificador: true };
            pushComentario(previa, motivo, 'Sistema', 'RESOLUCION');
            r.cerradas++;
            return;
        }
        if (rondaPrevia >= ronda) { r.iguales++; return; }
        // Sigue abierta en un informe POSTERIOR: su respuesta va a la carpeta de esta ronda.
        previa.inexactitud = { ...previa.inexactitud, doc_key: docKey, ronda, desde, descartada: false };
        if (previa.estado === 'SUBSANADA') {
            Object.assign(previa, { estado: 'ABIERTA', resuelta_at: null, resuelta_por: null, resolucion: null });
            pushComentario(previa, `Sigue abierta en el ${label}: el verificador no la dio por subsanada.`, 'Sistema', 'REAPERTURA');
            r.reabiertas++;
        } else {
            pushComentario(previa, `Sigue abierta en el ${label}.`, 'Sistema', 'NOTA');
            r.movidas++;
        }
    });
    return { incidencias: lista, ...r };
}

// ─── Leer el informe y registrar ─────────────────────────────────────────────
const nowIso = () => new Date().toISOString();

// Desde cuándo un documento cuenta como corregido, cuando no hay copia enviada
// con la que compararlo: el DÍA del informe (00:00 en Madrid ≈ 22:00 UTC del día
// anterior), o la subida si es anterior o la fecha no se lee.
function desdeDe(fechaInforme, uploadedAt) {
    const m = String(fechaInforme || '').match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
    const subida = Date.parse(uploadedAt || '') || Date.now();
    if (!m) return new Date(subida).toISOString();
    const dia = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])) - 2 * 3600 * 1000;
    return new Date(Math.min(dia, subida)).toISOString();
}

async function expedientesDelLote(loteId, { conDocumentacion = false } = {}) {
    const supabase = require('./supabaseClient');
    const { data, error } = await supabase
        .from('expedientes')
        .select(`id, numero_expediente, oportunidad_id, instalacion, ${conDocumentacion ? 'documentacion' : 'incidencias:documentacion->incidencias'}`)
        .eq('lote_id', loteId)
        .order('numero_expediente', { ascending: true });
    if (error) throw new Error(`No se pudieron leer los expedientes del lote: ${error.message}`);
    return (data || []).map(e => ({ ...e, orden_actuacion: Number(e.instalacion?.verificacion?.orden_actuacion) || null }));
}

/**
 * Lee un informe de inexactitudes del lote y registra sus incidencias.
 * No lanza por un fallo de lectura: lo devuelve en `{ leido: false, error }`.
 *
 * @param {object} lote      fila de `lotes`
 * @param {string} docKey    'informe_inexactitudes_N'
 * @param {Buffer} buffer    el PDF (si no viene, se baja de Drive)
 * @param {{ usuario?: string, seco?: boolean }} opts  `seco` = solo dice lo que haría
 */
async function registrarInexactitudes(lote, docKey, buffer = null, { usuario = 'SISTEMA', seco = false } = {}) {
    const supabase = require('./supabaseClient');
    const ronda = rondaDeKey(docKey);
    if (!ronda) return { leido: false, error: `${docKey} no es un informe de inexactitudes` };
    const entrada = (lote.documentos_so || []).find(d => d?.key === docKey);
    if (!entrada) return { leido: false, error: 'El informe no está en el lote' };
    const label = `${entrada.label || `Informe de inexactitudes ${ronda}`}${lote.codigo ? ` de ${lote.codigo}` : ''}`;

    let informe;
    try {
        if (!buffer) {
            const driveService = require('./driveService');
            buffer = await driveService.getFileContent(entrada.draft_file_id);
            if (!buffer) throw new Error('No se pudo descargar el informe de Drive');
        }
        const { leerInformeInexactitudes } = require('./loteOcrService');
        informe = await leerInformeInexactitudes(buffer);
    } catch (err) {
        console.warn('[inexactitudes] lectura:', err.message);
        return { leido: false, error: err.message };
    }
    if (!informe.inexactitudes.length) {
        return { leido: false, error: 'No se ha encontrado ninguna inexactitud en el PDF' };
    }

    const exps = await expedientesDelLote(lote.id);
    const { asignaciones, sin_casar } = casarInexactitudes(informe.inexactitudes, exps);
    const desde = desdeDe(informe.fecha, entrada.uploaded_at);

    const porExpediente = [];
    for (const exp of exps) {
        const inexs = asignaciones.filter(a => a.exp.id === exp.id).map(a => a.inex);
        if (!inexs.length) continue;
        const plan = planIncidencias({
            incidencias: Array.isArray(exp.incidencias) ? exp.incidencias : [],
            inexs, lote, docKey, ronda, desde, cae: informe.expediente_cae, label, usuario,
        });
        const cambia = plan.nuevas + plan.reabiertas + plan.cerradas + plan.movidas > 0;
        if (cambia && !seco) {
            // Se relee `documentacion` justo antes de escribir y SOLO se cambia la
            // clave `incidencias` (protegida del autoguardado: CLAVES_PROTEGIDAS).
            // Se vuelve a planificar sobre lo recién leído por si alguien registró o
            // subsanó una mientras se leía el PDF.
            const { data: fresh, error: eLee } = await supabase.from('expedientes')
                .select('documentacion').eq('id', exp.id).single();
            if (eLee) throw new Error(`${exp.numero_expediente}: ${eLee.message}`);
            const doc = fresh.documentacion || {};
            const final = planIncidencias({
                incidencias: Array.isArray(doc.incidencias) ? doc.incidencias : [],
                inexs, lote, docKey, ronda, desde, cae: informe.expediente_cae, label, usuario,
            });
            doc.incidencias = final.incidencias;
            const { error: eEsc } = await supabase.from('expedientes')
                .update({ documentacion: doc, updated_at: nowIso() }).eq('id', exp.id);
            if (eEsc) throw new Error(`${exp.numero_expediente}: ${eEsc.message}`);
        }
        porExpediente.push({
            expediente_id: exp.id,
            numero_expediente: exp.numero_expediente,
            actuacion: exp.orden_actuacion,
            inexactitudes: inexs.map(i => i.n),
            nuevas: plan.nuevas, reabiertas: plan.reabiertas, cerradas: plan.cerradas,
            movidas: plan.movidas, iguales: plan.iguales,
        });
    }

    const resumen = {
        leido: true,
        seco,
        ronda,
        carpeta: CARPETA_REQUERIMIENTO(ronda),
        expediente_cae: informe.expediente_cae,
        fecha: informe.fecha,
        items: informe.inexactitudes.map(i => ({
            n: i.n,
            clasificacion: i.clasificacion,
            estado: i.estado,
            actuaciones: i.actuaciones,
            hecho: String(i.hecho).slice(0, 600),
            documentos: documentosDeInexactitud(i.hecho),
        })),
        porExpediente,
        sin_casar,
        totales: ['nuevas', 'reabiertas', 'cerradas', 'movidas'].reduce(
            (o, k) => ({ ...o, [k]: porExpediente.reduce((s, x) => s + x[k], 0) }), {}),
    };

    if (!seco) {
        // Lo leído se sella en la entrada del informe (identifica al papel y lo
        // pinta la fila del lote) y queda en el historial.
        const { data: fl } = await supabase.from('lotes').select('documentos_so, historial').eq('id', lote.id).maybeSingle();
        const docs = Array.isArray(fl?.documentos_so) ? [...fl.documentos_so] : [];
        const idx = docs.findIndex(d => d?.key === docKey);
        if (idx >= 0) {
            docs[idx] = {
                ...docs[idx],
                inexactitudes: {
                    leido_at: nowIso(), expediente_cae: resumen.expediente_cae, fecha: resumen.fecha,
                    items: resumen.items, sin_casar, totales: resumen.totales,
                },
            };
        }
        const historial = Array.isArray(fl?.historial) ? [...fl.historial] : [];
        const t = resumen.totales;
        historial.push({
            id: `${Date.now()}_inexactitudes`, tipo: 'sistema',
            texto: `${entrada.label}: ${resumen.items.length} inexactitud(es) leídas → `
                + `${t.nuevas} incidencia(s) nuevas${t.reabiertas ? `, ${t.reabiertas} reabiertas` : ''}`
                + `${t.cerradas ? `, ${t.cerradas} cerradas por el verificador` : ''}`
                + ` en ${porExpediente.length} expediente(s).${sin_casar.length ? ` Sin expediente: nº ${sin_casar.map(s => s.n).join(', ')}.` : ''}`,
            fecha: nowIso(), usuario,
        });
        await supabase.from('lotes').update({ documentos_so: docs, historial, updated_at: nowIso() }).eq('id', lote.id);
    }
    return resumen;
}

// ─── La carpeta del requerimiento ────────────────────────────────────────────
// Qué piezas del paquete (envioGestorService.INDICE) corresponden a cada slot.
// El CEE son varias (inicial y final, PDF, registro, XML, etiqueta): se miran
// todas y solo se copian las que hayan cambiado.
const PIEZAS_POR_SLOT = {
    anexo_i: ['4-5'],
    anexo_cesion: ['1-2'],
    cert_cifo: ['3-5'],
    ficha_res: ['3-1'],
    anexo_fotografico: ['3-4'],
    cert_rite: ['3-2'],
    facturas: ['3-3'],
    cee: ['3-6', '3-7', '3-8', '3-9', '4-2', '4-3', '4-4', '4-6'],
};

// Conserva la revisión del original: "ANEXO I_fdo" + "…ANEXO I_rev1_fdo.pdf" →
// "ANEXO I_rev1_fdo". Es como se llamaban en las contestaciones ya presentadas, y
// le dice al verificador que ESTE no es el que ya vio.
function conRevision(nombre, nombreOrigen) {
    const m = String(nombreOrigen || '').match(/_rev(\d+)/i);
    if (!m || /_rev\d+/i.test(nombre)) return nombre;
    const rev = `_rev${m[1]}`;
    if (/_fdo(\.[a-z0-9]+)$/i.test(nombre)) return nombre.replace(/_fdo(\.[a-z0-9]+)$/i, `${rev}_fdo$1`);
    return nombre.replace(/(\.[a-z0-9]+)$/i, `${rev}$1`);
}

const fechaDe = (meta) => {
    const t = Math.max(Date.parse(meta?.createdTime || '') || 0, Date.parse(meta?.modifiedTime || '') || 0);
    return t || null;
};
const fmt = (ms) => (ms ? new Date(ms).toLocaleDateString('es-ES') : '?');

/**
 * Huellas (md5) de lo que YA se le ha mandado al verificador de una pieza: la
 * copia del paquete en la "E{n}" del expediente y las de las respuestas de rondas
 * anteriores ("{k}. REQUERIMIENTO", k < ronda). `cache` evita listar la misma
 * carpeta una vez por pieza.
 * @returns {Promise<Map<string, string>>} md5 → nombre de la copia
 */
async function huellasEnviadas({ carpetas, prefijo, cache }) {
    const driveService = require('./driveService');
    const out = new Map();
    for (const c of carpetas.filter(Boolean)) {
        if (!cache.has(c)) cache.set(c, (await driveService.listFiles(c) || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder'));
        for (const f of cache.get(c).filter(x => x.name.startsWith(prefijo) || x.name.startsWith(`${prefijo.trim()} -`))) {
            const m = await driveService.getFileMetadata(f.id, 'id, md5Checksum');
            if (m?.md5Checksum) out.set(m.md5Checksum, f.name);
        }
    }
    return out;
}

// Las carpetas de las respuestas ANTERIORES a esta ronda.
async function carpetasRondasPrevias(lote, ronda) {
    const driveService = require('./driveService');
    const ids = [];
    for (let k = 1; k < ronda; k++) {
        const id = await driveService.findSubfolderByName(lote.drive_folder_id, CARPETA_REQUERIMIENTO(k));
        if (id) ids.push(id);
    }
    return ids;
}

/**
 * Deja la versión CORREGIDA también en la "E{n}" del expediente (decisión del
 * usuario, 22/10/2026: el paquete del expediente tiene que ser el que vale). La
 * que había —lo que vio el verificador— NO se borra: va a "E{n}/OLD" con su
 * `_OLD`, y desde ahí sigue contando como «ya visto» (`huellasEnviadas`).
 *
 * @returns {{ ok: boolean, yaEstaba?: boolean, motivo?: string }}
 */
async function ponerEnCarpetaE({ driveFolderId, carpetaE, n, prefijo, fileId, md5, nombre }) {
    const driveService = require('./driveService');
    const carpeta = carpetaE || await driveService.getOrCreateSubfolder(driveFolderId, `E${n}`);
    if (!carpeta) return { ok: false, motivo: `no se pudo preparar la carpeta E${n}` };
    const previos = (await driveService.listFiles(carpeta) || [])
        .filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
        .filter(f => f.name.startsWith(prefijo) || f.name.startsWith(`${prefijo.trim()} -`));
    for (const p of previos.filter(f => f.name === nombre)) {
        const m = await driveService.getFileMetadata(p.id, 'id, md5Checksum');
        if (md5 && m?.md5Checksum === md5) return { ok: true, yaEstaba: true };
    }
    for (const p of previos) await driveService.archiveExistingToOld(carpeta, p.id, p.name);
    const saved = await driveService.copyFile(fileId, carpeta, nombre);
    return saved ? { ok: true } : { ok: false, motivo: `no se pudo copiar a E${n}` };
}

async function carpetaDelRequerimiento(lote, ronda) {
    const driveService = require('./driveService');
    if (!lote?.drive_folder_id) throw new Error('El lote no tiene carpeta de Drive');
    const id = await driveService.getOrCreateSubfolder(lote.drive_folder_id, CARPETA_REQUERIMIENTO(ronda));
    if (!id) throw new Error(`No se pudo preparar la carpeta "${CARPETA_REQUERIMIENTO(ronda)}"`);
    return id;
}

/**
 * Copia a la carpeta del requerimiento las piezas `cods` de UN expediente que
 * hayan cambiado después de `desde`. Lo que ya está copiado y al día no se toca;
 * una copia anterior de la misma pieza (otra revisión) se sustituye.
 *
 * @returns {{ copiados: Array<{nombre, link}>, omitidos: Array<{etiqueta, motivo}> }}
 */
async function copiarPiezas({ lote, exp, cods, desde, carpeta, listado, ronda = 1, previas = [], seco = false }) {
    const driveService = require('./driveService');
    const { INDICE, resolverPieza, buscarEnCarpeta, nombreFinal } = require('./envioGestorService');
    const { carpetaDeExpediente } = require('./expedienteFolderSync');
    const copiados = [];
    const omitidos = [];
    const n = Number(exp.instalacion?.verificacion?.orden_actuacion) || null;
    if (!n) {
        omitidos.push({ etiqueta: exp.numero_expediente, motivo: 'sin nº de actuación: no se sabe cómo llamarlo (E{n})' });
        return { copiados, omitidos };
    }
    const driveFolderId = await carpetaDeExpediente(exp);
    if (!driveFolderId) {
        omitidos.push({ etiqueta: exp.numero_expediente, motivo: 'el expediente no tiene carpeta en Drive' });
        return { copiados, omitidos };
    }
    const ctx = {
        exp, doc: exp.documentacion || {}, lote, n, driveFolderId,
        docsSo: Array.isArray(lote.documentos_so) ? lote.documentos_so : [],
        so: null, carpetaE: null, sueltosLote: [], cee: { inicial: {}, final: {} },
    };
    if (cods.some(c => (INDICE.find(p => p.cod === c) || {}).de === 'cee')) {
        const { scanCeeSection } = require('./ceeUploadService');
        ctx.cee = { inicial: await scanCeeSection(driveFolderId, 'inicial'), final: await scanCeeSection(driveFolderId, 'final') };
    }
    const desdeMs = Date.parse(desde || '') || 0;
    // Lo que ya se le mandó: el paquete "E{n}" del expediente (con su OLD, donde
    // queda lo que vio cuando se corrige) y las respuestas de las rondas anteriores.
    const carpetaE = await driveService.findSubfolderByName(driveFolderId, `E${n}`);
    const carpetaEOld = carpetaE ? await driveService.findSubfolderByName(carpetaE, 'OLD') : null;
    const cache = new Map();

    for (const cod of [...new Set(cods)]) {
        const pieza = INDICE.find(p => p.cod === cod);
        if (!pieza) continue;
        let r = await resolverPieza(pieza, ctx);
        if (!r && pieza.respaldo) r = await buscarEnCarpeta(driveFolderId, pieza.respaldo);
        const etiqueta = `${pieza.etiqueta} (${exp.numero_expediente})`;
        if (!r?.fileId) {
            // Las piezas opcionales del CEE (etiqueta, registro) no se echan de menos.
            if (pieza.obligatorio !== false && pieza.de !== 'cee') omitidos.push({ etiqueta, motivo: 'no está en el expediente' });
            continue;
        }
        const meta = await driveService.getFileMetadata(r.fileId, 'id, name, createdTime, modifiedTime, trashed, md5Checksum');
        if (!meta || meta.trashed) { omitidos.push({ etiqueta, motivo: 'el fichero enlazado ya no existe en Drive' }); continue; }
        const cambiado = fechaDe(meta);
        const prefijo = `E${n}-${pieza.cod} `;
        // En la E{n} puede estar ya la corregida de ESTA ronda (la pusimos al
        // subsanar): esa no la ha visto el verificador. Se reconoce porque está
        // también en la carpeta de esta ronda.
        const enE = await huellasEnviadas({ carpetas: [carpetaE], prefijo, cache });
        const deEstaRonda = await huellasEnviadas({ carpetas: [carpeta], prefijo, cache });
        const enviadas = await huellasEnviadas({ carpetas: [carpetaEOld, ...previas], prefijo, cache });
        for (const [md5, nom] of enE) if (!deEstaRonda.has(md5)) enviadas.set(md5, nom);
        // Con una copia enviada se compara el CONTENIDO; sin ninguna, la fecha.
        const porContenido = enviadas.size > 0 && !!meta.md5Checksum;
        const copiaVista = porContenido ? enviadas.get(meta.md5Checksum) || null : null;
        const noCambia = porContenido ? !!copiaVista : !(cambiado > desdeMs);
        if (noCambia) {
            if (pieza.de !== 'cee') {
                omitidos.push({ etiqueta, motivo: copiaVista
                    ? `es el mismo que ya vio el verificador («${copiaVista}»): súbelo corregido y vuelve a preparar la carpeta`
                    : `no ha cambiado desde el informe (es del ${fmt(cambiado)}): súbelo corregido y vuelve a preparar la carpeta` });
            }
            continue;
        }

        const nombre = conRevision(nombreFinal(pieza, r, { exp, n, lote }), meta.name);
        const previos = (listado || []).filter(f => f.name.startsWith(prefijo) || f.name.startsWith(`${prefijo.trim()} -`));
        const igual = previos.find(f => f.name === nombre);
        if (igual) {
            const m2 = await driveService.getFileMetadata(igual.id, 'id, createdTime, md5Checksum');
            const mismo = meta.md5Checksum && m2?.md5Checksum
                ? m2.md5Checksum === meta.md5Checksum
                : (Date.parse(m2?.createdTime || '') || 0) >= cambiado;
            if (mismo) {
                const e = seco ? null : await ponerEnCarpetaE({ driveFolderId, carpetaE, n, prefijo, fileId: r.fileId, md5: meta.md5Checksum, nombre });
                copiados.push({ nombre, link: igual.webViewLink || null, yaEstaba: true, enE: e?.ok && !e.yaEstaba, faltaE: e && !e.ok ? e.motivo : null });
                continue;
            }
        }
        if (seco) { copiados.push({ nombre, seco: true }); continue; }
        // Otra copia de la MISMA pieza (otra revisión, o la de antes de corregirla):
        // es una copia, el original sigue en el expediente.
        for (const p of previos) {
            try { await driveService.deleteFile(p.id); } catch (_) { /* no bloqueante */ }
        }
        const saved = await driveService.copyFile(r.fileId, carpeta, nombre);
        if (!saved) { omitidos.push({ etiqueta, motivo: 'no se pudo copiar en Drive' }); continue; }
        if (listado) {
            for (const p of previos) { const i = listado.indexOf(p); if (i >= 0) listado.splice(i, 1); }
            listado.push({ id: saved.id, name: nombre, webViewLink: saved.link });
        }
        const e = await ponerEnCarpetaE({ driveFolderId, carpetaE, n, prefijo, fileId: r.fileId, md5: meta.md5Checksum, nombre });
        copiados.push({ nombre, link: saved.link, enE: e.ok && !e.yaEstaba, faltaE: e.ok ? null : e.motivo });
    }
    return { copiados, omitidos };
}

const slotsDe = (inc) => {
    const ss = (Array.isArray(inc?.slots) ? inc.slots : []).filter(s => SLOTS_VALIDOS.includes(s));
    if (ss.length) return ss;
    return SLOTS_VALIDOS.includes(inc?.slot) ? [inc.slot] : [];
};

const esDescartada = (inc) => !!inc?.inexactitud?.descartada
    || /^descartada/i.test(String(inc?.resolucion || ''))
    || !!inc?.inexactitud?.cerrada_por_verificador;

/**
 * Al SUBSANAR una incidencia que viene de una inexactitud: copia a la carpeta de
 * su ronda los documentos de los que habla, si han cambiado desde el informe.
 * Lo llama PATCH /expedientes/:id/incidencias/:incId/resolver. No lanza.
 *
 * @returns {{ texto: string, copiados: Array, omitidos: Array }} `texto` va al hilo.
 */
async function copiarAlSubsanar({ expedienteId, inc }) {
    try {
        const supabase = require('./supabaseClient');
        const driveService = require('./driveService');
        const ronda = Number(inc?.inexactitud?.ronda) || 1;
        const { data: lote } = await supabase.from('lotes')
            .select('id, codigo, drive_folder_id, documentos_so').eq('id', inc.inexactitud.lote_id).maybeSingle();
        if (!lote) return { texto: 'No se ha copiado al requerimiento: el lote ya no existe.', copiados: [], omitidos: [] };
        const slots = slotsDe(inc);
        if (!slots.length) {
            return { texto: `No se ha copiado nada a «${CARPETA_REQUERIMIENTO(ronda)}» de ${lote.codigo}: la incidencia no señala ningún documento. Si se contesta con un papel, déjalo tú en esa carpeta.`, copiados: [], omitidos: [] };
        }
        const { data: exp } = await supabase.from('expedientes')
            .select('id, numero_expediente, oportunidad_id, instalacion, documentacion').eq('id', expedienteId).maybeSingle();
        if (!exp) return { texto: 'No se ha copiado al requerimiento: no se encuentra el expediente.', copiados: [], omitidos: [] };
        const carpeta = await carpetaDelRequerimiento(lote, ronda);
        const listado = (await driveService.listFiles(carpeta) || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
        const cods = slots.flatMap(s => PIEZAS_POR_SLOT[s] || []);
        const previas = await carpetasRondasPrevias(lote, ronda);
        const r = await copiarPiezas({ lote, exp, cods, desde: inc.inexactitud.desde, carpeta, listado, ronda, previas });
        const partes = [];
        if (r.copiados.length) partes.push(`Copiado a «${CARPETA_REQUERIMIENTO(ronda)}» de ${lote.codigo}: ${r.copiados.map(c => c.nombre).join(', ')}.`);
        const n = exp.instalacion?.verificacion?.orden_actuacion;
        const aE = r.copiados.filter(c => c.enE);
        if (aE.length) partes.push(`Y a la carpeta E${n} del expediente (la versión anterior, a E${n}/OLD): ${aE.map(c => c.nombre).join(', ')}.`);
        const sinE = r.copiados.filter(c => c.faltaE);
        if (sinE.length) partes.push(`No copiado a E${n}: ${sinE.map(c => `${c.nombre} — ${c.faltaE}`).join('; ')}.`);
        if (r.omitidos.length) partes.push(`No copiado: ${r.omitidos.map(o => `${o.etiqueta} — ${o.motivo}`).join('; ')}.`);
        return { texto: partes.join(' ') || 'Nada que copiar al requerimiento.', copiados: r.copiados, omitidos: r.omitidos };
    } catch (err) {
        console.warn('[inexactitudes] copiar al subsanar:', err.message);
        return { texto: `No se pudo copiar al requerimiento: ${err.message}`, copiados: [], omitidos: [] };
    }
}

/**
 * El Anexo I (listado de cesión) del LOTE vuelto a firmar → a la carpeta del
 * requerimiento ("E1a{N}-1-1 …") y a la "E{n}" de CADA expediente con su número
 * ("E3-1-1 …"), porque es del lote y va en todos los paquetes. Lo de antes, a
 * "E{n}/OLD". Solo el FIRMADO: el borrador `_revN` que se mandó a firmar no es lo
 * que se contesta, y `resolverPieza` cae a él cuando aún no ha vuelto (copiarlo a
 * las E{n} habría puesto un Anexo I sin firmar en todos los paquetes).
 *
 * @returns {{ copiado: object|null, motivo?: string }}
 */
async function colocarAnexoILote({ lote, exps, carpeta, listado, previas, desdeRonda, seco = false }) {
    const driveService = require('./driveService');
    const { INDICE, resolverPieza, nombreFinal } = require('./envioGestorService');
    const { carpetaDeExpediente } = require('./expedienteFolderSync');
    const pieza = INDICE.find(p => p.cod === '1-1');
    const d = (lote.documentos_so || []).find(x => x?.key === 'anexo_i');
    if (!d?.signed_link && !d?.signed_file_id) return { copiado: null, motivo: 'el Anexo I del lote no ha vuelto firmado' };
    // Sin el borrador, `resolverPieza` solo puede devolver el firmado.
    const r = await resolverPieza(pieza, { docsSo: [{ ...d, draft_link: null, draft_file_id: null }] });
    const fileId = r?.fileId;
    if (!fileId) return { copiado: null, motivo: 'el Anexo I del lote no ha vuelto firmado' };
    const meta = await driveService.getFileMetadata(fileId, 'id, name, createdTime, modifiedTime, trashed, md5Checksum');
    const cambiado = meta && !meta.trashed ? fechaDe(meta) : null;
    if (!cambiado) return { copiado: null, motivo: 'el Anexo I firmado ya no existe en Drive' };
    // Mismo criterio que las piezas del expediente: contra la copia del
    // paquete (E{n}-1-1 en la "E{n}" de un expediente) y las respuestas previas.
    const exp1 = exps.find(e => e.orden_actuacion);
    const carpetaE1 = exp1
        ? await driveService.findSubfolderByName(await carpetaDeExpediente(exp1), `E${exp1.orden_actuacion}`)
        : null;
    const carpetaE1Old = carpetaE1 ? await driveService.findSubfolderByName(carpetaE1, 'OLD') : null;
    const cache = new Map();
    const prefijo1 = `E${exp1?.orden_actuacion}-1-1 `;
    // Como en las piezas del expediente: lo de la E{n} que también está en la
    // carpeta de ESTA ronda lo pusimos nosotros y el verificador no lo ha visto.
    const deEstaRonda = await huellasEnviadas({ carpetas: [carpeta], prefijo: 'E1a', cache });
    const enviadas = new Map([
        ...[...(await huellasEnviadas({ carpetas: [carpetaE1], prefijo: prefijo1, cache }))].filter(([md5]) => !deEstaRonda.has(md5)),
        ...(await huellasEnviadas({ carpetas: [carpetaE1Old], prefijo: prefijo1, cache })),
        ...(await huellasEnviadas({ carpetas: previas, prefijo: 'E1a', cache })),
    ]);
    const nuevo = enviadas.size && meta.md5Checksum
        ? !enviadas.has(meta.md5Checksum)
        : cambiado > (Date.parse(desdeRonda || '') || 0);
    if (!nuevo) return { copiado: null, motivo: 'el Anexo I firmado es el mismo que ya vio el verificador' };

    const ns = exps.map(e => e.orden_actuacion).filter(Boolean);
    const rango = ns.length ? `E1a${Math.max(...ns)}` : 'E';
    const base = nombreFinal(pieza, r, { exp: {}, n: 0, lote }).replace(/^E0-1-1/, `${rango}-1-1`);
    const nombre = conRevision(base, meta.name);
    if (seco) return { copiado: { nombre, seco: true } };
    const previos = listado.filter(f => /^E1a\d+-1-1 /.test(f.name));
    // Con el mismo nombre no basta: el 22/10/2026 quedó en «1. REQUERIMIENTO» de
    // LOTE-2025-012 un «…_rev2_fdo» que era el BORRADOR sin firmar, y el firmado
    // que llega después se llama igual. Se compara el contenido.
    let mismo = null;
    for (const p of previos.filter(f => f.name === nombre)) {
        const m = await driveService.getFileMetadata(p.id, 'id, md5Checksum');
        if (m?.md5Checksum && m.md5Checksum === meta.md5Checksum) mismo = p;
    }
    let puesto = null;
    if (!mismo) {
        for (const p of previos) {
            try { await driveService.deleteFile(p.id); } catch (_) { /* noop */ }
            const i = listado.indexOf(p); if (i >= 0) listado.splice(i, 1);
        }
        const saved = await driveService.copyFile(fileId, carpeta, nombre);
        if (saved) { puesto = { nombre, link: saved.link }; listado.push({ id: saved.id, name: nombre, webViewLink: saved.link }); }
    } else puesto = { nombre, yaEstaba: true };
    if (!puesto) return { copiado: null, motivo: 'no se pudo copiar en Drive' };
    // Y en la "E{n}" de CADA expediente del lote, con su número (E3-1-1 …):
    // el listado es del lote y va en todos los paquetes. Lo de antes, a OLD.
    const enE = [];
    const faltaE = [];
    for (const e of exps.filter(x => x.orden_actuacion)) {
        const n = e.orden_actuacion;
        const nombreE = conRevision(nombreFinal(pieza, r, { exp: {}, n: 0, lote }).replace(/^E0-1-1/, `E${n}-1-1`), meta.name);
        try {
            const driveFolderId = await carpetaDeExpediente(e);
            if (!driveFolderId) { faltaE.push(`E${n}: el expediente no tiene carpeta en Drive`); continue; }
            const carpetaE = await driveService.findSubfolderByName(driveFolderId, `E${n}`);
            const x = await ponerEnCarpetaE({ driveFolderId, carpetaE, n, prefijo: `E${n}-1-1 `, fileId, md5: meta.md5Checksum, nombre: nombreE });
            if (!x.ok) faltaE.push(`E${n}: ${x.motivo}`);
            else if (!x.yaEstaba) enE.push(`E${n}`);
        } catch (err) { faltaE.push(`E${n}: ${err.message}`); }
    }
    return { copiado: { ...puesto, enE: enE.length ? enE : null, faltaE: faltaE.length ? faltaE : null } };
}

/**
 * A qué ronda de inexactitudes contesta un documento que se mandó a VOLVER a firmar:
 * la del último informe subido ANTES de pedir la re-firma. El `requerimiento_ronda`
 * que sella el reenvío NO es esto: es la marca de tiempo del envío (acota el enlace
 * de firma), no el nº del informe. Sin informe anterior, null (la re-firma no viene
 * de una inexactitud: no hay carpeta de requerimiento a la que vaya). Puro.
 */
function rondaDelRefirmado(docsSo, doc) {
    const pedido = Date.parse(doc?.requerimiento_at || doc?.sent_at || '') || 0;
    if (!pedido) return null;
    let ronda = null;
    for (const d of docsSo || []) {
        const n = rondaDeKey(d?.key);
        if (!n) continue;
        const subido = Date.parse(d.uploaded_at || '') || 0;
        if (subido && subido <= pedido && (!ronda || n > ronda)) ronda = n;
    }
    return ronda;
}

/**
 * Lo que el S.O. devuelve FIRMADO tras pedírselo por un requerimiento (ficha RES o
 * Anexo I del lote) SUSTITUYE en el paquete en cuanto se registra, venga por donde
 * venga (suelta en la fase 2, correo, enlace de firma, "Subir firmado"): la "E{n}"
 * del expediente queda con la última versión firmada —la anterior, a "E{n}/OLD"— y
 * la copia va también a "{ronda}. REQUERIMIENTO" (decisión del usuario, 23/10/2026:
 * «que lo sustituya en la carpeta E{n} que le corresponda, para que esa carpeta
 * siempre tenga la última versión de los documentos firmados»). Es lo mismo que
 * hacía «Preparar N. REQUERIMIENTO», pero sin esperar a que alguien lo pulse.
 *
 * Solo actúa sobre documentos con `requerimiento_at` (los que se volvieron a pedir):
 * un firmado de la primera ronda no tiene versión anterior que sustituir y su
 * paquete lo genera el botón de siempre (regla 40). No lanza.
 *
 * @returns {{ resultados: Array<{key, etiqueta, ronda, copiados, omitidos, motivo?}>, texto: string }}
 */
async function colocarRefirmados(loteId, docKeys, { seco = false, usuario = 'SISTEMA' } = {}) {
    const out = { resultados: [], texto: '' };
    try {
        const supabase = require('./supabaseClient');
        const driveService = require('./driveService');
        const { data: lote, error } = await supabase.from('lotes')
            .select('id, codigo, drive_folder_id, documentos_so, historial').eq('id', loteId).maybeSingle();
        if (error) throw error;
        if (!lote) throw new Error('Lote no encontrado');
        const docsSo = Array.isArray(lote.documentos_so) ? lote.documentos_so : [];
        const docs = [...new Set(docKeys || [])]
            .map(k => docsSo.find(d => d?.key === k))
            .filter(d => d && d.requerimiento_at && (d.signed_link || d.signed_file_id)
                && (d.key === 'anexo_i' || (String(d.key).startsWith('ficha_') && d.expediente_id)));
        if (!docs.length) return out;

        const exps = await expedientesDelLote(lote.id, { conDocumentacion: true });
        const porRonda = new Map();
        for (const d of docs) {
            const ronda = rondaDelRefirmado(docsSo, d);
            if (!ronda) {
                out.resultados.push({ key: d.key, etiqueta: d.label || d.key, ronda: null, copiados: [], omitidos: [],
                    motivo: 'no hay un informe de inexactitudes anterior a la re-firma: no se sabe a qué requerimiento contesta' });
                continue;
            }
            if (!porRonda.has(ronda)) porRonda.set(ronda, []);
            porRonda.get(ronda).push(d);
        }
        for (const [ronda, lista] of porRonda) {
            const informe = docsSo.find(x => x?.key === `informe_inexactitudes_${ronda}`);
            const desde = desdeDe(informe?.inexactitudes?.fecha, informe?.uploaded_at);
            const carpeta = seco
                ? await driveService.findSubfolderByName(lote.drive_folder_id, CARPETA_REQUERIMIENTO(ronda))
                : await carpetaDelRequerimiento(lote, ronda);
            const listado = carpeta
                ? (await driveService.listFiles(carpeta) || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
                : [];
            const previas = await carpetasRondasPrevias(lote, ronda);
            for (const d of lista) {
                const res = { key: d.key, etiqueta: d.label || d.key, ronda, copiados: [], omitidos: [] };
                if (d.key === 'anexo_i') {
                    const a = await colocarAnexoILote({ lote, exps, carpeta, listado, previas, desdeRonda: desde, seco });
                    if (a.copiado) res.copiados.push(a.copiado); else res.motivo = a.motivo;
                } else {
                    const exp = exps.find(e => e.id === d.expediente_id);
                    if (!exp) { res.motivo = 'el expediente ya no está en el lote'; out.resultados.push(res); continue; }
                    res.etiqueta = `${d.label || 'Ficha'}${d.label?.includes(exp.numero_expediente) ? '' : ` · ${exp.numero_expediente}`}`;
                    res.n = exp.orden_actuacion;
                    const r = await copiarPiezas({ lote, exp, cods: ['3-1'], desde, carpeta, listado, ronda, previas, seco });
                    res.copiados = r.copiados;
                    res.omitidos = r.omitidos;
                }
                out.resultados.push(res);
            }
        }

        const lineas = out.resultados.map(r => {
            const c = r.copiados[0];
            if (!c) return `${r.etiqueta}: no se ha colocado — ${r.motivo || r.omitidos.map(o => o.motivo).join('; ') || 'nada que copiar'}.`;
            const enE = Array.isArray(c.enE) ? c.enE.join(', ') : (c.enE ? `E${r.n}` : null);
            const faltaE = Array.isArray(c.faltaE) ? c.faltaE.join('; ') : c.faltaE;
            return `${r.etiqueta}: «${c.nombre}»${seco ? ' (en seco)' : ''} → ${CARPETA_REQUERIMIENTO(r.ronda)}`
                + `${enE ? ` y ${enE} (la anterior, a OLD)` : c.yaEstaba ? ' (ya estaba)' : ''}`
                + `${faltaE ? `; no copiado a la E: ${faltaE}` : ''}.`;
        });
        out.texto = lineas.join(' ');
        if (!seco && lineas.length) {
            const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
            historial.push({
                id: `${Date.now()}_refirmado_paquete`, tipo: 'sistema',
                texto: `Re-firmado al paquete: ${out.texto}`, fecha: nowIso(), usuario,
            });
            await supabase.from('lotes').update({ historial, updated_at: nowIso() }).eq('id', lote.id);
        }
    } catch (err) {
        console.warn('[inexactitudes] colocar re-firmados:', err.message);
        out.texto = `No se pudo colocar en el paquete lo re-firmado: ${err.message}`;
        out.error = err.message;
    }
    return out;
}

/**
 * Deja la carpeta "{ronda}. REQUERIMIENTO" lista para contestar:
 *   · los documentos de cada incidencia SUBSANADA de esa ronda que hayan cambiado
 *     desde el informe (lo que no se copió al subsanar porque aún no estaba firmado);
 *   · las fichas RES y el Anexo I del lote que el S.O. haya vuelto a firmar;
 *   · un ZIP con todo lo que haya en la carpeta (también lo que se dejó a mano,
 *     como el escrito de contestación).
 * Dice además qué incidencias siguen abiertas.
 */
async function prepararCarpetaRequerimiento(loteId, ronda, { zip = true, seco = false } = {}) {
    const supabase = require('./supabaseClient');
    const driveService = require('./driveService');
    const { data: lote, error } = await supabase.from('lotes')
        .select('id, codigo, drive_folder_id, documentos_so').eq('id', loteId).maybeSingle();
    if (error) throw error;
    if (!lote) throw new Error('Lote no encontrado');
    const informe = (lote.documentos_so || []).find(d => d?.key === `informe_inexactitudes_${ronda}`);
    if (!informe) throw new Error(`El lote no tiene el informe de inexactitudes ${ronda}`);
    const desdeRonda = desdeDe(informe.inexactitudes?.fecha, informe.uploaded_at);

    // En seco no se crea la carpeta: si no existe, se trabaja con una lista vacía.
    const carpeta = seco
        ? await driveService.findSubfolderByName(lote.drive_folder_id, CARPETA_REQUERIMIENTO(ronda))
        : await carpetaDelRequerimiento(lote, ronda);
    const listado = carpeta
        ? (await driveService.listFiles(carpeta) || []).filter(f => f.mimeType !== 'application/vnd.google-apps.folder')
        : [];
    const exps = await expedientesDelLote(lote.id, { conDocumentacion: true });
    const previas = await carpetasRondasPrevias(lote, ronda);

    const copiados = [];
    const omitidos = [];
    const pendientes = [];
    let subsanadas = 0;
    for (const exp of exps) {
        const incs = (exp.documentacion?.incidencias || [])
            .filter(i => i?.inexactitud?.lote_id === lote.id && Number(i.inexactitud.ronda) === Number(ronda));
        for (const i of incs.filter(x => x.estado !== 'SUBSANADA')) {
            pendientes.push({ numero_expediente: exp.numero_expediente, n: i.inexactitud.n, texto: i.texto, severidad: i.severidad });
        }
        const hechas = incs.filter(x => x.estado === 'SUBSANADA' && !esDescartada(x));
        subsanadas += hechas.length;
        // La ficha RES va siempre: si el S.O. la ha vuelto a firmar tras el
        // informe, es parte de la respuesta aunque no la cite ninguna incidencia.
        const cods = [...new Set([...hechas.flatMap(i => slotsDe(i).flatMap(s => PIEZAS_POR_SLOT[s] || [])), '3-1'])];
        const desde = hechas.reduce((m, i) => {
            const t = Date.parse(i.inexactitud.desde || '') || 0;
            return t && (!m || t < m) ? t : m;
        }, 0) || Date.parse(desdeRonda || '') || 0;
        const r = await copiarPiezas({ lote, exp, cods, desde: new Date(desde).toISOString(), carpeta, listado, ronda, previas, seco });
        copiados.push(...r.copiados);
        // La ficha añadida de oficio no se echa de menos si no ha cambiado.
        omitidos.push(...r.omitidos.filter(o => !(o.etiqueta.startsWith('Ficha RES') && !hechas.some(i => slotsDe(i).includes('ficha_res')))));
    }

    // El Anexo I (listado de cesión) del LOTE, si se ha vuelto a firmar.
    try {
        const a = await colocarAnexoILote({ lote, exps, carpeta, listado, previas, desdeRonda, seco });
        if (a.copiado) copiados.push(a.copiado);
    } catch (e) { console.warn('[inexactitudes] anexo I del lote:', e.message); }

    // El ZIP con todo lo que hay en la carpeta, para subirlo de una vez.
    let zipInfo = null;
    if (zip && !seco && carpeta) {
        const zipName = `${lote.codigo || 'LOTE'} - CONTESTACION A INEXACTITUDES.zip`;
        const ficheros = listado.filter(f => !/\.zip$/i.test(f.name));
        if (ficheros.length) {
            const { crearZip } = require('../utils/zipStore');
            const entradas = [];
            for (const f of ficheros) {
                const data = await driveService.getFileContent(f.id);
                if (data && data.length) entradas.push({ name: f.name, data });
            }
            if (entradas.length) {
                for (const p of (await driveService.findFilesByName(carpeta, zipName)) || []) {
                    try { await driveService.deleteFile(p); } catch (_) { /* noop */ }
                }
                const saved = await driveService.saveFileToFolder(carpeta, zipName, 'application/zip', crearZip(entradas));
                zipInfo = { nombre: zipName, ficheros: entradas.length, link: saved?.link || null };
            }
        }
    }

    let link = null;
    try { if (carpeta) link = await driveService.getWebViewLink(carpeta); } catch (_) { /* noop */ }
    return {
        seco,
        ronda,
        carpeta: { nombre: CARPETA_REQUERIMIENTO(ronda), link },
        subsanadas,
        pendientes,
        copiados,
        omitidos,
        zip: zipInfo,
        ficheros: listado.filter(f => !/\.zip$/i.test(f.name)).map(f => f.name).sort(),
    };
}

module.exports = {
    SLOTS_VALIDOS,
    PIEZAS_POR_SLOT,
    CARPETA_REQUERIMIENTO,
    documentosDeInexactitud,
    severidadDe,
    estaCerrada,
    actuacionesDe,
    casarInexactitudes,
    rondaDeKey,
    planIncidencias,
    conRevision,
    registrarInexactitudes,
    copiarAlSubsanar,
    prepararCarpetaRequerimiento,
    colocarRefirmados,
    rondaDelRefirmado,
    copiarPiezas,
};
