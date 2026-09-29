// ============================================================================
// confirmacionCliente.js — lo que el CLIENTE confirma de su vivienda al aceptar
// la propuesta CAE (/firma/:id). FUENTE ÚNICA de las preguntas, su saneado y el
// contraste con lo que se supuso al simular.
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE: muchas simulaciones no las rellena el cliente sino nosotros,
// con lo que nos cuenta el instalador, y ahí se SUPONE: "radiadores", "no tiene
// placas". Esas dos suposiciones no son decorativas:
//   · el EMISOR fija la temperatura de impulsión, y con ella el SCOP y el
//     ahorro que acaba firmado en el CIFO;
//   · las PLACAS ya instaladas las tiene que declarar el CEE, y quien dice
//     "todavía no, pero me interesa" es la venta cruzada del momento del pago.
// Al aceptar se le pregunta al único que lo sabe seguro. Y de paso, si tiene
// AIRE ACONDICIONADO y cuántos aparatos: el CEE los declara como equipos de
// refrigeración existentes (regla 72), y no aparecen en ninguna simulación.
//
// REGLA — el aire acondicionado es una pregunta APARTE, no una opción del
// emisor. Puesto como "aparatos de aire" entre radiadores y suelo radiante,
// quien tiene un split para el verano lo marca aunque caliente con radiadores.
//
// REGLA — se pregunta en NEUTRO, sin preseleccionar lo supuesto. Con la
// respuesta ya marcada se pulsa "siguiente" sin leer, y confirmar la suposición
// es justo lo que no sirve.
//
// REGLA — las PLACAS se aplican solas; el EMISOR se PROPONE. Las placas no
// mueven ninguna cifra (solo qué declara el CEE), así que el expediente nace
// con lo que dice el cliente. El emisor mueve el SCOP y con él el ahorro y el
// bono: el expediente conserva el de la simulación y AVISA de la diferencia,
// con un botón que lo cambia por el mismo camino que el desplegable (que
// recalcula el SCOP). Lo decide una persona.
//
// Módulo JS PURO: lo usan la página pública, el módulo de Instalación y el
// backend por import() ESM (ver [[project_backend_importa_frontend_esm]]). Los
// imports llevan `.js` porque Node no resuelve sin extensión.
// ============================================================================

import { FV, FV_OPCIONES, normalizarEstado, normalizarFotovoltaica, etiquetaFotovoltaica } from './fotovoltaica.js';
import { resumenCuestionario } from '../../cee-directo/logic/cuestionarioCee.js';

/** Versión de las preguntas: se sella con la respuesta. Súbela si cambia su texto. */
export const CONFIRMACION_VERSION = '1';

export const EMISOR = {
    RADIADORES: 'radiadores',
    SUELO: 'suelo',
    MIXTO: 'mixto',     // suelo radiante en una parte y radiadores en otra
    NO_SE: 'no_se',     // otro sistema, o no lo sabe
};

/**
 * Cómo le llega el calor a cada habitación, con DOS redacciones:
 *  · `label` / `sub` — lenguaje de casa, lo que lee el cliente;
 *  · `corto`         — lo que lee el staff en el expediente y en el aviso.
 * Mismo criterio que `FV_OPCIONES` y `LABEL_CLIENTE`. Los dibujos van aparte
 * (src/components/IconosVivienda.jsx, compartidos con /reforma): este módulo lo lee Node.
 */
export const EMISOR_OPCIONES = [
    // `resumen`: cómo se le repite al cliente en la pantalla final ("Las dos
    // cosas", suelto, no dice nada; y `corto` habla de él en tercera persona).
    { value: EMISOR.RADIADORES, label: 'Radiadores', sub: 'Los de la pared, de hierro o aluminio, por los que pasa agua caliente', corto: 'Radiadores', resumen: 'Radiadores' },
    { value: EMISOR.SUELO, label: 'Suelo radiante', sub: 'El calor sale del suelo de la casa', corto: 'Suelo radiante', resumen: 'Suelo radiante' },
    { value: EMISOR.MIXTO, label: 'Las dos cosas', sub: 'Suelo radiante en una parte de la casa y radiadores en otra', corto: 'Suelo radiante + radiadores', resumen: 'Suelo radiante y radiadores' },
    { value: EMISOR.NO_SE, label: 'Otro sistema o no lo sé', sub: 'No pasa nada: lo comprobamos en la visita del certificado', corto: 'Otro sistema o no lo sabe', resumen: 'Otro sistema o no lo sé' },
];

