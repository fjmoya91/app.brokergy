// ============================================================================
// BarraMovil.jsx — la BARRA DE ABAJO del móvil para el equipo (ADMIN y
// TRABAJADOR), como la de la app del instalador (22/11/2026, Fran: «Se solapa
// con el chat. Quizás lo ideal sería tener un menú inferior como has hecho con
// el ROL Instalador»).
//
//   ADMIN       Cuadro · Oportunidades · ＋ · Expedientes · Más
//   TRABAJADOR  Seguimiento · Oportunidades · ＋ · Expedientes · Más
//
// «Más» abre el menú lateral de siempre (ahí sigue todo lo demás). El ＋ del
// ADMIN abre una hoja con «Gasto con una foto» (la cámara, directa), «Gasto en
// PDF» y «Nueva simulación»; el del TRABAJADOR, que no da de alta gastos (la ruta
// es solo ADMIN), abre directamente la nueva simulación.
//
// Lo que mide la barra lo publica `html.con-barra-movil` → `--barra-movil`
// (index.css). Todo lo fijo abajo se sube con esa variable: regla 239.
// Solo existe por debajo de 768 px (`md:hidden`); en escritorio no cambia nada.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GastoRapido } from '../../features/dashboard/components/GastoRapido';
import { CSS as CSS_FX } from '../../features/facturacion/estilo';
import { CSS_CUADRO } from '../../features/dashboard/cuadroEstilo';

/** Los iconos de la navegación: los mismos en el menú lateral y en la barra. */
export const ICONOS_NAV = {
    dashboard: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    seguimiento: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    oportunidades: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    expedientes: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
};
const ICO_MAS = 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z';
const ICO_CAMARA = 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm12 4a3 3 0 11-6 0 3 3 0 016 0z';
const ICO_PDF = 'M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z';
const ICO_SIMULACION = 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z';

/** Lo que oye el cuadro de mando para recargar su cuenta tras un gasto dado de alta desde aquí. */
export const EVENTO_GASTO_GUARDADO = 'brokergy:gasto-guardado';

const Svg = ({ d, className = 'w-6 h-6', grosor = 2 }) => (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={grosor} d={d} />
    </svg>
);

function Item({ label, d, activo, onClick, aviso = 0 }) {
    return (
        <button type="button" onClick={onClick} aria-current={activo ? 'page' : undefined}
            className={`relative flex flex-col items-center justify-end gap-1 h-full min-w-0 pb-[10px] transition-colors active:scale-95 ${activo ? 'text-brand' : 'text-white/50'}`}>
            <span className="relative">
                <Svg d={d} grosor={activo ? 2.4 : 2} />
                {aviso > 0 && <span className="absolute -top-0.5 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-bkg-deep" aria-hidden="true" />}
            </span>
            <span className="max-w-full truncate text-[10.5px] font-bold leading-none tracking-[-0.02em]">{label}</span>
        </button>
    );
}

function Opcion({ d, titulo, detalle, onClick, autoFocus = false }) {
    return (
        <button type="button" role="menuitem" onClick={onClick} autoFocus={autoFocus}
            className="w-full flex items-center gap-4 rounded-2xl px-3 py-3 text-left active:scale-[0.98] active:bg-white/[0.06] hover:bg-white/[0.04] transition">
            <span className="w-12 h-12 shrink-0 rounded-2xl bg-brand/15 text-brand grid place-items-center"><Svg d={d} /></span>
            <span className="min-w-0">
                <span className="block text-[15px] font-black text-white leading-tight">{titulo}</span>
                <span className="block mt-0.5 text-xs text-white/45 leading-snug">{detalle}</span>
            </span>
        </button>
    );
}

/**
 * @param activeTab  la pestaña abierta
 * @param onIr(tab)  cambiar de pestaña (el `go` del layout)
 * @param onMas      abrir el menú lateral
 * @param onNueva    abrir «Nueva simulación»
 * @param esAdmin    ADMIN (cuadro de mando y gastos) o TRABAJADOR
 * @param avisoMas   nº de cosas por revisar que están en el menú (un punto en «Más»)
 */
