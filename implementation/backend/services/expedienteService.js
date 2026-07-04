const supabase = require('./supabaseClient');
const { getCoordinatesByRC } = require('./catastroService');
const driveService = require('./driveService');
const { ALLOWED_PROVINCES } = require('../data/allowedProvinces');

// Mapa inverso "nombre de provincia normalizado" -> código (para migración desde XML).
// El CEE trae la provincia como texto ("CIUDAD REAL"); la app espera el CÓDIGO de
// provincia en datos_calculo.inputs.provincia (lo usan getCCAA y los cálculos).
const _normProv = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const PROVINCE_NAME_TO_CODE = (() => {
    const map = {};
    for (const [code, info] of Object.entries(ALLOWED_PROVINCES)) {
        if (info && info.provincia) map[_normProv(info.provincia)] = code;
    }
    return map;
})();

// Resuelve el código de provincia (2 dígitos) desde la identificación del XML:
// 1) por nombre de provincia; 2) por CP embebido en la dirección.
function resolveProvinceCode(ident) {
    if (!ident) return null;
    const byName = PROVINCE_NAME_TO_CODE[_normProv(ident.provincia)];
    if (byName) return byName;
    const cpMatch = String(ident.direccion || '').match(/\b(\d{5})\b/);
    if (cpMatch) {
        const cpCode = cpMatch[1].substring(0, 2);
        if (ALLOWED_PROVINCES[cpCode]) return cpCode;
    }
    return null;
}

/**
 * Crea un expediente automáticamente a partir de una oportunidad aceptada.
 * Esta lógica centraliza lo que antes se hacía manualmente en el panel de administracion.
 * 
 * @param {string} uuid_oportunidad - El ID (UUID) de la oportunidad en la tabla 'oportunidades'
 * @param {string} id_cliente - El ID del cliente vinculado
 */