/** ¿Tiene aire acondicionado? Mismos campos que el cuestionario de los CEE directos. */
export const AIRES_OPCIONES = [
    { value: true, label: 'Sí, tengo aire acondicionado', sub: 'Splits en la pared o por conductos en el techo, aunque solo los uses en verano', corto: 'Sí' },
    { value: false, label: 'No tengo', sub: 'Ningún aparato de aire acondicionado', corto: 'No' },
];

/** Tope de aparatos que se aceptan (una vivienda; más es una errata). */
export const MAX_AIRES = 20;

/** Placas: son las opciones del funnel de captación, con su mismo texto. */
export const PLACAS_OPCIONES = FV_OPCIONES;

/** Lo que tiene el formulario antes de contestar nada. */
export const CONFIRMACION_VACIA = Object.freeze({
    emisor: '',
    placas: '',
    placas_kwp: null,
    placas_kwp_nose: false,
    aire_acondicionado: null,
    num_aires: null,
});

/** Enum en minúsculas o null. Lo guardado puede venir en MAYÚSCULAS (normalizeData). */
export function normalizarEmisor(v) {
    const s = String(v ?? '').trim().toLowerCase();
    return Object.values(EMISOR).includes(s) ? s : null;
}

const labelEmisor = (v) => EMISOR_OPCIONES.find(o => o.value === normalizarEmisor(v))?.corto || null;

/**
 * Lo que falta por contestar, en palabras del cliente (bloquea el botón y se
 * dice). Con placas puestas, la potencia se contesta o se dice que no se sabe:
 * sin esa salida, quien no la sepa teclea cualquier número (mismo criterio que
 * el funnel de captación).
 */
export function faltanConfirmacion(c = {}) {
    const f = [];
    if (!normalizarEmisor(c.emisor)) f.push('cómo te llega el calor a las habitaciones');
    const placas = normalizarEstado(c.placas);
    if (!placas) f.push('si tienes placas solares fotovoltaicas');
    if (placas === FV.SI && !c.placas_kwp_nose && !(Number(c.placas_kwp) > 0)) {
        f.push('la potencia de tus placas (o marca «No lo sé»)');
    }
    if (c.aire_acondicionado !== true && c.aire_acondicionado !== false) f.push('si tienes aire acondicionado');
    if (c.aire_acondicionado === true && !(Number(c.num_aires) > 0)) f.push('cuántos aparatos de aire acondicionado tienes');
    return f;
}

const aBool = (v) => (v === true || v === 'true' ? true : (v === false || v === 'false' ? false : null));

/**
 * Del formulario (o de lo guardado) a la forma que se persiste. Lo que llega es
 * de un formulario PÚBLICO: solo pasan valores conocidos.
 * @returns {{ emisor, fotovoltaica, aire_acondicionado, num_aires } | null}
 */
export function sanearConfirmacion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const emisor = normalizarEmisor(raw.emisor);
    const estado = normalizarEstado(raw.placas ?? raw.fotovoltaica?.estado);
    const aire = aBool(raw.aire_acondicionado);
    if (!emisor && !estado && aire === null) return null;
    const kwpRaw = raw.placas_kwp ?? raw.fotovoltaica?.potencia_kwp;
    const kwp = Number(String(kwpRaw ?? '').replace(',', '.'));
    const n = Math.round(Number(String(raw.num_aires ?? '').replace(',', '.')));
    return {
        emisor,
        fotovoltaica: estado
            ? normalizarFotovoltaica({ estado, potencia_kwp: Number.isFinite(kwp) && kwp > 0 && kwp < 1000 ? kwp : null })
            : null,
        aire_acondicionado: aire,
        num_aires: aire === true && Number.isFinite(n) && n > 0 && n <= MAX_AIRES ? n : null,
    };
}

