/**
 * TraerDeWhatsapp — las fotos que el cliente mandó por WhatsApp, al repartidor.
 *
 * Muchos clientes no usan el enlace de subida: mandan las fotos al WhatsApp de la
 * empresa. Esto las lee del propio chat y las entrega al REPARTIDOR (BuzonFotos),
 * que propone el apartado de cada una y espera a que una persona lo confirme — el
 * mismo camino que soltarlas a mano. Aquí no se sube ni se coloca nada.
 *
 * Tres pasos, en el orden en que se piensa: DE QUIÉN (qué chats) → QUÉ (lo que ha
 * llegado, con lo ya colocado marcado) → TRAER (se bajan de una en una, con
 * parada). Solo STAFF: se lee la conversación real de un cliente.
 *
 * La lógica vive en el backend (`services/whatsappMedia.js`); esto solo la enseña.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

const PERIODOS = [7, 30, 90];

const ROL_LABEL = {
    titular: 'Titular', propietario: 'Propietario', contacto: 'Contacto',
    vinculo: 'Chat vinculado', instalador: 'Instalador',
};

const telBonito = (t) => String(t || '').replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');

// "Titular" y no "Titular — Titular": el detalle solo se añade si dice algo más.
function rotuloContacto(c) {
    const roles = c.roles.map(r => ROL_LABEL[r] || r);
    const extra = (c.detalle || '').split(' · ').filter(d => d && !roles.includes(d));
    return [...roles, ...extra].join(' · ');
}

const fechaCorta = (tSeg) => new Date(tSeg * 1000).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

const mb = (bytes) => (bytes ? `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB` : '');

const ICONO = { image: '🖼️', video: '🎬', pdf: '📄' };

export function TraerDeWhatsapp({ idOrUuid, adminBase = '/api/oportunidades', slots = [], onListo, onCerrar }) {
    const base = `${adminBase}/${idOrUuid}/whatsapp-media`;

    // ── Paso 1: de quién ────────────────────────────────────────────────────
    const [contactos, setContactos] = useState(null);
    const [wa, setWa] = useState(null);                 // { ok, simulado, motivo }
    const [elegidos, setElegidos] = useState(new Set());
    const [otro, setOtro] = useState('');
    const [dias, setDias] = useState(30);
    const [error, setError] = useState(null);

    // ── Paso 2: qué ha llegado ──────────────────────────────────────────────
    const [buscando, setBuscando] = useState(false);
    const [resultado, setResultado] = useState(null);   // { chats, media, colocadas, dias }
    const [marcados, setMarcados] = useState(new Set());

    // ── Paso 3: traerlas ────────────────────────────────────────────────────
    const [bajando, setBajando] = useState(null);       // { hecho, total }
    const [fallos, setFallos] = useState(null);         // [{ nombre, error }] tras bajar
    const [traidas, setTraidas] = useState(null);       // File[] listos, si hubo fallos
    // La bandera de parada va por ref: el bucle corre fuera del render y con
    // estado leería el valor del render en que arrancó.
    const parar = useRef(false);

    useEffect(() => {
        let vivo = true;
        axios.get(`${base}/contactos`).then(({ data }) => {
            if (!vivo) return;
            setContactos(data.contactos || []);
            setWa(data.whatsapp || null);
            setElegidos(new Set((data.contactos || []).filter(c => c.recomendado).map(c => c.tel)));
        }).catch(e => vivo && setError(e.response?.data?.error || 'No se pudieron cargar los contactos.'));
        return () => { vivo = false; };
    }, [base]);

    // Esc cierra (en el PC es el gesto de siempre), salvo mientras se lee o se
    // baja: cortar ahí dejaría la petición viva y sin nadie que la espere.
    const ocupado = !!bajando || buscando;
    useEffect(() => {
        const alPulsar = (e) => { if (e.key === 'Escape' && !ocupado) onCerrar(); };
        window.addEventListener('keydown', alPulsar);
        return () => window.removeEventListener('keydown', alPulsar);
    }, [ocupado, onCerrar]);

    const nombrePorTel = useMemo(() => {
        const m = {};
        (contactos || []).forEach(c => { m[c.tel] = c.nombre; });
        return m;
    }, [contactos]);

    const labelSlot = (key) => slots.find(s => s.key === key)?.label || key;

    const toggle = (set, setter, id) => {
        const n = new Set(set);
        if (n.has(id)) n.delete(id); else n.add(id);
        setter(n);
    };

    const otroValido = otro.replace(/\D/g, '').length >= 9;
    const telefonos = [...elegidos, ...(otroValido ? [otro.replace(/\D/g, '').slice(-9)] : [])];

    const buscar = async () => {
        if (!telefonos.length || buscando) return;
        setBuscando(true);
        setError(null);
        try {
            const { data } = await axios.post(`${base}/buscar`, { telefonos, dias }, { timeout: 10 * 60 * 1000 });
            setResultado(data);
            // Se marca lo que se viene a buscar: lo que no está ya colocado AQUÍ
            // y se puede bajar. Lo colocado en OTRA obra no se marca — puede ser
            // de otra obra del mismo instalador, y eso lo decide una persona.
            setMarcados(new Set((data.media || [])
                .filter(it => !it.grande && !data.colocadas?.[it.id])
                .map(it => it.id)));
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo leer WhatsApp.');
        } finally {
            setBuscando(false);
        }
    };

    const media = resultado?.media || [];
    const seleccion = media.filter(it => marcados.has(it.id));

    const traer = async () => {
        if (!seleccion.length || bajando) return;
        parar.current = false;
        setError(null);
        const files = [];
        const errores = [];
        setBajando({ hecho: 0, total: seleccion.length });
        // De UNA en UNA: es el mismo Chrome del que dependen todos los envíos de
        // la app, y el servidor las pone en fila igualmente.
        for (let i = 0; i < seleccion.length; i++) {
            if (parar.current) break;
            const it = seleccion[i];
            try {
                const res = await axios.get(`${base}/descargar`, {
                    params: { msg: it.id }, responseType: 'blob', timeout: 3 * 60 * 1000,
                });
                const nombre = decodeURIComponent(res.headers['x-nombre-archivo'] || it.nombre);
                const tipo = res.headers['content-type'] || it.mimetype || res.data.type;
                const f = new File([res.data], nombre, { type: tipo, lastModified: it.t * 1000 });
                // Viaja pegado al fichero hasta el repartidor, que al colocarla
                // avisa de qué mensaje era (para no volver a ofrecerla).
                f.wa = { msgId: it.id, t: it.t, tipo: it.tipo, caption: it.caption || '' };
                files.push(f);
            } catch (e) {
                // El error de un blob llega como blob: hay que leerlo para decirlo.
                let msg = 'No se pudo bajar.';
                try { msg = JSON.parse(await e.response?.data?.text?.())?.error || msg; } catch { /* sin detalle */ }
                errores.push({ nombre: it.caption || fechaCorta(it.t), error: msg });
            }
            setBajando({ hecho: i + 1, total: seleccion.length });
        }
        setBajando(null);
        if (!files.length) {
            setError(errores[0]?.error || 'No se ha podido traer ninguna.');
            return;
        }
        // Sin fallos se pasa DIRECTO al repartidor: un "listo" que hay que cerrar
        // para que aparezca otra pantalla es un clic de peaje.
        if (!errores.length && !parar.current) { onListo(files); return; }
        setTraidas(files);
        setFallos(errores);
    };

    // ── Pintado ─────────────────────────────────────────────────────────────
    const cuerpo = () => {
        if (!contactos && !error) {
            return <p className="text-white/40 text-sm text-center py-10">Cargando contactos…</p>;
        }

        if (traidas) {
            return (
                <div className="space-y-4">
                    <p className="text-sm text-white/70">
                        Se han traído <strong className="text-white">{traidas.length}</strong>
                        {parar.current ? ' (paraste antes de terminar)' : ''}.
                    </p>
                    {fallos?.length > 0 && (
                        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3">
                            <p className="text-amber-200 text-xs font-black uppercase tracking-wider mb-1.5">
                                No se {fallos.length === 1 ? 'pudo traer 1' : `pudieron traer ${fallos.length}`}
                            </p>
                            <ul className="space-y-1">
                                {fallos.map((f, i) => (
                                    <li key={i} className="text-xs text-white/70"><span className="text-white/45">{f.nombre}:</span> {f.error}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            );
        }

        if (bajando) {
            return (
                <div className="py-10 text-center space-y-4">
                    <div className="w-10 h-10 mx-auto rounded-full border-4 border-emerald-400/20 border-t-emerald-400 animate-spin" />
                    <p className="text-white font-black text-sm">Trayendo {Math.min(bajando.hecho + 1, bajando.total)} de {bajando.total}…</p>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden max-w-xs mx-auto">
                        <div className="h-full bg-emerald-400 transition-all" style={{ width: `${(bajando.hecho / bajando.total) * 100}%` }} />
                    </div>
                    <p className="text-white/40 text-xs">Se bajan de una en una del propio WhatsApp.</p>
                </div>
            );
        }

        if (buscando) {
            return (
                <div className="py-10 text-center space-y-3">
                    <div className="w-10 h-10 mx-auto rounded-full border-4 border-emerald-400/20 border-t-emerald-400 animate-spin" />
                    <p className="text-white font-black text-sm">Leyendo {telefonos.length === 1 ? 'el chat' : `${telefonos.length} chats`}…</p>
                    <p className="text-white/40 text-xs max-w-sm mx-auto">
                        Si hay que traer mensajes antiguos del teléfono puede tardar un poco.
                    </p>
                </div>
            );
        }

        if (resultado) {
            return (
                <div className="space-y-4">
                    {/* De cada chat, qué se ha encontrado: un "no hay nada" tiene que
                        distinguirse de "no hay conversación" y de "no se ha podido leer". */}
                    <ul className="space-y-1">
                        {resultado.chats.map(c => (
                            <li key={c.tel} className="text-xs flex flex-wrap items-baseline gap-x-2">
                                <span className="text-white/70 font-bold">{nombrePorTel[c.tel] || telBonito(c.tel)}</span>
                                <span className="text-white/30">{telBonito(c.tel)}</span>
                                <span className={c.estado === 'ok' ? 'text-emerald-300' : c.estado === 'sin_chat' ? 'text-white/40' : 'text-amber-300'}>
                                    · {c.estado === 'ok'
                                        ? `${c.n} ${c.n === 1 ? 'archivo' : 'archivos'}${c.incompleto ? ' (no se ha podido cargar todo el periodo)' : ''}`
                                        : c.estado === 'sin_chat' ? 'no hay conversación con este número' : c.error}
                                </span>
                            </li>
                        ))}
                    </ul>

                    {!media.length ? (
                        <p className="text-white/40 text-sm text-center py-8">
                            No ha llegado ninguna foto, vídeo ni PDF en los últimos {resultado.dias} días.
                        </p>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center gap-2">
                                {[
                                    ['Todas', () => setMarcados(new Set(media.filter(it => !it.grande).map(it => it.id)))],
                                    ['Ninguna', () => setMarcados(new Set())],
                                    ['Solo fotos nuevas', () => setMarcados(new Set(media.filter(it => it.tipo === 'image' && !resultado.colocadas?.[it.id]).map(it => it.id)))],
                                ].map(([txt, fn]) => (
                                    <button key={txt} onClick={fn}
                                        className="px-3 py-2.5 md:py-1.5 rounded-lg border border-white/10 text-[11px] font-black uppercase tracking-wider text-white/55 hover:text-white hover:border-white/30 transition-all">
                                        {txt}
                                    </button>
                                ))}
                                <span className="ml-auto text-[11px] font-bold text-white/40">{seleccion.length} de {media.length}</span>
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                {media.map(it => {
                                    const col = resultado.colocadas?.[it.id];
                                    const on = marcados.has(it.id);
                                    return (
                                        <button key={it.id} type="button" disabled={it.grande}
                                            onClick={() => toggle(marcados, setMarcados, it.id)}
                                            title={it.caption || it.nombre}
                                            className={`relative text-left rounded-xl overflow-hidden border-2 transition-all ${on ? 'border-emerald-400' : 'border-white/10 hover:border-white/30'} ${it.grande ? 'opacity-40 cursor-not-allowed' : ''}`}>
                                            <div className="aspect-square bg-white/[0.04] flex items-center justify-center">
                                                {it.thumb
                                                    ? <img src={`data:image/jpeg;base64,${it.thumb}`} alt="" className={`w-full h-full object-cover ${col?.aqui && !on ? 'opacity-40' : ''}`} />
                                                    : <span className="text-3xl">{ICONO[it.tipo] || '📎'}</span>}
                                            </div>
                                            <span className={`absolute top-1.5 right-1.5 w-6 h-6 md:w-5 md:h-5 rounded-md border-2 flex items-center justify-center text-xs md:text-[11px] font-black ${on ? 'bg-emerald-400 border-emerald-400 text-black' : 'bg-black/50 border-white/50 text-transparent'}`}>✓</span>
                                            {it.tipo !== 'image' && it.thumb && (
                                                <span className="absolute top-1.5 left-1.5 text-sm">{ICONO[it.tipo]}</span>
                                            )}
                                            <div className="px-1.5 py-1 space-y-0.5">
                                                <p className="text-[11px] md:text-[10px] text-white/60 font-bold truncate">{fechaCorta(it.t)}<span className="max-md:hidden"> · {nombrePorTel[it.tel] || telBonito(it.tel)}</span></p>
                                                {it.caption && <p className="text-[10px] text-white/45 truncate">“{it.caption}”</p>}
                                                {col?.aqui && <p className="text-[10px] text-emerald-300 font-black truncate">✓ Ya colocada · {labelSlot(col.slot)}</p>}
                                                {col && !col.aqui && <p className="text-[10px] text-amber-300 font-black truncate">En {col.oportunidad}</p>}
                                                {it.original && <p className="text-[10px] text-sky-300 font-bold truncate">Original, sin comprimir</p>}
                                                {it.grande && <p className="text-[10px] text-amber-300 font-bold truncate">{mb(it.size)} · demasiado grande</p>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            );
        }

        // Paso 1 — de quién y de cuándo.
        return (
            <div className="space-y-5">
                {wa && !wa.ok && (
                    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-amber-200 text-xs font-bold">
                        {wa.motivo || 'WhatsApp no está conectado ahora mismo.'} Revísalo en Ajustes → WhatsApp.
                    </div>
                )}
                {wa?.simulado && (
                    <div className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-sky-200 text-xs font-bold">
                        Modo de prueba: WhatsApp está apagado aquí y se enseñan fotos de ejemplo.
                    </div>
                )}

                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">¿De qué chats?</p>
                    {!contactos?.length ? (
                        <p className="text-white/40 text-sm">Este expediente no tiene ningún teléfono en sus fichas. Escribe abajo el número.</p>
                    ) : (
                        <div className="space-y-1.5">
                            {contactos.map(c => {
                                const on = elegidos.has(c.tel);
                                return (
                                    <button key={c.tel} type="button" onClick={() => toggle(elegidos, setElegidos, c.tel)}
                                        className={`w-full flex items-start gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all ${on ? 'border-emerald-400/60 bg-emerald-400/[0.06]' : 'border-white/10 hover:border-white/25'}`}>
                                        <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center text-[11px] font-black shrink-0 ${on ? 'bg-emerald-400 border-emerald-400 text-black' : 'border-white/30 text-transparent'}`}>✓</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm text-white font-bold truncate">{c.nombre}</span>
                                            <span className="block text-[11px] text-white/45 truncate">
                                                {telBonito(c.tel)} · {rotuloContacto(c)}
                                            </span>
                                            {c.aviso && <span className="block text-[11px] text-amber-300 mt-0.5">{c.aviso}</span>}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                    <input value={otro} onChange={e => setOtro(e.target.value)} inputMode="tel"
                        onKeyDown={e => { if (e.key === 'Enter') buscar(); }}
                        placeholder="Otro número de teléfono"
                        title="El de quien mandó las fotos, si no está arriba"
                        className="mt-2 w-full min-h-[44px] bg-white/[0.06] border-2 border-white/10 focus:border-emerald-400 rounded-xl px-3 py-2 text-white text-base md:text-sm outline-none" />
                </div>

                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">¿De cuándo?</p>
                    <div className="grid grid-cols-3 md:flex gap-2">
                        {PERIODOS.map(p => (
                            <button key={p} onClick={() => setDias(p)}
                                className={`min-h-[44px] md:min-h-0 px-3 py-1.5 rounded-xl text-xs font-black border-2 transition-all ${dias === p ? 'border-emerald-400 text-emerald-300 bg-emerald-400/10' : 'border-white/10 text-white/50 hover:text-white'}`}>
                                <span className="max-md:hidden">Últimos </span>{p} días
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // Botones del pie. En el móvil el principal ocupa lo que sobra de la fila y
    // todos llegan a los 44 px de objetivo táctil; en el PC vuelven a su tamaño.
    const BTN_SEC = 'min-h-[44px] md:min-h-0 px-4 py-2 text-xs font-bold text-white/50 hover:text-white uppercase tracking-widest shrink-0 disabled:opacity-40';
    const BTN_PRI = 'min-h-[44px] md:min-h-0 flex-1 md:flex-none px-6 py-2.5 text-xs font-black rounded-xl uppercase tracking-widest text-black transition-all disabled:opacity-40';

    const pie = () => {
        if (bajando) {
            return (
                <button onClick={() => { parar.current = true; }} className={`${BTN_SEC} md:ml-auto`}>
                    Parar aquí
                </button>
            );
        }
        if (traidas) {
            return (
                <button onClick={() => onListo(traidas)} className={`${BTN_PRI} md:ml-auto bg-amber-500 hover:bg-amber-400`}>
                    Repartir {traidas.length}
                </button>
            );
        }
        if (resultado) {
            return (
                <>
                    <button onClick={() => { setResultado(null); setError(null); }} disabled={buscando} className={BTN_SEC}>
                        ← <span className="max-md:hidden">Cambiar </span>chats
                    </button>
                    <button onClick={traer} disabled={!seleccion.length} className={`${BTN_PRI} bg-amber-500 hover:bg-amber-400`}>
                        Traer {seleccion.length}<span className="max-md:hidden"> al repartidor</span>
                    </button>
                </>
            );
        }
        return (
            <>
                <button onClick={onCerrar} className={BTN_SEC}>Cancelar</button>
                <button onClick={buscar} disabled={!telefonos.length || buscando || (wa && !wa.ok)}
                    className={`${BTN_PRI} bg-emerald-500 hover:bg-emerald-400`}>
                    Buscar en WhatsApp
                </button>
            </>
        );
    };

    // Portaleado a <body>: dentro del modal de documentación (con backdrop-blur),
    // un `fixed` se anclaría a él y no a la pantalla. En el MÓVIL es hoja inferior
    // —el pulgar llega a los botones sin estirarse—; en el PC, centrado.
    return createPortal(
        <div className="fixed inset-0 z-[300] flex items-center justify-center max-md:items-end p-4 max-md:p-0 bg-black/85 backdrop-blur-md"
            onClick={() => { if (!ocupado) onCerrar(); }}>
            <div className="bg-bkg-deep border border-white/10 rounded-3xl max-md:rounded-b-none w-full max-w-2xl flex flex-col max-h-[92vh] max-md:max-h-[94dvh] shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-white/20 shrink-0" />
                <div className="px-5 md:px-6 py-3 md:py-4 border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-white font-black uppercase tracking-widest text-sm flex items-center gap-2">
                            <span className="text-emerald-400">💬</span> Traer del WhatsApp
                        </h3>
                        <p className="text-white/40 text-[11px] mt-0.5">
                            {resultado ? 'Marca lo que quieres llevar al expediente. Después se reparte en sus apartados.'
                                : 'Las fotos que el cliente mandó al WhatsApp de la empresa, sin bajarlas del móvil.'}
                        </p>
                    </div>
                    <button onClick={onCerrar} disabled={ocupado} aria-label="Cerrar"
                        className="w-11 h-11 md:w-9 md:h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all shrink-0 disabled:opacity-30">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {error && (
                    <div className="mx-5 md:mx-6 mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2.5 text-amber-200 text-xs font-bold">
                        {error}
                    </div>
                )}

                <div className="p-4 md:p-6 overflow-y-auto flex-1 overscroll-contain">{cuerpo()}</div>

                <div className="px-4 md:px-6 pt-3 md:py-4 bg-black/30 border-t border-white/10 flex items-center justify-between gap-3 shrink-0"
                    style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                    {pie()}
                </div>
            </div>
        </div>,
        document.body
    );
}

export default TraerDeWhatsapp;
