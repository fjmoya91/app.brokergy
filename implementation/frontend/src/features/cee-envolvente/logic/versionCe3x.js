// ─────────────────────────────────────────────────────────────────────────────
// La VERSIÓN de CE3X con la que se escribe el `.cex`.
//
// Hasta el 30/09/2026 se certificaba con CE3X 2.3; del 01/10/2026 al 07/10/2026,
// con la 3.1; desde el 08/10/2026, con la 3.2, que es la VIGENTE y la que sale
// por defecto (decisión del usuario; la 2.3, solo cuando se pida). La 3.2 guarda
// el fichero con la MISMA forma que la 3.1 —cambia la cabecera— y calcula igual
// (medido con su propio motor): todo lo que aquí se dice de la 3.1 vale para las
// dos (`esModerna`). Lo que la 3.2 aclara es QUÉ se teclea en Datos generales
// («Ampliación del manual de usuario CE3X», 6.2-6.6): las plantas sobre y bajo
// rasante son las del EDIFICIO entero (de Catastro), no las de lo que se certifica.
//
// El CÁLCULO es el mismo —medido con el motor de las dos sobre el mismo
// fichero—: lo que cambia es la FORMA del fichero y los datos que pide cada
// una. La 3.1 añade en Datos administrativos el grado de protección, las partes
// protegidas y el uso del edificio; convierte la titulación en un DESPLEGABLE;
// en Datos generales pide la superficie útil, el nº de viviendas o unidades de
// uso y las plantas sobre y bajo rasante (sin ellas no califica); parte la
// normativa en siete tramos; y a cada equipo que no es una caldera estimada le
// pide su POTENCIA (sin ella califica pero no escribe el XML del certificado).
//
// REGLA — esto es el ESPEJO de `cee-engine/tools/version_ce3x.py`, que es el
// que manda al escribir. Aquí está solo lo que la PANTALLA tiene que enseñar
// antes de generar: los desplegables nuevos y lo que la app propone en cada
// uno. Las listas son LITERALES de CE3X 3.1 (preguntadas a su propio código:
// `Calculos.listadosWeb` y `Calculos.listados.Proteccion`), y
// `test_version_ce3x_app.mjs` comprueba que dicen lo mismo que el motor.
//
// Sin React: lo usan la ficha (que también carga el backend) y el test.
// ─────────────────────────────────────────────────────────────────────────────

export const VERSIONES_CE3X = [
    { valor: '3.2', etiqueta: 'CE3X 3.2', ayuda: 'la vigente desde el 08/10/2026' },
    { valor: '3.1', etiqueta: 'CE3X 3.1', ayuda: 'del 01/10/2026 al 07/10/2026' },
    { valor: '2.3', etiqueta: 'CE3X 2.3', ayuda: 'la de antes del 01/10/2026' },
];

//: La VIGENTE. Un expediente que nunca ha elegido versión se escribe con ella:
//: los ficheros de la 2.3 los abre la 3.2, pero lo que pide de más no lo
//: rellena nadie si no se pone aquí.
export const VERSION_CE3X_DEFECTO = '3.2';

//: Las que guardan la forma NUEVA del fichero (la 3.2 es la 3.1 con otra cabecera).
export const esModerna = (v) => v === '3.1' || v === '3.2';

/** La versión con la que se escribe y si la ha ELEGIDO alguien. */
export function versionCe3xDe(ajustes) {
    const v = String(ajustes?.version_ce3x || '').trim();
    return VERSIONES_CE3X.some(x => x.valor === v)
        ? { version: v, elegida: true }
        : { version: VERSION_CE3X_DEFECTO, elegida: false };
}

export const etiquetaVersionCe3x = (v) =>
    (VERSIONES_CE3X.find(x => x.valor === v) || VERSIONES_CE3X[0]).etiqueta;

// ── La NORMATIVA ─────────────────────────────────────────────────────────────

//: La 2.3: cuatro cadenas, medidas sobre el corpus de 1.188 `.cex` reales.
export const NORMATIVAS_23 = ['Anterior', 'NBE-CT-79', 'C.T.E.', 'CTE 2013'];

//: La 3.1: siete tramos. Se GUARDA el valor y la 3.1 enseña el rótulo. Los de la
//: 2.3 siguen valiendo; lo nuevo son los tres tramos que parten la NBE y el CTE.
export const NORMATIVAS_31 = [
    { valor: 'Anterior', etiqueta: 'Antes 1980' },
    { valor: 'NBE-CT-79', etiqueta: '1980 - 1998' },
    { valor: 'NBE-CT-79_aPartir1998', etiqueta: '1998 - 2007' },
    { valor: 'C.T.E.', etiqueta: '2007 - 2013' },
    { valor: 'CTE 2013', etiqueta: '2014 - 2020' },
    { valor: 'Apartir2020', etiqueta: 'Después 2020' },
    { valor: 'Otros', etiqueta: 'Otros (post 2020)' },
];

