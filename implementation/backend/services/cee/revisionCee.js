// ============================================================================
// revisionCee.js — EL JUICIO. Cruza lo que dice el certificado con lo que el
// expediente dice que tenía que decir, y contesta punto por punto.
//
// Es la otra mitad de `radiografiaCee.js`: aquél lee HECHOS y éste los
// compara. Mismo reparto que `facturaOcrService` ↔ `facturaIncidencias` o
// `placaOcrService` ↔ `elegirPotencia`: el fichero (o el modelo) solo lee, y
// quién decide si eso está bien es código determinista, con la evidencia
// literal al lado para que cualquiera pueda reproducir por qué saltó.
//
// REGLA — esto PROPONE, no da el visto bueno. Devuelve un veredicto y la lista
// de comprobaciones; quien aprueba el certificado y le dice al certificador que
// lo registre sigue siendo una persona, desde el módulo CEE.
//
// REGLA — lo que NO SE PUEDE COMPROBAR se dice, no se calla. Un punto omitido
// en silencio se lee como un punto que está bien, y aquí eso significa dar por
// revisado algo que nadie ha mirado. Por eso existe el estado `no_comprobable`
// y cuenta aparte en el resumen.
// ============================================================================

const { detectPrograma, esSustitucionCaldera } = require('../../utils/fichas');
const { envolventeDeclarada } = require('../docsAlcance');
const { combustibleDeclarado, familiaCombustible, NOMBRE_FAMILIA } = require('../../utils/combustibleCaldera');
const { norm, ACUMULACION_SOLO_EN_CEX, MODO_ES } = require('./radiografiaCee');
const { fechaFirmaCee } = require('../../utils/ceeFechas');

/** Holgura relativa. La misma que ya se aplica al cruzar los dos CEE (regla 32). */
const HOLGURA_PCT = 2;

/**
 * Cuántos puntos de rendimiento pueden separar el η del certificado del η de la
 * casilla del Anexo VIII antes de decirlo. Es el MISMO umbral que ya aplica
 * `sugerirEdadDesdeRendimiento` al preseleccionar la casilla desde un CEE
 * cargado: si allí se avisa a partir de 8 puntos, aquí no puede ser otro número.
 */
const TOLERANCIA_RENDIMIENTO_PTS = 8;

/** Cómo se llama cada `<Tipo>` de cerramiento en la pestaña Envolvente. */
const FAMILIA_CERRAMIENTO = {
    fachada: 'fachada',
    cubierta: 'cubierta',
    suelo: 'suelo',
    lucernario: 'ventanas',
};

const ETIQUETA_COMBUSTIBLE = {
    gas_natural: 'gas natural', glp: 'GLP', gasoleo: 'gasóleo C',
    carbon: 'carbón', pellets: 'biomasa (pellets)', biomasa: 'biomasa',
    electricidad: 'electricidad', biocarburante: 'biocarburante',
};
const combustibleEs = (c) => ETIQUETA_COMBUSTIBLE[c] || c || 'sin declarar';

/** Una fecha ISO como la lee una persona. */
const esFecha = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

// ─── La lista de comprobaciones ──────────────────────────────────────────────

class Informe {
    constructor() { this.puntos = []; }

    /**
     * @param estado  'ok' | 'aviso' | 'falla' | 'no_comprobable'
     * @param dice    lo que dice el CERTIFICADO (la evidencia)
     * @param esperado lo que dice el EXPEDIENTE
     */
    anota(id, titulo, estado, { dice = null, esperado = null, detalle = null } = {}) {
        this.puntos.push({ id, titulo, estado, dice, esperado, detalle });
    }

    get resumen() {
        const cuenta = (e) => this.puntos.filter((p) => p.estado === e).length;
        return {
            ok: cuenta('ok'),
            avisos: cuenta('aviso'),
            fallas: cuenta('falla'),
            no_comprobables: cuenta('no_comprobable'),
            total: this.puntos.length,
        };
    }

    /**
     * REGLA — un `no_comprobable` NO tumba el certificado, pero tampoco deja
     * decir "APTO" a secas: el veredicto pasa a APTO CON AVISOS. Es lo que
     * distingue "lo he mirado y está bien" de "esto no lo he podido mirar".
     */
    get veredicto() {
        const r = this.resumen;
        if (r.fallas > 0) return 'NO APTO';
        if (r.avisos > 0 || r.no_comprobables > 0) return 'APTO CON AVISOS';
        return 'APTO';
    }
}

// ─── Comprobaciones ──────────────────────────────────────────────────────────

/**
 * El generador que se sustituye TIENE QUE ESTAR en el CEE inicial, y tiene que
 * ser el que dice el expediente.
 *
 * Es el punto que más se revisa a ojo y el que más caro sale si falla: un CEE
 * inicial que ya declara la bomba de calor describe la vivienda DESPUÉS de la
 * obra, así que el ahorro de la ficha se calcula contra un estado de partida
 * que no existió — y eso es lo primero que cruza un verificador.
 */
