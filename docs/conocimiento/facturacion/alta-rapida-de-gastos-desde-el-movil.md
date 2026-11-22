<!-- conocimiento · área: facturacion · las rutas de los enlaces son relativas a la raíz del repo -->

## Alta rápida de gastos desde el móvil: foto, escaneo a PDF y a su carpeta de Drive (2026-11-22)

**Por qué.** Fran (22/11/2026): «quiero que haya un botón para poder añadir Gastos. Como cuando los dejamos
en una carpeta de Drive, y que cuando se añada se guarde en la carpeta correcta de contabilidad. Que se
pueda hacer desde el móvil de manera rápida, que haga un escaneo y se guarde como pdf la foto… un
escritorio para la empresa… gasoil, comidas… Debe ser mobile first». Hasta entonces un gasto solo entraba
dejando el PDF a mano en `{raíz}/{año}/{n. MES}` de Drive y luego pulsando «Leer» en Facturación →
Trimestres.

| Qué | Dónde |
|---|---|
| El botón | Cuadro de mando: «+ Gasto» en la cabecera (elige foto o PDF; [DashboardView.jsx](implementation/frontend/src/features/dashboard/views/DashboardView.jsx)). En el móvil, desde CUALQUIER pestaña, el ＋ de la barra de abajo: «Gasto con una foto» abre la CÁMARA a la primera y «Gasto en PDF» el selector ([BarraMovil.jsx](implementation/frontend/src/components/layout/BarraMovil.jsx), regla 239). Hasta el 22/11/2026 era un botón flotante abajo a la derecha, y tapaba la mascota del asistente |
| La pantalla | [GastoRapido.jsx](implementation/frontend/src/features/dashboard/components/GastoRapido.jsx): elegir → leyendo → revisar → hecho |
| El escaneo | [escaneoGasto.js](implementation/frontend/src/features/dashboard/logic/escaneoGasto.js), en el navegador |
| Qué carpeta, qué mes, qué nombre | [gastoRapido.js](implementation/backend/services/gastoRapido.js) |
| Leer y subir | [gastosDrive.js](implementation/backend/services/gastosDrive.js): `leerParaAlta`, `carpetaMesGastos`, `subirGasto` |
| Rutas | `POST /api/facturacion/gastos/preparar` (lee y propone; no escribe) · `POST /api/facturacion/gastos/alta` (sube; con la clave interna, solo `?seco=1`) — las dos `adminOClaveInterna` |
| Pruebas | `node implementation/backend/scripts/test_contabilidad.mjs` (las «alta rápida») |

### Cómo va

1. **Foto** (o PDF). El navegador reduce la foto a 2.000 px de lado mayor, con la orientación del EXIF, y
   la manda en color a `preparar`.
2. **preparar** la lee con Gemini (el mismo esquema que `leerJustificante`, más el recuadro del PAPEL de
   cada foto, `paginas_caja`) y propone, para la Sociedad y para el Autónomo: carpeta, mes, nombre del
   fichero y su criterio fiscal (`fiscalGasto`, el de Trimestres). No escribe nada.
3. El navegador **escanea** cada página: la recorta al papel con ese recuadro, quita la sombra (divide
   cada píxel por el brillo del papel de alrededor, medido en una rejilla) y la pasa a grises con el
   texto oscuro. ~80 ms por página; un PDF de ~50–300 KB por página, a 595 pt de ancho.
4. **Revisar**: las páginas (girar, quitar, «+ Página», que vuelve a leer todas respetando lo corregido
   a mano), proveedor, fecha, total, Sociedad/Autónomo con el porqué, la carpeta y el nombre, el IVA
   deducible y los avisos. «Más datos»: nº, NIF, concepto, base, IVA y %. Corregir algo o cambiar de
   quién es lo **recalcula el servidor** (`alta?seco=1` sin PDF): en el navegador no se hace ninguna
   cuenta de dinero (regla 216).
