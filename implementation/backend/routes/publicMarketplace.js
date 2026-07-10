/**
 * ESCAPARATE DE INSTALADORES — API pública (Fase 1d)
 * Montado en: /api/public/marketplace
 *
 * CONTRATO DE ANONIMIZACIÓN (regla de oro, no negociable):
 *  - El DINERO DEL CLIENTE se puede mostrar: bono/ayuda CAE, rango de presupuesto.
 *  - Los DATOS PERSONALES DE CLIENTES NO: cada instalación es ANÓNIMA. Jamás sale
 *    nombre/DNI/email/tlf/dirección exacta/ref catastral/coords exactas/cliente_id/
 *    numero_expediente/uuid de oportunidad/upload_token. Geografía = solo municipio.
 *  - El MARGEN de Brokergy NUNCA sale (caePriceSO/Prescriptor/Brokergy, profitBrokergy,
 *    totalPrescriptor, *_rate, prescriptorMode…).
 *
 * Los DTO se construyen POR WHITELIST (campos enumerados uno a uno). No se "capa"
 * ningún objeto de BD: solo se copian los campos permitidos. Además, buildCardDTO
 * pasa por assertAnonymous() que revienta en desarrollo si se cuela una clave prohibida.
 */
const express = require('express');
const axios = require('axios');
const router = express.Router();
const supabase = require('../services/supabaseClient');
const driveService = require('../services/driveService');
const { geoGate } = require('../middleware/geoGate');
const { verifyTurnstileToken } = require('../services/turnstileService');
const { createLead } = require('../services/leadService');
const googleService = require('../services/googleService');

// Empresas propias que nunca aparecen en el escaparate (no son instaladores terceros).
const BLOCKLIST_NOMBRE = new Set(['BROKERGY']);

// Claves que JAMÁS pueden aparecer en un DTO público (defensa en profundidad).
const FORBIDDEN_KEYS = [
  'dni', 'nif', 'cif', 'email', 'tlf_cliente', 'telefono_cliente', 'cliente_id',
  'cliente_nombre', 'nombre_cliente', 'direccion', 'ref_catastral', 'referencia_catastral',
  'coord_x', 'coord_y', 'numero_expediente', 'oportunidad_id', 'expediente_id',
  'upload_token', 'caePriceSO', 'caePricePrescriptor', 'caePriceBrokergy', 'profitBrokergy',
  'totalPrescriptor', 'prescriptorMode', 'cae_so_rate', 'cae_prescriptor_rate',
];
function assertAnonymous(dto, ctx) {
  const bad = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (FORBIDDEN_KEYS.includes(k)) bad.push(k);
      if (o[k] && typeof o[k] === 'object') walk(o[k]);
    }
  };
  walk(dto);
  if (bad.length) {
    const msg = `[marketplace] FUGA de campo prohibido en ${ctx}: ${bad.join(', ')}`;
    console.error(msg);
    if (process.env.NODE_ENV !== 'production') throw new Error(msg);
  }
  return dto;
}

