// ============================================================================
// CeeFinalDesdeMedidaModal — el CEE FINAL desde la MEDIDA DE MEJORA del CEE
// inicial que entregó el técnico.
//
// Lo monta el backend (`POST /:id/cee/final-desde-medida`, que llama a
// `services/cee/ceeFinalDesdeMedida.js` y al motor): esta pantalla solo enseña
// el análisis, deja elegir la medida del final y sus fechas, y lo pide.
//
// REGLA — se ve ANTES de escribir: qué medida del inicial se usa, qué equipos
// lleva el final y qué debe dar al calificarlo en CE3X. Es lo que hay que poder
// contrastar después con el .xml, y sin verlo aquí no se comprueba nunca.
//
// REGLA — las fechas vienen puestas con HOY pero se ven y se cambian: se
// imprimen en el certificado y son con las que el técnico tiene que firmarlo.
//
// De momento RES060 y RES093 (el botón solo sale ahí). RES080 es la fase 2.
// ============================================================================
import { useEffect, useState } from 'react';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { CampoDecimal } from '../../../components/CampoDecimal';
import { medidaAislamiento } from '../../cee-envolvente/logic/medidasAislamiento';

const SLOT = {
    ACS: 'ACS', calefaccion: 'Calefacción', refrigeracion: 'Refrigeración',
    climatizacion: 'Calef. + refrig.', mixto2: 'Calef. + ACS', mixto3: 'Calef. + refrig. + ACS',
};
const SERV = { calefaccion: 'calef.', acs: 'ACS', refrigeracion: 'refrig.' };

/** Hoy en la zona de quien mira, como AAAA-MM-DD (nunca partiendo un ISO). */
const hoy = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const coma = (n) => (n == null ? '—' : String(n).replace('.', ','));

