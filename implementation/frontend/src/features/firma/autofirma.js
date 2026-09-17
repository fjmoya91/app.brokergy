// ─────────────────────────────────────────────────────────────────────────────
// Hablar con AUTOFIRMA sin depender de qué versión tenga instalada el firmante.
//
// POR QUÉ EXISTE: hasta 2026-09-16 la app llamaba a `AutoScript.sign()` a pelo, y
// autoscript.js elige SIEMPRE el mismo camino en un PC de escritorio: un WebSocket
// SEGURO contra `wss://127.0.0.1:<puerto>`. Ese camino exige tres cosas a la vez:
//   · Autofirma >= 1.7 (las anteriores no tienen websocket),
//   · su certificado SSL local instalado Y VIGENTE en el almacén del navegador
//     (el famoso "AutoFirma ROOT": si caducó, o el perfil de Firefox se creó
//     después de instalar Autofirma, el `wss://` no llega a abrirse),
//   · que ningún antivirus/proxy corte 127.0.0.1.
// Si cualquiera falla, el firmante ve un diálogo del Gobierno diciendo que no tiene
// Autofirma instalado — teniéndolo —, y ahí se acaba el trámite.
//
// Aquí se prueban los caminos EN ORDEN y se cae al siguiente solo cuando el fallo es
// de comunicación. El segundo (servidor intermedio) no usa ni puertos ni certificados
// locales: únicamente que el sistema operativo sepa abrir un enlace `afirma://`, que
// es lo que hace CUALQUIER Autofirma desde la 1.5.
//
// REGLA — un intento nuevo solo se lanza si el anterior NO llegó a Autofirma. Si el
// firmante llegó a ver la ventana y canceló, o su certificado no vale, reintentar
// abriría Autofirma otra vez encima: se para y se le dice qué ha pasado.
// ─────────────────────────────────────────────────────────────────────────────

const AUTOSCRIPT_SRC = '/autofirma/autoscript.js';

export const DESCARGA_URL = 'https://firmaelectronica.gob.es/Home/Descargas.html';

// Rutas de NUESTRO servidor intermedio (routes/afirmaStorage.js). Van bajo /api,
// que no es donde autoscript las busca por defecto, así que hay que declararlas.
const SERVLET_STORAGE = '/api/afirma-signature-storage/StorageService';
const SERVLET_RETRIEVER = '/api/afirma-signature-retriever/RetrieveService';

// Por encima de este tamaño se salta el WebSocket y se va derecho al servidor
// intermedio: Autofirma responde AS620018 ("excede de la memoria disponible") con
// los documentos grandes — el Anexo Fotográfico con muchas fotos pasa de sobra— y
// el resultado firmado no vuelve nunca al navegador.
const BYTES_DIRECTO_A_SERVIDOR = 3 * 1024 * 1024;

export const CAMINOS = {
    WEBSOCKET: 'websocket',
    SERVIDOR: 'servidor',
    SERVIDOR_COMPAT: 'servidor-compat',
};

// Lo que se le dice al firmante mientras espera. El segundo NO puede llamarse
// "modo compatible": así se llama el botón del mensaje de error (el tercer camino),
// y dos cosas distintas con el mismo nombre en la misma pantalla se leen como una.
const ETIQUETA_CAMINO = {
    [CAMINOS.WEBSOCKET]: 'conexión directa con Autofirma',
    [CAMINOS.SERVIDOR]: 'la vía alternativa',
    [CAMINOS.SERVIDOR_COMPAT]: 'el modo compatible con versiones antiguas',
};

// ── Carga de autoscript.js ───────────────────────────────────────────────────
let _autoscriptPromise = null;
export function cargarAutoScript() {
    if (window.AutoScript) return Promise.resolve(window.AutoScript);
    if (_autoscriptPromise) return _autoscriptPromise;
    _autoscriptPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = AUTOSCRIPT_SRC;
        s.async = true;
        s.onload = () => {
            if (window.AutoScript) resolve(window.AutoScript);
            else reject(new Error('autoscript.js cargó pero AutoScript no está definido'));
        };
        s.onerror = () => reject(new Error('No se pudo cargar autoscript.js'));
        document.head.appendChild(s);
    });
    return _autoscriptPromise;
}

