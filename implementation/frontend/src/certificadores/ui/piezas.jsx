// ─── piezas.jsx — las piezas comunes de la app (estilo «carta de pago») ─────
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Enlace } from '../router';
import { FIRMA, LOGO, NOMBRE_APP, SELLO } from '../marca';
import { alPortapapeles, mensajeError } from '../api';
import { IcoAlerta, IcoCheck, IcoCopiar, IcoRecargar, IcoX, Spinner } from './Iconos';

/* ── Hoja: ventana que sube desde abajo en el móvil y se centra en el PC ──── */
// Portaleada a <body> (regla 29.b): un ancestro con backdrop-filter la recortaría.
export function Hoja({ abierta, titulo, onCerrar, children, pie, ancho, etiqueta }) {
    const ref = useRef(null);
    // `onCerrar` viaja por ref: el padre suele pasar una flecha nueva en cada
    // render y, en las dependencias, el efecto se relanzaría y le robaría el foco
    // al campo en el que se está escribiendo dentro de la hoja.
    const cerrarRef = useRef(onCerrar);
    useEffect(() => { cerrarRef.current = onCerrar; });
    useEffect(() => {
        if (!abierta) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const alTeclado = (e) => { if (e.key === 'Escape') cerrarRef.current?.(); };
        document.addEventListener('keydown', alTeclado);
        const t = setTimeout(() => ref.current?.focus({ preventScroll: true }), 30);
        return () => {
            document.body.style.overflow = prev;
            document.removeEventListener('keydown', alTeclado);
            clearTimeout(t);
        };
    }, [abierta]);
    if (!abierta) return null;
    return createPortal(
        <div className="ca-capa" onClick={onCerrar}>
            <div className="ca-sheet" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={etiqueta || titulo}
                style={ancho ? { maxWidth: ancho } : undefined} onClick={e => e.stopPropagation()}>
                <div className="ca-sheet-head">
                    <div className="ca-asa" />
                    <div className="ca-sheet-tit">
                        <h2 className="ca-display">{titulo}</h2>
                        <button type="button" className="ca-icobtn" onClick={onCerrar} aria-label="Cerrar"><IcoX /></button>
                    </div>
                </div>
                <div className="ca-sheet-body">{children}</div>
                {pie && <div className="ca-sheet-pie">{pie}</div>}
            </div>
        </div>,
        document.body,
    );
}

/* ── Aviso flotante (toast) ───────────────────────────────────────────────── */
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
    const [t, setT] = useState(null);
    const timer = useRef(null);
    const toast = useCallback((texto, ms = 2600) => {
        clearTimeout(timer.current);
        setT({ texto, id: Date.now() });
        timer.current = setTimeout(() => setT(null), ms);
    }, []);
    useEffect(() => () => clearTimeout(timer.current), []);
    return (
        <ToastCtx.Provider value={toast}>
            {children}
            {t && createPortal(
                <div className="ca-toast" role="status" key={t.id}><IcoCheck size={18} sw={2.6} /><span>{t.texto}</span></div>,
                document.body,
            )}
        </ToastCtx.Provider>
    );
}
export const useToast = () => useContext(ToastCtx);

