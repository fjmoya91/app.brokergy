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
// Fase 5: SU marca (con logo: el logo y el nombre de su empresa «con BROKERGY»; sin
// logo, el de BROKERGY tal cual; su color, en la casilla activa, ver ui/marca.js),
// el número de lo que le toca también en la barra del móvil (el mismo que el filtro
// «Te toca» de Obras), «Ir al contenido» para el teclado y el aviso sin conexión.
// Fase 6: «Tu asistente» en el menú lateral (solo con `asistente`); en el móvil se
// entra desde Inicio y la gota de las listas, y con él abierto la cabecera y la barra
// se esconden (lleva la suya con «atrás»).
import React from 'react';
import { Icono, iniciales } from './ui/piezas';

const NAV = [
    { key: 'inicio', texto: 'Inicio', icono: 'inicio' },
    { key: 'obras', texto: 'Obras', icono: 'obras' },
    { key: 'clientes', texto: 'Clientes', icono: 'clientes' },
    { key: 'catalogo', texto: 'Catálogo', icono: 'catalogo' },
    { key: 'presupuestos', texto: 'Presupuestos', icono: 'factura' }, // solo en el menú lateral (en el móvil, desde Inicio)
    { key: 'pagina', texto: 'Tu página web', icono: 'web' },   // solo en el menú lateral
    { key: 'asistente', texto: 'Tu asistente', icono: 'chat', soloAsistente: true }, // fase 6, solo en el menú lateral
];

/** El logo de arriba: el suyo «con BROKERGY», o el de BROKERGY. */
function Marca({ nombre, logo }) {
    if (!logo) return <img className="ia-logo" src="/logo_brokergy_dark.png" alt="BROKERGY" />;
    return (
        <span className="ia-marca">
            <img className="ia-marca-logo" src={logo} alt="" />
            <span className="ia-marca-txt">
                <b>{nombre}</b>
                <small>con <span>BROKERGY</span></small>
            </span>
        </span>
    );
}

export function MarcoInstalador({ seccion, onIr, onNueva, onPerfil, empresa, logo, teToca = 0, enLinea = true, asistente = false, children }) {
    const nombre = empresa || 'Tu empresa';
    const aviso = teToca > 0 ? `${teToca} ${teToca === 1 ? 'obra te espera' : 'obras te esperan'}` : null;
    return (
        <div className="ia-cuerpo">
            <a className="ia-saltar" href="#ia-main" onClick={(e) => { e.preventDefault(); document.getElementById('ia-main')?.focus(); }}>
                Ir al contenido
            </a>
            {/* ── Ordenador: menú lateral ── */}
            <aside className="ia-lat" aria-label="Menú">
                <Marca nombre={nombre} logo={logo} />
                <button type="button" className="ia-btn ia-btn-pri ia-btn-lat" onClick={onNueva}>
                    <Icono n="mas" size={20} grosor={2.4} /> Nueva simulación
                </button>
                <nav className="ia-lat-nav">
                    {NAV.filter((it) => !it.soloAsistente || asistente).map((it) => (
                        <button key={it.key} type="button" className={`ia-lat-it${seccion === it.key ? ' act' : ''}`}
                            aria-current={seccion === it.key ? 'page' : undefined} onClick={() => onIr(it.key)}>
                            <Icono n={it.icono} size={22} /> {it.texto}
                            {it.key === 'obras' && aviso && <span className="ia-lat-n" aria-label={aviso}>{teToca}</span>}
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
                    <Marca nombre={nombre} logo={logo} />
                    <button type="button" className="ia-avatar" onClick={onPerfil} aria-label="Mi perfil y mis datos">
                        {iniciales(nombre)}
                    </button>
                </header>
                {!enLinea && (
                    <div className="ia-sinred" role="status">
                        <Icono n="aviso" size={18} /> Sin conexión: lo que ves puede no estar al día.
                    </div>
                )}
                <main className="ia-main" id="ia-main" tabIndex={-1}>{children}</main>
                {/* ── Móvil: barra de abajo ── */}
                <nav className="ia-barra" aria-label="Menú">
                    <ItemBarra it={NAV[0]} activo={seccion === 'inicio'} onIr={onIr} />
                    <ItemBarra it={NAV[1]} activo={seccion === 'obras'} onIr={onIr} n={teToca} aviso={aviso} />
                    <button type="button" className="ia-barra-it ia-barra-nueva" onClick={onNueva} aria-label="Nueva simulación">
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

function ItemBarra({ it, activo, onIr, n = 0, aviso = null }) {
    return (
        <button type="button" className={`ia-barra-it${activo ? ' act' : ''}`} aria-current={activo ? 'page' : undefined}
            onClick={() => onIr(it.key)} aria-label={aviso ? `${it.texto}: ${aviso}` : undefined}>
            <span className="ia-barra-ico">
                <Icono n={it.icono} size={24} grosor={activo ? 2.2 : 2} />
                {n > 0 && <span className="ia-barra-n" aria-hidden="true">{n}</span>}
            </span>
            {it.texto}
        </button>
    );
}