// ── ¿Es un PDF ENTERO? ───────────────────────────────────────────────────────
// Autofirma rechaza un PDF incompleto con `SAF_28: El fichero no es un PDF o es
// un PDF no soportado`, y ese mensaje no dice lo que pasa: que el fichero está
// ROTO. Medido el 17/09/2026 en 26RES060_179 — el convenio que devolvió firmado
// el cliente pesa en Drive los 382.347 bytes que Drive declara, se descarga
// entero e idéntico tres veces, y ACABA A MEDIAS: `startxref 38043`, sin `%%EOF`.
//
// Y no se ve venir: **pdf.js RECONSTRUYE el índice de un PDF roto**, así que el
// modal lo pinta perfectamente y el documento parece correcto en pantalla. El
// único que se queja es Autofirma, con un código que suena a "formato raro".
//
// REGLA — esto NO se repara. Reescribir el PDF (pdf-lib) le arreglaría el índice
// y de paso **invalidaría la firma que ya lleva dentro**, que aquí es la del
// cliente. Un documento truncado tampoco vale como firmado: su firma abarca unos
// bytes que ya no están. Lo que procede es pedirlo otra vez, y eso es lo que se
// dice.
export function pdfIncompleto(pdfBase64) {
    const b64 = String(pdfBase64 || '');
    if (!b64) return 'no hay documento que firmar';
    const trozo = (desde, largo) => {
        try { return atob(b64.substr(desde, largo).replace(/\s+/g, '')); } catch (_) { return ''; }
    };
    // La cabecera está en los primeros bytes; el cierre, en la cola. No se
    // decodifica el fichero entero: son megas y solo hacen falta los extremos.
    if (!trozo(0, 16).startsWith('%PDF-')) return 'el fichero no es un PDF';
    // El final se decodifica desde un múltiplo de 4, o `atob` desfasa los bytes.
    const colaDesde = Math.max(0, Math.floor((b64.length - 4096) / 4) * 4);
    const cola = trozo(colaDesde, b64.length - colaDesde);
    // `%%EOF` casi nunca es el último byte: hay PDFs con relleno detrás, así que
    // se busca en la cola en vez de exigir que cierre el fichero.
    if (cola && !cola.includes('%%EOF')) return 'el PDF está incompleto (le falta el final)';
    return null;
}

// ── Clasificación del error ──────────────────────────────────────────────────
// Devuelve 'comunicacion' | 'memoria' | 'version' | 'usuario' | 'certificado' | 'otro'.
//
// REGLA — se clasifica por el CÓDIGO cuando lo hay (AS6200xx es un enum cerrado de
// autoscript.js) y solo se cae al texto cuando no lo hay: el mensaje se traduce y se
// reescribe entre versiones, y un `includes` sobre él envejece sin que nadie lo note.
export function clasificarError({ codigo, tipo, mensaje }) {
    const cod = String(codigo || '').toUpperCase();
    const txt = `${tipo || ''} ${mensaje || ''}`;

    // Las de MEMORIA van primero porque comparten prefijo con las de comunicación.
    if (cod === 'AS620018' || cod === 'AS620021' || cod === 'AS620014') return 'memoria';
    // Toda la familia AS6200xx que queda es "no se pudo invocar / no contestó", por
    // websocket, por socket o por servidor intermedio — y el Ministerio va añadiendo
    // códigos (AS620023/24/25 son de esta última vía y no estaban en la 1.6), así que
    // se cubre el rango entero en vez de enumerarlos y quedarse corto.
    if (/^AS6200\d{2}$/.test(cod) || /^AS4[02]0\d{3}$/.test(cod) || cod === 'AS300302') return 'comunicacion';
    if (cod === 'AS500001') return 'usuario';
    // SAF_28 lo devuelve AUTOFIRMA (no autoscript) cuando el PDF que recibe no
    // puede abrirlo. Llega con el fichero ya entregado, así que no es de comunicación.
    if (cod === 'SAF_28' || cod === 'SAF28') return 'documento';

    if (/AOCancelledOperationException|cancelad|cancell/i.test(txt)) return 'usuario';
    if (/no es un PDF|PDF no soportado|incompleto/i.test(txt)) return 'documento';
    if (/version.*(protocolo|protocol)|protocol.*version|no soportad|unsupported/i.test(txt)) return 'version';
    if (/excede de la memoria|memoria disponible|demasiado larga|too long/i.test(txt)) return 'memoria';
    if (/certificad|keystore|almac[eé]n|KeyException|PKCS/i.test(txt)) return 'certificado';
    if (/ApplicationNotFound|TimeoutException|InterruptedException|websocket|socket|conect|conexi[oó]n|no se ha podido|not.*install|no.*instal/i.test(txt)) return 'comunicacion';

    return 'otro';
}

