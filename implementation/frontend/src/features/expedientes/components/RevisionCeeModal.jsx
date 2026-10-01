// ============================================================================
// RevisionCeeModal — el INFORME de la revisión del CEE que entrega el
// certificador, antes de darle el visto bueno.
//
// El juicio NO se hace aquí: lo hace el backend (`POST /:id/revisar-cee`, que
// llama al MISMO `services/cee/revisionCee.js` que el CLI y la skill
// `revisar-cee`). Esta pantalla solo lo pide y lo enseña.
//
// REGLA — se empieza por lo que DECIDE el veredicto: fallos, luego avisos,
// luego lo que no se ha podido mirar. Lo correcto y lo informativo va plegado:
// es lo que no hay que mirar.
//
// REGLA — propone, no aprueba. «Dar el visto bueno» abre el popup de siempre;
// con NO APTO se pregunta antes, pero no se bloquea: la decisión es de Fran.
// ============================================================================
import { useEffect, useState } from 'react';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { useModal } from '../../../context/ModalContext';

const TONO = {
    falla: { icono: '✗', clase: 'text-red-400', caja: 'border-red-500/25 bg-red-500/[0.06]' },
    aviso: { icono: '!', clase: 'text-amber-400', caja: 'border-amber-500/25 bg-amber-500/[0.06]' },
    no_comprobable: { icono: '?', clase: 'text-white/50', caja: 'border-white/10 bg-white/[0.03]' },
    info: { icono: 'i', clase: 'text-cyan-400', caja: 'border-white/10 bg-white/[0.02]' },
    ok: { icono: '✓', clase: 'text-emerald-400', caja: 'border-white/10 bg-white/[0.02]' },
};

const VEREDICTO = {
    'APTO': { clase: 'text-emerald-400', fondo: 'bg-emerald-500/15 border-emerald-500/30', corto: 'APTO' },
    'APTO CON AVISOS': { clase: 'text-amber-400', fondo: 'bg-amber-500/15 border-amber-500/30', corto: 'CON AVISOS' },
    'NO APTO': { clase: 'text-red-400', fondo: 'bg-red-500/15 border-red-500/30', corto: 'NO APTO' },
};

