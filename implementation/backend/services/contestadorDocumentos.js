// =============================================================================
// contestadorDocumentos — lo que mandan por WhatsApp se GUARDA donde lo habría
// guardado la app, ANTES de contestar (agente autónomo, 10/11/2026).
//
// Fran: «me deja dos facturas. Revisa la conversación, revisa el expediente, guarda las
// facturas y le dice: vale, pues ahora solo quedaría el tema del RITE. Y le envía un
// mensaje parecido al que ya le habíamos enviado para saber si lo tiene o no».
//
// QUÉ se guarda solo (y por el MISMO camino que si lo hubiera subido él):
//   · FACTURA          → «Facturas de la instalación» (DOC_FACTURAS): `subirFicherosASlot`,
//                        entra en las facturas del expediente y se LEE (facturaAutoOcr), igual
//                        que por el enlace de subida del instalador.
//   · CERTIFICADO_RITE → «7. LEGALIZACION RITE/{nº} - Certificado RITE.pdf» y
//                        `cert_rite_drive_link`, como la fila «Certificado RITE» de Documentación,
//                        y se LEE (regla 27.b). Solo si el expediente aún NO tiene certificado, y
//                        nunca uno que sea de otra obra nuestra (`comprobadorPdf`, más abajo).
//   · FOTO_OBRA / PLACA → el apartado que propone el REPARTIDOR de siempre, solo con confianza
//                        ALTA en la obra y en el apartado; en un apartado de UNA foto, solo si
//                        está vacío (nunca se pisa lo que hay).
//   · CEE (el que ya tenía la casa) → «El certificado energético de tu casa» (DOC_CEE_EXISTENTE)
//   · PRESUPUESTO                   → «El presupuesto del instalador» (DOC_PRESUPUESTO)
//                        los dos son apartados de VARIOS ficheros: guardar no pisa nada. Que ese CEE
//                        valga o que el presupuesto cambie la propuesta lo sigue decidiendo Fran
//                        (va en el aviso), pero el papel ya está donde lo buscará (24/11/2026: C983,
//                        C991 y C986 se acusaban «recibido» y se quedaban en el chat).
//   · JUSTIFICANTE_TITULARIDAD → `justificanteCliente.subirDesdeCliente`, el MISMO camino que la
//                        ficha del cliente (Drive + lectura + comparación con la ficha), y solo si
//                        el cliente aún no tiene ninguno (C1025, 24/11/2026).
// Lo demás (DNI, CIFO o anexos firmados, Memoria RITE, justificante de pago, otros) NO se guarda
// solo: se le dice a Fran qué es y que lo mire.
//
// REGLA — en dos tiempos: `planear` NO escribe nada (lo usa `decidir`, también en seco) y
// `ejecutar` guarda. En MODO COPIA no se guarda hasta el «manda C12» de Fran; en real, justo
// antes de contestar. Lo guardado se apunta en `whatsapp_media_importada` (la pista del
// «Traer del WhatsApp»: sale «ya colocada» y no se coloca dos veces).
// =============================================================================

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const reformaUploadService = require('./reformaUploadService');
const IA = require('./rondaWhatsappIA');

const MAX_POR_CHAT = 12;
const FRONTEND = () => String(process.env.FRONTEND_URL || 'https://app.brokergy.es').replace(/\/+$/, '');
const CARPETA_RITE = '7. LEGALIZACION RITE';
const FOTOS = new Set(['FOTO_OBRA', 'FOTO_PLACA']);
// Documentos que van a un apartado de VARIOS ficheros del gestor (nunca pisan nada).
const A_APARTADO = { CEE: 'DOC_CEE_EXISTENTE', PRESUPUESTO: 'DOC_PRESUPUESTO' };
const SLOT_JUSTIFICANTE = 'JUSTIFICANTE_TITULARIDAD';
const QUE_ES = {
    DNI: 'el DNI', JUSTIFICANTE_TITULARIDAD: 'el justificante de titularidad', JUSTIFICANTE_PAGO: 'un justificante de pago',
    PRESUPUESTO: 'un presupuesto', MEMORIA_RITE: 'la Memoria RITE', CIFO_O_ANEXO_FIRMADO: 'un documento firmado (CIFO o anexo)',
    CEE: 'un certificado energético', CAPTURA_CATASTRO: 'una captura del Catastro', PLANO_CROQUIS: 'un plano o croquis',
    OTRO_DOCUMENTO: 'otro documento',
};

let _pendientesMod = null;
function instaladorPendientes() {
    if (!_pendientesMod) {
        const url = require('url').pathToFileURL(require('path').join(__dirname,
            '../../frontend/src/features/expedientes/logic/instaladorPendientes.js')).href;
        _pendientesMod = import(url);
    }
    return _pendientesMod;
}

