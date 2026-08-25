import { useState, useEffect } from 'react';
import axios from 'axios';
import { normalize, PROV_CCAA, PROV_NOMBRE, CCAA_LIST, getProvCodByNombre } from '../utils/direccionCatastral';

// ─── DireccionEdit ───────────────────────────────────────────────────────────
// CCAA → Provincia → Municipio en cascada, con el CP y la calle a mano.
//
// La cascada NO es un desplegable bonito: es lo que impide que el mismo municipio
// se escriba de siete maneras y luego no case con nada. Y lleva siete efectos de
// NORMALIZACIÓN porque los datos llegan de todas partes y en todos los formatos:
// de la base de datos en MAYÚSCULAS, del Catastro con la provincia pegada al
// municipio, de un CP del que hay que deducir provincia y comunidad. Cada uno
// resuelve un caso real; ninguno sobra.
//
// Vivía dentro de ClienteDetailModal. Se saca aquí en cuanto lo necesitó la
// segunda pantalla (el expediente de CEE directo): con dos copias, la dirección
// del cliente y la del inmueble se normalizarían distinto y dejarían de casar.
//
// `Input`, `SelectEl`, `FieldInput` y `FieldView` viajan con él y se exportan:
// son los que le dan su aspecto, y separarlos era garantizar que se desviaran.

export function FieldView({ label, value, valueClassName = '' }) {
    if (!value) return null;
    return (
        <div>
            <p className="text-[10px] uppercase tracking-widest font-black text-white/30 mb-0.5">{label}</p>
            <p className={`text-sm text-white font-medium ${valueClassName}`}>{value}</p>
        </div>
    );
}

export function FieldInput({ label, required, children }) {
    return (
        <div>
            <label className="block text-[10px] uppercase tracking-widest font-black text-white/40 mb-1.5">
                {label}{required && <span className="text-brand ml-0.5">*</span>}
            </label>
            {children}
        </div>
    );
}

export function Input({ className = '', uppercase = false, onChange, ...props }) {
    const handleChange = uppercase && onChange
        ? (e) => { e.target.value = e.target.value.toUpperCase(); onChange(e); }
        : onChange;
    return (
        <input
            className={`w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all ${uppercase ? 'uppercase' : ''} ${className}`}
            onChange={handleChange}
            {...props}
        />
    );
}

export function SelectEl({ className = '', children, ...props }) {
    return (
        <select
            className={`w-full bg-bkg-surface border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/40 transition-all ${className}`}
            {...props}
        >
            {children}
        </select>
    );
}

