import React, { useState } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// RiteDatosPendientes — lo que le falta a la Memoria RITE, pedido EN EL ENVÍO.
//
// Al mandar el CIFO, la app ofrece mandar de paso la documentación RITE si
// también falta — pero solo si se puede generar SIN HUECOS (GET /memoria-rite/
// check, la misma validación que el botón «Generar» de Documentación). Antes, si
// faltaba algo, la casilla se quedaba gris con un «genérala desde Documentación»
// y había que salir del envío. Ahora se piden aquí los mismos datos que pide la
// cadena de popups de Documentación, y se guardan en el MISMO sitio:
//   · fecha de pruebas  → expediente (documentacion.fecha_pruebas_cert_instalacion)
//   · emplazamiento     → expediente (documentacion.frio_situado_en)
//   · potencias / gas   → CATÁLOGO del modelo (PATCH /aerotermia/:id/datos-rite)
//
// Lo que es un DATO DEL EXPEDIENTE que falta (DNI del cliente, superficie…) no
// cabe en un formulario genérico: se LISTA con su nombre, para que se sepa
// exactamente qué hay que rellenar, en vez de un «le faltan datos» mudo.
//
// Props: check (respuesta del /check), onGuardarDoc(campos) → Promise,
//        onResuelto() → vuelve a comprobar y, si ya se puede, añade el RITE.
// ─────────────────────────────────────────────────────────────────────────────

const ETIQ = (m) => ({
    potencia_calefaccion: m.bloque === 'acs' ? 'P. térmica (ACS)' : 'P. térmica (calefacción)',
    potencia_frigorifica: 'P. frigorífica',
    potencia_compresores: 'P. compresores',
    refrigerante: 'Refrigerante',
});
const HINT = { potencia_calefaccion: '12', potencia_frigorifica: '13,6', potencia_compresores: '2,14', refrigerante: 'R32' };
const UNIDAD = { refrigerante: 'gas', potencia_compresores: 'kW abs.' };
const numero = (v) => parseFloat(String(v ?? '').replace(',', '.'));
const fmtFecha = (iso) => { try { return new Date(iso).toLocaleDateString('es-ES'); } catch { return iso; } };

