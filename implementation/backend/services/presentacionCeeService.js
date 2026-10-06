// ─── presentacionCeeService.js ───────────────────────────────────────────────
// ENCARGAR LA PRESENTACIÓN de un CEE a una persona de fuera (Eva), sin cuenta en
// la app.
//
// Cuando el certificado está firmado y con el visto bueno, quien lo presenta en el
// Registro necesita tres ficheros y saber qué va en cada casilla del formulario.
// Esto se lo manda por EMAIL —los tres ficheros adjuntos— con un ENLACE a una
// página (`/presentar/:negocio/:id`) donde tiene el borrador para copiar, los
// mismos ficheros para descargar y dónde subir el justificante de registro y el
// recibo de la tasa cuando los tenga. Al subir el justificante se lee su fecha y
// la fase queda REGISTRADA, por el MISMO camino que la subida del técnico
// (`services/cee/subidaCeePublica.js`).
//
// REGLA — a quien presenta se le mandan SIEMPRE el .cex, el .xml y el PDF
// FIRMADO, y NADA más (decisión del usuario, 2026-10-06). Ni el informe de
// medidas de mejora, ni el registro, ni la etiqueta, ni el croquis. Y un fichero
// con «REVISAR» en el nombre NO se manda nunca: es un borrador de la app, no el
// certificado. Si falta alguno de los tres, no sale nada (todo o nada): un correo
// sin el PDF firmado obliga a pedirlo otra vez y el plazo de un mes corre.
//
// REGLA — sin cuenta y sin un euro. La página no lleva importes porque no los
// tiene: solo el borrador del Registro (titular, inmueble, calificaciones) y los
// ficheros del certificado. Nada del bono, la inversión ni el margen.
//
// REGLA — el enlace es REVOCABLE. El token es un HMAC con un `nonce` que se guarda
// en `cee.presentacion[fase]`: volver a encargarlo genera uno nuevo (el enlace
// anterior deja de valer solo) y «Retirar» lo borra. El del técnico
// (`ceeUploadSignature`) no caduca nunca; éste no puede ser igual, porque va a una
// persona que no es la que hizo el certificado.
//
// Vale para los DOS negocios: el expediente CAE ('expediente') y el CEE directo
// ('cee_directo'). En la URL van como 'cae' y 'cee'.

const crypto = require('crypto');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const ceeUploadService = require('./ceeUploadService');

const APP_BASE = process.env.FRONTEND_URL || 'https://app.brokergy.es';
const CLAVE_PRESENTADOR = 'presentador_cee';

// Los tres ficheros que viajan. El orden es el del correo y el de la página.
const FICHEROS = [
    { clave: 'pdf', slot: 'pdf', titulo: 'Certificado firmado (PDF)', suffix: '_fdo.pdf' },
    { clave: 'xml', slot: 'xml', titulo: 'Archivo XML', suffix: '.xml' },
    { clave: 'cex', slot: 'cex', titulo: 'Archivo de cálculo (.cex)', suffix: '.cex' },
];

const PLAZO_DIAS = 30; // un mes desde la emisión (apartado 07.2 del impreso)

function err(status, msg) { const e = new Error(msg); e.status = status; return e; }

/** 'cae' | 'cee' (URL) ⇄ 'expediente' | 'cee_directo' (interno). */
const origenDeUrl = (n) => (n === 'cee' || n === 'cee_directo' ? 'cee_directo' : (n === 'cae' || n === 'expediente' ? 'expediente' : null));
const urlDeOrigen = (o) => (o === 'cee_directo' ? 'cee' : 'cae');
const normFase = (f) => (f === 'final' ? 'final' : 'inicial');

/** Lo que NUNCA se manda: un borrador de la app lleva «REVISAR» en el nombre. */
const esRevisar = (nombre) => /revisar/i.test(String(nombre || ''));

const emailValido = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());

// ─── Carga ───────────────────────────────────────────────────────────────────