function revisarGeneradorInicial(inf, rx, ctx) {
    const { ficha, sinCalefaccion, combustibleExp } = ctx;
    const gens = rx.generadores.calefaccion;

    if (sinCalefaccion) {
        //: El expediente declara que la vivienda NO tenía calefacción (regla 8.d).
        //: 3 de los 462 certificados del corpus son justo eso, y son válidos.
        inf.anota('generador_inicial', 'Generador de calefacción existente',
            gens.length === 0 ? 'ok' : 'aviso', {
                dice: gens.length ? gens.map((g) => g.nombre || g.tipo).join(' · ') : 'no declara ninguno',
                esperado: 'el expediente declara que la vivienda NO tenía calefacción',
                detalle: gens.length
                    ? 'El certificado sí declara un generador. O el expediente está mal, o el certificado no es de esta vivienda.'
                    : null,
            });
        return;
    }

    if (gens.length === 0) {
        // REGLA — en un RES080 esto NO es un fallo. Allí la actuación es la
        // ENVOLVENTE, no el generador, así que una vivienda sin calefacción es
        // un caso legítimo: medido sobre los 115 expedientes con .xml en la BD,
        // los 3 certificados sin generador de calefacción son RES080. Pero de
        // los tres, dos declaran `rendimiento_id: 'default'` (η 0,92), o sea que
        // el expediente SÍ está suponiendo una caldera que el certificado no
        // reconoce — y eso hay que mirarlo, aunque no tumbe el certificado.
        const esReforma = !esSustitucionCaldera(ficha);
        inf.anota('generador_inicial', 'Generador de calefacción existente',
            esReforma ? 'aviso' : 'falla', {
                dice: 'el certificado no declara NINGÚN generador de calefacción',
                esperado: ctx.calderaExp || 'la caldera que se sustituye',
                detalle: esReforma
                    ? `En un ${ficha} la actuación es la envolvente, así que una vivienda sin calefacción es posible — pero el expediente supone «${ctx.calderaExp || 'una caldera'}». Si de verdad no tiene calefacción, decláralo en Instalación como «sin calefacción» en vez de dejar el rendimiento por defecto.`
                    : 'Sin el equipo de partida en el certificado, la actuación no tiene contra qué justificar el ahorro.',
            });
        return;
    }

    const nombres = gens.map((g) => `${g.nombre || '(sin nombre)'} — ${g.tipo}`).join(' · ');
    inf.anota('generador_inicial', 'Generador de calefacción existente', 'ok', {
        dice: nombres,
        esperado: ctx.calderaExp || null,
    });

    // ── ¿Es de combustión? ───────────────────────────────────────────────────
    if (esSustitucionCaldera(ficha)) {
        const desconocido = gens.filter((g) => !g.tipo_conocido);
        if (desconocido.length) {
            inf.anota('generador_combustion', 'El equipo de partida es de combustión', 'no_comprobable', {
                dice: desconocido.map((g) => g.tipo).join(' · '),
                esperado: 'una caldera de combustión',
                detalle: 'Ese tipo de generador no está entre los que conoce la app: lo tiene que mirar una persona.',
            });
        } else {
            const combustion = gens.filter((g) => g.es_combustion);
            inf.anota('generador_combustion', 'El equipo de partida es de combustión',
                combustion.length ? 'ok' : 'falla', {
                    dice: gens.map((g) => g.tipo).join(' · '),
                    esperado: `una caldera de combustión (la ficha ${ficha} sustituye caldera)`,
                    detalle: combustion.length ? null
                        : 'El certificado inicial NO declara una caldera de combustión. Si ya declara la bomba de calor, es el certificado de después de la obra.',
                });
        }
    }

    // ── El combustible ───────────────────────────────────────────────────────
    const vectores = [...new Set(gens.map((g) => g.combustible).filter(Boolean))];
    if (!combustibleExp) {
        inf.anota('combustible', 'Combustible del equipo que se sustituye', 'no_comprobable', {
            dice: vectores.map(combustibleEs).join(' · ') || 'sin declarar',
            esperado: 'el expediente no declara la casilla de rendimiento de la caldera',
        });
    } else if (!vectores.length) {
        inf.anota('combustible', 'Combustible del equipo que se sustituye', 'falla', {
            dice: 'el certificado no declara vector energético',
            esperado: combustibleEs(combustibleExp),
        });
    } else {
        // REGLA — se compara por FAMILIA, no letra por letra. La tabla del Anexo
        // VIII no distingue dentro de la familia (`gas_*` cubre gas natural y
        // GLP con la misma fila y el mismo η; `solid_*`, carbón y biomasa), así
        // que un vector distinto DE LA MISMA familia no mueve ni el rendimiento
        // ni el ahorro: es un aviso. Lo que falla es cambiar de familia, porque
        // entonces la fila del Anexo VIII es otra y con ella el ahorro del CIFO.
        // Medido sobre los 115 expedientes con .xml en la BD: 2 de las 4
        // discrepancias son de la misma familia y 2 cambian de fila.
        const famExp = familiaCombustible(combustibleExp);
        const exacto = vectores.includes(combustibleExp);
        const mismaFamilia = vectores.some((v) => familiaCombustible(v) === famExp);
        const estado = exacto ? 'ok' : mismaFamilia ? 'aviso' : 'falla';
        inf.anota('combustible', 'Combustible del equipo que se sustituye', estado, {
            dice: vectores.map(combustibleEs).join(' · '),
            esperado: combustibleEs(combustibleExp),
            detalle: exacto ? null
                : mismaFamilia
                    ? `Los dos son ${NOMBRE_FAMILIA[famExp] || famExp}, así que comparten fila del Anexo VIII y el ahorro no cambia. Aun así el certificado dice otra cosa que el expediente: decide cuál de los dos está bien.`
                    : 'Cambia la familia de combustible, y con ella la fila del Anexo VIII: de ahí salen el rendimiento y el ahorro que se le prometió al cliente.',
        });
    }

    // ── El η medido vs. la casilla del Anexo VIII ────────────────────────────
    const rends = gens.map((g) => g.rendimiento_pct).filter((v) => v !== null);
    if (ctx.rendimientoExpPct !== null && rends.length) {
        const cerca = rends.find((r) => Math.abs(r - ctx.rendimientoExpPct) <= TOLERANCIA_RENDIMIENTO_PTS);
        inf.anota('rendimiento', 'Rendimiento de la caldera', cerca !== undefined ? 'ok' : 'aviso', {
            dice: rends.map((r) => `${r.toFixed(1).replace('.', ',')} %`).join(' · '),
            esperado: `${ctx.rendimientoExpPct.toFixed(1).replace('.', ',')} % — ${ctx.calderaExp}`,
            detalle: cerca !== undefined ? null
                : `Se separan más de ${TOLERANCIA_RENDIMIENTO_PTS} puntos. El CIFO recalcula con la casilla del expediente, no con el η del certificado: si la casilla no es la que toca, el verificador no podrá reproducir el ahorro.`,
        });
    }
}

