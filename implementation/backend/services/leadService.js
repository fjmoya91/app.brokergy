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
        .insert(newCliente)
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
async function createLead({ contacto, catastro, funnel, calculatorInputs, precomputedResult, demandaCalefaccionPorM2, geoContext, partnerSlug, prescriptorId, mode = 'public', creatorUser = null }) {
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

    // 2. Cliente: upsert por email/DNI
    const { id_cliente, created: clienteCreated } = await upsertClienteFromLanding({
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

    // 6. Idempotencia: si ya existe una oportunidad LEAD para la misma RC y
    // mismo cliente, ACTUALIZAR esa fila en vez de crear duplicado. Esto evita
    // que un cliente que prueba el funnel varias veces acumule oportunidades.
    const { data: existing } = await supabase
        .from('oportunidades')
        .select('id, id_oportunidad, datos_calculo')
        .eq('ref_catastral', catastro.ref_catastral)
        .eq('cliente_id', id_cliente)
        .order('created_at', { ascending: false })
        .limit(1);

    // En modo público reusamos LEADs previos (upsert por RC+cliente). En modo
    // internal NUNCA hacemos upsert — cada simulación interna crea su propia
    // oportunidad porque el partner/admin puede querer rehacer cálculos.
    const existingLead = (!isInternal && existing && existing.length > 0)
        ? existing.find(o => o.datos_calculo?.estado === 'LEAD')
        : null;

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
    // Si es ADMIN, prescriptor_id queda null hasta que el admin lo asigne.
    const finalPrescriptorId = isInternal
        ? (creatorUser?.prescriptor_id || prescriptorId || null)
        : (prescriptorId || null);

    // El campo `prescriptor` (string display) en internal usa el nombre del
    // partner si existe, BROKERGY si admin.
    const prescriptorDisplay = isInternal && rolCreator !== 'ADMIN'
        ? (creatorUser?.acronimo || creatorUser?.razon_social || 'BROKERGY')
        : 'BROKERGY';

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
    upsertClienteFromLanding
};
