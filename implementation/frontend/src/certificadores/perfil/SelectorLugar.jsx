// ─── SelectorLugar — comunidad → provincia → municipio, en cascada ──────────
// Como la dirección del CRM (components/DireccionEdit.jsx), con el estilo de la
// app: lo pidió Fran (25/10/2026) para la dirección profesional del perfil. Así
// el municipio no se escribe de siete maneras.
// Comunidades y provincias salen de utils/direccionCatastral (las mismas que el
// CRM); los municipios, de GET /api/certapp/municipios?prov=NN (el CSV del INE
// que usa /api/geo), guardados por provincia mientras dura la página.
// Se guarda el NOMBRE (provincia «Ciudad Real», municipio «Argamasilla de
// Alba») y la comunidad en mayúsculas (como las de «Dónde certificas»). Un valor
// que ya estaba escrito a mano y no casa con la lista se respeta: sale como una
// opción más, para que abrir el perfil no lo borre.
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '../api';
import { normalize, PROV_CCAA, PROV_NOMBRE } from '../../utils/direccionCatastral';
import { COMUNIDADES, titulo } from '../ui/listas';
import { Campo } from '../ui/piezas';

const cache = new Map();   // cod de provincia → [municipios]

/** Código de provincia de un nombre escrito como sea («CIUDAD REAL», «Ciudad Real»). */
function codDeProvincia(nombre) {
    const n = normalize(nombre);
    if (!n) return '';
    return Object.keys(PROV_NOMBRE).find(c => normalize(PROV_NOMBRE[c]) === n) || '';
}

/** La comunidad de una provincia (en mayúsculas, como COMUNIDADES). */
const ccaaDeProvincia = (nombre) => PROV_CCAA[codDeProvincia(nombre)] || '';

function useMunicipios(cod) {
    // Lo traído se guarda por provincia; la lista y el «cargando» se DERIVAN de
    // ahí (sin setState síncrono en el efecto).
    const [traidas, setTraidas] = useState({});   // cod → [municipios] | null (falló)
    useEffect(() => {
        if (!cod || cache.has(cod)) return undefined;
        let vivo = true;
        axios.get(`${API}/municipios`, { params: { prov: cod } })
            .then(({ data }) => {
                const l = Array.isArray(data?.municipios) ? data.municipios : [];
                cache.set(cod, l);
                if (vivo) setTraidas(t => ({ ...t, [cod]: l }));
            })
            .catch(() => { if (vivo) setTraidas(t => ({ ...t, [cod]: null })); });
        return () => { vivo = false; };
    }, [cod]);
    if (!cod) return { lista: [], cargando: false };
    const l = cache.get(cod) || traidas[cod];
    return { lista: l || [], cargando: l === undefined };
}

/**
 * @param valor     { ccaa, provincia, municipio }
 * @param onCambiar (parcial) => void — cambiar la comunidad vacía la provincia y
 *                  el municipio; cambiar la provincia vacía el municipio.
 */
export function SelectorLugar({ valor, onCambiar, opcional = true }) {
    const ccaa = valor.ccaa || ccaaDeProvincia(valor.provincia);
    const cod = codDeProvincia(valor.provincia);
    const { lista, cargando } = useMunicipios(cod);

    const provincias = Object.keys(PROV_NOMBRE)
        .filter(c => PROV_CCAA[c] === ccaa)
        .map(c => titulo(PROV_NOMBRE[c]))
        .sort((a, b) => a.localeCompare(b, 'es'));
    // Lo escrito a mano antes de la cascada, si no casa con la lista, se conserva.
    const provSuelta = valor.provincia && !cod ? valor.provincia : null;
    const muniEnLista = lista.find(m => normalize(m) === normalize(valor.municipio));
    const muniSuelto = valor.municipio && !muniEnLista && !cargando ? valor.municipio : null;

    return (
        <>
            <Campo etiqueta="Comunidad autónoma" opcional={opcional}>
                <select className="ca-input" value={ccaa}
                    onChange={e => onCambiar({ ccaa: e.target.value, provincia: '', municipio: '' })}>
                    <option value="">Elige la comunidad</option>
                    {COMUNIDADES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
            </Campo>
            <div className="ca-grid2" style={{ marginTop: 14 }}>
                <Campo etiqueta="Provincia" opcional={opcional}>
                    <select className="ca-input" value={cod ? titulo(PROV_NOMBRE[cod]) : (provSuelta || '')} disabled={!ccaa && !provSuelta}
                        onChange={e => onCambiar({ ccaa, provincia: e.target.value, municipio: '' })}>
                        <option value="">{ccaa ? 'Elige' : 'Antes, la comunidad'}</option>
                        {provSuelta && <option value={provSuelta}>{provSuelta}</option>}
                        {provincias.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </Campo>
                <Campo etiqueta="Municipio" opcional={opcional}>
                    <select className="ca-input" value={muniEnLista || muniSuelto || ''} disabled={!cod && !muniSuelto}
                        onChange={e => onCambiar({ ccaa, provincia: valor.provincia, municipio: e.target.value })}>
                        <option value="">{cargando ? 'Cargando…' : cod ? 'Elige' : 'Antes, la provincia'}</option>
                        {muniSuelto && <option value={muniSuelto}>{muniSuelto}</option>}
                        {lista.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </Campo>
            </div>
        </>
    );
}

export default SelectorLugar;
