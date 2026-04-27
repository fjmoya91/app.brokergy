"""
Script de importación de instaladores desde Excel a Supabase.
Uso: python import_instaladores.py [--dry-run]

Lee: c:/Proyectos/app.brokergy/data/bbdd_instaladores.xlsx
Imágenes: c:/Proyectos/app.brokergy/data/Instaladores_Images/
Inserta en: tabla prescriptores (tipo_empresa = INSTALADOR, sin cuenta de acceso)

Para dar acceso posteriormente: usar el toggle en el panel Admin > Prescriptores.
"""

import sys
import base64
import re
import requests
import openpyxl
from pathlib import Path
from dotenv import dotenv_values

DRY_RUN = '--dry-run' in sys.argv

# ─── Rutas ────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
ENV_PATH    = SCRIPT_DIR.parent / '.env'
EXCEL_PATH  = Path('c:/Proyectos/app.brokergy/data/bbdd_instaladores.xlsx')
IMAGES_DIR  = Path('c:/Proyectos/app.brokergy/data/Instaladores_Images')

# ─── Env ──────────────────────────────────────────────────────────────────────
env = dotenv_values(ENV_PATH)
SUPABASE_URL      = env.get('SUPABASE_URL')
SUPABASE_KEY      = env.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: No se encontraron SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env')
    sys.exit(1)

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

# ─── Normalización de CCAA ────────────────────────────────────────────────────
CCAA_MAP = {
    'castilla la mancha': 'Castilla-La Mancha',
    'castilla - la mancha': 'Castilla-La Mancha',
    'castilla-la mancha': 'Castilla-La Mancha',
    'castilla y leon': 'Castilla y León',
    'castilla y león': 'Castilla y León',
    'andalucia': 'Andalucía',
    'andalucía': 'Andalucía',
    'aragon': 'Aragón',
    'aragón': 'Aragón',
    'pais vasco': 'País Vasco',
    'país vasco': 'País Vasco',
    'comunidad valenciana': 'Comunidad Valenciana',
    'comunitat valenciana': 'Comunidad Valenciana',
    'la rioja': 'La Rioja',
    'madrid': 'Madrid',
    'murcia': 'Murcia',
    'navarra': 'Navarra',
    'extremadura': 'Extremadura',
    'galicia': 'Galicia',
    'cataluña': 'Cataluña',
    'cataluna': 'Cataluña',
    'asturias': 'Asturias',
    'cantabria': 'Cantabria',
    'baleares': 'Baleares',
    'canarias': 'Canarias',
    'ceuta': 'Ceuta',
    'melilla': 'Melilla',
}

def normalize_ccaa(raw):
    if not raw:
        return None
    key = str(raw).strip().lower()
    return CCAA_MAP.get(key, str(raw).strip())

# ─── Imagen a base64 ──────────────────────────────────────────────────────────
def image_to_base64(relative_path):
    """relative_path es como 'Instaladores_Images/8725c1cc.Foto Portada.113533.png'"""
    if not relative_path:
        return None
    filename = Path(relative_path).name
    # Buscar archivo en el directorio de imágenes (puede tener caracteres raros)
    for f in IMAGES_DIR.iterdir():
        if f.name == filename:
            ext = f.suffix.lower().lstrip('.')
            mime = 'image/jpeg' if ext in ('jpg', 'jpeg') else f'image/{ext}'
            data = base64.b64encode(f.read_bytes()).decode('utf-8')
            return f'data:{mime};base64,{data}'
    # Fallback: buscar por prefijo de ID
    prefix = filename.split('.')[0]
    for f in IMAGES_DIR.iterdir():
        if f.name.startswith(prefix):
            ext = f.suffix.lower().lstrip('.')
            mime = 'image/jpeg' if ext in ('jpg', 'jpeg') else f'image/{ext}'
            data = base64.b64encode(f.read_bytes()).decode('utf-8')
            return f'data:{mime};base64,{data}'
    return None