// «Este PDF es de ESTA obra» (utils/pdfDelExpediente.js, con `mupdf`). Sin esa comprobación un
// RITE NO se guarda solo: se le dice a Fran (10/11/2026: aún no estaba en producción, era trabajo
// de otra sesión; en cuanto se despliega, el RITE entra solo). `_pruebas.comprobarPdf`: una
// función la sustituye; `false`, como si no estuviera.
const _pruebas = { comprobarPdf: undefined };
function comprobadorPdf() {
    if (_pruebas.comprobarPdf !== undefined) return _pruebas.comprobarPdf || null;
    try { return require('../utils/pdfDelExpediente').comprobarPdfDelExpediente; }
    catch (e) { if (e.code === 'MODULE_NOT_FOUND') return null; throw e; }
}
const SIN_COMPROBADOR = 'el RITE no lo guardo solo: este servidor aún no comprueba que el PDF sea de esta obra';

// Un RITE «corregido / modificado / rectificado» SUSTITUYE al que ya tiene el expediente: el de
// antes pasa a OLD (`archiveExistingToOld`, como el CIFO firmado de nuevo) y la validación se
// borra (25/11/2026, Fran; C1087, 26RES060_274: «Recibido el certificado corregido» y se quedaba
// en el chat). Sin esa palabra, uno que ya está NO se pisa. Pura.
const RITE_CORREGIDO = /\b(?:corregid[oa]|modificad[oa]|rectificad[oa]|subsanad[oa]|actualizad[oa]|nueva\s+versi[oó]n|bueno\s+ya|el\s+bueno)\b/i;
const esRiteCorregido = (...textos) => RITE_CORREGIDO.test(textos.filter(Boolean).join(' '));

// Una foto que el repartidor manda a un apartado de VENTANAS sin que lo que se ve sea una ventana
// no se guarda sola (25/11/2026, C1074: la foto del techo de una habitación de Irene acabó en «Las
// ventanas de ahora»). Pura.
const ES_DE_VENTANA = /ventan|carpinter|vidri|cristal|hueco|persian|balc[oó]n|puerta\s+(?:de\s+)?(?:la\s+)?(?:terraza|calle|balc)|marco|contraventan/i;
const apartadoNoCuadra = (slot, que) => /VENTANA/i.test(String(slot || '')) && !ES_DE_VENTANA.test(String(que || ''));

// Los CARNÉS del instalador (carné RITE, certificado de competencia…) no son de ninguna obra: van a
// la carpeta del INSTALADOR en Drive, «00. DOCUMENTACIÓN INSTALADORES/<empresa> (<id>)» bajo la
// raíz de BROKERGY (25/11/2026, Fran; C1089, Aeroconfor). Solo de un instalador del chat, y solo
// PDF o imagen. Pura.
const ES_CARNE = /\bcarn[eé]t?\b|\bcompetencia\s+profesional|\bcertificado\s+acreditativo|cualificaci[oó]n\s+profesional|instalador\s+(?:autorizado|habilitado)|habilitaci[oó]n\s+profesional/i;
const CARPETA_INSTALADORES = '00. DOCUMENTACIÓN INSTALADORES';
const SLOT_CARNE = 'CARNE_INSTALADOR';

const huella = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
const esPdf = (mt) => /pdf/i.test(String(mt || ''));
const esImagen = (mt) => /^image\//i.test(String(mt || ''));

async function leerOportunidad(id) {
    const { data, error } = await supabase.from('oportunidades').select('id, id_oportunidad, datos_calculo').eq('id', id).maybeSingle();
    if (error) throw new Error(`la base de datos no responde (oportunidad): ${error.message}`);
    return data;
}

async function leerExpediente(id) {
    const { data, error } = await supabase.from('expedientes')
        .select('id, oportunidad_id, numero_expediente, documentacion, instalacion, oportunidades!oportunidad_id(ref_catastral, inputs:datos_calculo->inputs)')
        .eq('id', id).maybeSingle();
    if (error) throw new Error(`la base de datos no responde (expediente): ${error.message}`);
    if (!data) return null;
    // Como lo espera `comprobarPdfDelExpediente` (rcsDelExpediente lee op.datos_calculo.inputs).
    const op = data.oportunidades || {};
    data.oportunidades = { ref_catastral: op.ref_catastral || null, datos_calculo: { inputs: op.inputs || {} } };
    return data;
}

