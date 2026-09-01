/**
 * loteVerificados — Qué se hace con lo que se ha LEÍDO de los documentos del lote.
 *
 * `loteOcrService` transcribe el papel; aquí se decide: a qué expediente
 * corresponde cada actuación, si la factura es de este lote, si las cifras
 * cuadran, y se escribe el ahorro verificado. Todo determinista, para que se
 * pueda reproducir por qué se propuso cada número.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REGLA — el ahorro verificado es SOBRE LO QUE SE COBRA Y SE PAGA.
 * La factura al Sujeto Obligado se emite sobre él y el bono del cliente se
 * calcula con él. Por eso nada se escribe sin que una persona lo confirme: se
 * PROPONE lo leído, casado y con sus avisos, y el ADMIN aplica. Mismo criterio
 * que las incidencias de las facturas de obra.
 *
 * REGLA — un expediente que no case NO se toca.
 * Si el informe cita una actuación que no está en el lote (o al revés), se dice
 * y se deja fuera. Adivinar a cuál se parece más es justo la forma de pagarle a
 * un cliente el ahorro de otro.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const supabase = require('./supabaseClient');

const nowIso = () => new Date().toISOString();

// Los números de expediente se comparan sin NINGÚN separador: solo letras y
// dígitos. El PDF escribe el mismo número de varias formas y hasta dentro del
// mismo informe — medido en el CAE-1490: "25RES060_65" en unas actuaciones y
// "25RES060 70" (con espacio) en otras, según cómo caiga el guion bajo al extraer
// el texto. Conservando el `_` no casaban entre sí, y tres de cinco expedientes
// salían como "no existe en este lote".
//
// Quitarlo no crea ambigüedad: el formato es {AA}{FICHA}_{N} y sin el separador
// sigue siendo único ("25RES06070" solo puede ser 25RES060_70).
const normNum = (v) => String(v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

// Nombres: sin tildes y sin dobles espacios, igual que el resto de buscadores de
// la app (ver `norm()` en los listados).
const normNombre = (v) => String(v || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * Casa las actuaciones leídas del informe con los expedientes del lote.
 *
 * @param {Array} actuaciones  lo leído (`loteOcrService.leerInformeVerificacion`)
 * @param {Array} expedientes  los del lote: { id, numero_expediente, cliente_nombre?, instalacion? }
 * @returns {{filas:Array, faltan:Array, avisos:Array}}
 *   filas   → una por actuación leída, con `expediente_id` cuando ha casado
 *   faltan  → expedientes del lote que el informe no menciona
 */
