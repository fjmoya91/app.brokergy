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
//
// Desde el 30/10/2026 (Fran, 2026EXT_3: «si al generar da error, pedirle al
// asistente que lo vuelva a generar y me lo deje listo para firmar»):
//   · Si el `.cex` NO sale, el motivo llega aquí solo (`incidencia`, de la
//     ventana): una fachada sin rumbo es una pregunta con sus DOS botones (cuál
//     es lo dice la persona, no la app ni Claude); lo demás que bloquea, con su
//     «Ir»; y si el plano no lo explica, se le pregunta a Claude, que propone y,
//     si está claro, se aplica y se vuelve a probar (dos veces como mucho).
//   · «Déjalo listo para firmar» / «dale el visto bueno» (solo el equipo, en una
//     obra de la app: `puedeListo`) = generar si hace falta + el visto bueno de
//     BROKERGY, y su resultado se dice aquí.
//   · Una ORDEN sola («genéralo», «déjalo listo») no pasa por Claude: no hay
//     nada que entender. Antes «genera el CEE» a secas se quedaba en nada.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { postEnvolvente } from '../logic/pedirEnvolvente';
import { ejemplosPara, paredesAmbiguas, pideGenerar, pideListo, resumenCompacto, soloOrden,
         validarOperaciones } from '../logic/asistenteEnvolvente';
import { MAX_REINTENTOS_SOLOS, operacionesDeRumbos, textoDelFallo } from '../logic/arreglarGenerar';
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
const NOMBRE_RUMBO = { N: 'Norte', NE: 'Noreste', E: 'Este', SE: 'Sureste',
                       S: 'Sur', SO: 'Suroeste', O: 'Oeste', NO: 'Noroeste' };
//: Una propuesta o un arreglo que se quedó sin contestar, al decir otra cosa, se descarta.
const descartar = (c) => c.map(m => (m.estado === 'propuesto' || m.estado === 'esperando' ? { ...m, estado: 'no' } : m));
//: Lo que se ha pedido además de corregir: volver a escribir el .cex o dejarlo listo para firmar.
const TEXTO_SI = { generar: 'Sí, y generar el CEE', listo: 'Sí, y dejarlo listo para firmar' };

/**
 * `contexto()` da lo que hace falta para el resumen y para validar, en el momento
 * de preguntar (no al pintar): plantas, muros, zonas, t, catalogo, elegidas,
 * fase, defecto, sel. `onAplicar(pasos, { generar, listo, fase })` lo aplica la
 * ventana y resuelve al ACABAR (`{ medido, listo }`: medido false si no se pudo
 * volver a medir; listo, lo que dijo el visto bueno), y `onDeshacer()` vuelve a
 * como estaba antes del último aplicado. `trabajando` es lo que la ventana está
 * haciendo («Volviendo a medir…»), y con `oculto` (un popup suyo delante) el
 * asistente se aparta. `incidencia`: el `.cex` no ha salido (ver cabecera);
 * `onIr(item)` lleva a lo que hay que arreglar.
 */
