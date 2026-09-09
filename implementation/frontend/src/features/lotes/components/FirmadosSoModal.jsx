import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import { SIGN_BOXES } from '../../expedientes/logic/signBoxes';

// ─────────────────────────────────────────────────────────────────────────────
// LOS FIRMADOS DEL SUJETO OBLIGADO — se sueltan los seis y la app los coloca.
//
// El S.O. devuelve el Anexo I y las fichas firmados con su certificado y con el
// MISMO nombre con el que se los mandamos. Antes había que abrir cada PDF para
// ver de qué expediente era, renombrarlo y subirlo a su slot, seis veces.
//
// Dos tiempos, y el primero NO escribe: se sueltan, se ve qué ha entendido la app
// de cada fichero (a qué documento va y quién lo ha firmado) y solo entonces se
// registra. Es el mismo criterio que el resto de lecturas de la app: se PROPONE y
// aplica una persona — aquí, además, porque de esto depende qué PDF acaba dentro
// del ZIP que se presenta.
//
// Las firmas las lee el backend del propio PDF (`utils/firmasPdf.js`): ni OCR ni
// modelos de IA, así que abrir esta pantalla no cuesta nada.
// ─────────────────────────────────────────────────────────────────────────────

const ICONO = {
    listo: '✅', revisar: '⚠️', sin_firma: '⛔', no_pdf: '⛔',
    sin_identificar: '❓', duplicado: '❓', error: '⛔',
};

// Dónde firma BROKERGY cada documento que vuelve del S.O. sin su firma. Es la
// MISMA caja que usa el popup del Anexo I al firmarlo antes de enviarlo
// (`SIGN_BOXES`, fuente única con Autofirma): con una copia de las coordenadas
// aquí, la firma acabaría en otro sitio del mismo documento el día que cambie la
// plantilla. Solo el Anexo I lleva firma nuestra — las fichas las firma el S.O.
const CAJA_BROKERGY = {
    anexo_i: SIGN_BOXES.anexo_i_listado_proveedor,
};

const leerBase64 = (file) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = rej;
    r.readAsDataURL(file);
});

// El PDF firmado vuelve de Autofirma en base64 y tiene que seguir llamándose
// IGUAL: el nombre es lo que identifica a qué documento del lote va.
const comoFichero = (base64, nombre) => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], nombre, { type: 'application/pdf' });
};

const TONO = {
    listo: 'border-emerald-500/25 bg-emerald-500/[0.05]',
    revisar: 'border-amber-500/25 bg-amber-500/[0.05]',
    sin_firma: 'border-red-500/25 bg-red-500/[0.05]',
    no_pdf: 'border-red-500/25 bg-red-500/[0.05]',
    error: 'border-red-500/25 bg-red-500/[0.05]',
    sin_identificar: 'border-white/10 bg-white/[0.02]',
    duplicado: 'border-white/10 bg-white/[0.02]',
};

