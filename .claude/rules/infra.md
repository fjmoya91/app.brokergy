---
paths:
  - "implementation/backend/services/*Ocr*.js"
  - "implementation/backend/services/botCerebro.js"
  - "implementation/backend/utils/geminiAjustes.js"
  - "implementation/backend/services/{googleService,driveService,emailService}.js"
  - "implementation/backend/server.js"
  - "docker-compose*.yml"
  - "scripts/deploy.sh"
---
# Infraestructura — Gemini (nivel de pago), lectores con IA, Drive, email y servidor (nivel 2)

> Esta regla se carga SOLA cuando se lee o edita un fichero de esta área. Es lo que no se puede
> romper; el detalle (el porqué, lo medido, los casos) está en `docs/conocimiento/infra/`.
> Antes de cambiar el comportamiento de algo, lee el documento de su tema (lista al final).
> Las rutas de los enlaces son relativas a la raíz del repo.

## Reglas críticas (texto íntegro)

121. **Lo que se le manda a Gemini sobre RAZONAMIENTO y TEMPERATURA lo decide `ajustesGemini`, nunca el lector** (2026-10-07). Google retira `thinkingBudget` y `temperature`/`topP`/`topK`: en los modelos que vengan darán `400 INVALID_ARGUMENT`, y todos los lectores los mandaban, así que un cambio de `GEMINI_MODEL` los tumbaba a la vez. Cada `generationConfig` mezcla `...ajustesGemini(modelo, { pensamiento, temperatura })` ([utils/geminiAjustes.js](implementation/backend/utils/geminiAjustes.js)): la serie 2.x sigue con `thinkingBudget` (`thinkingLevel` le da 400), Gemini 3 o posterior va con `thinkingLevel` (`minimal` solo en los Flash hasta la 3.6; desde la 3.7, `low`) y la temperatura solo se manda antes de la 3.6 (desde ahí se ignora). Medido modelo a modelo el 07/10/2026. Antes de cambiar un modelo: `node implementation/backend/scripts/test_gemini_ajustes.js --vivo <modelo>`. Ver "El RAZONAMIENTO y la TEMPERATURA de Gemini, según el modelo".

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/infra/la-api-de-gemini-va-en-nivel-de-pago.md` — La API de Gemini va en NIVEL DE PAGO (2026-09-01) · 2,2 KB
- `docs/conocimiento/infra/razonamiento-y-temperatura-segun-el-modelo.md` — El RAZONAMIENTO y la TEMPERATURA de Gemini, según el modelo (2026-10-07) · 3,7 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/infra/la-api-de-gemini-va-en-nivel-de-pago.md`
  - **REGLA — el nivel gratuito NO puede usarse con documentos de clientes.**
- `docs/conocimiento/infra/razonamiento-y-temperatura-segun-el-modelo.md`
  - **REGLA — ningún lector escribe `thinkingConfig` ni `temperature` a mano**

<!-- generado:fin -->
