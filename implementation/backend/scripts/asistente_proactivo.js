// El MODO PROACTIVO del asistente: cuando un INSTALADOR (un partner) manda a la empresa una petición
// de simulación —la referencia catastral, la placa de la caldera, un presupuesto…— y nadie le
// contesta, el asistente se lo dice a Fran: «Federico ha mandado una petición, ¿la doy de alta?».
// Fran contesta «sí» o «no» y el trabajo lo hace Claude por el canal de siempre.
//
// Lo usa scripts/asistente_vigia.js (en el contenedor «asistente»). También tiene línea de órdenes:
//   node scripts/asistente_proactivo.js listar
//   node scripts/asistente_proactivo.js resolver P3 hecho|descartado
//   node scripts/asistente_proactivo.js probar <telefono|chatId>        qué haría, SIN avisar a Fran
//
// - El backend avisa de CADA mensaje entrante 1:1 (solo su chatId, sin trabajo en la sesión). Aquí se
//   espera a que el chat lleve ASISTENTE_PROACTIVO_SILENCIO_MIN (10) sin mensajes y se lee UNA vez.
// - Solo chats de PARTNERS (teléfono en la ficha de prescriptores) y solo si lo último del chat es
//   SUYO: si ya le ha contestado alguien, no hay nada que proponer.
// - Quién decide si es una petición: un filtro barato (fotos, PDF, RC, palabras de obra) y después
//   GEMINI —va aparte, céntimos— nunca Claude. Claude solo trabaja cuando Fran dice «sí».
// - Ya dado de alta (una oportunidad con `alta_whatsapp` de ese chat posterior a la petición) → nada.
// - Horario 08:00–21:00 de Madrid: fuera, el aviso espera a la mañana. Tope de avisos por hora.
// - Apagado con ASISTENTE_PROACTIVO=false.
const path = require('path');
const fs = require('fs');
const { api, mandar, transcribir, TEL } = require('./asistente_whatsapp');
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'));

const DIR = path.join(__dirname, '..', 'scratch', 'asistente');
const FICHERO = path.join(DIR, 'proactivo.json');
const ACTIVO = String(process.env.ASISTENTE_PROACTIVO || 'true') !== 'false';
const SILENCIO_MS = Number(process.env.ASISTENTE_PROACTIVO_SILENCIO_MIN || 10) * 60_000;
const MAX_HORA = Number(process.env.ASISTENTE_PROACTIVO_MAX_HORA || 6);
const CADUCA_MS = 3 * 24 * 3600_000;
const RC = /\b\d{7}[A-Z]{2}\d{4}[A-Z](?:\d{4}[A-Z]{2})?\b/i;
const OBRA = /caldera|aerotermia|bomba de calor|presupuesto|referencia|catastr|simulaci|placa|radiador|suelo radiante|gas[oó]leo|pellet|propuesta|cliente/i;
const MEDIA = new Set(['image', 'document', 'video', 'ptt', 'audio']);

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' }), '[proactivo]', ...a);
const hora = t => new Date(t * 1000).toLocaleString('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const tlf9 = v => String(v || '').replace(/\D/g, '').slice(-9);

function leer() {
    try { return JSON.parse(fs.readFileSync(FICHERO, 'utf8')); } catch { return { siguiente: 1, avisos: [], vistos: {} }; }
}
function guardar(e) { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(FICHERO, JSON.stringify(e, null, 2)); }

function enHorario(d = new Date()) {
    const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }).format(d));
    return h >= 8 && h < 21;
}

// ─── ¿De qué partner es este teléfono? (la cartera se lee cada 10 min como mucho) ───
let cartera = null;
let carteraAt = 0;
async function partnerDe(telefono) {
    if (!cartera || Date.now() - carteraAt > 10 * 60_000) {
        const { data, error } = await sb.from('prescriptores')
            .select('id_empresa, razon_social, acronimo, tipo_empresa, tlf, tlf_responsable, contactos_notificacion');
        if (error) throw new Error(error.message);
        cartera = data || [];
        carteraAt = Date.now();
    }
    const t = tlf9(telefono);
    if (t.length < 9) return null;
    return cartera.find(p => [p.tlf, p.tlf_responsable, ...((p.contactos_notificacion || []).map(c => c?.tlf))]
        .some(x => tlf9(x) === t)) || null;
}

