// ─── AppInstalador — la app nueva del INSTALADOR (fases 1 a 4) ───────────────
// Se monta EN LUGAR del DashboardLayout cuando `/api/usuarios/me` dice
// `app_instalador: true` (beta por empresa, APP_INSTALADOR_BETA). Los datos llegan
// por la prop `api` —la real va contra `/api/instalador-app`; el banco de pruebas
// (`/instalador-demo.html`) le pasa datos de mentira y no toca nada—.
//
// Lo que NO hace esta app (y hace quien la aloja, App.jsx): la «Nueva simulación»
// (`onNueva`), abrir una oportunidad (`onAbrirOportunidad`, que la pinta en
// `externo` dentro de esta misma cáscara), el perfil y los modales de clientes.
//
// El botón «atrás» del móvil cierra lo último abierto (la acción dentro de la obra,
// luego la ficha: una entrada en el historial por cada una) en vez de sacarte de la app.
//
// Fase 2: lo que le toca al instalador se hace DENTRO de la obra (AccionesObra.jsx),
// con la sesión: ninguna llamada lleva token. Tras cada envío (`onCambio`) se borra
// la caché de detalles y se vuelven a pedir la obra y la lista: la tarea sale de
// «Te toca a ti» sin recargar.
//
// Fase 3: «Tu página web» (MiPaginaView): sus fotos y textos para brokergy.es, que
// propone y BROKERGY revisa. Se entra por la tarjeta de Inicio, el menú lateral y
// la hoja del Perfil (que ahora se abre siempre: «Mis datos de empresa», «Tu página
// web» y «Cerrar sesión»); y, desde «Fotos y papeles» de una obra, a elegir fotos.
//
// Fase 4: «Catálogo» (CatalogoView): la aerotermia de sus marcas con la tarifa del
// distribuidor y SU precio. Es la 5.ª casilla de la barra de abajo (el Perfil queda
// en el avatar de la cabecera y en el pie del menú lateral). «Calcular una obra con
// este equipo» llama a `onNueva({ equipo })`: quien nos aloja abre la Nueva
// simulación con el equipo y su precio ya puestos.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { EstiloInstalador, Icono } from './ui/piezas';
import { MarcoInstalador } from './MarcoInstalador';
import { InicioView } from './views/InicioView';
import { ObrasView } from './views/ObrasView';
import { ObraView } from './views/ObraView';
import { ClientesView, ClienteView } from './views/ClientesView';
import { MiPaginaView } from './views/MiPaginaView';
import { CatalogoView, EquipoView } from './views/CatalogoView';
import { API_DOCS_INSTALADOR } from '../docs/docsApi';

const B = '/api/instalador-app';
const e = encodeURIComponent;

