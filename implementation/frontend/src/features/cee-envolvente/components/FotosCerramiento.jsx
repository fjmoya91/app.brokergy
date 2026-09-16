import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { VisorCerramiento } from './VisorCerramiento';

// ─────────────────────────────────────────────────────────────────────────────
// La FOTO REAL de un cerramiento, pegada a su pared (o a uno de sus huecos).
//
// El plano dice que FBS3 da a la calle y mide 10,94 m. No dice cuántas ventanas
// tiene, ni de qué son. Eso se mira en una foto — y la foto casi siempre ya está
// en el expediente, porque el cliente subió «tu casa vista desde la calle» al
// hacer la simulación.
//
// REGLA — primero lo que YA HAY, y después subir. El botón abre la lista de
// fotos del expediente ANTES que el selector de ficheros: volver a pedirle al
// cliente una foto que mandó en junio es la peor forma de estrenar esto, y
// además la suya es la buena — es de antes de la obra.
//
// REGLA — la foto vale AUNQUE NO SE LEA. Que FBS3 tenga la suya es la prueba de
// por qué ese cerramiento se clasificó como fachada y por qué tiene dos
// ventanas. Leerla es lo segundo; tenerla, lo primero.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/cee-envolvente';

//: Los bytes ya bajados, por id de Drive. Un `<img src>` no puede llevar la
//: cabecera de sesión, así que la foto se pide con axios y se pinta desde un
//: blob; sin caché, volver a pulsar una pared la bajaría otra vez. El id de
//: Drive es único, así que la caché vale para todo el expediente.
const _blobs = new Map();

function useFoto(expedienteId, driveId) {
    const [url, setUrl] = useState(() => _blobs.get(driveId) || null);
    useEffect(() => {
        if (!driveId || !expedienteId) return undefined;
        if (_blobs.has(driveId)) { setUrl(_blobs.get(driveId)); return undefined; }
        let vivo = true;
        axios.get(`${API}/${expedienteId}/fotos/${driveId}/contenido`, { responseType: 'blob' })
            .then(({ data }) => {
                const u = URL.createObjectURL(data);
                _blobs.set(driveId, u);
                if (vivo) setUrl(u);
            })
            .catch(() => { if (vivo) setUrl(null); });
        return () => { vivo = false; };
    }, [expedienteId, driveId]);
    return url;
}

