import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import SendActionOverlay from '../../../components/SendActionOverlay';

// ─── LeerPlacasModal ─────────────────────────────────────────────────────────
// Lee las TRES placas de la obra —la de la caldera que se retira y las de la
// bomba de calor que se pone— y enseña qué se escribiría antes de escribirlo.
//
// El gesto es de DOS TIEMPOS y el primero no toca nada: se lee, se ve qué ha
// entendido la app de cada foto, y solo entonces se aplica. De estos datos
// cuelgan el CIFO, el Anexo I y la memoria RITE; un relleno automático que no se
// puede revisar es peor que teclearlo, porque el error entra sin que nadie mire.
//
// REGLA — solo se rellenan HUECOS. Lo que ya está escrito lo puso una persona con
// el aparato delante: lo que difiere sale como CONFLICTO, con las dos versiones a
// la vista, y NO se toca. Corregirlo es una decisión de quien mira, no de quien
// lee una foto movida.
//
// REGLA — el EQUIPO del catálogo es la única casilla. Los demás campos son huecos
// (rellenarlos es justamente lo que se ha pedido), pero elegir un modelo del
// catálogo arrastra consigo el SCOP, y cuando ya hay uno elegido eso no es
// rellenar: es sustituir. Ahí la casilla nace desmarcada y dice a quién sustituye.
export function LeerPlacasModal({ isOpen, onClose, expedienteId, numeroExpediente, onAplicado }) {
    const [fase, setFase] = useState(null);      // null | 'leyendo' | 'revisar' | 'aplicando' | 'hecho'
    const [res, setRes] = useState(null);
    const [error, setError] = useState(null);
    const [usarEquipo, setUsarEquipo] = useState(false);
    //: Cuando el código casa con varios equipos del catálogo no se elige ninguno
    //: (de un modelo cuelgan el SCOP y la ficha técnica del certificado). La
    //: elección la hace una persona aquí, y es un clic — no un callejón sin salida.
    const [elegido, setElegido] = useState(null);
    //: El efecto se re-lanza si cambia la identidad de una prop (el padre las pasa
    //: como flechas en línea). Sin este guardián, abrir el popup dispararía DOS
    //: lecturas —y cada una se paga—. Mismo motivo que el del autoguardado de
    //: `DatosExpediente`: se compara contra lo que ya se ha hecho, no contra
    //: "¿es el primer render?".
    const leidoPara = useRef(null);

    useEffect(() => {
        if (!isOpen || !expedienteId) return;
        if (leidoPara.current === expedienteId) return;
        leidoPara.current = expedienteId;

        setFase('leyendo'); setRes(null); setError(null);
        axios.post(`/api/expedientes/${expedienteId}/placas/ocr`, { aplicar: false })
            .then(({ data }) => {
                setRes(data);
                // Un hueco se ofrece marcado; sustituir un equipo ya elegido, no.
                setUsarEquipo(!!data.equipo_catalogo && !data.equipo_catalogo.sustituye);
                setElegido(null);
                setFase('revisar');
            })
            .catch((e) => {
                setError(e.response?.data?.error || e.message || 'No se han podido leer las placas.');
                setRes({ avisos: e.response?.data?.avisos || [] });
                setFase('hecho');
            });
    }, [isOpen, expedienteId]);

    // Al cerrar se suelta el guardián: volver a abrirlo es pedir una lectura nueva
    // (puede haberse subido una foto mejor entre medias).
    const cerrar = () => { leidoPara.current = null; setFase(null); setRes(null); setError(null); onClose?.(); };

    const aplicar = async () => {
        setFase('aplicando');
        try {
            const { data } = await axios.post(`/api/expedientes/${expedienteId}/placas/ocr`, {
                aplicar: true,
                aplicar_equipo: usarEquipo,
                equipo_id: elegido,
                // Se manda LO REVISADO. Si no, el servidor volvería a leer las fotos:
                // se pagaría una segunda vez y —lo importante— podría salir otro
                // resultado y escribirse algo que nadie ha visto en esta pantalla.
                lectura: {
                    caldera: res?.caldera, unidad_exterior: res?.unidad_exterior,
                    unidad_interior: res?.unidad_interior, fotos: res?.fotos,
                },
            });
            setRes(data); setFase('hecho'); setError(null);
            onAplicado?.();
        } catch (e) {
            setError(e.response?.data?.error || e.message || 'No se ha podido guardar.');
            setFase('hecho');
        }
    };

    if (!isOpen) return null;

    // Mientras lee y al terminar de aplicar, el overlay estándar. El icono es
    // `read`: el fichero ya está en Drive, no está viajando a ningún sitio.
    if (fase === 'leyendo' || fase === 'aplicando' || fase === 'hecho') {
        const escrito = res?.escrito || [];
        return (
            <SendActionOverlay
                phase={fase === 'hecho' ? 'done' : 'sending'}
                ok={!error}
                icon="read"
                subtitle={numeroExpediente || ''}
                sendingTitle={fase === 'aplicando' ? 'Guardando en el expediente…' : 'Leyendo las placas…'}
                okTitle={escrito.length ? 'Datos escritos en la instalación' : 'Listo'}
                errorTitle="No se han podido leer las placas"
                errorText={error || ''}
                items={[
                    ...escrito.map((c) => ({ texto: ETIQUETAS[c] || c, tono: 'ok' })),
                    ...(res?.avisos || []).map((a) => ({ texto: a, tono: 'aviso' })),
                ]}
                onClose={cerrar}
            />
        );
    }

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-bkg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                <Cabecera numeroExpediente={numeroExpediente} onClose={cerrar} />

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    <LoLeido res={res} />
                    <Equipo res={res} usar={usarEquipo} setUsar={setUsarEquipo} />
                    <AcsSuelto res={res} />
                    <Candidatos res={res} elegido={elegido} setElegido={setElegido} />
                    <Propuesta res={res} />
                    <Conflictos res={res} />
                    <Avisos res={res} />
                </div>

                <Pie res={res} usarEquipo={usarEquipo} elegido={elegido} onAplicar={aplicar} onCerrar={cerrar} />
            </div>
        </div>,
        document.body,
    );
}