async function cargarFila(origen, id) {
    if (origen === 'cee_directo') {
        const row = await require('./ceeDirectoService').cargar(id, { conRelaciones: false });
        if (!row) throw err(404, 'Expediente no encontrado');
        return row;
    }
    // Un expediente, no un listado: `select('*')` vale (regla 22).
    const { data, error } = await supabase.from('expedientes').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw err(404, 'Expediente no encontrado');
    return data;
}

async function clienteDe(row) {
    if (!row?.cliente_id) return null;
    const { data } = await supabase.from('clientes')
        .select('nombre_razon_social, apellidos, dni')
        .eq('id_cliente', row.cliente_id).maybeSingle();
    return data || null;
}

const nombreCliente = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');

function rotuloFase(origen, row, fase) {
    if (origen === 'cee_directo') return require('./ceeDirectoUploadService').sectionLabel(row, fase);
    return ceeUploadService.sectionLabel(fase);
}

/** ¿Tiene este expediente esa fase? (un CEE directo ÚNICO no tiene final). */
function faseExiste(origen, row, fase) {
    if (origen !== 'cee_directo') return true;
    return fase === 'inicial' || String(row?.alcance || 'UNICO').toUpperCase() === 'DOBLE';
}

/** La carpeta de Drive de la fase, SIN crearla. */
async function carpetaFase(origen, row, fase) {
    if (origen === 'cee_directo') {
        if (!row.drive_folder_id) return null;
        const nombre = require('./ceeDirectoFolders').subcarpetaFase(row.alcance, fase);
        return driveService.findSubfolderByName(row.drive_folder_id, nombre);
    }
    const raiz = await ceeUploadService.resolveDriveFolderId(row);
    if (!raiz) return null;
    const ceeRoot = await driveService.findSubfolderByName(raiz, '1. CEE');
    return ceeRoot ? driveService.findSubfolderByName(ceeRoot, ceeUploadService.sectionLabel(fase)) : null;
}

/**
 * Elige, de una lista de ficheros de la carpeta, los TRES que se mandan.
 * Puro (se prueba sin Drive).
 *
 * - Nada con «REVISAR» en el nombre, ni el borrador del Registro ni el croquis.
 * - Por cada slot, manda el nombre CANÓNICO (`{nº} – {FASE}{sufijo}`); si no
 *   está, el único candidato; si hay varios, el primero, y se avisa.
 *
 * @returns {{ ficheros: Array<{clave,titulo,slot,file|null}>, faltan: string[], avisos: string[] }}
 */
function elegirFicheros(lista, { numero, rotulo }) {
    const files = (lista || []).filter(f => f && f.mimeType !== 'application/vnd.google-apps.folder'
        && !esRevisar(f.name)
        && !ceeUploadService.esBorradorPresentacion(f.name)
        && !ceeUploadService.esCroquis(f.name));
    const avisos = [];
    const ficheros = FICHEROS.map(def => {
        const candidatos = files.filter(f => ceeUploadService.matchSlot(f.name) === def.slot);
        const canonico = `${numero} – ${rotulo}${def.suffix}`.toLowerCase();
        let file = candidatos.find(f => String(f.name).toLowerCase() === canonico) || null;
        if (!file && candidatos.length === 1) file = candidatos[0];
        if (!file && candidatos.length > 1) {
            file = candidatos[0];
            avisos.push(`Hay ${candidatos.length} ficheros que pueden ser el ${def.titulo.toLowerCase()} en la carpeta; se manda «${file.name}».`);
        }
        return { clave: def.clave, titulo: def.titulo, slot: def.slot, file };
    });
    const faltan = ficheros.filter(f => !f.file).map(f => f.titulo);
    return { ficheros, faltan, avisos };
}

