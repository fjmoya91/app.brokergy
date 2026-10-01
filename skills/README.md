# Skills de BROKERGY — una sola fuente para Claude Code y Cowork

**Aquí está la ÚNICA copia de cada skill.** No hay otra en `.claude/skills/`, ni en Drive, ni
escrita a mano en Cowork.

## Cómo llega una skill a Code y a Cowork

Las dos superficies de la app de escritorio cargan las skills de la **cuenta de claude.ai**
(«Mis skills»). Por eso este directorio NO se lee directamente: se **publica** en la cuenta y desde
ahí lo ejecutan Code y Cowork, el mismo fichero en los dos.

```
skills/<nombre>/   ──empaquetar──▶  skills/dist/<nombre>.skill  ──«Guardar skill»──▶  cuenta claude.ai
   (git, fuente)                        (no se sube a git)                              ├─ Cowork
                                                                                        └─ Claude Code
```

Si hubiera también una copia en `.claude/skills/`, Code vería DOS skills con el mismo nombre y
podrían ser versiones distintas: justo lo que esto evita.

## Las tres órdenes

```bash
node scripts/skills.mjs estado                 # qué está al día y qué falta publicar
node scripts/skills.mjs empaquetar             # .skill de las que no están al día
node scripts/skills.mjs importar <nombre>      # traer al repo lo editado en Cowork
```

`estado` compara cada skill con la copia que la app de escritorio sincroniza de la cuenta
(`%APPDATA%\Claude\local-agent-mode-sessions\skills-plugin\…`), que es lo que de verdad se ejecuta:

| Marca | Qué significa | Qué hacer |
|---|---|---|
| ✓ AL DÍA | La cuenta ejecuta exactamente lo del repo | nada |
| ↑ DESACTUALIZADA | El repo tiene cambios sin publicar | `empaquetar` y publicar |
| + NO PUBLICADA | No existe en la cuenta | `empaquetar` y publicar |
| ↓ CUENTA + NUEVA | Se editó en Cowork después que en el repo | `importar`, revisar el diff, commit |

**Publicar** = abrir el `.skill` y pulsar «Guardar skill» (en Code, Claude te lo envía con la tarjeta
del fichero), o claude.ai → Ajustes → Capacidades → Skills → subir. Mismo nombre = sustituye a la
anterior. `empaquetar` se niega a publicar encima de una versión de la cuenta más nueva que el repo.

## Reglas

1. **Se edita AQUÍ.** Si se retoca una skill en Cowork (skill-creator), lo siguiente es `importar`.
   Un hook de Code (`.claude/hooks/skill-editada.mjs`) recuerda publicar cada vez que se toca algo
   de `skills/`.
2. **El repo es PÚBLICO.** Nada de DNI, IBAN, teléfonos, claves ni tokens en una skill: los ejemplos
   con un expediente real, sin los datos personales de nadie.
3. **Lo común va en `_comun/`** y el empaquetador lo copia como `comun/` dentro de cada skill que
   lo cite (`[comun/entorno.md](comun/entorno.md)`). Así hay una sola copia y viaja en el `.skill`.
4. **El frontmatter cumple los límites de claude.ai**: `name` = nombre de la carpeta (minúsculas y
   guiones, ≤ 64) y `description` ≤ 1.024 caracteres. `estado` lo comprueba.
5. **Las skills que ejecutan scripts** (`generar-cee-inicial`, `generar-cee-final`, `revisar-cee`)
   corren SIEMPRE en el PC: en Code por la shell, en Cowork por Desktop Commander, nunca en el
   sandbox de Cowork. Ver [_comun/entorno.md](_comun/entorno.md).
