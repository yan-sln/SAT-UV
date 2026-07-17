const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { RACINE } = require("./harness");
const { parseCsv } = require("./csv_utils");
const { creerDomStub } = require("./dom_stub");

/**
 * Charge le script inline de index.html dans un contexte vm équipé du stub
 * DOM, avec les vraies données de input.csv, et exécute initialiser() comme
 * le ferait le navigateur — sans passer par fetch() ni par le rendu du
 * simulateur (mettreAJourSimulateur est stubbé : simulateur.js a sa propre
 * suite de tests dédiée, inutile de la refaire tourner ici).
 */
function chargerPage() {
    const { document, window, localStorage, navigator, URL, Blob, elementsById } = creerDomStub();
    const ctx = {
        document, window, localStorage, navigator, URL, Blob, console, setTimeout, clearTimeout,
        mettreAJourSimulateur: () => {},
    };
    vm.createContext(ctx);

    for (const f of ["model.js", "parser.js", "sat_model.js", "search.js"]) {
        vm.runInContext(fs.readFileSync(path.join(RACINE, f), "utf8"), ctx, { filename: f });
    }

    const html = fs.readFileSync(path.join(RACINE, "index.html"), "utf8");
    const script = html.match(/<script>([\s\S]*)<\/script>\s*<\/body>/);
    assert.ok(script, "le script inline de index.html doit être trouvable (balise <script>...</script> avant </body>)");
    vm.runInContext(script[1], ctx, { filename: "index.html (inline)" });

    const texteCsv = fs.readFileSync(path.join(RACINE, "input", "input.csv"), "utf8");
    const rows = parseCsv(texteCsv);
    const { enseignements, codesExclus } = vm.runInContext("chargerBaseFromRows", ctx)(rows);
    ctx._baseCargada = { enseignements, codesExclus };
    // `enseignements`/`codesExclus` sont des `let` de haut niveau à l'intérieur du
    // script inline : on ne peut pas les assigner depuis l'extérieur du contexte vm
    // (elles ne sont pas attachées à l'objet contexte), donc on exécute
    // l'assignation EN TANT QUE CODE DANS le contexte, comme le ferait le vrai
    // gestionnaire DOMContentLoaded du navigateur.
    vm.runInContext("enseignements = _baseCargada.enseignements; codesExclus = _baseCargada.codesExclus; initialiser();", ctx);
    // La marque HTML statique de la vraie page démarre en mode "principal"
    // (controlesRemplacement hidden). Le stub ne parse pas le HTML, donc on
    // rejoue explicitement cet état initial via la fonction qui le pilote.
    vm.runInContext('basculerMode("principal")', ctx);

    return {
        ctx,
        elementsById,
        obtenir: (nom) => vm.runInContext(nom, ctx),
        appeler: (nom, ...args) => vm.runInContext(nom, ctx)(...args),
    };
}

// Fixtures réelles (vérifiées contre input.csv) :
// AC01 (CS, 5 ECTS) et AC02 ont un Cours qui se chevauche directement (conflit
// immédiat, sans même construire de SAT) ; AC03 (TM) est indépendante des deux.
const CODE_A = "AC01";
const CODE_CONFLIT = "AC02";
const CODE_INDEPENDANT = "AC03";

test("chargement initial : base peuplée, badge neutre, ECTS à 0", () => {
    const p = chargerPage();
    assert.ok(p.obtenir("toutesCodes").length > 0);
    p.appeler("calculerEtAfficher"); // "-" / "0 ECTS" viennent du JS (calculerEtAfficherRemplacement), pas de la marque statique que le stub ne reproduit pas
    const badge = p.elementsById["resultatBadge"];
    const ectsBadge = p.elementsById["ectsBadge"];
    assert.equal(badge.textContent, "-");
    assert.equal(badge.className, "resultat-badge neutre");
    assert.equal(ectsBadge.textContent, "0 ECTS");
});

