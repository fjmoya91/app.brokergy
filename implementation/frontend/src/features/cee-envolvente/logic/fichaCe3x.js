import { getUByYear, getVentanaYACHByYear, BOILER_EFFICIENCIES }
    from '../../calculator/logic/calculation.js';
import { resolverCe3x, buildMedidaMejora } from '../../expedientes/logic/ce3xFinal.js';
import { PRUEBAS_CERTIFICADOR, OTROS_DATOS_MEDIDA, MEDIDA_AUTOCONSUMO,
         techoAutoconsumo } from '../../expedientes/logic/ce3xTextos.js';
import { normalizarFotovoltaica } from '../../expedientes/logic/fotovoltaica.js';
import { EQUIPO_NUEVO, RENDIMIENTO_JOULE }
    from '../../expedientes/logic/aerotermiaUnits.js';
import { contactoCliente, deQuienEs } from '../../../utils/contactoCliente.js';

// ─────────────────────────────────────────────────────────────────────────────
// La ficha del certificador: lo que el `.cex` necesita ALREDEDOR de la
// envolvente medida (titular, zona climática, transmitancias) y que el motor
// no puede saber porque no está en Catastro.
//
// Es fuente única y la cargan los DOS lados: la vista, para enseñar lo que se
// va a escribir, y el backend por `import()` ESM al generar — igual que
// `cifoService` con `cifoDoc.js`. Si cada uno compusiera la suya, lo que se
// revisa en pantalla y lo que se escribe en el fichero podrían no coincidir.
//
// REGLA — las transmitancias son las MISMAS que estudiaron la oportunidad.
// Salen de `getUByYear`, que ya implementa la Guía de Transmitancias de
// BROKERGY valor a valor. No se copia aquí ninguna U: se importa. Un `.cex`
// con transmitancias distintas de las que se usaron para prometerle el ahorro
// al cliente es un certificado que contradice su propia propuesta.
//
// REGLA — lo que NO se puede derivar sale con su valor por defecto DECLARADO y
// dice que lo es (`de:`). No hay ni un dato mudo: cada valor lleva de dónde
// viene, y eso vuelve como aviso antes de firmar.
// ─────────────────────────────────────────────────────────────────────────────

//: PARTICIÓN interior por época — lo ÚNICO de la guía (§2) que la calculadora
//: no usa, porque una partición con un espacio no habitable no entra en la
//: demanda que se simula. Verificado contra el `.cex` que un certificador hizo
//: a mano para 26RES060_186 (año 1994): 2,00 en las dos particiones.
const U_PARTICION = [
    { desde: 2014, u: 1.60 },   // CTE 2013
    { desde: 2008, u: 1.80 },   // CTE 2006
    { desde: 1991, u: 2.00 },   // NBE-CT-79 consolidada
    { desde: 1979, u: 2.10 },   // NBE-CT-79 transición
    { desde: 1960, u: 2.20 },   // pre-normativa
    { desde: 0,    u: 2.56 },   // anterior a 1960
];

//: Masa superficial (kg/m²) de cada elemento. CE3X la usa para la inercia
//: térmica y NO está en la guía, que solo habla de U. Son las del `.cex` real
//: de 26RES060_186, hecho a mano por el certificador.
const MASA = {
    fachada: 200, medianera: 200, cubierta: 100,
    suelo: 750, particion_h: 500, particion_v: 60,
};

//: El desplegable de normativa de CE3X, con sus cadenas EXACTAS. Medidas sobre
//: el corpus de 1.188 `.cex` reales (NBE-CT-79 538 · Anterior 315 · C.T.E. 140
//: · CTE 2013 40). No hay opción para el CTE 2019: un edificio de 2020 se
//: escribe como CTE 2013 aunque su U sea la de nZEB.
//: Vida util de la medida, en anos. Es la D_i de la ficha RES060 — la misma
//: con la que se calculo el CAE de este expediente.
export const VIDA_UTIL_MEDIDA = 15;

export function normativaCe3x(anio) {
    if (anio >= 2014) return 'CTE 2013';
    if (anio >= 2008) return 'C.T.E.';
    if (anio >= 1979) return 'NBE-CT-79';
    return 'Anterior';
}

/**
 * El bloque `termicas` del `.cex`.
 *
 * `particionArriba` dice dónde está el espacio no habitable, y no es un
 * detalle: el tipo de espacio y el sentido van EMPAREJADOS en CE3X —
 * 'Garaje/espacio enterrado' solo sale hacia abajo—, así que escribirlo al
 * revés no es un matiz de redacción, es un cerramiento que CE3X lee mal.
 */
/**
 * @param retoques U puestas a mano por el certificador, por elemento
 *   (`{ fachada: 1.9 }`). MANDAN sobre la tabla: él tiene el edificio delante y
 *   puede haber visto una cámara sin aislar o un proyecto que lo acredite. Cada
 *   una queda marcada como suya en `_retocadas`, que va a los avisos: un valor
 *   que no sale de la guía tiene que constar.
 */
export function transmitancias(anio, zona, { particionArriba = true, retoques } = {}) {
    const u = getUByYear(anio, zona);
    const uPart = (U_PARTICION.find(p => anio >= p.desde) || U_PARTICION[U_PARTICION.length - 1]).u;
    const guia = `Guía de Transmitancias BROKERGY (${normativaCe3x(anio)}, ${anio}` +
                 `${anio >= 2008 && anio < 2014 ? `, zona ${zona}` : ''}) — la MISMA U que usó la simulación`;

    const base = {
        _de: guia,
        fachada: { u: u.wall, masa: MASA.fachada, modo: 'Conocidas' },
        // Adiabática: al otro lado hay vivienda a la misma temperatura. Si el
        // certificador sabe que hay un garaje, la marca como partición y
        // entonces sí lleva U — lo resuelve `medianeras_como_particion`.
        medianera: { u: 0, masa: MASA.medianera, modo: '(sin bloque)' },
        cubierta: { u: u.roof, masa: MASA.cubierta, modo: 'Conocidas', forma: 'Cubierta plana' },
        // El suelo contra terreno va SIEMPRE 'Por defecto': de los 15.704
        // cerramientos del corpus ni uno solo lo tiene en 'Conocidas'. CE3X
        // modela el terreno aparte.
        suelo_terreno: { u: u.floor, masa: MASA.suelo, modo: 'Por defecto' },
        particion_superior: {
            u: uPart, masa: MASA.particion_h, modo: 'Conocidas',
            tipo_espacio: particionArriba ? 'Otro' : 'Garaje/espacio enterrado',
            sentido: particionArriba ? 'horizontal superior' : 'horizontal inferior',
        },
        particion_vertical: { u: uPart, masa: MASA.particion_v, modo: 'Conocidas', tipo_espacio: '' },
    };

    const retocadas = [];
    for (const [elemento, valor] of Object.entries(retoques || {})) {
        const n = Number(valor);
        if (!base[elemento] || !Number.isFinite(n) || n < 0) continue;
        if (Math.abs(n - base[elemento].u) < 1e-9) continue;
        retocadas.push(`${ETIQUETA_U[elemento] || elemento}: ${fmtU(n)} en vez de `
                       + `${fmtU(base[elemento].u)} (puesta a mano)`);
        base[elemento] = { ...base[elemento], u: n };
    }
    if (retocadas.length) base._retocadas = retocadas;
    return base;
}

//: Cómo se llama cada elemento en pantalla. El mismo rótulo en los avisos y en
//: el formulario: si no, el certificador no sabe cuál acaba de cambiar.
export const ETIQUETA_U = {
    fachada: 'Fachada',
    cubierta: 'Cubierta',
    suelo_terreno: 'Suelo',
    particion_superior: 'Particiones',
    particion_vertical: 'Partición vertical',
    medianera: 'Medianera',
};

const fmtU = n => Number(n).toFixed(2).replace('.', ',');

//: Lo que NO sale de ningún dato y decide el certificador. Los valores son los
//: de los expedientes ya emitidos (26RES060_186 y 26RES060_187 coinciden en
//: los tres), no una invención — pero siguen siendo decisiones, y por eso van
//: a la vista para que se confirmen.
export const AJUSTES_POR_DEFECTO = {
    demanda_acs: 140,
    masa_particiones: 'Pesada',
    tipo_edificio: 'Unifamiliar',
};

// ─── La instalación que YA HAY: la caldera que se va a sustituir ─────────────

//: Cómo se llama cada combustible en el desplegable de CE3X. Están LEÍDAS de
//: `.cex` guardados por el propio CE3X con cada combustible
//: (`ejemplos/GAS_NATURAL.cex`, `CARBON.cex`, `PELLETS.cex`, `GLP.cex`), no
//: deducidas: `BiomasaDens` no se parece a nada que se hubiera adivinado, y
//: `Gasóleo-C` lleva su guion.
//:
//: REGLA — una cadena que CE3X no reconozca deja el campo vacío en el
//: certificado SIN decir nada, así que lo que no esté verificado no se escribe:
//: se avisa y lo elige el técnico, que son dos clics. Adivinarla es peor.
//:
//: ⚠️ ELECTRICIDAD sigue sin confirmar: `ELECTRICIDAD.cex` es byte a byte
//: idéntico a `CARBON.cex` (mismo MD5), así que se guardó sin tocar el
//: desplegable. Puede que una caldera eléctrica no se declare como «Caldera
//: Estándar» sino por efecto Joule, y entonces no lleva combustible.
const COMBUSTIBLE_CE3X = {
    gasoleo: 'Gasóleo-C',
    gas_natural: 'Gas Natural',
    carbon: 'Carbón',
    pellets: 'BiomasaDens',
    glp: 'GLP',
};

//: De qué combustible es cada caldera de la tabla. Ojo: el `boilerId` del
//: carbón y el de la biomasa es el MISMO (`solid_*`) —lo dice `boilerMapping`—
//: y lo que los separa es `fuelType`, que la oportunidad SÍ guarda (comprobado
//: en 26RES060_OP181: «carbon»).
function combustiblePorId(id) {
    const s = String(id || '');
    if (s.startsWith('gas_')) return 'gas_natural';
    if (s.startsWith('oil_')) return 'gasoleo';
    if (s === 'electric') return 'electricidad';
    return null;                 // solid_*: carbón o biomasa, lo dice fuelType
}

//: Lo que CE3X entiende por el tipo de equipo: los cinco `.cex` reales con
//: instalación dicen «Caldera Estándar».
const GENERADOR_CALDERA = 'Caldera Estándar';

//: El aislamiento de la caldera no se ve en la foto de una placa, así que se
//: declara el caso DESFAVORABLE — que es lo que pusieron los certificadores en
//: los dos expedientes reales. Es una hipótesis, y sale dicho.
const AISLAMIENTO_POR_DEFECTO = 'Sin aislamiento';

const NOMBRE_COMBUSTIBLE = {
    gas_natural: 'gas natural', gasoleo: 'gasóleo', electricidad: 'electricidad',
    carbon: 'carbón', pellets: 'biomasa (pélets)',
};

