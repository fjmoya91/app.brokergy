import { useState } from 'react';
import axios from 'axios';
import { DocsManager } from '../../docs/DocsManager';
import { API_DOCS_CEE_DIRECTO } from '../../docs/docsApi';

// ─────────────────────────────────────────────────────────────────────────────
// Las fotos y papeles con los que el técnico hace el CEE (fachada, patios,
// vídeo, planos, CEE anterior) en la ficha de un CEE directo.
//
// Es el MISMO gestor que el CAE (`DocsManager`), apuntado a las rutas de CEE
// directos: subir, ver, validar o rechazar foto a foto y el buzón para soltar
// varias. Lo ve también el técnico asignado —son sus fotos de trabajo—; pedirle
// lo que falta al cliente es cosa del equipo.
// ─────────────────────────────────────────────────────────────────────────────
export function DocumentacionCee({ id, esEquipo, esAdmin }) {
    const [abierto, setAbierto] = useState(true);
    const [pidiendo, setPidiendo] = useState(false);
    const [aviso, setAviso] = useState(null);   // { tono, texto }
    const [clave, setClave] = useState(0);      // fuerza recarga del gestor

    const pedir = async () => {
        setPidiendo(true); setAviso(null);
        try {
            const { data } = await axios.post(`/api/cee-directos/${id}/docs/enviar-enlace`, {});
            setAviso({ tono: 'ok', texto: `Enlace enviado al cliente por ${data.canales.join(' y ')}.` });
        } catch (err) {
            const r = err.response?.data;
            setAviso({ tono: 'error', texto: `${r?.error || 'No se pudo enviar.'}${r?.url ? ` Enlace: ${r.url}` : ''}` });
        } finally { setPidiendo(false); }
    };

    return (
        <div className="mb-6 rounded-2xl border border-white/[0.06] bg-bkg-surface/60">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <button type="button" onClick={() => setAbierto(v => !v)} className="text-left">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/50">
                        {abierto ? '▾' : '▸'} Documentación para el CEE
                    </div>
                    <div className="text-[11px] text-white/30 mt-0.5">Fachada, patios, vídeo y planos · se guarda en «4. DOCUMENTACIÓN PARA CEE»</div>
                </button>
                {esEquipo && (
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setClave(k => k + 1)}
                            className="min-h-[36px] px-3 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white">
                            Recargar
                        </button>
                        <button type="button" onClick={pedir} disabled={pidiendo}
                            className="min-h-[36px] px-3 rounded-lg border border-brand/30 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/20 disabled:opacity-40">
                            {pidiendo ? 'Enviando…' : '📩 Pedir lo que falta al cliente'}
                        </button>
                    </div>
                )}
            </div>
            {aviso && (
                <div className={`mx-4 mb-3 text-[11px] break-all ${aviso.tono === 'error' ? 'text-amber-300' : 'text-emerald-300'}`}>{aviso.texto}</div>
            )}
            {abierto && (
                <div className="px-2 md:px-4 pb-4">
                    <DocsManager key={clave} mode="admin" idOrUuid={id} embedded canValidate={!!esAdmin || !!esEquipo}
                        api={API_DOCS_CEE_DIRECTO} />
                </div>
            )}
        </div>
    );
}

export default DocumentacionCee;
