import { useCallback, useEffect, useRef, useState } from 'react';
import { aspectoDeUrl, prepararFoto, uidHueco } from '../logic/fotoMovil';
import { cambiarEnCola, encolarFoto, fotosEnCola, guardarPoner, leerPoner, nuevoIdLocal, pedir,
         purgarCola, quitarDeCola } from '../logic/bandejaMovil';
import { IconoCamara, IconoImagen } from './IconosCroquis';

// ─────────────────────────────────────────────────────────────────────────────
// La FOTO de cada pared, hecha desde el TELÉFONO (el enlace del croquis móvil).
//
// El técnico está delante del edificio con la planta en la mano: toca una pared,
// le hace la foto y la foto queda pegada a ESA pared —lo mismo que subirla desde
// la ventana del ordenador (`paredFotoService`)—. En una FACHADA, además, se
// cuentan sus ventanas y puertas (`paredOcrService`) y se estima su medida.
//
// REGLA — lo leído se REVISA AQUÍ, que es donde está la fachada. Mismo criterio
// que el popup de la foto del ordenador (`LecturaFotoModal`): con la pared vacía
// se ofrece todo marcado; con huecos ya puestos, nada — añadir a ciegas
// duplicaría la fachada —, y sustituirlos es un botón aparte que dice las dos
// cifras. Al confirmar, lo pone en el plano el ORDENADOR, que es quien tiene el
// trabajo y lo guarda; nace en ámbar, por confirmar.
//
// REGLA — un uid por hueco se fija AQUÍ, antes de mandarlo: con él, la marca de
// la foto (dónde está cada ventana) y el hueco del plano casan sin preguntar.
//
// ── SIN COBERTURA (2026-09-30) ──────────────────────────────────────────────
// REGLA — la foto se apunta en el TELÉFONO antes de mandarla (`bandejaMovil`):
// hecha con la cámara, muchas veces no queda en la galería, y si la señal se
// corta a mitad de la subida no habría forma de recuperarla. Se sube sola en
// cuanto hay red, y entonces se cuentan sus ventanas; lo confirmado sin señal
// también se manda solo. Mientras tanto se pueden seguir haciendo fotos.
//
// REGLA — una TAREA por pared, no una sola: sin cobertura se hacen fotos de
// varias fachadas seguidas y cada una se lee cuando llega; lo leído espera en
// SU pared a que se revise («por revisar»), también si se cambia de pestaña
// —por eso este panel no se desmonta al pasar al croquis—.
// ─────────────────────────────────────────────────────────────────────────────

//: Los colores de los huecos son los del PLANO (`COLOR_HUECO` en PlanoPlanta):
//: ventana, el del vidrio; puerta, marrón. Dos lenguajes para lo mismo obligan
//: a traducir entre las dos pantallas.
const COLOR = { ventana: 'var(--info)', puerta: '#b5763a' };
//: Mientras haya algo que el servidor aún no acepta (el ordenador pone los
//: huecos anteriores), se reintenta cada poco. Sin red no: eso lo avisa `pulso`.
const REINTENTO_MS = 5000;

const fmt = (n) => Number(n).toFixed(2).replace('.', ',');
const fmt1 = (n) => Number(n).toFixed(1).replace('.', ',');
const enc = encodeURIComponent;

/** Las fases en las que la foto (o lo leído) aún no ha llegado a donde va. */
const FASES_PENDIENTES = new Set(['en_cola', 'subiendo', 'por_leer', 'poner_en_cola']);

