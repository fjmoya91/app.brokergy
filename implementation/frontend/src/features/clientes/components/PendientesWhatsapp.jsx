import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { ClienteFormModal } from './ClienteFormModal';
import { tlfDeContacto } from '../../../utils/agendaWhatsapp';
import { ContactosCompartidos, InstaladoresPendientes } from './PendientesWhatsappPestanas';

// ─────────────────────────────────────────────────────────────────────────────
// PENDIENTES DE ALTA desde la agenda de WhatsApp.
//
// Los contactos guardados con el prefijo de la casa ("RES080 Jesús Quero
// (Foncaman)") son ya asuntos de trabajo; si su número no está en ninguna
// ficha, el alta se quedó por hacer. Aquí se ven todos y se dan de alta de uno
// en uno con el formulario de siempre, ya relleno. Si el prefijo es una
// oportunidad sin cliente, el alta la deja VINCULADA.
//
// Solo equipo interno (la ruta es staffOnly). La lista la decide el servidor
// (services/whatsappAgenda.js → pendientesDeAlta). Como los demás modales de
// Clientes, no se cierra al pulsar fuera (regla 10).
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const verTlf = (c) => {
    const t = tlfDeContacto(c);
    return /^\d{9}$/.test(t) ? t.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4') : t;
};

function haceCuanto(t) {
    if (!t) return 'sin conversación';
    const dias = Math.floor((Date.now() / 1000 - t) / 86400);
    if (dias <= 0) return 'habló hoy';
    if (dias === 1) return 'habló ayer';
    if (dias < 60) return `habló hace ${dias} días`;
    return `habló hace ${Math.round(dias / 30)} meses`;
}

// `pestanaInicial`: 'clientes' | 'compartidos' | 'instaladores'. `etiqueta` y
// `sinRecuento`: para el botón de Partners, que abre en «Instaladores» y no
// tiene que enseñar el recuento de clientes.
const PESTANAS = [['clientes', 'Clientes con prefijo'], ['compartidos', 'Contactos compartidos'], ['instaladores', 'Instaladores']];

