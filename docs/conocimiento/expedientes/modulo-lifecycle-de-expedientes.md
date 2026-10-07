<!-- conocimiento · área: expedientes · origen: CLAUDE.md antiguo · las rutas de los enlaces son relativas a la raíz del repo -->

## Módulo Lifecycle de Expedientes (2026-05-20)

### Concepto
Los expedientes tienen un ciclo de vida de **8 estados reales** desde que se crea (al aceptar la oportunidad) hasta que se finaliza. Documentado a partir de la BD real el 2026-05-20. Se puede consultar en todo momento qué falta para avanzar al siguiente estado — incluyendo por un asistente IA conectado directamente a Supabase.

### Lifecycle completo — 8 estados reales

```
CREADO (al aceptar oportunidad)
  │
  ▼
PTE. CEE INICIAL                 → Responsable: BROKERGY
  Brokergy envía encargo al certificador.
  seguimiento.cee_inicial = PTE_ENVIO_CERT
  │
  ▼
EN CERTIFICADOR CEE INICIAL      → Responsable: CERTIFICADOR
  Certificador hace visita, mide, firma y sube el .cex al sistema.
  seguimiento.cee_inicial = ASIGNADO → EN_TRABAJO → PTE_PRESENTACION
  │
  ▼
PENDIENTE REVISIÓN (INICIAL)     → Responsable: BROKERGY
  Certificador subió el .cex. Brokergy lo revisa internamente.
  seguimiento.cee_inicial = PTE_REVISION
  │
  ▼
REVISADO Y LISTO (INICIAL)       → Responsable: BROKERGY
  Brokergy notifica al certificador para que registre el CEE.
  seguimiento.cee_inicial = REVISADO
  │
  ▼
PTE. FIN OBRA                    → Responsable: INSTALADOR
  CEE inicial registrado. Cliente notifica fin de obra con factura.
  Brokergy genera + envía + recoge firma de Anexo I y Cesión de Ahorros.
  seguimiento.cee_inicial = REGISTRADO
  │
  ▼
PTE. CEE FINAL                   → Responsable: CERTIFICADOR
  Fin de obra comunicado. Certificador hace visita final, firma y registra CEE final.
  seguimiento.cee_final = PTE_ENVIO_CERT → ... → REGISTRADO
  │
  ▼
REVISADO Y LISTO (FINAL)         → Responsable: BROKERGY
  CEE final revisado y registrado. Brokergy prepara documentación final.
  IMPORTANTE: el Certificado RITE es obligatorio antes de emitir el CIFO
  (la fecha del RITE se usa directamente en el CIFO).
  seguimiento.cee_final = REGISTRADO
  │
  ▼
PTE FIN EXPTE                    → Responsable: BROKERGY
  Documentación en tramitación. Pendiente firmas de CIFO y resto.
  │
  ▼
FINALIZADO                       → Ningún expediente aquí todavía (2026-05-20)
```

### Valores de `seguimiento.cee_inicial` (JSONB en `expedientes.seguimiento`)
| Valor | Significado |
|---|---|
| `PTE_ENVIO_CERT` | Pendiente de enviar encargo al certificador |
| `ASIGNADO` | Encargo enviado, certificador asignado |
| `EN_TRABAJO` | Certificador en proceso (visita, medición) |
| `PTE_PRESENTACION` | Pendiente de que el certificador suba el .cex |
| `PRESENTADO` | .cex subido, pendiente de revisión |
| `PTE_REVISION` | En revisión interna por Brokergy |
| `REVISADO` | Revisado, pendiente de notificar al certificador para registrar |
| `REGISTRADO` | CEE registrado oficialmente |

### Documentos del expediente y su ciclo (3 columnas por doc)
Cada documento tiene 3 estados: **generado** (borrador en Drive) → **enviado** (marcado como enviado al cliente) → **firmado** (PDF firmado subido).

