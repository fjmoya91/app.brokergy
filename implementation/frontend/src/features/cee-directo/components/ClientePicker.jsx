import { useState, useEffect, useMemo } from 'react';
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
//
// RAPIDEZ (24/10/2026, auditoría de Facturación F31): antes cada pulsación —tras
// 300 ms de pausa— volvía a pedir `GET /api/clientes` ENTERO y filtraba en el
// navegador: segundos por letra. Ahora la lista se pide UNA vez al abrir el
// selector (caché del módulo, por usuario, 2 minutos, compartida entre los
// selectores abiertos) y se filtra en memoria al teclear: el resultado sale con
// la letra. Al crear un cliente desde aquí, la caché se tira.
// ─────────────────────────────────────────────────────────────────────────────

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const digitos = (s) => String(s || '').replace(/\D/g, '');

const VIDA_CACHE_MS = 2 * 60 * 1000;
let cache = { clave: null, at: 0, datos: null, promesa: null };

/** La lista de clientes, de la caché si es reciente; una sola petición aunque la pidan varios. */
function leerClientes(clave) {
    if (cache.clave === clave) {
        if (cache.datos && Date.now() - cache.at < VIDA_CACHE_MS) return Promise.resolve(cache.datos);
        if (cache.promesa) return cache.promesa;
    } else {
        cache = { clave, at: 0, datos: null, promesa: null };
    }
    const p = axios.get('/api/clientes').then(r => {
        const datos = Array.isArray(r.data) ? r.data : [];
        if (cache.promesa === p) cache = { clave, at: Date.now(), datos, promesa: null };
        return datos;
    }).catch(err => {
        if (cache.promesa === p) cache = { ...cache, promesa: null };
        throw err;
    });
    cache = { ...cache, promesa: p };
    return p;
}

/** Tras crear o cambiar un cliente: la próxima búsqueda vuelve a pedir la lista. */
// eslint-disable-next-line react-refresh/only-export-components -- vacía la caché de este módulo: tiene que vivir junto a ella
export function olvidarClientesBuscados() { cache = { clave: null, at: 0, datos: null, promesa: null }; }

/**
 * Los clientes que casan con lo escrito. Coincide si TODAS las palabras aparecen en
 * algún campo («atersol valencia» encuentra la ficha aunque el orden no sea ese); un
 * número se busca por sus dígitos, con o sin espacios ni prefijo 34.
 */
function filtrar(indice, busqueda) {
    const q = busqueda.trim();
    if (q.length < 2 || !indice) return [];
    const palabras = norm(q).split(/\s+/).filter(Boolean);
    const num = digitos(q);
    const esNumero = num.length >= 6 && !/[a-z]/i.test(q);
    const n9 = num.length > 9 && num.startsWith('34') ? num.slice(2) : num;
    const out = [];
    for (const x of indice) {
        const vale = esNumero ? x.tlfs.some(t => t.includes(n9)) : palabras.every(w => x.heno.includes(w));
        if (vale) { out.push(x.c); if (out.length >= 8) break; }
    }
    return out;
}

const nombreDe = (c) => `${c?.nombre_razon_social || ''} ${c?.apellidos || ''}`.trim();

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
 * @param {'oscuro'|'fx'} [tema] 'fx' lo pinta con el estilo crema de la pestaña
 *        Facturación (clases `.fx-`); por defecto, el oscuro del CRM.
 * @param {string} [placeholder] el texto del buscador.
 */
