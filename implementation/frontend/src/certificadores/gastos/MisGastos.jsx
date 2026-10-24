// ─── MisGastos — /gastos: los certificados del certificador y en qué se fueron ─
// Fran, 24/10/2026: «que puedan ver el gasto que llevan en qué expedientes».
// GET /api/certapp/movimientos → { resumen, movimientos } (SOLO los suyos):
//   arriba, disponibles · usados · recibidos gratis · gastado en € (0 € en la beta);
//   debajo, cada entrada o salida con su fecha, el concepto, la obra (nº y
//   dirección, con enlace a su ficha) y +/- certificados.
// «Comprar certificados» es un hueco: la pasarela de pago vendrá después.
// Con la API caída se dice («no hemos podido cargar»), NUNCA «0 certificados».
import { useEffect, useMemo } from 'react';
import axios from 'axios';
import { API, comoLista, fecha, useCarga } from '../api';
import { useCertappAuth } from '../auth/CertappAuth';
import { Enlace } from '../router';
import { ErrorRed, Esqueleto } from '../ui/piezas';
import { IcoChat } from '../ui/Iconos';

const TIPO = {
    ALTA: 'Regalo de bienvenida',
    COMPRA: 'Compra',
    GASTO: 'Certificado',
    DEVOLUCION: 'Devolución',
    AJUSTE: 'Ajuste',
};

const euros = (n) => new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2,
}).format(n || 0);

const certificados = (n) => `${n} ${Math.abs(n) === 1 ? 'certificado' : 'certificados'}`;
const lugar = (o) => [o?.direccion, o?.municipio].filter(Boolean).join(', ');

function Movimiento({ m }) {
    const entra = m.creditos > 0;
    return (
        <li className="ca-mov">
            <div className="ca-mov-txt">
                <b>{m.concepto || TIPO[m.tipo] || 'Movimiento'}</b>
                <span className="ca-mov-meta">{fecha(m.created_at)} · {TIPO[m.tipo] || m.tipo}{m.importe_eur ? ` · ${euros(m.importe_eur)}` : ''}</span>
                {m.obra?.id && (
                    <span className="ca-mov-meta">
                        <Enlace to={`/obra/${m.obra.id}`} className="ca-mov-obra">{m.obra.numero_expediente || 'Ver la obra'}</Enlace>
                        {lugar(m.obra) && <> · {lugar(m.obra)}</>}
                    </span>
                )}
            </div>
            <div className="ca-mov-num">
                <b className={entra ? 'ca-mov-mas' : 'ca-mov-menos'} aria-label={`${entra ? 'Entran' : 'Salen'} ${certificados(Math.abs(m.creditos))}`}>
                    {entra ? '+' : '−'}{Math.abs(m.creditos)}
                </b>
                {Number.isInteger(m.saldo_despues) && <small>te quedan {m.saldo_despues}</small>}
            </div>
        </li>
    );
}

export default function MisGastos() {
    const { refrescar } = useCertappAuth();
    const { datos, error, cargando, recargar } = useCarga(async () => {
        const { data } = await axios.get(`${API}/movimientos`);
        if (!data?.resumen) throw new Error('Respuesta sin resumen');
        return { resumen: data.resumen, movimientos: comoLista(data, 'movimientos') };
    }, []);

    // Que el contador de arriba diga lo mismo que esta página.
    useEffect(() => { refrescar?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const r = datos?.resumen || null;
    const lista = useMemo(() => datos?.movimientos || [], [datos]);
    const disponibles = Number(r?.disponibles ?? 0);

    return (
        <div className="ca-col">
            {cargando && !datos ? (
                <Esqueleto alto={220} n={1} />
            ) : error && !datos ? (
                <ErrorRed error={error} onReintentar={() => recargar()} titulo="No hemos podido cargar tus certificados" />
            ) : (
                <section className="ca-card ca-pad ca-in">
                    <div className="ca-filete" />
                    <p className="ca-eyebrow" style={{ margin: 0 }}>Mis gastos</p>
                    <div className="ca-cifra" style={{ marginTop: 12 }}>
                        <b>{disponibles}</b>
                        <span>{disponibles === 1 ? 'certificado disponible' : 'certificados disponibles'}</span>
                    </div>
                    <div className="ca-gastos-kpis">
                        <div className="ca-kpi"><span>Usados</span><b>{r.usados}</b></div>
                        <div className="ca-kpi"><span>Recibidos gratis</span><b>{r.recibidos_gratis}</b></div>
                        <div className="ca-kpi"><span>Gastado</span><b>{euros(r.gastado_eur)}</b></div>
                    </div>
                    <p className="ca-peq" style={{ marginTop: 12 }}>
                        {r.compras_abiertas
                            ? 'Cada certificado que pides gasta uno. Si no podemos hacerlo, te lo devolvemos.'
                            : 'Estás en la beta: los certificados te los regalamos nosotros, así que no has pagado nada (0 €). Cada certificado que pides gasta uno y, si no podemos hacerlo, te lo devolvemos.'}
                    </p>
                </section>
            )}

            {(!r || !r.compras_abiertas) && (
                <section className="ca-card ca-pad ca-gastos-comprar ca-in-2">
                    <div className="ca-fila-top">
                        <h2 className="ca-display ca-h3" style={{ margin: 0 }}>Comprar certificados</h2>
                        <span className="ca-chip ca-chip-lima">Muy pronto</span>
                    </div>
                    <p className="ca-txt">
                        Cuando acabe la beta podrás comprar paquetes de certificados aquí mismo, con tu factura. Mientras tanto, si se te acaban, escríbenos y te damos más.
                    </p>
                    <div className="ca-btns">
                        <button type="button" className="ca-btn ca-btn-sec" disabled aria-disabled="true">Comprar · muy pronto</button>
                    </div>
                </section>
            )}

            <p className="ca-sec">Movimientos</p>
            {cargando && !datos ? (
                <Esqueleto alto={72} n={3} />
            ) : error && !datos ? null : !lista.length ? (
                <section className="ca-card ca-pad ca-vacio">
                    <h2 className="ca-display ca-h3" style={{ margin: 0 }}>Aún no hay movimientos</h2>
                    <p className="ca-txt">Aquí verás cada certificado que recibes y cada uno que gastas, con la obra en la que lo usaste.</p>
                </section>
            ) : (
                <ul className="ca-card ca-mov-lista">
                    {lista.map(m => <Movimiento key={m.id} m={m} />)}
                </ul>
            )}
            {error && datos && (
                <p className="ca-peq" style={{ marginTop: 10 }}>
                    No se ha podido actualizar. <button type="button" className="ca-link" onClick={() => recargar({ silencioso: true })}>Reintentar</button>
                </p>
            )}

            <p className="ca-peq" style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 6 }}>
                <IcoChat size={16} /> ¿Algo no cuadra? <Enlace to="/incidencias" className="ca-link">Cuéntanoslo</Enlace>
            </p>
        </div>
    );
}
