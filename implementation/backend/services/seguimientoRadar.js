// ─── seguimientoRadar — dónde está atascado cada expediente y de quién es la pelota
//
// Un expediente CAE pasa por seis manos (Brokergy, certificador, cliente, instalador,
// verificador, S.O.) y en cada traspaso puede quedarse parado sin que salte nada. Los
// atascos no dan error: simplemente el expediente deja de moverse y nadie se entera
// hasta que alguien lo mira. Este módulo los BUSCA; `seguimientoDiario` los cuenta.
//
// Cada detector responde a la misma pregunta: *¿de quién es la pelota y desde cuándo?*
// El resultado es una lista homogénea de filas, y cada fila sabe qué acción la
// desbloquea. Añadir un detector nuevo es añadir una entrada a BLOQUES y una función.
//
// UNA SOLA CONSULTA para todos los detectores: se leen los expedientes vivos una vez
// y los seis criterios corren en memoria. Y se leen CAMPOS CONCRETOS del JSONB, nunca
// `cee` ni `documentacion` enteros (regla 22 de CLAUDE.md: un select sobre muchas
// filas que toque un JSONB lo descomprime entero — `cee.xml_inicial` son megas).

const supabase = require('./supabaseClient');
const { rechazoBorrador, BORRADORES_CLIENTE } = require('../utils/docValidacion');
const { rankEstado } = require('../utils/expedienteEstados');

const num = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };

// Días que una línea desaparece del parte al pulsar "ahora no" en su página de acción.
const POSPONER_DIAS = num(process.env.RADAR_POSPONER_DIAS, 15);

