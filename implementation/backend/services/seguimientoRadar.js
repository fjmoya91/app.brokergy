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
// Qué estados admite un lote lo decide loteService, y se IMPORTA. Con una lista propia
// aquí, el parte mandaría a lotear lo que el backend rechaza (ver `detectarSinLotear`).
const { ESTADOS_COMPLETO } = require('./loteService');

const num = (v, def) => { const n = Number(v); return Number.isFinite(n) ? n : def; };

// Días que una línea desaparece del parte al pulsar "ahora no" en su página de acción.
const POSPONER_DIAS = num(process.env.RADAR_POSPONER_DIAS, 15);

// ─── Los bloques del parte ────────────────────────────────────────────────────
// `dias`      → PLAZO del bloque: a partir de ahí la línea se considera VENCIDA.
//               NO es un filtro de visibilidad (ver más abajo, "plazo ≠ mordaza").
// `reinsistir`→ tras avisar, cuántos días se calla antes de volver a ofrecer el botón.
//               null = no hay envío automatizable (la salida es abrir la app).
// `orden`     → los de arriba son los que más caro salen si se olvidan.
//
// REGLA — el PLAZO decide si se RECLAMA, nunca si se VE. Eran el mismo número y eso
// hacía la pantalla poco fiable: un CEE final con el visto bueno dado ayer no existía
// en ninguna parte hasta cumplir 2 días (medido el 07/09/2026 — 5 expedientes en esa
// situación y la pestaña enseñaba 2: se callaba 26RES060_119, _181 y _178). Tiene
// sentido no darle la lata al certificador por un registro que le pediste ayer; no lo
// tiene escondértelo a ti, que es justo lo que hay que ver para saber cómo vamos.
// Ahora el escaneo emite TODO y marca cada fila `vencida`. Quien reclama filtra por
// esa marca (`agruparPorDestinatario`, y el parte diario de WhatsApp/email), así que
// no sale ni un mensaje antes de tiempo; la pestaña las enseña separadas.
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
        // Plazo 0: esto no espera a nadie. El CEE ya está entregado y lo único que
        // falta es que lo mires TÚ, así que está vencido desde que entra.
        orden: 2, emoji: '🔴', titulo: 'CEE entregados y pendientes de TU revisión',
        dias: num(process.env.REVISION_ALERTA_DIAS, 0), reinsistir: null,
        nota: 'El certificador te los factura al entregarlos, no al revisarlos.',
    },
    OBRA_SIN_CERRAR: {
        orden: 3, emoji: '🟤', titulo: 'Obra terminada y CEE final sin encargar',
        dias: num(process.env.RADAR_OBRA_SIN_CERRAR_DIAS, 5), reinsistir: null,
        nota: 'Hay factura, CIFO o RITE: la obra está hecha y el CAE no avanza hasta encargar el CEE final.',
    },
    TRAMITACION: {
        // El expediente ya tiene su CEE final; lo que le falta es papeleo NUESTRO, y
        // nadie lo vigilaba. Ojo al reparto con FIRMA_PENDIENTE: aquél cubre lo que se
        // mandó a firmar y no ha vuelto; éste, lo que ni siquiera ha salido. Sin este
        // bloque, un CIFO que nunca se generó no lo reclamaba nadie (medido el
        // 07/09/2026: 11 de 19 expedientes en PTE FIN EXPTE sin CIFO firmado).
        orden: 4, emoji: '🟧', titulo: 'En tramitación, falta documentación por preparar',
        dias: num(process.env.RADAR_TRAMITACION_DIAS, 10), reinsistir: null,
        nota: 'Aún no se ha pedido: son documentos que tenemos que generar o enviar nosotros.',
    },
    SIN_LOTEAR: {
        // Aquí está el dinero parado: el CAE no se emite —y no se cobra— hasta que el
        // expediente entra en un lote y se verifica. Estaban COMPLETAMENTE fuera del
        // parte (28 expedientes el 07/09/2026, el más viejo de hacía dos meses).
        orden: 5, emoji: '💶', titulo: 'Documentación completa y sin lotear',
        dias: num(process.env.RADAR_SIN_LOTEAR_DIAS, 15), reinsistir: null,
        nota: 'Están listos: el CAE no se emite ni se cobra hasta que entran en un lote.',
    },
    REGISTRO: {
        orden: 6, emoji: '🟠', titulo: 'Con tu visto bueno y sin registrar en Industria',
        dias: num(process.env.RADAR_REGISTRO_DIAS, 2), reinsistir: num(process.env.RADAR_REGISTRO_REINSISTIR, 3),
        nota: null,
    },
    CERT_SIN_ENTREGAR: {
        orden: 7, emoji: '🟣', titulo: 'Encargados al certificador y sin entregar',
        dias: num(process.env.RADAR_CERT_DIAS, 10), reinsistir: num(process.env.RADAR_CERT_REINSISTIR, 7),
        nota: null,
    },
    SIN_ENCARGAR: {
        // Plazo 0, por el mismo motivo que REVISION: un expediente aceptado sin
        // encargar está parado desde el minuto uno y el encargo lo mandas TÚ.
        orden: 8, emoji: '⚪', titulo: 'Aceptados y sin encargar el CEE',
        dias: num(process.env.RADAR_SIN_ENCARGAR_DIAS, 0), reinsistir: null,
        nota: 'Nadie está trabajando en ellos todavía: el encargo no ha salido de aquí.',
    },
    MIGRADO_SIN_REVISAR: {
        orden: 9, emoji: '📦', titulo: 'Migrados y sin revisar',
        dias: num(process.env.RADAR_MIGRADO_DIAS, 15), reinsistir: null,
        nota: 'Llegaron del sistema antiguo y nadie los ha auditado todavía.',
    },
    FIRMA_PENDIENTE: {
        orden: 10, emoji: '🟡', titulo: 'Enviados a firma y sin devolver',
        dias: num(process.env.RADAR_FIRMA_DIAS, 7), reinsistir: num(process.env.RADAR_FIRMA_REINSISTIR, 7),
        nota: null,
    },
    COBRO: {
        // El final del ciclo, y el único bloque cuyo destinatario cobra dinero. Va
        // el último en el orden porque no es un atasco de tramitación: el expediente
        // está terminado. Pero SÍ tiene plazo 0 — el enlace lo mandamos nosotros y
        // hasta que el cliente no confirma la cuenta no se puede ordenar la
        // transferencia, así que está pendiente desde el minuto uno.
        orden: 12, emoji: '🏦', titulo: 'Verificados y sin confirmar los datos de cobro',
        dias: num(process.env.RADAR_COBRO_DIAS, 0), reinsistir: num(process.env.RADAR_COBRO_REINSISTIR, 7),
        nota: 'El CAE está concedido: falta que el cliente confirme el nº de cuenta antes de hacerle la transferencia.',
    },
    FIN_OBRA: {
        orden: 11, emoji: '🔵', titulo: 'CEE inicial registrado y obra sin terminar',
        dias: num(process.env.RADAR_FIN_OBRA_DIAS, 30), reinsistir: num(process.env.RADAR_FIN_OBRA_REINSISTIR, 15),
        nota: null,
    },
};


