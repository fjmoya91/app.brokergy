import { useEffect, useState } from 'react';
import { CampoDecimal } from '../../../components/CampoDecimal';
import { AISLAMIENTOS_CE3X, COMBUSTIBLES_CE3X, esDeCaldera, GENERADORES_CE3X,
         TIPOS_EQUIPO_CE3X, tipoEquipo } from '../logic/fichaCe3x';

// ─────────────────────────────────────────────────────────────────────────────
// Los apartados de la ficha, cada uno en SU ventana — como en CE3X.
//
// Antes esto era un `<details>` largo y todo se miraba haciendo scroll. Quien
// usa esta pantalla lleva años en CE3X, donde cada pestaña ES una pantalla: se
// entra, se rellena y se sale. Con un scroll largo no se sabe nunca si lo que
// falta está más abajo.
//
// REGLA — los ADMINISTRATIVOS no se TECLEAN aquí: se corrigen EN SU FUENTE.
// Los compone el backend desde el expediente, desde Catastro y desde las fichas
// de Clientes y Prescriptores, así que la pantalla los enseña con su
// procedencia; y cuando hay algo que arreglar, el botón de editar escribe en
// esas fichas —`clientes` y `prescriptores`—, nunca en una copia local. Un
// titular guardado en dos sitios acaba ganándolo el que se guarde el último.
//
// Quién puede: el equipo interno corrige al cliente; el TÉCNICO, sus once
// campos —son suyos, y es él quien sabe su nº de colegiado—. Un certificador no
// toca al titular, del que cuelgan el Anexo I y el convenio.
//
// REGLA — los GENERALES sí, y lo que se toque queda marcado. Catastro se
// equivoca —una ampliación sin declarar, una planta que consta como almacén y
// es vivienda— y el certificador tiene el edificio delante; lo que ponga manda y
// su procedencia pasa a decir que lo puso él.
// ─────────────────────────────────────────────────────────────────────────────

//: Lo que CE3X llama «Datos generales»: lo que fija la normativa y la zona.
const GENERALES = [
    { k: 'normativa', etiqueta: 'Normativa vigente', campo: 'normativa',
      opciones: ['Anterior', 'NBE-CT-79', 'C.T.E.', 'CTE 2013'] },
    { k: 'anio', etiqueta: 'Año construcción', campo: 'ano_construccion', tipo: 'number' },
    { k: 'tipo_edificio', etiqueta: 'Tipo de edificio', campo: 'tipo_edificio' },
    { k: 'zona', etiqueta: 'Zona climática HE-1', campo: 'zona_climatica_he1' },
    { k: 'zona_climatica_he4', etiqueta: 'Zona climática HE-4', campo: 'zona_climatica_he4',
      opciones: ['I', 'II', 'III', 'IV', 'V'] },
];

//: Y lo que llama «Definición del edificio»: lo que se mide.
const EDIFICIO = [
    { k: 'superficie_util_habitable', etiqueta: 'Superficie útil habitable',
      campo: 'superficie_util_habitable', tipo: 'number', unidad: 'm²' },
    { k: 'altura_libre_planta', etiqueta: 'Altura libre de planta',
      campo: 'altura_libre_planta', tipo: 'number', paso: '0.1', unidad: 'm' },
    { k: 'n_plantas_habitables', etiqueta: 'Número de plantas habitables',
      campo: 'n_plantas_habitables', tipo: 'number' },
    { k: 'ventilacion', etiqueta: 'Ventilación del inmueble', campo: 'ventilacion',
      tipo: 'number', paso: '0.01', unidad: 'ren/h' },
    { k: 'demanda_acs', etiqueta: 'Demanda diaria de ACS', campo: 'demanda_acs',
      tipo: 'number', unidad: 'l/día' },
    { k: 'masa_particiones', etiqueta: 'Masa de las particiones internas',
      campo: 'masa_particiones', opciones: ['Ligera', 'Media', 'Pesada'] },
];

//: Lo que se corrige del TITULAR, y en qué columna de `clientes` se escribe.
//: Tiene que decir lo mismo que `CAMPOS_CLIENTE` en `ceeEnvolventeCex.js`, que
//: es la lista que MANDA: lo que no esté allí no se guarda, y desde aquí no se
//: vería por qué. Son los de «Datos del cliente» de CE3X y ni uno más.
const CLIENTE = [
    { k: 'nombre_razon_social', etiqueta: 'Nombre o razón social', ancho: true },
    { k: 'apellidos', etiqueta: 'Apellidos', ancho: true },
    { k: 'direccion', etiqueta: 'Dirección', ancho: true },
    { k: 'provincia', etiqueta: 'Provincia' },
    { k: 'municipio', etiqueta: 'Localidad' },
    { k: 'codigo_postal', etiqueta: 'Código postal' },
    { k: 'tlf', etiqueta: 'Teléfono' },
    { k: 'email', etiqueta: 'E-mail', ancho: true, minusculas: true },
];

