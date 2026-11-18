<!-- conocimiento · área: oportunidades · las rutas de los enlaces son relativas a la raíz del repo -->

## El COMISIONISTA de una oportunidad: la persona que trajo la obra (2026-11-16)

**El caso** (Fran, 16/11/2026, 26RES060_OP308 → 26RES060_273, Munera): en LOS SIETE HERMANOS DEL BONILLO (SH) las obras llegan por
dos personas, **Rufino** (comercial) y **Juanma** (Juan Manuel, ingeniero), y Fran
quiere llevar aparte las que le pasa Juanma él directamente. En la app la comisión
solo existía por EMPRESA (`prescriptores.comision_activa / _tipo / _valor`, regla 81),
no por persona ni por obra.

Se descartaron:
- **Hacer a Juanma partner propio**: la oportunidad cambiaría de partner, y del partner
  cuelgan los avisos al instalador, la propuesta y la comisión de la empresa.
- **Un contacto de `contactos_notificacion`**: es un JSONB sin id estable (se reescribe
  entero al guardar la ficha del partner) y sirve para AVISAR, no para atribuir.
- **Una nota**: no se filtra ni se suma.

### Lo que hay

| Qué | Dónde |
|---|---|
| Tabla `comisionistas` (persona: nombre, tlf, cargo, empresa en la que trabaja, lo pactado) y `oportunidades.comisionista_id` + `comisionista_importe` | [comisionistas_schema.sql](implementation/backend/scripts/comisionistas_schema.sql) |
| Rutas (todas `staffOnly`): `GET/POST /api/comisionistas`, `PATCH /:id`, `GET/PUT /api/comisionistas/oportunidad/:id` | [routes/comisionistas.js](implementation/backend/routes/comisionistas.js) |
| Quién ve qué (fuente única) y validación | [utils/comisionista.js](implementation/backend/utils/comisionista.js) |
| El selector (chip + popover con buscador y alta en línea) | [ComisionistaSelector.jsx](implementation/frontend/src/features/comisionistas/ComisionistaSelector.jsx) |
| Alta y marcar obras por script (en seco por defecto) | `node implementation/backend/scripts/comisionista.js listar \| alta \| marcar` |
| Prueba sin BD | `node implementation/backend/scripts/test_comisionista.js` |
| Banco visual sin sesión ni escrituras | `/comisionista-prueba.html` (`?rol=TRABAJADOR`) |

Se elige en tres sitios, con la MISMA pieza: la fila del listado de oportunidades
(debajo del partner, y en la tarjeta del móvil), la cabecera de la calculadora y la
cabecera del expediente (junto al chip del partner). Se filtra en el listado de
oportunidades (debajo del filtro de partner, con cuántas obras tiene cada uno) y en
el de expedientes (columna elegible «Comisionista», grupo Gente).

**REGLA — el comisionista es una marca de ATRIBUCIÓN: no cambia el partner, ni a quién
se avisa, ni el bono.** La oportunidad sigue colgando de su `prescriptor_id`; los
avisos y la propuesta siguen el reparto de siempre (regla de contactos comercial /
técnico); la comisión de la empresa sigue en `caePricePrescriptor`. `comisionistas.prescriptor_id`
(«trabaja en») es solo informativo.

**REGLA — es del EQUIPO INTERNO, y lo pactado solo de ADMIN** (reglas 6 y 102). Las
rutas son `staffOnly`; un partner no recibe ni `comisionista_id` ni `comisionista_importe`
en el listado, en `GET /api/oportunidades/:id` ni en las respuestas de guardado
(`sinCiegaParaPartner` de `routes/oportunidades.js` los quita); un TRABAJADOR ve quién
es, pero no `comisionista_importe` ni `comision_tipo/_valor`. La poda la decide
`capaComisionista` y nadie más: si cada ruta decidiera, alguna le enseñaría a un
partner a quién de su empresa le pagamos.

**REGLA — se guarda AL MOMENTO por su ruta, no con el guardado de la calculadora ni
con el autoguardado del expediente.** El guardado de la calculadora hace `update` con
una lista cerrada de columnas que no incluye las del comisionista, así que no las pisa;
y el expediente no las lleva. Cambiar de persona VACÍA el importe (era lo pactado con
la otra).

**REGLA — el listado no trae `datos_calculo` para esto** (regla 22): en oportunidades son
dos columnas escalares más de `listaSelect`; en expedientes, una consulta aparte de
escalares de las oportunidades que tienen uno, como la de los rechazados (la RPC v4 no
se toca: cambiar su firma obliga a un DROP). Si esa consulta falla, el listado sale
igual, sin la columna rellena.

**REGLA — la tabla nació con RLS sin policies, GRANT a `service_role` y REVOKE a `anon`
y `authenticated`.** Medido al crearla: los DEFAULT PRIVILEGES del proyecto seguían
dando todo a `anon` y `authenticated` (regla 150).

### Juanma

Dado de alta el 16/11/2026 (`JUANMA`, INGENIERO, SH; su teléfono, en la BD) y marcada como suya
la 26RES060_OP308. Cómo se buscaron sus otras obras: el **creador** no sirve (la
cuenta de usuario «JUAN MANUEL» de SH creó también las de Rufino); sí la referencia
(«JUANMA SH …») y su chat de WhatsApp. En el chat, la OP196
(26RES060_249) **no** es suya: «Este me lo pasó Rufino». Candidatas que esperan el «sí»
de Fran: 26RES060_OP25, _OP27, _OP69 y 26RES080_OP10.

Pendiente: el importe de cada obra está vacío (no se sabe lo pactado con Juanma) y no
hay aviso al comisionista cuando se cobra; eso, si se quiere, va aparte.
