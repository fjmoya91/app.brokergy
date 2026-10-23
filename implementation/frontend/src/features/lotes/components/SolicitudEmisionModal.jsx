import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Marco } from './PagoClientesModals';
import { FirmantePicker } from './FirmantePicker';
import { representantesSo } from '../logic/soContactos';

// ─────────────────────────────────────────────────────────────────────────────
// Antes de generar la SOLICITUD DE EMISIÓN y los anexos del MITECO (fase 5), se
// elige a nombre de qué apoderado del S.O. sale la solicitud: su nombre y su DNI
// van impresos en «Representante legal» (23/10/2026, decisión del usuario; antes
// salía siempre a nombre del que firmó las fichas, sin preguntar).
//
// De entrada se propone el que FIRMÓ LAS FICHAS de este lote (el sello
// `documentos_so[].rep_*`), y si se elige a otro se avisa: una carátula a nombre de
// uno con sus adjuntos firmados por otro es lo primero que cruza quien la revisa.
// El servidor coteja el elegido con la ficha del S.O. antes de imprimirlo.
// ─────────────────────────────────────────────────────────────────────────────

const nifNorm = (v) => String(v || '').replace(/[\s.-]/g, '').toUpperCase();

export function SolicitudEmisionModal({ lote, onClose, onGenerar }) {
    const reps = useMemo(() => representantesSo(lote?.sujeto_obligado || {}), [lote?.sujeto_obligado]);

    // El que firmó las fichas de este lote, si consta entre los apoderados.
    const sellado = useMemo(() => {
        const s = (lote?.documentos_so || []).find(x => x && (x.rep_nombre || x.rep_nif));
        if (!s) return null;
        return reps.find(r => (s.rep_nif && nifNorm(r.nif) === nifNorm(s.rep_nif))
            || (!s.rep_nif && r.nombre && r.nombre === s.rep_nombre)) || null;
    }, [lote?.documentos_so, reps]);

    const [elegidoId, setElegidoId] = useState(() => sellado?.id || reps[0]?.id || null);
    const elegido = reps.find(r => r.id === elegidoId) || reps[0] || null;
    const nExps = (lote?.expedientes || []).length;
    const distintoDelSellado = sellado && elegido && sellado.id !== elegido.id;

    return createPortal(
        <Marco
            subtitulo="Presentación a MITECO"
            titulo="Solicitud de emisión y anexos"
            explicacion={`Se rellenan los impresos oficiales: la solicitud de emisión (una por lote, a la documentación del lote) y el anexo de cada actuación (a la carpeta E{n} de su expediente).`}
            onClose={onClose}
            pie={(
                <>
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 rounded-xl border border-white/15 text-white/75 text-[12px] font-bold hover:text-white hover:border-white/30 transition-all">
                        Cancelar
                    </button>
                    <div className="flex-1" />
                    <button type="button" disabled={!elegido?.nombre || !elegido?.nif}
                        onClick={() => onGenerar({ nombre: elegido.nombre, nif: elegido.nif })}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand text-black text-[12px] font-black uppercase tracking-wider disabled:opacity-40 hover:brightness-110 transition-all">
                        📄 Generar{elegido?.nombre ? ` a nombre de ${elegido.nombre.split(' ')[0]}` : ''}
                    </button>
                </>
            )}
        >
            {reps.length >= 2 ? (
                <FirmantePicker representantes={reps} value={elegido?.id} onChange={setElegidoId}
                    marca={sellado?.id} marcaTexto="Firmó las fichas"
                    nota="Su nombre y su DNI se imprimen en «Representante legal» de la solicitud de emisión." />
            ) : elegido ? (
                <div>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-black text-white/50 mb-2">Firma por el Sujeto Obligado</p>
                    <div className="px-3.5 py-3 rounded-2xl border border-white/[0.09] bg-white/[0.02]">
                        <p className="text-[13px] font-bold text-white">{elegido.nombre || '—'}</p>
                        <p className="text-[11px] text-white/50">{elegido.nif || 'sin NIF'} · el único apoderado de la ficha</p>
                    </div>
                </div>
            ) : (
                <p className="text-[12px] text-amber-300 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] px-3.5 py-3">
                    La ficha del Sujeto Obligado no tiene representante legal: añádelo allí antes de generar la solicitud.
                </p>
            )}

            {elegido && (!elegido.nombre || !elegido.nif) && (
                <p className="text-[12px] text-amber-300">Le falta {!elegido.nombre ? 'el nombre' : 'el DNI'} en la ficha del Sujeto Obligado: complétalo allí.</p>
            )}
            {distintoDelSellado && (
                <p className="text-[12px] text-amber-200 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] px-3.5 py-2.5 leading-snug">
                    ⚠ Las fichas de este lote las firmó <span className="font-bold">{sellado.nombre}</span>. Una solicitud a nombre de otro
                    apoderado es lo primero que cruza quien la revisa.
                </p>
            )}

            <p className="text-[11px] text-white/50">
                {nExps} expediente{nExps === 1 ? '' : 's'} · una solicitud y un anexo por actuación. Si ya existían, se sustituyen.
            </p>
        </Marco>,
        document.body,
    );
}

export default SolicitudEmisionModal;
