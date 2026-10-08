// ============================================================================
// revisionCeeCex.js — LO QUE SOLO SE PUEDE JUZGAR CON EL .cex DELANTE.
//
// Mitad del juicio de la revisión del CEE (`revisionCee.js` es la otra): aquí
// van las comprobaciones que necesitan el fichero de CE3X y no el .xml —la
// medida de mejora, el depósito, la cola de la caldera— y las que, pudiendo
// hacerse con los dos, salen mejor del .cex (las transmitancias con su modo).
//
// TODAS LAS REGLAS Y UMBRALES DE AQUÍ ESTÁN MEDIDOS sobre los 143 CEE iniciales
// que Fran había dado por buenos (REVISADO o REGISTRADO) el 29/09/2026, leídos
// de sus `.cex`. Un umbral que no se mide antes marca certificados buenos, y un
// aviso que salta siempre enseña a no leer la lista entera.
//
// Los criterios los fijó Fran el 29/09/2026:
//   · transmitancias y ventilación IGUALES A LA GUÍA → aviso, y solo en los CEE
//     emitidos desde que se aplica la guía (FECHA_GUIA);
//   · la medida de mejora OBLIGATORIA en sustitución e hibridación, CALCULADA,
//     calculada sobre ESTE edificio, y con el equipo y el SCOP del expediente;
//   · el rendimiento de la caldera, solo informativo.
// ============================================================================

const { norm } = require('./radiografiaCee');

//: Desde cuándo se exige la Guía de Transmitancias (decisión de Fran,
//: 29/09/2026). Medido: casi ningún CEE de 2025 la sigue y es mayoría desde
//: abril de 2026. Un certificado anterior se revisó con otro criterio.
const FECHA_GUIA = '2026-04-01';

//: Desde cuándo la Guía es la de CE3X 3.2: lo que CE3X pone con «Estimados según
//: antigüedad y zona climática», escrito como «Conocidas» (decisión de Fran,
//: 08/10/2026). Un certificado anterior se compara con la Guía de antes.
const FECHA_GUIA_CE3X = '2026-10-08';

//: Holgura al comparar con la guía: la U se teclea con dos decimales.
const TOL_U = 0.02;

//: Huecos sobre fachada. Medido sobre los 142 aprobados: p2 = 6,7 %, p98 = 45 %.
const HUECOS_MIN = 0.06;
const HUECOS_MAX = 0.45;

//: Los puentes térmicos que llevan casi todos: forjado (140/143), contorno de
//: hueco (139), pilar integrado (135) y en esquina (133).
const PUENTES_BASE = ['Encuentro de fachada con forjado', 'Contorno de hueco',
    'Pilar integrado en fachada', 'Pilar en Esquina'];

//: Holgura del SCOP de la medida frente al del expediente (%).
const TOL_SCOP_PCT = 2;

//: Solo se quitan los ceros DECIMALES: con `/\.?0+$/` un 420 salía «42».
const coma = (n, d = 2) => (n == null ? '—'
    : Number(n).toFixed(d).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ','));
const pct = (n) => `${(n * 100).toFixed(1).replace('.', ',')} %`;