// Capitaliza cada palabra preservando ñ y acentos (NO usar \b: es ASCII y parte
// las palabras en la ñ). Deja en minúscula los conectores (de/la/del/y…).
const MINUS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'el', 'e']);
const titleCase = (s) => (s || '')
  .toLowerCase()
  .split(/(\s+|-)/)
  .map((w, i) => (i > 0 && MINUS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
  .join('')
  .trim();

const nombreDe = (p) => (p.acronimo || p.razon_social || '').trim();
const isBlocked = (p) => BLOCKLIST_NOMBRE.has(nombreDe(p).toUpperCase());

function tierDe(stats, ratingN) {
  const fin = stats?.num_finalizadas || 0;
  const rating = stats?.rating_media || 0;
  if (fin >= 15 && rating >= 4.5 && (ratingN || 0) >= 3) return 'ELITE';
  if (fin >= 5) return 'AVANZADO';
  return 'VERIFICADO';
}

// DTO de tarjeta (mapa + listado). SOLO campos permitidos.
function buildCardDTO(p, stats, marcas) {
  const fin = stats?.num_finalizadas || 0;
  const curso = stats?.num_en_curso || 0;
  const iniciadas = stats?.num_iniciadas || 0;
  const total = fin + curso + iniciadas;   // incluye iniciadas (petición 2026-07-07)
  const ayudaMedia = stats?.ayuda_media != null ? Math.round(Number(stats.ayuda_media)) : null;
  const dto = {
    slug: p.marketplace_slug,
    nombre: nombreDe(p),
    municipio: titleCase(p.municipio),
    provincia: titleCase(p.provincia),
    lat: p.lat != null ? Number(p.lat) : null,
    lng: p.lng != null ? Number(p.lng) : null,
    especialidades: Array.isArray(p.especialidades) ? p.especialidades : [],
    marcas: (marcas || []).map((m) => ({
      nombre: m.marca_nombre,
      logo_url: `/api/public/marketplace/marca-logo/${encodeURIComponent(m.marca_nombre)}`,
    })),
    instalaciones: { total, finalizadas: fin, en_curso: curso, iniciadas },
    ayuda_media_cliente: ayudaMedia,
    // DECISIÓN COMERCIAL (2026-07-07): NO publicar rango de precios del instalador.
    // Es inteligencia competitiva para sus rivales y ancla la negociación de sus
    // presupuestos → freno para que quieran estar en el escaparate. El dato sigue
    // en instalador_stats (uso interno), solo no sale al DTO público.
    rating: { media: stats?.rating_media != null ? Number(stats.rating_media) : null, total: stats?.num_resenas || 0 },
    tier: tierDe(stats, stats?.num_resenas),
    logo_url: p.marketplace_slug ? `/api/public/marketplace/logo/${p.marketplace_slug}` : null,
    // Contacto del INSTALADOR (negocio, permitido). Nombres inequívocos: el guardián de
    // anonimización prohíbe las claves genéricas `email`/`telefono` (que son de cliente).
    contacto_telefono: p.landing_telefono_contacto || p.tlf || null,
    contacto_email: p.landing_email_contacto || null,
    contacto_web: p.sitio_web || null,
  };
  return assertAnonymous(dto, 'card');
}

// ── Helpers de acceso a datos ───────────────────────────────────────────────
async function fetchVisibleInstaladores() {
  const { data: presc, error } = await supabase
    .from('prescriptores')
    .select('id_empresa, acronimo, razon_social, municipio, provincia, lat, lng, especialidades, marketplace_slug, landing_telefono_contacto, landing_email_contacto, tlf, sitio_web, descripcion_publica, google_place_id')
    .eq('visible_marketplace', true)
    .eq('tipo_empresa', 'INSTALADOR')
    .not('marketplace_slug', 'is', null);
  if (error) throw new Error(error.message);
  const rows = (presc || []).filter((p) => !isBlocked(p));
  if (!rows.length) return [];

  const ids = rows.map((r) => r.id_empresa);
  const [{ data: stats }, { data: marcas }] = await Promise.all([
    supabase.from('instalador_stats').select('*').in('instalador_id', ids),
    supabase.from('instalador_marcas').select('instalador_id, marca_nombre').in('instalador_id', ids),
  ]);
  const statsBy = new Map((stats || []).map((s) => [s.instalador_id, s]));
  const marcasBy = new Map();
  (marcas || []).forEach((m) => {
    if (!marcasBy.has(m.instalador_id)) marcasBy.set(m.instalador_id, []);
    marcasBy.get(m.instalador_id).push(m);
  });
  return rows.map((p) => ({ p, stats: statsBy.get(p.id_empresa), marcas: marcasBy.get(p.id_empresa) }));
}

// ── GET /instaladores  (mapa + listado; filtros y orden) ────────────────────
router.get('/instaladores', async (req, res) => {
  try {
    const { provincia, cp, marca, especialidad, sort } = req.query;
    let items = (await fetchVisibleInstaladores()).map(({ p, stats, marcas }) => ({
      dto: buildCardDTO(p, stats, marcas),
    })).map((x) => x.dto);

    // Filtros (post-DTO, sobre campos ya anónimos)
    if (provincia) items = items.filter((d) => (d.provincia || '').toLowerCase() === titleCase(provincia).toLowerCase());
    if (marca) items = items.filter((d) => d.marcas.some((m) => m.nombre.toUpperCase() === String(marca).toUpperCase()));
    if (especialidad) items = items.filter((d) => d.especialidades.map((e) => e.toLowerCase()).includes(String(especialidad).toLowerCase()));
    // cp: filtro laxo por prefijo de provincia (no tenemos CP del instalador en el DTO por privacidad de agregados; se filtra por cercanía en el front vía lat/lng)

    const key = {
      instalaciones: (a, b) => b.instalaciones.total - a.instalaciones.total,
      ayudas: (a, b) => (b.ayuda_media_cliente || 0) - (a.ayuda_media_cliente || 0),
      rating: (a, b) => (b.rating.media || 0) - (a.rating.media || 0),
    }[sort] || ((a, b) => b.instalaciones.total - a.instalaciones.total);
    items.sort(key);

    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ instaladores: items, total: items.length });
  } catch (e) {
    console.error('[marketplace/instaladores]', e.message);
    return res.status(500).json({ error: 'Error listando instaladores' });
  }
});

