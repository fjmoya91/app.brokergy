import { useMemo, useState } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Documentos del LOTE — mismo papel que el módulo de documentación del expediente,
// pero a nivel de lote: Anexo I (listado), Solicitud de verificación, Oferta de
// verificación, fichas RES y factura al S.O.
//
// La fuente de datos es `lotes.documentos_so` (que ya rellena `enviar-so`) más
// `lotes.factura_so`. Aquí solo se leen y se enlazan a Drive; la única escritura
// es la subida de la oferta de verificación.
// ─────────────────────────────────────────────────────────────────────────────

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
});

const fmtFecha = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString('es-ES'); } catch { return null; }
};

// Un documento está "cerrado" cuando tiene firma; enviado cuando salió al S.O.
const EstadoPill = ({ doc }) => {
    if (doc.signed_link) return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Firmado</span>;
    if (doc.sent_at) return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-amber-500/10 text-amber-400 border-amber-500/30">Enviado</span>;
    return <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-white/[0.04] text-white/30 border-white/10">Borrador</span>;
};

const Fila = ({ doc }) => {
    const fecha = fmtFecha(doc.signed_at) || fmtFecha(doc.sent_at) || fmtFecha(doc.uploaded_at);
    return (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-colors">
            <svg className="w-4 h-4 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-white/80 truncate">{doc.label || doc.file_name}</p>
                {fecha && <p className="text-[9px] text-white/25">{fecha}</p>}
            </div>
            <EstadoPill doc={doc} />
            <div className="flex items-center gap-1.5 shrink-0">
                {doc.draft_link && (
                    <a href={doc.draft_link} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-white/40 hover:text-white hover:bg-white/5 transition-all">
                        Borrador
                    </a>
                )}
                {doc.signed_link && (
                    <a href={doc.signed_link} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-emerald-400 hover:bg-emerald-500/10 transition-all">
                        Firmado
                    </a>
                )}
            </div>
        </div>
    );
};

export function LoteDocumentosModule({ lote, onChanged }) {
    const [subiendo, setSubiendo] = useState(false);
    const [drag, setDrag] = useState(false);
    const [error, setError] = useState('');

    const docs = useMemo(() => (Array.isArray(lote?.documentos_so) ? lote.documentos_so : []), [lote]);

    // Las fichas RES son una por expediente: se agrupan para no llenar la lista.
    const anexo = docs.find(d => d.tipo === 'anexo_i_listado');
    const solicitud = docs.find(d => d.tipo === 'solicitud_verificacion' || d.key === 'solicitud');
    const oferta = docs.find(d => d.key === 'oferta_verificacion');
    const fichas = docs.filter(d => d.tipo === 'ficha_res');

    const factura = lote?.factura_so || null;

    const subirOferta = async (file) => {
        if (!file) return;
        if (file.type !== 'application/pdf') { setError('El fichero debe ser un PDF.'); return; }
        setError('');
        setSubiendo(true);
        try {
            const base64 = await fileToBase64(file);
            await axios.post(`/api/lotes/${lote.id}/documentos/oferta`, { base64, fileName: file.name });
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo subir la oferta.');
        } finally {
            setSubiendo(false);
        }
    };

    const sinDocumentos = !anexo && !solicitud && !oferta && !fichas.length && !factura;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Documentos del lote</p>
                {lote?.drive_folder_id && (
                    <a href={`https://drive.google.com/drive/folders/${lote.drive_folder_id}`} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-black uppercase tracking-widest text-brand/70 hover:text-brand transition-colors">
                        Abrir carpeta Drive →
                    </a>
                )}
            </div>

            {sinDocumentos && (
                <p className="text-[11px] text-white/25 py-3">
                    Todavía no hay documentos. Se generan al enviar el Anexo I al Sujeto Obligado.
                </p>
            )}

            {anexo && <Fila doc={anexo} />}
            {solicitud && <Fila doc={{ ...solicitud, label: solicitud.label || 'Solicitud de verificación' }} />}
            {oferta && <Fila doc={oferta} />}

            {fichas.length > 0 && (
                <details className="group">
                    <summary className="cursor-pointer text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/50 transition-colors py-1">
                        {fichas.length} ficha{fichas.length === 1 ? '' : 's'} RES ▾
                    </summary>
                    <div className="space-y-2 mt-2">
                        {fichas.map(f => <Fila key={f.key || f.file_name} doc={f} />)}
                    </div>
                </details>
            )}

            {factura?.drive_link && (
                <Fila doc={{ label: `Factura al S.O. ${factura.numero || ''}`.trim(), draft_link: factura.drive_link, uploaded_at: factura.fecha }} />
            )}

            {/* Oferta de verificación: es el único documento que se sube a mano. */}
            {!oferta && (
                <label
                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                    onDragLeave={() => setDrag(false)}
                    onDrop={(e) => { e.preventDefault(); setDrag(false); subirOferta(e.dataTransfer.files?.[0]); }}
                    className={`flex items-center justify-center gap-2 px-3 py-4 rounded-xl border border-dashed text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all ${
                        drag ? 'border-brand bg-brand/5 text-white/80' : 'border-white/10 text-white/30 hover:border-brand/40 hover:text-white/50'
                    }`}
                >
                    {subiendo ? 'Subiendo…' : (drag ? 'Suelta el PDF aquí' : '+ Añadir oferta de verificación')}
                    <input type="file" accept="application/pdf" className="hidden" disabled={subiendo}
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; subirOferta(f); }} />
                </label>
            )}

            {error && <p className="text-[10px] text-red-400">{error}</p>}
        </div>
    );
}

export default LoteDocumentosModule;
