// ============================================================================
// DashboardView.jsx — Cuadro de Mando. Pantalla de inicio del equipo interno.
//
// Responde de un vistazo a las tres preguntas que se hacen fuera de la app:
//   · Sujeto Obligado → "¿cuántos GWh me vas a traer?"
//   · Gestor          → "¿cuánto vas a facturar y cuánto margen queda?"
//   · Uno mismo       → "¿dónde está atascada la cartera?"
//
// Se alimenta de GET /api/expedientes (la misma fuente que el listado, ya capada
// por rol en el backend) y calcula con computeExpedienteFinancials. No hay
// endpoint propio a propósito: dos fuentes = dos verdades que acaban discrepando.
// ============================================================================
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { getRoleFlags } from '../../../utils/roleFlags';
import {
    FASES, FASES_COMPROMETIBLES, FASES_CAPTACION, buildRow, buildRowOportunidad,
    esCaptacionViva, agregar, agregarPorFase, agregarPorFaseCaptacion, agregarPor,
    eur, num, energiaCorta, PRECIO_SO_DEFAULT
} from '../logic/dashboardAgg';
import { KpiCard, EmbudoFases, Ranking, Panel, TONOS, FiltroBuscable, BandejaAccion } from '../components/DashboardWidgets';

const PRECIO_STORAGE_KEY = 'brokergy-dashboard-precio-so';

