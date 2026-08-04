#!/usr/bin/env python3
"""
Conversor Excel -> JSON para el sitio de perfiles de docentes.

Lee 'perfiles_docentes_datos.xlsx' y genera los cuatro archivos JSON en data/:
  - data/config.json          (taxonomía: línea + áreas + ejes)
  - data/docentes.json        (docentes con areas e ideasInvestigacion anidadas)
  - data/proyectos.json       (lista de proyectos por docenteId)
  - data/ideas-externas.json  (ideas externas)

Uso:
    python tools/excel_to_json.py [ruta_al_excel] [carpeta_data_salida]
    python tools/excel_to_json.py D:\\ClaudeCodeFolders\\perfiles-docentes\\tools\\perfiles_docentes_datos.xlsx D:\\ClaudeCodeFolders\\perfiles-docentes\\data

Por defecto:
    excel  = perfiles_docentes_datos.xlsx  (junto a este script o en el cwd)
    salida = data/

Valida antes de escribir:
  - áreas y ejes existen en la taxonomía
  - docenteId referenciados existen
  - campos obligatorios presentes
Si hay errores, NO escribe nada y los lista.
"""

import sys
import os
import json
import argparse
from openpyxl import load_workbook

SEP = "|"  # separador de listas dentro de una celda


# --------------------------------------------------------------------------
# utilidades
# --------------------------------------------------------------------------
def split_list(value):
    """Convierte 'a | b | c' en ['a','b','c']; celda vacía -> []."""
    if value is None:
        return []
    s = str(value).strip()
    if not s:
        return []
    return [part.strip() for part in s.split(SEP) if part.strip()]


def clean(value):
    """Texto de celda limpio, o None si está vacía."""
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def is_example_or_blank(id_value):
    """True si la fila es la de ejemplo (contiene 'ejemplo') o está vacía."""
    if id_value is None:
        return True
    s = str(id_value).strip().lower()
    if not s:
        return True
    if "ejemplo" in s:
        return True
    return False


def data_rows(ws, id_col=1, start_row=6):
    """
    Itera las filas de datos de una hoja a partir de start_row, saltando
    la fila de ejemplo y las vacías. Devuelve (num_fila, celdas...).
    Se detiene cuando encuentra muchas filas seguidas totalmente vacías.
    """
    empty_streak = 0
    r = start_row
    while True:
        # leer la fila completa (hasta 15 columnas, suficiente para estas hojas)
        row = [ws.cell(row=r, column=c).value for c in range(1, 16)]
        id_val = row[id_col - 1]
        if all(v is None or str(v).strip() == "" for v in row[:12]):
            empty_streak += 1
            if empty_streak >= 30:
                break
            r += 1
            continue
        empty_streak = 0
        if not is_example_or_blank(id_val):
            yield r, row
        r += 1


# --------------------------------------------------------------------------
# carga de taxonomía desde la hoja Taxonomia
# --------------------------------------------------------------------------
def load_taxonomy(wb):
    """
    Reconstruye la taxonomía leyendo la hoja 'Taxonomia':
      - columna A (fila 5+) = áreas
      - columnas C, D, E... (fila 4 = área, fila 5+ = ejes)
    Devuelve (config_dict, {area: set(ejes)}).
    """
    ws = wb["Taxonomia"]
    # áreas en col A
    areas_order = []
    r = 5
    while True:
        v = clean(ws.cell(row=r, column=1).value)
        if v is None:
            break
        areas_order.append(v)
        r += 1

    # ejes por columna (a partir de la col 3), encabezado en fila 4
    area_to_ejes = {}
    ejes_by_area_ordered = {}
    col = 3
    while True:
        header = clean(ws.cell(row=4, column=col).value)
        if header is None:
            # detener tras 2 columnas vacías seguidas
            nxt = clean(ws.cell(row=4, column=col + 1).value)
            if nxt is None:
                break
            col += 1
            continue
        ejes = []
        rr = 5
        while True:
            e = clean(ws.cell(row=rr, column=col).value)
            if e is None:
                break
            ejes.append(e)
            rr += 1
        area_to_ejes[header] = set(ejes)
        ejes_by_area_ordered[header] = ejes
        col += 1

    linea = clean(ws.cell(row=1, column=1).value) or "Ingeniería, Informática y Computación"
    # Nombre de la línea real: preferimos un valor conocido si el título de celda es genérico
    # (la celda A1 es un título de la plantilla, no la línea). Usamos un valor fijo salvo que
    # exista una celda dedicada. Para robustez, dejamos el nombre oficial.
    linea = "Ingeniería, Informática y Computación"

    config = {
        "linea": linea,
        "areas": [
            {"nombre": a, "ejes": ejes_by_area_ordered.get(a, [])}
            for a in areas_order
        ],
    }
    return config, area_to_ejes


