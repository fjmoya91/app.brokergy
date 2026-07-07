// ceeExtract — Lógica COMPARTIDA de extracción de datos de un CEE a partir de un fichero
// (.xml/.cex por parseo local exacto, o PDF/imágenes vía OCR con IA en /api/cee-ocr/extract).
//
// La usan:
//   - CeePrevioGate.jsx    (pantalla previa a "Nueva simulación", full-screen)
//   - CeeUploadModal.jsx   (popup compacto reutilizable para rellenar la tabla de emisiones)
//
// Devuelve SIEMPRE un objeto normalizado con la MISMA forma (`emptyCeeData()`), venga de
// XML u OCR, para que los consumidores no tengan que distinguir el origen.

import axios from 'axios';
import { parseCeeXml } from '../calculator/logic/xmlCeeParser';

// Estructura vacía normalizada (contrato único de salida).
export function emptyCeeData() {
  return {
    source: null,
    referencia_catastral: '',
    identificacion: { direccion: '', municipio: '', provincia: '', cp: '', zona_climatica: '' },
    fecha_certificado: '',
    superficie_habitable_m2: '',
    demandas: { calefaccion_kwh_m2_ano: '', refrigeracion_kwh_m2_ano: '' },
    emisiones: { calefaccion: '', acs: '', refrigeracion: '' },
    acs_litros_dia: '',
    servicios: {
      calefaccion: { combustible: '', rendimiento_estacional_pct: '' },
      acs: { combustible: '', rendimiento_estacional_pct: '' },
      refrigeracion: { combustible: '', rendimiento_estacional_pct: '' },
    },
    pdfBase64: null,
  };
}

// Mapea la salida de parseCeeXml a la estructura normalizada.
export function ceeFromXml(xml) {
  const d = emptyCeeData();
  d.source = 'xml';
  d.referencia_catastral = xml?.identificacion?.refCatastral || '';
  d.identificacion = {
    direccion: xml?.identificacion?.direccion || '',
    municipio: xml?.identificacion?.municipio || '',
    provincia: xml?.identificacion?.provincia || '',
    cp: '',
    zona_climatica: xml?.zonaClimatica || '',
  };
  d.fecha_certificado = xml?.fechaFirma || '';
  d.superficie_habitable_m2 = xml?.superficieHabitable ?? '';
  d.demandas = {
    calefaccion_kwh_m2_ano: xml?.demandaCalefaccion ?? '',
    refrigeracion_kwh_m2_ano: xml?.demandaRefrigeracion ?? '',
  };
  d.emisiones = {
    calefaccion: xml?.emisionesCalefaccion ?? '',
    acs: xml?.emisionesACS ?? '',
    refrigeracion: xml?.emisionesRefrigeracion ?? '',
  };
  d.acs_litros_dia = xml?.acsLitrosDia ?? '';
  d.servicios.calefaccion.combustible = xml?.combustibleCalefaccion || '';
  d.servicios.calefaccion.rendimiento_estacional_pct = xml?.rendimientoCalefaccion ?? '';
  d.servicios.acs.combustible = xml?.combustibleACS || '';
  d.servicios.acs.rendimiento_estacional_pct = xml?.rendimientoACS ?? '';
  d.servicios.refrigeracion.combustible = xml?.combustibleRefrigeracion || '';
  d.servicios.refrigeracion.rendimiento_estacional_pct = xml?.rendimientoRefrigeracion ?? '';
  return d;
}

// Mapea la salida del OCR (ya viene en la estructura correcta) rellenando huecos.
export function ceeFromOcr(ocr, pdfBase64) {
  const d = emptyCeeData();
  const merged = {
    ...d,
    ...ocr,
    identificacion: { ...d.identificacion, ...(ocr.identificacion || {}) },
    demandas: { ...d.demandas, ...(ocr.demandas || {}) },
    emisiones: { ...d.emisiones, ...(ocr.emisiones || {}) },
    servicios: {
      calefaccion: { ...d.servicios.calefaccion, ...(ocr.servicios?.calefaccion || {}) },
      acs: { ...d.servicios.acs, ...(ocr.servicios?.acs || {}) },
      refrigeracion: { ...d.servicios.refrigeracion, ...(ocr.servicios?.refrigeracion || {}) },
    },
  };
  merged.source = 'ocr';
  merged.pdfBase64 = pdfBase64 || null;
  const nz = (v) => (v === null || v === undefined ? '' : v);
  merged.referencia_catastral = nz(merged.referencia_catastral);
  merged.superficie_habitable_m2 = nz(merged.superficie_habitable_m2);
  merged.acs_litros_dia = nz(merged.acs_litros_dia);
  ['direccion', 'municipio', 'provincia', 'cp', 'zona_climatica'].forEach((k) => (merged.identificacion[k] = nz(merged.identificacion[k])));
  ['calefaccion_kwh_m2_ano', 'refrigeracion_kwh_m2_ano'].forEach((k) => (merged.demandas[k] = nz(merged.demandas[k])));
  ['calefaccion', 'acs', 'refrigeracion'].forEach((k) => (merged.emisiones[k] = nz(merged.emisiones[k])));
  ['calefaccion', 'acs', 'refrigeracion'].forEach((k) => {
    merged.servicios[k].combustible = nz(merged.servicios[k].combustible);
    merged.servicios[k].rendimiento_estacional_pct = nz(merged.servicios[k].rendimiento_estacional_pct);
  });
  return merged;
}