export function DashboardView() {
    const { user } = useAuth();
    const { showAlert } = useModal();
    const { canSeeMargin } = getRoleFlags(user);

    const [expedientes, setExpedientes] = useState([]);
    const [oportunidades, setOportunidades] = useState([]);
    const [partners, setPartners] = useState([]);
    const [lotes, setLotes] = useState([]);
    const [elegibles, setElegibles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Precio de venta al S.O. simulado. Persistido en el navegador: es una
    // preferencia de trabajo del usuario, no un dato del expediente — escribirlo
    // en BD implicaría decidir a qué expediente pertenece, y no pertenece a ninguno.
    const [precioVenta, setPrecioVentaRaw] = useState(() => {
        const guardado = parseFloat(localStorage.getItem(PRECIO_STORAGE_KEY));
        return guardado > 0 ? guardado : PRECIO_SO_DEFAULT;
    });
    // Si el usuario nunca ha tocado el precio, se adopta el REAL de los lotes en
    // cuanto llega (ver más abajo). En cuanto lo toca, manda él y no se le vuelve
    // a mover el suelo bajo los pies.
    const precioTocadoPorUsuario = useRef(parseFloat(localStorage.getItem(PRECIO_STORAGE_KEY)) > 0);
    const setPrecioVenta = useCallback((v) => {
        precioTocadoPorUsuario.current = true;
        setPrecioVentaRaw(v);
    }, []);
    useEffect(() => { localStorage.setItem(PRECIO_STORAGE_KEY, String(precioVenta)); }, [precioVenta]);

    // Filtros. Todos son Sets y VACÍO significa "todos": así se pueden combinar
    // varios valores del mismo eje (dos instaladores, dos fases…) y que los
    // totales sumen esa selección, en vez de obligar a mirarlos de uno en uno.
    const [anioSel, setAnioSel] = useState(new Set());
    const [fichaSel, setFichaSel] = useState(new Set());
    const [ccaaSel, setCcaaSel] = useState(new Set());
    const [certSel, setCertSel] = useState(new Set());
    const [instSel, setInstSel] = useState(new Set());
    const [faseSel, setFaseSel] = useState(new Set());
    // Por instalador por defecto: es el único eje con varianza real (38
    // instaladores frente a 3 CCAA, una con el 98% de la cartera).
    const [ejeRanking, setEjeRanking] = useState('inst');

    // Identifica al expediente sin certificador asignado dentro del Set.
    const SIN_CERT = '__SIN_CERT__';
    const toggleFase = useCallback((id) => {
        setFaseSel(prev => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id); else s.add(id);
            return s;
        });
    }, []);

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                setLoading(true);
                const [expRes, presRes] = await Promise.all([
                    axios.get('/api/expedientes'),
                    axios.get('/api/prescriptores').catch(() => ({ data: [] }))
                ]);
                if (!vivo) return;
                setExpedientes(Array.isArray(expRes.data) ? expRes.data : []);
                setPartners(Array.isArray(presRes.data) ? presRes.data : []);
                setError(null);
            } catch (e) {
                if (vivo) setError(e.response?.data?.error || 'No se ha podido cargar la cartera de expedientes.');
            } finally {
                if (vivo) setLoading(false);
            }
        })();
        return () => { vivo = false; };
    }, []);

    // La captación se carga APARTE y sin bloquear: el panel de expedientes ya es
    // útil por sí solo, y este bloque aparece en cuanto llega. Si el backend aún
    // no tiene la ruta (no se ha reiniciado), simplemente no se muestra.
    useEffect(() => {
        let vivo = true;
        axios.get('/api/oportunidades/captacion')
            .then(r => { if (vivo) setOportunidades(Array.isArray(r.data) ? r.data : []); })
            .catch(() => { if (vivo) setOportunidades([]); });
        // Lotes: dan el precio REAL al que se vende (oferta_lote). Elegibles: los
        // expedientes que se podrían lotear ya mismo. Ninguno bloquea el panel.
        axios.get('/api/lotes')
            .then(r => { if (vivo) setLotes(Array.isArray(r.data) ? r.data : []); })
            .catch(() => { if (vivo) setLotes([]); });
        axios.get('/api/lotes/elegibles')
            .then(r => { if (vivo) setElegibles(Array.isArray(r.data) ? r.data : []); })
            .catch(() => { if (vivo) setElegibles([]); });
        return () => { vivo = false; };
    }, []);

    // Precio REAL pactado con el Sujeto Obligado, según los lotes ya creados. El
    // default de 160 €/MWh venía de calculateFinancials y se quedó corto: con él
    // el panel subestimaba la facturación frente a lo que de verdad se factura.
    const precioReal = useMemo(() => {
        const precios = lotes.map(l => parseFloat(l.oferta_lote)).filter(p => p > 0);
        if (!precios.length) return null;
        return Math.round(precios.reduce((s, p) => s + p, 0) / precios.length);
    }, [lotes]);

    // Se adopta como precio de partida solo si el usuario no ha fijado el suyo.
    useEffect(() => {
        if (precioReal && !precioTocadoPorUsuario.current) setPrecioVentaRaw(precioReal);
    }, [precioReal]);

    // Atajos alrededor del precio real, no fijos: con lotes a 168-175, ofrecer
    // 140/160/180/200 dejaba fuera justo la franja en la que se negocia.
    const atajosPrecio = useMemo(() => {
        const base = precioReal ? Math.round(precioReal / 5) * 5 : PRECIO_SO_DEFAULT;
        return [...new Set([base - 10, base - 5, base, base + 5])].filter(p => p > 0);
    }, [precioReal]);

    const nombrePartner = useCallback((id) => {
        if (!id) return 'Sin asignar';
        const p = partners.find(x => String(x.id_empresa) === String(id));
        return p ? (p.acronimo || p.razon_social || 'Sin nombre') : 'Sin asignar';
    }, [partners]);

    const logoPartner = useCallback((id) => {
        if (!id) return null;
        return partners.find(x => String(x.id_empresa) === String(id))?.logo_empresa || null;
    }, [partners]);

    // Coste alto (reejecuta el motor de cálculo por expediente) → una sola vez.
    const rows = useMemo(() => expedientes.map(buildRow), [expedientes]);

    // Captación: oportunidades que aún NO son expediente. Se descartan las que ya
    // tienen uno creado para no contar el mismo negocio dos veces.
    const rowsCaptacion = useMemo(() => {
        const conExpediente = new Set(expedientes.map(e => String(e.oportunidad_id)).filter(Boolean));
        return oportunidades.filter(op => esCaptacionViva(op, conExpediente)).map(buildRowOportunidad);
    }, [oportunidades, expedientes]);

    // Opciones de filtro derivadas de la propia cartera: nunca ofrecemos un filtro
    // que no devuelva nada.
    const opciones = useMemo(() => {
        const anios = [...new Set(rows.map(r => r.anio).filter(Boolean))].sort((a, b) => b - a);
        const ccaas = [...new Set(rows.map(r => r.ccaa).filter(c => c && c !== '—'))].sort();
        const certs = [...new Set(rows.map(r => r.certificadorId).filter(Boolean))];
        const insts = [...new Set(rows.map(r => r.instaladorId).filter(Boolean))];
        const porNombre = (a, b) => nombrePartner(a).localeCompare(nombrePartner(b), 'es');
        const cuenta = (fn, id) => rows.filter(r => fn(r) === id).length;
        return {
            anios: anios.map(a => ({ value: String(a), label: String(a), count: cuenta(r => String(r.anio), String(a)) })),
            fichas: ['RES060', 'RES080', 'RES093'].map(f => ({ value: f, label: f, count: cuenta(r => r.ficha, f) })),
            ccaas: ccaas.map(c => ({ value: c, label: c, count: cuenta(r => r.ccaa, c) })),
            certs: [{ value: SIN_CERT, label: 'Sin certificador', logo: null, count: rows.filter(r => !r.certificadorId).length },
                    ...certs.sort(porNombre).map(c => ({ value: c, label: nombrePartner(c), logo: logoPartner(c), count: cuenta(r => r.certificadorId, c) }))],
            insts: insts.sort(porNombre).map(i => ({ value: i, label: nombrePartner(i), logo: logoPartner(i), count: cuenta(r => r.instaladorId, i) }))
        };
    }, [rows, nombrePartner, logoPartner]);

    // Filtros de la barra superior, SIN la fase. El embudo se calcula sobre esto:
    // si se aplicase también su propia selección, al elegir una fase las demás
    // caerían a 0 y se perdería justo la comparación que da sentido al embudo.
    // Set vacío = sin filtrar por ese eje. Con varios valores, casa cualquiera
    // de ellos (unión), que es lo que hace que los totales sumen la selección.
    const casa = (set, valor) => set.size === 0 || set.has(valor);

    const filtradasSinFase = useMemo(() => rows.filter(r =>
        casa(anioSel, String(r.anio)) &&
        casa(fichaSel, r.ficha) &&
        casa(ccaaSel, r.ccaa) &&
        casa(certSel, r.certificadorId || SIN_CERT) &&
        casa(instSel, r.instaladorId)
    ), [rows, anioSel, fichaSel, ccaaSel, certSel, instSel]);

    const filtradas = useMemo(
        () => faseSel.size ? filtradasSinFase.filter(r => faseSel.has(r.faseId)) : filtradasSinFase,
        [filtradasSinFase, faseSel]
    );

    const total = useMemo(() => agregar(filtradas, precioVenta), [filtradas, precioVenta]);
    const porFase = useMemo(() => agregarPorFase(filtradasSinFase, precioVenta), [filtradasSinFase, precioVenta]);

    // A la captación se le aplican los filtros que existen en una oportunidad. El
    // de certificador no: aún no hay ninguno asignado, así que se avisa aparte en
    // vez de devolver cero y hacer creer que no queda nada en cartera.
    const captacionFiltrada = useMemo(() => rowsCaptacion.filter(r =>
        casa(anioSel, String(r.anio)) &&
        casa(fichaSel, r.ficha) &&
        casa(ccaaSel, r.ccaa) &&
        casa(instSel, r.instaladorId)
    ), [rowsCaptacion, anioSel, fichaSel, ccaaSel, instSel]);

    const totalCaptacion = useMemo(() => agregar(captacionFiltrada, precioVenta), [captacionFiltrada, precioVenta]);
    const porFaseCaptacion = useMemo(() => agregarPorFaseCaptacion(captacionFiltrada, precioVenta), [captacionFiltrada, precioVenta]);

    // ── Deep-links: SIEMPRE en pestaña nueva, con <a target="_blank">, no con
    // onClick+window.open. Un enlace real deja al navegador hacer lo suyo (clic
    // centro, Ctrl/Cmd+clic, menú contextual "abrir en pestaña nueva", vista
    // previa de la URL al pasar el ratón) y nunca lo frena un bloqueador de
    // popups, que sí puede saltar con window.open. Así el cuadro de mando se
    // queda abierto tal cual estaba y el listado se explora en paralelo.
    const hrefExpediente = (id) => {
        const url = new URL(window.location.origin + '/');
        url.searchParams.set('tab', 'expedientes');
        url.searchParams.set('exp', id);
        return url.toString();
    };
    const hrefEstadosExpediente = (estado) => {
        const url = new URL(window.location.origin + '/');
        url.searchParams.set('tab', 'expedientes');
        url.searchParams.set('estados', estado);
        return url.toString();
    };
    const hrefEstadoOportunidad = (estado) => {
        const url = new URL(window.location.origin + '/');
        url.searchParams.set('tab', 'oportunidades');
        url.searchParams.set('opestado', estado);
        return url.toString();
    };
    const hrefPrioridad = (prioridad) => {
        const url = new URL(window.location.origin + '/');
        url.searchParams.set('tab', 'expedientes');
        url.searchParams.set('prioridad', prioridad);
        return url.toString();
    };

    // La captación entra en el embudo como UNA fila más ("Oportunidades"), la
    // primera, para leer el negocio entero de arriba abajo. Sus sub-estados son
    // las fases de captación, no los estados crudos: 'Propuesta por enviar' dice
    // más que 'PTE ENVIAR'. No filtra los KPIs (esCaptacion). Cada sub-estado
    // lleva ya su `href` de destino, calculado aquí (dashboardAgg.js es lógica
    // pura y no sabe nada de rutas ni de window.location).
    const embudoCompleto = useMemo(() => {
        const conHrefs = porFase.map(f => ({
            ...f,
            subEstados: f.subEstados.map(s => ({ ...s, href: hrefEstadosExpediente(s.estado) }))
        }));
        if (totalCaptacion.count === 0) return conHrefs;
        const filaCaptacion = {
            fase: { id: 'CAPTACION', label: 'Oportunidades', desc: 'Propuestas aún sin aceptar: todavía no son expedientes', color: 'gray' },
            ...totalCaptacion,
            esCaptacion: true,
            subEstados: porFaseCaptacion
                .filter(f => f.count > 0)
                .map(f => ({
                    estado: f.fase.label, count: f.count, mwh: f.mwh, facturacion: f.facturacion,
                    href: hrefEstadoOportunidad(f.fase.estados[0])
                }))
        };
        return [filaCaptacion, ...conHrefs];
    }, [porFase, porFaseCaptacion, totalCaptacion]);
    const ranking = useMemo(() => {
        if (ejeRanking === 'anio') return agregarPor(filtradas, precioVenta, r => r.anio, k => k === '—' ? 'Sin año' : String(k));
        if (ejeRanking === 'ficha') return agregarPor(filtradas, precioVenta, r => r.ficha);
        // Con logo: se reconoce al partner sin leer la razón social completa.
        if (ejeRanking === 'cert') return agregarPor(filtradas, precioVenta, r => r.certificadorId, nombrePartner)
            .map(d => ({ ...d, logo: logoPartner(d.key) }));
        if (ejeRanking === 'inst') return agregarPor(filtradas, precioVenta, r => r.instaladorId, nombrePartner)
            .map(d => ({ ...d, logo: logoPartner(d.key) }));
        return agregarPor(filtradas, precioVenta, r => r.ccaa, k => k === '—' ? 'Sin CCAA' : k);
    }, [filtradas, precioVenta, ejeRanking, nombrePartner, logoPartner]);

    // ── Bandeja "requiere tu atención" ───────────────────────────────────────
    // Se calcula sobre `filtradas` para que respete los filtros de arriba: si
    // acotas por instalador, los avisos son de ESE instalador. Los expedientes ya
    // cobrados/cerrados no generan avisos (no hay nada que hacer con ellos).
    const avisos = useMemo(() => {
        const vivos = filtradas.filter(r => r.faseId !== 'EMITIDO');
        const urgentes = vivos.filter(r => r.prioridad === 'URGENTE');
        const conIncidencias = filtradas.filter(r => r.incidenciasAbiertas > 0);
        const parados = vivos.filter(r => (r.diasSinMovimiento ?? 0) >= 30);
        // Documentación lista pero sin fecha de fin de CIFO: no se pueden agrupar
        // en lote (el lote va por año + CCAA), así que se quedan atascados.
        const bloqueados = filtradas.filter(r => r.faseId === 'LISTO' && !r.tieneAnioCifo);
        // Los elegibles vienen del backend, que ya comprueba año, CCAA y que no
        // tengan lote asignado — lo que la RPC del listado no permite saber.
        const lotesPosibles = Math.ceil(elegibles.length / 5);

        const eurDe = (rows) => eur(rows.reduce((s, r) => s + r.mwh * precioVenta, 0));

        return [
            {
                id: 'urgentes', count: urgentes.length, tono: 'red',
                titulo: 'Marcados como urgentes',
                detalle: urgentes.length ? eurDe(urgentes) : null,
                ayuda: 'Expedientes con prioridad URGENTE sin cobrar',
                href: hrefPrioridad('URGENTE'),
                icono: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            },
            {
                id: 'incidencias', count: conIncidencias.length, tono: 'amber',
                titulo: 'Con incidencias abiertas',
                detalle: 'Bloquean el envío a verificación',
                ayuda: 'Expedientes con al menos una incidencia sin subsanar',
                href: hrefEstadosExpediente('CON_INCIDENCIAS'),
                icono: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" /></svg>
            },
            {
                id: 'lotes', count: elegibles.length, tono: 'emerald',
                titulo: lotesPosibles === 1 ? 'Listos: 1 lote por crear' : `Listos: ${lotesPosibles} lotes por crear`,
                detalle: 'Documentación completa y agrupables ya',
                ayuda: 'Expedientes sin lote, con año de CIFO y CCAA resueltos',
                href: hrefEstadosExpediente('DOC. COMPLETA,DOC. COMPLETA APPSHEET'),
                icono: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
            },
            {
                id: 'bloqueados', count: bloqueados.length, tono: 'violet',
                titulo: 'Listos pero sin fecha de CIFO',
                detalle: `No se pueden lotear · ${eurDe(bloqueados)}`,
                ayuda: 'Documentación completa, pero sin fecha de fin de obra no se pueden agrupar en un lote',
                href: hrefEstadosExpediente('DOC. COMPLETA,DOC. COMPLETA APPSHEET'),
                icono: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
            },
            {
                id: 'parados', count: parados.length, tono: 'slate',
                titulo: 'Sin movimiento en 30 días',
                // Sin enlace: el listado no tiene filtro por antigüedad, y mandar
                // a una lista sin filtrar sería peor que no ofrecer el salto.
                detalle: parados.length ? eurDe(parados) : null,
                ayuda: 'Expedientes vivos cuya última modificación es de hace más de 30 días',
                icono: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            }
        ];
    }, [filtradas, elegibles, precioVenta]);

    // "Comprometible" = lo que se puede prometer al Sujeto Obligado sin apostar:
    // documentación completa en adelante. Las fases tempranas aún pueden caerse.
    const comprometible = useMemo(
        () => agregar(filtradas.filter(r => FASES_COMPROMETIBLES.includes(r.faseId)), precioVenta),
        [filtradas, precioVenta]
    );

    const numFiltros = anioSel.size + fichaSel.size + ccaaSel.size + certSel.size + instSel.size + faseSel.size;
    const hayFiltros = numFiltros > 0;
    const limpiarFiltros = () => {
        setAnioSel(new Set()); setFichaSel(new Set()); setCcaaSel(new Set());
        setCertSel(new Set()); setInstSel(new Set()); setFaseSel(new Set());
    };

    const energiaTotal = energiaCorta(total.mwh);
    const energiaFirme = energiaCorta(comprometible.mwh);
    const energiaCaptacion = energiaCorta(totalCaptacion.mwh);

    // Top de expedientes por facturación: dónde está el dinero grande.
    const topExpedientes = useMemo(
        () => [...filtradas].sort((a, b) => b.mwh - a.mwh).slice(0, 8),
        [filtradas]
    );

    // Resumen en texto plano para pegar en un WhatsApp o un correo. Es el uso
    // real del panel: hablar con el S.O. o con el gestor sin rehacer las cuentas.
    const copiarResumen = async () => {
        const lista = (set, fn = String) => [...set].map(fn).join(' + ');
        const alcance = [
            anioSel.size && `año ${lista(anioSel)}`,
            ccaaSel.size && lista(ccaaSel),
            fichaSel.size && lista(fichaSel),
            certSel.size && `certificador ${lista(certSel, v => v === SIN_CERT ? 'sin asignar' : nombrePartner(v))}`,
            instSel.size && `instalador ${lista(instSel, nombrePartner)}`,
            faseSel.size && lista(faseSel, id => FASES.find(f => f.id === id)?.label || id)
        ].filter(Boolean).join(', ') || 'cartera completa';

        const lineas = [
            `RESUMEN CARTERA CAE — ${alcance}`,
            `Precio de venta aplicado: ${num(precioVenta)} €/MWh`,
            '',
            `Expedientes: ${total.count}`,
            `Volumen CAE: ${energiaTotal.valor} ${energiaTotal.unidad}`,
            `Facturación prevista: ${eur(total.facturacion)}`,
            `Pago a clientes: ${eur(total.cae)}`,
            canSeeMargin && total.profitDisponible
                ? `Margen Brokergy: ${eur(total.profit)}${total.sinMargen > 0 ? ` (sobre ${total.count - total.sinMargen} de ${total.count} expedientes)` : ''}`
                : null,
            '',
            `Comprometible (doc. completa en adelante): ${energiaFirme.valor} ${energiaFirme.unidad} · ${eur(comprometible.facturacion)} en ${comprometible.count} expedientes`,
            totalCaptacion.count > 0
                ? `Además en captación (oportunidades sin aceptar): ${totalCaptacion.count} · ${energiaCaptacion.valor} ${energiaCaptacion.unidad} · ${eur(totalCaptacion.facturacion)}`
                : null,
            '',
            'Desglose por fase:',
            ...porFase.filter(f => f.count > 0).map(f => {
                const e = energiaCorta(f.mwh);
                return `  · ${f.fase.label}: ${f.count} exp · ${e.valor} ${e.unidad} · ${eur(f.facturacion)}`;
            })
        ].filter(l => l !== null).join('\n');

        try {
            await navigator.clipboard.writeText(lineas);
            showAlert('Ya lo puedes pegar en un WhatsApp o un correo.', 'Resumen copiado', 'success');
        } catch {
            showAlert('El navegador ha bloqueado el portapapeles. Prueba a exportar a Excel.', 'No se ha podido copiar', 'error');
        }
    };

    const exportarCsv = () => {
        const cab = ['Expediente', 'Cliente', 'Estado', 'Fase', 'Ficha', 'Año', 'CCAA', 'Certificador', 'Instalador', 'MWh', 'Facturacion', 'PagoCliente'];
        if (canSeeMargin) cab.push('Margen');
        const filas = filtradas.map(r => {
            const facturacion = r.mwh * precioVenta;
            const margen = r.profit == null ? '' : r.profit + r.mwh * (precioVenta - r.precioSOGuardado);
            const base = [
                r.numero, r.cliente, r.estado, FASES.find(f => f.id === r.faseId)?.label || '',
                r.ficha, r.anio ?? '', r.ccaa, nombrePartner(r.certificadorId), nombrePartner(r.instaladorId),
                r.mwh.toFixed(3), facturacion.toFixed(2), r.cae.toFixed(2)
            ];
            if (canSeeMargin) base.push(margen === '' ? '' : Number(margen).toFixed(2));
            // Separador ';' y coma decimal: es lo que Excel en español abre sin asistente.
            return base.map(v => `"${String(v).replace(/"/g, '""').replace(/\./g, ',')}"`).join(';');
        });
        const csv = '﻿' + [cab.join(';'), ...filas].join('\n');
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `cartera-cae-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="p-6 sm:p-10 max-w-[1600px] mx-auto animate-fade-in">
                <div className="h-8 w-56 rounded-lg skeleton mb-8" />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-2xl skeleton" />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="h-80 rounded-2xl skeleton lg:col-span-2" />
                    <div className="h-80 rounded-2xl skeleton" />
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 sm:p-10 max-w-[1600px] mx-auto animate-fade-in">
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
                    <h2 className="text-sm font-black uppercase tracking-widest text-red-400 mb-2">No se ha podido cargar el panel</h2>
                    <p className="text-xs text-white/50">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 sm:p-10 min-h-full animate-fade-in relative z-10 max-w-[1600px] mx-auto">

            {/* ── Cabecera ───────────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-gradient-to-br from-brand/20 to-brand-700/10 rounded-xl border border-brand/20 text-brand shadow-lg shadow-brand/10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white uppercase tracking-tight">Cuadro de mando</h1>
                        <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mt-0.5">
                            {total.count} de {rows.length} expedientes · {hayFiltros ? 'filtrado' : 'cartera completa'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={copiarResumen}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/[0.08] bg-bkg-surface text-white/60 hover:text-white hover:bg-bkg-hover transition-all text-[10px] font-black uppercase tracking-wider"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copiar resumen
                    </button>
                    <button
                        onClick={exportarCsv}
                        className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-white/[0.08] bg-bkg-surface text-white/60 hover:text-white hover:bg-bkg-hover transition-all text-[10px] font-black uppercase tracking-wider"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Excel
                    </button>
                </div>
            </div>

            {/* ── Filtros + precio de venta ───────────────────────────────── */}
            {/* Una sola fila: filtros a la izquierda, precio de venta arriba a la
                derecha. Sin barra de rango — ocupaba una fila entera solo para
                mover un número que los 4 atajos ya cubren de sobra.
                `ml-auto` en vez de `justify-between` en el padre: con 5 filtros
                más el precio no siempre caben en una sola línea, y justify-between
                deja el precio pegado a la IZQUIERDA en cuanto salta de línea (con
                un único hijo en esa línea, "space-between" se comporta como
                flex-start). ml-auto lo ancla a la derecha se parta o no la fila. */}
            <div className="rounded-2xl border border-white/[0.06] bg-bkg-surface/60 p-4 mb-6 shadow-xl">
                <div className="flex items-end gap-4 flex-wrap">
                    <div className="flex items-end gap-3 flex-wrap">
                        <FiltroBuscable label="Año" value={anioSel} onChange={setAnioSel} opciones={opciones.anios} etiquetaTodos="Todos los años" />
                        <FiltroBuscable label="Ficha" value={fichaSel} onChange={setFichaSel} opciones={opciones.fichas} etiquetaTodos="Todas las fichas" />
                        <FiltroBuscable label="CCAA" value={ccaaSel} onChange={setCcaaSel} opciones={opciones.ccaas} etiquetaTodos="Todas las CCAA" />
                        <FiltroBuscable label="Certificador" value={certSel} onChange={setCertSel} opciones={opciones.certs} etiquetaTodos="Todos" />
                        <FiltroBuscable label="Instalador" value={instSel} onChange={setInstSel} opciones={opciones.insts} etiquetaTodos="Todos" />
                        <button
                            onClick={limpiarFiltros}
                            disabled={!hayFiltros}
                            title={hayFiltros ? 'Quitar todos los filtros' : 'No hay filtros aplicados'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                                hayFiltros
                                    ? 'text-brand border-brand/30 hover:bg-brand/10 hover:border-brand/50'
                                    : 'text-white/20 border-white/[0.06] cursor-not-allowed'
                            }`}
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Borrar filtros{hayFiltros ? ` (${numFiltros})` : ''}
                        </button>
                    </div>

                    <div className="flex flex-col gap-1 items-end ml-auto">
                        <span className="text-[8px] font-black uppercase tracking-widest text-brand/60 px-1">
                            Precio de venta al Sujeto Obligado
                        </span>
                        <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1">
                                {atajosPrecio.map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPrecioVenta(p)}
                                        title={precioReal === p ? 'Media real de tus lotes' : undefined}
                                        className={`px-1.5 py-1 rounded-lg text-[9px] font-black tabular-nums border transition-all ${
                                            precioVenta === p
                                                ? 'bg-brand/15 text-brand border-brand/40'
                                                : 'text-white/30 border-white/10 hover:text-white/60 hover:border-white/20'
                                        }`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="number"
                                min="0"
                                step="5"
                                value={precioVenta}
                                onChange={e => setPrecioVenta(Math.max(0, parseFloat(e.target.value) || 0))}
                                aria-label="Precio de venta al Sujeto Obligado, en euros por MWh"
                                className="w-16 bg-bkg-deep border border-brand/25 rounded-lg px-2 py-1.5 text-sm font-black text-brand tabular-nums text-right focus:outline-none focus:border-brand/60 transition-colors"
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/30">€/MWh</span>
                        </div>
                    </div>
                </div>
                <p className="mt-3 text-[9px] font-bold text-white/25 leading-relaxed">
                    Solo simula tu precio de venta. Lo que se paga al cliente no cambia: es el precio ya ofertado en cada oportunidad.
                    {precioReal && (
                        <>
                            {' '}Tus lotes se han pactado de media a <span className="text-brand/70">{num(precioReal)} €/MWh</span>
                            {precioVenta !== precioReal && (
                                <button
                                    onClick={() => setPrecioVenta(precioReal)}
                                    className="ml-1.5 underline underline-offset-2 text-brand/60 hover:text-brand transition-colors"
                                >
                                    usar ese precio
                                </button>
                            )}
                            .
                        </>
                    )}
                </p>
            </div>

            {/* ── KPIs ───────────────────────────────────────────────────── */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${canSeeMargin ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4 mb-6`}>
                <KpiCard
                    label="Volumen CAE"
                    valor={energiaTotal.valor}
                    unidad={energiaTotal.unidad}
                    tono="blue"
                    destacado
                    // La barra deja ver DE UN VISTAZO por qué "comprometible" no
                    // coincide con el total: es la parte con doc. completa en
                    // adelante, el resto (CEE inicial/obra/cierre) aún puede caerse.
                    composicion={total.mwh > 0 ? {
                        pct: (comprometible.mwh / total.mwh) * 100,
                        etiquetaFirme: `${energiaFirme.valor} ${energiaFirme.unidad} firmes`,
                        etiquetaResto: `${energiaCorta(total.mwh - comprometible.mwh).valor} ${energiaCorta(total.mwh - comprometible.mwh).unidad} en curso`
                    } : null}
                    sub={`${total.count} exp.` + (totalCaptacion.count > 0 ? ` · +${energiaCaptacion.valor} ${energiaCaptacion.unidad} en captación` : '')}
                    icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                />
                <KpiCard
                    label="Facturación prevista"
                    valor={eur(total.facturacion)}
                    tono="brand"
                    destacado
                    sub={`A ${num(precioVenta)} €/MWh`}
                    icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 7h6m-6 4h6m-6 4h4M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16l-3-2-2 2-2-2-2 2-2-2-3 2z" /></svg>}
                />
                <KpiCard
                    label="Pago a clientes (bono CAE)"
                    valor={eur(total.cae)}
                    tono="emerald"
                    sub="Al precio ofertado en cada oportunidad"
                    icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                />
                {canSeeMargin && (
                    <KpiCard
                        label="Margen Brokergy"
                        valor={total.profitDisponible ? eur(total.profit) : '—'}
                        tono="violet"
                        destacado
                        sub={total.facturacion > 0 && total.profitDisponible
                            ? `${num((total.profit / total.facturacion) * 100, 1)}% sobre facturación`
                              + (total.sinMargen > 0 ? ` · ${total.sinMargen} exp. sin margen calculable` : '')
                            : 'Sin datos suficientes'}
                        icono={<svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
                    />
                )}
            </div>

            {/* ── Aviso de fiabilidad ────────────────────────────────────── */}
            {(total.heredados > 0 || total.sinEconomia > 0) && (
                <div className="mb-6 rounded-xl border border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 flex items-start gap-3">
                    <svg className="w-4 h-4 text-amber-400/70 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-[10px] font-bold text-amber-400/60 leading-relaxed">
                        {total.heredados > 0 && <>{total.heredados} expediente{total.heredados > 1 ? 's usan' : ' usa'} la economía estimada en la oportunidad (aún sin CEE cargado). </>}
                        {total.sinEconomia > 0 && <>{total.sinEconomia} sin ahorro calculable: no suman a los totales. </>}
                        {total.sinClasificar > 0 && <>{total.sinClasificar} con un estado que el panel no reconoce: se cuentan en la primera fase. </>}
                        Las cifras se afinan solas según entran los CEE y las verificaciones.
                    </p>
                </div>
            )}

            {/* ── Cómo se calcula ────────────────────────────────────────── */}
            {/* El panel y el listado de Expedientes dan cifras distintas para el
                mismo expediente (distinto precio, distinto conjunto). Explicarlo
                aquí evita tener que reconstruirlo cada vez que un número extraña. */}
            <details className="mb-6 rounded-2xl border border-white/[0.06] bg-bkg-surface/40 overflow-hidden group">
                <summary className="cursor-pointer list-none px-4 py-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors">
                    <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                    </svg>
                    Cómo se calculan estas cifras
                </summary>
                <div className="px-4 pb-4 pt-1 space-y-3 text-[11px] leading-relaxed text-white/50 border-t border-white/[0.06]">
                    <p>
                        <span className="text-white/80 font-black">Facturación prevista</span> = MWh × el precio de venta de arriba.
                        Es lo que factura Brokergy al Sujeto Obligado, y es lo único que cambia al mover el precio.
                    </p>
                    <p>
                        <span className="text-white/80 font-black">Pago a clientes</span> = lo que se le paga a cada cliente al precio
                        que se le ofertó en su oportunidad. No se simula: es un compromiso ya cerrado. En el listado de
                        Expedientes esta misma cifra aparece como «Bono CAE estimado».
                    </p>
                    <p>
                        <span className="text-white/80 font-black">Margen Brokergy</span> = facturación − pago a clientes − costes del
                        expediente (comisión de prescriptor, certificados, legalización). Por eso no es la resta exacta de las dos
                        tarjetas de arriba.
                    </p>
                    <p>
                        <span className="text-white/80 font-black">MWh</span>: se usa el ahorro <em>verificado</em> en cuanto el
                        verificador lo confirma; hasta entonces, el estimado del CEE. Si aún no hay CEE cargado, se hereda el que se
                        calculó en la oportunidad.
                    </p>
                    <p className="pt-1 border-t border-white/[0.06]">
                        <span className="text-white/80 font-black">Ojo al comparar con Expedientes</span>: aquel listado calcula el
                        beneficio con el precio guardado en cada expediente y aquí manda el simulador, así que los números solo
                        coinciden con el precio en {num(PRECIO_SO_DEFAULT)} €/MWh. Además, cada pantalla suma los expedientes que tenga
                        filtrados: comprueba que el recuento de la cabecera sea el mismo antes de dar por buena una diferencia.
                    </p>
                </div>
            </details>

            {/* ── Embudo + ranking ───────────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
                <Panel
                    titulo="Dónde está la cartera"
                    className="lg:col-span-3"
                    accion={faseSel.size > 0 && (
                        <button onClick={() => setFaseSel(new Set())} className="text-[9px] font-black uppercase tracking-widest text-brand/70 hover:text-brand transition-colors">
                            Ver todas ({faseSel.size} activas)
                        </button>
                    )}
                >
                    <EmbudoFases
                        datos={embudoCompleto}
                        faseSel={faseSel}
                        onToggleFase={toggleFase}
                        mostrarBeneficio={canSeeMargin}
                    />
                    <p className="mt-3 text-[9px] font-bold text-white/20 leading-relaxed">
                        Marca varias fases a la vez y los totales de arriba las suman. Despliega cualquiera con la flecha
                        para ver en qué situación están, y pulsa un estado para abrir su listado.
                        {certSel.size > 0 && ' Ojo: el filtro de certificador no aplica a las oportunidades.'}
                    </p>
                </Panel>

                {/* La bandeja ocupa el mejor hueco de la pantalla (arriba, junto al
                    embudo). Antes estaba aquí el reparto, que con el 98% de la
                    cartera en una sola comunidad no decía nada; ahora vive abajo. */}
                <Panel titulo="Requiere tu atención" className="lg:col-span-2">
                    <BandejaAccion avisos={avisos} />
                    <p className="mt-3 text-[9px] font-bold text-white/20 leading-relaxed">
                        Respeta los filtros de arriba. Cada aviso abre su listado en una pestaña nueva.
                    </p>
                </Panel>
            </div>

            {/* ── Reparto + top de expedientes ───────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                <Panel
                    titulo="Reparto"
                    accion={
                        <select
                            value={ejeRanking}
                            onChange={e => setEjeRanking(e.target.value)}
                            className="bg-bkg-deep border border-white/[0.08] rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider text-white focus:outline-none focus:border-brand/40"
                        >
                            <option value="inst">Por instalador</option>
                            <option value="anio">Por año</option>
                            <option value="ficha">Por ficha</option>
                            <option value="cert">Por certificador</option>
                            <option value="ccaa">Por CCAA</option>
                        </select>
                    }
                >
                    <Ranking datos={ranking} vacio="Sin expedientes con estos filtros" />
                </Panel>

            {/* ── Top de expedientes ─────────────────────────────────────── */}
            <Panel titulo="Expedientes de mayor volumen">
                {topExpedientes.length === 0 ? (
                    <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest py-8 text-center">
                        Sin expedientes con estos filtros
                    </p>
                ) : (
                    <div className="space-y-1">
                        {topExpedientes.map(r => {
                            const fase = FASES.find(f => f.id === r.faseId);
                            const t = TONOS[fase?.color] || TONOS.slate;
                            const e = energiaCorta(r.mwh);
                            return (
                                // <a target="_blank">, no onClick+window.open: así el navegador
                                // ofrece su comportamiento nativo (clic centro, Ctrl/Cmd+clic, menú
                                // contextual "abrir en pestaña nueva") y el enlace es visible al
                                // pasar el ratón. El expediente se abre en una pestaña aparte para
                                // no perder el cuadro de mando de donde se partió.
                                <a
                                    key={r.id}
                                    href={hrefExpediente(r.id)}
                                    target="_blank"
                                    rel="noopener"
                                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-bkg-hover/60 transition-all text-left group"
                                >
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${t.punto}`} />
                                    <span className="text-[11px] font-black text-brand font-mono shrink-0">{r.numero}</span>
                                    <span className="text-[10px] font-bold text-white/50 truncate flex-1 min-w-0">{r.cliente}</span>
                                    <span className="hidden sm:inline text-[9px] font-black uppercase tracking-widest text-white/25 shrink-0">{r.ccaa}</span>
                                    {r.esVerificado && (
                                        <span className="hidden md:inline text-[8px] font-black uppercase tracking-widest text-emerald-400/60 border border-emerald-500/20 rounded px-1.5 py-0.5 shrink-0">
                                            Verificado
                                        </span>
                                    )}
                                    <span className="text-[10px] font-black text-white/60 tabular-nums shrink-0 w-20 text-right">{e.valor} {e.unidad}</span>
                                    <span className="text-[11px] font-black text-white tabular-nums shrink-0 w-24 text-right">{eur(r.mwh * precioVenta)}</span>
                                    <svg className="w-3.5 h-3.5 text-white/15 group-hover:text-brand transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                    </svg>
                                </a>
                            );
                        })}
                    </div>
                )}
            </Panel>
            </div>
        </div>
    );
}
