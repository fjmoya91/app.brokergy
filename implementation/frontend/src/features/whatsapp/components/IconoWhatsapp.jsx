import { ICONO_CANAL } from '../../../utils/iconosCanal';

/** El logo de WhatsApp, de relleno (`className` da tamaño y color). */
export function IconoWhatsapp({ className = 'w-3.5 h-3.5' }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d={ICONO_CANAL.whatsapp} />
        </svg>
    );
}

export default IconoWhatsapp;
