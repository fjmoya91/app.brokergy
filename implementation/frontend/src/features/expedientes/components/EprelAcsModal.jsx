import React, { useState } from 'react';
import axios from 'axios';
import { getScopAcsFromModel } from '../../calculator/logic/calculation';
import { esZonaCalida } from '../logic/acsCatalogo';

// ============================================================================
// EprelAcsModal — completar en el CATÁLOGO el dato de ACS que falta.
// ----------------------------------------------------------------------------
// Dos huecos, el mismo gesto:
//
//   · modo 'conjunto'      → el equipo trae el acumulador dentro y el SCOP_dhw
//                            sale del Anexo IV (2,5 · η_wh, con el η_wh del
//                            EPREL). Salta al elegirlo en calefacción.
//   · modo 'independiente' → el equipo calienta un depósito APARTE y el SCOP_dhw
//                            sale del Anexo VI (COP A7/55 · Fc). Es el caso de
//                            las bombas de calefacción con acumulador, que es
//                            como se declara la mayoría.
//
// Sin uno de esos dos datos no hay forma de declarar el SCOP en ACS: hasta ahora
// eso caía en silencio a un 3,0 por defecto que acababa impreso en el CIFO.
//
// REGLA — se arregla el CATÁLOGO, no este expediente. El dato se escribe en el
// modelo (`PATCH /api/aerotermia/:id/datos-acs`), así que se teclea UNA vez, con
// la ficha delante, y queda resuelto para todos los expedientes que lleven ese
// equipo. Mismo criterio que el popup de datos del RITE.
//
// REGLA — el SCOP previsto se calcula con `getScopAcsFromModel`, no con una
// fórmula escrita aquí. Es la misma función que aplicará el expediente al
// guardar: si el número que se enseña antes de aceptar saliera de otro sitio,
// podrían no coincidir.
//
// REGLA — el PDF del EPREL se ANEXA a la ficha técnica del modelo. El dato da el
// número; el documento es lo que lo acredita ante el verificador, y el anexo del
// CIFO sale de `aerotermia.ficha_tecnica`.
//
// REGLA — se puede SALIR sin rellenar. Es un hueco del catálogo, no un error del
// expediente: quien no tenga la ficha a mano debe poder seguir trabajando y
// teclear el SCOP a mano. Bloquearlo aquí pararía la ficha entera por un dato
// que a lo mejor está en otra pestaña.
// ============================================================================

const CAMPOS = {
    conjunto: {
        titulo: 'Falta el rendimiento en ACS de este conjunto',
        label: <>η<sub>wh</sub> · eficiencia de caldeo de agua (EPREL, %)</>,
        ph: 'Ej: 127',
        campo: 'eta_acs',
        formula: (v, zona) => getScopAcsFromModel(
            esZonaCalida(zona) ? { eta_acs_calida: v } : { eta_acs_media: v }, zona, 'conjunto'),
        // El backend sube la fracción a porcentaje igual que el resto de rendimientos.
        normaliza: (n) => (n < 10 ? n * 100 : n),
        pie: (zona) => `En la ficha del producto del EPREL, con el perfil de carga declarado y clima ${esZonaCalida(zona) ? 'cálido' : 'medio'}.`,
        muestra: (v) => <>SCOP<sub>dhw</sub> = 2,5 · {v} %</>,
    },
    independiente: {
        titulo: 'Falta el COP A7/55 de este equipo',
        label: 'COP A7/W55 (aire 7 °C · agua 55 °C)',
        ph: 'Ej: 3,15',
        campo: 'cop_a7_55',
        formula: (v, zona) => getScopAcsFromModel({ cop_a7_55: v }, zona, 'independiente'),
        normaliza: (n) => n,
        pie: () => 'Está en la tabla de datos técnicos del catálogo del fabricante — NO en la ficha de producto del Reglamento 811/2013, que solo declara SCOP por clima.',
        muestra: (v) => <>SCOP<sub>dhw</sub> = {v} · F<sub>c</sub></>,
    },
};

