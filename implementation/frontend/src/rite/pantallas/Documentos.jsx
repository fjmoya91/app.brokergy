// ─── Documentos.jsx — los documentos de una memoria ─────────────────────────
// Tomado de la app de certificadores: lo ACTUAL de cada clase (memoria en PDF y
// Word, borrador del certificado, guía JE6) y, plegadas, las versiones
// anteriores (las que el backend pasó a «OLD»). Los PDF se ven DENTRO de la app
// con el visor de cee (VisorPdf: pide los bytes con la sesión), y se descargan por
// la API: sin enlaces de Drive (regla 1).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { descargar, fecha, mensajeError, useCarga, axios } from '../api';
import { VisorPdf } from '../../certificadores/obra/VisorPdf';
import { ErrorRed, Esqueleto, useToast } from '../../certificadores/ui/piezas';
import { IcoDescarga, IcoDoc, Spinner } from '../../certificadores/ui/Iconos';

function Fila({ d, base, onVer }) {
    const toast = useToast();
    const [bajando, setBajando] = useState(false);
    const url = `${base}/documentos/${encodeURIComponent(d.id)}`;
    return (
        <li className="ca-doc">
            <span className={`ca-ico-tile ${d.actual ? 'ca-tile-naranja' : 'ca-tile-crema'}`}><IcoDoc size={19} /></span>
            <div className="ca-doc-txt">
                <b>{d.etiqueta}</b>
                <small>{d.actual ? '' : 'Versión anterior · '}{fecha(d.fecha, true)}</small>
            </div>
            <div className="ca-doc-acc">
                {d.pdf && <button type="button" className="ca-btn ca-btn-sec" onClick={() => onVer({ ...d, url })}>Ver</button>}
                <button type="button" className="ca-icobtn" aria-label={`Descargar ${d.etiqueta}`} disabled={bajando}
                    onClick={async () => {
                        setBajando(true);
                        try { await descargar(url, d.nombre); } catch (err) { toast(mensajeError(err, 'No se ha podido descargar.')); } finally { setBajando(false); }
                    }}>{bajando ? <Spinner size={16} /> : <IcoDescarga size={18} />}</button>
            </div>
        </li>
    );
}

/** `base`: la memoria en SU API (la cuenta, la administración o el enlace del instalador). */
export default function Documentos({ base, version }) {
    const { datos, error, cargando, recargar } = useCarga(
        () => axios.get(`${base}/documentos`).then(r => r.data || { actuales: [], anteriores: [] }),
        [base, version],
    );
    const [visor, setVisor] = useState(null);
    const [verViejos, setVerViejos] = useState(false);

    if (cargando && !datos) return <Esqueleto alto={64} n={3} />;
    if (error && !datos) return <ErrorRed compacto error={error} onReintentar={recargar} titulo="No hemos podido cargar los documentos" />;
    const { actuales = [], anteriores = [] } = datos || {};
    return (
        <div>
            {!actuales.length && <p className="ca-txt">Aún no hay documentos: se generan en «Revisar».</p>}
            <ul className="ca-docs">
                {actuales.map(d => <Fila key={d.id} d={d} base={base} onVer={setVisor} />)}
            </ul>
            {anteriores.length > 0 && (
                <>
                    <button type="button" className="ca-link ca-link-gris" style={{ marginTop: 10 }} onClick={() => setVerViejos(v => !v)}>
                        {verViejos ? 'Ocultar' : 'Ver'} las versiones anteriores ({anteriores.length})
                    </button>
                    {verViejos && (
                        <ul className="ca-docs">
                            {anteriores.map(d => <Fila key={d.id} d={d} base={base} onVer={setVisor} />)}
                        </ul>
                    )}
                </>
            )}
            {visor && (
                <VisorPdf key={visor.id} doc={visor} titulo={visor.etiqueta}
                    detalle={`${visor.actual ? '' : 'Versión anterior · '}${fecha(visor.fecha, true)} · ${visor.nombre}`}
                    onCerrar={() => setVisor(null)}
                    pie={() => (
                        <button type="button" className="ca-btn ca-btn-sec" onClick={() => descargar(visor.url, visor.nombre)}>
                            <IcoDescarga size={16} /> Descargar
                        </button>
                    )} />
            )}
        </div>
    );
}
