// ============================================================================
// recepcionCobroService.js — ¿le ha LLEGADO el ingreso? (24/10/2026, Fran)
// ----------------------------------------------------------------------------
// Después de la carta de pago, un flujo cerrado para que el cliente acabe
// contento y deje reseña:
//
//   1. RECORDATORIO a los 2 días hábiles (lo programa el popup del aviso y lo
//      despacha `pagoClientesService.barrer`): «¿te ha llegado? → aquí».
//   2. PÁGINA /cobro/:id/recibido?token= — «Sí, me ha llegado» / «Todavía no».
//      «Todavía no» avisa al equipo en el momento.
//   3. RESEÑA arriba («Ya la he dejado») y su DOCUMENTACIÓN debajo (el portal,
//      con la guía para la Renta).
//
// Todo se SELLA en `documentacion.cobro` (RPC de merge): `recepcion` y
// `resena_cliente`, y la fase 7 del lote lo enseña por cliente.
//
// REGLA — la reseña NO es la llave de los documentos: Google prohíbe pedirla a
// cambio de algo y los certificados son del cliente. La página pone la reseña
// arriba y la documentación debajo; nunca se le esconde.
//
// REGLA — «Ya la he dejado» es lo que DICE el cliente: Google no nos dice quién
// ha escrito cada reseña. Se enseña como «dice que dejó reseña».
//
// Mismo token que el formulario de cobro (`cobro.token`, comparado en tiempo
// constante en la ruta).
// ============================================================================

const cobroService = require('./cobroService');

const FRONTEND = () => (process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/$/, '');

const enlaceRecibido = (expId, token) => `${FRONTEND()}/cobro/${expId}/recibido?token=${token}`;

/**
 * El enlace del portal del cliente (`/mi-expediente/:uuid?token=`). Con `crear`
 * genera el token de la oportunidad si no lo tiene (idempotente); sin él, solo lo
 * lee (para lo que se hace en seco).
 */
async function enlacePortal(exp, { crear = true } = {}) {
    if (!exp?.oportunidad_id) return null;
    const ru = require('./reformaUploadService');
    const subir = crear ? await ru.ensureUploadLink(exp.oportunidad_id) : await ru.uploadLinkSiExiste(exp.oportunidad_id);
    return subir && subir.includes('/subir-docs/') ? subir.replace('/subir-docs/', '/mi-expediente/') : null;
}

const importeDe = (cobro = {}) => cobro.transferencia?.importe ?? cobro.remesa?.importe ?? null;

/**
 * El enlace CORTO de la página (`/r/XXXXXXXX`, enlaceCorto.js): el largo con token
 * parece un timo en un WhatsApp. Uno por expediente, sellado en `cobro.enlace_recibido`;
 * sin `crear` (en seco) solo se lee, y si no hay, el largo.
 */
async function enlaceParaMensaje(exp, { crear = true } = {}) {
    const cobro = exp.documentacion?.cobro || {};
    if (cobro.enlace_recibido?.url) return cobro.enlace_recibido.url;
    const token = crear ? await cobroService.ensureToken(exp) : cobro.token;
    if (!token) return '(enlace)';
    const largo = enlaceRecibido(exp.id, token);
    if (!crear) return largo;
    try {
        const corto = await require('./enlaceCorto').crear(largo, { expedienteId: exp.id, tipo: 'recibido' });
        await cobroService.sellar(exp.id, { enlace_recibido: { codigo: corto.codigo, url: corto.url, at: new Date().toISOString() } });
        return corto.url;
    } catch (e) {
        console.warn('[recepción] enlace corto:', e.message);
        return largo;
    }
}

// ─── La prueba social: cuántas familias YA han cobrado con BROKERGY ───────────
// Cifra REAL, nunca inventada: los expedientes FINALIZADOS más los ya transferidos
// de los lotes en pago (sin recorrer `documentacion` de toda la tabla: regla 22).
// Se redondea hacia abajo a la decena («más de 60») y por debajo de 20 no se dice.
let _familias = { n: null, at: 0 };
async function familiasCobradas() {
    if (Date.now() - _familias.at < 6 * 3600e3) return _familias.n;
    try {
        const supabase = require('./supabaseClient');
        const { count: fin } = await supabase.from('expedientes').select('id', { count: 'exact', head: true }).eq('estado', 'FINALIZADO');
        const { data: lotes } = await supabase.from('lotes').select('id').in('estado', ['PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO']);
        let pagados = 0;
        if (lotes?.length) {
            const { data: exps } = await supabase.from('expedientes')
                .select('estado, t:documentacion->cobro->transferencia->>at').in('lote_id', lotes.map(l => l.id));
            pagados = (exps || []).filter(e => e.t && e.estado !== 'FINALIZADO').length;
        }
        const total = (Number(fin) || 0) + pagados;
        _familias = { n: total >= 20 ? Math.floor(total / 10) * 10 : null, at: Date.now() };
    } catch (e) {
        console.warn('[recepción] familias cobradas:', e.message);
    }
    return _familias.n;
}

