// ============================================================================
// Las FECHAS del CIFO tienen que cuadrar — y si no, es GRAVE.
// ----------------------------------------------------------------------------
// El inicio y el fin de actuación del CIFO NO son un campo que se teclee: los
// calcula `calcCifo`: inicio = la PRIMERA factura; fin = lo último entre la
// última factura y la fecha de pruebas del Certificado RITE (15/11/2026). Eso tiene una consecuencia que
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
import { calcCifo } from './calcCifo.js';
import { facturaComputa } from './facturasCae.js';
import { hitosActuacion, aclaracionSugerida, fechaEs } from './hitosActuacion.js';

// Lo que se le dice a quien ve el aviso para que sepa DÓNDE se arregla. Una
// factura de entrega de material o un anticipo no es un error del expediente: es
// una fecha que hay que explicar, y eso se hace desde «Hitos de la actuación».
// Desde el 12/11/2026 una factura de material o un anticipo ABRE la actuación
// (Marwen CAE-2078: primer compromiso en firme, RD 36/2023), así que el inicio no
// se puede retrasar marcándola. Lo que queda es el CEE inicial (regla 199).
const COMO_SE_ACLARA = 'Aunque la primera factura sea de material o un anticipo, abre la actuación (es el primer compromiso en firme): el inicio no se retrasa. Para el CAE no es grave; ojo con el IRPF del cliente: la deducción por eficiencia energética pide el CEE inicial expedido antes del inicio de las obras. Si el CEE inicial aún no está registrado, lo que se corrige es su fecha de firma, antes de esa factura (decide Fran); si ya lo está, se explica en el escrito aclaratorio del lote. Las fechas, juntas, en «Hitos de la actuación» (junto a las fechas del CIFO).';

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
    // `accion` dice qué superficie ARREGLA el aviso ('hitos' = el popup de hitos
    // de la actuación). La pinta el panel de incidencias como un botón al lado.
    const add = (tipo, severidad, titulo, texto, evidencia, slot = 'cert_cifo', extra = {}) =>
        out.push({ tipo, severidad, titulo, texto, evidencia, slot, ...extra });

    const { inicio, fin } = calcCifo(doc);
    const pruebas = iso(doc.fecha_pruebas_cert_instalacion);
    const facturas = (doc.facturas || []).filter(facturaComputa).map(f => iso(f?.fecha_factura)).filter(Boolean);
    const manual = doc.fecha_inicio_cifo_manual || doc.fecha_fin_cifo_manual;

    // ── La fecha de pruebas es la que puede CERRAR la actuación ──────────────
    // Desde el 15/11/2026 el inicio es siempre la primera factura; las pruebas
    // cuentan para el FIN (lo último entre la última factura y las pruebas).
    if (!pruebas) {
        add('SIN_PRUEBAS_RITE', 'GRAVE',
            'Sin fecha de pruebas del Certificado RITE',
            'El CIFO toma su fecha de fin de lo último entre la última factura y la fecha de pruebas del Certificado de Instalación Térmica. Sin la de pruebas, el fin sale solo de las facturas y puede quedar antes de que se probara la instalación.',
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
    // REGLA — que la actuación (una partida, las pruebas RITE) empiece antes de
    // la visita, la firma o el registro del CEE inicial NO es GRAVE: como mucho
    // LEVE (Fran, 08/11/2026, LOTE-2026-019, 26RES060_96 y _112; y 09/11/2026,
    // 26RES060_150: «no es grave que haya partidas antes del cee inicial»). No
    // bloquea ni obliga a regenerar el CIFO; si hace falta, se explica en el
    // escrito aclaratorio del lote. Antes era GRAVE en todas las fichas.
    // Lo que decide es la FIRMA del CEE inicial, no su REGISTRO: el certificado
    // existe desde que el técnico lo firma; registrarlo es un trámite posterior.
    //   · inicio < FIRMA → LEVE, con el botón de «Hitos». Desde el 12/11/2026 ya
    //     no se apaga marcando la factura como material o anticipo (CAE-2078).
    //   · FIRMA ≤ inicio < REGISTRO → LEVE en RES080; en las demás fichas el
    //     registro no limita (docs/conocimiento/lotes/auditar-los-cee-res060-
    //     frente-a-res080.md) y se avisa igual como LEVE.
    const ceeIniReg = iso(doc.fecha_registro_cee_inicial);
    const ceeIniFirma = iso(doc.fecha_firma_cee_inicial) || iso(expediente?.cee?.cee_inicial?.fechaFirma);
    const esRes080 = String(expediente?.numero_expediente || '').includes('RES080');
    if (inicio && ceeIniFirma && inicio < ceeIniFirma) {
        add('FECHA_ANTERIOR_CEE', 'LEVE',
            'La actuación empieza antes del CEE inicial',
            `El CIFO arranca el ${esES(inicio)} y el CEE inicial está firmado el ${esES(ceeIniFirma)}. No bloquea, pero el verificador lo cruza. ${COMO_SE_ACLARA}`,
            `Inicio ${esES(inicio)} < firma CEE inicial ${esES(ceeIniFirma)}`, 'cert_cifo', { accion: 'hitos' });
    } else if (ceeIniReg && inicio && inicio < ceeIniReg) {
        const soloRegistro = ceeIniFirma && inicio >= ceeIniFirma;
        if (soloRegistro && esRes080) {
            add('FECHA_ANTERIOR_CEE', 'LEVE',
                'La actuación empieza antes de REGISTRARSE el CEE inicial',
                `El CIFO arranca el ${esES(inicio)}, el CEE inicial está firmado el ${esES(ceeIniFirma)} y se registró el ${esES(ceeIniReg)}. El certificado de partida ya existía cuando empezó la obra; lo que llegó después es su registro, que es un trámite del certificador. En un RES080 el ahorro se justifica comparando el CEE inicial con el final, así que basta con que el inicial describa la vivienda antes de tocarla.`,
                `Firma ${esES(ceeIniFirma)} ≤ inicio ${esES(inicio)} < registro ${esES(ceeIniReg)}`);
        } else {
            add('FECHA_ANTERIOR_CEE', 'LEVE',
                'La actuación empieza antes del CEE inicial',
                soloRegistro
                    ? `El CIFO arranca el ${esES(inicio)} y el CEE inicial no se registró hasta el ${esES(ceeIniReg)} (firmado el ${esES(ceeIniFirma)}). El certificado de partida ya existía; el registro llegó después. No bloquea: si hace falta, se explica en el escrito aclaratorio del lote.`
                    : `El CIFO arranca el ${esES(inicio)} y el CEE inicial se registró el ${esES(ceeIniReg)}. No bloquea, pero el verificador lo cruza. ${COMO_SE_ACLARA}`,
                `Inicio ${esES(inicio)} < CEE inicial ${esES(ceeIniReg)}`, 'cert_cifo', { accion: 'hitos' });
        }
    }

    // ── Facturas ANTERIORES al inicio, sin aclarar ──────────────────────────
    // Desde el 12/11/2026 solo existen si alguien ha fijado el inicio a mano (la
    // marca de material / anticipo ya no saca ninguna factura del inicio). Lo que
    // el verificador ve es una factura fechada ANTES del inicio que el CIFO
    // declara, y en CAE-2078 lo levantó como inexactitud: LEVE, que se mire.
    const hitos = hitosActuacion(expediente);
    if (hitos.anteriores.length && !hitos.aclaracion) {
        const lista = hitos.anteriores.map(f => `${f.numero ? `nº ${f.numero}` : 'sin número'} (${fechaEs(f.fecha)})`).join(', ');
        add('FACTURA_ANTERIOR_INICIO', 'LEVE',
            'Hay facturas anteriores al inicio de la actuación sin aclarar',
            `El CIFO declara el inicio el ${esES(inicio)} y ${hitos.anteriores.length === 1 ? 'la factura' : 'las facturas'} ${lista} ${hitos.anteriores.length === 1 ? 'es anterior' : 'son anteriores'}. El verificador lo cruza: conviene que el propio CIFO lo explique con una aclaración en «Hitos de la actuación».${aclaracionSugerida(hitos) ? ' Hay una redacción propuesta lista para revisar.' : ''}`,
            `Factura ${fechaEs(hitos.anteriores[0].fecha)} < inicio ${esES(inicio)}`, 'cert_cifo', { accion: 'hitos' });
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
