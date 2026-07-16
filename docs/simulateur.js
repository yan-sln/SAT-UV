/**
 * simulateur.js
 *
 * Simulateur d'emploi du temps, généralisé à n'importe quelle sélection
 * valide (contrairement à une maquette figée sur des UV précises).
 *
 * Principe :
 * - Pour chaque UV sélectionnée, le Cours imposé (s'il existe) est fixe.
 * - Chaque activité à choix (TD, TP, Atelier, ou "Cours" quand il est lui
 *   même à choix comme MT02) devient un menu déroulant listant ses Groupe
 *   possibles.
 * - Un groupe qui n'a qu'une seule option, ou qui se retrouve réduit à une
 *   seule option compatible une fois les créneaux imposés/déjà fixés retirés
 *   (point fixe itératif), est affiché comme "fixe" plutôt que comme menu.
 * - Les conflits sont détectés avec les mêmes fonctions que le solveur SAT
 *   principal (groupeConflitAvec / groupesEnConflit / Creneau.chevauche),
 *   pour rester rigoureusement cohérent avec le reste de l'outil.
 *
 * Ce module suppose que model.js et sat_model.js sont déjà chargés (Creneau,
 * Groupe, Enseignement, groupeConflitAvec, groupesEnConflit) et que la
 * variable globale `enseignements` (définie dans index.html) est peuplée.
 */

const SIM_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const SIM_DAY_START = 8 * 60, SIM_DAY_END = 18 * 60 + 30;
const SIM_PX_PER_MIN = 0.72;
const SIM_SEUIL_ENUMERATION = 20000; // au-delà, on ne compte plus exactement (trop cher)

// Palette générée dynamiquement (nombre d'UV variable, contrairement à une palette figée).
function simCouleur(index, total) {
    const teinte = Math.round((index * 360) / Math.max(total, 1));
    return `hsl(${teinte}, 42%, 78%)`;
}

function simFmt(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h + ":" + (m === 0 ? "00" : String(m).padStart(2, "0"));
}

function simLibelleFrequence(semaine) {
    if (semaine === "A") return " (semaine A)";
    if (semaine === "B") return " (semaine B)";
    return "";
}

// --- État interne du simulateur ---
let simCodesActuels = null; // dernière clé de sélection construite (pour ne reconstruire qu'au besoin)
let simCouleurs = {};
let simCles = []; // toutes les clés "code|activite" (imposées ou à choix)
let simClesLibres = []; // clés encore à choix après réduction par point fixe
let simOptionsValides = {}; // clé -> Groupe[] restants
let simGroupeFixe = {}; // clé -> Groupe imposé de fait
let simCoursImposes = []; // Creneau[] toujours présents (Cours imposé de chaque UV)
let simCoursImposesParCode = {}; // code -> Creneau[] (un Cours imposé peut compter plusieurs séances)
let simBaseCoherente = true; // false si des éléments sans choix possible (Cours imposés
                              // et/ou groupes réduits à une seule option) se contredisent déjà entre eux

function simMelanger(tableau) {
    const copie = tableau.slice();
    for (let i = copie.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copie[i], copie[j]] = [copie[j], copie[i]];
    }
    return copie;
}