/** '19/09/2026' → '2026-09-19'. */
const isoDeCex = (f) => {
    const m = String(f || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};

/** ¿Se exige la guía a ESTE certificado? Por su fecha de emisión. */
function aplicaGuia(ctx, cex) {
    const fecha = ctx.fechaCertificado || isoDeCex(cex?.informe?.emision);
    if (!fecha) return { aplica: true, fecha: null };
    return { aplica: fecha >= FECHA_GUIA, fecha };
}

// ─── Transmitancias frente a la guía ─────────────────────────────────────────

/**
 * La Guía con la que se compara ESTE certificado, por su fecha de emisión: desde
 * el 08/10/2026 la de CE3X 3.2 por cerramiento y con el periodo que DECLARA el
 * `.cex` (con el que CE3X calcularía sus «Estimados»); antes, la anterior (muro,
 * cubierta y suelo por año). Devuelve las U que valen para cada cerramiento.
 */
function guiaDelCertificado(ctx, { anio, zona, periodo, fecha }) {
    const G = ctx.guiaCe3x;
    if (G && (!fecha || fecha >= FECHA_GUIA_CE3X)) {
        const p = periodo && G.epocaDe(periodo) ? periodo : G.periodoDeAnio(anio);
        const u = (clave) => G.uCe3x(clave, { periodo: p, zona })?.u ?? null;
        const nbe = G.epocaDe(p) === 'nbe' ? `, NBE ${G.zonaNbe(zona)}` : '';
        return {
            nueva: true,
            //: Una cubierta vale plana o inclinada (solo difieren antes de 1980).
            refs: (t, c) => (t === 'fachada' && c.frontera === 'aire' ? [u('fachada_aire')]
                : t === 'cubierta' ? (c.frontera === 'terreno' ? [u('cubierta_terreno')]
                    : [u('cubierta_plana'), u('cubierta_inclinada')])
                : t === 'suelo' && c.modo === 'Conocidas'
                    ? [c.frontera === 'aire' ? u('suelo_aire') : u('suelo_terreno')]
                : []),
            texto: `CE3X «Estimados según antigüedad y zona» (${G.etiquetaPeriodo(p)}, ${zona || 'zona —'}${nbe}): `
                + `muro ${coma(u('fachada_aire'))} · cubierta ${coma(u('cubierta_plana'))}`
                + ` · suelo al aire ${coma(u('suelo_aire'))}`,
        };
    }
    const anterior = ctx.getUByYearGuiaAnterior || ctx.getUByYear;
    if (!anterior) return null;
    const g = anterior(anio, zona);
    return {
        nueva: false,
        refs: (t, c) => (t === 'fachada' && c.frontera === 'aire' ? [g.wall]
            : t === 'cubierta' ? [g.roof]
            : t === 'suelo' && c.modo === 'Conocidas' ? [g.floor] : []),
        texto: `Guía anterior: muro ${coma(g.wall)} · cubierta ${coma(g.roof)} · suelo ${coma(g.floor)} (${anio}, ${zona || 'zona —'})`,
    };
}

/**
 * Las transmitancias de fachadas, cubiertas y suelos, frente a la Guía de
 * Transmitancias de BROKERGY (la de su fecha: `guiaDelCertificado`).
 *
 * Qué se compara, y qué no:
 *   · fachada al aire → U de muro; cubierta → U de cubierta;
 *   · el SUELO solo si se ha declarado «Conocidas»: contra el terreno CE3X
 *     calcula la U él mismo con el perímetro, y comparar esa con la de la
 *     tabla daría un aviso en la mitad de los certificados (medido: 56 de 100);
 *   · las MEDIANERAS no: son adiabáticas y su U no describe nada.
 *
 * Con el `.cex` se sabe además el MODO (Conocidas / Estimadas / Por defecto);
 * sin él, se usa la U del `.xml`, que es la misma.
 */
function revisarTransmitancias(inf, rx, cex, ctx) {
    const anio = cex?.generales?.anio || rx.identificacion.anio_construccion;
    const zona = cex?.generales?.zona_he1 || rx.identificacion.zona_climatica;
    const { aplica, fecha } = aplicaGuia(ctx, cex);
    const G = anio ? guiaDelCertificado(ctx, { anio, zona, periodo: cex?.generales?.normativa, fecha }) : null;
    if (!anio || !G) {
        inf.anota('transmitancias', 'Transmitancias frente a la guía', 'no_comprobable', {
            dice: 'el certificado no declara el año de construcción',
            esperado: 'la U de la Guía de Transmitancias para su año y zona',
        });
        return;
    }
    const cer = cex ? cex.envolvente.cerramientos : rx.envolvente.opacos.map((o) => ({
        nombre: o.nombre, tipo: o.tipo, u: o.transmitancia,
        frontera: /medianer|adiab/i.test(o.tipo || '') ? 'edificio' : 'aire',
        modo: o.transmitancia_conocida ? 'Conocidas' : null,
    }));
    const mira = [];
    for (const c of cer) {
        const refs = G.refs(norm(c.tipo), c).filter((r) => r != null);
        if (!refs.length || c.u == null) continue;
        const iguales = refs.filter((r) => Math.abs(c.u - r) <= r * TOL_U + 0.005);
        mira.push({ ...c, ref: iguales[0] ?? refs[0], igual: iguales.length > 0 });
    }
    const dist = mira.filter((c) => !c.igual);
    const guia = G.texto;
    if (!mira.length) {
        inf.anota('transmitancias', 'Transmitancias frente a la guía', 'no_comprobable', {
            dice: 'no hay fachadas ni cubiertas que comparar', esperado: guia,
        });
        return;
    }
    const lista = dist.slice(0, 8).map((c) => `${c.nombre} ${coma(c.u)} (guía ${coma(c.ref)})`).join(' · ')
        + (dist.length > 8 ? ` · y ${dist.length - 8} más` : '');
    inf.anota('transmitancias', 'Transmitancias frente a la guía',
        !dist.length ? 'ok' : aplica ? 'aviso' : 'info', {
            dice: dist.length ? `${dist.length} de ${mira.length} distintas: ${lista}` : `las ${mira.length} coinciden`,
            esperado: guia,
            detalle: !dist.length ? null
                : aplica
                    ? `No coinciden con la Guía de Transmitancias${G.nueva ? ' (las que pone CE3X con «Estimados según antigüedad y zona climática»)' : ' anterior, la vigente cuando se emitió'}. Si hay motivo (proyecto, muro de piedra, cubierta rehecha), que conste; si no, que el certificador las ponga de la guía.`
                    : `Certificado de ${fecha ? fecha.split('-').reverse().join('/') : 'fecha desconocida'}, anterior a que se exigiera la guía (${FECHA_GUIA.split('-').reverse().join('/')}): solo se informa.`,
        });
}

// ─── La versión de CE3X ──────────────────────────────────────────────────────

//: Desde el 01/10/2026 se certifica con CE3X 3.1, y desde el 08/10/2026 con la
//: 3.2 (decisión del usuario). El cálculo es el mismo en las tres (medido con el
//: motor de cada una); la 3.2 guarda la misma forma que la 3.1 con otra cabecera.
const FECHA_CE3X_31 = '2026-10-01';
const FECHA_CE3X_32 = '2026-10-08';
const ddmm = (iso) => iso.split('-').reverse().join('/');

/**
 * Con qué versión de CE3X está hecho el `.cex` y, en la 3.x, si trae lo que
 * esa versión exige para calificar (superficie útil, nº de viviendas o
 * unidades de uso y plantas sobre rasante).
 *
 * AVISA, no bloquea: un certificado de la 2.3 o la 3.1 calcula lo mismo, y el
 * CEE final que la app saca de él ya sale en la 3.2 (se convierte al copiarlo).
 */
function revisarVersion(inf, rx, cex, ctx) {
    const v = cex?.version_ce3x || null;
    if (!v) {
        inf.anota('version_ce3x', 'Versión de CE3X', 'aviso', {
            dice: `cabecera «${cex?.version || '—'}»`,
            esperado: 'CE3X 3.2 (3.1 si es anterior al 08/10/2026; 2.3, al 01/10/2026)',
            detalle: 'No es una cabecera de .cex conocida: compruébalo abriéndolo en CE3X.',
        });
        return;
    }
    const fecha = ctx.fechaCertificado || isoDeCex(cex?.informe?.emision);
    const fechaTxt = fecha ? fecha.split('-').reverse().join('/') : null;
    if (v === '2.3') {
        const tarde = !fecha || fecha >= FECHA_CE3X_31;
        inf.anota('version_ce3x', 'Versión de CE3X', tarde ? 'aviso' : 'ok', {
            dice: `CE3X 2.3${fechaTxt ? ` · emitido el ${fechaTxt}` : ''}`,
            esperado: `CE3X 3.x desde el ${ddmm(FECHA_CE3X_31)} (la 3.2 desde el ${ddmm(FECHA_CE3X_32)})`,
            detalle: tarde
                ? 'Hecho con la 2.3 cuando ya se certifica con la 3.2. El cálculo es el mismo, pero el XML del certificado es el de la 3.x: que lo abra con CE3X 3.2, complete lo que pide (Datos generales —las plantas sobre y bajo rasante, del edificio entero— y la potencia de los equipos) y lo vuelva a guardar. El CEE final que saca la app de él ya sale en la 3.2.'
                : null,
        });
        return;
    }
    if (v === '3.1' && (!fecha || fecha >= FECHA_CE3X_32)) {
        inf.anota('version_ce3x_32', 'Versión de CE3X', 'aviso', {
            dice: `CE3X 3.1${fechaTxt ? ` · emitido el ${fechaTxt}` : ''}`,
            esperado: `CE3X 3.2 desde el ${ddmm(FECHA_CE3X_32)}`,
            detalle: 'Hecho con la 3.1 cuando ya se certifica con la 3.2. Tienen la misma forma y calculan igual: que lo abra con CE3X 3.2 y lo vuelva a guardar (o lo pasa la app con tools/convertir_cex.py, que solo cambia la cabecera).',
        });
    }
    const g = cex.generales || {};
    const faltan = [['superficie útil', g.superficie_util], ['nº de viviendas o unidades de uso', g.unidades_uso],
                    ['plantas sobre rasante', g.plantas_sobre_rasante]]
        .filter(([, x]) => !(Number(x) > 0)).map(([k]) => k);
    inf.anota('version_ce3x', 'Versión de CE3X', faltan.length ? 'aviso' : 'ok', {
        dice: faltan.length ? `CE3X ${v} · sin ${faltan.join(', ')}` : `CE3X ${v}`,
        esperado: `CE3X ${v} con sus datos generales completos`,
        detalle: faltan.length
            ? `CE3X ${v} no califica sin esos datos de Datos generales: que los complete y lo vuelva a guardar.`
            : null,
    });
    // Las placas de AUTOCONSUMO van en «Generación renovable eléctrica», mes a
    // mes; «Contribuciones energéticas» no debe usarse para la fotovoltaica
    // (manual de la 3.2, 7.1). Una 3.1 aún lo admitía; en la 3.2 es un aviso.
    const fvContribucion = (cex.equipos || []).filter((e) => e.slot === 'renovable'
        && /fotovolt|placas?\b|autoconsumo|\bFV\b/i.test(e.nombre || ''));
    if (fvContribucion.length) {
        inf.anota('fv_contribucion', 'Placas como «Contribución energética»', v === '3.2' ? 'aviso' : 'info', {
            dice: fvContribucion.map((e) => e.nombre).join(' · '),
            esperado: '«Generación renovable eléctrica»: potencia pico y autoconsumo mes a mes',
            detalle: 'En CE3X 3.2 la fotovoltaica va SIEMPRE en «Generación renovable eléctrica», con la potencia pico y el autoconsumo de cada mes (lo menor entre la producción y el consumo eléctrico de calefacción, refrigeración y ACS de ese mes). La pestaña de contribuciones es para «cogeneración y otras instalaciones».',
        });
    }
}

// ─── Datos generales ─────────────────────────────────────────────────────────

function revisarGenerales(inf, rx, cex, ctx) {
    const g = cex?.generales;
    if (!g) return;
    // Ventilación: la de la guía por año (`getVentanaYACHByYear`). Medido: 63 de
    // 142 aprobados llevan otra (casi siempre 0,83 en lugar de 1,00 antes de
    // 1979), así que va con la misma fecha de corte que las transmitancias.
    if (g.anio && ctx.getVentanaYACHByYear) {
        const ach = ctx.getVentanaYACHByYear(g.anio, g.zona_he1).ach;
        const igual = g.ventilacion != null && Math.abs(g.ventilacion - ach) < 0.011;
        const { aplica } = aplicaGuia(ctx, cex);
        inf.anota('ventilacion', 'Ventilación (renovaciones/hora)', igual ? 'ok' : aplica ? 'aviso' : 'info', {
            dice: `${coma(g.ventilacion)} ren/h`,
            esperado: `${coma(ach)} ren/h — guía para ${g.anio}`,
            detalle: igual ? null : aplica
                ? 'No es la de la guía, que es con la que se calculó la propuesta.'
                : 'Anterior a que se exigiera la guía: solo se informa.',
        });
    }
    // Año: el de la simulación (medido: coincide en 91 de 94).
    if (g.anio && ctx.anioOportunidad && g.anio !== ctx.anioOportunidad) {
        inf.anota('anio', 'Año de construcción', 'aviso', {
            dice: String(g.anio),
            esperado: `${ctx.anioOportunidad} — el de la simulación`,
            detalle: 'Del año salen las transmitancias y la ventilación de la guía: con otro año, el certificado y la propuesta describen dos casas distintas.',
        });
    } else if (g.anio) {
        inf.anota('anio', 'Año de construcción', 'ok', { dice: String(g.anio), esperado: ctx.anioOportunidad ? String(ctx.anioOportunidad) : 'el del Catastro' });
    }
    // Plantas, altura y demanda de ACS: se ENSEÑAN. Medido: el nº de plantas no
    // coincide con la oportunidad en 26 de 110 aprobados — la oportunidad cuenta
    // distinto —, así que como aviso solo sería ruido.
    inf.anota('generales', 'Datos generales', 'info', {
        dice: `${coma(g.superficie)} m² · ${coma(g.plantas, 0)} planta(s) · altura ${coma(g.altura_planta)} m · ACS ${coma(g.demanda_acs_l_dia, 0)} l/día · ${g.normativa || '—'} · ${g.zona_he1 || '—'}`,
        esperado: 'coherentes con la vivienda',
    });
}

// ─── Equipos existentes ──────────────────────────────────────────────────────

function revisarExistentes(inf, rx, cex, ctx) {
    if (!cex) return;
    const eq = cex.equipos;
    //: La caldera: cómo la ESTIMA el certificador. Solo informa (decisión de
    //: Fran): el estacional del .xml sale de aquí y el CIFO usa la tabla.
    const cald = eq.filter((e) => e.caldera);
    if (cald.length) {
        inf.anota('caldera_cex', 'Cómo se estima la caldera', 'info', {
            dice: cald.map((e) => `${e.nombre}: combustión ${coma(e.caldera.rend_combustion, 1)} % · ${e.caldera.aislamiento} · ${coma(e.caldera.potencia_kw, 1)} kW → estacional ${coma(e.rend_estacional.calefaccion ?? e.rend_estacional.acs, 1)} %`).join(' · '),
            esperado: ctx.calderaExp ? `tabla del expediente: ${ctx.calderaExp}` : 'la caldera del expediente',
        });
    }
    //: Depósito de ACS: solo está en el .cex.
    const conAcs = eq.filter((e) => e.servicios.acs);
    const dep = conAcs.find((e) => e.acumulacion);
    inf.anota('acumulacion_acs', 'Acumulación de ACS (depósito)', 'info', {
        dice: dep ? `${dep.nombre}: ${coma(dep.acumulacion.volumen_l, 0)} l` : 'sin depósito declarado',
        esperado: 'el depósito que tenga la vivienda',
    });
    //: Reparto: CE3X no calcula con un servicio sin cubrir al 100 %.
    for (const serv of ['calefaccion', 'acs']) {
        const suma = eq.reduce((s, e) => s + (e.servicios[serv]?.pct || 0), 0);
        if (conAcs.length || serv === 'calefaccion') {
            if (Math.abs(suma - 100) > 0.5 && !(serv === 'calefaccion' && ctx.sinCalefaccion)) {
                inf.anota(`reparto_${serv}`, `Reparto de ${serv === 'acs' ? 'ACS' : 'calefacción'}`, 'aviso', {
                    dice: `${coma(suma, 1)} % de la demanda cubierta`,
                    esperado: '100 %',
                    detalle: 'CE3X no da por bien definida una instalación que no cubre el 100 % (o lo pasa).',
                });
            }
        }
    }
    //: Lo que el cliente CONFIRMÓ al aceptar (aires y placas).
    const conf = ctx.confirmacion || {};
    const aires = conf.aire_acondicionado;
    if (aires === true && ctx.fase === 'inicial') {
        const frio = eq.filter((e) => e.servicios.refrigeracion);
        inf.anota('aires', 'Aire acondicionado que confirmó el cliente', frio.length ? 'ok' : 'aviso', {
            dice: frio.length ? frio.map((e) => e.nombre).join(' · ') : 'ningún equipo de refrigeración',
            esperado: `el cliente dijo tener aire acondicionado${conf.num_aires ? ` (${conf.num_aires})` : ''}`,
            detalle: frio.length ? null : 'Son equipos existentes y el CEE los tiene que recoger (en CAE, como «Equipo de sólo refrigeración»).',
        });
    }
    if (ctx.fotovoltaica === 'si') {
        //: En la 3.x van como «generador eléctrico» (slot 13), no como contribución.
        const fv = [...eq.filter((e) => e.slot === 'renovable' || /fotovolt|placas|solar/i.test(e.nombre || '')),
                    ...(cex.generadores_electricos || [])];
        inf.anota('placas', 'Placas fotovoltaicas existentes', fv.length ? 'ok' : 'aviso', {
            dice: fv.length ? fv.map((e) => e.nombre).join(' · ') : 'ninguna generación renovable eléctrica declarada',
            esperado: 'el cliente declaró tener placas: van como instalación EXISTENTE («Generación renovable eléctrica» en la 3.x)',
        });
    }
}

// ─── Huecos y puentes ────────────────────────────────────────────────────────

function revisarHuecosPuentes(inf, rx, cex) {
    if (!cex) return;
    const env = cex.envolvente;
    const fach = env.cerramientos.filter((c) => c.tipo === 'Fachada' && c.frontera === 'aire')
        .reduce((s, c) => s + (c.superficie || 0), 0);
    const huecos = env.huecos.filter((h) => h.tipo !== 'Lucernario');
    const sup = huecos.reduce((s, h) => s + (h.superficie || 0) * (h.multiplicador || 1), 0);
    if (!env.huecos.length) {
        inf.anota('huecos', 'Huecos (ventanas y puertas)', 'falla', {
            dice: 'el certificado no declara ningún hueco',
            esperado: 'las ventanas y puertas de la vivienda',
        });
    } else if (fach > 0) {
        const r = sup / fach;
        const raro = r < HUECOS_MIN || r > HUECOS_MAX;
        inf.anota('huecos', 'Huecos sobre fachada', raro ? 'aviso' : 'ok', {
            dice: `${huecos.length} huecos · ${coma(sup, 1)} m² sobre ${coma(fach, 1)} m² de fachada (${pct(r)})`,
            esperado: `entre ${pct(HUECOS_MIN)} y ${pct(HUECOS_MAX)} — lo habitual en lo aprobado`,
            detalle: raro ? (r < HUECOS_MIN
                ? 'Muy pocos huecos para esa fachada: puede faltar alguna ventana.'
                : 'Muchos huecos para esa fachada: puede haber alguno duplicado o mal medido.') : null,
        });
    }
    const tipos = new Set(env.puentes.map((p) => p.tipo));
    const faltan = PUENTES_BASE.filter((t) => !tipos.has(t) && !(t === 'Contorno de hueco' && !env.huecos.length));
    inf.anota('puentes', 'Puentes térmicos', faltan.length ? 'aviso' : 'ok', {
        dice: `${env.puentes.length} puentes · ${[...tipos].join(' · ') || 'ninguno'}`,
        esperado: PUENTES_BASE.join(' · '),
        detalle: faltan.length ? `Falta: ${faltan.join(', ')}. Los llevan más del 93 % de los certificados aprobados.` : null,
    });
}

// ─── La MEDIDA DE MEJORA del CEE inicial ─────────────────────────────────────

/**
 * La medida de mejora del CEE INICIAL: la que describe el certificado final.
 *
 * Lo que se exige (Fran, 29/09/2026): que exista en sustitución e hibridación
 * (en RES080 solo aviso: 20 de los 22 aprobados sin medida son RES080), que
 * esté CALCULADA, que se calculara sobre ESTE edificio y que su equipo y su
 * SCOP sean los del expediente —o, si el expediente aún no declara la máquina,
 * los de la simulación—.
 */
function revisarMedida(inf, rx, cex, ctx) {
    if (ctx.fase !== 'inicial') return;
    if (!cex) {
        inf.anota('medida', 'Medida de mejora', 'no_comprobable', {
            dice: `el .xml declara ${rx.medidas.length} medida(s)${rx.medidas.length ? `: ${rx.medidas.map((m) => m.nombre).join(' · ')}` : ''}`,
            esperado: 'la medida con el equipo del expediente, calculada',
            detalle: 'Qué equipo propone la medida y si está calculada solo se sabe con el .cex.',
        });
        return;
    }
    const obligatoria = ctx.ficha !== 'RES080';
    const med = cex.medidas;
    if (!med.length) {
        inf.anota('medida', 'Medida de mejora', obligatoria ? 'falla' : 'aviso', {
            dice: 'el .cex no lleva ninguna medida de mejora',
            esperado: ctx.esperado?.nombre ? `la aerotermia: ${ctx.esperado.nombre}` : 'la actuación del expediente',
            detalle: 'La app puede ponerla (la misma que se añade a mano); después hay que abrirlo en CE3X y pulsar «Actualizar».',
            accion: 'poner_medida',
        });
        return;
    }

    //: La medida que interesa es la que lleva la bomba de calor.
    const esBomba = (e) => /bomba de calor/i.test(e.generador || '');
    const m = med.find((x) => x.equipos.some(esBomba)) || med[0];
    const otras = med.filter((x) => x !== m).map((x) => x.nombre);

    inf.anota('medida', 'Medida de mejora', 'ok', {
        dice: `«${m.nombre}»${m.tipo ? ` (${m.tipo})` : ''}${otras.length ? ` · además: ${otras.join(', ')}` : ''}`,
        esperado: 'la actuación del expediente',
    });

    inf.anota('medida_calculada', 'Medida calculada en CE3X', m.calculada ? 'ok' : 'falla', {
        dice: m.calculada ? `calculada · ahorro ${m.ahorro.filter((x) => x).map((x) => coma(x, 1)).join(' · ')}` : 'definida, SIN calcular',
        esperado: 'calculada (botón «Actualizar» de Medidas de Mejora)',
        detalle: m.calculada ? null : 'Sin calcular, el certificado no lleva ni el ahorro ni la calificación de la medida.',
    });

    if (m.calculada) {
        const d = m.desfase || [];
        inf.anota('medida_desfase', 'Medida calculada sobre ESTE edificio', d.length ? 'falla' : 'ok', {
            dice: d.length ? `el edificio ha cambiado después de calcularla: ${d.slice(0, 5).join(' · ')}${d.length > 5 ? ` · y ${d.length - 5} más` : ''}` : 'la foto del edificio de la medida coincide con el fichero',
            esperado: 'la medida calculada sobre la versión actual del certificado',
            detalle: d.length ? 'El ahorro que declara la medida es el de otra versión del fichero: hay que volver a pulsar «Actualizar».' : null,
        });
    }

    const bombas = m.equipos.filter(esBomba);
    const esp = ctx.esperado;
    if (!bombas.length) {
        inf.anota('medida_equipo', 'Equipo de la medida', obligatoria ? 'falla' : 'aviso', {
            dice: m.equipos.map((e) => `${e.nombre} (${e.generador})`).join(' · ') || 'sin equipos',
            esperado: esp?.nombre || 'una bomba de calor',
            detalle: 'La medida no propone ninguna bomba de calor.',
        });
        return;
    }
    if (!esp) {
        inf.anota('medida_equipo', 'Equipo de la medida', 'no_comprobable', {
            dice: bombas.map((e) => e.nombre).join(' · '),
            esperado: 'el expediente no declara aerotermia y la simulación no tiene SCOP',
        });
        return;
    }

    // ── Equipo: por el MODELO, no por el nombre entero ──────────────────────
    const bCal = bombas.find((e) => e.servicios.calefaccion) || bombas[0];
    if (esp.generica) {
        inf.anota('medida_equipo', 'Equipo de la medida', 'info', {
            dice: bCal.nombre,
            esperado: 'el expediente aún no declara la aerotermia: se compara con la simulación',
        });
    } else {
        //: Se casa por lo que IDENTIFICA la máquina: cada trozo del modelo
        //: (lo de fuera y lo de dentro del paréntesis, sin separadores) y cada
        //: referencia con cifras. «AEROSUN CONFORT 12» casa con «CONFORT 12
        //: (NTII-12IIEN)»; «EBLA11D3V3» no casa con «EBLA11DA3V3», y está bien
        //: que no case: es otra referencia.
        const alnum = (x) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const trozos = String(esp.modelo || '').split(/[()+·/]/).map(alnum).filter((t) => t.length >= 5);
        const refs = String(esp.modelo || '').toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t.length >= 4 && /\d/.test(t));
        const nombreN = alnum(bCal.nombre);
        const casa = (!trozos.length && !refs.length)
            || trozos.some((t) => nombreN.includes(t)) || refs.some((t) => nombreN.includes(t));
        inf.anota('medida_equipo', 'Equipo de la medida', casa ? 'ok' : 'aviso', {
            dice: bCal.nombre,
            esperado: esp.nombre,
            detalle: casa ? null : 'La medida propone otra máquina que la del expediente.',
        });
    }

    // ── SCOP de calefacción ──────────────────────────────────────────────────
    const scopCee = bCal.rend_estacional.calefaccion != null ? bCal.rend_estacional.calefaccion / 100 : null;
    if (esp.scopCal && scopCee != null) {
        const ok = Math.abs(scopCee - esp.scopCal) <= esp.scopCal * TOL_SCOP_PCT / 100 + 0.005;
        inf.anota('medida_scop', 'SCOP de calefacción de la medida', ok ? 'ok' : 'aviso', {
            dice: `${coma(scopCee)} (${coma(bCal.rend_estacional.calefaccion, 0)} %)`,
            esperado: `${coma(esp.scopCal)} — ${esp.generica ? 'el simulado en la oportunidad' : 'el del expediente'}`,
            detalle: ok ? null : 'El SCOP que declara la medida no es el de la actuación: el ahorro y la calificación de la medida salen de él.',
        });
    }

    // ── ACS ──────────────────────────────────────────────────────────────────
    if (esp.hayAcs) {
        const bAcs = bombas.find((e) => e.servicios.acs);
        const scopDhw = bAcs?.rend_estacional.acs != null ? bAcs.rend_estacional.acs / 100 : null;
        if (!bAcs) {
            inf.anota('medida_acs', 'ACS en la medida', 'aviso', {
                dice: m.equipos.filter((e) => e.servicios.acs).map((e) => e.nombre).join(' · ') || 'nada cubre el ACS',
                esperado: 'la actuación toca el ACS: lo da la aerotermia',
            });
        } else if (esp.scopAcs && scopDhw != null) {
            const ok = Math.abs(scopDhw - esp.scopAcs) <= esp.scopAcs * TOL_SCOP_PCT / 100 + 0.005;
            inf.anota('medida_acs', 'SCOP de ACS de la medida', ok ? 'ok' : 'aviso', {
                dice: `${coma(scopDhw)} — ${bAcs.nombre}`,
                esperado: `${coma(esp.scopAcs)} — ${esp.generica ? 'el simulado' : 'el SCOP_dhw del expediente'}`,
            });
        }
    }
    const sumaAcs = m.equipos.reduce((s, e) => s + (e.servicios.acs?.pct || 0), 0);
    if (Math.abs(sumaAcs - 100) > 0.5) {
        inf.anota('medida_reparto_acs', 'ACS cubierto en la medida', 'falla', {
            dice: `${coma(sumaAcs, 1)} %`,
            esperado: '100 % (si no, CE3X no calcula la medida)',
        });
    }

    // ── Hibridación: el reparto es el C_b ────────────────────────────────────
    if (esp.hibridacion && esp.pctCal) {
        const pctBomba = bCal.servicios.calefaccion?.pct;
        const ok = pctBomba != null && Math.abs(pctBomba - esp.pctCal) <= 2;
        inf.anota('medida_cb', 'Reparto de la hibridación (C_b)', ok ? 'ok' : 'aviso', {
            dice: `bomba ${coma(pctBomba, 0)} % de la calefacción`,
            esperado: `${esp.pctCal} % — el C_b del expediente`,
            detalle: ok ? null : 'En una hibridación la bomba cubre el C_b de la demanda y la caldera el resto.',
        });
    }
}

/** Todas las del `.cex`, en el orden en que se leen en el informe. */
function revisarConCex(inf, rx, cex, ctx) {
    revisarVersion(inf, rx, cex, ctx);
    revisarGenerales(inf, rx, cex, ctx);
    revisarTransmitancias(inf, rx, cex, ctx);
    revisarHuecosPuentes(inf, rx, cex);
    revisarExistentes(inf, rx, cex, ctx);
    revisarMedida(inf, rx, cex, ctx);
}

module.exports = {
    revisarConCex,
    revisarTransmitancias,
    revisarVersion,
    FECHA_GUIA, FECHA_GUIA_CE3X, FECHA_CE3X_31, HUECOS_MIN, HUECOS_MAX, PUENTES_BASE, TOL_SCOP_PCT,
};
