/**
 * Geocodifica los instaladores del escaparate (Fase 1c).
 *
 * Rellena prescriptores.lat / lng a partir de su dirección, para pintar los
 * pines en instaladores.brokergy.es. Una sola pasada; secuencial con sleep
 * para no disparar ráfagas contra Google. Idempotente: solo toca filas sin
 * coordenadas (o con --force).
 *
 * Uso:
 *   node scripts/geocode_instaladores.js            # solo los que faltan
 *   node scripts/geocode_instaladores.js --force    # recalcula todos
 *   node scripts/geocode_instaladores.js --dry       # no escribe, solo informa
 *
 * NO rellena google_place_id: ese es el place_id de la FICHA DE NEGOCIO en
 * Google (para reseñas), distinto del place_id de la dirección. Se introduce
 * a mano desde la ficha del instalador.
 */
require('dotenv').config();
const supabase = require('../services/supabaseClient');
const { searchAddress } = require('../services/googleService');

const FORCE = process.argv.includes('--force');
const DRY = process.argv.includes('--dry');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Construye la mejor query posible con lo que haya (dirección, municipio, prov, CP).
function buildQuery(p) {
  const parts = [p.direccion, p.codigo_postal, p.municipio, p.provincia]
    .map((s) => (s || '').toString().trim())
    .filter(Boolean);
  return parts.join(', ');
}

(async () => {
  let q = supabase
    .from('prescriptores')
    .select('id_empresa, acronimo, razon_social, direccion, municipio, provincia, codigo_postal, lat, lng')
    .eq('tipo_empresa', 'INSTALADOR');
  if (!FORCE) q = q.is('lat', null);

  const { data: rows, error } = await q;
  if (error) { console.error('Error leyendo prescriptores:', error.message); process.exit(1); }

  console.log(`Instaladores a geocodificar: ${rows.length}${FORCE ? ' (forzado)' : ''}${DRY ? ' [DRY]' : ''}`);
  let ok = 0, sin_dir = 0, sin_result = 0, escritos = 0;

  for (const p of rows) {
    const nombre = p.acronimo || p.razon_social || p.id_empresa;
    const query = buildQuery(p);
    if (!query || query.length < 4) { console.log(`  · ${nombre}: sin dirección utilizable`); sin_dir++; continue; }

    try {
      const results = await searchAddress(query);
      const loc = results && results[0] && results[0].location;
      if (!loc || loc.lat == null) { console.log(`  · ${nombre}: sin resultado para "${query}"`); sin_result++; await sleep(250); continue; }

      console.log(`  ✓ ${nombre}: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}  (${query})`);
      ok++;
      if (!DRY) {
        const { error: upErr } = await supabase
          .from('prescriptores')
          .update({ lat: loc.lat, lng: loc.lng })
          .eq('id_empresa', p.id_empresa);
        if (upErr) console.error(`    ✗ error guardando ${nombre}: ${upErr.message}`);
        else escritos++;
      }
    } catch (e) {
      console.error(`  ✗ ${nombre}: ${e.message}`);
    }
    await sleep(250); // sin ráfagas
  }

  console.log(`\nResumen: geocodificados ${ok}, escritos ${escritos}, sin dirección ${sin_dir}, sin resultado ${sin_result}.`);
})();
