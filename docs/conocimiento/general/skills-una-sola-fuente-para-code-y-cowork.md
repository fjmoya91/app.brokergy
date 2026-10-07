<!-- conocimiento · área: general · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## ⚠️ Skills: UNA sola fuente para Code y Cowork

Todas las skills de BROKERGY viven en **[skills/](skills/README.md)** del repo y en ningún otro sitio
(ni `.claude/skills/`, ni Drive, ni escritas a mano en Cowork). Code y Cowork las cargan de la
**cuenta de claude.ai**, así que se PUBLICAN ahí:

1. Se edita en `skills/<nombre>/` (lo común, en `skills/_comun/`).
2. `node scripts/skills.mjs empaquetar` → `skills/dist/<nombre>.skill`, y se envía con SendUserFile
   para que el usuario pulse «Guardar skill» (el hook `.claude/hooks/skill-editada.mjs` lo recuerda).
3. `node scripts/skills.mjs estado` confirma que la cuenta ejecuta lo del repo. Si dice
   «CUENTA + NUEVA», se editó en Cowork: `importar` antes de tocar nada.

El repo es público: nada de DNI, IBAN, teléfonos ni claves dentro de una skill. Las que ejecutan
scripts corren SIEMPRE en el PC (en Cowork, por Desktop Commander): ver `skills/_comun/entorno.md`.