export function PendientesWhatsapp({ onAlta, pestanaInicial = 'clientes', etiqueta = 'Pendientes de WhatsApp', sinRecuento = false }) {
    const [pestana, setPestana] = useState(pestanaInicial);
    const [datos, setDatos] = useState(null);       // { pendientes, conObra, conPrefijo, descartados }
    const [error, setError] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [abierto, setAbierto] = useState(false);
    const [filtro, setFiltro] = useState('');
    const [alta, setAlta] = useState(null);          // { initialData, oportunidad, telefono }
    const [preparando, setPreparando] = useState(null);
    const [deshacer, setDeshacer] = useState(null);  // el último descartado, para volver atrás
    const [verDescartados, setVerDescartados] = useState(false);
    const [aviso, setAviso] = useState(null);

    const pedir = useCallback(() => {
        axios.get('/api/whatsapp/contactos/pendientes-alta', { timeout: 60000 })
            .then(r => { setDatos(r.data); setError(null); })
            .catch(err => {
                setDatos(null);
                setError(err.response?.data?.error || 'No se ha podido leer la agenda de WhatsApp.');
            })
            .finally(() => setCargando(false));
    }, []);
    const cargar = () => { setCargando(true); pedir(); };

    useEffect(() => { pedir(); }, [pedir]);

    const lista = useMemo(() => {
        const ws = norm(filtro).split(/\s+/).filter(Boolean);
        return (datos?.pendientes || []).filter(p => {
            if (!ws.length) return true;
            const heno = norm(`${p.nombre_agenda} ${p.telefono} ${p.oportunidad?.id_oportunidad || ''}`);
            return ws.every(w => heno.includes(w));
        });
    }, [datos, filtro]);

    // Con oportunidad, se trae ENTERA: el formulario saca de ella la dirección
    // del inmueble ("misma dirección que la oportunidad") y su partner.
    const darDeAlta = async (p) => {
        let oportunidad = p.oportunidad;
        if (oportunidad) {
            setPreparando(p.telefono);
            try {
                const r = await axios.get(`/api/oportunidades/${encodeURIComponent(oportunidad.id_oportunidad)}`);
                if (r.data?.id_oportunidad) oportunidad = r.data;
            } catch { /* con lo que ya hay basta para vincularla */ }
            setPreparando(null);
        }
        const conPartner = !oportunidad?.prescriptor_id && p.partner_sugerido;
        setAlta({
            telefono: p.telefono,
            oportunidad,
            initialData: {
                nombre_razon_social: (p.propuesta?.nombre || '').toUpperCase(),
                apellidos: (p.propuesta?.apellidos || '').toUpperCase(),
                tlf: tlfDeContacto(p),
                ...(conPartner ? { prescriptor_id: p.partner_sugerido.id_empresa } : {}),
            },
        });
    };

    // DESCARTAR: sale de la lista al momento, para todo el equipo. Si el
    // servidor falla, vuelve a su sitio y se dice.
    const nueve = (t) => String(t || '').replace(/\D/g, '').slice(-9);
    const descartar = async (p) => {
        setAviso(null);
        setDatos(d => (d ? {
            ...d,
            pendientes: d.pendientes.filter(x => x.telefono !== p.telefono),
            descartados: [{ telefono: nueve(p.telefono), nombre_agenda: p.nombre_agenda, created_at: new Date().toISOString() },
                ...(d.descartados || [])],
        } : d));
        setDeshacer(p);
        try {
            await axios.post('/api/whatsapp/contactos/descartados', { telefono: p.telefono, nombre_agenda: p.nombre_agenda });
        } catch (err) {
            setDeshacer(null);
            setAviso(err.response?.data?.error || 'No se ha podido descartar.');
            setDatos(d => (d ? {
                ...d,
                pendientes: [p, ...d.pendientes].sort((a, b) => b.t - a.t),
                descartados: (d.descartados || []).filter(x => x.telefono !== nueve(p.telefono)),
            } : d));
        }
    };
    // RECUPERAR (o deshacer): se borra el descarte y se vuelve a leer la lista,
    // que es quien sabe cómo se propone ese contacto.
    const recuperar = async (telefono) => {
        setAviso(null);
        setDeshacer(null);
        try {
            await axios.delete(`/api/whatsapp/contactos/descartados/${encodeURIComponent(nueve(telefono))}`);
            cargar();
        } catch (err) {
            setAviso(err.response?.data?.error || 'No se ha podido recuperar.');
        }
    };

    const altaHecha = (cliente) => {
        const tel = alta?.telefono;
        setAlta(null);
        setDatos(d => (d ? { ...d, pendientes: d.pendientes.filter(x => x.telefono !== tel) } : d));
        onAlta?.(cliente);
    };

    const n = datos?.pendientes?.length;

    return (
        <>
            <button type="button" onClick={() => setAbierto(true)}
                title="Contactos de tu WhatsApp con prefijo de obra que todavía no tienen ficha"
                className="flex items-center gap-2 px-4 py-3.5 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300 font-black text-[11px] uppercase tracking-widest hover:bg-emerald-500/[0.12] transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="hidden md:inline">{etiqueta}</span>
                <span className="md:hidden">WhatsApp</span>
                {sinRecuento ? null
                    : cargando && !datos ? <span className="text-emerald-300/50">…</span>
                    : n != null ? <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-200">{n}</span>
                        : error ? <span className="text-amber-300/80">!</span> : null}
            </button>

            {abierto && createPortal(
                <div className="fixed inset-0 z-[250] bg-black/75 backdrop-blur-md flex items-end md:items-center justify-center md:p-6">
                    <div className="bg-bkg-deep border border-white/[0.08] w-full md:max-w-2xl md:rounded-2xl rounded-t-3xl max-h-[92dvh] flex flex-col">
                        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/[0.06] shrink-0">
                            <div className="min-w-0">
                                <h2 className="text-sm font-black text-white uppercase tracking-widest">Pendientes de alta · WhatsApp</h2>
                                <p className="text-[11px] text-white/35 mt-0.5">
                                    Lo que está en tu WhatsApp y todavía no tiene ficha en la app.
                                </p>
                            </div>
                            <button onClick={() => setAbierto(false)} aria-label="Cerrar"
                                className="shrink-0 w-11 h-11 -mr-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors text-xl leading-none">×</button>
                        </div>

                        <div className="px-5 pt-3 shrink-0 flex gap-1 overflow-x-auto [scrollbar-width:none]">
                            {PESTANAS.map(([id, txt]) => (
                                <button key={id} type="button" onClick={() => setPestana(id)}
                                    className={`shrink-0 min-h-[36px] px-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors ${pestana === id
                                        ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/40' : 'text-white/40 hover:text-white border border-transparent'}`}>
                                    {txt}{id === 'clientes' && n != null ? ` · ${n}` : ''}
                                </button>
                            ))}
                        </div>

                        {pestana !== 'clientes' ? (
                            <div className="overflow-y-auto px-5 py-4">
                                {pestana === 'compartidos'
                                    ? <ContactosCompartidos onAlta={onAlta} />
                                    : <InstaladoresPendientes onAlta={onAlta} />}
                            </div>
                        ) : (<>
                        <div className="px-5 pt-4 shrink-0 flex gap-2">
                            <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar por nombre, teléfono o nº…"
                                className="flex-1 min-w-0 bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40" />
                            <button type="button" onClick={cargar} disabled={cargando}
                                className="shrink-0 min-h-[44px] px-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white disabled:opacity-30">
                                {cargando ? 'Leyendo…' : 'Volver a leer'}
                            </button>
                        </div>

                        <div className="overflow-y-auto px-5 py-4 space-y-2">
                            {error && <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[11px] text-amber-300">{error}</p>}
                            {aviso && <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[11px] text-amber-300">{aviso}</p>}
                            {deshacer && (
                                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                                    <span className="text-[11px] text-white/50 min-w-0 truncate">
                                        Descartado «{deshacer.propuesta?.completo || deshacer.nombre_agenda}»: ya no sale a nadie del equipo.
                                    </span>
                                    <button type="button" onClick={() => recuperar(deshacer.telefono)}
                                        className="shrink-0 min-h-[32px] px-2 text-[10px] font-black uppercase tracking-widest text-brand/80 hover:text-brand">
                                        Deshacer
                                    </button>
                                </div>
                            )}
                            {datos && !lista.length && (
                                <p className="text-[11px] text-white/35 py-6 text-center">
                                    {filtro ? 'Ningún pendiente con ese texto.' : 'No queda nadie por dar de alta: todos los contactos con prefijo de obra tienen su ficha.'}
                                </p>
                            )}
                            {lista.map(p => (
                                <div key={p.telefono} className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-sm text-white truncate">{p.propuesta?.completo || p.nombre_agenda}</div>
                                            <div className="text-[11px] text-white/35 truncate">
                                                {verTlf(p)} · guardado como «{p.nombre_agenda}» · {haceCuanto(p.t)}
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-black text-white/50">{p.ficha}</span>
                                                {p.oportunidad && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-brand/10 text-[10px] font-black text-brand/80">
                                                        {p.oportunidad.id_oportunidad} sin cliente · se vincula
                                                    </span>
                                                )}
                                                {p.partner_sugerido && (
                                                    <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-[10px] font-black text-emerald-300/80">
                                                        {p.partner_sugerido.nombre}
                                                    </span>
                                                )}
                                                {p.nota && <span className="px-1.5 py-0.5 rounded-md bg-amber-500/10 text-[10px] text-amber-300/80">{p.nota}</span>}
                                            </div>
                                        </div>
                                        <div className="shrink-0 flex flex-col items-stretch gap-1">
                                            <button type="button" onClick={() => darDeAlta(p)} disabled={!!preparando}
                                                className="min-h-[40px] px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors disabled:opacity-40">
                                                {preparando === p.telefono ? '…' : 'Dar de alta'}
                                            </button>
                                            <button type="button" onClick={() => descartar(p)}
                                                title="No va a ser cliente: que deje de salir en esta lista (para todo el equipo)"
                                                className="min-h-[32px] px-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/70 transition-colors">
                                                Descartar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {datos?.conObra > 0 && (
                                <p className="text-[11px] text-white/30 pt-2">
                                    Otros {datos.conObra} contactos llevan el nº de una obra que ya tiene cliente: su teléfono no está en esa ficha
                                    (suele ser un familiar). No se proponen para no duplicar.
                                </p>
                            )}
                            {datos?.descartados?.length > 0 && (
                                <div className="pt-2">
                                    <button type="button" onClick={() => setVerDescartados(v => !v)}
                                        className="min-h-[32px] text-[11px] text-white/35 hover:text-white/70">
                                        {datos.descartados.length} descartado{datos.descartados.length !== 1 ? 's' : ''} · {verDescartados ? 'Ocultar' : 'Ver'}
                                    </button>
                                    {verDescartados && (
                                        <div className="mt-1 space-y-1">
                                            {datos.descartados.map(d => (
                                                <div key={d.telefono} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.015] px-3 py-2">
                                                    <span className="text-[11px] text-white/40 min-w-0 truncate">
                                                        {d.nombre_agenda || d.telefono} · {d.telefono.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4')}
                                                        {d.descartado_por ? ` · lo descartó ${d.descartado_por.split('@')[0]}` : ''}
                                                    </span>
                                                    <button type="button" onClick={() => recuperar(d.telefono)}
                                                        className="shrink-0 min-h-[32px] px-2 text-[10px] font-black uppercase tracking-widest text-brand/70 hover:text-brand">
                                                        Recuperar
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        </>)}
                    </div>
                </div>,
                document.body,
            )}

            {/* También al body: dentro de la página queda bajo su `z-10` y el
                formulario se abriría DEBAJO de la lista (z-250 contra z-300). */}
            {createPortal(
                <ClienteFormModal
                    isOpen={!!alta}
                    onClose={() => setAlta(null)}
                    onSuccess={altaHecha}
                    oportunidad={alta?.oportunidad || undefined}
                    initialData={alta?.initialData}
                />,
                document.body,
            )}
        </>
    );
}

export default PendientesWhatsapp;
