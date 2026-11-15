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

/**
 * Versión de las preguntas: se sella con la respuesta. Súbela si cambia su texto.
 * 2 (09/11/2026): la pregunta del BONO SOCIAL.
 */
export const CONFIRMACION_VERSION = '2';

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
    // Bono social (ver «Bono social» más abajo): la respuesta, de qué tipo si es
    // el de la luz, y si es familia numerosa.
    bono: '',
    bono_tipo: '',
    bono_fn: null,
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
export function faltanConfirmacion(c = {}, { bono = null } = {}) {
    const f = [];
    if (!normalizarEmisor(c.emisor)) f.push('cómo te llega el calor a las habitaciones');
    const placas = normalizarEstado(c.placas);
    if (!placas) f.push('si tienes placas solares fotovoltaicas');
    if (placas === FV.SI && !c.placas_kwp_nose && !(Number(c.placas_kwp) > 0)) {
        f.push('la potencia de tus placas (o marca «No lo sé»)');
    }
    if (c.aire_acondicionado !== true && c.aire_acondicionado !== false) f.push('si tienes aire acondicionado');
    if (c.aire_acondicionado === true && !(Number(c.num_aires) > 0)) f.push('cuántos aparatos de aire acondicionado tienes');
    if (bono) f.push(...faltaBonoSocial(c, bono));
    return f;
}

const aBool = (v) => (v === true || v === 'true' ? true : (v === false || v === 'false' ? false : null));

/**
 * Del formulario (o de lo guardado) a la forma que se persiste. Lo que llega es
 * de un formulario PÚBLICO: solo pasan valores conocidos.
 * @returns {{ emisor, fotovoltaica, aire_acondicionado, num_aires, aires_de? } | null}
 */
export function sanearConfirmacion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const emisor = normalizarEmisor(raw.emisor);
    const estado = normalizarEstado(raw.placas ?? raw.fotovoltaica?.estado);
    const aire = aBool(raw.aire_acondicionado);
    const bono = sanearBonoSocial(raw);
    if (!emisor && !estado && aire === null && !bono) return null;
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
        // Los aires los apuntamos en la OPORTUNIDAD, no los dijo el cliente
        // (`conAiresDeOportunidad`). Solo se conserva esa marca: lo que llega del
        // formulario público nunca la trae.
        ...(aire !== null && raw.aires_de === AIRES_DE_OPORTUNIDAD ? { aires_de: AIRES_DE_OPORTUNIDAD } : {}),
        // Solo si se preguntó (persona física y vivienda): ver «Bono social».
        ...(bono ? { bono_social: bono } : {}),
    };
}

// ─── Bono social ─────────────────────────────────────────────────────────────
//
// POR QUÉ SE PREGUNTA (Fran, 09/11/2026): sirve dos veces.
//   · el ANEXO I (y el Anexo A de la vía FM) declara si el titular percibe bono
//     social y cuál (`documentacion.subvenciones.bono_social`, logic/subvenciones.js);
//     hasta hoy nadie se lo preguntaba y salía «Ninguno de los anteriores»;
//   · el CONSUMIDOR VULNERABLE de la vía del factor multiplicador multiplica el
//     ahorro × 1,5 (fichas -S, `documentacion.via_fm.vulnerable`).
//
// QUÉ DICE EL BOE (BOE-A-2026-23367, Tercero a y b; el mismo párrafo del Anexo B):
// es vulnerable quien es consumidor vulnerable, vulnerable severo o en riesgo de
// exclusión social según el RD 897/2017 —o sea, quien tiene el bono social
// ELÉCTRICO—, «excluyendo aquellos beneficiarios del bono social eléctrico cuya
// condición derive exclusivamente de la posesión del título de familia numerosa
// sin cumplir los requisitos de renta». El bono TÉRMICO por sí solo no es el
// criterio. Y el RD habla del TITULAR DEL SUMINISTRO de su vivienda habitual: por
// eso se pregunta por la factura de la luz de ESTA vivienda.
//
// REGLA — la respuesta del cliente MARCA el vulnerable solo cuando no hay duda:
// bono de la luz y NO familia numerosa (casilla «No es familia numerosa» del
// Anexo B), o familia numerosa con el bono SEVERO o en riesgo de exclusión, que
// en una familia numerosa exigen la renta (casilla «… vulnerable severo»). Una
// familia numerosa con el bono de vulnerable puede tenerlo SOLO por el título:
// eso no se puede saber desde el móvil, y se deja para comprobarlo con la renta.
//
// REGLA — el bono social NO viaja al certificador. `confirmacion_cliente` sí
// viaja (encargo, app de certificadores) por los aires y las placas: el bono es
// un dato de la situación económica del hogar que el técnico no necesita, así
// que `conAiresDeOportunidad` (por donde pasa todo lo del CEE) lo quita y
// `resumenConfirmacion` (la pestaña CEE, el encargo) no lo enseña.

