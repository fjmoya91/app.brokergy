import { AvisoIrpfEpnr } from './AvisoIrpfEpnr';

// ─────────────────────────────────────────────────────────────────────────────
// El CEE ANTERIOR que trae el cliente, en un CEE directo de UN solo certificado.
//
// El caso: el cliente hizo la obra (aerotermia, aires, placas) y ya tenía un CEE
// de ANTES, hecho por otro técnico. A nosotros solo nos contratan el de DESPUÉS,
// y lo que hay que saber es si el par vale para la deducción del IRPF (DA 50ª:
// ahorro ≥30 % en consumo de energía primaria no renovable, o letra A/B).
//
// REGLA — ese certificado NO es una fase del encargo. Vive en `cee.cee_anterior`,
// fuera de `cee_inicial`, porque en un encargo de alcance ÚNICO la fase que el
// módulo llama "inicial" es NUESTRO CEE. Cargarlo ahí pisaba los datos del
// nuestro (medido en 2026CEE_60, 01/10/2026: la demanda pasó de 180,37 a 127,8 y
// las fechas del 29/09 al 29/06, las del certificado del otro técnico).
//
// REGLA — solo INFORMA. Que el par cumpla el requisito técnico no es que al
// cliente le corresponda la deducción (plazos, base máxima, su declaración); lo
// dice el propio recuadro de la comprobación.
// ─────────────────────────────────────────────────────────────────────────────

const ROTULOS = {
    antes: 'CEE anterior',
    despues: 'Este encargo',
    inicial: 'CEE anterior del cliente',
    final: 'CEE de este encargo',
};

const FALTA = {
    inicial: {
        no_cargado: 'Carga el CEE anterior del cliente con «Cargar CEE por fichero» → «CEE anterior del cliente».',
        sin_dato: 'El CEE anterior se cargó sin leer su consumo de energía primaria no renovable. Vuelve a cargarlo con «Reemplazar» (el lector ya lo saca del PDF) o carga su .xml.',
    },
    final: {
        no_cargado: 'Falta el CEE de este encargo: sube su .xml en la casilla .XML de la rejilla. Con él se compara.',
        sin_dato: 'El CEE de este encargo se cargó de un PDF sin leer su consumo de energía primaria no renovable. Sube su .xml en la casilla .XML de la rejilla.',
    },
};

const n2 = (v) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaEs = (iso) => (/^\d{4}-\d{2}-\d{2}/.test(iso || '')
    ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

/**
 * @param {object}   props.cee       el `cee` del encargo (con `cee_anterior`)
 * @param {Function} props.onCargar  abrir el popup de carga para el CEE anterior
 * @param {Function} props.onQuitar  retirar el CEE anterior
 */
export function CeeAnteriorCliente({ cee, onCargar, onQuitar }) {
    const ant = cee?.cee_anterior;
    if (!ant) return null;

    // Lo que identifica al certificado: si es el que se cree. La fecha y la
    // superficie se enseñan porque son las dos que delatan un certificado de
    // otra vivienda (o el nuestro cargado por error).
    const partes = [
        fechaEs(ant.fechaFirma) && `Fecha ${fechaEs(ant.fechaFirma)}`,
        ant.superficieHabitable && `${n2(ant.superficieHabitable)} m²`,
        ant.epnrConsumo && `${n2(ant.epnrConsumo)} kWh/m²·año${ant.epnrLetra ? ` (${ant.epnrLetra})` : ''}`,
        ant.identificacion?.refCatastral,
    ].filter(Boolean);
    const origen = ant._origen === 'xml' ? 'leído del .xml' : 'leído del PDF con IA';

    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/35 mb-1">
                        CEE anterior del cliente · deducción IRPF
                    </div>
                    <div className="text-xs text-white/70 leading-relaxed">
                        {partes.join(' · ') || 'Cargado, pero sin datos legibles'}
                    </div>
                    <div className="text-[10px] text-white/35 mt-0.5">
                        {origen}{ant._fichero ? ` · ${ant._fichero}` : ''} · solo se usa para comparar: no es una fase de este encargo
                    </div>
                </div>
                <div className="flex gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={onCargar}
                        className="px-3 py-2 max-md:flex-1 max-md:py-3.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                        Reemplazar
                    </button>
                    <button
                        type="button"
                        onClick={onQuitar}
                        className="px-3 py-2 max-md:flex-1 max-md:py-3.5 rounded-lg bg-white/5 hover:bg-red-500/15 border border-white/10 hover:border-red-500/30 text-white/60 hover:text-red-300 text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                        Quitar
                    </button>
                </div>
            </div>

            <AvisoIrpfEpnr
                comparar={{
                    inicial: ant,
                    xmlInicial: null,
                    final: cee?.cee_inicial,
                    xmlFinal: cee?.xml_inicial,
                }}
                rotulos={ROTULOS}
                falta={FALTA}
            />
        </div>
    );
}

export default CeeAnteriorCliente;