// ── GET /instaladores/:slug  (ficha completa) ───────────────────────────────
router.get('/instaladores/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const { data: p } = await supabase
      .from('prescriptores')
      .select('id_empresa, acronimo, razon_social, municipio, provincia, lat, lng, especialidades, marketplace_slug, landing_telefono_contacto, landing_email_contacto, tlf, sitio_web, descripcion_publica, google_place_id, visible_marketplace, tipo_empresa')
      .eq('marketplace_slug', slug)
      .eq('visible_marketplace', true)
      .eq('tipo_empresa', 'INSTALADOR')
      .maybeSingle();
    if (!p || isBlocked(p)) return res.status(404).json({ error: 'Instalador no encontrado' });

    const [{ data: stats }, { data: marcas }, { data: resenas }] = await Promise.all([
      supabase.from('instalador_stats').select('*').eq('instalador_id', p.id_empresa).maybeSingle(),
      supabase.from('instalador_marcas').select('marca_nombre').eq('instalador_id', p.id_empresa),
      supabase.from('instalador_resenas').select('puntuacion, comentario, autor_alias, municipio, mes_instalacion')
        .eq('instalador_id', p.id_empresa).eq('estado', 'PUBLICADA').order('created_at', { ascending: false }).limit(20),
    ]);

    const ficha = {
      ...buildCardDTO(p, stats, marcas),
      descripcion_publica: p.descripcion_publica || null,
      zona_trabajo: (stats?.municipios || []).map(titleCase),  // municipios reales, sin direcciones
      google_place_id: p.google_place_id || null,              // para enlace "escribe reseña en Google"
      resenas: (resenas || []).map((r) => ({
        puntuacion: r.puntuacion,
        comentario: r.comentario,
        autor: r.autor_alias || 'Cliente verificado',          // alias, nunca nombre completo
        municipio: titleCase(r.municipio),
        mes: r.mes_instalacion,
      })),
    };
    assertAnonymous(ficha, 'ficha');
    res.set('Cache-Control', 'public, max-age=300');
    return res.json(ficha);
  } catch (e) {
    console.error('[marketplace/ficha]', e.message);
    return res.status(500).json({ error: 'Error cargando la ficha' });
  }
});

// ── GET /instalaciones  (mapa de instalaciones ANÓNIMAS a nivel municipio) ──
// Privacidad: NUNCA coords de vivienda. Se usa el centroide del municipio + un
// desplazamiento DETERMINISTA (estable) por expediente para que no se apilen.
// Solo instalaciones de instaladores VISIBLES (mismo gate de consentimiento).
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function jitter(seed) {
  // Hash simple del id → offset reproducible en ~±700 m.
  let h = 0; for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  const a = ((h >>> 0) % 1000) / 1000, b = (((h >>> 10)) % 1000) / 1000;
  return { dLat: (a - 0.5) * 0.012, dLng: (b - 0.5) * 0.016 };
}
function tipoDe(numero) {
  const s = (numero || '').toUpperCase();
  if (s.includes('TER')) return { key: 'terciario', label: 'Edificio terciario' };
  if (s.includes('RES080')) return { key: 'reforma', label: 'Reforma energética' };
  return { key: 'aerotermia', label: 'Aerotermia' };
}

