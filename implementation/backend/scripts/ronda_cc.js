#!/usr/bin/env node
// =============================================================================
// RONDA DE WHATSAPP HECHA POR CLAUDE CODE (2026-10-19)
// -----------------------------------------------------------------------------
// La ronda la ANALIZA Claude Code con la suscripción de Fran, en una tarea
// programada de la app de escritorio, y aquí se hace todo lo que NO es juicio:
//
//   preparar          → lee del WhatsApp del VPS (rutas de SOLO LECTURA, con
//                       x-internal-key) los chats con mensajes NUEVOS de quien
//                       tiene algo vivo, baja sus adjuntos, transcribe los audios
//                       (Gemini, en el VPS: Claude no acepta audio) y deja UNA
//                       CARPETA POR CHAT con `chat.json` y los ficheros.
//   slots <código>    → los apartados de documentación de esa obra (para el `slot`).
//   dossier <carpeta> <código>
//                     → lo que hay que decirle y qué le falta, con los enlaces
//                       como MARCAS ({ENLACE_SUBIR}…): el modelo nunca copia una URL.
//   informe [carpeta] → lee los `resultado.json` que ha escrito Claude, VALIDA
//                       (códigos de obra, apartados), pone los ENLACES de verdad y
//                       los párrafos, y monta el informe (md + html + resumen).
//
// Las instrucciones para Claude están en `ronda_cc_instrucciones.md`. Todo lo de
// la ronda (reglas, lo medido) en docs/conocimiento/whatsapp/la-ronda-nocturna-de-whatsapp.md.
//
// EN SECO: no coloca, no anota, no envía. Las escrituras en Supabase se BLOQUEAN
// en este proceso. Lo único que escribe son sus ficheros en scratch/ronda/cc/.
// =============================================================================
'use strict';

process.env.WHATSAPP_ENABLED = 'false';
for (const k of ['REVISION_ALERTA_ENABLED', 'CEE_ENTREGA_AUTO', 'BOT_WHATSAPP_ENABLED', 'PROPUESTA_PROGRAMADA_ENABLED',
    'WA_SYNC_INSTALADORES', 'RESENA_PROGRAMADA_ENABLED', 'WA_AUTO_SYNC', 'ASISTENTE_PROACTIVO', 'WA_RONDA_ENABLED']) process.env[k] = 'false';

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const args = process.argv.slice(2);
const orden = args[0];
const opt = (n, d) => {
    const i = args.indexOf(`--${n}`);
    return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d;
};
const API = String(opt('api', process.env.RONDA_API_URL || 'https://app.brokergy.es')).replace(/\/$/, '');
const KEY = process.env.INTERNAL_API_KEY;
const BASE = path.join(__dirname, '..', 'scratch', 'ronda', 'cc');
const ESTADO = path.join(BASE, 'estado.json');
const MAX_ADJUNTOS = 30;
const PAUSA_MS = 250;   // entre lecturas: es la sesión de PRODUCCIÓN, de la que salen todos los avisos

// ── Candado: este proceso no escribe en la BD ────────────────────────────────
const supabase = require('../services/supabaseClient');
const bloqueadas = [];
const falso = (motivo) => {
    const res = { data: null, error: { message: `EN SECO: ${motivo}` } };
    const p = new Proxy(function () {}, {
        get(_, prop) {
            if (prop === 'then') return (ok, ko) => Promise.resolve(res).then(ok, ko);
            if (prop === 'catch') return (ko) => Promise.resolve(res).catch(ko);
            if (prop === 'finally') return (f) => Promise.resolve(res).finally(f);
            return () => p;
        },
        apply() { return p; },
    });
    return p;
};
const fromOriginal = supabase.from.bind(supabase);
supabase.from = (tabla) => {
    const qb = fromOriginal(tabla);
    for (const op of ['insert', 'update', 'upsert', 'delete']) qb[op] = () => { bloqueadas.push(`${op} ${tabla}`); return falso(op); };
    return qb;
};
supabase.rpc = (nombre) => { bloqueadas.push(`rpc ${nombre}`); return falso(nombre); };

const R = require('../services/rondaWhatsapp');
const IA = require('../services/rondaWhatsappIA');
const Informe = require('../services/rondaWhatsappInforme');
const reformaUploadService = require('../services/reformaUploadService');
const { CONOCIMIENTO } = require('../services/botPrompt');

