/**
 * sat_model.js
 *
 * Construction du problème SAT (variables + clauses CNF) à partir d'un
 * ensemble de codes d'enseignement sélectionnés, et résolution.
 *
 * Port direct de sat_model.py : même solveur DPLL écrit à la main
 * (propagation unitaire + backtracking), mêmes règles de construction
 * des clauses. Aucun changement d'algorithme.
 *
 * Dépend de model.js (Creneau.chevauche) — à charger avant ce fichier
 * dans index.html.
 */

// ---------------------------------------------------------------------
// Utilitaire : combinaisons (équivalent itertools.combinations)
// ---------------------------------------------------------------------

function combinations(arr, k) {
    const resultats = [];
    const n = arr.length;
    if (k > n || k <= 0) return resultats;

    const indices = Array.from({ length: k }, (_, i) => i);

    while (true) {
        resultats.push(indices.map((i) => arr[i]));

        let i = k - 1;
        while (i >= 0 && indices[i] === i + n - k) i--;
        if (i < 0) break;

        indices[i]++;
        for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
    }

    return resultats;
}

// ---------------------------------------------------------------------
// Construction des variables
// ---------------------------------------------------------------------

/**
 * Attribue un identifiant entier à chaque groupe (TD/TP/Atelier) des
 * enseignements sélectionnés.
 *
 * Renvoie { groupeVersVar, varVersGroupe }.
 */
function construireVariables(enseignements, codes) {
    const groupeVersVar = {};
    const varVersGroupe = {};
    let prochaineVar = 1;

    for (const code of codes) {
        const enseignement = enseignements[code];
        for (const [, groupes] of enseignement.activitesAChoix()) {
            for (const groupe of groupes) {
                groupeVersVar[groupe.cle] = prochaineVar;
                varVersGroupe[prochaineVar] = groupe;
                prochaineVar++;
            }
        }
    }

    return { groupeVersVar, varVersGroupe };
}

// ---------------------------------------------------------------------
// Vérification préalable : conflits entre Cours imposés
// ---------------------------------------------------------------------

function fmt(minutes) {
    const h = Math.floor(minutes / 60).toString().padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
}

/**
 * Règle 1 : si deux Cours (de codes différents ou du même code) sont en
 * conflit, le problème est insatisfaisable sans même lancer le solveur.
 * Renvoie null si aucun conflit, ou un message décrivant le premier
 * conflit trouvé.
 */
function conflitEntreCours(enseignements, codes) {
    const creneauxCours = []; // [code, Creneau][]
    for (const code of codes) {
        for (const creneau of enseignements[code].cours) {
            creneauxCours.push([code, creneau]);
        }
    }

    for (const paire of combinations(creneauxCours, 2)) {
        const [[code1, c1], [code2, c2]] = paire;
        if (c1.chevauche(c2)) {
            return (
                `Conflit entre le Cours de ${code1} (${c1.jour} ` +
                `${fmt(c1.debut)}-${fmt(c1.fin)}) et le Cours de ${code2} ` +
                `(${c2.jour} ${fmt(c2.debut)}-${fmt(c2.fin)})`
            );
        }
    }

    return null;
}

// ---------------------------------------------------------------------
// Construction des clauses
// ---------------------------------------------------------------------

function groupeConflitAvec(groupe, creneaux) {
    for (const c1 of groupe.creneaux) {
        for (const c2 of creneaux) {
            if (c1.chevauche(c2)) return true;
        }
    }
    return false;
}

function groupesEnConflit(groupe1, groupe2) {
    for (const c1 of groupe1.creneaux) {
        for (const c2 of groupe2.creneaux) {
            if (c1.chevauche(c2)) return true;
        }
    }
    return false;
}

/**
 * Construit les clauses CNF (Règles 2, 3, 4, 5) pour l'ensemble de
 * codes donné. Suppose qu'il n'y a pas de conflit entre Cours (à
 * vérifier au préalable avec conflitEntreCours).
 */
