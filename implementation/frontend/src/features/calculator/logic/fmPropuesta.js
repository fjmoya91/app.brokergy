/**
 * La hoja del FACTOR MULTIPLICADOR de la PROPUESTA (BOE-A-2026-23367): las dos
 * cifras de cada opción, el calendario, lo que tiene que conseguir el cliente y lo
 * que arriesga. Fuente única de las cifras y de los textos; `ProposalModal` solo
 * los pinta (hoja 2 y una línea en la fila del bono de la portada).
 *
 * Fran, 09/11/2026: «cuando demos la propuesta, quiero que demos el ejemplo con el
 * cálculo actual y con el factor multiplicador, y que quede claro que sería
 * solicitando a partir de enero […] una página más explicando cómo funciona el
 * factor multiplicador y qué tienen que conseguir […] tanto en RES060, RES093,
 * RES080, todos».
 *
 * REGLA — cada opción con SU ficha FM y las mismas condiciones que el párrafo del
 * mensaje (`avisoFc.estadoFc` / `estadoFm080`): solo si el FM sale MAYOR y nada lo
 * impide. Aerotermia → RES060_FM o la RES09x_FM de su zona; reforma → RES080_FM.
 *
 * REGLA — la cifra firme es la de la vía actual y la hoja lo dice; la del FM es una
 * posibilidad (cupo, requisitos, se pide desde el 15/01/2027) y lo dice también. Si
 * la vía FM no sale, se tramita por la actual con el MISMO Convenio (ficha principal
 * FM y subsidiaria la general, regla 200.d de documentos): el cliente no pierde la
 * ayuda, solo la espera.
 *
 * REGLA — lo que se le pide al CLIENTE es lo suyo (vivienda habitual, firmas, fechas
 * de las facturas); lo del instalador y los certificados se dicen en una línea:
 * los coordinamos nosotros. Nunca se le cuenta la fórmula ni los códigos internos.
 *
 * Detalle: docs/conocimiento/propuesta/la-hoja-del-factor-multiplicador.md
 */
import { estadoFc, estadoFm080 } from './avisoFc.js';
import {
    FM_INICIO_ACTUACIONES, FM_FIN_FACTURAS, FM_FIN_FACTURAS_CCPP,
    FM_PRESENTACION_DESDE, FM_PRESENTACION_HASTA, FM_PRESENTACION_HASTA_CCPP, tipologiaFM,
} from './res060fc.js';
import { esBloque } from './tipoInmueble.js';

const cierto = (v) => v === true || v === 'true' || v === 1 || v === '1';
const fechaEs = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/');
// Día siguiente a una fecha ISO («anteriores al …»).
const diaSiguiente = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
};
const fmt = (n) => new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: true,
}).format(Math.round(Number(n) || 0));
const fmt1 = (n) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

/** El código de la ficha vigente que corresponde a una ficha FM. */
export function fichaVigenteDe(fichaFm) {
    const f = String(fichaFm || '');
    if (f.startsWith('RES080')) return 'RES080';
    if (/^RES09\d/.test(f)) return 'RES093';
    return 'RES060';
}

/**
 * Las opciones de la propuesta que mejoran por la vía FM.
 *
 * @returns {{ procede:boolean, motivo:(string|null), opciones:Array<{
 *     clave:'aero'|'reforma', titulo:(string|null), ficha:string, fichaVigente:string,
 *     actual:number, fm:number, extra:number, veces:number, estimada:boolean,
 *     acs:(string|null) }>, principal:(object|null), reforma:boolean,
 *     hibridacion:boolean, comunidad:boolean, zonaFria:boolean, factor:number }}
 */
