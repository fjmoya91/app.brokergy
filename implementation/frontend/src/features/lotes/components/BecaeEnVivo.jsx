import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { solicitudGeneradaPorApp } from '../logic/loteProceso';
import { accionesBecae, ESTADOS_LOTE_SIN_BECAE } from '../logic/becae';

// ─────────────────────────────────────────────────────────────────────────────
// BecaeEnVivo — el lote en beCAE (Marwen), por su API v1.6.0.
//
// Una franja encima de las fases que dice EN QUÉ ESTÁ la solicitud y el
// expediente en el verificador y ofrece SOLO el paso que toca: traer la solicitud
// o la oferta de beCAE, subirle la solicitud firmada, los ZIP de las actuaciones o
// la oferta firmada, o registrar sus inexactitudes. Antes cada uno era un viaje a
// la web de beCAE. Qué toca lo decide `accionesBecae` (logic/becae.js).
//
// Se consulta sola al abrir un lote en curso; lo que se SUBE a beCAE pide
// confirmación con la lista de ficheros (subir la oferta firmada ES aceptarla).
// Ver docs/conocimiento/lotes/la-api-de-marwen-v1-6.md.
// ─────────────────────────────────────────────────────────────────────────────

const fmtHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const mb = (b) => `${(b / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;

const TONO_ESTADO = (e) => {
    const s = String(e || '').toLowerCase();
    if (/rechaz/.test(s)) return 'text-red-300 border-red-400/30 bg-red-500/10';
    if (/resoluci|hdted|pendiente doc|ofertado/.test(s)) return 'text-amber-200 border-amber-400/30 bg-amber-500/10';
    if (/finalizado|aceptad/.test(s)) return 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10';
    return 'text-cyan-200 border-cyan-400/25 bg-cyan-500/[0.08]';
};

const Chip = ({ etiqueta, valor, num }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-bold ${TONO_ESTADO(valor)}`}>
        <span className="text-[9px] font-black uppercase tracking-wider opacity-70">{etiqueta}</span>
        {num && <span className="text-white/85">{num}</span>}
        <span>{valor || '—'}</span>
    </span>
);