async function createExpediente(uuid_oportunidad, id_cliente, manualNumber = null, overrides = {}) {
    try {
        console.log(`[ExpedienteService] Iniciando creación ${manualNumber ? 'MANUAL' : 'AUTOMÁTICA'} para OP UUID: ${uuid_oportunidad}`);

        // 1. Obtener la oportunidad y el cliente para los datos iniciales
        const [opResult, cliResult] = await Promise.all([
            supabase.from('oportunidades').select('*').eq('id', uuid_oportunidad).single(),
            supabase.from('clientes').select('*').eq('id_cliente', id_cliente).single()
        ]);

        const op = opResult.data;
        const cliente = cliResult.data;

        if (!op) throw new Error('Oportunidad no encontrada');
        if (!cliente) throw new Error('Cliente no encontrado');

        // 2. Verificar si ya existe un expediente
        const { data: existing } = await supabase
            .from('expedientes')
            .select('numero_expediente')
            .eq('oportunidad_id', uuid_oportunidad)
            .maybeSingle();

        if (existing) {
            console.log(`[ExpedienteService] El expediente ya existe: ${existing.numero_expediente}`);
            return existing;
        }

        // 3. Preparar datos base (UTM, Instalación, CEE)
        const opInputs = op.datos_calculo?.inputs || {};
        let utmX = '', utmY = '';
        if (op.ref_catastral) {
            try {
                const coords = await getCoordinatesByRC(op.ref_catastral);
                if (coords) { utmX = String(coords.x || ''); utmY = String(coords.y || ''); }
            } catch (e) { console.warn('[ExpedienteService] UTM lookup failed:', e.message); }
        }

        // ── Resolver aerotermia desde la oportunidad ────────────────────────
        // La calculadora guarda el ID de la BD (aerothermiaModel) o el literal
        // 'custom' con customBrandName/customModelName. La marca y el modelo
        // NO se guardan duplicados en inputs, así que el expediente los lee
        // desde la tabla `aerotermia` por ID.
        const resolveAerotermia = async (modelId, customBrand, customModel, scopFallback) => {
            const empty = { aerotermia_db_id: null, marca: '', modelo: '', numero_serie: '', scop: null, metodo_scop: 'ficha' };
            if (modelId === null || modelId === undefined || modelId === '') return empty;

            // Caso custom: marca y modelo introducidos a mano en la calculadora
            if (String(modelId).toLowerCase() === 'custom') {
                return {
                    aerotermia_db_id: null,
                    marca: customBrand || '',
                    modelo: customModel || '',
                    numero_serie: '',
                    scop: scopFallback != null && scopFallback !== '' ? Number(scopFallback) : null,
                    metodo_scop: 'ficha'
                };
            }

            // Caso BD: lookup por id numérico en `aerotermia`
            const numericId = Number(modelId);
            if (!Number.isFinite(numericId)) return empty;
            try {
                const { data: aero } = await supabase
                    .from('aerotermia')
                    .select('id, marca, modelo_comercial, modelo_conjunto, modelo_ud_exterior, eprel, url_keymark, ficha_tecnica')
                    .eq('id', numericId)
                    .maybeSingle();
                if (!aero) {
                    console.warn(`[ExpedienteService] aerotermia id=${numericId} no encontrada en BD`);
                    return { ...empty, scop: scopFallback != null && scopFallback !== '' ? Number(scopFallback) : null };
                }
                return {
                    aerotermia_db_id: aero.id,
                    marca: aero.marca || '',
                    modelo: aero.modelo_comercial || aero.modelo_conjunto || aero.modelo_ud_exterior || '',
                    numero_serie: '',
                    scop: scopFallback != null && scopFallback !== '' ? Number(scopFallback) : null,
                    metodo_scop: 'ficha',
                    // Enlaces del catálogo → snapshot del expediente. El certificado CIFO
                    // (RES060/RES080) los lee de aquí, no del catálogo, así que deben
                    // viajar con el expediente desde su creación.
                    url_eprel: aero.eprel || null,
                    url_keymark: aero.url_keymark || null,
                    url_ficha: aero.ficha_tecnica || null
                };
            } catch (e) {
                console.warn(`[ExpedienteService] Lookup aerotermia id=${numericId} falló: ${e.message}`);
                return { ...empty, scop: scopFallback != null && scopFallback !== '' ? Number(scopFallback) : null };
            }
        };

        const cambioAcs = opInputs.changeAcs === true;

        const aerotermiaCal = await resolveAerotermia(
            opInputs.aerothermiaModel,
            opInputs.customBrandName,
            opInputs.customModelName,
            opInputs.scopHeating
        );

        // Si el usuario marcó "Incluir ACS" en la calculadora, el bloque ACS es
        // independiente (puede tener su propio modelo, marca y SCOP). Si no, se
        // copia el bloque de calefacción tal cual.
        const aerotermiaAcs = cambioAcs
            ? await resolveAerotermia(
                opInputs.aerothermiaModelAcs,
                opInputs.customBrandAcsName,
                opInputs.customModelAcsName,
                opInputs.scopAcs
            )
            : { ...aerotermiaCal };

        const instalacion = {
            misma_direccion: true,
            ref_catastral: op.ref_catastral || '',
            coord_x: utmX,
            coord_y: utmY,
            tipo_emisor: opInputs.emitterType || 'suelo_radiante',
            caldera_antigua_cal: { marca: '', modelo: '', numero_serie: '', rendimiento_id: opInputs.boilerId || 'default' },
            misma_caldera_acs: true,
            caldera_antigua_acs: { marca: '', modelo: '', numero_serie: '', rendimiento_id: opInputs.boilerId || 'default' },
            aerotermia_cal: aerotermiaCal,
            cambio_acs: cambioAcs,
            misma_aerotermia_acs: !cambioAcs,
            aerotermia_acs: aerotermiaAcs,
            hibridacion: opInputs.hibridacion === true,
            potencia_bomba: opInputs.potenciaBomba != null && opInputs.potenciaBomba !== '' ? Number(opInputs.potenciaBomba) : 0,
            instalador_id: op.prescriptor_id || null
        };

        console.log(`[ExpedienteService] Instalación pre-rellenada desde oportunidad → ` +
            `cal=${aerotermiaCal.marca}/${aerotermiaCal.modelo}/SCOP=${aerotermiaCal.scop} ` +
            `cambio_acs=${cambioAcs} ` +
            (cambioAcs ? `acs=${aerotermiaAcs.marca}/${aerotermiaAcs.modelo}/SCOP=${aerotermiaAcs.scop} ` : '') +
            `hibridacion=${instalacion.hibridacion} potencia=${instalacion.potencia_bomba}`);

        const opCalculationResult = op.datos_calculo?.result || {};

        // Detección de HIBRIDACIÓN (RES093)
        const isReformaInternal = 
            opInputs.isReforma || 
            ['onlyReforma', 'both'].includes(opInputs.reformaType) || 
            op.ficha === 'RES080' ||
            !!opCalculationResult.res080;

        const isHybridInternal = 
            !isReformaInternal && (
                opInputs.hibridacion === true || 
                op.ficha === 'RES093' ||
                !!opCalculationResult.res093
            );

        const programa = isReformaInternal ? 'RES080' : (isHybridInternal ? 'RES093' : 'RES060');

        // Decisión del cliente en la firma sobre el CEE inicial (si aportó uno):
        // 'usar_cee_aportado' → NO se pide un CEE nuevo al certificador; queda para revisión interna.
        // 'calcular_cee_nuevo' (o sin decisión) → flujo normal (se solicita CEE al certificador).
        const ceeDecision = op.datos_calculo?.cee_decision || null;
        const clienteAportaCee = ceeDecision === 'usar_cee_aportado' && !!opInputs.cee_previo;

        const cee = {
            tipo: opInputs.demandMode === 'real' ? 'xml' : 'aportado',
            is_reforma: programa === 'RES080',
            cee_inicial: opInputs.xmlDemandData || null,
            cee_final: null,
            demanda_calefaccion_manual: opInputs.demandaCalefaccionManual || null,
            cee_decision: ceeDecision,
            cliente_aporta_cee: clienteAportaCee,
            cee_previo_data: clienteAportaCee ? (opInputs.cee_previo || null) : null
        };

        // 4. Generar Número de Expediente Oficial (YYPROGRAMA_XXXX) o usar el manual
        let numeroExpediente = manualNumber;
        let nextCorrelativo = null;

        if (!numeroExpediente) {
            const currentYear = new Date().getFullYear().toString().slice(-2);
            const prefix = `${currentYear}${programa}_`;

            console.log(`[ExpedienteService] Calculando siguiente correlativo para prefijo: ${prefix}`);

            // Traemos TODOS los expedientes del prefijo y calculamos el máximo de
            // forma robusta. NO confiamos en ORDER BY correlativo DESC porque en
            // Postgres los NULL van primero y un único registro con correlativo
            // NULL hacía que el contador se reiniciara a 1 (bug 26RESxxx_1).
            // El máximo se obtiene del MAYOR entre `correlativo` y el sufijo
            // numérico parseado de `numero_expediente`, ignorando nulos.
            const { data: rows } = await supabase
                .from('expedientes')
                .select('numero_expediente, correlativo')
                .like('numero_expediente', `${prefix}%`);

            let maxNum = 0;
            for (const r of (rows || [])) {
                const corr = Number.isInteger(r.correlativo) ? r.correlativo : 0;
                const suffix = parseInt(String(r.numero_expediente || '').slice(prefix.length), 10);
                const val = Math.max(corr, Number.isNaN(suffix) ? 0 : suffix);
                if (val > maxNum) maxNum = val;
            }
            console.log(`[ExpedienteService] Máximo correlativo detectado para ${programa}: ${maxNum} (sobre ${rows?.length || 0} registros)`);

            // Para RES080 el contador empieza en 36 si no hay registros previos
            const startOffset = programa === 'RES080' ? 36 : 1;
            nextCorrelativo = Math.max(maxNum + 1, startOffset);
            numeroExpediente = `${prefix}${nextCorrelativo}`;
            console.log(`[ExpedienteService] Asignado Número de Expediente: ${numeroExpediente}`);
        }

        const payload = {
            oportunidad_id: uuid_oportunidad,
            cliente_id: id_cliente,
            instalador_asociado_id: op.instalador_asociado_id || null,
            numero_expediente: numeroExpediente,
            correlativo: nextCorrelativo,
            id_oportunidad_ref: op.id_oportunidad,
            estado: 'PTE. CEE INICIAL',
            cee,
            instalacion,
            documentacion: {
                fecha_visita_cee_inicial: null,
                fecha_firma_cee_inicial: null,
                fecha_registro_cee_inicial: null,
                fecha_visita_cee_final: null,
                fecha_firma_cee_final: null,
                fecha_registro_cee_final: null,
                facturas: [],
                fecha_pruebas_cert_instalacion: null,
                fecha_firma_cert_instalacion: null,
                fecha_inicio_cifo: null,
                fecha_fin_cifo: null,
                cert_cifo_drive_link: null,
                cert_rite_drive_link: null,
                cert_rite_sent_at: null,
                cert_rite_signed_link: null,
                memoria_rite_guia_link: null,
                memoria_rite_pdf_link: null,
                borrador_cert_rite_link: null,
                borrador_cert_sent_at: null,
                photo_attachments: op.datos_calculo?.inputs?.photo_attachments || null
            },
            seguimiento: {
                // Si el cliente aporta su CEE inicial, NO se solicita uno nuevo al certificador:
                // queda pendiente de REVISIÓN interna por Brokergy en lugar de envío al certificador.
                cee_inicial: clienteAportaCee ? 'PTE_REVISION' : 'PTE_ENVIO_CERT',
                cee_final: 'PTE_ENVIO_CERT',
                anexos: 'PTE_EMITIR'
            }
        };

        // Overrides opcionales (usado por la migración de expedientes desde XML).
        // Merge superficial por columna JSONB para no perder los defaults de arriba.
        if (overrides.cee)           payload.cee           = { ...payload.cee,           ...overrides.cee };
        if (overrides.instalacion)   payload.instalacion   = { ...payload.instalacion,   ...overrides.instalacion };
        if (overrides.documentacion) payload.documentacion = { ...payload.documentacion, ...overrides.documentacion };
        if (overrides.seguimiento)   payload.seguimiento   = { ...payload.seguimiento,   ...overrides.seguimiento };
        if (overrides.estado)        payload.estado        = overrides.estado;

        const { data: newExp, error: insertErr } = await supabase
            .from('expedientes')
            .insert([payload])
            .select()
            .single();

        if (insertErr) throw insertErr;

        // 5. Automatización de Drive y Sincronización
        const dc = op.datos_calculo || {};
        const driveFolderId = dc.drive_folder_id || dc.inputs?.drive_folder_id;
        
        if (driveFolderId) {
            try {
                const clientFullName = `${cliente.nombre_razon_social} ${cliente.apellidos || ''}`.trim().toUpperCase().replace(/\s+/g, ' ');
                const newFolderName = `${numeroExpediente} - ${clientFullName}`;
                
                console.log(`[ExpedienteService] Procesando Drive para ${numeroExpediente}. FolderID: ${driveFolderId}`);

                // 1. Renombrar en Drive
                await driveService.renameFolder(driveFolderId, newFolderName);
                
                // 2. Mover a la carpeta de "ACEPTADAS" (usa env var, igual que el route de estado)
                const ACEPTADAS_FOLDER_ID = process.env.DRIVE_FOLDER_ACEPTADA || '1L2Wl9OIOpvmihySZkT09S1FG14Pu3VNy';
                await driveService.moveFolder(driveFolderId, ACEPTADAS_FOLDER_ID);
                
                // 3. Sincronizar oportunidad
                const currentHistorial = dc.historial || [];
                
                const newHistorialEntry = {
                    id: Date.now().toString() + '_expediente_auto',
                    tipo: 'cambio_estado',
                    estado: 'ACEPTADA',
                    fecha: new Date().toISOString(),
                    usuario: 'Sistema',
                    texto: `Oportunidad aceptada. Expediente creado: ${numeroExpediente}`
                };

                const updatedDatosCalculo = {
                    ...dc,
                    estado: 'ACEPTADA',
                    historial: [...currentHistorial, newHistorialEntry]
                };

                // Actualizamos la referencia visual y los datos de cálculo, pero MANTENEMOS la referencia original si ya existe
                const updatePayload = {
                    datos_calculo: updatedDatosCalculo,
                    cliente_id: id_cliente
                };

                // Solo sobreescribimos la referencia si está vacía o es nula
                if (!op.referencia_cliente || op.referencia_cliente.trim() === '') {
                    updatePayload.referencia_cliente = clientFullName;
                }

                await supabase
                    .from('oportunidades')
                    .update(updatePayload)
                    .eq('id', uuid_oportunidad);

                console.log(`[ExpedienteService] Sincronización (Preservando ID) completa para ${numeroExpediente}`);
            } catch (driveErr) {
                console.error('[ExpedienteService] Drive/Sync failed:', driveErr.message);
            }
        }

        return {
            ...newExp,
            referencia_cliente: cliente ? `${cliente.nombre_razon_social} ${cliente.apellidos || ''}`.trim().toUpperCase() : null
        };
    } catch (error) {
        console.error('[ExpedienteService] Error creating expediente:', error);
        throw error;
    }
}

