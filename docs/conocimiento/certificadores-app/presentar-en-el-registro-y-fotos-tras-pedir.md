<!-- conocimiento · área: certificadores-app · las rutas de los enlaces son relativas a la raíz del repo -->

## Presentar en el Registro, lo que devuelve y las fotos tras pedir (2026-10-28)

Fran, probando la 2026EXT_1 ya validada: «la parte de fotos… no me deja ya añadir más fotos… que sean
las que falten, de la caldera, de los patios interiores. Que haya un botón para presentar el
certificado y que genere un borrador con los datos de la presentación, de momento de Castilla-La
Mancha, como el borrador que tenemos… que se suba el justificante de presentación y la etiqueta,
drag and drop, se guardará en la misma carpeta… para tener toda la documentación centralizada aquí. Y
un apartado de otros para subir la tasa, la resolución…».

### Fotos con la obra ya pedida

Hasta hoy, pedida la obra, «Fotos» solo enseñaba lo subido. El servidor ya admitía subir a cualquier
apartado salvo en ARCHIVADA (`docs.subir`); lo que lo impedía era la pantalla. Ahora
[ObraCerrada.jsx](implementation/frontend/src/certificadores/obra/ObraCerrada.jsx) le da a
`FotosObra` ([Fotos.jsx](implementation/frontend/src/certificadores/obra/Fotos.jsx)) un `ctx` con
`puedeSubir` (todo salvo ARCHIVADA) y el `subir` de verdad: salen todos los apartados que aplican con
sus botones, y en «Otras fotos» los que no aplicaban (otro equipo, los patios…), plegados tras
«Añadir a otro apartado».

**REGLA — tras pedir, se AÑADE pero no se QUITA**: el certificado se generó con esas fotos. `SlotFoto`
enseña los botones con `editable || puedeSubir`, pero la papelera solo con `editable` (BORRADOR), y el
servidor sigue con su 409 `OBRA_CERRADA` al borrar en LISTO / VALIDADO / ARCHIVADA.

### El botón «Presentar» y el borrador

En la obra entregada (LISTO / VALIDADO): «Presentar en el Registro» en el resumen (principal cuando ya
está firmado y aún no registrado), «Presentar» en la cabecera del PC y «Ver el borrador para
presentar» en «Documentos». Abre [Presentar.jsx](implementation/frontend/src/certificadores/obra/Presentar.jsx):
los avisos «Antes de presentar», cada apartado del trámite con un botón de copiar por casilla, los
cuatro ficheros que se anexan para bajarlos, «Abrir la sede de la JCCM» y «Borrador en PDF».

- `GET /api/certapp/obras/:id/presentar` → `{ borrador, html }` y `GET …/presentar/pdf` (el PDF), en
  [presentacion.js](implementation/backend/services/certapp/presentacion.js). `certappOnly` +
  `obraSuya`; 409 si no está entregada.
- El borrador es el **mismo del CRM** (`features/expedientes/logic/borradorCee.js`, ver
  [el borrador de presentar](docs/conocimiento/cee/presentar-el-cee-en-el-registro-el-borrador/00-presentar-el-cee-en-el-registro-el-borrador.md)):
  mismas casillas, mismo PDF, solo CLM (`aplica: false` fuera, y se dice).
- Lo que cambia es de dónde salen los datos, en
  [logic/presentar.js](implementation/frontend/src/certificadores/logic/presentar.js)
  (`borradorDeObra`): **01** el titular de la obra (sin su dirección, la de la vivienda, con aviso;
  con representante, comparece él); **02** el certificador con SU perfil (es quien firma y presenta);
  **05/06** el XML cargado. Los avisos del CRM que hablan de sus pantallas (Prescriptores, la ficha
  del cliente, la rejilla del CEE) se dicen con las de esta app («Mi perfil», los datos del titular,
  «Documentos»), y se avisa si falta el NIF del titular.
- Los ficheros se cruzan con «1. CEE»: el **firmado** (el PDF sin firmar no vale, y se dice), el XML,
  el .cex y el informe de mejoras si lo hay. Descarga firmada de siempre (`docs.urlFichero`).

**REGLA — `logic/presentar.js` es la única que convierte la obra en el borrador**: lo cargan el
servidor (por `import()`, como `logica.js`) y la demo, así que lo que se ve en la demo es lo que sale
en producción. Si cambia la forma de la obra o del perfil, se toca ahí.

### El justificante, la etiqueta y «Otros»

En «Documentos», bloque «Presentación en el Registro»
([Documentos.jsx](implementation/frontend/src/certificadores/obra/Documentos.jsx), `DelRegistro`):
dos zonas para soltar el archivo (o tocarlas): justificante y etiqueta; debajo «Otros» con su nombre
opcional. `POST /api/certapp/obras/:id/documentos/:clase` (`justificante | etiqueta | otros`,
`certappOnly` + `obraSuyaAntes` + multer de un fichero, 25 MB).

| Clase | Admite (por los bytes) | Dónde y cómo se llama |
|---|---|---|
| justificante | PDF | «1. CEE»/`{nº} - JUSTIFICANTE DE REGISTRO.pdf` |
| etiqueta | PDF, JPG, PNG | «1. CEE»/`{nº} - ETIQUETA ENERGÉTICA.{ext}` |
| otros | PDF e imágenes | «1. CEE»/OTROS/`{nº} - {nombre}.{ext}` (hasta 40) |

Lo que ya hubiera con el mismo nombre va a OLD. El **justificante** se lee con el mismo lector que el
CRM (`registroCeeOcrService.resolverFechaRegistro`, regla 27.c): la fecha leída —o la de hoy, con su
aviso— queda en `cee.registro` (`{ at, fecha, origen, numero, fichero }`, por `setCeeField`). Con
eso el resumen dice «Registrado el …» y «Lo siguiente» lo da por hecho. El listado de «Documentos»
(`documentos.listar`) trae `justificante`, `etiqueta`, `otros` y `registro`; el admin los ve igual,
sin las zonas de subir.

**REGLA — lo que devuelve el Registro NO lleva «CEE» en el nombre**: `entrega.elegirFicheros` toma
por certificado el PDF más reciente con «CEE» en el nombre; un justificante subido después se haría
pasar por el certificado. Además se excluyen por nombre (`JUSTIFICANTE|ETIQUETA|BORRADOR`) y
`documentos.claseDe` los reconoce ANTES que «CEE».

Probado en la demo (`?demo=1`, demo-obra-3): borrador con avisos, PDF, paso a «Documentos», soltar
justificante (queda «Registrado»), etiqueta y «TASA» en Otros; patio subido en «Otras fotos» sin
papelera. PC (1280) y móvil (375). En producción no se ha probado: el lector del justificante usa
Gemini y escribe en la obra.
