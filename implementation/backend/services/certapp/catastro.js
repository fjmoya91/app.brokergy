// ─── certapp/catastro.js — rellenar el inmueble de una obra desde el Catastro ──
// Por catastroService (reglas 15–17: nunca axios, solo los WCF JSON, nunca en
// paralelo: getByRC ya pide datos y coordenadas en serie y cachea).
// La zona climática sale de la MISMA función que en los CEE directos
// (climateService.getClimateByNames, por los nombres), y si no casa, de los
// códigos del Catastro.
// ─────────────────────────────────────────────────────────────────────────────
const catastroService = require('../catastroService');
const climateService = require('../climateService');
const { COD_A_CCAA, provinciaNombreACod } = require('../geoCcaa');
const { utmALatLon } = require('../encargoTecnico');
const { fallo } = require('./comun');

const limpiarRc = (rc) => String(rc || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

/**
 * Trae del Catastro lo que rellena el inmueble.
 * @returns {Promise<object>} el patch para `certapp_obras`
 * @throws 400 formato · 404 no existe · 409 PARCELA (con `viviendas` para elegir) · 503 Catastro bloqueado/caído
 */
async function datosDelCatastro(rcEntrada) {
    const rc = limpiarRc(rcEntrada);
    if (![14, 18, 20].includes(rc.length)) {
        throw fallo(400, 'La referencia catastral tiene 20 caracteres (o 14 la de la parcela).', 'RC_FORMATO');
    }
    let d;
    try {
        d = await catastroService.getByRC(rc);
    } catch (e) {
        if (e?.code === 'CATASTRO_RATE_LIMITED' || e?.statusCode === 503) {
            throw fallo(503, 'El Catastro no nos deja consultar ahora mismo. Prueba en unos minutos o rellena los datos a mano.', 'CATASTRO_BLOQUEADO');
        }
        if (e?.code === 'RC_NOT_FOUND') throw fallo(404, 'El Catastro no encuentra esa referencia.', 'RC_NO_EXISTE');
        if (e?.code === 'RC_INVALID_FORMAT') throw fallo(400, 'El Catastro dice que la referencia no es válida.', 'RC_FORMATO');
        console.warn('[certapp catastro]', rc, e?.message);
        throw fallo(503, 'El Catastro no responde ahora mismo. Prueba en unos minutos o rellena los datos a mano.', 'CATASTRO_NO_RESPONDE');
    }

    // Edificio con varias viviendas: hay que elegir cuál (la de 20 caracteres).
    if (d?.isParcela) {
        const viviendas = (d.dwellings || []).slice(0, 200).map(v => ({
            rc: v.rc, direccion: v.address, escalera: v.block || null, planta: v.floor || null, puerta: v.door || null,
            uso: v.use || null, superficie: v.surface || null, anio: v.yearBuilt || null, vivienda: !!v.isResidential,
        }));
        throw fallo(409, 'Esa referencia es de un edificio con varias viviendas: elige cuál.', 'PARCELA', {
            parcela: { rc: d.rc, direccion: d.address, total: d.totalUnits, viviendas_count: d.dwellingCount },
            viviendas,
        });
    }

    const provincia = d.province || null;
    const municipio = d.municipality || null;
    const clima = (municipio ? climateService.getClimateByNames(provincia, municipio) : null) || d.climateInfo || null;
    const codProv = d.provinceCode ? String(d.provinceCode).padStart(2, '0') : provinciaNombreACod(provincia);
    const ll = d.utm?.x && d.utm?.y ? utmALatLon(d.utm.x, d.utm.y, d.utm.zone || 30) : null;

    return {
        ref_catastral: d.rc,
        direccion: d.street || (d.address && d.address !== 'Dirección no disponible' ? d.address : null),
        municipio,
        provincia,
        ccaa: (codProv && COD_A_CCAA[codProv]) || null,
        codigo_postal: d.postalCode || null,
        zona_climatica: clima?.climateZone ?? null,
        altitud: clima?.altitude ?? null,
        lat: ll?.lat ?? null,
        lng: ll?.lon ?? null,
        superficie_catastro: d.totalSurface || null,
        anio_construccion: d.yearBuilt || null,
        uso: d.use || null,
        // Resumen PEQUEÑO (nada de geometrías): lo que se enseña y lo que lee la IA.
        catastro: {
            rc: d.rc,
            direccion_completa: d.address || null,
            uso: d.use || null,
            superficie: d.totalSurface || null,
            anio: d.yearBuilt || null,
            reforma: d.reforma?.has ? { tipo: d.reforma.tipo, anio: d.reforma.anio } : null,
            plantas: d.floors?.total || null,
            construcciones: (d.constructions || []).slice(0, 40).map(c => ({ tipo: c.type, planta: c.floor, superficie: c.surface })),
            resumen_usos: d.summaryByType || null,
            participacion: d.participation || null,
            tipo: d.typeCatastro || null,
            utm: d.utm?.x ? { x: d.utm.x, y: d.utm.y, huso: d.utm.zone || 30 } : null,
            provincia_cod: codProv || null,
            municipio_cod: d.municipalityCode || null,
            traido_at: new Date().toISOString(),
        },
    };
}

module.exports = { datosDelCatastro, limpiarRc };
