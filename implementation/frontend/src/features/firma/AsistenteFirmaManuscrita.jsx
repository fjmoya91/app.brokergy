import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SignaturePad from './SignaturePad';
import FirmarConMovil from './FirmarConMovil';
import LectorDocumento from './LectorDocumento';
import { firmarYEscanear, comprimirImagen } from './escaneado';
import { SIGN_BOXES, anexoISignBox } from '../expedientes/logic/signBoxes';

/**
 * Firmar los anexos A MANO, con el dedo, desde el propio móvil.
 *
 * Sustituye al recorrido de "descárgalo, imprímelo, fírmalo, escanéalo y
 * súbelo", que sigue estando (hay quien lo tiene ya firmado en papel) pero que
 * pide una impresora y un escáner para devolver dos folios.
 *
 * El recorrido es el mismo que se haría con los papeles delante y en ese orden:
 *
 *   preparar → [leer · firmar · revisar] × documento → DNI delante → DNI detrás → enviar
 *
 * REGLA — se LEE antes de firmar, y hay que llegar al final. El convenio dice
 * "habiendo leído por sí mismos y hallándose conformes": un botón de firmar
 * activo desde el primer instante convierte esa frase en mentira. Es también lo
 * único que separa esto de un clic de aceptación.
 *
 * REGLA — el orden es CESIÓN primero y Anexo I después, el mismo en el que se
 * mandan y se nombran en todos los mensajes. Y son DOS firmas, no una firma
 * reutilizada: se firma cada documento, como en papel.
 *
 * REGLA — cada documento se cierra ANTES de pasar al siguiente. Al aceptar la
 * firma se estampa y se escanea ahí mismo (`firmarYEscanear`), y lo que se
 * enseña es el resultado de verdad, no una simulación: si se dejara todo para
 * el final, un fallo al componer aparecería después de que el cliente diera por
 * hecho que había terminado.
 */

const PAPEL = 'bg-bkg-surface border border-white/[0.06] rounded-[2rem]';
const BOTON = 'w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm uppercase tracking-widest';

const Icono = ({ d, className = 'w-5 h-5', w = 2 }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={w}>
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);
const D_FLECHA = 'M14 5l7 7m0 0l-7 7m7-7H3';
const D_OK = 'M5 13l4 4L19 7';
const D_CAMARA = 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z';
const D_GIRAR = 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';

const Cargando = ({ texto }) => (
    <div className="flex flex-col items-center gap-3 py-10">
        <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        <p className="text-white/40 text-xs font-black uppercase tracking-widest text-center">{texto}</p>
    </div>
);

const Aviso = ({ children }) => (
    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[12px] font-medium flex gap-2 items-start">
        <Icono d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 shrink-0 mt-0.5" />
        <span>{children}</span>
    </div>
);

