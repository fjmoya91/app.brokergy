import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Abrir en el EXPLORADOR la carpeta del expediente (el espejo local de Drive
// Desktop). El navegador no puede abrir un `file://`, así que el backend
// reconstruye la ruta subiendo por las carpetas padre de Drive y aquí se lanza
// el protocolo propio `brokergylocal:` — hay que registrarlo una vez por PC con
// `tools/windows/brokergylocal_setup.reg`.
//
// Detalles que NO se deben «simplificar» (ver memoria project_carpeta_local_protocolo):
//   · La ruta viaja en base64url CONSERVANDO el padding `=`.
//   · SIN `//` tras el esquema: con `//` el navegador pone el «host» en
//     minúsculas y rompe el base64, que distingue mayúsculas.
//   · Se copia además al portapapeles: si el PC no tiene el protocolo
//     instalado, al menos se puede pegar en el Explorador.
//
// La RUTA de la API la pone quien llama, porque son dos negocios con dos tablas:
// `/api/expedientes/:id/local-path` y `/api/cee-directos/:id/local-path`. Las
// dos son `staffOnly`: al certificador no se le ofrece.
// ─────────────────────────────────────────────────────────────────────────────

/** Lanza el protocolo con una ruta ya resuelta. */
export function lanzarProtocolo(path) {
    try { navigator.clipboard?.writeText(path); } catch { /* contexto no seguro */ }
    const b64url = btoa(unescape(encodeURIComponent(path)))
        .replace(/\+/g, '-').replace(/\//g, '_');
    const a = document.createElement('a');
    a.href = `brokergylocal:${b64url}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/**
 * Pide la ruta y la abre. Devuelve `{ ok, error }` en vez de lanzar: quien
 * llama decide si eso sale por un aviso o por una franja roja.
 */
export async function abrirCarpetaLocal(rutaApi) {
    try {
        const { data } = await axios.get(rutaApi);
        if (!data?.path) return { ok: false, error: 'No se pudo obtener la ruta local.' };
        lanzarProtocolo(data.path);
        return { ok: true, path: data.path };
    } catch (err) {
        return { ok: false,
                 error: err?.response?.data?.error || 'No se pudo abrir la carpeta local.' };
    }
}

export default abrirCarpetaLocal;
