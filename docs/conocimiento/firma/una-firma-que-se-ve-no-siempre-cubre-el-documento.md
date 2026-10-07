<!-- conocimiento · área: firma · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Una firma que se VE no siempre CUBRE el documento (2026-09-18)

Un PDF puede enseñar su firma en el visor y no valer: si se le tocó un byte después
de firmarlo, o llegó truncado, el resumen que firmó el certificado ya no cuadra con
el fichero. **En pantalla no se nota** —pdf.js reconstruye el índice de un PDF roto
y lo pinta perfecto— y el único que se queja es un lector que compruebe la firma, o
el verificador, semanas después. Es lo que dejó tres firmas inservibles en
26RES060_179 el 17/09 (regla 55) sin que nada lo dijera.

Ahora se comprueba antes de dar el verde, y antes de guardar lo que vuelve de
Autofirma.

| Qué | Dónde |
|---|---|
| La comprobación (rango, truncamiento y resumen del documento) | `integridadDeFirma` / `leerDigestsPkcs7` en [utils/firmasPdf.js](implementation/backend/utils/firmasPdf.js) |
| El resultado, junto a quién firma | `leerFirmasPdf(buf).integridad` → `{ ok, rota, comprobadas, problemas[] }` |
| Prueba de que la avería se detecta (sin BD, sin red) | `node implementation/backend/scripts/test_integridad_firma.mjs` |
| Prueba de que lo BUENO no se marca (contra producción) | `node implementation/backend/scripts/barrer_integridad_firmas.js` |

**REGLA — esto sigue SIN decir que una firma sea válida.** No se comprueba la cadena
de confianza, ni la revocación, ni que firmara de verdad esa clave: eso es de
Autofirma y del validador del Ministerio. Lo que se afirma es más estrecho y más
duro: **"la firma NO cubre este documento"**, que es un hecho comprobable con el
fichero en la mano — el `messageDigest` del firmante contra el hash de lo que hay
hoy. Decirlo de otra forma en pantalla sería prometer una validez que nadie ha
comprobado.

**REGLA — bloquea solo lo que se ha PODIDO comprobar y NO cuadra.** Lo que no se
sabe leer sale como `ok: null` y **pasa**: un falso positivo aquí para un expediente
que está bien, y el aviso que salta sin motivo es el que enseña a ignorar los
avisos. Medido sobre los 592 firmados de producción: **281 comprobadas y correctas,
2 rotas, 2 sin messageDigest legible, 0 falsos positivos**.

**REGLA — la ÚLTIMA firma es la única a la que se le exige llegar al final del
fichero.** En un PDF con varias (el Anexo I lleva la del S.O. y la de Brokergy) cada
una cierra su revisión y la siguiente escribe detrás, así que una firma anterior que
no llega al final es lo NORMAL. Exigírselo a todas habría marcado como rotos todos
los Anexos I de todos los lotes.

**REGLA — un escaneo sin firma electrónica no es un documento roto.** 303 de los 592
son manuscritos y de su integridad no se afirma nada.

### Dónde está puesto, y qué hace cada uno

| Superficie | Qué pasa con una firma rota |
|---|---|
| **Validar** un documento (`POST /:id/documentos/validar`) | **409**, con el motivo y la salida «validarlo igualmente» — que se escribe en el historial con el nombre de quien la toma |
| **Firmar con Autofirma** (`POST /:id/documentos/firmar-subir`) | **422 y NO se sube**: acabamos de firmarlo nosotros, así que lo que procede es volver a firmar, no archivar una firma inválida |
| **Firmados que devuelve el S.O.** (`firmadosSo`) | estado `firma_rota`, que no se registra: de ahí el documento sale al ZIP del MITECO |
| **CEE firmado por el técnico** (`ceeFirmaService`) | **AVISA y no bloquea**: lo sube él desde su enlace y dejarle sin poder entregar sería peor que el problema |

**REGLA — validar es copiar a «10. EXPEDIENTE CAE», y por eso se mira AHÍ.** Esa es
la carpeta que audita el verificador, y el momento de validar es el último en que
hay una persona delante pudiendo pedir otra copia. Cuesta una descarga de Drive por
validación; si el fichero no se puede bajar, **no se para la validación**: el filtro
es una red, no un peaje.

⚠️ **Dos documentos ya validados tienen la firma rota** y el filtro no los toca
(solo actúa al validar): el **CIFO de 26RES060_179** —validado el 17/09 a las 19:12,
truncado en 8 bytes— y el **CIFO de 25RES060_70**, validado desde junio, con 55.751
bytes escritos detrás de la firma. Los dos hay que volver a pedirlos firmados. El
barrido los vuelve a listar cuando se quiera comprobar.
