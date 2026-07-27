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

    # Tipo de emisor. Cada uno cambia varias casillas de la memoria.
    # OJO: `es_suelo` se decide SOLO por la etiqueta del emisor. Antes admitía
    # también `obj.climatizacion`, pero ese flag ya no es exclusivo del suelo
    # radiante (splits y conductos también climatizan) y una instalación por
    # conductos habría acabado declarando emisor de suelo radiante con PEX.
    _emisor = ((datos.get("_meta", {}) or {}).get("emisor", "") or "").upper()
    es_suelo = "SUELO" in _emisor
    es_conductos = "CONDUCTO" in _emisor
    es_splits = "SPLIT" in _emisor
    # Instalaciones que dan frío: refrescan en verano o son aire-aire.
    da_frio = es_suelo or es_conductos or es_splits

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
        # AISLAMIENTO — EN TUBERÍAS Y ACCESORIOS (119-122)
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

    if da_frio:
        # REGULACIÓN Y CONTROL — columna REFRIGERACIÓN (= calefacción): la
        # instalación refresca. Cada fila tiene 3 campos consecutivos
        # (calefacción, ACS, refrigeración) → refrigeración = calefacción + 2.
        text[160] = text[166] = text[172] = text[175] = "SI"
    if es_suelo:
        # TERMINALES — SUELO RADIANTE (indicar el material). No hay casilla propia
        # en la plantilla: se identifica rellenando el material del emisor.
        text[153] = "POLIETILENO RETICULADO PEX"

    # ── GENERADOR DE FRÍO (94-102) ───────────────────────────────────────────
    # Se rellena siempre que la instalación dé frío: suelo radiante (refresca en
    # verano) y unidades aire-aire (splits / conductos). Posiciones verificadas
    # renderizando la plantilla, NO deducidas del XML: en esta plantilla el orden
    # de los campos no sigue el de las etiquetas (ver 74/75/76 más arriba).
    # OJO: la fila MARCA/MODELO solo tiene UN campo, el de MODELO → la marca se
    # concatena ahí para no perderla.
    gf = datos.get("generador_frio") or {}
    if gf.get("aplica"):
        text[94] = " ".join(x for x in [gf.get("marca", ""), gf.get("modelo", "")] if x).strip()
        text[95] = _num(gf.get("potencia_frigorifica"))
        text[96] = _num(gf.get("potencia_compresores"))
        text[99] = gf.get("refrigerante", "")
        text[100] = gf.get("clase", "A")          # prestación energética
        text[101] = gf.get("situado_en", "")      # CUBIERTA / FACHADA / SUELO
        text[102] = _num(gf.get("eer"))           # se declara el SEER del catálogo

    # ── CONDUCTOS (aire-aire por conductos) ──────────────────────────────────
    # La red es de conductos autoportantes de lana mineral, no tuberías de agua:
    # cambian el aislamiento (fila EN CONDUCTOS), la distribución y los terminales.
    if es_conductos:
        cond_ais = datos.get("aislamiento_conductos") or {}
        text[123] = cond_ais.get("material", "FIBRA DE VIDRIO")
        text[124] = cond_ais.get("conductividad", "0,032")
        text[125] = cond_ais.get("espesor", "25")
        text[126] = cond_ais.get("acabado", "METÁLICO")
        # No hay red de tuberías de agua: se vacían la fila de aislamiento EN
        # TUBERÍAS y los diámetros, que solo aplican a tubería.
        for pos in (119, 120, 121, 122, 140, 141, 142):
            text[pos] = ""

    # TIPO DE PERSONA — casillas 2=Física, 3=Hombre, 4=Jurídica, 5=Mujer
    # (verificado sobre la plantilla; van intercaladas por el orden de la tabla).
    # Una sociedad es persona JURÍDICA y NO tiene sexo: marcar Hombre/Mujer en una
    # empresa es un error del documento.
    if t.get("es_empresa"):
        checks = [4]       # Persona jurídica — sin sexo
    else:
        checks = [2]       # Persona física
        # Sexo: solo se marca si viene explícito; si no, se deja SIN marcar
        # (ni Hombre ni Mujer) en vez de asumir.
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
    # ALMACENAMIENTO / EMPLAZAMIENTO del depósito de combustible: NO aplica a una
    # instalación de aerotermia (eléctrica, sin depósito). No se marca nada
    # (antes se marcaba TERRAZA por error en la posición 48).
    checks.append(69)      # CALEFACCION-ACS
    checks.append(70)      # BOMBA DE CALOR
    # ── GENERADOR DE FRÍO — casillas (90=COMPACTO, 91=PARTIDO, 92=MULTI-SPLIT,
    # 93=AUTÓNOMO; 97=condensado por AIRE, 98=AGUA). Verificadas renderizando.
    if gf.get("aplica"):
        checks.append(91 if gf.get("partido") else 90)   # partido (bibloc) o compacto
        checks.append(97)                                 # condensado por AIRE

    # ── DISTRIBUCIÓN Y TERMINALES ────────────────────────────────────────────
    # Casillas verificadas: 131=MONOTUBO, 132=BITUBO, 133=CONDUCTOS |
    # 134=ACERO, 135=ACERO INOX, 136=COBRE, 137=POLIETILENO RETICULADO, 138=OTROS |
    # 143=FIBRA MINERAL, 144=CHAPA, 145=OTROS | 154=REJILLAS, 155=DIFUSORES.
    if es_conductos:
        # Red de conductos de aire: no hay tuberías de agua ni radiadores.
        checks.append(133)      # SISTEMAS DE DISTRIBUCIÓN → CONDUCTOS
        checks.append(138)      # TUBERÍAS → OTROS (no aplica ninguna de agua)
        checks.append(143)      # CONDUCTOS → FIBRA MINERAL
        checks.append(154)      # TERMINALES → REJILLAS
    else:
        # Distribución por defecto para radiadores: bitubo + cobre
        sistema = (dis.get("sistema") or "bitubo").lower()
        if "mono" in sistema:
            checks.append(131)
        else:
            checks.append(132)  # BITUBO
        checks.append(137)      # (posición histórica; ver nota de COBRE/PEX)
        # TERMINALES: radiadores de aluminio SOLO si NO es suelo radiante. Con
        # suelo radiante no se marca radiador; el emisor se indica con su material
        # (PEX) en el campo de texto 153 (ver arriba).
        if not es_suelo:
            checks.append(151)  # RADIADORES ALUMINIO

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
