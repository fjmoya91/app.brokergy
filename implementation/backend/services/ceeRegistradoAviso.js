// ─── ceeRegistradoAviso.js ───────────────────────────────────────────────────
// El aviso de «CEE registrado» al cliente, al instalador y al equipo. Vivía en
// routes/expedientes.js; se sacó (2026-10-25) porque también lo dispara la
// presentación AUTOMÁTICA del CEE inicial (presentacionCeeService), que es un
// servicio y no puede tirar de una ruta.
//
// REGLA — las fotos que se piden son LAS QUE FALTAN. El texto fijo («caldera y su
// placa, desmontaje, aerotermia, placas nuevas») se mandaba igual a un RES060 que a
// un RES080 de ventanas, y al cliente que ya nos había mandado la caldera se la
// volvía a pedir. Ahora la lista sale del MISMO checklist que su enlace de subida
// (`buildDocsView`, reconciliado con Drive), solo lo que justifica la ACTUACIÓN
// (destino EXPEDIENTE), partido en «antes de empezar» y «durante y al terminar»,
// con lo que ya tenemos dicho para que no lo repita. Si no se puede calcular, sale
// la lista de siempre: nunca un aviso sin fotos que pedir por un fallo de Drive.

const supabase = require('./supabaseClient');
const emailService = require('./emailService');
const whatsappService = require('./whatsappService');
const reformaUploadService = require('./reformaUploadService');
const botVinculos = require('./botVinculos');
const recordatorios = require('./recordatorios');

// ─── Helpers de notificación CEE registrado ───────────────────────────────────
// Extraídos de los IIFE async dentro de PUT /:id para que también se puedan
// re-disparar manualmente desde POST /:id/resend-cee-notifications.

// La lista de siempre: solo cuando no se ha podido saber qué falta.
const FOTOS_DE_SIEMPRE = [
    'Caldera existente y placa de fabricación.',
    'Desmontaje de la caldera.',
    'Montaje de la aerotermia.',
    'Fotos de las nuevas placas de fabricación (tanto de la unidad exterior como de la interior).',
];

/**
 * Lo que falta para JUSTIFICAR la obra (no para el certificado), con el enlace
 * filtrado a eso. `null` si no se ha podido calcular: quien llama pone la lista de
 * siempre.
 *
 * Mismo criterio que `faltantesPorDestino(…, 'EXPEDIENTE')` (lo opcional y lo
 * prescindible no se reclaman, lo marcado «no necesario» tampoco), pero
 * distinguiendo un fallo de «no falta nada», y devolviendo también lo que YA hay.
 */
async function pendientesObra(oportunidadUuid) {
    if (!oportunidadUuid) return null;
    try {
        const { data: opp } = await supabase.from('oportunidades')
            .select('id, id_oportunidad, datos_calculo').eq('id', oportunidadUuid).maybeSingle();
        if (!opp) return null;
        const view = await reformaUploadService.buildDocsView(opp);
        const deLaObra = (view.slots || []).filter(s =>
            (s.destino || 'EXPEDIENTE') === 'EXPEDIENTE'
            && !s.existing && !s.waived && !s.prescindible && !s.optionalAlways);
        const tiene = (s) => !!(s.items?.length);
        const falta = deLaObra.filter(s => !tiene(s));
        const base = await reformaUploadService.ensureUploadLink(opp.id);
        // El enlace va FILTRADO a lo que se pide (`?need=`), como el «📩 Pedírsela».
        const link = falta.length && base.includes('/subir-docs/')
            ? `${base}${base.includes('?') ? '&' : '?'}need=${falta.map(s => s.key).join(',')}`
            : base;
        return {
            ficha: view.alcance?.ficha || null,
            antes: falta.filter(s => s.fase === 'ANTES'),
            despues: falta.filter(s => s.fase === 'DESPUES'),
            tenemos: deLaObra.filter(tiene),
            link,
        };
    } catch (e) {
        console.warn('[cee-registrado] qué falta de la obra:', e.message);
        return null;
    }
}