// ─── Lo pendiente de un chat: lo SUYO después de lo último nuestro, de las últimas 24 h ───
function pendienteDe(mensajes) {
    const ms = [...(mensajes || [])].sort((a, b) => a.t - b.t);
    let i = ms.length - 1;
    const suyos = [];
    while (i >= 0 && !ms[i].de_mi) { suyos.unshift(ms[i]); i -= 1; }
    const corte = Date.now() / 1000 - 24 * 3600;
    return suyos.filter(m => m.t >= corte);
}

async function yaDadoDeAlta(telefono, desde) {
    const { data } = await sb.from('oportunidades').select('id_oportunidad, datos_calculo->alta_whatsapp')
        .eq('datos_calculo->alta_whatsapp->>chat_id', `${String(telefono).replace(/\D/g, '')}@c.us`)
        .order('created_at', { ascending: false }).limit(5);
    return (data || []).find(o => o.alta_whatsapp?.at && Date.parse(o.alta_whatsapp.at) / 1000 >= desde) || null;
}

async function clasificar(pend) {
    const { llamarGemini } = require('../services/placaOcrService');
    const lineas = [];
    const ficheros = [];
    let audios = 0;
    for (const m of pend) {
        if (/ptt|audio/.test(m.tipo) && audios < 3) {
            audios += 1;
            // eslint-disable-next-line no-await-in-loop
            lineas.push(`[nota de voz] ${await transcribir(m)}`);
            continue;
        }
        // Las fotos y los PDF se le ENSEÑAN: la referencia catastral suele venir en una captura del
        // Catastro y la caldera en su placa; sin verlas, el filtro decía que «falta la RC» y juntaba
        // dos obras en una (medido con las OP269/OP270 de Federico). Como mucho 6.
        if ((m.tipo === 'image' || m.tipo === 'document') && ficheros.length < 6) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const f = await api(`/api/whatsapp/conversacion/adjunto?msg=${encodeURIComponent(m.id)}`, { binario: true, ms: 60_000 });
                const mime = (f.mimetype || '').split(';')[0];
                if (/^image\/|application\/pdf/.test(mime) && f.buffer.length < 8 * 1024 * 1024) {
                    ficheros.push({ buffer: f.buffer, mimeType: mime });
                    lineas.push(`[${m.tipo} nº ${ficheros.length}]${m.texto ? ` ${m.texto}` : ''}`);
                    continue;
                }
            } catch { /* no se pudo bajar: va como marca */ }
        }
        lineas.push(m.tipo === 'chat' ? m.texto : `[${m.tipo}]${m.texto ? ` ${m.texto}` : ''}`);
    }
    const prompt = [
        'Eres el filtro de BROKERGY, una ingeniería que tramita ayudas (CAE) por cambiar calderas de',
        'combustión por aerotermia y por reformas energéticas. Un INSTALADOR ha escrito al WhatsApp de la',
        'empresa lo que sigue. ¿Es una PETICIÓN de simulación/propuesta para una obra concreta (manda datos',
        'de una vivienda: referencia catastral, fotos de la caldera o su placa, presupuesto, potencia…)?',
        'No lo es: un saludo, un «gracias», una pregunta general, una consulta sobre un expediente que ya',
        'existe, una factura o fotos de una obra ya hecha. Mira las imágenes y documentos adjuntos (en el',
        'orden en que se citan): placas de caldera, capturas o fichas del Catastro (la referencia catastral',
        'son 14 o 20 caracteres), presupuestos. CUENTA LAS OBRAS: cada vivienda, caldera o presupuesto',
        'distinto suele ser una obra distinta. En «falta» pon solo lo que NO esté en ningún mensaje ni',
        'imagen; si todo está, déjalo vacío. Contesta en castellano, sin punto final en «falta».',
        '',
        ...lineas.map(l => `- ${String(l).slice(0, 800)}`),
    ].join('\n');
    return llamarGemini(ficheros, {
        prompt,
        etiqueta: 'proactivo',
        maxTokens: 600,
        schema: {
            type: 'object',
            properties: {
                peticion: { type: 'boolean' },
                obras: { type: 'integer', description: 'cuántas obras distintas pide (0 si no es petición)' },
                resumen: { type: 'string', description: '1-2 frases por obra: dirección o referencia si se ve, qué caldera, presupuesto si lo dice' },
                falta: { type: 'string', description: 'dato imprescindible que falta para darla de alta (RC, placa…) o vacío' },
            },
            required: ['peticion', 'resumen'],
        },
    });
}

// ─── Revisar un chat cuando lleva el rato en silencio ───
// lid → teléfono de los chats ya leídos: la próxima vez se sabe si es un partner SIN leer el chat.
const telDeLid = new Map();

