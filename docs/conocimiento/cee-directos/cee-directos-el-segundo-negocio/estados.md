<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Estados

Los MISMOS 8 subestados de seguimiento del CAE (`PTE_ENVIO_CERT … REGISTRADO`), con
sus timestamps paralelos. La diferencia: aquí `estado` **se DERIVA** de los subestados
([utils/ceeDirectoEstados.js](implementation/backend/utils/ceeDirectoEstados.js),
`deriveEstado`) y no se acepta del navegador. En el CAE lo escriben seis sitios y hubo
que inventar `avanzarEstado()` para que ninguno lo hiciera retroceder; aquí no puede
haber una pastilla que diga una cosa y un módulo que diga otra.