/** Los tres ficheros, con su estado REAL en Drive. */
async function ficherosDe(origen, row, fase) {
    const numero = row.numero_expediente || row.id;
    const rotulo = rotuloFase(origen, row, fase);
    let lista = [];
    let sinCarpeta = false;
    try {
        const carpeta = await carpetaFase(origen, row, fase);
        if (carpeta) lista = await driveService.listFiles(carpeta);
        else sinCarpeta = true;
    } catch (e) {
        console.warn('[presentacion-cee] no se pudo listar la carpeta:', e.message);
        sinCarpeta = true;
    }
    const r = elegirFicheros(lista, { numero, rotulo });
    if (sinCarpeta) r.avisos.unshift('No se encuentra la carpeta del CEE en Drive.');
    return r;
}

/** Con el NIF del titular delante: así se suben al Registro. */
const nombreRegistro = (nif, nombre) => (nif ? `${String(nif).trim().toUpperCase()}_${nombre}` : nombre);

// ─── El encargo guardado en `cee.presentacion` ──────────────────────────────

const encargoDe = (row, fase) => row?.cee?.presentacion?.[fase] || null;

async function guardarEncargo(origen, id, fase, valor) {
    // Lectura fresca de la clave: la otra fase puede haberse escrito entretanto.
    const fresca = await cargarFila(origen, id);
    const actual = { ...(fresca.cee?.presentacion || {}) };
    if (valor === null) delete actual[fase];
    else actual[fase] = valor;
    const { error } = origen === 'cee_directo'
        ? await supabase.rpc('set_cee_directo_cee_field', { p_cee_directo_id: id, p_field: 'presentacion', p_value: actual })
        : await supabase.rpc('set_expediente_cee_field', { p_expediente_id: id, p_field: 'presentacion', p_value: actual });
    if (error) throw new Error(`No se ha podido guardar el encargo: ${error.message}`);
    return actual;
}

async function anotar(origen, id, texto, usuario) {
    try {
        if (origen === 'cee_directo') {
            await require('./ceeDirectoService').anotarHistorial(id, { tipo: 'CEE', texto, usuario: usuario || null });
            return;
        }
        const { data } = await supabase.from('expedientes').select('documentacion').eq('id', id).maybeSingle();
        const doc = data?.documentacion || {};
        const historial = Array.isArray(doc.historial) ? [...doc.historial] : [];
        historial.push({ id: `${Date.now()}_presentacion`, tipo: 'informativo', texto, fecha: new Date().toISOString(), usuario: usuario || 'Sistema' });
        await supabase.from('expedientes')
            .update({ documentacion: { ...doc, historial }, updated_at: new Date().toISOString() }).eq('id', id);
    } catch (e) { console.warn('[presentacion-cee] historial:', e.message); }
}

// ─── Token del enlace ────────────────────────────────────────────────────────

function firmar(origen, id, fase, nonce) {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || 'brokergy-presentar-cee';
    return crypto.createHmac('sha256', secret).update(`presentar-cee:${origen}:${id}:${fase}:${nonce}`).digest('hex');
}