// ─── Los bloques del parte ────────────────────────────────────────────────────
// `dias`      → a partir de cuántos días parado entra en el parte.
// `reinsistir`→ tras avisar, cuántos días se calla antes de volver a ofrecer el botón.
//               null = no hay envío automatizable (la salida es abrir la app).
// `orden`     → los de arriba son los que más caro salen si se olvidan.
const BLOQUES = {
    RECHAZO_SIN_REENVIAR: {
        orden: 1, emoji: '🛑', titulo: 'Rechazados y sin reenviar corregidos',
        dias: num(process.env.RADAR_RECHAZO_DIAS, 2), reinsistir: null,
        // Un rechazo bloquea el borrador del enlace público: el firmante que entra se
        // encuentra la puerta cerrada y el expediente se para EN SILENCIO. Es el
        // atasco más caro porque nadie de fuera puede reclamarlo.
        nota: 'El enlace de firma está BLOQUEADO hasta que se reenvíe el documento corregido.',
    },
    REVISION: {
        // SIN UMBRAL (0 días) a propósito, y es el único bloque así. Los demás
        // detectan algo PARADO —hay que esperar para saber que lo está—; éste no
        // espera nada de nadie: el CEE ya está entregado y lo único que falta es
        // que lo mires TÚ. Con 2 días, un CEE entregado esta mañana no aparecía al
        // pulsar "volver a escanear" y la pantalla parecía rota (medido el
        // 26/08/2026 con 26RES060_175, entregado a las 09:24, y 26RES060_156).
        // Vale para las dos superficies: la pestaña Seguimiento y el parte diario,
        // que va a nuestro propio chat — no es dar la lata a nadie, es la cola de
        // trabajo del día. Se puede volver a poner con REVISION_ALERTA_DIAS.
        orden: 2, emoji: '🔴', titulo: 'CEE entregados y pendientes de TU revisión',
        dias: num(process.env.REVISION_ALERTA_DIAS, 0), reinsistir: null,
        nota: 'El certificador te los factura al entregarlos, no al revisarlos.',
    },
    OBRA_SIN_CERRAR: {
        orden: 3, emoji: '🟤', titulo: 'Obra terminada y CEE final sin encargar',
        dias: num(process.env.RADAR_OBRA_SIN_CERRAR_DIAS, 5), reinsistir: null,
        nota: 'Hay factura, CIFO o RITE: la obra está hecha y el CAE no avanza hasta encargar el CEE final.',
    },
    REGISTRO: {
        orden: 4, emoji: '🟠', titulo: 'Con tu visto bueno y sin registrar en Industria',
        dias: num(process.env.RADAR_REGISTRO_DIAS, 2), reinsistir: num(process.env.RADAR_REGISTRO_REINSISTIR, 3),
        nota: null,
    },
    CERT_SIN_ENTREGAR: {
        orden: 5, emoji: '🟣', titulo: 'Encargados al certificador y sin entregar',
        dias: num(process.env.RADAR_CERT_DIAS, 10), reinsistir: num(process.env.RADAR_CERT_REINSISTIR, 7),
        nota: null,
    },
    SIN_ENCARGAR: {
        // SIN UMBRAL (0 días), por el mismo motivo que REVISION: esto no espera a
        // nadie. Un expediente aceptado sin certificador está parado desde el minuto
        // uno y el encargo lo tienes que mandar TÚ; esperar una semana para
        // enseñártelo solo garantiza que arranque una semana tarde. Con 7 días, lo
        // aceptado hoy no aparecía y la lista daba a entender que estaba todo
        // encargado. No molesta a nadie: la acción es 'ver' (abrir la app), así que
        // no sale en la vista de DESPACHAR ni dispara ningún mensaje.
        // Se puede volver a poner con RADAR_SIN_ENCARGAR_DIAS.
        orden: 6, emoji: '⚪', titulo: 'Aceptados y sin encargar el CEE',
        dias: num(process.env.RADAR_SIN_ENCARGAR_DIAS, 0), reinsistir: null,
        nota: 'Nadie está trabajando en ellos todavía: el encargo no ha salido de aquí.',
    },
    MIGRADO_SIN_REVISAR: {
        orden: 7, emoji: '📦', titulo: 'Migrados y sin revisar',
        dias: num(process.env.RADAR_MIGRADO_DIAS, 15), reinsistir: null,
        nota: 'Llegaron del sistema antiguo y nadie los ha auditado todavía.',
    },
    FIRMA_PENDIENTE: {
        orden: 8, emoji: '🟡', titulo: 'Enviados a firma y sin devolver',
        dias: num(process.env.RADAR_FIRMA_DIAS, 7), reinsistir: num(process.env.RADAR_FIRMA_REINSISTIR, 7),
        nota: null,
    },
    FIN_OBRA: {
        orden: 9, emoji: '🔵', titulo: 'CEE inicial registrado y obra sin terminar',
        dias: num(process.env.RADAR_FIN_OBRA_DIAS, 30), reinsistir: num(process.env.RADAR_FIN_OBRA_REINSISTIR, 15),
        nota: null,
    },
};

// Subestados por fase del CEE, agrupados por DE QUIÉN es la pelota.
const ESPERANDO_REVISION = ['PRESENTADO', 'PTE_REVISION'];   // la tiene Brokergy
const EN_CERTIFICADOR    = ['ASIGNADO', 'EN_TRABAJO', 'PTE_PRESENTACION'];
const FASES = [
    { key: 'cee_inicial', scope: 'inicial', label: 'CEE inicial' },
    { key: 'cee_final',   scope: 'final',   label: 'CEE final' },
];

const dias = (iso) => {
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86400000);
};

// Cuándo entró la fase en su subestado actual. `_desde` es el sello moderno; el mapa
// de timestamps es el respaldo de los expedientes anteriores a `seguimientoTracking`.
const desdeFase = (seg, key) => seg?.[`${key}_desde`] || seg?.[`${key}_ts`]?.[seg?.[key]] || null;

/**
 * ¿Se avisó ya de esto y hace cuántos días? El sello lo escribe `routes/acciones.js`
 * al confirmar el envío, en `documentacion.recordatorios`.
 * Sin esto, el mismo cliente recibiría un "¿cómo va la obra?" cada día que abras el
 * parte — que es exactamente la forma de que dejen de leernos.
 */