/** Lo del instalador en la obra: RITE, CIFO y facturas (para el cerebro). Sin escribir nada. */
async function situacionInstalador(obra) {
    if (!obra?.expediente_id) return null;
    const exp = await leerExpediente(obra.expediente_id);
    if (!exp) return null;
    const { estadoInstalador } = await instaladorPendientes();
    const est = estadoInstalador(exp.documentacion || {});
    const ids = [...new Set([exp.instalacion?.instalador_rite_id, exp.instalacion?.instalador_id, ...(obra.instalador_ids || [])].filter(Boolean))];
    let firmaFran = false;
    if (ids.length) {
        const { data } = await supabase.from('prescriptores').select('id_empresa, contactos_notificacion').in('id_empresa', ids);
        const { firmaFranConCertificado } = require('../utils/firmaConCertificadoInstalador');
        firmaFran = (data || []).some(firmaFranConCertificado);
    }
    const doc = exp.documentacion || {};
    return {
        enlace: `${FRONTEND()}/instalador/${exp.id}`,
        firma_fran: firmaFran,
        rite: {
            recibido: !!est.rite.recibido, certificado: !!est.rite.certificadoRecibido, memoria_firmada: !!est.rite.memoriaRecibida,
            memoria_preparada: !!est.rite.memoriaGenerada, memoria_enviada_at: est.rite.sentAt || null,
        },
        cifo: {
            firmado: !!est.cifo.recibido, borrador: !!est.cifo.borrador, enviado_at: est.cifo.sentAt || null, refirma: !!est.cifo.refirma,
        },
        facturas: (Array.isArray(doc.facturas) ? doc.facturas : []).filter(f => f && (f.drive_id || f.drive_link)).length,
    };
}

/**
 * Lo que la APP ya le mandó a este número de esta obra (whatsapp_queue), lo último primero:
 * para que lo que se le vuelva a pedir suene a lo de entonces. `unica`: el chat solo tiene
 * esta obra, así que también vale lo que no la nombra. `hasta` (Date): solo lo mandado antes
 * de su último mensaje — en vivo no cambia nada; en el seco con `--antes` deja fuera nuestra
 * respuesta real, que si no se cuela como «lo que ya le pedimos».
 */
async function pedidosAnteriores(tel9, obra, { dias = 90, max = 3, unica = false, hasta = null } = {}) {
    if (!tel9) return [];
    let q = supabase.from('whatsapp_queue').select('message, created_at')
        .like('phone', `%${tel9}`).eq('status', 'SENT')
        .gte('created_at', new Date(Date.now() - dias * 86_400_000).toISOString());
    if (hasta) q = q.lte('created_at', hasta.toISOString());
    const { data, error } = await q.order('created_at', { ascending: false }).limit(30);
    if (error) return [];
    const codigo = obra?.codigo ? String(obra.codigo).toUpperCase() : null;
    return (data || [])
        .filter(r => /RITE|factura|CIFO|foto|documentaci/i.test(r.message || ''))
        // Con varias obras en el chat, solo los que nombran ESTA.
        .filter(r => unica || !codigo || String(r.message || '').toUpperCase().includes(codigo))
        .slice(0, max)
        .map(r => ({ at: r.created_at, texto: String(r.message || '').slice(0, 900) }));
}

// ─── 1. Planear (no escribe) ──────────────────────────────────────────────────
/**
 * Decide qué se guarda de lo que acaba de llegar. Marca cada fila de `c.filas` con
 * `guardado`: `true` (se guarda) o el motivo por el que no.
 * @returns {{ items: object[], ficheros: Map<string, object> }}  `ficheros`: msg → { buffer, mimetype, nombre }
 */
