/**
 * Lead Service — Procesa la entrega de un LEAD desde la landing pública
 *                y lo materializa como cliente + oportunidad en estado LEAD.
 *
 * Importante:
 *   - NO crea carpetas de Google Drive. Eso queda diferido hasta que el
 *     cliente suba fotos o pida instalador (handler aparte).
 *   - NO ejecuta el motor de cálculo. El frontend del funnel calcula el
 *     teaser de ahorro localmente con calculation.js; el técnico afina al
 *     abrir la oportunidad en la calculadora interna.
 *   - Reutiliza la misma generación de id_oportunidad (YY + ficha + _OP + N)
 *     que routes/oportunidades.js para mantener la trazabilidad homogénea.
 *
 * Idempotencia:
 *   - Dedupe de cliente por email (case-insensitive) y fallback por DNI.
 *   - Si el cliente ya existe, se reutiliza su id_cliente — no duplicamos.
 *   - Cada submission del funnel crea SIEMPRE una oportunidad nueva, incluso
 *     si el cliente repite (caso real: misma persona, distinta vivienda).
 */

const supabase = require('./supabaseClient');
const { normalizeCliente } = require('../utils/normalization');

// ============================================================================
// LEAD SCORING — Heurística para priorizar leads en panel admin
// ============================================================================

/**
 * Calcula un score 0-100 que ayuda al admin a saber qué leads atender primero.
 * Función pura — no side effects. Inputs son los datos del funnel (raw).
 */
function calculateLeadScore(funnel = {}) {
    let score = 0;

    // Edad de caldera: las más viejas urgen más al cliente
    if (funnel.edad_caldera === '>20') score += 25;
    else if (funnel.edad_caldera === '10-20') score += 15;
    else if (funnel.edad_caldera === '<10') score += 5;

    // Gasto anual: a más gasto, más motivación de cambio
    const gasto = Number(funnel.gasto_anual_eur) || 0;
    if (gasto >= 2500) score += 25;
    else if (gasto >= 1500) score += 18;
    else if (gasto >= 1000) score += 12;
    else if (gasto >= 500) score += 6;

    // Modo presupuesto: pedir instalador es señal fuerte de intención
    if (funnel.presupuesto_modo === 'pide_instalador') score += 20;
    else if (funnel.presupuesto_modo === 'tengo') score += 15;

    // Timeline: cuanto más urgente, más caliente
    if (funnel.timeline === 'urgente') score += 20;
    else if (funnel.timeline === '1_mes') score += 15;
    else if (funnel.timeline === '1-3_meses') score += 10;
    else if (funnel.timeline === '6_meses') score += 5;

    // Reforma integral indica mayor valor de ticket
    if (funnel.isReforma === true) score += 10;

    return Math.min(100, Math.max(0, Math.round(score)));
}

function isLeadCaliente(score, funnel) {
    if (score >= 70) return true;
    if (funnel?.timeline === 'urgente') return true;
    if (funnel?.presupuesto_modo === 'pide_instalador' && score >= 50) return true;
    return false;
}

// ============================================================================
// CLIENTE — Upsert por email/DNI
// ============================================================================

/**
 * Los NUEVE últimos dígitos de un teléfono, que es lo único estable: la misma
 * persona llega unas veces como "+34672358309" y otras como "672358309", y un
 * `eq` sobre la cadena no las casa (medido: 306 clientes guardados sin prefijo
 * y 9 con él).
 *
 * ⚠️ Devuelve null si no salen 9 dígitos — un teléfono a medias no puede
 * emparejar a nadie.
 */
function tlf9(tlf) {
    const d = String(tlf || '').replace(/\D/g, '');
    return d.length >= 9 ? d.slice(-9) : null;
}

/**
 * ¿El contacto que acaba de rellenar el funnel es el MISMO que el titular de
 * un lead anterior?
 *
 * REGLA — el TELÉFONO solo desempata DENTRO de la misma vivienda, nunca a
 * secas. Medido sobre los 376 clientes: un móvil (695615330) figura en CINCO
 * fichas de personas distintas y otro (610171667) en cuatro — son teléfonos de
 * instalador o de comercial metidos como contacto del cliente. Deduplicar la
 * base de clientes por teléfono fusionaría expedientes de gente distinta, que
 * es mucho peor que el duplicado que esto viene a evitar. Pero el mismo número
 * sobre la MISMA referencia catastral ya no es una coincidencia: es la misma
 * gestión, que es justo el caso que se escapaba (un lead sin email ni DNI —85
 * de 376 clientes no tienen ninguno de los dos— volvía a entrar y nacía otra
 * vez de cero).
 */