//: El nombre que entiende una persona de cada campo que se ha escrito. La
//: respuesta viaja con la clave técnica (`aerotermia.numero_serie`), que es la que
//: identifica el dato sin ambigüedad; el rótulo se pone aquí.
const ETIQUETAS = {
    'caldera.marca': 'Caldera · Marca',
    'caldera.modelo': 'Caldera · Modelo',
    'caldera.numero_serie': 'Caldera · Nº de serie',
    'caldera.potencia_caldera_kw': 'Caldera · Potencia (kW)',
    'aerotermia.marca': 'Equipo nuevo · Marca',
    'aerotermia.numero_serie': 'Equipo nuevo · Nº de serie (ud. exterior)',
    'aerotermia.modelo_ud_exterior': 'Equipo nuevo · Modelo ud. exterior',
    'aerotermia.modelo_ud_interior': 'Equipo nuevo · Modelo ud. interior',
    'aerotermia.numero_serie_ud_interior': 'Equipo nuevo · Nº de serie ud. interior',
    'aerotermia.equipo_catalogo': 'Equipo del catálogo + su SCOP',
    'acs.equipo_conjunto': 'Bloque de ACS (el equipo trae el depósito dentro)',
    'acs.numero_serie': 'Equipo de ACS · Nº de serie',
    'acs.modelo_ud_interior': 'Equipo de ACS · Modelo ud. interior',
};

function Cabecera({ numeroExpediente, onClose }) {
    return (
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.08]">
            <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <span className="text-brand">✨</span> Leer las placas
                </h3>
                <p className="text-[11px] text-white/40 mt-1">
                    {numeroExpediente ? `${numeroExpediente} · ` : ''}
                    De las fotos del expediente. Se rellenan solo los huecos: lo que ya está escrito no se toca.
                </p>
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none px-1" aria-label="Cerrar">×</button>
        </div>
    );
}