5. **Guardar en Drive**: `alta` vuelve a decidir carpeta y nombre (no se fía del navegador), crea la
   carpeta del año o del mes si falta («11. NOVIEMBRE», como las de siempre), sube el PDF y deja lo
   leído en sus `appProperties` con su md5: sale **LEÍDO** (no revisado) y no se vuelve a leer. Borra
   la caché del cuadro. La revisión fina sigue en Facturación → Trimestres.

### Las REGLAS

**REGLA — de quién es el gasto: manda a nombre de quién va la factura.** NIF del destinatario = el de la
FML → AUTÓNOMO; = el de la SL → SOCIEDAD (los NIF, de `facturacion_emisores`, nunca en el código). Sin
destinatario: el gasoil y el coche (`COMBUSTIBLE`, `VEHICULO`) al AUTÓNOMO —así están en Drive los
PLENERGY, el IVTM y el taller—; lo demás a la SOCIEDAD. Un destinatario que no es ninguno de los dos se
avisa («mira a nombre de quién está»). Se cambia con un toque.

**REGLA — los gastos de la Sociedad van a la carpeta CAE.** «CAE - SERVICIOS CAE / FACTURAS GASTOS» es
donde están los generales de la SL desde 2026 (comidas, IKEA, Amazon). La actividad (CAE / ING / COMÚN)
la sigue decidiendo `actividadDe` al hacer el trimestre. Los del autónomo, a «FML - SERVICIOS AUTONOMO /
GASTOS».

**REGLA — a qué mes: el de la factura, salvo que su trimestre ya esté cerrado.** Cerrado = pasó el plazo
del 303 (`plazos`), su 303 está anotado como pagado en los datos fiscales del cuadro, o ya existe su
carpeta en «ENTREGA GESTORÍA». Entonces, y también sin fecha leída o con una fecha posterior a hoy, va
al mes de HOY (cuando se recibe) y se dice por qué. El trimestre de hoy nunca está cerrado. Con eso, la
regla del trimestre más tardío (carpeta o fecha) lo cuenta en el trimestre abierto y no reabre uno
presentado.

**REGLA — el nombre, como los de Drive.** `AAAA-MM-DD - PROVEEDOR - Nº - concepto.pdf`: el proveedor con
`proveedorCorto` (sin S.L., S.A.U.…), sin tildes, sin `/ \ : * ? " < > |`, el concepto en minúscula; el nº
y el concepto, si los hay. Si el nombre ya existe en la carpeta, «… (2).pdf».

**REGLA — el mismo PDF no se sube dos veces.** Si en la carpeta ya hay un fichero con la misma md5 (el
doble toque, o volver a guardar), no se sube y se dice «Ya estaba en Drive».

**REGLA — leer es un gesto, y el modelo solo LEE** (regla 170). `preparar` solo se llama al hacer la foto
o elegir el fichero; lo fiscal lo decide `fiscalGasto`. Como mucho 6 páginas, 8 MB por foto y 15 MB el
PDF; un gasto es fotos o un PDF, no las dos cosas.

**REGLA — subir lo hace un ADMIN desde la app.** `alta` con la clave interna (MCP, scripts) solo en seco;
el banco `fx-demo` deja `preparar` y `alta?seco=1` y bloquea el alta de verdad (local = producción).

### Medido el 22/11/2026 (banco `fx-demo.html?vista=cuadro`, contra producción, sin escribir)

- Una foto sintética de una factura sobre una mesa con sombra: leída en ~8 s, recortada al papel y con la
  sombra fuera; proveedor, fecha, nº, total, base e IVA bien. Un PDF de texto: lo mismo. Un gasoil de
  septiembre del autónomo en seco: a «FML … / 2026 / 11. NOVIEMBRE» (el T3 ya cerrado), combustible, IVA
  deducible al 50 %.
- Lo que NO se ha probado aún: la subida de verdad a Drive (`subirGasto`), que escribe en producción. El
  primer gasto real lo da de alta Fran.
