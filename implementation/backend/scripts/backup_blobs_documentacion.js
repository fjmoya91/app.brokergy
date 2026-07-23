/**
 * ============================================================================
 * BACKUP LOCAL de los blobs base64 de `expedientes.documentacion`
 * ============================================================================
 *
 * Vuelca a un fichero JSON EN DISCO LOCAL (nunca a una tabla: la BD está justa
 * de memoria y una tabla de respaldo no liberaría nada) las dos claves que se
 * van a purgar con `purge_corrupt_blobs.sql`:
 *
 *   · documentacion.photo_attachments   (fotos del Anexo Fotográfico)
 *   · documentacion.cifo_attachments    (fichas técnicas del CIFO)
 *
 * Red de seguridad ANTES de la purga. El contenido está corrupto (base64 pasado
 * a MAYÚSCULAS por el antiguo bug de normalizeData → no decodifica a imagen) y
 * el original vive en Drive, pero se conserva igualmente por prudencia.
 *
 * Uso:
 *   node implementation/backend/scripts/backup_blobs_documentacion.js
 *
 * Salida: backups/blobs_documentacion_<YYYY-MM-DD>.json (junto a este script)
 */

const fs = require('fs');
const path = require('path');
const supabase = require('../services/supabaseClient');

// Lotes pequeños: cada fila puede pesar hasta 10 MB y la instancia es Micro.
// Traerlas todas de golpe es justo lo que provoca las caídas que estamos
// arreglando, así que el propio backup va con cuidado.
const CHUNK = 10;

async function main() {
    const { data: ids, error: idsErr } = await supabase
        .from('expedientes')
        .select('id, numero_expediente')
        .order('numero_expediente');

    if (idsErr) throw new Error(`No se pudieron listar los expedientes: ${idsErr.message}`);

    console.log(`[backup] ${ids.length} expedientes a revisar (lotes de ${CHUNK})`);

    const filas = [];
    let conBlobs = 0;

    for (let i = 0; i < ids.length; i += CHUNK) {
        const lote = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
            .from('expedientes')
            .select('id, numero_expediente, photos:documentacion->photo_attachments, cifo:documentacion->cifo_attachments')
            .in('id', lote.map(r => r.id));

        if (error) throw new Error(`Error leyendo lote ${i}: ${error.message}`);

        for (const row of data) {
            if (row.photos == null && row.cifo == null) continue;
            conBlobs++;
            filas.push({
                id: row.id,
                numero_expediente: row.numero_expediente,
                photo_attachments: row.photos ?? null,
                cifo_attachments: row.cifo ?? null,
            });
        }
        process.stdout.write(`\r[backup] ${Math.min(i + CHUNK, ids.length)}/${ids.length}`);
    }

    const dir = path.join(__dirname, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const stamp = new Date().toISOString().slice(0, 10);
    const dest = path.join(dir, `blobs_documentacion_${stamp}.json`);
    fs.writeFileSync(dest, JSON.stringify({
        generado: new Date().toISOString(),
        total_expedientes: ids.length,
        con_blobs: conBlobs,
        filas,
    }, null, 2), 'utf8');

    const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
    console.log(`\n[backup] OK → ${dest} (${mb} MB, ${conBlobs} expedientes con blobs)`);
}

main().catch(err => {
    console.error('[backup] FALLO:', err.message);
    process.exit(1);
});
