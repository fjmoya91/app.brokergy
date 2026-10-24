/**
 * EnlaceCortoView — /r/:codigo
 *
 * El enlace corto de los mensajes al cliente (`app.brokergy.es/r/K7M2Q9XA`): el
 * largo con token parece un timo en un WhatsApp. Pregunta al backend a qué ruta de
 * la app lleva (enlaceCorto.js) y va allí sin dejar rastro en el historial.
 * API en RELATIVO: se abre con el móvil.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';

export function EnlaceCortoView({ codigo }) {
    const [error, setError] = useState(null);

    useEffect(() => {
        axios.get(`/api/public/r/${encodeURIComponent(codigo)}`)
            .then(({ data }) => {
                if (data?.destino?.startsWith('/') && !data.destino.startsWith('//')) window.location.replace(data.destino);
                else setError('Este enlace no existe o ha caducado.');
            })
            .catch(e => setError(e.response?.data?.error || 'Este enlace no existe o ha caducado.'));
    }, [codigo]);

    return (
        <div style={{ minHeight: '100vh', background: '#faf9f7', color: '#141111', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
            {error ? (
                <div style={{ maxWidth: 360, textAlign: 'center' }}>
                    <img src="/logo_brokergy_dark.png" alt="BROKERGY" style={{ height: 32, marginBottom: 20 }} />
                    <p style={{ fontSize: 16, lineHeight: 1.5, margin: 0 }}>{error}</p>
                    <p style={{ fontSize: 14, color: '#51545f', marginTop: 10 }}>Escríbenos por WhatsApp al 623 926 179 y te lo mandamos de nuevo.</p>
                </div>
            ) : (
                <div role="status" aria-label="Abriendo" style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(255,160,0,.25)', borderTopColor: '#ffa000', animation: 'spin 0.8s linear infinite' }}>
                    <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
                </div>
            )}
        </div>
    );
}

export default EnlaceCortoView;
