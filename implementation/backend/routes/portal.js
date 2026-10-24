// ============================================================================
// routes/portal.js — PORTAL DEL CLIENTE ("Mi expediente")
// ----------------------------------------------------------------------------
// Montado en /api/public/portal (server.js). Solo lectura + subida (reusa los
// endpoints /reforma-docs existentes). Auth por el MISMO token que /subir-docs
// (oportunidades.datos_calculo.upload_token). NUNCA expone margen/precio SO.
// ============================================================================
const express = require('express');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { attachUploadToken } = require('../services/reformaUploadService');
const portal = require('../services/portalService');

// --- Rate limiter en memoria para el login (el DNI es semi-público) ----------
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 10 min
const LOGIN_MAX = 8;                      // intentos por ventana
const loginHits = new Map();              // ip -> [timestamps]
function loginRateLimited(ip) {
    const now = Date.now();
    const arr = (loginHits.get(ip) || []).filter(t => now - t < LOGIN_WINDOW_MS);
    arr.push(now);
    loginHits.set(ip, arr);
    return arr.length > LOGIN_MAX;
}
// Limpieza perezosa para no acumular IPs (se ejecuta en cada login)
function sweepLoginHits() {
    const now = Date.now();
    for (const [ip, arr] of loginHits) {
        const kept = arr.filter(t => now - t < LOGIN_WINDOW_MS);
        if (kept.length) loginHits.set(ip, kept); else loginHits.delete(ip);
    }
}

// Valida el token contra la oportunidad; devuelve la oportunidad o null.
async function loadOppByToken(uuid, token) {
    const { data: opp } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, ficha, datos_calculo')
        .eq('id', uuid)
        .maybeSingle();
    if (!opp) return { error: 404 };
    if (!token || opp.datos_calculo?.upload_token !== token) return { error: 403 };
    return { opp };
}

