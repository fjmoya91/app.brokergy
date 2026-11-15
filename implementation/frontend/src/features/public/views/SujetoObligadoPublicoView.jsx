import { useState, useEffect } from 'react';
import axios from 'axios';
import { CSS as CSS_FX, Ico, AvisoFx } from '../../facturacion/estilo';
import { ResumenObligacion, EtapasLotes } from '../../lotes/components/SujetoObligadoPanel';
import { CSS_SO, chipEstado, logoEsClaro, gwh, mwh } from '../../lotes/components/vistaSoEstilo';

// ─────────────────────────────────────────────────────────────────────────────
// La «Vista S.O.» para el PROPIO Sujeto Obligado: /so/:token (Fran, 03/11/2026:
// «un enlace directo para que le sirva a él en todo momento para consultar el
// estado en tiempo real»). Solo lectura, calculada en el servidor en cada visita
// con las MISMAS cuentas y piezas que la pestaña Lotes; el backend
// (`vistaParaElSo`) ya ha quitado lo que no es suyo: clientes, importes nuestros
// y el detalle de lo que aún no está en un lote (solo el total).
// Ver docs/conocimiento/lotes/la-vista-del-sujeto-obligado.md.
// ─────────────────────────────────────────────────────────────────────────────

// Relativa: en local la sirve el proxy de Vite (vite.config.js), en el puerto que tenga el backend.
const API_URL = '/api/public';

const CSS_PUB = `
.sp{min-height:100vh}
.sp .fx{--fx-tope:0px}
.sp-pie{margin-top:34px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px 16px;font-size:12.5px;color:var(--gris2)}
.sp-cartera{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 14px}
.sp-cartera .fx-importe{font-size:44px;line-height:1}
.sp-cartera .fx-importe small{font-size:.45em;margin-left:4px}
.sp-lote-n{flex:none;font-size:12px;color:var(--gris);white-space:nowrap}
/* Aquí el estado es una frase («Pendiente de vuestra firma»): se lee entera, en otra línea si no cabe */
.sp .so-lote-pie{flex-wrap:wrap;row-gap:6px}
.sp .so-lote-pie .fx-chip{white-space:normal;overflow:visible;text-overflow:clip;max-width:100%}
`;