//: Y los del TÉCNICO, que son los de su ficha de Prescriptores. El teléfono y
//: el correo se escriben en `*_responsable`: son los de la PERSONA que firma
//: —lo que CE3X pide—, no los generales de la empresa.
//:
//: Quien firma y la empresa en la que ejerce son DOS cosas y cada una tiene su
//: casilla en el .cex. `razon_social` es la identidad de la FICHA (con la que
//: sale en la app y en la facturación) y solo ocupa la casilla de la empresa
//: cuando no consta ninguna, que es lo correcto en un autónomo.
const TECNICO = [
    { k: 'nombre_responsable', etiqueta: 'Nombre' },
    { k: 'apellidos_responsable', etiqueta: 'Apellidos' },
    { k: 'nif_responsable', etiqueta: 'NIF' },
    { k: 'empresa_razon_social', etiqueta: 'Razón social (empresa)', ancho: true },
    { k: 'empresa_cif', etiqueta: 'CIF de la empresa' },
    { k: 'razon_social', etiqueta: 'Nombre de su ficha' },
    { k: 'cif', etiqueta: 'NIF/CIF de la ficha' },
    { k: 'direccion', etiqueta: 'Dirección', ancho: true },
    { k: 'provincia', etiqueta: 'Provincia' },
    { k: 'municipio', etiqueta: 'Localidad' },
    { k: 'codigo_postal', etiqueta: 'Código postal' },
    { k: 'tlf_responsable', etiqueta: 'Teléfono' },
    { k: 'email_responsable', etiqueta: 'E-mail', ancho: true, minusculas: true },
    { k: 'titulacion', etiqueta: 'Titulación', ancho: true },
    { k: 'colegio_profesional', etiqueta: 'Colegio profesional' },
    { k: 'numero_colegiado', etiqueta: 'Nº de colegiado' },
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * DATOS ADMINISTRATIVOS: de quién es, dónde está y quién lo firma.
 *
 * Se entra a COMPROBARLOS: un certificado a nombre de otro titular, o sin
 * técnico, es de las pocas cosas que no se arreglan reabriendo el `.cex`. Y lo
 * que haya que arreglar se arregla aquí mismo —sin cerrar la pestaña ni perder
 * el sitio del plano—, pero escribiendo en la FICHA de la que salen.
 */
export function PanelAdministrativos({ datos, fuente, puedeCliente = false,
                                       puedeTecnico = false,
                                       onGuardarCliente, onGuardarTecnico }) {
    const a = datos?.ficha?.administrativos || {};
    const t = datos?.ficha?.tecnico;
    const v = (x) => x?.valor ?? null;
    //: El `de:` solo se enseña cuando NO es lo obvio: «ficha del cliente»
    //: repetido en siete filas es ruido, y lo que hay que ver es la excepción.
    const salvoObvio = (d) => (d && d !== 'ficha del cliente' ? d : null);
    return (
        <Ventana titulo="Datos administrativos"
                 pie="Salen del expediente y de Catastro. Lo que se edita aquí se guarda en la
                      ficha del cliente y en la de Prescriptores, que es de donde lo lee todo
                      lo demás: no queda una copia dentro del .cex.">
            <Grupo titulo="Localización e identificación del edificio">
                <Fila rotulo="Nombre del edificio" v={v(a.nombre_edificio)} ancho />
                <Fila rotulo="Dirección" v={v(a.direccion)} ancho />
                <Fila rotulo="Provincia" v={v(a.provincia)} />
                <Fila rotulo="Localidad" v={v(a.localidad_texto)} />
                <Fila rotulo="Código postal" v={v(a.codigo_postal)} />
                <Fila rotulo="Referencia catastral" v={v(a.referencia_catastral)} />
            </Grupo>

            <GrupoFicha titulo="Datos del cliente" campos={CLIENTE}
                        valores={fuente?.cliente} puede={puedeCliente}
                        onGuardar={onGuardarCliente}
                        pie="Se escribe en la ficha del cliente, la misma que abre el expediente.">
                <Fila rotulo="Nombre o razón social" v={v(a.cliente_nombre)} ancho />
                <Fila rotulo="Dirección" v={v(a.cliente_direccion)} ancho />
                <Fila rotulo="Provincia" v={v(a.cliente_provincia)} />
                <Fila rotulo="Localidad" v={v(a.cliente_localidad)} />
                <Fila rotulo="Código postal" v={v(a.cliente_cp)} />
                {/* El teléfono y el correo pueden salir de la PERSONA DE
                    CONTACTO cuando el titular no dio los suyos, y entonces el
                    `de:` lo dice con su nombre: no es lo mismo el correo de
                    quien firma que el de quien lleva la obra. */}
                <Fila rotulo="Teléfono" v={v(a.cliente_telefono)}
                      de={salvoObvio(a.cliente_telefono?.de)} />
                <Fila rotulo="E-mail" v={v(a.cliente_email)}
                      de={salvoObvio(a.cliente_email?.de)} ancho />
            </GrupoFicha>

            <GrupoFicha titulo="Datos del técnico certificador" campos={TECNICO}
                        valores={fuente?.tecnico} puede={puedeTecnico && !!t}
                        onGuardar={onGuardarTecnico}
                        pie="Se escribe en su ficha de Prescriptores: vale para todos los
                             certificados que firme, no solo para éste. Sin empresa declarada,
                             la casilla «Razón social» la ocupa el nombre de su ficha — que es
                             lo correcto en un autónomo.">
                {t ? (
                    <>
                        <Fila rotulo="Nombre y apellidos" v={t.nombre} />
                        <Fila rotulo="NIF" v={t.nif} />
                        <Fila rotulo="Razón social" v={t.empresa} />
                        <Fila rotulo="CIF" v={t.cif_empresa} />
                        <Fila rotulo="Dirección" v={t.direccion} ancho />
                        <Fila rotulo="Provincia" v={t.provincia} />
                        <Fila rotulo="Localidad" v={t.municipio} />
                        <Fila rotulo="Código postal" v={t.codigo_postal} />
                        <Fila rotulo="Teléfono" v={t.telefono} />
                        <Fila rotulo="E-mail" v={t.email} ancho />
                        <Fila rotulo="Titulación habilitante" v={t.titulacion} ancho />
                    </>
                ) : (
                    <p className="text-[12px] text-amber-300/90">
                        El expediente no tiene certificador asignado: el <code>.cex</code> sale
                        sin los datos del técnico y hay que ponerlos en CE3X. Asígnalo en el
                        módulo CEE del expediente.
                    </p>
                )}
            </GrupoFicha>
        </Ventana>
    );
}

/**
 * Un recuadro de la ficha que además se puede CORREGIR.
 *
 * Dos caras a propósito. En lectura enseña lo que va a ir al `.cex` —el nombre
 * ya compuesto con los apellidos, la provincia pasada por el desplegable de
 * CE3X— que es lo que hay que revisar. En edición enseña las COLUMNAS, que es
 * lo único sobre lo que se puede escribir: sobre un valor compuesto no se
 * puede, y dejar editable «Nombre o razón social» obligaría a adivinar dónde
 * acaba el nombre y empiezan los apellidos.
 *
 * Sin permiso no hay botón: el certificador ve el bloque del cliente igual que
 * hasta ahora.
 */
function GrupoFicha({ titulo, campos, valores, puede, onGuardar, pie, children }) {
    const [editando, setEditando] = useState(false);
    const [form, setForm] = useState({});
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    const abrir = () => {
        setForm(Object.fromEntries(campos.map(c => [c.k, valores?.[c.k] ?? ''])));
        setError(null);
        setEditando(true);
    };

    const guardar = async () => {
        setGuardando(true);
        setError(null);
        try {
            await onGuardar?.(form);
            setEditando(false);
        } catch (e) {
            setError(e?.response?.data?.error || 'No se ha podido guardar.');
        } finally {
            setGuardando(false);
        }
    };

    const accion = !puede ? null : editando ? (
        <div className="flex items-center gap-2">
            <button onClick={() => setEditando(false)} disabled={guardando}
                    className="text-[10px] font-bold uppercase tracking-widest
                               text-white/35 hover:text-white/70">
                Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
                    className="rounded-lg bg-brand/15 px-2.5 py-1 text-[10px] font-black
                               uppercase tracking-widest text-brand hover:bg-brand/25
                               disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar'}
            </button>
        </div>
    ) : (
        <button onClick={abrir}
                className="text-[10px] font-bold uppercase tracking-widest
                           text-white/35 hover:text-brand">
            ✎ Editar
        </button>
    );

    return (
        <Grupo titulo={titulo} accion={accion}>
            {editando
                ? campos.map(c => (
                    <CampoFuente key={c.k} c={c} valor={form[c.k] ?? ''}
                                 onCambiar={x => setForm(f => ({ ...f, [c.k]: x }))} />
                  ))
                : children}
            {editando && pie && (
                <p className="md:col-span-2 pt-1 text-[10.5px] text-white/30">{pie}</p>
            )}
            {error && (
                <p className="md:col-span-2 text-[11px] text-red-300">{error}</p>
            )}
        </Grupo>
    );
}

/** Un campo del formulario: una COLUMNA, con su rótulo de CE3X. */
function CampoFuente({ c, valor, onCambiar }) {
    return (
        <div className={`flex items-center gap-2 text-[12px] ${c.ancho ? 'md:col-span-2' : ''}`}>
            <dt className="w-44 shrink-0 text-white/45">{c.etiqueta}</dt>
            <dd className="min-w-0 flex-1">
                <input
                    value={valor} aria-label={c.etiqueta}
                    onChange={e => onCambiar(e.target.value)}
                    // `no-uppercase` en el correo: la regla global de `index.css`
                    // pone en MAYÚSCULAS todo `input`, y un email se guarda en
                    // minúsculas — se vería una cosa y se guardaría otra.
                    className={`w-full rounded-md border border-white/10 bg-white/[0.04]
                                px-2 py-1 text-[12.5px] font-bold
                                ${c.minusculas ? 'no-uppercase lowercase' : ''}`} />
            </dd>
        </div>
    );
}

/** DATOS GENERALES: la normativa, la zona y lo que mide el edificio. */
export function PanelGenerales({ datos, puestos = {}, retocadas = {},
                                 onCambiarDato, onCambiarU, construcciones,
                                 onCambiarConstrucciones, guardandoConstrucciones,
                                 imagenes, traendoImagenes, onTraerImagenes,
                                 onSustituirImagen, onQuitarImagen }) {
    const g = datos?.ficha?.generales || {};
    const a = datos?.ficha?.administrativos || {};
    const t = datos?.ficha?.termicas || {};
    //: Las que el certificador puede retocar. La medianera no está: es
    //: adiabática (U = 0) por definición, y si al otro lado hay un local, lo
    //: que se cambia es el TIPO de la pared, no su transmitancia.
    const us = [
        ['fachada', 'Fachada', t.fachada], ['cubierta', 'Cubierta', t.cubierta],
        ['suelo_terreno', 'Suelo', t.suelo_terreno],
        ['particion_superior', 'Particiones', t.particion_superior],
    ];
    const campo = (c) => (
        <Campo key={c.k} c={c} v={g[c.campo]} puesto={puestos[c.k]} onCambiar={onCambiarDato} />
    );
    return (
        <Ventana titulo="Datos generales">
            <Grupo titulo="Datos generales">
                {GENERALES.map(campo)}
                {/* CE3X los repite aquí y salen de los administrativos: se
                    enseñan para poder comprobarlos, no para teclearlos dos veces. */}
                <Fila rotulo="Provincia" v={a.provincia?.valor} />
                <Fila rotulo="Localidad" v={a.localidad_texto?.valor} />
            </Grupo>

            <Grupo titulo="Definición del edificio">
                {EDIFICIO.map(campo)}
            </Grupo>

            <Construcciones lista={construcciones} onCambiar={onCambiarConstrucciones}
                            guardando={guardandoConstrucciones} />

            <Imagenes imagenes={imagenes} trayendo={traendoImagenes}
                      onTraer={onTraerImagenes}
                      onSustituir={onSustituirImagen} onQuitar={onQuitarImagen} />

            {/* No es un apartado de CE3X: allí la U va dentro de cada
                cerramiento. Aquí sale de la GUÍA DE TRANSMITANCIAS por época y
                zona —la misma que estudió la oportunidad— y vale para todo el
                edificio, así que va con el año y la normativa, que es de donde
                sale. La de UNA pared concreta se cambia en su panel del plano. */}
            <Grupo titulo="Transmitancias de la época (W/m²K)">
                {us.map(([clave, etiqueta, v]) => (
                    <div key={clave} className="flex items-center gap-2 text-[12px]">
                        <dt className="w-44 shrink-0 text-white/45">{etiqueta}</dt>
                        <dd className="flex items-center gap-2">
                            <CampoDecimal
                                valor={v?.u ?? ''}
                                aria-label={`transmitancia de ${etiqueta}`}
                                onCambio={n => onCambiarU?.(clave, n)}
                                alVaciar={() => onCambiarU?.(clave, null)}
                                className={`w-[74px] rounded-md border bg-white/[0.04] px-2 py-1
                                            text-[12.5px] font-bold tabular-nums
                                    ${retocadas[clave] !== undefined
                                        ? 'border-brand/60 text-brand' : 'border-white/10'}`} />
                            <span className="text-[11px] text-white/30">masa {v?.masa}</span>
                            {retocadas[clave] !== undefined && (
                                <button onClick={() => onCambiarU?.(clave, null)}
                                        className="text-[10px] text-white/35 hover:text-white/70">
                                    volver a la tabla
                                </button>
                            )}
                        </dd>
                    </div>
                ))}
                <p className="col-span-full text-[10.5px] leading-relaxed text-white/35">
                    {t._de}
                </p>
            </Grupo>
        </Ventana>
    );
}

/**
 * La foto de fachada y el croquis de parcela, que van DENTRO del `.cex`.
 *
 * Se piden a demanda y no solas, y por eso hay un botón: son dos consultas a
 * Catastro, y esta pantalla se abre muchas veces. El helper las cachea por
 * referencia catastral, así que mirarlas aquí no cuesta una petición más cuando
 * luego se genere.
 *
 * REGLA — que falten NO impide generar. Muchos inmuebles no tienen foto de
 * fachada registrada y el certificado es igual de válido sin ella: se dice, y se
 * pone en CE3X si se tiene.
 */
/**
 * El desglose de construcciones del Catastro, con cuáles CUENTAN.
 *
 * Es la misma tabla de la ficha técnica de la oportunidad, donde una persona
 * marcó qué entra. De ahí salen la superficie útil habitable y el número de
 * plantas de arriba, y qué plantas se dibujan y se miden: un desglose que solo
 * vive en otra pantalla no lo comprueba nadie, y es justo donde se cuela que una
 * planta que consta como almacén sea en realidad vivienda.
 *
 * Se ENSEÑA, no se edita: se marca donde se marcó siempre. Editarlo aquí dejaría
 * la oportunidad diciendo una superficie y el certificado otra, que es el
 * descuadre que el botón ⓘ del módulo CEE viene avisando.
 */
function Construcciones({ lista, onCambiar, guardando }) {
    if (!lista?.length) return null;
    const cuentan = lista.filter(c => c.cuenta);
    const total = cuentan.reduce((s, c) => s + (Number(c.superficie) || 0), 0);
    const niveles = new Set(cuentan.map(c => c.nivel));
    const corregidas = lista.filter(c => c.catastro !== null
                                      && c.catastro !== undefined
                                      && !!c.catastro !== !!c.cuenta);
    const alternar = (c) => onCambiar?.(
        lista.filter(x => (x.codigo === c.codigo ? !x.cuenta : x.cuenta)).map(x => x.codigo));

    return (
        <div className="rounded-xl border border-white/[0.07] px-4 pb-3 pt-2.5">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-[11px] font-bold text-brand">Qué se mide de este edificio</p>
                <span className="text-[10.5px] text-white/35">
                    {onCambiar ? 'marca las que cuentan' : 'lo marcado en la ficha técnica'}
                </span>
                <span className="ml-auto text-[11px] tabular-nums text-white/55">
                    {guardando ? <span className="text-brand">volviendo a medir…</span> : <>
                        <b className="text-white/85">{miles(Math.round(total))} m²</b>
                        {' · '}{niveles.size} {niveles.size === 1 ? 'planta' : 'plantas'}
                    </>}
                </span>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-[11.5px]">
                    <thead>
                        <tr className="text-[9.5px] uppercase tracking-wider text-white/30">
                            <th className="w-9 py-1 text-left">Cal.</th>
                            <th className="py-1 text-left">Uso</th>
                            <th className="py-1 text-left">Planta</th>
                            <th className="py-1 text-left">Código</th>
                            <th className="py-1 text-right">Superficie</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lista.map(c => (
                            <tr key={c.codigo}
                                // Lo que NO cuenta se atenúa, pero se LEE: en tema
                                // claro /25 daba 2,6:1 y saber qué se dejó fuera es
                                // la mitad del valor de este desglose.
                                className={`border-t border-white/[0.05] ${
                                    c.cuenta ? 'text-white/80' : 'text-white/60'}`}>
                                <td className="py-1">
                                    {onCambiar
                                        ? <input type="checkbox" checked={c.cuenta}
                                                 disabled={guardando}
                                                 onChange={() => alternar(c)}
                                                 aria-label={`contar ${c.uso} de ${c.planta}`}
                                                 className="h-3.5 w-3.5 accent-[var(--brand)]" />
                                        : (c.cuenta ? '✔' : '')}
                                </td>
                                <td className="py-1 font-semibold">{c.uso || '—'}</td>
                                <td className="py-1">{c.planta ?? '—'}</td>
                                <td className="py-1 tabular-nums text-white/30">{c.codigo}</td>
                                <td className="py-1 text-right tabular-nums">
                                    {miles(Math.round(Number(c.superficie) || 0))} m²
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {corregidas.length > 0 && (
                <p className="mt-2 text-[10.5px] leading-relaxed text-amber-200/80">
                    ⚠ {corregidas.map(c => (
                        `${c.uso} de ${c.planta ?? `nivel ${c.nivel}`} `
                        + (c.cuenta ? 'CUENTA aunque Catastro no lo tenga por habitable'
                                    : 'NO cuenta aunque Catastro lo tenga por habitable')
                    )).join('; ')}. Lo decidió una persona, no el uso de Catastro.
                </p>
            )}

            <p className="mt-2 text-[10.5px] leading-relaxed text-white/35">
                De aquí salen la superficie útil y el nº de plantas de arriba, y qué plantas
                se dibujan y se miden: al marcar, el edificio se vuelve a medir.
                <b className="text-white/50"> La simulación de la oportunidad no se
                recalcula</b> — lo que cambia es lo que mide el certificado.
            </p>
        </div>
    );
}

function Imagenes({ imagenes, trayendo, onTraer, onSustituir, onQuitar }) {
    // Se piden SOLAS al abrir esta ventana. El backend las cachea por referencia
    // catastral y es la misma caché con la que se genera el .cex, así que
    // mirarlas no cuesta ni una petición más a Catastro — y una imagen detrás de
    // un botón es una imagen que nadie comprueba.
    useEffect(() => { if (!imagenes && onTraer) onTraer(); },
              [imagenes, onTraer]);

    return (
        <div className="rounded-xl border border-white/[0.07] px-4 pb-3 pt-2.5">
            <div className="mb-2 flex flex-wrap items-center gap-3">
                <p className="text-[11px] font-bold text-brand">Imágenes del certificado</p>
                <span className="text-[10.5px] text-white/35">
                    Es lo que va a ir DENTRO del <code>.cex</code>.
                </span>
                <button onClick={onTraer} disabled={trayendo || !onTraer}
                        className="ml-auto rounded-lg border border-white/10 px-2.5 py-1
                                   text-[10px] font-bold uppercase tracking-wider text-white/45
                                   hover:border-white/30 hover:text-white disabled:opacity-40">
                    {trayendo ? 'Trayéndolas…' : '↻ Refrescar'}
                </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <Foto titulo="Imagen del edificio" cual="fachada"
                      b64={imagenes?.foto_edificio} cargando={trayendo && !imagenes}
                      puesta={imagenes?.sustituidas?.fachada}
                      onSustituir={onSustituir} onQuitar={onQuitar} />
                <Foto titulo="Plano de situación" cual="croquis"
                      b64={imagenes?.plano_situacion} cargando={trayendo && !imagenes}
                      puesta={imagenes?.sustituidas?.croquis}
                      onSustituir={onSustituir} onQuitar={onQuitar} />
            </div>

            {imagenes?.avisos?.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[10.5px] leading-relaxed text-amber-200/80">
                    {imagenes.avisos.map((a, i) => <li key={i}>· {a}</li>)}
                </ul>
            )}
        </div>
    );
}

//: El `data:` se compone mirando los primeros bytes y no cableando un tipo: la
//: fachada llega en JPEG y el croquis de parcela en PNG, y con el tipo
//: equivocado el navegador no pinta ninguna de las dos.
function aDataUrl(b64) {
    if (!b64) return null;
    const tipo = b64.startsWith('/9j/') ? 'jpeg' : b64.startsWith('iVBOR') ? 'png' : 'jpeg';
    return `data:image/${tipo};base64,${b64}`;
}

/**
 * Una de las dos imágenes, con su botón de sustituirla.
 *
 * REGLA — lo que se enseña es lo que va al fichero, venga de donde venga. Con la
 * vista pidiendo la de Catastro y el `.cex` escribiendo otra, la comprobación no
 * comprueba nada: las dos salen de `imagenesDelCex`.
 */
function Foto({ titulo, cual, b64, puesta, cargando, onSustituir, onQuitar }) {
    const [subiendo, setSubiendo] = useState(false);
    const src = aDataUrl(b64);

    async function elegir(e) {
        const f = e.target.files?.[0];
        e.target.value = '';                       // poder repetir el mismo fichero
        if (!f || !onSustituir) return;
        setSubiendo(true);
        try { await onSustituir(cual, f); } finally { setSubiendo(false); }
    }

    return (
        <figure className="min-w-0">
            <figcaption className="mb-1 flex items-center gap-2 text-[10.5px] uppercase
                                   tracking-wider text-white/35">
                {titulo}
                {puesta && (
                    <span className="rounded border border-brand/40 px-1 text-[9px]
                                     font-bold tracking-wider text-brand">
                        LA TUYA
                    </span>
                )}
            </figcaption>

            {src
                ? <img src={src} alt={titulo}
                       className="max-h-44 w-full rounded-lg border border-white/10
                                  object-contain" />
                : cargando
                    ? <p className="rounded-lg border border-white/10 px-2.5 py-3
                                    text-[11px] text-white/35">Trayéndola…</p>
                    : <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.05]
                                    px-2.5 py-3 text-[11px] leading-relaxed text-amber-200/80">
                          Catastro no la tiene. El certificado vale igual sin ella — o pon
                          la tuya aquí abajo.
                      </p>}

            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <label className={`cursor-pointer rounded-lg border border-white/10 px-2 py-1
                                   text-[10px] font-bold uppercase tracking-wider
                                   ${subiendo ? 'text-white/25'
                                              : 'text-white/45 hover:border-brand/50 hover:text-brand'}`}>
                    {subiendo ? 'Subiendo…' : puesta ? 'Cambiarla' : 'Poner otra'}
                    <input type="file" accept="image/*" className="hidden"
                           disabled={subiendo || !onSustituir} onChange={elegir} />
                </label>
                {puesta && (
                    <button onClick={() => onQuitar?.(cual)}
                            className="text-[10px] text-white/35 hover:text-white/70">
                        volver a la de Catastro
                    </button>
                )}
            </div>
        </figure>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTALACIONES: el equipo que se va a escribir, y se puede teclear.
//
// Leer la placa con IA es lo más rápido cuando hay foto, pero no siempre la hay
// —y hay datos que no están en ninguna placa: el depósito de ACS, el reparto
// entre dos aparatos, si la caldera está aislada—. Hasta ahora todo eso había
// que teclearlo DENTRO de CE3X, con el fichero ya abierto.
//
// REGLA — lo tecleado MANDA sobre lo derivado, y sale dicho en los avisos: es un
// dato que va a un certificado y tiene que constar que lo puso una persona.
//
// REGLA — los rótulos y las opciones son los de CE3X, pero lo que se escribe es
// la cadena del FICHERO: no son la misma («Biomasa densificada (pelets)» se
// guarda como `BiomasaDens`). Lo que no se ha visto en un `.cex` real se ofrece
// igual —sin «Caldera Condensación» no se puede declarar media España— pero
// marcado y con aviso.
// ─────────────────────────────────────────────────────────────────────────────
export function PanelInstalaciones({ fase = 'inicial', onFase, equipo, superficie,
                                     ajustes = {}, onAjuste, extras = [], onExtra,
                                     onAnadir, onBorrar, dosFases = true, children }) {
    const esFinal = fase === 'final';
    const [abierta, setAbierta] = useState('principal');

    // El del expediente, con lo tecleado encima; y los añadidos a mano.
    const principal = { ...(equipo || {}), ...limpio(ajustes) };
    const todos = [{ eq: principal, propio: true }, ...extras.map(x => ({ eq: x }))];

    return (
        <Ventana titulo="Instalaciones">
            <SelectorFase fase={fase} onFase={onFase} dosFases={dosFases} />
            {children}

            {esFinal ? (
                <p className="text-[11.5px] leading-relaxed text-white/40">
                    En el CEE final el equipo es la <b className="text-white/70">aerotermia del
                    expediente</b>, con su SCOP ensayado: sale del catálogo y no se teclea aquí.
                    Si algo no cuadra, se corrige en la pestaña Instalación del expediente.
                </p>
            ) : (
                <>
                    <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                            Instalaciones del edificio
                        </p>

                        {/* PLEGADAS por defecto: una vivienda puede tener tres
                            equipos, y tres formularios abiertos a la vez son una
                            pantalla por la que hay que bajar para ver qué hay. El
                            resumen dice lo que se pregunta de un vistazo: qué es,
                            cómo se llama y con qué anda. */}
                        <Equipo eq={principal} abierta={abierta === 'principal'}
                                onAbrir={() => setAbierta(abierta === 'principal' ? null : 'principal')}
                                origen="del expediente">
                            <FormularioEquipo eq={principal} superficie={superficie}
                                              puesto={ajustes} onCampo={onAjuste} />
                        </Equipo>

                        {extras.map((x, i) => (
                            <Equipo key={i} eq={x} abierta={abierta === i}
                                    onAbrir={() => setAbierta(abierta === i ? null : i)}
                                    onBorrar={() => onBorrar?.(i)} origen="añadido a mano">
                                <FormularioEquipo eq={x} superficie={superficie}
                                                  puesto={x}
                                                  onCampo={(k, v) => onExtra?.(i, k, v)} />
                            </Equipo>
                        ))}

                        {/* El que se acaba de añadir se abre solo: si no, pulsar
                            «+ Añadir» deja una línea plegada que pone «sin datos»
                            y parece que no ha pasado nada. */}
                        <Anadir onAnadir={(slot) => {
                            setAbierta(extras.length);
                            onAnadir?.(slot);
                        }} />
                    </div>

                    <Reparto equipos={todos.map(t => t.eq)} />
                </>
            )}
        </Ventana>
    );
}

//: Los ajustes vienen con cadenas vacías cuando se borra un campo; para fundir
//: sobre el equipo derivado hay que quitarlas, o taparían lo que sí hay.
function limpio(o) {
    return Object.fromEntries(Object.entries(o || {})
        .filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

/** Una tarjeta de equipo: plegada dice lo justo, abierta se teclea. */
function Equipo({ eq, abierta, onAbrir, onBorrar, origen, children }) {
    const t = tipoEquipo(eq?.slot);
    return (
        <div className={`rounded-xl border ${abierta ? 'border-brand/40 bg-brand/[0.05]'
                                                     : 'border-white/[0.07] bg-white/[0.02]'}`}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5">
                <span className="text-[12.5px] font-semibold text-white/80">{t.etiqueta}</span>
                <span className="min-w-0 truncate text-[11.5px] text-white/45">
                    {resumen(eq)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-white/25">{origen}</span>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    {onBorrar && (
                        <button onClick={onBorrar} aria-label="quitar este equipo"
                                className="px-1 text-[15px] leading-none text-white/30
                                           hover:text-red-400">×</button>
                    )}
                    <button onClick={onAbrir}
                            className="rounded-md border border-white/10 px-2 py-1 text-[10px]
                                       font-bold uppercase tracking-wider text-white/45
                                       hover:border-white/30 hover:text-white">
                        {abierta ? 'Ocultar' : 'Editar'}
                    </button>
                </div>
            </div>
            {abierta && <div className="border-t border-white/[0.07] px-3 pb-3 pt-2.5">{children}</div>}
        </div>
    );
}

//: Lo que se lee de un equipo sin abrirlo: cómo se llama y con qué anda.
function resumen(eq) {
    if (!eq?.nombre) return 'sin datos: ábrelo y complétalo';
    // El combustible que le toca por su tipo mientras nadie diga otra cosa: es
    // el que se va a escribir, así que es el que hay que leer aquí.
    const comb = eq.combustible || tipoEquipo(eq.slot).combustible;
    const con = comb ? ` de ${String(comb).toLowerCase()}` : '';
    const pot = eq.potencia ? ` · ${String(eq.potencia).replace('.', ',')} kW` : '';
    return `${eq.nombre}${con}${pot}`;
}

/** Los campos de UN equipo, los que su tipo necesita y ninguno más. */
function FormularioEquipo({ eq, superficie, puesto = {}, onCampo }) {
    const t = tipoEquipo(eq?.slot);
    const caldera = esDeCaldera(t.valor);
    const suyo = (k) => puesto[k] !== undefined && puesto[k] !== null && puesto[k] !== '';
    const v = (k, pd) => (eq?.[k] ?? pd ?? '');
    const acumula = puesto.acumulacion === undefined ? !!eq?.acumulacion : !!puesto.acumulacion;

    const num = (k, rotulo, unidad, extra = {}) => (
        <Editable rotulo={rotulo} unidad={unidad} suyo={suyo(k)}
                  onDeshacer={() => onCampo(k, null)}>
            <CampoDecimal valor={v(k)} aria-label={rotulo} {...extra}
                          onCambio={n => onCampo(k, n)}
                          alVaciar={() => onCampo(k, '')}
                          className={caja(suyo(k), 'w-[92px]')} />
        </Editable>
    );

    return (
        <dl className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
            <Editable rotulo="Nombre" ancho suyo={suyo('nombre')}
                      onDeshacer={() => onCampo('nombre', null)}>
                <input value={v('nombre')} aria-label="Nombre del equipo"
                       onChange={e => onCampo('nombre', e.target.value)}
                       className={caja(suyo('nombre'), 'w-full')} />
            </Editable>

            {/* Con el valor que le toca a su tipo ya puesto: un equipo de ACS
                recién añadido es un termo por efecto Joule mientras nadie diga
                otra cosa, y es lo que va a escribirse. Un «—» invitaría a creer
                que sale vacío. */}
            <Editable rotulo="Tipo de generador" suyo={suyo('generador')}
                      onDeshacer={() => onCampo('generador', null)}>
                <Desplegable lista={GENERADORES_CE3X} valor={v('generador', t.generador)}
                             propio={suyo('generador')} onCambio={x => onCampo('generador', x)} />
            </Editable>

            <Editable rotulo="Tipo de combustible" suyo={suyo('combustible')}
                      onDeshacer={() => onCampo('combustible', null)}>
                <Desplegable lista={COMBUSTIBLES_CE3X} valor={v('combustible', t.combustible)}
                             propio={suyo('combustible')}
                             onCambio={x => onCampo('combustible', x)} />
            </Editable>

            {caldera ? (
                <>
                    {num('potencia', 'Potencia nominal', 'kW', { step: '0.1', min: '0' })}
                    {num('rend_combustion', 'Rendimiento de combustión', '%',
                         { step: '1', min: '0', max: '120' })}
                    <Editable rotulo="Aislamiento de la caldera" suyo={suyo('aislamiento')}
                              onDeshacer={() => onCampo('aislamiento', null)}>
                        <select value={v('aislamiento', 'Sin aislamiento')}
                                aria-label="Aislamiento de la caldera"
                                onChange={e => onCampo('aislamiento', e.target.value)}
                                className={caja(suyo('aislamiento'), '')}>
                            {AISLAMIENTOS_CE3X.map(x => <option key={x} value={x}>{x}</option>)}
                        </select>
                    </Editable>
                </>
            ) : (
                num('rend_nominal', 'Rendimiento nominal', '%',
                    { step: '1', min: '0', value: v('rend_nominal', t.nominal) })
            )}

            {/* DEMANDA CUBIERTA, servicio a servicio. La superficie también se
                reparte: en el `.cex` medido la caldera da los 165 m² de
                calefacción y solo 82,5 de ACS, porque el resto lo da el termo. */}
            <p className="col-span-full mt-1 text-[10px] font-bold uppercase
                          tracking-widest text-white/35">
                Demanda cubierta
            </p>
            {t.servicios.map(serv => (
                <Servicio key={serv} serv={serv} eq={eq} superficie={superficie}
                          suyo={suyo} onCampo={onCampo} />
            ))}

            {t.servicios.includes('acs') && (
                <>
                    <label className="col-span-full flex items-center gap-2 text-[12px] text-white/70">
                        <input type="checkbox" checked={acumula}
                               onChange={e => onCampo('acumulacion', e.target.checked)}
                               className="h-3.5 w-3.5 accent-[var(--brand)]" />
                        Con acumulación
                    </label>
                    {acumula && (
                        <Editable rotulo="Volumen del depósito" unidad="litros"
                                  suyo={suyo('litros_acumulacion')}
                                  onDeshacer={() => onCampo('litros_acumulacion', null)}>
                            <CampoDecimal
                                   valor={puesto.litros_acumulacion
                                       ?? eq?.acumulacion?.volumen ?? ''}
                                   aria-label="Litros del depósito"
                                   onCambio={n => onCampo('litros_acumulacion', n)}
                                   alVaciar={() => onCampo('litros_acumulacion', '')}
                                   className={caja(suyo('litros_acumulacion'), 'w-[92px]')} />
                        </Editable>
                    )}
                </>
            )}
        </dl>
    );
}

const ROTULO_SERVICIO = { acs: 'ACS', calefaccion: 'Calefacción',
                          refrigeracion: 'Refrigeración' };

/** La superficie y el porcentaje que este equipo cubre de UN servicio. */
function Servicio({ serv, eq, superficie, suyo, onCampo }) {
    const kSup = `superficie_${serv}`;
    const kPct = `pct_${serv}`;
    return (
        <>
            <Editable rotulo={`${ROTULO_SERVICIO[serv]} · superficie`} unidad="m²"
                      suyo={suyo(kSup)} onDeshacer={() => onCampo(kSup, null)}>
                <CampoDecimal
                       valor={eq?.[kSup] ?? superficie ?? ''}
                       aria-label={`superficie de ${ROTULO_SERVICIO[serv]}`}
                       onCambio={n => onCampo(kSup, n)}
                       alVaciar={() => onCampo(kSup, '')}
                       className={caja(suyo(kSup), 'w-[92px]')} />
            </Editable>
            <Editable rotulo={`${ROTULO_SERVICIO[serv]} · porcentaje`} unidad="%"
                      suyo={suyo(kPct)} onDeshacer={() => onCampo(kPct, null)}>
                <CampoDecimal valor={eq?.[kPct] ?? 100}
                       aria-label={`porcentaje de ${ROTULO_SERVICIO[serv]}`}
                       onCambio={n => onCampo(kPct, n)}
                       alVaciar={() => onCampo(kPct, '')}
                       className={caja(suyo(kPct), 'w-[76px]')} />
            </Editable>
        </>
    );
}

/**
 * Cuánta demanda cubren ENTRE TODOS, servicio a servicio.
 *
 * Es lo que hay que poder ver sin abrir las tarjetas: pasarse del 100 % declara
 * más demanda cubierta de la que hay, y quedarse corto casi siempre es que falta
 * un equipo por añadir. El motor lo repite en sus avisos —esa es la comprobación
 * que manda, porque la hace sobre lo que de verdad se escribe— y aquí se dice
 * mientras se teclea, que es cuando se puede arreglar.
 */
function Reparto({ equipos }) {
    const suma = {};
    for (const eq of equipos) {
        for (const serv of tipoEquipo(eq?.slot).servicios) {
            if (!eq?.nombre) continue;
            const p = Number(eq[`pct_${serv}`] ?? 100);
            suma[serv] = (suma[serv] || 0) + (Number.isFinite(p) ? p : 100);
        }
    }
    const filas = Object.entries(suma);
    if (!filas.length) return null;
    return (
        <div className="rounded-xl border border-white/[0.07] px-4 py-2.5">
            <p className="mb-1.5 text-[11px] font-bold text-brand">Demanda cubierta en total</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1">
                {filas.map(([serv, total]) => (
                    <span key={serv} className="text-[12px] text-white/60">
                        {ROTULO_SERVICIO[serv]}{' '}
                        <b className={`tabular-nums ${total > 100 ? 'text-red-400'
                            : total < 100 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {Math.round(total * 10) / 10} %
                        </b>
                    </span>
                ))}
            </div>
            {filas.some(([, t]) => t > 100) && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-red-300">
                    Se pasa del 100 %: el certificado declararía más demanda cubierta de la que
                    hay. Repasa los porcentajes.
                </p>
            )}
            {filas.some(([, t]) => t < 100) && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-amber-200/80">
                    Queda demanda sin cubrir. Si hay otro aparato —un termo, un aire
                    acondicionado—, añádelo aquí.
                </p>
            )}
        </div>
    );
}

/** «+ Añadir»: el tipo se elige al añadir, porque decide qué campos pide. */
function Anadir({ onAnadir }) {
    const [abierto, setAbierto] = useState(false);
    if (!abierto) {
        return (
            <button onClick={() => setAbierto(true)}
                    className="self-start rounded-lg border border-dashed border-white/15 px-3 py-2
                               text-[11px] font-bold uppercase tracking-wider text-white/45
                               hover:border-brand/50 hover:text-brand">
                + Añadir equipo
            </button>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed
                        border-white/15 px-3 py-2.5">
            <span className="mr-1 text-[11px] text-white/45">¿Qué equipo?</span>
            {TIPOS_EQUIPO_CE3X.map(t => (
                <button key={t.valor}
                        onClick={() => { onAnadir?.(t.valor); setAbierto(false); }}
                        className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px]
                                   text-white/70 hover:border-brand/50 hover:text-brand">
                    {t.etiqueta}
                </button>
            ))}
            <button onClick={() => setAbierto(false)}
                    className="ml-auto text-[10px] uppercase tracking-wider text-white/35
                               hover:text-white/70">
                cancelar
            </button>
        </div>
    );
}

const caja = (propio, ancho) => `${ancho} rounded-md border bg-white/[0.04] px-2 py-1 `
    + `text-[12.5px] font-bold ${propio ? 'border-brand/60 text-brand' : 'border-white/10'}`;

/**
 * Un desplegable de CE3X, con lo COMPROBADO separado de lo que no.
 *
 * Las dos mitades van en `optgroup` y no mezcladas: al elegir una de abajo sale
 * un aviso de la ficha diciendo que hay que comprobar que CE3X la reconoce, y el
 * rótulo del grupo es lo que explica ese aviso antes de que aparezca.
 */
function Desplegable({ lista, valor, propio, onCambio }) {
    const vistos = lista.filter(x => x.visto);
    const otros = lista.filter(x => !x.visto);
    return (
        <select value={valor || ''} onChange={e => onCambio(e.target.value)}
                className={caja(propio, '')}>
            <option value="">—</option>
            <optgroup label="Comprobadas en un .cex real">
                {vistos.map(x => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
            </optgroup>
            <optgroup label="Del desplegable de CE3X, sin comprobar">
                {otros.map(x => <option key={x.valor} value={x.valor}>{x.etiqueta}</option>)}
            </optgroup>
        </select>
    );
}

/** Un campo con su rótulo, su unidad y el «deshacer» cuando se ha tocado. */
function Editable({ rotulo, unidad, suyo, onDeshacer, ancho, children }) {
    return (
        <div className={`flex items-center gap-2 text-[12px] ${ancho ? 'md:col-span-2' : ''}`}>
            <dt className="w-44 shrink-0 text-white/45">{rotulo}</dt>
            <dd className="flex min-w-0 flex-1 items-center gap-2">
                {children}
                {unidad && <span className="text-[11px] text-white/30">{unidad}</span>}
                {suyo && (
                    <button onClick={onDeshacer}
                            className="text-[10px] text-white/35 hover:text-white/70">
                        deshacer
                    </button>
                )}
            </dd>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Las MEDIDAS DE MEJORA que se escriben en el .cex.
//
// Se ELIGEN, no se rellenan solas: un certificado puede proponer una, las dos o
// ninguna, y quien lo firma decide. Vienen marcadas las que describen la fase
// —la aerotermia en el inicial, el autoconsumo en el final—, que es lo que se
// quiere casi siempre; desmarcarlas es un clic.
//
// REGLA — lo que NO procede se enseña, apagado y CON SU MOTIVO. Una medida que
// desaparece de la lista sin explicación se lee como un olvido, y el motivo es
// justo lo que hay que leer: «la vivienda ya tiene placas» no es un fallo, es la
// razón por la que ese certificado declara la fotovoltaica en otro sitio.
//
// REGLA — el TEXTO que se va a volcar se ve, y se puede reescribir. Son los tres
// campos del diálogo «Conjunto de medidas de mejora» de CE3X (nombre,
// características, otros datos) y son TEXTO: lo que compone la app es un
// borrador razonable, no un dato medido, y quien firma tiene que poder decirlo
// con sus palabras sin abrir el .cex para corregirlo después.
// ─────────────────────────────────────────────────────────────────────────────
export function PanelMedidas({ catalogo, elegidas, onElegir, fase = 'inicial', onFase,
                               textos = {}, onTexto, dosFases = true }) {
    const [abierta, setAbierta] = useState(null);
    // Sin elección a mano manda lo que trae marcado la fase.
    const marcadas = elegidas || (catalogo || []).filter(m => m.porDefecto).map(m => m.id);
    const alternar = (id) => {
        const hay = marcadas.includes(id);
        onElegir(hay ? marcadas.filter(x => x !== id) : [...marcadas, id]);
    };
    const n = marcadas.length;

    return (
        <Ventana titulo="Medidas de mejora">
            <SelectorFase fase={fase} onFase={onFase} dosFases={dosFases} />

            <div>
                <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">
                        Medidas de mejora
                    </p>
                    <span className={`text-[10.5px] ${n ? 'text-white/35' : 'text-amber-400/80'}`}>
                        {n === 0 ? 'ninguna: el .cex sale sin medidas'
                            : n === 1 ? '1 se escribe' : `${n} se escriben`}
                    </span>
                </div>

                <div className="mt-2 space-y-1.5">
                    {(catalogo || []).map(m => {
                        const puesta = marcadas.includes(m.id);
                        const suyo = textos[m.id] || {};
                        return (
                            <div key={m.id}
                                 className={`rounded-lg border px-3 py-2 ${!m.disponible
                                     ? 'border-white/[0.05] bg-white/[0.01] opacity-60'
                                     : puesta ? 'border-brand/40 bg-brand/[0.07]'
                                              : 'border-white/[0.07] bg-white/[0.02]'}`}>
                                <div className="flex gap-2.5">
                                    {/* La casilla y su rótulo van en un `label` suyo: con
                                        la tarjeta entera de `label`, desplegar el texto
                                        marcaba la medida. */}
                                    <input type="checkbox" id={`medida-${m.id}`}
                                           checked={puesta && m.disponible}
                                           disabled={!m.disponible}
                                           onChange={() => alternar(m.id)}
                                           className="mt-0.5 h-3.5 w-3.5 shrink-0
                                                      accent-[var(--brand)]" />
                                    <label htmlFor={`medida-${m.id}`}
                                           className={`min-w-0 ${m.disponible ? 'cursor-pointer' : ''}`}>
                                        <span className="block text-[12.5px] font-semibold text-white/80">
                                            {m.titulo}
                                        </span>
                                        <span className="block truncate text-[11px] text-white/40">
                                            {m.resumen}
                                        </span>
                                        {(m.motivo || (puesta && m.nota)) && (
                                            <span className={`mt-1 block text-[10.5px] leading-relaxed ${
                                                m.motivo ? 'text-white/35' : 'text-amber-200/70'}`}>
                                                {m.motivo || m.nota}
                                            </span>
                                        )}
                                    </label>

                                    {m.datos && (
                                        <button
                                            onClick={() => setAbierta(abierta === m.id ? null : m.id)}
                                            className="ml-auto shrink-0 self-start rounded-md border
                                                       border-white/10 px-2 py-1 text-[10px] font-bold
                                                       uppercase tracking-wider text-white/45
                                                       hover:border-white/30 hover:text-white">
                                            {abierta === m.id ? 'Ocultar' : 'Ver el texto'}
                                        </button>
                                    )}
                                </div>

                                {abierta === m.id && m.datos && (
                                    <TextoMedida datos={m.datos} suyo={suyo}
                                                 onTexto={(campo, v) => onTexto?.(m.id, campo, v)} />
                                )}
                            </div>
                        );
                    })}
                </div>

                <p className="mt-2 text-[10.5px] leading-relaxed text-white/30">
                    Van DEFINIDAS y sin calcular: su ahorro y su calificación los pone CE3X al
                    abrir Medidas de Mejora y pulsar Actualizar. Lo marcado se escribe en el
                    .cex {fase === 'final' ? 'FINAL' : 'INICIAL'}.
                </p>
            </div>
        </Ventana>
    );
}

/**
 * El texto TAL CUAL se va a volcar, y editable.
 *
 * Son los tres campos del diálogo «Conjunto de medidas de mejora» de CE3X, con
 * sus mismos rótulos. Lo que se reescriba manda sobre lo compuesto y se guarda
 * con el trabajo; «volver al texto de la app» lo deshace.
 */
function TextoMedida({ datos, suyo, onTexto }) {
    const campos = [
        ['nombre', 'Nombre conjunto medidas mejora', 1],
        ['caracteristicas', 'Características', 4],
        ['otros_datos', 'Otros datos', 2],
    ];
    return (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-white/[0.07] pt-2.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                Lo que se escribe en el .cex
            </p>
            {campos.map(([k, rotulo, filas]) => {
                const propio = suyo[k] !== undefined;
                return (
                    <label key={k} className="flex flex-col gap-1">
                        <span className="flex items-baseline gap-2">
                            <span className="text-[10.5px] text-white/45">{rotulo}</span>
                            {propio && (
                                <button onClick={() => onTexto(k, null)}
                                        className="text-[10px] text-white/35 hover:text-white/70">
                                    volver al texto de la app
                                </button>
                            )}
                        </span>
                        {/* `no-uppercase`: la regla global de `index.css` pone en
                            MAYÚSCULAS todo `input` y `textarea`, y esto son frases en
                            castellano que se leen tal cual dentro del certificado.
                            Con ella puestas, la pantalla enseñaba una cosa y el
                            fichero llevaba otra. */}
                        {filas === 1 ? (
                            <input value={datos[k] || ''} aria-label={rotulo}
                                   onChange={e => onTexto(k, e.target.value)}
                                   className={`no-uppercase w-full rounded-md border
                                               bg-white/[0.04] px-2 py-1.5 text-[12px]
                                       ${propio ? 'border-brand/60 text-brand' : 'border-white/10'}`} />
                        ) : (
                            <textarea
                                rows={filas} value={datos[k] || ''} aria-label={rotulo}
                                onChange={e => onTexto(k, e.target.value)}
                                className={`no-uppercase w-full resize-y rounded-md border
                                            bg-white/[0.04] px-2 py-1.5 text-[12px] leading-relaxed
                                    ${propio ? 'border-brand/60 text-brand' : 'border-white/10'}`} />
                        )}
                    </label>
                );
            })}
            <p className="text-[10.5px] leading-relaxed text-white/30">
                Inversión {miles(datos.inversion)} € · vida útil {datos.vida_util || 0} años ·
                mantenimiento {miles(datos.coste_mantenimiento)} €. Esos tres los pone la app y
                no se teclean aquí: salen del expediente.
            </p>
        </div>
    );
}

const miles = (n) => (Number(n) || 0).toLocaleString('es-ES');

/** ANÁLISIS ECONÓMICO: el único apartado que aquí no se escribe. */
export function PanelEconomico() {
    return (
        <Ventana titulo="Análisis económico">
            <p className="text-[12.5px] leading-relaxed text-white/45">
                Lo calcula <b className="text-white/70">CE3X</b> al abrir el <code>.cex</code>,
                con las medidas de mejora ya definidas. Aquí no se escribe nada de este
                apartado: llega al fichero sin calcular, igual que llegaría si lo montaras a
                mano, y se rellena al pulsar <i>Actualizar</i> dentro de CE3X.
            </p>
        </Ventana>
    );
}

// ─── Piezas ──────────────────────────────────────────────────────────────────

/** El marco de una ventana: su título y, si hace falta, su nota al pie. */
export function Ventana({ titulo, pie, children }) {
    return (
        <section className="flex flex-col gap-4 rounded-2xl border border-white/[0.06]
                            bg-white/[0.02] p-4">
            <h2 className="text-[13px] font-black uppercase tracking-widest text-white/70">
                {titulo}
            </h2>
            {children}
            {pie && <p className="text-[10.5px] leading-relaxed text-white/30">{pie}</p>}
        </section>
    );
}

/** Un recuadro con título, como los de CE3X. */
function Grupo({ titulo, accion, children }) {
    return (
        <div className="rounded-xl border border-white/[0.07] px-4 pb-3 pt-2.5">
            <div className="mb-2 flex min-h-[22px] items-center justify-between gap-3">
                <p className="text-[11px] font-bold text-brand">{titulo}</p>
                {accion}
            </div>
            <dl className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">{children}</dl>
        </div>
    );
}

/** Un dato de solo lectura. Lo que falta se dice; no se deja en blanco. */
function Fila({ rotulo, v, de, ancho }) {
    return (
        <div className={`flex items-baseline gap-2 text-[12px] ${ancho ? 'md:col-span-2' : ''}`}>
            <dt className="w-44 shrink-0 text-white/45">{rotulo}</dt>
            <dd className={`min-w-0 break-words ${v ? 'text-white/85' : 'text-amber-300/90'}`}>
                {v || 'no consta'}
                {/* De dónde sale, solo cuando NO es lo obvio: un teléfono que
                    es el de la persona de contacto y no el del titular hay que
                    poder verlo sin abrir la ficha del cliente. */}
                {v && de && (
                    <span className="ml-2 text-[10.5px] text-white/30">{de}</span>
                )}
            </dd>
        </div>
    );
}

/**
 * Un dato DERIVADO y editable.
 *
 * Enseña de dónde sale mientras nadie lo toque, y en cuanto se cambia pasa a
 * decir que lo puso el certificador y ofrece deshacerlo: un valor a mano tiene
 * que distinguirse de uno derivado sin tener que acordarse.
 */
function Campo({ c, v, puesto, onCambiar }) {
    const suyo = puesto !== undefined;
    return (
        <div className="flex items-center gap-2 text-[12px]">
            <dt className="w-44 shrink-0 text-white/45">{c.etiqueta}</dt>
            <dd className="flex min-w-0 items-center gap-2">
                {c.opciones ? (
                    <select
                        value={puesto ?? v?.valor ?? ''} aria-label={c.etiqueta}
                        onChange={e => onCambiar?.(c.k, e.target.value || null)}
                        className={`rounded-md border bg-white/[0.04] px-2 py-1 text-[12.5px]
                                    font-bold
                            ${suyo ? 'border-brand/60 text-brand' : 'border-white/10'}`}>
                        <option value="">—</option>
                        {c.opciones.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                ) : (
                    <input
                        // Eco INMEDIATO de lo tecleado: la ficha vuelve del
                        // servidor medio segundo después y hasta entonces el
                        // campo parecería no responder.
                        type={c.tipo || 'text'} step={c.paso}
                        value={puesto ?? v?.valor ?? ''} aria-label={c.etiqueta}
                        onChange={e => onCambiar?.(c.k, e.target.value === ''
                            ? null
                            : (c.tipo === 'number' ? Number(e.target.value) : e.target.value))}
                        // Un número cabe en 96 px; un texto no: la regla global de
                        // `index.css` pone los `input` en MAYÚSCULAS y «Unifamiliar»
                        // se cortaba en «UNIFAMIL».
                        className={`rounded-md border bg-white/[0.04] px-2 py-1 text-[12.5px]
                                    font-bold tabular-nums
                            ${c.tipo === 'number' ? 'w-[96px]' : 'w-[152px]'}
                            ${suyo ? 'border-brand/60 text-brand' : 'border-white/10'}`} />
                )}
                {c.unidad && <span className="text-[11px] text-white/30">{c.unidad}</span>}
                {suyo
                    ? <button onClick={() => onCambiar?.(c.k, null)}
                              className="text-[10px] text-white/35 hover:text-white/70">
                          deshacer
                      </button>
                    : <span className="truncate text-[10.5px] text-white/30">{v?.de}</span>}
            </dd>
        </div>
    );
}

/**
 * El conmutador de FASE.
 *
 * La envolvente es la misma en las dos —la obra no la toca—: lo único que
 * cambia es el generador que se escribe, así que solo aparece donde eso se ve.
 *
 * `dosFases` a false lo quita entero: en un CEE contratado de ALCANCE ÚNICO no
 * hay un después, y su fichero se llamaría igual que el de la fase inicial —el
 * «final» archivaría al otro en OLD sin que nadie lo pidiera.
 */
export function SelectorFase({ fase = 'inicial', onFase, dosFases = true }) {
    if (!dosFases) return null;
    return (
        <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest">
            {[['inicial', 'CEE inicial · caldera'],
              ['final', 'CEE final · aerotermia']].map(([k, txt]) => (
                <button key={k} onClick={() => onFase?.(k)}
                        className={`rounded-lg px-2.5 py-1.5 transition
                            ${fase === k ? 'bg-brand/15 text-brand'
                                         : 'text-white/35 hover:text-white/70'}`}>
                    {txt}
                </button>
            ))}
        </div>
    );
}

export default PanelAdministrativos;
