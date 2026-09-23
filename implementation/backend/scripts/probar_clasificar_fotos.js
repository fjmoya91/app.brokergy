/**
 * probar_clasificar_fotos — ¿acierta el clasificador del buzón?
 *
 * Mide sobre las FOTOS DE EJEMPLO del tutorial (`frontend/public/tutorial`), que
 * son del mismo tipo que las que sube un instalador: una caldera en su sala, una
 * placa de cerca, la fachada desde la calle, un patio, la unidad exterior. Cada
 * una lleva escrito a qué apartado DEBE ir, así que el resultado es un porcentaje
 * y no una impresión.
 *
 * El checklist es el de un RES060 de sustitución —sin apartados de envolvente— a
 * propósito: ahí es donde se vio el problema, con cuatro fotos de ventanas
 * quedándose "sin clasificar" sin decir por qué. La ventana tiene que salir sin
 * slot pero CON concepto `ventanas`, que es lo que permite ofrecer el apartado.
 *
 * Gasta una llamada de pago (~0,005 € las seis fotos). No toca Drive ni la BD.
 *
 *   node implementation/backend/scripts/probar_clasificar_fotos.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { clasificar } = require('../services/clasificarFotosService');

const TUTORIAL = path.join(__dirname, '..', '..', 'frontend', 'public', 'tutorial');

// Lo que DEBE salir. `null` = sin apartado en este expediente (y entonces se
// espera el concepto que lo explica).
const CASOS = [
    { fichero: 'caldera.jpg',         espera: 'FOTO_CALDERA_ANTES' },
    { fichero: 'placa_caldera.jpg',   espera: 'FOTO_PLACA_CALDERA_ANTES' },
    { fichero: 'fachada.jpg',         espera: 'FOTO_FACHADA_PRINCIPAL' },
    { fichero: 'patios.jpg',          espera: 'FOTO_PATIOS_INTERIORES' },
    { fichero: 'unidad_exterior.jpg', espera: 'FOTO_UNIDAD_EXTERIOR' },
    { fichero: 'unidad_interior.jpg', espera: 'FOTO_UNIDAD_INTERIOR' },
    { fichero: 'ventana.jpg',         espera: null, concepto: 'ventanas' },
];

// Checklist de un RES060 de sustitución: la ficha no contempla envolvente, así
// que NO hay apartado de ventanas. Es el caso que falló en producción.
const SLOTS = [
    { key: 'FOTO_CALDERA_ANTES', fase: 'ANTES', multiple: true, label: 'Caldera actual (instalada)', help: 'Vista general de la caldera en su sala.' },
    { key: 'FOTO_PLACA_CALDERA_ANTES', fase: 'ANTES', multiple: true, label: 'Placa de la caldera', help: 'La etiqueta del fabricante, hasta que se lean marca, modelo y potencia.' },
    { key: 'FOTO_FACHADA_PRINCIPAL', fase: 'ANTES', multiple: true, label: 'Fachada de la calle (completa)', help: 'Para ver cuántas ventanas hay y su tamaño.' },
    { key: 'FOTO_PATIOS_INTERIORES', fase: 'ANTES', multiple: true, label: 'Patios interiores', help: 'Paredes que dan a patios, con sus ventanas.' },
    { key: 'FOTO_UNIDAD_EXTERIOR', fase: 'DESPUES', multiple: true, label: 'Unidad exterior nueva (instalada)', help: 'La máquina nueva que va fuera, ya colocada.' },
    { key: 'FOTO_UNIDAD_EXTERIOR_PLACA', fase: 'DESPUES', multiple: true, label: 'Placa de la unidad exterior', help: 'La etiqueta de datos de la máquina de fuera.' },
    { key: 'FOTO_UNIDAD_INTERIOR', fase: 'DESPUES', multiple: true, label: 'Unidad interior / ACS', help: 'La unidad de dentro (split, hidrokit o depósito) ya instalada.' },
    { key: 'FOTO_UNIDAD_INTERIOR_PLACA', fase: 'DESPUES', multiple: true, label: 'Placa de la unidad interior / DEPOSITO ACS', help: 'La etiqueta de la unidad de dentro.' },
    { key: 'FOTO_CALDERA_DESMONTADA', fase: 'DESPUES', multiple: true, label: 'Caldera antigua desmontada / hueco', help: 'La caldera vieja ya retirada, o el hueco que ha quedado.' },
    { key: 'DOC_FACTURAS', fase: 'DESPUES', multiple: true, label: 'Facturas de la instalación' },
];

(async () => {
    const imagenes = [];
    for (const c of CASOS) {
        const p = path.join(TUTORIAL, c.fichero);
        if (!fs.existsSync(p)) { console.log(`⚠ falta ${c.fichero}, se salta`); continue; }
        imagenes.push({ buffer: fs.readFileSync(p), mimeType: 'image/jpeg', nombre: c.fichero });
    }
    if (!imagenes.length) { console.error('No hay fotos de ejemplo en', TUTORIAL); process.exit(1); }

    console.log(`── Clasificador del buzón · ${imagenes.length} fotos de ejemplo ──\n`);
    const t0 = Date.now();
    const r = await clasificar(imagenes, SLOTS);
    console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);

    let ok = 0;
    for (const f of r) {
        const caso = CASOS.find(c => c.fichero === f.nombre);
        const bien = caso.espera
            ? f.slot === caso.espera
            : (!f.slot && f.concepto === caso.concepto);
        if (bien) ok++;
        const dicho = f.slot || (f.concepto ? `(sin apartado · concepto: ${f.concepto})` : '(sin clasificar)');
        console.log(`${bien ? '✓' : '✗'} ${f.nombre.padEnd(22)} → ${dicho}`);
        console.log(`   "${f.que_se_ve}" · ${f.confianza}${bien ? '' : `\n   ESPERADO: ${caso.espera || `sin slot + concepto ${caso.concepto}`}`}`);
    }
    console.log(`\n${ok}/${r.length} correctas`);
    process.exitCode = ok === r.length ? 0 : 1;
})().catch(e => { console.error('ERROR:', e.message); process.exitCode = 1; });
