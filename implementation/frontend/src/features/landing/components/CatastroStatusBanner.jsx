/**
 * Banner discreto que aparece cuando el Catastro está rate-limitado.
 * Polling cada 60s para detectar cuándo se restablece.
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';

export function CatastroStatusBanner() {
    const [status, setStatus] = useState(null);

    useEffect(() => {
        let cancelled = false;

        const check = async () => {
            try {
                const res = await axios.get('/api/catastro/status', { timeout: 4000 });
                if (cancelled) return;
                setStatus(res.data);
            } catch {
                // Si el endpoint mismo falla, no mostramos nada — no queremos
                // alarmar al usuario por un problema de red transitorio.
            }
        };

        check();
        const interval = setInterval(check, 60_000); // cada 60s
        return () => { cancelled = true; clearInterval(interval); };
    }, []);

    if (!status?.blocked) return null;

    const minutos = status.durationMs ? Math.floor(status.durationMs / 60000) : 0;

    return (
        <div className="fixed top-0 left-0 right-0 z-[500] bg-amber-500/95 backdrop-blur-sm text-bkg-deep px-4 py-2 shadow-lg animate-slide-down">
            <div className="max-w-3xl mx-auto flex items-center gap-3 text-xs md:text-sm font-bold">
                <span className="text-lg flex-shrink-0">⚠️</span>
                <div className="flex-1 leading-snug">
                    <strong>Servicio del Catastro saturado temporalmente.</strong>{' '}
                    Algunas búsquedas pueden fallar.
                    {minutos > 0 && <span className="ml-1 opacity-70">({minutos} min)</span>}
                </div>
            </div>
        </div>
    );
}