async function revisar(chatOTel, { probar = false } = {}) {
    // Antes de leer nada: si ya sabemos el teléfono y no es de un partner, no se toca la sesión.
    const telConocido = /@c\.us$/.test(chatOTel) ? chatOTel.replace(/@.*/, '') : (/^\d+$/.test(chatOTel) ? chatOTel : telDeLid.get(chatOTel));
    if (telConocido && !(await partnerDe(telConocido))) return probar ? (console.log('no es un partner: nada'), 'nada') : 'no partner';
    const cuerpo = /@/.test(chatOTel) ? { chatId: chatOTel, dias: 2 } : { telefono: chatOTel, dias: 2 };
    const conv = await api('/api/whatsapp/conversacion', { method: 'POST', body: cuerpo, ms: 60_000 });
    const decir = r => { if (probar) console.log(r); return r; };
    if (conv.grupo || !conv.telefono) return decir('grupo o sin teléfono: nada');
    if (/@lid$/.test(chatOTel)) telDeLid.set(chatOTel, conv.telefono);
    if (TEL && tlf9(conv.telefono) === tlf9(TEL)) return decir('es el chat de Fran: nada');
    const pend = pendienteDe(conv.mensajes);
    if (!pend.length) return decir('lo último del chat es nuestro (o tiene más de 24 h): nada');

    const estado = leer();
    const ultimo = pend[pend.length - 1].id;
    if (!probar && estado.vistos[conv.chatId] === ultimo) return 'ya visto';
    const marcarVisto = () => { if (!probar) { estado.vistos[conv.chatId] = ultimo; guardar(estado); } };

    const partner = await partnerDe(conv.telefono);
    if (!partner) { marcarVisto(); return decir(`${conv.nombre || conv.telefono}: no es un partner: nada`); }

    const texto = pend.map(m => m.texto || '').join(' ');
    const hayMedia = pend.some(m => MEDIA.has(m.tipo));
    if (!hayMedia && !RC.test(texto) && !OBRA.test(texto)) { marcarVisto(); return decir('sin fotos, documentos ni datos de obra: nada'); }

    const alta = await yaDadoDeAlta(conv.telefono, pend[0].t);
    if (alta) { marcarVisto(); return decir(`ya dado de alta como ${alta.id_oportunidad}: nada`); }

    const c = await clasificar(pend);
    if (!c?.peticion) { marcarVisto(); return decir(`Gemini: no es una petición (${c?.resumen || '—'})`); }

    const cuenta = ['image', 'document', 'video', 'ptt'].map(t => [t, pend.filter(m => m.tipo === t || (t === 'ptt' && m.tipo === 'audio')).length])
        .filter(([, n]) => n).map(([t, n]) => `${n} ${{ image: n > 1 ? 'fotos' : 'foto', document: n > 1 ? 'documentos' : 'documento', video: n > 1 ? 'vídeos' : 'vídeo', ptt: n > 1 ? 'audios' : 'audio' }[t]}`);
    const quien = partner.acronimo || partner.razon_social;

    // Si ya hay un aviso pendiente de este chat, se amplía en silencio: es la misma petición que sigue.
    const previo = estado.avisos.find(a => a.chatId === conv.chatId && a.estado === 'pendiente');
    if (previo && !probar) {
        Object.assign(previo, { hasta: pend[pend.length - 1].t, ids: pend.map(m => m.id), resumen: c.resumen, falta: c.falta || '' });
        marcarVisto();
        return `ampliado ${previo.id}`;
    }
    const id = `P${estado.siguiente}`;
    const aviso = {
        id, chatId: conv.chatId, telefono: conv.telefono, nombre: conv.nombre || conv.telefono,
        partner: { id: partner.id_empresa, nombre: quien, tipo: partner.tipo_empresa },
        desde: pend[0].t, hasta: pend[pend.length - 1].t, ids: pend.map(m => m.id),
        obras: c.obras || 1, resumen: c.resumen, falta: c.falta || '', adjuntos: cuenta.join(', '),
        estado: 'pendiente', creado_at: new Date().toISOString(), avisado_at: null,
    };
    if (probar) { console.log(JSON.stringify(aviso, null, 2)); console.log(`\n${textoAviso(aviso)}`); return aviso; }
    estado.siguiente += 1;
    estado.avisos.push(aviso);
    marcarVisto();
    log(`${id}: petición de ${aviso.nombre} (${quien}).`);
    await enviarEnCola();
    return aviso;
}