async function planear({ c, adjuntos }) {
    const items = [];
    const ficheros = new Map();
    const porMsg = new Map((adjuntos || []).map(m => [m.id, m]));
    const cache = new Map();
    const datosDe = async (obra) => {
        if (cache.has(obra.codigo)) return cache.get(obra.codigo);
        const d = { opp: null, checklist: [], exp: null };
        d.opp = await leerOportunidad(obra.oportunidad_id);
        if (d.opp) d.checklist = await reformaUploadService.checklistForOportunidad({ id: d.opp.id, datos_calculo: d.opp.datos_calculo });
        if (obra.expediente_id) d.exp = await leerExpediente(obra.expediente_id);
        cache.set(obra.codigo, d);
        return d;
    };
    const vistos = new Set();        // la misma factura mandada dos veces
    const unicoOcupado = new Set();  // un apartado de una foto: solo la primera

    for (const f of c.filas || []) {
        if (f.tipo === 'NO_RELACIONADO') continue;
        const m = porMsg.get(f.msg);
        const it = {
            msg: f.msg, t: f.t || m?.t || null, obra: f.obra || null, tipo: f.tipo, que: f.que, slot: null, destino: null,
            mimetype: m?._fichero?.mimetype || null, nombre: m?._fichero?.nombre || null, guardar: false, motivo: null,
        };
        const no = (motivo) => { it.motivo = motivo; items.push(it); f.guardado = motivo; };
        if (items.filter(x => x.guardar).length >= MAX_POR_CHAT) { no('fuera del tope de lo que se guarda solo'); continue; }
        if (!m || !m._fichero?.buffer) { no('no se ha podido bajar'); continue; }
        // Los carnés del instalador, de ninguna obra: a su carpeta.
        const instaladores = (c.instaladores || []).filter(x => x && x.id);
        if (ES_CARNE.test(String(f.que || '')) && ['OTRO_DOCUMENTO', 'DNI', 'CERTIFICADO_RITE'].includes(f.tipo) && (c.rol === 'instalador' || c.rol === 'ambos')) {
            if (instaladores.length !== 1) { no(instaladores.length ? 'un carné del instalador, pero en el chat hay varios instaladores' : 'un carné del instalador, pero no sé de qué instalador es'); continue; }
            if (!esPdf(m._fichero.mimetype) && !esImagen(m._fichero.mimetype)) { no(`un carné en ${m._fichero.mimetype || 'formato desconocido'}`); continue; }
            const h0 = huella(m._fichero.buffer);
            if (vistos.has(h0)) { no('repetido: es el mismo fichero que otro de este chat'); continue; }
            vistos.add(h0);
            Object.assign(it, { obra: null, guardar: true, slot: SLOT_CARNE, destino: `Documentación del instalador (${instaladores[0].nombre || instaladores[0].id})`, instalador_id: instaladores[0].id, instalador_nombre: instaladores[0].nombre || null });
            ficheros.set(f.msg, m._fichero);
            f.guardado = true;
            items.push(it);
            continue;
        }
        const obra = (c.obras || []).find(o => o.codigo === f.obra);
        if (!obra) { no(f.obra === 'NUEVA' ? 'es de una obra que aún no está en la app' : 'no se sabe de qué obra es'); continue; }
        if (obra.tipo === 'cee' || !obra.oportunidad_id) { no('es de un CEE directo'); continue; }
        if (f.confianza !== 'alta') { no(`no está claro que sea de ${obra.codigo}`); continue; }

        const buf = m._fichero.buffer;
        const h = huella(buf);
        if (vistos.has(h)) { no('repetido: es el mismo fichero que otro de este chat'); continue; }

        let d;
        try { d = await datosDe(obra); }
        catch (e) { no(e.message); continue; }
        if (!d.opp) { no('no encuentro la oportunidad'); continue; }

        if (f.tipo === 'FACTURA') {
            const slotDef = d.checklist.find(s => s.key === 'DOC_FACTURAS');
            if (!slotDef) { no('esa obra todavía no tiene apartado de facturas'); continue; }
            if (!esPdf(it.mimetype) && !esImagen(it.mimetype)) { no(`una factura en ${it.mimetype || 'formato desconocido'}`); continue; }
            Object.assign(it, { guardar: true, slot: 'DOC_FACTURAS', destino: slotDef.labelCliente || slotDef.label });
        } else if (f.tipo === 'CERTIFICADO_RITE') {
            if (!d.exp) { no('el RITE solo se guarda en un expediente'); continue; }
            const { estadoInstalador } = await instaladorPendientes();
            const yaTiene = estadoInstalador(d.exp.documentacion || {}).rite.certificadoRecibido;
            const corregido = yaTiene && esRiteCorregido(f.que, m?._fichero?.nombre, m?.texto);
            if (yaTiene && !corregido) { no('el expediente ya tiene un certificado RITE: no lo piso'); continue; }
            // Solo en PDF: una foto del RITE no se puede comprobar (24/11/2026).
            if (!esPdf(it.mimetype)) { no(`un RITE en ${it.mimetype || 'formato desconocido'}: solo guardo solo el PDF`); continue; }
            const comprobar = comprobadorPdf();
            if (!comprobar) { no(SIN_COMPROBADOR); continue; }
            let r;
            try { r = await comprobar({ buffer: buf, mimetype: it.mimetype, exp: d.exp, documento: 'certificado RITE' }); }
            catch (e) { no(`no he podido comprobar que el PDF sea de esta obra (${e.message})`); continue; }
            if (!r.ok) { no(r.error); continue; }
            // Solo, únicamente si TRAE el nº o la referencia catastral de la obra (la subida por el
            // enlace deja pasar lo ilegible con aviso; aquí no hay nadie mirando).
            if (!r.coincide) { no(`no he podido comprobar que el RITE sea de esta obra${r.aviso ? ` (${r.aviso})` : ''}`); continue; }
            if (r.aviso) it.aviso = r.aviso;
            Object.assign(it, corregido
                ? { guardar: true, slot: 'DOC_RITE', destino: 'Certificado RITE (sustituye al anterior, que pasa a OLD)', reemplaza: true }
                : { guardar: true, slot: 'DOC_RITE', destino: 'Certificado RITE' });
        } else if (FOTOS.has(f.tipo)) {
            if (!f.slot) { no('el repartidor no sabe en qué apartado va'); continue; }
            const slotDef = d.checklist.find(s => s.key === f.slot);
            if (!slotDef) { no(`«${f.slot}» no es un apartado de esa obra`); continue; }
            const label = slotDef.labelCliente || slotDef.label;
            if (f.confianza_slot !== 'alta') { no(`no está claro el apartado (sería «${label}»)`); continue; }
            if (apartadoNoCuadra(f.slot, f.que)) { no(`no está claro el apartado (sería «${label}», y no parece una ventana)`); continue; }
            if (!slotDef.multiple) {
                const ya = d.opp.datos_calculo?.reforma_uploads?.[f.slot];
                if ((Array.isArray(ya) && ya.length) || unicoOcupado.has(`${obra.codigo}:${f.slot}`)) { no(`«${label}» ya tiene su foto: no la piso`); continue; }
                unicoOcupado.add(`${obra.codigo}:${f.slot}`);
            }
            Object.assign(it, { guardar: true, slot: f.slot, destino: label });
        } else if (A_APARTADO[f.tipo]) {
            const slotDef = d.checklist.find(s => s.key === A_APARTADO[f.tipo]);
            if (!slotDef) { no(`${QUE_ES[f.tipo]}: esa obra no tiene su apartado`); continue; }
            if (!esPdf(it.mimetype) && !esImagen(it.mimetype)) { no(`${QUE_ES[f.tipo]} en ${it.mimetype || 'formato desconocido'}`); continue; }
            Object.assign(it, { guardar: true, slot: slotDef.key, destino: slotDef.labelCliente || slotDef.label });
        } else if (f.tipo === 'JUSTIFICANTE_TITULARIDAD') {
            if (!obra.cliente_id) { no('el justificante de titularidad: no sé de qué cliente es'); continue; }
            if (!esPdf(it.mimetype) && !esImagen(it.mimetype)) { no(`un justificante en ${it.mimetype || 'formato desconocido'}`); continue; }
            let est;
            try { est = await require('./justificanteCliente').estadoJustificante(obra.cliente_id, { expedienteId: obra.expediente_id || null }); }
            catch (e) { no(`no he podido mirar si ya hay justificante (${e.message})`); continue; }
            if (est?.link) { no('ya tiene un justificante de titularidad: no lo piso (puede ser otra cuenta)'); continue; }
            if (!est?.destino) { no('el cliente aún no tiene carpeta donde guardar el justificante'); continue; }
            Object.assign(it, { guardar: true, slot: SLOT_JUSTIFICANTE, destino: 'Justificante de titularidad de la cuenta', cliente_id: obra.cliente_id });
        } else {
            no(`${QUE_ES[f.tipo] || 'un documento'}: no lo guardo solo`);
            continue;
        }
        vistos.add(h);
        Object.assign(it, { oportunidad_id: obra.oportunidad_id, expediente_id: obra.expediente_id || null });
        ficheros.set(f.msg, m._fichero);
        f.guardado = true;
        items.push(it);
    }
    return { items, ficheros };
}

