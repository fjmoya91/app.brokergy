// ─── NuevoInformeModal — alta a mano de un INFORME ({AAAA}INF_{n}) o de un ────
// CERTIFICADO DE INSTALACIÓN TÉRMICA ({AAAA}CIT_{n}, el RITE suelto).
// Lo normal es que nazcan SOLOS al aceptar el cliente un presupuesto con un
// artículo «Informe técnico» o «Certificado instalación térmica»; esto es para lo
// que ya viene contratado (un WhatsApp, una llamada). El número lo pone el
// SERVIDOR (el siguiente de SU línea) y la carpeta nace en «54. INFORMES
// TECNICOS» o en «39. LEGALIZACIONES RITE / 2. PRODUCCION».
// Ver docs/conocimiento/informes/.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { ClientePicker } from '../../cee-directo/components/ClientePicker';
import { PrescriptorPicker } from '../../../components/PrescriptorPicker';
import { DireccionEdit } from '../../../components/DireccionEdit';

const INMUEBLE_VACIO = { direccion: '', codigo_postal: '', ccaa: '', provincia: '', provincia_cod: '', municipio: '' };
const campo = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40';
const etiqueta = 'block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2';
const LINEAS = [
    { id: 'INF', etiqueta: 'Informe (INF)', ayuda: 'Memorias, legalizaciones, informes… todo lo que no es CAE ni CEE.', tipo: 'MEMORIA_AYUNTAMIENTO' },
    { id: 'CIT', etiqueta: 'Certificado de instalación térmica (CIT)', ayuda: 'El RITE suelto: memoria, firma, presentación en eDICE y certificado.', tipo: 'INSTALACION_TERMICA' },
];
const anio = new Date().getFullYear();

