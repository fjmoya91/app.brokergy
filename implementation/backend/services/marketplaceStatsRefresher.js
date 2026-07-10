/**
 * Refresco periódico de instalador_stats para el escaparate (Fase 1).
 *
 * Llama a la función SQL refresh_instalador_stats() (definida en la migración
 * marketplace_refresh_stats_fn_v2): recalcula nº instalaciones verificadas,
 * ayuda media, rango de presupuesto, municipios y rating por instalador.
 *
 * Patrón idéntico a catastroMonitor: setInterval simple, arrancado desde
 * server.js. No bloquea el arranque; los errores se registran y se reintenta
 * en el siguiente ciclo. El cálculo es barato (agrega ~150 expedientes).
 */
const supabase = require('./supabaseClient');

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // cada 6 h
let handle = null;

async function refreshNow() {
  try {
    const { error } = await supabase.rpc('refresh_instalador_stats');
    if (error) {
      console.warn('[marketplaceStats] fallo al refrescar:', error.message);
    } else {
      console.log('[marketplaceStats] instalador_stats refrescado');
    }
  } catch (err) {
    console.warn('[marketplaceStats] excepción al refrescar:', err.message);
  }
}

function start() {
  if (handle) return;
  // Primer refresco 20 s tras el arranque (deja respirar al proceso), luego cada 6 h.
  setTimeout(refreshNow, 20 * 1000);
  handle = setInterval(refreshNow, REFRESH_INTERVAL_MS);
  console.log('[marketplaceStats] refrescador de stats iniciado (cada 6 h)');
}

module.exports = { start, refreshNow };
