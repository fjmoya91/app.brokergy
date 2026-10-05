import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { analizarProceso, SLOTS } from '../logic/loteProceso';
import { computeLoteEco } from '../logic/loteEco';
import { EnviarDocLoteModal } from './EnviarDocLoteModal';
import { AhorrosVerificadosModal } from './AhorrosVerificadosModal';
import { FirmadosSoModal } from './FirmadosSoModal';
import SendActionOverlay from '../../../components/SendActionOverlay';
import { BotonCarpetaLocal } from './BotonCarpetaLocal';
import { CobroClientesPanel } from './CobroClientesPanel';

// ─────────────────────────────────────────────────────────────────────────────
// El proceso del lote, por FASES, en el orden real del trámite. Sustituye a los
// dos bloques sueltos de antes ("Documentos del lote" + "Acciones"), que obligaban
// a saber de memoria qué iba antes de qué.
//
// Cada fase muestra sus documentos, sus acciones y —si aún no toca— el motivo por
// el que está bloqueada. Los documentos y el estado del lote los manda el backend
// (services/loteDocs.js); aquí solo se pintan. Ver logic/loteProceso.js.
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

const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// El ciclo de un documento tiene CUATRO estados, y cada uno su color, para saber de
// un vistazo si la pelota está en nuestro tejado o en el del S.O./verificador:
//   BORRADOR (gris)  · generado o subido, todavía no ha salido
//   ENVIADO  (ámbar) · salió al S.O./verificador — esperando respuesta
//   RECIBIDO (cian)  · ha vuelto firmado, PENDIENTE DE REVISAR
//   OK       (verde) · revisado y dado por bueno por un ADMIN
const ESTADOS_DOC = {
    ok:       { label: 'OK ✓',    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
    recibido: { label: 'Recibido', cls: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30' },
    enviado:  { label: 'Enviado',  cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    borrador: { label: 'Borrador', cls: 'bg-white/[0.04] text-white/30 border-white/10' },
};

export const estadoDeDoc = (doc) => {
    if (!doc) return 'borrador';
    if (doc.validado_at) return 'ok';
    if (doc.signed_link) return 'recibido';
    if (doc.sent_at) return 'enviado';
    return 'borrador';
};

// Un papel que llega de FUERA y no se firma (plan, informes, dictamen, certificado
// CAE) no es un "borrador": está recibido y guardado, y no le queda ningún paso.
const GUARDADO = { label: 'Guardado', cls: 'bg-emerald-500/[0.06] text-emerald-400/70 border-emerald-500/20' };

const EstadoPill = ({ doc }) => {
    const estado = estadoDeDoc(doc);
    const cfg = SLOTS[doc?.tipo];
    const e = (estado === 'borrador' && cfg && !cfg.firmable && !cfg.importe) ? GUARDADO : ESTADOS_DOC[estado];
    return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${e.cls}`}>{e.label}</span>;
};

// Documentos que pueden volver firmados (los que salen a firmar).
const TIPOS_FIRMABLES = ['solicitud_verificacion', 'anexo_i_listado', 'ficha_res', 'oferta_verificacion'];
const esFirmable = (doc) => TIPOS_FIRMABLES.includes(doc?.tipo);

// Fila de un documento. Cuando ha vuelto firmado, el firmado se pinta como una
// SUBFILA propia en cian/verde: son dos cosas distintas (lo que mandamos y lo que
// nos devolvieron) y antes se confundían en un solo enlace.
const Fila = ({ doc, acciones = null, onBorrar = null, onSubirFirmado = null, onValidar = null,
    onMarcarPagada = null, onJustificantePago = null, onReemplazar = null, ocupado = false, children = null }) => {
    const fecha = fmtFecha(doc.sent_at) || fmtFecha(doc.uploaded_at);
    const estado = estadoDeDoc(doc);
    return (
        <div className={`rounded-xl border transition-colors ${
            estado === 'ok' ? 'bg-emerald-500/[0.04] border-emerald-500/20'
                : estado === 'recibido' ? 'bg-cyan-500/[0.04] border-cyan-500/20'
                    : 'bg-white/[0.02] border-white/[0.05] hover:border-white/10'}`}>
            <div className="flex items-center gap-3 px-3 py-2.5">
                <svg className="w-4 h-4 text-white/25 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-white/80 truncate">{doc.label || doc.file_name}</p>
                    <p className="text-[9px] text-white/25">
                        {[doc.sent_at ? `Enviado ${fecha}` : (fecha ? `Subido ${fecha}` : null),
                          doc.importe ? eur(doc.importe) : null].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {/* Lo que se le RECLAMÓ al S.O. sobre este documento. Va aquí y no
                        solo en el cuadro de mando porque es donde se mira la factura:
                        sin esta línea, un pago ya pedido no se distinguía de uno que
                        nunca salió. Una vez COBRADA pierde el ámbar de "pendiente":
                        pasa a ser el historial de cómo se llegó a cobrar. */}
                    {doc.pago_solicitado_at && (
                        <p className={`text-[9px] ${doc.pagado_at ? 'text-white/25' : 'text-amber-400/60'}`}>
                            ✓ Pago pedido {fmtFecha(doc.pago_solicitado_at)}
                            {doc.pago_solicitado_to ? ` a ${doc.pago_solicitado_to}` : ''}
                            {Number(doc.pago_solicitado_veces) > 1 ? ` · ${doc.pago_solicitado_veces} veces` : ''}
                        </p>
                    )}
                </div>
                <EstadoPill doc={doc} />
                <div className="flex items-center gap-1.5 shrink-0">
                    {doc.draft_link && (
                        <a href={doc.draft_link} target="_blank" rel="noopener noreferrer"
                            className="px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider text-white/40 hover:text-white hover:bg-white/5 transition-all">Ver</a>
                    )}
                    {/* Reemplazar es gestionar ESTE documento, así que va en su fila y
                        no como un botón suelto de la fase. */}
                    {onReemplazar && (
                        <label title="Sustituir por otro PDF"
                            className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                ocupado ? 'opacity-40 cursor-not-allowed text-white/30' : 'cursor-pointer text-white/40 hover:text-white hover:bg-white/5'}`}>
                            ↻
                            <input type="file" accept="application/pdf" className="hidden" disabled={ocupado}
                                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onReemplazar(f); }} />
                        </label>
                    )}
                    {onBorrar && (
                        <button type="button" onClick={onBorrar} title="Quitar del lote"
                            className="px-1.5 py-1 rounded-lg text-[11px] text-white/20 hover:text-red-400 transition-all">✕</button>
                    )}
                </div>
            </div>

            {/* Lo que la app ha LEÍDO de este documento (ahorros, nº de dictamen,
                códigos CAE…) va pegado a él: es su gestión, no una tarea de la fase. */}
            {children && <div className="mx-3 mb-2.5 space-y-1.5">{children}</div>}

            {/* Lo que nos han DEVUELTO firmado, en su propia línea. */}
            {doc.signed_link && (
                <div className={`mx-3 mb-2.5 rounded-lg border px-2.5 py-2 flex items-center gap-2 flex-wrap ${
                    estado === 'ok' ? 'bg-emerald-500/[0.07] border-emerald-500/25' : 'bg-cyan-500/[0.07] border-cyan-500/25'}`}>
                    <span className={`text-[9px] font-black uppercase tracking-wider ${estado === 'ok' ? 'text-emerald-400' : 'text-cyan-300'}`}>
                        ↩ Firmado recibido
                    </span>
                    <span className="text-[9px] text-white/30">{fmtFecha(doc.signed_at) || ''}</span>
                    <a href={doc.signed_link} target="_blank" rel="noopener noreferrer"
                        className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-white/50 hover:text-white hover:bg-white/5 transition-all">Abrir</a>
                    {/* Sustituir el firmado es gestión DE ESTE firmado: va en su línea. */}
                    {onSubirFirmado && (
                        <label title="Sustituir el firmado por otro PDF"
                            className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider transition-all ${
                                ocupado ? 'opacity-40 cursor-not-allowed text-white/30' : 'cursor-pointer text-white/35 hover:text-white hover:bg-white/5'}`}>
                            ↻ Sustituir
                            <input type="file" accept="application/pdf" className="hidden" disabled={ocupado}
                                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onSubirFirmado(f); }} />
                        </label>
                    )}
                    <div className="flex-1" />
                    {doc.validado_at ? (
                        <span className="text-[9px] text-emerald-400/70 font-bold">
                            OK{doc.validado_por ? ` · ${doc.validado_por}` : ''}
                            {onValidar && (
                                <button type="button" onClick={() => onValidar(false)} disabled={ocupado}
                                    className="ml-2 text-white/25 hover:text-amber-400 transition-colors">quitar</button>
                            )}
                        </span>
                    ) : onValidar ? (
                        <button type="button" onClick={() => onValidar(true)} disabled={ocupado}
                            className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-all">
                            ✓ Marcar OK
                        </button>
                    ) : null}
                </div>
            )}

            {/* El COBRO de una factura, en su propia línea. Es el final de su vida
                —subida → remitida → reclamada → PAGADA— y hasta ahora no se podía
                anotar: una factura ya cobrada seguía figurando como pendiente y el
                cuadro de mando se la volvía a reclamar al S.O. El justificante vive
                con el resto del papeleo del lote, no en un correo. */}
            {doc.pagado_at && (
                <div className="mx-3 mb-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-2.5 py-2 flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400">€ Pagada</span>
                    <span className="text-[9px] text-white/30">{fmtFecha(doc.pagado_at)}</span>
                    {doc.pago_justificante_link ? (
                        <a href={doc.pago_justificante_link} target="_blank" rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider text-white/50 hover:text-white hover:bg-white/5 transition-all">
                            Ver justificante
                        </a>
                    ) : onJustificantePago ? (
                        <BotonSubir disabled={ocupado} onFile={onJustificantePago}>
                            {ocupado ? 'Subiendo…' : '↑ Justificante de pago'}
                        </BotonSubir>
                    ) : null}
                    <div className="flex-1" />
                    {doc.pago_justificante_link && onJustificantePago && (
                        <BotonSubir disabled={ocupado} onFile={onJustificantePago}>
                            {ocupado ? 'Subiendo…' : '↻ Reemplazar'}
                        </BotonSubir>
                    )}
                    {onMarcarPagada && (
                        <button type="button" onClick={() => onMarcarPagada(false)} disabled={ocupado}
                            className="text-[9px] text-white/25 hover:text-amber-400 disabled:opacity-40 transition-colors">quitar</button>
                    )}
                </div>
            )}

            {(acciones || (onSubirFirmado && !doc.signed_link) || (!doc.pagado_at && (onMarcarPagada || onJustificantePago))) && (
                <div className="px-3 pb-2.5 flex items-center gap-2 flex-wrap">
                    {onSubirFirmado && !doc.signed_link && (
                        <BotonSubir disabled={ocupado} onFile={onSubirFirmado}>↑ Subir firmado</BotonSubir>
                    )}
                    {/* Dos caminos al mismo sitio: con el justificante delante se
                        sube (y eso ya la da por pagada — el papel es la prueba), y
                        sin él se puede marcar igual, que es lo que pasa cuando el
                        S.O. avisa del pago antes de mandar el resguardo. */}
                    {!doc.pagado_at && onJustificantePago && (
                        <BotonSubir disabled={ocupado} onFile={onJustificantePago} destacado>
                            {ocupado ? 'Subiendo…' : '↑ Justificante de pago'}
                        </BotonSubir>
                    )}
                    {!doc.pagado_at && onMarcarPagada && (
                        <button type="button" onClick={() => onMarcarPagada(true)} disabled={ocupado}
                            className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-all">
                            € Marcar pagada
                        </button>
                    )}
                    {acciones}
                </div>
            )}
        </div>
    );
};

// Botón-etiqueta para subir un PDF a un slot.
const BotonSubir = ({ children, disabled, onFile, destacado = false }) => (
    <label className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
        disabled ? 'opacity-40 cursor-not-allowed border-white/10 text-white/30'
            : destacado ? 'cursor-pointer border-brand/30 bg-brand/10 text-brand hover:bg-brand/20'
                : 'cursor-pointer border-dashed border-white/15 text-white/45 hover:text-white/80 hover:border-brand/40'}`}>
        {children}
        <input type="file" accept="application/pdf" className="hidden" disabled={disabled}
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </label>
);

// ─── Arrastrar los firmados: TODO el bloque de la fase es zona de suelta ─────
//
// Con una cajita punteada hay que apuntar, y lo que se arrastra aquí viene de
// una descarga de seis PDF: se suelta en el sitio donde se está mirando, que es
// la fase entera. Y se avisa ANTES de llegar — en cuanto el ratón entra en la
// ventana con ficheros, las fases que aceptan suelta se marcan; sin eso hay que
// adivinar dónde vale soltar y el intento acaba en el escritorio.
//
// `arrastrando` cambia DOS veces por arrastre (al empezar y al acabar); el
// resaltado de la fase concreta se hace tocando las clases del propio nodo, sin
// estado de React: `Fase` se recrea en cada render del padre, así que un
// `useState` dentro la remontaría a mitad de arrastre y el navegador cancelaría
// el hover.
function useArrastreDeFicheros() {
    const [arrastrando, setArrastrando] = useState(false);
    useEffect(() => {
        let t = null;
        const conFicheros = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
        const mover = (e) => {
            // Sin `preventDefault` el navegador NO deja soltar; y si se suelta
            // fuera de una zona, ABRE el PDF y se pierde lo que hubiera en
            // pantalla. Va a nivel de ventana y solo mientras este panel está
            // montado: las demás zonas de la app siguen recibiendo su evento —
            // esto corre después, en burbuja, y solo evita la navegación.
            e.preventDefault();
            if (!conFicheros(e)) return;
            setArrastrando(true);
            clearTimeout(t);
            // `dragover` se repite mientras se arrastra. Si deja de llegar, el
            // arrastre salió de la ventana: no hay un evento fiable para eso.
            t = setTimeout(() => setArrastrando(false), 220);
        };
        const fin = (e) => { if (e.type === 'drop') e.preventDefault(); clearTimeout(t); setArrastrando(false); };
        window.addEventListener('dragover', mover);
        window.addEventListener('drop', fin);
        window.addEventListener('dragend', fin);
        return () => {
            clearTimeout(t);
            window.removeEventListener('dragover', mover);
            window.removeEventListener('drop', fin);
            window.removeEventListener('dragend', fin);
        };
    }, []);
    return arrastrando;
}

// Clases del resaltado de la fase que tiene el puntero encima.
const RESALTE = ['border-brand', 'bg-brand/[0.10]', 'ring-2', 'ring-brand/40'];

const pdfsDe = (lista) => Array.from(lista || []).filter(f => /\.pdf$/i.test(f.name));

// La pista dentro de la fase: dice que se puede arrastrar y, pulsándola, abre el
// selector — arrastrar no siempre es posible (un adjunto que solo se puede
// descargar, un portátil con panel táctil).
const PistaSuelta = ({ arrastrando, texto, onFiles }) => (
    <label className={`flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 cursor-pointer transition-all ${
        arrastrando ? 'border-brand/60 bg-brand/[0.06] text-brand' : 'border-white/12 text-white/40 hover:border-brand/40 hover:text-white/70'}`}>
        <span className="text-[11px] shrink-0">{arrastrando ? '⬇' : '↓'}</span>
        <span className="text-[10px] font-bold flex-1 min-w-0">
            {arrastrando ? 'Suéltalos en cualquier parte de este bloque' : texto}
        </span>
        <span className="text-[9px] font-black uppercase tracking-wider text-white/30 shrink-0">o elígelos</span>
        <input type="file" accept="application/pdf" multiple className="hidden"
            onChange={(e) => { const fs = pdfsDe(e.target.files); e.target.value = ''; if (fs.length) onFiles(fs); }} />
    </label>
);

// Botón de acción de una fase (abre un modal del lote).
const BotonAccion = ({ children, onClick, disabled, title, tono = 'brand' }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
            tono === 'amber' ? 'border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                : 'border-brand/30 bg-brand/10 text-brand hover:bg-brand/20'}`}>
        {children}
    </button>
);

// Botón pequeño para una acción SOBRE un documento (enviarlo, reenviarlo). Va en
// la fila del documento, con el mismo tamaño que "Subir firmado" o "Marcar OK".
const BotonFila = ({ children, onClick, disabled, title }) => (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
        className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border border-brand/30 bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-40 transition-all">
        {children}
    </button>
);

// ─── Un documento que el trámite ESPERA y todavía no está ────────────────────
// Antes cada documento pendiente era un botón "↑ Subir X" suelto entre las
// acciones de la fase —mezclado con "Generar…" o "Comprobar…"—, así que no se
// distinguía lo que hay que HACER de lo que hay que TRAER, ni se veía qué papeles
// faltaban. Ahora cada documento esperado tiene su fila esté o no esté: si falta,
// la fila es un hueco punteado con su botón de subir, y se le puede soltar el PDF
// encima. Al subirlo, el hueco pasa a ser la fila del documento en el mismo sitio.
//
// `requerido` cuenta como "falta" en la cabecera de la fase; `opcional` dice que
// puede no llegar nunca (inexactitudes, requerimientos); sin ninguno de los dos,
// es un papel que llega pero del que no depende el siguiente paso.
// `onFile` null = no se sube: se genera con una acción de la fase (y lo dice `hint`).
const Hueco = ({ label, hint = null, requerido = false, opcional = false, siguiente = false,
    ocupado = false, textoOcupado = 'Subiendo…', arrastrando = false, onFile = null,
    compacto = false, textoBoton = '↑ Subir PDF', children = null }) => {
    const dnd = onFile ? {
        // La suelta sobre la FILA gana a la de la fase (que es para los firmados):
        // aquí se sabe exactamente qué documento es.
        onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.classList.add(...RESALTE); },
        onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove(...RESALTE); },
        onDrop: (e) => {
            e.preventDefault(); e.stopPropagation();
            e.currentTarget.classList.remove(...RESALTE);
            const f = pdfsDe(e.dataTransfer?.files)[0];
            if (f && !ocupado) onFile(f);
        },
    } : {};
    const estado = requerido
        ? (siguiente ? { t: 'Falta', c: 'bg-amber-500/10 text-amber-400 border-amber-500/30' }
            : { t: 'Falta', c: 'bg-white/[0.04] text-white/40 border-white/10' })
        : opcional ? { t: 'Opcional', c: 'bg-white/[0.02] text-white/25 border-white/[0.08]' }
            : { t: 'Pendiente', c: 'bg-white/[0.02] text-white/30 border-white/[0.08]' };
    if (compacto) {
        return (
            <div {...dnd} className={`rounded-xl border border-dashed px-3 py-1.5 flex items-center gap-2 transition-all ${
                arrastrando && onFile ? 'border-brand/40' : 'border-white/[0.07]'}`}>
                <span className="text-[10px] text-white/35 flex-1 min-w-0 truncate">{label}</span>
                {onFile && (
                    <BotonSubir disabled={ocupado} onFile={onFile}>{ocupado ? textoOcupado : textoBoton}</BotonSubir>
                )}
            </div>
        );
    }
    return (
        <div {...dnd} className={`rounded-xl border border-dashed transition-all ${
            arrastrando && onFile ? 'border-brand/40 bg-brand/[0.03]'
                : siguiente ? 'border-amber-500/30 bg-amber-500/[0.03]' : 'border-white/[0.08]'}`}>
            <div className="flex items-center gap-3 px-3 py-2.5">
                <svg className="w-4 h-4 text-white/15 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-bold truncate ${siguiente ? 'text-white/70' : 'text-white/45'}`}>{label}</p>
                    {hint && <p className="text-[9px] text-white/25">{arrastrando && onFile ? 'Suéltalo aquí' : hint}</p>}
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${estado.c}`}>{estado.t}</span>
                {onFile && (
                    <BotonSubir disabled={ocupado} onFile={onFile} destacado={siguiente}>
                        {ocupado ? textoOcupado : textoBoton}
                    </BotonSubir>
                )}
            </div>
            {children && <div className="px-3 pb-2.5 flex items-center gap-2 flex-wrap">{children}</div>}
        </div>
    );
};

// ─── Un aviso NO se repite por actuación ─────────────────────────────────────
// El informe del paquete son cinco actuaciones con los MISMOS avisos, así que
// listándolos uno por uno salían quince líneas de las que trece decían lo mismo
// —y enterraban las cinco que se ha venido a leer, con el botón de cerrar al
// final de todo—. Se agrupa por el TEXTO del aviso y se dice DÓNDE pasa.
//
// `mensajesDe(a)` devuelve los mensajes de una actuación; `total` es cuántas se
// han armado, para poder decir "en las 5" en vez de enumerarlas todas — que es
// el caso normal y el que más ruido hacía.
function agruparPorMensaje(actuaciones, mensajesDe, total) {
    const porTexto = new Map();
    for (const a of (actuaciones || [])) {
        for (const m of (mensajesDe(a) || [])) {
            if (!porTexto.has(m)) porTexto.set(m, []);
            porTexto.get(m).push(a.n);
        }
    }
    return [...porTexto.entries()].map(([mensaje, enes]) => {
        const donde = (total > 1 && enes.length >= total)
            ? `en las ${total} actuaciones`
            : `en ${enes.sort((x, y) => x - y).map(n => `E${n}`).join(', ')}`;
        return { texto: `${mensaje} · ${donde}` };
    });
}

export function LoteProcesoFases({ lote, onChanged, canSeeMargin = false, acciones = {} }) {
    const { showConfirm, showAlert } = useModal();
    const [subiendo, setSubiendo] = useState(null);   // slot en curso
    const [error, setError] = useState('');
    const [docAEnviar, setDocAEnviar] = useState(null);   // documento que se está mandando al S.O.
    const [importeFactura, setImporteFactura] = useState('');
    // Lo leído del informe o del dictamen, a la espera de que alguien lo revise.
    // `modo` dice cuál de los dos, que es lo único que cambia en el modal.
    const [propuestaAhorros, setPropuestaAhorros] = useState(null);
    const [modoRevision, setModoRevision] = useState('informe');
    const [leyendoInforme, setLeyendoInforme] = useState(false);
    const [leyendoDictamen, setLeyendoDictamen] = useState(false);
    const [generandoAnexos, setGenerandoAnexos] = useState(false);
    // Los PDF que acaba de soltar el usuario, a la espera de que el modal los
    // analice. Se guardan los File tal cual: el modal los sube dos veces (analizar
    // y aplicar) y así no hay que volver a pedirlos.
    const [firmadosSueltos, setFirmadosSueltos] = useState(null);
    // ¿Se está arrastrando algo sobre la ventana? Para marcar las fases que
    // aceptan suelta antes de que el puntero llegue a ellas.
    const arrastrando = useArrastreDeFicheros();
    // Destino ya decidido (se entra por el botón de una fila, no arrastrando).
    const [asignacionInicial, setAsignacionInicial] = useState(null);
    // Overlay ESTÁNDAR mientras se lee un PDF y para contar cómo ha ido. Leer un
    // informe tarda entre 6 y 14 segundos: sin él, el usuario pulsa y no pasa nada
    // visible, así que vuelve a pulsar. Nunca un showAlert pelado (ver el estándar
    // en components/SendActionOverlay.jsx).
    const [lectura, setLectura] = useState(null);
    // Override manual del plegado de cada fase (por número de fase).
    const [fasesAbiertas, setFasesAbiertas] = useState({});


    const p = useMemo(() => analizarProceso(lote), [lote]);

    // Cuántos expedientes tienen ya su ahorro VERIFICADO. Es lo que decide si el
    // lote puede pasar a pagar al cliente, así que se dice en la propia fase en
    // vez de descubrirse al intentar cambiar el estado y comerse un error.
    const verif = useMemo(() => {
        const eco = computeLoteEco(lote);
        return { n: eco.nVerif || 0, total: eco.nTotal || 0, completo: !!eco.fullyVerif };
    }, [lote]);

    // Lo que la operación le cuesta al SUJETO OBLIGADO en €/MWh: la verificación que
    // paga él (importe de la factura del verificador) MÁS lo que nos paga a nosotros
    // (oferta del lote). No entra en nuestro margen — no es un coste de Brokergy.
    const costeSo = useMemo(() => {
        const importe = Number(p.facturaVerificador?.importe) || 0;
        if (!importe) return null;
        const eco = computeLoteEco(lote);
        // Si todos los expedientes tienen ahorro verificado se usa ese, que es el que
        // de verdad se factura; si no, el estimado (y se avisa de que lo es).
        const mwh = eco.fullyVerif && eco.ahorroMwhVerif > 0 ? eco.ahorroMwhVerif : eco.ahorroMwh;
        if (!(mwh > 0)) return null;
        const verifMwh = importe / mwh;
        const nuestro = eco.ofertaLote;
        return {
            importe, mwh, verifMwh, nuestro,
            total: nuestro != null ? verifMwh + nuestro : null,
            estimado: !(eco.fullyVerif && eco.ahorroMwhVerif > 0),
        };
    }, [lote, p.facturaVerificador]);

    // ── Subida genérica a un slot ─────────────────────────────────────────────
    const subir = async (slot, file, extra = {}) => {
        if (!file) return null;
        if (file.type !== 'application/pdf') { setError('El fichero debe ser un PDF.'); return null; }
        setError('');
        setSubiendo(slot);
        try {
            const base64 = await fileToBase64(file);
            const { data } = await axios.post(`/api/lotes/${lote.id}/documentos/${slot}`, {
                base64, fileName: file.name, ...extra,
            });
            if (onChanged) onChanged();
            return data || null;
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo subir el documento.');
            return null;
        } finally {
            setSubiendo(null);
        }
    };

    // ── El PDF que nos devuelven FIRMADO, de cualquier documento del lote ─────
    // Vale para el Anexo I, las fichas, la solicitud o la oferta: da igual que el
    // S.O. haya firmado por el enlace o nos lo mande por email, acaba en el mismo
    // sitio (mismo endpoint que la firma pública).
    // Subir el firmado de UNA fila entra por el MISMO sitio que soltarlos todos:
    // así la comprobación de la firma y el `_fdo` no dependen de por dónde hayas
    // entrado. La diferencia es que aquí el documento ya se sabe —lo dice la
    // fila—, así que va asignado de partida y no hay nada que emparejar.
    const subirFirmado = (docKey, file) => {
        if (!file) return;
        if (file.type !== 'application/pdf') { setError('El fichero firmado debe ser un PDF.'); return; }
        setError('');
        setAsignacionInicial({ [file.name]: docKey });
        setFirmadosSueltos([file]);
    };

    // Visto bueno del ADMIN: que vuelva firmado no quiere decir que esté bien.
    const validar = async (docKey, ok) => {
        setError('');
        setSubiendo(docKey);
        try {
            await axios.post(`/api/lotes/${lote.id}/documentos/${docKey}/validar`, { ok });
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo marcar el documento.');
        } finally {
            setSubiendo(null);
        }
    };

    // ── El COBRO de una factura del lote ──────────────────────────────────────
    // "Pagada" es el último sello de la vida de una factura y faltaba: sin él, una
    // ya cobrada seguía figurando como pendiente y el botón del cuadro de mando se
    // la volvía a reclamar al S.O. — reclamarle a quien ya pagó.
    const marcarPagada = async (docKey, ok) => {
        if (!ok) {
            const conf = await showConfirm(
                'Se retirará la marca de PAGADA. Si hay justificante de pago subido, se archivará en la subcarpeta OLD de Drive (no se borra).',
                'Quitar la marca de pagada', 'warning');
            if (!conf) return;
        }
        setError('');
        setSubiendo(docKey);
        try {
            await axios.post(`/api/lotes/${lote.id}/documentos/${docKey}/pago`, { pagado: ok });
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo registrar el pago.');
        } finally { setSubiendo(null); }
    };

    // El justificante ES la prueba del cobro, así que subirlo da la factura por
    // pagada: pedir además que se pulse la casilla deja el papel dentro y la marca
    // sin poner. Mismo criterio que el justificante de registro del MITECO.
    const subirJustificantePago = async (docKey, file) => {
        if (!file) return;
        if (file.type !== 'application/pdf') { setError('El justificante de pago debe ser un PDF.'); return; }
        setError('');
        setSubiendo(docKey);
        try {
            const base64 = await fileToBase64(file);
            await axios.post(`/api/lotes/${lote.id}/documentos/${docKey}/pago`, {
                pagado: true, base64, fileName: file.name,
            });
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo subir el justificante de pago.');
        } finally { setSubiendo(null); }
    };

    // Props comunes de una fila de documento (firmado + visto bueno cuando aplica).
    // El cobro solo se ofrece sobre FACTURAS y solo al ADMIN: es dinero, y el
    // backend lo repite (la ruta es adminOnly).
    const propsFila = (d) => {
        const esFactura = !!SLOTS[d.tipo]?.importe;
        return {
            ocupado: subiendo === d.key,
            onSubirFirmado: esFirmable(d) ? (f) => subirFirmado(d.key, f) : null,
            onValidar: (canSeeMargin && d.signed_link) ? (ok) => validar(d.key, ok) : null,
            onBorrar: (SLOTS[d.tipo] && !d.signed_link) ? () => borrar(d) : null,
            // Sustituir el PDF: solo en los que se SUBEN y son uno por lote (los
            // múltiples se añaden; los generados se rehacen desde su acción).
            onReemplazar: (SLOTS[d.tipo] && !SLOTS[d.tipo].multiple) ? (f) => reemplazar(d, f) : null,
            onMarcarPagada: (canSeeMargin && esFactura) ? (ok) => marcarPagada(d.key, ok) : null,
            onJustificantePago: (canSeeMargin && esFactura) ? (f) => subirJustificantePago(d.key, f) : null,
        };
    };

    const borrar = async (doc) => {
        const ok = await showConfirm(`¿Quitar "${doc.label || doc.file_name}" del lote?\n\nSe borra también de la carpeta de Drive.`, 'Quitar documento', 'warning');
        if (!ok) return;
        setError('');
        try {
            await axios.delete(`/api/lotes/${lote.id}/documentos/${doc.key}`);
            if (onChanged) onChanged();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo borrar el documento.');
        }
    };

    // Fase 1 — al subir la solicitud, el paso siguiente es SIEMPRE generar el Anexo I.
    const subirSolicitud = async (file) => {
        const r = await subir('solicitud_verificacion', file);
        if (!r?.documento) return;
        const seguir = await showConfirm(
            'Solicitud de verificación guardada en el lote.\n\n¿Generamos ahora el Anexo I y las fichas RES para mandárselos al Sujeto Obligado? La solicitud irá ya incluida.',
            'Solicitud subida', 'success'
        );
        if (seguir && acciones.abrirAnexo) acciones.abrirAnexo();
    };

    // Fase 3 — al subir la oferta, el paso siguiente es mandarla al S.O. a firmar.
    const subirOferta = async (file) => {
        const r = await subir('oferta_verificacion', file);
        if (!r?.documento) return;
        const enviar = await showConfirm(
            'La oferta de verificación ya está guardada en la carpeta del lote.\n\n¿La enviamos ahora al Sujeto Obligado para que la firme?'
            // Con varios lotes en marcha, mandarlas de una en una son cuatro correos
            // iguales el mismo día — la forma de que no conteste a ninguno. Se dice
            // aquí, que es donde se está decidiendo, y no en una ayuda que nadie abre.
            + '\n\nCon varios lotes en marcha se mandan todas en un solo correo desde el resumen de'
            + ' Lotes: \u201c\u2709 Pedir la firma de las ofertas\u201d.',
            'Oferta subida', 'success',
            // Las palabras de la DECISIÓN, no "Aceptar / Cancelar": aquí *Cancelar*
            // se lee como deshacer la subida —que es justo lo que no hace— y quien
            // quería mandarlas juntas no encontraba dónde decir que no.
            { confirmar: '✉ Enviarla ahora al S.O.', cancelar: 'Ahora no · las mando juntas' }
        );
        if (enviar) setDocAEnviar(r.documento);
    };

    // Fase 4 — la factura del verificador trae su importe, y el importe SE LEE.
    //
    // Antes había que teclearlo en un campo antes de soltar el PDF, y si se te
    // olvidaba (que es lo normal: sueltas el fichero y ya está) la factura
    // quedaba guardada sin importe y el resumen seguía sin saber lo que le cuesta
    // la verificación al S.O. Ahora el backend lo lee de la propia factura —su
    // BASE IMPONIBLE— y lo escribe también en el coste de verificación del lote,
    // que es de donde sale el €/MWh. El campo sigue estando para forzarlo a mano.
    const subirFacturaVerificador = async (file) => {
        const imp = Number(String(importeFactura).replace(',', '.'));
        // El overlay se abre ANTES de la petición: la lectura tarda unos segundos y
        // sin señal el usuario cree que no ha pasado nada y vuelve a soltar el PDF.
        const leemos = !(Number.isFinite(imp) && imp > 0);
        if (leemos) setLectura({ phase: 'sending', sendingTitle: 'Leyendo la factura…', subtitle: 'Su importe y a qué lote corresponde' });
        const r = await subir('factura_verificador', file, leemos ? {} : { importe: imp });
        if (!r?.documento) { setLectura(null); return; }
        const doc = r.documento;
        setImporteFactura('');
        if (!(doc.importe > 0)) {
            setLectura({
                phase: 'done', ok: false, errorTitle: 'Sin importe',
                errorText: (r.ocr?.leido === false
                    ? `La factura está guardada, pero no se ha podido leer su importe (${r.ocr.error || 'error de lectura'}).`
                    : 'La factura está guardada, pero no se ha podido leer ningún importe en ella.')
                    + ' Escríbelo en el campo "Importe €" y vuelve a subirla: sin él no se puede calcular a cuánto le sale el €/MWh al Sujeto Obligado.',
            });
        } else if (r.ocr?.leido) {
            // Lo leído se enseña con su número de factura para poder cotejarlo de un
            // vistazo, y con los avisos de que la factura no sea de este lote.
            setLectura({
                phase: 'done', ok: !r.ocr.avisos?.length,
                okTitle: 'Importe leído', errorTitle: 'Revisa la factura',
                subtitle: `Factura ${doc.numero_factura || 'del verificador'}${doc.fecha_factura ? ` · ${doc.fecha_factura}` : ''}`,
                items: [
                    `Base imponible ${Number(doc.importe).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`,
                    ...(r.ocr.total ? [`Total con IVA ${Number(r.ocr.total).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`] : []),
                    'Registrado como coste de verificación del lote',
                ],
                errorText: r.ocr.avisos?.length ? r.ocr.avisos.join(' · ') : null,
            });
        } else setLectura(null);
        // El verificador se la emite AL S.O., así que se la remitimos nosotros.
        const enviar = await showConfirm(
            'Factura del verificador guardada en el lote.\n\n¿Se la enviamos por email al Sujeto Obligado? Es a él a quien se la emite el verificador.',
            'Factura subida', 'success'
        );
        if (enviar) setDocAEnviar(r.documento);
    };

    // ── Fase 4 · el informe de verificación trae el AHORRO VERIFICADO ─────────
    // Es el número sobre el que se factura al S.O. y sobre el que se le paga al
    // cliente. Se lee al subirlo y se abre la revisión: nada se escribe solo.
    const subirInforme = async (file) => {
        setLectura({
            phase: 'sending', sendingTitle: 'Analizando el informe…',
            subtitle: 'Leyendo el ahorro y la inversión de cada actuación',
        });
        const r = await subir('informe_verificacion', file);
        if (!r?.documento) { setLectura(null); return; }
        if (r.ahorros?.leido) {
            // Del overlay se pasa DIRECTO a la revisión: enseñar un "listo" que hay
            // que cerrar para que aparezca otra pantalla es un clic de peaje.
            setLectura(null);
            setModoRevision('informe');
            setPropuestaAhorros(r.ahorros);
        } else {
            setLectura({
                phase: 'done', ok: false, errorTitle: 'No se ha podido leer',
                subtitle: 'El informe está guardado en el lote',
                errorText: `No se han podido leer los ahorros verificados${r.ahorros?.error ? ` (${r.ahorros.error})` : ''}. `
                    + 'Puedes volver a intentarlo con "Leer los ahorros del informe", o escribirlos a mano en cada expediente.',
            });
        }
    };

    // Releer el informe que YA está subido: los lotes anteriores a esto lo tienen
    // guardado y nunca se leyó, y siempre se puede querer volver a mirarlo.
    const releerInforme = async () => {
        setError('');
        setLeyendoInforme(true);
        setLectura({
            phase: 'sending', sendingTitle: 'Analizando el informe…',
            subtitle: 'Leyendo el ahorro y la inversión de cada actuación',
        });
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/ahorros-verificados/leer`);
            setLectura(null);
            setModoRevision('informe');
            setPropuestaAhorros(data);
        } catch (err) {
            setLectura({
                phase: 'done', ok: false, errorTitle: 'No se ha podido leer',
                errorText: err.response?.data?.error || 'No se pudo leer el informe de verificación.',
            });
        } finally {
            setLeyendoInforme(false);
        }
    };

    // ── Fase 5 · el CERTIFICADO CAE trae el rango de códigos emitidos ─────────
    // Con él se hace la factura de Brokergy al S.O.: se lee al subirlo y la
    // factura los trae ya puestos.
    const subirCertificadoCae = async (file) => {
        setLectura({
            phase: 'sending', sendingTitle: 'Leyendo el certificado CAE…',
            subtitle: 'El rango de códigos emitidos y cuántos son',
        });
        const r = await subir('certificado_cae', file);
        if (!r?.documento) { setLectura(null); return; }
        const c = r.cae?.cae;
        const abrirFactura = (canSeeMargin && acciones.abrirFactura && lote?.sujeto_obligado_id)
            ? { etiqueta: 'Hacer la factura al S.O.', onClick: () => { setLectura(null); acciones.abrirFactura(); } }
            : null;
        if (r.cae?.leido && c) {
            setLectura({
                phase: 'done', ok: !c.avisos?.length,
                okTitle: 'CAE emitidos', errorTitle: 'Revisa los códigos',
                subtitle: [c.titular, c.fecha_resolucion].filter(Boolean).join(' · ') || 'Certificado guardado en el lote',
                items: [
                    `Desde ${c.cae_inicial}`,
                    `Hasta ${c.cae_final}`,
                    ...(c.total ? [`${Number(c.total).toLocaleString('es-ES')} CAE emitidos`] : []),
                    { texto: 'Se usarán en la factura de Brokergy al S.O.', tono: 'info' },
                ],
                errorText: c.avisos?.length ? c.avisos.join(' · ') : null,
                accion: abrirFactura,
            });
        } else {
            setLectura({
                phase: 'done', ok: false, errorTitle: 'No se han podido leer los códigos',
                subtitle: 'El certificado está guardado en el lote',
                errorText: `No se ha podido leer el rango de códigos${r.cae?.error ? ` (${r.cae.error})` : ''}. `
                    + 'Al abrir la factura se puede volver a intentar, o escribirlos a mano.',
                accion: abrirFactura,
            });
        }
    };

    // ── Fase 4 · el DICTAMEN trae los datos DEFINITIVOS ───────────────────────
    // Su nº y su fecha identifican la verificación de cara al futuro, y su tabla
    // fija la inversión que manda sobre la declarada al principio: en un
    // requerimiento puede haberse corregido.
    const subirDictamen = async (file) => {
        setLectura({
            phase: 'sending', sendingTitle: 'Analizando el dictamen…',
            subtitle: 'Leyendo su número, su fecha y las cifras definitivas',
        });
        const r = await subir('dictamen_favorable', file);
        if (!r?.documento) { setLectura(null); return; }
        if (r.dictamen?.leido) {
            const d = r.dictamen.dictamen || {};
            // Lo normal es que el dictamen repita las cifras del informe, que ya se
            // registraron al subirlo. Entonces no hay nada que revisar: se sella su
            // nº y su fecha (lo hace el backend) y se dice que cuadra. Abrir una
            // pantalla para confirmar lo que ya consta es un paso de más.
            if (r.dictamen.sinCambios) {
                setLectura({
                    phase: 'done', ok: true, okTitle: 'Dictamen registrado',
                    subtitle: [d.numero_dictamen, d.fecha_emision].filter(Boolean).join(' · '),
                    items: [
                        ...(d.total_kwh != null ? [`Ahorro dictaminado ${Number(d.total_kwh).toLocaleString('es-ES')} kWh`] : []),
                        'Sus cifras coinciden con las de los expedientes',
                        'No hay nada que revisar',
                    ],
                });
            } else {
                setLectura(null);
                setModoRevision('dictamen');
                setPropuestaAhorros(r.dictamen);
            }
        } else {
            setLectura({
                phase: 'done', ok: false, errorTitle: 'No se ha podido leer',
                subtitle: 'El dictamen está guardado en el lote',
                errorText: `No se ha podido leer${r.dictamen?.error ? ` (${r.dictamen.error})` : ''}. `
                    + 'Puedes volver a intentarlo con "Leer el dictamen".',
            });
        }
    };

    const releerDictamen = async () => {
        setError('');
        setLeyendoDictamen(true);
        setLectura({
            phase: 'sending', sendingTitle: 'Analizando el dictamen…',
            subtitle: 'Leyendo su número, su fecha y las cifras definitivas',
        });
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/dictamen/leer`);
            // Al releerlo a mano SÍ se enseña siempre: se ha pedido verlo.
            setLectura(null);
            setModoRevision('dictamen');
            setPropuestaAhorros(data);
        } catch (err) {
            setLectura({
                phase: 'done', ok: false, errorTitle: 'No se ha podido leer',
                errorText: err.response?.data?.error || 'No se pudo leer el dictamen.',
            });
        } finally {
            setLeyendoDictamen(false);
        }
    };

    // ── Fase 5 · el papeleo que se sube al MITECO ─────────────────────────────
    // Dos cosas de un solo gesto: el ANEXO de cada expediente —el impreso que va
    // dentro de su ZIP "ActuacionE{n}"— y la SOLICITUD DE EMISIÓN, que es la
    // carátula del envío y va una por lote. Se generan JUNTOS porque salen de los
    // mismos datos y tienen que casar entre sí: la fila E3 de la solicitud es el
    // expediente cuyo anexo se llama AnexoE3. Los dos rellenan el formulario
    // OFICIAL, no una copia.
    // ── El PAQUETE de cada actuación: renombrar a "E{n}-…" y zipear ──────────
    // Dos gestos, y el primero es COMPROBAR. Generar sin mirar deja un paquete
    // incompleto que se presenta igual de bien que uno completo, y el requerimiento
    // llega tres semanas después; por eso se enseña primero qué falta y en qué
    // expediente, y solo entonces se ofrece generar.
    const [paquete, setPaquete] = useState(null);   // informe del último dryRun
    const [modoPaquete, setModoPaquete] = useState('expediente');
    // Qué modos se han GENERADO ya en esta sesión: `{ expediente: 3, gestor: 0 }`.
    // Con esto el botón deja de invitar a generar lo que acaba de generarse y pasa a
    // decir "volver a generar" —preguntando—, en vez de rehacer 120 MB en silencio
    // porque el botón siguiera ahí igual que antes.
    const [generado, setGenerado] = useState({});
    // La cancelación va por REF, no por estado: el bucle es una función que corre
    // fuera del render y leería el valor del render en que arrancó.
    const cancelarRef = useRef(false);
    const [cancelPedida, setCancelPedida] = useState(false);

    const pedirPaquete = async (modo, dryRun = true) => {
        setError('');
        setModoPaquete(modo);
        setLectura({
            phase: 'sending',
            sendingTitle: 'Comprobando el paquete…',
            subtitle: 'Buscando los documentos de cada actuación',
            icon: 'read',
        });
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/paquete-actuaciones`, { modo, dryRun });
            setPaquete(data);
            // Comprobar de nuevo es volver a mirar cómo está el expediente, así que a
            // partir de aquí generar ya no es "otra vez": es generar lo comprobado.
            setGenerado(g => ({ ...g, [modo]: 0 }));
            const completas = data.actuaciones.filter(a => a.ok);
            const listas = completas.length;
            // La comprobación ya no es del todo "en seco": si un hueco de ficha
            // técnica se puede resolver desde el catálogo, se resuelve aquí — es
            // idempotente y es lo mismo que haría abrir el certificado. Decirlo
            // importa, porque el subtítulo prometía que no se tocaba nada.
            const enlazadas = data.actuaciones.some(a => (a.avisos_ficha || []).some(t => /copiada|se ha enlazado/.test(t)));
            setLectura({
                phase: 'done',
                ok: completas.length > 0 && !data.bloqueados.length,
                okTitle: data.bloqueados.length ? 'Faltan documentos' : `${completas.length} actuaciones listas`,
                errorTitle: completas.length ? 'Faltan documentos' : 'No se puede armar ningún paquete',
                subtitle: enlazadas
                    ? 'No se ha armado ningún ZIP · solo se han enlazado fichas técnicas que faltaban'
                    : 'Nada se ha escrito todavía en Drive',
                items: [
                    ...completas.map(a => ({
                        texto: `E${a.n} · ${a.numero_expediente} — ${a.n_ficheros} documentos`,
                    })),
                    // Lo de las fichas técnicas se dice de TODAS las actuaciones, no
                    // solo de las completas: cuando bloquea es justo cuando hace falta
                    // saber POR QUÉ, y el motivo siempre es el mismo —el modelo no
                    // está elegido del catálogo, o está sin ficha—.
                    ...agruparPorMensaje(data.actuaciones, a => a.avisos_ficha || [], data.actuaciones.length)
                        .map(g => ({ texto: g.texto, tono: 'aviso' })),
                    // Lo que la app no tiene APUNTADO se dice aunque el paquete salga:
                    // hoy funciona porque alguien dejó una copia en la carpeta, y el
                    // lote que viene detrás no la va a tener.
                    ...agruparPorMensaje(completas, a => a.piezas
                        .filter(x => x.estado === 'manual' || x.estado === 'drive')
                        .map(x => `${x.etiqueta}: sale de un fichero suelto en Drive, no consta en el expediente`), listas)
                        .map(g => ({ texto: g.texto, tono: 'aviso' })),
                    ...agruparPorMensaje(completas, a => a.faltan_leves.map(f => `Sin ${f} — no bloquea`), listas)
                        .map(g => ({ texto: g.texto, tono: 'aviso' })),
                    // Lo que no procede se DICE con el motivo —un documento del índice
                    // que desaparece sin explicación se lee como un olvido— pero en
                    // GRIS y en una sola línea: no es un hallazgo, es lo esperado.
                    ...agruparPorMensaje(completas, a => a.no_proceden || [], listas)
                        .map(g => ({ texto: g.texto, tono: 'info' })),
                ],
                // El paso siguiente obvio va EN el popup. Comprobar y generar son dos
                // gestos a propósito (regla 40), pero eso no obliga a cerrar y volver
                // a buscar el botón en la pantalla de detrás.
                accion: listas > 0 ? {
                    etiqueta: `📦 Generar ${listas} ZIP${modo === 'gestor' ? ' para el gestor' : ' en los expedientes'}`,
                    // Tras generar, el popup se sustituye por el del resultado, así que
                    // aquí no hace falta la variante de "volver a generar".
                    // La lista de actuaciones viaja EN el closure, no se lee del
                    // estado: `setPaquete` acaba de llamarse y el `paquete` de este
                    // render sigue siendo el anterior.
                    onClick: () => generarPaquete(modo, completas),
                } : null,
                errorText: data.bloqueados.length ? data.bloqueados.join('\n') : null,
            });
        } catch (err) {
            setLectura({
                phase: 'done', ok: false, errorTitle: 'No se pudo comprobar el paquete',
                errorText: err.response?.data?.error || 'La comprobación no llegó a terminar.',
            });
        }
    };

    // ── Generar: UNA petición por actuación ──────────────────────────────────
    // Las cinco de un tirón son varios minutos (≈18 ficheros por actuación que se
    // bajan de Drive, se copian con su nombre del índice y se comprimen) y eso NO
    // cabe en los 120 s del proxy: la respuesta se cortaba y la pantalla decía "no
    // se pudo preparar el paquete" mientras el servidor seguía escribiendo los ZIP
    // y los terminaba — daba por fallido un trabajo hecho, que es el peor error que
    // puede cometer una pantalla. De una en una, cada petición dura lo que dura su
    // actuación, se puede decir por dónde va, y si una se cae las demás quedan.
    // Un clic que no hace NADA es el peor final posible: no se distingue de un botón
    // roto y lleva a pulsar otra vez, que aquí significa rehacer 120 MB. Cualquier
    // cosa que reviente dentro sale en el overlay con su mensaje.
    const generarPaquete = (modo, actuaciones) => generarPaqueteInterno(modo, actuaciones).catch(err => {
        console.error('[paquete] generar:', err);
        setLectura({
            phase: 'done', ok: false,
            errorTitle: 'No se pudo arrancar la generación',
            errorText: err?.message || String(err),
        });
    });

    const generarPaqueteInterno = async (modo, actuaciones) => {
        const cola = (actuaciones || []).filter(a => a && a.ok);
        if (!cola.length) return;

        // Volver a generar NO se hace en silencio: son ~120 MB que se rehacen y unos
        // minutos de espera, y el botón se queda igual que antes de haber generado.
        // Si ya se generó en esta sesión, se pregunta.
        //
        // ⚠️ DOS COSAS QUE DEJABAN EL BOTÓN MUDO (medido el 10/09/2026, "le doy a
        // generar y no hace nada"):
        //
        //  1. El texto interpolaba una variable NL que no existe en este módulo:
        //     evaluarlo lanzaba un ReferenceError DENTRO de un `async` cuya promesa
        //     nadie escucha, así que el clic no hacía absolutamente nada — ni
        //     preguntaba, ni generaba, ni daba error. Los saltos de línea van
        //     literales.
        //  2. El popup de confirmación lo pinta `ModalContext` DENTRO de `#root`,
        //     mientras que `SendActionOverlay` se portalea a `document.body` (regla
        //     29.b). Como el portal es hermano posterior de `#root`, tapa la
        //     confirmación por mucho z-index que ésta lleve: se quedaba esperando un
        //     "sí" a una pregunta invisible. Por eso el overlay se RETIRA antes de
        //     preguntar y se REPONE si la respuesta es que no — quien venía de
        //     comprobar no pierde el informe que estaba leyendo.
        if (generado[modo]) {
            const informe = lectura;
            setLectura(null);
            const otraVez = await showConfirm(
                `Este paquete ya se generó hace un momento (${generado[modo]} actuaciones).\n\n`
                + 'Volver a generarlo rehace las carpetas E{n} y sus ZIP con lo que haya AHORA en el expediente.'
                + ' Tarda unos minutos y no aporta nada si no has cambiado ningún documento desde entonces.',
                'Volver a generar el paquete', 'warning',
                { confirmar: '↻ Sí, volver a generarlo', cancelar: 'No, déjalo como está' });
            if (!otraVez) { setLectura(informe); return; }
        }

        setError('');
        setModoPaquete(modo);
        cancelarRef.current = false;
        setCancelPedida(false);
        const hechas = [];
        const fallidas = [];
        let destino = '';
        let cancelado = false;
        const pedirCancelar = () => { cancelarRef.current = true; setCancelPedida(true); };
        for (let i = 0; i < cola.length; i++) {
            // Se comprueba ENTRE actuaciones: lo que ya está pedido al servidor sigue
            // su curso —cortarlo dejaría una carpeta a medio copiar—, así que la
            // cancelación surte efecto al acabar la que esté en marcha. El botón lo
            // dice para no prometer un corte inmediato que no existe.
            if (cancelarRef.current) { cancelado = true; break; }
            const a = cola[i];
            setLectura({
                phase: 'sending',
                sendingTitle: `Renombrando y comprimiendo… ${i + 1} de ${cola.length}`,
                subtitle: `E${a.n} · ${a.numero_expediente}`,
                icon: 'upload',
                cancelar: {
                    etiqueta: 'Parar aquí',
                    aviso: 'Se para al terminar esta actuación. Las ya generadas se quedan.',
                    onClick: pedirCancelar,
                },
            });
            try {
                const { data } = await axios.post(`/api/lotes/${lote.id}/paquete-actuaciones`,
                    { modo, dryRun: false, soloActuacion: a.n });
                destino = data.destino?.nombre || destino;
                const r = (data.actuaciones || [])[0];
                if (r && r.ok) hechas.push(r);
                else fallidas.push(`E${a.n} · ${a.numero_expediente}: ${(data.bloqueados || []).join(' · ') || 'no se pudo armar'}`);
            } catch (err) {
                fallidas.push(`E${a.n} · ${a.numero_expediente}: ${err.response?.data?.error
                    || 'la petición no llegó a terminar — mira su carpeta en Drive antes de repetirla'}`);
            }
        }
        const quedan = cola.slice(hechas.length + fallidas.length);
        // El botón solo pasa a "volver a generar" si la tanda salió ENTERA. Tras un
        // parón o un fallo, lo que hay que hacer es terminar el trabajo, y ahí el
        // botón tiene que seguir invitando a generar sin preguntar nada — rehacer una
        // actuación que ya está es idempotente y cuesta un minuto; quedarse a medias
        // porque el botón pide confirmación es peor.
        if (!cancelado && !fallidas.length && hechas.length) {
            setGenerado(g => ({ ...g, [modo]: hechas.length }));
        }
        setCancelPedida(false);
        setLectura({
            phase: 'done',
            ok: hechas.length > 0,
            okTitle: cancelado
                ? `Parado · ${hechas.length} de ${cola.length} generados`
                : (fallidas.length
                    ? `${hechas.length} de ${cola.length} paquetes generados`
                    : `${hechas.length} paquetes generados`),
            errorTitle: cancelado ? 'Parado antes de generar nada' : 'No se pudo generar ningún paquete',
            subtitle: `${lote?.codigo} · ${destino}`,
            items: [
                ...hechas.map(r => ({
                    texto: `E${r.n} · ${r.numero_expediente} — ${r.n_ficheros} documentos`
                        + (r.zip ? ` → ${r.zip.nombre}` : ''),
                })),
                // Lo que ha fallado va EN la lista y en ámbar, no escondido en el
                // texto de error: aquí lo demás SÍ se ha generado.
                ...fallidas.map(t => ({ texto: t, tono: 'aviso' })),
                // Y lo que se quedó sin hacer al parar, en gris: sin esto, "parado" no
                // dice QUÉ falta y hay que ir a Drive a contarlo.
                ...(quedan.length ? [{
                    texto: `Sin generar: ${quedan.map(a => `E${a.n}`).join(', ')} — vuelve a darle para hacerlas`,
                    tono: 'info',
                }] : []),
            ],
            errorText: hechas.length ? null : fallidas.join('\n'),
        });
        if (onChanged) onChanged();
    };

    const generarAnexos = async () => {
        setError('');
        setGenerandoAnexos(true);
        setLectura({
            phase: 'sending', sendingTitle: 'Generando el papeleo del MITECO…',
            subtitle: 'La solicitud de emisión y un anexo por expediente',
        });
        try {
            const { data } = await axios.post(`/api/lotes/${lote.id}/anexos-actuacion`);
            const n = data.generados?.length || 0;
            const mal = data.incompletos || [];
            const sol = data.solicitud;
            setLectura({
                phase: 'done', ok: n > 0 && !mal.length,
                okTitle: sol ? 'Solicitud y anexos generados' : 'Anexos generados',
                errorTitle: mal.length ? 'Faltan datos' : 'No se generó ninguno',
                // Dónde ha quedado cada cosa: la solicitud en la documentación del
                // lote y cada anexo en la carpeta "E{n}" de SU expediente, junto al
                // resto de adjuntos de esa actuación.
                subtitle: `${lote?.codigo} · la solicitud en la documentación del lote, cada anexo en su carpeta E{n}`,
                items: [
                    ...(sol ? [`Solicitud de emisión · ${sol.n_actuaciones} actuaciones · ${Number(sol.ahorro_total).toLocaleString('es-ES')} kWh`] : []),
                    ...(data.generados?.map(g => `E${g.n_actuacion} · ${g.numero_expediente} (${g.ficha})`) || []),
                ],
                // Lo que falta se dice por expediente y con nombre: es lo que hay
                // que ir a rellenar, y un "faltan datos" a secas no lleva a ninguna
                // parte. Si la carátula no ha salido, se dice por qué aunque los
                // anexos sí estén: sin ella no se puede presentar nada.
                errorText: [
                    mal.length ? mal.map(m => `${m.numero_expediente}: falta ${m.faltan.join(', ')}`).join(' · ') : null,
                    data.solicitud_error ? `Solicitud de emisión: ${data.solicitud_error}` : null,
                ].filter(Boolean).join('  ·  ') || null,
            });
            if (onChanged) onChanged();
        } catch (err) {
            setLectura({
                phase: 'done', ok: false, errorTitle: 'No se pudieron generar',
                errorText: err.response?.data?.error || 'Error al generar los anexos de actuación.',
            });
        } finally {
            setGenerandoAnexos(false);
        }
    };

    // ── Subir a un slot, sea desde su hueco o para sustituirlo ───────────────
    // Cada documento con lectura propia (solicitud, oferta, informe, dictamen,
    // factura, certificado CAE) entra por SU función, que lee el PDF y propone el
    // paso siguiente; el resto, por la subida genérica.
    const SUBIDA_PROPIA = {
        solicitud_verificacion: subirSolicitud,
        oferta_verificacion: subirOferta,
        informe_verificacion: subirInforme,
        dictamen_favorable: subirDictamen,
        factura_verificador: subirFacturaVerificador,
        certificado_cae: subirCertificadoCae,
    };
    const subirSlot = (slot, file) => (SUBIDA_PROPIA[slot] || ((f) => subir(slot, f)))(file);

    // Sustituir un documento que ya salió (o volvió firmado) empieza de cero: el
    // backend reescribe la entrada sin envío ni firmado. Se pregunta antes.
    async function reemplazar(d, file) {
        if (d.sent_at || d.signed_link) {
            const ok = await showConfirm(
                `"${d.label || d.file_name}" ya se ${d.signed_link ? 'envió y volvió firmado' : 'envió'}.\n\n`
                + 'Al sustituirlo por otro PDF empieza de cero: se pierde el registro del envío'
                + (d.signed_link ? ' y el firmado' : '') + '.',
                'Sustituir documento', 'warning');
            if (!ok) return;
        }
        subirSlot(d.tipo, file);
    }

    // Texto del botón mientras se sube: los que se LEEN tardan más y lo dicen.
    const TEXTO_SUBIENDO = {
        informe_verificacion: 'Leyendo…', dictamen_favorable: 'Leyendo…',
        factura_verificador: 'Leyendo…', certificado_cae: 'Leyendo…',
    };

    // Un documento ESPERADO: su fila si está, su hueco si falta. Se llama como
    // función y no como <Componente/>: definido aquí dentro, React lo tomaría por
    // un componente nuevo en cada render y desmontaría lo que lleva dentro (el
    // campo del importe perdía el foco a cada tecla).
    const docEsperado = ({ slot, doc, hint = null, requerido = false, opcional = false, siguiente = false,
        extra = null, accionesDoc = null, enHueco = null, label = null }) => (
        doc
            ? <Fila key={doc.key} doc={doc} {...propsFila(doc)} acciones={accionesDoc}>{extra}</Fila>
            : (
                <Hueco key={`hueco_${slot}`} label={label || SLOTS[slot]?.label || slot} hint={hint}
                    requerido={requerido} opcional={opcional} siguiente={siguiente}
                    ocupado={subiendo === slot} textoOcupado={TEXTO_SUBIENDO[slot] || 'Subiendo…'}
                    arrastrando={arrastrando} onFile={(f) => subirSlot(slot, f)}>
                    {enHueco}
                </Hueco>
            )
    );

    // ── Una fase ──────────────────────────────────────────────────────────────
    // Dos zonas, y no se mezclan:
    //   · QUÉ HACER — lo que se pulsa para avanzar el trámite (generar, comprobar,
    //     mandar a firmar). Botones llenos.
    //   · DOCUMENTOS — los papeles que la fase espera, estén o no. Lo que se hace
    //     CON un documento (verlo, sustituirlo, subir su firmado, darle el OK,
    //     marcarlo pagado, releerlo) va en SU fila.
    //
    // Las fases YA HECHAS van PLEGADAS a una línea; plegada sigue diciendo lo suyo
    // (cuántos documentos, si falta alguno, si hay algo por revisar). El plegado es
    // solo VISUAL: los lotes viejos traen firmados de fuera y hay que llegar a ellos.
    //
    // Se llama como función (no <Fase/>) por lo mismo que `docEsperado`.
    const faseBloque = ({ f, pendiente = false, soltar = null, pista = null, tareas = null,
        docs = null, nota = null, faltan = 0 }) => {
        const esActual = p.faseActual === f.n;
        const bloqueada = !!f.bloqueo && !f.hecha;
        const porRevisar = (f.docs || []).filter(d => d?.signed_link && !d?.validado_at).length;
        // Abierta si es la actual, si no está hecha, o si le queda algo PENDIENTE
        // aunque el papeleo esté completo (fase 4: el ahorro verificado o la factura
        // del verificador). Un firmado "por revisar" NO la abre: se anuncia plegada.
        const abierta = fasesAbiertas[f.n] !== undefined
            ? fasesAbiertas[f.n]
            : (esActual || !f.hecha || pendiente);
        // La fase ENTERA recibe los firmados (también plegada). Las filas-hueco
        // capturan su propia suelta antes que ella.
        const dnd = soltar ? {
            onDragOver: (e) => { e.preventDefault(); e.currentTarget.classList.add(...RESALTE); },
            onDragLeave: (e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove(...RESALTE);
            },
            onDrop: (e) => {
                e.preventDefault();
                e.currentTarget.classList.remove(...RESALTE);
                const fs = pdfsDe(e.dataTransfer?.files);
                if (fs.length) soltar(fs);
            },
        } : {};
        const tareasVisibles = (tareas || []).filter(Boolean);
        const docsVisibles = (docs || []).filter(Boolean);
        return (
            <div key={`fase_${f.n}`} {...dnd} className={`rounded-2xl border transition-all ${abierta ? 'p-4' : 'px-4 py-2.5'} ${
                soltar && arrastrando ? 'border-dashed border-brand/45 bg-brand/[0.05]'
                    : f.hecha ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                        : esActual ? 'border-brand/30 bg-brand/[0.04]'
                            : 'border-white/[0.06] bg-white/[0.01]'}`}>
                <button type="button"
                    onClick={() => setFasesAbiertas(prev => ({ ...prev, [f.n]: !abierta }))}
                    className={`w-full flex items-center gap-2.5 text-left ${abierta ? 'mb-3' : ''}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                        f.hecha ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : esActual ? 'bg-brand/15 text-brand border border-brand/40'
                                : 'bg-white/[0.04] text-white/25 border border-white/10'}`}>
                        {f.hecha ? '✓' : f.n}
                    </span>
                    <p className={`text-[11px] font-black uppercase tracking-[0.15em] flex-1 min-w-0 truncate ${
                        f.hecha ? 'text-emerald-400/80' : esActual ? 'text-white' : 'text-white/35'}`}>
                        {f.titulo}
                    </p>
                    {porRevisar > 0 && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-cyan-300 shrink-0">
                            {porRevisar} por revisar
                        </span>
                    )}
                    {!abierta && faltan > 0 && !bloqueada && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-amber-400/80 shrink-0">
                            falta{faltan > 1 ? 'n' : ''} {faltan}
                        </span>
                    )}
                    {!abierta && (f.docs || []).length > 0 && (
                        <span className="text-[9px] text-white/25 shrink-0">{f.docs.length} doc.</span>
                    )}
                    {soltar && arrastrando && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-brand shrink-0">suelta aquí</span>
                    )}
                    {esActual && !(soltar && arrastrando) && <span className="text-[9px] font-black uppercase tracking-wider text-brand shrink-0">← ahora</span>}
                    {bloqueada && (
                        <svg className="w-3.5 h-3.5 text-white/20 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    )}
                    <svg className={`w-3.5 h-3.5 text-white/25 shrink-0 transition-transform ${abierta ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {!abierta ? null : (
                <div className="space-y-3 pl-8">
                    {/* El aviso de "aún no toca" NO impide actuar: los lotes de antes
                        de la app traen documentos de fuera y hay que poder
                        registrarlos igual. Se avisa, no se bloquea. */}
                    {bloqueada && <p className="text-[10px] text-white/30 italic">{f.bloqueo}</p>}
                    {tareasVisibles.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Qué hacer</p>
                            <div className="flex items-center gap-2 flex-wrap">{tareasVisibles}</div>
                        </div>
                    )}
                    {docsVisibles.length > 0 && (
                        <div className="space-y-1.5">
                            <p className="text-[8px] font-black uppercase tracking-[0.2em] text-white/25">Documentos</p>
                            {docsVisibles}
                        </div>
                    )}
                    {nota}
                    {soltar && pista && (
                        <PistaSuelta arrastrando={arrastrando} texto={pista} onFiles={soltar} />
                    )}
                </div>
                )}
            </div>
        );
    };

    const [f1, f2, f3, f4, f5, f6, f7] = p.fases;
    const nExps = (lote?.expedientes || []).length;
    const api = lote?.verificacion_api || null;
    // El primer documento que falta de la fase EN CURSO se marca en ámbar: es lo
    // que hay que traer ahora. Esperados: [slot, doc, requerido].
    const siguienteDe = (f, lista) => (p.faseActual === f.n ? lista.find(([, doc, req]) => req && !doc)?.[0] : null);
    const faltanDe = (lista) => lista.filter(([, doc, req]) => req && !doc).length;
    const esp4 = [
        ['informe_verificacion', p.informeVerificacion, true],
        ['dictamen_favorable', p.dictamen, true],
        ...(canSeeMargin ? [['factura_verificador', p.facturaVerificador, true]] : []),
    ];
    const esp5 = [
        ['justificante_miteco', p.justificanteMiteco, true],
        ['certificado_cae', p.certificadoCae, true],
    ];
    const sig4 = siguienteDe(f4, esp4);
    const sig5 = siguienteDe(f5, esp5);

    // "Comprobar → Generar ZIP" del paquete de actuaciones: sale en la fase 3 (para
    // beCAE) y en la 5 (para el MITECO). Es el mismo gesto. `modo` null = el último
    // que se comprobó.
    const generarZip = (modo, sufijo) => {
        if (!(paquete && paquete.dryRun && (modo == null || paquete.modo === modo)
            && paquete.actuaciones.some(a => a.ok))) return null;
        const m = modo || modoPaquete;
        const listas = paquete.actuaciones.filter(a => a.ok);
        return (
            <BotonAccion key={`zip_${m}`} tono={generado[m] ? 'brand' : 'amber'}
                onClick={() => generarPaquete(m, listas)}>
                {generado[m] ? `↻ Volver a generar los ${generado[m]} ZIP` : `📦 Generar ${listas.length} ZIP${sufijo}`}
            </BotonAccion>
        );
    };

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between">
                <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Proceso del lote</p>
                {lote?.drive_folder_id && (
                    <div className="flex items-center gap-2">
                        <BotonCarpetaLocal loteId={lote.id} compacto onError={setError} />
                        <a href={`https://drive.google.com/drive/folders/${lote.drive_folder_id}`} target="_blank" rel="noopener noreferrer"
                            className="text-[9px] font-black uppercase tracking-widest text-brand/70 hover:text-brand transition-colors">
                            Abrir carpeta Drive →
                        </a>
                    </div>
                )}
            </div>

            {/* 1 · Solicitud al verificador.
                Lo que se archiva aquí es el BORRADOR: la firma el S.O. en el paso 2,
                junto al Anexo I. La FIRMADA vuelve con las demás y se suelta igual
                (misma comprobación de firma, mismo `_fdo`): el destino lo decide el
                nombre del PDF, no el sitio donde se soltó. */}
            {faseBloque({
                f: f1,
                // Mientras no esté la del verificador, lo que se suelta aquí ES esa
                // solicitud; ya subida, lo que vuelve es la firmada por el S.O.
                soltar: !p.solicitudOk
                    ? (fs) => subirSolicitud(fs[0])
                    : (!p.solicitud.signed_link ? setFirmadosSueltos : null),
                pista: !p.solicitudOk
                    ? 'Arrastra aquí la solicitud descargada de la web del verificador'
                    : 'Arrastra aquí la solicitud que devuelva firmada el S.O.',
                faltan: p.solicitudOk ? 0 : 1,
                tareas: [
                    <BotonAccion key="sol" onClick={acciones.abrirSolicitud} disabled={!nExps}
                        title={!nExps ? 'El lote no tiene expedientes' : 'Genera el formulario de solicitud'}>
                        {p.solicitud || api ? '↻ Volver a generar la solicitud' : '📄 Generar la solicitud'}
                    </BotonAccion>,
                ],
                docs: [
                    docEsperado({
                        slot: 'solicitud_verificacion', doc: p.solicitud, requerido: true,
                        siguiente: p.faseActual === 1,
                        label: 'Solicitud de Verificación (descargada del verificador)',
                        hint: 'Créala en el verificador, descárgala de su web y súbela aquí. La firma el S.O. en el paso 2. La que genera la app no vale.',
                        // La que compuso la app se queda como referencia, pero NO
                        // sirve para mandar a firmar: se dice en su fila y se pide la
                        // buena en el mismo sitio.
                        accionesDoc: p.solicitud && !p.solicitudOk ? (
                            <>
                                <span className="text-[10px] text-amber-300/90 font-bold">
                                    ⚠ Esta es la que generó la app y no vale para el S.O.
                                </span>
                                <BotonSubir disabled={subiendo === 'solicitud_verificacion'} onFile={subirSolicitud} destacado>
                                    {subiendo === 'solicitud_verificacion' ? 'Subiendo…' : '↑ Subir la descargada del verificador'}
                                </BotonSubir>
                            </>
                        ) : null,
                        // Lo enviado por API: el nº de solicitud que devuelve Marwen es
                        // la referencia con la que se habla del lote (y con la que
                        // vuelve firmada: "Solicitud-0035-S06_fdo.pdf").
                        extra: api ? (
                            <div className="flex items-center gap-2 flex-wrap rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-2.5 py-1.5">
                                <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400/80 shrink-0">⚡ Enviada por API</span>
                                {api.num_solicitud && <span className="text-[11px] font-bold text-white/80">nº {api.num_solicitud}</span>}
                                <span className="text-[9px] text-white/30">
                                    {[fmtFecha(api.enviado_at), api.n_actuaciones ? `${api.n_actuaciones} actuaciones` : null,
                                      api.enviado_por].filter(Boolean).join(' · ')}
                                </span>
                            </div>
                        ) : null,
                    }),
                ],
            })}

            {/* 2 · Firma del Sujeto Obligado: el Anexo I y las fichas los GENERA la
                app (no se suben), así que su hueco solo dice con qué se generan. */}
            {faseBloque({
                f: f2,
                soltar: p.soEnviado && !p.soFirmado ? setFirmadosSueltos : null,
                pista: 'Arrastra aquí los PDF firmados que devuelva el S.O., todos a la vez',
                tareas: [
                    // Sin la solicitud DESCARGADA DEL VERIFICADOR no se manda nada al
                    // S.O.: es uno de los papeles que firma en esta ronda.
                    <BotonAccion key="anexo" onClick={acciones.abrirAnexo} disabled={!nExps || !p.solicitudOk}
                        title={!p.solicitudOk ? 'Sube antes, en el paso 1, la Solicitud de Verificación descargada de la web del verificador' : ''}>
                        {p.soEnviado ? '↻ Reenviar Anexo I y fichas al S.O.' : '✉ Preparar y enviar Anexo I y fichas al S.O.'}
                    </BotonAccion>,
                    p.soEnviado ? (
                        <BotonAccion key="req" onClick={acciones.abrirRequerimiento} tono="amber">
                            Requerimiento · volver a pedir la firma
                        </BotonAccion>
                    ) : null,
                ],
                docs: (p.anexo || p.fichas.length)
                    ? [p.anexo, ...p.fichas].filter(Boolean).map(d => <Fila key={d.key} doc={d} {...propsFila(d)} />)
                    : [<Hueco key="hueco_anexo" label="Anexo I (Cesión S.O.) y fichas RES"
                        hint="Se generan con «Preparar y enviar Anexo I y fichas». Cuando vuelvan firmados, suéltalos en este bloque." />],
                nota: p.soEnviado && !p.soFirmado
                    ? <p className="text-[10px] text-white/30">Enviado. Esperando la firma del Sujeto Obligado.</p> : null,
            })}

            {/* 3 · Oferta de verificación.
                La suelta de la fase tiene DOS significados según el estado: sin
                oferta, lo que llega es la del verificador; mandada a firmar, lo que
                vuelve es la FIRMADA por el S.O. (entra por el camino de los
                firmados y se le leen las firmas). Subida y sin enviar no se acepta
                suelta: sería un reemplazo silencioso de la que se va a mandar.

                El ZIP para beCAE se arma aquí: es lo que se sube al verificador y de
                lo que sale la oferta. Es el MISMO paquete que luego va al MITECO. */}
            {faseBloque({
                f: f3,
                soltar: !p.oferta
                    ? (fs) => subirOferta(fs[0])
                    : (p.ofertaEnviada && !p.ofertaFirmada ? setFirmadosSueltos : null),
                pista: p.oferta ? 'Arrastra aquí la oferta que devuelva firmada el S.O.' : null,
                faltan: p.oferta ? 0 : 1,
                tareas: canSeeMargin ? [
                    <BotonAccion key="pq" onClick={() => pedirPaquete('expediente', true)}>
                        ⌕ Comprobar el paquete E1-E5 para beCAE
                    </BotonAccion>,
                    generarZip('expediente', ' en los expedientes'),
                ] : null,
                docs: [
                    docEsperado({
                        slot: 'oferta_verificacion', doc: p.oferta, requerido: true,
                        siguiente: p.faseActual === 3,
                        hint: 'La manda el verificador. Después se envía al S.O. para que la firme.',
                        accionesDoc: p.oferta && !p.ofertaFirmada ? (
                            <BotonFila onClick={() => setDocAEnviar(p.oferta)}>
                                {p.ofertaEnviada ? '↻ Reenviar para firma' : '✉ Enviar al S.O. para firma'}
                            </BotonFila>
                        ) : null,
                    }),
                ],
            })}

            {/* 4 · Verificación. Sigue "pendiente" mientras falte el ahorro
                verificado de algún expediente o la factura del verificador: el
                papeleo puede estar completo y quedar lo que desbloquea el pago.
                Lo que se LEE de cada documento (ahorros, nº de dictamen) va en su
                fila, con su botón de volver a leerlo. */}
            {faseBloque({
                f: f4,
                pendiente: canSeeMargin && (!verif.completo || !p.facturaVerificador),
                faltan: faltanDe(esp4),
                docs: [
                    // Lo primero que manda el verificador con la oferta aceptada.
                    docEsperado({
                        slot: 'plan_verificacion', doc: p.planVerificacion,
                        hint: 'Lo manda el verificador al aceptar la oferta.',
                    }),
                    ...p.inexactitudes.map(d => <Fila key={d.key} doc={d} {...propsFila(d)} />),
                    <Hueco key="hueco_inex" compacto={p.inexactitudes.length > 0} opcional
                        label={p.inexactitudes.length ? '+ Otro informe de inexactitudes' : 'Informe de inexactitudes'}
                        hint="Solo si el verificador detecta inexactitudes. Puede haber varios."
                        textoBoton={p.inexactitudes.length ? '+ Añadir' : '↑ Subir PDF'}
                        ocupado={subiendo === 'informe_inexactitudes'} arrastrando={arrastrando}
                        onFile={(f) => subir('informe_inexactitudes', f)} />,
                    docEsperado({
                        slot: 'informe_verificacion', doc: p.informeVerificacion, requerido: true,
                        siguiente: sig4 === 'informe_verificacion',
                        hint: canSeeMargin
                            ? 'Al subirlo se leen el ahorro y la inversión verificados de cada expediente.'
                            : null,
                        // El ahorro VERIFICADO: con él se factura al S.O. y se paga al
                        // cliente, y sin él el lote no puede pasar a pagar.
                        extra: canSeeMargin ? (
                            <div className={`flex items-center gap-2 flex-wrap rounded-lg border px-2.5 py-1.5 ${
                                verif.completo ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-amber-500/25 bg-amber-500/[0.04]'}`}>
                                <span className={`text-[10px] font-black ${verif.completo ? 'text-emerald-400/80' : 'text-amber-300/90'}`}>
                                    {verif.completo
                                        ? `Ahorro verificado en los ${verif.total} expedientes ✓`
                                        : `Ahorro verificado en ${verif.n} de ${verif.total} expedientes`}
                                </span>
                                {!verif.completo && <span className="text-[9px] text-white/30">Sin él no se puede pagar al cliente.</span>}
                                <div className="flex-1" />
                                <BotonFila onClick={releerInforme} disabled={leyendoInforme}>
                                    {leyendoInforme ? 'Leyendo…' : (verif.completo ? '↻ Volver a leer' : '⌕ Leer los ahorros')}
                                </BotonFila>
                            </div>
                        ) : null,
                        // Sin informe, se avisa igual: enterarse al cambiar el estado
                        // es enterarse tarde.
                        enHueco: canSeeMargin && !verif.completo ? (
                            <span className="text-[9px] text-amber-300/70">
                                Ahorro verificado en {verif.n} de {verif.total} expedientes · sin él no se puede pagar al cliente
                            </span>
                        ) : null,
                    }),
                    docEsperado({
                        slot: 'dictamen_favorable', doc: p.dictamen, requerido: true,
                        siguiente: sig4 === 'dictamen_favorable',
                        hint: 'Al subirlo se leen su nº, su fecha y la inversión definitiva.',
                        extra: canSeeMargin && p.dictamen ? (
                            <div className="flex items-center gap-2 flex-wrap rounded-lg border border-white/[0.06] bg-white/[0.01] px-2.5 py-1.5">
                                <span className="text-[10px] font-black text-white/60">
                                    {p.dictamen.dictamen?.numero_dictamen
                                        ? `Nº ${p.dictamen.dictamen.numero_dictamen}${p.dictamen.dictamen.fecha_emision ? ` · ${p.dictamen.dictamen.fecha_emision}` : ''}`
                                        : 'Sin leer'}
                                </span>
                                <span className="text-[9px] text-white/30">Nº, fecha e inversión definitiva de cada expediente.</span>
                                <div className="flex-1" />
                                <BotonFila onClick={releerDictamen} disabled={leyendoDictamen}>
                                    {leyendoDictamen ? 'Leyendo…'
                                        : (p.dictamen.dictamen?.numero_dictamen ? '↻ Volver a leer' : '⌕ Leer el dictamen')}
                                </BotonFila>
                            </div>
                        ) : null,
                    }),
                    // La que el VERIFICADOR emite al S.O. (no la nuestra). Su importe
                    // es precio de venta → solo ADMIN. Se lee del PDF; el campo queda
                    // para forzarlo cuando el papel no se deje leer.
                    canSeeMargin ? docEsperado({
                        slot: 'factura_verificador', doc: p.facturaVerificador, requerido: true,
                        siguiente: sig4 === 'factura_verificador',
                        hint: 'La que el verificador emite al S.O. (no la nuestra). Su importe se lee del PDF.',
                        accionesDoc: p.facturaVerificador && !p.facturaVerificador.sent_at ? (
                            <BotonFila onClick={() => setDocAEnviar(p.facturaVerificador)}>✉ Remitir al S.O.</BotonFila>
                        ) : null,
                        enHueco: (
                            <>
                                <input value={importeFactura} onChange={e => setImporteFactura(e.target.value)}
                                    placeholder="Importe € (opcional)" inputMode="decimal"
                                    title="Solo si quieres forzar el importe. Si lo dejas vacío se lee de la factura."
                                    className="w-36 bg-bkg-surface border border-white/[0.08] rounded-lg px-2.5 py-1 text-[11px] text-white placeholder-white/20 focus:border-brand/40 focus:outline-none" />
                                <span className="text-[9px] text-white/25">Solo para forzarlo; si lo dejas vacío se lee de la factura.</span>
                            </>
                        ),
                    }) : null,
                ],
                nota: p.verificado
                    ? <p className="text-[10px] text-emerald-400/70">Verificación favorable · informe y dictamen recibidos.</p> : null,
            })}

            {/* 5 · Presentación a MITECO y resolución de la Gestora de Ahorros.
                Qué hacer: el papeleo que se GENERA (solicitud de emisión + anexos,
                que salen juntos para que no se contradigan) y el paquete de cada
                actuación, que se COMPRUEBA antes de generar. Documentos: lo que
                vuelve del MITECO. */}
            {faseBloque({
                f: f5,
                faltan: faltanDe(esp5),
                tareas: canSeeMargin ? [
                    <BotonAccion key="anx" onClick={generarAnexos} disabled={generandoAnexos}>
                        {generandoAnexos ? 'Generando…' : '📄 Generar la solicitud y los anexos'}
                    </BotonAccion>,
                    <BotonAccion key="pq5" onClick={() => pedirPaquete('expediente', true)}>
                        ⌕ Comprobar el paquete E1-E5
                    </BotonAccion>,
                    p.dictamen ? (
                        <BotonAccion key="gestor" onClick={() => pedirPaquete('gestor', true)}
                            title="Añade el dictamen favorable y los escritos del lote">
                            ⌕ Comprobar el envío al gestor
                        </BotonAccion>
                    ) : null,
                    generarZip(null, modoPaquete === 'gestor' ? ' para el gestor' : ' en los expedientes'),
                ] : null,
                docs: [
                    docEsperado({
                        slot: 'justificante_miteco', doc: p.justificanteMiteco, requerido: true,
                        siguiente: sig5 === 'justificante_miteco',
                        hint: 'El resguardo de la subida a MITECO.',
                    }),
                    ...p.requerimientosGa.map(d => <Fila key={d.key} doc={d} {...propsFila(d)} />),
                    <Hueco key="hueco_ga" compacto={p.requerimientosGa.length > 0} opcional
                        label={p.requerimientosGa.length ? '+ Otro requerimiento de la G.A.' : 'Requerimiento de la G.A.'}
                        hint="Solo si la Gestora de Ahorros pide algo. Puede haber varios."
                        textoBoton={p.requerimientosGa.length ? '+ Añadir' : '↑ Subir PDF'}
                        ocupado={subiendo === 'requerimiento_ga'} arrastrando={arrastrando}
                        onFile={(f) => subir('requerimiento_ga', f)} />,
                    docEsperado({
                        slot: 'certificado_cae', doc: p.certificadoCae, requerido: true,
                        siguiente: sig5 === 'certificado_cae',
                        hint: 'La resolución de emisión. Al subirlo se leen los códigos CAE para la factura.',
                        extra: p.certificadoCae?.cae?.cae_inicial ? (
                            <p className="text-[10px] text-emerald-400/70">
                                {p.certificadoCae.cae.cae_inicial} → {p.certificadoCae.cae.cae_final}
                                {p.certificadoCae.cae.total ? ` · ${Number(p.certificadoCae.cae.total).toLocaleString('es-ES')} CAE` : ''}
                            </p>
                        ) : null,
                    }),
                ],
                nota: p.certificadoCae
                    ? <p className="text-[10px] text-emerald-400/70">CAE emitido · pendiente del pago del S.O. a Brokergy.</p>
                    : (p.justificanteMiteco
                        ? <p className="text-[10px] text-cyan-300/70">Presentado al MITECO · esperando la resolución.</p> : null),
            })}

            {/* 6 · La factura de Brokergy al S.O. por la venta de CAEs. NO es la del
                verificador (fase 4). Es margen: solo ADMIN. Se GENERA, no se sube. */}
            {canSeeMargin && faseBloque({
                f: f6,
                tareas: [
                    <BotonAccion key="fac" onClick={acciones.abrirFactura} disabled={!lote?.sujeto_obligado_id}
                        title={!lote?.sujeto_obligado_id ? 'Asigna primero el Sujeto Obligado' : ''}>
                        {p.facturaSo?.numero ? `Abrir la factura ${p.facturaSo.numero}` : '🧾 Generar la factura de Brokergy al S.O.'}
                    </BotonAccion>,
                ],
                docs: [
                    p.facturaSo?.drive_link ? (
                        <Fila key="factura_so" doc={{
                            label: `Factura de Brokergy al S.O. ${p.facturaSo.numero || ''}`.trim(),
                            draft_link: p.facturaSo.drive_link,
                            uploaded_at: p.facturaSo.fecha,
                        }} />
                    ) : (
                        <Hueco key="hueco_factura_so" label="Factura de Brokergy al S.O." requerido
                            hint="Se genera con el botón de arriba, con los códigos del certificado CAE." />
                    ),
                ],
            })}

            {/* 7 · Pago a los clientes. El S.O. ya nos ha pagado: antes de cada
                transferencia se le pide al cliente que confirme su cuenta (y cómo
                quiere liquidar la gestión). Lo ve todo el equipo; los importes y
                el IBAN entero, solo el ADMIN. */}
            {faseBloque({
                f: f7,
                // Antes de emitirse el CAE no hay nada que mirar aquí (y cada lectura
                // carga los expedientes enteros): basta el aviso de "aún no toca".
                nota: p.caeEmitido ? (
                    <CobroClientesPanel key={`cobro_${lote?.id}`} lote={lote} activo={p.pagoCliente}
                        canSeeMargin={canSeeMargin} onChanged={onChanged} />
                ) : null,
            })}

            {error && <p className="text-[10px] text-red-400">{error}</p>}

            {docAEnviar && (
                <EnviarDocLoteModal
                    lote={lote}
                    doc={docAEnviar}
                    onClose={() => setDocAEnviar(null)}
                    onSent={() => { if (onChanged) onChanged(); }}
                />
            )}

            {/* Overlay ESTÁNDAR de la app mientras se lee un PDF: leer un informe
                tarda entre 6 y 14 s y sin señal el usuario vuelve a pulsar. Se usa
                el mismo de los envíos (icono 'read': la lupa recorre la hoja). */}
            {/* Casi todo lo que abre este overlay es una LECTURA de un PDF; el
                paquete de actuaciones sí ESCRIBE ficheros y lo dice con su icono. */}
            <SendActionOverlay
                icon={lectura?.icon || 'read'}
                phase={lectura?.phase || null}
                ok={!!lectura?.ok}
                subtitle={lectura?.subtitle}
                items={lectura?.items || []}
                errorText={lectura?.errorText}
                sendingTitle={lectura?.sendingTitle || 'Analizando el documento…'}
                okTitle={lectura?.okTitle}
                errorTitle={lectura?.errorTitle}
                accion={lectura?.accion || null}
                cancelar={lectura?.cancelar ? { ...lectura.cancelar, pedida: cancelPedida } : null}
                onClose={() => setLectura(null)}
            />

            {firmadosSueltos && (
                <FirmadosSoModal
                    lote={lote}
                    ficheros={firmadosSueltos}
                    asignacionInicial={asignacionInicial}
                    onChanged={() => { if (onChanged) onChanged(); }}
                    onClose={() => { setFirmadosSueltos(null); setAsignacionInicial(null); }}
                />
            )}

            {propuestaAhorros && (
                <AhorrosVerificadosModal
                    lote={lote}
                    propuesta={propuestaAhorros}
                    modo={modoRevision}
                    onClose={() => setPropuestaAhorros(null)}
                    onAplicado={() => { if (onChanged) onChanged(); }}
                />
            )}
        </div>
    );
}

export default LoteProcesoFases;
