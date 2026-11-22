<!-- conocimiento · área: placas-catalogos · las rutas de los enlaces son relativas a la raíz del repo -->

## Las TARIFAS del distribuidor, por modelo del catálogo (2026-11-21)

Desde la fase 4 de la app del instalador, cada modelo de `aerotermia` puede tener la **tarifa del
distribuidor** (precio sin IVA, desde una fecha) y, aparte, el **precio propio** de cada instalador. Se
guardan en tablas nuevas y **no se toca ninguna columna de `aerotermia`**: el SCOP, las potencias y las
fichas siguen siendo lo de siempre. El detalle (esquema, rutas, pantallas): "La app del INSTALADOR, fase 4"
([app-del-instalador-fase-4.md](docs/conocimiento/instalador-app/app-del-instalador-fase-4.md)).

**REGLA — el Excel de tarifas NUNCA da de alta ni cambia un modelo: solo le pone precio a uno que YA está.**
Una fila que no casa con UN solo modelo (por marca y por su `modelo_comercial`, `modelo_conjunto` o
`modelo_ud_exterior`, sin tildes, mayúsculas, espacios ni guiones) se queda fuera y se lista. Para que
entre, primero se da de alta el modelo con su documentación (skill `alta-aerotermia`, regla 120) o se le
completa la referencia que trae la tarifa, y se vuelve a subir el Excel.

- Dónde se carga: pantalla **Aerotermia** del CRM → «Cargar tarifa (Excel)», solo ADMIN, en dos pasos (en
  seco y guardar). La plantilla se baja del mismo popup: columnas MARCA · MODELO · PRECIO SIN IVA.
- **Cada tarifa es de UN distribuidor** (desde el 22/11/2026): en el popup se elige de un desplegable de
  las empresas DISTRIBUIDOR (`distribuidor_id`; sin él, 400 `FALTA_DISTRIBUIDOR`). Electrofil y Calindsa
  suben cada uno su Excel y un mismo modelo puede tener las dos tarifas; el instalador ve solo las de los
  distribuidores a los que compra («Le compra a…» en su ficha). Ver "El CATÁLOGO por DISTRIBUIDOR"
  ([catalogo-por-distribuidor.md](docs/conocimiento/instalador-app/catalogo-por-distribuidor.md)).
- Una tarifa nueva no borra la anterior: es una fila más con su fecha. La vigente es la más reciente que ya
  ha empezado, **por modelo y distribuidor**.
- Por eso vale la pena que la referencia del distribuidor esté en el catálogo: casar por la **referencia de
  la placa** (regla 57) es lo que evita poner el precio a otro equipo con el mismo nombre comercial; un
  nombre que casa con varios modelos sale como «Elegir modelo» y lo decide una persona.
- Código: [services/catalogoTarifas.js](implementation/backend/services/catalogoTarifas.js) y
  [routes/aerotermiaTarifas.js](implementation/backend/routes/aerotermiaTarifas.js).