/**
 * La normativa de la 3.1 para un año de construcción.
 *
 * Los rótulos de la 3.1 se solapan en los extremos («1980 - 1998», «1998 -
 * 2007»): 1998 va a la de a partir de 1998 (lo dice su nombre) y 2007 al
 * C.T.E., que se exige desde 2007. Es `normativa_31` del motor, punto por punto.
 * No mueve el cálculo (medido): solo lo que declara el XML.
 */
export function normativa31(anio) {
    const a = Number(anio);
    if (!Number.isFinite(a) || !a) return null;
    if (a < 1980) return 'Anterior';
    if (a < 1998) return 'NBE-CT-79';
    if (a < 2007) return 'NBE-CT-79_aPartir1998';
    if (a < 2014) return 'C.T.E.';
    if (a <= 2020) return 'CTE 2013';
    return 'Apartir2020';
}

/** Lo mismo al revés: la 2.3 no conoce los tres tramos nuevos. */
export function normativa23(n) {
    const v = String(n || '').trim();
    return { 'NBE-CT-79_aPartir1998': 'NBE-CT-79', Apartir2020: 'CTE 2013',
             Otros: 'CTE 2013' }[v] || v;
}

/**
 * Una normativa que valga para la versión pedida.
 *
 * Una de la 2.3 vale tal cual en la 3.1 (son cuatro de sus siete valores); una
 * de los tramos nuevos se traduce al bajar a la 2.3. Lo que no es de ninguna,
 * `null`: mejor que se decida por el año que escribir algo que CE3X no reconoce.
 */
export function normativaDeVersion(n, version) {
    const v = String(n || '').trim();
    if (!v) return null;
    if (version === '2.3') {
        const baja = normativa23(v);
        return NORMATIVAS_23.includes(baja) ? baja : null;
    }
    return NORMATIVAS_31.some(x => x.valor === v) ? v : null;
}

// ── La TITULACIÓN ────────────────────────────────────────────────────────────

//: `Calculos.listadosWeb.listadoTitulacion`. La última es «Otra(.*)»: un texto
//: que no casa con ninguna sale así, literalmente, en el XML del certificado.
export const TITULACIONES_31 = [
    'Arquitectura', 'Arquitectura técnica o aparejadores',
    'Ingeniería Aeronáutica', 'Ingeniería Agrónoma',
    'Ingeniería de Caminos, Canales y Puertos', 'Ingeniería Industrial',
    'Ingeniería de Minas', 'Ingeniería de Montes', 'Ingeniería Naval y Oceánica',
    'Ingeniería de Telecomunicación', 'Ingeniería Técnica Aeronáutica',
    'Ingeniería Técnica Agrícola', 'Ingeniería Técnica Forestal',
    'Ingeniería Técnica Industrial', 'Ingeniería Técnica de Minas',
    'Ingeniería Técnica Naval', 'Ingeniería Técnica de Obras Públicas',
    'Ingeniería Técnica Telecomunicación', 'Ingeniería Técnica Topógrafía',
    'Ingeniería Química', 'Otra(.*)',
];

const plano = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase();

const TIT_TECNICA = [
    ['INDUSTRIAL', 'Ingeniería Técnica Industrial'],
    ['AGRICOL', 'Ingeniería Técnica Agrícola'],
    ['FORESTAL', 'Ingeniería Técnica Forestal'],
    ['MINAS', 'Ingeniería Técnica de Minas'],
    ['NAVAL', 'Ingeniería Técnica Naval'],
    ['OBRAS PUBLICAS', 'Ingeniería Técnica de Obras Públicas'],
    ['TELECOMUNICACION', 'Ingeniería Técnica Telecomunicación'],
    ['TOPOGRAF', 'Ingeniería Técnica Topógrafía'],
    ['AERONAUT', 'Ingeniería Técnica Aeronáutica'],
];
const TIT_SUPERIOR = [
    ['CAMINOS', 'Ingeniería de Caminos, Canales y Puertos'],
    ['INDUSTRIAL', 'Ingeniería Industrial'],
    ['AGRONOM', 'Ingeniería Agrónoma'],
    ['MINAS', 'Ingeniería de Minas'],
    ['MONTES', 'Ingeniería de Montes'],
    ['NAVAL', 'Ingeniería Naval y Oceánica'],
    ['TELECOMUNICACION', 'Ingeniería de Telecomunicación'],
    ['AERONAUT', 'Ingeniería Aeronáutica'],
    ['QUIMIC', 'Ingeniería Química'],
];

