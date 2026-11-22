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
// Fase 4: «Catálogo» (CatalogoView): la aerotermia de sus marcas (por logo) con la
// tarifa de CADA distribuidor al que compra, a quién se lo compra, el pedido al
// comercial (22/11/2026, catalogo-por-distribuidor.md) y SU precio. Es la 5.ª casilla de la barra de abajo (el Perfil queda
// en el avatar de la cabecera y en el pie del menú lateral). «Calcular una obra con
// este equipo» llama a `onNueva({ equipo })`: quien nos aloja abre la Nueva
// simulación con el equipo y su precio ya puestos.
//
// Fase 5: la pantalla y la ficha abiertas viajan en la DIRECCIÓN (ui/direccion.js:
// `?seccion=&obra=&accion=&cliente=&equipo=`, nada personal), así que recargar, el
// «atrás» del móvil y un enlace directo dejan al instalador donde estaba. La app se
// puede instalar (ui/cabeceraApp.js: manifiesto crema solo mientras está montada) y
// lleva la marca de su empresa (ui/marca.js). Sin conexión, lo dice y lo vuelve a
// intentar sola al volver la cobertura.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EstiloInstalador, Icono, useEnLinea, useHojaTeclado } from './ui/piezas';
import { leerDireccion, clavesDe, escribir } from './ui/direccion';
import { ponerCabeceraInstalador } from './ui/cabeceraApp';
import { varsDeMarca } from './ui/marca';
import { MarcoInstalador } from './MarcoInstalador';
import { InicioView } from './views/InicioView';
import { ObrasView } from './views/ObrasView';
import { ObraView } from './views/ObraView';
import { ClientesView, ClienteView } from './views/ClientesView';
import { MiPaginaView } from './views/MiPaginaView';
import { CatalogoView, EquipoView } from './views/CatalogoView';
import { PresupuestosView, PresupuestoFicha } from './views/PresupuestosView';
import { PresupuestoForm } from './views/PresupuestoForm';
import { simulacionDesde } from './logic/presupuestoApp';
import { API_DOCS_INSTALADOR } from '../docs/docsApi';

const B = '/api/instalador-app';
const e = encodeURIComponent;

/** La API de verdad (con la sesión de axios ya puesta por AuthContext). */
/** GET /obras/:id responde `{ obra }`. Hasta el 22/11/2026 se pasaba la envoltura tal cual y la
 *  ficha y el panel del ordenador salían vacíos con datos reales (el demo devolvía la obra a pelo).
 *  El demo pasa ahora por aquí con la misma forma que el servidor. */
export function obraDeRespuesta(data) {
    const o = data?.obra;
    if (!o?.id) throw new Error('Obra sin datos');
    return o;
}

