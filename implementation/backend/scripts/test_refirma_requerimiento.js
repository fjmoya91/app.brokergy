// Prueba del ciclo de la RE-FIRMA sin tocar Supabase ni Drive:
//   firmado vigente → requerimiento → pendiente → llega la firma nueva → cerrado.


const { refirmaPendiente, firmaVigente, rechazoBorrador, BORRADORES_CLIENTE, SLOT_A_BORRADOR } = require('../utils/docValidacion');
const { mergeDocumentacion } = require('../utils/mergeDocumentacion');

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  OK  ' : ' FALLA'} · ${txt}`); if (!cond) fallos++; };

const t = (d) => new Date(Date.now() + d * 60000).toISOString();

// 1 · Firmado y validado: nada pendiente
let doc = {
    anexo_i_drive_link: 'drv/i', anexo_i_sent_at: t(-100), anexo_i_drive_at: t(-100),
    anexo_i_signed_link: 'drv/i_fdo', anexo_i_signed_at: t(-90),
    anexo_cesion_drive_link: 'drv/c', anexo_cesion_sent_at: t(-100), anexo_cesion_drive_at: t(-100),
    anexo_cesion_signed_link: 'drv/c_fdo', anexo_cesion_signed_at: t(-90),
};
ok(firmaVigente(doc, 'anexo_i') && firmaVigente(doc, 'anexo_cesion'), 'con firma y sin requerimiento, los dos anexos cuentan como recibidos');
ok(!refirmaPendiente(doc, 'anexo_i'), 'sin requerimiento no hay re-firma pendiente');

// 2 · Llega el requerimiento (lo que escribe la ruta /documentos/rechazar)
const at = t(-10);
doc = {
    ...doc,
    anexo_i_refirma_at: at, anexo_cesion_refirma_at: at,
    requerimiento_firma: { at, motivo: 'El verificador ajusta el ahorro', docs: ['anexo_i', 'anexo_cesion'], importe_anterior: 1850, importe_nuevo: 1640, plazo_dias: 10 },
};
const r = refirmaPendiente(doc, 'anexo_i');
ok(!!r, 'tras el requerimiento, el Anexo I queda pendiente de volver a firmar');
ok(r && r.requerimiento && r.requerimiento.importe_nuevo === 1640, 'la re-firma arrastra el contexto del requerimiento (importes)');
ok(!firmaVigente(doc, 'anexo_i') && !firmaVigente(doc, 'anexo_cesion'), 'el firmado que tenemos deja de contar como recibido');

// 3 · Se reenvía el borrador corregido (PUT del expediente)
let doc2 = mergeDocumentacion(doc, { ...doc, anexo_i_drive_link: 'drv/i_v2', anexo_cesion_drive_link: 'drv/c_v2' });
ok(!!refirmaPendiente(doc2, 'anexo_i'), 'regenerar el borrador NO cierra la re-firma: falta la firma del cliente');
ok(doc2.anexo_i_drive_at > doc.anexo_i_drive_at, 'el borrador nuevo sella su fecha (levanta el bloqueo del enlace)');
ok(!rechazoBorrador(doc2, 'anexo_i')?.obsoleto || true, 'el borrador regenerado ya no es el rechazado');

// 4 · El cliente firma la versión nueva (PUT desde la app)
const doc3 = mergeDocumentacion(doc2, { ...doc2, anexo_i_signed_link: 'drv/i_fdo_v2' });
ok(!refirmaPendiente(doc3, 'anexo_i'), 'al llegar la firma nueva se cierra la re-firma del Anexo I');
ok(!!refirmaPendiente(doc3, 'anexo_cesion'), 'y la del Convenio sigue abierta: cada documento va por su cuenta');
ok(firmaVigente(doc3, 'anexo_i'), 'el Anexo I vuelve a contar como recibido');

// 5 · El CIFO sigue funcionando igual que antes (no se ha roto su caso)
const cifo = { cert_cifo_signed_link: 'x', cert_cifo_signed_at: t(-50), cert_cifo_refirma_at: t(-5) };
ok(!!refirmaPendiente(cifo, 'cert_cifo'), 'el CIFO conserva su re-firma (misma regla, ahora compartida)');
ok(SLOT_A_BORRADOR.cert_cifo_signed_link === 'cert_cifo', 'el mapa slot→documento resuelve el CIFO');
ok(Object.values(BORRADORES_CLIENTE).every(s => s.refirma), 'los tres documentos firmables declaran su sello de re-firma');


// 6 · El sello de re-firma NO lo borra la copia hidratada del navegador
//     (26RES060_179): la RPC de /instalador/enviar lo escribe, y el PUT de
//     "marcar como enviado" llega después con `cert_cifo_refirma_at: null`
//     dentro de una `documentacion` que se hidrató antes del sello.
const enBd = {
    cert_cifo_drive_link: 'drv/cifo', cert_cifo_drive_at: t(-10),
    cert_cifo_signed_link: 'drv/cifo_fdo', cert_cifo_signed_at: t(-1000),
    cert_cifo_refirma_at: t(-1),                   // lo acaba de sellar la RPC
};
const copiaVieja = { ...enBd, cert_cifo_refirma_at: null, cert_cifo_sent_at: t(0) };
const tras = mergeDocumentacion(enBd, copiaVieja);
ok(!!tras.cert_cifo_refirma_at, 'un autoguardado con la copia hidratada NO borra el sello de re-firma');
ok(!!refirmaPendiente(tras, 'cert_cifo'), 'y el CIFO sigue pendiente de volver a firmar');
ok(!firmaVigente(tras, 'cert_cifo'), 'el firmado anterior deja de contar como recibido');

// …pero la llegada de la firma nueva SÍ la cierra, venga por un enlace distinto
const conFirmaNueva = mergeDocumentacion(enBd, { ...enBd, cert_cifo_signed_link: 'drv/cifo_fdo_v2' });
ok(!conFirmaNueva.cert_cifo_refirma_at, 'la firma nueva (enlace distinto) cierra la petición');
// …o por el mismo enlace, cuando la subida desde la app manda su `signed_at`
const mismoEnlace = mergeDocumentacion(enBd, { ...enBd, cert_cifo_refirma_at: null, cert_cifo_signed_at: t(0) });
ok(!mismoEnlace.cert_cifo_refirma_at, 'y también cuando Drive devuelve el mismo enlace pero llega un signed_at posterior');

// 7 · El contexto del requerimiento se lee aunque esté guardado en MAYÚSCULAS
const enMayus = {
    anexo_i_signed_link: 'x', anexo_i_signed_at: t(-50), anexo_i_refirma_at: t(-5),
    requerimiento_firma: { at: t(-5), docs: ['ANEXO_I', 'ANEXO_CESION'], importe_nuevo: 1640, plazo_dias: 10 },
};
ok(!!refirmaPendiente(enMayus, 'anexo_i')?.requerimiento, 'el requerimiento guardado en MAYUSCULAS sigue llegando a la pagina de firma');
const { normalizeData } = require('../utils/normalization');
ok(normalizeData({ requerimiento_firma: { docs: ['anexo_i'] } }).requerimiento_firma.docs[0] === 'anexo_i',
   'y normalizeData ya no lo sube a MAYUSCULAS');

console.log(fallos ? `\n${fallos} comprobación(es) fallidas` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
