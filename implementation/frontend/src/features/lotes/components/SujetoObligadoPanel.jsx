import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
    CSS as CSS_FX, Ico, AvisoFx, ErrorApi, errorDeApi, DialogoFx, useToastFx, eur,
} from '../../facturacion/estilo';
import {
    computeVistaSo, aniosElegibles, normalizarObligacion, PCT_FONDO_DEFECTO,
} from '../logic/obligacionSo';
import { EQUIVALENCIA_FINANCIERA } from '../logic/loteEco';

// ─────────────────────────────────────────────────────────────────────────────
// «Vista S.O.»: la pestaña Lotes mirada como la mira el Sujeto Obligado. Cuánto
// tiene que cubrir este año, cuánto ya tiene (de otros y nuestro, por etapas),
// cuánto le falta y cuánto de eso le podemos llevar con lo que hay sin lotear.
// Las cuentas: logic/obligacionSo.js. Ver docs/conocimiento/lotes/la-vista-del-sujeto-obligado.md.
//
// Estilo de la pestaña Facturación (regla 164, Fran 28/10/2026: «que se parezca a
// Facturación»): monta el CSS `.fx-` de facturacion/estilo.jsx y añade lo suyo con
// prefijo `.so-`. Nada de Tailwind dentro de `.fx`.
// ─────────────────────────────────────────────────────────────────────────────

