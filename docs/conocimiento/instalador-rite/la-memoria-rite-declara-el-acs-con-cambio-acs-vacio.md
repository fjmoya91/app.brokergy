# La Memoria RITE declara el ACS aunque `cambio_acs` esté vacío, si hay equipo de ACS (2026-11-20)

Caso: 26RES080_41 (ALICIA PARRA RUBIO). La memoria se mandó a Paloma (oficina de José Vicente Ruiz)
SIN el ACS, y ella preguntó si había agua caliente: la había, una bomba de calor de ACS independiente
Mundoclima MUACS-190-H14 de 185 L. `instalacion.cambio_acs` estaba vacío (`null`).

## Qué pasaba

- El generador (`rite-generator/lib/supabase_client.py`, `normalizar`) solo declaraba ACS con
  `cambio_acs` verdadero: un `null` se leía como «sin ACS». Así se quedaban sin marcar la casilla de ACS
  del objeto, la acumulación y el modo de ACS.
- La validación previa del backend (`validateMemoriaRite`, `utils/riteValidation.js`) hacía lo mismo,
  con su propia comparación (`=== true || === 'si'`).
- El resto de la app no piensa así: `acsEnAlcance` (frontend, `aerotermiaUnits.js`) da el ACS en alcance
  con `cambio_acs !== false`. Medido el 20/11/2026 sobre los expedientes con `cambio_acs` vacío: 36 no
  tienen equipo de ACS (migrados), 6 tienen `misma_aerotermia_acs` sin modelo y **23 tienen un modelo de
  ACS** declarado: esos salían sin ACS en la memoria.

## Qué se hizo

**REGLA — con `cambio_acs` vacío (`null`, sin la clave o `''`), la Memoria RITE declara ACS si hay un
EQUIPO de ACS declarado** (`aerotermia_acs.modelo` o `aerotermia_acs.aerotermia_db_id`). `true`/`'SI'`
→ con ACS; `false`/`'NO'` → sin ACS, aunque haya equipo. No se usa `!== false` a secas porque los 36
migrados sin equipo marcarían una ACS de la que no hay nada que poner.

**REGLA — el backend y el generador deciden con la MISMA función y su espejo**: `acsEnAlcanceRite`
(`utils/riteValidation.js`) y `_acs_en_alcance` (`rite-generator/lib/supabase_client.py`). Si cambia
una, cambia la otra; la prueba las compara caso a caso.

**REGLA — los litros deducidos del NOMBRE del modelo solo valen si parecen un volumen.** Sin campo de
litros, `_acumulacion` busca primero un número con «L»/«litros» y si no, el primero de 2-4 cifras que
esté entre 80 y 1000 y no empiece por 0. Así se quedan los litros pegados al código
(«MANANTIAL150RPLUSB» → 150, «HP200M7-F9» → 200) y dejan de salir potencias o rangos como litros
(«ecoAIR+ 3-12 PRO» daba **12 L** en 25RES080_12; «CONFORT 12», «AI 16», «AUREA DUO 8 55» → en blanco,
y en blanco lo completa el instalador). Un número que empieza por 0 es parte de un código
(«WH-ADC0309K3E5B»), no un volumen.

## Lo que NO cambia

- Con el ACS fuera del alcance (`cambio_acs=false`, termo eléctrico) la memoria sigue sin ACS.
- Las memorias ya generadas no se rehacen solas. 26RES080_41 se rehízo a mano (y se puso
  `cambio_acs=true`) el 20/11/2026.

## Comprobación

`PYTHONIOENCODING=utf-8 node implementation/backend/scripts/test_acs_alcance_rite.js` — 11 casos de
alcance (backend = generador) y 19 de litros. En producción hace falta desplegar el backend **y** el
contenedor del rite-generator.