// ─────────────────────────────────────────────────────────────────────────────
// Los desplegables de CE3X del equipo, y cuáles están COMPROBADAS.
//
// REGLA — la cadena que se escribe es la del FICHERO, no el rótulo del
// desplegable. No son la misma: «Biomasa densificada (pelets)» se guarda como
// `BiomasaDens`. Por eso cada opción lleva su etiqueta y su valor por separado.
//
// REGLA — lo que no se ha visto en un `.cex` real se OFRECE, pero se dice. No
// ofrecerlo sería peor: sin «Caldera Condensación» no se puede declarar la
// caldera más común de los últimos veinte años. Lo que se hace es marcarlo y
// sacar un aviso, para que se compruebe al abrir el fichero en CE3X.
// ─────────────────────────────────────────────────────────────────────────────
export const GENERADORES_CE3X = [
    { valor: 'Caldera Estándar', etiqueta: 'Caldera Estándar', visto: true },
    { valor: 'Bomba de Calor - Caudal Ref. Variable',
      etiqueta: 'Bomba de Calor - Caudal Ref. Variable', visto: true },
    { valor: 'Efecto Joule', etiqueta: 'Efecto Joule', visto: true },
    //: Así, SIN tilde en «Maquina»: es como lo escribe el fichero, aunque el
    //: desplegable de CE3X lo enseñe con ella.
    { valor: 'Maquina frigorífica', etiqueta: 'Máquina frigorífica', visto: true },
    { valor: 'Caldera Condensación', etiqueta: 'Caldera Condensación' },
    { valor: 'Caldera Baja Temperatura', etiqueta: 'Caldera Baja Temperatura' },
    { valor: 'Bomba de Calor', etiqueta: 'Bomba de Calor' },
    { valor: 'Equipo de Rendimiento Constante', etiqueta: 'Equipo de Rendimiento Constante' },
];

export const COMBUSTIBLES_CE3X = [
    { valor: 'Gas Natural', etiqueta: 'Gas Natural', visto: true },
    { valor: 'Gasóleo-C', etiqueta: 'Gasóleo-C', visto: true },
    { valor: 'Electricidad', etiqueta: 'Electricidad', visto: true },
    { valor: 'GLP', etiqueta: 'GLP', visto: true },
    { valor: 'Carbón', etiqueta: 'Carbón', visto: true },
    //: El rótulo del desplegable dice «Biomasa densificada (pelets)» y el
    //: fichero guarda `BiomasaDens`. Es EL ejemplo de por qué esta tabla existe.
    { valor: 'BiomasaDens', etiqueta: 'Biomasa densificada (pelets)', visto: true },
    { valor: 'Biocarburante', etiqueta: 'Biocarburante' },
    { valor: 'BiomasaNoDens', etiqueta: 'Biomasa no densificada' },
];

//: Cómo declara CE3X el aislamiento de la caldera. Son las cuatro de
//: `K_ESTACIONAL` en el motor, medidas sobre el corpus.
export const AISLAMIENTOS_CE3X = [
    'Sin aislamiento', 'Antigua con mal aislamiento',
    'Antigua con aislamiento medio', 'Bien aislada y mantenida',
];

//: Los cuatro escritores de equipo que tiene el motor, con sus rótulos de CE3X
//: y qué servicios da cada uno. Los otros dos del diálogo —«calefacción y
//: refrigeración» y «mixto de los tres»— NO están: su forma en el pickle no se
//: ha medido en ningún `.cex` real, y un registro con la forma equivocada CE3X
//: lo abre y no lo enseña.
export const TIPOS_EQUIPO_CE3X = [
    { valor: 'ACS', etiqueta: 'Equipo de ACS', servicios: ['acs'],
      generador: 'Efecto Joule', combustible: 'Electricidad', nominal: '100.0' },
    { valor: 'calefaccion', etiqueta: 'Equipo de sólo calefacción',
      servicios: ['calefaccion'], generador: 'Caldera Estándar' },
    { valor: 'refrigeracion', etiqueta: 'Equipo de sólo refrigeración',
      servicios: ['refrigeracion'], generador: 'Maquina frigorífica',
      combustible: 'Electricidad', nominal: '250.0' },
    { valor: 'mixto2', etiqueta: 'Equipo mixto de calefacción y ACS',
      servicios: ['calefaccion', 'acs'], generador: 'Caldera Estándar' },
];

export const tipoEquipo = (slot) =>
    TIPOS_EQUIPO_CE3X.find(t => t.valor === slot) || TIPOS_EQUIPO_CE3X[3];

//: Un equipo de caldera necesita potencia y rendimiento de combustión; uno de
//: ACS o de frío, un rendimiento nominal y ya. Es lo que separa las dos colas
//: del registro, medidas cada una en su `.cex`.
export const esDeCaldera = (slot) => slot === 'mixto2' || slot === 'calefaccion';

/**
 * Un equipo AÑADIDO a mano, con lo mínimo que el motor necesita para escribirlo.
 *
 * El caso que lo justifica: la caldera da la calefacción y la MITAD del agua, y
 * un termo eléctrico da la otra mitad. En CE3X son dos equipos, cada uno con su
 * porcentaje; aquí también.
 */
export function equipoAnadido(x, { superficie } = {}) {
    const avisos = [];
    const t = tipoEquipo(x?.slot);
    const nombre = String(x?.nombre || '').trim();
    const generador = String(x?.generador || t.generador || '').trim();
    const combustible = String(x?.combustible || t.combustible || '').trim();
    if (!nombre || !generador || !combustible) {
        avisos.push(`Un equipo añadido (${t.etiqueta}) no se escribe: le faltan nombre, `
                    + 'tipo de generador o combustible.');
        return { equipo: null, avisos };
    }
    const eq = { slot: t.valor, nombre, generador, combustible,
                 de: 'AÑADIDO A MANO por el certificador' };
    const sup = (k) => (Number(x?.[k]) > 0 ? Number(x[k]) : superficie);
    if (t.servicios.includes('acs')) {
        eq.superficie_acs = sup('superficie_acs');
        if (x?.pct_acs) eq.pct_acs = String(x.pct_acs);
    }
    if (t.servicios.includes('calefaccion')) {
        eq.superficie_calefaccion = sup('superficie_calefaccion');
        if (x?.pct_calefaccion) eq.pct_calefaccion = String(x.pct_calefaccion);
    }
    if (t.servicios.includes('refrigeracion')) {
        eq.superficie_refrigeracion = sup('superficie_refrigeracion');
        if (x?.pct_refrigeracion) eq.pct_refrigeracion = String(x.pct_refrigeracion);
    }
    if (esDeCaldera(t.valor)) {
        const potencia = String(x?.potencia || '').trim();
        if (!potencia) {
            avisos.push(`El equipo «${nombre}» no se escribe: una caldera necesita su `
                        + 'potencia nominal.');
            return { equipo: null, avisos };
        }
        eq.potencia = potencia;
        eq.rend_combustion = String(x?.rend_combustion || '90');
        eq.aislamiento = String(x?.aislamiento || AISLAMIENTO_POR_DEFECTO);
    } else {
        eq.rend_nominal = String(x?.rend_nominal || t.nominal || '100.0');
    }
    if (t.servicios.includes('acs') && x?.acumulacion && Number(x?.litros_acumulacion) > 0) {
        eq.acumulacion = { volumen: Number(x.litros_acumulacion) };
    }
    return { equipo: eq, avisos };
}

const vistoEn = (lista, v) => (lista.find(x => x.valor === v) || {}).visto === true;

/**
 * El equipo que se va a escribir, con lo que el certificador haya TECLEADO
 * encima de lo derivado.
 *
 * POR QUÉ: lo derivado sale de lo que se rellenó en la oportunidad y de la placa
 * —que es mucho—, pero no de todo. Una caldera de condensación, un depósito de
 * 150 litros o un reparto al 50 % entre dos aparatos no están en ningún campo
 * del expediente, y hasta ahora la única salida era teclearlos DENTRO de CE3X.
 *
 * REGLA — lo tecleado MANDA y sale dicho en los avisos. Es un dato que va a un
 * certificado: tiene que constar que lo puso una persona y no la app.
 *
 * REGLA — con lo tecleado se puede RESCATAR un equipo que no se escribía. Si
 * falta la potencia, la instalación existente se queda fuera del `.cex`; si
 * alguien la teclea, deja de faltar. Por eso esto se aplica también cuando
 * `instalacionExistente` ha devuelto `null`.
 */