export function fmPropuesta(result, inputs = {}) {
    const isReforma = cierto(inputs?.isReforma);
    const soloReforma = isReforma && inputs?.comparativaReforma === false;
    const dos = isReforma && !soloReforma;
    const opciones = [];
    const motivos = [];

    const anadir = (clave, titulo, e) => {
        if (!e?.procede) { if (e?.motivo) motivos.push(e.motivo); return; }
        opciones.push({
            clave,
            titulo,
            ficha: e.ficha,
            fichaVigente: fichaVigenteDe(e.ficha),
            actual: e.actual,
            fm: e.fc,
            extra: e.extra,
            veces: e.actual > 0 ? e.fc / e.actual : 0,
            estimada: !!e.estimada,
            acs: e.acs || null,
        });
    };

    if (soloReforma) {
        anadir('reforma', null, estadoFm080(result));
    } else {
        // `estadoFc` con aerotermia es la Opción 1 (o la única): la RES060_FM / RES09x_FM.
        anadir('aero', dos ? 'Opción 1: Aerotermia' : null, estadoFc(result, inputs));
        if (dos) anadir('reforma', 'Opción 2: Aerotermia + reforma', estadoFm080(result));
    }

    const principal = opciones.reduce((m, o) => (!m || o.fm > m.fm ? o : m), null);
    const zona = String(inputs?.zona || '').trim().toUpperCase().charAt(0);
    const bloque = esBloque(inputs);
    return {
        procede: opciones.length > 0,
        motivo: opciones.length ? null : (motivos[0] || null),
        opciones,
        principal,
        reforma: opciones.some((o) => o.clave === 'reforma'),
        aero: opciones.some((o) => o.clave === 'aero'),
        hibridacion: opciones.some((o) => /^RES09\d/.test(o.ficha)),
        comunidad: bloque,
        zonaFria: zona === 'D' || zona === 'E',
        factor: tipologiaFM({ tipo: inputs?.tipo, bloque }).fm,
    };
}

/**
 * Los textos de la hoja, ya resueltos para ESTA propuesta. Al cliente se le habla
 * de usted, como en el resto del PDF.
 */
