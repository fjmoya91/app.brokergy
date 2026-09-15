import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─── Borrador para presentar el CEE ──────────────────────────────────────────
// Los datos del Registro Autonómico, en el orden en que su formulario los pide y
// listos para copiar. Se abre desde Ayudas CE3X, que es la caja de herramientas
// del trabajo del certificador, y éste es el último paso de ese trabajo.
//
// REGLA — aquí los apartados vienen ABIERTOS, al revés que en Ayudas CE3X. Allí
// son textos largos que casi nunca se leen y plegarlos deja las herramientas a la
// vista; aquí se va copiando campo a campo con el formulario delante, y plegarlos
// obligaría a un clic por cada casilla.
//
// REGLA — un apartado sin nada que teclear NO desaparece. Los del 04 al 08 solo
// dicen qué X marcar y cuál dejar sin marcar, y esa es justamente la mitad del
// valor de esta hoja: son las casillas en las que uno se equivoca.

export function BorradorCeeModal({ isOpen, onClose, expedienteId, apiBase = '/api/expedientes', fases = ['inicial', 'final'] }) {
    const [fase, setFase] = useState('inicial');
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [copiado, setCopiado] = useState(null);
    const [generando, setGenerando] = useState(false);
    const [descargando, setDescargando] = useState(null);

    // En un CEE directo de alcance ÚNICO no hay fase final: no se ofrece.
    const disponibles = ['inicial', 'final'].filter(f => fases.includes(f));

    useEffect(() => {
        if (!isOpen) return;
        if (!disponibles.includes(fase)) setFase(disponibles[0] || 'inicial');
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!isOpen || !expedienteId) return;
        let cancelado = false;
        setCargando(true);
        setError(null);
        (async () => {
            try {
                const { data } = await axios.get(`${apiBase}/${expedienteId}/borrador-cee`, { params: { fase } });
                if (!cancelado) setDatos(data);
            } catch (e) {
                if (!cancelado) setError(e.response?.data?.error || 'No se pudo componer el borrador');
            } finally {
                if (!cancelado) setCargando(false);
            }
        })();
        return () => { cancelado = true; };
    }, [isOpen, expedienteId, apiBase, fase]);

    const copiar = useCallback(async (texto, clave) => {
        try {
            await navigator.clipboard.writeText(String(texto));
            setCopiado(clave);
            setTimeout(() => setCopiado(c => (c === clave ? null : c)), 1800);
        } catch { /* sin https o con el portapapeles capado: se selecciona a mano */ }
    }, []);

    // Baja lo que venga y lo ofrece con su nombre. El servidor manda el suyo en
    // Content-Disposition (el del Registro), pero se pasa también aquí para que un
    // navegador que no lo lea no acabe guardando "fichero".
    const guardar = (blob, nombre) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    };

    // Uno de los cuatro documentos que se anexan, servido RENOMBRADO por el
    // backend. Va por axios y no por un enlace directo porque la ruta es
    // `staffOnly` y necesita la cabecera de sesión.
    const descargarFichero = async (f) => {
        if (!f?.presente || descargando) return;
        setDescargando(f.clave);
        try {
            const resp = await axios.get(`${apiBase}/${expedienteId}/borrador-cee/fichero`,
                { params: { fase, doc: f.clave }, responseType: 'blob', timeout: 60000 });
            guardar(resp.data, f.nombreRegistro || f.nombreDrive || 'documento');
        } catch (e) {
            // El cuerpo del error viene como Blob por el responseType: hay que leerlo.
            let msg = 'No se pudo descargar el fichero';
            try { msg = JSON.parse(await e.response?.data?.text())?.error || msg; } catch { /* noop */ }
            setError(msg);
        } finally {
            setDescargando(null);
        }
    };

    // El PDF se rasteriza del MISMO html que compuso el backend para esta vista:
    // lo que se descarga es exactamente lo que se está viendo.
    const descargarPdf = async () => {
        if (!datos?.html || generando) return;
        setGenerando(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: datos.html }, { timeout: 90000 });
            if (!data?.pdf) throw new Error(data?.message || 'No se pudo generar el PDF');
            const bin = atob(data.pdf);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const num = datos.borrador?.numeroExpediente || 'expediente';
            guardar(new Blob([bytes], { type: 'application/pdf' }),
                `Borrador presentar ${datos.borrador?.faseLabel || 'CEE'} - ${num}.pdf`);
        } catch (e) {
            setError(e.response?.data?.message || e.message || 'No se pudo generar el PDF');
        } finally {
            setGenerando(false);
        }
    };

    if (!isOpen) return null;
    const b = datos?.borrador;

    return (
        // En móvil, hoja inferior: el mismo criterio que Ayudas CE3X.
        <div className="fixed inset-0 z-[520] flex items-center justify-center max-md:items-end bg-black/70 backdrop-blur-sm animate-fade-in p-4 max-md:p-0"
             onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl max-md:rounded-b-none max-md:rounded-t-3xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[92vh]"
                 onClick={e => e.stopPropagation()}>

                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">📄 Presentar el CEE</h3>
                        <p className="text-[10px] text-white/40 normal-case mt-1 leading-snug">
                            Lo que va en cada casilla del formulario del Registro, en su mismo orden.
                            {b?.numeroExpediente ? ` · ${b.numeroExpediente}` : ''}
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-colors">
                        <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Fase: qué certificado se va a presentar */}
                {disponibles.length > 1 && (
                    <div className="flex gap-1.5 px-5 pt-3 shrink-0">
                        {disponibles.map(f => (
                            <button key={f} type="button" onClick={() => setFase(f)}
                                    className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors max-md:flex-1 ${
                                        fase === f
                                            ? 'text-brand border-brand/50 bg-brand/10'
                                            : 'text-white/35 border-white/[0.08] hover:text-white/60'
                                    }`}>
                                {f === 'final' ? 'CEE Final' : 'CEE Inicial'}
                            </button>
                        ))}
                    </div>
                )}

                {/* Cuerpo */}
                <div className="flex-1 overflow-y-auto p-5 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
                    {cargando && <p className="text-[11px] text-white/40 normal-case">Componiendo el borrador…</p>}
                    {error && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[11px] text-red-300 normal-case leading-snug">
                            {error}
                        </div>
                    )}

                    {/* Fuera de Castilla-La Mancha no se inventa un formulario que no es */}
                    {b && !b.aplica && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] px-4 py-3.5">
                            <div className="text-[11px] font-black text-amber-300 uppercase tracking-widest mb-1.5">
                                Sin plantilla para este registro
                            </div>
                            <p className="text-[11px] text-white/60 normal-case leading-relaxed">{b.motivo}</p>
                        </div>
                    )}

                    {b?.aplica && (
                        <>
                            {b.avisos?.length > 0 && (
                                <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3">
                                    <div className="text-[9px] font-black text-amber-300/90 uppercase tracking-widest mb-1.5">
                                        Antes de presentar
                                    </div>
                                    {b.avisos.map((a, i) => (
                                        <p key={i} className="text-[11px] text-amber-200/80 normal-case leading-snug mb-1 last:mb-0">{a}</p>
                                    ))}
                                </div>
                            )}

                            {b.apartados.map(ap => (
                                <Apartado key={ap.id} ap={ap} copiado={copiado} copiar={copiar} />
                            ))}

                            {b.ficheros?.length > 0 && (
                                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3.5">
                                    <div className="text-[10px] font-black text-white uppercase tracking-widest">Documentos anexados</div>
                                    <p className="text-[10px] text-white/40 normal-case mt-0.5 leading-snug">
                                        Los ficheros del {b.faseLabel}. Se descargan <b className="text-white/60">ya renombrados</b> con
                                        el NIF del titular delante, que es como hay que subirlos al Registro.
                                    </p>
                                    <div className="mt-2 space-y-1">
                                        {b.ficheros.map(f => (
                                            <Fichero key={f.clave} f={f} descargando={descargando}
                                                     onDescargar={() => descargarFichero(f)} />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Barra inferior: el PDF es lo que se lleva uno de aquí */}
                {b?.aplica && (
                    <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.06] shrink-0 max-md:pb-[max(0.875rem,env(safe-area-inset-bottom))]">
                        <p className="text-[9px] text-white/25 normal-case leading-snug hidden md:block">
                            El PDF se adjunta también al visto bueno que le das al certificador.
                        </p>
                        <button type="button" onClick={descargarPdf} disabled={generando || !datos?.html}
                                className="shrink-0 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-brand/40 bg-brand/10 text-brand hover:bg-brand hover:text-black transition-colors disabled:opacity-40 disabled:hover:bg-brand/10 disabled:hover:text-brand max-md:w-full max-md:py-3.5">
                            {generando ? 'Generando…' : '⬇ Descargar el borrador en PDF'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Un documento de los que se anexan al Registro.
//
// REGLA — estos NO se copian: se SUBEN. Un botón de copiar sobre el nombre de un
// fichero invita a pegarlo en algún sitio, y lo que hace falta es el fichero. Si
// está en la carpeta del CEE se descarga de un clic, ya renombrado; si no está,
// se dice —es lo que hay que resolver antes de entrar en la sede— y se enseña el
// nombre esperado como referencia.
function Fichero({ f, descargando, onDescargar }) {
    const yendo = descargando === f.clave;
    // `presente: null` es "no se ha podido mirar Drive": no se afirma que falte.
    const falta = f.presente === false;
    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
            falta ? 'border-amber-500/25 bg-amber-500/[0.03]' : 'border-white/[0.08] bg-white/[0.03]'
        }`}>
            <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">{f.titulo}</div>
                <code className="block text-[11px] text-white/75 break-all normal-case mt-0.5">
                    {f.nombreRegistro || f.nombreDrive}
                </code>
                {falta && (
                    <div className="text-[10px] text-amber-400/80 normal-case leading-snug mt-0.5">
                        No está en la carpeta del CEE — súbelo a su casilla antes de presentar.
                    </div>
                )}
            </div>
            {f.presente && (
                <button type="button" onClick={onDescargar} disabled={!!descargando}
                        title="Descargar ya renombrado"
                        className="shrink-0 px-2.5 py-1.5 max-md:px-3 max-md:py-2 rounded-md text-[9px] font-black uppercase tracking-widest bg-white/5 text-white/45 hover:bg-brand/20 hover:text-brand transition-colors disabled:opacity-40">
                    {yendo ? '…' : '⬇ Descargar'}
                </button>
            )}
        </div>
    );
}

function BotonCopiar({ activo, onClick }) {
    return (
        <button type="button" onClick={onClick} title="Copiar"
                className={`shrink-0 px-2 py-1 max-md:px-3 max-md:py-2 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors ${
                    activo ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/40 hover:bg-brand/20 hover:text-brand'
                }`}>
            {activo ? '✓' : 'Copiar'}
        </button>
    );
}

// Las instrucciones llevan **negrita**: la X que hay que marcar y la que no se
// tienen que distinguir sin leer la frase entera.
function conNegrita(texto) {
    return String(texto).split(/(\*\*[^*]+\*\*)/g).map((tr, i) => (
        tr.startsWith('**') && tr.endsWith('**')
            ? <b key={i} className="text-white">{tr.slice(2, -2)}</b>
            : <React.Fragment key={i}>{tr}</React.Fragment>
    ));
}

/**
 * Los campos en el orden en que se pintan: cada uno el suyo, salvo las casillas
 * de portal/escalera/planta/puerta que estén VACÍAS, que se juntan en una línea.
 *
 * Se colapsa SOLO ese grupo (`num`) porque es el único que está vacío casi
 * siempre. Un tipo de vía o una provincia en blanco sí son algo que falta —hay
 * que elegirlos en el desplegable del formulario— y esconderlos en gris sería
 * cambiar espacio por despistes.
 */
function filasDe(campos) {
    const filas = [];
    let vacios = [];
    const cerrar = () => { if (vacios.length) { filas.push({ tipo: 'vacios', campos: vacios }); vacios = []; } };
    for (const c of campos) {
        // El hueco de la tasa NO se colapsa: es la única casilla que se rellena a
        // mano, y su instrucción es la mitad del apartado 08.
        if (c.grupo === 'num' && !c.valor && !c.hueco) { vacios.push(c); continue; }
        cerrar();
        filas.push({ tipo: 'campo', campo: c });
    }
    cerrar();
    return filas;
}

// Un valor largo o un campo con nota no caben en media fila sin partirse en
// cuatro renglones: ocupan la fila entera.
const ANCHO_COMODO = 42;

function Campo({ c, apId, copiado, copiar }) {
    const ancho = c.nota || (c.valor || '').length > ANCHO_COMODO;
    return (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-brand/30 transition-colors ${
            ancho ? 'col-span-2 max-md:col-span-1' : ''
        }`}>
            <div className="min-w-0 flex-1">
                <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">{c.campo}</div>
                {c.valor ? (
                    <div className="text-white mt-0.5 break-words normal-case text-[13px] font-semibold">{c.valor}</div>
                ) : (
                    // Fuera de un grupo, un campo sin valor es algo que FALTA (el uso
                    // del edificio, la referencia catastral): va en ámbar. El hueco de
                    // la tasa se deja en blanco a propósito y no alarma.
                    <div className={`mt-0.5 normal-case text-[12px] ${c.hueco ? 'text-white/25' : 'text-amber-400/70'}`}>
                        {c.hueco ? '— se rellena a mano —' : '— no consta —'}
                    </div>
                )}
                {c.nota && <div className="text-[10px] text-white/35 normal-case leading-snug mt-0.5">{c.nota}</div>}
            </div>
            {c.valor && (
                <BotonCopiar activo={copiado === `${apId}__${c.campo}`}
                             onClick={() => copiar(c.valor, `${apId}__${c.campo}`)} />
            )}
        </div>
    );
}

function Apartado({ ap, copiado, copiar }) {
    const conDatos = (ap.campos || []).some(c => c.valor);
    return (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06]">
                <div className="text-[10px] font-black text-white uppercase tracking-widest">{ap.titulo}</div>
                {ap.nota && <p className="text-[10px] text-white/40 normal-case mt-0.5 leading-snug">{ap.nota}</p>}
            </div>

            {(ap.instrucciones || []).length > 0 && (
                <div className="px-4 py-2.5 bg-brand/[0.04] border-b border-white/[0.06] space-y-1">
                    {ap.instrucciones.map((i, k) => (
                        <p key={k} className="text-[11px] text-white/55 normal-case leading-snug">→ {conNegrita(i)}</p>
                    ))}
                </div>
            )}

            {/* REGLA — DOS COLUMNAS. Un apartado de dirección son once casillas y
                en una sola columna el popup se recorre a scrollazos. Lo que no cabe
                en media fila —un párrafo como el «En calidad de» del representante,
                o un campo con su nota— ocupa la fila entera; en móvil, todo a una
                columna. El PDF no cambia: allí ya se agrupan como en el impreso. */}
            {(ap.campos || []).length > 0 && (
                <div className="p-2.5 grid grid-cols-2 max-md:grid-cols-1 gap-1 items-start">
                    {filasDe(ap.campos).map((f, k) => (
                        f.tipo === 'vacios'
                            // REGLA — las casillas de un grupo que van EN BLANCO se
                            // colapsan en una línea. En una dirección normal, portal,
                            // escalera, planta y puerta están vacías: cuatro tarjetas
                            // diciendo «no consta» son cuatro pantallazos de scroll
                            // entre el número de la calle y la provincia. Que van en
                            // blanco se sigue diciendo — es lo que se comprueba.
                            ? (
                                <p key={k} className="col-span-2 max-md:col-span-1 px-3 py-1.5 text-[10px] text-white/25 normal-case leading-snug">
                                    En blanco: {f.campos.map(c => c.campo).join(' · ')}
                                </p>
                            )
                            : (
                                <Campo key={k} c={f.campo} apId={ap.id} copiado={copiado} copiar={copiar} />
                            )
                    ))}
                </div>
            )}

            {ap.original && conDatos && (
                <p className="px-4 pb-3 text-[10px] text-white/30 normal-case leading-snug">
                    Dirección guardada: <span className="text-white/45">{ap.original}</span>
                </p>
            )}
        </div>
    );
}
