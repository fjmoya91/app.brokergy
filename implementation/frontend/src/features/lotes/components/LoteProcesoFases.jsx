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

const EstadoPill = ({ doc }) => {
    const e = ESTADOS_DOC[estadoDeDoc(doc)];
    return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${e.cls}`}>{e.label}</span>;
};

// Documentos que pueden volver firmados (los que salen a firmar).
const TIPOS_FIRMABLES = ['solicitud_verificacion', 'anexo_i_listado', 'ficha_res', 'oferta_verificacion'];
const esFirmable = (doc) => TIPOS_FIRMABLES.includes(doc?.tipo);

// Fila de un documento. Cuando ha vuelto firmado, el firmado se pinta como una
// SUBFILA propia en cian/verde: son dos cosas distintas (lo que mandamos y lo que
// nos devolvieron) y antes se confundían en un solo enlace.
const Fila = ({ doc, acciones = null, onBorrar = null, onSubirFirmado = null, onValidar = null,
    onMarcarPagada = null, onJustificantePago = null, ocupado = false }) => {
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
                    {onBorrar && (
                        <button type="button" onClick={onBorrar} title="Quitar del lote"
                            className="px-1.5 py-1 rounded-lg text-[11px] text-white/20 hover:text-red-400 transition-all">✕</button>
                    )}
                </div>
            </div>

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

            {(acciones || onSubirFirmado || (!doc.pagado_at && (onMarcarPagada || onJustificantePago))) && (
                <div className="px-3 pb-2.5 flex items-center gap-2 flex-wrap">
                    {onSubirFirmado && (
                        <BotonSubir disabled={ocupado} onFile={onSubirFirmado}>
                            {doc.signed_link ? '↻ Reemplazar firmado' : '↑ Subir firmado'}
                        </BotonSubir>
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
            + '\n\nSi vas a subir las de varios lotes, dile que NO y mándalas todas en un solo correo'
            + ' desde el resumen de Lotes: \u201c\u2709 Pedir la firma de las ofertas\u201d.',
            'Oferta subida', 'success'
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
                'Volver a generar el paquete', 'warning');
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

    // ── Cabecera de fase ──────────────────────────────────────────────────────
    // Las fases YA HECHAS van PLEGADAS a una línea. Con las seis abiertas, un lote
    // en la fase 5 obligaba a bajar por cuatro bloques de papeleo terminado para
    // llegar a lo único accionable; el trámite tiene ~15 documentos y no cabía en
    // una pantalla. Plegada, la fase sigue diciendo lo suyo (cuántos documentos
    // tiene y si alguno está pendiente de revisar) y se abre con un clic.
    //
    // El plegado es solo VISUAL y se puede deshacer: los lotes viejos traen
    // documentos firmados fuera de la app y hay que poder llegar a ellos siempre.
    const Fase = ({ f, pendiente = false, soltar = null, pista = null, children }) => {
        const esActual = p.faseActual === f.n;
        const bloqueada = !!f.bloqueo && !f.hecha;
        const porRevisarN = (f.docs || []).filter(d => d?.signed_link && !d?.validado_at).length;
        // Por defecto: abierta si es la actual, si aún no está hecha, o si le queda
        // algo PENDIENTE aunque el papeleo esté completo — que es el caso de la
        // fase 4, donde el informe y el dictamen ya están pero puede faltar el
        // ahorro verificado o la factura del verificador. Plegar eso escondería
        // justo lo único que hay que hacer. El override del usuario manda encima.
        //
        // Un firmado "por revisar" NO abre la fase: se anuncia en la línea plegada
        // y desde ahí se ve que existe. Abrir la fase entera por un visto bueno
        // devuelve el scroll que este plegado venía a quitar.
        const abierta = fasesAbiertas[f.n] !== undefined
            ? fasesAbiertas[f.n]
            : (esActual || !f.hecha || pendiente);
        const porRevisar = porRevisarN;
        // La fase ENTERA recibe la suelta (también plegada: no hay que abrirla
        // para soltar). El resaltado se toca en el nodo, no por estado.
        const dnd = soltar ? {
            onDragOver: (e) => { e.preventDefault(); e.currentTarget.classList.add(...RESALTE); },
            onDragLeave: (e) => {
                // `dragleave` salta también al pasar por encima de un hijo: solo
                // cuenta si el puntero ha salido del bloque de verdad.
                if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.classList.remove(...RESALTE);
            },
            onDrop: (e) => {
                e.preventDefault();
                e.currentTarget.classList.remove(...RESALTE);
                const fs = pdfsDe(e.dataTransfer?.files);
                if (fs.length) soltar(fs);
            },
        } : {};
        return (
            <div {...dnd} className={`rounded-2xl border transition-all ${abierta ? 'p-4' : 'px-4 py-2.5'} ${
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
                    {/* Plegada, la fase tiene que seguir contando lo suyo: cuántos
                        papeles guarda y, sobre todo, si hay algo esperando revisión
                        —que es lo único de una fase terminada que aún pide acción. */}
                    {!abierta && porRevisar > 0 && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-cyan-300 shrink-0">
                            {porRevisar} por revisar
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
                <div className="space-y-2 pl-8">
                    {f.docs.map(d => <Fila key={d.key} doc={d} {...propsFila(d)} />)}
                    {/* El aviso de "aún no toca" NO impide actuar: los lotes que vienen
                        de antes de la app tienen documentos firmados fuera y hay que
                        poder registrarlos igual. Se avisa, no se bloquea. */}
                    {bloqueada && <p className="text-[10px] text-white/25 italic">{f.bloqueo}</p>}
                    {children}
                    {soltar && pista && (
                        <PistaSuelta arrastrando={arrastrando} texto={pista} onFiles={soltar} />
                    )}
                </div>
                )}
            </div>
        );
    };

    const [f1, f2, f3, f4, f5, f6] = p.fases;
    const nExps = (lote?.expedientes || []).length;
    const api = lote?.verificacion_api || null;

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
                La solicitud que se archiva aquí es el BORRADOR: la firma el S.O. en
                el paso 2, junto al Anexo I. Decía "subir solicitud firmada" y hacía
                buscar una firma que en este momento no existe todavía.

                Y la solicitud FIRMADA vuelve con las demás, así que se suelta igual
                que ellas: misma comprobación de firma y mismo `_fdo`. No importa en
                qué fase se suelte cada PDF — el destino lo decide su nombre, no el
                sitio donde se soltó. */}
            <Fase f={f1}
                soltar={p.solicitud && !p.solicitud.signed_link ? setFirmadosSueltos : null}
                pista="Arrastra aquí la solicitud que devuelva firmada el S.O.">
                {/* Lo enviado por API deja de ser invisible. El nº de solicitud que
                    devuelve Marwen es la referencia con la que se le habla del lote
                    (y con la que vuelve firmada: "Solicitud-0035-S06_fdo.pdf"); se
                    guardaba en `verificacion_api` y no se enseñaba en ningún sitio. */}
                {api && (
                    <div className="flex items-center gap-2 flex-wrap rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-emerald-400/80 shrink-0">⚡ Enviada por API</span>
                        {api.num_solicitud && <span className="text-[11px] font-bold text-white/80">nº {api.num_solicitud}</span>}
                        <span className="text-[9px] text-white/30">
                            {[fmtFecha(api.enviado_at), api.n_actuaciones ? `${api.n_actuaciones} actuaciones` : null,
                              api.enviado_por].filter(Boolean).join(' · ')}
                        </span>
                    </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                    <BotonAccion onClick={acciones.abrirSolicitud} disabled={!nExps}
                        title={!nExps ? 'El lote no tiene expedientes' : 'Genera el formulario de solicitud'}>
                        {api ? 'Volver a generar la solicitud' : 'Generar solicitud'}
                    </BotonAccion>
                    <BotonSubir disabled={subiendo === 'solicitud_verificacion'} onFile={subirSolicitud}
                        destacado={!p.solicitud}>
                        {subiendo === 'solicitud_verificacion' ? 'Subiendo…'
                            : (p.solicitud ? 'Reemplazar el borrador' : '↑ Subir la solicitud (borrador)')}
                    </BotonSubir>
                </div>
                {!p.solicitud && (
                    <p className="text-[10px] text-white/30">
                        Sin firmar: es el documento que el S.O. firma en el paso 2, con el Anexo I y las fichas.
                        Al generarla se archiva aquí sola.
                    </p>
                )}
            </Fase>

            {/* 2 · Firma del Sujeto Obligado */}
            <Fase f={f2}
                soltar={p.soEnviado && !p.soFirmado ? setFirmadosSueltos : null}
                pista="Arrastra aquí los PDF firmados que devuelva el S.O., todos a la vez">
                <div className="flex items-center gap-2 flex-wrap">
                    <BotonAccion onClick={acciones.abrirAnexo} disabled={!nExps}>
                        {p.soEnviado ? 'Reenviar Anexo I · Cesión S.O.' : 'Anexo I · Cesión S.O.'}
                    </BotonAccion>
                    <BotonAccion onClick={acciones.abrirRequerimiento} disabled={!p.soEnviado} tono="amber"
                        title={!p.soEnviado ? 'Disponible cuando el lote se haya enviado al S.O.' : ''}>
                        Requerimiento · reenviar para firma
                    </BotonAccion>
                </div>
                {p.soEnviado && !p.soFirmado && (
                    <p className="text-[10px] text-white/30">Enviado. Esperando la firma del Sujeto Obligado.</p>
                )}
            </Fase>

            {/* 3 · Oferta de verificación.

                La suelta tiene DOS significados y los decide el estado, no una
                pregunta al usuario: mientras no hay oferta, lo único que puede
                llegar es la que manda el verificador; una vez mandada a firmar, lo
                que vuelve es la FIRMADA por el S.O., que entra por el mismo camino
                que los firmados de la fase 2 (`oferta_verificacion` ya está en
                TIPOS_FIRMABLES) y por tanto se le leen las firmas antes de
                registrarla. Con la oferta subida y sin enviar todavía no se acepta
                suelta: ahí lo que toca es mandarla, y un PDF soltado en ese momento
                sería un reemplazo silencioso del que se va a mandar a firmar.

                Solo el primer fichero: la oferta es UNA por lote. Quien tenga las
                cuatro las suelta en su lote, que es donde cada una significa algo. */}
            <Fase f={f3}
                soltar={!p.oferta
                    ? (fs) => subirOferta(fs[0])
                    : (p.ofertaEnviada && !p.ofertaFirmada ? setFirmadosSueltos : null)}
                pista={!p.oferta
                    ? 'Arrastra aquí la oferta que mande el verificador'
                    : 'Arrastra aquí la oferta que devuelva firmada el S.O.'}>
                {/* El ZIP para beCAE se arma AQUÍ, y esto es lo primero de la fase.
                    Con el Anexo I y las fichas ya firmados, lo siguiente es subir al
                    verificador la documentación de cada actuación (un ZIP por
                    actuación, con los ficheros renombrados a "E{n}-…") y la solicitud
                    por separado — y de eso sale la oferta que se recibe después.
                    Es el MISMO paquete que luego va al MITECO: el de allí solo añade
                    el anexo de la actuación, el dictamen y los escritos del lote, así
                    que no hay dos paquetes que puedan contradecirse. */}
                {canSeeMargin && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <BotonAccion onClick={() => pedirPaquete('expediente', true)}>
                            ⌕ Comprobar el paquete E1-E5 para beCAE
                        </BotonAccion>
                        {paquete && paquete.dryRun && paquete.modo === 'expediente'
                            && paquete.actuaciones.some(a => a.ok) && (
                            <BotonAccion tono={generado.expediente ? 'brand' : 'amber'}
                                onClick={() => generarPaquete('expediente', paquete.actuaciones.filter(a => a.ok))}>
                                {generado.expediente
                                    ? `↻ Volver a generar los ${generado.expediente} ZIP`
                                    : `📦 Generar ${paquete.actuaciones.filter(a => a.ok).length} ZIP en los expedientes`}
                            </BotonAccion>
                        )}
                    </div>
                )}
                {/* Subir el firmado y darle el OK van en la propia fila del documento;
                    aquí solo lo que es de la fase: traer la oferta y mandarla a firmar. */}
                <div className="flex items-center gap-2 flex-wrap">
                    {!p.oferta ? (
                        <BotonSubir disabled={subiendo === 'oferta_verificacion'} onFile={subirOferta} destacado>
                            {subiendo === 'oferta_verificacion' ? 'Subiendo…' : '↑ Subir oferta del verificador'}
                        </BotonSubir>
                    ) : (
                        <>
                            {!p.ofertaFirmada && (
                                <BotonAccion onClick={() => setDocAEnviar(p.oferta)}>
                                    {p.ofertaEnviada ? '↻ Reenviar para firma' : '✉ Enviar para firma'}
                                </BotonAccion>
                            )}
                            <BotonSubir disabled={subiendo === 'oferta_verificacion'} onFile={subirOferta}>Reemplazar oferta</BotonSubir>
                        </>
                    )}
                </div>
            </Fase>

            {/* 4 · Verificación. Sigue "pendiente" mientras falte el ahorro
                verificado de algún expediente o la factura del verificador:
                el papeleo puede estar completo y quedar lo que de verdad
                desbloquea el pago. */}
            <Fase f={f4} pendiente={canSeeMargin && (!verif.completo || !p.facturaVerificador)}>
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <BotonSubir disabled={subiendo === 'informe_inexactitudes'} onFile={(f) => subir('informe_inexactitudes', f)}>
                            {subiendo === 'informe_inexactitudes' ? 'Subiendo…' : `+ Informe de inexactitudes${p.inexactitudes.length ? ` (${p.inexactitudes.length})` : ''}`}
                        </BotonSubir>
                        {!p.informeVerificacion && (
                            <BotonSubir disabled={subiendo === 'informe_verificacion'} onFile={subirInforme}>
                                {subiendo === 'informe_verificacion' ? 'Leyendo el informe…' : '↑ Informe de Verificación'}
                            </BotonSubir>
                        )}
                        {!p.dictamen && (
                            <BotonSubir disabled={subiendo === 'dictamen_favorable'} onFile={subirDictamen}>
                                {subiendo === 'dictamen_favorable' ? 'Leyendo el dictamen…' : '↑ Dictamen favorable'}
                            </BotonSubir>
                        )}
                    </div>
                    {/* ── El ahorro VERIFICADO de cada expediente ──────────────
                        Sale del informe: es la cifra con la que se factura al S.O.
                        y con la que se le paga al cliente, y sin ella el lote no
                        puede pasar a pagar. Se dice aquí cuántos lo tienen ya, en
                        vez de descubrirlo al intentar cambiar el estado. */}
                    {/* Se enseña TAMBIÉN sin informe subido: que falte el ahorro
                        verificado es lo que impide pagar al cliente, y enterarse
                        solo al intentar cambiar el estado es enterarse tarde. */}
                    {canSeeMargin && (!verif.completo || p.informeVerificacion) && (
                        <div className={`flex items-center gap-2 flex-wrap rounded-xl border px-3 py-2 ${
                            verif.completo ? 'border-emerald-500/20 bg-emerald-500/[0.04]' : 'border-amber-500/25 bg-amber-500/[0.04]'}`}>
                            <span className={`text-[10px] font-black ${verif.completo ? 'text-emerald-400/80' : 'text-amber-300/90'}`}>
                                {verif.completo
                                    ? `Ahorro verificado en los ${verif.total} expedientes ✓`
                                    : `Ahorro verificado en ${verif.n} de ${verif.total} expedientes`}
                            </span>
                            {p.informeVerificacion ? (
                                <BotonAccion onClick={releerInforme} disabled={leyendoInforme}>
                                    {leyendoInforme ? 'Leyendo el informe…' : (verif.completo ? '↻ Volver a leer el informe' : '⌕ Leer los ahorros del informe')}
                                </BotonAccion>
                            ) : (
                                <span className="text-[9px] text-white/30">Se rellena solo al subir el informe de verificación.</span>
                            )}
                            {!verif.completo && p.informeVerificacion && (
                                <span className="text-[9px] text-white/30">Sin él no se puede pagar al cliente.</span>
                            )}
                        </div>
                    )}

                    {/* ── El DICTAMEN: nº, fecha e inversión definitiva ────────
                        Su nº y su fecha identifican la verificación para siempre
                        (van también en la cabecera del lote), y su tabla fija la
                        inversión que manda sobre la declarada al principio. */}
                    {canSeeMargin && p.dictamen && (
                        <div className="flex items-center gap-2 flex-wrap rounded-xl border border-white/[0.06] bg-white/[0.01] px-3 py-2">
                            <span className="text-[10px] font-black text-white/60">
                                {p.dictamen.dictamen?.numero_dictamen
                                    ? `Dictamen ${p.dictamen.dictamen.numero_dictamen}${p.dictamen.dictamen.fecha_emision ? ` · ${p.dictamen.dictamen.fecha_emision}` : ''}`
                                    : 'Dictamen sin leer'}
                            </span>
                            <BotonAccion onClick={releerDictamen} disabled={leyendoDictamen}>
                                {leyendoDictamen ? 'Leyendo el dictamen…'
                                    : (p.dictamen.dictamen?.numero_dictamen ? '↻ Volver a leer el dictamen' : '⌕ Leer el dictamen')}
                            </BotonAccion>
                            <span className="text-[9px] text-white/30">Nº, fecha e inversión definitiva de cada expediente.</span>
                        </div>
                    )}

                    {/* Factura del verificador: su importe revela lo que le cuesta la
                        operación al S.O., que es precio de venta → solo ADMIN.
                        El importe SE LEE de la propia factura al subirla; el campo
                        queda para forzarlo a mano cuando el papel no se deje leer. */}
                    {canSeeMargin && !p.facturaVerificador && (
                        <div className="flex items-center gap-2 flex-wrap">
                            <BotonSubir disabled={subiendo === 'factura_verificador'} onFile={subirFacturaVerificador}>
                                {subiendo === 'factura_verificador' ? 'Leyendo la factura…' : '↑ Factura del verificador al S.O.'}
                            </BotonSubir>
                            <input value={importeFactura} onChange={e => setImporteFactura(e.target.value)}
                                placeholder="Importe € (opcional)" inputMode="decimal"
                                title="Solo si quieres forzar el importe. Si lo dejas vacío se lee de la factura."
                                className="w-36 bg-bkg-surface border border-white/[0.08] rounded-lg px-2.5 py-1 text-[11px] text-white placeholder-white/20 focus:border-brand/40 focus:outline-none" />
                            <span className="text-[9px] text-white/25">La que el VERIFICADOR emite al S.O. (no la nuestra). Su importe se lee del PDF.</span>
                        </div>
                    )}

                    {p.verificado && <p className="text-[10px] text-emerald-400/70">Verificación favorable · informe y dictamen recibidos.</p>}
                </div>
            </Fase>

            {/* 5 · Presentación a MITECO y resolución de la Gestora de Ahorros */}
            <Fase f={f5}>
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Lo PRIMERO de esta fase: la carátula de la subida y los anexos
                        que van dentro de sus ZIP. Antes de subir nada a MITECO hay que
                        tenerlos, y salen los dos del mismo gesto para que no puedan
                        contradecirse. */}
                    {canSeeMargin && (
                        <BotonAccion onClick={generarAnexos} disabled={generandoAnexos}>
                            {generandoAnexos ? 'Generando…' : '📄 Generar la solicitud y los anexos'}
                        </BotonAccion>
                    )}
                    {/* El paquete de cada actuación: los documentos del expediente
                        renombrados a "E{n}-…" y su ZIP. Se COMPRUEBA antes de generar
                        (el mismo botón dice cuántas actuaciones están listas), y el
                        del gestor solo aparece con el dictamen ya subido: sin él, ese
                        paquete no puede estar completo. */}
                    {canSeeMargin && (
                        <>
                            <BotonAccion onClick={() => pedirPaquete('expediente', true)}>
                                ⌕ Comprobar el paquete E1-E5
                            </BotonAccion>
                            {paquete && paquete.dryRun && paquete.actuaciones.some(a => a.ok) && (
                                <BotonAccion tono={generado[modoPaquete] ? 'brand' : 'amber'}
                                    onClick={() => generarPaquete(modoPaquete, paquete.actuaciones.filter(a => a.ok))}>
                                    {generado[modoPaquete]
                                        ? `↻ Volver a generar los ${generado[modoPaquete]} ZIP`
                                        : `📦 Generar ${paquete.actuaciones.filter(a => a.ok).length} ZIP${modoPaquete === 'gestor' ? ' para el gestor' : ' en los expedientes'}`}
                                </BotonAccion>
                            )}
                            {p.dictamen && (
                                <BotonAccion onClick={() => pedirPaquete('gestor', true)}
                                    title="Añade el dictamen favorable y los escritos del lote">
                                    ⌕ Comprobar el envío al gestor
                                </BotonAccion>
                            )}
                        </>
                    )}
                    {!p.justificanteMiteco && (
                        <BotonSubir disabled={subiendo === 'justificante_miteco'} onFile={(f) => subir('justificante_miteco', f)}>
                            {subiendo === 'justificante_miteco' ? 'Subiendo…' : '↑ Justificante de subida a MITECO'}
                        </BotonSubir>
                    )}
                    <BotonSubir disabled={subiendo === 'requerimiento_ga'} onFile={(f) => subir('requerimiento_ga', f)}>
                        {subiendo === 'requerimiento_ga' ? 'Subiendo…' : `+ Requerimiento G.A.${p.requerimientosGa.length ? ` (${p.requerimientosGa.length})` : ''}`}
                    </BotonSubir>
                    {!p.certificadoCae && (
                        <BotonSubir disabled={subiendo === 'certificado_cae'} onFile={(f) => subir('certificado_cae', f)} destacado>
                            {subiendo === 'certificado_cae' ? 'Subiendo…' : '↑ Certificado CAE emitido'}
                        </BotonSubir>
                    )}
                </div>
                {p.justificanteMiteco && !p.certificadoCae && (
                    <p className="text-[10px] text-cyan-300/70">Presentado al MITECO · justificante de registro guardado.</p>
                )}
                {p.certificadoCae && <p className="text-[10px] text-emerald-400/70">CAE emitido · pendiente del pago del S.O. a Brokergy.</p>}
            </Fase>

            {/* 6 · La factura de Brokergy al S.O. por la venta de CAEs. NO es la del
                verificador (fase 4, que va del verificador al S.O.). Es margen: solo ADMIN. */}
            {canSeeMargin && (
                <Fase f={f6}>
                    <div className="space-y-2">
                        {p.facturaSo?.drive_link && (
                            <Fila doc={{
                                label: `Factura de Brokergy al S.O. ${p.facturaSo.numero || ''}`.trim(),
                                draft_link: p.facturaSo.drive_link,
                                uploaded_at: p.facturaSo.fecha,
                            }} />
                        )}
                        <BotonAccion onClick={acciones.abrirFactura} disabled={!lote?.sujeto_obligado_id}
                            title={!lote?.sujeto_obligado_id ? 'Asigna primero el Sujeto Obligado' : ''}>
                            {p.facturaSo?.numero ? `Factura de Brokergy al S.O. · ${p.facturaSo.numero}` : 'Generar factura de Brokergy al S.O.'}
                        </BotonAccion>
                    </div>
                </Fase>
            )}

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