// Construit (ou reconstruit) l'état du simulateur pour un ensemble de codes.
function simConstruireEtat(codes) {
    simCouleurs = {};
    codes.forEach((code, i) => { simCouleurs[code] = simCouleur(i, codes.length); });

    simCles = [];
    simOptionsValides = {};
    simGroupeFixe = {};
    simCoursImposes = [];
    simCoursImposesParCode = {};

    for (const code of codes) {
        const e = enseignements[code];
        if (!e) continue;
        if (e.cours.length > 0) {
            simCoursImposesParCode[code] = e.cours; // un Cours imposé peut compter plusieurs séances (ex. 2×/semaine)
            simCoursImposes.push(...e.cours);
        }
        for (const [activite, groupes] of e.activitesAChoix()) {
            const cle = code + "|" + activite;
            simCles.push(cle);
            simOptionsValides[cle] = groupes.slice();
        }
    }

    // seed : toute clé avec une seule option brute est fixée d'emblée
    for (const cle of simCles) {
        if (simOptionsValides[cle].length === 1) simGroupeFixe[cle] = simOptionsValides[cle][0];
    }

    // point fixe : réduit les options en retirant celles qui entrent en
    // conflit avec le Cours imposé ou avec un groupe déjà fixé ; si une clé
    // se retrouve avec une seule option restante, elle devient fixe à son tour.
    let change = true;
    while (change) {
        change = false;
        const groupesFixes = Object.values(simGroupeFixe);
        for (const cle of simCles) {
            if (simGroupeFixe[cle]) continue;
            const restant = simOptionsValides[cle].filter(option => {
                if (groupeConflitAvec(option, simCoursImposes)) return false;
                for (const g of groupesFixes) {
                    if (g.cle !== option.cle && groupesEnConflit(option, g)) return false;
                }
                return true;
            });
            simOptionsValides[cle] = restant;
            if (restant.length === 1 && !simGroupeFixe[cle]) {
                simGroupeFixe[cle] = restant[0];
                change = true;
            }
        }
    }

    // Validation finale : deux éléments "sans choix possible" (un Cours
    // imposé, ou un groupe réduit à une seule option — que ce soit d'emblée
    // ou après réduction) peuvent malgré tout se contredire entre eux, car
    // rien ne les confronte l'un à l'autre pendant la construction ci-dessus
    // (un groupe fixé d'emblée, par exemple, n'est jamais vérifié contre un
    // autre groupe fixé d'emblée). On revérifie donc TOUT l'ensemble figé
    // (Cours imposés + groupes forcés) par paires, une fois le point fixe
    // stabilisé. En usage normal ça n'arrive pas (le simulateur ne s'active
    // que sur une sélection déjà validée SAT côté bloc 1), mais on le
    // vérifie quand même pour rester correct dans tous les cas.
    simBaseCoherente = true;
    const groupesFixesFinal = Object.values(simGroupeFixe);
    for (let i = 0; i < simCoursImposes.length && simBaseCoherente; i++) {
        for (let j = i + 1; j < simCoursImposes.length; j++) {
            if (simCoursImposes[i].chevauche(simCoursImposes[j])) { simBaseCoherente = false; break; }
        }
    }
    for (let i = 0; i < groupesFixesFinal.length && simBaseCoherente; i++) {
        if (groupeConflitAvec(groupesFixesFinal[i], simCoursImposes)) { simBaseCoherente = false; break; }
        for (let j = i + 1; j < groupesFixesFinal.length; j++) {
            if (groupesEnConflit(groupesFixesFinal[i], groupesFixesFinal[j])) { simBaseCoherente = false; break; }
        }
    }

    simClesLibres = simCles.filter(cle => !simGroupeFixe[cle]);
}

// Recherche une assignation valide (backtracking, avec option d'ordre aléatoire),
// en s'appuyant sur les mêmes fonctions de conflit que le solveur SAT principal.
function simTrouverAssignation(aleatoire) {
    if (!simBaseCoherente) return null;
    const choisis = [];
    function backtrack(i) {
        if (i === simClesLibres.length) return true;
        const cle = simClesLibres[i];
        let options = simOptionsValides[cle];
        if (aleatoire) options = simMelanger(options);
        for (const option of options) {
            if (groupeConflitAvec(option, simCoursImposes)) continue;
            let conflit = false;
            for (const autre of choisis) {
                if (groupesEnConflit(option, autre)) { conflit = true; break; }
            }
            if (conflit) continue;
            choisis.push(option);
            if (backtrack(i + 1)) return true;
            choisis.pop();
        }
        return false;
    }
    return backtrack(0) ? choisis : null;
}

function simIdSelect(cle) {
    return "sim-sel-" + cle.replace(/[^a-zA-Z0-9]/g, "-");
}

