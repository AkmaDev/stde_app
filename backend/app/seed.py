"""Peuple la base avec les 10 batiments de demo repris des mockups HTML existants
(01_vue_parc_carte.html a 04_comparateur_leviers.html) + les donnees reelles de
l'audit energetique de la bibliotheque Andree Chedid (docs 07/08). Ce sont des
donnees de reference/demo en attendant la collecte des jeux de donnees reels
avant/apres necessaires au moteur d'analyse (voir email Alice Bore du 24/07).
"""

from sqlmodel import Session, select

from app.database import engine, init_db
from app.models import Batiment, CoupleBatimentLevier, EtatCouple, Levier, OrigineDonnee

BATIMENTS = [
    dict(
        nom="Andrée Chedid", arrondissement="15e", statut_patrimonial="Aucune contrainte",
        annee_construction=1974, surface_m2=1240, energie_principale="Gaz",
        conso_mesuree_kwh_m2=184, conso_origine=OrigineDonnee.mesuree, dpe="C",
        orientation_vitrage_dominante="Sud-Ouest", type_isolation="Non isolée",
        couverture_donnees_pct=82, derniere_maj="12/03/2026",
    ),
    dict(
        nom="Buffon", arrondissement="5e", statut_patrimonial="Site classé (ABF — covisibilité)",
        annee_construction=1968, surface_m2=1980, energie_principale="Gaz",
        conso_mesuree_kwh_m2=241, conso_origine=OrigineDonnee.mesuree, dpe="E",
        orientation_vitrage_dominante="Ouest", type_isolation="Minimum",
        couverture_donnees_pct=55, derniere_maj="03/02/2026",
    ),
    dict(
        nom="Václav Havel", arrondissement="18e", statut_patrimonial="Aucune contrainte",
        annee_construction=2010, surface_m2=1730, energie_principale="CPCU",
        conso_mesuree_kwh_m2=141, conso_origine=OrigineDonnee.mesuree, dpe="B",
        orientation_vitrage_dominante="Nord", type_isolation="Optimale",
        couverture_donnees_pct=91, derniere_maj="20/01/2026",
    ),
    dict(
        nom="Marguerite Yourcenar", arrondissement="15e", statut_patrimonial="Aucune contrainte",
        annee_construction=2004, surface_m2=2240, energie_principale="CPCU",
        conso_mesuree_kwh_m2=152, conso_origine=OrigineDonnee.mesuree, dpe="B",
        orientation_vitrage_dominante="Sud", type_isolation="Optimale",
        couverture_donnees_pct=88, derniere_maj="14/02/2026",
    ),
    dict(
        nom="Couronnes", arrondissement="20e", statut_patrimonial="Aucune contrainte",
        annee_construction=1998, surface_m2=890, energie_principale="CPCU",
        conso_mesuree_kwh_m2=179, conso_origine=OrigineDonnee.mesuree, dpe="C",
        orientation_vitrage_dominante="Sud-Ouest", type_isolation="Partielle",
        couverture_donnees_pct=76, derniere_maj="05/03/2026",
    ),
    dict(
        nom="Saint-Éloi", arrondissement="12e", statut_patrimonial="Aucune contrainte",
        annee_construction=1971, surface_m2=1410, energie_principale="Gaz",
        conso_mesuree_kwh_m2=228, conso_origine=OrigineDonnee.mesuree, dpe="E",
        orientation_vitrage_dominante="Ouest", type_isolation="Minimum",
        couverture_donnees_pct=68, derniere_maj="27/01/2026",
    ),
    dict(
        nom="Oscar Wilde", arrondissement="20e", statut_patrimonial="Inscrit Monument Historique",
        annee_construction=1932, surface_m2=None, energie_principale=None,
        conso_mesuree_kwh_m2=None, conso_origine=OrigineDonnee.hypothese, dpe=None,
        orientation_vitrage_dominante=None, type_isolation=None,
        couverture_donnees_pct=22, derniere_maj="—",
    ),
    dict(
        nom="Assia Djebar", arrondissement="20e", statut_patrimonial="Aucune contrainte",
        annee_construction=2015, surface_m2=1050, energie_principale="CPCU",
        conso_mesuree_kwh_m2=130, conso_origine=OrigineDonnee.mesuree, dpe="B",
        orientation_vitrage_dominante="Nord", type_isolation="Optimale",
        couverture_donnees_pct=85, derniere_maj="18/02/2026",
    ),
    dict(
        nom="Hélène Berr", arrondissement="12e", statut_patrimonial="Aucune contrainte",
        annee_construction=1985, surface_m2=1620, energie_principale="Élec",
        conso_mesuree_kwh_m2=172, conso_origine=OrigineDonnee.mesuree, dpe="D",
        orientation_vitrage_dominante="Sud-Ouest", type_isolation="Partielle",
        couverture_donnees_pct=79, derniere_maj="09/03/2026",
    ),
    dict(
        nom="Robert Sabatier", arrondissement="18e", statut_patrimonial="Classé Monument Historique",
        annee_construction=1890, surface_m2=None, energie_principale=None,
        conso_mesuree_kwh_m2=None, conso_origine=OrigineDonnee.hypothese, dpe=None,
        orientation_vitrage_dominante=None, type_isolation=None,
        couverture_donnees_pct=18, derniere_maj="—",
    ),
]