/** Lo transcrito de cada placa, tal cual, que es contra lo que se contrasta. */
function LoLeido({ res }) {
    const bloques = [
        { t: 'Caldera que se retira', d: res?.caldera?.leido, extra: res?.caldera?.potencia_kw ? `${String(res.caldera.potencia_kw).replace('.', ',')} kW` : null },
        { t: 'Unidad exterior', d: res?.unidad_exterior },
        { t: 'Unidad interior', d: res?.unidad_interior },
    ].filter((b) => b.d);

    if (!bloques.length) return null;

    return (
        <div>
            <h4 className="text-[10px] font-black text-white/45 uppercase tracking-widest mb-2">Lo que dicen las fotos</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {bloques.map((b) => (
                    <div key={b.t} className="bg-white/[0.03] border border-white/[0.07] rounded-xl p-3 space-y-1">
                        <div className="text-[10px] font-black text-brand uppercase tracking-wider">{b.t}</div>
                        <Dato k="Marca" v={b.d.marca} />
                        <Dato k="Modelo" v={b.d.modelo} />
                        <Dato k="Nº serie" v={b.d.numero_serie} />
                        {/* La LÍNEA literal de la placa. Es la evidencia: permite
                            contrastar el número sin abrir la foto, que es justo lo
                            que nadie hace si solo se le enseña el dato suelto. */}
                        {b.d.serie_texto && (
                            <div className="text-[10px] text-white/45 italic break-all pl-1">«{b.d.serie_texto}»</div>
                        )}
                        {b.extra && <Dato k="Potencia" v={b.extra} />}
                        {b.d.potencia_texto && (
                            <div className="text-[10px] text-white/45 italic break-all pl-1">«{b.d.potencia_texto}»</div>
                        )}
                        {b.d.refrigerante && <Dato k="Refrigerante" v={b.d.refrigerante} />}
                    </div>
                ))}
            </div>
        </div>
    );
}

const Dato = ({ k, v }) => (
    <div className="flex items-baseline gap-1.5 text-[11px]">
        <span className="text-white/35 shrink-0">{k}:</span>
        <span className={v ? 'text-white/80 font-mono break-all' : 'text-white/25 italic'}>{v || 'no se lee'}</span>
    </div>
);

/** El equipo del catálogo: lo único que se elige, porque arrastra el SCOP. */
function Equipo({ res, usar, setUsar }) {
    const eq = res?.equipo_catalogo;
    if (!eq) return null;
    return (
        <label className={`flex items-start gap-3 rounded-xl p-3 border cursor-pointer transition-colors ${
            usar ? 'bg-emerald-500/[0.07] border-emerald-500/30' : 'bg-white/[0.03] border-white/[0.07]'}`}>
            <input type="checkbox" checked={usar} onChange={(e) => setUsar(e.target.checked)} className="mt-0.5 accent-emerald-500 w-4 h-4" />
            <div className="min-w-0">
                <div className="text-[11px] font-black text-white uppercase tracking-wider">
                    {eq.marca} {eq.modelo}
                </div>
                <div className="text-[11px] text-white/45 mt-0.5">
                    Reconocido en el catálogo por {eq.por}.
                    {eq.scop != null
                        ? <> Trae su <b className="text-emerald-400">SCOP {String(eq.scop).replace('.', ',')}</b>{eq.potencia ? ` y ${String(eq.potencia).replace('.', ',')} kW` : ''}.</>
                        : <span className="text-amber-400"> Su SCOP no se ha podido resolver: elígelo en el desplegable.</span>}
                </div>
                {/* Un CONJUNTO trae el depósito dentro y resuelve él solo el bloque
                    de ACS: es la misma máquina. Se dice aquí, junto al equipo, para
                    que se vea ANTES de aceptar que esto rellena dos bloques y no uno
                    — y con qué SCOP_dhw, que es propio y NO el de calefacción. */}
                {eq.acs && (
                    <div className="text-[10px] text-white/50 mt-1.5 bg-white/[0.04] rounded-lg px-2 py-1.5">
                        Trae el depósito de ACS dentro, así que rellena también el bloque de <b className="text-white/70">ACS</b>
                        {eq.acs.litros ? ` (${String(eq.acs.litros).replace('.', ',')} l)` : ''} con su
                        {' '}<b className="text-emerald-400">SCOP_dhw {String(eq.acs.scop ?? '—').replace('.', ',')}</b>, que
                        es propio y no el de calefacción. {eq.acs.motivo}
                    </div>
                )}
                {eq.sustituye && (
                    <div className="text-[10px] text-amber-400 mt-1.5">
                        ⚠ Ahora consta «{eq.sustituye}». Marcarlo lo SUSTITUYE, y con él cambia el SCOP del expediente.
                    </div>
                )}
            </div>
        </label>
    );
}