test("ajout côté principal : présent dans selection, chip rendue, badge SAT, ECTS à jour", () => {
    const p = chargerPage();
    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    assert.deepEqual(p.obtenir("selection"), [CODE_A]);

    // la chip doit apparaître dans la colonne CS (catégorie réelle de AC01)
    const colonneCS = p.elementsById["colonneCS"];
    assert.equal(colonneCS._children.length, 1, "une chip doit être présente dans la colonne CS");
    assert.ok(colonneCS._children[0].textContent.includes(CODE_A));

    p.appeler("calculerEtAfficher"); // court-circuite le debounce de 10ms pour un test synchrone
    const badge = p.elementsById["resultatBadge"];
    assert.equal(badge.textContent, "SAT");
    assert.equal(p.elementsById["ectsBadge"].textContent, "5 ECTS");
});

test("sélection principale insatisfaisable (Cours en conflit) : badge UNSAT avec message explicite", () => {
    const p = chargerPage();
    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    p.obtenir("controleurPrincipal").ajouter(CODE_CONFLIT);
    p.appeler("calculerEtAfficher");
    const badge = p.elementsById["resultatBadge"];
    assert.equal(badge.textContent, "UNSAT");
    assert.equal(badge.className, "resultat-badge unsat");
    assert.match(p.elementsById["detailMessage"].textContent, /Conflit entre le Cours/);
});

test("exclusion croisée : ajouter au principal une UV déjà en remplacement la retire du remplacement", () => {
    const p = chargerPage();
    p.obtenir("controleurRemplacement").ajouter(CODE_A);
    assert.deepEqual(p.obtenir("selectionRemplacement"), [CODE_A]);

    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    assert.deepEqual(p.obtenir("selection"), [CODE_A]);
    assert.deepEqual(p.obtenir("selectionRemplacement"), [], "doit avoir été retirée automatiquement du remplacement");
});

test("badge combiné : SAT en principal seul, UNSAT dès qu'un remplacement incompatible est testé", () => {
    const p = chargerPage();
    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    p.appeler("calculerEtAfficher");
    assert.equal(p.elementsById["resultatBadge"].textContent, "SAT", "principal seul doit être SAT");

    p.obtenir("controleurRemplacement").ajouter(CODE_CONFLIT);
    p.appeler("calculerEtAfficherRemplacement");
    assert.equal(p.elementsById["resultatBadge"].textContent, "UNSAT", "la combinaison principal + remplacement doit repasser UNSAT");

    // et la sélection/compteur ECTS du principal ne doivent pas bouger pour autant
    assert.deepEqual(p.obtenir("selection"), [CODE_A]);
    assert.equal(p.elementsById["ectsBadge"].textContent, "5 ECTS");
});

test("switch principal/remplacement : bascule l'affichage des contrôles et le fond de la carte", () => {
    const p = chargerPage();
    const controlesPrincipal = p.elementsById["controlesPrincipal"];
    const controlesRemplacement = p.elementsById["controlesRemplacement"];
    const carteSelection = p.elementsById["carteSelection"];
    const modePrincipalBtn = p.elementsById["modePrincipalBtn"];
    const modeRemplacementBtn = p.elementsById["modeRemplacementBtn"];

    assert.equal(controlesPrincipal.hidden, false);
    assert.equal(controlesRemplacement.hidden, true);
    assert.equal(carteSelection.classList.contains("mode-remplacement"), false);

    p.appeler("basculerMode", "remplacement");
    assert.equal(controlesPrincipal.hidden, true);
    assert.equal(controlesRemplacement.hidden, false);
    assert.equal(carteSelection.classList.contains("mode-remplacement"), true);
    assert.equal(modeRemplacementBtn.classList.contains("actif"), true);
    assert.equal(modePrincipalBtn.classList.contains("actif"), false);

    p.appeler("basculerMode", "principal");
    assert.equal(controlesPrincipal.hidden, false);
    assert.equal(controlesRemplacement.hidden, true);
    assert.equal(carteSelection.classList.contains("mode-remplacement"), false);
});

test("export : une seule sortie texte avec les deux sections, principale et remplacement", () => {
    const p = chargerPage();
    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    p.obtenir("controleurRemplacement").ajouter(CODE_INDEPENDANT);
    const texte = p.appeler("texteExportSelection");
    assert.match(texte, /=== Sélection principale ===/);
    assert.match(texte, /=== Sélection de remplacement ===/);
    assert.match(texte, new RegExp(CODE_A));
    assert.match(texte, new RegExp(CODE_INDEPENDANT));
    // AC01 est catégorie CS : doit apparaître sous "CS :" et pas sous "TM :"
    const indexCS = texte.indexOf("CS :");
    const indexAC01 = texte.indexOf(CODE_A);
    assert.ok(indexCS !== -1 && indexAC01 > indexCS);
});