export default function EprelAcsModal({ model, zona = 'D3', modo = 'conjunto', onCerrar, onCompletado }) {
    const cfg = CAMPOS[modo] || CAMPOS.conjunto;
    const [valor, setValor] = useState('');
    const [eprel, setEprel] = useState(model?.eprel || '');
    const [files, setFiles] = useState([]);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    if (!model) return null;

    const nombre = [model.marca, model.modelo_comercial || model.modelo_conjunto].filter(Boolean).join(' ');
    const n = parseFloat(String(valor).replace(',', '.'));
    const scopPrevisto = Number.isFinite(n) && n > 0 ? cfg.formula(cfg.normaliza(n), zona) : null;

    const addFiles = (lista) => {
        const pdfs = Array.from(lista || []).filter(f => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
        if (pdfs.length) setFiles(prev => [...prev, ...pdfs].slice(0, 4));
    };

    const guardar = async () => {
        setError(null);
        if (!valor && !eprel && !files.length) {
            setError('Indica al menos el dato que falta.');
            return;
        }
        setGuardando(true);
        try {
            const fd = new FormData();
            if (valor) fd.append(cfg.campo, valor);
            if (eprel) fd.append('eprel', eprel);
            fd.append('zona', zona || 'D3');
            files.forEach(f => fd.append('files', f));
            const { data } = await axios.patch(`/api/aerotermia/${model.id}/datos-acs`, fd);
            // El anexo puede fallar sin que falle el dato: se dice, porque es lo que
            // el CIFO necesitará adjuntar, pero no se pierde lo ya guardado.
            if (data?.anexo && data.anexo.ok === false) {
                setError(`El dato se ha guardado, pero el PDF no se pudo anexar a la ficha técnica (${data.anexo.motivo}). Puedes reintentarlo desde el módulo Aerotermia.`);
                setGuardando(false);
                onCompletado(data, { conAviso: true });
                return;
            }
            onCompletado(data);
        } catch (e) {
            setError(e?.response?.data?.error || 'No se pudo guardar. Inténtalo de nuevo.');
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
                <div className="px-6 py-5 border-b border-white/[0.07]">
                    <h2 className="text-base font-black uppercase tracking-tight text-white">{cfg.titulo}</h2>
                    <p className="text-[11px] text-white/45 mt-1 leading-snug">
                        <span className="text-white/80 font-semibold">{nombre}</span>{' '}
                        {modo === 'conjunto'
                            ? <>trae el depósito de ACS dentro, así que calienta también el agua — pero el catálogo no tiene
                               ni el SCOP para ACS de su ficha técnica ni el η<sub>wh</sub> de su EPREL, que es de donde sale
                               el cálculo del Anexo IV.</>
                            : <>calienta un depósito aparte, así que su SCOP<sub>dhw</sub> se calcula por el Anexo VI sobre su
                               COP A7/55 — y el catálogo no lo tiene. Sin él no se puede declarar el rendimiento en ACS.</>}
                    </p>
                </div>

                <div className="px-6 py-5 space-y-4">
                    <div>
                        <label className="block text-[10px] text-brand/60 uppercase tracking-wider mb-1 font-bold">{cfg.label}</label>
                        <input
                            type="text" inputMode="decimal" value={valor} autoFocus
                            onChange={e => setValor(e.target.value)}
                            placeholder={cfg.ph}
                            className="w-full bg-bkg-elevated border border-white/10 focus:border-brand/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none"
                        />
                        <p className="text-[10px] text-white/30 mt-1 leading-snug">
                            {cfg.pie(zona)} Zona {String(zona || 'D3').toUpperCase()}.
                        </p>
                        {scopPrevisto != null && (
                            <p className="text-[11px] text-emerald-400/90 mt-1.5 font-semibold">
                                {cfg.muestra(String(valor).replace('.', ','))} ={' '}
                                <span className="font-mono">{Number(scopPrevisto).toFixed(2).replace('.', ',')}</span>
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-[10px] text-brand/60 uppercase tracking-wider mb-1 font-bold">
                            Enlace EPREL <span className="text-white/25 normal-case tracking-normal">· opcional</span>
                        </label>
                        <input
                            type="text" value={eprel} onChange={e => setEprel(e.target.value)}
                            placeholder="https://eprel.ec.europa.eu/..."
                            className="w-full bg-bkg-elevated border border-white/10 focus:border-brand/50 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none no-uppercase"
                        />
                        <p className="text-[10px] text-white/30 mt-1">Se imprime en el CIFO junto al cálculo del SCOP.</p>
                    </div>

                    <div>
                        <label className="block text-[10px] text-brand/60 uppercase tracking-wider mb-1 font-bold">
                            PDF justificante <span className="text-white/25 normal-case tracking-normal">· ficha del producto, etiqueta EPREL…</span>
                        </label>
                        <div
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
                            className="border border-dashed border-white/15 rounded-lg px-3 py-4 text-center"
                        >
                            <input id="eprel-files" type="file" accept="application/pdf" multiple className="hidden"
                                   onChange={e => addFiles(e.target.files)} />
                            <label htmlFor="eprel-files" className="text-[11px] text-white/50 cursor-pointer hover:text-white">
                                Elegir PDF<span className="hidden md:inline"> o arrastrarlos aquí</span>
                            </label>
                            {files.length > 0 && (
                                <ul className="mt-2 space-y-1 text-left">
                                    {files.map((f, i) => (
                                        <li key={i} className="flex items-center justify-between gap-2 text-[10px] text-white/60">
                                            <span className="truncate font-mono">{f.name}</span>
                                            <button type="button" className="text-white/30 hover:text-red-400 shrink-0"
                                                    onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <p className="text-[10px] text-white/30 mt-1 leading-snug">
                            Se añaden a la ficha técnica del modelo en el catálogo, que es el documento que el
                            CIFO adjunta como justificación del SCOP.
                        </p>
                    </div>

                    {error && (
                        <p className="text-[11px] text-amber-400 bg-amber-500/[0.08] border border-amber-500/25 rounded-lg px-3 py-2 leading-snug">
                            {error}
                        </p>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-white/[0.07] flex items-center justify-between gap-3">
                    <button type="button" onClick={onCerrar} disabled={guardando}
                            className="text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white disabled:opacity-40">
                        Ahora no · lo pongo a mano
                    </button>
                    <button type="button" onClick={guardar} disabled={guardando}
                            className="px-4 py-2 rounded-lg bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-widest disabled:opacity-50">
                        {guardando ? 'Guardando…' : 'Guardar en el catálogo'}
                    </button>
                </div>
            </div>
        </div>
    );
}
