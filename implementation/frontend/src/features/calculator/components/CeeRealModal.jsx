import React, { useEffect, useState } from 'react';
import { extractCeeFromFiles, ceeToXmlShape } from '../../cee/ceeExtract';
import { calculateRes080SimplificadoFromXml } from '../logic/calculation';
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
const fmt = (v, dec = 2) => {
  const n = Number(v);
  return isFinite(n) && n > 0 ? n.toLocaleString('es-ES', { minimumFractionDigits: dec === 0 ? 0 : undefined, maximumFractionDigits: dec }) : '—';
};
// Σ de la energía final que declara el certificado (kWh/m²·año), todos los vectores.
const energiaFinalM2 = (d) => tieneEnergiaFinal(d)
  ? Object.values(d.energia_final_vectores).reduce((a, v) => a + (Number(v.global) || 0), 0)
  : null;
const fechaCorta = (f) => {
  const m = String(f || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (f || '—');
};

// El ahorro que va a salir al pulsar «Calcular», con la MISMA función que la calculadora
// (calculateRes080 → calculateRes080SimplificadoFromXml, superficie = la del inicial, que
// es la que siembra `seedCalculoRealReforma`). No es una estimación aparte: es la cifra.
function ahorroPrevisto(ini, fin) {
  if (!ini || !fin) return null;
  const sup = Number(ini.superficie_habitable_m2) || undefined;
  const r = calculateRes080SimplificadoFromXml({
    xmlInicial: ceeToXmlShape(ini), xmlFinal: ceeToXmlShape(fin), superficieCustom: sup,
  });
  return r && isFinite(r.ahorroEnergiaFinalTotal) ? r : null;
}

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
.cr-datos dd small{font-size:11px;font-weight:500;color:var(--gris2)}
.cr-letra{display:inline-grid;place-items:center;min-width:22px;height:22px;margin-left:8px;padding:0 6px;border-radius:7px;background:var(--tinta);color:#fff;font:700 13px/1 var(--display)}
.cr-res{border-radius:24px;background:#fff;border:1px solid var(--linea);box-shadow:var(--sombra-baja);padding:20px 20px 8px;margin-top:4px}
.cr-res-cab{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:6px 16px}
.cr-res-cifra{font:700 44px/1 var(--display);color:var(--tinta);letter-spacing:-.01em}
.cr-res-cifra small{font:600 15px/1 var(--texto);color:var(--gris);margin-left:6px;letter-spacing:0}
.cr-res-sub{font-size:13px;color:var(--gris)}
.cr-res-filete{height:3px;border-radius:3px;margin:14px 0 4px;background:linear-gradient(90deg,var(--naranja),var(--verde))}
.cr-tabla{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.cr-tabla th{padding:10px 6px 6px;text-align:right;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--gris)}
.cr-tabla th:first-child,.cr-tabla td:first-child{text-align:left;padding-left:0}
.cr-tabla td{padding:8px 6px;text-align:right;border-top:1px solid var(--linea);white-space:nowrap}
.cr-tabla td:first-child{white-space:normal;color:var(--tinta);font-weight:600}
.cr-tabla td:last-child,.cr-tabla th:last-child{padding-right:0}
.cr-tabla tr.cr-tot td{font-weight:700;color:var(--tinta)}
.cr-tabla tr.cr-ano td{font-weight:800;color:var(--tinta);background:#fcfbf8}
.cr-menos{color:#3f7d20}
.cr-mas{color:#a45f00}
.cr-fict{display:block;font-size:11px;font-weight:500;color:var(--gris2)}
@media (max-width:420px){.cr-tabla{font-size:12px}.cr-res{padding:16px 14px 6px}.cr-res-cifra{font-size:38px}}
`;

// El ahorro de un vector, con su signo: la aerotermia SUBE la electricidad, y eso se ve.
const Dif = ({ v }) => {
  const n = Math.round(Number(v) * 100) / 100;
  if (!isFinite(n) || n === 0) return <td>0</td>;
  const t = Math.abs(n).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  return <td className={n > 0 ? 'cr-menos' : 'cr-mas'}>{n > 0 ? t : `−${t}`}</td>;
};

// El AHORRO que sale al pulsar «Calcular», con todo su desglose: cada vector de la energía
// final (kWh/m²·año) en el inicial y el final, los totales y el total del año (× m²).
function Resultado({ ini, fin }) {
  const r = ahorroPrevisto(ini, fin);
  if (!r) return null;
  const porEF = r.fuenteDatos === 'energia_final_declarada';
  const vIni = r.vectores?.inicial || [];
  const vFin = r.vectores?.final || [];
  const nombres = [...new Set([...vIni, ...vFin].map(v => v.nombre))];
  const de = (lista, n) => Number(lista.find(v => v.nombre === n)?.global) || 0;
  const cero = (v) => (Number(v) === 0 ? '0' : fmt(v));
  // El vector que pone CE3X por su SISTEMA POR DEFECTO (la demanda que ningún generador
  // cubre) se nombra como tal: cuenta en la energía final, pero no es un equipo de la casa.
  const ficticios = String(r.details?.otros?.fuelIni || '').split(' + ')
    .filter(p => /ficticio/i.test(p)).map(p => p.toLowerCase());
  const esFicticio = (n) => ficticios.some(p => p.startsWith(String(n).toLowerCase()));
  const filasEmi = !porEF ? [
    ['Consumo eléctrico', r.details?.electrico],
    [r.details?.otros?.fuelIni && r.details.otros.fuelIni !== '—' ? r.details.otros.fuelIni : 'Otros combustibles', r.details?.otros],
  ] : [];
  return (
    <section className="cr-res" aria-label="Ahorro de energía final">
      <span className="fx-sec-tit" style={{ margin: 0 }}>Ahorro de energía final</span>
      <div className="cr-res-cab">
        <div className="cr-res-cifra">{fmt(r.ahorroEnergiaFinalTotal / 1000, 2)}<small>MWh/año</small></div>
        <div className="cr-res-sub">
          {fmt(r.ahorroM2)} kWh/m²·año × {fmt(r.superficieInicialAplicada)} m²
        </div>
      </div>
      <div className="cr-res-filete" />
      <table className="cr-tabla">
        <thead>
          <tr><th>{porEF ? 'Vector' : 'Por emisiones'}</th><th>Inicial</th><th>Final</th><th>Ahorro</th></tr>
        </thead>
        <tbody>
          {porEF ? nombres.map(n => (
            <tr key={n}>
              <td>{n}{esFicticio(n) && <small className="cr-fict">sistema por defecto de CE3X</small>}</td>
              <td>{cero(de(vIni, n))}</td><td>{cero(de(vFin, n))}</td>
              <Dif v={de(vIni, n) - de(vFin, n)} />
            </tr>
          )) : filasEmi.map(([n, x]) => (
            <tr key={n}>
              <td>{n}</td><td>{cero(x?.energyIni)}</td><td>{cero(x?.energyFin)}</td>
              <Dif v={(x?.energyIni || 0) - (x?.energyFin || 0)} />
            </tr>
          ))}
          <tr className="cr-tot">
            <td>Total <small style={{ fontWeight: 500, color: 'var(--gris2)' }}>kWh/m²·año</small></td>
            <td>{fmt(r.totalEnergiaInicialM2)}</td><td>{fmt(r.totalEnergiaFinalM2)}</td>
            <td className="cr-menos">{fmt(r.ahorroM2)}</td>
          </tr>
          <tr className="cr-ano">
            <td>Al año <small style={{ fontWeight: 500, color: 'var(--gris2)' }}>kWh</small></td>
            <td>{fmt(r.totalEnergiaInicialAno, 0)}</td><td>{fmt(r.totalEnergiaFinalAno, 0)}</td>
            <td className="cr-menos">{fmt(r.ahorroEnergiaFinalTotal, 0)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

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
            <div className="fx-fila"><dt>Demanda calefacción</dt><dd className="fx-num">{fmt(d.demandas?.calefaccion_kwh_m2_ano)} <small>kWh/m²·año</small></dd></div>
            <div className="fx-fila"><dt>Demanda ACS</dt><dd className="fx-num">{fmt(d.demandas?.acs_kwh_m2_ano)} <small>kWh/m²·año</small></dd></div>
            <div className="fx-fila"><dt>Energía final</dt><dd className="fx-num">{fmt(energiaFinalM2(d))} <small>kWh/m²·año</small></dd></div>
            <div className="fx-fila">
              <dt>E. primaria no renovable</dt>
              <dd className="fx-num">
                {fmt(d.energia_primaria_no_renovable?.consumo_global_kwh_m2_ano)} <small>kWh/m²·año</small>
                {d.energia_primaria_no_renovable?.calificacion_global && (
                  <span className="cr-letra">{d.energia_primaria_no_renovable.calificacion_global}</span>
                )}
              </dd>
            </div>
            <div className="fx-fila"><dt>Fecha · zona</dt><dd>{fechaCorta(d.fecha_certificado)} · {d.identificacion?.zona_climatica || '—'}</dd></div>
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

      {conDos && !ini.leyendo && !fin.leyendo && <Resultado ini={ini.data} fin={fin.data} />}

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