/**
 * El bloque de fotos del aviso de CEE INICIAL registrado, para quien lo lee:
 * `cliente` (lenguaje de casa, sin facturas: se las da el instalador) o
 * `instalador` (etiquetas técnicas y las facturas). `wa` pone las negritas.
 * Devuelve las líneas en `texto` y las listas sueltas para el email.
 */
function bloqueFotos(pend, { para = 'cliente', wa = true, link = null } = {}) {
    const b = (t) => (wa ? `*${t}*` : t);
    const enlace = link || pend?.link || null;
    if (!pend) {
        const lista = FOTOS_DE_SIEMPRE.map(t => `• ${b(t)}`).join('\n');
        return {
            texto: `📸 Recuerda hacerle fotografías a todo:\n${lista}\n\nLas fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.`
                + (enlace ? `\n\nPuedes subirlas directamente al expediente a través de este enlace:\n🔗 ${enlace}` : ''),
            antes: [], despues: FOTOS_DE_SIEMPRE, tenemos: [], completo: false, link: enlace,
        };
    }
    const nombre = (s) => (para === 'cliente' ? (s.labelCliente || s.label) : s.label);
    const esFactura = (s) => s.key === 'DOC_FACTURAS';
    const antes = pend.antes.filter(s => para === 'instalador' || !esFactura(s)).map(nombre);
    const despues = pend.despues.filter(s => !esFactura(s)).map(nombre);
    const facturas = para === 'instalador' && pend.despues.some(esFactura);
    const tenemos = pend.tenemos.filter(s => !esFactura(s)).map(nombre);
    const lista = (xs) => xs.map(t => `• ${b(t)}`).join('\n');

    const partes = [];
    if (tenemos.length) {
        partes.push(`✅ Ya tenemos ${para === 'cliente' ? 'estas fotos (no hace falta que las vuelvas a mandar)' : 'estas fotos'}:\n${lista(tenemos)}`);
    }
    if (antes.length) {
        partes.push(`📸 ${b('Antes de empezar la obra')} ${para === 'cliente' ? 'necesitamos' : 'nos falta'} (después ya no se pueden hacer):\n${lista(antes)}`);
    }
    if (despues.length) {
        partes.push(`📸 ${b(para === 'cliente' ? 'Durante y al terminar la obra' : 'De la obra, según avance y al terminar')}, ${para === 'cliente' ? 'recuerda hacer fotos de' : 'fotos de'}:\n${lista(despues)}`);
    }
    if (facturas) partes.push(`🧾 ${b('Factura(s)')} de la instalación.`);
    const completo = !antes.length && !despues.length && !facturas;
    if (completo) {
        partes.push(para === 'cliente'
            ? '✅ Ya tenemos todas las fotos de la obra: no tienes que mandarnos nada más por ahora. ¡Gracias!'
            : '✅ Ya tenemos todas las fotos y las facturas de la obra. ¡Gracias!');
    } else {
        partes.push('Las fotos son la parte más importante del proceso para que podamos argumentar ante el ministerio que se ha realizado la reforma.');
        if (enlace) partes.push(`${para === 'cliente' ? 'Puedes subirlas directamente al expediente a través de este enlace' : 'Puedes subirlo de forma rápida y sencilla aquí'}:\n🔗 ${enlace}`);
    }
    return { texto: partes.join('\n\n'), antes, despues, tenemos, facturas, completo, link: enlace };
}

/** El enlace del instalador: el mismo, con su rol. */
const enlaceInstalador = (link) => (link ? `${link}${link.includes('?') ? '&' : '?'}rol=instalador` : null);

