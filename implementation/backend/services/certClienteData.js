// ============================================================
// certClienteData.js — Ficha de datos del cliente para el certificador
//
// El certificador necesita, para visitar y emitir el CEE: a quién llamar, dónde
// está la instalación y con qué referencia catastral. Este módulo reúne esos
// datos desde las tres fuentes posibles (tabla `clientes`, `expedientes.instalacion`
// y `oportunidades.datos_calculo.inputs`) y dice cuáles faltan.
//
// REGLA DE ORO: la dirección de INSTALACIÓN no es el domicilio del CLIENTE.
// Son campos distintos y se envían por separado cuando difieren. Espejo backend
// de `buildInstalacionAddress` (frontend/features/expedientes/utils/docGenerators.js).
// ============================================================

const clean = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Une calle + CP + municipio + (provincia) evitando repetir lo que ya venga dentro.
const joinAddress = ({ calle, cp, municipio, provincia }) => {
    const base = clean(calle);
    if (!base) return '';
    const parts = [base];
    if (cp && !base.includes(cp)) parts.push(cp);
    if (municipio && !base.toUpperCase().includes(municipio.toUpperCase())) parts.push(municipio);
    if (provincia) parts.push(`(${provincia})`);
    return parts.filter(Boolean).join(', ');
};

// Normaliza para comparar dos direcciones sin que la puntuación o los acentos decidan.
const addrKey = (s) => clean(s)
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');

/**
 * @param {object} exp expediente (con `instalacion`)
 * @param {object} op  oportunidad (con `datos_calculo`, `ref_catastral`, `referencia_cliente`)
 * @param {object} cli fila de `clientes` (puede ser null)
 * @returns {{ data: object, missing: string[] }}
 */
function buildCertClienteData(exp, op, cli) {
    const inst = exp?.instalacion || {};
    const dc = op?.datos_calculo || {};
    const inputs = dc.inputs || {};

    const nombre = (cli
        ? `${clean(cli.nombre_razon_social)} ${clean(cli.apellidos)}`.trim()
        : '') || clean(op?.referencia_cliente) || '';

    // Dirección de la INSTALACIÓN: manda el expediente, luego la calculadora.
    const direccionInstalacion = joinAddress({
        calle: clean(inst.direccion) || clean(inputs.direccion) || clean(inputs.address),
        cp: clean(inst.codigo_postal) || clean(inputs.cp),
        municipio: clean(inst.municipio) || clean(inputs.municipio),
        provincia: clean(inst.provincia) || clean(inputs.provincia),
    });

    // Domicilio del CLIENTE: solo de su ficha.
    const direccionCliente = joinAddress({
        calle: clean(cli?.direccion),
        cp: clean(cli?.codigo_postal),
        municipio: clean(cli?.municipio),
        provincia: clean(cli?.provincia),
    });

    // Se envía el domicilio solo si aporta algo: existe y es distinto del de la
    // instalación. `misma_direccion === false` lo fuerza aunque el texto coincida.
    const distintas = !!direccionCliente
        && (inst.misma_direccion === false || addrKey(direccionCliente) !== addrKey(direccionInstalacion));

    const data = {
        nombre: nombre || null,
        dni: clean(cli?.dni) || clean(inputs.dni) || null,
        tlf: clean(cli?.tlf) || clean(cli?.telefono) || clean(inputs.tlf) || clean(inputs.phone) || null,
        email: clean(cli?.email) || clean(inputs.email) || null,
        refCatastral: clean(op?.ref_catastral) || clean(inst.ref_catastral) || clean(inputs.rc) || clean(inputs.referencia_catastral) || null,
        direccionInstalacion: direccionInstalacion || null,
        direccionCliente: distintas ? direccionCliente : null,
        // Compatibilidad con las plantillas que aún esperan `direccion`.
        direccion: direccionInstalacion || direccionCliente || null,
    };

    // Lo que el certificador no puede trabajar sin ello.
    const REQUERIDOS = [
        ['nombre', 'Nombre y apellidos'],
        ['dni', 'DNI'],
        ['refCatastral', 'Referencia catastral'],
        ['direccionInstalacion', 'Dirección de la instalación'],
        ['tlf', 'Teléfono'],
        ['email', 'Email'],
    ];
    const missing = REQUERIDOS.filter(([k]) => !data[k]).map(([, label]) => label);

    return { data, missing };
}

module.exports = { buildCertClienteData };