/** "Sí · 2 aparatos" / "No" / null. */
export function etiquetaAires(c) {
    const s = sanearConfirmacion(c);
    if (s?.aire_acondicionado == null) return null;
    if (!s.aire_acondicionado) return 'No';
    return s.num_aires ? `Sí · ${s.num_aires} ${s.num_aires === 1 ? 'aparato' : 'aparatos'}` : 'Sí';
}

// ─── Emisor: contraste con el expediente / la simulación ────────────────────

/** Familia de un `tipo_emisor` / `emitterType` de la app. */
export function familiaEmisor(tipoEmisor) {
    const v = String(tipoEmisor ?? '').trim().toLowerCase();
    if (v === 'suelo_radiante') return 'suelo';
    if (v.startsWith('radiadores')) return 'radiadores';
    if (['fancoils', 'splits', 'conductos'].includes(v)) return 'aire';
    return null;
}

const FAMILIA_TXT = { suelo: 'suelo radiante', radiadores: 'radiadores', aire: 'aparatos de aire' };

/**
 * El `tipo_emisor` que corresponde a lo declarado, o null si no se puede
 * deducir. Con radiadores se toma el CONVENCIONAL (55 °C): el cliente no sabe
 * si son de baja temperatura, y es lo mismo que asume el funnel. Con las DOS
 * cosas manda la temperatura más alta, la de los radiadores: la aerotermia
 * tiene que poder calentarlos. "Otro sistema o no lo sé" no propone nada.
 */
export function tipoEmisorDeDeclarado(emisor) {
    const e = normalizarEmisor(emisor);
    if (e === EMISOR.SUELO) return 'suelo_radiante';
    if (e === EMISOR.RADIADORES || e === EMISOR.MIXTO) return 'radiadores_convencionales';
    return null;
}

/**
 * ¿Lo que dice el cliente casa con el emisor que usa el cálculo?
 * @param {string} emisorDeclarado
 * @param {string} tipoEmisor  el de la simulación o el del expediente
 * @param {string} [donde]     cómo se nombra al otro lado ("el expediente", "la propuesta")
 * @returns {{ estado: 'coincide'|'difiere'|'sin_dato', texto: string|null, sugerido: string|null }}
 */
export function contrasteEmisor(emisorDeclarado, tipoEmisor, donde = 'el expediente') {
    const d = normalizarEmisor(emisorDeclarado);
    if (!d) return { estado: 'sin_dato', texto: null, sugerido: null };
    if (d === EMISOR.NO_SE) {
        return { estado: 'sin_dato', texto: 'El cliente no sabe qué emisores tiene, o tiene otro sistema: hay que comprobarlo en la visita del CEE.', sugerido: null };
    }
    const fam = familiaEmisor(tipoEmisor);
    const esperada = d === EMISOR.MIXTO ? 'radiadores' : d;
    if (!String(tipoEmisor ?? '').trim()) {
        return {
            estado: 'difiere',
            texto: `El cliente dice «${labelEmisor(d)}», y ${donde} no declaraba ningún emisor.`,
            sugerido: tipoEmisorDeDeclarado(d),
        };
    }
    if (fam === esperada) {
        return {
            estado: 'coincide',
            texto: d === EMISOR.MIXTO ? 'Tiene suelo radiante en una parte y radiadores en otra: manda la temperatura de los radiadores.' : null,
            sugerido: null,
        };
    }
    let efecto = 'Cambia la temperatura de impulsión, y con ella el SCOP y el ahorro.';
    if (fam === 'suelo' && esperada === 'radiadores') {
        efecto = 'Con radiadores la aerotermia trabaja más caliente: el SCOP real es MÁS BAJO que el calculado, y el ahorro también.';
    } else if (fam === 'radiadores' && esperada === 'suelo') {
        efecto = 'Con suelo radiante trabaja más fría: el SCOP real es MÁS ALTO que el calculado, y el ahorro sube.';
    }
    return {
        estado: 'difiere',
        texto: `El cliente dice «${labelEmisor(d)}», pero ${donde} usa ${FAMILIA_TXT[fam] || 'otro emisor'}. ${efecto}`,
        sugerido: tipoEmisorDeDeclarado(d),
    };
}