function mismoTitular(contacto, cliente) {
    if (!cliente) return false;
    const email = contacto?.email ? String(contacto.email).trim().toLowerCase() : null;
    if (email && cliente.email && email === String(cliente.email).trim().toLowerCase()) return true;
    const dni = contacto?.dni ? String(contacto.dni).trim().toUpperCase() : null;
    if (dni && cliente.dni && dni === String(cliente.dni).trim().toUpperCase()) return true;
    const t = tlf9(contacto?.tlf);
    return !!(t && t === tlf9(cliente.tlf));
}

/**
 * El LEAD que ya existe sobre esta vivienda y es de este mismo titular, o null.
 *
 * REGLA — solo se reutiliza un LEAD. Una oportunidad que ya está ENVIADA o
 * ACEPTADA tiene propuesta enviada, carpeta de Drive movida y puede tener
 * expediente detrás: machacarla con lo que teclee alguien en el formulario
 * público sería mucho peor que tener dos filas. Ahí el visitante ve el aviso de
 * "ya hicimos una simulación para esta vivienda" (`GET /api/landing/check-rc`)
 * y decide — que es lo correcto: a un cliente no se le puede bloquear.
 *
 * Nunca lanza: un fallo de lectura aquí no puede tumbar la captación de un lead.
 */
async function buscarLeadPrevio(refCatastral, contacto) {
    const previas = await oportunidadesDeLaVivienda(refCatastral);
    return elegirLeadPrevio(previas, contacto);
}

/**
 * Todo lo que ya existe sobre esta referencia catastral, de lo más reciente a lo
 * más antiguo. Nunca lanza: un fallo de lectura aquí no puede tumbar la
 * captación de un lead — se sigue como alta nueva, que es lo que pasaba antes.
 */
async function oportunidadesDeLaVivienda(refCatastral) {
    if (!refCatastral || refCatastral === 'MANUAL') return [];
    try {
        const { data, error } = await supabase
            .from('oportunidades')
            .select('id, id_oportunidad, cliente_id, prescriptor_id, created_at, datos_calculo')
            .eq('ref_catastral', refCatastral)
            .order('created_at', { ascending: false })
            .limit(10);
        if (error) {
            console.error('[leadService] No se pudieron leer las oportunidades de la vivienda:', error.message);
            return [];
        }
        return data || [];
    } catch (err) {
        console.error('[leadService] oportunidadesDeLaVivienda falló (seguimos como alta nueva):', err.message);
        return [];
    }
}

/** De las oportunidades de esa vivienda, el LEAD que es de este mismo titular. */
async function elegirLeadPrevio(previas, contacto) {
    try {
        // Los LEAD, del más reciente al más antiguo. Antes esto era un `.limit(1)`
        // + `find(LEAD)`: si la más reciente ya estaba ENVIADA, el LEAD que había
        // detrás no se veía siquiera.
        const leads = (previas || []).filter(o => o.datos_calculo?.estado === 'LEAD' && o.cliente_id);
        if (!leads.length) return null;

        const { data: clientes } = await supabase
            .from('clientes')
            .select('id_cliente, email, dni, tlf')
            .in('id_cliente', [...new Set(leads.map(o => o.cliente_id))]);
        const porId = new Map((clientes || []).map(c => [c.id_cliente, c]));

        const match = leads.find(o => mismoTitular(contacto, porId.get(o.cliente_id)));
        if (match) {
            console.log(`[leadService] Lead previo para RC ${match.datos_calculo?.inputs?.rc || ''}: ${match.id_oportunidad} — se reutiliza en vez de duplicar`);
        }
        return match || null;
    } catch (err) {
        console.error('[leadService] elegirLeadPrevio falló (seguimos como alta nueva):', err.message);
        return null;
    }
}

