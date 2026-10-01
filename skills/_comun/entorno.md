# Dónde se ejecutan los comandos (Claude Code o Cowork)

Esta skill es LA MISMA en Claude Code y en Cowork: la fuente está en el repo
(`C:\Proyectos\app.brokergy\skills\`) y se publica a la cuenta de claude.ai, que es de donde la cargan
los dos. Lo que cambia es **por dónde se lanzan los comandos**.

Los scripts (`node scripts/...` desde `implementation/backend`) necesitan tres cosas que solo están
en el PC de BROKERGY: el **repo**, su **`.env`** (Supabase, Drive, Gemini) y el **motor**
(`cee-engine`, en `http://127.0.0.1:8090`). Por eso:

## En Claude Code (pestaña Code de la app, con el repo abierto)

- Los comandos van por la herramienta de shell, desde la raíz del repo:
  `cd implementation/backend && node scripts/<script> ...`
- El motor: `preview_start` con el nombre `cee-engine` (está en `.claude/launch.json`).

## En Cowork

**NUNCA en el sandbox de Cowork.** Es una máquina aparte: no tiene el `.env`, no llega al motor del
PC (`127.0.0.1` allí es el propio sandbox) y su red está filtrada. Un script lanzado ahí falla o,
peor, responde con datos vacíos que parecen buenos.

Los comandos van por **Desktop Commander** (plugin instalado en la cuenta), que los ejecuta EN EL PC
con PowerShell:

```
start_process  →  cd C:\Proyectos\app.brokergy\implementation\backend; node scripts\<script> ...
```

- Rutas **absolutas de Windows** y `;` para encadenar (PowerShell 5.1 no tiene `&&`). Sin `2>&1`:
  PowerShell convierte cada línea de stderr en un «NativeCommandError» rojo aunque el script haya
  ido bien; la salida de error ya llega sola.
- Para leer lo que deja un comando (un `plano.png`, una foto, un JSON): `read_file` de Desktop
  Commander con la ruta absoluta. Las salidas de trabajo, en
  `C:\Proyectos\app.brokergy\implementation\backend\scratch\<skill>\<clave>\` (no se sube a git).
- Un `plan.json` que haya que pasarle a un script se escribe con `write_file` de Desktop Commander
  en esa misma carpeta, no en el sandbox: el script corre en el PC y no ve los ficheros de Cowork.

### El motor (`cee-engine`)

Antes de lo que lo necesite, comprueba que está levantado:

```
start_process  →  Invoke-RestMethod http://127.0.0.1:8090/health
```

Si no responde, arráncalo (es un proceso largo: no esperes a que termine, solo a que `/health`
conteste):

```
start_process  →  cd C:\Proyectos\app.brokergy\implementation\cee-engine; python -m uvicorn server:app --host 127.0.0.1 --port 8090
```

⚠️ `rite-generator` usa el MISMO puerto 8090: si `/health` contesta pero no es el motor, para el
otro primero. Y si `/health` dice que el código cargado no es el del disco (`codigo_at` ≠
`codigo_en_disco_at`), reinícialo: estarías probando la versión anterior.

### Si no hay Desktop Commander, o el PC está apagado

Dilo y para. **No intentes reproducir el script a mano en el sandbox** ni inventar su resultado: lo
que escribe en Supabase y en Drive tiene que salir de las mismas funciones que usa la app. Lo que
sí se puede hacer sin el PC son las consultas de lectura por el MCP BROKERGY y por el conector de
Supabase; si la skill tiene un camino «sin el repo», está descrito en ella.