/**
 * El ACS: si la actuación lo toca, el certificado tiene que describirlo — y si
 * lo calienta la misma caldera, tiene que decirlo con la misma caldera.
 */
function revisarAcs(inf, rx, ctx) {
    const acs = rx.generadores.acs;
    const cal = rx.generadores.calefaccion;

    if (!ctx.tocaAcs) {
        inf.anota('acs_alcance', 'Agua caliente sanitaria', 'ok', {
            dice: acs.map((g) => `${g.nombre || '(sin nombre)'} — ${g.tipo}`).join(' · ') || 'no declara instalación de ACS',
            esperado: 'el ACS queda FUERA del alcance de esta actuación',
            detalle: 'No entra en el ahorro; solo se comprueba que el certificado no lo contradiga.',
        });
        return;
    }

    if (!acs.length) {
        inf.anota('acs_alcance', 'Agua caliente sanitaria', 'falla', {
            dice: 'el certificado no declara instalación de ACS',
            esperado: 'la actuación SÍ toca el ACS: tiene que estar descrito',
        });
        return;
    }

    const nombres = acs.map((g) => `${g.nombre || '(sin nombre)'} — ${g.tipo}`).join(' · ');
    if (ctx.mismaCalderaAcs === true && cal.length) {
        //: "La misma caldera" se comprueba por el NOMBRE y el tipo, que es lo que
        //: el certificado repite cuando el equipo es el mismo (medido: los 462
        //: llevan bloque de ACS y los mixtos lo repiten literalmente).
        const iguales = acs.some((a) => cal.some((c) => norm(a.nombre) === norm(c.nombre) && norm(a.tipo) === norm(c.tipo)));
        inf.anota('acs_alcance', 'El ACS lo da el mismo equipo', iguales ? 'ok' : 'aviso', {
            dice: nombres,
            esperado: `el mismo equipo que la calefacción — ${cal.map((c) => c.nombre).join(' · ')}`,
            detalle: iguales ? null
                : 'El expediente dice que el ACS lo da el mismo equipo que la calefacción, y el certificado declara otro aparato. Una de las dos cosas está mal.',
        });
    } else {
        inf.anota('acs_alcance', 'Agua caliente sanitaria', 'ok', {
            dice: nombres,
            esperado: 'la actuación toca el ACS',
        });
    }

    // ── La acumulación: EL XML NO LA DICE ────────────────────────────────────
    if (ACUMULACION_SOLO_EN_CEX && rx.acumulacion_acs === null) {
        inf.anota('acumulacion_acs', 'Acumulación de ACS (depósito)', 'no_comprobable', {
            dice: 'el .xml no declara acumulación en ninguno de sus nodos',
            esperado: 'depósito de ACS si la instalación lo tiene',
            detalle: 'Medido sobre 462 certificados reales: la acumulación NO viaja en el .xml, solo en el .cex. Hay que abrir el .cex (o mirarlo en CE3X) para comprobar este punto.',
        });
    }
}