/**
 * El bloque de ACS que resuelve el conjunto cuando el equipo de calefacción YA
 * consta y lo único que falta es esto — que es como llega un expediente cuyo
 * equipo se eligió a mano en su desplegable. Sin esto, el popup no enseñaba nada
 * y parecía que no había nada que hacer.
 */
function AcsSuelto({ res }) {
    const acs = res?.acs_conjunto;
    if (!acs) return null;
    return (
        <div className="rounded-xl p-3 border bg-emerald-500/[0.07] border-emerald-500/30">
            <div className="text-[11px] font-black text-white uppercase tracking-wider">
                Se rellenará el bloque de ACS
            </div>
            <div className="text-[11px] text-white/50 mt-1">
                {acs.equipo ? <>«{acs.equipo}» trae el depósito dentro</> : 'El equipo trae el depósito dentro'}
                {acs.litros ? ` (${String(acs.litros).replace('.', ',')} l)` : ''}, así que hace también el ACS:
                {' '}<b className="text-emerald-400">SCOP_dhw {String(acs.scop ?? '—').replace('.', ',')}</b>, que
                es propio y no el de calefacción. {acs.motivo}
            </div>
        </div>
    );
}

/**
 * Los equipos del catálogo con los que casa el código leído, cuando son varios.
 *
 * Una misma unidad exterior se vende con varias interiores —el DAIKIN
 * ERLA16DAV37 casa con cinco filas—, así que el emparejamiento automático se
 * planta a propósito. Enseñarlos y dejar elegir de un clic es la diferencia
 * entre un callejón sin salida y una elección: lo que NO se puede hacer es
 * elegir por el usuario, porque de ese modelo salen el SCOP y la ficha técnica
 * que se adjunta al certificado.
 */
function Candidatos({ res, elegido, setElegido }) {
    const lista = res?.catalogo_candidatos || [];
    if (res?.equipo_catalogo || lista.length < 2) return null;
    return (
        <div>
            <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-2">
                ¿Cuál de estos es? ({lista.length}) · se diferencian en la otra unidad
            </h4>
            <div className="space-y-1">
                {lista.map((c) => (
                    <label key={c.id} className={`flex items-start gap-3 rounded-lg px-3 py-2 border cursor-pointer transition-colors ${
                        String(elegido) === String(c.id) ? 'bg-emerald-500/[0.07] border-emerald-500/30' : 'bg-white/[0.03] border-white/[0.07] hover:border-white/20'}`}>
                        <input
                            type="radio" name="equipo-catalogo" className="mt-0.5 accent-emerald-500 w-4 h-4"
                            checked={String(elegido) === String(c.id)}
                            onChange={() => setElegido(c.id)}
                        />
                        <div className="min-w-0">
                            <div className="text-[11px] font-bold text-white break-words">{c.marca} {c.modelo_comercial}</div>
                            <div className="text-[10px] text-white/40 font-mono break-all">
                                {[c.modelo_ud_exterior && `ext: ${c.modelo_ud_exterior}`,
                                    c.modelo_ud_interior && `int: ${c.modelo_ud_interior}`,
                                    c.potencia_calefaccion && `${String(c.potencia_calefaccion).replace('.', ',')} kW`]
                                    .filter(Boolean).join('  ·  ')}
                            </div>
                        </div>
                    </label>
                ))}
                <p className="text-[10px] text-white/35 px-1 pt-1">
                    De esta elección salen el SCOP y la ficha técnica del certificado —y el bloque de ACS, si el equipo trae el depósito dentro—. Si no lo tienes claro, déjalo sin marcar y elígelo en el desplegable.
                </p>
            </div>
        </div>
    );
}

