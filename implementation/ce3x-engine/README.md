# ce3x-engine — el motor de CE3X 3.2 en el servidor

Califica un `.cex` en el VPS, calcula sus medidas, ajusta el autoconsumo mes a mes y escribe el XML,
sin depender de que el PC de Fran esté encendido. Es **el mismo motor y los mismos scripts** que en el
PC (`cee-engine/tools/oraculo_ce3x/*.py`): el Python 2.7 de CE3X y su código compilado, sin ventana,
con Wine de 32 bits. El PDF lo sigue haciendo el servicio `xml2cert`.

Detalle, medidas y porqué: [docs/conocimiento/cee-generacion/el-motor-de-ce3x-en-el-servidor.md](../../docs/conocimiento/cee-generacion/el-motor-de-ce3x-en-el-servidor.md).

## Cómo se usa

El backend y el asistente lo llaman solos cuando tienen `CE3X_URL` (`services/cee/cexAPdf.js`):

```
CE3X_URL=http://ce3x-engine:8096      # en implementation/backend/.env del VPS
```

- `POST /oraculo` `{ script, env, ficheros }` → `{ s, salida, ficheros, codigo, plazo, ms }`
- `GET /salud` → `{ ok, listo, ce3x_abierto, version, ocupado, en_cola }`

Uno a la vez (cola de 10; llena, 503). Sin puertos publicados: solo lo ve la red `brokergy`.

## CE3X no va en el repo

El repo es público y CE3X (IDAE/MITECO) es gratuito pero sin licencia libre. Se sube **una vez** la
carpeta instalada del PC al VPS, y el build la toma como contexto con nombre
(`docker-compose.yml` → `additional_contexts`):

| Contexto | En el PC | En el VPS |
|---|---|---|
| `ce3x_programa` | `C:\Program Files (x86)\CE3Xv3.2` | `/opt/brokergy-ce3x/programa` |
| `ce3x_documentos` | `C:\Users\Public\Documents\CE3X3.2` | `/opt/brokergy-ce3x/documentos` |
| `oraculo` | `implementation/cee-engine/tools/oraculo_ce3x` | (el repo) |

### Subir CE3X al VPS (una vez, y al actualizar CE3X)

Desde el PC, en PowerShell:

```powershell
ssh root@187.77.93.213 "mkdir -p /opt/brokergy-ce3x"
scp -r "C:\Program Files (x86)\CE3Xv3.2" root@187.77.93.213:/opt/brokergy-ce3x/programa
scp -r "C:\Users\Public\Documents\CE3X3.2" root@187.77.93.213:/opt/brokergy-ce3x/documentos
```

Luego, en el VPS: `cd /opt/brokergy && bash scripts/deploy.sh` (construye `ce3x-engine` si existe
`/opt/brokergy-ce3x/programa/python27.dll`), y para ENCENDERLO, `CE3X_URL=http://ce3x-engine:8096` en
`implementation/backend/.env` y `docker compose up -d backend asistente`. Para apagarlo, quitar esa
línea y lo mismo: todo vuelve al PC.

## Build en local (Windows, Docker Desktop)

```
cd implementation/ce3x-engine
docker build -t brokergy-ce3x-engine:local --build-context oraculo=../cee-engine/tools/oraculo_ce3x \
  --build-context "ce3x_programa=C:/Program Files (x86)/CE3Xv3.2" \
  --build-context "ce3x_documentos=C:/Users/Public/Documents/CE3X3.2" .
docker run -d --name ce3x-local -p 127.0.0.1:8096:8096 brokergy-ce3x-engine:local
```

(Desde Git Bash, con `MSYS_NO_PATHCONV=1` delante.) El build **se autoprueba**: califica el ejemplo
oficial «2 Vivienda dentro de bloque» y exige lo que da CE3X en el PC (E 40,03 / E 189,21, tres
medidas, XML); si no, no hay imagen. Imagen: ~3,6 GB.

## Ficheros

- `host.c` / `host.rc` — el arnés en C (MinGW 32 bits) que carga `python27.dll` de CE3X y ejecuta el
  script (`ce3xpy.exe`, como el del PC). Lleva incrustado el manifiesto de Visual C++ 2008
  (`vc90.manifest`, sin él `wx` no carga). El motor solo abre un `.cex` con **CE3X 3.2 abierto**:
  `servidor.js` lo arranca oculto en la pantalla virtual y lo mantiene abierto (ver el documento).
- `preparar.sh` — las claves del registro que deja el instalador de CE3X.
- `servidor.js` — el servicio. `autoprueba.js` — la prueba del build. `arrancar.sh` — Xvfb + servicio.

Tras tocarlo: el build (autoprueba) y `node implementation/backend/scripts/test_ce3x_servidor.js`.
