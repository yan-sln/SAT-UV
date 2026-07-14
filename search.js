/**
 * search.js
 *
 * Fonctions de haut niveau, équivalentes à search.py :
 * - charger()        : charge la base (URL) et prévient des codes exclus
 * - testeEnsemble()  : indique si un ensemble de codes admet un modèle
 * - validerSelection(): sépare une sélection en valides / inconnus / exclus
 * - tester()         : fonction principale (calcul compatibles/incompatibles)
 *
 * Dépend de parser.js et sat_model.js — à charger avant ce fichier dans
 * index.html.
 */

async function charger(cheminCsv) {
    const { enseignements, codesExclus } = await chargerBase(cheminCsv);
    if (codesExclus.length > 0) {
        console.log(
            `${codesExclus.length} enseignement(s) ignoré(s) ` +
                "(Cours à groupes multiples non géré) :"
        );
        console.log(codesExclus.join(", "));
    }
    return { enseignements, codesExclus };
}

/**
 * Teste si l'ensemble de codes donné admet un modèle.
 *
 * Renvoie { satisfiable, message }. Le message n'est renseigné qu'en cas
 * d'insatisfaisabilité détectée dès la vérification des Cours (Règle 1),
 * pour donner une explication précise.
 */
function testeEnsemble(enseignements, codes) {
    const message = conflitEntreCours(enseignements, codes);
    if (message !== null) {
        return { satisfiable: false, message };
    }

    const { groupeVersVar } = construireVariables(enseignements, codes);
    const clauses = construireClauses(enseignements, codes, groupeVersVar);
    const nbVariables = Object.keys(groupeVersVar).length;

    const resultat = resoudre(nbVariables, clauses);
    return { satisfiable: resultat !== null, message: null };
}

/**
 * Sépare la sélection utilisateur en codes valides, inconnus, et codes
 * exclus explicitement redemandés.
 */
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

    if (exclusRedemandes.length > 0) {
        console.log(
            "Codes ignorés car non gérés (Cours à groupes multiples) : " +
                exclusRedemandes.join(", ")
        );
    }
    if (inconnus.length > 0) {
        console.log("Codes inconnus (absents de la base) : " + inconnus.join(", "));
    }

    return { valides, inconnus, exclusRedemandes };
}

/**
 * Calcule, pour une sélection déjà validée, les codes compatibles et
 * incompatibles parmi les enseignements restants. Suppose que la
 * sélection elle-même est satisfiable (à vérifier avant l'appel).
 */
function calculerCompatibilites(enseignements, selectionValide) {
    const restants = Object.keys(enseignements)
        .filter((c) => !selectionValide.includes(c))
        .sort();

    const compatibles = [];
    const incompatibles = [];

    for (const code of restants) {
        const { satisfiable } = testeEnsemble(enseignements, [...selectionValide, code]);
        (satisfiable ? compatibles : incompatibles).push(code);
    }

    return { compatibles, incompatibles };
}

/**
 * Équivalent de tester() en Python : charge la base, valide la
 * sélection, teste sa satisfaisabilité, puis calcule les compatibles /
 * incompatibles. Utilise console.log pour les traces (comme la version
 * Python), et renvoie un objet exploitable par l'UI.
 */
async function tester(cheminCsv, selected) {
    const { enseignements, codesExclus } = await charger(cheminCsv);
    const { valides: selectionValide } = validerSelection(
        enseignements,
        codesExclus,
        selected
    );

    console.log("Ensemble courant\n");
    for (const code of selectionValide) console.log(code);
    console.log("\n-----------------------\n");

    const { satisfiable, message } = testeEnsemble(enseignements, selectionValide);
    console.log(`Modèle existant : ${satisfiable ? "OUI" : "NON"}`);

    if (!satisfiable) {
        if (message) console.log(message);
        console.log(
            "\nL'ensemble sélectionné est déjà insatisfaisable : " +
                "retirez un code avant de chercher des compatibilités."
        );
        return {
            enseignements,
            codesExclus,
            selectionValide,
            satisfiable,
            message,
            compatibles: [],
            incompatibles: [],
        };
    }

    const { compatibles, incompatibles } = calculerCompatibilites(
        enseignements,
        selectionValide
    );

    console.log("\nCodes compatibles :\n");
    for (const code of compatibles) console.log(code);

    console.log("\nCodes incompatibles :\n");
    for (const code of incompatibles) console.log(code);

    return {
        enseignements,
        codesExclus,
        selectionValide,
        satisfiable,
        message: null,
        compatibles,
        incompatibles,
    };
}
