import { tlfDeContacto } from '../utils/agendaWhatsapp';

// ─────────────────────────────────────────────────────────────────────────────
// La AGENDA de WhatsApp como fuente de clientes nuevos.
//
// Quien pregunta por WhatsApp ya está en el móvil con su nombre y su número: al
// darlo de alta (o al mandarle una oferta) se ELIGE de ahí en vez de teclearlo.
// Fuente única de las superficies que lo usan: el selector de cliente de los
// CEE directos (y con él, la oferta) y el formulario «Nuevo cliente». La
// búsqueda es `useAgendaWhatsapp` (utils/agendaWhatsapp.js).
//
// Solo equipo interno: la ruta es `staffOnly` y un 403 se calla (el partner no
// ve la agenda de la empresa, ni el aviso de que existe). WhatsApp desconectado
// se dice en una línea y el resto de la pantalla sigue igual.
// ─────────────────────────────────────────────────────────────────────────────

const verTlf = (c) => {
    const t = tlfDeContacto(c);
    return /^\d{9}$/.test(t) ? t.replace(/(\d{3})(\d{2})(\d{2})(\d{2})/, '$1 $2 $3 $4') : t;
};

/**
 * La lista de contactos encontrados.
 * @param {Function} onElegir    (contacto) → darlo de alta / usarlo como nuevo.
 * @param {Function} [onUsarFicha] (id_cliente) → si se pasa, un número que ya
 *        está en la app ofrece "Usar su ficha". Si no, solo se avisa.
 * @param {string}   [accion]    texto del botón principal ("Dar de alta", "Usar").
 * @param {Set}      [ocultarClientes] ids ya listados arriba: ese contacto no se repite.
 */
export function ContactosWhatsapp({ contactos = [], buscando = false, error = null, onElegir, onUsarFicha,
    accion = 'Dar de alta', ocultarClientes = null }) {
    const lista = ocultarClientes
        ? contactos.filter(c => !(c.clientes?.length && c.clientes.every(f => ocultarClientes.has(f.id_cliente))))
        : contactos;
    if (!buscando && !error && !lista.length) return null;
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 pt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300/70">En tu WhatsApp</span>
                {buscando && <span className="text-[11px] text-white/30">buscando…</span>}
            </div>
            {error && <p className="text-[11px] text-amber-300/80">{error}</p>}
            {lista.map((c, i) => {
                const sinNumero = !c.telefono;
                const fichas = c.clientes || [];
                const guardadoComo = c.nombre_agenda && c.nombre_agenda !== c.propuesta?.completo ? c.nombre_agenda : null;
                return (
                    <div key={c.telefono || `sin-${i}`}
                        className="rounded-xl bg-emerald-500/[0.03] border border-emerald-500/15 px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm text-white truncate">{c.propuesta?.completo || c.pushname || 'Sin nombre'}</div>
                                <div className="text-[11px] text-white/35 truncate">
                                    {[sinNumero ? 'sin número visible' : verTlf(c),
                                        guardadoComo ? `guardado como «${guardadoComo}»` : (c.en_agenda ? 'en la agenda' : 'solo chat')]
                                        .filter(Boolean).join(' · ')}
                                </div>
                            </div>
                            {!sinNumero && (
                                <button type="button" onClick={() => onElegir?.(c)}
                                    className="shrink-0 min-h-[36px] px-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-colors">
                                    {fichas.length ? 'Es otra persona' : accion}
                                </button>
                            )}
                        </div>
                        {c.partner && (
                            <p className="mt-2 text-[11px] text-amber-300/80">
                                Ojo: es un teléfono de {c.partner.nombre} (partner).
                            </p>
                        )}
                        {fichas.length > 0 && (
                            <div className="mt-2 space-y-1">
                                {fichas.map(f => (
                                    <div key={`${f.id_cliente}-${f.via}`} className="flex items-center justify-between gap-3 text-[11px]">
                                        <span className="text-amber-300/80 min-w-0 truncate">
                                            Ya está en la app: {f.nombre || 'cliente sin nombre'}{f.via !== 'titular' ? ` (${f.via})` : ''}
                                        </span>
                                        {onUsarFicha && (
                                            <button type="button" onClick={() => onUsarFicha(f.id_cliente)}
                                                className="shrink-0 min-h-[32px] px-2 text-[10px] font-black uppercase tracking-widest text-brand/80 hover:text-brand">
                                                Usar su ficha
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default ContactosWhatsapp;