const hace = (iso) => {
    if (!iso) return '';
    const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (min < 1) return 'ahora mismo';
    if (min < 60) return `hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `hace ${h} h`;
    return `hace ${Math.round(h / 24)} días`;
};

function Punto({ p }) {
    const t = TONO[p.estado] || TONO.info;
    return (
        <div className={`rounded-xl border px-3 py-2.5 ${t.caja}`}>
            <p className="text-[12px] font-bold text-white flex gap-2">
                <span className={`${t.clase} font-black w-3 shrink-0`}>{t.icono}</span>{p.titulo}
            </p>
            {p.dice && <p className="text-[11px] text-white/70 mt-1 pl-5 break-words"><span className="text-white/35">dice · </span>{p.dice}</p>}
            {p.esperado && <p className="text-[11px] text-white/70 pl-5 break-words"><span className="text-white/35">esperado · </span>{p.esperado}</p>}
            {p.detalle && <p className="text-[11px] text-white/45 mt-1 pl-5 break-words">→ {p.detalle}</p>}
        </div>
    );
}

export default function RevisionCeeModal({ expediente, fase = 'inicial', apiBase = '/api/expedientes', onClose, onRefresh, onApprove }) {
    const { showConfirm } = useModal();
    const guardada = expediente?.cee?.[`revision_${fase}`] || null;
    //: El informe completo solo existe tras revisar en esta sesión; lo guardado
    //: son los puntos que NO están en verde (metadatos), y con eso basta para
    //: abrir el modal sin volver a revisar.
    const [informe, setInforme] = useState(null);
    const [fase_, setFase] = useState(null);              // null | 'sending' | 'done'
    const [error, setError] = useState('');
    const [verOk, setVerOk] = useState(false);
    const [medida, setMedida] = useState({ phase: null, ok: false, items: [], error: '' });

    const revisar = async () => {
        setFase('sending'); setError('');
        try {
            const { data } = await axios.post(`${apiBase}/${expediente.id}/revisar-cee?fase=${fase}`);
            setInforme(data);
            setFase(null);
            if (onRefresh) onRefresh();
        } catch (e) {
            setError(e.response?.data?.error || e.message);
            setFase('done');
        }
    };

    // Sin revisión guardada, se revisa al abrir: es lo que se ha venido a hacer.
    // Diferido y cancelable: en modo estricto React monta dos veces, y sin el
    // `clearTimeout` saldrían DOS revisiones (dos descargas de Drive y dos
    // lecturas del motor) por abrir el modal una vez.
    useEffect(() => {
        if (guardada) return undefined;
        const t = setTimeout(revisar, 0);
        return () => clearTimeout(t);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const datos = informe
        ? { veredicto: informe.veredicto, resumen: informe.resumen, fuentes: informe.fuentes,
            puntos: informe.comprobaciones, at: informe.guardado?.at, por: informe.guardado?.por }
        : guardada;
    const puntos = datos?.puntos || [];
    const orden = ['falla', 'aviso', 'no_comprobable'];
    const importantes = orden.flatMap((e) => puntos.filter((p) => p.estado === e));
    const resto = puntos.filter((p) => p.estado === 'ok' || p.estado === 'info');
    const faltaMedida = puntos.some((p) => p.accion === 'poner_medida');
    const v = VEREDICTO[datos?.veredicto] || null;

    const ponerMedida = async () => {
        setMedida({ phase: 'sending', ok: false, items: [], error: '' });
        try {
            const { data } = await axios.post(`${apiBase}/${expediente.id}/cee/poner-medida`);
            setMedida({
                phase: 'done', ok: true, error: '',
                items: [
                    `Medida: ${data.medidas.join(' · ')}`,
                    `Guardado junto al del técnico: ${data.nombre}`,
                    { texto: 'Falta CALCULARLA: ábrelo en CE3X → Medidas de Mejora → «Actualizar», y guárdalo como el .cex del certificado.', tono: 'aviso' },
                    ...(data.avisos || []).slice(0, 4).map((a) => ({ texto: a, tono: 'info' })),
                ],
                link: data.link,
            });
        } catch (e) {
            setMedida({ phase: 'done', ok: false, items: [], error: e.response?.data?.error || e.message });
        }
    };

    const darVisto = async () => {
        if (datos?.veredicto === 'NO APTO') {
            const si = await showConfirm(
                'La revisión ha salido NO APTO. Si das el visto bueno, el certificador registrará el certificado tal cual.',
                '¿Dar el visto bueno igualmente?', 'warning',
                { confirmar: 'Sí, dar el visto bueno', cancelar: 'No, revisarlo antes' });
            if (!si) return;
        }
        onApprove?.(fase);
    };

    return (
        <>
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in max-md:items-end"
                 onClick={() => { if (fase_ !== 'sending') onClose?.(); }}>
                <div className="bg-bkg-deep border border-white/10 rounded-2xl max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden max-md:mx-0 max-md:rounded-b-none max-md:rounded-t-3xl max-md:max-h-[92dvh]"
                     onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-3 px-6 pt-5 pb-4 border-b border-white/[0.06] shrink-0 max-md:px-5">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-white/5">
                            <svg className="w-5 h-5 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
                        </div>
                        <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-black text-white uppercase tracking-widest">Revisión CEE {fase === 'final' ? 'final' : 'inicial'}</h4>
                            <p className="text-[10px] text-white/40 truncate">
                                {datos?.at ? `${hace(datos.at)}${datos.por ? ` · ${datos.por}` : ''}` : 'Sin revisar todavía'}
                                {datos?.fuentes?.cex ? ` · .cex: ${datos.fuentes.cex}` : datos ? ' · sin .cex' : ''}
                            </p>
                        </div>
                        {v && <span className={`px-3 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest ${v.fondo} ${v.clase}`}>{datos.veredicto}</span>}
                    </div>

                    <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar px-6 py-4 space-y-2 max-md:px-5">
                        {!datos && fase_ === 'sending' && <p className="text-[12px] text-white/50">Revisando…</p>}
                        {datos && (
                            <p className="text-[11px] text-white/45 mb-1">
                                {datos.resumen?.fallas || 0} fallos · {datos.resumen?.avisos || 0} avisos · {datos.resumen?.no_comprobables || 0} sin comprobar · {datos.resumen?.ok || 0} correctos
                            </p>
                        )}
                        {datos?.fuentes?.cex_error && (
                            <p className="text-[11px] text-amber-400">! No se ha podido leer el .cex: {datos.fuentes.cex_error}</p>
                        )}
                        {datos && !datos.fuentes?.cex && !datos.fuentes?.cex_error && (
                            <p className="text-[11px] text-amber-400">! No hay .cex del técnico en la carpeta: la medida de mejora, el depósito y los huecos no se han podido revisar.</p>
                        )}
                        {importantes.map((p, i) => <Punto key={`${p.id}-${i}`} p={p} />)}
                        {datos && !importantes.length && (
                            <p className="text-[12px] text-emerald-400 font-bold">Todo lo comprobado está correcto.</p>
                        )}
                        {resto.length > 0 && (
                            <div className="pt-2">
                                <button type="button" onClick={() => setVerOk((x) => !x)} className="text-[10px] font-black uppercase tracking-widest text-white/35 hover:text-white/70">
                                    {verOk ? '▾' : '▸'} {resto.length} correctos o informativos
                                </button>
                                {verOk && <div className="space-y-2 mt-2">{resto.map((p, i) => <Punto key={`r-${p.id}-${i}`} p={p} />)}</div>}
                            </div>
                        )}
                        {informe === null && guardada && (
                            <p className="text-[10px] text-white/30 pt-1">Se enseña la última revisión guardada (solo lo que no estaba en verde). «Volver a revisar» la rehace con los ficheros de ahora.</p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2 px-6 py-4 border-t border-white/[0.06] shrink-0 max-md:px-5 max-md:pb-[max(1rem,env(safe-area-inset-bottom))]">
                        <button type="button" onClick={revisar} disabled={fase_ === 'sending'}
                                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-[10px] font-black uppercase tracking-widest hover:text-white disabled:opacity-40">
                            {datos ? '↻ Volver a revisar' : 'Revisar'}
                        </button>
                        {faltaMedida && (
                            <button type="button" onClick={ponerMedida} disabled={medida.phase === 'sending'}
                                    className="px-4 py-2.5 rounded-xl bg-brand/15 border border-brand/30 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/25 disabled:opacity-40">
                                🧩 Poner la medida
                            </button>
                        )}
                        <div className="flex-1" />
                        <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white">Cerrar</button>
                        {onApprove && datos && (
                            <button type="button" onClick={darVisto}
                                    className="px-4 py-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white">
                                ✓ Dar el visto bueno
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <SendActionOverlay
                phase={fase_}
                ok={false}
                icon="read"
                subtitle={expediente?.numero_expediente}
                sendingTitle="Revisando el CEE…"
                errorTitle="No se ha podido revisar"
                errorText={error}
                onClose={() => setFase(null)}
            />
            <SendActionOverlay
                phase={medida.phase}
                ok={medida.ok}
                icon="read"
                subtitle={expediente?.numero_expediente}
                sendingTitle="Poniendo la medida de mejora…"
                okTitle="Medida puesta en el .cex"
                errorTitle="No se ha podido poner la medida"
                items={medida.items}
                errorText={medida.error}
                accion={medida.link ? { etiqueta: 'Abrir en Drive', onClick: () => window.open(medida.link, '_blank', 'noopener') } : undefined}
                onClose={() => setMedida({ phase: null, ok: false, items: [], error: '' })}
            />
        </>
    );
}