// ─── Placas: lo que manda y su contraste ─────────────────────────────────────

/**
 * Las placas con las que nace el expediente. Manda lo que dice el cliente; si
 * dice que SÍ pero no sabe la potencia, y la simulación ya la tenía, se conserva
 * esa cifra en vez de perderla. Sin respuesta del cliente, lo de siempre.
 */
export function fotovoltaicaResuelta(declarada, supuesta) {
    const d = normalizarFotovoltaica(declarada);
    const s = normalizarFotovoltaica(supuesta);
    if (!d.estado) return s;
    if (d.estado === FV.SI && d.potencia_kwp == null && s.estado === FV.SI && s.potencia_kwp) {
        return { ...d, potencia_kwp: s.potencia_kwp, potencia_desconocida: false };
    }
    return d;
}

/** @returns {{ estado: 'coincide'|'difiere'|'sin_dato', texto: string|null }} */
export function contrasteFotovoltaica(declarada, supuesta, donde = 'la propuesta') {
    const d = normalizarFotovoltaica(declarada);
    const s = normalizarFotovoltaica(supuesta);
    if (!d.estado) return { estado: 'sin_dato', texto: null };
    if (!s.estado) return { estado: 'coincide', texto: null }; // no se había preguntado: ahora sí se sabe
    if (d.estado === s.estado) {
        const dk = d.potencia_kwp, sk = s.potencia_kwp;
        if (d.estado === FV.SI && dk && sk && Math.abs(dk - sk) > 0.05) {
            return { estado: 'difiere', texto: `El cliente dice ${etiquetaFotovoltaica(d)}; en ${donde} constaba ${etiquetaFotovoltaica(s)}.` };
        }
        return { estado: 'coincide', texto: null };
    }
    return { estado: 'difiere', texto: `El cliente dice «${etiquetaFotovoltaica(d)}»; en ${donde} constaba «${etiquetaFotovoltaica(s)}».` };
}

// ─── Para leer de un vistazo (aviso al staff, historial, expediente) ────────

/**
 * Las respuestas en líneas legibles, con la diferencia frente a la simulación.
 * @param {object} conf       lo guardado (`confirmacion_cliente`)
 * @returns {Array<{ tema: string, valor: string, aviso: string|null }>}
 */
export function resumenConfirmacion(conf) {
    const c = sanearConfirmacion(conf);
    if (!c) return [];
    const sup = conf?.supuesto || {};
    const l = [];
    if (c.emisor) {
        const k = contrasteEmisor(c.emisor, sup.tipo_emisor, 'la propuesta');
        l.push({ tema: 'Calefacción', valor: labelEmisor(c.emisor), aviso: k.estado === 'difiere' ? k.texto : null });
    }
    if (c.fotovoltaica) {
        const k = contrasteFotovoltaica(c.fotovoltaica, sup.fotovoltaica);
        l.push({ tema: 'Placas fotovoltaicas', valor: etiquetaFotovoltaica(c.fotovoltaica), aviso: k.estado === 'difiere' ? k.texto : null });
    }
    const aires = etiquetaAires(c);
    if (aires) l.push({ tema: 'Aire acondicionado', valor: aires, aviso: null });
    return l;
}

// ─── Para el CERTIFICADOR (encargo del CEE) ──────────────────────────────────

/**
 * Los aires acondicionados que declaró el cliente, vengan de donde vengan.
 * CAE: `confirmacion_cliente` (al aceptar la propuesta). CEE directo: su
 * cuestionario (al aceptar la oferta). Preguntan lo mismo con otra forma.
 * @returns {{ tiene: boolean, num: number|null } | null}  null = no contestado
 */
export function airesDeclarados({ confirmacion = null, cuestionario = null } = {}) {
    const c = sanearConfirmacion(confirmacion);
    if (c?.aire_acondicionado != null) {
        return { tiene: c.aire_acondicionado, num: c.num_aires || null };
    }
    const q = cuestionario || {};
    const aa = q.aire_acondicionado === true ? true : (q.aire_acondicionado === false ? false : null);
    if (aa == null) return null;
    const n = Math.round(Number(q.num_aires));
    return { tiene: aa, num: aa && Number.isFinite(n) && n > 0 ? n : null };
}