/**
 * Las TRANSMITANCIAS deben estar justificadas, no puestas por defecto.
 *
 * REGLA — en el `.xml` el «Conocido» de CE3X se escribe **`Usuario`**; no existe
 * ninguna cadena «Conocido» (ver `MODO_CONOCIDO`). Los otros dos valores son
 * `PorDefecto` y `Estimado`, y los dos significan que nadie ha justificado esa U.
 *
 * REGLA — esto AVISA, no tumba el certificado. Un CEE con transmitancias por
 * defecto es válido; lo que pasa es que son el caso más desfavorable, dan más
 * demanda y con ella más ahorro, así que es de lo primero que un verificador
 * mira con lupa. Medido CON ESTE MISMO LECTOR sobre los 115 expedientes con
 * `.xml` en la BD: **65 de 115** tienen todas sus fachadas y cubiertas
 * justificadas — o sea que el criterio discrimina de verdad, pero como fallo
 * dejaría fuera a la mitad de la cartera.
 *
 * ⚠️ Esa cifra se midió con el lector, NO con una consulta SQL: una regex que
 * dé por hecho que `<ModoDeObtencion>` va pegado a `<Tipo>` cuenta mal, porque
 * el orden de los hijos de `<Elemento>` cambia entre ficheros. La primera
 * medición dijo «68 y 45» y era un artefacto.
 */
function revisarTransmitancias(inf, rx, ctx) {
    // Qué cerramientos cuentan: MUROS, CUBIERTA y PARTICIONES.
    //
    // ⚠️ El SUELO queda FUERA a propósito. Medido con este mismo lector sobre
    // los 115 expedientes con `.xml` en la BD: fachada 63 % justificadas,
    // cubierta 72 %, particiones 66 % y 56 %… y **suelo solo el 11 %**. Metido
    // en la cuenta, el aviso saltaría en casi los 115 y dejaría de leerse —
    // que es el vicio de siempre: un aviso que sale siempre enseña a ignorar la
    // lista entera. Sin él, 65 de 115 salen limpios y el aviso discrimina.
    // Cuando el suelo va por defecto se DICE en el detalle, sin disparar nada.
    //
    // Los PUENTES TÉRMICOS también quedan fuera —van por defecto en 19.999 de
    // las 29.780 apariciones del corpus— y los ADIABÁTICOS igual: su U no
    // describe nada, por definición no hay transferencia al otro lado (0 % de
    // los 204 del corpus están justificados, y es lo correcto).
    const MIRA = new Set(['fachada', 'cubierta',
        'particioninteriorvertical', 'particioninteriorhorizontal']);
    const clave = (o) => norm(o.tipo).replace(/\s/g, '');
    const opacos = rx.envolvente.opacos.filter((o) => MIRA.has(clave(o)));
    const suelos = rx.envolvente.opacos.filter((o) => clave(o) === 'suelo'
        && o.transmitancia_conocida === false);
    if (!opacos.length) {
        inf.anota('transmitancias', 'Transmitancias justificadas', 'no_comprobable', {
            dice: 'el certificado no declara cerramientos opacos',
            esperado: 'fachadas, cubierta, suelo y particiones',
        });
        return;
    }

    const sinJustificar = opacos.filter((o) => o.transmitancia_conocida === false);
    const sinModo = opacos.filter((o) => o.transmitancia_conocida === null);

    // ¿Alguno de los que NO está justificado es de los que se rehabilitan? En un
    // RES080 la U de partida de ESE elemento es la base del ahorro, así que ahí
    // el «por defecto» pesa mucho más que en una fachada que no se toca.
    const declarado = new Set(ctx.envolventeDeclarada || []);
    const enAlcance = sinJustificar.filter((o) => {
        const fam = FAMILIA_CERRAMIENTO[norm(o.tipo)];
        return fam && declarado.has(fam);
    });

    const resumen = (lista) => lista
        .map((o) => `${o.nombre} (${o.tipo}, ${MODO_ES[norm(o.modo_obtencion)] || o.modo_obtencion})`)
        .join(' · ');

    //: El SUELO no dispara el aviso, pero si va por defecto se dice: es un dato
    //: que el certificador puede querer justificar, no un descuido que ocultar.
    const notaSuelo = suelos.length
        ? ` (el suelo ${suelos.map((o) => o.nombre).join(', ')} también va por defecto, pero eso es lo normal: solo el 11 % de los certificados lo justifica)`
        : '';

    if (!sinJustificar.length && !sinModo.length) {
        inf.anota('transmitancias', 'Transmitancias justificadas', 'ok', {
            dice: `los ${opacos.length} cerramientos van como conocido (justificado)${notaSuelo}`,
            esperado: 'conocido, no «por defecto» ni «estimado» — muros, cubierta y particiones',
        });
        return;
    }

    inf.anota('transmitancias', 'Transmitancias justificadas', 'aviso', {
        dice: `${sinJustificar.length} de ${opacos.length} sin justificar — ${resumen(sinJustificar)}${notaSuelo}`,
        esperado: 'conocido (justificado), no «por defecto» ni «estimado» — muros, cubierta y particiones',
        detalle: enAlcance.length
            ? `⚠️ ${enAlcance.length} de ellos son elementos que este expediente REHABILITA (${enAlcance.map((o) => o.nombre).join(', ')}): su transmitancia de partida es la base del ahorro, así que ahí el «por defecto» es lo primero que mira el verificador.`
            : 'No invalida el certificado, pero las transmitancias por defecto son el caso más desfavorable: dan más demanda y con ella más ahorro.',
    });
}