/**
 * Rellena los campos VACÍOS de un cliente ya existente. Nunca pisa un valor
 * escrito: lo que consta puede haberlo corregido una persona a mano, y el
 * formulario público lo rellena quien tenga el móvil delante.
 *
 * ⚠️ `clientes.dni` es UNIQUE (regla 9): si el DNI que ahora se da ya es de otra
 * ficha, el UPDATE devuelve 23505. Se registra y se sigue — el lead es el
 * trabajo, y completar un hueco es una comodidad que no puede tumbarlo.
 */
async function completarHuecosCliente(idCliente, campos) {
    try {
        const { data: actual } = await supabase
            .from('clientes')
            .select('apellidos, email, dni, tlf, municipio, direccion, codigo_postal')
            .eq('id_cliente', idCliente)
            .maybeSingle();
        if (!actual) return;

        const patch = {};
        for (const [k, v] of Object.entries(campos || {})) {
            const nuevo = v == null ? null : String(v).trim();
            if (!nuevo) continue;
            const viejo = actual[k] == null ? '' : String(actual[k]).trim();
            if (!viejo) patch[k] = k === 'email' ? nuevo.toLowerCase() : (k === 'dni' ? nuevo.toUpperCase() : nuevo);
        }
        if (Object.keys(patch).length === 0) return;

        const { error } = await supabase.from('clientes').update(normalizeCliente(patch)).eq('id_cliente', idCliente);
        if (error) console.error('[leadService] No se pudieron completar huecos del cliente:', error.message);
    } catch (err) {
        console.error('[leadService] completarHuecosCliente falló:', err.message);
    }
}

/**
 * Busca un cliente por email (case-insensitive) o DNI. Si existe, devuelve
 * su id_cliente. Si no, lo crea y devuelve el id nuevo.
 *
 * @returns {Promise<{ id_cliente: string, created: boolean }>}
 */
async function upsertClienteFromLanding({ nombre, apellidos, email, tlf, dni, provincia, municipio, direccion, codigo_postal, prescriptor_id }) {
    const emailNormalized = email ? String(email).trim().toLowerCase() : null;
    const dniNormalized = dni ? String(dni).trim().toUpperCase() : null;

    // 1. Buscar por email (case-insensitive)
    if (emailNormalized) {
        const { data: byEmail, error: emailErr } = await supabase
            .from('clientes')
            .select('id_cliente')
            .ilike('email', emailNormalized)
            .maybeSingle();
        if (emailErr) console.error('[leadService] Error buscando cliente por email:', emailErr.message);
        if (byEmail?.id_cliente) {
            return { id_cliente: byEmail.id_cliente, created: false };
        }
    }

    // 2. Fallback: buscar por DNI (constraint UNIQUE en clientes.dni — regla 9 CLAUDE.md)
    if (dniNormalized) {
        const { data: byDni, error: dniErr } = await supabase
            .from('clientes')
            .select('id_cliente')
            .eq('dni', dniNormalized)
            .maybeSingle();
        if (dniErr) console.error('[leadService] Error buscando cliente por DNI:', dniErr.message);
        if (byDni?.id_cliente) {
            return { id_cliente: byDni.id_cliente, created: false };
        }
    }

    // 3. Crear nuevo cliente
    const newCliente = {
        nombre_razon_social: nombre || 'LEAD sin nombre',
        apellidos: apellidos || null,
        email: emailNormalized,
        tlf: tlf || null,
        dni: dniNormalized,
        provincia: provincia || null,
        municipio: municipio || null,
        direccion: direccion || null,
        codigo_postal: codigo_postal || null,
        prescriptor_id: prescriptor_id || null
    };

    const { data: inserted, error: insErr } = await supabase
        .from('clientes')
        .insert(normalizeCliente(newCliente))
        .select('id_cliente')
        .single();

    if (insErr) {
        // Carrera: si otro proceso insertó el mismo email/dni entre la consulta
        // y el insert, reintentamos la búsqueda.
        if (insErr.code === '23505') {
            if (emailNormalized) {
                const { data: retry } = await supabase
                    .from('clientes')
                    .select('id_cliente')
                    .ilike('email', emailNormalized)
                    .maybeSingle();
                if (retry?.id_cliente) return { id_cliente: retry.id_cliente, created: false };
            }
        }
        throw new Error(`No se pudo crear el cliente: ${insErr.message}`);
    }

    return { id_cliente: inserted.id_cliente, created: true };
}