// Un error que NO llegó a Autofirma se puede reintentar por otro camino. Si el
// firmante ya tuvo la ventana delante (canceló, o su certificado no sirve), no.
const REINTENTABLE = new Set(['comunicacion', 'memoria', 'version']);

// ── Texto para el firmante ───────────────────────────────────────────────────
// No es cosmético: quien recibe esto es un cliente o un instalador, y de lo que
// lea depende que resuelva él o que tengamos que llamarle. Cada caso dice QUÉ ha
// pasado y QUÉ hacer, en ese orden.
export function explicarError({ codigo, tipo, mensaje, caminosProbados = [] }) {
    const clase = clasificarError({ codigo, tipo, mensaje });
    const agotado = caminosProbados.length > 1;
    // Ofrecer el modo compatible solo tiene sentido si aún no se ha probado y el
    // fallo es de los que puede causar una versión antigua.
    const compat = SERVIDOR_INTERMEDIO_ACTIVO
        && !caminosProbados.includes(CAMINOS.SERVIDOR_COMPAT)
        && (clase === 'version' || clase === 'comunicacion' || clase === 'memoria');

    if (clase === 'usuario') {
        return {
            clase,
            titulo: 'Has cancelado la firma',
            detalle: 'No se ha firmado nada. Puedes volver a intentarlo cuando quieras.',
            instalar: false,
            reintentar: true,
        };
    }
    if (clase === 'documento') {
        return {
            clase,
            titulo: 'El documento no se puede firmar: está dañado',
            detalle: 'El PDF que hay guardado está incompleto, así que Autofirma no lo admite — y si ya llevaba una firma, esa firma tampoco vale. No es cosa de tu ordenador: hay que volver a generarlo o a subirlo, y firmarlo otra vez.',
            instalar: false,
            reintentar: false,
        };
    }
    if (clase === 'certificado') {
        return {
            clase,
            titulo: 'Autofirma no ha podido usar tu certificado',
            detalle: 'Comprueba que tienes tu certificado instalado y sin caducar, o que el DNIe está en el lector. Si acabas de instalarlo, cierra Autofirma y el navegador y vuelve a entrar.',
            instalar: false,
            reintentar: true,
        };
    }
    if (clase === 'version' || (clase === 'comunicacion' && agotado)) {
        return {
            clase,
            titulo: 'Tu Autofirma no ha respondido',
            detalle: agotado
                ? 'Lo hemos intentado por los dos caminos posibles y ninguno ha llegado a Autofirma. Lo más habitual es tener una versión antigua: desinstálala, instala la última desde el portal oficial, reinicia el navegador y vuelve a pulsar el botón.'
                : 'Tu versión de Autofirma no entiende esta petición. Instala la última desde el portal oficial, reinicia el navegador y vuelve a intentarlo.',
            instalar: true,
            reintentar: true,
            compat,
        };
    }
    if (clase === 'memoria') {
        return {
            clase,
            titulo: 'El documento es demasiado grande para tu Autofirma',
            detalle: 'Instala la última versión desde el portal oficial y vuelve a intentarlo. Si sigue fallando, avísanos y te lo mandamos de otra forma.',
            instalar: true,
            reintentar: true,
            compat,
        };
    }
    if (clase === 'comunicacion') {
        return {
            clase,
            titulo: 'No hemos podido abrir Autofirma',
            detalle: 'Si te ha salido un aviso del navegador preguntando si abres Autofirma, acéptalo. Si no lo tienes instalado, descárgalo del portal oficial; si lo tienes, ábrelo a mano una vez y vuelve a pulsar el botón.',
            instalar: true,
            reintentar: true,
            compat,
        };
    }
    return {
        clase,
        titulo: 'Autofirma ha devuelto un error',
        detalle: mensaje || tipo || 'Error desconocido.',
        instalar: false,
        reintentar: true,
    };
}