function ultimoAviso(recordatorios, claveAviso) {
    const r = recordatorios?.[claveAviso];
    if (!r?.at) return null;
    const d = dias(r.at);
    return d === null ? null : { dias: d, target: r.target || null, pospuesto: !!r.pospuesto };
}

// ─── Los detectores ───────────────────────────────────────────────────────────
// Cada uno recibe la fila cruda y empuja en `out` las líneas que encuentre.

/** A · CEE entregado por el certificador y esperando revisión interna. */
function detectarRevision(e, out) {
    for (const f of FASES) {
        const sub = e.seguimiento?.[f.key];
        if (!ESPERANDO_REVISION.includes(sub)) continue;
        const desde = desdeFase(e.seguimiento, f.key);
        const d = dias(desde);
        // Sin fecha NO se descarta: un CEE entregado del que no sabemos desde cuándo
        // espera es más sospechoso, no menos. Entra marcado "sin fecha".
        if (d !== null && d < BLOQUES.REVISION.dias) continue;
        out.push(fila(e, 'REVISION', {
            scope: f.scope, desde, d,
            detalle: `${f.label} · ${sub === 'PRESENTADO' ? 'presentado' : 'en revisión'}`,
            responsable: 'BROKERGY',
            accion: { tipo: 'ver', label: 'Revisar y dar el visto bueno' },
        }));
    }
}

/** B · Con el visto bueno dado y sin registrar en Industria. La pelota es del cert. */
function detectarRegistro(e, out) {
    for (const f of FASES) {
        if (e.seguimiento?.[f.key] !== 'REVISADO') continue;
        const desde = desdeFase(e.seguimiento, f.key);
        const d = dias(desde);
        if (d !== null && d < BLOQUES.REGISTRO.dias) continue;
        out.push(fila(e, 'REGISTRO', {
            scope: f.scope, desde, d,
            detalle: `${f.label} · visto bueno dado, falta registrar`,
            responsable: 'CERTIFICADOR',
            accion: { tipo: 'cert-registro', scope: f.scope, label: 'Recordar al certificador' },
            aviso: ultimoAviso(e.recordatorios, `cert-registro:${f.scope}`),
        }));
    }
}

/** C · Encargado al certificador y sin entregar el .cex. */
function detectarCertSinEntregar(e, out) {
    for (const f of FASES) {
        const sub = e.seguimiento?.[f.key];
        if (!EN_CERTIFICADOR.includes(sub)) continue;
        const desde = desdeFase(e.seguimiento, f.key);
        const d = dias(desde);
        if (d === null || d < BLOQUES.CERT_SIN_ENTREGAR.dias) continue;
        // La última comunicación cuenta como aviso aunque saliera desde la app: si le
        // escribiste ayer desde el expediente, el parte no te ofrece escribirle otra vez.
        const contacto = dias(e.seguimiento?.[`${f.key}_last_contacto_at`]);
        out.push(fila(e, 'CERT_SIN_ENTREGAR', {
            scope: f.scope, desde, d,
            detalle: `${f.label} · ${sub === 'ASIGNADO' ? 'encargado, sin arrancar' : sub === 'EN_TRABAJO' ? 'en trabajo' : 'pendiente de subir el .cex'}`,
            responsable: 'CERTIFICADOR',
            accion: { tipo: 'cert-emision', scope: f.scope, label: 'Pedir fecha de entrega' },
            aviso: ultimoAviso(e.recordatorios, `cert-emision:${f.scope}`)
                || (contacto !== null ? { dias: contacto, target: 'CERTIFICADOR' } : null),
        }));
    }
}