function tokenValido(origen, id, fase, nonce, token) {
    if (!nonce || !token) return false;
    try {
        const a = Buffer.from(firmar(origen, id, fase, nonce));
        const b = Buffer.from(String(token));
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { return false; }
}

function enlace(origen, id, fase, nonce, base = APP_BASE) {
    return `${base}/presentar/${urlDeOrigen(origen)}/${id}?fase=${fase}&token=${firmar(origen, id, fase, nonce)}`;
}

// ─── Quién presenta por defecto (lo último que se usó) ──────────────────────

async function presentadorPorDefecto() {
    try {
        const { data } = await supabase.from('app_settings').select('value').eq('key', CLAVE_PRESENTADOR).maybeSingle();
        if (!data?.value) return null;
        const v = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        return v?.email ? { nombre: v.nombre || '', email: v.email } : null;
    } catch { return null; }
}

async function recordarPresentador(nombre, email) {
    try {
        await supabase.from('app_settings').upsert(
            { key: CLAVE_PRESENTADOR, value: JSON.stringify({ nombre, email }), updated_at: new Date().toISOString() },
            { onConflict: 'key' });
    } catch (e) { console.warn('[presentacion-cee] no se pudo recordar a quien presenta:', e.message); }
}

// ─── Plazo y estado de la fase ───────────────────────────────────────────────

function plazoDe(origen, row, fase) {
    let firma = null;
    try {
        const { fechaFirmaCee } = require('../utils/ceeFechas');
        firma = fechaFirmaCee(row, fase);
    } catch { /* sin fecha, sin plazo */ }
    if (!/^\d{4}-\d{2}-\d{2}/.test(firma || '')) return null;
    const ini = new Date(`${String(firma).slice(0, 10)}T00:00:00`);
    const limite = new Date(ini.getTime() + PLAZO_DIAS * 86400000);
    const quedan = Math.floor((limite - Date.now()) / 86400000);
    return { firma: String(firma).slice(0, 10), limite: limite.toISOString().slice(0, 10), quedan };
}

const registrado = (row, fase) => String(row?.seguimiento?.[fase === 'final' ? 'cee_final' : 'cee_inicial'] || '').toUpperCase() === 'REGISTRADO';

const fechaRegistro = (row, fase) => require('../utils/ceeFechas').fechaRegistroCee(row, fase) || null;

/** Lo que se enseña de un encargo: nunca el nonce. */
function encargoPublico(e) {
    if (!e) return null;
    const { nonce, ...resto } = e; // eslint-disable-line no-unused-vars
    return { ...resto, activo: !!nonce };
}

// ─── Lo que ve el EQUIPO antes de encargar ───────────────────────────────────

async function estado(origen, id, fase) {
    const fz = normFase(fase);
    const row = await cargarFila(origen, id);
    if (!faseExiste(origen, row, fz)) throw err(400, 'Este encargo no tiene CEE final.');
    const cli = await clienteDe(row);
    const { ficheros, faltan, avisos } = await ficherosDe(origen, row, fz);
    const nif = cli?.dni || null;
    const enc = encargoDe(row, fz);
    return {
        numero: row.numero_expediente || row.id,
        faseLabel: fz === 'final' ? 'CEE final' : (rotuloFase(origen, row, fz) === 'CEE' ? 'CEE' : 'CEE inicial'),
        cliente: nombreCliente(cli),
        ficheros: ficheros.map(f => ({
            clave: f.clave, titulo: f.titulo, presente: !!f.file,
            nombre: f.file ? nombreRegistro(nif, f.file.name) : null,
            link: f.file?.webViewLink || null,
        })),
        faltan,
        avisos,
        registrado: registrado(row, fz),
        fechaRegistro: fechaRegistro(row, fz),
        plazo: plazoDe(origen, row, fz),
        encargo: encargoPublico(enc),
        // El enlace vigente, para poder copiarlo y pasarlo por otro canal.
        enlace: enc?.nonce ? enlace(origen, row.id, fz, enc.nonce) : null,
        presentador: await presentadorPorDefecto(),
    };
}

// ─── El correo ───────────────────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fechaEs = (iso) => { const [a, m, d] = String(iso || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : ''; };

/** Puro: compone asunto, texto y HTML. Sin un importe. */
function componerCorreo({ nombre, numero, cliente, faseLabel, adjuntos, link, plazo, nota, reenvio }) {
    const {
        brandEmailShell, emailP, emailBox, emailButton, emailDataTable, PILL, BRAND, FONT,
    } = require('./emailService');
    const saludo = nombre ? `Hola ${String(nombre).split(/\s+/)[0]},` : 'Hola,';
    const asunto = `${reenvio ? 'Actualizado · ' : ''}Presentar ${faseLabel} · ${numero}${cliente ? ` · ${cliente}` : ''}`;
    const plazoTxt = plazo
        ? (plazo.quedan < 0
            ? `Plazo vencido el ${fechaEs(plazo.limite)}`
            : `Hasta el ${fechaEs(plazo.limite)} (quedan ${plazo.quedan} día${plazo.quedan === 1 ? '' : 's'})`)
        : null;

    const pasos = [
        'Abre el enlace: tienes lo que va en cada casilla del formulario, listo para copiar.',
        'Preséntalo en la sede de la Junta adjuntando los tres ficheros de este correo (ya llevan el NIF del titular delante).',
        'Cuando te devuelvan el justificante de registro, súbelo en el mismo enlace. Si tienes el recibo de la tasa, también.',
    ];
    const MONO = "font-family:Consolas,'Courier New',monospace;";

    const html = brandEmailShell({
        preheader: `${faseLabel} de ${numero}${cliente ? ` (${cliente})` : ''} listo para presentar en el Registro.`,
        title: `Presentar el ${faseLabel}`,
        pill: reenvio ? PILL.neutral('Versión actualizada', '🔁') : PILL.info('Para presentar en el Registro', '📄'),
        contentHtml:
            emailP(esc(saludo), { mb: 10 })
            + emailP(`Te paso el <strong>${esc(faseLabel)}</strong> del expediente <strong style="color:${BRAND.orangeDark};">${esc(numero)}</strong>`
                + `${cliente ? ` de <strong>${esc(cliente)}</strong>` : ''} para que lo presentes en el Registro de Certificados de Eficiencia Energética.`,
                { color: BRAND.muted, mb: 22 })
            + emailBox(emailDataTable([
                ['Expediente', esc(numero)],
                cliente ? ['Titular', esc(cliente)] : null,
                ['Certificado', esc(faseLabel)],
                plazoTxt ? ['Plazo', esc(plazoTxt)] : null,
            ]), { pad: '16px 22px' })
            + emailP('Adjuntos', { size: 11, bold: true, color: BRAND.muted, mb: 8, css: 'letter-spacing:0.06em;text-transform:uppercase;' })
            + emailBox(adjuntos.map(a => `<div style="${MONO}font-size:12px;line-height:20px;color:${BRAND.text};">📎 ${esc(a)}</div>`).join(''),
                { pad: '14px 18px' })
            + (nota ? emailBox(emailP(esc(nota), { size: 14, mb: 0, pre: true }), { bg: BRAND.orangeTint, border: BRAND.orange, pad: '14px 18px' }) : '')
            + emailP('Pasos', { size: 16, bold: true, mb: 10 })
            + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:22px;">${
                pasos.map((p, i) => `<tr>
                  <td valign="top" width="34" style="width:34px;padding:0 12px 12px 0;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td width="24" height="24" align="center" valign="middle" bgcolor="${BRAND.orange}" style="width:24px;height:24px;border-radius:12px;background:${BRAND.orange};${FONT}font-size:12px;line-height:24px;font-weight:700;color:#FFFFFF;">${i + 1}</td>
                    </tr></table>
                  </td>
                  <td valign="top" style="padding:2px 0 12px;${FONT}font-size:14px;line-height:21px;color:${BRAND.text};">${esc(p)}</td>
                </tr>`).join('')}</table>`
            + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;"><tr><td align="center">${
                emailButton(esc(link), '📄 Abrir el borrador y subir el justificante', BRAND.orange)}</td></tr></table>`
            + emailP('El enlace es personal: no hace falta usuario ni contraseña.', { size: 11, color: BRAND.muted, center: true, mb: 0 }),
        footerNote: 'Encargo de presentación de BROKERGY. Si algo no cuadra, responde a este correo.',
    });

    const text = [
        saludo, '',
        `Te paso el ${faseLabel} del expediente ${numero}${cliente ? ` de ${cliente}` : ''} para que lo presentes en el Registro de Certificados de Eficiencia Energética.`,
        plazoTxt ? `Plazo: ${plazoTxt}.` : '',
        '', 'Adjuntos:', ...adjuntos.map(a => `  - ${a}`),
        nota ? `\n${nota}\n` : '',
        'Pasos:', ...pasos.map((p, i) => `  ${i + 1}. ${p}`),
        '', `Enlace: ${link}`,
    ].filter(l => l !== null).join('\n');

    return { asunto, html, text };
}

