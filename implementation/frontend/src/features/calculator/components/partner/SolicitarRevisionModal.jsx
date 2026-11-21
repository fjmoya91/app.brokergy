import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AISLAR_PORTAL } from '../../../../components/aislarPortal';

// ─────────────────────────────────────────────────────────────────────────────
// Popup «Solicitar revisión» del PARTNER (Fran, 17/11/2026: «debe saltarle un
// popup para confirmar y dar información de lo que se nos va a enviar y que les
// notificaremos cuando esté»). Antes de pedirla dice qué hacemos (el CEE de la
// vivienda con lo que ya hay, la cifra recalculada sola), qué tiene que saber
// (puede subir, quedarse o bajar; mejor no enviar la propuesta mientras) y que
// le avisamos por WhatsApp. Portaleado a body (regla 29.b), eventos aislados
// (regla 183), foco atrapado y devuelto, Escape cierra.
// ─────────────────────────────────────────────────────────────────────────────

const PASOS = [
    ['Hacemos el certificado energético de la vivienda', 'Con lo que ya tenemos: la referencia catastral, la placa de la caldera y las fotos que hayas subido.'],
    ['Recalculamos el bono con datos reales', 'La oportunidad se actualiza sola con la cifra del certificado.'],
    ['Te avisamos por WhatsApp', 'Con la cifra nueva y el enlace para enviar la propuesta a tu cliente.'],
];

export function SolicitarRevisionModal({ abierto, onCerrar, onConfirmar, onSubirFotos, enviando = false, error = null, bonoTexto }) {
    const dlgRef = useRef(null);
    const pedirRef = useRef(null);

    // Al cerrar, el foco vuelve al botón que lo abrió.
    useEffect(() => {
        if (!abierto) return;
        const antes = document.activeElement;
        const t = setTimeout(() => pedirRef.current?.focus(), 30);
        return () => { clearTimeout(t); try { antes?.focus?.(); } catch { /* ya no está */ } };
    }, [abierto]);

    useEffect(() => {
        if (!abierto) return;
        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); if (!enviando) onCerrar(); return; }
            if (e.key !== 'Tab' || !dlgRef.current) return;
            const f = [...dlgRef.current.querySelectorAll('button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])')];
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
    }, [abierto, onCerrar, enviando]);

    if (!abierto) return null;

    return createPortal(
        <div className="po-velo" {...AISLAR_PORTAL}
            onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) e.currentTarget.dataset.fondo = '1'; else delete e.currentTarget.dataset.fondo; }}
            onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget && e.currentTarget.dataset.fondo === '1' && !enviando) onCerrar(); }}>
            <div ref={dlgRef} className="po po-dlg" role="dialog" aria-modal="true" aria-labelledby="po-rev-t">
                <div className="po-filete" />
                <div className="po-in">
                    <div className="po-cab" style={{ flexWrap: 'nowrap' }}>
                        <div>
                            <p className="po-eti">Revisión con el CEE</p>
                            <h2 id="po-rev-t" className="po-h1" style={{ fontSize: 30 }}>
                                Revisamos el bono con el <span className="po-mark">certificado</span> de la vivienda
                            </h2>
                            <p className="po-sub">Ahora es <strong>{bonoTexto}</strong>, estimado sin el certificado energético. Con el certificado real suele cambiar.</p>
                        </div>
                        <button type="button" className="po-cerrar" aria-label="Cerrar" onClick={onCerrar} disabled={enviando}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                        </button>
                    </div>

                    {/* Lo único que el partner puede HACER va arriba: en el móvil, al pie quedaba
                        por debajo del pliegue. */}
                    {onSubirFotos && (
                        <div className="po-consejo">
                            <div>
                                <p className="po-rev-t">¿Tienes fotos de las fachadas y las ventanas?</p>
                                <p className="po-rev-x">Súbelas antes de pedirla: el certificado sale más ajustado.</p>
                            </div>
                            <button type="button" className="po-btn2" onClick={onSubirFotos} disabled={enviando}>Subir fotos antes</button>
                        </div>
                    )}

                    <ol className="po-revpasos">
                        {PASOS.map(([t, x], i) => (
                            <li key={t}>
                                <span className="po-n" aria-hidden="true">{i + 1}</span>
                                <div><p className="q">{t}</p><p className="a">{x}</p></div>
                            </li>
                        ))}
                    </ol>

                    <div className="po-saber">
                        <p className="po-eti" style={{ color: '#5c4100' }}>Lo que tienes que saber</p>
                        <ul className="po-lista" style={{ color: '#3d2c00' }}>
                            <li>La cifra puede <strong>subir, quedarse igual o bajar</strong>: será la del certificado.</li>
                            <li>Mientras tanto, mejor <strong>no envíes la propuesta</strong>: saldría con la cifra estimada.</li>
                            {!onSubirFotos && <li>Si nos falta algo de la vivienda (fotos de fachadas o ventanas), te lo pediremos.</li>}
                        </ul>
                    </div>

                    {error && <p className="po-err" role="alert">{error}</p>}

                    <div className="po-acciones">
                        <button type="button" className="po-btn2" onClick={onCerrar} disabled={enviando}>Ahora no</button>
                        <button ref={pedirRef} type="button" className="po-btn po-btn-ico" onClick={onConfirmar} disabled={enviando} aria-busy={enviando}>
                            {enviando ? <><span className="po-spin" aria-hidden="true" />Pidiendo…</> : 'Solicitar revisión'}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
