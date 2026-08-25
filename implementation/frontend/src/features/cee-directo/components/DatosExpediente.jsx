import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { PrescriptorPicker } from '../../../components/PrescriptorPicker';
import { parseCatastroAddressFull } from '../../../utils/direccionCatastral';
import { ClientePicker } from './ClientePicker';
// Cascada CCAA -> Provincia -> Municipio: la MISMA que la ficha de cliente. Con
// dos copias, la direccion del cliente y la del inmueble se normalizarian
// distinto y dejarian de casar.
import { DireccionEdit } from '../../../components/DireccionEdit';

// ─────────────────────────────────────────────────────────────────────────────
// Datos del expediente: cliente, inmueble y quién lo trae.
//
// AUTOGUARDADO, como el resto de la app (modelo C): se escribe y se guarda solo.
// No hay botón de Guardar ni modo edición — con uno se olvida pulsarlo y lo
// escrito se pierde al cambiar de pestaña.
//
// El freno de 900 ms no es decoración: cambiar el nombre RENOMBRA la carpeta de
// Drive, y guardar a cada tecla dispararía una llamada a Google por letra
// —"A", "AT", "ATE"…— y dejaría la carpeta con un nombre a medias si te vas.
// Con el freno se guarda una vez, cuando dejas de escribir.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/cee-directos';
const FRENO_MS = 900;

const inputCls = "w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 transition-colors";

const Campo = ({ etiqueta, children, pista }) => (
    <div>
        <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1">{etiqueta}</div>
        {children}
        {pista && <div className="text-[10px] text-white/25 mt-1">{pista}</div>}
    </div>
);

