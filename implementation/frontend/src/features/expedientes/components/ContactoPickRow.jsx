import React from 'react';
import { ROL_LABEL, priorizarPorRol } from '../utils/docContacts';

// ─── Una fila de "¿a quién se lo mando?" ──────────────────────────────────────
//
// La comparten los CUATRO popups que escriben a un partner (CIFO, documentación
// RITE, solicitar lo que falta y el rechazo de un documento). Estaba copiada en
// los cuatro con diferencias de forma, y esa fila es donde se comete el error:
// es lo último que se mira antes de pulsar lo único irreversible.
//
// REGLA — se enseña el ROL y se dice cuál viene marcado POR DEFECTO. Dos nombres
// en una lista son dos nombres: sin la chapa no hay forma de saber que a uno le
// toca firmar y al otro no. El del asunto va resaltado; los demás siguen ahí
// para marcarlos en copia o para cambiar el envío puntualmente.
//
// REGLA — el canal general de la empresa se llama por lo que es. Antes esta fila
// decía "Jesús · 654547040" cuando ese número era el de la centralita —y en la
// práctica, el móvil del comercial—: el nombre de una persona sobre el teléfono
// de otra es exactamente lo que hizo que la Memoria RITE saliera a quien no era.

/**
 * @param {object} c        contacto ({label|nombre}, {phone|tlf}, email, roles, general, {sublabel|tipo})
 * @param {boolean} on      marcado
 * @param {string} rol      'comercial' | 'tecnico' — el asunto que se está enviando
 * @param {function} onClick
 */
export function ContactoPickRow({ contacto: c, on, rol = null, onClick, className = '' }) {
    const nombre = c.label || c.nombre || 'Contacto';
    const tlf = c.phone || c.tlf || '';
    const roles = Array.isArray(c.roles) ? c.roles : [];
    // El CARGO escrito en la ficha suele ser justo el nombre del rol ("COMERCIAL"),
    // y entonces la fila decía "CARLOS · Comercial · COMERCIAL". Se calla cuando
    // repite lo que ya dice la chapa: el rol manda, el cargo solo añade contexto
    // cuando dice algo más ("JEFE DE OBRA", "GESTOR CAE").
    const subRaw = c.sublabel || c.tipo || '';
    const sub = roles.some(r => (ROL_LABEL[r] || '').toUpperCase() === subRaw.trim().toUpperCase()) ? '' : subRaw;
    const esElQueToca = !!rol && roles.includes(rol);

    return (
        <button type="button" onClick={onClick}
            className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${className || 'w-full'} ${on ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-white truncate">{nombre}</span>
                    {roles.map(r => (
                        <span key={r}
                            className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${
                                r === rol ? 'bg-brand/15 text-brand border-brand/30' : 'bg-white/5 text-white/35 border-white/10'}`}>
                            {ROL_LABEL[r] || r}
                        </span>
                    ))}
                    {esElQueToca && (
                        <span className="text-[9px] uppercase tracking-wider text-brand/60 font-bold shrink-0">· le toca</span>
                    )}
                    {c.general && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border bg-white/5 text-white/35 border-white/10 shrink-0">Empresa</span>
                    )}
                    {!!sub && !c.general && (
                        <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold shrink-0">{sub}</span>
                    )}
                </div>
                <div className="text-[11px] text-white/40 truncate">
                    {tlf || 'sin teléfono'}{c.email ? ` · ${c.email}` : ''}
                    {c.general && <span className="text-white/25"> · teléfono y email generales</span>}
                </div>
            </div>
        </button>
    );
}

/**
 * La coletilla de la lista cuando hay varios marcados.
 *
 * REGLA — se dice QUIÉN va en el "Para" y quién en copia. El correo sale UNA vez
 * con copia real (el primero en `to`, el resto en `cc`), así que quien tiene que
 * actuar ve que su compañero está en el mismo hilo y no contesta por duplicado.
 * WhatsApp no tiene copia: ahí recibe cada uno su propio mensaje, y eso también
 * hay que decirlo o se supone que se enteran los dos de lo mismo.
 */
export function NotaVariosDestinatarios({ seleccionados = [], email = true, whatsapp = false, rol = null }) {
    // Mismo orden que el envío: el del rol va en el `to`.
    const lista = priorizarPorRol((seleccionados || []).filter(Boolean), rol);
    if (lista.length < 2) return null;
    const nombre = (c) => c.label || c.nombre || 'Contacto';
    const destEmail = email ? lista.filter(c => c.email) : [];

    return (
        <div className="text-[10px] text-white/30 leading-relaxed space-y-0.5">
            {email && destEmail.length > 1 && (
                <p>
                    <span className="text-white/45 font-bold">Email:</span> a {nombre(destEmail[0])}
                    {', con '}{destEmail.slice(1).map(nombre).join(' y ')} en copia (un solo correo).
                </p>
            )}
            {whatsapp && (
                <p>
                    <span className="text-white/45 font-bold">WhatsApp:</span> no tiene copia — recibirá un mensaje cada uno.
                </p>
            )}
        </div>
    );
}