// ── Preparación de cada camino ───────────────────────────────────────────────
function prepararCamino(AutoScript, camino) {
    // Los diálogos propios de autoscript se apagan SIEMPRE: son los que anuncian
    // "no tiene Autofirma instalado" antes de que nosotros podamos hacer nada, se
    // quedan encima de nuestro modal y, mientras están abiertos, el error NO llega a
    // nuestro callback — o sea, el fallback automático no llegaría a dispararse.
    try { window.SupportDialog?.enableSupportDialog(false); } catch (_) { }

    // La versión del protocolo la lee autoscript.js de este global (ver el parche
    // documentado allí). Solo se rebaja en el último intento: una Autofirma vieja
    // rechaza un `ver` mayor del que conoce, y una nueva acepta los menores.
    window.AFIRMA_PROTOCOL_VERSION = camino === CAMINOS.SERVIDOR_COMPAT ? 1 : 4;

    if (camino === CAMINOS.WEBSOCKET) {
        // Menos reintentos que los 15 × 2 s de fábrica: 30 segundos mirando una
        // pantalla quieta antes de probar el camino que sí funciona es tiempo en el
        // que el firmante ya ha cerrado la pestaña.
        try { AutoScript.AUTOFIRMA_CONNECTION_RETRIES = 6; } catch (_) { }
        AutoScript.setForceWSMode(false);
        AutoScript.cargarAppAfirma();
        return;
    }

    // Servidor intermedio. `setForceWSMode` es "forzar modo WebService" (el nombre
    // engaña: NO es el WebSocket), y hay que declararle NUESTRAS rutas porque
    // autoscript las busca por defecto en la raíz del origen, sin el /api.
    try { AutoScript.AUTOFIRMA_CONNECTION_RETRIES = 15; } catch (_) { }
    const origin = window.location.origin;
    AutoScript.setForceWSMode(true);
    AutoScript.setServlets(origin + SERVLET_STORAGE, origin + SERVLET_RETRIEVER);
    AutoScript.cargarAppAfirma();
}

// REGLA — automáticos van DOS caminos, no tres. Medido en un navegador real sin
// Autofirma instalada: el WebSocket tarda ~15 s en rendirse y el servidor intermedio
// ~45 s, así que encadenar además el modo compatible pone al firmante a esperar más
// de minuto y medio delante de una pantalla quieta para acabar leyendo un error. Y no
// lo arregla: si no responde NADA, repetir lo mismo con otra versión de protocolo
// tampoco va a responder. El tercero vive a un clic en el mensaje de error, para la
// instalación antigua de verdad — que es rara — y no lo pagan todos los demás.
// ⛔ EL SERVIDOR INTERMEDIO ESTÁ DESACTIVADO (2026-09-17)
//
// Estuvo activo desde el 16/09 y CORROMPE el documento firmado. Medido el mismo
// día sobre 26RES060_179: su Convenio de Cesión quedó TRUNCADO en Drive (382.347
// bytes, sin `%%EOF`) y su CIFO volvió con la firma INVÁLIDA — «el rango de bytes
// de la firma no es válido», que es lo que dice un lector cuando el PDF se ha
// alterado DESPUÉS de firmarlo.
//
// La causa está en el trayecto de vuelta: Autofirma sube su resultado a nuestro
// servlet como `application/x-www-form-urlencoded`, y ahí **un `+` del Base64 se
// decodifica como ESPACIO**. El navegador de ida lo evita mandando Base64
// url-safe (`-` y `_`, ver `sendData` en autoscript.js); Autofirma, no.
//
// Una firma que no vale es lo peor que puede producir esta app, así que el camino
// se apaga entero hasta que el servlet esté arreglado Y comprobado con un PDF
// firmado de verdad — no se deja "por si acaso" detrás de una condición. Con esto
// el comportamiento vuelve a ser el de antes del 16/09: solo WebSocket.
const SERVIDOR_INTERMEDIO_ACTIVO = false;

function planDeIntentos(tamanoBytes, forzarCompat) {
    if (!SERVIDOR_INTERMEDIO_ACTIVO) return [CAMINOS.WEBSOCKET];
    if (forzarCompat) return [CAMINOS.SERVIDOR_COMPAT];
    if (tamanoBytes > BYTES_DIRECTO_A_SERVIDOR) {
        // Por WebSocket este documento no cabe: no se pierde medio minuto probándolo.
        return [CAMINOS.SERVIDOR];
    }
    return [CAMINOS.WEBSOCKET, CAMINOS.SERVIDOR];
}

