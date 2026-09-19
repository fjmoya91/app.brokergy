// ventanasVivienda.js — CÓMO SON LAS VENTANAS de esta vivienda.
//
// Marco, vidrio y persiana. Son tres datos que no están en ningún campo del
// expediente, que no se ven desde el plano y que hasta 2026-09-19 no viajaban
// al `.cex`: el motor sabía escribirlos (`huecos_defecto`) pero NADIE se los
// mandaba, así que los catorce huecos de un expediente salían todos «Doble +
// Metálico sin RPT» y ninguno con persiana — y con ello, sin su puente térmico
// de caja de persiana, que llevan 34 de los 50 .cex del corpus.
//
// De aquí cuelga la transmitancia de cada hueco, que es de lo que más pesa en
// la demanda de una vivienda antigua. Por eso se PREGUNTA al entrar, una sola
// vez, y se puede corregir hueco a hueco después.

//: Los TRES vidrios de «Propiedades térmicas: Estimadas» de CE3X, con la U y
//: el factor solar que el programa deriva de cada uno. No es una tabla
//: nuestra: la correspondencia está medida sobre los 14.494 huecos del corpus
//: y se ve en las capturas del propio CE3X.
export const VIDRIOS = [
    { id: 'Simple', rotulo: 'Simple', u: 5.7, g: 0.82,
      ayuda: 'Una sola luna. Se ve el canto fino del vidrio en el borde.' },
    { id: 'Doble', rotulo: 'Doble', u: 3.3, g: 0.75,
      ayuda: 'Dos lunas con cámara de aire (el clásico Climalit).' },
    { id: 'Doble bajo emisivo', rotulo: 'Doble bajo emisivo', u: 2.7, g: 0.65,
      ayuda: 'Doble con capa de control térmico. Lo llevan las ventanas nuevas; '
           + 'si no consta que la tenga, es Doble a secas.' },
];

//: Y los CUATRO marcos. PVC y Madera comparten U (2.2) — no es una errata: es
//: lo que escribe CE3X.
export const MARCOS = [
    { id: 'Metálico sin RPT', rotulo: 'Metálico, sin rotura', u: 5.7,
      ayuda: 'Aluminio o acero de una pieza. Es lo normal en una vivienda '
           + 'anterior a los 2000 que no ha cambiado las ventanas.' },
    { id: 'Metálico con RPT', rotulo: 'Metálico, con rotura de puente térmico', u: 4.0,
      ayuda: 'Aluminio partido por dentro con una junta de plástico. Se ve en '
           + 'el canto del perfil al abrir la ventana.' },
    { id: 'PVC', rotulo: 'PVC', u: 2.2, ayuda: 'Perfil blanco de plástico, grueso.' },
    { id: 'Madera', rotulo: 'Madera', u: 2.2, ayuda: null },
];

//: Lo que se escribía ANTES de que esto existiera, y lo que se sigue
//: escribiendo si nadie contesta. No se toca: subirlo o bajarlo cambiaría la
//: demanda de partida de todo expediente que se regenere sin haber pasado por
//: el popup, y esa es una decisión que tiene que tomar una persona.
export const VENTANAS_POR_DEFECTO = {
    vidrio: 'Doble',
    marco: 'Metálico sin RPT',
    persiana: false,
};

/** ¿Está contestado ya cómo son las ventanas de esta vivienda? */
export const ventanasContestadas = (ajustes) => !!ajustes?.ventanas?.vidrio;

/**
 * Lo que se le manda al motor: lo contestado, o lo de siempre.
 *
 * REGLA — `persiana` viaja SIEMPRE, también cuando es `false`. Es la respuesta
 * «no tienen», no un hueco: si se omitiera, el motor caería a su propio
 * defecto y no habría forma de distinguir «no hay persianas» de «no se ha
 * preguntado».
 */
export function huecosDefecto(ajustes) {
    const v = ajustes?.ventanas;
    if (!ventanasContestadas(ajustes)) return { ...VENTANAS_POR_DEFECTO };
    return {
        vidrio: v.vidrio,
        marco: v.marco || VENTANAS_POR_DEFECTO.marco,
        persiana: !!v.persiana,
    };
}

