/**
 * Mapeo del tipo de emisor (elegido en el funnel) al esquema interno
 * de la calculadora: emitterType + SCOP por defecto.
 *
 * Los SCOP por defecto siguen la regla 8 de CLAUDE.md:
 *   suelo_radiante → SCOP alto (35°C)
 *   radiadores_baja_temp → SCOP medio (45°C)
 *   radiadores_convencionales → SCOP bajo (55°C)
 *   fancoils → SCOP medio-alto
 */

const EMISOR_MAP = {
    radiadores_convencionales: {
        emitterType: 'radiadores_convencionales',
        scopHeating: 2.8,
        label: 'Radiadores tradicionales'
    },
    radiadores_baja_temp: {
        emitterType: 'radiadores_baja_temp',
        scopHeating: 3.2,
        label: 'Radiadores de baja temperatura'
    },
    suelo_radiante: {
        emitterType: 'suelo_radiante',
        scopHeating: 4.0,
        label: 'Suelo radiante'
    },
    fancoils: {
        emitterType: 'fancoils',
        scopHeating: 3.5,
        label: 'Fancoils / Split'
    }
};

function mapEmisor(emisor_tipo) {
    return EMISOR_MAP[emisor_tipo] || EMISOR_MAP.radiadores_convencionales;
}

export { mapEmisor, EMISOR_MAP };
