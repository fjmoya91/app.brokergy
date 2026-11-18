# «¿Misma dirección que el cliente? → Sí» sigue la ficha del CLIENTE (2026-10-20)

**El problema.** Con «Sí» (el valor por defecto) los documentos no imprimían la dirección
del cliente, aunque el botón lo diga. Imprimían la del Catastro, guardada en la oportunidad
o en `instalacion.direccion`. Si Fran corregía la dirección en la ficha del cliente, el
expediente no se enteraba, y había que pulsar «No» y teclearla otra vez (lo pidió el
20/10/2026).

Venía de junio. El patrón `inst.direccion || … || cli.direccion` imprimió el domicilio
del cliente (CL León Felipe 15) como dirección de la obra (AV Juan XXIII 19) en
26RES060_89. Para arreglarlo, la dirección pasó a salir del Catastro siempre, y «Sí» dejó
de significar lo que dice.

**REGLA — con «Sí» manda la dirección del CLIENTE, en vivo.** Se cambia en su ficha y
cambia en todos los documentos de sus expedientes: Anexo I, Convenio, CIFO, Certificado
RES080, Anexo Fotográfico, la ficha del certificador y el mensaje de cobro. Solo si el
cliente no tiene calle se cae a la de la instalación o el Catastro. La referencia
catastral y las UTM siguen siendo las de la obra. Con «No», el cliente no se usa nunca.
Con «Sí», la pantalla de Instalación enseña qué dirección van a imprimir los documentos.

**REGLA — «Sí» solo se pone cuando ES la misma vivienda.** Al crear el expediente,
`mismaVivienda` compara el nombre de la calle y el municipio del cliente con los del
Catastro. Si es otra calle, el expediente nace en «No» con la dirección del Catastro. El
NÚMERO no decide: en la ficha del cliente se escribe el número real y el Catastro trae
otro («CL CORBATAS 66 (42 EN CATASTRO)» frente a «CL CORBATAS 42»). Ante la duda, dice
«distinta», porque el error barato es quedarse con la del Catastro.

**Lo que ya existía** (medido el 20/10/2026): 318 de 331 expedientes estaban en «Sí» y
53 tenían otra dirección en la ficha del cliente. Unos 40 eran la misma casa con otro
número o formato, y esos pasan a imprimir la del cliente cuando se regeneren sus
documentos. Otros 12 eran otra casa, o no se podía asegurar que no lo fueran: 24RES060_9,
25RES060_44, 25RES060_75, 25RES080_26, 26RES060_100, 26RES060_122, 26RES060_134,
26RES060_222, 26RES060_89, 26RES080_71, 26RES080_90 y 26RES093_15. Esos se pasaron a «No» el
20/10/2026 (12 de 12, con el «sí» de Fran), conservando EXACTAMENTE lo que imprimían, con
`node implementation/backend/scripts/direccion_instalacion_otra_casa.mjs` (en seco;
`--escribir`).

**La Memoria RITE y el borrador del certificado RITE también, desde el 18/11/2026.** El
generador del RITE ponía SIEMPRE el domicilio del cliente como EMPLAZAMIENTO, con «Sí» o con
«No». En 26RES093_15 la memoria situaba la obra en la calle donde el titular está
empadronado y recibe las notificaciones, con la RC de la casa donde vive y está la aerotermia
(otra calle, en esquina; en el Catastro, sin número). Ahora `buildRitePayloads` ([routes/expedientes.js](../../../implementation/backend/routes/expedientes.js))
resuelve la dirección de la instalación con esta misma regla y la manda en `inst_*`. El
generador (`normalizar` en `rite-generator/lib/supabase_client.py`) la usa para el
emplazamiento y, si no llega, cae a la del cliente. El titular sigue con su domicilio.

Fuente única: [direccionInstalacion.js](../../../implementation/frontend/src/features/expedientes/logic/direccionInstalacion.js),
usada por `buildInstalacionAddress` y `direccionObra`, y por el alta del expediente
mediante import(). `anexoFotograficoService.buildDocMeta` y `certClienteData` son CJS
síncronos y llevan su espejo. Tras tocarlo:
`node implementation/backend/scripts/test_direccion_instalacion.mjs`.
