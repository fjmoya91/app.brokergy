# Pone en un CEE INICIAL la medida de mejora de un RES080 sacada del CEE PREVISTO
# (ver tools/previsto.py): UN conjunto autocontenido —«Nuevas Instalaciones» con
# los equipos del previsto + «Adicion de Aislamiento Termico» por cada tipo de
# cerramiento que el previsto aisla + «Sustitucion/mejora de Huecos» con las
# ventanas que cambia—, como lo monta un certificador en CE3X, y lo CALCULA.
#
# Hasta el 10/10/2026 era una «Nuevo Edificio Definido por el Usuario» con el
# previsto cargado: CE3X no la lleva dentro, vuelve a leer el .cex del previsto
# desde la ruta que guardo cada vez que se pulsa, y sin ese fichero el panel se
# quedaba en blanco (26RES080_82). Ver `_medidas_envolvente` y la regla 117.
#
#   CASO=C:\ruta\inicial.cex PREVISTO=C:\ruta\previsto.cex SALIDA_CEX=C:\ruta\out.cex
#   TEXTOS=C:\ruta\textos.json [XML=C:\ruta\out.xml] RESULTADO=C:\ruta\r.json
#
# Los textos van en un JSON (UTF-8: nombre, caracteristicas, otros, justificacion,
# inversion, vida_util, coste_mantenimiento, fachada_exterior) y NO por el entorno: el Python 2 de CE3X lee el entorno en la pagina de codigos
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


def _filas_resultados(n):
    """Que cada tabla del panel de resultados economicos tenga al menos `n` filas.

    Solo AÑADE filas vacias: las que ya hay no se tocan, y la medida las rellena
    al recalcular. Lo que se hace queda en el log.
    """
    import wx.grid as WG
    try:
        import AnalisisEconomico.panelResultadoAnalisis as PRA
    except Exception:
        return
    vistos = set()
    for a in dir(FRAME):
        o = getattr(FRAME, a, None)
        if o is None or 'nalisis' not in a:
            continue
        for b in dir(o):
            p = getattr(o, b, None)
            if not isinstance(p, PRA.Panel1) or id(p) in vistos:
                continue
            vistos.add(id(p))
            for c in dir(p):
                g = getattr(p, c, None)
                if isinstance(g, WG.Grid) and g.GetNumberRows() < n:
                    SALIDA['log'].append(u'resultados %s: %d -> %d filas' % (c, g.GetNumberRows(), n))
                    g.AppendRows(n - g.GetNumberRows())


#: Los slots de `datosInstalaciones` y el atributo de la medida que los guarda.
ORDEN_MM = ['sistemasACSMM', 'sistemasCalefaccionMM', 'sistemasRefrigeracionMM',
            'sistemasClimatizacionMM', 'sistemasMixto2MM', 'sistemasMixto3MM',
            'sistemasContribucionesMM', 'sistemasIluminacionMM', 'sistemasVentilacionMM',
            'sistemasVentiladoresMM', 'sistemasBombasMM', 'sistemasTorresRefrigeracionMM']

#: Las nueve casillas de orientacion del dialogo «Medida de mejora en los huecos»
#: (MedidasDeMejora.ventanaHuecos), en su orden: leido del propio dialogo de
#: CE3X 3.2 (huecosNorteCheck, huecosNorOesteCheck, ... huecosEsteCheck).
ORIENT_HUECOS = [u'Norte', u'NO', u'NE', u'Sur', u'SO', u'SE', u'Lucernarios', u'Oeste', u'Este']
_ALIAS_ORIENT = {u'N': u'Norte', u'S': u'Sur', u'O': u'Oeste', u'E': u'Este', u'Techo': u'Lucernarios',
                 u'Lucernario': u'Lucernarios', u'Noroeste': u'NO', u'Noreste': u'NE',
                 u'Suroeste': u'SO', u'Sureste': u'SE'}
#: Los psi del aislamiento de FACHADA por el exterior y las protecciones solares
#: en blanco, tal cual los guarda el dialogo (CE126_Juanmi, 26RES080_84).
PSI_FACHADA_EXT = [u'0.01', u'0.16', u'0.02', u'0.65', u'0.16', u'0.26', u'0.22']
PROTECCION_VACIA = [u'', u'', u'', u'', u'', u'', [u'', 0, 0], [u'', 0, 0], u'', False, False, u'',
                    False, False, u'', u'', u'', False, False, False, False, False, False, False,
                    [u'', u'']]
