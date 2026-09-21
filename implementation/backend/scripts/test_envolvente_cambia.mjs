// ============================================================================
// test_envolvente_cambia.mjs — lo que se REFORMA en la envolvente, y la
// persiana por defecto.
//
// Tres cosas que salen de la vista del certificador y acaban en el .cex:
//   1. el nombre de un hueco marcado lleva «- CAMBIA», y no se duplica;
//   2. la carpintería EFECTIVA de un hueco: lo suyo, si no lo de la vivienda,
//      y una puerta nunca hereda la persiana;
//   3. la persiana por defecto es «con» SOLO en los expedientes nuevos (la
//      marca `persiana_defecto`), nunca en los ya modelados;
//   4. la traslación del lienzo al mundo y el área del polígono de cubierta,
//      que es lo que el motor recibe para intersecar con el tejado;
//   5. los tamaños de lo que se AGARRA en el plano: constantes en PANTALLA,
//      para que ampliar dé precisión de verdad al dibujar un muro pequeño;
//   6. que el encuadre NO se reinicie por dibujar una pared, que es lo que
//      hacía que el plano «de repente hiciera zoom» a media faena.
//
// $ node implementation/backend/scripts/test_envolvente_cambia.mjs
// ============================================================================

import { nombreHueco, SUFIJO_CAMBIA }
    from '../../frontend/src/features/cee-envolvente/logic/reforma.js';
import { carpinteriaDe, huecosDefecto, persianaDefecto, VENTANAS_POR_DEFECTO }
    from '../../frontend/src/features/cee-envolvente/logic/ventanasVivienda.js';
import { areaPoligono, claveEncuadre, IMAN, LARGO_MINIMO_PARED, lienzoAMundo,
         tamanosDeDibujo }
    from '../../frontend/src/features/cee-envolvente/logic/geometriaPlano.js';

