/**
 * csv_utils.js
 *
 * Mini-parseur CSV (gère les champs entre guillemets contenant des virgules,
 * comme "GB, GP, GU, IM, TC") pour les tests uniquement, sans dépendance
 * externe (PapaParse n'est chargé qu'au niveau du navigateur en prod).
 */
function parseCsv(texte) {
    const lignes = [];
    let ligne = [];
    let champ = "";
    let dansGuillemets = false;
    const t = texte.replace(/\r\n/g, "\n");
    for (let i = 0; i < t.length; i++) {
        const c = t[i];
        if (dansGuillemets) {
            if (c === '"') {
                if (t[i + 1] === '"') { champ += '"'; i++; }
                else dansGuillemets = false;
            } else {
                champ += c;
            }
        } else if (c === '"') {
            dansGuillemets = true;
        } else if (c === ",") {
            ligne.push(champ);
            champ = "";
        } else if (c === "\n") {
            ligne.push(champ);
            lignes.push(ligne);
            ligne = [];
            champ = "";
        } else {
            champ += c;
        }
    }
    if (champ !== "" || ligne.length > 0) {
        ligne.push(champ);
        lignes.push(ligne);
    }
    const entetes = lignes.shift();
    return lignes.filter(l => l.length > 1 || l[0] !== "").map(l => {
        const obj = {};
        entetes.forEach((h, i) => { obj[h] = l[i] !== undefined ? l[i] : ""; });
        return obj;
    });
}

module.exports = { parseCsv };
