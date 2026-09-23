import React from 'react';
// Quién del partner recibiría los avisos: la MISMA decisión que usa el backend
// (`contactoClienteDesdePartner`), asunto comercial.
import { contactosPara, instaladorContacts } from '../../expedientes/utils/docContacts';


/**
 * El contacto del partner que pasaría a ser la persona de contacto del cliente.
 * Espejo de `contactoClienteDesdePartner` (backend/services/notifyContacts.js):
 * el comercial marcado, o si no el canal general de la empresa. Solo sirve para
 * ENSEÑARLO — lo que se guarda lo decide el backend con la ficha al día.
 */
function contactoDelPartner(pres) {
    if (!pres) return null;
    const c = contactosPara(pres, 'comercial')[0] || instaladorContacts(pres).find(x => x.general);
    if (!c || (!c.phone && !c.email)) return null;
    return {
        nombre: c.general ? (c.saludo || pres.acronimo || pres.razon_social || 'Partner') : c.label,
        tlf: c.phone || '', email: c.email || '', general: !!c.general,
    };
}

/**
 * Interruptor "los avisos los recibe el partner". Solo existe con un prescriptor
 * asignado: sin él no hay a quién desviarlos.
 */
export function PartnerComoContacto({ form, updateForm, prescriptor }) {
    const cp = contactoDelPartner(prescriptor);
    const activo = !!form.contacto_es_partner;
    const nombrePartner = prescriptor?.acronimo || prescriptor?.razon_social;
    const hay = !!form.prescriptor_id;

    const cambiar = (on) => {
        if (on) {
            updateForm({
                contacto_es_partner: true, showContact: false,
                persona_contacto_nombre: cp?.nombre || '',
                persona_contacto_tlf: cp?.tlf || '',
                persona_contacto_email: cp?.email || '',
                notificaciones_contacto_activas: true,
            });
        } else {
            // Se retira la copia del partner: dejarla sería seguir escribiéndole a
            // él sin la marca que lo explica.
            updateForm({
                contacto_es_partner: false,
                persona_contacto_nombre: '', persona_contacto_tlf: '', persona_contacto_email: '',
                notificaciones_contacto_activas: false,
            });
        }
    };

    return (
        <div className="space-y-2">
            <label className={`flex items-center gap-3 w-fit ${hay ? 'cursor-pointer group' : 'opacity-40 cursor-not-allowed'}`}>
                <div className="relative flex items-center">
                    <input
                        type="checkbox"
                        className="peer sr-only"
                        disabled={!hay && !activo}
                        checked={activo}
                        onChange={e => cambiar(e.target.checked)}
                    />
                    <div className="w-8 h-4 bg-transparent rounded-full peer border border-orange-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-orange-500 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-orange-500 peer-checked:after:bg-white"></div>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white/60 transition-colors">
                    ¿Los avisos los recibe el partner{nombrePartner ? ` (${nombrePartner})` : ''}?
                </span>
            </label>
            {!hay && !activo && (
                <p className="text-[10px] text-white/25 italic">Asigna antes un prescriptor (más abajo) para poder activarlo.</p>
            )}
            {activo && (
                <div className="p-4 bg-sky-500/[0.04] border border-sky-500/20 rounded-xl space-y-2 animate-fade-in">
                    {!hay ? (
                        <p className="text-xs text-amber-400">Sin prescriptor asignado no se puede guardar así: asígnalo o desactiva esta opción.</p>
                    ) : cp ? (
                        <>
                            <p className="text-[10px] uppercase tracking-widest font-black text-sky-400/80">Persona de contacto: el partner</p>
                            <p className="text-sm text-white font-medium uppercase">{cp.nombre}</p>
                            <p className="text-xs text-white/60">
                                {[cp.tlf, cp.email].filter(Boolean).join(' · ')}
                                {cp.general && <span className="text-white/35"> — teléfono y email generales de la empresa</span>}
                            </p>
                        </>
                    ) : (
                        <p className="text-xs text-amber-400">El partner no tiene ningún teléfono ni email en su ficha: no se podrá guardar así.</p>
                    )}
                    <p className="text-[10px] text-white/30 italic">
                        Los WhatsApp, emails, anexos y peticiones de documentación que irían al cliente le llegan al comercial del partner.
                        Se toma de su ficha y se actualiza sola si cambia. Los documentos siguen a nombre del titular.
                    </p>
                </div>
            )}
        </div>
    );
}