# --------------------------------------------------------------------------
# construcción de cada JSON
# --------------------------------------------------------------------------
def build(wb, area_to_ejes):
    errors = []
    valid_areas = set(area_to_ejes.keys())

    def check_area_eje(area, eje, where, eje_required=True):
        if area is None:
            if eje_required:
                errors.append(f"{where}: falta 'area' (obligatoria).")
            return
        if area not in valid_areas:
            errors.append(f"{where}: área no existe en la taxonomía: {area!r}.")
            return
        if eje is None:
            if eje_required:
                errors.append(f"{where}: falta 'eje' (obligatorio).")
            return
        if eje not in area_to_ejes[area]:
            errors.append(f"{where}: el eje {eje!r} no pertenece al área {area!r}.")

    # ---- Docentes ----
    ws = wb["Docentes"]
    docentes = {}
    docentes_order = []
    for r, row in data_rows(ws):
        did = clean(row[0])
        nombre = clean(row[1])
        if not nombre:
            errors.append(f"Docentes fila {r}: falta 'nombre'.")
        if did in docentes:
            errors.append(f"Docentes fila {r}: id duplicado {did!r}.")
        docentes[did] = {
            "id": did,
            "nombre": nombre,
            "titulos": split_list(row[2]),
            "areas": [],                 # se llena desde 'Areas docente'
            "ideasInvestigacion": [],    # se llena desde 'Ideas docentes'
            "contacto": clean(row[3]),
        }
        docentes_order.append(did)

    # ---- Areas docente ----
    ws = wb["Areas docente"]
    # acumular ejes por (docente, area) preservando orden
    area_accumulator = {}  # did -> list of [area, [ejes]]
    for r, row in data_rows(ws):
        did = clean(row[0])
        area = clean(row[1])
        eje = clean(row[2])
        where = f"Areas docente fila {r}"
        if did not in docentes:
            errors.append(f"{where}: docenteId {did!r} no existe en 'Docentes'.")
        check_area_eje(area, eje, where, eje_required=True)
        if did not in area_accumulator:
            area_accumulator[did] = []
        # buscar si ya existe el área para este docente
        bucket = None
        for entry in area_accumulator[did]:
            if entry[0] == area:
                bucket = entry
                break
        if bucket is None:
            bucket = [area, []]
            area_accumulator[did].append(bucket)
        if eje and eje not in bucket[1]:
            bucket[1].append(eje)

    for did, entries in area_accumulator.items():
        if did in docentes:
            docentes[did]["areas"] = [
                {"area": a, "ejes": ejes} for a, ejes in entries
            ]

    # docentes sin ninguna área (aviso, no error fatal)
    for did in docentes_order:
        if not docentes[did]["areas"]:
            errors.append(f"Docentes: el docente {did!r} no tiene áreas asignadas en 'Areas docente' (aviso).")

    # ---- Ideas docentes ----
    ws = wb["Ideas docentes"]
    for r, row in data_rows(ws):
        iid = clean(row[0])
        did = clean(row[1])
        where = f"Ideas docentes fila {r}"
        if did not in docentes:
            errors.append(f"{where}: docenteId {did!r} no existe en 'Docentes'.")
        area = clean(row[4])
        eje = clean(row[5])
        check_area_eje(area, eje, where, eje_required=True)
        idea = {
            "id": iid,
            "titulo": clean(row[2]),
            "descripcion": clean(row[3]),
            "area": area,
            "eje": eje,
            "ejesSecundarios": split_list(row[6]),
            "objetivos": split_list(row[7]),
        }
        if not idea["titulo"]:
            errors.append(f"{where}: falta 'titulo'.")
        if did in docentes:
            docentes[did]["ideasInvestigacion"].append(idea)

    # ---- Proyectos ----
    ws = wb["Proyectos"]
    proyectos = []
    for r, row in data_rows(ws):
        pid = clean(row[0])
        did = clean(row[1])
        where = f"Proyectos fila {r}"
        if did not in docentes:
            errors.append(f"{where}: docenteId {did!r} no existe en 'Docentes'.")
        estado = clean(row[3])
        if estado not in ("activo", "finalizado"):
            errors.append(f"{where}: estado inválido {estado!r} (debe ser 'activo' o 'finalizado').")
        tipo = clean(row[6])
        if tipo not in ("investigacion", "desarrollo", None):
            errors.append(f"{where}: tipo inválido {tipo!r} (debe ser 'investigacion' o 'desarrollo').")
        area = clean(row[7])
        eje = clean(row[8])
        # area/eje opcionales en proyectos: validar solo si se proporcionan
        if area or eje:
            check_area_eje(area, eje, where, eje_required=bool(eje) or bool(area))
        proj = {
            "id": pid,
            "docenteId": did,
            "titulo": clean(row[2]),
            "estado": estado,
            "fechaInicio": clean(row[4]),
        }
        fecha_fin = clean(row[5])
        if estado == "finalizado":
            if not fecha_fin:
                errors.append(f"{where}: proyecto finalizado sin 'fechaFin'.")
            proj["fechaFin"] = fecha_fin
        else:
            if fecha_fin:
                errors.append(f"{where}: proyecto activo no debería tener 'fechaFin' ({fecha_fin!r}).")
        proj["tipo"] = tipo
        if area:
            proj["area"] = area
        if eje:
            proj["eje"] = eje
        proyectos.append(proj)

    # ---- Ideas externas ----
    ws = wb["Ideas externas"]
    ideas_externas = []
    for r, row in data_rows(ws):
        iid = clean(row[0])
        where = f"Ideas externas fila {r}"
        area = clean(row[3])
        eje = clean(row[4])
        check_area_eje(area, eje, where, eje_required=True)
        idea = {
            "id": iid,
            "titulo": clean(row[1]),
            "descripcion": clean(row[2]),
            "area": area,
            "eje": eje,
            "ejesSecundarios": split_list(row[5]),
            "objetivos": split_list(row[6]),
            "fuente": clean(row[7]),
            "contactoReferencia": clean(row[8]),
        }
        if not idea["titulo"]:
            errors.append(f"{where}: falta 'titulo'.")
        if not idea["fuente"]:
            errors.append(f"{where}: falta 'fuente' (origen de la idea).")
        ideas_externas.append(idea)

    docentes_list = [docentes[d] for d in docentes_order]
    return docentes_list, proyectos, ideas_externas, errors


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser(description="Conversor Excel -> JSON (perfiles de docentes).")
    ap.add_argument("excel", nargs="?", default="perfiles_docentes_datos.xlsx",
                    help="Ruta al archivo Excel (por defecto: perfiles_docentes_datos.xlsx)")
    ap.add_argument("salida", nargs="?", default="data",
                    help="Carpeta de salida para los JSON (por defecto: data)")
    ap.add_argument("--strict", action="store_true",
                    help="Trata los avisos (docentes sin áreas) también como errores.")
    args = ap.parse_args()

    if not os.path.exists(args.excel):
        print(f"ERROR: no se encontró el Excel: {args.excel}")
        sys.exit(1)

    wb = load_workbook(args.excel, data_only=True)

    required_sheets = ["Taxonomia", "Docentes", "Areas docente",
                       "Proyectos", "Ideas docentes", "Ideas externas"]
    missing = [s for s in required_sheets if s not in wb.sheetnames]
    if missing:
        print(f"ERROR: faltan hojas en el Excel: {missing}")
        sys.exit(1)

    config, area_to_ejes = load_taxonomy(wb)
    docentes, proyectos, ideas_externas, errors = build(wb, area_to_ejes)

    # separar avisos de errores fatales
    fatal = [e for e in errors if "(aviso)" not in e]
    avisos = [e for e in errors if "(aviso)" in e]

    if avisos:
        print("AVISOS:")
        for a in avisos:
            print("  -", a)
        print()

    if fatal or (args.strict and avisos):
        print("ERRORES (no se escribió ningún archivo):")
        for e in (fatal + (avisos if args.strict else [])):
            print("  -", e)
        sys.exit(2)

    os.makedirs(args.salida, exist_ok=True)

    def write(name, obj):
        path = os.path.join(args.salida, name)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        return path

    p1 = write("config.json", config)
    p2 = write("docentes.json", docentes)
    p3 = write("proyectos.json", proyectos)
    p4 = write("ideas-externas.json", ideas_externas)

    print("OK — archivos generados:")
    print(f"  {p1}   ({len(config['areas'])} áreas)")
    print(f"  {p2}   ({len(docentes)} docentes)")
    print(f"  {p3}   ({len(proyectos)} proyectos)")
    print(f"  {p4}   ({len(ideas_externas)} ideas externas)")


if __name__ == "__main__":
    main()
