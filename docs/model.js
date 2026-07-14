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

function semainesCompatibles(semaine1, semaine2) {
    if (semaine1 === "" || semaine2 === "" || semaine1 === semaine2) {
        return true;
    }
    return false; // "A" vs "B"
}

class Creneau {
    constructor(jour, debut, fin, semaine) {
        this.jour = jour;
        this.debut = debut; // minutes depuis minuit
        this.fin = fin; // minutes depuis minuit
        this.semaine = semaine; // "", "A" ou "B"
    }
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
        this.lib = lib; // identifiant du groupe (Lib. créneau), peut être ""
        this.creneaux = [];
    }
    get cle() {
        return `${this.code}\u0000${this.activite}\u0000${this.lib}`;
    }
}

class Enseignement {
    constructor(code, cours = [], groupes = {}) {
        this.code = code;
        this.cours = cours; // Creneau[] imposés
        this.groupes = groupes; // { activite: Groupe[] }
    }
    activitesAChoix() {
        return Object.entries(this.groupes);
    }
}