/**
 * Migra un expediente de un programa a otro (ej: de RES060 a RES080)
 * Regenerando el número de expediente y renombrando carpetas en Drive.
 * @param {string} targetProgram - Opcional. Forzar a RES060, RES080 o RES093.
 */
async function migrateExpedienteProgram(expedienteId, usuarioName = 'Sistema', targetProgram = null) {
    try {
        // 1. Obtener expediente y oportunidad vinculada
        const { data: exp, error: expErr } = await supabase
            .from('expedientes')
            .select('*, oportunidades(*)')
            .eq('id', expedienteId)
            .single();

        if (expErr || !exp) throw new Error('Expediente no encontrado');
        const op = exp.oportunidades;
        if (!op) throw new Error('Oportunidad vinculada no encontrada');

        // 2. Determinar el programa de destino
        let newPrograma = targetProgram;
        
        if (!newPrograma) {
            // Detección automática si no se especifica
            const opInputs = op.datos_calculo?.inputs || {};
            const opCalculationResult = op.datos_calculo?.result || {};
            const isReforma = opInputs.isReforma || ['onlyReforma', 'both'].includes(opInputs.reformaType) || op.ficha === 'RES080' || !!opCalculationResult.res080 || exp.numero_expediente?.includes('RES080');
            const isHybrid = !isReforma && (opInputs.hibridacion === true || op.ficha === 'RES093' || !!opCalculationResult.res093 || exp.numero_expediente?.includes('RES093'));
            newPrograma = isReforma ? 'RES080' : (isHybrid ? 'RES093' : 'RES060');
        }

        // Limpiar referencia de cliente (quitar etiquetas antiguas de programas si existen)
        let cleanRef = (exp.referencia_cliente || op.referencia_cliente || '').toUpperCase();
        if (newPrograma === 'RES060') {
            cleanRef = cleanRef.replace(/RES080|REFORMA|RES093|HIBRIDACIÓN|HIBRIDACION/g, '').trim().replace(/\s+/g, ' ');
        } else if (newPrograma === 'RES080') {
            cleanRef = cleanRef.replace(/RES060|SUSTITUCION|SUSTITUCIÓN|RES093|HIBRIDACIÓN|HIBRIDACION/g, '').trim().replace(/\s+/g, ' ');
            if (!cleanRef.includes('REFORMA')) cleanRef = `REFORMA ${cleanRef}`.trim();
        } else if (newPrograma === 'RES093') {
            cleanRef = cleanRef.replace(/RES060|SUSTITUCION|SUSTITUCIÓN|RES080|REFORMA/g, '').trim().replace(/\s+/g, ' ');
            if (!cleanRef.includes('HIBRIDACION')) cleanRef = `HIBRIDACION ${cleanRef}`.trim();
        }

        // 3. Generar nuevo número
        const currentYear = new Date().getFullYear().toString().slice(-2);
        const newPrefix = `${currentYear}${newPrograma}_`;
        
        // Buscamos el máximo correlativo de forma numérico (mucho más fiable)
        const { data: lastExp } = await supabase
            .from('expedientes')
            .select('correlativo')
            .like('numero_expediente', `${newPrefix}%`)
            .order('correlativo', { ascending: false })
            .limit(1)
            .maybeSingle();

        const maxNumberFound = lastExp?.correlativo || 0;

        const startOffset = newPrograma === 'RES080' ? 36 : 1;
        const nextCorrelativo = Math.max(maxNumberFound + 1, startOffset);
        const newNumeroExpediente = `${newPrefix}${nextCorrelativo}`;

        console.log(`[ExpedienteService] Migrando ${exp.numero_expediente} a ${newNumeroExpediente}...`);

        // 4. Actualizar Drive (Opcional, no debe bloquear si falla)
        try {
            const driveFolderId = exp.drive_folder_id || op.datos_calculo?.drive_folder_id;
            if (driveFolderId) {
                const clientName = exp.referencia_cliente || op.referencia_cliente || 'SIN NOMBRE';
                const newFolderName = `${newNumeroExpediente} - ${clientName.toUpperCase()}`;
                await driveService.renameFolder(driveFolderId, newFolderName);
                console.log(`[ExpedienteService] Drive folder renamed to: ${newFolderName}`);
            }
        } catch (driveErr) {
            console.warn('[ExpedienteService] No se pudo renombrar la carpeta en Drive:', driveErr.message);
            // Continuamos aunque falle Drive
        }

        // 5. Preparar actualización de Base de Datos (Expediente)
        // No podemos usar 'cee.is_reforma' directamente en Supabase update
        const currentCee = exp.cee || {};
        const updatedCee = { ...currentCee, is_reforma: newPrograma === 'RES080' };

        const expUpdates = {
            numero_expediente: newNumeroExpediente,
            correlativo: nextCorrelativo,
            updated_at: new Date().toISOString(),
            cee: updatedCee
        };
        
        // Historial
        const docObj = exp.documentacion || {};
        const hist = docObj.historial || [];
        hist.push({
            id: Date.now().toString() + '_migration',
            tipo: 'sistema',
            texto: `Migración de expediente: Cambiado de ${exp.numero_expediente} a ${newNumeroExpediente} forzando programa ${newPrograma}.`,
            fecha: new Date().toISOString(),
            usuario: usuarioName
        });
        expUpdates.documentacion = { ...docObj, historial: hist };

        const { data: result, error: upErr } = await supabase
            .from('expedientes')
            .update(expUpdates)
            .eq('id', expedienteId)
            .select()
            .single();

        if (upErr) {
            console.error('[ExpedienteService] Supabase update error:', upErr);
            throw new Error(`Error en base de datos: ${upErr.message}`);
        }

        // 6. SINCRONIZAR OPORTUNIDAD: Importante para habilitar botones y lógica en el front
        const dc = op.datos_calculo || {};
        const inputs = dc.inputs || {};
        
        if (newPrograma === 'RES093') {
            inputs.hibridacion = true;
            inputs.isReforma = false;
        } else if (newPrograma === 'RES080') {
            inputs.hibridacion = false;
            inputs.isReforma = true;
            if (!inputs.reformaType || inputs.reformaType === 'none') inputs.reformaType = 'onlyReforma';
        } else {
            inputs.hibridacion = false;
            inputs.isReforma = false;
        }

        await supabase
            .from('oportunidades')
            .update({ 
                ficha: newPrograma,
                referencia_cliente: cleanRef,
                datos_calculo: { ...dc, inputs }
            })
            .eq('id', op.id);

        return {
            success: true,
            oldNumber: exp.numero_expediente,
            newNumber: newNumeroExpediente,
            data: result
        };

    } catch (error) {
        console.error('[ExpedienteService] Error en migración:', error.message);
        throw error;
    }
}

