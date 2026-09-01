import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extraerLineasPdf, parsearFacturaCertificador } from '../logic/facturaCertificadorParser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─────────────────────────────────────────────────────────────────────────────
// Conciliación de la factura MENSUAL del certificador.
//
// La tabla de seguimiento habla de expedientes; su factura habla de HITOS DE
// REGISTRO. Esta pantalla traduce entre las dos: para el mes elegido lista lo
// devengado (60 € de honorario por expediente, una sola vez, + 16,39 € por cada
// registro) y calcula los totales con la misma estructura que el pie de su
// factura — base, IVA 21 %, IRPF −15 %, suplidos — para poder cotejar el
// importe final de un vistazo.
//
// Al conciliar, cada concepto queda SELLADO con el nº y la fecha de la factura:
// no se puede pagar dos veces el mismo registro, y lo que quedó devengado y sin
// facturar aparece como ARRASTRE en los meses siguientes.
//
// Solo ADMIN: aquí se ven importes (ver `roleFlags`). El backend es la barrera
// real — todas estas rutas son `adminOnly`.
// ─────────────────────────────────────────────────────────────────────────────

const fmtEur = (n) => `${(Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fmtMes = (mes) => {
    if (!mes) return '—';
    const [a, m] = mes.split('-');
    return `${MESES[Number(m) - 1] || m} ${a}`;
};
const fmtDia = (d) => {
    if (!d) return '—';
    const [a, m, dd] = d.split('-');
    return `${dd}/${m}/${a}`;
};

const claveConcepto = (l, c) => `${l.expediente_id}:${c.concepto}`;

// Céntimo de tolerancia: los importes se comparan redondeados, no en binario.
const cuadra = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.005;

const ETIQUETA_CONCEPTO = {
    honorario: 'Honorario',
    tasa_inicial: 'Tasa CEE inicial',
    tasa_final: 'Tasa CEE final',
};

const inputCls = 'bg-bkg-surface border border-white/10 rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none focus:border-brand/40';

// El expediente se abre en una pestaña nueva para no perder la conciliación a
// medias (misma convención que el resto del modal).
// Un CEE directo vive en otra tabla y en otra pestaña: el mismo UUID no vale en
// las dos, así que el deep-link se elige por el origen que manda el backend.
const abrirExpediente = (id, origen) => window.open(
    origen === 'CEE' ? `/?tab=cee-directos&cee=${id}` : `/?tab=expedientes&exp=${id}`,
    '_blank', 'noopener,noreferrer',
);

const BotonExpediente = ({ id, origen, texto }) => (
    <button
        type="button"
        onClick={() => abrirExpediente(id, origen)}
        className="font-black underline decoration-dotted underline-offset-2 hover:text-white transition-colors"
        title={origen === 'CEE' ? 'Abrir el CEE directo en una pestaña nueva' : 'Abrir el expediente en una pestaña nueva'}
    >{texto}</button>
);

const COLOR_CONFIANZA = {
    ALTA: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10',
    REVISAR: 'text-amber-400 border-amber-500/30 bg-amber-500/10',
    SIN_MATCH: 'text-red-400 border-red-500/30 bg-red-500/10',
};
const TXT_CONFIANZA = { ALTA: 'Segura', REVISAR: 'Revisar', SIN_MATCH: 'Sin match' };

/**
 * Vista de una factura IMPORTADA: una fila por línea del PDF con el expediente
 * que le propone el backend y los conceptos que sellaría.
 *
 * A diferencia de la vista mensual, aquí manda la factura y no el calendario:
 * el certificador mete en la misma factura registros de varios meses, y
 * obligarle a saltar de mes para sellarlos sería justo lo contrario de ágil.
 */
function VistaFactura({ datos, factura, setFactura, marcas, setMarcas, onSellar, onSalir, guardando, aviso }) {
    const { lineas, resumen, emisor } = datos;
    // Factura de OTRO certificador: se enseña para que se vea el error, pero no
    // se puede sellar — emparejaría contra los expedientes de quien no es.
    const emisorAjeno = emisor?.estado === 'OTRO';

    const clave = (l, c) => `${l.idx}:${c.concepto}`;
    const marcado = (l, c) => marcas[clave(l, c)] ?? false;
    const alterna = (l, c) => setMarcas(p => ({ ...p, [clave(l, c)]: !marcado(l, c) }));
    // Marcar la línea entera de una vez. Lo normal es aceptar o rechazar la línea
    // completa; desglosarla concepto a concepto solo hace falta cuando hay que
    // decidir cuál de las tasas corresponde.
    const alternaLinea = (l, cs) => {
        const todos = cs.every(c => marcado(l, c));
        setMarcas(p => ({ ...p, ...Object.fromEntries(cs.map(c => [clave(l, c), !todos])) }));
    };

    // Lo que de verdad se viene a mirar: cuánto de la factura respalda la app,
    // cuánto no, y en qué líneas el importe no es el esperado. Sin esto hay que
    // sumar de cabeza, que es justo lo que se quería evitar.
    const analisis = useMemo(() => {
        let respaldado = 0, sinRespaldo = 0;
        const nSinRespaldo = [];
        const desviaciones = [];
        for (const l of lineas) {
            const imp = l.importe || 0;
            if (!l.match || !l.conceptos.length) { sinRespaldo += imp; nSinRespaldo.push(l); continue; }
            respaldado += imp;
            // En un suplido, lo esperado es la tasa por cada registro FACTURADO,
            // no por cada uno devengado: si cobra 1 y hay 2, no es una desviación
            // de importe sino algo que decidir a mano (ya sale como aviso).
            const unidad = l.conceptos[0]?.importe_esperado || 0;
            const esperado = l.tipo === 'suplido'
                ? Math.min(l.conceptos.length, l.unidades || 1) * unidad
                : l.conceptos.reduce((s, c) => s + (c.importe_esperado || 0), 0);
            if (Math.abs(imp - esperado) >= 0.01) desviaciones.push({ l, esperado });
        }
        return {
            respaldado: Math.round(respaldado * 100) / 100,
            sinRespaldo: Math.round(sinRespaldo * 100) / 100,
            lineasSinRespaldo: nSinRespaldo,
            desviaciones,
            // Un mismo expediente sale DOS veces en la factura (su honorario y
            // sus tasas), así que su aviso llegaba repetido: cuatro asuntos se
            // leían como ocho y llenaban la caja que hay que mirar antes de
            // pagar. Se agrupa por el texto, que ya empieza por el número.
            avisos: [...new Map(lineas.filter(l => l.aviso).map(l => [l.aviso, l])).values()],
        };
    }, [lineas]);

    // Un concepto ya facturado en otra factura no se puede volver a sellar.
    const sellables = lineas.flatMap(l => l.conceptos.filter(c => !c.ya_facturado).map(c => ({ l, c })));
    const nMarcados = sellables.filter(({ l, c }) => marcado(l, c)).length;

    return (
        <div className="flex flex-col min-h-0 gap-4 flex-1 px-6 py-5">
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[220px]">
                    {/* Editables: no todas las plantillas traen nº y fecha, y sin
                        fecha no se puede sellar. */}
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            value={factura.numero}
                            onChange={e => setFactura(f => ({ ...f, numero: e.target.value }))}
                            placeholder="Nº factura"
                            className={`${inputCls} w-36 font-bold ${!factura.numero ? 'border-amber-500/40' : ''}`}
                        />
                        <input
                            type="date"
                            value={factura.fecha}
                            onChange={e => setFactura(f => ({ ...f, fecha: e.target.value }))}
                            className={`${inputCls} w-36 ${!factura.fecha ? 'border-amber-500/40' : ''}`}
                        />
                        {!factura.fecha && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">
                                Esta factura no trae fecha: escríbela
                            </span>
                        )}
                    </div>
                    {/* Nada de enseñar aquí la suma del desglose: no coincide con
                        ningún número de la factura (va sin IVA ni IRPF) y solo
                        siembra dudas. El importe que importa está en el veredicto. */}
                    <p className="text-[10px] text-white/40 mt-1.5">
                        {resumen.total_lineas} líneas ·
                        <span className="text-emerald-400"> {resumen.alta} seguras</span>
                        {resumen.revisar > 0 && <span className="text-amber-400"> · {resumen.revisar} a revisar</span>}
                        {resumen.sin_match > 0 && <span className="text-red-400"> · {resumen.sin_match} sin match</span>}
                    </p>
                </div>
                <button
                    onClick={onSalir}
                    className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                >← Volver al mes</button>
            </div>

            {emisorAjeno && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/40">
                    <p className="text-[11px] font-black uppercase tracking-widest text-red-400">
                        ⛔ Esta factura no es de {emisor.esperado}
                    </p>
                    <p className="text-[10px] text-white/60 mt-1 leading-relaxed">
                        La emite <strong className="text-white">{emisor.emisor}</strong>. Ciérrala y súbela desde su ficha:
                        aquí se emparejaría contra los expedientes de otro certificador. No se puede sellar.
                    </p>
                </div>
            )}

            {emisor?.estado === 'DESCONOCIDO' && (
                <p className="text-[10px] font-bold text-amber-400 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 leading-relaxed">
                    ⚠ No he podido comprobar que esta factura sea de {emisor.esperado} — no encuentro su NIF en el PDF.
                    Confirma tú que es la correcta antes de sellar.
                </p>
            )}

            {emisor?.estado === 'SIN_CIF_EN_FICHA' && (
                <p className="text-[10px] font-bold text-amber-400 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20 leading-relaxed">
                    ⚠ {emisor.esperado} no tiene NIF en su ficha, así que no puedo comprobar que la factura sea suya.
                    Rellénalo y podré verificarlo solo.
                </p>
            )}

            {/* El veredicto, arriba del todo: lo primero que se quiere saber es
                cuánto hay que pagarle y qué no cuadra. */}
            <div className="grid md:grid-cols-[1fr_1.4fr] gap-3">
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">La factura pide</p>
                    <p className="text-2xl font-black text-brand tabular-nums mt-0.5">
                        {factura.total ? fmtEur(factura.total) : '—'}
                    </p>
                    <div className="mt-3 space-y-1">
                        <div className="flex justify-between items-baseline">
                            <span className="text-[10px] text-emerald-400">Respaldado por la app</span>
                            <span className="text-[11px] font-bold text-emerald-400 tabular-nums">{fmtEur(analisis.respaldado)}</span>
                        </div>
                        <div className="flex justify-between items-baseline">
                            <span className="text-[10px] text-amber-400">Sin respaldo ({analisis.lineasSinRespaldo.length})</span>
                            <span className="text-[11px] font-bold text-amber-400 tabular-nums">{fmtEur(analisis.sinRespaldo)}</span>
                        </div>
                    </div>
                    <p className="text-[9px] text-white/25 mt-2 leading-snug">
                        Importes del desglose, sin IVA ni IRPF. «Sin respaldo» no significa mal: puede ser un
                        expediente que no está en la app.
                    </p>
                </div>

                {/* Todo lo que hay que mirar antes de pagar, junto y en una lista.
                    Antes esto vivía disperso en celdas grises de la tabla. */}
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">
                        Qué revisar antes de pagar
                    </p>
                    {!datos.descuadres?.length && !analisis.desviaciones.length && !analisis.avisos.length && !analisis.lineasSinRespaldo.length && (
                        <p className="text-[11px] text-emerald-400 font-bold">✓ Nada que objetar: todo cuadra con la app.</p>
                    )}
                    <ul className="space-y-1.5">
                        {(datos.descuadres || []).map((d, i) => (
                            <li key={`d${i}`} className="text-[10px] text-red-400 leading-relaxed">
                                <strong>Su suma no cuadra.</strong> {d} Revisa si hay una línea repetida.
                            </li>
                        ))}
                        {analisis.desviaciones.map(({ l, esperado }, i) => (
                            <li key={`v${i}`} className="text-[10px] text-amber-400 leading-relaxed">
                                <BotonExpediente id={l.match.expediente_id} origen={l.match.origen} texto={l.match.numero_expediente} />
                                {' '}— cobra {fmtEur(l.importe)} y esperabas {fmtEur(esperado)}
                                <span className="text-white/40"> ({l.importe > esperado ? '+' : ''}{fmtEur(l.importe - esperado)})</span>
                            </li>
                        ))}
                        {analisis.avisos.map((l, i) => (
                            <li key={`a${i}`} className="text-[10px] text-amber-400/90 leading-relaxed">
                                {l.aviso}
                                {/* Enlace directo: el aviso casi siempre acaba en
                                    "revísalo", y buscarlo a mano era un viaje. */}
                                {l.aviso_ref && (
                                    <> <BotonExpediente id={l.aviso_ref.expediente_id} origen={l.aviso_ref.origen} texto={l.aviso_ref.origen === 'CEE' ? 'Abrir el CEE ↗' : 'Abrir expediente ↗'} /></>
                                )}
                            </li>
                        ))}
                        {analisis.lineasSinRespaldo.length > 0 && (
                            <li className="text-[10px] text-white/40 leading-relaxed">
                                <strong className="text-white/60">{analisis.lineasSinRespaldo.length} línea{analisis.lineasSinRespaldo.length === 1 ? '' : 's'} sin match</strong> por {fmtEur(analisis.sinRespaldo)}:
                                no salen de ningún expediente suyo en la app. Compruébalas a mano.
                            </li>
                        )}
                    </ul>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar max-h-[46vh]">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-bkg-deep z-10">
                        <tr className="border-b border-white/[0.06]">
                            {['', 'Línea de la factura', 'Importe', 'Expediente propuesto', 'Sellaría'].map((h, i) => (
                                <th key={i} className="pb-2 text-[9px] font-black uppercase tracking-widest text-white/25 whitespace-nowrap pr-4">{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {lineas.map(l => {
                            const disponibles = l.conceptos.filter(c => !c.ya_facturado);
                            const desv = analisis.desviaciones.find(d => d.l.idx === l.idx);
                            // La app tiene más tasas devengadas que las que cobra la
                            // línea: hay que decir cuál se está pagando.
                            const necesitaElegir = l.tipo === 'suplido' && disponibles.length > (l.unidades || 1);
                            return (
                                <tr key={l.idx} className={`border-b border-white/[0.03] align-top ${l.confianza === 'SIN_MATCH' ? 'opacity-50' : ''} ${desv ? 'bg-amber-500/[0.06]' : ''}`}>
                                    <td className="py-2 pr-2 pl-1">
                                        <span className={`inline-block px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border whitespace-nowrap ${COLOR_CONFIANZA[l.confianza]}`}>
                                            {TXT_CONFIANZA[l.confianza]}
                                        </span>
                                    </td>
                                    <td className="py-2 pr-4 max-w-[300px]">
                                        <span className="text-[10px] text-white/60 leading-snug">{l.descripcion}</span>
                                        <span className="block text-[9px] font-black uppercase tracking-wider text-white/25">
                                            {l.tipo === 'suplido' ? `Suplido · ${l.unidades} tasa${l.unidades === 1 ? '' : 's'}` : 'Trabajo'}
                                        </span>
                                    </td>
                                    <td className="py-2 pr-4">
                                        <span className={`text-[11px] whitespace-nowrap ${desv ? 'font-bold text-amber-400' : 'text-white/70'}`}>
                                            {fmtEur(l.importe)}
                                        </span>
                                        {desv && (
                                            <span className="block text-[9px] text-white/30 whitespace-nowrap">
                                                esperado {fmtEur(desv.esperado)}
                                            </span>
                                        )}
                                    </td>
                                    <td className="py-2 pr-4 max-w-[230px]">
                                        {l.match ? (
                                            <>
                                                <span className="text-[11px] font-bold text-white whitespace-nowrap">{l.match.numero_expediente}</span>
                                                <span className="block text-[9px] text-white/30 leading-snug">{l.match.ubicacion || l.match.cliente_nombre}</span>
                                            </>
                                        ) : <span className="text-[10px] text-white/20">—</span>}
                                        {l.aviso && <span className="block text-[9px] text-amber-400/80 leading-snug mt-0.5">⚠ {l.aviso}</span>}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {!disponibles.length && (
                                            <span className="text-[10px] text-white/20">
                                                {l.conceptos.length ? 'ya facturado' : '—'}
                                            </span>
                                        )}

                                        {/* Un único check por línea. Solo se abre en
                                            conceptos cuando hay que elegir cuál de las
                                            tasas cubre lo que factura. */}
                                        {disponibles.length > 0 && !necesitaElegir && (
                                            <label
                                                className="flex items-center gap-1.5 cursor-pointer py-0.5"
                                                title={disponibles.map(c => `${ETIQUETA_CONCEPTO[c.concepto]} · ${fmtEur(c.importe_esperado)} · ${fmtMes(c.mes)}`).join('\n')}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={disponibles.every(c => marcado(l, c))}
                                                    onChange={() => alternaLinea(l, disponibles)}
                                                    className="accent-emerald-500 cursor-pointer"
                                                />
                                                <span className="text-[10px] text-white/60 whitespace-nowrap">
                                                    {disponibles.length === 1
                                                        ? ETIQUETA_CONCEPTO[disponibles[0].concepto]
                                                        : `${disponibles.length} conceptos`}
                                                    {' · '}{fmtEur(disponibles.reduce((s, c) => s + c.importe_esperado, 0))}
                                                </span>
                                            </label>
                                        )}

                                        {necesitaElegir && (
                                            <>
                                                <span className="block text-[9px] font-black uppercase tracking-wider text-amber-400 mb-0.5">
                                                    Elige cuál
                                                </span>
                                                {disponibles.map(c => (
                                                    <label key={c.concepto} className="flex items-center gap-1.5 cursor-pointer py-0.5">
                                                        <input
                                                            type="checkbox"
                                                            checked={marcado(l, c)}
                                                            onChange={() => alterna(l, c)}
                                                            className="accent-emerald-500 cursor-pointer"
                                                        />
                                                        <span className="text-[10px] text-white/60 whitespace-nowrap">
                                                            {ETIQUETA_CONCEPTO[c.concepto]} · {fmtEur(c.importe_esperado)}
                                                        </span>
                                                    </label>
                                                ))}
                                            </>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
                {aviso && (
                    <p className={`text-[10px] font-bold ${aviso.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{aviso.txt}</p>
                )}
                <div className="flex-1" />
                <button
                    onClick={onSellar}
                    disabled={guardando || !nMarcados || emisorAjeno}
                    title={emisorAjeno ? 'La factura es de otro certificador' : undefined}
                    className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-30 transition-all"
                >
                    {guardando ? 'Guardando…' : `Marcar como facturado (${nMarcados})`}
                </button>
            </div>
        </div>
    );
}