// ─── ENCARGAR ────────────────────────────────────────────────────────────────

/**
 * Manda a quien presenta los tres ficheros + el enlace, y sella el encargo.
 *
 * Todo o nada: si falta uno de los tres o no baja de Drive, no sale el correo.
 * El sello (con su nonce) se escribe DESPUÉS de enviar: si el correo falla, el
 * enlace que llevaba no llega a valer nunca.
 */
async function encargar(origen, id, fase, { email, nombre = '', nota = '', usuario = null } = {}) {
    const fz = normFase(fase);
    const to = String(email || '').trim().toLowerCase();
    if (!emailValido(to)) throw err(400, 'El correo de quien presenta no es válido.');
    const nom = String(nombre || '').trim().slice(0, 120);
    const notaLimpia = String(nota || '').trim().slice(0, 2000);

    const row = await cargarFila(origen, id);
    if (!faseExiste(origen, row, fz)) throw err(400, 'Este encargo no tiene CEE final.');
    if (registrado(row, fz)) throw err(409, 'Este CEE ya está registrado: no hay nada que presentar.');

    const cli = await clienteDe(row);
    const { ficheros, faltan } = await ficherosDe(origen, row, fz);
    if (faltan.length) {
        throw err(409, `Falta en la carpeta del CEE: ${faltan.join(', ')}. No se envía nada hasta que estén los tres.`);
    }

    const nif = cli?.dni || null;
    const attachments = [];
    for (const f of ficheros) {
        const buf = await driveService.getFileContent(f.file.id);
        if (!buf || !buf.length) throw err(409, `No se ha podido descargar «${f.file.name}» de Drive. No se envía nada.`);
        attachments.push({ filename: nombreRegistro(nif, f.file.name), content: buf, contentType: f.file.mimeType || undefined });
    }

    const previo = encargoDe(row, fz);
    const nonce = crypto.randomBytes(16).toString('hex');
    const link = enlace(origen, row.id, fz, nonce);
    const numero = row.numero_expediente || row.id;
    const faseLabel = fz === 'final' ? 'CEE final' : (rotuloFase(origen, row, fz) === 'CEE' ? 'CEE' : 'CEE inicial');
    const { asunto, html, text } = componerCorreo({
        nombre: nom, numero, cliente: nombreCliente(cli), faseLabel,
        adjuntos: attachments.map(a => a.filename), link, plazo: plazoDe(origen, row, fz),
        nota: notaLimpia, reenvio: !!previo?.enviado_at,
    });

    const { sendMail } = require('./emailService');
    await sendMail({ to, subject: asunto, html, text, attachments, replyTo: process.env.ADMIN_EMAIL || undefined });

    const ahora = new Date().toISOString();
    await guardarEncargo(origen, row.id, fz, {
        nonce,
        email: to,
        nombre: nom,
        enviado_at: ahora,
        enviado_por: usuario || null,
        veces: (previo?.veces || 0) + 1,
        ficheros: attachments.map(a => a.filename),
        registrado_at: null,
    });
    await recordarPresentador(nom, to);
    await anotar(origen, row.id,
        `📄 ${faseLabel.toUpperCase()} enviado a ${nom || to} (${to}) para PRESENTAR en el Registro`
        + `${previo?.enviado_at ? ' · reenvío: el enlace anterior deja de valer' : ''}. Adjuntos: ${attachments.map(a => a.filename).join(', ')}.`,
        usuario);

    return { ok: true, enlace: link, para: to, adjuntos: attachments.map(a => a.filename) };
}

