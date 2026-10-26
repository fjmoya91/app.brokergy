import React, { useState } from 'react';
import axios from 'axios';
import { Aviso, ZonaArchivo, Spinner } from './MarcoInstalador';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// ─────────────────────────────────────────────────────────────────────────────
// SubirRiteCard — la tarea "registra el RITE y devuélvenos el certificado",
// extraída de SubirRiteView para usarla también en /instalador/:id junto a la
// del CIFO. Misma razón que FirmarCifoCard: dos superficies que piden lo mismo
// no pueden pedirlo distinto.
//
// `pideMemoria` es false cuando NUNCA generamos una Memoria RITE para este
// expediente: pedirle "la memoria que os enviamos, firmada" a quien no ha
// recibido ninguna es pedirle un documento que no existe.
//
// `demo`: la prueba sin API (/instalador/demo, /subir-rite/demo): no sube nada.
// Se pinta con el CSS `.in-` de MarcoInstalador (estilo «carta de pago»).
// ─────────────────────────────────────────────────────────────────────────────
export function SubirRiteCard({ expedienteId, info, onDone, pideMemoria = true, demo = false }) {
    const [memoria, setMemoria] = useState(null);
    const [certificado, setCertificado] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const pickPdf = (f, setter) => {
        if (!f) return;
        if (f.type !== 'application/pdf') { setUploadError('Solo se admiten archivos PDF.'); return; }
        setUploadError(null);
        setter(f);
    };

    const handleSubmit = async () => {
        if (!memoria && !certificado) return;
        setUploading(true); setUploadError(null);
        try {
            if (demo) {
                await new Promise(r => setTimeout(r, 700));
            } else {
                const form = new FormData();
                if (memoria) form.append('memoria', memoria);
                if (certificado) form.append('certificado', certificado);
                await axios.post(`${API_URL}/rite-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            }
            setMemoria(null); setCertificado(null);
            if (onDone) onDone();
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Error al subir los archivos. Inténtalo de nuevo.');
        } finally { setUploading(false); }
    };

    const yaSubido = info?.memoria_subida || info?.certificado_subido;

    return (
        <div>
            <p className="in-txt" style={{ marginTop: 16 }}>
                Una vez <b>tramitado el certificado</b>
                {pideMemoria ? <> y <b>firmada la memoria</b></> : null}, súbelo aquí. Se guarda directamente en el expediente.
            </p>

            {yaSubido && (
                <div className="in-mt">
                    <Aviso tono="ok">
                        <p>Ya hay documentación subida en este expediente. Si subes otra, <b>reemplaza</b> a la anterior (no se duplica).</p>
                    </Aviso>
                </div>
            )}

            <div className="in-subidas">
                <ZonaArchivo file={certificado} onPick={f => pickPdf(f, setCertificado)} alreadyUploaded={info?.certificado_subido}
                    title={pideMemoria ? '1 · Certificado RITE tramitado' : 'Certificado RITE tramitado'}
                    desc="El certificado descargado de la plataforma de tramitación (PDF)." vacio="Elegir el certificado" />
                {pideMemoria && (
                    <ZonaArchivo file={memoria} onPick={f => pickPdf(f, setMemoria)} alreadyUploaded={info?.memoria_subida}
                        title="2 · Memoria técnica firmada"
                        desc="La memoria que os enviamos, ya firmada por vosotros (PDF)." vacio="Elegir la memoria" />
                )}
            </div>

            {uploadError && <div className="in-mt"><Aviso><p>{uploadError}</p></Aviso></div>}

            <div className="in-btns">
                <button className="in-btn in-btn-pri" onClick={handleSubmit} disabled={(!memoria && !certificado) || uploading}>
                    {uploading ? <><Spinner /> Subiendo…</> : 'Subir documentación'}
                </button>
            </div>
            <p className="in-nota">Solo PDF{pideMemoria ? ' · puedes subir uno o los dos' : ''}</p>
        </div>
    );
}

export default SubirRiteCard;
