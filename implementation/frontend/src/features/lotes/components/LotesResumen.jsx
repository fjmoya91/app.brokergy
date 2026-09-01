import { useMemo } from 'react';
import { computeLotesResumen } from '../logic/loteEco';
import { peticionPrincipal } from '../logic/peticionesSo';
import { loteEstadoBadge } from '../loteConstants';

// ─────────────────────────────────────────────────────────────────────────────
// Cuadro de mando de la vista de Lotes. Está pensado para SENTARSE A REVISAR CON
// EL SUJETO OBLIGADO: de un vistazo, cuánto ahorro le hemos llevado, cuánto nos
// paga, cuánto nos queda a nosotros tras pagar los bonos, cuánto le cuesta la
// verificación y cuánto se ahorra frente a pagar la equivalencia financiera.
//
// Los IMPORTES resumen lo que se está viendo (respetan el filtro), porque si no el
// total de la cabecera no cuadraría con las tarjetas de abajo. Las PÍLDORAS de
// estado, en cambio, se calculan sobre TODOS los lotes y son el filtro en sí: si
// se calcularan sobre lo filtrado, al pinchar una desaparecerían las demás y no
// habría forma de cambiar de estado sin volver a "Todos".
//
// Los importes son precio de venta → solo ADMIN (`canSeeMargin`). El TRABAJADOR ve
// el ahorro, el volumen y el reparto por estado, que es lo que necesita para operar.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = (n, d = 1) => (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: d });

const TONOS = {
    neutral: 'bg-bkg-surface border-white/[0.06] text-white',
    brand:   'bg-brand/[0.06] border-brand/20 text-brand',
    emerald: 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-300',
    cyan:    'bg-cyan-500/[0.06] border-cyan-500/20 text-cyan-300',
    amber:   'bg-amber-500/[0.06] border-amber-500/20 text-amber-300',
};

const Tile = ({ label, valor, sub, tono = 'neutral', title }) => (
    <div title={title} className={`rounded-2xl border px-3 py-2.5 min-w-0 ${TONOS[tono]}`}>
        <p className="text-[8px] uppercase tracking-[0.15em] font-black opacity-50 truncate">{label}</p>
        {/* El tamaño baja en pantallas estrechas para que las seis tarjetas quepan
            sin partir el número por la mitad. */}
        <p className="text-lg xl:text-xl font-black leading-tight mt-0.5 truncate">{valor}</p>
        {sub && <p className="text-[9px] opacity-40 mt-0.5 leading-tight truncate">{sub}</p>}
    </div>
);