function Equipos({ equipos = [], renovable = false }) {
    return (
        <div className="space-y-1">
            {equipos.map((e, i) => (
                <div key={`${e.nombre}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-white/50 text-[9px] font-black uppercase tracking-wider">{SLOT[e.slot] || e.slot}</span>
                    <span className="text-white font-bold">{e.nombre}</span>
                    {Object.entries(e.servicios || {}).map(([k, v]) => (
                        <span key={k} className={`text-[10px] ${Number(v?.pct) === 100 ? 'text-emerald-400' : 'text-amber-300'}`}>
                            {SERV[k] || k} {coma(v?.pct)} %
                        </span>
                    ))}
                </div>
            ))}
            {renovable && <p className="text-[11px] text-white/50">+ placas solares existentes (contribuciones energéticas)</p>}
        </div>
    );
}

function Resultado({ r, titulo }) {
    if (!r) return null;
    const celda = (etq, v, letra) => (
        <div className="flex-1 min-w-[90px] rounded-lg bg-white/[0.03] border border-white/10 px-2.5 py-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/40">{etq}</p>
            <p className="text-[13px] text-white font-bold">{coma(v)} <span className="text-brand">{letra || ''}</span></p>
        </div>
    );
    return (
        <div>
            <p className="text-[10px] text-white/45 mb-1">{titulo}</p>
            <div className="flex flex-wrap gap-2">
                {celda('Emisiones', r.emisiones, r.emisiones_letra)}
                {celda('E. primaria no renov.', r.epnr, r.epnr_letra)}
                {celda('Demanda calef.', r.demanda_cal, r.demanda_cal_letra)}
            </div>
        </div>
    );
}

export default function CeeFinalDesdeMedidaModal({ expediente, apiBase = '/api/expedientes', onClose }) {
    const [datos, setDatos] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState('');
    const [marcadas, setMarcadas] = useState([]);
    const [textos, setTextos] = useState({});
    //: Qué texto ha reescrito la persona: lo reescrito MANDA; lo demás se
    //: recompone al cambiar la solución o el espesor del aislamiento.
    const [editados, setEditados] = useState({});
    //: Solución y espesor de cada medida de aislamiento: { [id]: {solucion, espesor_cm} }.
    const [params, setParams] = useState({});
    const [fechaEmision, setFechaEmision] = useState(hoy());
    const [fechaVisita, setFechaVisita] = useState(hoy());
    const [envio, setEnvio] = useState({ phase: null, ok: false, items: [], error: '', link: null });

    const url = `${apiBase}/${expediente.id}/cee/final-desde-medida`;

    // Diferido y cancelable, como la revisión: en modo estricto React monta dos
    // veces y sin esto el motor leería el .cex dos veces por abrir el popup.
    useEffect(() => {
        let vivo = true;
        const t = setTimeout(async () => {
            try {
                const { data } = await axios.post(url, { escribir: false });
                if (!vivo) return;
                setDatos(data);
                setMarcadas(data.marcadas || []);
                setTextos(Object.fromEntries((data.catalogo || [])
                    .filter((m) => m.datos)
                    .map((m) => [m.id, { nombre: m.datos.nombre || '', caracteristicas: m.datos.caracteristicas || '',
                                         otros_datos: m.datos.otros_datos || '' }])));
            } catch (e) {
                if (vivo) setErrorCarga(e.response?.data?.error || e.message);
            } finally {
                if (vivo) setCargando(false);
            }
        }, 0);
        return () => { vivo = false; clearTimeout(t); };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const a = datos?.analisis;
    const res = a?.resultados;
    const alternar = (id) => setMarcadas((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
    const cambiarTexto = (id, k, v) => {
        setTextos((t) => ({ ...t, [id]: { ...(t[id] || {}), [k]: v } }));
        setEditados((x) => ({ ...x, [id]: { ...(x[id] || {}), [k]: true } }));
    };

    //: Una medida de aislamiento se RECOMPONE con la solución y el espesor
    //: elegidos, con el MISMO módulo que usa el backend: la U y el texto que se
    //: ven son los que se escriben.
    const vivo = (m) => {
        if (!m.elemento || !a) return m;
        const p = params[m.id] || {};
        return { ...m, ...medidaAislamiento({
            elemento: m.elemento, solucion: p.solucion ?? m.solucion, espesorCm: p.espesor_cm ?? m.espesorCm,
            cerramientos: a.cerramientos || [] }), porDefecto: m.porDefecto };
    };
    const catalogo = (datos?.catalogo || []).map(vivo);
    const texto = (m, k) => (m.elemento && !editados[m.id]?.[k]
        ? (m.datos?.[k] || '') : (textos[m.id]?.[k] ?? ''));
    const cambiarParam = (id, k, v) => setParams((x) => ({ ...x, [id]: { ...(x[id] || {}), [k]: v } }));
    const u2 = (xs = []) => [...new Set(xs.map((x) => coma(Number(x).toFixed(2))))].join(' / ');

    const generar = async () => {
        setEnvio({ phase: 'sending', ok: false, items: [], error: '', link: null });
        try {
            //: Se manda lo que se VE: el texto de cada medida marcada, y la
            //: solución y el espesor de las de aislamiento (el backend las
            //: recompone con ellos y aplica encima el texto).
            const textosEnvio = Object.fromEntries(catalogo.filter((m) => marcadas.includes(m.id) && m.datos)
                .map((m) => [m.id, { nombre: texto(m, 'nombre'), caracteristicas: texto(m, 'caracteristicas'),
                                     otros_datos: texto(m, 'otros_datos') }]));
            const paramsEnvio = Object.fromEntries(catalogo.filter((m) => m.elemento)
                .map((m) => [m.id, { solucion: m.solucion, espesor_cm: m.espesorCm }]));
            const { data } = await axios.post(url, {
                escribir: true, fecha_emision: fechaEmision, fecha_visita: fechaVisita,
                medidas: marcadas, textos: textosEnvio, params: paramsEnvio,
            });
            const f = data.analisis?.resultados?.final;
            setEnvio({
                phase: 'done', ok: true, error: '', link: data.guardado?.carpeta_link || data.guardado?.link,
                items: [
                    `Guardado en «${data.guardado?.carpeta}» como ${data.guardado?.nombre}`,
                    ...(data.guardado?.archivado ? [{ texto: `El anterior se archiva en OLD (${data.guardado.archivado})`, tono: 'info' }] : []),
                    data.medidas_final?.length
                        ? `Medida de mejora: ${data.medidas_final.join(' · ')}`
                        : { texto: 'Sin medida de mejora: defínela en CE3X antes de emitirlo.', tono: 'aviso' },
                    { texto: 'Falta CALCULARLO: ábrelo en CE3X → Calificar, y en Medidas de Mejora pulsa «Actualizar».', tono: 'aviso' },
                    ...(f ? [{ texto: `Al calificarlo debe dar: emisiones ${coma(f.emisiones)} (${f.emisiones_letra}) · EPNR ${coma(f.epnr)} (${f.epnr_letra}). Si sale otra cosa, no lo emitas.`, tono: 'info' }] : []),
                    { texto: 'Exporta el .xml y el .pdf, guárdalo como «– CEE FINAL» y súbelo a la fila del CEE final: de ahí, revisión, visto bueno y firma.', tono: 'info' },
                ],
            });
        } catch (e) {
            setEnvio({ phase: 'done', ok: false, items: [], error: e.response?.data?.error || e.message, link: null });
        }
    };

    const puedeGenerar = !!datos && envio.phase !== 'sending' && fechaEmision && fechaVisita;

    return (
        <>
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in max-md:items-end"
                 onClick={() => { if (envio.phase !== 'sending') onClose?.(); }}>
                <div className="bg-bkg-deep border border-white/10 rounded-2xl max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden max-md:mx-0 max-md:rounded-b-none max-md:rounded-t-3xl max-md:max-h-[92dvh]"
                     onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-white/[0.06] shrink-0 max-md:px-5">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-brand/15">
                            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-3-3v6M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-black text-white uppercase tracking-widest">Generar el CEE final</h4>
                            <p className="text-[10px] text-white/40 truncate">
                                {expediente?.numero_expediente} · desde la medida de mejora del CEE inicial del técnico
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-6 py-4 space-y-4 max-md:px-5">
                        {cargando && <p className="text-[12px] text-white/50">Leyendo el CEE inicial del técnico…</p>}
                        {errorCarga && (
                            <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2.5 text-[12px] text-red-300">{errorCarga}</div>
                        )}

                        {datos && (
                            <>
                                <p className="text-[11px] text-white/55">
                                    Se copia <span className="text-white font-bold">{datos.base}</span> tal cual (envolvente, datos, técnico e imágenes)
                                    y su «edificio mejorado» pasa a ser el CEE final.
                                </p>

                                <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Instalación del CEE final</p>
                                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${a.medida_inicial.calculada ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}>
                                            {a.medida_inicial.calculada ? 'Medida calculada' : 'Medida sin calcular'}
                                        </span>
                                        {!!a.medida_inicial.desfase?.length && (
                                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border text-amber-400 border-amber-500/30 bg-amber-500/10">Desfasada</span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-white/45">La de la medida «{a.medida_inicial.nombre}»:</p>
                                    <Equipos equipos={a.equipos_final} renovable={a.tiene_renovable} />
                                </section>

                                {res?.final && (
                                    <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Al calificarlo en CE3X debe dar</p>
                                        <Resultado r={res.final} titulo="CEE final (lo que CE3X calculó para esa medida)" />
                                        <Resultado r={res.inicial} titulo="CEE inicial, para comparar" />
                                    </section>
                                )}

                                <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Medida de mejora del CEE final</p>
                                    {catalogo.map((m) => {
                                        const on = marcadas.includes(m.id);
                                        return (
                                            <div key={m.id} className={`rounded-lg border px-3 py-2.5 ${on ? 'border-brand/40 bg-brand/[0.06]' : 'border-white/10'}`}>
                                                <label className={`flex items-start gap-2 ${m.disponible ? 'cursor-pointer' : 'opacity-60'}`}>
                                                    <input type="checkbox" className="mt-0.5 accent-[#f2a640]" disabled={!m.disponible}
                                                           checked={on} onChange={() => alternar(m.id)} />
                                                    <span className="text-[12px] text-white font-bold">{m.titulo}</span>
                                                </label>
                                                {!m.disponible && m.motivo && <p className="text-[11px] text-white/45 mt-1 pl-6">{m.motivo}</p>}
                                                {on && m.disponible && (
                                                    <div className="mt-2 pl-6 space-y-2">
                                                        {m.elemento && (
                                                            <div className="space-y-2">
                                                                <div className="flex flex-wrap gap-2 items-end">
                                                                    <label className="text-[10px] text-white/45 flex flex-col gap-1 flex-1 min-w-[200px]">Solución
                                                                        <select value={m.solucion}
                                                                                onChange={(e) => {
                                                                                    const sol = m.soluciones.find((x) => x.id === e.target.value);
                                                                                    setParams((x) => ({ ...x, [m.id]: { solucion: sol.id, espesor_cm: sol.espesorCm } }));
                                                                                }}
                                                                                className="no-uppercase bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-[12px] text-white max-md:text-[16px]">
                                                                            {m.soluciones.map((s) => <option key={s.id} value={s.id}>{s.etiqueta}</option>)}
                                                                        </select>
                                                                    </label>
                                                                    <label className="text-[10px] text-white/45 flex flex-col gap-1 w-24">Espesor (cm)
                                                                        <CampoDecimal valor={m.espesorCm}
                                                                                      onCambio={(v) => { if (v > 0) cambiarParam(m.id, 'espesor_cm', v); }}
                                                                                      className="bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-[12px] text-white max-md:text-[16px]" />
                                                                    </label>
                                                                </div>
                                                                <p className="text-[11px] text-white/60">
                                                                    λ {coma(m.lambda)} W/m·K · U <span className="text-white/80">{u2(m.u_antes)}</span> → <span className="text-emerald-400 font-bold">{u2(m.u_despues)}</span> W/m²·K
                                                                    <span className="text-white/40"> · {coma(m.superficie)} m² ({(m.cerramientos || []).join(', ')})</span>
                                                                </p>
                                                            </div>
                                                        )}
                                                        <input value={texto(m, 'nombre')} onChange={(e) => cambiarTexto(m.id, 'nombre', e.target.value)}
                                                               className="no-uppercase w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white max-md:text-[16px]" />
                                                        <textarea rows={m.elemento ? 5 : 3} value={texto(m, 'caracteristicas')} onChange={(e) => cambiarTexto(m.id, 'caracteristicas', e.target.value)}
                                                                  className="no-uppercase w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/85 max-md:text-[16px]" />
                                                        <label className="text-[10px] text-white/45 flex flex-col gap-1">Otros datos
                                                            <input value={texto(m, 'otros_datos')} onChange={(e) => cambiarTexto(m.id, 'otros_datos', e.target.value)}
                                                                   className="no-uppercase w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white/80 max-md:text-[16px]" />
                                                        </label>
                                                        {m.equipos && (
                                                            <div>
                                                                <p className="text-[10px] text-white/40 mb-1">Cómo queda la instalación con esta medida:</p>
                                                                <Equipos equipos={m.equipos} renovable={a.tiene_renovable} />
                                                            </div>
                                                        )}
                                                        {m.nota && <p className="text-[11px] text-white/45">{m.nota}</p>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {!marcadas.length && (
                                        <p className="text-[11px] text-amber-400">! Sin medida marcada el final sale sin medida de mejora: habría que definirla en CE3X antes de emitirlo.</p>
                                    )}
                                </section>

                                <section className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Fechas del CEE final</p>
                                    <div className="flex flex-wrap gap-3">
                                        <label className="text-[11px] text-white/55 flex flex-col gap-1">Emisión
                                            <input type="date" value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)}
                                                   className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white max-md:text-[16px]" />
                                        </label>
                                        <label className="text-[11px] text-white/55 flex flex-col gap-1">Visita
                                            <input type="date" value={fechaVisita} onChange={(e) => setFechaVisita(e.target.value)}
                                                   className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white max-md:text-[16px]" />
                                        </label>
                                    </div>
                                    <p className="text-[10px] text-white/40">Se imprimen en el certificado: la de emisión es con la que el técnico tiene que firmarlo.</p>
                                </section>

                                {!!datos.avisos?.length && (
                                    <div className="space-y-1">
                                        {datos.avisos.map((x, i) => <p key={i} className="text-[11px] text-amber-400">! {x}</p>)}
                                    </div>
                                )}
                                <p className="text-[10px] text-white/35">
                                    Se guarda como «{datos.nombre}» en «{datos.carpeta}». Lleva «_REVISAR»: la app no lo toma por la entrega del técnico
                                    hasta que se calcule en CE3X y se suba como «– CEE FINAL».
                                </p>
                            </>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-white/[0.06] shrink-0 max-md:px-5 max-md:pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <div className="flex-1" />
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white">Cerrar</button>
                        {datos && (
                            <button type="button" onClick={generar} disabled={!puedeGenerar}
                                    className="px-4 py-2.5 rounded-xl bg-brand/20 border border-brand/40 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand hover:text-white disabled:opacity-40">
                                Generar CEE final
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <SendActionOverlay
                phase={envio.phase}
                ok={envio.ok}
                icon="upload"
                subtitle={expediente?.numero_expediente}
                sendingTitle="Montando el CEE final…"
                okTitle="CEE final guardado en Drive"
                errorTitle="No se ha podido generar el CEE final"
                items={envio.items}
                errorText={envio.error}
                accion={envio.link ? { etiqueta: 'Abrir la carpeta', onClick: () => window.open(envio.link, '_blank', 'noopener') } : undefined}
                onClose={() => { const ok = envio.ok; setEnvio({ phase: null, ok: false, items: [], error: '', link: null }); if (ok) onClose?.(); }}
            />
        </>
    );
}