LEVIERS = [
    dict(nom="Installation GTB", poste_concerne="chauffage, ventilation, auxiliaires",
         gain_min_pct=5, gain_max_pct=15,
         source="ADEME — retours d'opérations tertiaire public"),
    dict(nom="Protection solaire", poste_concerne="climatisation/confort été, chauffage",
         gain_min_pct=5, gain_max_pct=10,
         source="ADEME — retours d'opérations tertiaire public"),
    dict(nom="Relamping LED", poste_concerne="éclairage",
         gain_min_pct=40, gain_max_pct=60,
         source="ADEME — retours d'opérations tertiaire public"),
    dict(nom="Isolation façade", poste_concerne="chauffage",
         gain_min_pct=10, gain_max_pct=20,
         source="ADEME — retours d'opérations tertiaire public"),
    dict(nom="Ventilation double flux", poste_concerne="chauffage, ventilation",
         gain_min_pct=10, gain_max_pct=20,
         source="ADEME — retours d'opérations tertiaire public"),
    dict(nom="Changement générateur", poste_concerne="chauffage",
         gain_min_pct=15, gain_max_pct=30,
         source="ADEME — retours d'opérations tertiaire public"),
]

# Couples bâtiment × levier GTB, repris tels quels du mockup 04_comparateur_leviers.html
COUPLES_GTB = [
    ("Buffon", EtatCouple.applicable, 9, None),
    ("Saint-Éloi", EtatCouple.applicable, 8, None),
    ("Andrée Chedid", EtatCouple.applicable, 8, None),
    ("Couronnes", EtatCouple.applicable, 6, None),
    ("Hélène Berr", EtatCouple.applicable, 7, None),
    ("Marguerite Yourcenar", EtatCouple.deja_realise, None, None),
    ("Assia Djebar", EtatCouple.deja_realise, None, None),
    ("Václav Havel", EtatCouple.non_applicable, None, "GTB mutualisée"),
    ("Oscar Wilde", EtatCouple.donnees_insuffisantes, None, None),
    ("Robert Sabatier", EtatCouple.donnees_insuffisantes, None, None),
]

# Couple bâtiment x levier "Protection solaire", reprise du detail Chedid (mockup 01/03)
COUPLES_PROTECTION_SOLAIRE = [
    ("Andrée Chedid", EtatCouple.applicable, 7, None),
]


def _heuristique_etat(nom_batiment: str, statut_patrimonial: str, couverture: float | None) -> EtatCouple:
    """Genere un etat plausible pour les couples non repris directement des mockups.
    Heuristique de demo simple, a remplacer par le vrai moteur d'analyse une fois
    les jeux de donnees reels disponibles.
    """
    if couverture is None or couverture < 30:
        return EtatCouple.donnees_insuffisantes
    if "classé" in statut_patrimonial.lower() or "classe" in statut_patrimonial.lower():
        return EtatCouple.non_applicable
    return EtatCouple.applicable


def seed() -> None:
    init_db()
    with Session(engine) as session:
        if session.exec(select(Batiment)).first():
            return  # deja peuplee

        batiments_by_nom: dict[str, Batiment] = {}
        for data in BATIMENTS:
            batiment = Batiment(**data)
            session.add(batiment)
            batiments_by_nom[batiment.nom] = batiment
        session.commit()
        for batiment in batiments_by_nom.values():
            session.refresh(batiment)

        leviers_by_nom: dict[str, Levier] = {}
        for data in LEVIERS:
            levier = Levier(**data)
            session.add(levier)
            leviers_by_nom[levier.nom] = levier
        session.commit()
        for levier in leviers_by_nom.values():
            session.refresh(levier)

        gtb = leviers_by_nom["Installation GTB"]
        for nom, etat, gain, commentaire in COUPLES_GTB:
            session.add(CoupleBatimentLevier(
                batiment_id=batiments_by_nom[nom].id, levier_id=gtb.id,
                etat=etat, gain_indicatif_pct=gain, commentaire=commentaire,
            ))

        protection_solaire = leviers_by_nom["Protection solaire"]
        for nom, etat, gain, commentaire in COUPLES_PROTECTION_SOLAIRE:
            session.add(CoupleBatimentLevier(
                batiment_id=batiments_by_nom[nom].id, levier_id=protection_solaire.id,
                etat=etat, gain_indicatif_pct=gain, commentaire=commentaire,
            ))

        # Couples restants generes par heuristique de demo, pour que chaque levier
        # du comparateur affiche un tableau complet des 10 batiments.
        dejacouvert = {(gtb.id, batiments_by_nom[n].id) for n, *_ in COUPLES_GTB}
        dejacouvert |= {(protection_solaire.id, batiments_by_nom[n].id) for n, *_ in COUPLES_PROTECTION_SOLAIRE}
        for levier in leviers_by_nom.values():
            for data in BATIMENTS:
                batiment = batiments_by_nom[data["nom"]]
                if (levier.id, batiment.id) in dejacouvert:
                    continue
                etat = _heuristique_etat(batiment.nom, batiment.statut_patrimonial, batiment.couverture_donnees_pct)
                gain = None
                if etat == EtatCouple.applicable:
                    gain = round((levier.gain_min_pct + levier.gain_max_pct) / 2, 1)
                session.add(CoupleBatimentLevier(
                    batiment_id=batiment.id, levier_id=levier.id, etat=etat, gain_indicatif_pct=gain,
                ))

        session.commit()


if __name__ == "__main__":
    seed()
    print("Base de demo peuplee.")
