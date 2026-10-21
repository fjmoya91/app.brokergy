<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->

## El XML del CEE que hacemos se CARGA siempre en el expediente (2026-10-21)

**Decisión de Fran (21/10/2026, 26RES060_241):** «siempre que hagas un CEE inicial o final, carga el
XML».

**El porqué.** `cee_inicial.js aplicar --escribir` subía el `.cex`, el `.xml` y el PDF a Drive, pero el
expediente seguía sin `cee_inicial`. Nadie sabía **cuánto salía** hasta que alguien lo cargaba a mano
en el módulo CEE. Solo `listo` lo cargaba, y `listo` es otro paso: deja el CEE listo para firmar. En
el 241, el borrador daba 47.038 kWh de ahorro y 4.703,84 € de bono, frente a los 3.631 € de la
propuesta, y no se supo hasta preguntarlo.

**REGLA — todo CEE que genera la casa (inicial o final) deja su XML CARGADO en el expediente**, como
«Cargar CEE»: `cee_{fase}`, `xml_{fase}`, los combustibles, las fechas de firma y visita (en `cee` y,
como valor suelto, en `documentacion`) y, fuera del RES080, la D_ACS por litros/día
(`ajusteAcsLitros`). Lo hacen solos:

- `cee_inicial.js aplicar --escribir`, con el XML que acaba de subir;
- `cee_final_copiando.js --escribir` (RES060) y `cee_final.js --escribir` (RES093);
- `listo`, que ya lo hacía y ahora usa la misma función.

Para un CEE ya generado, o para reintentar: `node scripts/cee_inicial.js cargar <nº> [--fase final]
--escribir`. Fuente única: [cargarXmlCee.js](implementation/backend/services/cee/cargarXmlCee.js).

**REGLA — no pisa la ENTREGA de un técnico.** Si `cee_{fase}` ya se cargó de un fichero que no es un
borrador nuestro (`_REVISAR`), no se toca salvo `--forzar`. El nombre canónico «{nº} – CEE
INICIAL.xml» no prueba nada, porque la subida del técnico renombra a ese nombre (26RES080_41).
`listo` carga con `forzar`: lo que se va a firmar manda.

**REGLA — en una OPORTUNIDAD no se carga**: no hay expediente, y el XML se carga al aceptarla.

**Y se dice cuánto sale.** Tras cargarlo, el informe da el ahorro y el bono que calcula la app frente
a los de la propuesta. Si la oportunidad no tiene el sello del precio (`cae_client_rate`), el panel
calcula al respaldo de 95 €/MWh aunque la propuesta fuera a 100. Eso se dice, y se sella solo con el
«sí» del usuario (ver [precio CAE](docs/conocimiento/calculo/precio-cae-al-cliente-100-mwh-y-solo-hacia-adelante.md)).

Probado el 21/10/2026: en seco, `cargar` no pisa 26RES060_122 ni 26RES080_41 (CEE de técnico) y sí
carga 26RES060_241. Tras tocarlo: `node implementation/backend/scripts/test_agente_ia.js` y
`node implementation/backend/scripts/test_cex_final.mjs`.
