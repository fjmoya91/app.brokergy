import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { StepLayout } from '../components/StepLayout';
import { prepararImagenParaSubir } from '../../../utils/imageResize';
import {
    COMBUSTIBLES_CALDERA, calderaDesdePlaca, modeloDiceCondensacion, potenciaDeLaPlaca,
    placaCalderaParaInputs, AÑO_SOLO_CONDENSACION,
} from '../data/calderaDesdePlaca';

/**
 * StepPlacaCaldera — «Nueva simulación» (flujo INTERNO: partner y equipo).
 *
 * En vez de preguntar «¿con qué se calienta?», «¿cuántos años tiene la caldera?» y
 * «¿es de condensación?», quien está delante de la caldera le hace DOS fotos y la
 * app lee la placa en el momento (`POST /api/oportunidades/leer-placa-caldera`, la
 * MISMA lectura que la del expediente, regla 27.d). Con lo leído:
 *   · dice si la foto sirve («Placa leída» / «se ve la caldera pero no su potencia» /
 *     «no reconocemos una placa»), con el consejo para repetirla;
 *   · rellena la caldera de la simulación: la FILA de rendimiento por el AÑO DE LA
 *     PLACA (regla 99), la potencia útil y la placa entera, que el expediente hereda;
 *   · y las dos fotos se suben a sus apartados en cuanto existe la oportunidad
 *     (FOTO_PLACA_CALDERA_ANTES · FOTO_CALDERA_ANTES, regla 162: sin ellas no hay CEE).
 *
 * REGLA — el COMBUSTIBLE lo CONFIRMA quien está delante. El leído se PROPONE
 * marcado, nunca se da por bueno sin un toque (regla 27.d: de él cuelga la propuesta),
 * y en una placa policombustible es el confirmado el que elige la potencia.
 *
 * REGLA — la CONDENSACIÓN se pregunta (Sí · No · No lo sé). Si el modelo lo dice
 * («CONDENS»), sale marcada; con «No lo sé», la placa de 2016 en adelante es de
 * condensación (ecodiseño) y la anterior no.
 *
 * REGLA — sin foto se puede seguir: «contestar a mano» vuelve a las preguntas de
 * siempre. Una foto que no sirve NO bloquea (se sube igual y quien la recibe ve el
 * veredicto), pero se dice qué falta y cómo repetirla.
 *
 * Las fotos NO se suben aquí: la oportunidad todavía no existe. Se quedan en memoria
 * (`estado`, en ReformaSubFlow, para no perderlas al ir atrás) y las sube
 * `subirDocsPendientes()` con el token de la oportunidad recién creada.
 *
 * Props:
 *   estado, setEstado — { placa: File[], sala: File[], lectura, error, combustible,
 *                         combustibleTocado, condensacion, condensacionTocada, anio, potencia }
 *   onContinuar({ caldera, placa }) — `caldera` de calderaDesdePlaca, `placa` para inputs
 *   onSinFoto() — al recorrido de preguntas de siempre
 */

export const PLACA_CALDERA_VACIA = {
    placa: [], sala: [], lectura: null, error: null,
    combustible: null, combustibleTocado: false,
    condensacion: null, condensacionTocada: false,
    anio: '', potencia: '',
};

// El LECTOR toma hasta 4 fotos de placa y 2 de la caldera entera (placaOcrService):
// se le mandan las primeras. Guardar se guardan todas las que se pongan, hasta 8 por
// tarjeta (todas suben a su apartado). Con 1 y 2 de tope, Fran (16/11/2026) no podía
// poner una segunda placa ni una tercera de la sala.
const LEE_PLACA = 4;
const LEE_SALA = 2;
const MAX_FOTOS = 8;

const ICONO_CAMARA = (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8.5A2.5 2.5 0 015.5 6h1.6l1.2-1.8A1.5 1.5 0 019.6 3.5h4.8a1.5 1.5 0 011.3.7L16.9 6h1.6A2.5 2.5 0 0121 8.5v8a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 16.5v-8z" />
        <circle cx="12" cy="12.5" r="3.6" strokeWidth={1.8} />
    </svg>
);