function casarActuaciones(actuaciones, expedientes) {
    const exps = Array.isArray(expedientes) ? expedientes : [];
    const porNumero = new Map(exps.map(e => [normNum(e.numero_expediente), e]));
    const usados = new Set();
    const avisos = [];

    const filas = (Array.isArray(actuaciones) ? actuaciones : []).map((a) => {
        const leido = normNum(a.expediente);
        let exp = leido ? porNumero.get(leido) : null;
        let casadoPor = exp ? 'numero' : null;

        // Respaldo por TITULAR, solo si es inequívoco: un informe puede traer el
        // número mal transcrito, pero el propietario del ahorro es el mismo.
        if (!exp && a.titular) {
            const t = normNombre(a.titular);
            const cand = exps.filter(e => e.cliente_nombre && normNombre(e.cliente_nombre) === t);
            if (cand.length === 1) { exp = cand[0]; casadoPor = 'titular'; }
        }

        const fila = {
            orden: a.orden ?? null,
            expediente_leido: a.expediente || null,
            titular: a.titular || null,
            ficha: a.ficha || null,
            ahorro_kwh: a.ahorro_kwh ?? null,
            // El informe trae TAMBIÉN la inversión de cada actuación, y es la misma
            // que luego imprime el dictamen. Se aplica en la misma pasada: eran dos
            // revisiones para dos cifras que vienen en el mismo papel.
            inversion_eur: a.inversion_eur ?? null,
            expediente_id: exp?.id || null,
            numero_expediente: exp?.numero_expediente || null,
            casado_por: casadoPor,
            ahorro_actual_kwh: exp ? (Number(exp?.instalacion?.verificacion?.ahorro_verificado_kwh) || null) : null,
            inversion_actual_eur: exp ? (Number(exp.inversion_actual_eur) || null) : null,
            avisos: [],
        };

        if (!exp) fila.avisos.push('No hay ningún expediente de este lote con ese número.');
        else if (usados.has(exp.id)) fila.avisos.push('Este expediente ya aparece en otra actuación del informe.');
        else usados.add(exp.id);

        if (casadoPor === 'titular') fila.avisos.push('Casado por el titular, no por el número: compruébalo.');
        if (fila.ahorro_kwh == null) fila.avisos.push('No se ha podido leer el ahorro de esta actuación.');
        if (fila.ahorro_actual_kwh != null && fila.ahorro_kwh != null && fila.ahorro_actual_kwh !== fila.ahorro_kwh) {
            fila.avisos.push(`Ya tenía ${fila.ahorro_actual_kwh.toLocaleString('es-ES')} kWh registrados.`);
        }
        if (fila.inversion_actual_eur != null && fila.inversion_eur != null
            && Math.abs(fila.inversion_actual_eur - fila.inversion_eur) >= 0.01) {
            fila.avisos.push(`La inversión registrada era ${fila.inversion_actual_eur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €.`);
        }
        // Solo se puede aplicar lo que tiene destino y cifra.
        fila.aplicable = !!(fila.expediente_id && fila.ahorro_kwh != null);
        return fila;
    });

    const mencionados = new Set(filas.map(f => f.expediente_id).filter(Boolean));
    const faltan = exps.filter(e => !mencionados.has(e.id))
        .map(e => ({ id: e.id, numero_expediente: e.numero_expediente }));
    if (faltan.length) {
        avisos.push(`El informe no menciona ${faltan.length} expediente${faltan.length === 1 ? '' : 's'} del lote: ${faltan.map(f => f.numero_expediente).join(', ')}.`);
    }
    return { filas, faltan, avisos };
}

/**
 * Casa las filas del DICTAMEN con los expedientes del lote.
 *
 * ⚠️ La tabla del dictamen NO cita el número de expediente: solo el código de
 * ficha, que se repite (RES060, RES060, RES060, RES080, RES080). Lo único
 * distintivo de cada fila es su AHORRO, así que se casa por ahí, contra el ahorro
 * verificado que dejó el informe.
 *
 * Casar por ORDEN sería adivinar: el orden de la tabla es el del informe, no el
 * de ninguna lista que tengamos, y una inversión puesta en el expediente
 * equivocado es la cifra que luego viaja al Anexo y al verificador.
 *
 * Por eso, si el lote no tiene todavía los ahorros verificados, no se propone
 * nada y se dice qué hacer antes (subir el informe y registrar sus ahorros).
 */
