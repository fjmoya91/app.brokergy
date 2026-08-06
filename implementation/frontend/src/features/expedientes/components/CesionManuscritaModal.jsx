import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

// ─── Anexo de Cesión firmado A MANO — montaje desde la app ────────────────────
// El anexo manuscrito que vale no es el escaneo suelto: es el escaneo + el DNI del
// cliente (las dos caras en UNA página) + el DNI del representante de Brokergy como
// última página. Eso ya lo montaba la página pública /firmar-anexos; aquí se replica
// para cuando el cliente devuelve el anexo por correo o en mano.
//
// La prioridad es que cueste lo menos posible:
//   · Si el expediente YA tiene el DNI del cliente, no se pide nada: soltar el
//     escaneo y montar (un solo click).
//   · Si no lo tiene, se sueltan las DOS fotos DE GOLPE en la misma zona (o se
//     eligen de una vez desde el explorador) y se colocan por orden.
// El DNI del representante lo pone el servidor: no se sube nunca a mano.

/**
 * ¿El PDF lleva firma ELECTRÓNICA incrustada? Misma comprobación que el backend
 * (`tieneFirmaElectronica` en utils/dniAnexo.js): un PDF firmado con Autofirma trae
 * `/ByteRange` + un subfiltro PKCS7/CAdES; un escaneo no tiene nada de eso, y ésa es
 * la señal de que la firma es manuscrita. Se hace en el navegador para no gastar una
 * subida entera solo en averiguarlo.
 *
 * Ante la duda responde `true` (parece firmado electrónicamente): equivocarse por
 * exceso solo sube el fichero tal cual, mientras que equivocarse por defecto anexaría
 * DNI a un documento que ya está firmado en digital.
 */
export async function esFirmaManuscrita(file) {
    if (!file) return false;
    // Una foto del anexo es manuscrita por definición.
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name || '')) return true;
    try {
        const buf = new Uint8Array(await file.arrayBuffer());
        let txt = '';
        // latin1 a mano: TextDecoder('latin1') no está en todos los navegadores.
        const CHUNK = 0x8000;
        for (let i = 0; i < buf.length; i += CHUNK) {
            txt += String.fromCharCode.apply(null, buf.subarray(i, i + CHUNK));
        }
        if (!txt.includes('/ByteRange')) return true;
        const firmado = /\/SubFilter\s*\/(adbe\.pkcs7|adbe\.x509|ETSI\.CAdES|ETSI\.RFC3161)/.test(txt)
            || /\/Type\s*\/Sig\b/.test(txt);
        return !firmado;
    } catch (e) {
        console.warn('[cesion] no se pudo inspeccionar el PDF:', e.message);
        return false;   // ante la duda, subir tal cual
    }
}

const esImagen = (f) => !!f && (f.type || '').startsWith('image/');

