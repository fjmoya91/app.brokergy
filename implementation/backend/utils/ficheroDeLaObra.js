/**
 * ¿Es este fichero de Drive de ESTA obra? — fuente ÚNICA para servir una miniatura o un
 * fichero por un enlace (token del cliente o del instalador, o la llave de la app del
 * instalador). Un token vale para UNA obra: sin esta comprobación, con el token de la
 * suya se podía pedir la miniatura de cualquier `driveId` del Drive de Brokergy.
 *
 * Es de la obra si:
 *   · está apuntado en su `reforma_uploads` (cualquier apartado), o
 *   · Drive manda (regla 20): un fichero que está en Drive y no en la BD también se
 *     enseña, así que vale si cuelga de la carpeta de la obra a ≤ 4 niveles.
 *
 * Solo se cachea lo CONFIRMADO (un fichero no deja de ser de su obra). Con la BD
 * caída lanza `BdNoDisponible`: la ruta responde 503 (regla 38), nunca «no es tuyo».
 *
 * Ver docs/conocimiento/transversal-backend/rutas-publicas-solo-lo-de-esa-obra.md.
 */
class BdNoDisponible extends Error {}

const NIVELES = 4;
const DRIVE_ID_RE = /^[\w-]{10,200}$/;
const _suyos = new Map(); // `${oppId}|${driveId}` → true

async function esFicheroDeLaObra(oppId, driveId) {
    if (!oppId || !DRIVE_ID_RE.test(String(driveId || ''))) return false;
    const k = `${oppId}|${driveId}`;
    if (_suyos.has(k)) return true;

    const supabase = require('../services/supabaseClient');
    const { data, error } = await supabase
        .from('oportunidades')
        .select('ru:datos_calculo->reforma_uploads, carpeta:datos_calculo->>drive_folder_id, carpeta2:datos_calculo->inputs->>drive_folder_id')
        .eq('id', oppId)
        .maybeSingle();
    if (error) throw new BdNoDisponible(error.message);
    if (!data) return false;

    let ok = JSON.stringify(data.ru || {}).includes(`"${driveId}"`);
    const carpeta = data.carpeta || data.carpeta2;
    if (!ok && carpeta) {
        const driveService = require('../services/driveService');
        let ids = [driveId];
        for (let i = 0; i < NIVELES && !ok && ids.length; i++) {
            const meta = await driveService.getFileMetadata(ids[0], 'id, parents');
            ids = meta?.parents || [];
            ok = ids.includes(carpeta);
        }
    }
    if (ok) { if (_suyos.size > 5000) _suyos.clear(); _suyos.set(k, true); }
    return ok;
}

module.exports = { esFicheroDeLaObra, BdNoDisponible, DRIVE_ID_RE };
