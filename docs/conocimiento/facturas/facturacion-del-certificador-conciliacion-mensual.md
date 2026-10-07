<!-- conocimiento · área: facturas · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Facturación del certificador — conciliación mensual (2026-08-03)

Pestaña **FACTURACIÓN** dentro del modal "Seguimiento de certificados" (`CertificadorFacturacionPanel.jsx`).
**Solo ADMIN**: aquí se ven importes. El backend lo repite — todas las rutas son `adminOnly`.

### El modelo: el certificador no factura expedientes, factura HITOS DE REGISTRO

| Concepto | Cuándo se devenga | Importe |
|---|---|---|
| `honorario` | Mes del **PRIMER** registro del expediente, **una sola vez** (se registre uno o los dos CEE) | 60 € |
| `tasa_inicial` | Mes del **primer** registro (ver pacto de adelanto) | 16,39 € |
| `tasa_final` | Mes del **primer** registro (ver pacto de adelanto) | 16,39 € |

**PACTO DE ADELANTO (`adelanta_tasas`, por defecto SÍ)**: el certificador pone de su bolsillo las DOS
tasas y las factura enteras en el **primer pago**, sin esperar a registrar el CEE final. Por eso un
expediente devenga honorario + las dos tasas en el mes de su primer registro, y una línea de
"2 tasas" con solo el CEE inicial registrado **es correcta, no un error**. Se puede desactivar por
certificador si con alguno se acuerda pagar cada tasa contra su registro.

Las tasas son **suplidos**: no llevan IVA (art. 78.Tres.3º Ley 37/1992) y quedan fuera de la base
imponible. Los honorarios llevan IVA 21 % y retención de IRPF 15 %. Tarifas configurables por
certificador en `app_settings` clave `tarifas_certificador:{id}`.

La fecha que manda es la del justificante (`documentacion.fecha_registro_cee_*`), con respaldo en
`seguimiento.cee_*_ts.REGISTRADO`.

### Sello de facturado
`expedientes.documentacion.fact_cert` = `{ honorario: {factura, fecha, importe, esperado, …}, tasa_inicial: {…}, tasa_final: {…} }`.

**REGLA**: se escribe con la RPC **`merge_expediente_doc_json`** (MERGE `||`, no reemplazo). Los tres
conceptos se sellan en momentos distintos —el honorario en julio, la tasa del CEE final en
septiembre—: un reemplazo borraría lo sellado antes. Script: `scripts/facturacion_certificador.sql`.

### Las dos vistas del panel
- **Mensual = SOLO CONSULTA.** Dice lo que el certificador *debería* facturarte de ese mes
  (devengado / ya facturado / pendiente) y el arrastre. No premarca nada: anunciar "cuadra" sin haber
  comparado con ninguna factura era información falsa. Un enlace activa el **modo manual** (casillas +
  sellado) para cuando la factura llegue en un formato que el parser no sepa leer — pasa: una misma
  certificadora ha usado dos plantillas distintas.
- **Factura importada = donde se concilia.** Manda la factura y no el calendario, porque el
  certificador mete en una misma factura registros de varios meses.

### Importar la factura (vía rápida)
El PDF se lee **en el navegador** con pdf.js (ya en el bundle) — no se sube a ningún sitio. Solo
viajan las líneas parseadas a `POST /:id/facturacion-certificador/conciliar`, que devuelve el
expediente propuesto por línea. Parser: `features/admin/logic/facturaCertificadorParser.js`.

**Cada certificador usa SU plantilla y no se parecen en nada.** Las dos conocidas:

```
Lanuza   "CEE inicial y CEE final registrados. C/ Dalí 4, 13150 Carrión…  1  60,00 €  60,00 €"
Moncayo  "- (26RES060_160) VIVIENDA UNIFAMILIAR EN QUINTANAR DE LA ORDEN…  1  60,00 €"
```

**REGLA — parsear por la COLA de la línea, no por columnas.** Lo único común es `<cantidad>` seguida de
uno o dos importes; el resto de la línea es la descripción. Con UN importe, ése es el total de la línea
(Moncayo escribe `2 32,78 €`, las dos tasas ya sumadas); con DOS, el primero es el unitario y el
segundo el total (Lanuza escribe `2 16,39 € 32,78 €`). La cola puede venir pegada a la descripción o
sola en su línea (los suplidos de Lanuza ocupan dos líneas de texto y la cola una tercera).

**REGLA — se trabaja sobre LÍNEAS VISUALES, nunca sobre los fragmentos sueltos de pdf.js.** pdf.js
trocea por donde le conviene (`"FACTURA Nº AP0"·"3"·"0"·"7"·"20"·"2"·"6"`, `"3"·"0"·"/06/2026"`) y esos
dígitos sueltos, leídos como celdas, se cuelan en la columna de "unidades" y crean conceptos fantasma.