export function FotosParedMovil({ token, apiBase, clave, paredes, fotosPorPared, selId, onElegir,
                                  onFotosCambian, resultadoHuecos, sinOrdenador, sinRed = false, pulso = 0,
                                  onRed, onPendientes, onEstadoParedes }) {
    // paredId → { fase, local, idCola, driveId, lectura, marcados, idPoner, n, cuantos, texto, aviso }
    const [tareas, setTareas] = useState({});
    const tareasRef = useRef({});
    //: Las fotos que aún no han llegado al servidor, con su URL local para verlas.
    const [cola, setCola] = useState([]);
    const colaRef = useRef([]);
    //: Los huecos confirmados sin cobertura (se guardan también en el teléfono).
    const [ponerCola, setPonerCola] = useState(() => leerPoner(clave));
    const ponerRef = useRef(ponerCola);
    //: Las fotos ya subidas cuyas ventanas hay que contar.
    const porLeer = useRef([]);
    const [nPorLeer, setNPorLeer] = useState(0);
    const trabajando = useRef(false);
    const otraVez = useRef(false);
    const procesarRef = useRef(null);
    const paredesRef = useRef(paredes);
    useEffect(() => { paredesRef.current = paredes; }, [paredes]);
    const camara = useRef(null);
    const galeria = useRef(null);

    const ponTarea = useCallback((id, v) => {
        const prev = tareasRef.current[id];
        const nuevo = typeof v === 'function' ? v(prev) : v;
        if (nuevo === prev) return;
        const siguiente = { ...tareasRef.current };
        if (nuevo) siguiente[id] = nuevo; else delete siguiente[id];
        tareasRef.current = siguiente;
        setTareas(siguiente);
    }, []);
    const ponCola = useCallback((fn) => {
        colaRef.current = fn(colaRef.current);
        setCola(colaRef.current);
    }, []);
    const ponPoner = useCallback((fn) => {
        ponerRef.current = fn(ponerRef.current);
        guardarPoner(clave, ponerRef.current);
        setPonerCola(ponerRef.current);
    }, [clave]);

    // ── La cola que quedó de antes (una recarga, un enlace que caducó) ────────
    useEffect(() => {
        let vivo = true;
        const urls = [];
        (async () => {
            await purgarCola();
            const lista = await fotosEnCola(clave);
            if (!vivo) return;
            const conUrl = lista.map((i) => {
                let url = null;
                try { url = URL.createObjectURL(i.blob); urls.push(url); } catch { /* sin vista previa */ }
                return { ...i, url };
            });
            colaRef.current = [...conUrl, ...colaRef.current.filter(c => !conUrl.some(x => x.id === c.id))];
            setCola(colaRef.current);
            for (const i of conUrl) {
                if (!i.error && !tareasRef.current[i.pared]) ponTarea(i.pared, { fase: 'en_cola', local: i.url, idCola: i.id });
            }
            procesarRef.current?.();
        })();
        return () => { vivo = false; urls.forEach((u) => { try { URL.revokeObjectURL(u); } catch { /* ya */ } }); };
    }, [clave, ponTarea]);

    // ── Mandar lo pendiente, de uno en uno ────────────────────────────────────
    const subirItem = useCallback(async (item) => {
        ponTarea(item.pared, (t) => (t?.idCola === item.id ? { ...t, fase: 'subiendo' } : t));
        try {
            const fd = new FormData();
            const f = item.blob instanceof File ? item.blob
                : new File([item.blob], item.nombre || 'foto.jpg', { type: item.blob?.type || 'image/jpeg' });
            fd.append('file', f);
            const r = await pedir(`${apiBase}/${token}/fotos?pared=${enc(item.pared)}&id_local=${enc(item.id)}`,
                                  { method: 'POST', body: fd }, { plazo: 120_000 });
            onRed?.(true);
            const d = await r.json().catch(() => ({}));
            // El enlace se ha cerrado: se queda en el teléfono para el siguiente QR.
            if (r.status === 410) return 'parar';
            if (!r.ok) {
                const texto = d.error || 'No se ha podido subir la foto.';
                await cambiarEnCola(item.id, { error: texto });
                ponCola((c) => c.map((i) => (i.id === item.id ? { ...i, error: texto } : i)));
                // El aviso, con sus botones, lo pinta la propia foto de la cola.
                ponTarea(item.pared, (t) => (t?.idCola === item.id ? null : t));
                return 'error';
            }
            await quitarDeCola(item.id);
            ponCola((c) => c.filter((i) => i.id !== item.id));
            onFotosCambian?.();
            const driveId = d.puesta?.drive_id;
            if (item.leer && driveId) {
                // Si ya había otra foto de esta pared esperando a leerse, cuenta la última.
                porLeer.current = [...porLeer.current.filter((x) => x.pared !== item.pared),
                                   { pared: item.pared, driveId, aspecto: item.aspecto, local: item.url,
                                     idCola: item.id, id: `${item.id}-l` }];
                setNPorLeer(porLeer.current.length);
                ponTarea(item.pared, (t) => (t?.idCola === item.id ? { ...t, fase: 'por_leer', driveId } : t));
            } else {
                ponTarea(item.pared, (t) => (t?.idCola === item.id ? { ...t, fase: 'subida', driveId } : t));
            }
            return 'ok';
        } catch {
            onRed?.(false);
            ponTarea(item.pared, (t) => (t?.idCola === item.id ? { ...t, fase: 'en_cola' } : t));
            return 'parar';
        }
    }, [apiBase, token, onRed, onFotosCambian, ponTarea, ponCola]);

    const leerFoto = useCallback(async (x) => {
        // Lo leído se enseña en la pared SOLO si sigue siendo lo que se está
        // haciendo en ella (una foto más nueva manda sobre la anterior).
        const esSuya = (t) => !!t && (x.idCola ? t.idCola === x.idCola : t.driveId === x.driveId);
        ponTarea(x.pared, (t) => (esSuya(t) ? { ...t, fase: 'leyendo' } : t));
        try {
            const r = await pedir(`${apiBase}/${token}/fotos/leer`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pared: x.pared, drive_id: x.driveId, aspecto: x.aspecto, id_local: x.id }),
            }, { plazo: 90_000 });
            onRed?.(true);
            const l = await r.json().catch(() => ({}));
            if (r.status === 410) return 'parar';
            if (!r.ok) {
                ponTarea(x.pared, (t) => (esSuya(t)
                    ? { ...t, fase: 'error', texto: l.error || 'No se ha podido leer la foto.' } : t));
                return 'error';
            }
            onFotosCambian?.();
            const huecos = (l.huecos || []).map((h) => ({ ...h, uid: uidHueco() }));
            const yaHay = (paredesRef.current || []).find((p) => p.id === x.pared)?.huecos || 0;
            ponTarea(x.pared, (t) => (esSuya(t)
                ? { ...t, fase: 'propuesta', driveId: x.driveId, lectura: { ...l, huecos },
                    marcados: new Set(yaHay ? [] : huecos.map((h) => h.uid)), aviso: null }
                : t));
            return 'ok';
        } catch {
            onRed?.(false);
            ponTarea(x.pared, (t) => (esSuya(t) ? { ...t, fase: 'por_leer' } : t));
            return 'parar';
        }
    }, [apiBase, token, onRed, onFotosCambian, ponTarea]);

    const mandarPoner = useCallback(async (p) => {
        try {
            const r = await pedir(`${apiBase}/${token}/huecos`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pared: p.pared, drive_id: p.drive_id, reemplaza: p.reemplaza,
                                       huecos: p.huecos, id_local: p.id }),
            }, { plazo: 15_000 });
            onRed?.(true);
            const d = await r.json().catch(() => ({}));
            if (r.status === 410) return 'parar';
            // El ordenador aún pone los anteriores: se vuelve a intentar en un rato.
            if (r.status === 409) return 'esperar';
            ponPoner((l) => l.filter((x) => x.id !== p.id));
            if (!r.ok) {
                ponTarea(p.pared, (t) => (t?.idPoner === p.id
                    ? { ...t, fase: 'propuesta', aviso: d.error || 'No se ha podido mandar al ordenador.' } : t));
                return 'error';
            }
            ponTarea(p.pared, (t) => (t?.idPoner === p.id ? { ...t, fase: 'poniendo', n: d.n } : t));
            return 'ok';
        } catch {
            onRed?.(false);
            return 'parar';
        }
    }, [apiBase, token, onRed, ponPoner, ponTarea]);

    const procesar = useCallback(async () => {
        if (trabajando.current) { otraVez.current = true; return; }
        trabajando.current = true;
        try {
            do {
                otraVez.current = false;
                // 1 · Las FOTOS, lo primero: hasta que no están en Drive no están a salvo.
                for (const item of colaRef.current.filter((i) => !i.error)) {
                    if ((await subirItem(item)) === 'parar') return;
                }
                // 2 · Los huecos confirmados sin cobertura.
                for (const p of [...ponerRef.current]) {
                    const r = await mandarPoner(p);
                    if (r === 'parar') return;
                    if (r === 'esperar') break;
                }
                // 3 · Contar las ventanas de lo que se ha subido.
                while (porLeer.current.length) {
                    const x = porLeer.current[0];
                    if ((await leerFoto(x)) === 'parar') return;
                    porLeer.current = porLeer.current.filter((y) => y !== x);
                    setNPorLeer(porLeer.current.length);
                }
            } while (otraVez.current);
        } finally {
            trabajando.current = false;
        }
    }, [subirItem, mandarPoner, leerFoto]);
    useEffect(() => { procesarRef.current = procesar; }, [procesar]);

    // Vuelve la red: se manda lo que haya.
    useEffect(() => { if (pulso) procesar(); }, [pulso, procesar]);
    // Con red y algo que el servidor aún no ha aceptado, se reintenta cada poco.
    const hayPendiente = cola.some((i) => !i.error) || ponerCola.length > 0 || nPorLeer > 0;
    useEffect(() => {
        if (sinRed || !hayPendiente) return undefined;
        const t = setInterval(() => procesar(), REINTENTO_MS);
        return () => clearInterval(t);
    }, [sinRed, hayPendiente, procesar]);

    // Lo que queda por mandar, y cómo está cada pared (para el plano).
    useEffect(() => {
        onPendientes?.({ fotos: cola.filter((i) => !i.error).length, huecos: ponerCola.length, lecturas: nPorLeer,
                         errores: cola.filter((i) => i.error).length });
        const mapa = {};
        for (const [id, t] of Object.entries(tareas)) {
            if (t?.fase === 'propuesta') mapa[id] = 'revisar';
            else if (FASES_PENDIENTES.has(t?.fase)) mapa[id] = 'cola';
        }
        for (const i of cola) mapa[i.pared] = i.error ? 'error' : (mapa[i.pared] === 'revisar' ? 'revisar' : 'cola');
        onEstadoParedes?.(mapa);
    }, [cola, ponerCola, nPorLeer, tareas, onPendientes, onEstadoParedes]);

    // ── Lo que hace el técnico ────────────────────────────────────────────────
    const fachadas = (paredes || []).filter((p) => p.admite);
    const enColaDe = (id) => cola.filter((i) => i.pared === id);
    const conFoto = (id) => (fotosPorPared?.[id] || []).some((f) => !f.roto) || enColaDe(id).some((i) => !i.error);
    const pared = selId ? (paredes || []).find((p) => p.id === selId) : null;
    const tarea = pared ? tareas[pared.id] : null;

    // Lo que ha contestado el ordenador a lo que se le mandó poner. Se DERIVA
    // aquí en vez de copiarlo al estado: es la respuesta a ESTE pedido (`n`).
    const hecho = tarea?.fase === 'poniendo' && resultadoHuecos && resultadoHuecos.n === tarea.n
        ? resultadoHuecos : null;
    const fase = hecho ? (hecho.ok ? 'puesto' : 'error') : tarea?.fase;
    const siguiente = fachadas.find((p) => p.id !== selId && !conFoto(p.id));
    const porRevisar = fachadas.filter((p) => tareas[p.id]?.fase === 'propuesta');

    async function hacerFoto(file) {
        if (!file || !pared) return;
        const id = pared.id;
        const local = URL.createObjectURL(file);
        ponTarea(id, { fase: 'preparando', local });
        const { file: f, aspecto } = await prepararFoto(file);
        const item = { id: nuevoIdLocal('fo'), clave, pared: id, paredNombre: pared.nombre || id,
                       blob: f, nombre: f.name || 'foto.jpg', aspecto, leer: pared.admite !== false, at: Date.now() };
        // En el teléfono ANTES de mandarla: si se corta a mitad, no se pierde.
        await encolarFoto(item);
        ponCola((c) => [...c, { ...item, url: local }]);
        ponTarea(id, { fase: 'en_cola', local, idCola: item.id });
        procesar();
    }

    function leerExistente(f) {
        const url = `${apiBase}/${token}/fotos/${f.drive_id}`;
        ponTarea(pared.id, { fase: 'leyendo', driveId: f.drive_id, local: url });
        aspectoDeUrl(url).then((aspecto) => {
            porLeer.current = [...porLeer.current.filter((x) => x.pared !== pared.id),
                               { pared: pared.id, driveId: f.drive_id, aspecto, local: url, idCola: null,
                                 id: nuevoIdLocal('le') }];
            setNPorLeer(porLeer.current.length);
            ponTarea(pared.id, (t) => (t?.driveId === f.drive_id ? { ...t, fase: 'por_leer' } : t));
            procesar();
        });
    }

    function poner(reemplaza) {
        const t = tareas[pared.id];
        const l = t.lectura;
        const elegidos = reemplaza ? l.huecos : l.huecos.filter((h) => t.marcados.has(h.uid));
        if (!elegidos.length) return;
        // Apuntado ANTES de mandarlo, y con su id: sin señal sale al volver, y un
        // reenvío de algo que sí llegó no pone los huecos dos veces.
        const pet = { id: t.idPoner || nuevoIdLocal('hu'), pared: pared.id, drive_id: t.driveId,
                      reemplaza: !!reemplaza, huecos: elegidos };
        ponPoner((lista) => [...lista.filter((x) => x.id !== pet.id), pet]);
        ponTarea(pared.id, { ...t, fase: 'poner_en_cola', idPoner: pet.id, cuantos: elegidos.length, aviso: null });
        procesar();
    }

    async function descartarItem(item) {
        await quitarDeCola(item.id);
        ponCola((c) => c.filter((i) => i.id !== item.id));
        ponTarea(item.pared, (t) => (t?.idCola === item.id ? null : t));
    }
    async function reintentarItem(item) {
        await cambiarEnCola(item.id, { error: null });
        ponCola((c) => c.map((i) => (i.id === item.id ? { ...i, error: null } : i)));
        ponTarea(item.pared, { fase: 'en_cola', local: item.url, idCola: item.id });
        procesar();
    }

    const alterna = (uid) => ponTarea(pared.id, (t) => {
        const n = new Set(t.marcados);
        if (n.has(uid)) n.delete(uid); else n.add(uid);
        return { ...t, marcados: n };
    });

    const entradas = (
        <>
            <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden"
                   onChange={(e) => { hacerFoto(e.target.files?.[0]); e.target.value = ''; }} />
            <input ref={galeria} type="file" accept="image/*" className="hidden"
                   onChange={(e) => { hacerFoto(e.target.files?.[0]); e.target.value = ''; }} />
        </>
    );

    const nCola = cola.filter((i) => !i.error).length;

    // ── Sin pared elegida: qué fachadas tienen ya su foto ────────────────────
    if (!pared) {
        return (
            <div className="space-y-2">
                <p className="px-1 text-[12.5px] leading-snug text-white/75">
                    <strong className="text-white">Toca una pared</strong> en el plano para hacerle la foto.
                    En las fachadas se cuentan solas sus ventanas y puertas.
                </p>
                {nCola > 0 && (
                    <p className="rounded-lg border border-amber-400/35 bg-amber-400/10 px-3 py-2 text-[12px]
                                  leading-snug text-amber-100">
                        {nCola === 1 ? '1 foto guardada' : `${nCola} fotos guardadas`} en el teléfono
                        {sinRed ? ': se enviarán solas en cuanto haya cobertura.' : ': enviándolas…'}
                    </p>
                )}
                {porRevisar.length > 0 && (
                    <div className="rounded-lg border border-violet-400/35 bg-violet-400/10 px-3 py-2">
                        <p className="text-[12px] font-bold text-violet-100">Ventanas por revisar</p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {porRevisar.map((p) => (
                                <button key={p.id} onClick={() => onElegir(p.id)}
                                        className="min-h-[36px] rounded-lg border border-violet-300/50 bg-violet-500/20
                                                   px-2.5 text-[12px] font-bold text-white">
                                    {p.nombre || p.id} →
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                {!!fachadas.length && (
                    <>
                        <p className="px-1 text-[11.5px] text-white/70">
                            Fachadas con foto: <b className="text-white">{fachadas.filter((p) => conFoto(p.id)).length}</b>
                            {' '}de {fachadas.length}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                            {fachadas.map((p) => {
                                const pendiente = enColaDe(p.id).some((i) => !i.error);
                                return (
                                    <button key={p.id} onClick={() => onElegir(p.id)}
                                            className={`flex min-h-[40px] items-center gap-1.5 rounded-lg border px-2.5
                                                        text-[12px] font-bold
                                                ${pendiente ? 'border-amber-400/45 bg-amber-400/10 text-amber-100'
                                                    : conFoto(p.id) ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                                                        : 'border-white/15 bg-white/[0.04] text-white/80'}`}>
                                        {pendiente ? <span aria-hidden>↑</span>
                                            : conFoto(p.id) ? <span aria-hidden>✓</span> : <IconoCamara size={13} />}
                                        <span>{p.nombre || p.id}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        );
    }

    const fotos = (fotosPorPared?.[pared.id] || []).filter((f) => !f.roto);
    const enCola = enColaDe(pared.id);
    const errores = enCola.filter((i) => i.error);
    const ocupado = ['preparando', 'leyendo'].includes(fase);
    const revisando = fase === 'propuesta';

    return (
        <div className="space-y-2">
            {entradas}
            <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-black">{pared.nombre || pared.id}</p>
                    <p className="text-[11.5px] text-white/70">
                        {etiquetaTipo(pared)}{pared.largo ? ` · ${fmt1(pared.largo)} m` : ''}
                        {pared.admite && ` · ${pared.huecos || 0} ${pared.huecos === 1 ? 'hueco' : 'huecos'} en el plano`}
                    </p>
                </div>
                <button onClick={() => {
                            // Lo ya terminado no se queda esperando a que se vuelva a la pared.
                            if (['subida', 'error', 'puesto'].includes(fase)) ponTarea(pared.id, null);
                            onElegir(null);
                        }}
                        aria-label="Dejar de mirar esta pared"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border
                                   border-white/15 text-white/70">✕</button>
            </div>

            {!pared.admite && (
                <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-white/70">
                    No es una fachada: su foto sirve de prueba de lo que hay al otro lado, pero aquí no
                    se cuentan ventanas.
                </p>
            )}

            {/* Las fotos que ya tiene, y las que esperan en el teléfono. Tocar una
                ya subida la vuelve a leer. */}
            {!!(fotos.length || enCola.length) && !revisando && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {enCola.map((i) => (
                        <div key={i.id} className={`relative h-16 shrink-0 overflow-hidden rounded-lg border
                                                     ${i.error ? 'border-rose-400/70' : 'border-amber-400/60'}`}>
                            {i.url && <img src={i.url} alt="" className="h-16 w-auto object-cover" />}
                            <span className={`absolute inset-x-0 bottom-0 px-1 text-center text-[9.5px] font-bold text-white
                                              ${i.error ? 'bg-rose-700/85' : 'bg-amber-700/85'}`}>
                                {i.error ? 'no se ha subido' : 'sin enviar'}
                            </span>
                        </div>
                    ))}
                    {fotos.map((f) => (
                        <button key={f.drive_id} disabled={!pared.admite || ocupado}
                                onClick={() => leerExistente(f)}
                                title={pared.admite ? 'Contar las ventanas de esta foto' : f.nombre}
                                className="relative h-16 shrink-0 overflow-hidden rounded-lg border border-white/15
                                           disabled:opacity-100">
                            <img src={`${apiBase}/${token}/fotos/${f.drive_id}`} alt="" loading="lazy"
                                 className="h-16 w-auto object-cover" />
                            {f.lectura && (
                                <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 text-center text-[9.5px]
                                                 font-bold text-white">
                                    {f.lectura.ventanas ?? 0}v · {f.lectura.puertas ?? 0}p
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            )}

            {/* Una foto que el servidor NO ha aceptado: no se pierde. */}
            {errores.map((i) => (
                <div key={i.id} className="space-y-2 rounded-lg border border-rose-400/40 bg-rose-400/10 px-3 py-2">
                    <p className="text-[12.5px] text-rose-100">{i.error}</p>
                    <div className="flex flex-wrap gap-1.5">
                        <button onClick={() => reintentarItem(i)}
                                className="min-h-[40px] rounded-lg border border-white/20 bg-white/[0.06] px-3 text-[12px]
                                           font-bold text-white">Reintentar</button>
                        {i.url && (
                            <a href={i.url} download={i.nombre || 'foto.jpg'}
                               className="flex min-h-[40px] items-center rounded-lg border border-white/20 bg-white/[0.06]
                                          px-3 text-[12px] font-bold text-white">Guardar en el teléfono</a>
                        )}
                        <button onClick={() => descartarItem(i)}
                                className="min-h-[40px] rounded-lg px-3 text-[12px] font-bold text-white/70">Descartar</button>
                    </div>
                </div>
            ))}

            {fase === 'preparando' && <Espera local={tarea.local} texto="Preparando la foto…" />}
            {fase === 'en_cola' && (sinRed
                ? <EnElTelefono local={tarea.local}
                                texto={pared.admite
                                    ? 'Guardada en el teléfono. Se enviará sola en cuanto haya cobertura, y entonces se contarán sus ventanas.'
                                    : 'Guardada en el teléfono. Se enviará sola en cuanto haya cobertura.'} />
                : <Espera local={tarea.local} texto="Enviando la foto…" />)}
            {fase === 'subiendo' && <Espera local={tarea.local} texto="Subiendo la foto…" />}
            {fase === 'por_leer' && (sinRed
                ? <EnElTelefono local={tarea.local} texto="Foto subida. Se contarán sus ventanas en cuanto vuelva la cobertura." />
                : <Espera local={tarea.local} texto="Contando ventanas y puertas…" sub="Tarda unos 15 segundos." />)}
            {fase === 'leyendo' && (
                <Espera local={tarea.local} texto="Contando ventanas y puertas…" sub="Tarda unos 15 segundos." />
            )}
            {fase === 'subida' && (
                <p className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-[12.5px]
                              font-bold text-emerald-200">
                    ✓ Foto pegada a {pared.nombre || pared.id}.
                </p>
            )}
            {fase === 'error' && (
                <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[12.5px] text-amber-100">
                    {(hecho?.texto) || tarea?.texto || 'Algo no ha salido.'}
                </p>
            )}

            {revisando && (
                <Propuesta tarea={tarea} yaHay={pared.huecos || 0} nombre={pared.nombre || pared.id}
                           onAlterna={alterna} onPoner={poner} onDescartar={() => ponTarea(pared.id, null)} />
            )}

            {fase === 'poner_en_cola' && (sinRed
                ? <EnElTelefono texto={`Sin cobertura: ${tarea.cuantos === 1 ? 'el hueco se mandará' : `los ${tarea.cuantos} huecos se mandarán`} al ordenador en cuanto vuelva la señal.`} />
                : <Espera texto="Mandándolos al ordenador…" />)}
            {fase === 'poniendo' && (
                <Espera texto="El ordenador los está poniendo en el plano…"
                        sub={sinOrdenador ? 'El ordenador no está recogiendo: se pondrán en cuanto se abra allí la ventana.'
                                          : null} />
            )}
            {fase === 'puesto' && (
                <div className="space-y-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2">
                    <p className="text-[13px] font-bold text-emerald-200">✓ {hecho?.texto}</p>
                    {siguiente && (
                        <button onClick={() => { ponTarea(pared.id, null); onElegir(siguiente.id); }}
                                className="min-h-[44px] w-full rounded-lg border border-white/20 bg-white/[0.06]
                                           text-[13px] font-bold text-white">
                            Siguiente fachada sin foto: {siguiente.nombre || siguiente.id} →
                        </button>
                    )}
                </div>
            )}

            {/* Hacer la foto: lo primero que se busca con la pared elegida. Sin
                cobertura se pueden seguir haciendo: se guardan en el teléfono. */}
            {!revisando && fase !== 'leyendo' && (
                <div className="flex gap-2">
                    <button onClick={() => camara.current?.click()} disabled={ocupado}
                            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-600
                                       text-[15px] font-black text-white shadow-lg shadow-violet-950/40
                                       active:bg-violet-700 disabled:opacity-40">
                        <IconoCamara size={18} /> {fotos.length || enCola.length ? 'Hacer otra foto' : 'Hacer la foto'}
                    </button>
                    <button onClick={() => galeria.current?.click()} disabled={ocupado}
                            aria-label="Elegir una foto de la galería"
                            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border
                                       border-white/15 bg-white/[0.05] text-white/80 disabled:opacity-40">
                        <IconoImagen size={20} />
                    </button>
                </div>
            )}
        </div>
    );
}

/** Lo leído, sobre la propia foto: cada hueco señalado y numerado. */
function Propuesta({ tarea, yaHay, nombre, onAlterna, onPoner, onDescartar }) {
    const l = tarea.lectura;
    const elegidos = l.huecos.filter((h) => tarea.marcados.has(h.uid));
    return (
        <div className="space-y-2">
            <p className="text-[14px] font-black">
                {l.ventanas} {l.ventanas === 1 ? 'ventana' : 'ventanas'} y {l.puertas}{' '}
                {l.puertas === 1 ? 'puerta' : 'puertas'}
            </p>
            {tarea.local && (
                <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black">
                    <img src={tarea.local} alt="" className="block w-full" />
                    {l.huecos.map((h, k) => h.box && (
                        <button key={h.uid} onClick={() => onAlterna(h.uid)}
                                aria-label={`${h.tipo} ${k + 1}`}
                                style={{ left: `${h.box.x * 100}%`, top: `${h.box.y * 100}%`,
                                         width: `${h.box.ancho * 100}%`, height: `${h.box.alto * 100}%`,
                                         borderColor: COLOR[h.tipo] || COLOR.ventana,
                                         opacity: tarea.marcados.has(h.uid) ? 1 : 0.5 }}
                                className={`absolute rounded-sm border-2
                                            ${tarea.marcados.has(h.uid) ? '' : 'border-dashed'}`}>
                            <span style={{ background: COLOR[h.tipo] || COLOR.ventana }}
                                  className="absolute -left-0.5 -top-0.5 rounded-br px-1 text-[10px] font-black text-white">
                                {k + 1}
                            </span>
                        </button>
                    ))}
                </div>
            )}
            {!l.huecos.length && (
                <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/70">
                    No se ha visto ningún hueco en esta foto.
                </p>
            )}
            {yaHay > 0 && !!l.huecos.length && (
                <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-100">
                    {nombre} ya tiene <b>{yaHay}</b> {yaHay === 1 ? 'hueco' : 'huecos'} en el plano. Lo que marques
                    se <b>añade</b> a los que hay.
                </p>
            )}
            <ul className="space-y-1.5">
                {l.huecos.map((h, k) => (
                    <li key={h.uid}>
                        <label className={`flex min-h-[48px] items-center gap-3 rounded-lg border px-3 py-2
                            ${tarea.marcados.has(h.uid) ? 'border-violet-400/50 bg-violet-400/10' : 'border-white/10 bg-white/[0.03]'}`}>
                            <input type="checkbox" checked={tarea.marcados.has(h.uid)}
                                   onChange={() => onAlterna(h.uid)} className="h-5 w-5 accent-violet-500" />
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-black text-white"
                                  style={{ background: COLOR[h.tipo] || COLOR.ventana }}>{k + 1}</span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-[13px] font-bold capitalize">
                                    {h.tipo}
                                    {h.ancho && h.alto
                                        ? <span className="ml-1.5 font-normal tabular-nums text-white/80">{fmt(h.ancho)} × {fmt(h.alto)} m</span>
                                        : <span className="ml-1.5 text-[11px] font-normal text-white/60">sin medida (la de por defecto)</span>}
                                </span>
                                {h.descripcion && <span className="block text-[11px] leading-snug text-white/60">{h.descripcion}</span>}
                            </span>
                        </label>
                    </li>
                ))}
            </ul>
            {l.huecos.some((h) => h.ancho && h.alto) && (
                <p className="text-[11px] leading-snug text-white/60">
                    Las medidas son <b>estimadas</b> de la foto: entran en ámbar y hay que confirmarlas.
                </p>
            )}
            {(l.avisos || []).map((a, i) => (
                <p key={i} className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11.5px] text-amber-100">
                    {a}
                </p>
            ))}
            {tarea.aviso && <p className="text-[12px] text-amber-200">{tarea.aviso}</p>}
            <div className="flex flex-col gap-2">
                <button onClick={() => onPoner(false)} disabled={!elegidos.length}
                        className="h-12 rounded-xl bg-violet-600 text-[15px] font-black text-white shadow-lg
                                   shadow-violet-950/40 active:bg-violet-700 disabled:opacity-40">
                    {elegidos.length ? `Poner ${elegidos.length} en el plano` : 'Marca lo que quieras poner'}
                </button>
                {yaHay > 0 && !!l.huecos.length && (
                    <button onClick={() => onPoner(true)}
                            className="min-h-[44px] rounded-xl border border-white/15 bg-white/[0.04] text-[13px]
                                       font-bold text-white/85">
                        Quitar los {yaHay} y poner estos {l.huecos.length}
                    </button>
                )}
                <button onClick={onDescartar} className="min-h-[40px] text-[12.5px] font-bold text-white/60">
                    Descartar lo leído
                </button>
            </div>
        </div>
    );
}

function Espera({ texto, sub = null, local = null }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-2.5">
            {local
                ? <img src={local} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                : null}
            <svg className="h-6 w-6 shrink-0 animate-spin text-violet-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <div className="min-w-0">
                <p className="text-[13px] font-bold text-white">{texto}</p>
                {sub && <p className="text-[11.5px] leading-snug text-white/70">{sub}</p>}
            </div>
        </div>
    );
}

/** Lo que está a salvo en el teléfono esperando cobertura: sin ruedita, que no está trabajando. */
function EnElTelefono({ texto, local = null }) {
    return (
        <div className="flex items-center gap-3 rounded-lg border border-amber-400/35 bg-amber-400/10 p-2.5">
            {local && <img src={local} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />}
            <p className="min-w-0 text-[12.5px] leading-snug text-amber-100">{texto}</p>
        </div>
    );
}

function etiquetaTipo(p) {
    const t = String(p?.tipo || '').toUpperCase();
    if (t.includes('MEDIANERA')) return 'Medianera';
    if (t.includes('PARTICION')) return 'Partición';
    if (t.includes('FACHADA')) return 'Fachada';
    return 'Pared';
}

export default FotosParedMovil;