const readFileAsText = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsText(file);
});

// Extrae los datos del CEE desde una lista de ficheros. Un XML/CEX se parsea localmente
// (exacto); PDF/imágenes se envían al OCR. Callbacks opcionales para reflejar el progreso
// en la UI del consumidor.
//   opts.onStage(stage: 'processing')   — arrancó la lectura
//   opts.onMessage(msg)                 — mensaje de progreso
// Devuelve { data } en éxito o lanza Error con mensaje legible.
export async function extractCeeFromFiles(fileList, opts = {}) {
  const onMessage = opts.onMessage || (() => {});
  const files = Array.from(fileList || []);
  if (files.length === 0) throw new Error('No se ha seleccionado ningún fichero.');

  const xmlFile = files.find((f) => /\.(xml|cex)$/i.test(f.name));

  // Vía XML/CEX: parseo local (exacto). (.cex es un XML zippeado en algunos casos; si
  // parseCeeXml falla, el consumidor puede reintentar con OCR subiendo el PDF.)
  if (xmlFile) {
    onMessage('Leyendo el XML del CEE…');
    const text = await readFileAsText(xmlFile);
    const parsed = parseCeeXml(text);
    return { data: ceeFromXml(parsed) };
  }

  // Vía OCR: PDF o imágenes → /api/cee-ocr/extract
  const ocrFiles = files.filter(
    (f) => f.type === 'application/pdf' || (f.type || '').startsWith('image/') || /\.(pdf|jpe?g|png)$/i.test(f.name)
  );
  if (ocrFiles.length === 0) {
    throw new Error('Sube el .xml del CEE, o su PDF, o fotos (JPG/PNG) del certificado.');
  }
  onMessage(ocrFiles.length > 1 ? 'Uniendo imágenes y leyendo el CEE con IA…' : 'Leyendo el CEE con IA…');
  const form = new FormData();
  ocrFiles.forEach((f) => form.append('files', f));
  const { data: resp } = await axios.post('/api/cee-ocr/extract', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return { data: ceeFromOcr(resp.data || {}, resp.pdfBase64) };
}

// ceeToXmlShape — mapeo INVERSO de emptyCeeData() a la forma que produce parseCeeXml()
// (xmlCeeParser.js): { demandaCalefaccion, demandaACS, demandaRefrigeracion, ...,
// identificacion:{...}, fechaFirma, fechaVisita, combustibleCalefaccion, ... }.
//
// Se usa en CeeModule.jsx (expedientes RES060/RES093, sin reforma) para que un CEE cargado
// por OCR/XML a través del popup unificado rellene `cee_inicial`/`cee_final` EXACTAMENTE
// como si se hubiera subido el .xml real (mismo consumidor: CeeDocumentsGrid, AcsCell...).
//
// OJO: el OCR no extrae la "Demanda ACS" en kWh/m²·año (solo litros/día, acs_litros_dia);
// ese campo queda null — igual que un XML antiguo que no lo tuviera informado.
export function ceeToXmlShape(data) {
  if (!data) return null;
  const num = (v) => { const n = Number(v); return isFinite(n) ? n : null; };
  return {
    demandaCalefaccion: num(data.demandas?.calefaccion_kwh_m2_ano),
    demandaACS: null,
    demandaRefrigeracion: num(data.demandas?.refrigeracion_kwh_m2_ano),
    demandaGlobal: null,
    emisionesCalefaccion: num(data.emisiones?.calefaccion),
    emisionesACS: num(data.emisiones?.acs),
    emisionesRefrigeracion: num(data.emisiones?.refrigeracion),
    superficieHabitable: num(data.superficie_habitable_m2),
    zonaClimatica: data.identificacion?.zona_climatica || null,
    identificacion: {
      nombre: null,
      direccion: data.identificacion?.direccion || null,
      municipio: data.identificacion?.municipio || null,
      provincia: data.identificacion?.provincia || null,
      refCatastral: data.referencia_catastral || null,
    },
    fechaFirma: data.fecha_certificado || null,
    fechaVisita: data.fecha_visita || null,
    combustibleCalefaccion: data.servicios?.calefaccion?.combustible || null,
    combustibleACS: data.servicios?.acs?.combustible || null,
    combustibleRefrigeracion: data.servicios?.refrigeracion?.combustible || null,
    huecos: [],
    opacos: [],
    _fileName: data.source === 'xml' ? null : 'OCR (IA)',
  };
}
