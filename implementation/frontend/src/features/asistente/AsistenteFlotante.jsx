import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SendActionOverlay from '../../components/SendActionOverlay';

// ─── El asistente de la app ──────────────────────────────────────────────────
// Botón flotante (abajo a la derecha) que abre un chat con Claude. Contesta con
// datos EN VIVO de la cartera (backend: routes/asistenteApp.js →
// services/asistenteApp.js, por la API de Anthropic) y enlaza a lo que nombra:
// los enlaces `?exp=` / `?cee=` / `?op=` se abren DENTRO de la app con `onAbrir`.
//
// Lo pesado no lo hace él: propone un ENCARGO y aquí sale una tarjeta con el botón
// «Encargar», que se lo pasa al Claude del WhatsApp (suscripción de Fran). Nada se
// encarga sin ese clic.
//
// La conversación vive en el navegador (sessionStorage): al backend viaja solo el
// texto de los mensajes en cada pregunta, y `pantalla` ({ tab, exp, cee, op }: lo que
// está abierto en la app), que el servidor resuelve a su número y le cuenta al modelo.
// Así «genera el CIFO» con un expediente abierto es de ESE. Solo se monta para ADMIN (App.jsx).

const CLAVE_SESION = 'brokergy.asistente.v1';
const SUGERENCIAS_INICIO = [
    '¿Qué tengo pendiente hoy?',
    '¿Qué CEE tengo sin revisar?',
    '¿Cómo vamos con la cartera?',
    '¿Cómo funciona el parte diario?',
];
// Con un expediente abierto, lo que se le suele pedir sobre él.
const SUGERENCIAS_EXPEDIENTE = [
    '¿Qué le falta a este expediente?',
    'Genera el CIFO',
    'Genera el CEE final',
    'Justifica el expediente',
];

const nuevoId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function leerSesion() {
    try {
        const v = JSON.parse(sessionStorage.getItem(CLAVE_SESION) || '[]');
        return Array.isArray(v) ? v.map(m => ({ ...m, enCurso: false })) : [];
    } catch { return []; }
}

function formatoCoste(usd) {
    if (usd == null) return null;
    if (usd < 0.01) return '< 0,01 $';
    return `≈ ${usd.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
}

// ─── Markdown mínimo: párrafos, listas, **negrita**, `código` y [enlaces](…) ───
// Sin dangerouslySetInnerHTML: se construyen los elementos a mano. Las líneas `>>`
// (botones que el servidor ya ha convertido) no se pintan, ni siquiera a medio escribir.
function enLinea(texto, onEnlace, clave) {
    const partes = [];
    const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
    let ultimo = 0;
    let m;
    let i = 0;
    while ((m = re.exec(texto))) {
        if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
        const t = m[0];
        const k = `${clave}-${i++}`;
        if (t.startsWith('**')) partes.push(<strong key={k} className="font-bold text-white">{t.slice(2, -2)}</strong>);
        else if (t.startsWith('`')) partes.push(<code key={k} className="px-1 py-0.5 rounded bg-white/[0.06] text-[0.85em]">{t.slice(1, -1)}</code>);
        else {
            const [, etiqueta, url] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t);
            if (url.startsWith('?')) {
                partes.push(
                    <button key={k} type="button" onClick={() => onEnlace(url)}
                        className="inline font-bold text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand">
                        {etiqueta}
                    </button>,
                );
            } else if (/^https?:\/\//.test(url)) {
                partes.push(<a key={k} href={url} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2">{etiqueta}</a>);
            } else {
                partes.push(etiqueta);
            }
        }
        ultimo = m.index + t.length;
    }
    if (ultimo < texto.length) partes.push(texto.slice(ultimo));
    return partes;
}

