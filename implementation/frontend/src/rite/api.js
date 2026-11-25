// ─── api.js — lo común para hablar con el backend de la app RITE ────────────
// Las utilidades son las de la app de certificadores (mismo axios global con el
// `Bearer` que pone RiteAuth, sin interceptor que cierre la sesión ante un 401);
// cambian solo las rutas: /api/riteapp (regla 245).
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios';

export { errorDe, mensajeError, noDisponible, useCarga, comoLista, alPortapapeles, fecha, haceCuanto, enlaceWhatsApp } from '../certificadores/api';
export const API = '/api/riteapp';
export { axios };

/** Descarga un fichero de la API (lleva la sesión en la cabecera: un <a href> no la llevaría). */
export async function descargar(url, nombre) {
    const { data } = await axios.get(url, { params: { descargar: 1 }, responseType: 'blob' });
    const enlace = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = enlace;
    a.download = nombre || 'documento';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(enlace), 4000);
}
