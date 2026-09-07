// ============================================================================
// Las FECHAS del CIFO tienen que cuadrar — y si no, es GRAVE.
// ----------------------------------------------------------------------------
// El inicio y el fin de actuación del CIFO NO son un campo que se teclee: los
// calcula `calcCifo` como el MÍNIMO y el MÁXIMO de {fecha de pruebas del
// Certificado RITE, fechas de todas las facturas}. Eso tiene una consecuencia que
// no se ve en pantalla: **el valor guardado en `fecha_inicio_cifo` /
// `fecha_fin_cifo` no manda**. Si se registra una factura nueva, o se corrige la
// fecha de pruebas, el CIFO que se regenere imprimirá OTRAS fechas que las del
// CIFO que el instalador ya firmó — y esa discrepancia entre dos copias del mismo
// certificado es de las primeras cosas que mira un verificador.
//
// Medido el 2026-09-07 sobre los 24 expedientes de "DOC. COMPLETA APPSHEET": 3
// descuadraban, y uno de ellos por una fecha de factura leída como 2005.
//
// REGLA — esto NO corrige nada. Detecta y describe, con las dos cifras a la
// vista, para que quien mire decida: o se corrige la fecha de la factura, o se
// fija el override manual (`fecha_inicio_cifo_manual` / `_fin_cifo_manual`), que
// es el mecanismo que ya existe para atender un requerimiento.
// ============================================================================
import { calcCifo } from './calcCifo';

const iso = (v) => (v ? String(v).slice(0, 10) : null);
const esES = (v) => (iso(v) ? iso(v).split('-').reverse().join('/') : '—');
const hoyISO = () => new Date().toISOString().slice(0, 10);

/**
 * @param {object} expediente  fila de `expedientes` (usa documentacion)
 * @returns {Array<{tipo,severidad,titulo,texto,evidencia,slot}>}
 */
export function incidenciasFechasCifo(expediente) {
    const doc = expediente?.documentacion || {};
    const out = [];
    const add = (tipo, severidad, titulo, texto, evidencia, slot = 'cert_cifo') =>
        out.push({ tipo, severidad, titulo, texto, evidencia, slot });

    const { inicio, fin } = calcCifo(doc);
    const pruebas = iso(doc.fecha_pruebas_cert_instalacion);
    const facturas = (doc.facturas || []).map(f => iso(f?.fecha_factura)).filter(Boolean);
    const manual = doc.fecha_inicio_cifo_manual || doc.fecha_fin_cifo_manual;

    // ── La fecha de pruebas es la que abre la actuación ──────────────────────
    if (!pruebas) {
        add('SIN_PRUEBAS_RITE', 'GRAVE',
            'Sin fecha de pruebas del Certificado RITE',
            'El CIFO toma su fecha de inicio del menor entre la fecha de pruebas del Certificado de Instalación Térmica y las fechas de las facturas. Sin la de pruebas, el inicio sale de una factura, que no es la fecha en que se probó la instalación.',
            null, 'cert_rite');
    }

    // ── Ninguna fecha futura ────────────────────────────────────────────────
    const hoy = hoyISO();
    for (const f of facturas) {
        if (f > hoy) add('FECHA_FUTURA', 'GRAVE', 'Una factura tiene fecha futura',
            `Hay una factura fechada el ${esES(f)}, posterior a hoy. O la fecha está mal leída o la factura está mal emitida; en cualquier caso arrastra el fin de actuación del CIFO.`,
            `Factura ${esES(f)} > hoy ${esES(hoy)}`, 'facturas');
    }
    if (pruebas && pruebas > hoy) {
        add('FECHA_FUTURA', 'GRAVE', 'La fecha de pruebas es futura',
            `El Certificado RITE consta probado el ${esES(pruebas)}, posterior a hoy.`,
            `Pruebas ${esES(pruebas)} > hoy ${esES(hoy)}`, 'cert_rite');
    }

    // ── La actuación es POSTERIOR al CEE de partida ─────────────────────────
    const ceeIni = iso(doc.fecha_registro_cee_inicial);
    if (ceeIni && inicio && inicio < ceeIni) {
        add('FECHA_ANTERIOR_CEE', 'GRAVE',
            'La actuación empieza antes del CEE inicial',
            `El CIFO arranca el ${esES(inicio)} y el CEE inicial se registró el ${esES(ceeIni)}. La actuación tiene que ser posterior al certificado de partida: si empieza antes, la obra se hizo sin existir la situación de referencia sobre la que se calcula el ahorro.`,
            `Inicio ${esES(inicio)} < CEE inicial ${esES(ceeIni)}`);
    }

    // ── Coherencia interna ──────────────────────────────────────────────────
    if (inicio && fin && fin < inicio) {
        add('FECHAS_CIFO', 'GRAVE', 'El fin de actuación es anterior al inicio',
            `El CIFO saldría con inicio ${esES(inicio)} y fin ${esES(fin)}.`,
            `${esES(inicio)} → ${esES(fin)}`);
    }

    // ── Lo guardado vs lo que imprimiría el CIFO de hoy ──────────────────────
    // Solo si hay algo firmado: en un expediente en curso el valor guardado aún
    // no describe ningún documento y avisar sería ruido.
    const firmado = doc.cert_cifo_signed_link || doc.cert_cifo_drive_link;
    const iniGuard = iso(doc.fecha_inicio_cifo);
    const finGuard = iso(doc.fecha_fin_cifo);
    if (firmado && !manual && (iniGuard || finGuard) && (inicio || fin)) {
        const difIni = iniGuard && inicio && iniGuard !== inicio;
        const difFin = finGuard && fin && finGuard !== fin;
        if (difIni || difFin) {
            const partes = [];
            if (difIni) partes.push(`inicio ${esES(iniGuard)} → ${esES(inicio)}`);
            if (difFin) partes.push(`fin ${esES(finGuard)} → ${esES(fin)}`);
            add('FECHAS_CIFO', 'GRAVE',
                'Las fechas del CIFO firmado ya no coinciden con las del expediente',
                `El CIFO que consta guardado va del ${esES(iniGuard)} al ${esES(finGuard)}, pero con los datos de hoy (fecha de pruebas y fechas de las facturas) saldría del ${esES(inicio)} al ${esES(fin)}. Regenerarlo produciría un certificado que dice algo distinto del que ya está firmado. Corrige la fecha que esté mal, o fija el inicio y el fin a mano si las buenas son las del documento firmado.`,
                partes.join(' · '));
        }
    }

    return out;
}

/** Igual que la anterior, pero solo dice si hay algo GRAVE (para pintar rápido). */
export const hayGraveEnFechasCifo = (expediente) =>
    incidenciasFechasCifo(expediente).some(i => i.severidad === 'GRAVE');