export function CesionManuscritaModal({ isOpen, onClose, expediente, file, dniLink, onDone, onSubirTalCual }) {
    const [caras, setCaras] = useState([]);           // [File delante, File detrás]
    const [usarDniPrevio, setUsarDniPrevio] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [drag, setDrag] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) { setCaras([]); setUsarDniPrevio(!!dniLink); setError(null); setBusy(false); }
    }, [isOpen, dniLink]);

    if (!isOpen || !file) return null;

    const addFiles = (lista) => {
        const imgs = Array.from(lista || []).filter(esImagen);
        if (!imgs.length) { setError('El DNI se anexa como FOTO (JPG o PNG).'); return; }
        setError(null);
        setUsarDniPrevio(false);
        setCaras(prev => [...prev, ...imgs].slice(0, 2));
    };

    const dniListo = usarDniPrevio ? !!dniLink : caras.length === 2;
    const faltaDni = !dniListo;

    const montar = async () => {
        setBusy(true); setError(null);
        try {
            const form = new FormData();
            form.append('cesion', file, file.name || 'anexo_cesion.pdf');
            if (!usarDniPrevio && caras.length === 2) {
                form.append('dni_frontal', caras[0], caras[0].name || 'dni_frontal.jpg');
                form.append('dni_trasero', caras[1], caras[1].name || 'dni_trasero.jpg');
            }
            const { data } = await axios.post(
                `/api/expedientes/${expediente.id}/documentos/cesion-manuscrita`,
                form,
                { headers: { 'Content-Type': 'multipart/form-data' } },
            );
            onDone?.(data);
            onClose?.();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo montar el Anexo de Cesión.');
        } finally {
            setBusy(false);
        }
    };

    const Cara = ({ i, label }) => {
        const f = caras[i];
        return (
            <div className={`flex-1 rounded-xl border p-2.5 flex items-center gap-2.5 min-w-0 ${f ? 'border-emerald-400/30 bg-emerald-400/[0.06]' : 'border-white/10 bg-white/[0.02]'}`}>
                <span className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-black ${f ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/5 text-white/25'}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{label}</p>
                    <p className={`text-[11px] truncate normal-case ${f ? 'text-white/80' : 'text-white/25'}`}>{f ? f.name : 'sin foto'}</p>
                </div>
                {f && (
                    <button type="button" onClick={() => setCaras(prev => prev.filter((_, k) => k !== i))}
                        title="Quitar" className="w-6 h-6 shrink-0 rounded-lg text-white/30 hover:text-red-400 hover:bg-white/5 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                )}
            </div>
        );
    };

    return (
        // No se cierra al clicar fuera: aquí se están soltando ficheros y un click
        // en el fondo tiraría el escaneo ya cargado. Solo X o Cancelar.
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#0F1013] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">

                <div className="px-6 py-5 border-b border-white/10 bg-brand/[0.06] flex items-center gap-3">
                    <svg className="w-6 h-6 shrink-0 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    <div className="min-w-0 flex-1">
                        <h3 className="text-base font-black uppercase tracking-tight text-white">Anexo de Cesión · firma manuscrita</h3>
                        <p className="text-[11px] text-white/40 truncate normal-case">{file.name}</p>
                    </div>
                    <button onClick={onClose} disabled={busy} title="Cancelar"
                        className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4 overflow-y-auto">
                    {/* Qué va a quedar montado, en orden */}
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 space-y-1.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">El PDF final tendrá, en este orden</p>
                        {[
                            ['1', 'El anexo que has soltado', true],
                            ['2', 'DNI del cliente (las dos caras en una página)', dniListo],
                            ['3', 'DNI del representante de Brokergy', true],
                        ].map(([n, txt, ok]) => (
                            <div key={n} className="flex items-center gap-2.5">
                                <span className={`w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[9px] font-black ${ok ? 'bg-emerald-400/20 text-emerald-300' : 'bg-amber-400/20 text-amber-300'}`}>{ok ? '✓' : '!'}</span>
                                <span className={`text-[12px] normal-case ${ok ? 'text-white/70' : 'text-amber-300/80'}`}>{txt}</span>
                            </div>
                        ))}
                    </div>

                    {/* DNI del cliente */}
                    {usarDniPrevio && dniLink ? (
                        <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.06] p-3.5 flex items-center gap-3">
                            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <p className="text-[11px] text-emerald-200 leading-snug flex-1 normal-case">
                                Ya tenemos el <span className="font-black">DNI del cliente</span> en el expediente: se anexa solo.{' '}
                                <a href={dniLink} target="_blank" rel="noopener noreferrer" className="underline decoration-1 underline-offset-2 hover:text-white">Verlo</a>
                            </p>
                            <button type="button" onClick={() => { setUsarDniPrevio(false); setCaras([]); }}
                                className="text-[9px] font-black uppercase tracking-widest text-white/35 hover:text-white shrink-0">Cambiarlo</button>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Fotos del DNI del cliente</label>
                                {dniLink && (
                                    <button type="button" onClick={() => { setUsarDniPrevio(true); setCaras([]); }}
                                        className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-white">Usar el que ya hay</button>
                                )}
                            </div>
                            <div
                                onDragOver={e => { e.preventDefault(); setDrag(true); }}
                                onDragLeave={() => setDrag(false)}
                                onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
                                onClick={() => inputRef.current?.click()}
                                className={`rounded-xl border border-dashed p-4 text-center cursor-pointer transition-all ${drag ? 'border-brand bg-brand/10' : 'border-white/15 bg-white/[0.02] hover:border-white/30'}`}
                            >
                                <p className="text-[12px] text-white/50 normal-case">
                                    Suelta aquí <span className="font-black text-white/80">las dos caras a la vez</span> (o pulsa para elegirlas)
                                </p>
                                <p className="text-[10px] text-white/25 mt-1 normal-case">Se colocan por orden: primero la delantera, luego la trasera.</p>
                            </div>
                            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
                                onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                            <div className="flex gap-2 mt-2">
                                <Cara i={0} label="Delantera" />
                                <Cara i={1} label="Trasera" />
                            </div>
                        </div>
                    )}

                    {faltaDni && (
                        <p className="text-[11px] text-amber-300/80 normal-case leading-snug">
                            Sin el DNI del cliente el anexo queda sin identificar a una de las partes. Puedes montarlo igualmente y añadirlo luego, pero el verificador lo pedirá.
                        </p>
                    )}
                    {error && <p className="text-[12px] text-red-400 normal-case">⚠️ {error}</p>}

                    {/* La detección puede fallar con firmas hechas por herramientas que
                        no sabemos leer: entonces el anexo NO lleva DNI y se sube tal cual. */}
                    {onSubirTalCual && (
                        <button type="button" onClick={onSubirTalCual} disabled={busy}
                            className="text-[10px] font-bold text-white/25 hover:text-white/60 underline decoration-1 underline-offset-4 transition-colors normal-case disabled:opacity-30">
                            ¿Está firmado electrónicamente? Súbelo tal cual, sin anexar los DNI
                        </button>
                    )}
                </div>

                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/10 flex gap-3">
                    <button onClick={onClose} disabled={busy}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                        Cancelar
                    </button>
                    <button onClick={montar} disabled={busy}
                        title={faltaDni ? 'Se montará sin el DNI del cliente' : 'Monta el anexo con los DNI y lo sube al expediente'}
                        className="flex-[2] px-4 py-2.5 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-40">
                        {busy ? 'Montando y subiendo…' : faltaDni ? 'Montar sin el DNI' : 'Montar y subir'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CesionManuscritaModal;
