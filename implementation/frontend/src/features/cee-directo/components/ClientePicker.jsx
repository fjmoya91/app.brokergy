import { useState, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { ClienteFormModal } from '../../clientes/components/ClienteFormModal';
import { ContactosWhatsapp } from '../../../components/AgendaWhatsapp';
import { useAgendaWhatsapp, tlfDeContacto } from '../../../utils/agendaWhatsapp';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';

// ─────────────────────────────────────────────────────────────────────────────
// Elegir (o crear) el cliente de un CEE directo.
//
// Fuente única de las superficies donde se asigna cliente: el alta, la ficha y
// la oferta. Estaba duplicado en el modal de alta y en cuanto la ficha necesitó
// lo mismo, la búsqueda sin tildes y el "crear cliente nuevo" habrían empezado a
// divergir según por dónde entraras.
//
// Busca a la vez en la app y en la AGENDA de WhatsApp (solo equipo interno):
// quien todavía no es cliente casi siempre está ya en el móvil.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const digitos = (s) => String(s || '').replace(/\D/g, '');

/**
 * @param {Function} [onEditar] si se pasa, aparece "Editar" en la tarjeta del
 *        cliente elegido. El flujo es "buscar o crear, y corregir sin salir": si
 *        para arreglar un teléfono hay que irse a la pestaña de Clientes, se
 *        pierde lo que estabas haciendo y casi nadie vuelve.
 * @param {object} [datosNuevoCliente] dirección con la que nace la ficha si hay
 *        que CREAR el cliente ({ direccion, codigo_postal, ccaa, provincia,
 *        provincia_cod, municipio }). En un CEE suelto el titular vive casi
 *        siempre en la vivienda que se certifica, así que volver a teclear lo
 *        que se acaba de traer del Catastro solo sirve para colar una errata.
 *        Se PROPONE: los campos quedan editables, y de un piso alquilado se
 *        corrigen sin más.
 * @param {Function} [onNuevoRapido] ({ nombre, tlf, prescriptorId, deWhatsapp })
 *        → si se pasa (la oferta), un cliente NUEVO no abre el formulario: basta
 *        el nombre (y el teléfono, si viene de WhatsApp) y la ficha nace al
 *        enviar. Aparece además «Es nuevo: usar "…"» con lo escrito.
 */
export function ClientePicker({ cliente, onChange, onEditar, autoFocus = false, datosNuevoCliente = null, onNuevoRapido = null }) {
    const { user } = useAuth();
    const { isStaff } = getRoleFlags(user);
    const [busqueda, setBusqueda] = useState('');
    const [resultados, setResultados] = useState([]);
    const [todos, setTodos] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [showNuevo, setShowNuevo] = useState(false);
    const [prefill, setPrefill] = useState(null);
    const timer = useRef(null);

    const agenda = useAgendaWhatsapp(busqueda, isStaff && !cliente);

    useEffect(() => {
        if (busqueda.trim().length < 2) { setResultados([]); return; }
        clearTimeout(timer.current);
        setBuscando(true);
        timer.current = setTimeout(() => {
            axios.get('/api/clientes')
                .then(r => {
                    setTodos(r.data || []);
                    // Coincide si TODAS las palabras escritas aparecen en algún campo:
                    // así "atersol valencia" encuentra la ficha aunque el orden no sea ese.
                    // Un número se busca por sus dígitos, con o sin espacios.
                    const palabras = norm(busqueda).split(/\s+/).filter(Boolean);
                    const num = digitos(busqueda);
                    const esNumero = num.length >= 6 && !/[a-z]/i.test(busqueda);
                    const lista = (r.data || []).filter(c => {
                        if (esNumero) {
                            const n9 = num.length > 9 && num.startsWith('34') ? num.slice(2) : num;
                            return [c.tlf, c.persona_contacto_tlf].some(t => digitos(t).includes(n9));
                        }
                        const heno = norm([c.nombre_razon_social, c.apellidos, c.dni, c.municipio, c.whatsapp_nombres].filter(Boolean).join(' '));
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
    const idsListados = useMemo(() => new Set(resultados.map(c => c.id_cliente)), [resultados]);

    // Solo se PROPONE lo que de verdad hay: una clave vacía pisaría el valor por
    // defecto del formulario sin aportar nada, y `provincia_cod` viaja porque es
    // lo que carga la lista de municipios de la cascada (el POST de clientes no
    // lo manda: su payload es una lista blanca).
    const direccionHeredada = Object.fromEntries(
        Object.entries(datosNuevoCliente || {}).filter(([, v]) => v != null && String(v).trim() !== '')
    );
    const heredaDireccion = !!direccionHeredada.direccion || !!direccionHeredada.municipio;

    // Un contacto de WhatsApp que todavía no es cliente: en la oferta basta con
    // su nombre y su número; en el resto, se abre el alta ya rellena.
    const elegirContacto = (k) => {
        const tlf = tlfDeContacto(k);
        const prescriptorId = k.partner_sugerido?.id_empresa || null;
        if (onNuevoRapido) {
            setBusqueda(''); setResultados([]);
            onNuevoRapido({ nombre: k.propuesta?.completo || '', tlf, prescriptorId, deWhatsapp: true });
            return;
        }
        setPrefill({
            nombre_razon_social: (k.propuesta?.nombre || '').toUpperCase(),
            apellidos: (k.propuesta?.apellidos || '').toUpperCase(),
            tlf,
            ...(prescriptorId ? { prescriptor_id: prescriptorId } : {}),
        });
        setShowNuevo(true);
    };
    const usarFicha = (id) => {
        const c = todos.find(x => x.id_cliente === id);
        if (c) elegir(c);
    };
    const abrirNuevo = () => { setPrefill(null); setShowNuevo(true); };

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

    const escrito = busqueda.trim();
    const hayAlgo = resultados.length > 0 || agenda.contactos.length > 0;

    return (
        <>
            <div className="space-y-2">
                <input
                    autoFocus={autoFocus}
                    value={busqueda}
                    onChange={e => setBusqueda(e.target.value)}
                    placeholder={isStaff ? 'Nombre, teléfono o DNI (busca también en tu WhatsApp)…' : 'Busca por nombre, DNI o municipio…'}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40"
                />
                {buscando && <p className="text-[11px] text-white/30">Buscando…</p>}
                {resultados.length > 0 && isStaff && (
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/35 pt-1">En la app</div>
                )}
                {resultados.map(c => (
                    <button key={c.id_cliente} type="button" onClick={() => elegir(c)}
                        className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-brand/40 transition-colors">
                        <div className="text-sm text-white truncate">{`${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim()}</div>
                        <div className="text-[11px] text-white/30">{[c.dni, c.tlf, c.municipio].filter(Boolean).join(' · ')}</div>
                    </button>
                ))}
                {escrito.length >= 2 && !buscando && resultados.length === 0 && !onNuevoRapido && (
                    <p className="text-[11px] text-white/30">Ningún cliente con ese nombre en la app.</p>
                )}
                {isStaff && (
                    <ContactosWhatsapp {...agenda} onElegir={elegirContacto} onUsarFicha={usarFicha}
                        accion={onNuevoRapido ? 'Usar' : 'Dar de alta'} ocultarClientes={idsListados} />
                )}
                {onNuevoRapido && escrito.length >= 2 && !/^\+?[\d\s]+$/.test(escrito) && (
                    <button type="button" onClick={() => { setBusqueda(''); onNuevoRapido({ nombre: escrito, tlf: '', prescriptorId: null, deWhatsapp: false }); }}
                        className="w-full text-left px-4 py-3 rounded-xl border border-dashed border-brand/30 hover:border-brand/60 transition-colors">
                        <div className="text-sm text-white truncate">Es nuevo: usar «{escrito}»</div>
                        <div className="text-[11px] text-white/30">
                            {hayAlgo ? 'Si no es ninguno de los de arriba. ' : ''}Con el nombre y el teléfono basta: el resto lo completa él al aceptar.
                        </div>
                    </button>
                )}
                <button type="button" onClick={abrirNuevo}
                    className="w-full min-h-[44px] rounded-xl border border-dashed border-white/15 text-[11px] font-black uppercase tracking-widest text-white/45 hover:text-white hover:border-white/30 transition-colors">
                    + Crear cliente nuevo{onNuevoRapido ? ' con todos sus datos' : ''}
                </button>
                {/* Se DICE que la ficha nacerá con la dirección del inmueble: si no,
                    quien dé de alta al propietario de un piso alquilado no mira ese
                    bloque y se guarda una dirección que no es la suya. */}
                {heredaDireccion && (
                    <p className="text-[11px] text-white/30">
                        Nacerá con la dirección del inmueble ya puesta{direccionHeredada.municipio ? ` (${direccionHeredada.municipio})` : ''}. Si el titular vive en otro sitio, se cambia ahí mismo.
                    </p>
                )}
            </div>

            <ClienteFormModal
                isOpen={showNuevo}
                onClose={() => setShowNuevo(false)}
                onSuccess={(c) => { setShowNuevo(false); if (c?.id_cliente) elegir(c); }}
                initialData={(heredaDireccion || prefill) ? { ...(heredaDireccion ? direccionHeredada : {}), ...(prefill || {}) } : undefined}
            />
        </>
    );
}

export default ClientePicker;
