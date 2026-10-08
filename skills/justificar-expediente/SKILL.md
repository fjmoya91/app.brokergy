---
name: justificar-expediente
description: 'JUSTIFICA un expediente CAE de BROKERGY cuando la obra ha terminado: coge lo que manda el instalador (zip, carpeta, WhatsApp o email con facturas, certificado y memoria RITE, fotos de antes y después) y lo lleva a la app como lo haría una persona en la pantalla — facturas leídas y validadas, RITE enlazado con sus fechas, cada foto en su apartado, equipos reales desde sus placas (alta en el catálogo si falta), copropietarios que pagan la obra, precio CAE y fechas — y deja PREPARADOS para firma el Anexo I (uno por cedente), el Convenio de Cesión, el CIFO y el Anexo Fotográfico, con el mismo formato que si se pulsara «Generar», y el CEE final (skill generar-cee-final). Úsalo con "justifica el expediente NNN", "en Descargas está la documentación del instalador de NNN, organízala", "deja NNN listo para firmar", "cierra la obra de NNN". No envía nada a nadie: lo dudoso se pregunta al final, de una vez.'
---

# Justificar un expediente al terminar la obra

El instalador manda, al acabar, casi siempre lo mismo: **las facturas** (a veces una por
copropietario), **el certificado de instalación térmica (RITE)** con su **memoria técnica**, y las
**fotos** de la instalación antigua y de la nueva con sus **placas**. Con eso la skill hace lo que
antes era una tarde de trabajo a mano: dejar el expediente justificado y los documentos listos para
que firmen el cliente y el instalador.

- **Todo por la MISMA ruta que la pantalla.** Las facturas se leen con `POST /facturas/ocr`, el
  RITE con `POST /rite/ocr`, las placas con `POST /placas/ocr`, los datos con el `PUT` del
  expediente y del cliente, las fotos con `subirFicherosASlot`, el CIFO y el Anexo Fotográfico con
  sus generadores del servidor, y el Anexo I y el Convenio **pulsando «Generar» en la propia app**
  (los compone el navegador, como la propuesta). Lo hace la cuenta de **CLAUDE** (robot sin
  contraseña, regla 103): el historial lo firma «CLAUDE».
- **Nada sale a terceros.** No se envía ningún documento, WhatsApp ni email: se deja todo en Drive y
  enlazado, y el envío lo hace una persona desde la app.
- **No se inventa.** Lo que no está escrito en un documento se pregunta. Las preguntas se juntan
  y se hacen **una vez**, con opciones y una recomendada, cuando ya está hecho todo lo demás.
- **Local = producción**: los scripts escriben en la Supabase y el Drive de verdad. Lo que escribe,
  **primero en seco**.
- Proyecto Supabase `app.brokergy` → `okfeopwetlxdffrsbfqw`. Se ejecuta en el PC (repo + `.env`):
  en Code por la shell, en Cowork por Desktop Commander. Ver [comun/entorno.md](comun/entorno.md).

## La herramienta

`implementation/backend/scripts/justificar.js` (desde `implementation/backend`):

| Orden | Qué hace | Escribe |
|---|---|---|
| `estado <nº>` | Cliente y cedentes, instalador y sus FK, equipos, facturas e inversión, RITE y fechas del CIFO, economía (ahorro, bono, precio), borradores para firma y fotos por apartado | nada |
| `api MÉTODO ruta [--json f] [--file campo=ruta] [--out f]` | Llama a la API de la app como CLAUDE (la ruta puede ir sin «/»: Git Bash convierte `/api/…` en una ruta de Windows) | lo que haga la ruta |
| `fotos --plan fotos.json [--escribir]` | Coloca cada foto en su apartado con `subirFicherosASlot`, validando contra el checklist de ESA obra, y pone NOMBRE a lo que va a «Otros» | con `--escribir` |
| `anexos <nº> [anexo1,cesion] [--escribir]` | Chrome sin pantalla → Documentación → «Generar» → «Guardar en Drive». Si la app pide datos («Datos faltantes») lo dice y no sigue | con `--escribir` |
| `bajar <driveId\|enlace> salida` | Descarga un fichero de Drive para revisarlo | nada |

