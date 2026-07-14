"""
sat_model.py

Construction du problème SAT (variables + clauses CNF) à partir d'un
ensemble de codes d'enseignement sélectionnés, et résolution.

NOTE D'ENVIRONNEMENT :
La bibliothèque python-sat (pysat) n'est pas installable ici (pas d'accès
réseau). On utilise donc un petit solveur DPLL écrit à la main
(propagation unitaire + backtracking). Vu la taille du problème (quelques
centaines de variables, clauses courtes hormis les clauses "au moins un"
par activité), c'est largement suffisant pour ce prototype. Si
python-sat devient disponible, `resoudre()` est le seul point à
remplacer.
"""

from itertools import combinations


# ---------------------------------------------------------------------
# Construction des variables
# ---------------------------------------------------------------------

def construire_variables(enseignements: dict, codes: list):
    """Attribue un identifiant entier à chaque groupe (TD/TP/Atelier) des
    enseignements sélectionnés.

    Renvoie (groupe_vers_var, var_vers_groupe).
    """
    groupe_vers_var = {}
    var_vers_groupe = {}
    prochaine_var = 1

    for code in codes:
        enseignement = enseignements[code]
        for activite, groupes in enseignement.activites_a_choix():
            for groupe in groupes:
                groupe_vers_var[groupe.cle] = prochaine_var
                var_vers_groupe[prochaine_var] = groupe
                prochaine_var += 1

    return groupe_vers_var, var_vers_groupe


# ---------------------------------------------------------------------
# Vérification préalable : conflits entre Cours imposés
# ---------------------------------------------------------------------

def conflit_entre_cours(enseignements: dict, codes: list):
    """Règle 1 : si deux Cours (de codes différents ou du même code) sont
    en conflit, le problème est insatisfaisable sans même lancer le
    solveur. Renvoie None si aucun conflit, ou un message décrivant le
    premier conflit trouvé."""
    creneaux_cours = []  # list[(code, Creneau)]
    for code in codes:
        for creneau in enseignements[code].cours:
            creneaux_cours.append((code, creneau))

    for (code1, c1), (code2, c2) in combinations(creneaux_cours, 2):
        if c1.chevauche(c2):
            return (
                f"Conflit entre le Cours de {code1} ({c1.jour} "
                f"{_fmt(c1.debut)}-{_fmt(c1.fin)}) et le Cours de {code2} "
                f"({c2.jour} {_fmt(c2.debut)}-{_fmt(c2.fin)})"
            )
    return None


def _fmt(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


# ---------------------------------------------------------------------
# Construction des clauses
# ---------------------------------------------------------------------

def construire_clauses(enseignements: dict, codes: list, groupe_vers_var: dict):
    """Construit les clauses CNF (Règles 2, 3, 4, 5) pour l'ensemble de
    codes donné. Suppose qu'il n'y a pas de conflit entre Cours (à
    vérifier au préalable avec conflit_entre_cours)."""
    clauses = []

    # Règles 2/3/4 : exactement un groupe par activité à choix.
    for code in codes:
        enseignement = enseignements[code]
        for activite, groupes in enseignement.activites_a_choix():
            variables = [groupe_vers_var[g.cle] for g in groupes]
            # au moins un
            clauses.append(list(variables))
            # au plus un
            for v1, v2 in combinations(variables, 2):
                clauses.append([-v1, -v2])

    # Règle 5 : aucun conflit horaire entre les groupes retenus, ni entre
    # un groupe retenu et un Cours imposé.

    # Cours (imposés) vs groupes : conflit => le groupe est interdit.
    for code_cours in codes:
        creneaux_cours = enseignements[code_cours].cours
        for code_groupe in codes:
            enseignement = enseignements[code_groupe]
            for activite, groupes in enseignement.activites_a_choix():
                for groupe in groupes:
                    if _groupe_conflit_avec(groupe, creneaux_cours):
                        clauses.append([-groupe_vers_var[groupe.cle]])

    # Groupe vs groupe (tous couples de groupes distincts, y compris
    # entre activités différentes et entre enseignements différents).
    tous_groupes = []
    for code in codes:
        for activite, groupes in enseignements[code].activites_a_choix():
            tous_groupes.extend(groupes)

    for g1, g2 in combinations(tous_groupes, 2):
        if g1.cle == g2.cle:
            continue
        if _groupes_en_conflit(g1, g2):
            clauses.append([-groupe_vers_var[g1.cle], -groupe_vers_var[g2.cle]])

    return clauses


def _groupe_conflit_avec(groupe, creneaux) -> bool:
    return any(c1.chevauche(c2) for c1 in groupe.creneaux for c2 in creneaux)


def _groupes_en_conflit(groupe1, groupe2) -> bool:
    return any(
        c1.chevauche(c2) for c1 in groupe1.creneaux for c2 in groupe2.creneaux
    )


# ---------------------------------------------------------------------
# Solveur DPLL (propagation unitaire + backtracking)
# ---------------------------------------------------------------------

def resoudre(nb_variables: int, clauses: list):
    """Renvoie une affectation satisfaisante (dict var -> bool) si elle
    existe, sinon None."""
    affectation = {}
    return _dpll(clauses, affectation, nb_variables)


def _dpll(clauses, affectation, nb_variables):
    clauses = _propager_unitaires(clauses, affectation)
    if clauses is None:
        return None  # clause vide produite : insatisfaisable
    if not clauses:
        return affectation  # plus de clause à satisfaire

    # Choix d'une variable non affectée (heuristique simple : première
    # variable de la première clause restante).
    variable = abs(clauses[0][0])

    for valeur in (True, False):
        nouvelle_affectation = dict(affectation)
        nouvelle_affectation[variable] = valeur
        resultat = _dpll(clauses, nouvelle_affectation, nb_variables)
        if resultat is not None:
            return resultat

    return None


def _propager_unitaires(clauses, affectation):
    """Simplifie les clauses selon l'affectation courante, puis propage
    les clauses unitaires jusqu'à point fixe. Renvoie None si une clause
    vide apparaît (insatisfaisable), sinon la liste de clauses restantes
    (l'affectation est mise à jour en place)."""
    clauses_actuelles = _simplifier(clauses, affectation)
    if clauses_actuelles is None:
        return None

    while True:
        unitaire = next((c for c in clauses_actuelles if len(c) == 1), None)
        if unitaire is None:
            return clauses_actuelles
        litteral = unitaire[0]
        affectation[abs(litteral)] = litteral > 0
        clauses_actuelles = _simplifier(clauses_actuelles, affectation)
        if clauses_actuelles is None:
            return None


def _simplifier(clauses, affectation):
    resultat = []
    for clause in clauses:
        satisfaite = False
        nouvelle_clause = []
        for litteral in clause:
            variable = abs(litteral)
            valeur_attendue = litteral > 0
            if variable in affectation:
                if affectation[variable] == valeur_attendue:
                    satisfaite = True
                    break
                # sinon littéral faux : on ne le garde pas dans la clause
            else:
                nouvelle_clause.append(litteral)
        if satisfaite:
            continue
        if not nouvelle_clause:
            return None  # clause vide : insatisfaisable
        resultat.append(nouvelle_clause)
    return resultat
