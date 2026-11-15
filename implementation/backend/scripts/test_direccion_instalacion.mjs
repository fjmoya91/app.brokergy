/**
 * «¿Misma dirección que el cliente? → Sí» sigue la ficha del CLIENTE, en vivo
 * (logic/direccionInstalacion.js), en las CUATRO superficies que componen la
 * dirección de la obra: buildInstalacionAddress (Anexo I, CIFO, Convenio, RES080…),
 * el Anexo Fotográfico del servidor, la ficha del certificador y el mensaje de cobro.
 *
 *   node implementation/backend/scripts/test_direccion_instalacion.mjs
 */
import assert from 'assert';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => import(pathToFileURL(path.join(__dirname, '../../frontend/src/features', p)).href);
const { usaDireccionCliente, nombreDeCalle, mismaVivienda } = await front('expedientes/logic/direccionInstalacion.js');
const { buildInstalacionAddress } = await front('expedientes/utils/docGenerators.js');
const { direccionObra } = await front('cobro/logic/cobroForm.js');
const { buildCertClienteData } = require('../services/certClienteData');

// ── El flag ──
assert.equal(usaDireccionCliente({}), true, 'sin declarar = Sí (el valor por defecto)');
assert.equal(usaDireccionCliente({ misma_direccion: true }), true);
assert.equal(usaDireccionCliente({ misma_direccion: 'SI' }), true);
assert.equal(usaDireccionCliente({ misma_direccion: false }), false);
assert.equal(usaDireccionCliente({ misma_direccion: 'NO' }), false);

// ── El nombre de la calle ──
assert.equal(nombreDeCalle('CL CORBATAS 66 (42 EN CATASTRO)'), 'CORBATAS');
assert.equal(nombreDeCalle('C/ ARZOBISPO ROMERO, 8'), 'ARZOBISPO ROMERO');
assert.equal(nombreDeCalle('CL DON VICTOR PEÑASCO 15 Es:1 Pl:04 Pt:0A 13700 TOMELLOSO'), 'DON VICTOR PENASCO');
assert.equal(nombreDeCalle('CR CIUDAD REAL  Es:T Pl:01 Pt:01 13170 MIGUELTURRA'), 'CIUDAD REAL');
assert.equal(nombreDeCalle('(CINCO CASAS) C/ DON QUIJOTE 30 D'), 'DON QUIJOTE');

// ── ¿La misma vivienda? (casos reales de la BD, 20/10/2026) ──
const misma = (a, ma, b, mb) => mismaVivienda({ direccion: a, municipio: ma }, { direccion: b, municipio: mb });
assert.equal(misma('CL CORBATAS 66 (42 EN CATASTRO)', 'LA SOLANA', 'CL CORBATAS 42 13240 LA SOLANA (CIUDAD REAL)', 'LA SOLANA'), true, 'el número no decide');
assert.equal(misma('(CINCO CASAS) C/ DON QUIJOTE 30 D', '', 'CL CINCO C DON QUIJOTE 30(D) 13720 ALCAZAR', ''), true);
assert.equal(misma('C/ POZO SANTA QUITERIA 17', 'SOLANA (LA)', 'CL POZO SANTA QUITERIA 17 LA SOLANA', 'LA SOLANA'), true, 'artículo del municipio');
assert.equal(misma('CL LEON FELIPE 15', 'LAS PEDROÑERAS', 'AV JUAN XXIII 19 16660 LAS PEDROÑERAS (CUENCA)', 'LAS PEDROÑERAS'), false, '26RES060_89');
assert.equal(misma('C/ SAN BERNARDO 114', 'MADRID', 'C/ SAN BERNARDO 114', 'GUADALAJARA'), false, 'otro municipio');
assert.equal(misma('', '', 'CL X 1', ''), null, 'sin calle no se decide');

// ── Las superficies ──
const op = { ref_catastral: 'RC', datos_calculo: { inputs: { direccion: 'CL CORBATAS 42 13240 LA SOLANA (CIUDAD REAL)', municipio: 'LA SOLANA' } } };
const cli = { direccion: 'CL CORBATAS 66 (42 EN CATASTRO)', codigo_postal: '13240', municipio: 'LA SOLANA', provincia: 'CIUDAD REAL' };
const si = { instalacion: { misma_direccion: true, direccion: 'CL CORBATAS 42 13240 LA SOLANA (CIUDAD REAL)' }, clientes: cli, oportunidades: op };
const no = { ...si, instalacion: { misma_direccion: false, direccion: 'CL CORBATAS 42', codigo_postal: '13240', municipio: 'LA SOLANA' } };

// Con «Sí» manda el cliente, aunque la instalación tenga guardada la del Catastro.
assert.equal(buildInstalacionAddress(si).calle, 'CL CORBATAS 66 (42 EN CATASTRO)');
assert.equal(buildInstalacionAddress(si).full, 'CL CORBATAS 66 (42 EN CATASTRO) 13240 LA SOLANA (CIUDAD REAL)');
assert.equal(buildInstalacionAddress(si).refCatastral, 'RC', 'la RC sigue siendo la de la obra');
// Cambia el cliente → cambia el documento.
assert.ok(buildInstalacionAddress({ ...si, clientes: { ...cli, direccion: 'CL CORBATAS 68' } }).full.startsWith('CL CORBATAS 68 '));
// Con «No», el cliente no se usa nunca.
assert.equal(buildInstalacionAddress(no).calle, 'CL CORBATAS 42');
// Con «Sí» y el cliente sin calle, la del Catastro.
assert.equal(buildInstalacionAddress({ ...si, clientes: {} }).calle, 'CL CORBATAS 42 13240 LA SOLANA (CIUDAD REAL)');

// Ficha del certificador.
const cert = buildCertClienteData(si, op, cli).data;
assert.ok(cert.direccionInstalacion.startsWith('CL CORBATAS 66'), cert.direccionInstalacion);
assert.equal(cert.direccionCliente, null, 'con «Sí» no se manda el domicilio aparte');
assert.ok(buildCertClienteData(no, op, cli).data.direccionInstalacion.startsWith('CL CORBATAS 42'));

// Mensaje de cobro (quita las notas entre paréntesis).
assert.ok(direccionObra(si).startsWith('Cl Corbatas 66'), direccionObra(si));
assert.ok(direccionObra(no).startsWith('Cl Corbatas 42'), direccionObra(no));

// Anexo Fotográfico del servidor: buildDocMeta no se exporta; se comprueba que su
// cascada es la misma leyendo el fuente (si alguien la cambia, que cambie las dos).
const fs = require('fs');
const src = fs.readFileSync(path.join(__dirname, '../services/anexoFotograficoService.js'), 'utf8');
assert.ok(/const calle = sigue\?\.direccion \|\| inst\.direccion/.test(src), 'anexoFotograficoService sigue al cliente con «Sí»');

console.log('OK test_direccion_instalacion');
