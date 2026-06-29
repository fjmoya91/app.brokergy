#!/usr/bin/env python3
"""
Cliente de datos: extrae un expediente de Supabase (Postgres) y lo normaliza
a la estructura que consumen los generadores.

Requiere variable de entorno DATABASE_URL (connection string de Supabase):
  postgresql://postgres:[PASSWORD]@db.okfeopwetlxdffrsbfqw.supabase.co:5432/postgres

Dependencia: psycopg (pip install "psycopg[binary]")
"""
import os
import json

try:
    import psycopg
except ImportError:  # permite usar normalizar() sin psycopg (modo from-json)
    psycopg = None

from lib.cargas_termicas import estimar_cargas


def _conn():
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Falta DATABASE_URL en el entorno")
    if psycopg is None:
        raise RuntimeError("psycopg no instalado: pip install 'psycopg[binary]'")
    return psycopg.connect(url)


SQL_EXPEDIENTE = """
SELECT e.numero_expediente, e.instalacion, e.cee, e.documentacion,
       o.id_oportunidad, o.ref_catastral, o.datos_calculo, o.is_reforma,
       c.nombre_razon_social, c.apellidos, c.dni, c.tlf, c.sexo,
       c.provincia AS cli_prov, c.municipio AS cli_muni,
       c.direccion AS cli_dir, c.codigo_postal AS cli_cp,
       e.instalador_asociado_id
FROM expedientes e
LEFT JOIN oportunidades o ON e.oportunidad_id = o.id
LEFT JOIN clientes c ON e.cliente_id = c.id_cliente
WHERE e.numero_expediente = %s;
"""

SQL_INSTALADOR = """
SELECT razon_social, cif, numero_carnet_rite,
       nombre_responsable, apellidos_responsable, nif_responsable,
       tecnico_firmante_dni, cargo, municipio
FROM prescriptores WHERE id_empresa = %s;
"""


def cargar_desde_supabase(numero_expediente: str) -> dict:
    """Lee el expediente + instalador de Supabase y devuelve el dict crudo."""
    with _conn() as conn, conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute(SQL_EXPEDIENTE, (numero_expediente,))
        exp = cur.fetchone()
        if not exp:
            raise ValueError(f"Expediente {numero_expediente} no encontrado")
        instalador = None
        inst_id = exp.get("instalador_asociado_id") or \
            (exp["instalacion"] or {}).get("instalador_id")
        if inst_id:
            cur.execute(SQL_INSTALADOR, (inst_id,))
            instalador = cur.fetchone()
    return {"exp": exp, "instalador": instalador}