function TextoAsistente({ texto, onEnlace }) {
    const lineas = String(texto || '').split('\n').filter((l, idx, arr) => {
        const t = l.trim();
        if (t.startsWith('>>')) return false;
        return !(idx === arr.length - 1 && t === '>');   // «>» a medio escribir
    });
    const bloques = [];
    let lista = null;
    lineas.forEach((l, idx) => {
        const vineta = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
        if (vineta) {
            const ordenada = /^\s*\d/.test(l);
            if (!lista || lista.ordenada !== ordenada) { lista = { ordenada, items: [] }; bloques.push(lista); }
            lista.items.push(vineta[1]);
            return;
        }
        lista = null;
        if (!l.trim()) { bloques.push(null); return; }
        const titulo = /^#{1,4}\s+(.*)$/.exec(l);
        bloques.push({ parrafo: titulo ? `**${titulo[1]}**` : l, idx });
    });
    const out = [];
    let parrafo = [];
    const cerrarParrafo = (k) => {
        if (!parrafo.length) return;
        out.push(<p key={`p${k}`} className="leading-relaxed">{parrafo.flatMap((t, i) => (i ? [<br key={`br${k}-${i}`} />, ...enLinea(t, onEnlace, `p${k}-${i}`)] : enLinea(t, onEnlace, `p${k}-${i}`)))}</p>);
        parrafo = [];
    };
    bloques.forEach((b, k) => {
        if (b === null) { cerrarParrafo(k); return; }
        if (b.items) {
            cerrarParrafo(k);
            const Tag = b.ordenada ? 'ol' : 'ul';
            out.push(
                <Tag key={`l${k}`} className={`${b.ordenada ? 'list-decimal' : 'list-disc'} pl-5 space-y-1`}>
                    {b.items.map((it, j) => <li key={j} className="leading-relaxed">{enLinea(it, onEnlace, `l${k}-${j}`)}</li>)}
                </Tag>,
            );
            return;
        }
        parrafo.push(b.parrafo);
    });
    cerrarParrafo('fin');
    return <div className="space-y-2.5">{out}</div>;
}

function Girando({ className = 'w-3.5 h-3.5' }) {
    return (
        <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    );
}

// La mascota (la gota de «energía») es la cara del asistente. El original es un SVG de
// 720 KB con un PNG dentro (Drive: 02. MARKETING/…/LOGOS/BROKERGY_mascota_01_energia.svg);
// aquí va recortada a la cabeza, a 192 px y en WebP (4,5 KB).
const MASCOTA = '/mascota-gota.webp';

function CaraAsistente({ className = 'w-8 h-8' }) {
    return (
        <span className={`${className} rounded-full bg-white overflow-hidden flex-shrink-0`}>
            <img src={MASCOTA} alt="" draggable={false} className="w-full h-full object-cover" />
        </span>
    );
}

// El botón es una burbuja de chat blanca (círculo + rabito abajo a la izquierda) con la
// mascota dentro. Un solo SVG para el contorno: así la sombra rodea círculo y rabito juntos.
function BurbujaMascota() {
    return (
        <>
            <svg className="absolute inset-0 w-full h-full text-white drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]" viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="33" cy="30" r="28" fill="currentColor" />
                <path d="M21 55 Q13 59 5 61 Q10 54 10 45 Z" fill="currentColor" />
            </svg>
            <img src={MASCOTA} alt="" draggable={false}
                className="absolute left-[7px] top-[4px] w-[52px] h-[52px] rounded-full object-cover" />
        </>
    );
}