function casarDictamen(actuaciones, expedientes) {
    const exps = Array.isArray(expedientes) ? expedientes : [];
    const avisos = [];

    // Índice por ahorro verificado. Un mismo ahorro en dos expedientes deja de ser
    // distintivo: se marcan los dos y no se casa ninguno.
    const porAhorro = new Map();
    for (const e of exps) {
        const k = Number(e?.instalacion?.verificacion?.ahorro_verificado_kwh);
        if (!(k > 0)) continue;
        if (porAhorro.has(k)) porAhorro.set(k, 'AMBIGUO');
        else porAhorro.set(k, e);
    }
    if (porAhorro.size === 0) {
        avisos.push('Ningún expediente del lote tiene todavía su ahorro verificado, y el dictamen no cita los números de expediente: sube antes el informe de verificación y registra sus ahorros.');
    }

    const usados = new Set();
    const filas = (Array.isArray(actuaciones) ? actuaciones : []).map((a) => {
        const hit = a.ahorro_kwh != null ? porAhorro.get(a.ahorro_kwh) : undefined;
        const exp = (hit && hit !== 'AMBIGUO') ? hit : null;

        const fila = {
            orden: a.orden ?? null,
            ficha: a.ficha || null,
            ahorro_kwh: a.ahorro_kwh ?? null,
            inversion_eur: a.inversion_eur ?? null,
            vida_util: a.vida_util ?? null,
            expediente_id: exp?.id || null,
            numero_expediente: exp?.numero_expediente || null,
            casado_por: exp ? 'ahorro' : null,
            inversion_actual_eur: exp ? (Number(exp.inversion_actual_eur) || null) : null,
            avisos: [],
        };

        if (hit === 'AMBIGUO') fila.avisos.push('Hay dos expedientes del lote con ese mismo ahorro: no se puede saber a cuál corresponde.');
        else if (!exp) fila.avisos.push('Ningún expediente del lote tiene registrado ese ahorro verificado.');
        else if (usados.has(exp.id)) fila.avisos.push('Este expediente ya aparece en otra fila del dictamen.');
        else usados.add(exp.id);

        // La ficha del dictamen tiene que ser la del expediente: es la comprobación
        // que delata un casado por ahorro que ha coincidido de casualidad.
        if (exp && fila.ficha && exp.numero_expediente && !String(exp.numero_expediente).toUpperCase().includes(String(fila.ficha).toUpperCase())) {
            fila.avisos.push(`El dictamen dice ${fila.ficha} y el expediente es ${exp.numero_expediente}.`);
        }
        if (fila.inversion_eur == null) fila.avisos.push('No se ha podido leer la inversión de esta fila.');
        if (fila.inversion_actual_eur != null && fila.inversion_eur != null
            && Math.abs(fila.inversion_actual_eur - fila.inversion_eur) >= 0.01) {
            fila.avisos.push(`La inversión registrada era ${fila.inversion_actual_eur.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €.`);
        }
        fila.aplicable = !!(fila.expediente_id && fila.inversion_eur != null);
        return fila;
    });

    const mencionados = new Set(filas.map(f => f.expediente_id).filter(Boolean));
    const faltan = exps.filter(e => !mencionados.has(e.id))
        .map(e => ({ id: e.id, numero_expediente: e.numero_expediente }));
    if (faltan.length && porAhorro.size > 0) {
        avisos.push(`El dictamen no casa con ${faltan.length} expediente${faltan.length === 1 ? '' : 's'} del lote: ${faltan.map(f => f.numero_expediente).join(', ')}.`);
    }

    // ¿Dice el dictamen algo DISTINTO de lo que ya consta?
    //
    // Lo normal es que no: sus cifras son las mismas que las del informe, que ya
    // se registraron al subirlo. Cuando todo coincide no hay nada que revisar y no
    // se le abre al usuario una pantalla para que confirme lo que ya sabía; basta
    // con sellar el nº y la fecha del dictamen. La revisión se reserva para lo que
    // de verdad cambia, que es donde hace falta que alguien mire.
    const cambian = filas.filter(f => f.aplicable && f.avisos.length > 0);
    const sinCasar = filas.filter(f => !f.aplicable);
    const sinCambios = filas.length > 0 && cambian.length === 0 && sinCasar.length === 0 && faltan.length === 0;

    return { filas, faltan, avisos, sinCambios, nCambian: cambian.length };
}

/**
 * Escribe la INVERSIÓN VERIFICADA (y la vida útil) del dictamen.
 *
 * REGLA — la inversión del dictamen es la DEFINITIVA. La declarada al principio
 * puede haberse corregido en un requerimiento, y la que vale es la que el
 * organismo de verificación da por buena. Se guarda aparte, en
 * `instalacion.verificacion`, junto al ahorro verificado: no pisa
 * `documentacion.facturas[]`, que es el registro de lo que de verdad se facturó.
 */