async function loadNotificationContext(expediente) {
    const [{ data: cli }, { data: op }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id_cliente', expediente.cliente_id).single(),
        supabase.from('oportunidades').select('*').eq('id', expediente.oportunidad_id).single()
    ]);

    let techName = 'Técnico no asignado';
    const certId = expediente.cee?.certificador_id;
    if (certId) {
        const { data: certData } = await supabase.from('prescriptores').select('razon_social').eq('id_empresa', certId).maybeSingle();
        if (certData?.razon_social) techName = certData.razon_social;
    }

    let partnerPhone = null;
    let partnerEmail = null;
    // Preferimos el INSTALADOR asociado de la obra; si no, el prescriptor genérico.
    const partnerId = op?.instalador_asociado_id || op?.prescriptor_id;
    if (partnerId && String(partnerId) !== '1') {
        // OJO: prescriptores NO tiene columnas `telefono`/`movil` — seleccionarlas hace
        // que supabase-js devuelva error y pData=null (el partner se quedaba sin avisar).
        const { data: pData } = await supabase.from('prescriptores')
            .select('tlf, tlf_contacto, tlf_responsable, landing_telefono_contacto, email, email_contacto, email_responsable, nombre_contacto, contacto_notificaciones_activas')
            .eq('id_empresa', partnerId).maybeSingle();
        if (pData) {
            const useContact = pData.contacto_notificaciones_activas === true || pData.contacto_notificaciones_activas === 'true';
            // Sin desvío activo manda la PERSONA DE CONTACTO (su propio tlf/email);
            // si no los tiene, la empresa. Mismo criterio que partnerNotifyTargets.
            partnerPhone = (useContact ? (pData.tlf_contacto || pData.tlf) : (pData.tlf_responsable || pData.tlf || pData.tlf_contacto)) || pData.landing_telefono_contacto || null;
            partnerEmail = (useContact ? (pData.email_contacto || pData.email) : (pData.email_responsable || pData.email || pData.email_contacto)) || null;
        }
    }

    return { cli, op, techName, partnerPhone, partnerEmail };
}

// Construye los textos de WhatsApp de la notificación de "CEE registrado", por
// destinatario (CLIENTE / PARTNER / ADMIN). Lo usan el envío y la PREVISUALIZACIÓN
// (POST resend-cee-notifications con preview:true) → única fuente de verdad.
// Nota: el email del cliente/staff se envía con su plantilla HTML; estos textos son
// los del canal WhatsApp (y los que se muestran en el preview).
/**
 * A quién se SALUDA en un mensaje al cliente.
 *
 * REGLA — se saluda a QUIEN LO RECIBE. Cuando el cliente tiene el desvío activo,
 * el mensaje sale al teléfono de su PERSONA DE CONTACTO —quien lleva la obra: un
 * hijo, la pareja, el instalador— y saludar al titular delata que el texto está
 * hecho con una plantilla. Medido en 26RES060_187: el aviso de CEE presentado
 * llegaba al WhatsApp de JUAN ANTONIO empezando por «¡Hola MARIA TERESA!».
 *
 * Es solo el SALUDO: en los mensajes a staff y al partner el cliente sigue siendo
 * el titular («Obra: …»), que es de quien hablan.
 */
function nombreParaSaludo(cli) {
    const desvio = cli?.notificaciones_contacto_activas === true
        || cli?.notificaciones_contacto_activas === 'true';
    const contacto = (cli?.persona_contacto_nombre || '').trim();
    if (desvio && contacto) return contacto;
    return (cli?.nombre_razon_social || 'Cliente').trim();
}

/**
 * ¿El aviso "al cliente" lo lee su PERSONA DE CONTACTO (un hijo, o el partner que
 * lleva la relación, como JOSE VICENTE RUIZ SL) y no el titular? Entonces no se
 * le puede hablar de "tu expediente": se le dice de QUIÉN es. Y su email es el del
 * contacto, no el del titular — que era por donde salía el email de "CEE
 * presentado" aunque el WhatsApp sí respetara el desvío.
 */
function avisoCliente(cli) {
    const desvio = cli?.notificaciones_contacto_activas === true
        || cli?.notificaciones_contacto_activas === 'true';
    const tercero = !!(desvio && (cli?.persona_contacto_nombre || '').trim()
        && (cli?.persona_contacto_tlf || cli?.persona_contacto_email));
    const titular = recordatorios.capitalizar(`${cli?.nombre_razon_social || ''} ${cli?.apellidos || ''}`.trim());
    return {
        tercero,
        titular,
        email: (desvio ? (cli?.persona_contacto_email || cli?.email) : (cli?.email || cli?.persona_contacto_email)) || null,
    };
}

