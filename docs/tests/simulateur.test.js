const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chargerModulesAvecSimulateur, RACINE } = require("./harness");
const { parseCsv } = require("./csv_utils");

function chargerBaseReelle() {
    const ctx = chargerModulesAvecSimulateur();
    const texte = fs.readFileSync(path.join(RACINE, "input", "input.csv"), "utf8");
    const rows = parseCsv(texte);
    return { ctx, ...ctx.chargerBaseFromRows(rows) };
}

// --- Reproduction synthétique du bug trouvé pendant le développement :
// deux éléments "sans choix possible" (ici deux groupes réduits chacun à une
// seule option dès le départ) peuvent se chevaucher entre eux sans jamais
// être confrontés l'un à l'autre, si on ne les revalide pas après coup. ---

function construireEnseignementUnique(ctx, code, jour, debut, fin, activite = "TD", lib = "1") {
    const g = new ctx.Groupe(code, activite, lib);
    g.creneaux.push(new ctx.Creneau(jour, debut, fin, ""));
    return new ctx.Enseignement(code, [], { [activite]: [g] }, "CS", 5);
}

test("RÉGRESSION : deux groupes indépendamment réduits à une seule option qui se chevauchent => détecté comme incohérent", () => {
    const ctx = chargerModulesAvecSimulateur();
    // A : TD unique Mardi 16h30-18h30. B : Atelier unique Mardi 14h30-18h30 (chevauche A).
    ctx.enseignements = {
        A: construireEnseignementUnique(ctx, "A", "Mardi", 16 * 60 + 30, 18 * 60 + 30, "TD"),
        B: construireEnseignementUnique(ctx, "B", "Mardi", 14 * 60 + 30, 18 * 60 + 30, "Atelier"),
    };
    ctx.simConstruireEtat(["A", "B"]);
    assert.equal(ctx.simEtat.simBaseCoherente, false, "les deux groupes fixés se chevauchent, la base doit être jugée incohérente");
    assert.equal(ctx.simTrouverAssignation(false), null, "aucune assignation ne doit être trouvée");
});

test("deux groupes indépendamment fixés mais compatibles => base cohérente, assignation trouvée", () => {
    const ctx = chargerModulesAvecSimulateur();
    ctx.enseignements = {
        A: construireEnseignementUnique(ctx, "A", "Lundi", 8 * 60, 10 * 60, "TD"),
        B: construireEnseignementUnique(ctx, "B", "Mardi", 8 * 60, 10 * 60, "TD"),
    };
    ctx.simConstruireEtat(["A", "B"]);
    assert.equal(ctx.simEtat.simBaseCoherente, true);
    assert.notEqual(ctx.simTrouverAssignation(false), null);
});

// --- Tests sur les vraies données (input.csv) ---

test("simulateur : cohérent avec testeEnsemble sur des combinaisons réelles (échantillon)", () => {
    const { ctx, enseignements } = chargerBaseReelle();
    ctx.enseignements = enseignements;
    const codes = Object.keys(enseignements);
    function randCombo(n) {
        return [...codes].sort(() => Math.random() - 0.5).slice(0, n);
    }
    let testes = 0;
    for (const n of [2, 3, 4, 5, 6]) {
        for (let trial = 0; trial < 40; trial++) {
            const combo = randCombo(n);
            const sat = ctx.testeEnsemble(enseignements, combo).satisfiable;
            ctx.simConstruireEtat(combo);
            const assignation = ctx.simTrouverAssignation(true);
            testes++;
            if (sat) {
                assert.notEqual(assignation, null, `SAT selon testeEnsemble mais le simulateur ne trouve rien : ${combo.join(",")}`);
            } else {
                assert.equal(assignation, null, `UNSAT selon testeEnsemble mais le simulateur trouve une assignation : ${combo.join(",")}`);
            }
            if (assignation) {
                // vérifie que l'assignation trouvée est réellement sans conflit
                const tous = [...ctx.simEtat.simCoursImposes];
                for (const g of assignation) tous.push(...g.creneaux);
                for (let i = 0; i < tous.length; i++) {
                    for (let j = i + 1; j < tous.length; j++) {
                        assert.equal(tous[i].chevauche(tous[j]), false, `conflit résiduel non détecté dans l'assignation pour ${combo.join(",")}`);
                    }
                }
            }
        }
    }
    assert.ok(testes > 0);
});

test("RÉGRESSION : la combinaison CM11 + DI05 + MT02 + HT04 + SC22 est simulable (le simulateur trouve un EDT valide)", () => {
    const { ctx, enseignements } = chargerBaseReelle();
    ctx.enseignements = enseignements;
    const codes = ["CM11", "DI05", "MT02", "HT04", "SC22"];
    ctx.simConstruireEtat(codes);
    assert.equal(ctx.simEtat.simBaseCoherente, true);
    const assignation = ctx.simTrouverAssignation(false);
    assert.notEqual(assignation, null);
});