/** El texto del RECORDATORIO (WhatsApp, email y asunto) con su enlace (corto). */
async function recordatorioDe(exp, { crear = true } = {}) {
    const { componerMensajeRecordatorioCobro } = await cobroService.loadCobroForm();
    const c = exp.clientes || {};
    return componerMensajeRecordatorioCobro({
        nombre: cobroService.primerNombre(exp),
        importe: importeDe(exp.documentacion?.cobro),
        enlace: await enlaceParaMensaje(exp, { crear }),
        tercero: cobroService.esTercero(c),
        titular: require('./recordatorios').capitalizar(`${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim()) || null,
    });
}

/** Lo que enseña la página. Sin IBAN ni nada que no sea suyo y necesario. */
async function vista(exp) {
    const { textoPeticionResena } = await cobroService.loadCobroForm();
    const cobro = exp.documentacion?.cobro || {};
    const c = exp.clientes || {};
    const tercero = cobroService.esTercero(c);
    const cuentas = (cobro.remesa?.cuentas || []).map(x => String(x.mascara || '').replace(/\D/g, '').slice(-4)).filter(Boolean);
    return {
        numero_expediente: exp.numero_expediente,
        saludo: cobroService.primerNombre(exp),
        tercero,
        importe: importeDe(cobro),
        fecha_transferencia: cobro.remesa?.fecha_ejecucion || cobro.transferencia?.at || null,
        cuentas,
        carta: cobro.carta_pago?.numero || null,
        recepcion: cobro.recepcion?.estado || null,
        resena_declarada: !!cobro.resena_cliente?.declarada_at,
        // Al partner no se le pide una reseña de BROKERGY en nombre de su cliente.
        resena: c.contacto_es_partner ? null : {
            url: require('./cartaPagoService').enlaceResena(),
            ...textoPeticionResena({ tercero }),
        },
        portal: await enlacePortal(exp),
        familias_cobradas: await familiasCobradas(),
    };
}

async function avisarEquipo(texto, asunto) {
    const chat = process.env.WHATSAPP_ADMIN_CHAT;
    if (chat) { try { await require('./whatsappService').sendText(chat, texto); } catch (e) { console.warn('[recepción] aviso WA:', e.message); } }
    if (process.env.ADMIN_EMAIL) {
        try {
            await require('./emailService').sendMail({
                to: process.env.ADMIN_EMAIL, subject: asunto, text: texto,
                html: `<pre style="font-family:Arial,sans-serif;font-size:14px">${texto.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]))}</pre>`,
            });
        } catch (e) { console.warn('[recepción] aviso email:', e.message); }
    }
}

const ACCIONES = ['recibido', 'no_llegado', 'resena'];

/**
 * Lo que pulsa el cliente. `recibido` / `no_llegado` → `cobro.recepcion`;
 * `resena` → `cobro.resena_cliente`. «Todavía no» avisa al equipo.
 */
async function registrar(exp, accion, { apuntarHistorial } = {}) {
    if (!ACCIONES.includes(accion)) { const e = new Error('Acción no válida'); e.status = 400; throw e; }
    const ahora = new Date().toISOString();
    const cobro = exp.documentacion?.cobro || {};
    const quien = cobroService.contactoCliente(exp).nombre || exp.numero_expediente;
    if (accion === 'resena') {
        if (!cobro.resena_cliente?.declarada_at) {
            await cobroService.sellar(exp.id, { resena_cliente: { declarada_at: ahora } });
            if (apuntarHistorial) await apuntarHistorial(exp, 'resena_declarada', `El cliente dice que ha dejado la reseña en Google (${quien}).`, 'CLIENTE');
        }
        return { ok: true };
    }
    await cobroService.sellar(exp.id, { recepcion: { estado: accion, at: ahora, anterior: cobro.recepcion || null } });
    if (accion === 'recibido') {
        if (apuntarHistorial) await apuntarHistorial(exp, 'recepcion_confirmada', `El cliente confirma que le ha llegado el ingreso (${quien}).`, 'CLIENTE');
    } else {
        if (apuntarHistorial) await apuntarHistorial(exp, 'recepcion_no_llegado', `El cliente dice que TODAVÍA NO le ha llegado el ingreso (${quien}).`, 'CLIENTE');
        const importe = importeDe(cobro);
        await avisarEquipo([
            `⚠️ *${exp.numero_expediente}* · ${quien} dice que *todavía no le ha llegado* el ingreso.`,
            importe != null ? `Importe: ${Number(importe).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €` : '',
            cobro.remesa?.fecha_ejecucion ? `Remesa con ejecución el ${cobro.remesa.fecha_ejecucion} (${cobro.remesa.msg_id || ''}).` : '',
            'Revisa el justificante y la cuenta en la fase 7 del lote.',
        ].filter(Boolean).join('\n'), `⚠️ No le ha llegado el ingreso — ${exp.numero_expediente}`);
    }
    return { ok: true };
}

module.exports = { enlaceRecibido, enlacePortal, enlaceParaMensaje, familiasCobradas, recordatorioDe, vista, registrar, ACCIONES };