// ─── 2. Ejecutar (escribe) ───────────────────────────────────────────────────
const extDe = (mt) => (esPdf(mt) ? 'pdf' : (String(mt || '').split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, ''));

async function guardarEnApartado(it, fichero, { subidoPor, avisar }) {
    const opp = await leerOportunidad(it.oportunidad_id);
    if (!opp) throw new Error('no encuentro la oportunidad');
    const checklist = await reformaUploadService.checklistForOportunidad({ id: opp.id, datos_calculo: opp.datos_calculo });
    const slotDef = checklist.find(s => s.key === it.slot);
    if (!slotDef) throw new Error(`«${it.slot}» ya no es un apartado de esa obra`);
    const archivo = { buffer: fichero.buffer, mimetype: fichero.mimetype, originalname: fichero.nombre || `${it.slot.toLowerCase()}.${extDe(fichero.mimetype)}` };
    const { subidas, fallidas } = await reformaUploadService.subirFicherosASlot({
        oportunidadUuid: opp.id, datosCalculo: opp.datos_calculo || {}, slotDef, archivos: [archivo], subidoPor,
    });
    if (!subidas.length) throw new Error(fallidas[0]?.error || 'Google Drive no lo ha aceptado');
    const s = subidas[0];
    if (it.slot === 'DOC_FACTURAS') {
        await reformaUploadService.addFacturaToExpediente(opp.id, s.link, s.driveId);
        // Se LEE en segundo plano, como la subida pública: nº, fecha e importe.
        setImmediate(() => {
            require('./facturaAutoOcr').leerYCompletar({
                oportunidadId: opp.id, driveId: s.driveId, buffer: fichero.buffer, originalname: archivo.originalname, mimetype: archivo.mimetype,
            }).catch(e => console.warn('[contestador] OCR de la factura:', e.message));
        });
    }
    if (avisar) {
        require('./uploadNotifier').registrarSubida({
            oportunidadUuid: opp.id, slotKey: it.slot, slotLabel: slotDef.label, fase: slotDef.fase || null, subidoPor,
        });
    }
    return { link: s.link, driveId: s.driveId, nombre: s.name };
}