// Píldora de filtro. `activa` la resalta; volver a pulsarla quita el filtro.
const Pildora = ({ activa, onClick, className = '', children, title }) => (
    <button type="button" onClick={onClick} title={title}
        className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all hover:brightness-125 ${className} ${
            activa ? 'ring-2 ring-white/40 ring-offset-1 ring-offset-bkg-base' : 'opacity-80 hover:opacity-100'}`}>
        {children}
    </button>
);

export function LotesResumen({ lotes, todosLotes, canSeeMargin = false, filtroEstado = 'TODO', onFiltrar, onPedirAlSo }) {
    const r = useMemo(() => computeLotesResumen(lotes), [lotes]);
    const global = useMemo(() => computeLotesResumen(todosLotes || lotes), [todosLotes, lotes]);

    if (!global.nLotes) return null;

    const estados = Object.entries(global.porEstado).sort((a, b) => b[1] - a[1]);
    const aviso = r.nEstimados > 0
        ? `${r.nEstimados} de ${r.nLotes} sobre ahorro estimado (aún sin verificar)`
        : 'todo sobre ahorro verificado';
    const filtrar = (val) => onFiltrar && onFiltrar(filtroEstado === val ? 'TODO' : val);

    // Lo que HOY se le puede pedir al Sujeto Obligado sobre los lotes que se están
    // viendo. El botón vive aquí, y no en la cabecera junto a "Nuevo lote", porque
    // actúa sobre ESTE conjunto —el que deja el filtro— y porque las cifras que
    // manda son exactamente las de estas tarjetas. Si no hay nada que pedir, no hay
    // botón: uno deshabilitado con un tooltip obliga a pulsarlo para saber por qué.
    const peticion = useMemo(
        () => (canSeeMargin ? peticionPrincipal(lotes, r) : null),
        [lotes, r, canSeeMargin]);

    return (
        <div className="bg-bkg-surface/40 border border-white/[0.06] rounded-[1.75rem] p-4 sm:p-5 mb-5 space-y-3">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                    Resumen{filtroEstado !== 'TODO' ? ` · ${filtroEstado === 'DOC_PENDIENTE' ? 'con documentos por revisar' : filtroEstado}` : ''}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-[9px] text-white/25">
                        {r.nLotes} lote{r.nLotes === 1 ? '' : 's'} · {r.nExpedientes} expedientes · {aviso}
                    </p>
                    {/* La petición al S.O. y, debajo, lo que ya se le pidió. La NOTA
                        no es adorno: pedirlo no significa que lo haya pagado, así que
                        el botón sigue estando para insistir y esta línea es la única
                        señal en pantalla de que el envío anterior llegó a salir. En
                        reinsistencia el botón se pinta apagado —la acción no urge
                        igual— pero se pulsa lo mismo. */}
                    {peticion && onPedirAlSo && (
                        <div className="flex flex-col items-end gap-0.5">
                            <button type="button" onClick={() => onPedirAlSo(peticion)}
                                title={`${peticion.titulo} · ${peticion.lotes.length} lote${peticion.lotes.length === 1 ? '' : 's'}`}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${
                                    peticion.reinsistencia
                                        ? 'border-white/15 bg-white/[0.03] text-white/45 hover:text-white hover:border-white/30'
                                        : 'border-brand/40 bg-brand/10 text-brand hover:bg-brand/20'}`}>
                                ✉ {peticion.etiqueta}
                            </button>
                            {peticion.nota && (
                                <p className="text-[9px] text-white/25 normal-case">✓ {peticion.nota}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Todas las cifras en UNA fila. En pantallas estrechas se reparten en dos
                columnas y en tablet en tres, en vez de encogerse hasta no leerse. */}
            <div className={`grid gap-2 grid-cols-2 ${canSeeMargin ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-3'}`}>
                <Tile label="Ahorro generado" valor={`${num(r.ahorroGwh, 2)} GWh`} sub={`${num(r.ahorroMwh)} MWh`} />
                {canSeeMargin ? (
                    <>
                        <Tile tono="brand" label="Pago a Brokergy" valor={eur(r.pagoBrokergy)}
                            sub={r.brokergyMwh != null ? `${num(r.brokergyMwh, 2)} €/MWh medio` : null} />
                        <Tile tono="emerald" label="Beneficio Brokergy" valor={eur(r.beneficio)}
                            sub={r.margenMwh != null ? `${num(r.margenMwh, 2)} €/MWh margen` : null}
                            title={`Lo que nos queda: ${eur(r.pagoBrokergy)} que nos paga el S.O. menos ${eur(r.pagoCliente)} de bonos a los clientes.${
                                r.nSinOferta > 0 ? ` (${r.nSinOferta} lote${r.nSinOferta === 1 ? '' : 's'} sin oferta pactada: ahí cuenta el margen de cada expediente.)` : ''}`} />
                        <Tile tono="amber" label="Pago al verificador" valor={eur(r.pagoVerificador)}
                            sub={r.verificadorMwh != null ? `${num(r.verificadorMwh, 2)} €/MWh medio` : null} />
                        <Tile label="Coste total del S.O." valor={eur(r.costeSo)}
                            sub={r.costeSoMwh != null ? `${num(r.costeSoMwh, 2)} €/MWh` : null}
                            title="Lo que le cuesta la operación al Sujeto Obligado: lo que nos paga a nosotros más la verificación que contrata él." />
                        {r.ahorroSoTotal != null && (
                            <Tile tono="cyan" label="Ahorro del S.O." valor={eur(r.ahorroSoTotal)}
                                sub={`${num(r.ahorroSoPct, 1)} % · ${num(r.ahorroSoMwh, 2)} €/MWh`}
                                title={`Frente a pagar la equivalencia financiera de ${num(r.equivalenciaFinanciera, 2)} €/MWh, con nosotros le sale a ${num(r.costeSoMwh, 2)} €/MWh.`} />
                        )}
                    </>
                ) : (
                    <>
                        <Tile label="Expedientes" valor={r.nExpedientes} sub={`en ${r.nLotes} lote${r.nLotes === 1 ? '' : 's'}`} />
                        <Tile label="Lotes en curso" valor={estados.filter(([e]) => e !== 'FINALIZADO').reduce((a, [, n]) => a + n, 0)} />
                    </>
                )}
            </div>

            {/* Dónde está cada lote ahora mismo — y filtro: pinchar una filtra la lista. */}
            <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[9px] uppercase tracking-[0.2em] font-black text-white/25 mr-1">En curso</span>
                {estados.map(([estado, n]) => (
                    <Pildora key={estado} activa={filtroEstado === estado} onClick={() => filtrar(estado)}
                        className={loteEstadoBadge(estado)}
                        title={filtroEstado === estado ? 'Quitar el filtro' : `Ver solo los lotes en ${estado}`}>
                        {estado} · {n}
                    </Pildora>
                ))}
                {global.docsPendientes > 0 && (
                    <Pildora activa={filtroEstado === 'DOC_PENDIENTE'} onClick={() => filtrar('DOC_PENDIENTE')}
                        className="bg-cyan-500/10 text-cyan-300 border-cyan-500/30"
                        title="Documentos que el S.O. ha devuelto FIRMADOS y todavía no ha revisado nadie. Se marcan OK desde la pestaña Documentación del lote.">
                        {global.docsPendientes} firmado{global.docsPendientes === 1 ? '' : 's'} por revisar
                    </Pildora>
                )}
                {filtroEstado !== 'TODO' && (
                    <button type="button" onClick={() => onFiltrar && onFiltrar('TODO')}
                        className="text-[9px] font-black uppercase tracking-wider text-white/30 hover:text-white transition-colors ml-1">
                        ✕ Quitar filtro
                    </button>
                )}
            </div>
        </div>
    );
}

export default LotesResumen;