function simConstruireControles(conteneur) {
    conteneur.innerHTML = "";
    const codes = Object.keys(simCoursImposesParCode).concat(
        simCles.map(c => c.split("|")[0])
    );
    const codesUniques = Array.from(new Set(codes)).sort();

    for (const code of codesUniques) {
        const bloc = document.createElement("div");
        bloc.className = "sim-uv-bloc";
        let html = `<div class="sim-uv-titre"><span class="sim-dot" style="background:${simCouleurs[code]}"></span>${code}</div>`;

        if (simCoursImposesParCode[code]) {
            const texte = simCoursImposesParCode[code]
                .map(c => `${c.jour} ${simFmt(c.debut)}-${simFmt(c.fin)}${simLibelleFrequence(c.semaine)}`)
                .join(" + ");
            html += `<div class="sim-champ"><label>Cours<span class="sim-tag-fixe">fixe</span></label>`
                + `<div class="sim-info-fixe">${texte}</div></div>`;
        }

        const clesDuCode = simCles.filter(cle => cle.startsWith(code + "|"));
        for (const cle of clesDuCode) {
            const activite = cle.split("|")[1];
            if (simGroupeFixe[cle]) {
                const g = simGroupeFixe[cle];
                const texte = g.creneaux.map(c => `${c.jour} ${simFmt(c.debut)}-${simFmt(c.fin)}${simLibelleFrequence(c.semaine)}`).join(" + ");
                html += `<div class="sim-champ"><label>${activite}<span class="sim-tag-fixe">fixe</span></label>`
                    + `<div class="sim-info-fixe">${texte}</div></div>`;
            } else {
                html += `<div class="sim-champ"><label>${activite}</label><select id="${simIdSelect(cle)}">`;
                simOptionsValides[cle].forEach((g, i) => {
                    const texte = g.creneaux.map(c => `${c.jour} ${simFmt(c.debut)}-${simFmt(c.fin)}${simLibelleFrequence(c.semaine)}`).join(" + ");
                    html += `<option value="${i}">${texte}${g.lib ? " · groupe " + g.lib : ""}</option>`;
                });
                html += `</select></div>`;
            }
        }
        bloc.innerHTML = html;
        conteneur.appendChild(bloc);
    }

    const boutons = document.createElement("div");
    boutons.className = "sim-boutons";
    boutons.innerHTML = `<button type="button" id="simBoutonAleatoire">Combinaison aléatoire valide</button>`;
    conteneur.appendChild(boutons);

    document.getElementById("simBoutonAleatoire").addEventListener("click", () => {
        const assignation = simTrouverAssignation(true);
        if (!assignation) return; // ne devrait pas arriver : la sélection est garantie SAT
        simClesLibres.forEach((cle, i) => {
            const groupe = assignation[i];
            const options = simOptionsValides[cle];
            const idx = options.indexOf(groupe);
            const select = document.getElementById(simIdSelect(cle));
            if (select && idx >= 0) select.value = idx;
        });
        simRendre();
    });

    for (const cle of simClesLibres) {
        const select = document.getElementById(simIdSelect(cle));
        if (select) select.addEventListener("change", simRendre);
    }
}

function simConstruireSquelette(conteneur) {
    conteneur.innerHTML = "";
    conteneur.style.gridTemplateColumns = `52px repeat(${SIM_DAYS.length}, 1fr)`;
    conteneur.style.gridTemplateRows = `28px ${(SIM_DAY_END - SIM_DAY_START) * SIM_PX_PER_MIN}px`;
    conteneur.appendChild(document.createElement("div")); // coin vide
    for (const jour of SIM_DAYS) {
        const entete = document.createElement("div");
        entete.className = "sim-cal-entete";
        entete.textContent = jour;
        conteneur.appendChild(entete);
    }
    const colHeures = document.createElement("div");
    colHeures.className = "sim-col-heures";
    colHeures.style.height = (SIM_DAY_END - SIM_DAY_START) * SIM_PX_PER_MIN + "px";
    for (let h = 8; h <= 18; h++) {
        const lbl = document.createElement("div");
        lbl.className = "sim-heure-label";
        lbl.style.top = (h * 60 - SIM_DAY_START) * SIM_PX_PER_MIN + "px";
        lbl.textContent = h + ":00";
        colHeures.appendChild(lbl);
    }
    conteneur.appendChild(colHeures);
    for (let j = 0; j < SIM_DAYS.length; j++) {
        const col = document.createElement("div");
        col.className = "sim-col-jour";
        col.style.height = (SIM_DAY_END - SIM_DAY_START) * SIM_PX_PER_MIN + "px";
        for (let h = 8; h <= 18; h++) {
            const ligne = document.createElement("div");
            ligne.className = "sim-ligne-heure";
            ligne.style.top = (h * 60 - SIM_DAY_START) * SIM_PX_PER_MIN + "px";
            col.appendChild(ligne);
        }
        conteneur.appendChild(col);
    }
}

