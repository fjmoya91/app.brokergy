"""Los PRODUCTOS de la Sede Electronica del Catastro para una parcela.

POR QUE EXISTE
--------------
Los servicios publicos automatizables (WCF JSON + INSPIRE) dan el USO y la
SUPERFICIE de cada construccion (`lcons`) y la geometria del edificio, pero no
dicen DONDE esta cada uso: que poligono es el garaje y cual la vivienda. Eso esta
en el CROQUIS CATASTRAL por plantas, y la Sede lo publica sin identificacion ni
captcha en la ficha de la parcela del visor cartografico ("Informacion de
parcelas e inmuebles" -> "Mas informacion de la parcela"):

  * Distribucion por plantas de la parcela en FXCC  (ZIP: .DXF + .ASC)
  * Documento de la distribucion por plantas (PDF)  (el croquis, planta a planta)
  * Parcela por plantas en formato KML              (3D, una capa por planta)
  * Parcela en formato KML                          (3D de la parcela)
  * Parcela y colindantes en FXCC                   (ZIP, una carpeta por parcela)

COMO SE PIDE (medido el 2026-10-05 sobre 8480109VH9888S)
--------------------------------------------------------
Cada enlace es un *postback* de ASP.NET de la pagina
`/CYCBienInmueble/OVCListaBienes.aspx?origen=Carto&huso=3857&x=..&y=..` (la que
abre el visor al pulsar un punto): `PonRefCat(del, mun, rc, control)` rellena
tres campos ocultos y hace `__doPostBack(control)`; la respuesta REDIRIGE a la
descarga (`/Cartografia/FXCC/DescargaFXCC.aspx?refcat=..&captcha=<token>`, ...).
El token lo pone la propia Sede en esa redireccion: aqui no se resuelve ningun
captcha ni se adivina ninguna URL. Se hace exactamente lo que hace el navegador.

REGLAS (las del cliente de `client.py`, por el mismo WAF):
  * IPv4 forzado, orden de cabeceras fijo, User-Agent identificable.
  * EN SERIE y con pausa entre peticiones; un candado de proceso impide que dos
    mediciones simultaneas hagan rafaga.
  * Cache en disco por parcela (30 dias): el croquis catastral cambia poco y
    cada descarga son dos peticiones.
  * Un FALLO tambien se recuerda (6 h): si la Sede no responde o nos corta, no
    se insiste en cada medicion. Un bloqueo para TODO lo pendiente.
  * Nada de esto tumba una medicion: quien lo llama recibe los fallos escritos.
"""
from __future__ import annotations

import html as html_mod
import http.client
import json
import logging
import os
import re
import socket
import ssl
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit

from .client import USER_AGENT, _MARCAS_BLOQUEO, CatastroBlocked, CatastroError

log = logging.getLogger(__name__)

SEDE = "https://www1.sedecatastro.gob.es"
FICHA = "/CYCBienInmueble/OVCListaBienes.aspx"

#: Dos mediciones a la vez (FastAPI atiende en un pool de hilos) no pueden
#: hacer rafaga contra la Sede: todo lo que sale de aqui va de uno en uno.
_CANDADO = threading.Lock()


@dataclass(frozen=True)
class Producto:
    clave: str
    boton: str        # el control ASP.NET que dispara el postback
    ext: str
    titulo: str       # como lo llama la Sede
    mime: str


