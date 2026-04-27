require('dotenv').config();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');

async function fixDriveFolders() {
    console.log('\n🔍 Buscando oportunidades sin carpeta en Google Drive...');
    
    // Obtenemos todas las oportunidades
    const { data: oportunidades, error } = await supabase.from('oportunidades').select('id_oportunidad, referencia_cliente, datos_calculo');
    
    if (error) {
        console.error('❌ Error al obtener la base de datos:', error.message);
        return;
    }

    let fixedCount = 0;

    for (const op of oportunidades) {
        let dc = op.datos_calculo || {};
        
        // Comprobamos si le falta la carpeta de Drive
        if (!dc.drive_folder_id) {
            console.log(`\n🛠️ Reparando oportunidad: ${op.id_oportunidad}`);
            
            try {
                // Creamos la carpeta
                const driveResult = await driveService.setupOpportunityFolder(op.id_oportunidad, op.referencia_cliente);
                
                if (driveResult) {
                    // Actualizamos la base de datos
                    dc.drive_folder_id = driveResult.id;
                    dc.drive_folder_link = driveResult.link;
                    
                    const { error: updateError } = await supabase
                        .from('oportunidades')
                        .update({ datos_calculo: dc })
                        .eq('id_oportunidad', op.id_oportunidad);
                        
                    if (updateError) {
                        console.error(`❌ Error actualizando BD para ${op.id_oportunidad}:`, updateError.message);
                    } else {
                        console.log(`✅ Oportunidad ${op.id_oportunidad} enlazada correctamente con su carpeta Drive.`);
                        fixedCount++;
                    }
                }
            } catch (err) {
                console.error(`❌ Error con la oportunidad ${op.id_oportunidad}:`, err.message);
            }
        }
    }

    console.log(`\n🎉 Reparación completada. Se generaron ${fixedCount} carpetas en total.`);
    process.exit(0);
}

fixDriveFolders();