function construireClauses(enseignements, codes, groupeVersVar) {
    const clauses = [];

    // Règles 2/3/4 : exactement un groupe par activité à choix.
    for (const code of codes) {
        const enseignement = enseignements[code];
        for (const [, groupes] of enseignement.activitesAChoix()) {
            const variables = groupes.map((g) => groupeVersVar[g.cle]);
            // au moins un
            clauses.push([...variables]);
            // au plus un
            for (const [v1, v2] of combinations(variables, 2)) {
                clauses.push([-v1, -v2]);
            }
        }
    }

    // Règle 5 : aucun conflit horaire entre les groupes retenus, ni
    // entre un groupe retenu et un Cours imposé.

    // Cours (imposés) vs groupes : conflit => le groupe est interdit.
    for (const codeCours of codes) {
        const creneauxCours = enseignements[codeCours].cours;
        for (const codeGroupe of codes) {
            const enseignement = enseignements[codeGroupe];
            for (const [, groupes] of enseignement.activitesAChoix()) {
                for (const groupe of groupes) {
                    if (groupeConflitAvec(groupe, creneauxCours)) {
                        clauses.push([-groupeVersVar[groupe.cle]]);
                    }
                }
            }
        }
    }

    // Groupe vs groupe (tous couples de groupes distincts, y compris
    // entre activités différentes et entre enseignements différents).
    let tousGroupes = [];
    for (const code of codes) {
        for (const [, groupes] of enseignements[code].activitesAChoix()) {
            tousGroupes = tousGroupes.concat(groupes);
        }
    }

    for (const [g1, g2] of combinations(tousGroupes, 2)) {
        if (g1.cle === g2.cle) continue;
        if (groupesEnConflit(g1, g2)) {
            clauses.push([-groupeVersVar[g1.cle], -groupeVersVar[g2.cle]]);
        }
    }

    return clauses;
}

// ---------------------------------------------------------------------
// Solveur DPLL (propagation unitaire + backtracking)
// ---------------------------------------------------------------------

/**
 * Renvoie une affectation satisfaisante (objet var -> bool) si elle
 * existe, sinon null.
 */
function resoudre(nbVariables, clauses) {
    const affectation = {};
    return dpll(clauses, affectation);
}

function dpll(clauses, affectation) {
    const clausesRestantes = propagerUnitaires(clauses, affectation);
    if (clausesRestantes === null) return null; // clause vide produite : insatisfaisable
    if (clausesRestantes.length === 0) return affectation; // plus de clause à satisfaire

    // Choix d'une variable non affectée (heuristique simple : première
    // variable de la première clause restante).
    const variable = Math.abs(clausesRestantes[0][0]);

    for (const valeur of [true, false]) {
        const nouvelleAffectation = { ...affectation };
        nouvelleAffectation[variable] = valeur;
        const resultat = dpll(clausesRestantes, nouvelleAffectation);
        if (resultat !== null) return resultat;
    }

    return null;
}

/**
 * Simplifie les clauses selon l'affectation courante, puis propage les
 * clauses unitaires jusqu'à point fixe. Renvoie null si une clause vide
 * apparaît (insatisfaisable), sinon la liste de clauses restantes.
 * L'affectation passée en paramètre est mise à jour en place (même
 * comportement que _propager_unitaires en Python, qui mute le dict reçu).
 */
function propagerUnitaires(clauses, affectation) {
    let clausesActuelles = simplifier(clauses, affectation);
    if (clausesActuelles === null) return null;

    while (true) {
        const unitaire = clausesActuelles.find((c) => c.length === 1);
        if (unitaire === undefined) return clausesActuelles;

        const litteral = unitaire[0];
        affectation[Math.abs(litteral)] = litteral > 0;

        clausesActuelles = simplifier(clausesActuelles, affectation);
        if (clausesActuelles === null) return null;
    }
}

function simplifier(clauses, affectation) {
    const resultat = [];

    for (const clause of clauses) {
        let satisfaite = false;
        const nouvelleClause = [];

        for (const litteral of clause) {
            const variable = Math.abs(litteral);
            const valeurAttendue = litteral > 0;

            if (Object.prototype.hasOwnProperty.call(affectation, variable)) {
                if (affectation[variable] === valeurAttendue) {
                    satisfaite = true;
                    break;
                }
                // sinon littéral faux : on ne le garde pas dans la clause
            } else {
                nouvelleClause.push(litteral);
            }
        }

        if (satisfaite) continue;
        if (nouvelleClause.length === 0) return null; // clause vide : insatisfaisable
        resultat.push(nouvelleClause);
    }

    return resultat;
}
