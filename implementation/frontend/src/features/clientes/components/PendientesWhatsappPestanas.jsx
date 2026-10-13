import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { ClienteFormModal } from './ClienteFormModal';
import InstaladorFormModal from './InstaladorFormModal';

// ─────────────────────────────────────────────────────────────────────────────
// Las otras dos pestañas de «Pendientes de WhatsApp»:
//
//  · CONTACTOS COMPARTIDOS — las tarjetas de contacto que nos han mandado (un
//    instalador que pasa el de un cliente) en los últimos 30 días cuyo número
//    no tiene ficha. Si las comparte un partner, el alta sale con él como
//    «quién nos lo trae».
//  · INSTALADORES — contactos del ramo (etiqueta INSTALADORES, «Inst. …»,
//    «Fontanería …») que no están en Partners ni en Clientes.
//
// Los descartes son los mismos que los de los clientes: por teléfono y para
// todo el equipo. Backend: services/whatsappAgenda.js.
// ─────────────────────────────────────────────────────────────────────────────

const verTlf = (t) => {
    let d = String(t || '').replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('34')) d = d.slice(2);
    return /^\d{9}$/.test(d) ? d.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4') : `+${d}`;
};
const tlfFicha = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length === 11 && d.startsWith('34') ? d.slice(2) : d; };
const fecha = (t) => (t ? new Date(t * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : null);

const btnAlta = 'min-h-[40px] px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors';
const btnDescartar = 'min-h-[32px] px-3 text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/70 transition-colors';

function useLista(url) {
    const [estado, setEstado] = useState({ cargando: true, error: null, datos: null });
    const pedir = useCallback(() => {
        axios.get(url, { timeout: 90000 })
            .then(r => setEstado({ cargando: false, error: null, datos: r.data }))
            .catch(err => setEstado({ cargando: false, error: err.response?.data?.error || 'No se ha podido leer WhatsApp.', datos: null }));
    }, [url]);
    useEffect(() => { pedir(); }, [pedir]);
    const recargar = () => { setEstado(e => ({ ...e, cargando: true })); pedir(); };
    return [estado, setEstado, recargar];
}

async function descartarTelefono(telefono, nombre) {
    await axios.post('/api/whatsapp/contactos/descartados', { telefono, nombre_agenda: nombre });
}

export function ContactosCompartidos({ onAlta }) {
    const [estado, setEstado, recargar] = useLista('/api/whatsapp/contactos/compartidos');
    const [alta, setAlta] = useState(null);
    const [aviso, setAviso] = useState(null);
    const lista = estado.datos?.contactos || [];

    const quitar = (tel) => setEstado(e => ({ ...e, datos: e.datos ? { ...e.datos, contactos: e.datos.contactos.filter(x => x.telefono !== tel) } : e.datos }));
    const descartar = async (k) => {
        quitar(k.telefono);
        try { await descartarTelefono(k.telefono, k.nombre_tarjeta); }
        catch (err) { setAviso(err.response?.data?.error || 'No se ha podido descartar.'); recargar(); }
    };

    return (
        <div className="space-y-2">
            <p className="text-[11px] text-white/35">Tarjetas de contacto que nos han mandado en los últimos 30 días y cuyo número no tiene ficha.</p>
            {estado.cargando && <p className="text-[11px] text-white/35">Leyendo los chats…</p>}
            {estado.error && <p className="text-[11px] text-amber-300/80">{estado.error}</p>}
            {aviso && <p className="text-[11px] text-amber-300/80">{aviso}</p>}
            {!estado.cargando && !estado.error && !lista.length && (
                <p className="text-[11px] text-white/35 py-6 text-center">Nadie nos ha pasado un contacto nuevo en los últimos 30 días.</p>
            )}
            {lista.map(k => {
                const de = k.compartido_por?.partner?.nombre || k.compartido_por?.clientes?.[0]?.nombre || k.compartido_por?.nombre
                    || (k.compartido_por?.telefono ? verTlf(k.compartido_por.telefono) : 'alguien');
                return (
                    <div key={k.telefono} className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm text-white truncate normal-case">👤 {k.propuesta?.completo || k.nombre_tarjeta || 'Sin nombre'}</div>
                                <div className="text-[11px] text-white/35 truncate normal-case">
                                    {verTlf(k.telefono)} · nos lo pasó {de}{fecha(k.t) ? ` el ${fecha(k.t)}` : ''}
                                </div>
                                {k.compartido_por?.partner && (
                                    <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-[10px] font-black text-emerald-300/80">
                                        Partner: {k.compartido_por.partner.nombre}
                                    </span>
                                )}
                            </div>
                            <div className="shrink-0 flex flex-col items-stretch gap-1">
                                <button type="button" className={btnAlta} onClick={() => setAlta({
                                    telefono: k.telefono,
                                    initialData: {
                                        nombre_razon_social: (k.propuesta?.nombre || '').toUpperCase(),
                                        apellidos: (k.propuesta?.apellidos || '').toUpperCase(),
                                        tlf: tlfFicha(k.telefono),
                                        ...(k.compartido_por?.partner ? { prescriptor_id: k.compartido_por.partner.id_empresa } : {}),
                                    },
                                })}>Dar de alta</button>
                                <button type="button" className={btnDescartar} onClick={() => descartar(k)}
                                    title="No va a ser cliente: que deje de salir (para todo el equipo)">Descartar</button>
                            </div>
                        </div>
                    </div>
                );
            })}
            {createPortal(
                <ClienteFormModal isOpen={!!alta} onClose={() => setAlta(null)} initialData={alta?.initialData}
                    onSuccess={(c) => { const t = alta?.telefono; setAlta(null); quitar(t); onAlta?.(c); }} />,
                document.body,
            )}
        </div>
    );
}

export function InstaladoresPendientes({ onAlta }) {
    const [estado, setEstado, recargar] = useLista('/api/whatsapp/contactos/instaladores-pendientes');
    const [alta, setAlta] = useState(null);
    const [aviso, setAviso] = useState(null);
    const lista = estado.datos?.pendientes || [];

    const quitar = (tel) => setEstado(e => ({ ...e, datos: e.datos ? { ...e.datos, pendientes: e.datos.pendientes.filter(x => x.telefono !== tel) } : e.datos }));
    const descartar = async (p) => {
        quitar(p.telefono);
        try { await descartarTelefono(p.telefono, p.nombre_agenda); }
        catch (err) { setAviso(err.response?.data?.error || 'No se ha podido descartar.'); recargar(); }
    };

    return (
        <div className="space-y-2">
            <p className="text-[11px] text-white/35">Contactos del ramo (etiqueta INSTALADORES, «Inst. …», «Fontanería …») que no están en Partners ni en Clientes.</p>
            {estado.cargando && <p className="text-[11px] text-white/35">Leyendo la agenda…</p>}
            {estado.error && <p className="text-[11px] text-amber-300/80">{estado.error}</p>}
            {aviso && <p className="text-[11px] text-amber-300/80">{aviso}</p>}
            {!estado.cargando && !estado.error && !lista.length && (
                <p className="text-[11px] text-white/35 py-6 text-center">Todos los instaladores de tu agenda están ya en Partners.</p>
            )}
            {lista.map(p => (
                <div key={p.telefono} className="rounded-xl bg-white/[0.02] border border-white/[0.06] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm text-white truncate normal-case">🔧 {p.propuesta || p.pushname}</div>
                            <div className="text-[11px] text-white/35 truncate normal-case">
                                {[verTlf(p.telefono), p.pushname && p.pushname !== p.propuesta ? `se llama «${p.pushname}»` : null,
                                    p.t ? `habló el ${fecha(p.t)}` : 'sin conversación'].filter(Boolean).join(' · ')}
                            </div>
                            {(p.etiquetas || []).length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {p.etiquetas.slice(0, 4).map(e => (
                                        <span key={e} className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-black text-white/50">{e}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 flex flex-col items-stretch gap-1">
                            <button type="button" className={btnAlta}
                                onClick={() => setAlta({ telefono: p.telefono, initialData: { razon_social: (p.propuesta || '').toUpperCase(), tlf: tlfFicha(p.telefono) } })}>
                                Dar de alta
                            </button>
                            <button type="button" className={btnDescartar} onClick={() => descartar(p)}
                                title="No es un instalador nuestro: que deje de salir (para todo el equipo)">Descartar</button>
                        </div>
                    </div>
                </div>
            ))}
            {/* El formulario de instalador va a z-100: envuelto a z-300 para que salga
                POR ENCIMA de este popup (z-250). Se monta de nuevo para cada contacto. */}
            {alta && createPortal(
                <div style={{ position: 'relative', zIndex: 300 }}>
                    <InstaladorFormModal key={alta.telefono} isOpen initialData={alta.initialData}
                        onClose={() => setAlta(null)}
                        onSuccess={(p) => { const t = alta.telefono; setAlta(null); quitar(t); onAlta?.(p); }} />
                </div>,
                document.body,
            )}
        </div>
    );
}
