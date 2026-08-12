/**
 * SlotIlustracion — el dibujo que acompaña a cada apartado en el modo guiado.
 *
 * POR QUÉ EXISTE: la causa número uno de foto rechazada es que no se lee el
 * número de serie de la pegatina. El texto ("acércate hasta que se lean") ya lo
 * pedía y aun así llegaban fotos de la máquina entera desde tres metros. Un
 * dibujo de lo que se espera se entiende antes de leer nada, y para quien tiene
 * poca soltura digital es la diferencia entre subir bien a la primera o entrar
 * en una ronda de WhatsApp.
 *
 * Son PICTOGRAMAS en SVG, no fotos: dibujados aquí, sin peso que descargar en
 * una conexión móvil, escalables y con los colores del tema. Una foto real de
 * una instalación de un cliente no se puede usar sin su permiso (regla del
 * escaparate) y además cada casa es distinta; el dibujo enseña el ENCUADRE, que
 * es justo lo que se hace mal.
 */

import React from 'react';

const A = '#F59E0B';   // ámbar de marca
const L = 'rgba(255,255,255,0.28)';
const F = 'rgba(255,255,255,0.06)';

const wrap = (children) => (
    <svg viewBox="0 0 120 90" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">{children}</svg>
);

/** Marco de encuadre: las cuatro esquinas del visor, para sugerir "así de cerca". */
const Encuadre = ({ x = 8, y = 8, w = 104, h = 74, color = A }) => {
    const c = 11;
    const p = (a, b, dx, dy) => `M${a + dx * c} ${b} H${a} V${b + dy * c}`;
    return (
        <g stroke={color} strokeWidth="2.5" strokeLinecap="round" opacity="0.9">
            <path d={p(x, y, 1, 1)} />
            <path d={p(x + w, y, -1, 1)} />
            <path d={p(x, y + h, 1, -1)} />
            <path d={p(x + w, y + h, -1, -1)} />
        </g>
    );
};

// ── Pictogramas ────────────────────────────────────────────────────────────
// Cada uno enseña el ENCUADRE correcto, no el aparato exacto.