/** Retira el encargo: el enlace deja de valer. Lo enviado ya está enviado. */
async function retirar(origen, id, fase, { usuario = null } = {}) {
    const fz = normFase(fase);
    const row = await cargarFila(origen, id);
    const enc = encargoDe(row, fz);
    if (!enc) return { ok: true, nada: true };
    await guardarEncargo(origen, row.id, fz, { ...enc, nonce: null, retirado_at: new Date().toISOString(), retirado_por: usuario || null });
    await anotar(origen, row.id, `🚫 Retirado el encargo de presentación del CEE ${fz} a ${enc.nombre || enc.email}: su enlace deja de valer.`, usuario);
    return { ok: true };
}

// ─── La página PÚBLICA de quien presenta ─────────────────────────────────────

/** Comprueba el enlace y devuelve la fila. 403 si no vale. */
async function abrir(negocioUrl, id, fase, token) {
    const origen = origenDeUrl(negocioUrl);
    if (!origen) throw err(404, 'Enlace no válido.');
    const fz = normFase(fase);
    let row;
    try { row = await cargarFila(origen, id); }
    catch (e) { if (e.status === 404) throw err(403, 'Este enlace ya no es válido.'); throw e; }
    const enc = encargoDe(row, fz);
    if (!tokenValido(origen, row.id, fz, enc?.nonce, token)) {
        throw err(403, 'Este enlace ya no es válido. Puede que se haya enviado uno más reciente: búscalo en tu correo.');
    }
    return { origen, row, fase: fz, encargo: enc };
}

