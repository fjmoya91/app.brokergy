import { Ico, eur, entero, AvisoFx } from '../../estilo';

// ─────────────────────────────────────────────────────────────────────────────
// El embudo de los presupuestos del año (`cuadro.presupuestos`): creados → salieron →
// contestados → aceptados. Un solo tono ordinal, de claro a oscuro (--o1…--o4). Los cuatro
// números son contajes de la API sumados por estado (no hay importes que volver a sumar):
//   creados     = con_partidas + antiguos (todos los del año, en cualquier estado)
//   salieron    = enviados + aceptados + rechazados
//   contestados = aceptados + rechazados
// Los presupuestos son de BROKERGY: con «Fran, autónomo» elegido no hay embudo.
// ─────────────────────────────────────────────────────────────────────────────

const TONOS = ['--o1', '--o2', '--o3', '--o4'];

function titular(tasa, salieron) {
    if (!salieron || tasa == null) return <>Aún no ha salido ningún presupuesto</>;
    const de10 = Math.round(tasa * 10);
    if (de10 >= 10) return <>Se ha aceptado <span className="fx-mark">todo</span> lo que ha salido</>;
    if (de10 <= 0) return <>De lo que ha salido, aún no se ha aceptado nada</>;
    return <>De cada 10 que salen, se aceptan <span className="fx-mark">{de10}</span></>;
}

export function Embudo({ p, anio, emisor, onEsperando, onVerSl }) {
    const cab = (h3) => (
        <div className="fx-card-cab">
            <div><div className="fx-eyebrow">Presupuestos {anio} · BROKERGY</div><h3 className="fx-display fx-h3">{h3}</h3></div>
        </div>
    );
    if (emisor !== 'SL') {
        return (<>
            {cab('Los presupuestos son de la sociedad')}
            <div className="fx-vacio fx-vacio-peq">
                <span className="fx-tile fx-tile-l fx-tile-crema"><Ico n="filtro" size={22} /></span>
                <p>Fran, como autónomo, solo factura a BROKERGY (la serie FML): no hace presupuestos.</p>
                <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={onVerSl}>Ver los de BROKERGY</button>
            </div>
        </>);
    }
    if (!p) return cab('Sin datos de presupuestos');

    const n = (g) => Number(g?.n) || 0;
    const creados = (Number(p.con_partidas) || 0) + (Number(p.antiguos) || 0);
    const salieron = n(p.enviados) + n(p.aceptados) + n(p.rechazados);
    const contestados = n(p.aceptados) + n(p.rechazados);
    const etapas = [
        { k: 'Creados', v: creados, pie: <><b>{entero(creados)}</b> en {anio}</> },
        { k: 'Salieron', v: salieron, de: 'creados' },
        { k: 'Contestados', v: contestados, de: 'que salieron' },
        { k: 'Aceptados', v: n(p.aceptados), de: 'contestados', imp: p.aceptados?.importe },
    ];
    const base = creados || 1;
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

    const resto = [
        n(p.rechazados) && `${entero(n(p.rechazados))} ${n(p.rechazados) === 1 ? 'rechazado' : 'rechazados'}`,
        n(p.borradores) && `${entero(n(p.borradores))} en borrador`,
        n(p.anulados) && `${entero(n(p.anulados))} ${n(p.anulados) === 1 ? 'anulado' : 'anulados'}`,
    ].filter(Boolean);

    return (<>
        {cab(titular(p.tasa_aceptacion, salieron))}
        <div className="fx-etapas">
            {etapas.map((e, i) => (
                <div key={e.k} className="fx-etapa">
                    <div className="fx-etapa-top"><span>{e.k}</span><b>{entero(e.v)}</b></div>
                    <div className="fx-pista" role="img" aria-label={`${e.k}: ${e.v} de ${creados}`}>
                        <i style={{ width: `${((e.v / base) * 100).toFixed(1)}%`, background: `var(${TONOS[i]})`, animationDelay: `${i * 90}ms` }} />
                    </div>
                    <small>
                        {i === 0 ? e.pie : <><b>{pct(e.v, etapas[i - 1].v)} %</b> de los {e.de}</>}
                        {e.imp ? <> · {eur(e.imp, 0)} sin IVA</> : null}
                    </small>
                </div>
            ))}
        </div>
        {n(p.enviados) > 0 && (
            <AvisoFx tono="ambar" icono="reloj" style={{ marginTop: 16 }}
                accion={<button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={onEsperando}>Ver {n(p.enviados) === 1 ? 'el enviado' : `los ${entero(n(p.enviados))}`}</button>}>
                <b>{entero(n(p.enviados))} {n(p.enviados) === 1 ? 'enviado espera' : 'enviados esperan'} respuesta</b>
                {p.enviados?.vistos ? <> ({entero(p.enviados.vistos)} ya {p.enviados.vistos === 1 ? 'lo ha visto' : 'los han visto'} el cliente)</> : null}. {eur(p.enviados?.importe || 0, 0)} sin IVA en juego.
            </AvisoFx>
        )}
        <p className="fx-emb-pie">
            {resto.length ? <>Además: {resto.join(', ').replace(/, ([^,]*)$/, ' y $1')}. </> : null}
            {p.antiguos ? <>{entero(p.antiguos)} {p.antiguos === 1 ? 'es una oferta' : 'son ofertas'} de CEE de antes de las partidas.</> : null}
        </p>
    </>);
}

export default Embudo;
