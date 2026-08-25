import { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import { PrescriptorPicker } from '../../../components/PrescriptorPicker';
import { ClientePicker } from './ClientePicker';

// ─────────────────────────────────────────────────────────────────────────────
// Alta de un CEE contratado suelto.
//
// Dos preguntas mandan y por eso van ARRIBA y en grande: qué número lleva y si
// el encargo es de un certificado o de dos. Todo lo demás (dirección, catastro,
// prescriptor) se puede completar después; el CLIENTE no, y ahí el formulario
// no cede: es la ficha que recibe el certificador cuando se le encarga el
// trabajo, y perseguir un DNI con el técnico ya de camino es lo que hace que
// una visita se caiga.
// ─────────────────────────────────────────────────────────────────────────────

export function NuevoCeeDirectoModal({ isOpen, onClose, onCreated, prescriptores = [] }) {
    const [modo, setModo] = useState('auto');
    const [sugerido, setSugerido] = useState(null);      // { anio, correlativo, numero }
    const [numeroManual, setNumeroManual] = useState('');
    const [chequeo, setChequeo] = useState(null);        // { libre, usadoPor }
    const [alcance, setAlcance] = useState('UNICO');

    const [nombre, setNombre] = useState('');
    const [nombreTocado, setNombreTocado] = useState(false);
    const [clienteId, setClienteId] = useState(null);
    const [cliente, setCliente] = useState(null);

    const [prescriptorId, setPrescriptorId] = useState(null);
    const [direccion, setDireccion] = useState('');
    const [refCatastral, setRefCatastral] = useState('');
    const [municipio, setMunicipio] = useState('');
    const [provincia, setProvincia] = useState('');
    const [codigoPostal, setCodigoPostal] = useState('');
    const [notas, setNotas] = useState('');

    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState(null);

    // ── Número sugerido ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!isOpen) return;
        axios.get('/api/cee-directos/siguiente-numero')
            .then(r => setSugerido(r.data))
            .catch(() => setSugerido(null));
    }, [isOpen]);

    // Comprobación del número tecleado, con freno: se avisa EN el formulario y
    // no después de pulsar "Crear", que es cuando ya has escrito todo lo demás.
    const chequeoTimer = useRef(null);
    useEffect(() => {
        if (modo !== 'manual' || !numeroManual.trim()) { setChequeo(null); return; }
        clearTimeout(chequeoTimer.current);
        chequeoTimer.current = setTimeout(() => {
            axios.get('/api/cee-directos/comprobar-numero', { params: { numero: numeroManual.trim() } })
                .then(r => setChequeo(r.data))
                .catch(() => setChequeo(null));
        }, 350);
        return () => clearTimeout(chequeoTimer.current);
    }, [modo, numeroManual]);

    // El picker devuelve null cuando se pulsa "Cambiar": hay que soltar tambien
    // el id, o se guardaria un cliente que en pantalla ya no aparece.
    const elegirCliente = (c) => {
        setCliente(c);
        setClienteId(c?.id_cliente || null);
        if (!c) return;
        // El nombre de la carpeta se propone a partir del cliente, pero solo
        // mientras no lo hayas escrito tú: pisar lo tecleado a mano es la forma
        // más rápida de que nadie vuelva a fiarse del automatismo.
        if (!nombreTocado) {
            setNombre(`${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim().toUpperCase());
        }
        if (!direccion && c.direccion) setDireccion(c.direccion);
        if (!municipio && c.municipio) setMunicipio(c.municipio);
        if (!provincia && c.provincia) setProvincia(c.provincia);
        if (!codigoPostal && c.codigo_postal) setCodigoPostal(c.codigo_postal);
    };

    const numeroFinal = modo === 'auto' ? (sugerido?.numero || '…') : numeroManual.trim().toUpperCase();
    const numeroManualValido = /^\d{4}CEE_\d+$/.test(numeroManual.trim().toUpperCase());

    const puedeCrear = useMemo(() => {
        if (!nombre.trim() || !clienteId || guardando) return false;
        if (modo === 'manual') return numeroManualValido && chequeo?.libre === true;
        return !!sugerido;
    }, [nombre, clienteId, guardando, modo, numeroManualValido, chequeo, sugerido]);

    const crear = async () => {
        setGuardando(true);
        setError(null);
        try {
            const { data } = await axios.post('/api/cee-directos', {
                modo,
                numero_manual: modo === 'manual' ? numeroManual.trim().toUpperCase() : undefined,
                nombre: nombre.trim(),
                alcance,
                cliente_id: clienteId,
                prescriptor_id: prescriptorId,
                direccion: direccion.trim() || null,
                ref_catastral: refCatastral.trim() || null,
                municipio: municipio.trim() || null,
                provincia: provincia.trim() || null,
                codigo_postal: codigoPostal.trim() || null,
                notas: notas.trim() || null
            });
            onCreated?.(data);
            cerrar();
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo crear el expediente.');
        } finally {
            setGuardando(false);
        }
    };

    const cerrar = () => {
        setModo('auto'); setNumeroManual(''); setChequeo(null); setAlcance('UNICO');
        setNombre(''); setNombreTocado(false); setClienteId(null); setCliente(null);
        setPrescriptorId(null);
        setDireccion(''); setRefCatastral(''); setMunicipio(''); setProvincia('');
        setCodigoPostal(''); setNotas(''); setError(null);
        onClose?.();
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Nunca se cierra al clicar fuera: es el patrón de la app para todo
                formulario con datos escritos (clientes, partners). Solo la X o
                Cancelar. */}
            <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-6">
                <div className="bg-bkg-surface border border-white/10 w-full md:max-w-2xl md:rounded-2xl rounded-t-3xl max-h-[92vh] flex flex-col">

                    <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
                        <div>
                            <h2 className="text-sm font-black text-white uppercase tracking-widest">Nuevo CEE</h2>
                            <p className="text-[11px] text-white/35 mt-0.5">Certificado contratado suelto — fuera del CAE</p>
                        </div>
                        <button onClick={cerrar} className="w-9 h-9 rounded-lg hover:bg-white/5 text-white/40 hover:text-white transition-colors text-xl leading-none">×</button>
                    </div>

                    <div className="overflow-y-auto px-5 py-5 space-y-6">

                        {/* ── Número ─────────────────────────────────────────── */}
                        <section>
                            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Número de expediente</label>
                            <div className="flex gap-2 mb-3">
                                {[['auto', 'Automático'], ['manual', 'Lo pongo yo']].map(([v, txt]) => (
                                    <button key={v} type="button" onClick={() => setModo(v)}
                                        className={`flex-1 min-h-[44px] px-4 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                                            modo === v ? 'bg-brand text-bkg-deep border-brand' : 'bg-white/[0.02] text-white/40 border-white/10 hover:text-white/70'
                                        }`}>{txt}</button>
                                ))}
                            </div>

                            {modo === 'auto' ? (
                                <div className="rounded-xl border border-brand/25 bg-brand/[0.05] px-4 py-3">
                                    <div className="font-mono text-brand text-xl font-black tracking-tight">{sugerido?.numero || 'Calculando…'}</div>
                                    {sugerido && (
                                        <p className="text-[11px] text-white/40 mt-1">
                                            El correlativo va seguido desde 2024 y no se reinicia en enero: el anterior es el {sugerido.correlativo - 1}.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div>
                                    <input
                                        value={numeroManual}
                                        onChange={e => setNumeroManual(e.target.value)}
                                        placeholder={sugerido ? sugerido.numero : '2026CEE_55'}
                                        className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40"
                                    />
                                    {numeroManual.trim() && !numeroManualValido && (
                                        <p className="text-[11px] text-amber-400 mt-1.5">Formato: AAAACEE_N — por ejemplo 2026CEE_55.</p>
                                    )}
                                    {numeroManualValido && chequeo?.libre === false && (
                                        <p className="text-[11px] text-red-400 mt-1.5">
                                            Ese número ya lo usa <strong>{chequeo.usadoPor?.nombre}</strong>. Elige otro.
                                        </p>
                                    )}
                                    {numeroManualValido && chequeo?.libre === true && (
                                        <p className="text-[11px] text-emerald-400 mt-1.5">Libre.</p>
                                    )}
                                </div>
                            )}
                        </section>

                        {/* ── Alcance ────────────────────────────────────────── */}
                        <section>
                            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">¿Qué se ha contratado?</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {[
                                    ['UNICO', 'Un solo CEE', 'Compraventa, alquiler, un certificado y ya está.'],
                                    ['DOBLE', 'CEE inicial y final', 'Hay obra: se certifica antes y después.']
                                ].map(([v, titulo, sub]) => (
                                    <button key={v} type="button" onClick={() => setAlcance(v)}
                                        className={`text-left p-4 rounded-xl border transition-all ${
                                            alcance === v ? 'bg-brand/[0.08] border-brand/50' : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                                        }`}>
                                        <div className={`text-xs font-black uppercase tracking-wider ${alcance === v ? 'text-brand' : 'text-white/70'}`}>{titulo}</div>
                                        <div className="text-[11px] text-white/35 mt-1 leading-snug">{sub}</div>
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-white/30 mt-2">Si más adelante hace falta el final, se añade desde el expediente.</p>
                        </section>

                        {/* ── Cliente ────────────────────────────────────────── */}
                        <section>
                            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">
                                Cliente <span className="text-brand">·</span> obligatorio
                            </label>
                            <ClientePicker cliente={cliente} onChange={elegirCliente} />
                        </section>

                        {/* ── Nombre de la carpeta ───────────────────────────── */}
                        <section>
                            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Nombre del expediente</label>
                            <input
                                value={nombre}
                                onChange={e => { setNombre(e.target.value); setNombreTocado(true); }}
                                placeholder="FRANCISCA LLAMAS GONZÁLEZ"
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40"
                            />
                            <p className="text-[11px] text-white/30 mt-1.5">
                                La carpeta de Drive se llamará <span className="font-mono text-white/50">{numeroFinal} - {nombre.trim() || '…'}</span>
                            </p>
                        </section>

                        {/* ── Resto: se puede completar luego ────────────────── */}
                        <section className="space-y-3">
                            <label className="block text-[10px] font-black text-white/40 uppercase tracking-widest">Inmueble y origen <span className="text-white/20 normal-case font-normal tracking-normal">— se puede completar después</span></label>

                            <PrescriptorPicker
                                prescriptores={prescriptores}
                                value={prescriptorId}
                                onChange={setPrescriptorId}
                                placeholder="— ¿Quién nos lo trae? —"
                                sinPartnerLabel="Directo (sin prescriptor)"
                            />

                            <input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Dirección de la vivienda o local"
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40" />

                            <div className="grid grid-cols-2 gap-2">
                                <input value={municipio} onChange={e => setMunicipio(e.target.value)} placeholder="Municipio"
                                    className="bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40" />
                                <input value={provincia} onChange={e => setProvincia(e.target.value)} placeholder="Provincia"
                                    className="bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40" />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <input value={codigoPostal} onChange={e => setCodigoPostal(e.target.value)} placeholder="C.P."
                                    className="bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40" />
                                <input value={refCatastral} onChange={e => setRefCatastral(e.target.value.toUpperCase())} placeholder="Ref. catastral"
                                    className="bg-white/[0.03] border border-white/10 rounded-xl px-4 min-h-[44px] text-base md:text-sm font-mono text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40" />
                            </div>

                            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Notas internas"
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-base md:text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 resize-none" />
                        </section>

                        {error && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/[0.07] px-4 py-3 text-xs text-red-300">{error}</div>
                        )}
                    </div>

                    {/* Botones pegados abajo con área segura: en el móvil, centrados,
                        el teclado los deja fuera de la pantalla. */}
                    <div className="shrink-0 border-t border-white/[0.06] px-5 py-4 flex gap-2"
                        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                        <button onClick={cerrar}
                            className="flex-1 md:flex-none md:px-6 min-h-[44px] rounded-xl border border-white/10 text-[11px] font-black uppercase tracking-widest text-white/45 hover:text-white transition-colors">
                            Cancelar
                        </button>
                        <button onClick={crear} disabled={!puedeCrear}
                            className="flex-[2] md:flex-1 min-h-[44px] rounded-xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed hover:bg-brand-700 transition-colors">
                            {guardando ? 'Creando…' : `Crear ${numeroFinal}`}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

export default NuevoCeeDirectoModal;