// La miniatura crea su objectURL DENTRO del efecto (regla 68: creado en el
// inicializador de un useState, el cleanup de StrictMode lo revoca y sale rota).
function Miniatura({ file, onQuitar, deshabilitado }) {
    const [url, setUrl] = useState(null);
    const [rota, setRota] = useState(false);
    useEffect(() => {
        const u = URL.createObjectURL(file);
        setUrl(u);
        setRota(false);
        return () => URL.revokeObjectURL(u);
    }, [file]);
    return (
        <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-white/10 bg-white/[0.04] shrink-0">
            {url && !rota ? (
                <img src={url} alt={file.name} onError={() => setRota(true)} className="w-full h-full object-cover" />
            ) : (
                // HEIC del iPhone: el navegador no lo pinta, pero se lee y se sube igual.
                <div className="w-full h-full flex items-center justify-center text-white/40 text-[9px] font-bold px-1 text-center break-all">{file.name}</div>
            )}
            <button type="button" onClick={onQuitar} disabled={deshabilitado} title="Quitar esta foto"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center disabled:opacity-30">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
    );
}

// Una tarjeta por foto pedida. Fuera del componente a propósito (como `Zona` en
// StepDocsObra): definida dentro, React la remonta en cada render y se pierde el
// resaltado de arrastrar.
function FotoTarjeta({ titulo, texto, ejemplo, files, max, onAdd, onQuitar, ocupado, hecha }) {
    const [encima, setEncima] = useState(false);
    const lleno = files.length >= max;
    const soltar = (e) => {
        e.preventDefault();
        setEncima(false);
        if (!ocupado && !lleno && e.dataTransfer?.files?.length) onAdd(e.dataTransfer.files);
    };
    return (
        <div
            onDragEnter={(e) => { e.preventDefault(); if (!ocupado) setEncima(true); }}
            onDragOver={(e) => { e.preventDefault(); if (!ocupado) setEncima(true); }}
            onDragLeave={(e) => { e.preventDefault(); setEncima(false); }}
            onDrop={soltar}
            className={`rounded-2xl border p-4 transition-all ${encima ? 'border-amber-400 bg-amber-500/10' : hecha ? 'border-amber-500/40 bg-white/[0.04]' : 'border-white/12 bg-white/[0.03]'}`}
        >
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="text-white font-bold text-[15px] leading-snug">{titulo}</div>
                    <p className="text-white/50 text-[12.5px] leading-relaxed mt-1">{texto}</p>
                    {ejemplo && <p className="text-white/35 text-[11.5px] leading-relaxed mt-1">{ejemplo}</p>}
                </div>
                {hecha && <span className="text-emerald-300 text-[11px] font-black uppercase tracking-widest shrink-0 mt-0.5">✓</span>}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
                {files.map((f, i) => (
                    <Miniatura key={`${f.name}-${f.size}-${f.lastModified}-${i}`} file={f} deshabilitado={ocupado} onQuitar={() => onQuitar(i)} />
                ))}
                {!lleno && (
                    <label className={`w-20 h-20 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-all ${ocupado ? 'opacity-40 cursor-wait border-white/10' : 'cursor-pointer border-white/20 hover:border-amber-400 text-white/60 hover:text-amber-300'}`}>
                        <input type="file" accept="image/*" multiple className="hidden" disabled={ocupado}
                            onChange={(e) => { if (e.target.files?.length) onAdd(e.target.files); e.target.value = ''; }} />
                        {ICONO_CAMARA}
                        <span className="text-[10px] font-black uppercase tracking-widest">{files.length ? 'Otra' : 'Foto'}</span>
                    </label>
                )}
            </div>
        </div>
    );
}

// Botones de una sola elección (combustible, condensación).
function Opciones({ opciones, valor, onElegir }) {
    return (
        <div className="flex flex-wrap gap-2">
            {opciones.map((o) => (
                <button key={o.id} type="button" onClick={() => onElegir(o.id)}
                    className={`px-3.5 py-2.5 rounded-xl border text-[13.5px] font-bold transition-all ${valor === o.id
                        ? 'border-amber-400 bg-amber-500/10 text-white'
                        : 'border-white/12 bg-white/[0.03] text-white/70 hover:border-amber-500/50'}`}>
                    {o.label}{o.nota && <span className="text-white/40 font-normal"> · {o.nota}</span>}
                </button>
            ))}
        </div>
    );
}

const fmtKw = (kw) => (Number(kw) > 0 ? `${String(Math.round(Number(kw) * 10) / 10).replace('.', ',')} kW` : null);

