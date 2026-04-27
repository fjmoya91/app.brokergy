const supabase = require('../services/supabaseClient');

async function deduplicate() {
    console.log('--- Iniciando limpieza de duplicados ---');
    const { data: todos, error } = await supabase
        .from('aerotermia')
        .select('id, modelo_ud_exterior, marca, modelo_comercial');
    
    if (error) { console.error('Error fetching:', error); return; }

    const seen = new Map();
    const idsToDelete = [];

    let manteniendosEnBlanco = 0;
    let duplicadosIdentificados = 0;

    todos.forEach(row => {
        const val = (row.modelo_ud_exterior || '').trim().toUpperCase();
        
        // Si está en blanco, los mantenemos todos (no hacemos nada)
        if (!val) {
            manteniendosEnBlanco++;
            return;
        }

        if (seen.has(val)) {
            // Ya hemos visto este modelo exterior, marcamos para borrar
            idsToDelete.push(row.id);
            duplicadosIdentificados++;
            console.log(`[Duplicado] Borrando row ID ${row.id}: ${row.marca} ${row.modelo_comercial} (${val})`);
        } else {
            // Primera vez que lo vemos
            seen.set(val, row.id);
        }
    });

    console.log(`\nResumen:`);
    console.log(`- Total registros: ${todos.length}`);
    console.log(`- Registros sin modelo exterior (mantenidos): ${manteniendosEnBlanco}`);
    console.log(`- Duplicados a eliminar: ${duplicadosIdentificados}`);

    if (idsToDelete.length > 0) {
        console.log(`\nEjecutando eliminación de ${idsToDelete.length} registros...`);
        // Borrar en bloques de 50 para evitar problemas de URL larga si se hiciera vía query params, 
        // aunque postgREST lo manda en el body.
        const { error: delError } = await supabase
            .from('aerotermia')
            .delete()
            .in('id', idsToDelete);
        
        if (delError) {
            console.error('Error al borrar:', delError);
        } else {
            console.log('Eliminación completada con éxito.');
        }
    } else {
        console.log('No se encontraron duplicados con modelo exterior definido.');
    }
}

deduplicate();
