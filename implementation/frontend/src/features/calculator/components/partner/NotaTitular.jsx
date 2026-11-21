import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Qué cambia según el TITULAR, para el PARTNER (Fran, 17/11/2026: «lo del
// titular, particular y tal, indicar alguna nota en función de si es particular:
// se pueden tener deducciones en el IRPF; si no, no»). Debajo del desplegable
// «Titular» de Datos económicos. Lo que dice es lo que ya hace el cálculo:
// particular → deducción por la obra en la renta (`includeIrpf`, hasta el 60 %,
// con el requisito del CEE) y el bono tributa como ganancia patrimonial
// (DGT V2137-25); autónomo o empresa → sin deducción (`includeIrpf` se apaga) y
// el bono es un ingreso de su actividad, con factura.
// ─────────────────────────────────────────────────────────────────────────────

const TEXTOS = {
    particular: {
        titulo: 'Particular: puede deducirse la obra en la renta',
        lineas: [
            'Hasta el 60 % de la obra en su declaración (ya va en las cifras), si el certificado energético final mejora lo suficiente: al menos un 30 % menos de consumo de energía no renovable, o la letra A o B.',
            'El bono CAE es una ganancia patrimonial en su renta (normalmente al 19 %) y no le quita la deducción.',
        ],
    },
    autonomo: {
        titulo: 'Autónomo: sin deducción en la renta por la obra',
        lineas: [
            'Elígelo solo si la vivienda o el local está afecto a su actividad. Si es su casa, es «Particular».',
            'El bono es un ingreso de su actividad y lo cobra con factura (con IVA). Las cifras se ajustan solas.',
        ],
    },
    empresa: {
        titulo: 'Empresa: sin deducción en la renta por la obra',
        lineas: [
            'La deducción del IRPF es solo de particulares.',
            'El bono es un ingreso de la empresa y lo cobra con factura (con IVA). Las cifras se ajustan solas.',
        ],
    },
};

export function NotaTitular({ tipo }) {
    const t = TEXTOS[tipo] || TEXTOS.particular;
    return (
        <div className="po-titular" role="note">
            <p className="po-titular-t">{t.titulo}</p>
            <ul>{t.lineas.map(l => <li key={l}>{l}</li>)}</ul>
        </div>
    );
}
