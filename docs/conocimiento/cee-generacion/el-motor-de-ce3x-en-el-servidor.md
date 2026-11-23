<!-- conocimiento · área: cee-generacion · las rutas de los enlaces son relativas a la raíz del repo -->

## El motor de CE3X en el SERVIDOR: calificar sin el PC encendido (2026-11-23)

**Lo que se pidió** (Fran, 23/11/2026): «Lo que mejor sea para que se pueda hacer en el VPS sin el PC
encendido». Hasta ese día, todo lo que necesita el motor de CE3X pasaba por el PC de Fran: calificar
un `.cex`, calcular sus medidas, ajustar el autoconsumo mes a mes y sacar su XML. Eso incluye
`calificar_ext` de la app de certificadores, `calificar_op` de la oportunidad con el bono bajo (regla
242) y `cexAPdf.calificarCex`. Con el PC apagado o con la sesión caducada (20/11), todo se quedaba
«por calificar». El PDF de un XML ya lo hacía el VPS desde el 31/10, con el servicio `xml2cert`.

### Lo que hay

- **El servicio `ce3x-engine`** ([implementation/ce3x-engine](implementation/ce3x-engine)), en el
  `docker-compose.yml` con `profiles: ["ce3x"]`. Es el MISMO CE3X 3.2 del PC (su Python 2.7 y su código
  compilado), con Wine de 32 bits y una pantalla virtual (Xvfb). Ejecuta los MISMOS scripts del oráculo
  (`cee-engine/tools/oraculo_ce3x/*.py`, como `cex_a_xml.py` o `medida_previsto.py`) con un arnés en C
  (`host.c`, compilado con MinGW).
  - `POST /oraculo` recibe `{script, env, ficheros}` y devuelve `{s, salida, ficheros}`.
  - Atiende uno a la vez, con una cola de 10; con la cola llena, 503.
  - No publica puertos: solo lo ve la red `brokergy`.
- **El interruptor es `CE3X_URL=http://ce3x-engine:8096`** en `implementation/backend/.env` del VPS. Lo
  leen el backend y el asistente.
  - `cexAPdf.js` (`disponible`, `correrOraculo`) manda los ficheros de la carpeta temporal y recibe los
    que salen. Por eso todo lo que ya llamaba a `calificarCex`, `ponerPrevistoComoMedida` o
    `cex_a_pdf.js` funciona igual en el VPS.
  - Si el servicio no responde, devuelve `noResponde`, como si no hubiera CE3X: nunca una calificación
    inventada.
  - Sin la variable, todo sigue yendo al PC.
- **La cola del PC tiene un PC más, `SERVIDOR`.** Con `CE3X_URL`, `encolarCalificarExt` y
  `encolarCalificarOp` encolan con `destino: 'SERVIDOR'` (`DESTINO_CALIFICAR`). El vigía del asistente
  corre cada minuto `asistente_pc.js vuelta` con `PC_NOMBRE=SERVIDOR` (`vueltaCe3xServidor`).
  - Esa vuelta solo coge los trabajos FIJOS (`calificar_ext`, `calificar_op`), nunca `presentar` ni un
    `ce3x` con Claude.
  - No da latido (no es un PC que se apaga) y no vacía el buzón del PC.
  - El mensaje a Fran es el de siempre, pero dice «Califico … aquí, en el servidor». La franja de la
    casa sigue valiendo para `calificar_op` (regla 205).
  - El `/estado` del vigía dice `calificando`, y `deploy.sh` no reconstruye el asistente a mitad de una
    calificación.

### REGLA — en el servidor, CE3X se mantiene ABIERTO, oculto, como en el PC

El motor de CE3X solo abre un `.cex` si hay un proceso `ce3xv3.2.exe`. Lo comprueba su propio código:
`Calculos/vg2.pyd` lanza `TASKLIST /FI "imagename eq ce3xv3.2.exe"` y pone
`__builtin__.modoDesarrolladorCompilada`. `vg3.getVG3()` lo mira y, sin él, `abreArchivoCEX` vuelve sin
leer nada y sin decir nada. Es lo que se había medido el 02/10/2026 («solo abre con CE3X abierto»);
el 23/11/2026 se encontró el mecanismo.

