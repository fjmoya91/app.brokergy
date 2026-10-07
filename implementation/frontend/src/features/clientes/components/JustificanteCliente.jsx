import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { JustificanteUploader } from '../../expedientes/components/JustificanteUploader';

// El justificante de titularidad bancaria en la FICHA DEL CLIENTE, junto al IBAN.
// Dice si lo tenemos y se suelta encima para subirlo. Al subirlo se LEE: si la
// ficha no tiene IBAN lo rellena; si lo tiene, comprueba número y titular
// (backend: services/justificanteCliente.js, el mismo camino que el expediente).

const norm = v => String(v || '').toUpperCase().replace(/[•●·]/g, '*').replace(/[^A-Z0-9*]/g, '');

// ¿El IBAN que tiene ahora la ficha es el que se leyó del justificante?
// null = no se puede decir (sin lectura o sin IBAN en la ficha).
function mismoIban(leido, actual) {
    const l = norm(leido), a = norm(actual).replace(/\*/g, '');
    if (!l || !a || l.replace(/\*/g, '').length < 4) return null;
    if (!l.includes('*')) return l === a;
    if (l.length === a.length) return [...l].every((c, i) => c === '*' || c === a[i]);
    const cabeza = l.split('*')[0], cola = l.split('*').pop();
    return a.startsWith(cabeza) && a.endsWith(cola);
}
const cola4 = v => { const s = norm(v).replace(/\*/g, ''); return s ? `…${s.slice(-4)}` : ''; };

export function JustificanteCliente({ clienteId, expedienteId = null, iban = '', clienteForm = null, onRellenar, onSubido }) {
    const [estado, setEstado] = useState(null);
    const [cargando, setCargando] = useState(true);

    const cargar = useCallback(() => {
        if (!clienteId) return;
        axios.get(`/api/clientes/${clienteId}/justificante`, { params: expedienteId ? { expediente: expedienteId } : {} })
            .then(r => setEstado(r.data))
            .catch(() => setEstado(null))
            .finally(() => setCargando(false));
    }, [clienteId, expedienteId]);
    useEffect(() => { cargar(); }, [cargar]);

    const label = (
        <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1.5">Justificante de titularidad</label>
    );
    if (cargando && !estado) {
        return <div>{label}<div className="min-h-[46px] rounded-xl border border-white/[0.06] bg-white/[0.02] animate-pulse" /></div>;
    }

    const link = estado?.link || null;
    const dondeVa = estado?.destino?.numero;
    const detalle = link
        ? `${estado?.en?.numero ? `En ${estado.en.numero} · ` : ''}arrastra otro para sustituirlo`
        : (dondeVa ? `Arrastra el PDF o la foto · se guarda en ${dondeVa}` : null);
    const deshabilitado = !estado?.destino ? 'Sin oportunidad con carpeta de Drive donde guardarlo' : null;

    let aviso = null;
    const coincide = link ? mismoIban(estado?.ocr?.iban_leido, iban) : null;
    if (coincide === false) aviso = `El IBAN de la ficha (${cola4(iban)}) no es el del justificante (${cola4(estado.ocr.iban_leido)}): sube el de la cuenta actual.`;
    else if (link && estado?.ocr && estado.ocr.ok === false && estado.ocr.titular_estado && estado.ocr.titular_estado !== 'coincide') aviso = (estado.ocr.avisos || []).find(a => /titular/i.test(a)) || null;

    return (
        <div>
            {label}
            <JustificanteUploader variant="slot"
                endpoint={`/api/clientes/${clienteId}/justificante`}
                extraBody={expedienteId ? { expediente: expedienteId } : null}
                currentLink={link} detalle={detalle} deshabilitado={deshabilitado} aviso={aviso}
                cliente={clienteForm || undefined}
                onUploaded={(_link, comp) => {
                    if (comp?.rellenar && !String(iban || '').trim() && onRellenar) onRellenar(comp.rellenar, !!comp.rellenado);
                    cargar();
                    if (onSubido) onSubido(comp);
                }} />
        </div>
    );
}

export default JustificanteCliente;
