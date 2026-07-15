/**
 * parser.js
 *
 * Construction de la base de faits en mémoire à partir des lignes CSV
 * (déjà parsées par PapaParse côté navigateur, avec header: true, ce qui
 * reproduit csv.DictReader de Python).
 *
 * Particularités gérées :
 * 1. Un "groupe" (TD/TP/Atelier/Activités annexes/...) peut être constitué
 *    de PLUSIEURS créneaux partageant le même (Code, Activité, Lib. créneau).
 *    On agrège donc toutes les lignes correspondantes. Toute activité autre
 *    que "Cours" est traitée comme une activité à choix (une seule à
 *    sélectionner), qu'il s'agisse de TD, TP, Atelier ou d'un futur type
 *    d'activité (ex. "Activités annexes") : on ne maintient plus de liste
 *    figée d'activités reconnues, pour ne jamais en ignorer silencieusement.
 * 2. Certains enseignements proposent PLUSIEURS créneaux de Cours distincts
 *    (ex. MT02, MT03) : plusieurs séances au choix, une seule à suivre.
 *    Dans ce cas, le Cours n'est plus un créneau imposé mais une activité à
 *    choix comme les autres (une "Groupe" par créneau alternatif). Quand un
 *    seul créneau de Cours existe (cas standard), il reste imposé.
 */

function parseHeure(hhmm) {
    const [heures, minutes] = hhmm.split(":");
    return parseInt(heures, 10) * 60 + parseInt(minutes, 10);
}

function cleCreneau(l) {
    return `${l["Jour"]}|${l["Heure début"]}|${l["Heure fin"]}|${l["Semaine"]}`;
}

/**
 * Colonne "Spécialité" : liste de branches séparées par des virgules
 * (ex. "GB, GP, GU, IM, TC"), ou vide si non précisé.
 */
function parseBranches(specialiteBrute) {
    if (!specialiteBrute) return [];
    return specialiteBrute.split(",").map(s => s.trim()).filter(Boolean);
}

/**
 * Colonne "Diplomante" : soit une valeur globale ("Oui" / "Non" / vide),
 * soit un détail par branche ("GB: Oui, GP: Oui, ..., TC: Non") quand le
 * statut diffère selon la branche (ex. UV de branche ouverte au tronc
 * commun mais non diplomante pour celui-ci).
 * Retourne null (inconnu), un booléen, ou un objet { brancheEnMinuscules: booléen }.
 */
function parseDiplomante(diplomanteBrute) {
    const texte = (diplomanteBrute || "").trim();
    if (texte === "") return null;
    if (texte === "Oui") return true;
    if (texte === "Non") return false;
    const parBranche = {};
    for (const partie of texte.split(",")) {
        const [brancheBrute, valeurBrute] = partie.split(":");
        if (brancheBrute === undefined || valeurBrute === undefined) continue;
        parBranche[brancheBrute.trim().toLowerCase()] = valeurBrute.trim() === "Oui";
    }
    return Object.keys(parBranche).length > 0 ? parBranche : null;
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
        const groupesParActivite = {};

        // --- Cours : imposé s'il n'y a qu'un seul créneau, à choix sinon ---
        const lignesCours = lignes.filter(l => l["Activité"] === "Cours");
        const coursUniques = [];
        const clesVues = new Set();
        for (const l of lignesCours) {
            const cle = cleCreneau(l);
            if (clesVues.has(cle)) continue; // dédoublonne les lignes strictement identiques
            clesVues.add(cle);
            coursUniques.push(l);
        }

        let cours = [];
        if (coursUniques.length <= 1) {
            cours = coursUniques.map(l => new Creneau(l["Jour"], parseHeure(l["Heure début"]), parseHeure(l["Heure fin"]), l["Semaine"]));
        } else {
            groupesParActivite["Cours"] = {};
            coursUniques.forEach((l, i) => {
                const libSynthetique = `C${i + 1}`;
                const groupe = new Groupe(code, "Cours", libSynthetique);
                groupe.creneaux.push(new Creneau(l["Jour"], parseHeure(l["Heure début"]), parseHeure(l["Heure fin"]), l["Semaine"]));
                groupesParActivite["Cours"][libSynthetique] = groupe;
            });
        }

        // --- Toute autre activité (TD, TP, Atelier, Activités annexes, ...) : à choix ---
        for (const l of lignes) {
            const activite = l["Activité"];
            if (activite === "Cours") continue;
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
        const branches = parseBranches(lignes[0]["Spécialité"]);
        const diplomante = parseDiplomante(lignes[0]["Diplomante"]);
        enseignements[code] = new Enseignement(code, cours, groupes, categorie, ects, branches, diplomante);
    }
    codesExclus.sort();
    return { enseignements, codesExclus };
}

async function chargerBase(cheminCsv) {
    // anti-cache : le CSV peut changer sans que le nom de fichier change,
    // contrairement aux scripts JS versionnés via ?v=. On force donc une
    // requête fraîche à chaque chargement (navigateur ET éventuel CDN).
    const separateur = cheminCsv.includes("?") ? "&" : "?";
    const url = `${cheminCsv}${separateur}t=${Date.now()}`;
    const reponse = await fetch(url, { cache: "no-store" });
    if (!reponse.ok) throw new Error(`Impossible de charger ${cheminCsv} (HTTP ${reponse.status})`);
    const texte = await reponse.text();
    const resultat = Papa.parse(texte, { header: true, skipEmptyLines: true });
    return chargerBaseFromRows(resultat.data);
}

function chargerBaseFromText(texteCsv) {
    const resultat = Papa.parse(texteCsv, { header: true, skipEmptyLines: true });
    return chargerBaseFromRows(resultat.data);
}
