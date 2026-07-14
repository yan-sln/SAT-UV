/**
 * model.js
 *
 * Structures de données représentant la base de faits :
 * - Creneau      : un horaire précis (jour, heures, semaine)
 * - Groupe       : un choix possible pour une activité (TD1, TP2, Atelier1, ...)
 * - Enseignement : un code d'enseignement, avec ses Cours (imposés) et ses
 *                  groupes de TD / TP / Atelier (à choisir)
 *
 * Port direct de model.py, mêmes règles de conflit.
 */

// Une activité "vide" de semaine est considérée comme présente toutes les
// semaines (cf. document de conception, "Notion de conflit").
function semainesCompatibles(semaine1, semaine2) {
    if (semaine1 === "" || semaine2 === "" || semaine1 === semaine2) {
        return true;
    }
    return false; // cas restant : "A" vs "B"
}

class Creneau {
    constructor(jour, debut, fin, semaine) {
        this.jour = jour;
        this.debut = debut;   // minutes depuis minuit
        this.fin = fin;       // minutes depuis minuit
        this.semaine = semaine; // "", "A" ou "B"
    }

    /**
     * Deux créneaux sont en conflit si même jour, semaines compatibles,
     * et intervalles horaires qui se chevauchent.
     */
    chevauche(autre) {
        if (this.jour !== autre.jour) return false;
        if (!semainesCompatibles(this.semaine, autre.semaine)) return false;
        return this.debut < autre.fin && autre.debut < this.fin;
    }
}

class Groupe {
    constructor(code, activite, lib) {
        this.code = code;
        this.activite = activite; // "TD", "TP" ou "Atelier"
        this.lib = lib;           // identifiant du groupe (Lib. créneau), peut être ""
        this.creneaux = [];       // Creneau[]
    }

    /** Clé unique identifiant ce groupe dans toute la base. */
    get cle() {
        return `${this.code}\u0000${this.activite}\u0000${this.lib}`;
    }
}

class Enseignement {
    constructor(code, cours = [], groupes = {}) {
        this.code = code;
        this.cours = cours;     // Creneau[], imposés
        this.groupes = groupes; // { activite: Groupe[] }
    }

    /**
     * Renvoie les activités (TD/TP/Atelier) présentes pour cet
     * enseignement, chacune associée à sa liste de groupes possibles.
     * Équivalent de dict.items() en Python.
     */
    activitesAChoix() {
        return Object.entries(this.groupes);
    }
}
