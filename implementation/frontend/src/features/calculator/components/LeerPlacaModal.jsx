import React, { useRef, useState } from 'react';
import axios from 'axios';
import { opcionDeEquipo } from '../../expedientes/logic/aerotermiaOpciones';

// ─────────────────────────────────────────────────────────────────────────────
// «Leer la placa» en la CALCULADORA.
//
// El gemelo de `LeerPlacasModal` del expediente para cuando todavía no hay
// expediente. Allí las fotos salen de Drive —las subió el instalador a su slot—;
// aquí las aporta quien está simulando, con el aparato delante o con la foto que
// le acaban de mandar por WhatsApp.
//
// Lo que resuelve: el catálogo tiene 490 equipos y hay familias enteras cuyo
// nombre comercial es idéntico (seis PANASONIC «Serie M R290 All in One 12 kW»
// que solo se distinguen por su referencia). Con la placa delante, reconocer el
// tuyo a ojo es imposible; con su código, inmediato.
//
// REGLA — el modelo solo LEE y el catálogo DECIDE. Este modal no calcula ningún
// SCOP: devuelve el equipo elegido y la calculadora lo selecciona en su propio
// desplegable, o sea por el MISMO camino que elegirlo a mano.
// ─────────────────────────────────────────────────────────────────────────────

const MAX = 3;

/** Una zona de fotos (la de fuera, la de dentro). */
function Zona({ id, titulo, ayuda, ficheros, onChange, destacada }) {
    const ref = useRef(null);
    const [encima, setEncima] = useState(false);

    const añadir = (lista) => {
        const imgs = Array.from(lista || []).filter(f => f.type?.startsWith('image/'));
        if (imgs.length) onChange([...ficheros, ...imgs].slice(0, MAX));
    };

    return (
        <div
            onDragOver={e => { e.preventDefault(); setEncima(true); }}
            onDragLeave={() => setEncima(false)}
            onDrop={e => { e.preventDefault(); setEncima(false); añadir(e.dataTransfer.files); }}
            className={`rounded-xl border p-3 transition-colors ${
                encima ? 'border-brand bg-brand/10'
                    : destacada ? 'border-slate-700/60 bg-slate-900/40' : 'border-slate-800 bg-slate-900/20'
            }`}
        >
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-white/80 uppercase tracking-wider">{titulo}</span>
                {ficheros.length > 0 && (
                    <button type="button" onClick={() => onChange([])} className="text-[10px] text-white/40 hover:text-white/70">
                        quitar
                    </button>
                )}
            </div>
            <p className="text-[11px] text-white/40 mt-0.5 leading-snug">{ayuda}</p>

            {ficheros.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                    {ficheros.map((f, i) => (
                        <img
                            key={i}
                            src={URL.createObjectURL(f)}
                            alt=""
                            className="w-14 h-14 object-cover rounded-lg border border-white/10"
                        />
                    ))}
                </div>
            )}

            <input
                ref={ref}
                id={id}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => { añadir(e.target.files); e.target.value = ''; }}
            />
            <button
                type="button"
                onClick={() => ref.current?.click()}
                className="mt-2 w-full py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white/80"
            >
                {ficheros.length ? '+ Añadir otra foto' : '📷 Elegir foto de la placa'}
                {/* En un móvil, el selector ofrece cámara Y galería: muchas de esas
                    fotos ya están hechas, así que el botón no dice «hacer foto». */}
            </button>
            {/* La pista de arrastrar solo en PC: en un móvil no hay de dónde
                arrastrar y mencionarlo solo confunde. */}
            <p className="hidden md:block text-[10px] text-white/25 mt-1 text-center">o arrástrala aquí</p>
        </div>
    );
}

/** Lo transcrito de una placa, tal cual: es contra lo que se contrasta. */
function Leido({ etiqueta, d }) {
    if (!d) return null;
    return (
        <div className="rounded-lg bg-slate-900/50 border border-slate-800 p-2.5">
            <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{etiqueta}</div>
            <div className="text-sm font-mono font-semibold text-white mt-0.5 break-all">
                {d.modelo || <span className="text-amber-300 font-sans">no se lee el modelo</span>}
            </div>
            <div className="text-[11px] text-white/50 mt-0.5">
                {[d.marca, d.potencia_kw ? `${String(d.potencia_kw).replace('.', ',')} kW` : null, d.refrigerante]
                    .filter(Boolean).join(' · ')}
            </div>
            {d.numero_serie && <div className="text-[11px] text-white/70 mt-1">Nº de serie: <b className="font-mono">{d.numero_serie}</b></div>}
            {/* La LÍNEA literal de la placa. Es la EVIDENCIA: permite contrastar el
                número sin volver a abrir la foto. */}
            {d.serie_texto && <div className="text-[10px] text-white/35 italic break-all mt-0.5">«{d.serie_texto}»</div>}
        </div>
    );
}

