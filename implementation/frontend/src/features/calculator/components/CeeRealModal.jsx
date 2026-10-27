import React, { useEffect, useState } from 'react';
import { extractCeeFromFiles } from '../../cee/ceeExtract';
import { CSS as CSS_FX, DialogoFx, AvisoFx, Ico } from '../../facturacion/estilo';

/**
 * CeeRealModal — el «Cálculo real» de un RES080 (reforma): UN popup con los DOS certificados.
 *
 * REGLA (2026-10-27, Fran, 26RES080_OP86): en reforma ya no hay dos pestañas («Cálculo real
 * (CEE)» por .xml y «CEE aportado» por emisiones). Hay una, «Cálculo real», que abre este
 * popup: se sube el CEE INICIAL y, si lo hay, el FINAL (.xml, .cex, PDF o fotos), y del
 * inicial se dice de quién es — el que APORTA el cliente o el NUESTRO. Con los dos .xml el
 * ahorro es la energía final que declara cada certificado (calculation.js, `calculateRes080`
 * con `metodoForzado: 'energia_final'`); con un PDF/foto (OCR, que no trae la energía final)
 * se cae a la tabla de emisiones, y sin final, el FINAL se estima con la aerotermia.
 * Lo que se haga con ello lo decide `ceeSeed.seedCalculoRealReforma`.
 *
 * Diseño: el de las ventanas de Facturación (`.fx-`, estilo «carta de pago»), por petición de
 * Fran el 27/10/2026. Se monta su CSS aquí porque la calculadora no lo carga.
 *
 * Props:
 *   isOpen, onClose
 *   inicial, final          — CEE normalizados ya cargados (forma de emptyCeeData) o null
 *   propio                  — el inicial ya cargado es nuestro (`ceeEsPropio`)
 *   onConfirm({ inicial, final, propio, cambiadoInicial, cambiadoFinal })
 */
const vacio = { data: null, cambiado: false, files: [], error: null, leyendo: false, msg: '' };

const tieneEnergiaFinal = (d) => !!(d?.energia_final_vectores && Object.keys(d.energia_final_vectores).length);
const fmt = (v) => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : '—';
};

// Lo propio de este popup: los dos huecos y el ancho (el diálogo de Facturación mide 480 px).
const CSS_CR = `
.fx-dialogo:has(.cr-cuerpo){max-width:760px}
.cr-huecos{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@media (min-width:640px){.cr-huecos{grid-template-columns:repeat(2,minmax(0,1fr))}}
.cr-hueco{display:flex;flex-direction:column;gap:10px;min-width:0}
.cr-zona{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:168px;padding:18px 16px;
  border-radius:20px;border:1.5px dashed var(--linea2);background:#fff;text-align:center;cursor:pointer;transition:border-color .15s,background-color .15s,box-shadow .15s}
.cr-zona:hover{border-color:rgba(20,17,17,.32)}
.cr-zona:focus-within{border-color:var(--tinta);box-shadow:0 0 0 4px rgba(255,160,0,.22)}
.cr-zona.cr-encima{border-color:var(--naranja);background:#fffaf0}
.cr-zona.cr-lleno{border-style:solid;border-color:var(--linea);box-shadow:var(--sombra-baja);align-items:stretch;text-align:left;cursor:default}
.cr-zona-t{font:700 15px/1.3 var(--texto);color:var(--tinta)}
.cr-zona-s{font-size:12.5px;color:var(--gris2)}
.cr-cab{display:flex;align-items:center;justify-content:space-between;gap:8px}
.cr-fich{font:500 12px/1.35 var(--mono);color:var(--gris);overflow-wrap:anywhere}
.cr-datos{margin:4px 0 0;padding:0;border-top:1px solid var(--linea)}
.cr-datos .fx-fila{padding:8px 0;font-size:13.5px}
.cr-acc{display:flex;gap:8px;flex-wrap:wrap}
.cr-seg{width:100%;grid-auto-columns:1fr}
.cr-seg button{white-space:normal;line-height:1.2;text-align:center}
.cr-leyendo{display:grid;justify-items:center;gap:10px;color:var(--gris);font-size:13px;font-weight:600}
`;

