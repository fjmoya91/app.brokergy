# DXF de la parcela — cómo se consigue y para qué

**Todavía no está.** No hay endpoint público reproducible, así que se baja a
mano y se deja aquí.

## Para qué hace falta

Es la ÚNICA vía a saber **qué polígono es la vivienda y cuál el almacén** cuando
comparten planta (aquí: 165 m² y 27 m² en la planta baja). Sin él:

* no se puede situar la partición interior vertical vivienda ↔ almacén;
* el uso de la planta sale con confianza baja y marcado para revisión.

## Cómo se baja

1. Sede Electrónica del Catastro → **Consulta de bienes inmuebles**
2. Buscar por referencia catastral: `4410205WJ0641S`
3. **Cartografía** → *Descargar croquis / DXF*
4. Sin identificarse hay **captcha**; con certificado o Cl@ve no lo hay, pero
   sigue siendo la web: no hay endpoint documentado y **no se hace scraping**.

Guardar el fichero aquí como `4410205WJ0641S.dxf` y ejecutar:

```powershell
python -m src.main 4410205WJ0641S0001JH --offline `
  --cache ejemplos\4410205WJ0641S-pedro-munoz\cache `
  --dxf ejemplos\4410205WJ0641S-pedro-munoz\dxf\4410205WJ0641S.dxf
```

## Qué hace el programa con él

Lee las polilíneas de las capas de construcción, empareja cada subparcela con el
rótulo de plantas en romanos que cae dentro (`II` → 2, `-I` → −1, `III+TZA` → 3)
y asigna el uso **solo cuando el emparejamiento por superficie es inequívoco**.
Si dos usos cuadran dentro de la tolerancia, no asigna ninguno: adivinar cuál es
el garaje es el error que acaba en un requerimiento.

Ver `docs/06-uso-por-poligono.md`.
