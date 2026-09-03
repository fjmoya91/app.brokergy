import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Canal de envío (Email / WhatsApp) para la BARRA INFERIOR de los popups de
// envío, pegado al botón de Enviar.
//
// No va en el cuerpo del popup: es la última decisión y la única que habilita
// el botón, pero quedaba al final de un cuerpo largo (documento + destinatarios
// + mensaje) — con el modal desplazado no se veía, y ENVIAR aparecía apagado
// sin que nada explicase por qué.
//
// Vive aquí, y no dentro de un modal, porque lo usan TRES superficies de envío
// (propuesta, CIFO y documentación RITE). Con una copia por modal, la de cada
// uno acabaría divergiendo justo en la parte delicada: cuándo el canal está
// disponible y qué se dice cuando no lo está.
//
// Se identifican por el LOGO de la marca, que se reconoce antes que la palabra.
// El glifo de WhatsApp es el oficial; el de email, un sobre.
// ─────────────────────────────────────────────────────────────────────────────

const ICONO_CANAL = {
    email: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    whatsapp: 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12.05 21.785h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z',
};

// Las clases van LITERALES (nada de componerlas con plantillas): Tailwind solo
// genera las que encuentra escritas en el código.
const TONO_CANAL = {
    email: { borde: 'border-brand/60 bg-brand/[0.07]', bloque: 'bg-brand', anillo: 'ring-brand/25' },
    whatsapp: { borde: 'border-emerald-400/60 bg-emerald-400/[0.07]', bloque: 'bg-emerald-400', anillo: 'ring-emerald-400/25' },
};

// `bloqueado` (mientras se envía) NO es lo mismo que no disponible: el canal
// sigue pintándose como lo que es —marcado o no—, solo deja de aceptar clics.
// Apagarlo visualmente a mitad de un envío haría dudar de por dónde ha salido.
export function CanalChip({ canal, nombre, activo, disponible, detalle, motivo, onClick, bloqueado = false }) {
    const t = TONO_CANAL[canal];
    const solido = canal === 'whatsapp';   // el glifo de WhatsApp es de relleno, el sobre de trazo
    return (
        <button
            type="button"
            role="switch"
            aria-checked={activo}
            aria-label={`Enviar por ${nombre}`}
            disabled={!disponible || bloqueado}
            onClick={onClick}
            title={!disponible ? motivo : (activo ? `No enviar por ${nombre}` : `Enviar por ${nombre}`)}
            className={`flex-1 sm:flex-none flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-2xl border transition-all active:scale-[0.97] ${bloqueado ? 'cursor-wait' : ''} ${
                !disponible
                    ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/[0.02]'
                    : activo
                        ? `${t.borde} ring-2 ${t.anillo}`
                        : 'border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]'
            }`}
        >
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${activo && disponible ? t.bloque : 'bg-white/[0.07]'}`}>
                <svg className={`w-[18px] h-[18px] ${activo && disponible ? 'text-black' : 'text-white/45'}`} viewBox="0 0 24 24"
                    fill={solido ? 'currentColor' : 'none'} stroke={solido ? 'none' : 'currentColor'} strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={ICONO_CANAL[canal]} />
                </svg>
            </span>
            <span className="text-left leading-tight">
                <span className="block text-[11px] font-black uppercase tracking-wider text-white">{nombre}</span>
                <span className="block text-[9.5px] text-white/40">{disponible ? detalle : motivo}</span>
            </span>
        </button>
    );
}

/**
 * Por qué no se puede enviar (null = se puede).
 *
 * "Marca un canal" solo vale cuando hay alguno QUE marcar: si el destinatario no
 * tiene email y WhatsApp está caído, no hay nada que pulsar y decirlo así es dar
 * una orden imposible. El orden importa: primero lo que falta por elegir, después
 * lo que ni siquiera existe como opción.
 *
 * `nDest` a null cuando el popup no exige elegir destinatario (lo trae fijado).
 */
export function avisoCanales({ nDest, canEmail, hayTelefono, waReady, willEmail, willWhatsapp }) {
    if (nDest === 0) return 'Elige destinatario';
    if (!canEmail && !hayTelefono) return 'Sin email ni teléfono';
    if (!canEmail && waReady === false) return 'WhatsApp sin conectar';
    if (!willEmail && !willWhatsapp) return 'Marca un canal';
    return null;
}
