/**
 * harness.js
 *
 * Charge les fichiers sources RÉELS (model.js, parser.js, sat_model.js,
 * search.js) dans un bac à sable Node, exactement comme le navigateur les
 * charge via des balises <script> (variables/fonctions/classes globales,
 * pas de module.exports). Ça permet d'écrire des tests unitaires sans
 * modifier une seule ligne du code de production.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RACINE = path.join(__dirname, "..");
const FICHIERS = ["model.js", "parser.js", "sat_model.js", "search.js"];

function chargerModules() {
    const ctx = {};
    vm.createContext(ctx);
    for (const fichier of FICHIERS) {
        const code = fs.readFileSync(path.join(RACINE, fichier), "utf8");
        vm.runInContext(code, ctx, { filename: fichier });
    }
    // Les classes déclarées avec `class X {}` (et les let/const de haut
    // niveau) ne sont PAS attachées automatiquement à l'objet contexte par
    // le module vm — contrairement aux `function` déclarées, qui le sont.
    // On les récupère explicitement ; elles restent accessibles car les
    // scripts successifs partagent le même environnement lexical de premier
    // niveau au sein d'un même contexte.
    const classes = vm.runInContext("({ Creneau, Groupe, Enseignement })", ctx);
    Object.assign(ctx, classes);
    return ctx;
}

function chargerModulesAvecSimulateur() {
    const ctx = chargerModules();
    const code = fs.readFileSync(path.join(RACINE, "simulateur.js"), "utf8");
    vm.runInContext(code, ctx, { filename: "simulateur.js" });
    // Idem pour les variables d'état `let` de simulateur.js : pas attachées
    // automatiquement à l'objet contexte, on les récupère explicitement à
    // chaque lecture via ce getter (leur valeur change après chaque appel
    // à simConstruireEtat).
    Object.defineProperty(ctx, "simEtat", { get: () => vm.runInContext(
        "({ simCles, simClesLibres, simOptionsValides, simGroupeFixe, simCoursImposes, simBaseCoherente })", ctx
    ) });
    return ctx;
}

module.exports = { chargerModules, chargerModulesAvecSimulateur, RACINE };