async function vistaPublica(negocioUrl, id, fase, token) {
    const { origen, row, fase: fz, encargo } = await abrir(negocioUrl, id, fase, token);
    const cli = await clienteDe(row);
    const { ficheros } = await ficherosDe(origen, row, fz);
    const nif = cli?.dni || null;
    return {
        numero: row.numero_expediente || row.id,
        faseLabel: fz === 'final' ? 'CEE final' : (rotuloFase(origen, row, fz) === 'CEE' ? 'CEE' : 'CEE inicial'),
        fase: fz,
        cliente: nombreCliente(cli),
        presentador: encargo?.nombre || null,
        enviado_at: encargo?.enviado_at || null,
        ficheros: ficheros.map(f => ({
            clave: f.clave, titulo: f.titulo, presente: !!f.file,
            nombreDrive: f.file?.name || null,
            nombreRegistro: f.file ? nombreRegistro(nif, f.file.name) : null,
        })),
        registrado: registrado(row, fz),
        fechaRegistro: fechaRegistro(row, fz),
        plazo: plazoDe(origen, row, fz),
    };
}

/**
 * El borrador del Registro, con la lista de ficheros SUSTITUIDA por los tres que
 * se le mandan (la del borrador incluye el informe de medidas de mejora).
 */
async function borradorPublico(negocioUrl, id, fase, token) {
    const { origen, row, fase: fz } = await abrir(negocioUrl, id, fase, token);
    const borradorCeeService = require('./borradorCeeService');
    const out = await borradorCeeService.componer(origen, row.id, fz);
    if (out?.borrador?.aplica) {
        const cli = await clienteDe(row);
        const nif = out.borrador.nif || cli?.dni || null;
        const { ficheros } = await ficherosDe(origen, row, fz);
        out.borrador.ficheros = ficheros.map(f => ({
            clave: f.clave, titulo: f.titulo, presente: !!f.file,
            nombreDrive: f.file?.name || null,
            nombreRegistro: f.file ? nombreRegistro(nif, f.file.name) : `${f.titulo} — no está en la carpeta`,
        }));
    }
    return out;
}

/** El borrador en PDF (en la vía pública no vale `/api/pdf/generate`, que pide sesión). */
async function borradorPdfPublico(negocioUrl, id, fase, token) {
    const { origen, row, fase: fz } = await abrir(negocioUrl, id, fase, token);
    const doc = await require('./borradorCeeService').pdf(origen, row.id, fz);
    if (!doc) throw err(404, 'No hay borrador para este registro.');
    return { buffer: doc.buffer, filename: doc.filename };
}