function TarjetaEncargo({ encargo, estado, onEncargar, onEnlace }) {
    const a = encargo.asistente || {};
    // `encargo.hecho` va guardado en el mensaje (sessionStorage): al recargar, la tarjeta
    // sigue diciendo que se está preparando y no invita a encargarlo dos veces.
    const hecho = estado === 'ok' || !!encargo.hecho;
    const bloqueado = a.conectado === false;
    const pres = encargo.presentacion;          // «presentar»: la tarjeta ES la pregunta del pago
    if (hecho && pres) {
        return (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3">
                <div className="text-sm font-bold text-white">
                    Encargado a tu PC: presentar <TextoEnlace texto={encargo.enlace} onEnlace={onEnlace} />
                </div>
                <div className="mt-1 text-xs text-white/70">
                    {encargo.pcTexto ? `${encargo.pcTexto.charAt(0).toUpperCase()}${encargo.pcTexto.slice(1)}. ` : ''}
                    Te avisaremos por WhatsApp cuando empiece y cuando esté registrado; tú solo tendrás que autorizar el pago en la app del banco.
                </div>
            </div>
        );
    }
    if (pres) {
        const pc = a.pc || null;
        return (
            <div className="mt-3 rounded-xl border border-brand/40 bg-brand/[0.07] p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-brand/80">Presentar en el Registro · lo hace tu PC</div>
                {/* Los *negritas* de WhatsApp de la pregunta, en el markdown del popup. */}
                <div className="mt-1 text-sm text-white leading-relaxed">
                    {enLinea(pres.pregunta.replace(/\*([^*]+)\*/g, '**$1**'), onEnlace, 'pres')}
                </div>
                <div className="mt-1.5 text-[11px] leading-snug text-white/50">
                    Tu PC lo califica en CE3X, lo firma con tu certificado y lo presenta con tu Chrome. Gasta de tu suscripción de Claude.
                </div>
                {pc && !pc.vivo && <div className="mt-1.5 text-[11px] text-amber-400">Ojo: {pc.texto}.</div>}
                {bloqueado && <div className="mt-1.5 text-[11px] text-amber-400">No se puede encargar desde aquí: {a.motivo}</div>}
                {estado === 'error' && <div className="mt-1.5 text-[11px] text-red-400">No se ha encargado. Puedes volver a intentarlo.</div>}
                <div className="mt-2.5 flex justify-end">
                    <button type="button" disabled={bloqueado || estado === 'enviando'} onClick={onEncargar}
                        className="px-4 py-1.5 rounded-lg bg-brand text-bkg-deep text-xs font-black uppercase tracking-wider hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed">
                        Presentar y pagar {pres.importe} €
                    </button>
                </div>
            </div>
        );
    }
    if (hecho) {
        return (
            <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3">
                <div className="text-sm font-bold text-white">
                    Se está preparando {encargo.que || 'el encargo'} de <TextoEnlace texto={encargo.enlace} onEnlace={onEnlace} />
                </div>
                <div className="mt-1 text-xs text-white/70">
                    Te avisaremos por WhatsApp cuando esté listo.
                    {encargo.enCola ? ' Ahora está terminando otro trabajo: empieza en cuanto acabe.' : ''}
                </div>
            </div>
        );
    }
    return (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand/[0.06] p-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-brand/80">Encargo al Claude del WhatsApp</div>
            <div className="mt-1 text-sm font-bold text-white">
                {encargo.etiqueta} · <TextoEnlace texto={encargo.enlace} onEnlace={onEnlace} />
            </div>
            {encargo.detalle && <div className="mt-1 text-xs text-white/70">{encargo.detalle}</div>}
            <div className="mt-1.5 text-[11px] leading-snug text-white/50">
                Gasta de tu suscripción de Claude, tarda unos minutos y contesta por el grupo «BROKERGY - CHAT».
                {a.trabajando ? ' Ahora mismo está con otro trabajo: lo cogerá al acabar.' : ''}
            </div>
            {bloqueado && <div className="mt-1.5 text-[11px] text-amber-400">No se puede encargar desde aquí: {a.motivo}</div>}
            {estado === 'error' && <div className="mt-1.5 text-[11px] text-red-400">No se ha encargado. Puedes volver a intentarlo.</div>}
            <div className="mt-2.5 flex justify-end">
                <button type="button" disabled={bloqueado || estado === 'enviando'} onClick={onEncargar}
                    className="px-4 py-1.5 rounded-lg bg-brand text-bkg-deep text-xs font-black uppercase tracking-wider hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed">
                    Encargar
                </button>
            </div>
        </div>
    );
}

function TextoEnlace({ texto, onEnlace }) {
    return <>{enLinea(String(texto || ''), onEnlace, 'enc')}</>;
}