const pictos = {
    // Máquina de fuera: caja con rejilla y ventilador, encuadrada entera.
    unidad_exterior: wrap(<>
        <rect x="26" y="24" width="68" height="46" rx="5" fill={F} stroke={L} strokeWidth="2" />
        <circle cx="60" cy="47" r="14" stroke={A} strokeWidth="2.5" />
        <circle cx="60" cy="47" r="3" fill={A} />
        <path d="M34 30 H50 M34 36 H50 M34 42 H46" stroke={L} strokeWidth="2" strokeLinecap="round" />
        <path d="M40 70 v6 M80 70 v6" stroke={L} strokeWidth="2.5" strokeLinecap="round" />
        <Encuadre />
    </>),

    // Pegatina / placa de características: etiqueta MUY cerca, con lupa.
    placa: wrap(<>
        <rect x="18" y="20" width="72" height="50" rx="4" fill={F} stroke={A} strokeWidth="2.5" />
        <path d="M26 32 H62 M26 41 H74 M26 50 H56 M26 59 H68" stroke={L} strokeWidth="3" strokeLinecap="round" />
        <circle cx="88" cy="58" r="17" fill="rgba(0,0,0,0.35)" stroke={A} strokeWidth="2.5" />
        <path d="M100 70 L110 80" stroke={A} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M80 54 H96 M80 62 H92" stroke={A} strokeWidth="2.5" strokeLinecap="round" />
    </>),

    // Caldera: aparato de pared con tubos.
    caldera: wrap(<>
        <rect x="36" y="18" width="48" height="52" rx="4" fill={F} stroke={L} strokeWidth="2" />
        <rect x="44" y="26" width="32" height="14" rx="2" stroke={A} strokeWidth="2" />
        <circle cx="52" cy="54" r="4" stroke={L} strokeWidth="2" />
        <circle cx="68" cy="54" r="4" stroke={L} strokeWidth="2" />
        <path d="M46 70 v10 M60 70 v10 M74 70 v10" stroke={L} strokeWidth="2.5" strokeLinecap="round" />
        <Encuadre />
    </>),

    // Depósito de ACS: cilindro vertical.
    deposito: wrap(<>
        <rect x="44" y="14" width="34" height="62" rx="16" fill={F} stroke={L} strokeWidth="2" />
        <path d="M44 30 H78" stroke={L} strokeWidth="2" />
        <rect x="52" y="42" width="18" height="11" rx="2" stroke={A} strokeWidth="2" />
        <path d="M61 76 v6" stroke={L} strokeWidth="2.5" strokeLinecap="round" />
        <Encuadre />
    </>),

    // Hueco en la pared donde estaba la caldera.
    hueco: wrap(<>
        <path d="M14 76 H106" stroke={L} strokeWidth="2" />
        <rect x="40" y="20" width="42" height="42" rx="3" fill="rgba(0,0,0,0.3)" stroke={A} strokeWidth="2.5" strokeDasharray="6 4" />
        <path d="M50 30 h8 M50 38 h14" stroke={L} strokeWidth="2" strokeLinecap="round" />
        <path d="M48 62 v14 M74 62 v14" stroke={L} strokeWidth="2.5" strokeLinecap="round" />
        <Encuadre />
    </>),

    // Casa vista desde la calle, entera.
    fachada: wrap(<>
        <path d="M24 44 L60 20 L96 44 V74 H24 Z" fill={F} stroke={L} strokeWidth="2" strokeLinejoin="round" />
        <rect x="36" y="50" width="14" height="12" stroke={A} strokeWidth="2" />
        <rect x="70" y="50" width="14" height="12" stroke={A} strokeWidth="2" />
        <rect x="54" y="56" width="12" height="18" stroke={L} strokeWidth="2" />
        <Encuadre y="10" h="72" />
    </>),

    // Ventana.
    ventana: wrap(<>
        <rect x="30" y="16" width="60" height="58" rx="3" fill={F} stroke={A} strokeWidth="2.5" />
        <path d="M60 16 V74 M30 45 H90" stroke={L} strokeWidth="2" />
        <Encuadre />
    </>),

    // Radiador.
    radiador: wrap(<>
        <rect x="28" y="26" width="64" height="42" rx="4" fill={F} stroke={L} strokeWidth="2" />
        <path d="M40 26 v42 M52 26 v42 M64 26 v42 M76 26 v42" stroke={A} strokeWidth="2" />
        <path d="M36 68 v8 M84 68 v8" stroke={L} strokeWidth="2.5" strokeLinecap="round" />
        <Encuadre />
    </>),

    // Armario de colectores del suelo radiante, abierto.
    colectores: wrap(<>
        <rect x="24" y="16" width="72" height="58" rx="3" fill={F} stroke={L} strokeWidth="2" />
        <path d="M34 32 H86 M34 50 H86" stroke={A} strokeWidth="2.5" />
        <circle cx="42" cy="32" r="3.5" fill={A} /><circle cx="58" cy="32" r="3.5" fill={A} /><circle cx="74" cy="32" r="3.5" fill={A} />
        <circle cx="42" cy="50" r="3.5" stroke={L} strokeWidth="2" /><circle cx="58" cy="50" r="3.5" stroke={L} strokeWidth="2" /><circle cx="74" cy="50" r="3.5" stroke={L} strokeWidth="2" />
        <path d="M34 64 H86" stroke={L} strokeWidth="2" />
        <Encuadre />
    </>),

    // Documento / factura.
    documento: wrap(<>
        <path d="M36 12 H72 L88 28 V78 H36 Z" fill={F} stroke={L} strokeWidth="2" strokeLinejoin="round" />
        <path d="M72 12 V28 H88" stroke={L} strokeWidth="2" strokeLinejoin="round" />
        <path d="M46 40 H78 M46 50 H78 M46 60 H66" stroke={A} strokeWidth="2.5" strokeLinecap="round" />
    </>),

    // Vídeo.
    video: wrap(<>
        <rect x="20" y="26" width="58" height="40" rx="5" fill={F} stroke={L} strokeWidth="2" />
        <path d="M78 40 L100 30 V62 L78 52 Z" fill={F} stroke={A} strokeWidth="2.5" strokeLinejoin="round" />
        <circle cx="36" cy="36" r="3" fill={A} />
    </>),

    // Genérico: cámara.
    foto: wrap(<>
        <rect x="18" y="26" width="84" height="50" rx="6" fill={F} stroke={L} strokeWidth="2" />
        <path d="M44 26 L50 16 H70 L76 26" fill={F} stroke={L} strokeWidth="2" strokeLinejoin="round" />
        <circle cx="60" cy="51" r="15" stroke={A} strokeWidth="2.5" />
        <circle cx="60" cy="51" r="6" fill={A} opacity="0.5" />
    </>),
};

/** Slot → pictograma. El orden importa: lo más específico primero. */
function pictoDe(key = '') {
    const k = String(key).toUpperCase();
    if (k.includes('PLACA_CALDERA')) return 'placa';
    if (k.includes('_PLACA')) return 'placa';
    if (k.includes('ARMARIO_SUELO')) return 'colectores';
    if (k.includes('CALDERA_DESMONTADA')) return 'hueco';
    if (k.includes('CALDERA')) return 'caldera';
    if (k.includes('UNIDAD_EXTERIOR') || k.includes('PISCINA_BDC')) return 'unidad_exterior';
    if (k.includes('UNIDAD_INTERIOR') || k.includes('ACS_DEPOSITO') || k.includes('ACS_ANTES')) return 'deposito';
    if (k.includes('EMISORES')) return 'radiador';
    if (k.includes('VENTANA')) return 'ventana';
    if (k.includes('FACHADA') || k.includes('PATIO') || k.includes('CUBIERTA')) return 'fachada';
    if (k.startsWith('VIDEO_')) return 'video';
    if (k.startsWith('DOC_')) return 'documento';
    return 'foto';
}

export function SlotIlustracion({ slotKey, className = '' }) {
    return (
        <div className={`text-white/70 ${className}`} aria-hidden="true">
            {pictos[pictoDe(slotKey)]}
        </div>
    );
}

export default SlotIlustracion;