export default function CertificadorFacturacionPanel({ prescriptorId, certificadorNombre }) {
    const [mes, setMes] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Marcas de conciliación: qué conceptos aparecen en la factura recibida y por
    // qué importe. Se rehacen al cambiar de mes (son de la factura, no del mes).
    const [marcas, setMarcas] = useState({});

    // Datos de la factura recibida, para sellar y para comparar el total.
    const [factura, setFactura] = useState({ numero: '', fecha: '', total: '' });

    const [editandoTarifas, setEditandoTarifas] = useState(false);
    const [tarifasForm, setTarifasForm] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState(null);

    // El certificador no factura siempre lo del mes exacto: cuela registros de
    // meses anteriores que se le quedaron sin facturar. Con esto se pueden
    // sellar en la misma factura sin cambiar de mes.
    const [incluirArrastre, setIncluirArrastre] = useState(false);

    // La vista mensual es de CONSULTA. El modo manual devuelve las casillas para
    // el caso en que la factura llegue en un formato que el parser no sepa leer
    // (pasa: una misma certificadora ha usado dos plantillas distintas).
    const [modoManual, setModoManual] = useState(false);

    // Factura importada desde su PDF: manda ella y no el calendario.
    const [importada, setImportada] = useState(null);
    const [marcasFactura, setMarcasFactura] = useState({});
    const [importando, setImportando] = useState(false);

    const cargar = (mesPedido) => {
        setLoading(true);
        setError(null);
        axios.get(`/api/prescriptores/${prescriptorId}/facturacion-certificador`, { params: { mes: mesPedido || undefined } })
            .then(r => {
                setData(r.data);
                setMes(r.data.mes || '');
                // Nada premarcado: la vista mensual solo informa de lo devengado.
                // Anunciar "cuadra" sin haber comparado con ninguna factura era
                // información falsa.
                setMarcas({});
            })
            .catch(err => setError(err.response?.data?.error || 'No se pudo calcular la facturación.'))
            .finally(() => setLoading(false));
    };

    useEffect(() => { if (prescriptorId) cargar(); }, [prescriptorId]);

    const cambiarMes = (m) => { setMes(m); setFactura({ numero: '', fecha: '', total: '' }); setIncluirArrastre(false); cargar(m); };

    const marcaDe = (l, c) => marcas[claveConcepto(l, c)] || { marcado: false, importe: String(c.importe) };
    const setMarca = (l, c, patch) => setMarcas(prev => ({
        ...prev,
        [claveConcepto(l, c)]: { ...marcaDe(l, c), ...patch },
    }));

    // Lo que se concilia: el mes elegido y, si se pide, el arrastre. Un mismo
    // expediente puede aportar a los dos (honorario en junio, tasa final en
    // julio), así que se fusionan por expediente para que salga UNA línea, como
    // en la factura.
    const lineas = useMemo(() => {
        if (!data) return [];
        if (!incluirArrastre || !data.arrastre.length) return data.lineas;
        const porId = new Map(data.lineas.map(l => [l.expediente_id, { ...l, conceptos: [...l.conceptos] }]));
        for (const a of data.arrastre) {
            const ya = porId.get(a.expediente_id);
            if (ya) ya.conceptos = [...a.conceptos, ...ya.conceptos];
            else porId.set(a.expediente_id, { ...a, conceptos: [...a.conceptos] });
        }
        return [...porId.values()].sort((x, y) =>
            (x.numero_expediente || '').localeCompare(y.numero_expediente || '', 'es', { numeric: true }));
    }, [data, incluirArrastre]);

    // Lo devengado en lo que se está viendo, y cuánto de eso ya está facturado.
    // Es la lectura útil de la vista mensual: "esto es lo que te debería pasar".
    const resumenMes = useMemo(() => {
        let total = 0, facturado = 0, nTotal = 0, nFacturados = 0;
        for (const l of lineas) {
            for (const c of l.conceptos) {
                total += c.importe; nTotal++;
                if (c.sello) { facturado += c.sello.importe ?? c.importe; nFacturados++; }
            }
        }
        const r = (n) => Math.round(n * 100) / 100;
        return { total: r(total), facturado: r(facturado), pendiente: r(total - facturado), nTotal, nFacturados };
    }, [lineas]);

    // Los tres cubos de la conciliación, sobre los conceptos NO sellados.
    const cubos = useMemo(() => {
        const out = { cuadra: [], desviado: [], noFacturado: [] };
        for (const l of lineas) {
            for (const c of l.conceptos) {
                if (c.sello) continue;
                const m = marcaDe(l, c);
                if (!m.marcado) out.noFacturado.push({ l, c });
                else if (cuadra(m.importe, c.importe)) out.cuadra.push({ l, c });
                else out.desviado.push({ l, c, facturado: Number(m.importe) });
            }
        }
        return out;
    }, [lineas, marcas]);

    // Total que DEBERÍA traer la factura según lo marcado: base con IVA e IRPF,
    // más los suplidos, que no llevan IVA.
    const totalMarcado = useMemo(() => {
        const t = data?.tarifas;
        if (!t) return null;
        let base = 0, suplidos = 0;
        for (const l of lineas) {
            for (const c of l.conceptos) {
                if (c.sello) continue;
                const m = marcaDe(l, c);
                if (!m.marcado) continue;
                const imp = Number(m.importe) || 0;
                if (c.tipo === 'trabajo') base += imp; else suplidos += imp;
            }
        }
        const r = (n) => Math.round(n * 100) / 100;
        const iva = r(base * t.iva / 100);
        const irpf = r(base * t.irpf / 100);
        const trabajos = r(base + iva - irpf);
        return { base: r(base), iva, irpf, trabajos, suplidos: r(suplidos), total: r(trabajos + suplidos) };
    }, [lineas, marcas, data]);

    // Diferencia contra el importe que realmente pone la factura. Si sale
    // positiva, te está cobrando algo que no consta registrado en este mes.
    const difFactura = useMemo(() => {
        const recibido = parseFloat(String(factura.total).replace(',', '.'));
        if (!Number.isFinite(recibido) || !totalMarcado) return null;
        return Math.round((recibido - totalMarcado.total) * 100) / 100;
    }, [factura.total, totalMarcado]);

    /**
     * Lee el PDF de la factura en el navegador (pdf.js ya está en el bundle) y
     * pide al backend el emparejamiento. El PDF NO se sube: solo viajan las
     * líneas de texto ya parseadas.
     */
    const importarPdf = async (file) => {
        if (!file) return;
        setImportando(true);
        setAviso(null);
        try {
            const buffer = await file.arrayBuffer();
            const crudas = await extraerLineasPdf(pdfjsLib, buffer);
            const parseada = parsearFacturaCertificador(crudas);

            if (!parseada.items.length) {
                throw new Error('No se ha reconocido ninguna línea. ¿Es una factura del certificador?');
            }

            const { data: conciliada } = await axios.post(
                `/api/prescriptores/${prescriptorId}/facturacion-certificador/conciliar`,
                { numero: parseada.numero, fecha: parseada.fecha, items: parseada.items, nifs: parseada.nifs }
            );

            // Se premarcan solo las líneas SEGURAS y sin aviso: lo dudoso lo
            // decide una persona, que aquí se está moviendo dinero. Si la factura
            // resulta ser de OTRO certificador no se premarca nada.
            const iniciales = {};
            const emisorAjeno = conciliada.emisor?.estado === 'OTRO';
            for (const l of conciliada.lineas) {
                if (emisorAjeno || l.confianza !== 'ALTA' || l.aviso) continue;
                for (const c of l.conceptos) {
                    if (!c.ya_facturado) iniciales[`${l.idx}:${c.concepto}`] = true;
                }
            }
            setMarcasFactura(iniciales);
            // Los descuadres los detecta el parser comparando el desglose con los
            // totales que la propia factura declara en su pie.
            setImportada({ ...conciliada, descuadres: parseada.descuadres || [] });
            // El nº y la fecha quedan editables: hay plantillas que no los traen
            // donde el parser sabe buscarlos, y sin fecha no se puede sellar.
            setFactura({
                numero: conciliada.factura.numero || '',
                fecha: conciliada.factura.fecha || '',
                total: parseada.declarados?.total ? String(parseada.declarados.total) : '',
            });
        } catch (err) {
            // `arriba` porque al fallar la importación no se llega a la vista de
            // factura y el aviso del pie queda fuera de pantalla.
            setAviso({ tipo: 'error', arriba: true, txt: err.response?.data?.error || err.message || 'No se pudo leer la factura.' });
        } finally {
            setImportando(false);
        }
    };

    const sellarDesdeFactura = () => {
        const conceptos = [];
        for (const l of importada.lineas) {
            for (const c of l.conceptos) {
                if (c.ya_facturado || !marcasFactura[`${l.idx}:${c.concepto}`]) continue;
                // El honorario se lleva el importe de su línea; cada tasa, el
                // precio unitario (una línea de suplido cubre 1 o 2 registros).
                const importe = l.tipo === 'suplido'
                    ? Math.round((l.importe / Math.max(1, l.unidades)) * 100) / 100
                    : l.importe;
                conceptos.push({ expediente_id: l.match.expediente_id, concepto: c.concepto, importe });
            }
        }
        if (!conceptos.length) return setAviso({ tipo: 'error', txt: 'No hay nada marcado.' });
        if (!factura.numero.trim()) return setAviso({ tipo: 'error', txt: 'Falta el número de factura.' });
        if (!factura.fecha) return setAviso({ tipo: 'error', txt: 'Falta la fecha de la factura.' });

        setGuardando(true);
        axios.post(`/api/prescriptores/${prescriptorId}/facturacion-certificador/sellar`, {
            factura: factura.numero.trim(),
            fecha: factura.fecha,
            conceptos,
        })
            .then(r => {
                setAviso({ tipo: 'ok', txt: `Facturados ${r.data.sellados} conceptos de ${r.data.expedientes} expedientes.` });
                setImportada(null);
                setMarcasFactura({});
                cargar(mes);
            })
            .catch(err => setAviso({ tipo: 'error', txt: err.response?.data?.error || 'No se pudo sellar.' }))
            .finally(() => setGuardando(false));
    };

    const guardarTarifas = () => {
        setGuardando(true);
        axios.patch(`/api/prescriptores/${prescriptorId}/facturacion-certificador/tarifas`, tarifasForm)
            .then(() => { setEditandoTarifas(false); cargar(mes); })
            .catch(err => setAviso({ tipo: 'error', txt: err.response?.data?.error || 'No se pudieron guardar las tarifas.' }))
            .finally(() => setGuardando(false));
    };

    const sellar = () => {
        const conceptos = [];
        for (const l of lineas) {
            for (const c of l.conceptos) {
                if (c.sello) continue;
                const m = marcaDe(l, c);
                if (m.marcado) conceptos.push({ expediente_id: l.expediente_id, concepto: c.concepto, importe: Number(m.importe) });
            }
        }
        if (!conceptos.length) return setAviso({ tipo: 'error', txt: 'No hay ningún concepto marcado.' });
        if (!factura.numero.trim()) return setAviso({ tipo: 'error', txt: 'Falta el número de factura.' });
        if (!factura.fecha) return setAviso({ tipo: 'error', txt: 'Falta la fecha de la factura.' });

        setGuardando(true);
        axios.post(`/api/prescriptores/${prescriptorId}/facturacion-certificador/sellar`, {
            factura: factura.numero.trim(), fecha: factura.fecha, conceptos,
        })
            .then(r => {
                setAviso({ tipo: 'ok', txt: `Facturados ${r.data.sellados} conceptos de ${r.data.expedientes} expedientes.` });
                cargar(mes);
            })
            .catch(err => setAviso({ tipo: 'error', txt: err.response?.data?.error || 'No se pudo sellar.' }))
            .finally(() => setGuardando(false));
    };

    const desellar = (l, c) => {
        setGuardando(true);
        axios.post(`/api/prescriptores/${prescriptorId}/facturacion-certificador/desellar`, {
            expediente_id: l.expediente_id, concepto: c.concepto,
        })
            .then(() => cargar(mes))
            .catch(err => setAviso({ tipo: 'error', txt: err.response?.data?.error || 'No se pudo quitar el sello.' }))
            .finally(() => setGuardando(false));
    };

    // CSV con una fila por CONCEPTO: es la granularidad de la factura, y así se
    // puede pegar al lado de la suya en Excel y comparar línea a línea.
    const exportar = () => {
        const CAB = ['Expediente', 'Cliente', 'Ubicación', 'Concepto', 'Descripción', 'Fecha registro', 'Importe esperado', 'Facturado', 'Estado'];
        const celda = (v) => {
            const s = (v ?? '').toString();
            return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const filas = [CAB.join(';')];
        for (const l of lineas) {
            for (const c of l.conceptos) {
                const m = marcaDe(l, c);
                const estado = c.sello ? `Facturado (${c.sello.factura})` : m.marcado ? 'En la factura' : 'NO facturado';
                filas.push([
                    l.numero_expediente, l.cliente_nombre, l.ubicacion,
                    ETIQUETA_CONCEPTO[c.concepto] || c.concepto, c.descripcion, fmtDia(c.fecha),
                    String(c.importe).replace('.', ','),
                    c.sello ? String(c.sello.importe).replace('.', ',') : (m.marcado ? String(m.importe).replace('.', ',') : ''),
                    estado,
                ].map(celda).join(';'));
            }
        }
        const blob = new Blob(['﻿' + filas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `facturacion-${(certificadorNombre || 'certificador').replace(/[^\w-]+/g, '_')}-${mes}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading && !data) return <p className="text-center text-white/30 text-xs py-10">Calculando facturación…</p>;
    if (error) return <p className="text-center text-red-400 text-xs py-10">{error}</p>;
    if (!data) return null;

    if (!data.meses_disponibles.length) {
        return <p className="text-center text-white/30 text-xs py-10">Este certificador no tiene ningún CEE registrado todavía.</p>;
    }

    const t = data.tarifas;

    // Con una factura importada manda ella: enseña justo lo que cubre, sin el
    // filtro de mes de por medio.
    if (importada) {
        return (
            <VistaFactura
                datos={importada}
                factura={factura}
                setFactura={setFactura}
                marcas={marcasFactura}
                setMarcas={setMarcasFactura}
                onSellar={sellarDesdeFactura}
                onSalir={() => { setImportada(null); setMarcasFactura({}); setAviso(null); }}
                guardando={guardando}
                aviso={aviso}
            />
        );
    }

    return (
        <div className="flex flex-col min-h-0 gap-4 flex-1 px-6 py-5">

            {/* Mes + tarifas + exportación */}
            <div className="flex flex-wrap items-center gap-2">
                <select
                    value={mes}
                    onChange={e => cambiarMes(e.target.value)}
                    className="bg-bkg-surface border border-brand/30 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-brand focus:outline-none"
                >
                    {data.meses_disponibles.map(m => <option key={m} value={m}>{fmtMes(m)}</option>)}
                </select>

                <button
                    onClick={() => { setTarifasForm({ ...t }); setEditandoTarifas(v => !v); }}
                    className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
                    title="Honorario por expediente, tasa por registro, IVA, IRPF y si adelanta las tasas"
                >
                    Tarifas: {fmtEur(t.honorario)} + {fmtEur(t.tasa)}/registro
                    {t.adelanta_tasas !== false && <span className="text-white/25"> · adelanta tasas</span>}
                </button>

                <div className="flex-1" />

                {/* La vía rápida: se suelta el PDF de su factura y la app propone
                    el emparejamiento. El PDF se lee aquí, no se sube a ningún sitio. */}
                <label className={`px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest transition-all ${importando ? 'opacity-50' : 'hover:bg-brand/20 cursor-pointer'}`}>
                    {importando ? 'Leyendo…' : '↑ Importar factura (PDF)'}
                    <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={importando}
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; importarPdf(f); }}
                    />
                </label>

                <button
                    onClick={exportar}
                    disabled={!lineas.length}
                    className="px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-30 transition-all"
                >
                    ↓ Excel del mes
                </button>
            </div>

            {aviso?.arriba && (
                <p className={`text-[10px] font-bold p-3 rounded-xl border ${
                    aviso.tipo === 'ok' ? 'text-emerald-400 bg-emerald-500/[0.06] border-emerald-500/20'
                                        : 'text-red-400 bg-red-500/[0.06] border-red-500/20'}`}>
                    {aviso.txt}
                </p>
            )}

            {editandoTarifas && tarifasForm && (
                <div className="flex flex-wrap items-end gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    {[
                        { k: 'honorario', label: 'Honorario / expediente (€)', hint: 'Una sola vez, con el primer registro' },
                        { k: 'tasa', label: 'Tasa / registro (€)', hint: 'Suplido, sin IVA' },
                        { k: 'iva', label: 'IVA (%)', hint: 'Sobre honorarios' },
                        { k: 'irpf', label: 'Retención IRPF (%)', hint: 'Sobre honorarios' },
                    ].map(f => (
                        <label key={f.k} className="flex flex-col gap-1">
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/30">{f.label}</span>
                            <input
                                type="number" step="0.01" min="0"
                                value={tarifasForm[f.k]}
                                onChange={e => setTarifasForm(p => ({ ...p, [f.k]: e.target.value }))}
                                className={`${inputCls} w-32`}
                            />
                            <span className="text-[9px] text-white/20">{f.hint}</span>
                        </label>
                    ))}
                    {/* Con el pacto de adelanto, el certificador pone las dos tasas
                        de su bolsillo y las factura en el primer pago. Si no, cada
                        tasa se paga contra su registro. */}
                    <label className="flex flex-col gap-1 max-w-[230px]">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Adelanta las tasas</span>
                        <span className="flex items-center gap-2 py-1.5">
                            <input
                                type="checkbox"
                                checked={tarifasForm.adelanta_tasas !== false}
                                onChange={e => setTarifasForm(p => ({ ...p, adelanta_tasas: e.target.checked }))}
                                className="accent-brand cursor-pointer"
                            />
                            <span className="text-[10px] text-white/60">Cobra inicial y final en el primer pago</span>
                        </span>
                        <span className="text-[9px] text-white/20 leading-snug">
                            Si se desmarca, cada tasa se espera contra su propio registro.
                        </span>
                    </label>

                    <button
                        onClick={guardarTarifas}
                        disabled={guardando}
                        className="px-3 py-1.5 rounded-lg border border-brand/30 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/20 disabled:opacity-40"
                    >Guardar tarifas</button>
                    <button
                        onClick={() => setEditandoTarifas(false)}
                        className="px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white"
                    >Cancelar</button>
                </div>
            )}

            {/* Arrastre: devengado en meses anteriores y todavía sin facturar. Se
                puede incorporar a esta factura, porque es justo lo que hace el
                certificador cuando se le queda algo pendiente. */}
            {data.arrastre.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-amber-500/[0.06] border border-amber-500/20">
                    <div className="flex-1 min-w-[240px]">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                            ⚠ Arrastre: {data.arrastre.length} expediente{data.arrastre.length === 1 ? '' : 's'} devengado{data.arrastre.length === 1 ? '' : 's'} antes de {fmtMes(mes)} y aún sin facturar
                            <span className="text-amber-400/60"> · {fmtEur(data.totales_arrastre.total)}</span>
                        </p>
                        <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
                            {data.arrastre.slice(0, 6).map(l => l.numero_expediente).join(' · ')}
                            {data.arrastre.length > 6 && ` … y ${data.arrastre.length - 6} más`}
                        </p>
                    </div>
                    <button
                        onClick={() => setIncluirArrastre(v => !v)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors ${
                            incluirArrastre
                                ? 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                                : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                        }`}
                        title="Añadirlos a la tabla para poder sellarlos con esta misma factura"
                    >
                        {incluirArrastre ? '✓ Incluido en la factura' : 'Incluir en esta factura'}
                    </button>
                </div>
            )}

            {/* Lo que explica casi siempre un "te factura de más": el certificador
                ya registró y facturó, pero en la app el CEE sigue en revisión. No
                se pueden sellar (no hay fecha de registro que respalde el pago):
                lo que toca es actualizarles el seguimiento. */}
            {(data.sin_registro || []).length > 0 && (
                <details className="rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <summary className="p-3 cursor-pointer text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors">
                        {data.sin_registro.length} expediente{data.sin_registro.length === 1 ? '' : 's'} suyo{data.sin_registro.length === 1 ? '' : 's'} con el CEE presentado pero SIN registrar en la app
                        <span className="text-white/25 normal-case tracking-normal font-normal"> — mira aquí si su factura trae líneas que no encuentras</span>
                    </summary>
                    <div className="px-3 pb-3 flex flex-col gap-1">
                        {data.sin_registro.map(x => (
                            <button
                                key={x.expediente_id}
                                onClick={() => window.open(`/?tab=expedientes&exp=${x.expediente_id}`, '_blank', 'noopener,noreferrer')}
                                className="text-left flex flex-wrap items-baseline gap-2 py-1 border-b border-white/[0.03] hover:bg-white/[0.03] rounded px-1 transition-colors"
                            >
                                <span className="text-[11px] font-bold text-white">{x.numero_expediente}</span>
                                <span className="text-[9px] text-white/30 flex-1">{x.ubicacion || x.cliente_nombre || '—'}</span>
                                <span className="text-[9px] font-black uppercase tracking-wider text-amber-400/70">{x.fase_cee_inicial}</span>
                            </button>
                        ))}
                        <p className="text-[9px] text-white/25 mt-1 leading-relaxed">
                            Si alguno viene en la factura, actualiza su registro en el expediente y vuelve aquí: aparecerá en su mes y podrás sellarlo.
                        </p>
                    </div>
                </details>
            )}

            {/* Qué se devengó este mes y cuánto queda por facturar. La vista
                mensual es de CONSULTA: la conciliación se hace importando el PDF.
                Antes premarcaba todo y anunciaba "Cuadra 9" sin haber comparado
                con nada, que era justo lo contrario de informar. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: `Devengado en ${fmtMes(mes)}`, value: fmtEur(resumenMes.total), color: 'text-white' },
                    { label: 'Ya facturado', value: fmtEur(resumenMes.facturado), color: 'text-brand' },
                    { label: 'Pendiente de facturar', value: fmtEur(resumenMes.pendiente), color: resumenMes.pendiente > 0 ? 'text-amber-400' : 'text-white/40' },
                    { label: 'Conceptos', value: `${resumenMes.nFacturados}/${resumenMes.nTotal}`, color: 'text-white/60' },
                ].map(s => (
                    <div key={s.label} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{s.label}</p>
                        <p className={`text-lg font-black mt-0.5 tabular-nums ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {!modoManual && (
                <p className="text-[10px] text-white/35 leading-relaxed">
                    Esto es lo que este certificador <strong className="text-white/60">debería</strong> facturarte de {fmtMes(mes)}.
                    Para conciliar su factura, súbela con <strong className="text-brand">Importar factura (PDF)</strong>.
                    <button
                        onClick={() => setModoManual(true)}
                        className="ml-2 underline decoration-dotted underline-offset-2 hover:text-white transition-colors"
                    >¿Su factura no se puede leer? Concíliala a mano</button>
                </p>
            )}

            {/* Tabla de conceptos del mes */}
            <div className="flex-1 min-h-0 overflow-auto custom-scrollbar max-h-[42vh]">
                {!lineas.length && (
                    <p className="text-center text-white/30 text-xs py-10">No se registró ningún CEE en {fmtMes(mes)}.</p>
                )}

                {lineas.length > 0 && (
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-bkg-deep z-10">
                            <tr className="border-b border-white/[0.06]">
                                {['', 'Expediente', 'Descripción', 'Registro', 'Esperado', 'Facturado'].map((h, i) => (
                                    <th key={i} className="pb-2 text-[9px] font-black uppercase tracking-widest text-white/25 whitespace-nowrap pr-4">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lineas.map(l => l.conceptos.map((c, idx) => {
                                const m = marcaDe(l, c);
                                const sellado = !!c.sello;
                                const desviado = !sellado && m.marcado && !cuadra(m.importe, c.importe);
                                return (
                                    <tr
                                        key={claveConcepto(l, c)}
                                        className={`border-b border-white/[0.03] align-top ${desviado ? 'bg-amber-500/[0.05]' : ''} ${modoManual && !sellado && !m.marcado ? 'opacity-45' : ''}`}
                                    >
                                        <td className="py-2 pr-2 pl-1">
                                            {sellado ? (
                                                <span className="text-brand text-[11px]" title={`Facturado en ${c.sello.factura} (${fmtDia(c.sello.fecha)})`}>✓</span>
                                            ) : modoManual ? (
                                                <input
                                                    type="checkbox"
                                                    checked={m.marcado}
                                                    onChange={e => setMarca(l, c, { marcado: e.target.checked })}
                                                    className="accent-emerald-500 cursor-pointer"
                                                    title="Marcar si esta línea aparece en la factura recibida"
                                                />
                                            ) : (
                                                <span className="text-amber-400/60 text-[11px]" title="Devengado y aún sin facturar">○</span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-4">
                                            {/* El nº de expediente solo en su primer concepto: la línea
                                                se lee como en la factura, agrupada por dirección. */}
                                            {idx === 0 ? (
                                                <>
                                                    <span className="text-[11px] font-bold text-white whitespace-nowrap">{l.numero_expediente}</span>
                                                    <span className="block text-[9px] text-white/30 leading-snug max-w-[260px]">{l.ubicacion || l.cliente_nombre}</span>
                                                </>
                                            ) : <span className="text-white/10 text-[10px] pl-1">↳</span>}
                                        </td>
                                        <td className="py-2 pr-4 max-w-[280px]">
                                            <span className="text-[10px] text-white/60 leading-snug">{c.descripcion}</span>
                                            <span className="block text-[9px] font-black uppercase tracking-wider text-white/25">
                                                {c.tipo === 'suplido' ? 'Suplido' : 'Trabajo'}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-4">
                                            <span className="text-[10px] text-white/40 whitespace-nowrap">{fmtDia(c.fecha)}</span>
                                            {/* Marca los conceptos que vienen del arrastre: se devengaron
                                                antes, pero se están facturando en esta factura. */}
                                            {c.mes !== mes && (
                                                <span className="block text-[9px] font-black uppercase tracking-wider text-amber-400/70">
                                                    Arrastre {fmtMes(c.mes)}
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-2 pr-4">
                                            <span className="text-[11px] text-white/70 whitespace-nowrap">{fmtEur(c.importe)}</span>
                                        </td>
                                        <td className="py-2 pr-4">
                                            {sellado ? (
                                                <span className="flex items-center gap-2">
                                                    <span className={`text-[11px] whitespace-nowrap ${cuadra(c.sello.importe, c.sello.esperado ?? c.importe) ? 'text-brand' : 'text-amber-400'}`}>
                                                        {fmtEur(c.sello.importe)}
                                                    </span>
                                                    <span className="text-[9px] text-white/25">{c.sello.factura}</span>
                                                    <button
                                                        onClick={() => desellar(l, c)}
                                                        disabled={guardando}
                                                        className="text-[9px] font-black uppercase tracking-widest text-white/20 hover:text-red-400 transition-colors"
                                                        title="Quitar el sello de facturado"
                                                    >✕</button>
                                                </span>
                                            ) : modoManual ? (
                                                <input
                                                    type="number" step="0.01"
                                                    value={m.importe}
                                                    disabled={!m.marcado}
                                                    onChange={e => setMarca(l, c, { importe: e.target.value })}
                                                    className={`${inputCls} w-24 ${desviado ? 'border-amber-500/40 text-amber-400' : ''} disabled:opacity-30`}
                                                />
                                            ) : (
                                                <span className="text-[10px] text-amber-400/70 whitespace-nowrap">Pendiente</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            }))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* En modo consulta, el pie es el desglose de lo devengado: lo que
                debería traer su próxima factura, con la misma estructura que ella
                usa (base, IVA, IRPF, suplidos). */}
            {lineas.length > 0 && !modoManual && (
                <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] max-w-md">
                    {/* Solo el mes: el arrastre tiene su propio bloque con su
                        importe, y mezclarlos aquí haría el total irreconocible. */}
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">
                        Debería facturarte de {fmtMes(mes)}
                    </p>
                    {[
                        ['Total (base imponible)', data.totales.base],
                        [`IVA ${t.iva} %`, data.totales.iva],
                        [`- IRPF ${t.irpf} %`, -data.totales.irpf],
                        ['Total de los trabajos', data.totales.trabajos, true],
                        ['Total de los suplidos', data.totales.suplidos],
                    ].map(([label, valor, fuerte]) => (
                        <div key={label} className="flex justify-between items-baseline py-0.5">
                            <span className={`text-[10px] ${fuerte ? 'font-black text-white/60' : 'text-white/40'}`}>{label}</span>
                            <span className={`text-[11px] tabular-nums ${fuerte ? 'font-black text-white' : 'text-white/60'}`}>{fmtEur(valor)}</span>
                        </div>
                    ))}
                    <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-white/10">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Importe total</span>
                        <span className="text-base font-black text-brand tabular-nums">{fmtEur(data.totales.total)}</span>
                    </div>
                </div>
            )}

            {/* Pie del modo manual: totales de lo marcado + sellado */}
            {lineas.length > 0 && modoManual && totalMarcado && (
                <div className="grid md:grid-cols-2 gap-4 pt-1">

                    {/* Mismo desglose y mismo orden que el pie de su factura. */}
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Según lo marcado</p>
                        {[
                            ['Total (base imponible)', totalMarcado.base],
                            [`IVA ${t.iva} %`, totalMarcado.iva],
                            [`- IRPF ${t.irpf} %`, -totalMarcado.irpf],
                            ['Total de los trabajos', totalMarcado.trabajos, true],
                            ['Total de los suplidos', totalMarcado.suplidos],
                        ].map(([label, valor, fuerte]) => (
                            <div key={label} className="flex justify-between items-baseline py-0.5">
                                <span className={`text-[10px] ${fuerte ? 'font-black text-white/60' : 'text-white/40'}`}>{label}</span>
                                <span className={`text-[11px] tabular-nums ${fuerte ? 'font-black text-white' : 'text-white/60'}`}>{fmtEur(valor)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-white/10">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/60">Importe total</span>
                            <span className="text-base font-black text-brand tabular-nums">{fmtEur(totalMarcado.total)}</span>
                        </div>
                    </div>

                    {/* Datos de la factura recibida. El total sirve para el cotejo
                        final: si sobra dinero, hay una línea que no consta aquí. */}
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-2">
                        <p className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-white/30">
                            Factura recibida (a mano)
                            <button
                                onClick={() => { setModoManual(false); setMarcas({}); setAviso(null); }}
                                className="text-white/30 hover:text-white transition-colors normal-case tracking-normal font-normal text-[10px]"
                            >← Salir del modo manual</button>
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <input
                                value={factura.numero}
                                onChange={e => setFactura(f => ({ ...f, numero: e.target.value }))}
                                placeholder="Nº factura"
                                className={`${inputCls} w-28`}
                            />
                            <input
                                type="date"
                                value={factura.fecha}
                                onChange={e => setFactura(f => ({ ...f, fecha: e.target.value }))}
                                className={`${inputCls} w-36`}
                            />
                            <input
                                type="number" step="0.01"
                                value={factura.total}
                                onChange={e => setFactura(f => ({ ...f, total: e.target.value }))}
                                placeholder="Importe total"
                                className={`${inputCls} w-32`}
                            />
                        </div>

                        {difFactura !== null && (
                            <p className={`text-[10px] font-bold leading-relaxed ${cuadra(difFactura, 0) ? 'text-emerald-400' : 'text-red-400'}`}>
                                {cuadra(difFactura, 0)
                                    ? '✓ La factura cuadra con lo registrado este mes.'
                                    : difFactura > 0
                                        ? `⚠ Te factura ${fmtEur(difFactura)} de más: hay líneas en su factura que no constan como registradas en ${fmtMes(mes)}.`
                                        : `⚠ Te factura ${fmtEur(Math.abs(difFactura))} de menos: quedan registros sin facturar (irán al arrastre).`}
                            </p>
                        )}

                        {cubos.noFacturado.length > 0 && (
                            <p className="text-[10px] text-white/40 leading-relaxed">
                                {cubos.noFacturado.length} conceptos sin marcar: se quedan pendientes y aparecerán como arrastre el mes que viene.
                            </p>
                        )}

                        <div className="flex-1" />

                        {aviso && (
                            <p className={`text-[10px] font-bold ${aviso.tipo === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{aviso.txt}</p>
                        )}

                        <button
                            onClick={sellar}
                            disabled={guardando || (!cubos.cuadra.length && !cubos.desviado.length)}
                            className="px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-30 transition-all"
                        >
                            {guardando ? 'Guardando…' : `Marcar como facturado (${cubos.cuadra.length + cubos.desviado.length})`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