**REGLA — si la línea cita el nº de expediente, manda ése.** `(26RES060_160)` es un dato; la dirección
es una conjetura. Si el nº citado no está entre los expedientes con registros del certificador, se
distingue entre "no es suyo" y "es suyo pero aún no tiene ningún CEE registrado" (el caso frecuente:
entrega, factura, y el CEE sigue pendiente de tu revisión).

**REGLA — el emparejamiento por dirección exige el número de portal**. Sin esa comprobación, "Virgen de
Criptana 7" casaba al 80 % con el expediente de "Virgen de Criptana 82". Solo se premarca lo de
confianza ALTA y **sin avisos**; lo demás lo confirma una persona.

El parser también lee los **totales que la factura declara** en su pie (`TOTAL SUPLIDOS 147,51 €`) y
avisa si el desglose no los suma: la factura AP03072026 lista dos veces el suplido de Los Carrascales
pero su total solo lo cuenta una vez.

**REGLA — verificar que la factura es DEL certificador cuya ficha está abierta.** Trabajamos con varios
certificadores (Lanuza, Moncayo…) y el panel es por ficha: subir la de uno en la ficha de otro
emparejaría contra los expedientes equivocados. Se coteja por NIF (`parseada.nifs` → `verificarEmisor`),
que todas las plantillas imprimen. Si es de otro, se enseña de quién es y **se bloquea el sellado**.
La búsqueda del emisor se limita a `tipo_empresa = 'CERTIFICADOR'`: el NIF de Brokergy también sale en
la factura (es quien la recibe) y está en `prescriptores`.

### En la MISMA factura vienen los dos negocios (2026-09-01)

El certificador no separa el CAE de los **CEE directos**: los mete mezclados en el mismo papel
(medido en la factura AP02082026MOD de agosto — 13 expedientes CAE y `2026CEE_54`) y con la misma
tarifa, porque a él le cuesta la misma visita y la misma tasa levantar uno que otro. Por eso
`cargarConceptos` lee las **DOS tablas** (`TABLAS`) y `RE_NUM_EXPEDIENTE` reconoce también el
formato `{AAAA}CEE_{n}`.

**REGLA — el sello va a la tabla de la que sea la fila.** `sellar` enruta a
`merge_expediente_doc_json` o a `merge_cee_directo_doc_json` según el `origen`, y `desellar` busca
en las dos: quien pulsa "quitar el sello" solo ve un número. El campo es el mismo (`fact_cert`);
lo único que cambia es dónde se guarda.

**REGLA — un CEE directo de alcance ÚNICO devenga UNA sola tasa.** Ahí no hay CEE final que
registrar, así que el pacto de adelanto no aplica: adelantar su tasa sería premarcar el cobro de un
registro que nunca va a existir. En el CAE siempre son dos.

**REGLA — el `origen` viaja hasta el enlace.** Un CEE directo se abre con `?cee=` y un expediente
con `?exp=`; son dos tablas y el mismo UUID no vale en las dos, así que un enlace equivocado no
lleva a otro expediente: no lleva a ninguno.

**REGLA — "consta REGISTRADO pero sin fecha" no es "no lo tiene".** Son dos avisos distintos porque
son dos trabajos distintos: en el primero falta el DATO (se pone la fecha del justificante y la
línea se concilia sola); en el segundo falta REVISAR el CEE. Decirlo con la misma frase convertía
una tarea de dos segundos en un "revísalo" sin pista.

**REGLA — los avisos se agrupan por texto.** Un expediente aparece DOS veces en la factura (su
honorario y sus tasas) y su aviso llegaba repetido: cuatro asuntos se leían como ocho y llenaban
justo la caja que hay que mirar antes de pagar.

⚠️ **La tasa de registro depende de la CCAA, y la tarifa de la app es una sola por certificador.**
Castilla-La Mancha son 16,39 € y la Comunidad Valenciana 10,19 € (medido: `2026CEE_54`, en
Cofrentes, factura 20,38 € por sus dos tasas frente a los 32,78 € del resto). La línea sale marcada
como **desviación de importe**, que es el comportamiento correcto —lo confirma una persona—, pero no
es un fallo del parser ni de la factura.

**Del PDF se leen también el sufijo del número y la fecha en letra.** `AP02082026MOD` es la factura
MODIFICADA de `AP02082026`: truncar el sufijo dejaría a las dos con el mismo sello e
indistinguibles en el histórico de lo pagado. Y la única fecha de la plantilla de Moncayo va al pie
y con todas las letras ("Bellver de Cerdanya, a 31 de Agosto de 2026"); sin ella no se puede sellar
y había que teclearla teniéndola delante.

Prueba del ciclo entero (devengo · conciliación · sellado · desellado) con un Supabase simulado,
sin tocar producción:

```bash
node implementation/backend/scripts/test_facturacion_certificador.js
```