async function aplicarDatosDictamen(filas, meta = {}) {
    const aplicados = [];
    const errores = [];
    for (const f of (filas || [])) {
        const inv = Number(f?.inversion_eur);
        if (!f?.expediente_id || !Number.isFinite(inv) || inv <= 0) {
            errores.push({ expediente_id: f?.expediente_id || null, error: 'Sin expediente o sin inversión válida.' });
            continue;
        }
        try {
            const { data: exp, error: e1 } = await supabase
                .from('expedientes').select('id, numero_expediente, instalacion')
                .eq('id', f.expediente_id).maybeSingle();
            if (e1 || !exp) throw new Error(e1?.message || 'Expediente no encontrado.');

            const instalacion = {
                ...(exp.instalacion || {}),
                verificacion: {
                    ...(exp.instalacion?.verificacion || {}),   // conserva el ahorro verificado
                    inversion_verificada_eur: inv,
                    ...(f.vida_util ? { vida_util_anios: f.vida_util } : {}),
                    dictamen_numero: meta.numero || null,
                    dictamen_fecha: meta.fecha || null,
                    dictamen_at: nowIso(),
                    dictamen_por: meta.usuario || 'SISTEMA',
                },
            };
            const { error: e2 } = await supabase.from('expedientes')
                .update({ instalacion, updated_at: nowIso() }).eq('id', exp.id);
            if (e2) throw new Error(e2.message);
            aplicados.push({ expediente_id: exp.id, numero_expediente: exp.numero_expediente, inversion_eur: inv });
        } catch (err) {
            errores.push({ expediente_id: f.expediente_id, error: err.message });
        }
    }
    return { aplicados, errores };
}

/**
 * Contrasta la suma de las actuaciones con el TOTAL que declara el informe.
 * Si no cuadran, alguna cifra se ha leído mal (o el informe se contradice) y hay
 * que mirarlo antes de tocar ningún expediente. Se avisa; no se bloquea, porque
 * hemos visto informes reales cuyo total no cuadra con su propio desglose.
 */
function contrastarTotal(informe, filas) {
    const suma = filas.reduce((a, f) => a + (Number(f.ahorro_kwh) || 0), 0);
    const total = Number(informe?.total_kwh);
    if (!Number.isFinite(total) || total <= 0) return { suma, total: null, cuadra: null, aviso: null };
    const cuadra = suma === total;
    return {
        suma,
        total,
        cuadra,
        aviso: cuadra ? null
            : `La suma de las actuaciones (${suma.toLocaleString('es-ES')} kWh) no coincide con el total que declara el informe (${total.toLocaleString('es-ES')} kWh). Diferencia: ${(suma - total).toLocaleString('es-ES')} kWh.`,
    };
}

/**
 * Comprueba que la factura leída es la del VERIFICADOR y la de ESTE lote.
 * Trabajamos con un verificador por lote y las facturas se parecen todas: subir
 * la de otro lote emparejaría un coste con los expedientes equivocados y con él
 * el €/MWh que se le presenta al Sujeto Obligado.
 *
 * Avisa, no bloquea: el dato lo confirma una persona, y una referencia que el
 * OCR no haya podido leer no es prueba de que la factura esté mal.
 */
