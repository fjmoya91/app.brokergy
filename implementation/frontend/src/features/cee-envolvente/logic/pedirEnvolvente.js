// ============================================================================
// pedirEnvolvente.js — pedirle algo al motor de envolvente, y SABER qué ha
// fallado cuando falla.
//
// El 18/09/2026 la ventana dijo «No se pudo construir la envolvente.» y nada
// más. Comprobado sobre el VPS ese mismo día: el motor levantado, la MISMA
// referencia catastral medida en 34,5 s con un 200 — y ni una petición de
// geometría en el log de nginx ni en el del backend. O sea que la petición no
// llegó a salir del navegador, y esas seis palabras no lo decían.
//
// REGLA — un mensaje de error tiene que decir QUÉ ha pasado. Esas seis palabras
// cubrían a la vez el motor caído, Catastro bloqueado, el corte de nginx, la
// sesión caducada y un tropiezo de la red. Con todas iguales no hay forma de
// saber qué mirar, y lo único que se puede hacer es volver a pulsar a ciegas.
//
// REGLA — una petición que NO HA LLEGADO se repite UNA vez, sola. Sin respuesta
// del servidor no ha pasado nada al otro lado, así que repetirla no puede
// duplicar nada. Y es justo el caso que se arregla solo: una conexión HTTP/2
// reutilizada que el servidor acaba de cerrar tumba el POST y no el GET —el
// navegador reintenta los GET por su cuenta y los POST no, que es exactamente
// lo que se vio ese día: todos los GET de la página en 200 y el POST sin
// rastro— y un tropiezo de red dura un segundo. Un fallo CON respuesta NO se
// repite: ahí el servidor ya ha contestado que no, y repetirlo es darle otra
// vez trabajo a Catastro.
//
// REGLA — lo que falla se ANOTA en el servidor. Un fallo que solo vive en la
// pantalla de quien lo sufre no se puede diagnosticar después: lo que llega por
// teléfono es «no me funciona», y con eso no se arregla nada. Mismo patrón que
// `/api/afirma-diagnostico`, y con el mismo cuidado: navegador, ruta y código,
// nunca el documento ni datos de nadie.
// ============================================================================

import axios from 'axios';

//: Cuánto se espera antes de repetir la que no llegó. Lo justo para que una
//: conexión medio cerrada se haya soltado del todo; más es una pantalla quieta.
const ESPERA_REINTENTO_MS = 900;

/** ¿Este fallo es de los que NO llegaron al servidor? */
export function noLlego(e) {
    // `e.response` es la respuesta del servidor. Sin ella, o no salió o no
    // volvió: en los dos casos al otro lado no ha pasado nada.
    return !e?.response && e?.code !== 'ERR_CANCELED';
}

/**
 * Qué decirle a quien está delante, con el paso siguiente pegado a la causa.
 *
 * `haciendo` es lo que se estaba intentando («construir la envolvente»,
 * «generar el .cex»): entra en la frase para que el aviso diga de qué habla sin
 * tener que mirar en qué punto de la pantalla ha salido.
 */