function textoAviso(a) {
    return [
        `*${a.id} · Nueva petición de ${a.nombre}* (${a.partner.nombre})`,
        a.resumen,
        a.adjuntos ? `Ha mandado: ${a.adjuntos}.` : null,
        a.obras > 1 ? `Parecen ${a.obras} obras distintas.` : null,
        a.falta ? `Falta: ${String(a.falta).replace(/[.\s]+$/, '')}.` : null,
        `Lo mandó el ${hora(a.desde)} y nadie le ha contestado todavía.`,
        '',
        `¿La doy de alta? Contesta *sí* o *no*${a.id !== 'P1' ? ` (o «sí ${a.id}» si hay varias)` : ''}.`,
    ].filter(x => x !== null).join('\n');
}

// Manda lo que esté esperando, si es horario y no se ha pasado el tope de la hora.
async function enviarEnCola() {
    if (!ACTIVO || !enHorario()) return;
    const estado = leer();
    const ahora = Date.now();
    estado.avisos = estado.avisos.filter(a => a.estado === 'pendiente' ? ahora - Date.parse(a.creado_at) < CADUCA_MS : ahora - Date.parse(a.creado_at) < 14 * 24 * 3600_000);
    const enLaHora = estado.avisos.filter(a => a.avisado_at && ahora - Date.parse(a.avisado_at) < 3600_000).length;
    let hueco = MAX_HORA - enLaHora;
    for (const a of estado.avisos.filter(x => x.estado === 'pendiente' && !x.avisado_at)) {
        if (hueco <= 0) break;
        try {
            // eslint-disable-next-line no-await-in-loop
            await mandar(textoAviso(a));
            a.avisado_at = new Date().toISOString();
            hueco -= 1;
        } catch (e) { log(`No se pudo avisar de ${a.id}:`, e.message); break; }
    }
    guardar(estado);
}

// ─── Lo que llama el vigilante: un mensaje entrante → revisar ese chat cuando calle ───
const temporizadores = new Map();
function alEntrante(chatId) {
    if (!ACTIVO || !chatId || !/@(c\.us|lid)$/.test(chatId)) return;
    clearTimeout(temporizadores.get(chatId));
    temporizadores.set(chatId, setTimeout(() => {
        temporizadores.delete(chatId);
        revisar(chatId).catch(e => log(`revisar ${chatId}:`, e.message));
    }, SILENCIO_MS));
}

/** Las peticiones esperando la decisión de Fran, para el prompt de Claude. */
function paraElPrompt() {
    const p = leer().avisos.filter(a => a.estado === 'pendiente' && a.avisado_at);
    if (!p.length) return '';
    return p.map(a => `- ${a.id} · chat «${a.nombre}» (tel ${a.telefono}) de ${a.partner.nombre} · `
        + `mensajes desde ${hora(a.desde)} (para alta_oportunidad: --desde "${desdeIso(a.desde)}") · ${a.resumen}`
        + `${a.falta ? ` · falta: ${a.falta}` : ''}`).join('\n');
}
function desdeIso(t) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(t * 1000)).map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

function resolver(id, como) {
    const estado = leer();
    const a = estado.avisos.find(x => x.id.toUpperCase() === String(id).toUpperCase());
    if (!a) throw new Error(`No hay ninguna petición ${id}.`);
    if (!['hecho', 'descartado'].includes(como)) throw new Error('Uso: resolver P3 hecho|descartado');
    a.estado = como;
    a.resuelto_at = new Date().toISOString();
    guardar(estado);
    return a;
}

module.exports = { alEntrante, enviarEnCola, paraElPrompt, resolver, revisar, _clasificar: clasificar, _textoAviso: textoAviso };

if (require.main === module) {
    const [, , orden, a1, a2] = process.argv;
    (async () => {
        if (orden === 'listar') {
            for (const a of leer().avisos) console.log(`${a.id}  ${a.estado.padEnd(10)}  ${a.nombre} (${a.partner.nombre}) · ${hora(a.desde)} · ${a.resumen}`);
        } else if (orden === 'resolver') {
            const a = resolver(a1, a2);
            console.log(`✓ ${a.id} marcada como ${a.estado}.`);
        } else if (orden === 'probar') {
            await revisar(a1, { probar: true });
        } else {
            console.log('Órdenes: listar · resolver P3 hecho|descartado · probar <telefono|chatId>');
        }
    })().catch(e => { console.error(`✗ ${e.message}`); process.exitCode = 1; });
}