// ── Firma ────────────────────────────────────────────────────────────────────
/**
 * Firma `pdfBase64` con Autofirma probando los caminos en orden.
 *
 * @param onCamino  (camino, etiqueta, intento, total) — para contarle al firmante
 *                  por dónde va cuando el primer camino no responde.
 * @param forzarCompat  salta a la vía de las instalaciones antiguas (protocolo v1).
 * @returns { firmado, camino } o lanza { codigo, tipo, mensaje, caminosProbados }.
 */
export async function firmarConAutofirma({
    pdfBase64,
    extraParams,
    algoritmo = 'SHA512withRSA',
    formato = 'PAdES',
    onCamino,
    forzarCompat = false,   // "mi Autofirma es antigua": un solo intento con ver=1
}) {
    // Antes de abrir Autofirma: si el documento está roto, lo va a rechazar con un
    // mensaje que no se entiende. Mejor decirlo aquí, que es donde se puede hacer algo.
    const roto = pdfIncompleto(pdfBase64);
    if (roto) {
        const err = new Error(roto);
        err.afirma = { clase: 'documento', mensaje: roto, caminosProbados: [] };
        throw err;
    }

    const AutoScript = await cargarAutoScript();
    const plan = planDeIntentos((pdfBase64 || '').length * 0.75, forzarCompat);
    const probados = [];
    let ultimo = null;

    for (let i = 0; i < plan.length; i++) {
        const camino = plan[i];
        probados.push(camino);
        onCamino?.(camino, ETIQUETA_CAMINO[camino], i + 1, plan.length);

        try {
            prepararCamino(AutoScript, camino);
        } catch (e) {
            ultimo = { codigo: '', tipo: 'preparacion', mensaje: e?.message || String(e) };
            continue;
        }

        const res = await new Promise((resolve) => {
            let resuelto = false;
            const acabar = (v) => { if (!resuelto) { resuelto = true; resolve(v); } };
            try {
                AutoScript.sign(
                    pdfBase64,
                    algoritmo,
                    formato,
                    extraParams,
                    (firmado) => acabar({ ok: true, firmado }),
                    (tipo, mensaje, codigo) => acabar({
                        ok: false,
                        // El código llega como 3er argumento en unas rutas de
                        // autoscript y en otras no; getErrorCode() es el respaldo.
                        error: {
                            codigo: codigo || (() => { try { return AutoScript.getErrorCode(); } catch (_) { return ''; } })(),
                            tipo,
                            mensaje,
                        },
                    }),
                );
            } catch (e) {
                acabar({ ok: false, error: { codigo: '', tipo: 'excepcion', mensaje: e?.message || String(e) } });
            }
        });

        if (res.ok) return { firmado: res.firmado, camino };

        ultimo = res.error;
        const clase = clasificarError(ultimo);
        if (!REINTENTABLE.has(clase)) break;
    }

    const err = new Error(ultimo?.mensaje || 'No se pudo firmar con Autofirma');
    err.afirma = { ...(ultimo || {}), caminosProbados: probados };
    throw err;
}

// ── Diagnóstico ──────────────────────────────────────────────────────────────
// Un fallo de firma solo se puede arreglar sabiendo en qué máquina falla y con qué
// código; lo que llega por teléfono es "no me funciona el enlace". Esto manda al
// backend lo justo para reconstruirlo (navegador, camino y código), nunca el
// documento ni datos del firmante, y NUNCA tumba la firma si no llega.
export function registrarFalloAutofirma(info) {
    try {
        const cuerpo = JSON.stringify({
            documento: info?.documento || null,
            codigo: info?.codigo || null,
            tipo: info?.tipo || null,
            mensaje: String(info?.mensaje || '').slice(0, 300),
            clase: info?.clase || null,
            caminos: info?.caminosProbados || [],
            navegador: navigator.userAgent,
            plataforma: navigator.platform,
        });
        // `keepalive` para que salga aunque el firmante cierre la pestaña al ver el error.
        fetch('/api/afirma-diagnostico', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: cuerpo,
            keepalive: true,
        }).catch(() => { });
    } catch (_) { /* el diagnóstico nunca puede romper la firma */ }
}
