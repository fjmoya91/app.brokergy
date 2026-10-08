import { areaPoligono } from '../logic/geometriaPlano';
import { estrecha, useAnchoTira } from '../logic/anchoTira';
import { IconoMovil } from './IconosCroquis';
import { BotonTira, EtiquetaTira, Tira, TiraModo } from './TiraPlano';

// ─────────────────────────────────────────────────────────────────────────────
// DELIMITAR LA VIVIENDA dentro de una comunidad de adosados.
//
// POR QUÉ EXISTE: en una hilera de adosados la parcela es la del CONJUNTO —dos
// hileras y su calle privada, medido en 26RES060_205: 188 paredes— y Catastro
// no dibuja dónde acaba cada casa. Se dibuja aquí el contorno de la vivienda y
// el motor vuelve a medir: lo de dentro es la casa, y lo construido fuera pasa
// a ser la casa de al lado, así que la pared contra ella sale como MEDIANERA.
//
// Vive en el plano, como la cubierta, porque se marca DIBUJANDO encima.
// Se puede dibujar a ojo por la calle y por el jardín —lo que sobresale del
// edificio no cuenta—: lo que tiene que ir con cuidado son las dos líneas que
// separan la casa de las de al lado.
//
// Las piezas son las de `TiraPlano.jsx`, como las demás tiras del plano: 28 px
// y ningún botón partido en dos líneas.
// ─────────────────────────────────────────────────────────────────────────────

export function RecorteControl({ recorte, dibujando, vertices = [], midiendo = false,
                                 sugerir = false, onDibujar, onQuitar,
                                 onCerrar, onCancelar,
                                 // Dibujarlo con el DEDO en el móvil (delante de la
                                 // casa es donde se sabe dónde acaba): abre el QR.
                                 onMovil = null }) {
    // Antes de cualquier `return` (regla 62).
    const [refTira, ancho] = useAnchoTira();
    const corto = estrecha(ancho, 520);
    if (dibujando) {
        const m2 = vertices.length >= 3 ? areaPoligono(vertices) : null;
        return (
            <TiraModo tono="emerald" refTira={refTira}
                      titulo="✂ Dibuja la vivienda"
                      contador={`${vertices.length} ${vertices.length === 1 ? 'vértice' : 'vértices'}${m2 ? ` · ≈${fmt(m2)} m²` : ''}`}
                      acciones={<>
                          {onMovil && (
                              <BotonTira onClick={onMovil} disabled={midiendo} cuadrado={corto}
                                         aria-label="Dibujar el contorno en el móvil"
                                         title="Dibuja el contorno con el dedo en el móvil: lo verás aquí según lo dibujas">
                                  <IconoMovil size={12} />{!corto && 'En el móvil'}
                              </BotonTira>
                          )}
                          <BotonTira tono="emerald" mayus onClick={onCerrar} disabled={vertices.length < 3}>
                              {corto ? '✓ Cerrar' : '✓ Cerrar y medir'}
                          </BotonTira>
                          <BotonTira tono="plano" cuadrado onClick={onCancelar} aria-label="Cancelar">✕</BotonTira>
                      </>}
                      instruccion={<>
                          Pulsa las esquinas de SU parcela y cierra en el primer punto (o doble clic).
                          Por la calle y el jardín puedes pasarte: lo que importa son las dos
                          líneas con las casas de al lado.{' '}
                          <span className="text-white/45">Barra espaciadora + arrastrar mueve el plano. Esc cancela.</span>
                      </>} />
        );
    }

    const hay = Array.isArray(recorte?.poligono) && recorte.poligono.length >= 3;
    return (
        <Tira refTira={refTira} tono={hay ? 'emerald' : sugerir ? 'amber' : 'neutro'}>
            <EtiquetaTira title="Qué parte de lo construido es la vivienda que se certifica">Vivienda</EtiquetaTira>
            {hay ? (
                <>
                    <span className="min-w-0 truncate text-[10.5px] font-bold text-emerald-300"
                          title="Lo de fuera cuenta como las casas de al lado (medianera)">
                        ✂ Delimitada a mano · ≈{fmt(recorte.area_m2 ?? 0)} m² de parcela
                        {!corto && <span className="font-normal text-white/50"> · lo de fuera cuenta como las casas de al lado (medianera)</span>}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                        <BotonTira onClick={() => onDibujar(true)} disabled={midiendo}>✎ Redibujar</BotonTira>
                        <BotonTira onClick={onQuitar} disabled={midiendo}>Quitar</BotonTira>
                    </span>
                </>
            ) : (
                <>
                    <span className={`min-w-0 flex-1 truncate text-[10.5px] ${sugerir ? 'text-amber-200/90' : 'text-white/50'}`}>
                        {sugerir
                            ? '¿Es un adosado dentro de una comunidad? Aquí se está midiendo el bloque entero.'
                            : 'Se mide todo lo construido de la parcela.'}
                    </span>
                    <span className="ml-auto shrink-0">
                        <BotonTira onClick={() => onDibujar(true)} disabled={midiendo} tono={sugerir ? 'ambar' : 'neutro'}>
                            ✂ Delimitar la vivienda
                        </BotonTira>
                    </span>
                </>
            )}
            {midiendo && <span className="whitespace-nowrap text-[10.5px] text-white/55">volviendo a medir…</span>}
        </Tira>
    );
}

const fmt = n => (Number(n) || 0).toFixed(1).replace('.', ',');

export default RecorteControl;