export function ClientePicker({
    cliente, onChange, onEditar, autoFocus = false, datosNuevoCliente = null, onNuevoRapido = null,
    tema = 'oscuro', placeholder = null,
}) {
    const { user } = useAuth();
    const { isStaff } = getRoleFlags(user);
    const clave = user?.id || user?.email || 'sesion';
    const [busqueda, setBusqueda] = useState('');
    const [todos, setTodos] = useState(() => (cache.clave === clave ? cache.datos : null));
    const [errorLista, setErrorLista] = useState(null);
    const [showNuevo, setShowNuevo] = useState(false);
    const [prefill, setPrefill] = useState(null);
    const fx = tema === 'fx';

    const agenda = useAgendaWhatsapp(busqueda, isStaff && !cliente);

    // La lista se pide al abrir el selector (sin cliente elegido), no al teclear.
    useEffect(() => {
        if (cliente) return undefined;
        let vivo = true;
        leerClientes(clave)
            .then(d => { if (vivo) { setTodos(d); setErrorLista(null); } })
            .catch(err => { if (vivo) setErrorLista(err.response?.data?.error || 'No se ha podido leer la lista de clientes.'); });
        return () => { vivo = false; };
    }, [cliente, clave]);

    // Lo que se compara, normalizado una vez por lista (no por letra).
    const indice = useMemo(() => (todos ? todos.map(c => ({
        c,
        heno: norm([c.nombre_razon_social, c.apellidos, c.dni, c.municipio, c.whatsapp_nombres].filter(Boolean).join(' ')),
        tlfs: [c.tlf, c.persona_contacto_tlf].map(digitos).filter(Boolean),
    })) : null), [todos]);
    const resultados = useMemo(() => filtrar(indice, busqueda), [indice, busqueda]);
    const escrito = busqueda.trim();
    const buscando = escrito.length >= 2 && !todos && !errorLista;

    const elegir = (c) => { setBusqueda(''); onChange?.(c); };
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
            setBusqueda('');
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
        const c = (todos || []).find(x => x.id_cliente === id);
        if (c) elegir(c);
    };
    const abrirNuevo = () => { setPrefill(null); setShowNuevo(true); };
    const usarEscrito = () => { setBusqueda(''); onNuevoRapido({ nombre: escrito, tlf: '', prescriptorId: null, deWhatsapp: false }); };
    const ofrecerNuevo = onNuevoRapido && escrito.length >= 2 && !/^\+?[\d\s]+$/.test(escrito);
    const hayAlgo = resultados.length > 0 || agenda.contactos.length > 0;

    const modalAlta = (
        <ClienteFormModal
            isOpen={showNuevo}
            onClose={() => setShowNuevo(false)}
            onSuccess={(c) => { setShowNuevo(false); olvidarClientesBuscados(); if (c?.id_cliente) elegir(c); }}
            initialData={(heredaDireccion || prefill) ? { ...(heredaDireccion ? direccionHeredada : {}), ...(prefill || {}) } : undefined}
        />
    );

    // ── Estilo crema (pestaña Facturación) ──────────────────────────────────
    if (fx) {
        if (cliente) {
            return (
                <div className="fx-ficha">
                    <div>
                        <b>{nombreDe(cliente) || 'Cliente sin nombre'}</b>
                        <small>{[cliente.dni, cliente.tlf || cliente.telefono, cliente.email].filter(Boolean).join(' · ') || 'Sin datos de contacto'}</small>
                    </div>
                    {onEditar && <button type="button" className="fx-link" onClick={onEditar}>Editar</button>}
                    <button type="button" className="fx-link" onClick={() => onChange?.(null)}>Cambiar</button>
                </div>
            );
        }
        const contactos = agenda.contactos.filter(c => !(c.clientes?.length && c.clientes.every(f => idsListados.has(f.id_cliente))));
        return (
            <>
                <div className="fx-cp">
                    <input className="fx-input" autoFocus={autoFocus} value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        placeholder={placeholder || (isStaff ? 'Nombre, teléfono o DNI (busca también en tu WhatsApp)' : 'Nombre, DNI o municipio')}
                        aria-label="Buscar el cliente" autoComplete="off" />
                    {buscando && <p className="fx-cp-vacio">Abriendo la lista de clientes…</p>}
                    {errorLista && <p className="fx-error">{errorLista}</p>}
                    {resultados.length > 0 && isStaff && <div className="fx-cp-tit">En la app</div>}
                    {resultados.map(c => (
                        <button key={c.id_cliente} type="button" className="fx-cp-op" onClick={() => elegir(c)}>
                            <div>
                                <b>{nombreDe(c) || 'Cliente sin nombre'}</b>
                                <small>{[c.dni, c.tlf, c.municipio].filter(Boolean).join(' · ') || 'Sin datos'}</small>
                            </div>
                        </button>
                    ))}
                    {escrito.length >= 2 && todos && resultados.length === 0 && !onNuevoRapido && (
                        <p className="fx-cp-vacio">Ningún cliente con ese nombre en la app.</p>
                    )}
                    {isStaff && (agenda.buscando || agenda.error || contactos.length > 0) && (
                        <div className="fx-cp-tit"><i />En tu WhatsApp{agenda.buscando ? ' · buscando…' : ''}</div>
                    )}
                    {isStaff && agenda.error && <p className="fx-error">{agenda.error}</p>}
                    {isStaff && contactos.map((k, i) => {
                        const fichas = k.clientes || [];
                        const tlf = tlfDeContacto(k);
                        const guardadoComo = k.nombre_agenda && k.nombre_agenda !== k.propuesta?.completo ? k.nombre_agenda : null;
                        return (
                            <div key={k.telefono || `sin-${i}`} className="fx-cp-wa">
                                <div className="fx-cp-wa-top">
                                    <div>
                                        <b>{k.propuesta?.completo || k.pushname || 'Sin nombre'}</b>
                                        <small>{[tlf || 'sin número visible', guardadoComo ? `guardado como «${guardadoComo}»` : (k.en_agenda ? 'en la agenda' : 'solo chat')].join(' · ')}</small>
                                    </div>
                                    {tlf && (
                                        <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => elegirContacto(k)}>
                                            {fichas.length ? 'Es otra persona' : (onNuevoRapido ? 'Usar' : 'Dar de alta')}
                                        </button>
                                    )}
                                </div>
                                {k.partner && <p>Ojo: es un teléfono de {k.partner.nombre} (partner).</p>}
                                {fichas.map(f => (
                                    <div key={`${f.id_cliente}-${f.via}`} className="fx-cp-wa-top">
                                        <div><small>Ya está en la app: {f.nombre || 'cliente sin nombre'}{f.via !== 'titular' ? ` (${f.via})` : ''}</small></div>
                                        <button type="button" className="fx-link" onClick={() => usarFicha(f.id_cliente)}>Usar su ficha</button>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                    {ofrecerNuevo && (
                        <button type="button" className="fx-cp-op fx-cp-nuevo" onClick={usarEscrito}>
                            <div>
                                <b>Es nuevo: usar «{escrito}»</b>
                                <small>{hayAlgo ? 'Si no es ninguno de los de arriba. ' : ''}Con el nombre y el móvil basta.</small>
                            </div>
                        </button>
                    )}
                    {!onNuevoRapido && (
                        <button type="button" className="fx-btn fx-btn-sec" onClick={abrirNuevo}>Crear cliente nuevo</button>
                    )}
                </div>
                {!onNuevoRapido && modalAlta}
            </>
        );
    }

    // ── Estilo oscuro del CRM (CEE directos) ────────────────────────────────
    if (cliente) {
        return (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                        {nombreDe(cliente)}
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
                    placeholder={placeholder || (isStaff ? 'Nombre, teléfono o DNI (busca también en tu WhatsApp)…' : 'Busca por nombre, DNI o municipio…')}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40"
                />
                {buscando && <p className="text-[11px] text-white/30">Buscando…</p>}
                {errorLista && escrito.length >= 2 && <p className="text-[11px] text-amber-300/80">{errorLista}</p>}
                {resultados.length > 0 && isStaff && (
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/35 pt-1">En la app</div>
                )}
                {resultados.map(c => (
                    <button key={c.id_cliente} type="button" onClick={() => elegir(c)}
                        className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-brand/40 transition-colors">
                        <div className="text-sm text-white truncate">{nombreDe(c)}</div>
                        <div className="text-[11px] text-white/30">{[c.dni, c.tlf, c.municipio].filter(Boolean).join(' · ')}</div>
                    </button>
                ))}
                {escrito.length >= 2 && todos && resultados.length === 0 && !onNuevoRapido && (
                    <p className="text-[11px] text-white/30">Ningún cliente con ese nombre en la app.</p>
                )}
                {isStaff && (
                    <ContactosWhatsapp {...agenda} onElegir={elegirContacto} onUsarFicha={usarFicha}
                        accion={onNuevoRapido ? 'Usar' : 'Dar de alta'} ocultarClientes={idsListados} />
                )}
                {ofrecerNuevo && (
                    <button type="button" onClick={usarEscrito}
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
            {modalAlta}
        </>
    );
}

export default ClientePicker;