export function equipoConAjustes(equipo, ajustes, { superficie } = {}) {
    const a = ajustes || {};
    const avisos = [];
    const tocado = (k, v) => (v !== undefined && v !== null && String(v).trim() !== ''
        ? String(v).trim() : null);

    const nombre = tocado('nombre', a.nombre) || equipo?.nombre || null;
    const generador = tocado('generador', a.generador) || equipo?.generador || null;
    const combustible = tocado('combustible', a.combustible) || equipo?.combustible || null;
    const potencia = tocado('potencia', a.potencia) || equipo?.potencia || null;
    const rend = tocado('rend_combustion', a.rend_combustion) || equipo?.rend_combustion || null;

    // ⚠️ La POTENCIA, el aislamiento y el rendimiento de combustión son de la
    // COLA que CE3X usa para ESTIMAR el rendimiento estacional de una caldera.
    // Una bomba de calor declara su SCOP ENSAYADO («Conocido») y esa cola ni
    // existe en el fichero, así que no hay dónde escribirlos.
    //
    // Exigírselos dejaba el CEE FINAL **sin ninguna instalación**: la aerotermia
    // que devuelve `instalacionNueva` no trae potencia, aquí se caía a `null`, y
    // como `ajustes` viene vacío ni siquiera salía el aviso. Un certificado sin
    // generador es justo lo que esta pantalla existe para evitar.
    const conocido = (tocado('rendimiento', a.rendimiento)
                      || equipo?.rendimiento) === 'conocido';
    const aislamiento = conocido ? null : (tocado('aislamiento', a.aislamiento)
        || equipo?.aislamiento || AISLAMIENTO_POR_DEFECTO);

    // Sin esto el motor no sabe escribirlo, y no se inventa nada.
    const faltan = [!nombre && 'el nombre', !generador && 'el tipo de generador',
                    !combustible && 'el combustible',
                    (!conocido && !potencia) && 'la potencia'].filter(Boolean);
    if (faltan.length) {
        if (Object.keys(a).length) {
            avisos.push(`El equipo sigue sin escribirse: ${faltan.length === 1
                ? 'falta' : 'faltan'} ${faltan.join(', ')}.`);
        }
        return { equipo: null, avisos };
    }

    const slot = a.slot === 'calefaccion' || a.slot === 'mixto2'
        ? a.slot : (equipo?.slot || 'mixto2');
    const daAcs = slot === 'mixto2';
    const litros = Number(a.litros_acumulacion) > 0 ? Number(a.litros_acumulacion) : null;
    const acumula = a.acumulacion === undefined ? !!equipo?.acumulacion : !!a.acumulacion;

    const nuevo = {
        ...(equipo || {}),
        slot, nombre, generador, combustible,
        //: Los tres solo cuando CE3X va a estimar: ver arriba.
        ...(aislamiento ? { aislamiento } : {}),
        ...(potencia && !conocido ? { potencia: String(potencia) } : {}),
        ...(rend && !conocido ? { rend_combustion: String(rend) } : {}),
        // La superficie servida se puede repartir: en el `.cex` medido la caldera
        // da los 165 m² de calefacción pero solo 82,5 de ACS, porque la otra
        // mitad la da el termo.
        superficie_calefaccion: Number(a.superficie_calefaccion) > 0
            ? Number(a.superficie_calefaccion)
            : (equipo?.superficie_calefaccion ?? superficie),
        ...(daAcs ? { superficie_acs: Number(a.superficie_acs) > 0
            ? Number(a.superficie_acs) : (equipo?.superficie_acs ?? superficie) } : {}),
        ...(a.pct_calefaccion ? { pct_calefaccion: String(a.pct_calefaccion) } : {}),
        ...(daAcs && a.pct_acs ? { pct_acs: String(a.pct_acs) } : {}),
    };
    // Un equipo de SOLO calefacción no lleva ni ACS ni depósito.
    if (!daAcs) { delete nuevo.superficie_acs; delete nuevo.pct_acs; delete nuevo.acumulacion; }
    else if (acumula && litros) nuevo.acumulacion = { volumen: litros };
    else if (!acumula) delete nuevo.acumulacion;

    // ── Lo que hay que decir ────────────────────────────────────────────────
    const cambios = [];
    for (const [k, rotulo] of [['nombre', 'el nombre'], ['generador', 'el tipo de generador'],
                               ['superficie_calefaccion', 'la superficie de calefacción'],
                               ['superficie_acs', 'la superficie de ACS'],
                               ['combustible', 'el combustible'], ['potencia', 'la potencia'],
                               ['rend_combustion', 'el rendimiento de combustión'],
                               ['aislamiento', 'el aislamiento'], ['slot', 'el tipo de equipo'],
                               ['pct_calefaccion', 'el % de calefacción'],
                               ['pct_acs', 'el % de ACS'], ['acumulacion', 'la acumulación'],
                               ['litros_acumulacion', 'los litros del depósito']]) {
        if (a[k] !== undefined && a[k] !== null && a[k] !== '') cambios.push(rotulo);
    }
    if (cambios.length) {
        avisos.push(`Instalación «${nombre}»: ${cambios.join(', ')} ${cambios.length === 1
            ? 'lo ha puesto' : 'los ha puesto'} a mano el certificador.`);
    }
    if (!vistoEn(GENERADORES_CE3X, generador)) {
        avisos.push(`El generador «${generador}» no se ha comprobado en ningún .cex real: `
                    + 'ábrelo en CE3X y mira que lo reconozca en Instalaciones.');
    }
    if (!vistoEn(COMBUSTIBLES_CE3X, combustible)) {
        avisos.push(`El combustible «${combustible}» no se ha comprobado en ningún .cex real: `
                    + 'ábrelo en CE3X y mira que lo reconozca en Instalaciones.');
    }
    for (const [k, rotulo] of [['pct_calefaccion', 'calefacción'], ['pct_acs', 'ACS']]) {
        const v = Number(nuevo[k]);
        if (v > 0 && v < 100) {
            avisos.push(`El equipo cubre el ${v} % de la demanda de ${rotulo}: el resto lo `
                        + 'tiene que dar otro equipo, y ese hay que añadirlo en CE3X.');
        }
    }
    if (acumula && !litros) {
        avisos.push('Se ha marcado que lleva acumulación pero no constan los litros: el '
                    + 'equipo sale SIN depósito.');
    }
    return { equipo: nuevo, avisos };
}

/**
 * La caldera existente, como equipo de CE3X.
 *
 * Sale de lo que YA se rellenó en la oportunidad: el tipo de caldera con su
 * rendimiento (`rendimiento_id`, que es el `boilerId` del funnel), el
 * combustible (`fuelType`) y si da también el ACS. Lo que no consta no se
 * escribe y se dice — aquí no se inventa un equipo.
 *
 * Devuelve `{ equipo, avisos }`; `equipo` es `null` cuando falta algo sin lo
 * que el motor no puede escribirlo.
 */
export function instalacionExistente({ expediente, superficie, litros = null } = {}) {
    const inst = expediente?.instalacion || {};
    const caldera = inst.caldera_antigua_cal || {};
    const inputs = expediente?.oportunidades?.datos_calculo?.inputs
        || expediente?.oportunidad?.datos_calculo?.inputs || {};
    const avisos = [];

    const rendId = caldera.rendimiento_id;
    if (rendId === 'sin_calefaccion') {
        return { equipo: null, falta: 'sin calefacción',
                 avisos: ['La vivienda no tiene calefacción: el .cex sale sin equipo existente.'] };
    }
    if (!rendId) {
        return { equipo: null, falta: 'falta el tipo de caldera',
                 avisos: ['No consta el tipo de caldera actual: la instalación existente '
                          + 'se pone en CE3X.'] };
    }

    const fila = BOILER_EFFICIENCIES.find(b => b.id === rendId);
    if (!fila) return { equipo: null, falta: 'caldera desconocida',
                        avisos: [`Caldera «${rendId}» desconocida.`] };

    // El GLP (propano/butano) NO tiene fila propia en `BOILER_EFFICIENCIES`: se
    // declara con una de gas, así que el `rendimiento_id` diría «gas natural» de
    // una caldera de propano. Cuando la oportunidad lo dice expresamente, manda
    // ella — es el dato que se preguntó, no uno deducido del prefijo.
    const porId = combustiblePorId(rendId);
    const clave = (porId === 'gas_natural' && inputs.fuelType === 'glp')
        ? 'glp'
        : (porId || inputs.fuelType || null);
    const combustible = COMBUSTIBLE_CE3X[clave];
    if (!combustible) {
        avisos.push('La instalación existente no se escribe: falta cómo se llama '
            + `«${NOMBRE_COMBUSTIBLE[clave] || 'ese combustible'}» en el desplegable de `
            + 'CE3X. Ponla al abrirlo.');
        return { equipo: null, falta: 'falta el combustible', avisos };
    }

    // El rendimiento de COMBUSTIÓN, de la MISMA tabla que usó la simulación: si
    // aquí se pusiera otro, el .cex y la propuesta dirían cosas distintas del
    // mismo equipo.
    const rend = Math.round((fila.value || 0) * 100);
    // `potencia_caldera` ya existe en Instalación: es la potencia nominal de la
    // caldera existente, que en un RES093 se teclea para la base del Cb. Es el
    // MISMO número, así que se mira también aquí — si no, un expediente que ya
    // lo tiene escrito volvería a pedirlo. `potencia_caldera_kw` es donde lo
    // deja el lector de la placa.
    const potencia = positivo(inst.potencia_caldera_kw)
        || positivo(inst.potencia_caldera)
        || positivo(inputs.potenciaCaldera);
    if (!potencia) {
        avisos.push('No consta la potencia de la caldera actual —está en su placa—: '
            + 'la instalación existente se pone en CE3X. Si hay foto de la placa, '
            + 'pulsa «Leer la placa».');
        return { equipo: null, falta: 'falta la potencia', avisos };
    }

    const daAcs = inst.misma_caldera_acs !== false;
    const nombre = [caldera.marca, caldera.modelo].filter(Boolean).join(' ').trim();

    // El aviso lo lee una persona en castellano: coma decimal. El valor que va al
    // `.cex` conserva el punto, que es lo que escribe CE3X en sus ficheros (`V24.0`).
    avisos.push(`Instalación existente: ${fila.label} → ${rend} % de combustión, `
        + `${combustible}, ${String(potencia).replace('.', ',')} kW. Sale de lo que se `
        + 'puso en la oportunidad: compruébalo con la placa.');
    if (!nombre) {
        avisos.push('La caldera actual no tiene marca ni modelo en el expediente: el '
            + 'equipo va como «CALDERA EXISTENTE».');
    }

    return {
        equipo: {
            slot: daAcs ? 'mixto2' : 'calefaccion',
            nombre: (nombre ? `CALDERA ${nombre}` : 'CALDERA EXISTENTE').toUpperCase(),
            generador: GENERADOR_CALDERA,
            combustible,
            aislamiento: AISLAMIENTO_POR_DEFECTO,
            rend_combustion: String(rend),
            potencia: String(potencia),
            superficie_calefaccion: superficie,
            ...(daAcs ? { superficie_acs: superficie } : {}),
            // El DEPÓSITO es del edificio, no de la caldera: no está en ningún
            // campo del expediente porque se mide en la visita, así que lo
            // contesta el certificador antes de generar. Sin él, el equipo sale
            // sin acumulación y el CEE final lo hereda así.
            ...(daAcs && litros > 0 ? { acumulacion: { volumen: litros } } : {}),
            de: `de la oportunidad: ${fila.label}. El aislamiento `
                + `«${AISLAMIENTO_POR_DEFECTO}» es la hipótesis desfavorable — `
                + 'CONFIRMAR EN VISITA.',
        },
        avisos,
    };
}

const positivo = v => (Number(v) > 0 ? Number(v) : null);

/**
 * El equipo NUEVO, para el CEE FINAL: la aerotermia que sustituye a la caldera.
 *
 * En una RES060 el CEE final es el inicial con UN solo cambio: la caldera sale y
 * entra la bomba de calor. Comprobado sobre 26RES060_186 comparando pickle a
 * pickle el `.cex` que generó la app con el que el certificador guardó a mano
 * desde CE3X: de los 15 pickles, el ÚNICO que cambia de contenido es el 4 (las
 * instalaciones). La envolvente, las transmitancias, el técnico y las imágenes
 * son literalmente los mismos.
 *
 * REGLA — los datos NO se vuelven a deducir aquí: salen de `resolverCe3x`, que
 * es lo que ya alimenta el popup «Datos del equipo» y el encargo al
 * certificador. Si esta función dedujera el SCOP o el nombre por su cuenta, el
 * `.cex` podría declarar un equipo distinto del que se le dice por WhatsApp que
 * teclee.
 *
 * REGLA — el rendimiento va como CONOCIDO, no estimado. Un SCOP viene ensayado
 * en la ficha del fabricante: CE3X no tiene nada que calcular. Medido sobre los
 * 1.506 `.cex` de producción, 132 de los 138 equipos mixtos con bomba de calor
 * lo declaran así.
 */
