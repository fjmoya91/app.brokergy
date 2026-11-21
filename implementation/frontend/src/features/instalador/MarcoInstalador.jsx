// ─── MarcoInstalador — la cáscara de la app del instalador ───────────────────
// Un marco PROPIO (no se retoca DashboardLayout, que sigue siendo el de todos los
// demás). En el móvil: cabecera con el logo y el avatar, y la barra de abajo
// Inicio · Obras · ＋ Nueva · Clientes · Catálogo, con «Nueva» en el centro y en
// naranja. Desde 1024 px: menú lateral blanco (prototipo «PC»).
//
// Fase 3: «Tu página web» (el escaparate) va en el menú lateral debajo de Clientes.
// Fase 4: la 5.ª casilla de la barra pasa de «Perfil» a «Catálogo». El Perfil se abre
// desde el AVATAR de la cabecera (móvil) y el pie del menú lateral (ordenador): una
// hoja con «Mis datos de empresa», «Tu página web» y «Cerrar sesión».
import React from 'react';
import { Icono, iniciales } from './ui/piezas';

const NAV = [
    { key: 'inicio', texto: 'Inicio', icono: 'inicio' },
    { key: 'obras', texto: 'Obras', icono: 'obras' },
    { key: 'clientes', texto: 'Clientes', icono: 'clientes' },
    { key: 'catalogo', texto: 'Catálogo', icono: 'catalogo' },
    { key: 'pagina', texto: 'Tu página web', icono: 'web' },   // solo en el menú lateral
];

export function MarcoInstalador({ seccion, onIr, onNueva, onPerfil, empresa, logo, teToca = 0, children }) {
    const nombre = empresa || 'Tu empresa';
    const avatar = (
        <button type="button" className="ia-avatar" onClick={onPerfil} aria-label="Mi perfil y mis datos">
            {logo ? <img src={logo} alt="" /> : iniciales(nombre)}
        </button>
    );
    return (
        <div className="ia-cuerpo">
            {/* ── Ordenador: menú lateral ── */}
            <aside className="ia-lat" aria-label="Menú">
                <img className="ia-logo" src="/logo_brokergy_dark.png" alt="BROKERGY" />
                <button type="button" className="ia-btn ia-btn-pri ia-btn-lat" onClick={onNueva}>
                    <Icono n="mas" size={20} grosor={2.4} /> Nueva simulación
                </button>
                <nav className="ia-lat-nav">
                    {NAV.map((it) => (
                        <button key={it.key} type="button" className={`ia-lat-it${seccion === it.key ? ' act' : ''}`}
                            aria-current={seccion === it.key ? 'page' : undefined} onClick={() => onIr(it.key)}>
                            <Icono n={it.icono} size={22} /> {it.texto}
                            {it.key === 'obras' && teToca > 0 && <span className="ia-lat-n" aria-label={`${teToca} te tocan`}>{teToca}</span>}
                        </button>
                    ))}
                </nav>
                <div className="ia-lat-pie">
                    <b>{nombre}</b>
                    <button type="button" className="ia-link" style={{ padding: 0, justifyContent: 'flex-start' }} onClick={onPerfil}>
                        Mi perfil y mis datos
                    </button>
                </div>
            </aside>

            <div className="ia-col">
                {/* ── Móvil: cabecera ── */}
                <header className="ia-cab">
                    <img className="ia-logo" src="/logo_brokergy_dark.png" alt="BROKERGY" />
                    {avatar}
                </header>
                <main className="ia-main" id="ia-main">{children}</main>
                {/* ── Móvil: barra de abajo ── */}
                <nav className="ia-barra" aria-label="Menú">
                    {NAV.slice(0, 2).map((it) => <ItemBarra key={it.key} it={it} activo={seccion === it.key} onIr={onIr} />)}
                    <button type="button" className="ia-barra-it ia-barra-nueva" onClick={onNueva}>
                        <span className="ia-barra-mas"><Icono n="mas" size={26} grosor={2.4} /></span>
                        Nueva
                    </button>
                    <ItemBarra it={NAV[2]} activo={seccion === 'clientes'} onIr={onIr} />
                    <ItemBarra it={NAV[3]} activo={seccion === 'catalogo'} onIr={onIr} />
                </nav>
            </div>
        </div>
    );
}

function ItemBarra({ it, activo, onIr }) {
    return (
        <button type="button" className={`ia-barra-it${activo ? ' act' : ''}`} aria-current={activo ? 'page' : undefined} onClick={() => onIr(it.key)}>
            <Icono n={it.icono} size={24} grosor={activo ? 2.2 : 2} />
            {it.texto}
        </button>
    );
}