export const BONO = {
    NO: 'no',
    ELECTRICO: 'electrico',
    TERMICO: 'termico',
    NO_SE: 'no_se',
};

/** ¿Tienes el bono social? En lenguaje de casa (`label`/`sub`) y para el staff (`corto`). */
export const BONO_OPCIONES = [
    { value: BONO.NO, label: 'No', sub: 'Ni en la factura de la luz ni para la calefacción', corto: 'No' },
    { value: BONO.ELECTRICO, label: 'Sí, el bono social de la luz', sub: 'Un descuento en la factura de la luz como consumidor vulnerable, vulnerable severo o en riesgo de exclusión social', corto: 'Bono social eléctrico' },
    { value: BONO.TERMICO, label: 'Solo el bono social térmico', sub: 'La ayuda para la calefacción que se cobra una vez al año, sin descuento en la luz', corto: 'Solo el bono social térmico' },
    { value: BONO.NO_SE, label: 'No lo sé', sub: 'No pasa nada: lo comprobamos con tu factura de la luz', corto: 'No lo sabe' },
];

export const BONO_TIPO = {
    VULNERABLE: 'vulnerable',
    SEVERO: 'severo',
    EXCLUSION: 'exclusion',
    NO_SE: 'no_se',
};

/** El tipo de bono social eléctrico (los tres del RD 897/2017, como en el Anexo I). */
export const BONO_TIPO_OPCIONES = [
    { value: BONO_TIPO.VULNERABLE, label: 'Vulnerable', corto: 'consumidor vulnerable' },
    { value: BONO_TIPO.SEVERO, label: 'Vulnerable severo', corto: 'vulnerable severo' },
    { value: BONO_TIPO.EXCLUSION, label: 'En riesgo de exclusión social', corto: 'en riesgo de exclusión social' },
    { value: BONO_TIPO.NO_SE, label: 'No lo sé', corto: 'no sabe de qué tipo' },
];

/**
 * Qué se le pregunta a este cliente, o null si no se le pregunta:
 *  · null    — terciario o empresa (el bono social es de personas físicas, en su vivienda);
 *  · 'anexo' — solo si lo tiene y cuál (RES080: la RES080_FM no tiene variante -S);
 *  · 'fm'    — además si es familia numerosa (RES060 y RES093, que tienen la -S).
 */
export const PREGUNTA_BONO = { ANEXO: 'anexo', FM: 'fm' };

export function preguntaBonoSocial(programa) {
    const p = String(programa || '').toUpperCase();
    if (p === 'RES060' || p === 'RES093') return PREGUNTA_BONO.FM;
    if (p === 'RES080') return PREGUNTA_BONO.ANEXO;
    return null;
}

/** ¿El NIF es de una sociedad (CIF)? Una empresa no tiene bono social. */
export function esNifDeEmpresa(nif) {
    const s = String(nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s);
}

const enumDe = (v, valores) => {
    const s = String(v ?? '').trim().toLowerCase();
    return valores.includes(s) ? s : null;
};

/**
 * Del formulario (`bono`, `bono_tipo`, `bono_fn`) o de lo guardado
 * (`bono_social: { respuesta, tipo, familia_numerosa }`) a lo que se guarda.
 * Formulario PÚBLICO: solo pasan valores conocidos; el tipo y la familia
 * numerosa, solo con el bono de la luz.
 * @returns {{ respuesta, tipo, familia_numerosa } | null}
 */
