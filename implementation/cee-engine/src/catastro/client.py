"""Cliente HTTP contra Catastro: cache-first, reintentos con backoff y sin rafagas (§19).

Reglas heredadas de implementation/backend/services/catastroService.js, que estan
medidas contra el WAF del Catastro desde IPs de datacenter:

  * IPv4 forzado (Happy Eyeballs sobre IPv6 dispara el WAF).
  * Orden de cabeceras EXACTO: User-Agent, Accept, Accept-Encoding: identity.
  * User-Agent identificable y generico. Los UA muy especificos (Chrome de
    escritorio completo, curl/*, PostmanRuntime/*) estan bloqueados.
  * Nada de peticiones en paralelo: siempre en serie con pausa entre ellas.

Por eso NO se usa `requests` (impone su propio orden de cabeceras): se habla
http.client directamente, igual que el helper de Node usa http.request pelado.
"""
from __future__ import annotations

import gzip
import hashlib
import http.client
import json
import logging
import os
import socket
import ssl
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlencode, urlsplit

log = logging.getLogger(__name__)

USER_AGENT = "Mozilla/5.0 (compatible; Brokergy-Geometry/1.0; +https://app.brokergy.es)"

#: Cadenas con las que el WAF / el limitador del Catastro contesta.
_MARCAS_BLOQUEO = (
    "no se puede procesar su peticion",
    "no se puede procesar su petición",
    "limite de peticiones",
    "límite de peticiones",
    "peticion denegada",
    "petición denegada",
)


class CatastroError(RuntimeError):
    """Fallo hablando con Catastro. Nunca se traduce en datos inventados."""
    code = "CATASTRO_ERROR"


class CatastroUnreachable(CatastroError):
    code = "CATASTRO_UNREACHABLE"


class CatastroBlocked(CatastroError):
    """El WAF o el limitador nos ha cortado. No insistir."""
    code = "CATASTRO_RATE_LIMITED"


@dataclass
class Call:
    """Una llamada, para la traza (§20)."""
    url: str
    status: int | None
    bytes: int
    from_cache: bool
    seconds: float
    error: str | None = None

    def to_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass
class CatastroClient:
    cache_dir: Path
    timeout: float = 30.0
    retries: int = 4
    backoff_base: float = 2.0
    pause_between_calls: float = 0.8   # segundos; el WAF rechaza rafagas
    offline: bool = False              # solo cache, no se toca la red
    refresh: bool = False              # ignora la cache y vuelve a pedir
    #: Directorio con respuestas guardadas a mano, servidas POR NOMBRE.
    #: Solo para tests y para la autoprueba: nunca toca la red.
    fixture_dir: Path | None = None
    calls: list[Call] = field(default_factory=list)
    _last_call_at: float = 0.0

    def __post_init__(self) -> None:
        self.cache_dir = Path(self.cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ cache
    def _cache_path(self, name: str, url: str) -> Path:
        h = hashlib.sha1(url.encode("utf-8")).hexdigest()[:10]
        return self.cache_dir / f"{name}.{h}.bin"

    def _meta_path(self, p: Path) -> Path:
        return p.with_suffix(".meta.json")

    # ------------------------------------------------------------------- http
    def _raw_get(self, url: str, accept: str) -> tuple[int, bytes, dict]:
        parts = urlsplit(url)
        host = parts.hostname
        port = parts.port or (443 if parts.scheme == "https" else 80)
        path = parts.path + (("?" + parts.query) if parts.query else "")

        proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        ctx = ssl.create_default_context()
        cafile = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
        if cafile and Path(cafile).exists():
            ctx.load_verify_locations(cafile)

        if proxy:
            pp = urlsplit(proxy if "//" in proxy else f"http://{proxy}")
            conn = http.client.HTTPSConnection(pp.hostname, pp.port or 8080,
                                               timeout=self.timeout, context=ctx)
            conn.set_tunnel(host, port)
        else:
            # IPv4 forzado: resolvemos a mano y conectamos por A record.
            infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
            if not infos:
                raise CatastroUnreachable(f"sin registro A (IPv4) para {host}")
            ip = infos[0][4][0]
            conn = http.client.HTTPSConnection(ip, port, timeout=self.timeout, context=ctx)
            conn.host = host  # SNI + Host correctos aunque conectemos por IP

        try:
            conn.putrequest("GET", path, skip_host=True, skip_accept_encoding=True)
            # El ORDEN importa (ver cabecera del modulo).
            conn.putheader("Host", host)
            conn.putheader("User-Agent", USER_AGENT)
            conn.putheader("Accept", accept)
            conn.putheader("Accept-Encoding", "identity")
            conn.putheader("Connection", "close")
            conn.endheaders()
            resp = conn.getresponse()
            body = resp.read()
            headers = {k.lower(): v for k, v in resp.getheaders()}
            if headers.get("content-encoding") == "gzip":
                body = gzip.decompress(body)
            return resp.status, body, headers
        finally:
            conn.close()

    @staticmethod
    def _looks_blocked(status: int, body: bytes) -> bool:
        if status == 403:
            return True
        texto = body[:4000].decode("utf-8", "ignore").lower()
        return any(m in texto for m in _MARCAS_BLOQUEO)

    def _throttle(self) -> None:
        delta = time.monotonic() - self._last_call_at
        if self._last_call_at and delta < self.pause_between_calls:
            time.sleep(self.pause_between_calls - delta)

    # ------------------------------------------------------------------- api
    #: mismo valor que manda produccion a los WCF JSON.
    ACCEPT_JSON = "application/json"

    def get(self, url: str, params: dict | None = None, *, name: str,
            accept: str | None = None) -> bytes:
        """Descarga (o lee de cache) una respuesta y la deja cruda en disco.

        `name` es el nombre con el que se guarda en cache/raw, para poder
        inspeccionar exactamente que devolvio Catastro (§4).
        """
        if params:
            url = f"{url}{'&' if '?' in url else '?'}{urlencode(params)}"
        if self.fixture_dir is not None:
            for ext in (".xml", ".gml", ".json", ".bin"):
                f = Path(self.fixture_dir) / f"{name}{ext}"
                if f.exists():
                    body = f.read_bytes()
                    self.calls.append(Call(f"fixture://{name}{ext}", None,
                                           len(body), True, 0.0))
                    return body
            raise CatastroUnreachable(
                f"no hay fixture para '{name}' en {self.fixture_dir}")

        cache = self._cache_path(name, url)

        if cache.exists() and not self.refresh:
            body = cache.read_bytes()
            self.calls.append(Call(url, None, len(body), True, 0.0))
            log.info("cache  %s (%d B) %s", name, len(body), url)
            return body

        if self.offline:
            raise CatastroUnreachable(
                f"modo offline y no hay nada en cache para '{name}'. "
                f"Ejecuta primero `brokergy-geometry fetch` con salida a Internet. URL: {url}"
            )

        last: Exception | None = None
        for intento in range(self.retries + 1):
            t0 = time.monotonic()
            try:
                self._throttle()
                status, body, _ = self._raw_get(url, accept or self.ACCEPT_JSON)
                self._last_call_at = time.monotonic()
                dt = time.monotonic() - t0

                if self._looks_blocked(status, body):
                    self.calls.append(Call(url, status, len(body), False, dt, "BLOQUEADO"))
                    raise CatastroBlocked(
                        f"Catastro ha rechazado la peticion (status {status}). "
                        f"Suele liberarse solo en 30-60 min. URL: {url}"
                    )
                if status >= 500 or status == 429:
                    raise CatastroUnreachable(f"status {status} de Catastro")
                if status >= 400:
                    self.calls.append(Call(url, status, len(body), False, dt, f"HTTP {status}"))
                    raise CatastroError(f"status {status} de Catastro. URL: {url}")

                self.calls.append(Call(url, status, len(body), False, dt))
                cache.write_bytes(body)
                self._meta_path(cache).write_text(json.dumps(
                    {"url": url, "status": status, "bytes": len(body),
                     "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")},
                    indent=2), encoding="utf-8")
                log.info("GET    %s (%d B en %.1fs)", name, len(body), dt)
                return body

            except CatastroBlocked:
                raise                                   # no se insiste al WAF
            except (OSError, http.client.HTTPException, CatastroUnreachable) as exc:
                last = exc
                self._last_call_at = time.monotonic()
                if intento < self.retries:
                    espera = self.backoff_base ** (intento + 1)
                    log.warning("fallo %s (%s). Reintento %d/%d en %.0fs",
                                name, exc, intento + 1, self.retries, espera)
                    time.sleep(espera)

        self.calls.append(Call(url, None, 0, False, 0.0, str(last)))
        raise CatastroUnreachable(f"no se pudo contactar con Catastro tras "
                                  f"{self.retries + 1} intentos: {last}. URL: {url}")

    def dump_raw(self, body: bytes, destino: Path) -> Path:
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_bytes(body)
        return destino

    def trace(self) -> list[dict]:
        return [c.to_dict() for c in self.calls]
