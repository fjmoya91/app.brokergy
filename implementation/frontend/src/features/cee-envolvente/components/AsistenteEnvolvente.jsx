// ─────────────────────────────────────────────────────────────────────────────
// El ASISTENTE de la envolvente: se DICE lo que está mal y se corrige solo.
//
// «La V3 no va en la FBE1 sino en la FBE3, y es de PVC», «el garaje llega hasta
// el final de la vivienda», «quita la aerotermia». Se escribe o se habla (el
// micrófono dicta en el propio navegador; donde no sabe, graba y lo transcribe
// el servidor), Claude devuelve operaciones y aquí se ENSEÑA lo que va a cambiar
// en palabras antes de tocar nada. Con «Sí» se aplica con las mismas funciones
// que los botones; con «Sí y generar», además, se vuelve a escribir el `.cex`.
//
// Lo que no casa con el plano NO se aplica: se dice en ámbar. Si el modelo
// pregunta, la respuesta se escribe en la misma caja.
//
// Va arriba de la columna de la pared (dentro de su caja fija): es lo primero
// que se ve, y «esta pared» es la que está abierta debajo.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { postEnvolvente } from '../logic/pedirEnvolvente';
import { ejemplosPara, paredesAmbiguas, resumenCompacto, validarOperaciones } from '../logic/asistenteEnvolvente';
import axios from 'axios';

const Reconocedor = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition || null) : null;
const puedeGrabar = typeof window !== 'undefined' && !!window.MediaRecorder
    && !!navigator.mediaDevices?.getUserMedia;

//: El micrófono, dibujado (un emoji sale distinto en cada sistema).
const Microfono = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
);

const usd = (n) => (Number.isFinite(n) ? `${n < 0.01 ? n.toFixed(4) : n.toFixed(3)} $` : '');

/**
 * `contexto()` da lo que hace falta para el resumen y para validar, en el momento
 * de preguntar (no al pintar): plantas, muros, zonas, t, catalogo, elegidas,
 * fase, defecto, sel. `onAplicar(pasos, { generar })` lo aplica la ventana.
 */
