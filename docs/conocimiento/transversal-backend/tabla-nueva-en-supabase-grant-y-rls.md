<!-- conocimiento · área: transversal-backend · las rutas de los enlaces son relativas a la raíz del repo -->

### Tabla nueva en Supabase: GRANT a `service_role` y RLS en el mismo script (2026-10-20)

**Qué cambió.** Supabase avisó por correo (23/09/2026 y de nuevo el 20/10/2026) de que desde el
**30/10/2026** las tablas NUEVAS del esquema `public` dejan de recibir permisos automáticos para la
Data API (PostgREST, supabase-js, GraphQL). Sin un `GRANT` explícito, la API responde
*permission denied*. Las tablas que ya existían conservan sus permisos.

**Por qué nos toca.** Todo el acceso a datos (backend Express, MCP brokergy, portal) va por
PostgREST con la clave `service_role`. Esa clave se salta el RLS, pero **no** los permisos de
tabla: una tabla nueva sin `GRANT` es una tabla que la app no puede ni leer ni escribir, y el fallo
solo aparece en el primer uso real.

**Medido el 20/10/2026 en producción** (`okfeopwetlxdffrsbfqw`): las 33 tablas de `public` tienen
`SELECT` e `INSERT` para `service_role` y el RLS activado. A esa fecha no hay nada que arreglar.

**REGLA — Toda tabla nueva en `public` lleva, en el MISMO script que la crea, el RLS activado sin
policies y el GRANT a `service_role` (y a su secuencia, si tiene).** El patrón, como en
`cee_ofertas_schema.sql`:

```sql
ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;                    -- deny-all, sin policies
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.x TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.x_id_seq TO service_role;   -- si tiene serial/identity propia
```

**Nunca a `anon` ni a `authenticated`**, aunque el ejemplo del correo de Supabase ponga
`grant select on public.your_table to anon`. El frontend solo usa Supabase para la autenticación y
no hace ningún `.from()`; la clave anónima va en el bundle y es pública. Darle permiso a `anon`
reabre lo que se cerró en julio de 2026 (RLS deny-all y RPC sin `EXECUTE` para anon/authenticated).

**Los scripts antiguos.** Hay ocho scripts de esquema sin `GRANT` (`supabase_schema.sql`,
`lotes_schema.sql`…). Funcionan porque sus tablas se crearon antes del cambio. Si alguna vez se
re-ejecutan en una base nueva, sus tablas nacerán sin permisos: hay que añadirles el `GRANT` antes.

**Comprobación** (debe devolver vacío):

```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND (NOT has_table_privilege('service_role', c.oid, 'SELECT')
       OR NOT has_table_privilege('service_role', c.oid, 'INSERT')
       OR NOT has_table_privilege('service_role', c.oid, 'UPDATE')
       OR NOT has_table_privilege('service_role', c.oid, 'DELETE')
       OR NOT c.relrowsecurity);
```