export function BarraMovil({ activeTab, onIr, onMas, onNueva, esAdmin, avisoMas = 0 }) {
    const [hoja, setHoja] = useState(false);
    const [gasto, setGasto] = useState(null); // null | { ficheros }
    const camara = useRef(null);
    const fichero = useRef(null);

    // La barra publica lo que mide (index.css) mientras está montada.
    useEffect(() => {
        const html = document.documentElement;
        html.classList.add('con-barra-movil');
        return () => html.classList.remove('con-barra-movil');
    }, []);

    useEffect(() => {
        if (!hoja) return undefined;
        const h = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setHoja(false); } };
        window.addEventListener('keydown', h, true);
        return () => window.removeEventListener('keydown', h, true);
    }, [hoja]);

    const inicio = esAdmin
        ? { id: 'dashboard', label: 'Cuadro' }
        : { id: 'seguimiento', label: 'Seguimiento' };
    const enBarra = [inicio.id, 'oportunidades', 'expedientes'];
    const enMas = !enBarra.includes(activeTab);

    const pulsarMas = () => { if (esAdmin) setHoja(true); else onNueva?.(); };
    // La cámara se abre DENTRO del toque (un navegador no deja abrirla después).
    const abrir = (ref) => { ref.current?.click(); setHoja(false); };
    const elegidos = (e) => {
        const fs = Array.from(e.target.files || []);
        e.target.value = '';
        if (fs.length) setGasto({ ficheros: fs });
    };

    return (
        <>
            <nav aria-label="Navegación"
                className="md:hidden fixed inset-x-0 bottom-0 z-30 bg-bkg-deep/95 backdrop-blur-md border-t border-white/[0.08]"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="grid grid-cols-[1fr_1fr_60px_1fr_1fr] h-[62px] px-0.5">
                    <Item label={inicio.label} d={ICONOS_NAV[inicio.id]} activo={activeTab === inicio.id} onClick={() => onIr(inicio.id)} />
                    <Item label="Oportunidades" d={ICONOS_NAV.oportunidades} activo={activeTab === 'oportunidades'} onClick={() => onIr('oportunidades')} />
                    <button type="button" onClick={pulsarMas} aria-haspopup={esAdmin ? 'menu' : undefined} aria-expanded={esAdmin ? hoja : undefined}
                        aria-label={esAdmin ? 'Añadir: gasto o nueva simulación' : 'Nueva simulación'}
                        className="relative flex flex-col items-center justify-end h-full pb-[10px] text-white/50 active:scale-95 transition-transform">
                        {/* El círculo sobresale de la barra, como el «Nueva» del instalador; la etiqueta, a la altura de las demás. */}
                        <span className="absolute left-1/2 -translate-x-1/2 -top-6 w-14 h-14 rounded-full bg-gradient-to-br from-brand to-brand-700 text-bkg-deep grid place-items-center shadow-lg shadow-brand/30 ring-[5px] ring-bkg-deep">
                            <Svg d="M12 5v14m-7-7h14" className="w-7 h-7" grosor={2.6} />
                        </span>
                        <span className="text-[10.5px] font-bold leading-none tracking-[-0.02em]">{esAdmin ? 'Añadir' : 'Nueva'}</span>
                    </button>
                    <Item label="Expedientes" d={ICONOS_NAV.expedientes} activo={activeTab === 'expedientes'} onClick={() => onIr('expedientes')} />
                    <Item label="Más" d={ICO_MAS} activo={enMas} onClick={onMas} aviso={avisoMas} />
                </div>
            </nav>

            {esAdmin && (
                <>
                    <input ref={camara} type="file" accept="image/*" capture="environment" hidden onChange={elegidos} />
                    <input ref={fichero} type="file" accept="application/pdf,image/*" multiple hidden onChange={elegidos} />
                </>
            )}

            {hoja && createPortal(
                <>
                    <div className="md:hidden fixed inset-0 z-[400] bg-black/50 animate-fade-in" onClick={() => setHoja(false)} aria-hidden="true" />
                    <div role="menu" aria-label="Añadir" data-tapa-asistente
                        className="md:hidden fixed inset-x-0 bottom-0 z-[401] rounded-t-3xl border-t border-white/10 bg-bkg-deep shadow-2xl animate-slide-up px-2 pt-2"
                        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
                        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/15" />
                        <p className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Añadir</p>
                        <Opcion d={ICO_CAMARA} titulo="Gasto con una foto" detalle="Abre la cámara: el ticket o la factura en papel" onClick={() => abrir(camara)} autoFocus />
                        <Opcion d={ICO_PDF} titulo="Gasto en PDF" detalle="Una factura que te han mandado, o fotos de la galería" onClick={() => abrir(fichero)} />
                        {onNueva && (
                            <Opcion d={ICO_SIMULACION} titulo="Nueva simulación" detalle="Una oportunidad nueva por su referencia catastral"
                                onClick={() => { setHoja(false); onNueva(); }} />
                        )}
                    </div>
                </>,
                document.body,
            )}

            {gasto && (
                <>
                    {/* El diálogo es el del cuadro de mando: sus estilos van con él. */}
                    <style>{CSS_FX + CSS_CUADRO}</style>
                    <GastoRapido inicial={gasto.ficheros} onClose={() => setGasto(null)}
                        onGuardado={(r) => window.dispatchEvent(new CustomEvent(EVENTO_GASTO_GUARDADO, { detail: r }))} />
                </>
            )}
        </>
    );
}