test("localStorage : seule la sélection principale est persistée", () => {
    const p = chargerPage();
    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    p.obtenir("controleurRemplacement").ajouter(CODE_INDEPENDANT);
    const sauvegarde = JSON.parse(p.ctx.localStorage.getItem("sat-uv-selection-v1"));
    assert.deepEqual(sauvegarde, [CODE_A]);
});

test("retrait et 'tout supprimer' : la sélection principale peut être vidée sans toucher au remplacement", () => {
    const p = chargerPage();
    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    p.obtenir("controleurRemplacement").ajouter(CODE_INDEPENDANT);

    p.obtenir("controleurPrincipal").retirer(CODE_A);
    assert.deepEqual(p.obtenir("selection"), []);
    assert.deepEqual(p.obtenir("selectionRemplacement"), [CODE_INDEPENDANT], "le remplacement ne doit pas être affecté");

    const infoSelection = p.elementsById["infoSelection"];
    assert.equal(infoSelection.textContent, "Aucun enseignement sélectionné.");
});

test("suggestions grisées : une UV incompatible avec la sélection actuelle apparaît grisée dans le menu", () => {
    const p = chargerPage();
    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    p.appeler("calculerEtAfficher"); // court-circuite le debounce pour recalculer incompatiblesPrincipal

    const ajoutUv = p.elementsById["ajoutUv"];
    ajoutUv.value = "AC0"; // fait remonter AC02 (incompatible) et d'autres AC0x (compatibles) dans les suggestions
    ajoutUv.focus();
    p.obtenir("controleurPrincipal").rafraichir();

    const suggestionsEl = p.elementsById["suggestionsAjout"];
    const itemAC02 = suggestionsEl._children.find(el => el.textContent.startsWith(CODE_CONFLIT));
    assert.ok(itemAC02, "AC02 doit apparaître dans les suggestions (juste grisée, pas cachée)");
    assert.ok(itemAC02.classList.contains("suggestion-incompatible"), "AC02 doit porter la classe de grisage");

    const itemIndependant = suggestionsEl._children.find(el => el.textContent.startsWith(CODE_INDEPENDANT));
    assert.ok(itemIndependant, "AC03 doit aussi apparaître dans les suggestions");
    assert.ok(!itemIndependant.classList.contains("suggestion-incompatible"), "AC03 est compatible : pas de grisage");
});

test("suggestions grisées : le grisage se recalcule après un changement de sélection", () => {
    const p = chargerPage();
    const ajoutUv = p.elementsById["ajoutUv"];
    ajoutUv.value = "AC02";
    ajoutUv.focus();
    p.obtenir("controleurPrincipal").rafraichir();
    let suggestionsEl = p.elementsById["suggestionsAjout"];
    let itemAC02 = suggestionsEl._children.find(el => el.textContent.startsWith(CODE_CONFLIT));
    assert.ok(!itemAC02.classList.contains("suggestion-incompatible"), "rien de sélectionné encore : AC02 n'est pas grisée");

    p.obtenir("controleurPrincipal").ajouter(CODE_A);
    p.appeler("calculerEtAfficher");
    ajoutUv.focus();
    p.obtenir("controleurPrincipal").rafraichir();
    suggestionsEl = p.elementsById["suggestionsAjout"];
    itemAC02 = suggestionsEl._children.find(el => el.textContent.startsWith(CODE_CONFLIT));
    assert.ok(itemAC02.classList.contains("suggestion-incompatible"), "après ajout de AC01 : AC02 doit être grisée");
});

test("boutons copier/télécharger : désactivés seulement quand les DEUX listes sont vides", () => {
    const p = chargerPage();
    const btnCopier = p.elementsById["btnCopierSelection"];
    assert.equal(btnCopier.disabled, true, "rien sélectionné au départ : désactivé");

    p.obtenir("controleurRemplacement").ajouter(CODE_INDEPENDANT);
    assert.equal(btnCopier.disabled, false, "une UV en remplacement suffit à activer le bouton");

    p.obtenir("controleurRemplacement").retirer(CODE_INDEPENDANT);
    assert.equal(btnCopier.disabled, true, "retour à vide : désactivé à nouveau");
});