export function explicarFallo(e, haciendo = 'completar la operación', { repetido = false } = {}) {
    const r = e?.response;

    if (!r) {
        // Hoy nada cancela estas dos peticiones, pero si algún día se cancelan
        // (un `AbortController` al salir de la ventana) eso no es una avería y
        // no puede salir como el tropiezo de red de abajo.
        if (e?.code === 'ERR_CANCELED') return 'La petición se ha cancelado.';
        if (e?.code === 'ECONNABORTED') {
            return `La petición se ha cortado antes de que el servidor contestara.`
                 + ` Medir un edificio tarda entre veinte segundos y un minuto:`
                 + ` vuelve a pulsar.`;
        }
        // Lo más frecuente, y lo que no se veía: la petición ni salió. Que ya se
        // haya reintentado se DICE, o se vuelve a pulsar creyendo que es la
        // primera vez.
        return `La petición no ha llegado al servidor${repetido ? ' y el reintento tampoco' : ''}.`
             + ` Casi siempre es la conexión —comprueba que tienes internet— y`
             + ` se arregla volviendo a pulsar. Si insiste, recarga la página:`
             + ` hay conexiones que se quedan a medio cerrar y solo se sueltan así.`;
    }

    // El `error` que escribe el backend. Si el cuerpo es HTML —una página de
    // error de nginx— no es un objeto y no se puede leer así: se ignora, o
    // acabaría saliendo un trozo de HTML por mensaje.
    const dice = (r.data && typeof r.data === 'object' && r.data.error) || null;

    // El motor contesta terso («Catastro: 403»), que dice la causa y no qué
    // hacer con ella. Se CONSERVA —es lo que de verdad ha pasado— y se le pega
    // el paso siguiente detrás; sustituirlo perdería el dato, y dejarlo solo
    // deja a quien lo lee sin saber si esperar, reintentar o avisar.
    const con = (consejo) => (dice ? `${dice} · ${consejo}` : consejo);

    switch (r.status) {
        case 401:
        case 403:
            return con('Tu sesión ha caducado o no tienes acceso a este expediente:'
                     + ' vuelve a entrar y repite.');
        case 404:
            return con('Ese expediente no existe, o el enlace lleva al negocio'
                     + ' equivocado (un CEE directo se abre con «?origen=cee»).');
        case 502:
            // 502 del backend = ha fallado Catastro, no nosotros. NO se invita a
            // reintentar: al otro lado está el WAF del que depende el buscador
            // de la app, y insistir es la forma de que nos bloquee la IP.
            return con('No insistas ahora mismo: es su WAF, y suele liberarse'
                     + ' solo en media hora.');
        case 503:
            // Aquí el backend ya redacta la frase entera («…¿está levantado el
            // contenedor cee-engine?»): pegarle un consejo detrás la diría dos
            // veces, que es la forma de que no se lea ninguna de las dos.
            return dice || 'El motor de envolvente no responde: hay que mirar el'
                 + ' contenedor «cee-engine» en el VPS.';
        case 504:
            return con(`El servidor ha tardado más de lo que aguanta la pasarela`
                     + ` al ${haciendo}. Si esta referencia ya se ha medido alguna`
                     + ` vez, el segundo intento va mucho más rápido: vuelve a pulsar.`);
        default:
            return dice || `No se pudo ${haciendo} (error ${r.status}).`;
    }
}

/** Que quede en el log del servidor, para poder mirarlo mañana. */
function anotar(e, ruta, haciendo, repetido) {
    try {
        const r = e?.response;
        axios.post('/api/cee-envolvente/diagnostico', {
            haciendo,
            ruta,
            repetido: !!repetido,
            status: r?.status ?? null,
            // `code` de axios: ERR_NETWORK, ECONNABORTED… Es lo que distingue
            // «no salió» de «contestó que no».
            codigo: e?.code || null,
            mensaje: e?.message || null,
            navegador: navigator.userAgent,
        }).catch(() => {});
    } catch { /* un diagnóstico que falla no puede tapar el fallo que describe */ }
}

/**
 * Un POST a la envolvente, con el reintento y la explicación puestos.
 *
 * `repetible` lo dice QUIEN LLAMA, y no se deduce aquí: sin respuesta no hay
 * forma de distinguir «no llegó a salir» de «llegó y se murió el camino de
 * vuelta», así que repetir solo es seguro cuando la petición no ESCRIBE nada.
 * Medir el edificio lo es —lee Catastro, y el motor lo tiene cacheado—; escribir
 * el `.cex` no, porque toca Drive y archivaría en OLD una copia de más.
 *
 * Devuelve `data`. Lanza un error con `.mensaje` ya redactado para la pantalla
 * —no hay que volver a interpretarlo en cada sitio— y `.datos` con lo que el
 * backend haya contestado, que en el `.cex` lleva dentro qué falta.
 */
export async function postEnvolvente(url, cuerpo,
                                     { haciendo = 'completar la operación',
                                       repetible = false } = {}) {
    let ultimo, repetido = false;
    // Dos vueltas como mucho: la primera y la repetición de la que no llegó.
    for (let intento = 0; intento < 2; intento++) {
        try {
            const { data } = await axios.post(url, cuerpo);
            return data;
        } catch (e) {
            ultimo = e;
            if (intento === 0 && repetible && noLlego(e)) {
                repetido = true;
                await new Promise(r => setTimeout(r, ESPERA_REINTENTO_MS));
                continue;
            }
            break;
        }
    }
    anotar(ultimo, url, haciendo, repetido);
    const err = new Error(explicarFallo(ultimo, haciendo, { repetido }));
    err.mensaje = err.message;
    err.datos = (ultimo?.response?.data && typeof ultimo.response.data === 'object')
        ? ultimo.response.data : null;
    err.original = ultimo;
    throw err;
}

export default postEnvolvente;
