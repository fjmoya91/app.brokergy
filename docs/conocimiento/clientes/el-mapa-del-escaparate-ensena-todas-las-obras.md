<!-- conocimiento · área: clientes · las rutas de los enlaces son relativas a la raíz del repo -->

## El MAPA del escaparate enseña TODAS las obras (2026-10-19)

El mapa público de instalaciones del escaparate (`GET /api/public/marketplace/instalaciones`, sin
login, [publicMarketplace.js](implementation/backend/routes/publicMarketplace.js)) solo
pintaba las obras «verificadas» (CEE registrado o expediente avanzado) de los instaladores
VISIBLES, es decir, con su consentimiento. Desde el 19/10/2026, por decisión del usuario, salen
**todos los expedientes salvo los RECHAZADOS**, en cualquier fase, con un filtro por fase
(`finalizada` · `en_ejecucion` · `en_estudio`, `faseDe`: manda el estado del expediente y el
seguimiento del CEE solo desempata).

**REGLA — el nombre y el enlace del instalador solo salen si es VISIBLE (consentimiento).** Una
obra de un instalador que no ha dado el consentimiento, o sin instalador asignado, sale igual
pero ANÓNIMA: sin nombre, sin slug y sin sus marcas.

**REGLA — cero datos del cliente** (regla de oro del escaparate, 2026-07-06): la obra va por un
id opaco, con la posición del centroide del MUNICIPIO desplazada, tipo de actuación, ayuda CAE,
deducción IRPF y % cubierto. Ni nº de expediente, ni cliente, ni dirección, ni coste de obra
(decisión comercial del 07/07/2026). Lo vigila `assertAnonymous`.

**REGLA — cada municipio se geocodifica UNA vez.** El que no tiene centroide en `municipio_geo`
se sitúa con Google (municipio + provincia, con la provincia en nombre y no en código INE, que
hay «Villanueva» en media España) y se guarda con `upsert` por `clave`; como mucho 60 por
petición, de cinco en cinco, y los que Google no sitúa no se reintentan hasta reiniciar el
backend. Los municipios se casan normalizados (`muniKey`: sin tildes, «SOLANA (LA)» = «La
Solana»).

⚠️ La ruta es pública: la primera petición tras el despliegue puede tardar mientras geocodifica
los municipios que faltan (cacheada 5 min en el navegador).
