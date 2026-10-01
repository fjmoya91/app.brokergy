// ============================================================================
// test_senalado.mjs — lo SEÑALADO en el plano, montado sin React.
//
//   node implementation/backend/scripts/test_senalado.mjs
//
// `senalado.js` es la traducción de lo que el certificador señala en el plano a
// lo que se le manda al motor. La usan el hook de la ventana y la skill
// `generar-cee-inicial` desde Node: si las dos dejaran de coincidir, el `.cex`
// del script y el del botón dirían cosas distintas del mismo edificio. Aquí se
// comprueba la siembra desde un trabajo guardado (`estadoDeTrabajo`) y lo que
// sale de ella (`senaladoDe`).
// ============================================================================
import { estadoDeTrabajo, senaladoDe } from
    '../../frontend/src/features/cee-envolvente/logic/senalado.js';

let fallos = 0;
const ok = (cond, texto) => { console.log(`${cond ? '✓' : '✗'} ${texto}`); if (!cond) fallos++; };

// Una casa de dos paredes a la calle y una medianera, en la planta baja.
const geo = {
    georef: { bbox: [400000, 4300000, 400020, 4300020], en_el_lienzo: { x: 2, y: 2 } },
    plantas: [{
        id: 'PB', nivel: 0,
        muros: [
            { id: 'FBN1', tipo: 'FACHADA', subtipo: 'CALLE', orientacion: 'N', nivel: 0,
              planta: 'PB', alto: 2.8, largo: 10, svg: [[2, 2], [12, 2]] },
            { id: 'FBS1', tipo: 'FACHADA', subtipo: 'PATIO', orientacion: 'S', nivel: 0,
              planta: 'PB', alto: 2.8, largo: 10, svg: [[2, 10], [12, 10]] },
            { id: 'MBE1', tipo: 'MEDIANERA', subtipo: 'MEDIANERA', orientacion: 'E', nivel: 0,
              planta: 'PB', alto: 2.8, largo: 8, svg: [[12, 2], [12, 10]] },
        ],
    }],
    geometria: { elementos: [] },
};

const trabajo = {
    entrada: 'FBN1',
    huecos: {
        FBN1: [
            { uid: 'a', nombre: 'P1', tipo: 'puerta', ancho: 0.9, alto: 2.1, estado: 'medido' },
            { uid: 'b', nombre: 'V1', tipo: 'VENTANA', ancho: 1.2, alto: 1.3, estado: 'DUDOSO' },
        ],
        FBS1: [{ uid: 'c', nombre: 'V2', tipo: 'ventana', ancho: 1.5, alto: 1.2, estado: 'medido' }],
    },
    excluidas: ['FBS1'],
    particiones: ['MBE1'],
    tipos: {}, nombres: {}, us: {}, orientaciones: {}, pilares: { FBN1: 3 },
    paredes: { movidas: {}, dibujadas: [] },
    lienzo_ref: { dx: 399998, y0: 4300022 },
};

const estado = estadoDeTrabajo(geo, trabajo);
ok(estado.entrada === 'FBN1', 'la entrada vuelve del trabajo');
ok(estado.muros.FBN1.huecos.length === 2, 'los huecos se siembran en su pared');
ok(estado.muros.FBN1.huecos[1].tipo === 'ventana' && estado.muros.FBN1.huecos[1].estado === 'dudoso',
   'lo guardado en MAYÚSCULAS se rescata');
ok(estado.muros.FBS1.excluida === true, 'la pared apartada sigue apartada');

const env = senaladoDe(estado, { ventanas: { vidrio: 'Doble', marco: 'PVC', persiana: true } },
                      { lienzoAMundo: estado.lienzoAMundo });
ok(env.huecos.length === 2, 'los huecos de una pared APARTADA no se mandan');
ok(env.huecos.every(h => h.tipo === 'Hueco'), 'todos van como «Hueco» (el XML no admite otro)');
const puerta = env.huecos.find(h => h.id === 'P1');
ok(puerta.persiana === false && puerta.marco === 'Madera' && puerta.porc_marco === '90',
   'la puerta: sin persiana, madera al 90 % de marco');
ok(env.huecos.find(h => h.id === 'V1').de.includes('POR CONFIRMAR'),
   'la medida dudosa sale como POR CONFIRMAR');
ok(env.huecos_defecto.vidrio === 'Doble' && env.huecos_defecto.marco === 'PVC'
   && env.huecos_defecto.persiana === true, 'las ventanas de la vivienda van en huecos_defecto');
ok(env.entrada.valor === 'FBN1', 'la entrada va al motor');
ok(env.excluir_ids.ids.includes('FBS1'), 'la apartada va en excluir_ids');
ok(env.medianeras_como_particion.includes('MBE1'), 'la medianera marcada como partición');
ok(env.pilares.FBN1 === 3, 'los pilares contados');
ok(env.mejora.lienzo_a_mundo?.dx === 399998, 'la traslación al mundo viaja en la mejora');

// Sin trabajo: nada señalado, y el defecto de las ventanas de siempre.
const vacio = senaladoDe(estadoDeTrabajo(geo, null), null);
ok(vacio.huecos.length === 0 && vacio.entrada.valor === null, 'sin trabajo no hay huecos ni entrada');
ok(vacio.huecos_defecto.vidrio === 'Doble' && vacio.huecos_defecto.persiana === false,
   'sin contestar, las ventanas de siempre (Doble, sin persiana)');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\ntodo correcto');
process.exit(fallos ? 1 : 0);