router.get('/instalaciones', async (req, res) => {
  try {
    // Instaladores visibles (consentidos) → nombre + slug + marcas.
    const { data: visibles } = await supabase
      .from('prescriptores').select('id_empresa, acronimo, razon_social, marketplace_slug')
      .eq('visible_marketplace', true).eq('tipo_empresa', 'INSTALADOR');
    const visSet = new Map((visibles || []).filter((p) => !isBlocked(p)).map((p) => [p.id_empresa, p]));
    if (!visSet.size) { res.set('Cache-Control', 'public, max-age=300'); return res.json({ instalaciones: [] }); }

    const { data: marcasRows } = await supabase
      .from('instalador_marcas').select('instalador_id, marca_nombre').in('instalador_id', [...visSet.keys()]);
    const marcasBy = new Map();
    (marcasRows || []).forEach((m) => { if (!marcasBy.has(m.instalador_id)) marcasBy.set(m.instalador_id, []); marcasBy.get(m.instalador_id).push(m.marca_nombre); });

    const { data: exps } = await supabase
      .from('expedientes')
      .select('id, numero_expediente, instalacion, oportunidad_id, cliente_id, seguimiento, estado, instalador_asociado_id')
      .in('instalador_asociado_id', [...visSet.keys()]);

    const verif = (e) => e.seguimiento?.cee_inicial === 'REGISTRADO' || e.seguimiento?.cee_final === 'REGISTRADO'
      || ['DOC. COMPLETA', 'ENVIADO A VERIFICADOR', 'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'].includes(e.estado);
    const vlist = (exps || []).filter(verif);

    // Municipio del cliente (dato coarse, permitido) como fuente de respaldo —
    // muchos expedientes solo tienen el municipio ahí. NO se expone nada más del cliente.
    const cliIds = [...new Set(vlist.map((e) => e.cliente_id).filter(Boolean))];
    const { data: clientes } = cliIds.length
      ? await supabase.from('clientes').select('id_cliente, municipio, provincia').in('id_cliente', cliIds)
      : { data: [] };
    const cliBy = new Map((clientes || []).map((c) => [c.id_cliente, c]));

    const { data: ops } = await supabase.from('oportunidades').select('id, datos_calculo')
      .in('id', [...new Set(vlist.map((e) => e.oportunidad_id).filter(Boolean))]);
    const opBy = new Map((ops || []).map((o) => [o.id, o]));

    // Indexar por MUNICIPIO (nombre en minúsculas): la provincia venía como código
    // INE en unos sitios y como nombre en otros, así que casar por municipio es lo fiable.
    const { data: geos } = await supabase.from('municipio_geo').select('municipio, lat, lng');
    const geoBy = new Map((geos || []).map((g) => [(g.municipio || '').trim().toLowerCase(), g]));
    const gkey = (m) => (m || '').trim().toLowerCase();

    const out = [];
    for (const e of vlist) {
      const dc = opBy.get(e.oportunidad_id)?.datos_calculo || {};
      const f = dc.result?.financials || {};
      const cli = cliBy.get(e.cliente_id) || {};
      const municipio = (dc.inputs?.municipio || e.instalacion?.municipio || cli.municipio || '').trim();
      let provincia = (e.instalacion?.provincia || dc.inputs?.provincia_nombre || cli.provincia || '').trim();
      if (/^\d+$/.test(provincia)) provincia = '';   // nunca mostrar el código INE
      const geo = geoBy.get(gkey(municipio));
      if (!geo) continue; // sin centroide → no lo pintamos
      const p = visSet.get(e.instalador_asociado_id);
      const j = jitter(e.id);
      const tipo = tipoDe(e.numero_expediente);
      // Marca+modelo REALMENTE instalado (equipo del expediente), no la genérica del
      // instalador. Solo marca y modelo; nunca el nº de serie ni datos internos.
      const aero = (e.instalacion && typeof e.instalacion.aerotermia_cal === 'object') ? e.instalacion.aerotermia_cal : null;
      let marcaInst = aero?.marca || null, modeloInst = aero?.modelo || null;
      if (!marcaInst) {
        let sm = dc.result?.selectedModel;
        if (typeof sm === 'string') { try { sm = JSON.parse(sm); } catch { sm = null; } }
        marcaInst = sm?.marca || null; modeloInst = modeloInst || sm?.modelo || null;
      }
      out.push({
        id: e.id,                                   // opaco (uuid); no se expone nº expediente ni cliente
        lat: Number(geo.lat) + j.dLat, lng: Number(geo.lng) + j.dLng,
        tipo: tipo.key, tipo_label: tipo.label,
        municipio: titleCase(municipio), provincia: titleCase(provincia),
        ayuda_cae: num(f.caeBonus) != null ? Math.round(num(f.caeBonus)) : null,
        irpf_deduccion: num(f.irpfDeduction) != null ? Math.round(num(f.irpfDeduction)) : null,
        irpf_rate: num(f.irpfRate),
        // Coste de obra / coste final NO se publican (decisión comercial 2026-07-07):
        // revelarían los precios del instalador. El % subvencionado + ayudas venden igual.
        pct_cubierto: num(f.porcentajeCubierto) != null ? Math.round(num(f.porcentajeCubierto)) : null,
        instalador_nombre: (p.acronimo || p.razon_social || '').trim(),
        instalador_slug: p.marketplace_slug,
        marca_instalada: marcaInst,
        modelo_instalado: modeloInst,
        marcas: (marcasBy.get(e.instalador_asociado_id) || []).slice(0, 3),
      });
    }
    assertAnonymous(out, 'instalaciones');
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ instalaciones: out });
  } catch (e) {
    console.error('[marketplace/instalaciones]', e.message);
    return res.status(500).json({ error: 'Error cargando instalaciones' });
  }
});