/** D · Expediente aceptado cuyo encargo nunca ha salido de Brokergy. */
function detectarSinEncargar(e, out) {
    // Un MIGRADO no necesita encargo: su CEE ya se hizo en el sistema antiguo. Lo que
    // le falta es que alguien lo revise, y de eso va `detectarMigradoSinRevisar`.
    // Sin esta salida, los 15 migrados pendientes aparecían aquí pidiendo un CEE que
    // ya existe.
    if (e.estado === 'PENDIENTE REVISAR EXPTE') return;
    const sub = e.seguimiento?.cee_inicial;
    // Un expediente recién creado no trae subestado: 'sin nada' también es 'sin encargar'.
    if (sub && sub !== 'PTE_ENVIO_CERT') return;
    if (e.certificador_id) return;              // ya tiene certificador: es otro bloque
    if (rankEstado(e.estado) > rankEstado('PTE. CEE INICIAL')) return;
    const desde = desdeFase(e.seguimiento, 'cee_inicial') || e.created_at;
    const d = dias(desde);
    if (d === null || d < BLOQUES.SIN_ENCARGAR.dias) return;
    out.push(fila(e, 'SIN_ENCARGAR', {
        scope: 'inicial', desde, d,
        detalle: 'Sin certificador asignado',
        responsable: 'BROKERGY',
        accion: { tipo: 'ver', label: 'Encargar el CEE inicial' },
    }));
}

/** D' · Migrado del sistema antiguo que nadie ha auditado. */
function detectarMigradoSinRevisar(e, out) {
    if (e.estado !== 'PENDIENTE REVISAR EXPTE') return;
    const d = dias(e.created_at);
    if (d === null || d < BLOQUES.MIGRADO_SIN_REVISAR.dias) return;
    out.push(fila(e, 'MIGRADO_SIN_REVISAR', {
        scope: null, desde: e.created_at, d,
        detalle: 'Migrado, pendiente de auditar',
        responsable: 'BROKERGY',
        accion: { tipo: 'ver', label: 'Auditar el expediente' },
    }));
}

/**
 * E · Documentos enviados a firma que no han vuelto firmados.
 *
 * Se agrupan POR FIRMANTE, no por documento. Al cliente le pueden faltar a la vez el
 * Anexo I y la Cesión, y son DOS líneas del mismo problema: los firma de una sentada
 * en el mismo enlace. Una fila por documento significaba dos recordatorios al mismo
 * cliente el mismo día, cada uno diciéndole que le falta "un" documento.
 */
function detectarFirmaPendiente(e, out) {
    const porFirmante = new Map();     // 'CLIENTE'|'INSTALADOR' → { docs[], desde, d }

    for (const [which, spec] of Object.entries(BORRADORES_CLIENTE)) {
        if (e[`${which}_signed`]) continue;                  // ya volvió firmado
        const enviado = e[`${which}_sent`];
        if (!enviado) continue;                              // nunca se envió
        // Un rechazado sin reenviar sale en su propio bloque (más grave): allí el
        // enlace está bloqueado, así que insistirle al firmante no serviría de nada.
        if (e.rechazos?.[which]?.obsoleto) continue;
        const d = dias(enviado);
        if (d === null || d < BLOQUES.FIRMA_PENDIENTE.dias) continue;

        const firmante = which === 'cert_cifo' ? 'INSTALADOR' : 'CLIENTE';
        const g = porFirmante.get(firmante) || { docs: [], desde: enviado, d };
        g.docs.push(spec.label);
        // Manda el que más lleva esperando: es el que marca la gravedad.
        if (d > g.d) { g.d = d; g.desde = enviado; }
        porFirmante.set(firmante, g);
    }

    for (const [firmante, g] of porFirmante) {
        out.push(fila(e, 'FIRMA_PENDIENTE', {
            scope: firmante, desde: g.desde, d: g.d,
            detalle: `${g.docs.join(' + ')} · sin devolver firmado${g.docs.length > 1 ? 's' : ''}`,
            responsable: firmante,
            accion: { tipo: 'recordar-firma', scope: firmante, label: `Recordar la firma (${firmante.toLowerCase()})` },
            aviso: ultimoAviso(e.recordatorios, `recordar-firma:${firmante}`),
        }));
    }
}

