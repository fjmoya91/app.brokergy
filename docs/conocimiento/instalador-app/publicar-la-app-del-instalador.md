# Publicar la app del INSTALADOR (y meter al siguiente en la beta) (2026-11-21)

## Publicar la app del INSTALADOR: el orden exacto, lo que se comprueba y cómo se apaga (2026-11-21)

**PUBLICADA el 21/11/2026** (Fran: «sácalo todo a producción sin que tenga que interactuar, ya lo
revisaré cuando hayas terminado todo»). Lo que se hizo ese día, por este orden, y lo que quedó:

- **Los dos SQL, ANTES de subir el código** (no después, como dice el paso 3 de abajo): el checkout y el
  VPS los comparten muchas sesiones y cualquiera puede lanzar un deploy por otro motivo; con el código en
  `main` y sin el SQL, ese deploy rompería la galería del escaparate. El código viejo funciona igual con
  el esquema nuevo. Comprobación: `3 · true · 1 · true · true · true · 0` y las 2 fotos que había,
  `PUBLICADA`.
- `main` = `3c157af4` (avance directo desde `b16e97c3`), `deploy.sh` sin errores, y tras él: el CRM abre,
  las rutas sin sesión dan 401, brokergy.es lee el marketplace (200 con su `Allow-Origin`, sin
  credenciales), un origen desconocido recibe 403, app.brokergy.es y cee.brokergy.es como siempre.
- Variables en el VPS (copia previa en `.env.bak-20261121-app-instalador`): `APP_INSTALADOR_SECRET`
  (generada en el servidor), `DRIVE_FOLDER_ESCAPARATE` (carpeta nueva «ESCAPARATE - FOTOS DE
  INSTALADORES» dentro de «01. OPORTUNIDADES», al lado de la de plantillas de factura) y
  `APP_INSTALADOR_BETA` con RCA. Comprobado dentro del contenedor: `enBetaInstalador` da `true` solo
  para un INSTALADOR de RCA.
- La web (repo `brokergy-web`, `main` = `fd776bd`): publicada con el refresco al abrir ENCENDIDO. La
  ficha de Jose Vicente Ruiz enseña ya su pareja antes/después (las dos fotos que había publicado el
  ADMIN) y 47 fichas, «A qué se dedica».
- ⚠️ **RCA NO TIENE USUARIO en la app** (`prescriptores.representante_legal_id` vacío; solo 8 de los 106
  instaladores tienen uno): la beta está encendida pero nadie puede entrar todavía. Hay que crearle el
  acceso desde el CRM, con rol INSTALADOR. No se creó: una cuenta para un tercero la da de alta Fran.
- ⚠️ RCA no tiene **marcas autorizadas** (`marca_referencia` vacío): su Catálogo sale vacío hasta que se
  le pongan; y no hay ninguna tarifa cargada.
- El nginx del VPS sirve `/instalador/manifest.webmanifest` como `application/octet-stream` (también el
  de siempre): el navegador lo lee, pero avisa en la consola. No se tocó el `nginx.conf` (está editado a
  mano y no está en git).
- Sin hacer: el alta del partner (regla 217, commit local `254cd747` de otra sesión, pendiente del «sí»
  de Fran). Hasta que entre, una obra sin expediente abre la calculadora de siempre.

Lo de abajo es la hoja tal como se escribió antes de publicar; sirve para repetirlo en otro entorno y
para entender cada paso.

**REGLA — los dos SQL van ANTES del deploy, y la beta se enciende DESPUÉS de comprobar que los demás
usuarios ven lo de siempre.** El código nuevo ya lee las columnas nuevas (también la galería antigua del
escaparate, que filtra por `estado`): desplegar sin el SQL de la fase 3 rompería el escaparate que ya
está en producción.

### 0. Antes de empezar

- La rama de la app del instalador (fases 1 a 5) está mezclada en `main` y `main` pasa todo lo de «Tras
  tocarlo» de las reglas 230 a 235 y la 236 (`npm run build` incluido).
- El PC tiene la última `main` y nada sin commit que vaya a subir por error.

### 1. Los SQL, en Supabase (SQL editor), en este orden

1. [escaparate_revision_schema.sql](implementation/backend/scripts/escaparate_revision_schema.sql) (fase 3).
2. [aerotermia_tarifas_schema.sql](implementation/backend/scripts/aerotermia_tarifas_schema.sql) (fase 4).

Los dos son aditivos e idempotentes: si uno falla a medias, se vuelve a lanzar entero. **Comprobación**
(solo lectura; tiene que salir `3 · true · 1 · true · true · true · 0`):

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
     AND table_name='instalador_fotos_escaparate' AND column_name IN ('estado','permiso_cliente','origen')),
  to_regclass('public.instalador_textos_escaparate') IS NOT NULL,
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
     AND table_name='prescriptores' AND column_name='zona_trabajo_publica'),
  to_regclass('public.aerotermia_tarifas') IS NOT NULL,
  to_regclass('public.aerotermia_tarifas_cargas') IS NOT NULL,
  to_regclass('public.instalador_precios_equipo') IS NOT NULL,
  (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='public'
     AND (table_name LIKE 'instalador_%' OR table_name LIKE 'aerotermia_tarifas%')
     AND grantee IN ('anon','authenticated'));
