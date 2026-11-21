// ─── AppInstalador — la app nueva del INSTALADOR (fase 1: solo lectura) ──────
// Se monta EN LUGAR del DashboardLayout cuando `/api/usuarios/me` dice
// `app_instalador: true` (beta por empresa, APP_INSTALADOR_BETA). Los datos llegan
// por la prop `api` —la real va contra `/api/instalador-app`; el banco de pruebas
// (`/instalador-demo.html`) le pasa datos de mentira y no toca nada—.
//
// Lo que NO hace esta app (y hace quien la aloja, App.jsx): la «Nueva simulación»
// (`onNueva`), abrir una oportunidad (`onAbrirOportunidad`, que la pinta en
// `externo` dentro de esta misma cáscara), el perfil y los modales de clientes.
//
// El botón «atrás» del móvil cierra la ficha abierta (una entrada en el
// historial por ficha) en vez de sacarte de la app.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EstiloInstalador, Icono } from './ui/piezas';
import { MarcoInstalador } from './MarcoInstalador';
import { InicioView } from './views/InicioView';
import { ObrasView } from './views/ObrasView';
import { ObraView } from './views/ObraView';
import { ClientesView, ClienteView } from './views/ClientesView';

/** La API de verdad (con la sesión de axios ya puesta por AuthContext). */
export function apiReal(axios) {
    return {
        obras: () => axios.get('/api/instalador-app/obras').then((r) => r.data),
        obra: (id) => axios.get(`/api/instalador-app/obras/${encodeURIComponent(id)}`).then((r) => r.data),
        clientes: () => axios.get('/api/clientes').then((r) => (Array.isArray(r.data) ? r.data : [])),
    };
}

function useCarga(fn, activo, nonce) {
    const [estado, setEstado] = useState({ datos: null, cargando: !!activo, error: false });
    const [intento, setIntento] = useState(0);
    useEffect(() => {
        if (!activo) return undefined;
        let vivo = true;
        setEstado((s) => ({ ...s, cargando: !s.datos, error: false }));
        fn().then((datos) => { if (vivo) setEstado({ datos, cargando: false, error: false }); })
            .catch(() => { if (vivo) setEstado((s) => ({ datos: s.datos, cargando: false, error: !s.datos })); });
        return () => { vivo = false; };
    }, [fn, activo, nonce, intento]);
    return { ...estado, reintentar: () => setIntento((n) => n + 1) };
}