/** F · Documento rechazado cuyo borrador sigue siendo el malo. */
function detectarRechazoSinReenviar(e, out) {
    for (const [which, r] of Object.entries(e.rechazos || {})) {
        if (!r?.obsoleto) continue;
        const d = dias(r.at);
        if (d === null || d < BLOQUES.RECHAZO_SIN_REENVIAR.dias) continue;
        out.push(fila(e, 'RECHAZO_SIN_REENVIAR', {
            scope: which, desde: r.at, d,
            detalle: `${r.label} · rechazado${r.motivo ? `: ${r.motivo}` : ''}`,
            responsable: 'BROKERGY',
            // No hay envío automatizable: hay que CORREGIR el dato y regenerar el
            // documento. Mandar un recordatorio a secas devolvería al firmante a un
            // enlace bloqueado, que es justo el problema.
            accion: { tipo: 'ver', label: 'Corregir y reenviar' },
        }));
    }
}

/**
 * G · Tras el CEE inicial registrado, la obra no se ha cerrado. Dos casos MUY
 * distintos que antes se mezclaban en uno solo:
 *
 *   · Sin ninguna huella de obra ejecutada  → hay que preguntar FUERA (cliente /
 *     instalador): ¿cómo va aquello?
 *   · Con factura, CIFO o RITE ya subidos   → la obra está HECHA y lo único que falta
 *     es encargar el CEE final. La pelota es nuestra.
 *
 * La distinción no es cosmética: de los 25 casos reales, 9 tenían ya la factura. A
 * ésos preguntarles "¿cómo va la obra?" es quedar mal con quien ya cumplió, y además
 * esconde el atasco verdadero, que está en nuestro tejado.
 */
function detectarFinObra(e, out) {
    if (e.seguimiento?.cee_inicial !== 'REGISTRADO') return;
    // Si el CEE final ya está encargado, esto ya se movió: no hay nada que reclamar.
    const subFinal = e.seguimiento?.cee_final;
    if (subFinal && subFinal !== 'PTE_ENVIO_CERT') return;
    if (rankEstado(e.estado) > rankEstado('PTE. CEE FINAL')) return;

    const obraHecha = !!e.fin_obra
        || (Array.isArray(e.facturas) && e.facturas.length > 0)
        || !!e.cert_cifo_sent || !!e.cifo_link || !!e.rite_link;

    if (obraHecha) {
        // Desde el hito más reciente que demuestra que la obra acabó.
        const desde = e.fin_obra || e.cert_cifo_sent || e.fecha_registro_ini
            || e.seguimiento?.cee_inicial_ts?.REGISTRADO;
        const d = dias(desde);
        if (d === null || d < BLOQUES.OBRA_SIN_CERRAR.dias) return;
        const prueba = e.fin_obra ? 'fin de obra comunicado'
            : (Array.isArray(e.facturas) && e.facturas.length) ? `${e.facturas.length} factura${e.facturas.length === 1 ? '' : 's'} subida${e.facturas.length === 1 ? '' : 's'}`
            : (e.cert_cifo_sent || e.cifo_link) ? 'CIFO generado' : 'RITE subido';
        out.push(fila(e, 'OBRA_SIN_CERRAR', {
            scope: 'final', desde, d,
            detalle: `${prueba} · CEE final sin encargar`,
            responsable: 'BROKERGY',
            accion: { tipo: 'ver', label: 'Encargar el CEE final' },
        }));
        return;
    }

    const desde = e.fecha_registro_ini || e.seguimiento?.cee_inicial_ts?.REGISTRADO || desdeFase(e.seguimiento, 'cee_inicial');
    const d = dias(desde);
    if (d === null || d < BLOQUES.FIN_OBRA.dias) return;
    out.push(fila(e, 'FIN_OBRA', {
        scope: 'inicial', desde, d,
        detalle: `CEE inicial registrado hace ${d} días · sin señales de la obra`,
        responsable: e.instalador_id ? 'INSTALADOR' : 'CLIENTE',
        accion: { tipo: 'fin-obra', scope: 'inicial', label: 'Preguntar cómo va la obra' },
        aviso: ultimoAviso(e.recordatorios, 'fin-obra'),
    }));
}

