import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { useAuth } from '../../../context/AuthContext';
import { getRoleFlags } from '../../../utils/roleFlags';
import { LOTE_ESTADOS } from '../loteConstants';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { computeLoteEco, totalCobroSo, IVA_FACTURA_SO } from '../logic/loteEco';
import { estimar, tarifaPara, comparar } from '../logic/tarifasVerificacion';
import { getFicha } from '../../expedientes/logic/expedienteTaxonomia';
import { analizarProceso } from '../logic/loteProceso';
import {
    proponerLotes, instaladoresDe, compararAntiguedad, compararRecientes, diasListo, MAX_EXPEDIENTES_LOTE,
    RIESGOS, RIESGO_DEFECTO, pasaRiesgo, textoIncidencias, incidenciasDe,
} from '../logic/propuestaLote';
import { CSS as CSS_FX, Ico, AvisoFx, Importe } from '../../facturacion/estilo';
import { CSS_LT } from './loteFichaEstilo';
import { AnexoListadoModal } from './AnexoListadoModal';
import { SolicitudVerificacionModal } from './SolicitudVerificacionModal';
import { FacturaSoModal } from './FacturaSoModal';
import { LoteProcesoFases } from './LoteProcesoFases';
import { BotonCarpetaLocal } from './BotonCarpetaLocal';
import { driveFolderId } from '../../../utils/driveFolder';
import { LogoEmpresa } from '../../../components/LogoEmpresa';
import { RequerimientoModal } from './RequerimientoModal';
import { JustificanteMitecoModal } from './JustificanteMitecoModal';
import { CobroSoAlPasarModal } from './CobroSoAlPasarModal';
import { EquipoVerificacion } from './EquipoVerificacion';

// ─────────────────────────────────────────────────────────────────────────────
// La FICHA DEL LOTE. Desde el 12/11/2026 va en el papel crema de Facturación y la
// «Vista S.O.» (regla 164; Fran: «rediseñar la imagen… que sea incluso más fácil
// de usar»): CSS `.fx-` de facturacion/estilo.jsx + lo suyo en loteFichaEstilo.js
// (`.lt-`). Arriba, los siete PASOS del trámite (se pulsan y abren su fase) y, en
// el Resumen, «Lo siguiente»: qué toca ahora, con UN botón. Los popups que se
// abren encima (solicitud, Anexo I, factura…) siguen con su estilo.
// Ver docs/conocimiento/lotes/la-ficha-del-lote-en-crema.md.
// ─────────────────────────────────────────────────────────────────────────────

// Estados desde los que el S.O. ya nos ha pagado (como `LOTE_PAGO_CLIENTE` del backend).
const LOTE_YA_COBRADO = ['PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'];