/**
 * La opción del desplegable de la 3.1 para una titulación escrita a mano.
 *
 * Las que hay hoy en la app: «ARQUITECTO» → Arquitectura; «GRADUADO EN
 * INGENIERÍA DE LA EDIFICACIÓN» → Arquitectura técnica o aparejadores;
 * «INGENIERO INDUSTRIAL» y «GRADUADO EN INGENIERÍA INDUSTRIAL» → Ingeniería
 * Industrial. Sin casar, `null`: mejor decirlo que escribir «Otra(.*)» en el
 * XML de un certificado. Es `titulacion_ce3x` del motor, punto por punto.
 */
export function titulacion31(txt) {
    const t = plano(txt);
    if (!t) return null;
    const exacta = TITULACIONES_31.slice(0, -1).find(o => plano(o) === t);
    if (exacta) return exacta;
    if (t.includes('EDIFICACION') || t.includes('APAREJADOR')
        || (t.includes('ARQUITECT') && t.includes('TECNIC'))) {
        return 'Arquitectura técnica o aparejadores';
    }
    if (t.includes('ARQUITECT')) return 'Arquitectura';
    if (t.includes('INGENIER')) {
        const tabla = t.includes('TECNIC') ? TIT_TECNICA : TIT_SUPERIOR;
        const hit = tabla.find(([clave]) => t.includes(clave));
        if (hit) return hit[1];
    }
    return null;
}

// ── Protección y USO del edificio ────────────────────────────────────────────

//: `Calculos.listados.Proteccion.getListadoGradosProteccion`: se guarda la clave.
export const GRADOS_PROTECCION_31 = [
    { valor: 'Ninguna', etiqueta: 'Ninguna' },
    { valor: 'Integral', etiqueta: 'Integral o equivalente' },
    { valor: 'Estructural', etiqueta: 'Estructural o equivalente' },
    { valor: 'Ambiental', etiqueta: 'Ambiental o equivalente' },
];

//: `Proteccion.getListadoProteccionesParaGuardar`: se marcan las protegidas.
export const PARTES_PROTEGIDAS_31 = ['Fachada', 'Cubierta', 'Portal', 'Escaleras', 'Patio',
                                     'Otro'];

//: El «Uso del edificio» (RD 390/2021). Son DOS listas y las decide el
//: PROGRAMA: el residencial solo ofrece las dos suyas y el terciario sus once
//: —sin «Residencial público», aunque un hotel lo sea por el RD—. Un valor fuera
//: de la lista de su programa es un desplegable que CE3X no sabe enseñar.
export const USOS_RESIDENCIAL_31 = [
    { valor: 'ResidencialPrivado', etiqueta: 'Residencial privado' },
    { valor: 'ResidencialPublico', etiqueta: 'Residencial público' },
];
export const USOS_TERCIARIO_31 = [
    { valor: 'Administrativo', etiqueta: 'Administrativo' },
    { valor: 'Sanitario', etiqueta: 'Sanitario' },
    { valor: 'Comercial', etiqueta: 'Comercial' },
    { valor: 'Docente', etiqueta: 'Docente' },
    { valor: 'Cultural', etiqueta: 'Cultural' },
    { valor: 'Deportivo', etiqueta: 'Deportivo' },
    { valor: 'Restauracion', etiqueta: 'Restauración' },
    { valor: 'Transporte', etiqueta: 'Transporte' },
    { valor: 'ActividadesRecreativas', etiqueta: 'Actividades recreativas' },
    { valor: 'Religioso', etiqueta: 'Religioso' },
    { valor: 'Otro', etiqueta: 'Otro' },
];
export const usosDePrograma = (terciario) => (terciario ? USOS_TERCIARIO_31
                                                        : USOS_RESIDENCIAL_31);