export function SujetoObligadoPublicoView({ token }) {
    const [anio, setAnio] = useState(null);
    const [recarga, setRecarga] = useState(0);
    // La respuesta se guarda con la petición que la pidió: cambiar de año o
    // actualizar enseña el esqueleto sin vaciar nada dentro de un efecto.
    const pedido = `${anio || ''}|${recarga}`;
    const [res, setRes] = useState({ pedido: null, data: null, error: null });
    const [logoOscuro, setLogoOscuro] = useState(false);

    useEffect(() => {
        let vivo = true;
        axios.get(`${API_URL}/so/${encodeURIComponent(token)}`, { params: anio ? { anio } : {} })
            .then(({ data }) => vivo && setRes({ pedido, data, error: null }))
            .catch(err => vivo && setRes({ pedido, data: null, error: err.response?.status || 0 }));
        return () => { vivo = false; };
    }, [token, anio, recarga, pedido]);

    useEffect(() => { document.title = 'Cómo vamos · BROKERGY'; }, []);

    const cargando = res.pedido !== pedido;
    const d = cargando ? null : res.data;
    const ob = d?.obligacion || null;
    const nombre = d?.so?.nombre || 'el Sujeto Obligado';

    const filaLote = (l) => (
        <li key={l.codigo} className="so-lote so-lote-fijo">
            <span className="so-lote-cod">{l.codigo}</span>
            <span className="so-lote-mwh">{mwh(l.kwh)}</span>
            <span className="so-lote-pie">
                <span className={`fx-chip ${chipEstado(l)}`} title={l.estado}>{l.estado}</span>
                {l.fuente && <span className="so-fuente">{l.fuente}</span>}
                {l.nExpedientes ? <span className="sp-lote-n" style={{ marginLeft: 'auto' }}>{l.nExpedientes} actuaciones</span> : null}
            </span>
        </li>
    );

    let cuerpo;
    if (!cargando && res.error === 404) {
        cuerpo = (
            <div className="fx-card fx-vacio">
                <span className="fx-tile fx-tile-l fx-tile-crema"><Ico n="info" size={22} /></span>
                <p>Este enlace ya no está activo. Pídenos uno nuevo.</p>
            </div>
        );
    } else if (!cargando && res.error != null) {
        cuerpo = (
            <AvisoFx tono="ambar" role="alert"
                accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => setRecarga(r => r + 1)}><Ico n="reintentar" size={16} />Reintentar</button>}>
                <b>No hemos podido calcularlo ahora mismo.</b> Vuelve a intentarlo en un momento.
            </AvisoFx>
        );
    } else if (!d) {
        cuerpo = (
            <div className="so-dash">
                <div className="fx-sk" style={{ height: 300, borderRadius: 24 }} />
                <div className="fx-kpis so-kpis">{[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="fx-sk fx-sk-kpi" />)}</div>
            </div>
        );
    } else {
        cuerpo = (
            <>
                {(d.anios || []).length > 1 && (
                    <div className="fx-hoy-cab fx-in" style={{ '--i': 1, justifyContent: 'flex-end' }}>
                        <div className="fx-seg" role="group" aria-label="Año de la obligación">
                            {d.anios.map(a => (
                                <button key={a} type="button" aria-pressed={a === d.anio} onClick={() => setAnio(a)}>{a}</button>
                            ))}
                        </div>
                    </div>
                )}
                <ResumenObligacion ob={ob} anio={d.anio} etapas={d.etapas}
                    sinObligacion={<p className="so-vacio">Sin la obligación de {d.anio} todavía.</p>} />
                <EtapasLotes etapas={d.etapas} brokergyGwh={d.brokergyGwh} anio={d.anio} filaLote={filaLote} />
                {d.carteraGwh > 0 && (
                    <section className="so-seccion">
                        <div className="fx-card fx-pad fx-in" style={{ '--i': 9 }}>
                            <div className="fx-eyebrow fx-eyebrow-verde">Y en cartera</div>
                            <div className="sp-cartera" style={{ marginTop: 10 }}>
                                <span className="fx-importe">{gwh(d.carteraGwh).replace(' GWh', '')}<small>GWh</small></span>
                                <span className="so-ayuda" style={{ fontSize: 13.5 }}>más en expedientes que todavía no están en ningún lote, desde los listos para lotear hasta los que aún no han empezado la obra.</span>
                            </div>
                        </div>
                    </section>
                )}
            </>
        );
    }

    return (
        <div className="sp">
            <div className="fx">
                <style>{CSS_FX + CSS_SO + CSS_PUB}</style>
                <div className="fx-filete-top" />
                <div className="fx-halo" aria-hidden="true" />
                <div className="fx-col">
                    <header className="fx-cab fx-in">
                        <div>
                            <div className="fx-eyebrow">BROKERGY · CAE · en tiempo real</div>
                            <div className="so-tit">
                                <h1 className="fx-display fx-h1">Cómo va <span className="fx-mark">{nombre}</span></h1>
                                {d?.so?.logo && (
                                    <span className={`so-logo ${logoOscuro ? 'so-logo-oscuro' : ''}`}>
                                        <img src={d.so.logo} alt={`Logo de ${nombre}`} onLoad={e => setLogoOscuro(logoEsClaro(e.currentTarget))} />
                                    </span>
                                )}
                            </div>
                            <p className="fx-sub">
                                {d?.so ? <>{d.so.razon_social || nombre}{d.so.cif ? <> · NIF <b>{d.so.cif}</b></> : null}. </> : null}
                                Su obligación del año y cómo van los lotes de CAE que le lleva BROKERGY.
                            </p>
                        </div>
                        <div className="fx-cab-acc">
                            <button type="button" className="fx-btn fx-btn-sec" onClick={() => setRecarga(r => r + 1)} disabled={cargando}>
                                <Ico n="reintentar" size={18} className={cargando ? 'fx-spin' : ''} />Actualizar
                            </button>
                        </div>
                    </header>
                    {cuerpo}
                    {d && (
                        <footer className="sp-pie">
                            <span>Calculado el {new Date(d.calculado_at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}.</span>
                            <span>Francisco Javier Moya · BROKERGY</span>
                        </footer>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SujetoObligadoPublicoView;