def normalizar(raw: dict, fecha_firma: str = None) -> dict:
    """Convierte el dict crudo (Supabase o JSON de ejemplo) a la estructura
    que consumen mapeo.py y la guía JE6. Calcula cargas térmicas (opción B)."""
    exp = raw["exp"]
    inst = exp.get("instalacion") or {}
    cal = inst.get("aerotermia_cal") or {}
    acs = inst.get("aerotermia_acs") or {}
    dc = ((exp.get("datos_calculo") or {}).get("inputs")) or {}
    doc = exp.get("documentacion") or {}
    instalador = raw.get("instalador") or {}

    # Fecha de pruebas = fecha de factura; si no hay factura, se usa la fecha de
    # pruebas introducida a mano en la app (documentacion.fecha_pruebas_cert_instalacion).
    facturas = doc.get("facturas") or []
    fecha_factura = facturas[0].get("fecha_factura") if facturas else None
    fecha_pruebas = fecha_factura or doc.get("fecha_pruebas_cert_instalacion")

    superficie = dc.get("superficie")
    zona = dc.get("zona", "D3")
    plantas = dc.get("plantas", 2)
    emisor_raw = inst.get("tipo_emisor", "radiadores_convencionales")
    es_suelo = "suelo" in (emisor_raw or "")
    # Etiqueta del emisor (lo marcado en la app) para la tabla de cargas térmicas.
    emisor = "SUELO RADIANTE" if es_suelo else "RADIADORES"

    pot_cal = _f(cal.get("potencia"))
    # El ACS solo cuenta como equipo propio (potencia + acumulación aparte) si el
    # equipo de ACS es DISTINTO al de calefacción. Si es el mismo modelo, es una
    # única bomba de calor que da calor+ACS → no se rellena potencia/volumen ACS.
    _cal_mod = (cal.get("modelo") or "").strip().upper()
    _acs_mod = (acs.get("modelo") or "").strip().upper()
    acs_distinto = bool(_acs_mod) and _acs_mod != _cal_mod
    pot_acs = _f(acs.get("potencia")) if acs_distinto else 0.0

    # FIRMANTE del RITE (memoria + certificado). Si el instalador (empresa) marca
    # "técnico firmante distinto", el que firma el RITE es el TÉCNICO habilitado
    # (con su propio DNI y Nº de Carné), no el representante legal. El Nº Registro
    # Integrado Industrial de la EMPRESA es siempre `numero_carnet_rite`.
    # Nº Registro Integrado Industrial de la EMPRESA = numero_carnet_rite.
    num_empresa_rite = instalador.get("numero_carnet_rite", "") or ""
    _rep_nombre = " ".join(filter(None, [instalador.get("nombre_responsable"),
                                         instalador.get("apellidos_responsable")]))
    if instalador.get("es_autonomo"):
        # El autónomo ES el instalador: su numero_carnet_rite es su carné personal.
        nombre_firma = _rep_nombre
        nif_firma = instalador.get("nif_responsable") or instalador.get("tecnico_firmante_dni", "") or ""
        carnet_personal = num_empresa_rite
    elif instalador.get("tecnico_firmante_distinto"):
        # Empresa con técnico firmante distinto: firma el TÉCNICO con su carné.
        nombre_firma = " ".join(filter(None, [instalador.get("tecnico_firmante_nombre"),
                                              instalador.get("tecnico_firmante_apellidos")]))
        nif_firma = instalador.get("tecnico_firmante_dni", "") or ""
        carnet_personal = instalador.get("tecnico_firmante_carnet_rite", "") or ""
    else:
        # Empresa sin técnico distinto: firma el representante legal; el Nº de Carné
        # personal NO se rellena (el nº de empresa va solo en Nº Reg. Integrado Industrial).
        nombre_firma = _rep_nombre
        nif_firma = instalador.get("nif_responsable") or instalador.get("tecnico_firmante_dni", "") or ""
        carnet_personal = ""

    datos = {
        "expediente": exp.get("numero_expediente"),
        "titular": {
            "nombre": exp.get("nombre_razon_social", ""),
            "ape1": (exp.get("apellidos", "") or "").split(" ")[0],
            "ape2": " ".join((exp.get("apellidos", "") or "").split(" ")[1:]),
            "nombre_completo": f"{exp.get('nombre_razon_social','')} {exp.get('apellidos','')}".strip(),
            "nif": exp.get("dni", ""),
            # Sexo del titular (HOMBRE/MUJER). Viene de clientes.sexo (lo elige el
            # usuario al crear el cliente o en el popup al generar la Memoria RITE).
            # mapeo.py marca la casilla 3=Hombre / 5=Mujer; vacío → sin marcar.
            "sexo": exp.get("sexo", "") or "",
            "calle": exp.get("cli_dir", ""),
            "numero": "",
            "localidad": exp.get("cli_muni", ""),
            "provincia": exp.get("cli_prov", ""),
            "cp": exp.get("cli_cp", ""),
            "telefono": exp.get("tlf", ""),
        },
        "instalacion": {
            # La instalación está en la dirección del cliente (igual que el CIFO).
            "calle": exp.get("cli_dir", ""),
            "numero": "",
            "localidad": exp.get("cli_muni", ""),
            "provincia": exp.get("cli_prov", ""),
            "cp": exp.get("cli_cp", ""),
            "ref_catastral": inst.get("ref_catastral") or exp.get("ref_catastral", ""),
            "coord_x": inst.get("coord_x"), "coord_y": inst.get("coord_y"),
            "superficie": superficie, "zona": zona, "plantas": plantas,
        },
        # Climatización: el suelo radiante puede dar refrescamiento en verano, así
        # que cuando el emisor es suelo radiante se marca CLIMATIZACIÓN.
        "objeto": {"calefaccion": True, "acs": bool(inst.get("cambio_acs")),
                   "climatizacion": es_suelo},
        "tipo": {"nueva": not exp.get("is_reforma"), "reforma": bool(exp.get("is_reforma")) or bool(inst.get("caldera_antigua_cal"))},
        "generador_calor": {
            "marca": cal.get("marca", ""), "modelo": cal.get("modelo", ""),
            "num_serie": cal.get("numero_serie", ""),
            "potencia_cal": pot_cal,
            "potencia_acs": (pot_acs if acs_distinto else ""),
            "acumulacion_l": (_acumulacion(acs) if acs_distinto else ""),
            "refrigerante": _refrigerante(cal.get("modelo", "")),
        },
        "aislamiento": {},  # usa valores por defecto del mapeo
        # Suelo radiante usa tubería de mayor diámetro (colectores PEX) → 32 mm.
        "distribucion": {"sistema": "conductos" if es_suelo else "bitubo",
                         "material": "COBRE", "d_max": "32" if es_suelo else "28", "d_min": "16"},
        "condiciones": {"temp_verano": "24", "temp_invierno": "21"},
        "instalador": {
            "razon_social": instalador.get("razon_social", ""),
            "cif": instalador.get("cif", ""),
            "nombre_firma": nombre_firma,
            "nif_firma": nif_firma,
            "num_empresa_rite": num_empresa_rite,   # Nº Registro Integrado Industrial (EMPRESA)
            "carnet_personal": carnet_personal,      # Nº de Carné del instalador/técnico firmante
            "localidad": instalador.get("municipio", ""),
            "fecha_firma": _fmt(fecha_firma) if fecha_firma else _fmt(fecha_pruebas),
        },
        "potencia": {"calor": pot_cal, "frio": 0, "acs": pot_acs,
                     "total": round(pot_cal + pot_acs, 2)},
        "pruebas_fecha": fecha_pruebas,
        "_meta": {"emisor": emisor},
    }

    # OPCIÓN B: estimar cargas térmicas
    datos["cargas_termicas"] = estimar_cargas(superficie, plantas, zona, emisor)
    return datos


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _refrigerante(modelo):
    m = (modelo or "").upper()
    for r in ("R290", "R32", "R410A", "R134A", "R513A"):
        if r.replace("-", "") in m.replace("-", ""):
            return r
    return ""


def _acumulacion(acs):
    # 1) Campo explícito de litros si existe en BD (futuro: cuando se marca
    #    "depósito ACS incluido" en la app se habilita un campo de litros).
    for k in ("litros", "litros_acs", "acumulacion_litros", "volumen_acs", "volumen", "deposito_litros"):
        v = acs.get(k)
        if v not in (None, "", 0, "0"):
            return str(v)
    # 2) Si no, deducir del modelo ACS (ej. "TRADETERMIA ACS 110" -> 110)
    import re as _re
    m = _re.search(r"(\d{2,4})", acs.get("modelo", "") or "")
    return m.group(1) if m else ""


def _fmt(iso):
    if not iso:
        return ""
    from datetime import datetime
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
             "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    try:
        d = datetime.strptime(iso, "%Y-%m-%d")
        return f"{d.day} de {meses[d.month - 1]} de {d.year}"
    except Exception:
        return iso
