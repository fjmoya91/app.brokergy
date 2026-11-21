import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { AISLAR_PORTAL } from '../../../../components/aislarPortal';
import { PREGUNTAS_FM, DOCUMENTOS_FM, limpiarRespuestas, veredictoRequisitosFm } from '../../logic/requisitosFm';

// ─────────────────────────────────────────────────────────────────────────────
// Popup «¿Tu cliente puede cobrar más?» — los requisitos del FACTOR MULTIPLICADOR
// en cinco preguntas, para el PARTNER (Fran, 16/11/2026). Termina en «Pedir que
// vaya por FM», que GUARDA LA PETICIÓN (`POST /api/oportunidades/:id/peticion-fm`)
// y NO cambia la vía: la elige el equipo con su conmutador, después de revisarla.
// Portaleado a body (regla 29.b) y con los eventos aislados (regla 183).
// ─────────────────────────────────────────────────────────────────────────────

const aBool = (v) => (v === 'si' ? true : v === 'no' ? false : v === 'nose' ? null : undefined);
const deBool = (v) => (v === true ? 'si' : v === false ? 'no' : v === null ? 'nose' : undefined);

export function RequisitosFmModal({ abierto, onCerrar, idOportunidad, peticion, onPedido, ratioTexto }) {
    // Respuestas en el popup: 'si' | 'no' | 'nose' | undefined (sin contestar).
    const [r, setR] = useState({});
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const cerrarRef = useRef(null);
    const dlgRef = useRef(null);

    // Al abrir, siembra con lo que ya se pidió (si se pidió) y lleva el foco al cierre.
    // Al cerrar, el foco vuelve al botón que lo abrió.
    useEffect(() => {
        if (!abierto) return;
        const antes = document.activeElement;
        return () => { try { antes?.focus?.(); } catch { /* ya no está */ } };
    }, [abierto]);

    useEffect(() => {
        if (!abierto) return;
        const previas = peticion?.respuestas || {};
        const sembrado = {};
        for (const p of PREGUNTAS_FM) {
            const v = deBool(previas[p.id]);
            if (v && peticion) sembrado[p.id] = v;
        }
        setR(sembrado);
        setError(null);
        const t = setTimeout(() => cerrarRef.current?.focus(), 30);
        return () => clearTimeout(t);
    }, [abierto, peticion]);

    useEffect(() => {
        if (!abierto) return;
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); return; }
            // El tabulador no se sale del popup a la página de detrás.
            if (e.key !== 'Tab' || !dlgRef.current) return;
            const f = [...dlgRef.current.querySelectorAll('button:not([disabled]),[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')];
            if (!f.length) return;
            const primero = f[0], ultimo = f[f.length - 1];
            if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
            else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
            else if (!dlgRef.current.contains(document.activeElement)) { e.preventDefault(); primero.focus(); }
        };
        window.addEventListener('keydown', onKey, true);
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey, true); document.body.style.overflow = overflow; };
    }, [abierto, onCerrar]);

    if (!abierto) return null;

    const respuestas = limpiarRespuestas(Object.fromEntries(
        PREGUNTAS_FM.map(p => [p.id, aBool(r[p.id]) ?? null])));
    const contestadas = PREGUNTAS_FM.filter(p => r[p.id]).length;
    const { estado, motivos, faltan } = veredictoRequisitosFm(respuestas);
    // «No lo sé» cuenta como contestada, pero no como «sí».
    const sinContestar = PREGUNTAS_FM.length - contestadas;

    const ver = estado === 'no_cumple'
        ? { clase: 'no_cumple', titulo: 'Por la vía normal, de momento', texto: 'La ayuda de la vía normal no cambia. Lo que lo impide:' }
        : estado === 'cumple'
            ? { clase: 'cumple', titulo: 'Puede ir por el factor multiplicador', texto: 'Con lo que dices, la obra cumple. Lo confirmamos con los documentos de abajo.' }
            : { clase: '', titulo: contestadas === 0 ? 'Contesta las cinco preguntas' : faltan === 1 ? 'Falta 1 por confirmar' : `Faltan ${faltan} por confirmar`,
                texto: 'Con «No lo sé» no pasa nada: lo comprobamos nosotros con la documentación.' };

    const pedir = async () => {
        if (!idOportunidad || enviando) return;
        setEnviando(true); setError(null);
        try {
            const { data } = await axios.post(`/api/oportunidades/${encodeURIComponent(idOportunidad)}/peticion-fm`, { respuestas });
            onPedido?.(data?.peticion_fm || null);
            onCerrar();
        } catch (e) {
            setError(e?.response?.data?.error || 'No se ha podido enviar. Vuelve a intentarlo.');
        } finally {
            setEnviando(false);
        }
    };

    // Con algún «no» la obra va por la vía normal: no se ofrece pedir el FM.
    const puedePedir = !!idOportunidad && estado !== 'no_cumple' && sinContestar === 0;

    return createPortal(
        <div className="po-velo" {...AISLAR_PORTAL}
            onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) e.currentTarget.dataset.fondo = '1'; else delete e.currentTarget.dataset.fondo; }}
            onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && e.currentTarget.dataset.fondo === '1') onCerrar(); }}>
            <div ref={dlgRef} className="po po-dlg" role="dialog" aria-modal="true" aria-labelledby="po-fm-t">
                <div className="po-filete" />
                <div className="po-in">
                    <div className="po-cab" style={{ flexWrap: 'nowrap' }}>
                        <div>
                            <p className="po-eti">Factor multiplicador</p>
                            <h2 id="po-fm-t" className="po-h1" style={{ fontSize: 30 }}>
                                ¿Tu cliente puede cobrar <span className="po-mark">{ratioTexto || 'más'}</span>?
                            </h2>
                            <p className="po-sub">Cinco preguntas. Si contestas sí a todas, la obra puede ir por el factor multiplicador (Resolución del 3/11/2026, BOE del 7/11).</p>
                        </div>
                        <button ref={cerrarRef} type="button" className="po-cerrar" aria-label="Cerrar" onClick={onCerrar}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                    </div>

                    {PREGUNTAS_FM.map((p, i) => (
                        <div key={p.id} className="po-preg" role="group" aria-labelledby={`po-q-${p.id}`}>
                            <span className="po-n" aria-hidden="true">{i + 1}</span>
                            <div style={{ minWidth: 0 }}>
                                <p id={`po-q-${p.id}`} className="q">{p.texto}</p>
                                <p className="a">{p.ayuda}</p>
                                <div className="po-ops">
                                    {[['si', 'Sí'], ['no', 'No'], ['nose', 'No lo sé']].map(([v, et]) => (
                                        <button key={v} type="button" className={`po-op ${v}`} aria-pressed={r[p.id] === v}
                                            onClick={() => setR(prev => ({ ...prev, [p.id]: v }))}>{et}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className={`po-ver ${ver.clase}`} aria-live="polite">
                        <p className="po-eti">Resultado</p>
                        <p className="tit">{ver.titulo}</p>
                        <p style={{ marginTop: 4, fontSize: 13 }}>{ver.texto}</p>
                        {motivos.map((m, i) => <p key={i} style={{ marginTop: 4, fontSize: 13, fontWeight: 600 }}>· {m}</p>)}
                    </div>

                    {/* Lo que decide va pegado al resultado: cuándo se cobra y el cupo. */}
                    <div className="po-saber">
                        <p className="po-eti" style={{ color: '#5c4100' }}>Lo que tiene que saber tu cliente</p>
                        <p style={{ margin: '4px 0 0' }}>
                            Se presenta del <strong>15/01/2027</strong> al 31/12/2027, así que se cobra más tarde que por la vía normal.
                            Hay un <strong>cupo nacional</strong> que se reparte por fecha de resolución: si se agota, la obra sigue por la vía normal.
                            La cifra es estimada hasta el CEE final.
                        </p>
                    </div>

                    <div className="po-card" style={{ padding: '16px 20px' }}>
                        <p className="po-eti">Si va por FM, te pediremos además</p>
                        <ul className="po-lista">
                            {DOCUMENTOS_FM.map(([b, t]) => <li key={b}><strong>{b}</strong> {t}</li>)}
                            <li>El CEE final registrado y el consentimiento del IRPF los hacemos nosotros.</li>
                        </ul>
                    </div>

                    {error && <p className="po-err" role="alert">{error}</p>}

                    <p className="po-nota" style={{ textAlign: 'center', margin: 0 }}>
                        {!idOportunidad ? 'Guarda antes la oportunidad.'
                            : estado === 'no_cumple' ? 'Con algún «No», la obra va por la vía normal.'
                            : sinContestar > 0 ? 'Contesta las cinco (vale «No lo sé») para pedirlo.'
                            : 'Nos llega con tus respuestas y lo revisamos antes de cambiar la vía de la obra.'}
                    </p>

                    {/* Fija abajo: en el móvil el popup es largo y la X se queda arriba. */}
                    <div className={`po-acciones${estado === 'no_cumple' ? ' solo' : ''}`}>
                        <button type="button" className="po-btn2" onClick={onCerrar}>{estado === 'no_cumple' ? 'Cerrar' : 'Ahora no'}</button>
                        {/* Con algún «No» no hay nada que pedir: ni el botón apagado. */}
                        {estado !== 'no_cumple' && (
                            <button type="button" className="po-btn" onClick={pedir} disabled={!puedePedir || enviando}>
                                {enviando ? 'Enviando…' : peticion ? 'Actualizar la petición' : 'Pedir que vaya por FM'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