async function guardarRite(it, fichero, { subidoPor = 'instalador', avisar = false } = {}) {
    const exp = await leerExpediente(it.expediente_id);
    if (!exp) throw new Error('no encuentro el expediente');
    const { estadoInstalador } = await instaladorPendientes();
    if (estadoInstalador(exp.documentacion || {}).rite.certificadoRecibido && !it.reemplaza) throw new Error('el expediente ya tiene un certificado RITE');
    const { pdf } = await require('./ceeOcrService').normalizeToPdf([{
        buffer: fichero.buffer, mimetype: fichero.mimetype, originalname: fichero.nombre || `rite.${extDe(fichero.mimetype)}`,
    }]);
    const comprobar = comprobadorPdf();
    if (!comprobar) throw new Error(SIN_COMPROBADOR);
    const r = await comprobar({ buffer: pdf, mimetype: 'application/pdf', exp, documento: 'certificado RITE' });
    if (!r.ok) throw new Error(r.error);
    if (!r.coincide) throw new Error('no he podido comprobar que el RITE sea de esta obra');
    const drive = require('./driveService');
    const { carpetaDeExpediente } = require('./expedienteFolderSync');
    const raiz = await carpetaDeExpediente(exp);
    if (!raiz) throw new Error('el expediente no tiene carpeta de Drive');
    const sub = await drive.getOrCreateSubfolderNormalized(raiz, CARPETA_RITE);
    const nombre = `${exp.numero_expediente || exp.id} - Certificado RITE.pdf`;
    const previo = await drive.findFileByName(sub, nombre);
    let anterior = null;
    if (previo && it.reemplaza) {
        // El CORREGIDO: el de antes a «OLD» (como el CIFO firmado de nuevo); si no se puede mover,
        // no se pisa nada.
        anterior = await drive.archiveExistingToOld(sub, previo, nombre);
        if (!anterior) throw new Error(`no he podido pasar el «${nombre}» anterior a OLD`);
    } else if (previo) {
        // Nunca se pisa: si ya hay uno con ese nombre en Drive, que lo mire una persona.
        throw new Error(`ya hay un «${nombre}» en Drive`);
    }
    const saved = await drive.saveFileToFolder(sub, nombre, 'application/pdf', pdf);
    if (!saved?.link) throw new Error('Google Drive no lo ha aceptado');
    try { if (saved.id) await drive.setFolderPublic(saved.id, 'reader'); } catch (e) { /* como las rutas: no tumba nada */ }
    if (it.reemplaza) {
        // Versión nueva: el visto bueno del anterior NO vale para este (regla 196), y el enlace el
        // último, clave a clave (utils/documentacionAtomica.js, como la subida por el enlace).
        await require('../utils/documentacionAtomica').escribirSubidaEnDocumentacion(supabase, {
            expedienteId: exp.id, oportunidadId: exp.oportunidad_id, docLeida: exp.documentacion || {},
            subidos: ['cert_rite_drive_link'], quien: { usuario: 'contestador', origen: 'WhatsApp del instalador (corregido)' },
            campos: { cert_rite_aportado_at: new Date().toISOString(), cert_rite_drive_link: saved.link },
        });
    } else {
        // Enlace + sello «esto es el certificado» con la RPC de MERGE (regla 22: nada de reescribir
        // `documentacion` entera). Es lo que hace la subida por el enlace (syncRiteToExpediente).
        await reformaUploadService.syncRiteToExpediente(exp.oportunidad_id, saved.link);
    }
    let lectura = null;
    try {
        const { procesarCertificadoRite } = require('./riteCertificado');
        lectura = await procesarCertificadoRite({
            exp: { ...exp, documentacion: { ...(exp.documentacion || {}), cert_rite_drive_link: saved.link, cert_rite_aportado_at: new Date().toISOString() } },
            pdf, origen: 'whatsapp',
        });
    } catch (e) { console.warn('[contestador] lectura del RITE:', e.message); }
    if (avisar) {
        require('./uploadNotifier').registrarSubida({
            oportunidadUuid: exp.oportunidad_id, slotKey: 'DOC_RITE', slotLabel: 'Certificado RITE', fase: null, subidoPor,
        });
    }
    const avisoAnterior = anterior ? `el RITE anterior queda en OLD como «${anterior}»; hay que volver a validarlo` : null;
    return { link: saved.link, driveId: saved.id, nombre, pruebas: lectura?.fechas?.pruebas || null, aviso: [r.aviso, avisoAnterior].filter(Boolean).join('; ') || null };
}

