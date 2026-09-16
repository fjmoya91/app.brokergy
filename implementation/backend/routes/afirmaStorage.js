// Servlets de almacenamiento/recuperación del Cliente @firma (Autofirma).
//
// POR QUÉ: cuando el fichero a firmar / el resultado firmado es GRANDE (p. ej. el
// Anexo Fotográfico, con muchas fotos), no cabe por el WebSocket local de Autofirma
// (error AS620018 "excede de la memoria disponible") y autoscript.js hace fallback a
// un "servidor intermedio" en `window.location.origin + /afirma-signature-storage/...`
// y `/afirma-signature-retriever/...`. Si esos endpoints no existen, el PDF firmado
// NUNCA vuelve al navegador → "se firma pero vuelve a la ventana anterior".
//
// Estos endpoints implementan ese protocolo (op=check|put|get) sobre un almacén en
// memoria con TTL corto. Autofirma CIFRA el `dat` con una clave que solo tiene el
// navegador, así que aquí solo se guarda/reenvía un blob OPACO (privacidad ok).
//
// Protocolo (deducido de autoscript.js):
//   GET  ?op=check                         → 200 (comprobación de conexión)
//   POST op=put&v=1_0&id=<id>&dat=<cifr>   → guarda dat bajo id, responde "OK"
//   GET  ?op=get&v=1_0&id=<id>&it=<n>      → devuelve dat (y lo borra); si aún no
//                                            está, responde "err-06" (el navegador
//                                            sigue reintentando).
const express = require('express');
const router = express.Router();

// Parser urlencoded con límite alto SOLO para estas rutas (el `dat` puede pesar MB).
const bigForm = express.urlencoded({ extended: false, limit: '80mb' });

// Almacén en memoria: id -> { dat, expires }. TTL 10 min, borrado al leer.
const store = new Map();
const TTL_MS = 10 * 60 * 1000;
const LEIDO_TTL_MS = 60 * 1000;   // margen de reintento tras la primera lectura
function gc() {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires < now) store.delete(k);
}

function handle(req, res) {
    gc();
    const p = { ...req.query, ...(req.body || {}) };
    const op = String(p.op || '').toLowerCase();

    if (op === 'check') {
        return res.status(200).type('text/plain').send('OK');
    }
    if (op === 'put') {
        const id = String(p.id || '');
        if (!id) return res.status(200).type('text/plain').send('ERR-01:=Falta id');
        store.set(id, { dat: String(p.dat || ''), expires: Date.now() + TTL_MS });
        return res.status(200).type('text/plain').send('OK');
    }
    if (op === 'get') {
        const id = String(p.id || '');
        const entry = id && store.get(id);
        if (!entry) {
            // Aún no hay resultado → el navegador seguirá reintentando.
            return res.status(200).type('text/plain').send('err-06 No existe el identificador solicitado');
        }
        // NO se borra al leer: por este mismo camino Autofirma DESCARGA el documento a
        // firmar (no solo el navegador recoge el resultado), y un corte de red en
        // mitad de esa descarga dejaría el dato ya consumido — la firma moriría sin
        // que nada lo explique. Se acorta el TTL a un minuto, que es de sobra para
        // cualquier reintento y no deja el blob en memoria diez minutos.
        entry.expires = Math.min(entry.expires, Date.now() + LEIDO_TTL_MS);
        return res.status(200).type('text/plain').send(entry.dat);
    }
    return res.status(200).type('text/plain').send('ERR-01:=Operacion no soportada');
}

// Mismo handler para ambos servlets (comparten almacén): así funciona
// independientemente de a cuál escriba Autofirma y de cuál lea el navegador.
router.get('/afirma-signature-storage/StorageService', handle);
router.post('/afirma-signature-storage/StorageService', bigForm, handle);
router.get('/afirma-signature-retriever/RetrieveService', handle);
router.post('/afirma-signature-retriever/RetrieveService', bigForm, handle);

// ── Diagnóstico de fallos de Autofirma ───────────────────────────────────────
// Lo que llega por teléfono es "no me funciona el enlace de firma", y con eso no se
// puede arreglar nada: el mismo síntoma lo dan una Autofirma antigua, un certificado
// SSL local caducado y un antivirus que corta 127.0.0.1. Aquí se deja constancia de
// en qué máquina y con qué código ha fallado (lo manda features/firma/autofirma.js).
//
// REGLA — aquí NO entra el documento ni ningún dato del firmante: navegador, camino
// probado y código de error. Es una ruta pública porque los enlaces de firma del
// cliente y del instalador lo son, así que el cuerpo va limitado y se registra tal
// cual, sin guardarse en base de datos.
router.post('/afirma-diagnostico', express.json({ limit: '16kb' }), (req, res) => {
    const b = req.body || {};
    const texto = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').slice(0, n);
    console.warn('[autofirma] fallo de firma', JSON.stringify({
        documento: texto(b.documento, 80),
        codigo: texto(b.codigo, 20),
        clase: texto(b.clase, 20),
        tipo: texto(b.tipo, 120),
        mensaje: texto(b.mensaje, 300),
        caminos: Array.isArray(b.caminos) ? b.caminos.slice(0, 5).map(c => texto(c, 20)) : [],
        navegador: texto(b.navegador, 200),
        plataforma: texto(b.plataforma, 40),
        ip: texto(req.headers['x-forwarded-for'] || req.ip, 60),
    }));
    res.status(204).end();
});

module.exports = router;
