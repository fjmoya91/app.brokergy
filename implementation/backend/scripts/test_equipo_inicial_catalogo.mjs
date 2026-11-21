/**
 * test_equipo_inicial_catalogo — «Calcular una obra con este equipo» (app del instalador, fase 4).
 *
 *   node implementation/backend/scripts/test_equipo_inicial_catalogo.mjs
 *
 * Vigila `features/landing/data/equipoInicial.js`:
 *   - el presupuesto arranca con el precio SIN IVA + 21 % (el embudo espera el total CON IVA);
 *   - sin precio (ni el suyo ni tarifa) no se inventa presupuesto: ni 0 ni documento;
 *   - el documento «importe a mano» tiene la forma de `docManual` de StepDocsObra;
 *   - con el modelo leído, SCOP / temporada / potencia salen de `scopsParaClima`, el MISMO
 *     camino que el efecto de CalculatorForm al elegir el modelo a mano;
 *   - si el modelo no se puede leer, queda solo PRESELECCIONADO y el SCOP no se toca.
 * Sin red ni BD: el lector del modelo se inyecta.
 */
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const front = (p) => pathToFileURL(path.join(aqui, '../../frontend/src', p)).href;
const eq = await import(front('features/landing/data/equipoInicial.js'));
const calc = await import(front('features/calculator/logic/calculation.js'));

let ok = 0, mal = 0;
const comprobar = (cond, texto) => { if (cond) { ok++; console.log(`✓ ${texto}`); } else { mal++; console.log(`✗ ${texto}`); } };

// ── Presupuesto ───────────────────────────────────────────────────────────────
comprobar(eq.totalConIvaEquipo({ precio_sin_iva: 6900 }) === 8349, '6.900 € sin IVA → 8.349 € con IVA');
comprobar(eq.totalConIvaEquipo({ precio_sin_iva: 7240.5 }) === 8761, '7.240,50 € → 8.761 € (euros redondos)');
comprobar(eq.totalConIvaEquipo({ precio_sin_iva: null }) === 0, 'sin precio → 0 (y el embudo no lo siembra)');
comprobar(eq.totalConIvaEquipo({ precio_sin_iva: -5 }) === 0, 'precio negativo → 0');
comprobar(eq.docDelEquipo({ id: 1, precio_sin_iva: null }) === null, 'sin precio no hay documento «a mano»');

const doc = eq.docDelEquipo({ id: 103, precio_sin_iva: 6900 });
comprobar(doc?.id === 'presupuesto-catalogo-103' && doc.slot === 'DOC_PRESUPUESTO' && doc.tipo === 'presupuesto', 'documento con su id, tipo y slot');
comprobar(doc?.doc.importe_total === 8349 && doc.doc.iva_pct === 21 && doc.doc.iva_estimado === true, 'importe total con IVA, IVA 21 % estimado');
comprobar(Math.abs(doc?.doc.importe_sin_iva - 6900) < 0.5, 'importe sin IVA ≈ el precio del equipo');
comprobar(doc?.doc.origen === 'manual' && Array.isArray(doc.doc.partidas) && doc.doc.partidas.length === 0 && doc.files.length === 0, 'forma de docManual: origen manual, sin partidas ni ficheros');

// ── Temperatura por emisor (la misma que CalculatorForm) ─────────────────────
comprobar(eq.temperaturaDeEmisor('radiadores_convencionales') === 55, 'radiadores → 55 °C');
comprobar(eq.temperaturaDeEmisor('radiadores_baja_temp') === 45, 'baja temperatura → 45 °C');
comprobar(eq.temperaturaDeEmisor('suelo_radiante') === 35, 'suelo radiante → 35 °C');

// ── Modelo del catálogo ──────────────────────────────────────────────────────
const modelo = {
    id: 103, marca: 'MARCA A', modelo_comercial: 'Serie Dos 10',
    scop_cal_calido_35: 5.1, scop_cal_calido_55: 3.6, scop_cal_medio_35: 4.62, scop_cal_medio_55: 3.41,
    scop_dhw_calido: 3.3, scop_dhw_medio: 3.0, potencia_calefaccion: 10,
};
const base = { zona: 'D3', emitterType: 'radiadores_convencionales', scopHeating: 2.5, potenciaBomba: 0 };
const inputs = await eq.aplicarEquipoInicial({ ...base }, { id: 103 }, async () => modelo);
const esperado = calc.scopsParaClima({ modelo, modeloAcs: modelo, zona: 'D3', temp: 55, clima: calc.climaScopForzado(base) });
comprobar(inputs.aerothermiaModel === '103', 'el modelo queda elegido en la calculadora');
comprobar(Number(esperado.scopHeating) > 0, `scopsParaClima da un SCOP (${esperado.scopHeating})`);
comprobar(inputs.scopHeating === esperado.scopHeating, 'el SCOP de calefacción es el de scopsParaClima (mismo camino que elegirlo a mano)');
comprobar(inputs.scopTemporada === esperado.scopTemporada, 'la temporada también');
comprobar(esperado.scopAcs == null || inputs.scopAcs === esperado.scopAcs, 'y el de ACS');
comprobar(inputs.potenciaBomba === 10, 'la potencia sale de potencia_calefaccion');

const conAcsAparte = await eq.aplicarEquipoInicial({ ...base, changeAcs: true, scopAcs: 2.9 }, { id: 103 }, async () => modelo);
comprobar(conAcsAparte.scopAcs === 2.9, 'con el ACS en otro equipo, su SCOP no se toca');

// ── Fallos: el modelo no se lee ──────────────────────────────────────────────
const caido = await eq.aplicarEquipoInicial({ ...base }, { id: 103 }, async () => { throw new Error('503'); });
comprobar(caido.aerothermiaModel === '103' && caido.scopHeating === 2.5 && caido.potenciaBomba === 0, 'si no se lee el modelo: preseleccionado y el SCOP de siempre');
const otro = await eq.aplicarEquipoInicial({ ...base }, { id: 103 }, async () => ({ ...modelo, id: 999 }));
comprobar(otro.scopHeating === 2.5, 'si llega OTRO modelo, no se aplica su SCOP');
const sinEquipo = await eq.aplicarEquipoInicial({ ...base }, null, async () => modelo);
comprobar(sinEquipo.aerothermiaModel === undefined, 'sin equipo, nada cambia');

console.log(mal ? `\n✗ ${mal} fallos (${ok} bien)` : `\n✓ ${ok}/${ok} comprobaciones de «Calcular una obra con este equipo»`);
process.exit(mal ? 1 : 0);
