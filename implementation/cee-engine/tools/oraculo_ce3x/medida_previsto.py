# Pone en un CEE INICIAL la medida «Nuevo Edificio Definido por el Usuario» con el
# CEE PREVISTO dentro: lo mismo que, en CE3X, «Medidas de mejora → Cargar edificio»,
# elegir el .cex del previsto, escribir sus textos y «Calcular». Es como se hace un
# RES080 (ver tools/previsto.py).
#
#   CASO=C:\ruta\inicial.cex PREVISTO=C:\ruta\previsto.cex SALIDA_CEX=C:\ruta\out.cex
#   TEXTOS=C:\ruta\textos.json [XML=C:\ruta\out.xml] RESULTADO=C:\ruta\r.json
#
# Los textos van en un JSON (UTF-8: nombre, caracteristicas, otros, justificacion)
# y NO por el entorno: el Python 2 de CE3X lee el entorno en la pagina de codigos
# de Windows, una «ó» le llega como el byte 0xf3 y la tabla del informe revienta
# al pintarla (UnicodeDecodeError, medido el 06/10/2026). Lo que diga CE3X es lo
# que vale.
#
# Tres cosas MEDIDAS al hacerlo (CE3X 3.1, 06/10/2026):
#  · «Cargar edificio» pide el fichero con un wx.FileDialog y refresca el arbol de
#    la pantalla, que sin ventana no existe: se le da el previsto y el arbol se
#    salta.
#  · Una «Nuevo Edificio» (`mejoraEdificioCompleto`) guarda sus equipos y su
#    envolvente DENTRO del edificio cargado, y el panel economico y el XML de la
#    3.1 solo saben leerlos con la forma de un `grupoMedidasMejora` (`sistemas*MM`,
#    `cerramientosMejorados`...). Sin copiarlos, `incluirMedidas` falla y el XML
#    sale con «faltan datos o son incorrectos».
#  · La casilla 0 de «Opciones del informe» es el conjunto que imprime el informe:
#    apuntaba a la medida que se quita.
import os, json
D = os.environ['ORACULO_DIR']
execfile(os.path.join(D, 'headless.py'))
execfile(os.path.join(D, 'res.py'))
execfile(os.path.join(D, 'xml.py'))


def _textos():
    ruta = os.environ.get('TEXTOS')
    if not ruta:
        return {}
    f = open(ruta, 'rb')
    try:
        return json.loads(f.read().decode('utf-8'))
    finally:
        f.close()


TEXTOS = _textos()


def _u(k):
    v = TEXTOS.get(k.lower()) or u''
    return v if isinstance(v, unicode) else unicode(v)


def _txt(x):
    try:
        return unicode(x)
    except Exception:
        return repr(x)


#: Los slots de `datosInstalaciones` y el atributo de la medida que los guarda.
ORDEN_MM = ['sistemasACSMM', 'sistemasCalefaccionMM', 'sistemasRefrigeracionMM',
            'sistemasClimatizacionMM', 'sistemasMixto2MM', 'sistemasMixto3MM',
            'sistemasContribucionesMM', 'sistemasIluminacionMM', 'sistemasVentilacionMM',
            'sistemasVentiladoresMM', 'sistemasBombasMM', 'sistemasTorresRefrigeracionMM']

CASO = os.environ['CASO']
PREVISTO = os.environ['PREVISTO']
SALIDA = {'abrir': [], 'calificacion': None, 'medidas': [], 'log': [], 'xml': [],
          'error': None, 'guardado': None}
