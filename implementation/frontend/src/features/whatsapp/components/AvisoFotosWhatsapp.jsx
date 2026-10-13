import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';

// ─────────────────────────────────────────────────────────────────────────────
// El AVISO «ha mandado fotos por WhatsApp» en la cabecera del expediente: un
// punto verde con cuántas han llegado por los chats del cliente sin colocar,
// para verlo sin abrir la documentación. La cuenta es la misma del gestor
// (`GET /api/oportunidades/:id/whatsapp-media/sin-colocar`, ligera y con caché).
// Solo equipo interno; callado si falla.
// ─────────────────────────────────────────────────────────────────────────────

export function AvisoFotosWhatsapp({ oppId }) {
    const { user } = useAuth();
    const { isStaff } = getRoleFlags(user);
    const [n, setN] = useState(0);

    useEffect(() => {
        if (!isStaff || !oppId) return undefined;
        let vivo = true;
        axios.get(`/api/oportunidades/${oppId}/whatsapp-media/sin-colocar`, { timeout: 90000 })
            .then(r => { if (vivo) setN(Number(r.data?.total) || 0); })
            .catch(() => { /* sin aviso */ });
        return () => { vivo = false; };
    }, [isStaff, oppId]);

    if (!n) return null;
    return (
        <span title={`${n} ${n === 1 ? 'adjunto nuevo' : 'adjuntos nuevos'} por WhatsApp sin colocar`}
            className="ml-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-emerald-500 text-[10px] font-black text-bkg-deep">
            {n}
        </span>
    );
}

export default AvisoFotosWhatsapp;