#: Lo que se descarga, con el control que lo pide. Los dos GML de la ficha
#: (parcela y edificio) NO estan: por esta via llegan vacios, y el motor ya
#: los trae por INSPIRE (`inspire.py`).
PRODUCTOS: dict[str, Producto] = {p.clave: p for p in (
    Producto("fxcc_plantas", "ctl00$Contenido$btnFXCCDes", "zip",
             "Distribucion por plantas de la parcela en FXCC", "application/zip"),
    Producto("croquis_pdf", "ctl00$Contenido$btnPDFFXCC", "pdf",
             "Documento de la distribucion por plantas de la parcela (PDF)", "application/pdf"),
    Producto("kml_plantas", "ctl00$Contenido$btnFXCCVer", "kml",
             "Parcela por plantas en formato KML", "application/vnd.google-earth.kml+xml"),
    Producto("kml_3d", "ctl00$Contenido$btnVerFXCC", "kml",
             "Parcela en formato KML", "application/vnd.google-earth.kml+xml"),
    Producto("fxcc_colindantes", "ctl00$Contenido$btnFXCCColindantes", "zip",
             "Parcela y colindantes en FXCC", "application/zip"),
)}

#: Lo que necesita el MOTOR para medir: el resto es para las personas.
PARA_MEDIR = ("fxcc_plantas",)


@dataclass
class Fichero:
    clave: str
    datos: bytes
    nombre: str           # el que propone la Sede (Content-Disposition)
    mime: str
    url: str | None
    fecha: str            # cuando se bajo
    de_cache: bool = False

    def meta(self) -> dict:
        return {"clave": self.clave, "nombre": self.nombre, "mime": self.mime,
                "url": self.url, "fecha": self.fecha, "bytes": len(self.datos)}


@dataclass
class Descarga:
    parcela: str
    ficheros: dict[str, Fichero] = field(default_factory=dict)
    fallos: dict[str, str] = field(default_factory=dict)
    delegacion: str | None = None
    municipio: str | None = None
    refcat: str | None = None
    peticiones: int = 0

    def resumen(self) -> dict:
        return {"parcela": self.parcela, "refcat": self.refcat,
                "delegacion": self.delegacion, "municipio": self.municipio,
                "ficheros": {k: f.meta() | {"de_cache": f.de_cache}
                             for k, f in self.ficheros.items()},
                "fallos": dict(self.fallos), "peticiones": self.peticiones}


# ----------------------------------------------------------- lo que es puro
def campos_del_formulario(pagina: str) -> dict[str, str]:
    """Los campos que el navegador mandaria en el postback (ocultos y de texto).

    Los botones no viajan: el que dispara la descarga va en __EVENTTARGET.
    Los valores vienen escapados en el HTML (`&amp;`) y se mandan sin escapar.
    """
    campos: dict[str, str] = {}
    for tag in re.findall(r"<input\b[^>]*>", pagina, flags=re.I):
        n = re.search(r'\bname="([^"]+)"', tag)
        if not n:
            continue
        t = re.search(r'\btype="([^"]+)"', tag)
        if t and t.group(1).lower() in ("submit", "button", "checkbox", "radio", "image", "file"):
            continue
        v = re.search(r'\bvalue="([^"]*)"', tag)
        campos[n.group(1)] = html_mod.unescape(v.group(1)) if v else ""
    return campos


def ref_de_la_ficha(pagina: str, parcela: str) -> tuple[str, str, str] | None:
    """(delegacion, municipio, referencia) de NUESTRA parcela en la ficha.

    La ficha de un punto puede listar varias referencias; solo vale la que
    empieza por la parcela pedida. Sin ella no se descarga nada: bajar el
    croquis de la parcela de al lado es peor que no tenerlo.
    """
    # Los argumentos vienen escapados dentro de los atributos (`&#39;13&#39;`).
    # En el HTML que sirve el servidor estan en `CargarBien('13','93','U','RC',…)`
    # y en los enlaces de la ficha (`…?del=13&mun=93&refcat=RC`); los
    # `PonRefCat(…)` de «Mas informacion» los pone despues el JavaScript.
    texto = html_mod.unescape(pagina)
    candidatos = re.findall(
        r"(?:PonRefCat|CargarBien)\('(\d{1,2})'\s*,\s*'(\d{1,3})'\s*,\s*(?:'[A-Z]?'\s*,\s*)?'([0-9A-Z]{14,20})'",
        texto)
    candidatos += re.findall(r"[?&]del=(\d{1,2})&mun=(\d{1,3})&refcat=([0-9A-Z]{14,20})", texto)
    candidatos += [(d, m, rc) for rc, d, m in re.findall(
        r"[?&]refcat=([0-9A-Z]{14,20})&del=(\d{1,2})&mun=(\d{1,3})", texto)]
    for d, m, rc in candidatos:
        if rc.upper().startswith(parcela.upper()):
            return d, m, rc.upper()
    return None


