/* eslint-disable react-refresh/only-export-components -- módulo de piezas compartidas por los editores y los listados de Facturación: exporta componentes y utilidades juntos a propósito (el fast refresh recarga la página entera al tocarlo, y da igual) */
import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { VistaPreviaA4 } from '../../cee-directo/components/VistaPreviaA4';
import { ClientePicker } from '../../cee-directo/components/ClientePicker';
import { DireccionEdit } from '../../../components/DireccionEdit';
import { CampoDecimal } from '../../../components/CampoDecimal';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { contactoCliente } from '../../../utils/contactoCliente';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';
import { aNumero } from '../../../utils/numeroDecimal';
import { traerDireccionCatastral, refCatastralValida } from '../../../utils/traerDireccionCatastral';
import {
    observacionesCliente, mensajeOferta, buildOfertaCeeHtml, direccionInmueble,
} from '../../cee-directo/logic/ofertaCee';
import {
    lineasDeArticulo, varianteDe, descripcionArticulo, totalesLineas, alcanceDeLineas,
    partidasDe, buscarArticulos, normalizarTexto, FAMILIAS, MAX_LINEAS, MAX_OBSERVACIONES,
} from '../logic/presupuesto';
import { CSS, ICO, Ico, Importe, eur, leerLocal, guardarLocal, AvisoFx } from '../estilo';
import { CSS_LISTAS } from '../estiloListas';

// ─────────────────────────────────────────────────────────────────────────────
// El EDITOR de presupuestos (estilo «carta de pago», prefijo .fx-) y las piezas
// que comparten los editores y los listados de Facturación: el panel lateral, el
// diálogo, el menú «···», el aviso flotante con «Deshacer», los canales del envío,
// el buscador de artículos y la partida compacta. Viven aquí porque este es el
// módulo de abajo (FacturaModal y los listados lo importan; él no importa a nadie).
//
// El presupuesto se hace en segundos: el CLIENTE primero (con el foco ya puesto;
// si es nuevo, nombre y móvil en el mismo bloque), luego «Añadir partida» y Enter
// (el artículo con su precio y lo que ARRASTRA: el CEE trae su tasa), el total a
// la vista, y abajo el envío con el mensaje que se va a mandar ya escrito. El
// canal que se usó la última vez se recuerda (en este navegador).
//
// REGLA — un presupuesto NUEVO no se autoguarda: guardar consume número. Guardar
// deja un BORRADOR (no sale nada); Enviar lo manda con el PDF y el enlace de
// aceptación, y si no sale por ningún canal se queda en borrador. Aceptado,
// rechazado o anulado ya no se edita: se ve y se duplica. Las líneas, el total y
// el PDF salen de `logic/presupuesto.js` y `ofertaCee.js`, los del servidor.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/facturacion';
const INMUEBLE_VACIO = { direccion: '', codigo_postal: '', ccaa: '', provincia: '', provincia_cod: '', municipio: '' };
const nombreDe = (c) => (c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '');
const EDITABLES = ['BORRADOR', 'ENVIADA'];
const RE_EMAIL = /\S+@\S+\.\S+/;
const digitos = (s) => String(s || '').replace(/\D/g, '');
// El IVA de una línea; «Suplido» es la tasa que se paga en nombre del cliente:
// sin IVA y sin descuento (art. 78.Tres.3º LIVA).
const IVAS = [{ v: '21', t: '21 %' }, { v: '10', t: '10 %' }, { v: '4', t: '4 %' }, { v: '0', t: '0 %' }, { v: 'S', t: 'Suplido' }];

/** «600112233» → «600 11 22 33»; lo demás, tal cual. */
export const tlfBonito = (t) => {
    const d = digitos(t);
    const n = d.length === 11 && d.startsWith('34') ? d.slice(2) : d;
    return /^\d{9}$/.test(n) ? n.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4') : String(t || '');
};

