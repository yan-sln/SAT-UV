"""
model.py

Structures de données représentant la base de faits :
- Creneau     : un horaire précis (jour, heures, semaine)
- Groupe      : un choix possible pour une activité (TD1, TP2, Atelier1, ...)
- Enseignement: un code d'enseignement, avec ses Cours (imposés) et ses
                groupes de TD / TP / Atelier (à choisir)
"""

from dataclasses import dataclass, field


# Une activité "vide" de semaine est considérée comme présente toutes les
# semaines (cf. document de conception, "Notion de conflit").
def semaines_compatibles(semaine1: str, semaine2: str) -> bool:
    if semaine1 == "" or semaine2 == "" or semaine1 == semaine2:
        return True
    return False  # cas restant : "A" vs "B"


@dataclass(frozen=True)
class Creneau:
    jour: str
    debut: int  # minutes depuis minuit
    fin: int    # minutes depuis minuit
    semaine: str  # "", "A" ou "B"

    def chevauche(self, autre: "Creneau") -> bool:
        """Deux créneaux sont en conflit si même jour, semaines compatibles,
        et intervalles horaires qui se chevauchent."""
        if self.jour != autre.jour:
            return False
        if not semaines_compatibles(self.semaine, autre.semaine):
            return False
        return self.debut < autre.fin and autre.debut < self.fin


@dataclass
class Groupe:
    code: str
    activite: str  # "TD", "TP" ou "Atelier"
    lib: str       # identifiant du groupe (Lib. créneau), peut être ""
    creneaux: list = field(default_factory=list)  # list[Creneau]

    @property
    def cle(self):
        """Clé unique identifiant ce groupe dans toute la base."""
        return (self.code, self.activite, self.lib)


@dataclass
class Enseignement:
    code: str
    cours: list = field(default_factory=list)          # list[Creneau], imposés
    groupes: dict = field(default_factory=dict)         # activite -> list[Groupe]

    def activites_a_choix(self):
        """Renvoie les activités (TD/TP/Atelier) présentes pour cet
        enseignement, chacune associée à sa liste de groupes possibles."""
        return self.groupes.items()
