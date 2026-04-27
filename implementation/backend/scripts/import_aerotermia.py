"""
import_aerotermia.py
Importa la base de datos de equipos de aerotermia desde Excel a Supabase.

Uso:
    python import_aerotermia.py            # Importacion real
    python import_aerotermia.py --dry-run  # Solo muestra lo que haria

Requiere: openpyxl, requests, python-dotenv
    pip install openpyxl requests python-dotenv
"""

import sys
import os
import re
import base64
import argparse
import requests
import openpyxl
from pathlib import Path
from dotenv import load_dotenv

# ── Rutas ──────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent.parent.parent  # c:\Proyectos\app.brokergy
DATA_DIR    = PROJECT_DIR / 'data' / 'bbdd_aerotermia'
EXCEL_PATH  = DATA_DIR / 'bbdd_aerotermia.xlsx'
IMAGES_DIR  = DATA_DIR / 'BBDD_AEROTERMIA_Images'
ENV_PATH    = SCRIPT_DIR.parent / '.env'

load_dotenv(ENV_PATH)

SUPABASE_URL      = os.getenv('SUPABASE_URL')
SUPABASE_API_KEY  = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_API_KEY:
    print('[ERR] Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
    sys.exit(1)

HEADERS = {
    'apikey':        SUPABASE_API_KEY,
    'Authorization': f'Bearer {SUPABASE_API_KEY}',
    'Content-Type':  'application/json',
    'Prefer':        'return=representation',
}

TABLE_URL = f'{SUPABASE_URL}/rest/v1/aerotermia'

# ── Helpers ────────────────────────────────────────────────────────────────────

def to_float(val):
    """Convierte celda numerica a float, None si vacío."""
    if val is None or val == '':
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None

def to_bool(val):
    """'SI' -> True, cualquier otro valor -> False."""
    if isinstance(val, bool):
        return val
    if isinstance(val, str):
        return val.strip().upper() == 'SI'
    return False

def image_to_base64(relative_path):
    """
    Convierte la imagen referenciada en el Excel a base64.
    relative_path es relativo a DATA_DIR, p.ej. 'BBDD_AEROTERMIA_Images/PANASONIC...'
    """
    if not relative_path:
        return None
    img_path = DATA_DIR / relative_path
    if not img_path.exists():
        print(f'  [WARN] Imagen no encontrada: {img_path}')
        return None
    ext = img_path.suffix.lower().lstrip('.')
    mime = 'jpeg' if ext in ('jpg', 'jpeg') else ext
    with open(img_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('utf-8')
    return f'data:image/{mime};base64,{b64}'

def get_existing_keys():
    """Devuelve un set de (marca, modelo_conjunto) ya en la tabla para deduplicar."""
    res = requests.get(
        TABLE_URL,
        params={'select': 'marca,modelo_conjunto'},
        headers=HEADERS,
        timeout=30
    )
    if res.status_code != 200:
        print(f'[ERR] No se pudo consultar la tabla: {res.status_code} {res.text}')
        sys.exit(1)
    data = res.json()
    return {(r['marca'], r['modelo_conjunto']) for r in data}

# ── Main ───────────────────────────────────────────────────────────────────────

def main(dry_run=False):
    print('-' * 60)
    print('IMPORTACION AEROTERMIA')
    print(f'Excel: {EXCEL_PATH}')
    print(f'Modo:  {"DRY-RUN (sin cambios)" if dry_run else "REAL"}')
    print('-' * 60)

    if not EXCEL_PATH.exists():
        print(f'[ERR] No se encuentra el archivo: {EXCEL_PATH}')
        sys.exit(1)

    wb = openpyxl.load_workbook(str(EXCEL_PATH), read_only=True, data_only=True)
    ws = wb.active

    # Cabecera esperada (col 0-based):
    # 0:ID, 1:MARCA, 2:MODELO COMERCIAL, 3:TIPO, 4:POTENCIA CALEFACCION,
    # 5:MODELO CONJUNTO, 6:MODELO UD. EXTERIOR, 7:MODELO UD. INTERIOR,
    # 8:DEPOSITO ACS INCLUIDO, 9:SCOPcal CALIDO 35, 10:SCOPcal CALIDO 55,
    # 11:SCOPcal MEDIO 35, 12:SCOPcal MEDIO 55, 13:SCOPdhw CALIDO,
    # 14:SCOPdhw MEDIO, 15:SEER, 16:eta CALIDA 35, 17:eta CALIDA 55,
    # 18:eta MEDIA 35, 19:eta MEDIA 55, 20:eta ACS CALIDA, 21:eta ACS MEDIA,
    # 22:COP A7/55, 23:EPREL, 24:FT, 25:Logo Marca

    existing = set() if dry_run else get_existing_keys()
    print(f'Registros existentes en Supabase: {len(existing)}')

    inserted = skipped = errors = 0
    rows_data = list(ws.iter_rows(min_row=2, values_only=True))
    wb.close()

    # Pre-cargar logos por marca (solo una vez por marca)
    logo_cache = {}

    for row in rows_data:
        # Ignorar filas completamente vacías
        if not any(row):
            continue

        marca_raw = row[1]
        if not marca_raw:
            continue

        marca = str(marca_raw).strip().upper()
        modelo_comercial = str(row[2]).strip() if row[2] else None
        tipo             = str(row[3]).strip().upper() if row[3] else None
        potencia         = to_float(row[4])
        modelo_conjunto  = str(row[5]).strip() if row[5] else None
        modelo_ext       = str(row[6]).strip() if row[6] else None
        modelo_int       = str(row[7]).strip() if row[7] else None
        deposito_acs     = to_bool(row[8])
        scop_cc35        = to_float(row[9])
        scop_cc55        = to_float(row[10])
        scop_cm35        = to_float(row[11])
        scop_cm55        = to_float(row[12])
        scop_dhw_c       = to_float(row[13])
        scop_dhw_m       = to_float(row[14])
        seer             = to_float(row[15])
        eta_c35          = to_float(row[16])
        if eta_c35 is not None and eta_c35 < 10: eta_c35 *= 100
        eta_c55          = to_float(row[17])
        if eta_c55 is not None and eta_c55 < 10: eta_c55 *= 100
        eta_m35          = to_float(row[18])
        if eta_m35 is not None and eta_m35 < 10: eta_m35 *= 100
        eta_m55          = to_float(row[19])
        if eta_m55 is not None and eta_m55 < 10: eta_m55 *= 100
        eta_acs_c        = to_float(row[20])
        if eta_acs_c is not None and eta_acs_c < 10: eta_acs_c *= 100
        eta_acs_m        = to_float(row[21])
        if eta_acs_m is not None and eta_acs_m < 10: eta_acs_m *= 100
        cop_a7_55        = to_float(row[22])
        eprel            = str(row[23]).strip() if row[23] else None
        ficha_tecnica    = str(row[24]).strip() if row[24] else None
        logo_rel_path    = str(row[25]).strip() if row[25] else None

        # Logo: cachear por marca para no releer el mismo archivo varias veces
        if marca not in logo_cache:
            logo_cache[marca] = image_to_base64(logo_rel_path)
        logo_b64 = logo_cache[marca]

        # Deduplicar por (marca, modelo_conjunto)
        key = (marca, modelo_conjunto)
        if key in existing:
            print(f'  [SKIP] {marca} | {modelo_conjunto} (ya existe)')
            skipped += 1
            continue

        payload = {
            'marca':                 marca,
            'modelo_comercial':      modelo_comercial,
            'tipo':                  tipo,
            'potencia_calefaccion':  potencia,
            'modelo_conjunto':       modelo_conjunto,
            'modelo_ud_exterior':    modelo_ext,
            'modelo_ud_interior':    modelo_int,
            'deposito_acs_incluido': deposito_acs,
            'scop_cal_calido_35':    scop_cc35,
            'scop_cal_calido_55':    scop_cc55,
            'scop_cal_medio_35':     scop_cm35,
            'scop_cal_medio_55':     scop_cm55,
            'scop_dhw_calido':       scop_dhw_c,
            'scop_dhw_medio':        scop_dhw_m,
            'seer':                  seer,
            'eta_calida_35':         eta_c35,
            'eta_calida_55':         eta_c55,
            'eta_media_35':          eta_m35,
            'eta_media_55':          eta_m55,
            'eta_acs_calida':        eta_acs_c,
            'eta_acs_media':         eta_acs_m,
            'cop_a7_55':             cop_a7_55,
            'eprel':                 eprel,
            'ficha_tecnica':         ficha_tecnica,
        }

        label = f'{marca} | {modelo_conjunto or modelo_comercial} ({potencia} kW)'

        if dry_run:
            logo_info = '[con logo]' if logo_b64 else '[sin logo]'
            print(f'  [DRY] {label} {logo_info}')
            inserted += 1
            existing.add(key)
            continue

        res = requests.post(TABLE_URL, json=payload, headers=HEADERS, timeout=60)
        if res.status_code in (200, 201):
            print(f'  [OK]  {label}')
            inserted += 1
            existing.add(key)
        else:
            print(f'  [ERR] {label} -> {res.status_code}: {res.text[:200]}')
            errors += 1

    print('-' * 60)
    print(f'Insertados: {inserted}  |  Saltados: {skipped}  |  Errores: {errors}')
    print('-' * 60)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Importar aerotermia a Supabase')
    parser.add_argument('--dry-run', action='store_true', help='Solo mostrar, no insertar')
    args = parser.parse_args()
    main(dry_run=args.dry_run)
