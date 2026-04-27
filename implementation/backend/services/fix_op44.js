const supabase = require('./supabaseClient');

async function fixOps() {
    const opsToFix = [
        { idOp: '26RES060_OP44', driveId: '1cj7zPVl3Du2S1GTg8K0URZTEGFYCJzjp' },
        { idOp: '26RES060_OP6', driveId: '1xpgEnIyJ7tKPF98yPA96BYpkkFDenru0' }
    ];

    for (const { idOp, driveId } of opsToFix) {
        const driveLink = `https://drive.google.com/drive/folders/${driveId}`;
        console.log(`\nBuscando oportunidad ${idOp}...`);
        
        const { data: op, error: getErr } = await supabase
            .from('oportunidades')
            .select('id, datos_calculo')
            .eq('id_oportunidad', idOp)
            .single();

        if (getErr || !op) {
            console.error(`Error al buscar ${idOp}:`, getErr?.message || 'No encontrada');
            continue;
        }

        const dc = op.datos_calculo || {};
        if (dc.drive_folder_id === driveId) {
            console.log(`ℹ️ Oportunidad ${idOp} ya tiene asociada la carpeta correcta.`);
            continue;
        }

        console.log(`Actualizando ${idOp} con carpeta ${driveId}...`);
        dc.drive_folder_id = driveId;
        dc.drive_folder_link = driveLink;

        const { error: upErr } = await supabase
            .from('oportunidades')
            .update({ datos_calculo: dc })
            .eq('id', op.id);

        if (upErr) {
            console.error(`Error al actualizar ${idOp}:`, upErr.message);
        } else {
            console.log(`✅ Oportunidad ${idOp} actualizada con éxito.`);
        }
    }
}

fixOps();
