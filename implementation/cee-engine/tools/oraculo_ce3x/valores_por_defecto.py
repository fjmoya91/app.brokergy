# Las U y masas «Por defecto» de CE3X («Estimados según antigüedad y zona
# climática» en la pantalla de la 3.2), PREGUNTANDOSELAS al propio CE3X.
#
#   SALIDA=C:\ruta\valores.json   bash run.sh "$(pwd)/valores_por_defecto.py"
#
# Estan compiladas en Envolvente/tablasValores.pyd, en diccionarios LOCALES de
# cada metodo: no se leen, se llaman. tablasValores(tipo, frontera, datos,
# 'Por defecto') + su obtenerDatos...() dejan UCerramiento y densidadCerramiento.
# `datos` es lo que manda cada panel (capturado abriendo 26RES060_188 sin
# ventana, 08/10/2026): [periodo, zona HE-1, zona NBE], mas el tipo de cubierta;
# lo que da contra el terreno no lleva la zona NBE, y el suelo con terreno lleva
# la profundidad ('-0.5' = «<= 0,5 m»).
#
# periodo = indice de anoConstruccionChoice: 0 Anterior · 1 NBE-CT-79 ·
# 2 NBE-CT-79_aPartir1998 · 3 C.T.E. · 4 CTE 2013 · 5 Apartir2020.
# Filas: [caso, periodo, zona HE-1, zona NBE, U, masa, error].
# Ver docs/conocimiento/envolvente-ce3x/los-valores-por-defecto-de-ce3x-3-2-por-epoca-y-zona.md
import json
sys.path.insert(0, CE)
import Envolvente.tablasValores as TV

HE1 = [u'alpha1', u'alpha2', u'alpha3', u'alpha4', u'A1', u'A2', u'A3', u'A4', u'B1', u'B2',
       u'B3', u'B4', u'C1', u'C2', u'C3', u'C4', u'D1', u'D2', u'D3', u'E1']
NBE = [u'V', u'W', u'X', u'Y', u'Z']
PERIODOS = [0, 1, 2, 3, 4, 5]
CASOS = [
    ('fachada_aire', 'Fachada', 'aire', 'obtenerDatosFachadaAire', lambda n, z, v: [n, z, v]),
    ('muro_terreno', 'Fachada', 'terreno', 'obtenerDatosFachadaTerreno', lambda n, z, v: [n, z]),
    ('cubierta_plana', 'Cubierta', 'aire', 'obtenerDatosCubiertaAire',
     lambda n, z, v: [n, z, v, u'Cubierta plana']),
    ('cubierta_inclinada', 'Cubierta', 'aire', 'obtenerDatosCubiertaAire',
     lambda n, z, v: [n, z, v, u'Cubierta inclinada']),
    ('cubierta_terreno', 'Cubierta', 'terreno', 'obtenerDatosCubiertaTerreno', lambda n, z, v: [n, z]),
    ('suelo_aire', 'Suelo', 'aire', 'obtenerDatosSueloAire', lambda n, z, v: [n, z, v]),
    ('suelo_terreno', 'Suelo', 'terreno', 'obtenerDatosSueloTerreno', lambda n, z, v: [n, z, '-0.5']),
    ('particion_vertical', 'Particion', 'Vertical', 'obtenerDatosParticionVertical',
     lambda n, z, v: [n, z, v]),
    ('particion_inferior', 'Particion', 'HorizontalInferior',
     'obtenerDatosParticionHorizontalInferior', lambda n, z, v: [n, z, v]),
    ('camara_sanitaria', 'Particion', 'CamaraSanitaria', 'obtenerDatosCamaraSanitaria',
     lambda n, z, v: [n, z, v]),
    ('particion_bajo_cubierta', 'Particion', 'HorizontalSuperiorBajoCubierta',
     'obtenerDatosParticionHorizontalBajoCubierta', lambda n, z, v: [n, z, v]),
    ('particion_superior_otro', 'Particion', 'HorizontalSuperiorOtro',
     'obtenerDatosParticionHorizontalOtro', lambda n, z, v: [n, z, v]),
]
R = []
for caso, tipo, frontera, metodo, datos in CASOS:
    for n in PERIODOS:
        for z in HE1:
            for v in NBE:
                try:
                    o = TV.tablasValores(tipo, frontera, datos(n, z, v), 'Por defecto')
                    getattr(o, metodo)()
                    R.append([caso, n, z, v, o.UCerramiento, o.densidadCerramiento, None])
                except Exception as e:
                    R.append([caso, n, z, v, None, None, repr(e)])
f = open(os.environ['SALIDA'], 'wb'); f.write(json.dumps(R)); f.close()
print 'filas', len(R), 'errores', sum(1 for r in R if r[6])