# ─── Inserción en Supabase ────────────────────────────────────────────────────
def insert_prescriptor(payload):
    url = f'{SUPABASE_URL}/rest/v1/prescriptores'
    resp = requests.post(url, json=payload, headers=HEADERS)
    if resp.status_code not in (200, 201):
        raise Exception(f'HTTP {resp.status_code}: {resp.text[:200]}')
    return resp.json()

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print(f'{"[DRY RUN] " if DRY_RUN else ""}Iniciando importación de instaladores...\n')

    wb = openpyxl.load_workbook(EXCEL_PATH)
    ws = wb.active

    rows = list(ws.iter_rows(min_row=2, values_only=True))
    valid_rows = [r for r in rows if r[0]]  # filtrar filas vacías

    print(f'Encontradas {len(valid_rows)} filas con datos.\n')

    success, failed, skipped = 0, 0, 0

    for row in valid_rows:
        # Columnas del Excel:
        # 0:ID, 1:Razón Social, 2:NIF/CIF, 3:Email, 4:Teléfono, 5:Contraseña(fórmula),
        # 6:Responsable Técnico, 7:Dirección, 8:CP, 9:CCAA, 10:Provincia, 11:Municipio,
        # 12:Marca Principal, 13:Marca Secundaria, 14:Provincia Principal, 15:Radio,
        # 16:Habilitada Industria, 17:Nº Empresa, 18:Foto Portada, 19:Cargo
        (id_excel, razon_social, cif, email, tlf, _pw, responsable,
         direccion, cp, ccaa, provincia, municipio,
         marca_ref, marca_sec, _prov_ppal, _radio,
         habilitada, num_empresa, foto_path, cargo, *_) = (list(row) + [None]*10)[:30]

        nombre = str(razon_social).strip() if razon_social else 'SIN NOMBRE'

        # Detectar autónomo por texto del campo Cargo
        es_autonomo = bool(cargo and 'aut' in str(cargo).lower())
        tiene_rite = str(habilitada).strip().upper() == 'SI' if habilitada else False

        # Email: limpiar y normalizar
        email_clean = str(email).strip().lower() if email and str(email).strip() not in ('none', '') else None

        # Teléfono (puede venir como número o string con espacios)
        tlf_raw = str(tlf).strip() if tlf else ''
        tlf_clean = re.sub(r'\s+', '', tlf_raw) if tlf_raw and tlf_raw.lower() != 'none' else None

        # CIF
        cif_clean = str(cif).strip().upper() if cif else None

        # CP
        cp_clean = str(int(cp)) if cp and isinstance(cp, (int, float)) else (str(cp).strip() if cp else None)

        # Logo
        logo = image_to_base64(foto_path) if foto_path else None

        # Responsable técnico: split nombre / apellidos
        resp_raw = str(responsable).strip() if responsable else ''
        resp_parts = resp_raw.split(' ', 1)
        nombre_resp = resp_parts[0] if resp_parts else None
        apellidos_resp = resp_parts[1] if len(resp_parts) > 1 else None

        # Normalizar provincia y municipio a title case
        prov_clean = str(provincia).strip().title() if provincia else None
        muni_clean = str(municipio).strip().title() if municipio else None

        payload = {
            'es_autonomo': es_autonomo,
            'razon_social': nombre,
            'cif': cif_clean,
            'email': email_clean,
            'tlf': tlf_clean,
            'direccion': str(direccion).strip() if direccion else None,
            'codigo_postal': cp_clean,
            'ccaa': normalize_ccaa(ccaa),
            'provincia': prov_clean,
            'municipio': muni_clean,
            'tipo_empresa': 'INSTALADOR',
            'marca_referencia': str(marca_ref).strip() if marca_ref else None,
            'marca_secundaria': str(marca_sec).strip() if marca_sec else None,
            'tiene_carnet_rite': tiene_rite,
            'numero_carnet_rite': str(num_empresa).strip() if num_empresa else None,
            'cargo': str(cargo).strip() if cargo else None,
            'nombre_responsable': nombre_resp,
            'apellidos_responsable': apellidos_resp,
            'logo_empresa': logo,
        }

        # Limpiar None en strings vacios
        for k, v in list(payload.items()):
            if v == 'None' or v == '':
                payload[k] = None

        if DRY_RUN:
            logo_info = f'Logo: {len(logo)} chars' if logo else 'Sin logo'
            print(f'  [DRY] {nombre} | CIF: {cif_clean} | Email: {email_clean} | {logo_info}')
            success += 1
            continue

        try:
            # Evitar duplicados: comprobar si ya existe el CIF
            if cif_clean:
                check = requests.get(
                    f'{SUPABASE_URL}/rest/v1/prescriptores?cif=eq.{cif_clean}&select=id_empresa',
                    headers=HEADERS
                )
                if check.ok and len(check.json()) > 0:
                    print(f'  [SKIP] {nombre} (ya existe en BD)')
                    skipped += 1
                    continue

            insert_prescriptor(payload)
            logo_info = 'con logo' if logo else 'sin logo'
            print(f'  [OK] {nombre} ({logo_info})')
            success += 1
        except Exception as e:
            print(f'  [ERR] {nombre}: {e}')
            failed += 1

    sep = '-' * 50
    estado = 'simulada' if DRY_RUN else 'completada'
    print(f'\n{sep}')
    print(f'Importacion {estado}:')
    print(f'  OK      : {success}')
    if failed:
        print(f'  FALLIDOS: {failed}')
    print(sep)
    if not DRY_RUN and success > 0:
        print('\nRecuerda: los instaladores importados NO tienen acceso al portal.')
        print('Para darlo, ve a Admin > Prescriptores, edita el partner y activa el toggle "Acceso a la App".')

if __name__ == '__main__':
    main()
