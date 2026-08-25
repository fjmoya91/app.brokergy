import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { CeeModule } from '../../expedientes/components/CeeModule';
import { useAuth } from '../../../context/AuthContext';
import { EntregaCliente } from '../components/EntregaCliente';
import { DatosExpedienteModal } from '../components/DatosExpedienteModal';
import { ResumenDatos } from '../components/ResumenDatos';
import { PrescriptorDetailModal } from '../../admin/views/PrescriptorDetailModal';
import { ClienteDetailModal } from '../../clientes/components/ClienteDetailModal';

// ─────────────────────────────────────────────────────────────────────────────
// Ficha de un CEE contratado suelto.
//
// Es DELIBERADAMENTE una sola cosa: el módulo CEE. Un expediente CAE tiene seis
// pestañas porque detrás del certificado hay una obra, un CIFO, unos anexos, un
// lote y un cobro por bono. Aquí no hay nada de eso — nos han contratado el
// certificado y punto—, así que la ficha es el módulo y una cabecera.
//
// El módulo es EL MISMO componente que el del expediente CAE, montado con
// `apiBase="/api/cee-directos"`. No es una copia: si mañana se arregla algo del
// CEE, se arregla en los dos negocios a la vez.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/cee-directos';

export function CeeDirectoDetailView({ id, onBack }) {
    const { user } = useAuth();
    const rol = (user?.rol || user?.rol_nombre || '').toUpperCase();
    const isAdmin = rol === 'ADMIN';
    const isStaff = isAdmin || rol === 'TRABAJADOR';

    const [expediente, setExpediente] = useState(null);
    const [certificadores, setCertificadores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [aviso, setAviso] = useState(null);
    const [ampliando, setAmpliando] = useState(false);
    const [prescriptores, setPrescriptores] = useState([]);
    const [carpetaOcupada, setCarpetaOcupada] = useState(null); // 'local' | 'preparar' | null
    const [showCliente, setShowCliente] = useState(false);
    const [menuAbierto, setMenuAbierto] = useState(false);
    const [showDatos, setShowDatos] = useState(false);
    const [showPartner, setShowPartner] = useState(false);

    const cargar = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const { data } = await axios.get(`${API}/${id}`);
            setExpediente(data);
            setError(null);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo cargar el expediente.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { cargar(); }, [cargar]);

    // Una sola llamada a /api/prescriptores para las dos listas: los certificadores
    // (a quien se le encarga el CEE) y los captadores (quién nos trae el encargo).
    useEffect(() => {
        axios.get('/api/prescriptores')
            .then(r => {
                const todos = r.data || [];
                setPrescriptores(todos);
                setCertificadores(todos.filter(p => p.tipo_empresa === 'CERTIFICADOR' || p.tipo_empresa === 'OTRO'));
            })
            .catch(() => { setPrescriptores([]); setCertificadores([]); });
    }, []);

    // Autoguardado, como en el expediente CAE: el módulo está siempre editable y
    // no hay botón de "Guardar". Se encadenan los PUT para que dos cambios
    // seguidos no se pisen — cada uno se construye desde su copia del objeto.
    const colaRef = useRef(Promise.resolve());
    const handleSave = useCallback((patch) => {
        setSaving(true);
        colaRef.current = colaRef.current
            .then(() => axios.put(`${API}/${id}`, patch))
            .then(({ data }) => { setExpediente(prev => ({ ...prev, ...data })); })
            .catch(err => setError(err.response?.data?.error || 'No se pudo guardar.'))
            .finally(() => setSaving(false));
        return colaRef.current;
    }, [id]);

    const handleCeeSave = useCallback((ceePatch) => handleSave(ceePatch), [handleSave]);

    // El módulo emite el estado que va calculando (subestados de seguimiento y
    // fechas). Se reparte igual que en el expediente CAE: lo que empieza por
    // `fecha_` va a documentación y el resto a seguimiento, todo en UN solo PUT.
    // `estado` se ignora a propósito: aquí lo DERIVA el backend desde los
    // subestados, y aceptarlo del navegador permitiría que la pastilla del
    // listado dijese una cosa y el módulo otra.
    const handleAutoStatus = useCallback((keyOrPatch, value) => {
        const patch = typeof keyOrPatch === 'object' && keyOrPatch !== null ? keyOrPatch : { [keyOrPatch]: value };
        const seguimiento = {};
        const documentacion = {};
        for (const [k, v] of Object.entries(patch)) {
            if (k === 'estado' || k === 'notify_staff') continue;
            if (k.startsWith('fecha_')) documentacion[k] = v;
            else seguimiento[k] = v;
        }
        const cambios = {};
        if (Object.keys(seguimiento).length) cambios.seguimiento = { ...(expediente?.seguimiento || {}), ...seguimiento };
        if (Object.keys(documentacion).length) cambios.documentacion = { ...(expediente?.documentacion || {}), ...documentacion };
        if (Object.keys(cambios).length) handleSave(cambios);
    }, [handleSave, expediente?.seguimiento, expediente?.documentacion]);

    // El alcance se puede corregir en los dos sentidos. Quitar la fase final solo
    // sale bien si está virgen; si no, el backend responde 422 diciendo qué lo
    // impide (un subestado avanzado o ficheros ya subidos) y eso es lo que se
    // enseña. Hace falta porque los 55 importados dedujeron su alcance de cómo
    // estaba la carpeta, y ahí se puede fallar.
    const cambiarAlcance = async (destino) => {
        setAmpliando(true);
        try {
            await axios.post(`${API}/${id}/alcance`, { alcance: destino });
            await cargar(true);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo cambiar el alcance del encargo.');
        } finally {
            setAmpliando(false);
        }
    };

    // Abre la carpeta en el Explorador de Windows (espejo local de Drive Desktop).
    // El navegador no puede abrir `file://`, así que el backend reconstruye la ruta
    // subiendo por las carpetas padre de Drive y se lanza el protocolo
    // `brokergylocal:` (requiere tools/windows/brokergylocal_setup.reg, una vez por
    // PC). La ruta se copia además al portapapeles como respaldo silencioso.
    const abrirCarpetaLocal = async () => {
        setCarpetaOcupada('local');
        try {
            const { data } = await axios.get(`${API}/${id}/local-path`);
            if (!data?.path) { setError('No se pudo obtener la ruta local.'); return; }
            try { await navigator.clipboard.writeText(data.path); } catch { /* contexto no seguro */ }
            // base64url CONSERVANDO el padding `=`, y sin `//` tras el esquema: con
            // `//` el navegador minúscula el "host" y rompe el base64.
            const b64url = btoa(unescape(encodeURIComponent(data.path))).replace(/\+/g, '-').replace(/\//g, '_');
            const a = document.createElement('a');
            a.href = `brokergylocal:${b64url}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo resolver la ruta local.');
        } finally {
            setCarpetaOcupada(null);
        }
    };

    const prepararCarpeta = async () => {
        setCarpetaOcupada('preparar');
        try {
            const { data } = await axios.post(`${API}/${id}/carpeta/preparar`);
            setAviso(`Carpeta lista: ${data.subcarpetas.join(' · ')}`);
            await cargar(true);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo preparar la carpeta.');
        } finally {
            setCarpetaOcupada(null);
        }
    };

    const marcarCobrado = async (valor) => {
        try {
            await axios.patch(`${API}/${id}/cobrado`, { cobrado: valor });
            await cargar(true);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo cambiar el estado de cobro.');
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-white/30 text-xs font-black uppercase tracking-widest">Cargando…</div>;
    }
    if (!expediente) {
        return (
            <div className="p-8 text-center">
                <p className="text-red-400 text-sm">{error || 'Expediente no encontrado.'}</p>
                <button onClick={onBack} className="mt-4 text-[11px] font-black uppercase tracking-widest text-white/40 hover:text-white">← Volver</button>
            </div>
        );
    }

    const cliente = expediente.cliente;
    const esDoble = expediente.alcance === 'DOBLE';
    const direccion = [expediente.direccion, expediente.municipio, expediente.provincia].filter(Boolean).join(', ');

    return (
        <div className="pb-16">
            {/* ── Cabecera ───────────────────────────────────────────────── */}
            <div className="mb-6">
                <button onClick={onBack} className="text-[11px] font-black uppercase tracking-widest text-white/35 hover:text-white transition-colors mb-3">
                    ← CEE directos
                </button>

                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="font-mono text-brand text-xl md:text-2xl font-black tracking-tight">{expediente.numero_expediente}</h1>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${
                                esDoble ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' : 'bg-white/[0.04] text-white/50 border-white/10'
                            }`}>{esDoble ? 'Inicial + Final' : 'CEE único'}</span>

                            {/* EL COBRO, aquí arriba y en una línea. Ocupaba un panel
                                entero a todo el ancho para decir un sí/no y un botón;
                                al lado del número se ve igual de bien y deja la
                                pantalla para lo que hay que rellenar. El porqué se
                                queda en el `title` — es una explicación que se lee
                                una vez, no cada vez que abres el expediente. */}
                            {isAdmin && (
                                <button
                                    onClick={() => marcarCobrado(!expediente.cobrado)}
                                    title={expediente.cobrado
                                        ? 'Cobrado. Con el registro subido, el certificado se le envía solo al cliente. Pulsa para quitar la marca.'
                                        : 'Sin cobrar: el certificado no sale de aquí. Pulsa para marcarlo como cobrado.'}
                                    className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-colors ${
                                        expediente.cobrado
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/20'
                                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                                    }`}>
                                    {expediente.cobrado ? '✓ Cobrado' : 'Marcar cobrado'}
                                </button>
                            )}

                            {expediente.origen === 'HISTORICO' && !expediente.cliente_id && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-amber-500/10 text-amber-400 border-amber-500/20"
                                    title="Importado del Drive anterior: solo se dio por cierto lo que la carpeta demuestra">
                                    Histórico
                                </span>
                            )}
                        </div>
                        <div className="text-white/85 text-sm font-bold uppercase tracking-wide mt-1">{expediente.nombre}</div>
                        {cliente && (
                            <div className="text-white/40 text-xs mt-0.5">
                                {[`${cliente.nombre_razon_social || ''} ${cliente.apellidos || ''}`.trim(), cliente.dni, cliente.tlf].filter(Boolean).join(' · ')}
                            </div>
                        )}
                        {direccion && <div className="text-white/25 text-[11px] mt-0.5 uppercase tracking-wide">{direccion}</div>}
                    </div>

                    {/* Dos botones a la vista y el resto en el menú: "Carpeta" y
                        "Carpeta local" se usan a diario; preparar la carpeta y cambiar
                        el alcance son de una vez en la vida del expediente y estaban
                        ocupando el mismo sitio y el mismo peso visual. */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* La carpeta RAÍZ contiene "3. PRESUPUESTO Y FACTURAS", así
                            que su enlace es solo para el equipo. Al certificador se le
                            comparten sus dos carpetas en el encargo, una a una; el
                            backend además le borra este campo de la respuesta. */}
                        {isStaff && expediente.drive_folder_link && (
                            <a href={expediente.drive_folder_link} target="_blank" rel="noreferrer"
                                className="min-h-[44px] px-4 inline-flex items-center rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/25 transition-colors">
                                📁 Carpeta
                            </a>
                        )}
                        {/* La carpeta LOCAL es la que de verdad se usa para trabajar:
                            se arrastran ficheros a ella desde el Explorador. El enlace
                            de Drive es para consultar y para compartir. */}
                        {isStaff && (
                            <button onClick={abrirCarpetaLocal} disabled={carpetaOcupada === 'local'}
                                title="Abre la carpeta en el Explorador de Windows (espejo de Google Drive)"
                                className="min-h-[44px] px-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/25 transition-colors disabled:opacity-40">
                                {carpetaOcupada === 'local' ? 'Abriendo…' : '🗂 Carpeta local'}
                            </button>
                        )}

                        {isStaff && (
                            <div className="relative">
                                <button onClick={() => setMenuAbierto(v => !v)}
                                    title="Más acciones"
                                    className="min-h-[44px] px-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white hover:border-white/25 transition-colors">
                                    ⋯
                                </button>
                                {menuAbierto && (
                                    <>
                                        {/* Capa para cerrar al pulsar fuera: es un menú,
                                            no un modal, y no debe atrapar al usuario. */}
                                        <div className="fixed inset-0 z-40" onClick={() => setMenuAbierto(false)} />
                                        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-white/10 bg-bkg-surface shadow-2xl overflow-hidden">
                                            <button onClick={() => { setMenuAbierto(false); prepararCarpeta(); }}
                                                disabled={carpetaOcupada === 'preparar'}
                                                className="w-full text-left px-4 py-3 text-[11px] font-bold text-white/60 hover:bg-white/5 hover:text-white transition-colors disabled:opacity-40">
                                                {carpetaOcupada === 'preparar' ? 'Preparando…' : 'Preparar carpeta'}
                                                <span className="block text-[10px] text-white/25 font-normal mt-0.5">Crea las subcarpetas que falten</span>
                                            </button>
                                            <button onClick={() => { setMenuAbierto(false); cambiarAlcance(esDoble ? 'UNICO' : 'DOBLE'); }}
                                                disabled={ampliando}
                                                className="w-full text-left px-4 py-3 text-[11px] font-bold text-white/60 hover:bg-white/5 hover:text-white transition-colors border-t border-white/[0.06] disabled:opacity-40">
                                                {ampliando ? 'Cambiando…' : (esDoble ? 'Quitar el CEE final' : 'Añadir el CEE final')}
                                                <span className="block text-[10px] text-white/25 font-normal mt-0.5">
                                                    {esDoble ? 'Solo si está sin empezar' : 'Crea 2. CEE FINAL en la carpeta'}
                                                </span>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {aviso && (
                    <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-300 flex items-center justify-between gap-3">
                        <span>{aviso}</span>
                        <button onClick={() => setAviso(null)} className="text-[10px] font-black uppercase tracking-widest text-emerald-400/60 hover:text-emerald-400">Cerrar</button>
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-xs text-red-300 flex items-center justify-between gap-3">
                        <span>{error}</span>
                        <button onClick={() => setError(null)} className="text-[10px] font-black uppercase tracking-widest text-red-400/60 hover:text-red-400">Cerrar</button>
                    </div>
                )}
            </div>

            {/* Los datos van ANTES del módulo: sin cliente ni dirección no se le
            {/* Los datos, en UNA LÍNEA. Lo que falta se ve sin desplegar nada —es
                lo que impide encargar el CEE—; el detalle y la edición van a
                demanda, para que la pantalla sea la del certificado. */}
            <div className="mb-6">
                <ResumenDatos
                    expediente={expediente}
                    prescriptor={expediente.prescriptor}
                    puedeEditar={isStaff}
                    onEditar={() => setShowDatos(true)}
                    onAbrirCliente={expediente.cliente_id ? () => setShowCliente(true) : undefined}
                    onAbrirPartner={expediente.prescriptor ? () => setShowPartner(true) : undefined}
                />
            </div>

            <DatosExpedienteModal
                isOpen={showDatos}
                onClose={() => { setShowDatos(false); cargar(true); }}
                expediente={expediente}
                prescriptores={prescriptores}
                puedeEditar={isStaff}
                onGuardado={() => {}}
                onAbrirCliente={isStaff && expediente.cliente_id ? () => setShowCliente(true) : undefined}
            />

            {showPartner && expediente.prescriptor && (
                <PrescriptorDetailModal
                    isOpen={true}
                    prescriptor={expediente.prescriptor}
                    onClose={() => setShowPartner(false)}
                    onUpdated={() => { setShowPartner(false); cargar(true); }}
                />
            )}

            {showCliente && expediente.cliente_id && (
                <ClienteDetailModal
                    isOpen={true}
                    clienteId={expediente.cliente_id}
                    // La direccion que se le ofrece copiar es la del INMUEBLE de este
                    // CEE, no la del domicilio del cliente: son campos distintos y
                    // aqui lo que se esta mirando es la vivienda que se certifica.
                    catastroData={{
                        direccion: expediente.direccion || null,
                        municipio: expediente.municipio || null,
                        ccaa: expediente.ccaa || null,
                        codigo_postal: expediente.codigo_postal || null,
                        ref_catastral: expediente.ref_catastral || null,
                    }}
                    onClose={() => { setShowCliente(false); cargar(true); }}
                    onUpdated={() => { setShowCliente(false); cargar(true); }}
                />
            )}

            <div className="h-6" />

            {/* ── El módulo CEE, el mismo del expediente CAE ──────────────── */}
            <div className="rounded-2xl border border-white/[0.06] bg-bkg-surface/60 p-4 md:p-6">
                <CeeModule
                    apiBase={API}
                    // De qué negocio es: cambia el enlace del mensaje (`?cee=`, no
                    // `?exp=`) y quita del texto lo que aquí no existe (obra, portal).
                    msgCtx={{
                        deepLink: 'cee',
                        cae: false,
                        faseLabel: esDoble ? 'CEE inicial' : 'CEE'
                    }}
                    // En un encargo de un solo certificado no se pinta la fase
                    // final: no hay obra, no hay un después y esa fila de casillas
                    // solo puede quedarse vacía para siempre.
                    secciones={esDoble ? ['inicial', 'final'] : ['inicial']}
                    expediente={expediente}
                    onSave={handleCeeSave}
                    onLiveUpdate={() => {}}
                    onRefresh={() => cargar(true)}
                    saving={saving}
                    certificadores={certificadores}
                    onAutoStatus={handleAutoStatus}
                />
            </div>

            {/* La entrega va DESPUÉS del módulo: es lo último que ocurre, y ponerla
                arriba invitaría a pulsarla antes de tener el registro subido. */}
            {isStaff && (
                <EntregaCliente id={expediente.id} esDoble={esDoble} onCambio={() => cargar(true)} />
            )}


        </div>
    );
}

export default CeeDirectoDetailView;