// ── GET /instaladores/:slug/fotos  (galería curada; pares ANTES/DESPUÉS) ─────
router.get('/instaladores/:slug/fotos', async (req, res) => {
  try {
    const { slug } = req.params;
    const { data: p } = await supabase
      .from('prescriptores').select('id_empresa, visible_marketplace')
      .eq('marketplace_slug', slug).eq('visible_marketplace', true).maybeSingle();
    if (!p) return res.status(404).json({ error: 'Instalador no encontrado' });

    const { data: fotos } = await supabase
      .from('instalador_fotos_escaparate')
      .select('id, fase, actuacion, par_id, titulo_publico, municipio, orden')
      .eq('instalador_id', p.id_empresa)
      .eq('consentimiento_cliente', true)     // SOLO con consentimiento del cliente
      .order('orden', { ascending: true });

    // Agrupar por par (ANTES/DESPUÉS). Nunca se expone expediente_id ni drive_id.
    const pares = new Map();
    (fotos || []).forEach((f) => {
      const k = f.par_id || f.id;
      if (!pares.has(k)) pares.set(k, { actuacion: f.actuacion, titulo: f.titulo_publico, municipio: titleCase(f.municipio), antes: null, despues: null });
      const slot = f.fase === 'DESPUES' ? 'despues' : 'antes';
      pares.get(k)[slot] = { url: `/api/public/marketplace/foto/${f.id}` };
    });
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({ obras: Array.from(pares.values()) });
  } catch (e) {
    console.error('[marketplace/fotos]', e.message);
    return res.status(500).json({ error: 'Error cargando fotos' });
  }
});

// ── GET /logo/:slug  (sirve el logo del instalador; base64 o URL) ───────────
router.get('/logo/:slug', async (req, res) => {
  try {
    const { data: p } = await supabase
      .from('prescriptores').select('logo_empresa, visible_marketplace')
      .eq('marketplace_slug', req.params.slug).eq('visible_marketplace', true).maybeSingle();
    const logo = p?.logo_empresa;
    if (!logo) return res.status(404).end();
    const m = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(logo);
    if (m) {
      res.set('Content-Type', m[1]);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(m[2], 'base64'));
    }
    return res.redirect(logo); // por si algún logo es URL
  } catch (e) {
    return res.status(500).end();
  }
});

