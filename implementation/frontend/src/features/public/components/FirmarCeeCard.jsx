import React, { useState, useRef } from 'react';
import axios from 'axios';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import { CEE_SIGN_ANCHOR } from '../../expedientes/logic/signBoxes';

// RELATIVO también en desarrollo, como FirmaMovilView y FirmarAnexosView: esta
// página la abre el CERTIFICADOR desde su ordenador con un enlace nuestro, así
// que apuntar a `localhost:3000` solo sirve si el backend corre justo ahí — y
// deja de poder probarse con un segundo backend en otro puerto. Vite proxea /api.
const API_URL = '/api/public';

// ─────────────────────────────────────────────────────────────────────────────
// FirmarCeeCard — el PASO 1 de /presentar-cee: firmar el certificado.
//
// Gemela de FirmarCifoCard (la del instalador con el CIFO), y a propósito: al
// técnico le llegan las dos y no puede tener que aprender dos gestos. Lo que
// cambia es de dónde sale el documento y dónde cae la firma.
//
// REGLA — el recuadro se ancla AL TEXTO, no a coordenadas. El PDF lo genera CE3X
// y su rótulo «Firma del técnico certificador» se mueve según cuántas líneas
// ocupe el párrafo de encima: medido, 10 pt entre dos certificados reales. Una
// caja fija como la del CIFO —que sí vale allí, porque el documento lo hacemos
// nosotros— dejaría la rúbrica pisando el rótulo en unos y flotando en otros.
// Ver CEE_SIGN_ANCHOR en signBoxes.js.
//
// REGLA — el LOGO de Brokergy solo cuando firma Brokergy. En la firma de un
// técnico externo nuestra marca daría a entender que firma Brokergy, y no es así.
// Lo decide el backend (`certificador.conLogo`), que lo resuelve por el CIF de la
// empresa y no por el nombre de la persona.
//
// Los TRES estados que se dan de verdad:
//   · sin_pdf    → no hay documento: se le pide el que acaba de generar en CE3X.
//   · sin_firmar → está pero sin firma: se le ofrece firmarlo aquí.
//   · firmado    → ya está; se enseña con qué fecha y si cuadra con el certificado.
// ─────────────────────────────────────────────────────────────────────────────
export function FirmarCeeCard({ expedienteId, token, fase, info, onDone }) {
    const [file, setFile] = useState(null);
    const [subiendo, setSubiendo] = useState(false);
    const [error, setError] = useState(null);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signOpen, setSignOpen] = useState(false);
    const [preparando, setPreparando] = useState(false);
    const [encima, setEncima] = useState(false);
    const inputRef = useRef();

    const q = { token, phase: fase };

    const subir = async (blob, nombre) => {
        const form = new FormData();
        form.append('file', blob, nombre);
        const { data } = await axios.post(`${API_URL}/cee-firma/${expedienteId}`, form, {
            params: q, headers: { 'Content-Type': 'multipart/form-data' },
        });
        return data;
    };

    const handleFile = (f) => {
        if (!f) return;
        if (f.type !== 'application/pdf') { setError('El certificado tiene que ser un PDF.'); return; }
        setError(null);
        setFile(f);
    };

    // Sube tal cual lo que haya soltado. Si ya viene firmado se acepta igual —no
    // se le obliga a cambiar de costumbre— y el backend le comprueba la fecha.
    const enviar = async () => {
        if (!file) return;
        setSubiendo(true); setError(null);
        try {
            const r = await subir(file, file.name);
            setFile(null);
            if (onDone) onDone(r?.comprobacion || null);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo subir el certificado.');
        } finally { setSubiendo(false); }
    };

    // Firmar aquí mismo: se descarga el PDF del expediente, se firma en el
    // navegador con Autofirma y el firmado vuelve por el mismo sitio. El técnico
    // no descarga ni vuelve a subir nada, y el recuadro ya está colocado.
    const firmarAhora = async () => {
        setError(null); setPreparando(true);
        try {
            const { data } = await axios.get(`${API_URL}/cee-firma/${expedienteId}/pdf`, { params: q });
            if (!data?.pdf) throw new Error('No se recibió el documento');
            setSignPdfB64(data.pdf);
            setSignOpen(true);
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo cargar el certificado para firmar.');
        } finally { setPreparando(false); }
    };

    const alFirmar = async (signedB64) => {
        setSubiendo(true); setError(null);
        try {
            const bytes = Uint8Array.from(atob(signedB64), c => c.charCodeAt(0));
            const r = await subir(new Blob([bytes], { type: 'application/pdf' }),
                `${info?.numeroExpediente || 'CEE'}_fdo.pdf`);
            setSignOpen(false);
            setSignPdfB64(null);
            if (onDone) onDone(r?.comprobacion || null);
        } catch (e) {
            setError(e.response?.data?.error || 'Se firmó, pero no se pudo guardar. Inténtalo otra vez.');
        } finally { setSubiendo(false); }
    };

    const c = info?.comprobacion;
    const yaFirmado = info?.estado === 'firmado';
    const hayPdf = info?.estado !== 'sin_pdf';

    return (
        <div className="space-y-3">
            {/* Ya firmado: lo que hace falta saber es CON QUÉ FECHA y si cuadra */}
            {yaFirmado && (
                <div className={`rounded-xl border px-4 py-3 ${
                    c?.coincide === false ? 'border-amber-500/40 bg-amber-500/[0.06]' : 'border-emerald-500/30 bg-emerald-500/[0.06]'
                }`}>
                    <div className={`text-[11px] font-black uppercase tracking-widest ${
                        c?.coincide === false ? 'text-amber-300' : 'text-emerald-400'
                    }`}>
                        {c?.coincide === false ? '⚠ Firmado, pero revisa la fecha' : '✓ Certificado firmado'}
                    </div>
                    <div className="text-[12px] text-white/70 normal-case mt-1 leading-snug">
                        {c?.firmantes?.[0]?.nombre && <>Lo firma <b className="text-white/90">{c.firmantes[0].nombre}</b>. </>}
                        {c?.fechaFirma && <>Fecha de la firma: <b className="text-white/90">{c.fechaFirma}</b>.</>}
                    </div>
                    {(c?.avisos || []).map((a, i) => (
                        <div key={i} className="text-[11px] text-amber-300/90 normal-case leading-snug mt-1.5">{a}</div>
                    ))}
                </div>
            )}

            {/* La fecha con la que hay que firmar. Se dice ANTES, que es cuando
                sirve de algo: Autofirma sella con el reloj del ordenador. */}
            {!yaFirmado && info?.fechaCertificado && (
                <div className="rounded-xl border border-brand/25 bg-brand/[0.05] px-4 py-3">
                    <div className="text-[10px] font-black text-brand uppercase tracking-widest">Fecha de firma</div>
                    <div className="text-[12px] text-white/70 normal-case mt-1 leading-snug">
                        Firma con fecha <b className="text-white">{fechaEs(info.fechaCertificado)}</b>, la misma con la
                        que se emitió el certificado. Autofirma usa la hora de tu ordenador, así que compruébala antes.
                    </div>
                </div>
            )}

            {error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[12px] text-red-300 normal-case leading-snug">
                    {error}
                </div>
            )}

            {/* Firmar el que ya está en el expediente */}
            {hayPdf && !yaFirmado && (
                <button type="button" onClick={firmarAhora} disabled={preparando || subiendo}
                        className="w-full px-4 py-3.5 rounded-xl border border-brand/50 bg-brand/15 text-[11px] font-black uppercase tracking-widest text-brand hover:bg-brand hover:text-black transition-colors disabled:opacity-40">
                    {preparando ? 'Abriendo el certificado…' : '🖊️ Firmar el certificado con Autofirma'}
                </button>
            )}

            {/* Sin documento, o para reemplazarlo: que lo suelte */}
            {(!hayPdf || yaFirmado) && (
                <div onDragOver={e => { e.preventDefault(); setEncima(true); }}
                     onDragLeave={() => setEncima(false)}
                     onDrop={e => { e.preventDefault(); setEncima(false); handleFile(e.dataTransfer?.files?.[0]); }}
                     className={`rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors ${
                         encima ? 'border-brand/60 bg-brand/10' : 'border-white/[0.14] bg-white/[0.02]'
                     }`}>
                    <p className="text-[12px] text-white/60 normal-case leading-snug">
                        {hayPdf
                            ? 'Si has vuelto a generar el certificado, suéltalo aquí para sustituirlo.'
                            : 'Suelta aquí el PDF del certificado que has generado en CE3X.'}
                        <span className="block text-[11px] text-white/35 mt-1">
                            Si lo subes sin firmar, podrás firmarlo desde aquí.
                        </span>
                    </p>
                    <input ref={inputRef} type="file" accept=".pdf" className="hidden"
                           onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
                    <button type="button" onClick={() => inputRef.current?.click()} disabled={subiendo}
                            className="mt-3 px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 text-[10px] font-black uppercase tracking-widest text-white/70 hover:border-brand/50 hover:text-brand transition-colors disabled:opacity-40">
                        Elegir el PDF
                    </button>
                    {file && (
                        <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                            <span className="text-[11px] text-white/70 normal-case break-all">{file.name}</span>
                            <button type="button" onClick={enviar} disabled={subiendo}
                                    className="px-3 py-2 rounded-lg bg-brand text-black text-[10px] font-black uppercase tracking-widest hover:bg-brand/80 transition-colors disabled:opacity-40">
                                {subiendo ? 'Subiendo…' : 'Subir'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {signOpen && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar ${info?.faseLabel || 'el certificado'}`}
                    signatureAnchor={CEE_SIGN_ANCHOR}
                    // Sin logo salvo que firme Brokergy: en la firma de un técnico
                    // externo nuestra marca diría que firma Brokergy.
                    rubricImageUrl={info?.certificador?.conLogo ? undefined : null}
                    onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                    onSigned={alFirmar}
                />
            )}
        </div>
    );
}

const fechaEs = (iso) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))) return iso || '';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

export default FirmarCeeCard;