/** Días enteros desde una fecha u hora ISO hasta hoy (null si no hay). */
export const diasDesde = (iso) => {
    if (!iso) return null;
    const t = new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
};
/** «hoy» · «ayer» · «hace 12 d». */
export const haceTxt = (d) => (d == null ? '' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} d`);

// ═══ Piezas comunes (.fx-) ═══════════════════════════════════════════════════

let usosEstilo = 0;
/**
 * El CSS .fx- en <head> mientras haya abierto un editor o un diálogo de Facturación.
 * Dentro de la pestaña ya lo monta FacturacionView; fuera (el presupuesto se abre
 * también desde CEE directos) sin esto el panel saldría sin estilo.
 */
export function useEstiloFx() {
    useLayoutEffect(() => {
        usosEstilo += 1;
        if (!document.getElementById('fx-estilo-editores')) {
            const el = document.createElement('style');
            el.id = 'fx-estilo-editores';
            el.textContent = CSS + CSS_LISTAS;
            document.head.appendChild(el);
        }
        return () => {
            usosEstilo = Math.max(0, usosEstilo - 1);
            if (!usosEstilo) document.getElementById('fx-estilo-editores')?.remove();
        };
    }, []);
}

/** El icono de un item: un nombre de ICO o un trazo suelto. */
const icoDe = (i) => (!i ? { n: 'derecha' } : ICO[i] ? { n: i } : { d: i });
export const ICO_EXTRA = {
    copiar: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
    ojo: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    guardar: 'M5 4h11l3 3v13H5z M8 4v5h7 M8 20v-6h8v6',
    deshacer: 'M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    persona: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    casa: 'M4 11l8-7 8 7 M6 9.5V20h12V9.5 M10 20v-5h4v5',
};

/**
 * Menú «···» (`.fx-pop`), portaleado a <body>: la tabla y el panel recortan, y un
 * fixed dentro de un ancestro con backdrop-filter se ancla a él (regla 29.b).
 * items: { label, icono, onClick, peligro (ámbar), disabled, detalle } · { info: true,
 * label } (una línea que se LEE) · { sep: true }. Se cierra con Esc, al tocar fuera,
 * con scroll o al elegir.
 * @param anchor  el botón (elemento) o su DOMRect
 */
export function MenuAcciones({ anchor, items, titulo, onClose }) {
    const ref = useRef(null);
    const [pos, setPos] = useState(null);
    const cerrar = useRef(onClose);
    useEffect(() => { cerrar.current = onClose; }, [onClose]);

    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const r = anchor?.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
        const w = el.offsetWidth, h = el.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
        if (!r) { setPos({ top: Math.max(8, (vh - h) / 2), left: Math.max(12, (vw - w) / 2) }); return; }
        let top = r.bottom + 6;
        if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
        const left = Math.min(Math.max(12, r.right - w), vw - w - 12);
        setPos({ top, left });
    }, [anchor]);

    useEffect(() => {
        const previo = document.activeElement;
        ref.current?.querySelector('.fx-pop-item:not(:disabled)')?.focus({ preventScroll: true });
        const tecla = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cerrar.current?.(); return; }
            if (e.key === 'Tab') { cerrar.current?.(); return; }
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            const bs = [...(ref.current?.querySelectorAll('.fx-pop-item:not(:disabled)') || [])];
            if (!bs.length) return;
            e.preventDefault();
            const i = bs.indexOf(document.activeElement);
            bs[(i + (e.key === 'ArrowDown' ? 1 : -1) + bs.length) % bs.length].focus();
        };
        const scroll = (e) => { if (!ref.current?.contains(e.target)) cerrar.current?.(); };
        const resize = () => cerrar.current?.();
        window.addEventListener('keydown', tecla, true);
        window.addEventListener('scroll', scroll, true);
        window.addEventListener('resize', resize);
        return () => {
            window.removeEventListener('keydown', tecla, true);
            window.removeEventListener('scroll', scroll, true);
            window.removeEventListener('resize', resize);
            if (previo && document.contains(previo) && !document.querySelector('.fx-capa .fx-dialogo')) previo.focus?.({ preventScroll: true });
        };
    }, []);

    return createPortal(
        <>
            <div className="fx-pop-fondo" onMouseDown={() => onClose?.()} aria-hidden="true" />
            <div ref={ref} className="fx-pop" role="menu" aria-label={titulo || 'Acciones'}
                style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}>
                {titulo && <div className="fx-pop-tit">{titulo}</div>}
                {items.map((it, i) => {
                    if (it.sep) return <hr key={`sep-${i}`} />;
                    if (it.info) return (
                        <div key={`info-${i}`} className="fx-pop-info"><Ico n="info" size={16} /><span>{it.label}</span></div>
                    );
                    return (
                        <button key={`${it.label}-${i}`} type="button" role="menuitem" disabled={it.disabled}
                            className={`fx-pop-item${it.peligro ? ' fx-pop-aviso' : ''}`}
                            onClick={() => { onClose?.(); it.onClick?.(); }}>
                            <Ico {...icoDe(it.icono)} size={18} />
                            <span>{it.label}{it.detalle && <small>{it.detalle}</small>}</span>
                        </button>
                    );
                })}
            </div>
        </>,
        document.body,
    );
}

/**
 * Diálogo crema (`.fx-dialogo`): hoja desde abajo en el móvil, centrado en el PC.
 * Se cierra con ✕, Esc o tocando fuera, salvo `ocupado` (y fuera, salvo `cerrarFuera=false`:
 * un formulario a medias no se pierde por un toque). El Esc va en captura y se corta: no
 * puede cerrar también el editor que haya debajo.
 * @param tono  color del antetítulo: null (naranja) | 'verde' | 'gris'
 */
export function Dialogo({ titulo, antetitulo = null, subtitulo = null, children, pie = null, onClose, ocupado = false, ancho = false, tono = null, cerrarFuera = true }) {
    useEstiloFx();
    const id = useId();
    const caja = useRef(null);
    const cerrar = useRef(onClose);
    useEffect(() => { cerrar.current = onClose; }, [onClose]);
    const ocupadoRef = useRef(ocupado);
    useEffect(() => { ocupadoRef.current = ocupado; }, [ocupado]);
    useEffect(() => {
        const previo = document.activeElement;
        const primero = caja.current?.querySelector('[data-autofoco]')
            || caja.current?.querySelector('.fx-dlg-cuerpo input, .fx-dlg-cuerpo textarea, .fx-dlg-cuerpo select, .fx-dlg-pie button:last-child, .fx-cerrar');
        if (!caja.current?.contains(document.activeElement)) primero?.focus?.({ preventScroll: true });
        const h = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            if (!ocupadoRef.current) cerrar.current?.();
        };
        window.addEventListener('keydown', h, true);
        return () => { window.removeEventListener('keydown', h, true); if (previo && document.contains(previo)) previo.focus?.({ preventScroll: true }); };
    }, []);
    return createPortal(
        <div className="fx-capa" onMouseDown={e => { if (e.target === e.currentTarget && !ocupado && cerrarFuera) onClose?.(); }}>
            <div className={`fx-dialogo${ancho ? ' fx-dialogo-ancho' : ''}`} role="dialog" aria-modal="true" aria-labelledby={id} ref={caja}>
                <div className="fx-dlg-cab">
                    <div className="fx-asa" aria-hidden="true" />
                    <div className="fx-dlg-tit">
                        <div style={{ minWidth: 0 }}>
                            {antetitulo && <div className={`fx-eyebrow${tono ? ` fx-eyebrow-${tono}` : ''}`}>{antetitulo}</div>}
                            <h2 className="fx-display" id={id}>{titulo}</h2>
                            {subtitulo && <p>{subtitulo}</p>}
                        </div>
                        <button type="button" className="fx-cerrar" aria-label="Cerrar" onClick={onClose} disabled={ocupado}><Ico n="x" /></button>
                    </div>
                </div>
                <div className="fx-dlg-cuerpo">{children}</div>
                {pie && <div className="fx-dlg-pie">{pie}</div>}
            </div>
        </div>,
        document.body,
    );
}

/**
 * El panel lateral de los editores (720 px en el PC, pantalla completa en el móvil).
 * NO se cierra tocando fuera (se perdería lo tecleado); sí con ✕ o Esc, que llaman a
 * `onCerrar` (el editor pregunta si hay cambios sin guardar). `bloqueado`: Esc no hace
 * nada (hay una pregunta, la vista previa o el envío encima).
 * Va por DEBAJO de showConfirm (z 850 < 900) para que sus preguntas se vean.
 */
export function PanelFx({ antetitulo, titulo, chips = null, sub = null, onCerrar, bloqueado = false, pie = null, children, cuerpoRef = null }) {
    useEstiloFx();
    const id = useId();
    const caja = useRef(null);
    const cerrarRef = useRef(onCerrar);
    useEffect(() => { cerrarRef.current = onCerrar; }, [onCerrar]);
    const bloqRef = useRef(bloqueado);
    useEffect(() => { bloqRef.current = bloqueado; }, [bloqueado]);
    useEffect(() => {
        const previo = document.activeElement;
        const antes = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const t = setTimeout(() => {
            if (caja.current?.contains(document.activeElement)) return;
            (caja.current?.querySelector('[data-autofoco]') || caja.current)?.focus?.({ preventScroll: true });
        }, 40);
        const h = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented || bloqRef.current) return;
            e.preventDefault();
            cerrarRef.current?.();
        };
        window.addEventListener('keydown', h);
        return () => {
            clearTimeout(t);
            window.removeEventListener('keydown', h);
            document.body.style.overflow = antes;
            if (previo && document.contains(previo)) previo.focus?.({ preventScroll: true });
        };
    }, []);
    return createPortal(
        <div className="fx-capa fx-capa-panel fx-capa-editor">
            <div className="fx-panel" role="dialog" aria-modal="true" aria-labelledby={id} ref={caja} tabIndex={-1}>
                <div className="fx-panel-cab">
                    <div className="fx-filete-fino" />
                    <div className="fx-panel-tit">
                        <div>
                            {antetitulo && <div className="fx-eyebrow">{antetitulo}</div>}
                            <h2 className="fx-display fx-h2" id={id}>{titulo}</h2>
                            {chips && <div className="fx-cab-chips">{chips}</div>}
                            {sub && <p className="fx-panel-sub">{sub}</p>}
                        </div>
                        <button type="button" className="fx-cerrar" aria-label="Cerrar" onClick={onCerrar}><Ico n="x" /></button>
                    </div>
                </div>
                <div className="fx-panel-cuerpo" ref={cuerpoRef}>{children}</div>
                {pie && <div className="fx-panel-pie">{pie}</div>}
            </div>
        </div>,
        document.body,
    );
}

/**
 * Aviso flotante con acciones: [nodo, avisar(texto, { tono, acciones, ms }), cerrar].
 * Con acciones («Deshacer», «Cambiar fecha») dura 9 s; sin ellas, 4 s (un aviso, 7 s).
 */
export function useAvisoFx() {
    const [t, setT] = useState(null);
    const reloj = useRef(null);
    useEffect(() => () => clearTimeout(reloj.current), []);
    const cerrar = useCallback(() => { clearTimeout(reloj.current); setT(null); }, []);
    const avisar = useCallback((texto, { tono = 'ok', acciones = [], ms } = {}) => {
        clearTimeout(reloj.current);
        setT({ texto, tono, acciones, k: Date.now() });
        const dura = ms ?? (acciones.length ? 9000 : tono === 'aviso' ? 7000 : 4000);
        if (dura) reloj.current = setTimeout(() => setT(null), dura);
    }, []);
    const nodo = t ? createPortal(
        <div key={t.k} className={`fx-toast${t.tono === 'aviso' ? ' fx-toast-aviso' : ''}`} role="status" aria-live="polite">
            <Ico n={t.tono === 'aviso' ? 'alerta' : 'check'} size={18} />
            <span>{t.texto}</span>
            {t.acciones.map(a => (
                <button key={a.label} type="button" className="fx-toast-acc" onClick={() => { cerrar(); a.onClick?.(); }}>{a.label}</button>
            ))}
            <button type="button" className="fx-toast-x" aria-label="Cerrar el aviso" onClick={cerrar}><Ico n="x" size={16} /></button>
        </div>,
        document.body,
    ) : null;
    return [nodo, avisar, cerrar];
}

/**
 * Abre un PDF del servidor en una pestaña nueva. La ventana se abre YA, dentro del
 * clic (abierta tras el await, el bloqueador de ventanas se la come). Devuelve el
 * texto del error, o null si fue bien.
 */
export async function abrirPdf(url, titulo = 'PDF') {
    const w = window.open('', '_blank');
    try {
        if (w) {
            w.document.title = `${titulo} · PDF`;
            w.document.body.innerHTML = '<p style="font:14px system-ui,sans-serif;color:#666;padding:32px">Preparando el PDF…</p>';
        }
    } catch { /* otra ventana: no se puede escribir en ella */ }
    try {
        const r = await axios.get(url, { responseType: 'blob', timeout: 90000 });
        const u = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
        if (w) w.location.href = u; else window.open(u, '_blank');
        setTimeout(() => URL.revokeObjectURL(u), 120000);
        return null;
    } catch (err) {
        w?.close();
        let texto = 'No se pudo preparar el PDF.';
        try { const j = JSON.parse(await err.response?.data?.text?.()); if (j?.error) texto = j.error; } catch { /* sin cuerpo legible */ }
        return texto;
    }
}

// ── Canales del envío (y el que se usó la última vez) ───────────────────────

const CLAVE_CANAL = 'fx-canal-preferido';

/** Qué canales salen marcados: el preferido si tiene destinatario; si no, el otro. */
export function canalesIniciales({ email, tlf, waReady }) {
    const hayMail = RE_EMAIL.test(String(email || ''));
    const hayWa = digitos(tlf).length >= 9 && waReady !== false;
    const pref = leerLocal(CLAVE_CANAL);
    if (pref === 'whatsapp') return { usaWa: hayWa, usaEmail: !hayWa && hayMail };
    if (pref === 'email') return { usaEmail: hayMail, usaWa: !hayMail && hayWa };
    return { usaWa: hayWa, usaEmail: hayMail };
}
/** Tras un envío que salió: se recuerda por dónde (comodidad de este navegador). */
export function recordarCanales(canales = []) {
    const c = canales.filter(Boolean);
    if (!c.length) return;
    guardarLocal(CLAVE_CANAL, c.length > 1 ? 'ambos' : c[0]);
}

/** Los dos canales como interruptores grandes (44 px), con su destinatario. */
export function CanalesEnvio({ email, tlf, usaEmail, usaWa, onEmail, onWa, waReady, bloqueado = false }) {
    const okEmail = RE_EMAIL.test(String(email || ''));
    const okWa = !!waReady && digitos(tlf).length >= 9;
    return (
        <div className="fx-canales" role="group" aria-label="Por dónde se envía">
            <button type="button" className="fx-canal" aria-pressed={usaWa && okWa} disabled={bloqueado || !okWa} onClick={onWa}>
                <span className="fx-canal-caja"><Ico n="check" size={14} sw={3} /></span>
                WhatsApp
                <small>{okWa ? tlfBonito(tlf) : waReady === false ? 'desconectado' : waReady == null ? 'comprobando…' : 'sin móvil'}</small>
            </button>
            <button type="button" className="fx-canal" aria-pressed={usaEmail && okEmail} disabled={bloqueado || !okEmail} onClick={onEmail}>
                <span className="fx-canal-caja"><Ico n="check" size={14} sw={3} /></span>
                Email
                <small>{okEmail ? email : 'sin email'}</small>
            </button>
        </div>
    );
}

/** «Más opciones», plegado con el resumen de lo que hay dentro. */
export function MasOpciones({ titulo = 'Más opciones', resumen, abierto, onAlternar, children }) {
    const id = useId();
    return (
        <div className="fx-mas">
            <button type="button" className="fx-mas-cab" aria-expanded={abierto} aria-controls={id} onClick={onAlternar}>
                <div><b>{titulo}</b><span>{resumen}</span></div>
                <Ico n="abajo" size={18} />
            </button>
            {abierto && <div className="fx-mas-cuerpo" id={id}>{children}</div>}
        </div>
    );
}

// ── Estado de un presupuesto: icono + palabra ───────────────────────────────

export const ESTADO_PRESU = {
    BORRADOR: { clase: 'borrador', icono: 'lapiz', texto: 'Borrador' },
    ENVIADA: { clase: 'enviada', icono: 'enviar', texto: 'Enviado' },
    ACEPTADA: { clase: 'aceptada', icono: 'check', texto: 'Aceptado' },
    RECHAZADA: { clase: 'rechazada', icono: 'x', texto: 'Rechazado' },
    ANULADA: { clase: 'anulada', icono: 'x', texto: 'Anulado' },
};
export function ChipPresupuesto({ estado }) {
    const e = ESTADO_PRESU[estado] || ESTADO_PRESU.BORRADOR;
    return <span className={`fx-est fx-est-${e.clase}`}><Ico n={e.icono} sw={2.6} />{e.texto}</span>;
}

// ── Añadir partida: buscar en el catálogo, Enter para meterla ───────────────

/**
 * Cada variante es una opción propia («Legalización FV — Nave industrial · 450 €»):
 * se elige de un golpe. Se busca por el CONCEPTO (cualquier palabra, en cualquier
 * orden), la variante o la familia. «+ Partida nueva» sale SIEMPRE (arriba con la
 * caja vacía, al final si se ha escrito) y abre una ficha corta: concepto, precio,
 * IVA y, para un ADMIN, guardarla en el catálogo (sale en Artículos y aquí la
 * próxima vez). Un artículo a 0 € se marca «sin precio»: entra igual, pero hay que
 * ponérselo.
 *
 * @param onLibre   (concepto, { precio, ivaPct, suplido }) — la partida solo en este documento
 * @param onCreado  (artículo) — guardada en el catálogo; sin él no se ofrece guardar
 */
export function BuscadorArticulos({ catalogo, onElegir, onLibre, onCreado = null, autoFocus, bloqueado, entradaRef = null }) {
    const [q, setQ] = useState('');
    const [abierto, setAbierto] = useState(false);
    const [activo, setActivo] = useState(0);
    const [nueva, setNueva] = useState(null);         // el concepto con el que se abre «Partida nueva»
    const { user } = useAuth() || {};
    const puedeGuardar = !!onCreado && getRoleFlags(user).isAdmin;
    const propio = useRef(null);
    const ref = entradaRef || propio;
    const idLista = useId();

    const opciones = useMemo(() => {
        const out = [];
        for (const a of buscarArticulos(catalogo, q)) {
            const vs = Array.isArray(a.variantes) ? a.variantes : [];
            if (vs.length) vs.forEach(v => out.push({ art: a, variante: v, precio: v.precio }));
            else out.push({ art: a, variante: null, precio: a.precio });
            if (out.length >= 14) break;
        }
        const op = { nueva: q.trim() };
        return q.trim() ? [...out, op] : [op, ...out];
    }, [catalogo, q]);

    const elegir = (o) => {
        if (!o) return;
        if (o.nueva != null) { setNueva(o.nueva); setQ(''); setActivo(0); setAbierto(false); return; }
        onElegir(o.art, o.variante);
        setQ(''); setActivo(0);
        ref.current?.focus();
    };
    const cerrarNueva = () => { setNueva(null); setTimeout(() => ref.current?.focus(), 30); };

    const tecla = (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo(i => Math.min(i + 1, opciones.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(i => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (abierto || q.trim()) elegir(opciones[activo]); }
        else if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false); }
    };

    return (
        <div className="fx-busca">
            <input ref={ref} value={q} autoFocus={autoFocus} disabled={bloqueado}
                className="fx-input fx-anadir no-uppercase" role="combobox" aria-expanded={abierto && opciones.length > 0}
                aria-controls={idLista} aria-autocomplete="list" aria-label="Añadir partida"
                onChange={e => { setQ(e.target.value); setAbierto(true); setActivo(0); }}
                onFocus={() => setAbierto(true)}
                onBlur={() => setTimeout(() => setAbierto(false), 150)}
                onKeyDown={tecla}
                placeholder={bloqueado ? `Máximo ${MAX_LINEAS} partidas` : '+ Añadir partida: busca por concepto («certificado», «legalización», «tasa»…) o crea una nueva'} />
            {abierto && !nueva && opciones.length > 0 && (
                <div className="fx-busca-lista" role="listbox" id={idLista}>
                    {opciones.map((o, i) => (
                        <button key={o.nueva != null ? '__nueva' : `${o.art.id}-${o.variante?.id || ''}`} type="button" role="option"
                            aria-selected={i === activo} tabIndex={-1}
                            className={`fx-busca-op${o.nueva != null ? ` fx-busca-nueva${q.trim() ? ' fx-busca-libre' : ''}` : ''}`}
                            onMouseDown={e => { e.preventDefault(); elegir(o); }}
                            onMouseEnter={() => setActivo(i)}>
                            {o.nueva != null ? (
                                <span><Ico n="mas" size={16} sw={2.6} /> Partida nueva{o.nueva ? <>: <b>«{o.nueva}»</b></> : ''} <em>— concepto, precio e IVA{puedeGuardar ? ', y se guarda en el catálogo' : ''}</em></span>
                            ) : (
                                <>
                                    <span style={{ minWidth: 0 }}>
                                        <b>{o.art.nombre}</b>
                                        {o.variante && <i> — {o.variante.nombre}</i>}
                                        <small>{o.art.familia || ''}</small>
                                        {o.art.suplido && <small>suplido</small>}
                                        {Array.isArray(o.art.arrastra) && o.art.arrastra.length > 0 && <small>+ tasa</small>}
                                    </span>
                                    {Number(o.precio) > 0
                                        ? <span className="fx-busca-precio">{eur(o.precio)}</span>
                                        : <span className="fx-busca-precio fx-busca-cero">sin precio</span>}
                                </>
                            )}
                        </button>
                    ))}
                </div>
            )}
            {nueva != null && (
                <PartidaNueva concepto={nueva} catalogo={catalogo} puedeGuardar={puedeGuardar} onCancelar={cerrarNueva}
                    onLibre={(c, datos) => { onLibre(c, datos); cerrarNueva(); }}
                    onCreado={(art) => { onCreado(art); cerrarNueva(); }} />
            )}
        </div>
    );
}

/**
 * La ficha de «Partida nueva»: concepto, precio sin IVA, IVA (o suplido) y, para un
 * ADMIN, «Guardarla en el catálogo» (marcada: lo normal es que se vuelva a usar).
 * Guardada, entra como artículo (con su id: cuenta usos y se encuentra al buscar);
 * sin guardar, solo en este documento. Un concepto que YA está en el catálogo no
 * se duplica: se dice cuál es.
 */
function PartidaNueva({ concepto, catalogo, puedeGuardar, onLibre, onCreado, onCancelar }) {
    const [f, setF] = useState(() => ({ nombre: concepto, precio: '', iva: '21', familia: 'OTROS', guardar: puedeGuardar }));
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const suplido = f.iva === 'S';
    const yaEsta = useMemo(() => {
        const n = normalizarTexto(f.nombre);
        return n ? (catalogo || []).find(a => a.activo !== false && normalizarTexto(a.nombre) === n) || null : null;
    }, [catalogo, f.nombre]);
    const guardar = puedeGuardar && f.guardar && !yaEsta;
    const poner = (p) => { setF(v => ({ ...v, ...p })); setError(null); };

    const anadir = async () => {
        const nombre = f.nombre.trim();
        if (!nombre) { setError('Escribe el concepto.'); return; }
        const precio = aNumero(f.precio);
        if (String(f.precio).trim() !== '' && precio == null) { setError('El precio no es un número.'); return; }
        const datos = { precio: precio ?? 0, ivaPct: suplido ? 0 : Number(f.iva), suplido };
        if (!guardar) { onLibre(nombre, datos); return; }
        setEnviando(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/articulos`, {
                nombre, familia: f.familia, precio: datos.precio, iva_pct: datos.ivaPct, suplido,
                variantes: [], arrastra: [], genera: null, activo: true,
            });
            onCreado(data);
        } catch (err) {
            setEnviando(false);
            setError(err.response?.status === 403
                ? 'Solo un administrador guarda en el catálogo: quita la marca y entra solo en este documento.'
                : err.response?.data?.error || 'No se pudo guardar en el catálogo.');
        }
    };
    const teclas = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); anadir(); }
        else if (e.key === 'Escape') { e.stopPropagation(); onCancelar(); }
    };

    return (
        <div className="fx-pnueva fx-in" role="group" aria-label="Partida nueva">
            <div className="fx-pnueva-cab">
                <b>Partida nueva</b>
                <button type="button" className="fx-link" onClick={onCancelar} disabled={enviando}>Cancelar</button>
            </div>
            <label className="fx-campo"><span>Concepto · sale así en el PDF</span>
                <input className="fx-input no-uppercase" value={f.nombre} autoFocus={!concepto} onKeyDown={teclas}
                    onChange={e => poner({ nombre: e.target.value })} placeholder="p. ej. Memoria técnica de climatización" />
            </label>
            <div className="fx-rejilla">
                <label className="fx-campo"><span>Precio sin IVA (€)</span>
                    <input className="fx-input fx-num" value={f.precio} inputMode="decimal" autoFocus={!!concepto} onKeyDown={teclas}
                        onChange={e => poner({ precio: e.target.value })} placeholder="0,00" />
                </label>
                <label className="fx-campo"><span>IVA</span>
                    <select className="fx-select" value={f.iva}
                        onChange={e => poner({ iva: e.target.value, ...(e.target.value === 'S' && f.familia === 'OTROS' ? { familia: 'TASAS' } : {}) })}>
                        {IVAS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                    </select>
                </label>
                {guardar && (
                    <label className="fx-campo"><span>Familia</span>
                        <select className="fx-select" value={f.familia} onChange={e => poner({ familia: e.target.value })}>
                            {FAMILIAS.map(x => <option key={x} value={x}>{x.length <= 3 ? x : x.charAt(0) + x.slice(1).toLowerCase()}</option>)}
                        </select>
                    </label>
                )}
            </div>
            {puedeGuardar && (yaEsta ? (
                <p className="fx-ayuda">Ya está en el catálogo: «{yaEsta.nombre}» ({eur(yaEsta.precio)}). Búscala para usar esa; esta entra solo en este documento.</p>
            ) : (
                <label className="fx-check fx-pnueva-check">
                    <input type="checkbox" checked={f.guardar} onChange={e => poner({ guardar: e.target.checked })} />
                    <span>Guardarla en el catálogo<small>Sale en Artículos y al buscar la próxima vez.</small></span>
                </label>
            ))}
            {error && <p className="fx-error"><Ico n="alerta" size={15} />{error}</p>}
            <button type="button" className="fx-btn fx-btn-pri fx-pnueva-ok" onClick={anadir} disabled={enviando}>
                {enviando ? 'Guardando…' : <><Ico n="mas" size={18} />Añadir{guardar ? ' y guardar' : ''}</>}
            </button>
        </div>
    );
}