/* ── Error de red amable: nunca una pantalla en blanco ni cifras a cero ──── */
export function ErrorRed({ error, onReintentar, titulo = 'No hemos podido cargar', compacto = false }) {
    const [reintentando, setReintentando] = useState(false);
    const reintentar = async () => {
        setReintentando(true);
        try { await onReintentar?.(); } finally { setReintentando(false); }
    };
    return (
        <div className={compacto ? 'ca-aviso ca-aviso-ambar' : 'ca-card ca-pad ca-in'} role="alert">
            {compacto ? (
                <>
                    <span className="ca-ico-tile"><IcoAlerta size={18} /></span>
                    <div>
                        <b>{titulo}</b>
                        <div>{typeof error === 'string' ? error : mensajeError(error)}</div>
                        {onReintentar && (
                            <button type="button" className="ca-link" onClick={reintentar} disabled={reintentando}>
                                {reintentando ? <Spinner size={15} /> : <IcoRecargar size={15} />} Reintentar
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <>
                    <span className="ca-ico-tile ca-tile-ambar"><IcoAlerta /></span>
                    <h2 className="ca-display ca-h3" style={{ marginTop: 14 }}>{titulo}</h2>
                    <p className="ca-txt">{typeof error === 'string' ? error : mensajeError(error)}</p>
                    {onReintentar && (
                        <div className="ca-btns">
                            <button type="button" className="ca-btn ca-btn-sec" onClick={reintentar} disabled={reintentando}>
                                {reintentando ? <Spinner /> : <IcoRecargar />} Reintentar
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/* ── Esqueleto con brillo (las esperas nunca son una pantalla quieta) ─────── */
export function Esqueleto({ alto = 120, n = 1, radio }) {
    return (
        <div className="ca-stack" aria-busy="true" aria-label="Cargando">
            {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="ca-sk" style={{ height: alto, borderRadius: radio }} />
            ))}
        </div>
    );
}

/* ── El fondo de papel de cada pantalla ───────────────────────────────────── */
export function Papel({ children, halo = true, className = '' }) {
    return (
        <div className={`ca ${className}`}>
            <div className="ca-filete-top" />
            {halo && <div className="ca-halo" />}
            {children}
        </div>
    );
}

/** Cabecera de las páginas públicas: logo + nombre de la app (+ algo a la derecha). */
export function CabeceraPublica({ derecha, enlace = '/' }) {
    return (
        <header className="ca-head">
            {enlace ? (
                <Enlace to={enlace} className="ca-marca" aria-label={`${NOMBRE_APP}, inicio`}>
                    <img className="ca-logo" src={LOGO} alt="BROKERGY" width="130" height="26" />
                    <span className="ca-marca-txt">CEE con IA</span>
                </Enlace>
            ) : (
                // Vista del propietario: el logo no lleva a la landing de certificadores.
                <span className="ca-marca"><img className="ca-logo" src={LOGO} alt="BROKERGY" width="130" height="26" /></span>
            )}
            {derecha}
        </header>
    );
}

/** Firma de persona (la guía: se cierra con Fran, no con «el equipo»). */
export function Firma({ pie = true }) {
    return (
        <footer>
            <div className="ca-firma">
                <img className="ca-sello" src={SELLO} alt="" width="52" height="52" />
                <div>
                    <b>{FIRMA.nombre}</b>
                    <span>{FIRMA.cargo}</span>
                </div>
            </div>
            {pie && <p className="ca-pie">BROKERGY · Ingeniería energética · <Enlace to="/privacidad">Privacidad</Enlace></p>}
        </footer>
    );
}

/** Botón de copiar con su «Copiado». */
export function BotonCopiar({ texto, etiqueta = 'Copiar', className = '' }) {
    const [ok, setOk] = useState(false);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    if (!texto) return null;
    return (
        <button type="button" className={`ca-copy${ok ? ' ca-copy-ok' : ''} ${className}`}
            onClick={async () => {
                if (await alPortapapeles(texto)) {
                    setOk(true);
                    clearTimeout(timer.current);
                    timer.current = setTimeout(() => setOk(false), 1800);
                }
            }}
            aria-label={ok ? 'Copiado' : etiqueta}>
            {ok ? <IcoCheck size={17} sw={2.8} /> : <IcoCopiar size={17} />}
            <span>{ok ? 'Copiado' : etiqueta}</span>
        </button>
    );
}

/** Aviso en caja: tono ambar · fuerte · ok · info. */
export function Aviso({ tono = 'ambar', icono, titulo, children, className = '' }) {
    const Ic = icono || (tono === 'ok' ? IcoCheck : IcoAlerta);
    return (
        <div className={`ca-aviso ca-aviso-${tono} ${className}`}>
            <span className="ca-ico-tile"><Ic size={18} /></span>
            <div>
                {titulo && <b style={{ display: 'block' }}>{titulo}</b>}
                {children}
            </div>
        </div>
    );
}

/** Campo de formulario con su etiqueta. */
export function Campo({ etiqueta, opcional, ayuda, sufijo, children, id }) {
    return (
        <label className="ca-campo" htmlFor={id}>
            {etiqueta && <span className="ca-label">{etiqueta}{opcional && <small> · opcional</small>}</span>}
            {sufijo ? <div className="ca-sufijo">{children}<span>{sufijo}</span></div> : children}
            {ayuda && <span className="ca-ayuda" style={{ display: 'block' }}>{ayuda}</span>}
        </label>
    );
}

/** Pantalla entera de «cargando» (arranque de la sesión). */
export function CargandoPantalla() {
    return (
        <Papel>
            <div className="ca-col">
                <CabeceraPublica />
                <Esqueleto alto={180} />
                <Esqueleto alto={90} n={2} />
            </div>
        </Papel>
    );
}