export function sanearBonoSocial(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const g = raw.bono_social && typeof raw.bono_social === 'object' ? raw.bono_social : null;
    const respuesta = enumDe(g ? g.respuesta : raw.bono, Object.values(BONO));
    if (!respuesta) return null;
    const electrico = respuesta === BONO.ELECTRICO;
    return {
        respuesta,
        tipo: electrico ? enumDe(g ? g.tipo : raw.bono_tipo, Object.values(BONO_TIPO)) : null,
        familia_numerosa: electrico ? aBool(g ? g.familia_numerosa : raw.bono_fn) : null,
    };
}

// Acepta lo guardado (`{ respuesta, tipo, familia_numerosa }`) o lo que lo
// contiene (una confirmación, el formulario).
const leerBono = (x) => (x && typeof x === 'object' && 'respuesta' in x
    ? sanearBonoSocial({ bono_social: x }) : sanearBonoSocial(x));

/** Lo que falta de la pregunta del bono, en palabras del cliente. */
export function faltaBonoSocial(c = {}, pregunta = PREGUNTA_BONO.FM) {
    if (!pregunta) return [];
    const b = sanearBonoSocial(c);
    if (!b) return ['si tienes el bono social'];
    const f = [];
    if (b.respuesta === BONO.ELECTRICO && !b.tipo) f.push('qué tipo de bono social tienes (o marca «No lo sé»)');
    if (b.respuesta === BONO.ELECTRICO && pregunta === PREGUNTA_BONO.FM && b.familia_numerosa == null) {
        f.push('si tienes el título de familia numerosa');
    }
    return f;
}

/**
 * Lo declarado, en los ids del apartado 4 del Anexo I (logic/subvenciones.js), o
 * null si no hay nada que declarar (no, no lo sabe, o no se preguntó). El bono de
 * la luz de tipo desconocido se declara como «consumidores vulnerables»: el
 * severo y el de exclusión son casos de vulnerable (RD 897/2017, art. 3), y el
 * equipo lo afina con la factura.
 * @returns {{ percibe: true, tipos: string[] } | null}
 */
export function bonoSocialParaSubvenciones(bonoRaw) {
    const b = leerBono(bonoRaw);
    if (!b) return null;
    if (b.respuesta === BONO.TERMICO) return { percibe: true, tipos: ['termico'] };
    if (b.respuesta !== BONO.ELECTRICO) return null;
    const id = b.tipo === BONO_TIPO.SEVERO ? 'electrico_vulnerable_severo'
        : b.tipo === BONO_TIPO.EXCLUSION ? 'electrico_riesgo_exclusion'
            : 'electrico_vulnerable';
    return { percibe: true, tipos: [id] };
}

/**
 * ¿Lo declarado hace al hogar CONSUMIDOR VULNERABLE de la vía FM (× 1,5, -S)?
 * @returns {{ vulnerable: boolean, anexo_b_casilla: 'severo'|'no_fn'|null,
 *             pendiente: string|null, texto: string|null }}
 *   `pendiente`: qué hay que comprobar antes de marcarlo (la familia numerosa).
 */
export function vulnerableFmDeBono(bonoRaw) {
    const b = leerBono(bonoRaw);
    const no = (texto = null, pendiente = null) => ({ vulnerable: false, anexo_b_casilla: null, pendiente, texto });
    if (!b) return no();
    if (b.respuesta === BONO.TERMICO) return no('Solo el bono térmico: no basta para la ficha -S (la Resolución pide el del RD 897/2017, el de la luz).');
    if (b.respuesta === BONO.NO_SE) return no(null, 'No sabe si tiene bono social: compruébalo en su factura de la luz.');
    if (b.respuesta !== BONO.ELECTRICO) return no();
    if (b.familia_numerosa === false) {
        return { vulnerable: true, anexo_b_casilla: 'no_fn', pendiente: null,
                 texto: 'Bono social de la luz y no es familia numerosa: consumidor vulnerable (× 1,5).' };
    }
    if (b.familia_numerosa === true && (b.tipo === BONO_TIPO.SEVERO || b.tipo === BONO_TIPO.EXCLUSION)) {
        return { vulnerable: true, anexo_b_casilla: 'severo', pendiente: null,
                 texto: 'Familia numerosa con el bono severo (o en riesgo de exclusión), que exige la renta: consumidor vulnerable (× 1,5).' };
    }
    if (b.familia_numerosa === true) {
        return no(null, 'Familia numerosa con el bono social de la luz: solo cuenta como vulnerable si además cumple la renta del RD 897/2017 (la Resolución excluye a quien lo tiene solo por el título). Compruébalo antes de marcarlo.');
    }
    return no(null, 'Tiene el bono social de la luz, pero no consta si es familia numerosa.');
}