export function textosHojaFm(fm) {
    if (!fm?.procede) return null;
    const p = fm.principal;
    const finFact = fm.comunidad ? FM_FIN_FACTURAS_CCPP : FM_FIN_FACTURAS;
    const finPres = fm.comunidad ? FM_PRESENTACION_HASTA_CCPP : FM_PRESENTACION_HASTA;
    const aprox = p.estimada ? 'unos ' : '';
    const soloReforma = fm.reforma && !fm.aero;

    const intro = soloReforma
        ? `El BOE del 7 de noviembre de 2026 publicó una resolución del Ministerio para la Transición Ecológica (BOE-A-2026-23367) que multiplica el ahorro que se reconoce a la bomba de calor en una rehabilitación energética: por 2 en una vivienda unifamiliar, por 2,5 en un piso y por 3 en un edificio con calefacción central. Le explicamos qué supone para su reforma, cuándo se pide y qué hace falta.`
        : `El BOE del 7 de noviembre de 2026 publicó una resolución del Ministerio para la Transición Ecológica (BOE-A-2026-23367) que multiplica el ahorro que se reconoce al sustituir una caldera por una bomba de calor: por 2 en una vivienda unifamiliar, por 2,5 en un piso y por 3 en un edificio con calefacción central. Le explicamos qué supone para su actuación, cuándo se pide y qué hace falta.`;

    // Por qué no sale el doble exacto: lo que se multiplica es OTRO cálculo.
    const noDoble = soloReforma
        ? 'No es el doble de la cifra actual: el factor solo se aplica a la parte del ahorro que viene de la bomba de calor.'
        : `No es multiplicar por ${fmt1(fm.factor).replace(',0', '')} la cifra actual: la nueva ficha calcula el ahorro con otra fórmula y, sobre ese resultado, aplica el factor.`;

    const calendario = [
        { cuando: `Desde el ${fechaEs(FM_INICIO_ACTUACIONES)}`, que: 'Obra', d: 'Puede hacerla ya: valen las obras iniciadas desde esa fecha' },
        { cuando: fechaEs(FM_PRESENTACION_DESDE), que: 'Solicitud', d: 'Se abre la presentación por esta vía' },
        { cuando: `Antes del ${fechaEs(diaSiguiente(finFact))}`, que: 'Facturas', d: 'Fecha límite de las facturas de la obra' },
        { cuando: `Hasta el ${fechaEs(finPres)}`, que: 'Plazo', d: 'Último día para presentarla' },
        { cuando: 'Tras resolver', que: 'Cobro', d: 'El pago llega cuando se resuelve el expediente' },
    ];

    const requisitos = [];
    requisitos.push({
        t: 'Que sea su vivienda habitual',
        d: 'Las facturas de la luz (o del combustible) del 1 de noviembre al 31 de marzo del invierno anterior a la obra, seguidas, con el CUPS, la misma dirección que el Catastro y más de 75 kWh al mes de media. También vale la curva de consumo horario firmada por la distribuidora.',
    });
    if (fm.aero) {
        const acs = fm.opciones.find((o) => o.clave === 'aero')?.acs;
        const faltaAcs = acs === 'supuesto' || acs === 'sin_scop'
            ? ` Su presupuesto no incluye el agua caliente: habría que añadir el depósito de ACS${acs === 'supuesto' ? ' (la cifra ya lo tiene en cuenta)' : ''}.`
            : '';
        requisitos.push({
            t: fm.hibridacion ? 'Bomba de calor en paralelo con la caldera' : 'Aerotermia para calefacción y agua caliente',
            d: (fm.hibridacion
                ? 'La bomba de calor trabaja a la vez que la caldera, que se queda de apoyo, y da también el agua caliente sanitaria (ACS).'
                : 'La bomba de calor tiene que ser hidrónica (aire-agua) y cubrir la calefacción y el agua caliente sanitaria (ACS).') + faltaAcs,
        });
    }
    if (fm.reforma) {
        requisitos.push({
            t: 'Reforma y bomba de calor a la vez',
            d: 'La obra tiene que mejorar la envolvente (aislamiento, ventanas…) y sustituir la caldera por la bomba de calor. Hacen falta cuatro certificados energéticos: el previo (antes de empezar la obra) y el posterior, los dos registrados, y dos simulados. Los hacemos nosotros.',
        });
    }
    requisitos.push({
        t: 'Fechas y facturas',
        d: `Facturas con fecha posterior al ${fechaEs(FM_INICIO_ACTUACIONES)} y anterior al ${fechaEs(diaSiguiente(finFact))}, con el número de serie de los equipos.`,
    });
    // El consentimiento del IRPF (punto 12) y la oferta de mantenimiento (punto 8) son de
    // las fichas de la bomba (RES060_FM, RES09x_FM); la RES080_FM no los pide.
    requisitos.push({
        t: 'Sus firmas',
        d: fm.aero
            ? 'El Anexo A (declaración de las ayudas que haya pedido) y el Convenio de Cesión, en el que acepta que el bono es un aumento patrimonial que tributa en su IRPF y que el ahorro depende del funcionamiento de la bomba de calor. Y la oferta de mantenimiento de 2 años del instalador, aceptándola o no.'
            : 'El Anexo A (declaración de las ayudas que haya pedido) y el Convenio de Cesión.',
    });
    // El documento de la calificación F o G (punto 13) solo lo pide la sustitución
    // (RES060_FM / RES062_FM) en las zonas D y E; las hibridaciones no.
    if (fm.aero && !fm.hibridacion && fm.zonaFria) {
        requisitos.push({
            t: 'Si el certificado sale F o G',
            d: 'En su zona climática, con una calificación F o G hay que firmar que le hemos informado de que, por el aislamiento de la vivienda, la bomba de calor podría rendir menos de lo previsto.',
        });
    }
    requisitos.push({
        t: 'Lo del instalador y los certificados',
        d: fm.reforma && !fm.aero
            ? 'El certificado del director de la obra y la puesta en servicio de la instalación. Lo coordinamos nosotros.'
            : fm.hibridacion
                ? 'El certificado de la instalación, la puesta en servicio, el boletín de baja tensión y el certificado energético posterior registrado. Lo coordinamos nosotros.'
                : 'El certificado de la instalación, la puesta en servicio, el certificado energético posterior registrado y, si sube la potencia eléctrica, el boletín de baja tensión. Lo coordinamos nosotros.',
    });

    const riesgos = [
        'No está garantizado: hay un cupo (el 15 % de la obligación de ahorro de 2026) que se reparte por orden de resolución, y requisitos propios.',
        `Si no entra o no se cumple algún requisito, se tramita por la vía actual con el mismo Convenio y cobra los ${fmt(p.actual)} € de esta propuesta: no pierde la ayuda.`,
        'Se cobra más tarde: no se puede presentar antes del 15 de enero de 2027 y el pago llega cuando se resuelve.',
    ];
    if (p.estimada) {
        riesgos.unshift('La cifra es una estimación: se afina con dos certificados energéticos simulados que hacemos nosotros.');
    }

    const decision = `Usted decide. Puede aceptar esta propuesta igual: la obra y casi toda la documentación son las mismas, y antes de presentar el expediente le confirmaremos por qué vía va. Si prefiere cobrar antes, se presenta ya por la vía actual, por ${fmt(p.actual)} €.`;

    return {
        titular: `${aprox}${fmt(p.fm)} €`,
        intro,
        noDoble,
        calendario,
        requisitos,
        riesgos,
        decision,
        // La línea de la fila del bono de la portada, por opción.
        linea: (o) => `Con el factor multiplicador, pidiéndolo desde el 15/01/2027: ${o.estimada ? '≈ ' : ''}${fmt(o.fm)} € (ver página 2)`,
    };
}