/**
 * Las FECHAS: la del certificado, la de la visita, y la que consta en el
 * expediente — que es la que se le pide firmar.
 *
 * El visto bueno le dice al certificador «fírmalo con fecha X, la misma con la
 * que se emitió el certificado», y esa X sale de `fechaFirmaCee` (fuente única
 * en `utils/ceeFechas.js`). Si el `.xml` que entrega declara otra, el mensaje
 * que se le va a mandar pedirá una fecha que no es la de su propio certificado.
 */
function revisarFechas(inf, rx, ctx) {
    const delCee = rx.fechas.certificado;
    const visita = rx.fechas.visita;

    if (!delCee) {
        inf.anota('fecha_certificado', 'Fecha del certificado', 'no_comprobable', {
            dice: 'el certificado no declara fecha en <DatosDelCertificador>',
            esperado: ctx.fechaExpediente || 'la fecha de emisión',
        });
    } else if (delCee > ctx.hoy) {
        inf.anota('fecha_certificado', 'Fecha del certificado', 'falla', {
            dice: esFecha(delCee),
            esperado: `no puede ser posterior a hoy (${esFecha(ctx.hoy)})`,
        });
    } else if (!ctx.fechaExpediente) {
        inf.anota('fecha_certificado', 'Fecha del certificado', 'ok', {
            dice: esFecha(delCee),
            esperado: 'el expediente todavía no tiene fecha de firma anotada — se tomará ésta',
        });
    } else {
        const casa = delCee === ctx.fechaExpediente;
        inf.anota('fecha_certificado', 'Fecha del certificado', casa ? 'ok' : 'aviso', {
            dice: esFecha(delCee),
            esperado: `${esFecha(ctx.fechaExpediente)} — la que consta en el expediente`,
            detalle: casa ? null
                : `El visto bueno le pide firmar con la fecha del expediente (${esFecha(ctx.fechaExpediente)}) y su certificado dice otra. Corrige la del expediente antes de dárselo, o le pedirás una fecha que no es la suya.`,
        });
    }

    // ── La visita ────────────────────────────────────────────────────────────
    if (!visita) {
        //: `//` es lo que escribe CE3X cuando no hay visita: 18 de los 462.
        inf.anota('fecha_visita', 'Fecha de la visita', 'aviso', {
            dice: 'el certificado no declara fecha de visita',
            esperado: 'la fecha en que el técnico visitó la vivienda',
            detalle: 'Un CEE de una vivienda existente se levanta con una visita: sin su fecha, el certificado no acredita cuándo se tomaron los datos.',
        });
    } else if (delCee && visita > delCee) {
        inf.anota('fecha_visita', 'Fecha de la visita', 'falla', {
            dice: `visita ${esFecha(visita)}, certificado ${esFecha(delCee)}`,
            esperado: 'la visita tiene que ser anterior al certificado',
            detalle: 'No se puede certificar una vivienda antes de haberla visitado.',
        });
    } else {
        inf.anota('fecha_visita', 'Fecha de la visita', 'ok', {
            dice: esFecha(visita),
            esperado: delCee ? `anterior al certificado (${esFecha(delCee)})` : null,
        });
    }

    // ── El final tiene que ser posterior al inicial ──────────────────────────
    if (ctx.fechaOtraFase && delCee) {
        const [ini, fin] = ctx.fase === 'final'
            ? [ctx.fechaOtraFase, delCee] : [delCee, ctx.fechaOtraFase];
        const bien = fin >= ini;
        inf.anota('orden_fases', 'El CEE final es posterior al inicial', bien ? 'ok' : 'falla', {
            dice: `inicial ${esFecha(ini)} · final ${esFecha(fin)}`,
            esperado: 'el certificado posterior a la obra va después del de partida',
            detalle: bien ? null : 'Los dos certificados están intercambiados, o uno de ellos no es de esta obra.',
        });
    }
}

