const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { chargerModules, RACINE } = require("./harness");
const { parseCsv } = require("./csv_utils");

const cheminCsv = path.join(RACINE, "input", "input.csv");

function chargerBaseReelle() {
    const ctx = chargerModules();
    const texte = fs.readFileSync(cheminCsv, "utf8");
    const rows = parseCsv(texte);
    return { ctx, ...ctx.chargerBaseFromRows(rows) };
}

test("input.csv est présent et se charge sans erreur", () => {
    assert.ok(fs.existsSync(cheminCsv), `Fichier introuvable : ${cheminCsv}`);
    const { enseignements } = chargerBaseReelle();
    assert.ok(Object.keys(enseignements).length > 0, "au moins un enseignement doit être chargé");
});

test("RÉGRESSION : aucun groupe TD/TP ne fusionne anormalement plusieurs séances sous un même libellé", () => {
    // C'est exactement le bug MT02 : un 'Lib. créneau' générique (ex. 'D')
    // réutilisé pour plusieurs séances alternatives différentes faisait
    // croire au solveur qu'il s'agissait d'UN SEUL groupe occupant tous ces
    // créneaux à la fois. Seuil : un groupe légitime peut se répéter 2-3
    // fois par semaine (ex. TD qui a 2 séances/semaine), au-delà c'est
    // très probablement un défaut d'étiquetage dans le CSV source.
    const { enseignements } = chargerBaseReelle();
    const SEUIL = 3;
    const suspects = [];
    for (const [code, e] of Object.entries(enseignements)) {
        for (const [activite, groupes] of e.activitesAChoix()) {
            for (const g of groupes) {
                if (g.creneaux.length > SEUIL) {
                    suspects.push(`${code} / ${activite} / lib="${g.lib}" : ${g.creneaux.length} créneaux fusionnés`);
                }
            }
        }
    }
    assert.deepEqual(suspects, [], `Groupes suspects détectés (probable défaut d'étiquetage 'Lib. créneau') :\n${suspects.join("\n")}`);
});

test("RÉGRESSION : la combinaison CM11 + DI05 + MT02 + HT04 + SC22 est compatible (SAT)", () => {
    const { ctx, enseignements } = chargerBaseReelle();
    const codes = ["CM11", "DI05", "MT02", "HT04", "SC22"];
    for (const c of codes) {
        assert.ok(enseignements[c], `le code ${c} doit exister dans la base`);
    }
    const resultat = ctx.testeEnsemble(enseignements, codes);
    assert.equal(resultat.satisfiable, true, resultat.message || "devrait être SAT");
});

test("RÉGRESSION : un Cours imposé à plusieurs séances (même Lib. créneau) n'est jamais scindé en fausses alternatives", () => {
    // Bug trouvé via un écart avec l'outil officiel de la DSI : un enseignement
    // ayant plusieurs créneaux de Cours DISTINCTS était toujours traité comme
    // une activité à choix, même quand tous ces créneaux partageaient le même
    // Lib. créneau (= une seule vraie séance répétée dans la semaine, pas des
    // alternatives). Ça donnait au solveur une liberté qui n'existe pas dans
    // la réalité, et masquait de vrais conflits d'horaire (ex. MT02 vs
    // GE28/DI05 : le vrai conflit n'apparaissait qu'en forçant les deux
    // séances du même groupe de Cours).
    const { enseignements } = chargerBaseReelle();
    for (const [code, e] of Object.entries(enseignements)) {
        if (e.groupes["Cours"]) {
            for (const g of e.groupes["Cours"]) {
                assert.ok(g.lib, `${code} : un groupe de Cours à choix doit avoir un Lib. créneau identifiant (trouvé vide)`);
            }
        }
    }
});

test("RÉGRESSION : la combinaison CM11 + MT02 + DI05 + HT04 + GE28 (et variantes) correspond à l'outil officiel de la DSI", () => {
    // Résultats de référence obtenus sur https://webapplis.utc.fr/smeappli/testuvsetu/
    const { ctx, enseignements } = chargerBaseReelle();
    const cas = [
        { codes: ["CM11", "MT02", "DI05", "HT04", "GE28"], satisfiable: false },
        { codes: ["PS04", "MT02", "DI05", "HT04", "GE28"], satisfiable: false },
        { codes: ["CM11", "PS04", "DI05", "HT04", "GE28"], satisfiable: true },
        { codes: ["TN01", "MT02", "DI05", "HT04", "GE28"], satisfiable: false },
        { codes: ["CM11", "TN01", "DI05", "HT04", "GE28"], satisfiable: true },
        { codes: ["CM11", "MT02", "TN01", "HT04", "GE28"], satisfiable: true },
        { codes: ["SC22", "GE28", "CM11", "MT02", "DI05"], satisfiable: false },
        { codes: ["HT04", "SC22", "CM11", "MT02", "DI05"], satisfiable: true },
    ];
    for (const { codes, satisfiable } of cas) {
        for (const c of codes) assert.ok(enseignements[c], `le code ${c} doit exister dans la base`);
        const resultat = ctx.testeEnsemble(enseignements, codes);
        assert.equal(resultat.satisfiable, satisfiable, `${codes.join(" ")} : attendu ${satisfiable ? "SAT" : "UNSAT"}, obtenu ${resultat.satisfiable ? "SAT" : "UNSAT"} (${resultat.message || ""})`);
    }
});

test("chaque enseignement a au plus un Cours imposé OU un groupe de Cours à choix, jamais les deux", () => {
    const { enseignements } = chargerBaseReelle();
    for (const [code, e] of Object.entries(enseignements)) {
        const aCoursImpose = e.cours.length > 0;
        const aCoursAChoix = Boolean(e.groupes["Cours"]);
        assert.ok(!(aCoursImpose && aCoursAChoix), `${code} a à la fois un Cours imposé et un Cours à choix`);
    }
}); 

test("tous les enseignements ont un code non vide et un ECTS nul ou numérique", () => {
    const { enseignements } = chargerBaseReelle();
    for (const [code, e] of Object.entries(enseignements)) {
        assert.ok(code && code.trim().length > 0);
        assert.ok(e.ects === null || typeof e.ects === "number");
    }
});
