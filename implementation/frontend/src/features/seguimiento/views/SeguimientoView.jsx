// ============================================================================
// SeguimientoView.jsx — la cola de trabajo diaria del equipo.
//
// POR QUÉ NO VA DENTRO DEL CUADRO DE MANDO, aunque fuera lo primero que se pensó:
//   · El cuadro de mando responde "cómo va el negocio" (GWh, margen, embudo). Esto
//     responde "qué hago yo ahora". Son dos modos mentales y dos frecuencias: el
//     primero se mira una vez por semana, éste cada mañana.
//   · El cuadro de mando es ADMIN-only porque agrega importes y margen. El parte NO
//     lleva ni un euro, así que el TRABAJADOR lo ve igual — y es justo quien más lo
//     necesita, porque es su lista de tareas.
//
// ESTÁ PENSADA PARA EL MÓVIL, y eso manda sobre todo lo demás. Se despacha de pie,
// con una mano, fuera de la oficina. De ahí:
//   · La LISTA es la protagonista. El titular se resume en UNA fila de píldoras
//     desplazables, no en cuatro tarjetas que se comen la primera pantalla: los
//     números no son el trabajo, son el contexto del trabajo.
//   · Cada tarjeta lleva su acción en un botón A TODO EL ANCHO y ABAJO, que es donde
//     llega el pulgar. Un botón arriba a la derecha obliga a cambiar el agarre.
//   · El nombre del destinatario NUNCA se trunca a media palabra ("LUIS ALBERTO
//     LAN…" no identifica a nadie): se deja envolver a dos líneas.
//   · Los números de expediente se limitan a los que caben en UNA línea y el resto
//     se cuentan (+5). Siete chips apilados eran siete líneas de ruido por tarjeta.
//   · Barra de color a la izquierda: deja escanear por tipo de atasco sin leer.
//
// DOS LECTURAS de los mismos datos, y el orden importa:
//   · DESPACHAR (por destinatario) — por defecto. Agrupa por persona a la que hay que
//     escribir: un certificador con 7 expedientes es UNA tarjeta y UN mensaje.
//   · REVISAR (por bloque) — el diagnóstico: qué tipo de atasco hay y cuánto.
// Se entra a trabajar, no a mirar; por eso manda la primera.
//
// PARADO vs EN PLAZO. El radar emite ahora la cartera entera y marca cada línea con
// su plazo cumplido o no. La pantalla NO puede tratarlas igual: lo parado es la lista
// de tareas y lo que va en plazo es el contexto que permite fiarse de ella. Se cuentan
// aparte, se pintan aparte y lo atenuado va detrás. Antes solo llegaba lo vencido, y
// un expediente movido ayer no aparecía en ningún sitio: la pantalla no se podía usar
// para responder "¿cómo vamos?", solo "¿qué está ardiendo?".
// ============================================================================
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { EnvioLoteModal } from '../components/EnvioLoteModal';
import { abrirCarpetaLocal } from '../../../utils/carpetaLocal';
import { TecnicoPicker } from '../../expedientes/components/TecnicoPicker';
import { EncargoCertificadorModal } from '../../expedientes/components/EncargoCertificadorModal';