function Hueco({ id, titulo, estado, onFiles, onQuitar, nota }) {
  const [encima, setEncima] = useState(false);
  const d = estado.data;
  const input = (
    <input id={id} type="file" multiple accept="application/pdf,image/*,.xml,.cex" className="fx-sr"
      onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
  );
  const soltar = {
    onDragOver: (e) => { e.preventDefault(); if (!encima) setEncima(true); },
    onDragLeave: (e) => { e.preventDefault(); setEncima(false); },
    onDrop: (e) => { e.preventDefault(); setEncima(false); onFiles(e.dataTransfer.files); },
  };
  return (
    <section className="cr-hueco" aria-labelledby={`${id}-t`}>
      <div className="cr-cab">
        <span id={`${id}-t`} className="fx-sec-tit" style={{ margin: 0 }}>{titulo}</span>
        {d && !estado.leyendo && (
          <span className={`fx-chip ${tieneEnergiaFinal(d) ? 'fx-chip-ok' : 'fx-chip-ambar'}`}>
            {tieneEnergiaFinal(d) ? 'Energía final' : 'Por emisiones'}
          </span>
        )}
      </div>

      {estado.leyendo ? (
        <div className="cr-zona">
          <div className="cr-leyendo" role="status">
            <Ico n="reintentar" size={26} className="fx-spin" />
            {estado.msg || 'Leyendo el certificado…'}
          </div>
        </div>
      ) : d ? (
        <div className="cr-zona cr-lleno" {...soltar}>
          <div className="fx-pildora" style={{ alignSelf: 'flex-start' }}>
            {d.source === 'xml' ? '.xml' : 'PDF / foto · OCR'}
          </div>
          {estado.files?.length > 0 && <div className="cr-fich">{estado.files.join(' · ')}</div>}
          <dl className="cr-datos">
            <div className="fx-fila"><dt>Superficie</dt><dd className="fx-num">{fmt(d.superficie_habitable_m2)} m²</dd></div>
            <div className="fx-fila"><dt>Demanda de calefacción</dt><dd className="fx-num">{fmt(d.demandas?.calefaccion_kwh_m2_ano)} kWh/m²·año</dd></div>
          </dl>
          <div className="cr-acc">
            <label htmlFor={id} className="fx-btn fx-btn-sec fx-btn-peq" style={{ cursor: 'pointer' }}>
              <Ico n="reintentar" size={16} />Cambiar
            </label>
            {onQuitar && (
              <button type="button" className="fx-btn fx-btn-peq" onClick={onQuitar}>
                <Ico n="borrar" size={16} />Quitar
              </button>
            )}
          </div>
          {input}
        </div>
      ) : (
        <label htmlFor={id} className={`cr-zona ${encima ? 'cr-encima' : ''}`} {...soltar}>
          <span className="fx-tile fx-tile-l fx-tile-naranja"><Ico n="leer" size={24} /></span>
          <span className="cr-zona-t">{encima ? 'Suelta para subir' : 'Arrastra aquí o pulsa'}</span>
          <span className="cr-zona-s">.xml · .cex · PDF · JPG/PNG</span>
          {input}
        </label>
      )}
      {estado.error && <AvisoFx tono="ambar">{estado.error}</AvisoFx>}
      {nota}
    </section>
  );
}