function simSelectionCourante() {
    // { code, activite, creneau, groupe|null, fixe: bool }[]
    const choisis = [];
    for (const [code, creneaux] of Object.entries(simCoursImposesParCode)) {
        for (const creneau of creneaux) {
            choisis.push({ code, activite: "Cours", creneau, fixe: true });
        }
    }
    for (const cle of simCles) {
        const [code, activite] = cle.split("|");
        const groupe = simGroupeFixe[cle] || (() => {
            const select = document.getElementById(simIdSelect(cle));
            if (!select) return null;
            return simOptionsValides[cle][parseInt(select.value, 10)];
        })();
        if (!groupe) continue;
        for (const creneau of groupe.creneaux) {
            choisis.push({ code, activite, creneau, fixe: Boolean(simGroupeFixe[cle]) });
        }
    }
    return choisis;
}

function simRendre() {
    const calEl = document.getElementById("simCal");
    if (!calEl) return;
    const choisis = simSelectionCourante();
    Array.from(calEl.querySelectorAll(".sim-col-jour")).forEach(c => {
        c.querySelectorAll(".sim-creneau").forEach(n => n.remove());
    });

    const conflits = [];
    for (let i = 0; i < choisis.length; i++) {
        for (let j = i + 1; j < choisis.length; j++) {
            if (choisis[i].creneau.chevauche(choisis[j].creneau)) conflits.push([choisis[i], choisis[j]]);
        }
    }
    const enConflit = new Set();
    conflits.forEach(([a, b]) => { enConflit.add(a); enConflit.add(b); });

    const colonnesJour = Array.from(calEl.querySelectorAll(".sim-col-jour"));
    choisis.forEach(item => {
        const idxJour = SIM_DAYS.indexOf(item.creneau.jour);
        if (idxJour < 0) return;
        const col = colonnesJour[idxJour];
        const div = document.createElement("div");
        div.className = "sim-creneau"
            + (item.creneau.semaine ? " sim-quinzaine" : "")
            + (enConflit.has(item) ? " sim-conflit" : "")
            + (item.fixe ? " sim-fixe" : "");
        div.style.top = (item.creneau.debut - SIM_DAY_START) * SIM_PX_PER_MIN + "px";
        div.style.height = Math.max((item.creneau.fin - item.creneau.debut) * SIM_PX_PER_MIN - 2, 16) + "px";
        div.style.background = simCouleurs[item.code];
        div.innerHTML = `<div class="sim-creneau-titre">${item.code} · ${item.activite}</div>`
            + `<div class="sim-creneau-detail">${simFmt(item.creneau.debut)}-${simFmt(item.creneau.fin)}${simLibelleFrequence(item.creneau.semaine)}</div>`;
        col.appendChild(div);
    });

    const statusBox = document.getElementById("simStatus");
    if (conflits.length === 0) {
        statusBox.innerHTML = `<div class="sim-statut sim-statut-ok">✓ Emploi du temps valide — aucun conflit.</div>`;
    } else {
        const liste = conflits.map(([a, b]) =>
            `<li>${a.code} (${a.activite}, ${a.creneau.jour} ${simFmt(a.creneau.debut)}-${simFmt(a.creneau.fin)}) chevauche ${b.code} (${b.activite}, ${b.creneau.jour} ${simFmt(b.creneau.debut)}-${simFmt(b.creneau.fin)})</li>`
        ).join("");
        statusBox.innerHTML = `<div class="sim-statut sim-statut-bad">✗ ${conflits.length} conflit(s) détecté(s)</div><ul class="sim-liste-conflits">${liste}</ul>`;
    }

    const codesTries = Array.from(new Set(simCles.map(c => c.split("|")[0]).concat(Object.keys(simCoursImposesParCode)))).sort();
    document.getElementById("simLegende").innerHTML = codesTries.map(code =>
        `<span><span class="sim-dot" style="background:${simCouleurs[code]}"></span>${code}</span>`
    ).join("") + `<span>▨ = créneau une semaine sur deux</span><span>bordure continue = créneau fixe</span><span>bordure pointillée = créneau modifiable</span>`;
}

