<!-- conocimiento · área: documentos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Quién EJECUTA la obra y quién FIRMA ante Industria (2026-08-26)

Un instalador no habilitado en Industria delega la firma en otra empresa
(`prescriptores.instalador_rite_id`, ver `utils/instaladorFirmante.js`). Hasta ahora los
documentos salían solo a nombre del firmante, y entonces **el NIF del certificado no casaba
con el de las facturas del expediente**: quien las emite es el instalador asignado. Medido en
26RES080_62 — factura FELIX DIAZ GALVEZ (03892673S), firma OSCAR REDONDO MARTIN (52977772D,
RITE 08-B-D20-46001724).

**REGLA — cuando son DOS empresas, las dos constan; cuando es una, solo una.** La segunda no se
inventa: `empresasActuacion(exp)` en
[docGenerators.js](implementation/frontend/src/features/expedientes/utils/docGenerators.js)
devuelve `{ delegado, ejecutora, habilitada }` y `delegado` solo es true con delegación efectiva
(el backend únicamente entrega `prescriptores_firmante` en ese caso). Los rótulos de columna y el
texto de responsabilidad son **fuente única** ahí mismo (`EMPRESAS_COL_*`, `notaDelegacionRite`):
el verificador compara el CIFO con el certificado RES080 y no pueden decirlo distinto.

| Documento | Cómo lo imprime |
|---|---|
| **Certificado RES080** | Apartado propio: tabla a dos columnas con razón social y CIF/NIF, y debajo el párrafo. `buildEmpresasBox` en [res080Doc.js](implementation/frontend/src/features/expedientes/logic/res080Doc.js), compartido con `CertificadoRes080Modal` |
| **CIFO (RES060/093/TER100)** | Cuatro filas presididas por la EJECUTORA (ver abajo). La nota va al pie de la hoja de la instalación |

**REGLA — en el CIFO manda la que EJECUTA Y FACTURA, y la habilitada baja a una fila
(2026-09-21).** El apartado se abría con la razón social, el NIF y el domicilio del FIRMANTE, y
eran los suyos los que presidían la empresa instaladora del certificado: no casaban con las
facturas del expediente, que es lo primero que cruza el verificador. Ahora las tres primeras filas
son de quien ejecuta y factura —*Ejecuta y factura la obra · NIF / CIF · Domicilio*— y la
habilitada ocupa la cuarta, **Técnico firmante de la memoria**. Su NIF no se pierde: sigue en la
nota de responsabilidad al pie de la hoja de la instalación (`notaDelegacionRite`), que es donde
se explica el reparto.

**REGLA — esa fila lleva DOS números y no son lo mismo.** El de **EMPRESA** habilitada (registro
de empresas instaladoras, `numero_carnet_rite`) y el **CARNÉ PERSONAL** de quien firma
(`tecnico_firmante_carnet_rite`), que solo existe si la ficha declara técnico firmante. Se
resuelve con `firmanteMemoriaRite` —la MISMA función que el popup de envío y que el espejo Python
de la Memoria RITE—: si se duplicara, el certificado nombraría a un técnico y la memoria saldría
firmada por otro. El carné **no se imprime si coincide con el nº de empresa**: en una ficha sin
técnico declarado esa función devuelve el de empresa como carné (es el caso del autónomo) y el
mismo número dos veces en la misma línea se lee como un error del documento.

**REGLA — con DOS empresas, a QUIÉN se le pide la firma del CIFO se ELIGE al enviarlo**
(2026-09-21). Es la consecuencia de que el recuadro vaya en blanco: si el papel no dice quién
firma, no hay una respuesta que deducir — la pone quien envía. El popup «Enviar al instalador»
ofrece las dos (`opcionesFirmanteCifo` en
[instaladorPendientes.js](implementation/frontend/src/features/expedientes/logic/instaladorPendientes.js)),
por defecto la HABILITADA, que es lo que la app venía haciendo: cambiar el defecto movería a quién
se le pide la firma en todos los expedientes con delegación sin que nadie lo hubiera decidido.
⚠️ **Esto NO vale para la Memoria RITE**, que imprime el nombre y el carné de quien la suscribe y
solo puede firmarla el habilitado: ahí manda la ficha (`firmanteMemoriaRite`), no el popup.