// Estados del LOTE en los que el CAE ya está concedido y toca pagarle al cliente.
// Fuente de la lista: los mismos que mueven la carpeta a 08/09 (ver "Carpetas de
// Drive por estado" en CLAUDE.md).
const LOTE_EN_PAGO = ['CAE EMITIDO – PTE PAGO BROKERGY', 'CAE EMITIDO - PTE PAGO BROKERGY', 'PTE. PAGO BROKERGY A CLIENTE'];

// Subestados por fase del CEE, agrupados por DE QUIÉN es la pelota.
const ESPERANDO_REVISION = ['PRESENTADO', 'PTE_REVISION'];   // la tiene Brokergy
const EN_CERTIFICADOR    = ['ASIGNADO', 'EN_TRABAJO', 'PTE_PRESENTACION'];
const FASES = [
    { key: 'cee_inicial', scope: 'inicial', label: 'CEE inicial' },
    { key: 'cee_final',   scope: 'final',   label: 'CEE final' },
];

const ts = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? 0 : t; };

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
        // Sin fecha de encargo NO se descarta, por el mismo motivo que en REVISION:
        // un CEE que le encargamos sin saber cuándo es más sospechoso, no menos. Se
        // descartaba, y con él el único expediente en esa situación (07/09/2026).
        const d = dias(desde);
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
    if (rankEstado(e.estado) > rankEstado('PTE. CEE INICIAL')) return;
    // TENER TÉCNICO NO ES HABERLE ENCARGADO. Esto salía por `if (e.certificador_id)
    // return` dando por hecho que con técnico puesto ya lo cubría otro bloque, y no:
    // `CERT_SIN_ENTREGAR` arranca en ASIGNADO, o sea cuando el encargo YA SALIÓ. Un
    // expediente con técnico elegido y el encargo sin mandar no lo miraba nadie
    // (medido el 07/09/2026: 26RES093_1 y 26RES060_128). Es el peor sitio donde
    // esconderse, porque en la ficha parece que está en marcha.
    const desde = desdeFase(e.seguimiento, 'cee_inicial') || e.created_at;
    const d = dias(desde);
    out.push(fila(e, 'SIN_ENCARGAR', {
        scope: 'inicial', desde, d,
        detalle: e.certificador_id ? 'Técnico asignado, encargo SIN ENVIAR' : 'Sin certificador asignado',
        responsable: 'BROKERGY',
        accion: { tipo: 'ver', label: e.certificador_id ? 'Enviar el encargo' : 'Encargar el CEE inicial' },
    }));
}

