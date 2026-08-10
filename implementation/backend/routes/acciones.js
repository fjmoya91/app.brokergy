// ─── routes/acciones — resolver un atasco desde el parte, sin entrar en la app ──
//
// Cada línea del parte diario (`seguimientoDiario.js`) trae un enlace firmado que
// abre una de estas páginas: el mensaje ya redactado, el destinatario resuelto y los
// canales marcados. Lo lees, lo retocas si quieres y lo mandas.
//
// POR QUÉ HAY PÁGINA Y NO ENVÍO DE UN CLIC. Estos mensajes van a TERCEROS —un
// certificador, un cliente—, se mandan por WhatsApp desde nuestro número y no se
// pueden retirar. El enlace autoriza a PREPARAR el envío; ejecutarlo es siempre un
// acto deliberado. (El botón de "dar visto bueno" del email sí es de un clic, pero
// aquello se lo aprueba uno a sí mismo: el peor caso es aprobarlo dos veces.)
//
// EL ENVÍO NO SE IMPLEMENTA AQUÍ. Se delega en las rutas que ya existen
// —`notify-certificador` y `solicitar-faltantes`— llamándolas con la clave interna,
// igual que hace el MCP. Así el texto, el sellado del seguimiento y el apunte en el
// historial son EXACTAMENTE los mismos que si hubieras escrito desde el expediente.
// Duplicarlo aquí habría creado una segunda verdad que se desincroniza a la primera.

const express = require('express');
const router = express.Router();
const axios = require('axios');
const supabase = require('../services/supabaseClient');
const { verificarAccion } = require('../utils/accionToken');
const recordatorios = require('../services/recordatorios');
const seguimientoDiario = require('../services/seguimientoDiario');
const { dias: diasDesde } = require('../services/seguimientoRadar');

const API = () => `http://127.0.0.1:${process.env.PORT_EFECTIVO || process.env.PORT || 3000}/api`;
const cabeceraInterna = () => ({ 'x-internal-key': process.env.INTERNAL_API_KEY || '' });
const FRONTEND = () => process.env.FRONTEND_URL || 'https://app.brokergy.es';

const escapar = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ─── Los tipos de acción ──────────────────────────────────────────────────────
// `via` decide a qué ruta existente se delega el envío.
const TIPOS = {
    'cert-registro': {
        via: 'certificador', titulo: 'Recordar el registro en Industria',
        entradilla: 'Este CEE tiene tu visto bueno y sigue sin registrarse. El mensaje le recuerda que lo presente y le da el enlace para subir la etiqueta y el justificante.',
    },
    'cert-emision': {
        via: 'certificador', titulo: 'Pedir fecha de entrega del CEE',
        entradilla: 'El encargo salió hace días y el certificador todavía no ha entregado el .cex. El mensaje le pide una estimación.',
    },
    'fin-obra': {
        via: 'solicitud', titulo: '¿Cómo va la obra?',
        entradilla: 'El CEE inicial se registró hace tiempo y no hay señales de que la obra se haya hecho. El mensaje pregunta cómo va y recuerda qué falta por su parte, con los enlaces para subirlo.',
    },
    'recordar-firma': {
        via: 'solicitud', titulo: 'Recordar una firma pendiente',
        entradilla: 'El documento salió a firma y no ha vuelto. El mensaje lo recuerda con el enlace directo de firma.',
    },
};

// Documentos que pueden estar pendientes de firma, y quién los firma.
// `barrido` es la clave que usa el checklist del expediente para el MISMO ítem: es lo
// que permite que "la firma se pidió el 21/07" aparezca luego en el barrido.
const DOCS_FIRMA = {
    anexo_i:       { label: 'Anexo I', target: 'CLIENTE', ruta: 'firmar-anexos', barrido: 'anexo_i_firmado' },
    anexo_cesion:  { label: 'Anexo de Cesión de Ahorros', target: 'CLIENTE', ruta: 'firmar-anexos', barrido: 'cesion_firmado' },
    cert_cifo:     { label: 'Certificado de Instalación (CIFO)', target: 'INSTALADOR', ruta: 'subir-cifo', barrido: 'cifo' },
};

const clavesBarrido = (target) => Object.values(DOCS_FIRMA)
    .filter(s => s.target === target).map(s => s.barrido);

// ─── Chapa y pintura ──────────────────────────────────────────────────────────