export function FirmadosSoModal({ lote, ficheros, onClose, onChanged }) {
    const [fase, setFase] = useState('analizando');   // analizando | revision | aplicando | hecho
    const [informe, setInforme] = useState(null);
    const [error, setError] = useState('');
    const [asignar, setAsignar] = useState({});       // fichero → docKey (lo decide una persona)
    const [forzar, setForzar] = useState({});         // fichero → bool
    // Los ficheros son ESTADO y no solo la prop: si falta la firma de Brokergy se
    // firma aquí mismo y el PDF firmado SUSTITUYE al que se soltó. Lo que se
    // registra después es el firmado, no el que llegó por email.
    const [archivos, setArchivos] = useState(() => [...ficheros]);
    const [firmando, setFirmando] = useState(null);   // { nombre, base64 }
    const lanzado = useRef(false);

    const enviar = async ({ dryRun, archivosAhora = archivos, asignarAhora = asignar }) => {
        const fd = new FormData();
        for (const f of archivosAhora) fd.append('files', f, f.name);
        fd.append('dryRun', String(dryRun));
        fd.append('asignar', JSON.stringify(asignarAhora));
        fd.append('forzar', JSON.stringify(Object.keys(forzar).filter(k => forzar[k])));
        const { data } = await axios.post(`/api/lotes/${lote.id}/firmados`, fd);
        return data;
    };

    // Análisis al abrir. En StrictMode el efecto se ejecuta dos veces: el `ref`
    // evita subir los ficheros por duplicado.
    useEffect(() => {
        if (lanzado.current) return;
        lanzado.current = true;
        (async () => {
            try {
                setInforme(await enviar({ dryRun: true }));
                setFase('revision');
            } catch (e) {
                setError(e.response?.data?.error || 'No se pudieron leer los ficheros.');
                setFase('revision');
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Se vuelve a analizar por dos motivos, y los dos cambian el veredicto:
    //   · una persona asigna a mano un fichero que la app no supo identificar
    //     (las firmas que se esperan dependen del destino: el Anexo I pide dos);
    //   · se acaba de firmar uno, y ahora sí lleva la firma que faltaba.
    const reanalizar = async ({ nuevoAsignar = asignar, nuevosArchivos = archivos } = {}) => {
        setAsignar(nuevoAsignar);
        setArchivos(nuevosArchivos);
        setFase('analizando');
        setError('');
        try {
            setInforme(await enviar({ dryRun: true, archivosAhora: nuevosArchivos, asignarAhora: nuevoAsignar }));
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo volver a analizar.');
        } finally { setFase('revision'); }
    };

    // ── Firmar aquí mismo lo que falta por firmar por nuestra parte ───────────
    // Si el S.O. devuelve el Anexo I con su firma y sin la nuestra, no hace falta
    // salir de esta pantalla: se abre Autofirma con la caja del Proveedor y el PDF
    // firmado sustituye al que se soltó.
    const abrirFirma = async (r) => {
        const file = archivos.find(f => f.name === r.fichero);
        if (!file) return;
        try {
            setFirmando({ nombre: r.fichero, doc: r.doc, base64: await leerBase64(file) });
        } catch {
            setError('No se pudo leer el fichero para firmarlo.');
        }
    };

    const firmado = async (signedB64) => {
        const nombre = firmando?.nombre;
        setFirmando(null);
        if (!nombre || !signedB64) return;
        await reanalizar({ nuevosArchivos: archivos.map(f => (f.name === nombre ? comoFichero(signedB64, nombre) : f)) });
    };

    const aplicar = async () => {
        setFase('aplicando');
        setError('');
        try {
            const data = await enviar({ dryRun: false });
            setInforme(data);
            setFase('hecho');
            if (onChanged) onChanged();
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudieron registrar los firmados.');
            setFase('revision');
        }
    };

    const resultados = informe?.resultados || [];
    const aRegistrar = useMemo(() => resultados.filter(r =>
        r.estado === 'listo' || (r.estado === 'revisar' && forzar[r.fichero])), [resultados, forzar]);
    const destinosLibres = (informe?.destinos || []);

    return createPortal(
        // El popup de Autofirma va como HERMANO de este velo, no dentro: no se
        // portalea solo y un `position: fixed` se ancla al ancestro más cercano con
        // `backdrop-filter` (regla 29.b). Metido dentro, además, scrollearía con el
        // listado de ficheros.
        <>
        <div className="fixed inset-0 z-[340] flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-3xl my-8 shadow-2xl">

                <div className="flex items-center justify-between gap-3 p-6 border-b border-white/[0.06]">
                    <div className="min-w-0">
                        <h2 className="text-base font-black text-white">Firmados del Sujeto Obligado</h2>
                        <p className="text-[11px] text-white/40 mt-0.5 truncate">
                            {lote.codigo} · {ficheros.length} fichero{ficheros.length === 1 ? '' : 's'}
                            {informe?.representante_so?.nombre ? ` · debe firmar ${informe.representante_so.nombre}` : ''}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 text-white/30 hover:text-white transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-6 space-y-3">
                    {fase === 'analizando' && (
                        <div className="flex items-center gap-3 py-8 justify-center">
                            <svg className="w-5 h-5 animate-spin text-brand" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            <span className="text-[11px] text-white/50">Leyendo las firmas de cada PDF…</span>
                        </div>
                    )}

                    {error && <p className="text-[11px] text-red-400">{error}</p>}

                    {fase !== 'analizando' && resultados.map(r => (
                        <div key={r.fichero} className={`rounded-xl border px-3.5 py-3 space-y-1.5 ${TONO[r.estado] || 'border-white/10'}`}>
                            <div className="flex items-start gap-2.5">
                                <span className="text-[13px] leading-5 shrink-0">{ICONO[r.estado] || '·'}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-[11px] font-bold text-white/85 break-all">{r.fichero}</p>
                                    {/* A qué documento va. Es lo primero que hay que poder
                                        comprobar: un firmado en el expediente equivocado
                                        viaja hasta el verificador. */}
                                    {r.etiqueta ? (
                                        <p className="text-[10px] text-white/45 mt-0.5">
                                            → <span className="text-white/70 font-bold">{r.etiqueta}</span>
                                            {/* La etiqueta de una ficha ya suele traer el nº de
                                                expediente: repetirlo lo escribe dos veces. */}
                                            {r.expediente && !String(r.etiqueta || '').includes(r.expediente) ? ` · ${r.expediente}` : ''}
                                            {r.nombre_guardado ? ` · se guarda como ${r.nombre_guardado}` : ''}
                                        </p>
                                    ) : (r.estado === 'sin_identificar' || r.estado === 'duplicado') ? (
                                        // Solo se pregunta el destino cuando ESO es lo que
                                        // falta. A un PDF sin firma no se le pregunta de qué
                                        // documento es: no sirve como firmado de ninguno, y
                                        // el desplegable invita a colocarlo igual.
                                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] text-white/40">¿De qué documento es?</span>
                                            <select
                                                value={asignar[r.fichero] || ''}
                                                onChange={e => reanalizar({ nuevoAsignar: { ...asignar, [r.fichero]: e.target.value } })}
                                                className="bg-bkg-surface border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white focus:outline-none focus:border-brand/40">
                                                <option value="">— elígelo tú —</option>
                                                {destinosLibres.map(d => (
                                                    <option key={d.key} value={d.key}>
                                                        {d.etiqueta}{d.expediente ? ` · ${d.expediente}` : ''}{d.firmado ? ' (ya firmado)' : ''}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : null}

                                    {/* Quién firma, leído del certificado del propio PDF. */}
                                    {!!r.firmas?.length && (
                                        <ul className="mt-1.5 space-y-0.5">
                                            {r.firmas.map((f, i) => (
                                                <li key={i} className="text-[10px] text-white/55">
                                                    🖊 <span className="text-white/80">{f.nombre || f.cn || '(sin nombre en el certificado)'}</span>
                                                    {f.nif ? ` · ${f.nif}` : ''}{f.fecha ? ` · ${f.fecha}` : ''}
                                                    {f.organizacion ? <span className="text-white/30"> · {f.organizacion}</span> : null}
                                                </li>
                                            ))}
                                        </ul>
                                    )}

                                    {r.avisos?.map((a, i) => (
                                        <p key={i} className="text-[10px] text-amber-300/80 mt-1">⚠ {a}</p>
                                    ))}

                                    {/* Falta NUESTRA firma: se pone aquí y se acabó el
                                        aviso. Va antes del "registrarlo igualmente"
                                        porque firmarlo lo ARREGLA y forzarlo solo lo
                                        acepta como está. */}
                                    {fase === 'revision' && CAJA_BROKERGY[r.doc]
                                        && (r.faltan || []).some(x => x.rol === 'Brokergy') && (
                                        <button type="button" onClick={() => abrirFirma(r)}
                                            className="mt-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border border-emerald-400/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 transition-all">
                                            🖊️ Firmarlo yo ahora con Autofirma
                                        </button>
                                    )}

                                    {/* Lo que tiene avisos NO se registra solo. */}
                                    {fase === 'revision' && r.estado === 'revisar' && (
                                        <label className="mt-1.5 inline-flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={!!forzar[r.fichero]}
                                                onChange={e => setForzar(f => ({ ...f, [r.fichero]: e.target.checked }))}
                                                className="w-3.5 h-3.5 accent-amber-500" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-300/90">Registrarlo igualmente</span>
                                        </label>
                                    )}
                                    {r.registrado && (
                                        <p className="text-[10px] text-emerald-400/80 mt-1">
                                            ✓ Registrado{r.enlace ? ' · ' : ''}
                                            {r.enlace && <a href={r.enlace} target="_blank" rel="noopener noreferrer" className="underline hover:text-emerald-300">ver en Drive</a>}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Lo que sigue faltando, aquí y no en otra pantalla: es la razón
                        por la que se abre esto. */}
                    {fase !== 'analizando' && !!informe?.pendientes?.length && (
                        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/35 mb-1.5">
                                Sigue sin firmar ({informe.pendientes.length})
                            </p>
                            <p className="text-[10px] text-white/50">
                                {informe.pendientes.map(p => `${p.etiqueta}${p.expediente ? ` (${p.expediente})` : ''}`).join(' · ')}
                            </p>
                        </div>
                    )}
                    {fase === 'hecho' && !informe?.pendientes?.length && (
                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-3">
                            <p className="text-[11px] font-bold text-emerald-300">
                                Todo firmado. El lote pasa a esperar la oferta del verificador.
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3 p-6 border-t border-white/[0.06] flex-wrap">
                    <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">
                        {fase === 'hecho' ? 'Cerrar' : 'Cancelar'}
                    </button>
                    {fase !== 'hecho' && (
                        <button onClick={aplicar} disabled={fase !== 'revision' || !aRegistrar.length}
                            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-gradient-to-r from-brand to-brand-700 text-bkg-deep disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                            {fase === 'aplicando' ? 'Registrando…'
                                : aRegistrar.length ? `Registrar ${aRegistrar.length} documento${aRegistrar.length === 1 ? '' : 's'}`
                                    : 'Nada que registrar'}
                        </button>
                    )}
                </div>
            </div>
        </div>

        {firmando && (
            <FirmarConCertificadoModal
                pdfBase64={firmando.base64}
                title={`Firmar como Proveedor · ${lote.codigo || 'Lote'}`}
                fixedBox={CAJA_BROKERGY[firmando.doc]}
                onClose={() => setFirmando(null)}
                onSigned={firmado}
            />
        )}
        </>,
        document.body
    );
}