export function instalacionNueva({ expediente, superficie, modelos = {},
                                   existentes = null, delFichero = false } = {}) {
    const avisos = [];
    // ⚠️ CON el catálogo. Iba `{}`, y entonces todo lo que vive en el modelo y
    // no se sella en el expediente —el SEER— salía como si faltara.
    const d = resolverCe3x(expediente, { modelos });
    if (!d) {
        return { equipo: null, falta: 'falta la aerotermia',
                 avisos: ['No consta la aerotermia nueva en el expediente: el .cex '
                          + 'final sale sin instalación. Rellénala en Instalación.'] };
    }

    // En una HIBRIDACIÓN la caldera NO se retira: en CE3X son DOS generadores
    // repartiéndose la demanda, y escribir solo la bomba declararía un edificio
    // que no existe y con el 100 % de la cobertura. Hace falta la caldera tal y
    // como se escribe en esta misma fase y el reparto calculado; sin una de las
    // dos cosas no se compone y se dice cuál falta.
    // En el CEE FINAL la caldera que se queda es la del FICHERO que se copia, y
    // ahí no hace falta saber cuál es: se conserva su registro tal cual —con sus
    // rendimientos, su aislamiento y su depósito, como los dejó CE3X— y solo se
    // le cambia su parte de la demanda. Lo hace el motor (`conservar`), que es
    // quien tiene el `.cex` delante.
    if (d.hibridacion && !delFichero && !existentes?.length) {
        return { equipo: null, falta: 'hibridación: se monta a mano',
                 avisos: ['Es una HIBRIDACIÓN: la caldera se queda y son dos generadores '
                          + 'en CE3X. Aquí no consta cuál es la que sigue dando servicio, '
                          + 'así que no se compone — móntalo a mano.'] };
    }
    if (d.hibridacion && !d.repartoValido) {
        return { equipo: null, falta: 'hibridación: falta el reparto',
                 avisos: ['Es una HIBRIDACIÓN y el reparto de demanda entre la bomba y la '
                          + 'caldera no se ha podido calcular: falta la potencia de la '
                          + 'bomba (o la de la caldera, según la base). Sin él, escribir '
                          + 'la bomba al 100 % declararía una sustitución que no es.'] };
    }

    const rendCal = Math.round((d.scopCal || 0) * 100);
    const rendAcs = Math.round((d.scopAcs || 0) * 100);
    if (!rendCal) {
        return { equipo: null, falta: 'falta el SCOP',
                 avisos: ['La aerotermia no tiene SCOP en el expediente: sin él no se '
                          + 'puede declarar su rendimiento y la instalación no se escribe.'] };
    }

    // Un solo equipo MIXTO cuando la misma máquina hace las dos cosas; si no,
    // el de calefacción y se avisa de que el ACS va aparte.
    const mixto = d.acsEnMismoEquipo && rendAcs > 0;
    if (d.acsEnMismoEquipo && !rendAcs) {
        avisos.push('La aerotermia produce también el ACS pero no consta su SCOP_dhw: '
                    + 'se escribe como equipo de SOLO calefacción. Ponlo en Instalación.');
    }
    const acs = equipoDeAcs(d, superficie);
    avisos.push(...acs.avisos);
    if (d.acsFlagContradice) {
        avisos.push('El expediente dice «misma aerotermia para ACS» y a la vez declara otra '
                    + 'máquina. Se ha escrito lo que dicen los equipos: compruébalo.');
    }

    // El depósito NO se inventa: 123 de los 138 equipos con bomba de calor del
    // corpus van sin acumulación, y los litros son un dato del expediente. Si no
    // constan, se dice — es una casilla de CE3X que hay que marcar a mano.
    //
    // Y cuelga de la máquina que calienta el agua: si el ACS va aparte, el
    // depósito es SUYO (lo pone `equipoDeAcs`), no del equipo de calefacción —
    // que además es un slot de 9 campos, sin sitio donde escribirlo.
    const acumulacion = (d.litros > 0 && !d.acsAparte) ? { volumen: d.litros } : null;
    if (mixto && !acumulacion) {
        avisos.push('No consta el volumen del depósito de ACS: el equipo sale SIN '
                    + 'acumulación. Si lo lleva, márcalo en CE3X (o ponlo en Instalación).');
    }

    avisos.push(`Instalación nueva: ${d.nombre} → ${rendCal} % en calefacción`
        + (mixto ? ` y ${rendAcs} % en ACS` : '')
        + `${acumulacion ? `, con depósito de ${d.litros} l` : ''}. `
        + 'Sale de la aerotermia del expediente: compruébalo con su ficha técnica.');

    // En una sustitución la bomba cubre toda la demanda. En una HIBRIDACIÓN se
    // reparte con la caldera según el C_b, y el reparto es el MISMO en
    // calefacción y en ACS — es lo que hizo el certificador en el `.cex` de
    // 26RES093_8, del que sale esta regla.
    const pct = d.hibridacion ? (d.pctCal ?? 100) : 100;
    const sup = reparteSuperficie(superficie, pct);

    const bomba = {
        slot: mixto ? 'mixto2' : 'calefaccion',
        nombre: d.nombre,
        generador: d.generadorBdc,
        //: 138 de 138 en el corpus. Una bomba de calor va con electricidad.
        combustible: 'Electricidad',
        rendimiento: 'conocido',
        rend_calefaccion: String(rendCal),
        ...(mixto ? { rend_acs: String(rendAcs) } : {}),
        superficie_calefaccion: sup,
        ...(mixto ? { superficie_acs: sup, pct_acs: String(pct) } : {}),
        pct_calefaccion: String(pct),
        ...(acumulacion ? { acumulacion } : {}),
        de: 'de la aerotermia declarada en el expediente (la misma que el '
            + 'popup «Datos del equipo» y el encargo al certificador).',
    };

    // La caldera que se queda. En una MEDIDA DE MEJORA se copia la que escribe
    // el CEE de esa fase; en el CEE FINAL no viaja aquí — la conserva el motor
    // del propio fichero que se está copiando.
    const caldera = (d.hibridacion && !delFichero)
        ? calderaHibrida(existentes, superficie, 100 - pct, avisos) : null;
    if (d.hibridacion && delFichero) {
        avisos.push(`HIBRIDACIÓN: la caldera NO se retira del CEE final. Se conserva la `
            + `del .cex que se copia —tal y como la dejó CE3X— cubriendo el ${100 - pct} % `
            + `de la demanda, y la bomba el ${pct} % (coeficiente de bivalencia C_b).`);
    }

    return {
        extras: [...(acs.equipo ? [acs.equipo] : []), ...(caldera ? [caldera] : [])],
        equipo: bomba,
        //: Lo que el motor necesita para NO retirar el generador del fichero.
        //: Va en estructura, no dentro de un aviso.
        ...(d.hibridacion && delFichero
            ? { hibridacion: { pct_generador_previo: 100 - pct } } : {}),
        avisos,
    };
}

//: La superficie servida se reparte con el MISMO porcentaje, y con el REDONDEADO:
//: así los dos trozos suman exactamente el total. Medido en el `.cex` de
//: 26RES093_8: 123 m² → 25,83 (21 %) + 97,17 (79 %).
function reparteSuperficie(superficie, pct) {
    const total = Number(superficie) || 0;
    if (!total || pct >= 100) return total;
    return Math.round(total * pct) / 100;
}

/**
 * La CALDERA que se queda, para la medida de mejora de una hibridación.
 *
 * REGLA — no se vuelve a componer: se COPIA la que se escribe en esta misma
 * fase, tal y como la deja la pestaña de Instalaciones. Rehacerla desde el
 * expediente dejaría fuera lo que el certificador haya corregido ahí —la
 * potencia, el aislamiento, los litros del depósito— y el mismo aparato saldría
 * declarado de dos maneras distintas dentro del mismo `.cex`.
 *
 * Lo único que cambia es su parte de la demanda: 100 − C_b.
 */
function calderaHibrida(existentes, superficie, pct, avisos) {
    //: El GENERADOR, no un equipo de apoyo: el de ACS que va aparte —si lo hay—
    //: no se reparte nada, lo cubre entero él.
    const base = (existentes || []).find(
        e => e && (e.slot === 'mixto2' || e.slot === 'calefaccion'));
    if (!base) return null;
    const sup = reparteSuperficie(superficie, pct);
    const copia = {
        ...base,
        superficie_calefaccion: sup,
        pct_calefaccion: String(pct),
        ...(base.slot === 'mixto2' ? { superficie_acs: sup, pct_acs: String(pct) } : {}),
        de: 'la caldera que NO se retira, tal y como se escribe en el CEE de esta fase.',
    };
    avisos.push(`HIBRIDACIÓN: la medida lleva los DOS generadores — la bomba con el `
        + `${100 - pct} % de la demanda y «${base.nombre}» con el ${pct} % restante. `
        + 'El reparto es el coeficiente de bivalencia C_b del expediente.');
    return copia;
}

/**
 * El equipo que resuelve el ACS cuando NO lo hace la bomba de calefacción.
 *
 * POR QUÉ EXISTE: sin él, CE3X se niega a calcular — «La instalación de ACS no
 * está bien definida. El porcentaje de demanda cubierta debe ser el 100 %». Y
 * no es solo la medida de mejora: un certificado cuya agua caliente no la
 * produce nadie no se puede emitir. Pasó en 26RES060_187, con una BAXI IRIDIUM
 * 12 para calefacción y una BAXI BC ACS 150 IN para el agua: el `.cex` salía
 * con un solo equipo y un aviso pidiendo que el certificador añadiera el otro a
 * mano. Un aviso no rellena una casilla.
 *
 * En CE3X son DOS equipos, cada uno con el % de la demanda que cubre, y el que
 * se escribe aquí cubre el 100 % del ACS: es el único que la produce.
 *
 * REGLA — el rendimiento de una BOMBA DE CALOR de ACS va como CONOCIDO, y eso
 * cambia la FORMA del registro (ver `equipo_acs` en el motor). Medido: de los
 * 544 equipos del slot ACS del corpus, 205 lo declaran conocido y 183 de ellos
 * son bombas de calor. Un TERMO va como estimado al 100 % —efecto Joule, sin
 * pérdidas que descontar—, que son los 260 casos más frecuentes.
 *
 * REGLA — sin SCOP_dhw NO se escribe. Declarar «conocido» con la casilla vacía
 * es dejar el equipo tan mal definido como no ponerlo, y además inventaría un
 * rendimiento. Se dice, y el certificador lo pone en CE3X.
 */