export default function CeeRealModal({ isOpen, onClose, inicial = null, final = null, propio = false, onConfirm }) {
  const [ini, setIni] = useState(vacio);
  const [fin, setFin] = useState(vacio);
  const [esPropio, setEsPropio] = useState(propio);

  // Cada vez que se abre, parte de lo que ya tiene la simulación.
  useEffect(() => {
    if (!isOpen) return;
    setIni({ ...vacio, data: inicial });
    setFin({ ...vacio, data: final });
    setEsPropio(!!propio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const leer = (set) => async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    set(s => ({ ...s, leyendo: true, error: null, msg: '' }));
    try {
      const { data } = await extractCeeFromFiles(files, { onMessage: (m) => set(s => ({ ...s, msg: m })) });
      set({ ...vacio, data, cambiado: true, files: files.map(f => f.name) });
    } catch (e) {
      const m = e?.response?.data?.error || e?.message || 'Error desconocido';
      set(s => ({ ...s, leyendo: false, error: <><b>No se ha podido leer.</b> {m}. Si el .xml falla, prueba con el PDF.</> }));
    }
  };

  const leyendo = ini.leyendo || fin.leyendo;
  const conDos = !!(ini.data && fin.data);
  const porEnergiaFinal = conDos && tieneEnergiaFinal(ini.data) && tieneEnergiaFinal(fin.data);

  return (
    <DialogoFx
      antetitulo="Reforma · RES080"
      titulo="Cálculo real"
      onClose={onClose}
      ocupado={leyendo}
      pie={<>
        <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={leyendo}>Cancelar</button>
        <button type="button" className="fx-btn fx-btn-pri" disabled={leyendo || !ini.data}
          onClick={() => onConfirm?.({
            inicial: ini.data, final: fin.data, propio: esPropio,
            cambiadoInicial: ini.cambiado, cambiadoFinal: fin.cambiado,
          })}>
          <Ico n="check" size={18} />Calcular
        </button>
      </>}
    >
      <style>{CSS_FX}{CSS_CR}</style>
      <div className="cr-cuerpo">
        <p className="fx-sub" style={{ marginTop: 0 }}>
          Sube los dos certificados. El ahorro es la <b>energía final que declara cada uno</b>: la del inicial menos la del final.
        </p>
      </div>

      <div className="cr-huecos">
        <Hueco id="cr-inicial" titulo="CEE inicial" estado={ini} onFiles={leer(setIni)}
          onQuitar={() => setIni({ ...vacio, cambiado: true })}
          nota={
            <div className="fx-campo">
              <span>¿De quién es?</span>
              <div className="fx-seg cr-seg" role="group" aria-label="Origen del CEE inicial">
                <button type="button" aria-pressed={!esPropio} onClick={() => setEsPropio(false)}>Del cliente</button>
                <button type="button" aria-pressed={esPropio} onClick={() => setEsPropio(true)}>Nuestro</button>
              </div>
            </div>
          } />
        <Hueco id="cr-final" titulo="CEE final · previsto o real" estado={fin} onFiles={leer(setFin)}
          onQuitar={() => setFin({ ...vacio, cambiado: true })}
          nota={!fin.data && !fin.leyendo && (
            <p className="fx-kpi-nota" style={{ margin: 0 }}>Opcional. Sin él, el final se estima con la aerotermia (demanda / SCOP).</p>
          )} />
      </div>

      {ini.data && (
        porEnergiaFinal ? (
          <AvisoFx tono="ok">
            <b>Por energía final.</b> Los dos declaran su energía final por vector: el ahorro es la diferencia de sus kWh, sin dividir emisiones ni elegir combustibles.
          </AvisoFx>
        ) : conDos ? (
          <AvisoFx tono="ambar">
            <b>Por emisiones.</b> Uno de los dos no trae la energía final (un PDF o una foto no la imprime). Sube el <b>.xml</b> de los dos para que sea exacto.
          </AvisoFx>
        ) : (
          <AvisoFx tono="crema">
            <b>Sin CEE final.</b> Se abre la tabla de emisiones con el inicial real y el final estimado. Cuando tengas el final, cárgalo aquí.
          </AvisoFx>
        )
      )}
    </DialogoFx>
  );
}