/** Quien firma el certificado tiene que ser el técnico al que se le encargó. */
function revisarCertificador(inf, rx, ctx) {
    const nifCee = norm(rx.certificador.nif).replace(/[^a-z0-9]/g, '');
    const quien = rx.certificador.nombre || rx.certificador.razon_social || '(sin nombre)';
    if (!ctx.nifCertificadorAsignado) {
        inf.anota('certificador', 'Quién firma el certificado', 'no_comprobable', {
            dice: `${quien}${nifCee ? ` · NIF ${rx.certificador.nif}` : ''}`,
            esperado: 'el expediente no dice qué certificador tiene asignado (o no consta su NIF)',
        });
        return;
    }
    const nifExp = norm(ctx.nifCertificadorAsignado).replace(/[^a-z0-9]/g, '');
    const nifEntidad = norm(rx.certificador.nif_entidad).replace(/[^a-z0-9]/g, '');
    //: Vale el NIF de la PERSONA o el de su ENTIDAD: un técnico puede ejercer en
    //: una empresa y firmar con su NIF personal mientras el expediente guarda el
    //: CIF de la sociedad, o al revés (regla 48.f).
    const casa = nifCee === nifExp || nifEntidad === nifExp;
    inf.anota('certificador', 'Quién firma el certificado', casa ? 'ok' : 'aviso', {
        dice: `${quien} · NIF ${rx.certificador.nif || '—'}${rx.certificador.nif_entidad ? ` · entidad ${rx.certificador.nif_entidad}` : ''}`,
        esperado: `${ctx.nombreCertificadorAsignado || 'el asignado'} · ${ctx.nifCertificadorAsignado}`,
        detalle: casa ? null
            : 'El certificado lo firma un técnico distinto del que consta asignado. Puede ser correcto (lo ha hecho un compañero de su despacho), pero conviene saberlo antes de dar el visto bueno.',
    });
}

/** La vivienda del certificado tiene que ser la del expediente. */
function revisarIdentificacion(inf, rx, ctx) {
    const rcCee = norm(rx.identificacion.ref_catastral).replace(/[^a-z0-9]/g, '');
    const rcExp = norm(ctx.refCatastralExp).replace(/[^a-z0-9]/g, '');
    if (rcCee && rcExp) {
        //: Se comparan los 14 primeros (la finca): los 20 llevan además el cargo
        //: del inmueble, y un certificado de la misma finca con otro cargo no es
        //: un certificado de otra vivienda. Mismo criterio que el OCR del RITE.
        const casa = rcCee.slice(0, 14) === rcExp.slice(0, 14);
        inf.anota('ref_catastral', 'Referencia catastral', casa ? 'ok' : 'falla', {
            dice: rx.identificacion.ref_catastral,
            esperado: ctx.refCatastralExp,
            detalle: casa ? null : 'El certificado es de otra finca.',
        });
    } else {
        inf.anota('ref_catastral', 'Referencia catastral', 'no_comprobable', {
            dice: rx.identificacion.ref_catastral || 'el certificado no la declara',
            esperado: ctx.refCatastralExp || 'el expediente no la declara',
        });
    }

    if (ctx.zonaExp && rx.identificacion.zona_climatica) {
        const casa = norm(ctx.zonaExp) === norm(rx.identificacion.zona_climatica);
        inf.anota('zona_climatica', 'Zona climática', casa ? 'ok' : 'aviso', {
            dice: rx.identificacion.zona_climatica,
            esperado: ctx.zonaExp,
            detalle: casa ? null : 'De la zona salen las transmitancias de referencia y el factor de corrección.',
        });
    }
}