/** D' · Migrado del sistema antiguo que nadie ha auditado. */
function detectarMigradoSinRevisar(e, out) {
    if (e.estado !== 'PENDIENTE REVISAR EXPTE') return;
    const d = dias(e.created_at);
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
        // Tener un firmado no cierra la tarea si se la hemos vuelto a pedir: tras un
        // requerimiento del verificador que cambia el importe de la ayuda, el Anexo I,
        // el Convenio de Cesión y el CIFO se rehacen y hay que firmarlos otra vez — el
        // firmado que guardamos es de la versión anterior. Sin esto, el reenvío de una
        // re-firma no lo vigilaba nadie (mismo criterio que `estadoInstalador`).
        const refirma = ts(e[`${which}_refirma`]) > ts(e[`${which}_signed_ts`]);
        if (e[`${which}_signed`] && !refirma) continue;      // ya volvió firmado
        // La cuenta atrás la marca el ÚLTIMO gesto nuestro: en una re-firma, el envío
        // original es de hace meses y arrancaría el aviso con un retraso inventado.
        const enviado = refirma
            ? (ts(e[`${which}_sent`]) > ts(e[`${which}_refirma`]) ? e[`${which}_sent`] : e[`${which}_refirma`])
            : e[`${which}_sent`];
        if (!enviado) continue;                              // nunca se envió
        // Un rechazado sin reenviar sale en su propio bloque (más grave): allí el
        // enlace está bloqueado, así que insistirle al firmante no serviría de nada.
        if (e.rechazos?.[which]?.obsoleto) continue;
        const d = dias(enviado);

        const firmante = which === 'cert_cifo' ? 'INSTALADOR' : 'CLIENTE';
        const g = porFirmante.get(firmante) || { docs: [], desde: enviado, d, refirma: false };
        g.docs.push(spec.label);
        if (refirma) g.refirma = true;
        // Manda el que más lleva esperando: es el que marca la gravedad.
        if (d > g.d) { g.d = d; g.desde = enviado; }
        porFirmante.set(firmante, g);
    }

    for (const [firmante, g] of porFirmante) {
        out.push(fila(e, 'FIRMA_PENDIENTE', {
            scope: firmante, desde: g.desde, d: g.d,
            detalle: `${g.docs.join(' + ')} · ${g.refirma ? 'pendiente de volver a firmar (requerimiento)' : `sin devolver firmado${g.docs.length > 1 ? 's' : ''}`}`,
            responsable: firmante,
            accion: { tipo: 'recordar-firma', scope: firmante, label: `Recordar la firma (${firmante.toLowerCase()})` },
            aviso: ultimoAviso(e.recordatorios, `recordar-firma:${firmante}`),
        }));
    }
}


/**
 * L · CAE concedido y el cliente todavía no ha confirmado sus datos de cobro.
 *
 * REGLA — solo cuando el LOTE está en fase de pago. Antes de eso el importe no es
 * firme (el ahorro verificado puede moverlo) y pedirle la cuenta a alguien al que
 * todavía no vas a ingresarle nada es prometerle un dinero con fecha.
 *
 * El envío NO es automático: esto lo PROPONE y una persona da el visto bueno desde
 * la pestaña de Seguimiento o desde el enlace del parte. Es el último mensaje que
 * el cliente recibe antes de cobrar.
 */
