<!-- conocimiento · área: cee · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «PRESENTAR el CEE en el Registro — el borrador (2026-09-15)»; la introducción y el resto, en esta misma carpeta.

### El VISTO BUENO deja el CEE listo para presentar — Eva ya no presenta (2026-10-25)

Decisión de Fran (25/10/2026): «Eva ya no presenta, así que yo solo daré el visto bueno y desde que
doy el VB se puede presentar. Si no están firmados, que también los firme. Una vez que se da el VB no
debe llevar el _REVISAR los archivos». Sustituye a «con el certificador de la CASA, Validar es
encargar la presentación» (ENCARGAR la presentación a una persona de fuera, 07/10/2026).

| Qué | Dónde |
|---|---|
| `_REVISAR` → nombre definitivo al dar el VB | [services/cee/canonicoAlVistoBueno.js](implementation/backend/services/cee/canonicoAlVistoBueno.js), llamado desde los tres visto bueno: `POST /expedientes/:id/approve-cee`, `GET …/approve-cee-from-email` y `POST /cee-directos/:id/approve-cee` |
| «Validar» con el certificador de la casa | `abrirValidar` en [CeeModule.jsx](implementation/frontend/src/features/expedientes/components/CeeModule.jsx): visto bueno directo y overlay con lo renombrado |
| Lo pendiente de presentar, con FIRMADO sí/NO | `node implementation/backend/scripts/presentar_cee.js pendientes` |
| Prueba sin datos reales | `node implementation/backend/scripts/test_canonico_visto_bueno.js` |

**REGLA — con el VISTO BUENO el CEE ya se puede presentar, también el del certificador de la casa.**
«Validar» con Fran (CIF de Brokergy, `esCertificadorDeLaCasa`) ya no abre el popup de Eva: da el
visto bueno sin aviso (`approve-cee` sin canales, borrador guardado en Drive) y enseña lo hecho.
La tarea «Presentar el CEE» de la rejilla sale SOLO con el visto bueno (REVISADO): antes, con el de
la casa, salía en cuanto se subía. Lo presenta la casa (el PC, skill `presentar-cee`), que **firma
antes si falta el `_fdo`** (`firmar_cee.js`, paso 3 del encargo al PC). En el parte diario, un CEE
de Fran sin registrar ya no es «Enviar a Eva»: queda en REGISTRO como «Presentarlo (firma y tasa en
el PC)», sin tarjeta de Despachar (`aLaCasa` en `seguimientoRadar.js`). El botón «✉ Enviar a
presentar» ya no sale (ni en la rejilla ni en el borrador): el servicio y la página pública de quien
presenta siguen ahí, sin entrada.

**REGLA — al dar el VB, el `_REVISAR` de ESA fase pasa a su nombre DEFINITIVO** (`{nº} – CEE INICIAL.cex/.xml/.pdf`;
en un CEE directo de un certificado, «CEE»). Es un RENOMBRADO en Drive (mismo id, mismos enlaces),
sin CE3X —el VB se da desde el VPS—: el `.xml` y el `.pdf` del borrador ya son los de CE3X. `.cex` y
`.xml` quedan en `cee.cee_files` (por su RPC de clave) y el `.xml` se carga como «Cargar CEE» con
`forzar` (regla 152). El PDF va sin firmar. **Manda el más reciente**: si ya hay un canónico más nuevo
(la entrega de un técnico, o un `listo`), el `_REVISAR` va a OLD y no se toca nada más; si es más
viejo, va él a OLD. Nunca se borra nada. Un fallo aquí NUNCA tumba el visto bueno: sale como aviso.

**REGLA — todo esto es SOLO para los CEE de la CASA; el de un técnico de FUERA es suyo y lo presenta
él.** Fran, el mismo día: «con los finales, si son de otro certificador, se deben mantener y avisar
para que los presenten ellos». La casa = Fran por el CIF (`esDeBrokergy`) o el Agente IA, que firma
la casa (`esDeLaCasa` en `canonicoAlVistoBueno.js`, compartido). Con un técnico de fuera:
`aCanonico` devuelve `ajeno: true` sin tocar un fichero (sus nombres se quedan como los subió);
`presentar_cee.js pendientes` lo lista aparte, en «LOS PRESENTA SU TÉCNICO», con la fecha del
visto bueno para recordárselo; `preparar` da NO LISTO; y el radar y la rejilla siguen como siempre
(«Recordar al certificador», la tarea «Presentar el CEE» del técnico). Medido el 25/10/2026: los
finales de 26RES060_195, _244 y _164 (Luis Alberto Lanuza, VB del 20 y 23/10) habrían entrado en
la rutina de presentar de la casa.

**REGLA — el borrador es el de ESA fase, y solo ese**: ` - {rótulo}_REVISAR.{ext}` (con el número
del expediente o el de la oportunidad, y la copia «(1)» que numera Drive). ⚠️ Medido en seco el
25/10/2026: la carpeta del inicial de un RES080 guarda TAMBIÉN el `CEE PREVISTO_REVISAR`, y con un
filtro por «_REVISAR» a secas 26RES080_94 y _58 lo habrían convertido en su «CEE INICIAL». El
previsto no se toca nunca.

Los encargos a Eva que seguían vivos se revisaron el 25/10/2026: de siete, seis ya estaban
REGISTRADOS (solo faltaba cerrar el sello) y se dejaron; el único vivo, 2026CEE_59 inicial, se
retiró (`presentacionCeeService.retirar`: enlace anulado y nota en el historial). `presentar_cee.js
pendientes` y el radar ignoran ya un encargo retirado. `app_settings.presentador_cee` se queda como
estaba (nada lo usa sin el botón).