export default function AppInstalador({
    api, saludo, empresa, logo,
    onNueva, onAbrirOportunidad, onPerfil, onSalir, onNuevoCliente, onCambiarCliente,
    externo = null, onCerrarExterno, nonce = 0, seccionInicial = 'inicio',
}) {
    const [seccion, setSeccion] = useState(seccionInicial);
    // Sin la ficha de la empresa todavía (o si no carga), el avatar abre una hoja
    // con lo mínimo: salir. Nunca se cierra la sesión de un toque.
    const [hoja, setHoja] = useState(false);
    const perfil = () => (onPerfil ? onPerfil() : setHoja(true));
    const [ficha, setFicha] = useState(null); // null | { tipo: 'obra', obra } | { tipo: 'cliente', cliente }
    const conFicha = useRef(false);

    const cargarObras = useCallback(() => api.obras(), [api]);
    const cargarClientes = useCallback(() => api.clientes(), [api]);
    const obras = useCarga(cargarObras, true, nonce);
    const clientes = useCarga(cargarClientes, seccion === 'clientes' || ficha?.tipo === 'cliente', nonce);

    // El detalle se pide una vez por obra y por recarga.
    const cache = useRef(new Map());
    useEffect(() => { cache.current = new Map(); }, [nonce]);
    const cargarDetalle = useCallback((id) => {
        if (!cache.current.has(id)) {
            const p = api.obra(id).catch((e) => { cache.current.delete(id); throw e; });
            cache.current.set(id, p);
        }
        return cache.current.get(id);
    }, [api]);

    // ── Fichas e historial ──
    useEffect(() => {
        const alVolver = () => {
            if (!conFicha.current) return;
            conFicha.current = false;
            setFicha(null);
        };
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, []);
    const abrirFicha = (f) => {
        if (!conFicha.current) {
            try { window.history.pushState({ iaFicha: true }, ''); conFicha.current = true; } catch { /* sin historial */ }
        }
        setFicha(f);
        document.getElementById('ia-main')?.scrollTo?.(0, 0);
    };
    const cerrarFicha = () => {
        if (conFicha.current) { window.history.back(); return; } // el popstate la cierra
        setFicha(null);
    };
    const ir = (s) => {
        if (conFicha.current) { conFicha.current = false; try { window.history.back(); } catch { /* */ } }
        setFicha(null);
        setSeccion(s);
        if (externo && onCerrarExterno) onCerrarExterno();
        document.getElementById('ia-main')?.scrollTo?.(0, 0);
    };

    // Una obra SIN expediente se abre en la página de su oportunidad (la de
    // siempre, dentro de esta cáscara); con expediente, en la ficha nueva.
    const abrirObra = (o) => (o.con_expediente ? abrirFicha({ tipo: 'obra', obra: o }) : onAbrirOportunidad(o.id));

    let contenido;
    if (externo) {
        contenido = (
            <>
                <div className="ia-externo-barra">
                    <button type="button" className="ia-volver" onClick={onCerrarExterno}><Icono n="atras" size={22} /> Mis obras</button>
                </div>
                <div className="ia-externo">{externo}</div>
            </>
        );
    } else if (ficha?.tipo === 'obra') {
        contenido = <ObraView key={ficha.obra.id} obraId={ficha.obra.id} base={ficha.obra} cargarDetalle={cargarDetalle}
            onVolver={cerrarFicha} onAbrirOportunidad={onAbrirOportunidad} />;
    } else if (ficha?.tipo === 'cliente') {
        const actual = (clientes.datos || []).find((c) => c.id_cliente === ficha.cliente.id_cliente) || ficha.cliente;
        contenido = <ClienteView cliente={actual} obras={obras.datos?.obras} onVolver={cerrarFicha}
            onCambiar={onCambiarCliente} onAbrirObra={abrirObra} onNueva={onNueva} />;
    } else if (seccion === 'obras') {
        contenido = <ObrasView datos={obras.datos} cargando={obras.cargando} error={obras.error} onReintentar={obras.reintentar}
            cargarDetalle={cargarDetalle} onAbrirObra={abrirObra} onAbrirOportunidad={onAbrirOportunidad} onNueva={onNueva} />;
    } else if (seccion === 'clientes') {
        contenido = <ClientesView clientes={clientes.datos} obras={obras.datos?.obras} cargando={clientes.cargando} error={clientes.error}
            onReintentar={clientes.reintentar} onAbrir={(c) => abrirFicha({ tipo: 'cliente', cliente: c })} onNuevo={onNuevoCliente} />;
    } else {
        contenido = <InicioView saludo={saludo} datos={obras.datos} cargando={obras.cargando} error={obras.error}
            onReintentar={obras.reintentar} onNueva={onNueva} onVerObras={() => ir('obras')} onAbrirOportunidad={onAbrirOportunidad} />;
    }

    const seccionVisible = ficha?.tipo === 'obra' ? 'obras' : ficha?.tipo === 'cliente' ? 'clientes' : externo ? 'obras' : seccion;
    return (
        <div className="ia-app">
            <EstiloInstalador />
            <div className="ia-filete" />
            <MarcoInstalador seccion={seccionVisible} onIr={ir} onNueva={onNueva} onPerfil={perfil}
                empresa={empresa} logo={logo} teToca={obras.datos?.resumen?.te_toca || 0}>
                {contenido}
            </MarcoInstalador>
            {hoja && (
                <div className="ia-velo" onPointerDown={(e) => { if (e.target === e.currentTarget) setHoja(false); }}>
                    <div className="ia-hoja" role="dialog" aria-modal="true" aria-label="Tu cuenta">
                        <div className="ia-hoja-asa" />
                        <p className="ia-eyebrow" style={{ padding: '4px 4px 10px' }}>{empresa || 'Tu cuenta'}</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {onSalir && <button type="button" className="ia-btn ia-btn-sec" onClick={onSalir}><Icono n="salir" size={20} /> Cerrar sesión</button>}
                            <button type="button" className="ia-btn ia-btn-sec" onClick={() => setHoja(false)}>Volver</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