function equipoDeAcs(d, superficie) {
    if (!d.acsAparte) return { equipo: null, avisos: [] };

    const nombre = d.nombreAcs || 'EQUIPO DE ACS';
    //: El depósito es de la máquina que calienta el agua. Si no constan los
    //: litros no se inventa uno: sale sin acumulación y se dice.
    const acumulacion = d.litros > 0 ? { volumen: d.litros } : null;
    const comun = {
        slot: 'ACS',
        nombre,
        combustible: 'Electricidad',
        superficie_acs: superficie,
        //: Lo cubre entero: es el único aparato que produce el agua caliente.
        //: Es justo lo que CE3X comprueba antes de dejar calcular.
        pct_acs: '100',
        ...(acumulacion ? { acumulacion } : {}),
        de: 'del equipo de ACS declarado en el expediente.',
    };

    if (d.acsTipo === EQUIPO_NUEVO.TERMO) {
        return {
            equipo: { ...comun, generador: 'Efecto Joule', rendimiento: 'estimado',
                      rend_nominal: String(RENDIMIENTO_JOULE * 100) },
            avisos: [`ACS aparte: se escribe «${nombre}» al 100 % de la demanda, por `
                     + 'efecto Joule (rendimiento 100 %). CE3X recalcula su estacional '
                     + 'al abrir Instalaciones.'],
        };
    }

    const rend = Math.round((d.scopAcs || 0) * 100);
    if (!rend) {
        return { equipo: null, avisos: [
            `El ACS lo resuelve OTRO equipo (${nombre}) pero no consta su SCOP_dhw: `
            + 'no se puede escribir su rendimiento y el .cex sale sin él. Ponlo en '
            + 'Instalación, o añade el equipo a mano en CE3X — sin él, CE3X no deja '
            + 'calcular («la instalación de ACS no está bien definida»).'] };
    }
    return {
        equipo: { ...comun, generador: d.generadorBdc, rendimiento: 'conocido',
                  rend_acs: String(rend) },
        avisos: [`ACS aparte: se escribe «${nombre}» al 100 % de la demanda, con `
                 + `${rend} % de rendimiento`
                 + `${acumulacion ? ` y depósito de ${d.litros} l` : ' y SIN depósito'}. `
                 + 'Compruébalo con su ficha técnica.'],
    };
}

/**
 * El bloque del TÉCNICO que firma: el certificador asignado al expediente.
 *
 * Son los once campos del pickle 1 que CE3X pide en «Datos del técnico
 * certificador», y están todos en `prescriptores` — no hay que teclear nada.
 *
 * REGLA — la TITULACIÓN se compone igual que la escriben ellos:
 * «GRADUADO EN INGENIERÍA DE LA EDIFICACIÓN. COLEGIADO COAATM Nº 108180».
 * Copiado de los certificados de Luis Alberto y Raquel, que es el formato con
 * el que ya se han emitido: si aquí saliera de otra forma, un mismo técnico
 * tendría dos redacciones según quién le preparase el .cex.
 *
 * REGLA — quien FIRMA es la PERSONA; la EMPRESA solo ocupa su casilla. El
 * título habilitante y el nº de colegiado son de quien firma, así que el
 * nombre nunca se sustituye por el de la sociedad. Si el técnico ejerce dentro
 * de una, se declara en su ficha (`empresa_razon_social` / `empresa_cif`) y va
 * a «Razón social» y «CIF»; si no la declara, manda el comportamiento de
 * siempre.
 *
 * REGLA — en un AUTÓNOMO, la razón social y el NIF son los suyos. Así lo tienen
 * los tres: «Nombre y Apellidos: LUIS ALBERTO LANUZA PELAYO / Razón social:
 * LUIS ALBERTO LANUZA PELAYO / NIF 70590504P» — no se deja el hueco de empresa
 * vacío, que en CE3X es un campo que se rellena igual.
 *
 * ⚠️ De quién es el `cif` de la ficha lo dice `es_autonomo`, y no la empresa:
 * en un autónomo es su NIF personal (lo sigue siendo aunque ejerza dentro de
 * una sociedad, como Francisco Javier) y en una empresa es el de ella —la ficha
 * de Félix lleva ahí el B01799436 de FESSA—. Por eso el NIF de quien firma solo
 * cae al `cif` en un autónomo: en los demás, sin `nif_responsable` la casilla
 * sale vacía y se avisa, antes que escribir el CIF de una sociedad donde CE3X
 * pide el documento de una persona.
 */
export function tecnicoCe3x(certificador) {
    const c = certificador;
    if (!c) return null;

    const persona = [c.nombre_responsable, c.apellidos_responsable]
        .filter(Boolean).join(' ').trim();
    const autonomo = c.es_autonomo !== false;
    const nombre = persona || c.razon_social || null;
    const empresa = (c.empresa_razon_social || '').trim() || null;

    const tecnico = {
        nombre,
        empresa: empresa || c.razon_social || (autonomo ? nombre : null),
        // En un autónomo, el `cif` de la ficha ES su NIF.
        nif: c.nif_responsable || (autonomo ? c.cif : null),
        cif_empresa: (empresa ? c.empresa_cif : c.cif) || null,
        telefono: c.tlf_responsable || c.tlf || null,
        email: c.email_responsable || c.email || null,
        direccion: c.direccion || null,
        provincia: c.provincia ? provinciaCe3x(c.provincia) : null,
        municipio: c.municipio || null,
        codigo_postal: c.codigo_postal || null,
        titulacion: titulacionCe3x(c),
    };
    // Lo que no consta NO se manda: el motor deja entonces lo que trajera la
    // plantilla en vez de escribir un hueco vacío encima.
    for (const k of Object.keys(tecnico)) if (!tecnico[k]) delete tecnico[k];
    return Object.keys(tecnico).length ? tecnico : null;
}

function titulacionCe3x(c) {
    if (!c.titulacion) return null;
    const colegio = [c.colegio_profesional, c.numero_colegiado].filter(Boolean);
    if (colegio.length < 2) return c.titulacion;
    return `${c.titulacion}. COLEGIADO ${c.colegio_profesional} Nº ${c.numero_colegiado}`;
}

/**
 * Compone la ficha entera. Devuelve `{ ficha, avisos }`: los avisos son lo que
 * NO es una medida, y se enseñan antes de generar.
 */
//: Cuánto del techo de autoconsumo se declara de verdad. El máximo es lo que el
//: edificio consume de red: declararlo entero supone que NADA se vierte y que la
//: producción encaja hora a hora con el consumo, que no ocurre. El 90 % es el
//: margen que deja el certificador (medido en 26RES060_186: 11.510,48 → 10.359).
export const AUTOCONSUMO_DECLARABLE = 0.9;

/**
 * El CATÁLOGO de medidas de mejora de este expediente, y cuáles se escriben.
 *
 * Son las casillas de CE3X, no un texto: cada medida es «este mismo edificio con
 * lo que ella propone», así que lleva su propio bloque de instalaciones. El
 * equipo de la aerotermia es EXACTAMENTE el mismo que el `.cex` final escribe
 * (`instalacionNueva`) y los textos son los que la app ya da en «Ayudas CEE» —
 * importados, no copiados.
 *
 * REGLA — se ELIGEN, no se rellenan solas. `elegidas` es la lista de ids que
 * marca el certificador en su pestaña; mientras venga a `null` mandan las
 * marcadas por defecto, que son las que describen la fase:
 *   · CEE INICIAL → la AEROTERMIA, que es la obra que se va a hacer.
 *   · CEE FINAL   → el AUTOCONSUMO. Allí la aerotermia ya está instalada y
 *     proponerla como mejora describiría una vivienda que no es la del
 *     certificado.
 *
 * REGLA — a quien YA tiene placas no se le propone ponerlas: esa medida no es la
 * suya, y lo que su certificado necesita es lo contrario — declararlas como
 * instalación existente. Sin el dato se ofrece igual, diciendo que no consta.
 *
 * REGLA — lo que CALCULA CE3X no se escribe. El ahorro y la calificación de cada
 * medida salen de su motor: el `.cex` se entrega con las medidas DEFINIDAS y sin
 * calcular, y el certificador solo pulsa «Actualizar».
 */
export function medidasCe3x({ expediente, superficie, fase = 'inicial',
                              elegidas = null, textos = null, modelos = {},
                              existentes = null } = {}) {
    const esFinal = fase === 'final';
    const catalogo = [];
    const avisos = [];

    // ── 1. La AEROTERMIA: la actuación de este expediente ────────────────────
    const { equipo, extras = [], avisos: avEquipo } =
        instalacionNueva({ expediente, superficie, modelos, existentes });
    const texto = equipo ? (buildMedidaMejora(expediente, { modelos }) || {}) : {};
    const invers = inversionDeLaObra(expediente);
    //: En una hibridación NO se sustituye nada: la caldera se queda y la bomba
    //: entra en apoyo. Llamarlo «sustitución» en la pestaña diría lo contrario
    //: de lo que dice el texto de la propia medida, dos líneas más abajo.
    const esHibrida = !!resolverCe3x(expediente, { modelos })?.hibridacion;
    const aero = {
        id: 'aerotermia',
        titulo: esHibrida ? 'Hibridación con aerotermia' : 'Sustitución por aerotermia',
        resumen: nombreDelConjunto(expediente, equipo, modelos),
        porDefecto: !esFinal,
        disponible: !!equipo && !esFinal,
        motivo: esFinal
            ? (esHibrida
                ? 'En el CEE final la bomba de calor ya está instalada: no es una mejora que proponer.'
                : 'En el CEE final la aerotermia ya está instalada: no es una mejora que proponer.')
            : (equipo ? null : (avEquipo[0] || 'El expediente no declara equipo nuevo.')),
        nota: null,
        datos: equipo ? {
            // El nombre del CONJUNTO, no el del generador: la medida es todo lo
            // que se instala, y el equipo de ACS —si va aparte— también entra.
            nombre: nombreDelConjunto(expediente, equipo, modelos),
            caracteristicas: texto.texto || '',
            otros_datos: OTROS_DATOS_MEDIDA,
            inversion: invers.importe,
            coste_mantenimiento: 0,
            vida_util: VIDA_UTIL_MEDIDA,
            // TODO lo que se instala, no solo el generador: si el ACS lo
            // resuelve otra máquina, esa máquina forma parte de la medida —y
            // sin ella CE3X se niega a calcularla entera.
            instalaciones: [equipo, ...extras],
        } : null,
    };
    if (aero.disponible) {
        if (texto.faltan?.length) {
            aero.nota = `Falta ${texto.faltan.join(', ')} en el expediente: donde pone `
                      + '«___» hay que completarlo en CE3X antes de emitir.';
        } else if (texto.aviso) {
            aero.nota = texto.aviso;
        } else if (invers.nota) {
            aero.nota = invers.nota;
        }
    }
    catalogo.push(aero);

    // ── 2. El AUTOCONSUMO fotovoltaico ───────────────────────────────────────
    const fv = normalizarFotovoltaica(expediente?.instalacion?.fotovoltaica);
    const techo = techoAutoconsumo(expediente);
    const kwh = techo ? Math.round(techo.kwhAnio * AUTOCONSUMO_DECLARABLE) : 0;
    const yaTienePlacas = fv.estado === 'si';
    const nombreFv = campoDe(MEDIDA_AUTOCONSUMO, 'Nombre conjunto medidas mejora');
    const auto = {
        id: 'autoconsumo',
        titulo: 'Autoconsumo fotovoltaico',
        resumen: kwh ? `${miles(kwh)} kWh/año declarables` : 'Sin techo calculable',
        porDefecto: esFinal && !yaTienePlacas,
        disponible: !!kwh && !yaTienePlacas,
        motivo: yaTienePlacas
            ? 'La vivienda YA tiene placas: van declaradas como instalación existente '
              + '(contribuciones energéticas), no como medida de mejora.'
            : (kwh ? null : 'El CEE cargado no trae el total de emisiones por vector, '
                          + 'así que no se puede calcular el máximo declarable.'),
        nota: null,
        datos: (kwh && !yaTienePlacas) ? {
            nombre: nombreFv,
            caracteristicas: campoDe(MEDIDA_AUTOCONSUMO, 'Características'),
            otros_datos: campoDe(MEDIDA_AUTOCONSUMO, 'Otros datos'),
            inversion: 0,
            coste_mantenimiento: 0,
            vida_util: 0,
            instalaciones: [{
                slot: 'renovable',
                nombre: nombreFv,
                generacion_electrica_kwh: kwh,
            }],
        } : null,
    };
    if (auto.disponible) {
        const partes = [`${miles(kwh)} kWh/año: el ${Math.round(AUTOCONSUMO_DECLARABLE * 100)} %`
                        + ` del máximo declarable del CEE ${techo.fase}.`];
        if (!fv.estado) {
            partes.push('En el expediente no consta si la vivienda ya tiene placas: si las '
                        + 'tiene, esta medida no aplica.');
        }
        if (!esFinal) {
            partes.push('Su texto habla del consumo «derivado del uso de la aerotermia», '
                        + 'que en el certificado inicial todavía no existe.');
        }
        auto.nota = partes.join(' ');
    }
    catalogo.push(auto);

    // ── Lo que el certificador haya REESCRITO manda ──────────────────────────
    // Los tres campos son los del diálogo «Conjunto de medidas de mejora» de
    // CE3X, y son TEXTO: lo que se compone aquí es un borrador razonable, no un
    // dato medido, y quien firma tiene que poder decirlo con sus palabras.
    //
    // REGLA — solo el CONJUNTO, nunca el equipo que lleva dentro. El nombre del
    // equipo es el que casa con el catálogo y con lo que se le dice al
    // certificador que teclee: si se renombrara al reescribir el conjunto,
    // dejarían de ser el mismo aparato.
    for (const m of catalogo) {
        const t = textos?.[m.id];
        if (!m.datos || !t) continue;
        for (const k of ['nombre', 'caracteristicas', 'otros_datos']) {
            if (typeof t[k] === 'string' && t[k].trim()) m.datos[k] = t[k];
        }
        m.reescrita = true;
    }

    // ── Lo que de verdad se escribe ──────────────────────────────────────────
    const marcadas = Array.isArray(elegidas)
        ? catalogo.filter(m => elegidas.includes(m.id))
        : catalogo.filter(m => m.porDefecto);
    const medidas = [];
    for (const m of marcadas) {
        if (!m.disponible || !m.datos) {
            avisos.push(`Medida «${m.titulo}» pedida pero NO se escribe: `
                        + (m.motivo || 'faltan datos.'));
            continue;
        }
        medidas.push(m.datos);
        if (m.nota) avisos.push(`Medida «${m.titulo}»: ${m.nota}`);
    }
    if (!medidas.length) {
        avisos.push('El .cex sale SIN medidas de mejora: hay que definirlas en CE3X.');
    }
    return { catalogo, medidas, avisos: [...avisos, ...(equipo ? avEquipo : [])] };
}