export function apiReal(axios) {
    const obra = (id) => `${B}/obras/${e(id)}`;
    return {
        obras: () => axios.get(`${B}/obras`).then((r) => r.data),
        obra: (id) => axios.get(obra(id)).then((r) => obraDeRespuesta(r.data)),
        clientes: () => axios.get('/api/clientes').then((r) => (Array.isArray(r.data) ? r.data : [])),
        // ── La propuesta: verla y decir que ya se la ha pasado a su cliente ──
        propuestaPdf: (id) => axios.get(`${obra(id)}/propuesta/pdf`, { responseType: 'arraybuffer' }).then((r) => r.data),
        propuestaPasada: (id) => axios.post(`${obra(id)}/propuesta/pasada`).then((r) => r.data),
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
        compra: (id, distribuidor_id) => axios.put(`${B}/catalogo/${e(id)}/compra`, { distribuidor_id }).then((r) => r.data),
        pedido: (id, body) => axios.post(`${B}/catalogo/${e(id)}/pedido`, body).then((r) => r.data),
        // ── Los presupuestos que el instalador HACE en la app (22/11/2026) ──
        // Ojo: `presupuesto(id)` de arriba es el presupuesto SUBIDO de una obra (fase 2);
        // los hechos aquí van con nombre propio para no pisarlo.
        presupuestos: () => axios.get(`${B}/presupuestos`).then((r) => r.data),
        presupuestoNuevo: ({ obra = null, cliente = null } = {}) => axios.get(`${B}/presupuestos/nuevo`, {
            params: { ...(obra ? { obra } : {}), ...(cliente ? { cliente } : {}) },
        }).then((r) => r.data),
        // No guarda ni gasta número: el PDF tal cual saldría, y si el texto desborda la hoja.
        presupuestoVistaPrevia: (entrada) => axios.post(`${B}/presupuestos/vista-previa`, entrada, { responseType: 'arraybuffer' })
            .then((r) => ({ pdf: r.data, ...cabecerasPrevia(r.headers) })),
        crearPresupuesto: (entrada) => axios.post(`${B}/presupuestos`, entrada).then((r) => r.data),
        presupuestoHecho: (id) => axios.get(`${B}/presupuestos/${e(id)}`).then((r) => r.data),
        guardarPresupuesto: (id, entrada) => axios.put(`${B}/presupuestos/${e(id)}`, entrada).then((r) => r.data),
        anularPresupuesto: (id) => axios.post(`${B}/presupuestos/${e(id)}/anular`).then((r) => r.data),
        presupuestoHechoPdf: (id) => axios.get(`${B}/presupuestos/${e(id)}/pdf`, { responseType: 'arraybuffer' }).then((r) => r.data),
        presupuestoDescarga: (id) => axios.get(`${B}/presupuestos/${e(id)}/pdf`, { params: { descargar: 1 }, responseType: 'arraybuffer' })
            .then((r) => ({ bytes: r.data, nombre: nombreDeDescarga(r.headers) })),
        presupuestoWhatsapp: (id) => axios.post(`${B}/presupuestos/${e(id)}/whatsapp`).then((r) => r.data),
        vincularPresupuesto: (id, obra) => axios.post(`${B}/presupuestos/${e(id)}/vincular`, { obra }).then((r) => r.data),
    };
}