const DETECTORES = [
    detectarRechazoSinReenviar, detectarRevision, detectarRegistro,
    detectarCertSinEntregar, detectarSinEncargar, detectarMigradoSinRevisar,
    detectarFirmaPendiente, detectarFinObra,
];

/** Fila homogénea del parte. Los nombres se rellenan después, en bloque. */
function fila(e, bloque, extra) {
    return {
        bloque,
        expediente_id: e.id,
        numero_expediente: e.numero_expediente,
        estado: e.estado,
        cliente_id: e.cliente_id,
        certificador_id: e.certificador_id || null,
        instalador_id: e.instalador_id || null,
        direccion: (e.instalacion?.direccion || '').trim() || null,
        municipio: (e.instalacion?.municipio || '').trim() || null,
        dias: extra.d ?? null,
        sin_fecha: extra.d === null,
        desde: extra.desde || null,
        scope: extra.scope || null,
        detalle: extra.detalle,
        responsable: extra.responsable,
        accion: extra.accion || null,
        aviso: extra.aviso || null,
    };
}

// ─── Escaneo ──────────────────────────────────────────────────────────────────

// Estados en los que ya no hay nada que vigilar aquí: el expediente está cerrado o en
// manos del verificador / del S.O. (ese tramo es otro problema, con otros plazos).
const ESTADOS_FUERA = ['FINALIZADO', 'PTE. PAGO BROKERGY A CLIENTE', 'CAE EMITIDO – PTE PAGO BROKERGY'];

/**
 * Escanea la cartera y devuelve todo lo atascado.
 * @param {{soloBloques?: string[]}} [opts]
 * @returns {Promise<Array>} filas ordenadas por bloque y, dentro, por días parado
 */
async function escanear(opts = {}) {
    const { data: exps, error } = await supabase
        .from('expedientes')
        // Campos CONCRETOS del JSONB: `cee` entero lleva el XML del CEE (megas) y
        // `documentacion` puede llegar a 2 MB. Ver regla 22.
        .select(`
            id, numero_expediente, estado, cliente_id, created_at, seguimiento, instalacion,
            oportunidad_id,
            oportunidades(instalador_asociado_id,prescriptor_id),
            certificador_id:cee->>certificador_id,
            fin_obra:documentacion->>fecha_fin_obra_comunicada,
            fecha_registro_ini:documentacion->>fecha_registro_cee_inicial,
            facturas:documentacion->facturas,
            cifo_link:documentacion->>cert_cifo_drive_link,
            rite_link:documentacion->>cert_rite_drive_link,
            anexo_i_sent:documentacion->>anexo_i_sent_at,
            anexo_i_signed:documentacion->>anexo_i_signed_link,
            anexo_i_at:documentacion->>anexo_i_drive_at,
            anexo_cesion_sent:documentacion->>anexo_cesion_sent_at,
            anexo_cesion_signed:documentacion->>anexo_cesion_signed_link,
            anexo_cesion_at:documentacion->>anexo_cesion_drive_at,
            cert_cifo_sent:documentacion->>cert_cifo_sent_at,
            cert_cifo_signed:documentacion->>cert_cifo_signed_link,
            cert_cifo_at:documentacion->>cert_cifo_drive_at,
            docs_rechazados:documentacion->docs_rechazados,
            recordatorios:documentacion->recordatorios
        `.replace(/\s+/g, ''))
        .not('estado', 'in', `(${ESTADOS_FUERA.map(s => `"${s}"`).join(',')})`);

    if (error) throw new Error(error.message);

    const filas = [];
    for (const e of exps || []) {
        // El instalador no vive en el expediente sino en su oportunidad. `prescriptor_id`
        // es el respaldo histórico (antes de existir instalador_asociado_id); el 1 es el
        // pseudo-partner de Brokergy y no es un instalador real.
        const insId = e.oportunidades?.instalador_asociado_id || e.oportunidades?.prescriptor_id || null;
        e.instalador_id = (insId && String(insId) !== '1') ? insId : null;

        // `rechazoBorrador` espera el objeto `documentacion`; se le reconstruye el
        // trocito que necesita a partir de los campos planos que sí hemos traído.
        e.rechazos = {};
        for (const which of Object.keys(BORRADORES_CLIENTE)) {
            const r = rechazoBorrador({
                docs_rechazados: e.docs_rechazados || {},
                [`${which}_sent_at`]: e[`${which}_sent`],
                [`${which}_drive_at`]: e[`${which}_at`],
            }, which);
            if (r) e.rechazos[which] = r;
        }
        for (const detectar of DETECTORES) {
            try { detectar(e, filas); }
            catch (err) { console.warn(`[Radar] ${detectar.name} en ${e.numero_expediente}:`, err.message); }
        }
    }

    const soloBloques = opts.soloBloques?.length ? new Set(opts.soloBloques) : null;
    const out = soloBloques ? filas.filter(f => soloBloques.has(f.bloque)) : filas;

    await rellenarNombres(out);
    // Por gravedad del bloque y, dentro, lo que más lleva parado primero. Los de fecha
    // desconocida al final: no se pueden ordenar, pero tampoco esconder.
    out.sort((a, b) =>
        (BLOQUES[a.bloque].orden - BLOQUES[b.bloque].orden) || ((b.dias ?? -1) - (a.dias ?? -1)));
    return out;
}

