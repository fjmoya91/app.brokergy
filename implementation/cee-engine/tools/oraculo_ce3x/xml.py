def generar_xml(ruta_xml):
    import os
    _gp, _sm = wx.FileDialog.GetPath, wx.FileDialog.ShowModal
    wx.FileDialog.GetPath = lambda self: ruta_xml
    wx.FileDialog.ShowModal = lambda self: wx.ID_OK
    try:
        del LOG[:]
        if not FRAME.filename:
            FRAME.filename = os.path.splitext(ruta_xml)[0] + '.cex'
        FRAME.OnGenerarArchivoXML(None, True)
    finally:
        wx.FileDialog.GetPath, wx.FileDialog.ShowModal = _gp, _sm
    return list(LOG)