function Propuesta({ res }) {
    const p = res?.propuesta || [];
    if (!p.length) {
        return (
            <div className="text-[11px] text-white/45 bg-white/[0.03] border border-white/[0.07] rounded-xl px-3 py-2.5">
                No hay ningún hueco que rellenar con lo leído: los campos ya están escritos.
            </div>
        );
    }
    return (
        <div>
            <h4 className="text-[10px] font-black text-white/45 uppercase tracking-widest mb-2">
                Se escribirá en la instalación ({p.length})
            </h4>
            <div className="space-y-1">
                {p.map((x) => (
                    <div key={`${x.nodo}.${x.campo}`} className="flex items-baseline gap-2 text-[11px] bg-emerald-500/[0.05] border border-emerald-500/20 rounded-lg px-3 py-2">
                        <span className="text-emerald-400">✓</span>
                        <span className="text-white/50 shrink-0">{x.etiqueta}</span>
                        <span className="text-white font-mono font-bold break-all ml-auto">{String(x.valor)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Lo que difiere de lo escrito. Se enseña con las dos versiones y NO se toca. */
function Conflictos({ res }) {
    const c = res?.conflictos || [];
    if (!c.length) return null;
    return (
        <div>
            <h4 className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-2">
                No cuadra con lo que ya hay ({c.length}) · no se toca
            </h4>
            <div className="space-y-1">
                {c.map((x) => (
                    <div key={`${x.nodo}.${x.campo}`} className="text-[11px] bg-amber-500/[0.06] border border-amber-500/25 rounded-lg px-3 py-2">
                        <div className="text-white/50">{x.etiqueta}</div>
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1 font-mono">
                            <span className="text-white/70">consta <b className="text-white">{String(x.actual)}</b></span>
                            <span className="text-white/70">la placa dice <b className="text-amber-300">{String(x.leido)}</b></span>
                        </div>
                    </div>
                ))}
                <p className="text-[10px] text-white/35 px-1 pt-1">
                    Lo escrito lo puso una persona con el aparato delante: si la placa lleva razón, corrígelo tú en el campo.
                </p>
            </div>
        </div>
    );
}

function Avisos({ res }) {
    const a = res?.avisos || [];
    if (!a.length) return null;
    return (
        <div className="space-y-1">
            {a.map((x, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-white/55 bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2">
                    <span className="text-amber-400 shrink-0">⚠</span><span>{x}</span>
                </div>
            ))}
        </div>
    );
}

function Pie({ res, usarEquipo, elegido, onAplicar, onCerrar }) {
    const n = (res?.propuesta?.length || 0)
        + ((usarEquipo && res?.equipo_catalogo) || elegido ? 1 : 0)
        + (res?.acs_conjunto ? 1 : 0);
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-white/[0.08] bg-black/20">
            <span className="text-[10px] text-white/30">
                {res?.fotos?.length ? `${res.fotos.length} foto${res.fotos.length === 1 ? '' : 's'} leída${res.fotos.length === 1 ? '' : 's'}` : ''}
            </span>
            <div className="flex items-center gap-2">
                <button onClick={onCerrar} className="px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">
                    Cancelar
                </button>
                <button
                    onClick={onAplicar}
                    disabled={!n}
                    className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                        n ? 'bg-brand text-bkg-deep hover:brightness-110 active:scale-95' : 'bg-white/5 text-white/25 cursor-not-allowed'}`}
                >
                    {n ? `Escribir ${n} dato${n === 1 ? '' : 's'}` : 'Nada que escribir'}
                </button>
            </div>
        </div>
    );
}

export default LeerPlacasModal;
