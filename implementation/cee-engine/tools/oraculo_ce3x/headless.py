# Arnes: crea la ventana de CE3X 3.1 SIN mostrarla y neutraliza los dialogos.
import wx, os, sys
LOG = []
def log(*a):
    s = ' '.join(unicode(x) if not isinstance(x, unicode) else x for x in a)
    LOG.append(s)
    try: print (u'[CE3X] ' + s).encode('utf-8')
    except Exception: print '[CE3X] (texto no imprimible)'
def _mb(msg='', caption='', style=0, parent=None, *a, **k):
    log(u'MessageBox:', caption, u'|', msg)
    import sys, traceback
    ei = sys.exc_info()
    if ei[0] is not None:
        log(u'  (excepcion en curso) ' + ''.join(traceback.format_exception(*ei)).decode('utf-8', 'replace'))
    return wx.OK
wx.MessageBox = _mb
_md_init = wx.MessageDialog.__init__
def _md_show(self):
    try: log(u'MessageDialog:', self.GetTitle(), u'|', self.GetMessage())
    except Exception as e: log(u'MessageDialog (?)', e)
    return wx.ID_YES
wx.MessageDialog.ShowModal = _md_show
DIALOG_RESULT = {}
def _dlg_show(self):
    try: log(u'Dialog.ShowModal:', self.__class__.__name__, self.GetTitle())
    except Exception: log(u'Dialog.ShowModal:', self.__class__.__name__)
    if self.__class__.__module__ == 'Informes.chequeoInforme':
        self.EndModal = lambda code: DIALOG_RESULT.__setitem__('code', code)
        try:
            self.OnGenerarInformeBotonButton(None)
        except Exception:
            import traceback; log(u'  error en Opciones del Informe: ' + traceback.format_exc().decode('utf-8', 'replace'))
        return DIALOG_RESULT.get('code', wx.ID_OK)
    return wx.ID_OK
wx.Dialog.ShowModal = _dlg_show
class _Prog(object):
    def __init__(self, *a, **k): log(u'ProgressDialog:', a[:2])
    def Update(self, *a, **k): return (True, False)
    def Pulse(self, *a, **k): return (True, False)
    def Destroy(self): pass
    def Close(self): pass
    def Show(self, *a): pass
    def Hide(self): pass
    def SetSize(self, *a): pass
    def Raise(self): pass
    def __getattr__(self, n): return lambda *a, **k: None
wx.ProgressDialog = _Prog
wx.Frame.Show = lambda self, *a, **k: True
import __builtin__
__builtin__.modoDesarrollador = False
import directorios, idioma
idioma.ini()
APP = wx.App(False)
__builtin__.application = APP
import wxFrame1 as M
FRAME = M.wxFrame1(None)
APP.main = FRAME
log(u'frame creado')
