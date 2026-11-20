// En SECO, sobre un lote REAL: lo que mandaría al S.O. el envío automático de la
// fase 2 (regla 222). No escribe ni envía nada: lee el lote, monta el Anexo I y las
// fichas con envioSoDocs.js (la fuente única del popup), genera cada PDF con el mismo
// `documentoAPdf` de la ruta y dice si el filtro lo dejaría salir (sin contar con
// que el lote ya se hubiera enviado).
//
//   node scripts/probar_envio_so_auto.mjs LOTE-2024-020 [--pdf <carpeta>]
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });

const codigo = process.argv[2];
const iPdf = process.argv.indexOf('--pdf');
const carpetaPdf = iPdf > 0 ? process.argv[iPdf + 1] : null;
if (!codigo) { console.error('Uso: node scripts/probar_envio_so_auto.mjs LOTE-AAAA-NNN [--pdf <carpeta>]'); process.exit(2); }

const supabase = require('../services/supabaseClient');
const { loteCompleto } = require('../routes/lotes');
const { documentoAPdf } = require('../services/pdfService');
const { decidirEnvioSo } = require('../services/ofertaVerificadorAuto');
const front = (p) => import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/lotes/logic', p)).href);
const E = await front('envioSoDocs.js');
const C = await front('soContactos.js');
const D = await front('docEnvio.js');
const P = await front('loteProceso.js');

const { data: fila } = await supabase.from('lotes').select('id').eq('codigo', codigo.toUpperCase()).maybeSingle();
if (!fila) { console.error('No existe', codigo); process.exit(1); }
const lote = await loteCompleto(fila.id);
const so = lote.sujeto_obligado || {};
const { notifyEmail } = C.deriveSoEnvio(so);
const firmante = C.representanteElegido(so, 'principal');
const docs = E.docsEnvioSo(lote, { repNombre: firmante?.nombre || undefined, repNif: firmante?.nif || undefined });
const totales = E.totalesAnexo(lote);
const proc = P.analizarProceso(lote);

console.log(`${lote.codigo} · S.O. ${so.acronimo || so.razon_social} → ${notifyEmail || '(sin email)'} · firma ${firmante?.nombre || '—'}`);
console.log(`Anexo I: ${totales.numActuaciones} actuaciones · ${totales.ahorroMwh} MWh · oferta ${lote.oferta_lote} €/MWh · mes ${E.mesDe()}`);
const dec = decidirEnvioSo({ lote, docs, totales, notifyEmail, solicitud: proc.solicitud, solicitudOk: proc.solicitudOk, yaEnviado: false, ahora: Date.now() + 864e5, tieneContenido: D.docTieneContenido });
console.log(`Filtro (sin contar «ya enviado»): ${dec.enviar ? 'SALDRÍA' : 'RETENIDO'}${dec.motivos.length ? ' — ' + dec.motivos.join(' · ') : ''}`);
console.log(`(en realidad: ${proc.soEnviado ? 'ya se envió al S.O.: el automático no hace nada' : 'aún no ha salido'})`);
console.log('\nMensaje:\n' + E.mensajeEnvioSo(lote, totales).split('\n').map(l => '  | ' + l).join('\n'));

console.log('\nDocumentos:');
if (carpetaPdf) fs.mkdirSync(carpetaPdf, { recursive: true });
let fallos = 0;
for (const d of docs.map(D.docParaEnvio)) {
    try {
        const pdf = await documentoAPdf(d);
        console.log(`  ✓ ${d.fileName} (${d.formulario ? 'impreso oficial' : 'html'}) · ${(pdf.length / 1024).toFixed(0)} KB · firma ${d.rep_nombre || '—'}`);
        if (carpetaPdf) fs.writeFileSync(path.join(carpetaPdf, `${d.fileName}.pdf`), pdf);
    } catch (e) { fallos++; console.log(`  ✗ ${d.fileName}: ${e.message}`); }
}
console.log(`\nSolicitud: ${proc.solicitudOk ? `✓ ${proc.solicitud?.file_name} (la del verificador)` : '✗ falta la del verificador'}`);
process.exit(fallos ? 1 : 0);