export function BecaeEnVivo({ lote, p, onChanged, onTraerOferta }) {
    const { showConfirm } = useModal();
    const [estado, setEstado] = useState(null);      // respuesta de GET /marwen
    const [cargando, setCargando] = useState(false);
    const [ocupado, setOcupado] = useState(null);    // acción en curso
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');          // resultado de la última acción
    const pedido = useRef(false);

    const becae = estado?.becae || lote?.verificacion_api?.becae || null;
    const tieneVinculo = !!(lote?.verificacion_api?.num_solicitud || lote?.expediente_verificador || lote?.codigo);

    const consultar = useCallback(async () => {
        setCargando(true);
        setError('');
        try {
            const { data } = await axios.get(`/api/lotes/${lote.id}/marwen`);
            setEstado(data);
            // Lo sellado (nº de expediente, renumeración) cambia el lote de detrás.
            if (data?.lote && onChanged) onChanged(data.lote);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo consultar beCAE.');
        } finally {
            setCargando(false);
        }
    }, [lote?.id, onChanged]);

    // Se consulta SOLA una vez al abrir un lote que está con el verificador.
    useEffect(() => {
        if (pedido.current || !lote?.id || !tieneVinculo) return;
        if (ESTADOS_LOTE_SIN_BECAE.includes(lote.estado)) return;
        pedido.current = true;
        consultar();
    }, [lote?.id, lote?.estado, tieneVinculo, consultar]);

    if (!lote?.id) return null;
    const docs = becae?.documentos || [];
    const acciones = accionesBecae({ becae, p, solicitudApp: solicitudGeneradaPorApp(p.solicitud), inexConsultables: estado?.inexactitudes_consultables });

    const descargar = async (doc) => {
        setOcupado(`doc_${doc.id}`);
        setError('');
        try {
            const r = await axios.get(`/api/lotes/${lote.id}/marwen/documentos/${doc.id}`, { responseType: 'blob' });
            const url = URL.createObjectURL(r.data);
            const a = document.createElement('a');
            a.href = url; a.download = doc.name || 'documento';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
        } catch (err) {
            setError(await mensajeDeBlob(err) || 'No se pudo descargar de beCAE.');
        } finally { setOcupado(null); }
    };

    const traerSolicitud = async () => {
        setOcupado('traer_solicitud'); setError(''); setAviso('');
        try {
            await axios.post(`/api/lotes/${lote.id}/marwen/traer-solicitud`);
            setAviso('Solicitud de beCAE guardada en la fase 1: es la que firma el S.O. con el Anexo I.');
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo traer la solicitud de beCAE.');
        } finally { setOcupado(null); }
    };

    // La oferta entra por la MISMA subida de la fase 3 (lee el importe, avanza el
    // estado y propone mandarla al S.O.): aquí solo se baja de beCAE.
    const traerOferta = async () => {
        const doc = docs.find(d => d.type === 'oferta');
        if (!doc) return;
        setOcupado('traer_oferta'); setError(''); setAviso('');
        try {
            const r = await axios.get(`/api/lotes/${lote.id}/marwen/documentos/${doc.id}`, { responseType: 'blob' });
            const file = new File([r.data], doc.name || 'Oferta de verificación.pdf', { type: 'application/pdf' });
            if (onTraerOferta) await onTraerOferta(file);
        } catch (err) {
            setError(await mensajeDeBlob(err) || 'No se pudo traer la oferta de beCAE.');
        } finally { setOcupado(null); }
    };

    const subir = async (tipo, titulo) => {
        setOcupado(tipo); setError(''); setAviso('');
        try {
            const { data: plan } = await axios.post(`/api/lotes/${lote.id}/marwen/subir`, { tipo, seco: true });
            const yaHay = tipo === 'documento_adjunto' && plan.ya_en_becae?.length;
            const soloAdjuntos = (plan.bloqueo || []).filter(b => !/^En beCAE ya hay/.test(b));
            if (soloAdjuntos.length) { setError(`No se puede subir todavía:\n${soloAdjuntos.join('\n')}`); return; }
            const lista = plan.ficheros.map(f => `• ${f.nombre} (${mb(f.bytes)})`).join('\n');
            const texto = `Se va a subir a beCAE, a la solicitud ${plan.num_solicitud}:\n\n${lista}`
                + (yaHay ? `\n\nEn beCAE ya hay: ${plan.ya_en_becae.join(', ')}. Se BORRARÁN antes de subir estos.` : '')
                + (tipo === 'oferta_firmada' ? '\n\nSubir la oferta firmada equivale a ACEPTARLA: Marwen abre el expediente.' : '');
            const ok = await showConfirm(texto, titulo, 'warning', { confirmar: '⬆ Subir a beCAE', cancelar: 'No' });
            if (!ok) return;
            const { data } = await axios.post(`/api/lotes/${lote.id}/marwen/subir`, { tipo, reemplazar: !!yaHay });
            setAviso(`Subido a beCAE: ${data.ficheros.length} fichero${data.ficheros.length === 1 ? '' : 's'}`
                + `${data.estado_solicitud ? ` · la solicitud queda «${data.estado_solicitud}»` : ''}`
                + `${data.renumerada ? ` · nº nuevo ${data.num_solicitud}` : ''}`
                + `${data.documentos_descartados?.length ? ` · descartados: ${data.documentos_descartados.join(', ')}` : ''}.`);
            if (onChanged) onChanged(data.lote);
            consultar();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo subir a beCAE.');
        } finally { setOcupado(null); }
    };

    const inexactitudes = async () => {
        setOcupado('inex'); setError(''); setAviso('');
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/marwen/inexactitudes`);
            const abiertas = (data.items || []).filter(i => i.estado === 'abierto').length;
            if (!data.registrado) {
                setAviso(`${data.num_expediente}: ${data.items?.length || 0} inexactitud(es), ${abiertas} abierta(s). ${data.motivo || ''}`);
            } else {
                const t = data.totales || {};
                setAviso(`${data.num_expediente}: ${data.items.length} inexactitud(es) en beCAE, ${abiertas} abierta(s) → `
                    + `${t.nuevas || 0} incidencia(s) nuevas${t.cerradas ? `, ${t.cerradas} cerradas por el verificador` : ''}`
                    + `${t.reabiertas ? `, ${t.reabiertas} reabiertas` : ''} (con «${data.informe}»).`
                    + `${data.sin_casar?.length ? ` Sin expediente: nº ${data.sin_casar.map(s => s.n).join(', ')}.` : ''}`);
                if (onChanged) onChanged(data.lote);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudieron consultar las inexactitudes.');
        } finally { setOcupado(null); }
    };

    const ejecutar = {
        traer_solicitud: traerSolicitud,
        traer_oferta: traerOferta,
        subir_solicitud: () => subir('solicitud_firmada', 'Subir la solicitud firmada a beCAE'),
        subir_zip: () => subir('documento_adjunto', 'Subir la documentación a beCAE'),
        subir_oferta: () => subir('oferta_firmada', 'Aceptar la oferta en beCAE'),
        inexactitudes,
    };

    return (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04] px-3 py-2.5 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-300/90 shrink-0">⚡ beCAE en vivo</span>
                {becae?.estado_solicitud && <Chip etiqueta="Solicitud" num={becae.num_solicitud} valor={becae.estado_solicitud} />}
                {becae?.estado_expediente && <Chip etiqueta="Expediente" num={becae.num_expediente} valor={becae.estado_expediente} />}
                {!becae && !cargando && !error && (
                    <span className="text-[11px] text-white/45">Sin consultar todavía.</span>
                )}
                {estado && !estado.encontrado && (
                    <span className="text-[11px] text-white/50">beCAE no tiene nada con el pedido {lote.codigo}.</span>
                )}
                <div className="flex-1" />
                {becae?.consultado_at && <span className="text-[9px] text-white/30">{fmtHora(becae.consultado_at)}</span>}
                <button type="button" onClick={consultar} disabled={cargando}
                    className="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border border-cyan-400/30 text-cyan-200 hover:bg-cyan-500/15 disabled:opacity-40">
                    {cargando ? 'Consultando…' : '↻ Consultar'}
                </button>
            </div>

            {acciones.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                    {acciones.map(a => (
                        <button key={a.id} type="button" onClick={ejecutar[a.id]} disabled={!!ocupado} title={a.ayuda}
                            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all disabled:opacity-40 ${a.tono === 'amber'
                                ? 'border-amber-400/40 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25'
                                : 'border-brand/40 bg-brand/[0.12] text-brand hover:bg-brand/20'}`}>
                            {ocupado === a.id || (a.id === 'subir_solicitud' && ocupado === 'solicitud_firmada')
                                || (a.id === 'subir_zip' && ocupado === 'documento_adjunto') || (a.id === 'subir_oferta' && ocupado === 'oferta_firmada')
                                ? 'Un momento…' : a.etiqueta}
                        </button>
                    ))}
                </div>
            )}

            {docs.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-wider text-white/35">En beCAE:</span>
                    {docs.map(d => (
                        <button key={d.id} type="button" onClick={() => descargar(d)} disabled={!!ocupado}
                            title={`Descargar de beCAE (${d.type})`}
                            className="px-2 py-0.5 rounded-md text-[10px] border border-white/10 bg-white/[0.03] text-white/65 hover:text-white hover:border-white/25 disabled:opacity-40">
                            {ocupado === `doc_${d.id}` ? '…' : '⬇'} {d.name}
                        </button>
                    ))}
                </div>
            )}

            {(estado?.avisos || []).map((t, i) => (
                <p key={i} className="text-[11px] text-amber-200/90">⚠ {t}</p>
            ))}
            {aviso && <p className="text-[11px] text-emerald-300/90 whitespace-pre-line">✓ {aviso}</p>}
            {error && <p className="text-[11px] text-red-300 whitespace-pre-line">{error}</p>}
        </div>
    );
}

// Un error de una descarga `blob` trae el JSON dentro de un Blob.
async function mensajeDeBlob(err) {
    const d = err?.response?.data;
    if (d instanceof Blob) {
        try { return JSON.parse(await d.text())?.error || null; } catch { return null; }
    }
    return d?.error || null;
}

export default BecaeEnVivo;
