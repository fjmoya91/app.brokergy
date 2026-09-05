import React, { useState } from 'react';
import axios from 'axios';
import { firmanteCifo, firmanteMemoriaRite, firmanteIncompleto } from '../logic/instaladorPendientes';
import { PrescriptorDetailModal } from '../../admin/views/PrescriptorDetailModal';

// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN FIRMA CADA DOCUMENTO, en el momento de mandarlos a firmar.
//
// No es la misma persona, y esa es toda la cuestión:
//   · el CERTIFICADO CIFO lo firma quien REPRESENTA a la empresa;
//   · la MEMORIA RITE la firma quien está HABILITADO ante Industria, que puede
//     ser un técnico con su propio carné.
// En un autónomo suelen coincidir; en una empresa, casi nunca. Mandar los dos
// documentos "al instalador" sin mirar esto es cómo acababan firmados por quien
// no podía firmarlos.
//
// Si la ficha no lo declara, se asume la persona de contacto — y eso se dice en
// ámbar, con el botón para arreglarlo ahí mismo: el envío es el último momento
// en que alguien va a mirar este dato.
// ─────────────────────────────────────────────────────────────────────────────

const FIRMANTE_DE = {
    cifo: { titulo: 'Firma el Certificado CIFO', resolver: firmanteCifo },
    rite: { titulo: 'Firma la Memoria RITE', resolver: firmanteMemoriaRite },
};

export function FirmantesEnvio({ docs = [], pres = {}, onFichaEditada }) {
    // Ficha recargada tras editarla: el bloque tiene que decir la verdad en
    // cuanto se guarda, sin esperar a que el padre recargue el expediente.
    const [fichaLocal, setFichaLocal] = useState(null);
    const [ficha, setFicha] = useState(null);        // ficha abierta para editar
    const [abriendo, setAbriendo] = useState(false);

    const p = fichaLocal || pres;
    const lista = docs.filter(k => FIRMANTE_DE[k]);
    if (!lista.length) return null;

    const recargar = async () => {
        if (!p?.id_empresa) return;
        try {
            const { data } = await axios.get(`/api/prescriptores/${p.id_empresa}`);
            setFichaLocal(data);
        } catch { /* se queda la ficha anterior */ }
    };

    // PrescriptorDetailModal NO carga por id: hace `setP(prescriptor)` con lo que
    // se le pase. Con media ficha abriría un formulario vacío y guardaría nulos
    // encima de los datos buenos, así que se trae entera antes de abrirla.
    const abrirFicha = async () => {
        if (abriendo) return;
        if (!p?.id_empresa) { setFicha(p); return; }
        setAbriendo(true);
        try {
            const { data } = await axios.get(`/api/prescriptores/${p.id_empresa}`);
            setFicha(data);
        } catch {
            setFicha(p);
        } finally {
            setAbriendo(false);
        }
    };

    const cerrarFicha = async (huboCambios) => {
        setFicha(null);
        await recargar();
        if (huboCambios) onFichaEditada?.();
    };

    return (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30">
                    {lista.length > 1 ? 'Quién firma cada documento' : 'Quién lo firma'}
                </p>
                <button type="button" onClick={abrirFicha} disabled={abriendo}
                    title={`Editar la ficha de ${p.razon_social || 'el instalador'}`}
                    className="shrink-0 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                    {abriendo ? '…' : 'Editar ficha'}
                </button>
            </div>

            {lista.map(k => {
                const { titulo, resolver } = FIRMANTE_DE[k];
                const f = resolver(p);
                const sinDatos = firmanteIncompleto(f);
                const aviso = sinDatos || !f.declarado;
                return (
                    <div key={k} className={`rounded-xl border px-3 py-2 ${aviso ? 'border-amber-500/30 bg-amber-500/[0.06]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
                        <p className="text-[9.5px] uppercase tracking-wider font-bold text-white/35">{titulo}</p>
                        {sinDatos ? (
                            <p className="text-[11px] text-amber-300/90 leading-snug mt-0.5">
                                <b>No consta quién lo firma.</b> Decláralo en la ficha antes de mandarlo: saldría sin firmante.
                            </p>
                        ) : (
                            <>
                                <p className="text-[12px] font-bold text-white leading-snug mt-0.5">
                                    {f.nombre}
                                    {f.dni ? <span className="text-white/40 font-medium"> · {f.dni}</span> : null}
                                </p>
                                <p className="text-[10px] text-white/40">
                                    {f.etiqueta}{f.carnet ? ` · Carné ${f.carnet}` : ''}
                                </p>
                                {!f.declarado && (
                                    <p className="text-[10.5px] text-amber-300/90 leading-snug mt-1">
                                        Nadie ha declarado quién firma: se está asumiendo la persona de contacto. Si firma otra persona, decláralo en la ficha.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                );
            })}

            {/* La ficha va ENCIMA del envío: los popups van a z-[300]/[9999] y la
                ficha a z-[300], así que sin este envoltorio quedaría debajo. Un
                `relative z-…` crea contexto de apilamiento sin transform (con
                transform, su `position: fixed` dejaría de anclarse al viewport). */}
            {ficha && (
                <div className="relative z-[10000]">
                    <PrescriptorDetailModal
                        isOpen
                        prescriptor={ficha}
                        onClose={() => cerrarFicha(false)}
                        onUpdated={() => cerrarFicha(true)}
                    />
                </div>
            )}
        </div>
    );
}

export default FirmantesEnvio;