/** Las cabeceras de la vista previa (axios las da en minúsculas). */
export const cabecerasPrevia = (h = {}) => ({
    desborda: String(h['x-presupuesto-desborda'] || '') === '1',
    numeroLargo: String(h['x-presupuesto-numero-largo'] || '') === '1',
});
/** «attachment; filename="Presupuesto 40-26 - Cliente.pdf"» → el nombre (o null). */
export function nombreDeDescarga(h = {}) {
    const cd = String(h['content-disposition'] || '');
    const utf = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(cd);
    if (utf) { try { return decodeURIComponent(utf[1].replace(/"/g, '')); } catch { /* */ } }
    const m = /filename\s*=\s*"?([^";]+)"?/i.exec(cd);
    return m ? m[1] : null;
}

/** Lo que se ve al volver atrás desde una ficha: sin su acción; un presupuesto abierto desde otra ficha, esa. */
export const trasAtras = (f) => (f?.tipo === 'presupuesto' && f.vuelta && (f.enSitio || !f.accion)
    ? { ...f.vuelta, accion: null } : { ...f, accion: null });

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
    api, saludo, empresa, logo, colorMarca = null,
    onNueva, onAbrirOportunidad, onPerfil, onSalir, onNuevoCliente, onCambiarCliente,
    externo = null, onCerrarExterno, nonce = 0, paginaVista = 'pagina', instalarComo = null,
    // Dónde abrir: la dirección con la que se cargó la página (quien nos aloja la
    // guarda ANTES de que nada la toque) y cuántas fichas había en el historial.
    direccion = typeof window !== 'undefined' ? window.location.search : '',
    fichaEnHistorial = typeof window !== 'undefined' ? window.history.state?.iaFicha : undefined,
}) {
    const inicio = useRef(null);
    if (inicio.current === null) inicio.current = leerDireccion(direccion);
    const [seccion, setSeccion] = useState(inicio.current.seccion);
    // El avatar y «Perfil» abren una hoja: «Mis datos de empresa» (si la ficha ha
    // cargado), «Tu página web» y salir. Nunca se cierra la sesión de un toque.
    const [hoja, setHoja] = useState(false);
    const perfil = () => setHoja(true);
    // null | { tipo: 'obra', obra, accion? } | { tipo: 'cliente', cliente } | { tipo: 'equipo', equipo }
    const [ficha, setFicha] = useState(null);
    // Cuántas entradas propias hay en el historial: 1 = la ficha, 2 = una acción dentro.
    // Al recargar con una ficha abierta, sus entradas siguen ahí: se recupera su número.
    const pila = useRef(0);
    const [tickUrl, setTickUrl] = useState(0);
    // Tras un envío dentro de la obra, se vuelve a pedir todo (la recarga de quien nos aloja va aparte).
    const [cambios, setCambios] = useState(0);
    const recarga = nonce * 1000 + cambios;

    const cargarObras = useCallback(() => api.obras(), [api]);
    const cargarClientes = useCallback(() => api.clientes(), [api]);
    const obras = useCarga(cargarObras, true, recarga);
    const clientes = useCarga(cargarClientes, seccion === 'clientes' || ficha?.tipo === 'cliente', nonce);
    const cargarCatalogo = useCallback(() => api.catalogo(), [api]);
    const catalogo = useCarga(cargarCatalogo, seccion === 'catalogo' || ficha?.tipo === 'equipo', recarga);
    // Los presupuestos que hace en la app: la lista solo cuando se mira.
    const [presuN, setPresuN] = useState(0);
    const cargarPresupuestos = useCallback(() => api.presupuestos(), [api]);
    const presupuestos = useCarga(cargarPresupuestos, seccion === 'presupuestos' && !ficha, recarga * 1000 + presuN);
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
            setTickUrl((n) => n + 1); // la dirección vuelve a decir lo que se ve
            if (!pila.current) return;
            const d = Math.max(0, Math.min(pila.current - 1, Number(ev.state?.iaFicha) || 0));
            pila.current = d;
            setFicha((f) => (d === 0 ? null : f ? trasAtras(f) : f));
            document.getElementById('ia-main')?.scrollTo?.(0, 0);
        };
        window.addEventListener('popstate', alVolver);
        return () => window.removeEventListener('popstate', alVolver);
    }, []);
    // Cada ficha (y cada acción) es una entrada del historial CON su dirección.
    const empujar = (n, f) => {
        escribir(clavesDe({ seccion, ficha: f }), { push: true, estado: { iaFicha: n } });
        pila.current = n;
    };
    // Arriba del todo, y el foco al contenido: con el teclado se sigue desde ahí.
    const arriba = () => {
        const m = document.getElementById('ia-main');
        m?.scrollTo?.(0, 0);
        try { m?.focus?.({ preventScroll: true }); } catch { /* */ }
    };
    const abrirFicha = (f) => {
        if (!pila.current) empujar(1, f);
        setFicha(f);
        arriba();
    };
    const cerrarFicha = () => {
        if (pila.current) { window.history.go(-pila.current); return; } // el popstate la cierra
        setFicha(null);
    };
    // Una acción (firmar, subir la factura…) se abre DENTRO de su obra.
    const abrirAccion = (o, destino) => {
        const f = { tipo: 'obra', obra: o, accion: destino };
        if (!pila.current) empujar(1, { tipo: 'obra', obra: o });
        if (pila.current === 1) empujar(2, f);
        setFicha(f);
        arriba();
    };
    const cerrarAccion = () => {
        if (pila.current === 2) { window.history.back(); return; }
        setFicha((f) => (f ? { ...f, accion: null } : f));
        arriba();
    };
    const ir = (s) => {
        setNoEncontrada(null);
        if (pila.current) { const n = pila.current; pila.current = 0; try { window.history.go(-n); } catch { /* */ } }
        setFicha(null);
        setSeccion(s);
        if (externo && onCerrarExterno) onCerrarExterno();
        arriba();
    };

    // TODA obra se abre en su ficha, tenga o no expediente (Fran, 21/11/2026: «cuando
    // pulso sobre una de mis obras me lleva a la vista de la oportunidad»). La
    // calculadora de siempre queda detrás de «Corregir el cálculo», dentro de la ficha.
    const abrirObra = (o) => abrirFicha({ tipo: 'obra', obra: o });

    // ── Los PRESUPUESTOS: lista → ficha → cambiarlo / otro igual (cada uno, su entrada) ──
    // Desde un cliente (entrada 1) el formulario se empuja encima y «atrás» vuelve a él
    // (`vuelta`); desde la acción de una obra (entrada 2, ya no caben más) se abre EN SU
    // SITIO y «atrás» vuelve a la obra.
    const abrirPresu = (f) => {
        let g = f;
        if (pila.current < 2) empujar(pila.current + 1, f);
        else g = { ...f, enSitio: true };
        setFicha(g);
        arriba();
    };
    const nuevoPresupuesto = (desde = null, vuelta = null) => abrirPresu({ tipo: 'presupuesto', id: 'nuevo', desde, vuelta });
    const volverPresu = () => {
        const f = ficha;
        if (f?.accion) {
            if (!f.enSitio && pila.current === 2) { window.history.back(); return; }
            setFicha({ ...f, accion: null });
            arriba();
            return;
        }
        if (f?.vuelta && f.enSitio) { setFicha(f.vuelta); arriba(); return; }
        if (f?.vuelta && pila.current === 2) { window.history.back(); return; }
        cerrarFicha();
    };
    const presuGuardado = (p, { nuevo }) => {
        const f = ficha;
        setPresuN((n) => n + 1);
        if (!nuevo) { // cambiado: a su ficha, que se vuelve a pedir
            if (!f.enSitio && pila.current === 2) window.history.back();
            else setFicha({ ...f, accion: null });
            arriba();
            return;
        }
        if (!p?.id) { volverPresu(); return; }
        // Nuevo u «otro igual»: su ficha ocupa el sitio del formulario (la dirección se reescribe).
        setFicha({ tipo: 'presupuesto', id: p.id, recien: true, vuelta: f.vuelta || null, enSitio: !!f.enSitio });
        arriba();
    };
    // «Calcular el bono CAE»: la Nueva simulación de siempre con lo del presupuesto; al
    // crearse la oportunidad, el presupuesto se liga a ella y se vuelve a su ficha.
    const simularPresupuesto = ({ presupuesto, entrada }) => {
        const sim = simulacionDesde({ presupuesto, entrada });
        if (!sim || !onNueva) return;
        onNueva({
            presupuesto: {
                ...sim,
                alCrear: async (res) => {
                    const idOp = res?.id_oportunidad || res?.oportunidad?.id_oportunidad || null;
                    if (idOp) { try { await api.vincularPresupuesto(sim.id, idOp); } catch { /* queda sin ligar */ } }
                    setPresuN((n) => n + 1);
                    onCambio();
                },
            },
        });
    };
    const abrirObraPorId = (idOp) => {
        const o = obras.datos?.obras?.find((x) => x.id === idOp || x.numero_expediente === idOp);
        if (!o) { onAbrirOportunidad?.(idOp); return; }
        if (pila.current >= 1) { setFicha({ tipo: 'obra', obra: o }); arriba(); } else abrirFicha({ tipo: 'obra', obra: o });
    };

    // ── Abrir donde dice la dirección (recargar, un enlace directo, el banco) ──
    // Recargando, el historial ya tiene las entradas de la ficha (`iaFicha`): se abre
    // sin empujar más. Con un enlace nuevo, la entrada actual pasa a ser la pantalla
    // y la ficha se empuja encima: «atrás» vuelve a la lista, no fuera de la app.
    const alEmpezar = useRef(undefined);
    if (alEmpezar.current === undefined) {
        const d = inicio.current;
        alEmpezar.current = (d.obra || d.cliente || d.equipo || d.presupuesto)
            ? { ...d, enHistorial: Math.max(0, Math.min(2, Number(fichaEnHistorial) || 0)) }
            : null;
    }
    const [noEncontrada, setNoEncontrada] = useState(null);
    const abrirDesdeDireccion = (f, accion) => {
        const a = alEmpezar.current;
        alEmpezar.current = null;
        if (a.enHistorial) {
            pila.current = accion ? Math.max(a.enHistorial, 1) : 1;
            if (accion && pila.current < 2) empujar(2, { ...f, accion });
            setFicha(accion ? { ...f, accion } : f);
            return;
        }
        escribir(clavesDe({ seccion: inicio.current.seccion, ficha: null }), { estado: { iaFicha: 0 } });
        if (accion) abrirAccion(f.obra, accion); else abrirFicha(f);
    };
    const noEsta = (que) => {
        alEmpezar.current = null;
        setNoEncontrada(que);
        setTickUrl((n) => n + 1);
    };
    useEffect(() => {
        const a = alEmpezar.current;
        if (!a?.equipo || !catalogo.datos) return;
        const eq = catalogo.datos.equipos?.find((x) => String(x.id) === String(a.equipo));
        if (eq) abrirDesdeDireccion({ tipo: 'equipo', equipo: eq }); else noEsta('equipo');
    }, [catalogo.datos]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const a = alEmpezar.current;
        if (!a?.cliente || !clientes.datos) return;
        const c = clientes.datos.find((x) => String(x.id_cliente) === String(a.cliente));
        if (c) abrirDesdeDireccion({ tipo: 'cliente', cliente: c }); else noEsta('cliente');
    }, [clientes.datos]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const a = alEmpezar.current;
        if (!a?.obra || !obras.datos) return;
        const o = obras.datos.obras?.find((x) => x.id === a.obra || x.numero_expediente === a.obra);
        if (!o) { noEsta('obra'); return; }
        const acc = !a.accion ? null
            : a.accion === 'factura' ? { tipo: 'accion', accion: 'factura', modo: o.factura_modo }
                : { tipo: 'accion', accion: a.accion };
        abrirDesdeDireccion({ tipo: 'obra', obra: o }, acc);
    }, [obras.datos]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const a = alEmpezar.current;
        if (!a?.presupuesto) return;
        abrirDesdeDireccion({ tipo: 'presupuesto', id: a.presupuesto });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Si la lista no carga (sin red), la dirección se queda como estaba hasta que cargue.

    // La dirección dice siempre lo que se ve (sin añadir entradas: eso lo hacen las
    // fichas). Mientras se espera para abrir la del enlace, no se pisa.
    useEffect(() => {
        if (alEmpezar.current) return;
        escribir(clavesDe({ seccion, ficha }), { estado: { ...(window.history.state || {}), iaFicha: pila.current } });
    }, [seccion, ficha, tickUrl]);

    // ── La app instalable y con su marca ──
    useEffect(() => ponerCabeceraInstalador(), []);
    const marca = useMemo(() => varsDeMarca(colorMarca), [colorMarca]);

    // Sin conexión: un aviso arriba; al volver la cobertura se pide todo otra vez.
    const enLinea = useEnLinea();
    const estabaSinRed = useRef(!enLinea);
    useEffect(() => {
        if (enLinea && estabaSinRed.current) onCambio();
        estabaSinRed.current = !enLinea;
    }, [enLinea, onCambio]);

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
            onVolver={cerrarFicha} onAbrirOportunidad={onAbrirOportunidad} onMiPagina={() => ir('pagina')}
            onHacerPresupuesto={(o) => nuevoPresupuesto({ obra: o.id }, { tipo: 'obra', obra: ficha.obra, accion: ficha.accion || null })}
            onAbrirPresupuesto={(h) => abrirPresu({ tipo: 'presupuesto', id: h.id, vuelta: { tipo: 'obra', obra: ficha.obra, accion: ficha.accion || null } })} />;
    } else if (ficha?.tipo === 'presupuesto') {
        const ac = ficha.accion;
        if (ficha.id === 'nuevo' || ac) {
            contenido = <PresupuestoForm key={`${ficha.id}-${ac?.accion || 'nuevo'}`} api={api}
                modo={ac?.accion || 'nuevo'} id={ficha.id === 'nuevo' ? null : ficha.id} entrada={ac?.entrada || null}
                desde={ficha.desde || null} onGuardado={presuGuardado} onVolver={volverPresu}
                volverTexto={ac ? 'El presupuesto' : ficha.vuelta?.tipo === 'obra' ? 'La obra' : ficha.vuelta?.tipo === 'cliente' ? 'El cliente' : 'Presupuestos'} />;
        } else {
            contenido = <PresupuestoFicha key={`${ficha.id}-${presuN}`} api={api} id={ficha.id} empresa={empresa} recien={!!ficha.recien}
                onVolver={volverPresu} onCambio={() => setPresuN((n) => n + 1)}
                onEditar={(entrada) => abrirPresu({ ...ficha, recien: false, accion: { accion: 'editar', entrada } })}
                onDuplicar={(entrada) => abrirPresu({ ...ficha, recien: false, accion: { accion: 'duplicar', entrada } })}
                onSimular={onNueva ? simularPresupuesto : null} onAbrirObra={abrirObraPorId} />;
        }
    } else if (ficha?.tipo === 'cliente') {
        const actual = (clientes.datos || []).find((c) => c.id_cliente === ficha.cliente.id_cliente) || ficha.cliente;
        contenido = <ClienteView cliente={actual} obras={obras.datos?.obras} onVolver={cerrarFicha}
            onCambiar={onCambiarCliente} onAbrirObra={abrirObra} onNueva={onNueva}
            onPresupuesto={(c) => nuevoPresupuesto({ cliente: c }, { tipo: 'cliente', cliente: c })} />;
    } else if (ficha?.tipo === 'equipo') {
        contenido = <EquipoView key={ficha.equipo.id} id={ficha.equipo.id} base={ficha.equipo} proveedores={catalogo.datos?.proveedores} api={api}
            onVolver={cerrarFicha} onCalcular={onNueva ? calcularCon : null} onCambio={onCambio} />;
    } else if (seccion === 'catalogo') {
        contenido = <CatalogoView datos={catalogo.datos} cargando={catalogo.cargando} error={catalogo.error} onReintentar={catalogo.reintentar}
            onAbrir={(eq) => abrirFicha({ tipo: 'equipo', equipo: eq })} />;
    } else if (seccion === 'obras') {
        contenido = <ObrasView datos={obras.datos} cargando={obras.cargando} error={obras.error} onReintentar={obras.reintentar}
            cargarDetalle={cargarDetalle} onAbrirObra={abrirObra} onAbrirOportunidad={onAbrirOportunidad} onAbrirAccion={abrirAccion} onNueva={onNueva} />;
    } else if (seccion === 'presupuestos') {
        contenido = <PresupuestosView datos={presupuestos.datos} cargando={presupuestos.cargando} error={presupuestos.error}
            onReintentar={presupuestos.reintentar} onAbrir={(p) => abrirPresu({ tipo: 'presupuesto', id: p.id })} onNuevo={() => nuevoPresupuesto()} />;
    } else if (seccion === 'pagina') {
        contenido = <MiPaginaView key={nonce} api={api} vistaInicial={paginaVista} />;
    } else if (seccion === 'clientes') {
        contenido = <ClientesView clientes={clientes.datos} obras={obras.datos?.obras} cargando={clientes.cargando} error={clientes.error}
            onReintentar={clientes.reintentar} onAbrir={(c) => abrirFicha({ tipo: 'cliente', cliente: c })} onNuevo={onNuevoCliente} />;
    } else {
        contenido = <InicioView saludo={saludo} datos={obras.datos} cargando={obras.cargando} error={obras.error}
            onReintentar={obras.reintentar} onNueva={onNueva} onVerObras={() => ir('obras')} onAbrirOportunidad={onAbrirOportunidad} onAbrirAccion={abrirAccion}
            onMiPagina={() => ir('pagina')} instalarComo={instalarComo}
            onPresupuesto={() => nuevoPresupuesto()} onVerPresupuestos={() => ir('presupuestos')} />;
    }

    const seccionVisible = ficha?.tipo === 'obra' ? 'obras' : ficha?.tipo === 'cliente' ? 'clientes' : ficha?.tipo === 'equipo' ? 'catalogo'
        : ficha?.tipo === 'presupuesto' ? (ficha.vuelta?.tipo === 'obra' ? 'obras' : ficha.vuelta?.tipo === 'cliente' ? 'clientes' : 'presupuestos') : externo ? 'obras' : seccion;
    const QUE_NO = {
        obra: 'Esa obra no está entre las tuyas, o ya no sigue en marcha.',
        cliente: 'Ese cliente no está entre los tuyos.',
        equipo: 'Ese equipo no está en tu catálogo.',
        presupuesto: 'Ese presupuesto no está entre los tuyos.',
    };
    return (
        <div className="ia-app" style={marca || undefined}>
            <EstiloInstalador />
            <div className="ia-filete" />
            <MarcoInstalador seccion={seccionVisible} onIr={ir} onNueva={onNueva} onPerfil={perfil}
                empresa={empresa} logo={logo} teToca={obras.datos?.resumen?.te_toca || 0} enLinea={enLinea}>
                {noEncontrada && !ficha && !externo && (
                    <div className="ia-pagina estrecha" style={{ paddingBottom: 0 }}>
                        <div className="ia-aviso tu ia-aviso-fila" role="status">
                            <span><b>No lo encontramos.</b> {QUE_NO[noEncontrada]}</span>
                            <button type="button" className="ia-link" onClick={() => setNoEncontrada(null)}>Entendido</button>
                        </div>
                    </div>
                )}
                {contenido}
            </MarcoInstalador>
            {hoja && (
                <HojaCuenta empresa={empresa} onCerrar={() => setHoja(false)}
                    onPerfil={onPerfil ? () => { setHoja(false); onPerfil(); } : null}
                    onPagina={() => { setHoja(false); ir('pagina'); }} onSalir={onSalir} />
            )}
        </div>
    );
}

/** La hoja del avatar / «Mi perfil»: nunca se cierra la sesión de un toque. */
function HojaCuenta({ empresa, onCerrar, onPerfil, onPagina, onSalir }) {
    const ref = useHojaTeclado(onCerrar);
    return (
        <div className="ia-velo" onPointerDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div ref={ref} className="ia-hoja" role="dialog" aria-modal="true" aria-label="Tu cuenta">
                <div className="ia-hoja-asa" />
                <p className="ia-eyebrow" style={{ padding: '4px 4px 10px' }}>{empresa || 'Tu cuenta'}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {onPerfil && <button type="button" className="ia-btn ia-btn-sec" onClick={onPerfil}><Icono n="clientes" size={20} /> Mis datos de empresa</button>}
                    <button type="button" className="ia-btn ia-btn-sec" onClick={onPagina}><Icono n="web" size={20} /> Tu página web</button>
                    {onSalir && <button type="button" className="ia-btn ia-btn-sec" onClick={onSalir}><Icono n="salir" size={20} /> Cerrar sesión</button>}
                    <button type="button" className="ia-btn ia-btn-sec" onClick={onCerrar}>Volver</button>
                </div>
            </div>
        </div>
    );
}