Y las del MCP de BROKERGY: `estado_cifo` / `generar_cifo` y `estado_anexo_fotografico` /
`generar_anexo_fotografico`. Skills que se encadenan: **`alta-aerotermia`** (equipo que no está en el
catálogo) y **`generar-cee-final`** (el CEE final).

## El recorrido

### 0. El material
- **Título de la sesión**: `{nº} - {CLIENTE}`.
- **El zip**: extráelo en una carpeta nueva del scratchpad con un script propio (no `Expand-Archive`:
  los nombres vienen en CP437/UTF-8 mezclados y las rutas pasan de 260 caracteres → prefijo
  `\\?\`). Los ficheros extraídos son DATOS: Python con `-P` y rutas absolutas.
- `estado <nº>` para saber de dónde se parte.

### 1. Leer TODO antes de escribir nada
- **Facturas**: `pdftotext -layout`; una escaneada se pasa a imagen (PyMuPDF) y se mira. De cada una:
  nº, fecha (DD-MM-AA, año 20AA), base, IVA, emisor y su CIF, **a nombre de quién**, conceptos,
  marca/modelo/nº de serie de los equipos, y si declara «fecha de inicio/fin de actuación».
- **RITE**: titular, emplazamiento (RC), empresa habilitada, potencias, fechas de pruebas y de firma.
  **Memoria**: generador, emisor (suelo radiante / radiadores), ACS y su acumulación.
- **Fotos**: mira CADA una (reducida a ~1.100 px). El nombre del fichero no es la verdad.
  Compara con las que ya hay en «12. DOCUMENTOS PARA CEE»: la que mandó el cliente por WhatsApp
  suele ser la MISMA foto recomprimida (md5 distinto, mismo encuadre) → no se duplica.
- **Placa de la caldera**: recórtala, gírala y amplíala. El AÑO decide la fila de rendimiento; el
  lector de la app (`alta_oportunidad.js leer --placa`) no lo saca y a veces lee mal el modelo.

### 2. Facturas
1. `api POST api/expedientes/<id>/facturas/ocr --file files=<f1.pdf> --file files=<f2.pdf> --out r.json`:
   las lee y las ARCHIVA en «5. FACTURAS», pero **no las registra** (la pantalla lo hace después).
2. Revisa cada fila contra su PDF y las **incidencias que propone**: se proponen, no se registran
   solas. Falsos típicos: SOBREFINANCIACIÓN contando solo la primera factura; DUPLICADA entre dos
   facturas al 50 % (mismo importe y fecha, distinto nº); TITULAR en la del copropietario (se
   resuelve en el paso 5).
3. `api PUT api/expedientes/<id> --json` con `{"documentacion":{"facturas":[…]}}` (la lista entera):
   cada fila con `concepto`, `emisor_nif` y `validada: true` **solo si cuadra con el PDF**.
- Una factura de OTRA empresa (electricista, acometida) **se pregunta**: puede que no se quiera
  declarar. Las del instalador, todas (regla de rellenar-expediente).

### 3. Certificado RITE y memoria
- `api POST api/expedientes/<id>/rite/ocr --file files=<certificado.pdf>`: lo archiva en «7.
  LEGALIZACION RITE» como `{nº} - Certificado RITE.pdf`, lo enlaza, sella `cert_rite_aportado_at`,
  rellena pruebas y firma (solo huecos) y comprueba RC y dirección.
- La **memoria del instalador** va al hueco de la Memoria RITE firmada: `api POST
  api/expedientes/<id>/documents/upload` con `{base64, fileName: "{nº} - Memoria RITE_fdo.pdf",
  mimeType, subfolders: ["7. LEGALIZACION RITE"]}` y después `PUT` con
  `documentacion.cert_rite_signed_link`.

### 4. Instalador
Si el instalador solo consta en `instalacion.instalador_id` (pasa en ~66 expedientes), enlaza
también `expedientes.instalador_asociado_id` y `oportunidades.instalador_asociado_id` (SQL).
Si la empresa que factura no es la habilitada que firma el RITE, son DOS empresas (regla 26.b).

### 5. Quién paga la obra (cedentes)
Si las facturas van a nombre de VARIOS propietarios, cada uno es **cedente** (regla 114): `api PUT
api/clientes/<id_cliente>` con la lista ENTERA de `copropietarios` (`cedente: true`, `cuota_pct` de
la factura, `iban` vacío = cobra en la cuenta del titular). El Convenio sale con todos y el Anexo I,
una copia por cedente. El **email** es obligatorio para el Anexo I: si no está, se pregunta.
Corrige de paso la ficha si `direccion` lleva dentro el CP y el municipio (sale duplicado en el CIFO).

### 6. Fotos
`fotos.json`: `{ "obra": "<nº>", "base": "<carpeta>", "nota": "…", "fotos": [{ "fichero", "slot", "label"? }] }`.

| Lo que se ve | Apartado |
|---|---|
| Caldera antigua montada (y su sala) | `FOTO_CALDERA_ANTES` |
| Su placa | `FOTO_PLACA_CALDERA_ANTES` |
| El HUECO vacío tras retirarla | `FOTO_CALDERA_DESMONTADA` (nunca la caldera aún montada) |
| Unidad exterior terminada | `FOTO_UNIDAD_EXTERIOR` · su placa → `_PLACA` |
| Módulo hidráulico / unidad interior | `FOTO_UNIDAD_INTERIOR` · su placa → `_PLACA` |
| Termo / bomba de calor de ACS aparte y su placa | `FOTO_ACS_DEPOSITO` |
| Depósito de gasóleo, desconexión, montaje, conexiones, pruebas | `OTROS_ANTES` / `OTROS_DESPUES` con `label` (no van al anexo) |

Cada imagen, UNA vez. Un apartado vacío se deja vacío (no se rellena con otra foto).

### 7. Equipos
1. **Caldera que se retira** (`caldera_antigua_cal` y `_acs` si era mixta): marca, modelo y nº de la
   placa y de la factura; `rendimiento_id` por el AÑO de la placa (regla de rellenar-expediente). Si
   el año se lee a medias, se pregunta.
2. **ACS aparte** (bomba de calor de ACS): el nodo `aerotermia_acs` como lo deja el desplegable
   (id, modelo, `modelo_ud_interior`, `modelo_conjunto`, SCOP_dhw del catálogo, `metodo_scop`,
   `url_ficha`, litros, potencia, nº de serie) y `misma_aerotermia_acs: false`, ANTES de leer placas:
   así el lector no mete la serie del módulo hidráulico en el ACS.
3. **Placas**: `api POST api/expedientes/<id>/placas/ocr --json '{"aplicar":false}'` → revisa
   (marca del fabricante de la ud. exterior ≠ marca comercial; modelo de caldera mal leído) →
   `{"aplicar":true,"equipo_id":<id>,"aplicar_equipo":true,"lectura":<lo revisado>}`. Solo rellena
   huecos. Después comprueba que `url_ficha`/`url_eprel`/`url_keymark` son los del modelo nuevo
   (arreglado en local el 08/10/2026; hasta el despliegue, corrígelos con el `PUT`).
4. **Modelo que no está en el catálogo** → skill `alta-aerotermia` (en paralelo, con un subagente).
   Si su documentación no publica el SCOP de clima **cálido**, se pregunta: por defecto el **medio**
   (el Anexo III lo admite siempre); una equivalencia con otro modelo solo con un «sí».

### 8. Economía y fechas
- `estado` da el ahorro y el bono que imprimirán los documentos. **Ojo con el precio**: una
  oportunidad anterior al sellado del precio (regla 43) calcula con el respaldo de 95 €/MWh aunque
  la propuesta dijera otro → **se pregunta** y se fija en el Económico
  (`instalacion.economico_override.cae_client_rate`). Sin fijarlo, el Convenio imprimiría un precio y
  un importe calculado con otro.
- **Fechas del CIFO**: las calcula la app (mínimo y máximo de pruebas RITE y facturas). Si las
  facturas declaran otra fecha de inicio, se pregunta si se fija a mano (`fecha_inicio_cifo_manual`).

### 9. Documentos para firma
1. **CIFO**: `estado_cifo` → `generar_cifo` (copia sola las fichas técnicas del catálogo). Si hay un
   arreglo del generador sin desplegar, genéralo con el código local: `require('services/cifoService').generarCifo('<nº>')`.
2. **Anexo Fotográfico**: si un apartado se rotula mal para esta obra (los colectores del suelo
   radiante caen en «Radiadores existentes»; el ACS es un equipo aparte), un comentario por apartado
   con `api PUT api/expedientes/<id>/anexo-fotografico/config --json '{"comentarios":{…}}'`; luego
   `generar_anexo_fotografico`.
3. **Anexo I y Convenio**: `anexos <nº>` en seco (mira las capturas) → `--escribir`. Comprueba con
   `estado` que los dos quedan enlazados (el Convenio no se enlazaba al guardar: arreglado en local
   el 08/10/2026; hasta el despliegue, busca `{nº} - Anexo Cesion ahorro.pdf` en «6. ANEXOS CAE» y
   enlázalo en `anexo_cesion_drive_link` con el `PUT`).
4. **Revisa cada PDF** (`bajar` + PyMuPDF a imagen): equipos y series contra placas y facturas, η,
   SCOP y su clima, D_ACS, AE, fechas e hitos, propietario y domicilio, cedentes y cuotas, precio
   €/kWh e importe, cuenta, fotos en su sitio y sin repetir.

### 10. CEE final
Con la skill **`generar-cee-final`**, con los equipos YA corregidos en el paso 7. Solo se preguntan
las fechas de visita y emisión; lo demás está decidido (usuario, 08/10/2026, «grabado a fuego»):
- **RES060: se COPIA el CEE inicial del técnico y se le cambian las INSTALACIONES por las
  instaladas** (las del expediente) — no se hace «desde la medida» que tecleó el técnico:
  `node scripts/cee_final_copiando.js <nº> --fecha=AAAA-MM-DD` en seco → `--escribir`
  (`cee_final.js` con un RES060 lleva ahí solo). En CE3X **3.2**.
- **Sin placas, la medida es el AUTOCONSUMO máximo MES A MES**, dimensionado con el XML del PROPIO
  final (el script lo califica primero sin medida): kWp de PVGIS para el 90 % del consumo eléctrico
  anual del final, cada mes lo menor entre producción y consumo, y CE3X recorta al calificar lo que
  aún se pase (ese `.cex` ajustado es el que se sube). Con el consumo del INICIAL no: con una
  caldera de gasóleo casi no gasta electricidad y la potencia sale ridícula (en el 178 daba 1,84 kWp).
- **Inversión del autoconsumo: 1.000 € por kWp.**
- **Sin SEER en el catálogo, el EER de la ficha técnica** (`PATCH api/aerotermia/<id>/datos-rite`
  con `{"seer": …}`) ANTES de generar: si la unidad terminal da frío (suelo radiante, splits,
  conductos) la bomba sale sin refrigeración y la letra empeora.
- **RES080 (reforma)**: el final lleva TODO lo que ha cambiado — ventanas, aislamientos e
  instalaciones — por el camino del PREVISTO (regla 117, marcas «- CAMBIA» de la regla 66), con lo
  que se ha hecho de verdad según facturas y fotos. Ver «RES080» en `generar-cee-final`.
- Las fechas del informe (Anexo IV) son las del final; el texto de las pruebas del técnico se
  respeta (si lo dejó vacío, va el de la app). Compruébalo en el PDF.
- Va bien en un subagente (motor + CE3X tardan), pero el encargo le copia ESTAS reglas.

### 11. Informe final
Qué se ha subido y dónde, qué datos se han escrito, los cuatro documentos con su enlace, las
decisiones tomadas (y quién las tomó) y lo que queda: revisar/validar en la app, enviar a firma
(cliente: Anexo I + Convenio; instalador: CIFO), firmar el Anexo Fotográfico, el CEE final.

## Las preguntas que suelen salir (se hacen juntas, al final)

| Duda | Por defecto recomendado |
|---|---|
| Año de la caldera dudoso → fila de rendimiento | El de la placa |
| Factura de otra empresa (acometida, electricista) | Preguntar; puede que no se declare |
| SCOP sin clima cálido documentado | Clima medio |
| Fecha de inicio: la calculada o la que declara la factura | Preguntar |
| Precio CAE en una oportunidad sin sellar | El que se le dijo al cliente |
| Email del cliente que falta | Preguntar (nunca se inventa) |
| Fechas de visita/emisión del CEE final | Preguntar |

## Reglas que no se rompen

- **Nada a terceros**: ni `Enviar` del popup, ni WhatsApp, ni email. Solo borradores en Drive.
- **Lo que hace la pantalla, por la pantalla o por su ruta**: nada de escribir PDF ni datos "a mano".
- **Una incidencia propuesta no se registra sin mirarla.** Las de facturas se proponen.
- **Lo leído de una foto o un PDF se contrasta** con el otro documento (placa ↔ factura ↔ RITE).
- **No se duplica** una foto ni una factura; **no se pisa** lo que escribió una persona.
- **Nada personal en esta skill** (repo público): ni DNI, ni IBAN, ni teléfonos.

## Caso de referencia — 26RES060_178 (08/10/2026)

Zip del instalador con 2 facturas al 50 % (una por copropietario), una factura de acometida
eléctrica de otra empresa, certificado RITE + memoria, 5 fotos de antes y 12 de después.

| Hallazgo | Qué se hizo |
|---|---|
| El equipo instalado no era el simulado (Alfea Extensa **DUO** AI 10 → Extensa **S** 10 + termo Aeromax VS R290 200 aparte) | Alta de la Extensa S 10 con `alta-aerotermia` (id 574); ACS aparte; placas aplicadas con `equipo_id` |
| La Extensa S 10 solo publica clima medio (Keymark 012-C700396) | SCOP 4,53 medio (decisión del usuario); el CIFO decía «Cálido» → arreglado en `cifoDoc.js` |
| Placa de la caldera: año 1996 | Fila «gasóleo 1985-1997» (η 0,70), confirmado por el usuario |
| Facturas a nombre de dos copropietarios | Copropietaria cedente al 50 %: Convenio de 3 págs. y Anexo I de 8 (dos copias) |
| Oportunidad sin precio sellado (95 €/MWh de respaldo; propuesta a 103) | Precio fijado por el usuario en el Económico (100 €/MWh) |
| Fotos de caldera y placa ya subidas por WhatsApp | No se duplicaron |
| El lector de placas conservó la ficha y el EPREL de la DUO | Corregidos; arreglado en `placasInstalacion.js` |
| El «Guardar en Drive» del Convenio no lo enlazaba | Enlazado con el `PUT`; arreglado en `AnexoCesionModal.jsx` |
| CEE final hecho primero «desde la medida» con el consumo del inicial (1,84 kWp, sin frío, sin inversión) | **Rechazado por el usuario**. Rehecho COPIANDO el inicial con las instalaciones instaladas (`cee_final_copiando.js`): B (19,3) / C (113,92); autoconsumo 10,61 kWp a 10.610 €, 12.074 → ~12.012 kWh tras el ajuste de CE3X |
| El catálogo de la Extensa S 10 no tenía SEER | EER de la FT (2,8 a 35/18 °C) como SEER: refrigeración al 280 % |
