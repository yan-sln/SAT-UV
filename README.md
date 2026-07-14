# SAT-UV

23h09, la France a perdu contre l'Espagne. En ces temps très durs, on vous propose avec @DamDeCaro, un outil de vérification de compatibilité d'emploi du temps pour le choix des UVs à l'UTC. En gros c'est IA02 appliqué à un fléau de l'UTC : le calcul de satisfiabilité est fait 100 % côté navigateur, via un mini-solveur SAT écrit en JavaScript.

**Direct à l'outil : [https://yan-sln.github.io/SAT-UV/](https://yan-sln.github.io/SAT-UV/)**

## Sommaire

- [Construction de UV_automne.csv](#construction-de-uv_automnecsv-nom-pas-ouf-mais-comme-le-match)
- [Construction de input.csv](#construction-de-inputcsv)
- [Utilisation](#utilisation)
- [Base de faits](#base-de-faits-ia02)
- [Modèle SAT](#modèle-sat)
- [Choix de conception](#choix-de-conception)
- [Développement](#développement-pour-nos-gi)

## Construction de UV_automne.csv (nom pas ouf, mais comme le match)

Récupération de la liste des UVs disponibles à l'automne sur le catalogue des UV de 2021 disponible sur l'ENT UTC (ouep, on a que ça).

    https://www.utc.fr/sdm_downloads/catalogue-des-unites-de-valeur-uv/

Classement dans un tableur en fonction de leur type (CS, TM ou TSH), avec pour chacune les ECTS correspondants et à leur descriptif (tableau p.5 à 37).

**Limite connue : un catalogue daté de 2021.** C'est la source la plus complète trouvée sur l'ENT, mais elle a plusieurs années d'écart avec l'offre actuelle. Certaines UV du semestre courant n'y figurent donc pas (créées depuis, renommées, ou retirées puis réintroduites), et leur catégorie/ECTS ne peut pas être retrouvée automatiquement. C'est la raison principale du grand nombre d'UVs "sans catégorie" dans l'outil : environ la moitié des 333 UV chargées n'ont pas pu être rattachées à un type (CS/TM/TSH) faute d'une source à jour. Une mise à jour manuelle au cas par cas (ou un catalogue plus récent) réduirait ce nombre... mais là on compte sur vous !

## Construction de input.csv

Récupération de l'emploi du temps provisoire pour A26 sur l'ENT UTC

    https://ngapplis.utc.fr/ent4/

et le document pdf "Creneaux-UV-A26-prov-V2.pdf"

Contient l'ensemble des UV enseignées en A26 avec les créneaux (semaine, jour et heure) de chaque "Activité" (Cours, TD, TP, Atelier), puis traitement via `input/input.py`.

## Utilisation

1. **Chargement automatique** de `input.csv` au démarrage de la page (nombre d'UVs chargées et UVs exclues affichés en haut).
2. **Ajouter des UV** : filtrer par catégorie (CS / TM / TSH / sans catégorie), taper un code dans le champ d'autocomplétion, valider avec "Entrée" ou un clic sur une suggestion.
3. Chaque UV ajoutée apparaît sous forme de bloc ("chip") dans le tableau à 3 colonnes CS / TM / TSH ; une croix permet de la retirer.
4. Le badge **SAT / UNSAT** et le compteur **ECTS** sous le tableau se mettent à jour automatiquement à chaque ajout/retrait.
5. Le bloc **« Sélectionner des enseignements de remplacement »** permet de tester si une UV candidate resterait compatible avec la sélection principale, sans l'ajouter au décompte ECTS.
6. Les listes **UV encore compatibles / incompatibles** avec la sélection principale se recalculent en direct.
7. La sélection principale peut être **copiée**, **téléchargée** (`.txt`) ou **vidée** (« Tout supprimer ») ; elle est aussi conservée automatiquement dans le navigateur (`localStorage`) d'une visite à l'autre.

## Base de faits (#IA02)

La base de faits est construite par `parser.js` à partir des lignes de `input.csv` (regroupées par `Code enseig.`, comme `csv.DictReader` en Python), puis représentée avec les structures de `model.js` :

- **`Creneau`** : un horaire précis (`jour`, `debut`, `fin` en minutes depuis minuit, `semaine` : `""`, `"A"` ou `"B"`). Sa méthode `chevauche()` teste le recouvrement horaire et la compatibilité de semaine (deux créneaux sur des semaines `A`/`B` différentes ne se chevauchent jamais).
- **`Groupe`** : un choix possible pour une activité à choix (ex. `TD1`, `TP2`, `Atelier3`). Un groupe peut être réparti sur **plusieurs créneaux** (ex. un TD qui a lieu le lundi ET le mardi certaines semaines) : toutes les lignes CSV correspondant au même `(Code, Activité, Lib. créneau)` sont agrégées dans le même `Groupe`.
- **`Enseignement`** : un code d'UV, avec ses `cours` (créneaux **imposés**, `Activité = "Cours"`), ses `groupes` (`{ "TD": [...], "TP": [...], "Atelier": [...] }`, les activités **à choisir**), sa `categorie` (colonne `Type UV` : `CS`, `TM`, `TSH` ou vide) et ses `ects`.

Particularité gérée par `parser.js` : certains enseignements ont un Cours réparti sur **plusieurs** `Lib. créneau` distincts (deux horaires de cours différents pour le même code). **Ce cas n'est pas modélisé** : ces enseignements sont exclus de la base chargée, et la liste des codes exclus est affichée à l'utilisateur (genre MT02, MT03, IS00, MTX2, etc.).

## Modèle SAT

`sat_model.js` transforme un ensemble de codes d'UV sélectionnés en un problème SAT sous forme normale conjonctive (CNF), résolu par un DPLL écrit à la main.

**Variables.** Une variable booléenne par `Groupe` (TD/TP/Atelier) présent dans les UV sélectionnées : vraie si ce groupe est choisi pour composer l'emploi du temps.

**Clauses :**

1. *Exactement un groupe par activité à choix* - pour chaque UV et chaque activité (TD, TP, Atelier) : une clause « au moins un » des groupes (disjonction), et une clause « au plus un » pour chaque paire de groupes (`¬v1 ∨ ¬v2`).
2. *Conflit Cours ↔ Cours* - vérifié **en amont**, avant même de construire le SAT : les Cours sont des créneaux imposés (pas de variable), donc si deux Cours sélectionnés se chevauchent, l'ensemble est directement déclaré insatisfiable avec un message explicite (aucun groupe ne pourrait résoudre ce conflit).
3. *Conflit Cours ↔ Groupe* - clause unitaire interdisant un groupe (`¬v`) si l'un de ses créneaux chevauche un Cours imposé de la sélection.
4. *Conflit Groupe ↔ Groupe* - clause interdisant la paire (`¬v1 ∨ ¬v2`) si deux groupes ont des créneaux qui se chevauchent.

**Résolution.** Un DPLL classique (`dpll` / `propagerUnitaires` / `simplifier`) : propagation unitaire puis branchement sur la première variable restante, jusqu'à trouver une affectation satisfaisante ou épuiser les possibilités. `null` signifie UNSAT.

`search.js` orchestre l'ensemble pour l'UI : `testeEnsemble()` construit et résout le problème pour une sélection donnée, `calculerCompatibilites()` teste, pour chaque UV restante, si elle reste satisfiable en l'ajoutant à la sélection courante (une résolution SAT complète par UV testée).

## Choix de conception

- **100 % côté navigateur, pas de backend.** Hébergement gratuit sur GitHub Pages, aucune donnée d'emploi du temps envoyée à un serveur, déploiement simple (un dépôt Git suffit) = utilisable direct par vous.
- **DPLL écrit à la main plutôt qu'une librairie SAT externe.** Le problème reste petit (quelques dizaines de variables par recherche), inutile d'ajouter une dépendance ; le code reste simple à lire, auditer et déboguer (ouais c'est faux, mais personne va lire).
- **Enseignements « à groupes multiples » exclus plutôt que mal modélisés.** Ce cas est rare et compliquerait le modèle (plusieurs Cours distincts pour la même UV) ; il a semblé préférable de prévenir clairement l'utilisateur plutôt que de risquer un résultat SAT/UNSAT erroné : de toute façon MT02 c'est quasi du TC01, donc trop tard pour cet outil.
- **Découpage modulaire** (`model.js` / `parser.js` / `sat_model.js` / `search.js` / `index.html`) : séparation claire entre structures de données, construction de la base de faits, solveur, et interface, pour faciliter la relecture et l'évolution du code.
- **Catégorie lue directement depuis la colonne `Type UV`** de `input.csv` (répétée sur toutes les lignes d'un même code, comme `Code enseig.`). Les UV sans catégorie renseignée sont provisoirement rattachées à la colonne **TSH**, avec la mention « sans catégorie » sur leur chip, faute de catalogue à jour (voir plus haut).
- **Vérification automatique, sans bouton « Vérifier ».** Le badge SAT/UNSAT et les listes de compatibilité se recalculent à chaque ajout/retrait, avec un léger debounce (10 ms, même toi t'es pas si rapide) pour ne pas bloquer l'affichage.
- **Bloc « enseignements de remplacement » séparé du bloc principal.** Il permet de tester des UV candidates (compatibilité avec la sélection principale) sans qu'elles comptent dans le total ECTS ni ne polluent la sélection réellement retenue ; évidemment, une même UV ne peut pas être présente dans les deux blocs à la fois.
- **Persistance locale (`localStorage`) limitée à la sélection principale.** La sélection « réelle » doit survivre à un rafraîchissement de page ; les essais de remplacement, eux, sont volontairement éphémères et non sauvegardés.
- **Recherche/ajout par autocomplétion plutôt que menu déroulant classique.** Plus rapide dès que la liste dépasse quelques dizaines d'UV (333 UV chargées dans la base actuelle), et navigable entièrement au clavier.

## Développement, pour nos GI 

### Lancer un serveur local pour tester

`fetch()` ne peut pas charger de fichier local en `file://` : il faut servir le dossier via un petit serveur HTTP. Depuis la racine du dépôt (celle qui contient `docs/`) :

```
python3 -m http.server 8000
http://localhost:8000/docs/index.html
```

### To do

- [ ] filtre par branche
- [ ] coupler avec UVweb
- [ ] voir les compétences (mais faut trouver la source de vérité)
- [ ] UVs diplomantes ou non
- [ ] choper la DSI pour récup l'API des UVs
Le fichier `input.csv` doit se trouver dans `docs/input/input.csv` (chemin relatif utilisé par `index.html` : `./input/input.csv`).

