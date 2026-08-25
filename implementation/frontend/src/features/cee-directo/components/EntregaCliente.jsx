import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Entrega del certificado al cliente.
//
// Normalmente esto NO se pulsa: en cuanto coinciden el cobro y el justificante
// de registro, el certificado sale solo. El panel existe para las tres cosas que
// el automático no puede hacer por sí mismo:
//
//   · DECIR QUÉ FALTA, en lenguaje de tarea ("Subir el PDF del CEE firmado"), en
//     vez de dejar al usuario preguntándose por qué no se ha enviado nada.
//   · Dejar constancia de que ya se envió, cuándo y por dónde.
//   · Permitir mandarlo a mano cuando el automático está apagado (en local
//     siempre lo está) o cuando falló un canal.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/cee-directos';

const FASES = { inicial: 'CEE inicial', final: 'CEE final' };

function Fila({ id, fase, etiqueta, onCambio }) {
    const [info, setInfo] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [confirmarReenvio, setConfirmarReenvio] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/${id}/entrega`, { params: { phase: fase } });
            setInfo(data);
        } catch { setInfo(null); }
    }, [id, fase]);

    useEffect(() => { cargar(); }, [cargar]);

    const entregar = async (reenviar = false) => {
        setEnviando(true);
        setResultado(null);
        try {
            const { data } = await axios.post(`${API}/${id}/entrega`, { phase: fase, reenviar });
            setResultado({ ok: true, texto: `Enviado por ${data.canales.join(' y ')}.` });
            setConfirmarReenvio(false);
            await cargar();
            onCambio?.();
        } catch (err) {
            const d = err.response?.data;
            setResultado({ ok: false, texto: d?.faltan?.join(' · ') || d?.error || 'No se pudo entregar.' });
        } finally {
            setEnviando(false);
        }
    };

    if (!info) return null;

    const { puede, faltan, yaEntregado, destinatario, ficheros } = info;

    return (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/35">{etiqueta}</div>

                    {yaEntregado ? (
                        <>
                            <div className="text-sm font-bold text-emerald-400 mt-1">✓ Entregado al cliente</div>
                            <div className="text-[11px] text-white/35 mt-0.5">
                                {new Date(yaEntregado.at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}
                                {' · '}{(yaEntregado.canales || []).join(' y ')}
                                {yaEntregado.automatica ? ' · automático' : ''}
                            </div>
                            {yaEntregado.ficheros?.length > 0 && (
                                <div className="text-[11px] text-white/25 mt-1">{yaEntregado.ficheros.join(' · ')}</div>
                            )}
                        </>
                    ) : puede ? (
                        <>
                            <div className="text-sm font-bold text-white mt-1">Listo para entregar</div>
                            <div className="text-[11px] text-white/35 mt-0.5">
                                A {destinatario.nombre || 'el cliente'}
                                {destinatario.email ? ` · ${destinatario.email}` : ''}
                                {destinatario.tlf ? ` · ${destinatario.tlf}` : ''}
                            </div>
                            <div className="text-[11px] text-white/25 mt-1">
                                Adjuntos: {[ficheros.pdf, ficheros.registro].filter(Boolean).join(' · ')}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-sm font-bold text-white/50 mt-1">Todavía no se puede entregar</div>
                            <ul className="mt-1.5 space-y-0.5">
                                {faltan.map((f, i) => (
                                    <li key={i} className="text-[11px] text-amber-400/80">• {f}</li>
                                ))}
                            </ul>
                        </>
                    )}
                </div>

                <div className="shrink-0">
                    {!yaEntregado && puede && (
                        <button onClick={() => entregar(false)} disabled={enviando}
                            className="min-h-[44px] px-4 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 transition-colors disabled:opacity-40">
                            {enviando ? 'Enviando…' : 'Entregar ahora'}
                        </button>
                    )}
                    {/* Reenviar pide confirmación: el cliente ya lo tiene, y recibir
                        el mismo certificado dos veces le hace dudar de cuál vale. */}
                    {yaEntregado && (
                        confirmarReenvio ? (
                            <div className="flex gap-2">
                                <button onClick={() => setConfirmarReenvio(false)}
                                    className="min-h-[44px] px-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
                                    No
                                </button>
                                <button onClick={() => entregar(true)} disabled={enviando}
                                    className="min-h-[44px] px-4 rounded-xl bg-amber-500 text-bkg-deep text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
                                    {enviando ? 'Enviando…' : 'Sí, reenviar'}
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setConfirmarReenvio(true)}
                                className="min-h-[44px] px-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white hover:border-white/25 transition-colors">
                                Reenviar
                            </button>
                        )
                    )}
                </div>
            </div>

            {resultado && (
                <div className={`mt-3 text-[11px] ${resultado.ok ? 'text-emerald-400' : 'text-red-400'}`}>{resultado.texto}</div>
            )}
        </div>
    );
}

export function EntregaCliente({ id, esDoble, autoAvisoRef, onCambio }) {
    const [auto, setAuto] = useState(null);

    useEffect(() => {
        axios.get(`${API}/${id}/entrega`, { params: { phase: 'inicial' } })
            .then(r => setAuto(r.data?.autoActivado))
            .catch(() => setAuto(null));
    }, [id]);

    return (
        <div className="mt-6 rounded-2xl border border-white/[0.06] bg-bkg-surface/40 p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-xs font-black text-white uppercase tracking-widest border-l-2 border-brand pl-4">
                    Entrega al cliente
                </h3>
            </div>

            <p className="text-[11px] text-white/30 mb-4">
                Se envía solo —por email y WhatsApp, con el certificado firmado y el justificante de
                registro adjuntos— en cuanto el expediente está cobrado y el registro subido.
            </p>

            {/* Que el automático esté apagado tiene que verse. Sin este aviso, en
                local se marca cobrado, no pasa nada, y parece que está roto. */}
            {auto === false && (
                <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[11px] text-amber-300">
                    El envío <strong>automático</strong> está apagado en este entorno
                    (<code className="font-mono">CEE_ENTREGA_AUTO=false</code>). El botón de entregar a mano sí funciona.
                </div>
            )}

            <div className="space-y-3">
                <Fila id={id} fase="inicial" etiqueta={esDoble ? FASES.inicial : 'Certificado'} onCambio={onCambio} />
                {esDoble && <Fila id={id} fase="final" etiqueta={FASES.final} onCambio={onCambio} />}
            </div>
        </div>
    );
}

export default EntregaCliente;