```

Y que las fotos que ya estaban publicadas lo siguen: `SELECT estado, count(*) FROM
instalador_fotos_escaparate GROUP BY 1;` → todas `PUBLICADA` (el DEFAULT las deja como estaban).

### 2. Las variables, en el `.env` del VPS (`/opt/brokergy/implementation/backend/.env`)

| Variable | Valor | Qué hace | Sin ella |
|---|---|---|---|
| `APP_INSTALADOR_SECRET` | una cadena larga y aleatoria NUEVA (`openssl rand -hex 32`) | firma la **llave** de las miniaturas ([utils/llaveObra.js](implementation/backend/utils/llaveObra.js)), de obra y del escaparate | usa `SUPABASE_SERVICE_ROLE_KEY`: funciona, pero mezcla secretos |
| `DRIVE_FOLDER_ESCAPARATE` | el id de una carpeta de Drive NUEVA para las fotos sueltas (crearla a mano, dentro de la unidad de BROKERGY) | las fotos que el instalador sube del móvil van a `<carpeta>/<id_empresa>/` | no se sube ninguna foto suelta (las de sus obras sí se proponen) |
| `ESCAPARATE_AVISOS_ENABLED` | **no ponerla** (o `false`) | avisos al instalador al aprobar o rechazar | apagado: no se envía nada (lo decidido en la fase 3) |
| `WEB_RED_BASE` | no hace falta | base de «Ver mi página» | `https://brokergy.es/encuentra-tu-instalador` |
| `APP_INSTALADOR_BETA` | **todavía no**: se pone en el paso 5 | quién ve la app nueva | nadie la ve |

La beta va al final a propósito: con el código desplegado y la variable vacía, **todo el mundo ve lo de
siempre**, y eso se comprueba antes de encenderla.

### 3. El deploy de la app

En el PC, con todo en `main`: `git push origin main`. En el VPS:

```bash
ssh root@187.77.93.213
cd /opt/brokergy && bash scripts/deploy.sh
```

`deploy.sh` reconstruye y levanta el backend, así que lee el `.env` nuevo. **Comprobaciones** (desde el
PC):

- `https://app.brokergy.es` abre y el ADMIN ve el CRM de siempre; un partner que no está en la beta ve
  su panel de siempre.
- El CORS nuevo (regla 235):
  `curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://brokergy.es" https://app.brokergy.es/api/public/marketplace/stats`
  → **200** con `Access-Control-Allow-Origin: https://brokergy.es` (mirar con `-D -`) y **sin**
  `Access-Control-Allow-Credentials`. Con `-H "Origin: https://ejemplo.com"` → **403**, no 500. Y desde
  `https://app.brokergy.es` el CRM sigue funcionando (si fallase el inicio de sesión, es esto).
- La ruta de la página: `curl -s https://app.brokergy.es/api/public/marketplace/red/<slug>/pagina` → 200
  (el `<slug>` es el de `src/data/red.json` de brokergy-web para RCA, no se adivina) o 404 si RCA aún no
  sale en la red. Ya no tiene que dar el 404 de «ruta no existe» de antes del deploy.
- El manifest de la app: `curl -sI https://app.brokergy.es/instalador/manifest.webmanifest` → 200. Los
  demás siguen con `/site.webmanifest`: la app del instalador cambia el suyo **solo al montarse**.

### 4. La primera tarifa (opcional, puede ir después)

CRM → Aerotermia → «Cargar tarifa (Excel)»: «Leer» (en seco), revisar el plan, «Guardar». Sin tarifa,
el catálogo del instalador dice «Sin tarifa todavía» (nunca 0). Sin `marcas_autorizadas` en la ficha de
RCA no ve ningún equipo: revisarlas antes.

### 5. Encender la beta para RCA

En el `.env` del VPS:

```
APP_INSTALADOR_BETA=113a5765-84fb-4012-a17c-1a275aec530c
```

y `cd /opt/brokergy && docker compose up -d --force-recreate backend` (no hace falta recompilar el
frontend). **Comprobaciones**: con un usuario de RCA (rol INSTALADOR), `GET /api/usuarios/me` trae
`app_instalador: true` y la app abre en «Hola, …»; con cualquier otro usuario, `false` y lo de siempre.

### 6. La web pública (repo `brokergy-web`, aparte)

