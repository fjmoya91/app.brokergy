import { useState } from 'react';
import axios from 'axios';
import { DocsManager } from '../../docs/DocsManager';
import { API_DOCS_CEE_DIRECTO } from '../../docs/docsApi';
import { CuestionarioCliente } from './CuestionarioCliente';

// ─────────────────────────────────────────────────────────────────────────────
// Las fotos y papeles con los que el técnico hace el CEE (fachada, patios,
// vídeo, planos, CEE anterior) en la ficha de un CEE directo.
//
// Vive en su PROPIA PESTAÑA de la ficha («Documentación», al lado de
// «Certificado»): abierta debajo de los datos empujaba el módulo CEE —que es a lo
// que se entra— media pantalla por debajo, con tres franjas de aviso delante de
// la primera foto. Aquí va lo que aporta el CLIENTE: lo que contó al aceptar
// (cuestionario) y sus fotos.
//
// Es el MISMO gestor que el CAE (`DocsManager`), apuntado a las rutas de CEE
// directos y en modo `compacto`. Lo ve también el técnico asignado —son sus
// fotos de trabajo—; pedirle lo que falta al cliente es cosa del equipo.
// ─────────────────────────────────────────────────────────────────────────────
export function DocumentacionCee({ id, esEquipo, esAdmin, cuestionario, onResumen }) {
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
        <div>
            <CuestionarioCliente cuestionario={cuestionario} />

            <div className="rounded-2xl border border-white/[0.06] bg-bkg-surface/60">
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 pb-2">
                    <div className="text-[11px] text-white/40">
                        Fachada, patios, vídeo y planos · en «4. DOCUMENTACIÓN PARA CEE»
                    </div>
                    {esEquipo && (
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setClave(k => k + 1)} title="Volver a leer la carpeta"
                                className="min-h-[34px] px-3 rounded-lg border border-white/10 text-[11px] text-white/45 hover:text-white">
                                ↻
                            </button>
                            <button type="button" onClick={pedir} disabled={pidiendo}
                                className="min-h-[34px] px-3 rounded-lg border border-brand/30 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/20 disabled:opacity-40">
                                {pidiendo ? 'Enviando…' : 'Pedir lo que falta'}
                            </button>
                        </div>
                    )}
                </div>
                {aviso && (
                    <div className={`mx-4 mb-2 text-[11px] break-all ${aviso.tono === 'error' ? 'text-amber-300' : 'text-emerald-300'}`}>{aviso.texto}</div>
                )}
                <div className="px-2 md:px-4 pb-4">
                    <DocsManager key={clave} mode="admin" idOrUuid={id} embedded compacto
                        canValidate={!!esAdmin || !!esEquipo}
                        api={API_DOCS_CEE_DIRECTO} onResumen={onResumen} />
                </div>
            </div>
        </div>
    );
}

export default DocumentacionCee;