export function StepPlacaCaldera({ estado, setEstado, onContinuar, onSinFoto, ej = false }) {
    const [leyendo, setLeyendo] = useState(false);
    // Una lectura que llega tarde (se cambió de foto entretanto) no pisa la nueva.
    const turno = useRef(0);
    // Se pone a `true` DENTRO del efecto: en StrictMode React monta, desmonta y vuelve
    // a montar, y con el `true` solo en el useRef se quedaba en `false` para siempre.
    // Toda lectura se descartaba y «Leyendo la placa…» no se quitaba (Fran, 16/11/2026).
    const vivo = useRef(true);
    useEffect(() => {
        vivo.current = true;
        return () => { vivo.current = false; };
    }, []);

    const e = estado || PLACA_CALDERA_VACIA;
    const lectura = e.lectura;
    const leido = lectura?.leido || null;
    const veredicto = lectura?.veredicto || null;

    const leer = async (placa, sala) => {
        const mio = ++turno.current;
        if (!placa.length) {
            setLeyendo(false);
            setEstado((prev) => ({ ...prev, lectura: null, error: null }));
            return;
        }
        setLeyendo(true);
        setEstado((prev) => ({ ...prev, error: null }));
        try {
            const form = new FormData();
            // La placa va ENTERA (el número vive en pocos píxeles: regla 27.d) y PRIMERO,
            // que es como las ordena el lector; la caldera entera, reducida, detrás.
            placa.slice(0, LEE_PLACA).forEach((f) => form.append('files', f));
            for (const f of sala.slice(0, LEE_SALA)) form.append('files', await prepararImagenParaSubir(f));
            const { data } = await axios.post('/api/oportunidades/leer-placa-caldera', form, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            if (!vivo.current || mio !== turno.current) return;
            setEstado((prev) => {
                const l = data?.leido || {};
                const next = { ...prev, lectura: data, error: null };
                // Lo leído se PROPONE mientras nadie haya elegido a mano.
                if (!prev.combustibleTocado) next.combustible = l.combustible || null;
                if (!prev.condensacionTocada) next.condensacion = modeloDiceCondensacion(l.modelo) ? 'si' : null;
                return next;
            });
        } catch (err) {
            if (!vivo.current || mio !== turno.current) return;
            setEstado((prev) => ({
                ...prev,
                lectura: null,
                error: err?.response?.data?.error || 'No hemos podido leer la foto. Prueba otra vez o sigue: la foto se guarda igual.',
            }));
        } finally {
            if (vivo.current && mio === turno.current) setLeyendo(false);
        }
    };

    const añadir = (cual, fileList) => {
        const nuevos = Array.from(fileList || []).filter((f) => (f.type || '').startsWith('image/') || /\.(heic|heif)$/i.test(f.name || ''));
        if (!nuevos.length) return;
        const lista = [...e[cual], ...nuevos].slice(0, MAX_FOTOS);
        const placa = cual === 'placa' ? lista : e.placa;
        const sala = cual === 'sala' ? lista : e.sala;
        setEstado((prev) => ({ ...prev, [cual]: lista }));
        // La de la sala solo se vuelve a leer si aporta: la marca suele estar en el
        // frontal y no en la etiqueta. Mientras se lee la placa se puede ir haciendo
        // la de la sala (es lo natural con el móvil delante), pero no relanza la lectura
        // en marcha: se guarda igual y sube a su apartado.
        if (cual === 'placa' || (!leyendo && placa.length && !(leido?.marca && leido?.modelo))) leer(placa, sala);
    };

    const quitar = (cual, i) => {
        const lista = e[cual].filter((_, j) => j !== i);
        const placa = cual === 'placa' ? lista : e.placa;
        const sala = cual === 'sala' ? lista : e.sala;
        setEstado((prev) => ({ ...prev, [cual]: lista }));
        if (cual === 'placa') leer(placa, sala);
    };

    const combustible = e.combustible;
    const esGasOGasoleo = ['gas_natural', 'glp', 'gasoleo'].includes(combustible);
    const potencia = potenciaDeLaPlaca(lectura, combustible, e.potencia);
    const anio = leido?.anio || (Number(e.anio) > 1900 ? Number(e.anio) : null);
    const condensacionLista = !esGasOGasoleo || !!e.condensacion;
    const caldera = combustible ? calderaDesdePlaca({ combustible, anio, condensacion: e.condensacion, modelo: leido?.modelo }) : null;
    const puedeSeguir = !!caldera && condensacionLista && !leyendo && e.placa.length > 0;

    const continuar = () => {
        if (!puedeSeguir) return;
        onContinuar({
            caldera,
            placa: placaCalderaParaInputs(lectura, {
                combustible, potenciaKw: potencia, anio: e.anio, condensacion: esGasOGasoleo ? e.condensacion : null,
            }),
        });
    };

    const tonoVeredicto = veredicto?.estado === 'ok'
        ? 'border-emerald-500/40 bg-emerald-500/10'
        : 'border-amber-500/40 bg-amber-500/10';

    const filas = leido ? [
        ['Marca', leido.marca],
        ['Modelo', leido.modelo],
        ['Potencia', fmtKw(potencia) || (lectura?.potencia_base === 'multicombustible' ? 'Una por combustible: elige el combustible' : null),
            leido.potencia_texto ? `En la placa: «${leido.potencia_texto}»` : null],
        ['Año', leido.anio ? String(leido.anio) : null],
        ['Nº de serie', leido.numero_serie, leido.serie_dudosa ? 'Dudoso: se revisará con la foto' : null],
    ] : [];

    const COND_OPCIONES = [
        { id: 'si', label: 'Sí' },
        { id: 'no', label: 'No' },
        { id: 'no_se', label: 'No lo sé', nota: anio ? (anio >= AÑO_SOLO_CONDENSACION ? 'por el año: sí' : 'por el año: no') : null },
    ];

    return (
        <StepLayout
            question={ej ? 'Fotos de la caldera que había' : 'Fotos de la caldera'}
            subtitle="Con la foto de la placa leemos la marca, la potencia y el año, y la simulación sale con la caldera real. Las dos fotos quedan guardadas en la obra."
        >
            <FotoTarjeta
                titulo="1 · La placa de características"
                texto="De cerca, que se lean los números. Suele estar en un lateral, debajo o tras la tapa."
                ejemplo="Sin flash ni reflejos. Si no cabe en una, haz dos."
                files={e.placa} max={MAX_FOTOS} ocupado={false} hecha={veredicto?.estado === 'ok'}
                onAdd={(fl) => añadir('placa', fl)} onQuitar={(i) => quitar('placa', i)}
            />
            <FotoTarjeta
                titulo="2 · La caldera en su sala"
                texto="Entera y con el cuarto alrededor (tuberías, salida de humos). No demasiado cerca."
                ejemplo="Hace falta para el certificado energético y para el expediente."
                files={e.sala} max={MAX_FOTOS} ocupado={false} hecha={e.sala.length > 0}
                onAdd={(fl) => añadir('sala', fl)} onQuitar={(i) => quitar('sala', i)}
            />

            {leyendo && (
                <div className="flex items-center justify-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                    <div className="relative w-5 h-5">
                        <div className="absolute inset-0 border-2 border-amber-500/20 rounded-full" />
                        <div className="absolute inset-0 border-2 border-transparent border-t-amber-400 rounded-full animate-spin" />
                    </div>
                    <span className="text-amber-200 text-[12.5px] font-bold">Leyendo la placa… (unos segundos)</span>
                </div>
            )}

            {e.error && !leyendo && (
                <div className="px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-100 text-[12.5px] leading-relaxed">{e.error}</div>
            )}

            {veredicto && !leyendo && (
                <div className={`rounded-2xl border px-4 py-3 ${tonoVeredicto}`}>
                    <div className={`font-bold text-[14px] ${veredicto.estado === 'ok' ? 'text-emerald-200' : 'text-amber-200'}`}>
                        {veredicto.estado === 'ok' ? '✓ ' : ''}{veredicto.titulo}
                    </div>
                    {veredicto.consejo && <p className="text-white/70 text-[12.5px] leading-relaxed mt-1">{veredicto.consejo}</p>}
                    {filas.some(([, v]) => v) && (
                        <dl className="mt-3 divide-y divide-white/10">
                            {filas.map(([k, v, nota]) => (
                                <div key={k} className="flex items-baseline justify-between gap-4 py-1.5">
                                    <dt className="text-white/45 text-[12px] shrink-0">{k}</dt>
                                    <dd className="text-right min-w-0">
                                        <div className={`text-[13.5px] font-bold break-words ${v ? 'text-white' : 'text-white/30'}`}>{v || 'No se lee'}</div>
                                        {nota && <div className="text-white/40 text-[11px] leading-snug break-words">{nota}</div>}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </div>
            )}

            {/* Lo que la foto no decide sola: se CONFIRMA aquí mismo, sin otra pantalla. */}
            {e.placa.length > 0 && !leyendo && (
                <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-4 space-y-4">
                    <div>
                        <div className="text-white font-bold text-[14px] mb-0.5">¿Qué combustible usa?</div>
                        <p className="text-white/40 text-[11.5px] mb-2.5">
                            {leido?.combustible ? 'Marcado el que dice la placa: confírmalo.' : 'La placa no lo dice: márcalo tú.'}
                        </p>
                        <Opciones opciones={COMBUSTIBLES_CALDERA} valor={combustible}
                            onElegir={(id) => setEstado((prev) => ({ ...prev, combustible: id, combustibleTocado: true }))} />
                    </div>

                    {esGasOGasoleo && (
                        <div>
                            <div className="text-white font-bold text-[14px] mb-0.5">¿Es de condensación?</div>
                            <p className="text-white/40 text-[11.5px] mb-2.5">
                                {modeloDiceCondensacion(leido?.modelo) && !e.condensacionTocada
                                    ? 'El modelo dice que sí.'
                                    : 'Tiene un tubo fino por debajo que evacúa agua, o lo pone la placa.'}
                            </p>
                            <Opciones opciones={COND_OPCIONES} valor={e.condensacion}
                                onElegir={(id) => setEstado((prev) => ({ ...prev, condensacion: id, condensacionTocada: true }))} />
                        </div>
                    )}

                    {/* Lo que la placa no dejó leer y quien la tiene delante puede ver. */}
                    {(!leido?.anio || !potencia) && (
                        <div className="grid grid-cols-2 gap-3">
                            {!leido?.anio && (
                                <label className="block">
                                    <span className="block text-white/60 text-[12px] font-bold mb-1">Año (si lo pone)</span>
                                    <input type="number" inputMode="numeric" min="1950" max={new Date().getFullYear()} placeholder="p. ej. 2006"
                                        value={e.anio} onChange={(ev) => setEstado((prev) => ({ ...prev, anio: ev.target.value }))}
                                        className="w-full bg-white/[0.06] border border-white/10 focus:border-amber-400 rounded-xl px-3 py-2.5 text-white text-[15px] font-bold outline-none" />
                                </label>
                            )}
                            {!potencia && (
                                <label className="block">
                                    <span className="block text-white/60 text-[12px] font-bold mb-1">Potencia kW (si la sabes)</span>
                                    <input type="text" inputMode="decimal" placeholder="p. ej. 24"
                                        value={e.potencia} onChange={(ev) => setEstado((prev) => ({ ...prev, potencia: ev.target.value }))}
                                        className="w-full bg-white/[0.06] border border-white/10 focus:border-amber-400 rounded-xl px-3 py-2.5 text-white text-[15px] font-bold outline-none" />
                                </label>
                            )}
                        </div>
                    )}

                    {caldera && condensacionLista && (
                        <p className="text-white/45 text-[12px] leading-relaxed">
                            Se calcula como: <strong className="text-white/80">{caldera.etiqueta}</strong>
                            {!anio && ' (sin año en la placa: la más reciente de su tipo)'}.
                        </p>
                    )}
                </div>
            )}

            <div className="pt-4 flex flex-col items-center gap-3">
                <button type="button" onClick={continuar} disabled={!puedeSeguir}
                    className={`w-full sm:max-w-xs px-8 py-4 font-black uppercase tracking-widest text-sm rounded-2xl transition-all ${puedeSeguir
                        ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep shadow-lg shadow-amber-500/20'
                        : 'bg-white/10 text-white/30 cursor-not-allowed'}`}>
                    Continuar
                </button>
                <button type="button" onClick={onSinFoto} disabled={leyendo}
                    className="text-white/45 hover:text-white/80 text-[12.5px] font-bold underline underline-offset-4 disabled:opacity-30">
                    No tengo la foto ahora, o no hay caldera: contestar a mano
                </button>
            </div>
        </StepLayout>
    );
}
