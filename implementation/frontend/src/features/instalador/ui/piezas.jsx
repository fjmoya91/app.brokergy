// ─── piezas.jsx — lo que comparten todas las pantallas de la app del instalador ──
// Iconos (trazos del prototipo), chips de «quién tiene la pelota», la barra de los
// cinco pasos, el buscador, los vacíos y las esperas. Sin datos ni llamadas: las
// fases 2 y 3 (presupuesto, factura, catálogo) reutilizan esto tal cual.
import React, { useEffect, useRef, useState } from 'react';
import { CSS } from './estilo';

/** Monta el CSS `.ia-` una sola vez (como `.fx-` en Facturación). */
export function EstiloInstalador() {
    return <style>{CSS}</style>;
}

// Trazos copiados del prototipo aprobado (21/11/2026). 24×24, trazo de 2.
export const ICONOS = {
    inicio: 'M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6',
    obras: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 11h8M8 15h5',
    clientes: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1a4 4 0 0 0-3-3.87M15.5 4.13a3.5 3.5 0 0 1 0 6.75',
    catalogo: 'M4 4h7v7H4ZM13 4h7v7h-7ZM4 13h7v7H4ZM13 13h7v7h-7Z',
    mas: 'M12 5v14M5 12h14',
    firma: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z',
    factura: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8ZM14 3v5h5M9 13h6M9 17h4',
    enviar: 'M21 3L10 14M21 3l-7 18-4-7-7-4Z',
    chevron: 'M9 6l6 6-6 6',
    atras: 'M15 6l-6 6 6 6',
    buscar: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-3.5-3.5',
    telefono: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z',
    whatsapp: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z',
    ok: 'M5 12.5l4.5 4.5L19 7.5',
    aviso: 'M12 7v6M12 17h.01',
    reloj: 'M12 7v5l3 2',
    subir: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    salir: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
    // Fase 3 («Tu página web»).
    web: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
    compartir: 'M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7',
    // Fase 5.
    movil: 'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2',
    camara: 'M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    // Fase 6: el asistente.
    chat: 'M21 11.5a8.5 8.5 0 0 1-12.4 7.6L3 20.5l1.4-5A8.5 8.5 0 1 1 21 11.5ZM8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01',
    mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3ZM5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21',
    parar: 'M7 7h10v10H7Z',
    chispa: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9ZM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8Z',
};

// Las tareas pintan el icono de lo que hay que hacer.
const ICONO_TAREA = { propuesta: 'enviar', cifo: 'firma', rite: 'subir', factura: 'factura' };
export const iconoDeTarea = (key) => ICONO_TAREA[key] || 'aviso';

export function Icono({ n, size = 24, grosor = 2, className, style }) {
    const d = ICONOS[n];
    const circulo = n === 'aviso' || n === 'reloj';
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={grosor}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className} style={style}>
            {circulo && <circle cx="12" cy="12" r="9" />}
            <path d={d} />
        </svg>
    );
}

// ── Formatos ─────────────────────────────────────────────────────────────────
/** «2.300 €», sin decimales (las cifras que ve el instalador son redondas). El
 *  punto de miles va a mano: `Intl` en es-ES no lo pone en las de 4 cifras
 *  («6740 €»), y en una cifra protagonista se lee mal. */
