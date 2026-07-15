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
        store.delete(id);
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

module.exports = router;
