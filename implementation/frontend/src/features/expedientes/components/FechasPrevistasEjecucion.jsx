import { useState, useEffect } from 'react';
import { estadoPlazoCeeInicial, COLOR_PLAZO } from '../logic/fechasPrevistas';

// ─────────────────────────────────────────────────────────────────────────────
// Fechas previstas de ejecución de la obra, en la cabecera del módulo CEE.
//
// Son la fecha que el cliente nos da al aceptar la propuesta (la que le ha dicho
// su instalador). La de INICIO marca el plazo del CEE inicial: hay que tenerlo
// registrado ANTES, porque certifica el estado previo a la actuación.
//
// Se guardan en `expedientes.instalacion` y se editan aquí mismo (autoguardado al
// salir del campo). Solo el equipo interno puede cambiarlas.
// ─────────────────────────────────────────────────────────────────────────────

export function FechasPrevistasEjecucion({ expediente, onSave, editable = true, saving = false }) {
    const inst = expediente?.instalacion || {};
    const [inicio, setInicio] = useState(inst.fecha_prevista_inicio || '');
    const [fin, setFin] = useState(inst.fecha_prevista_fin || '');
    const [error, setError] = useState('');

    useEffect(() => {
        setInicio(expediente?.instalacion?.fecha_prevista_inicio || '');
        setFin(expediente?.instalacion?.fecha_prevista_fin || '');
    }, [expediente?.instalacion?.fecha_prevista_inicio, expediente?.instalacion?.fecha_prevista_fin]);

    const ceeInicialRegistrado = expediente?.seguimiento?.cee_inicial === 'REGISTRADO';
    const plazo = estadoPlazoCeeInicial(inicio || null, ceeInicialRegistrado);

    const commit = (campo, valor) => {
        const actual = expediente?.instalacion?.[campo] || '';
        if ((valor || '') === actual) return;

        // Una obra no puede terminar antes de empezar. Avisamos en vez de guardar.
        const nuevoInicio = campo === 'fecha_prevista_inicio' ? valor : inicio;
        const nuevoFin = campo === 'fecha_prevista_fin' ? valor : fin;
        if (nuevoInicio && nuevoFin && nuevoFin < nuevoInicio) {
            setError('El fin previsto no puede ser anterior al inicio.');
            return;
        }
        setError('');
        onSave({ instalacion: { ...(expediente?.instalacion || {}), [campo]: valor || null } });
    };

    const inputCls = 'bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-brand/40 disabled:opacity-50';

    return (
        <div className="hidden md:flex flex-col gap-1 bg-white/[0.04] border border-white/10 px-3 py-1.5 rounded-xl ml-auto mr-2">
            <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-widest whitespace-nowrap">
                    Prevista ejecución
                </span>

                <label className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <span className="text-[8px] font-black text-white/25 uppercase">Inicio</span>
                    <input
                        type="date"
                        value={inicio}
                        disabled={!editable || saving}
                        onChange={e => setInicio(e.target.value)}
                        onBlur={e => commit('fecha_prevista_inicio', e.target.value)}
                        className={inputCls}
                    />
                </label>

                <label className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <span className="text-[8px] font-black text-white/25 uppercase">Fin</span>
                    <input
                        type="date"
                        value={fin}
                        disabled={!editable || saving}
                        onChange={e => setFin(e.target.value)}
                        onBlur={e => commit('fecha_prevista_fin', e.target.value)}
                        className={inputCls}
                    />
                </label>
            </div>

            {/* Cuenta atrás del CEE inicial. Es informativa: no toca la prioridad. */}
            {(error || plazo.nivel !== 'sin_fecha') && (
                <p className={`text-[9px] font-bold leading-none ${error ? 'text-red-400' : COLOR_PLAZO[plazo.nivel]}`}>
                    {error || plazo.texto}
                </p>
            )}
        </div>
    );
}

export default FechasPrevistasEjecucion;