export const eur = (n) => {
    if (!Number.isFinite(Number(n))) return '—';
    const v = Math.round(Number(n));
    return `${v < 0 ? '−' : ''}${String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} €`;
};
/** Un importe con signo, para las líneas de las cuentas: «− 2.300 €». */
export const eurSigno = (n) => {
    const v = Math.round(Number(n) || 0);
    if (!v) return eur(0);
    return `${v < 0 ? '−' : '+'} ${eur(Math.abs(v))}`;
};
/** Búsqueda sin tildes ni mayúsculas (como el resto del CRM). */
export const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Teléfono a 9 cifras españolas, o null. */
export function telefonoLimpio(t) {
    let d = String(t || '').replace(/\D/g, '');
    if (d.startsWith('0034')) d = d.slice(4);
    if (d.length === 11 && d.startsWith('34')) d = d.slice(2);
    return d.length === 9 ? d : null;
}
export const telHref = (t) => { const d = telefonoLimpio(t); return d ? `tel:+34${d}` : null; };
export const waHref = (t) => { const d = telefonoLimpio(t); return d ? `https://wa.me/34${d}` : null; };
/** «654 54 70 40». */
export const telefonoBonito = (t) => {
    const d = telefonoLimpio(t);
    return d ? `${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : (t || '');
};
/** El DNI nunca entero en pantalla: «···· 4321 X». */
export function dniEnmascarado(dni) {
    const s = String(dni || '').replace(/[\s-]/g, '').toUpperCase();
    if (s.length < 5) return s ? '····' : '';
    const letra = /[A-Z]$/.test(s) ? s.slice(-1) : '';
    const cifras = (letra ? s.slice(0, -1) : s).slice(-4);
    return `···· ${cifras}${letra ? ' ' + letra : ''}`;
}
export function iniciales(nombre) {
    const p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    return ((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase() || '·';
}
/** «MARÍA JOSÉ» → «María José» (las fichas vienen en MAYÚSCULAS). */
export function nombrePropio(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s\-'(])([\p{L}])/gu, (m, a, b) => a + b.toUpperCase())
        .replace(/\b(De|Del|La|Las|Los|Y|E)\b/g, (m) => m.toLowerCase()).replace(/^./, (c) => c.toUpperCase())
        // Las siglas de sociedad siguen en mayúsculas: «Hermanos Calvo, S.L.», no «S.l.».
        .replace(/\b(s\.\s?l(\.\s?u)?|s\.\s?a|s\.\s?c|c\.\s?b|s\.\s?coop)\.?(?=$|[\s,)])/gi, (m) => m.toUpperCase())
        .replace(/\b(slu?)\b/gi, (m) => m.toUpperCase());
}

// ── Chips de «quién tiene la pelota» ─────────────────────────────────────────
export const CHIP_QUIEN = {
    tu: { clase: 'tu', texto: 'Te toca' },
    nos: { clase: '', texto: 'Lo llevamos nosotros' },
    cli: { clase: '', texto: 'Espera al cliente' },
    fin: { clase: 'fin', texto: 'Cobrada' },
};
export function ChipQuien({ quien }) {
    const c = CHIP_QUIEN[quien] || CHIP_QUIEN.nos;
    return <span className={`ia-chip ${c.clase}`}>{c.texto}</span>;
}

// ── Los cinco pasos ──────────────────────────────────────────────────────────
const SEG = ['#fca508', '#f5c53f', '#eee475', '#c7d54c', '#b5cf38'];
export const ETIQUETAS_PASOS = ['Simulada', 'Propuesta', 'Aceptada', 'Trámite', 'Cobro'];
export function BarraPasos({ paso, grande = false, etiquetas = false }) {
    const n = Math.max(0, Math.min(5, Number(paso) || 0));
    return (
        <>
            <div className={`ia-pasos${grande ? ' g' : ''}`} role="img" aria-label={`Paso ${n} de 5`}>
                {SEG.map((c, i) => <span key={i} style={i < n ? { background: c } : undefined} />)}
            </div>
            {etiquetas && (
                <div className="ia-pasos-txt" aria-hidden="true">
                    {ETIQUETAS_PASOS.map((t, i) => (i + 1 === n ? <b key={t}>{t}</b> : <span key={t}>{t}</span>))}
                </div>
            )}
        </>
    );
}

// ── Buscador, vacío, error y espera ──────────────────────────────────────────
export function Buscador({ valor, onCambio, placeholder, etiqueta }) {
    return (
        <label className="ia-buscar">
            <Icono n="buscar" size={20} style={{ color: 'var(--gris2)', flex: 'none' }} />
            <span className="ia-sr">{etiqueta || placeholder}</span>
            <input type="search" value={valor} onChange={(e) => onCambio(e.target.value)} placeholder={placeholder}
                autoComplete="off" enterKeyHint="search" />
        </label>
    );
}

export function Esqueleto({ alto = 120, n = 3 }) {
    return (
        <div aria-busy="true" aria-label="Cargando" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: n }, (_, i) => <div key={i} className="ia-esqueleto" style={{ height: alto }} />)}
        </div>
    );
}

/** Una hoja (popup de abajo) con el TECLADO (fase 5): al abrirse, el foco entra en
 *  ella; Tab no se escapa a lo de detrás; Escape la cierra; al cerrarse, el foco
 *  vuelve al botón que la abrió. Devuelve el `ref` para la `.ia-hoja`. */
export function useHojaTeclado(onCerrar) {
    const ref = useRef(null);
    const cerrar = useRef(onCerrar);
    cerrar.current = onCerrar;
    useEffect(() => {
        const antes = document.activeElement;
        const el = ref.current;
        const enfocables = () => Array.from(el?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea, select, [tabindex]:not([tabindex="-1"])') || []);
        try { enfocables()[0]?.focus({ preventScroll: true }); } catch { /* */ }
        const tecla = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); cerrar.current?.(); return; }
            if (e.key !== 'Tab' || !el) return;
            const f = enfocables();
            if (!f.length) return;
            const i = f.indexOf(document.activeElement);
            if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
        };
        document.addEventListener('keydown', tecla, true);
        return () => {
            document.removeEventListener('keydown', tecla, true);
            try { if (antes && document.contains(antes)) antes.focus({ preventScroll: true }); } catch { /* */ }
        };
    }, []);
    return ref;
}

/** ¿Hay conexión? (`navigator.onLine` y sus eventos; sin `navigator`, se supone que sí). */
export function useEnLinea() {
    const [en, setEn] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
    useEffect(() => {
        const si = () => setEn(true); const no = () => setEn(false);
        window.addEventListener('online', si); window.addEventListener('offline', no);
        return () => { window.removeEventListener('online', si); window.removeEventListener('offline', no); };
    }, []);
    return en;
}

/** Lo que se dice cuando la BD no contesta (regla 38: nunca un cero tranquilo).
 *  Sin conexión lo dice así, y en cuanto vuelve la cobertura lo intenta él solo (fase 5). */
export function AvisoError({ onReintentar, texto }) {
    const enLinea = useEnLinea();
    const [antes, setAntes] = useState(enLinea);
    useEffect(() => {
        if (enLinea && !antes && onReintentar) onReintentar();
        setAntes(enLinea);
    }, [enLinea]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <div className="ia-card" role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="ia-eyebrow n">{enLinea ? 'Ahora mismo no podemos enseñarte esto' : 'No tienes conexión'}</p>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--gris)' }}>
                {enLinea
                    ? (texto || 'Es un fallo nuestro y pasajero. Tus obras siguen ahí: vuelve a intentarlo en un momento.')
                    : 'Tu móvil no tiene internet ahora mismo. No se ha perdido nada: en cuanto vuelva la cobertura lo cargamos solo, o pulsa «Volver a intentarlo».'}
            </p>
            {onReintentar && <button type="button" className="ia-btn ia-btn-sec" onClick={onReintentar}>Volver a intentarlo</button>}
        </div>
    );
}