NOMBRE_AISLAMIENTO = {u'Fachada': u'Aislamiento térmico de fachadas',
                      u'Cubierta': u'Aislamiento térmico de cubierta',
                      u'Suelo': u'Aislamiento térmico de suelos',
                      u'Partición Interior': u'Aislamiento térmico de particiones'}


def _num(x):
    try:
        return float(unicode(x).replace(u',', u'.'))
    except Exception:
        return None


def _s(x):
    """Un numero como lo guarda el dialogo: texto, sin ceros de mas."""
    v = _num(x)
    if v is None:
        return u''
    t = (u'%.4f' % v).rstrip(u'0').rstrip(u'.')
    return t or u'0'


def _psi_l(puentes):
    """La suma de psi x longitud de los puentes termicos (W/K): lo que dice si
    una medida los ha tocado."""
    t = 0.0
    for p in puentes or []:
        if isinstance(p, list) and len(p) > 4 and _num(p[3]) is not None and _num(p[4]) is not None:
            t += _num(p[3]) * _num(p[4])
    return round(t, 1)


def _medidas_envolvente(env0, env1):
    """Las medidas de envolvente del conjunto, sacadas de lo que cambia entre el
    inicial (`env0`) y el previsto (`env1`): una «Adicion de Aislamiento Termico»
    por tipo de cerramiento que baja de U, y una «Sustitucion/mejora de Huecos»
    con las orientaciones de los huecos que cambian y sus valores nuevos.

    OJO: CE3X CALCULA el conjunto aplicando estas medidas al edificio original
    (no usa los cerramientos ni los huecos del previsto): el aislamiento va a
    TODOS los cerramientos de ese tipo y la sustitucion de huecos a TODOS los de
    esas orientaciones. Lo que no case con el previsto se avisa.

    REGLA — la fachada se aisla «por el INTERIOR» salvo que el plan diga
    `exterior: true` (decision del usuario, 2026-10-10, 26RES080_82): por el
    exterior CE3X pone a los puentes termicos los psi de un SATE (medido: de
    229,7 a 29,6 W/K de psi·L, y la demanda de calefaccion de 149 a 92) y el
    previsto no los toca."""
    out = []
    exterior = bool(TEXTOS.get('fachada_exterior'))
    antes = dict((unicode(r[0]), r) for r in (env0[0] if env0 else []) if isinstance(r, list) and r)
    por_tipo, sin_cambiar = {}, {}
    for r in (env1[0] if env1 else []):
        if not (isinstance(r, list) and len(r) > 3):
            continue
        r0 = antes.get(unicode(r[0]))
        u0, u1 = _num(r0[3]) if r0 else None, _num(r[3])
        if u0 is None or u1 is None or not u1 < u0 - 1e-6:
            if u1 and unicode(r[-1]) != u'edificio':          # una medianera no se aisla
                sin_cambiar.setdefault(unicode(r[1]), []).append(unicode(r[0]))
            continue
        por_tipo.setdefault(unicode(r[1]), []).append(u1)
    for tipo in (u'Fachada', u'Cubierta', u'Suelo', u'Partición Interior'):
        us = por_tipo.get(tipo)
        if not us:
            continue
        u = max(set(us), key=us.count)
        if len(set(us)) > 1:
            SALIDA['avisos_medida'].append(u'El previsto aísla %s con varias U (%s); la medida de CE3X '
                                           u'pone a todos U = %s.' % (tipo.lower(), u', '.join(_s(x) for x in sorted(set(us))), _s(u)))
        if sin_cambiar.get(tipo):
            SALIDA['avisos_medida'].append(u'La medida de CE3X aísla TODOS los cerramientos de tipo %s; el previsto '
                                           u'no aísla %s.' % (tipo.lower(), u', '.join(sin_cambiar[tipo])))
        fach = tipo == u'Fachada'
        ext = exterior and fach
        params = [fach, tipo == u'Cubierta', tipo == u'Suelo', True, False, tipo == u'Partición Interior',
                  _s(u), u'', u'', u'', ext, list(PSI_FACHADA_EXT) if ext else [u''] * 7,
                  [False, False, False, False]]
        nombre = NOMBRE_AISLAMIENTO[tipo] + ((u' por el exterior' if ext else u' por el interior') if fach else u'')
        out.append([nombre, u'Adición de Aislamiento Térmico', params])

    huecos0 = dict((unicode(getattr(h, 'descripcion', u'')), h) for h in (env0[1] if len(env0) > 1 else []))
    cambian = []
    for h in (env1[1] if len(env1) > 1 else []):
        h0 = huecos0.get(unicode(getattr(h, 'descripcion', u'')))
        if h0 is None:
            continue
        campos = ('Uvidrio', 'Gvidrio', 'Umarco', 'porcMarco', 'permeabilidadValor')
        if any(_num(getattr(h, c, None)) != _num(getattr(h0, c, None)) for c in campos):
            cambian.append(h)
    if cambian:
        h = cambian[0]
        orients = set(_ALIAS_ORIENT.get(unicode(getattr(x, 'orientacion', u'')), unicode(getattr(x, 'orientacion', u'')))
                      for x in cambian)
        desconocidas = [o for o in orients if o not in ORIENT_HUECOS]
        if desconocidas:
            SALIDA['log'].append(u'orientaciones de hueco sin casilla: %r' % desconocidas)
        # CE3X aplica la medida a TODOS los huecos de las orientaciones marcadas
        # (una puerta de esa fachada tambien): por eso solo se marca lo que
        # cambia de verdad. Si el % de marco es el mismo, la casilla va sin
        # marcar y la puerta conserva el suyo (90 % la de entrada).
        cambia = lambda c: any(_num(getattr(x, c, None)) != _num(getattr(huecos0[unicode(x.descripcion)], c, None))
                               for x in cambian)
        vidrio = cambia('Uvidrio') or cambia('Gvidrio')
        perm = cambia('permeabilidadValor')
        marco_pct = cambia('porcMarco')
        marco_u = cambia('Umarco')
        params = [[o in orients for o in ORIENT_HUECOS],
                  vidrio, True, _s(h.Uvidrio) if vidrio else u'', _s(h.Gvidrio) if vidrio else u'', u'',
                  perm, False, u'Clase 1', u'Valor conocido',
                  _s(getattr(h, 'permeabilidadValor', u'')) if perm else u'',
                  marco_pct, _s(getattr(h, 'porcMarco', u'')) if marco_pct else u'',
                  marco_u, True, _s(h.Umarco) if marco_u else u'', u'',
                  False, u'Ninguna', False, list(PROTECCION_VACIA)]
        otros = [unicode(getattr(x, 'descripcion', u'')) for x in (env1[1] if len(env1) > 1 else [])
                 if x not in cambian and _ALIAS_ORIENT.get(unicode(getattr(x, 'orientacion', u'')),
                                                         unicode(getattr(x, 'orientacion', u''))) in orients]
        if otros:
            SALIDA['avisos_medida'].append(
                u'La medida de huecos de CE3X va por ORIENTACIÓN: en esas fachadas cambia también %s, '
                u'que el previsto no cambia (%s de marco).' % (u', '.join(otros),
                u'conserva su %' if not marco_pct else u'pasa al mismo %'))
        out.insert(0, [u'Sustitución de ventanas', u'Sustitución/mejora de Huecos', params])
        SALIDA['log'].append(u'huecos que cambian: ' + u', '.join(unicode(getattr(x, 'descripcion', u'')) for x in cambian))

    pt = _mejora_puentes(env0, env1)
    if pt:
        out.append(pt)
    return out