/** La API de verdad (con la sesión de axios ya puesta por AuthContext). */
export function apiReal(axios) {
    const obra = (id) => `${B}/obras/${e(id)}`;
    return {
        obras: () => axios.get(`${B}/obras`).then((r) => r.data),
        obra: (id) => axios.get(obra(id)).then((r) => r.data),
        clientes: () => axios.get('/api/clientes').then((r) => (Array.isArray(r.data) ? r.data : [])),
        // ── Fase 2 ──
        presupuesto: (id) => axios.get(`${obra(id)}/presupuesto`).then((r) => r.data),
        presupuestoPdf: (id, fileId) => axios.get(`${obra(id)}/presupuesto/${e(fileId)}`, { responseType: 'arraybuffer' }).then((r) => r.data),
        subirPresupuesto: (id, cuerpo) => axios.post(`${obra(id)}/presupuesto`, cuerpo).then((r) => r.data),
        facturaProps: (id) => ({ api: `${obra(id)}/factura` }),
        subirFactura: (id, file) => {
            const form = new FormData();
            form.append('files', file);
            return axios.post(`${obra(id)}/factura/subir`, form).then((r) => r.data);
        },
        facturaFichero: (id, ref) => axios.get(`${obra(id)}/factura/fichero/${e(ref)}`, { responseType: 'arraybuffer' }).then((r) => r.data),
        instalador: (id) => axios.get(`${obra(id)}/instalador`).then((r) => r.data),
        // Las rutas de las tarjetas de /instalador/:id, con sesión (devuelven lo mismo que las suyas).
        rutas: (id, tarea) => (tarea === 'cifo'
            ? { pdf: () => axios.get(`${obra(id)}/cifo/pdf`), subir: (form) => axios.post(`${obra(id)}/cifo`, form) }
            : tarea === 'fm_decl'
                ? { pdf: () => axios.get(`${obra(id)}/fm-declaracion/pdf`), subir: (form) => axios.post(`${obra(id)}/fm-declaracion`, form) }
                : { subir: (form) => axios.post(`${obra(id)}/rite`, form) }),
        docs: API_DOCS_INSTALADOR,
        // ── Fase 3: «Tu página web» ──
        escaparate: () => axios.get(`${B}/escaparate`).then((r) => r.data),
        escaparateObras: (obraId) => axios.get(`${B}/escaparate/obras`, { params: obraId ? { obra: obraId } : {} }).then((r) => r.data),
        proponerFotos: (cuerpo) => axios.post(`${B}/escaparate/fotos`, cuerpo).then((r) => r.data),
        subirFotos: (ficheros) => {
            const form = new FormData();
            for (const f of ficheros) form.append('fotos', f);
            form.append('permiso', 'true');
            return axios.post(`${B}/escaparate/fotos/subir`, form).then((r) => r.data);
        },
        retirarFoto: (id) => axios.delete(`${B}/escaparate/fotos/${e(id)}`).then((r) => r.data),
        guardarTextos: (cuerpo) => axios.put(`${B}/escaparate/textos`, cuerpo).then((r) => r.data),
        // ── Fase 4: el catálogo con tarifas ──
        catalogo: () => axios.get(`${B}/catalogo`).then((r) => r.data),
        equipo: (id) => axios.get(`${B}/catalogo/${e(id)}`).then((r) => r.data),
        fichaEquipo: (id) => axios.get(`${B}/catalogo/${e(id)}/ficha`, { responseType: 'arraybuffer' }).then((r) => r.data),
        guardarPrecio: (id, precio) => axios.put(`${B}/catalogo/${e(id)}/precio`, { precio }).then((r) => r.data),
        quitarPrecio: (id) => axios.delete(`${B}/catalogo/${e(id)}/precio`).then((r) => r.data),
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
    externo = null, onCerrarExterno, nonce = 0, seccionInicial = 'inicio', abrirAlEmpezar = null, paginaVista = 'pagina',
}) {
    const [seccion, setSeccion] = useState(seccionInicial);
    // El avatar y «Perfil» abren una hoja: «Mis datos de empresa» (si la ficha ha
    // cargado), «Tu página web» y salir. Nunca se cierra la sesión de un toque.
    const [hoja, setHoja] = useState(false);
    const perfil = () => setHoja(true);
    // null | { tipo: 'obra', obra, accion? } | { tipo: 'cliente', cliente } | { tipo: 'equipo', equipo }
    const [ficha, setFicha] = useState(null);
    // Cuántas entradas propias hay en el historial: 1 = la ficha, 2 = una acción dentro.
    const pila = useRef(0);
    // Tras un envío dentro de la obra, se vuelve a pedir todo (la recarga de quien nos aloja va aparte).
    const [cambios, setCambios] = useState(0);
    const recarga = nonce * 1000 + cambios;

    const cargarObras = useCallback(() => api.obras(), [api]);
    const cargarClientes = useCallback(() => api.clientes(), [api]);
    const obras = useCarga(cargarObras, true, recarga);
    const clientes = useCarga(cargarClientes, seccion === 'clientes' || ficha?.tipo === 'cliente', nonce);
    const cargarCatalogo = useCallback(() => api.catalogo(), [api]);
    const catalogo = useCarga(cargarCatalogo, seccion === 'catalogo' || ficha?.tipo === 'equipo', recarga);
    // «Calcular una obra con este equipo»: su precio (o la tarifa) como presupuesto de la aerotermia.
    const calcularCon = (eq) => onNueva?.({
        equipo: {
            id: eq.id, marca: eq.marca, nombre: eq.nombre,
            precio_sin_iva: eq.tu_precio ?? eq.tarifa?.precio ?? null,
            origen: eq.tu_precio != null ? 'tu_precio' : eq.tarifa ? 'tarifa' : null,
        },
    });

    // El detalle se pide una vez por obra y por recarga.
    const cache = useRef(new Map());
    useEffect(() => { cache.current = new Map(); }, [recarga]);
    const onCambio = useCallback(() => { cache.current = new Map(); setCambios((n) => n + 1); }, []);
    const cargarDetalle = useCallback((id) => {
        if (!cache.current.has(id)) {
            const p = api.obra(id).catch((e) => { cache.current.delete(id); throw e; });
            cache.current.set(id, p);
        }
        return cache.current.get(id);
    }, [api]);

    // ── Fichas e historial ──
    useEffect(() => {
        const alVolver = (ev) => {
            if (!pila.current) return;
            const d = Math.max(0, Math.min(pila.current - 1, Number(ev.state?.iaFicha) || 0));
            pila.current = d;
            setFicha((f) => (d === 0 ? null : f ? { ...f, accion: null } : f));
            document.getElementById('ia-main')?.scrollTo?.(0, 0);
        };
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, []);
    const empujar = (n) => {
        try { window.history.pushState({ iaFicha: n }, ''); pila.current = n; } catch { /* sin historial */ }
    };
    const arriba = () => document.getElementById('ia-main')?.scrollTo?.(0, 0);
    const abrirFicha = (f) => {
        if (!pila.current) empujar(1);
        setFicha(f);
        arriba();
    };
    const cerrarFicha = () => {
        if (pila.current) { window.history.go(-pila.current); return; } // el popstate la cierra
        setFicha(null);
    };
    // Una acción (firmar, subir la factura…) se abre DENTRO de su obra.
    const abrirAccion = (o, destino) => {
        if (!pila.current) empujar(1);
        if (pila.current === 1) empujar(2);
        setFicha({ tipo: 'obra', obra: o, accion: destino });
        arriba();
    };
    const cerrarAccion = () => {
        if (pila.current === 2) { window.history.back(); return; }
        setFicha((f) => (f ? { ...f, accion: null } : f));
        arriba();
    };
    const ir = (s) => {
        if (pila.current) { const n = pila.current; pila.current = 0; try { window.history.go(-n); } catch { /* */ } }
        setFicha(null);
        setSeccion(s);
        if (externo && onCerrarExterno) onCerrarExterno();
        arriba();
    };

    // Una obra SIN expediente se abre en la página de su oportunidad (la de
    // siempre, dentro de esta cáscara); con expediente, en la ficha nueva.
    const abrirObra = (o) => (o.con_expediente ? abrirFicha({ tipo: 'obra', obra: o }) : onAbrirOportunidad(o.id));

    // El banco de pruebas entra directo en una obra (y una acción): `?obra=&accion=`,
    // o en la ficha de un equipo del catálogo: `?equipo=`.
    const alEmpezar = useRef(abrirAlEmpezar);
    useEffect(() => {
        const a = alEmpezar.current;
        if (!a?.equipo) return;
        const eq = catalogo.datos?.equipos?.find((x) => String(x.id) === String(a.equipo));
        if (!eq) return;
        alEmpezar.current = null;
        abrirFicha({ tipo: 'equipo', equipo: eq });
    }, [catalogo.datos]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const a = alEmpezar.current;
        if (a?.equipo) return;
        const o = a && obras.datos?.obras?.find((x) => x.id === a.obra);
        if (!o) return;
        alEmpezar.current = null;
        if (a.accion) abrirAccion(o, { tipo: 'accion', accion: a.accion }); else abrirObra(o);
    }, [obras.datos]); // eslint-disable-line react-hooks/exhaustive-deps

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
            api={api} nonce={recarga} accion={ficha.accion || null} onCambio={onCambio}
            onAccion={(d) => (d ? abrirAccion(ficha.obra, d) : cerrarAccion())}
            onVolver={cerrarFicha} onAbrirOportunidad={onAbrirOportunidad} onMiPagina={() => ir('pagina')} />;
    } else if (ficha?.tipo === 'cliente') {
        const actual = (clientes.datos || []).find((c) => c.id_cliente === ficha.cliente.id_cliente) || ficha.cliente;
        contenido = <ClienteView cliente={actual} obras={obras.datos?.obras} onVolver={cerrarFicha}
            onCambiar={onCambiarCliente} onAbrirObra={abrirObra} onNueva={onNueva} />;
    } else if (ficha?.tipo === 'equipo') {
        contenido = <EquipoView key={ficha.equipo.id} id={ficha.equipo.id} base={ficha.equipo} api={api}
            onVolver={cerrarFicha} onCalcular={onNueva ? calcularCon : null} onCambio={onCambio} />;
    } else if (seccion === 'catalogo') {
        contenido = <CatalogoView datos={catalogo.datos} cargando={catalogo.cargando} error={catalogo.error} onReintentar={catalogo.reintentar}
            onAbrir={(eq) => abrirFicha({ tipo: 'equipo', equipo: eq })} />;
    } else if (seccion === 'obras') {
        contenido = <ObrasView datos={obras.datos} cargando={obras.cargando} error={obras.error} onReintentar={obras.reintentar}
            cargarDetalle={cargarDetalle} onAbrirObra={abrirObra} onAbrirOportunidad={onAbrirOportunidad} onAbrirAccion={abrirAccion} onNueva={onNueva} />;
    } else if (seccion === 'pagina') {
        contenido = <MiPaginaView key={nonce} api={api} vistaInicial={paginaVista} />;
    } else if (seccion === 'clientes') {
        contenido = <ClientesView clientes={clientes.datos} obras={obras.datos?.obras} cargando={clientes.cargando} error={clientes.error}
            onReintentar={clientes.reintentar} onAbrir={(c) => abrirFicha({ tipo: 'cliente', cliente: c })} onNuevo={onNuevoCliente} />;
    } else {
        contenido = <InicioView saludo={saludo} datos={obras.datos} cargando={obras.cargando} error={obras.error}
            onReintentar={obras.reintentar} onNueva={onNueva} onVerObras={() => ir('obras')} onAbrirOportunidad={onAbrirOportunidad} onAbrirAccion={abrirAccion}
            onMiPagina={() => ir('pagina')} />;
    }

    const seccionVisible = ficha?.tipo === 'obra' ? 'obras' : ficha?.tipo === 'cliente' ? 'clientes' : ficha?.tipo === 'equipo' ? 'catalogo' : externo ? 'obras' : seccion;
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
                            {onPerfil && <button type="button" className="ia-btn ia-btn-sec" onClick={() => { setHoja(false); onPerfil(); }}><Icono n="clientes" size={20} /> Mis datos de empresa</button>}
                            <button type="button" className="ia-btn ia-btn-sec" onClick={() => { setHoja(false); ir('pagina'); }}><Icono n="web" size={20} /> Tu página web</button>
                            {onSalir && <button type="button" className="ia-btn ia-btn-sec" onClick={onSalir}><Icono n="salir" size={20} /> Cerrar sesión</button>}
                            <button type="button" className="ia-btn ia-btn-sec" onClick={() => setHoja(false)}>Volver</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