/** El rótulo de un vidrio o de un marco, para enseñarlo sin repetir la tabla. */
export const rotuloVidrio = (id) => VIDRIOS.find(x => x.id === id)?.rotulo || id;
export const rotuloMarco = (id) => MARCOS.find(x => x.id === id)?.rotulo || id;

/** Una línea: «Doble · Metálico sin rotura · con persiana». */
export function resumenVentanas(v) {
    if (!v?.vidrio) return null;
    return [rotuloVidrio(v.vidrio), rotuloMarco(v.marco),
            v.persiana ? 'con persiana' : 'sin persiana'].filter(Boolean).join(' · ');
}

/**
 * Lo que la FOTO de un hueco dice de su carpintería, en el vocabulario de CE3X.
 *
 * El lector de fotos (`paredOcrService`) ya sacaba el material del marco, el
 * acristalamiento y la persiana, y se TIRABAN: el popup de la lectura decía
 * expresamente «no se escribe en el .cex». Ahora se proponen.
 *
 * REGLA — lo que la foto no permite afirmar sale `null`, no un valor
 * plausible. Un `triple` no se traduce: CE3X no lo tiene entre sus tres
 * vidrios estimados y declararlo como doble bajo emisivo sería escribir otra
 * ventana.
 */
export function desdeLaFoto(lectura) {
    if (!lectura) return {};
    // El ORDEN de las claves importa: es el que se lee en la pantalla («su foto
    // dice Doble · PVC · sin persiana»), y en toda la app la carpintería se
    // nombra vidrio · marco · persiana.
    const out = {};
    const a = String(lectura.acristalamiento || '').toLowerCase();
    if (a === 'monolitico' || a === 'monolítico') out.vidrio = 'Simple';
    else if (a === 'doble') out.vidrio = 'Doble';
    const m = String(lectura.material_marco || '').toLowerCase();
    if (m === 'pvc') out.marco = 'PVC';
    else if (m === 'madera') out.marco = 'Madera';
    else if (m === 'aluminio' || m === 'acero') {
        // Con la rotura SIN comprobar se propone el perfil sin rotura, que es
        // lo que lleva una ventana antigua de aluminio y lo que la app ya
        // escribía. Va PROPUESTO: lo confirma quien mira.
        out.marco = lectura.rotura_puente_termico === true
            ? 'Metálico con RPT' : 'Metálico sin RPT';
    }
    if (typeof lectura.persiana === 'boolean') out.persiana = lectura.persiana;
    return out;
}

/**
 * Lo que dicen las fotos que YA se han leído en este expediente.
 *
 * Es lo que el popup ofrece como respuesta: si el instalador subió las fotos y
 * alguien las leyó, preguntar de cero es preguntar lo que ya está contestado.
 * Manda lo MÁS REPETIDO — una vivienda tiene la misma carpintería en casi
 * todas sus ventanas, y la excepción se corrige en su hueco.
 */
export function propuestaDeLasFotos(muros) {
    const votos = { vidrio: {}, marco: {}, persiana: {} };
    let leidos = 0;
    for (const m of Object.values(muros || {})) {
        for (const h of m.huecos || []) {
            const l = desdeLaFoto(h.lectura);
            if (!Object.keys(l).length) continue;
            leidos += 1;
            for (const [k, v] of Object.entries(l)) {
                const clave = String(v);
                votos[k][clave] = (votos[k][clave] || 0) + 1;
            }
        }
    }
    if (!leidos) return null;
    const gana = (k) => {
        const pares = Object.entries(votos[k]);
        if (!pares.length) return undefined;
        return pares.sort((a, b) => b[1] - a[1])[0][0];
    };
    const persiana = gana('persiana');
    return {
        leidos,
        vidrio: gana('vidrio'),
        marco: gana('marco'),
        ...(persiana === undefined ? {} : { persiana: persiana === 'true' }),
    };
}