// `pend`: lo que falta de la obra (`pendientesObra`); sin él, la lista de siempre.
function buildCeeRegistradoMessages(phase, { numExp, clienteName, clienteFull, portalLink, expedienteLink, tercero = false, titular = '', pend = null }) {
    // "de tu expediente X" al titular; "del expediente X de María Teresa…" a quien
    // lo lee por él.
    const delExp = tercero
        ? `del expediente *${numExp}* de *${titular || clienteFull}*`
        : `de tu expediente *${numExp}*`;
    if (phase === 'final') {
        const clientMsg = `¡Hola *${clienteName}*!\n\nTe comunicamos que ya ha sido presentado el *Certificado de Eficiencia Energética FINAL* ${delExp}.\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
        const staffMsg = `✅ *REGISTRO CEE FINAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Final al sistema.\n\nVer expediente:\n🔗 ${expedienteLink}`;
        return { CLIENTE: clientMsg, PARTNER: staffMsg, ADMIN: staffMsg };
    }
    // ── CEE INICIAL ──
    // Las fotos: solo lo que falta (ver `bloqueFotos`). El enlace de fotos va filtrado
    // a eso; el del portal («consultar el estado»), sin filtro.
    const fotosCliente = bloqueFotos(pend, { para: 'cliente', link: pend?.link || portalLink });
    const portalEstado = (portalLink || '').replace('/subir-docs/', '/mi-expediente/');
    const clientMsg = `¡Hola *${clienteName}*!\n\nTe escribimos para comunicarte que ya ha sido presentado el *Certificado de Eficiencia Energética INICIAL* ${delExp}.\n\n*Desde este momento ya se pueden emitir facturas y pagos*\n\n${fotosCliente.texto}\n\nUna vez finalizada la obra, debes comunicárnoslo por aquí para proceder con el CEE Final y el resto de la documentación.\n\n📄 Y cuando quieras, puedes *consultar el estado ${tercero ? 'del expediente* y el bono que cobrará' : 'de tu expediente* y el bono que cobrarás'} aquí:\n🔗 ${portalEstado}\n\n¡Muchas gracias!\n*BROKERGY — Ingeniería Energética*`;
    const staffMsg = `✅ *REGISTRO CEE INICIAL PRESENTADO*\nExpediente: ${numExp}\nCliente: ${clienteFull}\n\nSe ha subido el justificante de registro del CEE Inicial al sistema. Desde este momento ya se pueden emitir facturas y pagos.\n\nVer expediente:\n🔗 ${expedienteLink}`;
    // Mensaje específico para el INSTALADOR: además de avisar, le pedimos lo que
    // falta de la obra y la factura, con el enlace de subida acotado a su rol.
    const fotosInstalador = bloqueFotos(pend, {
        para: 'instalador',
        link: enlaceInstalador(pend?.link || portalLink) || expedienteLink,
    });
    const pideAlInstalador = fotosInstalador.completo ? '' : 'Para poder seguir tramitando el expediente necesitamos que nos subas lo que falta.\n\n';
    const partnerMsg = `✅ *CEE INICIAL REGISTRADO* — Expediente ${numExp}\nObra: ${clienteFull}\n\nYa está presentado el CEE Inicial: ya se pueden emitir facturas y pagos. 🎉\n\n${pideAlInstalador}${fotosInstalador.texto}\n\n¡Gracias!\n*BROKERGY — Ingeniería Energética*`;
    return { CLIENTE: clientMsg, PARTNER: partnerMsg, ADMIN: staffMsg };
}

async function notifyCeeInicialRegistrado(expediente, filters = {}) {
    const targets  = filters.targets  || ['CLIENTE', 'PARTNER', 'ADMIN'];
    const chFilter = filters.channels || ['email', 'whatsapp'];
    const tag = `[CEE-INICIAL ${expediente.id}]`;
    try {
        const { cli, op, techName, partnerPhone, partnerEmail } = await loadNotificationContext(expediente);
        if (!cli) {
            console.warn(`${tag} cliente_id=${expediente.cliente_id} no encontrado, abortando notificaciones`);
            return { ok: false, reason: 'cliente-not-found' };
        }

        const numExp = expediente.numero_expediente || op?.id_oportunidad || expediente.id;
        // Se saluda a quien RECIBE el mensaje, no siempre al titular.
        const clienteName = nombreParaSaludo(cli);
        const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
        // Enlace UNIFICADO de subida de fotos/docs (/subir-docs/:uuid?token=)
        const portalLink = op?.id
            ? await reformaUploadService.ensureUploadLink(op.id)
            : `https://app.brokergy.es/firma/${expediente.id}`;
        const expedienteLink = `https://app.brokergy.es/?exp=${expediente.id}`;

        const waState = whatsappService.getStatus?.()?.state || 'unknown';
        const cliPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
        console.log(`${tag} Disparando notificaciones (targets=[${targets}], channels=[${chFilter}], wa=${waState})`);

        const channels = { whatsapp: [], email: [] };

        // Textos por destinatario (compartidos con la previsualización). El admin puede
        // sobrescribirlos desde el modal de reenvío (filters.overrides).
        // Lo que falta de la obra: lo que piden los mensajes (y el email del cliente).
        const pend = await pendientesObra(op?.id);
        const msgs = buildCeeRegistradoMessages('inicial', { numExp, clienteName, clienteFull, portalLink, expedienteLink, pend, ...avisoCliente(cli) });
        const overrides = filters.overrides || {};
        if (filters.preview) return { ok: true, preview: msgs };
        const clientMsg = overrides.CLIENTE || msgs.CLIENTE;
        const adminMsg  = overrides.ADMIN  || msgs.ADMIN;
        const partnerMsg = overrides.PARTNER || msgs.PARTNER;

        // --- WHATSAPP ---
        if (chFilter.includes('whatsapp')) {
            if (targets.includes('CLIENTE') && cliPhone) {
                channels.whatsapp.push('cliente');
                // Cada aviso que ya se manda le enseña al bot de WhatsApp de qué
                // obra habla este chat. Es la pista más débil de las tres y la
                // más abundante: no cuesta nada y va en diferido.
                botVinculos.sembrarEnDiferido(cliPhone, expediente.oportunidad_id);
                whatsappService.sendText(cliPhone, clientMsg)
                    .catch(e => console.error(`${tag} WhatsApp Cliente:`, e.message));
            } else if (targets.includes('CLIENTE') && !cliPhone) {
                console.warn(`${tag} Cliente sin teléfono, no se envía WhatsApp`);
            }

            if (targets.includes('ADMIN')) {
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
                channels.whatsapp.push('admin');
                whatsappService.sendText(adminPhone, adminMsg)
                    .catch(e => console.error(`${tag} WhatsApp Admin:`, e.message));
            }

            if (targets.includes('PARTNER') && partnerPhone) {
                channels.whatsapp.push('partner');
                botVinculos.sembrarEnDiferido(partnerPhone, expediente.oportunidad_id);
                whatsappService.sendText(partnerPhone, partnerMsg)
                    .catch(e => console.error(`${tag} WhatsApp Partner:`, e.message));
            }
        }

        // --- EMAIL ---
        if (chFilter.includes('email')) {
            const av = avisoCliente(cli);
            if (targets.includes('CLIENTE') && av.email) {
                channels.email.push('cliente');
                const fotos = bloqueFotos(pend, { para: 'cliente', wa: false, link: pend?.link || portalLink });
                await emailService.sendCeeInicialRegistradoClientEmail(av.email, clienteName, numExp, portalLink, av.tercero ? av.titular : null, fotos)
                    .catch(e => console.error(`${tag} Email Cliente:`, e.message));
            }
            if (targets.includes('ADMIN')) {
                channels.email.push('admin');
                await emailService.sendCeeRegistradoStaffEmail('franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, techName, 'CEE INICIAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Admin:`, e.message));
            }
            if (targets.includes('PARTNER') && partnerEmail) {
                channels.email.push('partner');
                await emailService.sendCeeRegistradoStaffEmail(partnerEmail, true, numExp, clienteFull, ubicacion, techName, 'CEE INICIAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Partner:`, e.message));
            }
        }

        console.log(`${tag} Disparado: whatsapp=[${channels.whatsapp.join(',')}] email=[${channels.email.join(',')}]`);
        return { ok: true, whatsappState: waState, channels };
    } catch (err) {
        console.error(`${tag} Error en notificaciones:`, err);
        return { ok: false, reason: err.message };
    }
}

