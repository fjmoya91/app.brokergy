import { useState } from 'react';
import axios from 'axios';
import { Dialogo } from './PresupuestoModal';
import { SERIES, isoAEs } from '../logic/factura';
import { Ico, AvisoFx } from '../estilo';

// ─────────────────────────────────────────────────────────────────────────────
// Importar de AppSheet (⚙ Ajustes de Facturación, solo ADMIN): trae lo emitido en
// el libro de facturas de AppSheet que aún no está en la app, y los cobros que allí
// ya constan. Antes vivía como un botón del listado; es cosa de higos a brevas y
// escribe en la base de datos de PRODUCCIÓN, así que va en Ajustes.
//
// Primero SIEMPRE en seco (se lee el libro y se dice qué entraría, sin escribir).
// Escribir es un segundo gesto con dos pulsaciones: la primera arma el botón y
// enseña lo que se va a escribir; la segunda escribe. Una vez por serie.
// Lo importado NO entra en la cadena de VERI*FACTU: no lo generó la app.
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/facturacion';
const ESQUEMA_TXT = 'Falta aplicar el esquema de facturas en Supabase (scripts/facturacion_schema.sql)';
const esErrorEsquema = (m) => /facturas_emitidas|facturacion_emisores|does not exist|schema cache/i.test(String(m || ''));

export function ImportarAppsheet({ onClose, onHecho }) {
    const [serie, setSerie] = useState('ING');
    const [res, setRes] = useState({});              // { ING: { seco, escrito }, FML: … }
    const [ocupado, setOcupado] = useState(false);
    const [error, setError] = useState(null);
    const [armado, setArmado] = useState(false);     // primer clic en «Importar»

    const actual = res[serie] || {};
    const seco = actual.seco;
    const nCobros = (seco?.cobros || []).length;
    const hayAlgo = !!seco && (seco.nuevas > 0 || nCobros > 0);

    const llamar = async (escribir) => {
        setOcupado(true); setError(null);
        try {
            const { data } = await axios.post(`${API}/facturas/importar`, { serie, escribir }, { timeout: 180000 });
            setRes(r => ({ ...r, [serie]: escribir ? { ...r[serie], escrito: data } : { seco: data } }));
            setArmado(false);
            if (escribir) onHecho?.(data);
        } catch (err) {
            const m = err.response?.data?.error;
            setError(esErrorEsquema(m) ? `${ESQUEMA_TXT}.`
                : (m || (err.response ? `No se pudo leer el libro (error ${err.response.status}).` : 'No hay conexión con el servidor.')));
        } finally { setOcupado(false); }
    };

    const cambiarSerie = (s) => { if (!ocupado) { setSerie(s); setArmado(false); setError(null); } };

    let pie;
    if (actual.escrito) {
        pie = <button type="button" className="fx-btn fx-btn-pri" onClick={onClose}>Cerrar</button>;
    } else if (!seco) {
        pie = (
            <>
                <button type="button" className="fx-btn fx-btn-sec" onClick={onClose} disabled={ocupado}>Cerrar</button>
                <button type="button" className="fx-btn fx-btn-pri" onClick={() => llamar(false)} disabled={ocupado} data-autofoco>
                    {ocupado ? <><Ico n="reloj" size={18} className="fx-spin" />Leyendo el libro…</> : <><Ico n="leer" size={18} />Comprobar {serie} en seco</>}
                </button>
            </>
        );
    } else {
        pie = (
            <>
                <button type="button" className="fx-btn fx-btn-sec" onClick={() => llamar(false)} disabled={ocupado}>Repetir</button>
                <button type="button" className={`fx-btn ${armado ? 'fx-btn-tinta' : 'fx-btn-pri'}`}
                    onClick={() => (armado ? llamar(true) : setArmado(true))} disabled={ocupado || !hayAlgo}>
                    {ocupado ? 'Escribiendo…'
                        : !hayAlgo ? 'Nada que importar'
                            : armado ? <><Ico n="alerta" size={18} />Pulsa otra vez: se escribe</>
                                : `Importar ${seco.nuevas} y ${nCobros} cobros`}
                </button>
            </>
        );
    }

    return (
        <Dialogo antetitulo="Ajustes · solo administración" titulo="Importar de AppSheet" ancho
            subtitulo="Lo emitido en el libro de facturas que aún no está aquí, y sus cobros."
            onClose={onClose} ocupado={ocupado} pie={pie}>
            <div className="fx-seg" role="group" aria-label="Serie" style={{ width: '100%', gridAutoColumns: '1fr' }}>
                {Object.keys(SERIES).map(s => (
                    <button key={s} type="button" aria-pressed={s === serie} onClick={() => cambiarSerie(s)} disabled={ocupado}>
                        {s} · {SERIES[s].nombre}{res[s]?.escrito ? ' · hecho' : ''}
                    </button>
                ))}
            </div>

            {!seco && !ocupado && (
                <p className="fx-ayuda">
                    Primero se comprueba <b>en seco</b>: se lee el libro de la serie {serie} y se dice qué facturas faltan aquí y qué
                    cobros han cambiado, sin escribir nada. Las importadas no entran en la cadena de VERI*FACTU (no las generó la app).
                </p>
            )}

            {seco && (
                <>
                    <dl className="fx-cifras3" style={{ margin: 0 }}>
                        {[['En el libro', seco.en_hoja], ['Nuevas', seco.nuevas], ['Cobros', nCobros]].map(([k, v]) => (
                            <div key={k}><dd style={{ margin: 0 }}><b>{v ?? 0}</b></dd><dt><span>{k}</span></dt></div>
                        ))}
                    </dl>
                    {(seco.muestra || []).length > 0 && (
                        <div>
                            <h3 className="fx-sec-tit">Las últimas que entrarían</h3>
                            <ul className="fx-lista-mono">{seco.muestra.map(m => <li key={m}>{m}</li>)}</ul>
                        </div>
                    )}
                    {nCobros > 0 && (
                        <div>
                            <h3 className="fx-sec-tit">Cobros que cambian</h3>
                            <ul className="fx-lista-mono">
                                {seco.cobros.map(c => (
                                    <li key={c.id}>
                                        {c.numero}: {c.de === 'PAGADA' ? 'cobrada' : 'pendiente'} → {c.a === 'PAGADA' ? `cobrada${c.fecha_pago ? ` (${isoAEs(c.fecha_pago) || c.fecha_pago})` : ''}` : 'pendiente'}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {(seco.descuadres || []).length > 0 && (
                        <AvisoFx tono="ambar">
                            <b>Descuadres ({seco.descuadres.length})</b> · entran con la cifra del libro.
                            <ul className="fx-lista-mono" style={{ marginTop: 6, fontFamily: 'inherit' }}>{seco.descuadres.map(d => <li key={d}>• {d}</li>)}</ul>
                        </AvisoFx>
                    )}
                    {armado && !actual.escrito && (
                        <AvisoFx tono="vence">
                            Se van a escribir <b>{seco.nuevas} facturas y {nCobros} cobros</b> en la base de datos de PRODUCCIÓN. Si estás conforme, pulsa otra vez.
                        </AvisoFx>
                    )}
                    {actual.escrito && (
                        <AvisoFx tono="ok">
                            Hecho: {actual.escrito.nuevas} facturas nuevas y {(actual.escrito.cobros || []).length} cobros de la serie {serie}.
                        </AvisoFx>
                    )}
                </>
            )}

            {error && <AvisoFx tono="ambar">{error}</AvisoFx>}
        </Dialogo>
    );
}

export default ImportarAppsheet;
