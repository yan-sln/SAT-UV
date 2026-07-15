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
    constructor(code, cours = [], groupes = {}, categorie = "", ects = null, branches = [], diplomante = null) {
        this.code = code;
        this.cours = cours; // Creneau[] imposés
        this.groupes = groupes; // { activite: Groupe[] }
        this.categorie = categorie; // ex: "Coeur", "Ouverture", ...
        this.ects = ects; // nombre de crédits ECTS (number ou null si inconnu)
        this.branches = branches || []; // string[] : branches concernées (ex. ["TC"], ["GB", "GU"], ...)
        // diplomante : null (inconnu), booléen (vrai pour toutes les branches),
        // ou objet { brancheEnMinuscules: booléen } quand le statut diffère selon la branche.
        this.diplomante = diplomante === undefined ? null : diplomante;
    }
    activitesAChoix() {
        return Object.entries(this.groupes);
    }
    // true/false si l'UV concerne la branche donnée (comparaison insensible à la casse).
    // Si branche est vide/null, retourne true si l'UV a au moins une branche définie.
    aBranche(branche) {
        const liste = this.branches || [];
        if (!branche) return liste.length > 0;
        const cle = branche.toLowerCase();
        return liste.some(b => b.toLowerCase() === cle);
    }
    // Statut "diplomante" pour une branche donnée (ou global si branche vide/null).
    // Retourne true, false, ou null si inconnu/non applicable.
    diplomantePour(branche = null) {
        if (this.diplomante === null || this.diplomante === undefined) return null;
        if (typeof this.diplomante === "boolean") return this.diplomante;
        // objet par branche
        if (branche) {
            const cle = branche.toLowerCase();
            return Object.prototype.hasOwnProperty.call(this.diplomante, cle) ? this.diplomante[cle] : null;
        }
        // aucune branche précisée : diplomante si au moins une branche l'est,
        // non diplomante seulement si aucune branche ne l'est.
        const valeurs = Object.values(this.diplomante);
        if (valeurs.some(v => v === true)) return true;
        if (valeurs.length > 0 && valeurs.every(v => v === false)) return false;
        return null;
    }
}