// Tono por bloque. El color es información: dice cuánto duele, no adorna.
const TONO = {
    RECHAZO_SIN_REENVIAR: { txt: 'text-rose-400', bg: 'bg-rose-500/10', bd: 'border-rose-500/25', barra: 'bg-rose-500' },
    REVISION:             { txt: 'text-red-400', bg: 'bg-red-500/10', bd: 'border-red-500/25', barra: 'bg-red-500' },
    OBRA_SIN_CERRAR:      { txt: 'text-amber-500', bg: 'bg-amber-600/10', bd: 'border-amber-600/25', barra: 'bg-amber-600' },
    TRAMITACION:          { txt: 'text-orange-300', bg: 'bg-orange-400/10', bd: 'border-orange-400/25', barra: 'bg-orange-400' },
    // Verde: es el único bloque que no habla de un documento sino de DINERO parado.
    SIN_LOTEAR:           { txt: 'text-emerald-400', bg: 'bg-emerald-500/10', bd: 'border-emerald-500/25', barra: 'bg-emerald-500' },
    REGISTRO:             { txt: 'text-orange-400', bg: 'bg-orange-500/10', bd: 'border-orange-500/25', barra: 'bg-orange-500' },
    CERT_SIN_ENTREGAR:    { txt: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', bd: 'border-fuchsia-500/25', barra: 'bg-fuchsia-500' },
    SIN_ENCARGAR:         { txt: 'text-slate-300', bg: 'bg-slate-500/10', bd: 'border-slate-500/25', barra: 'bg-slate-400' },
    MIGRADO_SIN_REVISAR:  { txt: 'text-violet-400', bg: 'bg-violet-500/10', bd: 'border-violet-500/25', barra: 'bg-violet-500' },
    FIRMA_PENDIENTE:      { txt: 'text-yellow-400', bg: 'bg-yellow-500/10', bd: 'border-yellow-500/25', barra: 'bg-yellow-500' },
    FIN_OBRA:             { txt: 'text-sky-400', bg: 'bg-sky-500/10', bd: 'border-sky-500/25', barra: 'bg-sky-500' },
};
const tono = (b) => TONO[b] || TONO.SIN_ENCARGAR;

// La antigüedad se lee por el color, sin comparar números.
// El bloque de revisión ya no espera a que pase un día (umbral 0), así que aquí
// aparecen entregas de HOY. "0 d" se lee como si faltara el dato; "hoy" dice lo que
// es y de paso distingue lo que acaba de entrar de lo que lleva semanas.
const textoDias = (d, sinFecha) => (sinFecha ? '—' : d === 0 ? 'hoy' : `${d} d`);

const colorDias = (d, sinFecha) =>
    sinFecha ? 'text-white/30' : d > 60 ? 'text-red-400' : d > 30 ? 'text-orange-400' : d > 14 ? 'text-amber-400' : 'text-white/45';

// Iconos de rol en SVG y no en emoji: el emoji depende de la fuente del sistema y en
// Chrome sobre Windows la escuadra (U+1F4D0) sale como un cuadro gris ilegible.
const ROL_PATH = {
    CERTIFICADOR: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    INSTALADOR: 'M11 4a4 4 0 105.657 5.657l-1.414 1.414 3.536 3.536a2 2 0 01-2.829 2.829l-3.535-3.536-1.415 1.414A4 4 0 1011 4z',
    CLIENTE: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
};

function IconoRol({ tipo, className }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d={ROL_PATH[tipo] || ROL_PATH.CLIENTE} />
        </svg>
    );
}
const ROL_TXT = { CERTIFICADOR: 'Certificador', INSTALADOR: 'Instalador', CLIENTE: 'Cliente' };

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function SeguimientoView() {
    const { showAlert } = useModal();
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState(null);
    const [modo, setModo] = useState('despachar');
    const [grupoAbierto, setGrupoAbierto] = useState(null);
    const [bloquesAbiertos, setBloquesAbiertos] = useState(() => new Set());
    const [filtro, setFiltro] = useState('');
    const [buscando, setBuscando] = useState(false);
    // Lo despachado en esta sesión. Tras cada envío la lista se recarga entera y, sin
    // esto, no queda ninguna señal de que hayas avanzado: da la sensación de no haber
    // servido de nada y se acaba mandando dos veces lo mismo.
    const [hechos, setHechos] = useState(0);
    // Encargar el CEE sin salir de la cola: la lista de técnicos (ligera, ver la
    // ruta) y la fila cuyo encargo se está preparando.
    const [certificadores, setCertificadores] = useState([]);
    const [encargo, setEncargo] = useState(null);   // { fila, certificador }

    const cargar = useCallback(async () => {
        try {
            setCargando(true);
            setError(null);
            const { data } = await axios.get('/api/seguimiento/parte');
            setDatos(data);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { cargar(); }, [cargar]);

    useEffect(() => {
        axios.get('/api/seguimiento/certificadores')
            .then(r => setCertificadores(r.data || []))
            .catch(() => setCertificadores([]));
    }, []);

    // Grupo "pedir el material del CEE" en el que está cada expediente, para que la
    // fila ofrezca pedirlo sin tener que ir a buscarlo a Despachar. Solo existen los
    // que ya han pasado de plazo: lo reciente no se reclama solo.
    const grupoPedirDe = useMemo(() => {
        const m = new Map();
        for (const g of datos?.por_destinatario || []) {
            if (g.tipo !== 'pedir-cee') continue;
            for (const e of [...(g.expedientes || []), ...(g.opcionales || [])]) m.set(e.expediente_id, g);
        }
        return m;
    }, [datos]);

    const abrirEncargo = (fila, certId) => {
        const certificador = certificadores.find(c => String(c.id_empresa) === String(certId));
        if (certificador) setEncargo({ fila, certificador });
    };

    const grupos = useMemo(() => {
        const g = datos?.por_destinatario || [];
        if (!filtro.trim()) return g;
        const q = norm(filtro);
        // Busca por destinatario Y por expediente: unas veces se llega por "¿qué le
        // debo a Lanuza?" y otras por "¿qué pasa con el 26RES060_104?".
        return g.filter(x => norm(x.destinatario?.nombre).includes(q)
            || x.expedientes.some(e => norm(e.numero_expediente).includes(q) || norm(e.cliente_nombre).includes(q)));
    }, [datos, filtro]);

    // El MISMO buscador en REVISAR, que es donde de verdad hace falta: aquí no hay 28
    // tarjetas sino 178 filas repartidas en once bloques plegados, así que sin él la
    // única forma de responder "¿y el 26RES060_119?" es abrirlos todos y mirar. Filtra
    // las FILAS —no los bloques— y descarta el bloque que se queda sin ninguna: una
    // cabecera vacía haría creer que el expediente está ahí dentro.
    const bloques = useMemo(() => {
        const b = datos?.por_bloque || [];
        if (!filtro.trim()) return b;
        const q = norm(filtro);
        return b
            .map(x => ({ ...x, filas: x.filas.filter(f =>
                norm(f.numero_expediente).includes(q) || norm(f.cliente_nombre).includes(q)
                || norm(f.municipio).includes(q) || norm(f.certificador_nombre).includes(q)
                || norm(f.instalador_nombre).includes(q)) }))
            .filter(x => x.filas.length);
    }, [datos, filtro]);

    const toggleBloque = (b) => setBloquesAbiertos(prev => {
        const s = new Set(prev);
        if (s.has(b)) s.delete(b); else s.add(b);
        return s;
    });

    // ⚠️ `showAlert` es (mensaje, título, variante) — NO un objeto. Con un objeto,
    // el provider renderiza `{message}` y React tumba la app entera ("Objects are
    // not valid as a React child"), así que pulsar este botón dejaba la pantalla en
    // blanco en vez de dar el acuse.
    const mandarParte = async () => {
        try {
            const { data } = await axios.post('/api/seguimiento/enviar-parte');
            if (data.ok && data.enviados) {
                showAlert(`Te lo hemos mandado por WhatsApp y email (${data.total} expedientes).`, 'Parte enviado', 'success');
            } else {
                showAlert(
                    data.reason === 'ya-avisado-hoy' ? 'El parte de hoy ya se te ha enviado.'
                        : data.reason === 'deshabilitado' ? 'Los avisos están deshabilitados en este entorno.'
                        : 'No hay nada por encima del umbral.',
                    'Sin novedades', 'info');
            }
        } catch (e) {
            showAlert(e.response?.data?.error || e.message, 'No se ha podido enviar', 'error');
        }
    };

    if (cargando) return <Esqueleto />;

    if (error) {
        return (
            <div className="p-4 max-w-3xl mx-auto">
                <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-6 text-center">
                    <p className="text-sm font-bold text-red-300">No se ha podido cargar el parte</p>
                    <p className="text-xs text-white/40 mt-1 break-words">{error}</p>
                    <button onClick={cargar} className="mt-4 w-full sm:w-auto px-5 py-3 rounded-xl bg-brand text-bkg-deep text-xs font-black uppercase tracking-wider">Reintentar</button>
                </div>
            </div>
        );
    }

    const totalAcc = datos?.accionables || 0;
    const nGrupos = datos?.grupos_envio || 0;
    // PARADOS son los que han pasado de plazo; EN PLAZO, los que están en marcha y
    // todavía no toca reclamar. Antes no existía la distinción porque el escaneo
    // filtraba: lo reciente no aparecía en ningún sitio y la pantalla no se podía
    // usar para saber cómo vamos, solo para apagar fuegos.
    const parados = datos?.parados ?? datos?.total ?? 0;
    const enPlazo = datos?.en_plazo || 0;
    const mios = parados - totalAcc;

    return (
        <div className="px-3 sm:px-6 pt-3 pb-24 md:pb-8 max-w-3xl xl:max-w-5xl mx-auto">

            {/* ── Cabecera: una sola línea, con las acciones como iconos ──────── */}
            <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 min-w-0">
                    <h1 className="text-lg sm:text-2xl font-black text-white tracking-tight leading-tight">Seguimiento</h1>
                    <p className="text-[11px] sm:text-xs text-white/35 leading-tight mt-0.5">
                        {hechos > 0
                            ? <span className="text-emerald-400 font-bold">{hechos} despachado{hechos === 1 ? '' : 's'} en esta sesión</span>
                            : 'Lo que te toca a ti y lo que llevas esperando de otros'}
                    </p>
                </div>
                <BotonIcono onClick={cargar} titulo="Volver a escanear">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </BotonIcono>
                <BotonIcono onClick={mandarParte} titulo="Mandarme el parte por WhatsApp y email">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </BotonIcono>
            </div>

            {/* ── Titular: una fila desplazable, no cuatro tarjetas ───────────── */}
            <div className="flex gap-2 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 mb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <Pastilla n={totalAcc} txt="por reclamar" tono="text-brand" destacada />
                <Pastilla n={nGrupos} txt="mensajes" tono="text-emerald-400"
                    pie={totalAcc > nGrupos ? `−${totalAcc - nGrupos}` : null} />
                <Pastilla n={mios} txt="en tu tejado" tono="text-amber-400" />
                <Pastilla n={parados} txt="parados" tono="text-white/70" />
                <Pastilla n={enPlazo} txt="en plazo" tono="text-white/40" />
            </div>

            {/* ── Modo + búsqueda ─────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 inline-flex rounded-xl border border-white/10 p-1 bg-bkg-surface/40">
                    {[['despachar', 'Despachar', nGrupos], ['revisar', 'Revisar', parados]].map(([id, txt, n]) => (
                        <button key={id} onClick={() => setModo(id)}
                            className={`flex-1 px-2 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                                modo === id ? 'bg-brand text-bkg-deep shadow-lg shadow-brand/20' : 'text-white/40'}`}>
                            {txt} <span className="opacity-60">{n}</span>
                        </button>
                    ))}
                </div>
                <BotonIcono onClick={() => { setBuscando(v => !v); if (buscando) setFiltro(''); }} titulo="Buscar" activo={buscando || !!filtro}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </BotonIcono>
            </div>

            {(buscando || filtro) && (
                // 16px de fuente: por debajo de eso, iOS hace zoom al enfocar el campo
                // y deja la pantalla descuadrada.
                <input autoFocus value={filtro} onChange={e => setFiltro(e.target.value)}
                    placeholder={modo === 'despachar' ? 'Destinatario, cliente o nº de expediente…' : 'Nº de expediente, cliente, municipio o técnico…'}
                    className="w-full mb-3 px-4 py-3 rounded-xl bg-bkg-surface/60 border border-white/10 text-base text-white placeholder:text-white/25 focus:border-brand/50 focus:outline-none" />
            )}

            {/* ── Contenido ───────────────────────────────────────────────────── */}
            {modo === 'despachar' ? (
                grupos.length === 0 ? (
                    <Vacio titulo={filtro ? 'Nada con ese filtro' : 'No hay nada que reclamar'}
                        texto={filtro ? 'Prueba con otro nombre o número.' : 'Todo lo pendiente está en tu tejado o ya reclamado.'} />
                ) : (
                    <div className="space-y-2.5">
                        {grupos.map(g => <TarjetaGrupo key={g.clave} g={g} onAbrir={() => setGrupoAbierto(g)} />)}
                    </div>
                )
            ) : (
                bloques.length === 0 ? (
                    <Vacio titulo={filtro ? 'Nada con ese filtro' : 'Nada pendiente'}
                        texto={filtro ? 'Prueba con otro nombre, municipio o número.' : 'No hay expedientes atascados.'} />
                ) : (
                    <div className="space-y-2.5">
                        {bloques.map(b => (
                            // Buscando, los bloques se abren SOLOS: con ellos plegados, el
                            // resultado sería una cabecera que hay que pulsar para ver si
                            // dentro está lo que buscas — el mismo trabajo que quita el
                            // buscador. Al vaciar el filtro vuelve a mandar lo que hubieras
                            // desplegado a mano.
                            <BloqueDiagnostico key={b.bloque} b={b} filtrando={!!filtro.trim()}
                                abierto={bloquesAbiertos.has(b.bloque) || !!filtro.trim()}
                                onToggle={() => toggleBloque(b.bloque)}
                                certificadores={certificadores}
                                encargoEnCurso={encargo}
                                onEncargar={abrirEncargo}
                                grupoPedirDe={grupoPedirDe}
                                onPedir={setGrupoAbierto} />
                        ))}
                    </div>
                )
            )}

            {encargo && (
                <EncargoCertificadorModal
                    key={`${encargo.fila.expediente_id}-${encargo.certificador.id_empresa}`}
                    expedienteId={encargo.fila.expediente_id}
                    numExp={encargo.fila.numero_expediente}
                    clienteNombre={encargo.fila.cliente_nombre || ''}
                    ceeFolderLink={encargo.fila.cee_folder_link || null}
                    certificador={encargo.certificador}
                    certAnterior={encargo.fila.certificador_id || null}
                    avisoPrevio={encargo.fila.material && !encargo.fila.material.listo
                        ? `Aún falta: ${encargo.fila.material.faltan.join(', ')}. El técnico no podrá levantar el CEE inicial hasta tenerlo — pídeselo al cliente o avísale de que tendrá que hacerlo en la visita.`
                        : null}
                    onCerrar={(confirmado) => {
                        setEncargo(null);
                        // Hecho: la fila sale de este bloque y pasa a "Encargados al
                        // certificador". Se vuelve a escanear para que la cola diga la verdad.
                        if (confirmado) { setHechos(h => h + 1); cargar(); }
                    }}
                />
            )}

            {grupoAbierto && (
                <EnvioLoteModal
                    grupo={grupoAbierto}
                    onCerrar={() => setGrupoAbierto(null)}
                    onHecho={(n) => { setGrupoAbierto(null); setHechos(h => h + (n || 1)); cargar(); }}
                />
            )}
        </div>
    );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

/** Botón cuadrado de 44 px: el mínimo que se acierta con el pulgar sin mirar. */
function BotonIcono({ onClick, titulo, children, activo }) {
    return (
        <button onClick={onClick} title={titulo} aria-label={titulo}
            className={`shrink-0 w-11 h-11 rounded-xl border flex items-center justify-center transition-colors ${
                activo ? 'border-brand/50 text-brand bg-brand/10' : 'border-white/10 text-white/45 active:bg-white/5'}`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">{children}</svg>
        </button>
    );
}

function Pastilla({ n, txt, tono, pie, destacada }) {
    return (
        <div className={`shrink-0 rounded-xl border px-3.5 py-2 ${destacada ? 'border-brand/30 bg-brand/5' : 'border-white/[0.07] bg-bkg-surface/60'}`}>
            <div className="flex items-baseline gap-1.5">
                <span className={`text-xl font-black tabular-nums leading-none ${tono}`}>{n}</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-white/35 whitespace-nowrap">{txt}</span>
                {pie && <span className="text-[10px] font-black text-emerald-400/70">{pie}</span>}
            </div>
        </div>
    );
}

function Esqueleto() {
    return (
        <div className="px-3 sm:px-6 pt-3 max-w-3xl mx-auto animate-pulse">
            <div className="h-7 w-40 bg-white/5 rounded-lg mb-3" />
            <div className="flex gap-2 mb-3">{[...Array(3)].map((_, i) => <div key={i} className="h-11 w-28 bg-white/5 rounded-xl shrink-0" />)}</div>
            <div className="h-12 bg-white/5 rounded-xl mb-3" />
            <div className="space-y-2.5">{[...Array(5)].map((_, i) => <div key={i} className="h-32 bg-white/5 rounded-2xl" />)}</div>
        </div>
    );
}

function Vacio({ titulo, texto }) {
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-bkg-surface/60 py-14 text-center px-4">
            <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
            </div>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400/70">{titulo}</p>
            <p className="text-[11px] font-bold text-white/25 mt-1.5">{texto}</p>
        </div>
    );
}

/**
 * Una persona a la que escribir, con todo lo que se le reclama de una vez.
 * La tarjeta entera es pulsable Y además lleva su botón: el botón dice qué va a pasar
 * (no todo el mundo prueba a tocar una tarjeta) y el área grande perdona el dedo.
 */
function TarjetaGrupo({ g, onAbrir }) {
    const t = tono(g.bloque);
    const n = g.total;
    // Cuántos números caben sin apilarse en un móvil de 375 px. El resto se cuenta:
    // siete chips eran siete líneas de ruido por tarjeta.
    const VISIBLES = 2;
    const muestra = g.expedientes.slice(0, VISIBLES);
    const resto = n - muestra.length;

    return (
        <div onClick={onAbrir} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}
            className={`relative rounded-2xl border ${t.bd} bg-bkg-surface/60 active:bg-bkg-hover/50 transition-colors overflow-hidden cursor-pointer`}>
            {/* Barra de color: escanear por tipo de atasco sin leer una palabra. */}
            <span className={`absolute left-0 top-0 bottom-0 w-1 ${t.barra}`} />

            <div className="pl-4 pr-3.5 py-3.5">
                <div className="flex items-start gap-3">
                    <span className={`w-9 h-9 shrink-0 rounded-xl ${t.bg} ${t.txt} flex items-center justify-center`}>
                        <IconoRol tipo={g.destinatario?.tipo} className="w-[18px] h-[18px]" />
                    </span>
                    <div className="flex-1 min-w-0">
                        {/* El nombre NO se trunca: "LUIS ALBERTO LAN…" no identifica a nadie. */}
                        <div className="font-black text-white text-[15px] leading-tight break-words">
                            {g.destinatario?.nombre || 'Sin nombre'}
                        </div>
                        <div className="text-[11px] text-white/35 mt-0.5">{ROL_TXT[g.destinatario?.tipo] || ''}</div>
                    </div>
                    <span className={`shrink-0 text-[11px] font-black tabular-nums ${colorDias(g.dias)}`}>{textoDias(g.dias)}</span>
                </div>

                <div className={`text-[12px] font-bold ${t.txt} mt-2.5 leading-snug`}>{g.etiqueta}</div>

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${t.bg} ${t.txt} tabular-nums shrink-0`}>
                        {n} exp.
                    </span>
                    {muestra.map(e => (
                        <span key={e.expediente_id} className="px-1.5 py-0.5 rounded-md bg-white/[0.04] text-[10px] font-bold text-white/40 tabular-nums shrink-0">
                            {e.numero_expediente}
                        </span>
                    ))}
                    {resto > 0 && <span className="text-[10px] font-bold text-white/25 shrink-0">+{resto}</span>}
                </div>

                {/* Acción a todo el ancho y ABAJO: es donde llega el pulgar. */}
                <button onClick={(ev) => { ev.stopPropagation(); onAbrir(); }}
                    className="mt-3 w-full py-3 rounded-xl bg-brand/10 text-brand text-[12px] font-black uppercase tracking-wider active:bg-brand active:text-bkg-deep transition-colors">
                    Preparar mensaje
                </button>
            </div>
        </div>
    );
}

/**
 * Acceso directo a la carpeta del expediente en el EXPLORADOR (el espejo local de
 * Drive para escritorio). Aquí es donde de verdad hace falta: revisar un CEE o
 * mirar una factura es abrir su carpeta, y llegar a ella obligaba a salir de la
 * lista, abrir el expediente y volver — perdiendo el sitio de la cola de trabajo.
 *
 * El GESTO no se reimplementa: `abrirCarpetaLocal` es la fuente única (pedir la
 * ruta, copiarla al portapapeles y lanzar el protocolo `brokergylocal:`), con sus
 * detalles de base64url que no se deben "simplificar". Aquí solo va el dibujo del
 * botón, que sigue el lenguaje de ESTA pantalla y no el del listado.
 *
 * REGLA — en MÓVIL no se pinta. El protocolo es de Windows: en un teléfono no abre
 * nada y la ruta que copia (`G:\Mi unidad\…`) no sirve para nada. Esta vista está
 * pensada para el pulgar, así que un botón que ahí no puede funcionar solo ocupa el
 * sitio de lo que sí (mismo criterio que la pista "o arrástralas aquí" de DocsManager).
 *
 * La ruta es `staffOnly` y toda esta pantalla es de staff, así que no hace falta
 * comprobar el rol: al certificador no le llega esta vista.
 */
function BotonCarpeta({ f }) {
    const { showAlert } = useModal();
    const [abriendo, setAbriendo] = useState(false);

    // La ruta resuelve por UUID Y por número de expediente, así que el número vale
    // de respaldo: una fila sin id no puede quedarse sin su carpeta.
    const ref = f.expediente_id || f.numero_expediente;
    if (!ref) return null;

    const abrir = async (e) => {
        // La fila es un enlace a la app: este botón va a otro sitio.
        e.preventDefault();
        e.stopPropagation();
        if (abriendo) return;
        setAbriendo(true);
        const r = await abrirCarpetaLocal(`/api/expedientes/${encodeURIComponent(ref)}/local-path`);
        // Un fallo se DICE: sin aviso, el botón que no abre nada no se distingue de
        // un PC al que le falta el protocolo registrado.
        if (!r.ok) showAlert(r.error, 'No se ha podido abrir la carpeta', 'error');
        setAbriendo(false);
    };

    return (
        <button type="button" onClick={abrir} disabled={abriendo}
            title={`Abrir la carpeta de ${f.numero_expediente} en el Explorador (se copia también la ruta)`}
            aria-label={`Abrir la carpeta de ${f.numero_expediente} en el Explorador`}
            className="hidden md:flex shrink-0 w-9 h-9 mr-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 items-center justify-center hover:bg-emerald-500/20 disabled:opacity-40 transition-colors">
            {abriendo ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                </svg>
            ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
            )}
        </button>
    );
}

/** Una fila del diagnóstico. `enPlazo` la atenúa: está en marcha, no es una tarea. */
function FilaExpediente({ f, enPlazo }) {
    return (
        // El botón va FUERA del enlace, como hermano: un <button> dentro de un <a> es
        // contenido interactivo anidado y el navegador puede acabar haciendo las dos
        // cosas. El realce al pulsar se queda en el <a>, o tocar el botón teñiría la
        // fila entera y parecería que se ha abierto el expediente.
        <div className={`flex items-center rounded-xl ${enPlazo ? 'opacity-60' : ''}`}>
            <a href={`/?exp=${encodeURIComponent(f.numero_expediente)}`}
                className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl active:bg-bkg-hover/50 transition-colors">
                <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-brand text-[11px] tabular-nums">{f.numero_expediente}</span>
                        {f.silenciada && (
                            <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-[9px] font-bold text-white/35 whitespace-nowrap">{f.silenciada}</span>
                        )}
                    </span>
                    <span className="block text-[11px] text-white/60 leading-snug mt-0.5">{f.detalle}</span>
                    <span className="block text-[10px] text-white/25 truncate">{f.cliente_nombre || f.municipio || '—'}</span>
                    {f.material && <MaterialCee m={f.material} className="mt-1.5" />}
                </span>
                <span className={`text-[11px] font-black tabular-nums shrink-0 ${enPlazo ? 'text-white/30' : colorDias(f.dias, f.sin_fecha)}`}>
                    {textoDias(f.dias, f.sin_fecha)}
                </span>
            </a>
            <BotonCarpeta f={f} />
        </div>
    );
}

/**
 * Un tipo de atasco, con todas sus filas. Vista de diagnóstico.
 *
 * REGLA — lo PARADO primero y lo que va EN PLAZO detrás, nunca mezclado y nunca
 * escondido. Antes solo llegaba lo parado, así que un CEE que le pediste ayer al
 * certificador no estaba en ninguna parte y la pantalla no servía para saber cómo
 * vamos. Mezclarlos sería el error contrario: la lista deja de decir qué hacer hoy.
 * Por eso el contador de la cabecera cuenta lo PARADO —que es lo que duele— y lo que
 * va en plazo se anuncia aparte, atenuado y bajo su propio rótulo.
 */
function BloqueDiagnostico({ b, abierto, onToggle, filtrando, certificadores, encargoEnCurso, onEncargar, grupoPedirDe, onPedir }) {
    const esEncargo = b.bloque === 'SIN_ENCARGAR';
    // Una FUNCIÓN y no un componente definido aquí dentro: un componente nuevo en
    // cada render desmontaría la fila —y con ella el desplegable abierto— cada vez.
    const fila = (f, key, enPlazo) => (esEncargo
        ? <FilaEncargo key={key} f={f} enPlazo={enPlazo} certificadores={certificadores}
            encargoEnCurso={encargoEnCurso} onEncargar={onEncargar}
            grupoPedir={grupoPedirDe?.get(f.expediente_id)} onPedir={onPedir} />
        : <FilaExpediente key={key} f={f} enPlazo={enPlazo} />);
    const t = tono(b.bloque);
    const vencidas = b.filas.filter(f => f.vencida);
    const enPlazo = b.filas.filter(f => !f.vencida);
    return (
        <div className="rounded-2xl border border-white/[0.06] bg-bkg-surface/60 overflow-hidden">
            <button onClick={onToggle} disabled={filtrando}
                className="w-full flex items-center gap-3 p-3.5 active:bg-bkg-hover/40 transition-colors text-left">
                <span className={`w-1.5 h-8 rounded-full ${t.barra} shrink-0 ${vencidas.length ? '' : 'opacity-30'}`} />
                <span className="font-black text-white text-[13px] flex-1 leading-tight">{b.titulo}</span>
                <span className={`px-2.5 py-1 rounded-lg text-[11px] font-black tabular-nums shrink-0 ${
                    vencidas.length ? `${t.bg} ${t.txt}` : 'bg-white/[0.04] text-white/30'}`}>{vencidas.length}</span>
                {enPlazo.length > 0 && (
                    <span className="text-[10px] font-bold text-white/25 tabular-nums shrink-0" title="En plazo: aún no toca reclamar">
                        +{enPlazo.length}
                    </span>
                )}
                {/* Filtrando no hay nada que plegar: una flecha que no responde se lee
                    como que la pantalla se ha quedado colgada. */}
                {!filtrando && (
                    <svg className={`w-4 h-4 text-white/30 transition-transform shrink-0 ${abierto ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                    </svg>
                )}
            </button>
            {abierto && (
                <div className="border-t border-white/[0.06]">
                    {b.nota && <p className="px-4 pt-3 text-[11px] text-white/35 leading-relaxed">{b.nota}</p>}
                    {esEncargo && <ResumenMaterial filas={b.filas} />}
                    <div className="p-2 space-y-0.5">
                        {vencidas.map((f, i) => fila(f, `v-${f.expediente_id}-${i}`, false))}
                        {enPlazo.length > 0 && (
                            <>
                                <p className="px-2.5 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-white/25">
                                    En plazo · {b.umbral_dias > 0 ? `menos de ${b.umbral_dias} días` : 'en marcha'}
                                </p>
                                {enPlazo.map((f, i) => fila(f, `p-${f.expediente_id}-${i}`, true))}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Encargar el CEE desde la cola ───────────────────────────────────────────

/**
 * ¿Tiene el técnico con qué levantar el CEE inicial? Tres chapas, una por pieza:
 * la vivienda (vídeo, o fachada + patios), la caldera y su placa. El criterio NO
 * se decide aquí: lo manda el backend en `f.material` (utils/materialCee.js), que
 * es el mismo con el que el parte le reclama las fotos al cliente.
 *
 * ⚠️ Cuenta lo subido por el enlace (`reforma_uploads`), no la carpeta de Drive:
 * traer Drive de toda la cartera es una llamada por expediente. Una foto copiada a
 * mano en la carpeta sale aquí como que falta — el mensaje al cliente sí reconcilia
 * con Drive y no se la pediría.
 */
function MaterialCee({ m, className = '' }) {
    if (!m) return null;
    const chapa = (tono, txt, title) => (
        <span title={title}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold whitespace-nowrap ${
                tono === 'ok' ? 'bg-emerald-500/10 text-emerald-400'
                : tono === 'medio' ? 'bg-amber-500/10 text-amber-400'
                : tono === 'no' ? 'bg-red-500/10 text-red-400'
                : 'bg-white/[0.04] text-white/35'}`}>
            {txt}
        </span>
    );
    const v = m.vivienda;
    const vivienda = v.estado === 'ok'
        ? chapa('ok', `✓ Vivienda · ${v.video ? 'vídeo' : 'fotos'}`,
            v.video ? 'Hay vídeo de la vivienda' : `Fachada (${v.fachada}) y patios (${v.patios})`)
        : v.estado === 'parcial'
            ? chapa('medio', '✓ Fachada · sin patios',
                `Hay ${v.fachada} foto(s) de la fachada y ninguna de patios. Si la vivienda no tiene patio, está completo.`)
            : chapa('no', '✗ Vivienda', 'Ni vídeo de la vivienda ni fotos de la fachada');
    return (
        <span className={`flex flex-wrap items-center gap-1 ${className}`}>
            {vivienda}
            {m.caldera.aplica ? (
                <>
                    {chapa(m.caldera.fotos ? 'ok' : 'no', `${m.caldera.fotos ? '✓' : '✗'} Caldera`,
                        m.caldera.fotos ? `${m.caldera.fotos} foto(s) de la caldera` : 'Falta la foto de la caldera que se va a cambiar')}
                    {chapa(m.placa.fotos ? 'ok' : 'no', `${m.placa.fotos ? '✓' : '✗'} Placa`,
                        m.placa.fotos ? 'Hay foto de la placa de la caldera' : 'Falta la foto de la placa (marca, modelo y potencia)')}
                </>
            ) : chapa('gris', 'Sin calefacción', 'La vivienda declara no tener calefacción: no hay caldera que fotografiar')}
        </span>
    );
}

/** El recuento del bloque: cuántos se pueden encargar ya y cuántos esperan al cliente. */
function ResumenMaterial({ filas }) {
    const conMaterial = filas.filter(f => f.material);
    if (!conMaterial.length) return null;
    const listos = conMaterial.filter(f => f.material.listo).length;
    const faltan = conMaterial.length - listos;
    return (
        <div className="px-4 pt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="font-black text-emerald-400">{listos} con el material completo</span>
            {faltan > 0 && <span className="font-black text-red-400">{faltan} esperando fotos del cliente</span>}
            <span className="text-white/25">· según lo subido por el enlace de la vivienda</span>
        </div>
    );
}

/**
 * Una fila de "Aceptados y sin encargar el CEE", con lo necesario para resolverla
 * SIN SALIR DE LA COLA: qué material hay, a qué técnico se le manda y el encargo.
 *
 * Elegir técnico abre el MISMO popup que en el expediente (`EncargoCertificadorModal`),
 * con su "Solo asignar", su aviso al cliente y su resultado. Cerrarlo sin confirmar
 * DESHACE la elección: el desplegable vuelve a lo que consta en el expediente, o la
 * fila diría que lo tiene un técnico al que nadie se lo ha asignado.
 *
 * Con técnico ya puesto y el encargo sin mandar (el peor sitio donde esconderse:
 * en la ficha parece que está en marcha), el botón dice justo eso.
 */
function FilaEncargo({ f, enPlazo, certificadores, encargoEnCurso, onEncargar, grupoPedir, onPedir }) {
    const enEsteEncargo = encargoEnCurso?.fila?.expediente_id === f.expediente_id;
    const valor = enEsteEncargo ? encargoEnCurso.certificador.id_empresa : (f.certificador_id || '');
    const faltaMaterial = f.material && !f.material.listo;

    return (
        <div className={`rounded-xl ${enPlazo ? 'opacity-60' : ''}`}>
            <div className="flex items-center">
                <a href={`/?exp=${encodeURIComponent(f.numero_expediente)}`}
                    className="flex-1 min-w-0 flex items-center gap-2.5 px-2.5 pt-2.5 pb-1.5 rounded-xl active:bg-bkg-hover/50 transition-colors">
                    <span className="flex-1 min-w-0">
                        <span className="font-black text-brand text-[11px] tabular-nums">{f.numero_expediente}</span>
                        <span className="block text-[11px] text-white/60 leading-snug mt-0.5">{f.detalle}</span>
                        <span className="block text-[10px] text-white/25 truncate">{f.cliente_nombre || f.municipio || '—'}</span>
                    </span>
                    <span className={`text-[11px] font-black tabular-nums shrink-0 ${enPlazo ? 'text-white/30' : colorDias(f.dias, f.sin_fecha)}`}>
                        {textoDias(f.dias, f.sin_fecha)}
                    </span>
                </a>
                <BotonCarpeta f={f} />
            </div>

            <div className="px-2.5 pb-2.5 flex flex-col md:flex-row md:items-center gap-2">
                <MaterialCee m={f.material} className="md:flex-1 min-w-0" />
                <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    {faltaMaterial && grupoPedir && (
                        <button type="button" onClick={() => onPedir(grupoPedir)}
                            title="Mandar al cliente el enlace para subir lo que falta"
                            className="px-3 py-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] text-red-300 text-[10px] font-black uppercase tracking-wider hover:bg-red-500/10 transition-colors max-md:flex-1">
                            📩 Pedir al cliente
                        </button>
                    )}
                    <div className="w-full md:w-56">
                        <TecnicoPicker
                            certificadores={certificadores}
                            value={valor}
                            onChange={(v) => { if (v) onEncargar(f, v); }}
                            // Desde aquí solo se ENCARGA: quitar un técnico no avisa a
                            // nadie y se hace, si hace falta, desde el expediente.
                            permiteVaciar={false}
                        />
                    </div>
                    {f.certificador_id && (
                        <button type="button" onClick={() => onEncargar(f, f.certificador_id)}
                            className="px-3 py-2 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-wider shadow-lg shadow-brand/20 active:scale-95 transition-all max-md:flex-1">
                            Enviar el encargo
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