const espera = (ms) => new Promise(r => setTimeout(r, ms));
const leer = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const escribir = (f, x) => fs.writeFileSync(f, typeof x === 'string' ? x : JSON.stringify(x, null, 2));
const ROL_TEXTO = { cliente: 'Cliente', instalador: 'Instalador', certificador: 'Certificador', ambos: 'Cliente e instalador' };

async function api(ruta, { method = 'GET', body, binario = false, plazo = 120_000 } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), plazo);
    try {
        const r = await fetch(`${API}/api/whatsapp${ruta}`, {
            method, signal: ctrl.signal,
            headers: { 'x-internal-key': KEY, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (binario && r.ok) {
            return {
                buffer: Buffer.from(await r.arrayBuffer()),
                mimetype: String(r.headers.get('content-type') || '').split(';')[0].trim(),
            };
        }
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { const e = new Error(j.error || `HTTP ${r.status}`); e.status = r.status; throw e; }
        return j;
    } catch (e) {
        if (e.name === 'AbortError') { const x = new Error('plazo agotado'); x.status = 504; throw x; }
        throw e;
    } finally { clearTimeout(t); }
}

const extension = (mime) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[mime] || 'bin');
const ultimaCarpeta = () => {
    const est = leer(ESTADO, {});
    if (est.ultimaCarpeta && fs.existsSync(est.ultimaCarpeta)) return est.ultimaCarpeta;
    const ds = fs.existsSync(BASE) ? fs.readdirSync(BASE).filter(d => /^\d{4}-/.test(d)).sort() : [];
    return ds.length ? path.join(BASE, ds[ds.length - 1]) : null;
};

// ─────────────────────────────────────────────────────────────────────────────
// PREPARAR
// ─────────────────────────────────────────────────────────────────────────────
async function preparar() {
    if (!KEY) throw new Error('Falta INTERNAL_API_KEY en el .env');
    const ahora = Math.floor(Date.now() / 1000);
    const est = leer(ESTADO, {});
    // Una carpeta preparada hace menos de 3 h y sin informe se REUTILIZA: leer otra vez
    // todo el WhatsApp de producción es carga sobre la sesión de la que salen los avisos.
    if (!args.includes('--nuevo') && est.ultimaCarpeta && fs.existsSync(path.join(est.ultimaCarpeta, 'indice.json'))
        && !fs.existsSync(path.join(est.ultimaCarpeta, 'informe.md'))) {
        const idx = leer(path.join(est.ultimaCarpeta, 'indice.json'));
        const min = Math.round((Date.now() - new Date(idx.generado).getTime()) / 60000);
        if (min < 180) {
            const pendientes = idx.chats.filter(c => !fs.existsSync(path.join(est.ultimaCarpeta, c, 'resultado.json')));
            console.log(`Reutilizo la carpeta preparada hace ${min} min (sin informe todavía): no se vuelve a leer el WhatsApp.`);
            console.log(`\nCARPETA: ${est.ultimaCarpeta}`);
            console.log(`CHATS: ${idx.chats.length} · sin resultado.json todavía: ${pendientes.length}`);
            console.log(`PENDIENTES: ${pendientes.join(' ')}`);
            return;
        }
    }
    let desde = opt('dias') ? ahora - Number(opt('dias')) * 86400 : (est.cursor || ahora - 86400);
    desde = Math.max(desde, ahora - 7 * 86400);
    // Lo que el modelo ve de cada chat: lo nuevo y algo de antes, nunca más de una semana.
    const diasContexto = Math.min(7, Math.max(3, Math.ceil((ahora - desde) / 86400) + 2));

    const st = await api('/status');
    if (!st.ready) throw new Error(`El WhatsApp del VPS no está listo (${st.state}). No se lee nada.`);

    const u = await R.cargarUniverso();
    const envios = await R.cargarEnviosApp(ahora - (diasContexto + 1) * 86400);
    const sello = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16).replace(/[: ]/g, '-');
    const dir = path.join(BASE, sello);
    fs.mkdirSync(dir, { recursive: true });
    escribir(path.join(dir, 'conocimiento.md'), CONOCIMIENTO);
    // Las obras, una vez: `slots` y `dossier` las leen de aquí en vez de recorrer la BD otra vez.
    escribir(path.join(dir, 'obras.json'), Object.fromEntries(u.obras.filter(o => o.codigo).map(o => [o.codigo, o])));

    const telefonos = [...u.porTel.keys()];
    console.log(`Leyendo ${telefonos.length} teléfonos con algo vivo, desde el ${IA.fecha(desde)} (contexto ${diasContexto} días)…`);
    const cont = { fotos: 0, documentos: 0, audios: 0, videos: 0, yaColocadas: 0 };
    const fallos = [];
    const vistos = new Set();
    const chats = [];
    let conChat = 0, soloNuestros = 0, soloCortesia = 0, seguidos = 0;
    for (const tel of telefonos) {
        let conv;
        try {
            conv = await api('/conversacion', { method: 'POST', body: { telefono: tel, dias: diasContexto }, plazo: 90_000 });
            seguidos = 0;
        } catch (e) {
            if (e.status === 404) continue;
            fallos.push({ tel, error: e.message });
            // Tres fallos seguidos: la sesión no está para leer. Mejor parar que insistir
            // sobre la sesión de la que salen todos los avisos de la app.
            if ((e.status === 503 || e.status === 504) && ++seguidos >= 3) throw new Error('El WhatsApp del VPS no responde: ronda cortada.');
            continue;
        } finally { await espera(PAUSA_MS); }
        conChat++;
        const ms = conv.mensajes || [];
        if (!ms.some(m => m.t >= desde) || vistos.has(conv.chatId)) continue;
        vistos.add(conv.chatId);
        if (!ms.some(m => !m.de_mi && m.t >= desde)) { soloNuestros++; continue; }
        if (R.soloCortesia(ms, desde)) { soloCortesia++; continue; }
        chats.push({ tel, conv, ms, personas: u.porTel.get(tel) });
    }
    console.log(`${conChat} chats leídos · ${chats.length} con algo nuevo suyo (${soloNuestros} solo nuestro, ${soloCortesia} solo cortesía)`);

    for (const a of chats) {
        const carpeta = path.join(dir, `chat_${a.tel}`);
        fs.mkdirSync(carpeta, { recursive: true });
        const suyos = a.ms.filter(m => !m.de_mi && IA.MEDIA.has(m.tipo) && m.t >= desde);
        const colocadas = new Map();
        for (let i = 0; i < suyos.length; i += 50) {
            const { data } = await supabase.from('whatsapp_media_importada').select('wa_msg_id, slot').in('wa_msg_id', suyos.slice(i, i + 50).map(m => m.id));
            for (const r of data || []) colocadas.set(r.wa_msg_id, r);
        }
        const adjuntos = [];
        const noLeidos = [];
        const numeros = new Map();
        let n = 0;
        for (const m of suyos) {
            if (colocadas.has(m.id)) { m._colocada = colocadas.get(m.id); cont.yaColocadas++; continue; }
            if (n >= MAX_ADJUNTOS) { noLeidos.push(`${IA.fecha(m.t)} ${m.tipo}: fuera del tope`); continue; }
            if (m.tipo === 'video') { m._video = true; cont.videos++; noLeidos.push(`${IA.fecha(m.t)} vídeo (no se baja)`); continue; }
            if (m.tipo === 'ptt' || m.tipo === 'audio') {
                try { m._transcripcion = (await api('/conversacion/transcribir', { method: 'POST', body: { msg: m.id }, plazo: 150_000 })).texto; cont.audios++; }
                catch (e) { noLeidos.push(`${IA.fecha(m.t)} audio: ${e.message}`); }
                continue;
            }
            if (!m.descargable) { noLeidos.push(`${IA.fecha(m.t)} ${m.tipo}: no descargable`); continue; }
            try {
                const f = await api(`/conversacion/adjunto?msg=${encodeURIComponent(m.id)}`, { binario: true, plazo: 150_000 });
                if (!/^image\/|pdf$/.test(f.mimetype)) { noLeidos.push(`${IA.fecha(m.t)} ${f.mimetype}: no se lee`); continue; }
                n++;
                const archivo = `adj_${String(n).padStart(2, '0')}.${extension(f.mimetype)}`;
                fs.writeFileSync(path.join(carpeta, archivo), f.buffer);
                numeros.set(m.id, n);
                adjuntos.push({ n, archivo, msg: m.id, tipo: /^image\//.test(f.mimetype) ? 'foto' : 'documento', mimetype: f.mimetype, fecha: IA.fecha(m.t), texto: m.texto || '' });
                if (/^image\//.test(f.mimetype)) cont.fotos++; else cont.documentos++;
            } catch (e) { noLeidos.push(`${IA.fecha(m.t)} ${m.tipo}: ${e.message}`); }
        }
        const obras = R.obrasDeChat(a.personas, u);
        const rol = R.rolDe(a.personas);
        const ultimo = a.ms[a.ms.length - 1];
        escribir(path.join(carpeta, 'chat.json'), {
            carpeta: `chat_${a.tel}`, telefono: a.tel, titulo: R.tituloDe(a.personas, a.conv.nombre), rol, rolTexto: ROL_TEXTO[rol] || rol,
            quien: IA.quienEs(a.personas),
            personas: a.personas.map(p => ({ tipo: p.tipo, id: p.id, nombre: p.nombre, rol: p.rol || null, via: p.via || null })),
            obras: obras.map(o => ({ codigo: o.codigo, linea: IA.lineaObra(o).replace(/^- /, '') })),
            lo_nuevo_desde: IA.fecha(desde),
            mensajes: a.ms.length, suyos: a.ms.filter(m => !m.de_mi).length,
            ultimo: `${IA.fecha(ultimo.t)} (${ultimo.de_mi ? 'nuestro' : 'suyo'})`,
            conversacion: IA.transcripcion(a.ms, numeros, envios),
            adjuntos,
            no_leidos: noLeidos,
        });
        console.log(`  ${`chat_${a.tel}`.padEnd(15)} ${R.tituloDe(a.personas, null).slice(0, 45).padEnd(45)} ${String(adjuntos.length).padStart(2)} adjuntos · ${obras.length} obras`);
    }
    const indice = {
        carpeta: dir, desde, hasta: ahora, generado: new Date().toISOString(),
        telefonos: telefonos.length, conChat, soloNuestros, soloCortesia, cont, fallos,
        chats: chats.map(a => `chat_${a.tel}`),
    };
    escribir(path.join(dir, 'indice.json'), indice);
    escribir(ESTADO, { ...est, ultimaCarpeta: dir });
    console.log(`\nCARPETA: ${dir}`);
    console.log(`CHATS: ${chats.length} · adjuntos: ${cont.fotos} fotos, ${cont.documentos} documentos, ${cont.audios} audios transcritos · ya colocados: ${cont.yaColocadas}`);
    console.log(`PENDIENTES: ${chats.map(a => `chat_${a.tel}`).join(' ')}`);
    if (bloqueadas.length) console.log(`(escrituras bloqueadas: ${bloqueadas.length})`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLOTS y DOSSIER — lo que Claude pide mientras decide
// ─────────────────────────────────────────────────────────────────────────────
function obraDe(dir, codigo) {
    const obras = leer(path.join(dir, 'obras.json'), {});
    const o = obras[codigo];
    if (!o) throw new Error(`La obra ${codigo} no está entre las obras vivas de esta ronda.`);
    return o;
}

async function slotsDe(obra) {
    if (!obra.oportunidad_id) return null;
    const { data: op } = await supabase.from('oportunidades').select('id, datos_calculo').eq('id', obra.oportunidad_id).maybeSingle();
    if (!op) return null;
    const slots = await reformaUploadService.checklistForOportunidad({ id: op.id, datos_calculo: op.datos_calculo });
    // Los mismos que ofrece el repartidor: ni el cajón «Otros» ni los ya con nombre propio.
    return slots.filter(s => !s.named && !s.existing);
}

async function ordenSlots(codigo) {
    const dir = ultimaCarpeta();
    const obra = obraDe(dir, codigo);
    const slots = await slotsDe(obra);
    if (!slots) { console.log(`${codigo}: sin apartados de documentación (CEE directo u obra sin oportunidad). slot = "".`); return; }
    let pendientes = new Set();
    try { const d = await R.dossierDe(obra); pendientes = new Set((d?.pendientes || []).map(p => p.clave)); } catch { /* sin dossier */ }
    console.log(`Apartados de ${codigo} (usa la CLAVE tal cual; "" si ninguno encaja):`);
    for (const s of slots) {
        const fase = s.fase === 'DESPUES' ? 'DESPUÉS' : 'ANTES';
        console.log(`- ${s.key} (${fase}${s.multiple ? ', varias fotos' : ''})${pendientes.has(s.key) ? ' · FALTA' : ''}: ${s.label}${s.help ? ` — ${s.help}` : ''}`);
    }
}

async function ordenDossier(carpetaChat, codigo) {
    const dir = ultimaCarpeta();
    const chat = leer(path.join(dir, carpetaChat, 'chat.json'));
    if (!chat) throw new Error(`No existe ${carpetaChat} en ${dir}`);
    const obra = obraDe(dir, codigo);
    const obras = leer(path.join(dir, 'obras.json'), {});
    const propuesta = IA.estadoPropuesta(obra);
    const dossier = (!propuesta || propuesta === 'ENVIADA') ? await R.dossierDe(obra) : null;
    const ch = { rol: chat.rol, personas: chat.personas, obras: chat.obras.map(o => obras[o.codigo]).filter(Boolean) };
    const { texto, enlaces } = IA.dossierParaBorrador(ch, obra, dossier);
    console.log(`DOSSIER de ${codigo} para ${carpetaChat}:\n`);
    console.log(texto);
    console.log(`\nMARCAS DE ENLACE QUE PUEDES USAR: ${Object.keys(enlaces).join(', ') || 'ninguna'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// INFORME — validar lo que ha decidido Claude y montarlo
// ─────────────────────────────────────────────────────────────────────────────
async function ordenInforme() {
    const dir = opt('carpeta') || args[1] || ultimaCarpeta();
    const indice = leer(path.join(dir, 'indice.json'));
    if (!indice) throw new Error(`No hay indice.json en ${dir}: falta «preparar».`);
    const obras = leer(path.join(dir, 'obras.json'), {});
    const slotsCache = new Map();
    const pendCache = new Map();
    const slotsDeObra = async (o) => { if (!slotsCache.has(o.codigo)) slotsCache.set(o.codigo, await slotsDe(o).catch(() => null)); return slotsCache.get(o.codigo); };
    const pendientesDe = async (o) => {
        if (!pendCache.has(o.codigo)) {
            let s = new Set();
            try { const d = await R.dossierDe(o); s = new Set((d?.pendientes || []).map(p => p.clave)); } catch { /* sin dossier */ }
            pendCache.set(o.codigo, s);
        }
        return pendCache.get(o.codigo);
    };

    const chats = [];
    for (const carpeta of indice.chats) {
        const chat = leer(path.join(dir, carpeta, 'chat.json'));
        if (!chat) continue;
        const obrasChat = chat.obras.map(o => obras[o.codigo]).filter(Boolean);
        const c = {
            ref: '', carpeta, telefono: chat.telefono, titulo: chat.titulo, rol: chat.rol, rolTexto: chat.rolTexto,
            obras: obrasChat, mensajes: chat.mensajes, suyos: chat.suyos, ultimo: chat.ultimo,
            filas: [], sinLeer: chat.no_leidos || [], adjuntosObra: 0, obrasTocadas: [],
        };
        chats.push(c);
        const r = leer(path.join(dir, carpeta, 'resultado.json'));
        if (!r) { c.error = 'Sin analizar: falta su resultado.json'; continue; }
        const an = IA.validarAnalisis(r, obrasChat);
        c.analisis = an;

        const tocadas = new Set();
        for (const a of an.adjuntos || []) {
            const adj = (chat.adjuntos || []).find(x => x.n === Number(a.n));
            if (!adj) continue;
            const obra = obrasChat.find(o => o.codigo === a.obra);
            let slot = null, hueco = false, donde = Informe.DESTINO_DOC[a.tipo] || '—';
            if (obra && ['FOTO_OBRA', 'FOTO_PLACA'].includes(a.tipo)) {
                const slots = await slotsDeObra(obra);
                const def = (slots || []).find(s => s.key === String(a.slot || '').trim());
                // El CÓDIGO valida: una clave que no es de ESA obra no se propone.
                if (def) { slot = def.key; hueco = (await pendientesDe(obra)).has(def.key); donde = `${def.labelCliente || def.label}${hueco ? ' · **rellena un hueco**' : ''}`; }
                else donde = 'sin clasificar';
            }
            if (a.tipo === 'NO_RELACIONADO') donde = 'nada (no es de una obra)';
            c.filas.push({
                msg: adj.msg, n: adj.n, cuando: adj.fecha, que: IA.corta(a.que_es, 70),
                obra: a.tipo === 'NO_RELACIONADO' ? '—' : a.obra, donde, confianza: a.confianza || 'baja',
                tipo: a.tipo, slot, hueco,
            });
            if (a.obra === 'NUEVA') c.nuevas = (c.nuevas || 0) + 1;
            else if (a.obra && a.tipo !== 'NO_RELACIONADO') { c.adjuntosObra++; tocadas.add(a.obra); }
        }
        c.obrasTocadas = [...tocadas];

        const b = r.borrador;
        if (b && ['RESPONDER', 'ESCALAR', 'CALLAR'].includes(b.accion)) {
            const obra = obrasChat.find(o => o.codigo === String(b.obra || '').trim()) || null;
            const propuesta = IA.estadoPropuesta(obra);
            const dossier = obra && (!propuesta || propuesta === 'ENVIADA') ? await R.dossierDe(obra).catch(() => null) : null;
            const enlaces = IA.enlacesAMarcas(dossier);
            const { texto, usados, problemas } = IA.sustituirEnlaces(IA.juntarParrafos(b), enlaces);
            c.borrador = {
                accion: b.accion === 'RESPONDER' && !texto ? 'ESCALAR' : b.accion,
                mensaje: b.accion === 'RESPONDER' ? texto : '',
                motivo: String(b.motivo || '').trim(),
                con_dossier: !!dossier, propuesta,
                enlaces: usados.map(m => ({ marca: m, url: enlaces[m] })),
                problemas_enlaces: problemas,
            };
            c.obraBorrador = obra?.codigo || null;
        }
    }

    const res = R.componer({
        chats, telefonos: { length: indice.telefonos }, conChat: indice.conChat, cont: indice.cont,
        cuenta: { llamadas: 0, in: 0, out: 0, think: 0, reintentos: 0, usd: 0 },
        fallos: indice.fallos || [], desde: indice.desde, hasta: indice.hasta, t0: new Date(indice.generado).getTime(),
    });
    res.modelo = 'Claude Code (suscripción) · audios transcritos con Gemini';
    res.resumen.soloNuestros = indice.soloNuestros;
    res.resumen.soloCortesia = indice.soloCortesia;
    const faltan = res.chats.filter(c => c.error).length;
    res.aviso = faltan ? `${faltan} chats se han quedado sin analizar (falta su resultado.json).` : null;

    escribir(path.join(dir, 'informe.md'), Informe.informeMarkdown(res));
    escribir(path.join(dir, 'informe.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ronda de WhatsApp</title>${Informe.informeHtml(res)}`);
    const resumen = Informe.resumenWhatsapp(res) || 'Nada nuevo que contar.';
    escribir(path.join(dir, 'resumen.txt'), resumen);
    escribir(path.join(dir, 'informe.json'), { ...res, chats: res.chats.map(c => ({ ...c })) });
    // El cursor avanza SOLO si se ha analizado todo: lo que falte sale en la próxima.
    const est = leer(ESTADO, {});
    if (!faltan) escribir(ESTADO, { ...est, cursor: indice.hasta, ultimaCarpeta: dir, ultimoInforme: new Date().toISOString() });

    console.log(resumen.replace(/\*/g, ''));
    console.log(`\nINFORME: ${path.join(dir, 'informe.md')}`);
    console.log(`CORREO:  ${path.join(dir, 'informe.html')}`);
    console.log('REFERENCIAS: ' + res.chats.map(c => `${c.ref}=${c.carpeta}`).join(' · '));
    if (faltan) console.log(`\n⚠️ ${faltan} chats sin resultado.json: el cursor NO avanza (saldrán en la próxima ronda).`);
    if (bloqueadas.length) console.log(`(escrituras bloqueadas: ${bloqueadas.length})`);
}

// ─────────────────────────────────────────────────────────────────────────────
(async () => {
    if (orden === 'preparar') await preparar();
    else if (orden === 'slots' && args[1]) await ordenSlots(args[1]);
    else if (orden === 'dossier' && args[1] && args[2]) await ordenDossier(args[1], args[2]);
    else if (orden === 'informe') await ordenInforme();
    else {
        console.log('Uso: node scripts/ronda_cc.js preparar [--dias N] [--api URL]\n'
            + '       node scripts/ronda_cc.js slots <código>\n'
            + '       node scripts/ronda_cc.js dossier <chat_carpeta> <código>\n'
            + '       node scripts/ronda_cc.js informe [carpeta]');
        process.exit(1);
    }
    process.exit(0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
