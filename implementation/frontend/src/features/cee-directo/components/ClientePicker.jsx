import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ClienteFormModal } from '../../clientes/components/ClienteFormModal';

// ─────────────────────────────────────────────────────────────────────────────
// Elegir (o crear) el cliente de un CEE directo.
//
// Fuente única de las DOS superficies donde se asigna cliente: el alta y la
// ficha. Estaba duplicado en el modal de alta y en cuanto la ficha necesitó lo
// mismo, la búsqueda sin tildes y el "crear cliente nuevo" habrían empezado a
// divergir según por dónde entraras.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * @param {Function} [onEditar] si se pasa, aparece "Editar" en la tarjeta del
 *        cliente elegido. El flujo es "buscar o crear, y corregir sin salir": si
 *        para arreglar un teléfono hay que irse a la pestaña de Clientes, se
 *        pierde lo que estabas haciendo y casi nadie vuelve.
 */
export function ClientePicker({ cliente, onChange, onEditar, autoFocus = false }) {
    const [busqueda, setBusqueda] = useState('');
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [showNuevo, setShowNuevo] = useState(false);
    const timer = useRef(null);

    useEffect(() => {
        if (busqueda.trim().length < 2) { setResultados([]); return; }
        clearTimeout(timer.current);
        setBuscando(true);
        timer.current = setTimeout(() => {
            axios.get('/api/clientes')
                .then(r => {
                    // Coincide si TODAS las palabras escritas aparecen en algún campo:
                    // así "atersol valencia" encuentra la ficha aunque el orden no sea ese.
                    const palabras = norm(busqueda).split(/\s+/).filter(Boolean);
                    const lista = (r.data || []).filter(c => {
                        const heno = norm([c.nombre_razon_social, c.apellidos, c.dni, c.municipio].filter(Boolean).join(' '));
                        return palabras.every(w => heno.includes(w));
                    });
                    setResultados(lista.slice(0, 8));
                })
                .catch(() => setResultados([]))
                .finally(() => setBuscando(false));
        }, 300);
        return () => clearTimeout(timer.current);
    }, [busqueda]);

    const elegir = (c) => { setBusqueda(''); setResultados([]); onChange?.(c); };

    if (cliente) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                        {`${cliente.nombre_razon_social || ''} ${cliente.apellidos || ''}`.trim()}
                    </div>
                    <div className="text-[11px] text-white/35 mt-0.5">
                        {[cliente.dni, cliente.tlf || cliente.telefono, cliente.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                    </div>
                </div>
                <div className="shrink-0 flex items-center gap-3">
                    {onEditar && (
                        <button type="button" onClick={onEditar}
                            title="Ver / editar la ficha del cliente"
                            className="text-[10px] font-black uppercase tracking-widest text-brand/70 hover:text-brand">
                            Editar
                        </button>
                    )}
                    <button type="button" onClick={() => onChange?.(null)}
                        className="text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white">
                        Cambiar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-2">
                <input
                    autoFocus={autoFocus}
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder="Busca por nombre, DNI o municipio…"
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40"
                />
                {buscando && <p className="text-[11px] text-white/30">Buscando…</p>}
                {resultados.map(c => (
                    <button key={c.id_cliente} type="button" onClick={() => elegir(c)}
                        className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-brand/40 transition-colors">
                        <div className="text-sm text-white truncate">{`${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim()}</div>
                        <div className="text-[11px] text-white/30">{[c.dni, c.municipio].filter(Boolean).join(' · ')}</div>
                    </button>
                ))}
                {busqueda.trim().length >= 2 && !buscando && resultados.length === 0 && (
                    <p className="text-[11px] text-white/30">Ningún cliente con ese nombre.</p>
                )}
                <button type="button" onClick={() => setShowNuevo(true)}
                    className="w-full min-h-[44px] rounded-xl border border-dashed border-white/15 text-[11px] font-black uppercase tracking-widest text-white/45 hover:text-white hover:border-white/30 transition-colors">
                    + Crear cliente nuevo
                </button>
            </div>

            <ClienteFormModal
                isOpen={showNuevo}
                onClose={() => setShowNuevo(false)}
                onSuccess={(c) => { setShowNuevo(false); if (c?.id_cliente) elegir(c); }}
            />
        </>
    );
}

export default ClientePicker;
