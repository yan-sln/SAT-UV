/**
 * parser.js
 *
 * Construction de la base de faits en mémoire à partir des lignes CSV
 * (déjà parsées par PapaParse côté navigateur, avec header: true, ce qui
 * reproduit csv.DictReader de Python).
 *
 * Mêmes particularités que parser.py :
 * 1. Un "groupe" (TD/TP/Atelier) peut être constitué de PLUSIEURS créneaux
 *    partageant le même (Code, Activité, Lib. créneau). On agrège donc
 *    toutes les lignes correspondantes, sans filtrer sur "Type créneau".
 * 2. Certains enseignements ont un Cours réparti sur PLUSIEURS "Lib. créneau"
 *    distincts. Ce cas n'est pas géré : ces enseignements sont exclus de la
 *    base chargée, et la liste des codes exclus est renvoyée à l'appelant.
 */

const ACTIVITES_A_CHOIX = ["TD", "TP", "Atelier"];

function parseHeure(hhmm) {
    const [heures, minutes] = hhmm.split(":");
    return parseInt(heures, 10) * 60 + parseInt(minutes, 10);
}

function chargerBaseFromRows(rows) {
    const lignesParCode = new Map();
    for (const ligne of rows) {
        const code = ligne["Code enseig."];
        if (!code) continue;
        if (!lignesParCode.has(code)) lignesParCode.set(code, []);
        lignesParCode.get(code).push(ligne);
    }
    const enseignements = {};
    const codesExclus = [];
    for (const [code, lignes] of lignesParCode.entries()) {
        const lignesCours = lignes.filter(l => l["Activité"] === "Cours");
        const libsCours = new Set(lignesCours.map(l => l["Lib. créneau"]));
        if (libsCours.size > 1) { // cours à groupes multiples => exclu
            codesExclus.push(code);
            continue;
        }
        const cours = lignesCours.map(l => new Creneau(l["Jour"], parseHeure(l["Heure début"]), parseHeure(l["Heure fin"]), l["Semaine"]));
        const groupesParActivite = {};
        for (const l of lignes) {
            const activite = l["Activité"];
            if (!ACTIVITES_A_CHOIX.includes(activite)) continue;
            const lib = l["Lib. créneau"];
            const creneau = new Creneau(l["Jour"], parseHeure(l["Heure début"]), parseHeure(l["Heure fin"]), l["Semaine"]);
            if (!groupesParActivite[activite]) groupesParActivite[activite] = {};
            if (!groupesParActivite[activite][lib]) {
                groupesParActivite[activite][lib] = new Groupe(code, activite, lib);
            }
            groupesParActivite[activite][lib].creneaux.push(creneau);
        }
        const groupes = {};
        for (const [activite, parLib] of Object.entries(groupesParActivite)) {
            groupes[activite] = Object.values(parLib);
        }
        const categorie = (lignes[0]["Type UV"] || "").trim();
        const ectsBrut = lignes[0]["ECTS"];
        const ects = ectsBrut !== undefined && ectsBrut !== "" && !isNaN(parseFloat(ectsBrut)) ? parseFloat(ectsBrut) : null;
        enseignements[code] = new Enseignement(code, cours, groupes, categorie, ects);
    }
    codesExclus.sort();
    return { enseignements, codesExclus };
}

async function chargerBase(cheminCsv) {
    const reponse = await fetch(cheminCsv);
    if (!reponse.ok) throw new Error(`Impossible de charger ${cheminCsv} (HTTP ${reponse.status})`);
    const texte = await reponse.text();
    const resultat = Papa.parse(texte, { header: true, skipEmptyLines: true });
    return chargerBaseFromRows(resultat.data);
}

function chargerBaseFromText(texteCsv) {
    const resultat = Papa.parse(texteCsv, { header: true, skipEmptyLines: true });
    return chargerBaseFromRows(resultat.data);
}
