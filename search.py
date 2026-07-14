"""
search.py

Fonctions de haut niveau :
- charger()         : charge la base et prévient des codes exclus
- teste_ensemble()   : indique si un ensemble de codes admet un modèle
- tester()           : fonction principale d'usage (cf. document de
                        conception, "Principe général")
"""

import parser as parser_module
import sat_model as sat_model


def charger(chemin_csv: str):
    enseignements, codes_exclus = parser_module.charger_base(chemin_csv)
    if codes_exclus:
        print(
            f"{len(codes_exclus)} enseignement(s) ignoré(s) "
            "(Cours à groupes multiples non géré) :"
        )
        print(", ".join(codes_exclus))
        print()
    return enseignements, codes_exclus


def teste_ensemble(enseignements: dict, codes: list):
    """Teste si l'ensemble de codes donné admet un modèle.

    Renvoie (satisfiable: bool, message: str | None). Le message n'est
    renseigné qu'en cas d'insatisfaisabilité détectée dès la vérification
    des Cours (Règle 1), pour donner une explication précise.
    """
    message = sat_model.conflit_entre_cours(enseignements, codes)
    if message is not None:
        return False, message

    groupe_vers_var, _ = sat_model.construire_variables(enseignements, codes)
    clauses = sat_model.construire_clauses(enseignements, codes, groupe_vers_var)
    nb_variables = len(groupe_vers_var)

    resultat = sat_model.resoudre(nb_variables, clauses)
    return resultat is not None, None


def _valider_selection(enseignements: dict, codes_exclus: list, selection: list):
    """Sépare la sélection utilisateur en codes valides, inconnus, et
    codes exclus explicitement redemandés, avec avertissements."""
    valides, inconnus, exclus_redemandes = [], [], []
    for code in selection:
        if code in enseignements:
            valides.append(code)
        elif code in codes_exclus:
            exclus_redemandes.append(code)
        else:
            inconnus.append(code)

    if exclus_redemandes:
        print(
            "Codes ignorés car non gérés (Cours à groupes multiples) : "
            + ", ".join(exclus_redemandes)
        )
    if inconnus:
        print("Codes inconnus (absents de la base) : " + ", ".join(inconnus))

    return valides


def tester(chemin_csv: str, selected: list):
    enseignements, codes_exclus = charger(chemin_csv)
    selection_valide = _valider_selection(enseignements, codes_exclus, selected)

    print("Ensemble courant\n")
    for code in selection_valide:
        print(code)
    print("\n-----------------------\n")

    satisfiable, message = teste_ensemble(enseignements, selection_valide)
    print(f"Modèle existant : {'OUI' if satisfiable else 'NON'}")
    if not satisfiable:
        if message:
            print(message)
        print(
            "\nL'ensemble sélectionné est déjà insatisfaisable : "
            "retirez un code avant de chercher des compatibilités."
        )
        return

    restants = [c for c in enseignements if c not in selection_valide]
    compatibles, incompatibles = [], []

    for code in sorted(restants):
        ok, _ = teste_ensemble(enseignements, selection_valide + [code])
        (compatibles if ok else incompatibles).append(code)

    print("\nCodes compatibles :\n")
    for code in compatibles:
        print(code)

    print("\nCodes incompatibles :\n")
    for code in incompatibles:
        print(code)

    return compatibles, incompatibles
