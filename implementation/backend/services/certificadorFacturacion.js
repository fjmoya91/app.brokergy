// ─────────────────────────────────────────────────────────────────────────────
// Facturación del CERTIFICADOR — conciliación mensual.
//
// El certificador NO factura expedientes, factura HITOS DE REGISTRO. Y los
// factura de los DOS negocios en el MISMO papel: expedientes del CAE y CEE
// directos, mezclados y con la misma tarifa —a él le cuesta la misma visita
// levantar uno que otro—, así que la conciliación mira las dos tablas.
//
// Su factura tiene dos bloques (ver plantilla real, factura AP232026 de julio-26):
//
//   · TRABAJOS  → honorarios, con IVA 21 % y retención de IRPF 15 %.
//   · SUPLIDOS  → las tasas de registro que él adelanta ante la administración.
//                 No llevan IVA (art. 78.Tres.3º Ley 37/1992) y se reembolsan
//                 tal cual, así que van FUERA de la base imponible.
//
// Acuerdo vigente con el certificador:
//   · 60 € de honorario POR EXPEDIENTE, se registre uno o los dos CEE. Se
//     devenga UNA sola vez, en el mes del PRIMER registro. Si el CEE final se
//     registra tres meses después, ese mes solo se factura su tasa.
//   · 16,39 € de tasa por CADA registro efectivamente hecho.
//
// De ahí salen los tres conceptos facturables de un expediente:
//   honorario · tasa_inicial · tasa_final
//
// Cada concepto se sella al conciliar la factura (`documentacion.fact_cert`),
// para que no se pueda pagar dos veces y para que lo devengado y no facturado
// arrastre al mes siguiente en vez de perderse.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = require('./supabaseClient');

// Tarifas por defecto. Se pueden sobrescribir por certificador desde el panel
// (se guardan en `app_settings`), porque hay acuerdos puntuales distintos.
const TARIFAS_DEFECTO = {
    honorario: 60,      // € por expediente, una sola vez
    tasa: 16.39,        // € por registro
    iva: 21,            // % sobre los honorarios
    irpf: 15,           // % de retención sobre los honorarios
};

// Pacto vigente: el certificador ADELANTA las dos tasas (inicial y final) y las
// factura enteras en el primer pago, sin esperar a registrar el CEE final. Con
// esto activado, un expediente devenga honorario + las DOS tasas en el mes de su
// primer registro. Desactivarlo solo si con algún certificador se acuerda pagar
// cada tasa contra su registro.
const ADELANTA_TASAS_DEFECTO = true;

const CONCEPTOS = ['honorario', 'tasa_inicial', 'tasa_final'];

const settingsKey = (certificadorId) => `tarifas_certificador:${certificadorId}`;

