import { useState } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se hace con un PRESUPUESTO enviado desde su fila del listado: ver el
// PDF, copiar el enlace de aceptación, reenviarlo por donde salió o anularlo.
// Una oferta aún no es un expediente (no tiene número de CEE hasta que el
// cliente acepta), así que su fila no abre ficha: despliega estas acciones.
// ─────────────────────────────────────────────────────────────────────────────
export function AccionesOferta({ oferta: f, onCambio }) {
    const { showConfirm } = useModal();
    const [ocupado, setOcupado] = useState(false);
    const [aviso, setAviso] = useState(null);   // { texto, tono }
    const pendiente = f.estado === 'ENVIADA';

    const verPdf = async () => {
        setOcupado(true);
        try {
            const r = await axios.get(`/api/cee-directos/ofertas/${f.id}/pdf`, { responseType: 'blob', timeout: 90000 });
            window.open(URL.createObjectURL(r.data), '_blank', 'noopener');
        } catch {
            setAviso({ texto: 'No se pudo preparar el PDF.', tono: 'error' });
        } finally { setOcupado(false); }
    };

    const reenviar = async () => {
        const u = f.ultimo_envio || {};
        const por = [u.email && `email (${u.email})`, u.tlf && `WhatsApp (${u.tlf})`].filter(Boolean).join(' y ');
        if (!por) return;
        if (!(await showConfirm(`Se vuelve a mandar el presupuesto ${f.numero} por ${por}, con el mismo enlace.`, 'Reenviar el presupuesto', 'info', { confirmar: 'Reenviar' }))) return;
        setOcupado(true);
        try {
            await axios.post(`/api/cee-directos/ofertas/${f.id}/enviar`, {
                canales: [...(u.email ? ['email'] : []), ...(u.tlf ? ['whatsapp'] : [])], email: u.email, tlf: u.tlf,
            }, { timeout: 120000 });
            setAviso({ texto: `Reenviado por ${por}.`, tono: 'ok' });
            onCambio?.();
        } catch (err) {
            setAviso({ texto: err.response?.data?.error || 'No se pudo reenviar.', tono: 'error' });
        } finally { setOcupado(false); }
    };

    const copiarEnlace = async () => {
        const url = `${window.location.origin}/aceptar-cee/${f.token}`;
        try { await navigator.clipboard.writeText(url); setAviso({ texto: 'Enlace copiado.', tono: 'ok' }); }
        catch { setAviso({ texto: url, tono: 'info' }); }
    };

    const anular = async () => {
        if (!(await showConfirm(`El enlace de ${f.numero} dejará de servir para aceptarlo. No se le avisa al cliente.`, 'Anular el presupuesto', 'warning', { confirmar: 'Anular' }))) return;
        setOcupado(true);
        try { await axios.post(`/api/cee-directos/ofertas/${f.id}/anular`); onCambio?.(); }
        catch (err) { setAviso({ texto: err.response?.data?.error || 'No se pudo anular.', tono: 'error' }); }
        finally { setOcupado(false); }
    };

    const btn = 'min-h-[34px] px-3 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/55 hover:text-white hover:border-white/25 transition-colors disabled:opacity-30';

    return (
        <div onClick={e => e.stopPropagation()}>
            <div className="flex flex-wrap gap-1.5">
                <button className={btn} disabled={ocupado} onClick={verPdf}>📄 Ver PDF</button>
                {pendiente && <button className={btn} disabled={ocupado} onClick={copiarEnlace}>🔗 Copiar enlace</button>}
                {pendiente && f.ultimo_envio && <button className={btn} disabled={ocupado} onClick={reenviar}>Reenviar</button>}
                {pendiente && <button className={`${btn} hover:text-red-300`} disabled={ocupado} onClick={anular}>Anular</button>}
            </div>
            {aviso && (
                <div className={`mt-2 text-[11px] ${aviso.tono === 'error' ? 'text-red-300' : aviso.tono === 'ok' ? 'text-emerald-300' : 'text-white/50 break-all'}`}>{aviso.texto}</div>
            )}
        </div>
    );
}

export default AccionesOferta;