const USO_POR_ACTIVIDAD = [
    ['ADMINISTRATIV', 'Administrativo'], ['OFICINA', 'Administrativo'],
    ['HOSPITAL', 'Sanitario'], ['SANITARI', 'Sanitario'], ['DIAGNOSTICO', 'Sanitario'],
    ['COMERCI', 'Comercial'], ['TIENDA', 'Comercial'],
    ['AULA', 'Docente'], ['DOCENT', 'Docente'], ['ENSENANZA', 'Docente'],
    ['BIBLIOTECA', 'Cultural'], ['MUSEO', 'Cultural'], ['CULTUR', 'Cultural'],
    ['DEPORT', 'Deportivo'], ['GIMNASIO', 'Deportivo'],
    ['RESTAURA', 'Restauracion'], ['CAFETER', 'Restauracion'],
    ['TRANSPORTE', 'Transporte'], ['ESTACION', 'Transporte'],
    ['RELIGIOS', 'Religioso'], ['CULTO', 'Religioso'], ['IGLESIA', 'Religioso'],
    ['ESPECTACUL', 'ActividadesRecreativas'], ['OCIO', 'ActividadesRecreativas'],
];

/**
 * El uso de un TERCIARIO por la actividad de su iluminación (CTE HE-3), que ya
 * se pregunta al elegir el tipo de edificio. Lo que no casa —un hotel incluido—
 * va a «Otro», que no afirma nada que no se sepa. Es `uso_de_actividad` del
 * motor, punto por punto.
 */
export function usoDeActividad(actividad) {
    const a = plano(actividad);
    const hit = USO_POR_ACTIVIDAD.find(([clave]) => a.includes(clave));
    return hit ? hit[1] : 'Otro';
}

//: El tipo de bomba de calor que la 3.1 pide en la cola de cada equipo
//: (`listadoOpcionesBdC`). No mueve el cálculo (medidos los cuatro).
export const TIPOS_BDC_31 = [
    { valor: 0, etiqueta: 'Aire-Aire' },
    { valor: 1, etiqueta: 'Aire-Agua' },
    { valor: 2, etiqueta: 'Agua-Aire' },
    { valor: 3, etiqueta: 'Agua-Agua' },
];

// ── Lo que la 3.1 pide de más, con lo que la app propone ─────────────────────

const entero = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Las plantas sobre y bajo rasante del EDIFICIO ENTERO, de Catastro.
 *
 * Manual de la 3.2, 6.6: «tienen carácter descriptivo del edificio y se prevé su
 * cumplimentación a partir de información catastral. Por esta razón, deben
 * referirse al edificio en su conjunto, incluso cuando el certificado
 * corresponda únicamente a una parte» (su ejemplo de un piso en un bloque pasa
 * de 1 a 8). Salen de los BuildingPart de la parcela que mide el motor
 * (`numberOfFloorsAboveGround` / `BelowGround`, el máximo); sin ellos, de los
 * niveles medidos. No se confunden con las plantas HABITABLES (6.5), que son las
 * de lo que se certifica.
 *
 * @param {object} g  la geometría del motor (`geo.geometria`)
 * @returns {{ sobre: number|null, bajo: number|null }|null}
 */
export function plantasDelEdificio(g) {
    const partes = g?.modelo?.building_parts || [];
    const ent = (v) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
    };
    let sobre = null;
    let bajo = null;
    for (const p of partes) {
        const s = ent(p?.attrs?.numberOfFloorsAboveGround);
        const b = ent(p?.attrs?.numberOfFloorsBelowGround);
        if (s !== null) sobre = Math.max(sobre ?? 0, s);
        if (b !== null) bajo = Math.max(bajo ?? 0, b);
    }
    if (sobre === null) {
        const niveles = (g?.modelo?.floors || []).map(f => Number(f?.nivel)).filter(Number.isFinite);
        if (!niveles.length) return null;
        sobre = niveles.filter(n => n >= 0).length || null;
        bajo = niveles.filter(n => n < 0).length;
    }
    return { sobre, bajo: bajo ?? 0 };
}

/**
 * Los datos de la 3.1 que no estaban en la 2.3, con su procedencia.
 *
 * Lo que la app ya sabe se PROPONE (la superficie y las plantas son las de
 * Datos generales; la titulación sale de la del técnico) y lo que ha tocado el
 * certificador MANDA (`ajustes.ce3x31`). Cada valor dice de dónde sale, como el
 * resto de la ficha: es un dato que va a un certificado.
 *
 * Devuelve `{ valores, de, avisos }`: `valores` es lo que viaja al motor
 * (`ficha.ce3x31`), `de` lo que enseña la pantalla.
 */
