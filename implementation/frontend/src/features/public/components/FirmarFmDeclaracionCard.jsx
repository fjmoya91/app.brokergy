import React, { useState } from 'react';
import axios from 'axios';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import { cajaFirmaFmPt } from '../../expedientes/logic/signBoxes';
import { Aviso, ZonaArchivo, Spinner } from './MarcoInstalador';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// ─────────────────────────────────────────────────────────────────────────────
// FirmarFmDeclaracionCard — la tarea "firma la declaración responsable de la
// TIPOLOGÍA" (punto 1 de la ficha del factor multiplicador, BOE-A-2026-23367),
// en la página del instalador (/instalador/:id), junto al CIFO.
//
// La misma superficie que FirmarCifoCard: Autofirma aquí mismo (recomendado) o
// subirla ya firmada. El borrador lo genera la app (logic/documentosFm.js, desde
// la pestaña «Vía FM») y lo sirve `GET /instalador/:id/fm-declaracion/pdf`; el
// firmado va a su apartado del gestor (slot FM_DECL_INSTALADOR).
//
// Una SOCIEDAD firma con el certificado de REPRESENTANTE (regla 191, como el
// CIFO): se le dice antes de abrir Autofirma.
//
// Se pinta con el CSS `.in-` de MarcoInstalador (estilo «carta de pago»).
// ─────────────────────────────────────────────────────────────────────────────
export function FirmarFmDeclaracionCard({ expedienteId, info, onDone, demo = false }) {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signOpen, setSignOpen] = useState(false);
    const [preparingSign, setPreparingSign] = useState(false);

    const handleFile = (f) => {
        if (!f) return;
        const ok = f.type === 'application/pdf' || (f.type || '').startsWith('image/');
        if (!ok) { setUploadError('Solo se admiten archivos PDF o una foto del documento firmado.'); return; }
        setUploadError(null);
        setFile(f);
    };

    const subir = async (blob, nombre) => {
        if (demo) { await new Promise(r => setTimeout(r, 700)); return; }
        const form = new FormData();
        form.append('documento', blob, nombre);
        await axios.post(`${API_URL}/instalador/${expedienteId}/fm-declaracion`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
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

    const handleSignNow = async () => {
        if (demo) { setUploadError('En la prueba no se abre Autofirma: aquí se abriría la declaración para firmarla con tu certificado.'); return; }
        setUploadError(null); setPreparingSign(true);
        try {
            const { data } = await axios.get(`${API_URL}/instalador/${expedienteId}/fm-declaracion/pdf`);
            if (!data?.pdf) throw new Error('No se recibió el documento');
            setSignPdfB64(data.pdf);
            setSignOpen(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'No se pudo cargar la declaración para firmar.');
        } finally { setPreparingSign(false); }
    };

    const handleSigned = async (signedB64) => {
        setUploading(true); setUploadError(null);
        try {
            const bytes = Uint8Array.from(atob(signedB64), c => c.charCodeAt(0));
            await subir(new Blob([bytes], { type: 'application/pdf' }), `${info?.numero_expediente || 'Declaracion'} - Declaracion tipologia_fdo.pdf`);
            setSignOpen(false);
            setSignPdfB64(null);
            if (onDone) onDone();
        } catch (e) {
            setUploadError(e.response?.data?.error || 'El documento se firmó pero no se pudo enviar. Inténtalo de nuevo.');
        } finally { setUploading(false); }
    };

    return (
        <div>
            <p className="in-txt" style={{ marginTop: 16 }}>
                Es la <b>declaración responsable de la tipología</b> de la vivienda que pide la ficha del factor multiplicador: la vivienda, el equipo y tu empresa ya van rellenos. Léela antes de firmar.
                {' '}Si tu empresa es una <b>sociedad</b>, fírmala con el <b>certificado de representante</b>, como el CIFO.
            </p>

            <p className="in-eyebrow" style={{ marginTop: 18 }}>Con tu certificado <span className="in-chip">Recomendado</span></p>
            <div className="in-btns">
                <button className="in-btn in-btn-pri" onClick={handleSignNow} disabled={preparingSign || uploading}>
                    {preparingSign ? <><Spinner /> Cargando el documento…</> : uploading && signOpen ? <><Spinner /> Enviando…</> : 'Firmar ahora con Autofirma'}
                </button>
            </div>

            <div className="in-o">o súbela ya firmada</div>

            <ZonaArchivo file={file} onPick={handleFile} accept="application/pdf,image/*" vacio="Elegir la declaración firmada"
                desc="Si la firmaste con otra herramienta o en papel (PDF o foto nítida)." />

            {uploadError && <div className="in-mt"><Aviso><p>{uploadError}</p></Aviso></div>}

            <div className="in-btns">
                <button className="in-btn in-btn-sec" onClick={handleSubmit} disabled={!file || uploading}>
                    {uploading && !signOpen ? <><Spinner /> Subiendo…</> : 'Subir la declaración firmada'}
                </button>
            </div>

            {/* El instalador firma con SU certificado: sin rúbrica de Brokergy. El
                recuadro es FIJO: el de las hojas de la vía FM (FIRMA_FM). */}
            {signOpen && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar la declaración de la tipología · ${info?.numero_expediente || ''}`}
                    rubricImageUrl={null}
                    signatureAnchor={['fdo.:^above', 'fdo.^above']}
                    fixedBox={cajaFirmaFmPt(1)}
                    onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                    onSigned={handleSigned}
                />
            )}
        </div>
    );
}

export default FirmarFmDeclaracionCard;