// ============================================================================
// OPORTUNIDAD — Generación de ID y creación en estado LEAD
// ============================================================================

/**
 * Determina el tipo de ficha según los inputs del funnel.
 * Mismo criterio que routes/oportunidades.js para mantener consistencia.
 */
function determineFichaType(funnel) {
    if (funnel?.isReforma === true) return 'RES080';
    // Por ahora, hibridación no se ofrece en la landing pública.
    return 'RES060';
}

/**
 * Genera un id_oportunidad secuencial siguiendo el formato YY + FICHA + _OP + N.
 * Replicado puntualmente de routes/oportunidades.js para no acoplar leadService
 * al cuerpo del handler existente. Si en el futuro se extrae a un helper común,
 * ambos pueden migrarse.
 */
async function generateOpportunityId(fichaType) {
    const { data: allIds, error } = await supabase
        .from('oportunidades')
        .select('id_oportunidad')
        .like('id_oportunidad', `%${fichaType}_OP%`);

    let nextNum = 1;
    if (!error && allIds && allIds.length > 0) {
        const nums = allIds
            .map(r => {
                const m = r.id_oportunidad?.match(/(\d+)$/);
                return m ? parseInt(m[1], 10) : 0;
            })
            .filter(n => !isNaN(n));
        if (nums.length > 0) nextNum = Math.max(...nums) + 1;
    }

    const yy = new Date().getFullYear().toString().slice(-2);
    return `${yy}${fichaType}_OP${nextNum}`;
}

// ============================================================================
// API pública del servicio
// ============================================================================

/**
 * Crea un LEAD completo a partir del payload del funnel.
 *
 * @param {object} params
 * @param {object} params.contacto           Datos del cliente (paso 9 del funnel).
 * @param {object} params.catastro           Datos resueltos del catastro.
 * @param {object} params.funnel             Respuestas raw del funnel (mapeo más adelante).
 * @param {object} params.calculatorInputs   Inputs ya mapeados al formato de la calculadora interna.
 * @param {object} params.geoContext         { provinceCode, provincia, ccaa } del middleware.
 * @param {string|null} params.partnerSlug   Slug del partner si vino de /p/[slug].
 * @param {string|null} params.prescriptorId UUID del prescriptor (resuelto en la ruta).
 * @returns {Promise<{ id_oportunidad: string, oportunidad_uuid: string, cliente_id: string, lead_score: number }>}
 */
