const supabase = require('./supabaseClient');
const { getCoordinatesByRC } = require('./catastroService');
const driveService = require('./driveService');

/**
 * Crea un expediente automáticamente a partir de una oportunidad aceptada.
 * Esta lógica centraliza lo que antes se hacía manualmente en el panel de administracion.
 * 
 * @param {string} uuid_oportunidad - El ID (UUID) de la oportunidad en la tabla 'oportunidades'
 * @param {string} id_cliente - El ID del cliente vinculado
 */
async function createExpediente(uuid_oportunidad, id_cliente, manualNumber = null) {
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

        const aerothermiaDbId = opInputs.aerothermiaModel ? Number(opInputs.aerothermiaModel) : null;
        const instalacion = {
            misma_direccion: true,
            ref_catastral: op.ref_catastral || '',
            coord_x: utmX,
            coord_y: utmY,
            tipo_emisor: opInputs.emitterType || 'suelo_radiante',
            caldera_antigua_cal: { marca: '', modelo: '', numero_serie: '', rendimiento_id: opInputs.boilerId || 'default' },
            misma_caldera_acs: true,
            caldera_antigua_acs: { marca: '', modelo: '', numero_serie: '', rendimiento_id: opInputs.boilerId || 'default' },
            aerotermia_cal: {
                aerotermia_db_id: aerothermiaDbId,
                marca: opInputs.aerothermiaMarca || '',
                modelo: opInputs.aerothermiaModeloNombre || '',
                numero_serie: '',
                scop: opInputs.scopHeating || null
            },
            misma_aerotermia_acs: true,
            aerotermia_acs: {
                aerotermia_db_id: aerothermiaDbId,
                marca: opInputs.aerothermiaMarca || '',
                modelo: opInputs.aerothermiaModeloNombre || '',
                numero_serie: '',
                scop: opInputs.scopHeating || null
            },
            instalador_id: op.prescriptor_id || null
        };

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

        const cee = {
            tipo: opInputs.demandMode === 'real' ? 'xml' : 'aportado',
            is_reforma: programa === 'RES080',
            cee_inicial: opInputs.xmlDemandData || null,
            cee_final: null,
            demanda_calefaccion_manual: opInputs.demandaCalefaccionManual || null
        };

        // 4. Generar Número de Expediente Oficial (YYPROGRAMA_XXXX) o usar el manual
        let numeroExpediente = manualNumber;
        let nextCorrelativo = null;

        if (!numeroExpediente) {
            const currentYear = new Date().getFullYear().toString().slice(-2);
            const prefix = `${currentYear}${programa}_`;

            console.log(`[ExpedienteService] Buscando último correlativo para prefijo: ${prefix}`);

            const { data: lastExp } = await supabase
                .from('expedientes')
                .select('numero_expediente, correlativo')
                .like('numero_expediente', `${prefix}%`)
                .order('correlativo', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (lastExp) {
                console.log(`[ExpedienteService] Último expediente encontrado para ${programa}: ${lastExp.numero_expediente} (Correlativo: ${lastExp.correlativo})`);
            } else {
                console.log(`[ExpedienteService] No hay expedientes previos para el programa ${programa} en el año ${currentYear}.`);
            }

            // Para RES080 el contador empieza en 36 si no hay registros previos
            const startOffset = programa === 'RES080' ? 36 : 1;
            nextCorrelativo = Math.max((lastExp?.correlativo || 0) + 1, startOffset);
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
                photo_attachments: op.datos_calculo?.inputs?.photo_attachments || null
            },
            seguimiento: {
                cee_inicial: 'PTE_ENVIO_CERT',
                cee_final: 'PTE_ENVIO_CERT',
                anexos: 'PTE_EMITIR'
            }
        };

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
                
                // 2. Mover a la carpeta de "ACEPTADAS"
                const ACEPTADAS_FOLDER_ID = '1L2Wl9OIOpvmihySZkT09S1FG14Pu3VNy';
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

module.exports = {
    createExpediente,
    migrateExpedienteProgram
};
