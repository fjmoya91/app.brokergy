// ============================================================================
// GenerarCeeIaModal.jsx — el popup del botón CE3X: ¿cómo se hace el CEE inicial?
//
//   1. Con IA: el agente (Claude Opus por la API) lo hace entero con lo que hay
//      en la app y avisa al equipo. Lo atiende el PC (cola `cee_ia_trabajos`).
//   2. A mano, en la envolvente: por código, como siempre.
//
// Si la IA está trabajando, dice en qué va (se refresca solo) y deja cancelar.
// Si ya lo hizo, dice cuándo y deja abrirlo o rehacerlo (cuesta otra vez).
// Lo usan la calculadora (oportunidad) y el módulo CEE (CAE y CEE directos)
// con `useBotonCe3x`, así que se decide igual en los dos sitios.
// ============================================================================
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { esVivo, haceCuanto, fmtUsd, queHace } from './logic/ceeIa';

const Tarjeta = ({ icono, titulo, children, accion, tono = 'neutro' }) => (
    <div className={`rounded-xl border p-4 ${tono === 'ia' ? 'border-violet-400/35 bg-violet-400/[0.06]' : 'border-white/10 bg-white/[0.03]'}`}>
        <div className="flex items-center gap-2 mb-2">
            <span className="text-lg leading-none" aria-hidden>{icono}</span>
            <h5 className="text-[11px] font-black uppercase tracking-widest text-white">{titulo}</h5>
        </div>
        <div className="text-[12px] leading-relaxed text-white/65 space-y-1.5">{children}</div>
        {accion && <div className="mt-3">{accion}</div>}
    </div>
);

const Boton = ({ children, onClick, disabled, primario = false, peligro = false }) => (
    <button type="button" onClick={onClick} disabled={disabled}
        className={`w-full px-4 py-2.5 max-md:py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50
            ${primario ? 'bg-brand text-black shadow-lg'
                : peligro ? 'border border-red-400/40 text-red-300 hover:bg-red-500/10'
                    : 'border border-white/15 text-white/70 hover:text-white hover:border-white/30'}`}>
        {children}
    </button>
);

function LineaPc({ vigilante }) {
    if (!vigilante) return null;
    if (vigilante.listo) {
        return <p className="text-emerald-300/90">✓ El PC ({vigilante.equipo}) está atendiendo la cola · visto {haceCuanto(vigilante.visto_at)}</p>;
    }
    return (
        <p className="text-amber-300/90">
            ⚠ {vigilante.vivo ? vigilante.motivo : 'Ahora mismo no hay ningún PC atendiendo la cola'}
            {' '}— el encargo se queda en cola y empieza solo cuando el PC esté listo
            (<span className="font-mono text-[11px]">tools/banco-cee-api/atender.cmd</span>).
        </p>
    );
}

function Progreso({ t }) {
    const p = t.progreso || {};
    if (t.estado === 'EN_COLA') {
        return <p>⏳ <b className="text-white">En cola</b> desde {haceCuanto(t.pedido_at)}{t.pedido_por ? ` · lo pidió ${t.pedido_por}` : ''}.</p>;
    }
    return (
        <>
            <p>🤖 <b className="text-white">Trabajando</b>: {queHace(p.ultima)}.</p>
            <div className="grid grid-cols-3 gap-2 text-center">
                {[['Vueltas', p.vueltas || 0], ['Gastado', fmtUsd(p.coste_usd || 0)], ['Empezó', haceCuanto(t.tomado_at)]].map(([k, v]) => (
                    <div key={k} className="rounded-lg border border-white/10 bg-black/20 py-2">
                        <div className="text-[9px] font-black uppercase tracking-widest text-white/35">{k}</div>
                        <div className="text-[13px] font-bold text-white">{v}</div>
                    </div>
                ))}
            </div>
            <p className="text-white/45">Tope {fmtUsd(t.tope_usd)} · en el PC {t.equipo || '—'} · se actualiza solo.</p>
        </>
    );
}

function Resultado({ t }) {
    const r = t.resultado || {};
    const preguntas = r.preguntas || [];
    const titulo = t.estado === 'HECHO' ? '✓ Hecho' : t.estado === 'PARCIAL' ? '◐ A medias'
        : t.estado === 'CANCELADO' ? '✕ Cancelado' : '✕ No ha podido';
    return (
        <div className={`rounded-xl border p-3 text-[12px] ${t.estado === 'HECHO' ? 'border-emerald-400/30 bg-emerald-400/[0.05]'
            : t.estado === 'PARCIAL' ? 'border-amber-400/30 bg-amber-400/[0.05]' : 'border-red-400/30 bg-red-400/[0.05]'}`}>
            <p className="font-bold text-white">{titulo} <span className="font-normal text-white/45">· {haceCuanto(t.terminado_at)}{r.coste_usd != null ? ` · ${fmtUsd(r.coste_usd)}` : ''}{r.minutos ? ` · ${r.minutos} min` : ''}</span></p>
            {t.error && <p className="mt-1 text-red-200/90">{t.error}</p>}
            {preguntas.length > 0 && (
                <>
                    <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-300">Lo que pregunta la IA</p>
                    <ul className="mt-1 max-h-48 overflow-y-auto space-y-1">
                        {preguntas.map((q, i) => <li key={i} className="border-l-2 border-amber-400/60 pl-2 text-white/75">{q}</li>)}
                    </ul>
                </>
            )}
        </div>
    );
}

