/**
 * sat_model.js
 *
 * Construction du problème SAT (variables + clauses CNF) à partir d'un
 * ensemble de codes d'enseignement sélectionnés, et résolution.
 */

function combinations(arr, k) {
    const resultats = [];
    const n = arr.length;
    if (k > n || k <= 0) return resultats;
    const indices = Array.from({ length: k }, (_, i) => i);
    while (true) {
        resultats.push(indices.map(i => arr[i]));
        let i = k - 1;
        while (i >= 0 && indices[i] === i + n - k) i--;
        if (i < 0) break;
        indices[i]++;
        for (let j = i + 1; j < k; j++) indices[j] = indices[j - 1] + 1;
    }
    return resultats;
}

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

function fmt(minutes) {
    const h = Math.floor(minutes / 60).toString().padStart(2, "0");
    const m = (minutes % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
}

function conflitEntreCours(enseignements, codes) {
    const creneauxCours = [];
    for (const code of codes) {
        for (const c of enseignements[code].cours) {
            creneauxCours.push([code, c]);
        }
    }
    for (const paire of combinations(creneauxCours, 2)) {
        const [[code1, c1], [code2, c2]] = paire;
        if (c1.chevauche(c2)) {
            return `Conflit entre le Cours de ${code1} (${c1.jour} ${fmt(c1.debut)}-${fmt(c1.fin)}) et le Cours de ${code2} (${c2.jour} ${fmt(c2.debut)}-${fmt(c2.fin)})`;
        }
    }
    return null;
}

function groupeConflitAvec(groupe, creneaux) {
    for (const c1 of groupe.creneaux) {
        for (const c2 of creneaux) {
            if (c1.chevauche(c2)) return true;
        }
    }
    return false;
}

function groupesEnConflit(g1, g2) {
    for (const c1 of g1.creneaux) {
        for (const c2 of g2.creneaux) {
            if (c1.chevauche(c2)) return true;
        }
    }
    return false;
}

function construireClauses(enseignements, codes, groupeVersVar) {
    const clauses = [];
    // Règles 2/3/4 : exactement un groupe par activité à choix.
    for (const code of codes) {
        const enseignement = enseignements[code];
        for (const [, groupes] of enseignement.activitesAChoix()) {
            const vars = groupes.map(g => groupeVersVar[g.cle]);
            clauses.push([...vars]); // au moins un
            for (const [v1, v2] of combinations(vars, 2)) {
                clauses.push([-v1, -v2]); // au plus un
            }
        }
    }
    // Règle 5 : conflits groupe vs cours
    for (const codeCours of codes) {
        const creneauxCours = enseignements[codeCours].cours;
        for (const codeGroupe of codes) {
            const enseignement = enseignements[codeGroupe];
            for (const [, groupes] of enseignement.activitesAChoix()) {
                for (const g of groupes) {
                    if (groupeConflitAvec(g, creneauxCours)) {
                        clauses.push([-groupeVersVar[g.cle]]);
                    }
                }
            }
        }
    }
    // Groupe vs groupe
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

function resoudre(nbVariables, clauses) {
    const affectation = {};
    return dpll(clauses, affectation);
}

function dpll(clauses, affectation) {
    const rest = propagerUnitaires(clauses, affectation);
    if (rest === null) return null;
    if (rest.length === 0) return affectation;
    const variable = Math.abs(rest[0][0]);
    for (const val of [true, false]) {
        const nouvelle = { ...affectation, [variable]: val };
        const resultat = dpll(rest, nouvelle);
        if (resultat !== null) return resultat;
    }
    return null;
}

function propagerUnitaires(clauses, affectation) {
    let cur = simplifier(clauses, affectation);
    if (cur === null) return null;
    while (true) {
        const unit = cur.find(c => c.length === 1);
        if (!unit) return cur;
        const lit = unit[0];
        affectation[Math.abs(lit)] = lit > 0;
        cur = simplifier(cur, affectation);
        if (cur === null) return null;
    }
}

function simplifier(clauses, affectation) {
    const res = [];
    for (const clause of clauses) {
        let satisfaite = false;
        const nouvelle = [];
        for (const lit of clause) {
            const v = Math.abs(lit);
            const esper = lit > 0;
            if (Object.prototype.hasOwnProperty.call(affectation, v)) {
                if (affectation[v] === esper) { satisfaite = true; break; }
            } else {
                nouvelle.push(lit);
            }
        }
        if (satisfaite) continue;
        if (nouvelle.length === 0) return null;
        res.push(nouvelle);
    }
    return res;
}
