// ─── appsExternas.js — la URL de las apps hermanas del CRM ──────────────────
// cee.brokergy.es (certificadores) y rite.brokergy.es (memoria RITE, regla 245):
// mismo repo, mismo backend y mismo Supabase. En producción, su subdominio; en
// local, `cee.localhost` / `rite.localhost` en el MISMO puerto (el middleware de
// vite.config.js sirve la app por el host). No se usa `?app=`: deja una cookie
// por puerto y el CRM de ese puerto pasaría a ser la otra app.
// ─────────────────────────────────────────────────────────────────────────────
export function urlAppExterna(app, ruta = '/') {
    const { hostname, protocol, port } = window.location;
    if (hostname === 'brokergy.es' || hostname.endsWith('.brokergy.es')) return `https://${app}.brokergy.es${ruta}`;
    return `${protocol}//${app}.localhost${port ? `:${port}` : ''}${ruta}`;
}