/** Enteros que suman 100, repartidos entre `n` aparatos (5 → 20 · 20 · 20 · 20 · 20). */
export function repartoCien(n) {
    const k = Math.max(1, Math.round(Number(n) || 1));
    const base = Math.floor(100 / k);
    let resto = 100 - base * k;
    return Array.from({ length: k }, () => base + (resto-- > 0 ? 1 : 0));
}

/** "20 % cada uno" / "34, 33 y 33 %". */
export function textoReparto(n) {
    const r = repartoCien(n);
    if (r.every(p => p === r[0])) return `${r[0]} % cada uno`;
    return `${r.slice(0, -1).join(', ')} y ${r[r.length - 1]} %`;
}

/**
 * Lo que confirmó el cliente, dicho para el CERTIFICADOR en el encargo del CEE.
 *
 * POR QUÉ: el técnico llega a la visita sabiendo qué va a encontrar, y sobre
 * todo sabe cómo DECLARARLO. Los aires y las placas que ya tiene la vivienda son
 * instalaciones EXISTENTES que el CEE inicial tiene que recoger — y el final las
 * conserva al copiarlo—; si nadie se lo dice, se descubren en la visita o no se
 * descubren.
 *
 * REGLA — en un expediente CAE los aires van como SOLO FRÍO (máquina
 * frigorífica), repartiéndose el 100 % de la refrigeración: así los declaró el
 * certificador en 26RES060_206. En un CEE directo depende de para qué es: si es
 * para una deducción del IRPF (por los propios aires o por las placas) van como
 * calefacción Y refrigeración con bomba de calor (2026CEE_60); si no, solo frío.
 *
 * @returns {string} '' si no hay nada que decir
 */
export function bloqueConfirmacionCertificador({ confirmacion = null, cuestionario = null,
                                                 cae = true } = {}) {
    const filas = [];
    if (cae) {
        for (const r of resumenConfirmacion(confirmacion)) filas.push([r.tema, r.valor]);
    } else if (cuestionario) {
        filas.push(...resumenCuestionario(cuestionario));
    }
    if (!filas.length) return '';

    const l = [cae ? '🏠 *LO QUE HA CONFIRMADO EL CLIENTE AL ACEPTAR*'
                   : '🏠 *LO QUE HA CONTESTADO EL CLIENTE AL ACEPTAR*'];
    for (const [tema, valor] of filas) l.push(`• ${tema}: ${valor}`);

    const aires = airesDeclarados({ confirmacion, cuestionario });
    if (aires?.tiene) {
        const cuantos = aires.num ? `${aires.num} ${aires.num === 1 ? 'aparato' : 'aparatos'}` : 'los aparatos';
        const reparto = aires.num && aires.num > 1 ? ` (${textoReparto(aires.num)})` : '';
        l.push('');
        if (cae) {
            l.push(`❄️ Los aires acondicionados son equipos EXISTENTES: declara ${cuantos} en el CEE `
                   + 'como «Equipo de sólo refrigeración» (máquina frigorífica), repartiéndose entre '
                   + `todos el 100 % de la demanda de refrigeración${reparto}.`);
        } else {
            l.push(`❄️ Los aires acondicionados (${cuantos}) son equipos EXISTENTES. Si el CEE es para `
                   + 'una deducción del IRPF (por los propios aires o por las placas), decláralos como '
                   + '«Equipo de calefacción y refrigeración» con bomba de calor; si no, como «Equipo de '
                   + `sólo refrigeración» (máquina frigorífica). Entre todos, el 100 %${reparto}.`);
        }
    }
    const fv = cae ? sanearConfirmacion(confirmacion)?.fotovoltaica : null;
    if (fv?.estado === FV.SI || (!cae && cuestionario?.placas === 'si')) {
        if (!aires?.tiene) l.push('');
        l.push('☀️ Las placas fotovoltaicas son una instalación EXISTENTE: decláralas como '
               + 'contribución de autoconsumo, no como medida de mejora.');
    }
    return l.join('\n');
}

export { labelEmisor };