#: Los diez pares [casilla, psi] de «Mejora de Puentes Termicos», en el orden en
#: que los deja el dialogo de CE3X 3.2 (MedidasDeMejora.ventanaPT, `dev` al
#: aceptar, leido con el oraculo el 05/10/2026): contorno de hueco es el TERCER
#: par y caja de persiana el CUARTO. Solo se usan esos dos.
PAR_PT = {u'Contorno de hueco': 2, u'Caja de Persiana': 3}


def _mejora_puentes(env0, env1):
    """La «Mejora de Puentes Termicos» del conjunto, si el previsto ha bajado los
    psi de los puentes de sus ventanas (previsto.py, PSI_MEJORA_HUECO: los de la
    propia mejora de CE3X). Sin ella el conjunto calcula con los puentes viejos y
    no da lo que da el previsto.

    OJO: como la de huecos, CE3X la aplica a TODOS los puentes de ese tipo (la
    puerta que no se cambia tambien): se avisa."""
    p0 = env0[2] if len(env0) > 2 else []
    p1 = env1[2] if len(env1) > 2 else []
    antes = dict((unicode(p[0]), p) for p in p0 if isinstance(p, list) and len(p) > 3)
    nuevos, sin_cambiar = {}, {}
    for p in p1:
        if not (isinstance(p, list) and len(p) > 3):
            continue
        tipo = unicode(p[2])
        if tipo not in PAR_PT:
            continue
        a = antes.get(unicode(p[0]))
        psi0, psi1 = (_num(a[3]) if a else None), _num(p[3])
        if psi0 is not None and psi1 is not None and psi1 < psi0 - 1e-6:
            nuevos.setdefault(tipo, []).append(psi1)
        else:
            sin_cambiar.setdefault(tipo, []).append(unicode(p[0]))
    if not nuevos:
        return None
    params = []
    for _ in range(10):
        params += [False, u'']
    for tipo, psis in nuevos.items():
        i = PAR_PT[tipo]
        params[2 * i] = True
        params[2 * i + 1] = _s(max(set(psis), key=psis.count))
        if sin_cambiar.get(tipo):
            SALIDA['avisos_medida'].append(
                u'La mejora de puentes térmicos de CE3X va por TIPO: el %s también baja en %s, '
                u'que el previsto no cambia.' % (tipo.lower(), u', '.join(sin_cambiar[tipo])))
    SALIDA['log'].append(u'puentes que mejoran: ' + u', '.join(
        u'%s %s' % (t, params[2 * PAR_PT[t] + 1]) for t in nuevos))
    return [u'Mejora de puentes térmicos de las ventanas', u'Mejora de Puentes Térmicos', params]