/** El valor de una casilla de las chuletas de «Ayudas CEE», por su rótulo. */
function campoDe(seccion, rotulo) {
    return seccion.find(c => c.campo === rotulo)?.valor || '';
}

const miles = (n) => Number(n).toLocaleString('es-ES');


/**
 * La inversión de la obra: SIEMPRE sobre factura, igual que el anexo del MITECO;
 * mientras no haya, manda el presupuesto. Sin ninguna de las dos no se inventa
 * una cifra — el análisis económico de CE3X saldría con un ahorro falso.
 */
function inversionDeLaObra(expediente) {
    const facturas = expediente?.documentacion?.facturas || [];
    const facturado = facturas.reduce((s, f) => s + (Number(f?.importe_sin_iva) || 0), 0);
    const presupuesto = Number(expediente?.oportunidades?.datos_calculo?.inputs?.presupuesto) || 0;
    const importe = facturado || presupuesto;
    if (!importe) {
        return { importe: 0,
                 nota: 'El expediente no declara inversión (ni facturas ni presupuesto): '
                     + 'el análisis económico de CE3X sale a cero.' };
    }
    if (!facturado) {
        return { importe,
                 nota: `La inversión (${miles(importe)} €) sale del PRESUPUESTO, `
                     + 'porque aún no hay facturas.' };
    }
    return { importe, nota: null };
}


/**
 * Lo que hay que PREGUNTAR antes de generar: los datos que no están en ningún
 * campo del expediente y que hoy salen con un valor por defecto.
 *
 * REGLA — solo lo que NO se ha contestado. Un popup que sale siempre se responde
 * sin leer, y entonces deja de servir para lo que existe. Lo contestado vive en
 * los ajustes del trabajo (`cee.envolvente.ajustes`), así que se pregunta UNA
 * vez por expediente y el CEE final ya lo hereda del fichero.
 *
 * REGLA — ninguna de estas respuestas BLOQUEA. «No lo sé» es una respuesta
 * válida: el `.cex` sale como hoy, con su aviso. Obligar a contestar para poder
 * generar convierte una ayuda en un peaje, y acaba contestándose cualquier cosa.
 *
 * La zona climática HE4 NO está aquí: CE3X la propone sola al elegir la
 * provincia, y la app la trae medida para las provincias comprobadas.
 */
export function faltaPorPreguntar(cfg = {}, { fase = 'inicial', expediente = null } = {}) {
    const preguntas = [];
    if (fase === 'final') return preguntas;   // el final lo hereda del inicial

    // REGLA — «contestado» NO es solo «contestado EN ESTE POPUP». El mismo dato
    // se teclea en la pestaña de INSTALACIONES («Con acumulación» + los litros),
    // que es además la que MANDA (`equipoConAjustes` pisa lo derivado). Mirando
    // solo su propia clave, el popup volvía a preguntar por un depósito que ya
    // estaba puesto — y un popup que pregunta lo que ya has contestado se
    // responde sin leer, que es justo lo que no puede pasar con los otros.
    if (!acumulacionYaDicha(cfg) && (cfg.acumulacion_litros === undefined
                                     || cfg.acumulacion_litros === null)) {
        preguntas.push({
            clave: 'acumulacion_litros',
            titulo: '¿La caldera actual tiene depósito de acumulación de ACS?',
            ayuda: 'El depósito es del edificio, no de la caldera: no se tira al cambiar '
                 + 'el equipo, así que el CEE final lo hereda. Se mide en la visita y no '
                 + 'está en ningún campo del expediente.',
            tipo: 'sino_numero',
            unidad: 'litros',
            propuesto: 150,
            siNo: 'El equipo sale SIN acumulación, como hasta ahora.',
        });
    }
    // Y la demanda de ACS puede venir dicha del propio CERTIFICADO: es el toggle
    // L/D de la rejilla del CEE, los mismos litros/día y con el mismo sentido.
    if (!litrosDiaDelCee(expediente)
        && (cfg.demanda_acs === undefined || cfg.demanda_acs === null)) {
        preguntas.push({
            clave: 'demanda_acs',
            titulo: 'Demanda de ACS',
            ayuda: 'Los litros/día que CE3X pide en Datos generales. 140 es el valor con '
                 + 'el que salen los expedientes ya emitidos.',
            tipo: 'numero',
            unidad: 'litros/día',
            propuesto: AJUSTES_POR_DEFECTO.demanda_acs,
        });
    }
    return preguntas;
}


/**
 * ¿Consta ya si la caldera actual tiene depósito?
 *
 * Vale tanto el SÍ (con sus litros: sin ellos el equipo sale igualmente sin
 * acumulación, así que sigue faltando el dato) como el NO — decir que no lo
 * tiene es una respuesta, no un hueco.
 */
function acumulacionYaDicha(cfg) {
    const i = cfg?.instalacion;
    if (!i) return false;
    if (i.acumulacion === false) return true;
    return i.acumulacion === true && Number(i.litros_acumulacion) > 0;
}

/** Los litros/día que el propio certificado declara (el toggle L/D del CEE). */
function litrosDiaDelCee(expediente) {
    return Number(expediente?.cee?.dacs_litros_dia) > 0;
}

//: Dónde vive lo tecleado en Instalaciones para cada fase. El INICIAL conserva
//: la clave de siempre, para no perder lo ya guardado en los expedientes.
export const claveInstalacion = (fase) =>
    (fase === 'final' ? 'instalacion_final' : 'instalacion');

const ajustesDeFase = (cfg, fase) => cfg?.[claveInstalacion(fase)];

/** El nombre del conjunto de medidas, con el equipo de ACS si va aparte. */
function nombreDelConjunto(expediente, equipo, modelos) {
    const d = resolverCe3x(expediente, { modelos });
    return d?.nombreConjunto || equipo?.nombre || 'La actuación de este expediente';
}

/**
 * Las casillas del diálogo «Opciones del Informe» de CE3X.
 *
 * REGLA — el texto es el MISMO que la app ya da en «Ayudas CEE», importado y no
 * copiado: es el párrafo que el certificador pega a mano en ese cuadro y que
 * viaja al PDF del certificado. Dos copias dirían cosas distintas el día que se
 * corrija una.
 *
 * Las fechas son las de ESTA fase (el CEE final se visita y se firma meses
 * después del inicial). La de FIRMA es la de emisión del certificado. Lo que no
 * conste se deja en blanco: una fecha inventada se imprime en el certificado.
 */
export function informeCe3x(expediente, fase = 'inicial') {
    const cee = expediente?.cee || {};
    const doc = expediente?.documentacion || {};
    const suf = fase === 'final' ? 'final' : 'inicial';
    const de = (clave) => cee[clave] || doc[clave] || null;
    return {
        pruebas: PRUEBAS_CERTIFICADOR,
        fecha_emision: de(`fecha_firma_cee_${suf}`),
        fecha_visita: de(`fecha_visita_cee_${suf}`),
    };
}