/** Uno de los tres ficheros, ya renombrado. Se pide por CLAVE, nunca por driveId. */
async function ficheroPublico(negocioUrl, id, fase, token, clave) {
    const { origen, row, fase: fz } = await abrir(negocioUrl, id, fase, token);
    if (!FICHEROS.some(f => f.clave === clave)) throw err(400, 'Documento no válido');
    const cli = await clienteDe(row);
    const { ficheros } = await ficherosDe(origen, row, fz);
    const f = ficheros.find(x => x.clave === clave);
    if (!f?.file) throw err(404, `${f?.titulo || 'El fichero'}: no está en la carpeta del CEE`);
    const buffer = await driveService.getFileContent(f.file.id);
    if (!buffer?.length) throw err(404, 'El fichero ya no existe en Drive');
    return { buffer, filename: nombreRegistro(cli?.dni || null, f.file.name), mimeType: f.file.mimeType };
}

/**
 * Lo que DEVUELVE la sede: el justificante de registro (cierra la fase) o el
 * recibo de la tasa (va con los demás ficheros del CEE, como «… – TASA»).
 */
async function subirDevuelto(negocioUrl, id, fase, token, { tipo, buffer, mimetype, nombreOriginal }) {
    const { origen, row, fase: fz, encargo } = await abrir(negocioUrl, id, fase, token);
    if (!buffer?.length) throw err(400, 'No ha llegado ningún fichero.');
    const quien = {
        texto: `${encargo?.nombre || 'quien presenta'} (presentación)`,
        usuario: (encargo?.nombre || 'PRESENTACIÓN').toUpperCase(),
    };

    if (tipo === 'registro') {
        if (!/\.pdf$/i.test(nombreOriginal || '') && mimetype !== 'application/pdf') {
            throw err(400, 'El justificante de registro tiene que ser un PDF.');
        }
        const { subirCae, subirCeeDirecto } = require('./cee/subidaCeePublica');
        const r = origen === 'cee_directo'
            ? await subirCeeDirecto({ id: row.id, fase: fz, slot: 'registro', buffer, mimetype, quien })
            : await subirCae({ expedienteId: row.id, fase: fz, slot: 'registro', buffer, mimetype, quien });
        if (encargo) {
            try { await guardarEncargo(origen, row.id, fz, { ...encargo, registrado_at: new Date().toISOString() }); }
            catch (e) { console.warn('[presentacion-cee] sello de registrado:', e.message); }
        }
        return r;
    }

    if (tipo === 'tasa') {
        const ext = (String(nombreOriginal || '').match(/\.[a-z0-9]{2,5}$/i)?.[0] || '.pdf').toLowerCase();
        const nombre = `TASA${ext}`;
        if (origen === 'cee_directo') {
            const up = await require('./ceeDirectoUploadService').uploadFile(row, fz, null, buffer, mimetype, { nombreLibre: nombre });
            await anotar(origen, row.id, `🧾 ${quien.texto} ha subido el recibo de la tasa del CEE ${fz}.`, null);
            return { success: true, name: up.fileName, link: up.link };
        }
        const raiz = await ceeUploadService.resolveDriveFolderId(row);
        if (!raiz) throw err(400, 'El expediente no tiene carpeta de Drive');
        const { id: carpeta } = await ceeUploadService.ensureCeeSectionFolder(raiz, fz);
        const fileName = `${row.numero_expediente || row.id} – ${nombre}`;
        const prev = await driveService.findFileByName(carpeta, fileName);
        if (prev) await driveService.archiveExistingToOld(carpeta, prev, fileName);
        const saved = await driveService.saveFileToFolder(carpeta, fileName, mimetype || 'application/octet-stream', buffer, { throwOnError: true });
        await anotar(origen, row.id, `🧾 ${quien.texto} ha subido el recibo de la tasa del CEE ${fz}.`, quien.usuario);
        return { success: true, name: fileName, link: saved?.link || null };
    }

    throw err(400, 'Tipo de documento no válido.');
}

module.exports = {
    FICHEROS,
    origenDeUrl,
    elegirFicheros,
    esRevisar,
    firmar,
    tokenValido,
    componerCorreo,
    estado,
    encargar,
    retirar,
    vistaPublica,
    borradorPublico,
    borradorPdfPublico,
    ficheroPublico,
    subirDevuelto,
};