// ── GET /stats  (totales globales para la cabecera: instalaciones y ayudas) ──
router.get('/stats', async (req, res) => {
  try {
    const { data: visibles } = await supabase
      .from('prescriptores').select('id_empresa, acronimo, razon_social, provincia')
      .eq('visible_marketplace', true).eq('tipo_empresa', 'INSTALADOR');
    const vis = (visibles || []).filter((p) => !isBlocked(p));
    if (!vis.length) return res.json({ instaladores: 0, instalaciones: 0, ayuda_cae: 0, ayuda_irpf: 0, ayuda_total: 0, dinero_movilizado: 0, provincias: 0 });
    const visIds = vis.map((p) => p.id_empresa);

    const { data: exps } = await supabase
      .from('expedientes').select('oportunidad_id, seguimiento, estado, instalador_asociado_id, instalacion')
      .in('instalador_asociado_id', visIds);
    const verif = (e) => e.seguimiento?.cee_inicial === 'REGISTRADO' || e.seguimiento?.cee_final === 'REGISTRADO'
      || ['DOC. COMPLETA', 'ENVIADO A VERIFICADOR', 'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'].includes(e.estado);
    const vlist = (exps || []).filter(verif);

    const { data: ops } = await supabase.from('oportunidades').select('id, datos_calculo')
      .in('id', [...new Set(vlist.map((e) => e.oportunidad_id).filter(Boolean))]);
    const opBy = new Map((ops || []).map((o) => [o.id, o]));

    // "Dinero movilizado" = suma del coste de obra (presupuesto) de TODAS las instalaciones
    // verificadas. Es un agregado del ecosistema, no el precio de ningún instalador
    // concreto — no choca con la regla de no publicar precios individuales.
    let cae = 0, irpf = 0, movilizado = 0;
    for (const e of vlist) {
      const f = opBy.get(e.oportunidad_id)?.datos_calculo?.result?.financials || {};
      cae += num(f.caeBonus) || 0;
      irpf += num(f.irpfDeduction) || 0;
      movilizado += num(f.presupuesto) || 0;
    }
    const provincias = new Set(vis.map((p) => (p.provincia || '').toLowerCase()).filter(Boolean)).size;
    res.set('Cache-Control', 'public, max-age=300');
    return res.json({
      instaladores: vis.length,
      instalaciones: vlist.length,           // headline "verificadas" = finalizadas + en curso (honesto)
      ayuda_cae: Math.round(cae),
      ayuda_irpf: Math.round(irpf),
      ayuda_total: Math.round(cae + irpf),
      dinero_movilizado: Math.round(movilizado),
      provincias,
    });
  } catch (e) {
    console.error('[marketplace/stats]', e.message);
    return res.status(500).json({ error: 'stats' });
  }
});

// ── GET /marcas  (carrusel de marcas: solo las que tienen logo, con nº de instaladores) ──
router.get('/marcas', async (req, res) => {
  try {
    const [{ data: marcas }, { data: vinc }] = await Promise.all([
      supabase.from('aerotermia_marcas').select('nombre, logo'),
      supabase.from('instalador_marcas').select('marca_nombre'),
    ]);
    const count = new Map();
    (vinc || []).forEach((v) => count.set(v.marca_nombre, (count.get(v.marca_nombre) || 0) + 1));
    const out = (marcas || [])
      .filter((m) => m.logo)
      .map((m) => ({
        nombre: m.nombre,
        logo_url: `/api/public/marketplace/marca-logo/${encodeURIComponent(m.nombre)}`,
        instaladores: count.get(m.nombre) || 0,
      }))
      .sort((a, b) => b.instaladores - a.instaladores);
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({ marcas: out });
  } catch (e) {
    console.error('[marketplace/marcas]', e.message);
    return res.status(500).json({ error: 'Error cargando marcas' });
  }
});

// ── GET /marca/:nombre  (página de marca: sus instaladores + agregados) ──────
router.get('/marca/:nombre', async (req, res) => {
  try {
    const nombre = req.params.nombre;
    const { data: m } = await supabase
      .from('aerotermia_marcas').select('nombre, descripcion').ilike('nombre', nombre).maybeSingle();
    if (!m) return res.status(404).json({ error: 'Marca no encontrada' });

    // Instaladores visibles que trabajan con esta marca.
    const all = await fetchVisibleInstaladores();
    const conMarca = all.filter(({ marcas }) =>
      (marcas || []).some((x) => x.marca_nombre.toUpperCase() === m.nombre.toUpperCase()));
    const cards = conMarca.map(({ p, stats, marcas }) => buildCardDTO(p, stats, marcas));

    // Instalaciones de esa marca (nº + ayudas), reutilizando el criterio de verificadas.
    const visIds = conMarca.map(({ p }) => p.id_empresa);
    let num_instalaciones = 0, ayuda_total = 0;
    if (visIds.length) {
      const { data: exps } = await supabase
        .from('expedientes').select('instalacion, oportunidad_id, seguimiento, estado, instalador_asociado_id')
        .in('instalador_asociado_id', visIds);
      const verif = (e) => e.seguimiento?.cee_inicial === 'REGISTRADO' || e.seguimiento?.cee_final === 'REGISTRADO'
        || ['DOC. COMPLETA', 'ENVIADO A VERIFICADOR', 'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'].includes(e.estado);
      const vlist = (exps || []).filter((e) => verif(e)
        && (e.instalacion?.aerotermia_cal?.marca || '').toUpperCase() === m.nombre.toUpperCase());
      num_instalaciones = vlist.length;
      const { data: ops } = vlist.length
        ? await supabase.from('oportunidades').select('id, datos_calculo').in('id', [...new Set(vlist.map((e) => e.oportunidad_id).filter(Boolean))])
        : { data: [] };
      const opBy = new Map((ops || []).map((o) => [o.id, o]));
      for (const e of vlist) {
        const f = opBy.get(e.oportunidad_id)?.datos_calculo?.result?.financials || {};
        ayuda_total += (num(f.caeBonus) || 0) + (num(f.irpfDeduction) || 0);
      }
    }

    res.set('Cache-Control', 'public, max-age=600');
    return res.json({
      nombre: m.nombre,
      logo_url: `/api/public/marketplace/marca-logo/${encodeURIComponent(m.nombre)}`,
      descripcion: m.descripcion || null,
      num_instaladores: cards.length,
      num_instalaciones,
      ayuda_total: Math.round(ayuda_total),
      instaladores: cards,
    });
  } catch (e) {
    console.error('[marketplace/marca]', e.message);
    return res.status(500).json({ error: 'Error cargando la marca' });
  }
});