/** Nombres de cliente y certificador en dos consultas, no en N. */
async function rellenarNombres(filas) {
    if (!filas.length) return;

    const cliIds = [...new Set(filas.map(f => f.cliente_id).filter(Boolean))];
    if (cliIds.length) {
        const { data } = await supabase
            .from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos, direccion, municipio')
            .in('id_cliente', cliIds);
        const map = new Map((data || []).map(c => [c.id_cliente, c]));
        for (const f of filas) {
            const c = map.get(f.cliente_id);
            if (!c) continue;
            f.cliente_nombre = `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() || null;
            f.direccion = f.direccion || (c.direccion || '').trim() || null;
            f.municipio = f.municipio || (c.municipio || '').trim() || null;
        }
    }

    // Certificadores e instaladores viven en la MISMA tabla: una sola consulta.
    const partnerIds = [...new Set(filas.flatMap(f => [f.certificador_id, f.instalador_id]).filter(Boolean))];
    if (partnerIds.length) {
        const { data } = await supabase
            .from('prescriptores')
            .select('id_empresa, razon_social, acronimo')
            .in('id_empresa', partnerIds);
        const map = new Map((data || []).map(p => [String(p.id_empresa), p]));
        const nombre = (id) => { const p = map.get(String(id)); return p?.razon_social || p?.acronimo || null; };
        for (const f of filas) {
            if (f.certificador_id) f.certificador_nombre = nombre(f.certificador_id);
            if (f.instalador_id) f.instalador_nombre = nombre(f.instalador_id);
        }
    }
}

/**
 * Agrupa lo ACCIONABLE por (tipo de acción + persona concreta a la que hay que
 * escribir). Es la vista de "despachar", frente a `agruparPorBloque`, que es la de
 * "diagnosticar".
 *
 * Por qué importa: un certificador con cuatro expedientes sin registrar no necesita
 * cuatro WhatsApps idénticos con un número distinto cada uno — necesita UNO con la
 * lista. Mandarle cuatro es ruido para él y cuatro confirmaciones para nosotros, y
 * encima invita a que conteste solo al último.
 *
 * La clave incluye el TIPO porque a un mismo certificador se le puede deber una cosa
 * de registro y otra de emisión: son mensajes distintos y no se pueden fundir.
 * El cliente casi siempre sale en grupos de uno; se agrupa igual por uniformidad.
 *
 * @returns {Array<{clave, tipo, bloque, def, destinatario:{tipo,id,nombre}, filas}>}
 */
function agruparPorDestinatario(filas) {
    const g = new Map();
    for (const f of filas) {
        if (!f.accion || f.accion.tipo === 'ver') continue;   // no hay nada que enviar
        if (silenciadaPor(f)) continue;                        // ya reclamado o pospuesto

        const dest = f.responsable === 'CERTIFICADOR'
            ? { tipo: 'CERTIFICADOR', id: f.certificador_id, nombre: f.certificador_nombre }
            : f.responsable === 'INSTALADOR'
                ? { tipo: 'INSTALADOR', id: f.instalador_id, nombre: f.instalador_nombre }
                : { tipo: 'CLIENTE', id: f.cliente_id, nombre: f.cliente_nombre };
        // Sin destinatario identificable no se puede agrupar ni escribir: se queda
        // fuera de esta vista (sigue estando en la de bloques, que es diagnóstica).
        if (!dest.id) continue;

        // La clave NO lleva el `scope`: al mismo certificador se le reclama de una vez
        // el CEE inicial de una obra y el final de otra — es la misma petición
        // ("regístralos") y cada línea del mensaje ya dice de cuál se trata y lleva su
        // propio enlace. Sí separa por TIPO: pedir un registro y pedir una entrega son
        // mensajes distintos y no se pueden fundir.
        const clave = `${f.accion.tipo}:${dest.tipo}:${dest.id}`;
        if (!g.has(clave)) {
            g.set(clave, {
                clave, tipo: f.accion.tipo,
                bloque: f.bloque, def: BLOQUES[f.bloque],
                etiqueta: f.accion.label, destinatario: dest, filas: [],
            });
        }
        g.get(clave).filas.push(f);
    }

    return [...g.values()]
        .map(x => {
            const scopes = [...new Set(x.filas.map(f => f.scope).filter(Boolean))];
            return {
                ...x,
                // `scope` solo cuando todas las filas coinciden. Si el grupo mezcla,
                // manda el de cada fila (ver `enviarLote`): sellar todo el grupo con
                // uno solo marcaría la fase equivocada en la mitad de ellos.
                scope: scopes.length === 1 ? scopes[0] : null,
                dias: Math.max(...x.filas.map(f => f.dias ?? 0)),
            };
        })
        // Primero el bloque más grave y, dentro, el grupo que más lleva esperando.
        .sort((a, b) => (a.def.orden - b.def.orden) || (b.dias - a.dias));
}

/** Agrupa por bloque, en el orden del parte. Devuelve [{ bloque, def, filas }]. */
function agruparPorBloque(filas) {
    const g = new Map();
    for (const f of filas) {
        if (!g.has(f.bloque)) g.set(f.bloque, []);
        g.get(f.bloque).push(f);
    }
    return [...g.entries()]
        .sort((a, b) => BLOQUES[a[0]].orden - BLOQUES[b[0]].orden)
        .map(([bloque, items]) => ({ bloque, def: BLOQUES[bloque], filas: items }));
}

/**
 * ¿Se le ofrece el botón a esta fila, o ya se ha reclamado / se ha pospuesto?
 * Devuelve null si toca ofrecerlo; si no, el texto de por qué no.
 */
function silenciadaPor(f) {
    if (!f.aviso) return null;
    // Posponer ("ahora no") silencia su propia ventana, más larga que la de
    // reinsistencia: es una decisión explícita de no reclamar todavía, no el rastro
    // de haber reclamado.
    const ventana = f.aviso.pospuesto ? POSPONER_DIAS : BLOQUES[f.bloque]?.reinsistir;
    if (!ventana || f.aviso.dias >= ventana) return null;
    if (f.aviso.pospuesto) return `pospuesto, quedan ${ventana - f.aviso.dias} días`;
    return f.aviso.dias === 0 ? 'avisado hoy' : `avisado hace ${f.aviso.dias} día${f.aviso.dias === 1 ? '' : 's'}`;
}

module.exports = {
    escanear, agruparPorBloque, agruparPorDestinatario, silenciadaPor,
    BLOQUES, dias, POSPONER_DIAS,
};