export function NuevoInformeModal({ isOpen, onClose, onCreated, prescriptores = [], lineaInicial = 'INF' }) {
    const [tipos, setTipos] = useState([]);
    const [linea, setLinea] = useState(lineaInicial === 'CIT' ? 'CIT' : 'INF');
    const [tipo, setTipo] = useState(lineaInicial === 'CIT' ? 'INSTALACION_TERMICA' : 'MEMORIA_AYUNTAMIENTO');
    const [titulo, setTitulo] = useState('');
    const [tituloTocado, setTituloTocado] = useState(false);
    const [organismo, setOrganismo] = useState('');
    const [organismoTocado, setOrganismoTocado] = useState(false);
    const [cliente, setCliente] = useState(null);
    const [prescriptorId, setPrescriptorId] = useState(null);
    const [inmueble, setInmueble] = useState(INMUEBLE_VACIO);
    const [refCatastral, setRefCatastral] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        axios.get('/api/informes/tipos').then(r => setTipos(r.data || [])).catch(() => setTipos([]));
    }, [isOpen]);

    // El título y el organismo se proponen; lo tecleado a mano no se pisa.
    useEffect(() => {
        const t = tipos.find(x => x.id === tipo);
        if (t && !tituloTocado) setTitulo(t.titulo);
    }, [tipo, tipos, tituloTocado]);
    useEffect(() => {
        if (organismoTocado) return;
        const muni = String(inmueble.municipio || '').trim();
        setOrganismo(tipo === 'MEMORIA_AYUNTAMIENTO' && muni
            ? `Ayuntamiento de ${muni.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())}` : '');
    }, [tipo, inmueble.municipio, organismoTocado]);

    if (!isOpen) return null;

    const lin = LINEAS.find(l => l.id === linea) || LINEAS[0];
    const tiposDeLinea = tipos.filter(t => (t.linea || 'INF') === linea);
    const elegirLinea = (id) => {
        const l = LINEAS.find(x => x.id === id) || LINEAS[0];
        setLinea(l.id);
        setTipo(l.tipo);
    };

    const crear = async () => {
        if (!cliente?.id_cliente) { setError('Falta el cliente'); return; }
        setGuardando(true);
        setError(null);
        try {
            const { data } = await axios.post('/api/informes', {
                linea, tipo, titulo: titulo.trim(), organismo: organismo.trim() || null,
                cliente_id: cliente.id_cliente, prescriptor_id: prescriptorId || null,
                direccion: inmueble.direccion, codigo_postal: inmueble.codigo_postal, ccaa: inmueble.ccaa,
                provincia: inmueble.provincia, municipio: inmueble.municipio, ref_catastral: refCatastral || null,
            });
            onCreated?.(data);
            onClose?.();
        } catch (err) {
            setError(err.response?.data?.error || `No se ha podido crear el ${linea === 'CIT' ? 'CIT' : 'informe'}.`);
        } finally {
            setGuardando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-6"
            onMouseDown={e => { if (e.target === e.currentTarget) e.currentTarget.dataset.fondo = '1'; }}
            onClick={e => { if (e.target === e.currentTarget && e.currentTarget.dataset.fondo === '1') onClose?.(); e.currentTarget.dataset.fondo = ''; }}>
            <div className="w-full md:max-w-2xl max-h-[92vh] overflow-y-auto bg-bkg-surface border border-white/10 rounded-t-3xl md:rounded-3xl p-5 md:p-7 space-y-6">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-black text-white uppercase tracking-widest">{linea === 'CIT' ? 'Nuevo certificado de instalación térmica' : 'Nuevo informe'}</h2>
                        <p className="text-[11px] text-white/35 mt-1">{lin.ayuda} El número ({anio}{linea}_n) lo pone la app.</p>
                    </div>
                    <button onClick={onClose} className="min-h-[44px] min-w-[44px] text-white/40 hover:text-white text-xl" aria-label="Cerrar">×</button>
                </div>

                <section>
                    <label className={etiqueta}>Línea</label>
                    <div className="flex flex-wrap gap-2">
                        {LINEAS.map(l => (
                            <button key={l.id} type="button" onClick={() => elegirLinea(l.id)}
                                className={`min-h-[40px] px-3 rounded-xl border text-[11px] font-bold transition-colors ${linea === l.id ? 'border-brand/50 bg-brand/15 text-brand' : 'border-white/10 text-white/50 hover:text-white/80'}`}>
                                {l.etiqueta}
                            </button>
                        ))}
                    </div>
                </section>

                {linea === 'INF' && <section>
                    <label className={etiqueta}>Tipo</label>
                    <div className="flex flex-wrap gap-2">
                        {(tiposDeLinea.length ? tiposDeLinea : [{ id: 'MEMORIA_AYUNTAMIENTO', etiqueta: 'Memoria técnica (Ayuntamiento)' }]).map(t => (
                            <button key={t.id} type="button" onClick={() => setTipo(t.id)}
                                className={`min-h-[40px] px-3 rounded-xl border text-[11px] font-bold transition-colors ${tipo === t.id ? 'border-brand/50 bg-brand/15 text-brand' : 'border-white/10 text-white/50 hover:text-white/80'}`}>
                                {t.etiqueta}
                            </button>
                        ))}
                    </div>
                </section>}

                <section className={`grid gap-4 ${linea === 'CIT' ? '' : 'md:grid-cols-2'}`}>
                    <div>
                        <label className={etiqueta}>Título del documento</label>
                        <input value={titulo} onChange={e => { setTitulo(e.target.value); setTituloTocado(true); }} className={campo} />
                    </div>
                    {linea === 'INF' && <div>
                        <label className={etiqueta}>Para quién (organismo)</label>
                        <input value={organismo} onChange={e => { setOrganismo(e.target.value); setOrganismoTocado(true); }} placeholder="Ayuntamiento de …" className={campo} />
                    </div>}
                </section>

                <section>
                    <label className={etiqueta}>Cliente <span className="text-brand">·</span> obligatorio</label>
                    <ClientePicker cliente={cliente} onChange={setCliente} datosNuevoCliente={inmueble} />
                </section>

                <section>
                    <label className={etiqueta}>Inmueble</label>
                    <DireccionEdit values={inmueble} onChange={p => setInmueble(v => ({ ...v, ...p }))} />
                    <input value={refCatastral} onChange={e => setRefCatastral(e.target.value.toUpperCase())} placeholder="Referencia catastral (opcional)" className={`${campo} mt-3 font-mono`} />
                </section>

                <section>
                    <label className={etiqueta}>Partner</label>
                    <PrescriptorPicker prescriptores={prescriptores} value={prescriptorId} onChange={id => setPrescriptorId(id || null)} />
                </section>

                {error && <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-xs text-amber-300">{error}</div>}

                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="min-h-[44px] px-5 rounded-xl border border-white/10 text-white/50 text-[11px] font-black uppercase tracking-widest">Cancelar</button>
                    <button onClick={crear} disabled={guardando || !cliente}
                        className="min-h-[44px] px-5 rounded-xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-widest disabled:opacity-40">
                        {guardando ? 'Creando…' : linea === 'CIT' ? 'Crear CIT' : 'Crear informe'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
