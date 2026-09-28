import { useState } from 'react';
import {
    ACTIVIDADES_ILUMINACION_CE3X, AMBITOS_CE3X, PERFILES_USO_CE3X, TIPOS_CE3X,
    TIPOS_RESIDENCIAL_CE3X, esTerciarioCe3x,
} from '../logic/fichaCe3x';

// ─────────────────────────────────────────────────────────────────────────────
// «Tipo de edificio» — lo primero que pregunta CE3X al crear un certificado.
//
// Residencial, pequeño terciario o gran terciario: es lo que decide con qué
// PROGRAMA abre CE3X el fichero (va en su cabecera), así que se pregunta antes
// de medir nada, como hace él. La app PROPONE uno —un expediente de ficha
// terciaria (TER100/TER173) sale como pequeño terciario— pero decide quien pulsa.
//
// Si es terciario, en el MISMO popup se pregunta lo que un terciario no puede
// llevar por defecto: el PERFIL DE USO (intensidad y horas) y la actividad
// principal, de la que sale la iluminación estimada. Todo se cambia después en
// Datos generales e Instalaciones.
//
// REGLA — se pregunta UNA vez por expediente: lo elegido se guarda con el
// trabajo. Un residencial que ya tenía trabajo de antes no lo ve: sus `.cex` ya
// se generaron así.
// ─────────────────────────────────────────────────────────────────────────────

const INTENSIDADES = ['Baja', 'Media', 'Alta'];
const HORAS = ['8h', '12h', '16h', '24h'];

const ETIQUETA_RES = {
    'Unifamiliar': 'Unifamiliar',
    'Vivienda Individual': 'Vivienda individual (en bloque)',
    'Bloque de Viviendas': 'Bloque de viviendas',
};

