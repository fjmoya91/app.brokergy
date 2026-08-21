// Teléfono y email de un prescriptor / certificador. La ficha los guarda en
// campos distintos según cómo se creara (importación, alta manual o cuenta de
// usuario), así que la cascada vive AQUÍ y no repetida en cada pantalla: el
// backend usa la misma al notificar (`telefono || movil || tlf`).
export const telefonoDe = (p) => p?.telefono || p?.movil || p?.tlf || p?.usuarios?.tlf || null;
export const emailDe = (p) => p?.email || p?.usuarios?.email || null;
