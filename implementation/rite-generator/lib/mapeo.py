#!/usr/bin/env python3
"""
MAPEO: traduce los datos normalizados del expediente a:
  - text_by_pos: {posicion_campo -> valor_texto}
  - check_positions: [posiciones de checkbox a marcar]

El mapeo es POR POSICIÓN porque la plantilla tiene nombres de campo duplicados.
Las posiciones se obtuvieron analizando la plantilla (452 campos válidos).
Ver mapping/mapeo_supabase.md para el detalle de cada posición.

Estructura esperada de `datos` (ver lib/supabase_client.normalizar):
{
  titular: {nombre, ape1, ape2, nif, sexo, calle, numero, localidad, provincia, cp, telefono},
  instalacion: {calle, numero, localidad, provincia, cp, ref_catastral},
  objeto: {calefaccion, acs, climatizacion},
  tipo: {nueva, reforma},   # individual asumido
  generador_calor: {marca, modelo, num_serie, potencia_cal, acumulacion_l},
  aislamiento: {material, conductividad, espesor, acabado},
  distribucion: {sistema, material, d_max, d_min},
  condiciones: {temp_verano, temp_invierno},
  instalador: {nombre_firma, num_empresa_rite, localidad, fecha_firma},
  cargas_termicas: [ {planta,tipo_local,num,superficie_m2,orientacion,
                       cargas_calculo,emisor,elementos,potencia_instalada}, ... ],
}
"""

# Nombre del primer campo de cada fila de la tabla de cargas (9 columnas/fila)
TABLA_PRIMER_CAMPO = "Texto147"
TABLA_COLS = ["planta", "tipo_local", "num", "superficie_m2", "orientacion",
              "cargas_calculo", "emisor", "elementos", "potencia_instalada"]


def construir_relleno(datos: dict, nombres_campos: list):
    """Devuelve (text_by_pos, check_positions).
    `nombres_campos` = lista ordenada de nombres de campo de la plantilla
    (para localizar las filas de la tabla de cargas dinámicamente)."""
    t = datos["titular"]
    ins = datos["instalacion"]
    obj = datos.get("objeto", {})
    tipo = datos.get("tipo", {})
    gc = datos.get("generador_calor", {})
    ais = datos.get("aislamiento", {})
    dis = datos.get("distribucion", {})
    cond = datos.get("condiciones", {})
    instal = datos.get("instalador", {})

    text = {
        # TITULAR
        0: t.get("nombre_completo") or f"{t.get('nombre','')} {t.get('ape1','')} {t.get('ape2','')}".strip(),
        1: t.get("nif", ""),
        6: t.get("calle", ""),
        7: t.get("numero", ""),
        11: t.get("telefono", ""),
        12: t.get("localidad", ""),
        13: t.get("provincia", ""),
        # UBICACIÓN INSTALACIÓN ("Calle o Plaza" = campo 16; localidad/prov = 18/19)
        16: ins.get("calle", ""),
        18: ins.get("localidad", ""),
        19: ins.get("provincia", ""),
        # FUENTE ENERGÍA - texto en OTRO
        41: "AEROTERMIA",
        # GENERADOR DE CALOR
        71: gc.get("marca", ""),
        72: gc.get("modelo", ""),
        73: gc.get("num_serie", ""),
        # OJO (verificado contra la plantilla): el campo 74 es POTENCIA A.C.S,
        # el 75 ACUMULACIÓN (L) y el 76 POTENCIA TÉRMICA DE CALEFACCIÓN.
        74: _num(gc.get("potencia_acs")),
        75: _num(gc.get("acumulacion_l")),
        76: _num(gc.get("potencia_cal")),
        # AISLAMIENTO
        119: ais.get("material", "ESPUMA ELASTOMÉRICA"),
        120: ais.get("conductividad", "0,040"),
        121: ais.get("espesor", "25"),
        122: ais.get("acabado", "-"),
        # DISTRIBUCIÓN diámetros
        140: dis.get("d_max", "28"),
        142: dis.get("d_min", "16"),
        # REGULACIÓN Y CONTROL (col calefacción)
        158: "SI", 164: "SI", 165: "SI", 170: "SI", 173: "SI",
        # CONDICIONES INTERIORES
        179: cond.get("temp_verano", "24"),
        180: cond.get("temp_invierno", "21"),
        # FIRMA INSTALADOR (carné = del técnico firmante / autónomo; vacío si no hay.
        # El nº de empresa NO va aquí, solo en Nº Reg. Integrado Industrial.)
        445: instal.get("nombre_firma", ""),
        446: instal.get("carnet_personal", ""),
        450: instal.get("localidad", ""),
        451: instal.get("fecha_firma", ""),
    }

    checks = [2]  # Persona física (siempre en estos expedientes residenciales)
    # Sexo: no hay dato en BD. Solo se marca si viene explícito; si no, se deja
    # SIN marcar (ni Hombre ni Mujer) en vez de asumir.
    sexo = (t.get("sexo") or "").lower()
    if sexo.startswith("muj"):
        checks.append(5)   # Mujer
    elif sexo.startswith("h"):
        checks.append(3)   # Hombre
    checks.append(20)      # VIVIENDA
    if obj.get("calefaccion", True):
        checks.append(26)
    if obj.get("acs", True):
        checks.append(27)
    if obj.get("climatizacion"):
        checks.append(28)
    checks.append(30)      # INDIVIDUAL
    if tipo.get("reforma"):
        checks.append(33)  # REFORMA
    else:
        checks.append(32)  # NUEVA
    checks.append(37)      # ELECTRICIDAD
    checks.append(40)      # OTRO (aerotermia)
    checks.append(48)      # EXTERIOR (emplazamiento)
    checks.append(69)      # CALEFACCION-ACS
    checks.append(70)      # BOMBA DE CALOR
    # Distribución por defecto para radiadores: bitubo + cobre
    sistema = (dis.get("sistema") or "bitubo").lower()
    if "mono" in sistema:
        checks.append(131)
    else:
        checks.append(132)  # BITUBO
    checks.append(137)      # COBRE
    checks.append(151)      # RADIADORES ALUMINIO

    # TABLA DE CARGAS TÉRMICAS (filas que empiezan en Texto147).
    # OJO: la 1ª fila tiene un campo extra (Texto145) que descuadra el offset por
    # posición. Por eso emparejamos por NOMBRE de campo dentro del rango de cada
    # fila (de un Texto147 al siguiente), ignorando campos sobrantes.
    row_starts = [i for i, n in enumerate(nombres_campos) if n == TABLA_PRIMER_CAMPO]
    col_field_names = ["Texto147", "Texto146", "Texto148", "Texto149", "Texto150",
                       "Texto151", "Texto152", "Texto155", "Texto154"]
    for ri, carga in enumerate(datos.get("cargas_termicas", [])):
        if ri >= len(row_starts):
            break
        start = row_starts[ri]
        end = row_starts[ri + 1] if ri + 1 < len(row_starts) else len(nombres_campos)
        name_to_pos = {}
        for pos in range(start, end):
            name_to_pos.setdefault(nombres_campos[pos], pos)
        for cn, ck in zip(col_field_names, TABLA_COLS):
            pos = name_to_pos.get(cn)
            if pos is not None:
                v = carga.get(ck, "")
                if v not in ("", None):
                    text[pos] = str(v)

    return text, checks


def _num(v):
    if v in (None, ""):
        return ""
    s = str(v)
    return s.rstrip("0").rstrip(".") if "." in s else s
