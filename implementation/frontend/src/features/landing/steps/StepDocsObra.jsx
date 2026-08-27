import React, { useCallback, useMemo, useState } from 'react';
import axios from 'axios';
import { StepLayout } from '../components/StepLayout';

/**
 * StepDocsObra — Presupuesto y facturas de la obra, leídos con OCR (SOLO flujo interno).
 *
 * Sustituye a la pregunta "¿tienes un presupuesto orientativo?" cuando quien rellena
 * es staff y tiene los papeles delante: en vez de teclear una cifra a ojo, suelta el
 * PDF y la app lee el importe, el nº de documento, la fecha y los equipos.
 *
 * Por qué esto importa más allá de la simulación: la inversión que declara el Anexo
 * sale de la SUMA de las bases imponibles de las facturas, y marca/modelo/nº de serie
 * de los equipos acaban en el CIFO. Recogerlo aquí es tenerlo ya hecho para el
 * expediente en lugar de volver a leer los mismos PDF dentro de tres semanas.
 *
 * REGLA — el importe que manda AQUÍ es el TOTAL CON IVA, y no es el mismo que el del
 * expediente. El OCR lee la base imponible (que es la del Anexo, y así se guarda en
 * `doc.importe_sin_iva`), pero el titular casi siempre es un PARTICULAR: no se deduce
 * el IVA, así que la inversión que compara con el bono CAE y con la deducción de la
 * renta es la que va a pagar, impuestos incluidos. Volcando la base a la simulación,
 * la propuesta le prometía un coste ~21 % más barato del real. Las dos cifras viajan
 * en el mismo documento (`importe_total` / `importe_sin_iva`) y cada una va a lo suyo.
 * Si el titular fuese una empresa —el IVA sí se lo deduce— el campo es editable.
 *
 * Cada documento va a SU slot:
 *   presupuesto → DOC_PRESUPUESTO   ·   factura → DOC_FACTURAS ("5. FACTURAS" en Drive)
 *
 * Los ficheros NO se suben aquí (la oportunidad todavía no existe): se conservan en
 * memoria y los sube `ReformaSubFlow.subirDocsPendientes()` en cuanto hay carpeta.
 *
 * Props:
 *   docs, setDocs — [{ id, tipo, doc, equipos, files, error }]
 *   onNext(total) — continuar; `total` = suma de bases imponibles (0 si no hay nada).
 */

const SLOT_POR_TIPO = { presupuesto: 'DOC_PRESUPUESTO', factura: 'DOC_FACTURAS' };

const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 });

const IVA_DEFECTO_PCT = 21;

// Total a pagar del documento. El respaldo sobre la base cubre los documentos leídos
// antes de que el backend devolviera `importe_total`, y las lecturas fallidas.
const conIva = (doc) => {
    const t = Number(doc?.importe_total);
    if (Number.isFinite(t) && t > 0) return t;
    const b = Number(doc?.importe_sin_iva) || 0;
    const pct = Number.isFinite(Number(doc?.iva_pct)) ? Number(doc.iva_pct) : IVA_DEFECTO_PCT;
    return Math.round(b * (1 + pct / 100) * 100) / 100;
};

// Zona de subida: clic (abre el selector) y ARRASTRAR Y SOLTAR, que es lo que
// promete el subtítulo del paso.
//
// Va fuera del componente a propósito: definida dentro, React la trata como un
// tipo nuevo en cada render y desmonta/remonta la tarjeta entera, así que el
// estado de "me están arrastrando encima" se perdía en cuanto el padre pintaba.
//
// El `<label>` abre el selector solo; el drop hay que cablearlo a mano, y sin
// preventDefault en dragOver el navegador se limita a ABRIR el fichero en una
// pestaña (por eso "no hacía nada" al soltar).
function Zona({ tipo, titulo, texto, emoji, leyendo, subir }) {
    const [encima, setEncima] = useState(false);
    const bloqueada = !!leyendo;

    const soltar = (e) => {
        e.preventDefault();
        setEncima(false);
        if (bloqueada) return;
        const files = e.dataTransfer?.files;
        if (files?.length) subir(tipo, files);
    };

    return (
        <label
            onDragEnter={(e) => { e.preventDefault(); if (!bloqueada) setEncima(true); }}
            onDragOver={(e) => { e.preventDefault(); if (!bloqueada) setEncima(true); }}
            onDragLeave={(e) => { e.preventDefault(); setEncima(false); }}
            onDrop={soltar}
            className={`block rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                bloqueada
                    ? 'opacity-40 cursor-wait border-white/10'
                    : encima
                        ? 'cursor-copy border-amber-400 bg-amber-500/10 scale-[1.02]'
                        : 'cursor-pointer border-white/15 bg-white/[0.02] hover:border-amber-500/50'
            }`}
        >
            <input
                type="file"
                multiple
                disabled={bloqueada}
                accept="application/pdf,.pdf,image/*"
                className="hidden"
                onChange={(e) => { subir(tipo, e.target.files); e.target.value = ''; }}
            />
            {/* Los hijos no deben capturar el drag: si el puntero pasa del texto al
                icono, dragLeave apagaría el resaltado a mitad de arrastre. */}
            <div className="pointer-events-none">
                <div className="text-3xl mb-2">{emoji}</div>
                <div className="text-white font-bold text-sm">{titulo}</div>
                <p className="text-white/40 text-[11px] mt-1 leading-relaxed">{texto}</p>
                <div className="text-white/25 text-[10px] mt-2">
                    {encima ? 'Suelta aquí' : 'PDF o fotos · arrastra o haz clic · varias páginas se unen solas'}
                </div>
            </div>
        </label>
    );
}