function Miniatura({ expedienteId, driveId, alto = 'h-16', onClick, titulo }) {
    const url = useFoto(expedienteId, driveId);
    return (
        <button type="button" onClick={onClick} title={titulo}
                className={`${alto} w-auto shrink-0 overflow-hidden rounded-md border
                            border-white/10 bg-white/[0.04] transition hover:border-brand`}>
            {url
                ? <img src={url} alt={titulo || ''} className={`${alto} w-auto object-cover`} />
                : <span className="flex h-full w-16 items-center justify-center text-[10px]
                                   text-white/30">…</span>}
        </button>
    );
}

export function FotosCerramiento({
    expedienteId, clave, titulo, ambito = 'pared', contexto = {}, onLeido, compacto = false,
    // El MURO entero, para que al abrir una foto se vea a la vez lo que el plano
    // declara en esa pared. Sin él el visor sigue siendo un lightbox.
    muro, nombreDe, hueco,
}) {
    const [fotos, setFotos] = useState([]);
    const [cands, setCands] = useState([]);
    const [aviso, setAviso] = useState(null);
    const [abierto, setAbierto] = useState(false);     // el selector de «añadir»
    const [ocupado, setOcupado] = useState(null);      // 'cargando' | 'subiendo' | 'leyendo'
    const [error, setError] = useState(null);
    const [visor, setVisor] = useState(null);
    const input = useRef(null);

    const refrescar = useCallback(async () => {
        if (!expedienteId) return;
        setOcupado('cargando');
        try {
            const { data } = await axios.get(`${API}/${expedienteId}/fotos`);
            setFotos(data.fotos?.[clave] || []);
            setCands(data.candidatas || []);
            setAviso(data.aviso || null);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally { setOcupado(null); }
    }, [expedienteId, clave]);

    useEffect(() => { refrescar(); }, [refrescar]);

    async function subir(ficheros) {
        const lista = Array.from(ficheros || []).filter(f => f.type?.startsWith('image/'));
        if (!lista.length) return;
        setOcupado('subiendo'); setError(null);
        try {
            const fd = new FormData();
            for (const f of lista) fd.append('files', f);
            await axios.post(`${API}/${expedienteId}/fotos?clave=${encodeURIComponent(clave)}`, fd);
            setAbierto(false);
            await refrescar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido subir la foto.');
        } finally { setOcupado(null); }
    }

    async function adoptar(driveId) {
        setOcupado('subiendo'); setError(null);
        try {
            await axios.post(`${API}/${expedienteId}/fotos/adoptar`, { clave, drive_id: driveId });
            setAbierto(false);
            await refrescar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido usar esa foto.');
        } finally { setOcupado(null); }
    }

    async function quitar(driveId) {
        setError(null);
        try {
            await axios.delete(`${API}/${expedienteId}/fotos`, {
                params: { clave, drive_id: driveId },
            });
            await refrescar();
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido quitar la foto.');
        }
    }

    /**
     * Manda a leer las fotos de este cerramiento.
     *
     * Va la RELACIÓN DE ASPECTO de la primera foto, y no es un detalle: con ella
     * el backend puede cruzar las dos referencias de escala —el ancho de la pared
     * y la puerta de entrada— y avisar cuando no dicen lo mismo. Sin ella, una
     * foto muy escorzada daría medidas tranquilas.
     */
    async function leer() {
        if (!fotos.length) return;
        setOcupado('leyendo'); setError(null);
        try {
            const aspecto = await aspectoDe(expedienteId, fotos[0].drive_id);
            const ids = fotos.filter(f => !f.roto).map(f => f.drive_id);
            const { data } = await axios.post(`${API}/${expedienteId}/fotos/leer`, {
                clave, drive_ids: ids, ambito, aspecto,
                ...(ambito === 'hueco' ? { hueco: contexto } : { pared: contexto }),
            });
            // Con QUÉ foto se ha leído: las cajas que devuelve son de ESA imagen,
            // así que sin su id no se pueden pegar a ninguna parte. Es la primera
            // —la misma cuyo aspecto puso la escala—, no todas.
            onLeido?.(data, ids[0] || null);
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido leer la foto.');
        } finally { setOcupado(null); }
    }

    const vivas = fotos.filter(f => !f.roto);
    const rotas = fotos.filter(f => f.roto);

    return (
        <div className={compacto ? 'mt-2' : 'mt-3 border-t border-white/5 pt-3'}
             onDragOver={e => { e.preventDefault(); }}
             onDrop={e => { e.preventDefault(); subir(e.dataTransfer?.files); }}>
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-white/35">
                    {titulo || 'Foto real'}
                </span>
                {!!vivas.length && (
                    <span className="text-[11px] text-white/35">
                        {vivas.length} {vivas.length === 1 ? 'foto' : 'fotos'}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                    <button type="button" onClick={() => setAbierto(v => !v)}
                            disabled={ocupado === 'subiendo'}
                            className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1
                                       text-[11px] font-bold hover:border-white/25 disabled:opacity-40">
                        {ocupado === 'subiendo' ? 'Subiendo…' : '+ Añadir'}
                    </button>
                    {!!vivas.length && (
                        <button type="button" onClick={leer} disabled={!!ocupado}
                                title={ambito === 'hueco'
                                    ? 'Lee de la foto qué carpintería y qué vidrio tiene'
                                    : 'Cuenta los huecos de esta fachada y estima sus medidas'}
                                className="rounded-md border border-brand/40 bg-brand/15 px-2 py-1
                                           text-[11px] font-bold text-brand hover:bg-brand/25
                                           disabled:opacity-40">
                            {ocupado === 'leyendo' ? 'Leyendo…' : '✨ Leer la foto'}
                        </button>
                    )}
                </div>
            </div>

            {!!vivas.length && (
                <div className="mt-2 flex flex-wrap gap-2">
                    {vivas.map(f => (
                        <div key={f.drive_id} className="group relative">
                            <Miniatura expedienteId={expedienteId} driveId={f.drive_id}
                                       titulo={f.rotulo || f.nombre}
                                       onClick={() => setVisor(f)} />
                            <button type="button" onClick={() => quitar(f.drive_id)}
                                    title={f.origen === 'subida'
                                        ? 'Quitarla de aquí y borrarla'
                                        : 'Despegarla de esta pared (no se borra del expediente)'}
                                    className="absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center
                                               justify-center rounded-full border border-white/20
                                               bg-black text-[11px] text-white/70 group-hover:flex
                                               hover:text-red-400">
                                ✕
                            </button>
                            {f.lectura && (
                                <span title={`Leída el ${new Date(f.lectura.at).toLocaleDateString('es-ES')}`}
                                      className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1
                                                 text-[9px] font-bold text-brand">
                                    ✨
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!vivas.length && !ocupado && (
                <p className="mt-1.5 text-[11px] leading-snug text-white/35">
                    {ambito === 'hueco'
                        ? 'Una foto de esta ventana dice de qué es la carpintería y si lleva vidrio doble.'
                        : 'Con una foto de esta fachada se cuentan sus huecos y se ve por qué da a donde da.'}
                    <span className="hidden md:inline"> Puedes arrastrarla aquí.</span>
                </p>
            )}

            {/* Un enlace roto NO es una foto presente: si el original lo borró
                alguien desde el gestor de documentación, se dice — enseñar un
                hueco negro sería peor. */}
            {rotas.map(f => (
                <p key={f.drive_id} className="mt-1.5 text-[11px] text-amber-300/80">
                    ⚠ «{f.nombre}» ya no está en Drive.{' '}
                    <button onClick={() => quitar(f.drive_id)} className="underline">quitarla</button>
                </p>
            ))}

            {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}

            {abierto && (
                <Selector cands={cands} aviso={aviso} puestas={fotos}
                          expedienteId={expedienteId}
                          onAdoptar={adoptar}
                          onSubir={() => input.current?.click()}
                          onCerrar={() => setAbierto(false)} />
            )}

            <input ref={input} type="file" accept="image/*" multiple className="hidden"
                   onChange={e => { subir(e.target.files); e.target.value = ''; }} />

            {visor && (
                <VisorAbierto
                    expedienteId={expedienteId} clave={clave} foto={visor}
                    muro={muro} nombreDe={nombreDe} ambito={ambito} hueco={hueco}
                    onCerrar={() => setVisor(null)}
                    onGuardadas={refrescar} />
            )}
        </div>
    );
}

/**
 * De dónde sale la foto: del expediente o de aquí.
 *
 * Lo que YA HAY va primero y ocupa el sitio: es lo que se va a usar casi
 * siempre. «Subir otra» queda debajo, para cuando el certificador ha estado
 * delante del edificio y tiene la suya.
 */
function Selector({ cands, aviso, puestas, expedienteId, onAdoptar, onSubir, onCerrar }) {
    const yaEsta = new Set((puestas || []).map(f => f.drive_id));
    const libres = (cands || []).filter(f => !yaEsta.has(f.drive_id));
    return (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/40 p-2.5">
            <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-white/70">
                    Fotos que ya tiene el expediente
                </span>
                <button onClick={onCerrar}
                        className="ml-auto text-[11px] text-white/35 hover:text-white/70">cerrar</button>
            </div>

            {libres.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    {libres.map(f => (
                        <button key={f.drive_id} type="button" onClick={() => onAdoptar(f.drive_id)}
                                title={f.nombre}
                                className="w-[92px] overflow-hidden rounded-md border border-white/10
                                           bg-white/[0.03] text-left transition hover:border-brand">
                            <Miniatura expedienteId={expedienteId} driveId={f.drive_id}
                                       alto="h-[62px]" titulo={f.nombre} />
                            <span className="block truncate px-1.5 py-1 text-[9px] leading-tight
                                             text-white/45">{f.rotulo}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="mt-1.5 text-[11px] text-white/35">
                    {aviso || (cands?.length
                        ? 'Todas las que hay ya están puestas en este cerramiento.'
                        : 'No hay ninguna foto de la envolvente en el expediente.')}
                </p>
            )}

            <button type="button" onClick={onSubir}
                    className="mt-2.5 w-full rounded-md border border-white/10 bg-white/[0.04]
                               px-2 py-1.5 text-[11px] font-bold hover:border-white/25">
                📷 Subir una foto mía
            </button>
        </div>
    );
}

/**
 * La foto abierta: baja los bytes y guarda las marcas.
 *
 * El dibujo y la interacción viven en `VisorCerramiento`; aquí queda lo que toca
 * la red, para que el visor se pueda montar en un banco de pruebas con una URL y
 * un array y sin backend detrás.
 *
 * Las marcas se escriben **al momento**, no al cerrar: quien señala tres
 * ventanas y cierra la pestaña no puede perderlas, y no hay ningún botón de
 * guardar que le diga que hacía falta.
 */
function VisorAbierto({ expedienteId, clave, foto, muro, nombreDe, ambito, hueco,
                        onCerrar, onGuardadas }) {
    const url = useFoto(expedienteId, foto.drive_id);
    const [marcas, setMarcas] = useState(() => foto.marcas || []);

    async function guardar(nuevas) {
        const antes = marcas;
        setMarcas(nuevas);                 // la marca aparece al soltar el ratón
        try {
            await axios.put(`${API}/${expedienteId}/fotos/marcas`, {
                clave, drive_id: foto.drive_id, marcas: nuevas,
            });
            onGuardadas?.();
        } catch {
            // Si no se pudo escribir, la marca NO puede quedarse pintada: al
            // volver a abrir la foto no estaría, y entre las dos veces alguien
            // habrá dado por señalado un hueco que no lo está.
            setMarcas(antes);
        }
    }

    return (
        <VisorCerramiento
            url={url} nombre={foto.nombre}
            muro={muro} nombreDe={nombreDe} ambito={ambito} hueco={hueco}
            marcas={marcas} onMarcas={guardar} onCerrar={onCerrar} />
    );
}

/**
 * La relación ancho/alto de una foto, en píxeles.
 *
 * Hace falta para poder contrastar una escala horizontal con una vertical. Se
 * mide en el navegador, que ya tiene el blob: pedírsela al backend obligaría a
 * meter una librería de imagen en el contenedor para leer dos números.
 */
async function aspectoDe(expedienteId, driveId) {
    try {
        const url = _blobs.get(driveId)
            || URL.createObjectURL((await axios.get(
                `${API}/${expedienteId}/fotos/${driveId}/contenido`, { responseType: 'blob' })).data);
        if (!_blobs.has(driveId)) _blobs.set(driveId, url);
        return await new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalHeight ? img.naturalWidth / img.naturalHeight : null);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    } catch { return null; }
}

export default FotosCerramiento;
