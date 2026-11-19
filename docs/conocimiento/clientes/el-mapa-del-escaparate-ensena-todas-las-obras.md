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

### La web brokergy.es: «Sale en la web» (2026-11-09)

La web pública nueva (repo `C:\Proyectos\brokergy-web`, «Encuentra tu instalador») NO usa
`visible_marketplace`: desde el 08/11/2026 enseña a TODOS los instaladores con obra (Fran: «de
momento publica con todos»), leídos por su `scripts/red.mjs` en solo lectura. Para quitar a uno
(Fran, 09/11/2026: «que se cuenten como que trabajamos con más de 70, pero que no se muestren»)
hay una columna aparte, **`prescriptores.oculto_web`** (`scripts/prescriptores_oculto_web.sql`,
por defecto `false`), con su interruptor «Sale en la web brokergy.es» en la ficha del instalador,
sección «Escaparate de Instaladores» (solo ADMIN; `PATCH /api/prescriptores/:id`). Desde el
11/11/2026 también se pone o se quita **desde la tarjeta del instalador en Partners**, sin abrir
la ficha: botón «En la web» / «Oculto en la web» (solo ADMIN, solo INSTALADOR), por su ruta
propia `PATCH /api/prescriptores/:id/web` (`adminOnly`), que solo escribe `oculto_web` — el
`PATCH /:id` reescribe la ficha entera y no vale para un clic suelto.

**REGLA — oculto no es borrado: se quita de la vista y SIGUE CONTANDO.** Apagado, la web no
enseña su tarjeta, su ficha, su pin ni sus obras, pero su nº de instaladores, de obras y sus
municipios suman en los totales (`red.json → ocultos`, sin nombre). Es independiente de
`visible_marketplace` (el escaparate antiguo): apagar uno no toca el otro. Se aplica al volver a
generar la web (`npm run red`, build y deploy de brokergy-web). Primeros ocultos: Juan Manuel
Caballero García y Proactiva y Desarrollo Empresarial.

**12/11/2026: el directorio ENTERO, oculto pero funcionando.** Fran: «de momento quita visible lo de
encuentra instalador, pero que sí funcione: lo usaremos cuando enviemos el mensaje a quien rellene el
formulario y pida que le recomendemos uno… que no aparezca para que no nos espíen». En brokergy-web,
`RED_PUBLICA = false` (`src/data/sitio.js`): `/encuentra-tu-instalador/`, sus fichas y
`/aerotermia/<provincia>/` se abren por su URL, pero ningún enlace de la web lleva a ellas, salen
del sitemap y llevan `noindex` (detalle en el `docs/BRIEF.md` de la web, §2.b). El mensaje a quien
pide que le recomendemos instalador lleva `https://brokergy.es/encuentra-tu-instalador/`. El
interruptor de cada instalador (`oculto_web`) sigue valiendo dentro del directorio.

**19/11/2026: las consultas por ids del mapa van POR LOTES, y de `datos_calculo` solo lo que se usa.**
`GET /api/public/marketplace/instalaciones` pedía las oportunidades de TODOS los expedientes con un
solo `.in('id', …)`: al pasar de ~400 la URL superó los 16 KB, Supabase falló y la ruta, que no
miraba el error, devolvió las obras sin `datos_calculo` — sin ayuda, sin % cubierto y sin el
municipio del cálculo (154 obras en vez de 398). La web lo publicó en su build de la noche: «+0 € de
ayuda de media por obra terminada» y «0 % del coste cubierto» en la portada y en /instaladores/.
Ahora clientes y oportunidades van con `enLotes` ([utils/consultaLotes.js](implementation/backend/utils/consultaLotes.js)),
un lote que falla da **500** (nunca un mapa sin cifras) y de `datos_calculo` se piden solo
`result.financials`, `result.selectedModel` y el municipio/provincia de `inputs` (regla 22). Lo
mismo en `/stats` y `/marca/:nombre`. Y `npm run cifras` de la web ya no pisa nada si la API trae
obras terminadas pero ninguna con ayuda. Medido tras el arreglo: 398 obras, 229 terminadas con
ayuda, media 11.389 €, 87 % cubierto.

**REGLA — en el escaparate, toda consulta por ids va con `enLotes` y mirando el error:** la lista
crece con la base y el fallo no hace ruido, solo deja cifras a cero en una web pública.