CASO = os.environ['CASO']
PREVISTO = os.environ['PREVISTO']
SALIDA = {'abrir': [], 'calificacion': None, 'medidas': [], 'log': [], 'xml': [],
          'error': None, 'guardado': None, 'avisos_medida': [], 'envolvente': []}
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

    # REGLA — la medida va AUTOCONTENIDA (decision del usuario, 2026-10-10,
    # 26RES080_82): un conjunto normal (`grupoMedidasMejora`, como los que monta
    # un certificador: «Nuevas Instalaciones» + «Sustitucion/mejora de Huecos» +
    # «Adicion de Aislamiento Termico»), NO un «Nuevo Edificio Definido por el
    # Usuario». Una «Nuevo Edificio» NO lleva el previsto dentro: cada vez que se
    # pulsa en el arbol, CE3X vuelve a LEER el .cex del previsto desde la ruta
    # absoluta que guardo (`mejoras`), y si ya no esta ahi revienta en
    # `mejoraEdificioCompleto.calificacion` («local variable 'f1' referenced
    # before assignment») y el panel se queda en blanco. Medido con el oraculo:
    # con la ruta buena abre; con una que no existe, ese error. La nuestra era la
    # de un temporal o un nombre suelto, y la de los hechos a mano
    # («H:\Mi unidad\...\INTEGRAL.cex») se rompe al mover la carpeta de estado.
    # Lo que NO recoge un conjunto: la ventilacion y la masa de las particiones
    # del previsto (son datos generales, no medidas), asi que su ahorro no es
    # exactamente el del previsto. Se acepto asi.
    dn = m.datosNuevoEdificio
    orig = m.datosEdificioOriginal
    inst = list(dn.datosInstalaciones or [])
    env0 = list(orig.datosEnvolvente or [[], [], []])
    env1 = list(dn.datosEnvolvente or [[], [], []])
    mme = _medidas_envolvente(env0, env1)
    SALIDA['envolvente'] = [[_txt(x[0]), _txt(x[1])] for x in mme]
    del FRAME.listadoConjuntosMMUsuario[:]
    from MedidasDeMejora import objetoGrupoMejoras as OGM
    m = OGM.grupoMedidasMejora(_u('NOMBRE') or u'CEE PREVISTO', orig, [mme, [u'', inst, True]],
                               _u('CARACTERISTICAS'), _u('OTROS'), u'1',
                               _u('JUSTIFICACION') or _u('CARACTERISTICAS'), True)
    # Los cerramientos, huecos, puentes y sistemas «mejorados» los deduce CE3X de
    # `mejoras` (`incluirMedidas`), que es lo que hace al aceptar el dialogo y lo
    # que usa al calcular: pisarlos con los del previsto no cambia el calculo y
    # dejaria el fichero diciendo una cosa y calculando otra. Las placas (3.x)
    # van ademas en su listado, como en `construir_medida`.
    for i, attr in enumerate(ORDEN_MM):
        setattr(m, attr, list(inst[i]) if i < len(inst) and isinstance(inst[i], list) else [])
    m.listadoGeneradoresTermosolarMM = list(inst[12]) if len(inst) > 12 and isinstance(inst[12], list) else []
    m.listadoGeneradoresElectricoMM = list(inst[13]) if len(inst) > 13 and isinstance(inst[13], list) else []
    m.datosInstalaciones = inst
    m.medidasMejoraEnvolvente = mme
    m.incluirMedidas()
    FRAME.listadoConjuntosMMUsuario.append(m)

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
    # Las filas del conjunto en el resumen economico (la tabla `listaMedidas`,
    # que se guarda en el pickle 6 y de la que el XML saca el coste):
    # `incluirMedidas` escribe una por pieza («Nuevas Instalaciones», «Sustitucion/
    # mejora de Huecos», «Adicion de Aislamiento Termico»), sin coste. La
    # inversion de la obra va ENTERA en la primera y 0 en las demas: el
    # presupuesto es uno, sin desglose por pieza.
    primera = True
    for pc in pcs:
        g = getattr(pc, 'listaMedidas', None)
        if g is None:
            continue
        for i in range(g.GetNumberRows()):
            if g.GetCellValue(i, 1) != m.nombre:
                continue
            if TEXTOS.get('vida_util') not in (None, ''):
                g.SetCellValue(i, 3, unicode(float(TEXTOS['vida_util'])))
            if TEXTOS.get('inversion') not in (None, ''):
                g.SetCellValue(i, 4, unicode(float(TEXTOS['inversion']) if primera else 0.0))
            g.SetCellValue(i, 5, unicode(float(TEXTOS.get('coste_mantenimiento') or 0)))
            primera = False
        primera = True
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
    # Un conjunto recien creado NO lo calcula `calculoMedidasUsuario` (vuelve sin
    # ahorro y sin edificio mejorado, y el XML revienta en el analisis economico
    # con «'NoneType' object has no attribute 'casoValido'»): se calcula como en
    # `cex_a_xml.py`.
    if not getattr(m, 'datosNuevoEdificio', None) or not getattr(m, 'ahorro', None):
        m.calificacion()
        m.calcularAhorros()
    SALIDA['log'] += list(LOG)
    for gm in FRAME.listadoConjuntosMMUsuario or []:
        st = gm.__dict__
        nuevo = st.get('datosNuevoEdificio')
        rr = getattr(getattr(nuevo, 'datosResultados', None), '__dict__', {}) or {}
        SALIDA['medidas'].append({
            'clase': gm.__class__.__name__, 'nombre': _txt(st.get('nombre')),
            'ahorro': [_txt(x) for x in (st.get('ahorro') or [])],
            'calculada': bool(getattr(nuevo, 'casoValido', False)),
            'demanda_cal': rr.get('ddaBrutaCal'), 'epnr': rr.get('enPrimNoRen'),
            'emisiones': rr.get('emisiones'),
            'puentes_psi_l': _psi_l((getattr(nuevo, 'datosEnvolvente', None) or [[], [], []])[2]),
            'huecos': [u'%s %s Uv=%s Um=%s %%marco=%s' % (h.descripcion, h.orientacion, h.Uvidrio, h.Umarco, h.porcMarco)
                       for h in (getattr(nuevo, 'datosEnvolvente', None) or [[], []])[1]],
        })

    del LOG[:]
    FRAME.filename = os.environ['SALIDA_CEX']
    FRAME.OnMenuFileSaveMenu(None)
    SALIDA['guardado'] = os.path.exists(os.environ['SALIDA_CEX'])
    SALIDA['log'] += list(LOG)
    if os.environ.get('XML'):
        sys.exc_clear()
        # Las tablas del panel de RESULTADOS del analisis economico se dimensionan
        # al ABRIR el fichero, con las medidas que traia. Si el inicial llego SIN
        # medidas (uno del tecnico, o uno pasado de la 2.3 a la 3.1), tienen 0
        # filas y el XML revienta al escribir la de la medida nueva («invalid row
        # or column index in wxGridStringTable», medido en 26RES080_87,
        # 07/10/2026). Se les dan las filas que faltan antes de pedir el XML.
        _filas_resultados(len(FRAME.listadoConjuntosMMUsuario or []))
        SALIDA['xml'] = generar_xml(os.environ['XML'])
except RuntimeError as e:
    SALIDA['error'] = str(e)
except Exception:
    import traceback
    SALIDA['error'] = traceback.format_exc().decode('utf-8', 'replace')

f = open(os.environ['RESULTADO'], 'wb')
f.write(json.dumps(SALIDA, default=_txt))
f.close()
