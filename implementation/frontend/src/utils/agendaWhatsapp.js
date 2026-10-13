import { useState, useEffect } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Buscar en la AGENDA de WhatsApp (la lógica; lo que se pinta está en
// components/AgendaWhatsapp.jsx). Ruta: GET /api/whatsapp/contactos/buscar,
// solo equipo interno — un 401/403 se calla.
// ─────────────────────────────────────────────────────────────────────────────

const VACIO = { contactos: [], buscando: false, error: null };

/** Busca en la agenda mientras se escribe (desde 3 caracteres, con pausa). */
export function useAgendaWhatsapp(q, activo = true) {
    const texto = (q || '').trim();
    const valido = activo && texto.replace(/\s/g, '').length >= 3;
    // Lo último que contestó el servidor, con la búsqueda a la que contesta: si
    // no es la de ahora, se está buscando (y se sigue viendo lo anterior).
    const [res, setRes] = useState({ q: null, contactos: [], error: null });

    useEffect(() => {
        if (!valido) return undefined;
        let vivo = true;
        const t = setTimeout(() => {
            axios.get('/api/whatsapp/contactos/buscar', { params: { q: texto } })
                .then(r => { if (vivo) setRes({ q: texto, contactos: r.data?.contactos || [], error: null }); })
                .catch(err => {
                    if (!vivo) return;
                    const st = err.response?.status;
                    setRes({
                        q: texto, contactos: [],
                        error: st === 401 || st === 403 ? null : (err.response?.data?.error || 'No se ha podido buscar en WhatsApp.'),
                    });
                });
        }, 350);
        return () => { vivo = false; clearTimeout(t); };
    }, [texto, valido]);

    if (!valido) return VACIO;
    const alDia = res.q === texto;
    return { contactos: res.contactos, buscando: !alDia, error: alDia ? res.error : null };
}

/** El teléfono como se guarda en la ficha: un móvil español sin el 34; otro país, con su +. */
export function tlfDeContacto(c) {
    const d = String(c?.telefono || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.length === 11 && d.startsWith('34')) return d.slice(2);
    return d.length === 9 ? d : `+${d}`;
}
