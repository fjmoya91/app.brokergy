// ─────────────────────────────────────────────────────────────────────────────
// QUIÉN FIRMA el certificado y DESDE QUÉ EMPRESA: son dos cosas distintas.
//
// POR QUÉ EXISTE: CE3X pide las dos a la vez en «Datos del técnico
// certificador» —Nombre y Apellidos + NIF de la persona, Razón social + CIF de
// la sociedad— y la ficha de Prescriptores no tenía dónde declarar la segunda.
// Se colaba en los campos de al lado: la de FÉLIX PÉREZ SOBRINO llevaba
// `razon_social` = su nombre y `cif` = B01799436, que es el CIF de FESSA SOLAR.
// Así, el .cex salía diciendo que la empresa certificadora se llama como él.
//
// Lo que se vigila es que el NOMBRE nunca lo desplace una sociedad (el título
// habilitante y el nº de colegiado son de la persona), que el NIF salga de
// quien firma y no del CIF de su empresa, y que un autónomo SIN empresa siga
// saliendo exactamente como salía —que es como se emitieron los certificados de
// Luis Alberto y Raquel—.
//
//     node implementation/backend/scripts/test_tecnico_ce3x.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { tecnicoCe3x } from '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js';

let fallos = 0;
const es = (real, esperado, que) => {
    if (real !== esperado) {
        fallos++;
        console.log(`  ✗ ${que}\n      esperado: ${JSON.stringify(esperado)}\n      salió:    ${JSON.stringify(real)}`);
    } else console.log(`  ✓ ${que}`);
};

// ── 1. Autónomo que ejerce DENTRO de una sociedad ────────────────────────────
// El caso que lo motiva (Francisco Javier / Soluciones Sostenibles): firma él,
// factura la empresa. Su `cif` de ficha sigue siendo su NIF personal porque
// está dado de alta como autónomo.
console.log('\n1. Autónomo con empresa declarada');
const conEmpresa = tecnicoCe3x({
    razon_social: 'FRANCISCO JAVIER MOYA LÓPEZ', cif: '06282551D', es_autonomo: true,
    nombre_responsable: 'FRANCISCO JAVIER', apellidos_responsable: 'MOYA LÓPEZ',
    empresa_razon_social: 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL',
    empresa_cif: 'B19350222',
    email: 'personal@gmail.com', email_responsable: 'info@brokergy.es',
    tlf_responsable: '623926179', provincia: 'CIUDAD REAL', municipio: 'TOMELLOSO',
    titulacion: 'GRADUADO EN INGENIERÍA INDUSTRIAL',
    colegio_profesional: 'COGITI ALBACETE', numero_colegiado: '1779',
});
es(conEmpresa.nombre, 'FRANCISCO JAVIER MOYA LÓPEZ', 'firma la PERSONA, no la sociedad');
es(conEmpresa.empresa, 'SOLUCIONES SOSTENIBLES PARA EFICIENCIA ENERGÉTICA, SL',
   'la razón social es la de su empresa');
es(conEmpresa.cif_empresa, 'B19350222', 'y el CIF, el de esa empresa');
es(conEmpresa.nif, '06282551D', 'su NIF es el `cif` de la ficha: está dado de alta como autónomo');
es(conEmpresa.email, 'info@brokergy.es', 'el correo del .cex es el de la PERSONA que firma');
es(conEmpresa.provincia, 'Ciudad Real', 'la provincia va capitalizada o CE3X no la reconoce');
es(conEmpresa.titulacion, 'GRADUADO EN INGENIERÍA INDUSTRIAL. COLEGIADO COGITI ALBACETE Nº 1779',
   'la titulación se compone como en los certificados ya emitidos');

// ── 2. Empresa: el `cif` de la ficha NO es el NIF de nadie ───────────────────
console.log('\n2. Técnico de una empresa certificadora');
const fessa = tecnicoCe3x({
    razon_social: 'FÉLIX PÉREZ SOBRINO', cif: 'B01799436', es_autonomo: false,
    nombre_responsable: 'FÉLIX', apellidos_responsable: 'PÉREZ SOBRINO',
    nif_responsable: '05701082A',
    empresa_razon_social: 'FESSA SOLAR, SL', empresa_cif: 'B01799436',
    titulacion: 'INGENIERO INDUSTRIAL',
});
es(fessa.nombre, 'FÉLIX PÉREZ SOBRINO', 'el nombre es el suyo');
es(fessa.empresa, 'FESSA SOLAR, SL', 'y la razón social, la de FESSA — no su propio nombre');
es(fessa.nif, '05701082A', 'el NIF es el de la persona');
es(fessa.cif_empresa, 'B01799436', 'el CIF es el de la sociedad');
es(fessa.titulacion, 'INGENIERO INDUSTRIAL',
   'sin colegio ni número, la titulación va tal cual: no se inventa el resto');

// ── 3. Autónomo SIN empresa: nada cambia ─────────────────────────────────────
// Es como se emitieron los certificados de Luis Alberto y Raquel, y el hueco de
// empresa de CE3X se rellena igual con su nombre.
console.log('\n3. Autónomo sin empresa — no puede haber cambiado nada');
const solo = tecnicoCe3x({
    razon_social: 'LUIS ALBERTO LANUZA PELAYO', cif: '70590504P', es_autonomo: true,
    nombre_responsable: 'LUIS ALBERTO', apellidos_responsable: 'LANUZA PELAYO',
    titulacion: 'GRADUADO EN INGENIERÍA DE LA EDIFICACIÓN',
    colegio_profesional: 'COAATM', numero_colegiado: '108180',
});
es(solo.nombre, 'LUIS ALBERTO LANUZA PELAYO', 'nombre');
es(solo.empresa, 'LUIS ALBERTO LANUZA PELAYO', 'la razón social es él mismo');
es(solo.nif, '70590504P', 'y su NIF, el `cif` de la ficha');
es(solo.cif_empresa, '70590504P', 'que ocupa también la casilla del CIF');

// ── 4. Lo que NO consta no se manda ──────────────────────────────────────────
// El motor deja entonces lo que trajera la plantilla, en vez de escribir un
// hueco vacío encima de un dato bueno.
console.log('\n4. Lo que no consta no se escribe');
const escueto = tecnicoCe3x({
    razon_social: 'EMPRESA CERTIFICADORA, SA', cif: 'A12345678', es_autonomo: false,
});
es('nif' in escueto, false, 'sin persona declarada, el NIF no se manda (el CIF no es de nadie)');
es(escueto.nombre, 'EMPRESA CERTIFICADORA, SA', 'sin persona, manda el nombre de la ficha');
es('titulacion' in escueto, false, 'sin titulación no se manda la casilla');
es(tecnicoCe3x(null), null, 'sin certificador asignado, no hay bloque de técnico');

console.log(fallos ? `\n${fallos} FALLAN` : '\nTodo correcto.');
process.exit(fallos ? 1 : 0);