const presName = (p) => p ? (p.acronimo || p.razon_social || '—') : null;
const eur = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const mwh = (n) => `${((Number(n) || 0) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh`;
const mwhNum = (n) => ((Number(n) || 0) / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 });
// Verificado en kWh (= CAEs): la factura al S.O. se emite medida en kWh.
const kwh = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-ES')} kWh`;
// Con céntimos: es la cifra que se coteja contra el ingreso del banco.
const eur2 = (n) => (Number(n) || 0).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num2 = (n) => (Number(n) || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Los pasos, en corto, para la tira de la cabecera.
const PASO_CORTO = { 1: 'Solicitud', 2: 'Firma S.O.', 3: 'Oferta', 4: 'Verificación', 5: 'MITECO', 6: 'Factura', 7: 'Pago' };
const ICO_CORREO = 'M4 6h16v12H4z M4 7l8 6 8-6';
const ICO_TEL = 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2';

// «Lo siguiente»: qué toca AHORA en el lote, en una frase, y si está en nuestro
// tejado (`hacer`) o esperando a un tercero (`espera`). Sale del mismo análisis de
// fases que la pestaña Documentación (logic/loteProceso.js): aquí solo se dice.
function loSiguiente(p, lote, canSeeMargin) {
    const n = p.faseActual;
    if (n == null) return { n: null, titulo: 'Lote cerrado', texto: 'Todas las fases están hechas.', tono: 'ok' };
    const f = p.fases.find(x => x.n === n);
    const bloq = f?.bloqueo && !f.hecha;
    const r = (titulo, texto, tono = 'hacer') => ({ n, fase: f?.titulo, titulo, texto, tono: bloq ? 'espera' : tono });
    switch (n) {
        case 1: return p.solicitud
            ? r('Trae la solicitud de beCAE', 'Se trae sola al consultar beCAE en el paso 1 (o con «Traer la solicitud de beCAE»). La que genera la app no vale para el S.O.')
            : r('Genera la solicitud al verificador', 'Con los expedientes ya en el lote. Después se trae la del verificador.');
        case 2: return p.soEnviado
            ? r('Esperando la firma del Sujeto Obligado', 'Cuando lleguen los PDF firmados, suéltalos en el paso 2.', 'espera')
            : r('Envía el Anexo I y las fichas al S.O.', 'Para que los firme junto con la solicitud.');
        case 3: return !p.oferta
            ? r('Esperando la oferta del verificador', 'Cuando llegue, se sube en el paso 3 (o se trae de beCAE).', 'espera')
            : (p.ofertaEnviada
                ? r('Esperando la oferta firmada del S.O.', 'Cuando vuelva firmada, suéltala en el paso 3.', 'espera')
                : r('Envía la oferta al S.O. para que la firme', 'Firmarla es aceptarla: el verificador abre el expediente.'));
        case 4: {
            if (p.inexactitudes.length && !p.informeVerificacion) return r('Contesta las inexactitudes', 'Prepara la carpeta del requerimiento desde el paso 4.');
            if (!p.informeVerificacion) return r('Esperando el informe de verificación', 'Al subirlo se leen los ahorros verificados.', 'espera');
            if (!p.dictamen) return r('Sube el dictamen favorable', 'Se leen su número, su fecha y la inversión definitiva.');
            if (canSeeMargin && !p.facturaVerificador) return r('Sube la factura del verificador', 'La que emite al S.O.; su importe se lee del PDF.');
            return r('Completa la verificación', 'Revisa los documentos del paso 4.');
        }
        case 5: return !p.justificanteMiteco
            ? r('Presenta el lote en el MITECO', 'Genera la solicitud de emisión y los anexos, y sube el justificante.')
            : r('Esperando la resolución del MITECO', 'Cuando llegue el certificado CAE, súbelo en el paso 5.', 'espera');
        case 6: return r('Emite la factura de Brokergy al S.O.', 'Con los códigos del certificado CAE.');
        case 7: return r('Paga a los clientes', 'Pide a cada cliente que confirme su cuenta y haz las transferencias.');
        default: return r(f?.titulo || 'Siguiente paso', '');
    }
}

// El nº de ACTUACIÓN dentro del envío (E1..En). No es un adorno: rotula el anexo
// del MITECO de ese expediente y da nombre a todos los ficheros de su ZIP
// (`E3-3-1 - …`), así que una vez asignado es como se le llama a ese expediente
// durante el resto del trámite — y hasta ahora solo se veía abriéndolo.
export const ordenActuacion = (exp) => Number(exp?.instalacion?.verificacion?.orden_actuacion) || null;

// Tarjeta de expediente compartida (idéntica en la lista del lote y en el picker):
// E{n} + nº + estado, nombre del cliente, dirección y los importes.
// `rightAction` = botón (× quitar / + añadir). Si `onClick`, el bloque de texto
// navega al expediente.
function ExpedienteCard({ exp, onClick, rightAction, carpetaLocal = false, onError, extra = null }) {
    const { user } = useAuth();
    const { canSeeMargin } = getRoleFlags(user); // el margen de Brokergy solo lo ve el ADMIN
    const f = computeExpedienteFinancials(exp);
    const en = ordenActuacion(exp);
    // El botón solo se pinta si el expediente TIENE carpeta: la clave vive en cuatro
    // sitios distintos de `datos_calculo` según la época (ver utils/driveFolder.js).
    const tieneCarpeta = carpetaLocal && !!driveFolderId(exp.oportunidades);
    const inner = (
        <>
            <span className="lt-exp-top">
                {en != null && (
                    <span className="lt-e" title={`Actuación E${en} del envío: rotula su anexo del MITECO y todos los ficheros de su ZIP (E${en}-…)`}>E{en}</span>
                )}
                <span className="lt-exp-n">{exp.numero_expediente}</span>
                {exp.estado && <span className="fx-chip fx-chip-gris">{exp.estado}</span>}
            </span>
            {exp.cliente_nombre && <span className="lt-exp-cli">{exp.cliente_nombre}</span>}
            {exp.cliente_direccion && <span className="lt-exp-dir">{exp.cliente_direccion}</span>}
            {extra}
            <span className="lt-exp-cifras">
                <span><b>{mwh(f.savingsKwh)}</b> de ahorro</span>
                <span><b>{eur(f.cae)}</b> al cliente</span>
                {canSeeMargin && <span><b>{eur(f.profit)}</b> margen</span>}
            </span>
            {f.savingsKwhVerificado != null && (
                <span className="lt-exp-cifras lt-verif" title="Ahorro verificado (factura al S.O.)">
                    <span>Verificado: <b>{kwh(f.savingsKwhVerificado)}</b></span>
                    <span><b>{eur(f.caeVerificado)}</b> al cliente</span>
                    {canSeeMargin && <span><b>{eur(f.profitVerificado)}</b> margen</span>}
                </span>
            )}
        </>
    );
    return (
        <div className="lt-exp">
            {onClick
                ? <button type="button" onClick={onClick} className="lt-exp-cuerpo" title="Abrir el expediente">{inner}</button>
                : <div className="lt-exp-cuerpo">{inner}</div>}
            <div className="lt-exp-acc">
                {tieneCarpeta && <BotonCarpetaLocal expedienteId={exp.id} claro onError={onError} />}
                {rightAction}
            </div>
        </div>
    );
}

export function LoteDetailModal({ loteId, soList: soListProp, verList: verListProp, onClose, onChanged, onNavigateExpediente }) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    // Solo ADMIN ve el margen (beneficio, oferta €/MWh, coste verif., factura al S.O.).
    // El TRABAJADOR opera el lote (expedientes, SO/verificador, envío) sin ver precios,
    // y no puede borrar el lote (canDelete).
    const { canSeeMargin, canDelete } = getRoleFlags(user);
    const [lote, setLote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [elegibles, setElegibles] = useState([]);
    const [loadingEleg, setLoadingEleg] = useState(false);
    const [sugerencias, setSugerencias] = useState([]);
    const [busy, setBusy] = useState(false);
    const [fCcaa, setFCcaa] = useState('');
    const [fAnio, setFAnio] = useState('');
    const [fSearch, setFSearch] = useState('');
    const [fInstalador, setFInstalador] = useState('');
    // Por defecto, lo que más lleva esperando primero: es dinero parado.
    const [fOrden, setFOrden] = useState('antiguedad');
    // Por defecto fuera lo que tiene incidencias GRAVES abiertas: es lo que el
    // verificador nos devolverá (Fran, 03/11/2026).
    const [fRiesgo, setFRiesgo] = useState(RIESGO_DEFECTO);
    // Lo que le falta al S.O. del lote este año (GET /obligacion-so/:id/vista), para
    // titular la propuesta «Para cubrir a …» y decir cuánto acerca el lote.
    const [faltaSo, setFaltaSo] = useState(null);
    const [showPropuestas, setShowPropuestas] = useState(true);
    // Hoy salen 7 propuestas: enteras empujan la lista de elegibles fuera de la vista.
    const [todasPropuestas, setTodasPropuestas] = useState(false);
    const [costeVerifInput, setCosteVerifInput] = useState('');
    const [ofertaInput, setOfertaInput] = useState('');
    const [expVerifInput, setExpVerifInput] = useState('');
    const [regMitecoInput, setRegMitecoInput] = useState('');
    // Pestañas: el lote tiene demasiada cosa para una sola columna con scroll.
    const [tab, setTab] = useState('resumen');
    const [showAnexo, setShowAnexo] = useState(false);
    const [showSolicitud, setShowSolicitud] = useState(false);
    const [showFactura, setShowFactura] = useState(false);
    const [showRequerimiento, setShowRequerimiento] = useState(false);
    // Popup del justificante de registro, al marcar el lote como SUBIDO A MITECO.
    const [pideJustificante, setPideJustificante] = useState(false);
    // Popup «¿ha pagado el S.O.?», al pasar a PTE. PAGO A CLIENTE / FINALIZADO con la
    // factura sin cobrar: el estado al que se quiere pasar (null = cerrado).
    const [pideCobroAlPasar, setPideCobroAlPasar] = useState(null);
    const [showExpedientes, setShowExpedientes] = useState(true);
    const [soList, setSoList] = useState(soListProp || []);
    const [verList, setVerList] = useState(verListProp || []);
    // Tarifas del verificador asignado: la referencia orientativa con la que se
    // mira si lo que nos pide por este lote cuadra. Solo ADMIN — son importes, y
    // la ruta que las sirve es adminOnly.
    const [tarifasVerif, setTarifasVerif] = useState(null);

    // Carga SO/Verificador si no se pasan como props (ej. apertura desde expediente).
    useEffect(() => {
        if ((soListProp || []).length || (verListProp || []).length) return;
        axios.get('/api/prescriptores?tipo=SUJETO_OBLIGADO&limit=200')
            .then(r => setSoList(Array.isArray(r.data) ? r.data : (r.data?.data || [])))
            .catch(() => {});
        axios.get('/api/prescriptores?tipo=VERIFICADOR&limit=200')
            .then(r => setVerList(Array.isArray(r.data) ? r.data : (r.data?.data || [])))
            .catch(() => {});
    }, []); // eslint-disable-line

    const isBorrador = lote?.estado === 'BORRADOR';
    // El gating de cada acción (qué se puede hacer y cuándo) lo decide el módulo de
    // fases a partir del papeleo real del lote — ver logic/loteProceso.js.

    const refresh = useCallback(async () => {
        const { data } = await axios.get(`/api/lotes/${loteId}`);
        setLote(data);
        return data;
    }, [loteId]);

    useEffect(() => {
        setLoading(true);
        refresh().catch(() => showAlert('No se pudo cargar el lote', 'Error', 'error')).finally(() => setLoading(false));
    }, [refresh, showAlert]);

    const fetchElegibles = useCallback(async () => {
        setLoadingEleg(true);
        try {
            const { data } = await axios.get('/api/lotes/elegibles');
            setElegibles(Array.isArray(data) ? data : []);
        } catch { setElegibles([]); } finally { setLoadingEleg(false); }
    }, []);

    useEffect(() => {
        if (lote && lote.estado === 'BORRADOR') fetchElegibles();
    }, [lote?.estado, fetchElegibles]);

    const soDelLote = lote?.estado === 'BORRADOR' ? lote?.sujeto_obligado_id : null;
    useEffect(() => {
        if (!soDelLote) return;
        let vivo = true;
        axios.get(`/api/lotes/obligacion-so/${soDelLote}/vista`)
            .then(({ data }) => vivo && setFaltaSo({
                soId: soDelLote, nombre: data?.so?.nombre || null, anio: data?.anio,
                faltaKwh: data?.obligacion ? (Number(data.obligacion.faltaGwh) || 0) * 1e6 : null,
            }))
            .catch(() => vivo && setFaltaSo(null));
        return () => { vivo = false; };
    }, [soDelLote]);
    // Ligado al S.O.: si se cambia el S.O. del lote, lo de antes deja de valer.
    const cubrir = faltaSo && faltaSo.soId === soDelLote ? faltaSo : null;

    // ─── Filtros del selector de expedientes (CCAA + año + búsqueda por nombre/nº) ─
    const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const ccaaOpts = useMemo(() => [...new Set(elegibles.map(e => e.ccaa).filter(Boolean))].sort(), [elegibles]);
    const anioOpts = useMemo(() => [...new Set(elegibles.map(e => e.anio_actuacion).filter(Boolean))].sort((a, b) => b - a), [elegibles]);
    const loteTieneClaves = !!(lote && lote.anio_actuacion);
    // Si el lote ya tiene claves, manda el lote; si no, mandan los filtros del usuario.
    const effCcaa = loteTieneClaves ? lote.ccaa : fCcaa;
    const effAnio = loteTieneClaves ? lote.anio_actuacion : (fAnio ? Number(fAnio) : null);
    // Elegibles del año + CCAA en vigor: de aquí salen el desplegable de instaladores
    // y las propuestas (un lote no puede mezclar años ni CCAA).
    const elegiblesDelGrupo = useMemo(() => elegibles.filter(e => {
        if (effCcaa && norm(e.ccaa) !== norm(effCcaa)) return false;
        if (effAnio && e.anio_actuacion !== effAnio) return false;
        return true;
    }), [elegibles, effCcaa, effAnio]);
    // El riesgo filtra TODO lo de abajo (instaladores, propuestas y lista): lo que
    // se queda fuera se cuenta en el pie, no se esconde sin decirlo.
    const elegiblesClave = useMemo(() => elegiblesDelGrupo.filter(e => pasaRiesgo(e, fRiesgo)), [elegiblesDelGrupo, fRiesgo]);
    const nFueraPorRiesgo = elegiblesDelGrupo.length - elegiblesClave.length;
    const kwhDe = useCallback((x) => computeExpedienteFinancials(x).savingsKwh || 0, []);
    const instaladorOpts = useMemo(() => instaladoresDe(elegiblesClave), [elegiblesClave]);
    // Un instalador elegido que ya no está en la lista (otro año/CCAA) deja de filtrar.
    const effInstalador = instaladorOpts.some(i => i.id === fInstalador) ? fInstalador : '';
    const elegiblesVisibles = useMemo(() => {
        const out = elegiblesClave.filter(e => {
            if (effInstalador && String(e.instalador_id || '') !== effInstalador) return false;
            if (fSearch && !norm(`${e.numero_expediente} ${e.cliente_nombre || ''} ${e.instalador_nombre || ''}`).includes(norm(fSearch))) return false;
            return true;
        });
        // 'numero' conserva el orden del backend (año + nº de expediente).
        if (fOrden === 'antiguedad') return [...out].sort(compararAntiguedad);
        if (fOrden === 'recientes') return [...out].sort(compararRecientes);
        if (fOrden === 'mwh') return [...out].sort((a, b) => (kwhDe(b) - kwhDe(a)) || compararAntiguedad(a, b));
        return out;
    }, [elegiblesClave, effInstalador, fSearch, fOrden, kwhDe]);

    // Propuestas de lote (ver logic/propuestaLote.js): por antigüedad y por instalador,
    // dentro del cupo que le queda al lote.
    const cupoLote = MAX_EXPEDIENTES_LOTE - (lote?.expedientes || []).length;
    const propuestas = useMemo(() => proponerLotes(
        effInstalador ? elegiblesClave.filter(e => String(e.instalador_id || '') === effInstalador) : elegiblesClave,
        {
            cupo: cupoLote,
            instaladoresLote: (lote?.expedientes || []).map(e => e.instalador_asociado_id || e.instalacion?.instalador_id),
            kwhDe,
            cubrir,
        },
    ), [elegiblesClave, effInstalador, cupoLote, lote?.expedientes, kwhDe, cubrir]);
    // Cuánto suma TODO lo elegible que pasa el filtro, frente a lo que le falta al S.O.
    const kwhElegible = useMemo(() => elegiblesClave.reduce((s, x) => s + kwhDe(x), 0), [elegiblesClave, kwhDe]);

    // Una vez asignados los E1..En, manda el ORDEN DEL ENVÍO: es el que tiene
    // delante quien arma los ZIP o revisa el anexo del MITECO. Hoy no cambia nada
    // —medido sobre los 8 lotes con orden asignado, los 40 expedientes lo tienen
    // igual que su orden alfabético, porque así se selló—, pero ese orden lo fija
    // el informe de verificación (o la solicitud por API) y no tiene por qué
    // seguir coincidiendo. Sin números se conserva el orden que llega del backend.
    const expedientesOrdenados = useMemo(() => {
        const exps = [...(lote?.expedientes || [])];
        if (!exps.some(ordenActuacion)) return exps;
        return exps.sort((a, b) =>
            // Lo que aún no tiene número va al final: es lo que falta por asignar.
            ((ordenActuacion(a) ?? Infinity) - (ordenActuacion(b) ?? Infinity))
            || String(a.numero_expediente || '').localeCompare(String(b.numero_expediente || ''), 'es'));
    }, [lote?.expedientes]);

    // Resumen económico del lote (modelo del Excel del usuario).
    //   beneficioLote = ofertaLote(€/MWh) × ahorro(MWh) − pagoCliente(€)
    //   beneficioActual = Σ profitBrokergy por expediente (el "antes", sin oferta de lote)
    const eco = useMemo(() => computeLoteEco(lote), [lote?.expedientes, lote?.coste_verificacion, lote?.oferta_lote]);
    // Lo que el S.O. nos tiene que ingresar (la factura, si ya existe): con él se
    // coteja la transferencia. Y la fecha del ingreso para marcarla cobrada.
    const cobroSo = useMemo(() => totalCobroSo(lote, eco), [lote?.factura_so, eco]); // eslint-disable-line
    const [fechaCobro, setFechaCobro] = useState(hoyIso);

    // ─── Lo que la TARIFA del verificador dice que debería costar ────────────
    // No sustituye a nada: `coste_verificacion` sigue siendo lo que de verdad se
    // paga (sale de su factura). Esto es la referencia con la que se mira si la
    // oferta que llega cuadra, que es justo lo que no se podía hacer sin salir a
    // buscar el correo donde pasó los precios.
    useEffect(() => {
        if (!canSeeMargin || !lote?.verificador_id) { setTarifasVerif(null); return; }
        let vivo = true;
        axios.get(`/api/prescriptores/${lote.verificador_id}/tarifas-verificacion`)
            .then(r => { if (vivo) setTarifasVerif(r.data?.tarifas || []); })
            .catch(() => { if (vivo) setTarifasVerif(null); });
        return () => { vivo = false; };
    }, [canSeeMargin, lote?.verificador_id]);

    const refVerif = useMemo(() => {
        const exps = lote?.expedientes || [];
        // Sin NINGUNA tarifa registrada no se dice nada: un aviso que sale en todos
        // los lotes de todos los verificadores sin tarifa es el que enseña a no
        // leer esta zona. Lo que sí se dice es que hay tarifas y no encaja ninguna,
        // que eso sí se arregla.
        if (!tarifasVerif?.length || !exps.length) return null;
        // Una actuación = un expediente del lote. Es la unidad con la que factura
        // el verificador y la que numera su informe.
        const n = exps.length;
        const fichas = [...new Set(exps.map(getFicha).filter(Boolean))];
        const { tarifa, motivo } = tarifaPara(tarifasVerif, fichas);
        if (!tarifa) return { motivo, n };
        const estimacion = estimar(tarifa, n);
        return { tarifa, estimacion, n, comparacion: comparar(estimacion, lote?.coste_verificacion) };
    }, [tarifasVerif, lote?.expedientes, lote?.coste_verificacion]);

    // Los datos del dictamen viven en la entrada de su documento: se leen del PDF
    // al subirlo (ver loteOcrService) y no hay ningún campo que teclear.
    const dictamen = useMemo(
        () => (lote?.documentos_so || []).find(d => d?.key === 'dictamen_favorable')?.dictamen || null,
        [lote?.documentos_so]);

    // Documentos que han vuelto firmados y nadie ha revisado: es lo que hay que
    // mirar hoy, así que va de contador en la pestaña de Documentación.
    const docsPendientes = useMemo(
        () => (lote?.documentos_so || []).filter(d => d?.signed_link && !d?.validado_at).length,
        [lote?.documentos_so]
    );

    // Sincroniza los inputs manuales (coste, oferta, nº de expte. del verificador)
    // con el lote cargado.
    useEffect(() => {
        setCosteVerifInput(lote?.coste_verificacion ?? '');
        setOfertaInput(lote?.oferta_lote ?? '');
        setExpVerifInput(lote?.expediente_verificador ?? '');
        setRegMitecoInput(lote?.registro_miteco ?? '');
    }, [lote?.id, lote?.coste_verificacion, lote?.oferta_lote, lote?.expediente_verificador, lote?.registro_miteco]);

    // ─── Acciones ────────────────────────────────────────────────────────────────
    const patchLote = async (patch) => {
        setBusy(true);
        try { await axios.patch(`/api/lotes/${loteId}`, patch); await refresh(); onChanged?.(); }
        catch (err) { showAlert(err.response?.data?.error || 'Error al actualizar', 'Error', 'error'); }
        finally { setBusy(false); }
    };

    const addExpediente = async (expId, force = false) => {
        if (!expId) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`/api/lotes/${loteId}/expedientes`, { expediente_id: expId, force });
            if (data.requiresConfirmation) {
                setBusy(false);
                const ok = await showConfirm(data.warning, 'Lote casi lleno', 'warning');
                if (ok) return addExpediente(expId, true);
                return;
            }
            setSugerencias(data.sugerencias || []);
            await refresh();
            fetchElegibles();
            onChanged?.();
        } catch (err) {
            showAlert(err.response?.data?.error || 'No se pudo añadir el expediente', 'Error', 'error');
        } finally { setBusy(false); }
    };

    // Añade una propuesta entera. Uno a uno por la MISMA ruta que el botón suelto, que
    // es la que valida año, CCAA y estado; al primer fallo se para y dice cuántos entraron.
    const addVarios = async (ids) => {
        if (!ids?.length) return;
        setBusy(true);
        let n = 0;
        try {
            for (const id of ids) {
                const { data } = await axios.post(`/api/lotes/${loteId}/expedientes`, { expediente_id: id, force: false });
                if (data.requiresConfirmation) {
                    showAlert(`${data.warning}\n\nSe han añadido ${n} de ${ids.length}.`, 'Lote lleno', 'warning');
                    break;
                }
                n += 1;
                setSugerencias(data.sugerencias || []);
            }
        } catch (err) {
            showAlert(`${err.response?.data?.error || 'No se pudo añadir un expediente'}\n\nSe han añadido ${n} de ${ids.length}.`, 'Error', 'error');
        } finally {
            await refresh().catch(() => {});
            fetchElegibles();
            onChanged?.();
            setBusy(false);
        }
    };

    const removeExpediente = async (expId) => {
        setBusy(true);
        try {
            await axios.delete(`/api/lotes/${loteId}/expedientes/${expId}`);
            await refresh();
            fetchElegibles();
            onChanged?.();
        } catch (err) { showAlert(err.response?.data?.error || 'Error al quitar', 'Error', 'error'); }
        finally { setBusy(false); }
    };

    const changeEstado = async (nuevo_estado, { sinPreguntar = false } = {}) => {
        if (!nuevo_estado || nuevo_estado === lote.estado) return;
        // Pasar a "PTE. PAGO BROKERGY A CLIENTE" (o después) ES decir que el S.O. ha
        // pagado: con la factura emitida y sin cobrar se pide la fecha del ingreso en
        // el acto. Sin esto la factura seguía EMITIDA y Facturación la daba por debida
        // (F-2026CAE_8/9/10, 25/10/2026). Solo ADMIN: el cobro es adminOnly; al
        // TRABAJADOR se le deja pasar y el cuadro de mando lo avisará.
        const fso = lote.factura_so;
        if (!sinPreguntar && canSeeMargin && LOTE_YA_COBRADO.includes(nuevo_estado)
            && fso?.numero && fso.estado !== 'PAGADA') {
            setPideCobroAlPasar(nuevo_estado);
            return;
        }
        setBusy(true);
        try {
            await axios.patch(`/api/lotes/${loteId}/estado`, { nuevo_estado });
            const actualizado = await refresh();
            onChanged?.();
            // Al declarar la subida se pide el justificante de registro EN EL ACTO:
            // acaba de salir del portal del Ministerio y es el único momento en que
            // está a mano. Se puede aplazar — el estado queda cambiado igual.
            const yaTiene = (actualizado?.documentos_so || []).some(d => d?.key === 'justificante_miteco');
            if (nuevo_estado === 'SUBIDO A MITECO' && !yaTiene) setPideJustificante(true);
        }
        catch (err) { showAlert(err.response?.data?.error || 'No se pudo cambiar el estado', 'Error', 'error'); }
        finally { setBusy(false); }
    };

    // El S.O. nos ha ingresado la factura. Marcarla cobrada es lo que significa
    // salir de "CAE EMITIDO – PTE PAGO BROKERGY", así que el lote avanza solo a
    // "PTE. PAGO BROKERGY A CLIENTE" — por la ruta de siempre, con su guarda del
    // ahorro verificado (regla 28): si no pasa, se dice y el cobro queda anotado.
    const marcarCobro = async (cobrada) => {
        if (!cobrada) {
            const ok = await showConfirm('¿Quitar la marca de cobrada de la factura al S.O.? El estado del lote no cambia.', 'Deshacer cobro', 'warning');
            if (!ok) return;
        }
        setBusy(true);
        let hecho = false;
        try {
            await axios.post(`/api/lotes/${loteId}/factura-so/cobro`, { cobrada, fecha_cobro: fechaCobro });
            await refresh();
            onChanged?.();
            hecho = true;
        } catch (err) { showAlert(err.response?.data?.error || 'No se pudo marcar el cobro', 'Error', 'error'); }
        finally { setBusy(false); }
        if (hecho && cobrada && lote?.estado === 'CAE EMITIDO – PTE PAGO BROKERGY') await changeEstado('PTE. PAGO BROKERGY A CLIENTE', { sinPreguntar: true });
    };

    // Lo que contesta el popup de «¿ha pagado el S.O.?» al pasar de estado. Con
    // fecha, primero el cobro (un error se queda en el popup) y luego el estado, que
    // tiene su guarda de la regla 28: si no pasa, se dice y el cobro queda anotado
    // igual, como en «Marcar cobrado». Sin fecha, solo el estado.
    const pasarTrasPreguntar = async (fecha) => {
        const nuevo = pideCobroAlPasar;
        if (fecha) {
            await axios.post(`/api/lotes/${loteId}/factura-so/cobro`, { cobrada: true, fecha_cobro: fecha });
            await refresh();
            onChanged?.();
        }
        setPideCobroAlPasar(null);
        await changeEstado(nuevo, { sinPreguntar: true });
    };

    const borrarLote = async () => {
        const ok = await showConfirm('¿Seguro que quieres borrar este lote? Los expedientes quedarán sin lote (no se borran).', 'Borrar lote', 'warning');
        if (!ok) return;
        setBusy(true);
        try { await axios.delete(`/api/lotes/${loteId}`); onChanged?.(); onClose(); }
        catch (err) { showAlert(err.response?.data?.error || 'No se pudo borrar', 'Error', 'error'); setBusy(false); }
    };

    // ─── Los pasos del trámite (cabecera) y «Lo siguiente» (Resumen) ────────────
    // El mismo análisis que la pestaña Documentación: un paso pulsado abre su fase.
    const proceso = useMemo(() => analizarProceso(lote), [lote]);
    const [faseAbrir, setFaseAbrir] = useState(null);
    // Qué parte (S.O. / verificador) está desplegada con «+». Plegadas al abrir.
    const [parteAbierta, setParteAbierta] = useState(null);
    // El equipo leído del plan (regla 213): su resumen va en la fila del verificador.
    const equipo = (lote?.documentos_so || []).find(d => d?.key === 'plan_verificacion')?.equipo || null;
    const irAFase = (n) => { setTab('documentacion'); setFaseAbrir({ n, k: Date.now() }); };

    const fasesVisibles = proceso.fases.filter(f => canSeeMargin || f.n !== 6);
    const sig = lote ? loSiguiente(proceso, lote, canSeeMargin) : null;
    const nExp = (lote?.expedientes || []).length;

    const cabecera = lote && (
        <header className="lt-cab lt-in">
            <div className="lt-cab-top">
                <span className="fx-eyebrow">
                    Lote CAE{lote.sujeto_obligado ? ` · ${presName(lote.sujeto_obligado)}` : ''}{lote.verificador ? ` → ${presName(lote.verificador)}` : ''}
                </span>
                <div className="lt-cab-acc">
                    {lote.drive_folder_id && <BotonCarpetaLocal loteId={lote.id} claro onError={(m) => showAlert(m, 'Carpeta local', 'error')} />}
                    {/* Los enlaces a Drive, solo para el ADMIN (regla 1). */}
                    {canSeeMargin && lote.drive_folder_id && (
                        <a className="fx-ico-btn" href={`https://drive.google.com/drive/folders/${lote.drive_folder_id}`} target="_blank" rel="noopener noreferrer"
                            title="Abrir la carpeta del lote en Drive" aria-label="Abrir la carpeta del lote en Drive">
                            <Ico n="enlace" size={20} />
                        </a>
                    )}
                    <button type="button" className="fx-cerrar" aria-label="Cerrar" onClick={onClose}><Ico n="x" /></button>
                </div>
            </div>
            <h2 className="fx-display lt-tit">
                {(() => {
                    // UNA palabra en lima: el número del lote, que es como se le llama.
                    const c = lote.codigo || 'LOTE (sin código)';
                    const m = c.match(/^(.*-)(\d+)$/);
                    return m ? <>{m[1]}<span className="fx-mark">{m[2]}</span></> : c;
                })()}
            </h2>
            <div className="lt-sub">
                <span className="fx-pildora">{lote.anio_actuacion ? `Año ${lote.anio_actuacion}` : 'Año pendiente'}</span>
                <span className="fx-pildora">{lote.ccaa || 'CCAA pendiente'}</span>
                <span className="fx-pildora">{nExp}{nExp <= MAX_EXPEDIENTES_LOTE ? ` de ${MAX_EXPEDIENTES_LOTE}` : ''} expedientes</span>
                {lote.expediente_verificador && <span className="fx-pildora" title="Nº de expediente del verificador">{lote.expediente_verificador}</span>}
                {lote.registro_miteco && <span className="fx-pildora" title="Nº de registro de la solicitud de emisión en el MITECO">{lote.registro_miteco}</span>}
            </div>

            <div className="lt-estado">
                <div>
                    <span className="lt-estado-k">Estado del lote</span>
                    <div className="lt-estado-v">
                        <b>{lote.estado}</b>
                        {proceso.faseActual != null && (
                            <span className="fx-chip fx-chip-tinta">Paso {proceso.faseActual} de 7</span>
                        )}
                    </div>
                </div>
                <label className="fx-campo">
                    <span>Cambiarlo a mano</span>
                    <select className="fx-select" value={lote.estado} disabled={busy} onChange={e => changeEstado(e.target.value)}>
                        {LOTE_ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
            </div>

            <ol className="lt-pasos" style={{ '--n': fasesVisibles.length }} aria-label="Pasos del trámite">
                {fasesVisibles.map(f => {
                    const actual = proceso.faseActual === f.n;
                    return (
                        <li key={f.n} className={`lt-paso ${f.hecha ? 'lt-hecho' : ''} ${actual ? 'lt-actual' : ''}`}>
                            <button type="button" onClick={() => irAFase(f.n)} title={`${f.n}. ${f.titulo}${f.hecha ? ' · hecho' : actual ? ' · ahora' : ''}`}
                                aria-current={actual ? 'step' : undefined}>
                                <span className="lt-bola">{f.hecha ? <Ico n="check" size={15} sw={2.6} /> : f.n}</span>
                                <span className="lt-paso-et">{PASO_CORTO[f.n]}</span>
                            </button>
                        </li>
                    );
                })}
            </ol>
        </header>
    );

    // Al cambiar de pestaña, si se había bajado más allá de la barra (que va pegada
    // arriba), la pestaña nueva se ve desde su PRINCIPIO, no por la mitad.
    const cambiarTab = (id, barra) => {
        setTab(id);
        requestAnimationFrame(() => {
            const capa = barra?.closest('.lt-capa');
            const cuerpo = barra?.nextElementSibling;
            if (!capa || !cuerpo) return;
            const d = cuerpo.getBoundingClientRect().top - barra.getBoundingClientRect().bottom;
            if (d < 0) capa.scrollTop += d;
        });
    };

    const pestanas = lote && (
        <div className="lt-tabs" role="tablist">
            {[
                ['resumen', 'Resumen', null, false],
                ['expedientes', 'Expedientes', nExp, false],
                ['documentacion', 'Documentación', docsPendientes || null, docsPendientes > 0],
            ].map(([id, label, badge, alerta]) => (
                <button key={id} type="button" role="tab" className="fx-tab" aria-selected={tab === id} onClick={(e) => cambiarTab(id, e.currentTarget.parentElement)}
                    title={id === 'documentacion' && docsPendientes ? `${docsPendientes} firmado(s) por revisar` : undefined}>
                    {label}
                    {badge != null && <span className={`fx-tab-n ${alerta && tab !== id ? 'fx-tab-n-alerta' : ''}`}>{badge}</span>}
                </button>
            ))}
        </div>
    );

    // ─── RESUMEN ────────────────────────────────────────────────────────────────
    const resumen = lote && (
        <div className="lt-pila">
            {/* Lo siguiente: qué toca ahora, con UN botón que lleva a su fase. */}
            {sig && (
                <section className="fx-card fx-pad">
                    {sig.tono === 'hacer' && <div className="fx-filete-fino" />}
                    <div className="lt-sig">
                        <span className={`fx-tile fx-tile-l ${sig.tono === 'ok' ? 'fx-tile-verde' : sig.tono === 'hacer' ? 'fx-tile-naranja' : 'fx-tile-crema'}`}>
                            <Ico n={sig.tono === 'ok' ? 'check' : sig.tono === 'hacer' ? 'derecha' : 'reloj'} size={22} />
                        </span>
                        <div>
                            <span className={`fx-eyebrow ${sig.tono === 'hacer' ? '' : 'fx-eyebrow-gris'}`}>
                                {sig.n ? `Lo siguiente · paso ${sig.n}, ${sig.fase}` : 'Lo siguiente'}
                            </span>
                            <h3 className="fx-display fx-h3">{sig.titulo}</h3>
                            {sig.texto && <p>{sig.texto}</p>}
                        </div>
                        {sig.n && (
                            <button type="button" className={`fx-btn ${sig.tono === 'hacer' ? 'fx-btn-pri' : 'fx-btn-sec'}`} onClick={() => irAFase(sig.n)}>
                                {sig.tono === 'hacer' ? 'Hacerlo ahora' : `Ver el paso ${sig.n}`}<Ico n="derecha" size={18} />
                            </button>
                        )}
                    </div>
                </section>
            )}

            {/* Las cifras del lote (modelo del Excel). El TRABAJADOR ve el ahorro y
                el pago al cliente, pero NO el margen de Brokergy. */}
            <div className="lt-kpis" style={{ '--n': canSeeMargin ? 3 : 2 }}>
                <div className="lt-kpi">
                    <span className="fx-kpi-k">Ahorro generado</span>
                    <span className="lt-kpi-v">{mwhNum(eco.ahorroKwh)}<small>MWh</small></span>
                    <span className="fx-kpi-nota">estimado</span>
                    {eco.hasVerif && (
                        <span className="lt-kpi-verif" title="Ahorro verificado (base de la factura al S.O., en kWh)">
                            Verificado: {kwh(eco.ahorroKwhVerif)}{!eco.fullyVerif ? ` · ${eco.nVerif}/${eco.nTotal}` : ''}
                        </span>
                    )}
                </div>
                <div className="lt-kpi">
                    <span className="fx-kpi-k">Pago a los clientes</span>
                    <span className="lt-kpi-v">{eur(eco.pagoCliente)}</span>
                    <span className="fx-kpi-nota">lo que se les paga</span>
                    {eco.hasVerif && <span className="lt-kpi-verif">Verificado: {eur(eco.pagoClienteVerif)}</span>}
                </div>
                {canSeeMargin && (
                    <div className="lt-kpi">
                        <span className="fx-kpi-k">Beneficio del lote</span>
                        <span className="lt-kpi-v">{eco.beneficioLote != null ? eur(eco.beneficioLote) : '—'}</span>
                        <span className="fx-kpi-nota">{eco.beneficioLote != null ? 'con la oferta del lote' : 'falta la oferta del lote'}</span>
                        {eco.hasVerif && eco.beneficioLoteVerif != null && <span className="lt-kpi-verif">Verificado: {eur(eco.beneficioLoteVerif)}</span>}
                    </div>
                )}
            </div>

            {/* ── TOTAL que nos ingresa el S.O. ───────────────────────────────────
                Es la cifra que se coteja con la transferencia del banco (por eso
                con céntimos), y donde se marca cobrada. Dinero de Brokergy: ADMIN. */}
            {canSeeMargin && cobroSo && (() => {
                const f = lote.factura_so;
                const pagada = f?.estado === 'PAGADA';
                return (
                    <section className="fx-card fx-pad">
                        <div className="lt-cobro">
                            <div>
                                <span className={`fx-eyebrow ${pagada ? 'fx-eyebrow-verde' : ''}`}>Total a cobrar del S.O.</span>
                                <div><Importe n={cobroSo.base} /></div>
                                <p className="lt-nota">
                                    <b>{eur2(cobroSo.total)}</b> con IVA ({Math.round(IVA_FACTURA_SO * 100)} %) ·{' '}
                                    {cobroSo.fuente === 'factura'
                                        ? <>factura <b>{cobroSo.numero}</b>{cobroSo.kwh != null && cobroSo.precioMwh != null && ` · ${kwh(cobroSo.kwh)} × ${num2(cobroSo.precioMwh)} €/MWh`}</>
                                        : <>{cobroSo.fuente === 'verificado' ? 'sobre el ahorro verificado' : <span className="lt-ambar-txt">estimado: falta el ahorro verificado</span>} · sin factura todavía</>}
                                </p>
                            </div>
                            <div className="lt-cobro-acc">
                                {pagada ? (
                                    <>
                                        <span className="fx-chip fx-chip-ok"><Ico n="check" />Cobrado{f.fecha_cobro ? ` el ${f.fecha_cobro}` : ''}</span>
                                        <button type="button" className="fx-link" disabled={busy} onClick={() => marcarCobro(false)}>Deshacer</button>
                                    </>
                                ) : f?.numero ? (
                                    <>
                                        <input type="date" className="fx-input" value={fechaCobro} max={hoyIso()} disabled={busy}
                                            onChange={e => setFechaCobro(e.target.value)} aria-label="Fecha del ingreso" />
                                        <button type="button" className="fx-btn fx-btn-pri" disabled={busy || !fechaCobro} onClick={() => marcarCobro(true)}>
                                            <Ico n="check" size={18} />Marcar cobrado
                                        </button>
                                    </>
                                ) : (
                                    <span className="lt-ayuda">Se marca cobrado cuando esté emitida la factura al S.O.</span>
                                )}
                            </div>
                        </div>
                    </section>
                );
            })()}

            {/* Las partes del lote: quién paga y quién verifica. UNA tarjeta con una
                FILA por parte (mismo esqueleto, así quedan alineadas) y lo que no hace
                falta ver siempre —el equipo de verificación, cambiar la empresa en
                BORRADOR— se despliega con «+». Sin huecos vacíos. */}
            <section className="fx-card lt-partes">
                {[
                    {
                        k: 'so', eyebrow: 'Sujeto Obligado', emp: lote.sujeto_obligado,
                        sub: lote.sujeto_obligado?.razon_social || null,
                        lista: soList, campo: 'sujeto_obligado_id', valor: lote.sujeto_obligado_id,
                    },
                    {
                        k: 'ver', eyebrow: `Verificador${lote.expediente_verificador ? ` · ${lote.expediente_verificador}` : ''}`, emp: lote.verificador,
                        sub: equipo ? [equipo.verificador_jefe?.nombre && `Jefe: ${equipo.verificador_jefe.nombre}`, equipo.revisor_tecnico?.nombre && `Revisor: ${equipo.revisor_tecnico.nombre}`].filter(Boolean).join(' · ') || null : null,
                        lista: verList, campo: 'verificador_id', valor: lote.verificador_id,
                        contacto: equipo?.verificador_jefe,
                        detalle: lote.verificador_id ? <EquipoVerificacion lote={lote} onLote={() => refresh()} /> : null,
                    },
                ].map(pt => {
                    const abierta = parteAbierta === pt.k;
                    const hayMas = isBorrador || !!pt.detalle;
                    return (
                        <div key={pt.k} className="lt-parte">
                            <div className="lt-parte-fila">
                                <span className="lt-logo lt-piel"><LogoEmpresa p={pt.emp} size={40} /></span>
                                <div className="lt-parte-txt">
                                    <span className="fx-eyebrow fx-eyebrow-gris">{pt.eyebrow}</span>
                                    <b>{presName(pt.emp) || 'Sin asignar'}</b>
                                    {pt.sub && <small title={pt.sub}>{pt.sub}</small>}
                                </div>
                                <div className="lt-parte-acc">
                                    {pt.contacto?.email && (
                                        <a className="fx-ico-btn" href={`mailto:${pt.contacto.email}`} title={`Escribir a ${pt.contacto.email}`} aria-label="Escribir al verificador jefe">
                                            <Ico d={ICO_CORREO} size={19} />
                                        </a>
                                    )}
                                    {pt.contacto?.telefono && (
                                        <a className="fx-ico-btn" href={`tel:${pt.contacto.telefono}`} title={`Llamar al ${pt.contacto.telefono}`} aria-label="Llamar al verificador jefe">
                                            <Ico d={ICO_TEL} size={19} />
                                        </a>
                                    )}
                                    {hayMas && (
                                        <button type="button" className={`fx-ico-btn lt-mas ${abierta ? 'lt-mas-abierto' : ''}`} aria-expanded={abierta}
                                            aria-label={abierta ? 'Plegar' : 'Ver más'} title={abierta ? 'Plegar' : 'Ver más'}
                                            onClick={() => setParteAbierta(abierta ? null : pt.k)}>
                                            <Ico n="mas" size={20} sw={2.4} />
                                        </button>
                                    )}
                                </div>
                            </div>
                            {abierta && (
                                <div className="lt-parte-mas">
                                    {isBorrador && (
                                        <label className="fx-campo">
                                            <span>Cambiar {pt.k === 'so' ? 'el Sujeto Obligado' : 'el verificador'}</span>
                                            <select className="fx-select" value={pt.valor || ''} disabled={busy}
                                                onChange={e => patchLote({ [pt.campo]: e.target.value || null })}>
                                                <option value="">— sin asignar —</option>
                                                {pt.lista.map(x => <option key={x.id_empresa} value={x.id_empresa}>{presName(x)}</option>)}
                                            </select>
                                            {pt.lista.length === 0 && <small className="lt-ayuda">Aún no hay ninguno dado de alta.</small>}
                                        </label>
                                    )}
                                    {pt.detalle}
                                </div>
                            )}
                        </div>
                    );
                })}
            </section>

            {/* Datos del trámite. El coste y la oferta son MARGEN (solo ADMIN); el nº
                de expediente del verificador y el registro MITECO son datos de
                gestión que ve y edita todo el staff. Se guardan al salir del campo. */}
            <section className="fx-card fx-pad">
                <span className="fx-eyebrow fx-eyebrow-gris">Datos del trámite</span>
                <h3 className="fx-display fx-h3">Números y referencias</h3>
                <div className="lt-campos">
                    {canSeeMargin && (
                        <label className="fx-campo">
                            {/* La comparación con SU tarifa va como chip junto a la etiqueta y
                                la tarifa en UNA línea debajo: así las dos columnas casan. */}
                            <span className="lt-campo-et">
                                Coste de la verificación (€)
                                {refVerif?.comparacion && (
                                    <span title={refVerif.comparacion.texto}
                                        className={`fx-chip ${refVerif.comparacion.tono === 'caro' ? 'fx-chip-ambar' : 'fx-chip-ok'}`}>
                                        {refVerif.comparacion.tono === 'ok' || refVerif.comparacion.pct == null
                                            ? 'Cuadra con su tarifa'
                                            : `${refVerif.comparacion.pct > 0 ? '+' : '−'}${Math.abs(refVerif.comparacion.pct).toLocaleString('es-ES', { maximumFractionDigits: 0 })} % de su tarifa`}
                                    </span>
                                )}
                            </span>
                            <input type="number" className="fx-input fx-num" value={costeVerifInput} disabled={busy} placeholder="0"
                                onChange={e => setCosteVerifInput(e.target.value)}
                                onBlur={() => { if (String(costeVerifInput) !== String(lote.coste_verificacion ?? '')) patchLote({ coste_verificacion: costeVerifInput }); }} />
                            {/* Orientativa: un lote son 5 actuaciones como mucho, pero se mandan
                                varios a la vez y el escalón es por envío (regla 51). */}
                            {refVerif?.estimacion && (
                                <small className="lt-ayuda" title="Orientativa. Si se verifica junto a otros lotes, compara el €/actuación.">
                                    Su tarifa ({refVerif.n} act.): <b>{Number(refVerif.estimacion.importe).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €</b>
                                    {' · '}{Number(refVerif.estimacion.porActuacion).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €/act.
                                </small>
                            )}
                            {refVerif?.estimacion?.fueraDeTabla && <small className="lt-ayuda lt-ambar-txt">{refVerif.estimacion.aviso}</small>}
                            {refVerif && !refVerif.estimacion && refVerif.motivo && <small className="lt-ayuda">{refVerif.motivo}</small>}
                        </label>
                    )}
                    {canSeeMargin && (
                        <label className="fx-campo">
                            <span>Oferta del lote (€/MWh)</span>
                            <input type="number" className="fx-input fx-num" value={ofertaInput} disabled={busy} placeholder="—"
                                onChange={e => setOfertaInput(e.target.value)}
                                onBlur={() => { if (String(ofertaInput) !== String(lote.oferta_lote ?? '')) patchLote({ oferta_lote: ofertaInput }); }} />
                            {lote.sujeto_obligado?.precio_referencia != null && (
                                <small className="lt-ayuda">Referencia del S.O.: <b>{Number(lote.sujeto_obligado.precio_referencia).toLocaleString('es-ES')} €/MWh</b></small>
                            )}
                        </label>
                    )}
                    <label className="fx-campo">
                        <span>Nº de expediente del verificador</span>
                        <input type="text" className="fx-input" value={expVerifInput} disabled={busy} placeholder="El que nos dé el verificador"
                            onChange={e => setExpVerifInput(e.target.value)}
                            onBlur={() => { if (expVerifInput.trim() !== String(lote.expediente_verificador ?? '')) patchLote({ expediente_verificador: expVerifInput.trim() }); }} />
                        <small className="lt-ayuda">{lote.verificador ? `Su referencia en ${presName(lote.verificador)}.` : 'Su referencia en el sistema del verificador.'}</small>
                    </label>
                    {/* El nº con el que el Gestor Autonómico cita el lote en sus
                        requerimientos: lo único que los casa con el lote. Se lee del
                        justificante al subirlo; aquí solo se corrige. */}
                    <label className="fx-campo">
                        <span>Nº de registro en el MITECO</span>
                        <input type="text" className="fx-input" value={regMitecoInput} disabled={busy} placeholder="REGAGE… (sale del justificante)"
                            onChange={e => setRegMitecoInput(e.target.value)}
                            onBlur={() => { if (regMitecoInput.replace(/\s+/g, '') !== String(lote.registro_miteco ?? '')) patchLote({ registro_miteco: regMitecoInput }); }} />
                        <small className="lt-ayuda" title="El de la solicitud de emisión">Así cita el lote el Gestor Autonómico.</small>
                    </label>
                </div>

                {/* El DICTAMEN, cuando ya lo hay: los datos DEFINITIVOS de la
                    verificación. Se leen del propio dictamen al subirlo. */}
                {dictamen && (
                    <AvisoFx tono="ok" icono="check" className="lt-dictamen" style={{ marginTop: 16 }}>
                        <b>Dictamen favorable</b>
                        <div className="lt-datos">
                            <div><span>Dictamen nº</span><b>{dictamen.numero_dictamen || '—'}</b></div>
                            <div><span>Fecha</span><b>{dictamen.fecha_emision || '—'}</b></div>
                            {dictamen.referencia_informe && <div><span>Informe</span><b>{dictamen.referencia_informe}</b></div>}
                            {dictamen.total_kwh != null && <div><span>Ahorro dictaminado</span><b>{Number(dictamen.total_kwh).toLocaleString('es-ES')} kWh</b></div>}
                        </div>
                        {dictamen.decision && <p className="lt-nota">{dictamen.decision}</p>}
                    </AvisoFx>
                )}
            </section>

            {canSeeMargin && (eco.mediaCliente != null || eco.ofertaLote != null) && (
                <section className="fx-card fx-pad">
                    <span className="fx-eyebrow fx-eyebrow-gris">Precio por MWh</span>
                    <h3 className="fx-display fx-h3">Lo que cobra cada uno</h3>
                    {/* La VERIFICACIÓN se muestra pero NO resta en nuestro margen: la
                        paga el S.O. (va marcada como suya). */}
                    <div className="lt-mwh">
                        {[
                            { label: 'Cliente', value: eco.mediaCliente },
                            { label: 'Verificación', value: eco.costeVerifMwh, nota: 'la paga el S.O.' },
                            { label: 'Nos paga', value: eco.ofertaLote },
                            { label: 'Margen', value: eco.margen, cls: 'lt-margen' },
                        ].map(({ label, value, nota, cls }) => value != null && (
                            <div key={label} className={cls || ''}>
                                <span>{label}</span>
                                <b>{num2(value)}<small>€/MWh</small></b>
                                {nota && <i>{nota}</i>}
                            </div>
                        ))}
                    </div>
                    <p className="lt-nota">Beneficio sin la oferta del lote: <b>{eur(eco.beneficioActual)}</b></p>

                    {/* Lo que le AHORRAMOS al S.O. frente a pagar la equivalencia
                        financiera. Es el argumento con el que se negocia el precio. */}
                    {eco.ahorroSoMwh != null && (
                        <AvisoFx tono="crema" icono="euro" style={{ marginTop: 14 }}>
                            <b>Le ahorramos al S.O. {eur(eco.ahorroSoTotal)}</b> ({eco.ahorroSoPct.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %, {num2(eco.ahorroSoMwh)} €/MWh) frente a la equivalencia financiera de {eco.equivalenciaFinanciera.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €/MWh.
                            <span className="lt-ayuda">
                                {eco.equivalenciaFinanciera.toLocaleString('es-ES', { minimumFractionDigits: 2 })} − ({num2(eco.ofertaLote)} que nos paga + {num2(eco.costeVerifMwh)} de verificación) × {eco.ahorroMwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh
                            </span>
                        </AvisoFx>
                    )}
                </section>
            )}

            {lote.notas && <AvisoFx tono="crema" icono="lapiz">{lote.notas}</AvisoFx>}

            {/* Borrar lote — SOLO ADMIN (el trabajador no borra) */}
            {isBorrador && canDelete && (
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={borrarLote} disabled={busy}>
                        <Ico n="borrar" size={16} />Borrar el lote
                    </button>
                </div>
            )}
        </div>
    );

    // ─── EXPEDIENTES ────────────────────────────────────────────────────────────
    const expedientes = lote && (
        <div className="lt-pila">
            <section className="fx-card fx-pad">
                <div className="fx-card-cab">
                    <div>
                        <span className="fx-eyebrow fx-eyebrow-gris">En el lote</span>
                        <h3 className="fx-display fx-h3">{nExp}{nExp <= MAX_EXPEDIENTES_LOTE ? ` de ${MAX_EXPEDIENTES_LOTE}` : ''} expedientes</h3>
                    </div>
                    {nExp > 0 && (
                        <button type="button" className="fx-link" onClick={() => setShowExpedientes(v => !v)} aria-expanded={showExpedientes}>
                            {showExpedientes ? 'Plegar' : 'Ver la lista'}
                        </button>
                    )}
                </div>
                {nExp === 0 ? (
                    <p className="lt-nota">Sin expedientes. Añade el primero aquí abajo: fijará el año y la CCAA del lote.</p>
                ) : showExpedientes && (
                    <div className="lt-exps">
                        {expedientesOrdenados.map(e => (
                            <ExpedienteCard
                                key={e.id}
                                exp={e}
                                carpetaLocal
                                onError={(msg) => showAlert(msg, 'Carpeta local', 'error')}
                                onClick={onNavigateExpediente ? () => onNavigateExpediente(e.id) : undefined}
                                rightAction={isBorrador ? (
                                    <button type="button" className="fx-ico-btn" onClick={() => removeExpediente(e.id)} disabled={busy}
                                        title="Quitar del lote" aria-label={`Quitar ${e.numero_expediente} del lote`}>
                                        <Ico n="x" size={18} />
                                    </button>
                                ) : null}
                            />
                        ))}
                    </div>
                )}
            </section>

            {/* Añadir expediente (solo BORRADOR) */}
            {isBorrador && (
                <section className="fx-card fx-pad">
                    <span className="fx-eyebrow">Añadir expedientes</span>
                    <h3 className="fx-display fx-h3">
                        {cupoLote > 0 ? <>Caben <span className="fx-mark">{cupoLote}</span> más</> : 'El lote está lleno'}
                    </h3>
                    {loteTieneClaves && (
                        <p className="lt-nota">Solo los de <b>{lote.anio_actuacion}</b> en <b>{lote.ccaa}</b>, como el lote.</p>
                    )}

                    <div className="lt-filtros">
                        {/* CCAA + año solo si el lote aún no tiene claves; si las tiene, manda el lote. */}
                        {!loteTieneClaves && (
                            <>
                                <select className="fx-select" value={fCcaa} onChange={e => setFCcaa(e.target.value)} aria-label="Comunidad autónoma">
                                    <option value="">Todas las CCAA</option>
                                    {ccaaOpts.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <select className="fx-select" value={fAnio} onChange={e => setFAnio(e.target.value)} aria-label="Año de actuación">
                                    <option value="">Todos los años</option>
                                    {anioOpts.map(a => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </>
                        )}
                        <select className="fx-select lt-ancho" value={effInstalador} onChange={e => setFInstalador(e.target.value)} aria-label="Instalador">
                            <option value="">Todos los instaladores</option>
                            {instaladorOpts.map(i => <option key={i.id} value={i.id}>{i.nombre} ({i.n})</option>)}
                        </select>
                        <select className="fx-select" value={fRiesgo} onChange={e => setFRiesgo(e.target.value)} aria-label="Incidencias"
                            title="Incidencias abiertas: las graves son las que el verificador nos devolverá">
                            {RIESGOS.map(r => <option key={r.id} value={r.id}>{r.titulo}</option>)}
                        </select>
                        <select className="fx-select" value={fOrden} onChange={e => setFOrden(e.target.value)} aria-label="Orden">
                            <option value="antiguedad">Más antiguos primero</option>
                            <option value="recientes">Más recientes primero</option>
                            <option value="mwh">Más MWh primero</option>
                            <option value="numero">Por nº de expediente</option>
                        </select>
                        <label className="fx-buscar lt-ancho">
                            <Ico n="buscar" size={18} />
                            <input value={fSearch} onChange={e => setFSearch(e.target.value)} placeholder="Buscar por nº, cliente o instalador…" aria-label="Buscar expedientes" />
                        </label>
                    </div>

                    {/* Propuestas de lote: por antigüedad y por instalador (logic/propuestaLote.js) */}
                    {!loadingEleg && propuestas.length > 0 && (
                        <div style={{ marginTop: 18 }}>
                            <div className="fx-bloque-cab">
                                <span className="lt-sec" style={{ margin: 0 }}>Propuestas de lote</span>
                                <button type="button" className="fx-link" onClick={() => setShowPropuestas(v => !v)} aria-expanded={showPropuestas}>
                                    {showPropuestas ? 'Ocultar' : 'Ver'}
                                </button>
                            </div>
                            {showPropuestas && cubrir?.faltaKwh != null && (
                                <p className="lt-nota" style={{ marginTop: 0 }}>
                                    {cubrir.faltaKwh > 0
                                        ? <>A <b>{cubrir.nombre}</b> le faltan <b>{mwh(cubrir.faltaKwh)}</b> en {cubrir.anio}. Lo elegible con este filtro suma <b>{mwh(kwhElegible)}</b> ({elegiblesClave.length}).</>
                                        : <><b>{cubrir.nombre}</b> ya tiene cubierto {cubrir.anio} si se emite todo lo nuestro.</>}
                                </p>
                            )}
                            {showPropuestas && (
                                <div className="lt-docs" style={{ marginTop: 8 }}>
                                    {(todasPropuestas ? propuestas : propuestas.slice(0, 4)).map(p => {
                                        const dias = diasListo(p.expedientes[0]);
                                        const kwhTotal = p.expedientes.reduce((s, x) => s + (computeExpedienteFinancials(x).savingsKwh || 0), 0);
                                        return (
                                            <div key={p.clave} className="lt-prop">
                                                <span className={`fx-tile ${p.tipo === 'mwh' ? 'fx-tile-naranja' : 'fx-tile-crema'}`}>
                                                    <Ico n={p.tipo === 'mwh' ? 'euro' : p.tipo === 'antiguedad' ? 'reloj' : 'lista'} size={18} />
                                                </span>
                                                <div>
                                                    <b>{p.titulo}{p.yaEnLote && <span className="fx-chip fx-chip-ok" style={{ marginLeft: 8 }}>ya en el lote</span>}</b>
                                                    <small className="fx-mono">{p.expedientes.map(x => x.numero_expediente).join(' · ')}</small>
                                                    <small>
                                                        {!loteTieneClaves && <>{p.anio} · {p.ccaa} · </>}
                                                        {dias != null ? `el más antiguo, listo hace ${dias} días` : 'sin fecha de registro'}
                                                        {p.total > p.expedientes.length && ` · ${p.total} en total`}
                                                        {' · '}<b style={{ display: 'inline' }}>{mwh(kwhTotal)}</b>
                                                    </small>
                                                </div>
                                                <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => addVarios(p.expedientes.map(x => x.id))} disabled={busy}>
                                                    <Ico n="mas" size={16} />Añadir {p.expedientes.length}
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {propuestas.length > 4 && (
                                        <button type="button" className="fx-link" onClick={() => setTodasPropuestas(v => !v)}>
                                            {todasPropuestas ? 'Ver menos propuestas' : `Ver ${propuestas.length - 4} propuestas más`}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Una fila por expediente elegible, con su botón Añadir */}
                    <div className="fx-bloque-cab" style={{ marginTop: 18, marginBottom: 0 }}>
                        <span className="lt-sec" style={{ margin: 0 }}>Uno a uno · {elegiblesVisibles.length} elegibles</span>
                    </div>
                    <div className="lt-elegibles">
                        {loadingEleg ? (
                            <p className="fx-espera-txt"><Ico n="reintentar" size={18} className="fx-spin" />Cargando expedientes elegibles…</p>
                        ) : elegiblesVisibles.length === 0 ? (
                            <p className="lt-nota">{elegibles.length ? 'Ningún expediente coincide con el filtro.' : 'No hay expedientes elegibles (con CIFO y sin lote).'}</p>
                        ) : (
                            <div className="lt-exps">
                                {elegiblesVisibles.map(x => {
                                    const dias = diasListo(x);
                                    const inc = textoIncidencias(x);
                                    return (
                                        <ExpedienteCard
                                            key={x.id}
                                            exp={x}
                                            extra={(x.instalador_nombre || dias != null || inc) ? (
                                                // Los días primero: un nombre de instalador largo no los corta.
                                                <span className="lt-exp-extra">
                                                    {inc && (
                                                        <span className={`fx-chip ${incidenciasDe(x).graves ? 'fx-chip-vence' : 'fx-chip-ambar'}`} style={{ marginRight: 6 }} title="Incidencias abiertas">{inc}</span>
                                                    )}
                                                    {dias != null && <>{dias} días esperando</>}
                                                    {x.instalador_nombre && dias != null && ' · '}
                                                    {x.instalador_nombre}
                                                </span>
                                            ) : null}
                                            rightAction={(
                                                <button type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => addExpediente(x.id)} disabled={busy}>
                                                    <Ico n="mas" size={16} />Añadir
                                                </button>
                                            )}
                                        />
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <p className="lt-nota">
                        Solo con CIFO (año de actuación) y sin lote.
                        {nFueraPorRiesgo > 0 && (
                            <> <button type="button" className="fx-link" onClick={() => setFRiesgo('todos')}>
                                {nFueraPorRiesgo} fuera por incidencias{fRiesgo === 'limpios' ? '' : ' graves'}: verlos
                            </button></>
                        )}
                    </p>

                    {sugerencias.length > 0 && (
                        <AvisoFx tono="ambar" icono="info" style={{ marginTop: 12 }}>
                            <b>Del mismo instalador y sin lotear ({sugerencias.length}):</b>
                            <div className="lt-sugs">
                                {sugerencias.map(s => (
                                    <button key={s.id} type="button" className="fx-btn fx-btn-sec fx-btn-peq" onClick={() => addExpediente(s.id)} disabled={busy}>
                                        <Ico n="mas" size={16} />{s.numero_expediente}
                                    </button>
                                ))}
                            </div>
                        </AvisoFx>
                    )}
                </section>
            )}
        </div>
    );

    return createPortal(
        <div className="lt-capa">
            <style>{CSS_FX}{CSS_LT}</style>
            <div className="fx lt-hoja" role="dialog" aria-modal="true" aria-label={lote?.codigo || 'Lote'}>
                <div className="fx-filete-top" />
                {loading || !lote ? (
                    <div className="lt-in" style={{ padding: '24px 16px' }}>
                        <div className="lt-cab-top">
                            <span className="fx-eyebrow">Lote CAE</span>
                            <button type="button" className="fx-cerrar" aria-label="Cerrar" onClick={onClose}><Ico n="x" /></button>
                        </div>
                        <p className="fx-espera-txt" style={{ marginTop: 24 }}><Ico n="reintentar" size={18} className="fx-spin" />Cargando el lote…</p>
                    </div>
                ) : (
                    <>
                        {cabecera}
                        {pestanas}
                        <div className="lt-cuerpo">
                            <div hidden={tab !== 'resumen'}>{resumen}</div>
                            <div hidden={tab !== 'expedientes'}>{expedientes}</div>
                            {/* El proceso del lote, por fases: documentos y acciones en el
                                orden real del trámite (solicitud → firma S.O. → oferta →
                                verificación → MITECO → cobro). */}
                            <div hidden={tab !== 'documentacion'}>
                                <LoteProcesoFases
                                    lote={lote}
                                    canSeeMargin={canSeeMargin}
                                    faseAbrir={faseAbrir}
                                    onChanged={() => { refresh(); onChanged?.(); }}
                                    acciones={{
                                        abrirSolicitud: () => setShowSolicitud(true),
                                        abrirAnexo: () => setShowAnexo(true),
                                        abrirRequerimiento: () => setShowRequerimiento(true),
                                        abrirFactura: () => setShowFactura(true),
                                    }}
                                />
                            </div>
                        </div>
                    </>
                )}
            </div>
            {/* Los popups del lote se abren encima, con su propio estilo. */}
            {showAnexo && lote && <AnexoListadoModal lote={lote} onClose={() => setShowAnexo(false)} />}
            {showSolicitud && lote && (
                <SolicitudVerificacionModal
                    lote={lote}
                    onClose={() => setShowSolicitud(false)}
                    onSent={() => { refresh().catch(() => {}); onChanged?.(); }}
                />
            )}
            {showFactura && lote && (
                <FacturaSoModal
                    lote={lote}
                    onClose={() => { setShowFactura(false); refresh().catch(() => {}); onChanged?.(); }}
                    onGenerated={() => { refresh().catch(() => {}); onChanged?.(); }}
                />
            )}
            {showRequerimiento && lote && (
                <RequerimientoModal
                    lote={lote}
                    onClose={() => setShowRequerimiento(false)}
                    onSent={() => { refresh().catch(() => {}); onChanged?.(); }}
                />
            )}

            {pideJustificante && lote && (
                <JustificanteMitecoModal
                    lote={lote}
                    onClose={() => setPideJustificante(false)}
                    onSubido={() => { refresh().catch(() => {}); onChanged?.(); }}
                />
            )}
            {pideCobroAlPasar && lote && (
                <CobroSoAlPasarModal
                    lote={lote}
                    nuevoEstado={pideCobroAlPasar}
                    total={cobroSo?.fuente === 'factura' ? cobroSo.total : null}
                    onCobrar={(fecha) => pasarTrasPreguntar(fecha)}
                    onSinCobrar={() => pasarTrasPreguntar(null)}
                    onClose={() => setPideCobroAlPasar(null)}
                />
            )}
        </div>,
        document.body,
    );
}
