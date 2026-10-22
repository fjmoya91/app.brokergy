import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

/**
 * La CARTA DE PAGO del Bono CAE en la ficha del expediente (solo ADMIN: lleva
 * importes). Se genera sola al subir el justificante de la transferencia en la
 * fase 7 del lote; aquí se ve y se puede rehacer, siempre con el MISMO número
 * (cartaPagoService). El envío al cliente sigue siendo el del lote.
 */
export function CartaPagoBloque({ expedienteId }) {
    const [estado, setEstado] = useState(null);
    const [trabajando, setTrabajando] = useState(false);
    const [error, setError] = useState('');

    const cargar = useCallback(async () => {
        try {
            const { data } = await axios.get(`/api/expedientes/${expedienteId}/carta-pago`);
            setEstado(data);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo leer la carta de pago');
        }
    }, [expedienteId]);

    useEffect(() => { cargar(); }, [cargar]);

    const generar = async () => {
        setTrabajando(true);
        setError('');
        try {
            await axios.post(`/api/expedientes/${expedienteId}/carta-pago`);
            await cargar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo generar la carta de pago');
        } finally {
            setTrabajando(false);
        }
    };

    const ver = async () => {
        setError('');
        try {
            const { data } = await axios.get(`/api/expedientes/${expedienteId}/carta-pago.pdf`, { responseType: 'blob' });
            window.open(URL.createObjectURL(data), '_blank', 'noopener');
        } catch {
            setError('No se pudo abrir el PDF');
        }
    };

    if (!estado) return null;
    const c = estado.carta;
    const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES') : '');

    return (
        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.07] flex items-center gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
                <span className="text-[10px] text-white/45 font-bold uppercase tracking-widest block">Carta de pago · Bono CAE</span>
                {c ? (
                    <p className="text-[12px] text-white">
                        <span className="font-bold">{c.numero}</span>
                        <span className="text-white/45"> · generada el {fecha(c.at)}</span>
                        {c.enviada_at
                            ? <span className="text-emerald-300"> · enviada el {fecha(c.enviada_at)} ({(c.enviada_canales || []).join(' + ')})</span>
                            : <span className="text-white/35"> · sin enviar (se envía desde el lote, fase 7)</span>}
                    </p>
                ) : (
                    <p className="text-[12px] text-white/45">
                        {estado.transferencia_at
                            ? 'Transferencia hecha y todavía sin carta.'
                            : 'Se genera al subir el justificante de la transferencia (lote, fase 7).'}
                    </p>
                )}
                {error && <p className="text-[11px] text-red-400 mt-1">{error}</p>}
            </div>
            {c && (
                <button type="button" onClick={ver}
                    className="px-3 py-2 rounded-lg border border-white/15 text-[11px] font-bold text-white/80 hover:bg-white/5">
                    📄 Ver PDF
                </button>
            )}
            {estado.transferencia_at && (
                <button type="button" onClick={generar} disabled={trabajando}
                    className="px-3 py-2 rounded-lg bg-brand text-black text-[11px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110">
                    {trabajando ? 'Generando…' : (c ? 'Rehacer' : 'Generar carta de pago')}
                </button>
            )}
        </div>
    );
}