def es_fichero(producto: Producto, cabeceras: dict, cuerpo: bytes) -> bool:
    """Lo que ha vuelto ES el fichero, y no la pagina otra vez.

    Se mira la firma del contenido, no solo la cabecera: la Sede sirve el PDF
    como `application/x-unknown`.
    """
    if not cuerpo:
        return False
    if producto.ext == "zip":
        return cuerpo[:2] == b"PK"
    if producto.ext == "pdf":
        return cuerpo[:5] == b"%PDF-"
    if producto.ext == "kml":
        cab = cuerpo[:600].lower()
        return b"<kml" in cab
    ct = str(cabeceras.get("content-type", "")).lower()
    return "text/html" not in ct


def nombre_propuesto(cabeceras: dict, producto: Producto, parcela: str) -> str:
    cd = str(cabeceras.get("content-disposition", ""))
    m = re.search(r'filename="?([^";]+)"?', cd)
    return m.group(1).strip() if m else f"{parcela}_{producto.clave}.{producto.ext}"


def _bloqueado(status: int, cuerpo: bytes) -> bool:
    if status == 403:
        return True
    texto = cuerpo[:4000].decode("utf-8", "ignore").lower()
    return any(m in texto for m in _MARCAS_BLOQUEO)


# -------------------------------------------------------------------- red
class SedeCatastro:
    """Descarga (o lee de cache) los productos de la Sede para una parcela."""

    def __init__(self, cache_dir: Path, *, timeout: float = 45.0, pausa: float = 1.5,
                 offline: bool = False, refresh: bool = False,
                 ttl_dias: float | None = None, reintento_horas: float | None = None):
        self.cache_dir = Path(cache_dir)
        self.timeout = timeout
        self.pausa = pausa
        self.offline = offline
        self.refresh = refresh
        self.ttl = 86400 * float(ttl_dias if ttl_dias is not None
                                 else os.environ.get("CEE_SEDE_TTL_DIAS", 30))
        self.reintento = 3600 * float(reintento_horas if reintento_horas is not None
                                      else os.environ.get("CEE_SEDE_REINTENTO_H", 6))
        self._cookies: dict[str, dict[str, str]] = {}
        self._ultima = 0.0
        self.peticiones = 0

    # ------------------------------------------------------------- cache
    def _dir(self, parcela: str) -> Path:
        d = self.cache_dir / "sede" / parcela
        d.mkdir(parents=True, exist_ok=True)
        return d

    def _de_cache(self, parcela: str, p: Producto) -> Fichero | None:
        d = self._dir(parcela)
        f, meta = d / f"{p.clave}.{p.ext}", d / f"{p.clave}.meta.json"
        if not f.is_file() or not meta.is_file():
            return None
        try:
            m = json.loads(meta.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if not self.offline and time.time() - float(m.get("t", 0)) > self.ttl:
            return None
        return Fichero(p.clave, f.read_bytes(), m.get("nombre") or f.name,
                       m.get("mime") or p.mime, m.get("url"), m.get("fecha") or "",
                       de_cache=True)

    def _fallo_reciente(self, parcela: str, p: Producto) -> str | None:
        f = self._dir(parcela) / f"{p.clave}.fallo.json"
        if not f.is_file():
            return None
        try:
            m = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None
        if time.time() - float(m.get("t", 0)) > self.reintento:
            return None
        return str(m.get("error") or "fallo anterior")

    def _guardar(self, parcela: str, fich: Fichero) -> None:
        d = self._dir(parcela)
        p = PRODUCTOS[fich.clave]
        (d / f"{p.clave}.{p.ext}").write_bytes(fich.datos)
        (d / f"{p.clave}.meta.json").write_text(json.dumps(
            fich.meta() | {"t": time.time()}, ensure_ascii=False, indent=1), encoding="utf-8")
        (d / f"{p.clave}.fallo.json").unlink(missing_ok=True)

    def _apuntar_fallo(self, parcela: str, clave: str, error: str) -> None:
        (self._dir(parcela) / f"{clave}.fallo.json").write_text(
            json.dumps({"t": time.time(), "error": error}, ensure_ascii=False), encoding="utf-8")

    # --------------------------------------------------------------- http
    def _pedir(self, metodo: str, url: str, cuerpo: bytes | None = None,
               extra: list[tuple[str, str]] | None = None) -> tuple[int, dict, bytes, str]:
        """Una peticion, siguiendo redirecciones y guardando las cookies."""
        for _ in range(6):
            if self._ultima:
                espera = self.pausa - (time.monotonic() - self._ultima)
                if espera > 0:
                    time.sleep(espera)
            partes = urlsplit(url)
            host = partes.hostname or ""
            puerto = partes.port or 443
            ruta = partes.path + (f"?{partes.query}" if partes.query else "")
            ctx = ssl.create_default_context()
            infos = socket.getaddrinfo(host, puerto, socket.AF_INET, socket.SOCK_STREAM)
            if not infos:
                raise CatastroError(f"sin registro A (IPv4) para {host}")
            conn = http.client.HTTPSConnection(infos[0][4][0], puerto,
                                               timeout=self.timeout, context=ctx)
            conn.host = host
            try:
                conn.putrequest(metodo, ruta, skip_host=True, skip_accept_encoding=True)
                conn.putheader("Host", host)
                conn.putheader("User-Agent", USER_AGENT)
                conn.putheader("Accept", "*/*")
                conn.putheader("Accept-Encoding", "identity")
                galletas = self._cookies.get(host) or {}
                if galletas:
                    conn.putheader("Cookie", "; ".join(f"{k}={v}" for k, v in galletas.items()))
                for k, v in extra or []:
                    conn.putheader(k, v)
                if cuerpo is not None:
                    conn.putheader("Content-Length", str(len(cuerpo)))
                conn.putheader("Connection", "close")
                conn.endheaders(cuerpo)
                resp = conn.getresponse()
                datos = resp.read()
                cab: dict[str, str] = {}
                for k, v in resp.getheaders():
                    if k.lower() == "set-cookie":
                        nv = v.split(";", 1)[0]
                        if "=" in nv:
                            n, val = nv.split("=", 1)
                            self._cookies.setdefault(host, {})[n.strip()] = val.strip()
                    else:
                        cab[k.lower()] = v
                status = resp.status
            finally:
                conn.close()
                self._ultima = time.monotonic()
                self.peticiones += 1
            if status in (301, 302, 303, 307, 308) and cab.get("location"):
                url = urljoin(url, cab["location"])
                if status in (301, 302, 303):
                    metodo, cuerpo, extra = "GET", None, None
                continue
            return status, cab, datos, url
        raise CatastroError("demasiadas redirecciones en la Sede del Catastro")

    # ---------------------------------------------------------------- api
    def traer(self, parcela: str, x3857: float, y3857: float,
              productos=PARA_MEDIR) -> Descarga:
        """Los productos pedidos de la parcela. Nunca lanza: lo que falla va a
        `fallos` con su motivo."""
        parcela = parcela.upper()[:14]
        res = Descarga(parcela)
        pendientes: list[Producto] = []
        for clave in productos:
            p = PRODUCTOS.get(clave)
            if p is None:
                res.fallos[clave] = "producto desconocido"
                continue
            fich = None if self.refresh else self._de_cache(parcela, p)
            if fich is not None:
                res.ficheros[clave] = fich
                continue
            fallo = None if self.refresh else self._fallo_reciente(parcela, p)
            if fallo:
                res.fallos[clave] = f"no se reintenta todavia: {fallo}"
                continue
            if self.offline:
                res.fallos[clave] = "modo sin conexion y no esta en cache"
                continue
            pendientes.append(p)
        if not pendientes:
            return res

        with _CANDADO:
            try:
                self._bajar(res, pendientes, x3857, y3857)
            except CatastroBlocked as exc:
                for p in pendientes:
                    if p.clave not in res.ficheros:
                        res.fallos[p.clave] = str(exc)
                        self._apuntar_fallo(parcela, p.clave, str(exc))
            except Exception as exc:                       # noqa: BLE001
                log.warning("Sede del Catastro (%s): %s", parcela, exc)
                for p in pendientes:
                    if p.clave not in res.ficheros and p.clave not in res.fallos:
                        res.fallos[p.clave] = str(exc)
                        self._apuntar_fallo(parcela, p.clave, str(exc))
        res.peticiones = self.peticiones
        return res

    def _bajar(self, res: Descarga, pendientes: list[Producto],
               x3857: float, y3857: float) -> None:
        url_ficha = (f"{SEDE}{FICHA}?" + urlencode(
            {"origen": "Carto", "huso": "3857", "x": f"{x3857:.2f}", "y": f"{y3857:.2f}"}))
        pagina = None
        campos: dict[str, str] = {}
        for p in pendientes:
            if pagina is None:
                st, _cab, cuerpo, _ = self._pedir("GET", url_ficha)
                if _bloqueado(st, cuerpo):
                    raise CatastroBlocked(f"la Sede del Catastro ha rechazado la peticion ({st})")
                if st >= 400:
                    raise CatastroError(f"la ficha de la parcela respondio {st}")
                pagina = cuerpo.decode("utf-8", "replace")
                ref = ref_de_la_ficha(pagina, res.parcela)
                if ref is None:
                    raise CatastroError(
                        "la ficha del punto no es de esta parcela (o no ofrece descargas)")
                res.delegacion, res.municipio, res.refcat = ref
                campos = campos_del_formulario(pagina)
            datos = dict(campos)
            for k in list(datos):
                if k.endswith("$hdDelegacion"):
                    datos[k] = res.delegacion
                elif k.endswith("$hdMunicipio"):
                    datos[k] = res.municipio
                elif k.endswith("$hdRC"):
                    datos[k] = res.refcat
            datos["__EVENTTARGET"] = p.boton
            datos["__EVENTARGUMENT"] = ""
            cuerpo_post = urlencode(datos).encode("utf-8")
            st, cab, cuerpo, url_final = self._pedir(
                "POST", url_ficha, cuerpo_post,
                [("Content-Type", "application/x-www-form-urlencoded"), ("Referer", url_ficha)])
            if _bloqueado(st, cuerpo):
                raise CatastroBlocked(f"la Sede del Catastro ha rechazado la descarga ({st})")
            if st >= 400 or not es_fichero(p, cab, cuerpo):
                motivo = (f"la Sede respondio {st}" if st >= 400
                          else "la Sede no ha devuelto el fichero (no lo ofrece para esta parcela)")
                res.fallos[p.clave] = motivo
                self._apuntar_fallo(res.parcela, p.clave, motivo)
                # La pagina pudo cambiar con el postback: se vuelve a pedir.
                pagina = None
                continue
            fich = Fichero(p.clave, cuerpo, nombre_propuesto(cab, p, res.parcela), p.mime,
                           url_final.split("&captcha=")[0],
                           time.strftime("%Y-%m-%dT%H:%M:%S%z"))
            self._guardar(res.parcela, fich)
            res.ficheros[p.clave] = fich
            log.info("Sede del Catastro: %s %s (%d B)", res.parcela, p.clave, len(cuerpo))