Había dos maneras de cumplirlo en el servidor:

- llamar al arnés `ce3xv3.2.exe`, que califica sin ninguna ventana (medido);
- **tener CE3X abierto de verdad**, oculto en Xvfb, como hace `cexAPdf.js` en el PC.

Se eligió la segunda. La primera es usar el nombre del programa para pasar su comprobación, y no
hacía falta.

- `servidor.js` (`abrirCe3x`) lo arranca antes del primer trabajo y lo mantiene abierto.
- Si un trabajo se pasa de plazo, `wineserver -k` lo cierra todo y CE3X se vuelve a abrir en el
  siguiente.
- Un `NO_ABRE` se reintenta hasta 3 veces, con 8 s entre medias: es lo que pasa si CE3X aún no había
  terminado de arrancar.
- El arnés se llama `ce3xpy.exe`, como en el PC.

### REGLA — nunca un `wineserver -p` suelto, y `/tmp` limpio al arrancar

Esto se midió en un contenedor recién creado.

- Con un `wineserver -p` lanzado antes de la primera sesión de Wine, el primer trabajo se colgaba al
  salir o fallaba con `'wxFrame1' object has no attribute 'barraEstado'`.
- Con los restos del build en `/tmp` (`.X99-lock`, `.X11-unix`, `wine-*`), X decía «invalid window».

Por eso `arrancar.sh` limpia `/tmp`, levanta Xvfb y espera a su socket antes de arrancar el servicio.
El Dockerfile limpia `/tmp` al acabar la autoprueba, y `calentar` califica el ejemplo oficial antes de
aceptar trabajo:

- `/salud` da `listo: false` hasta entonces;
- un trabajo que llega antes espera a que termine;
- si tres intentos fallan, contesta 503.

### REGLA — al servicio se le llama con `http.request`, no con `fetch`

El `fetch` de Node (undici) corta a los 300 s esperando las cabeceras (`headersTimeout`), por mucho
`AbortSignal` que se le dé. Un previsto RES080 o una cola de dos trabajos pasan de eso. `postJson`, en
`cexAPdf.js`, espera lo que dice `ESPERA_CE3X_MS` + 60 s.

### Lo medido (23/11/2026, en el PC con Docker Desktop y la misma imagen que irá al VPS)

- **Cuatro `.cex` reales** (D, A, B y C de la prueba), con CE3X abierto: 10-13 s cada uno.
  - El JSON sale idéntico al de Windows en los cuatro.
  - El XML de A, C y D tiene 0 líneas distintas una vez quitados los UUID, que CE3X saca nuevos cada
    vez. B no saca XML en ninguno de los dos.
  - Con el arnés renombrado y sin ventana tardaban 12-25 s y daban lo mismo.
- `cex_a_pdf.js` con `CE3X_URL`, sobre una carpeta con tildes y eñes: XML y PDF en 17 s.
- El build se autoprueba con el ejemplo oficial «2 Vivienda dentro de bloque»: E 40,03 / E 189,21,
  tres medidas y XML. Si no da eso, no hay imagen.
- La imagen pesa ~3,6 GB y el contenedor ocupa ~300 MB de RAM con CE3X abierto.
- Arrancar en frío lleva 24-25 s, y lo mismo tras un `docker restart`: ~12 s para abrir CE3X y el
  ejemplo calificado.
- Con CE3X cerrado a la fuerza (`wineserver -k`), el siguiente trabajo lo vuelve a abrir y califica en
  23 s.

### CE3X no va en el repo