/** Demanda y superficie, contra la simulación que se le presupuestó al cliente. */
function revisarDemanda(inf, rx, ctx) {
    const cmp = ctx.comparacionDemanda;
    if (!cmp) {
        inf.anota('demanda', 'Demanda y superficie frente a la propuesta', 'no_comprobable', {
            dice: `${rx.demanda.calefaccion ?? '—'} kWh/m²·año · ${rx.geometria.superficie_habitable ?? '—'} m²`,
            esperado: 'la oportunidad no llegó a calcular demanda (o no hay oportunidad detrás)',
        });
        return;
    }
    const pct = (v) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1).replace('.', ',')} %`);

    inf.anota('demanda', 'Demanda de calefacción frente a la propuesta',
        cmp.demanda.alerta ? 'falla' : 'ok', {
            dice: `${cmp.demanda.cee} kWh/m²·año`,
            esperado: `${Math.round(cmp.demanda.prop)} kWh/m²·año simulados (${pct(cmp.demanda.deltaPct)})`,
            detalle: !cmp.demanda.alerta ? null
                : cmp.esperaMenor
                    ? 'En el CEE final de un RES080 la demanda TIENE que bajar: es el ahorro que justifica la ficha. Si no baja, el certificado no recoge la mejora.'
                    : 'La demanda certificada queda por debajo de la simulada. Sobre esas cifras se le prometió el bono al cliente.',
        });

    if (cmp.superficie.cee) {
        inf.anota('superficie', 'Superficie frente a la propuesta',
            cmp.superficie.alerta ? 'falla' : 'ok', {
                dice: `${cmp.superficie.cee} m²`,
                esperado: `${Math.round(cmp.superficie.prop)} m² simulados (${pct(cmp.superficie.deltaPct)})`,
                detalle: cmp.superficie.alerta
                    ? 'La superficie certificada queda por debajo de la simulada, y el ahorro de la ficha se multiplica por ella.'
                    : null,
            });
    }
}

/**
 * RES080: qué elementos se sustituyen.
 *
 * REGLA — se comprueba comparando los DOS certificados elemento a elemento, NO
 * leyendo el texto de la medida de mejora. El `<Nombre>` de la medida es texto
 * libre y en el corpus dice cosas como «CEE FINAL.cex» o «MAE 1»: no prueba
 * nada. Lo que sí prueba es que la U de ESE hueco baje entre el antes y el
 * después, que además es lo que el verificador puede reproducir.
 */
function revisarEnvolvente(inf, cambios, ctx) {
    if (!cambios) {
        inf.anota('envolvente', 'Elementos de envolvente que se sustituyen', 'no_comprobable', {
            dice: 'solo se ha aportado un certificado',
            esperado: ctx.declarado
                ? `el expediente declara: ${ctx.declarado.join(' · ')}`
                : 'la pestaña Envolvente del expediente no declara nada',
            detalle: 'Para decir qué elementos cambian hacen falta los dos .xml (inicial y posterior).',
        });
        return;
    }

    const familias = new Set();
    const lineas = [];
    for (const h of cambios.huecos.cambiados) {
        familias.add('ventanas');
        lineas.push(`hueco ${h.nombre}: U ${h.u_antes} → ${h.u_despues}`);
    }
    for (const o of cambios.opacos.cambiados) {
        const fam = FAMILIA_CERRAMIENTO[norm(o.tipo)];
        if (fam) familias.add(fam);
        lineas.push(`${o.nombre}: U ${o.u_antes} → ${o.u_despues}`);
    }

    const declarado = new Set(ctx.declarado || []);
    const faltan = [...declarado].filter((f) => !familias.has(f));
    const sobran = [...familias].filter((f) => !declarado.has(f));

    let estado = 'ok';
    if (!familias.size) estado = 'falla';
    else if (faltan.length) estado = 'falla';
    else if (sobran.length) estado = 'aviso';

    inf.anota('envolvente', 'Elementos de envolvente que se sustituyen', estado, {
        dice: lineas.length ? lineas.join(' · ') : 'ningún cerramiento cambia entre los dos certificados',
        esperado: declarado.size ? [...declarado].join(' · ') : 'el expediente no declara envolvente',
        detalle: !familias.size
            ? 'Los dos certificados describen la MISMA envolvente. Un RES080 justifica su ahorro con la mejora de la envolvente: si no cambia nada, no hay nada que certificar.'
            : faltan.length ? `El expediente dice que se actúa sobre ${faltan.join(' y ')} y el certificado no lo recoge.`
                : sobran.length ? `El certificado mejora ${sobran.join(' y ')}, que el expediente no declara. Compruébalo en la pestaña Envolvente.`
                    : null,
    });
}

/** En el CEE posterior tiene que estar ya la máquina que se ha instalado. */
function revisarGeneradorFinal(inf, rx, ctx) {
    const gens = rx.generadores.calefaccion;
    if (!gens.length) {
        inf.anota('generador_final', 'Equipo instalado', 'falla', {
            dice: 'el certificado no declara generador de calefacción',
            esperado: ctx.aerotermiaExp || 'la bomba de calor instalada',
        });
        return;
    }
    const hayBomba = gens.some((g) => g.familia === 'bomba');
    const hayCaldera = gens.some((g) => g.es_combustion === true);
    //: En una HIBRIDACIÓN la caldera NO se retira: ahí conviven las dos, y eso
    //: es lo correcto (regla 48.g). En una sustitución, una caldera que sigue
    //: declarada significa que el certificado es el de antes de la obra.
    const estado = !hayBomba ? 'falla' : (hayCaldera && !ctx.esHibridacion) ? 'aviso' : 'ok';
    inf.anota('generador_final', 'Equipo instalado', estado, {
        dice: gens.map((g) => `${g.nombre || '(sin nombre)'} — ${g.tipo}`).join(' · '),
        esperado: ctx.aerotermiaExp || 'la bomba de calor instalada',
        detalle: !hayBomba
            ? 'El certificado posterior no declara ninguna bomba de calor: o es el certificado de antes de la obra, o la actuación no se ha recogido.'
            : (hayCaldera && !ctx.esHibridacion)
                ? 'Sigue declarando una caldera de combustión y la actuación no es de hibridación. Compruébalo.'
                : null,
    });
}

// ─── El punto de entrada ─────────────────────────────────────────────────────

/**
 * Revisa el certificado de una fase.
 *
 * @param {object}  o
 * @param {object}  o.radiografia    la del `.xml` de ESTA fase
 * @param {object} [o.otraFase]      la de la otra fase, si se ha aportado
 * @param {object}  o.expediente     la fila de `expedientes` (con `oportunidades`)
 * @param {'inicial'|'final'} o.fase
 * @param {object} [o.certificador]  la fila de `prescriptores` del técnico asignado
 * @returns {Promise<{fase, ficha, veredicto, resumen, comprobaciones, contexto}>}
 */
async function revisarCee({ radiografia, otraFase = null, expediente = {}, fase = 'inicial', certificador = null }) {
    const rx = radiografia;
    const op = expediente.oportunidades || expediente.oportunidad || {};
    const inputs = op.datos_calculo?.inputs || {};
    const inst = expediente.instalacion || {};
    const doc = expediente.documentacion || {};

    const ficha = detectPrograma(expediente, op);
    const rendimientoId = String(inst.caldera_antigua_cal?.rendimiento_id || '');
    const sinCalefaccion = rendimientoId === 'sin_calefaccion';

    //: La tabla del Anexo VIII es del frontend (ESM); el backend ya la carga así
    //: en `cifoService`. Se importa dentro para no obligar a todo el que
    //: requiera este módulo a arrastrar el bundle del frontend.
    const { BOILER_EFFICIENCIES } = await import(
        '../../../frontend/src/features/calculator/logic/calculation.js'
    );
    const fila = BOILER_EFFICIENCIES.find((b) => b.id === rendimientoId) || null;

    // La comparación con la propuesta la hace la MISMA función que el botón ⓘ de
    // la rejilla del CEE (regla: fuente única). Si aquí se decidiera por separado,
    // la pantalla y la revisión podrían dar veredictos distintos del mismo hecho.
    let comparacionDemanda = null;
    try {
        const { demandaPropuesta, compararDemanda, esperaDemandaMenor } = await import(
            '../../../frontend/src/features/expedientes/logic/demandaPropuesta.js'
        );
        const prop = demandaPropuesta(expediente);
        const esperaMenor = esperaDemandaMenor(prop, { section: fase, esReforma: ficha === 'RES080' });
        comparacionDemanda = compararDemanda(
            { demandaCalefaccion: rx.demanda.calefaccion, superficieHabitable: rx.geometria.superficie_habitable },
            prop,
            { esperaMenor },
        );
    } catch {
        comparacionDemanda = null;   // sin oportunidad detrás no hay nada que cruzar
    }

    const ctx = {
        ficha,
        sinCalefaccion,
        esHibridacion: ficha === 'RES093' || ficha === 'TER173',
        calderaExp: fila ? fila.label : null,
        rendimientoExpPct: fila && Number.isFinite(fila.value) ? fila.value * 100 : null,
        combustibleExp: combustibleDeclarado(inst, inputs),
        tocaAcs: inst.cambio_acs !== false,
        mismaCalderaAcs: inst.misma_caldera_acs,
        refCatastralExp: inst.ref_catastral || op.datos_calculo?.ref_catastral || null,
        zonaExp: inst.zona_climatica || inputs.climateZone || null,
        aerotermiaExp: inst.aerotermia_cal?.modelo
            ? `${inst.aerotermia_cal.marca || ''} ${inst.aerotermia_cal.modelo}`.trim() : null,
        comparacionDemanda,
        fase,
        hoy: new Date().toISOString().slice(0, 10),
        //: La fecha que el visto bueno le pide firmar. Fuente única en
        //: `utils/ceeFechas.js`: el mismo dato vive en `cee` y en
        //: `documentacion` según por qué superficie se guardara el expediente.
        fechaExpediente: fechaFirmaCee(expediente, fase),
        fechaOtraFase: otraFase ? otraFase.fechas.certificado : null,
        nifCertificadorAsignado: certificador?.cif || certificador?.nif_responsable || null,
        nombreCertificadorAsignado: certificador?.nombre_responsable || certificador?.razon_social || null,
        envolventeDeclarada: null,   // se rellena abajo, solo en RES080
    };

    //: El alcance de envolvente se resuelve ANTES de las comprobaciones porque
    //: lo mira también el punto de las transmitancias: en un RES080, un
    //: cerramiento sin justificar que además se rehabilita pesa mucho más.
    const env = ficha === 'RES080' ? envolventeDeclarada(doc.envolvente) : null;
    const declarado = env ? Object.entries(env).filter(([, v]) => v === true).map(([k]) => k) : null;
    ctx.envolventeDeclarada = declarado;

    const inf = new Informe();
    revisarIdentificacion(inf, rx, ctx);
    revisarCertificador(inf, rx, ctx);
    revisarFechas(inf, rx, ctx);
    if (fase === 'final') revisarGeneradorFinal(inf, rx, ctx);
    else revisarGeneradorInicial(inf, rx, ctx);
    revisarAcs(inf, rx, ctx);
    revisarDemanda(inf, rx, ctx);
    revisarTransmitancias(inf, rx, ctx);

    if (ficha === 'RES080') {
        let cambios = null;
        if (otraFase) {
            const { compararEnvolventes } = require('./radiografiaCee');
            cambios = fase === 'final'
                ? compararEnvolventes(otraFase, rx, HOLGURA_PCT / 100)
                : compararEnvolventes(rx, otraFase, HOLGURA_PCT / 100);
        }
        revisarEnvolvente(inf, cambios, { declarado });
    }

    return {
        fase,
        ficha,
        veredicto: inf.veredicto,
        resumen: inf.resumen,
        comprobaciones: inf.puntos,
        contexto: {
            expediente: expediente.numero_expediente || null,
            caldera_expediente: ctx.calderaExp,
            combustible_expediente: ctx.combustibleExp,
            toca_acs: ctx.tocaAcs,
        },
    };
}

module.exports = {
    revisarCee,
    HOLGURA_PCT,
    TOLERANCIA_RENDIMIENTO_PTS,
    FAMILIA_CERRAMIENTO,
};