// ── GET /geocode?q=  (buscador por municipio/CP; método Google como en la app) ──
router.get('/geocode', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json({ result: null });
    // Sesga a España + añade "España" si no parece incluir país.
    const query = /espa/i.test(q) ? q : `${q}, España`;
    const results = await googleService.searchAddress(query);
    const r = results && results[0];
    if (!r || !r.location) return res.json({ result: null });
    return res.json({
      result: {
        lat: r.location.lat, lng: r.location.lng,
        label: r.description || q,
      },
    });
  } catch (e) {
    console.error('[marketplace/geocode]', e.message);
    return res.status(500).json({ result: null });
  }
});

// ── GET /marca-logo/:nombre  (logo del catálogo aerotermia_marcas; base64 en BD) ──
router.get('/marca-logo/:nombre', async (req, res) => {
  try {
    const { data: m } = await supabase
      .from('aerotermia_marcas').select('logo')
      .eq('nombre', req.params.nombre).maybeSingle();
    const logo = m?.logo;
    if (!logo) return res.status(404).end();
    const dataUri = /^data:(image\/[a-z.+-]+);base64,(.+)$/i.exec(logo);
    if (dataUri) {
      res.set('Content-Type', dataUri[1]);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(dataUri[2], 'base64'));
    }
    if (/^https?:\/\//i.test(logo)) return res.redirect(logo);
    // Base64 crudo sin prefijo → asumir PNG
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(logo, 'base64'));
  } catch (e) {
    return res.status(500).end();
  }
});

// ── GET /foto/:id  (proxy Drive; SOLO fotos curadas con consentimiento) ─────
router.get('/foto/:id', async (req, res) => {
  try {
    const { data: foto } = await supabase
      .from('instalador_fotos_escaparate').select('drive_id, consentimiento_cliente')
      .eq('id', req.params.id).maybeSingle();
    if (!foto || !foto.consentimiento_cliente) return res.status(404).end();

    const size = /^\d+$/.test(String(req.query.sz)) ? String(req.query.sz) : '800';
    const driveId = foto.drive_id;
    const tryFetch = async (url) => {
      try {
        const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 9000, maxRedirects: 5, validateStatus: (s) => s === 200 });
        return { buf: Buffer.from(r.data), type: r.headers['content-type'] || 'image/jpeg' };
      } catch { return null; }
    };
    let img = await tryFetch(`https://lh3.googleusercontent.com/d/${driveId}=w${size}`);
    if (!img) img = await tryFetch(`https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}`);
    if (!img) {
      const buf = await driveService.getFileContent(driveId);
      if (!buf) return res.status(404).end();
      img = { buf, type: 'image/jpeg' };
    }
    res.set('Content-Type', img.type);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.send(img.buf);
  } catch (e) {
    console.error('[marketplace/foto]', e.message);
    return res.status(500).end();
  }
});

