// ─────────────────────────────────────────────────────────────────────────────
// El ASISTENTE de la envolvente: se DICE lo que está mal y se corrige solo.
//
// «La V3 no va en la FBE1 sino en la FBE3, y es de PVC», «el garaje llega hasta
// el final de la vivienda», «quita la aerotermia». Se escribe o se habla (el
// micrófono dicta en el propio navegador; donde no sabe, graba y lo transcribe
// el servidor), Claude devuelve operaciones y el navegador las VALIDA contra el
// plano antes de tocar nada.
//
// Es una VENTANA EMERGENTE con su conversación, como el asistente de la app
// (Fran, 28/10/2026: «que el asistente sea una ventana emergente como el de la
// app… si le pido algo, que lo ejecute»). Antes era un panel fijo arriba de la
// columna de la pared y siempre pedía el «Sí».
//
// REGLA — lo CLARO se HACE; lo dudoso se PREGUNTA. Con «Hacerlo directamente»
// encendido (por defecto), si todo lo propuesto casa con el plano, no hay ni un
// aviso, el modelo está seguro y no pregunta nada, se aplica sin «Sí» y queda un
// «Deshacer» que vuelve exactamente a como estaba. Si algo no cuadra, se enseña
// la lista y se espera al «Sí», como antes. El `.cex` solo se vuelve a escribir
// si se PIDE («…y genera el CEE») o con «Sí, y generar el CEE». Ejecutar no
// gasta tokens: lo que cuesta es entender la frase (~0,0002 $), y solo viaja la
// frase de ahora con el resumen del plano, nunca la conversación entera.
//
// Lo que no casa con el plano NO se aplica: se dice en ámbar. Si el modelo
// pregunta, la respuesta se escribe en la misma caja.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { postEnvolvente } from '../logic/pedirEnvolvente';
import { ejemplosPara, paredesAmbiguas, pideGenerar, resumenCompacto, validarOperaciones } from '../logic/asistenteEnvolvente';
import { EVENTO_ABRIR_ASISTENTE } from '../logic/atajosPared';
import axios from 'axios';

const Reconocedor = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;
const puedeGrabar = typeof window !== 'undefined' && !!window.MediaRecorder
    && !!navigator.mediaDevices?.getUserMedia;

const CLAVE_DIRECTO = 'envolvente:asistente-directo';
const leerDirecto = () => {
    try { return localStorage.getItem(CLAVE_DIRECTO) !== 'no'; } catch { return true; }
};

//: El micrófono y la chispa, dibujados (un emoji sale distinto en cada sistema).
const Microfono = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
);
const Chispa = ({ className = 'h-4 w-4' }) => (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </svg>
);

const usd = (n) => (Number.isFinite(n) ? `${n < 0.01 ? n.toFixed(4) : n.toFixed(3)} $` : '');
const nombreModelo = (m) => m?.replace('claude-', '').replace(/-(\d)-(\d)$/, ' $1.$2') || '';

/**
 * `contexto()` da lo que hace falta para el resumen y para validar, en el momento
 * de preguntar (no al pintar): plantas, muros, zonas, t, catalogo, elegidas,
 * fase, defecto, sel. `onAplicar(pasos, { generar })` lo aplica la ventana y
 * resuelve al ACABAR (`{ medido }`: false si no se pudo volver a medir), y
 * `onDeshacer()` vuelve a como estaba antes del último aplicado. `trabajando`
 * es lo que la ventana está haciendo («Volviendo a medir…»), y con `oculto`
 * (un popup suyo delante) el asistente se aparta.
 */