/**
 * @param {object} p
 * @param {object} p.estado      lo de `GET /api/cee-ia/...`
 * @param {Function} p.onAbrirEnvolvente
 * @param {Function} p.onPedir   ({ rehacer }) => Promise
 * @param {Function} p.onCancelar
 * @param {Function} p.onCerrar
 */
export function GenerarCeeIaModal({ estado, onAbrirEnvolvente, onPedir, onCancelar, onCerrar }) {
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const [confirmarRehacer, setConfirmarRehacer] = useState(false);
    const t = estado?.trabajo || null;
    const vivo = esVivo(t);
    const ia = estado?.ia || {};
    const vig = estado?.vigilante || null;

    const hacer = async (fn) => {
        setOcupado(true); setError(null);
        try { await fn(); }
        catch (e) { setError(e.response?.data?.error || e.message || 'No se ha podido.'); }
        finally { setOcupado(false); }
    };

    const generar = (rehacer = false) => hacer(() => onPedir({ rehacer }));

    let cuerpo;
    if (estado?.expediente) {
        cuerpo = (
            <Tarjeta icono="📁" titulo="Ya es un expediente">
                <p>Esta oportunidad ya se aceptó: es el expediente <b className="text-white">{estado.expediente.numero_expediente}</b>.
                   Su CEE se hace desde el módulo CEE del expediente (la envolvente salta sola allí).</p>
            </Tarjeta>
        );
    } else if (vivo) {
        cuerpo = (
            <Tarjeta icono="🤖" titulo="La IA está con este CEE" tono="ia"
                accion={<Boton peligro onClick={() => hacer(onCancelar)} disabled={ocupado || t.cancelar}>
                    {t.cancelar ? 'Parando… (al acabar la vuelta)' : t.estado === 'EN_COLA' ? 'Quitar de la cola' : 'Parar la IA'}
                </Boton>}>
                <Progreso t={t} />
                <p className="text-amber-200/80">No toques la envolvente mientras trabaja: lo que cambies ahí puede pisarlo al escribir.</p>
                {t.estado === 'EN_COLA' && <LineaPc vigilante={vig} />}
            </Tarjeta>
        );
    } else {
        cuerpo = (
            <div className="space-y-3">
                {t && !['HECHO'].includes(t.estado) && <Resultado t={t} />}
                {t?.atascado && <p className="text-[12px] text-amber-300">⚠ El último intento se quedó a medias: el PC dejó de responder. Puedes pedirlo otra vez.</p>}
                <Tarjeta icono="🤖" titulo={ia.hecho ? 'Rehacer con IA' : 'Generar con IA'} tono="ia"
                    accion={ia.hecho && !confirmarRehacer
                        ? <Boton onClick={() => setConfirmarRehacer(true)} disabled={ocupado}>Rehacer con IA…</Boton>
                        : <Boton primario onClick={() => generar(!!ia.hecho)} disabled={ocupado}>
                            {ocupado ? 'Apuntando…' : ia.hecho ? 'Sí, rehacerlo con IA' : 'Generar con IA'}
                          </Boton>}>
                    {ia.hecho ? (
                        <p>La IA ya lo hizo {haceCuanto(ia.at)}{ia.pdf ? ' (con XML y PDF)' : ' (sin PDF todavía)'}. Rehacerlo
                           escribe un borrador nuevo (el anterior va a OLD) y <b className="text-white">vuelve a costar</b>.</p>
                    ) : (
                        <p>El agente de IA (Claude Opus, esfuerzo alto) hace el CEE con lo que ya hay en la app —fotos, vídeos,
                           placas, presupuesto y Catastro—: envolvente, <span className="font-mono text-[11px]">.cex</span>, XML y PDF con
                           medidas de mejora y justificación. Al terminar avisa al equipo y queda pendiente de revisión.</p>
                    )}
                    <p className="text-white/45">Cuesta ~1,2–1,9 $ (hasta ~4 $ con vídeos), con tope de 10 $. Tarda 20–40 min.</p>
                    <LineaPc vigilante={vig} />
                </Tarjeta>
                <Tarjeta icono="✏️" titulo="Hacerlo yo en la envolvente"
                    accion={<Boton onClick={onAbrirEnvolvente}>Abrir la envolvente</Boton>}>
                    <p>Por código, como siempre: traes la envolvente de Catastro, señalas los huecos y generas el
                       <span className="font-mono text-[11px]"> .cex</span>. No gasta nada de la API.</p>
                </Tarjeta>
            </div>
        );
    }

    return createPortal(
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 max-md:items-end max-md:p-0"
            onClick={() => { if (!ocupado) onCerrar(); }}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[92vh] overflow-y-auto
                            max-md:rounded-b-none max-md:rounded-t-3xl max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-5">
                    <img src="/logo-ce3x.svg" alt="" aria-hidden="true" className="w-9 h-9 shrink-0" />
                    <div className="min-w-0">
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">CEE inicial</h4>
                        <p className="text-[10px] text-white/40 truncate"><span className="text-brand font-bold">{estado?.clave}</span> · ¿cómo lo hacemos?</p>
                    </div>
                    <button type="button" onClick={onCerrar} disabled={ocupado} aria-label="Cerrar"
                        className="ml-auto px-2 text-white/40 hover:text-white">✕</button>
                </div>
                {cuerpo}
                {error && <p className="mt-3 text-[12px] text-red-300">{error}</p>}
                {(vivo || estado?.expediente) && (
                    <div className="mt-4"><Boton onClick={onAbrirEnvolvente}>{vivo ? 'Abrir la envolvente (solo mirar)' : 'Abrir la envolvente'}</Boton></div>
                )}
            </div>
        </div>,
        document.body,
    );
}

export default GenerarCeeIaModal;
