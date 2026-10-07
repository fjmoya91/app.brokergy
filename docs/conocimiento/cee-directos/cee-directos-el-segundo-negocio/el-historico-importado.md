<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### El histórico importado

`node scripts/importar_cee_directos.js` (simulación) / `--execute`. Trae las 55
carpetas con `origen='HISTORICO'`.

**REGLA — de un histórico solo se afirma lo que tiene JUSTIFICANTE.** La primera
versión deducía "PRESENTADO" de que hubiera un `.cex` en la carpeta, y doce encargos
cerrados en 2024 y 2025 entraban en la app como "PENDIENTE REVISIÓN": una cola de
trabajo inventada. Un `.cex` prueba que el certificado existe, no que esté esperando a
nadie. Solo se sella REGISTRADO, y lo demás queda en `PTE_ENVIO_CERT` que, junto a la
marca de histórico, se lee como "viene del Drive antiguo y no lo hemos clasificado".
El número se conserva TAL CUAL lo escribe la carpeta —los doce primeros llevan cero
(`2024CEE_01`)— para que el expediente no se llame distinto que su carpeta.
