<!-- conocimiento · área: clientes · las rutas de los enlaces son relativas a la raíz del repo -->

## La empresa acepta la propuesta con su representante legal (2026-11-10)

Fran, 10/11/2026, viendo la página de aceptación de 26TER100_OP389 (AUTOSERVICIO RODRIGUEZ SL): «cuando
es una empresa, al aceptar la propuesta no vienen los datos del representante legal. Lo ideal es que los
añadan ya desde el primer momento, porque si no luego los tenemos que pedir después. Y el formato de los
números del CIF no es el mismo que el del teléfono».

La página (`AceptarPropuestaView.jsx`, `/firma/:token`) trataba a la empresa como a una persona:
- «Hola, Autoservicio».
- Nombre «AUTOSERVICIO RODRIGUEZ SL» y, en Apellidos, «RODRIGUEZ SL». Eso no venía de la ficha (allí está
  vacío): el servidor partía la referencia de la oportunidad aunque hubiera ficha, y al aceptar lo
  habría grabado.
- Ni rastro del representante, que es quien firma el Anexo I y el Convenio
  ([[project_cliente_empresa_representante]]).

**REGLA — una empresa acepta con su razón social ENTERA y su REPRESENTANTE LEGAL** (nombre, apellidos y
DNI, obligatorios).
- Es empresa si la ficha lo dice (`clientes.es_empresa`) o si el NIF tecleado es un CIF
  (`esNifDeEmpresa`). Sin ficha, también si la referencia acaba en una forma societaria.
- Si la ficha ya tiene al representante, viene relleno y el cliente solo lo comprueba.
- El saludo es el nombre del representante, nunca la razón social. El texto habla del «inmueble», no de
  «tu vivienda».
- La vista de la propuesta ya aceptada (resumen y edición) también enseña Razón social, CIF y
  representante.

**REGLA — al guardar, la empresa queda sin apellidos y con su representante** (`camposEmpresaAceptacion`
de `routes/public.js`, en `POST /aceptar/:id` y `PATCH /datos/:id`).
- Se escribe `es_empresa: true`, `apellidos: null` y los `representante_*` que lleguen RELLENOS: un
  navegador con la página anterior no borra nada.
- Pasa por `normalizeCliente`: mayúsculas, y el DNI sin puntos, espacios ni guiones.
- `GET /cliente/:id` ya no inventa apellidos cuando hay ficha.

**REGLA — el DNI/CIF va con la misma letra que el teléfono.** Se quitó `fp-input-mono` del campo. El IBAN
la conserva.