/**
 * Migra un expediente "ya en curso" desde sus XML de CEE, SIN pasar por el flujo
 * de oportunidades. Crea internamente una oportunidad "fantasma" (oculta del
 * listado, marcada con datos_calculo.origen = 'migracion_xml') de la que cuelga
 * el expediente, de modo que toda la lógica existente (Drive, cálculos, ciclo de
 * vida, módulos del detalle) sigue funcionando sin tocar el esquema.
 *
 * @param {Object} params
 * @param {('RES060'|'RES080'|'RES093')} params.ficha
 * @param {string} params.cliente_id
 * @param {string|null} [params.manualNumber]
 * @param {Object|null} params.ceeInicial  - resultado de parseCeeXml (front)
 * @param {Object|null} [params.ceeFinal]
 * @param {string} [params.refCatastral]
 * @param {Object} [params.fechas]         - { visita_inicial, firma_inicial, visita_final, firma_final }
 * @param {Object} [params.combustibles]   - overrides de comb_* (opcional)
 * @param {string|null} [params.xmlInicialBase64] - XML crudo para subir a Drive
 * @param {string|null} [params.xmlFinalBase64]
 * @param {Object|null} [params.usuario]   - req.user (prescriptor_id / id_usuario)
 */
async function migrateExpedienteFromXml({
    ficha,
    cliente_id,
    manualNumber = null,
    ceeInicial = null,
    ceeFinal = null,
    refCatastral = '',
    fechas = {},
    combustibles = {},
    xmlInicialBase64 = null,
    xmlFinalBase64 = null,
    usuario = null
}) {
    if (!['RES060', 'RES080', 'RES093'].includes(ficha)) {
        throw new Error('Ficha inválida (debe ser RES060, RES080 o RES093)');
    }
    if (!cliente_id) throw new Error('cliente_id es obligatorio');
    if (!ceeInicial && !ceeFinal) throw new Error('Se requiere al menos un XML (inicial o final)');

    // 1. Cliente (nombre para carpeta y referencia)
    const { data: cliente } = await supabase
        .from('clientes').select('*').eq('id_cliente', cliente_id).single();
    if (!cliente) throw new Error('Cliente no encontrado');
    const clientFullName = `${cliente.nombre_razon_social} ${cliente.apellidos || ''}`
        .trim().toUpperCase().replace(/\s+/g, ' ');

    // 2. Datos derivados del XML
    const ident = (ceeInicial && ceeInicial.identificacion) || (ceeFinal && ceeFinal.identificacion) || {};
    const rc = refCatastral || ident.refCatastral || '';
    const idOportunidad = 'MIG-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

    const provCode = resolveProvinceCode(ident);
    const provInfo = provCode ? ALLOWED_PROVINCES[provCode] : null;
    const datosCalculo = {
        origen: 'migracion_xml',
        estado: 'ACEPTADA',
        historial: [],
        zona: (ceeInicial && ceeInicial.zonaClimatica) || (ceeFinal && ceeFinal.zonaClimatica) || null,
        inputs: {
            ref_catastral: rc,
            demandMode: 'real',
            direccion: ident.direccion || null,
            municipio: ident.municipio || null,
            // provincia = CÓDIGO de 2 dígitos (lo que espera getCCAA y los cálculos);
            // guardamos el nombre y la CCAA aparte como metadato.
            provincia: provCode || null,
            provincia_nombre: ident.provincia || null,
            ccaa: provInfo ? provInfo.ccaa : null
        }
    };

    // 3. Carpeta de Drive PRIMERO, para insertarla ya dentro de datos_calculo.
    //    Así createExpediente la detecta, la renombra a "{numExp} - NOMBRE" y la
    //    mueve a la carpeta EN CURSO (ACEPTADAS), igual que al aceptar una oportunidad.
    //    (Antes se actualizaba tras el insert escribiendo una columna top-level
    //    inexistente en `oportunidades`, lo que hacía fallar el update en silencio
    //    y la carpeta quedaba como "MIG-… - NOMBRE" en la raíz, sin renombrar/mover.)
    let driveFolderId = null;
    try {
        const drive = await driveService.setupOpportunityFolder(idOportunidad, clientFullName);
        if (drive && drive.id) {
            driveFolderId = drive.id;
            datosCalculo.drive_folder_id = drive.id;
            datosCalculo.drive_folder_link = drive.link;
        }
    } catch (e) {
        console.warn('[migrateExpedienteFromXml] Drive folder setup falló:', e.message);
    }

    // 4. Oportunidad sintética (ya con la carpeta de Drive embebida en datos_calculo)
    const { data: op, error: opErr } = await supabase
        .from('oportunidades')
        .insert([{
            id_oportunidad: idOportunidad,
            ref_catastral: rc,
            ficha,
            referencia_cliente: clientFullName,
            cliente_id,
            prescriptor_id: usuario?.prescriptor_id || null,
            creador_id: usuario?.id_usuario || null,
            datos_calculo: datosCalculo
        }])
        .select()
        .single();
    if (opErr) throw new Error('No se pudo crear la oportunidad interna: ' + opErr.message);

    // 5. Overrides de CEE + fechas
    // Estado de los expedientes migrados: ya están "en curso" con sus CEE, así que
    // entran como PENDIENTE REVISAR EXPTE (entre DOC. COMPLETA y ENVIADO A VERIFICADOR).
    const overrides = {
        estado: 'PENDIENTE REVISAR EXPTE',
        cee: {
            tipo: 'xml',
            is_reforma: ficha === 'RES080',
            cee_inicial: ceeInicial || null,
            cee_final: ceeFinal || null,
            acs_method: 'xml',
            num_rooms: 4,
            comb_cal_inicial: combustibles.comb_cal_inicial || (ceeInicial && ceeInicial.combustibleCalefaccion) || 'Gasoleo Calefacción',
            comb_cal_final:   combustibles.comb_cal_final   || (ceeFinal && ceeFinal.combustibleCalefaccion)   || 'Electricidad peninsular',
            comb_acs_inicial: combustibles.comb_acs_inicial || (ceeInicial && ceeInicial.combustibleACS)        || 'Gasoleo Calefacción',
            comb_acs_final:   combustibles.comb_acs_final   || (ceeFinal && ceeFinal.combustibleACS)            || 'Electricidad peninsular',
            comb_ref_inicial: 'Electricidad peninsular',
            comb_ref_final: 'Electricidad peninsular',
            cee_files: { inicial: {}, final: {} }
        },
        documentacion: {
            fecha_visita_cee_inicial: fechas.visita_inicial || (ceeInicial && ceeInicial.fechaVisita) || null,
            fecha_firma_cee_inicial:  fechas.firma_inicial  || (ceeInicial && ceeInicial.fechaFirma)  || null,
            fecha_visita_cee_final:   fechas.visita_final   || (ceeFinal && ceeFinal.fechaVisita)     || null,
            fecha_firma_cee_final:    fechas.firma_final    || (ceeFinal && ceeFinal.fechaFirma)      || null
        }
    };

    // 6. Crear el expediente (numeración oficial + Drive rename/move + sync op)
    const newExp = await createExpediente(op.id, cliente_id, manualNumber, overrides);

    // 7. Subir XMLs crudos a Drive (1. CEE / CEE INICIAL|FINAL) y guardar enlaces
    if (driveFolderId && (xmlInicialBase64 || xmlFinalBase64)) {
        try {
            const ceeRootId = await driveService.getOrCreateSubfolder(driveFolderId, '1. CEE');
            const ceeFiles = { inicial: {}, final: {} };
            const numExp = newExp.numero_expediente || idOportunidad;

            if (xmlInicialBase64) {
                const sub = await driveService.getOrCreateSubfolder(ceeRootId, 'CEE INICIAL');
                const r = await driveService.saveFileToFolder(sub, `${numExp} - CEE INICIAL.xml`, 'application/xml', Buffer.from(xmlInicialBase64, 'base64'));
                if (r) ceeFiles.inicial.xml = r.link;
            }
            if (xmlFinalBase64) {
                const sub = await driveService.getOrCreateSubfolder(ceeRootId, 'CEE FINAL');
                const r = await driveService.saveFileToFolder(sub, `${numExp} - CEE FINAL.xml`, 'application/xml', Buffer.from(xmlFinalBase64, 'base64'));
                if (r) ceeFiles.final.xml = r.link;
            }

            const mergedCee = { ...(newExp.cee || {}), cee_files: ceeFiles };
            const { data: updated } = await supabase.from('expedientes')
                .update({ cee: mergedCee }).eq('id', newExp.id).select().single();
            if (updated) Object.assign(newExp, updated);
        } catch (e) {
            console.warn('[migrateExpedienteFromXml] Subida de XML a Drive falló:', e.message);
        }
    }

    return newExp;
}

module.exports = {
    createExpediente,
    migrateExpedienteProgram,
    migrateExpedienteFromXml
};
