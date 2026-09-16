import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// EL LOGO DE UNA EMPRESA (prescriptor: instalador, certificador, S.O.,
// verificador). Vive en `prescriptores.logo_empresa` como data URL.
//
// Si no hay logo —o no carga— cae a las INICIALES sobre un fondo neutro, para
// que la fila no baile: un hueco vacío queda peor que unas iniciales.
//
// Vive en `components/` y no dentro de una pestaña porque lo usan los lotes, el
// cuadro de mando y el listado de expedientes. Eran DOS componentes con el mismo
// dibujo (`LogoEmpresa` en lotes y `AvatarPartner` en el cuadro de mando) y al
// necesitarlo un tercer sitio la elección era escribir la tercera copia o juntar
// las dos. Las dos PIELES se conservan en `variante`: el cuadro de mando pinta
// sus iniciales en el color de marca y los lotes en gris, y eso no es un detalle
// que unificar a ojo desde aquí.
// ─────────────────────────────────────────────────────────────────────────────

const iniciales = (nombre) => {
    const txt = String(nombre || '').replace(/[^A-Za-zÁÉÍÓÚÑ0-9 ]/gi, '').trim();
    if (!txt) return '—';
    // Dos letras se leen como un monograma; una suelta parece un hueco sin
    // rellenar. Con dos palabras, la inicial de cada una.
    const partes = txt.split(/\s+/);
    return (partes.length > 1 ? partes[0][0] + partes[1][0] : txt.slice(0, 2)).toUpperCase();
};

const PIELES = {
    neutro: 'bg-white/[0.06] border border-white/10 text-white/40',
    marca:  'bg-brand/15 border border-brand/20 text-brand',
};

export function LogoEmpresa({ p, logo, nombre, size = 24, variante = 'neutro', className = '' }) {
    const [falla, setFalla] = useState(false);
    // Admite el prescriptor entero o el logo y el nombre sueltos: el cuadro de
    // mando los tiene por separado y no siempre hay un objeto que pasar.
    const src = logo ?? p?.logo_empresa;
    const titulo = nombre ?? p?.razon_social ?? '';
    const corto = nombre ?? p?.acronimo ?? p?.razon_social ?? '';
    const lado = { width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.38)) };

    if (!src || falla) {
        return (
            <span style={lado} title={titulo}
                className={`shrink-0 rounded-md flex items-center justify-center font-black ${PIELES[variante] || PIELES.neutro} ${className}`}>
                {iniciales(corto)}
            </span>
        );
    }
    return (
        <img src={src} alt={corto} title={titulo}
            style={lado} onError={() => setFalla(true)}
            loading="lazy" decoding="async"
            // `bg-white` porque casi todos los logos vienen con fondo transparente
            // pensados para papel: sobre el tema oscuro, en negro, no se veían.
            className={`shrink-0 rounded-md bg-white object-contain p-0.5 ${className}`} />
    );
}

export default LogoEmpresa;