export function StepDocsObra({ docs = [], setDocs, onNext }) {
    const [leyendo, setLeyendo] = useState(null); // 'presupuesto' | 'factura' | null
    const [errorGlobal, setErrorGlobal] = useState(null);

    // Importe de la obra = suma de las FACTURAS si las hay; si aún no hay facturas,
    // el presupuesto. Nunca los dos a la vez: sumar presupuesto + factura del mismo
    // trabajo duplicaría la inversión (y con ella el tope de sobrefinanciación).
    // Se suma el TOTAL CON IVA (`conIva`), que es lo que el particular paga.
    const { total, base, estimado } = useMemo(() => {
        const deTipo = (t) => docs.filter(d => d.tipo === t && d.doc);
        const suma = (lista) => lista.reduce((acc, d) => acc + conIva(d.doc), 0);
        const facturas = deTipo('factura');
        const hayFacturas = suma(facturas) > 0;
        const lista = hayFacturas ? facturas : deTipo('presupuesto');
        return {
            total: suma(lista),
            base: hayFacturas ? 'facturas' : 'presupuesto',
            estimado: lista.some(d => d.doc?.iva_estimado),
        };
    }, [docs]);

    const equipos = useMemo(() => docs.flatMap(d => d.equipos || []), [docs]);

    const subir = useCallback(async (tipo, fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        setErrorGlobal(null);
        setLeyendo(tipo);
        try {
            const form = new FormData();
            files.forEach(f => form.append('files', f));
            form.append('tipo', tipo);
            const { data } = await axios.post('/api/factura-ocr/extract', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setDocs(prev => [...prev, {
                id: `${tipo}-${prev.length}-${files[0]?.name || 'doc'}`,
                tipo,
                slot: SLOT_POR_TIPO[tipo],
                doc: data.doc,
                equipos: data.equipos || [],
                files,
            }]);
        } catch (e) {
            const m = e?.response?.data?.error || e?.message || 'Error desconocido';
            console.error('[StepDocsObra]', m);
            // Que la lectura falle no puede impedir aportar el documento: se guarda
            // igual (irá a su slot) y el importe se teclea a mano.
            setDocs(prev => [...prev, {
                id: `${tipo}-${prev.length}-${files[0]?.name || 'doc'}`,
                tipo,
                slot: SLOT_POR_TIPO[tipo],
                doc: { tipo, numero_factura: '', fecha_factura: null, importe_sin_iva: 0, importe_total: 0, iva_pct: IVA_DEFECTO_PCT, iva_estimado: true, partidas: [], origen: 'manual' },
                equipos: [],
                files,
                error: m,
            }]);
            setErrorGlobal(`No se pudo leer el ${tipo}: ${m}. Se guardará igual — pon el importe a mano.`);
        } finally {
            setLeyendo(null);
        }
    }, [setDocs]);

    const quitar = (id) => setDocs(prev => prev.filter(d => d.id !== id));
    // Se teclea el TOTAL CON IVA (es el importe que se está mirando en el papel) y la
    // base se recalcula con el tipo del propio documento: el expediente sigue
    // necesitando la base imponible, y dejarla desfasada rompería el Anexo.
    const editarImporte = (id, valor) => setDocs(prev => prev.map(d => {
        if (d.id !== id) return d;
        const totalDoc = Number(valor) || 0;
        const pct = Number.isFinite(Number(d.doc?.iva_pct)) && Number(d.doc.iva_pct) >= 0
            ? Number(d.doc.iva_pct)
            : IVA_DEFECTO_PCT;
        return {
            ...d,
            doc: {
                ...d.doc,
                importe_total: totalDoc,
                iva_pct: pct,
                importe_sin_iva: Math.round((totalDoc / (1 + pct / 100)) * 100) / 100,
            },
        };
    }));

    return (
        <StepLayout
            question="¿Tienes el presupuesto o las facturas?"
            subtitle="Suéltalos y los leemos: importe, fecha y equipos. Así el expediente nace con todo hecho. Puedes saltártelo."
        >
            {leyendo && (
                <div className="mb-4 flex items-center justify-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <div className="relative w-5 h-5">
                        <div className="absolute inset-0 border-2 border-amber-500/20 rounded-full" />
                        <div className="absolute inset-0 border-2 border-transparent border-t-amber-400 rounded-full animate-spin" />
                    </div>
                    <span className="text-amber-200 text-[12px] font-bold uppercase tracking-widest">Leyendo el {leyendo}…</span>
                </div>
            )}

            {errorGlobal && (
                <div className="mb-4 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-100 text-[12px]">{errorGlobal}</div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                <Zona tipo="presupuesto" emoji="📋" titulo="Presupuesto" texto="El del instalador, antes de la obra. Fija el importe de la simulación." leyendo={leyendo} subir={subir} />
                <Zona tipo="factura" emoji="🧾" titulo="Factura(s)" texto="Si la obra ya está facturada. Si hay varias, súbelas todas." leyendo={leyendo} subir={subir} />
            </div>

            {docs.length > 0 && (
                <div className="space-y-2 mb-5">
                    {docs.map(d => (
                        <div key={d.id} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                            d.tipo === 'factura' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-sky-500/15 text-sky-300'
                                        }`}>{d.tipo}</span>
                                        <span className="text-white font-bold text-sm truncate">
                                            {d.doc?.numero_factura || d.files?.[0]?.name || 'Documento'}
                                        </span>
                                        {d.doc?.fecha_factura && <span className="text-white/35 text-[11px]">{d.doc.fecha_factura}</span>}
                                    </div>
                                    {d.doc?.partidas?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1.5">
                                            {d.doc.partidas.map(p => (
                                                <span key={p} className="px-1.5 py-0.5 rounded bg-white/[0.06] text-white/45 text-[9px] font-bold">{p}</span>
                                            ))}
                                        </div>
                                    )}
                                    {d.error && <div className="text-amber-300/80 text-[11px] mt-1.5">Lectura fallida — pon el importe (con IVA) a mano</div>}
                                </div>
                                <div className="flex items-start gap-2 shrink-0">
                                    <div>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={conIva(d.doc)}
                                                onChange={(e) => editarImporte(d.id, e.target.value)}
                                                className="w-28 bg-white/[0.05] border border-white/10 focus:border-amber-400 rounded-lg pl-2 pr-6 py-1.5 text-white text-sm font-bold text-right outline-none"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 text-xs pointer-events-none">€</span>
                                        </div>
                                        {/* La base imponible se enseña porque es OTRA cifra y va a otro sitio
                                            (el Anexo del expediente): sin verla, un total con IVA parece un
                                            dato mal leído. */}
                                        <div className="text-[10px] mt-1 text-right leading-tight">
                                            <span className="text-white/30">IVA incl.</span>
                                            <span className="text-white/25"> · base {eur(d.doc?.importe_sin_iva)} €</span>
                                            {d.doc?.iva_estimado && (
                                                <div className="text-amber-300/70">IVA estimado al {d.doc?.iva_pct ?? IVA_DEFECTO_PCT} %</div>
                                            )}
                                        </div>
                                    </div>
                                    <button onClick={() => quitar(d.id)} className="text-white/25 hover:text-red-400 p-1" title="Quitar">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    <p className="text-white/30 text-[10px] leading-relaxed px-1">
                        El importe es el TOTAL CON IVA — lo que paga el cliente, y lo que se lleva a la simulación.
                        La base imponible se guarda aparte: es la inversión que declarará el Anexo del expediente.
                        {' '}Si el titular es una empresa (se deduce el IVA), corrige el importe a la base.
                    </p>
                </div>
            )}

            {equipos.length > 0 && (
                <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-2">
                        Equipos leídos ({equipos.length}) — se guardan para el expediente
                    </div>
                    <ul className="space-y-1">
                        {equipos.slice(0, 6).map((e, i) => (
                            <li key={i} className="text-white/60 text-[12px] truncate">
                                <span className="text-white/30">{e.partida}</span>{' · '}
                                {[e.marca, e.modelo].filter(Boolean).join(' ') || e.descripcion}
                                {e.numero_serie && <span className="text-amber-400/80"> · S/N {e.numero_serie}</span>}
                            </li>
                        ))}
                        {equipos.length > 6 && <li className="text-white/25 text-[11px]">y {equipos.length - 6} más…</li>}
                    </ul>
                </div>
            )}

            {total > 0 && (
                <div className="mb-5 rounded-2xl border border-amber-500/35 bg-amber-500/[0.07] px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-amber-300/70">Inversión de la obra</div>
                        <div className="text-white/40 text-[11px] mt-0.5">
                            Según {base === 'facturas' ? 'las facturas aportadas' : 'el presupuesto aportado'} · IVA incluido
                            {estimado && <span className="text-amber-300/70"> · con IVA estimado</span>}
                        </div>
                    </div>
                    <div className="text-amber-400 text-2xl font-black whitespace-nowrap">{eur(total)} €</div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                    type="button"
                    onClick={() => onNext(0)}
                    disabled={!!leyendo}
                    className="px-6 py-3.5 rounded-2xl border border-white/12 text-white/50 hover:text-white/90 font-black uppercase tracking-widest text-[11px] transition-all disabled:opacity-30"
                >
                    No tengo — seguir sin adjuntar
                </button>
                <button
                    type="button"
                    onClick={() => onNext(total)}
                    disabled={!!leyendo || total <= 0}
                    className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep font-black uppercase tracking-widest text-[11px] shadow-lg shadow-amber-500/20 transition-all disabled:opacity-25 disabled:cursor-not-allowed"
                >
                    Continuar con {eur(total)} €
                </button>
            </div>
        </StepLayout>
    );
}