export default function AsistenteFlotante({ onAbrir, pantalla }) {
    const [abierto, setAbierto] = useState(false);
    const [vista, setVista] = useState(null);            // pantalla resuelta: { tipo, numero, cliente, … }
    const [mensajes, setMensajes] = useState(leerSesion);
    const [entrada, setEntrada] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [config, setConfig] = useState(null);
    const [encargos, setEncargos] = useState({});        // id de tarjeta → 'enviando' | 'ok' | 'error'
    const [overlay, setOverlay] = useState(null);         // SendActionOverlay del encargo
    const corteRef = useRef(null);
    const finalRef = useRef(null);
    const entradaRef = useRef(null);

    useEffect(() => {
        try { sessionStorage.setItem(CLAVE_SESION, JSON.stringify(mensajes.slice(-40))); } catch { /* sin almacenamiento: se pierde al recargar */ }
    }, [mensajes]);

    useEffect(() => {
        if (!abierto || config) return;
        axios.get('/api/asistente-app/estado')
            .then(r => setConfig(r.data))
            .catch(() => setConfig({ disponible: false, error: true }));
    }, [abierto, config]);

    // Qué tiene abierto, para la cabecera. Primitivos en las dependencias: el objeto
    // `pantalla` es nuevo en cada render de App.
    const pTab = pantalla?.tab || null;
    const pExp = pantalla?.exp || null;
    const pCee = pantalla?.cee || null;
    const pOp = pantalla?.op || null;
    useEffect(() => {
        if (!abierto) return undefined;
        if (!pExp && !pCee && !pOp) { setVista(null); return undefined; }
        let vivo = true;
        axios.get('/api/asistente-app/pantalla', { params: { tab: pTab, exp: pExp, cee: pCee, op: pOp } })
            .then(r => { if (vivo) setVista(r.data?.pantalla?.tipo ? r.data.pantalla : null); })
            .catch(() => { if (vivo) setVista(null); });
        return () => { vivo = false; };
    }, [abierto, pTab, pExp, pCee, pOp]);

    useEffect(() => {
        if (abierto) finalRef.current?.scrollIntoView({ block: 'end' });
    }, [mensajes, abierto]);

    useEffect(() => {
        if (abierto) setTimeout(() => entradaRef.current?.focus(), 50);
    }, [abierto]);

    // Cerrar con Escape (solo si no hay un envío en marcha en el overlay).
    useEffect(() => {
        if (!abierto) return undefined;
        const alPulsar = (e) => { if (e.key === 'Escape' && !overlay) setAbierto(false); };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [abierto, overlay]);

    const actualizar = useCallback((id, cambio) => {
        setMensajes(prev => prev.map(m => (m.id === id ? cambio(m) : m)));
    }, []);

    const abrirEnlace = useCallback((url) => {
        const p = new URLSearchParams(url.slice(1));
        onAbrir?.({ exp: p.get('exp'), cee: p.get('cee'), op: p.get('op') });
        // En el móvil el chat tapa la pantalla entera: se recoge para ver lo abierto.
        if (window.innerWidth < 768) setAbierto(false);
    }, [onAbrir]);

    const enviar = useCallback(async (textoPregunta) => {
        const pregunta = String(textoPregunta ?? '').trim();
        if (!pregunta || enviando) return;
        const usuario = { id: nuevoId(), rol: 'user', texto: pregunta };
        const respuesta = { id: nuevoId(), rol: 'assistant', texto: '', pasos: [], encargos: [], sugerencias: [], enCurso: true };
        const historial = [...mensajes, usuario]
            .filter(m => m.texto && m.texto.trim())
            .map(m => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.texto }));
        setMensajes(prev => [...prev, usuario, respuesta]);
        setEntrada('');
        setEnviando(true);
        const corte = new AbortController();
        corteRef.current = corte;
        const aplicar = (ev) => actualizar(respuesta.id, (m) => {
            switch (ev.t) {
                case 'paso': return { ...m, pasos: [...m.pasos, ev.texto] };
                case 'texto': return { ...m, texto: m.texto + ev.d };
                case 'encargo': return { ...m, encargos: [...m.encargos, { ...ev, id: nuevoId() }] };
                case 'sugerencias': return { ...m, sugerencias: ev.opciones || [] };
                case 'error': return { ...m, error: ev.mensaje };
                case 'fin': return { ...m, uso: ev.uso, enCurso: false };
                default: return m;
            }
        });
        try {
            const r = await fetch('/api/asistente-app/preguntar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: axios.defaults.headers.common.Authorization || '' },
                body: JSON.stringify({ mensajes: historial, pantalla: { tab: pTab, exp: pExp, cee: pCee, op: pOp } }),
                signal: corte.signal,
            });
            if (!r.ok || !r.body) {
                const cuerpo = await r.json().catch(() => ({}));
                aplicar({ t: 'error', mensaje: cuerpo.error || `El servidor ha respondido ${r.status}.` });
            } else {
                const lector = r.body.getReader();
                const dec = new TextDecoder();
                let resto = '';
                for (;;) {
                    const { value, done } = await lector.read();
                    if (done) break;
                    resto += dec.decode(value, { stream: true });
                    const lineas = resto.split('\n');
                    resto = lineas.pop();
                    for (const l of lineas) {
                        if (!l.trim()) continue;
                        try { aplicar(JSON.parse(l)); } catch { /* línea rota: se ignora */ }
                    }
                }
                if (resto.trim()) { try { aplicar(JSON.parse(resto)); } catch { /* idem */ } }
            }
        } catch (e) {
            if (e.name !== 'AbortError') aplicar({ t: 'error', mensaje: `No se ha podido hablar con el servidor (${e.message}).` });
        } finally {
            actualizar(respuesta.id, m => ({ ...m, enCurso: false }));
            setEnviando(false);
            corteRef.current = null;
        }
    }, [enviando, mensajes, actualizar, pTab, pExp, pCee, pOp]);

    const parar = () => corteRef.current?.abort();

    const nueva = () => {
        if (enviando) parar();
        setMensajes([]);
        setEncargos({});
    };

    const encargar = async (encargo) => {
        setEncargos(prev => ({ ...prev, [encargo.id]: 'enviando' }));
        setOverlay({ phase: 'sending', encargo });
        try {
            const { data } = await axios.post('/api/asistente-app/encargo', {
                referencia: encargo.referencia, tarea: encargo.tarea, detalle: encargo.detalle,
            });
            setEncargos(prev => ({ ...prev, [encargo.id]: 'ok' }));
            // Se marca en el MENSAJE (que se guarda) para que sobreviva a una recarga.
            setMensajes(prev => prev.map(m => (m.encargos || []).some(x => x.id === encargo.id)
                ? { ...m, encargos: m.encargos.map(x => (x.id === encargo.id ? { ...x, hecho: true, enCola: !!data?.enCola, pcTexto: data?.pc?.texto || null } : x)) }
                : m));
            setOverlay({ phase: 'done', ok: true, encargo });
        } catch (e) {
            setEncargos(prev => ({ ...prev, [encargo.id]: 'error' }));
            setOverlay({ phase: 'done', ok: false, encargo, error: e.response?.data?.motivo || e.message });
        }
    };

    const ultimoAsistente = [...mensajes].reverse().find(m => m.rol === 'assistant');
    const noDisponible = config && !config.disponible;

    const panel = abierto && (
        <div className="fixed z-[9400] inset-0 md:inset-auto md:bottom-24 md:right-5 md:w-[420px] md:h-[min(660px,calc(100vh-8rem))] flex flex-col bg-bkg-surface md:rounded-2xl border border-white/10 shadow-2xl overflow-hidden animate-fade-in"
            role="dialog" aria-label="Asistente de BROKERGY">
            {/* Cabecera */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08] bg-bkg-deep pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-3">
                <CaraAsistente className="w-9 h-9" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-white leading-tight">Asistente</div>
                    {vista ? (
                        <div className="text-[10px] text-white/40 truncate" title={`Sabe que tienes abierto ${vista.numero}: «genera el CIFO» será de este.`}>
                            Viendo <span className="font-bold text-brand">{vista.numero}</span>{vista.cliente ? ` · ${vista.cliente}` : ''}
                        </div>
                    ) : (
                        <div className="text-[10px] text-white/40 truncate">Contesta con los datos de la app en vivo</div>
                    )}
                </div>
                <button type="button" onClick={nueva} title="Nueva conversación"
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider text-white/50 hover:text-white hover:bg-white/[0.06]">
                    Nueva
                </button>
                <button type="button" onClick={() => setAbierto(false)} title="Cerrar" aria-label="Cerrar"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
            </div>

            {/* Conversación */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm text-white/85">
                {noDisponible && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                        {config.error ? 'No se ha podido comprobar el asistente.' : 'Falta la clave de la API de Anthropic (ANTHROPIC_API_KEY) en el servidor: el asistente no puede contestar.'}
                    </div>
                )}
                {!mensajes.length && (
                    <div className="pt-2">
                        <div className="text-white font-bold">¿En qué te ayudo?</div>
                        <p className="mt-1 text-xs text-white/50 leading-relaxed">
                            {vista?.tipo === 'expediente'
                                ? <>Estás en <strong className="text-white/80">{vista.numero}</strong>: pregúntame qué le falta o pídeme que genere algo («genera el CIFO», «haz el CEE final»).</>
                                : <>Pregúntame por un expediente («¿cómo está el 208?»), por lo pendiente o por cómo funciona algo de la app.</>}
                            {' '}Lo pesado te lo dejo listo con un botón «Encargar», y lo hace el Claude del WhatsApp con tu suscripción.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {(vista?.tipo === 'expediente' ? SUGERENCIAS_EXPEDIENTE : SUGERENCIAS_INICIO).map(s => (
                                <button key={s} type="button" onClick={() => enviar(s)} disabled={noDisponible}
                                    className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-xs text-white/75 hover:border-brand/50 hover:text-white disabled:opacity-40">
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {mensajes.map(m => (m.rol === 'user' ? (
                    <div key={m.id} className="flex justify-end">
                        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand/15 border border-brand/20 px-3.5 py-2 text-white whitespace-pre-wrap break-words">{m.texto}</div>
                    </div>
                ) : (
                    <div key={m.id} className="max-w-full">
                        {m.enCurso && !m.texto && (
                            <div className="flex items-center gap-2 text-xs text-white/45">
                                <Girando />
                                <span>{m.pasos[m.pasos.length - 1] || 'Pensando…'}</span>
                            </div>
                        )}
                        {m.texto && <div className="break-words"><TextoAsistente texto={m.texto} onEnlace={abrirEnlace} /></div>}
                        {m.error && <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{m.error}</div>}
                        {(m.encargos || []).map(enc => (
                            <TarjetaEncargo key={enc.id} encargo={enc} estado={encargos[enc.id]} onEncargar={() => encargar(enc)} onEnlace={abrirEnlace} />
                        ))}
                        {m === ultimoAsistente && !m.enCurso && (m.sugerencias || []).length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {m.sugerencias.map(s => (
                                    <button key={s} type="button" onClick={() => enviar(s)} disabled={enviando}
                                        className="px-3 py-1.5 rounded-full border border-brand/30 bg-brand/[0.06] text-xs text-white/85 hover:bg-brand/15 hover:text-white disabled:opacity-40">
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                        {!m.enCurso && m.uso?.coste_usd != null && (
                            <div className="mt-1.5 text-[10px] text-white/25" title={`${m.uso.modelo} · ${m.uso.vueltas} consultas al modelo`}>{formatoCoste(m.uso.coste_usd)}</div>
                        )}
                    </div>
                )))}
                <div ref={finalRef} />
            </div>

            {/* Entrada */}
            <form className="border-t border-white/[0.08] bg-bkg-deep p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:pb-3"
                onSubmit={(e) => { e.preventDefault(); enviar(entrada); }}>
                <div className="flex items-end gap-2">
                    <textarea ref={entradaRef} rows={1} value={entrada} disabled={noDisponible}
                        onChange={(e) => setEntrada(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(entrada); } }}
                        placeholder="Pregunta algo…"
                        // `case-sensitive`: index.css pone TODO textarea en mayúsculas.
                        className="case-sensitive flex-1 resize-none max-h-32 rounded-xl border border-white/10 bg-bkg-surface px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-brand/50 disabled:opacity-40"
                        style={{ fieldSizing: 'content' }} />
                    {enviando ? (
                        <button type="button" onClick={parar} title="Parar"
                            className="h-9 px-3 rounded-xl border border-white/15 text-xs font-bold text-white/70 hover:text-white hover:bg-white/[0.06]">
                            Parar
                        </button>
                    ) : (
                        <button type="submit" disabled={!entrada.trim() || noDisponible} title="Enviar"
                            className="h-9 w-9 rounded-xl bg-brand text-bkg-deep flex items-center justify-center hover:bg-brand-400 disabled:opacity-30">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" /></svg>
                        </button>
                    )}
                </div>
            </form>
        </div>
    );

    const boton = (
        <button type="button" onClick={() => setAbierto(v => !v)}
            title={abierto ? 'Cerrar el asistente' : 'Asistente'} aria-label="Asistente"
            className={`fixed z-[9300] right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] w-16 h-16 flex items-center justify-center active:scale-95 transition ${abierto ? 'max-md:hidden' : 'hover:scale-105 hover:-translate-y-0.5'}`}>
            {abierto
                ? (
                    <span className="w-14 h-14 rounded-full bg-brand text-bkg-deep shadow-xl shadow-brand/20 flex items-center justify-center hover:bg-brand-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 9l6 6 6-6" /></svg>
                    </span>
                )
                : <BurbujaMascota />}
            {!abierto && enviando && <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-bkg-deep animate-pulse" />}
        </button>
    );

    const ov = overlay && (
        <SendActionOverlay
            phase={overlay.phase}
            ok={overlay.ok}
            icon="send"
            subtitle={`${overlay.encargo.etiqueta} · ${overlay.encargo.referencia}`}
            sendingTitle={overlay.encargo.presentacion ? 'Pasándoselo a tu PC…' : 'Encargando al Claude del WhatsApp…'}
            okTitle={overlay.encargo.presentacion ? 'Encargado a tu PC' : 'Se está preparando'}
            errorTitle="No se ha podido encargar"
            items={overlay.ok ? [
                `${overlay.encargo.etiqueta} · ${overlay.encargo.referencia}`,
                overlay.encargo.presentacion
                    ? 'Te avisaremos por WhatsApp cuando empiece y cuando esté registrado'
                    : 'Te avisaremos por WhatsApp cuando esté listo',
            ] : []}
            errorText={overlay.error}
            onClose={() => setOverlay(null)}
        />
    );

    return createPortal(<>{boton}{panel}{ov}</>, document.body);
}