/** «Bono social eléctrico · vulnerable severo · no es familia numerosa» (para el staff). */
export function etiquetaBonoSocial(bonoRaw) {
    const b = leerBono(bonoRaw);
    if (!b) return null;
    const base = BONO_OPCIONES.find(o => o.value === b.respuesta)?.corto || null;
    if (b.respuesta !== BONO.ELECTRICO) return base;
    const partes = [base];
    const tipo = BONO_TIPO_OPCIONES.find(o => o.value === b.tipo)?.corto;
    if (tipo) partes.push(tipo);
    if (b.familia_numerosa === true) partes.push('familia numerosa');
    else if (b.familia_numerosa === false) partes.push('no es familia numerosa');
    return partes.join(' · ');
}

/** Lo mismo, dicho como lo diría el cliente (resumen de su aceptación). */
export function etiquetaBonoCliente(c) {
    const b = sanearBonoSocial(c);
    if (!b) return '—';
    if (b.respuesta !== BONO.ELECTRICO) return BONO_OPCIONES.find(o => o.value === b.respuesta)?.label || '—';
    const tipo = BONO_TIPO_OPCIONES.find(o => o.value === b.tipo);
    return tipo && b.tipo !== BONO_TIPO.NO_SE ? `Sí, el de la luz · ${tipo.label.toLowerCase()}` : 'Sí, el de la luz';
}

/** La confirmación SIN el bono social: lo que puede ver el certificador. */
export function sinBonoSocial(c) {
    if (!c || typeof c !== 'object' || !('bono_social' in c)) return c;
    const { bono_social: _fuera, ...resto } = c;
    return resto;
}

/**
 * El bono social que declaró el cliente al aceptar: el del expediente
 * (`instalacion.confirmacion_cliente`) o el de su oportunidad, el más reciente.
 * La oportunidad cuenta cuando el expediente ya existía al aceptar (el alta no
 * vuelve a copiar la confirmación) o cuando se volvió a aceptar después.
 * @returns {{ bono_social: object, fecha: string|null } | null}
 */
export function bonoDeclaradoDe(expediente) {
    const cands = [expediente?.instalacion?.confirmacion_cliente, expediente?.oportunidades?.datos_calculo?.confirmacion_cliente]
        .filter(c => c && typeof c === 'object' && sanearBonoSocial(c));
    if (!cands.length) return null;
    cands.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    return { bono_social: sanearBonoSocial(cands[0]), fecha: cands[0].fecha || null };
}

/** ¿La confirmación guardada hace vulnerable al hogar (vía FM)? Para la oportunidad. */
export const vulnerableDeConfirmacion = (conf) => vulnerableFmDeBono(conf?.bono_social).vulnerable;

/** "Sí · 2 aparatos" / "No" / null. */
export function etiquetaAires(c) {
    const s = sanearConfirmacion(c);
    if (s?.aire_acondicionado == null) return null;
    if (!s.aire_acondicionado) return 'No';
    return s.num_aires ? `Sí · ${s.num_aires} ${s.num_aires === 1 ? 'aparato' : 'aparatos'}` : 'Sí';
}

// ─── Aires apuntados en la OPORTUNIDAD ───────────────────────────────────────
//
// La misma pregunta del cuestionario («¿tiene aire acondicionado? ¿cuántos?»),
// contestada por nosotros en la calculadora con lo que cuenta el instalador o
// se ve en las fotos: `datos_calculo.inputs.aires = { tiene, num }`, que el
// expediente hereda en `instalacion.aires`. Sin ella, los aires solo llegaban
// al CEE si el cliente los decía al ACEPTAR, y el CEE inicial se hace muchas
// veces antes (desde la propia oportunidad).
//
// REGLA — lo que dice el CLIENTE al aceptar MANDA; lo de la oportunidad es lo
// que se usa mientras no ha contestado. Y se dice de dónde sale: el encargo no
// puede poner en boca del cliente lo que apuntamos nosotros.