/** Nombre de la carpeta del instalador: «ACRÓNIMO (id)». Puro. */
const carpetaDeInstalador = (id, nombre) => `${String(nombre || 'INSTALADOR').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)} (${id})`;

async function guardarCarne(it, fichero) {
    const raiz = String(process.env.DRIVE_ROOT_FOLDER_ID || '').trim();
    if (!raiz) throw new Error('no hay carpeta raíz de Drive (DRIVE_ROOT_FOLDER_ID)');
    const drive = require('./driveService');
    const todos = await drive.getOrCreateSubfolderNormalized(raiz, CARPETA_INSTALADORES);
    const suya = await drive.getOrCreateSubfolderNormalized(todos, carpetaDeInstalador(it.instalador_id, it.instalador_nombre));
    const base = String(fichero.nombre || `carne.${extDe(fichero.mimetype)}`).replace(/[\\/:*?"<>|]+/g, ' ').trim();
    // El id del mensaje en el nombre: la misma foto no se guarda dos veces.
    const nombre = `${String(it.msg || '').slice(-6)} - ${base}`;
    if (await drive.findFileByName(suya, nombre)) return { link: null, driveId: null, nombre, ya: true };
    const saved = await drive.saveFileToFolder(suya, nombre, fichero.mimetype || 'application/pdf', fichero.buffer);
    if (!saved?.link) throw new Error('Google Drive no lo ha aceptado');
    return { link: saved.link, driveId: saved.id, nombre };
}

async function guardarJustificante(it, fichero) {
    const r = await require('./justificanteCliente').subirDesdeCliente(it.cliente_id, {
        base64: fichero.buffer.toString('base64'), mimeType: fichero.mimetype || 'application/pdf',
        expedienteId: it.expediente_id || null, usuario: 'contestador',
    });
    const avisos = r?.comprobacion?.avisos || [];
    return { link: r.link, driveId: null, nombre: 'justificante de titularidad bancaria.pdf', aviso: avisos.length ? avisos.join('; ').slice(0, 300) : null };
}

/**
 * Guarda lo planeado. Nunca lanza: cada item vuelve con `hecho` o `error`.
 * @param {object[]} items       los de `planear` (o los guardados en la fila, para el «manda C12»)
 * @param {Map}      ficheros    msg → fichero; lo que falte se BAJA otra vez con `fuente`
 * @param {object}   o           { fuente, rol, avisar, por }
 */
async function ejecutar(items, ficheros = new Map(), { fuente = null, rol = 'cliente', avisar = false, por = 'contestador' } = {}) {
    const subidoPor = rol === 'instalador' || rol === 'ambos' ? 'instalador' : 'cliente';
    const aGuardar = (items || []).filter(x => x.guardar && !x.hecho);
    // Lo que ya se colocó (a mano, con «Traer del WhatsApp», o en una vuelta anterior) no se repite.
    const ya = new Set();
    if (aGuardar.length) {
        const { data } = await supabase.from('whatsapp_media_importada').select('wa_msg_id').in('wa_msg_id', aGuardar.map(x => x.msg));
        for (const r of data || []) ya.add(r.wa_msg_id);
    }
    const colocadas = new Map();   // oportunidad → items para whatsapp_media_importada
    for (const it of aGuardar) {
        if (ya.has(it.msg)) { it.hecho = true; it.ya_estaba = true; continue; }
        try {
            let fichero = ficheros.get(it.msg);
            if (!fichero?.buffer) {
                if (!fuente) throw new Error('no tengo el fichero para guardarlo');
                fichero = await fuente.descargarAdjunto(it.msg);
            }
            const r = it.slot === 'DOC_RITE' ? await guardarRite(it, fichero, { subidoPor, avisar })
                : it.slot === SLOT_JUSTIFICANTE ? await guardarJustificante(it, fichero)
                    : it.slot === SLOT_CARNE ? await guardarCarne(it, fichero)
                        : await guardarEnApartado(it, fichero, { subidoPor, avisar });
            delete it.error;   // un reintento («manda C12» otra vez) que ahora sí entra
            Object.assign(it, { hecho: true, link: r.link, driveId: r.driveId, archivo: r.nombre, ...(r.ya ? { ya_estaba: true } : {}), ...(r.pruebas ? { rite_pruebas: r.pruebas } : {}), ...(r.aviso ? { aviso: r.aviso } : {}) });
            // Lo que no es de ninguna obra (los carnés) no va a la pista del «Traer del WhatsApp».
            if (!it.oportunidad_id) continue;
            if (!colocadas.has(it.oportunidad_id)) colocadas.set(it.oportunidad_id, []);
            colocadas.get(it.oportunidad_id).push({ waMsgId: it.msg, slot: it.slot, tipo: esPdf(it.mimetype) ? 'pdf' : 'image', t: it.t });
        } catch (e) {
            it.error = String(e.message || e).slice(0, 300);
            console.warn(`[contestador] no se ha podido guardar ${it.msg} (${it.slot}): ${it.error}`);
        }
    }
    const { registrarColocadas } = require('./whatsappMedia');
    for (const [opId, lista] of colocadas) {
        try { await registrarColocadas({ id: opId }, lista, por); } catch (e) { console.warn('[contestador] registrar colocadas:', e.message); }
    }
    return {
        guardados: (items || []).filter(x => x.guardar && x.hecho).length,
        fallidos: (items || []).filter(x => x.guardar && x.error),
    };
}

/** Lo planeado, sin buffers, para guardarlo en la fila (`detalle.guardar`). */
const paraFila = (items) => (items || []).map(({ msg, t, obra, tipo, que, slot, destino, mimetype, nombre, guardar, motivo, oportunidad_id, expediente_id, cliente_id, hecho, error, ya_estaba, aviso, rite_pruebas, reemplaza, instalador_id, instalador_nombre }) => ({
    msg, t, obra, tipo, que, slot, destino, mimetype, nombre, guardar, motivo, oportunidad_id, expediente_id, ...(cliente_id ? { cliente_id } : {}),
    ...(reemplaza ? { reemplaza } : {}), ...(instalador_id ? { instalador_id, instalador_nombre: instalador_nombre || null } : {}),
    ...(hecho ? { hecho } : {}), ...(error ? { error } : {}), ...(ya_estaba ? { ya_estaba } : {}), ...(aviso ? { aviso } : {}), ...(rite_pruebas ? { rite_pruebas } : {}),
}));

/**
 * Lo que se quedó SIN colocar de una obra que YA existe y que el asistente puede colocar con la skill
 * alta-oportunidad (`documentar`): fotos sin apartado claro y documentos sueltos de esa obra
 * (25/11/2026, Fran: 13 de 41 adjuntos del día eran fotos para el CEE que nadie colocaba). NO entra
 * lo que no se guarda a propósito (firmados, DNI, justificantes, lo de otra obra o de una nueva, lo
 * que ya tiene su foto). Pura.
 * @returns {Map<string, object[]>} obra → items
 */
const PARA_COLOCAR_TIPOS = new Set(['FOTO_OBRA', 'FOTO_PLACA', 'PLANO_CROQUIS', 'OTRO_DOCUMENTO', 'CAPTURA_CATASTRO']);
const PARA_COLOCAR_MOTIVO = /repartidor no sabe|no está claro el apartado|no lo guardo solo|no es un apartado de esa obra/i;
function paraColocar(items) {
    const out = new Map();
    for (const x of items || []) {
        // Con obra y de las del chat: los motivos de abajo solo salen tras casar con una (planear).
        if (!x || x.guardar || !x.obra || x.obra === 'NUEVA') continue;
        if (!PARA_COLOCAR_TIPOS.has(x.tipo) || !PARA_COLOCAR_MOTIVO.test(String(x.motivo || ''))) continue;
        if (!out.has(x.obra)) out.set(x.obra, []);
        out.get(x.obra).push(x);
    }
    return out;
}

module.exports = { planear, ejecutar, situacionInstalador, pedidosAnteriores, paraFila, paraColocar, MAX_POR_CHAT, QUE_ES, _pruebas, _puras: { esRiteCorregido, apartadoNoCuadra, ES_CARNE, carpetaDeInstalador } };