// ── POST /alta-instalador  (landing /instaladores/unete: solicitud de colaboración B2B) ──
router.post('/alta-instalador', async (req, res) => {
  try {
    const { empresa, contacto, telefono, email, provincia, marcas, mensaje, web, origen } = req.body || {};
    if (web) return res.json({ ok: true });                 // honeypot anti-bots: campo oculto
    // Origen whitelisted: instalador (unete), marca (colabora) o distribuidor
    const origenOk = ['landing_unete', 'landing_marca', 'landing_distribuidor'].includes(origen) ? origen : 'landing_unete';
    const emp = (empresa || '').toString().trim();
    const tlf = (telefono || '').toString().trim();
    if (emp.length < 2 || tlf.replace(/\D/g, '').length < 9) {
      return res.status(400).json({ error: 'Indica al menos el nombre de tu empresa y un teléfono válido.' });
    }
    const fila = {
      empresa: emp.slice(0, 200),
      contacto: (contacto || '').toString().trim().slice(0, 200) || null,
      telefono: tlf.slice(0, 30),
      email: (email || '').toString().trim().toLowerCase().slice(0, 150) || null,
      provincia: (provincia || '').toString().trim().slice(0, 100) || null,
      marcas: (marcas || '').toString().trim().slice(0, 500) || null,
      mensaje: (mensaje || '').toString().trim().slice(0, 2000) || null,
      origen: origenOk,
    };
    const { error } = await supabase.from('instalador_solicitudes').insert(fila);
    if (error) throw new Error(error.message);

    // Aviso al admin (no bloqueante).
    try {
      const { sendMail } = require('../services/emailService');
      await sendMail({
        to: 'franciscojavier.moya.s2e2@gmail.com',
        subject: origenOk === 'landing_marca'
          ? `🏷️ Marca interesada: ${fila.empresa}`
          : origenOk === 'landing_distribuidor'
            ? `📦 Distribuidor interesado: ${fila.empresa}`
            : `🔧 Nuevo instalador interesado: ${fila.empresa}`,
        text: `Solicitud desde instaladores.brokergy.es/unete\n\nEmpresa: ${fila.empresa}\nContacto: ${fila.contacto || '-'}\nTeléfono: ${fila.telefono}\nEmail: ${fila.email || '-'}\nProvincia: ${fila.provincia || '-'}\nMarcas: ${fila.marcas || '-'}\nMensaje: ${fila.mensaje || '-'}`,
        html: `<h2>Nuevo instalador interesado 🔧</h2>
          <p>Solicitud desde la landing de captación del escaparate.</p>
          <table cellpadding="6" style="border-collapse:collapse">
            <tr><td><b>Empresa</b></td><td>${fila.empresa}</td></tr>
            <tr><td><b>Contacto</b></td><td>${fila.contacto || '-'}</td></tr>
            <tr><td><b>Teléfono</b></td><td>${fila.telefono}</td></tr>
            <tr><td><b>Email</b></td><td>${fila.email || '-'}</td></tr>
            <tr><td><b>Provincia</b></td><td>${fila.provincia || '-'}</td></tr>
            <tr><td><b>Marcas</b></td><td>${fila.marcas || '-'}</td></tr>
            <tr><td><b>Mensaje</b></td><td>${fila.mensaje || '-'}</td></tr>
          </table>`,
      });
    } catch (e) { console.warn('[marketplace/alta] email admin falló:', e.message); }

    return res.json({ ok: true });
  } catch (e) {
    console.error('[marketplace/alta-instalador]', e.message);
    return res.status(500).json({ error: 'No se pudo enviar la solicitud. Inténtalo de nuevo.' });
  }
});

// ── POST /lead  (CTA "Pide tu estudio"; reutiliza createLead con Turnstile+geoGate) ──
router.post('/lead', geoGate, async (req, res) => {
  try {
    const { turnstile_token, instalador_slug, contacto, catastro, funnel, calculatorInputs } = req.body || {};
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress;
    const turnstile = await verifyTurnstileToken(turnstile_token, clientIp);
    if (!turnstile.ok) return res.status(403).json({ error: 'Verificación anti-bot fallida.', code: 'CAPTCHA_FAILED' });

    // Resolver el instalador por su slug de marketplace (debe ser visible).
    let prescriptorId = null;
    if (instalador_slug) {
      const { data: inst } = await supabase
        .from('prescriptores').select('id_empresa')
        .eq('marketplace_slug', instalador_slug).eq('visible_marketplace', true).maybeSingle();
      prescriptorId = inst?.id_empresa || null;
    }

    const result = await createLead({
      contacto: contacto || {},
      catastro: catastro || {},
      funnel: funnel || {},
      calculatorInputs: calculatorInputs || {},
      geoContext: req.geoContext,
      prescriptorId,
      mode: 'public',
      origen: 'marketplace',
    });
    return res.json({ ok: true, id: result?.id || null });
  } catch (e) {
    console.error('[marketplace/lead]', e.message);
    return res.status(500).json({ error: 'No se pudo registrar la solicitud' });
  }
});

module.exports = router;