async function notifyCeeFinalRegistrado(expediente, filters = {}) {
    const targets  = filters.targets  || ['CLIENTE', 'PARTNER', 'ADMIN'];
    const chFilter = filters.channels || ['email', 'whatsapp'];
    const tag = `[CEE-FINAL ${expediente.id}]`;
    try {
        const { cli, op, techName, partnerPhone, partnerEmail } = await loadNotificationContext(expediente);
        if (!cli) {
            console.warn(`${tag} cliente_id=${expediente.cliente_id} no encontrado, abortando notificaciones`);
            return { ok: false, reason: 'cliente-not-found' };
        }

        const numExp = expediente.numero_expediente || op?.id_oportunidad || expediente.id;
        // Se saluda a quien RECIBE el mensaje, no siempre al titular.
        const clienteName = nombreParaSaludo(cli);
        const clienteFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
        const ubicacion = `${cli.direccion || ''} - ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
        const expedienteLink = `https://app.brokergy.es/?exp=${expediente.id}`;

        const waState = whatsappService.getStatus?.()?.state || 'unknown';
        const cliPhone = (cli.notificaciones_contacto_activas && cli.persona_contacto_tlf) ? cli.persona_contacto_tlf : cli.tlf;
        console.log(`${tag} Disparando notificaciones (targets=[${targets}], channels=[${chFilter}], wa=${waState})`);

        const channels = { whatsapp: [], email: [] };

        // Textos por destinatario (compartidos con la previsualización) + overrides del admin.
        const msgs = buildCeeRegistradoMessages('final', { numExp, clienteName, clienteFull, portalLink: null, expedienteLink, ...avisoCliente(cli) });
        const overrides = filters.overrides || {};
        if (filters.preview) return { ok: true, preview: msgs };
        const clientMsg = overrides.CLIENTE || msgs.CLIENTE;
        const adminMsg  = overrides.ADMIN  || msgs.ADMIN;
        const partnerMsg = overrides.PARTNER || msgs.PARTNER;

        // --- WHATSAPP ---
        if (chFilter.includes('whatsapp')) {
            if (targets.includes('CLIENTE') && cliPhone) {
                channels.whatsapp.push('cliente');
                whatsappService.sendText(cliPhone, clientMsg)
                    .catch(e => console.error(`${tag} WhatsApp Cliente:`, e.message));
            } else if (targets.includes('CLIENTE') && !cliPhone) {
                console.warn(`${tag} Cliente sin teléfono, no se envía WhatsApp`);
            }

            if (targets.includes('ADMIN')) {
                const adminPhone = process.env.WHATSAPP_ADMIN_CHAT || '34623926179';
                channels.whatsapp.push('admin');
                whatsappService.sendText(adminPhone, adminMsg)
                    .catch(e => console.error(`${tag} WhatsApp Admin:`, e.message));
            }

            if (targets.includes('PARTNER') && partnerPhone) {
                channels.whatsapp.push('partner');
                whatsappService.sendText(partnerPhone, partnerMsg)
                    .catch(e => console.error(`${tag} WhatsApp Partner:`, e.message));
            }
        }

        // --- EMAIL ---
        if (chFilter.includes('email')) {
            if (targets.includes('ADMIN')) {
                channels.email.push('admin');
                await emailService.sendCeeRegistradoStaffEmail('franciscojavier.moya.s2e2@gmail.com', false, numExp, clienteFull, ubicacion, techName, 'CEE FINAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Admin:`, e.message));
            }
            if (targets.includes('PARTNER') && partnerEmail) {
                channels.email.push('partner');
                await emailService.sendCeeRegistradoStaffEmail(partnerEmail, true, numExp, clienteFull, ubicacion, techName, 'CEE FINAL', expedienteLink)
                    .catch(e => console.error(`${tag} Email Partner:`, e.message));
            }
        }

        console.log(`${tag} Disparado: whatsapp=[${channels.whatsapp.join(',')}] email=[${channels.email.join(',')}]`);
        return { ok: true, whatsappState: waState, channels };
    } catch (err) {
        console.error(`${tag} Error en notificaciones:`, err);
        return { ok: false, reason: err.message };
    }
}

// Apagado solo con `CEE_REGISTRO_AVISO_AUTO=false` (el .env LOCAL: local = producción).
const avisoAutoActivado = () => String(process.env.CEE_REGISTRO_AVISO_AUTO ?? 'true').toLowerCase() !== 'false';

/**
 * REGLA — cuando el CEE INICIAL lo presenta la CASA (skill `presentar-cee`, por la
 * ruta interna `/presentacion-cee/devuelto`), el aviso al CLIENTE y al INSTALADOR
 * sale SOLO, sin esperar al botón «📱 Notificar al Cliente» del email (decisión de
 * Fran, 25/10/2026). Cuando lo sube un técnico o quien presenta por su enlace, sigue
 * como siempre: el equipo decide desde el email o desde el popup.
 *
 * Solo una vez: quien llama lo dispara solo si ESTA subida ha pasado la fase a
 * REGISTRADO (`yaRegistrado` falso). Al equipo no se le manda nada más: ya tiene el
 * email del registro, y el historial dice a quién ha salido.
 */
async function avisarTrasPresentar(expedienteId, { quien = 'la presentación automática' } = {}) {
    const tag = `[CEE-INICIAL ${expedienteId}] aviso automático`;
    if (!avisoAutoActivado()) {
        console.log(`${tag}: SIMULADO (CEE_REGISTRO_AVISO_AUTO=false)`);
        return { ok: false, reason: 'apagado' };
    }
    const { data: exp } = await supabase.from('expedientes').select('*').eq('id', expedienteId).maybeSingle();
    if (!exp) return { ok: false, reason: 'expediente-no-encontrado' };
    if (exp.seguimiento?.cee_inicial !== 'REGISTRADO') return { ok: false, reason: 'no-registrado' };

    const r = await notifyCeeInicialRegistrado(exp, { targets: ['CLIENTE', 'PARTNER'] });
    const nombres = { cliente: 'cliente', partner: 'instalador' };
    const canales = r.channels
        ? [...r.channels.whatsapp.map(c => `WhatsApp al ${nombres[c] || c}`), ...r.channels.email.map(c => `email al ${nombres[c] || c}`)]
        : [];
    const texto = r.ok
        ? `📣 Aviso de CEE INICIAL presentado enviado automáticamente tras ${quien}: ${canales.join(', ') || 'a nadie (sin teléfono ni email del cliente ni del instalador)'}.`
        : `⚠️ No se pudo mandar el aviso de CEE INICIAL presentado tras ${quien} (${r.reason}). Reenvíalo desde el módulo CEE.`;
    try {
        await supabase.rpc('merge_expediente_doc_json', {
            p_expediente_id: exp.id, p_field: 'historial',
            p_value: [{ id: `${Date.now()}_aviso_registro_auto`, tipo: 'informativo', texto, fecha: new Date().toISOString(), usuario: 'CLAUDE' }],
        });
    } catch (e) { console.warn(`${tag} historial:`, e.message); }
    console.log(`${tag}: ${texto}`);
    return { ...r, texto };
}

module.exports = {
    FOTOS_DE_SIEMPRE,
    pendientesObra,
    bloqueFotos,
    enlaceInstalador,
    loadNotificationContext,
    nombreParaSaludo,
    avisoCliente,
    buildCeeRegistradoMessages,
    notifyCeeInicialRegistrado,
    notifyCeeFinalRegistrado,
    avisoAutoActivado,
    avisarTrasPresentar,
};