export function fichaCe3x({ expediente, cliente, geo, envolvente, ajustes, imagenes,
                            certificador, modelos = {},
                            fase = 'inicial', medidas = null } = {}) {
    const g = geo?.geometria || geo || {};
    const inmueble = g.modelo?.catastro?.inmueble || {};
    const cfg = { ...AJUSTES_POR_DEFECTO, ...(ajustes || {}) };
    const avisos = [];

    // Cada dato derivado se puede corregir a mano: el certificador tiene el
    // edificio delante y Catastro se equivoca —una ampliación sin declarar, una
    // planta que consta como almacén y es vivienda—. Lo que ponga MANDA, y sale
    // dicho: el `de:` pasa a decir que lo puso él.
    const puesto = (clave, derivado, de) => (cfg[clave] !== undefined && cfg[clave] !== null
        && cfg[clave] !== '' && String(cfg[clave]) !== String(derivado)
        ? { valor: cfg[clave], de: 'puesto a mano por el certificador' }
        : { valor: derivado, de });

    const anio = Number(cfg.anio ?? inmueble.antiguedad ?? expedienteAnio(expediente)) || null;
    const zona = String(cfg.zona || zonaDelExpediente(expediente) || '').toUpperCase() || null;
    if (!anio) avisos.push('No consta el año de construcción: sin él no se pueden fijar las transmitancias.');
    if (!zona) avisos.push('No consta la zona climática del expediente.');

    const dir = partesDireccion(inmueble.direccion);
    const contacto = contactoDelCliente(cliente);
    const habitables = plantasHabitables(g);
    const superficie = superficieHabitable(g);
    //: El respaldo tiene que ser el MISMO que el del motor (`Opciones.floor_height`),
    //: porque es el que se usó para MEDIR las fachadas: si aquí se declarara otra
    //: altura, las superficies del .cex no cuadrarían con la que dice.
    const altura = Number(g.parametros?.floor_height_m) || 2.8;
    const he4 = zonaHe4(dir.provincia, cfg);
    // La ENVOLVENTE es la misma en las dos fases —la obra no la toca— y lo único
    // que cambia es el generador: en el inicial la caldera que se sustituye, en
    // el final la aerotermia que entra. Verificado comparando pickle a pickle
    // los dos `.cex` de 26RES060_186: solo cambia el de instalaciones.
    const esFinal = fase === 'final';
    const derivada = esFinal
        ? instalacionNueva({ expediente, superficie, modelos, delFichero: true })
        : instalacionExistente({ expediente, superficie,
                                litros: positivo(cfg.acumulacion_litros) });
    // Lo que el certificador haya tecleado en la pestaña de Instalaciones manda
    // sobre lo derivado, y con ello puede RESCATAR un equipo que no se escribía
    // (el caso típico: falta la potencia de la caldera y la teclea él).
    //
    // ⚠️ POR FASE. Era un único `cfg.instalacion` para las dos, y la pestaña de
    // Instalaciones tiene dos caras: «CEE inicial · caldera» y «CEE final ·
    // aerotermia». Lo tecleado para la caldera se aplicaba encima de la
    // aerotermia y el CEE FINAL salía con el generador llamado «CALDERA DOMUSA
    // CLIMA MIX 20 GE» —con su potencia y su rendimiento de combustión—, o sea
    // declarando que la obra instaló otra caldera. El depósito no se pierde por
    // separarlos: al final le llega del propio `.cex` que copia
    // (`_heredar_acumulacion`), que es una fuente mejor.
    const conMano = equipoConAjustes(derivada.equipo, ajustesDeFase(cfg, fase),
                                     { superficie });
    // Y los que se hayan AÑADIDO: un termo para el ACS, un aire acondicionado.
    // En CE3X son equipos aparte, cada uno con el % de demanda que cubre.
    const anadidos = (cfg.equipos_extra || []).map(x => equipoAnadido(x, { superficie }));
    const instalacion = {
        equipo: conMano.equipo,
        // Los EXTRAS son los equipos que la propia derivación necesita además
        // del generador: hoy, el que resuelve el ACS cuando no lo hace la bomba
        // de calefacción. Sin ellos CE3X no deja calcular («la instalación de
        // ACS no está bien definida»). Van antes que los AÑADIDOS a mano, que
        // son los que el certificador mete en su pestaña.
        equipos: [conMano.equipo, ...(derivada.extras || []),
                  ...anadidos.map(a => a.equipo)].filter(Boolean),
        falta: conMano.equipo ? null : derivada.falta,
        avisos: [...derivada.avisos, ...conMano.avisos,
                 ...anadidos.flatMap(a => a.avisos)],
    };
    // Las MEDIDAS DE MEJORA que el certificador haya marcado en su pestaña. Sin
    // elección manda lo que describe la fase (ver `medidasCe3x`).
    const mejora = medidasCe3x({ expediente, superficie, fase, elegidas: medidas, modelos,
                                 textos: cfg.medidas_texto,
                                 // Los equipos de ESTA fase, para que una medida
                                 // de hibridación copie la caldera tal y como se
                                 // escribe aquí. Solo en el INICIAL: en el final
                                 // estos equipos son ya la aerotermia, y
                                 // copiarla como «la caldera que se queda» la
                                 // declararía dos veces.
                                 existentes: esFinal ? null : instalacion.equipos });
    if (!he4.valor) {
        avisos.push(`Zona climática HE4 sin determinar para ${dir.provincia || 'esta provincia'}: `
                    + 'es la de radiación solar (ACS) y hay que ponerla a mano.');
    }

    const ficha = {
        administrativos: {
            nombre_edificio: dato(`${(cfg.tipo_edificio || '').toUpperCase()} EN ${dir.calle}`.trim(),
                                  'compuesto con la dirección de Catastro'),
            direccion: dato(dir.calle, 'CATASTRO'),
            // ⚠️ SIEMPRE por `provinciaCe3x`, aunque venga bien: es un
            // DESPLEGABLE de CE3X, y una provincia que no case letra a letra
            // deja el campo VACÍO — y con él la zona climática, que es de donde
            // cuelga media ficha. La BD las guarda en MAYÚSCULAS
            // (`normalizeData`), así que llegan como 'CIUDAD REAL'.
            provincia: dato(provinciaCe3x(dir.provincia), 'CATASTRO'),
            // 'Otro' + el nombre en texto: el desplegable de municipios de CE3X
            // no tiene los nombres tal cual los escribe Catastro, y elegir uno
            // parecido cambiaría el municipio del certificado.
            localidad_lista: dato('Otro', 'el desplegable de CE3X no casa con el nombre de Catastro'),
            localidad_texto: dato(dir.municipio, 'CATASTRO'),
            codigo_postal: dato(cliente?.codigo_postal || null, 'ficha del cliente'),
            referencia_catastral: dato(refCatastral(geo, expediente), 'CATASTRO'),
            cliente_nombre: dato(nombreCliente(cliente), 'ficha del cliente'),
            cliente_direccion: dato(cliente?.direccion || null, 'ficha del cliente'),
            cliente_localidad: dato(cliente?.municipio || null, 'ficha del cliente'),
            cliente_provincia: dato(provinciaCe3x(cliente?.provincia || dir.provincia),
                                    'ficha del cliente'),
            cliente_cp: dato(cliente?.codigo_postal || null, 'ficha del cliente'),
            cliente_telefono: contacto.telefono,
            cliente_email: contacto.email,
        },
        generales: {
            normativa: puesto('normativa', anio ? normativaCe3x(anio) : null,
                              `año de construcción ${anio}`),
            tipo_edificio: dato(cfg.tipo_edificio, 'DECISIÓN del certificador'),
            zona_climatica_he1: puesto('zona', zona, 'zona climática del expediente'),
            zona_climatica_he4: dato(he4.valor, he4.de),
            superficie_util_habitable: puesto('superficie_util_habitable', superficie,
                                              deQuienSaleLoQueCuenta(g, 'superficie')),
            // Por defecto la MISMA con la que el motor midió las fachadas: si se
            // escribiera otra, las superficies del .cex no cuadrarían con la
            // altura que declara. Se puede cambiar, pero entonces hay que volver
            // a traer la envolvente con esa altura.
            altura_libre_planta: puesto('altura_libre_planta', altura,
                                        'la altura con la que se midió la envolvente'),
            n_plantas_habitables: puesto('n_plantas_habitables', habitables.length || 1,
                                         deQuienSaleLoQueCuenta(g, 'plantas')),
            // Los litros/día que CE3X pide en Datos generales. Si el propio
            // CERTIFICADO los declara (el toggle L/D de la rejilla del CEE) son
            // ESOS: es un dato del certificado, no una estimación nuestra. Lo
            // tecleado a mano en el popup manda sobre él, que para eso se teclea.
            demanda_acs: ajustes?.demanda_acs > 0
                ? dato(Number(ajustes.demanda_acs), 'DECISIÓN del certificador')
                : (Number(expediente?.cee?.dacs_litros_dia) > 0
                    ? dato(Number(expediente.cee.dacs_litros_dia),
                           'los litros/día que declara el Certificado de Eficiencia Energética')
                    : dato(cfg.demanda_acs, 'DECISIÓN del certificador (valor por defecto)')),
            masa_particiones: dato(cfg.masa_particiones, 'DECISIÓN del certificador (valor por defecto)'),
            ventilacion: puesto('ventilacion', anio ? getVentanaYACHByYear(anio, zona).ach : null,
                                'la MISMA renovación/hora que usó la simulación'),
            ano_construccion: puesto('anio', anio, 'CATASTRO'),
            // Las dos imágenes del `.cex`, en base64. Las baja el BACKEND del
            // Catastro (son las mismas que la app ya enseña en la ficha
            // catastral) y llegan aquí ya descargadas: este módulo es puro y
            // no habla con la red. Si no vienen, el .cex sale sin ellas — es
            // válido igual y el certificador puede ponerlas en CE3X.
            foto_edificio: dato(imagenes?.foto_edificio || null,
                                'CATASTRO: foto de fachada del inmueble'),
            plano_situacion: dato(imagenes?.plano_situacion || null,
                                  'CATASTRO: croquis de la parcela'),
        },
        termicas: transmitancias(anio, zona, {
            particionArriba: particionArriba(g, habitables),
            retoques: cfg.transmitancias,
        }),
        ...(tecnicoCe3x(certificador) ? { tecnico: tecnicoCe3x(certificador) } : {}),
        ...(instalacion.equipos.length ? { instalaciones: instalacion.equipos } : {}),
        //: HIBRIDACIÓN en el CEE final: el generador del fichero que se copia NO
        //: se retira, se queda con su parte de la demanda. Es lo único que el
        //: motor no puede deducir del `.cex` que tiene delante.
        ...(derivada.hibridacion ? { hibridacion: derivada.hibridacion } : {}),
        //: QUÉ falta, en ESTRUCTURA y no dentro de la frase de un aviso: lo lee
        //: la pestaña de Instalaciones para decirlo en una línea, y leer eso de
        //: un texto en castellano se rompe la primera vez que alguien mejore la
        //: redacción.
        ...(!instalacion.equipo && instalacion.falta
            ? { instalaciones_falta: instalacion.falta } : {}),
        ...(mejora.medidas.length ? { medidas: mejora.medidas } : {}),
        informe: informeCe3x(expediente, fase),
        envolvente: {
            espacio: 'auto',
            incluir_plantas: habitables.map(p => p.planta),
            excluir_ids: {
                ids: [],
                _de: 'las plantas no habitables ya quedan fuera por `incluir_plantas`',
            },
            huecos: [],
            medianeras_como_particion: [],
            ...(envolvente || {}),
        },
    };

    avisos.push(...instalacion.avisos, ...mejora.avisos);
    for (const t of ficha.termicas._retocadas || []) {
        avisos.push(`Transmitancia cambiada por el certificador — ${t}`);
    }
    if (!ficha.tecnico) {
        avisos.push('El expediente no tiene certificador asignado: el .cex sale sin '
                    + 'los datos del técnico (se ponen en CE3X).');
    } else {
        if (!ficha.tecnico.titulacion) {
            avisos.push(`${ficha.tecnico.nombre}: no consta su titulación habilitante en su `
                        + 'ficha, y CE3X la pide. Ponla en Prescriptores.');
        }
        //: El NIF es de quien FIRMA. Sin él, la casilla sale vacía y el
        //: certificado no identifica al técnico — que es de lo poco que CE3X
        //: no deja arreglar después sin volver a abrir el fichero.
        if (!ficha.tecnico.nif) {
            avisos.push(`${ficha.tecnico.nombre}: no consta su NIF (el de la PERSONA que `
                        + 'firma, no el CIF de la empresa). Ponlo en Prescriptores.');
        }
        if (ficha.tecnico.empresa && ficha.tecnico.empresa !== ficha.tecnico.nombre
            && !ficha.tecnico.cif_empresa) {
            avisos.push(`${ficha.tecnico.empresa}: no consta su CIF, y el .cex lo pide `
                        + 'junto a la razón social. Ponlo en Prescriptores.');
        }
    }
    if (!ficha.envolvente.incluir_plantas.length) {
        avisos.push('Catastro no declara ninguna planta habitable en esta parcela: '
                    + 'el .cex saldría sin cerramientos.');
    }
    for (const [bloque, campos] of Object.entries({ administrativos: ficha.administrativos,
                                                    generales: ficha.generales })) {
        for (const [campo, v] of Object.entries(campos)) {
            if (v && v.valor === null && OBLIGATORIOS[bloque]?.includes(campo)) {
                avisos.push(`Falta ${campo.replace(/_/g, ' ')} (${bloque}).`);
            }
        }
    }
    return { ficha, avisos, medidas: mejora.catalogo,
             // Con los ajustes EN CRUDO, no con `cfg`: ahí los valores por
             // defecto ya están fusionados y `demanda_acs` nunca estaría sin
             // contestar — el popup no preguntaría lo que existe para preguntar.
             faltan: faltaPorPreguntar(ajustes || {}, { fase, expediente }) };
}

