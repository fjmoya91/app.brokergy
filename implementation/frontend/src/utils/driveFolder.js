// ─── La carpeta de Drive de una oportunidad ───────────────────────────────────
//
// La carpeta NO tiene columna propia: vive dentro de `datos_calculo` (JSONB) y se
// ha guardado en cuatro sitios distintos según la época y el camino de alta —
// `drive_folder_id` / `drive_folder_link` en la raíz, y los mismos dos dentro de
// `inputs`. El BACKEND ya lo resuelve en cascada desde siempre (una treintena de
// llamadas en `routes/expedientes.js`, más `resolveExpedienteDriveFolder`), y en
// el frontend la cascada está repetida en los diez modales que guardan en Drive
// (`op.drive_folder_id || datos_calculo.drive_folder_id || inputs.drive_folder_id`).
//
// REGLA — el enlace se DERIVA del id cuando falta, y no al revés. Un id de carpeta
// compone su enlace sin ambigüedad (`/drive/folders/{id}`), así que un expediente
// que tenga el id en cualquiera de los cuatro sitios TIENE carpeta. Pintar el botón
// solo si existe `datos_calculo.drive_folder_link` era gatear por la única de las
// cuatro claves que puede faltar: medido el 15/09/2026 sobre los 267 expedientes,
// 26RES060_103 (migrado de AppSheet) tiene su carpeta en `drive_folder_id` y en
// `inputs.drive_folder_link` pero NO en la raíz, así que los botones "Drive" y
// "Carpeta Local" no se pintaban en un expediente cuya carpeta existe y a la que
// el propio backend sabía llegar (`/local-path` la resuelve por el id).
//
// Un expediente sin ninguna de las cuatro claves sí es un expediente SIN carpeta
// en la app (61 migrados de AppSheet ya finalizados, cuya documentación vive en el
// Drive antiguo): ahí el botón sigue sin pintarse, que es lo correcto.
//
// Admite la OPORTUNIDAD entera o directamente sus `inputs` (que es lo que tiene a
// mano el panel de Resultados de la calculadora): las claves se llaman igual en
// los dos niveles, así que la misma cascada sirve para ambos y no hacen falta dos
// funciones gemelas que puedan divergir.

const ESCALONES = (o) => {
    const dc = o?.datos_calculo || {};
    return [o, dc, dc.inputs, o?.inputs].filter(Boolean);
};

/** Id de la carpeta raíz de Drive, mirando los cuatro sitios donde ha vivido. */
export function driveFolderId(op) {
    const niveles = ESCALONES(op);
    for (const n of niveles) {
        if (n.drive_folder_id) return String(n.drive_folder_id);
    }
    // Oportunidades antiguas que solo guardaron el ENLACE: el id va dentro.
    for (const n of niveles) {
        const m = n.drive_folder_link && String(n.drive_folder_link).match(/folders\/([A-Za-z0-9_-]+)/);
        if (m) return m[1];
    }
    return null;
}

/** Enlace a la carpeta raíz de Drive, compuesto desde el id si no está guardado. */
export function driveFolderLink(op) {
    for (const n of ESCALONES(op)) {
        if (n.drive_folder_link) return String(n.drive_folder_link);
    }
    const id = driveFolderId(op);
    return id ? `https://drive.google.com/drive/folders/${id}` : null;
}