function simMettreAJourCompteur() {
    const compteurEl = document.getElementById("simCompteur");
    if (!compteurEl) return;
    if (!simBaseCoherente) {
        compteurEl.textContent = "0 emploi du temps valide possible (des créneaux sans choix possible se contredisent entre eux).";
        return;
    }
    let taille = 1;
    let tropGrand = false;
    for (const cle of simClesLibres) {
        taille *= simOptionsValides[cle].length;
        if (taille > SIM_SEUIL_ENUMERATION) { tropGrand = true; break; }
    }
    if (simClesLibres.length === 0) {
        compteurEl.textContent = "Un seul emploi du temps possible avec cette sélection (tout est fixe).";
        return;
    }
    if (tropGrand) {
        compteurEl.textContent = "Plus de 20 000 combinaisons possibles avec cette sélection — trop nombreuses pour être comptées exactement, mais vous pouvez en explorer une au hasard.";
        return;
    }
    // dénombrement exact par backtracking (avec vérification de conflit à chaque étape)
    let compte = 0;
    const pile = [];
    function backtrackCompte(i) {
        if (i === simClesLibres.length) { compte++; return; }
        const cle = simClesLibres[i];
        for (const option of simOptionsValides[cle]) {
            if (groupeConflitAvec(option, simCoursImposes)) continue;
            let conflit = false;
            for (const autre of pile) {
                if (groupesEnConflit(option, autre)) { conflit = true; break; }
            }
            if (conflit) continue;
            pile.push(option);
            backtrackCompte(i + 1);
            pile.pop();
        }
    }
    backtrackCompte(0);
    compteurEl.textContent = `${compte} emploi(s) du temps valide(s) possible(s) avec cette sélection.`;
}

// Point d'entrée appelé depuis index.html à chaque recalcul de la sélection principale.
function mettreAJourSimulateur(codes, satisfiable) {
    const conteneur = document.getElementById("simulateurContenu");
    if (!conteneur) return;

    if (!codes || codes.length === 0) {
        simCodesActuels = null;
        conteneur.innerHTML = `<p class="aide">Sélectionnez au moins un enseignement compatible dans le bloc 1 pour activer le simulateur.</p>`;
        return;
    }
    if (!satisfiable) {
        simCodesActuels = null;
        conteneur.innerHTML = `<p class="aide">Votre sélection actuelle est UNSAT (bloc 1) : corrigez-la d'abord pour activer le simulateur.</p>`;
        return;
    }

    const cle = codes.slice().sort().join(",");
    if (cle === simCodesActuels) return; // sélection inchangée : ne rien reconstruire (garde les choix de l'utilisateur·ice)
    simCodesActuels = cle;

    conteneur.innerHTML = `
        <div class="sim-layout">
            <div class="sim-controles" id="simControles"></div>
            <div class="sim-grille-conteneur">
                <div class="sim-compteur" id="simCompteur"></div>
                <div class="sim-cal" id="simCal"></div>
                <div class="sim-legende" id="simLegende"></div>
                <div id="simStatus"></div>
            </div>
        </div>`;

    simConstruireEtat(codes);
    simConstruireControles(document.getElementById("simControles"));
    simConstruireSquelette(document.getElementById("simCal"));
    simMettreAJourCompteur();
    simRendre();
}
