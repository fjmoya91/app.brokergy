---
paths:
  - "implementation/backend/services/*Ocr*.js"
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

_Esta área no tiene reglas numeradas: mandan las «REGLA —» de sus documentos, abajo._

<!-- generado:inicio — no se edita a mano: `node scripts/conocimiento.mjs regenerar` -->

## Documentos del área (nivel 3)

- `docs/conocimiento/infra/la-api-de-gemini-va-en-nivel-de-pago.md` — La API de Gemini va en NIVEL DE PAGO (2026-09-01) · 2,2 KB

## Las «REGLA —» que contienen esos documentos

> Son sus frases en negrita, copiadas tal cual. El porqué y los casos, en el documento.

- `docs/conocimiento/infra/la-api-de-gemini-va-en-nivel-de-pago.md`
  - **REGLA — el nivel gratuito NO puede usarse con documentos de clientes.**

<!-- generado:fin -->