async function createLead({ contacto, catastro, funnel, calculatorInputs, precomputedResult, demandaCalefaccionPorM2, geoContext, partnerSlug, prescriptorId, mode = 'public', creatorUser = null, docsOcr = null }) {
    // 1. Validaciones mínimas — fail-fast antes de tocar BD
    const isInternal = mode === 'internal';

    // En modo internal, el partner/admin puede crear oportunidades con SOLO una
    // referencia (datos del cliente final llegan luego). Para 'nombre' aceptamos
    // contacto.nombre o contacto.referenciaCliente como fallback.
    if (isInternal) {
        const refOrName = (contacto?.nombre || contacto?.referenciaCliente || '').toString().trim();
        if (!refOrName) throw new Error('Falta la referencia del cliente');
        // Si no hay nombre explícito, usamos la referencia como nombre interno
        if (!contacto.nombre?.trim() && refOrName) {
            contacto.nombre = refOrName;
        }
        // En internal NO exigimos email ni teléfono (el partner los pedirá luego al cliente)
    } else {
        if (!contacto?.nombre) throw new Error('Falta el nombre del cliente');
        if (!contacto?.email && !contacto?.tlf) throw new Error('Necesitamos al menos email o teléfono para contactar');
        if (!contacto?.rgpd_aceptado) {
            throw new Error('Es obligatorio aceptar la política de privacidad');
        }
    }
    if (!catastro?.ref_catastral) throw new Error('Falta la referencia catastral');
    if (!geoContext?.provinceCode) throw new Error('Falta el contexto geográfico');
    const rolCreator = (creatorUser?.rol_nombre || creatorUser?.rol || '').toUpperCase();
    const origenLead = isInternal
        ? (rolCreator === 'ADMIN' ? 'admin' : 'partner')
        : 'landing_publica';
    const estadoLead = isInternal ? 'PTE ENVIAR' : 'LEAD';

    // 2. ¿Ya hay un LEAD sobre ESTA MISMA VIVIENDA del mismo titular?
    //
    // Va ANTES de tocar clientes a propósito. El duplicado no nacía aquí abajo:
    // nacía en el upsert del cliente. `upsertClienteFromLanding` solo reconoce a
    // alguien por email o DNI, y 85 de los 376 clientes no tienen ninguno de los
    // dos (solo teléfono) — así que el mismo vecino volviendo al funnel meses
    // después estrenaba ficha de cliente, y con ella la comprobación de abajo
    // ya no podía casar nada. Medido en 26RES060_OP113 / OP179: misma RC
    // (0032105VJ7103S0001RA), mismo móvil, dos oportunidades y dos clientes.
    const previasDeLaVivienda = await oportunidadesDeLaVivienda(catastro.ref_catastral);
    const leadPrevio = isInternal ? null : await elegirLeadPrevio(previasDeLaVivienda, contacto);

    // 3. Cliente: el del lead previo si lo hay; si no, upsert por email/DNI
    let id_cliente;
    let clienteCreated = false;
    if (leadPrevio) {
        id_cliente = leadPrevio.cliente_id;
        // Rellenamos SUS huecos con lo que ahora sí ha contestado (el apellido
        // completo, un email que antes no dio) — nunca pisamos lo que ya consta.
        await completarHuecosCliente(id_cliente, {
            apellidos: contacto.apellidos,
            email: contacto.email,
            dni: contacto.dni,
            tlf: contacto.tlf,
            municipio: catastro.municipio,
            direccion: catastro.address,
            codigo_postal: catastro.codigo_postal
        });
    } else {
        const up = await upsertClienteFromLanding({
            nombre: contacto.nombre,
            apellidos: contacto.apellidos,
            email: contacto.email,
            tlf: contacto.tlf,
            dni: contacto.dni,
            provincia: geoContext.provincia,
            municipio: catastro.municipio || null,
            direccion: catastro.address || null,
            codigo_postal: catastro.codigo_postal || null,
            prescriptor_id: prescriptorId || null
        });
        id_cliente = up.id_cliente;
        clienteCreated = up.created;
    }

    // 3. Score y banderas
    const score = calculateLeadScore(funnel);
    const caliente = isLeadCaliente(score, funnel);
    const warningBiomasa = funnel?.combustible_actual === 'solido' &&
                          (funnel?.sub_solido === 'pellets' || funnel?.sub_solido === 'biomasa');

    // 4. ID de oportunidad
    const fichaType = determineFichaType(funnel);
    const idOportunidad = await generateOpportunityId(fichaType);

    // 5. Construcción del datos_calculo (JSONB)
    //   Si el partner indicó referenciaCliente explícita en el formulario internal,
    //   la respetamos tal cual. Si no, la generamos a partir de nombre+apellidos.
    const referenciaCliente = (contacto.referenciaCliente && contacto.referenciaCliente.trim())
        ? contacto.referenciaCliente.trim().toUpperCase()
        : [contacto.nombre, contacto.apellidos].filter(Boolean).join(' ').trim().toUpperCase();
    const now = new Date().toISOString();

    // referenciaCliente también dentro de inputs para que la calculadora lo
    // muestre pre-relleno al admin (el SaveOpportunityModal lo lee de aquí).
    const inputsConRef = {
        ...(calculatorInputs || {}),
        referenciaCliente: referenciaCliente || ''
    };

    const datosCalculo = {
        estado: estadoLead,
        origen: origenLead,
        partner_slug: partnerSlug || null,
        provincia: geoContext.provincia,
        ccaa: geoContext.ccaa,
        provinceCode: geoContext.provinceCode,

        // Consentimientos de comunicación. En internal asumimos que el partner
        // gestiona los consents fuera del sistema, por defecto false.
        consent_email: isInternal ? false : (contacto?.consent_email !== false),
        consent_whatsapp: isInternal ? false : (contacto?.consent_whatsapp !== false),

        // Lead intelligence
        lead_score: score,
        lead_caliente: caliente,
        solicita_instalador: funnel?.presupuesto_modo === 'pide_instalador',
        timeline: funnel?.timeline || null,
        motivacion: funnel?.motivacion || null,
        warning_biomasa_aplicado: warningBiomasa,

        // Inputs ya mapeados a la calculadora interna (lo que el técnico verá)
        inputs: inputsConRef,

        // Resultado precomputado por el frontend (mismo formato que
        // CalculatorView.handleCalculate). El panel admin lo lee directamente
        // para mostrar bono CAE, ahorro, etc., sin tener que recalcular.
        result: precomputedResult || null,

        // Respuestas raw del funnel para auditoría / reprocesado futuro
        landing_funnel: funnel || {},

        // Presupuesto / facturas ya LEÍDOS (OCR) en la toma de datos: importes, nº de
        // documento, fechas, partidas y los equipos citados (marca/modelo/nº de serie).
        // Aunque esto todavía sea una oportunidad, al aceptarla el expediente nace ya
        // con `documentacion.facturas` puestas en vez de tener que releer los mismos
        // PDF semanas después (ver expedienteService.createExpedienteFromOportunidad).
        // SOLO metadatos y enlaces — nunca el fichero (regla 21: nada de base64 en JSONB).
        docs_ocr: docsOcr || null,

        // Historial inicial
        historial: [{
            id: `${Date.now()}_${isInternal ? rolCreator.toLowerCase() : 'landing'}`,
            estado: estadoLead,
            fecha: now,
            usuario: isInternal
                ? (creatorUser?.acronimo || creatorUser?.razon_social || rolCreator || 'Usuario')
                : 'Landing pública',
            detalle: isInternal
                ? `Creada vía Nueva Simulación (${rolCreator})`
                : (partnerSlug ? `Vía partner: ${partnerSlug}` : 'Vía landing BROKERGY')
        }]
    };

    // REGLA — un alta sobre una vivienda que YA tiene oportunidad se ANOTA.
    // Aquí no se reutiliza nada: o es otro titular (dos vecinos legítimos: el que
    // compra y el que vende, el propietario y su instalador) o la anterior ya está
    // en gestión y machacarla sería mucho peor que tener dos filas. Pero sin
    // dejarlo escrito, quien abra esta oportunidad dentro de tres meses no tiene
    // forma de saber que existe la otra — que es exactamente lo que pasó con
    // 26RES060_OP113 / OP179. El visitante ve el aviso y puede seguir; el staff
    // se entera por aquí.
    if (!leadPrevio && previasDeLaVivienda.length > 0) {
        const otras = previasDeLaVivienda
            .map(o => `${o.id_oportunidad} (${o.datos_calculo?.estado || '?'}, ${new Date(o.created_at).toLocaleDateString('es-ES')})`)
            .join(' · ');
        datosCalculo.historial.push({
            id: `${Date.now()}_rc_duplicada`,
            tipo: 'comentario',
            fecha: now,
            usuario: 'Sistema',
            texto: `⚠️ Esta vivienda ya tenía ${previasDeLaVivienda.length === 1 ? 'otra oportunidad' : 'otras oportunidades'}: ${otras}. Misma referencia catastral (${catastro.ref_catastral}), titular distinto o simulación ya en gestión — compruébalo antes de trabajarla.`
        });
        console.warn(`[leadService] Alta sobre RC ya usada ${catastro.ref_catastral}: ya existían ${otras}`);
    }

    // 6. Idempotencia: si ya había un LEAD de este titular para esta vivienda,
    // ACTUALIZAMOS esa fila en vez de crear un duplicado. Ya está resuelto en el
    // paso 2 (`buscarLeadPrevio`), que además es quien evita que se estrene
    // ficha de cliente.
    //
    // En modo internal NUNCA hay upsert — cada simulación interna crea su propia
    // oportunidad porque el partner/admin puede querer rehacer cálculos. La red
    // ahí es el aviso de RC duplicada que el funnel enseña al resolver la
    // vivienda, con su botón de "Abrir oportunidad".
    const existingLead = leadPrevio;

    if (existingLead) {
        // UPDATE — preservamos id_oportunidad e historial original
        const prevHistorial = Array.isArray(existingLead.datos_calculo?.historial)
            ? existingLead.datos_calculo.historial
            : [];
        datosCalculo.historial = [
            ...prevHistorial,
            {
                id: `${Date.now()}_landing_resubmit`,
                estado: 'LEAD',
                fecha: now,
                usuario: 'Landing pública',
                detalle: 'Re-envío del funnel (datos actualizados)'
            }
        ];

        const { data: updated, error: updErr } = await supabase
            .from('oportunidades')
            .update({
                ficha: fichaType,
                referencia_cliente: referenciaCliente || null,
                prescriptor_id: prescriptorId || existingLead.prescriptor_id || null,
                demanda_calefaccion: demandaCalefaccionPorM2 || null,
                datos_calculo: datosCalculo
            })
            .eq('id', existingLead.id)
            .select('id, id_oportunidad')
            .single();

        if (updErr) {
            throw new Error(`No se pudo actualizar la oportunidad LEAD: ${updErr.message}`);
        }

        return {
            id_oportunidad: updated.id_oportunidad,
            oportunidad_uuid: updated.id,
            cliente_id: id_cliente,
            cliente_created: clienteCreated,
            lead_score: score,
            lead_caliente: caliente,
            ficha: fichaType,
            updated: true
        };
    }

    // 7. INSERT de la oportunidad (caso nuevo)
    // En modo internal, el creador puede ser un PARTNER que tiene su propio
    // prescriptor_id (su empresa) → la oportunidad queda asignada a él.
    // Un ADMIN no tiene prescriptor propio: usa el que haya elegido en el paso de
    // identificación (o null = BROKERGY, para asignarlo más tarde).
    const finalPrescriptorId = isInternal
        ? (creatorUser?.prescriptor_id || prescriptorId || null)
        : (prescriptorId || null);

    // El campo `prescriptor` (string display) en internal usa el nombre del partner.
    // Si lo eligió un admin, hay que resolverlo: él no lo lleva en su sesión.
    let prescriptorDisplay = isInternal && rolCreator !== 'ADMIN'
        ? (creatorUser?.acronimo || creatorUser?.razon_social || 'BROKERGY')
        : 'BROKERGY';

    if (isInternal && rolCreator === 'ADMIN' && finalPrescriptorId) {
        const { data: pres } = await supabase
            .from('prescriptores')
            .select('acronimo, razon_social')
            .eq('id_empresa', finalPrescriptorId)
            .maybeSingle();
        if (pres) prescriptorDisplay = pres.acronimo || pres.razon_social || 'BROKERGY';
    }

    const newOpp = {
        id_oportunidad: idOportunidad,
        ficha: fichaType,
        ref_catastral: catastro.ref_catastral,
        prescriptor: prescriptorDisplay,
        referencia_cliente: referenciaCliente || null,
        cliente_id: id_cliente,
        prescriptor_id: finalPrescriptorId,
        creador_id: creatorUser?.id_usuario || null,
        demanda_calefaccion: demandaCalefaccionPorM2 || null,
        datos_calculo: datosCalculo
    };

    const { data: insertedOpp, error: oppErr } = await supabase
        .from('oportunidades')
        .insert(newOpp)
        .select('id, id_oportunidad')
        .single();

    if (oppErr) {
        throw new Error(`No se pudo crear la oportunidad LEAD: ${oppErr.message}`);
    }

    return {
        id_oportunidad: insertedOpp.id_oportunidad,
        oportunidad_uuid: insertedOpp.id,
        cliente_id: id_cliente,
        cliente_created: clienteCreated,
        lead_score: score,
        lead_caliente: caliente,
        ficha: fichaType,
        updated: false
    };
}

module.exports = {
    createLead,
    calculateLeadScore,
    isLeadCaliente,
    determineFichaType,
    generateOpportunityId,
    upsertClienteFromLanding,
    // Puros — se exportan para poder comprobarlos sin BD (test_lead_duplicado.js).
    tlf9,
    mismoTitular,
    // Solo LECTURA — para comprobar el emparejamiento contra datos reales sin
    // dar de alta nada (scripts/probar_lead_previo.js).
    buscarLeadPrevio
};