export function AsistenteEnvolvente({ urlAsistente, urlVoz, contexto, onAplicar, onDeshacer = null,
                                      puedeGenerar = true, puedeListo = false, ocupado = false,
                                      trabajando = null, oculto = false, incidencia = null, onIr = null }) {
    const [abierto, setAbierto] = useState(false);
    const [directo, setDirecto] = useState(leerDirecto);
    const [texto, setTexto] = useState('');
    const [oyendo, setOyendo] = useState(null);       // 'dictado' | 'grabando' | null
    const [pidiendo, setPidiendo] = useState(false);
    const [aplicando, setAplicando] = useState(false);
    const [transcribiendo, setTranscribiendo] = useState(false);
    const [fallo, setFallo] = useState(null);
    //: La conversación, solo para enseñarla: a Claude no viaja (ver cabecera).
    //: { id, quien: 'yo', texto } | { id, quien: 'ia', entendido, pasos, errores,
    //:   avisos, seguro, pregunta, coste, modelo, estado, objetivo, nota, resultado }
    //: | { id, quien: 'ia', tipo: 'incidencia', error, preguntas, otros, respuestas, … }
    //: estado: 'propuesto' · 'esperando' · 'aplicando' · 'hecho' · 'no' · 'deshecho' · 'respuesta'
    const [chat, setChat] = useState([]);
    //: Cada mensaje por su id: el resultado de un aplicado llega cuando ya puede
    //: haber otro detrás (el fallo del generar que ha provocado).
    const nId = useRef(0);
    const nuevoId = () => { nId.current += 1; return nId.current; };
    const rec = useRef(null);
    const grabadora = useRef(null);
    //: Si el asistente PREGUNTÓ: lo que se le había pedido, su pregunta y lo que
    //: se quería hacer después. Lo que se escriba después es la respuesta y
    //: viaja con las dos delante.
    const preguntaPrevia = useRef(null);   // { pedido, pregunta, objetivo }
    //: El motivo de un fallo que hay que preguntarle a Claude, a la espera de que
    //: acabe lo que se esté haciendo (el fallo llega a mitad de un aplicado).
    const [porPreguntar, setPorPreguntar] = useState(null);   // { texto, objetivo }
    const incidenciaVista = useRef(null);
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

    // El `.cex` no ha salido: se abre y dice qué hay que arreglar. Lo que el
    // plano ya sabe (rumbos, lo que bloquea) va en botones, sin Claude; si no
    // lo explica, se le pregunta a Claude con el motivo del motor.
    useEffect(() => {
        if (!incidencia?.id || incidenciaVista.current === incidencia.id) return;
        incidenciaVista.current = incidencia.id;
        const preguntas = incidencia.preguntas || [];
        const otros = incidencia.otros || [];
        const nada = !preguntas.length && !otros.length;
        const agotado = nada && (incidencia.intento || 0) >= MAX_REINTENTOS_SOLOS;
        setAbierto(true);
        setFallo(null);
        preguntaPrevia.current = null;
        setChat(c => [...descartar(c), {
            id: nuevoId(), quien: 'ia', tipo: 'incidencia', error: incidencia.error, preguntas, otros,
            objetivo: incidencia.objetivo, fase: incidencia.fase, respuestas: {}, agotado,
            pasos: [], errores: [], avisos: [], seguro: true, estado: nada ? 'respuesta' : 'esperando',
        }]);
        if (nada && !agotado) setPorPreguntar({ texto: textoDelFallo(incidencia.error), objetivo: incidencia.objetivo });
    }, [incidencia?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

    // Lo que hay que preguntarle a Claude por un fallo, en cuanto la ventana acaba.
    useEffect(() => {
        if (!porPreguntar || pidiendo || aplicando || ocupado) return;
        const p = porPreguntar;
        setPorPreguntar(null);
        preguntar(p.texto, { objetivo: p.objetivo });
    }, [porPreguntar, pidiendo, aplicando, ocupado]);   // eslint-disable-line react-hooks/exhaustive-deps

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

    const cambia = (id, cambio) => setChat(c => c.map(m => (m.id === id ? { ...m, ...cambio } : m)));

    //: «Hecho» solo cuando ESTÁ hecho: si el cambio movió una zona, al acabar de
    //: volver a medir (20 s–1 min), y si no se ha podido medir, se dice; con el
    //: visto bueno, cuando lo ha dado o ha dicho por qué no.
    //: `objetivo`: null (solo aplicar) · 'generar' · 'listo'.
    async function aplicar(msg, objetivo = null) {
        setAplicando(true); setFallo(null);
        const antes = msg.estado;
        cambia(msg.id, { estado: 'aplicando' });
        try {
            const r = (await onAplicar(msg.pasos, { generar: objetivo === 'generar', listo: objetivo === 'listo',
                                                    fase: msg.fase || null })) || {};
            cambia(msg.id, { estado: 'hecho', generar: objetivo === 'generar' && r.medido !== false,
                             pidioGenerar: !!objetivo, listo: objetivo === 'listo', resultado: r.listo || null,
                             sinMedir: r.medido === false });
            preguntaPrevia.current = null;
        } catch (e) {
            cambia(msg.id, { estado: antes });
            setFallo(e.mensaje || e.message || 'No se ha podido aplicar.');
        } finally { setAplicando(false); }
    }

    //: Una ORDEN sin nada que cambiar en el plano: generar o dejarlo listo.
    async function ordenar(objetivo, msg = null) {
        const m = msg || {
            id: nuevoId(), quien: 'ia', pasos: [], errores: [], avisos: [], seguro: true, objetivo,
            estado: 'respuesta',
            entendido: objetivo === 'listo'
                ? 'Lo genero si hace falta y le doy el visto bueno: queda listo para firmar.'
                : 'Vuelvo a escribir el .cex con lo que hay en el plano.',
        };
        if (!msg) setChat(c => [...c, m]);
        await aplicar(m, objetivo);
    }

    //: `dado`: un texto que no ha escrito la persona (el motivo de un fallo del
    //: generar), con lo que se estaba haciendo (`objetivo`).
    async function preguntar(dado = null, { objetivo: objetivoDado = null } = {}) {
        const dicho = String(dado ?? texto).trim();
        if (!dicho || pidiendo || aplicando) return;
        if (oyendo) parar();
        setFallo(null);
        const objetivoDe = (t) => (puedeListo && pideListo(t) ? 'listo' : puedeGenerar && pideGenerar(t) ? 'generar' : null);
        // Solo la orden («dale el visto bueno»), sin nada que corregir: no es la
        // respuesta a nada ni hay que preguntarle a Claude.
        const orden = !dado && objetivoDe(dicho) && soloOrden(dicho) ? objetivoDe(dicho) : null;
        // Si la vez anterior PREGUNTÓ, lo de ahora es la respuesta: va con lo
        // que se había pedido, o «el este» solo no dice a qué.
        const previa = dado || orden ? null : preguntaPrevia.current;
        const pedido = previa ? `${previa.pedido} — ${dicho}` : dicho;
        const objetivo = objetivoDado || orden || previa?.objetivo || objetivoDe(pedido);
        setChat(c => [...descartar(c), ...(dado ? [] : [{ id: nuevoId(), quien: 'yo', texto: dicho }])]);
        if (!dado) setTexto('');
        if (orden) {
            if (ocupado) { setFallo('Espera a que acabe lo que se está haciendo y vuelve a pedírmelo.'); return; }
            preguntaPrevia.current = null;
            await ordenar(orden);
            return;
        }
        setPidiendo(true);
        try {
            const ctx = contexto();
            const resumen = resumenCompacto(ctx);
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
                ? { pedido, pregunta: data.pregunta, objetivo } : null;
            const avisos = v.pasos.length ? [...v.avisos, ...paredesAmbiguas(dicho, ctx.muros)] : [];
            const seguro = data.seguro !== false;
            const claro = v.pasos.length > 0 && !v.errores.length && !avisos.length && seguro && !data.pregunta;
            const ahora = claro && directo && !ocupado;
            const msg = {
                id: nuevoId(), quien: 'ia', entendido: data.entendido, pasos: v.pasos, errores: v.errores, avisos,
                seguro, pregunta: data.pregunta, coste, modelo: data.modelo, objetivo,
                estado: v.pasos.length ? 'propuesto' : 'respuesta',
                nota: objetivo && !ahora && v.pasos.length ? `Has pedido ${objetivo === 'listo'
                    ? 'dejarlo listo para firmar' : 'generar'}: dale a «${TEXTO_SI[objetivo]}».` : null,
            };
            setChat(c => [...c, msg]);
            if (ahora) await aplicar(msg, objetivo);
            // Nada que cambiar en el plano pero sí una orden («y genéralo»): se
            // hace igual. No tras un fallo del generar: repetirlo sin cambiar
            // nada daría el mismo «no».
            else if (!dado && objetivo && !v.pasos.length && !v.errores.length && !data.pregunta && !ocupado) {
                await ordenar(objetivo, msg);
            }
        } catch (e) {
            setFallo(e.mensaje || e.message || 'No se ha podido preguntar al asistente.');
        } finally {
            setPidiendo(false);
        }
    }

    //: Las preguntas de un fallo: cada rumbo, con un clic (otro clic lo quita).
    function elegirRumbo(msg, clave, rumbo) {
        const r = { ...msg.respuestas };
        if (r[clave] === rumbo) delete r[clave]; else r[clave] = rumbo;
        cambia(msg.id, { respuestas: r, errores: [] });
    }

    //: Con los rumbos contestados (y lo demás arreglado en su sitio): se aplican
    //: como las operaciones de siempre —un solo «Deshacer»— y se retoma lo que
    //: se estaba haciendo.
    async function seguirTrasFallo(msg, objetivo) {
        const v = validarOperaciones(operacionesDeRumbos(msg.preguntas, msg.respuestas), contexto());
        if (v.errores.length) { cambia(msg.id, { errores: v.errores }); return; }
        const conPasos = { ...msg, pasos: v.pasos };
        cambia(msg.id, { pasos: v.pasos });
        await aplicar(conPasos, objetivo);
    }

    function ir(item) {
        if (!onIr || !item) return;
        onIr(item);
        // En el móvil el asistente ocupa la pantalla: se aparta para que se vea.
        if (typeof window !== 'undefined' && window.innerWidth < 768) setAbierto(false);
    }

    async function deshacer(msg) {
        if (!onDeshacer) return;
        setAplicando(true); setFallo(null);
        try {
            await onDeshacer();
            cambia(msg.id, { estado: 'deshecho' });
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
                            «…y genera el CEE»{puedeListo ? <>; para dejarlo listo para firmar (con el visto
                            bueno de BROKERGY), «…y déjalo listo para firmar»</> : null}. Si al generar algo
                            falla, te digo aquí cómo arreglarlo.
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

                {chat.map(m => (m.quien === 'yo' ? (
                    <div key={m.id} className="ml-8 rounded-xl rounded-br-sm bg-brand/15 px-3 py-2 text-[12.5px]
                                               leading-snug text-white/90">
                        {m.texto}
                    </div>
                ) : m.tipo === 'incidencia' ? (
                    <FalloAlGenerar key={m.id} m={m} ultima={m === ultimo} ocupado={ocupadoTodo}
                                    onRumbo={(clave, r) => elegirRumbo(m, clave, r)}
                                    onSeguir={(objetivo) => seguirTrasFallo(m, objetivo)}
                                    onIr={onIr ? ir : null}
                                    onDeshacer={onDeshacer ? () => deshacer(m) : null} />
                ) : (
                    <Respuesta key={m.id} m={m} ultima={m === ultimo} ocupado={ocupadoTodo}
                               puedeGenerar={puedeGenerar} puedeListo={puedeListo}
                               onSi={(objetivo) => aplicar(m, objetivo)}
                               onNo={() => { cambia(m.id, { estado: 'no' }); preguntaPrevia.current = null; }}
                               onDeshacer={onDeshacer ? () => deshacer(m) : null} />
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
function Respuesta({ m, ultima, ocupado, puedeGenerar, puedeListo, onSi, onNo, onDeshacer }) {
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
                    <button type="button" onClick={() => onSi(null)} disabled={ocupado}
                            className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-black text-black disabled:opacity-40">
                        Sí, aplicar
                    </button>
                    {puedeGenerar && (
                        <button type="button" onClick={() => onSi('generar')} disabled={ocupado}
                                className="rounded-lg border border-brand/40 px-3 py-1.5 text-[12px] font-bold
                                           text-brand disabled:opacity-40">
                            {TEXTO_SI.generar}
                        </button>
                    )}
                    {puedeListo && (
                        <button type="button" onClick={() => onSi('listo')} disabled={ocupado}
                                className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-[12px] font-bold
                                           text-emerald-300 disabled:opacity-40">
                            {TEXTO_SI.listo}
                        </button>
                    )}
                    <button type="button" onClick={onNo} disabled={ocupado}
                            className="px-1 text-[12px] text-white/45 underline decoration-dotted hover:text-white/70">
                        No
                    </button>
                </div>
            )}
            <EnQueHaQuedado m={m} ultima={ultima} ocupado={ocupado} onDeshacer={onDeshacer} />
            {m.estado === 'no' && m.pasos.length > 0 && <p className="text-[11px] text-white/35">No se ha aplicado.</p>}
            {m.modelo && <p className="text-[10px] text-white/25">{nombreModelo(m.modelo)} · ≈ {usd(m.coste)}</p>}
        </div>
    );
}

/**
 * En qué ha quedado lo aplicado: hecho (y si se escribió el .cex o qué dijo el
 * visto bueno), sin poder medir, o deshecho. Lo comparten la respuesta y el fallo.
 */
function EnQueHaQuedado({ m, ultima, ocupado, onDeshacer }) {
    const hecho = m.estado === 'hecho';
    const r = m.resultado;
    const color = { ok: 'text-emerald-300/90', aviso: 'text-amber-300/90', error: 'text-red-300/90' };
    return (
        <>
            {m.estado === 'aplicando' && m.objetivo === 'listo' && (
                <p className="text-[11.5px] text-white/50">Generando el .cex y dando el visto bueno…</p>
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
                    {!m.sinMedir && !(m.listo && r) && (
                        <span>Hecho{m.generar ? '; el .cex se vuelve a escribir' : ''}.</span>
                    )}
                    {ultima && onDeshacer && m.pasos.length > 0 && (
                        <button type="button" onClick={onDeshacer} disabled={ocupado}
                                className="rounded-md border border-white/15 px-2 py-0.5 font-bold text-white/70
                                           hover:border-white/35 hover:text-white disabled:opacity-40">
                            Deshacer
                        </button>
                    )}
                </p>
            )}
            {hecho && m.listo && r && (
                <p className={`text-[12px] font-semibold leading-snug ${color[r.tono] || color.aviso}`}>
                    {r.tono === 'ok' ? '✓ ' : '⚠ '}{r.texto}
                    {r.noGenerado ? ' Te digo abajo qué hay que arreglar.' : ''}
                </p>
            )}
            {m.estado === 'deshecho' && (
                <p className="text-[11.5px] text-white/45">
                    Deshecho: el plano está como antes.{m.generar || m.listo ? ' El .cex ya se había escrito: vuelve a generarlo.' : ''}
                </p>
            )}
        </>
    );
}

/**
 * El `.cex` NO ha salido: el motivo y cómo se arregla, sin preguntarle a Claude
 * lo que el plano ya sabe. Cada fachada sin rumbo, con sus DOS lados (cuál es
 * lo dice la persona, que tiene el plano y la brújula delante); lo demás que lo
 * para, con su «Ir». Con todo contestado, un botón aplica los rumbos y retoma
 * lo que se estaba haciendo: generar o dejarlo listo para firmar.
 */
function FalloAlGenerar({ m, ultima, ocupado, onRumbo, onSeguir, onIr, onDeshacer }) {
    const vivo = ultima && m.estado === 'esperando';
    const faltan = m.preguntas.filter(p => !m.respuestas[p.clave]).length;
    const seguir = m.objetivo === 'listo'
        ? (m.preguntas.length ? 'Sí: aplicar y dejarlo listo para firmar' : 'Ya está: dejarlo listo para firmar')
        : (m.preguntas.length ? 'Sí: aplicar y volver a generar' : 'Ya está: volver a generar');
    return (
        <div className="mr-4 space-y-2 rounded-xl rounded-bl-sm border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2">
            <p className="text-[12.5px] font-black text-amber-200/90">
                No se ha podido {m.objetivo === 'listo' ? 'generar el .cex para el visto bueno' : 'generar el .cex'}
            </p>
            <p className="text-[11.5px] leading-snug text-white/55">{m.error}</p>

            {m.preguntas.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[11.5px] leading-snug text-white/70">
                        {m.preguntas.length === 1 ? 'Esta fachada no tiene rumbo' : `Estas ${m.preguntas.length} fachadas no tienen rumbo`}:
                        dime hacia dónde da {m.preguntas.length === 1 ? '' : 'cada una'} (el plano no lo puede saber:
                        sale de una partición o de una pared dibujada).
                    </p>
                    {m.preguntas.map(p => (
                        <div key={p.clave} className="flex flex-wrap items-center gap-1.5 rounded-md bg-black/20 px-2 py-1.5">
                            <span className="min-w-[4.5rem] text-[12px] font-black text-white/85">{p.pared}</span>
                            {p.opciones.map(r => (
                                <button key={r} type="button" disabled={!vivo || ocupado}
                                        onClick={() => onRumbo(p.clave, r)}
                                        aria-pressed={m.respuestas[p.clave] === r}
                                        className={`rounded-md border px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-50 ${
                                            m.respuestas[p.clave] === r
                                                ? 'border-brand bg-brand text-black'
                                                : 'border-white/15 text-white/75 hover:border-brand/50 hover:text-white'}`}>
                                    {NOMBRE_RUMBO[r] || r}
                                </button>
                            ))}
                            {onIr && p.ir && (
                                <button type="button" onClick={() => onIr({ ir: p.ir })}
                                        className="ml-auto text-[11px] text-brand underline decoration-dotted">
                                    Ver en el plano
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {m.otros.length > 0 && (
                <div className="space-y-1">
                    <p className="text-[11.5px] leading-snug text-white/70">
                        {m.preguntas.length ? 'Y esto se arregla en su sitio:' : 'Esto se arregla en su sitio:'}
                    </p>
                    {m.otros.map(o => (
                        <div key={o.clave} className="flex items-start gap-2 rounded-md bg-black/20 px-2 py-1.5">
                            <div className="min-w-0 flex-1">
                                <p className="text-[12px] leading-snug text-white/85">{o.texto}</p>
                                {o.detalle && <p className="text-[10.5px] leading-snug text-white/45">{o.detalle}</p>}
                            </div>
                            {onIr && o.ir && (
                                <button type="button" onClick={() => onIr(o)}
                                        className="shrink-0 rounded-md border border-white/15 px-2 py-0.5 text-[11px]
                                                   font-bold text-white/75 hover:border-brand/50 hover:text-white">
                                    Ir
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!m.preguntas.length && !m.otros.length && (
                <p className="text-[11.5px] leading-snug text-white/60">
                    {m.agotado
                        ? `Ya he probado a arreglarlo solo ${MAX_REINTENTOS_SOLOS} veces y el motor sigue diciendo que no: míralo arriba, en la ventana, o dime con tus palabras qué hay que cambiar.`
                        : 'El plano no dice qué lo para: le pregunto al asistente cómo arreglarlo.'}
                </p>
            )}

            {m.errores.map((e, i) => <p key={i} className="text-[11.5px] leading-snug text-amber-300/90">⚠ {e}</p>)}
            {m.pasos.length > 0 && m.estado !== 'esperando' && (
                <ul className="space-y-1">
                    {m.pasos.map((p, i) => (
                        <li key={i} className={`rounded-md px-2 py-1 text-[12px] leading-snug ${
                            m.estado === 'deshecho' ? 'bg-black/10 text-white/40 line-through' : 'bg-black/20 text-white/85'}`}>
                            {m.estado === 'hecho' ? '✓ ' : ''}{p.texto}
                        </li>
                    ))}
                </ul>
            )}

            {vivo && (m.preguntas.length > 0 || m.otros.length > 0) && (
                <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button type="button" onClick={() => onSeguir(m.objetivo)} disabled={ocupado || faltan > 0}
                            className="rounded-lg bg-brand px-3 py-1.5 text-[12px] font-black text-black disabled:opacity-40">
                        {seguir}
                    </button>
                    {m.preguntas.length > 0 && (
                        <button type="button" onClick={() => onSeguir(null)} disabled={ocupado || faltan > 0}
                                className="px-1 text-[12px] text-white/50 underline decoration-dotted hover:text-white/75
                                           disabled:opacity-40">
                            Solo aplicar
                        </button>
                    )}
                    {faltan > 0 && (
                        <span className="text-[11px] text-white/40">
                            {faltan === 1 ? 'Falta 1 por contestar' : `Faltan ${faltan} por contestar`}
                        </span>
                    )}
                </div>
            )}
            <EnQueHaQuedado m={m} ultima={ultima} ocupado={ocupado} onDeshacer={onDeshacer} />
        </div>
    );
}

export default AsistenteEnvolvente;