La rama de la web que pinta las fotos y los textos (`claude/ficha-instalador-fotos-textos-14764d`) tiene
que estar en su `main`; sus pasos, en su `docs/FOTOS-INSTALADOR.md`. Resumido: en el PC,
`npm run red-paginas` → tiene que decir «… refresco al abrir **ENCENDIDO**» (lo enciende solo si la ruta
responde y el CORS de la app deja a brokergy.es, que ya lo hace desde la fase 5); `npm run build &&
npm run preview` para mirar la ficha de RCA; subir `src/data/red-paginas.json` y publicar como siempre
(`git push origin main`, `git push vps main`, `ssh root@187.77.93.213 "bash
/opt/brokergy-web/scripts/publicar-vps.sh"`). Hasta que un ADMIN apruebe algo, la ficha sale igual que
antes.

### La primera vez con RCA: qué mirar con él delante

1. Entra con su usuario de siempre en el móvil: ve «Hola, …», su logo y su nombre «con BROKERGY» arriba,
   y lo que le toca. El número de «Te toca» coincide en Inicio, en el filtro de Obras y en el globo del
   menú.
2. «Ponla en tu pantalla de inicio» → «Ponerla» (Android) o las instrucciones (iPhone); al abrirla desde
   el icono, sin barra del navegador y con el fondo crema al arrancar.
3. Abre una obra, recarga: sigue en la obra. «Atrás» del móvil: a la lista, no fuera de la app.
4. Le mandamos por WhatsApp el enlace de una obra suya (`https://app.brokergy.es/?obra=<nº>`): la abre
   tras iniciar sesión.
5. Firma un CIFO o sube un RITE de una obra real **suya** (es la primera escritura real de la app: mirar
   después la obra en el CRM).
6. «Tu página web»: propone dos fotos de una obra, con el permiso del cliente marcado; un ADMIN las
   aprueba desde Partners → su ficha; salen en brokergy.es al siguiente `red-paginas` (o al abrir la
   ficha, con el refresco encendido).
7. Catálogo: ve solo sus marcas; cambia su precio de un equipo; «Calcular una obra con este equipo».
8. Modo avión: «Sin conexión» y «Volver a intentarlo»; al volver la cobertura, se recarga solo.
9. «Compartir» su página: en su móvil, el menú de compartir del sistema (`navigator.share`).

### Apagarla (si algo va mal)

Quitar `APP_INSTALADOR_BETA` del `.env` (o dejarla vacía) y `docker compose up -d --force-recreate
backend`. RCA vuelve al panel de partner de siempre en su siguiente carga de página; nada de lo que haya
hecho se pierde (la app escribe por las mismas rutas que los enlaces, regla 231). Los SQL **no se
deshacen**: son aditivos y lo de siempre no los nota. Si fuera el CORS lo que falla, revertir el commit
de la regla 235 y desplegar.

### Lo que no se ha podido comprobar antes de publicar

- Nada contra la BD real con los SQL aplicados (sin aplicar a propósito) ni con una sesión de verdad: el
  inicio de sesión con un enlace directo, el globo de «Te toca» con datos reales, la primera firma.
- La instalación en un iPhone y un Android de verdad (en el PC, Chrome sin pantalla **sí** ofrece
  instalarla: el manifest es válido), el color de la barra de estado y la pantalla de arranque.
- `navigator.share` en un móvil.
- La subida real a Drive de una foto suelta (sin `DRIVE_FOLDER_ESCAPARATE` en local).
- Que el nginx del VPS sirva `.webmanifest` con su tipo (`application/manifest+json`); si no, el
  navegador lo lee igual pero avisa en la consola.

## Meter al SIGUIENTE instalador en la beta (2026-11-21)

**REGLA — un instalador entra en la beta con UNA línea: su `id_empresa` en `APP_INSTALADOR_BETA`; nada
más cambia, y sale quitándolo.** Fran: «al final va a ser una aplicación para cada uno de ellos, pero
vamos a empezar con la de RCA».

1. Que sea **instalador**: su ficha en Partners con tipo INSTALADOR y sus usuarios con rol INSTALADOR. El
   DISTRIBUIDOR no entra nunca (`enBetaInstalador`).
2. Su `id_empresa`: `SELECT id_empresa, razon_social FROM prescriptores WHERE razon_social ILIKE '%…%';`
   (se comprueba el nombre antes de copiarlo).
3. Antes de encenderla, en su ficha: **logo** (cuadrado o casi; sale a 40 px), **color** de su landing
   (`landing_color_primary`: si no llega a 4,5:1 sobre el crema, la app usa sola el de BROKERGY; con
   `node implementation/backend/scripts/test_navegacion_instalador.mjs` se ve qué hace con cada color),
   **marcas autorizadas** (sin ellas el catálogo sale vacío) y su `landing_slug` si va a tener página.
4. Añadirlo a la variable, separado por comas, y recrear el backend:
   `APP_INSTALADOR_BETA=113a5765-84fb-4012-a17c-1a275aec530c,<id_nuevo>` →
   `docker compose up -d --force-recreate backend`.
5. La lista de «La primera vez» de arriba, con él.

El nombre y el icono de la app instalada son los de BROKERGY para todos (ver la fase 5: un nombre por
instalador pediría servir su manifest sin sesión o con un token en la URL).
