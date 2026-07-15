const test = require("node:test");
const assert = require("node:assert");
const { chargerModules } = require("./harness");

const ctx = chargerModules();
const { parseBranches, parseDiplomante, chargerBaseFromRows } = ctx;

// --- parseBranches ---

test("parseBranches : chaîne vide => tableau vide", () => {
    assert.deepEqual(parseBranches(""), []);
    assert.deepEqual(parseBranches(undefined), []);
});

test("parseBranches : une seule branche", () => {
    assert.deepEqual(parseBranches("TC"), ["TC"]);
});

test("parseBranches : plusieurs branches séparées par des virgules, espaces retirés", () => {
    assert.deepEqual(parseBranches("GB, GP, GU, IM, TC"), ["GB", "GP", "GU", "IM", "TC"]);
});

// --- parseDiplomante ---

test("parseDiplomante : chaîne vide => null (inconnu)", () => {
    assert.equal(parseDiplomante(""), null);
    assert.equal(parseDiplomante(undefined), null);
});

test("parseDiplomante : 'Oui' => true", () => {
    assert.equal(parseDiplomante("Oui"), true);
});

test("parseDiplomante : 'Non' => false", () => {
    assert.equal(parseDiplomante("Non"), false);
});

test("parseDiplomante : détail par branche => objet avec clés en minuscules", () => {
    const resultat = parseDiplomante("GB: Oui, GP: Oui, TC: Non");
    assert.deepEqual(resultat, { gb: true, gp: true, tc: false });
});

// --- chargerBaseFromRows : construction Cours imposé vs Cours à choix ---

function ligne(champs) {
    return {
        "Code enseig.": "X01",
        "Spécialité": "",
        "Diplomante": "",
        "Activité": "Cours",
        "Jour": "Lundi",
        "Heure début": "08:00",
        "Heure fin": "10:00",
        "Semaine": "",
        "Lib. créneau": "",
        "Type UV": "CS",
        "ECTS": "5",
        ...champs,
    };
}

test("chargerBaseFromRows : un seul créneau de Cours => imposé (this.cours)", () => {
    const rows = [ligne({})];
    const { enseignements } = chargerBaseFromRows(rows);
    const e = enseignements["X01"];
    assert.equal(e.cours.length, 1);
    assert.equal(e.cours[0].jour, "Lundi");
    assert.equal(Object.keys(e.groupes).length, 0);
});

test("chargerBaseFromRows : plusieurs créneaux de Cours distincts => activité à choix, pas imposée", () => {
    const rows = [
        ligne({ "Jour": "Lundi", "Heure début": "08:00", "Heure fin": "10:00" }),
        ligne({ "Jour": "Mardi", "Heure début": "10:15", "Heure fin": "12:15" }),
    ];
    const { enseignements } = chargerBaseFromRows(rows);
    const e = enseignements["X01"];
    assert.equal(e.cours.length, 0, "le Cours ne doit plus être imposé");
    assert.ok(e.groupes["Cours"], "un groupe à choix 'Cours' doit exister");
    assert.equal(e.groupes["Cours"].length, 2);
});

test("chargerBaseFromRows : lignes de Cours strictement identiques => dédoublonnées (reste imposé)", () => {
    const rows = [ligne({}), ligne({})]; // même jour/heure/semaine, dupliqué
    const { enseignements } = chargerBaseFromRows(rows);
    const e = enseignements["X01"];
    assert.equal(e.cours.length, 1, "les doublons stricts ne doivent pas créer un 2e créneau");
});

test("chargerBaseFromRows : TD avec même Lib. créneau agrège les créneaux dans UN SEUL groupe", () => {
    const rows = [
        ligne({ "Activité": "TD", "Jour": "Lundi", "Heure début": "08:00", "Heure fin": "10:00", "Lib. créneau": "1" }),
        ligne({ "Activité": "TD", "Jour": "Mercredi", "Heure début": "08:00", "Heure fin": "10:00", "Lib. créneau": "1" }),
        ligne({ "Activité": "TD", "Jour": "Jeudi", "Heure début": "08:00", "Heure fin": "10:00", "Lib. créneau": "2" }),
    ];
    const { enseignements } = chargerBaseFromRows(rows);
    const e = enseignements["X01"];
    const groupesTD = e.groupes["TD"];
    assert.equal(groupesTD.length, 2, "deux groupes distincts : lib 1 et lib 2");
    const groupe1 = groupesTD.find(g => g.lib === "1");
    assert.equal(groupe1.creneaux.length, 2, "le groupe 1 agrège ses 2 créneaux (Lundi + Mercredi)");
});

test("chargerBaseFromRows : branches et diplomante sont bien rattachés à l'enseignement", () => {
    const rows = [ligne({ "Spécialité": "GB, TC", "Diplomante": "GB: Oui, TC: Non" })];
    const { enseignements } = chargerBaseFromRows(rows);
    const e = enseignements["X01"];
    assert.deepEqual(e.branches, ["GB", "TC"]);
    assert.equal(e.diplomantePour("GB"), true);
    assert.equal(e.diplomantePour("TC"), false);
});

test("chargerBaseFromRows : lignes sans code enseig. sont ignorées", () => {
    const rows = [ligne({ "Code enseig.": "" }), ligne({})];
    const { enseignements } = chargerBaseFromRows(rows);
    assert.equal(Object.keys(enseignements).length, 1);
});

test("chargerBaseFromRows : ECTS numérique correctement parsé, absent => null", () => {
    const rows = [ligne({ "ECTS": "6" })];
    const { enseignements } = chargerBaseFromRows(rows);
    assert.equal(enseignements["X01"].ects, 6);

    const rows2 = [ligne({ "ECTS": "" })];
    const { enseignements: e2 } = chargerBaseFromRows(rows2);
    assert.equal(e2["X01"].ects, null);
});