El repo es público y CE3X (IDAE/MITECO) es gratuito, pero no tiene licencia libre. La carpeta
instalada del PC se sube **una vez** al VPS, a `/opt/brokergy-ce3x/{programa,documentos}`, y el build
la toma como contexto con nombre (`additional_contexts`). `deploy.sh` construye `ce3x-engine` solo si
existe `/opt/brokergy-ce3x/programa/python27.dll`. Si el build falla, se queda el de antes y lo dice.
Los comandos de subida, encendido y apagado están en el [README del servicio](implementation/ce3x-engine/README.md).

### REGLA — lo que pide CE3X por WhatsApp pasa por el ENRUTADOR, y con el servidor respondiendo se hace AQUÍ

**Lo que se pidió** (Fran, 23/11/2026, tras el despliegue): «O un enrutador para que desde WSP se haga
en el VPS. Si la memoria del PC local va cargada también».

Los trabajos `ce3x` con Claude (`cee_final`, `calificar` con decisiones) iban siempre a la cola del PC,
donde un `claude -p` los hacía con la skill. El Claude del WhatsApp ya tiene en el VPS todo lo que hace
falta: las skills, el repo, el `.env`, el motor y CE3X. La memoria del PC también está, porque la tarea
«Brokergy Memoria Asistente» del PC la sincroniza cada 3 h. Así que encolar era esperar al PC sin
necesidad.

`asistente_pc.js ce3x <nº> --trabajo …` decide con `dondeTrabajoCe3x`:

| Caso | Dónde |
|---|---|
| `--pc NOMBRE` | a ese PC, aunque el servidor responda (lo ha pedido Fran) |
| sin `CE3X_URL` | al PC («aquí no hay CE3X») |
| `saludServidor()` ok (`/salud` con `listo`) | **aquí**: imprime `@@HAZLO_AQUI <nº>` y los pasos |
| el motor no responde, da error o está arrancando | al PC, y el mensaje a Fran dice por qué |

Con `@@HAZLO_AQUI` no se encola nada. El Claude del WhatsApp sigue en su sesión los pasos de
`textoHazloAqui`, que son los mismos del PC pero sin la ruta `C:\…` de la skill («sigue la skill
generar-cee-final entera»). Las decisiones de Fran van dentro. Al acabar, se lo cuenta a Fran él mismo:
no hay vuelta que mande el mensaje final.

Los RES080 siguen sin comando único, aquí y en el PC.

### Lo que queda en el PC

Presentar en el Registro (certificado, AutoFirma, tarjeta) y firmar siguen yendo al PC. También va al
PC lo de CE3X cuando el servidor no responde o Fran lo pide con `--pc`.

**Otro PC encendido** (el de presentar, por ejemplo) puede certificar también. La cola ya admite
varios: cada uno tiene su `PC_NOMBRE` y su latido, y `PC_CE3X` vacío deja que lo coja cualquiera.
Para eso ese PC necesita:

- la copia `brokergy-pc` del repo con su `.env`;
- CE3X 3.2 y `ce3xpy.exe`;
- el motor;
- la tarea «Brokergy Trabajos PC».

Con el enrutador, ese PC solo hace falta cuando el servidor no responde.

Ojo: con `CE3X_URL` puesta, todo lo que llama a `calificarCex` en el backend del VPS califica allí, y
eso incluye `ceeCiego.js` si `CEE_CIEGO_ENABLED` está encendido.

Pruebas:

- `node implementation/backend/scripts/test_ce3x_servidor.js`: cola temporal y un ce3x-engine de
  mentira. Comprueba qué trabajos coge el SERVIDOR, el destino al encolar, los ficheros que van y
  vuelven y los casos `NO_ABRE`, 503 y servicio caído. También el enrutador: `saludServidor` (listo,
  arrancando, HTTP 500, caído), `dondeTrabajoCe3x` (aquí, al PC, `--pc`, sin `CE3X_URL`) y que
  `textoHazloAqui` lleve la marca y las decisiones y no lleve rutas de Windows.
- El build de la imagen, que se autoprueba.
