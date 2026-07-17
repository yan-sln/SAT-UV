const test = require("node:test");
const assert = require("node:assert");
const { chargerModules } = require("./harness");

const ctx = chargerModules();
const { Creneau, Groupe, Enseignement, semainesCompatibles } = ctx;

test("semainesCompatibles : deux semaines vides sont compatibles", () => {
    assert.equal(semainesCompatibles("", ""), true);
});

test("semainesCompatibles : semaine vide compatible avec n'importe quelle semaine", () => {
    assert.equal(semainesCompatibles("", "A"), true);
    assert.equal(semainesCompatibles("B", ""), true);
});

test("semainesCompatibles : même semaine (A/A ou B/B) compatible", () => {
    assert.equal(semainesCompatibles("A", "A"), true);
    assert.equal(semainesCompatibles("B", "B"), true);
});

test("semainesCompatibles : semaines A et B incompatibles", () => {
    assert.equal(semainesCompatibles("A", "B"), false);
    assert.equal(semainesCompatibles("B", "A"), false);
});

test("Creneau.chevauche : jours différents => pas de conflit", () => {
    const c1 = new Creneau("Lundi", 480, 600, "");
    const c2 = new Creneau("Mardi", 480, 600, "");
    assert.equal(c1.chevauche(c2), false);
});

test("Creneau.chevauche : même jour, horaires qui se recouvrent => conflit", () => {
    const c1 = new Creneau("Lundi", 480, 600, ""); // 08:00-10:00
    const c2 = new Creneau("Lundi", 540, 660, ""); // 09:00-11:00
    assert.equal(c1.chevauche(c2), true);
    assert.equal(c2.chevauche(c1), true); // symétrique
});

test("Creneau.chevauche : même jour, horaires disjoints => pas de conflit", () => {
    const c1 = new Creneau("Lundi", 480, 600, ""); // 08:00-10:00
    const c2 = new Creneau("Lundi", 600, 720, ""); // 10:00-12:00
    assert.equal(c1.chevauche(c2), false);
});

test("Creneau.chevauche : créneaux qui se touchent exactement (fin = début) => pas de conflit", () => {
    const c1 = new Creneau("Lundi", 480, 600, "");
    const c2 = new Creneau("Lundi", 600, 660, "");
    assert.equal(c1.chevauche(c2), false);
});

test("Creneau.chevauche : même jour/horaire mais semaines A vs B => pas de conflit", () => {
    const c1 = new Creneau("Lundi", 480, 600, "A");
    const c2 = new Creneau("Lundi", 480, 600, "B");
    assert.equal(c1.chevauche(c2), false);
});

test("Creneau.chevauche : semaine A vs semaine vide => conflit (la semaine vide = toutes les semaines)", () => {
    const c1 = new Creneau("Lundi", 480, 600, "A");
    const c2 = new Creneau("Lundi", 480, 600, "");
    assert.equal(c1.chevauche(c2), true);
});

test("Groupe.cle : identifiant unique basé sur code/activité/lib", () => {
    const g1 = new Groupe("AC01", "TD", "1");
    const g2 = new Groupe("AC01", "TD", "2");
    const g3 = new Groupe("AC01", "TD", "1");
    assert.notEqual(g1.cle, g2.cle);
    assert.equal(g1.cle, g3.cle);
});

test("Enseignement.aBranche : détecte la présence d'une branche (insensible à la casse)", () => {
    const e = new Enseignement("FQ01", [], {}, "TM", 6, ["GB", "GP", "TC"], true);
    assert.equal(e.aBranche("TC"), true);
    assert.equal(e.aBranche("tc"), true);
    assert.equal(e.aBranche("GU"), false);
});

test("Enseignement.aBranche : sans argument, vrai s'il y a au moins une branche", () => {
    const avecBranches = new Enseignement("X", [], {}, "", null, ["TC"], null);
    const sansBranches = new Enseignement("Y", [], {}, "", null, [], null);
    assert.equal(avecBranches.aBranche(), true);
    assert.equal(sansBranches.aBranche(), false);
});

test("Enseignement.diplomantePour : valeur booléenne globale s'applique à toutes les branches", () => {
    const e = new Enseignement("X", [], {}, "", null, ["TC"], true);
    assert.equal(e.diplomantePour("TC"), true);
    assert.equal(e.diplomantePour("GB"), true); // même si GB n'est pas une branche de X
});

test("Enseignement.diplomantePour : détail par branche", () => {
    const e = new Enseignement("FQ01", [], {}, "", null, ["GB", "TC"], { gb: true, tc: false });
    assert.equal(e.diplomantePour("GB"), true);
    assert.equal(e.diplomantePour("TC"), false);
    assert.equal(e.diplomantePour("GU"), null); // branche non renseignée
});

test("Enseignement.diplomantePour : sans branche précisée, vrai si au moins une branche l'est", () => {
    const e = new Enseignement("FQ01", [], {}, "", null, ["GB", "TC"], { gb: true, tc: false });
    assert.equal(e.diplomantePour(), true);
});

test("Enseignement.diplomantePour : null si statut inconnu", () => {
    const e = new Enseignement("X", [], {}, "", null, [], null);
    assert.equal(e.diplomantePour("TC"), null);
    assert.equal(e.diplomantePour(), null);
});

test("Enseignement constructeur : robuste si branches/diplomante omis (undefined)", () => {
    const e = new Enseignement("X", [], {}, "CS", 5);
    assert.deepEqual(e.branches, []);
    assert.equal(e.diplomante, null);
    assert.doesNotThrow(() => e.aBranche("TC"));
});