const pagina = (res, { ok = true, titulo, cuerpo, ancho = 620 }) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BROKERGY · ${escapar(titulo)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#0a0e1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0;padding:20px;min-height:100vh}
  .card{background:#111827;border:1px solid #334155;border-radius:18px;padding:26px;max-width:${ancho}px;margin:0 auto}
  h1{font-size:19px;color:#fff;margin-bottom:6px}
  h2{font-size:15px;color:${ok ? '#10b981' : '#ef4444'};margin-bottom:10px}
  p{color:#94a3b8;line-height:1.55;font-size:14px;margin-bottom:12px}
  .exp{display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:5px 11px;color:#fb923c;font-weight:bold;font-size:13px;margin-bottom:14px}
  .dest{background:#0f172a;border:1px solid #334155;border-radius:12px;padding:14px;margin-bottom:14px}
  .dest h3{font-size:13px;color:#fff;margin-bottom:4px}
  .dest .who{font-size:12px;color:#64748b;margin-bottom:10px}
  textarea{width:100%;min-height:230px;background:#0a0e1a;border:1px solid #334155;border-radius:10px;color:#e2e8f0;padding:12px;font-family:inherit;font-size:13px;line-height:1.5;resize:vertical}
  label.ch{display:inline-flex;align-items:center;gap:7px;color:#cbd5e1;font-size:13px;margin-right:16px;margin-top:10px;cursor:pointer}
  input[type=checkbox]{width:17px;height:17px;accent-color:#FF6D00;cursor:pointer}
  button{background:#FF6D00;color:#fff;border:0;border-radius:11px;padding:14px 24px;font-weight:bold;font-size:15px;cursor:pointer;width:100%;margin-top:18px}
  button:disabled{opacity:.5;cursor:not-allowed}
  .sec{background:transparent;border:1px solid #334155;color:#94a3b8;font-weight:normal;font-size:13px;padding:10px}
  .warn{background:#422006;border:1px solid #854d0e;color:#fde68a;border-radius:10px;padding:11px;font-size:12.5px;margin-bottom:14px}
  .brand{color:#475569;font-size:11px;margin-top:24px;text-align:center;letter-spacing:.05em}
  a{color:#fb923c}
  #out{margin-top:14px;font-size:14px}
</style></head><body><div class="card">${cuerpo}
<div class="brand">BROKERGY · Ingeniería Energética</div></div></body></html>`);
};

const paginaError = (res, titulo, mensaje) =>
    pagina(res, { ok: false, titulo, ancho: 440, cuerpo:
        `<div style="text-align:center"><div style="font-size:44px;margin-bottom:12px">⚠️</div>
         <h2>${escapar(titulo)}</h2><p>${escapar(mensaje)}</p>
         <p><a href="${FRONTEND()}/?tab=expedientes">Abrir la app</a></p></div>` });

/** Valida la firma del enlace y deja `req.scope` listo. */
function comprobarFirma(req, res, next) {
    const { tipo, expId } = req.params;
    const { e, s, p } = req.query;
    const v = verificarAccion(tipo, expId, p || null, e, s);
    if (!v.ok) {
        const msg = v.motivo === 'caducado'
            ? 'Este enlace ha caducado (los enlaces del parte duran 14 días). Abre el expediente en la app o espera al parte de mañana.'
            : 'El enlace no es válido. Abre el expediente desde la app.';
        return paginaError(res, v.motivo === 'caducado' ? 'Enlace caducado' : 'Enlace no válido', msg);
    }
    req.scope = p || null;
    next();
}

// ─── Preparación del envío según el tipo ──────────────────────────────────────

/** Ficha del certificador + mensaje propuesto. */
async function prepararCertificador(expId, tipo, scope) {
    const phase = scope === 'final' ? 'final' : 'inicial';
    const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';

    const { data: exp } = await supabase.from('expedientes')
        .select('id, numero_expediente, cliente_id, certificador_id:cee->>certificador_id, folder:cee->>cee_folder_link')
        .eq('id', expId).maybeSingle();
    if (!exp) return { error: 'Expediente no encontrado.' };
    if (!exp.certificador_id) return { error: 'Este expediente no tiene certificador asignado. Asígnalo desde la app.' };

    const { data: cert } = await supabase.from('prescriptores')
        .select('razon_social, acronimo, email, tlf, tlf_contacto, landing_telefono_contacto')
        .eq('id_empresa', exp.certificador_id).maybeSingle();
    if (!cert) return { error: 'No se encuentra el certificador en la base de datos.' };

    let clienteName = '';
    if (exp.cliente_id) {
        const { data: cli } = await supabase.from('clientes')
            .select('nombre_razon_social, apellidos').eq('id_cliente', exp.cliente_id).maybeSingle();
        if (cli) clienteName = recordatorios.capitalizar(`${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim());
    }

    const certName = cert.razon_social || cert.acronimo || 'Técnico';
    let mensaje;
    if (tipo === 'cert-registro') {
        // El enlace de subida del CEE registrado es la acción que le pedimos: sin él,
        // el mensaje le dice qué hacer pero no por dónde.
        let subirWa = '';
        try {
            const ceeUploadService = require('../services/ceeUploadService');
            const tok = ceeUploadService.ceeUploadSignature(expId, phase);
            subirWa = `\n\n📤 Sube aquí el ${phaseLabel} registrado (etiqueta + justificante):\n${FRONTEND()}/subir-cee/${expId}?token=${tok}&phase=${phase}`;
        } catch (err) { console.warn('[acciones] enlace subir-cee:', err.message); }
        mensaje = recordatorios.certRegistroWa({ certName, phaseLabel, expedienteNum: exp.numero_expediente, clienteName, subirWa });
    } else {
        mensaje = recordatorios.certEmisionWa({
            certName, phaseLabel, expedienteNum: exp.numero_expediente, clienteName,
            ceeFolderLink: exp.folder || null, portalLink: `${FRONTEND()}/?exp=${expId}`,
        });
    }

    const tlf = cert.tlf || cert.tlf_contacto || cert.landing_telefono_contacto || null;
    return {
        numExp: exp.numero_expediente,
        subtitulo: `${phaseLabel}${clienteName ? ` · ${clienteName}` : ''}`,
        destinatarios: [{
            id: 'CERTIFICADOR', rol: 'Certificador', nombre: certName,
            email: cert.email || null, tlf, mensaje, marcado: true,
        }],
        phase,
    };
}

/** Contactos + lo que falta + mensaje propuesto, vía la ruta `solicitud-info`. */
async function prepararSolicitud(expId, tipo, scope) {
    let info;
    try {
        const r = await axios.get(`${API()}/expedientes/${expId}/solicitud-info`, { headers: cabeceraInterna(), timeout: 25000 });
        info = r.data;
    } catch (err) {
        console.error('[acciones] solicitud-info:', err.response?.data?.error || err.message);
        return { error: 'No se han podido cargar los datos del expediente. Ábrelo en la app.' };
    }

    const { data: exp } = await supabase.from('expedientes')
        .select(`seguimiento,
                 fecha_reg:documentacion->>fecha_registro_cee_inicial,
                 sent_i:documentacion->>anexo_i_sent_at,     signed_i:documentacion->>anexo_i_signed_link,
                 sent_c:documentacion->>anexo_cesion_sent_at, signed_c:documentacion->>anexo_cesion_signed_link,
                 sent_f:documentacion->>cert_cifo_sent_at,    signed_f:documentacion->>cert_cifo_signed_link`.replace(/\s+/g, ''))
        .eq('id', expId).maybeSingle();

    const destinatarios = [];

    if (tipo === 'fin-obra') {
        const d = diasDesde(exp?.fecha_reg || exp?.seguimiento?.cee_inicial_ts?.REGISTRADO) ?? 0;
        // Los dos se ofrecen; viene marcado el instalador cuando lo hay, que es quien
        // sabe de verdad cómo va la obra. Marcar los dos por defecto duplicaría el
        // mensaje en casi todos los expedientes.
        const hayIns = !!(info.instalador?.tlf || info.instalador?.email);
        for (const [id, c, esIns] of [['INSTALADOR', info.instalador, true], ['CLIENTE', info.cliente, false]]) {
            if (!c?.tlf && !c?.email) continue;
            destinatarios.push({
                id, rol: esIns ? 'Instalador' : 'Cliente', nombre: c.nombre || (esIns ? 'Instalador' : 'Cliente'),
                email: c.email || null, tlf: c.tlf || null,
                marcado: esIns ? hayIns : !hayIns,
                mensaje: recordatorios.finObraMsg({
                    destinatario: c.nombre, esInstalador: esIns, numExp: info.numero_expediente,
                    obra: info.obra, dias: d, acciones: esIns ? info.instalador?.acciones : info.cliente?.acciones,
                    uploadBase: info.uploadBase,
                }),
            });
        }
    } else {
        // `scope` es el FIRMANTE, no un documento: al cliente le pueden faltar el
        // Anexo I y la Cesión a la vez y los firma de una sentada en el mismo enlace.
        const esIns = String(scope).toUpperCase() === 'INSTALADOR';
        const target = esIns ? 'INSTALADOR' : 'CLIENTE';

        // Qué sigue sin firmar AHORA MISMO, no cuando se generó el parte: el enlace
        // vive 14 días y en ese tiempo el firmante puede haber devuelto uno de los dos.
        // Prometerle "te falta el Anexo I" cuando ya lo firmó lo manda a un enlace que
        // no le pide nada y nos deja como si no lleváramos la cuenta.
        const CAMPOS = {
            anexo_i:      { sent: exp?.sent_i, signed: exp?.signed_i },
            anexo_cesion: { sent: exp?.sent_c, signed: exp?.signed_c },
            cert_cifo:    { sent: exp?.sent_f, signed: exp?.signed_f },
        };
        const pendientes = Object.entries(DOCS_FIRMA)
            .filter(([k, spec]) => spec.target === target && CAMPOS[k].sent && !CAMPOS[k].signed)
            .map(([k, spec]) => ({ ...spec, sentAt: CAMPOS[k].sent }));

        if (!pendientes.length) {
            return { error: `Ya no hay nada pendiente de firma por parte del ${esIns ? 'instalador' : 'cliente'}: los documentos han vuelto firmados.` };
        }

        const c = esIns ? info.instalador : info.cliente;
        if (!c?.tlf && !c?.email) {
            return { error: `No hay teléfono ni email del ${esIns ? 'instalador' : 'cliente'}. Complétalo en su ficha.` };
        }
        const masViejo = pendientes.reduce((a, p) => (diasDesde(p.sentAt) ?? 0) > (diasDesde(a.sentAt) ?? 0) ? p : a);
        destinatarios.push({
            id: target, rol: esIns ? 'Instalador' : 'Cliente', nombre: c.nombre || target,
            email: c.email || null, tlf: c.tlf || null, marcado: true,
            mensaje: recordatorios.firmaMsg({
                destinatario: c.nombre, docs: pendientes.map(p => p.label), numExp: info.numero_expediente,
                obra: info.obra, dias: diasDesde(masViejo.sentAt) ?? 0,
                url: `${FRONTEND()}/${pendientes[0].ruta}/${expId}`, esInstalador: esIns,
            }),
        });
    }

    if (!destinatarios.length) {
        return { error: 'No hay ningún contacto con teléfono ni email para este expediente. Complétalo en la app.' };
    }
    return {
        numExp: info.numero_expediente,
        subtitulo: [info.obra?.cliente, info.obra?.direccion].filter(Boolean).join(' · '),
        destinatarios,
    };
}

const preparar = (expId, tipo, scope) => (TIPOS[tipo].via === 'certificador'
    ? prepararCertificador(expId, tipo, scope)
    : prepararSolicitud(expId, tipo, scope));

// ─── El parte completo, en el navegador ───────────────────────────────────────
// El WhatsApp solo lleva el titular y lo accionable; aquí está todo.
//
// ⚠️ VA ANTES que `/:tipo/:expId` a propósito: Express resuelve por orden de
// declaración y si se pone después, "parte/global" entra por la ruta paramétrica
// como si `parte` fuese un tipo de acción y responde "acción desconocida".
router.get('/parte/global', async (req, res) => {
    const { e, s } = req.query;
    const v = verificarAccion('parte', 'global', null, e, s);
    if (!v.ok) {
        return paginaError(res, v.motivo === 'caducado' ? 'Enlace caducado' : 'Enlace no válido',
            v.motivo === 'caducado' ? 'Este parte ya no está disponible. Mira el del día en tu correo.' : 'El enlace no es válido.');
    }
    try {
        const parte = await seguimientoDiario.generarParte();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BROKERGY · Parte de seguimiento</title>
<style>body{background:#f1f5f9;margin:0;padding:16px}</style></head>
<body>${parte.html}</body></html>`);
    } catch (err) {
        console.error('[acciones parte]', err.message);
        paginaError(res, 'Error', 'No se ha podido generar el parte.');
    }
});

// ─── GET — la página con el mensaje editable ──────────────────────────────────

router.get('/:tipo/:expId', comprobarFirma, async (req, res) => {
    const { tipo, expId } = req.params;
    const def = TIPOS[tipo];
    if (!def) return paginaError(res, 'Acción desconocida', 'Este enlace no corresponde a ninguna acción.');

    try {
        const prep = await preparar(expId, tipo, req.scope);
        if (prep.error) return paginaError(res, 'No se puede preparar el mensaje', prep.error);

        const bloques = prep.destinatarios.map((d, i) => {
            const canales = [
                d.tlf   ? `<label class="ch"><input type="checkbox" data-canal="whatsapp" data-i="${i}" checked> WhatsApp <span style="color:#475569">${escapar(d.tlf)}</span></label>` : '',
                d.email ? `<label class="ch"><input type="checkbox" data-canal="email" data-i="${i}" ${d.tlf ? '' : 'checked'}> Email <span style="color:#475569">${escapar(d.email)}</span></label>` : '',
            ].filter(Boolean).join('');
            return `<div class="dest">
                <label class="ch" style="margin:0 0 8px"><input type="checkbox" data-dest="${i}" ${d.marcado ? 'checked' : ''}>
                  <strong style="color:#fff">Enviar a ${escapar(d.rol)}</strong></label>
                <div class="who">${escapar(d.nombre || '—')}</div>
                <textarea data-msg="${i}">${escapar(d.mensaje)}</textarea>
                <div>${canales}</div>
              </div>`;
        }).join('');

        const payloadDest = prep.destinatarios.map(d => ({ id: d.id, tlf: d.tlf, email: d.email }));

        pagina(res, { titulo: def.titulo, cuerpo: `
            <h1>${escapar(def.titulo)}</h1>
            <div class="exp">${escapar(prep.numExp || expId)}${prep.subtitulo ? ` · ${escapar(prep.subtitulo)}` : ''}</div>
            <p>${escapar(def.entradilla)}</p>
            <div class="warn">Revisa el texto antes de enviarlo. Sale desde el WhatsApp y el correo de Brokergy, y no se puede retirar.</div>
            ${bloques}
            <button id="go">Enviar</button>
            <button class="sec" onclick="location.href='${FRONTEND()}/?exp=${escapar(expId)}'">Prefiero abrir el expediente</button>
            <div id="out"></div>
            <script>
              const DEST = ${JSON.stringify(payloadDest)};
              const btn = document.getElementById('go'), out = document.getElementById('out');
              btn.onclick = async () => {
                const envios = [];
                DEST.forEach((d, i) => {
                  if (!document.querySelector('[data-dest="' + i + '"]').checked) return;
                  const canales = [...document.querySelectorAll('[data-i="' + i + '"]')]
                    .filter(c => c.checked).map(c => c.dataset.canal);
                  if (!canales.length) return;
                  envios.push({ target: d.id, canales, mensaje: document.querySelector('[data-msg="' + i + '"]').value });
                });
                if (!envios.length) { out.innerHTML = '<span style="color:#fbbf24">Marca al menos un destinatario y un canal.</span>'; return; }
                btn.disabled = true; btn.textContent = 'Enviando…'; out.textContent = '';
                try {
                  const r = await fetch(location.pathname + location.search, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ envios })
                  });
                  const j = await r.json();
                  if (!r.ok || !j.ok) throw new Error(j.error || 'No se pudo enviar');
                  out.innerHTML = '<span style="color:#10b981">✅ ' + j.resumen + '</span>';
                  btn.textContent = 'Enviado';
                } catch (err) {
                  out.innerHTML = '<span style="color:#ef4444">❌ ' + err.message + '</span>';
                  btn.disabled = false; btn.textContent = 'Reintentar';
                }
              };
            </script>` });
    } catch (err) {
        console.error('[acciones GET]', err.message);
        paginaError(res, 'Error', 'No se ha podido preparar la acción. Inténtalo desde la app.');
    }
});

// ─── POST — ejecuta el envío ──────────────────────────────────────────────────

router.post('/:tipo/:expId', express.json(), comprobarFirma, async (req, res) => {
    const { tipo, expId } = req.params;
    const def = TIPOS[tipo];
    if (!def) return res.status(400).json({ error: 'Acción desconocida' });

    const envios = Array.isArray(req.body?.envios) ? req.body.envios : [];
    if (!envios.length) return res.status(400).json({ error: 'No hay nada que enviar' });

    try {
        // El asunto del email lleva el nº de expediente: es lo que hace buscable el
        // hilo después. La página no lo manda de vuelta, así que se lee aquí.
        const { data: e } = await supabase.from('expedientes')
            .select('numero_expediente').eq('id', expId).maybeSingle();
        const numExp = e?.numero_expediente || '';

        const hechos = [];
        for (const envio of envios) {
            const canales = (envio.canales || []).filter(c => ['whatsapp', 'email'].includes(c));
            const mensaje = String(envio.mensaje || '').trim();
            if (!canales.length || !mensaje) continue;

            if (def.via === 'certificador') {
                // Se delega en la ruta de siempre: ella sella el seguimiento
                // (`cee_*_last_contacto_at`) y escribe el historial.
                await axios.post(`${API()}/expedientes/${expId}/notify-certificador`, {
                    phase: req.scope === 'final' ? 'final' : 'initial',
                    template: 'reminder',
                    espera: tipo === 'cert-registro' ? 'registro' : 'emision',
                    sendEmail: canales.includes('email'),
                    sendWhatsApp: canales.includes('whatsapp'),
                    customMessage: mensaje,
                    origen: 'parte',
                }, { headers: cabeceraInterna(), timeout: 60000 });
                hechos.push(`certificador (${canales.join(' + ')})`);
            } else {
                const target = envio.target === 'INSTALADOR' ? 'INSTALADOR' : 'CLIENTE';
                await axios.post(`${API()}/expedientes/${expId}/solicitar-faltantes`, {
                    target, channels: canales, mensaje,
                    asunto: tipo === 'fin-obra'
                        ? `¿Cómo va la obra? — expediente ${numExp}`
                        : `Documentación pendiente de firma — expediente ${numExp}`,
                    solicitado: [def.titulo],
                    // Claves del BARRIDO, para que el checklist del expediente sepa que
                    // esto ya se pidió y cuándo. Son las suyas, no el nombre del
                    // destinatario: si no, la huella se pega a un ítem inexistente.
                    solicitado_keys: tipo === 'recordar-firma' ? clavesBarrido(target) : [],
                }, { headers: cabeceraInterna(), timeout: 60000 });
                hechos.push(`${target.toLowerCase()} (${canales.join(' + ')})`);
            }
        }

        if (!hechos.length) return res.status(400).json({ error: 'No se ha enviado nada: falta el mensaje o el canal.' });

        await sellarRecordatorio(expId, tipo, req.scope, envios);
        res.json({ ok: true, resumen: `Enviado a ${hechos.join(' y ')}.` });
    } catch (err) {
        const detalle = err.response?.data?.error || err.message;
        console.error('[acciones POST]', detalle);
        res.status(500).json({ error: detalle });
    }
});

/**
 * Deja constancia de que ESTO ya se ha reclamado. El parte lo lee para no volver a
 * ofrecer el botón hasta pasados los días de reinsistencia del bloque: sin esta
 * marca, el mismo cliente recibiría el mismo "¿cómo va la obra?" cada mañana.
 *
 * Se escribe con la RPC de MERGE, nunca por reemplazo: en `documentacion.recordatorios`
 * conviven las marcas de todos los tipos y se sellan en momentos distintos.
 */
async function sellarRecordatorio(expId, tipo, scope, envios) {
    const clave = tipo === 'fin-obra' ? 'fin-obra' : `${tipo}:${scope || 'inicial'}`;
    try {
        const { error } = await supabase.rpc('merge_expediente_doc_json', {
            p_expediente_id: expId,
            p_field: 'recordatorios',
            p_value: {
                [clave]: {
                    at: new Date().toISOString(),
                    target: envios.map(e => e.target).filter(Boolean).join('+') || null,
                    canales: [...new Set(envios.flatMap(e => e.canales || []))],
                    origen: 'parte',
                },
            },
        });
        if (error) console.warn('[acciones] sellar recordatorio:', error.message);
    } catch (err) {
        console.warn('[acciones] sellar recordatorio:', err.message);
    }
}

module.exports = router;
