const test = require("node:test");
const assert = require("node:assert");
const { chargerModules } = require("./harness");

const ctx = chargerModules();
const { testeEnsemble, validerSelection, calculerCompatibilites, Enseignement, Groupe, Creneau } = ctx;

function baseSimple() {
    const gA = new Groupe("A", "TD", "1");
    gA.creneaux.push(new Creneau("Lundi", 480, 600, ""));
    const gB = new Groupe("B", "TD", "1");
    gB.creneaux.push(new Creneau("Mardi", 480, 600, ""));
    const gC = new Groupe("C", "TD", "1");
    gC.creneaux.push(new Creneau("Lundi", 480, 600, "")); // conflit avec A
    return {
        A: new Enseignement("A", [], { TD: [gA] }, "CS", 5),
        B: new Enseignement("B", [], { TD: [gB] }, "CS", 5),
        C: new Enseignement("C", [], { TD: [gC] }, "CS", 5),
    };
}

test("testeEnsemble : combinaison compatible => satisfiable true", () => {
    const enseignements = baseSimple();
    const res = testeEnsemble(enseignements, ["A", "B"]);
    assert.equal(res.satisfiable, true);
});

test("testeEnsemble : combinaison incompatible => satisfiable false", () => {
    const enseignements = baseSimple();
    const res = testeEnsemble(enseignements, ["A", "C"]);
    assert.equal(res.satisfiable, false);
});

test("validerSelection : sépare codes valides / inconnus / exclus", () => {
    const enseignements = baseSimple();
    const codesExclus = ["ZZ99"];
    const { valides, inconnus, exclusRedemandes } = validerSelection(
        enseignements, codesExclus, ["A", "B", "INCONNU1", "ZZ99"]
    );
    assert.deepEqual(valides, ["A", "B"]);
    assert.deepEqual(inconnus, ["INCONNU1"]);
    assert.deepEqual(exclusRedemandes, ["ZZ99"]);
});

test("calculerCompatibilites : classe correctement compatibles/incompatibles", () => {
    const enseignements = baseSimple();
    const { compatibles, incompatibles } = calculerCompatibilites(enseignements, ["A"]);
    assert.ok(compatibles.includes("B"), "B est compatible avec A");
    assert.ok(incompatibles.includes("C"), "C est incompatible avec A (même créneau)");
});
