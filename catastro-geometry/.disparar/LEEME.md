# Disparador manual del workflow de Catastro

GitHub solo registra `workflow_dispatch` para workflows que estén en la rama por
defecto. Mientras este workflow viva solo en una rama de trabajo, se dispara
escribiendo `parametros.json` aquí y haciendo push:

```json
{ "fase": "reconocimiento", "pausa": 1.5 }
{ "fase": "datos", "refcat": "4410205WJ0641S0001JH", "max_vecinos": 4, "pausa": 1.5 }
```

Cada push a esta carpeta **pega al Catastro de verdad**. La fase
`reconocimiento` son 6 peticiones; la fase `datos`, del orden de 6 + 2 por
vecino. Al primer 403 se para y no se reintenta.
