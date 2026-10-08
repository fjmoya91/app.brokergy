<!-- conocimiento · área: cee-directos · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->
> Forma parte de «CEE directos — el segundo negocio (2026-08-24)»; la introducción y el resto, en esta misma carpeta.

### Estados

Los MISMOS 8 subestados de seguimiento del CAE (`PTE_ENVIO_CERT … REGISTRADO`), con
sus timestamps paralelos. La diferencia: aquí `estado` **se DERIVA** de los subestados
([utils/ceeDirectoEstados.js](implementation/backend/utils/ceeDirectoEstados.js),
`deriveEstado`) y no se acepta del navegador. En el CAE lo escriben seis sitios y hubo
que inventar `avanzarEstado()` para que ninguno lo hiciera retroceder; aquí no puede
haber una pastilla que diga una cosa y un módulo que diga otra.

**REGLA — el encargo de PRESENTAR también cuenta** (2026-10-07). Con
`cee.presentacion[fase]` vivo (enviado, con `nonce`, sin `registrado_at`) y la fase sin
registrar, el estado es **«PTE. PRESENTACIÓN (INICIAL|FINAL)»** y la pelota es de quien
presenta (`responsable` → `PRESENTADOR`; el listado enseña su nombre, nunca su correo ni el
nonce), diga lo que diga el subestado: mandarlo a presentar solo se puede con el visto bueno
dado o, si el certificado es de la casa, en cuanto se sube, y ahí nadie pulsa «Validar»
aparte. Medido en 2026CEE_61: enviado a Eva y el listado seguía en «PENDIENTE REVISIÓN
(INICIAL)» con la pelota «nuestra». El listado lo DERIVA al vuelo (así vale también para lo
encargado antes del cambio); `guardar` lee `cee->presentacion` para que un autoguardado no
lo devuelva atrás, y `presentacionCeeService.guardarEncargo` vuelve a sellar `estado` al
encargar y al retirar.