function detectarCobro(e, out) {
    if (!LOTE_EN_PAGO.includes(e.lote_estado)) return;
    const c = e.cobro || {};
    if (c.completado_at) return;                 // ya lo ha contestado

    // La cuenta atrás arranca cuando el lote entra en fase de pago; si ya se le
    // pidió, desde la petición (para la ventana de reinsistencia).
    const desde = c.enviado_at || e.lote_desde || e.created_at;
    out.push(fila(e, 'COBRO', {
        scope: 'CLIENTE', desde, d: dias(desde),
        detalle: c.enviado_at
            ? `Se le pidió hace ${dias(c.enviado_at)} días y no lo ha confirmado`
            : 'Todavía no se le ha pedido que confirme el nº de cuenta',
        responsable: 'CLIENTE',
        accion: { tipo: 'pedir-cobro', scope: 'CLIENTE', label: 'Pedir los datos de cobro' },
        aviso: ultimoAviso(e.recordatorios, 'pedir-cobro:CLIENTE'),
    }));
}

/** F · Documento rechazado cuyo borrador sigue siendo el malo. */
function detectarRechazoSinReenviar(e, out) {
    for (const [which, r] of Object.entries(e.rechazos || {})) {
        if (!r?.obsoleto) continue;
        const d = dias(r.at);
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
    out.push(fila(e, 'FIN_OBRA', {
        scope: 'inicial', desde, d,
        detalle: `CEE inicial registrado hace ${d} días · sin señales de la obra`,
        responsable: e.instalador_id ? 'INSTALADOR' : 'CLIENTE',
        accion: { tipo: 'fin-obra', scope: 'inicial', label: 'Preguntar cómo va la obra' },
        aviso: ultimoAviso(e.recordatorios, 'fin-obra'),
    }));
}

/**
 * H · En tramitación: el CEE final ya está, y lo que falta es papeleo NUESTRO.
 *
 * REGLA — este bloque cubre lo que NO SE HA PEDIDO; `detectarFirmaPendiente` cubre lo
 * que se pidió y no ha vuelto. El reparto es por `_sent_at`, y no es un matiz: aquél
 * necesita que el documento haya salido, así que un CIFO que nunca se generó no lo
 * reclamaba NADIE. Con los dos, ningún documento se cae entre las dos sillas y no hay
 * expediente que salga por partida doble diciendo lo mismo.
 *
 * Los MIGRADOS de AppSheet quedan fuera a propósito: figuran como completos porque en
 * el sistema antiguo lo estaban, y su documentación vive en el Drive de entonces.
 * Listarles lo que "falta" serían 18 alarmas falsas (medido el 07/09/2026). Tampoco
 * entran en SIN_LOTEAR, porque su estado no es loteable: hoy no los vigila ningún
 * bloque, y hará falta uno propio en cuanto se decida qué hay que hacerles para
 * llevarlos a `DOC. COMPLETA`.
 */
const DOCS_TRAMITACION = [
    { which: 'cert_cifo', label: 'CIFO' },
    { which: 'anexo_i', label: 'Anexo I' },
    { which: 'anexo_cesion', label: 'Convenio de Cesión' },
    { which: 'anexo_fotografico', label: 'Anexo Fotográfico' },
];

function detectarTramitacion(e, out) {
    if (e.estado !== 'PTE FIN EXPTE' && e.estado !== 'REVISADO Y LISTO (FINAL)') return;
    if (e.lote_id) return;                       // ya está loteado: manda el lote

    const faltan = DOCS_TRAMITACION
        .filter(({ which }) => !e[`${which}_signed`] && !e[`${which}_sent`])
        .map(({ which, label }) => `${label} (${e[`${which}_at`] ? 'generado, sin enviar' : 'sin generar'})`);
    // El RITE solo cuenta MIENTRAS BLOQUEE. No lo emitimos nosotros —lo aporta el
    // instalador— pero sin él no se puede firmar el CIFO, porque su fecha va dentro
    // (regla del lifecycle). Con el CIFO ya firmado deja de ser una tarea: en
    // 26RES060_119 y _117 el CIFO está firmado y el RITE no consta, y listarlo sería
    // mandarte a por un papel que ya no desbloquea nada.
    if (!e.rite_link && !e.cert_cifo_signed) faltan.push('Certificado RITE (se lo pedimos al instalador)');
    if (!faltan.length) return;

    const desde = e.reg_fin || e.fecha_registro_ini || null;
    out.push(fila(e, 'TRAMITACION', {
        scope: null, desde, d: dias(desde),
        detalle: `Falta preparar: ${faltan.join(' · ')}`,
        responsable: 'BROKERGY',
        accion: { tipo: 'ver', label: 'Preparar la documentación' },
    }));
}

/**
 * I · Documentación completa y sin entrar en un lote.
 *
 * El único bloque que no habla de un documento sino de DINERO: el CAE no se emite
 * hasta que el expediente se lotea, se verifica y se sube al MITECO. Estaba fuera del
 * parte por completo — 28 expedientes el 07/09/2026, el más viejo desde hacía dos
 * meses —, así que la cola más cara de la casa no la veía nadie.
 *
 * REGLA — solo entra lo que de verdad SE PUEDE LOTEAR, y quien lo decide es
 * `loteService.ESTADOS_COMPLETO`: únicamente `DOC. COMPLETA`. La primera versión metía
 * aquí también los `DOC. COMPLETA APPSHEET` y eran 24 líneas que te mandaban a hacer
 * algo que el backend rechaza con un 400 ("Solo se pueden lotear expedientes
 * completos"). Un parte que propone acciones imposibles se deja de mirar entero, así
 * que la lista se IMPORTA y no se copia: si mañana se admite otro estado, el radar se
 * entera solo.
 *
 * La fecha es el último hito documental (registro del CEE final, o el inicial de
 * respaldo) y no `updated_at`, que se mueve cada vez que alguien abre y guarda la
 * ficha: eso rejuvenecería solo el expediente que más lleva esperando.
 */
function detectarSinLotear(e, out) {
    if (!ESTADOS_COMPLETO.includes(e.estado)) return;
    if (e.lote_id) return;
    const desde = e.reg_fin || e.fecha_registro_ini || null;
    out.push(fila(e, 'SIN_LOTEAR', {
        scope: null, desde, d: dias(desde),
        detalle: 'Documentación completa · listo para lotear',
        responsable: 'BROKERGY',
        accion: { tipo: 'ver', label: 'Meter en un lote' },
    }));
}

const DETECTORES = [
    detectarRechazoSinReenviar, detectarRevision, detectarRegistro,
    detectarCertSinEntregar, detectarSinEncargar, detectarMigradoSinRevisar,
    detectarFirmaPendiente, detectarFinObra, detectarTramitacion, detectarSinLotear,
    detectarCobro,
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
        // ¿Ha pasado ya el plazo del bloque? Es lo único que decide si se puede
        // RECLAMAR (y lo que va al parte diario); ver la regla al pie de BLOQUES.
        // Sin fecha cuenta como vencida: no saber desde cuándo espera algo es peor
        // que saberlo, y esconderlo hasta averiguarlo es la forma de no averiguarlo.
        vencida: extra.d === null || extra.d >= BLOQUES[bloque].dias,
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
            oportunidad_id, lote_id,
            oportunidades(instalador_asociado_id,prescriptor_id),
            certificador_id:cee->>certificador_id,
            fin_obra:documentacion->>fecha_fin_obra_comunicada,
            fecha_registro_ini:documentacion->>fecha_registro_cee_inicial,
            reg_fin:documentacion->>fecha_registro_cee_final,
            anexo_fotografico_sent:documentacion->>anexo_fotografico_sent_at,
            anexo_fotografico_signed:documentacion->>anexo_fotografico_signed_link,
            anexo_fotografico_at:documentacion->>anexo_fotografico_drive_link,
            facturas:documentacion->facturas,
            cifo_link:documentacion->>cert_cifo_drive_link,
            rite_link:documentacion->>cert_rite_drive_link,
            anexo_i_sent:documentacion->>anexo_i_sent_at,
            anexo_i_signed:documentacion->>anexo_i_signed_link,
            anexo_i_signed_ts:documentacion->>anexo_i_signed_at,
            anexo_i_refirma:documentacion->>anexo_i_refirma_at,
            anexo_i_at:documentacion->>anexo_i_drive_at,
            anexo_cesion_sent:documentacion->>anexo_cesion_sent_at,
            anexo_cesion_signed:documentacion->>anexo_cesion_signed_link,
            anexo_cesion_signed_ts:documentacion->>anexo_cesion_signed_at,
            anexo_cesion_refirma:documentacion->>anexo_cesion_refirma_at,
            anexo_cesion_at:documentacion->>anexo_cesion_drive_at,
            cert_cifo_sent:documentacion->>cert_cifo_sent_at,
            cert_cifo_signed:documentacion->>cert_cifo_signed_link,
            cert_cifo_signed_ts:documentacion->>cert_cifo_signed_at,
            cert_cifo_refirma:documentacion->>cert_cifo_refirma_at,
            cert_cifo_at:documentacion->>cert_cifo_drive_at,
            docs_rechazados:documentacion->docs_rechazados,
            cobro:documentacion->cobro,
            recordatorios:documentacion->recordatorios
        `.replace(/\s+/g, ''))
        .not('estado', 'in', `(${ESTADOS_FUERA.map(s => `"${s}"`).join(',')})`);

    if (error) throw new Error(error.message);

    const filas = [];
    // Estado del LOTE de cada expediente. Hace falta para el bloque COBRO: lo que
    // decide que toca pedirle los datos al cliente no es el expediente, es que su
    // lote haya llegado a la fase de pago. Una consulta, no N.
    const loteIds = [...new Set((exps || []).map(e => e.lote_id).filter(Boolean))];
    const lotesPorId = new Map();
    if (loteIds.length) {
        const { data: lotes, error: lErr } = await supabase
            .from('lotes').select('id, codigo, estado, updated_at').in('id', loteIds);
        if (lErr) console.warn('[Radar] lotes:', lErr.message);
        for (const l of lotes || []) lotesPorId.set(l.id, l);
    }

    for (const e of exps || []) {
        const lote = e.lote_id ? lotesPorId.get(e.lote_id) : null;
        e.lote_estado = lote?.estado || null;
        e.lote_codigo = lote?.codigo || null;
        // Cuándo entró el lote en su estado actual. `updated_at` se mueve con
        // cualquier guardado del lote, así que no es exacto: sirve para ordenar por
        // antigüedad, no para prometer un plazo.
        e.lote_desde = lote?.updated_at || null;

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

    // Destinatario y clave de grupo de una fila. `null` si no se le puede escribir.
    const claveDe = (f) => {
        if (!f.accion || f.accion.tipo === 'ver') return null;   // no hay nada que enviar
        const dest = f.responsable === 'CERTIFICADOR'
            ? { tipo: 'CERTIFICADOR', id: f.certificador_id, nombre: f.certificador_nombre }
            : f.responsable === 'INSTALADOR'
                ? { tipo: 'INSTALADOR', id: f.instalador_id, nombre: f.instalador_nombre }
                : { tipo: 'CLIENTE', id: f.cliente_id, nombre: f.cliente_nombre };
        // Sin destinatario identificable no se puede agrupar ni escribir: se queda
        // fuera de esta vista (sigue estando en la de bloques, que es diagnóstica).
        if (!dest.id) return null;
        // La clave NO lleva el `scope`: al mismo certificador se le reclama de una vez
        // el CEE inicial de una obra y el final de otra — es la misma petición
        // ("regístralos") y cada línea del mensaje ya dice de cuál se trata y lleva su
        // propio enlace. Sí separa por TIPO: pedir un registro y pedir una entrega son
        // mensajes distintos y no se pueden fundir.
        return { dest, clave: `${f.accion.tipo}:${dest.tipo}:${dest.id}` };
    };

    // ── 1ª pasada: lo VENCIDO, que es lo que crea el grupo y va marcado por defecto.
    for (const f of filas) {
        if (!f.vencida) continue;                              // aún en plazo: 2ª pasada
        if (silenciadaPor(f)) continue;                        // ya reclamado o pospuesto
        const k = claveDe(f);
        if (!k) continue;
        if (!g.has(k.clave)) {
            g.set(k.clave, {
                clave: k.clave, tipo: f.accion.tipo,
                bloque: f.bloque, def: BLOQUES[f.bloque],
                etiqueta: f.accion.label, destinatario: k.dest, filas: [], opcionales: [],
            });
        }
        g.get(k.clave).filas.push(f);
    }

    // ── 2ª pasada: lo que aún está EN PLAZO del mismo destinatario y la misma
    // petición. Va aparte (`opcionales`) y NUNCA crea grupo: si a alguien no hay nada
    // que reclamarle, no aparece su tarjeta.
    //
    // POR QUÉ existe: el plazo impide que el automático reclame antes de tiempo, pero
    // no debe impedir que lo decidas TÚ estando delante. Al certificador al que hoy le
    // reclamas dos registros puede quedarle un tercero de ayer, y mandarle los tres
    // juntos es UN mensaje en vez de dos — mejor para él y para ti. Van DESMARCADOS,
    // así que el comportamiento por defecto no cambia en nada.
    for (const f of filas) {
        if (f.vencida) continue;
        if (silenciadaPor(f)) continue;
        const k = claveDe(f);
        if (!k || !g.has(k.clave)) continue;                   // no crea grupo a propósito
        g.get(k.clave).opcionales.push(f);
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
