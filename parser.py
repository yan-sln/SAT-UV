"""
parser.py

Lecture du fichier CSV (export ADE nettoyé) et construction de la base de
faits en mémoire : un dict {code: Enseignement}.

Particularités des données identifiées lors de l'analyse et prises en
compte ici :

1. Un "groupe" (TD/TP/Atelier) peut être constitué de PLUSIEURS créneaux
   partageant le même (Code, Activité, Lib. créneau) — par exemple une
   séance "D" (TD) et une séance "T" sous le même numéro de groupe. On
   agrège donc toutes les lignes correspondantes, sans filtrer sur
   "Type créneau".

2. Certains enseignements ont un Cours réparti sur PLUSIEURS "Lib. créneau"
   distincts (ex. IS00, MT02, MT03, MT23, MTX2). Cela contredit la Règle 1
   du document ("les Cours sont imposés, jamais un choix") : ce sont très
   probablement deux cohortes alternatives d'amphi, pas des séances
   cumulées. Ce cas n'est pas géré dans ce prototype : ces enseignements
   sont exclus de la base chargée, et la liste des codes exclus est
   renvoyée à l'appelant pour affichage à l'utilisateur.
"""

import csv
from collections import defaultdict

from model import Creneau, Enseignement, Groupe

ACTIVITES_A_CHOIX = ("TD", "TP", "Atelier")


def _parse_heure(hhmm: str) -> int:
    heures, minutes = hhmm.split(":")
    return int(heures) * 60 + int(minutes)


def charger_base(chemin_csv: str):
    """Lit le CSV et construit la base de faits.

    Renvoie (enseignements, codes_exclus) où :
    - enseignements est un dict {code: Enseignement}
    - codes_exclus est la liste triée des codes ignorés (Cours à groupes
      multiples, cf. docstring du module)
    """
    lignes_par_code = defaultdict(list)

    with open(chemin_csv, newline="", encoding="utf-8") as f:
        lecteur = csv.DictReader(f)
        for ligne in lecteur:
            lignes_par_code[ligne["Code enseig."]].append(ligne)

    enseignements = {}
    codes_exclus = []

    for code, lignes in lignes_par_code.items():
        lignes_cours = [l for l in lignes if l["Activité"] == "Cours"]

        libs_cours = {l["Lib. créneau"] for l in lignes_cours}
        if len(libs_cours) > 1:
            # Cours à groupes multiples : non géré dans ce prototype.
            codes_exclus.append(code)
            continue

        cours = [
            Creneau(
                jour=l["Jour"],
                debut=_parse_heure(l["Heure début"]),
                fin=_parse_heure(l["Heure fin"]),
                semaine=l["Semaine"],
            )
            for l in lignes_cours
        ]

        groupes_par_activite = defaultdict(dict)  # activite -> lib -> Groupe
        for l in lignes:
            activite = l["Activité"]
            if activite not in ACTIVITES_A_CHOIX:
                continue
            lib = l["Lib. créneau"]
            creneau = Creneau(
                jour=l["Jour"],
                debut=_parse_heure(l["Heure début"]),
                fin=_parse_heure(l["Heure fin"]),
                semaine=l["Semaine"],
            )
            if lib not in groupes_par_activite[activite]:
                groupes_par_activite[activite][lib] = Groupe(
                    code=code, activite=activite, lib=lib
                )
            groupes_par_activite[activite][lib].creneaux.append(creneau)

        groupes = {
            activite: list(par_lib.values())
            for activite, par_lib in groupes_par_activite.items()
        }

        enseignements[code] = Enseignement(code=code, cours=cours, groupes=groupes)

    return enseignements, sorted(codes_exclus)