**REGLA — los DESTINATARIOS traen las DOS empresas, y se marcan los de quien firma.**
`contactosDeLaActuacion` / `defaultContactIdsActuacion` en
[docContacts.js](implementation/frontend/src/features/expedientes/utils/docContacts.js). Con solo
los de quien firma, elegir una empresa y mandarle el enlace a la otra era el descuadre que el
selector viene a evitar; y las dos hacen falta a la vez cuando en el mismo mensaje va la Memoria
RITE. Cambiar de firmante re-marca los suyos pero **conserva lo marcado a mano** — puede haber que
avisar a las dos. Los ids van PREFIJADOS (`ejecutora:` / `habilitada:`) porque los de
`instaladorContacts` se repiten entre fichas (`empresa`, `c0`…) y dos contactos con el mismo id
son uno solo en la lista. Ese prefijo **no rompe el espejo de ids del backend** (regla 44): el
envío manda los destinatarios ya resueltos (`{nombre, email, phone}`), no sus ids. **Sin
delegación no cambia nada**: ni selector, ni prefijos, ni rótulos.

**REGLA — la elección se SELLA y va al historial.** `documentacion.cert_cifo_firmante_rol` +
una entrada `cifo_firmante`, escritos por `/instalador/enviar`. El **NOMBRE lo resuelve el backend**
desde la ficha, nunca se coge del body: el navegador manda solo cuál de las dos y el historial
tiene que decir la verdad aunque llegue cualquier cosa. El sello va en `CLAVES_PROTEGIDAS` de
`mergeDocumentacion`, o el primer autoguardado lo borraría (mismo fallo que el `refirma_at`); y el
historial, que es un read-modify-write, se escribe ANTES de las RPC de sellado para no llevárselas
por delante. Tras tocarlo: `node implementation/backend/scripts/test_firmante_cifo.mjs`.

**REGLA — el recuadro de firma va SIN NOMBRE.** Quién firma no se sabe al generarlo: unas veces lo
firma la empresa instaladora y otras el técnico habilitado. Con el nombre impreso había que
regenerar el documento al cambiar de firmante —o quedaba un certificado que nombra a uno y lleva
la firma de otro, que es justo lo que cruza el verificador—. La identidad la pone el certificado
electrónico de quien firma. La línea vacía **conserva su alto** (`&nbsp;`): el sello se estampa en
coordenadas FIJAS (`SIGN_BOXES.cifo_res060`) y el recuadro no puede moverse. Esto vale para TODOS
los CIFO; la tabla, en cambio, solo cambia en el caso delegado (decisión del usuario, 2026-09-21).
⚠️ Como consecuencia, el aviso de `FirmantesEnvio` ("saldría sin firmante") ya solo es literal
para la Memoria RITE; en el CIFO ese dato sigue haciendo falta para saber a QUIÉN mandárselo.

**REGLA — el PÁRRAFO se escribe también cuando hay UNA sola empresa**, con su nº RITE: es lo que
deja constancia de que quien ejecuta es además quien firma y con qué inscripción. Por eso el
domicilio y el nº RITE salieron de la tabla del RES080 —en columnas estrechas eran dos bloques de
texto envuelto que repetían lo que el párrafo dice mejor— y ahí quedan solo razón social y NIF.
`notaDelegacionRite` devuelve **''** si no consta el nº de empresa RITE: el documento no puede
afirmar una inscripción que no tiene a la vista. (El CIFO sigue imprimiendo el párrafo solo con
delegación; su hoja 1 no da para más.)

**REGLA — en el CIFO el bloque NO puede crecer.** La hoja 1 es la más apretada del documento
(**+28px** de holgura en el peor caso medido, un RES093 de textos largos con dos empresas) y ahí
está anclado el recuadro de firma. Una tabla a dos columnas la desbordaba 58px, y con un segundo
bloque, 163. Por eso son cuatro filas y una sola línea para la habilitada. El medidor ejerce el
peor caso donde de verdad está: la razón social y el domicilio largos van en la EJECUTORA —que es
quien preside la tabla— y la línea del técnico se mide con nombre largo + nº de empresa + carné.

**REGLA — el certificado RES080 tiene su propio medidor**, `scripts/check_res080_paginas.mjs`,
gemelo del del CIFO. Al escribirlo se descubrió que la hoja de la instalación **ya desbordaba
antes de este cambio**: con 3 bombas en cascada se pasaba 110px y con 5, 140 (los nº de serie se
listan uno por línea, y otra vez en la tabla de ACS). Se partió en dos hojas —instalación ·
empresas + observaciones— con el mismo criterio que el CIFO: el corte NO es condicional. Las
llamadas (1)(2)(3) quedan en la hoja anterior, así que ésta lleva una línea que remite a la
siguiente. Pasar los DOS medidores tras cualquier retoque:

```bash
node implementation/backend/scripts/check_res080_paginas.mjs
```

⚠️ La Memoria RITE y el Certificado de Instalación Térmica (microservicio Python) siguen saliendo
SOLO a nombre del firmante: ahí es correcto, son documentos que se presentan ante Industria y de
los que responde la empresa habilitada.