export function AsistenteEnvolvente({ urlAsistente, urlVoz, contexto, onAplicar, onDeshacer = null,
                                      puedeGenerar = true, ocupado = false, trabajando = null,
                                      oculto = false }) {
    const [abierto, setAbierto] = useState(false);
    const [directo, setDirecto] = useState(leerDirecto);
    const [texto, setTexto] = useState('');
    const [oyendo, setOyendo] = useState(null);       // 'dictado' | 'grabando' | null
    const [pidiendo, setPidiendo] = useState(false);
    const [aplicando, setAplicando] = useState(false);
    const [transcribiendo, setTranscribiendo] = useState(false);
    const [fallo, setFallo] = useState(null);
    //: La conversación, solo para enseñarla: a Claude no viaja (ver cabecera).
    //: { quien: 'yo', texto } | { quien: 'ia', entendido, pasos, errores,
    //:   avisos, seguro, pregunta, coste, modelo, estado, generar, nota }
    //: estado: 'propuesto' · 'hecho' · 'no' · 'deshecho' · 'respuesta'
    const [chat, setChat] = useState([]);
    const rec = useRef(null);
    const grabadora = useRef(null);
    //: Si el asistente PREGUNTÓ: lo que se le había pedido y su pregunta. Lo que
    //: se escriba después es la respuesta y viaja con las dos delante.
    const preguntaPrevia = useRef(null);   // { pedido, pregunta }
    const caja = useRef(null);
    const fin = useRef(null);

    // Al desmontar, que no se quede el micrófono abierto.
    useEffect(() => () => {
        try { rec.current?.abort?.(); } catch { /* ya parado */ }
        try { grabadora.current?.stream?.getTracks?.().forEach(t => t.stop()); } catch { /* idem */ }
    }, []);
    useEffect(() => { fin.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [chat, pidiendo]);
    useEffect(() => { if (abierto) caja.current?.focus(); }, [abierto]);
    // La tecla «A» del plano (`logic/atajosPared.js`) lo abre.
    useEffect(() => {
        const abrir = () => setAbierto(true);
        window.addEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
        return () => window.removeEventListener(EVENTO_ABRIR_ASISTENTE, abrir);
    }, []);
    useEffect(() => {
        if (!abierto) return undefined;
        const tecla = (e) => { if (e.key === 'Escape') setAbierto(false); };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [abierto]);

    function cambiarDirecto(v) {
        setDirecto(v);
        try { localStorage.setItem(CLAVE_DIRECTO, v ? 'si' : 'no'); } catch { /* sin almacenamiento */ }
    }

    function dictar() {
        if (oyendo) { parar(); return; }
        setFallo(null);
        if (Reconocedor) {
            const r = new Reconocedor();
            r.lang = 'es-ES';
            r.interimResults = true;
            r.continuous = true;
            const base = texto ? `${texto.trim()} ` : '';
            r.onresult = (ev) => {
                let dicho = '';
                for (let i = 0; i < ev.results.length; i++) dicho += ev.results[i][0].transcript;
                setTexto(base + dicho.trim());
            };
            r.onerror = (ev) => {
                if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
                    setFallo(ev.error === 'not-allowed'
                        ? 'El navegador no deja usar el micrófono: dale permiso en el candado de la barra de direcciones.'
                        : `El dictado ha fallado (${ev.error}).`);
                }
            };
            r.onend = () => setOyendo(null);
            rec.current = r;
            r.start();
            setOyendo('dictado');
            return;
        }
        if (puedeGrabar) grabar();
        else setFallo('Este navegador no deja dictar: escríbelo.');
    }

    async function grabar() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mr = new MediaRecorder(stream);
            const trozos = [];
            mr.ondataavailable = (e) => { if (e.data?.size) trozos.push(e.data); };
            mr.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                setOyendo(null);
                const blob = new Blob(trozos, { type: mr.mimeType || 'audio/webm' });
                if (!blob.size) return;
                setPidiendo(true); setTranscribiendo(true);
                try {
                    const fd = new FormData();
                    fd.append('audio', blob, 'voz.webm');
                    const { data } = await axios.post(urlVoz, fd);
                    setTexto(t => (t ? `${t.trim()} ` : '') + (data.texto || ''));
                } catch (e) {
                    setFallo(e.response?.data?.error || 'No se ha podido transcribir el audio: escríbelo.');
                } finally { setPidiendo(false); setTranscribiendo(false); }
            };
            mr.stream = stream;
            grabadora.current = mr;
            mr.start();
            setOyendo('grabando');
        } catch {
            setFallo('El navegador no deja usar el micrófono: dale permiso, o escríbelo.');
        }
    }

    function parar() {
        try { rec.current?.stop?.(); } catch { /* ya parado */ }
        try { if (grabadora.current?.state === 'recording') grabadora.current.stop(); } catch { /* idem */ }
    }

    const cambiaUltimo = (cambio) => setChat(c => c.map((m, i) => (i === c.length - 1 ? { ...m, ...cambio } : m)));

    //: «Hecho» solo cuando ESTÁ hecho: si el cambio movió una zona, al acabar de
    //: volver a medir (20 s–1 min), y si no se ha podido medir, se dice.
    async function aplicar(msg, generar) {
        setAplicando(true); setFallo(null);
        cambiaUltimo({ estado: 'aplicando' });
        try {
            const r = (await onAplicar(msg.pasos, { generar })) || {};
            cambiaUltimo({ estado: 'hecho', generar: generar && r.medido !== false, pidioGenerar: generar,
                           sinMedir: r.medido === false });
            preguntaPrevia.current = null;
        } catch (e) {
            cambiaUltimo({ estado: 'propuesto' });
            setFallo(e.mensaje || e.message || 'No se ha podido aplicar.');
        } finally { setAplicando(false); }
    }

    async function preguntar() {
        const dicho = texto.trim();
        if (!dicho || pidiendo || aplicando) return;
        if (oyendo) parar();
        setPidiendo(true); setFallo(null);
        // Una propuesta que se quedó sin contestar, al decir otra cosa, se descarta.
        setChat(c => [...c.map(m => (m.estado === 'propuesto' ? { ...m, estado: 'no' } : m)),
                      { quien: 'yo', texto: dicho }]);
        setTexto('');
        try {
            const ctx = contexto();
            const resumen = resumenCompacto(ctx);
            // Si la vez anterior PREGUNTÓ, lo de ahora es la respuesta: va con lo
            // que se había pedido, o «el este» solo no dice a qué.
            const previa = preguntaPrevia.current;
            const conPregunta = previa
                ? `LO QUE PIDIÓ: «${previa.pedido}»
TU PREGUNTA: «${previa.pregunta}»
SU RESPUESTA: ${dicho}`
                : dicho;
            let data = await postEnvolvente(urlAsistente, { texto: conPregunta, resumen },
                                            { haciendo: 'preguntar al asistente', repetible: true });
            let v = validarOperaciones(data.operaciones, ctx);
            let coste = data.coste_usd || 0;
            // Nada de lo propuesto casa con el plano y no pregunta: UNA vuelta
            // más, con el modelo mayor y el motivo delante.
            if (!v.pasos.length && v.errores.length && !data.pregunta) {
                data = await postEnvolvente(urlAsistente,
                    { texto: conPregunta, resumen, reintento: v.errores.join(' ') },
                    { haciendo: 'preguntar al asistente', repetible: true });
                v = validarOperaciones(data.operaciones, ctx);
                coste += data.coste_usd || 0;
            }
            const pedido = previa ? `${previa.pedido} — ${dicho}` : dicho;
            preguntaPrevia.current = data.pregunta && !v.pasos.length
                ? { pedido, pregunta: data.pregunta } : null;
            const avisos = v.pasos.length ? [...v.avisos, ...paredesAmbiguas(dicho, ctx.muros)] : [];
            const seguro = data.seguro !== false;
            const claro = v.pasos.length > 0 && !v.errores.length && !avisos.length && seguro && !data.pregunta;
            const generar = puedeGenerar && pideGenerar(pedido);
            const ahora = claro && directo && !ocupado;
            const msg = {
                quien: 'ia', entendido: data.entendido, pasos: v.pasos, errores: v.errores, avisos,
                seguro, pregunta: data.pregunta, coste, modelo: data.modelo,
                estado: v.pasos.length ? 'propuesto' : 'respuesta',
                nota: generar && !ahora && v.pasos.length ? 'Has pedido generar: dale a «Sí, y generar el CEE».' : null,
            };
            setChat(c => [...c, msg]);
            if (ahora) await aplicar(msg, generar);
        } catch (e) {
            setFallo(e.mensaje || e.message || 'No se ha podido preguntar al asistente.');
        } finally {
            setPidiendo(false);
        }
    }

    async function deshacer() {
        if (!onDeshacer) return;
        setAplicando(true); setFallo(null);
        try {
            await onDeshacer();
            cambiaUltimo({ estado: 'deshecho' });
        } catch (e) {
            setFallo(e.mensaje || e.message || 'No se ha podido deshacer.');
        } finally { setAplicando(false); }
    }

    const ocupadoTodo = pidiendo || aplicando || ocupado;
    const ultimo = chat[chat.length - 1];
    //: Lo que está haciendo la ventana, dicho: medir y escribir el .cex tardan.
    const haciendo = transcribiendo ? 'Pasando la voz a texto…' : pidiendo ? 'Mirando el plano…'
        : trabajando || (aplicando ? 'Aplicando en el plano…' : null);

    // Con un popup de la ventana delante (escribiendo el .cex, «CEE generado»,
    // las preguntas antes de generar) el asistente se aparta: está por encima y
    // los taparía, en el móvil enteros. Vuelve solo al cerrarlos.
    if (oculto) return null;

    const boton = (
        <button type="button" onClick={() => setAbierto(a => !a)}
                aria-label={abierto ? 'Cerrar el asistente' : 'Abrir el asistente'}
                className={`fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-[9300] flex items-center
                            gap-2 rounded-full bg-brand px-4 py-3 text-[13px] font-black text-black shadow-2xl
                            transition active:scale-95 ${abierto ? 'max-md:hidden' : 'hover:scale-105'}`}>
            <Chispa className="h-[18px] w-[18px]" />
            <span>{abierto ? 'Cerrar' : 'Asistente'}</span>
            {!abierto && haciendo && (
                <span className="absolute right-0 top-0 h-3 w-3 animate-pulse rounded-full border-2 border-bkg-deep bg-emerald-400" />
            )}
        </button>
    );

    const panel = abierto && (
        <div role="dialog" aria-label="Asistente de la envolvente"
             className="fixed inset-0 z-[9400] flex flex-col overflow-hidden border border-white/10 bg-bkg-surface
                        shadow-2xl md:inset-auto md:bottom-24 md:right-5 md:h-[min(620px,calc(100vh-8rem))]
                        md:w-[420px] md:rounded-2xl">
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-brand">
                    <Chispa />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-black text-white/90">Asistente</p>
                    <p className="truncate text-[11px] text-white/40">
                        {haciendo || 'Corrige el plano con tus palabras, o por voz'}
                    </p>
                </div>
                {chat.length > 0 && (
                    <button type="button" onClick={() => { setChat([]); preguntaPrevia.current = null; setFallo(null); }}
                            className="text-[10.5px] font-bold uppercase tracking-wider text-white/40 hover:text-white/75">
                        Nueva
                    </button>
                )}
                <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar"
                        className="px-1 text-[18px] leading-none text-white/45 hover:text-white">×</button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
                {!chat.length && (
                    <div>
                        <p className="text-[14px] font-black text-white/85">¿Qué está mal?</p>
                        <p className="mt-1 text-[12px] leading-snug text-white/50">
                            Dímelo como se lo dirías a alguien en la obra. Lo que esté claro lo hago y te
                            dejo «Deshacer»; si dudo, te pregunto. Para volver a escribir el .cex, dime
                            «…y genera el CEE».
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {ejemplosPara(contexto()).map(f => (
                                <button key={f} type="button"
                                        onClick={() => { setTexto(f); caja.current?.focus(); }}
                                        className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-left
                                                   text-[11.5px] leading-snug text-white/60 hover:border-brand/40 hover:text-white/85">
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {chat.map((m, i) => (m.quien === 'yo' ? (
                    <div key={i} className="ml-8 rounded-xl rounded-br-sm bg-brand/15 px-3 py-2 text-[12.5px]
                                            leading-snug text-white/90">
                        {m.texto}
                    </div>
                ) : (
                    <Respuesta key={i} m={m} ultima={m === ultimo} ocupado={ocupadoTodo}
                               puedeGenerar={puedeGenerar}
                               onSi={(generar) => aplicar(m, generar)}
                               onNo={() => { cambiaUltimo({ estado: 'no' }); preguntaPrevia.current = null; }}
                               onDeshacer={onDeshacer ? deshacer : null} />
                )))}
                {haciendo && (
                    <p className="flex items-center gap-2 text-[12px] text-white/55" role="status">
                        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                        {haciendo}
                    </p>
                )}
                {fallo && <p className="text-[11.5px] leading-snug text-amber-300/90">{fallo}</p>}
                <div ref={fin} />
            </div>

            <div className="border-t border-white/[0.07] px-3 pb-3 pt-2">
                <label className="mb-1.5 flex cursor-pointer items-center gap-2 text-[10.5px] text-white/45">
                    <input type="checkbox" checked={directo} onChange={e => cambiarDirecto(e.target.checked)}
                           className="h-3 w-3 accent-[var(--brand)]" />
                    Hacerlo directamente si está claro (si no, te pido el «Sí»)
                </label>
                <div className="flex items-end gap-2">
                    {/* `case-sensitive`: index.css pone TODO textarea en mayúsculas. */}
                    <textarea ref={caja} value={texto} onChange={e => setTexto(e.target.value)} rows={2}
                              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(); } }}
                              placeholder={preguntaPrevia.current ? 'Tu respuesta…'
                                  : '«La V3 va en la FBE3 y es de PVC»'}
                              disabled={aplicando}
                              className="case-sensitive min-h-[44px] flex-1 resize-none rounded-xl border border-white/10
                                         bg-black/20 px-3 py-2 text-[12.5px] leading-snug text-white
                                         placeholder:text-white/30 focus:border-brand/50 focus:outline-none" />
                    {(Reconocedor || puedeGrabar) && (
                        <button type="button" onClick={dictar} disabled={pidiendo || aplicando}
                                title={oyendo ? 'Parar' : 'Hablar'}
                                aria-label={oyendo ? 'Parar el micrófono' : 'Hablar'}
                                className={`flex h-10 w-10 items-center justify-center rounded-xl border text-[15px]
                                            ${oyendo ? 'animate-pulse border-red-400/60 bg-red-500/20 text-red-200'
                                                     : 'border-white/10 bg-white/[0.04] text-white/70 hover:text-white'}`}>
                            {oyendo ? '■' : <Microfono />}
                        </button>
                    )}
                    <button type="button" onClick={preguntar} disabled={!texto.trim() || ocupadoTodo}
                            aria-label="Enviar"
                            className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-[16px]
                                       font-black text-black disabled:opacity-40">
                        {pidiendo ? '…' : '→'}
                    </button>
                </div>
                {oyendo === 'grabando' && (
                    <p className="mt-1.5 text-[10.5px] text-white/45">Grabando… pulsa ■ al terminar.</p>
                )}
            </div>
        </div>
    );

    if (typeof document === 'undefined') return null;
    return createPortal(<>{boton}{panel}</>, document.body);
}

/** Lo que contestó el asistente: qué ha entendido, los cambios y en qué han quedado. */
function Respuesta({ m, ultima, ocupado, puedeGenerar, onSi, onNo, onDeshacer }) {
    const hecho = m.estado === 'hecho';
    return (
        <div className="mr-4 space-y-1.5 rounded-xl rounded-bl-sm border border-white/[0.07] bg-white/[0.03] px-3 py-2">
            {m.entendido && <p className="text-[12px] leading-snug text-white/65">{m.entendido}</p>}
            {m.pasos.length > 0 && (
                <ul className="space-y-1">
                    {m.pasos.map((p, i) => (
                        <li key={i} className={`rounded-md px-2 py-1.5 text-[12px] leading-snug ${
                            m.estado === 'no' || m.estado === 'deshecho'
                                ? 'bg-black/10 text-white/40 line-through' : 'bg-black/20 text-white/85'}`}>
                            {hecho && !m.sinMedir ? '✓ ' : ''}{p.texto}
                        </li>
                    ))}
                </ul>
            )}
            {[...m.errores, ...m.avisos].map((e, i) => (
                <p key={i} className="text-[11.5px] leading-snug text-amber-300/90">⚠ {e}</p>
            ))}
            {!m.seguro && m.pasos.length > 0 && m.estado === 'propuesto' && (
                <p className="text-[11.5px] leading-snug text-amber-300/90">
                    ⚠ Ha tenido que suponer algo: míralo bien antes de aplicarlo.
                </p>
            )}
            {m.pregunta && (
                <p className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2 py-1.5
                              text-[12px] leading-snug text-amber-100/90">
                    {m.pregunta}
                </p>
            )}
            {m.nota && m.estado === 'propuesto' && <p className="text-[11px] text-white/45">{m.nota}</p>}

            {m.estado === 'propuesto' && ultima && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button type="button" onClick={() => onSi(false)} disabled={ocupado}
                            className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-black text-black disabled:opacity-40">
                        Sí, aplicar
                    </button>
                    {puedeGenerar && (
                        <button type="button" onClick={() => onSi(true)} disabled={ocupado}
                                className="rounded-lg border border-brand/40 px-3 py-1.5 text-[12px] font-bold
                                           text-brand disabled:opacity-40">
                            Sí, y generar el CEE
                        </button>
                    )}
                    <button type="button" onClick={onNo} disabled={ocupado}
                            className="px-1 text-[12px] text-white/45 underline decoration-dotted hover:text-white/70">
                        No
                    </button>
                </div>
            )}
            {hecho && m.sinMedir && (
                <p className="text-[11.5px] leading-snug text-amber-300/90">
                    ⚠ No se ha podido volver a medir el edificio con la zona nueva: el plano sigue con las de
                    antes{m.pidioGenerar ? ' y el .cex no se ha escrito' : ''}. El motivo sale
                    arriba, en la ventana; dale a «Deshacer» o vuelve a pedirlo.
                </p>
            )}
            {hecho && (
                <p className="flex flex-wrap items-center gap-2 text-[11.5px] text-emerald-300/90">
                    {!m.sinMedir && <span>Hecho{m.generar ? '; el .cex se vuelve a escribir' : ''}.</span>}
                    {ultima && onDeshacer && (
                        <button type="button" onClick={onDeshacer} disabled={ocupado}
                                className="rounded-md border border-white/15 px-2 py-0.5 font-bold text-white/70
                                           hover:border-white/35 hover:text-white disabled:opacity-40">
                            Deshacer
                        </button>
                    )}
                </p>
            )}
            {m.estado === 'deshecho' && (
                <p className="text-[11.5px] text-white/45">
                    Deshecho: el plano está como antes.{m.generar ? ' El .cex ya se había escrito: vuelve a generarlo.' : ''}
                </p>
            )}
            {m.estado === 'no' && m.pasos.length > 0 && <p className="text-[11px] text-white/35">No se ha aplicado.</p>}
            <p className="text-[10px] text-white/25">{nombreModelo(m.modelo)} · ≈ {usd(m.coste)}</p>
        </div>
    );
}

export default AsistenteEnvolvente;