// Redondeo a céntimo. Sin esto, 540 * 0.21 arrastra basura binaria y el total
// no cuadra con el de la factura por 0,01 €.
const eur = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Mes de devengo ('YYYY-MM'). Las fechas de registro se sellan como 'YYYY-MM-DD'
// (ver ceeUploadService), así que el prefijo es fiable; el respaldo por timestamp
// de los expedientes antiguos se parsea como fecha.
const mesDe = (v) => {
    if (!v) return null;
    const s = String(v);
    const iso = s.match(/^(\d{4})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}`;
    const esp = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);   // dd/mm/yyyy
    if (esp) return `${esp[3]}-${esp[2]}`;
    const d = new Date(s);
    if (isNaN(d)) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Fecha normalizada a 'YYYY-MM-DD' para ordenar y para pintar.
const diaDe = (v) => {
    if (!v) return null;
    const s = String(v);
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const esp = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
    if (esp) return `${esp[3]}-${esp[2]}-${esp[1]}`;
    const d = new Date(s);
    return isNaN(d) ? null : d.toISOString().split('T')[0];
};

async function getTarifas(certificadorId) {
    const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', settingsKey(certificadorId))
        .maybeSingle();

    const base = { ...TARIFAS_DEFECTO, adelanta_tasas: ADELANTA_TASAS_DEFECTO };
    if (!data?.value) return base;
    try {
        return { ...base, ...JSON.parse(data.value) };
    } catch {
        return base;
    }
}

async function saveTarifas(certificadorId, tarifas) {
    const limpias = {};
    for (const k of Object.keys(TARIFAS_DEFECTO)) {
        const v = Number(tarifas?.[k]);
        if (!Number.isFinite(v) || v < 0) throw new Error(`Tarifa inválida: ${k}`);
        limpias[k] = v;
    }
    limpias.adelanta_tasas = tarifas?.adelanta_tasas === undefined
        ? ADELANTA_TASAS_DEFECTO
        : !!tarifas.adelanta_tasas;
    const { error } = await supabase.from('app_settings').upsert(
        { key: settingsKey(certificadorId), value: JSON.stringify(limpias), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
    );
    if (error) throw new Error(error.message);
    return limpias;
}

// Descripción de la línea, redactada como en la factura del certificador para
// que las dos columnas se lean en paralelo sin traducir nada mentalmente.
const descripcionHonorario = (tieneIni, tieneFin) => {
    if (tieneIni && tieneFin) return 'CEE inicial y CEE final registrados';
    if (tieneFin) return 'CEE final registrado';
    return 'CEE inicial registrado';
};

// Fases que ya significan "el certificador ha entregado". Si además te lo
// factura, es que lo ha registrado y la app todavía no se ha enterado.
const FASES_AVANZADAS = ['PRESENTADO', 'PTE_REVISION', 'REVISADO', 'REGISTRADO'];

// Las DOS tablas que el certificador factura. El hito que cobra es el REGISTRO
// de un CEE, y a él le cuesta la misma visita y la misma tasa levantar uno del
// CAE que uno suelto: por eso comparten tarifa y comparten este camino. Lo único
// que cambia es dónde se sella lo facturado.
const TABLAS = {
    CAE: {
        tabla: 'expedientes',
        rpc: 'merge_expediente_doc_json',
        idRpc: 'p_expediente_id',
        select: 'id, numero_expediente, estado, cliente_id, seguimiento, documentacion, instalacion',
    },
    CEE: {
        tabla: 'cee_directos',
        rpc: 'merge_cee_directo_doc_json',
        idRpc: 'p_id',
        select: 'id, numero_expediente, estado, cliente_id, alcance, direccion, municipio, provincia, seguimiento, documentacion',
    },
};

/**
 * Carga lo que el certificador tiene en la app —expedientes CAE y CEE directos—
 * y lo descompone en conceptos facturables con su mes de devengo y su sello.
 */
async function cargarConceptos(certificadorId, tarifas) {
    const [cae, cee] = await Promise.all([
        supabase.from(TABLAS.CAE.tabla).select(TABLAS.CAE.select).eq('cee->>certificador_id', certificadorId),
        supabase.from(TABLAS.CEE.tabla).select(TABLAS.CEE.select).eq('cee->>certificador_id', certificadorId),
    ]);

    if (cae.error) throw new Error(cae.error.message);
    // Un fallo leyendo los CEE directos no puede tumbar la conciliación del CAE,
    // que es la que mueve el dinero grande: se avisa y se sigue con lo que hay.
    if (cee.error) console.error('[facturación certificador] no se pudieron leer los CEE directos:', cee.error.message);

    const filas = [
        ...(cae.data || []).map(e => ({ ...e, origen: 'CAE' })),
        ...(cee.data || []).map(e => ({ ...e, origen: 'CEE' })),
    ];

    const cliIds = [...new Set(filas.map(e => e.cliente_id).filter(Boolean))];
    const cliMap = {};
    if (cliIds.length) {
        const { data: clis } = await supabase
            .from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos, municipio, provincia, direccion')
            .in('id_cliente', cliIds);
        (clis || []).forEach(c => { cliMap[c.id_cliente] = c; });
    }

    const expedientes = [];
    // Los que el certificador probablemente ya haya registrado (y por tanto
    // facturado) pero que en la app siguen sin fecha de registro. Son los
    // candidatos a explicar un descuadre "te factura de más": no hay que
    // pagarlos a ciegas, hay que actualizarles el seguimiento.
    const sinRegistro = [];

    for (const e of filas) {
        const seg = e.seguimiento || {};
        const doc = e.documentacion || {};
        const inst = e.instalacion || {};
        const c = cliMap[e.cliente_id];
        const sellos = doc.fact_cert || {};

        // Misma resolución de fecha que el seguimiento: el sello de
        // `documentacion` manda y el timestamp de la transición es el respaldo.
        const fIni = diaDe(doc.fecha_registro_cee_inicial || seg.cee_inicial_ts?.REGISTRADO);
        const fFin = diaDe(doc.fecha_registro_cee_final || seg.cee_final_ts?.REGISTRADO);

        // Un CEE directo lleva su dirección en la propia fila; un expediente CAE,
        // en `instalacion`, con el domicilio del cliente como respaldo.
        const direccionExp = (e.direccion || inst.direccion || c?.direccion || '').trim() || null;
        const municipioExp = (e.municipio || inst.municipio || c?.municipio || '').trim() || null;
        const provinciaExp = (e.provincia || inst.provincia || c?.provincia || '').trim() || null;
        // Igual que la factura: "C/ Cardenal Segura 23, Pedro Muñoz (Ciudad Real)".
        const ubicacion = [direccionExp, municipioExp && provinciaExp ? `${municipioExp} (${provinciaExp})` : municipioExp]
            .filter(Boolean).join(', ') || null;

        if (!fIni && !fFin) {
            // Nada registrado: nada que facturar. Pero si el CEE ya está
            // presentado o con el visto bueno, es un candidato a aparecer en su
            // factura antes de que la app se entere.
            if (FASES_AVANZADAS.includes(seg.cee_inicial) || FASES_AVANZADAS.includes(seg.cee_final)) {
                sinRegistro.push({
                    expediente_id: e.id,
                    origen: e.origen,
                    numero_expediente: e.numero_expediente,
                    estado: e.estado,
                    cliente_nombre: c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : null,
                    ubicacion,
                    fase_cee_inicial: seg.cee_inicial || null,
                    fase_cee_final: seg.cee_final || null,
                    // La fase dice REGISTRADO pero no hay ninguna fecha que lo
                    // respalde. No es lo mismo que "va por PTE_REVISION": aquí no
                    // falta el trabajo, falta el DATO — y en cuanto se ponga, la
                    // línea se concilia sola.
                    registrado_sin_fecha: seg.cee_inicial === 'REGISTRADO' || seg.cee_final === 'REGISTRADO',
                });
            }
            continue;
        }

        // El honorario se devenga con el PRIMER registro del expediente.
        const primero = [fIni, fFin].filter(Boolean).sort()[0];

        const conceptos = [];
        conceptos.push({
            concepto: 'honorario',
            tipo: 'trabajo',
            descripcion: descripcionHonorario(!!fIni, !!fFin),
            fecha: primero,
            mes: mesDe(primero),
            importe: eur(tarifas.honorario),
            sello: sellos.honorario || null,
        });
        // Con el pacto de ADELANTO, las dos tasas se facturan enteras en el primer
        // pago aunque el CEE final no esté registrado todavía: el certificador ya
        // ha puesto el dinero. Sin él, cada tasa se devenga contra su registro.
        const adelanta = tarifas.adelanta_tasas !== false;
        // Un CEE directo de alcance ÚNICO no tiene fase final: no hay una segunda
        // tasa que adelantar, y darla por devengada premarcaría el cobro de un
        // registro que nunca va a existir. Todo expediente del CAE lleva las dos.
        const dosFases = e.origen !== 'CEE' || e.alcance !== 'UNICO';

        if (fIni || adelanta) {
            conceptos.push({
                concepto: 'tasa_inicial',
                tipo: 'suplido',
                descripcion: 'Tasa de registro CEE inicial',
                fecha: fIni || primero,
                mes: mesDe(fIni || primero),
                importe: eur(tarifas.tasa),
                anticipada: !fIni,
                sello: sellos.tasa_inicial || null,
            });
        }
        if (dosFases && (fFin || adelanta)) {
            conceptos.push({
                concepto: 'tasa_final',
                tipo: 'suplido',
                // Se devenga en el mes del PRIMER registro, que es cuando la
                // factura la trae; si se anclara a la fecha del CEE final, se
                // quedaría fuera del mes en el que realmente te la cobran.
                descripcion: adelanta && !fFin ? 'Tasa de registro CEE final (adelantada)' : 'Tasa de registro CEE final',
                fecha: adelanta ? primero : fFin,
                mes: mesDe(adelanta ? primero : fFin),
                importe: eur(tarifas.tasa),
                anticipada: !fFin,
                sello: sellos.tasa_final || null,
            });
        }

        expedientes.push({
            expediente_id: e.id,
            origen: e.origen,
            numero_expediente: e.numero_expediente,
            estado: e.estado,
            cliente_nombre: c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : null,
            direccion: direccionExp,
            municipio: municipioExp,
            provincia: provinciaExp,
            ubicacion,
            fecha_registro_cee_inicial: fIni,
            fecha_registro_cee_final: fFin,
            conceptos,
        });
    }

    sinRegistro.sort((a, b) => (a.numero_expediente || '').localeCompare(b.numero_expediente || '', 'es', { numeric: true }));
    return { expedientes, sinRegistro };
}

// Agrupa los conceptos de un expediente en una línea de factura.
const aLinea = (exp, conceptos) => {
    const honorarios = conceptos.filter(x => x.tipo === 'trabajo');
    const suplidos = conceptos.filter(x => x.tipo === 'suplido');
    return {
        expediente_id: exp.expediente_id,
        origen: exp.origen,
        numero_expediente: exp.numero_expediente,
        estado: exp.estado,
        cliente_nombre: exp.cliente_nombre,
        ubicacion: exp.ubicacion,
        fecha_registro_cee_inicial: exp.fecha_registro_cee_inicial,
        fecha_registro_cee_final: exp.fecha_registro_cee_final,
        conceptos,
        honorarios: eur(honorarios.reduce((s, x) => s + x.importe, 0)),
        suplidos: eur(suplidos.reduce((s, x) => s + x.importe, 0)),
        total: eur(conceptos.reduce((s, x) => s + x.importe, 0)),
    };
};

// Totales con la MISMA estructura que el pie de la factura del certificador.
const totalizar = (lineas, tarifas) => {
    const base = eur(lineas.reduce((s, l) => s + l.honorarios, 0));
    const suplidos = eur(lineas.reduce((s, l) => s + l.suplidos, 0));
    const iva = eur(base * tarifas.iva / 100);
    const irpf = eur(base * tarifas.irpf / 100);
    const trabajos = eur(base + iva - irpf);
    return { base, iva, irpf, trabajos, suplidos, total: eur(trabajos + suplidos) };
};

/**
 * Vista de conciliación de un mes ('YYYY-MM').
 *
 * Devuelve lo devengado ESE mes, lo que quedó devengado y sin sellar en meses
 * ANTERIORES (arrastre: lo que el certificador aún no te ha facturado) y los
 * totales calculados para cotejarlos contra el pie de su factura.
 */
async function buildFacturacion(certificadorId, mes) {
    const tarifas = await getTarifas(certificadorId);
    const { expedientes, sinRegistro } = await cargarConceptos(certificadorId, tarifas);

    const meses = [...new Set(expedientes.flatMap(e => e.conceptos.map(x => x.mes)).filter(Boolean))]
        .sort().reverse();

    const mesActivo = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : (meses[0] || null);

    const lineas = [];
    const arrastre = [];

    for (const exp of expedientes) {
        const delMes = exp.conceptos.filter(x => x.mes === mesActivo);
        if (delMes.length) lineas.push(aLinea(exp, delMes));

        // Arrastre: devengado ANTES del mes activo y todavía sin sellar.
        const pendientes = exp.conceptos.filter(x => x.mes && mesActivo && x.mes < mesActivo && !x.sello);
        if (pendientes.length) arrastre.push(aLinea(exp, pendientes));
    }

    const orden = (a, b) => (a.numero_expediente || '').localeCompare(b.numero_expediente || '', 'es', { numeric: true });
    lineas.sort(orden);
    arrastre.sort(orden);

    return {
        mes: mesActivo,
        meses_disponibles: meses,
        tarifas,
        lineas,
        arrastre,
        sin_registro: sinRegistro,
        totales: totalizar(lineas, tarifas),
        totales_arrastre: totalizar(arrastre, tarifas),
    };
}

// ─── Emparejado de una factura recibida ──────────────────────────────────────
// El certificador identifica cada línea POR DIRECCIÓN ("C/ Cardenal Segura 23,
// 13620 Pedro Muñoz"), no por número de expediente. Emparejar por texto es
// inevitable, y el riesgo real son los FALSOS POSITIVOS: "Virgen de Criptana 7"
// casaba al 80 % con el expediente de "Virgen de Criptana 82". Por eso el número
// de portal es decisivo — misma calle con otro número es otra casa — y todo lo
// que no llega a confianza ALTA se devuelve para que lo decida una persona.

const NORM = (s) => (s || '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Tipos de vía, partículas y provincias: aparecen en todas las direcciones y no
// distinguen nada.
const VACIAS = new Set(['C', 'CL', 'CALLE', 'AV', 'AVD', 'AVDA', 'AVENIDA', 'PZ', 'PZA', 'PLAZA', 'CTRA',
    'EN', 'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'N', 'NO', 'ESC', 'PL', 'PT', 'BL', 'ES', 'CP',
    'CIUDAD', 'REAL', 'ALBACETE', 'CUENCA', 'TOLEDO', 'POLIGONO', 'VIVIENDA', 'DISEMINADO']);

const palabrasDe = (s) => NORM(s).split(' ').filter(t => t.length >= 3 && !VACIAS.has(t) && !/^\d+$/.test(t));
// Portales: 1-4 dígitos. Los de 5 son códigos postales y no identifican la finca.
const numerosDe = (s) => [...new Set((NORM(s).match(/\b\d{1,4}\b/g) || []))];

// La descripción arranca siempre con el concepto ("CEE inicial y CEE final
// registrados." / "Tasas de registro…"); lo que identifica la finca es lo de detrás.
const soloDireccion = (d) => String(d || '')
    .replace(/^.*?registrad[oa]s?\.?\s*/i, '')
    .replace(/^Tasas? de registro[^.]*\.?\s*/i, '')
    .trim();

// Algunos certificadores (Moncayo) encabezan cada línea con el número de
// expediente: "- (26RES060_160) VIVIENDA UNIFAMILIAR EN QUINTANAR…". Cuando está,
// no hay nada que adivinar.
// Un CEE directo se numera {AAAA}CEE_{n} (año a cuatro dígitos y correlativo
// global): otra tabla y otro formato, pero llega en la MISMA factura, mezclado
// con los del CAE. Sin esta alternativa su línea caía al emparejado por
// dirección, no casaba con ningún expediente y quedaba muda.
const RE_NUM_EXPEDIENTE = /\b(\d{2}(?:RES|TER)\d{3}_\d+|\d{4}CEE_\d+)\b/i;

function emparejar(descripcion, candidatos) {
    const dir = soloDireccion(descripcion);
    const pal = palabrasDe(dir);
    const num = numerosDe(dir);
    if (!pal.length) return { match: null, score: 0 };

    let mejor = null, mejorScore = 0;
    for (const c of candidatos) {
        let s = pal.filter(x => c.palabras.has(x)).length / pal.length;
        if (num.length && c.numeros.size) s *= num.some(x => c.numeros.has(x)) ? 1 : 0.25;
        if (s > mejorScore) { mejorScore = s; mejor = c; }
    }
    return { match: mejorScore >= 0.45 ? mejor : null, score: Math.round(mejorScore * 100) / 100 };
}

const confianzaDe = (score) => (score >= 0.7 ? 'ALTA' : score >= 0.45 ? 'REVISAR' : 'SIN_MATCH');

/**
 * Cruza una factura ya parseada contra los expedientes del certificador.
 *
 * Devuelve una línea por concepto de la factura con el expediente propuesto y
 * los conceptos DEVENGADOS que esa línea cubriría, listos para sellar. No
 * escribe nada: es una propuesta.
 */
/**
 * Comprueba que la factura la emite el certificador cuya ficha está abierta.
 *
 * Trabajamos con varios certificadores y el panel es por ficha: subir la factura
 * de uno estando en la ficha de otro emparejaría contra los expedientes
 * equivocados. Se coteja por NIF, que todas las plantillas imprimen.
 */
async function verificarEmisor(certificadorId, nifs) {
    const limpios = [...new Set((nifs || []).map(n => String(n).toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean))];

    const { data: yo } = await supabase
        .from('prescriptores')
        .select('id_empresa, razon_social, cif')
        .eq('id_empresa', certificadorId)
        .maybeSingle();

    const miCif = String(yo?.cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const esperado = yo?.razon_social || 'este certificador';

    if (!limpios.length) return { estado: 'DESCONOCIDO', esperado };
    if (miCif && limpios.includes(miCif)) return { estado: 'OK', esperado };

    // ¿Es de otro certificador nuestro? Poder decir de quién es ahorra el susto.
    // Se busca SOLO entre certificadores: el NIF de Brokergy también sale en la
    // factura (es quien la recibe) y está en `prescriptores`, así que sin este
    // filtro se acusaría a Brokergy de emitirse las facturas a sí misma.
    const { data: otros } = await supabase
        .from('prescriptores')
        .select('id_empresa, razon_social, cif')
        .eq('tipo_empresa', 'CERTIFICADOR')
        .neq('id_empresa', certificadorId);

    const duenio = (otros || []).find(p => {
        const c = String(p.cif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return c && limpios.includes(c);
    });

    if (duenio) return { estado: 'OTRO', esperado, emisor: duenio.razon_social };
    // Sin CIF en la ficha no se puede afirmar nada.
    return { estado: miCif ? 'DESCONOCIDO' : 'SIN_CIF_EN_FICHA', esperado };
}

async function conciliarFactura(certificadorId, { numero, fecha, items, nifs }) {
    if (!Array.isArray(items) || !items.length) throw new Error('La factura no tiene líneas.');

    const emisor = await verificarEmisor(certificadorId, nifs);

    const tarifas = await getTarifas(certificadorId);
    const { expedientes, sinRegistro } = await cargarConceptos(certificadorId, tarifas);

    const candidatos = expedientes.map(e => ({
        ...e,
        palabras: new Set(palabrasDe(`${e.direccion || ''} ${e.municipio || ''}`)),
        numeros: new Set(numerosDe(e.direccion || '')),
    }));

    const porNumero = new Map(candidatos.map(c => [String(c.numero_expediente || '').toUpperCase(), c]));
    // Expedientes suyos que aún NO tienen ningún registro. Es el caso más
    // frecuente de "te factura algo que no encuentro": el certificador entrega,
    // factura, y el CEE sigue pendiente de revisión en la app. Hay que saber
    // distinguirlo de un expediente que no es suyo.
    const sinRegistroPorNumero = new Map((sinRegistro || []).map(e => [String(e.numero_expediente || '').toUpperCase(), e]));

    const lineas = items.map((it, idx) => {
        // Si la línea cita el número de expediente, manda ese: es un dato, no una
        // conjetura. Solo se cae al emparejado por dirección cuando no lo trae.
        const citado = (it.descripcion || '').match(RE_NUM_EXPEDIENTE);
        let match = null, score = 0, citadoDesconocido = null, citadoSinRegistro = null;
        if (citado) {
            const ref = citado[1].toUpperCase();
            const encontrado = porNumero.get(ref);
            if (encontrado) { match = encontrado; score = 1; }
            else if (sinRegistroPorNumero.has(ref)) citadoSinRegistro = sinRegistroPorNumero.get(ref);
            else citadoDesconocido = ref;
        }
        if (!match && !citadoDesconocido && !citadoSinRegistro) ({ match, score } = emparejar(it.descripcion, candidatos));

        const confianza = match ? confianzaDe(score) : 'SIN_MATCH';

        // Qué conceptos del expediente cubre esta línea: el honorario si es un
        // trabajo, y las tasas de los registros que consten si es un suplido.
        let conceptos = [];
        let aviso = null;

        if (citadoDesconocido) {
            aviso = `La factura cita el expediente ${citadoDesconocido} y no consta asignado a este certificador.`;
        }
        // Expediente al que apunta el aviso, para poder abrirlo desde la lista de
        // "qué revisar" sin tener que ir a buscarlo.
        let avisoRef = null;

        if (citadoSinRegistro) {
            const fases = [citadoSinRegistro.fase_cee_inicial, citadoSinRegistro.fase_cee_final]
                .filter(f => f && f !== 'PTE_ENVIO_CERT');
            // "Consta REGISTRADO pero sin fecha" no es lo mismo que "va por
            // PTE_REVISION": ahí no falta el trabajo, falta el DATO, y decirlo
            // convierte un "revísalo" en una tarea de dos segundos.
            aviso = citadoSinRegistro.registrado_sin_fecha
                ? `${citadoSinRegistro.numero_expediente} consta REGISTRADO pero sin fecha de registro, así que no hay nada devengado que sellar. Ponle la fecha del justificante y esta línea se concilia sola.`
                : `${citadoSinRegistro.numero_expediente} es suyo, pero en la app no consta ningún CEE registrado${fases.length ? ` (va por ${fases.join(' / ')})` : ''}. Revísalo antes de pagarlo.`;
            avisoRef = { expediente_id: citadoSinRegistro.expediente_id, origen: citadoSinRegistro.origen, numero_expediente: citadoSinRegistro.numero_expediente };
        }

        if (match) {
            const candidatosConcepto = it.tipo === 'suplido'
                ? match.conceptos.filter(c => c.tipo === 'suplido')
                : match.conceptos.filter(c => c.tipo === 'trabajo');

            conceptos = candidatosConcepto.map(c => ({
                concepto: c.concepto,
                mes: c.mes,
                fecha: c.fecha,
                importe_esperado: c.importe,
                ya_facturado: c.sello ? { factura: c.sello.factura, fecha: c.sello.fecha } : null,
            }));

            // Los avisos van encabezados por el expediente: se leen en una lista
            // fuera de la tabla, y sin el número no se sabe de cuál hablan.
            const ref = match.numero_expediente;
            if (it.tipo === 'suplido' && it.unidades > conceptos.length) {
                aviso = `${ref} — factura ${it.unidades} tasas y en la app solo consta${conceptos.length === 1 ? '' : 'n'} ${conceptos.length} registro${conceptos.length === 1 ? '' : 's'}.`;
            }
            // El caso inverso: la app tiene más registros devengados que tasas
            // cobra la factura. Sin este aviso se premarcarían los dos conceptos
            // y se sellaría el doble de lo que en realidad te está cobrando.
            if (it.tipo === 'suplido' && conceptos.length > it.unidades) {
                aviso = `${ref} — solo cobra ${it.unidades} tasa${it.unidades === 1 ? '' : 's'} y en la app hay ${conceptos.length} registros devengados: marca a mano cuál corresponde.`;
            }
            const yaFact = conceptos.filter(c => c.ya_facturado);
            if (yaFact.length) {
                aviso = `${ref} — ya facturado en ${[...new Set(yaFact.map(c => c.ya_facturado.factura))].join(', ')}.`;
            }
            if (!conceptos.length) {
                aviso = `${ref} — no tiene ningún registro que respalde esta línea.`;
            }
        }

        return {
            idx,
            tipo: it.tipo,
            descripcion: it.descripcion,
            unidades: it.unidades,
            importe: it.importe,
            confianza,
            score,
            match: match ? {
                expediente_id: match.expediente_id,
                origen: match.origen,
                numero_expediente: match.numero_expediente,
                ubicacion: match.ubicacion,
                cliente_nombre: match.cliente_nombre,
            } : null,
            conceptos,
            aviso,
            // Si el aviso nació de una línea emparejada, el expediente es el suyo.
            aviso_ref: avisoRef || (aviso && match
                ? { expediente_id: match.expediente_id, origen: match.origen, numero_expediente: match.numero_expediente }
                : null),
        };
    });

    const cuenta = (c) => lineas.filter(l => l.confianza === c).length;
    return {
        factura: { numero: numero || null, fecha: diaDe(fecha) },
        emisor,
        lineas,
        resumen: {
            total_lineas: lineas.length,
            alta: cuenta('ALTA'),
            revisar: cuenta('REVISAR'),
            sin_match: cuenta('SIN_MATCH'),
            con_aviso: lineas.filter(l => l.aviso).length,
            importe_factura: Math.round(lineas.reduce((s, l) => s + (l.importe || 0), 0) * 100) / 100,
        },
    };
}

/**
 * Sella los conceptos indicados como facturados.
 *
 * `conceptos` = [{ expediente_id, concepto, importe? }]. El importe es el
 * REALMENTE facturado: si difiere del esperado se guarda tal cual, para que el
 * histórico refleje lo que se pagó y no lo que se calculó.
 */
async function sellar(certificadorId, { factura, fecha, conceptos, usuario }) {
    const numero = String(factura || '').trim();
    if (!numero) throw new Error('Falta el número de factura.');
    const fechaFactura = diaDe(fecha);
    if (!fechaFactura) throw new Error('La fecha de la factura no es válida.');
    if (!Array.isArray(conceptos) || !conceptos.length) throw new Error('No hay conceptos que sellar.');

    const tarifas = await getTarifas(certificadorId);
    const { expedientes } = await cargarConceptos(certificadorId, tarifas);
    const porId = new Map(expedientes.map(e => [e.expediente_id, e]));

    // Agrupar por expediente: una sola escritura por expediente, aunque se
    // sellen sus tres conceptos.
    const porExpediente = new Map();

    for (const c of conceptos) {
        const exp = porId.get(c.expediente_id);
        if (!exp) throw new Error(`El expediente ${c.expediente_id} no es de este certificador.`);
        if (!CONCEPTOS.includes(c.concepto)) throw new Error(`Concepto desconocido: ${c.concepto}`);

        const devengado = exp.conceptos.find(x => x.concepto === c.concepto);
        if (!devengado) throw new Error(`${exp.numero_expediente}: el concepto "${c.concepto}" no está devengado.`);
        // No se puede facturar dos veces el mismo hito.
        if (devengado.sello) {
            throw new Error(`${exp.numero_expediente}: "${c.concepto}" ya está facturado (${devengado.sello.factura}).`);
        }

        const importe = c.importe === undefined || c.importe === null || c.importe === ''
            ? devengado.importe
            : eur(c.importe);
        if (!Number.isFinite(importe)) throw new Error(`${exp.numero_expediente}: importe inválido.`);

        if (!porExpediente.has(c.expediente_id)) porExpediente.set(c.expediente_id, {});
        porExpediente.get(c.expediente_id)[c.concepto] = {
            factura: numero,
            fecha: fechaFactura,
            importe,
            esperado: devengado.importe,
            sellado_at: new Date().toISOString(),
            sellado_por: usuario || null,
        };
    }

    for (const [expedienteId, valor] of porExpediente) {
        // Un CEE directo vive en otra tabla y tiene su propia RPC de MERGE. El
        // sello es el mismo objeto `fact_cert`: lo que cambia es dónde se guarda.
        const t = TABLAS[porId.get(expedienteId)?.origen] || TABLAS.CAE;
        const { error } = await supabase.rpc(t.rpc, {
            [t.idRpc]: expedienteId,
            p_field: 'fact_cert',
            p_value: valor,
        });
        if (error) throw new Error(`No se pudo sellar el expediente ${expedienteId}: ${error.message}`);
    }

    return { sellados: conceptos.length, expedientes: porExpediente.size };
}

/** Quita el sello de un concepto (una factura mal conciliada). */
async function desellar(certificadorId, { expediente_id, concepto }) {
    if (!CONCEPTOS.includes(concepto)) throw new Error(`Concepto desconocido: ${concepto}`);

    // El id puede ser de un expediente del CAE o de un CEE directo: se busca en
    // las dos, porque quien pulsa "quitar el sello" solo ve un número.
    let exp = null, tabla = null;
    for (const t of [TABLAS.CAE, TABLAS.CEE]) {
        const { data } = await supabase
            .from(t.tabla)
            .select('id, documentacion, cee')
            .eq('id', expediente_id)
            .maybeSingle();
        if (data) { exp = data; tabla = t; break; }
    }
    if (!exp) throw new Error('Expediente no encontrado.');
    if (String(exp.cee?.certificador_id || '') !== String(certificadorId)) {
        throw new Error('El expediente no es de este certificador.');
    }

    const fact = { ...(exp.documentacion?.fact_cert || {}) };
    delete fact[concepto];

    // Aquí sí se reemplaza el objeto entero (es un borrado), pero solo la clave
    // `fact_cert`: el resto de `documentacion` no se toca.
    const { error: errUpd } = await supabase
        .from(tabla.tabla)
        .update({ documentacion: { ...(exp.documentacion || {}), fact_cert: fact } })
        .eq('id', expediente_id);
    if (errUpd) throw new Error(errUpd.message);

    return { ok: true };
}

module.exports = {
    TARIFAS_DEFECTO,
    getTarifas,
    saveTarifas,
    buildFacturacion,
    conciliarFactura,
    sellar,
    desellar,
};