| Documento | Campo Drive | Campo Enviado | Campo Firmado | Requiere firma |
|---|---|---|---|---|
| Anexo I | `anexo_i_drive_link` | `anexo_i_sent_at` | `anexo_i_signed_link` | ✅ Cliente |
| Cesión de Ahorros | `anexo_cesion_drive_link` | `anexo_cesion_sent_at` | `anexo_cesion_signed_link` | ✅ Cliente |
| Ficha RES (060/080/093) | `ficha_res060_drive_link` | `ficha_res060_sent_at` | — | ❌ Solo genera |
| Cert. CIFO / CAE | `cert_cifo_drive_link` | `cert_cifo_sent_at` | `cert_cifo_signed_link` | ✅ Instalador |
| Cert. RITE | `cert_rite_drive_link` | — | — | ❌ Manual/externo |
| Anexo Fotográfico | `anexo_fotografico_drive_link` | `anexo_fotografico_sent_at` | `anexo_fotografico_signed_link` | ✅ Cliente |

**REGLA**: El CIFO no se puede emitir sin tener `cert_rite_drive_link`. La fecha del RITE es obligatoria en el documento CIFO.

### Anomalía de integridad documental conocida
Algunos expedientes tienen `_signed_link` (PDF firmado) sin `_drive_link` (borrador). Ocurre cuando el usuario sube el firmado directamente sin pasar por la generación interna. La vista `v_expedientes_pendientes` detecta esto en el campo `anomalias_docs`.

### Vistas SQL activas en Supabase
**Fichero fuente:** `implementation/backend/scripts/expedientes_lifecycle_views.sql`
**Estado:** Desplegadas y activas en producción (2026-05-20).

#### `v_expedientes_lifecycle`
Una fila por expediente. Campos clave:
- `estado_actual`, `dias_en_estado_actual`, `responsable_bloqueo`
- Booleanos de cada fecha/documento (`cee_ini_visita_ok`, `anexo_i_firmado`, etc.)
- `campos_pendientes TEXT[]` — **solo los ítems que bloquean el avance en el estado actual**
- `historial_json` — historial completo (cambios de estado + comentarios)
- `seguimiento_cee_inicial`, `seguimiento_cee_final`

#### `v_expedientes_pendientes`
Filtra `v_expedientes_lifecycle` excluyendo `FINALIZADO`. Añade:
- `cliente_nombre`, `partner_nombre`, `partner_acronimo`
- `docs_generados_total` (máx 6), `docs_firmados_total` (máx 4), `docs_enviados_total`
- `anomalias_docs` — docs firmados sin borrador

### Queries de referencia para el asistente IA

```sql
-- ¿Qué falta exactamente en un expediente concreto?
SELECT campos_pendientes, responsable_bloqueo, dias_en_estado_actual
FROM v_expedientes_lifecycle
WHERE numero_expediente = '26RES060_118';

-- ¿Qué expedientes tienen algo pendiente hoy?
SELECT numero_expediente, estado_actual, responsable_bloqueo,
       dias_en_estado_actual, campos_pendientes
FROM v_expedientes_pendientes;

-- ¿Qué expedientes llevan más de 30 días sin avanzar?
SELECT numero_expediente, estado_actual, dias_en_estado_actual, responsable_bloqueo
FROM v_expedientes_pendientes WHERE dias_en_estado_actual > 30;

-- ¿Qué está esperando el certificador?
SELECT numero_expediente, cliente_municipio, dias_en_estado_actual, campos_pendientes
FROM v_expedientes_pendientes WHERE responsable_bloqueo = 'CERTIFICADOR';

-- ¿Qué documentos faltan firmar en tramitación?
SELECT numero_expediente, docs_generados_total, docs_firmados_total, campos_pendientes
FROM v_expedientes_pendientes
WHERE estado_actual IN ('PTE FIN EXPTE', 'REVISADO Y LISTO (FINAL)');

-- ¿Hay expedientes con anomalías de integridad documental?
SELECT numero_expediente, anomalias_docs
FROM v_expedientes_pendientes WHERE array_length(anomalias_docs, 1) > 0;
```

### Fases pendientes (no implementadas aún)
- **Fase 2 (backend):** Al cambiar de estado, guardar `campos_pendientes[]` en la entrada del historial — para saber con qué condición se avanzó cada estado.
- **Fase 3 (frontend):** Indicador visual del checklist del estado actual en `ExpedienteDetailView.jsx`.