//: Los que el motor exige con valor; el resto puede ir vacío.
const OBLIGATORIOS = {
    administrativos: ['nombre_edificio', 'direccion', 'provincia', 'localidad_lista',
                      'referencia_catastral'],
    generales: ['normativa', 'tipo_edificio', 'zona_climatica_he1', 'zona_climatica_he4',
                'superficie_util_habitable', 'altura_libre_planta', 'n_plantas_habitables',
                'demanda_acs', 'masa_particiones', 'ventilacion', 'ano_construccion'],
};

// ─── De dónde sale cada cosa ─────────────────────────────────────────────────

const dato = (valor, de) => ({ valor: valor === undefined ? null : valor, de });

/** Catastro escribe "CL MEJICO 4, PEDRO MUÑOZ, CIUDAD REAL" en una sola línea. */
function partesDireccion(texto) {
    const p = String(texto || '').split(',').map(s => s.trim()).filter(Boolean);
    return {
        calle: p[0] || null,
        municipio: p[1] || null,
        provincia: p[2] ? provinciaCe3x(p[2]) : null,
    };
}

//: El desplegable de provincias de CE3X las escribe capitalizadas ("Ciudad
//: Real") y Catastro en mayúsculas. Una provincia que no case deja el campo
//: vacío en CE3X, así que se normaliza; las preposiciones van en minúscula y
//: las tildes que Catastro se come se reponen.
const PROVINCIA_TILDE = {
    'ALAVA': 'Álava', 'AVILA': 'Ávila', 'CACERES': 'Cáceres', 'CADIZ': 'Cádiz',
    'CORDOBA': 'Córdoba', 'JAEN': 'Jaén', 'LEON': 'León', 'MALAGA': 'Málaga',
    'ALMERIA': 'Almería', 'GUIPUZCOA': 'Guipúzcoa', 'A CORUÑA': 'A Coruña',
};
function provinciaCe3x(texto) {
    if (!texto) return texto || null;
    const crudo = String(texto).trim().toUpperCase();
    if (PROVINCIA_TILDE[crudo]) return PROVINCIA_TILDE[crudo];
    const menores = new Set(['de', 'del', 'la', 'las', 'los', 'y']);
    return crudo.toLowerCase().split(/\s+/)
        .map((w, i) => (i && menores.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
}

//: La zona HE4 es la de RADIACIÓN solar (ACS), no la de calefacción, y sale de
//: una tabla del CTE por provincia que aquí NO está entera: solo se afirman
//: las comprobadas contra `.cex` reales ya emitidos. Para el resto se dice que
//: falta en vez de escribir una plausible — es un dato de un certificado.
//: La zona de RADIACIÓN (HE4), la que manda en el ACS. CE3X la propone sola al
//: elegir la provincia, así que esto es un refuerzo: sirve para que la ficha
//: DIGA cuál va a salir y para no dejar el campo en blanco.
//:
//: Medida sobre los 1.503 `.cex` reales que declaran provincia y zona, y
//: contrastada una a una con el mapa del CTE (secciones HE4 del CTE 2013/2006).
//: Solo entran las provincias donde las DOS fuentes dicen lo mismo — Valencia
//: se queda fuera a propósito: 3 expedientes dicen V y uno IV, y el mapa la
//: pinta IV.
const HE4_COMPROBADAS = {
    'Ciudad Real': 'V',     // 1.187 de 1.194 · mapa: V
    'Toledo': 'V',          //   134 de   159 · mapa: V
    'Albacete': 'IV',       //    66 unánimes · mapa: IV
    'Cuenca': 'IV',         //    39 unánimes · mapa: IV
    'Madrid': 'IV',         //    29 unánimes · mapa: IV
    'Guadalajara': 'IV',    //     5 unánimes · mapa: IV
    'Sevilla': 'V',         //     3 unánimes · mapa: V
    'Burgos': 'III',        //     2 unánimes · mapa: III
    'La Rioja': 'III',      //     1           · mapa: III
    'Guipúzcoa': 'I',       //     1           · mapa: I
};
function zonaHe4(provincia, cfg) {
    if (cfg.zona_climatica_he4) return { valor: cfg.zona_climatica_he4, de: 'puesta a mano' };
    const v = HE4_COMPROBADAS[provincia];
    return v
        ? { valor: v, de: `CTE HE4 para ${provincia} (comprobado en expedientes ya emitidos)` }
        : { valor: null, de: 'sin determinar: ponla a mano' };
}

/**
 * De dónde sale QUÉ cuenta de este edificio.
 *
 * Normalmente del uso que Catastro le da a cada construcción; pero si alguien
 * marcó otra cosa en la ficha técnica de la oportunidad —el caso típico: una
 * planta que consta como almacén y es vivienda—, la procedencia tiene que
 * decirlo. Poner «CATASTRO» al lado de una cifra que decidió una persona es
 * mentir sobre el único campo que explica de dónde salen los metros.
 */
function deQuienSaleLoQueCuenta(g, que) {
    const base = que === 'superficie'
        ? 'CATASTRO: superficie de uso VIVIENDA'
        : 'CATASTRO: plantas con uso habitable';
    const corregidas = (g.modelo?.spaces || []).filter(
        s => s.attrs && s.attrs.habitable_catastro !== null
                     && s.attrs.habitable_catastro !== undefined
                     && !!s.attrs.habitable_catastro !== !!s.attrs.habitable);
    if (!corregidas.length) return base;
    return `lo marcado en la ficha técnica de la oportunidad (${corregidas.length} `
         + `${corregidas.length === 1 ? 'construcción corregida' : 'construcciones corregidas'} `
         + 'respecto al uso de Catastro)';
}

function plantasHabitables(g) {
    const niveles = new Map();
    for (const s of g.modelo?.spaces || []) {
        if (!s.attrs?.habitable || s.floor === null || s.floor === undefined) continue;
        niveles.set(s.floor, (niveles.get(s.floor) || 0) + (Number(s.area) || 0));
    }
    const nombre = new Map((g.modelo?.floors || []).map(f => [f.nivel, f.planta]));
    return [...niveles.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([nivel, area]) => ({ nivel, area, planta: nombre.get(nivel) || `P${nivel}` }));
}

function superficieHabitable(g) {
    const total = plantasHabitables(g).reduce((s, p) => s + p.area, 0);
    return total ? Math.round(total) : null;
}

/** ¿El espacio no habitable está ENCIMA de la vivienda? */
function particionArriba(g, habitables) {
    const techo = Math.max(...habitables.map(p => p.nivel), 0);
    const particiones = (g.elementos || [])
        .filter(e => e.tipo === 'PARTICION_INTERIOR_HORIZONTAL');
    if (!particiones.length) return true;
    // Si alguna cae por debajo del último nivel habitable, el espacio no
    // habitable está debajo (el garaje enterrado típico).
    return !particiones.some(e => Number(e.nivel) < techo);
}

function refCatastral(geo, expediente) {
    return geo?.referencia_catastral?.inmueble
        || geo?.referencia_catastral?.completa
        || geo?.geometria?.referencia_catastral?.inmueble
        || expediente?.instalacion?.ref_catastral
        || null;
}

/**
 * El teléfono y el correo del titular, con su PERSONA DE CONTACTO de respaldo,
 * envueltos en la procedencia que esta ficha enseña.
 *
 * La cascada vive en `utils/contactoCliente.js`: la comparte con el borrador
 * para presentar el CEE, y con dos copias el mismo cliente aparecería
 * localizable en una pantalla y sin datos en la otra.
 */
function contactoDelCliente(c) {
    const k = contactoCliente(c);
    const de = deQuienEs(k.nombreContacto);
    return {
        telefono: dato(k.telefono, k.telefonoDeContacto ? de : 'ficha del cliente'),
        email: dato(k.email, k.emailDeContacto ? de : 'ficha del cliente'),
    };
}

function nombreCliente(c) {
    if (!c) return null;
    return [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ').trim() || null;
}

//: La MISMA cascada que usa el expediente para su zona climática
//: (`InstalacionModule`): la oportunidad manda, porque es la que se simuló.
//: Lo que NO se copia de allí es el respaldo a 'D3' — vale para elegir una
//: columna de SCOP, no para escribir la zona de un certificado: si no consta,
//: se dice.
function zonaDelExpediente(e) {
    const op = e?.oportunidades?.datos_calculo || e?.oportunidad?.datos_calculo || {};
    return op.zona || op.inputs?.zona || e?.instalacion?.zona_climatica || null;
}

function expedienteAnio(e) {
    const op = e?.oportunidades?.datos_calculo || e?.oportunidad?.datos_calculo || {};
    return e?.instalacion?.ano_construccion || op.inputs?.anio || op.anio || null;
}

export default fichaCe3x;
