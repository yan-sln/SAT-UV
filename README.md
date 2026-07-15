# SAT-UV

23h09, la France a perdu contre l'Espagne. En ces temps très durs, on vous propose avec @DamDeCaro, un outil de vérification de compatibilité d'emploi du temps pour le choix des UVs à l'UTC. En gros c'est IA02 appliqué à un fléau de l'UTC : le calcul de satisfiabilité est fait 100 % côté navigateur, via un mini-solveur SAT écrit en JavaScript.

**Direct à l'outil : [https://yan-sln.github.io/SAT-UV/](https://yan-sln.github.io/SAT-UV/)**

**Outil analogue de la DSI : [https://webapplis.utc.fr/smeappli/testuvsetu/index.xhtml](https://webapplis.utc.fr/smeappli/testuvsetu/index.xhtml)**

## Sommaire

- [Construction de UV_automne.csv](#construction-de-uv_automnecsv-nom-pas-ouf-mais-comme-le-match)
- [Construction de input.csv](#construction-de-inputcsv)
- [Utilisation](#utilisation)
- [Base de faits](#base-de-faits-ia02)
- [Modèle SAT](#modèle-sat)
- [Simulateur d'emploi du temps](#simulateur-demploi-du-temps)
- [Choix de conception](#choix-de-conception)
- [Tests](#tests)
- [Développement](#développement-pour-nos-gi)

## Construction de UV_automne.csv (nom pas ouf, mais comme le match)

Récupération de la liste des UVs disponibles à l'automne sur le catalogue des UV de 2021 disponible sur l'ENT UTC (ouep, on a que ça).

    https://www.utc.fr/sdm_downloads/catalogue-des-unites-de-valeur-uv/

> edit on nous a transmis dans l'oreillette que ce document existait pour 2026-2027, on a donc pu récupérer les infos qu'il nous manquait. Voici donc ce magnifique lien : https://www.utc.fr/wp-content/uploads/sites/28/2026/06/guideuv2026-27.pdf et le lien vers la page ou il est (censé être) actualisé chaque année : https://www.utc.fr/documentation/


Classement dans un tableur en fonction de leur type (CS, TM ou TSH), avec pour chacune les ECTS correspondants et à leur descriptif (tableau p.5 à 37).

**Limite connue : edhec, master, UV internationales** Certaines UV pour lesquelles nous avions des créneaux horaires pour A26 n'étaient pas présentes dans le catalogue des UVs. Il a fallu croiser les données que nous avions avec une plateforme moodle de l'UTC (https://moodle.utc.fr/course/index.php?categoryid=10). 
Même avec ces informations là, certaines UV restent sans catégorie (CS, TM, TSH) et sans information quant aux crédits qu'elle apportent. Elles seront affichées par défaut peut importe le filtre que vous mettez sur le type d'UV. 
Une nouvelle mise à jour manuelle au cas par cas réduirait ce nombre... mais là on compte sur vous !

## Construction de input.csv

Récupération de l'emploi du temps provisoire pour A26 sur l'ENT UTC

    https://ngapplis.utc.fr/ent4/

et le document pdf "Creneaux-UV-A26-prov-V2.pdf"

Contient l'ensemble des UV enseignées en A26 avec les créneaux (semaine, jour et heure) de chaque "Activité" (Cours, TD, TP, Atelier), puis traitement via `input/input.py`.

`input.py` produit 9 colonnes : `Code enseig.`, `Activité`, `Jour`, `Heure début`, `Heure fin`, `Semaine`, `Lib. créneau`, `Type UV`, `ECTS`. Deux colonnes supplémentaires, `Spécialité` (branches concernées : TC, GB, GP, GU, IM, GI, Master, edhec) et `Diplomante` (statut diplomante, éventuellement différent par branche), sont ajoutées séparément à `input.csv` et ne sont pas produites par `input.py` - le site les lit si elles sont présentes, mais n'en a pas besoin pour fonctionner.

**Point de vigilance appris à la dure :** la colonne `Lib. créneau` doit impérativement contenir un identifiant **unique par séance** (ex. `1`, `2`, `3`...) pour une même UV/activité. Si plusieurs séances alternatives distinctes se retrouvent avec le même libellé générique (ex. toutes en `D`), l'outil les interprète comme **un seul groupe qui aurait lieu à tous ces horaires en même temps** - ce qui rend à tort la quasi-totalité des combinaisons UNSAT. Un test de non-régression (`tests/regression.test.js`) vérifie automatiquement qu'aucun groupe ne fusionne anormalement plus de 3 séances, pour attraper ce défaut avant qu'il n'arrive en prod.

## Utilisation

1. **Chargement automatique** de `input.csv` au démarrage de la page (nombre d'UVs chargées et UVs exclues affichés en haut). Le chargement force une requête fraîche à chaque visite (pas de mise en cache navigateur) pour toujours refléter la dernière version du fichier.
2. **Ajouter des UV** : dans le bloc "1. Sélectionner des enseignements", taper un code dans le champ d'autocomplétion et valider avec "Entrée" ou un clic sur une suggestion. Un jeu de filtres à boutons (**Catégorie**, **Spécialités**, **Diplomante**, **Apprenti**) affine la liste :
   - *Catégorie* (CS / TM / TSH / Toutes) - un choix à la fois ; les UV sans catégorie apparaissent dans les résultats de CS, TM **et** TSH, quel que soit celui choisi.
   - *Spécialités* - plusieurs options cochables en même temps (TC, GB, GI, GP, GU, IM, Master, edhec).
   - *Diplomante* (Toutes / Diplomante / Non diplomante) - le statut est calculé pour la ou les branches cochées (une UV peut être diplomante pour une branche et pas pour une autre, ex. une UV de branche ouverte au tronc commun).
   - *Apprenti* (Toutes / Apprenti / Non apprenti) - reconnaît les codes commençant par `AC`, `AI`, `AM`, `LH` ou `SH`.
3. Chaque UV ajoutée apparaît sous forme de bloc ("chip") dans le tableau à 3 colonnes CS / TM / TSH ; une croix permet de la retirer, et **le codnom de l'UV lui-même est un lien cliquable** vers sa fiche sur [uvweb](https://assos.utc.fr/uvweb/web/uv/) (nouvel onglet).
4. Le badge **SAT / UNSAT** et le compteur **ECTS** se mettent à jour automatiquement à chaque ajout/retrait. Ce badge reflète la sélection principale seule tant qu'aucun remplacement n'est testé, et la combinaison principal + remplacement dès que vous en ajoutez un (voir point suivant).
5. **Switch principal / remplacement** : un bouton à bascule permet de faire pointer les mêmes champs de recherche et de filtres vers "Sélection principale" ou "Sélection de remplacement" (le fond de la carte passe en gris très clair en mode remplacement, pour bien signaler le changement de contexte). Les filtres restent identiques quel que soit le mode actif. Le tableau de sélection est divisé en deux parties toujours visibles : la sélection principale en haut, la sélection de remplacement en bas.
6. Les listes **"Tous les enseignements compatibles/incompatibles"** avec la sélection principale se recalculent en direct, affichées côte à côte.
7. **Simulateur d'emploi du temps ("quel énorme banger", vous vous dites sûrement)** : à partir de la sélection principale validée (SAT), génère les menus déroulants pour chaque activité à choix (TD/TP/Atelier/Cours à choix), verrouille automatiquement celles qui n'ont qu'une option viable, affiche une grille hebdomadaire avec détection de conflit en direct, un bouton "combinaison aléatoire valide", et un compteur du nombre total d'emplois du temps possibles.
8. La sélection complète (principale **et** remplacement) peut être **copiée** ou **téléchargée** (`.txt`, en une seule fois, dans un même document avec les deux sections bien séparées) ou **vidée** (« Tout supprimer », pour la sélection principale). La sélection principale est aussi conservée automatiquement dans le navigateur (`localStorage`) d'une visite à l'autre.
9. Et les pages officielles de l'UTC dans tout ça? : un vers le **catalogue officiel des UV de l'UTC** en haut de page, un vers le **site d'inscription aux UV de l'UTC** sous le simulateur d'emploi du temps.

## Base de faits (#IA02)

La base de faits est construite par `parser.js` à partir des lignes de `input.csv` (regroupées par `Code enseig.`, comme `csv.DictReader` en Python), puis représentée avec les structures de `model.js` :

- **`Creneau`** : un horaire précis (`jour`, `debut`, `fin` en minutes depuis minuit, `semaine` : `""`, `"A"` ou `"B"`). Sa méthode `chevauche()` teste le recouvrement horaire et la compatibilité de semaine (deux créneaux sur des semaines `A`/`B` différentes ne se chevauchent jamais).
- **`Groupe`** : un choix possible pour une activité à choix (ex. `TD1`, `TP2`, `Atelier3`). Un groupe peut être réparti sur **plusieurs créneaux** (ex. un TD qui a lieu le lundi ET le mardi certaines semaines) : toutes les lignes CSV correspondant au même `(Code, Activité, Lib. créneau)` sont agrégées dans le même `Groupe`.
- **`Enseignement`** : un code d'UV, avec ses `cours` (créneaux **imposés**, `Activité = "Cours"`), ses `groupes` (`{ "TD": [...], "TP": [...], "Atelier": [...] }`, les activités **à choisir**), sa `categorie` (colonne `Type UV` : `CS`, `TM`, `TSH` ou vide), ses `ects`, ses `branches` (colonne `Spécialité`) et son statut `diplomante` (colonne `Diplomante`, global ou détaillé par branche).

Particularité gérée par `parser.js` : certains enseignements ont un Cours réparti sur **plusieurs** `Lib. créneau` distincts (deux horaires de cours alternatifs pour le même code, ex. MT02, MT03). Dans ce cas, le Cours n'est plus un créneau imposé : il devient lui-même une **activité à choix**, avec un "Groupe" synthétique par créneau alternatif (`C1`, `C2`, ...). Quand un seul créneau de Cours existe (cas standard), il reste imposé. Aucun enseignement n'est donc exclu de la base pour ce motif.

## Modèle SAT

`sat_model.js` transforme un ensemble de codes d'UV sélectionnés en un problème SAT sous forme normale conjonctive (CNF), résolu par un DPLL écrit à la main.

**Variables.** Une variable booléenne par `Groupe` (TD/TP/Atelier/Cours à choix) présent dans les UV sélectionnées : vraie si ce groupe est choisi pour composer l'emploi du temps.

**Clauses :**

1. *Exactement un groupe par activité à choix* - pour chaque UV et chaque activité à choix : une clause « au moins un » des groupes (disjonction), et une clause « au plus un » pour chaque paire de groupes (`¬v1 ∨ ¬v2`).
2. *Conflit Cours ↔ Cours* - vérifié **en amont**, avant même de construire le SAT : les Cours imposés n'ont pas de variable, donc si deux Cours imposés sélectionnés se chevauchent, l'ensemble est directement déclaré insatisfiable avec un message explicite (aucun groupe ne pourrait résoudre ce conflit).
3. *Conflit Cours ↔ Groupe* - clause unitaire interdisant un groupe (`¬v`) si l'un de ses créneaux chevauche un Cours imposé de la sélection.
4. *Conflit Groupe ↔ Groupe* - clause interdisant la paire (`¬v1 ∨ ¬v2`) si deux groupes ont des créneaux qui se chevauchent.

**Résolution.** Un DPLL classique (`dpll` / `propagerUnitaires` / `simplifier`) : propagation unitaire puis branchement sur la première variable restante, jusqu'à trouver une affectation satisfaisante ou épuiser les possibilités. `null` signifie UNSAT.

`search.js` orchestre l'ensemble pour l'UI : `testeEnsemble()` construit et résout le problème pour une sélection donnée, `calculerCompatibilites()` teste, pour chaque UV restante, si elle reste satisfiable en l'ajoutant à la sélection courante (une résolution SAT complète par UV testée).

## Simulateur d'emploi du temps

`simulateur.js` réutilise directement le même modèle (`Enseignement` / `Groupe` / `Creneau`) et les mêmes fonctions de détection de conflit que `sat_model.js` (`groupeConflitAvec`, `groupesEnConflit`), pour rester cohérent avec le solveur principal - ce n'est pas une logique dupliquée et divergente.

Principe : pour chaque UV de la sélection principale (déjà validée SAT), un menu déroulant est proposé par activité à choix. Un algorithme de **point fixe** réduit itérativement les options en retirant celles qui entrent en conflit avec un Cours imposé ou avec un groupe déjà réduit à une seule option ailleurs ; toute activité qui n'a plus qu'une option viable est affichée en lecture seule ("fixe", bordure continue) plutôt qu'en menu déroulant (bordure pointillée pour les groupes encore modifiables). Un bouton "combinaison aléatoire valide" utilise un petit backtracking (mêmes fonctions de conflit) pour proposer une affectation garantie sans conflit ; un compteur dénombre exactement le nombre total de combinaisons valides tant qu'il reste raisonnable (< 20 000), sinon l'affiche comme "trop nombreuses pour être comptées" plutôt que de figer le navigateur.

**Important :** les horaires du simulateur restent provisoires (susceptibles d'être modifiés par l'administration de l'UTC) et le résultat final dépend aussi des autres étudiant·es et du nombre de places par TD/TP - un bandeau le rappelle au-dessus de la grille.

## Choix de conception

- **100 % côté navigateur, pas de backend.** Hébergement gratuit sur GitHub Pages, aucune donnée d'emploi du temps envoyée à un serveur, déploiement simple (un dépôt Git suffit) = utilisable direct par vous.
- **DPLL écrit à la main plutôt qu'une librairie SAT externe.** Le problème reste petit (quelques dizaines de variables par recherche), inutile d'ajouter une dépendance ; le code reste simple à lire, auditer et déboguer (ouais c'est faux, mais personne va lire).
- **Simulateur généraliste plutôt que codé en dur.** Il opère directement sur `enseignements[code].cours`/`.groupes`, donc fonctionne pour n'importe quelle sélection valide sans code spécifique par UV.
- **Filtres partagés entre sélection principale et remplacement.** Un seul jeu de boutons (Catégorie/Spécialités/Diplomante/Apprenti) piloté par un switch, plutôt que deux jeux dupliqués à synchroniser manuellement.
- **Découpage modulaire** (`model.js` / `parser.js` / `sat_model.js` / `search.js` / `simulateur.js` / `index.html`) : séparation claire entre structures de données, construction de la base de faits, solveur, orchestration UI et simulateur, pour faciliter la relecture et l'évolution du code.
- **Catégorie lue directement depuis la colonne `Type UV`** de `input.csv` (répétée sur toutes les lignes d'un même code, comme `Code enseig.`). Les UV sans catégorie renseignée sont provisoirement rattachées à la colonne **TSH** dans le tableau de sélection (mention « sans catégorie » sur leur chip), mais apparaissent dans les résultats des **trois** filtres CS/TM/TSH (elles ne sont pas cachées faute de catégorie), faute de catalogue à jour (voir plus haut).
- **Vérification automatique, sans bouton « Vérifier ».** Le badge SAT/UNSAT et les listes de compatibilité se recalculent à chaque ajout/retrait, avec un léger debounce (10 ms, même toi t'es pas si rapide) pour ne pas bloquer l'affichage.
- **Anti-cache explicite sur le CSV et les fichiers statiques.** `input.csv` est chargé avec `cache: "no-store"` et un paramètre d'URL horodaté (contrairement au HTML/JS/CSS, il peut changer sans que le nom de fichier change) ; les scripts et la feuille de style portent un suffixe `?v=N` incrémenté à chaque changement, pour éviter qu'un ancien fichier mis en cache par le navigateur ne reste servi après une mise à jour.
- **Bloc « enseignements de remplacement » intégré au bloc principal, pas séparé.** Un switch bascule entre les deux, avec un fond légèrement grisé en mode remplacement pour indiquer clairement le contexte actif ; ça permet de tester des UV candidates (compatibilité avec la sélection principale) sans qu'elles comptent dans le total ECTS ni ne polluent la sélection réellement retenue. Une même UV ne peut évidemment pas être présente dans les deux listes à la fois.
- **Persistance locale (`localStorage`) limitée à la sélection principale.** La sélection « réelle » doit survivre à un rafraîchissement de page ; les essais de remplacement, eux, sont volontairement éphémères et non sauvegardés.
- **Recherche/ajout par autocomplétion plutôt que menu déroulant classique.** Plus rapide dès que la liste dépasse quelques dizaines d'UV (333 UV chargées dans la base actuelle), et navigable entièrement au clavier.

## Tests

Le dossier `tests/` contient une suite de tests unitaires et de non-régression, exécutable avec Node.js (aucune dépendance externe à installer, testeur intégré `node --test`, Node 18+).

```
npm test
# ou directement :
node --test
```

- **`harness.js`** — charge les fichiers sources réels (`model.js`, `parser.js`, `sat_model.js`, `search.js`, et `simulateur.js` via une variante) dans un bac à sable Node, exactement comme le navigateur via des balises `<script>`, sans dupliquer ni modifier une seule ligne du code de production.
- **`model.test.js`**, **`parser.test.js`**, **`sat_model.test.js`**, **`search.test.js`** — tests unitaires classiques sur chaque module (détection de chevauchement, construction de la base, clauses CNF, résolution DPLL sur des scénarios synthétiques...).
- **`simulateur.test.js`** — vérifie la cohérence du simulateur avec le solveur SAT principal sur un échantillon de combinaisons réelles, et verrouille un bug trouvé en cours de route (deux éléments "sans choix possible" — Cours imposé ou groupe réduit à une seule option — qui se contredisent entre eux sans jamais être comparés l'un à l'autre).
- **`input_py.test.js`** — vérifie que `input.csv` respecte bien les garanties apportées par `input.py` (colonnes attendues, activités exclues absentes, format des heures, valeurs de `Semaine`...).
- **`regression.test.js`** — tourne sur le vrai `input.csv` : vérifie qu'aucun groupe ne fusionne anormalement plusieurs séances sous un même libellé (voir plus haut) et qu'une combinaison de référence reste satisfiable.
- **`dom_stub.js`** — bac à sable DOM minimal (pas jsdom : réseau indisponible pour l'installer au moment où ça a été écrit, et ça évite une dépendance externe de plus) pour exécuter le script inline de `index.html` sous Node.
- **`index.test.js`** — teste ce qui vit uniquement dans `index.html` (les deux contrôleurs de sélection factorisés, le switch principal/remplacement, le badge SAT/UNSAT combiné, l'export, la persistance `localStorage`) : c'est le seul endroit du code qui n'était couvert par aucun test avant.
- **`csv_utils.js`** — mini-parseur CSV (gère les champs entre guillemets) utilisé uniquement par les tests, indépendant de PapaParse.

## Développement, pour nos GI 

### Lancer un serveur local pour tester

`fetch()` ne peut pas charger de fichier local en `file://` : il faut servir le dossier via un petit serveur HTTP. Depuis la racine du dépôt (celle qui contient `docs/`) :

```
python3 -m http.server 8000
http://localhost:8000/docs/index.html
```

Le fichier `input.csv` doit se trouver dans `docs/input/input.csv` (chemin relatif utilisé par `index.html` : `./input/input.csv`).

### Lancer les tests

Depuis `docs/` (où se trouvent `package.json` et `tests/`) :

```
npm test
```

Chaque modification de `input.csv` ou des fichiers `.js` devrait être suivie d'un `npm test` avant mise en ligne.

### To do

- [x] filtre par branche
- [x] UVs diplomantes ou non
- [x] simulateur d'emploi du temps
- [x] lien direct vers UVweb sur chaque UV sélectionnée
- [ ] voir les compétences (mais faut trouver la source de vérité)
- [ ] choper la DSI pour récup l'API des UVs
- [x] catalogue UV_automne.csv plus récent que 2021, pour réduire le nombre d'UV "sans catégorie"
