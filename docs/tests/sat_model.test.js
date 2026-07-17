const test = require("node:test");
const assert = require("node:assert");
const { chargerModules } = require("./harness");

const ctx = chargerModules();
const {
    combinations, construireVariables, conflitEntreCours,
    construireClauses, resoudre, simplifier, Enseignement, Groupe, Creneau,
} = ctx;

// --- combinations ---

test("combinations : toutes les paires de [1,2,3]", () => {
    const resultat = combinations([1, 2, 3], 2);
    assert.deepEqual(resultat, [[1, 2], [1, 3], [2, 3]]);
});

test("combinations : k > n => aucune combinaison", () => {
    assert.deepEqual(combinations([1, 2], 3), []);
});

test("combinations : k <= 0 => aucune combinaison", () => {
    assert.deepEqual(combinations([1, 2], 0), []);
});

// --- conflitEntreCours ---

function enseignementSimple(code, cours) {
    return new Enseignement(code, cours, {}, "CS", 5);
}

test("conflitEntreCours : deux Cours imposés qui se chevauchent => message d'erreur", () => {
    const enseignements = {
        A: enseignementSimple("A", [new Creneau("Lundi", 480, 600, "")]),
        B: enseignementSimple("B", [new Creneau("Lundi", 540, 660, "")]),
    };
    const message = conflitEntreCours(enseignements, ["A", "B"]);
    assert.ok(message && message.includes("Conflit"));
});

test("conflitEntreCours : Cours imposés compatibles => null", () => {
    const enseignements = {
        A: enseignementSimple("A", [new Creneau("Lundi", 480, 600, "")]),
        B: enseignementSimple("B", [new Creneau("Mardi", 480, 600, "")]),
    };
    assert.equal(conflitEntreCours(enseignements, ["A", "B"]), null);
});

// --- simplifier (propagation) ---

test("simplifier : une clause satisfaite est retirée", () => {
    const clauses = [[1, 2], [-1, 3]];
    const res = simplifier(clauses, { 1: true });
    // [1,2] satisfaite par 1=true -> retirée ; [-1,3] simplifiée en [3]
    assert.deepEqual(res, [[3]]);
});

test("simplifier : clause vide restante => insatisfaisable (null)", () => {
    const clauses = [[1]];
    const res = simplifier(clauses, { 1: false });
    assert.equal(res, null);
});

// --- resoudre / DPLL : scénarios synthétiques ---

function groupeUnique(code, activite, lib, creneau) {
    const g = new Groupe(code, activite, lib);
    g.creneaux.push(creneau);
    return g;
}

test("resoudre : deux UV avec des TD à choix compatibles => SAT", () => {
    // UV A : un seul TD, lundi 8h-10h. UV B : un seul TD, mardi 8h-10h. Pas de conflit possible.
    const gA = groupeUnique("A", "TD", "1", new Creneau("Lundi", 480, 600, ""));
    const gB = groupeUnique("B", "TD", "1", new Creneau("Mardi", 480, 600, ""));
    const enseignements = {
        A: new Enseignement("A", [], { TD: [gA] }, "CS", 5),
        B: new Enseignement("B", [], { TD: [gB] }, "CS", 5),
    };
    const { groupeVersVar } = construireVariables(enseignements, ["A", "B"]);
    const clauses = construireClauses(enseignements, ["A", "B"], groupeVersVar);
    const resultat = resoudre(Object.keys(groupeVersVar).length, clauses);
    assert.notEqual(resultat, null, "devrait être satisfiable");
});

test("resoudre : deux UV dont le seul TD possible se chevauche => UNSAT", () => {
    const gA = groupeUnique("A", "TD", "1", new Creneau("Lundi", 480, 600, ""));
    const gB = groupeUnique("B", "TD", "1", new Creneau("Lundi", 540, 660, "")); // chevauche gA
    const enseignements = {
        A: new Enseignement("A", [], { TD: [gA] }, "CS", 5),
        B: new Enseignement("B", [], { TD: [gB] }, "CS", 5),
    };
    const { groupeVersVar } = construireVariables(enseignements, ["A", "B"]);
    const clauses = construireClauses(enseignements, ["A", "B"], groupeVersVar);
    const resultat = resoudre(Object.keys(groupeVersVar).length, clauses);
    assert.equal(resultat, null, "devrait être insatisfaisable");
});

test("resoudre : UV avec 2 TD alternatifs, un seul compatible => SAT en choisissant le bon", () => {
    // TD 1 chevauche le Cours imposé de B, TD 2 non : le solveur doit choisir TD 2.
    const coursB = [new Creneau("Lundi", 480, 600, "")];
    const td1 = groupeUnique("A", "TD", "1", new Creneau("Lundi", 480, 600, "")); // conflit avec Cours B
    const td2 = groupeUnique("A", "TD", "2", new Creneau("Mardi", 480, 600, "")); // libre
    const enseignements = {
        A: new Enseignement("A", [], { TD: [td1, td2] }, "CS", 5),
        B: new Enseignement("B", coursB, {}, "CS", 5),
    };
    const { groupeVersVar } = construireVariables(enseignements, ["A", "B"]);
    const clauses = construireClauses(enseignements, ["A", "B"], groupeVersVar);
    const resultat = resoudre(Object.keys(groupeVersVar).length, clauses);
    assert.notEqual(resultat, null);
    // Le TD choisi doit être celui qui ne conflicte pas (td2)
    const varTd2 = groupeVersVar[td2.cle];
    assert.equal(resultat[varTd2], true);
});

test("resoudre : activité à choix sans aucune option compatible => UNSAT", () => {
    const coursB = [new Creneau("Lundi", 480, 600, "")];
    const td1 = groupeUnique("A", "TD", "1", new Creneau("Lundi", 480, 600, ""));
    const enseignements = {
        A: new Enseignement("A", [], { TD: [td1] }, "CS", 5),
        B: new Enseignement("B", coursB, {}, "CS", 5),
    };
    const { groupeVersVar } = construireVariables(enseignements, ["A", "B"]);
    const clauses = construireClauses(enseignements, ["A", "B"], groupeVersVar);
    const resultat = resoudre(Object.keys(groupeVersVar).length, clauses);
    assert.equal(resultat, null);
});

test("resoudre : liste de codes vide => trivialement SAT (aucune clause)", () => {
    const { groupeVersVar } = construireVariables({}, []);
    const clauses = construireClauses({}, [], groupeVersVar);
    const resultat = resoudre(0, clauses);
    assert.notEqual(resultat, null);
});