export function DatosExpediente({ expediente, prescriptores = [], onGuardado, puedeEditar = true, onAbrirCliente, sinMarco = false, onEstado }) {
    const [form, setForm] = useState({
        nombre: expediente.nombre || '',
        prescriptor_id: expediente.prescriptor_id || null,
        direccion: expediente.direccion || '',
        ccaa: expediente.ccaa || '',
        municipio: expediente.municipio || '',
        provincia: expediente.provincia || '',
        // No es columna: lo pide la cascada para saber que municipios cargar. El
        // backend lo descarta (no esta en CAMPOS_EDITABLES), asi que viaja de mas
        // pero no ensucia nada.
        provincia_cod: '',
        codigo_postal: expediente.codigo_postal || '',
        ref_catastral: expediente.ref_catastral || '',
        notas: expediente.notas || ''
    });
    // Municipio que el Catastro ha devuelto y que la cascada tiene que casar con
    // su lista oficial en cuanto cargue ("TOMELLOSO" -> "Tomelloso").
    const [pistaMunicipio, setPistaMunicipio] = useState(null);
    const [cliente, setCliente] = useState(expediente.cliente || null);
    const [estado, setEstado] = useState('guardado'); // 'guardado' | 'guardando' | 'error'
    const [error, setError] = useState(null);
    const [catastro, setCatastro] = useState({ cargando: false, msg: null, error: null });

    // El contenedor (el modal) pinta el estado en SU cabecera.
    useEffect(() => { avisarEstado.current?.(estado); }, [estado]);

    const timer = useRef(null);
    const cola = useRef(Promise.resolve());

    // ⚠️ EL GUARDIÁN DEL AUTOGUARDADO. Guarda lo ÚLTIMO que consta persistido, y
    // solo se escribe si el formulario DIFIERE de eso.
    //
    // No basta con un "¿es el primer render?": la primera versión lo hacía así y
    // al abrir el 2026CEE_54 se autoguardó sola y le BORRÓ el prescriptor. Dos
    // motivos, y los dos se arreglan comparando valores:
    //   · el efecto se re-lanza cuando cambia la identidad de `onGuardado` (el
    //     padre lo pasa como flecha en línea, o sea nuevo en cada render), así que
    //     la bandera de "ya monté" se saltaba en la segunda pasada;
    //   · y como al guardar se refresca el expediente, el padre re-renderiza y
    //     vuelve a cambiar `onGuardado`: bucle de guardados.
    const persistido = useRef(null);
    if (persistido.current === null) {
        persistido.current = JSON.stringify({
            nombre: expediente.nombre || '',
            prescriptor_id: expediente.prescriptor_id || null,
            direccion: expediente.direccion || '',
            ccaa: expediente.ccaa || '',
            municipio: expediente.municipio || '',
            provincia: expediente.provincia || '',
            provincia_cod: '',
            codigo_postal: expediente.codigo_postal || '',
            ref_catastral: expediente.ref_catastral || '',
            notas: expediente.notas || ''
        });
    }

    // `onGuardado` va por ref para que su identidad NO forme parte de las
    // dependencias del efecto: ahí estaba la mitad del bucle. `onEstado` igual.
    const avisar = useRef(onGuardado);
    avisar.current = onGuardado;
    const avisarEstado = useRef(onEstado);
    avisarEstado.current = onEstado;

    const guardar = useCallback((patch) => {
        setEstado('guardando');
        setError(null);
        // Los PUT se encadenan: dos cambios seguidos no pueden adelantarse el uno
        // al otro y dejar guardado el primero.
        cola.current = cola.current
            .then(() => axios.put(`${API}/${expediente.id}`, patch))
            .then(() => { setEstado('guardado'); avisar.current?.(); })
            .catch(err => {
                setEstado('error');
                setError(err.response?.data?.error || 'No se ha podido guardar.');
            });
        return cola.current;
    }, [expediente.id]);

    // Autoguardado con freno.
    useEffect(() => {
        if (!puedeEditar) return;
        // El nombre da nombre a la carpeta de Drive: vacío no se guarda nunca.
        if (!form.nombre.trim()) return;
        // Nada que hacer si es exactamente lo que ya consta guardado.
        if (JSON.stringify(form) === persistido.current) return;

        clearTimeout(timer.current);
        setEstado('guardando');
        timer.current = setTimeout(() => {
            const instantanea = JSON.stringify(form);
            guardar({
                ...form,
                nombre: form.nombre.trim(),
                direccion: form.direccion.trim() || null,
                municipio: form.municipio.trim() || null,
                provincia: form.provincia.trim() || null,
                ccaa: form.ccaa.trim() || null,
                codigo_postal: form.codigo_postal.trim() || null,
                ref_catastral: form.ref_catastral.trim().toUpperCase() || null,
                notas: form.notas.trim() || null
            }).then(() => { persistido.current = instantanea; });
        }, FRENO_MS);
        return () => clearTimeout(timer.current);
    }, [form, puedeEditar, guardar]);

    // El cliente no espera al freno: se elige de una lista, no se teclea, y ver
    // "guardando…" durante un segundo tras un clic deliberado sobra.
    const elegirCliente = (c) => {
        setCliente(c);
        guardar({ cliente_id: c?.id_cliente || null });
    };

    const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

    /**
     * Trae la dirección del Catastro a partir de la referencia catastral.
     *
     * Rellena y se aparta: todo queda EDITABLE. El Catastro escribe la vía como
     * la tiene registrada ("AV BARBER (DE) 26"), que muchas veces no es como se
     * escribe la dirección de verdad, y el piso y la puerta no los da nunca.
     */
    const traerDelCatastro = async () => {
        const rc = form.ref_catastral.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!/^[A-Z0-9]{14,20}$/.test(rc)) {
            setCatastro({ cargando: false, msg: null, error: 'La referencia catastral debe tener 14 o 20 caracteres.' });
            return;
        }
        setCatastro({ cargando: true, msg: null, error: null });
        try {
            const { data } = await axios.get('/api/catastro/search', { params: { q: rc } });
            const direccion = data?.data?.address;
            if (!direccion) throw new Error('El Catastro no ha devuelto dirección para esa referencia.');

            const trozos = parseCatastroAddressFull(direccion);
            if (!trozos) {
                // Sin código postal no se puede repartir con garantías: se vuelca la
                // cadena entera en la calle antes que inventarse el municipio.
                setForm(f => ({ ...f, direccion, ref_catastral: rc }));
                setCatastro({ cargando: false, error: null, msg: 'Traída sin desglosar: revisa municipio y provincia.' });
                return;
            }
            // Se rellena la cascada ENTERA: comunidad, provincia (con su codigo,
            // que es lo que carga la lista de municipios) y CP. El municipio no se
            // escribe a pelo: se deja como PISTA para que la cascada lo case con
            // su nombre oficial en cuanto cargue la lista.
            setForm(f => ({
                ...f,
                ref_catastral: rc,
                direccion: trozos.direccion || f.direccion,
                codigo_postal: trozos.codigo_postal || f.codigo_postal,
                ccaa: trozos.ccaa || f.ccaa,
                provincia: trozos.provincia || f.provincia,
                provincia_cod: trozos.provincia_cod || f.provincia_cod,
                municipio: ''
            }));
            setPistaMunicipio(trozos.municipioHint || null);
            const uso = data?.data?.use ? ` · ${data.data.use}` : '';
            setCatastro({ cargando: false, error: null, msg: `Traída del Catastro${uso}. Compruébala: la vía viene como la tiene registrada y el piso no lo da.` });
        } catch (err) {
            const d = err.response?.data;
            setCatastro({
                cargando: false, msg: null,
                error: d?.code === 'CATASTRO_RATE_LIMITED'
                    ? 'El Catastro está saturado ahora mismo. Inténtalo en unos minutos.'
                    : (d?.details || d?.error || err.message || 'No se ha podido consultar el Catastro.')
            });
        }
    };

    const carpetaSera = `${expediente.numero_expediente} - ${(form.nombre || '').trim() || '…'}`;
    const cambiaCarpeta = form.nombre.trim() && form.nombre.trim() !== expediente.nombre;

    // Dentro del modal el marco y el título los pone el modal: repetirlos aquí
    // sería una caja dentro de otra caja diciendo lo mismo. El ESTADO de guardado
    // sí sube (`onEstado`), porque sin botón de Guardar es la única señal de que
    // lo escrito ha llegado, y escondido no sirve de nada.
    const claseMarco = sinMarco ? '' : 'rounded-2xl border border-white/[0.06] bg-bkg-surface/40 p-5';

    return (
        <div className={claseMarco}>
            <div className={`flex items-center justify-between gap-3 mb-4 ${sinMarco ? 'hidden' : ''}`}>
                <h3 className="text-xs font-black text-white uppercase tracking-widest border-l-2 border-brand pl-4">
                    Datos del expediente
                </h3>
                {/* Sin botón de Guardar, este es el único aviso de que lo escrito ha
                    llegado. Sin él, el autoguardado no se distingue de no guardar. */}
                {puedeEditar && (
                    <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${
                        estado === 'error' ? 'text-red-400' : estado === 'guardando' ? 'text-white/35' : 'text-emerald-400/70'
                    }`}>
                        {estado === 'error' ? 'Sin guardar' : estado === 'guardando' ? 'Guardando…' : '✓ Guardado'}
                    </span>
                )}
            </div>

            {/* El CLIENTE va primero: es lo que recibe el certificador al encargarle
                el trabajo, y sin él no se le puede mandar nada. */}
            <div className="mb-5">
                <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-1.5">
                    Cliente {!cliente && <span className="text-amber-400">· sin asignar</span>}
                </div>
                {puedeEditar ? (
                    <ClientePicker cliente={cliente} onChange={elegirCliente} onEditar={onAbrirCliente} />
                ) : cliente ? (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                        <div className="text-sm font-bold text-white">
                            {`${cliente.nombre_razon_social || ''} ${cliente.apellidos || ''}`.trim()}
                        </div>
                        <div className="text-[11px] text-white/35 mt-0.5">
                            {[cliente.dni, cliente.tlf, cliente.email].filter(Boolean).join(' · ')}
                        </div>
                    </div>
                ) : null}
                {!cliente && (
                    <div className="mt-2 text-[11px] text-amber-300/80">
                        Hace falta para encargarle el CEE al técnico y para entregárselo después.
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <Campo etiqueta="Nombre del expediente"
                    pista={cambiaCarpeta ? `La carpeta de Drive pasará a llamarse ${carpetaSera}` : null}>
                    <input value={form.nombre} onChange={set('nombre')} disabled={!puedeEditar}
                        className={inputCls} placeholder="ATERSOL VALENCIA" />
                </Campo>

                <Campo etiqueta="Quién lo trae">
                    <PrescriptorPicker
                        prescriptores={prescriptores}
                        value={form.prescriptor_id}
                        onChange={(v) => setForm(p => ({ ...p, prescriptor_id: v }))}
                        placeholder="— ¿Quién nos lo trae? —"
                        sinPartnerLabel="Directo (sin prescriptor)"
                        disabled={!puedeEditar}
                    />
                </Campo>

                <Campo etiqueta="Referencia catastral">
                    <div className="flex gap-2">
                        <input value={form.ref_catastral} disabled={!puedeEditar}
                            onChange={e => setForm(p => ({ ...p, ref_catastral: e.target.value.toUpperCase() }))}
                            className={`${inputCls} font-mono`} placeholder="1841001VK1114B0001SB" />
                        {/* Rellena la dirección, pero no la bloquea: el Catastro da la
                            vía como la tiene registrada y nunca da piso ni puerta. */}
                        <button type="button" onClick={traerDelCatastro}
                            disabled={catastro.cargando || !form.ref_catastral.trim() || !puedeEditar}
                            title="Trae la dirección del Catastro y rellena calle, CP, municipio y provincia"
                            className="shrink-0 min-h-[44px] px-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white hover:border-brand/40 transition-colors disabled:opacity-30">
                            {catastro.cargando ? '…' : 'Traer'}
                        </button>
                    </div>
                </Campo>

                {/* Comunidad, provincia y municipio se ELIGEN, no se teclean: es lo
                    que impide que el mismo municipio acabe escrito de siete maneras
                    y luego no case con nada. Solo se escriben el CP y la calle. */}
                <div className="md:col-span-2">
                    <div className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Dónde está el inmueble</div>
                    <DireccionEdit
                        values={form}
                        onChange={(parcial) => setForm(f => ({ ...f, ...parcial }))}
                        autoMunicipioHint={pistaMunicipio}
                    />
                </div>

                <div className="md:col-span-2">
                    <Campo etiqueta="Notas internas">
                        <textarea value={form.notas} onChange={set('notas')} rows={2} disabled={!puedeEditar}
                            className={`${inputCls} py-3 resize-none`} />
                    </Campo>
                </div>
            </div>

            {catastro.msg && (
                <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] px-4 py-3 text-[11px] text-emerald-300">
                    {catastro.msg}
                </div>
            )}
            {catastro.error && (
                <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-[11px] text-amber-300">
                    {catastro.error}
                </div>
            )}
            {error && (
                <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-xs text-red-300">
                    {error}
                </div>
            )}
        </div>
    );
}

export default DatosExpediente;
