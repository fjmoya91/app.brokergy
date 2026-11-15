import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { solicitudGeneradaPorApp } from '../logic/loteProceso';
import { accionesBecae, ESTADOS_LOTE_SIN_BECAE } from '../logic/becae';
import { Ico } from '../../facturacion/estilo';

// Descargar (flecha a la bandeja) y la etiqueta sin el símbolo de delante: en la ficha
// en crema el icono lo pone el botón, no un carácter (⬇ ⬆ ⌕ salen distintos en cada equipo).
const ICO_BAJAR = 'M12 4v11m-5-5 5 5 5-5M5 20h14';
const ICO_SUBIR = 'M12 20V9m-5 5 5-5 5 5M5 4h14';
const sinSimbolo = (t) => String(t || '').replace(/^[^\p{L}\p{N}]+/u, '');

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
//
// En el papel crema de la ficha del lote (`.lt-becae`, loteFichaEstilo.js): los
// estados de beCAE con las fichas de color de la casa, nunca en rojo.
// ─────────────────────────────────────────────────────────────────────────────

const fmtHora = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};
const mb = (b) => `${(b / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;

const TONO_ESTADO = (e) => {
    const s = String(e || '').toLowerCase();
    if (/rechaz/.test(s)) return 'fx-chip-vence';
    if (/resoluci|hdted|pendiente doc|ofertado/.test(s)) return 'fx-chip-ambar';
    if (/finalizado|aceptad/.test(s)) return 'fx-chip-ok';
    return 'fx-chip-pizarra';
};

// `fx-chip-*` da el color; `lt-becae-chip` le quita las mayúsculas y le da aire.
const Chip = ({ etiqueta, valor, num }) => (
    <span className={`fx-chip lt-becae-chip ${TONO_ESTADO(valor)}`} style={{ textTransform: 'none', letterSpacing: 0, height: 'auto' }}>
        <i>{etiqueta}</i>
        {num && <span>{num}</span>}
        {valor || '—'}
    </span>
);

// `onSolicitudTraida`: en cuanto la solicitud del verificador entra en el lote (sola al
// consultar o con el botón), la fase propone mandarla al S.O. o revisarla antes.
export function BecaeEnVivo({ lote, p, onChanged, onTraerOferta, onSolicitudTraida }) {
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
            if (data?.solicitud_traida?.archivada) {
                setAviso('Traída de beCAE la solicitud del verificador: ya está en la fase 1, lista para mandarla al S.O. con el Anexo I y las fichas.');
            }
            // Lo sellado (nº de expediente, renumeración, la solicitud traída) cambia el lote de detrás.
            if (data?.lote && onChanged) onChanged(data.lote);
            if (data?.solicitud_traida?.archivada && onSolicitudTraida) onSolicitudTraida();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo consultar beCAE.');
        } finally {
            setCargando(false);
        }
    }, [lote?.id, onChanged, onSolicitudTraida]);

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
            const { data } = await axios.post(`/api/lotes/${lote.id}/marwen/traer-solicitud`);
            setAviso('Solicitud de beCAE guardada en la fase 1: es la que firma el S.O. con el Anexo I.');
            if (onChanged) onChanged(data?.lote);
            if (onSolicitudTraida) onSolicitudTraida();
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
        <section className="lt-becae">
            <div className="lt-becae-cab">
                <span className="fx-eyebrow">beCAE en vivo</span>
                {becae?.estado_solicitud && <Chip etiqueta="Solicitud" num={becae.num_solicitud} valor={becae.estado_solicitud} />}
                {becae?.estado_expediente && <Chip etiqueta="Expediente" num={becae.num_expediente} valor={becae.estado_expediente} />}
                {!becae && !cargando && !error && <span className="lt-ayuda">Sin consultar todavía.</span>}
                {estado && !estado.encontrado && <span className="lt-ayuda">beCAE no tiene nada con el pedido {lote.codigo}.</span>}
                <div style={{ flex: 1 }} />
                {becae?.consultado_at && <span className="lt-ayuda">{fmtHora(becae.consultado_at)}</span>}
                <button type="button" onClick={consultar} disabled={cargando} className="fx-btn fx-btn-sec fx-btn-peq">
                    <Ico n="reintentar" size={16} className={cargando ? 'fx-spin' : ''} />{cargando ? 'Consultando…' : 'Consultar'}
                </button>
            </div>

            {acciones.length > 0 && (
                <div className="lt-tareas">
                    {acciones.map((a, i) => (
                        <button key={a.id} type="button" onClick={ejecutar[a.id]} disabled={!!ocupado} title={a.ayuda}
                            className={`fx-btn ${i === 0 ? 'fx-btn-pri' : 'fx-btn-sec'} fx-btn-peq`}>
                            {a.id.startsWith('traer') ? <Ico d={ICO_BAJAR} size={16} /> : a.id.startsWith('subir') ? <Ico d={ICO_SUBIR} size={16} /> : <Ico n="leer" size={16} />}
                            {ocupado === a.id || (a.id === 'subir_solicitud' && ocupado === 'solicitud_firmada')
                                || (a.id === 'subir_zip' && ocupado === 'documento_adjunto') || (a.id === 'subir_oferta' && ocupado === 'oferta_firmada')
                                ? 'Un momento…' : sinSimbolo(a.etiqueta)}
                        </button>
                    ))}
                </div>
            )}

            {docs.length > 0 && (
                <div className="lt-becae-docs">
                    <span>En beCAE</span>
                    {docs.map(d => (
                        <button key={d.id} type="button" onClick={() => descargar(d)} disabled={!!ocupado}
                            title={`Descargar de beCAE (${d.type})`} className="fx-btn fx-btn-sec fx-btn-peq">
                            <Ico d={ICO_BAJAR} size={16} />{ocupado === `doc_${d.id}` ? '…' : d.name}
                        </button>
                    ))}
                </div>
            )}

            {(estado?.avisos || []).map((t, i) => (
                <p key={i} className="lt-msg lt-msg-ambar">{t}</p>
            ))}
            {aviso && <p className="lt-msg lt-msg-ok">{aviso}</p>}
            {error && <p className="lt-msg lt-msg-ambar" role="alert">{error}</p>}
        </section>
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