export default function LeerPlacaModal({ onClose, onElegir }) {
    const [ext, setExt] = useState([]);
    const [int, setInt] = useState([]);
    const [fase, setFase] = useState('idle');   // idle | leyendo | listo
    const [res, setRes] = useState(null);
    const [error, setError] = useState('');
    const [elegido, setElegido] = useState(null);

    const leer = async () => {
        setFase('leyendo'); setError(''); setRes(null); setElegido(null);
        try {
            const fd = new FormData();
            ext.forEach(f => fd.append('exterior', f));
            int.forEach(f => fd.append('interior', f));
            const { data } = await axios.post('/api/aerotermia/leer-placa', fd);
            setRes(data);
            // Con un único equipo posible, ya está elegido; con varios NO se elige
            // por el usuario: sería declarar el SCOP de otra máquina.
            setElegido(data.modelo || null);
            setFase('listo');
        } catch (e) {
            setError(e.response?.data?.error || e.message || 'No se ha podido leer la placa.');
            setFase('idle');
        }
    };

    const candidatos = res?.candidatos?.length > 1 ? res.candidatos : [];

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-950 border border-slate-800 shadow-2xl">
                <div className="sticky top-0 bg-slate-950/95 backdrop-blur px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <span className="text-brand">✨</span> Leer la placa
                    </h3>
                    <button type="button" onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
                </div>

                <div className="p-5 space-y-3">
                    {fase !== 'listo' && (
                        <>
                            <p className="text-xs text-white/50 leading-relaxed">
                                Sube la foto de la <b className="text-white/80">etiqueta de características</b> y la app
                                dice qué equipo del catálogo es, con su SCOP. La placa se lee <b>sola</b>: nada de fotos
                                del aparato entero al lado, que hacen que el nº de serie salga mal.
                            </p>

                            <Zona
                                id="placa-ext" destacada
                                titulo="Unidad exterior"
                                ayuda="La pegatina de la máquina de fuera. Es la que identifica el equipo."
                                ficheros={ext} onChange={setExt}
                            />
                            <Zona
                                id="placa-int"
                                titulo="Unidad interior (si la hay)"
                                ayuda="Solo si el equipo lleva un aparato dentro (hidrokit o All in One). Sirve para desempatar cuando la misma unidad exterior se vende con varias interiores."
                                ficheros={int} onChange={setInt}
                            />

                            {error && <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg p-2.5">{error}</div>}

                            <button
                                type="button"
                                disabled={(!ext.length && !int.length) || fase === 'leyendo'}
                                onClick={leer}
                                className="w-full py-3 rounded-xl bg-brand text-slate-950 font-black text-sm uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                {fase === 'leyendo' ? 'Leyendo la placa…' : 'Leer la placa'}
                            </button>
                        </>
                    )}

                    {fase === 'listo' && (
                        <>
                            <Leido etiqueta="Lo que pone la placa de fuera" d={res?.unidades?.exterior} />
                            <Leido etiqueta="Lo que pone la placa de dentro" d={res?.unidades?.interior} />

                            {elegido && (
                                <div className="rounded-xl border border-brand/40 bg-brand/10 p-3">
                                    <div className="text-[10px] font-bold text-brand uppercase tracking-wider">Equipo del catálogo</div>
                                    <div className="text-sm font-semibold text-white mt-1">{opcionDeEquipo(elegido).label}</div>
                                    <div className="text-[11px] font-mono text-brand/80">{opcionDeEquipo(elegido).sublabel}</div>
                                    {res?.por && <div className="text-[10px] text-white/40 mt-1">Casado por {res.por}.</div>}
                                </div>
                            )}

                            {/* Con varios candidatos NO se elige por el usuario: es la
                                diferencia entre un callejón sin salida y una elección. */}
                            {!elegido && candidatos.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="text-[11px] text-amber-300 font-semibold">Elige cuál es:</div>
                                    {candidatos.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setElegido(c)}
                                            className="w-full text-left rounded-lg border border-slate-700 hover:border-brand/60 bg-slate-900/50 p-2.5"
                                        >
                                            <div className="text-xs font-semibold text-white">{opcionDeEquipo(c).label}</div>
                                            <div className="text-[10px] font-mono text-white/50">{opcionDeEquipo(c).sublabel}</div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {(res?.avisos || []).map((a, i) => (
                                <div key={i} className="text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-lg p-2.5 leading-relaxed">
                                    {a}
                                </div>
                            ))}

                            <div className="flex gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setFase('idle'); setRes(null); setElegido(null); }}
                                    className="px-4 py-2.5 rounded-xl border border-slate-700 text-xs font-semibold text-white/60 hover:text-white"
                                >
                                    Otra foto
                                </button>
                                <button
                                    type="button"
                                    disabled={!elegido}
                                    onClick={() => onElegir(elegido, res?.unidades || {})}
                                    className="flex-1 py-2.5 rounded-xl bg-brand text-slate-950 font-black text-xs uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    Usar este equipo
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