let fallos = 0;
const ok = (cond, msg) => {
    console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
    if (!cond) fallos += 1;
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n1. El nombre del hueco que se cambia');
ok(nombreHueco({ nombre: 'V1' }) === 'V1', 'sin marca, el nombre a secas');
ok(nombreHueco({ nombre: 'V1', cambia: true }) === 'V1 - CAMBIA', 'con marca, «V1 - CAMBIA»');
ok(nombreHueco({ nombre: 'V1 - CAMBIA', cambia: true }) === 'V1 - CAMBIA',
   'si ya lo lleva escrito no se repite');
ok(SUFIJO_CAMBIA === ' - CAMBIA', 'el sufijo es el MISMO que escribe el motor (SUFIJO_CAMBIA)');
ok(nombreHueco({ nombre: '  PE ', cambia: true }) === 'PE - CAMBIA', 'se recorta el nombre');

console.log('\n2. La carpintería efectiva de un hueco');
const viv = { vidrio: 'Doble bajo emisivo', marco: 'PVC', persiana: true };
ok(igual(carpinteriaDe({ tipo: 'ventana' }, viv),
         { vidrio: 'Doble bajo emisivo', marco: 'PVC', persiana: true, propia: false }),
   'una ventana sin nada suyo hereda la vivienda entera');
ok(carpinteriaDe({ tipo: 'ventana', vidrio: 'Simple' }, viv).vidrio === 'Simple'
   && carpinteriaDe({ tipo: 'ventana', vidrio: 'Simple' }, viv).propia === true,
   'lo suyo manda y la marca como propia');
ok(carpinteriaDe({ tipo: 'puerta' }, viv).persiana === false,
   'una PUERTA no hereda la persiana de la vivienda');
ok(carpinteriaDe({ tipo: 'puerta', persiana: true }, viv).persiana === true,
   '…salvo que alguien lo diga expresamente');
ok(carpinteriaDe({ tipo: 'ventana', persiana: false }, viv).persiana === false
   && carpinteriaDe({ tipo: 'ventana', persiana: false }, viv).propia === true,
   'un «sin persiana» explícito cuenta como propio');
ok(igual(carpinteriaDe({ tipo: 'ventana' }, null),
         { ...VENTANAS_POR_DEFECTO, propia: false }),
   'sin vivienda contestada cae al defecto de siempre');

console.log('\n3. La persiana por defecto: solo en expedientes NUEVOS');
ok(persianaDefecto({}) === false, 'un expediente ya modelado (sin la marca) sigue sin persiana');
ok(persianaDefecto({ persiana_defecto: true }) === true, 'uno nuevo (con la marca) nace con ella');
ok(huecosDefecto({}).persiana === false, 'huecos_defecto sin marca: sin persiana, como siempre');
ok(huecosDefecto({ persiana_defecto: true }).persiana === true,
   'huecos_defecto con marca: con persiana');
ok(huecosDefecto({ persiana_defecto: true, ventanas: { vidrio: 'Doble', persiana: false } }).persiana === false,
   'lo CONTESTADO manda sobre la marca');
ok(huecosDefecto({}).vidrio === 'Doble' && huecosDefecto({}).marco === 'Metálico sin RPT',
   'el vidrio y el marco por defecto no se mueven');

console.log('\n4. El polígono de la cubierta');
ok(areaPoligono([[0, 0], [10, 0], [10, 6], [0, 6]]) === 60, 'shoelace: 10 × 6 = 60');
ok(areaPoligono([[0, 0], [10, 0]]) === 0, 'dos puntos no encierran nada');
ok(areaPoligono([[0, 0], [4, 0], [0, 3]]) === 6, 'un triángulo 3-4: 6 m²');
// El georef que deja `plano_svg._georef`: bbox = [oeste, sur, este, norte].
const georef = { bbox: [500000.0, 4400000.0, 500040.0, 4400030.0],
                 en_el_lienzo: { x: -5, y: -3, ancho: 40, alto: 30 } };
ok(igual(lienzoAMundo(georef), { dx: 500005, y0: 4400027 }),
   'x_mundo = x_lienzo + (oeste − x_entorno); y_mundo = (norte + y_entorno) − y_lienzo');
ok(lienzoAMundo(null) === null && lienzoAMundo({}) === null,
   'sin georef no se inventa ninguna traslación');

console.log('\n5. Los tamaños de lo que se AGARRA (tirador, asa, imán)');
// El caso de Raquel, certificadora con tres expedientes ya hechos: «dibujar
// muros nuevos pequeños… el puntero que sale en los extremos son gordos». La
// causa era que estaban fijos EN METROS, así que ampliar no daba precisión:
// el tirador crecía con el dibujo. Ahora salen del ENCUADRE.
const casa = { ancho: 19.5, alto: 13.6 };          // 26RES060_193, de verdad
const lejos = tamanosDeDibujo(casa);
const cerca = tamanosDeDibujo({ ancho: casa.ancho / 4, alto: casa.alto / 4 });
ok(Math.abs(lejos.tirador - 0.30) < 0.02,
   `en el encuadre de partida el tirador mide lo de siempre (${lejos.tirador.toFixed(2)} m ~ 0,30)`);
ok(Math.abs(lejos.asa - 0.60) < 0.03,
   `y el asa de un hueco también (${lejos.asa.toFixed(2)} m ~ 0,60)`);
ok(Math.abs(lejos.iman - IMAN.max) < 0.1,
   `y el imán, su tope de siempre (${lejos.iman.toFixed(2)} m ~ ${IMAN.max})`);
ok(cerca.tirador < lejos.tirador / 3.5,
   `ampliando x4 el tirador encoge en METROS (${cerca.tirador.toFixed(3)} m): en pantalla se ve igual`);
ok(cerca.iman < 0.5 && cerca.iman > IMAN.min,
   `y el imán baja a ${cerca.iman.toFixed(2)} m: un tabique corto ya se puede dibujar`);
ok(tamanosDeDibujo({ ancho: 500, alto: 500 }).iman === IMAN.max,
   'muy alejado, el imán no se pasa de su tope');
ok(tamanosDeDibujo({ ancho: 0.2, alto: 0.2 }).iman === IMAN.min,
   'y muy ampliado no baja de su suelo: por debajo no pegaría nada');
ok(tamanosDeDibujo(null).tam > 0, 'sin encuadre no sale NaN: hay respaldo');
// Tres tiradores tienen que CABER a lo largo de la pared: son tres círculos,
// o sea SEIS radios (es lo que hace `Tiradores` con `Math.min(r, L / 6.2)`).
const radioEn = (L, t) => Math.max(0.05, Math.min(t, L / 6.2));
ok(radioEn(0.8, lejos.tirador) * 6 <= 0.8 + 1e-9,
   'en un tabique de 0,80 m los tres tiradores caben sin montarse');
ok(radioEn(19, lejos.tirador) === lejos.tirador,
   'y en una fachada larga el tope no recorta nada: manda el tamaño de pantalla');
ok(LARGO_MINIMO_PARED === 0.2,
   'el largo mínimo de una pared es UNO: lo comparten el plano, el hook y el motor');

console.log('\n6. El ENCUADRE no se reinicia por dibujar');
// «Cuando quito zoom para hacer una pared nueva y arrastro, de repente hace
// zoom y se me da mal» (2026-09-19). El reinicio colgaba de la IDENTIDAD del
// encuadre, y ese objeto se recalcula con cada cambio de paredes: dibujar una
// devolvía el MISMO rectángulo en otro objeto y el plano saltaba a su encuadre
// de partida a media faena.
const base2d = { x: 0, y: 0, ancho: 19.52, alto: 13.57 };
const otroObjeto = { ...base2d };                       // lo que devuelve el memo
ok(claveEncuadre(false, false, base2d) === claveEncuadre(false, false, otroObjeto),
   'el mismo rectángulo en OTRO objeto no cuenta como encuadre nuevo');
ok(claveEncuadre(false, false, base2d)
   === claveEncuadre(false, false, { x: 0, y: 0, ancho: 19.5200001, alto: 13.57 }),
   'ni el ruido de coma flotante por debajo del centímetro');
ok(claveEncuadre(false, false, base2d) !== claveEncuadre(true, false, base2d),
   'pasar de planta a 3D SÍ reencuadra');
ok(claveEncuadre(false, false, base2d) !== claveEncuadre(false, true, base2d),
   'mirar el entorno SÍ reencuadra');
ok(claveEncuadre(false, false, base2d)
   !== claveEncuadre(false, false, { x: 0, y: 0, ancho: 24, alto: 16 }),
   'y traer otra geometría, con otro lienzo, también');
ok(typeof claveEncuadre(false, false, null) === 'string',
   'sin encuadre no revienta: devuelve una clave igualmente');

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo en orden');
process.exit(fallos ? 1 : 0);
