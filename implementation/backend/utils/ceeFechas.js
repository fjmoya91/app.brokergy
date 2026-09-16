/**
 * ceeFechas — de dónde sale la fecha de un CEE.
 *
 * El mismo dato vive en DOS sitios porque la app lo espeja al guardar: la rejilla
 * del módulo CEE lo escribe en `cee.fecha_firma_cee_{fase}` y `ExpedienteDetailView`
 * lo copia además a `documentacion.fecha_firma_cee_{fase}`, que es de donde lo leen
 * el CIFO y las fichas. Cualquiera de los dos puede estar solo, según por qué
 * superficie se guardara el expediente, así que quien pregunte por la fecha tiene
 * que mirar los tres escalones o dirá "no consta" de un dato que sí está.
 *
 * REGLA — la fecha que fija cuándo EXISTE el certificado de partida es la de FIRMA,
 * no la de REGISTRO. El certificado existe desde que lo firma el técnico; inscribirlo
 * en el Registro es un trámite posterior, del certificador y de la administración,
 * que se toma sus semanas. Una obra que arranca entre una fecha y la otra no se hizo
 * sin situación de referencia: se hizo con el certificado ya emitido.
 *
 * (El gemelo de esta cascada en el frontend es `logic/cifoFechas.js`, que decide con
 * ella si el INICIO DE ACTUACIÓN del CIFO es anterior al CEE de partida.)
 */

const norm = (p) => (p === 'final' || p === 'FINAL' ? 'final' : 'inicial');

/** ISO `aaaa-mm-dd`, o null si no hay una fecha reconocible. */
const iso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);

/** Fecha de FIRMA (emisión) del certificado de esa fase. */
function fechaFirmaCee(exp, fase = 'inicial') {
    const f = norm(fase);
    const cee = exp?.cee || {};
    const doc = exp?.documentacion || {};
    return iso(cee[`fecha_firma_cee_${f}`])
        || iso(cee[`cee_${f}`]?.fechaFirma)
        || iso(doc[`fecha_firma_cee_${f}`]);
}

/** Fecha de REGISTRO oficial del certificado de esa fase (trámite posterior a la firma). */
function fechaRegistroCee(exp, fase = 'inicial') {
    const f = norm(fase);
    return iso(exp?.documentacion?.[`fecha_registro_cee_${f}`])
        || iso(exp?.cee?.[`fecha_registro_cee_${f}`]);
}

module.exports = { fechaFirmaCee, fechaRegistroCee };
