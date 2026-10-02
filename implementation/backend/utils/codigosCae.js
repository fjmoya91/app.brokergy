/**
 * codigosCae — qué es un código CAE y cuántos cubre un rango.
 *
 * La resolución de inscripción en el Registro Nacional asigna a cada lote un
 * RANGO correlativo: "desde el código CAE_008569324655_311229 hasta el código
 * CAE_008569625482_311229". El código es "CAE_" + 12 cifras correlativas + "_" +
 * un sufijo de 6 cifras que es el mismo en todo el rango.
 *
 * REGLA — el modelo LEE la resolución; qué es un código lo decide esto. Se
 * reextrae el código del texto que devuelve (tolera espacios y guiones entre
 * los bloques, nunca una letra donde va una cifra) y se comprueba que el rango
 * cuadra con el total que declara la propia resolución. De ese rango y ese total
 * sale la factura al Sujeto Obligado: un dígito mal leído es un CAE que no es suyo.
 */

const RE_CAE = /CAE[\s_-]*(\d{12})[\s_-]*(\d{6})/i;

/** "CAE_008569324655_311229" (o con espacios/guiones) → forma canónica, o null. */
function normalizarCodigoCae(v) {
    const m = String(v || '').replace(/ /g, ' ').match(RE_CAE);
    return m ? `CAE_${m[1]}_${m[2]}` : null;
}

function partes(codigo) {
    const m = String(codigo || '').match(/^CAE_(\d{12})_(\d{6})$/);
    return m ? { serie: Number(m[1]), sufijo: m[2] } : null;
}

/** Nº de CAE que cubre el rango [inicial, final], o null si no es un rango válido. */
function contarRangoCae(inicial, final) {
    const a = partes(normalizarCodigoCae(inicial));
    const b = partes(normalizarCodigoCae(final));
    if (!a || !b || a.sufijo !== b.sufijo || b.serie < a.serie) return null;
    return b.serie - a.serie + 1;
}

/**
 * Comprueba lo leído y devuelve los avisos. `total` es el que declara la
 * resolución ("un total de 300.828 CAE"); `esperado`, el ahorro verificado del lote.
 */
function comprobarRangoCae({ cae_inicial, cae_final, total }, { esperado } = {}) {
    const avisos = [];
    const ini = normalizarCodigoCae(cae_inicial);
    const fin = normalizarCodigoCae(cae_final);
    if (!ini) avisos.push('No se ha podido leer el CAE inicial.');
    if (!fin) avisos.push('No se ha podido leer el CAE final.');
    let rango = null;
    if (ini && fin) {
        const a = partes(ini), b = partes(fin);
        if (a.sufijo !== b.sufijo) avisos.push(`Los dos códigos no llevan el mismo sufijo (_${a.sufijo} y _${b.sufijo}): revisa que sean del mismo rango.`);
        else if (b.serie < a.serie) avisos.push('El CAE final es anterior al inicial: revisa que no estén cruzados.');
        rango = contarRangoCae(ini, fin);
    }
    const fmt = (n) => Number(n).toLocaleString('es-ES');
    if (rango != null && Number(total) > 0 && rango !== Number(total)) {
        avisos.push(`El rango cubre ${fmt(rango)} códigos y la resolución dice ${fmt(total)}: algún dígito se ha leído mal.`);
    }
    const cuenta = Number(total) > 0 ? Number(total) : rango;
    if (cuenta && Number(esperado) > 0 && Math.round(Number(esperado)) !== cuenta) {
        avisos.push(`Se emiten ${fmt(cuenta)} CAE y el ahorro verificado del lote es de ${fmt(Math.round(Number(esperado)))} kWh.`);
    }
    return { cae_inicial: ini, cae_final: fin, rango, avisos };
}

module.exports = { normalizarCodigoCae, contarRangoCae, comprobarRangoCae };