function verificarFacturaDelLote(factura, lote, verificador) {
    const avisos = [];
    const codigo = String(lote?.codigo || '').toUpperCase();
    const cae = String(lote?.expediente_verificador || '').toUpperCase();

    const leidoLote = String(factura?.lote_codigo || '').toUpperCase().replace(/\s/g, '');
    const leidoCae = String(factura?.expediente_cae || '').toUpperCase().replace(/\s/g, '');

    if (leidoLote && codigo && leidoLote !== codigo.replace(/\s/g, '')) {
        avisos.push(`La factura cita el pedido ${factura.lote_codigo}, y este lote es ${lote.codigo}.`);
    }
    if (leidoCae && cae && leidoCae !== cae.replace(/\s/g, '')) {
        avisos.push(`La factura cita el expediente ${factura.expediente_cae}, y este lote tiene el ${lote.expediente_verificador}.`);
    }
    const nifVerif = String(verificador?.cif || verificador?.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const nifEmisor = String(factura?.emisor?.nif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (nifVerif && nifEmisor && nifVerif !== nifEmisor) {
        avisos.push(`La emite ${factura.emisor?.nombre || 'otra empresa'} (${factura.emisor?.nif}), y el verificador del lote es ${verificador?.nombre_empresa || verificador?.nombre || '—'} (${verificador?.cif || verificador?.nif}).`);
    }
    if (factura?.base_imponible == null && factura?.total == null) {
        avisos.push('No se ha podido leer ningún importe en la factura.');
    }
    return { avisos, coincide: avisos.length === 0 };
}

/**
 * Escribe en los expedientes lo verificado: el ahorro y —si viene— la inversión.
 *
 * Las dos cifras están en el MISMO papel (el informe las trae las dos, y el
 * dictamen las repite), así que se aplican de una vez: eran dos revisiones para
 * dos números que llegan juntos.
 *
 * Escribe SOLO la clave `verificacion` de `instalacion`, fundiéndola con lo que
 * ya hubiera: `instalacion` lleva el resto de datos técnicos del expediente y un
 * reemplazo se los llevaría por delante.
 *
 * @param {Array<{expediente_id, ahorro_kwh, inversion_eur?, vida_util?}>} filas
 * @param {{usuario?:string, informe?:string, fechaInforme?:string, origen?:string}} meta
 * @returns {Promise<{aplicados:Array, errores:Array}>}
 */
async function aplicarAhorrosVerificados(filas, meta = {}) {
    const aplicados = [];
    const errores = [];
    for (const f of (filas || [])) {
        const kwh = Number(f?.ahorro_kwh);
        if (!f?.expediente_id || !Number.isFinite(kwh) || kwh <= 0) {
            errores.push({ expediente_id: f?.expediente_id || null, error: 'Sin expediente o sin ahorro válido.' });
            continue;
        }
        try {
            const { data: exp, error: e1 } = await supabase
                .from('expedientes').select('id, numero_expediente, instalacion')
                .eq('id', f.expediente_id).maybeSingle();
            if (e1 || !exp) throw new Error(e1?.message || 'Expediente no encontrado.');

            const inv = Number(f?.inversion_eur);
            const instalacion = {
                ...(exp.instalacion || {}),
                verificacion: {
                    ...(exp.instalacion?.verificacion || {}),   // no pierde el sello del dictamen
                    ahorro_verificado_kwh: kwh,
                    ...(Number.isFinite(inv) && inv > 0 ? { inversion_verificada_eur: inv } : {}),
                    ...(f?.vida_util ? { vida_util_anios: Number(f.vida_util) } : {}),
                    fuente: 'MARWEN',
                    fecha: nowIso(),
                    registrado_por: meta.usuario || 'SISTEMA',
                    origen: meta.origen || 'INFORME_VERIFICACION',
                    ...(meta.informe ? { informe_expediente_cae: meta.informe } : {}),
                    ...(meta.fechaInforme ? { informe_fecha: meta.fechaInforme } : {}),
                },
            };
            const { error: e2 } = await supabase.from('expedientes')
                .update({ instalacion, updated_at: nowIso() }).eq('id', exp.id);
            if (e2) throw new Error(e2.message);
            aplicados.push({
                expediente_id: exp.id, numero_expediente: exp.numero_expediente,
                ahorro_kwh: kwh, inversion_eur: (Number.isFinite(inv) && inv > 0) ? inv : null,
            });
        } catch (err) {
            errores.push({ expediente_id: f.expediente_id, error: err.message });
        }
    }
    return { aplicados, errores };
}

/**
 * ¿Puede este lote pasar a pagar al cliente?
 *
 * REGLA DE NEGOCIO — no se le paga a un cliente hasta tener SU ahorro verificado.
 * El bono se calcula sobre el ahorro que el verificador ha dado por bueno; con el
 * estimado se pagaría de más o de menos, y un pago hecho no se deshace. El ahorro
 * verificado se rellena con el informe de verificación final.
 *
 * @returns {{ok:boolean, faltan:Array<string>}}
 */
function puedePagarseAlCliente(expedientes) {
    const faltan = (Array.isArray(expedientes) ? expedientes : [])
        .filter(e => !(Number(e?.instalacion?.verificacion?.ahorro_verificado_kwh) > 0))
        .map(e => e.numero_expediente);
    return { ok: faltan.length === 0, faltan };
}

module.exports = {
    casarActuaciones,
    casarDictamen,
    aplicarDatosDictamen,
    contrastarTotal,
    verificarFacturaDelLote,
    aplicarAhorrosVerificados,
    puedePagarseAlCliente,
};
