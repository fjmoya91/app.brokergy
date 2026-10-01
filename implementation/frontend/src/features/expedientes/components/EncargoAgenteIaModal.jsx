// ============================================================================
// EncargoAgenteIaModal.jsx — encargar el CEE al AGENTE IA.
//
// Lo abre `EncargoCertificadorModal` cuando el técnico elegido es el agente
// (`esAgenteIa`), así que vale para las DOS superficies desde las que se
// encarga: el módulo CEE del expediente y la pestaña Seguimiento.
//
// Es otro popup y no el del técnico porque NADA de aquel aplica: el agente no
// tiene email ni teléfono (no hay mensaje que editar ni canal que elegir), el
// aviso al cliente le anunciaría la llamada de un técnico que no va a llamar, y
// el agente NO TRABAJA SOLO — lo que lo pone en marcha es pedírselo a Claude.
// Por eso lo que se enseña es eso: la frase para copiar, y qué pasa al terminar.
//
// Asignar ES el encargo (como el certificador de la casa): la ruta
// `notify-certificador` sin canales lo deja ENCARGADO (ASIGNADO), no
// «pendiente de enviar».
// ============================================================================
import React, { useState } from 'react';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { fraseParaClaude } from '../../../utils/agenteIa';

export function EncargoAgenteIaModal({
    expedienteId,
    numExp,
    certificador,
    certAnterior = null,
    apiBase = '/api/expedientes',
    onAntesDeEnviar,
    onCerrar,
    onHecho,
}) {
    const certId = certificador?.id_empresa || null;
    const frase = fraseParaClaude(numExp, 'inicial');
    const [cargando, setCargando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [copiado, setCopiado] = useState(false);

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(frase);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1800);
        } catch {
            // Sin https o con el portapapeles capado: se dice, no se calla.
            setCopiado('error');
        }
    };

    const encargar = async () => {
        if (onAntesDeEnviar) {
            try { await onAntesDeEnviar(); } catch {
                setResultado({ type: 'error', text: 'No se pudo guardar el módulo. Inténtalo de nuevo.' });
                return;
            }
        }
        if (!expedienteId) {
            setResultado({ type: 'error', text: 'Expediente no disponible.' });
            return;
        }
        setCargando(true);
        try {
            await axios.post(`${apiBase}/${expedienteId}/notify-certificador`, {
                certificador_id: certId,
                certificador_anterior: certAnterior,
                sendEmail: false,
                sendWhatsApp: false,
                phase: 'initial',
                template: 'standard',
            });
            setResultado({
                type: 'ok',
                title: 'Encargado al Agente IA',
                items: [
                    `${numExp || 'El expediente'} queda ENCARGADO al Agente IA`,
                    { texto: `Para que empiece, pídeselo en Claude: «${frase}»`, tono: 'aviso' },
                    { texto: 'Al terminar te avisa por WhatsApp y email, y pasa a «pendiente de revisión»', tono: 'info' },
                ],
            });
            if (onHecho) onHecho({ notificado: false, agente: true });
        } catch (err) {
            setResultado({ type: 'error', text: err.response?.data?.error || 'No se pudo encargar al Agente IA.' });
        } finally {
            setCargando(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4 max-md:items-end max-md:p-0"
                onClick={() => { if (!cargando && !resultado) onCerrar(false); }}>
                <div className="bg-bkg-deep border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl max-md:mx-0 max-md:rounded-b-none max-md:rounded-t-3xl max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center shrink-0 text-xl" aria-hidden>🤖</div>
                        <div>
                            <h4 className="text-sm font-black text-white uppercase tracking-widest">Encargar al Agente IA</h4>
                            <p className="text-[10px] text-white/40">CEE inicial de <span className="text-brand font-bold">{numExp}</span></p>
                        </div>
                    </div>

                    <p className="text-xs text-white/70 leading-relaxed mb-4">
                        El Agente IA prepara el <strong className="text-white">borrador del CEE</strong> con las skills:
                        lee las placas, cuenta las ventanas de cada fachada y deja el <span className="font-mono text-[11px]">.cex</span> en
                        la carpeta del CEE. <strong className="text-white">No firma ni registra</strong>: para eso, al
                        terminar, asignas el técnico.
                    </p>

                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 mb-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-300 mb-2">No trabaja solo · pídeselo en Claude</p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 min-w-0 truncate rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-[12px] text-white case-sensitive">{frase}</code>
                            <button type="button" onClick={copiar}
                                className="shrink-0 px-3 py-2 rounded-lg border border-white/15 text-[10px] font-black uppercase tracking-widest text-white/70 hover:text-white hover:border-white/30 transition-colors">
                                {copiado === true ? '✓ Copiado' : copiado === 'error' ? 'Cópialo a mano' : 'Copiar'}
                            </button>
                        </div>
                    </div>

                    <p className="text-[11px] text-white/45 leading-snug mb-5">
                        Al terminar te llega un aviso por <strong className="text-white/70">WhatsApp y email</strong>, igual
                        que cuando un técnico sube su archivo, y el CEE queda <strong className="text-white/70">pendiente de revisión</strong>.
                        Mientras tanto sale en Seguimiento, en «Encargados al Agente IA».
                    </p>

                    <div className="flex gap-3">
                        <button onClick={() => onCerrar(false)} disabled={cargando}
                            className="flex-1 px-4 py-2.5 max-md:py-3.5 rounded-xl border border-white/10 text-white/50 text-[11px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all">
                            Cancelar
                        </button>
                        <button onClick={encargar} disabled={cargando}
                            className="flex-1 px-5 py-2.5 max-md:py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 bg-brand text-black flex items-center justify-center gap-2">
                            {cargando
                                ? <><div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> Encargando…</>
                                : 'Encargar al Agente IA'}
                        </button>
                    </div>
                </div>
            </div>
            <SendActionOverlay
                phase={cargando ? 'sending' : (resultado ? 'done' : null)}
                ok={resultado?.type === 'ok'}
                subtitle={[numExp, 'Agente IA'].filter(Boolean).join(' · ')}
                items={resultado?.items || []}
                errorText={resultado?.type === 'error' ? resultado.text : ''}
                sendingTitle="Encargando al Agente IA…"
                okTitle={resultado?.title || 'Encargado al Agente IA'}
                errorTitle="No se pudo encargar"
                onClose={() => {
                    if (resultado?.type === 'ok') onCerrar(true);
                    else setResultado(null);
                }}
            />
        </>
    );
}

export default EncargoAgenteIaModal;