const num = (n, d = 2) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const gwh = (n, d = 2) => `${num(n, d)} GWh`;
const mwh = (kwh) => `${Math.round((Number(kwh) || 0) / 1000).toLocaleString('es-ES')} MWh`;
const pct = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`;
const presName = (p) => p ? (p.acronimo || p.razon_social || '—') : '—';

// Las etapas son ORDINALES (de más cerca a más lejos del CAE): un solo tono, de
// oscuro a claro. El mismo color en la barra, la leyenda y las columnas.
const COLOR = {
    OTROS: '#8fa0b3',
    EMITIDO: '#466510', MINISTERIO: '#7b9a1c', VERIFICACION: '#b1d13e', PREPARACION: '#dce8a4',
};
// Lo disponible, también ordinal: el naranja del embudo de Facturación.
const COLOR_OFERTA = { LISTO: 'var(--o4)', CERRANDO: 'var(--o3)', OBRA: 'var(--o2)', ANTES: 'var(--o1)' };
const FUENTE = {
    EMITIDO: 'CAE de la resolución', FACTURA: 'de nuestra factura', VERIFICADO: 'verificado', ESTIMADO: 'estimado',
};
const chipEstado = (l) => (l.requerimiento ? 'fx-chip-ambar'
    : l.etapa === 'EMITIDO' ? 'fx-chip-ok'
        : l.etapa === 'MINISTERIO' ? 'fx-chip-pizarra' : 'fx-chip-gris');

const CSS_SO = `
.so-dash{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@container fx (min-width:1080px){.so-dash{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}}
/* .fx-hero y .fx-kpis traen el grid-area del cuadro de Facturación: aquí van en orden */
.so-dash > .fx-hero,.so-dash > .fx-kpis{grid-area:auto}
.so-kpi .fx-kpi-v{overflow:visible;line-height:1.08}
.so-hero .fx-hero-v{display:flex;align-items:baseline;gap:8px}
.so-hero .fx-hero-v small{font-size:.36em}
.so-hero .fx-mark{font-weight:700}
.so-asegurado{margin-top:16px}
.so-asegurado-top{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--gris)}
.so-asegurado-top b{color:var(--tinta);font-variant-numeric:tabular-nums}
.so-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
@container fx (min-width:700px){.so-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
.so-kpi{cursor:default;min-height:118px}
.so-kpi:hover{border-color:var(--linea)}
.so-kpi:active{transform:none}
.so-kpi-marca{border-color:rgba(255,160,0,.45);box-shadow:0 0 0 3px rgba(255,160,0,.10)}
.so-kpi-marca .fx-kpi-k{color:var(--naranja-txt)}

.so-barra{display:flex;height:38px;margin-top:16px;border-radius:12px;overflow:hidden;background:var(--hundido);border:1px solid var(--linea)}
.so-barra > i{display:block;flex:none;height:100%;background:var(--c);border-right:2px solid #fff;transform-origin:left;animation:fx-ancho .7s cubic-bezier(.2,.8,.2,1) both}
.so-barra > i:last-child{border-right:0}
.so-fondo{background:repeating-linear-gradient(45deg,#e6e1d8 0 5px,#d4cdc1 5px 10px)!important}
.so-falta{display:grid!important;place-items:center;overflow:hidden;white-space:nowrap;font:800 11.5px/1 var(--texto);font-style:normal;color:var(--vence-txt);background:repeating-linear-gradient(45deg,#fff3dc 0 6px,#ffe7bd 6px 12px)!important}
.so-ley .fx-dot.so-fondo{background:repeating-linear-gradient(45deg,#e6e1d8 0 2px,#c9c1b4 2px 4px)!important}
.so-ley .fx-dot.so-falta{background:#ffe2a3!important;box-shadow:inset 0 0 0 1px var(--vence-borde)}
.so-escala{display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--gris2);font-variant-numeric:tabular-nums}

.so-seccion{margin-top:30px}
.so-seccion-cab{display:flex;align-items:flex-end;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;margin:0 2px 12px}
.so-seccion-cab p{margin:4px 0 0;font-size:13.5px;color:var(--gris);line-height:1.45}
.so-etapas{display:grid;gap:14px;grid-template-columns:minmax(0,1fr)}
@container fx (min-width:760px){.so-etapas{grid-template-columns:repeat(2,minmax(0,1fr))}}
@container fx (min-width:1320px){.so-etapas{grid-template-columns:repeat(4,minmax(0,1fr))}}
.so-etapa-k{display:flex;align-items:center;gap:8px}
.so-etapa-v{font-size:36px;line-height:1;margin-top:10px}
.so-etapa-v small{font-size:.45em;margin-left:4px}
.so-etapa-n{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:8px;font-size:12.5px;color:var(--gris)}
.so-lotes{list-style:none;margin:14px -8px 0;padding:0;border-top:1px solid var(--linea)}
.so-lote{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;align-items:center;padding:10px 8px;border-bottom:1px solid var(--linea);cursor:pointer;transition:background-color .15s}
.so-lote:last-child{border-bottom:0}
.so-lote:hover{background:#fcfbf8}
.so-lote:focus-visible{outline:3px solid var(--tinta);outline-offset:-3px;border-radius:10px}
.so-lote-cod{min-width:0;font:600 13px/1.2 var(--mono);color:var(--tinta);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.so-lote-mwh{font-weight:700;font-size:14px;font-variant-numeric:tabular-nums;white-space:nowrap}
.so-lote-pie{grid-column:1/-1;display:flex;align-items:center;gap:8px;min-width:0}
.so-lote-pie .fx-chip{flex:0 1 auto;min-width:0}
.so-fuente{flex:none;font-size:12px;color:var(--gris2);white-space:nowrap}
.so-anio{margin-left:auto;flex:none;width:auto;min-height:32px;padding:0 28px 0 10px;border-radius:10px;font-size:12.5px;font-weight:600;background-position:right 9px center;background-size:12px}
.so-anio-txt{margin-left:auto;flex:none;font-size:12px;color:var(--gris)}
@media (pointer:coarse){.so-anio{min-height:44px}}
.so-vacio{padding:14px 0 2px;font-size:13px;color:var(--gris2)}
.so-fuera{margin-top:14px}

.so-of{list-style:none;margin:14px -8px 0;padding:0;border-top:1px solid var(--linea)}
.so-of > li{border-bottom:1px solid var(--linea)}
.so-of > li:last-child{border-bottom:0}
.so-of-btn{appearance:none;width:100%;background:none;border:0;cursor:pointer;text-align:left;font:inherit;color:inherit;border-radius:12px;
  display:grid;grid-template-columns:22px minmax(0,1fr) auto;grid-template-areas:"ch tit v" "ch det v" ". pista pista";gap:3px 12px;align-items:center;padding:14px 8px}
.so-of-btn:hover{background:#fcfbf8}
.so-of-btn > svg{grid-area:ch;color:var(--gris);transition:transform .2s}
.so-of-btn[aria-expanded="true"] > svg{transform:rotate(90deg)}
.so-of-tit{grid-area:tit;display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;min-width:0}
.so-of-det{grid-area:det;font-size:12.5px;color:var(--gris)}
.so-of-v{grid-area:v;font-family:var(--display);font-weight:700;font-size:28px;line-height:1;white-space:nowrap}
.so-of-v small{font-size:.5em;margin-left:3px}
.so-of-pista{grid-area:pista;margin-top:8px}
.so-of-pista .fx-pista{margin-top:0;height:10px}
.so-of-pista small{display:block;margin-top:6px;font-size:12.5px;color:var(--gris);font-variant-numeric:tabular-nums}
.so-of-pista small b{color:var(--tinta);font-weight:700}
@container fx (min-width:900px){
  .so-of-btn{grid-template-columns:22px minmax(0,260px) 150px minmax(0,1fr);grid-template-areas:"ch tit v pista" "ch det v pista";gap:3px 20px}
  .so-of-v{text-align:right}
  .so-of-pista{margin-top:0}
}
.so-exps{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));padding:0 8px 16px 42px}
@container fx (max-width:639px){.so-exps{padding-left:8px}}
.so-exp{padding:9px 11px;border-radius:12px;background:var(--crema);border:1px solid var(--linea);min-width:0}
.so-exp b{display:block;font:600 12.5px/1.2 var(--mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.so-exp small{display:block;margin-top:3px;font-size:12px;color:var(--gris);font-variant-numeric:tabular-nums}
.so-of-pie{margin-top:14px}
.so-ayuda{font-size:12px;color:var(--gris2);line-height:1.35}
.so-dos{display:grid;gap:12px;grid-template-columns:repeat(2,minmax(0,1fr))}
.so-dos .so-ancho{grid-column:1/-1}
`;

// ─── Editar la obligación de un año ─────────────────────────────────────────────
function EditarObligacionModal({ so, anio, actual, onClose, onSave }) {
    const [f, setF] = useState(() => ({
        obligacion_gwh: actual?.obligacion_gwh ?? '',
        pct_fondo: actual?.pct_fondo ?? PCT_FONDO_DEFECTO,
        otros_gwh: actual?.otros_gwh ?? '',
        equivalencia_mwh: actual?.equivalencia_mwh ?? EQUIVALENCIA_FINANCIERA,
        ventas_gwh: actual?.ventas_gwh ?? '',
        fuente: actual?.fuente ?? `Anexo II de la Orden de obligaciones de ${anio}`,
        notas: actual?.notas ?? '',
    }));
    const [saving, setSaving] = useState(false);
    const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
    const n = (v) => Number(String(v).replace(',', '.'));
    const cubrible = n(f.obligacion_gwh) * (1 - n(f.pct_fondo) / 100);

    // Función y no componente: un componente declarado aquí dentro se monta de
    // nuevo a cada tecla y el input pierde el foco.
    const campo = (k, label, ayuda) => (
        <label key={k} className="fx-campo">
            <span>{label}</span>
            <input className="fx-input fx-num" value={f[k]} onChange={set(k)} inputMode="decimal" />
            {ayuda && <small className="so-ayuda">{ayuda}</small>}
        </label>
    );

    const guardar = async () => { setSaving(true); try { await onSave(f); } finally { setSaving(false); } };

    return (
        <DialogoFx antetitulo={`${presName(so)} · Anexo II`} titulo={`Obligación ${anio}`} onClose={onClose} ocupado={saving}
            pie={<>
                <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={saving}>Cancelar</button>
                <button type="button" className="fx-btn fx-btn-pri" onClick={guardar} disabled={saving || !(n(f.obligacion_gwh) > 0)}>
                    {saving ? <><Ico n="reintentar" size={18} className="fx-spin" />Guardando…</> : <><Ico n="check" size={18} />Guardar</>}
                </button>
            </>}>
            <div className="so-dos">
                {campo('obligacion_gwh', 'Cuota de ahorro (GWh)', 'La del Anexo II de la Orden')}
                {campo('pct_fondo', 'Mínimo al Fondo (%)', 'Lo que paga sí o sí al FNEE')}
                {campo('otros_gwh', 'Comprado a otros (GWh)', 'CAE de otros agentes, lo que dice él')}
                {campo('equivalencia_mwh', 'Equivalencia (€/MWh)')}
                {campo('ventas_gwh', 'Ventas computables (GWh)', 'Solo informativo')}
            </div>
            <div className="fx-dlg-cifra">
                <div className="fx-eyebrow fx-eyebrow-verde">Cubrible con CAE</div>
                <span className="fx-importe" style={{ fontSize: 40 }}>
                    {Number.isFinite(cubrible) && cubrible > 0 ? <>{num(cubrible)}<small>&nbsp;GWh</small></> : '—'}
                </span>
                <p>La cuota menos el mínimo al Fondo.</p>
            </div>
            <label className="fx-campo">
                <span>Fuente</span>
                <input className="fx-input" value={f.fuente} onChange={set('fuente')} />
            </label>
            <label className="fx-campo">
                <span>Notas</span>
                <textarea className="fx-area" value={f.notas} onChange={set('notas')} rows={2}
                    placeholder="p. ej. «los 9 GWh de otros, según nos dijo en octubre»" />
            </label>
        </DialogoFx>
    );
}

// ─── La barra de la cuota: fondo · otros · lo nuestro por etapas · lo que falta ─
function BarraObligacion({ ob, etapas }) {
    const total = Math.max(ob.obligacion_gwh, ob.fondoGwh + ob.otros_gwh + ob.brokergyGwh);
    const w = (g) => `${Math.max(0, g / total * 100)}%`;
    const tramos = [
        { id: 'FONDO', g: ob.fondoGwh, t: `Al Fondo (${pct(ob.pct_fondo)})`, cls: 'so-fondo' },
        { id: 'OTROS', g: ob.otros_gwh, t: 'Comprado a otros' },
        ...etapas.map(e => ({ id: e.id, g: e.kwh / 1e6, t: e.titulo })),
    ].filter(t => t.g > 0);
    return (
        <div>
            <div className="so-barra" role="img"
                aria-label={[...tramos.map(t => `${t.t}: ${gwh(t.g)}`), ob.faltaGwh > 0 ? `le falta ${gwh(ob.faltaGwh)}` : null].filter(Boolean).join('; ')}>
                {tramos.map((t, i) => (
                    <i key={t.id} title={`${t.t} · ${gwh(t.g)}`} className={t.cls || ''}
                        style={{ width: w(t.g), '--c': COLOR[t.id], animationDelay: `${i * 60}ms` }} />
                ))}
                {ob.faltaGwh > 0 && (
                    <i className="so-falta" title={`Le falta · ${gwh(ob.faltaGwh)}`} style={{ width: w(ob.faltaGwh), animationDelay: `${tramos.length * 60}ms` }}>
                        falta {gwh(ob.faltaGwh)}
                    </i>
                )}
            </div>
            <div className="so-escala"><span>0</span><span>{gwh(total)}</span></div>
            <ul className="fx-ley so-ley">
                {tramos.map(t => (
                    <li key={t.id}><span className={`fx-dot ${t.cls || ''}`} style={{ '--c': COLOR[t.id] }} />{t.t} <b>{gwh(t.g)}</b></li>
                ))}
                {ob.faltaGwh > 0 && <li><span className="fx-dot so-falta" />Le falta <b>{gwh(ob.faltaGwh)}</b></li>}
            </ul>
        </div>
    );
}

export function SujetoObligadoPanel({
    lotes, soList, canEdit = false, onAbrirLote, cargando = false, errorLotes = null, onModo, onNuevoLote,
}) {
    const [toast, avisar] = useToastFx();

    // Los S.O. con algún lote, el que más tiene primero (hoy INTERALCO).
    const sos = useMemo(() => {
        const cuenta = {};
        for (const l of lotes) if (l.sujeto_obligado_id) cuenta[l.sujeto_obligado_id] = (cuenta[l.sujeto_obligado_id] || 0) + 1;
        return [...soList]
            .map(p => ({ ...p, nLotes: cuenta[p.id_empresa] || 0 }))
            .sort((a, b) => b.nLotes - a.nLotes || presName(a).localeCompare(presName(b), 'es'));
    }, [lotes, soList]);

    const [soId, setSoId] = useState(null);
    const so = sos.find(p => p.id_empresa === soId) || sos[0] || null;
    const [anio, setAnio] = useState(new Date().getFullYear());
    // La obligación se guarda con el S.O. al que pertenece: al cambiar de S.O. la
    // anterior deja de valer sola, sin vaciarla a mano dentro de un efecto.
    const [cfg, setCfg] = useState({ id: null, data: null, error: null });
    const config = cfg.id === so?.id_empresa ? cfg.data : null;
    const cfgError = cfg.id === so?.id_empresa ? cfg.error : null;
    const setConfig = (data) => setCfg({ id: so?.id_empresa, data, error: null });
    const [disp, setDisp] = useState(null);
    const [dispError, setDispError] = useState(null);
    const [editando, setEditando] = useState(false);
    const [abierto, setAbierto] = useState(null); // etapa de lo disponible desplegada
    const [verFuera, setVerFuera] = useState(false);
    const [recarga, setRecarga] = useState(0);

    useEffect(() => {
        const id = so?.id_empresa;
        if (!id) return;
        let vivo = true;
        axios.get(`/api/lotes/obligacion-so/${id}`)
            .then(({ data }) => vivo && setCfg({ id, data: normalizarObligacion(data), error: null }))
            .catch(err => vivo && setCfg({ id, data: null, error: errorDeApi(err) }));
        return () => { vivo = false; };
    }, [so?.id_empresa, recarga]);
    useEffect(() => {
        let vivo = true;
        axios.get('/api/lotes/disponible')
            .then(({ data }) => vivo && (setDisp(data), setDispError(null)))
            .catch(err => vivo && setDispError(errorDeApi(err)));
        return () => { vivo = false; };
    }, [recarga]);

    const anios = useMemo(() => aniosElegibles(config, lotes, so?.id_empresa), [config, lotes, so?.id_empresa]);
    const vista = useMemo(
        () => (so ? computeVistaSo({ lotes, soId: so.id_empresa, anio, config, disponible: disp }) : null),
        [lotes, so, anio, config, disp]);

    const guardar = async (siguiente) => {
        try {
            const { data } = await axios.put(`/api/lotes/obligacion-so/${so.id_empresa}`, siguiente);
            setConfig(normalizarObligacion(data));
            return true;
        } catch (err) {
            avisar(err.response?.data?.error || 'No se ha podido guardar', 'aviso');
            return false;
        }
    };
    const guardarAnio = async (f) => {
        const ok = await guardar({ ...config, anios: { ...(config?.anios || {}), [anio]: f } });
        if (ok) { setEditando(false); avisar(`Obligación ${anio} guardada`); }
    };
    const asignar = async (loteId, valor) => {
        const asignacion = { ...(config?.asignacion || {}) };
        if (valor === 'AUTO') delete asignacion[loteId]; else asignacion[loteId] = valor;
        if (await guardar({ ...config, asignacion })) avisar(valor === 'NO' ? 'El lote ya no cuenta' : 'Año del lote cambiado');
    };

    const ob = vista?.obligacion;

    // Dos renglones: código y MWh arriba; estado, de dónde sale la cifra y para
    // qué año cuenta, abajo.
    const filaLote = (l) => (
        <li key={l.id} className="so-lote" role="button" tabIndex={0} title={`Abrir ${l.codigo}`}
            onClick={() => onAbrirLote?.(l.id)}
            onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) onAbrirLote?.(l.id); }}>
            <span className="so-lote-cod">{l.codigo}</span>
            <span className="so-lote-mwh">{mwh(l.kwh)}</span>
            <span className="so-lote-pie">
                <span className={`fx-chip ${chipEstado(l)}`} title={l.estado}>{l.estado}</span>
                <span className="so-fuente">{FUENTE[l.fuente]}</span>
                {canEdit ? (
                    <select className="fx-select so-anio" value={l.manual || 'AUTO'} aria-label={`Año de obligación de ${l.codigo}`}
                        onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()} onChange={e => asignar(l.id, e.target.value)}
                        title="Para qué año de obligación cuenta este lote">
                        <option value="AUTO">{l.anioAuto} (auto)</option>
                        {[l.anioAuto - 1, l.anioAuto + 1].map(a => <option key={a} value={String(a)}>{a}</option>)}
                        <option value="NO">No cuenta</option>
                    </select>
                ) : l.anio !== anio && (
                    <span className="so-anio-txt">{l.anio ? `cuenta para ${l.anio}` : 'no cuenta'}</span>
                )}
            </span>
        </li>
    );

    const cabecera = (
        <header className="fx-cab fx-in">
            <div>
                <div className="fx-eyebrow">Lotes · vista del Sujeto Obligado</div>
                <h1 className="fx-display fx-h1">Cómo va <span className="fx-mark">{so ? presName(so) : 'el S.O.'}</span></h1>
                <p className="fx-sub">
                    {so ? <>{so.razon_social || presName(so)}{so.cif ? <> · NIF <b>{so.cif}</b></> : null}. </> : null}
                    Su obligación del año, lo que ya tiene y lo que le podemos llevar.
                </p>
            </div>
            <div className="fx-cab-acc">
                <div className="fx-seg" role="group" aria-label="Vista">
                    <button type="button" aria-pressed="false" onClick={() => onModo?.('LOTES')}><Ico n="lista" size={16} />Lotes</button>
                    <button type="button" aria-pressed="true"><Ico n="tabla" size={16} />Vista S.O.</button>
                </div>
                {onNuevoLote && (
                    <button type="button" className="fx-btn fx-btn-sec" onClick={onNuevoLote}><Ico n="mas" size={18} />Nuevo lote</button>
                )}
            </div>
        </header>
    );

    let cuerpo;
    if (errorLotes) {
        cuerpo = <AvisoFx tono="ambar"><b>No se han podido traer los lotes.</b> {errorLotes}</AvisoFx>;
    } else if (cargando) {
        cuerpo = (
            <div className="so-dash">
                <div className="fx-sk" style={{ height: 300, borderRadius: 24 }} />
                <div className="fx-kpis so-kpis">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="fx-sk fx-sk-kpi" />)}</div>
            </div>
        );
    } else if (!so) {
        cuerpo = (
            <div className="fx-card fx-vacio">
                <span className="fx-tile fx-tile-l fx-tile-crema"><Ico n="info" size={22} /></span>
                <p>No hay ningún Sujeto Obligado dado de alta.</p>
            </div>
        );
    } else {
        const kpi = (k, valor, ud, nota, extra = '') => (
            <div className={`fx-kpi so-kpi ${extra}`}>
                <span className="fx-kpi-k">{k}</span>
                <span className="fx-kpi-v fx-num">{valor}{ud && <span className="fx-kpi-ud">{ud}</span>}</span>
                {nota && <span className="fx-kpi-nota">{nota}</span>}
            </div>
        );
        cuerpo = (
            <>
                {/* Selector de S.O. y año */}
                <div className="fx-hoy-cab fx-in" style={{ '--i': 1 }}>
                    <div className="fx-chips" style={{ margin: 0 }}>
                        {sos.filter(p => p.nLotes > 0 || p.id_empresa === so.id_empresa).map(p => (
                            <button key={p.id_empresa} type="button" className="fx-chip-f" aria-pressed={p.id_empresa === so.id_empresa}
                                onClick={() => setSoId(p.id_empresa)}>
                                {presName(p)}<b>{p.nLotes}</b>
                            </button>
                        ))}
                    </div>
                    <div className="fx-seg" role="group" aria-label="Año de la obligación">
                        {anios.map(a => (
                            <button key={a} type="button" aria-pressed={a === anio} onClick={() => setAnio(a)}>{a}</button>
                        ))}
                    </div>
                </div>

                {cfgError && <ErrorApi error={cfgError} que="la obligación" onReintentar={() => setRecarga(r => r + 1)} className="fx-in" />}

                {/* La obligación del año: la cifra protagonista y sus cuentas */}
                <div className="so-dash" style={{ marginTop: cfgError ? 14 : 0 }}>
                    <section className="fx-card fx-hero so-hero fx-in" style={{ '--i': 2 }} aria-label={`Obligación ${anio}`}>
                        <div className="fx-filete-fino" />
                        <div className="fx-hero-top">
                            <span className="fx-eyebrow">Obligación {anio}</span>
                            {canEdit && config && ob && (
                                <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setEditando(true)}>
                                    <Ico n="lapiz" size={16} />Editar
                                </button>
                            )}
                        </div>
                        {ob ? (
                            <>
                                <div className="fx-importe fx-hero-v">
                                    {num(ob.faltaGwh > 0 ? ob.faltaGwh : ob.sobraGwh)}<small>GWh</small>
                                </div>
                                <p className="fx-hero-tit">
                                    {ob.faltaGwh > 0
                                        ? <>le faltan por cubrir con CAE, aunque se emita todo lo nuestro</>
                                        : <>le sobran: con lo de otros y lo nuestro cubre su obligación</>}
                                </p>
                                {ob.faltaGwh > 0 && (
                                    <p className="fx-hero-pie">Si no los compra, ≈ <b>{eur(ob.faltaEur, 0)}</b> al Fondo a {num(ob.equivalencia_mwh, 3)} €/MWh.</p>
                                )}
                                <div className="so-asegurado">
                                    <div className="so-asegurado-top">
                                        <span>Asegurado hoy <span className="so-ayuda">(otros + lo nuestro ya emitido)</span></span>
                                        <b>{pct(ob.pctAsegurado)}</b>
                                    </div>
                                    <div className="fx-barra"><i style={{ width: `${Math.min(100, ob.pctAsegurado)}%`, backgroundSize: `${100 / Math.max(ob.pctAsegurado, 1) * 100}% 100%` }} /></div>
                                </div>
                                {(ob.fuente || ob.notas) && (
                                    <p className="fx-hero-pie">{[ob.fuente, ob.notas].filter(Boolean).join(' · ')}</p>
                                )}
                            </>
                        ) : config ? (
                            <div className="fx-vacio fx-vacio-peq" style={{ justifyItems: 'start', textAlign: 'left', padding: '18px 0 4px' }}>
                                <p>Sin la obligación de {anio}. {canEdit ? 'Ponla con los datos del Anexo II de la Orden: cuota, % al Fondo y lo que ya tiene comprado a otros.' : 'La pone un administrador con los datos del Anexo II.'}</p>
                                {canEdit && (
                                    <button type="button" className="fx-btn fx-btn-pri" onClick={() => setEditando(true)}>
                                        <Ico n="mas" size={18} />Poner la obligación
                                    </button>
                                )}
                            </div>
                        ) : !cfgError && (
                            <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                                <div className="fx-sk fx-sk-cifra" /><div className="fx-sk fx-sk-linea" /><div className="fx-sk fx-sk-linea" style={{ width: '70%' }} />
                            </div>
                        )}
                    </section>

                    {ob && (
                        <div className="fx-kpis so-kpis fx-in" style={{ '--i': 3 }}>
                            {kpi('Obligación', num(ob.obligacion_gwh), 'GWh', <>{eur(ob.obligacionEur, 0)}</>)}
                            {kpi(`Mínimo al Fondo · ${pct(ob.pct_fondo)}`, num(ob.fondoGwh), 'GWh', <>{eur(ob.fondoEur, 0)}, sí o sí</>, 'fx-kpi-apagado')}
                            {kpi('Cubrible con CAE', num(ob.cubribleGwh), 'GWh', <>{eur(ob.cubribleEur, 0)}</>)}
                            {kpi('Comprado a otros', num(ob.otros_gwh), 'GWh', 'lo que nos dice él')}
                            {kpi('Con BROKERGY', num(ob.brokergyGwh), 'GWh', <><b>{gwh(ob.emitidoGwh)}</b> ya emitidos</>, 'so-kpi-marca')}
                            {kpi('Cubierto si se emite todo', pct(ob.pctCubierto), null, <>otros + todo lo nuestro</>)}
                        </div>
                    )}
                </div>

                {ob && (
                    <section className="fx-card fx-pad fx-in" style={{ '--i': 4, marginTop: 14 }} aria-label="La cuota, tramo a tramo">
                        <div className="fx-card-cab">
                            <div>
                                <div className="fx-eyebrow fx-eyebrow-gris">La cuota, tramo a tramo</div>
                                <h2 className="fx-display fx-h3">{gwh(ob.obligacion_gwh)} de obligación</h2>
                            </div>
                            {ob.ventas_gwh ? <span className="fx-pildora">ventas computables {gwh(ob.ventas_gwh)}</span> : null}
                        </div>
                        <BarraObligacion ob={ob} etapas={vista.etapas} />
                    </section>
                )}

                {/* Lo nuestro con él, por etapas */}
                {vista && (
                    <section className="so-seccion">
                        <div className="so-seccion-cab">
                            <div>
                                <div className="fx-eyebrow">Lo que le llevamos para {anio}</div>
                                <h2 className="fx-display fx-h2">{gwh(vista.brokergyGwh)} en {vista.etapas.reduce((s, e) => s + e.lotes.length, 0)} lotes</h2>
                                <p>Cada lote con su cifra más firme: CAE de la resolución → nuestra factura → verificado → estimado.</p>
                            </div>
                        </div>
                        <div className="so-etapas">
                            {vista.etapas.map((e, i) => {
                                const nReq = e.lotes.filter(l => l.requerimiento).length;
                                return (
                                    <div key={e.id} className="fx-card fx-pad fx-in" style={{ '--i': 5 + i }}>
                                        <div className="so-etapa-k">
                                            <span className="fx-dot" style={{ '--c': COLOR[e.id] }} />
                                            <span className="fx-kpi-k">{e.titulo}</span>
                                        </div>
                                        <div className="fx-importe so-etapa-v">{num(e.kwh / 1e6)}<small>GWh</small></div>
                                        <div className="so-etapa-n">
                                            <span>{e.lotes.length} lote{e.lotes.length === 1 ? '' : 's'} · {e.sub}</span>
                                            {nReq > 0 && <span className="fx-chip fx-chip-ambar"><Ico n="alerta" />{nReq} con requerimiento</span>}
                                        </div>
                                        {e.lotes.length > 0
                                            ? <ul className="so-lotes">{e.lotes.map(filaLote)}</ul>
                                            : <p className="so-vacio">Ninguno ahora mismo.</p>}
                                    </div>
                                );
                            })}
                        </div>
                        {vista.fuera.length > 0 && (
                            <div className="so-fuera">
                                <button type="button" className="fx-link" aria-expanded={verFuera} onClick={() => setVerFuera(v => !v)}>
                                    <Ico d={verFuera ? 'M6 9l6 6 6-6' : 'M9 6l6 6-6 6'} size={16} sw={2.4} />
                                    {vista.fuera.length} lote{vista.fuera.length === 1 ? '' : 's'} de {presName(so)} que cuentan para otro año o no cuentan
                                </button>
                                {verFuera && (
                                    <div className="fx-card fx-pad" style={{ marginTop: 10 }}>
                                        <ul className="so-lotes" style={{ marginTop: 0, borderTop: 0 }}>{vista.fuera.map(filaLote)}</ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                )}

                {/* Lo que le podemos ofrecer */}
                <section className="so-seccion">
                    <div className="so-seccion-cab">
                        <div>
                            <div className="fx-eyebrow fx-eyebrow-verde">Lo que tengo para ofrecerle</div>
                            <h2 className="fx-display fx-h2">{vista?.oferta ? `${gwh(vista.oferta.totalGwh)} sin lotear` : 'Sin lotear'}</h2>
                            <p>Expedientes sin lote ni rechazo, de más cerca a más lejos del CAE{ob?.faltaGwh > 0 ? ', acumulados frente a lo que le falta' : ''}.</p>
                        </div>
                    </div>
                    <div className="fx-card fx-pad fx-in" style={{ '--i': 9 }}>
                        {dispError ? (
                            <ErrorApi error={dispError} que="lo disponible" onReintentar={() => setRecarga(r => r + 1)} />
                        ) : !vista?.oferta ? (
                            <div style={{ display: 'grid', gap: 10 }}>{[0, 1, 2, 3].map(i => <div key={i} className="fx-sk fx-sk-fila" />)}</div>
                        ) : (
                            <>
                                <ul className="so-of" style={{ marginTop: 0, borderTop: 0 }}>
                                    {vista.oferta.filas.map(f => (
                                        <li key={f.id}>
                                            <button type="button" className="so-of-btn" aria-expanded={abierto === f.id}
                                                onClick={() => setAbierto(a => a === f.id ? null : f.id)}>
                                                <Ico d="M9 6l6 6-6 6" size={18} sw={2.4} />
                                                <span className="so-of-tit"><span className="fx-dot" style={{ '--c': COLOR_OFERTA[f.id] }} />{f.titulo}</span>
                                                <span className="so-of-det">{f.n} expedientes · {f.sub}</span>
                                                <span className="so-of-v fx-num">{num(f.gwh)}<small>GWh</small></span>
                                                {ob && ob.faltaGwh > 0 && (
                                                    <span className="so-of-pista">
                                                        <span className="fx-pista" style={{ display: 'block' }}>
                                                            <i style={{ width: `${f.pctDeLoQueFalta}%`, background: COLOR_OFERTA[f.id] }} />
                                                        </span>
                                                        <small>acumulado <b>{gwh(f.acumGwh)}</b> · <b>{pct(f.pctDeLoQueFalta)}</b> de lo que le falta</small>
                                                    </span>
                                                )}
                                            </button>
                                            {abierto === f.id && (
                                                <div className="so-exps">
                                                    {f.expedientes.map(x => (
                                                        <div key={x.numero} className="so-exp" title={`${x.estado} · ${x.origen || 'sin cifra'}`}>
                                                            <b>{x.numero}</b>
                                                            <small>{mwh(x.kwh)} · {x.ficha}</small>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                <AvisoFx tono="crema" icono="info" className="so-of-pie">
                                    Es el mismo volumen para cualquier Sujeto Obligado: si se lo ofreces a dos, se cuenta dos veces.
                                </AvisoFx>
                            </>
                        )}
                    </div>
                </section>
            </>
        );
    }

    return (
        <div className="fx">
            <style>{CSS_FX + CSS_SO}</style>
            <div className="fx-filete-top" />
            <div className="fx-halo" aria-hidden="true" />
            <div className="fx-col">
                {cabecera}
                {cuerpo}
            </div>
            {editando && so && (
                <EditarObligacionModal so={so} anio={anio} actual={config?.anios?.[anio]}
                    onClose={() => setEditando(false)} onSave={guardarAnio} />
            )}
            {toast}
        </div>
    );
}

export default SujetoObligadoPanel;