export const AIRES_DE_OPORTUNIDAD = 'oportunidad';

/** `inputs.aires` / `instalacion.aires` → `{ tiene, num }`, o null si no se ha contestado. */
export function normalizarAiresOportunidad(v) {
    if (!v || typeof v !== 'object') return null;
    const tiene = aBool(v.tiene);
    if (tiene === null) return null;
    const n = Math.round(Number(String(v.num ?? '').replace(',', '.')));
    return { tiene, num: tiene && Number.isFinite(n) && n > 0 && n <= MAX_AIRES ? n : null };
}

/**
 * La confirmación del cliente con los aires de la oportunidad DEBAJO: si el
 * cliente contestó a los aires, se devuelve tal cual; si no, lleva los de la
 * oportunidad marcados con `aires_de: 'oportunidad'`. Así todo lo que ya lee los
 * aires de `confirmacion_cliente` (encargo, revisión del CEE, envolvente) los
 * recibe sin tener que mirar en dos sitios.
 */
export function conAiresDeOportunidad(confirmacion, airesOportunidad) {
    // Todo lo que pasa por aquí acaba en el CEE (encargo, app de certificadores,
    // revisión, envolvente): sin el bono social (ver «Bono social»).
    const c = confirmacion && typeof confirmacion === 'object' ? sinBonoSocial(confirmacion) : null;
    if (c && aBool(c.aire_acondicionado) !== null) return c;
    const a = normalizarAiresOportunidad(airesOportunidad);
    if (!a) return c;
    return { ...(c || {}), aire_acondicionado: a.tiene, num_aires: a.num, aires_de: AIRES_DE_OPORTUNIDAD };
}

/** ¿Los aires de esta confirmación los apuntamos en la oportunidad? */
export const airesDeOportunidad = (c) => c?.aires_de === AIRES_DE_OPORTUNIDAD;

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
    if (aires && airesDeOportunidad(c)) {
        l.push({ tema: 'Aire acondicionado (apuntado en la oportunidad)', valor: aires, aviso: null });
    } else if (aires) {
        const supAires = etiquetaAires(conAiresDeOportunidad(null, sup.aires));
        l.push({ tema: 'Aire acondicionado', valor: aires,
                 aviso: supAires && supAires !== aires ? `En la oportunidad constaba «${supAires}».` : null });
    }
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
 * frigorífica), como los declaró el certificador en 26RES060_206, y cada uno con
 * la parte que enfría de verdad (~40 m², la regla de `repartoAires` en
 * fichaCe3x.js, 2026-10-08). En un CEE directo depende de para qué es: si es
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

    // Si lo único que hay son los aires apuntados en la oportunidad, el cliente
    // no ha confirmado nada todavía: no se le atribuye.
    const s = cae ? sanearConfirmacion(confirmacion) : null;
    const soloOportunidad = !!s && !s.emisor && !s.fotovoltaica && airesDeOportunidad(s);
    const l = [soloOportunidad ? '🏠 *LO QUE CONSTA DE LA VIVIENDA*'
               : cae ? '🏠 *LO QUE HA CONFIRMADO EL CLIENTE AL ACEPTAR*'
                     : '🏠 *LO QUE HA CONTESTADO EL CLIENTE AL ACEPTAR*'];
    for (const [tema, valor] of filas) l.push(`• ${tema}: ${valor}`);

    const aires = airesDeclarados({ confirmacion, cuestionario });
    if (aires?.tiene) {
        const cuantos = aires.num ? `${aires.num} ${aires.num === 1 ? 'aparato' : 'aparatos'}` : 'los aparatos';
        const reparto = aires.num && aires.num > 1 ? ` (${textoReparto(aires.num)})` : '';
        l.push('');
        if (cae) {
            l.push(`❄️ Los aires acondicionados son equipos EXISTENTES: declara ${cuantos} en el CEE `
                   + 'como «Equipo de sólo refrigeración» (máquina frigorífica), de 3 a 5 kW. Cada '
                   + 'aparato enfría su estancia, no la casa: unos 40 m² cada uno (entre el 10 y el '
                   + '25 % de la vivienda) y, entre todos, como mucho el 100 % de la refrigeración.');
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