// ---------------------------------------------------------------------------
// POST /api/public/portal/login  { numeroExpediente, dni }
// → { token, uuid } si nº de expediente + DNI coinciden.
// ---------------------------------------------------------------------------
router.post('/login', async (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
        sweepLoginHits();
        if (loginRateLimited(ip)) {
            return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' });
        }

        const numeroExpediente = String(req.body?.numeroExpediente || '').trim();
        const dni = portal.normalizeDni(req.body?.dni);
        if (!numeroExpediente || !dni) {
            return res.status(400).json({ error: 'Introduce tu nº de expediente y tu DNI.' });
        }

        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, oportunidad_id, cliente_id, numero_expediente')
            .eq('numero_expediente', numeroExpediente)
            .maybeSingle();

        // Mensaje genérico para no permitir enumerar expedientes/DNIs.
        const genericFail = () => res.status(401).json({ error: 'Nº de expediente o DNI incorrectos.' });
        if (!exp || !exp.cliente_id || !exp.oportunidad_id) return genericFail();

        const { data: cli } = await supabase
            .from('clientes')
            .select('dni')
            .eq('id_cliente', exp.cliente_id)
            .maybeSingle();
        if (!cli || portal.normalizeDni(cli.dni) !== dni) return genericFail();

        const { token } = await attachUploadToken(exp.oportunidad_id);
        return res.json({ token, uuid: exp.oportunidad_id });
    } catch (e) {
        console.error('[portal/login]', e.message);
        return res.status(500).json({ error: 'Error interno. Inténtalo más tarde.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/public/portal/expediente/:uuid?token= → DTO curado cliente-safe
// ---------------------------------------------------------------------------
router.get('/expediente/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const { token } = req.query;
        const { opp, error } = await loadOppByToken(uuid, token);
        if (error === 404) return res.status(404).json({ error: 'Expediente no encontrado.' });
        if (error === 403) return res.status(403).json({ error: 'Enlace inválido o caducado.' });

        // Expediente vinculado a la oportunidad
        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, cliente_id, estado, documentacion, cee, instalacion, lote_id')
            .eq('oportunidad_id', uuid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Aún no hay expediente para esta solicitud.' });

        // Estado / qué falta desde la vista de lifecycle
        const { data: lc } = await supabase
            .from('v_expedientes_lifecycle')
            .select('estado_actual, dias_en_estado_actual, responsable_bloqueo, campos_pendientes, cee_ini_registro_ok, cee_fin_registro_ok')
            .eq('numero_expediente', exp.numero_expediente)
            .maybeSingle();

        // Estado del lote (fase de Tramitación CAE), si el expediente está en un lote
        let loteEstado = null;
        if (exp.lote_id) {
            const { data: lote } = await supabase.from('lotes').select('estado').eq('id', exp.lote_id).maybeSingle();
            loteEstado = lote?.estado || null;
        }

        // Nombre del cliente (para la cabecera)
        const { data: cli } = await supabase
            .from('clientes')
            .select('nombre_razon_social, apellidos')
            .eq('id_cliente', exp.cliente_id)
            .maybeSingle();

        const estadoActual = lc?.estado_actual || null;
        const hito = portal.mapEstadoToHito(estadoActual);
        const requerimiento = portal.buildRequerimiento(exp.documentacion);

        // DTO whitelist — jamás la fila cruda, jamás margen/precio SO.
        return res.json({
            identidad: {
                numeroExpediente: exp.numero_expediente,
                nombre: [cli?.nombre_razon_social, cli?.apellidos].filter(Boolean).join(' ').trim() || null,
                // «Hola, Francisco Javier»: solo el nombre de pila de una PERSONA (con
                // apellidos); a una empresa no se la saluda por su razón social.
                saludo: portal.saludoDe(cli),
            },
            dinero: await portal.buildClientMoney(opp, exp),
            // ¿Ya se le ha transferido? Con `pagado`, la tarjeta del dinero dice
            // «cobrado», con el importe real y la fecha, y no «Estimado».
            cobro: portal.buildCobro(exp.documentacion),
            // «Para tu Renta» pasa a ser lo primero de la portada en cuanto se
            // puede abrir (el mismo candado que los certificados).
            rentaDisponible: portal.certificadosLiberados(exp.estado),
            estado: {
                hitoIndex: hito.hitoIndex,
                hitoLabel: hito.hitoLabel,
                microcopy: hito.microcopy,
                subestado: hito.subestado,
                responsable: lc?.responsable_bloqueo || null,
                diasEnEstado: lc?.dias_en_estado_actual ?? null,
                loteEstado,
            },
            requerimiento,
            // Con el expediente cerrado no se le pide nada: la vista seguiría
            // listando lo que faltaba cuando se rechazó.
            queFalta: hito.subestado === 'cerrado' ? [] : portal.clientPendings(lc?.campos_pendientes),
            // Los CERTIFICADOS no se entregan hasta 'DOC. COMPLETA': `documentos`
            // es lo descargable y `documentosBloqueados` lo que ya existe pero
            // aún no se suelta (el portal lo enseña con candado y explicación).
            ...(() => {
                const d = portal.buildDocumentos(exp, {
                    ceeIniOk: lc?.cee_ini_registro_ok,
                    ceeFinOk: lc?.cee_fin_registro_ok,
                    estado: exp.estado,
                });
                return { documentos: d.lista, documentosBloqueados: d.bloqueados };
            })(),
            upload: { uuid, token },
        });
    } catch (e) {
        console.error('[portal/expediente]', e.message);
        return res.status(500).json({ error: 'Error interno.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/public/portal/renta/:uuid?token= → «Para tu Renta» (24/10/2026)
// La MISMA guía que se le envía (guiaIrpfService.paraCliente → resumenRentaCliente):
// qué deducción, dónde se marca en Renta Web y los datos que pide. Con el mismo
// candado que los certificados: hasta 'DOC. COMPLETA' pueden volver a emitirse.
// ---------------------------------------------------------------------------
router.get('/renta/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const { error } = await loadOppByToken(uuid, req.query.token);
        if (error === 404) return res.status(404).json({ error: 'Expediente no encontrado.' });
        if (error === 403) return res.status(403).json({ error: 'Enlace inválido o caducado.' });
        const { data: exp } = await supabase
            .from('expedientes').select('id, estado')
            .eq('oportunidad_id', uuid).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Aún no hay expediente para esta solicitud.' });
        if (!portal.certificadosLiberados(exp.estado)) {
            return res.json({ disponible: false, motivo: 'La tendrás aquí en cuanto la documentación de tu expediente esté completa.' });
        }
        const { resumen } = await require('../services/guiaIrpfService').paraCliente('expediente', exp.id);
        return res.json({ disponible: !!resumen.puede, resumen });
    } catch (e) {
        console.error('[portal/renta]', e.message);
        return res.json({ disponible: false, motivo: 'Ahora mismo no podemos preparar tu guía. Escríbenos y te la mandamos.' });
    }
});

// ---------------------------------------------------------------------------
// GET /api/public/portal/doc/:uuid/:docKey?token= → proxy de descarga (Drive)
// ---------------------------------------------------------------------------
function guessMime(name) {
    const ext = String(name || '').toLowerCase().split('.').pop();
    if (ext === 'pdf') return 'application/pdf';
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    return 'application/octet-stream';
}

router.get('/doc/:uuid/:docKey', async (req, res) => {
    try {
        const { uuid, docKey } = req.params;
        const { token } = req.query;
        const { error } = await loadOppByToken(uuid, token);
        if (error === 404) return res.status(404).end();
        if (error === 403) return res.status(403).end();

        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, estado, documentacion, cee')
            .eq('oportunidad_id', uuid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!exp) return res.status(404).end();

        // La GUÍA de la Renta que nunca se le envió se genera al momento (la misma
        // que se envía), sin guardarla: «Para tu Renta» la ofrece siempre.
        if (docKey === 'guia_irpf' && !portal.resolveDocLink(exp, docKey)) {
            if (!portal.certificadosLiberados(exp.estado)) return res.status(409).json({ error: 'La guía estará disponible cuando la documentación del expediente esté completa.' });
            const g = await require('../services/guiaIrpfService').pdf('expediente', exp.id);
            res.set('Content-Type', 'application/pdf');
            res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(g.filename)}`);
            res.set('Cache-Control', 'private, max-age=600');
            return res.send(g.buffer);
        }

        // El candado se repite AQUÍ, no solo al listar: la URL de descarga es
        // adivinable (`/doc/:uuid/cee_inicial`) y quien la tenga de un expediente
        // ya completo podría probarla en otro. Sin esto, ocultar el botón sería
        // decoración.
        if (portal.esCertificado(docKey) && !portal.certificadosLiberados(exp.estado)) {
            return res.status(409).json({ error: 'Este certificado estará disponible cuando la documentación del expediente esté completa.' });
        }

        const resolved = portal.resolveDocLink(exp, docKey);
        if (!resolved) return res.status(404).json({ error: 'Documento no disponible.' });

        const buf = await driveService.getFileContent(resolved.driveId);
        if (!buf) return res.status(404).end();

        res.set('Content-Type', guessMime(resolved.name));
        res.set('Content-Disposition', `inline; filename="${resolved.name}"`);
        res.set('Cache-Control', 'private, max-age=3600');
        return res.send(buf);
    } catch (e) {
        console.error('[portal/doc]', e.message);
        return res.status(500).end();
    }
});

// ---------------------------------------------------------------------------
// GET /api/public/portal/zip/:uuid?token= → «Descargar todo» (24/10/2026)
// Un ZIP con LO MISMO que el cliente puede descargar uno a uno: los documentos
// de `buildDocumentos` (con su candado: lo bloqueado NO entra) + la guía de la
// Renta (la sellada o, si nunca se le envió, generada al momento, sin guardarla,
// como en /doc/.../guia_irpf). Solo lectura: no escribe nada en BD ni en Drive.
// Un papel que Drive no devuelve se salta (el resto sale); sin ninguno, 404.
// ---------------------------------------------------------------------------
router.get('/zip/:uuid', async (req, res) => {
    try {
        const { uuid } = req.params;
        const { error } = await loadOppByToken(uuid, req.query.token);
        if (error === 404) return res.status(404).json({ error: 'Expediente no encontrado.' });
        if (error === 403) return res.status(403).json({ error: 'Enlace inválido o caducado.' });

        const { data: exp } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, estado, documentacion, cee')
            .eq('oportunidad_id', uuid)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (!exp) return res.status(404).json({ error: 'Aún no hay expediente para esta solicitud.' });

        const { data: lc } = await supabase
            .from('v_expedientes_lifecycle')
            .select('cee_ini_registro_ok, cee_fin_registro_ok')
            .eq('numero_expediente', exp.numero_expediente)
            .maybeSingle();
        const { lista } = portal.buildDocumentos(exp, {
            ceeIniOk: lc?.cee_ini_registro_ok,
            ceeFinOk: lc?.cee_fin_registro_ok,
            estado: exp.estado,
        });
        const nFacturas = lista.filter(d => d.key.startsWith('factura_')).length;

        // De Drive, de dos en dos: son pocos ficheros y no merece la pena más presión.
        const entradas = [];
        const cola = lista.slice();
        const bajar = async () => {
            while (cola.length) {
                const d = cola.shift();
                try {
                    const r = portal.resolveDocLink(exp, d.key);
                    if (!r) continue;
                    // Un documento bloqueado no entra aunque alguien lo hubiera colado.
                    if (portal.esCertificado(d.key) && !portal.certificadosLiberados(exp.estado)) continue;
                    const buf = await driveService.getFileContent(r.driveId);
                    if (buf && buf.length) entradas.push({ name: portal.nombreZip(d.key, nFacturas) + portal.extensionDe(buf), data: buf });
                } catch (e) {
                    console.warn('[portal/zip] sin', d.key, e.message);
                }
            }
        };
        await Promise.all([bajar(), bajar()]);

        // La guía de la Renta: la sellada ya ha entrado si estaba en la lista.
        if (!entradas.some(e => e.name.startsWith(portal.nombreZip('guia_irpf'))) && portal.certificadosLiberados(exp.estado)) {
            try {
                const g = await require('../services/guiaIrpfService').pdf('expediente', exp.id);
                if (g?.buffer) entradas.push({ name: `${portal.nombreZip('guia_irpf')}.pdf`, data: g.buffer });
            } catch (e) {
                console.warn('[portal/zip] guía:', e.message);   // sin deducción no hay guía
            }
        }
        if (!entradas.length) return res.status(404).json({ error: 'Aún no hay documentos para descargar.' });

        entradas.sort((a, b) => a.name.localeCompare(b.name, 'es'));
        const zip = require('../utils/zipStore').crearZip(entradas);
        const nombre = `${exp.numero_expediente} - Documentos BROKERGY.zip`;
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', `attachment; filename="${nombre.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(nombre)}`);
        res.set('Cache-Control', 'private, no-store');
        return res.send(zip);
    } catch (e) {
        console.error('[portal/zip]', e.message);
        return res.status(500).json({ error: 'No hemos podido preparar el ZIP. Descarga los documentos uno a uno o escríbenos.' });
    }
});

module.exports = router;
