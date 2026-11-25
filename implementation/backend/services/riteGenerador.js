// ─── riteGenerador.js — el puente con el microservicio RITE (rite-generator) ──
// FUENTE ÚNICA de cómo se le pasan los datos al generador de la Memoria RITE y de
// la llamada en sí. La usan:
//   · routes/expedientes.js (la memoria de una obra CAE: /generate, /send, /files)
//   · la app RITE (rite.brokergy.es): la memoria SUELTA, sin expediente, que
//     arma un `exp` sintético con la misma forma (services/riteapp/payload.js).
// Antes vivía dentro de routes/expedientes.js; se sacó el 25/11/2026 para que las
// dos entradas no se desincronicen. El microservicio es un generador puro (sin BD
// ni Drive): recibe los datos ya resueltos en la forma de
// lib/supabase_client.normalizar y devuelve [{ name, mimetype, base64 }].
// ─────────────────────────────────────────────────────────────────────────────
const axios = require('axios');
const { resolveFechasRite } = require('../utils/riteValidation');

// Construye el payload (exp + instalador) que espera el microservicio RITE.
// Centralizado para que /generate, /send y /files no se desincronicen.
function buildRitePayloads({ exp, cli, op, normalizedDatos, pres }) {
    // EMPLAZAMIENTO de la memoria y del certificado: la dirección de la INSTALACIÓN
    // (regla 149, espejo de logic/direccionInstalacion.js). Con «¿Misma dirección
    // que el cliente? → No» es la del expediente; si no, el generador sigue usando
    // la del cliente. Hasta el 18/11/2026 era SIEMPRE la del cliente (26RES093_15:
    // memoria con la obra en el domicilio de empadronamiento).
    const inst = exp.instalacion || {};
    const md = String(inst.misma_direccion ?? '').trim().toUpperCase();
    const instPropia = (inst.misma_direccion === false || md === 'NO' || md === 'FALSE')
        && String(inst.direccion || '').trim();
    const provInst = /^\d+$/.test(String(inst.provincia || '').trim()) ? '' : (inst.provincia || '');
    const expPayload = {
        numero_expediente: exp.numero_expediente,
        instalacion: exp.instalacion || {},
        cee: exp.cee || {},
        documentacion: exp.documentacion || {},
        ref_catastral: op?.ref_catastral || exp.instalacion?.ref_catastral || '',
        datos_calculo: normalizedDatos,
        is_reforma: (op?.is_reforma ?? normalizedDatos?.is_reforma ?? exp.cee?.is_reforma ?? false),
        nombre_razon_social: cli?.nombre_razon_social || '',
        apellidos: cli?.apellidos || '',
        dni: cli?.dni || cli?.dni_nie || '',
        tlf: cli?.tlf || cli?.telefono || '',
        // Sexo del titular → marca la casilla Hombre/Mujer en la Memoria RITE.
        sexo: cli?.sexo || '',
        // Persona jurídica → casilla "Jurídica" en vez de "Física", y sin sexo.
        es_empresa: !!cli?.es_empresa,
        cli_prov: cli?.provincia || '',
        cli_muni: cli?.municipio || '',
        cli_dir: cli?.direccion || '',
        cli_cp: cli?.codigo_postal || '',
        inst_dir: instPropia ? [inst.direccion, inst.num].filter(Boolean).join(' ').trim() : '',
        inst_muni: instPropia ? String(inst.municipio || '').toUpperCase() : '',
        inst_prov: instPropia ? String(provInst).toUpperCase() : '',
        inst_cp: instPropia ? (inst.codigo_postal || '') : ''
    };
    const instaladorPayload = pres ? {
        razon_social: pres.razon_social || '',
        cif: pres.cif || '',
        numero_carnet_rite: pres.numero_carnet_rite || '',
        nombre_responsable: pres.nombre_responsable || '',
        apellidos_responsable: pres.apellidos_responsable || '',
        nif_responsable: pres.nif_responsable || '',
        tecnico_firmante_dni: pres.tecnico_firmante_dni || '',
        tecnico_firmante_distinto: pres.tecnico_firmante_distinto || false,
        tecnico_firmante_nombre: pres.tecnico_firmante_nombre || '',
        tecnico_firmante_apellidos: pres.tecnico_firmante_apellidos || '',
        tecnico_firmante_carnet_rite: pres.tecnico_firmante_carnet_rite || '',
        es_autonomo: pres.es_autonomo || false,
        cargo: pres.cargo || '',
        municipio: pres.municipio || ''
    } : null;
    // Fechas del Certificado de Instalación Térmica. Las resuelve el BACKEND
    // (fuente única en riteValidation) y viajan explícitas al microservicio:
    // así lo que se marca a mano en la app manda sobre la factura, y la fecha
    // de firma deja de ir en null (antes el generador la copiaba de la fecha
    // de pruebas, que además salía de la primera factura registrada).
    const fechas = resolveFechasRite(exp.documentacion || {});
    return { expPayload, instaladorPayload, fechas };
}

// Llama al microservicio y devuelve los ficheros [{name,mimetype,base64}].
async function generarRiteFiles(expPayload, instaladorPayload, fechas = {}) {
    const RITE_SERVICE_URL = process.env.RITE_SERVICE_URL || 'http://localhost:8090';
    const { data } = await axios.post(
        `${RITE_SERVICE_URL}/generar-rite-json`,
        {
            exp: expPayload,
            instalador: instaladorPayload,
            fecha_firma: fechas.firma || null,
            fecha_pruebas: fechas.pruebas || null,
        },
        { timeout: 90000, maxBodyLength: Infinity, maxContentLength: Infinity });
    return data?.files;
}

module.exports = { buildRitePayloads, generarRiteFiles };
