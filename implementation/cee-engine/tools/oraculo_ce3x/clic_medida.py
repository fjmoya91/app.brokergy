# Simula en CE3X (sin ventana) el CLIC en cada conjunto del arbol de «Medidas de
# mejora» y en cada medida de dentro, y anota el error del manejador si lo hay:
# en la pantalla ese error es un panel que se queda EN BLANCO, sin mensaje.
#
#   CASO=C:\ruta\x.cex [RUTA=C:\ruta\previsto.cex]   (con el runner de cexAPdf)
#
# RUTA: apunta las medidas «Nuevo Edificio» a ese .cex antes de pulsar (asi se
# vio que releen el previsto de fuera: con la ruta buena abren, sin ella no).
#
# Tres cosas del arnes, medidas en CE3X 3.2 (26RES080_82, 10/10/2026):
#  · `abreArchivoCEX` usa la barra de progreso de la ventana (`barraEstado`), que
#    sin ventana no existe;
#  · el panel de la derecha (`PanelVacio`) lo crea la ventana al pintarse;
#  · sin calificar el edificio antes, el primer clic falla en la comparativa
#    («'NoneType' object has no attribute 'datosResultados'»): en la pantalla
#    siempre se califica al abrir.
import os, sys, traceback
D = os.environ['ORACULO_DIR']
execfile(os.path.join(D, 'headless.py'))
import wx
CASO = os.environ['CASO']


class _Barra(object):
    def __getattr__(self, n):
        return lambda *a, **k: None
FRAME.barraEstado = _Barra()

ERRORES = []
sys.excepthook = lambda t, v, tb: ERRORES.append(''.join(traceback.format_exception(t, v, tb)))

FRAME.abreArchivoCEX(CASO, False, False)
FRAME.filename = CASO
log(u'version ' + unicode(getattr(FRAME, 'versionArchivoGuardado', None)))
FRAME.calculoCalificacion(False)
if os.environ.get('RUTA'):
    for m in FRAME.listadoConjuntosMMUsuario or []:
        if m.__class__.__name__ == 'mejoraEdificioCompleto':
            m.mejoras = os.environ['RUTA'].decode('mbcs')
            log(u'mejoras -> %s (existe: %s)' % (m.mejoras, os.path.exists(m.mejoras)))

P = FRAME.panelMedidasMejora
ARBOLES = [getattr(P, a) for a in dir(P) if isinstance(getattr(P, a, None), wx.TreeCtrl)]
for t in ARBOLES:
    P.cargarArbol(t)


def recorrer(t, item, prof=0):
    yield item, prof
    hijo, c = t.GetFirstChild(item)
    while hijo.IsOk():
        for x in recorrer(t, hijo, prof + 1):
            yield x
        hijo, c = t.GetNextChild(item, c)


def panel():
    return [w.__class__.__name__ for w in P.GetChildren()
            if w.IsShown() and w.GetName() == 'PanelVacio']

for t in ARBOLES:
    raiz = t.GetRootItem()
    if not raiz.IsOk():
        log(u'arbol vacio')
        continue
    for item, prof in recorrer(t, raiz):
        # El manejador destruye el panel de la derecha y pone otro; si fallo el
        # anterior, el que queda esta muerto y hay que darle uno vivo.
        if not getattr(P, 'PanelVacio', None):
            P.PanelVacio = wx.Panel(P, name='PanelVacio')
        del ERRORES[:]
        try:
            t.SelectItem(item)
            wx.SafeYield()
        except Exception:
            ERRORES.append(traceback.format_exc())
        log(u'%sCLIC %s -> %s' % (u'  ' * prof, t.GetItemText(item), u', '.join(panel()) or u'(nada)'))
        for e in ERRORES:
            log(u'   ERROR: ' + e.decode('utf-8', 'replace')[-900:])
