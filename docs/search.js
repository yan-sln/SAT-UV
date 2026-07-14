/**
 * search.js – fonctions haut niveau pour l'UI.
 */

async function charger(cheminCsv) {
    const { enseignements, codesExclus } = await chargerBase(cheminCsv);
    if (codesExclus.length > 0) {
        console.log(`${codesExclus.length} enseignement(s) ignoré(s) (Cours à groupes multiples non géré) :`);
        console.log(codesExclus.join(", "));
    }
    return { enseignements, codesExclus };
}

function testeEnsemble(enseignements, codes) {
    const message = conflitEntreCours(enseignements, codes);
    if (message) return { satisfiable: false, message };
    const { groupeVersVar } = construireVariables(enseignements, codes);
    const clauses = construireClauses(enseignements, codes, groupeVersVar);
    const nbVariables = Object.keys(groupeVersVar).length;
    const resultat = resoudre(nbVariables, clauses);
    return { satisfiable: resultat !== null, message: null };
}

function validerSelection(enseignements, codesExclus, selection) {
    const valides = [];
    const inconnus = [];
    const exclusRedemandes = [];
    for (const code of selection) {
        if (Object.prototype.hasOwnProperty.call(enseignements, code)) {
            valides.push(code);
        } else if (codesExclus.includes(code)) {
            exclusRedemandes.push(code);
        } else {
            inconnus.push(code);
        }
    }
    if (exclusRedemandes.length) console.log('Codes ignorés car non gérés (Cours à groupes multiples) : ' + exclusRedemandes.join(', '));
    if (inconnus.length) console.log('Codes inconnus (absents de la base) : ' + inconnus.join(', '));
    return { valides, inconnus, exclusRedemandes };
}

function calculerCompatibilites(enseignements, selectionValide) {
    const restants = Object.keys(enseignements).filter(c => !selectionValide.includes(c)).sort();
    const compatibles = [];
    const incompatibles = [];
    for (const code of restants) {
        const { satisfiable } = testeEnsemble(enseignements, [...selectionValide, code]);
        (satisfiable ? compatibles : incompatibles).push(code);
    }
    return { compatibles, incompatibles };
}
