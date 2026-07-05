import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { parseCeeXml } from '../calculator/logic/xmlCeeParser';

/**
 * CeePrevioGate — Pantalla previa a "Nueva simulación" (SOLO ADMIN).
 *
 * Flujo:
 *   gate  → "¿Tienes el CEE anterior?"  [NO → onSkip()]  [SÍ → upload]
 *   upload→ subir .xml (parse local) o PDF/imágenes (OCR vía /api/cee-ocr/extract)
 *   review→ datos extraídos editables → onDone(ceeData) para continuar la simulación
 *
 * Props:
 *   onSkip()          — el usuario NO tiene CEE: simulación normal.
 *   onDone(ceeData)   — datos del CEE listos para arrastrar a la simulación.
 *   onCancel()        — cerrar toda la nueva simulación.
 */

const BRAND = '#FFA000';

// Estructura vacía normalizada
const emptyData = () => ({
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
});

// Mapea la salida de parseCeeXml a la estructura normalizada
function fromXml(xml) {
  const d = emptyData();
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

// Mapea la salida del OCR (ya viene en la estructura correcta) rellenando huecos
function fromOcr(ocr, pdfBase64) {
  const d = emptyData();
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
  // normalizar nulls → '' para inputs controlados
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

// Componentes a nivel de módulo (NO definidos dentro de CeePrevioGate): si se
// definen dentro del cuerpo del componente, React los trata como un tipo nuevo
// en cada render (cada tecla) y REMONTA el <input>, perdiendo el foco tras cada
// carácter. Reciben todo por props, sin depender de closures del padre.
function Shell({ children, onCancel }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div className="text-2xl font-black tracking-tight">
            <span className="text-white">BROKER</span><span style={{ color: BRAND }}>GY</span>
          </div>
          <button onClick={onCancel} className="text-white/40 hover:text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            Cancelar
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, unit, type = 'text', wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <label className="block text-[10px] uppercase tracking-widest text-white/40 mb-1 font-bold">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white/[0.04] border border-white/10 focus:border-amber-500/50 rounded-lg px-3 py-2 text-white text-sm outline-none"
        />
        {unit && <span className="text-white/30 text-xs whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

function ServRow({ label, servicio, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3 items-end">
      <Field label={`${label} — combustible`} value={servicio.combustible} onChange={(v) => onChange('combustible', v)} />
      <Field label={`${label} — rend. estacional`} value={servicio.rendimiento_estacional_pct} onChange={(v) => onChange('rendimiento_estacional_pct', v)} unit="%" type="number" />
    </div>
  );
}

export default function CeePrevioGate({ onSkip, onDone, onCancel }) {
  const [stage, setStage] = useState('gate'); // gate | upload | processing | review
  const [error, setError] = useState(null);
  const [processingMsg, setProcessingMsg] = useState('');
  const [data, setData] = useState(emptyData());
  const [fileNames, setFileNames] = useState([]);
  const [isDragging, setIsDragging] = useState(false);

  const readFileAsText = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });

  const handleFiles = useCallback(async (fileList) => {
    setError(null);
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setFileNames(files.map((f) => f.name));

    const xmlFile = files.find((f) => /\.(xml|cex)$/i.test(f.name));

    // Vía XML: parseo local (exacto)
    if (xmlFile) {
      try {
        setStage('processing');
        setProcessingMsg('Leyendo el XML del CEE…');
        const text = await readFileAsText(xmlFile);
        const parsed = parseCeeXml(text);
        setData(fromXml(parsed));
        setStage('review');
      } catch (e) {
        console.error('[CeePrevio] error XML:', e);
        setError('No se pudo leer el XML. ¿Es un CEE válido? Si no, sube el PDF y usaremos OCR.');
        setStage('upload');
      }
      return;
    }

    // Vía OCR: PDF o imágenes → /api/cee-ocr/extract
    const ocrFiles = files.filter((f) => f.type === 'application/pdf' || (f.type || '').startsWith('image/') || /\.(pdf|jpe?g|png)$/i.test(f.name));
    if (ocrFiles.length === 0) {
      setError('Sube el .xml del CEE, o su PDF, o fotos (JPG/PNG) del certificado.');
      return;
    }
    try {
      setStage('processing');
      setProcessingMsg(ocrFiles.length > 1 ? 'Uniendo imágenes y leyendo el CEE con IA…' : 'Leyendo el CEE con IA…');
      const form = new FormData();
      ocrFiles.forEach((f) => form.append('files', f));
      const { data: resp } = await axios.post('/api/cee-ocr/extract', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setData(fromOcr(resp.data || {}, resp.pdfBase64));
      setStage('review');
    } catch (e) {
      const msg = e?.response?.data?.error || e.message || 'Error desconocido';
      console.error('[CeePrevio] error OCR:', msg);
      setError('La lectura automática falló: ' + msg);
      setStage('upload');
    }
  }, []);

  // ── Helpers de edición del formulario de revisión ──
  const setTop = (k, v) => setData((d) => ({ ...d, [k]: v }));
  const setNested = (group, k, v) => setData((d) => ({ ...d, [group]: { ...d[group], [k]: v } }));
  const setServ = (s, k, v) => setData((d) => ({ ...d, servicios: { ...d.servicios, [s]: { ...d.servicios[s], [k]: v } } }));

  // ── Pantalla 1: gate ──
  if (stage === 'gate') {
    return (
      <Shell onCancel={onCancel}>
        <div className="text-center mt-6 mb-10 animate-slide-down">
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            <span className="text-white">Nueva </span><span className="text-gradient">simulación</span>
          </h1>
          <p className="text-white/50 text-lg">Antes de empezar…</p>
        </div>
        <div className="bg-white/[0.03] border border-white/10 rounded-3xl p-8 md:p-12 text-center animate-fade-in">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">¿Tienes el Certificado de<br />Eficiencia Energética anterior?</h2>
          <p className="text-white/40 text-sm mb-10 uppercase tracking-widest">Si lo tienes, usaremos sus datos reales para la simulación</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onSkip}
              className="px-10 py-5 rounded-2xl border-2 border-white/15 text-white/80 hover:border-white/30 hover:text-white font-bold text-lg transition-all"
            >
              No, seguir sin CEE
            </button>
            <button
              onClick={() => { setError(null); setStage('upload'); }}
              className="px-10 py-5 rounded-2xl font-bold text-lg text-black transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: BRAND }}
            >
              Sí, cargar el CEE →
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Pantalla 2: upload ──
  if (stage === 'upload') {
    return (
      <Shell onCancel={onCancel}>
        <div className="text-center mt-6 mb-8">
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-3">
            <span className="text-white">Cargar </span><span className="text-gradient">CEE anterior</span>
          </h1>
          <p className="text-white/50">Sube el <b className="text-white/80">.xml</b> del certificado (exacto), o su <b className="text-white/80">PDF</b> / <b className="text-white/80">fotos</b> y lo leemos con IA.</p>
        </div>

        {error && <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">{error}</div>}

        <label
          className={`block cursor-pointer rounded-3xl p-12 text-center transition-all border-2 border-dashed ${
            isDragging
              ? 'border-amber-400 bg-amber-500/10 scale-[1.02] shadow-[0_0_40px_-8px_rgba(255,160,0,0.5)]'
              : 'border-white/15 bg-white/[0.03] hover:border-amber-500/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); if (!isDragging) setIsDragging(true); }}
          onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files); }}
        >
          <input
            type="file"
            multiple
            accept="application/pdf,image/*,.xml,.cex"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex flex-col items-center gap-3 pointer-events-none">
            <svg className={`w-14 h-14 transition-all ${isDragging ? 'text-amber-400 -translate-y-1 animate-bounce' : 'text-amber-500/70'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
            <div className="text-white font-bold text-lg">{isDragging ? 'Suelta para subir' : 'Arrastra aquí o haz clic para elegir'}</div>
            <div className="text-white/40 text-sm">.xml · .cex · PDF · JPG/PNG (varias fotos se unen en un PDF)</div>
          </div>
        </label>

        {fileNames.length > 0 && (
          <div className="mt-4 text-white/50 text-xs">Seleccionados: {fileNames.join(', ')}</div>
        )}

        <div className="mt-8 flex justify-between">
          <button onClick={() => { setError(null); setStage('gate'); }} className="text-white/40 hover:text-white text-sm font-bold uppercase tracking-widest">← Atrás</button>
          <button onClick={onSkip} className="text-white/40 hover:text-white text-sm font-bold uppercase tracking-widest">Seguir sin CEE →</button>
        </div>
      </Shell>
    );
  }

  // ── Pantalla intermedia: processing ──
  if (stage === 'processing') {
    return (
      <Shell onCancel={onCancel}>
        <div className="flex flex-col items-center justify-center mt-20 gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 border-4 border-amber-500/15 rounded-full" />
            <div className="absolute inset-0 border-4 border-transparent border-t-amber-500 rounded-full animate-spin" />
            <svg className="absolute inset-0 m-auto w-7 h-7 text-amber-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          </div>
          <div className="text-white/70 font-bold tracking-widest text-sm uppercase animate-pulse">{processingMsg || 'Procesando…'}</div>
          {fileNames.length > 0 && (
            <div className="w-full max-w-md space-y-2">
              {fileNames.map((n, i) => (
                <div key={i} className="bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5">
                  <div className="flex items-center justify-between text-xs text-white/70 mb-1.5">
                    <span className="truncate flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                      {n}
                    </span>
                    <span className="text-amber-400 font-bold">subiendo…</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full w-1/3 rounded-full bg-amber-400 animate-[ceeUpload_1.1s_ease-in-out_infinite]" style={{ animationName: 'ceeUpload' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <style>{`@keyframes ceeUpload { 0% { transform: translateX(-120%); } 100% { transform: translateX(320%); } }`}</style>
      </Shell>
    );
  }

  // ── Pantalla 3: review (editable) ──
  return (
    <Shell onCancel={onCancel}>
      <div className="text-center mt-4 mb-6">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-2">
          <span className="text-white">Datos del </span><span className="text-gradient">CEE</span>
        </h1>
        <p className="text-white/50 text-sm">
          Revisa y corrige si hace falta.{' '}
          <span className="inline-flex items-center gap-1 text-white/60">
            Origen:&nbsp;<b className="text-amber-400">{data.source === 'xml' ? 'XML (exacto)' : 'OCR (IA)'}</b>
          </span>
        </p>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 space-y-6">
        <div>
          <div className="text-amber-400/80 text-xs font-bold uppercase tracking-widest mb-3">Identificación</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Referencia catastral" value={data.referencia_catastral} onChange={(v) => setTop('referencia_catastral', v)} wide />
            <Field label="Dirección" value={data.identificacion.direccion} onChange={(v) => setNested('identificacion', 'direccion', v)} wide />
            <Field label="Municipio" value={data.identificacion.municipio} onChange={(v) => setNested('identificacion', 'municipio', v)} />
            <Field label="Provincia" value={data.identificacion.provincia} onChange={(v) => setNested('identificacion', 'provincia', v)} />
            <Field label="Código postal" value={data.identificacion.cp} onChange={(v) => setNested('identificacion', 'cp', v)} />
            <Field label="Zona climática" value={data.identificacion.zona_climatica} onChange={(v) => setNested('identificacion', 'zona_climatica', v)} />
            <Field label="Superficie habitable" value={data.superficie_habitable_m2} onChange={(v) => setTop('superficie_habitable_m2', v)} unit="m²" type="number" />
            <Field label="ACS (litros/día)" value={data.acs_litros_dia} onChange={(v) => setTop('acs_litros_dia', v)} unit="l/día" type="number" />
          </div>
        </div>

        <div>
          <div className="text-amber-400/80 text-xs font-bold uppercase tracking-widest mb-3">Demandas y emisiones</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Demanda calefacción" value={data.demandas.calefaccion_kwh_m2_ano} onChange={(v) => setNested('demandas', 'calefaccion_kwh_m2_ano', v)} unit="kWh/m²·año" type="number" />
            <Field label="Demanda refrigeración" value={data.demandas.refrigeracion_kwh_m2_ano} onChange={(v) => setNested('demandas', 'refrigeracion_kwh_m2_ano', v)} unit="kWh/m²·año" type="number" />
            <Field label="Emisiones calefacción" value={data.emisiones.calefaccion} onChange={(v) => setNested('emisiones', 'calefaccion', v)} unit="kgCO₂/m²·año" type="number" />
            <Field label="Emisiones ACS" value={data.emisiones.acs} onChange={(v) => setNested('emisiones', 'acs', v)} unit="kgCO₂/m²·año" type="number" />
            <Field label="Emisiones refrigeración" value={data.emisiones.refrigeracion} onChange={(v) => setNested('emisiones', 'refrigeracion', v)} unit="kgCO₂/m²·año" type="number" />
          </div>
        </div>

        <div>
          <div className="text-amber-400/80 text-xs font-bold uppercase tracking-widest mb-3">Instalaciones (combustible + rendimiento estacional)</div>
          <div className="space-y-3">
            <ServRow label="Calefacción" servicio={data.servicios.calefaccion} onChange={(field, v) => setServ('calefaccion', field, v)} />
            <ServRow label="ACS" servicio={data.servicios.acs} onChange={(field, v) => setServ('acs', field, v)} />
            <ServRow label="Refrigeración" servicio={data.servicios.refrigeracion} onChange={(field, v) => setServ('refrigeracion', field, v)} />
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-between">
        <button onClick={() => { setError(null); setStage('upload'); }} className="px-5 py-3 rounded-xl border border-white/15 text-white/70 hover:text-white text-sm font-bold uppercase tracking-widest">← Cargar otro</button>
        <button
          onClick={() => onDone(data)}
          className="px-8 py-3 rounded-xl font-bold text-black text-sm uppercase tracking-widest transition-transform hover:scale-[1.02]"
          style={{ backgroundColor: BRAND }}
        >
          Continuar con estos datos →
        </button>
      </div>
    </Shell>
  );
}
