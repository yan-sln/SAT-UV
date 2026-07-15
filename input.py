#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import csv
from datetime import datetime

INPUT_FILE = "src/input.txt"
OUTPUT_FILE = "docs/input/input.csv"


def convert_12h_to_24h(time_str):
    """Convertit 10:15:00 AM -> 10:15"""
    try:
        return datetime.strptime(time_str.strip(), "%I:%M:%S %p").strftime("%H:%M")
    except Exception:
        return time_str.strip()


def parse_line(line):
    """
    Analyse une ligne de l'export ADE.

    Retourne :
        Code
        Activité
        Jour
        Heure début
        Heure fin
        Semaine
        Lib créneau
    """

    line = line.strip()

    if not line:
        return None

    if line.startswith("Code"):
        return None

    parts = [p.strip() for p in line.split("\t") if p.strip()]

    if len(parts) < 5:
        return None

    code = parts[0]

    idx = 1

    # -------------------------
    # Activité
    # -------------------------
    if idx + 1 < len(parts) and parts[idx] == "Activité" and parts[idx + 1] == "annexe":
        activite = "Activité annexe"
        idx += 2
    else:
        activite = parts[idx]
        idx += 1

    if idx >= len(parts):
        return None

    jour = parts[idx]
    idx += 1

    if idx + 1 >= len(parts):
        return None

    heure_debut = convert_12h_to_24h(parts[idx])
    heure_fin = convert_12h_to_24h(parts[idx + 1])
    idx += 2

    # -------------------------
    # Semaine
    # -------------------------
    semaine = ""

    if idx < len(parts):
        if parts[idx].lower() == "semaine":
            if idx + 1 < len(parts):
                semaine = parts[idx + 1].upper()
                idx += 2
        elif parts[idx] in ("A", "B"):
            semaine = parts[idx]
            idx += 1

    # -------------------------
    # Recherche du premier "Groupe"
    # (on ignore complètement Locaux)
    # -------------------------
    while idx < len(parts) and parts[idx] != "Groupe":
        idx += 1

    lib_creneau = ""

    if idx < len(parts):
        idx += 1

        if idx < len(parts):
            mot = parts[idx]

            if mot == "de":
                idx += 2
            else:
                idx += 1

        # Skip type créneau
        if idx < len(parts):
            idx += 1

        # Read lib. créneau
        if idx < len(parts):
            lib_creneau = parts[idx]

    return [
        code,
        activite,
        jour,
        heure_debut,
        heure_fin,
        semaine,
        lib_creneau,
    ]


def charger_uv_automne():
    """Charge les données du fichier UV_automne.csv et retourne un dictionnaire
    de code -> (type_uv, ects)"""
    uv_data = {}
    
    with open("src/UV_automne.csv", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        for row in reader:
            code = row["Code ens."]
            type_uv = row["Type"]
            ects = row["ECTS"]
            uv_data[code] = (type_uv, ects)
    
    return uv_data


def find_excluded_codes(filename):
    """Première passe : recherche des codes à exclure."""

    excluded = set()

    with open(filename, encoding="utf-8") as f:

        for line in f:

            row = parse_line(line)

            if row is None:
                continue

            activite = row[1].lower()

            if activite == "activité annexe" or activite.startswith("sout"):
                excluded.add(row[0])

    return excluded


def write_csv():

    excluded = find_excluded_codes(INPUT_FILE)
    uv_data = charger_uv_automne()

    header = [
        "Code enseig.",
        "Activité",
        "Jour",
        "Heure début",
        "Heure fin",
        "Semaine",
        "Lib. créneau",
        "Type UV",
        "ECTS",
    ]

    kept = 0

    with open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as out:

        writer = csv.writer(out)

        writer.writerow(header)

        with open(INPUT_FILE, encoding="utf-8") as f:

            for line in f:

                row = parse_line(line)

                if row is None:
                    continue

                if row[0] in excluded:
                    continue

                # Récupération des données UV
                code = row[0]
                type_uv = ""
                ects = ""
                
                if code in uv_data:
                    type_uv, ects = uv_data[code]

                writer.writerow([
                    row[0],  # Code
                    row[1],  # Activité
                    row[2],  # Jour
                    row[3],  # Heure début
                    row[4],  # Heure fin
                    row[5],  # Semaine
                    row[6],  # Lib. créneau
                    type_uv,  # Type UV
                    ects,     # ECTS
                ])
                kept += 1

    print()
    print(f"CSV créé : {OUTPUT_FILE}")
    print(f"Lignes conservées : {kept}")
    print()

    if excluded:
        print(f"Codes exclus ({len(excluded)}) :")
        for code in sorted(excluded):
            print(f"  - {code}")
    else:
        print("Aucun code exclu.")


if __name__ == "__main__":
    write_csv()