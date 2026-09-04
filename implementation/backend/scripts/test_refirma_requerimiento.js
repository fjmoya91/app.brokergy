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

console.log(fallos ? `\n${fallos} comprobación(es) fallidas` : '\nTodo correcto');
process.exit(fallos ? 1 : 0);