export function TipoEdificioModal({ actual, sugerido, ajustes = {}, onElegir, onCerrar,
                                    expediente }) {
    const [tipo, setTipo] = useState(actual || sugerido || 'residencial');
    const perfil0 = /^Intensidad (Baja|Media|Alta) - (\d+h)$/.exec(ajustes.perfil_uso || '');
    const [intensidad, setIntensidad] = useState(perfil0?.[1] || null);
    const [horas, setHoras] = useState(perfil0?.[2] || null);
    const [ambito, setAmbito] = useState(
        AMBITOS_CE3X.includes(ajustes.ambito) ? ajustes.ambito : 'Edificio completo');
    const [actividad, setActividad] = useState(ajustes.ilum_actividad || '');
    const [vivienda, setVivienda] = useState(ajustes.tipo_edificio || 'Unifamiliar');

    const terciario = esTerciarioCe3x(tipo);
    const perfil = intensidad && horas ? `Intensidad ${intensidad} - ${horas}` : null;
    // El perfil es el dato que DEFINE un terciario: sin él el motor no escribe
    // el fichero. La actividad no bloquea —sin ella la iluminación se pide
    // antes de generar—, pero se propone contestarla aquí.
    const puede = !terciario || (perfil && PERFILES_USO_CE3X.includes(perfil));

    function continuar() {
        if (!puede) return;
        const cambios = { tipo_ce3x: tipo };
        if (terciario) {
            cambios.perfil_uso = perfil;
            cambios.ambito = ambito;
            if (actividad) cambios.ilum_actividad = actividad;
        } else {
            cambios.tipo_edificio = vivienda;
        }
        onElegir(cambios);
    }

    return (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 p-0
                        md:items-center md:p-4"
             onClick={onCerrar}>
            <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border
                            border-white/10 bg-bkg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]
                            md:rounded-2xl"
                 onClick={e => e.stopPropagation()}>

                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                    {expediente ? `${expediente} · ` : ''}Como en CE3X
                </p>
                <h3 className="mt-1 text-lg font-black leading-tight">
                    Certificación energética simplificada de edificios existentes
                </h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
                    ¿Qué tipo de edificio es? CE3X abre el <code>.cex</code> con un programa u
                    otro según esto, así que se elige antes de medir. Se puede cambiar después
                    en Datos generales.
                </p>

                <Bloque titulo="Tipo de edificio">
                    <div className="grid gap-2 sm:grid-cols-3">
                        {TIPOS_CE3X.map(t => (
                            <button key={t.valor} type="button" onClick={() => setTipo(t.valor)}
                                    className={`flex flex-col items-center justify-center gap-1
                                                rounded-xl border px-3 py-4 text-center transition
                                        ${tipo === t.valor
                                            ? 'border-brand/70 bg-brand/[0.10]'
                                            : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}>
                                <span className={`text-[13.5px] font-black leading-tight
                                                  ${tipo === t.valor ? 'text-brand' : 'text-white/85'}`}>
                                    {t.etiqueta}
                                </span>
                                {t.valor === sugerido && (
                                    <span className="rounded bg-white/[0.08] px-1.5 py-px text-[9px]
                                                     font-black uppercase tracking-wider text-white/50">
                                        propuesto
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                    <p className="text-[11px] leading-relaxed text-white/45">
                        {(TIPOS_CE3X.find(t => t.valor === tipo) || {}).ayuda}
                    </p>
                </Bloque>

                {!terciario && (
                    <Bloque titulo="Tipo de vivienda">
                        <div className="flex flex-wrap gap-1.5">
                            {TIPOS_RESIDENCIAL_CE3X.map(v => (
                                <Pastilla key={v} activa={vivienda === v} onClick={() => setVivienda(v)}>
                                    {ETIQUETA_RES[v] || v}
                                </Pastilla>
                            ))}
                        </div>
                    </Bloque>
                )}

                {terciario && (<>
                    <Bloque titulo="Perfil de uso">
                        <p className="text-[11px] leading-relaxed text-white/45">
                            La intensidad de las cargas internas (ocupación, equipos) y las horas
                            que funciona el edificio al día. Es el dato que define un terciario.
                        </p>
                        <div className="flex gap-1.5">
                            {INTENSIDADES.map(i => (
                                <Pastilla key={i} activa={intensidad === i} onClick={() => setIntensidad(i)}>
                                    Intensidad {i.toLowerCase()}
                                </Pastilla>
                            ))}
                        </div>
                        <div className="flex gap-1.5">
                            {HORAS.map(h => (
                                <Pastilla key={h} activa={horas === h} onClick={() => setHoras(h)}>
                                    {h.replace('h', ' h')}
                                </Pastilla>
                            ))}
                        </div>
                        <p className={`text-[11px] ${perfil ? 'text-brand' : 'text-amber-200/80'}`}>
                            {perfil ? `Se escribe «${perfil}».` : 'Elige la intensidad y las horas.'}
                        </p>
                    </Bloque>

                    <Bloque titulo="Qué se certifica">
                        <div className="flex gap-1.5">
                            {AMBITOS_CE3X.map(a => (
                                <Pastilla key={a} activa={ambito === a} onClick={() => setAmbito(a)}>
                                    {a}
                                </Pastilla>
                            ))}
                        </div>
                    </Bloque>

                    <Bloque titulo="Actividad principal (iluminación)">
                        <p className="text-[11px] leading-relaxed text-white/45">
                            En un terciario la iluminación es una instalación más. Se estima con
                            esta actividad, lámpara LED y la iluminancia que CE3X propone para ella;
                            una planta que sea otra cosa se cambia en Instalaciones.
                        </p>
                        <select value={actividad} onChange={e => setActividad(e.target.value)}
                                aria-label="Actividad principal"
                                className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2
                                           text-[12.5px] font-semibold">
                            <option value="">— Elegir —</option>
                            {ACTIVIDADES_ILUMINACION_CE3X.map(a => (
                                <option key={a.valor} value={a.valor}>
                                    {a.etiqueta || a.valor} · {a.lux} lux
                                </option>
                            ))}
                        </select>
                    </Bloque>
                </>)}

                <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
                    <button onClick={onCerrar}
                            className="rounded-lg px-4 py-2 text-[11px] font-bold uppercase
                                       tracking-wider text-white/40 hover:text-white/70">
                        Cancelar
                    </button>
                    <button onClick={continuar} disabled={!puede}
                            className="rounded-xl bg-brand px-5 py-2.5 text-[11px] font-black
                                       uppercase tracking-widest text-black hover:brightness-110
                                       disabled:cursor-not-allowed disabled:opacity-40">
                        Continuar
                    </button>
                </div>
            </div>
        </div>
    );
}

function Bloque({ titulo, children }) {
    return (
        <div className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{titulo}</p>
            <div className="mt-1.5 flex flex-col gap-1.5">{children}</div>
        </div>
    );
}

function Pastilla({ activa, onClick, children }) {
    return (
        <button type="button" onClick={onClick}
                className={`flex-1 rounded-lg border px-2.5 py-2 text-[11.5px] font-semibold
                    ${activa ? 'border-brand bg-brand/15 text-brand'
                             : 'border-white/10 text-white/55 hover:border-white/25'}`}>
            {children}
        </button>
    );
}

export default TipoEdificioModal;
