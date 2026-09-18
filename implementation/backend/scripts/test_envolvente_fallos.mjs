// ============================================================================
// test_envolvente_fallos.mjs — que un fallo de la envolvente DIGA cuál es.
//
// El 18/09/2026 la ventana del certificador enseñó «No se pudo construir la
// envolvente.» y nada más. Comprobado contra el VPS ese mismo día: el motor
// levantado, la misma referencia catastral medida en 34,5 s con un 200, y ni
// una petición de geometría en el log de nginx ni en el del backend. La
// petición no llegó a salir del navegador — y esas seis palabras no lo decían,
// porque eran las mismas para el motor caído, para Catastro, para el corte de
// la pasarela y para la sesión caducada.
//
// Lo que se vigila aquí:
//   1. cada causa dice algo DISTINTO, y con el paso siguiente pegado;
//   2. solo se repite sola la petición que NO LLEGÓ (sin respuesta del
//      servidor no ha pasado nada al otro lado);
//   3. una respuesta en HTML —la página de error de nginx— no se cuela como
//      mensaje: no es un objeto y `data.error` no existe.
//
// $ node implementation/backend/scripts/test_envolvente_fallos.mjs
// ============================================================================

import { explicarFallo, noLlego, soloLista, postEnvolvente }
    from '../../frontend/src/features/cee-envolvente/logic/pedirEnvolvente.js';

const HACIENDO = 'construir la envolvente';

//: [qué es, el error tal y como lo deja axios, ¿se repite sola?]
const CASOS = [
    ['la petición no llega (red caída, o HTTP/2 reutilizada y ya cerrada)',
     { code: 'ERR_NETWORK', message: 'Network Error' }, true],
    ['la conexión se corta a media petición',
     { code: 'ECONNABORTED' }, true],
    ['cancelada por la propia pantalla',
     { code: 'ERR_CANCELED' }, false],
    ['sesión caducada',
     { response: { status: 401 } }, false],
    ['el expediente no existe en ese negocio',
     { response: { status: 404, data: {} } }, false],
    ['Catastro dice que no',
     { response: { status: 502, data: { error: 'Catastro: 403' } } }, false],
    ['el motor no está levantado',
     { response: { status: 503, data: { error: 'El motor de envolvente no responde. ¿Está levantado el contenedor cee-engine?' } } }, false],
    ['la pasarela corta antes que el backend (HTML de nginx)',
     { response: { status: 504, data: '<html><body>504 Gateway Time-out</body></html>' } }, false],
    ['la referencia catastral no vale',
     { response: { status: 400, data: { error: 'referencia catastral no válida: dígitos de control' } } }, false],
    ['un 400 sin detalle',
     { response: { status: 400, data: {} } }, false],
    ['el .cex no se escribe a propósito (422)',
     { response: { status: 422, data: { error: 'Faltan las transmitancias', avisos: ['x'] } } }, false],
];

let fallos = 0;
const fallo = (t) => { console.log(`  ✗ ${t}`); fallos++; };
const vistos = new Map();

console.log('Qué le dice la ventana al certificador cuando algo falla:\n');

for (const [que, e, seRepite] of CASOS) {
    const m = explicarFallo(e, HACIENDO, { repetido: seRepite });

    if (noLlego(e) !== seRepite) {
        fallo(`«${que}»: se repetiría ${noLlego(e) ? 'sola' : 'nunca'}, y no es lo acordado`);
    }
    if (!m || m.length < 20) fallo(`«${que}»: mensaje vacío o telegráfico → ${m}`);
    if (/<html|<body|Gateway/i.test(m)) fallo(`«${que}»: se ha colado HTML en el mensaje`);
    if (vistos.has(m)) fallo(`«${que}» dice LO MISMO que «${vistos.get(m)}»`);
    vistos.set(m, que);

    console.log(`${noLlego(e) ? ' ↻ ' : '   '}${que}\n     ${m}\n`);
}

// El motivo de todo esto: la frase de antes ya no puede ser la respuesta a
// nada — si vuelve a salir sola, es que alguien ha deshecho el arreglo.
const generica = 'No se pudo construir la envolvente.';
if ([...vistos.keys()].includes(generica)) {
    fallo('ha vuelto la frase genérica que no dice nada');
}

// ── La regresión de verdad ───────────────────────────────────────────────────
// Lo que tumbó el botón «Traer la envolvente» del 16 al 18/09/2026: el `onClick`
// le metía su evento por el argumento de «los cuerpos que se dejan fuera», y ese
// evento lleva `view: window`. El cuerpo del POST dejaba de poder serializarse,
// axios ni lo mandaba, y no quedaba rastro en ningún log.
console.log('La regresión del 16/09: un evento de React donde iba una lista\n');

//: Un `SyntheticEvent` como el que pasa React, con su vuelta al `window`.
const eventoDeClick = () => {
    const ventana = { document: {} };
    ventana.window = ventana;                 // ← el círculo
    return { type: 'click', view: ventana, nativeEvent: {}, target: {} };
};

// 1. La lista se respeta; cualquier otra cosa es «no me han dicho nada».
if (soloLista(['GARAJE']) === null) fallo('soloLista se come una lista buena');
if (soloLista(eventoDeClick()) !== null) fallo('soloLista deja pasar el evento del clic');
if (soloLista(undefined) !== null || soloLista('GARAJE') !== null) {
    fallo('soloLista deja pasar algo que no es una lista');
}
console.log('   ✓ un evento de clic ya no puede colarse por donde va la lista');

// 2. Y si aun así llegara un cuerpo que no se puede mandar, se para ANTES de
//    salir, se dice que el fallo es NUESTRO y no se reintenta.
{
    const antes = Date.now();
    let err = null;
    try {
        await postEnvolvente('/api/cee-envolvente/x/geometria',
            { referencia_catastral: 'X', cuerpos_excluidos: eventoDeClick() },
            { haciendo: 'construir la envolvente', repetible: true });
    } catch (e) { err = e; }

    if (!err) fallo('un cuerpo imposible de serializar se ha dado por bueno');
    else {
        if (!err.nuestro) fallo('no se marca como fallo NUESTRO');
        if (!/aplicación|no de tu conexión/i.test(err.mensaje || '')) {
            fallo(`el mensaje sigue culpando a la red → ${err.mensaje}`);
        }
        // Sin red que esperar: si hubiera reintentado, habría tardado su pausa.
        if (Date.now() - antes > 400) fallo('lo ha reintentado, y repetirlo da el mismo error');
        console.log(`   ✓ se para antes de salir y lo dice: «${err.mensaje.slice(0, 72)}…»`);
    }
}

console.log(fallos
    ? `\n${fallos} FALLO(S)`
    : `\n✓ ${CASOS.length} causas, ${vistos.size} mensajes distintos, y solo se repite lo que no llegó.`);
process.exit(fallos ? 1 : 0);