export function datosCe3x31({ ajustes, terciario = false, tipoEdificio = '',
                              superficie = null, plantas = null, titulacion = null,
                              actividad = null, normativa = null, edificio = null } = {}) {
    const c = ajustes?.ce3x31 || {};
    const avisos = [];
    const de = {};
    const val = {};
    const suyo = (k) => c[k] !== undefined && c[k] !== null && c[k] !== '';

    // La normativa ya viene decidida en la ficha (por el año o a mano): aquí
    // solo se manda, para que el motor no la vuelva a decidir por su cuenta.
    if (normativa) val.normativa = normativa;

    const usos = usosDePrograma(terciario).map(u => u.valor);
    if (suyo('uso') && usos.includes(c.uso)) {
        val.uso = c.uso; de.uso = 'puesto a mano por el certificador';
    } else {
        val.uso = terciario ? usoDeActividad(actividad) : 'ResidencialPrivado';
        de.uso = terciario
            ? (actividad ? `por la actividad de la iluminación («${actividad}»)`
                         : 'por defecto: elígelo si no es «Otro»')
            : 'una vivienda: residencial privado';
    }

    const grados = GRADOS_PROTECCION_31.map(g => g.valor);
    val.grado_proteccion = suyo('grado_proteccion') && grados.includes(c.grado_proteccion)
        ? c.grado_proteccion : 'Ninguna';
    de.grado_proteccion = suyo('grado_proteccion') ? 'puesto a mano por el certificador'
        : 'por defecto: el edificio no está protegido';
    val.partes_protegidas = (Array.isArray(c.partes_protegidas) ? c.partes_protegidas : [])
        .filter(p => PARTES_PROTEGIDAS_31.includes(p));
    if (val.grado_proteccion !== 'Ninguna' && !val.partes_protegidas.length) {
        avisos.push('El edificio tiene un grado de protección pero no se ha marcado qué partes '
                    + 'lo están (Datos administrativos de la 3.1).');
    }

    const tit = suyo('titulacion') && TITULACIONES_31.slice(0, -1).includes(c.titulacion)
        ? c.titulacion : titulacion31(titulacion);
    if (tit) {
        val.titulacion = tit;
        de.titulacion = suyo('titulacion') ? 'puesto a mano por el certificador'
            : 'de la titulación del técnico';
    } else if (titulacion) {
        de.titulacion = 'no casa con ninguna del desplegable';
        avisos.push(`La titulación del técnico («${titulacion}») no casa con ninguna del `
                    + 'desplegable de CE3X: en el XML saldría «Otra(.*)». Elígela en Datos '
                    + 'administrativos.');
    }

    const sup = suyo('superficie_util') ? entero(c.superficie_util) : entero(superficie);
    if (sup) {
        val.superficie_util = sup;
        de.superficie_util = suyo('superficie_util') ? 'puesto a mano por el certificador'
            : 'la superficie útil habitable de Datos generales';
    }

    const bloque = tipoEdificio === 'Bloque de Viviendas';
    const uds = suyo('unidades_uso') ? entero(c.unidades_uso) : (bloque ? null : 1);
    if (uds) {
        val.unidades_uso = uds;
        de.unidades_uso = suyo('unidades_uso') ? 'puesto a mano por el certificador'
            : (terciario ? 'por defecto: un edificio o un local' : 'una vivienda');
    } else {
        de.unidades_uso = 'falta';
        avisos.push('Falta el nº de viviendas o unidades de uso (Datos generales): CE3X 3.2 '
                    + 'no califica sin él. Son las de lo que se CERTIFICA: un piso de un bloque es 1.');
    }

    // Las del EDIFICIO ENTERO (manual de la 3.2, 6.6), de Catastro; sin ellas,
    // las habitables y ninguna bajo rasante, como hasta ahora.
    const delEdificio = entero(edificio?.sobre);
    const sobre = suyo('plantas_sobre_rasante') ? entero(c.plantas_sobre_rasante)
        : (delEdificio || entero(plantas));
    if (sobre) {
        val.plantas_sobre_rasante = sobre;
        de.plantas_sobre_rasante = suyo('plantas_sobre_rasante') ? 'puesto a mano por el certificador'
            : (delEdificio ? 'las del edificio entero, de Catastro'
                           : 'las plantas habitables de Datos generales (Catastro no las dice)');
    }
    const bajoEdificio = edificio && delEdificio ? entero(edificio.bajo) : null;
    const bajo = suyo('plantas_bajo_rasante') ? entero(c.plantas_bajo_rasante) : (bajoEdificio ?? 0);
    val.plantas_bajo_rasante = bajo ?? 0;
    de.plantas_bajo_rasante = suyo('plantas_bajo_rasante') ? 'puesto a mano por el certificador'
        : (bajoEdificio !== null ? 'las del edificio entero, de Catastro' : 'por defecto: sin sótano');

    return { valores: val, de, avisos };
}
