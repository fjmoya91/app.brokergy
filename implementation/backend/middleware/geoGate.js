/**
 * Gate geográfico para la landing pública.
 *
 * Bloquea requests cuyo `provinceCode` (INE 2 dígitos) no pertenezca a las
 * Comunidades Autónomas donde BROKERGY opera. Devuelve un 403 estructurado
 * que el frontend usa para mostrar el formulario "lista de espera" en lugar
 * de un error genérico.
 *
 * Lectura del código de provincia (en orden de prioridad):
 *   1. req.body.provinceCode
 *   2. req.query.provinceCode
 *   3. req.body.provincia_code  (snake_case por si llega así)
 *
 * Enriquece req.geoContext = { provinceCode, provincia, ccaa } al pasar.
 */

const {
    isAllowedProvince,
    getProvinceInfo,
    normalizeProvinceCode,
    getAvailableCCAA
} = require('../data/allowedProvinces');

function extractProvinceCode(req) {
    return (
        req.body?.provinceCode ??
        req.query?.provinceCode ??
        req.body?.provincia_code ??
        null
    );
}

/**
 * Middleware Express.
 */
function geoGate(req, res, next) {
    const raw = extractProvinceCode(req);
    const code = normalizeProvinceCode(raw);

    if (!code) {
        return res.status(400).json({
            error: 'Falta el código de provincia para validar zona de servicio.',
            code: 'GEO_MISSING_PROVINCE'
        });
    }

    if (!isAllowedProvince(code)) {
        return res.status(403).json({
            error: 'Aún no operamos en tu zona, pero queremos llegar pronto.',
            code: 'GEO_NOT_SERVED',
            provinceCode: code,
            ccaaDisponibles: getAvailableCCAA()
        });
    }

    req.geoContext = {
        provinceCode: code,
        ...getProvinceInfo(code)
    };
    next();
}

module.exports = {
    geoGate,
    isAllowedProvince,
    getProvinceInfo
};