export function AsistenteEnvolvente({ urlAsistente, urlVoz, contexto, onAplicar,
                                      puedeGenerar = true, ocupado = false }) {
    const [texto, setTexto] = useState('');
    const [oyendo, setOyendo] = useState(null);       // 'dictado' | 'grabando' | null
    const [pidiendo, setPidiendo] = useState(false);
    const [resultado, setResultado] = useState(null); // { entendido, pasos, errores, pregunta, coste, modelo }
    const [fallo, setFallo] = useState(null);
    const [aplicando, setAplicando] = useState(false);
    const [hecho, setHecho] = useState(null);
    const rec = useRef(null);
    const grabadora = useRef(null);
    //: Si el asistente PREGUNTÓ: lo que se le había pedido y su pregunta. Lo que
    //: se escriba después es la respuesta y viaja con las dos delante.
    const preguntaPrevia = useRef(null);   // { pedido, pregunta }
    const caja = useRef(null);

    // Al desmontar, que no se quede el micrófono abierto.
    useEffect(() => () => {
        try { rec.current?.abort?.(); } catch { /* ya parado */ }
        try { grabadora.current?.stream?.getTracks?.().forEach(t => t.stop()); } catch { /* idem */ }
    }, []);

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
                setPidiendo(true);
                try {
                    const fd = new FormData();
                    fd.append('audio', blob, 'voz.webm');
                    const { data } = await axios.post(urlVoz, fd);
                    setTexto(t => (t ? `${t.trim()} ` : '') + (data.texto || ''));
                } catch (e) {
                    setFallo(e.response?.data?.error || 'No se ha podido transcribir el audio: escríbelo.');
                } finally { setPidiendo(false); }
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

    async function preguntar() {
        const dicho = texto.trim();
        if (!dicho || pidiendo) return;
        if (oyendo) parar();
        setPidiendo(true); setFallo(null); setResultado(null); setHecho(null);
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
            preguntaPrevia.current = data.pregunta && !v.pasos.length
                ? { pedido: previa ? `${previa.pedido} — ${dicho}` : dicho, pregunta: data.pregunta } : null;
            setResultado({ entendido: data.entendido, pasos: v.pasos, errores: v.errores,
                           avisos: v.pasos.length ? [...v.avisos, ...paredesAmbiguas(dicho, ctx.muros)] : [],
                           seguro: data.seguro !== false,
                           pregunta: data.pregunta, coste, modelo: data.modelo });
            if (preguntaPrevia.current) setTexto('');
        } catch (e) {
            setFallo(e.mensaje || e.message || 'No se ha podido preguntar al asistente.');
        } finally {
            setPidiendo(false);
        }
    }

    async function aplicar(generar) {
        if (!resultado?.pasos?.length) return;
        setAplicando(true);
        try {
            await onAplicar(resultado.pasos, { generar });
            setHecho(`${resultado.pasos.length === 1 ? 'Hecho' : `Hechos los ${resultado.pasos.length} cambios`}`
                + `${generar ? '; el .cex se vuelve a escribir' : ''}. Se deshace con Ctrl+Z.`);
            setResultado(null); setTexto(''); preguntaPrevia.current = null;
        } catch (e) {
            setFallo(e.mensaje || e.message || 'No se ha podido aplicar.');
        } finally { setAplicando(false); }
    }

    const ocupadoTodo = pidiendo || aplicando || ocupado;

    return (
        <div className="rounded-xl border border-brand/25 bg-brand/[0.05] p-3">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-brand/90">
                    Asistente
                </p>
                <span className="text-[10.5px] text-white/35">dímelo con tus palabras</span>
            </div>

            <div className="mt-2 flex items-end gap-2">
                {/* `case-sensitive`: index.css pone TODO textarea en mayúsculas. */}
                <textarea ref={caja} value={texto} onChange={e => setTexto(e.target.value)} rows={2}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(); } }}
                          placeholder={preguntaPrevia.current ? 'Tu respuesta…'
                              : '«La V3 va en la FBE3 y es de PVC» · «el garaje llega hasta el fondo»'}
                          disabled={aplicando}
                          className="case-sensitive min-h-[52px] flex-1 resize-none rounded-lg border border-white/10
                                     bg-black/20 px-2.5 py-2 text-[12.5px] leading-snug text-white
                                     placeholder:text-white/30 focus:border-brand/50 focus:outline-none" />
                <div className="flex flex-col gap-1.5">
                    {(Reconocedor || puedeGrabar) && (
                        <button type="button" onClick={dictar} disabled={pidiendo || aplicando}
                                title={oyendo ? 'Parar' : 'Hablar'}
                                aria-label={oyendo ? 'Parar el micrófono' : 'Hablar'}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg border text-[15px]
                                            ${oyendo ? 'animate-pulse border-red-400/60 bg-red-500/20 text-red-200'
                                                     : 'border-white/10 bg-white/[0.04] text-white/70 hover:text-white'}`}>
                            {oyendo ? '■' : <Microfono />}
                        </button>
                    )}
                    <button type="button" onClick={preguntar} disabled={!texto.trim() || ocupadoTodo}
                            className="h-8 rounded-lg bg-brand px-2.5 text-[11.5px] font-black text-black
                                       disabled:opacity-40">
                        {pidiendo ? '…' : 'Ver'}
                    </button>
                </div>
            </div>
            {/* EJEMPLOS con los nombres de este plano: quien no sabe qué decirle
                pulsa uno, lo retoca y le da a «Ver». Solo con la caja vacía. */}
            {!texto && !resultado && !pidiendo && !preguntaPrevia.current && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {ejemplosPara(contexto()).map(f => (
                        <button key={f} type="button"
                                onClick={() => { setTexto(f); setHecho(null); caja.current?.focus(); }}
                                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-left
                                           text-[11px] leading-snug text-white/55 hover:border-brand/40 hover:text-white/85">
                            {f}
                        </button>
                    ))}
                </div>
            )}
            {oyendo === 'grabando' && (
                <p className="mt-1.5 text-[10.5px] text-white/45">Grabando… pulsa ■ al terminar.</p>
            )}

            {fallo && <p className="mt-2 text-[11.5px] leading-snug text-amber-300/90">{fallo}</p>}
            {hecho && <p className="mt-2 text-[11.5px] leading-snug text-emerald-300/90">✓ {hecho}</p>}

            {resultado && (
                <div className="mt-2.5 space-y-2">
                    {resultado.entendido && (
                        <p className="text-[11.5px] leading-snug text-white/55">{resultado.entendido}</p>
                    )}
                    {resultado.pasos.length > 0 && (
                        <ul className="space-y-1">
                            {resultado.pasos.map((p, i) => (
                                <li key={i} className="rounded-md bg-black/20 px-2 py-1.5 text-[12px] leading-snug text-white/85">
                                    {p.texto}
                                </li>
                            ))}
                        </ul>
                    )}
                    {[...resultado.errores, ...resultado.avisos].map((e, i) => (
                        <p key={i} className="text-[11.5px] leading-snug text-amber-300/90">⚠ {e}</p>
                    ))}
                    {!resultado.seguro && resultado.pasos.length > 0 && (
                        <p className="text-[11.5px] leading-snug text-amber-300/90">
                            ⚠ Ha tenido que suponer algo: míralo bien antes de aplicarlo.
                        </p>
                    )}
                    {resultado.pregunta && (
                        <p className="rounded-md border border-amber-400/25 bg-amber-400/[0.06] px-2 py-1.5
                                      text-[12px] leading-snug text-amber-100/90">
                            {resultado.pregunta}
                        </p>
                    )}
                    {resultado.pasos.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            <button type="button" onClick={() => aplicar(false)} disabled={ocupadoTodo}
                                    className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-black text-black disabled:opacity-40">
                                Sí, aplicar
                            </button>
                            {puedeGenerar && (
                                <button type="button" onClick={() => aplicar(true)} disabled={ocupadoTodo}
                                        className="rounded-lg border border-brand/40 px-3 py-1.5 text-[12px] font-bold
                                                   text-brand disabled:opacity-40">
                                    Sí, y generar el CEE
                                </button>
                            )}
                            <button type="button" onClick={() => { setResultado(null); preguntaPrevia.current = null; }}
                                    disabled={aplicando}
                                    className="px-1 text-[12px] text-white/45 underline decoration-dotted hover:text-white/70">
                                No
                            </button>
                        </div>
                    )}
                    <p className="text-[10px] text-white/25">
                        {resultado.modelo?.replace('claude-', '').replace(/-(\d)-(\d)$/, ' $1.$2')} · ≈ {usd(resultado.coste)}
                    </p>
                </div>
            )}
        </div>
    );
}

export default AsistenteEnvolvente;
