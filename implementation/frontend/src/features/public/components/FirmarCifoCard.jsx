import React, { useState } from 'react';
import axios from 'axios';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import { SIGN_BOXES } from '../../expedientes/logic/signBoxes';
import { Aviso, ZonaArchivo, Spinner } from './MarcoInstalador';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// ─────────────────────────────────────────────────────────────────────────────
// FirmarCifoCard — la tarea "firma el Certificado CIFO", extraída de
// SubirCifoView para poder usarla también en la página unificada del instalador
// (/instalador/:id), donde convive con la del RITE.
//
// Se saca a un componente y no se copia porque las dos superficies tienen que
// ofrecer EXACTAMENTE lo mismo: si la de firmar bloqueara un CIFO rechazado y la
// otra no, el instalador volvería a firmar el documento con el error.
//
// Props:
//   expedienteId · info: { numero_expediente, bloqueado, rechazo }
//   onDone(): se llama cuando el firmado ya está en nuestro poder.
//   demo: la prueba sin API (/instalador/demo, /subir-cifo/demo): no firma ni sube.
//
// Se pinta con el CSS `.in-` de MarcoInstalador (estilo «carta de pago»): solo
// vive dentro de esas páginas.
// ─────────────────────────────────────────────────────────────────────────────
export function FirmarCifoCard({ expedienteId, info, onDone, demo = false }) {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signOpen, setSignOpen] = useState(false);
    const [preparingSign, setPreparingSign] = useState(false);

    const handleFile = (f) => {
        if (!f) return;
        if (f.type !== 'application/pdf') { setUploadError('Solo se admiten archivos PDF.'); return; }
        setUploadError(null);
        setFile(f);
    };

    const subir = async (blob, nombre) => {
        if (demo) { await new Promise(r => setTimeout(r, 700)); return; }
        const form = new FormData();
        form.append('cifo', blob, nombre);
        await axios.post(`${API_URL}/cifo-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    };

    const handleSubmit = async () => {
        if (!file) return;
        setUploading(true); setUploadError(null);
        try {
            await subir(file, file.name);
            setFile(null);
            if (onDone) onDone();
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Error al subir el archivo. Inténtalo de nuevo.');
        } finally { setUploading(false); }
    };

    // Firma directa con Autofirma: se descarga el borrador, se firma en el
    // navegador y el firmado sube al mismo endpoint. El instalador no descarga
    // ni vuelve a subir nada.
    const handleSignNow = async () => {
        if (demo) { setUploadError('En la prueba no se abre Autofirma: aquí se abriría el CIFO para firmarlo con tu certificado.'); return; }
        setUploadError(null); setPreparingSign(true);
        try {
            const { data } = await axios.get(`${API_URL}/cifo-upload/${expedienteId}/pdf`);
            if (!data?.pdf) throw new Error('No se recibió el documento');
            setSignPdfB64(data.pdf);
            setSignOpen(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'No se pudo cargar el CIFO para firmar.');
        } finally { setPreparingSign(false); }
    };

    const handleSigned = async (signedB64) => {
        setUploading(true); setUploadError(null);
        try {
            const bytes = Uint8Array.from(atob(signedB64), c => c.charCodeAt(0));
            await subir(new Blob([bytes], { type: 'application/pdf' }), `${info?.numero_expediente || 'CIFO'}_fdo.pdf`);
            setSignOpen(false);
            setSignPdfB64(null);
            if (onDone) onDone();
        } catch (e) {
            setUploadError(e.response?.data?.error || 'El documento se firmó pero no se pudo enviar. Inténtalo de nuevo.');
        } finally { setUploading(false); }
    };

    // Rechazado y todavía sin corregir: no se ofrece firmar, sería volver a
    // firmar el mismo error (regla 24).
    if (info?.bloqueado) {
        return (
            <Aviso titulo="Lo estamos corrigiendo">
                <p>
                    El <b>Certificado CIFO</b> del expediente <b>{info.numero_expediente}</b> tenía un error y lo estamos corrigiendo.
                    {info.rechazo?.motivo ? <> Motivo: {info.rechazo.motivo}.</> : null}
                </p>
                <p>Te enviaremos la versión corregida para que la firmes. No hace falta que hagas nada mientras tanto.</p>
            </Aviso>
        );
    }

    return (
        <div>
            {/* Ya nos firmó una versión y hay que firmar otra. Se dice ARRIBA y con
                el porqué: sin eso, quien ya firmó da por hecho que el enlace se ha
                quedado colgado y no vuelve a firmar. Y se avisa de que el documento
                que sale aquí es el bueno — el del correo anterior ya no vale. */}
            {info?.refirma && (
                <div style={{ margin: '16px 0 4px' }}>
                    <Aviso titulo="Hay que volver a firmarlo">
                        <p>Ya nos firmaste una versión anterior de este certificado, pero el documento se ha actualizado. El que se firma desde aquí es el <b>bueno</b>: la versión anterior queda anulada.</p>
                    </Aviso>
                </div>
            )}

            {/* OPCIÓN RECOMENDADA: firmar en el navegador con Autofirma */}
            <p className="in-eyebrow" style={{ marginTop: 18 }}>Con tu certificado <span className="in-chip">Recomendado</span></p>
            <p className="in-txt">
                Firma el CIFO <b>aquí mismo</b> con tu certificado electrónico, mediante <b>Autofirma</b>: sin descargar ni volver a subir nada. Necesitas tener Autofirma instalado.
            </p>
            <div className="in-btns">
                <button className="in-btn in-btn-pri" onClick={handleSignNow} disabled={preparingSign || uploading}>
                    {preparingSign ? <><Spinner /> Cargando el documento…</> : uploading && signOpen ? <><Spinner /> Enviando…</> : 'Firmar ahora con Autofirma'}
                </button>
            </div>

            <div className="in-o">o súbelo ya firmado</div>

            <ZonaArchivo file={file} onPick={handleFile} vacio="Elegir el CIFO firmado"
                desc="Si ya lo firmaste con otra herramienta. Se guarda directamente en el expediente." />

            {uploadError && <div className="in-mt"><Aviso><p>{uploadError}</p></Aviso></div>}

            <div className="in-btns">
                <button className="in-btn in-btn-sec" onClick={handleSubmit} disabled={!file || uploading}>
                    {uploading && !signOpen ? <><Spinner /> Subiendo…</> : 'Subir el CIFO firmado'}
                </button>
            </div>
            <p className="in-nota">Solo PDF · máx. 20 MB</p>

            {/* El instalador firma con SU certificado: sin la rúbrica de Brokergy.
                El recuadro es FIJO (SIGN_BOXES.cifo_res060). */}
            {signOpen && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar Certificado CIFO · ${info?.numero_expediente || ''}`}
                    rubricImageUrl={null}
                    initialPage={2}
                    signatureAnchor={['espacio reservado para firma']}
                    fixedBox={SIGN_BOXES.cifo_res060}
                    onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                    onSigned={handleSigned}
                />
            )}
        </div>
    );
}

export default FirmarCifoCard;
