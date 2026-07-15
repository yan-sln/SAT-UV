const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { RACINE } = require("./harness");
const { parseCsv } = require("./csv_utils");

/**
 * input_py.test.js
 *
 * input.py (dossier SAT-UV/input) génère input.csv à partir de l'export ADE
 * brut (input.txt) et de UV_automne.csv. Ces tests vérifient que input.csv
 * respecte bien les garanties que ce script est censé apporter :
 *
 * - les 9 colonnes qu'il écrit sont présentes (header) — input.csv peut en
 *   avoir d'autres en plus (Spécialité, Diplomante, ajoutées manuellement
 *   après coup), ce n'est pas une violation ;
 * - convert_12h_to_24h() ne produit que des heures au format HH:MM ;
 * - find_excluded_codes() retire tout enseignement dont une activité est
 *   "Activité annexe" ou commence par "Sout" (soutenance) — aucune ligne
 *   conservée ne doit donc avoir une telle activité ;
 * - la "Semaine" ne peut valoir que "", ou le jeton en majuscules qui suit
 *   "Semaine" dans l'export ADE (en pratique "A" ou "B") ;
 * - "Code enseig." n'est jamais vide (sinon parse_line() aurait renvoyé None) ;
 * - "ECTS", quand renseigné (trouvé dans UV_automne.csv), est numérique.
 *
 * Remarque : input.py ne restreint PAS les valeurs possibles de "Jour" (il
 * recopie tel quel ce que l'export ADE contient) — un "Samedi" isolé (ex.
 * SR08) est donc parfaitement légitime et n'est pas testé ici.
 */

const CHEMIN_INPUT_CSV = path.join(RACINE, "input", "input.csv");

const COLONNES_GARANTIES_PAR_INPUT_PY = [
    "Code enseig.", "Activité", "Jour", "Heure début", "Heure fin",
    "Semaine", "Lib. créneau", "Type UV", "ECTS",
];

function chargerLignes() {
    const texte = fs.readFileSync(CHEMIN_INPUT_CSV, "utf8");
    return parseCsv(texte);
}

test("input.csv existe et contient des lignes", () => {
    assert.ok(fs.existsSync(CHEMIN_INPUT_CSV), `Fichier introuvable : ${CHEMIN_INPUT_CSV}`);
    const rows = chargerLignes();
    assert.ok(rows.length > 0, "input.csv ne doit pas être vide");
});

test("le header contient toutes les colonnes écrites par input.py (write_csv)", () => {
    const rows = chargerLignes();
    const colonnes = Object.keys(rows[0]);
    for (const attendue of COLONNES_GARANTIES_PAR_INPUT_PY) {
        assert.ok(colonnes.includes(attendue), `Colonne manquante : "${attendue}"`);
    }
});

test("aucune ligne n'a une Activité exclue par find_excluded_codes (Activité annexe / Sout*)", () => {
    const rows = chargerLignes();
    const fautives = rows.filter(r => {
        const a = (r["Activité"] || "").toLowerCase();
        return a === "activité annexe" || a.startsWith("sout");
    });
    assert.deepEqual(
        fautives.map(r => `${r["Code enseig."]} (${r["Activité"]})`),
        [],
        "input.py exclut normalement tout le code dès qu'une de ses activités est une annexe ou une soutenance"
    );
});

test("Heure début / Heure fin sont toujours au format HH:MM (garanti par convert_12h_to_24h)", () => {
    const rows = chargerLignes();
    const formatValide = /^([01]\d|2[0-3]):[0-5]\d$/;
    const fautives = rows.filter(r => !formatValide.test(r["Heure début"]) || !formatValide.test(r["Heure fin"]));
    assert.deepEqual(
        fautives.map(r => `${r["Code enseig."]} : "${r["Heure début"]}"-"${r["Heure fin"]}"`),
        []
    );
});

test("Heure fin est toujours strictement après Heure début (durée positive)", () => {
    const rows = chargerLignes();
    const versMinutes = (hhmm) => {
        const [h, m] = hhmm.split(":").map(Number);
        return h * 60 + m;
    };
    const fautives = rows.filter(r => versMinutes(r["Heure fin"]) <= versMinutes(r["Heure début"]));
    assert.deepEqual(
        fautives.map(r => `${r["Code enseig."]} : ${r["Heure début"]}-${r["Heure fin"]}`),
        []
    );
});

test("Semaine ne vaut jamais rien d'autre que '', 'A' ou 'B'", () => {
    const rows = chargerLignes();
    const valeurs = new Set(rows.map(r => r["Semaine"]));
    for (const v of valeurs) {
        assert.ok(["", "A", "B"].includes(v), `Valeur de Semaine inattendue : "${v}"`);
    }
});

test("Code enseig. n'est jamais vide (parse_line() aurait renvoyé None sinon)", () => {
    const rows = chargerLignes();
    const fautives = rows.filter(r => !r["Code enseig."] || !r["Code enseig."].trim());
    assert.equal(fautives.length, 0);
});

test("ECTS, quand renseigné, est bien numérique", () => {
    const rows = chargerLignes();
    const fautives = rows.filter(r => r["ECTS"] !== "" && isNaN(parseFloat(r["ECTS"])));
    assert.deepEqual(
        fautives.map(r => `${r["Code enseig."]} : ECTS="${r["ECTS"]}"`),
        []
    );
});

test("Activité n'est jamais vide", () => {
    const rows = chargerLignes();
    const fautives = rows.filter(r => !r["Activité"] || !r["Activité"].trim());
    assert.equal(fautives.length, 0);
});