export function RiteDatosPendientes({ check, onGuardarDoc, onResuelto }) {
    const fp = check?.fechaPruebas || null;
    const potencias = Array.isArray(check?.potencias) ? check.potencias : [];
    const situado = check?.situadoEn || null;
    const missing = Array.isArray(check?.missing) ? check.missing : [];

    const [fecha, setFecha] = useState(fp?.propuesta || '');
    const [vals, setVals] = useState({});
    const [sitio, setSitio] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const hayAlgoQuePedir = !!fp || potencias.length > 0 || !!situado;
    if (!check || (!hayAlgoQuePedir && !missing.length)) return null;

    const relleno = (campo, m) => {
        const v = vals[`${campo}|${m.id}`];
        return campo === 'refrigerante' ? !!String(v || '').trim() : numero(v) > 0;
    };

    const guardar = async () => {
        if (fp && !fecha) { setError('Indica la fecha de pruebas.'); return; }
        if (potencias.some(m => (m.faltan || []).some(c => !relleno(c, m)))) { setError('Completa los datos que faltan del equipo.'); return; }
        if (situado && !sitio) { setError('Indica dónde está situado el generador de frío.'); return; }
        setError('');
        setGuardando(true);
        try {
            // Potencias del MODELO → catálogo (sirven para todos los expedientes).
            for (const m of potencias) {
                const payload = {};
                for (const c of (m.faltan || [])) {
                    const raw = vals[`${c}|${m.id}`];
                    if (c === 'refrigerante') payload[c] = String(raw).trim();
                    else payload[c] = numero(raw);
                }
                if (Object.keys(payload).length) await axios.patch(`/api/aerotermia/${m.id}/datos-rite`, payload);
            }
            // Lo de la OBRA → expediente, por el mismo camino que la cadena de
            // popups de Documentación (su copia local + guardado del expediente).
            const campos = {};
            if (fp) campos.fecha_pruebas_cert_instalacion = fecha;
            if (situado) campos.frio_situado_en = sitio;
            if (Object.keys(campos).length) await onGuardarDoc?.(campos);
            await onResuelto?.();
        } catch (e) {
            setError(e.response?.data?.error || e.message || 'No se pudieron guardar los datos');
        } finally {
            setGuardando(false);
        }
    };

    const inputCls = 'bg-bkg-elevated border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/50 transition-all disabled:opacity-50';

    return (
        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.05] px-4 py-3 space-y-3">
            <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-300/80">Para mandar también la documentación RITE falta</p>
                <p className="text-[11px] text-white/45 leading-snug mt-0.5">
                    Complétalo aquí y se añade al envío. Es lo mismo que pide «Generar» en Documentación, y se guarda en el mismo sitio.
                </p>
            </div>

            {fp && (
                <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Fecha de pruebas de la instalación térmica</p>
                    <p className="text-[10.5px] text-white/35 leading-snug">
                        {(fp.facturas || []).length
                            ? 'Hay varias facturas y ninguna se identifica como la de la aerotermia/ACS: elige la buena o pon la fecha.'
                            : 'Todavía no hay factura de la que tomarla: ponla a mano.'}
                        {' '}<span className="text-amber-300/80">También fija el fin de actuación del CIFO</span>, que se regenerará con ella.
                    </p>
                    {(fp.facturas || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {fp.facturas.map((f, i) => (
                                <button key={i} type="button" disabled={guardando} onClick={() => setFecha(f.fecha)}
                                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-all ${fecha === f.fecha ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 text-white/55 hover:border-white/25'}`}>
                                    {f.numero || '(sin nº)'}{f.termica ? ' · térmica' : ''} · {fmtFecha(f.fecha)}
                                </button>
                            ))}
                        </div>
                    )}
                    <input type="date" value={fecha || ''} disabled={guardando} onChange={e => setFecha(e.target.value)} className={inputCls} />
                </div>
            )}

            {potencias.map(m => (
                <div key={m.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/50 truncate">
                            {[m.marca, m.modelo_comercial].filter(Boolean).join(' · ')} <span className="text-white/25 normal-case tracking-normal">· datos del modelo (catálogo)</span>
                        </p>
                        {(m.ficha_tecnica || m.eprel) && (
                            <a href={m.ficha_tecnica || m.eprel} target="_blank" rel="noopener noreferrer"
                                className="shrink-0 text-[9px] font-black uppercase tracking-widest text-brand/80 hover:text-brand">Ficha técnica ↗</a>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(m.faltan || []).map(campo => {
                            const k = `${campo}|${m.id}`;
                            return (
                                <label key={campo} className="flex items-center gap-1.5">
                                    <span className="text-[10px] text-white/45">{ETIQ(m)[campo] || campo}</span>
                                    <input value={vals[k] ?? ''} placeholder={HINT[campo]} disabled={guardando}
                                        inputMode={campo === 'refrigerante' ? 'text' : 'decimal'}
                                        onChange={e => setVals(v => ({ ...v, [k]: e.target.value }))}
                                        className={`${inputCls} w-20 tabular-nums`} />
                                    <span className="text-[9px] text-white/30 uppercase">{UNIDAD[campo] || 'kW'}</span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            ))}

            {situado && (
                <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Generador de frío situado en</p>
                    <div className="flex gap-1.5">
                        {(situado.opciones || []).map(op => (
                            <button key={op} type="button" disabled={guardando} onClick={() => setSitio(op)}
                                className={`flex-1 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${sitio === op ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 text-white/55 hover:border-white/25'}`}>
                                {op}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {missing.length > 0 && (
                <div className="space-y-1">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Datos del expediente</p>
                    <p className="text-[10.5px] text-white/40 leading-snug">
                        Estos se rellenan en su pestaña del expediente (Cliente, Instalación…). Mientras falten, la memoria saldría con huecos:
                    </p>
                    <ul className="text-[11px] text-amber-200/90 list-disc pl-4 space-y-0.5">
                        {missing.map(m => <li key={m}>{m}</li>)}
                    </ul>
                </div>
            )}

            {error && <p className="text-[10.5px] text-red-400">{error}</p>}
            {hayAlgoQuePedir && (
                <div className="flex justify-end">
                    <button type="button" onClick={guardar} disabled={guardando}
                        className="px-4 py-2 rounded-lg bg-brand text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-50">
                        {guardando ? 'Guardando…' : missing.length ? 'Guardar estos datos' : 'Guardar y añadir el RITE'}
                    </button>
                </div>
            )}
        </div>
    );
}

export default RiteDatosPendientes;