try:
    del LOG[:]
    FRAME.abreArchivoCEX(CASO, False, False)
    FRAME.filename = CASO
    SALIDA['abrir'] = list(LOG)
    if not getattr(FRAME, 'versionArchivoGuardado', None):
        raise RuntimeError('NO_ABRE')

    del LOG[:]
    FRAME.calculoCalificacion(False)
    r = resultados()
    SALIDA['calificacion'] = r
    if not r.get('_valido'):
        raise RuntimeError('NO_CALIFICA')

    # Fuera las medidas que hubiera: la del previsto es la medida de la obra.
    SALIDA['log'].append(u'medidas que se quitan: ' + _txt(
        [getattr(g, 'nombre', None) for g in FRAME.listadoConjuntosMMUsuario]))
    del FRAME.listadoConjuntosMMUsuario[:]

    class _FD(object):
        def __init__(self, *a, **k): pass
        def ShowModal(self): return wx.ID_OK
        def GetPath(self): return PREVISTO
        def GetPaths(self): return [PREVISTO]
        def GetFilename(self): return os.path.basename(PREVISTO)
        def GetDirectory(self): return os.path.dirname(PREVISTO)
        def Destroy(self): pass
        def __getattr__(self, n): return lambda *a, **k: None
    wx.FileDialog = _FD
    import panelMedidasMejora as PMM
    PMM.wx.FileDialog = _FD
    PMM.panelMedidasMejora.cargarArbol = lambda self, *a, **k: None
    del LOG[:]
    try:
        FRAME.panelMedidasMejora.OnCargaEdificioButton(None)
    except Exception:
        # El panel economico se refresca al cargar y falla con la forma de una
        # «Nuevo Edificio»: se vuelve a hacer abajo, ya con la forma buena.
        import traceback
        SALIDA['log'].append(u'cargar (pantalla): ' + traceback.format_exc().decode('utf-8', 'replace')[-200:])
    SALIDA['log'] += [u'cargar: ' + x for x in LOG]
    m = FRAME.listadoConjuntosMMUsuario[-1] if FRAME.listadoConjuntosMMUsuario else None
    if m is None or getattr(m, 'datosNuevoEdificio', None) is None:
        raise RuntimeError('NO_CARGA_PREVISTO')

    dn = m.datosNuevoEdificio
    inst = list(dn.datosInstalaciones or [])
    for i, attr in enumerate(ORDEN_MM):
        setattr(m, attr, list(inst[i]) if i < len(inst) and isinstance(inst[i], list) else [])
    m.listadoGeneradoresTermosolarMM = list(inst[12]) if len(inst) > 12 and isinstance(inst[12], list) else []
    m.listadoGeneradoresElectricoMM = list(inst[13]) if len(inst) > 13 and isinstance(inst[13], list) else []
    m.datosInstalaciones = inst
    env = list(dn.datosEnvolvente or [[], [], []])
    m.cerramientosMejorados = env[0] if len(env) > 0 else []
    m.huecosMejorados = env[1] if len(env) > 1 else []
    m.puentesTermicosMejorados = env[2] if len(env) > 2 else []
    m.medidasMejoraEnvolvente = []
    m.mejoras = [[], [u'', inst, True]]

    # El analisis economico de la medida, como lo tienen los RES080 del corpus:
    # inversion, vida util (15 equipos, 30 con envolvente) y 0 de mantenimiento.
    # OJO: el XML de la 3.1 no lo lee de aqui sino de la TABLA del panel
    # economico (abajo); sin esa fila el informe dice «coste > 100 000».
    ae = getattr(m, 'analisisEconomico', None)
    if ae is not None and TEXTOS.get('inversion') not in (None, ''):
        ae.inversionInicial = [float(TEXTOS['inversion'])]
        ae.costeMantenimiento = [float(TEXTOS.get('coste_mantenimiento') or 0)]
        ae.vidaUtil = [float(TEXTOS.get('vida_util') or 15)]

    import AnalisisEconomico.panelCosteMedidas as PCM
    pcs = []
    for a in dir(FRAME):
        o = getattr(FRAME, a, None)
        if o is not None and 'nalisis' in a:
            for b in dir(o):
                if isinstance(getattr(o, b, None), PCM.Panel1):
                    pcs.append(getattr(o, b))
    if TEXTOS.get('nombre'):
        m.nombre = _u('NOMBRE')
    for pc in pcs:
        pc.incluirMedidas()
    # La fila de la medida en el resumen economico (la tabla `listaMedidas`, que
    # se guarda en el pickle 6 y de la que el XML saca el coste). `incluirMedidas`
    # la escribe como «Nuevas Instalaciones» y sin coste; se deja como la dejan
    # los RES080 hechos a mano (26RES080_62, _65): «Nuevo Edificio Definido por
    # el Usuario» · conjunto · «Definido por el Usuario» · vida · coste · 0.
    for pc in pcs:
        g = getattr(pc, 'listaMedidas', None)
        if g is None:
            continue
        for i in range(g.GetNumberRows()):
            if g.GetCellValue(i, 1) != m.nombre:
                continue
            g.SetCellValue(i, 0, u'Nuevo Edificio Definido por el Usuario')
            g.SetCellValue(i, 2, u'Definido por el Usuario')
            if TEXTOS.get('vida_util') not in (None, ''):
                g.SetCellValue(i, 3, unicode(float(TEXTOS['vida_util'])))
            if TEXTOS.get('inversion') not in (None, ''):
                g.SetCellValue(i, 4, unicode(float(TEXTOS['inversion'])))
            g.SetCellValue(i, 5, unicode(float(TEXTOS.get('coste_mantenimiento') or 0)))
    m.caracteristicas = _u('CARACTERISTICAS')
    m.otrosDatos = _u('OTROS')
    # Lo que la 3.1 pide a cada conjunto («Propuesta de secuencia temporal»).
    m.ordenPrioridad = u'1'
    m.justificacion = _u('JUSTIFICACION') or _u('CARACTERISTICAS')
    m.seRecomienda = True
    ci = getattr(FRAME, 'configuracionInforme', None)
    if isinstance(ci, list) and ci:
        ci[0] = m.nombre

    del LOG[:]
    FRAME.calculoMedidasUsuario(False)
    SALIDA['log'] += list(LOG)
    for gm in FRAME.listadoConjuntosMMUsuario or []:
        st = gm.__dict__
        SALIDA['medidas'].append({'clase': gm.__class__.__name__, 'nombre': _txt(st.get('nombre')),
                                  'ahorro': [_txt(x) for x in (st.get('ahorro') or [])]})

    del LOG[:]
    FRAME.filename = os.environ['SALIDA_CEX']
    FRAME.OnMenuFileSaveMenu(None)
    SALIDA['guardado'] = os.path.exists(os.environ['SALIDA_CEX'])
    SALIDA['log'] += list(LOG)
    if os.environ.get('XML'):
        sys.exc_clear()
        SALIDA['xml'] = generar_xml(os.environ['XML'])
except RuntimeError as e:
    SALIDA['error'] = str(e)
except Exception:
    import traceback
    SALIDA['error'] = traceback.format_exc().decode('utf-8', 'replace')

f = open(os.environ['RESULTADO'], 'wb')
f.write(json.dumps(SALIDA, default=_txt))
f.close()