// ─── Sección dirección editable ─────────────────────────────────────────────
export function DireccionEdit({ values, onChange, autoMunicipioHint, onParseFromDireccion, hasCatastroData = false, catastroDireccion = null }) {
    const [provincias, setProvincias] = useState([]);
    const [municipios, setMunicipios] = useState([]);
    const [loadingProv, setLoadingProv] = useState(false);
    const [loadingMuni, setLoadingMuni] = useState(false);

    // 1. Normalizar CCAA al cargar (viniendo de DB puede ser uppercase)
    useEffect(() => {
        if (!values.ccaa) return;
        const matched = CCAA_LIST.find(c => normalize(c) === normalize(values.ccaa));
        if (matched && matched !== values.ccaa) {
            onChange({ ccaa: matched });
        }
    }, [values.ccaa]);

    // 2. Normalizar Provincia cuando cargue la lista
    useEffect(() => {
        if (loadingProv || provincias.length === 0 || !values.provincia_cod) return;
        const matchedProv = provincias.find(p => p.cod === values.provincia_cod);
        if (matchedProv && matchedProv.nombre !== values.provincia) {
            onChange({ provincia: matchedProv.nombre });
        }
    }, [provincias, loadingProv, values.provincia_cod]);

    // 3. Normalizar Municipio cuando cargue la lista
    useEffect(() => {
        if (loadingMuni || municipios.length === 0 || !values.municipio) return;
        if (!municipios.includes(values.municipio)) {
            const normTarget = normalize(values.municipio);
            const match = municipios.find(m => normalize(m) === normTarget)
                || municipios.find(m => normalize(m).includes(normTarget))
                || municipios.find(m => normTarget.includes(normalize(m)));
            if (match && match !== values.municipio) {
                onChange({ municipio: match });
            }
        }
    }, [municipios, loadingMuni]);

    // 3b. Auto-seleccionar municipio cuando la lista cargue tras un parseo catastral
    useEffect(() => {
        if (!autoMunicipioHint || loadingMuni || municipios.length === 0) return;
        if (values.municipio) return;
        const hintNorm = normalize(autoMunicipioHint);
        const found = municipios.find(m => normalize(m) === hintNorm)
            || municipios.find(m => normalize(m).includes(hintNorm))
            || municipios.find(m => hintNorm.includes(normalize(m)));
        if (found) onChange({ municipio: found });
    }, [municipios, loadingMuni, autoMunicipioHint]);

    // 4. Derivar ccaa del código postal si no viene del cliente
    useEffect(() => {
        if (!values.ccaa && values.codigo_postal && values.codigo_postal.length >= 2) {
            const cpProvCode = values.codigo_postal.substring(0, 2);
            const provNombre = PROV_NOMBRE[cpProvCode];
            const ccaaName = PROV_CCAA[cpProvCode];
            if (provNombre && ccaaName) {
                const matchedCCAA = CCAA_LIST.find(c => normalize(c) === normalize(ccaaName)) || ccaaName;
                onChange({ ccaa: matchedCCAA, provincia: provNombre, provincia_cod: cpProvCode });
            }
        }
    }, []);

    // 5. Cargar provincias cuando cambia CCAA
    useEffect(() => {
        if (!values.ccaa) { setProvincias([]); setMunicipios([]); return; }
        setLoadingProv(true);
        axios.get('/api/geo/provincias', { params: { ccaa: values.ccaa } })
            .then(r => setProvincias(r.data))
            .catch(() => setProvincias([]))
            .finally(() => setLoadingProv(false));
    }, [values.ccaa]);

    // 6. Cargar municipios cuando cambia provincia_cod
    useEffect(() => {
        if (!values.provincia_cod) { setMunicipios([]); return; }
        setLoadingMuni(true);
        axios.get('/api/geo/municipios', { params: { codprov: values.provincia_cod } })
            .then(r => setMunicipios(r.data))
            .catch(() => setMunicipios([]))
            .finally(() => setLoadingMuni(false));
    }, [values.provincia_cod]);

    // 7. Si ya tenemos provincia (del cliente existente) y no hay código, derivarlo
    useEffect(() => {
        if (!values.provincia_cod && values.provincia) {
            const cod = getProvCodByNombre(values.provincia);
            if (cod) {
                const ccaa = values.ccaa || PROV_CCAA[cod] || '';
                onChange({ provincia_cod: cod, ccaa });
            }
        }
    }, [values.provincia]);

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldInput label="CCAA">
                <SelectEl value={values.ccaa || ''} onChange={e => onChange({ ccaa: e.target.value, provincia: '', provincia_cod: '', municipio: '' })}>
                    <option value="">— Selecciona CCAA —</option>
                    {CCAA_LIST.map(c => <option key={c} value={c}>{c}</option>)}
                </SelectEl>
            </FieldInput>
            <FieldInput label="Provincia">
                <SelectEl value={values.provincia_cod || ''} disabled={!values.ccaa || loadingProv}
                    onChange={e => {
                        const opt = e.target.options[e.target.selectedIndex];
                        // Al elegir la opción vacía, `opt.text` es el rótulo del propio
                        // desplegable ("— Selecciona provincia —"). Sin esta guarda se
                        // guardaba ESE TEXTO como provincia; visto al vaciar la
                        // provincia de un CEE directo, y pasaba igual en la ficha de
                        // cliente.
                        const vacia = !opt.value;
                        onChange({ provincia: vacia ? '' : opt.text, provincia_cod: opt.value, municipio: '' });
                    }}>
                    <option value="">{loadingProv ? 'Cargando...' : '— Selecciona provincia —'}</option>
                    {provincias.map(p => <option key={p.cod} value={p.cod}>{p.nombre}</option>)}
                </SelectEl>
            </FieldInput>
            <FieldInput label="Municipio">
                <SelectEl value={values.municipio || ''} disabled={!values.provincia_cod || loadingMuni}
                    onChange={e => onChange({ municipio: e.target.value })}>
                    <option value="">{loadingMuni ? 'Cargando...' : '— Selecciona municipio —'}</option>
                    {municipios.map(m => <option key={m} value={m}>{m}</option>)}
                </SelectEl>
            </FieldInput>
            <FieldInput label="Código Postal">
                <Input placeholder="28001" value={values.codigo_postal || ''} maxLength={5}
                    onChange={e => onChange({ codigo_postal: e.target.value })} />
            </FieldInput>
            <div className="sm:col-span-2">
                <FieldInput label="Dirección">
                    <div className="flex gap-2">
                        <Input placeholder="CALLE, NÚMERO, PISO..." uppercase value={values.direccion || ''}
                            onChange={e => onChange({ direccion: e.target.value })} />
                        {onParseFromDireccion && (
                            <button
                                type="button"
                                onClick={onParseFromDireccion}
                                disabled={!values.direccion && !hasCatastroData}
                                title={
                                    hasCatastroData && !values.direccion
                                        ? (catastroDireccion ? `Usar la dirección del expediente: ${catastroDireccion}` : 'Usar los datos del expediente')
                                        : 'Rellenar CCAA / Provincia / Municipio / CP a partir de la dirección catastral'
                                }
                                className="shrink-0 px-3 py-2.5 rounded-xl border border-brand/30 bg-brand/10 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/20 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                Usar Catastro
                            </button>
                        )}
                    </div>
                </FieldInput>
            </div>
        </div>
    );
}