// ── Una partida, compacta: «concepto — uds × precio = importe»; se despliega al tocarla ──

/**
 * @param abierta / onAlternar  si el padre lleva cuál está abierta (una a la vez);
 *        sin ellos, la fila lleva su propio estado.
 * @param permiteNegativo  rectificativas: las unidades van en negativo.
 */
export function FilaLinea({
    l, art, editable, focoPrecio, onCambiar, onQuitar, onSubir, onBajar, primera, ultima,
    abierta: abiertaProp, onAlternar, permiteNegativo = false,
}) {
    const [abiertaPropia, setAbiertaPropia] = useState(!!focoPrecio);
    const abierta = editable && (abiertaProp ?? abiertaPropia);
    const alternar = () => (onAlternar ? onAlternar() : setAbiertaPropia(v => !v));
    const [verDetalle, setVerDetalle] = useState(!!l.detalle);
    const vs = Array.isArray(art?.variantes) ? art.variantes : [];
    const ivaValor = l.suplido ? 'S' : String(l.ivaPct);
    const uds = Number(l.uds) || 0;
    const precio = Number(l.precio) || 0;
    const sinPrecio = !precio && !l.suplido;

    const cambiarIva = (v) => onCambiar(v === 'S'
        ? { suplido: true, ivaPct: 0, dtoPct: 0 }
        : { suplido: false, ivaPct: Number(v) });
    const cambiarVariante = (id) => {
        const v = varianteDe(art, id);
        onCambiar({ variante_id: v?.id ?? null, descripcion: descripcionArticulo(art, v), precio: Number(v?.precio ?? art.precio) || 0 });
    };
    const udsTxt = String(uds).replace('.', ',');

    return (
        <div className={`fx-pl${l.arrastrada_de ? ' fx-pl-arr' : ''}${abierta ? ' fx-pl-abierta' : ''}`}>
            <button type="button" className="fx-pl-res" onClick={alternar} disabled={!editable} aria-expanded={editable ? abierta : undefined}
                title={l.arrastrada_de ? 'Va con la partida de arriba' : undefined}>
                <span className="fx-pl-con">{String(l.descripcion || '').trim() || 'Partida sin concepto'}</span>
                <span className="fx-pl-cal">
                    {udsTxt} × {sinPrecio ? <em>sin precio</em> : eur(precio)}
                    {Number(l.dtoPct) > 0 && !l.suplido ? ` · −${String(l.dtoPct).replace('.', ',')} %` : ''}
                    {l.suplido ? ' · suplido, sin IVA' : ` · IVA ${l.ivaPct} %`}
                </span>
                {l.detalle && !abierta && <span className="fx-pl-det">{l.detalle}</span>}
                <span className="fx-pl-imp">{eur(l.importe)}</span>
            </button>
            {abierta && (
                <div className="fx-pl-edit">
                    <input value={l.descripcion} onChange={e => onCambiar({ descripcion: e.target.value })}
                        className="fx-input no-uppercase" placeholder="Concepto" aria-label="Concepto de la partida" />
                    {vs.length > 0 && (
                        <select value={l.variante_id || ''} onChange={e => cambiarVariante(e.target.value)} className="fx-select" aria-label="Variante">
                            <option value="">— Sin variante —</option>
                            {vs.map(v => <option key={v.id} value={v.id}>{v.nombre} · {eur(v.precio)}</option>)}
                        </select>
                    )}
                    {(verDetalle || l.detalle) && (
                        <textarea value={l.detalle || ''} rows={2} onChange={e => onCambiar({ detalle: e.target.value })}
                            placeholder="Detalle que sale debajo, en gris (p. ej. nave de 1.200 m² en el polígono)"
                            className="fx-area no-uppercase" style={{ minHeight: 64 }} aria-label="Detalle de la partida" />
                    )}
                    <div className="fx-pl-nums">
                        <label className="fx-campo"><span>Uds</span>
                            <CampoDecimal valor={l.uds} permiteNegativo={permiteNegativo} onCambio={n => onCambiar({ uds: n })} alVaciar={() => {}} className="fx-input fx-num" />
                        </label>
                        <label className="fx-campo"><span>Precio sin IVA</span>
                            <CampoDecimal valor={l.precio} autoFocus={focoPrecio}
                                onCambio={n => onCambiar({ precio: n })} alVaciar={() => onCambiar({ precio: 0 })} className={`fx-input fx-num${sinPrecio ? ' fx-mal' : ''}`} />
                        </label>
                        <label className="fx-campo"><span>Dto %</span>
                            <CampoDecimal valor={l.dtoPct} disabled={l.suplido}
                                onCambio={n => onCambiar({ dtoPct: Math.min(100, n) })} alVaciar={() => onCambiar({ dtoPct: 0 })} className="fx-input fx-num" />
                        </label>
                        <label className="fx-campo"><span>IVA</span>
                            <select value={ivaValor} onChange={e => cambiarIva(e.target.value)} className="fx-select">
                                {IVAS.map(o => <option key={o.v} value={o.v}>{o.t}</option>)}
                            </select>
                        </label>
                    </div>
                    <div className="fx-pl-herr">
                        {!l.detalle && !verDetalle
                            ? <button type="button" className="fx-link" onClick={() => setVerDetalle(true)}>+ Detalle</button>
                            : <span style={{ marginRight: 'auto' }} />}
                        <button type="button" className="fx-ico-btn" onClick={onSubir} disabled={primera} aria-label="Subir la partida" title="Subir"><Ico n="arriba" size={18} /></button>
                        <button type="button" className="fx-ico-btn" onClick={onBajar} disabled={ultima} aria-label="Bajar la partida" title="Bajar"><Ico n="abajo" size={18} /></button>
                        <button type="button" className="fx-ico-btn fx-pl-quitar" onClick={onQuitar}
                            aria-label={l.arrastrada_de ? 'Quitar esta partida' : 'Quitar la partida (y lo que arrastra)'}
                            title={l.arrastrada_de ? 'Quitar esta partida' : 'Quitar (y lo que arrastra)'}><Ico n="borrar" size={18} /></button>
                        <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={alternar}>Listo</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ═══ El editor ════════════════════════════════════════════════════════════════

/** El destino del mensaje: con el desvío activo, la persona de contacto manda. */
function destinoDe(c) {
    if (!c) return { email: '', tlf: '', nombre: '' };
    if (c.notificaciones_contacto_activas && (c.persona_contacto_tlf || c.persona_contacto_email)) {
        return {
            email: c.persona_contacto_email || c.email || '',
            tlf: c.persona_contacto_tlf || c.tlf || '',
            nombre: c.persona_contacto_nombre || nombreDe(c),
        };
    }
    const k = contactoCliente(c);
    return { email: k.email || '', tlf: k.telefono || '', nombre: nombreDe(c) };
}

const nuevaClave = () => Math.random().toString(36).slice(2, 10);
// Las cifras de cada línea las calcula el servidor: no se mandan.
const CIFRAS_LINEA = ['bruto', 'descuento', 'subtotal', 'iva', 'importe'];
export const sinCifras = (l) => Object.fromEntries(Object.entries(l).filter(([k]) => !CIFRAS_LINEA.includes(k)));
const lineaLibre = (descripcion) => ({
    key: nuevaClave(), articulo_id: null, appsheet_id: null, variante_id: null,
    descripcion, detalle: '', uds: 1, precio: 0, dtoPct: 0, ivaPct: 21, suplido: false, genera: null, arrastrada_de: null,
});

/**
 * @param presupuestoId  abre uno existente (sin él, uno nuevo)
 * @param inicial        para uno nuevo: { genera: 'CEE_UNICO'|'CEE_DOBLE' } mete ese
 *                       artículo de entrada (el botón de CEE directos), { cliente } lo
 *                       preselecciona, { prescriptorId }.
 */
export function PresupuestoModal({ isOpen, onClose, onSaved, presupuestoId = null, inicial = null, prescriptores = [], principal: accionPrincipal = null }) {
    const { showConfirm } = useModal();
    const [catalogo, setCatalogo] = useState([]);
    const [errorCatalogo, setErrorCatalogo] = useState(null);
    const [cargando, setCargando] = useState(!!presupuestoId);
    const [errorCarga, setErrorCarga] = useState(null);

    // Lo que identifica al presupuesto una vez guardado.
    const [id, setId] = useState(presupuestoId);
    const [numero, setNumero] = useState(null);
    const [estado, setEstado] = useState(null);
    const [creadoAt, setCreadoAt] = useState(null);
    const [urlAceptacion, setUrlAceptacion] = useState(null);
    const [antiguo, setAntiguo] = useState(false);
    const [numeroExpediente, setNumeroExpediente] = useState(null);
    const [vistoAt, setVistoAt] = useState(null);

    const [lineas, setLineas] = useState([]);
    const [focoPrecio, setFocoPrecio] = useState(null);
    const [lineaAbierta, setLineaAbierta] = useState(null);

    const [cliente, setCliente] = useState(null);
    const [modoCliente, setModoCliente] = useState('buscar');      // buscar | existente | rapido
    const [nombreRapido, setNombreRapido] = useState('');
    const [rapidoDeWa, setRapidoDeWa] = useState(false);
    const [prescriptorId, setPrescriptorId] = useState(null);

    const [verMas, setVerMas] = useState(false);
    const [refCatastral, setRefCatastral] = useState('');
    const [inmueble, setInmueble] = useState(INMUEBLE_VACIO);
    const [pistaMunicipio, setPistaMunicipio] = useState(null);
    const [catastro, setCatastro] = useState({ cargando: false, msg: null, error: null });
    const [observaciones, setObservaciones] = useState('');

    const [email, setEmail] = useState('');
    const [tlf, setTlf] = useState('');
    const [usaEmail, setUsaEmail] = useState(false);
    const [usaWa, setUsaWa] = useState(false);
    const [waReady, setWaReady] = useState(null);
    const [mensaje, setMensaje] = useState('');
    const [mensajeTocado, setMensajeTocado] = useState(false);
    const [editarMensaje, setEditarMensaje] = useState(false);
    const [editarDestino, setEditarDestino] = useState(false);

    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);                       // error de guardar/duplicar, junto al pie
    const [marcado, setMarcado] = useState(null);                    // el bloque al que se ha saltado por un «falta…»
    const [sucio, setSucio] = useState(false);
    const [preview, setPreview] = useState(false);
    const [menuPie, setMenuPie] = useState(null);
    const [preguntando, setPreguntando] = useState(false);
    const [fase, setFase] = useState(null);           // null | 'sending' | 'done'
    const [resultado, setResultado] = useState({ ok: false, items: [], text: '' });
    const presetHecho = useRef(false);
    const buscadorRef = useRef(null);
    const nombreRef = useRef(null);
    const tlfRef = useRef(null);
    const clienteRef = useRef(null);
    const envioRef = useRef(null);
    const errorRef = useRef(null);
    const [toast, avisar] = useAvisoFx();

    // Catálogo y estado de WhatsApp, una vez por apertura.
    useEffect(() => {
        if (!isOpen) return;
        axios.get(`${API}/articulos`).then(r => setCatalogo(Array.isArray(r.data) ? r.data : (r.data?.articulos || [])))
            .catch(err => setErrorCatalogo(err.response?.data?.error || 'No se pudo leer el catálogo de artículos'));
        axios.get('/api/whatsapp/status').then(r => setWaReady(!!r.data?.ready)).catch(() => setWaReady(false));
    }, [isOpen]);

    // Con WhatsApp desconectado, el canal preferido no puede ser él: se ofrece el email.
    useEffect(() => {
        if (waReady !== false || !usaWa) return;
        setUsaWa(false);
        if (RE_EMAIL.test(email)) setUsaEmail(true);
    }, [waReady, usaWa, email]);

    // Uno existente: se carga entero.
    useEffect(() => {
        if (!isOpen || !presupuestoId) return;
        let vivo = true;
        setCargando(true);
        axios.get(`${API}/presupuestos/${presupuestoId}`).then(({ data: d }) => {
            if (!vivo) return;
            setId(d.id); setNumero(d.numero); setEstado(d.estado); setCreadoAt(d.created_at);
            setUrlAceptacion(d.url_aceptacion || null); setNumeroExpediente(d.numero_expediente || null);
            setVistoAt(d.visto_at || null);
            const viejo = !Array.isArray(d.lineas);
            setAntiguo(viejo);
            setLineas((viejo ? d.lineas_calculadas : d.lineas || []).map(l => ({ ...l, key: l.key || nuevaClave() })));
            if (d.cliente) { setCliente(d.cliente); setModoCliente('existente'); }
            setPrescriptorId(d.prescriptor_id || null);
            setInmueble({
                direccion: d.direccion || '', codigo_postal: d.codigo_postal || '', ccaa: d.ccaa || '',
                provincia: d.provincia || '', provincia_cod: '', municipio: d.municipio || '',
            });
            setRefCatastral(d.ref_catastral || '');
            setObservaciones(observacionesCliente(d.observaciones));
            const dest = d.destino || destinoDe(d.cliente);
            setEmail(dest.email || ''); setTlf(dest.tlf || '');
            const c = canalesIniciales({ email: dest.email, tlf: dest.tlf, waReady: null });
            setUsaEmail(c.usaEmail); setUsaWa(c.usaWa);
            setCargando(false);
        }).catch(err => {
            if (!vivo) return;
            setErrorCarga(err.response?.data?.error || 'No se pudo abrir el presupuesto');
            setCargando(false);
        });
        return () => { vivo = false; };
    }, [isOpen, presupuestoId]);

    // Uno nuevo desde CEE directos: el certificado entra solo, con su tasa.
    useEffect(() => {
        if (!isOpen || presupuestoId || presetHecho.current || !catalogo.length) return;
        presetHecho.current = true;
        if (inicial?.cliente) {
            setCliente(inicial.cliente); setModoCliente('existente');
            const d = destinoDe(inicial.cliente);
            setEmail(d.email); setTlf(d.tlf);
            const c = canalesIniciales({ email: d.email, tlf: d.tlf, waReady: null });
            setUsaEmail(c.usaEmail); setUsaWa(c.usaWa);
        }
        if (inicial?.prescriptorId) setPrescriptorId(inicial.prescriptorId);
        if (inicial?.genera) {
            const art = catalogo.find(a => a.activo !== false && a.genera === inicial.genera);
            if (art) setLineas(lineasDeArticulo(art, catalogo));
        }
    }, [isOpen, presupuestoId, inicial, catalogo]);

    const totales = useMemo(() => totalesLineas(lineas), [lineas]);
    const porId = useMemo(() => new Map(catalogo.map(a => [String(a.id), a])), [catalogo]);
    const abreCee = !!alcanceDeLineas(lineas);

    const borrador = useMemo(() => ({
        lineas,
        numero: numero || null,
        created_at: creadoAt,
        direccion: inmueble.direccion.trim() || null,
        codigo_postal: inmueble.codigo_postal.trim() || null,
        municipio: inmueble.municipio.trim() || null,
        provincia: inmueble.provincia.trim() || null,
        ccaa: inmueble.ccaa.trim() || null,
        ref_catastral: refCatastral.trim().toUpperCase() || null,
        observaciones: observaciones.trim(),
    }), [lineas, numero, creadoAt, inmueble, refCatastral, observaciones]);

    const destino = useMemo(() => (modoCliente === 'rapido'
        ? { email, tlf, nombre: nombreRapido.trim() }
        : destinoDe(cliente)), [modoCliente, cliente, email, tlf, nombreRapido]);

    // El mensaje se compone solo mientras no se edite. Sin número todavía, va con
    // marcadores que el servidor cambia por el número y el enlace reales.
    const mensajeAuto = useMemo(() => mensajeOferta({
        nombre: destino.nombre, numero: numero || '(nº de presupuesto)', total: totales.total,
        tasas: totales.suplidos, url: urlAceptacion || '(enlace para aceptar)', inmueble: direccionInmueble(borrador),
        partidas: partidasDe(lineas), abreCee,
    }), [destino.nombre, numero, totales, urlAceptacion, borrador, lineas, abreCee]);

    // Mientras la pregunta está abierta, el Esc es suyo (es su «no»): no puede
    // cerrar también el editor.
    const preguntar = useCallback(async (...args) => {
        setPreguntando(true);
        try { return await showConfirm(...args); } finally { setPreguntando(false); }
    }, [showConfirm]);

    const editable = !cargando && !errorCarga && !antiguo && (!estado || EDITABLES.includes(estado));

    const cerrar = useCallback(async () => {
        if (fase) return;
        if (editable && sucio) {
            const ok = await preguntar(
                id ? 'Lo que has cambiado desde el último guardado se pierde.' : 'Este presupuesto todavía no está guardado: se pierde entero (no se ha guardado solo, para no gastar un número).',
                'Cerrar sin guardar', 'warning', { confirmar: 'Cerrar sin guardar', cancelar: 'Seguir editando' },
            );
            if (!ok) return;
        }
        onClose?.();
    }, [fase, editable, sucio, id, preguntar, onClose]);

    if (!isOpen) return null;

    // ── Derivados ────────────────────────────────────────────────────────────
    const enviable = !cargando && !errorCarga && (!estado || EDITABLES.includes(estado));
    const tocar = () => { setSucio(true); setError(null); };
    const mensajeVisible = mensajeTocado ? mensaje : mensajeAuto;
    const clientePdf = modoCliente === 'rapido'
        ? { nombre_razon_social: nombreRapido.trim().toUpperCase(), tlf: tlf.trim(), email: email.trim() }
        : (cliente || {});
    const hayCliente = modoCliente === 'rapido' ? !!nombreRapido.trim() : modoCliente === 'existente' && !!cliente;
    const hayPartidas = lineas.some(l => String(l.descripcion || '').trim());
    const canEmail = usaEmail && RE_EMAIL.test(email);
    const canWa = usaWa && !!waReady && digitos(tlf).length >= 9;
    const canales = [...(canWa ? ['whatsapp'] : []), ...(canEmail ? ['email'] : [])];
    const ocupado = guardando || !!fase;

    // Lo que falta para enviar, y a qué bloque se salta.
    const falta = !hayCliente ? { clave: modoCliente === 'rapido' ? 'nombre' : 'cliente', texto: modoCliente === 'rapido' ? 'Pon el nombre del cliente' : 'Elige el cliente' }
        : !hayPartidas ? { clave: 'partida', texto: 'Añade una partida' }
            : !(totales.total > 0) ? { clave: 'partida', texto: 'El total está a 0' }
                : !canales.length ? { clave: 'canal', texto: 'Elige por dónde se envía' }
                    : null;
    const marca = marcado && falta?.clave === marcado ? falta : null;

    // ── Edición ──────────────────────────────────────────────────────────────
    const anadirArticulo = (art, variante) => {
        if (lineas.length >= MAX_LINEAS) return;
        setLineas(ls => [...ls, ...lineasDeArticulo(art, catalogo, { varianteId: variante?.id ?? null })]);
        tocar();
    };
    // De «Partida nueva» sin guardar en el catálogo: con su precio e IVA, o a por el precio.
    const anadirLibre = (texto, datos = null) => {
        if (lineas.length >= MAX_LINEAS) return;
        const l = { ...lineaLibre(texto), ...(datos || {}) };
        setLineas(ls => [...ls, l]);
        if (!(Number(l.precio) > 0) && !l.suplido) { setFocoPrecio(l.key); setLineaAbierta(l.key); }
        tocar();
    };
    // Guardada en el catálogo: entra como cualquier artículo, y ya se encuentra al buscar.
    const anadirCreado = (art) => {
        setCatalogo(c => [...c, art]);
        anadirArticulo(art);
    };
    const cambiarLinea = (key, patch) => { setLineas(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l))); tocar(); };
    // Quitar una partida quita también lo que arrastra (la tasa de su CEE).
    const quitarLinea = (key) => { setLineas(ls => ls.filter(l => l.key !== key && l.arrastrada_de !== key)); setLineaAbierta(null); tocar(); };
    const moverLinea = (i, d) => {
        setLineas(ls => {
            const j = i + d;
            if (j < 0 || j >= ls.length) return ls;
            const c = [...ls];
            [c[i], c[j]] = [c[j], c[i]];
            return c;
        });
        tocar();
    };

    const ponerDestino = (d) => {
        setEmail(d.email || ''); setTlf(d.tlf || '');
        const c = canalesIniciales({ email: d.email, tlf: d.tlf, waReady });
        setUsaEmail(c.usaEmail); setUsaWa(c.usaWa);
        setEditarDestino(false);
    };
    const irAPartidas = () => { if (!lineas.length) setTimeout(() => buscadorRef.current?.focus(), 60); };
    const elegirCliente = (c) => {
        setCliente(c);
        setModoCliente(c ? 'existente' : 'buscar');
        ponerDestino(destinoDe(c));
        tocar();
        if (c) irAPartidas();
    };
    const nuevoRapido = ({ nombre, tlf: t, prescriptorId: pid, deWhatsapp }) => {
        setNombreRapido(nombre || '');
        setRapidoDeWa(!!deWhatsapp);
        setCliente(null);
        ponerDestino({ email: '', tlf: t || '' });
        if (pid && !prescriptorId) setPrescriptorId(pid);
        setModoCliente('rapido');
        tocar();
        // De WhatsApp ya trae nombre y móvil: a las partidas. Tecleado: falta el móvil.
        if (deWhatsapp) irAPartidas(); else setTimeout(() => tlfRef.current?.focus(), 60);
    };
    const volverABuscar = () => {
        setModoCliente('buscar'); setCliente(null); setNombreRapido(''); setRapidoDeWa(false);
        setEmail(''); setTlf(''); setUsaEmail(false); setUsaWa(false);
        tocar();
    };
    const cambiarTlfRapido = (v) => {
        setTlf(v);
        if (digitos(v).length >= 9 && !usaEmail && waReady !== false) setUsaWa(true);
        tocar();
    };

    const traerDelCatastro = async () => {
        setCatastro({ cargando: true, msg: null, error: null });
        try {
            const r = await traerDireccionCatastral(refCatastral);
            setRefCatastral(r.rc);
            if (!r.campos) setInmueble(v => ({ ...v, direccion: r.direccion }));
            else { setInmueble(v => ({ ...v, ...r.campos, municipio: '' })); setPistaMunicipio(r.municipioHint); }
            setCatastro({ cargando: false, error: null, msg: r.aviso });
            tocar();
        } catch (err) {
            setCatastro({ cargando: false, msg: null, error: err.message });
        }
    };

    /** Lo que se guarda (el servidor vuelve a sanear las líneas y recalcula). */
    const datos = () => ({
        lineas: lineas.map(sinCifras),
        cliente_id: modoCliente === 'existente' ? cliente?.id_cliente : null,
        cliente_nuevo: modoCliente === 'rapido'
            ? { nombre: nombreRapido.trim(), tlf: tlf.trim() || null, email: email.trim() || null }
            : null,
        prescriptor_id: prescriptorId,
        direccion: borrador.direccion, codigo_postal: borrador.codigo_postal, municipio: borrador.municipio,
        provincia: borrador.provincia, ccaa: borrador.ccaa, ref_catastral: borrador.ref_catastral,
        observaciones: borrador.observaciones,
    });

    /** Tras guardar: lo que devuelve el servidor manda (número, cliente recién creado). */
    const absorber = (p) => {
        if (!p) return;
        setId(p.id); setNumero(p.numero); setEstado(p.estado); setCreadoAt(p.created_at);
        setUrlAceptacion(p.url_aceptacion || null);
        // El alta rápida ya creó la ficha: a partir de aquí es un cliente existente
        // (si no, cada guardado crearía otra).
        if (p.cliente) { setCliente(p.cliente); setModoCliente('existente'); setNombreRapido(''); }
        setSucio(false);
    };

    const mostrarError = (texto) => {
        setError(texto);
        setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 40);
    };

    const guardar = async () => {
        if (!hayCliente || !hayPartidas) { saltarA(!hayCliente ? (modoCliente === 'rapido' ? 'nombre' : 'cliente') : 'partida'); return; }
        setGuardando(true); setError(null);
        try {
            if (!id) {
                const { data } = await axios.post(`${API}/presupuestos`, datos());
                absorber(data.presupuesto);
                avisar(`Guardado como ${data.presupuesto?.numero || 'borrador'}. No se ha enviado nada.`);
                onSaved?.(data.presupuesto);
            } else {
                const { data } = await axios.put(`${API}/presupuestos/${id}`, datos());
                absorber(data);
                avisar(estado === 'ENVIADA' ? 'Guardado. El cliente verá la versión nueva en su enlace; reenvíalo si quieres avisarle.' : 'Cambios guardados.');
                onSaved?.(data);
            }
        } catch (err) {
            mostrarError(err.response?.data?.error || 'No se pudo guardar.');
        } finally {
            setGuardando(false);
        }
    };

    /** «Falta…»: en vez de un botón muerto, se salta al campo y se marca. */
    function saltarA(clave) {
        setMarcado(clave);
        const foco = {
            cliente: () => clienteRef.current?.querySelector('input'),
            nombre: () => nombreRef.current,
            partida: () => buscadorRef.current,
            canal: () => (RE_EMAIL.test(email) || digitos(tlf).length >= 9 ? null : envioRef.current?.querySelector('input')),
        }[clave]?.();
        const bloque = { cliente: clienteRef, nombre: clienteRef, partida: buscadorRef, canal: envioRef }[clave]?.current;
        if (clave === 'canal' && !RE_EMAIL.test(email) && digitos(tlf).length < 9) setEditarDestino(true);
        bloque?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        setTimeout(() => (foco || (clave === 'canal' ? envioRef.current?.querySelector('input') : null))?.focus?.({ preventScroll: true }), 120);
    }

    const enviar = async () => {
        if (falta) { saltarA(falta.clave); return; }
        setFase('sending');
        const envio = {
            canales, email: email.trim(), tlf: tlf.trim(),
            // Editado a mano, sale tal cual (el servidor cambia los marcadores); si no,
            // lo compone él con el número y el enlace de verdad.
            mensaje: mensajeTocado ? mensaje : null,
        };
        try {
            let data;
            if (!id) {
                ({ data } = await axios.post(`${API}/presupuestos`, { ...datos(), envio }, { timeout: 120000 }));
                absorber(data.presupuesto);
            } else {
                if (editable && sucio) absorber((await axios.put(`${API}/presupuestos/${id}`, datos())).data);
                ({ data } = await axios.post(`${API}/presupuestos/${id}/enviar`, envio, { timeout: 120000 }));
                setEstado('ENVIADA');
            }
            const items = Object.entries(data.resultados || {}).map(([k, r]) => ({
                texto: r.ok ? `${k === 'email' ? 'Email' : 'WhatsApp'} → ${r.to}` : `${k === 'email' ? 'Email' : 'WhatsApp'}: ${r.error}`,
                tono: r.ok ? 'ok' : 'aviso',
            }));
            const salieron = Object.entries(data.resultados || {}).filter(([, r]) => r.ok).map(([k]) => k);
            recordarCanales(salieron.length ? salieron : canales);
            setResultado({ ok: true, items, text: '' });
            setFase('done');
            onSaved?.(data.presupuesto || null);
        } catch (err) {
            const r = err.response?.data;
            // Creado pero sin salir por ningún canal: queda como borrador, y se reintenta
            // sobre ESE (no se crea otro).
            if (r?.presupuesto) absorber(r.presupuesto);
            const det = r?.resultados ? Object.entries(r.resultados).map(([k, v]) => `${k === 'email' ? 'Email' : 'WhatsApp'}: ${v.error || 'ok'}`).join(' · ') : '';
            const base = err.response?.status === 404 && typeof r !== 'object'
                ? 'El servidor no reconoce los presupuestos: hay que reiniciar el backend para que cargue la versión nueva.'
                : !err.response ? 'No hay conexión con el servidor.'
                    : (r?.error || `No se pudo enviar (error ${err.response.status}).`);
            setResultado({ ok: false, items: [], text: [base, det].filter(Boolean).join(' — ') });
            setFase('done');
            onSaved?.(null);
        }
    };

    const duplicar = async () => {
        setGuardando(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/presupuestos/${id}/duplicar`);
            const p = data.presupuesto;
            absorber(p);
            setAntiguo(false);
            setLineas((p?.lineas || []).map(l => ({ ...l, key: l.key || nuevaClave() })));
            setNumeroExpediente(null); setVistoAt(null);
            avisar(`Duplicado como ${data.numero || p?.numero || 'borrador nuevo'}: edítalo y envíalo.`);
            onSaved?.(p);
        } catch (err) {
            mostrarError(err.response?.data?.error || 'No se pudo duplicar.');
        } finally {
            setGuardando(false);
        }
    };

    // El PDF tal como lo rasteriza el servidor (el que recibe el cliente), de lo que
    // hay ahora en el editor y sin guardar nada.
    const descargarPdf = async () => {
        try {
            const r = await axios.post(`${API}/presupuestos/vista-previa/pdf`, { ...borrador, id, cliente: clientePdf },
                { responseType: 'blob', timeout: 90000 });
            const u = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = u; a.download = `Presupuesto ${numero || 'BORRADOR'}.pdf`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(u), 60000);
            return null;
        } catch (err) {
            let texto = 'No se pudo preparar el PDF.';
            try { const j = JSON.parse(await err.response?.data?.text?.()); if (j?.error) texto = j.error; } catch { /* sin cuerpo legible */ }
            return texto;
        }
    };

    const copiarEnlace = async () => {
        if (!urlAceptacion) return;
        try { await navigator.clipboard.writeText(urlAceptacion); avisar('Enlace de aceptación copiado.'); }
        catch { avisar(urlAceptacion, { tono: 'aviso', ms: 0 }); }
    };

    // ── Pintar ───────────────────────────────────────────────────────────────
    const titulo = numero || 'Nuevo presupuesto';
    const verbo = estado === 'ENVIADA' ? 'Reenviar' : 'Enviar';
    const porDonde = canales.length === 2 ? 'por WhatsApp y email' : canales[0] === 'whatsapp' ? 'por WhatsApp' : canales[0] === 'email' ? 'por email' : '';
    const nombrePresc = (pid) => {
        const p = prescriptores.find(x => String(x.id_empresa) === String(pid));
        return p ? (p.acronimo || p.razon_social) : null;
    };
    const resumenMas = [
        direccionInmueble(borrador) || refCatastral ? `Inmueble: ${direccionInmueble(borrador) || refCatastral}` : 'Sin inmueble',
        prescriptorId ? `Trae: ${nombrePresc(prescriptorId) || 'un prescriptor'}` : 'Directo',
    ].join(' · ');
    const dVisto = diasDesde(vistoAt);

    const sub = !estado ? 'Nace borrador: no sale nada hasta que lo envíes. El cliente recibe el PDF y un enlace para aceptarlo.'
        : antiguo && EDITABLES.includes(estado) ? 'Oferta antigua de CEE: se reenvía tal cual; para cambiarla, duplícala (nace con partidas).'
            : !EDITABLES.includes(estado) ? `Ya no se edita: duplícalo para hacer otro igual${antiguo ? ' (nace con partidas)' : ''}.`
                : estado === 'ENVIADA'
                    ? <>Enviado{vistoAt ? <> · <b>visto {haceTxt(dVisto)}</b></> : ' · el cliente aún no lo ha abierto'}. Si lo cambias, su enlace enseña la versión nueva.</>
                    : 'Borrador guardado: todavía no ha salido nada.';

    const itemsMenu = [
        editable && { label: id ? 'Guardar cambios' : 'Guardar borrador', icono: ICO_EXTRA.guardar, onClick: guardar, disabled: ocupado || (!!id && !sucio), detalle: id ? null : 'Le da número; no envía nada' },
        id && { label: 'Duplicar', icono: ICO_EXTRA.copiar, onClick: duplicar, disabled: ocupado },
        urlAceptacion && enviable && { label: 'Copiar el enlace de aceptación', icono: 'enlace', onClick: copiarEnlace },
    ].filter(Boolean);

    const chips = (
        <>
            {estado && <ChipPresupuesto estado={estado} />}
            {numeroExpediente && <span className="fx-chip fx-chip-ok"><Ico n="carpeta" />{numeroExpediente}</span>}
            {sucio && editable && <span className="fx-chip fx-chip-ambar">Sin guardar</span>}
        </>
    );

    let principal;
    if (enviable) {
        principal = (
            <button type="button" className="fx-btn fx-btn-pri" onClick={enviar} disabled={ocupado}>
                {falta ? <><Ico n="alerta" size={18} />{falta.texto}</> : <><Ico n="enviar" size={18} />{verbo} {porDonde} · {eur(totales.total)}</>}
            </button>
        );
    } else if (id && !cargando && !errorCarga && accionPrincipal && estado === 'ACEPTADA') {
        // Aceptado: lo que toca es facturarlo (o abrir su factura); lo dice quien abre el panel,
        // que sabe si ya tiene factura. Duplicar sigue en el ···.
        principal = (
            <button type="button" className="fx-btn fx-btn-pri" onClick={accionPrincipal.onClick} disabled={ocupado}>
                <Ico n={accionPrincipal.icono || 'recibo'} size={18} />{accionPrincipal.etiqueta}
            </button>
        );
    } else if (id && !cargando && !errorCarga) {
        principal = <button type="button" className="fx-btn fx-btn-pri" onClick={duplicar} disabled={ocupado}><Ico d={ICO_EXTRA.copiar} size={18} />{guardando ? 'Duplicando…' : 'Duplicar'}</button>;
    }
    const pie = (cargando || errorCarga) ? null : (
        <>
            <button type="button" className="fx-btn fx-pie-mas" aria-label="Más acciones" aria-haspopup="menu"
                onClick={e => setMenuPie(e.currentTarget)}><Ico n="mas3" size={22} /></button>
            {hayPartidas && (
                <button type="button" className="fx-btn fx-btn-sec fx-pie-ver" onClick={() => setPreview(true)} aria-label="Vista previa del PDF">
                    <Ico d={ICO_EXTRA.ojo} size={18} /><span>Vista previa</span>
                </button>
            )}
            {principal}
        </>
    );

    return (
        <>
            <PanelFx antetitulo={<>Presupuesto{numero ? '' : ' · serie P-ING'}</>} titulo={titulo} chips={chips} sub={sub}
                onCerrar={cerrar} bloqueado={preguntando || preview || !!fase || !!menuPie} pie={pie}>
                {cargando ? (
                    <div className="fx-cargando"><Ico n="reloj" size={28} className="fx-spin" />Abriendo el presupuesto…</div>
                ) : errorCarga ? (
                    <AvisoFx tono="ambar">{errorCarga}</AvisoFx>
                ) : (
                    <>
                        {/* ── Cliente: lo primero, con el foco ───────────────────────── */}
                        <section ref={clienteRef} className={`fx-seccion${marca && (marca.clave === 'cliente' || marca.clave === 'nombre') ? ' fx-seccion-mal' : ''}`}>
                            <div className="fx-sec-cab">
                                <h3 className="fx-sec-tit">Cliente</h3>
                                {editable && modoCliente !== 'buscar' && <button type="button" className="fx-link" onClick={volverABuscar}>Cambiar</button>}
                            </div>
                            {marca && (marca.clave === 'cliente' || marca.clave === 'nombre') && <p className="fx-error"><Ico n="alerta" size={15} />{marca.texto}</p>}
                            {!editable || modoCliente === 'existente' ? (
                                <div className="fx-ficha">
                                    <div>
                                        <b>{nombreDe(cliente) || '—'}</b>
                                        <small>{[cliente?.dni, tlfBonito(cliente?.tlf || cliente?.telefono), cliente?.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small>
                                    </div>
                                </div>
                            ) : modoCliente === 'rapido' ? (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    <div className="fx-fila2">
                                        <label className="fx-campo"><span>Nombre {rapidoDeWa ? '· de WhatsApp' : '· cliente nuevo'}</span>
                                            <input ref={nombreRef} className="fx-input" value={nombreRapido}
                                                onChange={e => { setNombreRapido(e.target.value); tocar(); }}
                                                placeholder="p. ej. Francisca Martínez" autoComplete="off" />
                                        </label>
                                        <label className="fx-campo"><span>Móvil (WhatsApp)</span>
                                            <input ref={tlfRef} className="fx-input" value={tlf} type="tel" inputMode="tel"
                                                onChange={e => cambiarTlfRapido(e.target.value)} placeholder="600 11 22 33" autoComplete="off" />
                                        </label>
                                    </div>
                                    <p className="fx-ayuda">Con el nombre y el móvil basta: el DNI, el email y la dirección los completa él al aceptar. La ficha nace al guardar.</p>
                                </div>
                            ) : (
                                <ClientePicker tema="fx" cliente={null} onChange={elegirCliente} onNuevoRapido={nuevoRapido}
                                    datosNuevoCliente={inmueble} autoFocus={!presupuestoId}
                                    placeholder="¿Para quién? Nombre, móvil o DNI" />
                            )}
                        </section>

                        {/* ── Partidas ─────────────────────────────────────────────── */}
                        <section className={`fx-seccion${marca?.clave === 'partida' ? ' fx-seccion-mal' : ''}`}>
                            <div className="fx-sec-cab">
                                <h3 className="fx-sec-tit">Partidas</h3>
                                {lineas.length > 0 && <span className="fx-ayuda">{editable ? `${lineas.length} · toca una para cambiarla` : lineas.length}</span>}
                            </div>
                            {marca?.clave === 'partida' && <p className="fx-error"><Ico n="alerta" size={15} />{marca.texto}</p>}
                            {editable && errorCatalogo && <AvisoFx tono="ambar">{errorCatalogo}. Puedes escribir partidas libres.</AvisoFx>}
                            <div className="fx-lineas">
                                {totales.lineas.map((l, i) => (
                                    <FilaLinea key={l.key} l={l} art={porId.get(String(l.articulo_id))} editable={editable}
                                        focoPrecio={focoPrecio === l.key}
                                        abierta={lineaAbierta === l.key} onAlternar={() => setLineaAbierta(k => (k === l.key ? null : l.key))}
                                        onCambiar={p => cambiarLinea(l.key, p)} onQuitar={() => quitarLinea(l.key)}
                                        onSubir={() => moverLinea(i, -1)} onBajar={() => moverLinea(i, 1)}
                                        primera={i === 0} ultima={i === totales.lineas.length - 1} />
                                ))}
                                {!lineas.length && <div className="fx-lineas-vacio">Todavía no hay partidas. {editable ? 'Escribe abajo y pulsa Enter.' : ''}</div>}
                            </div>
                            {editable && (
                                <BuscadorArticulos catalogo={catalogo} onElegir={anadirArticulo} onLibre={anadirLibre} onCreado={anadirCreado}
                                    entradaRef={buscadorRef} autoFocus={false} bloqueado={lineas.length >= MAX_LINEAS} />
                            )}
                        </section>

                        {/* ── El total, protagonista ───────────────────────────────── */}
                        <div className="fx-totales fx-total-caja">
                            <dl className="fx-filas">
                                <div className="fx-fila"><dt>Base imponible{totales.descuento > 0 ? <small>con −{eur(totales.descuento)} de descuento</small> : null}</dt><dd>{eur(totales.neto - totales.suplidos)}</dd></div>
                                <div className="fx-fila"><dt>IVA</dt><dd>{eur(totales.iva)}</dd></div>
                                {totales.suplidos > 0 && <div className="fx-fila"><dt>Suplidos<small>tasas, sin IVA</small></dt><dd>{eur(totales.suplidos)}</dd></div>}
                            </dl>
                            <div className="fx-total-grande"><span>Total</span><Importe n={totales.total} /></div>
                            {hayPartidas && (!estado || estado === 'BORRADOR' || estado === 'ENVIADA') && (
                                <p className="fx-total-nota">
                                    {abreCee || antiguo
                                        ? 'Lleva un certificado: al aceptarlo nace el expediente de CEE directo.'
                                        : 'Sin certificado: al aceptarlo se os avisa y al cliente se le confirma; no abre expediente.'}
                                </p>
                            )}
                        </div>

                        {/* ── Observaciones para el cliente: texto libre, a la vista ── */}
                        {(editable || observaciones.trim()) && (
                            <section className="fx-seccion">
                                <div className="fx-sec-cab">
                                    <h3 className="fx-sec-tit">Observaciones</h3>
                                    <span className="fx-ayuda">para el cliente · opcional</span>
                                </div>
                                <textarea className="fx-area no-uppercase" value={observaciones} rows={3} maxLength={MAX_OBSERVACIONES}
                                    readOnly={!editable} aria-label="Observaciones para el cliente"
                                    placeholder="Lo que el cliente tiene que tener en cuenta: plazos, qué incluye y qué no, qué necesitamos de él…"
                                    onChange={e => { setObservaciones(e.target.value); tocar(); }} />
                                <p className="fx-ayuda">Salen en el PDF y en la página donde lo acepta. Que no se entrega nada hasta aceptarlo y pagarlo ya lo dice el PDF siempre.</p>
                            </section>
                        )}

                        {/* ── Más opciones: inmueble y quién lo trae ──────────────── */}
                        <MasOpciones resumen={resumenMas} abierto={verMas} onAlternar={() => setVerMas(v => !v)}>
                            <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'grid', gap: 14 }}>
                                <div className="fx-campo">
                                    <span>El inmueble — sale en el presupuesto{abreCee ? ' y lo hereda el expediente; si no lo pones, lo pone el cliente al aceptar' : ''}</span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input className="fx-input fx-mono" value={refCatastral} style={{ minWidth: 0 }}
                                            onChange={e => { setRefCatastral(e.target.value.toUpperCase()); tocar(); }} placeholder="Ref. catastral (opcional)" />
                                        <button type="button" className="fx-btn fx-btn-sec" onClick={traerDelCatastro}
                                            disabled={catastro.cargando || !refCatastralValida(refCatastral)}>
                                            {catastro.cargando ? 'Trayendo…' : 'Traer'}
                                        </button>
                                    </div>
                                </div>
                                {catastro.msg && <AvisoFx tono="ok">{catastro.msg}</AvisoFx>}
                                {catastro.error && <AvisoFx tono="ambar">{catastro.error}</AvisoFx>}
                                <div className="fx-tw">
                                    <DireccionEdit values={inmueble} onChange={(p) => { setInmueble(v => ({ ...v, ...p })); tocar(); }} autoMunicipioHint={pistaMunicipio} />
                                </div>
                                <label className="fx-campo"><span>Quién nos lo trae</span>
                                    <select className="fx-select" value={prescriptorId == null ? '' : String(prescriptorId)}
                                        onChange={e => {
                                            const p = prescriptores.find(x => String(x.id_empresa) === e.target.value);
                                            setPrescriptorId(p ? p.id_empresa : null); tocar();
                                        }}>
                                        <option value="">Directo (sin prescriptor)</option>
                                        {prescriptores.map(p => <option key={p.id_empresa} value={String(p.id_empresa)}>{p.acronimo || p.razon_social}</option>)}
                                    </select>
                                </label>
                            </fieldset>
                        </MasOpciones>

                        {/* ── El envío: canal y mensaje, a la vista ─────────────────── */}
                        {enviable && (
                            <section ref={envioRef} className={`fx-seccion${marca?.clave === 'canal' ? ' fx-seccion-mal' : ''}`}>
                                <div className="fx-sec-cab">
                                    <h3 className="fx-sec-tit">Envío</h3>
                                    {!editarDestino && (email || tlf) && <button type="button" className="fx-link" onClick={() => setEditarDestino(true)}>Cambiar destinatario</button>}
                                </div>
                                {marca?.clave === 'canal' && <p className="fx-error"><Ico n="alerta" size={15} />{marca.texto}</p>}
                                <CanalesEnvio email={email} tlf={tlf} usaEmail={usaEmail} usaWa={usaWa} waReady={waReady} bloqueado={!!fase}
                                    onEmail={() => setUsaEmail(v => !v)} onWa={() => setUsaWa(v => !v)} />
                                {(editarDestino || (!email && !tlf && hayCliente)) && (
                                    <div className="fx-fila2" style={{ marginTop: 12 }}>
                                        <label className="fx-campo"><span>Móvil (WhatsApp)</span>
                                            <input className="fx-input" type="tel" inputMode="tel" value={tlf} placeholder="600 11 22 33"
                                                onChange={e => { setTlf(e.target.value); if (digitos(e.target.value).length >= 9 && waReady !== false) setUsaWa(true); }} />
                                        </label>
                                        <label className="fx-campo"><span>Email</span>
                                            <input className="fx-input no-uppercase" type="email" value={email} placeholder="correo@cliente.es"
                                                onChange={e => { setEmail(e.target.value); if (RE_EMAIL.test(e.target.value)) setUsaEmail(true); }} />
                                        </label>
                                    </div>
                                )}
                                <div style={{ marginTop: 14 }}>
                                    <div className="fx-sec-cab" style={{ marginBottom: 8 }}>
                                        <span className="fx-ayuda">El mensaje{destino.nombre ? <> para <b>{destino.nombre}</b></> : ''}, con el PDF adjunto</span>
                                        <button type="button" className="fx-link" onClick={() => setEditarMensaje(v => !v)}>{editarMensaje ? 'Listo' : 'Editar'}</button>
                                    </div>
                                    {editarMensaje ? (
                                        <>
                                            <textarea className="fx-area fx-area-msg no-uppercase" value={mensajeVisible} rows={12} aria-label="Mensaje al cliente"
                                                onChange={e => { setMensaje(e.target.value); setMensajeTocado(true); }} />
                                            <p className="fx-ayuda" style={{ marginTop: 6 }}>
                                                {mensajeTocado
                                                    ? <>Editado a mano: sale tal cual. <button type="button" className="fx-link" onClick={() => setMensajeTocado(false)}>Volver al automático</button></>
                                                    : 'Se compone solo con las partidas y el total.'}
                                                {!numero && ' «(nº de presupuesto)» y «(enlace para aceptar)» se cambian por los de verdad al enviar.'}
                                            </p>
                                        </>
                                    ) : (
                                        <p className="fx-msg fx-msg-corto">{mensajeVisible}</p>
                                    )}
                                </div>
                            </section>
                        )}

                        {error && <div ref={errorRef}><AvisoFx tono="ambar">{error}</AvisoFx></div>}
                    </>
                )}
            </PanelFx>

            {menuPie && <MenuAcciones anchor={menuPie} items={itemsMenu} titulo={numero || 'Presupuesto nuevo'} onClose={() => setMenuPie(null)} />}

            {preview && (
                <VistaPreviaA4 titulo="Vista previa del presupuesto" onClose={() => setPreview(false)} capa="z-[870]"
                    rotulo={numero ? `Presupuesto ${numero}` : 'Vista previa · el nº se asigna al guardar'}
                    html={buildOfertaCeeHtml(borrador, { cliente: clientePdf, firmaUrl: urlAceptacion || '#' })}
                    onDescargar={descargarPdf} />
            )}

            {toast}

            <SendActionOverlay
                phase={fase}
                ok={resultado.ok}
                subtitle={`Presupuesto${numero ? ` ${numero}` : ''} · ${nombreDe(clientePdf)}`}
                items={resultado.items}
                errorText={resultado.text}
                sendingTitle="Enviando el presupuesto…"
                okTitle="¡Presupuesto enviado!"
                onClose={() => { const ok = resultado.ok; setFase(null); if (ok) onClose?.(); }}
            />
        </>
    );
}

export default PresupuestoModal;