// ── Una cara del DNI ─────────────────────────────────────────────────────────
//
// `capture="environment"` abre la cámara TRASERA en el móvil y no estorba en el
// ordenador, donde el navegador lo ignora y enseña el selector de archivos.
function CapturaDni({ titulo, ayuda, valor, onElegir, onQuitar }) {
    const ref = useRef();
    const [preparando, setPreparando] = useState(false);

    /**
     * La foto se encoge AL ELEGIRLA, no al enviarla: así lo que se ve en la
     * vista previa es exactamente lo que va a viajar, y si la compresión la
     * hubiera dejado ilegible se repite ahí mismo, no después de enviarla.
     */
    const elegir = async (f) => {
        setPreparando(true);
        try { onElegir(await comprimirImagen(f)); }
        finally { setPreparando(false); }
    };
    // Un `objectURL` y no un data URL: la foto de un móvil son varios MB y
    // pasarla a base64 para enseñarla la duplica en memoria sin ninguna falta.
    const vista = useMemo(() => (valor ? URL.createObjectURL(valor) : null), [valor]);
    useEffect(() => () => { if (vista) URL.revokeObjectURL(vista); }, [vista]);

    return (
        <div className="space-y-3">
            <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) elegir(f); e.target.value = ''; }} />
            {vista ? (
                <>
                    <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/40">
                        <img src={vista} alt={titulo} className="w-full h-auto max-h-[45vh] object-contain" />
                    </div>
                    <p className="text-white/45 text-[12px] text-center leading-snug">
                        ¿Se leen bien todos los datos? Si ha salido movida o con brillos, vuelve a hacerla.
                    </p>
                    <button onClick={onQuitar}
                        className="w-full py-3 rounded-xl border border-white/10 bg-white/[0.02] text-white/60 text-[11px] font-black uppercase tracking-widest">
                        Repetir la foto
                    </button>
                </>
            ) : (
                <>
                    <button onClick={() => ref.current?.click()} disabled={preparando}
                        className="w-full rounded-2xl border-2 border-dashed border-white/10 hover:border-brand/40 hover:bg-brand/5 transition-all py-10 flex flex-col items-center gap-3 disabled:opacity-50">
                        {preparando ? (
                            <>
                                <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                <span className="text-[11px] font-black uppercase tracking-widest text-white/60">Preparando la foto…</span>
                            </>
                        ) : (
                            <>
                                <Icono d={D_CAMARA} className="w-9 h-9 text-brand" w={1.6} />
                                <span className="text-[11px] font-black uppercase tracking-widest text-white/60">Hacer la foto</span>
                            </>
                        )}
                    </button>
                    <p className="text-white/35 text-[12px] leading-snug text-center">{ayuda}</p>
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────

export function AsistenteFirmaManuscrita({ expedienteId, info, apiUrl, onHecho, onSalir }) {
    // El orden es el de siempre: primero el Convenio, después el Anexo I.
    // Va en un `useMemo` porque entra en las dependencias de `abrirDocumento`:
    // un array nuevo en cada render dejaría ese callback sin estabilidad ninguna.
    const docs = useMemo(() => {
        const lista = [];
        if (info?.anexo_cesion_disponible) lista.push({ which: 'cesion', label: 'Convenio de Cesión de Ahorros', corto: 'Cesión de Ahorros', box: SIGN_BOXES.anexo_cesion, fichero: `${info.numero_expediente} - Anexo Cesion_fdo.pdf`, campo: 'anexo_cesion' });
        if (info?.anexo_i_disponible) lista.push({ which: 'anexo_i', label: 'Anexo I · Declaración Responsable', corto: 'Anexo I', box: anexoISignBox, fichero: `${info.numero_expediente} - Anexo I_fdo.pdf`, campo: 'anexo_i' });
        return lista;
    }, [info?.anexo_cesion_disponible, info?.anexo_i_disponible, info?.numero_expediente]);

    // preparar | leer | movil | firmar | componiendo | revisar | dni_frontal | dni_trasero | enviando
    const [paso, setPaso] = useState('preparar');
    const [idx, setIdx] = useState(0);
    const [buffer, setBuffer] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [leido, setLeido] = useState(false);
    const [progreso, setProgreso] = useState(null);
    const [firmados, setFirmados] = useState({});   // { cesion: {blob, vista}, anexo_i: {...} }
    const [dniFrontal, setDniFrontal] = useState(null);
    const [dniTrasero, setDniTrasero] = useState(null);
    const [dniPdf, setDniPdf] = useState(null);
    const [error, setError] = useState(null);
    const [vertical, setVertical] = useState(false);
    const [firmarIgual, setFirmarIgual] = useState(false);
    const pdfRef = useRef(null);

    const doc = docs[idx] || null;

    /**
     * ¿Se firma con el dedo o con un ratón?
     *
     * De aquí sale por dónde se entra a firmar: con un dedo delante, la hoja se
     * abre directamente; con un ratón, primero se ofrece pasar la firma al móvil
     * —una firma trazada con el ratón sale rígida y no se parece a la de nadie—.
     * Se mira el PUNTERO, no el ancho: un portátil táctil de 15" firma con el
     * dedo perfectamente, y un móvil conectado a un monitor sigue siendo un móvil.
     */
    const tactil = useMemo(() => {
        try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
    }, []);

    /**
     * Se mira la FORMA de la pantalla, no la orientación del aparato: una tableta
     * de pie es más ancha que muchos móviles tumbados, y ahí no hay nada que
     * pedirle a nadie.
     */
    useEffect(() => {
        const mirar = () => setVertical(window.innerHeight > window.innerWidth);
        mirar();
        window.addEventListener('resize', mirar);
        window.addEventListener('orientationchange', mirar);
        return () => {
            window.removeEventListener('resize', mirar);
            window.removeEventListener('orientationchange', mirar);
        };
    }, []);

    // Descarga el borrador del documento en curso. El ArrayBuffer se guarda
    // aparte del estado porque hay que reutilizarlo intacto al escanear.
    const abrirDocumento = useCallback(async (n) => {
        const d = docs[n];
        if (!d) return;
        setCargando(true); setError(null); setLeido(false);
        try {
            const { data } = await axios.get(`${apiUrl}/anexos-upload/${expedienteId}/descargar/${d.which}`, { responseType: 'arraybuffer' });
            pdfRef.current = data;
            setBuffer(data);
            setIdx(n);
            setPaso('leer');
        } catch (e) {
            setError(e.response?.status === 409
                ? 'Este documento se está corrigiendo. Te avisaremos en cuanto esté la versión buena.'
                : 'No se ha podido abrir el documento. Comprueba la conexión e inténtalo otra vez.');
        } finally {
            setCargando(false);
        }
    }, [apiUrl, expedienteId, docs]);

    // Con un dedo delante se va derecho a la hoja; con un ratón se ofrece antes
    // pasar la firma al móvil, que es lo que de verdad se parece a su firma.
    const irAFirmar = () => { setFirmarIgual(false); setPaso(tactil ? 'firmar' : 'movil'); };

    // Firma aceptada: se estampa y se escanea ESE documento, ahí mismo.
    const alFirmar = async (ink) => {
        setPaso('componiendo'); setError(null); setProgreso({ hecha: 0, total: 0 });
        try {
            const { blob, vista } = await firmarYEscanear(pdfRef.current, {
                firma: ink.dataUrl,
                box: doc.box,
                onProgreso: (hecha, total) => setProgreso({ hecha, total }),
            });
            setFirmados(prev => ({ ...prev, [doc.which]: { blob, vista, nombre: doc.fichero, campo: doc.campo } }));
            setPaso('revisar');
        } catch (e) {
            console.error('[firma manuscrita]', e);
            setError('No se ha podido preparar el documento firmado. Vuelve a intentarlo.');
            setPaso('firmar');
        } finally {
            setProgreso(null);
        }
    };

    const continuarTrasRevisar = () => {
        if (idx + 1 < docs.length) { abrirDocumento(idx + 1); return; }
        setPaso('dni_frontal');
    };

    const enviar = async () => {
        setPaso('enviando'); setError(null);
        try {
            const form = new FormData();
            for (const d of docs) {
                const f = firmados[d.which];
                if (f) form.append(d.campo, f.blob, f.nombre);
            }
            form.append('cesion_firma', 'manuscrita');
            // Deja constancia de que la firma se trazó AQUÍ, sobre el borrador que
            // servimos, y no es el escaneo de un papel que anduvo por ahí.
            form.append('firma_origen', 'asistente');
            if (dniPdf) form.append('dni_pdf', dniPdf);
            else {
                if (dniFrontal) form.append('dni_frontal', dniFrontal);
                if (dniTrasero) form.append('dni_trasero', dniTrasero);
            }
            await axios.post(`${apiUrl}/anexos-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            onHecho();
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido enviar. Comprueba la conexión e inténtalo otra vez.');
            setPaso('dni_trasero');
        }
    };

    // ── La hoja de firma ocupa la pantalla entera: va fuera de la tarjeta ────
    if (paso === 'firmar') {
        return (
            <>
                <SignaturePad
                    titulo={doc?.corto}
                    textoAceptar="Usar esta firma"
                    onCancel={() => setPaso('leer')}
                    onAccept={alFirmar}
                />
                {/* En horizontal se tiene toda la pantalla para firmar y la firma
                    sale mucho mejor. Con salida discreta: con el bloqueo de
                    rotación puesto, encerrar al firmante sería peor.

                    Portaleado por lo mismo que el propio `SignaturePad` (regla
                    29.b): dentro de la tarjeta de `/firmar-anexos`, que lleva
                    `backdrop-blur`, un `fixed` se recorta a esa caja y el aviso
                    saldría metido en un recuadro de 200 px. */}
                {tactil && vertical && !firmarIgual && createPortal(
                    <div className="fixed inset-0 z-[80] bg-bkg-deep/95 backdrop-blur text-white flex flex-col items-center justify-center gap-6 p-8 text-center">
                        <Icono d={D_GIRAR} className="w-16 h-16 text-brand animate-pulse" w={1.5} />
                        <div>
                            <h2 className="text-xl font-black uppercase tracking-widest">Gira el teléfono</h2>
                            <p className="text-sm text-white/50 mt-2 max-w-xs leading-relaxed">
                                En horizontal tienes toda la pantalla para firmar, y la firma sale mucho mejor.
                            </p>
                        </div>
                        <button onClick={() => setFirmarIgual(true)} className="text-[11px] text-white/35 underline underline-offset-4 font-bold uppercase tracking-widest">
                            Firmar así igualmente
                        </button>
                    </div>,
                    document.body,
                )}
            </>
        );
    }

    const paso1 = docs.length ? `${idx + 1} de ${docs.length}` : '';

    return (
        <div className="space-y-5 animate-fade-in">
            {/* Cabecera del asistente: dónde estoy y cómo salgo. */}
            <div className="flex items-center justify-between gap-3">
                <button onClick={onSalir} className="text-[11px] text-white/40 hover:text-white/70 font-black uppercase tracking-widest">
                    ← Otra forma de firmar
                </button>
                {paso !== 'preparar' && doc && ['leer', 'movil', 'componiendo', 'revisar'].includes(paso) && (
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-brand/70">Documento {paso1}</span>
                )}
            </div>

            {error && <Aviso>{error}</Aviso>}

            {/* ── Preparación ──────────────────────────────────────────────── */}
            {paso === 'preparar' && (
                <div className="space-y-5">
                    <div>
                        <h2 className="text-lg font-black text-white uppercase tracking-widest">Firma desde aquí mismo</h2>
                        <p className="text-white/50 text-sm leading-relaxed mt-2">
                            No hace falta impresora ni escáner: lees los documentos, los firmas con el dedo y nos mandas la foto de tu DNI. Son unos tres minutos.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-brand/20 bg-brand/[0.05] p-5 space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Ten a mano</p>
                        {[
                            ['Tu DNI', 'Vas a hacerle una foto por delante y otra por detrás. Si lo tienes en PDF, también vale.'],
                            ['Un rato tranquilo', `Vas a firmar ${docs.length === 1 ? 'un documento' : 'dos documentos'} y conviene leerlos antes.`],
                            ['El dedo o el lápiz', 'Se firma en la pantalla, como en el datáfono de una tienda. Se puede repetir las veces que haga falta.'],
                        ].map(([t, d]) => (
                            <div key={t} className="flex gap-3">
                                <Icono d={D_OK} className="w-4 h-4 text-brand shrink-0 mt-0.5" w={3} />
                                <div>
                                    <p className="text-white text-[13px] font-bold">{t}</p>
                                    <p className="text-white/40 text-[12px] leading-snug">{d}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className={BOTON} disabled={!docs.length || cargando} onClick={() => abrirDocumento(0)}>
                        {cargando ? 'Abriendo…' : <>Empezar<Icono d={D_FLECHA} w={3} /></>}
                    </button>
                    {!docs.length && <p className="text-[12px] text-white/40 text-center">Todavía no hay anexos disponibles para firmar.</p>}
                </div>
            )}

            {/* ── Leer el documento ────────────────────────────────────────
                A PANTALLA COMPLETA (`LectorDocumento`, portaleado): encajado en
                la tarjeta, en un móvil el cuerpo del texto quedaba a unos 6 px y
                no se leía — y leerlo es justo lo que se le está pidiendo. */}
            {paso === 'leer' && doc && (cargando || !buffer ? (
                <Cargando texto="Abriendo el documento…" />
            ) : (
                <LectorDocumento
                    buffer={buffer}
                    titulo={doc.label}
                    urlDescarga={`${apiUrl}/anexos-upload/${expedienteId}/descargar/${doc.which}`}
                    onLeido={() => setLeido(true)}
                    onCerrar={() => setPaso(idx > 0 ? 'revisar' : 'preparar')}
                    pie={<>
                        <button className={BOTON} disabled={!leido} onClick={irAFirmar}>
                            {leido ? <>Firmar este documento<Icono d={D_FLECHA} w={3} /></> : 'Pásalo hasta el final para firmar'}
                        </button>
                        {!leido && (
                            <p className="text-[11px] text-white/35 text-center leading-snug">
                                Al firmar declaras haberlo leído, así que te pedimos que lo pases hasta la última página.
                            </p>
                        )}
                    </>}
                />
            ))}

            {/* ── Pasar la firma al móvil (solo con ratón delante) ─────────── */}
            {paso === 'movil' && doc && (
                <FirmarConMovil
                    apiUrl={apiUrl}
                    etiqueta={doc.label}
                    onFirma={alFirmar}
                    onRaton={() => setPaso('firmar')}
                />
            )}

            {/* ── Estampando y escaneando ──────────────────────────────────── */}
            {paso === 'componiendo' && (
                <div className={`${PAPEL} p-8`}>
                    <Cargando texto={progreso?.total ? `Preparando tu documento firmado · ${progreso.hecha} de ${progreso.total}` : 'Preparando tu documento firmado…'} />
                    <p className="text-white/35 text-[12px] text-center leading-snug">No cierres esta pantalla. Tarda unos segundos.</p>
                </div>
            )}

            {/* ── Revisar cómo ha quedado ──────────────────────────────────── */}
            {paso === 'revisar' && doc && firmados[doc.which] && (
                <div className="space-y-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">Así queda tu firma</p>
                        <h2 className="text-base font-black text-white mt-1">{doc.label}</h2>
                    </div>
                    <div className="rounded-xl overflow-hidden bg-white border border-white/10">
                        <img src={firmados[doc.which].vista} alt="Documento firmado" className="w-full h-auto" />
                    </div>
                    <button className={BOTON} onClick={continuarTrasRevisar}>
                        {idx + 1 < docs.length ? <>Continuar con el siguiente<Icono d={D_FLECHA} w={3} /></> : <>Continuar con el DNI<Icono d={D_FLECHA} w={3} /></>}
                    </button>
                    <button onClick={irAFirmar}
                        className="w-full py-3 rounded-xl border border-white/10 bg-white/[0.02] text-white/60 text-[11px] font-black uppercase tracking-widest">
                        Volver a firmar
                    </button>
                </div>
            )}

            {/* ── DNI ──────────────────────────────────────────────────────── */}
            {(paso === 'dni_frontal' || paso === 'dni_trasero') && (
                <div className="space-y-4">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand">
                            {dniPdf ? 'Tu DNI · en PDF' : paso === 'dni_frontal' ? 'Tu DNI · por delante' : 'Tu DNI · por detrás'}
                        </p>
                        <h2 className="text-base font-black text-white mt-1">
                            {dniPdf ? 'Ya lo tenemos' : paso === 'dni_frontal' ? 'La cara de la foto' : 'La cara de atrás'}
                        </h2>
                        <p className="text-white/45 text-[12px] leading-snug mt-2">
                            Se adjunta al Convenio de Cesión: es lo que identifica a quien firma ante el verificador.
                        </p>
                    </div>

                    {/* Las dos vías se excluyen: enseñar la cámara junto al PDF ya
                        elegido hace dudar de si además hay que hacer las fotos. */}
                    {dniPdf ? (
                        <>
                            <div className="rounded-2xl border border-brand/30 bg-brand/[0.06] p-5 flex gap-3 items-center">
                                <Icono d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-7 h-7 text-brand shrink-0" w={1.7} />
                                <div className="min-w-0">
                                    <p className="text-white text-[13px] font-bold truncate">{dniPdf.name}</p>
                                    <p className="text-white/40 text-[12px]">{(dniPdf.size / 1024).toFixed(0)} KB · nos vale por las dos caras</p>
                                </div>
                            </div>
                            <button className={BOTON} onClick={enviar}>Enviar todo<Icono d={D_FLECHA} w={3} /></button>
                            <button onClick={() => setDniPdf(null)}
                                className="w-full py-3 rounded-xl border border-white/10 bg-white/[0.02] text-white/60 text-[11px] font-black uppercase tracking-widest">
                                Prefiero hacer las fotos
                            </button>
                        </>
                    ) : paso === 'dni_frontal' ? (
                        <>
                            <CapturaDni titulo="DNI por delante" valor={dniFrontal}
                                ayuda="Ponlo sobre una superficie lisa, sin brillos y que se lea el número entero."
                                onElegir={setDniFrontal} onQuitar={() => setDniFrontal(null)} />
                            <button className={BOTON} disabled={!dniFrontal} onClick={() => setPaso('dni_trasero')}>
                                Continuar<Icono d={D_FLECHA} w={3} />
                            </button>
                            {/* Quien ya tiene su DNI escaneado no debería tener que
                                volver a fotografiarlo, y ese PDF suele traer las dos
                                caras. Se ofrece solo aquí: a la segunda foto, quien
                                iba a usar el PDF ya lo ha usado. */}
                            <label className="block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 cursor-pointer hover:border-white/15 transition-all">
                                <input type="file" accept="application/pdf" className="hidden"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) setDniPdf(f); e.target.value = ''; }} />
                                <p className="text-[11px] font-black uppercase tracking-widest text-white/50">¿Lo tienes en PDF?</p>
                                <p className="text-white/35 text-[12px] leading-snug mt-1">Súbelo y nos vale por las dos caras: no hace falta que hagas fotos.</p>
                            </label>
                        </>
                    ) : (
                        <>
                            <CapturaDni titulo="DNI por detrás" valor={dniTrasero}
                                ayuda="La cara de atrás, con la banda de letras y números."
                                onElegir={setDniTrasero} onQuitar={() => setDniTrasero(null)} />
                            <button className={BOTON} disabled={!dniTrasero} onClick={enviar}>
                                Enviar todo<Icono d={D_FLECHA} w={3} />
                            </button>
                            <button onClick={() => setPaso('dni_frontal')}
                                className="w-full py-3 rounded-xl border border-white/10 bg-white/[0.02] text-white/60 text-[11px] font-black uppercase tracking-widest">
                                ← Volver a la cara de delante
                            </button>
                        </>
                    )}
                </div>
            )}

            {paso === 'enviando' && (
                <div className={`${PAPEL} p-8`}>
                    <Cargando texto="Enviando tus documentos firmados…" />
                </div>
            )}
        </div>
    );
}

export default AsistenteFirmaManuscrita;
